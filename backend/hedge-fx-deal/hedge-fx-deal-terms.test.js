"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  calculateHedgeTransferRate,
  createHedgeFxDealTerms
} = require("./hedge-fx-deal-terms");

test("Hedge Pricing Rule margin determines Transfer Rate independently", () => {
  assert.equal(calculateHedgeTransferRate({
    hedgeSide: "BUY",
    tradeRate: 1.1231,
    marginPercent: 0.08,
    rateFractionDigits: 4
  }), 1.1222);
});

test("Hedge Deal terms derive quote amount, dates and zero-margin economics", () => {
  const terms = createHedgeFxDealTerms({
    hedgeSide: "SELL",
    baseCcyAmount: 1_000_000,
    tradeRate: 1.1234,
    tenor: "SPOT",
    marginPercent: 0,
    rateFractionDigits: 4,
    quoteFractionDigits: 2,
    now: () => new Date(2026, 6, 24, 12, 30, 0)
  });

  assert.deepEqual(terms, {
    entryTimestamp: new Date(2026, 6, 24, 12, 30, 0).toISOString(),
    tradeDate: "2026-07-24",
    side: "SELL",
    baseCcyAmount: 1_000_000,
    quoteCcyAmount: 1_123_400,
    tradeRate: 1.1234,
    transferRate: 1.1234,
    analyticalPnlQuoteMinor: 0n,
    analyticalPnlQuoteFractionDigits: 2,
    tenor: "SPOT",
    baseCcyValueDate: "2026-07-28",
    quoteCcyValueDate: "2026-07-28"
  });
});

test("Hedge Deal terms use decimal minor-unit rounding for amounts", () => {
  const terms = createHedgeFxDealTerms({
    hedgeSide: "SELL",
    baseCcyAmount: "1000.63",
    tradeRate: "1.12235",
    tenor: "TOD",
    marginPercent: "0",
    rateFractionDigits: 5,
    baseFractionDigits: 2,
    quoteFractionDigits: 2,
    now: () => new Date(2026, 6, 24, 12, 30, 0)
  });

  assert.equal(terms.baseCcyAmount, 1000.63);
  assert.equal(terms.quoteCcyAmount, 1123.06);
  assert.equal(terms.tradeRate, 1.12235);
  assert.equal(terms.transferRate, 1.12235);
  assert.equal(terms.analyticalPnlQuoteMinor, 0n);
  assert.equal(terms.analyticalPnlQuoteFractionDigits, 2);
});

test("Hedge Deal terms reject precision below the Base currency minor unit", () => {
  assert.throws(
    () => createHedgeFxDealTerms({
      hedgeSide: "BUY",
      baseCcyAmount: "1000.001",
      tradeRate: "1.12235",
      tenor: "TOD",
      marginPercent: "0",
      rateFractionDigits: 5,
      baseFractionDigits: 2,
      quoteFractionDigits: 2
    }),
    /more than 2 fractional digits/
  );
});
