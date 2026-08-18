"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  FX_POSITION_MANAGEMENT_TRADE_TYPE,
  FX_POSITION_MANAGEMENT_TRADE_TYPES,
  FX_POSITION_MODE_TRANSITION_REASON,
  normalizeFxTradePositionManagementIdentity,
  planFxTradePositionManagementTransitionToAuto
} = require("./fx-trade-position-management-transition");

function state(overrides = {}) {
  return {
    tradeId: 41,
    tradeType: "CLIENT_DEAL",
    initialPositionManagementMode: "MANUAL",
    currentPositionManagementMode: "MANUAL",
    batchBlocked: false,
    transitionedAt: null,
    ...overrides
  };
}

test("defines the immutable FX Trade types eligible for a manual review transition", () => {
  assert.deepEqual(FX_POSITION_MANAGEMENT_TRADE_TYPE, {
    CLIENT_DEAL: "CLIENT_DEAL",
    HEDGE_DEAL: "HEDGE_DEAL"
  });
  assert.deepEqual(FX_POSITION_MANAGEMENT_TRADE_TYPES, [
    "CLIENT_DEAL",
    "HEDGE_DEAL"
  ]);
  assert.equal(Object.isFrozen(FX_POSITION_MANAGEMENT_TRADE_TYPE), true);
  assert.equal(Object.isFrozen(FX_POSITION_MANAGEMENT_TRADE_TYPES), true);
});

test("normalizes the complete composite FX Trade identity", () => {
  assert.deepEqual(normalizeFxTradePositionManagementIdentity({
    tradeId: "42",
    tradeType: " hedge_deal "
  }), {
    tradeId: 42,
    tradeType: "HEDGE_DEAL"
  });
});

test("rejects malformed identities and non-deal Trade Types", () => {
  for (const identity of [
    null,
    { tradeId: 0, tradeType: "CLIENT_DEAL" },
    { tradeId: 1.5, tradeType: "CLIENT_DEAL" },
    { tradeId: 1, tradeType: "BATCH_POSITION_OUT" },
    { tradeId: 1, tradeType: null }
  ]) {
    assert.throws(
      () => normalizeFxTradePositionManagementIdentity(identity),
      error => error?.code === "INVALID_FX_TRADE_IDENTITY"
    );
  }
});

test("plans the target-specific MANUAL to AUTO transition without changing its origin", () => {
  const transition = planFxTradePositionManagementTransitionToAuto(state());

  assert.deepEqual(transition, {
    identity: { tradeId: 41, tradeType: "CLIENT_DEAL" },
    initialPositionManagementMode: "MANUAL",
    previousPositionManagementMode: "MANUAL",
    currentPositionManagementMode: "AUTO",
    transitionReason:
      FX_POSITION_MODE_TRANSITION_REASON.MANUAL_REVIEW_COMPLETED,
    replayed: false,
    requiresSave: true,
    previousTransitionedAt: null
  });
  assert.equal(Object.isFrozen(transition), true);
});

test("treats initial MANUAL and current AUTO as a safe replay", () => {
  const transition = planFxTradePositionManagementTransitionToAuto(state({
    currentPositionManagementMode: "AUTO",
    batchBlocked: true,
    transitionedAt: "2026-08-18T08:05:00.000Z"
  }));

  assert.equal(transition.replayed, true);
  assert.equal(transition.requiresSave, false);
  assert.equal(
    transition.previousTransitionedAt,
    "2026-08-18T08:05:00.000Z"
  );
});

test("rejects an initial AUTO route even when current mode is AUTO", () => {
  assert.throws(
    () => planFxTradePositionManagementTransitionToAuto(state({
      initialPositionManagementMode: "AUTO",
      currentPositionManagementMode: "AUTO"
    })),
    error => error?.code === "FX_POSITION_MODE_TRANSITION_REJECTED"
  );
});

test("blocks a new transition when the Trade has entered batching or hedging", () => {
  assert.throws(
    () => planFxTradePositionManagementTransitionToAuto(state({
      batchBlocked: true
    })),
    error => error?.code === "FX_POSITION_MODE_TRANSITION_BLOCKED"
  );
});
