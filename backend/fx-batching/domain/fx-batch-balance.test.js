"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  fxTradeBalanceContributions
} = require("./fx-batch-balance");

test("SELL contributes positive sold base and negative bought quote currency", () => {
  assert.deepEqual(
    fxTradeBalanceContributions({
      side: "SELL",
      baseCcyCode: "EUR",
      quoteCcyCode: "USD",
      baseCcyAmountMinor: 100_000_000,
      quoteCcyAmountMinor: 112_300_000
    }),
    {
      baseCcyCode: "EUR",
      quoteCcyCode: "USD",
      baseBalanceContributionMinor: 100_000_000,
      quoteBalanceContributionMinor: -112_300_000
    }
  );
});

test("BUY contributes negative bought base and positive sold quote currency", () => {
  assert.deepEqual(
    fxTradeBalanceContributions({
      side: "BUY",
      baseCcyCode: "EUR",
      quoteCcyCode: "USD",
      baseCcyAmountMinor: 100_000_000,
      quoteCcyAmountMinor: 112_300_000
    }),
    {
      baseCcyCode: "EUR",
      quoteCcyCode: "USD",
      baseBalanceContributionMinor: -100_000_000,
      quoteBalanceContributionMinor: 112_300_000
    }
  );
});

test("FX balance contribution rejects an absent trade side", () => {
  assert.throws(
    () => fxTradeBalanceContributions({
      side: null,
      baseCcyCode: "EUR",
      quoteCcyCode: "USD",
      baseCcyAmountMinor: 100_000_000,
      quoteCcyAmountMinor: 112_300_000
    }),
    /side must be BUY or SELL/
  );
});
