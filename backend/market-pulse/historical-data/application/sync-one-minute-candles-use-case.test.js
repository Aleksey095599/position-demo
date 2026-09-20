"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  createCandle
} = require("../domain/candle");
const {
  CandleTimeframe
} = require("../domain/candle-timeframe");
const {
  SyncOneMinuteCandlesUseCase
} = require("./sync-one-minute-candles-use-case");

const INSTRUMENT_ID = "CNYRUB_TOM";

function minuteCandle(minute) {
  const renderedMinute = String(minute).padStart(2, "0");
  const open = String(100 + minute);
  const high = String(102 + minute);
  const low = String(99 + minute);
  const close = String(101 + minute);

  return createCandle({
    begin: `2026-09-15T07:${renderedMinute}:00.000Z`,
    end: `2026-09-15T07:${renderedMinute}:59.000Z`,
    open,
    high,
    low,
    close
  });
}

function repository(overrides = {}) {
  return {
    upsertAll() {
      return 0;
    },
    findByPeriod() {
      return [];
    },
    findLatest() {
      return null;
    },
    ...overrides
  };
}

function query(overrides = {}) {
  return {
    instrumentId: ` ${INSTRUMENT_ID} `,
    timeframe: CandleTimeframe.FIVE_MINUTES,
    from: "2026-09-15T07:00:00.000Z",
    till: "2026-09-15T07:08:00.000Z",
    ...overrides
  };
}

test("loads one-minute Candles once, stores only closed minutes and returns complete five-minute buckets", async () => {
  const sourceResult = Array.from({ length: 7 }, (_, minute) => (
    minuteCandle(minute)
  ));
  let sourceCallCount = 0;
  let receivedSourceQuery;
  let receivedUpsert;
  const useCase = new SyncOneMinuteCandlesUseCase({
    historicalMarketDataSource: {
      async loadCandles(receivedQuery) {
        sourceCallCount += 1;
        receivedSourceQuery = receivedQuery;
        return sourceResult;
      }
    },
    marketSourceCandleRepository: repository({
      upsertAll(command) {
        receivedUpsert = command;
        return command.candles.length;
      }
    }),
    now: () => Date.parse("2026-09-15T07:06:30.000Z")
  });

  const result = await useCase.execute(query());

  assert.equal(sourceCallCount, 1);
  assert.deepEqual(receivedSourceQuery, {
    instrumentId: INSTRUMENT_ID,
    timeframe: CandleTimeframe.ONE_MINUTE,
    from: "2026-09-15T07:00:00.000Z",
    till: "2026-09-15T07:06:00.000Z"
  });
  assert.equal(Object.isFrozen(receivedSourceQuery), true);
  assert.deepEqual(receivedUpsert, {
    instrumentId: INSTRUMENT_ID,
    timeframe: CandleTimeframe.ONE_MINUTE,
    candles: sourceResult.slice(0, 6),
    dataSource: "MOEX_ISS",
    loadedAt: "2026-09-15T07:06:30.000Z"
  });
  assert.deepEqual(result, {
    instrumentId: INSTRUMENT_ID,
    timeframe: CandleTimeframe.FIVE_MINUTES,
    from: "2026-09-15T07:00:00.000Z",
    till: "2026-09-15T07:08:00.000Z",
    storedMinuteCandleCount: 6,
    candles: [createCandle({
      begin: "2026-09-15T07:00:00.000Z",
      end: "2026-09-15T07:04:59.000Z",
      open: "100",
      high: "106",
      low: "99",
      close: "105"
    })]
  });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.candles), true);
});

test("builds fifteen-minute Candles from the same stored one-minute collection", async () => {
  const sourceResult = Array.from({ length: 31 }, (_, minute) => (
    minuteCandle(minute)
  ));
  let storedCandles;
  const useCase = new SyncOneMinuteCandlesUseCase({
    historicalMarketDataSource: {
      async loadCandles() {
        return sourceResult;
      }
    },
    marketSourceCandleRepository: repository({
      upsertAll(command) {
        storedCandles = command.candles;
        return command.candles.length;
      }
    }),
    now: () => Date.parse("2026-09-15T07:40:00.000Z")
  });

  const result = await useCase.execute(query({
    timeframe: CandleTimeframe.FIFTEEN_MINUTES,
    till: "2026-09-15T07:31:00.000Z"
  }));

  assert.equal(storedCandles.length, 31);
  assert.equal(result.storedMinuteCandleCount, 31);
  assert.deepEqual(
    result.candles.map(candle => candle.begin),
    ["2026-09-15T07:00:00.000Z", "2026-09-15T07:15:00.000Z"]
  );
  assert.equal(result.candles[1].close, "130");
});

test("does not call external dependencies for a range without a closed minute", async () => {
  let sourceCalled = false;
  let repositoryCalled = false;
  const useCase = new SyncOneMinuteCandlesUseCase({
    historicalMarketDataSource: {
      async loadCandles() {
        sourceCalled = true;
        return [];
      }
    },
    marketSourceCandleRepository: repository({
      upsertAll() {
        repositoryCalled = true;
        return 0;
      }
    }),
    now: () => Date.parse("2026-09-15T07:05:59.999Z")
  });

  const result = await useCase.execute(query({
    from: "2026-09-15T07:10:00.000Z",
    till: "2026-09-15T07:20:00.000Z"
  }));

  assert.equal(sourceCalled, false);
  assert.equal(repositoryCalled, false);
  assert.equal(result.storedMinuteCandleCount, 0);
  assert.deepEqual(result.candles, []);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.candles), true);
});

test("rejects unsupported target Timeframes before loading or storing Candles", async () => {
  let sourceCalled = false;
  let repositoryCalled = false;
  const useCase = new SyncOneMinuteCandlesUseCase({
    historicalMarketDataSource: {
      async loadCandles() {
        sourceCalled = true;
        return [];
      }
    },
    marketSourceCandleRepository: repository({
      upsertAll() {
        repositoryCalled = true;
        return 0;
      }
    })
  });

  await assert.rejects(
    useCase.execute(query({ timeframe: CandleTimeframe.ONE_HOUR })),
    error => error?.code === "UNSUPPORTED_HISTORICAL_SYNC_TIMEFRAME"
  );
  assert.equal(sourceCalled, false);
  assert.equal(repositoryCalled, false);
});

test("rejects invalid dependencies and a non-collection source result", async () => {
  assert.throws(
    () => new SyncOneMinuteCandlesUseCase({
      historicalMarketDataSource: {},
      marketSourceCandleRepository: repository()
    }),
    error => error?.code === "INVALID_HISTORICAL_MARKET_DATA_SOURCE"
  );
  assert.throws(
    () => new SyncOneMinuteCandlesUseCase({
      historicalMarketDataSource: { async loadCandles() { return []; } },
      marketSourceCandleRepository: {}
    }),
    error => error?.code === "INVALID_MARKET_SOURCE_CANDLE_REPOSITORY"
  );

  const useCase = new SyncOneMinuteCandlesUseCase({
    historicalMarketDataSource: {
      async loadCandles() {
        return null;
      }
    },
    marketSourceCandleRepository: repository(),
    now: () => Date.parse("2026-09-15T07:40:00.000Z")
  });

  await assert.rejects(
    useCase.execute(query()),
    error => error?.code === "INVALID_HISTORICAL_MARKET_DATA_SOURCE_RESULT"
  );
});
