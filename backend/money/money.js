"use strict";

const Big = require("big.js");

const Decimal = Big();
Decimal.strict = true;
Decimal.DP = 40;
Decimal.RM = Decimal.roundHalfUp;

const MAX_FRACTION_DIGITS = 10;
const MAX_SAFE_MINOR_UNITS = BigInt(Number.MAX_SAFE_INTEGER);

function normalizedFractionDigits(value, name = "Fraction digits") {
  if (!Number.isInteger(value) || value < 0 || value > MAX_FRACTION_DIGITS) {
    throw new RangeError(`${name} must be an integer from 0 to ${MAX_FRACTION_DIGITS}.`);
  }

  return value;
}

function normalizedDecimalText(value, name) {
  if (typeof value !== "string") {
    throw new TypeError(`${name} must be provided as a decimal string.`);
  }

  const text = value.trim();

  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(text)) {
    throw new TypeError(`${name} must be a valid decimal string.`);
  }

  return text;
}

function normalizedMinorUnits(value, name = "Minor units") {
  if (typeof value === "bigint") {
    return value;
  }

  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      throw new RangeError(`${name} must be a safe integer.`);
    }

    return BigInt(value);
  }

  if (typeof value === "string" && /^[+-]?\d+$/.test(value.trim())) {
    return BigInt(value.trim());
  }

  throw new TypeError(`${name} must be an integer.`);
}

function powerOfTen(exponent) {
  return new Decimal("10").pow(exponent);
}

function majorToMinor(majorAmount, fractionDigits) {
  const digits = normalizedFractionDigits(fractionDigits);
  const amount = new Decimal(normalizedDecimalText(majorAmount, "Major amount"));
  const minorAmount = amount
    .times(powerOfTen(digits))
    .round(0, Decimal.roundHalfUp);

  return BigInt(minorAmount.toFixed(0));
}

function minorToMajor(minorAmount, fractionDigits) {
  const digits = normalizedFractionDigits(fractionDigits);
  const minor = normalizedMinorUnits(minorAmount);

  return new Decimal(minor.toString())
    .div(powerOfTen(digits))
    .toFixed(digits);
}

function calculateQuoteMinor({
  baseAmountMinor,
  baseFractionDigits,
  rate,
  quoteFractionDigits
}) {
  const baseDigits = normalizedFractionDigits(
    baseFractionDigits,
    "Base currency fraction digits"
  );
  const quoteDigits = normalizedFractionDigits(
    quoteFractionDigits,
    "Quote currency fraction digits"
  );
  const baseMinor = normalizedMinorUnits(baseAmountMinor, "Base amount minor");
  const normalizedRate = new Decimal(normalizedDecimalText(rate, "Rate"));

  if (baseMinor <= 0n) {
    throw new RangeError("Base amount minor must be positive.");
  }

  if (normalizedRate.lte("0")) {
    throw new RangeError("Rate must be positive.");
  }

  const quoteMinor = new Decimal(baseMinor.toString())
    .div(powerOfTen(baseDigits))
    .times(normalizedRate)
    .times(powerOfTen(quoteDigits))
    .round(0, Decimal.roundHalfUp);

  return BigInt(quoteMinor.toFixed(0));
}

function calculateBaseMinor({
  quoteAmountMinor,
  quoteFractionDigits,
  rate,
  baseFractionDigits
}) {
  const quoteDigits = normalizedFractionDigits(
    quoteFractionDigits,
    "Quote currency fraction digits"
  );
  const baseDigits = normalizedFractionDigits(
    baseFractionDigits,
    "Base currency fraction digits"
  );
  const quoteMinor = normalizedMinorUnits(quoteAmountMinor, "Quote amount minor");
  const normalizedRate = new Decimal(normalizedDecimalText(rate, "Rate"));

  if (quoteMinor <= 0n) {
    throw new RangeError("Quote amount minor must be positive.");
  }

  if (normalizedRate.lte("0")) {
    throw new RangeError("Rate must be positive.");
  }

  const baseMinor = new Decimal(quoteMinor.toString())
    .div(powerOfTen(quoteDigits))
    .div(normalizedRate)
    .times(powerOfTen(baseDigits))
    .round(0, Decimal.roundHalfUp);

  return BigInt(baseMinor.toFixed(0));
}

function calculateFxAmountsFromDealt({
  dealtAmount,
  dealtCcyCode,
  baseCcyCode,
  quoteCcyCode,
  baseFractionDigits,
  quoteFractionDigits,
  rate
}) {
  const dealtCode = String(dealtCcyCode || "").trim().toUpperCase();
  const baseCode = String(baseCcyCode || "").trim().toUpperCase();
  const quoteCode = String(quoteCcyCode || "").trim().toUpperCase();

  if (dealtCode !== baseCode && dealtCode !== quoteCode) {
    throw new RangeError(`Dealt currency must be ${baseCode} or ${quoteCode}.`);
  }

  if (dealtCode === baseCode) {
    const baseAmountMinor = majorToMinor(dealtAmount, baseFractionDigits);

    if (baseAmountMinor <= 0n) {
      throw new RangeError("Dealt amount must be positive.");
    }

    return {
      baseAmountMinor,
      quoteAmountMinor: calculateQuoteMinor({
        baseAmountMinor,
        baseFractionDigits,
        rate,
        quoteFractionDigits
      })
    };
  }

  const quoteAmountMinor = majorToMinor(dealtAmount, quoteFractionDigits);

  if (quoteAmountMinor <= 0n) {
    throw new RangeError("Dealt amount must be positive.");
  }

  return {
    baseAmountMinor: calculateBaseMinor({
      quoteAmountMinor,
      quoteFractionDigits,
      rate,
      baseFractionDigits
    }),
    quoteAmountMinor
  };
}

function minorToSafeInteger(minorAmount, name = "Minor units") {
  const minor = normalizedMinorUnits(minorAmount, name);

  if (minor < -MAX_SAFE_MINOR_UNITS || minor > MAX_SAFE_MINOR_UNITS) {
    throw new RangeError(`${name} exceeds the safe SQLite/JavaScript integer range.`);
  }

  return Number(minor);
}

module.exports = {
  calculateBaseMinor,
  calculateFxAmountsFromDealt,
  calculateQuoteMinor,
  majorToMinor,
  minorToMajor,
  minorToSafeInteger
};
