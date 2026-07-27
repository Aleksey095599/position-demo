"use strict";

const Big = require("big.js");
const {
  majorToMinor,
  minorToMajor
} = require("../money/money");

const Decimal = Big();
Decimal.strict = true;
Decimal.DP = 40;
Decimal.RM = Decimal.roundHalfUp;

const CLIENT_SIDES = new Set(["BUY", "SELL"]);

function roundToFractionDigits(value, fractionDigits) {
  if (!Number.isInteger(fractionDigits) || fractionDigits < 0 || fractionDigits > 10) {
    throw new RangeError("Fraction digits must be an integer from 0 to 10.");
  }

  return Number(
    new Decimal(String(value))
      .round(fractionDigits, Decimal.roundHalfUp)
      .toFixed(fractionDigits)
  );
}

function normalizedClientSide(value) {
  const clientSide = String(value || "").trim().toUpperCase();

  if (!CLIENT_SIDES.has(clientSide)) {
    throw new RangeError("Client Side must be BUY or SELL.");
  }

  return clientSide;
}

function positiveDecimal(value, name) {
  let decimal;

  try {
    decimal = new Decimal(String(value));
  } catch {
    throw new RangeError(`${name} must be a positive number.`);
  }

  if (decimal.lte("0")) {
    throw new RangeError(`${name} must be a positive number.`);
  }

  return decimal;
}

function calculateTransferRate({ clientSide, tradeRate, marginPercent, rateFractionDigits = 4 }) {
  const side = normalizedClientSide(clientSide);
  const normalizedTradeRate = positiveDecimal(tradeRate, "Trade Rate");
  let normalizedMarginPercent;

  try {
    normalizedMarginPercent = new Decimal(String(marginPercent));
  } catch {
    throw new RangeError("Margin Percent must be a number from 0 up to, but not including, 100.");
  }

  if (normalizedMarginPercent.lt("0") || normalizedMarginPercent.gte("100")) {
    throw new RangeError("Margin Percent must be a number from 0 up to, but not including, 100.");
  }

  const marginFactor = normalizedMarginPercent.div("100");
  const clientRateFactor = side === "BUY"
    ? new Decimal("1").plus(marginFactor)
    : new Decimal("1").minus(marginFactor);

  return roundToFractionDigits(
    normalizedTradeRate.div(clientRateFactor).toString(),
    rateFractionDigits
  );
}

function calculateAnalyticalPnl({
  clientSide,
  baseCcyAmount,
  tradeRate,
  transferRate,
  pnlFractionDigits = 2
}) {
  const side = normalizedClientSide(clientSide);
  const normalizedBaseAmount = positiveDecimal(baseCcyAmount, "Base Ccy Amount");
  const normalizedTradeRate = positiveDecimal(tradeRate, "Trade Rate");
  const normalizedTransferRate = positiveDecimal(transferRate, "Transfer Rate");
  const quoteRateDelta = side === "BUY"
    ? normalizedTradeRate.minus(normalizedTransferRate)
    : normalizedTransferRate.minus(normalizedTradeRate);
  const analyticalPnlQuoteMinor = majorToMinor(
    normalizedBaseAmount.times(quoteRateDelta).toString(),
    pnlFractionDigits
  );

  return Number(minorToMajor(analyticalPnlQuoteMinor, pnlFractionDigits));
}

function calculateAnalyticalPnlMinor({
  clientSide,
  baseCcyAmountMinor,
  baseCcyFractionDigits,
  tradeRate,
  transferRate,
  quoteCcyFractionDigits
}) {
  const side = normalizedClientSide(clientSide);
  const normalizedBaseAmount = positiveDecimal(
    minorToMajor(baseCcyAmountMinor, baseCcyFractionDigits),
    "Base Ccy Amount"
  );
  const normalizedTradeRate = positiveDecimal(tradeRate, "Trade Rate");
  const normalizedTransferRate = positiveDecimal(transferRate, "Transfer Rate");
  const quoteRateDelta = side === "BUY"
    ? normalizedTradeRate.minus(normalizedTransferRate)
    : normalizedTransferRate.minus(normalizedTradeRate);

  return majorToMinor(
    normalizedBaseAmount.times(quoteRateDelta).toString(),
    quoteCcyFractionDigits
  );
}

function calculateClientFxDealEconomics({
  clientSide,
  baseCcyAmountMinor,
  baseCcyFractionDigits,
  tradeRate,
  marginPercent,
  rateFractionDigits = 4,
  quoteCcyFractionDigits = 2
}) {
  const transferRate = calculateTransferRate({
    clientSide,
    tradeRate,
    marginPercent,
    rateFractionDigits
  });
  const analyticalPnlQuoteMinor = calculateAnalyticalPnlMinor({
    clientSide,
    baseCcyAmountMinor,
    baseCcyFractionDigits,
    tradeRate,
    transferRate,
    quoteCcyFractionDigits
  });

  return {
    transferRate,
    analyticalPnlQuoteMinor,
    analyticalPnlQuoteFractionDigits: quoteCcyFractionDigits
  };
}

module.exports = {
  calculateAnalyticalPnl,
  calculateAnalyticalPnlMinor,
  calculateClientFxDealEconomics,
  calculateTransferRate,
  roundToFractionDigits
};
