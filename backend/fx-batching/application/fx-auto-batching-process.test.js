"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  FxAutoBatchingProcess
} = require("./fx-auto-batching-process");

test("forms at most one FX Batch after each configured interval", async () => {
  const scheduled = [];
  const commands = [];
  let batchId = 10;
  const process = new FxAutoBatchingProcess({
    selectNextTradeIds: () => [3, 5],
    formBatch: command => {
      commands.push(command);
      return { batchId: ++batchId, replayed: false };
    },
    getIntervalMs: () => 60000,
    createIdempotencyKey: () => "auto-batch-key",
    setTimeoutFn: (callback, delayMs) => {
      const timer = { callback, delayMs, unref() {} };
      scheduled.push(timer);
      return timer;
    },
    clearTimeoutFn: () => {},
    now: () => new Date("2026-08-04T09:00:00.000Z")
  });

  const started = process.start();

  assert.equal(started.running, true);
  assert.equal(started.nextCycleAt, "2026-08-04T09:01:00.000Z");
  assert.equal(scheduled[0].delayMs, 60000);
  assert.equal(commands.length, 0);

  await scheduled[0].callback();

  assert.deepEqual(commands, [{
    idempotencyKey: "auto-batch-key",
    tradeIds: [3, 5]
  }]);
  assert.equal(process.status().formedBatchCount, 1);
  assert.equal(process.status().lastFormedBatchId, 11);
  assert.equal(scheduled.length, 2);
});

test("keeps running when there are no compatible trades or formation fails", async () => {
  const scheduled = [];
  let cycle = 0;
  const process = new FxAutoBatchingProcess({
    selectNextTradeIds: () => {
      cycle += 1;
      return cycle === 1 ? [] : [7];
    },
    formBatch: () => {
      throw new Error("Batch formation conflict.");
    },
    getIntervalMs: () => 1000,
    createIdempotencyKey: () => "auto-batch-key",
    setTimeoutFn: (callback, delayMs) => {
      const timer = { callback, delayMs, unref() {} };
      scheduled.push(timer);
      return timer;
    },
    clearTimeoutFn: () => {}
  });

  process.start();
  await scheduled[0].callback();
  assert.equal(process.status().lastError, null);
  await scheduled[1].callback();

  assert.equal(process.status().running, true);
  assert.equal(process.status().formedBatchCount, 0);
  assert.equal(process.status().lastError, "Batch formation conflict.");
  assert.equal(scheduled.length, 3);
});

test("reschedules a running process when the interval changes", () => {
  let intervalMs = 1000;
  const scheduled = [];
  const cleared = [];
  const process = new FxAutoBatchingProcess({
    selectNextTradeIds: () => [],
    formBatch: () => null,
    getIntervalMs: () => intervalMs,
    createIdempotencyKey: () => "auto-batch-key",
    setTimeoutFn: (callback, delayMs) => {
      const timer = { callback, delayMs, unref() {} };
      scheduled.push(timer);
      return timer;
    },
    clearTimeoutFn: timer => cleared.push(timer)
  });

  process.start();
  intervalMs = 3000;
  const status = process.reschedule();

  assert.equal(cleared[0], scheduled[0]);
  assert.equal(scheduled[1].delayMs, 3000);
  assert.equal(status.intervalMs, 3000);
});
