"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  fxBatchFormationTiming
} = require("./fx-batch-formation-timing");

test("a manual formation has no Batching Window", () => {
  assert.deepEqual(fxBatchFormationTiming({
    reasonCode: "MANUAL_SELECTION"
  }), {
    windowOpenedAt: null,
    windowClosedAt: null
  });
});

test("an automatic formation preserves the explicit Batching Window", () => {
  assert.deepEqual(fxBatchFormationTiming({
    reasonCode: "MAX_INTERVAL_REACHED",
    windowOpenedAt: "2026-08-05T09:00:00.000Z",
    windowClosedAt: "2026-08-05T09:01:00.000Z"
  }), {
    windowOpenedAt: "2026-08-05T09:00:00.000Z",
    windowClosedAt: "2026-08-05T09:01:00.000Z"
  });
});

test("an automatic formation requires an ordered Batching Window timeline", () => {
  assert.throws(
    () => fxBatchFormationTiming({
      reasonCode: "TRANSFER_RATE_CORRIDOR_BREACHED",
      windowOpenedAt: "2026-08-05T09:00:03.000Z",
      windowClosedAt: "2026-08-05T09:00:02.000Z"
    }),
    error => error.code === "INVALID_BATCH_FORMATION_TIMING"
  );
});

test("a manual formation rejects invented Batching Window timestamps", () => {
  assert.throws(
    () => fxBatchFormationTiming({
      reasonCode: "MANUAL_SELECTION",
      windowOpenedAt: "2026-08-05T09:00:00.000Z"
    }),
    error => error.code === "INVALID_BATCH_FORMATION_TIMING"
  );
});
