"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { DatabaseSync } = require("node:sqlite");
const { migrateCandleResultAttemptTimestamps } = require("./migrate-candle-result-attempt-timestamps");
const { migrateAggregationTimeframes } = require("../../../candle-aggregation/infrastructure/persistence/migrate-aggregation-timeframes");

const tables = ["moex_iss_minute_candle_load_result", "moex_iss_day_candle_load_result", "moex_iss_candle_aggregation_result"];

test("removes only attempt timestamps from all result tables, preserves outcomes and is idempotent", t => {
  const db = new DatabaseSync(":memory:"); t.after(() => db.close());
  for (const table of tables) {
    db.exec(`CREATE TABLE ${table} (id TEXT PRIMARY KEY, completed_at TEXT, last_error TEXT, last_attempt_at TEXT NOT NULL);
      INSERT INTO ${table} VALUES ('loaded','2026-09-20',NULL,'start'),('failed',NULL,'failure','start'),
        ('retry','2026-09-19','retry failure','start'),('empty','2026-09-20',NULL,'start');`);
  }
  const snapshot = () => tables.map(table => db.prepare(`SELECT id,completed_at,last_error FROM ${table} ORDER BY id`).all());
  const before = snapshot();
  assert.equal(migrateCandleResultAttemptTimestamps(db), true);
  assert.deepEqual(snapshot(), before);
  for (const table of tables) assert.equal(db.prepare(`PRAGMA table_info(${table})`).all().some(c => c.name === "last_attempt_at"), false);
  assert.equal(migrateCandleResultAttemptTimestamps(db), false);
  assert.equal(db.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
});

test("fresh databases need no attempt migration", t => {
  const db = new DatabaseSync(":memory:"); t.after(() => db.close());
  assert.equal(migrateCandleResultAttemptTimestamps(db), false);
});

test("old hourly-only result upgrades after attempt removal and retains errors and source timestamps", t => {
  const db = new DatabaseSync(":memory:"); t.after(() => db.close());
  db.exec(`CREATE TABLE moex_iss_candle_aggregation_result (
    instrument_id TEXT NOT NULL, timeframe TEXT NOT NULL CHECK (timeframe='ONE_HOUR'),
    calculation_date TEXT NOT NULL, calculated_at TEXT, source_loaded_at TEXT,
    last_attempt_at TEXT NOT NULL, last_error TEXT, PRIMARY KEY(instrument_id,timeframe,calculation_date));
    INSERT INTO moex_iss_candle_aggregation_result VALUES ('CNYRUB_TOM','ONE_HOUR','2026-09-15','done','source','start','retry error');`);
  migrateCandleResultAttemptTimestamps(db);
  const before = db.prepare("SELECT * FROM moex_iss_candle_aggregation_result").get();
  migrateAggregationTimeframes(db);
  assert.deepEqual(db.prepare("SELECT * FROM moex_iss_candle_aggregation_result").get(), before);
  db.exec(`INSERT INTO moex_iss_candle_aggregation_result
    (instrument_id,timeframe,calculation_date,last_error) VALUES ('CNYRUB_TOM','FOUR_HOURS','2026-09-15','failed');`);
});

test("failure on a later table rolls back earlier column removals", t => {
  const db = new DatabaseSync(":memory:"); t.after(() => db.close());
  db.exec(`CREATE TABLE moex_iss_minute_candle_load_result (id TEXT, last_attempt_at TEXT);
    CREATE TABLE moex_iss_day_candle_load_result (id TEXT, last_attempt_at TEXT UNIQUE);`);
  assert.throws(() => migrateCandleResultAttemptTimestamps(db));
  assert.ok(db.prepare("PRAGMA table_info(moex_iss_minute_candle_load_result)").all().some(c => c.name === "last_attempt_at"));
});
