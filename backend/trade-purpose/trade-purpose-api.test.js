"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { DatabaseSync } = require("node:sqlite");

const ROOT = path.resolve(__dirname, "..", "..");
const SERVER_PATH = path.join(ROOT, "server.js");
const TEMP_PREFIX = "position-trade-purpose-";
const EXAMPLES = [
  { tradePurposeId: "CLIENT_CONVERSION", name: "Client Account Conversion", tradeContextCount: 0 },
  { tradePurposeId: "FEE_COLLECTION", name: "Fee Collection", tradeContextCount: 0 },
  { tradePurposeId: "LOAN_REPAYMENT", name: "Loan Repayment", tradeContextCount: 0 },
  { tradePurposeId: "POSITION_HEDGING", name: "Position Hedging", tradeContextCount: 0 }
];

function apiClient(server) {
  return async (method, pathname, body) => {
    let statusCode;
    let text = "";
    const request = {
      method,
      async *[Symbol.asyncIterator]() {
        if (body !== undefined) yield Buffer.from(JSON.stringify(body));
      }
    };
    const response = {
      writeHead(code) { statusCode = code; },
      end(chunk = "") { text += chunk; }
    };
    assert.equal(await server.handleApi(request, response, new URL(pathname, "http://localhost")), true);
    return {
      statusCode,
      body: text && pathname !== "/api/bootstrap.js" ? JSON.parse(text) : text
    };
  };
}

test("Trade Purpose CRUD, bootstrap, constraints, and first-introduction seeds", async t => {
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), TEMP_PREFIX));
  const databasePath = path.join(temporaryDirectory, "trade-purpose.sqlite");
  const previousDatabasePath = process.env.DEMO_DATABASE_PATH;
  let server;

  function reloadServer() {
    server?.closeDatabase();
    server = null;
    delete require.cache[require.resolve(SERVER_PATH)];
    server = require(SERVER_PATH);
    return apiClient(server);
  }

  t.after(() => {
    server?.closeDatabase();
    delete require.cache[require.resolve(SERVER_PATH)];
    if (previousDatabasePath === undefined) delete process.env.DEMO_DATABASE_PATH;
    else process.env.DEMO_DATABASE_PATH = previousDatabasePath;
    const relative = path.relative(path.resolve(os.tmpdir()), path.resolve(temporaryDirectory));
    assert.ok(relative && !relative.startsWith("..") && !path.isAbsolute(relative));
    assert.ok(path.basename(temporaryDirectory).startsWith(TEMP_PREFIX));
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  });

  process.env.DEMO_DATABASE_PATH = databasePath;
  let request = reloadServer();
  assert.deepEqual((await request("GET", "/api/v1/trade-purposes")).body, EXAMPLES);

  const bootstrap = await request("GET", "/api/bootstrap.js");
  const payload = JSON.parse(bootstrap.body.replace(/^window\.__DEMO_API_BOOTSTRAP__ = /, "").trim().replace(/;$/, ""));
  assert.deepEqual(payload.tradePurposes, EXAMPLES);

  const create = await request("POST", "/api/v1/trade-purposes", {
    tradePurposeId: " custom_purpose ", name: " Custom Purpose "
  });
  assert.equal(create.statusCode, 201);
  assert.deepEqual(create.body, { tradePurposeId: "CUSTOM_PURPOSE", name: "Custom Purpose", tradeContextCount: 0 });

  const duplicate = await request("POST", "/api/v1/trade-purposes", {
    tradePurposeId: "CUSTOM_PURPOSE", name: "Duplicate"
  });
  assert.equal(duplicate.statusCode, 409);
  assert.equal(duplicate.body.code, "TRADE_PURPOSE_ALREADY_EXISTS");

  for (const invalid of [null, [], {}, { tradePurposeId: "A", name: "Invalid" },
    { tradePurposeId: "A".repeat(31), name: "Invalid" },
    { tradePurposeId: "INVALID CODE", name: "Invalid" },
    { tradePurposeId: "VALID", name: " " },
    { tradePurposeId: "VALID", name: "X".repeat(101) }]) {
    const result = await request("POST", "/api/v1/trade-purposes", invalid);
    assert.equal(result.statusCode, 400, JSON.stringify(invalid));
  }

  const replacement = await request("PUT", "/api/v1/trade-purposes/custom_purpose", {
    tradePurposeId: "RENAMED", name: "Renamed Purpose"
  });
  assert.equal(replacement.statusCode, 200);
  assert.deepEqual(replacement.body, { tradePurposeId: "RENAMED", name: "Renamed Purpose", tradeContextCount: 0 });
  assert.equal((await request("PUT", "/api/v1/trade-purposes/RENAMED", {
    tradePurposeId: "FEE_COLLECTION", name: "Collision"
  })).statusCode, 409);
  assert.equal((await request("DELETE", "/api/v1/trade-purposes/CUSTOM_PURPOSE")).statusCode, 404);
  assert.equal((await request("PUT", "/api/v1/trade-purposes/UNKNOWN", {
    tradePurposeId: "UNKNOWN", name: "Unknown"
  })).statusCode, 404);
  assert.equal((await request("DELETE", "/api/v1/trade-purposes/RENAMED")).statusCode, 204);

  const sqlite = new DatabaseSync(databasePath);
  try {
    assert.deepEqual(sqlite.prepare("PRAGMA table_info(trade_purposes)").all().map(column => column.name),
      ["trade_purpose_id", "name"]);
    assert.throws(() => sqlite.prepare("INSERT INTO trade_purposes VALUES (?, ?)").run("lower_case", "Bad code"));
    assert.throws(() => sqlite.prepare("INSERT INTO trade_purposes VALUES (?, ?)").run(null, "No code"));
    assert.throws(() => sqlite.prepare("INSERT INTO trade_purposes VALUES (?, ?)").run("INVALID_NAME", " "));
    assert.deepEqual(sqlite.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    sqlite.close();
  }

  for (const purpose of EXAMPLES) {
    assert.equal((await request("DELETE", `/api/v1/trade-purposes/${purpose.tradePurposeId}`)).statusCode, 204);
  }
  request = reloadServer();
  assert.deepEqual((await request("GET", "/api/v1/trade-purposes")).body, [],
    "Restart must preserve intentional deletion, even when the dictionary is empty.");

  server.closeDatabase();
  server = null;
  const legacy = new DatabaseSync(databasePath);
  legacy.exec("DROP TABLE trade_purposes");
  legacy.close();
  request = reloadServer();
  assert.deepEqual((await request("GET", "/api/v1/trade-purposes")).body, EXAMPLES,
    "An existing database receives examples only when the new dictionary is first introduced.");
});
