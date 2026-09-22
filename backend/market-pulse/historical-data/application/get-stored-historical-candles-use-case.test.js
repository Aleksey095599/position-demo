"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  CandleTimeframe
} = require("../domain/candle-timeframe");
const {
  createCandle
} = require("../domain/candle");
const {
  GetStoredHistoricalCandlesUseCase
} = require("./get-stored-historical-candles-use-case");

function repositoryReturning(candles, onFind = () => {}, coverageComplete = true) {
  return {
    findByPeriod(query) {
      onFind(query);
      return candles;
    },
    findLatest() {},
    upsertLoadedRange() {},
    findLoadedRanges() {
      return [];
    },
    coversLoadedRange() {
      return coverageComplete;
    }
  };
}

function minuteCandle(begin, values = {}) {
  const beginTimestamp = Date.parse(begin);

  return createCandle({
    begin,
    end: new Date(beginTimestamp + 60_000 - 1_000).toISOString(),
    open: values.open ?? "12.60",
    high: values.high ?? "12.70",
    low: values.low ?? "12.50",
    close: values.close ?? "12.65"
  });
}

function dayCandle(begin, values = {}) {
  const beginTimestamp = Date.parse(begin);

  return createCandle({
    begin,
    end: new Date(beginTimestamp + 24 * 60 * 60_000 - 1_000).toISOString(),
    open: values.open ?? "12.60",
    high: values.high ?? "12.70",
    low: values.low ?? "12.50",
    close: values.close ?? "12.65"
  });
}

test("reads a native minute timeframe from stored minute Candles", async () => {
  const storedCandles = [minuteCandle("2026-09-10T06:00:00.000Z")];
  let receivedQuery = null;
  const useCase = new GetStoredHistoricalCandlesUseCase({
    marketSourceCandleRepository: repositoryReturning(
      storedCandles,
      query => {
        receivedQuery = query;
      }
    )
  });

  const result = await useCase.execute({
    instrumentId: " CNYRUB_TOM ",
    timeframe: CandleTimeframe.ONE_MINUTE,
    from: "2026-09-10T09:00:00+03:00",
    till: "2026-09-10T09:05:00+03:00"
  });

  assert.deepEqual(receivedQuery, {
    instrumentId: "CNYRUB_TOM",
    timeframe: CandleTimeframe.ONE_MINUTE,
    from: "2026-09-10T06:00:00.000Z",
    till: "2026-09-10T06:05:00.000Z"
  });
  assert.deepEqual(result, {
    instrumentId: "CNYRUB_TOM",
    timeframe: CandleTimeframe.ONE_MINUTE,
    from: "2026-09-10T06:00:00.000Z",
    till: "2026-09-10T06:05:00.000Z",
    baseTimeframe: CandleTimeframe.ONE_MINUTE,
    coverageComplete: true,
    candles: storedCandles
  });
  assert.notEqual(result.candles, storedCandles);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.candles), true);
});

for (const timeframe of [
  CandleTimeframe.FIVE_MINUTES,
  CandleTimeframe.FIFTEEN_MINUTES,
  CandleTimeframe.ONE_HOUR,
  CandleTimeframe.FOUR_HOURS
]) {
  test(`derives ${timeframe} from stored minute Candles`, async () => {
    const storedCandles = [
      minuteCandle("2026-09-10T05:00:00.000Z", {
        open: "12.60",
        high: "12.70",
        low: "12.55",
        close: "12.65"
      }),
      minuteCandle("2026-09-10T05:01:00.000Z", {
        open: "12.65",
        high: "12.80",
        low: "12.50",
        close: "12.75"
      })
    ];
    let findCount = 0;
    let receivedQuery = null;
    const useCase = new GetStoredHistoricalCandlesUseCase({
      marketSourceCandleRepository: repositoryReturning(storedCandles, query => {
        findCount += 1;
        receivedQuery = query;
      })
    });

    const result = await useCase.execute({
      instrumentId: "CNYRUB_TOM",
      timeframe,
      from: "2026-09-10T00:00:00+03:00",
      till: "2026-09-11T00:00:00+03:00"
    });

    assert.equal(findCount, 1);
    assert.equal(receivedQuery.timeframe, CandleTimeframe.ONE_MINUTE);
    assert.equal(result.timeframe, timeframe);
    assert.equal(result.baseTimeframe, CandleTimeframe.ONE_MINUTE);
    assert.equal(result.candles.length, 1);
    assert.deepEqual(
      {
        open: result.candles[0].open,
        high: result.candles[0].high,
        low: result.candles[0].low,
        close: result.candles[0].close
      },
      { open: "12.6", high: "12.8", low: "12.5", close: "12.75" }
    );
    assert.equal(Object.isFrozen(result.candles), true);
  });
}

test("reads a native day timeframe from stored day Candles", async () => {
  const storedCandles = [dayCandle("2026-09-13T21:00:00.000Z")];
  let receivedQuery = null;
  const useCase = new GetStoredHistoricalCandlesUseCase({
    marketSourceCandleRepository: repositoryReturning(
      storedCandles,
      query => {
        receivedQuery = query;
      }
    )
  });

  const result = await useCase.execute({
    instrumentId: "CNYRUB_TOM",
    timeframe: CandleTimeframe.ONE_DAY,
    from: "2026-09-14T00:00:00+03:00",
    till: "2026-09-15T00:00:00+03:00"
  });

  assert.equal(receivedQuery.timeframe, CandleTimeframe.ONE_DAY);
  assert.equal(result.baseTimeframe, CandleTimeframe.ONE_DAY);
  assert.deepEqual(result.candles, storedCandles);
});

for (const timeframe of [
  CandleTimeframe.ONE_WEEK,
  CandleTimeframe.ONE_MONTH
]) {
  test(`derives ${timeframe} from stored day Candles`, async () => {
    const storedCandles = [
      dayCandle("2026-09-13T21:00:00.000Z", {
        open: "12.60",
        high: "12.70",
        low: "12.55",
        close: "12.65"
      }),
      dayCandle("2026-09-14T21:00:00.000Z", {
        open: "12.65",
        high: "12.80",
        low: "12.50",
        close: "12.75"
      })
    ];
    let findCount = 0;
    const useCase = new GetStoredHistoricalCandlesUseCase({
      marketSourceCandleRepository: repositoryReturning(storedCandles, query => {
        findCount += 1;
        assert.equal(query.timeframe, CandleTimeframe.ONE_DAY);
      })
    });
    const period = timeframe === CandleTimeframe.ONE_WEEK
      ? {
        from: "2026-09-14T00:00:00+03:00",
        till: "2026-09-21T00:00:00+03:00"
      }
      : {
        from: "2026-09-01T00:00:00+03:00",
        till: "2026-10-01T00:00:00+03:00"
      };

    const result = await useCase.execute({
      instrumentId: "CNYRUB_TOM",
      timeframe,
      ...period
    });

    assert.equal(findCount, 1);
    assert.equal(result.baseTimeframe, CandleTimeframe.ONE_DAY);
    assert.equal(result.candles.length, 1);
    assert.deepEqual(
      {
        open: result.candles[0].open,
        high: result.candles[0].high,
        low: result.candles[0].low,
        close: result.candles[0].close
      },
      { open: "12.6", high: "12.8", low: "12.5", close: "12.75" }
    );
  });
}

test("rejects an invalid repository", () => {
  assert.throws(
    () => new GetStoredHistoricalCandlesUseCase({
      marketSourceCandleRepository: {}
    }),
    error => error?.code === "INVALID_MARKET_SOURCE_CANDLE_REPOSITORY"
  );
});

test("reports an incompletely loaded anchor range without hiding stored Candles", async () => {
  const storedCandles = [minuteCandle("2026-09-10T06:00:00.000Z")];
  const useCase = new GetStoredHistoricalCandlesUseCase({
    marketSourceCandleRepository: repositoryReturning(
      storedCandles,
      () => {},
      false
    )
  });

  const result = await useCase.execute({
    instrumentId: "CNYRUB_TOM",
    timeframe: CandleTimeframe.FIVE_MINUTES,
    from: "2026-09-10T09:00:00+03:00",
    till: "2026-09-10T09:05:00+03:00"
  });

  assert.equal(result.coverageComplete, false);
  assert.equal(result.candles.length, 1);
});

test("does not read storage when the query is invalid", async () => {
  let repositoryCalled = false;
  const useCase = new GetStoredHistoricalCandlesUseCase({
    marketSourceCandleRepository: repositoryReturning([], () => {
      repositoryCalled = true;
    })
  });

  await assert.rejects(
    useCase.execute({
      instrumentId: "",
      timeframe: CandleTimeframe.ONE_MINUTE,
      from: "2026-09-10T09:00:00+03:00",
      till: "2026-09-10T09:05:00+03:00"
    }),
    error => error?.code === "INVALID_HISTORICAL_CANDLES_QUERY"
  );
  assert.equal(repositoryCalled, false);
});

test("rejects a repository result that is not a Candle collection", async () => {
  const useCase = new GetStoredHistoricalCandlesUseCase({
    marketSourceCandleRepository: repositoryReturning(null)
  });

  await assert.rejects(
    useCase.execute({
      instrumentId: "CNYRUB_TOM",
      timeframe: CandleTimeframe.ONE_DAY,
      from: "2026-09-14T00:00:00+03:00",
      till: "2026-09-15T00:00:00+03:00"
    }),
    error => error?.code === "INVALID_MARKET_SOURCE_CANDLE_REPOSITORY_RESULT"
  );
});
