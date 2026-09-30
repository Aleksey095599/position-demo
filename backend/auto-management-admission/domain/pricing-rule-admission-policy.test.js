"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  PRICING_RULE_POSITION_MANAGEMENT_MODE_SETTING_OVERRIDE,
  PRICING_RULE_POSITION_MANAGEMENT_MODE_SETTING_OVERRIDES,
  normalizePricingRulePositionManagementModeSettingOverride,
  resolvePricingRulePositionManagementModeSetting
} = require("./pricing-rule-admission-policy");

test("defines MANUAL as the sole Pricing Rule admission override", () => {
  assert.deepEqual(PRICING_RULE_POSITION_MANAGEMENT_MODE_SETTING_OVERRIDE, {
    MANUAL: "MANUAL"
  });
  assert.deepEqual(PRICING_RULE_POSITION_MANAGEMENT_MODE_SETTING_OVERRIDES, [
    "MANUAL"
  ]);
  assert.equal(Object.isFrozen(
    PRICING_RULE_POSITION_MANAGEMENT_MODE_SETTING_OVERRIDE
  ), true);
  assert.equal(Object.isFrozen(
    PRICING_RULE_POSITION_MANAGEMENT_MODE_SETTING_OVERRIDES
  ), true);
});

test("normalizes null inheritance and the explicit MANUAL override", () => {
  assert.equal(
    normalizePricingRulePositionManagementModeSettingOverride(null),
    null
  );
  assert.equal(
    normalizePricingRulePositionManagementModeSettingOverride(undefined),
    null
  );
  assert.equal(
    normalizePricingRulePositionManagementModeSettingOverride(" manual "),
    "MANUAL"
  );
});

test("rejects unsupported Pricing Rule admission overrides", () => {
  ["", "AUTO_IF_ELIGIBLE", "MANUAL_ONLY", "REVIEW_REQUIRED", 1, {}].forEach(value => {
    assert.throws(
      () => normalizePricingRulePositionManagementModeSettingOverride(value),
      error => error instanceof RangeError
        && error.code ===
          "INVALID_PRICING_RULE_POSITION_MANAGEMENT_MODE_SETTING_OVERRIDE"
    );
  });
});

test("inherits the Trade Context Admission Policy when no override exists", () => {
  ["AUTO_IF_ELIGIBLE", "MANUAL"].forEach(mode => {
    assert.equal(resolvePricingRulePositionManagementModeSetting({
      positionManagementModeOverride: null,
      tradeContextPositionManagementMode: mode
    }), mode);
  });
});

test("MANUAL overrides the Trade Context Admission Policy", () => {
  assert.equal(resolvePricingRulePositionManagementModeSetting({
    positionManagementModeOverride: "MANUAL",
    tradeContextPositionManagementMode: "AUTO_IF_ELIGIBLE"
  }), "MANUAL");
  assert.equal(resolvePricingRulePositionManagementModeSetting({
    positionManagementModeOverride: "MANUAL",
    tradeContextPositionManagementMode: "MANUAL"
  }), "MANUAL");
});

test("returns no effective mode when neither policy source is available", () => {
  assert.equal(resolvePricingRulePositionManagementModeSetting({
    positionManagementModeOverride: null,
    tradeContextPositionManagementMode: null
  }), null);
});
