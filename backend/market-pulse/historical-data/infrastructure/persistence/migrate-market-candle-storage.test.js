"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { DatabaseSync } = require("node:sqlite");
const {
  migrateMarketCandleStorage
} = require("./migrate-market-candle-storage");

const ROOT = path.resolve(__dirname, "..", "..", "..", "..", "..");
const SCHEMA_SOURCE = fs.readFileSync(path.join(ROOT, "schema.sql"), "utf8");

const LEGACY_SCHEMA = `
  CREATE TABLE market_candles
  (
      instrument_id TEXT    NOT NULL,
      timeframe     TEXT    NOT NULL,
      begin_at      TEXT    NOT NULL,
      end_at        TEXT    NOT NULL,
      open_price    NUMERIC NOT NULL,
      high_price    NUMERIC NOT NULL,
      low_price     NUMERIC NOT NULL,
      close_price   NUMERIC NOT NULL,
      source        TEXT    NOT NULL,
      loaded_at     TEXT    NOT NULL,
      PRIMARY KEY (instrument_id, timeframe, begin_at)
  );

  CREATE INDEX idx_market_candles_begin_at
      ON market_candles (begin_at);
`;

function openDatabaseWithLegacyStorage() {
  const database = new DatabaseSync(":memory:");
  database.exec(LEGACY_SCHEMA);
  database.exec(SCHEMA_SOURCE);
  return database;
}

function insertLegacyCandle(database, timeframe, beginAt) {
  database.prepare(`
    INSERT INTO market_candles
      (
        instrument_id,
        timeframe,
        begin_at,
        end_at,
        open_price,
        high_price,
        low_price,
        close_price,
        source,
        loaded_at
      )
    VALUES ('CNYRUB_TOM', ?, ?, ?, 12.6, 12.7, 12.5, 12.65, 'MOEX_ISS', '2026-09-16T09:00:00.000Z')
  `).run(
    timeframe,
    beginAt,
    new Date(Date.parse(beginAt) + 59_000).toISOString()
  );
}

function tableExists(database, tableName) {
  return Boolean(database.prepare(`
    SELECT 1
    FROM sqlite_master
    WHERE type = 'table' AND name = ?
  `).get(tableName));
}

test("moves every legacy Market Candle into source storage", () => {
  const database = openDatabaseWithLegacyStorage();
  insertLegacyCandle(database, "ONE_MINUTE", "2026-09-15T07:00:00.000Z");
  insertLegacyCandle(database, "FIVE_MINUTES", "2026-09-15T07:05:00.000Z");

  assert.equal(migrateMarketCandleStorage(database), true);

  assert.deepEqual(
    database.prepare(`
      SELECT timeframe, data_source
      FROM market_source_candles
      ORDER BY begin_at
    `).all().map(row => ({ ...row })),
    [
      { timeframe: "ONE_MINUTE", data_source: "MOEX_ISS" },
      { timeframe: "FIVE_MINUTES", data_source: "MOEX_ISS" }
    ]
  );
  assert.equal(
    database.prepare("SELECT COUNT(*) AS count FROM market_aggregated_candles").get().count,
    0
  );
  assert.equal(tableExists(database, "market_candles"), false);
  assert.equal(migrateMarketCandleStorage(database), false);

  database.close();
});

test("rolls back when destination storage is not empty", () => {
  const database = openDatabaseWithLegacyStorage();
  insertLegacyCandle(database, "ONE_MINUTE", "2026-09-15T07:00:00.000Z");
  database.exec(`
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
    VALUES
      (
        'USD000UTSTOM',
        'ONE_MINUTE',
        '2026-09-15T07:00:00.000Z',
        '2026-09-15T07:00:59.000Z',
        82.1,
        82.2,
        82.0,
        82.15,
        'MOEX_ISS',
        '2026-09-16T09:00:00.000Z'
      )
  `);

  assert.throws(
    () => migrateMarketCandleStorage(database),
    /requires empty destination tables/
  );
  assert.equal(tableExists(database, "market_candles"), true);
  assert.equal(
    database.prepare("SELECT COUNT(*) AS count FROM market_candles").get().count,
    1
  );
  assert.equal(
    database.prepare("SELECT COUNT(*) AS count FROM market_source_candles").get().count,
    1
  );

  database.close();
});
