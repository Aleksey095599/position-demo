"use strict";

const POSITION_MANAGEMENT_MODE = Object.freeze({
  MANUAL: "MANUAL",
  AUTO: "AUTO"
});
const POSITION_MANAGEMENT_MODES = Object.freeze(
  Object.values(POSITION_MANAGEMENT_MODE)
);
const positionManagementModeSet = new Set(POSITION_MANAGEMENT_MODES);

function invalidManagementMode(name, value) {
  const renderedValue = typeof value === "string"
    ? value.trim() || "<empty>"
    : String(value);
  const error = new RangeError(
    `${name} must be MANUAL or AUTO; received ${renderedValue}.`
  );
  error.code = "INVALID_POSITION_MANAGEMENT_MODE";
  return error;
}

function normalizePositionManagementMode(
  value,
  name = "Position Management Mode"
) {
  if (typeof value !== "string") {
    throw invalidManagementMode(name, value);
  }

  const mode = value.trim().toUpperCase();

  if (!positionManagementModeSet.has(mode)) {
    throw invalidManagementMode(name, value);
  }

  return mode;
}

module.exports = {
  POSITION_MANAGEMENT_MODE,
  POSITION_MANAGEMENT_MODES,
  normalizePositionManagementMode
};
