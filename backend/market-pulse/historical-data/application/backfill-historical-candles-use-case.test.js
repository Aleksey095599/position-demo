"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  BackfillHistoricalCandlesUseCase
} = require("./backfill-historical-candles-use-case");

const RANGES = Object.freeze([
  Object.freeze({ id: "covered" }),
  Object.freeze({ id: "first-pending" }),
  Object.freeze({ id: "second-pending" })
]);

function plan() {
  return Object.freeze({
    instrumentId: "CNYRUB_TOM",
    asOf: "2026-09-17T08:15:00.000Z",
    minuteWindow: Object.freeze({ from: "minute-from", till: "minute-till" }),
    dailyWindow: Object.freeze({ from: "daily-from", till: "daily-till" }),
    ranges: RANGES
  });
}

function loadedResult(range) {
  return Object.freeze({
    ...range,
    skipped: false,
    fetchedCandleCount: 10,
    storedCandleCount: 10,
    pageCount: 2
  });
}

test("resumes through covered ranges and loads only the bounded batch", async () => {
  const executed = [];
  let planArguments;
  const useCase = new BackfillHistoricalCandlesUseCase({
    backfillRangeUseCase: {
      async execute(range) {
        executed.push(range.id);

        return range.id === "covered"
          ? { ...range, skipped: true }
          : loadedResult(range);
      }
    },
    createPlan(argumentsValue) {
      planArguments = argumentsValue;
      return plan();
    }
  });

  const result = await useCase.execute({
    instrumentId: "CNYRUB_TOM",
    asOf: "2026-09-17T08:15:00.000Z"
  });

  assert.deepEqual(planArguments, {
    instrumentId: "CNYRUB_TOM",
    asOf: "2026-09-17T08:15:00.000Z"
  });
  assert.deepEqual(executed, ["covered", "first-pending"]);
  assert.equal(result.requestedRangeCount, 3);
  assert.equal(result.inspectedRangeCount, 2);
  assert.equal(result.skippedRangeCount, 1);
  assert.equal(result.loadedRangeCount, 1);
  assert.equal(result.fetchedCandleCount, 10);
  assert.equal(result.storedCandleCount, 10);
  assert.equal(result.pageCount, 2);
  assert.equal(result.complete, false);
  assert.deepEqual(result.loadedRanges, [loadedResult(RANGES[1])]);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.loadedRanges), true);
});

test("can load several ranges and reports completion", async () => {
  const useCase = new BackfillHistoricalCandlesUseCase({
    backfillRangeUseCase: {
      async execute(range) {
        return range.id === "covered"
          ? { ...range, skipped: true }
          : loadedResult(range);
      }
    },
    createPlan: plan
  });

  const result = await useCase.execute({
    instrumentId: "CNYRUB_TOM",
    maxRanges: 2
  });

  assert.equal(result.inspectedRangeCount, 3);
  assert.equal(result.loadedRangeCount, 2);
  assert.equal(result.skippedRangeCount, 1);
  assert.equal(result.complete, true);
  assert.equal(result.fetchedCandleCount, 20);
  assert.equal(result.storedCandleCount, 20);
  assert.equal(result.pageCount, 4);
});

test("rejects unsafe batch sizes and missing dependencies", async () => {
  assert.throws(
    () => new BackfillHistoricalCandlesUseCase({}),
    error => error?.code === "INVALID_HISTORICAL_CANDLES_BACKFILL_CONFIGURATION"
  );

  const useCase = new BackfillHistoricalCandlesUseCase({
    backfillRangeUseCase: { async execute() {} },
    createPlan: plan
  });

  await assert.rejects(
    useCase.execute({ instrumentId: "CNYRUB_TOM", maxRanges: 51 }),
    error => error?.code === "INVALID_HISTORICAL_CANDLES_BACKFILL_COMMAND"
  );
});
