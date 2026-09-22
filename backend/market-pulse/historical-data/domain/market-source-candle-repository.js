"use strict";

const REQUIRED_METHODS = Object.freeze([
  "findByPeriod",
  "findLatest"
]);

function repositoryError(message) {
  const error = new TypeError(message);
  error.code = "INVALID_MARKET_SOURCE_CANDLE_REPOSITORY";
  return error;
}

function requireMarketSourceCandleRepository(repository) {
  if (repository === null || typeof repository !== "object") {
    throw repositoryError("Market Source Candle Repository must be an object.");
  }

  for (const method of REQUIRED_METHODS) {
    if (typeof repository[method] !== "function") {
      throw repositoryError(
        `Market Source Candle Repository must provide ${method}(...).`
      );
    }
  }

  return repository;
}

module.exports = {
  requireMarketSourceCandleRepository
};
