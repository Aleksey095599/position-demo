"use strict";

function currencyCode(value, label) {
  const normalized = String(value || "").trim().toUpperCase();

  if (!/^[A-Z]{3}$/.test(normalized)) {
    throw new Error(`${label} must be a three-letter currency code.`);
  }

  return normalized;
}

function positiveSafeMinorUnits(value, label) {
  const normalized = Number(value);

  if (!Number.isSafeInteger(normalized) || normalized <= 0) {
    throw new Error(`${label} must be a positive safe integer.`);
  }

  return normalized;
}

function fxTradeBalanceContributions({
  side,
  baseCcyCode,
  quoteCcyCode,
  baseCcyAmountMinor,
  quoteCcyAmountMinor
}) {
  const normalizedSide = String(side || "").trim().toUpperCase();

  if (!["BUY", "SELL"].includes(normalizedSide)) {
    throw new Error("FX Trade side must be BUY or SELL.");
  }

  const normalizedBaseCcyCode = currencyCode(baseCcyCode, "Base currency");
  const normalizedQuoteCcyCode = currencyCode(quoteCcyCode, "Quote currency");

  if (normalizedBaseCcyCode === normalizedQuoteCcyCode) {
    throw new Error("Base and quote currencies must be different.");
  }

  const normalizedBaseAmountMinor = positiveSafeMinorUnits(
    baseCcyAmountMinor,
    "Base currency amount"
  );
  const normalizedQuoteAmountMinor = positiveSafeMinorUnits(
    quoteCcyAmountMinor,
    "Quote currency amount"
  );

  return {
    baseCcyCode: normalizedBaseCcyCode,
    quoteCcyCode: normalizedQuoteCcyCode,
    baseBalanceContributionMinor: normalizedSide === "SELL"
      ? normalizedBaseAmountMinor
      : -normalizedBaseAmountMinor,
    quoteBalanceContributionMinor: normalizedSide === "BUY"
      ? normalizedQuoteAmountMinor
      : -normalizedQuoteAmountMinor
  };
}

module.exports = {
  fxTradeBalanceContributions
};
