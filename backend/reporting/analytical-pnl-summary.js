"use strict";

const Big = require("big.js");

const Decimal = Big();
Decimal.strict = true;
Decimal.DP = 40;
Decimal.RM = Decimal.roundHalfUp;

const MAX_FRACTION_DIGITS = 10;
const WEIGHTED_AVERAGE_MARGIN_FRACTION_DIGITS = 4;

function normalizedMinorUnits(value, name) {
  if (typeof value === "bigint") {
    return value;
  }

  if (typeof value === "number" && Number.isSafeInteger(value)) {
    return BigInt(value);
  }

  if (typeof value === "string" && /^[+-]?\d+$/.test(value.trim())) {
    return BigInt(value.trim());
  }

  throw new TypeError(`${name} must be an integer.`);
}

function normalizedFractionDigits(value, name) {
  const digits = Number(value);

  if (!Number.isInteger(digits) || digits < 0 || digits > MAX_FRACTION_DIGITS) {
    throw new RangeError(`${name} must be an integer from 0 to ${MAX_FRACTION_DIGITS}.`);
  }

  return digits;
}

function scaledMinorUnits(minor, sourceDigits, targetDigits) {
  return minor * (10n ** BigInt(targetDigits - sourceDigits));
}

function addAmount(total, minor, fractionDigits) {
  if (!total) {
    return { minor, fractionDigits };
  }

  const targetDigits = Math.max(total.fractionDigits, fractionDigits);

  return {
    minor: scaledMinorUnits(total.minor, total.fractionDigits, targetDigits)
      + scaledMinorUnits(minor, fractionDigits, targetDigits),
    fractionDigits: targetDigits
  };
}

function decimalMajorAmount(amount) {
  return new Decimal(amount.minor.toString())
    .div(new Decimal("10").pow(amount.fractionDigits));
}

function weightedAverageMarginPercent(pnl, quoteAmount) {
  if (quoteAmount.minor === 0n) {
    return null;
  }

  return decimalMajorAmount(pnl)
    .div(decimalMajorAmount(quoteAmount))
    .times("100")
    .toFixed(WEIGHTED_AVERAGE_MARGIN_FRACTION_DIGITS);
}

function analyticalPnlSummary(rows) {
  if (!Array.isArray(rows)) {
    throw new TypeError("Analytical PnL rows must be an array.");
  }

  const totalsByCurrency = new Map();
  let dealsWithPnlCount = 0;

  rows.forEach(row => {
    if (row?.analyticalPnlQuoteMinor === null
      || row?.analyticalPnlQuoteMinor === undefined
      || row?.analyticalPnlQuoteFractionDigits === null
      || row?.analyticalPnlQuoteFractionDigits === undefined) {
      return;
    }

    const currencyCode = String(row.quoteCcyCode || "").trim().toUpperCase();

    if (!/^[A-Z]{3}$/.test(currencyCode)) {
      throw new RangeError("Quote currency code must contain three uppercase letters.");
    }

    const pnlMinor = normalizedMinorUnits(
      row.analyticalPnlQuoteMinor,
      `Analytical PnL for ${currencyCode}`
    );
    const pnlFractionDigits = normalizedFractionDigits(
      row.analyticalPnlQuoteFractionDigits,
      `Analytical PnL fraction digits for ${currencyCode}`
    );
    const quoteMinor = normalizedMinorUnits(
      row.quoteCcyAmountMinor,
      `Quote amount for ${currencyCode}`
    );
    const quoteFractionDigits = normalizedFractionDigits(
      row.quoteCcyFractionDigits,
      `Quote amount fraction digits for ${currencyCode}`
    );

    if (quoteMinor < 0n) {
      throw new RangeError(`Quote amount for ${currencyCode} must not be negative.`);
    }

    dealsWithPnlCount += 1;
    const current = totalsByCurrency.get(currencyCode);

    totalsByCurrency.set(currencyCode, {
      pnl: addAmount(current?.pnl, pnlMinor, pnlFractionDigits),
      quoteAmount: addAmount(current?.quoteAmount, quoteMinor, quoteFractionDigits)
    });
  });

  const totals = Array.from(totalsByCurrency.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([quoteCcyCode, total]) => ({
      quoteCcyCode,
      analyticalPnlQuoteMinor: total.pnl.minor.toString(),
      analyticalPnlQuoteFractionDigits: total.pnl.fractionDigits,
      quoteCcyAmountMinor: total.quoteAmount.minor.toString(),
      quoteCcyFractionDigits: total.quoteAmount.fractionDigits,
      weightedAverageMarginPercent: weightedAverageMarginPercent(
        total.pnl,
        total.quoteAmount
      )
    }));

  return {
    dealCount: rows.length,
    dealsWithPnlCount,
    dealsWithoutPnlCount: rows.length - dealsWithPnlCount,
    totals
  };
}

module.exports = {
  WEIGHTED_AVERAGE_MARGIN_FRACTION_DIGITS,
  analyticalPnlSummary
};
