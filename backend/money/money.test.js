"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  calculateBaseMinor,
  calculateFxAmountsFromDealt,
  calculateQuoteMinor,
  majorToMinor,
  minorToMajor,
  minorToSafeInteger
} = require("./money");

test("converts decimal major amounts to integer minor units", () => {
  assert.equal(majorToMinor("1000.63", 2), 100063n);
  assert.equal(majorToMinor("1000", 0), 1000n);
  assert.equal(majorToMinor("1.234", 3), 1234n);
});

test("uses ROUND_HALF_UP only at the major-to-minor boundary", () => {
  assert.equal(majorToMinor("1.005", 2), 101n);
  assert.equal(majorToMinor("-1.005", 2), -101n);
});

test("formats integer minor units without binary floating-point arithmetic", () => {
  assert.equal(minorToMajor(100063n, 2), "1000.63");
  assert.equal(minorToMajor(1000n, 0), "1000");
  assert.equal(minorToMajor(1234n, 3), "1.234");
});

test("calculates and rounds Quote Amount from Base minor units and a decimal rate", () => {
  assert.equal(calculateQuoteMinor({
    baseAmountMinor: 100063n,
    baseFractionDigits: 2,
    rate: "1.12235",
    quoteFractionDigits: 2
  }), 112306n);
});

test("calculates and rounds Base Amount from Quote minor units and a decimal rate", () => {
  assert.equal(calculateBaseMinor({
    quoteAmountMinor: 112306n,
    quoteFractionDigits: 2,
    rate: "1.12235",
    baseFractionDigits: 2
  }), 100063n);
});

test("derives both minor-unit amounts from the dealt currency", () => {
  assert.deepEqual(calculateFxAmountsFromDealt({
    dealtAmount: "1000.63",
    dealtCcyCode: "EUR",
    baseCcyCode: "EUR",
    quoteCcyCode: "USD",
    baseFractionDigits: 2,
    quoteFractionDigits: 2,
    rate: "1.12235"
  }), {
    baseAmountMinor: 100063n,
    quoteAmountMinor: 112306n
  });

  assert.deepEqual(calculateFxAmountsFromDealt({
    dealtAmount: "1123.06",
    dealtCcyCode: "USD",
    baseCcyCode: "EUR",
    quoteCcyCode: "USD",
    baseFractionDigits: 2,
    quoteFractionDigits: 2,
    rate: "1.12235"
  }), {
    baseAmountMinor: 100063n,
    quoteAmountMinor: 112306n
  });
});

test("converts only safe minor-unit integers for the current SQLite API boundary", () => {
  assert.equal(minorToSafeInteger(112294n), 112294);
  assert.throws(
    () => minorToSafeInteger(BigInt(Number.MAX_SAFE_INTEGER) + 1n),
    /exceeds the safe/
  );
});
