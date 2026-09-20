"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  SyncNextManualHistoricalSourceCandleDayUseCase
} = require("./sync-next-manual-historical-source-candle-day-use-case");

const COMPLETED_DAY = Object.freeze({
  date: "2026-09-15",
  from: "2026-09-14T21:00:00.000Z",
  till: "2026-09-15T21:00:00.000Z",
  status: "COMPLETED"
});
const FIRST_PENDING_DAY = Object.freeze({
  date: "2026-09-16",
  from: "2026-09-15T21:00:00.000Z",
  till: "2026-09-16T21:00:00.000Z",
  status: "PENDING"
});
const SECOND_PENDING_DAY = Object.freeze({
  date: "2026-09-17",
  from: "2026-09-16T21:00:00.000Z",
  till: "2026-09-17T21:00:00.000Z",
  status: "PENDING"
});

function plan(days = [COMPLETED_DAY, FIRST_PENDING_DAY, SECOND_PENDING_DAY]) {
  const completedDayCount = days.filter(day => day.status === "COMPLETED").length;

  return Object.freeze({
    instrumentId: "CNYRUB_TOM",
    fromDate: "2026-09-15",
    throughDate: "2026-09-17",
    from: "2026-09-14T21:00:00.000Z",
    till: "2026-09-17T21:00:00.000Z",
    totalDayCount: days.length,
    completedDayCount,
    pendingDayCount: days.length - completedDayCount,
    complete: completedDayCount === days.length,
    days: Object.freeze(days)
  });
}

test("loads only the oldest pending day and exposes an updated UI plan", async () => {
  let planCommand;
  const executedRanges = [];
  const useCase = new SyncNextManualHistoricalSourceCandleDayUseCase({
    getPlanUseCase: {
      async execute(command) {
        planCommand = command;
        return plan();
      }
    },
    backfillRangeUseCase: {
      async execute(range) {
        executedRanges.push(range);
        return {
          ...range,
          skipped: false,
          pageCount: 2,
          fetchedCandleCount: 501,
          storedCandleCount: 501
        };
      }
    }
  });

  const command = { instrumentId: "CNYRUB_TOM", fromDate: "2026-09-15" };
  const result = await useCase.execute(command);

  assert.equal(planCommand, command);
  assert.deepEqual(executedRanges, [{
    instrumentId: "CNYRUB_TOM",
    timeframe: "ONE_MINUTE",
    from: FIRST_PENDING_DAY.from,
    till: FIRST_PENDING_DAY.till
  }]);
  assert.deepEqual(result.processedDay, {
    ...FIRST_PENDING_DAY,
    status: "COMPLETED",
    skipped: false,
    pageCount: 2,
    fetchedCandleCount: 501,
    storedCandleCount: 501
  });
  assert.deepEqual(
    result.days.map(day => day.status),
    ["COMPLETED", "COMPLETED", "PENDING"]
  );
  assert.equal(result.completedDayCount, 2);
  assert.equal(result.pendingDayCount, 1);
  assert.equal(result.complete, false);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.processedDay), true);
  assert.equal(Object.isFrozen(result.days), true);
});

test("returns a completed plan without calling the source when no day is pending", async () => {
  let rangeCalled = false;
  const completedPlan = plan([
    COMPLETED_DAY,
    Object.freeze({ ...FIRST_PENDING_DAY, status: "COMPLETED" })
  ]);
  const useCase = new SyncNextManualHistoricalSourceCandleDayUseCase({
    getPlanUseCase: {
      async execute() {
        return completedPlan;
      }
    },
    backfillRangeUseCase: {
      async execute() {
        rangeCalled = true;
      }
    }
  });

  const result = await useCase.execute({});

  assert.equal(rangeCalled, false);
  assert.equal(result.complete, true);
  assert.equal(result.processedDay, null);
});

test("stops on the failed day and preserves its calendar identity", async () => {
  const sourceError = new Error("MOEX unavailable");
  const executedRanges = [];
  const useCase = new SyncNextManualHistoricalSourceCandleDayUseCase({
    getPlanUseCase: {
      async execute() {
        return plan();
      }
    },
    backfillRangeUseCase: {
      async execute(range) {
        executedRanges.push(range);
        throw sourceError;
      }
    }
  });

  await assert.rejects(
    useCase.execute({}),
    error => {
      assert.equal(error.code, "HISTORICAL_SOURCE_CANDLE_DAY_SYNC_FAILED");
      assert.equal(error.date, FIRST_PENDING_DAY.date);
      assert.equal(error.from, FIRST_PENDING_DAY.from);
      assert.equal(error.till, FIRST_PENDING_DAY.till);
      assert.equal(error.cause, sourceError);
      return true;
    }
  );
  assert.equal(executedRanges.length, 1);
});

test("validates step dependencies", () => {
  assert.throws(
    () => new SyncNextManualHistoricalSourceCandleDayUseCase({}),
    error => error?.code === "INVALID_MANUAL_HISTORICAL_SOURCE_CANDLE_SYNC_CONFIGURATION"
  );
});
