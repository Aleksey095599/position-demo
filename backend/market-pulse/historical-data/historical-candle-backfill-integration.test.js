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
  GetStoredHistoricalCandlesUseCase
} = require("./application/get-stored-historical-candles-use-case");
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
      from: "2026-09-14T21:00:00.000Z",
      till: "2026-09-15T21:00:00.000Z"
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
      database.prepare("SELECT COUNT(*) AS count FROM moex_iss_minute_candles").get().count,
      5
    );
    assert.equal(
      database.prepare(
        "SELECT COUNT(*) AS count FROM moex_iss_minute_candle_load_result"
      ).get().count,
      1
    );
  } finally {
    database.close();
  }
});
