"use strict";

const {
  normalizeAutoManagementAdmissionMode
} = require("./auto-management-admission-mode");

const PRICING_RULE_AUTO_MANAGEMENT_ADMISSION_MODE_OVERRIDE = Object.freeze({
  REVIEW_REQUIRED: "REVIEW_REQUIRED"
});
const PRICING_RULE_AUTO_MANAGEMENT_ADMISSION_MODE_OVERRIDES = Object.freeze(
  Object.values(PRICING_RULE_AUTO_MANAGEMENT_ADMISSION_MODE_OVERRIDE)
);
const pricingRuleAdmissionOverrideSet = new Set(
  PRICING_RULE_AUTO_MANAGEMENT_ADMISSION_MODE_OVERRIDES
);

function normalizePricingRuleAutoManagementAdmissionModeOverride(
  value,
  name = "Pricing Rule Auto Management Admission Mode Override"
) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== "string") {
    const error = new RangeError(`${name} is invalid.`);
    error.code = "INVALID_PRICING_RULE_AUTO_MANAGEMENT_ADMISSION_MODE_OVERRIDE";
    throw error;
  }

  const override = value.trim().toUpperCase();

  if (!pricingRuleAdmissionOverrideSet.has(override)) {
    const error = new RangeError(`${name} must be REVIEW_REQUIRED or null to inherit.`);
    error.code = "INVALID_PRICING_RULE_AUTO_MANAGEMENT_ADMISSION_MODE_OVERRIDE";
    throw error;
  }

  return override;
}

function resolvePricingRuleAutoManagementAdmissionMode({
  autoManagementAdmissionModeOverride,
  tradeContextAdmissionMode
} = {}) {
  const override = normalizePricingRuleAutoManagementAdmissionModeOverride(
    autoManagementAdmissionModeOverride
  );

  if (override !== null) {
    return override;
  }

  if (tradeContextAdmissionMode === null
    || tradeContextAdmissionMode === undefined
    || String(tradeContextAdmissionMode).trim() === "") {
    return null;
  }

  return normalizeAutoManagementAdmissionMode(
    tradeContextAdmissionMode,
    "Trade Context Admission Mode"
  );
}

module.exports = {
  PRICING_RULE_AUTO_MANAGEMENT_ADMISSION_MODE_OVERRIDE,
  PRICING_RULE_AUTO_MANAGEMENT_ADMISSION_MODE_OVERRIDES,
  normalizePricingRuleAutoManagementAdmissionModeOverride,
  resolvePricingRuleAutoManagementAdmissionMode
};
