"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  calculateBaseMinor,
  calculateFxAmountsFromDealt,
  calculateQuoteMinor,
  majorToMinor,
  majorToMinorExact,
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

test("rejects sub-minor precision at an exact input boundary", () => {
  assert.equal(majorToMinorExact("1.50", 2), 150n);
  assert.equal(majorToMinorExact("123", 0), 123n);
  assert.equal(majorToMinorExact("1.234", 3), 1234n);
  assert.throws(
    () => majorToMinorExact("1.005", 2),
    /more than 2 fractional digits/
  );
  assert.throws(
    () => majorToMinorExact("123.1", 0),
    /more than 0 fractional digits/
  );
  assert.throws(
    () => majorToMinorExact("1.2345", 3),
    /more than 3 fractional digits/
  );
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

test("preserves the dealt amount exactly and rounds only the calculated currency", () => {
  assert.deepEqual(calculateFxAmountsFromDealt({
    dealtAmount: "123",
    dealtCcyCode: "JPY",
    baseCcyCode: "JPY",
    quoteCcyCode: "BHD",
    baseFractionDigits: 0,
    quoteFractionDigits: 3,
    rate: "0.0067315"
  }), {
    baseAmountMinor: 123n,
    quoteAmountMinor: 828n
  });

  assert.deepEqual(calculateFxAmountsFromDealt({
    dealtAmount: "0.828",
    dealtCcyCode: "BHD",
    baseCcyCode: "JPY",
    quoteCcyCode: "BHD",
    baseFractionDigits: 0,
    quoteFractionDigits: 3,
    rate: "0.0067315"
  }), {
    baseAmountMinor: 123n,
    quoteAmountMinor: 828n
  });

  assert.deepEqual(calculateFxAmountsFromDealt({
    dealtAmount: "700000.125",
    dealtCcyCode: "BHD",
    baseCcyCode: "BHD",
    quoteCcyCode: "JPY",
    baseFractionDigits: 3,
    quoteFractionDigits: 0,
    rate: "150.005"
  }), {
    baseAmountMinor: 700000125n,
    quoteAmountMinor: 105003519n
  });

  assert.deepEqual(calculateFxAmountsFromDealt({
    dealtAmount: "105003519",
    dealtCcyCode: "JPY",
    baseCcyCode: "BHD",
    quoteCcyCode: "JPY",
    baseFractionDigits: 3,
    quoteFractionDigits: 0,
    rate: "150.005"
  }), {
    baseAmountMinor: 700000127n,
    quoteAmountMinor: 105003519n
  });
});

test("rejects sub-minor dealt amounts instead of silently changing the trade amount", () => {
  assert.throws(
    () => calculateFxAmountsFromDealt({
      dealtAmount: "1000.001",
      dealtCcyCode: "EUR",
      baseCcyCode: "EUR",
      quoteCcyCode: "USD",
      baseFractionDigits: 2,
      quoteFractionDigits: 2,
      rate: "1.12235"
    }),
    /more than 2 fractional digits/
  );

  assert.throws(
    () => calculateFxAmountsFromDealt({
      dealtAmount: "1123.061",
      dealtCcyCode: "USD",
      baseCcyCode: "EUR",
      quoteCcyCode: "USD",
      baseFractionDigits: 2,
      quoteFractionDigits: 2,
      rate: "1.12235"
    }),
    /more than 2 fractional digits/
  );
});

test("converts only safe minor-unit integers for the current SQLite API boundary", () => {
  assert.equal(
    minorToSafeInteger(BigInt(Number.MAX_SAFE_INTEGER)),
    Number.MAX_SAFE_INTEGER
  );
  assert.equal(minorToSafeInteger(112294n), 112294);
  assert.throws(
    () => minorToSafeInteger(BigInt(Number.MAX_SAFE_INTEGER) + 1n),
    /exceeds the safe/
  );
});
