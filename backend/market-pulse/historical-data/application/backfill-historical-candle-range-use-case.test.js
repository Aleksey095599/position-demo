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
  BackfillHistoricalCandleRangeUseCase
} = require("./backfill-historical-candle-range-use-case");

function minuteCandle(minute, overrides = {}) {
  const renderedMinute = String(minute).padStart(2, "0");

  return createCandle({
    begin: `2026-09-15T07:${renderedMinute}:00.000Z`,
    end: `2026-09-15T07:${renderedMinute}:59.000Z`,
    open: "12.6",
    high: "12.7",
    low: "12.5",
    close: "12.65",
    ...overrides
  });
}

function repository(overrides = {}) {
  return {
    findByPeriod() {
      return [];
    },
    findLatest() {
      return null;
    },
    upsertLoadedRange() {
      return 0;
    },
    findLoadedRanges() {
      return [];
    },
    coversLoadedRange() {
      return false;
    },
    ...overrides
  };
}

const QUERY = Object.freeze({
  instrumentId: " CNYRUB_TOM ",
  timeframe: CandleTimeframe.ONE_MINUTE,
  from: "2026-09-14T21:00:00.000Z",
  till: "2026-09-15T21:00:00.000Z"
});

test("loads one anchor range page by page, paces requests and stores it atomically", async () => {
  const first = minuteCandle(0);
  const second = minuteCandle(1);
  const tillBoundary = minuteCandle(2, {
    begin: "2026-09-15T21:00:00.000Z",
    end: "2026-09-15T21:00:59.000Z"
  });
  const requests = [];
  const waits = [];
  let storedCommand;
  const useCase = new BackfillHistoricalCandleRangeUseCase({
    historicalMarketDataSource: {
      async loadCandlePage(query, options) {
        requests.push({ query, options });

        return options.start === 0
          ? { candles: [first, second], hasMore: true, nextStart: 500 }
          : { candles: [second, tillBoundary], hasMore: false, nextStart: null };
      }
    },
    marketSourceCandleRepository: repository({
      upsertLoadedRange(command) {
        storedCommand = command;
        return command.candles.length;
      }
    }),
    minimumRequestIntervalMs: 2000,
    sleep(milliseconds) {
      waits.push(milliseconds);
    },
    now: () => Date.parse("2026-09-17T09:00:00.000Z")
  });

  const result = await useCase.execute(QUERY);

  assert.deepEqual(requests.map(request => request.options), [
    { start: 0 },
    { start: 500 }
  ]);
  assert.deepEqual(waits, [2000]);
  assert.deepEqual(storedCommand, {
    instrumentId: "CNYRUB_TOM",
    timeframe: CandleTimeframe.ONE_MINUTE,
    from: "2026-09-14T21:00:00.000Z",
    till: "2026-09-15T21:00:00.000Z",
    candles: [first, second],
    dataSource: "MOEX_ISS",
    loadedAt: "2026-09-17T09:00:00.000Z"
  });
  assert.deepEqual(result, {
    instrumentId: "CNYRUB_TOM",
    timeframe: CandleTimeframe.ONE_MINUTE,
    from: "2026-09-14T21:00:00.000Z",
    till: "2026-09-15T21:00:00.000Z",
    skipped: false,
    pageCount: 2,
    fetchedCandleCount: 2,
    storedCandleCount: 2
  });
  assert.equal(Object.isFrozen(storedCommand.candles), true);
  assert.equal(Object.isFrozen(result), true);
});

test("records a successfully loaded empty range", async () => {
  let storedCommand;
  const useCase = new BackfillHistoricalCandleRangeUseCase({
    historicalMarketDataSource: {
      async loadCandlePage() {
        return { candles: [], hasMore: false, nextStart: null };
      }
    },
    marketSourceCandleRepository: repository({
      upsertLoadedRange(command) {
        storedCommand = command;
        return 0;
      }
    }),
    minimumRequestIntervalMs: 0,
    now: () => Date.parse("2026-09-17T09:00:00.000Z")
  });

  const result = await useCase.execute(QUERY);

  assert.deepEqual(storedCommand.candles, []);
  assert.equal(result.fetchedCandleCount, 0);
  assert.equal(result.storedCandleCount, 0);
  assert.equal(result.skipped, false);
});

test("skips a range already covered by a successful load", async () => {
  let sourceCalled = false;
  let storeCalled = false;
  const useCase = new BackfillHistoricalCandleRangeUseCase({
    historicalMarketDataSource: {
      async loadCandlePage() {
        sourceCalled = true;
        return { candles: [], hasMore: false, nextStart: null };
      }
    },
    marketSourceCandleRepository: repository({
      coversLoadedRange() {
        return true;
      },
      upsertLoadedRange() {
        storeCalled = true;
      }
    })
  });

  const result = await useCase.execute(QUERY);

  assert.equal(sourceCalled, false);
  assert.equal(storeCalled, false);
  assert.equal(result.skipped, true);
  assert.equal(result.pageCount, 0);
});

test("accepts a one-day anchor range", async () => {
  let receivedQuery;
  const useCase = new BackfillHistoricalCandleRangeUseCase({
    historicalMarketDataSource: {
      async loadCandlePage(query) {
        receivedQuery = query;
        return { candles: [], hasMore: false, nextStart: null };
      }
    },
    marketSourceCandleRepository: repository(),
    minimumRequestIntervalMs: 0,
    now: () => Date.parse("2026-09-17T09:00:00.000Z")
  });

  await useCase.execute({
    ...QUERY,
    timeframe: CandleTimeframe.ONE_DAY
  });

  assert.equal(receivedQuery.timeframe, CandleTimeframe.ONE_DAY);
});

test("rejects derived Timeframes and non-advancing source pages", async () => {
  const derivedUseCase = new BackfillHistoricalCandleRangeUseCase({
    historicalMarketDataSource: {
      async loadCandlePage() {
        return { candles: [], hasMore: false, nextStart: null };
      }
    },
    marketSourceCandleRepository: repository()
  });

  await assert.rejects(
    derivedUseCase.execute({
      ...QUERY,
      timeframe: CandleTimeframe.FIVE_MINUTES
    }),
    error => error?.code === "UNSUPPORTED_HISTORICAL_CANDLE_BACKFILL_TIMEFRAME"
  );

  const invalidPageUseCase = new BackfillHistoricalCandleRangeUseCase({
    historicalMarketDataSource: {
      async loadCandlePage() {
        return { candles: [], hasMore: true, nextStart: 0 };
      }
    },
    marketSourceCandleRepository: repository(),
    minimumRequestIntervalMs: 0
  });

  await assert.rejects(
    invalidPageUseCase.execute(QUERY),
    error => error?.code === "INVALID_HISTORICAL_CANDLE_BACKFILL_PAGE"
  );
});

test("stops an unexpectedly endless source pagination before persisting", async () => {
  let requestCount = 0;
  let storeCalled = false;
  const useCase = new BackfillHistoricalCandleRangeUseCase({
    historicalMarketDataSource: {
      async loadCandlePage(_query, { start }) {
        requestCount += 1;
        return {
          candles: [],
          hasMore: true,
          nextStart: start + 500
        };
      }
    },
    marketSourceCandleRepository: repository({
      upsertLoadedRange() {
        storeCalled = true;
      }
    }),
    minimumRequestIntervalMs: 0,
    maxPageCount: 2
  });

  await assert.rejects(
    useCase.execute(QUERY),
    error => error?.code === "HISTORICAL_CANDLE_BACKFILL_PAGE_LIMIT_REACHED"
  );
  assert.equal(requestCount, 2);
  assert.equal(storeCalled, false);
});

test("validates paged source, repository capabilities and request interval", () => {
  assert.throws(
    () => new BackfillHistoricalCandleRangeUseCase({
      historicalMarketDataSource: {},
      marketSourceCandleRepository: repository()
    }),
    error => error?.code === "INVALID_PAGED_HISTORICAL_MARKET_DATA_SOURCE"
  );
  assert.throws(
    () => new BackfillHistoricalCandleRangeUseCase({
      historicalMarketDataSource: { async loadCandlePage() {} },
      marketSourceCandleRepository: {
        findByPeriod() {},
        findLatest() {}
      }
    }),
    error => error?.code === "INVALID_MARKET_CANDLE_LOAD_RANGE_REPOSITORY"
  );
  assert.throws(
    () => new BackfillHistoricalCandleRangeUseCase({
      historicalMarketDataSource: { async loadCandlePage() {} },
      marketSourceCandleRepository: repository(),
      minimumRequestIntervalMs: -1
    }),
    error => error?.code === "INVALID_HISTORICAL_CANDLE_BACKFILL_CONFIGURATION"
  );
  assert.throws(
    () => new BackfillHistoricalCandleRangeUseCase({
      historicalMarketDataSource: { async loadCandlePage() {} },
      marketSourceCandleRepository: repository(),
      maxPageCount: 0
    }),
    error => error?.code === "INVALID_HISTORICAL_CANDLE_BACKFILL_CONFIGURATION"
  );
});


test("rejects intraday loads for both source timeframes before reading the source or writing", async () => {
  const useCase = new BackfillHistoricalCandleRangeUseCase({
    historicalMarketDataSource:{loadCandlePage(){assert.fail("Intraday source request");}},
    marketSourceCandleRepository:repository({upsertLoadedRange(){assert.fail("Intraday write");}})
  });
  for (const timeframe of [CandleTimeframe.ONE_MINUTE,CandleTimeframe.ONE_DAY]) {
    for (const bounds of [
      {from:"2026-09-15T07:00:00.000Z",till:"2026-09-15T08:00:00.000Z"},
      {from:"2026-09-15T00:00:00.000Z",till:"2026-09-16T00:00:00.000Z"}
    ]) await assert.rejects(useCase.execute({...QUERY,...bounds,timeframe}),error=>error.code==="INVALID_SOURCE_CANDLE_CALENDAR_REQUEST");
  }
});
