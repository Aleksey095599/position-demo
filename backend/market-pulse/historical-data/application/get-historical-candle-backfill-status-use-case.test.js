"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  CandleTimeframe
} = require("../domain/candle-timeframe");
const {
  GetHistoricalCandleBackfillStatusUseCase
} = require("./get-historical-candle-backfill-status-use-case");

const MINUTE_RANGES = Object.freeze([
  Object.freeze({
    instrumentId: "CNYRUB_TOM",
    timeframe: CandleTimeframe.ONE_MINUTE,
    from: "2026-09-14T21:00:00.000Z",
    till: "2026-09-15T21:00:00.000Z"
  }),
  Object.freeze({
    instrumentId: "CNYRUB_TOM",
    timeframe: CandleTimeframe.ONE_MINUTE,
    from: "2026-09-15T21:00:00.000Z",
    till: "2026-09-16T21:00:00.000Z"
  })
]);
const DAILY_RANGES = Object.freeze([
  Object.freeze({
    instrumentId: "CNYRUB_TOM",
    timeframe: CandleTimeframe.ONE_DAY,
    from: "2025-09-16T21:00:00.000Z",
    till: "2026-09-16T21:00:00.000Z"
  })
]);

function plan() {
  return Object.freeze({
    instrumentId: "CNYRUB_TOM",
    asOf: "2026-09-17T08:00:00.000Z",
    minuteWindow: Object.freeze({
      from: MINUTE_RANGES[0].from,
      till: MINUTE_RANGES.at(-1).till
    }),
    dailyWindow: Object.freeze({
      from: DAILY_RANGES[0].from,
      till: DAILY_RANGES[0].till
    }),
    minuteRanges: MINUTE_RANGES,
    dailyRanges: DAILY_RANGES,
    ranges: Object.freeze([...MINUTE_RANGES, ...DAILY_RANGES])
  });
}

function repository(overrides = {}) {
  return {
    upsertLoadedRange() {},
    findLoadedRanges() {
      return [];
    },
    coversLoadedRange() {
      return false;
    },
    ...overrides
  };
}

test("reports progress from persisted coverage without an external data call", async () => {
  const queries = [];
  const useCase = new GetHistoricalCandleBackfillStatusUseCase({
    marketSourceCandleRepository: repository({
      findLoadedRanges(query) {
        queries.push(query);

        return query.timeframe === CandleTimeframe.ONE_MINUTE
          ? [{
            from: MINUTE_RANGES[0].from,
            till: MINUTE_RANGES[0].till,
            loadedAt: "2026-09-17T09:00:00.000Z"
          }]
          : [{
            from: DAILY_RANGES[0].from,
            till: DAILY_RANGES[0].till,
            loadedAt: "2026-09-17T09:00:00.000Z"
          }];
      }
    }),
    createPlan: plan
  });

  const result = await useCase.execute({ instrumentId: "CNYRUB_TOM" });

  assert.equal(queries.length, 2);
  assert.equal(result.complete, false);
  assert.deepEqual(result.minute, {
    timeframe: CandleTimeframe.ONE_MINUTE,
    from: MINUTE_RANGES[0].from,
    till: MINUTE_RANGES.at(-1).till,
    plannedRangeCount: 2,
    loadedRangeCount: 1,
    complete: false,
    nextRange: MINUTE_RANGES[1]
  });
  assert.deepEqual(result.daily, {
    timeframe: CandleTimeframe.ONE_DAY,
    from: DAILY_RANGES[0].from,
    till: DAILY_RANGES[0].till,
    plannedRangeCount: 1,
    loadedRangeCount: 1,
    complete: true,
    nextRange: null
  });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.minute), true);
});

test("accepts merged coverage spanning several planned ranges", async () => {
  const useCase = new GetHistoricalCandleBackfillStatusUseCase({
    marketSourceCandleRepository: repository({
      findLoadedRanges(query) {
        return [{
          from: query.from,
          till: query.till,
          loadedAt: "2026-09-17T09:00:00.000Z"
        }];
      }
    }),
    createPlan: plan
  });

  const result = await useCase.execute({ instrumentId: "CNYRUB_TOM" });

  assert.equal(result.complete, true);
  assert.equal(result.minute.loadedRangeCount, 2);
  assert.equal(result.daily.loadedRangeCount, 1);
  assert.equal(result.minute.nextRange, null);
});

test("rejects a repository without coverage operations", () => {
  assert.throws(
    () => new GetHistoricalCandleBackfillStatusUseCase({
      marketSourceCandleRepository: {}
    }),
    error => error?.code === "INVALID_MARKET_CANDLE_LOAD_RANGE_REPOSITORY"
  );
});
