"use strict";

const Big = require("big.js");

const Decimal = Big();
Decimal.strict = true;

function candleError(message) {
  const error = new RangeError(message);
  error.code = "INVALID_CANDLE";
  return error;
}

function normalizedTimestamp(value, name) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    throw candleError(`${name} must be an ISO 8601 timestamp with a UTC offset.`);
  }

  const timestamp = Date.parse(value);

  if (!Number.isFinite(timestamp)) {
    throw candleError(`${name} must be a valid timestamp.`);
  }

  return {
    milliseconds: timestamp,
    value: new Date(timestamp).toISOString()
  };
}

function positiveDecimal(value, name) {
  let decimal;

  try {
    decimal = new Decimal(String(value));
  } catch {
    throw candleError(`${name} must be a positive decimal number.`);
  }

  if (decimal.lte("0")) {
    throw candleError(`${name} must be a positive decimal number.`);
  }

  return decimal;
}

function createCandle({ begin, end, open, high, low, close } = {}) {
  const normalizedBegin = normalizedTimestamp(begin, "Begin");
  const normalizedEnd = normalizedTimestamp(end, "End");

  if (normalizedBegin.milliseconds >= normalizedEnd.milliseconds) {
    throw candleError("Begin must be earlier than End.");
  }

  const normalizedOpen = positiveDecimal(open, "Open");
  const normalizedHigh = positiveDecimal(high, "High");
  const normalizedLow = positiveDecimal(low, "Low");
  const normalizedClose = positiveDecimal(close, "Close");

  if (normalizedLow.gt(normalizedHigh)) {
    throw candleError("Low must not be greater than High.");
  }

  if (normalizedOpen.lt(normalizedLow) || normalizedOpen.gt(normalizedHigh)) {
    throw candleError("Open must be between Low and High.");
  }

  if (normalizedClose.lt(normalizedLow) || normalizedClose.gt(normalizedHigh)) {
    throw candleError("Close must be between Low and High.");
  }

  return Object.freeze({
    begin: normalizedBegin.value,
    end: normalizedEnd.value,
    open: normalizedOpen.toString(),
    high: normalizedHigh.toString(),
    low: normalizedLow.toString(),
    close: normalizedClose.toString()
  });
}

module.exports = {
  createCandle
};
