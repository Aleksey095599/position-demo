"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  requirePagedHistoricalMarketDataSource
} = require("./paged-historical-market-data-source");

test("accepts a paged Historical Market Data Source", () => {
  const source = { async loadCandlePage() {} };

  assert.equal(requirePagedHistoricalMarketDataSource(source), source);
});

test("rejects a source without page loading", () => {
  assert.throws(
    () => requirePagedHistoricalMarketDataSource({}),
    error => error?.code === "INVALID_PAGED_HISTORICAL_MARKET_DATA_SOURCE"
  );
});
