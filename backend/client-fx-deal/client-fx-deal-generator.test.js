"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  generatedBaseCcyAmount,
  generatedClientFxDeal,
  generatedClientSide
} = require("./client-fx-deal-generator");

test("generates a stepped amount without exceeding the configured maximum", () => {
  assert.equal(generatedBaseCcyAmount({
    minBaseCcyAmount: 500000,
    maxBaseCcyAmount: 1000000,
    baseCcyAmountStep: 200000
  }, () => 0.999), 900000);
});

test("uses BUY probability as the single source for BUY and SELL selection", () => {
  assert.equal(generatedClientSide(100, () => 0.999), "BUY");
  assert.equal(generatedClientSide(0, () => 0), "SELL");
});

test("builds TOD Client FX Deal economics from the Market Pulse side and Pricing Rule margin", () => {
  const randomValues = [0.25, 0.999];
  const deal = generatedClientFxDeal({
    settings: {
      pricingRuleId: 5,
      partyId: 3,
      executionContextId: 5,
      ccyPairCode: "EUR_USD",
      pricingMode: "AUTO_PRICED",
      marginPercent: 0.2,
      minBaseCcyAmount: 500000,
      maxBaseCcyAmount: 1000000,
      baseCcyAmountStep: 200000,
      buyProbabilityPercent: 50
    },
    marketPulseSnapshot: {
      status: "STOPPED",
      generatedAt: "2026-07-24T08:15:00.000Z"
    },
    quote: {
      pairCode: "EUR_USD",
      bid: 1.122,
      offer: 1.1222
    },
    pair: {
      pairCode: "EUR_USD",
      defaultQuoteDecimals: 4
    },
    quoteCurrencyFractionDigits: 2,
    random: () => randomValues.shift(),
    now: () => new Date(2026, 6, 24, 11, 15, 0)
  });

  assert.equal(deal.side, "BUY");
  assert.equal(deal.baseCcyAmount, 900000);
  assert.equal(deal.tradeRate, 1.1244);
  assert.equal(deal.transferRate, 1.1222);
  assert.equal(deal.quoteCcyAmount, 1011960);
  assert.equal(deal.analyticalPnl, 1980);
  assert.equal(deal.tradeDate, "2026-07-24");
  assert.equal(deal.tenor, "TOD");
  assert.equal(deal.baseCcyValueDate, "2026-07-24");
  assert.equal(deal.quoteCcyValueDate, "2026-07-24");
  assert.equal(deal.marketPulseStreamStatus, "STOPPED");
});

test("rejects generation for a non-AUTO_PRICED Pricing Rule", () => {
  assert.throws(() => generatedClientFxDeal({
    settings: {
      pricingMode: "DEALER_PRICED"
    }
  }), /requires an AUTO_PRICED Pricing Rule/);
});
