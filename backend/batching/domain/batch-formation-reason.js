"use strict";

const BATCH_FORMATION_REASON_CODE = Object.freeze({
  MANUAL_SELECTION: "MANUAL_SELECTION",
  MAX_INTERVAL_REACHED: "MAX_INTERVAL_REACHED",
  TRANSFER_RATE_CORRIDOR_BREACHED: "TRANSFER_RATE_CORRIDOR_BREACHED"
});

const BATCH_FORMATION_REASON_CODES = Object.freeze(
  Object.values(BATCH_FORMATION_REASON_CODE)
);
const BATCH_FORMATION_REASON_DETAILS_MAX_LENGTH = 4000;

function formationReasonError(message) {
  const error = new RangeError(message);
  error.code = "INVALID_BATCH_FORMATION_REASON";
  return error;
}

function normalizedDetails(value, selectedTradeCount) {
  const source = value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
  let detailsJson;

  try {
    detailsJson = JSON.stringify({
      ...source,
      selectedTradeCount
    });
  } catch {
    throw formationReasonError("Batch Formation Reason details must be serializable.");
  }

  if (
    detailsJson.length < 2
    || detailsJson.length > BATCH_FORMATION_REASON_DETAILS_MAX_LENGTH
  ) {
    throw formationReasonError(
      `Batch Formation Reason details must not exceed `
        + `${BATCH_FORMATION_REASON_DETAILS_MAX_LENGTH} characters.`
    );
  }

  return Object.freeze({
    value: Object.freeze(JSON.parse(detailsJson)),
    json: detailsJson
  });
}

function batchFormationReason(source, selectedTradeCount) {
  const reasonCode = String(
    source?.reasonCode || BATCH_FORMATION_REASON_CODE.MANUAL_SELECTION
  ).trim().toUpperCase();

  if (!BATCH_FORMATION_REASON_CODES.includes(reasonCode)) {
    throw formationReasonError(`Unsupported Batch Formation Reason ${reasonCode}.`);
  }

  if (!Number.isInteger(selectedTradeCount) || selectedTradeCount <= 0) {
    throw formationReasonError(
      "Batch Formation Reason requires a positive selected Trade count."
    );
  }

  const details = normalizedDetails(source?.details, selectedTradeCount);

  return Object.freeze({
    reasonCode,
    details: details.value,
    detailsJson: details.json
  });
}

module.exports = {
  BATCH_FORMATION_REASON_CODE,
  BATCH_FORMATION_REASON_CODES,
  BATCH_FORMATION_REASON_DETAILS_MAX_LENGTH,
  batchFormationReason
};
