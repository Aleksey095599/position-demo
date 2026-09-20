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
const TEMPORARY_DIRECTORY_PREFIX = "position-management-policy-";

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


test("schema exposes Admission without retired routing settings", () => {
  const database = freshSeededDatabase();
  try {
    assert.ok(!database.prepare("PRAGMA table_info(trade_contexts)").all().some(c => c.name === "default_position_management_mode"));
    assert.ok(!database.prepare("PRAGMA table_info(pricing_rules)").all().some(c => c.name === "position_management_mode_override"));
    assert.equal(database.prepare("PRAGMA table_info(trade_contexts)").all().find(c => c.name === "auto_management_admission_mode").dflt_value, "'REVIEW_REQUIRED'");
    assert.throws(() => database.exec("UPDATE trade_contexts SET auto_management_admission_mode = 'INVALID'"), /CHECK constraint failed/);
    assert.throws(() => database.exec("UPDATE trade_contexts SET auto_management_admission_mode = 'MANUAL_ONLY'"), /CHECK constraint failed/);
    assert.throws(() => database.exec("UPDATE pricing_rules SET auto_management_admission_mode_override = 'AUTO_IF_ELIGIBLE'"), /CHECK constraint failed/);
    assert.throws(() => database.exec("UPDATE pricing_rules SET auto_management_admission_mode_override = 'MANUAL_ONLY'"), /CHECK constraint failed/);
  } finally { database.close(); }
});

test("configuration API uses initial Admission inheritance and review-required overrides", async t => {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), TEMPORARY_DIRECTORY_PREFIX));
  const previous = process.env.DEMO_DATABASE_PATH;
  process.env.DEMO_DATABASE_PATH = path.join(temporaryDirectory, "policy.sqlite");
  const server = require(SERVER_PATH);
  t.after(() => {
    server.closeDatabase();
    if (previous === undefined) delete process.env.DEMO_DATABASE_PATH;
    else process.env.DEMO_DATABASE_PATH = previous;
    removeOwnedTemporaryDirectory(temporaryDirectory);
  });
  const request = apiClient(server.handleApi);
  const terms = { servicingLocationId: "000", accountingSystemId: "AFINA", originatingSystemId: "RFQ" };
  const created = assertSuccessfulApiResponse(await request("POST", "/api/v1/trade-contexts", terms), 201);
  assert.equal(created.autoManagementAdmissionMode, "REVIEW_REQUIRED");
  assert.equal(Object.hasOwn(created, "defaultPositionManagementMode"), false);
  const contextUrl = `/api/v1/trade-contexts/${created.tradeContextId}`;
  const reviewed = assertSuccessfulApiResponse(await request("PUT", contextUrl, {...terms, autoManagementAdmissionMode: "REVIEW_REQUIRED"}), 200);
  assert.equal(reviewed.autoManagementAdmissionMode, "REVIEW_REQUIRED");
  const preserved = assertSuccessfulApiResponse(await request("PUT", contextUrl, terms), 200);
  assert.equal(preserved.autoManagementAdmissionMode, "REVIEW_REQUIRED");
  for (const admission of ["INVALID", "AUTO_IF_ELIGIBLE", "MANUAL_ONLY"]) {
    assert.equal((await request("PUT", contextUrl, {...terms, autoManagementAdmissionMode: admission})).statusCode, 400);
  }
  const rules = assertSuccessfulApiResponse(await request("GET", "/api/v1/pricing-rules"), 200);
  const rule = rules.find(rule => rule.effectiveAutoManagementAdmissionMode === "AUTO_IF_ELIGIBLE");
  assert.ok(rule);
  for (const field of ["positionManagementModeOverride", "effectivePositionManagementMode", "tradeContextDefaultPositionManagementMode"]) {
    assert.equal(Object.hasOwn(rule, field), false);
  }
  const ruleUrl = `/api/v1/pricing-rules/${rule.pricingRuleId}`;
  const manual = assertSuccessfulApiResponse(await request("PUT", ruleUrl, {autoManagementAdmissionModeOverride: "REVIEW_REQUIRED"}), 200);
  assert.equal(manual.effectiveAutoManagementAdmissionMode, "REVIEW_REQUIRED");
  const inherited = assertSuccessfulApiResponse(await request("PUT", ruleUrl, {autoManagementAdmissionModeOverride: null}), 200);
  assert.equal(inherited.effectiveAutoManagementAdmissionMode, "AUTO_IF_ELIGIBLE");
  for (const invalid of [null, [], {}, {autoManagementAdmissionModeOverride: "MANUAL_ONLY"}, {autoManagementAdmissionModeOverride: "AUTO_IF_ELIGIBLE"}, {positionManagementModeOverride: "AUTO"}]) {
    assert.equal((await request("PUT", ruleUrl, invalid)).statusCode, 400);
  }
});
