"use strict";

const FX_POSITION_MANAGEMENT_MODE = Object.freeze({
  MANUAL: "MANUAL",
  AUTO: "AUTO"
});
const FX_POSITION_MANAGEMENT_MODES = Object.freeze(
  Object.values(FX_POSITION_MANAGEMENT_MODE)
);
const fxPositionManagementModeSet = new Set(FX_POSITION_MANAGEMENT_MODES);

function invalidManagementMode(name, value) {
  const renderedValue = typeof value === "string"
    ? value.trim() || "<empty>"
    : String(value);
  const error = new RangeError(
    `${name} must be MANUAL or AUTO; received ${renderedValue}.`
  );
  error.code = "INVALID_FX_POSITION_MANAGEMENT_MODE";
  return error;
}

function normalizeFxPositionManagementMode(
  value,
  name = "FX Position Mode"
) {
  if (typeof value !== "string") {
    throw invalidManagementMode(name, value);
  }

  const mode = value.trim().toUpperCase();

  if (!fxPositionManagementModeSet.has(mode)) {
    throw invalidManagementMode(name, value);
  }

  return mode;
}

function optionalManagementMode(value, name) {
  return value === null || value === undefined
    ? null
    : normalizeFxPositionManagementMode(value, name);
}

function resolveFxPositionManagementMode(policy = {}) {
  if (
    policy === null
    || typeof policy !== "object"
    || Array.isArray(policy)
  ) {
    const error = new TypeError(
      "FX Position Management Policy must be an object."
    );
    error.code = "INVALID_FX_POSITION_MANAGEMENT_POLICY";
    throw error;
  }

  const pricingRuleOverride = optionalManagementMode(
    policy.pricingRuleOverride,
    "Pricing Rule FX Position Mode Override"
  );
  const executionContextDefault = optionalManagementMode(
    policy.executionContextDefault,
    "Execution Context Default FX Position Mode"
  );

  return pricingRuleOverride
    ?? executionContextDefault
    ?? FX_POSITION_MANAGEMENT_MODE.MANUAL;
}

module.exports = {
  FX_POSITION_MANAGEMENT_MODE,
  FX_POSITION_MANAGEMENT_MODES,
  normalizeFxPositionManagementMode,
  resolveFxPositionManagementMode
};
