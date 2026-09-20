"use strict";

const AUTO_MANAGEMENT_ADMISSION_MODE = Object.freeze({
  AUTO_IF_ELIGIBLE: "AUTO_IF_ELIGIBLE",
  REVIEW_REQUIRED: "REVIEW_REQUIRED"
});
const AUTO_MANAGEMENT_ADMISSION_MODES = Object.freeze(
  Object.values(AUTO_MANAGEMENT_ADMISSION_MODE)
);
const autoManagementAdmissionModeSet = new Set(AUTO_MANAGEMENT_ADMISSION_MODES);

function normalizeAutoManagementAdmissionMode(
  value,
  name = "Auto Management Admission Mode"
) {
  if (typeof value !== "string") {
    const error = new RangeError(`${name} is invalid.`);
    error.code = "INVALID_AUTO_MANAGEMENT_ADMISSION_MODE";
    throw error;
  }

  const mode = value.trim().toUpperCase();

  if (!autoManagementAdmissionModeSet.has(mode)) {
    const error = new RangeError(
      `${name} must be AUTO_IF_ELIGIBLE or REVIEW_REQUIRED.`
    );
    error.code = "INVALID_AUTO_MANAGEMENT_ADMISSION_MODE";
    throw error;
  }

  return mode;
}

module.exports = {
  AUTO_MANAGEMENT_ADMISSION_MODE,
  AUTO_MANAGEMENT_ADMISSION_MODES,
  normalizeAutoManagementAdmissionMode
};
