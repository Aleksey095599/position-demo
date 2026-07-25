"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  calculateAnalyticalPnl,
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
    baseCcyAmount: 30_000_000,
    tradeRate: 1.1231,
    marginPercent: 0.08,
    rateFractionDigits: 4,
    pnlFractionDigits: 2
  });

  assert.deepEqual(economics, { transferRate: 1.1222, analyticalPnl: 27_000 });
  assert.equal(calculateTransferRate({
    clientSide: "BUY",
    tradeRate: 1.1231,
    marginPercent: 0.08
  }), 1.1222);
});
