"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  PRICING_RULE_AUTO_MANAGEMENT_ADMISSION_MODE_OVERRIDE,
  PRICING_RULE_AUTO_MANAGEMENT_ADMISSION_MODE_OVERRIDES,
  normalizePricingRuleAutoManagementAdmissionModeOverride,
  resolvePricingRuleAutoManagementAdmissionMode
} = require("./pricing-rule-admission-policy");

test("defines REVIEW_REQUIRED as the sole Pricing Rule admission override", () => {
  assert.deepEqual(PRICING_RULE_AUTO_MANAGEMENT_ADMISSION_MODE_OVERRIDE, {
    REVIEW_REQUIRED: "REVIEW_REQUIRED"
  });
  assert.deepEqual(PRICING_RULE_AUTO_MANAGEMENT_ADMISSION_MODE_OVERRIDES, [
    "REVIEW_REQUIRED"
  ]);
  assert.equal(Object.isFrozen(
    PRICING_RULE_AUTO_MANAGEMENT_ADMISSION_MODE_OVERRIDE
  ), true);
  assert.equal(Object.isFrozen(
    PRICING_RULE_AUTO_MANAGEMENT_ADMISSION_MODE_OVERRIDES
  ), true);
});

test("normalizes null inheritance and the explicit REVIEW_REQUIRED override", () => {
  assert.equal(
    normalizePricingRuleAutoManagementAdmissionModeOverride(null),
    null
  );
  assert.equal(
    normalizePricingRuleAutoManagementAdmissionModeOverride(undefined),
    null
  );
  assert.equal(
    normalizePricingRuleAutoManagementAdmissionModeOverride(" review_required "),
    "REVIEW_REQUIRED"
  );
});

test("rejects unsupported Pricing Rule admission overrides", () => {
  ["", "AUTO_IF_ELIGIBLE", "MANUAL_ONLY", "MANUAL", 1, {}].forEach(value => {
    assert.throws(
      () => normalizePricingRuleAutoManagementAdmissionModeOverride(value),
      error => error instanceof RangeError
        && error.code ===
          "INVALID_PRICING_RULE_AUTO_MANAGEMENT_ADMISSION_MODE_OVERRIDE"
    );
  });
});

test("inherits the Trade Context Admission Policy when no override exists", () => {
  ["AUTO_IF_ELIGIBLE", "REVIEW_REQUIRED"].forEach(mode => {
    assert.equal(resolvePricingRuleAutoManagementAdmissionMode({
      autoManagementAdmissionModeOverride: null,
      tradeContextAdmissionMode: mode
    }), mode);
  });
});

test("REVIEW_REQUIRED overrides the Trade Context Admission Policy", () => {
  assert.equal(resolvePricingRuleAutoManagementAdmissionMode({
    autoManagementAdmissionModeOverride: "REVIEW_REQUIRED",
    tradeContextAdmissionMode: "AUTO_IF_ELIGIBLE"
  }), "REVIEW_REQUIRED");
  assert.equal(resolvePricingRuleAutoManagementAdmissionMode({
    autoManagementAdmissionModeOverride: "REVIEW_REQUIRED",
    tradeContextAdmissionMode: "REVIEW_REQUIRED"
  }), "REVIEW_REQUIRED");
});

test("returns no effective mode when neither policy source is available", () => {
  assert.equal(resolvePricingRuleAutoManagementAdmissionMode({
    autoManagementAdmissionModeOverride: null,
    tradeContextAdmissionMode: null
  }), null);
});
