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
  fxAutoBatchingSettings
} = require("./fx-auto-batching-settings");

test("accepts a whole Maximum Batching Interval within the supported range", () => {
  assert.deepEqual(
    fxAutoBatchingSettings({
      maxIntervalSeconds: FX_AUTO_BATCHING_MAX_INTERVAL_SECONDS_DEFAULT,
      maxTransferRateSpreadPercent:
        FX_AUTO_BATCHING_MAX_TRANSFER_RATE_SPREAD_PERCENT_DEFAULT
    }),
    {
      maxIntervalSeconds: FX_AUTO_BATCHING_MAX_INTERVAL_SECONDS_DEFAULT,
      maxTransferRateSpreadPercent:
        FX_AUTO_BATCHING_MAX_TRANSFER_RATE_SPREAD_PERCENT_DEFAULT
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
      () => fxAutoBatchingSettings({
        maxIntervalSeconds,
        maxTransferRateSpreadPercent:
          FX_AUTO_BATCHING_MAX_TRANSFER_RATE_SPREAD_PERCENT_DEFAULT
      }),
      error => error?.code === "INVALID_FX_AUTO_BATCHING_SETTINGS"
    );
  }
});

test("normalizes an exact Default Transfer Rate Corridor percentage", () => {
  assert.deepEqual(
    fxAutoBatchingSettings({
      maxIntervalSeconds: FX_AUTO_BATCHING_MAX_INTERVAL_SECONDS_DEFAULT,
      maxTransferRateSpreadPercent: "0.0500"
    }),
    {
      maxIntervalSeconds: FX_AUTO_BATCHING_MAX_INTERVAL_SECONDS_DEFAULT,
      maxTransferRateSpreadPercent: "0.05"
    }
  );
});

test("accepts the supported Default Transfer Rate Corridor boundaries", () => {
  for (const maxTransferRateSpreadPercent of [
    FX_AUTO_BATCHING_MAX_TRANSFER_RATE_SPREAD_PERCENT_MIN,
    FX_AUTO_BATCHING_MAX_TRANSFER_RATE_SPREAD_PERCENT_MAX
  ]) {
    assert.equal(
      fxAutoBatchingSettings({
        maxIntervalSeconds: FX_AUTO_BATCHING_MAX_INTERVAL_SECONDS_DEFAULT,
        maxTransferRateSpreadPercent
      }).maxTransferRateSpreadPercent,
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
      () => fxAutoBatchingSettings({
        maxIntervalSeconds: FX_AUTO_BATCHING_MAX_INTERVAL_SECONDS_DEFAULT,
        maxTransferRateSpreadPercent
      }),
      error => error?.code === "INVALID_FX_AUTO_BATCHING_SETTINGS"
    );
  }
});
