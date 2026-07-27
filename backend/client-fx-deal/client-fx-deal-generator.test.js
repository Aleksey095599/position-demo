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

test("builds a base-dealt AUTO_PRICED payload from the Market Pulse quote", () => {
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
      baseCcy: "EUR",
      defaultQuoteDecimals: 4
    },
    random: () => randomValues.shift(),
    now: () => new Date(2026, 6, 24, 11, 15, 0)
  });

  assert.equal(deal.side, "BUY");
  assert.equal(deal.dealtCcyCode, "EUR");
  assert.equal(deal.dealtCcyAmount, "900000");
  assert.equal(deal.tradeRate, "1.1244");
  assert.equal(Object.hasOwn(deal, "baseCcyAmount"), false);
  assert.equal(Object.hasOwn(deal, "quoteCcyAmount"), false);
  assert.equal(Object.hasOwn(deal, "baseCcyAmountMinor"), false);
  assert.equal(Object.hasOwn(deal, "quoteCcyAmountMinor"), false);
  assert.equal(Object.hasOwn(deal, "transferRate"), false);
  assert.equal(Object.hasOwn(deal, "analyticalPnl"), false);
  assert.equal(deal.tradeDate, "2026-07-24");
  assert.equal(deal.tenor, "TOD");
  assert.equal(deal.baseCcyValueDate, "2026-07-24");
  assert.equal(deal.quoteCcyValueDate, "2026-07-24");
  assert.equal(deal.marketPulseStreamStatus, "STOPPED");
  assert.equal(deal.marketPulseBid, "1.122");
  assert.equal(deal.marketPulseOffer, "1.1222");
});

test("rejects generation for a non-AUTO_PRICED Pricing Rule", () => {
  assert.throws(() => generatedClientFxDeal({
    settings: {
      pricingMode: "DEALER_PRICED"
    }
  }), /requires an AUTO_PRICED Pricing Rule/);
});
