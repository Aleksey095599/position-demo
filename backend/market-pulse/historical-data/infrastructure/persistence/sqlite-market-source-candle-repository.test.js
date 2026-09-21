"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { DatabaseSync } = require("node:sqlite");
const {
  CandleTimeframe
} = require("../../domain/candle-timeframe");
const {
  createCandle
} = require("../../domain/candle");
const {
  SqliteMarketSourceCandleRepository
} = require("./sqlite-market-source-candle-repository");

const ROOT = path.resolve(__dirname, "..", "..", "..", "..", "..");
const SCHEMA_PATH = path.join(ROOT, "schema.sql");
const INSTRUMENT_ID = "CNYRUB_TOM";
const LOADED_AT = "2026-09-16T12:00:00+03:00";

function candle(minute, overrides = {}) {
  const renderedMinute = String(minute).padStart(2, "0");

  return createCandle({
    begin: `2026-09-15T10:${renderedMinute}:00+03:00`,
    end: `2026-09-15T10:${renderedMinute}:59+03:00`,
    open: "12.6",
    high: "12.7",
    low: "12.5",
    close: "12.65",
    ...overrides
  });
}

function openRepository(testContext) {
  const database = new DatabaseSync(":memory:");
  database.exec(fs.readFileSync(SCHEMA_PATH, "utf8"));
  testContext.after(() => database.close());

  return {
    database,
    repository: new SqliteMarketSourceCandleRepository({ database })
  };
}

function upsert(repository, candles, overrides = {}) {
  return repository.upsertAll({
    instrumentId: INSTRUMENT_ID,
    timeframe: CandleTimeframe.ONE_MINUTE,
    candles,
    dataSource: "MOEX_ISS",
    loadedAt: LOADED_AT,
    ...overrides
  });
}

function upsertLoadedRange(repository, overrides = {}) {
  return repository.upsertLoadedRange({
    instrumentId: INSTRUMENT_ID,
    timeframe: CandleTimeframe.ONE_MINUTE,
    from: "2026-09-15T00:00:00+03:00",
    till: "2026-09-16T00:00:00+03:00",
    candles: [candle(0), candle(1)],
    dataSource: "MOEX_ISS",
    loadedAt: LOADED_AT,
    ...overrides
  });
}

test("requires a SQLite database connection", () => {
  for (const database of [undefined, null, {}, { prepare() {} }]) {
    assert.throws(
      () => new SqliteMarketSourceCandleRepository({ database }),
      error => error?.code
        === "INVALID_SQLITE_MARKET_SOURCE_CANDLE_REPOSITORY_CONFIGURATION"
    );
  }
});

test("upserts one Candle batch with normalized persistence metadata", testContext => {
  const { database, repository } = openRepository(testContext);

  const affected = repository.upsertAll({
    instrumentId: `  ${INSTRUMENT_ID}  `,
    timeframe: CandleTimeframe.ONE_MINUTE,
    candles: [candle(0), candle(1)],
    dataSource: "  MOEX_ISS  ",
    loadedAt: LOADED_AT
  });

  assert.equal(affected, 2);
  assert.deepEqual(
    database.prepare(`
      SELECT
        instrument_id,
        timeframe,
        begin_at,
        data_source,
        loaded_at
      FROM moex_iss_minute_candles
      ORDER BY begin_at
    `).all().map(row => ({ ...row })),
    [
      {
        instrument_id: INSTRUMENT_ID,
        timeframe: CandleTimeframe.ONE_MINUTE,
        begin_at: "2026-09-15T07:00:00.000Z",
        data_source: "MOEX_ISS",
        loaded_at: "2026-09-16T09:00:00.000Z"
      },
      {
        instrument_id: INSTRUMENT_ID,
        timeframe: CandleTimeframe.ONE_MINUTE,
        begin_at: "2026-09-15T07:01:00.000Z",
        data_source: "MOEX_ISS",
        loaded_at: "2026-09-16T09:00:00.000Z"
      }
    ]
  );
});

test("updates the complete stored Candle on a composite-key conflict", testContext => {
  const { database, repository } = openRepository(testContext);
  upsert(repository, [candle(0)]);

  const affected = upsert(repository, [candle(0, {
    open: "12.61",
    high: "12.8",
    low: "12.4",
    close: "12.75"
  })], {
    dataSource: "MOEX_ISS",
    loadedAt: "2026-09-16T13:30:00+03:00"
  });

  assert.equal(affected, 1);
  assert.deepEqual(
    { ...database.prepare("SELECT * FROM moex_iss_minute_candles").get() },
    {
      instrument_id: INSTRUMENT_ID,
      timeframe: CandleTimeframe.ONE_MINUTE,
      begin_at: "2026-09-15T07:00:00.000Z",
      end_at: "2026-09-15T07:00:59.000Z",
      open_price: 12.61,
      high_price: 12.8,
      low_price: 12.4,
      close_price: 12.75,
      data_source: "MOEX_ISS",
      loaded_at: "2026-09-16T10:30:00.000Z"
    }
  );
  assert.equal(
    database.prepare("SELECT COUNT(*) AS count FROM moex_iss_minute_candles").get().count,
    1
  );
});

test("rolls back the complete upsert batch when one row fails", testContext => {
  const { database, repository } = openRepository(testContext);
  database.exec(`
    CREATE TRIGGER reject_second_market_source_candle
    BEFORE INSERT ON moex_iss_minute_candles
    FOR EACH ROW
    WHEN NEW.begin_at = '2026-09-15T07:01:00.000Z'
    BEGIN
      SELECT RAISE(ABORT, 'second Candle rejected');
    END;
  `);

  assert.throws(
    () => upsert(repository, [candle(0), candle(1)]),
    /second Candle rejected/
  );
  assert.equal(
    database.prepare("SELECT COUNT(*) AS count FROM moex_iss_minute_candles").get().count,
    0
  );

  database.exec("DROP TRIGGER reject_second_market_source_candle");
  assert.equal(upsert(repository, [candle(0)]), 1);
});

test("finds a half-open Candle period in ascending order", testContext => {
  const { repository } = openRepository(testContext);
  upsert(repository, [candle(2), candle(0), candle(1)]);
  upsert(repository, [candle(1)], {
    instrumentId: "USDRUB_TOM"
  });
  upsert(repository, [candle(1)], {
    timeframe: CandleTimeframe.ONE_DAY
  });

  const result = repository.findByPeriod({
    instrumentId: ` ${INSTRUMENT_ID} `,
    timeframe: CandleTimeframe.ONE_MINUTE,
    from: "2026-09-15T10:01:00+03:00",
    till: "2026-09-15T10:03:00+03:00"
  });

  assert.deepEqual(result, [candle(1), candle(2)]);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result[0]), true);
});

test("finds the latest Candle and returns null for an empty stream", testContext => {
  const { repository } = openRepository(testContext);
  upsert(repository, [candle(1), candle(0), candle(2)]);

  assert.deepEqual(repository.findLatest({
    instrumentId: INSTRUMENT_ID,
    timeframe: CandleTimeframe.ONE_MINUTE
  }), candle(2));
  assert.equal(repository.findLatest({
    instrumentId: "USDRUB_TOM",
    timeframe: CandleTimeframe.ONE_MINUTE
  }), null);
});

test("validates write and period arguments before accessing SQLite", testContext => {
  const { repository } = openRepository(testContext);

  assert.throws(
    () => upsert(repository, null),
    error => error?.code === "INVALID_MARKET_SOURCE_CANDLE_REPOSITORY_ARGUMENT"
  );
  assert.throws(
    () => repository.findByPeriod({
      instrumentId: INSTRUMENT_ID,
      timeframe: CandleTimeframe.ONE_MINUTE,
      from: "2026-09-15T10:03:00+03:00",
      till: "2026-09-15T10:03:00+03:00"
    }),
    error => error?.code === "INVALID_MARKET_SOURCE_CANDLE_REPOSITORY_ARGUMENT"
  );
  assert.throws(
    () => repository.findLatest({
      instrumentId: INSTRUMENT_ID,
      timeframe: "TWO_MINUTES"
    }),
    error => error?.code === "INVALID_CANDLE_TIMEFRAME"
  );
});

test("atomically upserts Candles and records their loaded Range", testContext => {
  const { database, repository } = openRepository(testContext);

  assert.equal(upsertLoadedRange(repository), 2);
  assert.equal(
    database.prepare("SELECT COUNT(*) AS count FROM moex_iss_minute_candles").get().count,
    2
  );
  assert.deepEqual(repository.findLoadedRanges({
    instrumentId: INSTRUMENT_ID,
    timeframe: CandleTimeframe.ONE_MINUTE,
    from: "2026-09-15T06:00:00.000Z",
    till: "2026-09-15T08:00:00.000Z"
  }), [{
    from: "2026-09-14T21:00:00.000Z",
    till: "2026-09-15T21:00:00.000Z",
    loadedAt: "2026-09-16T09:00:00.000Z"
  }]);
  assert.equal(repository.coversLoadedRange({
    instrumentId: INSTRUMENT_ID,
    timeframe: CandleTimeframe.ONE_MINUTE,
    from: "2026-09-15T07:00:30.000Z",
    till: "2026-09-15T07:01:30.000Z"
  }), true);
});

test("records a successfully loaded empty Range", testContext => {
  const { database, repository } = openRepository(testContext);

  assert.equal(upsertLoadedRange(repository, {
    from: "2026-09-13T00:00:00+03:00",
    till: "2026-09-14T00:00:00+03:00",
    candles: []
  }), 0);
  assert.equal(
    database.prepare("SELECT COUNT(*) AS count FROM moex_iss_minute_candles").get().count,
    0
  );
  assert.equal(repository.coversLoadedRange({
    instrumentId: INSTRUMENT_ID,
    timeframe: CandleTimeframe.ONE_MINUTE,
    from: "2026-09-12T21:00:00.000Z",
    till: "2026-09-13T21:00:00.000Z"
  }), true);
});

test("derives continuous coverage from adjacent daily records", t => {
    const {repository,database}=openRepository(t);
    for(const date of ["2026-09-14","2026-09-15"]) {
      const from=Date.parse(date+"T00:00:00+03:00");
      upsertLoadedRange(repository,{from:new Date(from).toISOString(),till:new Date(from+86400000).toISOString(),candles:[]});
    }
    assert.equal(database.prepare("SELECT COUNT(*) n FROM moex_iss_minute_candle_load_days").get().n,2);
    assert.equal(repository.coversLoadedRange({instrumentId:INSTRUMENT_ID,timeframe:"ONE_MINUTE",from:"2026-09-13T21:00:00Z",till:"2026-09-15T21:00:00Z"}),true);
    assert.equal(repository.coversLoadedRange({instrumentId:INSTRUMENT_ID,timeframe:"ONE_MINUTE",from:"2026-09-13T21:00:00Z",till:"2026-09-16T21:00:00Z"}),false);
    assert.throws(()=>upsertLoadedRange(repository,{from:"2026-09-15T10:00:00+03:00"}),/complete Moscow calendar days/);
  });

test("rolls back Candles when loaded Range persistence fails", testContext => {
  const { database, repository } = openRepository(testContext);
  database.exec(`
    CREATE TRIGGER reject_market_candle_load_range
    BEFORE INSERT ON moex_iss_minute_candle_load_days
    BEGIN
      SELECT RAISE(ABORT, 'loaded Range rejected');
    END;
  `);

  assert.throws(
    () => upsertLoadedRange(repository),
    /loaded Range rejected/
  );
  assert.equal(
    database.prepare("SELECT COUNT(*) AS count FROM moex_iss_minute_candles").get().count,
    0
  );
  assert.equal(
    database.prepare(`
      SELECT COUNT(*) AS count FROM moex_iss_minute_candle_load_days
    `).get().count,
    0
  );

  database.exec("DROP TRIGGER reject_market_candle_load_range");
  assert.equal(upsertLoadedRange(repository), 2);
});

test("rejects Candles outside the declared loaded Range", testContext => {
  const { database, repository } = openRepository(testContext);

  assert.throws(
    () => upsertLoadedRange(repository, {
      till: "2026-09-15T10:01:00+03:00"
    }),
    error => error?.code === "INVALID_MARKET_SOURCE_CANDLE_REPOSITORY_ARGUMENT"
  );
  assert.equal(
    database.prepare("SELECT COUNT(*) AS count FROM moex_iss_minute_candles").get().count,
    0
  );
  assert.equal(
    database.prepare(`
      SELECT COUNT(*) AS count FROM moex_iss_minute_candle_load_days
    `).get().count,
    0
  );
});
