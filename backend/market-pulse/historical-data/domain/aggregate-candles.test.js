"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  createCandle
} = require("./candle");
const {
  CandleTimeframe
} = require("./candle-timeframe");
const {
  aggregateCandles
} = require("./aggregate-candles");

function minuteCandles(count = 15) {
  return Array.from({ length: count }, (_, index) => {
    const decimal = value => Number(value.toFixed(2)).toString();

    return createCandle({
      begin: `2026-09-15T07:${String(index).padStart(2, "0")}:00.000Z`,
      end: `2026-09-15T07:${String(index).padStart(2, "0")}:59.000Z`,
      open: decimal(10 + index / 10),
      high: decimal(10.1 + index / 10),
      low: decimal(9.9 + index / 10),
      close: decimal(10.05 + index / 10)
    });
  });
}

function candleAt(begin, end, values = {}) {
  return createCandle({
    begin,
    end,
    open: "10",
    high: "11",
    low: "9",
    close: "10.5",
    ...values
  });
}

function dailyCandle(date, values = {}) {
  return candleAt(
    `${date}T00:00:00+03:00`,
    `${date}T23:59:59+03:00`,
    values
  );
}

test("aggregates minute Candles into aligned five-minute Candles", () => {
  const candles = aggregateCandles({
    candles: minuteCandles(10),
    timeframe: CandleTimeframe.FIVE_MINUTES,
    from: "2026-09-15T07:00:00.000Z",
    till: "2026-09-15T07:10:00.000Z"
  });

  assert.deepEqual(candles, [
    {
      begin: "2026-09-15T07:00:00.000Z",
      end: "2026-09-15T07:04:59.000Z",
      open: "10",
      high: "10.5",
      low: "9.9",
      close: "10.45"
    },
    {
      begin: "2026-09-15T07:05:00.000Z",
      end: "2026-09-15T07:09:59.000Z",
      open: "10.5",
      high: "11",
      low: "10.4",
      close: "10.95"
    }
  ]);
  assert.equal(Object.isFrozen(candles), true);
});

test("aggregates minute Candles into one fifteen-minute Candle", () => {
  const candles = aggregateCandles({
    candles: minuteCandles(),
    timeframe: CandleTimeframe.FIFTEEN_MINUTES,
    from: "2026-09-15T07:00:00.000Z",
    till: "2026-09-15T07:15:00.000Z"
  });

  assert.deepEqual(candles, [{
    begin: "2026-09-15T07:00:00.000Z",
    end: "2026-09-15T07:14:59.000Z",
    open: "10",
    high: "11.5",
    low: "9.9",
    close: "11.45"
  }]);
});

test("aligns one-hour Candles to Moscow clock hours", () => {
  const candles = aggregateCandles({
    candles: [
      candleAt(
        "2026-09-15T10:05:00+03:00",
        "2026-09-15T10:05:59+03:00",
        { open: "10", high: "10.5", low: "9.9", close: "10.2" }
      ),
      candleAt(
        "2026-09-15T10:55:00+03:00",
        "2026-09-15T10:55:59+03:00",
        { open: "10.2", high: "11", low: "10.1", close: "10.8" }
      )
    ],
    timeframe: CandleTimeframe.ONE_HOUR,
    from: "2026-09-15T10:00:00+03:00",
    till: "2026-09-15T11:00:00+03:00"
  });

  assert.deepEqual(candles, [{
    begin: "2026-09-15T07:00:00.000Z",
    end: "2026-09-15T07:59:59.000Z",
    open: "10",
    high: "11",
    low: "9.9",
    close: "10.8"
  }]);
});

test("aligns four-hour Candles to 00/04/08/12/16/20 Moscow boundaries", () => {
  const candles = aggregateCandles({
    candles: [
      candleAt(
        "2026-09-15T10:30:00+03:00",
        "2026-09-15T10:30:59+03:00",
        { open: "10", high: "12", low: "9", close: "11" }
      ),
      candleAt(
        "2026-09-15T11:45:00+03:00",
        "2026-09-15T11:45:59+03:00",
        { open: "11", high: "13", low: "10", close: "12" }
      ),
      candleAt(
        "2026-09-15T12:00:00+03:00",
        "2026-09-15T12:00:59+03:00",
        { open: "20", high: "21", low: "19", close: "20.5" }
      )
    ],
    timeframe: CandleTimeframe.FOUR_HOURS,
    from: "2026-09-15T08:00:00+03:00",
    till: "2026-09-15T16:00:00+03:00"
  });

  assert.deepEqual(candles, [
    {
      begin: "2026-09-15T05:00:00.000Z",
      end: "2026-09-15T08:59:59.000Z",
      open: "10",
      high: "13",
      low: "9",
      close: "12"
    },
    {
      begin: "2026-09-15T09:00:00.000Z",
      end: "2026-09-15T12:59:59.000Z",
      open: "20",
      high: "21",
      low: "19",
      close: "20.5"
    }
  ]);
});

test("aggregates daily Candles into Moscow weeks starting on Monday", () => {
  const candles = aggregateCandles({
    candles: [
      dailyCandle("2026-09-14", {
        open: "10",
        high: "11",
        low: "9.5",
        close: "10.5"
      }),
      dailyCandle("2026-09-16", {
        open: "10.5",
        high: "12",
        low: "10",
        close: "11.5"
      }),
      dailyCandle("2026-09-18", {
        open: "11.5",
        high: "11.8",
        low: "8.5",
        close: "9"
      })
    ],
    baseTimeframe: CandleTimeframe.ONE_DAY,
    timeframe: CandleTimeframe.ONE_WEEK,
    from: "2026-09-14T00:00:00+03:00",
    till: "2026-09-21T00:00:00+03:00"
  });

  assert.deepEqual(candles, [{
    begin: "2026-09-13T21:00:00.000Z",
    end: "2026-09-20T20:59:59.000Z",
    open: "10",
    high: "12",
    low: "8.5",
    close: "9"
  }]);
});

test("aggregates daily Candles by Moscow calendar month without empty synthetic months", () => {
  const candles = aggregateCandles({
    candles: [
      dailyCandle("2026-09-01", {
        open: "10",
        high: "11",
        low: "9",
        close: "10.5"
      }),
      dailyCandle("2026-09-30", {
        open: "10.5",
        high: "13",
        low: "10",
        close: "12"
      }),
      dailyCandle("2026-11-03", {
        open: "20",
        high: "22",
        low: "19",
        close: "21"
      })
    ],
    baseTimeframe: CandleTimeframe.ONE_DAY,
    timeframe: CandleTimeframe.ONE_MONTH,
    from: "2026-09-01T00:00:00+03:00",
    till: "2026-12-01T00:00:00+03:00"
  });

  assert.deepEqual(candles, [
    {
      begin: "2026-08-31T21:00:00.000Z",
      end: "2026-09-30T20:59:59.000Z",
      open: "10",
      high: "13",
      low: "9",
      close: "12"
    },
    {
      begin: "2026-10-31T21:00:00.000Z",
      end: "2026-11-30T20:59:59.000Z",
      open: "20",
      high: "22",
      low: "19",
      close: "21"
    }
  ]);
});

test("does not create a target Candle outside the requested complete buckets", () => {
  const candles = aggregateCandles({
    candles: minuteCandles(10),
    timeframe: CandleTimeframe.FIVE_MINUTES,
    from: "2026-09-15T07:02:00.000Z",
    till: "2026-09-15T07:08:00.000Z"
  });

  assert.deepEqual(candles, []);
});

test("does not include a calendar bucket when a requested period cuts its edge", () => {
  const candles = aggregateCandles({
    candles: [dailyCandle("2026-09-16")],
    baseTimeframe: CandleTimeframe.ONE_DAY,
    timeframe: CandleTimeframe.ONE_WEEK,
    from: "2026-09-15T00:00:00+03:00",
    till: "2026-09-21T00:00:00+03:00"
  });

  assert.deepEqual(candles, []);
});

test("rejects unsupported base and target Timeframe pairs", () => {
  assert.throws(
    () => aggregateCandles({
      candles: [],
      timeframe: CandleTimeframe.ONE_WEEK,
      from: "2026-09-15T07:00:00.000Z",
      till: "2026-09-15T08:00:00.000Z"
    }),
    error => error?.code === "UNSUPPORTED_CANDLE_AGGREGATION_TIMEFRAME"
  );
  assert.throws(
    () => aggregateCandles({
      candles: [],
      baseTimeframe: CandleTimeframe.ONE_DAY,
      timeframe: CandleTimeframe.ONE_HOUR,
      from: "2026-09-15T07:00:00.000Z",
      till: "2026-09-15T08:00:00.000Z"
    }),
    error => error?.code === "UNSUPPORTED_CANDLE_AGGREGATION_TIMEFRAME"
  );
});
