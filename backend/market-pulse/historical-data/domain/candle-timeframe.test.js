"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  CandleTimeframe,
  requireCandleTimeframe
} = require("./candle-timeframe");

test("defines the Market Pulse Candle Timeframes", () => {
  assert.deepEqual(CandleTimeframe, {
    ONE_MINUTE: "ONE_MINUTE",
    FIVE_MINUTES: "FIVE_MINUTES",
    FIFTEEN_MINUTES: "FIFTEEN_MINUTES",
    ONE_HOUR: "ONE_HOUR",
    FOUR_HOURS: "FOUR_HOURS",
    ONE_DAY: "ONE_DAY",
    ONE_WEEK: "ONE_WEEK",
    ONE_MONTH: "ONE_MONTH"
  });
  assert.equal(Object.isFrozen(CandleTimeframe), true);
});

test("accepts every supported Candle Timeframe", () => {
  for (const timeframe of Object.values(CandleTimeframe)) {
    assert.equal(requireCandleTimeframe(timeframe), timeframe);
  }
});

test("rejects unsupported Candle Timeframes", () => {
  for (const invalid of [undefined, null, "", "TEN_MINUTES", "ONE_QUARTER", "one_hour", 60]) {
    assert.throws(
      () => requireCandleTimeframe(invalid),
      error => error?.code === "INVALID_CANDLE_TIMEFRAME"
    );
  }
});
