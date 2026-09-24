"use strict";

const { aggregateCandlesFromMinutes } = require("./aggregate-candles-from-minutes");

function aggregateHourlyCandles(command) {
  return aggregateCandlesFromMinutes({ ...command, timeframe: "ONE_HOUR" });
}

module.exports = { aggregateHourlyCandles };
