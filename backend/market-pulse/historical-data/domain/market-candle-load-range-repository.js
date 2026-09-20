"use strict";

const REQUIRED_METHODS = Object.freeze([
  "upsertLoadedRange",
  "findLoadedRanges",
  "coversLoadedRange"
]);

function repositoryError(message) {
  const error = new TypeError(message);
  error.code = "INVALID_MARKET_CANDLE_LOAD_RANGE_REPOSITORY";
  return error;
}

function requireMarketCandleLoadRangeRepository(repository) {
  if (repository === null || typeof repository !== "object") {
    throw repositoryError(
      "Market Candle Load Range Repository must be an object."
    );
  }

  for (const method of REQUIRED_METHODS) {
    if (typeof repository[method] !== "function") {
      throw repositoryError(
        `Market Candle Load Range Repository must provide ${method}(...).`
      );
    }
  }

  return repository;
}

module.exports = {
  requireMarketCandleLoadRangeRepository
};
