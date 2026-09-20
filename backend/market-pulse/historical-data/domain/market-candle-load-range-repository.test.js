"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  requireMarketCandleLoadRangeRepository
} = require("./market-candle-load-range-repository");

function repository(overrides = {}) {
  return {
    upsertLoadedRange() {},
    findLoadedRanges() {},
    coversLoadedRange() {},
    ...overrides
  };
}

test("accepts a Market Candle Load Range Repository port implementation", () => {
  const implementation = repository();

  assert.equal(
    requireMarketCandleLoadRangeRepository(implementation),
    implementation
  );
});

test("requires every Market Candle Load Range Repository operation", () => {
  for (const method of [
    "upsertLoadedRange",
    "findLoadedRanges",
    "coversLoadedRange"
  ]) {
    assert.throws(
      () => requireMarketCandleLoadRangeRepository(
        repository({ [method]: undefined })
      ),
      error => error?.code === "INVALID_MARKET_CANDLE_LOAD_RANGE_REPOSITORY"
        && error.message.includes(method)
    );
  }

  assert.throws(
    () => requireMarketCandleLoadRangeRepository(null),
    error => error?.code === "INVALID_MARKET_CANDLE_LOAD_RANGE_REPOSITORY"
  );
});
