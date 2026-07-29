"use strict";

function currencyCode(value, label) {
  const normalized = String(value || "").trim().toUpperCase();

  if (!/^[A-Z]{3}$/.test(normalized)) {
    throw new Error(`${label} must be a three-letter currency code.`);
  }

  return normalized;
}

function positiveMinorUnits(value, label) {
  let normalized;

  if (typeof value === "bigint") {
    normalized = value;
  } else if (typeof value === "number" && Number.isSafeInteger(value)) {
    normalized = BigInt(value);
  } else if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    normalized = BigInt(value.trim());
  } else {
    throw new Error(`${label} must be a positive safe integer.`);
  }

  if (normalized <= 0n) {
    throw new Error(`${label} must be a positive safe integer.`);
  }

  return normalized;
}

function signedMinorUnits(value, label) {
  if (typeof value === "bigint") {
    return value;
  }

  if (typeof value === "number" && Number.isSafeInteger(value)) {
    return BigInt(value);
  }

  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) {
    return BigInt(value.trim());
  }

  throw new Error(`${label} must be a safe integer.`);
}

function safeMinorNumber(value, label) {
  const normalized = Number(value);

  if (!Number.isSafeInteger(normalized)) {
    throw new Error(`${label} must be a safe integer.`);
  }

  return normalized;
}

function fxTradeBalanceContributionsMinor({
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

  const normalizedBaseAmountMinor = positiveMinorUnits(
    baseCcyAmountMinor,
    "Base currency amount"
  );
  const normalizedQuoteAmountMinor = positiveMinorUnits(
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

function fxTradeBalanceContributions(trade) {
  const contributions = fxTradeBalanceContributionsMinor(trade);

  return {
    ...contributions,
    baseBalanceContributionMinor: safeMinorNumber(
      contributions.baseBalanceContributionMinor,
      "Base balance contribution"
    ),
    quoteBalanceContributionMinor: safeMinorNumber(
      contributions.quoteBalanceContributionMinor,
      "Quote balance contribution"
    )
  };
}

function quoteCashOutContributionMinor(netQuoteCcyAmountMinor) {
  return -signedMinorUnits(
    netQuoteCcyAmountMinor,
    "Net Quote currency balance"
  );
}

module.exports = {
  fxTradeBalanceContributions,
  fxTradeBalanceContributionsMinor,
  quoteCashOutContributionMinor
};
