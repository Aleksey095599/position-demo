"use strict";

const RESULT_TABLES = [
  "moex_iss_minute_candle_load_result",
  "moex_iss_day_candle_load_result",
  "moex_iss_candle_aggregation_result"
];

function migrateCandleResultAttemptTimestamps(database) {
  database.exec("BEGIN IMMEDIATE");
  try {
    let changed = false;
    for (const table of RESULT_TABLES) {
      if (database.prepare(`PRAGMA table_info(${table})`).all().some(column => column.name === "last_attempt_at")) {
        database.exec(`ALTER TABLE ${table} DROP COLUMN last_attempt_at`);
        changed = true;
      }
    }
    database.exec("COMMIT");
    return changed;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

module.exports = { migrateCandleResultAttemptTimestamps };
