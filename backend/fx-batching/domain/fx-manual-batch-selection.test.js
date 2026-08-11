"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  FX_MANUAL_BATCH_SELECTION_MODE,
  planManualBatchSelection
} = require("./fx-manual-batch-selection");

function trade(tradeId, tenor, overrides = {}) {
  return {
    tradeId,
    tenor,
    marker: `trade-${tradeId}`,
    ...overrides
  };
}

test("plans one manual batch when every selected Trade has the same Tenor", () => {
  const trades = [trade(2, "TOD"), trade(1, "tod")];
  const plan = planManualBatchSelection({
    trades,
    mode: FX_MANUAL_BATCH_SELECTION_MODE.SINGLE_BATCH,
    allowCrossTenorBatching: false
  });

  assert.equal(Object.isFrozen(plan), true);
  assert.equal(Object.isFrozen(plan[0]), true);
  assert.equal(Object.isFrozen(plan[0].trades), true);
  assert.equal(plan[0].tenor, "TOD");
  assert.deepEqual(plan[0].trades.map(item => item.tradeId), [1, 2]);
  assert.equal(plan[0].trades[0], trades[1]);
  assert.equal(plan[0].trades[1], trades[0]);
});

test("requires an explicit resolution for mixed Tenors when Cross-Tenor Batching is disabled", () => {
  assert.throws(
    () => planManualBatchSelection({
      trades: [
        trade(4, "SPOT"),
        trade(1, "TOD"),
        trade(3, "TOM"),
        trade(2, "TOD")
      ],
      mode: FX_MANUAL_BATCH_SELECTION_MODE.SINGLE_BATCH,
      allowCrossTenorBatching: false
    }),
    error => {
      assert.equal(error.code, "CROSS_TENOR_BATCHING_RESOLUTION_REQUIRED");
      assert.deepEqual(error.tenors, ["TOD", "TOM", "SPOT"]);
      assert.deepEqual(error.counts, { TOD: 2, TOM: 1, SPOT: 1 });
      assert.match(error.message, /Choose Independent Batching by Tenor/);
      return true;
    }
  );
});

test("separates mixed Tenors deterministically without losing selected Trades", () => {
  const trades = [
    trade(8, "SPOT"),
    trade(4, "TOM"),
    trade(7, "TOD"),
    trade(2, "spot"),
    trade(1, "TOD")
  ];
  const plan = planManualBatchSelection({
    trades,
    mode: FX_MANUAL_BATCH_SELECTION_MODE.SEPARATE_BY_TENOR,
    allowCrossTenorBatching: false
  });

  assert.deepEqual(plan.map(group => group.tenor), ["TOD", "TOM", "SPOT"]);
  assert.deepEqual(plan.map(group => group.trades.map(item => item.tradeId)), [
    [1, 7],
    [4],
    [2, 8]
  ]);
  assert.deepEqual(
    plan.flatMap(group => group.trades).map(item => item.tradeId).sort((a, b) => a - b),
    [1, 2, 4, 7, 8]
  );
  assert.deepEqual(
    new Set(plan.flatMap(group => group.trades)),
    new Set(trades)
  );
});

test("allows a future Cross-Tenor single-batch plan when the capability is enabled", () => {
  const plan = planManualBatchSelection({
    trades: [trade(2, "TOM"), trade(1, "TOD")],
    mode: FX_MANUAL_BATCH_SELECTION_MODE.SINGLE_BATCH,
    allowCrossTenorBatching: true
  });

  assert.equal(plan.length, 1);
  assert.equal(plan[0].tenor, null);
  assert.deepEqual(plan[0].trades.map(item => item.tradeId), [1, 2]);
});

test("rejects invalid manual selections", () => {
  assert.throws(
    () => planManualBatchSelection({ trades: [] }),
    error => error?.code === "INVALID_FX_MANUAL_BATCH_SELECTION"
  );
  assert.throws(
    () => planManualBatchSelection({ trades: [trade(1, "TOD"), trade(1, "TOM")] }),
    error => error?.code === "INVALID_FX_MANUAL_BATCH_SELECTION"
  );
  assert.throws(
    () => planManualBatchSelection({ trades: [trade(1, "")] }),
    error => error?.code === "INVALID_FX_MANUAL_BATCH_SELECTION"
  );
  assert.throws(
    () => planManualBatchSelection({
      trades: [trade(1, "TOD")],
      mode: "UNKNOWN"
    }),
    error => error?.code === "INVALID_FX_MANUAL_BATCH_SELECTION"
  );
});
