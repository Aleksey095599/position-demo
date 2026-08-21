"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  FX_BATCH_MEMBER_ROLE,
  hasBlockingBatchMembership,
  isTradeBatched
} = require("./fx-trade-batching-policy");

test("FORMED source and Balance Trade memberships hide their trades", () => {
  for (const memberRole of [
    FX_BATCH_MEMBER_ROLE.SOURCE_TRADE,
    FX_BATCH_MEMBER_ROLE.BALANCE_TRADE
  ]) {
    assert.equal(isTradeBatched([{ batchStatus: "FORMED", memberRole }]), true);
  }
});

test("a ROLLED_BACK membership does not hide a trade", () => {
  assert.equal(isTradeBatched([{
    batchStatus: "ROLLED_BACK",
    memberRole: FX_BATCH_MEMBER_ROLE.SOURCE_TRADE
  }]), false);
});

test("a Trade without membership is not batched", () => {
  assert.equal(isTradeBatched([]), false);
});

test("a FORMED Position Out membership remains available as an output", () => {
  assert.equal(isTradeBatched([{
    batchStatus: "FORMED",
    memberRole: FX_BATCH_MEMBER_ROLE.POSITION_OUT
  }]), false);
});

test("BUILDING and FORMED source or Balance Trade memberships block another batch", () => {
  for (const batchStatus of ["BUILDING", "FORMED"]) {
    for (const memberRole of [
      FX_BATCH_MEMBER_ROLE.SOURCE_TRADE,
      FX_BATCH_MEMBER_ROLE.BALANCE_TRADE
    ]) {
      assert.equal(hasBlockingBatchMembership([{ batchStatus, memberRole }]), true);
    }
  }
});

test("a Position Out origin does not block its use as a source Trade", () => {
  assert.equal(hasBlockingBatchMembership([{
    batchStatus: "FORMED",
    memberRole: FX_BATCH_MEMBER_ROLE.POSITION_OUT
  }]), false);
});

test("a ROLLED_BACK membership allows the trade to enter another batch", () => {
  assert.equal(hasBlockingBatchMembership([{
    batchStatus: "ROLLED_BACK",
    memberRole: FX_BATCH_MEMBER_ROLE.SOURCE_TRADE
  }]), false);
});
