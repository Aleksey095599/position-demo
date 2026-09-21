"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { DatabaseSync } = require("node:sqlite");
function setup(t) {
  const db=new DatabaseSync(":memory:");
  t.after(()=>db.close());
  db.exec(fs.readFileSync(path.resolve(__dirname,"../../../../../schema.sql"),"utf8"));
  return db;
}
test("day load result contains only the instrument, date and load outcome",t=>{
  const db=setup(t);
  const columns=db.prepare("PRAGMA table_info(moex_iss_day_candle_load_result)").all();
  assert.deepEqual(columns.map(column=>column.name),["instrument_id","load_date","completed_at","last_attempt_at","last_error"]);
  assert.deepEqual(columns.filter(column=>column.pk).map(column=>column.name),["instrument_id","load_date"]);
  for(const name of ["moex_iss_daily_candles","moex_iss_daily_candle_load_ranges","moex_iss_daily_candle_load_attempts"]) {
    assert.equal(db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name=?").get(name).n,0);
  }
});
test("day results allow failure without a candle and reject invalid dates or duplicate keys",t=>{
  const db=setup(t);
  const insert=db.prepare("INSERT INTO moex_iss_day_candle_load_result (instrument_id,load_date,last_attempt_at,last_error) VALUES ('CNYRUB_TOM',?,'2026-09-21T10:00:00.000Z','Unavailable')");
  for(const date of ["2026-02-30","2026-13-01","invalid"]) assert.throws(()=>insert.run(date),/CHECK/);
  insert.run("2026-09-15");
  assert.throws(()=>insert.run("2026-09-15"),/UNIQUE/);
  assert.equal(db.prepare("SELECT completed_at FROM moex_iss_day_candle_load_result").get().completed_at,null);
});
