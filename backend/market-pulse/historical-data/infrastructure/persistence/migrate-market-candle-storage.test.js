"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { DatabaseSync } = require("node:sqlite");
const { migrateMarketCandleStorage } = require("./migrate-market-candle-storage");
const schema = fs.readFileSync(path.resolve(__dirname,"../../../../../schema.sql"),"utf8");
function setup(t) {
  const db=new DatabaseSync(":memory:");t.after(()=>db.close());db.exec(schema);
  db.exec(`CREATE TABLE market_source_candles AS SELECT * FROM moex_iss_minute_candles;
    CREATE TABLE market_aggregated_candles AS SELECT * FROM moex_iss_aggregated_candles;
    CREATE TABLE market_candle_load_ranges (instrument_id TEXT,timeframe TEXT,from_at TEXT,till_at TEXT,loaded_at TEXT);`);
  return db;
}
function candle(db,tf="ONE_MINUTE",source="MOEX_ISS") {
  db.prepare("INSERT INTO market_source_candles VALUES ('CNYRUB_TOM',?,'2026-09-15T07:00:00.000Z','2026-09-15T07:00:59.000Z',12,13,11,12,?,'2026-09-16T09:00:00.000Z')").run(tf,source);
}
test("copies minutes and days separately, retains legacy rows, and is idempotent",t=>{
  const db=setup(t);candle(db);candle(db,"ONE_DAY");
  db.exec("INSERT INTO market_candle_load_ranges VALUES ('CNYRUB_TOM','ONE_MINUTE','2026-09-13T21:00:00.000Z','2026-09-15T21:00:00.000Z','2026-09-16T09:00:00.000Z')");
  db.exec("INSERT INTO market_candle_load_ranges VALUES ('CNYRUB_TOM','ONE_DAY','2025-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z','2026-09-16T09:00:00.000Z')");
  assert.equal(migrateMarketCandleStorage(db),true);
  for(const name of ['moex_iss_minute_candles','moex_iss_day_candles']) assert.equal(db.prepare(`SELECT COUNT(*) n FROM ${name}`).get().n,1);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM moex_iss_day_candle_load_result").get().n,364);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM legacy_market_source_candles").get().n,2);
  assert.deepEqual(db.prepare("SELECT load_date FROM moex_iss_minute_candle_load_result ORDER BY load_date").all().map(x=>x.load_date),['2026-09-14','2026-09-15']);
  assert.equal(migrateMarketCandleStorage(db),false);
});
test("migration leaves partial boundary days unconfirmed and preserves original coverage",t=>{
  const db=setup(t);
  db.exec("INSERT INTO market_candle_load_ranges VALUES ('CNYRUB_TOM','ONE_MINUTE','2026-09-13T22:00:00.000Z','2026-09-16T20:00:00.000Z','2026-09-17T09:00:00.000Z')");
  migrateMarketCandleStorage(db);
  assert.deepEqual(db.prepare("SELECT load_date FROM moex_iss_minute_candle_load_result").all().map(x=>x.load_date),['2026-09-15']);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM legacy_market_candle_load_ranges").get().n,1);
});
test("unsupported source data rolls back without removing any legacy data",t=>{
  const db=setup(t);candle(db,"ONE_MINUTE","OTHER");
  assert.throws(()=>migrateMarketCandleStorage(db),/non-MOEX/);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM market_source_candles").get().n,1);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM moex_iss_minute_candles").get().n,0);
});
test("a destination conflict rolls back the entire copy",t=>{
  const db=setup(t);candle(db);db.exec("INSERT INTO moex_iss_minute_candles SELECT * FROM market_source_candles");
  assert.throws(()=>migrateMarketCandleStorage(db),/UNIQUE/);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM market_source_candles").get().n,1);
});
