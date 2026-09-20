"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  GetHistoricalCandlesUseCase
} = require("../application/get-historical-candles-use-case");
const {
  CandleTimeframe
} = require("../domain/candle-timeframe");
const {
  MoexIssHistoricalMarketDataSource
} = require("./moex-iss-historical-market-data-source");

const QUERY = Object.freeze({
  instrumentId: "CNYRUB_TOM",
  timeframe: CandleTimeframe.FIVE_MINUTES,
  from: "2026-09-15T10:00:00+03:00",
  till: "2026-09-15T10:10:00+03:00"
});

function moexCandleRows(count = 10) {
  return Array.from({ length: count }, (_, index) => {
    const minute = String(index).padStart(2, "0");
    const open = 10 + index / 10;
    const decimal = value => Number(value.toFixed(2));

    return [
      open,
      decimal(open + 0.05),
      decimal(open + 0.1),
      decimal(open - 0.1),
      `2026-09-15 10:${minute}:00`,
      `2026-09-15 10:${minute}:59`
    ];
  });
}

function moexDailyRows(count = 2) {
  const firstDate = Date.UTC(2024, 0, 1);

  return Array.from({ length: count }, (_, index) => {
    const date = new Date(firstDate + index * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const open = 12 + index / 1000;
    const decimal = value => Number(value.toFixed(4));

    return [
      open,
      decimal(open + 0.01),
      decimal(open + 0.02),
      decimal(open - 0.02),
      `${date} 00:00:00`,
      `${date} 23:59:59`
    ];
  });
}

function successfulResponse(data = moexCandleRows()) {
  return {
    ok: true,
    status: 200,
    async json() {
      return {
        candles: {
          columns: ["open", "close", "high", "low", "begin", "end"],
          data
        }
      };
    }
  };
}

test("loads one MOEX ISS page and aggregates one-minute rows into five-minute Candles", async () => {
  const requests = [];
  const dataSource = new MoexIssHistoricalMarketDataSource({
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return successfulResponse();
    }
  });
  const useCase = new GetHistoricalCandlesUseCase({
    historicalMarketDataSource: dataSource
  });

  const candles = await useCase.execute(QUERY);

  assert.equal(requests.length, 1);
  assert.equal(requests[0].options.method, "GET");
  assert.equal(requests[0].options.headers.accept, "application/json");
  assert.equal(requests[0].url.pathname,
    "/iss/engines/currency/markets/selt/boards/CETS/securities/CNYRUB_TOM/candles.json");
  assert.equal(requests[0].url.searchParams.get("interval"), "1");
  assert.equal(requests[0].url.searchParams.get("from"), "2026-09-15 10:00:00");
  assert.equal(requests[0].url.searchParams.get("till"), "2026-09-15 10:10:00");
  assert.equal(requests[0].url.searchParams.get("start"), "0");
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
});

test("returns one-minute Candles from the same single MOEX ISS request", async () => {
  let requestCount = 0;
  const dataSource = new MoexIssHistoricalMarketDataSource({
    fetchImpl: async () => {
      requestCount += 1;
      return successfulResponse(moexCandleRows(2));
    }
  });

  const candles = await dataSource.loadCandles({
    ...QUERY,
    timeframe: CandleTimeframe.ONE_MINUTE,
    till: "2026-09-15T10:02:00+03:00"
  });

  assert.equal(requestCount, 1);
  assert.deepEqual(candles, [
    {
      begin: "2026-09-15T07:00:00.000Z",
      end: "2026-09-15T07:00:59.000Z",
      open: "10",
      high: "10.1",
      low: "9.9",
      close: "10.05"
    },
    {
      begin: "2026-09-15T07:01:00.000Z",
      end: "2026-09-15T07:01:59.000Z",
      open: "10.1",
      high: "10.2",
      low: "10",
      close: "10.15"
    }
  ]);
});

test("loads native one-day Candles with MOEX ISS interval 24", async () => {
  const requests = [];
  const dataSource = new MoexIssHistoricalMarketDataSource({
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return successfulResponse(moexDailyRows(1));
    }
  });

  const candles = await dataSource.loadCandles({
    ...QUERY,
    timeframe: CandleTimeframe.ONE_DAY,
    from: "2024-01-01T00:00:00+03:00",
    till: "2024-01-02T00:00:00+03:00"
  });

  assert.equal(requests.length, 1);
  assert.equal(requests[0].url.searchParams.get("interval"), "24");
  assert.equal(requests[0].url.searchParams.get("start"), "0");
  assert.deepEqual(candles, [
    {
      begin: "2023-12-31T21:00:00.000Z",
      end: "2024-01-01T20:59:59.000Z",
      open: "12",
      high: "12.02",
      low: "11.98",
      close: "12.01"
    }
  ]);
});

test("loads one explicit native Candle page from the requested start", async () => {
  const requests = [];
  const dataSource = new MoexIssHistoricalMarketDataSource({
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return successfulResponse(moexDailyRows(2));
    }
  });

  const page = await dataSource.loadCandlePage({
    ...QUERY,
    timeframe: CandleTimeframe.ONE_DAY,
    from: "2024-01-01T00:00:00+03:00",
    till: "2024-02-01T00:00:00+03:00"
  }, { start: 125 });

  assert.equal(requests.length, 1);
  assert.equal(requests[0].url.searchParams.get("interval"), "24");
  assert.equal(requests[0].url.searchParams.get("start"), "125");
  assert.equal(page.candles.length, 2);
  assert.equal(page.nextStart, null);
  assert.equal(page.hasMore, false);
});

test("exposes the next offset for a full MOEX ISS page without fetching it", async () => {
  let requestCount = 0;
  const dataSource = new MoexIssHistoricalMarketDataSource({
    fetchImpl: async () => {
      requestCount += 1;
      return successfulResponse(moexDailyRows(500));
    }
  });

  const page = await dataSource.loadCandlePage({
    ...QUERY,
    timeframe: CandleTimeframe.ONE_DAY,
    from: "2024-01-01T00:00:00+03:00",
    till: "2025-06-01T00:00:00+03:00"
  }, { start: 500 });

  assert.equal(requestCount, 1);
  assert.equal(page.candles.length, 500);
  assert.equal(page.nextStart, 1000);
  assert.equal(page.hasMore, true);
});

test("rejects an invalid Candle page start before making a request", async () => {
  let requestCount = 0;
  const dataSource = new MoexIssHistoricalMarketDataSource({
    fetchImpl: async () => {
      requestCount += 1;
      return successfulResponse();
    }
  });

  await assert.rejects(
    dataSource.loadCandlePage({
      ...QUERY,
      timeframe: CandleTimeframe.ONE_DAY
    }, { start: -1 }),
    error => error?.code === "INVALID_MOEX_ISS_PAGE"
  );
  assert.equal(requestCount, 0);
});

test("aggregates one-minute rows into fifteen-minute Candles without extra requests", async () => {
  let requestCount = 0;
  const dataSource = new MoexIssHistoricalMarketDataSource({
    fetchImpl: async () => {
      requestCount += 1;
      return successfulResponse(moexCandleRows(30));
    }
  });
  const useCase = new GetHistoricalCandlesUseCase({
    historicalMarketDataSource: dataSource
  });

  const candles = await useCase.execute({
    ...QUERY,
    timeframe: CandleTimeframe.FIFTEEN_MINUTES,
    till: "2026-09-15T10:30:00+03:00"
  });

  assert.equal(requestCount, 1);
  assert.deepEqual(candles, [
    {
      begin: "2026-09-15T07:00:00.000Z",
      end: "2026-09-15T07:14:59.000Z",
      open: "10",
      high: "11.5",
      low: "9.9",
      close: "11.45"
    },
    {
      begin: "2026-09-15T07:15:00.000Z",
      end: "2026-09-15T07:29:59.000Z",
      open: "11.5",
      high: "13",
      low: "11.4",
      close: "12.95"
    }
  ]);
});

test("rejects unsupported Timeframes before making a request", async () => {
  let requestCount = 0;
  const dataSource = new MoexIssHistoricalMarketDataSource({
    fetchImpl: async () => {
      requestCount += 1;
      return successfulResponse();
    }
  });

  await assert.rejects(
    dataSource.loadCandles({ ...QUERY, timeframe: CandleTimeframe.ONE_HOUR }),
    error => error?.code === "MOEX_ISS_UNSUPPORTED_CANDLE_TIMEFRAME"
  );
  assert.equal(requestCount, 0);
});

test("does not paginate automatically when MOEX ISS returns its row limit", async () => {
  let requestCount = 0;
  const dataSource = new MoexIssHistoricalMarketDataSource({
    fetchImpl: async () => {
      requestCount += 1;
      return successfulResponse(Array.from({ length: 500 }, () => []));
    }
  });

  await assert.rejects(
    dataSource.loadCandles(QUERY),
    error => error?.code === "MOEX_ISS_RESULT_LIMIT_REACHED"
  );
  assert.equal(requestCount, 1);
});

test("reports HTTP and network failures", async () => {
  const httpFailure = new MoexIssHistoricalMarketDataSource({
    fetchImpl: async () => ({ ok: false, status: 503 })
  });
  const networkFailure = new MoexIssHistoricalMarketDataSource({
    fetchImpl: async () => {
      throw new Error("connection failed");
    }
  });

  await assert.rejects(
    httpFailure.loadCandles(QUERY),
    error => error?.code === "MOEX_ISS_REQUEST_FAILED"
  );
  await assert.rejects(
    networkFailure.loadCandles(QUERY),
    error => error?.code === "MOEX_ISS_REQUEST_FAILED"
  );
});

test("rejects an invalid MOEX ISS response", async () => {
  const dataSource = new MoexIssHistoricalMarketDataSource({
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      async json() {
        return { candles: { columns: ["open"], data: [[]] } };
      }
    })
  });

  await assert.rejects(
    dataSource.loadCandles(QUERY),
    error => error?.code === "MOEX_ISS_INVALID_RESPONSE"
  );
});
