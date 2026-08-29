"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  PRICING_RULE_AUTO_HEDGING_ADMISSION_MODE_OVERRIDE,
  PRICING_RULE_AUTO_HEDGING_ADMISSION_MODE_OVERRIDES,
  normalizePricingRuleAutoHedgingAdmissionModeOverride,
  resolvePricingRuleAutoHedgingAdmissionMode
} = require("./pricing-rule-admission-policy");

test("defines MANUAL_ONLY as the sole Pricing Rule admission override", () => {
  assert.deepEqual(PRICING_RULE_AUTO_HEDGING_ADMISSION_MODE_OVERRIDE, {
    MANUAL_ONLY: "MANUAL_ONLY"
  });
  assert.deepEqual(PRICING_RULE_AUTO_HEDGING_ADMISSION_MODE_OVERRIDES, [
    "MANUAL_ONLY"
  ]);
  assert.equal(Object.isFrozen(
    PRICING_RULE_AUTO_HEDGING_ADMISSION_MODE_OVERRIDE
  ), true);
  assert.equal(Object.isFrozen(
    PRICING_RULE_AUTO_HEDGING_ADMISSION_MODE_OVERRIDES
  ), true);
});

test("normalizes null inheritance and the explicit MANUAL_ONLY override", () => {
  assert.equal(
    normalizePricingRuleAutoHedgingAdmissionModeOverride(null),
    null
  );
  assert.equal(
    normalizePricingRuleAutoHedgingAdmissionModeOverride(undefined),
    null
  );
  assert.equal(
    normalizePricingRuleAutoHedgingAdmissionModeOverride(" manual_only "),
    "MANUAL_ONLY"
  );
});

test("rejects unsupported Pricing Rule admission overrides", () => {
  ["", "AUTO_IF_ELIGIBLE", "REVIEW_REQUIRED", "MANUAL", 1, {}].forEach(value => {
    assert.throws(
      () => normalizePricingRuleAutoHedgingAdmissionModeOverride(value),
      error => error instanceof RangeError
        && error.code ===
          "INVALID_PRICING_RULE_AUTO_HEDGING_ADMISSION_MODE_OVERRIDE"
    );
  });
});

test("inherits the Execution Context Admission Policy when no override exists", () => {
  ["AUTO_IF_ELIGIBLE", "REVIEW_REQUIRED", "MANUAL_ONLY"].forEach(mode => {
    assert.equal(resolvePricingRuleAutoHedgingAdmissionMode({
      autoHedgingAdmissionModeOverride: null,
      executionContextAdmissionMode: mode
    }), mode);
  });
});

test("MANUAL_ONLY overrides the Execution Context Admission Policy", () => {
  assert.equal(resolvePricingRuleAutoHedgingAdmissionMode({
    autoHedgingAdmissionModeOverride: "MANUAL_ONLY",
    executionContextAdmissionMode: "AUTO_IF_ELIGIBLE"
  }), "MANUAL_ONLY");
  assert.equal(resolvePricingRuleAutoHedgingAdmissionMode({
    autoHedgingAdmissionModeOverride: "MANUAL_ONLY",
    executionContextAdmissionMode: "REVIEW_REQUIRED"
  }), "MANUAL_ONLY");
});

test("returns no effective mode when neither policy source is available", () => {
  assert.equal(resolvePricingRuleAutoHedgingAdmissionMode({
    autoHedgingAdmissionModeOverride: null,
    executionContextAdmissionMode: null
  }), null);
});
