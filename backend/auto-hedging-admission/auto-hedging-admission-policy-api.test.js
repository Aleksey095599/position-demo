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
const TEMPORARY_DIRECTORY_PREFIX = "position-auto-hedging-admission-policy-";

function freshSeededDatabase() {
  const database = new DatabaseSync(":memory:");
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

test("fresh schema seeds an immutable, fail-closed Auto Hedging Admission Policy", () => {
  const database = freshSeededDatabase();

  try {
    const executionContextColumns = database.prepare(
      "PRAGMA table_info(execution_contexts)"
    ).all().map(column => column.name);
    assert.ok(executionContextColumns.includes("auto_hedging_admission_mode"));
    assert.ok(!executionContextColumns.includes("auto_hedging_admission_policy"));

    assert.deepEqual(
      { ...database.prepare(`
        SELECT revision, max_transfer_rate_deviation_percent AS maxDeviation
        FROM auto_hedging_admission_policy_revisions
      `).get() },
      { revision: 1, maxDeviation: "1.00" }
    );
    assert.deepEqual(
      database.prepare(`
        SELECT
          ccy_pair_code AS ccyPairCode,
          max_base_ccy_amount_minor AS maxAmountMinor,
          base_ccy_fraction_digits AS fractionDigits
        FROM auto_hedging_admission_policy_pair_rules
        ORDER BY ccy_pair_code
      `).all().map(row => ({ ...row })),
      [
        { ccyPairCode: "EUR_USD", maxAmountMinor: 10000000000, fractionDigits: 2 },
        { ccyPairCode: "GBP_USD", maxAmountMinor: 10000000000, fractionDigits: 2 }
      ]
    );
    assert.equal(
      database.prepare(`
        SELECT revision
        FROM auto_hedging_admission_policy_current
        WHERE policy_id = 1
      `).get().revision,
      1
    );

    assert.throws(() => database.prepare(`
      UPDATE auto_hedging_admission_policy_revisions
      SET max_transfer_rate_deviation_percent = '2.00'
      WHERE revision = 1
    `).run(), /AUTO_HEDGING_ADMISSION_POLICY_REVISION_IMMUTABLE/);
    assert.throws(() => database.prepare(`
      INSERT INTO auto_hedging_admission_policy_pair_rules
        (revision, ccy_pair_code, max_base_ccy_amount_minor, base_ccy_fraction_digits)
      VALUES (1, 'USD_RUB', 10000, 2)
    `).run(), /AUTO_HEDGING_ADMISSION_POLICY_REVISION_IMMUTABLE/);
    assert.throws(() => database.prepare(`
      UPDATE execution_contexts
      SET auto_hedging_admission_mode = 'AUTO_IF_ELIGIBLE'
      WHERE execution_system_id = 'RFQ'
    `).run(), /AUTO_IF_ELIGIBLE_REQUIRES_AUTO_PRICED_EXECUTION_SYSTEM/);
  } finally {
    database.close();
  }
});

test("startup migrates Admission Policy to Mode and API publishes versioned policy revisions", async t => {
  const temporaryDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), TEMPORARY_DIRECTORY_PREFIX)
  );
  const databasePath = path.join(temporaryDirectory, "policy.sqlite");
  const previousDatabasePath = process.env.DEMO_DATABASE_PATH;
  let closeDatabase = null;
  let migratedDatabase = null;

  t.after(() => {
    try {
      migratedDatabase?.close();
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

  const legacyDatabase = new DatabaseSync(databasePath);
  legacyDatabase.exec("PRAGMA foreign_keys = ON");
  legacyDatabase.exec(
    fs.readFileSync(SCHEMA_PATH, "utf8")
      .replaceAll("auto_hedging_admission_mode", "auto_hedging_admission_policy")
  );
  legacyDatabase.exec(
    fs.readFileSync(SEED_PATH, "utf8")
      .replaceAll("auto_hedging_admission_mode", "auto_hedging_admission_policy")
  );
  legacyDatabase.prepare(`
    UPDATE execution_contexts
    SET auto_hedging_admission_policy = 'REVIEW_REQUIRED'
    WHERE execution_context_id = 2
  `).run();
  legacyDatabase.prepare(`
    UPDATE ui_table_column_settings
    SET width_px = 333
    WHERE table_key = 'execution_contexts_grid'
      AND column_key = 'auto_hedging_admission_policy'
  `).run();
  legacyDatabase.close();

  process.env.DEMO_DATABASE_PATH = databasePath;
  const server = require(SERVER_PATH);
  closeDatabase = server.closeDatabase;
  const request = apiClient(server.handleApi);

  migratedDatabase = new DatabaseSync(databasePath);
  migratedDatabase.exec("PRAGMA foreign_keys = ON");

  const migratedColumns = migratedDatabase.prepare(
    "PRAGMA table_info(execution_contexts)"
  ).all().map(column => column.name);
  assert.ok(migratedColumns.includes("auto_hedging_admission_mode"));
  assert.ok(!migratedColumns.includes("auto_hedging_admission_policy"));
  assert.equal(
    migratedDatabase.prepare(`
      SELECT auto_hedging_admission_mode AS mode
      FROM execution_contexts
      WHERE execution_context_id = 2
    `).get().mode,
    "REVIEW_REQUIRED"
  );
  assert.deepEqual(
    { ...migratedDatabase.prepare(`
      SELECT column_key AS columnKey, width_px AS widthPx
      FROM ui_table_column_settings
      WHERE table_key = 'execution_contexts_grid'
        AND column_key = 'auto_hedging_admission_mode'
    `).get() },
    { columnKey: "auto_hedging_admission_mode", widthPx: 333 }
  );

  const contextsResponse = await request("GET", "/api/v1/execution-contexts");
  assert.equal(contextsResponse.statusCode, 200);
  assert.equal(
    contextsResponse.body.find(context => context.executionContextId === 2)
      .autoHedgingAdmissionMode,
    "REVIEW_REQUIRED"
  );
  assert.equal(server.executionContextAdmissionMode(2), "REVIEW_REQUIRED");

  const invalidModeResponse = await request("POST", "/api/v1/execution-contexts", {
    servicingLocationId: "000",
    accountingSystemId: "AFINA",
    executionSystemId: "RFQ",
    autoHedgingAdmissionMode: "AUTO_IF_ELIGIBLE"
  });
  assert.equal(invalidModeResponse.statusCode, 400);
  assert.equal(invalidModeResponse.body.code, "INVALID_EXECUTION_CONTEXT");

  const initialPolicyResponse = await request(
    "GET",
    "/api/v1/auto-hedging-admission-policy"
  );
  assert.equal(initialPolicyResponse.handled, true);
  assert.equal(initialPolicyResponse.statusCode, 200);
  assert.deepEqual(
    Object.keys(initialPolicyResponse.body),
    ["revision", "maxTransferRateDeviationPercent", "currencyPairs"]
  );
  assert.equal(initialPolicyResponse.body.revision, 1);
  assert.equal(initialPolicyResponse.body.maxTransferRateDeviationPercent, "1.00");
  assert.deepEqual(
    initialPolicyResponse.body.currencyPairs.map(pair => ({
      code: pair.ccyPairCode,
      enabled: pair.enabled,
      amount: pair.maxBaseCcyAmount
    })),
    [
      { code: "EUR_USD", enabled: true, amount: "100000000.00" },
      { code: "GBP_USD", enabled: true, amount: "100000000.00" },
      { code: "USD_RUB", enabled: false, amount: null }
    ]
  );

  migratedDatabase.prepare(`
    INSERT INTO ccy_pair_options
      (ccy_pair_code, base_ccy_code, quote_ccy_code, default_quote_decimals)
    VALUES ('EUR_GBP', 'EUR', 'GBP', 4)
  `).run();
  const policyWithNewPair = (await request(
    "GET",
    "/api/v1/auto-hedging-admission-policy"
  )).body;
  assert.deepEqual(
    policyWithNewPair.currencyPairs.find(pair => pair.ccyPairCode === "EUR_GBP"),
    {
      ccyPairCode: "EUR_GBP",
      currencyPair: "EUR/GBP",
      baseCcyCode: "EUR",
      baseCcyFractionDigits: 2,
      enabled: false,
      maxBaseCcyAmount: null
    }
  );

  const updatedPolicyResponse = await request(
    "PUT",
    "/api/v1/auto-hedging-admission-policy",
    {
      expectedRevision: 1,
      maxTransferRateDeviationPercent: "0.75",
      currencyPairs: [
        { ccyPairCode: "EUR_GBP", enabled: false, maxBaseCcyAmount: null },
        { ccyPairCode: "EUR_USD", enabled: true, maxBaseCcyAmount: "125000000.50" },
        { ccyPairCode: "GBP_USD", enabled: false, maxBaseCcyAmount: null },
        { ccyPairCode: "USD_RUB", enabled: true, maxBaseCcyAmount: "5000000.00" }
      ]
    }
  );
  assert.equal(updatedPolicyResponse.statusCode, 200);
  assert.equal(updatedPolicyResponse.body.revision, 2);
  assert.equal(updatedPolicyResponse.body.maxTransferRateDeviationPercent, "0.75");
  assert.deepEqual(
    updatedPolicyResponse.body.currencyPairs.map(pair => ({
      code: pair.ccyPairCode,
      enabled: pair.enabled,
      amount: pair.maxBaseCcyAmount
    })),
    [
      { code: "EUR_GBP", enabled: false, amount: null },
      { code: "EUR_USD", enabled: true, amount: "125000000.50" },
      { code: "GBP_USD", enabled: false, amount: null },
      { code: "USD_RUB", enabled: true, amount: "5000000.00" }
    ]
  );
  assert.deepEqual(server.autoHedgingAdmissionPolicy(), updatedPolicyResponse.body);

  const staleResponse = await request(
    "PUT",
    "/api/v1/auto-hedging-admission-policy",
    {
      expectedRevision: 1,
      maxTransferRateDeviationPercent: "0.50",
      currencyPairs: updatedPolicyResponse.body.currencyPairs.map(pair => ({
        ccyPairCode: pair.ccyPairCode,
        enabled: pair.enabled,
        maxBaseCcyAmount: pair.maxBaseCcyAmount
      }))
    }
  );
  assert.equal(staleResponse.statusCode, 409);
  assert.equal(staleResponse.body.code, "AUTO_HEDGING_ADMISSION_POLICY_REVISION_CONFLICT");
  assert.equal(staleResponse.body.currentRevision, 2);

  const invalidPayloads = [
    null,
    { expectedRevision: 2, maxTransferRateDeviationPercent: 1, currencyPairs: [] },
    { expectedRevision: 2, maxTransferRateDeviationPercent: "100.01", currencyPairs: [] },
    { expectedRevision: 2, maxTransferRateDeviationPercent: "1.00", currencyPairs: [] },
    {
      expectedRevision: 2,
      maxTransferRateDeviationPercent: "1.00",
      currencyPairs: [{ ccyPairCode: "UNKNOWN", enabled: false, maxBaseCcyAmount: null }]
    },
    {
      expectedRevision: 2,
      maxTransferRateDeviationPercent: "1.00",
      currencyPairs: [
        { ccyPairCode: "EUR_USD", enabled: false, maxBaseCcyAmount: null },
        { ccyPairCode: "EUR_USD", enabled: false, maxBaseCcyAmount: null }
      ]
    },
    {
      expectedRevision: 2,
      maxTransferRateDeviationPercent: "1.00",
      currencyPairs: [{ ccyPairCode: "EUR_USD", enabled: true, maxBaseCcyAmount: "1.001" }]
    }
  ];

  for (const invalidPayload of invalidPayloads) {
    const invalidResponse = await request(
      "PUT",
      "/api/v1/auto-hedging-admission-policy",
      invalidPayload
    );
    assert.equal(invalidResponse.statusCode, 400);
    assert.equal(invalidResponse.body.code, "INVALID_AUTO_HEDGING_ADMISSION_POLICY");
  }

  assert.throws(() => migratedDatabase.prepare(`
    DELETE FROM auto_hedging_admission_policy_pair_rules
    WHERE revision = 1 AND ccy_pair_code = 'EUR_USD'
  `).run(), /AUTO_HEDGING_ADMISSION_POLICY_REVISION_IMMUTABLE/);
  assert.equal(
    migratedDatabase.prepare(`
      SELECT COUNT(*) AS count
      FROM auto_hedging_admission_policy_revisions
    `).get().count,
    2
  );
  assert.equal(
    migratedDatabase.prepare(`
      SELECT revision
      FROM auto_hedging_admission_policy_current
      WHERE policy_id = 1
    `).get().revision,
    2
  );
});
