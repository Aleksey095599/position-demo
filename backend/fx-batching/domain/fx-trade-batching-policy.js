"use strict";

const FX_BATCH_STATUS = Object.freeze({
  BUILDING: "BUILDING",
  FORMED: "FORMED",
  ROLLED_BACK: "ROLLED_BACK"
});

const FX_BATCH_MEMBER_ROLE = Object.freeze({
  SOURCE_TRADE: "TRADE",
  BALANCE_TRADE: "BALANCE_TRADE",
  BALANCE_QUOTE_CASH: "BALANCE_QUOTE_CASH"
});

const FX_BATCH_SPECIAL_MEMBER_TYPE = Object.freeze({
  QUOTE_CASH_OUT: "BATCH_QUOTE_CASH_OUT"
});

const FX_BATCH_MEMBERSHIP_BLOCKING_STATUSES = Object.freeze([
  FX_BATCH_STATUS.BUILDING,
  FX_BATCH_STATUS.FORMED
]);
const blockingStatusSet = new Set(FX_BATCH_MEMBERSHIP_BLOCKING_STATUSES);

function batchStatusOf(membership) {
  return String(
    membership && typeof membership === "object"
      ? membership.batchStatus
      : membership
  ).trim().toUpperCase();
}

function isTradeBatched(memberships) {
  return Array.isArray(memberships)
    && memberships.some(
      membership => batchStatusOf(membership) === FX_BATCH_STATUS.FORMED
    );
}

function hasBlockingBatchMembership(memberships) {
  return Array.isArray(memberships)
    && memberships.some(membership =>
      blockingStatusSet.has(batchStatusOf(membership))
    );
}

module.exports = {
  FX_BATCH_MEMBER_ROLE,
  FX_BATCH_MEMBERSHIP_BLOCKING_STATUSES,
  FX_BATCH_SPECIAL_MEMBER_TYPE,
  FX_BATCH_STATUS,
  hasBlockingBatchMembership,
  isTradeBatched
};
