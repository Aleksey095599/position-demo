"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  AUTO_MANAGEMENT_ADMISSION_MODE,
  AUTO_MANAGEMENT_ADMISSION_MODES,
  normalizeAutoManagementAdmissionMode
} = require("./auto-management-admission-mode");

test("defines the complete immutable Auto Management Admission Mode vocabulary", () => {
  assert.deepEqual(AUTO_MANAGEMENT_ADMISSION_MODE, {
    AUTO_IF_ELIGIBLE: "AUTO_IF_ELIGIBLE",
    REVIEW_REQUIRED: "REVIEW_REQUIRED"
  });
  assert.deepEqual(AUTO_MANAGEMENT_ADMISSION_MODES, [
    "AUTO_IF_ELIGIBLE",
    "REVIEW_REQUIRED"
  ]);
  assert.equal(Object.isFrozen(AUTO_MANAGEMENT_ADMISSION_MODE), true);
  assert.equal(Object.isFrozen(AUTO_MANAGEMENT_ADMISSION_MODES), true);
});

test("normalizes every supported Auto Management Admission Mode", () => {
  assert.equal(normalizeAutoManagementAdmissionMode(" auto_if_eligible "), "AUTO_IF_ELIGIBLE");
  assert.equal(normalizeAutoManagementAdmissionMode("review_required"), "REVIEW_REQUIRED");
});

test("rejects absent and unsupported Auto Management Admission Modes", () => {
  [undefined, null, "", "MANUAL_ONLY", "AUTO", "HELD", 1, {}].forEach(value => {
    assert.throws(
      () => normalizeAutoManagementAdmissionMode(value),
      error => error instanceof RangeError
        && error.code === "INVALID_AUTO_MANAGEMENT_ADMISSION_MODE"
    );
  });
});
