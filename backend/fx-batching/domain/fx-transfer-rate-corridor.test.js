"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  evaluateTransferRateCorridor
} = require("./fx-transfer-rate-corridor");

test("starts a zero-width corridor from the first Transfer Rate", () => {
  assert.deepEqual(
    evaluateTransferRateCorridor({
      currentTransferRates: [],
      incomingTransferRate: "1.1220",
      maxSpreadPercent: "0.05"
    }),
    {
      transferRateCount: 1,
      minTransferRate: "1.122",
      maxTransferRate: "1.122",
      spreadPercent: "0",
      maxSpreadPercent: "0.05",
      isBreached: false
    }
  );
});

test("accepts an incoming Transfer Rate while the full corridor remains within the limit", () => {
  const result = evaluateTransferRateCorridor({
    currentTransferRates: ["1.1220", "1.1223"],
    incomingTransferRate: "1.1219",
    maxSpreadPercent: "0.05"
  });

  assert.equal(result.minTransferRate, "1.1219");
  assert.equal(result.maxTransferRate, "1.1223");
  assert.match(result.spreadPercent, /^0\.03564/);
  assert.equal(result.isBreached, false);
});

test("accepts a Transfer Rate exactly on the configured corridor boundary", () => {
  const result = evaluateTransferRateCorridor({
    currentTransferRates: ["0.9995"],
    incomingTransferRate: "1.0005",
    maxSpreadPercent: "0.1"
  });

  assert.equal(result.spreadPercent, "0.1");
  assert.equal(result.isBreached, false);
});

test("detects an incoming Transfer Rate that breaches the full corridor width", () => {
  const result = evaluateTransferRateCorridor({
    currentTransferRates: ["1.1220", "1.1223", "1.1219"],
    incomingTransferRate: "1.1226",
    maxSpreadPercent: "0.05"
  });

  assert.equal(result.minTransferRate, "1.1219");
  assert.equal(result.maxTransferRate, "1.1226");
  assert.match(result.spreadPercent, /^0\.06237/);
  assert.equal(result.isBreached, true);
});

test("produces the same corridor regardless of Transfer Rate arrival order", () => {
  const forward = evaluateTransferRateCorridor({
    currentTransferRates: ["1.1220", "1.1223"],
    incomingTransferRate: "1.1219",
    maxSpreadPercent: "0.05"
  });
  const reordered = evaluateTransferRateCorridor({
    currentTransferRates: ["1.1219", "1.1220"],
    incomingTransferRate: "1.1223",
    maxSpreadPercent: "0.05"
  });

  assert.deepEqual(reordered, forward);
});

test("rejects absent, non-positive, or malformed Transfer Rates", () => {
  for (const invalidRate of [null, undefined, "", "invalid", "0", "-1", Infinity]) {
    assert.throws(
      () => evaluateTransferRateCorridor({
        currentTransferRates: ["1.1220"],
        incomingTransferRate: invalidRate,
        maxSpreadPercent: "0.05"
      }),
      error => error?.code === "INVALID_FX_TRANSFER_RATE_CORRIDOR"
    );
  }

  assert.throws(
    () => evaluateTransferRateCorridor({
      currentTransferRates: ["1.1220", null],
      incomingTransferRate: "1.1221",
      maxSpreadPercent: "0.05"
    }),
    error => error?.code === "INVALID_FX_TRANSFER_RATE_CORRIDOR"
  );
});

test("rejects an invalid corridor collection or percentage", () => {
  assert.throws(
    () => evaluateTransferRateCorridor({
      currentTransferRates: null,
      incomingTransferRate: "1.1220",
      maxSpreadPercent: "0.05"
    }),
    error => error?.code === "INVALID_FX_TRANSFER_RATE_CORRIDOR"
  );

  for (const invalidPercent of [null, undefined, "", "invalid", "-0.01", Infinity]) {
    assert.throws(
      () => evaluateTransferRateCorridor({
        currentTransferRates: [],
        incomingTransferRate: "1.1220",
        maxSpreadPercent: invalidPercent
      }),
      error => error?.code === "INVALID_FX_TRANSFER_RATE_CORRIDOR"
    );
  }
});
