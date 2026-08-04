"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  FX_AUTO_BATCHING_MAX_INTERVAL_SECONDS_DEFAULT,
  FX_AUTO_BATCHING_MAX_INTERVAL_SECONDS_MAX,
  FX_AUTO_BATCHING_MAX_INTERVAL_SECONDS_MIN,
  fxAutoBatchingSettings
} = require("./fx-auto-batching-settings");

test("accepts a whole Maximum Batching Interval within the supported range", () => {
  assert.deepEqual(
    fxAutoBatchingSettings({
      maxIntervalSeconds: FX_AUTO_BATCHING_MAX_INTERVAL_SECONDS_DEFAULT
    }),
    { maxIntervalSeconds: FX_AUTO_BATCHING_MAX_INTERVAL_SECONDS_DEFAULT }
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
      () => fxAutoBatchingSettings({ maxIntervalSeconds }),
      error => error?.code === "INVALID_FX_AUTO_BATCHING_SETTINGS"
    );
  }
});
