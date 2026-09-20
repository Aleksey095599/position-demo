"use strict";

const {
  aggregateCandles
} = require("../domain/aggregate-candles");
const {
  CandleTimeframe
} = require("../domain/candle-timeframe");
const {
  requireMarketSourceCandleRepository
} = require("../domain/market-source-candle-repository");
const {
  createHistoricalCandlesQuery
} = require("./historical-candles-query");
const {
  requireHistoricalMarketDataSource
} = require("./historical-market-data-source");

const ONE_MINUTE_MS = 60 * 1000;
const TARGET_TIMEFRAME_DURATION_MS = Object.freeze({
  [CandleTimeframe.FIVE_MINUTES]: 5 * ONE_MINUTE_MS,
  [CandleTimeframe.FIFTEEN_MINUTES]: 15 * ONE_MINUTE_MS
});

function unsupportedTimeframe() {
  const error = new RangeError(
    "Historical Candle synchronization supports five- and fifteen-minute Timeframes."
  );
  error.code = "UNSUPPORTED_HISTORICAL_SYNC_TIMEFRAME";
  return error;
}

function invalidSourceResult() {
  const error = new Error(
    "Historical Market Data Source must return a Candle collection."
  );
  error.code = "INVALID_HISTORICAL_MARKET_DATA_SOURCE_RESULT";
  return error;
}

function invalidClock() {
  const error = new TypeError(
    "Sync One Minute Candles Use Case requires a clock that returns a valid timestamp."
  );
  error.code = "INVALID_SYNC_ONE_MINUTE_CANDLES_CLOCK";
  return error;
}

class SyncOneMinuteCandlesUseCase {
  constructor({
    historicalMarketDataSource,
    marketSourceCandleRepository,
    now = Date.now
  } = {}) {
    this.historicalMarketDataSource = requireHistoricalMarketDataSource(
      historicalMarketDataSource
    );
    this.marketSourceCandleRepository = requireMarketSourceCandleRepository(
      marketSourceCandleRepository
    );

    if (typeof now !== "function") {
      throw invalidClock();
    }

    this.now = now;
  }

  async execute(query) {
    const normalizedQuery = createHistoricalCandlesQuery(query);
    const targetDurationMs = TARGET_TIMEFRAME_DURATION_MS[
      normalizedQuery.timeframe
    ];

    if (!targetDurationMs) {
      throw unsupportedTimeframe();
    }

    const currentTimestamp = Number(this.now());

    if (!Number.isFinite(currentTimestamp)) {
      throw invalidClock();
    }

    const fromTimestamp = Date.parse(normalizedQuery.from);
    const requestedTillTimestamp = Date.parse(normalizedQuery.till);
    const closedMinuteBoundary = Math.floor(
      currentTimestamp / ONE_MINUTE_MS
    ) * ONE_MINUTE_MS;
    const minuteTillTimestamp = Math.min(
      requestedTillTimestamp,
      closedMinuteBoundary
    );

    if (minuteTillTimestamp <= fromTimestamp) {
      return Object.freeze({
        ...normalizedQuery,
        storedMinuteCandleCount: 0,
        candles: Object.freeze([])
      });
    }

    const sourceQuery = Object.freeze({
      ...normalizedQuery,
      timeframe: CandleTimeframe.ONE_MINUTE,
      till: new Date(minuteTillTimestamp).toISOString()
    });
    const sourceCandles = await this.historicalMarketDataSource.loadCandles(
      sourceQuery
    );

    if (!Array.isArray(sourceCandles)) {
      throw invalidSourceResult();
    }

    const closedMinuteCandles = sourceCandles.filter(candle => {
      const candleBegin = Date.parse(candle?.begin);
      const candleEndBoundary = candleBegin + ONE_MINUTE_MS;

      return Number.isFinite(candleBegin)
        && candleBegin >= fromTimestamp
        && candleEndBoundary <= minuteTillTimestamp
        && candleEndBoundary <= currentTimestamp;
    });
    const storedMinuteCandleCount = await this.marketSourceCandleRepository.upsertAll({
      instrumentId: normalizedQuery.instrumentId,
      timeframe: CandleTimeframe.ONE_MINUTE,
      candles: closedMinuteCandles,
      dataSource: "MOEX_ISS",
      loadedAt: new Date(currentTimestamp).toISOString()
    });
    const closedTargetBoundary = Math.floor(
      currentTimestamp / targetDurationMs
    ) * targetDurationMs;
    const targetTillTimestamp = Math.min(
      requestedTillTimestamp,
      closedTargetBoundary
    );
    const candles = targetTillTimestamp > fromTimestamp
      ? aggregateCandles({
        candles: closedMinuteCandles,
        timeframe: normalizedQuery.timeframe,
        from: normalizedQuery.from,
        till: new Date(targetTillTimestamp).toISOString()
      })
      : Object.freeze([]);

    return Object.freeze({
      ...normalizedQuery,
      storedMinuteCandleCount,
      candles
    });
  }
}

module.exports = {
  SyncOneMinuteCandlesUseCase
};
