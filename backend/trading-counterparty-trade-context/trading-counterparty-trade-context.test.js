"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { once } = require("node:events");
const { spawn } = require("node:child_process");
const { DatabaseSync } = require("node:sqlite");

const ROOT = path.resolve(__dirname, "..", "..");
const SERVER_PATH = path.join(ROOT, "server.js");
const SCHEMA_PATH = path.join(ROOT, "schema.sql");
const SEED_PATH = path.join(ROOT, "seed.sql");
const ASSIGNMENT_INTEGRITY_TRIGGER_NAMES = [
  "trg_pricing_rules_require_attached_trade_context_insert",
  "trg_pricing_rules_require_attached_trade_context_update",
  "trg_trading_counterparty_trade_contexts_immutable_update",
  "trg_trading_counterparty_trade_contexts_preserve_pricing_rules_delete"
];

function removeDatabaseFiles(databasePath) {
  [databasePath, `${databasePath}-wal`, `${databasePath}-shm`].forEach(filePath => {
    fs.rmSync(filePath, { force: true });
  });
}

async function reserveRandomPort() {
  const reservation = net.createServer();
  reservation.listen(0, "127.0.0.1");
  await once(reservation, "listening");
  const address = reservation.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise((resolve, reject) => {
    reservation.close(error => error ? reject(error) : resolve());
  });
  assert.ok(Number.isInteger(port) && port > 0);
  return port;
}

function prepareLegacyAssignmentDatabase(databasePath) {
  const database = new DatabaseSync(databasePath);
  database.exec("PRAGMA foreign_keys = ON");
  database.exec(fs.readFileSync(SCHEMA_PATH, "utf8"));
  database.exec(fs.readFileSync(SEED_PATH, "utf8"));

  const ruleAssignments = database.prepare(`
    SELECT DISTINCT counterparty_id, trade_context_id
    FROM pricing_rules
    ORDER BY counterparty_id, trade_context_id
  `).all().map(row => ({ ...row }));
  const standaloneAssignment = database.prepare(`
    SELECT
      counterparty.counterparty_id,
      context.trade_context_id,
      context.servicing_location_id,
      COALESCE(context.accounting_system_id, 'NOT_APPLICABLE') AS accounting_system_id,
      context.originating_system_id
    FROM trading_counterparties counterparty
    CROSS JOIN trade_contexts context
    WHERE NOT EXISTS
    (
      SELECT 1
      FROM pricing_rules rule
      WHERE rule.counterparty_id = counterparty.counterparty_id
        AND rule.trade_context_id = context.trade_context_id
    )
    ORDER BY counterparty.counterparty_id, context.trade_context_id
    LIMIT 1
  `).get();

  assert.ok(standaloneAssignment);
  database.exec("PRAGMA foreign_keys = OFF");
  database.exec(`
    DROP TRIGGER IF EXISTS trg_external_counterparties_exclusive_profile_insert;
    DROP TRIGGER IF EXISTS trg_external_counterparties_exclusive_profile_update;
    DROP TRIGGER IF EXISTS trg_internal_units_exclusive_profile_insert;
    DROP TRIGGER IF EXISTS trg_internal_units_exclusive_profile_update;
    DROP TRIGGER IF EXISTS trg_trading_counterparties_immutable_scope;
    DROP TRIGGER IF EXISTS trg_external_counterparties_preserve_profile;
    DROP TRIGGER IF EXISTS trg_internal_units_preserve_profile;

    CREATE TABLE trading_counterparties_without_scope
    (
      counterparty_id INTEGER PRIMARY KEY,
      counterparty_name TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1
    );

    INSERT INTO trading_counterparties_without_scope
      (counterparty_id, counterparty_name, is_active)
    SELECT counterparty_id, counterparty_name, is_active
    FROM trading_counterparties;

    DROP TABLE trading_counterparties;
    ALTER TABLE trading_counterparties_without_scope RENAME TO trading_counterparties;

    DROP TABLE trading_counterparty_trade_contexts;

    CREATE TABLE trading_counterparty_trade_contexts
    (
      party_id INTEGER NOT NULL,
      trade_context_id INTEGER NOT NULL
    );
  `);
  database.prepare(`
    INSERT INTO trading_counterparty_trade_contexts
      (party_id, trade_context_id)
    VALUES (?, ?)
  `).run(
    standaloneAssignment.counterparty_id,
    standaloneAssignment.trade_context_id
  );
  database.close();

  return { ruleAssignments, standaloneAssignment };
}

function prepareWeakCanonicalAssignmentDatabase(databasePath) {
  const database = new DatabaseSync(databasePath);
  database.exec("PRAGMA foreign_keys = ON");
  database.exec(fs.readFileSync(SCHEMA_PATH, "utf8"));
  database.exec(fs.readFileSync(SEED_PATH, "utf8"));
  database.exec("PRAGMA foreign_keys = OFF");
  database.exec(`
    DROP TABLE trading_counterparty_trade_contexts;

    CREATE TABLE trading_counterparty_trade_contexts
    (
      counterparty_id INTEGER NOT NULL,
      trade_context_id INTEGER NOT NULL
    );

    INSERT INTO trading_counterparty_trade_contexts
      (counterparty_id, trade_context_id)
    SELECT DISTINCT counterparty_id, trade_context_id
    FROM pricing_rules;
  `);
  database.close();
}

function preparePartialDatabaseWithoutPricingConfiguration(databasePath) {
  const database = new DatabaseSync(databasePath);
  const seedSql = fs.readFileSync(SEED_PATH, "utf8");
  const assignmentSeedMarker = "WITH counterparty_trade_context_seed";
  const assignmentSeedPosition = seedSql.indexOf(assignmentSeedMarker);
  assert.ok(assignmentSeedPosition > 0);

  database.exec("PRAGMA foreign_keys = ON");
  database.exec(fs.readFileSync(SCHEMA_PATH, "utf8"));
  database.exec(seedSql.slice(0, assignmentSeedPosition));
  database.exec("COMMIT");
  assert.ok(database.prepare("SELECT COUNT(*) AS count FROM external_counterparties").get().count > 0);
  assert.ok(database.prepare("SELECT COUNT(*) AS count FROM trade_contexts").get().count > 0);
  assert.ok(database.prepare("SELECT COUNT(*) AS count FROM ccy_pair_options").get().count > 0);
  database.exec("PRAGMA foreign_keys = OFF");
  database.exec(`
    DROP TRIGGER IF EXISTS trg_pricing_rules_require_attached_trade_context_insert;
    DROP TRIGGER IF EXISTS trg_pricing_rules_require_attached_trade_context_update;
    DROP TRIGGER IF EXISTS trg_trading_counterparty_trade_contexts_preserve_pricing_rules_delete;
    DROP TRIGGER IF EXISTS trg_trading_counterparty_trade_contexts_immutable_update;
    DROP TABLE trading_counterparty_trade_contexts;
    DROP TABLE pricing_rules;
  `);
  database.close();
}

function assignmentIntegrityTriggerNames(database) {
  const placeholders = ASSIGNMENT_INTEGRITY_TRIGGER_NAMES.map(() => "?").join(", ");

  return database.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'trigger' AND name IN (${placeholders})
    ORDER BY name
  `).all(...ASSIGNMENT_INTEGRITY_TRIGGER_NAMES).map(trigger => trigger.name);
}

async function startDemoServer(databasePath) {
  const port = await reserveRandomPort();
  const child = spawn(process.execPath, [SERVER_PATH], {
    cwd: ROOT,
    env: {
      ...process.env,
      DEMO_DATABASE_PATH: databasePath,
      DEMO_PORT: String(port)
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let output = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", chunk => { output += chunk; });
  child.stderr.on("data", chunk => { output += chunk; });
  const baseUrl = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 10_000;

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Demo server exited before startup.\n${output}`);
    }

    try {
      const response = await fetch(`${baseUrl}/api/health`);

      if (response.ok) {
        return { child, baseUrl, output: () => output };
      }
    } catch {}

    await new Promise(resolve => setTimeout(resolve, 50));
  }

  child.kill("SIGTERM");
  throw new Error(`Demo server did not start in time.\n${output}`);
}

async function stopDemoServer(child) {
  if (!child || child.exitCode !== null) {
    return;
  }

  const gracefulExit = once(child, "exit");
  child.kill("SIGTERM");
  await Promise.race([
    gracefulExit,
    new Promise(resolve => setTimeout(resolve, 5_000))
  ]);

  if (child.exitCode === null) {
    const forcedExit = once(child, "exit");
    child.kill("SIGKILL");
    await Promise.race([
      forcedExit,
      new Promise(resolve => setTimeout(resolve, 2_000))
    ]);
  }
}

async function apiRequest(baseUrl, method, pathname, body) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();

  return {
    status: response.status,
    body: text ? JSON.parse(text) : null
  };
}

function assignmentKeys(assignments) {
  return assignments
    .map(assignment => `${assignment.counterparty_id}:${assignment.trade_context_id}`)
    .sort();
}

function contextIds(contexts) {
  return contexts.map(context => context.tradeContextId).sort((left, right) => left - right);
}

test("trading counterparties own explicit Trade Context assignments", async t => {
  const temporaryDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "position-counterparty-contexts-")
  );
  const databasePath = path.join(temporaryDirectory, "feature.sqlite");
  const legacy = prepareLegacyAssignmentDatabase(databasePath);
  const demoServer = await startDemoServer(databasePath);

  t.after(async () => {
    await stopDemoServer(demoServer.child);
    removeDatabaseFiles(databasePath);
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  });

  await t.test("migration preserves explicit rows and backfills Pricing Rule assignments", async () => {
    const counterparties = await apiRequest(
      demoServer.baseUrl,
      "GET",
      "/api/database/tables/trading_counterparties"
    );
    assert.equal(counterparties.status, 200);
    assert.deepEqual(
      counterparties.body.columns.map(column => column.name),
      ["counterparty_id", "counterparty_scope", "counterparty_name", "is_active"]
    );
    assert.ok(counterparties.body.rows.every(counterparty =>
      counterparty.counterparty_scope === "EXTERNAL"
        || counterparty.counterparty_scope === "INTERNAL"
    ));

    const table = await apiRequest(
      demoServer.baseUrl,
      "GET",
      "/api/database/tables/trading_counterparty_trade_contexts"
    );
    assert.equal(table.status, 200);
    assert.deepEqual(
      table.body.columns.map(column => column.name),
      ["counterparty_id", "trade_context_id"]
    );
    assert.deepEqual(
      table.body.columns.map(column => column.primaryKey),
      [true, true]
    );
    assert.match(table.body.createSql, /PRIMARY KEY\s*\(counterparty_id, trade_context_id\)/i);
    assert.equal(table.body.foreignKeys.length, 2);
    assert.ok(table.body.foreignKeys.some(foreignKey =>
      foreignKey.referencedTable === "trading_counterparties"
      && foreignKey.onUpdate === "RESTRICT"
      && foreignKey.onDelete === "CASCADE"
    ));
    assert.ok(table.body.foreignKeys.some(foreignKey =>
      foreignKey.referencedTable === "trade_contexts"
      && foreignKey.onUpdate === "RESTRICT"
      && foreignKey.onDelete === "RESTRICT"
    ));

    const expectedKeys = new Set([
      ...assignmentKeys(legacy.ruleAssignments),
      `${legacy.standaloneAssignment.counterparty_id}:${legacy.standaloneAssignment.trade_context_id}`
    ]);
    assert.equal(table.body.rowCount, expectedKeys.size);
    assert.deepEqual(assignmentKeys(table.body.rows), [...expectedKeys].sort());

    const assignedContexts = await apiRequest(
      demoServer.baseUrl,
      "GET",
      `/api/v1/trading-counterparties/${legacy.standaloneAssignment.counterparty_id}/trade-contexts`
    );
    assert.equal(assignedContexts.status, 200);
    assert.ok(assignedContexts.body.some(context =>
      context.tradeContextId === legacy.standaloneAssignment.trade_context_id
      && context.servicingLocationId === legacy.standaloneAssignment.servicing_location_id
      && context.accountingSystemId === legacy.standaloneAssignment.accounting_system_id
      && context.originatingSystemId === legacy.standaloneAssignment.originating_system_id
      && context.pricingRulesCount === 0
    ));

    const globalContexts = await apiRequest(
      demoServer.baseUrl,
      "GET",
      "/api/v1/trade-contexts"
    );
    assert.equal(globalContexts.status, 200);
    assert.ok(globalContexts.body.every(context =>
      Number.isInteger(context.assignedCounterpartyCount)
      && context.assignedCounterpartyCount >= 0
    ));
    assert.equal(
      globalContexts.body.reduce(
        (total, context) => total + context.assignedCounterpartyCount,
        0
      ),
      expectedKeys.size
    );

    const standaloneContext = globalContexts.body.find(context =>
      context.tradeContextId === legacy.standaloneAssignment.trade_context_id
    );
    const reverseLookup = await apiRequest(
      demoServer.baseUrl,
      "GET",
      `/api/v1/trade-contexts/${standaloneContext.tradeContextId}/trading-counterparties`
    );
    assert.equal(reverseLookup.status, 200);
    assert.equal(reverseLookup.body.length, standaloneContext.assignedCounterpartyCount);
    assert.equal(
      new Set(reverseLookup.body.map(counterparty => counterparty.counterpartyId)).size,
      reverseLookup.body.length
    );
    assert.ok(reverseLookup.body.some(counterparty =>
      counterparty.counterpartyId === legacy.standaloneAssignment.counterparty_id
    ));

    const missingReverseLookup = await apiRequest(
      demoServer.baseUrl,
      "GET",
      "/api/v1/trade-contexts/999999/trading-counterparties"
    );
    assert.equal(missingReverseLookup.status, 404);
    assert.equal(missingReverseLookup.body.code, "TRADE_CONTEXT_NOT_FOUND");
  });

  await t.test("relation constraints and reverse lookup index are enforced", () => {
    const database = new DatabaseSync(databasePath);
    database.exec("PRAGMA foreign_keys = ON");
    const assignment = database.prepare(`
      SELECT counterparty_id, trade_context_id
      FROM trading_counterparty_trade_contexts
      ORDER BY counterparty_id, trade_context_id
      LIMIT 1
    `).get();
    const tableInfo = database.prepare(`
      PRAGMA table_info(trading_counterparty_trade_contexts)
    `).all();
    assert.deepEqual(tableInfo.map(column => column.pk), [1, 2]);
    assert.deepEqual(
      database.prepare(`
        PRAGMA index_info(idx_trading_counterparty_trade_contexts_context)
      `).all().map(column => column.name),
      ["trade_context_id", "counterparty_id"]
    );
    assert.deepEqual(
      assignmentIntegrityTriggerNames(database),
      ASSIGNMENT_INTEGRITY_TRIGGER_NAMES
    );

    assert.throws(() => database.prepare(`
      INSERT INTO trading_counterparty_trade_contexts
        (counterparty_id, trade_context_id)
      VALUES (?, ?)
    `).run(assignment.counterparty_id, assignment.trade_context_id), /constraint/i);
    assert.throws(() => database.prepare(`
      INSERT INTO trading_counterparty_trade_contexts
        (counterparty_id, trade_context_id)
      VALUES (999999, ?)
    `).run(assignment.trade_context_id), /constraint/i);
    assert.throws(() => database.prepare(`
      INSERT INTO trading_counterparty_trade_contexts
        (counterparty_id, trade_context_id)
      VALUES (?, 999999)
    `).run(assignment.counterparty_id), /constraint/i);

    const unattachedScope = database.prepare(`
      SELECT
        counterparty.counterparty_id,
        context.trade_context_id,
        pair.ccy_pair_code
      FROM trading_counterparties counterparty
      CROSS JOIN trade_contexts context
      CROSS JOIN ccy_pair_options pair
      WHERE NOT EXISTS
      (
        SELECT 1
        FROM trading_counterparty_trade_contexts assignment
        WHERE assignment.counterparty_id = counterparty.counterparty_id
          AND assignment.trade_context_id = context.trade_context_id
      )
      ORDER BY counterparty.counterparty_id, context.trade_context_id, pair.ccy_pair_code
      LIMIT 1
    `).get();
    assert.ok(unattachedScope);
    assert.throws(() => database.prepare(`
      INSERT INTO pricing_rules
        (counterparty_id, trade_context_id, ccy_pair_code, margin_percent)
      VALUES (?, ?, ?, 0.25)
    `).run(
      unattachedScope.counterparty_id,
      unattachedScope.trade_context_id,
      unattachedScope.ccy_pair_code
    ), /Pricing Rule Trade Context must be attached/i);

    const ruleWithUnattachedContext = database.prepare(`
      SELECT
        rule.pricing_rule_id,
        context.trade_context_id
      FROM pricing_rules rule
      CROSS JOIN trade_contexts context
      WHERE NOT EXISTS
      (
        SELECT 1
        FROM trading_counterparty_trade_contexts assignment
        WHERE assignment.counterparty_id = rule.counterparty_id
          AND assignment.trade_context_id = context.trade_context_id
      )
      ORDER BY rule.pricing_rule_id, context.trade_context_id
      LIMIT 1
    `).get();
    assert.ok(ruleWithUnattachedContext);
    assert.throws(() => database.prepare(`
      UPDATE pricing_rules
      SET trade_context_id = ?
      WHERE pricing_rule_id = ?
    `).run(
      ruleWithUnattachedContext.trade_context_id,
      ruleWithUnattachedContext.pricing_rule_id
    ), /Pricing Rule Trade Context must be attached/i);

    const usedAssignment = database.prepare(`
      SELECT counterparty_id, trade_context_id
      FROM pricing_rules
      ORDER BY pricing_rule_id
      LIMIT 1
    `).get();
    assert.ok(usedAssignment);
    assert.throws(() => database.prepare(`
      DELETE FROM trading_counterparty_trade_contexts
      WHERE counterparty_id = ? AND trade_context_id = ?
    `).run(
      usedAssignment.counterparty_id,
      usedAssignment.trade_context_id
    ), /cannot be detached/i);
    assert.throws(() => database.prepare(`
      UPDATE trading_counterparty_trade_contexts
      SET trade_context_id = 999999
      WHERE counterparty_id = ? AND trade_context_id = ?
    `).run(
      assignment.counterparty_id,
      assignment.trade_context_id
    ), /assignment identity cannot be changed/i);
    database.close();
  });

  await t.test("Scope is immutable and every profile must match it", async () => {
    const allCounterparties = await apiRequest(
      demoServer.baseUrl,
      "GET",
      "/api/v1/trading-counterparties"
    );
    assert.equal(allCounterparties.status, 200);
    const external = allCounterparties.body.find(counterparty =>
      counterparty.counterpartyScope === "EXTERNAL"
    );
    assert.ok(external);

    const scopeChange = await apiRequest(
      demoServer.baseUrl,
      "PUT",
      `/api/v1/trading-counterparties/${external.counterpartyId}`,
      {
        counterpartyScope: "INTERNAL",
        counterpartyRoles: external.counterpartyRoles,
        unitCode: "SCOPE_CHANGE",
        unitType: "DESK",
        counterpartyName: external.counterpartyName,
        active: external.active
      }
    );
    assert.equal(scopeChange.status, 409);
    assert.equal(scopeChange.body.code, "TRADING_COUNTERPARTY_SCOPE_IMMUTABLE");

    const database = new DatabaseSync(databasePath);
    database.exec("PRAGMA foreign_keys = ON");
    assert.throws(() => database.prepare(`
      INSERT INTO trading_counterparties (counterparty_name, is_active)
      VALUES ('Missing Scope', 1)
    `).run(), /NOT NULL constraint failed/i);
    assert.throws(() => database.prepare(`
      UPDATE trading_counterparties
      SET counterparty_scope = 'INTERNAL'
      WHERE counterparty_id = ?
    `).run(external.counterpartyId), /Scope cannot be changed/i);
    assert.throws(() => database.prepare(`
      INSERT INTO internal_units (counterparty_id, unit_code, unit_type)
      VALUES (?, 'WRONG_SCOPE', 'DESK')
    `).run(external.counterpartyId), /requires an INTERNAL Trading Counterparty/i);
    assert.throws(() => database.prepare(`
      DELETE FROM external_counterparties
      WHERE counterparty_id = ?
    `).run(external.counterpartyId), /cannot be deleted independently/i);

    const disposable = database.prepare(`
      INSERT INTO trading_counterparties
        (counterparty_scope, counterparty_name, is_active)
      VALUES ('EXTERNAL', 'Disposable Counterparty', 1)
    `).run();
    database.prepare(`
      INSERT INTO external_counterparties
        (counterparty_id, counterparty_code, counterparty_code_type, external_counterparty_kind)
      VALUES (?, 'DISPOSABLE', 'OTHER', 'CORPORATE')
    `).run(disposable.lastInsertRowid);
    database.prepare(`
      DELETE FROM trading_counterparties
      WHERE counterparty_id = ?
    `).run(disposable.lastInsertRowid);
    assert.equal(database.prepare(`
      SELECT COUNT(*) AS count
      FROM external_counterparties
      WHERE counterparty_id = ?
    `).get(disposable.lastInsertRowid).count, 0);
    database.close();
  });

  await t.test("multi-attach is atomic and attach/detach are idempotent", async () => {
    const globalContexts = await apiRequest(
      demoServer.baseUrl,
      "GET",
      "/api/v1/trade-contexts"
    );
    assert.equal(globalContexts.status, 200);
    assert.ok(globalContexts.body.length >= 3);
    const [firstContext, secondContext, thirdContext] = globalContexts.body;
    const createCounterparty = await apiRequest(
      demoServer.baseUrl,
      "POST",
      "/api/v1/trading-counterparties",
      {
        counterpartyScope: "INTERNAL",
        counterpartyRoles: ["HEDGE_COUNTERPARTY"],
        unitCode: "VERIFY_CTX_ASSIGN",
        unitType: "DESK",
        counterpartyName: "Verification Context Assignment Desk",
        active: true
      }
    );
    assert.equal(createCounterparty.status, 201);
    const counterpartyId = createCounterparty.body.counterpartyId;
    const assignmentsPath =
      `/api/v1/trading-counterparties/${counterpartyId}/trade-contexts`;

    const attach = await apiRequest(demoServer.baseUrl, "PUT", assignmentsPath, {
      tradeContextIds: [
        firstContext.tradeContextId,
        secondContext.tradeContextId,
        firstContext.tradeContextId
      ]
    });
    assert.equal(attach.status, 200);
    assert.deepEqual(
      contextIds(attach.body),
      [firstContext.tradeContextId, secondContext.tradeContextId].sort((a, b) => a - b)
    );
    assert.ok(attach.body.every(context => context.pricingRulesCount === 0));

    const firstContextCounterpartiesPath =
      `/api/v1/trade-contexts/${firstContext.tradeContextId}/trading-counterparties`;
    const afterAttachReverseLookup = await apiRequest(
      demoServer.baseUrl,
      "GET",
      firstContextCounterpartiesPath
    );
    assert.equal(afterAttachReverseLookup.status, 200);
    assert.ok(afterAttachReverseLookup.body.some(counterparty =>
      counterparty.counterpartyId === counterpartyId
      && counterparty.counterpartyScope === "INTERNAL"
    ));
    assert.deepEqual(
      [...new Set(afterAttachReverseLookup.body.map(counterparty => counterparty.counterpartyScope))].sort(),
      ["EXTERNAL", "INTERNAL"]
    );
    assert.equal(
      new Set(afterAttachReverseLookup.body.map(counterparty => counterparty.counterpartyId)).size,
      afterAttachReverseLookup.body.length
    );

    const idempotentAttach = await apiRequest(
      demoServer.baseUrl,
      "PUT",
      assignmentsPath,
      { tradeContextIds: [firstContext.tradeContextId] }
    );
    assert.equal(idempotentAttach.status, 200);
    assert.deepEqual(contextIds(idempotentAttach.body), contextIds(attach.body));

    const invalidBody = await apiRequest(
      demoServer.baseUrl,
      "PUT",
      assignmentsPath,
      { tradeContextIds: [] }
    );
    assert.equal(invalidBody.status, 400);
    assert.equal(invalidBody.body.code, "INVALID_TRADE_CONTEXT_ASSIGNMENTS");

    const atomicFailure = await apiRequest(
      demoServer.baseUrl,
      "PUT",
      assignmentsPath,
      { tradeContextIds: [thirdContext.tradeContextId, 999999] }
    );
    assert.equal(atomicFailure.status, 404);
    assert.equal(atomicFailure.body.code, "TRADE_CONTEXT_NOT_FOUND");
    const afterAtomicFailure = await apiRequest(
      demoServer.baseUrl,
      "GET",
      assignmentsPath
    );
    assert.equal(afterAtomicFailure.status, 200);
    assert.deepEqual(contextIds(afterAtomicFailure.body), contextIds(attach.body));
    assert.equal(
      afterAtomicFailure.body.some(context =>
        context.tradeContextId === thirdContext.tradeContextId
      ),
      false
    );

    const pairs = await apiRequest(demoServer.baseUrl, "GET", "/api/v1/ccy-pair-options");
    assert.equal(pairs.status, 200);
    const rejectedRule = await apiRequest(
      demoServer.baseUrl,
      "POST",
      "/api/v1/pricing-rules",
      {
        counterpartyId,
        tradeContextId: thirdContext.tradeContextId,
        ccyPairCode: pairs.body[0].pairCode,
        marginPercent: 0.25
      }
    );
    assert.equal(rejectedRule.status, 409);
    assert.equal(
      rejectedRule.body.code,
      "PRICING_RULE_TRADE_CONTEXT_NOT_ATTACHED"
    );
    assert.match(rejectedRule.body.message, /is not attached to Trading Counterparty/i);

    const itemAttach = await apiRequest(
      demoServer.baseUrl,
      "PUT",
      `${assignmentsPath}/${thirdContext.tradeContextId}`
    );
    assert.equal(itemAttach.status, 200);
    assert.equal(itemAttach.body.tradeContextId, thirdContext.tradeContextId);
    assert.equal(itemAttach.body.pricingRulesCount, 0);
    assert.equal(
      (await apiRequest(
        demoServer.baseUrl,
        "DELETE",
        `${assignmentsPath}/${thirdContext.tradeContextId}`
      )).status,
      204
    );
    const afterDetachReverseLookup = await apiRequest(
      demoServer.baseUrl,
      "GET",
      `/api/v1/trade-contexts/${thirdContext.tradeContextId}/trading-counterparties`
    );
    assert.equal(afterDetachReverseLookup.status, 200);
    assert.equal(
      afterDetachReverseLookup.body.some(counterparty => counterparty.counterpartyId === counterpartyId),
      false
    );
    assert.equal(
      (await apiRequest(
        demoServer.baseUrl,
        "DELETE",
        `${assignmentsPath}/${thirdContext.tradeContextId}`
      )).status,
      204
    );

    const createRule = await apiRequest(
      demoServer.baseUrl,
      "POST",
      "/api/v1/pricing-rules",
      {
        counterpartyId,
        tradeContextId: firstContext.tradeContextId,
        ccyPairCode: pairs.body[0].pairCode,
        marginPercent: 0.25
      }
    );
    assert.equal(createRule.status, 201);
    const blockedDetach = await apiRequest(
      demoServer.baseUrl,
      "DELETE",
      `${assignmentsPath}/${firstContext.tradeContextId}`
    );
    assert.equal(blockedDetach.status, 409);
    assert.equal(blockedDetach.body.code, "COUNTERPARTY_TRADE_CONTEXT_IN_USE");
    assert.equal(
      (await apiRequest(
        demoServer.baseUrl,
        "DELETE",
        `/api/v1/pricing-rules/${createRule.body.pricingRuleId}`
      )).status,
      204
    );
    assert.equal(
      (await apiRequest(
        demoServer.baseUrl,
        "DELETE",
        `${assignmentsPath}/${firstContext.tradeContextId}`
      )).status,
      204
    );
    const afterFirstContextDetachReverseLookup = await apiRequest(
      demoServer.baseUrl,
      "GET",
      firstContextCounterpartiesPath
    );
    assert.equal(afterFirstContextDetachReverseLookup.status, 200);
    assert.equal(
      afterFirstContextDetachReverseLookup.body.some(counterparty =>
        counterparty.counterpartyId === counterpartyId
      ),
      false
    );
    assert.equal(
      (await apiRequest(
        demoServer.baseUrl,
        "DELETE",
        `/api/v1/trading-counterparties/${counterpartyId}`
      )).status,
      204
    );

    const database = new DatabaseSync(databasePath);
    assert.equal(database.prepare(`
      SELECT COUNT(*) AS count
      FROM trading_counterparty_trade_contexts
      WHERE counterparty_id = ?
    `).get(counterpartyId).count, 0);
    database.close();
  });
});

test("startup restores assignment guards after rebuilding a weak canonical relation", async t => {
  const temporaryDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "position-counterparty-context-guards-")
  );
  const databasePath = path.join(temporaryDirectory, "partial.sqlite");
  prepareWeakCanonicalAssignmentDatabase(databasePath);
  const demoServer = await startDemoServer(databasePath);

  t.after(async () => {
    await stopDemoServer(demoServer.child);
    removeDatabaseFiles(databasePath);
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  });

  const database = new DatabaseSync(databasePath);
  database.exec("PRAGMA foreign_keys = ON");
  assert.deepEqual(
    assignmentIntegrityTriggerNames(database),
    ASSIGNMENT_INTEGRITY_TRIGGER_NAMES
  );
  assert.deepEqual(
    database.prepare(`
      PRAGMA table_info(trading_counterparty_trade_contexts)
    `).all().map(column => column.pk),
    [1, 2]
  );
  database.close();
});

test("partial startup attaches Contexts before seeding Pricing Rules", async t => {
  const temporaryDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "position-counterparty-context-partial-seed-")
  );
  const databasePath = path.join(temporaryDirectory, "partial.sqlite");
  preparePartialDatabaseWithoutPricingConfiguration(databasePath);
  const demoServer = await startDemoServer(databasePath);

  t.after(async () => {
    await stopDemoServer(demoServer.child);
    removeDatabaseFiles(databasePath);
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  });

  const database = new DatabaseSync(databasePath);
  database.exec("PRAGMA foreign_keys = ON");
  const pricingRuleCount = Number(
    database.prepare("SELECT COUNT(*) AS count FROM pricing_rules").get().count
  );
  assert.equal(pricingRuleCount, 7);
  assert.equal(
    Number(database.prepare(`
      SELECT COUNT(*) AS count
      FROM pricing_rules rule
      LEFT JOIN trading_counterparty_trade_contexts assignment
        ON assignment.counterparty_id = rule.counterparty_id
        AND assignment.trade_context_id = rule.trade_context_id
      WHERE assignment.counterparty_id IS NULL
    `).get().count),
    0
  );
  assert.deepEqual(
    assignmentIntegrityTriggerNames(database),
    ASSIGNMENT_INTEGRITY_TRIGGER_NAMES
  );
  database.close();
});
