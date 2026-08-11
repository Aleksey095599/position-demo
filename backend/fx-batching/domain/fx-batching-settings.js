"use strict";

const FX_BATCHING_ALLOW_CROSS_TENOR_BATCHING_DEFAULT = false;

function settingsError(code, message) {
  const error = new RangeError(message);
  error.code = code;
  return error;
}

function normalizedAllowCrossTenorBatching(value) {
  if (value === undefined) {
    return FX_BATCHING_ALLOW_CROSS_TENOR_BATCHING_DEFAULT;
  }

  if (typeof value !== "boolean") {
    throw settingsError(
      "INVALID_FX_BATCHING_SETTINGS",
      "Allow Cross-Tenor Batching must be a boolean."
    );
  }

  if (value) {
    throw settingsError(
      "IN_DEVELOPMENT",
      "Cross-Tenor Batching is in development and cannot be enabled yet."
    );
  }

  return value;
}

function fxBatchingSettings(source = {}) {
  return Object.freeze({
    allowCrossTenorBatching: normalizedAllowCrossTenorBatching(
      source?.allowCrossTenorBatching
    )
  });
}

module.exports = {
  FX_BATCHING_ALLOW_CROSS_TENOR_BATCHING_DEFAULT,
  fxBatchingSettings
};
