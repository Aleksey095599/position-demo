"use strict";

function sourceError(message) {
  const error = new TypeError(message);
  error.code = "INVALID_HISTORICAL_MARKET_DATA_SOURCE";
  return error;
}

function requireHistoricalMarketDataSource(source) {
  if (source === null || typeof source !== "object") {
    throw sourceError("Historical Market Data Source must be an object.");
  }

  if (typeof source.loadCandles !== "function") {
    throw sourceError("Historical Market Data Source must provide loadCandles(query).");
  }

  return source;
}

module.exports = {
  requireHistoricalMarketDataSource
};
