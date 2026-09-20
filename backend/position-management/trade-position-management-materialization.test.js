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
  assert.equal(result.statusCode, expectedStatusCode, JSON.stringify(result.body));
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
    FROM trade_position_management
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
    FROM trade_position_management
    WHERE trade_id = ? AND trade_type = ?
  `).get(tradeId, tradeType));
}

function batchMemberTradeId(databasePath, batchId, memberRole) {
  return withDatabase(databasePath, database => Number(database.prepare(`
    SELECT trade_id AS tradeId
    FROM batch_members
    WHERE batch_id = ? AND member_role = ?
  `).get(batchId, memberRole)?.tradeId));
}

function assertValidManagementTimestamp(row) {
  assert.match(row.createdAt, ISO_UTC_TIMESTAMP);
  assert.match(row.updatedAt, ISO_UTC_TIMESTAMP);
  assert.ok(row.updatedAt >= row.createdAt);
}

function cloneSeedExposure(database) {
  const result = database.prepare(`
    INSERT INTO trade_exposures
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
    FROM trade_exposures
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
      FROM trade_exposures
      ORDER BY trade_id, trade_type
    `).all();
    const seededClientPolicy = database.prepare(`
      SELECT
        deal.trade_context_id AS tradeContextId,
        deal.pricing_rule_id AS pricingRuleId
      FROM client_deals deal
      ORDER BY deal.trade_id
      LIMIT 1
    `).get();

    assert.ok(legacyTrades.length > 0);
    assert.ok(seededClientPolicy);
    database.prepare(`
      UPDATE trade_position_management
      SET initial_position_management_mode = 'AUTO',
          current_position_management_mode = 'AUTO'
      WHERE trade_id = (SELECT MIN(trade_id) FROM trade_position_management)
    `).run();
    database.exec("PRAGMA foreign_keys = OFF");
    database.exec(`
      DROP TRIGGER IF EXISTS trg_trade_position_management_initialize;
      DROP TRIGGER IF EXISTS trg_batch_balance_trade_position_management_mode_immutable_update;
      DROP TRIGGER IF EXISTS trg_batch_balance_trade_position_management_mode_immutable_delete;
      DROP TRIGGER IF EXISTS trg_batch_balance_trade_position_management_transition_reject;
      DROP TRIGGER IF EXISTS trg_batches_form;
      DROP INDEX IF EXISTS idx_trade_position_management_current_mode;

      CREATE TABLE trade_position_management_legacy
      (
        trade_id INTEGER NOT NULL,
        trade_type TEXT NOT NULL,
        position_management_mode TEXT NOT NULL DEFAULT 'MANUAL',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (trade_id, trade_type),
        FOREIGN KEY (trade_id, trade_type)
          REFERENCES trade_exposures (trade_id, trade_type)
          ON UPDATE RESTRICT
          ON DELETE CASCADE,
        CHECK (position_management_mode IN ('MANUAL', 'AUTO'))
      );

      INSERT INTO trade_position_management_legacy
        (trade_id, trade_type, position_management_mode, created_at, updated_at)
      SELECT
        trade_id,
        trade_type,
        current_position_management_mode,
        created_at,
        updated_at
      FROM trade_position_management;

      DROP TABLE trade_position_management;
      ALTER TABLE trade_position_management_legacy
        RENAME TO trade_position_management;
    `);
    database.exec("PRAGMA foreign_keys = ON");
    return legacyTrades;
  } finally {
    database.close();
  }
}

function contextUpdatePayload(context, autoManagementAdmissionMode) {
  return {
    servicingLocationId: context.servicingLocationId,
    accountingSystemId: context.accountingSystemId,
    originatingSystemId: context.originatingSystemId,
    autoManagementAdmissionMode
  };
}

function clientDealPayload(rule, suffix) {
  return {
    executionTimestamp: `2026-08-15T10:00:${String(suffix).padStart(2, "0")}.000Z`,
    counterpartyId: rule.counterpartyId,
    tradeContextId: rule.tradeContextId,
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

test("trade_position_management has a constrained composite trade identity", () => {
  const database = freshSeededDatabase();

  try {
    const columns = database.prepare(
      "PRAGMA table_info(trade_position_management)"
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
      "PRAGMA foreign_key_list(trade_position_management)"
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
        table: "trade_exposures",
        from: "trade_id",
        to: "trade_id",
        onDelete: "CASCADE"
      },
      {
        sequence: 1,
        table: "trade_exposures",
        from: "trade_type",
        to: "trade_type",
        onDelete: "CASCADE"
      }
    ]);

    const exposureCount = Number(database.prepare(
      "SELECT COUNT(*) AS count FROM trade_exposures"
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
      INSERT INTO trade_position_management
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
      UPDATE trade_position_management
      SET current_position_management_mode = 'UNVERIFIED'
      WHERE trade_id = ? AND trade_type = ?
    `).run(firstRow.tradeId, firstRow.tradeType), /CHECK constraint failed/i);
    assert.throws(() => database.prepare(`
      UPDATE trade_position_management
      SET updated_at = 'not-a-timestamp'
      WHERE trade_id = ? AND trade_type = ?
    `).run(firstRow.tradeId, firstRow.tradeType), /CHECK constraint failed/i);
    assert.throws(() => database.prepare(`
      INSERT INTO trade_position_management
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
      FROM trade_position_management
      WHERE trade_id = ?
    `).get(clonedTradeId);
    assert.equal(clonedManagement?.initialMode, "MANUAL");
    assert.equal(clonedManagement?.currentMode, "MANUAL");
    database.prepare("DELETE FROM trade_exposures WHERE trade_id = ?")
      .run(clonedTradeId);
    assert.equal(database.prepare(`
      SELECT COUNT(*) AS count
      FROM trade_position_management
      WHERE trade_id = ?
    `).get(clonedTradeId).count, 0);
  } finally {
    database.close();
  }
});

test("trade creation snapshots effective policy and Position exposes it", async t => {
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
      "SELECT COUNT(*) AS count FROM trade_exposures"
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
    await request("GET", "/api/v1/trade-contexts"),
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
    context => context.tradeContextId === clientRule.tradeContextId
  );
  assert.ok(clientContext);

  successfulBody(await request(
    "PUT",
    `/api/v1/trade-contexts/${clientContext.tradeContextId}`,
    contextUpdatePayload(clientContext, "REVIEW_REQUIRED")
  ), 200);
  successfulBody(await request(
    "PUT",
    `/api/v1/pricing-rules/${clientRule.pricingRuleId}`,
    { autoManagementAdmissionModeOverride: null }
  ), 200);

  successfulBody(await request("POST", "/api/v1/market-pulse-simulation/start"), 200);
  const inheritedAutoClient = successfulBody(await request("POST", "/api/v1/client-deal-generation/one"), 201);
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
    { autoManagementAdmissionModeOverride: "REVIEW_REQUIRED" }
  ), 200);
  assert.deepEqual(
    managementRow(databasePath, inheritedAutoClient.tradeId, "CLIENT_DEAL"),
    inheritedAutoSnapshot
  );

  const overriddenManualClient = successfulBody(
    await request(
      "POST",
      "/api/v1/client-deals",
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
    "/api/v1/positions/move-to-auto-management",
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
    FROM trade_position_management_transitions
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
    "/api/v1/positions/move-to-auto-management",
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
    "/api/v1/positions/move-to-auto-management",
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
    "POSITION_MODE_TRANSITION_REJECTED"
  );

  const manualFallbackPayload = {
    ...clientDealPayload(clientRule, 3),
    tradeContextId: null,
    pricingRuleId: null,
    manualPricingReason: "CLIENT_ONBOARDING",
    transferRate: "1.1230"
  };
  const manualFallbackClient = successfulBody(
    await request("POST", "/api/v1/client-deals", manualFallbackPayload),
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
    context => context.tradeContextId === hedgeRule.tradeContextId
  );
  assert.ok(hedgeContext);

  successfulBody(await request(
    "PUT",
    `/api/v1/trade-contexts/${hedgeContext.tradeContextId}`,
    contextUpdatePayload(hedgeContext, "REVIEW_REQUIRED")
  ), 200);
  successfulBody(await request(
    "PUT",
    `/api/v1/pricing-rules/${hedgeRule.pricingRuleId}`,
    { autoManagementAdmissionModeOverride: null }
  ), 200);

  const hedgeDealPayload = {
    pricingRuleId: hedgeRule.pricingRuleId,
    ccyPairCode: hedgeRule.ccyPairCode,
    side: "BUY",
    dealtCcyCode: "EUR",
    dealtCcyAmount: "1000",
    tradeRate: "1.1234",
    tenor: "TOD"
  };
  const overriddenAutoHedge = successfulBody(
    await request("POST", "/api/v1/hedge-deals", {...hedgeDealPayload, positionManagementMode: "AUTO"}),
    201
  );
  const overriddenAutoHedgeSnapshot = managementRow(
    databasePath,
    overriddenAutoHedge.tradeId,
    "HEDGE_DEAL"
  );
  assert.equal(overriddenAutoHedgeSnapshot.initialPositionManagementMode, "AUTO");
  assert.equal(overriddenAutoHedgeSnapshot.currentPositionManagementMode, "AUTO");

  const manualTabHedge = successfulBody(
    await request("POST", "/api/v1/hedge-deals", {
      ...hedgeDealPayload,
      positionManagementMode: "MANUAL"
    }),
    201
  );
  assert.deepEqual(
    [
      managementRow(
        databasePath,
        manualTabHedge.tradeId,
        "HEDGE_DEAL"
      ).initialPositionManagementMode,
      managementRow(
        databasePath,
        manualTabHedge.tradeId,
        "HEDGE_DEAL"
      ).currentPositionManagementMode
    ],
    ["MANUAL", "MANUAL"]
  );
  const invalidTabModeHedge = await request(
    "POST",
    "/api/v1/hedge-deals",
    {
      ...hedgeDealPayload,
      positionManagementMode: "SEMI_AUTO"
    }
  );
  assert.equal(invalidTabModeHedge.statusCode, 400);
  assert.equal(invalidTabModeHedge.body.code, "INVALID_HEDGE_DEAL");

  successfulBody(await request(
    "PUT",
    `/api/v1/pricing-rules/${hedgeRule.pricingRuleId}`,
    { autoManagementAdmissionModeOverride: null }
  ), 200);
  assert.deepEqual(
    managementRow(databasePath, overriddenAutoHedge.tradeId, "HEDGE_DEAL"),
    overriddenAutoHedgeSnapshot
  );

  const autoTabHedge = successfulBody(
    await request("POST", "/api/v1/hedge-deals", {
      ...hedgeDealPayload,
      positionManagementMode: "AUTO"
    }),
    201
  );
  assert.deepEqual(
    [
      managementRow(
        databasePath,
        autoTabHedge.tradeId,
        "HEDGE_DEAL"
      ).initialPositionManagementMode,
      managementRow(
        databasePath,
        autoTabHedge.tradeId,
        "HEDGE_DEAL"
      ).currentPositionManagementMode
    ],
    ["AUTO", "AUTO"]
  );

  const positions = successfulBody(
    await request("GET", "/api/v1/positions"),
    200
  );
  assert.ok(positions.length > 0);
  assert.ok(positions.every(position =>
    position.currentPositionManagementMode === "MANUAL"
      || position.currentPositionManagementMode === "AUTO"
  ));
  assert.ok(positions.every(position =>
    position.positionManagementMode === position.currentPositionManagementMode
  ));

  const expectedModes = new Map([
    [`${inheritedAutoClient.tradeId}:CLIENT_DEAL`, ["AUTO", "AUTO"]],
    [`${overriddenManualClient.tradeId}:CLIENT_DEAL`, ["MANUAL", "AUTO"]],
    [`${manualFallbackClient.tradeId}:CLIENT_DEAL`, ["MANUAL", "MANUAL"]],
    [`${overriddenAutoHedge.tradeId}:HEDGE_DEAL`, ["AUTO", "AUTO"]],
    [`${manualTabHedge.tradeId}:HEDGE_DEAL`, ["MANUAL", "MANUAL"]],
    [`${autoTabHedge.tradeId}:HEDGE_DEAL`, ["AUTO", "AUTO"]]
  ]);
  positions.forEach(position => {
    const key = `${position.tradeId}:${position.tradeType}`;

    if (expectedModes.has(key)) {
      const [initialMode, currentMode] = expectedModes.get(key);
      assert.equal(position.initialPositionManagementMode, initialMode);
      assert.equal(position.currentPositionManagementMode, currentMode);
      expectedModes.delete(key);
    }
  });
  assert.deepEqual([...expectedModes.keys()], []);

  const mixedModeBatch = await request("POST", "/api/v1/batches", {
    idempotencyKey: "position-mode-mixed-sources",
    tradeIds: [inheritedAutoClient.tradeId, manualFallbackClient.tradeId]
  });
  assert.equal(mixedModeBatch.statusCode, 422);
  assert.equal(mixedModeBatch.body.code, "INCOMPATIBLE_BATCH_SELECTION");

  const autoSourceBatch = successfulBody(await request(
    "POST",
    "/api/v1/batches",
    {
      idempotencyKey: "position-mode-auto-source",
      tradeIds: [inheritedAutoClient.tradeId]
    }
  ), 201);
  assert.equal(autoSourceBatch.formationReasonCode, "MANUAL_SELECTION");
  const autoPositionOutTradeId = batchMemberTradeId(
    databasePath,
    autoSourceBatch.batchId,
    "POSITION_OUT"
  );
  const autoBalanceTradeId = batchMemberTradeId(
    databasePath,
    autoSourceBatch.batchId,
    "BALANCE_TRADE"
  );
  assert.ok(Number.isSafeInteger(autoPositionOutTradeId));
  assert.ok(Number.isSafeInteger(autoBalanceTradeId));
  assert.deepEqual(
    [
      managementRow(
        databasePath,
        autoPositionOutTradeId,
        "BATCH_POSITION_OUT"
      ).initialPositionManagementMode,
      managementRow(
        databasePath,
        autoPositionOutTradeId,
        "BATCH_POSITION_OUT"
      ).currentPositionManagementMode
    ],
    ["AUTO", "AUTO"]
  );
  assert.deepEqual(
    [
      managementRow(
        databasePath,
        autoBalanceTradeId,
        "BATCH_BALANCE_TRADE"
      ).initialPositionManagementMode,
      managementRow(
        databasePath,
        autoBalanceTradeId,
        "BATCH_BALANCE_TRADE"
      ).currentPositionManagementMode
    ],
    ["AUTO", "AUTO"]
  );
  assert.throws(
    () => withDatabase(databasePath, database => database.prepare(`
      UPDATE trade_position_management
      SET current_position_management_mode = 'MANUAL'
      WHERE trade_id = ? AND trade_type = 'BATCH_BALANCE_TRADE'
    `).run(autoBalanceTradeId)),
    /Batch Balance Trade Position Management Mode is immutable/
  );
  assert.throws(
    () => withDatabase(databasePath, database => database.prepare(`
      DELETE FROM trade_position_management
      WHERE trade_id = ? AND trade_type = 'BATCH_BALANCE_TRADE'
    `).run(autoBalanceTradeId)),
    /Batch Balance Trade Position Management Mode is immutable/
  );
  assert.throws(
    () => withDatabase(databasePath, database => database.prepare(`
      INSERT INTO trade_position_management_transitions
        (
          trade_id,
          trade_type,
          from_position_management_mode,
          to_position_management_mode,
          reason_code,
          transition_source
        )
      VALUES
        (?, 'BATCH_BALANCE_TRADE', 'MANUAL', 'AUTO',
         'MANUAL_REVIEW_COMPLETED', 'OPERATOR')
    `).run(autoBalanceTradeId)),
    /Batch Balance Trade does not support Position Management Mode transitions/
  );

  const manualSourceBatch = successfulBody(await request(
    "POST",
    "/api/v1/batches",
    {
      idempotencyKey: "position-mode-manual-source",
      tradeIds: [manualFallbackClient.tradeId]
    }
  ), 201);
  const manualPositionOutTradeId = batchMemberTradeId(
    databasePath,
    manualSourceBatch.batchId,
    "POSITION_OUT"
  );
  const manualBalanceTradeId = batchMemberTradeId(
    databasePath,
    manualSourceBatch.batchId,
    "BALANCE_TRADE"
  );
  assert.ok(Number.isSafeInteger(manualPositionOutTradeId));
  assert.ok(Number.isSafeInteger(manualBalanceTradeId));
  assert.deepEqual(
    [
      managementRow(
        databasePath,
        manualPositionOutTradeId,
        "BATCH_POSITION_OUT"
      ).initialPositionManagementMode,
      managementRow(
        databasePath,
        manualPositionOutTradeId,
        "BATCH_POSITION_OUT"
      ).currentPositionManagementMode
    ],
    ["MANUAL", "MANUAL"]
  );
  assert.deepEqual(
    [
      managementRow(
        databasePath,
        manualBalanceTradeId,
        "BATCH_BALANCE_TRADE"
      ).initialPositionManagementMode,
      managementRow(
        databasePath,
        manualBalanceTradeId,
        "BATCH_BALANCE_TRADE"
      ).currentPositionManagementMode
    ],
    ["MANUAL", "MANUAL"]
  );

  const positionsAfterBatching = successfulBody(
    await request("GET", "/api/v1/positions"),
    200
  );
  assert.equal(
    positionsAfterBatching.find(position =>
      position.tradeId === autoPositionOutTradeId
      && position.tradeType === "BATCH_POSITION_OUT"
    )?.currentPositionManagementMode,
    "AUTO"
  );
  assert.equal(
    positionsAfterBatching.find(position =>
      position.tradeId === manualPositionOutTradeId
      && position.tradeType === "BATCH_POSITION_OUT"
    )?.currentPositionManagementMode,
    "MANUAL"
  );

  withDatabase(databasePath, database => {
    // Emulate data written by a previous schema before the invariant existed.
    database.exec(`
      DROP TRIGGER IF EXISTS trg_batch_balance_trade_position_management_mode_immutable_update;
      DROP TRIGGER IF EXISTS trg_batch_balance_trade_position_management_mode_immutable_delete;
      DROP TRIGGER IF EXISTS trg_batch_balance_trade_position_management_transition_reject;
    `);
    database.prepare(`
      UPDATE trade_position_management
      SET initial_position_management_mode = 'MANUAL',
          current_position_management_mode = 'MANUAL',
          updated_at = created_at
      WHERE
        (trade_id = ? AND trade_type = 'BATCH_POSITION_OUT')
        OR (trade_id = ? AND trade_type = 'BATCH_BALANCE_TRADE')
    `).run(autoPositionOutTradeId, autoBalanceTradeId);
  });
  const legacyManagementBeforeRestart = withDatabase(databasePath, managementRows);
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
  const managementAfterRestart = withDatabase(databasePath, managementRows);
  const repairedAutoPositionOut = managementAfterRestart.find(row =>
    row.tradeId === autoPositionOutTradeId
    && row.tradeType === "BATCH_POSITION_OUT"
  );
  assert.equal(repairedAutoPositionOut.initialPositionManagementMode, "AUTO");
  assert.equal(repairedAutoPositionOut.currentPositionManagementMode, "AUTO");
  assertValidManagementTimestamp(repairedAutoPositionOut);
  const repairedAutoBalanceTrade = managementAfterRestart.find(row =>
    row.tradeId === autoBalanceTradeId
    && row.tradeType === "BATCH_BALANCE_TRADE"
  );
  assert.equal(repairedAutoBalanceTrade.initialPositionManagementMode, "AUTO");
  assert.equal(repairedAutoBalanceTrade.currentPositionManagementMode, "AUTO");
  assertValidManagementTimestamp(repairedAutoBalanceTrade);
  const repairedTradeKeys = new Set([
    `${autoPositionOutTradeId}:BATCH_POSITION_OUT`,
    `${autoBalanceTradeId}:BATCH_BALANCE_TRADE`
  ]);
  assert.deepEqual(
    managementAfterRestart.filter(row =>
      !repairedTradeKeys.has(`${row.tradeId}:${row.tradeType}`)
    ),
    legacyManagementBeforeRestart.filter(row =>
      !repairedTradeKeys.has(`${row.tradeId}:${row.tradeType}`)
    )
  );
});
