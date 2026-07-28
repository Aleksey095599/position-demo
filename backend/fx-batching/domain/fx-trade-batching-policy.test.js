"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  FX_BATCH_MEMBER_ROLE,
  hasBlockingBatchMembership,
  isTradeBatched
} = require("./fx-trade-batching-policy");

test("a FORMED membership hides a trade regardless of its role", () => {
  for (const memberRole of Object.values(FX_BATCH_MEMBER_ROLE)) {
    assert.equal(isTradeBatched([{ batchStatus: "FORMED", memberRole }]), true);
  }
});

test("a ROLLED_BACK membership does not hide a trade", () => {
  assert.equal(isTradeBatched([{
    batchStatus: "ROLLED_BACK",
    memberRole: FX_BATCH_MEMBER_ROLE.BALANCE_TRADE
  }]), false);
});

test("an output without membership is not batched", () => {
  assert.equal(isTradeBatched([]), false);
});

test("BUILDING and FORMED memberships block another batch regardless of role", () => {
  for (const batchStatus of ["BUILDING", "FORMED"]) {
    for (const memberRole of Object.values(FX_BATCH_MEMBER_ROLE)) {
      assert.equal(
        hasBlockingBatchMembership([{ batchStatus, memberRole }]),
        true
      );
    }
  }
});

test("a ROLLED_BACK membership allows the trade to enter another batch", () => {
  assert.equal(hasBlockingBatchMembership([{
    batchStatus: "ROLLED_BACK",
    memberRole: FX_BATCH_MEMBER_ROLE.BALANCE_TRADE
  }]), false);
});
