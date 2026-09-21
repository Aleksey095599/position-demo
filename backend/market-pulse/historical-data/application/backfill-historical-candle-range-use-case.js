"use strict";

const {
  createCandle
} = require("../domain/candle");
const {
  CandleTimeframe
} = require("../domain/candle-timeframe");
const {
  requireMarketCandleLoadRangeRepository
} = require("../domain/market-candle-load-range-repository");
const {
  requireMarketSourceCandleRepository
} = require("../domain/market-source-candle-repository");
const {
  createHistoricalCandlesQuery
} = require("./historical-candles-query");
const {
  requirePagedHistoricalMarketDataSource
} = require("./paged-historical-market-data-source");

const DEFAULT_MINIMUM_REQUEST_INTERVAL_MS = 2000;
const DEFAULT_MAX_PAGE_COUNT = 10;
const ANCHOR_TIMEFRAMES = new Set([
  CandleTimeframe.ONE_MINUTE,
  CandleTimeframe.ONE_DAY
]);

function useCaseError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function invalidConfiguration(message) {
  const error = new TypeError(message);
  error.code = "INVALID_HISTORICAL_CANDLE_BACKFILL_CONFIGURATION";
  return error;
}

function normalizedPage(value, currentStart) {
  if (!value || typeof value !== "object" || !Array.isArray(value.candles)) {
    throw useCaseError(
      "INVALID_HISTORICAL_CANDLE_BACKFILL_PAGE",
      "Historical Market Data Source must return a Candle page."
    );
  }

  if (typeof value.hasMore !== "boolean") {
    throw useCaseError(
      "INVALID_HISTORICAL_CANDLE_BACKFILL_PAGE",
      "Historical Market Data Source page must specify whether more rows exist."
    );
  }

  if (
    value.hasMore
    && (!Number.isSafeInteger(value.nextStart) || value.nextStart <= currentStart)
  ) {
    throw useCaseError(
      "INVALID_HISTORICAL_CANDLE_BACKFILL_PAGE",
      "Historical Market Data Source page must advance its start offset."
    );
  }

  return {
    candles: value.candles.map(candle => createCandle(candle)),
    hasMore: value.hasMore,
    nextStart: value.hasMore ? value.nextStart : null
  };
}

function defaultSleep(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

class BackfillHistoricalCandleRangeUseCase {
  constructor({
    historicalMarketDataSource,
    marketSourceCandleRepository,
    minimumRequestIntervalMs = DEFAULT_MINIMUM_REQUEST_INTERVAL_MS,
    maxPageCount = DEFAULT_MAX_PAGE_COUNT,
    sleep = defaultSleep,
    now = Date.now
  } = {}) {
    this.historicalMarketDataSource = requirePagedHistoricalMarketDataSource(
      historicalMarketDataSource
    );
    this.marketSourceCandleRepository = requireMarketSourceCandleRepository(
      marketSourceCandleRepository
    );
    requireMarketCandleLoadRangeRepository(marketSourceCandleRepository);

    if (
      !Number.isSafeInteger(minimumRequestIntervalMs)
      || minimumRequestIntervalMs < 0
    ) {
      throw invalidConfiguration(
        "Minimum request interval must be a non-negative integer."
      );
    }

    if (!Number.isSafeInteger(maxPageCount) || maxPageCount < 1) {
      throw invalidConfiguration(
        "Maximum Historical Candle page count must be a positive integer."
      );
    }

    if (typeof sleep !== "function" || typeof now !== "function") {
      throw invalidConfiguration("Backfill clock and sleep dependencies must be functions.");
    }

    this.minimumRequestIntervalMs = minimumRequestIntervalMs;
    this.maxPageCount = maxPageCount;
    this.sleep = sleep;
    this.now = now;
    this.hasRequestedSource = false;
  }

  async waitBeforeSourceRequest() {
    if (this.hasRequestedSource && this.minimumRequestIntervalMs > 0) {
      await this.sleep(this.minimumRequestIntervalMs);
    }

    this.hasRequestedSource = true;
  }

  async execute(query) {
    const normalized = createHistoricalCandlesQuery(query);
    const tracked = normalized.timeframe === CandleTimeframe.ONE_MINUTE
      && typeof this.marketSourceCandleRepository.recordDayAttempt === "function";
    if (!tracked || await this.marketSourceCandleRepository.coversLoadedRange(normalized)) {
      return this.loadRange(normalized);
    }
    const attemptedAt = new Date(this.now()).toISOString();
    await this.marketSourceCandleRepository.recordDayAttempt({...normalized,attemptedAt});
    try {
      return await this.loadRange(normalized);
    } catch (error) {
      await this.marketSourceCandleRepository.recordDayAttempt({
        ...normalized,attemptedAt,error: error.code ? error.code + ": " + error.message : error.message
      });
      throw error;
    }
  }

  async loadRange(query) {
    const normalizedQuery = createHistoricalCandlesQuery(query);

    if (!ANCHOR_TIMEFRAMES.has(normalizedQuery.timeframe)) {
      throw useCaseError(
        "UNSUPPORTED_HISTORICAL_CANDLE_BACKFILL_TIMEFRAME",
        "Historical Candle backfill supports one-minute and one-day anchor Timeframes."
      );
    }

    const covered = await this.marketSourceCandleRepository.coversLoadedRange(
      normalizedQuery
    );

    if (covered) {
      return Object.freeze({
        ...normalizedQuery,
        skipped: true,
        pageCount: 0,
        fetchedCandleCount: 0,
        storedCandleCount: 0
      });
    }

    const candlesByBegin = new Map();
    const fromTimestamp = Date.parse(normalizedQuery.from);
    const tillTimestamp = Date.parse(normalizedQuery.till);
    let start = 0;
    let pageCount = 0;

    while (true) {
      await this.waitBeforeSourceRequest();

      const page = normalizedPage(
        await this.historicalMarketDataSource.loadCandlePage(
          normalizedQuery,
          { start }
        ),
        start
      );
      pageCount += 1;

      for (const candle of page.candles) {
        const beginTimestamp = Date.parse(candle.begin);

        // MOEX range boundaries are inclusive; persistence ranges are half-open.
        if (beginTimestamp >= fromTimestamp && beginTimestamp < tillTimestamp) {
          candlesByBegin.set(candle.begin, candle);
        }
      }

      if (!page.hasMore) {
        break;
      }

      if (pageCount >= this.maxPageCount) {
        throw useCaseError(
          "HISTORICAL_CANDLE_BACKFILL_PAGE_LIMIT_REACHED",
          "Historical Candle source page limit was reached before the range completed."
        );
      }

      start = page.nextStart;
    }

    const loadedAtTimestamp = Number(this.now());

    if (!Number.isFinite(loadedAtTimestamp)) {
      throw invalidConfiguration("Backfill clock must return a valid timestamp.");
    }

    const candles = Object.freeze(
      [...candlesByBegin.values()].sort(
        (left, right) => Date.parse(left.begin) - Date.parse(right.begin)
      )
    );
    const storedCandleCount = await this.marketSourceCandleRepository.upsertLoadedRange({
      ...normalizedQuery,
      candles,
      dataSource: "MOEX_ISS",
      loadedAt: new Date(loadedAtTimestamp).toISOString()
    });

    return Object.freeze({
      ...normalizedQuery,
      skipped: false,
      pageCount,
      fetchedCandleCount: candles.length,
      storedCandleCount
    });
  }
}

module.exports = {
  BackfillHistoricalCandleRangeUseCase
};
