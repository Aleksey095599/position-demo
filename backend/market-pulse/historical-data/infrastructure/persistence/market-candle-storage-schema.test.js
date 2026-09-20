"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { DatabaseSync } = require("node:sqlite");

const ROOT = path.resolve(__dirname, "..", "..", "..", "..", "..");
const SCHEMA_PATH = path.join(ROOT, "schema.sql");

function openDatabase() {
  const database = new DatabaseSync(":memory:");
  database.exec(fs.readFileSync(SCHEMA_PATH, "utf8"));
  return database;
}

function insertSourceCandle(database, overrides = {}) {
  const candle = {
    instrumentId: "CNYRUB_TOM",
    timeframe: "ONE_MINUTE",
    beginAt: "2026-09-15T07:00:00.000Z",
    endAt: "2026-09-15T07:00:59.000Z",
    openPrice: 12.608,
    highPrice: 12.61,
    lowPrice: 12.575,
    closePrice: 12.591,
    dataSource: "MOEX_ISS",
    loadedAt: "2026-09-16T09:00:00.000Z",
    ...overrides
  };

  database.prepare(`
    INSERT INTO market_source_candles
      (
        instrument_id,
        timeframe,
        begin_at,
        end_at,
        open_price,
        high_price,
        low_price,
        close_price,
        data_source,
        loaded_at
      )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    candle.instrumentId,
    candle.timeframe,
    candle.beginAt,
    candle.endAt,
    candle.openPrice,
    candle.highPrice,
    candle.lowPrice,
    candle.closePrice,
    candle.dataSource,
    candle.loadedAt
  );
}

function insertAggregatedCandle(database, overrides = {}) {
  const candle = {
    instrumentId: "CNYRUB_TOM",
    timeframe: "FIVE_MINUTES",
    beginAt: "2026-09-15T07:00:00.000Z",
    endAt: "2026-09-15T07:04:59.000Z",
    openPrice: 12.608,
    highPrice: 12.61,
    lowPrice: 12.575,
    closePrice: 12.591,
    baseTimeframe: "ONE_MINUTE",
    componentCount: 5,
    calculatedAt: "2026-09-16T09:00:00.000Z",
    ...overrides
  };

  database.prepare(`
    INSERT INTO market_aggregated_candles
      (
        instrument_id,
        timeframe,
        begin_at,
        end_at,
        open_price,
        high_price,
        low_price,
        close_price,
        base_timeframe,
        component_count,
        calculated_at
      )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    candle.instrumentId,
    candle.timeframe,
    candle.beginAt,
    candle.endAt,
    candle.openPrice,
    candle.highPrice,
    candle.lowPrice,
    candle.closePrice,
    candle.baseTimeframe,
    candle.componentCount,
    candle.calculatedAt
  );
}

test("creates separate minimal Source and Aggregated Candle storage", () => {
  const database = openDatabase();
  const sourceColumns = database.prepare("PRAGMA table_info(market_source_candles)").all();
  const aggregatedColumns = database.prepare("PRAGMA table_info(market_aggregated_candles)").all();

  assert.deepEqual(
    sourceColumns.filter(column => column.pk > 0).map(column => column.name),
    ["instrument_id", "timeframe", "begin_at"]
  );
  assert.deepEqual(
    sourceColumns.map(column => column.name),
    [
      "instrument_id",
      "timeframe",
      "begin_at",
      "end_at",
      "open_price",
      "high_price",
      "low_price",
      "close_price",
      "data_source",
      "loaded_at"
    ]
  );
  assert.deepEqual(
    aggregatedColumns.filter(column => column.pk > 0).map(column => column.name),
    ["instrument_id", "timeframe", "begin_at"]
  );
  assert.deepEqual(
    aggregatedColumns.map(column => column.name),
    [
      "instrument_id",
      "timeframe",
      "begin_at",
      "end_at",
      "open_price",
      "high_price",
      "low_price",
      "close_price",
      "base_timeframe",
      "component_count",
      "calculated_at"
    ]
  );
  assert.ok(database.prepare(`
    SELECT 1
    FROM sqlite_master
    WHERE type = 'index' AND name = 'idx_market_source_candles_begin_at'
  `).get());
  assert.ok(database.prepare(`
    SELECT 1
    FROM sqlite_master
    WHERE type = 'index' AND name = 'idx_market_aggregated_candles_begin_at'
  `).get());

  database.close();
});

test("accepts any supported timeframe in Source Candle storage", () => {
  const database = openDatabase();
  const timeframes = [
    "ONE_MINUTE",
    "FIVE_MINUTES",
    "FIFTEEN_MINUTES",
    "ONE_HOUR",
    "FOUR_HOURS",
    "ONE_DAY",
    "ONE_WEEK",
    "ONE_MONTH"
  ];

  timeframes.forEach((timeframe, index) => {
    const beginAt = new Date(Date.UTC(2026, 8, 15, 7, index)).toISOString();
    const endAt = new Date(Date.parse(beginAt) + 59_000).toISOString();
    insertSourceCandle(database, { timeframe, beginAt, endAt });
  });

  assert.equal(
    database.prepare("SELECT COUNT(*) AS count FROM market_source_candles").get().count,
    timeframes.length
  );
  assert.throws(
    () => insertSourceCandle(database, {
      timeframe: "TWO_MINUTES",
      beginAt: "2026-09-15T08:00:00.000Z",
      endAt: "2026-09-15T08:01:59.000Z"
    }),
    /CHECK constraint failed/
  );

  database.close();
});

test("enforces Aggregated Candle target and base timeframe pairs", () => {
  const database = openDatabase();

  insertAggregatedCandle(database);
  insertAggregatedCandle(database, {
    timeframe: "ONE_MONTH",
    beginAt: "2026-08-01T00:00:00.000Z",
    endAt: "2026-08-31T23:59:59.000Z",
    baseTimeframe: "ONE_DAY",
    componentCount: 21
  });
  assert.throws(
    () => insertAggregatedCandle(database, {
      timeframe: "ONE_DAY",
      beginAt: "2026-09-16T00:00:00.000Z",
      endAt: "2026-09-16T23:59:59.000Z",
      baseTimeframe: "ONE_MINUTE"
    }),
    /CHECK constraint failed/
  );
  assert.throws(
    () => insertAggregatedCandle(database, {
      timeframe: "ONE_WEEK",
      beginAt: "2026-09-07T00:00:00.000Z",
      endAt: "2026-09-13T23:59:59.000Z",
      baseTimeframe: "ONE_MINUTE"
    }),
    /CHECK constraint failed/
  );
  assert.throws(
    () => insertAggregatedCandle(database, {
      beginAt: "2026-09-15T09:00:00.000Z",
      endAt: "2026-09-15T09:04:59.000Z",
      componentCount: 0
    }),
    /CHECK constraint failed/
  );
  assert.throws(
    () => insertAggregatedCandle(database, {
      beginAt: "2026-09-15T10:00:00.000Z",
      endAt: "2026-09-15T10:04:59.000Z",
      componentCount: null
    }),
    /NOT NULL constraint failed/
  );

  database.close();
});
