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
const TEMPORARY_DIRECTORY_PREFIX = "position-admission-enforcement-";

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
    tradeContextId: rule.tradeContextId,
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

test("Admission governs trade creation and release atomically", async t => {
  const temporaryDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), TEMPORARY_DIRECTORY_PREFIX)
  );
  const databasePath = path.join(temporaryDirectory, "enforcement.sqlite");
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
    DROP TRIGGER trg_auto_management_admission_decisions_immutable_update;
    DROP TRIGGER trg_auto_management_admission_decisions_immutable_delete;
    DROP TABLE auto_management_admission_decisions;
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
      AND name = 'auto_management_admission_decisions'
  `).get());

  const pricingRulesResponse = await request("GET", "/api/v1/pricing-rules");
  assert.equal(pricingRulesResponse.statusCode, 200);
  const rule = pricingRulesResponse.body.find(candidate =>
    candidate.pricingMode === "DEALER_PRICED"
    && candidate.ccyPairCode === "EUR_USD"
    && candidate.counterpartyRoles.includes("CLIENT")
  );
  assert.ok(rule);

  const contextsResponse = await request("GET", "/api/v1/trade-contexts");
  const context = contextsResponse.body.find(candidate =>
    candidate.tradeContextId === rule.tradeContextId
  );
  assert.equal(context.autoManagementAdmissionMode, "REVIEW_REQUIRED");

  const contextUpdateResponse = await request(
    "PUT",
    `/api/v1/trade-contexts/${context.tradeContextId}`,
    {
      servicingLocationId: context.servicingLocationId,
      accountingSystemId: context.accountingSystemId,
      originatingSystemId: context.originatingSystemId,
      autoManagementAdmissionMode: "REVIEW_REQUIRED"
    }
  );
  assert.equal(contextUpdateResponse.statusCode, 200);
  const ruleUpdateResponse = await request(
    "PUT",
    `/api/v1/pricing-rules/${rule.pricingRuleId}`,
    { autoManagementAdmissionModeOverride: null }
  );
  assert.equal(ruleUpdateResponse.statusCode, 200);

  const created = await request(
    "POST",
    "/api/v1/client-deals",
    clientDealPayload(rule, 1)
  );
  assert.equal(created.handled, true);
  assert.equal(created.statusCode, 201, JSON.stringify(created.body));
  assert.equal(created.body.initialPositionManagementMode, "MANUAL");
  assert.equal(created.body.currentPositionManagementMode, "MANUAL");

  const audit = inspectionDatabase.prepare(`
    SELECT
      decision_sequence AS decisionSequence,
      decision_stage AS decisionStage,
      admission_mode AS admissionMode,
      admission_state AS admissionState,
      releasable,
      reason_codes_json AS reasonCodesJson,
      checks_json AS checksJson,
      is_enforced AS isEnforced
    FROM auto_management_admission_decisions
    WHERE trade_id = ? AND trade_type = 'CLIENT_DEAL'
  `).get(created.body.tradeId);
  assert.ok(audit);
  assert.equal(audit.decisionSequence, 1);
  assert.equal(audit.decisionStage, "INITIAL");
  assert.equal(audit.admissionMode, "REVIEW_REQUIRED");
  assert.equal(audit.admissionState, "HELD");
  assert.equal(audit.releasable, 1);
  assert.equal(audit.isEnforced, 1);
  assert.deepEqual(JSON.parse(audit.reasonCodesJson), ["REVIEW_REQUIRED"]);
  const checks = JSON.parse(audit.checksJson);
  assert.deepEqual(checks, []);

  const admissionOverrideResponse = await request(
    "PUT",
    `/api/v1/pricing-rules/${rule.pricingRuleId}`,
    { autoManagementAdmissionModeOverride: "REVIEW_REQUIRED" }
  );
  assert.equal(admissionOverrideResponse.statusCode, 200);
  assert.equal(
    admissionOverrideResponse.body.effectiveAutoManagementAdmissionMode,
    "REVIEW_REQUIRED"
  );
  const createdWithAdmissionOverride = await request(
    "POST",
    "/api/v1/client-deals",
    clientDealPayload(rule, 2)
  );
  assert.equal(createdWithAdmissionOverride.statusCode, 201);
  assert.equal(createdWithAdmissionOverride.body.currentPositionManagementMode, "MANUAL");
  const overriddenAudit = inspectionDatabase.prepare(`
    SELECT
      admission_mode AS admissionMode,
      admission_state AS admissionState,
      releasable,
      reason_codes_json AS reasonCodesJson
    FROM auto_management_admission_decisions
    WHERE trade_id = ? AND trade_type = 'CLIENT_DEAL'
  `).get(createdWithAdmissionOverride.body.tradeId);
  assert.equal(overriddenAudit.admissionMode, "REVIEW_REQUIRED");
  assert.equal(overriddenAudit.admissionState, "HELD");
  assert.equal(overriddenAudit.releasable, 1);
  assert.deepEqual(JSON.parse(overriddenAudit.reasonCodesJson), ["REVIEW_REQUIRED"]);

  const move = trades => request("POST", "/api/v1/positions/move-to-auto-management", { trades });
  const identity = deal => ({ tradeId: deal.tradeId, tradeType: "CLIENT_DEAL" });
  const reasons = deal => JSON.parse(inspectionDatabase.prepare(`
    SELECT reason_codes_json AS reasons FROM auto_management_admission_decisions
    WHERE trade_id = ? ORDER BY decision_sequence DESC LIMIT 1
  `).get(deal.tradeId).reasons);
  const expectCreated = async (endpoint, payload) => {
    const response = await request("POST", endpoint, payload);
    assert.equal(response.statusCode, 201, JSON.stringify(response.body));
    return response.body;
  };
  await t.test("release checks market data without reapplying REVIEW_REQUIRED routing", async () => {
    const blocked = await move([identity(created.body)]);
    assert.equal(blocked.statusCode, 409);
    assert.match(blocked.body.message, /MARKET_PULSE_UNAVAILABLE/);
    assert.doesNotMatch(blocked.body.message, /REVIEW_REQUIRED/);
  });

  const unassigned = await expectCreated("/api/v1/client-deals", {
    ...clientDealPayload(rule, 10), pricingRuleId: null, tradeContextId: null,
    manualPricingReason: "CLIENT_ONBOARDING", transferRate: "1.1234"
  });
  assert.equal(unassigned.currentPositionManagementMode, "MANUAL");
  const overLimit = await expectCreated("/api/v1/client-deals", {
    ...clientDealPayload(rule, 13), dealtCcyAmount: "100000001.00"
  });
  await request("POST", "/api/v1/market-pulse-simulation/start");
  await t.test("one inadmissible trade rolls back the full release selection", async () => {
    const rejected = await move([identity(created.body), identity(overLimit)]);
    assert.equal(rejected.statusCode, 409);
    assert.match(rejected.body.message, /TRADE_AMOUNT_LIMIT_EXCEEDED/);
    assert.equal(inspectionDatabase.prepare(`SELECT current_position_management_mode AS mode
      FROM trade_position_management WHERE trade_id = ?`).get(created.body.tradeId).mode, "MANUAL");
    assert.equal(inspectionDatabase.prepare(`SELECT COUNT(*) AS count FROM auto_management_admission_decisions
      WHERE trade_id = ? AND decision_stage = 'RELEASE'`).get(created.body.tradeId).count, 0);
  });
  await t.test("release saves enforced evidence and repeats without another decision", async () => {
    const released = await move([identity(created.body)]);
    assert.equal(released.statusCode, 200, JSON.stringify(released.body));
    assert.equal(released.body.transitionedCount, 1);
    assert.equal((await move([identity(created.body)])).body.replayed, true);
    assert.equal(inspectionDatabase.prepare(`SELECT COUNT(*) AS count FROM auto_management_admission_decisions
      WHERE trade_id = ? AND decision_stage = 'RELEASE' AND is_enforced = 1`).get(created.body.tradeId).count, 1);
    assert.equal(inspectionDatabase.prepare(`SELECT admission_mode AS mode FROM auto_management_admission_decisions
      WHERE trade_id = ? AND decision_stage = 'RELEASE'`).get(created.body.tradeId).mode, null);
    assert.equal(inspectionDatabase.prepare(`SELECT auto_management_admission_mode_override AS mode
      FROM pricing_rules WHERE pricing_rule_id = ?`).get(rule.pricingRuleId).mode, "REVIEW_REQUIRED");
  });
  await t.test("manual release does not require a trade context or pricing rule", async () => {
    const released = await move([identity(unassigned)]);
    assert.equal(released.statusCode, 200, JSON.stringify(released.body));
    assert.equal(released.body.transitionedCount, 1);
    const state = inspectionDatabase.prepare(`SELECT initial_position_management_mode AS initial,
      current_position_management_mode AS current FROM trade_position_management
      WHERE trade_id = ?`).get(unassigned.tradeId);
    assert.deepEqual({ ...state }, { initial: "MANUAL", current: "AUTO" });
  });
  await t.test("technical batch output retains inherited Manual mode and existing direct-release restriction", async () => {
    const source = await expectCreated("/api/v1/client-deals", clientDealPayload(rule, 11));
    const batch = await expectCreated("/api/v1/batches", {
      tradeIds: [source.tradeId], idempotencyKey: "admission-technical-release"
    });
    const output = inspectionDatabase.prepare(`SELECT trade_id AS tradeId, trade_type AS tradeType
      FROM batch_members WHERE batch_id = ? AND member_role = 'POSITION_OUT'`).get(batch.batchId);
    assert.ok(output);
    assert.equal(inspectionDatabase.prepare(`SELECT current_position_management_mode AS mode
      FROM trade_position_management WHERE trade_id = ?`).get(output.tradeId).mode, "MANUAL");
    const released = await move([output]);
    assert.equal(released.statusCode, 400);
  });

  const generate = () => expectCreated("/api/v1/client-deal-generation/one");
  const initialPolicy = (await request("GET", "/api/v1/auto-mode-eligibility-rules")).body;
  const setPolicy = async transform => {
    const result = await request("PUT", "/api/v1/auto-mode-eligibility-rules", {
      currencyPairs: initialPolicy.currencyPairs.map(transform)
    });
    assert.equal(result.statusCode, 200, JSON.stringify(result.body));
  };
  await t.test("eligible generated trades enter Auto and stopped Market Pulse holds new trades", async () => {
    assert.equal((await generate()).currentPositionManagementMode, "AUTO");
    await request("POST", "/api/v1/market-pulse-simulation/stop");
    const stopped = await generate();
    assert.equal(stopped.currentPositionManagementMode, "MANUAL");
    assert.ok(reasons(stopped).includes("MARKET_PULSE_UNAVAILABLE"));
    await request("POST", "/api/v1/market-pulse-simulation/start");
  });
  for (const [name, transform, reason] of [
    ["disabled pair", pair => ({...pair, enabled: false, maxBaseCcyAmount: null}), "CCY_PAIR_NOT_ENABLED"],
    ["amount limit", pair => ({...pair, maxBaseCcyAmount: pair.enabled ? "0.01" : null}), "TRADE_AMOUNT_LIMIT_EXCEEDED"]
  ]) {
    await t.test(`${name} blocks both initial and manual admission`, async () => {
      await setPolicy(transform);
      const held = await generate();
      assert.equal(held.currentPositionManagementMode, "MANUAL");
      assert.ok(reasons(held).includes(reason), JSON.stringify(reasons(held)));
      const released = await move([identity(held)]);
      assert.equal(released.statusCode, 409);
      assert.ok(released.body.message.includes(reason), released.body.message);
    });
  }
  await setPolicy(pair => pair);
  await t.test("release rejects excessive Transfer Rate deviation", async () => {
    const held = await expectCreated("/api/v1/client-deals", {...clientDealPayload(rule, 12), tradeRate: "1.5"});
    const denied = await move([identity(held)]);
    assert.equal(denied.statusCode, 409);
    assert.match(denied.body.message, /TRANSFER_RATE_DEVIATION_EXCEEDED/);
  });
  await t.test("hedges use their own criteria for initial admission and manual release", async () => {
    await setPolicy(pair => ({ ...pair, enabled: false, maxBaseCcyAmount: null }));
    const hedgeRule = (await request("GET", "/api/v1/pricing-rules")).body.find(candidate =>
      candidate.pricingMode === "AUTO_PRICED" && candidate.counterpartyRoles.includes("HEDGE_COUNTERPARTY"));
    assert.ok(hedgeRule);
    const payload = { pricingRuleId: hedgeRule.pricingRuleId, ccyPairCode: hedgeRule.ccyPairCode,
      side: "BUY", dealtCcyCode: "EUR", dealtCcyAmount: "1000", tenor: "TOD" };
    const admitted = await expectCreated("/api/v1/hedge-deals/auto-priced", payload);
    assert.equal(admitted.currentPositionManagementMode, "AUTO");
    await request("PUT", `/api/v1/pricing-rules/${hedgeRule.pricingRuleId}`, {autoManagementAdmissionModeOverride: "REVIEW_REQUIRED"});
    const held = await expectCreated("/api/v1/hedge-deals/auto-priced", payload);
    assert.equal(held.currentPositionManagementMode, "MANUAL");
    assert.deepEqual(reasons(held), ["REVIEW_REQUIRED"]);
    const hedgeIdentity = deal => ({ tradeId: deal.tradeId, tradeType: "HEDGE_DEAL" });
    const released = await move([hedgeIdentity(held)]);
    assert.equal(released.statusCode, 200, JSON.stringify(released.body));
    const currentHedgePolicy = (await request("GET",
      "/api/v1/auto-mode-eligibility-rules?tradeType=HEDGE_DEAL")).body;
    assert.equal((await request("PUT", "/api/v1/auto-mode-eligibility-rules", {
      tradeType: "HEDGE_DEAL",
      currencyPairs: currentHedgePolicy.currencyPairs.map(pair => ({
        ...pair, enabled: false, maxBaseCcyAmount: null
      }))
    })).statusCode, 200);
    await request("PUT", `/api/v1/pricing-rules/${hedgeRule.pricingRuleId}`, { autoManagementAdmissionModeOverride: null });
    const blocked = await expectCreated("/api/v1/hedge-deals/auto-priced", payload);
    assert.equal(blocked.currentPositionManagementMode, "MANUAL");
    assert.ok(reasons(blocked).includes("CCY_PAIR_NOT_ENABLED"));
    const denied = await move([hedgeIdentity(blocked)]);
    assert.equal(denied.statusCode, 409);
    assert.match(denied.body.message, /CCY_PAIR_NOT_ENABLED/);
    await setPolicy(pair => pair);
    assert.equal((await generate()).currentPositionManagementMode, "AUTO");
  });

  assert.throws(() => inspectionDatabase.prepare(`
    UPDATE auto_management_admission_decisions
    SET is_enforced = 0
    WHERE trade_id = ?
  `).run(created.body.tradeId), /AUTO_MANAGEMENT_ADMISSION_DECISION_IMMUTABLE/);
  assert.throws(() => inspectionDatabase.prepare(`
    DELETE FROM auto_management_admission_decisions
    WHERE trade_id = ?
  `).run(created.body.tradeId), /AUTO_MANAGEMENT_ADMISSION_DECISION_IMMUTABLE/);

  inspectionDatabase.exec(`
    CREATE TRIGGER test_block_enforcement_admission_insert
    BEFORE INSERT ON auto_management_admission_decisions
    FOR EACH ROW
    BEGIN
      SELECT RAISE(ABORT, 'TEST_ADMISSION_AUDIT_WRITE_FAILED');
    END;
  `);
  const tradeCount = inspectionDatabase.prepare("SELECT COUNT(*) AS count FROM trade_exposures").get().count;
  const failed = await request("POST", "/api/v1/client-deals", clientDealPayload(rule, 3));
  assert.equal(failed.statusCode, 500);
  assert.equal(inspectionDatabase.prepare("SELECT COUNT(*) AS count FROM trade_exposures").get().count, tradeCount);
  const failedRelease = await move([identity(createdWithAdmissionOverride.body)]);
  assert.equal(failedRelease.statusCode, 500);
  assert.equal(inspectionDatabase.prepare(`SELECT current_position_management_mode AS mode
    FROM trade_position_management WHERE trade_id = ?`).get(createdWithAdmissionOverride.body.tradeId).mode, "MANUAL");
  assert.equal(inspectionDatabase.prepare(`SELECT COUNT(*) AS count FROM trade_position_management_transitions
    WHERE trade_id = ?`).get(createdWithAdmissionOverride.body.tradeId).count, 0);
  inspectionDatabase.exec("DROP TRIGGER test_block_enforcement_admission_insert");
});
