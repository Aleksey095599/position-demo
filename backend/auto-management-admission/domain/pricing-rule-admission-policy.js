"use strict";

const {
  normalizePositionManagementModeSetting
} = require("./position-management-mode-setting");

const PRICING_RULE_POSITION_MANAGEMENT_MODE_SETTING_OVERRIDE = Object.freeze({
  MANUAL: "MANUAL"
});
const PRICING_RULE_POSITION_MANAGEMENT_MODE_SETTING_OVERRIDES = Object.freeze(
  Object.values(PRICING_RULE_POSITION_MANAGEMENT_MODE_SETTING_OVERRIDE)
);
const pricingRuleAdmissionOverrideSet = new Set(
  PRICING_RULE_POSITION_MANAGEMENT_MODE_SETTING_OVERRIDES
);

function normalizePricingRulePositionManagementModeSettingOverride(
  value,
  name = "Pricing Rule Position Management Mode Override"
) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== "string") {
    const error = new RangeError(`${name} is invalid.`);
    error.code = "INVALID_PRICING_RULE_POSITION_MANAGEMENT_MODE_SETTING_OVERRIDE";
    throw error;
  }

  const override = value.trim().toUpperCase();

  if (!pricingRuleAdmissionOverrideSet.has(override)) {
    const error = new RangeError(`${name} must be MANUAL or null to inherit.`);
    error.code = "INVALID_PRICING_RULE_POSITION_MANAGEMENT_MODE_SETTING_OVERRIDE";
    throw error;
  }

  return override;
}

function resolvePricingRulePositionManagementModeSetting({
  positionManagementModeOverride,
  tradeContextPositionManagementMode
} = {}) {
  const override = normalizePricingRulePositionManagementModeSettingOverride(
    positionManagementModeOverride
  );

  if (override !== null) {
    return override;
  }

  if (tradeContextPositionManagementMode === null
    || tradeContextPositionManagementMode === undefined
    || String(tradeContextPositionManagementMode).trim() === "") {
    return null;
  }

  return normalizePositionManagementModeSetting(
    tradeContextPositionManagementMode,
    "Trade Context Position Management Mode"
  );
}

module.exports = {
  PRICING_RULE_POSITION_MANAGEMENT_MODE_SETTING_OVERRIDE,
  PRICING_RULE_POSITION_MANAGEMENT_MODE_SETTING_OVERRIDES,
  normalizePricingRulePositionManagementModeSettingOverride,
  resolvePricingRulePositionManagementModeSetting
};
