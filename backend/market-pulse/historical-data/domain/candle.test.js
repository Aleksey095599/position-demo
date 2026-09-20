"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createCandle } = require("./candle");

const VALID_CANDLE = Object.freeze({
  begin: "2026-09-10T09:00:00+03:00",
  end: "2026-09-10T09:59:59+03:00",
  open: "12.6320",
  high: "12.6450",
  low: "12.6200",
  close: "12.6400"
});

test("creates an immutable Candle with normalized timestamps and decimal prices", () => {
  const candle = createCandle(VALID_CANDLE);

  assert.deepEqual(candle, {
    begin: "2026-09-10T06:00:00.000Z",
    end: "2026-09-10T06:59:59.000Z",
    open: "12.632",
    high: "12.645",
    low: "12.62",
    close: "12.64"
  });
  assert.equal(Object.isFrozen(candle), true);
  assert.throws(() => {
    candle.close = "12.63";
  }, TypeError);
});

test("requires valid ISO 8601 timestamps with Begin earlier than End", () => {
  for (const invalid of [undefined, null, "", "2026-09-10 09:00:00", "not-a-timestamp"]) {
    assert.throws(
      () => createCandle({ ...VALID_CANDLE, begin: invalid }),
      error => error?.code === "INVALID_CANDLE"
    );
  }

  assert.throws(
    () => createCandle({ ...VALID_CANDLE, begin: VALID_CANDLE.end }),
    error => error?.code === "INVALID_CANDLE"
  );
  assert.throws(
    () => createCandle({ ...VALID_CANDLE, end: VALID_CANDLE.begin }),
    error => error?.code === "INVALID_CANDLE"
  );
});

test("requires every OHLC price to be a positive decimal number", () => {
  for (const field of ["open", "high", "low", "close"]) {
    for (const invalid of [undefined, null, "", "invalid", "0", "-1", Infinity]) {
      assert.throws(
        () => createCandle({ ...VALID_CANDLE, [field]: invalid }),
        error => error?.code === "INVALID_CANDLE"
      );
    }
  }
});

test("requires Low not to exceed High", () => {
  assert.throws(
    () => createCandle({
      ...VALID_CANDLE,
      open: "12.64",
      high: "12.63",
      low: "12.64",
      close: "12.64"
    }),
    error => error?.code === "INVALID_CANDLE"
  );
});

test("requires Open to be within the Candle range", () => {
  for (const open of ["12.61", "12.65"]) {
    assert.throws(
      () => createCandle({ ...VALID_CANDLE, open }),
      error => error?.code === "INVALID_CANDLE"
    );
  }
});

test("requires Close to be within the Candle range", () => {
  for (const close of ["12.61", "12.65"]) {
    assert.throws(
      () => createCandle({ ...VALID_CANDLE, close }),
      error => error?.code === "INVALID_CANDLE"
    );
  }
});
