"use strict";

const BATCH_STATUS = Object.freeze({
  BUILDING: "BUILDING",
  FORMED: "FORMED",
  ROLLED_BACK: "ROLLED_BACK"
});

const BATCH_MEMBER_ROLE = Object.freeze({
  SOURCE_TRADE: "TRADE",
  BALANCE_TRADE: "BALANCE_TRADE",
  POSITION_OUT: "POSITION_OUT"
});

const BATCH_MEMBERSHIP_BLOCKING_STATUSES = Object.freeze([
  BATCH_STATUS.BUILDING,
  BATCH_STATUS.FORMED
]);
const blockingStatusSet = new Set(BATCH_MEMBERSHIP_BLOCKING_STATUSES);

function batchStatusOf(membership) {
  return String(
    membership && typeof membership === "object"
      ? membership.batchStatus
      : membership
  ).trim().toUpperCase();
}

function memberRoleOf(membership) {
  return String(
    membership && typeof membership === "object"
      ? membership.memberRole
      : ""
  ).trim().toUpperCase();
}

function isBlockingMembership(membership) {
  return memberRoleOf(membership) !== BATCH_MEMBER_ROLE.POSITION_OUT;
}

function isTradeBatched(memberships) {
  return Array.isArray(memberships)
    && memberships.some(
      membership => batchStatusOf(membership) === BATCH_STATUS.FORMED
        && isBlockingMembership(membership)
    );
}

function hasBlockingBatchMembership(memberships) {
  return Array.isArray(memberships)
    && memberships.some(membership =>
      blockingStatusSet.has(batchStatusOf(membership))
      && isBlockingMembership(membership)
    );
}

module.exports = {
  BATCH_MEMBER_ROLE,
  BATCH_MEMBERSHIP_BLOCKING_STATUSES,
  BATCH_STATUS,
  hasBlockingBatchMembership,
  isTradeBatched
};
