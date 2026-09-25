"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const { createChartsModule } = require("./config/charts-module");

function setup(t) {
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
  for (const table of ["moex_iss_minute_candles", "moex_iss_day_candles", "moex_iss_aggregated_candles"]) {
    db.exec(`CREATE TABLE ${table}(instrument_id TEXT,timeframe TEXT,begin_at TEXT,open_price REAL,high_price REAL,low_price REAL,close_price REAL,component_count INTEGER)`);
  }
  db.exec(`CREATE TABLE moex_iss_candle_aggregation_result(instrument_id TEXT,timeframe TEXT,calculation_date TEXT,calculated_at TEXT,source_loaded_at TEXT,last_error TEXT);
    CREATE TABLE moex_iss_minute_candle_load_result(instrument_id TEXT,load_date TEXT,completed_at TEXT)`);
  const add = (table, timeframe, begin, count = 60, close = 12) => db.prepare(`INSERT INTO ${table} VALUES ('CNYRUB_TOM',?,?,12,13,11,?,?)`).run(timeframe, begin, close, count);
  const api = createChartsModule(db);
  const read = (timeframe, extra = {}) => api.candles(new URLSearchParams({ source: "MOEX_ISS", instrumentId: "CNYRUB_TOM", timeframe, ...extra }));
  return { db, add, read, api };
}

test("chart pages read the latest stored candles in ascending order without duplicates", t => {
  const { db, add, read } = setup(t);
  for (let day = 1; day <= 5; day++) add("moex_iss_minute_candles", "ONE_MINUTE", `2026-09-0${day}T07:00:00.000Z`);
  const beforeChanges = db.prepare("SELECT total_changes() n").get().n;
  const first = read("ONE_MINUTE", { limit: "2" }).body;
  assert.equal(first.candles.length, 2); assert.equal(first.hasMore, true);
  assert.equal(first.candles[0].begin, "2026-09-04T07:00:00.000Z");
  const second = read("ONE_MINUTE", { limit: "2", before: first.nextBefore }).body;
  assert.equal(second.candles[0].begin, "2026-09-02T07:00:00.000Z");
  const last = read("ONE_MINUTE", { limit: "2", before: second.nextBefore }).body;
  assert.equal(last.hasMore, false); assert.equal(last.candles.length, 1);
  assert.equal(db.prepare("SELECT total_changes() n").get().n, beforeChanges);
});

test("daily candles prefer sufficient calculated data by Moscow date", t => {
  const { add, read } = setup(t);
  add("moex_iss_day_candles", "ONE_DAY", "2026-09-13T21:00:00.000Z", 1, 11);
  add("moex_iss_day_candles", "ONE_DAY", "2026-09-14T21:00:00.000Z", 1, 11);
  add("moex_iss_aggregated_candles", "ONE_DAY", "2026-09-14T21:00:00.000Z", 240, 13);
  add("moex_iss_day_candles", "ONE_DAY", "2026-09-15T21:00:00.000Z", 1, 11);
  add("moex_iss_aggregated_candles", "ONE_DAY", "2026-09-15T21:00:00.000Z", 239, 13);
  const page = read("ONE_DAY").body;
  assert.equal(page.candles.length, 2);
  assert.equal(page.candles[0].origin, "SOURCE");
  assert.equal(page.candles[1].origin, "CALCULATED");
  assert.equal(page.candles[1].close, 13);
  assert.equal(page.candles[1].coverage, "SUFFICIENT");
  const first = read("ONE_DAY", { limit: "1" }).body;
  assert.equal(read("ONE_DAY", { before: first.nextBefore }).body.candles.length, 1);
});

test("charts exclude insufficient coverage without deleting candles or changing stale flags", t => {
  const { db, add, read } = setup(t);
  for (const [hour, count] of [[7, 1], [8, 30], [9, 60]]) add("moex_iss_aggregated_candles", "ONE_HOUR", `2026-09-15T0${hour}:00:00.000Z`, count);
  db.exec(`INSERT INTO moex_iss_candle_aggregation_result VALUES ('CNYRUB_TOM','ONE_HOUR','2026-09-15','stamp','source',NULL);
    INSERT INTO moex_iss_minute_candle_load_result VALUES ('CNYRUB_TOM','2026-09-15','source')`);
  assert.deepEqual(read("ONE_HOUR").body.candles.map(c => c.coverage), ["PARTIAL", "COMPLETE"]);
  assert.equal(db.prepare("SELECT count(*) n FROM moex_iss_aggregated_candles").get().n, 3);
  assert.ok(read("ONE_HOUR").body.candles.every(c => !c.stale));
  db.exec("UPDATE moex_iss_minute_candle_load_result SET completed_at='new-source'");
  assert.ok(read("ONE_HOUR").body.candles.every(c => c.stale));
  assert.equal(read("FIVE_MINUTES").body.candles.length, 0);
});

for (const [timeframe, minimum, complete] of [["FIVE_MINUTES", 3, 5], ["FIFTEEN_MINUTES", 8, 15], ["ONE_HOUR", 30, 60], ["FOUR_HOURS", 120, 240], ["ONE_DAY", 240, 1440]]) {
  test(`${timeframe} filters coverage before pagination at the exact minimum`, t => {
    const { add, read } = setup(t);
    for (const [day, count] of [[1, complete], [2, minimum - 1], [3, minimum], [4, 1]]) {
      add("moex_iss_aggregated_candles", timeframe, `2026-09-0${day}T21:00:00.000Z`, count);
    }
    const first = read(timeframe, { limit: "1" }).body;
    assert.equal(first.candles.length, 1);
    assert.equal(first.candles[0].componentCount, minimum);
    assert.equal(first.candles[0].coverage, timeframe === "ONE_DAY" ? "SUFFICIENT" : "PARTIAL");
    assert.equal(first.hasMore, true);
    const last = read(timeframe, { limit: "1", before: first.nextBefore }).body;
    assert.equal(last.candles.length, 1);
    assert.equal(last.candles[0].componentCount, complete);
    assert.equal(last.candles[0].coverage, timeframe === "ONE_DAY" ? "SUFFICIENT" : "COMPLETE");
    assert.equal(last.hasMore, false);
  });
}

test("a history containing only insufficient candles returns an empty page", t => {
  const { add, read } = setup(t);
  add("moex_iss_aggregated_candles", "ONE_HOUR", "2026-09-15T07:00:00.000Z", 1);
  const page = read("ONE_HOUR").body;
  assert.deepEqual(page.candles, []);
  assert.equal(page.hasMore, false);
  assert.equal(page.nextBefore, null);
});

test("chart API rejects unknown contexts, invalid cursors and unbounded requests", t => {
  const { read, api } = setup(t);
  for (const extra of [{ source: "OTHER" }, { instrumentId: "OTHER" }, { timeframe: "ONE_WEEK" }, { limit: "0" }, { limit: "1001" }, { before: "2026-02-30T00:00:00.000Z" }, { unexpected: "x" }]) assert.equal(read("ONE_HOUR", extra).statusCode, 400);
  assert.equal(api.candles(new URLSearchParams("source=MOEX_ISS&source=OTHER")).statusCode, 400);
  assert.equal(api.catalog().body.sources[0].instruments[0].precision, 4);
});
