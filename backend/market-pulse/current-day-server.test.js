"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..", "..");
const SERVER_PATH = path.join(ROOT, "server.js");
const API = "/api/v1/market-pulse/current-day";
const TEMP_PREFIX = "position-current-day-server-";

function apiClient(handleApi) {
  return async (method, route, body) => {
    let statusCode = 0;
    let responseBody = "";
    const serialized = body === undefined ? "" : JSON.stringify(body);
    const handled = await handleApi({
      method,
      async *[Symbol.asyncIterator]() {
        if (serialized) yield Buffer.from(serialized, "utf8");
      }
    }, {
      writeHead(code) { statusCode = code; },
      end(chunk = "") { responseBody += chunk; }
    }, new URL(API + route, "http://127.0.0.1:8000"));
    assert.equal(handled, true, `${method} ${route} must be handled`);
    return { statusCode, body: responseBody ? JSON.parse(responseBody) : null };
  };
}

function assertResponse(result, statusCode = 200) {
  assert.equal(result.statusCode, statusCode, JSON.stringify(result.body));
  return result.body;
}

function removeOwnedTemporaryDirectory(directory) {
  const resolved = path.resolve(directory);
  const relative = path.relative(path.resolve(os.tmpdir()), resolved);
  assert.ok(relative && !relative.startsWith("..") && !path.isAbsolute(relative));
  assert.ok(path.basename(resolved).startsWith(TEMP_PREFIX));
  fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

test("current-day server settings persist and importing the server never starts source requests", async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), TEMP_PREFIX));
  const previousDatabase = process.env.DEMO_DATABASE_PATH;
  const previousFetch = globalThis.fetch;
  let sourceRequestCount = 0;
  let server;
  globalThis.fetch = async () => {
    sourceRequestCount++;
    throw new Error("This integration test must not send source requests.");
  };
  process.env.DEMO_DATABASE_PATH = path.join(directory, "current-day.sqlite");
  delete require.cache[require.resolve(SERVER_PATH)];
  t.after(() => {
    server?.closeDatabase();
    delete require.cache[require.resolve(SERVER_PATH)];
    globalThis.fetch = previousFetch;
    if (previousDatabase === undefined) delete process.env.DEMO_DATABASE_PATH;
    else process.env.DEMO_DATABASE_PATH = previousDatabase;
    removeOwnedTemporaryDirectory(directory);
  });
  server = require(SERVER_PATH);
  let request = apiClient(server.handleApi);

  await t.test("fresh settings and current-day status are available without loading candles", async () => {
    assert.deepEqual(assertResponse(await request("GET", "/settings")), {
      autoStart: false, pollIntervalMinutes: 1, reloadAfterDayEnd: false
    });
    const status = assertResponse(await request("GET", "/status?instrumentId=CNYRUB_TOM"));
    assert.equal(status.running, false);
    assert.equal(sourceRequestCount, 0);
  });

  const configured = { autoStart: true, pollIntervalMinutes: 15, reloadAfterDayEnd: true };
  await t.test("valid settings are saved without immediately starting the process", async () => {
    assert.deepEqual(assertResponse(await request("PUT", "/settings", configured)), configured);
    assert.deepEqual(assertResponse(await request("GET", "/settings")), configured);
    assert.equal(sourceRequestCount, 0);
  });

  await t.test("invalid settings are rejected and do not alter the saved configuration", async () => {
    for (const value of [null, [], { autoStart: "true" }, { autoStart: 1 },
      { reloadAfterDayEnd: "false" }, { reloadAfterDayEnd: 0 },
      { pollIntervalMinutes: 0 }, { pollIntervalMinutes: 61 },
      { pollIntervalMinutes: 1.5 }, { pollIntervalMinutes: "5" },
      { pollIntervalMinutes: null }, { fixedDelayMinutes: 15 }]) {
      assertResponse(await request("PUT", "/settings", value), 400);
      assert.deepEqual(assertResponse(await request("GET", "/settings")), configured);
    }
  });

  await t.test("invalid instrument commands never start source requests", async () => {
    assertResponse(await request("POST", "/start", { instrumentId: "UNSUPPORTED" }), 400);
    assertResponse(await request("POST", "/start", { instrumentId: "CNYRUB_TOM", unexpected: true }), 400);
    assertResponse(await request("GET", "/status?instrumentId=UNSUPPORTED"), 400);
    assertResponse(await request("POST", "/stop", { instrumentId: "CNYRUB_TOM" }));
    assert.equal(sourceRequestCount, 0);
  });

  await t.test("stored auto-start preference does not run on server import or DB reopen", async () => {
    server.closeDatabase();
    server = null;
    delete require.cache[require.resolve(SERVER_PATH)];
    server = require(SERVER_PATH);
    request = apiClient(server.handleApi);
    assert.deepEqual(assertResponse(await request("GET", "/settings")), configured);
    const status = assertResponse(await request("GET", "/status?instrumentId=CNYRUB_TOM"));
    assert.equal(status.running, false);
    assert.equal(sourceRequestCount, 0);
  });
});

test("current-day server reloads a completed source day and calculates every aggregation timeframe", { timeout: 20000 }, async t => {
  const { DatabaseSync } = require("node:sqlite");
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), TEMP_PREFIX));
  const databasePath = path.join(directory, "current-day-reload.sqlite");
  const previousDatabase = process.env.DEMO_DATABASE_PATH;
  const previousFetch = globalThis.fetch;
  const previousNow = Date.now;
  let clock = Date.parse("2026-09-27T23:58:00+03:00");
  let server;
  let reader;
  const sourceRequests = [];
  const initialRows = [
    [8, 9, 10, 7, "2026-09-27 08:59:00", "2026-09-27 08:59:59"],
    [9, 10, 11, 8, "2026-09-27 09:00:00", "2026-09-27 09:00:59"],
    [10, 11, 12, 9, "2026-09-27 09:01:00", "2026-09-27 09:01:59"]
  ];
  const reloadedRows = [
    [11, 11.5, 12, 10, "2026-09-27 09:00:00", "2026-09-27 09:00:59"],
    [12, 13, 14, 11, "2026-09-27 09:02:00", "2026-09-27 09:02:59"]
  ];
  Date.now = () => clock;
  globalThis.fetch = async urlValue => {
    const url = new URL(urlValue);
    assert.equal(url.origin, "https://iss.moex.com");
    assert.match(url.pathname, /CNYRUB_TOM\/candles\.json$/);
    const params = Object.fromEntries(url.searchParams);
    sourceRequests.push(params);
    assert.equal(params.start, "0");
    let data;
    if (params.from.startsWith("2026-09-28") && params.interval === "1") data = [];
    else if (params.from === "2026-09-27 00:00:00" && params.interval === "1") {
      data = clock < Date.parse("2026-09-28T00:00:00+03:00") ? initialRows : reloadedRows;
    } else if (params.from === "2026-09-27 00:00:00" && params.interval === "24") {
      data = [[11, 13, 14, 10, "2026-09-27 00:00:00", "2026-09-27 23:59:59"]];
    } else {
      throw new Error(`Unexpected source request: ${url.href}`);
    }
    return { ok: true, status: 200, json: async () => ({
      candles: { columns: ["open", "close", "high", "low", "begin", "end"], data }
    }) };
  };
  process.env.DEMO_DATABASE_PATH = databasePath;
  delete require.cache[require.resolve(SERVER_PATH)];
  t.after(async () => {
    try {
      reader?.close();
      await server?.closeDatabase();
    } finally {
      delete require.cache[require.resolve(SERVER_PATH)];
      globalThis.fetch = previousFetch;
      Date.now = previousNow;
      if (previousDatabase === undefined) delete process.env.DEMO_DATABASE_PATH;
      else process.env.DEMO_DATABASE_PATH = previousDatabase;
      removeOwnedTemporaryDirectory(directory);
    }
  });
  server = require(SERVER_PATH);
  let request = apiClient(server.handleApi);
  async function settledStatus() {
    const deadline = previousNow() + 12000;
    while (previousNow() < deadline) {
      const status = assertResponse(await request("GET", "/status"));
      if (!status.inFlight) return status;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    assert.fail("Current-day source loading did not finish within 12 seconds.");
  }

  assertResponse(await request("PUT", "/settings", { pollIntervalMinutes: 15 }));
  assertResponse(await request("POST", "/start", { instrumentId: "CNYRUB_TOM" }));
  const initialStatus = await settledStatus();
  assert.equal(initialStatus.lastError, null);
  assert.equal(initialStatus.candles.length, 3);
  assert.equal(initialStatus.lastSuccessAt, "2026-09-27T20:58:00.000Z");
  assert.equal(sourceRequests.length, 1);
  assert.equal(sourceRequests[0].from, "2026-09-27 00:00:00");
  assert.equal(sourceRequests[0].till, "2026-09-27 23:58:00");
  reader = new DatabaseSync(databasePath, { readOnly: true });
  assert.equal(reader.prepare("SELECT COUNT(*) count FROM moex_iss_minute_candles").get().count, 3);
  assert.equal(reader.prepare("SELECT COUNT(*) count FROM moex_iss_minute_candle_load_result WHERE completed_at IS NOT NULL").get().count, 0,
    "A current-day poll must not mark a Historical Data day completed.");
  assert.equal(reader.prepare("SELECT COUNT(*) count FROM moex_iss_aggregated_candles").get().count, 0);
  reader.close();
  reader = null;

  // Enabling after the last poll must persist the reload request before rollover and restart.
  clock = Date.parse("2026-09-27T23:59:00+03:00");
  assertResponse(await request("PUT", "/settings", { reloadAfterDayEnd: true }));
  assertResponse(await request("POST", "/stop", {}));
  await server.closeDatabase();
  server = null;
  delete require.cache[require.resolve(SERVER_PATH)];
  clock = Date.parse("2026-09-28T00:02:00+03:00");
  server = require(SERVER_PATH);
  request = apiClient(server.handleApi);
  const reopened = assertResponse(await request("GET", "/status"));
  assert.equal(reopened.running, false);
  assert.deepEqual(reopened.finalization.pending.map(day => day.date), ["2026-09-27"]);
  assertResponse(await request("POST", "/start", {}));
  const finalized = await settledStatus();
  assert.equal(finalized.lastError, null);
  assert.equal(finalized.date, "2026-09-28");
  assert.equal(finalized.candles.length, 0);
  assert.deepEqual(finalized.checkedRanges, []);
  assert.deepEqual(finalized.finalization.pending, []);
  assert.equal(finalized.finalization.lastCompleted.date, "2026-09-27");
  assert.equal(sourceRequests.length, 4);
  assert.deepEqual(sourceRequests.slice(1).map(row => [row.interval, row.from, row.till]), [
    ["1", "2026-09-28 00:00:00", "2026-09-28 00:02:00"],
    ["1", "2026-09-27 00:00:00", "2026-09-28 00:00:00"],
    ["24", "2026-09-27 00:00:00", "2026-09-28 00:00:00"]
  ]);
  reader = new DatabaseSync(databasePath, { readOnly: true });
  assert.deepEqual(reader.prepare("SELECT begin_at,open_price,close_price FROM moex_iss_minute_candles ORDER BY begin_at")
    .all().map(row => [row.begin_at, row.open_price, row.close_price]), [
      ["2026-09-27T06:00:00.000Z", 11, 11.5],
      ["2026-09-27T06:02:00.000Z", 12, 13]
    ], "End-of-day loading replaces removed minutes and updates changed prices.");
  const expectedTimeframes = ["FIVE_MINUTES", "FIFTEEN_MINUTES", "ONE_HOUR", "FOUR_HOURS", "ONE_DAY"].sort();
  const aggregateRows = reader.prepare("SELECT timeframe,open_price,close_price,component_count FROM moex_iss_aggregated_candles ORDER BY timeframe").all();
  assert.deepEqual(aggregateRows.map(row => row.timeframe), expectedTimeframes);
  for (const row of aggregateRows) {
    assert.equal(row.open_price, 11);
    assert.equal(row.close_price, 13);
    assert.equal(row.component_count, 2);
  }
  const resultRows = reader.prepare("SELECT timeframe,calculated_at,source_loaded_at,last_error FROM moex_iss_candle_aggregation_result WHERE calculation_date='2026-09-27' ORDER BY timeframe").all();
  assert.deepEqual(resultRows.map(row => row.timeframe), expectedTimeframes);
  for (const row of resultRows) {
    assert.equal(row.calculated_at, "2026-09-27T21:02:00.000Z");
    assert.equal(row.source_loaded_at, row.calculated_at);
    assert.equal(row.last_error, null);
  }
  assert.equal(reader.prepare("SELECT completed_at FROM moex_iss_minute_candle_load_result WHERE load_date='2026-09-27'").get().completed_at,
    "2026-09-27T21:02:00.000Z");
  assert.equal(reader.prepare("SELECT COUNT(*) count FROM moex_iss_day_candles").get().count, 1);
});
