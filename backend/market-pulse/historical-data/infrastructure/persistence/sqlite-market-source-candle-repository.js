"use strict";

const {
  createCandle
} = require("../../domain/candle");
const {
  requireCandleTimeframe
} = require("../../domain/candle-timeframe");

function repositoryError(message) {
  const error = new RangeError(message);
  error.code = "INVALID_MARKET_SOURCE_CANDLE_REPOSITORY_ARGUMENT";
  return error;
}

function configurationError(message) {
  const error = new TypeError(message);
  error.code = "INVALID_SQLITE_MARKET_SOURCE_CANDLE_REPOSITORY_CONFIGURATION";
  return error;
}

function normalizedInstrumentId(value) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw repositoryError("Instrument ID must be a non-empty string.");
  }

  return value.trim();
}

function normalizedDataSource(value) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw repositoryError("Candle Data Source must be a non-empty string.");
  }

  return value.trim();
}

function normalizedTimestamp(value, name) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    throw repositoryError(`${name} must be an ISO 8601 timestamp with a UTC offset.`);
  }

  const timestamp = Date.parse(value);

  if (!Number.isFinite(timestamp)) {
    throw repositoryError(`${name} must be a valid timestamp.`);
  }

  return {
    milliseconds: timestamp,
    value: new Date(timestamp).toISOString()
  };
}

function normalizedCandles(value) {
  if (!Array.isArray(value)) {
    throw repositoryError("Candles must be an array.");
  }

  return value.map(candle => createCandle(candle));
}

function normalizedCandleWrite(value = {}) {
  return {
    instrumentId: normalizedInstrumentId(value.instrumentId),
    timeframe: requireCandleTimeframe(value.timeframe),
    candles: normalizedCandles(value.candles),
    dataSource: normalizedDataSource(value.dataSource),
    loadedAt: normalizedTimestamp(value.loadedAt, "Loaded At").value
  };
}

function normalizedRange({ from, till } = {}) {
  const normalizedFrom = normalizedTimestamp(from, "From");
  const normalizedTill = normalizedTimestamp(till, "Till");

  if (normalizedFrom.milliseconds >= normalizedTill.milliseconds) {
    throw repositoryError("From must be earlier than Till.");
  }

  return {
    from: normalizedFrom.value,
    till: normalizedTill.value
  };
}

function requireCandlesWithinRange(candles, range) {
  const rangeFrom = Date.parse(range.from);
  const rangeTill = Date.parse(range.till);

  for (const candle of candles) {
    if (
      Date.parse(candle.begin) < rangeFrom
      || Date.parse(candle.end) >= rangeTill
    ) {
      throw repositoryError(
        "Every Candle must be fully contained in the loaded Range."
      );
    }
  }
}

function inTransaction(database, action) {
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

function mergedLoadRanges(ranges) {
  const merged = [];

  [...ranges]
    .sort((left, right) => left.from.localeCompare(right.from))
    .forEach(range => {
      const current = merged.at(-1);

      if (!current || current.till < range.from) {
        merged.push({ ...range });
        return;
      }

      if (range.till > current.till) {
        current.till = range.till;
      }

      if (range.loadedAt > current.loadedAt) {
        current.loadedAt = range.loadedAt;
      }
    });

  return merged;
}

function upsertCandles(statement, write) {
  for (const candle of write.candles) {
    statement.run(
      write.instrumentId,
      write.timeframe,
      candle.begin,
      candle.end,
      candle.open,
      candle.high,
      candle.low,
      candle.close,
      write.dataSource,
      write.loadedAt
    );
  }

  return write.candles.length;
}

function candleFromRow(row) {
  return createCandle({
    begin: row.begin_at,
    end: row.end_at,
    open: String(row.open_price),
    high: String(row.high_price),
    low: String(row.low_price),
    close: String(row.close_price)
  });
}

const DAY_MS = 86400000;
const MOSCOW_OFFSET_MS = 10800000;
function sourceTable(timeframe) {
  requireCandleTimeframe(timeframe);
  if (timeframe === "ONE_MINUTE") return "moex_iss_minute_candles";
  if (timeframe === "ONE_DAY") return "moex_iss_day_candles";
  throw repositoryError("Source candles must have a one-minute or one-day timeframe.");
}
function loadResultTable(timeframe) {
  sourceTable(timeframe);
  return timeframe === "ONE_MINUTE" ? "moex_iss_minute_candle_load_result" : "moex_iss_day_candle_load_result";
}
function sourceCalendarDays(range, requireComplete = true) {
  const from = Date.parse(range.from), till = Date.parse(range.till);
  if (requireComplete && ((from + MOSCOW_OFFSET_MS) % DAY_MS || (till + MOSCOW_OFFSET_MS) % DAY_MS)) {
    throw repositoryError("Source candle day tracking requires complete Moscow calendar days.");
  }
  const days = [];
  const first = Math.ceil((from + MOSCOW_OFFSET_MS) / DAY_MS) * DAY_MS - MOSCOW_OFFSET_MS;
  for (let time = first; time + DAY_MS <= till; time += DAY_MS) {
    days.push(new Date(time + MOSCOW_OFFSET_MS).toISOString().slice(0,10));
  }
  return days;
}
class SqliteMarketSourceCandleRepository {
  constructor({ database } = {}) {
    if (!database || typeof database.prepare !== "function" || typeof database.exec !== "function") {
      throw configurationError("SQLite Market Source Candle Repository requires a database connection.");
    }
    this.database = database;
  }
  candleStatement(timeframe) {
    return this.database.prepare(`INSERT INTO ${sourceTable(timeframe)}
      (instrument_id,timeframe,begin_at,end_at,open_price,high_price,low_price,close_price,data_source,loaded_at)
      VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT (instrument_id,timeframe,begin_at) DO UPDATE SET
      end_at=excluded.end_at,open_price=excluded.open_price,high_price=excluded.high_price,
      low_price=excluded.low_price,close_price=excluded.close_price,loaded_at=excluded.loaded_at`);
  }
  upsertLoadedRange(command = {}) {
    const write = normalizedCandleWrite(command);
    const range = normalizedRange(command);
    requireCandlesWithinRange(write.candles, range);
    const days = sourceCalendarDays(range);
    const statement = this.candleStatement(write.timeframe);
    return inTransaction(this.database, () => {
      const count = upsertCandles(statement, write);
      const insert = this.database.prepare(`INSERT INTO ${loadResultTable(write.timeframe)}
        (instrument_id,load_date,completed_at,last_error) VALUES (?,?,?,NULL)
        ON CONFLICT (instrument_id,load_date) DO UPDATE SET completed_at=excluded.completed_at,
        last_error=NULL`);
      for (const date of days) insert.run(write.instrumentId,date,write.loadedAt);
      return count;
    });
  }
  recordDayFailure({ instrumentId, timeframe = "ONE_MINUTE", from, till, error }) {
    const table = loadResultTable(timeframe);
    const dates = sourceCalendarDays(normalizedRange({from,till}));
    const insert = this.database.prepare(`INSERT INTO ${table}
      (instrument_id,load_date,last_error) VALUES (?,?,?)
      ON CONFLICT (instrument_id,load_date) DO UPDATE SET
      last_error=excluded.last_error`);
    for (const date of dates) insert.run(normalizedInstrumentId(instrumentId),date,String(error).slice(0,1000));
  }
  findByPeriod({ instrumentId, timeframe, from, till } = {}) {
    const range = normalizedRange({from,till});
    return Object.freeze(this.database.prepare(`SELECT begin_at,end_at,open_price,high_price,low_price,close_price
      FROM ${sourceTable(timeframe)} WHERE instrument_id=? AND begin_at>=? AND begin_at<? ORDER BY begin_at`)
      .all(normalizedInstrumentId(instrumentId),range.from,range.till).map(candleFromRow));
  }
  findLatest({ instrumentId, timeframe } = {}) {
    const row = this.database.prepare(`SELECT begin_at,end_at,open_price,high_price,low_price,close_price
      FROM ${sourceTable(timeframe)} WHERE instrument_id=? ORDER BY begin_at DESC LIMIT 1`).get(normalizedInstrumentId(instrumentId));
    return row ? candleFromRow(row) : null;
  }
  findLoadedRanges({ instrumentId, timeframe, from, till } = {}) {
    const range = normalizedRange({from,till});
    const instrument = normalizedInstrumentId(instrumentId);
    const dates = this.database.prepare(`SELECT load_date,completed_at FROM ${loadResultTable(timeframe)}
      WHERE instrument_id=? AND completed_at IS NOT NULL AND load_date>=? AND load_date<=? ORDER BY load_date`)
      .all(instrument,new Date(Date.parse(range.from)+MOSCOW_OFFSET_MS).toISOString().slice(0,10),new Date(Date.parse(range.till)+MOSCOW_OFFSET_MS).toISOString().slice(0,10));
    return Object.freeze(mergedLoadRanges(dates.map(row => {
      const begin = Date.parse(`${row.load_date}T00:00:00+03:00`);
      return {from:new Date(begin).toISOString(),till:new Date(begin+DAY_MS).toISOString(),loadedAt:row.completed_at};
    })).filter(r => r.from < range.till && r.till > range.from));
  }
  coversLoadedRange(query = {}) {
    const range = normalizedRange(query);
    return this.findLoadedRanges(query).some(r => r.from <= range.from && r.till >= range.till);
  }
  findSourceDaySummaries({ instrumentId, timeframe, fromDate, throughDate }) {
    const instrument = normalizedInstrumentId(instrumentId);
    const from = new Date(`${fromDate}T00:00:00+03:00`).toISOString();
    const till = new Date(Date.parse(`${throughDate}T00:00:00+03:00`)+DAY_MS).toISOString();
    const rows = this.database.prepare(`SELECT date(begin_at,'+3 hours') date,COUNT(*) candleCount,
      COUNT(DISTINCT strftime('%Y-%m-%dT%H',begin_at,'+3 hours')) hourCount,
      COUNT(DISTINCT CAST(strftime('%H',begin_at,'+3 hours') AS INTEGER) / 4) fourHourCount,
      MIN(begin_at) firstCandleAt,MAX(begin_at) lastCandleAt FROM ${sourceTable(timeframe)}
      WHERE instrument_id=? AND begin_at>=? AND begin_at<? GROUP BY date(begin_at,'+3 hours')`)
      .all(instrument,from,till);
    const byDate = new Map(rows.map(row => [row.date,{...row}]));
    const boundary = this.database.prepare(`SELECT begin_at,end_at,open_price,high_price,low_price,close_price
      FROM ${sourceTable(timeframe)} WHERE instrument_id=? AND begin_at=?`);
    for (const day of byDate.values()) {
      day.firstCandle = candleFromRow(boundary.get(instrument,day.firstCandleAt));
      day.lastCandle = day.lastCandleAt === day.firstCandleAt ? day.firstCandle
        : candleFromRow(boundary.get(instrument,day.lastCandleAt));
    }
    for (const row of this.database.prepare(`SELECT load_date date,completed_at completedAt,
      last_error lastError FROM ${loadResultTable(timeframe)}
      WHERE instrument_id=? AND load_date>=? AND load_date<=?`).all(instrument,fromDate,throughDate)) {
      byDate.set(row.date,{candleCount:0,...byDate.get(row.date),...row});
    }
    return [...byDate.values()];
  }
}
module.exports = { SqliteMarketSourceCandleRepository };
