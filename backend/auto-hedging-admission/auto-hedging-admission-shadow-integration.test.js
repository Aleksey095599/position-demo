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
const TEMPORARY_DIRECTORY_PREFIX = "position-auto-hedging-shadow-";

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

function clientDealPayload(rule, suffix) {
  return {
    executionTimestamp: `2026-08-23T12:00:${String(suffix).padStart(2, "0")}.000Z`,
    counterpartyId: rule.counterpartyId,
    executionContextId: rule.executionContextId,
    pricingRuleId: rule.pricingRuleId,
    tradeDate: "2026-08-23",
    ccyPairCode: rule.ccyPairCode,
    side: "BUY",
    dealtCcyCode: "EUR",
    dealtCcyAmount: "1000.00",
    tradeRate: "1.1234",
    tenor: "TOD",
    baseCcyValueDate: "2026-08-23",
    quoteCcyValueDate: "2026-08-23",
    marketPulseStreamStatus: "RUNNING",
    marketPulseBid: "1.1234",
    marketPulseOffer: "1.1234",
    marketPulseTimestamp: `2026-08-23T12:00:${String(suffix).padStart(2, "0")}.000Z`
  };
}

test("CLIENT_DEAL creation records a non-enforcing immutable shadow decision", async t => {
  const temporaryDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), TEMPORARY_DIRECTORY_PREFIX)
  );
  const databasePath = path.join(temporaryDirectory, "shadow.sqlite");
  const previousDatabasePath = process.env.DEMO_DATABASE_PATH;
  let closeDatabase = null;
  let inspectionDatabase = null;

  t.after(() => {
    try {
      inspectionDatabase?.close();
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
  legacyDatabase.exec(fs.readFileSync(SCHEMA_PATH, "utf8"));
  legacyDatabase.exec(fs.readFileSync(SEED_PATH, "utf8"));
  legacyDatabase.exec(`
    DROP TRIGGER trg_fx_auto_hedging_admission_decisions_immutable_update;
    DROP TRIGGER trg_fx_auto_hedging_admission_decisions_immutable_delete;
    DROP TABLE fx_auto_hedging_admission_decisions;
  `);
  legacyDatabase.close();

  process.env.DEMO_DATABASE_PATH = databasePath;
  const server = require(SERVER_PATH);
  closeDatabase = server.closeDatabase;
  const request = apiClient(server.handleApi);
  inspectionDatabase = new DatabaseSync(databasePath);
  inspectionDatabase.exec("PRAGMA foreign_keys = ON");

  assert.ok(inspectionDatabase.prepare(`
    SELECT 1
    FROM sqlite_master
    WHERE type = 'table'
      AND name = 'fx_auto_hedging_admission_decisions'
  `).get());

  const pricingRulesResponse = await request("GET", "/api/v1/pricing-rules");
  assert.equal(pricingRulesResponse.statusCode, 200);
  const rule = pricingRulesResponse.body.find(candidate =>
    candidate.pricingMode === "DEALER_PRICED"
    && candidate.ccyPairCode === "EUR_USD"
    && candidate.counterpartyRoles.includes("CLIENT")
  );
  assert.ok(rule);

  const contextsResponse = await request("GET", "/api/v1/execution-contexts");
  const context = contextsResponse.body.find(candidate =>
    candidate.executionContextId === rule.executionContextId
  );
  assert.equal(context.autoHedgingAdmissionMode, "MANUAL_ONLY");

  const contextUpdateResponse = await request(
    "PUT",
    `/api/v1/execution-contexts/${context.executionContextId}`,
    {
      servicingLocationId: context.servicingLocationId,
      accountingSystemId: context.accountingSystemId,
      executionSystemId: context.executionSystemId,
      defaultPositionManagementMode: "AUTO",
      autoHedgingAdmissionMode: "REVIEW_REQUIRED"
    }
  );
  assert.equal(contextUpdateResponse.statusCode, 200);
  const ruleUpdateResponse = await request(
    "PUT",
    `/api/v1/pricing-rules/${rule.pricingRuleId}`,
    { positionManagementModeOverride: null }
  );
  assert.equal(ruleUpdateResponse.statusCode, 200);

  const created = await request(
    "POST",
    "/api/v1/client-fx-deals",
    clientDealPayload(rule, 1)
  );
  assert.equal(created.handled, true);
  assert.equal(created.statusCode, 201, JSON.stringify(created.body));
  assert.equal(created.body.initialFxPositionMode, "AUTO");
  assert.equal(created.body.currentFxPositionMode, "AUTO");

  const audit = inspectionDatabase.prepare(`
    SELECT
      decision_sequence AS decisionSequence,
      decision_stage AS decisionStage,
      policy_revision AS policyRevision,
      admission_mode AS admissionMode,
      admission_state AS admissionState,
      releasable,
      reason_codes_json AS reasonCodesJson,
      checks_json AS checksJson,
      is_enforced AS isEnforced
    FROM fx_auto_hedging_admission_decisions
    WHERE trade_id = ? AND trade_type = 'CLIENT_DEAL'
  `).get(created.body.tradeId);
  assert.ok(audit);
  assert.equal(audit.decisionSequence, 1);
  assert.equal(audit.decisionStage, "INITIAL");
  assert.equal(audit.policyRevision, 1);
  assert.equal(audit.admissionMode, "REVIEW_REQUIRED");
  assert.equal(audit.admissionState, "HELD");
  assert.equal(audit.releasable, 1);
  assert.equal(audit.isEnforced, 0);
  assert.deepEqual(JSON.parse(audit.reasonCodesJson), ["REVIEW_REQUIRED"]);
  const checks = JSON.parse(audit.checksJson);
  assert.deepEqual(checks, []);

  const admissionOverrideResponse = await request(
    "PUT",
    `/api/v1/pricing-rules/${rule.pricingRuleId}`,
    { autoHedgingAdmissionModeOverride: "MANUAL_ONLY" }
  );
  assert.equal(admissionOverrideResponse.statusCode, 200);
  assert.equal(
    admissionOverrideResponse.body.effectiveAutoHedgingAdmissionMode,
    "MANUAL_ONLY"
  );
  const createdWithAdmissionOverride = await request(
    "POST",
    "/api/v1/client-fx-deals",
    clientDealPayload(rule, 2)
  );
  assert.equal(createdWithAdmissionOverride.statusCode, 201);
  assert.equal(createdWithAdmissionOverride.body.currentFxPositionMode, "AUTO");
  const overriddenAudit = inspectionDatabase.prepare(`
    SELECT
      admission_mode AS admissionMode,
      admission_state AS admissionState,
      releasable,
      reason_codes_json AS reasonCodesJson
    FROM fx_auto_hedging_admission_decisions
    WHERE trade_id = ? AND trade_type = 'CLIENT_DEAL'
  `).get(createdWithAdmissionOverride.body.tradeId);
  assert.equal(overriddenAudit.admissionMode, "MANUAL_ONLY");
  assert.equal(overriddenAudit.admissionState, "HELD");
  assert.equal(overriddenAudit.releasable, 0);
  assert.deepEqual(JSON.parse(overriddenAudit.reasonCodesJson), ["MANUAL_ONLY"]);

  assert.throws(() => inspectionDatabase.prepare(`
    UPDATE fx_auto_hedging_admission_decisions
    SET is_enforced = 0
    WHERE trade_id = ?
  `).run(created.body.tradeId), /FX_AUTO_HEDGING_ADMISSION_DECISION_IMMUTABLE/);
  assert.throws(() => inspectionDatabase.prepare(`
    DELETE FROM fx_auto_hedging_admission_decisions
    WHERE trade_id = ?
  `).run(created.body.tradeId), /FX_AUTO_HEDGING_ADMISSION_DECISION_IMMUTABLE/);

  inspectionDatabase.exec(`
    CREATE TRIGGER test_block_shadow_admission_insert
    BEFORE INSERT ON fx_auto_hedging_admission_decisions
    FOR EACH ROW
    BEGIN
      SELECT RAISE(ABORT, 'TEST_SHADOW_WRITE_FAILED');
    END;
  `);
  const createdWhileShadowFails = await request(
    "POST",
    "/api/v1/client-fx-deals",
    clientDealPayload(rule, 3)
  );
  assert.equal(createdWhileShadowFails.statusCode, 201);
  assert.equal(createdWhileShadowFails.body.currentFxPositionMode, "AUTO");
  assert.equal(
    inspectionDatabase.prepare(`
      SELECT COUNT(*) AS count
      FROM fx_auto_hedging_admission_decisions
      WHERE trade_id = ?
    `).get(createdWhileShadowFails.body.tradeId).count,
    0
  );
  assert.equal(
    inspectionDatabase.prepare(`
      SELECT COUNT(*) AS count
      FROM client_fx_deals
      WHERE trade_id = ?
    `).get(createdWhileShadowFails.body.tradeId).count,
    1
  );
  inspectionDatabase.exec("DROP TRIGGER test_block_shadow_admission_insert");
});
