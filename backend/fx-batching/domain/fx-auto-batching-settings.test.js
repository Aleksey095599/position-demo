"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  FX_AUTO_BATCHING_MAX_INTERVAL_SECONDS_DEFAULT,
  FX_AUTO_BATCHING_MAX_INTERVAL_SECONDS_MAX,
  FX_AUTO_BATCHING_MAX_INTERVAL_SECONDS_MIN,
  FX_AUTO_BATCHING_MAX_TRANSFER_RATE_SPREAD_PERCENT_DEFAULT,
  FX_AUTO_BATCHING_MAX_TRANSFER_RATE_SPREAD_PERCENT_MAX,
  FX_AUTO_BATCHING_MAX_TRANSFER_RATE_SPREAD_PERCENT_MIN,
  FX_AUTO_BATCHING_TENOR_COMPATIBILITY_MODE_DEFAULT,
  fxAutoBatchingSettings
} = require("./fx-auto-batching-settings");

const DEFAULT_ELIGIBLE_CCY_PAIR_CODES = ["EUR_USD", "GBP_USD"];

function validSettings(overrides = {}) {
  return {
    maxIntervalSeconds: FX_AUTO_BATCHING_MAX_INTERVAL_SECONDS_DEFAULT,
    maxTransferRateSpreadPercent:
      FX_AUTO_BATCHING_MAX_TRANSFER_RATE_SPREAD_PERCENT_DEFAULT,
    eligibleCcyPairCodes: DEFAULT_ELIGIBLE_CCY_PAIR_CODES,
    tenorCompatibilityMode:
      FX_AUTO_BATCHING_TENOR_COMPATIBILITY_MODE_DEFAULT,
    ...overrides
  };
}

test("accepts a whole Maximum Batching Interval within the supported range", () => {
  assert.deepEqual(
    fxAutoBatchingSettings(validSettings()),
    {
      maxIntervalSeconds: FX_AUTO_BATCHING_MAX_INTERVAL_SECONDS_DEFAULT,
      maxTransferRateSpreadPercent:
        FX_AUTO_BATCHING_MAX_TRANSFER_RATE_SPREAD_PERCENT_DEFAULT,
      eligibleCcyPairCodes: DEFAULT_ELIGIBLE_CCY_PAIR_CODES,
      tenorCompatibilityMode:
        FX_AUTO_BATCHING_TENOR_COMPATIBILITY_MODE_DEFAULT
    }
  );
});

test("rejects an invalid Maximum Batching Interval", () => {
  for (const maxIntervalSeconds of [
    FX_AUTO_BATCHING_MAX_INTERVAL_SECONDS_MIN - 1,
    FX_AUTO_BATCHING_MAX_INTERVAL_SECONDS_MAX + 1,
    1.5,
    ""
  ]) {
    assert.throws(
      () => fxAutoBatchingSettings(validSettings({ maxIntervalSeconds })),
      error => error?.code === "INVALID_FX_AUTO_BATCHING_SETTINGS"
    );
  }
});

test("normalizes an exact Default Transfer Rate Corridor percentage", () => {
  assert.deepEqual(
    fxAutoBatchingSettings(validSettings({
      maxTransferRateSpreadPercent: "0.0500"
    })),
    {
      maxIntervalSeconds: FX_AUTO_BATCHING_MAX_INTERVAL_SECONDS_DEFAULT,
      maxTransferRateSpreadPercent: "0.05",
      eligibleCcyPairCodes: DEFAULT_ELIGIBLE_CCY_PAIR_CODES,
      tenorCompatibilityMode:
        FX_AUTO_BATCHING_TENOR_COMPATIBILITY_MODE_DEFAULT
    }
  );
});

test("accepts the supported Default Transfer Rate Corridor boundaries", () => {
  for (const maxTransferRateSpreadPercent of [
    FX_AUTO_BATCHING_MAX_TRANSFER_RATE_SPREAD_PERCENT_MIN,
    FX_AUTO_BATCHING_MAX_TRANSFER_RATE_SPREAD_PERCENT_MAX
  ]) {
    assert.equal(
      fxAutoBatchingSettings(validSettings({
        maxTransferRateSpreadPercent
      })).maxTransferRateSpreadPercent,
      maxTransferRateSpreadPercent
    );
  }
});

test("rejects an invalid Default Transfer Rate Corridor percentage", () => {
  for (const maxTransferRateSpreadPercent of [
    "0",
    "0.00001",
    "100.0001",
    "invalid",
    "",
    null,
    undefined,
    Infinity
  ]) {
    assert.throws(
      () => fxAutoBatchingSettings(validSettings({
        maxTransferRateSpreadPercent
      })),
      error => error?.code === "INVALID_FX_AUTO_BATCHING_SETTINGS"
    );
  }
});

test("normalizes and de-duplicates eligible Auto Batching Currency Pairs", () => {
  assert.deepEqual(
    fxAutoBatchingSettings(validSettings({
      eligibleCcyPairCodes: ["gbp_usd", "EUR_USD", "EUR_USD"]
    })).eligibleCcyPairCodes,
    ["EUR_USD", "GBP_USD"]
  );
});

test("requires at least one valid eligible Auto Batching Currency Pair", () => {
  for (const eligibleCcyPairCodes of [
    [],
    null,
    ["EURUSD"],
    ["EUR_USD", "INVALID"]
  ]) {
    assert.throws(
      () => fxAutoBatchingSettings(validSettings({ eligibleCcyPairCodes })),
      error => error?.code === "INVALID_FX_AUTO_BATCHING_SETTINGS"
    );
  }
});

test("accepts only the currently supported Same Tenor compatibility mode", () => {
  assert.equal(
    fxAutoBatchingSettings(validSettings()).tenorCompatibilityMode,
    "SAME_TENOR_ONLY"
  );
  assert.throws(
    () => fxAutoBatchingSettings(validSettings({
      tenorCompatibilityMode: "CROSS_TENOR_WITH_SWAPS"
    })),
    error => error?.code === "INVALID_FX_AUTO_BATCHING_SETTINGS"
  );
});
