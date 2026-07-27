"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  calculateAnalyticalPnl,
  calculateAnalyticalPnlMinor,
  calculateClientFxDealEconomics,
  calculateTransferRate
} = require("./client-fx-deal-economics");

test("BUY deal earns the positive spread between Trade Rate and Transfer Rate", () => {
  const analyticalPnl = calculateAnalyticalPnl({
    clientSide: "BUY",
    baseCcyAmount: 30_000_000,
    tradeRate: 1.1231,
    transferRate: 1.1222
  });

  assert.equal(analyticalPnl, 27_000);
});

test("SELL deal earns the positive spread between Transfer Rate and Trade Rate", () => {
  const analyticalPnl = calculateAnalyticalPnl({
    clientSide: "SELL",
    baseCcyAmount: 10_000_000,
    tradeRate: 1.1223,
    transferRate: 1.1245
  });

  assert.equal(analyticalPnl, 22_000);
});

test("Pricing Rule margin determines Transfer Rate and Analytical PnL", () => {
  const economics = calculateClientFxDealEconomics({
    clientSide: "BUY",
    baseCcyAmountMinor: 3_000_000_000,
    baseCcyFractionDigits: 2,
    tradeRate: 1.1231,
    marginPercent: 0.08,
    rateFractionDigits: 4,
    quoteCcyFractionDigits: 2
  });

  assert.deepEqual(economics, {
    transferRate: 1.1222,
    analyticalPnlQuoteMinor: 2_700_000n,
    analyticalPnlQuoteFractionDigits: 2
  });
  assert.equal(calculateTransferRate({
    clientSide: "BUY",
    tradeRate: 1.1231,
    marginPercent: 0.08
  }), 1.1222);
});

test("Analytical PnL rounds once into quote currency minor units", () => {
  const analyticalPnlQuoteMinor = calculateAnalyticalPnlMinor({
    clientSide: "BUY",
    baseCcyAmountMinor: 100_063,
    baseCcyFractionDigits: 2,
    tradeRate: "1.12235",
    transferRate: "1.12220",
    quoteCcyFractionDigits: 2
  });

  assert.equal(analyticalPnlQuoteMinor, 15n);
});

test("Analytical PnL respects recorded Base and Quote currency precision", () => {
  assert.equal(calculateAnalyticalPnlMinor({
    clientSide: "BUY",
    baseCcyAmountMinor: 123n,
    baseCcyFractionDigits: 0,
    tradeRate: "0.0068",
    transferRate: "0.0067",
    quoteCcyFractionDigits: 3
  }), 12n);

  assert.equal(calculateAnalyticalPnlMinor({
    clientSide: "SELL",
    baseCcyAmountMinor: 700000125n,
    baseCcyFractionDigits: 3,
    tradeRate: "150.004",
    transferRate: "150.005",
    quoteCcyFractionDigits: 0
  }), 700n);
});
