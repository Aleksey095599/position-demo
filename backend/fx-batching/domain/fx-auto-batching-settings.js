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
const FX_AUTO_BATCHING_TENOR_COMPATIBILITY_MODE = Object.freeze({
  SAME_TENOR_ONLY: "SAME_TENOR_ONLY"
});
const FX_AUTO_BATCHING_TENOR_COMPATIBILITY_MODE_DEFAULT =
  FX_AUTO_BATCHING_TENOR_COMPATIBILITY_MODE.SAME_TENOR_ONLY;
const FX_AUTO_BATCHING_CCY_PAIR_CODES_DEFAULT = Object.freeze([
  "EUR_USD",
  "GBP_USD"
]);
const FX_AUTO_BATCHING_CCY_PAIR_CODE_PATTERN = /^[A-Z]{3}_[A-Z]{3}$/;

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

function normalizedEligibleCcyPairCodes(value) {
  if (!Array.isArray(value) || value.length === 0) {
    throw invalidSettings(
      "At least one Currency Pair must be enabled for Auto Batching."
    );
  }

  const codes = [...new Set(value.map(code => String(code || "").trim().toUpperCase()))]
    .sort((left, right) => left.localeCompare(right));

  if (
    codes.length === 0
    || codes.some(code => !FX_AUTO_BATCHING_CCY_PAIR_CODE_PATTERN.test(code))
  ) {
    throw invalidSettings(
      "Auto Batching Currency Pairs must use the AAA_BBB code format."
    );
  }

  return Object.freeze(codes);
}

function normalizedTenorCompatibilityMode(value) {
  const mode = String(value || "").trim().toUpperCase();

  if (mode !== FX_AUTO_BATCHING_TENOR_COMPATIBILITY_MODE.SAME_TENOR_ONLY) {
    throw invalidSettings(
      "Tenor Compatibility must be SAME_TENOR_ONLY. Cross-tenor Auto Batching is not supported yet."
    );
  }

  return mode;
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
    ),
    eligibleCcyPairCodes: normalizedEligibleCcyPairCodes(
      source?.eligibleCcyPairCodes
    ),
    tenorCompatibilityMode: normalizedTenorCompatibilityMode(
      source?.tenorCompatibilityMode
    )
  });
}

module.exports = {
  FX_AUTO_BATCHING_CCY_PAIR_CODE_PATTERN,
  FX_AUTO_BATCHING_CCY_PAIR_CODES_DEFAULT,
  FX_AUTO_BATCHING_MAX_INTERVAL_SECONDS_DEFAULT,
  FX_AUTO_BATCHING_MAX_INTERVAL_SECONDS_MAX,
  FX_AUTO_BATCHING_MAX_INTERVAL_SECONDS_MIN,
  FX_AUTO_BATCHING_MAX_TRANSFER_RATE_SPREAD_PERCENT_DEFAULT,
  FX_AUTO_BATCHING_MAX_TRANSFER_RATE_SPREAD_PERCENT_MAX,
  FX_AUTO_BATCHING_MAX_TRANSFER_RATE_SPREAD_PERCENT_MIN,
  FX_AUTO_BATCHING_TENOR_COMPATIBILITY_MODE,
  FX_AUTO_BATCHING_TENOR_COMPATIBILITY_MODE_DEFAULT,
  fxAutoBatchingSettings
};
