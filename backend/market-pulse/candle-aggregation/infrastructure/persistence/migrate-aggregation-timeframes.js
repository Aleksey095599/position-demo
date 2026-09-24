"use strict";

function migrateAggregationTimeframes(database) {
  const table = database.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='moex_iss_candle_aggregation_result'").get();
  if (!table || table.sql.includes("'FOUR_HOURS'")) return false;
  database.exec("BEGIN IMMEDIATE");
  try {
    database.exec(`CREATE TABLE moex_iss_candle_aggregation_result_upgraded (
      instrument_id TEXT NOT NULL,
      timeframe TEXT NOT NULL CHECK (timeframe IN ('ONE_HOUR', 'FOUR_HOURS')),
      calculation_date TEXT NOT NULL CHECK (calculation_date GLOB '????-??-??' AND date(calculation_date) = calculation_date),
      calculated_at TEXT, source_loaded_at TEXT, last_error TEXT,
      PRIMARY KEY (instrument_id, timeframe, calculation_date)
    );
    INSERT INTO moex_iss_candle_aggregation_result_upgraded
      (instrument_id,timeframe,calculation_date,calculated_at,source_loaded_at,last_error)
      SELECT instrument_id,timeframe,calculation_date,calculated_at,source_loaded_at,last_error
      FROM moex_iss_candle_aggregation_result;
    DROP TABLE moex_iss_candle_aggregation_result;
    ALTER TABLE moex_iss_candle_aggregation_result_upgraded RENAME TO moex_iss_candle_aggregation_result;`);
    database.exec("COMMIT");
    return true;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

module.exports = { migrateAggregationTimeframes };
