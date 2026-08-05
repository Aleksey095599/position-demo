"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  FX_BATCHING_WINDOW_STATUS,
  planFxBatchingWindows
} = require("./fx-batching-window-planner");
const {
  FX_BATCH_FORMATION_REASON_CODE
} = require("./fx-batch-formation-reason");

function trade(overrides = {}) {
  return {
    tradeId: 1,
    entryTimestamp: "2026-08-05T09:00:00.000Z",
    ccyPairCode: "EUR_USD",
    side: "SELL",
    transferRate: "1.1220",
    tradeDate: "2026-08-05",
    tenor: "TOD",
    baseCcyValueDate: "2026-08-05",
    quoteCcyValueDate: "2026-08-05",
    baseCcyFractionDigits: 2,
    quoteCcyFractionDigits: 2,
    ...overrides
  };
}

test("opens a Batching Window with the first Trade and keeps it open until a trigger", () => {
  const windows = planFxBatchingWindows({
    trades: [
      trade({ tradeId: 1 }),
      trade({
        tradeId: 2,
        entryTimestamp: "2026-08-05T09:00:10.000Z",
        transferRate: "1.1221"
      })
    ],
    maxSpreadPercent: "0.05",
    maxIntervalSeconds: 60,
    now: new Date("2026-08-05T09:00:30.000Z")
  });

  assert.equal(windows.length, 1);
  assert.equal(windows[0].status, FX_BATCHING_WINDOW_STATUS.OPEN);
  assert.equal(windows[0].openedAt, "2026-08-05T09:00:00.000Z");
  assert.equal(windows[0].deadlineAt, "2026-08-05T09:01:00.000Z");
  assert.equal(windows[0].closedAt, null);
  assert.equal(windows[0].closeTrigger, null);
  assert.deepEqual(windows[0].trades.map(item => item.tradeId), [1, 2]);
});

test("rejects Carry-in Position as a Batching Window trade", () => {
  assert.throws(
    () => planFxBatchingWindows({
      trades: [trade({
        tradeId: 7,
        tradeType: "BATCH_POSITION_OUT"
      })],
      maxSpreadPercent: "0.05",
      maxIntervalSeconds: 60,
      now: new Date("2026-08-05T09:00:30.000Z")
    }),
    error => {
      assert.equal(error.code, "INVALID_FX_BATCHING_WINDOW_PLAN");
      assert.match(error.message, /Carry-in Position 7/);
      return true;
    }
  );
});

test("closes at the exact Maximum Batching Interval and opens a later Trade in a new window", () => {
  const windows = planFxBatchingWindows({
    trades: [
      trade({ tradeId: 1 }),
      trade({
        tradeId: 2,
        entryTimestamp: "2026-08-05T09:01:05.000Z",
        transferRate: "1.1221"
      })
    ],
    maxSpreadPercent: "0.05",
    maxIntervalSeconds: 60,
    now: new Date("2026-08-05T09:01:10.000Z")
  });

  assert.equal(windows.length, 2);
  assert.equal(windows[0].status, FX_BATCHING_WINDOW_STATUS.CLOSED);
  assert.equal(
    windows[0].closeTrigger,
    FX_BATCH_FORMATION_REASON_CODE.MAX_INTERVAL_REACHED
  );
  assert.equal(windows[0].closedAt, "2026-08-05T09:01:00.000Z");
  assert.deepEqual(windows[0].trades.map(item => item.tradeId), [1]);
  assert.equal(windows[1].status, FX_BATCHING_WINDOW_STATUS.OPEN);
  assert.equal(windows[1].openedAt, "2026-08-05T09:01:05.000Z");
  assert.deepEqual(windows[1].trades.map(item => item.tradeId), [2]);
});

test("a breaching Trade closes the current window and opens the next one", () => {
  const windows = planFxBatchingWindows({
    trades: [
      trade({ tradeId: 1, transferRate: "1.1220" }),
      trade({
        tradeId: 2,
        entryTimestamp: "2026-08-05T09:00:01.000Z",
        transferRate: "1.1222"
      }),
      trade({
        tradeId: 3,
        entryTimestamp: "2026-08-05T09:00:02.000Z",
        transferRate: "1.1250"
      })
    ],
    maxSpreadPercent: "0.05",
    maxIntervalSeconds: 60,
    now: new Date("2026-08-05T09:00:02.000Z")
  });

  assert.equal(windows.length, 2);
  assert.equal(
    windows[0].closeTrigger,
    FX_BATCH_FORMATION_REASON_CODE.TRANSFER_RATE_CORRIDOR_BREACHED
  );
  assert.equal(windows[0].closedAt, "2026-08-05T09:00:02.000Z");
  assert.deepEqual(windows[0].trades.map(item => item.tradeId), [1, 2]);
  assert.equal(windows[0].breachingTrade.tradeId, 3);
  assert.equal(windows[1].status, FX_BATCHING_WINDOW_STATUS.OPEN);
  assert.equal(windows[1].openedAt, "2026-08-05T09:00:02.000Z");
  assert.deepEqual(windows[1].trades.map(item => item.tradeId), [3]);
});

test("does not let a future Trade close a Batching Window", () => {
  assert.throws(
    () => planFxBatchingWindows({
      trades: [
        trade({ tradeId: 1 }),
        trade({
          tradeId: 2,
          entryTimestamp: "2026-08-05T09:00:10.000Z",
          transferRate: "1.1300"
        })
      ],
      maxSpreadPercent: "0.05",
      maxIntervalSeconds: 60,
      now: new Date("2026-08-05T09:00:05.000Z")
    }),
    error => error?.code === "INVALID_FX_BATCHING_WINDOW_PLAN"
      && /before its Entry Timestamp/.test(error.message)
  );
});
