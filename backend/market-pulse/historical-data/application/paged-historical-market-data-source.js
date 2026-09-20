"use strict";

function sourceError(message) {
  const error = new TypeError(message);
  error.code = "INVALID_PAGED_HISTORICAL_MARKET_DATA_SOURCE";
  return error;
}

function requirePagedHistoricalMarketDataSource(source) {
  if (source === null || typeof source !== "object") {
    throw sourceError("Paged Historical Market Data Source must be an object.");
  }

  if (typeof source.loadCandlePage !== "function") {
    throw sourceError(
      "Paged Historical Market Data Source must provide loadCandlePage(query, options)."
    );
  }

  return source;
}

module.exports = {
  requirePagedHistoricalMarketDataSource
};
