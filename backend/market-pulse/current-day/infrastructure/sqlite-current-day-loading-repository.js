"use strict";

const { createCandle } = require("../../historical-data/domain/candle");
const { DEFAULT_SETTINGS, validateSettings, mergeRanges } = require("../domain/current-day-loading");

function transaction(database, action) {
  database.exec("BEGIN IMMEDIATE");
  try {
    const result = action();
    database.exec("COMMIT");
    return result;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

class SqliteCurrentDayLoadingRepository {
  constructor({ database, sourceRepository }) {
    this.database = database;
    this.source = sourceRepository;
    database.exec(`
      CREATE TABLE IF NOT EXISTS market_current_day_loading_settings (
        id INTEGER PRIMARY KEY CHECK(id=1),
        auto_start INTEGER NOT NULL DEFAULT 0 CHECK(auto_start IN (0,1)),
        poll_interval_minutes INTEGER NOT NULL DEFAULT 1 CHECK(poll_interval_minutes BETWEEN 1 AND 60),
        reload_after_day_end INTEGER NOT NULL DEFAULT 0 CHECK(reload_after_day_end IN (0,1))
      );
      INSERT OR IGNORE INTO market_current_day_loading_settings(id) VALUES(1);
      CREATE TABLE IF NOT EXISTS moex_iss_current_day_load_result (
        instrument_id TEXT NOT NULL,
        load_date TEXT NOT NULL,
        last_attempt_at TEXT,
        last_success_at TEXT,
        last_error TEXT,
        checked_ranges TEXT NOT NULL DEFAULT '[]',
        error_range TEXT,
        reload_requested INTEGER NOT NULL DEFAULT 0 CHECK(reload_requested IN (0,1)),
        finalized_at TEXT,
        finalization_error TEXT,
        PRIMARY KEY(instrument_id,load_date)
      );
    `);
  }
  getSettings() {
    const row = this.database.prepare("SELECT * FROM market_current_day_loading_settings WHERE id=1").get();
    return validateSettings({ autoStart: Boolean(row.auto_start), pollIntervalMinutes: row.poll_interval_minutes,
      reloadAfterDayEnd: Boolean(row.reload_after_day_end) }, DEFAULT_SETTINGS);
  }
  updateSettings(patch) {
    const value = validateSettings(patch, this.getSettings());
    this.database.prepare(`UPDATE market_current_day_loading_settings SET auto_start=?,poll_interval_minutes=?,reload_after_day_end=? WHERE id=1`)
      .run(Number(value.autoStart), value.pollIntervalMinutes, Number(value.reloadAfterDayEnd));
    return value;
  }
  touch({ instrumentId, date, reloadRequested }) {
    this.database.prepare(`INSERT INTO moex_iss_current_day_load_result(instrument_id,load_date,reload_requested) VALUES(?,?,?)
      ON CONFLICT(instrument_id,load_date) DO UPDATE SET reload_requested=MAX(reload_requested,excluded.reload_requested)`)
      .run(instrumentId, date, Number(reloadRequested));
  }
  state(instrumentId, date) {
    const row = this.database.prepare("SELECT * FROM moex_iss_current_day_load_result WHERE instrument_id=? AND load_date=?").get(instrumentId, date);
    return { lastAttemptAt: row?.last_attempt_at || null, lastSuccessAt: row?.last_success_at || null,
      lastError: row?.last_error || null, checkedRanges: JSON.parse(row?.checked_ranges || "[]"),
      errorRange: row?.error_range ? JSON.parse(row.error_range) : null };
  }
  recordAttempt({ instrumentId, date, attemptedAt }) {
    this.database.prepare("UPDATE moex_iss_current_day_load_result SET last_attempt_at=? WHERE instrument_id=? AND load_date=?")
      .run(attemptedAt, instrumentId, date);
  }
  saveCurrent({ instrumentId, date, candles, checkedRange, loadedAt }) {
    const validated = candles.map(candle => createCandle(candle));
    return transaction(this.database, () => {
      this.writeCandles(instrumentId, "ONE_MINUTE", validated, loadedAt);
      const current = this.state(instrumentId, date);
      const ranges = mergeRanges([...current.checkedRanges, ...(checkedRange ? [checkedRange] : [])]);
      this.database.prepare(`UPDATE moex_iss_current_day_load_result SET last_success_at=?,last_error=NULL,
        checked_ranges=?,error_range=NULL WHERE instrument_id=? AND load_date=?`)
        .run(loadedAt, JSON.stringify(ranges), instrumentId, date);
      return validated.length;
    });
  }
  recordFailure({ instrumentId, date, error, range }) {
    this.database.prepare("UPDATE moex_iss_current_day_load_result SET last_error=?,error_range=? WHERE instrument_id=? AND load_date=?")
      .run(String(error).slice(0, 1000), JSON.stringify(range), instrumentId, date);
  }
  writeCandles(instrumentId, timeframe, candles, loadedAt) {
    const statement = this.source.candleStatement(timeframe);
    for (const candle of candles) {
      statement.run(instrumentId, timeframe, candle.begin, candle.end, candle.open, candle.high,
        candle.low, candle.close, "MOEX_ISS", loadedAt);
    }
  }
  pending(instrumentId, beforeDate) {
    return this.database.prepare(`SELECT load_date date,finalization_error lastError FROM moex_iss_current_day_load_result
      WHERE instrument_id=? AND load_date<? AND reload_requested=1 AND finalized_at IS NULL ORDER BY load_date`)
      .all(instrumentId, beforeDate).map(row => ({ ...row }));
  }
  latestFinalization(instrumentId) {
    const row = this.database.prepare(`SELECT load_date date,finalized_at completedAt FROM moex_iss_current_day_load_result
      WHERE instrument_id=? AND finalized_at IS NOT NULL ORDER BY load_date DESC LIMIT 1`).get(instrumentId);
    return row ? { ...row } : null;
  }
  replaceCompletedDay({ instrumentId, date, from, till, minuteCandles, dayCandles, loadedAt }) {
    const sources = [{ timeframe: "ONE_MINUTE", table: "moex_iss_minute_candles", result: "moex_iss_minute_candle_load_result", candles: minuteCandles },
      { timeframe: "ONE_DAY", table: "moex_iss_day_candles", result: "moex_iss_day_candle_load_result", candles: dayCandles }];
    for (const source of sources) {
      source.candles = source.candles.map(candle => createCandle(candle));
      if (source.candles.some(candle => candle.begin < from || candle.begin >= till || candle.end >= till)) {
        throw new RangeError("Reloaded candles must belong to the completed Moscow day.");
      }
    }
    transaction(this.database, () => {
      for (const source of sources) {
        this.database.prepare(`DELETE FROM ${source.table} WHERE instrument_id=? AND begin_at>=? AND begin_at<?`).run(instrumentId, from, till);
        this.writeCandles(instrumentId, source.timeframe, source.candles, loadedAt);
        this.database.prepare(`INSERT INTO ${source.result}(instrument_id,load_date,completed_at,last_error) VALUES(?,?,?,NULL)
          ON CONFLICT(instrument_id,load_date) DO UPDATE SET completed_at=excluded.completed_at,last_error=NULL`).run(instrumentId, date, loadedAt);
      }
    });
  }
  completeFinalization({ instrumentId, date, completedAt }) {
    this.database.prepare("UPDATE moex_iss_current_day_load_result SET finalized_at=?,finalization_error=NULL WHERE instrument_id=? AND load_date=?")
      .run(completedAt, instrumentId, date);
  }
  failFinalization({ instrumentId, date, error }) {
    this.database.prepare("UPDATE moex_iss_current_day_load_result SET finalization_error=? WHERE instrument_id=? AND load_date=?")
      .run(String(error).slice(0, 1000), instrumentId, date);
  }
}
module.exports = { SqliteCurrentDayLoadingRepository };
