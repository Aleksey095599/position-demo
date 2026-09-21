"use strict";

const { copyDayLoadRanges } = require("./migrate-day-candle-storage");

const DAY_MS = 86400000;
const MOSCOW_OFFSET_MS = 10800000;
function tableExists(db, name) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));
}
// Copy before retiring the old names. Legacy tables remain intact for rollback.
function migrateMarketCandleStorage(db) {
  const oldNames = ["market_candles", "market_source_candles", "market_aggregated_candles", "market_candle_load_ranges"];
  if (!oldNames.some(name => tableExists(db, name))) return false;
  db.exec("BEGIN IMMEDIATE");
  try {
    for (const name of ["market_candles", "market_source_candles"]) {
      if (!tableExists(db, name)) continue;
      const source = name === "market_candles" ? "source" : "data_source";
      const invalid = db.prepare(`SELECT COUNT(*) n FROM ${name} WHERE timeframe NOT IN ('ONE_MINUTE','ONE_DAY') OR ${source} <> 'MOEX_ISS'`).get().n;
      if (invalid) throw new Error("Cannot migrate non-MOEX or unsupported source candles.");
      for (const [timeframe, target] of [["ONE_MINUTE", "moex_iss_minute_candles"], ["ONE_DAY", "moex_iss_day_candles"]]) {
        db.prepare(`INSERT INTO ${target} (instrument_id,timeframe,begin_at,end_at,open_price,high_price,low_price,close_price,data_source,loaded_at)
          SELECT instrument_id,timeframe,begin_at,end_at,open_price,high_price,low_price,close_price,${source},loaded_at FROM ${name} WHERE timeframe=?`).run(timeframe);
      }
      db.exec(`ALTER TABLE ${name} RENAME TO legacy_${name}`);
    }
    if (tableExists(db, "market_aggregated_candles")) {
      db.exec("INSERT INTO moex_iss_aggregated_candles SELECT * FROM market_aggregated_candles");
      db.exec("ALTER TABLE market_aggregated_candles RENAME TO legacy_market_aggregated_candles");
    }
    if (tableExists(db, "market_candle_load_ranges")) {
      const insert = db.prepare(`INSERT INTO moex_iss_minute_candle_load_days
        (instrument_id,load_date,completed_at,last_attempt_at) VALUES (?,?,?,?)
        ON CONFLICT (instrument_id,load_date) DO UPDATE SET
        completed_at=MAX(completed_at,excluded.completed_at),last_attempt_at=MAX(last_attempt_at,excluded.last_attempt_at)`);
      const rows = db.prepare("SELECT * FROM market_candle_load_ranges").all();
      copyDayLoadRanges(db,rows.filter(row=>row.timeframe === "ONE_DAY"));
      for (const row of rows) {
        if (row.timeframe === "ONE_DAY") {
          continue;
        }
        if (row.timeframe !== "ONE_MINUTE") throw new Error("Unsupported legacy candle coverage timeframe.");
        // Partial boundary days remain unconfirmed; original coverage is retained in the legacy table.
        const from = Date.parse(row.from_at), till = Date.parse(row.till_at);
        const firstDay = Math.ceil((from + MOSCOW_OFFSET_MS) / DAY_MS) * DAY_MS - MOSCOW_OFFSET_MS;
        for (let t=firstDay; t+DAY_MS<=till; t+=DAY_MS) insert.run(row.instrument_id,new Date(t+MOSCOW_OFFSET_MS).toISOString().slice(0,10),row.loaded_at,row.loaded_at);
      }
      db.exec("ALTER TABLE market_candle_load_ranges RENAME TO legacy_market_candle_load_ranges");
    }
    db.exec("COMMIT");
    return true;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
module.exports = { migrateMarketCandleStorage };
