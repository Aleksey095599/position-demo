"use strict";

const {
  aggregateCandles
} = require("../domain/aggregate-candles");
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

const BASE_TIMEFRAME_BY_TARGET = Object.freeze({
  [CandleTimeframe.ONE_MINUTE]: CandleTimeframe.ONE_MINUTE,
  [CandleTimeframe.FIVE_MINUTES]: CandleTimeframe.ONE_MINUTE,
  [CandleTimeframe.FIFTEEN_MINUTES]: CandleTimeframe.ONE_MINUTE,
  [CandleTimeframe.ONE_HOUR]: CandleTimeframe.ONE_MINUTE,
  [CandleTimeframe.FOUR_HOURS]: CandleTimeframe.ONE_MINUTE,
  [CandleTimeframe.ONE_DAY]: CandleTimeframe.ONE_DAY,
  [CandleTimeframe.ONE_WEEK]: CandleTimeframe.ONE_DAY,
  [CandleTimeframe.ONE_MONTH]: CandleTimeframe.ONE_DAY
});

function invalidRepositoryResult() {
  const error = new Error(
    "Market Source Candle Repository must return a Candle collection."
  );
  error.code = "INVALID_MARKET_SOURCE_CANDLE_REPOSITORY_RESULT";
  return error;
}

class GetStoredHistoricalCandlesUseCase {
  constructor({ marketSourceCandleRepository } = {}) {
    this.marketSourceCandleRepository = requireMarketSourceCandleRepository(
      marketSourceCandleRepository
    );
    requireMarketCandleLoadRangeRepository(marketSourceCandleRepository);
  }

  async execute(query) {
    const normalizedQuery = createHistoricalCandlesQuery(query);
    const baseTimeframe = BASE_TIMEFRAME_BY_TARGET[normalizedQuery.timeframe];
    const baseQuery = {
      ...normalizedQuery,
      timeframe: baseTimeframe
    };
    const [storedCandles, coverageComplete] = await Promise.all([
      this.marketSourceCandleRepository.findByPeriod(baseQuery),
      this.marketSourceCandleRepository.coversLoadedRange(baseQuery)
    ]);

    if (!Array.isArray(storedCandles)) {
      throw invalidRepositoryResult();
    }

    const candles = baseTimeframe === normalizedQuery.timeframe
      ? Object.freeze([...storedCandles])
      : aggregateCandles({
        candles: storedCandles,
        timeframe: normalizedQuery.timeframe,
        baseTimeframe,
        from: normalizedQuery.from,
        till: normalizedQuery.till
      });

    return Object.freeze({
      ...normalizedQuery,
      baseTimeframe,
      coverageComplete: Boolean(coverageComplete),
      candles: Object.freeze([...candles])
    });
  }
}

module.exports = {
  GetStoredHistoricalCandlesUseCase
};
