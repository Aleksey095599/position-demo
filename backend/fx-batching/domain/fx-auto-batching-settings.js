"use strict";

const FX_AUTO_BATCHING_MAX_INTERVAL_SECONDS_MIN = 1;
const FX_AUTO_BATCHING_MAX_INTERVAL_SECONDS_MAX = 3600;
const FX_AUTO_BATCHING_MAX_INTERVAL_SECONDS_DEFAULT = 60;

function fxAutoBatchingSettings(source) {
  const maxIntervalSeconds = Number(source?.maxIntervalSeconds);

  if (
    !Number.isInteger(maxIntervalSeconds)
    || maxIntervalSeconds < FX_AUTO_BATCHING_MAX_INTERVAL_SECONDS_MIN
    || maxIntervalSeconds > FX_AUTO_BATCHING_MAX_INTERVAL_SECONDS_MAX
  ) {
    const error = new RangeError(
      `Maximum Batching Interval must be a whole number of seconds from `
        + `${FX_AUTO_BATCHING_MAX_INTERVAL_SECONDS_MIN} to `
        + `${FX_AUTO_BATCHING_MAX_INTERVAL_SECONDS_MAX}.`
    );
    error.code = "INVALID_FX_AUTO_BATCHING_SETTINGS";
    throw error;
  }

  return Object.freeze({ maxIntervalSeconds });
}

module.exports = {
  FX_AUTO_BATCHING_MAX_INTERVAL_SECONDS_DEFAULT,
  FX_AUTO_BATCHING_MAX_INTERVAL_SECONDS_MAX,
  FX_AUTO_BATCHING_MAX_INTERVAL_SECONDS_MIN,
  fxAutoBatchingSettings
};
