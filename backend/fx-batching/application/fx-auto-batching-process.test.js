"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  FxAutoBatchingProcess
} = require("./fx-auto-batching-process");

test("forms one independent FX Batch per currency pair after each configured interval", async () => {
  const scheduled = [];
  const commands = [];
  let batchId = 10;
  let idempotencySequence = 0;
  const process = new FxAutoBatchingProcess({
    selectCandidates: () => ({
      candidates: [
        {
          ccyPairCode: "EUR_USD",
          tradeIds: [3, 5],
          formationReasonCode: "MAX_INTERVAL_REACHED",
          formationReasonDetails: { maxIntervalSeconds: 60 }
        },
        {
          ccyPairCode: "GBP_USD",
          tradeIds: [7, 9],
          formationReasonCode: "TRANSFER_RATE_CORRIDOR_BREACHED",
          formationReasonDetails: { maxSpreadPercent: "0.05" }
        }
      ],
      nextEvaluationDelayMs: 60000
    }),
    formBatch: command => {
      commands.push(command);
      return { batchId: ++batchId, replayed: false };
    },
    getIntervalMs: () => 60000,
    createIdempotencyKey: () => `auto-batch-key-${++idempotencySequence}`,
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
  assert.equal(started.nextCycleAt, "2026-08-04T09:00:00.000Z");
  assert.equal(scheduled[0].delayMs, 0);
  assert.equal(commands.length, 0);

  await scheduled[0].callback();

  assert.deepEqual(commands, [
    {
      idempotencyKey: "auto-batch-key-1",
      tradeIds: [3, 5],
      formationReasonCode: "MAX_INTERVAL_REACHED",
      formationReasonDetails: { maxIntervalSeconds: 60 }
    },
    {
      idempotencyKey: "auto-batch-key-2",
      tradeIds: [7, 9],
      formationReasonCode: "TRANSFER_RATE_CORRIDOR_BREACHED",
      formationReasonDetails: { maxSpreadPercent: "0.05" }
    }
  ]);
  assert.equal(process.status().formedBatchCount, 2);
  assert.equal(process.status().lastCandidatePairCount, 2);
  assert.equal(process.status().lastCandidateTradeCount, 4);
  assert.equal(process.status().lastCycleBatchCount, 2);
  assert.equal(process.status().lastFormedBatchId, 12);
  assert.deepEqual(process.status().lastFormedBatchIds, [11, 12]);
  assert.equal(scheduled.length, 2);
  assert.equal(scheduled[1].delayMs, 60000);
});

test("re-evaluates immediately after forming candidates", async () => {
  const scheduled = [];
  let nowMs = Date.parse("2026-08-04T09:00:00.000Z");
  let selectionCount = 0;
  const process = new FxAutoBatchingProcess({
    selectCandidates: () => {
      selectionCount += 1;
      return selectionCount === 1
        ? {
            candidates: [
              { ccyPairCode: "EUR_USD", tradeIds: [1] },
              { ccyPairCode: "GBP_USD", tradeIds: [2] }
            ],
            nextEvaluationDelayMs: 0
          }
        : { candidates: [], nextEvaluationDelayMs: 300 };
    },
    formBatch: () => {
      nowMs += 350;
      return { batchId: nowMs, replayed: false };
    },
    getIntervalMs: () => 1000,
    createIdempotencyKey: () => `auto-batch-key-${nowMs}`,
    setTimeoutFn: (callback, delayMs) => {
      const timer = { callback, delayMs, unref() {} };
      scheduled.push(timer);
      return timer;
    },
    clearTimeoutFn: () => {},
    now: () => new Date(nowMs)
  });

  process.start();
  await scheduled[0].callback();

  assert.equal(scheduled[1].delayMs, 0);
  await scheduled[1].callback();
  assert.equal(scheduled[2].delayMs, 300);
  assert.equal(process.status().nextCycleAt, "2026-08-04T09:00:01.000Z");
});

test("keeps running and continues with other currency pairs when one pair fails", async () => {
  const scheduled = [];
  let cycle = 0;
  const process = new FxAutoBatchingProcess({
    selectCandidates: () => {
      cycle += 1;
      return cycle === 1
        ? { candidates: [], nextEvaluationDelayMs: 1000 }
        : {
            candidates: [
              { ccyPairCode: "EUR_USD", tradeIds: [7] },
              { ccyPairCode: "GBP_USD", tradeIds: [8] }
            ],
            nextEvaluationDelayMs: 0
          };
    },
    formBatch: command => {
      if (command.tradeIds[0] === 7) {
        throw new Error("Batch formation conflict.");
      }

      return { batchId: 20, replayed: false };
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
  assert.equal(process.status().formedBatchCount, 1);
  assert.equal(process.status().lastCycleBatchCount, 1);
  assert.equal(process.status().lastFormedBatchId, 20);
  assert.match(process.status().lastError, /EUR_USD: Batch formation conflict\./);
  assert.equal(scheduled.length, 3);
});

test("re-evaluates a running process when the interval changes", () => {
  let intervalMs = 1000;
  const scheduled = [];
  const cleared = [];
  const process = new FxAutoBatchingProcess({
    selectCandidates: () => [],
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
  assert.equal(scheduled[1].delayMs, 0);
  assert.equal(status.intervalMs, 3000);
});

test("a new trade interrupts a future deadline with one immediate evaluation", async () => {
  const scheduled = [];
  const cleared = [];
  let selectionCount = 0;
  const process = new FxAutoBatchingProcess({
    selectCandidates: () => {
      selectionCount += 1;
      return { candidates: [], nextEvaluationDelayMs: 60000 };
    },
    formBatch: () => null,
    getIntervalMs: () => 60000,
    createIdempotencyKey: () => "auto-batch-key",
    setTimeoutFn: (callback, delayMs) => {
      const timer = { callback, delayMs, unref() {} };
      scheduled.push(timer);
      return timer;
    },
    clearTimeoutFn: timer => cleared.push(timer),
    now: () => new Date("2026-08-04T09:00:00.000Z")
  });

  process.start();
  await scheduled[0].callback();
  assert.equal(scheduled[1].delayMs, 60000);

  const status = process.notifyTradeCreated();

  assert.equal(cleared[0], scheduled[1]);
  assert.equal(scheduled[2].delayMs, 0);
  assert.equal(status.evaluationRequested, true);
});

test("a new trade received during evaluation schedules exactly one immediate follow-up", async () => {
  const scheduled = [];
  let releaseSelection;
  let selectionCount = 0;
  const firstSelection = new Promise(resolve => {
    releaseSelection = resolve;
  });
  const process = new FxAutoBatchingProcess({
    selectCandidates: async () => {
      selectionCount += 1;

      if (selectionCount === 1) {
        await firstSelection;
      }

      return { candidates: [], nextEvaluationDelayMs: 60000 };
    },
    formBatch: () => null,
    getIntervalMs: () => 60000,
    createIdempotencyKey: () => "auto-batch-key",
    setTimeoutFn: (callback, delayMs) => {
      const timer = { callback, delayMs, unref() {} };
      scheduled.push(timer);
      return timer;
    },
    clearTimeoutFn: () => {}
  });

  process.start();
  const firstEvaluation = scheduled[0].callback();
  await Promise.resolve();

  process.notifyTradeCreated();
  process.notifyTradeCreated();
  assert.equal(process.status().batchingInProgress, true);
  assert.equal(process.status().evaluationRequested, true);

  releaseSelection();
  await firstEvaluation;

  assert.equal(scheduled.length, 2);
  assert.equal(scheduled[1].delayMs, 0);
});
