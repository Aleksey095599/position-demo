"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  GetManualHistoricalSourceCandleSyncPlanUseCase
} = require("./get-manual-historical-source-candle-sync-plan-use-case");

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

test("loads coverage once for the complete requested historical window", async () => {
  let receivedQuery;
  const useCase = new GetManualHistoricalSourceCandleSyncPlanUseCase({
    marketSourceCandleRepository: repository({
      findLoadedRanges(query) {
        receivedQuery = query;
        return [{
          from: "2026-09-14T21:00:00.000Z",
          till: "2026-09-15T21:00:00.000Z",
          loadedAt: "2026-09-18T08:00:00.000Z"
        }];
      }
    }),
    now: () => Date.parse("2026-09-18T08:30:00.000Z")
  });

  const plan = await useCase.execute({
    instrumentId: " CNYRUB_TOM ",
    fromDate: "2026-09-15"
  });

  assert.deepEqual(receivedQuery, {
    instrumentId: "CNYRUB_TOM",
    timeframe: "ONE_MINUTE",
    from: "2026-09-14T21:00:00.000Z",
    till: "2026-09-17T21:00:00.000Z"
  });
  assert.equal(plan.completedDayCount, 1);
  assert.equal(plan.pendingDayCount, 2);
});

test("validates repository and clock dependencies", async () => {
  assert.throws(
    () => new GetManualHistoricalSourceCandleSyncPlanUseCase({}),
    error => error?.code === "INVALID_MARKET_CANDLE_LOAD_RANGE_REPOSITORY"
  );
  assert.throws(
    () => new GetManualHistoricalSourceCandleSyncPlanUseCase({
      marketSourceCandleRepository: repository(),
      now: null
    }),
    error => error?.code === "INVALID_MANUAL_HISTORICAL_SOURCE_CANDLE_SYNC_CONFIGURATION"
  );

  const useCase = new GetManualHistoricalSourceCandleSyncPlanUseCase({
    marketSourceCandleRepository: repository(),
    now: () => Number.NaN
  });

  await assert.rejects(
    useCase.execute({ instrumentId: "CNYRUB_TOM", fromDate: "2026-09-15" }),
    error => error?.code === "INVALID_MANUAL_HISTORICAL_SOURCE_CANDLE_SYNC_CONFIGURATION"
  );
});
