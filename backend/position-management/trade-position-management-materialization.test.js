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
      position_management_mode AS positionManagementMode,
      created_at AS createdAt
    FROM trade_position_management
    ORDER BY trade_id, trade_type
  `).all();
}

function managementRow(databasePath, tradeId, tradeType) {
  return withDatabase(databasePath, database => database.prepare(`
    SELECT
      trade_id AS tradeId,
      trade_type AS tradeType,
      position_management_mode AS positionManagementMode,
      created_at AS createdAt
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
    const trades = database.prepare("SELECT trade_id AS tradeId, trade_type AS tradeType FROM trade_exposures ORDER BY trade_id").all();
    database.exec(`
      DROP TRIGGER trg_trade_position_management_immutable_update;
      DROP TRIGGER trg_trade_position_management_immutable_delete;
      DROP TRIGGER trg_trade_position_management_no_replace;
      DROP TRIGGER trg_batches_form;
      ALTER TABLE trade_position_management RENAME COLUMN position_management_mode TO current_position_management_mode;
      ALTER TABLE trade_position_management ADD COLUMN initial_position_management_mode TEXT NOT NULL DEFAULT 'MANUAL';
      ALTER TABLE trade_position_management ADD COLUMN updated_at TEXT;
      UPDATE trade_position_management SET current_position_management_mode = 'AUTO' WHERE trade_id = (SELECT MIN(trade_id) FROM trade_exposures);
    `);
    return trades;
  } finally { database.close(); }
}

function contextUpdatePayload(context, positionManagementMode) {
  return {
    servicingLocationId: context.servicingLocationId,
    accountingSystemId: context.accountingSystemId,
    originatingSystemId: context.originatingSystemId,
    positionManagementMode
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

test("every Trade has one immutable management mode", () => {
  const database = freshSeededDatabase();
  try {
    const columns = database.prepare("PRAGMA table_info(trade_position_management)").all();
    assert.deepEqual(columns.map(c => c.name), ["trade_id", "trade_type", "position_management_mode", "created_at"]);
    assert.deepEqual(columns.map(c => c.pk), [1, 2, 0, 0]);
    assert.ok(columns.every(c => c.notnull === 1));
    assert.equal(database.prepare("SELECT name FROM sqlite_master WHERE name = 'trade_position_management_transitions'").get(), undefined);
    const rows = managementRows(database);
    assert.equal(rows.length, database.prepare("SELECT COUNT(*) AS count FROM trade_exposures").get().count);
    const row = rows[0];
    for (const sql of [
      "UPDATE trade_position_management SET position_management_mode = 'AUTO' WHERE trade_id = ?",
      "DELETE FROM trade_position_management WHERE trade_id = ?",
      "UPDATE trade_position_management SET trade_id = 999 WHERE trade_id = ?"
    ]) assert.throws(() => database.prepare(sql).run(row.tradeId), /immutable/);
    assert.throws(() => database.prepare("INSERT OR REPLACE INTO trade_position_management (trade_id, trade_type, position_management_mode) VALUES (?, ?, 'AUTO')").run(row.tradeId, row.tradeType), /already assigned/);
    const clonedId = cloneSeedExposure(database);
    assert.throws(() => database.prepare("INSERT INTO trade_position_management (trade_id, trade_type, position_management_mode) VALUES (?, ?, 'INVALID')").run(clonedId, row.tradeType), /CHECK constraint/);
    database.prepare("INSERT INTO trade_position_management (trade_id, trade_type, position_management_mode) VALUES (?, ?, 'AUTO')").run(clonedId, row.tradeType);
    database.prepare("DELETE FROM trade_exposures WHERE trade_id = ?").run(clonedId);
    assert.equal(database.prepare("SELECT 1 FROM trade_position_management WHERE trade_id = ?").get(clonedId), undefined);
    assert.deepEqual(managementRows(database), rows);
  } finally { database.close(); }
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
  assert.deepEqual(
    new Set(legacyBackfill.rows.map(row => row.positionManagementMode)),
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
    contextUpdatePayload(clientContext, "MANUAL")
  ), 200);
  successfulBody(await request(
    "PUT",
    `/api/v1/pricing-rules/${clientRule.pricingRuleId}`,
    { positionManagementModeOverride: null }
  ), 200);

  successfulBody(await request("POST", "/api/v1/market-pulse-simulation/start"), 200);
  const inheritedAutoClient = successfulBody(await request("POST", "/api/v1/client-deal-generation/one"), 201);
  const inheritedAutoSnapshot = managementRow(
    databasePath,
    inheritedAutoClient.tradeId,
    "CLIENT_DEAL"
  );
  assert.equal(inheritedAutoSnapshot.positionManagementMode, "AUTO");

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
    ).positionManagementMode,
    "MANUAL"
  );

  const stateBeforeRemovedAction = managementRow(databasePath, overriddenManualClient.tradeId, "CLIENT_DEAL");
  const removedAction = await request("POST", "/api/v1/positions/move-to-auto-management", {
    trades: [{ tradeId: overriddenManualClient.tradeId, tradeType: "CLIENT_DEAL" }]
  });
  assert.equal(removedAction.handled, false);
  assert.deepEqual(managementRow(databasePath, overriddenManualClient.tradeId, "CLIENT_DEAL"), stateBeforeRemovedAction);
  assert.equal(withDatabase(databasePath, database => database.prepare(
    "SELECT 1 FROM sqlite_master WHERE name = 'trade_position_management_transitions'"
  ).get()), undefined);

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
    ).positionManagementMode,
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
    contextUpdatePayload(hedgeContext, "MANUAL")
  ), 200);
  successfulBody(await request(
    "PUT",
    `/api/v1/pricing-rules/${hedgeRule.pricingRuleId}`,
    { positionManagementModeOverride: null }
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
  assert.equal(overriddenAutoHedgeSnapshot.positionManagementMode, "AUTO");

  const manualTabHedge = successfulBody(
    await request("POST", "/api/v1/hedge-deals", {
      ...hedgeDealPayload,
      positionManagementMode: "MANUAL"
    }),
    201
  );
  assert.equal(
    managementRow(
        databasePath,
        manualTabHedge.tradeId,
        "HEDGE_DEAL"
      ).positionManagementMode,
    "MANUAL"
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
    { positionManagementModeOverride: null }
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
  assert.equal(
    managementRow(
        databasePath,
        autoTabHedge.tradeId,
        "HEDGE_DEAL"
      ).positionManagementMode,
    "AUTO"
  );

  const positions = successfulBody(
    await request("GET", "/api/v1/positions"),
    200
  );
  assert.ok(positions.length > 0);
  assert.ok(positions.every(position =>
    position.positionManagementMode === "MANUAL"
      || position.positionManagementMode === "AUTO"
  ));
  assert.ok(positions.every(position =>
    !Object.hasOwn(position, "initialPositionManagementMode")
      && !Object.hasOwn(position, "currentPositionManagementMode")
      && !Object.hasOwn(position, "positionManagementModeChangedAt")
  ));

  const expectedModes = new Map([
    [`${inheritedAutoClient.tradeId}:CLIENT_DEAL`, "AUTO"],
    [`${overriddenManualClient.tradeId}:CLIENT_DEAL`, "MANUAL"],
    [`${manualFallbackClient.tradeId}:CLIENT_DEAL`, "MANUAL"],
    [`${overriddenAutoHedge.tradeId}:HEDGE_DEAL`, "AUTO"],
    [`${manualTabHedge.tradeId}:HEDGE_DEAL`, "MANUAL"],
    [`${autoTabHedge.tradeId}:HEDGE_DEAL`, "AUTO"]
  ]);
  positions.forEach(position => {
    const key = `${position.tradeId}:${position.tradeType}`;

    if (expectedModes.has(key)) {
      assert.equal(position.positionManagementMode, expectedModes.get(key));
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
  assert.equal(
    managementRow(
        databasePath,
        autoPositionOutTradeId,
        "BATCH_POSITION_OUT"
      ).positionManagementMode,
    "AUTO"
  );
  assert.equal(
    managementRow(
        databasePath,
        autoBalanceTradeId,
        "BATCH_BALANCE_TRADE"
      ).positionManagementMode,
    "AUTO"
  );
  assert.throws(
    () => withDatabase(databasePath, database => database.prepare(`
      UPDATE trade_position_management
      SET position_management_mode = 'MANUAL'
      WHERE trade_id = ? AND trade_type = 'BATCH_BALANCE_TRADE'
    `).run(autoBalanceTradeId)),
    /Trade Position Management Mode is immutable/
  );
  assert.throws(
    () => withDatabase(databasePath, database => database.prepare(`
      DELETE FROM trade_position_management
      WHERE trade_id = ? AND trade_type = 'BATCH_BALANCE_TRADE'
    `).run(autoBalanceTradeId)),
    /Trade Position Management Mode is immutable/
  );
  const manualSourceBatch = successfulBody(await request("POST", "/api/v1/batches", {
    idempotencyKey: "position-mode-manual-source", tradeIds: [overriddenManualClient.tradeId]
  }), 201);
  const manualPositionOutTradeId = batchMemberTradeId(databasePath, manualSourceBatch.batchId, "POSITION_OUT");
  const positionsAfterBatching = successfulBody(
    await request("GET", "/api/v1/positions"),
    200
  );
  assert.equal(
    positionsAfterBatching.find(position =>
      position.tradeId === autoPositionOutTradeId
      && position.tradeType === "BATCH_POSITION_OUT"
    )?.positionManagementMode,
    "AUTO"
  );
  assert.equal(
    positionsAfterBatching.find(position =>
      position.tradeId === manualPositionOutTradeId
      && position.tradeType === "BATCH_POSITION_OUT"
    )?.positionManagementMode,
    "MANUAL"
  );

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
  assert.deepEqual(managementAfterRestart, legacyManagementBeforeRestart);
});
