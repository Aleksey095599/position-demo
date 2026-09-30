"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  POSITION_MANAGEMENT_MODE_SETTING,
  POSITION_MANAGEMENT_MODE_SETTINGS,
  normalizePositionManagementModeSetting
} = require("./position-management-mode-setting");

test("defines the complete immutable Position Management Mode vocabulary", () => {
  assert.deepEqual(POSITION_MANAGEMENT_MODE_SETTING, {
    AUTO_IF_ELIGIBLE: "AUTO_IF_ELIGIBLE",
    MANUAL: "MANUAL"
  });
  assert.deepEqual(POSITION_MANAGEMENT_MODE_SETTINGS, [
    "AUTO_IF_ELIGIBLE",
    "MANUAL"
  ]);
  assert.equal(Object.isFrozen(POSITION_MANAGEMENT_MODE_SETTING), true);
  assert.equal(Object.isFrozen(POSITION_MANAGEMENT_MODE_SETTINGS), true);
});

test("normalizes every supported Position Management Mode", () => {
  assert.equal(normalizePositionManagementModeSetting(" auto_if_eligible "), "AUTO_IF_ELIGIBLE");
  assert.equal(normalizePositionManagementModeSetting("manual"), "MANUAL");
});

test("rejects absent and unsupported Position Management Modes", () => {
  [undefined, null, "", "MANUAL_ONLY", "AUTO", "HELD", 1, {}].forEach(value => {
    assert.throws(
      () => normalizePositionManagementModeSetting(value),
      error => error instanceof RangeError
        && error.code === "INVALID_POSITION_MANAGEMENT_MODE_SETTING"
    );
  });
});
