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
  GetHistoricalCandlesUseCase
} = require("./get-historical-candles-use-case");

const VALID_QUERY = Object.freeze({
  instrumentId: " CNYRUB_TOM ",
  timeframe: CandleTimeframe.ONE_HOUR,
  from: "2026-09-10T09:00:00+03:00",
  till: "2026-09-11T19:00:00+03:00"
});

const CANDLE = createCandle({
  begin: "2026-09-10T09:00:00+03:00",
  end: "2026-09-10T09:59:59+03:00",
  open: "12.6320",
  high: "12.6450",
  low: "12.6200",
  close: "12.6400"
});

test("loads Candles using a normalized Historical Candles Query", async () => {
  let receivedQuery = null;
  const sourceResult = [CANDLE];
  const useCase = new GetHistoricalCandlesUseCase({
    historicalMarketDataSource: {
      async loadCandles(query) {
        receivedQuery = query;
        return sourceResult;
      }
    }
  });

  const result = await useCase.execute(VALID_QUERY);

  assert.deepEqual(receivedQuery, {
    instrumentId: "CNYRUB_TOM",
    timeframe: CandleTimeframe.ONE_HOUR,
    from: "2026-09-10T06:00:00.000Z",
    till: "2026-09-11T16:00:00.000Z"
  });
  assert.equal(Object.isFrozen(receivedQuery), true);
  assert.deepEqual(result, [CANDLE]);
  assert.notEqual(result, sourceResult);
  assert.equal(Object.isFrozen(result), true);
});

test("rejects an invalid Historical Market Data Source", () => {
  assert.throws(
    () => new GetHistoricalCandlesUseCase({ historicalMarketDataSource: {} }),
    error => error?.code === "INVALID_HISTORICAL_MARKET_DATA_SOURCE"
  );
});

test("does not call the source when the query is invalid", async () => {
  let sourceCalled = false;
  const useCase = new GetHistoricalCandlesUseCase({
    historicalMarketDataSource: {
      async loadCandles() {
        sourceCalled = true;
        return [];
      }
    }
  });

  await assert.rejects(
    useCase.execute({ ...VALID_QUERY, instrumentId: "" }),
    error => error?.code === "INVALID_HISTORICAL_CANDLES_QUERY"
  );
  assert.equal(sourceCalled, false);
});

test("rejects a source result that is not a Candle collection", async () => {
  const useCase = new GetHistoricalCandlesUseCase({
    historicalMarketDataSource: {
      async loadCandles() {
        return null;
      }
    }
  });

  await assert.rejects(
    useCase.execute(VALID_QUERY),
    error => error?.code === "INVALID_HISTORICAL_MARKET_DATA_SOURCE_RESULT"
  );
});

test("propagates source failures without masking them", async () => {
  const sourceError = new Error("Market data source is unavailable.");
  sourceError.code = "MARKET_DATA_SOURCE_UNAVAILABLE";
  const useCase = new GetHistoricalCandlesUseCase({
    historicalMarketDataSource: {
      async loadCandles() {
        throw sourceError;
      }
    }
  });

  await assert.rejects(
    useCase.execute(VALID_QUERY),
    error => error === sourceError
  );
});
