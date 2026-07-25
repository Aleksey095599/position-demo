"use strict";

const { calculateClientFxDealEconomics } = require("./client-fx-deal-economics");

function finiteNumber(value, name) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    throw new TypeError(`${name} must be a finite number.`);
  }

  return number;
}

function positiveNumber(value, name) {
  const number = finiteNumber(value, name);

  if (number <= 0) {
    throw new RangeError(`${name} must be a positive number.`);
  }

  return number;
}

function normalizedProbability(value) {
  const probability = Number(value);

  if (!Number.isInteger(probability) || probability < 0 || probability > 100) {
    throw new RangeError("Buy Probability Percent must be an integer from 0 to 100.");
  }

  return probability;
}

function normalizedRandomValue(random) {
  const value = finiteNumber(random(), "Random value");

  if (value < 0 || value >= 1) {
    throw new RangeError("Random value must be greater than or equal to 0 and less than 1.");
  }

  return value;
}

function roundToFractionDigits(value, fractionDigits) {
  if (!Number.isInteger(fractionDigits) || fractionDigits < 0 || fractionDigits > 10) {
    throw new RangeError("Fraction digits must be an integer from 0 to 10.");
  }

  return Number(value.toFixed(fractionDigits));
}

function generatedBaseCcyAmount(settings, random = Math.random) {
  const minimum = positiveNumber(settings.minBaseCcyAmount, "Min Base Ccy Amount");
  const maximum = positiveNumber(settings.maxBaseCcyAmount, "Max Base Ccy Amount");
  const step = positiveNumber(settings.baseCcyAmountStep, "Base Ccy Amount Step");

  if (maximum < minimum) {
    throw new RangeError("Max Base Ccy Amount must not be below Min Base Ccy Amount.");
  }

  const stepCount = Math.floor((maximum - minimum) / step);
  return minimum + Math.floor(normalizedRandomValue(random) * (stepCount + 1)) * step;
}

function generatedClientSide(buyProbabilityPercent, random = Math.random) {
  const probability = normalizedProbability(buyProbabilityPercent);
  return normalizedRandomValue(random) * 100 < probability ? "BUY" : "SELL";
}

function localIsoCalendarDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function generatedClientFxDeal({
  settings,
  marketPulseSnapshot,
  quote,
  pair,
  quoteCurrencyFractionDigits = 2,
  random = Math.random,
  now = () => new Date()
}) {
  if (!settings || typeof settings !== "object") {
    throw new TypeError("Client Deal Generation Settings are required.");
  }

  if (settings.pricingMode !== "AUTO_PRICED") {
    throw new RangeError("Client Deal Generation requires an AUTO_PRICED Pricing Rule.");
  }

  if (!marketPulseSnapshot || typeof marketPulseSnapshot !== "object") {
    throw new TypeError("Market Pulse snapshot is required.");
  }

  if (!quote || typeof quote !== "object") {
    throw new TypeError("Market Pulse quote is required.");
  }

  if (!pair || typeof pair !== "object") {
    throw new TypeError("Ccy Pair is required.");
  }

  const timestamp = now();

  if (!(timestamp instanceof Date) || Number.isNaN(timestamp.getTime())) {
    throw new TypeError("Current timestamp must be a valid Date.");
  }

  const side = generatedClientSide(settings.buyProbabilityPercent, random);
  const baseCcyAmount = generatedBaseCcyAmount(settings, random);
  const marginPercent = finiteNumber(settings.marginPercent, "Margin Percent");
  const rateFractionDigits = Number(pair.defaultQuoteDecimals);
  const referenceRate = positiveNumber(side === "BUY" ? quote.offer : quote.bid, "Market reference rate");
  const marginFactor = marginPercent / 100;
  const tradeRate = roundToFractionDigits(
    referenceRate * (side === "BUY" ? 1 + marginFactor : 1 - marginFactor),
    rateFractionDigits
  );
  const quoteCcyAmount = roundToFractionDigits(
    baseCcyAmount * tradeRate,
    Number(quoteCurrencyFractionDigits)
  );
  const economics = calculateClientFxDealEconomics({
    clientSide: side,
    baseCcyAmount,
    tradeRate,
    marginPercent,
    rateFractionDigits,
    pnlFractionDigits: Number(quoteCurrencyFractionDigits)
  });
  const tradeDate = localIsoCalendarDate(timestamp);

  return {
    entryTimestamp: timestamp.toISOString(),
    partyId: Number(settings.partyId),
    executionContextId: Number(settings.executionContextId),
    pricingRuleId: Number(settings.pricingRuleId),
    tradeDate,
    ccyPairCode: String(settings.ccyPairCode || "").trim().toUpperCase(),
    side,
    baseCcyAmount,
    quoteCcyAmount,
    tradeRate,
    transferRate: economics.transferRate,
    analyticalPnl: economics.analyticalPnl,
    tenor: "TOD",
    baseCcyValueDate: tradeDate,
    quoteCcyValueDate: tradeDate,
    marketPulseStreamStatus: marketPulseSnapshot.status,
    marketPulseBid: positiveNumber(quote.bid, "Market Pulse Bid"),
    marketPulseOffer: positiveNumber(quote.offer, "Market Pulse Offer"),
    marketPulseTimestamp: marketPulseSnapshot.generatedAt,
    comment: null
  };
}

module.exports = {
  generatedBaseCcyAmount,
  generatedClientFxDeal,
  generatedClientSide
};
