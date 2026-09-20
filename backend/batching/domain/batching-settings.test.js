"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  BATCHING_ALLOW_CROSS_TENOR_BATCHING_DEFAULT,
  batchingSettings
} = require("./batching-settings");

test("defaults Cross-Tenor Batching to disabled", () => {
  const settings = batchingSettings();

  assert.equal(BATCHING_ALLOW_CROSS_TENOR_BATCHING_DEFAULT, false);
  assert.equal(settings.allowCrossTenorBatching, false);
  assert.equal(Object.isFrozen(settings), true);
});

test("accepts an explicitly disabled Cross-Tenor Batching setting", () => {
  assert.deepEqual(batchingSettings({
    allowCrossTenorBatching: false
  }), {
    allowCrossTenorBatching: false
  });
});

test("rejects enabling Cross-Tenor Batching while it is in development", () => {
  assert.throws(
    () => batchingSettings({ allowCrossTenorBatching: true }),
    error => error?.code === "IN_DEVELOPMENT"
      && /in development/.test(error.message)
  );
});

test("requires Allow Cross-Tenor Batching to be a boolean", () => {
  [0, 1, "false", null].forEach(value => {
    assert.throws(
      () => batchingSettings({ allowCrossTenorBatching: value }),
      error => error?.code === "INVALID_BATCHING_SETTINGS"
    );
  });
});
