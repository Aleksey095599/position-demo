"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  ClientDealGenerationProcess
} = require("./client-deal-generation-process");

test("schedules a random delay and generates a random-sized cycle", async () => {
  let generatedTradeId = 40;
  const scheduled = [];
  const randomValues = [0, 0.999, 0.5];
  const process = new ClientDealGenerationProcess({
    generateOne: async () => ({ tradeId: ++generatedTradeId }),
    getGenerationCycle: () => ({
      minIntervalMs: 1000,
      maxIntervalMs: 3000,
      minDealsPerCycle: 3,
      maxDealsPerCycle: 7
    }),
    setTimeoutFn: (callback, delayMs) => {
      const timer = { callback, delayMs, unref() {} };
      scheduled.push(timer);
      return timer;
    },
    clearTimeoutFn: () => {},
    random: () => randomValues.shift(),
    now: () => new Date("2026-07-24T08:15:00.000Z")
  });

  const started = process.start();

  assert.equal(started.running, true);
  assert.equal(started.generatedDealCount, 0);
  assert.equal(started.nextCycleAt, "2026-07-24T08:15:01.000Z");
  assert.equal(scheduled[0].delayMs, 1000);

  await scheduled[0].callback();

  assert.equal(process.status().generatedDealCount, 7);
  assert.equal(process.status().lastCycleSize, 7);
  assert.equal(process.status().lastCycleGeneratedDealCount, 7);
  assert.equal(process.status().lastGeneratedTradeId, 47);
  assert.equal(scheduled[1].delayMs, 2000);
});

test("keeps the process alive and exposes a cycle generation error", async () => {
  const scheduled = [];
  const process = new ClientDealGenerationProcess({
    generateOne: async () => {
      throw new Error("No eligible Pricing Rule.");
    },
    setTimeoutFn: (callback, delayMs) => {
      const timer = { callback, delayMs, unref() {} };
      scheduled.push(timer);
      return timer;
    },
    clearTimeoutFn: () => {},
    random: () => 0
  });

  process.start();
  await scheduled[0].callback();

  const status = process.status();
  assert.equal(status.running, true);
  assert.equal(status.generatedDealCount, 0);
  assert.equal(status.lastCycleSize, 3);
  assert.equal(status.lastCycleGeneratedDealCount, 0);
  assert.equal(status.lastError, "No eligible Pricing Rule.");
  assert.equal(scheduled.length, 2);
  process.dispose();
});

test("reschedules a running process when cycle settings change", () => {
  let cycle = {
    minIntervalMs: 1000,
    maxIntervalMs: 1000,
    minDealsPerCycle: 3,
    maxDealsPerCycle: 3
  };
  const scheduled = [];
  const cleared = [];
  const process = new ClientDealGenerationProcess({
    generateOne: async () => ({ tradeId: 41 }),
    getGenerationCycle: () => cycle,
    setTimeoutFn: (callback, delayMs) => {
      const timer = { callback, delayMs, unref() {} };
      scheduled.push(timer);
      return timer;
    },
    clearTimeoutFn: timer => cleared.push(timer),
    random: () => 0
  });

  process.start();
  cycle = { ...cycle, minIntervalMs: 3000, maxIntervalMs: 3000 };
  const status = process.reschedule();

  assert.equal(cleared[0], scheduled[0]);
  assert.equal(scheduled[1].delayMs, 3000);
  assert.equal(status.minIntervalMs, 3000);
  process.dispose();
});

test("resets generation-cycle state after stopping the process", () => {
  let clearedTimer = null;
  const timer = { unref() {} };
  const process = new ClientDealGenerationProcess({
    generateOne: async () => ({ tradeId: 41 }),
    setTimeoutFn: () => timer,
    clearTimeoutFn: value => {
      clearedTimer = value;
    },
    now: () => new Date("2026-07-24T08:15:00.000Z")
  });

  process.start();
  const reset = process.reset();

  assert.equal(clearedTimer, timer);
  assert.deepEqual(reset, {
    running: false,
    status: "STOPPED",
    minIntervalMs: 1000,
    maxIntervalMs: 3000,
    minDealsPerCycle: 3,
    maxDealsPerCycle: 7,
    generationInProgress: false,
    generatedDealCount: 0,
    lastCycleSize: null,
    lastCycleGeneratedDealCount: 0,
    lastGeneratedTradeId: null,
    lastGeneratedAt: null,
    nextCycleAt: null,
    lastError: null
  });
});
