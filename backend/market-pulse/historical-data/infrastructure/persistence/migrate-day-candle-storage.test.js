"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { DatabaseSync } = require("node:sqlite");
const { migrateDayCandleStorage } = require("./migrate-day-candle-storage");
const { SqliteMarketSourceCandleRepository } = require("./sqlite-market-source-candle-repository");
const schema=fs.readFileSync(path.resolve(__dirname,"../../../../../schema.sql"),"utf8");
function setup(t) {
  const db=new DatabaseSync(":memory:"); t.after(()=>db.close()); db.exec(schema);
  db.exec(`CREATE TABLE moex_iss_daily_candles AS SELECT * FROM moex_iss_day_candles;
    CREATE TABLE moex_iss_daily_candle_load_ranges (instrument_id TEXT,timeframe TEXT,from_at TEXT,till_at TEXT,loaded_at TEXT);
    CREATE TABLE moex_iss_daily_candle_load_attempts (instrument_id TEXT,load_date TEXT,last_attempt_at TEXT,last_error TEXT);`);
  return db;
}
function sourceCandle(db) {
  db.exec("INSERT INTO moex_iss_daily_candles VALUES ('CNYRUB_TOM','ONE_DAY','2026-09-14T21:00:00.000Z','2026-09-15T20:59:59.000Z',12,13,11,12.5,'MOEX_ISS','2026-09-20T12:00:00.000Z')");
}
test("copies day candles, expands coverage and preserves errors and empty completed days",t=>{
  const db=setup(t); sourceCandle(db);
  db.exec(`INSERT INTO moex_iss_daily_candle_load_ranges VALUES
    ('CNYRUB_TOM','ONE_DAY','2026-09-14T21:00:00.000Z','2026-09-16T21:00:00.000Z','2026-09-20T12:00:00.000Z');
    INSERT INTO moex_iss_daily_candle_load_attempts VALUES
    ('CNYRUB_TOM','2026-09-15','2026-09-19T12:00:00.000Z',NULL),
    ('CNYRUB_TOM','2026-09-16','2026-09-21T12:00:00.000Z','Retry failed'),
    ('CNYRUB_TOM','2026-09-17','2026-09-21T13:00:00.000Z','Unavailable');`);
  assert.equal(migrateDayCandleStorage(db),true);
  const results=db.prepare("SELECT * FROM moex_iss_day_candle_load_result ORDER BY load_date").all();
  assert.deepEqual(results.map(row=>row.load_date),["2026-09-15","2026-09-16","2026-09-17"]);
  assert.equal(Object.hasOwn(results[0],"last_attempt_at"),false);
  assert.equal(results[1].completed_at,"2026-09-20T12:00:00.000Z");
  assert.equal(results[1].last_error,"Retry failed");
  assert.equal(results[2].completed_at,null);
  const repo=new SqliteMarketSourceCandleRepository({database:db});
  const summaries=repo.findSourceDaySummaries({instrumentId:"CNYRUB_TOM",timeframe:"ONE_DAY",fromDate:"2026-09-15",throughDate:"2026-09-17"});
  assert.equal(summaries[0].firstCandle.open,"12");
  assert.equal(summaries[1].candleCount,0);
  for(const name of ["moex_iss_daily_candles","moex_iss_daily_candle_load_ranges","moex_iss_daily_candle_load_attempts"]) {
    assert.equal(db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name=?").get(name).n,0);
    assert.equal(db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name=?").get(`legacy_${name}`).n,1);
  }
  db.exec(schema);
  assert.equal(migrateDayCandleStorage(db),false);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM moex_iss_day_candles").get().n,1);
});
test("only full Moscow days are confirmed and adjacent coverage can complete a day",t=>{
  const db=setup(t);
  db.exec(`INSERT INTO moex_iss_daily_candle_load_ranges VALUES
    ('CNYRUB_TOM','ONE_DAY','2026-09-13T22:00:00.000Z','2026-09-14T22:00:00.000Z','2026-09-20T12:00:00.000Z'),
    ('CNYRUB_TOM','ONE_DAY','2026-09-14T22:00:00.000Z','2026-09-16T20:00:00.000Z','2026-09-20T12:00:00.000Z');`);
  migrateDayCandleStorage(db);
  assert.deepEqual(db.prepare("SELECT load_date FROM moex_iss_day_candle_load_result").all().map(row=>row.load_date),["2026-09-15"]);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM legacy_moex_iss_daily_candle_load_ranges").get().n,2);
});
test("destination candle conflicts roll back the migration and retain original tables",t=>{
  const db=setup(t);sourceCandle(db);
  db.exec("INSERT INTO moex_iss_day_candles SELECT * FROM moex_iss_daily_candles");
  assert.throws(()=>migrateDayCandleStorage(db),/UNIQUE/);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM moex_iss_daily_candles").get().n,1);
});
test("invalid source coverage rolls back copied candles",t=>{
  const db=setup(t);sourceCandle(db);
  db.exec("INSERT INTO moex_iss_daily_candle_load_ranges VALUES ('CNYRUB_TOM','ONE_DAY','invalid','invalid','2026-09-20T12:00:00.000Z')");
  assert.throws(()=>migrateDayCandleStorage(db),/Invalid legacy/);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM moex_iss_day_candles").get().n,0);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM moex_iss_daily_candles").get().n,1);
});
