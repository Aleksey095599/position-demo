"use strict";

const Big = require("big.js");
const {
  minorToMajor
} = require("../money/money");

const Decimal = Big();
Decimal.strict = true;
Decimal.DP = 40;
Decimal.RM = Decimal.roundHalfUp;

function finiteNumber(value, name) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    throw new TypeError(`${name} must be a finite number.`);
  }

  return number;
}

function positiveSafeInteger(value, name) {
  const number = Number(value);

  if (!Number.isSafeInteger(number) || number <= 0) {
    throw new RangeError(`${name} must be a positive safe integer.`);
  }

  return number;
}

function positiveDecimal(value, name) {
  let decimal;

  try {
    decimal = new Decimal(String(value));
  } catch {
    throw new TypeError(`${name} must be a valid decimal.`);
  }

  if (decimal.lte("0")) {
    throw new RangeError(`${name} must be positive.`);
  }

  return decimal;
}

function fractionDigits(value, name) {
  const digits = Number(value);

  if (!Number.isInteger(digits) || digits < 0 || digits > 10) {
    throw new RangeError(`${name} must be an integer from 0 to 10.`);
  }

  return digits;
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

function generatedBaseCcyAmountMinor(settings, random = Math.random) {
  const minimum = positiveSafeInteger(
    settings.minBaseCcyAmountMinor,
    "Min Base Ccy Amount Minor"
  );
  const maximum = positiveSafeInteger(
    settings.maxBaseCcyAmountMinor,
    "Max Base Ccy Amount Minor"
  );
  const step = positiveSafeInteger(
    settings.baseCcyAmountStepMinor,
    "Base Ccy Amount Step Minor"
  );

  if (maximum < minimum) {
    throw new RangeError(
      "Max Base Ccy Amount Minor must not be below Min Base Ccy Amount Minor."
    );
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

  const baseCcyCode = String(pair.baseCcy || "").trim().toUpperCase();

  if (!/^[A-Z]{3}$/.test(baseCcyCode)) {
    throw new RangeError("Generated Client FX Deal requires a valid Base Ccy Code.");
  }

  const timestamp = now();

  if (!(timestamp instanceof Date) || Number.isNaN(timestamp.getTime())) {
    throw new TypeError("Current timestamp must be a valid Date.");
  }

  const side = generatedClientSide(settings.buyProbabilityPercent, random);
  const baseCcyFractionDigits = fractionDigits(
    settings.baseCcyFractionDigits,
    "Base Ccy Fraction Digits"
  );
  const dealtCcyAmount = minorToMajor(
    generatedBaseCcyAmountMinor(settings, random),
    baseCcyFractionDigits
  );
  const marginPercent = new Decimal(String(finiteNumber(
    settings.marginPercent,
    "Margin Percent"
  )));

  if (marginPercent.lt("0") || marginPercent.gte("100")) {
    throw new RangeError("Margin Percent must be from 0 up to, but not including, 100.");
  }

  const rateFractionDigits = fractionDigits(
    pair.defaultQuoteDecimals,
    "Default Quote Decimals"
  );
  const referenceRate = positiveDecimal(
    side === "BUY" ? quote.offer : quote.bid,
    "Market reference rate"
  );
  const marginFactor = marginPercent.div("100");
  const tradeRateFactor = side === "BUY"
    ? new Decimal("1").plus(marginFactor)
    : new Decimal("1").minus(marginFactor);
  const tradeRate = referenceRate
    .times(tradeRateFactor)
    .round(rateFractionDigits, Decimal.roundHalfUp)
    .toFixed(rateFractionDigits);
  const tradeDate = localIsoCalendarDate(timestamp);

  return {
    entryTimestamp: timestamp.toISOString(),
    counterpartyId: Number(settings.counterpartyId),
    executionContextId: Number(settings.executionContextId),
    pricingRuleId: Number(settings.pricingRuleId),
    tradeDate,
    ccyPairCode: String(settings.ccyPairCode || "").trim().toUpperCase(),
    side,
    dealtCcyCode: baseCcyCode,
    dealtCcyAmount,
    tradeRate,
    tenor: "TOD",
    baseCcyValueDate: tradeDate,
    quoteCcyValueDate: tradeDate,
    marketPulseStreamStatus: marketPulseSnapshot.status,
    marketPulseBid: positiveDecimal(quote.bid, "Market Pulse Bid").toString(),
    marketPulseOffer: positiveDecimal(quote.offer, "Market Pulse Offer").toString(),
    marketPulseTimestamp: marketPulseSnapshot.generatedAt,
    comment: null
  };
}

module.exports = {
  generatedBaseCcyAmountMinor,
  generatedClientFxDeal,
  generatedClientSide
};
