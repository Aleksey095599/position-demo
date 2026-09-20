"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  CandleTimeframe
} = require("../domain/candle-timeframe");
const {
  createHistoricalCandlesQuery
} = require("./historical-candles-query");

const VALID_QUERY = Object.freeze({
  instrumentId: "CNYRUB_TOM",
  timeframe: CandleTimeframe.ONE_HOUR,
  from: "2026-09-10T09:00:00+03:00",
  till: "2026-09-11T19:00:00+03:00"
});

test("creates an immutable Historical Candles Query", () => {
  const query = createHistoricalCandlesQuery({
    ...VALID_QUERY,
    instrumentId: "  CNYRUB_TOM  "
  });

  assert.deepEqual(query, {
    instrumentId: "CNYRUB_TOM",
    timeframe: CandleTimeframe.ONE_HOUR,
    from: "2026-09-10T06:00:00.000Z",
    till: "2026-09-11T16:00:00.000Z"
  });
  assert.equal(Object.isFrozen(query), true);
  assert.throws(() => {
    query.instrumentId = "OTHER";
  }, TypeError);
});

test("accepts the one-minute storage Timeframe", () => {
  const query = createHistoricalCandlesQuery({
    ...VALID_QUERY,
    timeframe: CandleTimeframe.ONE_MINUTE
  });

  assert.equal(query.timeframe, CandleTimeframe.ONE_MINUTE);
});

test("requires a non-empty Instrument ID", () => {
  for (const instrumentId of [undefined, null, "", "   ", 42]) {
    assert.throws(
      () => createHistoricalCandlesQuery({ ...VALID_QUERY, instrumentId }),
      error => error?.code === "INVALID_HISTORICAL_CANDLES_QUERY"
    );
  }
});

test("requires a supported Candle Timeframe", () => {
  for (const timeframe of [undefined, null, "", "TWO_MINUTES", "one_hour", 60]) {
    assert.throws(
      () => createHistoricalCandlesQuery({ ...VALID_QUERY, timeframe }),
      error => error?.code === "INVALID_CANDLE_TIMEFRAME"
    );
  }
});

test("requires valid ISO 8601 period boundaries", () => {
  for (const field of ["from", "till"]) {
    for (const invalid of [undefined, null, "", "2026-09-10 09:00:00", "not-a-timestamp"]) {
      assert.throws(
        () => createHistoricalCandlesQuery({ ...VALID_QUERY, [field]: invalid }),
        error => error?.code === "INVALID_HISTORICAL_CANDLES_QUERY"
      );
    }
  }
});

test("requires From to be earlier than Till", () => {
  assert.throws(
    () => createHistoricalCandlesQuery({ ...VALID_QUERY, from: VALID_QUERY.till }),
    error => error?.code === "INVALID_HISTORICAL_CANDLES_QUERY"
  );
  assert.throws(
    () => createHistoricalCandlesQuery({ ...VALID_QUERY, till: VALID_QUERY.from }),
    error => error?.code === "INVALID_HISTORICAL_CANDLES_QUERY"
  );
});
