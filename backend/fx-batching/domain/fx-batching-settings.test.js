"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  FX_BATCHING_ALLOW_CROSS_TENOR_BATCHING_DEFAULT,
  fxBatchingSettings
} = require("./fx-batching-settings");

test("defaults Cross-Tenor Batching to disabled", () => {
  const settings = fxBatchingSettings();

  assert.equal(FX_BATCHING_ALLOW_CROSS_TENOR_BATCHING_DEFAULT, false);
  assert.equal(settings.allowCrossTenorBatching, false);
  assert.equal(Object.isFrozen(settings), true);
});

test("accepts an explicitly disabled Cross-Tenor Batching setting", () => {
  assert.deepEqual(fxBatchingSettings({
    allowCrossTenorBatching: false
  }), {
    allowCrossTenorBatching: false
  });
});

test("rejects enabling Cross-Tenor Batching while it is in development", () => {
  assert.throws(
    () => fxBatchingSettings({ allowCrossTenorBatching: true }),
    error => error?.code === "IN_DEVELOPMENT"
      && /in development/.test(error.message)
  );
});

test("requires Allow Cross-Tenor Batching to be a boolean", () => {
  [0, 1, "false", null].forEach(value => {
    assert.throws(
      () => fxBatchingSettings({ allowCrossTenorBatching: value }),
      error => error?.code === "INVALID_FX_BATCHING_SETTINGS"
    );
  });
});
