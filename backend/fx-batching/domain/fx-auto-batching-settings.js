"use strict";

const Big = require("big.js");

const Decimal = Big();
Decimal.strict = true;
Decimal.DP = 40;
Decimal.RM = Decimal.roundHalfUp;

const FX_AUTO_BATCHING_MAX_INTERVAL_SECONDS_MIN = 1;
const FX_AUTO_BATCHING_MAX_INTERVAL_SECONDS_MAX = 3600;
const FX_AUTO_BATCHING_MAX_INTERVAL_SECONDS_DEFAULT = 60;
const FX_AUTO_BATCHING_MAX_TRANSFER_RATE_SPREAD_PERCENT_MIN = "0.0001";
const FX_AUTO_BATCHING_MAX_TRANSFER_RATE_SPREAD_PERCENT_MAX = "100";
const FX_AUTO_BATCHING_MAX_TRANSFER_RATE_SPREAD_PERCENT_DEFAULT = "0.05";

function invalidSettings(message) {
  const error = new RangeError(message);
  error.code = "INVALID_FX_AUTO_BATCHING_SETTINGS";
  return error;
}

function normalizedTransferRateSpreadPercent(value) {
  let spreadPercent;

  try {
    spreadPercent = new Decimal(String(value));
  } catch {
    throw invalidSettings(
      "Default Transfer Rate Corridor must be a decimal percentage from "
        + `${FX_AUTO_BATCHING_MAX_TRANSFER_RATE_SPREAD_PERCENT_MIN} to `
        + `${FX_AUTO_BATCHING_MAX_TRANSFER_RATE_SPREAD_PERCENT_MAX}.`
    );
  }

  if (
    spreadPercent.lt(FX_AUTO_BATCHING_MAX_TRANSFER_RATE_SPREAD_PERCENT_MIN)
    || spreadPercent.gt(FX_AUTO_BATCHING_MAX_TRANSFER_RATE_SPREAD_PERCENT_MAX)
  ) {
    throw invalidSettings(
      "Default Transfer Rate Corridor must be a decimal percentage from "
        + `${FX_AUTO_BATCHING_MAX_TRANSFER_RATE_SPREAD_PERCENT_MIN} to `
        + `${FX_AUTO_BATCHING_MAX_TRANSFER_RATE_SPREAD_PERCENT_MAX}.`
    );
  }

  return spreadPercent.toString();
}

function fxAutoBatchingSettings(source) {
  const maxIntervalSeconds = Number(source?.maxIntervalSeconds);

  if (
    !Number.isInteger(maxIntervalSeconds)
    || maxIntervalSeconds < FX_AUTO_BATCHING_MAX_INTERVAL_SECONDS_MIN
    || maxIntervalSeconds > FX_AUTO_BATCHING_MAX_INTERVAL_SECONDS_MAX
  ) {
    throw invalidSettings(
      `Maximum Batching Interval must be a whole number of seconds from `
        + `${FX_AUTO_BATCHING_MAX_INTERVAL_SECONDS_MIN} to `
        + `${FX_AUTO_BATCHING_MAX_INTERVAL_SECONDS_MAX}.`
    );
  }

  return Object.freeze({
    maxIntervalSeconds,
    maxTransferRateSpreadPercent: normalizedTransferRateSpreadPercent(
      source?.maxTransferRateSpreadPercent
    )
  });
}

module.exports = {
  FX_AUTO_BATCHING_MAX_INTERVAL_SECONDS_DEFAULT,
  FX_AUTO_BATCHING_MAX_INTERVAL_SECONDS_MAX,
  FX_AUTO_BATCHING_MAX_INTERVAL_SECONDS_MIN,
  FX_AUTO_BATCHING_MAX_TRANSFER_RATE_SPREAD_PERCENT_DEFAULT,
  FX_AUTO_BATCHING_MAX_TRANSFER_RATE_SPREAD_PERCENT_MAX,
  FX_AUTO_BATCHING_MAX_TRANSFER_RATE_SPREAD_PERCENT_MIN,
  fxAutoBatchingSettings
};
