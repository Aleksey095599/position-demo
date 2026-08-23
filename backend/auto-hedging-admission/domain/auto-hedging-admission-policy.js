"use strict";

const AUTO_HEDGING_ADMISSION_POLICY = Object.freeze({
  AUTO_IF_ELIGIBLE: "AUTO_IF_ELIGIBLE",
  REVIEW_REQUIRED: "REVIEW_REQUIRED",
  MANUAL_ONLY: "MANUAL_ONLY"
});
const AUTO_HEDGING_ADMISSION_POLICIES = Object.freeze(
  Object.values(AUTO_HEDGING_ADMISSION_POLICY)
);
const autoHedgingAdmissionPolicySet = new Set(AUTO_HEDGING_ADMISSION_POLICIES);

function normalizeAutoHedgingAdmissionPolicy(
  value,
  name = "Auto Hedging Admission Policy"
) {
  if (typeof value !== "string") {
    const error = new RangeError(`${name} is invalid.`);
    error.code = "INVALID_AUTO_HEDGING_ADMISSION_POLICY";
    throw error;
  }

  const policy = value.trim().toUpperCase();

  if (!autoHedgingAdmissionPolicySet.has(policy)) {
    const error = new RangeError(
      `${name} must be AUTO_IF_ELIGIBLE, REVIEW_REQUIRED or MANUAL_ONLY.`
    );
    error.code = "INVALID_AUTO_HEDGING_ADMISSION_POLICY";
    throw error;
  }

  return policy;
}

module.exports = {
  AUTO_HEDGING_ADMISSION_POLICY,
  AUTO_HEDGING_ADMISSION_POLICIES,
  normalizeAutoHedgingAdmissionPolicy
};
