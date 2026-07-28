"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  ClientDealGenerationProcess
} = require("./client-deal-generation-process");

test("starts immediately, schedules the three-second use case and stops cleanly", async () => {
  let generatedTradeId = 40;
  let scheduledCallback = null;
  let scheduledInterval = null;
  let clearedTimer = null;
  const timer = { unref() {} };
  const process = new ClientDealGenerationProcess({
    generateOne: async () => ({ tradeId: ++generatedTradeId }),
    intervalMs: 3000,
    setIntervalFn: (callback, intervalMs) => {
      scheduledCallback = callback;
      scheduledInterval = intervalMs;
      return timer;
    },
    clearIntervalFn: value => {
      clearedTimer = value;
    },
    now: () => new Date("2026-07-24T08:15:00.000Z")
  });

  const started = await process.start();

  assert.equal(started.running, true);
  assert.equal(started.generatedDealCount, 1);
  assert.equal(started.lastGeneratedTradeId, 41);
  assert.equal(scheduledInterval, 3000);

  await scheduledCallback();
  assert.equal(process.status().generatedDealCount, 2);
  assert.equal(process.status().lastGeneratedTradeId, 42);

  const stopped = process.stop();
  assert.equal(stopped.running, false);
  assert.equal(clearedTimer, timer);
});

test("keeps the process alive and exposes a generation error in status", async () => {
  const process = new ClientDealGenerationProcess({
    generateOne: async () => {
      throw new Error("No eligible Pricing Rule.");
    },
    setIntervalFn: () => ({ unref() {} }),
    clearIntervalFn: () => {}
  });

  const status = await process.start();

  assert.equal(status.running, true);
  assert.equal(status.generatedDealCount, 0);
  assert.equal(status.lastError, "No eligible Pricing Rule.");
  process.dispose();
});

test("resets demo generation state after stopping the process", async () => {
  let clearedTimer = null;
  const timer = { unref() {} };
  const process = new ClientDealGenerationProcess({
    generateOne: async () => ({ tradeId: 41 }),
    setIntervalFn: () => timer,
    clearIntervalFn: value => {
      clearedTimer = value;
    },
    now: () => new Date("2026-07-24T08:15:00.000Z")
  });

  await process.start();
  const reset = process.reset();

  assert.equal(clearedTimer, timer);
  assert.deepEqual(reset, {
    running: false,
    status: "STOPPED",
    intervalMs: 3000,
    generationInProgress: false,
    generatedDealCount: 0,
    lastGeneratedTradeId: null,
    lastGeneratedAt: null,
    lastError: null
  });
});
