"use strict";

const HEDGE_SIDES = new Set(["BUY", "SELL"]);
const HEDGE_TENOR_DAYS = new Map([
  ["TOD", 0],
  ["TOM", 1],
  ["SPOT", 2]
]);

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

function fractionDigits(value, name) {
  const digits = Number(value);

  if (!Number.isInteger(digits) || digits < 0 || digits > 10) {
    throw new RangeError(`${name} must be an integer from 0 to 10.`);
  }

  return digits;
}

function roundToFractionDigits(value, digits) {
  return Number(value.toFixed(digits));
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

function normalizedMarginPercent(value) {
  const marginPercent = finiteNumber(value, "Margin Percent");

  if (marginPercent < 0 || marginPercent >= 100) {
    throw new RangeError("Margin Percent must be from 0 up to, but not including, 100.");
  }

  return marginPercent;
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
  const side = normalizedHedgeSide(hedgeSide);
  const normalizedTradeRate = positiveNumber(tradeRate, "Trade Rate");
  const normalizedMargin = normalizedMarginPercent(marginPercent);
  const digits = fractionDigits(rateFractionDigits, "Rate Fraction Digits");
  const marginFactor = normalizedMargin / 100;
  const tradeRateFactor = side === "BUY" ? 1 + marginFactor : 1 - marginFactor;

  if (tradeRateFactor <= 0) {
    throw new RangeError("Pricing Rule Margin produces an invalid Transfer Rate.");
  }

  return roundToFractionDigits(normalizedTradeRate / tradeRateFactor, digits);
}

function calculateHedgeAnalyticalPnl({
  hedgeSide,
  baseCcyAmount,
  tradeRate,
  transferRate,
  pnlFractionDigits = 2
}) {
  const side = normalizedHedgeSide(hedgeSide);
  const amount = positiveNumber(baseCcyAmount, "Base Ccy Amount");
  const normalizedTradeRate = positiveNumber(tradeRate, "Trade Rate");
  const normalizedTransferRate = positiveNumber(transferRate, "Transfer Rate");
  const digits = fractionDigits(pnlFractionDigits, "PnL Fraction Digits");
  const rateDelta = side === "BUY"
    ? normalizedTradeRate - normalizedTransferRate
    : normalizedTransferRate - normalizedTradeRate;

  return roundToFractionDigits(amount * rateDelta, digits);
}

function createHedgeFxDealTerms({
  hedgeSide,
  baseCcyAmount,
  tradeRate,
  tenor,
  marginPercent,
  rateFractionDigits = 4,
  quoteFractionDigits = 2,
  now = () => new Date()
}) {
  const side = normalizedHedgeSide(hedgeSide);
  const normalizedBaseAmount = positiveNumber(baseCcyAmount, "Base Ccy Amount");
  const normalizedTradeRate = positiveNumber(tradeRate, "Trade Rate");
  const normalizedTenor = normalizedHedgeTenor(tenor);
  const rateDigits = fractionDigits(rateFractionDigits, "Rate Fraction Digits");
  const quoteDigits = fractionDigits(quoteFractionDigits, "Quote Fraction Digits");
  const timestamp = now();

  if (!(timestamp instanceof Date) || Number.isNaN(timestamp.getTime())) {
    throw new TypeError("Current timestamp must be a valid Date.");
  }

  const transferRate = calculateHedgeTransferRate({
    hedgeSide: side,
    tradeRate: normalizedTradeRate,
    marginPercent,
    rateFractionDigits: rateDigits
  });
  const analyticalPnl = calculateHedgeAnalyticalPnl({
    hedgeSide: side,
    baseCcyAmount: normalizedBaseAmount,
    tradeRate: normalizedTradeRate,
    transferRate,
    pnlFractionDigits: quoteDigits
  });
  const tradeDate = localIsoCalendarDate(timestamp);
  const valueDate = localIsoCalendarDate(
    addBusinessDays(timestamp, HEDGE_TENOR_DAYS.get(normalizedTenor))
  );

  return {
    entryTimestamp: timestamp.toISOString(),
    tradeDate,
    side,
    baseCcyAmount: normalizedBaseAmount,
    quoteCcyAmount: roundToFractionDigits(
      normalizedBaseAmount * normalizedTradeRate,
      quoteDigits
    ),
    tradeRate: roundToFractionDigits(normalizedTradeRate, rateDigits),
    transferRate,
    analyticalPnl,
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
