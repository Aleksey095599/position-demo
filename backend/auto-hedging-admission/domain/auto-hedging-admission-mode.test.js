"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  AUTO_HEDGING_ADMISSION_MODE,
  AUTO_HEDGING_ADMISSION_MODES,
  normalizeAutoHedgingAdmissionMode
} = require("./auto-hedging-admission-mode");

test("defines the complete immutable Auto Hedging Admission Mode vocabulary", () => {
  assert.deepEqual(AUTO_HEDGING_ADMISSION_MODE, {
    AUTO_IF_ELIGIBLE: "AUTO_IF_ELIGIBLE",
    REVIEW_REQUIRED: "REVIEW_REQUIRED",
    MANUAL_ONLY: "MANUAL_ONLY"
  });
  assert.deepEqual(AUTO_HEDGING_ADMISSION_MODES, [
    "AUTO_IF_ELIGIBLE",
    "REVIEW_REQUIRED",
    "MANUAL_ONLY"
  ]);
  assert.equal(Object.isFrozen(AUTO_HEDGING_ADMISSION_MODE), true);
  assert.equal(Object.isFrozen(AUTO_HEDGING_ADMISSION_MODES), true);
});

test("normalizes every supported Auto Hedging Admission Mode", () => {
  assert.equal(normalizeAutoHedgingAdmissionMode(" auto_if_eligible "), "AUTO_IF_ELIGIBLE");
  assert.equal(normalizeAutoHedgingAdmissionMode("review_required"), "REVIEW_REQUIRED");
  assert.equal(normalizeAutoHedgingAdmissionMode("MANUAL_ONLY"), "MANUAL_ONLY");
});

test("rejects absent and unsupported Auto Hedging Admission Modes", () => {
  [undefined, null, "", "AUTO", "HELD", 1, {}].forEach(value => {
    assert.throws(
      () => normalizeAutoHedgingAdmissionMode(value),
      error => error instanceof RangeError
        && error.code === "INVALID_AUTO_HEDGING_ADMISSION_MODE"
    );
  });
});
