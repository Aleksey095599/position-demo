"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  autoPricedHedgeTradeRate
} = require("./auto-priced-hedge-rate");

test("uses Market Bid when the Hedge Counterparty buys and the bank sells", () => {
  assert.equal(autoPricedHedgeTradeRate({
    counterpartySide: "BUY",
    marketBid: 1.12201,
    marketOffer: 1.12224,
    rateFractionDigits: 4
  }), 1.122);
});

test("uses Market Offer when the Hedge Counterparty sells and the bank buys", () => {
  assert.equal(autoPricedHedgeTradeRate({
    counterpartySide: "SELL",
    marketBid: 1.12201,
    marketOffer: 1.12224,
    rateFractionDigits: 4
  }), 1.1222);
});

test("rejects an invalid or inverted Market Pulse quote", () => {
  assert.throws(() => autoPricedHedgeTradeRate({
    counterpartySide: "BUY",
    marketBid: 0,
    marketOffer: 1.1222
  }), /Market Bid must be a positive number/);

  assert.throws(() => autoPricedHedgeTradeRate({
    counterpartySide: "SELL",
    marketBid: 1.1223,
    marketOffer: 1.1222
  }), /Market Offer must not be below Market Bid/);
});
