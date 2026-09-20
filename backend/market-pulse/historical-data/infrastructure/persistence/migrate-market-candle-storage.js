"use strict";

const LEGACY_TABLE_NAME = "market_candles";
const SOURCE_TABLE_NAME = "market_source_candles";
const AGGREGATED_TABLE_NAME = "market_aggregated_candles";

function tableExists(database, tableName) {
  return Boolean(database.prepare(`
    SELECT 1
    FROM sqlite_master
    WHERE type = 'table' AND name = ?
  `).get(tableName));
}

function countRows(database, tableName) {
  return database.prepare(`SELECT COUNT(*) AS count FROM ${tableName}`).get().count;
}

function migrateMarketCandleStorage(database) {
  if (!tableExists(database, LEGACY_TABLE_NAME)) {
    return false;
  }

  database.exec("BEGIN IMMEDIATE");

  try {
    if (!tableExists(database, SOURCE_TABLE_NAME)
        || !tableExists(database, AGGREGATED_TABLE_NAME)) {
      throw new Error("Market Candle destination tables are missing.");
    }

    if (countRows(database, SOURCE_TABLE_NAME) !== 0
        || countRows(database, AGGREGATED_TABLE_NAME) !== 0) {
      throw new Error("Market Candle storage migration requires empty destination tables.");
    }

    const legacyRowCount = countRows(database, LEGACY_TABLE_NAME);

    database.exec(`
      INSERT INTO ${SOURCE_TABLE_NAME}
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
      SELECT
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
      FROM ${LEGACY_TABLE_NAME}
    `);

    const copiedRowCount = countRows(database, SOURCE_TABLE_NAME);

    if (copiedRowCount !== legacyRowCount) {
      throw new Error(
        `Market Candle storage migration copied ${copiedRowCount} of ${legacyRowCount} rows.`
      );
    }

    database.exec("DROP INDEX IF EXISTS idx_market_candles_begin_at");
    database.exec(`DROP TABLE ${LEGACY_TABLE_NAME}`);
    database.exec("COMMIT");
    return true;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

module.exports = {
  migrateMarketCandleStorage
};
