"use strict";

const FX_BATCH_FORMATION_REASON_CODE = Object.freeze({
  MANUAL_SELECTION: "MANUAL_SELECTION",
  MAX_INTERVAL_REACHED: "MAX_INTERVAL_REACHED",
  TRANSFER_RATE_CORRIDOR_BREACHED: "TRANSFER_RATE_CORRIDOR_BREACHED"
});

const FX_BATCH_FORMATION_REASON_CODES = Object.freeze(
  Object.values(FX_BATCH_FORMATION_REASON_CODE)
);
const FX_BATCH_FORMATION_REASON_DETAILS_MAX_LENGTH = 4000;

function formationReasonError(message) {
  const error = new RangeError(message);
  error.code = "INVALID_FX_BATCH_FORMATION_REASON";
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
    throw formationReasonError("FX Batch Formation Reason details must be serializable.");
  }

  if (
    detailsJson.length < 2
    || detailsJson.length > FX_BATCH_FORMATION_REASON_DETAILS_MAX_LENGTH
  ) {
    throw formationReasonError(
      `FX Batch Formation Reason details must not exceed `
        + `${FX_BATCH_FORMATION_REASON_DETAILS_MAX_LENGTH} characters.`
    );
  }

  return Object.freeze({
    value: Object.freeze(JSON.parse(detailsJson)),
    json: detailsJson
  });
}

function fxBatchFormationReason(source, selectedTradeCount) {
  const reasonCode = String(
    source?.reasonCode || FX_BATCH_FORMATION_REASON_CODE.MANUAL_SELECTION
  ).trim().toUpperCase();

  if (!FX_BATCH_FORMATION_REASON_CODES.includes(reasonCode)) {
    throw formationReasonError(`Unsupported FX Batch Formation Reason ${reasonCode}.`);
  }

  if (!Number.isInteger(selectedTradeCount) || selectedTradeCount <= 0) {
    throw formationReasonError(
      "FX Batch Formation Reason requires a positive selected Trade count."
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
  FX_BATCH_FORMATION_REASON_CODE,
  FX_BATCH_FORMATION_REASON_CODES,
  FX_BATCH_FORMATION_REASON_DETAILS_MAX_LENGTH,
  fxBatchFormationReason
};
