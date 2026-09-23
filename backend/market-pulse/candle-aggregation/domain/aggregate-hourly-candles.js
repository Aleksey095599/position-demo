"use strict";

const { aggregateCandles } = require("../../historical-data/domain/aggregate-candles");
const { createCandle } = require("../../historical-data/domain/candle");

const MINUTE_MS = 60000;
const HOUR_MS = 60 * MINUTE_MS;
const MINIMUM_HOURLY_COMPONENTS = 30;

function aggregateHourlyCandles({ candles, from, till }) {
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
  const result = { candles: [], skippedHours: [] };
  for (const candle of aggregateCandles({ candles: normalized, from, till, timeframe: "ONE_HOUR" })) {
    const start = Date.parse(candle.begin);
    const present = [], missingMinutes = [];
    for (let time = start; time < start + HOUR_MS; time += MINUTE_MS) {
      (minutes.has(time) ? present : missingMinutes).push(new Date(time).toISOString());
    }
    const coverage = {
      begin: candle.begin, end: candle.end,
      componentCount: present.length,
      firstSourceBegin: present[0],
      lastSourceBegin: present.at(-1),
      missingMinutes,
      coverage: present.length < MINIMUM_HOURLY_COMPONENTS ? "INSUFFICIENT" : missingMinutes.length ? "PARTIAL" : "COMPLETE"
    };
    if (coverage.coverage === "INSUFFICIENT") result.skippedHours.push(coverage);
    else result.candles.push({ ...candle, ...coverage });
  }
  return result;
}

module.exports = { aggregateHourlyCandles, MINIMUM_HOURLY_COMPONENTS };
