"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  POSITION_MANAGEMENT_MODE,
  POSITION_MANAGEMENT_MODES,
  normalizePositionManagementMode
} = require("./position-management-policy");

test("defines the complete immutable Position Management Mode vocabulary", () => {
  assert.deepEqual(POSITION_MANAGEMENT_MODE, {
    MANUAL: "MANUAL",
    AUTO: "AUTO"
  });
  assert.deepEqual(POSITION_MANAGEMENT_MODES, ["MANUAL", "AUTO"]);
  assert.equal(Object.isFrozen(POSITION_MANAGEMENT_MODE), true);
  assert.equal(Object.isFrozen(POSITION_MANAGEMENT_MODES), true);
});

test("normalizes supported Position Management Modes", () => {
  assert.equal(
    normalizePositionManagementMode(" manual "),
    POSITION_MANAGEMENT_MODE.MANUAL
  );
  assert.equal(
    normalizePositionManagementMode("Auto"),
    POSITION_MANAGEMENT_MODE.AUTO
  );
});

test("strictly rejects absent, blank, non-string and unsupported modes", () => {
  [undefined, null, "", "   ", 1, true, {}, "AUTO_PRICED"].forEach(value => {
    assert.throws(
      () => normalizePositionManagementMode(value),
      error => error instanceof RangeError
        && error.code === "INVALID_POSITION_MANAGEMENT_MODE"
    );
  });
});
