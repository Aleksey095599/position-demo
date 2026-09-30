"use strict";

const POSITION_MANAGEMENT_MODE_SETTING = Object.freeze({
  AUTO_IF_ELIGIBLE: "AUTO_IF_ELIGIBLE",
  MANUAL: "MANUAL"
});
const POSITION_MANAGEMENT_MODE_SETTINGS = Object.freeze(
  Object.values(POSITION_MANAGEMENT_MODE_SETTING)
);
const positionManagementModeSet = new Set(POSITION_MANAGEMENT_MODE_SETTINGS);

function normalizePositionManagementModeSetting(
  value,
  name = "Position Management Mode"
) {
  if (typeof value !== "string") {
    const error = new RangeError(`${name} is invalid.`);
    error.code = "INVALID_POSITION_MANAGEMENT_MODE_SETTING";
    throw error;
  }

  const mode = value.trim().toUpperCase();

  if (!positionManagementModeSet.has(mode)) {
    const error = new RangeError(
      `${name} must be AUTO_IF_ELIGIBLE or MANUAL.`
    );
    error.code = "INVALID_POSITION_MANAGEMENT_MODE_SETTING";
    throw error;
  }

  return mode;
}

module.exports = {
  POSITION_MANAGEMENT_MODE_SETTING,
  POSITION_MANAGEMENT_MODE_SETTINGS,
  normalizePositionManagementModeSetting
};
