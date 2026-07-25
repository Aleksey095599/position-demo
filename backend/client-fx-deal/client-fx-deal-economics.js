"use strict";

const CLIENT_SIDES = new Set(["BUY", "SELL"]);

function roundToFractionDigits(value, fractionDigits) {
  if (!Number.isInteger(fractionDigits) || fractionDigits < 0 || fractionDigits > 10) {
    throw new RangeError("Fraction digits must be an integer from 0 to 10.");
  }

  return Number(value.toFixed(fractionDigits));
}

function normalizedClientSide(value) {
  const clientSide = String(value || "").trim().toUpperCase();

  if (!CLIENT_SIDES.has(clientSide)) {
    throw new RangeError("Client Side must be BUY or SELL.");
  }

  return clientSide;
}

function positiveNumber(value, name) {
  const number = Number(value);

  if (!Number.isFinite(number) || number <= 0) {
    throw new RangeError(`${name} must be a positive number.`);
  }

  return number;
}

function calculateTransferRate({ clientSide, tradeRate, marginPercent, rateFractionDigits = 4 }) {
  const side = normalizedClientSide(clientSide);
  const normalizedTradeRate = positiveNumber(tradeRate, "Trade Rate");
  const normalizedMarginPercent = Number(marginPercent);

  if (!Number.isFinite(normalizedMarginPercent) || normalizedMarginPercent < 0 || normalizedMarginPercent >= 100) {
    throw new RangeError("Margin Percent must be a number from 0 up to, but not including, 100.");
  }

  const marginFactor = normalizedMarginPercent / 100;
  const clientRateFactor = side === "BUY" ? 1 + marginFactor : 1 - marginFactor;

  return roundToFractionDigits(normalizedTradeRate / clientRateFactor, rateFractionDigits);
}

function calculateAnalyticalPnl({
  clientSide,
  baseCcyAmount,
  tradeRate,
  transferRate,
  pnlFractionDigits = 2
}) {
  const side = normalizedClientSide(clientSide);
  const normalizedBaseAmount = positiveNumber(baseCcyAmount, "Base Ccy Amount");
  const normalizedTradeRate = positiveNumber(tradeRate, "Trade Rate");
  const normalizedTransferRate = positiveNumber(transferRate, "Transfer Rate");
  const quoteRateDelta = side === "BUY"
    ? normalizedTradeRate - normalizedTransferRate
    : normalizedTransferRate - normalizedTradeRate;

  return roundToFractionDigits(normalizedBaseAmount * quoteRateDelta, pnlFractionDigits);
}

function calculateClientFxDealEconomics({
  clientSide,
  baseCcyAmount,
  tradeRate,
  marginPercent,
  rateFractionDigits = 4,
  pnlFractionDigits = 2
}) {
  const transferRate = calculateTransferRate({
    clientSide,
    tradeRate,
    marginPercent,
    rateFractionDigits
  });
  const analyticalPnl = calculateAnalyticalPnl({
    clientSide,
    baseCcyAmount,
    tradeRate,
    transferRate,
    pnlFractionDigits
  });

  return { transferRate, analyticalPnl };
}

module.exports = {
  calculateAnalyticalPnl,
  calculateClientFxDealEconomics,
  calculateTransferRate
};
