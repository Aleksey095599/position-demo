"use strict";

const {
  roundToFractionDigits
} = require("../client-fx-deal/client-fx-deal-economics");

const COUNTERPARTY_SIDES = new Set(["BUY", "SELL"]);

function normalizedCounterpartySide(value) {
  const side = String(value || "").trim().toUpperCase();

  if (!COUNTERPARTY_SIDES.has(side)) {
    throw new RangeError("Hedge Counterparty Side must be BUY or SELL.");
  }

  return side;
}

function positiveMarketRate(value, name) {
  const rate = Number(value);

  if (!Number.isFinite(rate) || rate <= 0) {
    throw new RangeError(`${name} must be a positive number.`);
  }

  return rate;
}

function autoPricedHedgeTradeRate({
  counterpartySide,
  marketBid,
  marketOffer,
  rateFractionDigits = 4
}) {
  const side = normalizedCounterpartySide(counterpartySide);
  const bid = positiveMarketRate(marketBid, "Market Bid");
  const offer = positiveMarketRate(marketOffer, "Market Offer");

  if (offer < bid) {
    throw new RangeError("Market Offer must not be below Market Bid.");
  }

  // Сторона HEDGE_DEAL хранится со стороны контрагента:
  // его BUY означает наш SELL по Bid, его SELL — наш BUY по Offer.
  return roundToFractionDigits(side === "BUY" ? bid : offer, rateFractionDigits);
}

module.exports = {
  autoPricedHedgeTradeRate
};
