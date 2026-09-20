"use strict";

const {
  createHistoricalCandlesQuery
} = require("./historical-candles-query");
const {
  requireHistoricalMarketDataSource
} = require("./historical-market-data-source");

function invalidSourceResult() {
  const error = new Error(
    "Historical Market Data Source must return a Candle collection."
  );
  error.code = "INVALID_HISTORICAL_MARKET_DATA_SOURCE_RESULT";
  return error;
}

class GetHistoricalCandlesUseCase {
  constructor({ historicalMarketDataSource } = {}) {
    this.historicalMarketDataSource = requireHistoricalMarketDataSource(
      historicalMarketDataSource
    );
  }

  async execute(query) {
    const normalizedQuery = createHistoricalCandlesQuery(query);
    const candles = await this.historicalMarketDataSource.loadCandles(
      normalizedQuery
    );

    if (!Array.isArray(candles)) {
      throw invalidSourceResult();
    }

    return Object.freeze([...candles]);
  }
}

module.exports = {
  GetHistoricalCandlesUseCase
};
