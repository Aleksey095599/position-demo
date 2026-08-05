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
          windowOpenedAt: "2026-08-04T08:59:00.000Z",
          windowClosedAt: "2026-08-04T09:00:00.000Z",
          formationReasonCode: "MAX_INTERVAL_REACHED",
          formationReasonDetails: { maxIntervalSeconds: 60 }
        },
        {
          ccyPairCode: "GBP_USD",
          tradeIds: [7, 9],
          windowOpenedAt: "2026-08-04T08:59:30.000Z",
          windowClosedAt: "2026-08-04T09:00:00.000Z",
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
      windowOpenedAt: "2026-08-04T08:59:00.000Z",
      windowClosedAt: "2026-08-04T09:00:00.000Z",
      formationReasonCode: "MAX_INTERVAL_REACHED",
      formationReasonDetails: { maxIntervalSeconds: 60 }
    },
    {
      idempotencyKey: "auto-batch-key-2",
      tradeIds: [7, 9],
      windowOpenedAt: "2026-08-04T08:59:30.000Z",
      windowClosedAt: "2026-08-04T09:00:00.000Z",
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

test("starts after the latest existing Trade and waits for the first new Trade", async () => {
  const scheduled = [];
  const selections = [];
  const process = new FxAutoBatchingProcess({
    selectCandidates: criteria => {
      selections.push(criteria);
      return {
        candidates: [],
        closedWithoutBatchTradeIds: [],
        openWindowCount: 0,
        nextEvaluationDelayMs: null
      };
    },
    formBatch: () => null,
    getIntervalMs: () => 60000,
    getLatestTradeId: () => 42,
    createIdempotencyKey: () => "auto-batch-key",
    setTimeoutFn: (callback, delayMs) => {
      const timer = { callback, delayMs, unref() {} };
      scheduled.push(timer);
      return timer;
    },
    clearTimeoutFn: () => {},
    now: () => new Date("2026-08-05T09:00:00.000Z")
  });

  const started = process.start();

  assert.equal(started.phase, "WAITING_FOR_FIRST_TRADE");
  assert.equal(started.startedAt, "2026-08-05T09:00:00.000Z");
  await scheduled[0].callback();
  assert.deepEqual(selections[0], {
    afterTradeId: 42,
    excludedTradeIds: []
  });
  assert.equal(process.status().phase, "WAITING_FOR_FIRST_TRADE");
  assert.equal(process.status().nextCycleAt, null);
});

test("Stop cancels open windows and restart establishes a new Trade boundary", async () => {
  const scheduled = [];
  const cleared = [];
  const selections = [];
  let latestTradeId = 10;
  const process = new FxAutoBatchingProcess({
    selectCandidates: criteria => {
      selections.push(criteria);
      return {
        candidates: [],
        closedWithoutBatchTradeIds: [],
        openWindowCount: 1,
        nextEvaluationDelayMs: 60000
      };
    },
    formBatch: () => null,
    getIntervalMs: () => 60000,
    getLatestTradeId: () => latestTradeId,
    createIdempotencyKey: () => "auto-batch-key",
    setTimeoutFn: (callback, delayMs) => {
      const timer = { callback, delayMs, unref() {} };
      scheduled.push(timer);
      return timer;
    },
    clearTimeoutFn: timer => cleared.push(timer),
    now: () => new Date("2026-08-05T09:00:00.000Z")
  });

  process.start();
  await scheduled[0].callback();
  assert.equal(process.status().phase, "WINDOW_OPEN");

  const stopped = process.stop();

  assert.equal(stopped.phase, "STOPPED");
  assert.equal(stopped.lastCancelledWindowCount, 1);
  assert.equal(stopped.startedAt, null);
  assert.equal(cleared[0], scheduled[1]);

  latestTradeId = 12;
  process.start();
  await scheduled[2].callback();
  assert.deepEqual(selections[1], {
    afterTradeId: 12,
    excludedTradeIds: []
  });
});

test("a closed window without a batch is excluded from later evaluations", async () => {
  const scheduled = [];
  const selections = [];
  let selectionCount = 0;
  const process = new FxAutoBatchingProcess({
    selectCandidates: criteria => {
      selections.push(criteria);
      selectionCount += 1;
      return selectionCount === 1
        ? {
            candidates: [],
            closedWithoutBatchTradeIds: [11],
            openWindowCount: 0,
            nextEvaluationDelayMs: 0
          }
        : {
            candidates: [],
            closedWithoutBatchTradeIds: [],
            openWindowCount: 0,
            nextEvaluationDelayMs: null
          };
    },
    formBatch: () => null,
    getIntervalMs: () => 60000,
    getLatestTradeId: () => 10,
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
  await scheduled[1].callback();

  assert.deepEqual(selections[0].excludedTradeIds, []);
  assert.deepEqual(selections[1].excludedTradeIds, [11]);
  assert.equal(process.status().phase, "WAITING_FOR_FIRST_TRADE");
});

test("Stop during evaluation prevents an uncommenced batch formation", async () => {
  const scheduled = [];
  let releaseSelection;
  let formationCount = 0;
  const selection = new Promise(resolve => {
    releaseSelection = resolve;
  });
  const process = new FxAutoBatchingProcess({
    selectCandidates: async () => {
      await selection;
      return {
        candidates: [{ ccyPairCode: "EUR_USD", tradeIds: [11, 12] }],
        nextEvaluationDelayMs: 0
      };
    },
    formBatch: () => {
      formationCount += 1;
      return { batchId: 1, replayed: false };
    },
    getIntervalMs: () => 60000,
    getLatestTradeId: () => 10,
    createIdempotencyKey: () => "auto-batch-key",
    setTimeoutFn: (callback, delayMs) => {
      const timer = { callback, delayMs, unref() {} };
      scheduled.push(timer);
      return timer;
    },
    clearTimeoutFn: () => {}
  });

  process.start();
  const evaluation = scheduled[0].callback();
  await Promise.resolve();
  process.stop();
  releaseSelection();
  await evaluation;

  assert.equal(formationCount, 0);
  assert.equal(process.status().phase, "STOPPED");
});

test("reports FORMING_BATCH only while batch formation is running", async () => {
  const scheduled = [];
  let completeFormation;
  const formation = new Promise(resolve => {
    completeFormation = resolve;
  });
  const process = new FxAutoBatchingProcess({
    selectCandidates: () => ({
      candidates: [{ ccyPairCode: "EUR_USD", tradeIds: [11, 12] }],
      closedWithoutBatchTradeIds: [],
      openWindowCount: 0,
      nextEvaluationDelayMs: null
    }),
    formBatch: async () => {
      await formation;
      return { batchId: 1, replayed: false };
    },
    getIntervalMs: () => 60000,
    getLatestTradeId: () => 10,
    createIdempotencyKey: () => "auto-batch-key",
    setTimeoutFn: (callback, delayMs) => {
      const timer = { callback, delayMs, unref() {} };
      scheduled.push(timer);
      return timer;
    },
    clearTimeoutFn: () => {}
  });

  process.start();
  const evaluation = scheduled[0].callback();
  await Promise.resolve();

  assert.equal(process.status().phase, "FORMING_BATCH");
  assert.equal(process.status().formationInProgress, true);

  completeFormation();
  await evaluation;

  assert.equal(process.status().phase, "WAITING_FOR_FIRST_TRADE");
  assert.equal(process.status().formationInProgress, false);
});

test("keeps rolled-back Trades under manual control for the current run", async () => {
  const scheduled = [];
  const selections = [];
  const process = new FxAutoBatchingProcess({
    selectCandidates: criteria => {
      selections.push(criteria);
      return {
        candidates: [],
        closedWithoutBatchTradeIds: [],
        openWindowCount: 0,
        nextEvaluationDelayMs: null
      };
    },
    formBatch: () => null,
    getIntervalMs: () => 60000,
    getLatestTradeId: () => 10,
    createIdempotencyKey: () => "auto-batch-key",
    setTimeoutFn: (callback, delayMs) => {
      const timer = { callback, delayMs, unref() {} };
      scheduled.push(timer);
      return timer;
    },
    clearTimeoutFn: () => {}
  });

  process.start();
  process.keepTradesUnderManualControl([11, 12]);
  await scheduled[0].callback();

  assert.deepEqual(selections[0], {
    afterTradeId: 10,
    excludedTradeIds: [11, 12]
  });
});

test("a completed stale formation does not update a restarted process", async () => {
  const scheduled = [];
  let completeFormation;
  let latestTradeId = 10;
  let selectionCount = 0;
  const formation = new Promise(resolve => {
    completeFormation = resolve;
  });
  const process = new FxAutoBatchingProcess({
    selectCandidates: () => {
      selectionCount += 1;
      return selectionCount === 1
        ? {
            candidates: [{ ccyPairCode: "EUR_USD", tradeIds: [11, 12] }],
            nextEvaluationDelayMs: null
          }
        : {
            candidates: [],
            nextEvaluationDelayMs: null
          };
    },
    formBatch: async () => {
      await formation;
      return { batchId: 77, replayed: false };
    },
    getIntervalMs: () => 60000,
    getLatestTradeId: () => latestTradeId,
    createIdempotencyKey: () => "auto-batch-key",
    setTimeoutFn: (callback, delayMs) => {
      const timer = { callback, delayMs, unref() {} };
      scheduled.push(timer);
      return timer;
    },
    clearTimeoutFn: () => {}
  });

  process.start();
  const oldEvaluation = scheduled[0].callback();
  await Promise.resolve();
  process.stop();
  latestTradeId = 12;
  process.start();
  completeFormation();
  await oldEvaluation;

  assert.equal(process.status().formedBatchCount, 0);
  assert.equal(process.status().lastFormedBatchId, null);
  assert.equal(scheduled[1].delayMs, 0);
  await scheduled[1].callback();
  assert.equal(process.status().phase, "WAITING_FOR_FIRST_TRADE");
});
