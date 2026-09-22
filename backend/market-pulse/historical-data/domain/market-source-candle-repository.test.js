"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  requireMarketSourceCandleRepository
} = require("./market-source-candle-repository");

function repository(overrides = {}) {
  return {
    findByPeriod() {},
    findLatest() {},
    ...overrides
  };
}

test("accepts a Market Source Candle Repository port implementation", () => {
  const implementation = repository();

  assert.equal(requireMarketSourceCandleRepository(implementation), implementation);
});

test("requires every Market Source Candle Repository operation", () => {
  for (const method of ["findByPeriod", "findLatest"]) {
    assert.throws(
      () => requireMarketSourceCandleRepository(repository({ [method]: undefined })),
      error => error?.code === "INVALID_MARKET_SOURCE_CANDLE_REPOSITORY"
        && error.message.includes(method)
    );
  }

  assert.throws(
    () => requireMarketSourceCandleRepository(null),
    error => error?.code === "INVALID_MARKET_SOURCE_CANDLE_REPOSITORY"
  );
});
