"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { DatabaseSync } = require("node:sqlite");
const {
  BackfillHistoricalCandleRangeUseCase
} = require("./application/backfill-historical-candle-range-use-case");
const {
  BackfillHistoricalCandlesUseCase
} = require("./application/backfill-historical-candles-use-case");
const {
  GetHistoricalCandleBackfillStatusUseCase
} = require("./application/get-historical-candle-backfill-status-use-case");
const {
  GetStoredHistoricalCandlesUseCase
} = require("./application/get-stored-historical-candles-use-case");
const {
  createHistoricalCandlesApi
} = require("./api/historical-candles-api");
const {
  createCandle
} = require("./domain/candle");
const {
  CandleTimeframe
} = require("./domain/candle-timeframe");
const {
  SqliteMarketSourceCandleRepository
} = require("./infrastructure/persistence/sqlite-market-source-candle-repository");

const ROOT = path.resolve(__dirname, "..", "..", "..");
const SCHEMA_PATH = path.join(ROOT, "schema.sql");

function minuteCandle(minute) {
  const renderedMinute = String(minute).padStart(2, "0");

  return createCandle({
    begin: `2026-09-15T07:${renderedMinute}:00.000Z`,
    end: `2026-09-15T07:${renderedMinute}:59.000Z`,
    open: String(100 + minute),
    high: String(102 + minute),
    low: String(99 + minute),
    close: String(101 + minute)
  });
}

test("backfills an anchor range once and derives stored five-minute Candles", async () => {
  const database = new DatabaseSync(":memory:");

  try {
    database.exec(fs.readFileSync(SCHEMA_PATH, "utf8"));
    const repository = new SqliteMarketSourceCandleRepository({ database });
    const sourceCandles = Array.from({ length: 5 }, (_, minute) => (
      minuteCandle(minute)
    ));
    let sourceCallCount = 0;
    const backfill = new BackfillHistoricalCandleRangeUseCase({
      historicalMarketDataSource: {
        async loadCandlePage() {
          sourceCallCount += 1;
          return {
            candles: sourceCandles,
            hasMore: false,
            nextStart: null
          };
        }
      },
      marketSourceCandleRepository: repository,
      minimumRequestIntervalMs: 0,
      now: () => Date.parse("2026-09-17T09:00:00.000Z")
    });
    const range = {
      instrumentId: "CNYRUB_TOM",
      timeframe: CandleTimeframe.ONE_MINUTE,
      from: "2026-09-15T07:00:00.000Z",
      till: "2026-09-15T07:05:00.000Z"
    };

    const firstRun = await backfill.execute(range);
    const secondRun = await backfill.execute(range);
    const stored = await new GetStoredHistoricalCandlesUseCase({
      marketSourceCandleRepository: repository
    }).execute({
      ...range,
      timeframe: CandleTimeframe.FIVE_MINUTES
    });

    assert.equal(firstRun.storedCandleCount, 5);
    assert.equal(secondRun.skipped, true);
    assert.equal(sourceCallCount, 1);
    assert.deepEqual(stored.candles, [createCandle({
      begin: "2026-09-15T07:00:00.000Z",
      end: "2026-09-15T07:04:59.000Z",
      open: "100",
      high: "106",
      low: "99",
      close: "105"
    })]);
    assert.equal(
      database.prepare("SELECT COUNT(*) AS count FROM market_source_candles").get().count,
      5
    );
    assert.equal(
      database.prepare(
        "SELECT COUNT(*) AS count FROM market_candle_load_ranges"
      ).get().count,
      1
    );
  } finally {
    database.close();
  }
});

test("exposes one safe backfill step and database-only progress through the API", async () => {
  const database = new DatabaseSync(":memory:");

  try {
    database.exec(fs.readFileSync(SCHEMA_PATH, "utf8"));
    const repository = new SqliteMarketSourceCandleRepository({ database });
    let sourceCallCount = 0;
    const rangeUseCase = new BackfillHistoricalCandleRangeUseCase({
      historicalMarketDataSource: {
        async loadCandlePage(query) {
          sourceCallCount += 1;
          const beginTimestamp = Date.parse(query.from);

          return {
            candles: [createCandle({
              begin: query.from,
              end: new Date(beginTimestamp + 59_000).toISOString(),
              open: "12.6",
              high: "12.7",
              low: "12.5",
              close: "12.65"
            })],
            hasMore: false,
            nextStart: null
          };
        }
      },
      marketSourceCandleRepository: repository,
      minimumRequestIntervalMs: 0,
      now: () => Date.parse("2026-09-17T09:00:00.000Z")
    });
    const api = createHistoricalCandlesApi({
      getHistoricalCandlesUseCase: { async execute() { return []; } },
      backfillHistoricalCandlesUseCase: new BackfillHistoricalCandlesUseCase({
        backfillRangeUseCase: rangeUseCase
      }),
      getHistoricalCandleBackfillStatusUseCase: new GetHistoricalCandleBackfillStatusUseCase({
        marketSourceCandleRepository: repository
      }),
      now: () => Date.parse("2026-09-17T08:15:00.000Z")
    });
    const statusQuery = new URLSearchParams({ instrumentId: "CNYRUB_TOM" });

    const before = await api.backfillStatus(statusQuery);
    const step = await api.backfillStep({ instrumentId: "CNYRUB_TOM" });
    const after = await api.backfillStatus(statusQuery);

    assert.equal(before.statusCode, 200);
    assert.equal(before.body.minute.loadedRangeCount, 0);
    assert.equal(step.statusCode, 200);
    assert.equal(step.body.loadedRangeCount, 1);
    assert.equal(step.body.storedCandleCount, 1);
    assert.equal(after.statusCode, 200);
    assert.equal(after.body.minute.loadedRangeCount, 1);
    assert.equal(after.body.daily.loadedRangeCount, 0);
    assert.equal(sourceCallCount, 1);
  } finally {
    database.close();
  }
});
