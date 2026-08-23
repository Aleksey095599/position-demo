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
const TEMPORARY_DIRECTORY_PREFIX = "position-fx-management-policy-";

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

function assertSuccessfulApiResponse(result, statusCode) {
  assert.equal(result.handled, true);
  assert.equal(result.statusCode, statusCode);
  return result.body;
}

test("fresh schema and seed define safe FX Position Management policy defaults", () => {
  const database = freshSeededDatabase();

  try {
    const executionContextColumns = database.prepare(
      "PRAGMA table_info(execution_contexts)"
    ).all();
    const contextModeColumn = executionContextColumns.find(
      column => column.name === "default_position_management_mode"
    );
    assert.ok(contextModeColumn);
    assert.equal(contextModeColumn.notnull, 1);
    assert.equal(contextModeColumn.dflt_value, "'MANUAL'");
    const admissionModeColumn = executionContextColumns.find(
      column => column.name === "auto_hedging_admission_mode"
    );
    assert.equal(admissionModeColumn?.notnull, 1);
    assert.equal(admissionModeColumn?.dflt_value, "'MANUAL_ONLY'");

    const pricingRuleColumns = database.prepare(
      "PRAGMA table_info(pricing_rules)"
    ).all();
    const ruleOverrideColumn = pricingRuleColumns.find(
      column => column.name === "position_management_mode_override"
    );
    assert.ok(ruleOverrideColumn);
    assert.equal(ruleOverrideColumn.notnull, 0);
    assert.equal(ruleOverrideColumn.dflt_value, null);

    const contexts = database.prepare(`
      SELECT
        execution_system_id AS executionSystemId,
        default_position_management_mode AS defaultPositionManagementMode,
        auto_hedging_admission_mode AS autoHedgingAdmissionMode
      FROM execution_contexts
      ORDER BY execution_context_id
    `).all();
    const clickTradeContexts = contexts.filter(
      context => context.executionSystemId === "CLICK_TRADE_EFX"
    );
    const otherContexts = contexts.filter(
      context => context.executionSystemId !== "CLICK_TRADE_EFX"
    );

    assert.ok(clickTradeContexts.length > 0);
    assert.ok(otherContexts.length > 0);
    assert.ok(clickTradeContexts.every(context =>
      context.defaultPositionManagementMode === "AUTO"
      && context.autoHedgingAdmissionMode === "AUTO_IF_ELIGIBLE"
    ));
    assert.ok(otherContexts.every(context =>
      context.defaultPositionManagementMode === "MANUAL"
      && context.autoHedgingAdmissionMode === "MANUAL_ONLY"
    ));

    const pricingRuleModes = database.prepare(`
      SELECT position_management_mode_override AS positionManagementModeOverride
      FROM pricing_rules
    `).all();
    assert.ok(pricingRuleModes.length > 0);
    assert.ok(pricingRuleModes.every(
      rule => rule.positionManagementModeOverride === null
    ));

    assert.throws(() => database.prepare(`
      UPDATE execution_contexts
      SET default_position_management_mode = 'UNVERIFIED'
      WHERE execution_context_id = (SELECT MIN(execution_context_id) FROM execution_contexts)
    `).run(), /CHECK constraint failed/i);
    assert.throws(() => database.prepare(`
      UPDATE execution_contexts
      SET auto_hedging_admission_mode = 'UNVERIFIED'
      WHERE execution_context_id = (SELECT MIN(execution_context_id) FROM execution_contexts)
    `).run(), /CHECK constraint failed/i);
    assert.throws(() => database.prepare(`
      UPDATE pricing_rules
      SET position_management_mode_override = 'UNVERIFIED'
      WHERE pricing_rule_id = (SELECT MIN(pricing_rule_id) FROM pricing_rules)
    `).run(), /CHECK constraint failed/i);
  } finally {
    database.close();
  }
});

test("FX Position Management configuration API preserves inheritance and overrides", async t => {
  const temporaryDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), TEMPORARY_DIRECTORY_PREFIX)
  );
  const databasePath = path.join(temporaryDirectory, "policy.sqlite");
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

  const seededContexts = assertSuccessfulApiResponse(
    await request("GET", "/api/v1/execution-contexts"),
    200
  );
  assert.ok(seededContexts.filter(
    context => context.executionSystemId === "CLICK_TRADE_EFX"
  ).every(context => context.defaultPositionManagementMode === "AUTO"
    && context.autoHedgingAdmissionMode === "AUTO_IF_ELIGIBLE"));
  assert.ok(seededContexts.filter(
    context => context.executionSystemId !== "CLICK_TRADE_EFX"
  ).every(context => context.defaultPositionManagementMode === "MANUAL"
    && context.autoHedgingAdmissionMode === "MANUAL_ONLY"));

  const newContextTerms = {
    servicingLocationId: "000",
    accountingSystemId: "AFINA",
    executionSystemId: "RFQ"
  };
  const createdContext = assertSuccessfulApiResponse(
    await request("POST", "/api/v1/execution-contexts", newContextTerms),
    201
  );
  assert.equal(createdContext.defaultPositionManagementMode, "MANUAL");
  assert.equal(createdContext.autoHedgingAdmissionMode, "MANUAL_ONLY");

  const contextWithAutoDefault = assertSuccessfulApiResponse(
    await request(
      "PUT",
      `/api/v1/execution-contexts/${createdContext.executionContextId}`,
      { ...newContextTerms, defaultPositionManagementMode: "AUTO", autoHedgingAdmissionMode: "REVIEW_REQUIRED" }
    ),
    200
  );
  assert.equal(contextWithAutoDefault.defaultPositionManagementMode, "AUTO");
  assert.equal(contextWithAutoDefault.autoHedgingAdmissionMode, "REVIEW_REQUIRED");

  const contextUpdatedWithoutMode = assertSuccessfulApiResponse(
    await request(
      "PUT",
      `/api/v1/execution-contexts/${createdContext.executionContextId}`,
      newContextTerms
    ),
    200
  );
  assert.equal(contextUpdatedWithoutMode.defaultPositionManagementMode, "AUTO");
  assert.equal(contextUpdatedWithoutMode.autoHedgingAdmissionMode, "REVIEW_REQUIRED");

  for (const invalidContextResponse of [
    await request("POST", "/api/v1/execution-contexts", {
      servicingLocationId: "7777",
      accountingSystemId: "CTF3",
      executionSystemId: "RFQ",
      defaultPositionManagementMode: "UNVERIFIED"
    }),
    await request("POST", "/api/v1/execution-contexts", {
      ...newContextTerms,
      autoHedgingAdmissionMode: "UNVERIFIED"
    }),
    await request(
      "PUT",
      `/api/v1/execution-contexts/${createdContext.executionContextId}`,
      { ...newContextTerms, defaultPositionManagementMode: "UNVERIFIED" }
    )
  ]) {
    assert.equal(invalidContextResponse.handled, true);
    assert.equal(invalidContextResponse.statusCode, 400);
    assert.equal(invalidContextResponse.body.code, "INVALID_EXECUTION_CONTEXT");
  }

  for (const malformedContextPayload of [null, [], "invalid"]) {
    const malformedContextResponse = await request(
      "PUT",
      `/api/v1/execution-contexts/${createdContext.executionContextId}`,
      malformedContextPayload
    );
    assert.equal(malformedContextResponse.statusCode, 400);
    assert.equal(malformedContextResponse.body.code, "INVALID_EXECUTION_CONTEXT");
  }

  const seededRules = assertSuccessfulApiResponse(
    await request("GET", "/api/v1/pricing-rules"),
    200
  );
  const inheritedAutoRule = seededRules.find(rule =>
    rule.executionContextDefaultPositionManagementMode === "AUTO"
    && rule.positionManagementModeOverride === null
  );
  assert.ok(inheritedAutoRule);
  assert.equal(inheritedAutoRule.effectivePositionManagementMode, "AUTO");

  const ruleWithManualOverride = assertSuccessfulApiResponse(
    await request(
      "PUT",
      `/api/v1/pricing-rules/${inheritedAutoRule.pricingRuleId}`,
      { positionManagementModeOverride: "MANUAL" }
    ),
    200
  );
  assert.equal(ruleWithManualOverride.positionManagementModeOverride, "MANUAL");
  assert.equal(ruleWithManualOverride.effectivePositionManagementMode, "MANUAL");

  const ruleUpdatedWithoutOverride = assertSuccessfulApiResponse(
    await request(
      "PUT",
      `/api/v1/pricing-rules/${inheritedAutoRule.pricingRuleId}`,
      { marginPercent: ruleWithManualOverride.marginPercent + 0.01 }
    ),
    200
  );
  assert.equal(ruleUpdatedWithoutOverride.positionManagementModeOverride, "MANUAL");
  assert.equal(ruleUpdatedWithoutOverride.effectivePositionManagementMode, "MANUAL");

  for (const invalidRuleResponse of [
    await request("POST", "/api/v1/pricing-rules", {
      counterpartyId: inheritedAutoRule.counterpartyId,
      executionContextId: inheritedAutoRule.executionContextId,
      ccyPairCode: inheritedAutoRule.ccyPairCode,
      marginPercent: inheritedAutoRule.marginPercent,
      positionManagementModeOverride: "UNVERIFIED"
    }),
    await request(
      "PUT",
      `/api/v1/pricing-rules/${inheritedAutoRule.pricingRuleId}`,
      { positionManagementModeOverride: "UNVERIFIED" }
    )
  ]) {
    assert.equal(invalidRuleResponse.handled, true);
    assert.equal(invalidRuleResponse.statusCode, 400);
    assert.equal(invalidRuleResponse.body.code, "INVALID_PRICING_RULE");
  }

  for (const malformedRulePayload of [null, [], "invalid"]) {
    const malformedRuleResponse = await request(
      "PUT",
      `/api/v1/pricing-rules/${inheritedAutoRule.pricingRuleId}`,
      malformedRulePayload
    );
    assert.equal(malformedRuleResponse.statusCode, 400);
    assert.equal(malformedRuleResponse.body.code, "INVALID_PRICING_RULE");
  }

  for (const noOpRulePayload of [{}, { positionManagementModeOveride: "AUTO" }]) {
    const noOpRuleResponse = await request(
      "PUT",
      `/api/v1/pricing-rules/${inheritedAutoRule.pricingRuleId}`,
      noOpRulePayload
    );
    assert.equal(noOpRuleResponse.statusCode, 400);
    assert.equal(noOpRuleResponse.body.code, "INVALID_PRICING_RULE");
  }

  const inheritedRule = assertSuccessfulApiResponse(
    await request(
      "PUT",
      `/api/v1/pricing-rules/${inheritedAutoRule.pricingRuleId}`,
      { positionManagementModeOverride: null }
    ),
    200
  );
  assert.equal(inheritedRule.positionManagementModeOverride, null);
  assert.equal(inheritedRule.executionContextDefaultPositionManagementMode, "AUTO");
  assert.equal(inheritedRule.effectivePositionManagementMode, "AUTO");
});
