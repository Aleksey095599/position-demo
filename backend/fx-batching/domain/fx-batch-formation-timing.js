"use strict";

const {
  FX_BATCH_FORMATION_REASON_CODE
} = require("./fx-batch-formation-reason");

function timingError(message) {
  const error = new RangeError(message);
  error.code = "INVALID_BATCH_FORMATION_TIMING";
  return error;
}

function exactIsoTimestamp(value, name) {
  const text = String(value || "").trim();
  const timestamp = new Date(text);

  if (!text || !Number.isFinite(timestamp.getTime()) || timestamp.toISOString() !== text) {
    throw timingError(`${name} must be an ISO timestamp with millisecond precision.`);
  }

  return text;
}

function fxBatchFormationTiming({
  reasonCode,
  windowOpenedAt,
  windowClosedAt
}) {
  if (reasonCode === FX_BATCH_FORMATION_REASON_CODE.MANUAL_SELECTION) {
    if (windowOpenedAt !== null && windowOpenedAt !== undefined) {
      throw timingError("A manually formed FX Batch cannot have Window Opened At.");
    }

    if (windowClosedAt !== null && windowClosedAt !== undefined) {
      throw timingError("A manually formed FX Batch cannot have Window Closed At.");
    }

    return Object.freeze({
      windowOpenedAt: null,
      windowClosedAt: null
    });
  }

  const openedAt = exactIsoTimestamp(windowOpenedAt, "Window Opened At");
  const closedAt = exactIsoTimestamp(windowClosedAt, "Window Closed At");

  if (openedAt > closedAt) {
    throw timingError("Window Opened At must not be later than Window Closed At.");
  }

  return Object.freeze({
    windowOpenedAt: openedAt,
    windowClosedAt: closedAt
  });
}

module.exports = {
  fxBatchFormationTiming
};
