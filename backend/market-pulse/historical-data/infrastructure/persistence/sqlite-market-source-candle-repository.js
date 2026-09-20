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

function loadRangeFromRow(row) {
  return Object.freeze({
    from: row.from_at,
    till: row.till_at,
    loadedAt: row.loaded_at
  });
}

class SqliteMarketSourceCandleRepository {
  constructor({ database } = {}) {
    if (
      database === null
      || typeof database !== "object"
      || typeof database.prepare !== "function"
      || typeof database.exec !== "function"
    ) {
      throw configurationError(
        "SQLite Market Source Candle Repository requires a database connection."
      );
    }

    this.database = database;
    this.upsertStatement = database.prepare(`
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
      ON CONFLICT (instrument_id, timeframe, begin_at)
      DO UPDATE SET
        end_at = excluded.end_at,
        open_price = excluded.open_price,
        high_price = excluded.high_price,
        low_price = excluded.low_price,
        close_price = excluded.close_price,
        data_source = excluded.data_source,
        loaded_at = excluded.loaded_at
    `);
    this.findByPeriodStatement = database.prepare(`
      SELECT begin_at, end_at, open_price, high_price, low_price, close_price
      FROM market_source_candles
      WHERE instrument_id = ?
        AND timeframe = ?
        AND begin_at >= ?
        AND begin_at < ?
      ORDER BY begin_at ASC
    `);
    this.findLatestStatement = database.prepare(`
      SELECT begin_at, end_at, open_price, high_price, low_price, close_price
      FROM market_source_candles
      WHERE instrument_id = ?
        AND timeframe = ?
      ORDER BY begin_at DESC
      LIMIT 1
    `);
    this.findAllLoadedRangesStatement = database.prepare(`
      SELECT from_at, till_at, loaded_at
      FROM market_candle_load_ranges
      WHERE instrument_id = ? AND timeframe = ?
      ORDER BY from_at ASC
    `);
    this.deleteAllLoadedRangesStatement = database.prepare(`
      DELETE FROM market_candle_load_ranges
      WHERE instrument_id = ? AND timeframe = ?
    `);
    this.insertLoadedRangeStatement = database.prepare(`
      INSERT INTO market_candle_load_ranges
        (instrument_id, timeframe, from_at, till_at, loaded_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    this.findLoadedRangesStatement = database.prepare(`
      SELECT from_at, till_at, loaded_at
      FROM market_candle_load_ranges
      WHERE instrument_id = ?
        AND timeframe = ?
        AND from_at < ?
        AND till_at > ?
      ORDER BY from_at ASC
    `);
    this.coversLoadedRangeStatement = database.prepare(`
      SELECT 1
      FROM market_candle_load_ranges
      WHERE instrument_id = ?
        AND timeframe = ?
        AND from_at <= ?
        AND till_at >= ?
      LIMIT 1
    `);
  }

  upsertAll(command = {}) {
    const write = normalizedCandleWrite(command);

    if (write.candles.length === 0) {
      return 0;
    }

    return inTransaction(
      this.database,
      () => upsertCandles(this.upsertStatement, write)
    );
  }

  upsertLoadedRange(command = {}) {
    const write = normalizedCandleWrite(command);
    const range = normalizedRange(command);
    requireCandlesWithinRange(write.candles, range);

    return inTransaction(this.database, () => {
      const upsertedCandleCount = upsertCandles(
        this.upsertStatement,
        write
      );
      const existingRanges = this.findAllLoadedRangesStatement
        .all(write.instrumentId, write.timeframe)
        .map(loadRangeFromRow);
      const ranges = mergedLoadRanges([
        ...existingRanges,
        { ...range, loadedAt: write.loadedAt }
      ]);

      this.deleteAllLoadedRangesStatement.run(
        write.instrumentId,
        write.timeframe
      );

      for (const loadedRange of ranges) {
        this.insertLoadedRangeStatement.run(
          write.instrumentId,
          write.timeframe,
          loadedRange.from,
          loadedRange.till,
          loadedRange.loadedAt
        );
      }

      return upsertedCandleCount;
    });
  }

  findByPeriod({ instrumentId, timeframe, from, till } = {}) {
    const normalizedInstrument = normalizedInstrumentId(instrumentId);
    const normalizedTimeframe = requireCandleTimeframe(timeframe);
    const range = normalizedRange({ from, till });

    return Object.freeze(
      this.findByPeriodStatement
        .all(
          normalizedInstrument,
          normalizedTimeframe,
          range.from,
          range.till
        )
        .map(candleFromRow)
    );
  }

  findLatest({ instrumentId, timeframe } = {}) {
    const normalizedInstrument = normalizedInstrumentId(instrumentId);
    const normalizedTimeframe = requireCandleTimeframe(timeframe);
    const row = this.findLatestStatement.get(
      normalizedInstrument,
      normalizedTimeframe
    );

    return row ? candleFromRow(row) : null;
  }

  findLoadedRanges({ instrumentId, timeframe, from, till } = {}) {
    const normalizedInstrument = normalizedInstrumentId(instrumentId);
    const normalizedTimeframe = requireCandleTimeframe(timeframe);
    const range = normalizedRange({ from, till });

    return Object.freeze(
      this.findLoadedRangesStatement
        .all(
          normalizedInstrument,
          normalizedTimeframe,
          range.till,
          range.from
        )
        .map(loadRangeFromRow)
    );
  }

  coversLoadedRange({ instrumentId, timeframe, from, till } = {}) {
    const normalizedInstrument = normalizedInstrumentId(instrumentId);
    const normalizedTimeframe = requireCandleTimeframe(timeframe);
    const range = normalizedRange({ from, till });

    return Boolean(this.coversLoadedRangeStatement.get(
      normalizedInstrument,
      normalizedTimeframe,
      range.from,
      range.till
    ));
  }
}

module.exports = {
  SqliteMarketSourceCandleRepository
};
