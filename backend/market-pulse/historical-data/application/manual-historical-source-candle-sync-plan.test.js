"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  ManualHistoricalSourceCandleDayStatus,
  applyLoadedRangesToManualHistoricalSourceCandleSyncSchedule,
  createManualHistoricalSourceCandleSyncSchedule
} = require("./manual-historical-source-candle-sync-plan");

test("plans complete Moscow calendar days from the selected date through yesterday", () => {
  const schedule = createManualHistoricalSourceCandleSyncSchedule({
    instrumentId: " CNYRUB_TOM ",
    fromDate: "2026-09-15",
    asOf: "2026-09-18T08:30:00.000Z"
  });

  assert.equal(schedule.instrumentId, "CNYRUB_TOM");
  assert.equal(schedule.fromDate, "2026-09-15");
  assert.equal(schedule.throughDate, "2026-09-17");
  assert.equal(schedule.from, "2026-09-14T21:00:00.000Z");
  assert.equal(schedule.till, "2026-09-17T21:00:00.000Z");
  assert.deepEqual(schedule.days, [
    {
      date: "2026-09-15",
      from: "2026-09-14T21:00:00.000Z",
      till: "2026-09-15T21:00:00.000Z"
    },
    {
      date: "2026-09-16",
      from: "2026-09-15T21:00:00.000Z",
      till: "2026-09-16T21:00:00.000Z"
    },
    {
      date: "2026-09-17",
      from: "2026-09-16T21:00:00.000Z",
      till: "2026-09-17T21:00:00.000Z"
    }
  ]);
  assert.equal(Object.isFrozen(schedule), true);
  assert.equal(Object.isFrozen(schedule.days), true);
  assert.equal(Object.isFrozen(schedule.days[0]), true);
});

test("derives completed and pending days from persisted load coverage", () => {
  const schedule = createManualHistoricalSourceCandleSyncSchedule({
    instrumentId: "CNYRUB_TOM",
    fromDate: "2026-09-15",
    asOf: "2026-09-18T08:30:00.000Z"
  });
  const plan = applyLoadedRangesToManualHistoricalSourceCandleSyncSchedule(
    schedule,
    [
      {
        from: "2026-09-14T21:00:00.000Z",
        till: "2026-09-16T21:00:00.000Z"
      }
    ]
  );

  assert.deepEqual(
    plan.days.map(day => ({ date: day.date, status: day.status })),
    [
      {
        date: "2026-09-15",
        status: ManualHistoricalSourceCandleDayStatus.COMPLETED
      },
      {
        date: "2026-09-16",
        status: ManualHistoricalSourceCandleDayStatus.COMPLETED
      },
      {
        date: "2026-09-17",
        status: ManualHistoricalSourceCandleDayStatus.PENDING
      }
    ]
  );
  assert.equal(plan.totalDayCount, 3);
  assert.equal(plan.completedDayCount, 2);
  assert.equal(plan.pendingDayCount, 1);
  assert.equal(plan.complete, false);
  assert.equal(Object.isFrozen(plan), true);
  assert.equal(Object.isFrozen(plan.days), true);
});

test("rejects invalid dates and excludes the current Moscow calendar day", () => {
  const command = {
    instrumentId: "CNYRUB_TOM",
    asOf: "2026-09-18T20:59:59.000Z"
  };

  assert.throws(
    () => createManualHistoricalSourceCandleSyncSchedule({
      ...command,
      fromDate: "2026-02-30"
    }),
    error => error?.code === "INVALID_MANUAL_HISTORICAL_SOURCE_CANDLE_SYNC_COMMAND"
  );
  assert.throws(
    () => createManualHistoricalSourceCandleSyncSchedule({
      ...command,
      fromDate: "18.09.2026"
    }),
    error => error?.code === "INVALID_MANUAL_HISTORICAL_SOURCE_CANDLE_SYNC_COMMAND"
  );
  assert.throws(
    () => createManualHistoricalSourceCandleSyncSchedule({
      ...command,
      fromDate: "2026-09-18"
    }),
    error => error?.code === "INVALID_MANUAL_HISTORICAL_SOURCE_CANDLE_SYNC_COMMAND"
  );
  assert.throws(
    () => createManualHistoricalSourceCandleSyncSchedule({
      ...command,
      fromDate: "2025-09-16"
    }),
    error => (
      error?.code === "INVALID_MANUAL_HISTORICAL_SOURCE_CANDLE_SYNC_COMMAND"
      && /366/.test(error.message)
    )
  );
});
