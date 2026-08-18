"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { DatabaseSync } = require("node:sqlite");

const ROOT = path.resolve(__dirname, "..", "..");
const SERVER_PATH = path.join(ROOT, "server.js");
const SCHEMA_PATH = path.join(ROOT, "schema.sql");
const SEED_PATH = path.join(ROOT, "seed.sql");
const TEMPORARY_DIRECTORY_PREFIX = "position-trade-management-";
const ISO_UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function openDatabase(databasePath) {
  const database = new DatabaseSync(databasePath);
  database.exec("PRAGMA foreign_keys = ON");
  database.exec("PRAGMA busy_timeout = 5000");
  return database;
}

function freshSeededDatabase(databasePath = ":memory:") {
  const database = openDatabase(databasePath);
  database.exec(fs.readFileSync(SCHEMA_PATH, "utf8"));
  database.exec(fs.readFileSync(SEED_PATH, "utf8"));
  return database;
}

function withDatabase(databasePath, callback) {
  const database = openDatabase(databasePath);

  try {
    return callback(database);
  } finally {
    database.close();
  }
}

function removeOwnedTemporaryDirectory(temporaryDirectory) {
  const temporaryRoot = path.resolve(os.tmpdir());
  const resolvedDirectory = path.resolve(temporaryDirectory);
  const relativeDirectory = path.relative(temporaryRoot, resolvedDirectory);

  assert.ok(relativeDirectory && !relativeDirectory.startsWith(".."));
  assert.equal(path.isAbsolute(relativeDirectory), false);
  assert.match(path.basename(resolvedDirectory), new RegExp(`^${TEMPORARY_DIRECTORY_PREFIX}`));
  fs.rmSync(resolvedDirectory, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100
  });
}

function apiClient(handleApi) {
  return async function request(method, pathname, body) {
    let statusCode = 0;
    let responseBody = "";
    const serializedBody = body === undefined ? "" : JSON.stringify(body);
    const apiRequest = {
      method,
      async *[Symbol.asyncIterator]() {
        if (serializedBody) {
          yield Buffer.from(serializedBody, "utf8");
        }
      }
    };
    const response = {
      writeHead(code) {
        statusCode = code;
      },
      end(chunk = "") {
        responseBody += chunk;
      }
    };
    const handled = await handleApi(
      apiRequest,
      response,
      new URL(pathname, "http://127.0.0.1:8000")
    );

    return {
      handled,
      statusCode,
      body: responseBody ? JSON.parse(responseBody) : null
    };
  };
}

function successfulBody(result, expectedStatusCode) {
  assert.equal(result.handled, true);
  assert.equal(result.statusCode, expectedStatusCode);
  return result.body;
}

function managementRows(database) {
  return database.prepare(`
    SELECT
      trade_id AS tradeId,
      trade_type AS tradeType,
      initial_position_management_mode AS initialPositionManagementMode,
      current_position_management_mode AS currentPositionManagementMode,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM fx_trade_position_management
    ORDER BY trade_id, trade_type
  `).all();
}

function managementRow(databasePath, tradeId, tradeType) {
  return withDatabase(databasePath, database => database.prepare(`
    SELECT
      trade_id AS tradeId,
      trade_type AS tradeType,
      initial_position_management_mode AS initialPositionManagementMode,
      current_position_management_mode AS currentPositionManagementMode,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM fx_trade_position_management
    WHERE trade_id = ? AND trade_type = ?
  `).get(tradeId, tradeType));
}

function assertValidManagementTimestamp(row) {
  assert.match(row.createdAt, ISO_UTC_TIMESTAMP);
  assert.match(row.updatedAt, ISO_UTC_TIMESTAMP);
  assert.ok(row.updatedAt >= row.createdAt);
}

function cloneSeedExposure(database) {
  const result = database.prepare(`
    INSERT INTO fx_trade_exposure
      (
        execution_timestamp,
        received_timestamp,
        trade_type,
        trade_date,
        ccy_pair_code,
        base_ccy_side,
        dealt_ccy_code,
        base_ccy_amount_minor,
        base_ccy_fraction_digits,
        quote_ccy_amount_minor,
        quote_ccy_fraction_digits,
        trade_rate,
        tenor,
        base_ccy_value_date,
        quote_ccy_value_date
      )
    SELECT
      execution_timestamp,
      received_timestamp,
      trade_type,
      trade_date,
      ccy_pair_code,
      base_ccy_side,
      dealt_ccy_code,
      base_ccy_amount_minor,
      base_ccy_fraction_digits,
      quote_ccy_amount_minor,
      quote_ccy_fraction_digits,
      trade_rate,
      tenor,
      base_ccy_value_date,
      quote_ccy_value_date
    FROM fx_trade_exposure
    ORDER BY trade_id
    LIMIT 1
  `).run();

  return Number(result.lastInsertRowid);
}

function prepareLegacyDatabase(databasePath) {
  const database = freshSeededDatabase(databasePath);

  try {
    const legacyTrades = database.prepare(`
      SELECT trade_id AS tradeId, trade_type AS tradeType
      FROM fx_trade_exposure
      ORDER BY trade_id, trade_type
    `).all();
    const seededClientPolicy = database.prepare(`
      SELECT
        deal.execution_context_id AS executionContextId,
        deal.pricing_rule_id AS pricingRuleId
      FROM client_fx_deals deal
      ORDER BY deal.trade_id
      LIMIT 1
    `).get();

    assert.ok(legacyTrades.length > 0);
    assert.ok(seededClientPolicy);
    database.prepare(`
      UPDATE execution_contexts
      SET default_position_management_mode = 'AUTO'
      WHERE execution_context_id = ?
    `).run(seededClientPolicy.executionContextId);
    database.prepare(`
      UPDATE pricing_rules
      SET position_management_mode_override = 'AUTO'
      WHERE pricing_rule_id = ?
    `).run(seededClientPolicy.pricingRuleId);

    const effectivePolicyBeforeMigration = database.prepare(`
      SELECT COALESCE(
        rule.position_management_mode_override,
        context.default_position_management_mode,
        'MANUAL'
      ) AS mode
      FROM client_fx_deals deal
      LEFT JOIN pricing_rules rule ON rule.pricing_rule_id = deal.pricing_rule_id
      LEFT JOIN execution_contexts context
        ON context.execution_context_id = deal.execution_context_id
      ORDER BY deal.trade_id
      LIMIT 1
    `).get()?.mode;
    assert.equal(effectivePolicyBeforeMigration, "AUTO");

    database.prepare(`
      UPDATE fx_trade_position_management
      SET initial_position_management_mode = 'AUTO',
          current_position_management_mode = 'AUTO'
      WHERE trade_id = (SELECT MIN(trade_id) FROM fx_trade_position_management)
    `).run();
    database.exec("PRAGMA foreign_keys = OFF");
    database.exec(`
      DROP TRIGGER IF EXISTS trg_fx_trade_position_management_initialize;
      DROP INDEX IF EXISTS idx_fx_trade_position_management_current_mode;

      CREATE TABLE fx_trade_position_management_legacy
      (
        trade_id INTEGER NOT NULL,
        trade_type TEXT NOT NULL,
        position_management_mode TEXT NOT NULL DEFAULT 'MANUAL',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (trade_id, trade_type),
        FOREIGN KEY (trade_id, trade_type)
          REFERENCES fx_trade_exposure (trade_id, trade_type)
          ON UPDATE RESTRICT
          ON DELETE CASCADE,
        CHECK (position_management_mode IN ('MANUAL', 'AUTO'))
      );

      INSERT INTO fx_trade_position_management_legacy
        (trade_id, trade_type, position_management_mode, created_at, updated_at)
      SELECT
        trade_id,
        trade_type,
        current_position_management_mode,
        created_at,
        updated_at
      FROM fx_trade_position_management;

      DROP TABLE fx_trade_position_management;
      ALTER TABLE fx_trade_position_management_legacy
        RENAME TO fx_trade_position_management;
    `);
    database.exec("PRAGMA foreign_keys = ON");
    return legacyTrades;
  } finally {
    database.close();
  }
}

function contextUpdatePayload(context, defaultPositionManagementMode) {
  return {
    servicingLocationId: context.servicingLocationId,
    accountingSystemId: context.accountingSystemId,
    executionSystemId: context.executionSystemId,
    defaultPositionManagementMode
  };
}

function clientDealPayload(rule, suffix) {
  return {
    executionTimestamp: `2026-08-15T10:00:${String(suffix).padStart(2, "0")}.000Z`,
    counterpartyId: rule.counterpartyId,
    executionContextId: rule.executionContextId,
    pricingRuleId: rule.pricingRuleId,
    tradeDate: "2026-08-15",
    ccyPairCode: rule.ccyPairCode,
    side: "BUY",
    dealtCcyCode: "EUR",
    dealtCcyAmount: "1000",
    tradeRate: "1.1234",
    tenor: "TOD",
    baseCcyValueDate: "2026-08-15",
    quoteCcyValueDate: "2026-08-15",
    marketPulseStreamStatus: "STOPPED"
  };
}

test("fx_trade_position_management has a constrained composite trade identity", () => {
  const database = freshSeededDatabase();

  try {
    const columns = database.prepare(
      "PRAGMA table_info(fx_trade_position_management)"
    ).all();
    assert.deepEqual(columns.map(column => column.name), [
      "trade_id",
      "trade_type",
      "initial_position_management_mode",
      "current_position_management_mode",
      "created_at",
      "updated_at"
    ]);
    assert.deepEqual(columns.map(column => column.pk), [1, 2, 0, 0, 0, 0]);
    assert.ok(columns.every(column => column.notnull === 1));

    const foreignKeys = database.prepare(
      "PRAGMA foreign_key_list(fx_trade_position_management)"
    ).all();
    assert.deepEqual(foreignKeys.map(foreignKey => ({
      sequence: foreignKey.seq,
      table: foreignKey.table,
      from: foreignKey.from,
      to: foreignKey.to,
      onDelete: foreignKey.on_delete
    })), [
      {
        sequence: 0,
        table: "fx_trade_exposure",
        from: "trade_id",
        to: "trade_id",
        onDelete: "CASCADE"
      },
      {
        sequence: 1,
        table: "fx_trade_exposure",
        from: "trade_type",
        to: "trade_type",
        onDelete: "CASCADE"
      }
    ]);

    const exposureCount = Number(database.prepare(
      "SELECT COUNT(*) AS count FROM fx_trade_exposure"
    ).get().count);
    const seededManagementRows = managementRows(database);
    assert.equal(seededManagementRows.length, exposureCount);
    assert.ok(seededManagementRows.length > 0);
    assert.ok(seededManagementRows.every(
      row => row.initialPositionManagementMode === "MANUAL"
        && row.currentPositionManagementMode === "MANUAL"
    ));
    seededManagementRows.forEach(assertValidManagementTimestamp);

    const firstRow = seededManagementRows[0];
    assert.throws(() => database.prepare(`
      INSERT INTO fx_trade_position_management
        (
          trade_id,
          trade_type,
          initial_position_management_mode,
          current_position_management_mode,
          created_at,
          updated_at
        )
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      firstRow.tradeId,
      firstRow.tradeType,
      firstRow.initialPositionManagementMode,
      firstRow.currentPositionManagementMode,
      firstRow.createdAt,
      firstRow.updatedAt
    ), /UNIQUE constraint failed/i);
    assert.throws(() => database.prepare(`
      UPDATE fx_trade_position_management
      SET current_position_management_mode = 'UNVERIFIED'
      WHERE trade_id = ? AND trade_type = ?
    `).run(firstRow.tradeId, firstRow.tradeType), /CHECK constraint failed/i);
    assert.throws(() => database.prepare(`
      UPDATE fx_trade_position_management
      SET updated_at = 'not-a-timestamp'
      WHERE trade_id = ? AND trade_type = ?
    `).run(firstRow.tradeId, firstRow.tradeType), /CHECK constraint failed/i);
    assert.throws(() => database.prepare(`
      INSERT INTO fx_trade_position_management
        (
          trade_id,
          trade_type,
          initial_position_management_mode,
          current_position_management_mode,
          created_at,
          updated_at
        )
      VALUES (9007199254740000, 'CLIENT_DEAL', 'MANUAL', 'MANUAL', ?, ?)
    `).run(firstRow.createdAt, firstRow.updatedAt), /FOREIGN KEY constraint failed/i);

    const clonedTradeId = cloneSeedExposure(database);
    const clonedManagement = database.prepare(`
      SELECT
        initial_position_management_mode AS initialMode,
        current_position_management_mode AS currentMode
      FROM fx_trade_position_management
      WHERE trade_id = ?
    `).get(clonedTradeId);
    assert.equal(clonedManagement?.initialMode, "MANUAL");
    assert.equal(clonedManagement?.currentMode, "MANUAL");
    database.prepare("DELETE FROM fx_trade_exposure WHERE trade_id = ?")
      .run(clonedTradeId);
    assert.equal(database.prepare(`
      SELECT COUNT(*) AS count
      FROM fx_trade_position_management
      WHERE trade_id = ?
    `).get(clonedTradeId).count, 0);
  } finally {
    database.close();
  }
});

test("trade creation snapshots effective policy and FX Position exposes it", async t => {
  const temporaryDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), TEMPORARY_DIRECTORY_PREFIX)
  );
  const databasePath = path.join(temporaryDirectory, "legacy.sqlite");
  const legacyTrades = prepareLegacyDatabase(databasePath);
  const previousDatabasePath = process.env.DEMO_DATABASE_PATH;
  let closeDatabase = null;

  t.after(() => {
    try {
      closeDatabase?.();
    } finally {
      if (previousDatabasePath === undefined) {
        delete process.env.DEMO_DATABASE_PATH;
      } else {
        process.env.DEMO_DATABASE_PATH = previousDatabasePath;
      }

      removeOwnedTemporaryDirectory(temporaryDirectory);
    }
  });

  process.env.DEMO_DATABASE_PATH = databasePath;
  const server = require(SERVER_PATH);
  closeDatabase = server.closeDatabase;
  const request = apiClient(server.handleApi);

  const legacyBackfill = withDatabase(databasePath, database => {
    const exposures = Number(database.prepare(
      "SELECT COUNT(*) AS count FROM fx_trade_exposure"
    ).get().count);
    const rows = managementRows(database);
    return { exposures, rows };
  });
  assert.equal(legacyBackfill.rows.length, legacyBackfill.exposures);
  assert.ok(legacyBackfill.rows.every(
    row => row.initialPositionManagementMode === row.currentPositionManagementMode
  ));
  assert.deepEqual(
    new Set(legacyBackfill.rows.map(row => row.currentPositionManagementMode)),
    new Set(["AUTO", "MANUAL"])
  );
  legacyBackfill.rows.forEach(assertValidManagementTimestamp);
  assert.deepEqual(
    legacyBackfill.rows.map(row => [row.tradeId, row.tradeType]),
    legacyTrades.map(row => [row.tradeId, row.tradeType])
  );

  const contexts = successfulBody(
    await request("GET", "/api/v1/execution-contexts"),
    200
  );
  const pricingRules = successfulBody(
    await request("GET", "/api/v1/pricing-rules"),
    200
  );
  const clientRule = pricingRules.find(rule =>
    rule.pricingMode === "DEALER_PRICED"
    && rule.counterpartyRoles.includes("CLIENT")
  );
  assert.ok(clientRule);
  const clientContext = contexts.find(
    context => context.executionContextId === clientRule.executionContextId
  );
  assert.ok(clientContext);

  successfulBody(await request(
    "PUT",
    `/api/v1/execution-contexts/${clientContext.executionContextId}`,
    contextUpdatePayload(clientContext, "AUTO")
  ), 200);
  successfulBody(await request(
    "PUT",
    `/api/v1/pricing-rules/${clientRule.pricingRuleId}`,
    { positionManagementModeOverride: null }
  ), 200);

  const inheritedAutoClient = successfulBody(
    await request(
      "POST",
      "/api/v1/client-fx-deals",
      clientDealPayload(clientRule, 1)
    ),
    201
  );
  const inheritedAutoSnapshot = managementRow(
    databasePath,
    inheritedAutoClient.tradeId,
    "CLIENT_DEAL"
  );
  assert.equal(inheritedAutoSnapshot.initialPositionManagementMode, "AUTO");
  assert.equal(inheritedAutoSnapshot.currentPositionManagementMode, "AUTO");

  successfulBody(await request(
    "PUT",
    `/api/v1/pricing-rules/${clientRule.pricingRuleId}`,
    { positionManagementModeOverride: "MANUAL" }
  ), 200);
  assert.deepEqual(
    managementRow(databasePath, inheritedAutoClient.tradeId, "CLIENT_DEAL"),
    inheritedAutoSnapshot
  );

  const overriddenManualClient = successfulBody(
    await request(
      "POST",
      "/api/v1/client-fx-deals",
      clientDealPayload(clientRule, 2)
    ),
    201
  );
  assert.equal(
    managementRow(
      databasePath,
      overriddenManualClient.tradeId,
      "CLIENT_DEAL"
    ).currentPositionManagementMode,
    "MANUAL"
  );
  assert.equal(
    managementRow(
      databasePath,
      overriddenManualClient.tradeId,
      "CLIENT_DEAL"
    ).initialPositionManagementMode,
    "MANUAL"
  );

  const sentToAuto = successfulBody(await request(
    "POST",
    "/api/v1/fx-positions/send-to-auto-batching",
    {
      trades: [{
        tradeId: overriddenManualClient.tradeId,
        tradeType: "CLIENT_DEAL"
      }]
    }
  ), 200);
  assert.equal(sentToAuto.transitionedCount, 1);
  assert.equal(sentToAuto.replayed, false);
  assert.equal(
    sentToAuto.transitions[0].initialPositionManagementMode,
    "MANUAL"
  );
  assert.equal(
    sentToAuto.transitions[0].currentPositionManagementMode,
    "AUTO"
  );
  const reviewedClientState = managementRow(
    databasePath,
    overriddenManualClient.tradeId,
    "CLIENT_DEAL"
  );
  assert.equal(reviewedClientState.initialPositionManagementMode, "MANUAL");
  assert.equal(reviewedClientState.currentPositionManagementMode, "AUTO");
  assertValidManagementTimestamp(reviewedClientState);

  const transitionAudit = withDatabase(databasePath, database => database.prepare(`
    SELECT
      from_position_management_mode AS fromMode,
      to_position_management_mode AS toMode,
      reason_code AS reasonCode,
      transition_source AS transitionSource,
      transitioned_at AS transitionedAt
    FROM fx_trade_position_management_transitions
    WHERE trade_id = ? AND trade_type = ?
  `).all(overriddenManualClient.tradeId, "CLIENT_DEAL"));
  assert.equal(transitionAudit.length, 1);
  assert.equal(transitionAudit[0].fromMode, "MANUAL");
  assert.equal(transitionAudit[0].toMode, "AUTO");
  assert.equal(transitionAudit[0].reasonCode, "MANUAL_REVIEW_COMPLETED");
  assert.equal(transitionAudit[0].transitionSource, "OPERATOR");
  assert.equal(
    transitionAudit[0].transitionedAt,
    sentToAuto.transitions[0].transitionedAt
  );

  const replayedTransition = successfulBody(await request(
    "POST",
    "/api/v1/fx-positions/send-to-auto-batching",
    {
      trades: [{
        tradeId: overriddenManualClient.tradeId,
        tradeType: "CLIENT_DEAL"
      }]
    }
  ), 200);
  assert.equal(replayedTransition.transitionedCount, 0);
  assert.equal(replayedTransition.replayedCount, 1);
  assert.equal(replayedTransition.replayed, true);

  const rejectedInitialAuto = await request(
    "POST",
    "/api/v1/fx-positions/send-to-auto-batching",
    {
      trades: [{
        tradeId: inheritedAutoClient.tradeId,
        tradeType: "CLIENT_DEAL"
      }]
    }
  );
  assert.equal(rejectedInitialAuto.statusCode, 409);
  assert.equal(
    rejectedInitialAuto.body.code,
    "FX_POSITION_MODE_TRANSITION_REJECTED"
  );

  const manualFallbackPayload = {
    ...clientDealPayload(clientRule, 3),
    executionContextId: null,
    pricingRuleId: null,
    manualPricingReason: "CLIENT_ONBOARDING",
    transferRate: "1.1230"
  };
  const manualFallbackClient = successfulBody(
    await request("POST", "/api/v1/client-fx-deals", manualFallbackPayload),
    201
  );
  assert.equal(
    managementRow(
      databasePath,
      manualFallbackClient.tradeId,
      "CLIENT_DEAL"
    ).currentPositionManagementMode,
    "MANUAL"
  );

  const hedgeRules = successfulBody(
    await request("GET", "/api/v1/hedge-deal-pricing-rules"),
    200
  );
  const hedgeRule = hedgeRules[0];
  assert.ok(hedgeRule);
  const hedgeContext = contexts.find(
    context => context.executionContextId === hedgeRule.executionContextId
  );
  assert.ok(hedgeContext);

  successfulBody(await request(
    "PUT",
    `/api/v1/execution-contexts/${hedgeContext.executionContextId}`,
    contextUpdatePayload(hedgeContext, "MANUAL")
  ), 200);
  successfulBody(await request(
    "PUT",
    `/api/v1/pricing-rules/${hedgeRule.pricingRuleId}`,
    { positionManagementModeOverride: "AUTO" }
  ), 200);

  const overriddenAutoHedge = successfulBody(
    await request("POST", "/api/v1/hedge-fx-deals", {
      pricingRuleId: hedgeRule.pricingRuleId,
      ccyPairCode: hedgeRule.ccyPairCode,
      side: "BUY",
      dealtCcyCode: "EUR",
      dealtCcyAmount: "1000",
      tradeRate: "1.1234",
      tenor: "TOD"
    }),
    201
  );
  const overriddenAutoHedgeSnapshot = managementRow(
    databasePath,
    overriddenAutoHedge.tradeId,
    "HEDGE_DEAL"
  );
  assert.equal(overriddenAutoHedgeSnapshot.initialPositionManagementMode, "AUTO");
  assert.equal(overriddenAutoHedgeSnapshot.currentPositionManagementMode, "AUTO");

  successfulBody(await request(
    "PUT",
    `/api/v1/pricing-rules/${hedgeRule.pricingRuleId}`,
    { positionManagementModeOverride: null }
  ), 200);
  assert.deepEqual(
    managementRow(databasePath, overriddenAutoHedge.tradeId, "HEDGE_DEAL"),
    overriddenAutoHedgeSnapshot
  );

  const fxPositions = successfulBody(
    await request("GET", "/api/v1/fx-positions"),
    200
  );
  assert.ok(fxPositions.length > 0);
  assert.ok(fxPositions.every(position =>
    position.currentFxPositionMode === "MANUAL"
      || position.currentFxPositionMode === "AUTO"
  ));
  assert.ok(fxPositions.every(position =>
    position.fxPositionMode === position.currentFxPositionMode
  ));

  const expectedModes = new Map([
    [`${inheritedAutoClient.tradeId}:CLIENT_DEAL`, ["AUTO", "AUTO"]],
    [`${overriddenManualClient.tradeId}:CLIENT_DEAL`, ["MANUAL", "AUTO"]],
    [`${manualFallbackClient.tradeId}:CLIENT_DEAL`, ["MANUAL", "MANUAL"]],
    [`${overriddenAutoHedge.tradeId}:HEDGE_DEAL`, ["AUTO", "AUTO"]]
  ]);
  fxPositions.forEach(position => {
    const key = `${position.tradeId}:${position.tradeType}`;

    if (expectedModes.has(key)) {
      const [initialMode, currentMode] = expectedModes.get(key);
      assert.equal(position.initialFxPositionMode, initialMode);
      assert.equal(position.currentFxPositionMode, currentMode);
      expectedModes.delete(key);
    }
  });
  assert.deepEqual([...expectedModes.keys()], []);

  const managementBeforeRestart = withDatabase(databasePath, managementRows);
  closeDatabase();
  closeDatabase = null;

  const restart = spawnSync(process.execPath, [SERVER_PATH, "--init-only"], {
    cwd: ROOT,
    env: {
      ...process.env,
      DEMO_DATABASE_PATH: databasePath
    },
    encoding: "utf8",
    timeout: 30000
  });
  assert.equal(
    restart.status,
    0,
    `Server restart failed:\n${restart.stdout}\n${restart.stderr}`
  );
  assert.deepEqual(
    withDatabase(databasePath, managementRows),
    managementBeforeRestart
  );
});
