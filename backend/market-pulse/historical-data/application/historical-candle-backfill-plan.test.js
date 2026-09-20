"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  CandleTimeframe
} = require("../domain/candle-timeframe");
const {
  createHistoricalCandleBackfillPlan
} = require("./historical-candle-backfill-plan");

test("plans one year of minute days and ten annual daily ranges in Moscow time", () => {
  const plan = createHistoricalCandleBackfillPlan({
    instrumentId: " CNYRUB_TOM ",
    asOf: "2026-09-17T08:15:00.000Z"
  });

  assert.equal(plan.instrumentId, "CNYRUB_TOM");
  assert.equal(plan.minuteRanges.length, 365);
  assert.equal(plan.dailyRanges.length, 10);
  assert.deepEqual(plan.minuteWindow, {
    from: "2025-09-16T21:00:00.000Z",
    till: "2026-09-16T21:00:00.000Z"
  });
  assert.deepEqual(plan.dailyWindow, {
    from: "2016-09-16T21:00:00.000Z",
    till: "2026-09-16T21:00:00.000Z"
  });
  assert.deepEqual(plan.minuteRanges[0], {
    instrumentId: "CNYRUB_TOM",
    timeframe: CandleTimeframe.ONE_MINUTE,
    from: "2025-09-16T21:00:00.000Z",
    till: "2025-09-17T21:00:00.000Z"
  });
  assert.deepEqual(plan.dailyRanges.at(-1), {
    instrumentId: "CNYRUB_TOM",
    timeframe: CandleTimeframe.ONE_DAY,
    from: "2025-09-16T21:00:00.000Z",
    till: "2026-09-16T21:00:00.000Z"
  });
  assert.equal(plan.ranges.length, 375);
  assert.equal(Object.isFrozen(plan), true);
  assert.equal(Object.isFrozen(plan.ranges), true);
});

test("uses the last fully closed Moscow day and handles a leap-day anniversary", () => {
  const plan = createHistoricalCandleBackfillPlan({
    instrumentId: "CNYRUB_TOM",
    asOf: "2024-02-29T12:00:00.000Z"
  });

  assert.deepEqual(plan.minuteWindow, {
    from: "2023-02-27T21:00:00.000Z",
    till: "2024-02-28T21:00:00.000Z"
  });
  assert.equal(plan.minuteRanges.length, 366);
  assert.deepEqual(plan.dailyWindow, {
    from: "2014-02-27T20:00:00.000Z",
    till: "2024-02-28T21:00:00.000Z"
  });
  assert.equal(plan.dailyRanges.length, 10);
});

test("rejects an invalid As Of timestamp before creating ranges", () => {
  assert.throws(
    () => createHistoricalCandleBackfillPlan({
      instrumentId: "CNYRUB_TOM",
      asOf: "not-a-date"
    }),
    error => error?.code === "INVALID_HISTORICAL_CANDLE_BACKFILL_PLAN"
  );
});
