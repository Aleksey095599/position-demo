"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { DatabaseSync } = require("node:sqlite");

const ROOT = path.resolve(__dirname, "..", "..", "..", "..", "..");
const SCHEMA_PATH = path.join(ROOT, "schema.sql");

function openDatabase(testContext) {
  const database = new DatabaseSync(":memory:");
  database.exec(fs.readFileSync(SCHEMA_PATH, "utf8"));
  testContext.after(() => database.close());
  return database;
}

function insertRange(database, overrides = {}) {
  const range = {
    instrumentId: "CNYRUB_TOM",
    timeframe: "ONE_DAY",
    from: "2026-09-15T07:00:00.000Z",
    till: "2026-09-15T08:00:00.000Z",
    loadedAt: "2026-09-16T09:00:00.000Z",
    ...overrides
  };

  database.prepare(`
    INSERT INTO moex_iss_daily_candle_load_ranges
      (instrument_id, timeframe, from_at, till_at, loaded_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    range.instrumentId,
    range.timeframe,
    range.from,
    range.till,
    range.loadedAt
  );
}

test("creates canonical Market Candle Load Ranges", testContext => {
  const database = openDatabase(testContext);
  const columns = database.prepare(
    "PRAGMA table_info(moex_iss_daily_candle_load_ranges)"
  ).all();

  assert.deepEqual(
    columns.filter(column => column.pk > 0).map(column => column.name),
    ["instrument_id", "timeframe", "from_at"]
  );
  assert.deepEqual(
    columns.map(column => column.name),
    ["instrument_id", "timeframe", "from_at", "till_at", "loaded_at"]
  );

  insertRange(database);
  assert.equal(
    database.prepare(`
      SELECT COUNT(*) AS count FROM moex_iss_daily_candle_load_ranges
    `).get().count,
    1
  );
});

test("requires a valid half-open UTC Range", testContext => {
  const database = openDatabase(testContext);

  for (const overrides of [
    { till: "2026-09-15T07:00:00.000Z" },
    { from: "2026-09-15T08:00:00.000Z" },
    { from: "2026-09-15T10:00:00+03:00" },
    { timeframe: "TWO_MINUTES" }
  ]) {
    assert.throws(
      () => insertRange(database, overrides),
      /CHECK constraint failed/
    );
  }
});

test("keeps one Range per scope and start boundary", testContext => {
  const database = openDatabase(testContext);
  insertRange(database);

  assert.throws(
    () => insertRange(database, {
      till: "2026-09-15T09:00:00.000Z"
    }),
    /UNIQUE constraint failed/
  );
});
