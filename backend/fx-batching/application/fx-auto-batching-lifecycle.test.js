"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  planFxAutoBatching
} = require("../domain/fx-auto-batching-policy");
const {
  FxAutoBatchingProcess
} = require("./fx-auto-batching-process");
const {
  selectFxTradesForAutoBatchingRun
} = require("./fx-auto-batching-trade-scope");

function trade(
  tradeId,
  receivedTimestamp,
  transferRate = "1.1220",
  overrides = {}
) {
  return {
    tradeId,
    tradeType: "CLIENT_DEAL",
    receivedTimestamp,
    ccyPairCode: "EUR_USD",
    side: "SELL",
    transferRate,
    tradeDate: "2026-08-05",
    tenor: "TOD",
    baseCcyValueDate: "2026-08-05",
    quoteCcyValueDate: "2026-08-05",
    baseCcyFractionDigits: 2,
    quoteCcyFractionDigits: 2,
    ...overrides
  };
}

test("Stop cancels an open window and restart batches only newly arrived Trades", async () => {
  let now = new Date("2026-08-05T09:00:00.000Z");
  const trades = [
    trade(1, "2026-08-05T08:59:50.000Z"),
    trade(2, "2026-08-05T08:59:55.000Z")
  ];
  const scheduled = [];
  const formedCommands = [];
  const process = new FxAutoBatchingProcess({
    selectCandidates: ({ afterTradeId, excludedTradeIds }) => {
      const excluded = new Set(excludedTradeIds);
      return planFxAutoBatching({
        trades: trades.filter(item =>
          item.tradeId > afterTradeId && !excluded.has(item.tradeId)
        ),
        maxSpreadPercent: "0.05",
        maxIntervalSeconds: 5,
        now
      });
    },
    formBatch: command => {
      formedCommands.push(command);
      return { batchId: formedCommands.length, replayed: false };
    },
    getIntervalMs: () => 5000,
    getLatestTradeId: () => Math.max(0, ...trades.map(item => item.tradeId)),
    createIdempotencyKey: () => `auto-${formedCommands.length + 1}`,
    setTimeoutFn: (callback, delayMs) => {
      const timer = { callback, delayMs, cancelled: false, unref() {} };
      scheduled.push(timer);
      return timer;
    },
    clearTimeoutFn: timer => {
      timer.cancelled = true;
    },
    now: () => new Date(now.getTime())
  });
  const runNext = async () => {
    const timer = scheduled.find(item => !item.cancelled && !item.completed);

    assert.ok(timer, "An Auto Batching evaluation must be scheduled.");
    timer.completed = true;
    await timer.callback();
  };

  process.start();
  await runNext();
  assert.equal(process.status().phase, "WAITING_FOR_FIRST_TRADE");

  now = new Date("2026-08-05T09:00:01.000Z");
  trades.push(trade(3, now.toISOString()));
  process.notifyTradeCreated();
  await runNext();

  now = new Date("2026-08-05T09:00:02.000Z");
  trades.push(trade(4, now.toISOString(), "1.1221"));
  process.notifyTradeCreated();
  await runNext();
  assert.equal(process.status().phase, "WINDOW_OPEN");

  now = new Date("2026-08-05T09:00:03.000Z");
  const stopped = process.stop();
  assert.equal(stopped.lastCancelledWindowCount, 1);
  assert.deepEqual(formedCommands, []);

  process.start();
  await runNext();
  assert.equal(process.status().phase, "WAITING_FOR_FIRST_TRADE");

  now = new Date("2026-08-05T09:00:04.000Z");
  trades.push(trade(5, now.toISOString()));
  process.notifyTradeCreated();
  await runNext();

  now = new Date("2026-08-05T09:00:05.000Z");
  trades.push(trade(6, now.toISOString(), "1.1221"));
  process.notifyTradeCreated();
  await runNext();

  now = new Date("2026-08-05T09:00:09.000Z");
  await runNext();

  assert.equal(formedCommands.length, 1);
  assert.deepEqual(formedCommands[0].tradeIds, [5, 6]);
  assert.equal(formedCommands[0].windowOpenedAt, "2026-08-05T09:00:04.000Z");
  assert.equal(formedCommands[0].windowClosedAt, "2026-08-05T09:00:09.000Z");
});

test("ignores a pre-run Carry-in and reuses only a Position Out created during this run", async () => {
  let now = new Date("2026-08-05T09:00:00.000Z");
  let nextTradeId = 2;
  const trades = [trade(
    1,
    "2026-08-05T08:59:00.000Z",
    "1.1000",
    { tradeType: "BATCH_POSITION_OUT" }
  )];
  const scheduled = [];
  const formedCommands = [];
  const process = new FxAutoBatchingProcess({
    selectCandidates: ({ afterTradeId, excludedTradeIds }) => {
      return planFxAutoBatching({
        trades: selectFxTradesForAutoBatchingRun({
          trades,
          afterTradeId,
          excludedTradeIds
        }),
        maxSpreadPercent: "0.05",
        maxIntervalSeconds: 5,
        now
      });
    },
    formBatch: command => {
      formedCommands.push(command);

      for (let index = trades.length - 1; index >= 0; index -= 1) {
        if (command.tradeIds.includes(trades[index].tradeId)) {
          trades.splice(index, 1);
        }
      }

      trades.push(trade(
        nextTradeId,
        now.toISOString(),
        "1.1220",
        { tradeType: "BATCH_POSITION_OUT" }
      ));
      nextTradeId += 1;
      return { batchId: formedCommands.length, replayed: false };
    },
    getIntervalMs: () => 5000,
    getLatestTradeId: () => Math.max(0, ...trades.map(item => item.tradeId)),
    createIdempotencyKey: () => `auto-${formedCommands.length + 1}`,
    setTimeoutFn: (callback, delayMs) => {
      const timer = { callback, delayMs, cancelled: false, unref() {} };
      scheduled.push(timer);
      return timer;
    },
    clearTimeoutFn: timer => {
      timer.cancelled = true;
    },
    now: () => new Date(now.getTime())
  });
  const runNext = async () => {
    const timer = scheduled.find(item => !item.cancelled && !item.completed);

    assert.ok(timer, "An Auto Batching evaluation must be scheduled.");
    timer.completed = true;
    await timer.callback();
  };

  process.start();
  await runNext();
  assert.equal(process.status().phase, "WAITING_FOR_FIRST_TRADE");

  now = new Date("2026-08-05T09:00:01.000Z");
  trades.push(trade(nextTradeId, now.toISOString()));
  nextTradeId += 1;
  process.notifyTradeCreated();
  await runNext();
  assert.equal(process.status().phase, "WINDOW_OPEN");

  now = new Date("2026-08-05T09:00:02.000Z");
  trades.push(trade(nextTradeId, now.toISOString(), "1.1221"));
  nextTradeId += 1;
  process.notifyTradeCreated();
  await runNext();

  now = new Date("2026-08-05T09:00:06.000Z");
  await runNext();
  assert.deepEqual(formedCommands[0].tradeIds, [2, 3]);
  assert.equal(formedCommands[0].tradeIds.includes(1), false);

  await runNext();
  assert.equal(process.status().phase, "WAITING_FOR_FIRST_TRADE");
  assert.equal(formedCommands.length, 1);

  now = new Date("2026-08-05T09:00:07.000Z");
  trades.push(trade(nextTradeId, now.toISOString()));
  nextTradeId += 1;
  process.notifyTradeCreated();
  await runNext();

  now = new Date("2026-08-05T09:00:12.000Z");
  await runNext();
  assert.deepEqual(formedCommands[1].tradeIds, [4, 5]);
});
