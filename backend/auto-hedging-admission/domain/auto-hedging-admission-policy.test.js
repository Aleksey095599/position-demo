"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  AUTO_HEDGING_ADMISSION_POLICY,
  AUTO_HEDGING_ADMISSION_POLICIES,
  normalizeAutoHedgingAdmissionPolicy
} = require("./auto-hedging-admission-policy");

test("defines the complete immutable Auto Hedging Admission Policy vocabulary", () => {
  assert.deepEqual(AUTO_HEDGING_ADMISSION_POLICY, {
    AUTO_IF_ELIGIBLE: "AUTO_IF_ELIGIBLE",
    REVIEW_REQUIRED: "REVIEW_REQUIRED",
    MANUAL_ONLY: "MANUAL_ONLY"
  });
  assert.deepEqual(AUTO_HEDGING_ADMISSION_POLICIES, [
    "AUTO_IF_ELIGIBLE",
    "REVIEW_REQUIRED",
    "MANUAL_ONLY"
  ]);
  assert.equal(Object.isFrozen(AUTO_HEDGING_ADMISSION_POLICY), true);
  assert.equal(Object.isFrozen(AUTO_HEDGING_ADMISSION_POLICIES), true);
});

test("normalizes every supported Auto Hedging Admission Policy", () => {
  assert.equal(normalizeAutoHedgingAdmissionPolicy(" auto_if_eligible "), "AUTO_IF_ELIGIBLE");
  assert.equal(normalizeAutoHedgingAdmissionPolicy("review_required"), "REVIEW_REQUIRED");
  assert.equal(normalizeAutoHedgingAdmissionPolicy("MANUAL_ONLY"), "MANUAL_ONLY");
});

test("rejects absent and unsupported Auto Hedging Admission Policies", () => {
  [undefined, null, "", "AUTO", "HELD", 1, {}].forEach(value => {
    assert.throws(
      () => normalizeAutoHedgingAdmissionPolicy(value),
      error => error instanceof RangeError
        && error.code === "INVALID_AUTO_HEDGING_ADMISSION_POLICY"
    );
  });
});
