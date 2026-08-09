"use strict";

const {
  calculateAnalyticalPnlMinor,
  calculateTransferRate,
  roundToFractionDigits
} = require("../client-fx-deal/client-fx-deal-economics");
const {
  calculateQuoteMinor,
  majorToMinorExact,
  minorToMajor
} = require("../money/money");

const HEDGE_SIDES = new Set(["BUY", "SELL"]);
const HEDGE_TENOR_DAYS = new Map([
  ["TOD", 0],
  ["TOM", 1],
  ["SPOT", 2]
]);

function fractionDigits(value, name) {
  const digits = Number(value);

  if (!Number.isInteger(digits) || digits < 0 || digits > 10) {
    throw new RangeError(`${name} must be an integer from 0 to 10.`);
  }

  return digits;
}

function normalizedHedgeSide(value) {
  const side = String(value || "").trim().toUpperCase();

  if (!HEDGE_SIDES.has(side)) {
    throw new RangeError("Hedge Side must be BUY or SELL.");
  }

  return side;
}

function normalizedHedgeTenor(value) {
  const tenor = String(value || "").trim().toUpperCase();

  if (!HEDGE_TENOR_DAYS.has(tenor)) {
    throw new RangeError("Hedge Tenor must be TOD, TOM or SPOT.");
  }

  return tenor;
}

function localIsoCalendarDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addBusinessDays(date, days) {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  let remaining = days;

  while (remaining > 0) {
    result.setDate(result.getDate() + 1);

    if (result.getDay() !== 0 && result.getDay() !== 6) {
      remaining -= 1;
    }
  }

  return result;
}

function calculateHedgeTransferRate({
  hedgeSide,
  tradeRate,
  marginPercent,
  rateFractionDigits = 4
}) {
  return calculateTransferRate({
    clientSide: normalizedHedgeSide(hedgeSide),
    tradeRate,
    marginPercent,
    rateFractionDigits
  });
}

function calculateHedgeAnalyticalPnl({
  hedgeSide,
  baseCcyAmountMinor,
  baseCcyFractionDigits,
  tradeRate,
  transferRate,
  quoteCcyFractionDigits = 2
}) {
  return calculateAnalyticalPnlMinor({
    clientSide: normalizedHedgeSide(hedgeSide),
    baseCcyAmountMinor,
    baseCcyFractionDigits,
    tradeRate,
    transferRate,
    quoteCcyFractionDigits
  });
}

function createHedgeFxDealTerms({
  hedgeSide,
  baseCcyAmount,
  tradeRate,
  tenor,
  marginPercent,
  rateFractionDigits = 4,
  baseFractionDigits = 2,
  quoteFractionDigits = 2,
  now = () => new Date()
}) {
  const side = normalizedHedgeSide(hedgeSide);
  const normalizedTenor = normalizedHedgeTenor(tenor);
  const rateDigits = fractionDigits(rateFractionDigits, "Rate Fraction Digits");
  const baseDigits = fractionDigits(baseFractionDigits, "Base Fraction Digits");
  const quoteDigits = fractionDigits(quoteFractionDigits, "Quote Fraction Digits");
  const baseAmountMinor = majorToMinorExact(String(baseCcyAmount), baseDigits);

  if (baseAmountMinor <= 0n) {
    throw new RangeError("Base Ccy Amount must be positive.");
  }

  const normalizedBaseAmount = minorToMajor(baseAmountMinor, baseDigits);
  const quoteAmountMinor = calculateQuoteMinor({
    baseAmountMinor,
    baseFractionDigits: baseDigits,
    rate: String(tradeRate),
    quoteFractionDigits: quoteDigits
  });
  const transferRate = calculateHedgeTransferRate({
    hedgeSide: side,
    tradeRate,
    marginPercent,
    rateFractionDigits: rateDigits
  });
  const analyticalPnlQuoteMinor = calculateHedgeAnalyticalPnl({
    hedgeSide: side,
    baseCcyAmountMinor: baseAmountMinor,
    baseCcyFractionDigits: baseDigits,
    tradeRate,
    transferRate,
    quoteCcyFractionDigits: quoteDigits
  });
  const timestamp = now();

  if (!(timestamp instanceof Date) || Number.isNaN(timestamp.getTime())) {
    throw new TypeError("Current timestamp must be a valid Date.");
  }

  const tradeDate = localIsoCalendarDate(timestamp);
  const valueDate = localIsoCalendarDate(
    addBusinessDays(timestamp, HEDGE_TENOR_DAYS.get(normalizedTenor))
  );

  return {
    executionTimestamp: timestamp.toISOString(),
    tradeDate,
    side,
    baseCcyAmount: Number(normalizedBaseAmount),
    quoteCcyAmount: Number(minorToMajor(quoteAmountMinor, quoteDigits)),
    tradeRate: roundToFractionDigits(String(tradeRate), rateDigits),
    transferRate,
    analyticalPnlQuoteMinor,
    analyticalPnlQuoteFractionDigits: quoteDigits,
    tenor: normalizedTenor,
    baseCcyValueDate: valueDate,
    quoteCcyValueDate: valueDate
  };
}

module.exports = {
  calculateHedgeAnalyticalPnl,
  calculateHedgeTransferRate,
  createHedgeFxDealTerms
};
