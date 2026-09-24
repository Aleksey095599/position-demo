"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { DatabaseSync } = require("node:sqlite");
const { migrateMinuteCandleLoadResult } = require("./migrate-minute-candle-load-result");
const schema = fs.readFileSync(path.resolve(__dirname, "../../../../../schema.sql"), "utf8");
function setup(t) {
  const db = new DatabaseSync(":memory:");
  t.after(() => db.close());
  return db;
}

test("renames minute load results without changing completed days, attempts or errors", t => {
  const db = setup(t);
  db.exec(schema.replaceAll("moex_iss_minute_candle_load_result", "moex_iss_minute_candle_load_days"));
  db.exec("ALTER TABLE moex_iss_minute_candle_load_days ADD COLUMN last_attempt_at TEXT");
  db.exec(`INSERT INTO moex_iss_minute_candle_load_days (instrument_id,load_date,completed_at,last_attempt_at,last_error) VALUES
    ('CNYRUB_TOM','2026-09-15','2026-09-21T10:00:00.000Z','2026-09-21T10:00:00.000Z',NULL),
    ('CNYRUB_TOM','2026-09-16',NULL,'2026-09-21T11:00:00.000Z','Source unavailable'),
    ('CNYRUB_TOM','2026-09-19','2026-09-21T12:00:00.000Z','2026-09-21T12:00:00.000Z',NULL)`);
  const before = db.prepare("SELECT * FROM moex_iss_minute_candle_load_days ORDER BY load_date").all();
  assert.equal(migrateMinuteCandleLoadResult(db), true);
  db.exec(schema);
  assert.deepEqual(db.prepare("SELECT * FROM moex_iss_minute_candle_load_result ORDER BY load_date").all(), before);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name = 'moex_iss_minute_candle_load_days'").get().n, 0);
  assert.throws(() => db.exec("INSERT INTO moex_iss_minute_candle_load_result SELECT * FROM moex_iss_minute_candle_load_result"), /UNIQUE/);
  assert.equal(migrateMinuteCandleLoadResult(db), false);
});

test("fresh databases and repeated startup keep the canonical table", t => {
  const db = setup(t);
  assert.equal(migrateMinuteCandleLoadResult(db), false);
  db.exec(schema);
  assert.equal(migrateMinuteCandleLoadResult(db), false);
  db.exec(schema);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM moex_iss_minute_candle_load_result").get().n, 0);
});

test("an unexpected destination conflict preserves both tables", t => {
  const db = setup(t);
  db.exec(schema);
  db.exec("CREATE TABLE moex_iss_minute_candle_load_days AS SELECT * FROM moex_iss_minute_candle_load_result");
  db.exec("ALTER TABLE moex_iss_minute_candle_load_days ADD COLUMN last_attempt_at TEXT");
  db.exec("INSERT INTO moex_iss_minute_candle_load_days (instrument_id,load_date,completed_at,last_attempt_at,last_error) VALUES ('CNYRUB_TOM','2026-09-15',NULL,'2026-09-21T10:00:00.000Z','Retry')");
  assert.throws(() => migrateMinuteCandleLoadResult(db), /already another table/);
  assert.equal(db.prepare("SELECT last_error FROM moex_iss_minute_candle_load_days").get().last_error, 'Retry');
  assert.equal(db.prepare("SELECT COUNT(*) n FROM moex_iss_minute_candle_load_result").get().n, 0);
});
