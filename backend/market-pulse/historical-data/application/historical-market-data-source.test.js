"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  requireHistoricalMarketDataSource
} = require("./historical-market-data-source");

test("accepts a Historical Market Data Source with loadCandles", () => {
  const source = {
    async loadCandles() {
      return [];
    }
  };

  assert.equal(requireHistoricalMarketDataSource(source), source);
});

test("accepts a Historical Market Data Source class instance", () => {
  class TestHistoricalMarketDataSource {
    async loadCandles() {
      return [];
    }
  }

  const source = new TestHistoricalMarketDataSource();

  assert.equal(requireHistoricalMarketDataSource(source), source);
});

test("rejects values that are not Historical Market Data Sources", () => {
  for (const invalid of [undefined, null, "", 42, [], {}, { loadCandles: true }]) {
    assert.throws(
      () => requireHistoricalMarketDataSource(invalid),
      error => error?.code === "INVALID_HISTORICAL_MARKET_DATA_SOURCE"
    );
  }
});
