"use strict";

const {
  requireCandleTimeframe
} = require("../domain/candle-timeframe");

function queryError(message) {
  const error = new RangeError(message);
  error.code = "INVALID_HISTORICAL_CANDLES_QUERY";
  return error;
}

function normalizedInstrumentId(value) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw queryError("Instrument ID must be a non-empty string.");
  }

  return value.trim();
}

function normalizedTimestamp(value, name) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    throw queryError(`${name} must be an ISO 8601 timestamp with a UTC offset.`);
  }

  const timestamp = Date.parse(value);

  if (!Number.isFinite(timestamp)) {
    throw queryError(`${name} must be a valid timestamp.`);
  }

  return {
    milliseconds: timestamp,
    value: new Date(timestamp).toISOString()
  };
}

function createHistoricalCandlesQuery(value = {}) {
  const source = value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
  const instrumentId = normalizedInstrumentId(source.instrumentId);
  const timeframe = requireCandleTimeframe(source.timeframe);
  const from = normalizedTimestamp(source.from, "From");
  const till = normalizedTimestamp(source.till, "Till");

  if (from.milliseconds >= till.milliseconds) {
    throw queryError("From must be earlier than Till.");
  }

  return Object.freeze({
    instrumentId,
    timeframe,
    from: from.value,
    till: till.value
  });
}

module.exports = {
  createHistoricalCandlesQuery
};
