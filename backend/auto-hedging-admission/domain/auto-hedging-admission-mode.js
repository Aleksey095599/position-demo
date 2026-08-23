"use strict";

const AUTO_HEDGING_ADMISSION_MODE = Object.freeze({
  AUTO_IF_ELIGIBLE: "AUTO_IF_ELIGIBLE",
  REVIEW_REQUIRED: "REVIEW_REQUIRED",
  MANUAL_ONLY: "MANUAL_ONLY"
});
const AUTO_HEDGING_ADMISSION_MODES = Object.freeze(
  Object.values(AUTO_HEDGING_ADMISSION_MODE)
);
const autoHedgingAdmissionModeSet = new Set(AUTO_HEDGING_ADMISSION_MODES);

function normalizeAutoHedgingAdmissionMode(
  value,
  name = "Auto Hedging Admission Mode"
) {
  if (typeof value !== "string") {
    const error = new RangeError(`${name} is invalid.`);
    error.code = "INVALID_AUTO_HEDGING_ADMISSION_MODE";
    throw error;
  }

  const mode = value.trim().toUpperCase();

  if (!autoHedgingAdmissionModeSet.has(mode)) {
    const error = new RangeError(
      `${name} must be AUTO_IF_ELIGIBLE, REVIEW_REQUIRED or MANUAL_ONLY.`
    );
    error.code = "INVALID_AUTO_HEDGING_ADMISSION_MODE";
    throw error;
  }

  return mode;
}

module.exports = {
  AUTO_HEDGING_ADMISSION_MODE,
  AUTO_HEDGING_ADMISSION_MODES,
  normalizeAutoHedgingAdmissionMode
};
