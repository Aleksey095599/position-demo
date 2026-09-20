"use strict";

const CandleTimeframe = Object.freeze({
  ONE_MINUTE: "ONE_MINUTE",
  FIVE_MINUTES: "FIVE_MINUTES",
  FIFTEEN_MINUTES: "FIFTEEN_MINUTES",
  ONE_HOUR: "ONE_HOUR",
  FOUR_HOURS: "FOUR_HOURS",
  ONE_DAY: "ONE_DAY",
  ONE_WEEK: "ONE_WEEK",
  ONE_MONTH: "ONE_MONTH"
});

const candleTimeframes = new Set(Object.values(CandleTimeframe));

function requireCandleTimeframe(value) {
  if (!candleTimeframes.has(value)) {
    const error = new RangeError("Candle Timeframe is not supported.");
    error.code = "INVALID_CANDLE_TIMEFRAME";
    throw error;
  }

  return value;
}

module.exports = {
  CandleTimeframe,
  requireCandleTimeframe
};
