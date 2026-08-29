"use strict";

const {
  normalizeAutoHedgingAdmissionMode
} = require("./auto-hedging-admission-mode");

const PRICING_RULE_AUTO_HEDGING_ADMISSION_MODE_OVERRIDE = Object.freeze({
  MANUAL_ONLY: "MANUAL_ONLY"
});
const PRICING_RULE_AUTO_HEDGING_ADMISSION_MODE_OVERRIDES = Object.freeze(
  Object.values(PRICING_RULE_AUTO_HEDGING_ADMISSION_MODE_OVERRIDE)
);
const pricingRuleAdmissionOverrideSet = new Set(
  PRICING_RULE_AUTO_HEDGING_ADMISSION_MODE_OVERRIDES
);

function normalizePricingRuleAutoHedgingAdmissionModeOverride(
  value,
  name = "Pricing Rule Auto Hedging Admission Mode Override"
) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== "string") {
    const error = new RangeError(`${name} is invalid.`);
    error.code = "INVALID_PRICING_RULE_AUTO_HEDGING_ADMISSION_MODE_OVERRIDE";
    throw error;
  }

  const override = value.trim().toUpperCase();

  if (!pricingRuleAdmissionOverrideSet.has(override)) {
    const error = new RangeError(`${name} must be MANUAL_ONLY or null to inherit.`);
    error.code = "INVALID_PRICING_RULE_AUTO_HEDGING_ADMISSION_MODE_OVERRIDE";
    throw error;
  }

  return override;
}

function resolvePricingRuleAutoHedgingAdmissionMode({
  autoHedgingAdmissionModeOverride,
  executionContextAdmissionMode
} = {}) {
  const override = normalizePricingRuleAutoHedgingAdmissionModeOverride(
    autoHedgingAdmissionModeOverride
  );

  if (override !== null) {
    return override;
  }

  if (executionContextAdmissionMode === null
    || executionContextAdmissionMode === undefined
    || String(executionContextAdmissionMode).trim() === "") {
    return null;
  }

  return normalizeAutoHedgingAdmissionMode(
    executionContextAdmissionMode,
    "Execution Context Admission Mode"
  );
}

module.exports = {
  PRICING_RULE_AUTO_HEDGING_ADMISSION_MODE_OVERRIDE,
  PRICING_RULE_AUTO_HEDGING_ADMISSION_MODE_OVERRIDES,
  normalizePricingRuleAutoHedgingAdmissionModeOverride,
  resolvePricingRuleAutoHedgingAdmissionMode
};
