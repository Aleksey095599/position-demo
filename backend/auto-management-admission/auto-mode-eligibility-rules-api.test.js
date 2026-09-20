"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { DatabaseSync } = require("node:sqlite");

const ROOT = path.resolve(__dirname, "..", "..");
const SERVER_PATH = path.join(ROOT, "server.js");
const SCHEMA_PATH = path.join(ROOT, "schema.sql");
const SEED_PATH = path.join(ROOT, "seed.sql");
const TEMPORARY_DIRECTORY_PREFIX = "position-auto-mode-eligibility-";

function createSeededDatabase(databasePath = ":memory:") {
  const database = new DatabaseSync(databasePath);
  database.exec("PRAGMA foreign_keys = ON");
  database.exec(fs.readFileSync(SCHEMA_PATH, "utf8"));
  database.exec(fs.readFileSync(SEED_PATH, "utf8"));
  return database;
}

function removeOwnedTemporaryDirectory(temporaryDirectory) {
  const temporaryRoot = path.resolve(os.tmpdir());
  const resolvedDirectory = path.resolve(temporaryDirectory);
  const relativeDirectory = path.relative(temporaryRoot, resolvedDirectory);

  assert.ok(relativeDirectory && !relativeDirectory.startsWith(".."));
  assert.equal(path.isAbsolute(relativeDirectory), false);
  assert.match(path.basename(resolvedDirectory), new RegExp(`^${TEMPORARY_DIRECTORY_PREFIX}`));
  fs.rmSync(resolvedDirectory, { recursive: true, force: true });
}

function apiClient(handleApi) {
  return async function request(method, pathname, body) {
    let statusCode = 0;
    let responseBody = "";
    const serializedBody = body === undefined ? "" : JSON.stringify(body);
    const request = {
      method,
      async *[Symbol.asyncIterator]() {
        if (serializedBody) yield Buffer.from(serializedBody, "utf8");
      }
    };
    const response = {
      writeHead(code) { statusCode = code; },
      end(chunk = "") { responseBody += chunk; }
    };
    const handled = await handleApi(
      request,
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

test("fresh schema stores one current Auto Mode Eligibility matrix", () => {
  const database = createSeededDatabase();
  try {
    assert.deepEqual(
      database.prepare("PRAGMA table_info(auto_mode_eligibility_rules)").all()
        .map(column => column.name),
      [
        "trade_type",
        "ccy_pair_code",
        "is_eligible",
        "max_base_ccy_amount_minor",
        "max_transfer_rate_deviation_percent"
      ]
    );
    assert.deepEqual(
      database.prepare(`
        SELECT name
        FROM sqlite_master
        WHERE type = 'table'
          AND name LIKE 'auto_management_admission_policy_%'
      `).all(),
      []
    );
    assert.equal(
      database.prepare("SELECT COUNT(*) AS count FROM auto_mode_eligibility_rules").get().count,
      9
    );
    assert.deepEqual(
      database.prepare(`
        SELECT trade_type AS tradeType, COUNT(*) AS eligiblePairs
        FROM auto_mode_eligibility_rules
        WHERE is_eligible = 1
        GROUP BY trade_type
        ORDER BY trade_type
      `).all().map(row => ({ ...row })),
      [
        { tradeType: "CLIENT_DEAL", eligiblePairs: 2 },
        { tradeType: "HEDGE_DEAL", eligiblePairs: 2 }
      ]
    );
    assert.equal(
      database.prepare("PRAGMA table_info(auto_management_admission_decisions)").all()
        .some(column => column.name === "policy_revision"),
      false
    );
    assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    database.close();
  }
});

test("rules API replaces one Trade Type without revisions", async t => {
  const temporaryDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), TEMPORARY_DIRECTORY_PREFIX)
  );
  const databasePath = path.join(temporaryDirectory, "eligibility.sqlite");
  const previousDatabasePath = process.env.DEMO_DATABASE_PATH;
  let closeDatabase;
  let inspectionDatabase;

  t.after(() => {
    inspectionDatabase?.close();
    closeDatabase?.();
    if (previousDatabasePath === undefined) delete process.env.DEMO_DATABASE_PATH;
    else process.env.DEMO_DATABASE_PATH = previousDatabasePath;
    removeOwnedTemporaryDirectory(temporaryDirectory);
  });

  createSeededDatabase(databasePath).close();
  process.env.DEMO_DATABASE_PATH = databasePath;
  const server = require(SERVER_PATH);
  closeDatabase = server.closeDatabase;
  const request = apiClient(server.handleApi);
  inspectionDatabase = new DatabaseSync(databasePath);
  inspectionDatabase.exec("PRAGMA foreign_keys = ON");

  const initial = await request("GET", "/api/v1/auto-mode-eligibility-rules");
  assert.equal(initial.statusCode, 200);
  assert.equal(Object.hasOwn(initial.body, "revision"), false);
  assert.equal(initial.body.tradeType, "CLIENT_DEAL");

  const matrix = await request(
    "GET",
    "/api/v1/auto-mode-eligibility-rules?scope=all"
  );
  assert.equal(matrix.statusCode, 200);
  assert.deepEqual(
    matrix.body.ruleSets.map(ruleSet => ruleSet.tradeType),
    ["CLIENT_DEAL", "HEDGE_DEAL", "BATCH_POSITION_OUT"]
  );
  matrix.body.ruleSets
    .filter(ruleSet => ruleSet.tradeType.startsWith("BATCH_"))
    .forEach(ruleSet => {
      assert.equal(ruleSet.currencyPairs.every(pair => pair.enabled === false), true);
    });

  const replacement = {
    tradeType: "CLIENT_DEAL",
    currencyPairs: initial.body.currencyPairs.map(pair => pair.ccyPairCode === "EUR_USD"
      ? {
          ...pair,
          enabled: true,
          maxBaseCcyAmount: "1234.56",
          maxTransferRateDeviationPercent: "2.50"
        }
      : {
          ...pair,
          enabled: false,
          maxBaseCcyAmount: null,
          maxTransferRateDeviationPercent: null
        })
  };
  const saved = await request("PUT", "/api/v1/auto-mode-eligibility-rules", replacement);
  assert.equal(saved.statusCode, 200, JSON.stringify(saved.body));
  assert.equal(Object.hasOwn(saved.body, "revision"), false);
  assert.equal(saved.body.currencyPairs.filter(pair => pair.enabled).length, 1);
  assert.deepEqual(
    { ...inspectionDatabase.prepare(`
      SELECT
        is_eligible AS isEligible,
        max_base_ccy_amount_minor AS maxAmountMinor,
        max_transfer_rate_deviation_percent AS maxDeviation
      FROM auto_mode_eligibility_rules
      WHERE trade_type = 'CLIENT_DEAL' AND ccy_pair_code = 'EUR_USD'
    `).get() },
    { isEligible: 1, maxAmountMinor: 123456, maxDeviation: "2.50" }
  );
  assert.equal(
    inspectionDatabase.prepare(`
      SELECT COUNT(*) AS count
      FROM auto_mode_eligibility_rules
      WHERE trade_type = 'HEDGE_DEAL' AND is_eligible = 1
    `).get().count,
    2
  );
});
