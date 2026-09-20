"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  AUTO_BATCHING_MAX_INTERVAL_SECONDS_DEFAULT,
  AUTO_BATCHING_MAX_INTERVAL_SECONDS_MAX,
  AUTO_BATCHING_MAX_INTERVAL_SECONDS_MIN,
  AUTO_BATCHING_MAX_TRANSFER_RATE_SPREAD_PERCENT_DEFAULT,
  AUTO_BATCHING_MAX_TRANSFER_RATE_SPREAD_PERCENT_MAX,
  AUTO_BATCHING_MAX_TRANSFER_RATE_SPREAD_PERCENT_MIN,
  AUTO_BATCHING_TENOR_COMPATIBILITY_MODE_DEFAULT,
  autoBatchingSettings
} = require("./auto-batching-settings");

const DEFAULT_ELIGIBLE_CCY_PAIR_CODES = ["EUR_USD", "GBP_USD"];

function validSettings(overrides = {}) {
  return {
    maxIntervalSeconds: AUTO_BATCHING_MAX_INTERVAL_SECONDS_DEFAULT,
    maxTransferRateSpreadPercent:
      AUTO_BATCHING_MAX_TRANSFER_RATE_SPREAD_PERCENT_DEFAULT,
    eligibleCcyPairCodes: DEFAULT_ELIGIBLE_CCY_PAIR_CODES,
    tenorCompatibilityMode:
      AUTO_BATCHING_TENOR_COMPATIBILITY_MODE_DEFAULT,
    ...overrides
  };
}

test("accepts a whole Maximum Batching Interval within the supported range", () => {
  assert.deepEqual(
    autoBatchingSettings(validSettings()),
    {
      maxIntervalSeconds: AUTO_BATCHING_MAX_INTERVAL_SECONDS_DEFAULT,
      maxTransferRateSpreadPercent:
        AUTO_BATCHING_MAX_TRANSFER_RATE_SPREAD_PERCENT_DEFAULT,
      eligibleCcyPairCodes: DEFAULT_ELIGIBLE_CCY_PAIR_CODES,
      tenorCompatibilityMode:
        AUTO_BATCHING_TENOR_COMPATIBILITY_MODE_DEFAULT
    }
  );
});

test("rejects an invalid Maximum Batching Interval", () => {
  for (const maxIntervalSeconds of [
    AUTO_BATCHING_MAX_INTERVAL_SECONDS_MIN - 1,
    AUTO_BATCHING_MAX_INTERVAL_SECONDS_MAX + 1,
    1.5,
    ""
  ]) {
    assert.throws(
      () => autoBatchingSettings(validSettings({ maxIntervalSeconds })),
      error => error?.code === "INVALID_AUTO_BATCHING_SETTINGS"
    );
  }
});

test("normalizes an exact Default Transfer Rate Corridor percentage", () => {
  assert.deepEqual(
    autoBatchingSettings(validSettings({
      maxTransferRateSpreadPercent: "0.0500"
    })),
    {
      maxIntervalSeconds: AUTO_BATCHING_MAX_INTERVAL_SECONDS_DEFAULT,
      maxTransferRateSpreadPercent: "0.05",
      eligibleCcyPairCodes: DEFAULT_ELIGIBLE_CCY_PAIR_CODES,
      tenorCompatibilityMode:
        AUTO_BATCHING_TENOR_COMPATIBILITY_MODE_DEFAULT
    }
  );
});

test("accepts the supported Default Transfer Rate Corridor boundaries", () => {
  for (const maxTransferRateSpreadPercent of [
    AUTO_BATCHING_MAX_TRANSFER_RATE_SPREAD_PERCENT_MIN,
    AUTO_BATCHING_MAX_TRANSFER_RATE_SPREAD_PERCENT_MAX
  ]) {
    assert.equal(
      autoBatchingSettings(validSettings({
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
      () => autoBatchingSettings(validSettings({
        maxTransferRateSpreadPercent
      })),
      error => error?.code === "INVALID_AUTO_BATCHING_SETTINGS"
    );
  }
});

test("normalizes and de-duplicates eligible Auto Batching Currency Pairs", () => {
  assert.deepEqual(
    autoBatchingSettings(validSettings({
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
      () => autoBatchingSettings(validSettings({ eligibleCcyPairCodes })),
      error => error?.code === "INVALID_AUTO_BATCHING_SETTINGS"
    );
  }
});

test("accepts only the currently supported Same Tenor compatibility mode", () => {
  assert.equal(
    autoBatchingSettings(validSettings()).tenorCompatibilityMode,
    "SAME_TENOR_ONLY"
  );
  assert.throws(
    () => autoBatchingSettings(validSettings({
      tenorCompatibilityMode: "CROSS_TENOR_WITH_SWAPS"
    })),
    error => error?.code === "INVALID_AUTO_BATCHING_SETTINGS"
  );
});
