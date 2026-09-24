"use strict";

const { aggregateCandles } = require("../../historical-data/domain/aggregate-candles");
const { createCandle } = require("../../historical-data/domain/candle");
const { aggregationTimeframe, candleCoverage } = require("./aggregation-timeframe");

const MINUTE_MS = 60000;

function aggregateCandlesFromMinutes({ candles, from, till, timeframe }) {
  const { expectedMinutes } = aggregationTimeframe(timeframe);
  const minutes = new Map();
  const normalized = candles.map(createCandle);
  for (const candle of normalized) {
    const begin = Date.parse(candle.begin);
    if (begin % MINUTE_MS !== 0 || Date.parse(candle.end) >= begin + MINUTE_MS
        || begin < Date.parse(from) || begin >= Date.parse(till) || minutes.has(begin)) {
      const error = new RangeError("Source candles must be unique, minute-aligned and inside the selected day.");
      error.code = "INVALID_AGGREGATION_SOURCE_CANDLES";
      throw error;
    }
    minutes.set(begin, candle);
  }
  const result = { candles: [] };
  for (const candle of aggregateCandles({ candles: normalized, from, till, timeframe })) {
    const start = Date.parse(candle.begin);
    const present = [], missingMinutes = [];
    for (let time = start; time <= Date.parse(candle.end); time += MINUTE_MS) {
      if (minutes.has(time)) present.push(new Date(time).toISOString());
      else if (expectedMinutes !== null) missingMinutes.push(new Date(time).toISOString());
    }
    const coverage = {
      begin: candle.begin, end: candle.end,
      componentCount: present.length,
      firstSourceBegin: present[0],
      lastSourceBegin: present.at(-1),
      missingMinutes,
      coverage: candleCoverage(timeframe, present.length)
    };
    result.candles.push({ ...candle, ...coverage });
  }
  return result;
}

module.exports = { aggregateCandlesFromMinutes };
