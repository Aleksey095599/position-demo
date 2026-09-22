"use strict";

// Run before schema.sql so the destination is not created as an empty table.
// ALTER TABLE preserves every result, including failed and empty-day loads.
function migrateMinuteCandleLoadResult(database) {
  const existing = database.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'moex_iss_minute_candle_load_days'"
  ).get();
  if (!existing) return false;
  database.exec("ALTER TABLE moex_iss_minute_candle_load_days RENAME TO moex_iss_minute_candle_load_result");
  return true;
}

module.exports = { migrateMinuteCandleLoadResult };
