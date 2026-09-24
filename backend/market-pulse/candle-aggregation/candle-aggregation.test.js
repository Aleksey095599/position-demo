"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { DatabaseSync } = require("node:sqlite");
const { aggregateHourlyCandles } = require("./domain/aggregate-hourly-candles");
const { aggregateCandlesFromMinutes } = require("./domain/aggregate-candles-from-minutes");
const { migrateAggregationTimeframes } = require("./infrastructure/persistence/migrate-aggregation-timeframes");
const { migrateDailyAggregation } = require("./infrastructure/persistence/migrate-daily-aggregation");
const { CandleAggregationService } = require("./application/candle-aggregation-service");
const { createCandleAggregationApi } = require("./api/candle-aggregation-api");
const { SqliteCandleAggregationRepository } = require("./infrastructure/persistence/sqlite-candle-aggregation-repository");
const { SqliteMarketSourceCandleRepository } = require("../historical-data/infrastructure/persistence/sqlite-market-source-candle-repository");

const date = "2026-09-15";
const from = "2026-09-14T21:00:00.000Z", till = "2026-09-15T21:00:00.000Z";
const command = { instrumentId: "CNYRUB_TOM", timeframe: "ONE_HOUR", date };
const minuteStart = Date.parse("2026-09-15T10:00:00+03:00");
const minutes = (indices = Array.from({ length: 60 }, (_, i) => i)) => indices.map(index => ({
  begin: new Date(minuteStart + index * 60000).toISOString(),
  end: new Date(minuteStart + index * 60000 + 59000).toISOString(),
  open: String(10 + index), high: String(12 + index), low: String(9 + index), close: String(11 + index)
}));
function setup(t) {
  const database = new DatabaseSync(":memory:");
  t.after(() => database.close());
  database.exec(fs.readFileSync(path.resolve(__dirname, "../../../schema.sql"), "utf8"));
  const source = new SqliteMarketSourceCandleRepository({ database });
  const repository = new SqliteCandleAggregationRepository(database);
  const service = new CandleAggregationService({ sourceRepository: source, aggregationRepository: repository,
    now: () => Date.parse("2026-09-23T12:00:00Z") });
  const api = createCandleAggregationApi(service);
  function load(candles, loadedAt = "2026-09-20T12:00:00.000Z") {
    source.upsertLoadedRange({ ...command, timeframe: "ONE_MINUTE", from, till, candles, dataSource: "MOEX_ISS", loadedAt });
  }
  async function day() {
    return (await service.calendar({ ...command, month: "2026-09" })).days.find(value => value.date === date);
  }
  return { database, source, repository, service, api, load, day };
}

test("complete coverage requires all unique minute slots and preserves OHLC order", () => {
  const { candles: [hour] } = aggregateHourlyCandles({ candles: minutes().reverse(), from, till });
  assert.equal(hour.componentCount, 60);
  assert.equal(hour.coverage, "COMPLETE");
  assert.deepEqual(hour.missingMinutes, []);
  assert.equal(hour.open, "10"); assert.equal(hour.close, "70");
  assert.equal(hour.high, "71"); assert.equal(hour.low, "9");
  assert.equal(hour.begin, minutes()[0].begin);
});

test("missing edges and an internal hole produce partial coverage, not a calculation failure", () => {
  const indices = Array.from({ length: 60 }, (_, i) => i).filter(i => ![0, 34, 59].includes(i));
  const { candles: [hour] } = aggregateHourlyCandles({ candles: minutes(indices), from, till });
  assert.equal(hour.componentCount, 57);
  assert.equal(hour.coverage, "PARTIAL");
  assert.deepEqual(hour.missingMinutes, minutes([0, 34, 59]).map(c => c.begin));
  assert.equal(hour.firstSourceBegin, minutes([1])[0].begin);
  assert.equal(hour.lastSourceBegin, minutes([58])[0].begin);
  assert.equal(hour.open, "11"); assert.equal(hour.close, "69");
});

test("single-minute hours retain OHLC, empty hours are absent and exact next hour is separate", () => {
  assert.deepEqual(aggregateHourlyCandles({ candles: [], from, till }), {candles:[]});
  const {candles} = aggregateHourlyCandles({ candles: minutes([59, 60]), from, till });
  assert.equal(candles.length, 2);
  for (const hour of candles) {
    assert.equal(hour.componentCount, 1); assert.equal(hour.coverage,"INSUFFICIENT");
    assert.ok(hour.open); assert.ok(hour.close); assert.ok(hour.high); assert.ok(hour.low);
  }
});

test("duplicate and misaligned minutes cannot produce a green coverage count", () => {
  assert.throws(() => aggregateHourlyCandles({ candles: [...minutes(), ...minutes([0])], from, till }), /unique/);
  assert.throws(() => aggregateHourlyCandles({ candles: [{ ...minutes([0])[0], begin: "2026-09-15T07:00:01.000Z" }], from, till }), /minute-aligned/);
});

test("fixed coverage thresholds include exactly 30 minutes and require exactly 60 for complete coverage", () => {
  for (const [count, coverage] of [[1,"INSUFFICIENT"],[29,"INSUFFICIENT"],[30,"PARTIAL"],[59,"PARTIAL"],[60,"COMPLETE"]]) {
    const result = aggregateHourlyCandles({candles:minutes(Array.from({length:count},(_,i)=>i)),from,till});
    assert.equal(result.candles.length, 1);
    const hour = result.candles[0];
    assert.equal(hour.coverage,coverage);
    assert.equal(hour.componentCount,count);
  }
});

test("mixed days retain all candles and expose independent coverage counts after repository reload", async t => {
  const f = setup(t);
  f.load(minutes([...Array.from({length:60},(_,i)=>i),60,...Array.from({length:58},(_,i)=>120+i)]));
  const response = await f.api.calculateDay(command);
  assert.equal(response.statusCode,200);
  assert.equal(response.body.status,"CALCULATED");
  assert.equal(response.body.candleCount,3);
  assert.equal(response.body.partialCount,1);
  assert.equal(response.body.insufficientCount,1);
  const reopened = new CandleAggregationService({sourceRepository:f.source,
    aggregationRepository:new SqliteCandleAggregationRepository(f.database),now:()=>Date.parse("2026-09-23T12:00:00Z")});
  const day = (await reopened.calendar({...command,month:"2026-09"})).days[14];
  assert.equal(day.status,"CALCULATED");
  assert.equal(day.insufficientCount,1);
  assert.equal(day.completeCount,1);
  assert.equal(day.partialCount,1);
  const details = await reopened.dayDetails(command);
  assert.equal(details.intervalCoverage.length,24);
  assert.deepEqual(details.intervalCoverage.filter(h=>h.coverage!=="NO_DATA").map(h=>[h.hour,h.coverage]),
    [[10,"COMPLETE"],[11,"INSUFFICIENT"],[12,"PARTIAL"]]);
  assert.equal(details.intervalCoverage.filter(h=>h.coverage==="NO_DATA").length,21);
  assert.deepEqual(details.candles.map(h=>h.componentCount),[60,1,58]);
  assert.equal(details.candles[1].coverage,"INSUFFICIENT");
  assert.equal(details.candles[1].missingMinutes.length,59);
  assert.equal(details.candles[1].open,"70");
  assert.equal(f.source.findByPeriod({...command,timeframe:"ONE_MINUTE",from,till}).length,119);
});

test("all-insufficient days remain distinct from No data and recalculation is idempotent", async t => {
  const f = setup(t); f.load(minutes([0,1]));
  for (let attempt=0;attempt<2;attempt++) {
    const response = await f.api.calculateDay(command);
    assert.equal(response.body.status,"CALCULATED");
    assert.equal(response.body.candleCount,1);
    assert.equal((await f.day()).status,"CALCULATED");
    const details = await f.service.dayDetails(command);
    assert.equal(details.candles.length,1);
    assert.equal(details.candles[0].coverage,"INSUFFICIENT");
  }
});

test("previously excluded intervals require recalculation and are restored without stale loops", async t => {
  const f = setup(t); f.load(minutes([0]));
  f.repository.replaceDay({...command,from,till,candles:[],
    calculatedAt:"2026-09-22T12:00:00.000Z",sourceLoadedAt:"2026-09-20T12:00:00.000Z"});
  assert.equal((await f.day()).status,"PENDING");
  assert.equal((await f.day()).requiresRecalculation,true);
  const before = await f.service.dayDetails(command);
  assert.equal(before.stale,true);
  assert.equal(before.intervalCoverage,null);
  assert.equal(before.candles.length,0);
  await f.service.calculateDay(command);
  assert.equal((await f.day()).status,"CALCULATED");
  assert.equal(f.repository.findByPeriod({...command,from,till}).length,1);
  assert.equal((await f.day()).requiresRecalculation,false);
  assert.equal((await f.day()).insufficientCount,1);
});

test("calculation persists candles, calendar coverage and on-demand missing-minute details", async t => {
  const f = setup(t);
  f.load(minutes(Array.from({length:30},(_,i)=>i+5)));
  assert.equal((await f.day()).status, "PENDING");
  const result = await f.api.calculateDay(command);
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.status, "CALCULATED");
  assert.equal((await f.day()).partialCount, 1);
  const details = await f.service.dayDetails(command);
  assert.equal(details.candles[0].missingMinutes.length, 30);
  assert.equal(details.candles[0].componentCount, 30);
  assert.equal(f.database.prepare("SELECT COUNT(*) count FROM moex_iss_aggregated_candles").get().count, 1);
  assert.equal(f.database.prepare("SELECT COUNT(*) count FROM moex_iss_minute_candles").get().count, 30);
});

test("a complete hour is green without requiring 24 trading hours", async t => {
  const f = setup(t); f.load(minutes());
  await f.service.calculateDay(command);
  assert.equal((await f.day()).status, "CALCULATED");
  assert.equal((await f.day()).candleCount, 1);
});

test("empty loaded days persist No data while unloaded days fail and stay retryable", async t => {
  const f = setup(t);
  const failure = await f.api.calculateDay(command);
  assert.equal(failure.statusCode, 409);
  assert.equal((await f.day()).status, "ERROR");
  f.load([]);
  assert.equal((await f.api.calculateDay(command)).statusCode, 200);
  assert.equal((await f.day()).status, "NO_DATA");
  assert.equal((await f.day()).lastError, null);
  assert.equal((await f.service.dayDetails(command)).candles.length, 0);
  assert.ok((await f.service.dayDetails(command)).intervalCoverage.every(hour=>hour.coverage==="NO_DATA"));
});

test("recalculation replaces the whole target day without duplicates or changes to other days", async t => {
  const f = setup(t); f.load(minutes());
  await f.service.calculateDay(command);
  await f.service.calculateDay(command);
  assert.equal((await f.day()).candleCount, 1);
  f.database.prepare(`INSERT INTO moex_iss_aggregated_candles
    SELECT instrument_id,timeframe,'2026-09-16T07:00:00.000Z','2026-09-16T07:59:59.000Z',
    open_price,high_price,low_price,close_price,base_timeframe,component_count,calculated_at FROM moex_iss_aggregated_candles`).run();
  f.database.exec("DELETE FROM moex_iss_minute_candles");
  f.load([]);
  await f.service.calculateDay(command);
  assert.equal((await f.day()).status, "NO_DATA");
  assert.equal(f.database.prepare("SELECT COUNT(*) count FROM moex_iss_aggregated_candles").get().count, 1);
});

test("source reload invalidates coverage until recalculation", async t => {
  const f = setup(t); f.load(minutes()); await f.service.calculateDay(command);
  f.load(minutes(), "2026-09-23T13:00:00.000Z");
  assert.equal((await f.day()).status, "PENDING");
  assert.equal((await f.service.dayDetails(command)).stale, true);
  assert.equal((await f.service.dayDetails(command)).intervalCoverage,null);
});

test("a failed replacement rolls back the entire day", async t => {
  const f = setup(t); f.load(minutes()); await f.service.calculateDay(command);
  const { candles } = aggregateHourlyCandles({ candles: minutes(), from, till });
  assert.throws(() => f.repository.replaceDay({ ...command, from, till, candles: [{ ...candles[0], low: "-1" }],
    calculatedAt: "2026-09-23T12:00:00.000Z", sourceLoadedAt: "2026-09-20T12:00:00.000Z" }));
  assert.equal((await f.day()).status, "CALCULATED");
  assert.equal((await f.service.dayDetails(command)).candles[0].low, "9");
});

test("API rejects future days, bad dates, unsupported timeframes, duplicate and extra parameters", async t => {
  const f = setup(t);
  for (const body of [{ ...command, date: "2026-09-23" }, { ...command, date: "2026-02-30" },
    { ...command, timeframe: "ONE_WEEK" }, { ...command, instrumentId: "UNKNOWN" }, { ...command, force: true }]) {
    assert.equal((await f.api.calculateDay(body)).statusCode, 400);
  }
  assert.equal((await f.api.calendar(new URLSearchParams("instrumentId=CNYRUB_TOM&timeframe=ONE_HOUR&month=2026-09&month=2026-08"))).statusCode, 400);
  assert.equal((await f.api.calendar(new URLSearchParams({ instrumentId: "CNYRUB_TOM", timeframe: "ONE_HOUR", month: "2026-13" }))).statusCode, 400);
});

test("API serializes calculations and releases its lock after errors", async () => {
  let finish;
  const api = createCandleAggregationApi({ calculateDay: () => new Promise(resolve => { finish = resolve; }) });
  const first = api.calculateDay(command);
  assert.equal((await api.calculateDay(command)).body.code, "CANDLE_AGGREGATION_BUSY");
  finish({ ...command }); await first;
  const next = api.calculateDay(command); finish({ ...command });
  assert.equal((await next).statusCode, 200);
});

function fourHourMinutes(count, startHour = 8) {
  const shift = (startHour - 10) * 3600000;
  return minutes(Array.from({ length: count }, (_, i) => i)).map(c => ({ ...c,
    begin: new Date(Date.parse(c.begin) + shift).toISOString(),
    end: new Date(Date.parse(c.end) + shift).toISOString() }));
}

test("daily coverage uses 240 actual minute candles, retains sparse days and never produces partial coverage", () => {
  for (const [count, coverage] of [[1,"INSUFFICIENT"],[239,"INSUFFICIENT"],[240,"SUFFICIENT"],[600,"SUFFICIENT"]]) {
    const source = minutes(Array.from({ length: count }, (_, i) => i));
    const { candles: [candle] } = aggregateCandlesFromMinutes({ candles: source.reverse(), from, till, timeframe: "ONE_DAY" });
    assert.equal(candle.coverage, coverage);
    assert.equal(candle.componentCount, count);
    assert.equal(candle.begin, from);
    assert.equal(Date.parse(candle.end) + 1000, Date.parse(till));
    assert.equal(candle.open, "10"); assert.equal(candle.close, String(10 + count));
    assert.equal(candle.high, String(11 + count)); assert.equal(candle.low, "9");
    assert.deepEqual(candle.missingMinutes, []);
  }
  const sparse = fourHourMinutes(1440, 0).filter((_, i) => i % 6 === 0);
  const calculate = candles => aggregateCandlesFromMinutes({ candles, from, till, timeframe: "ONE_DAY" });
  assert.equal(calculate(sparse).candles[0].coverage, "SUFFICIENT");
  assert.equal(calculate([sparse[0], sparse.at(-1)]).candles[0].coverage, "INSUFFICIENT");
  assert.deepEqual(calculate([]), { candles: [] });
  assert.throws(() => calculate([...sparse, sparse[0]]), /unique/);
  assert.throws(() => calculate(fourHourMinutes(1, 24)), /inside the selected day/);
});

test("daily API persists and classifies all nonempty days independently of hourly and four-hour results", async t => {
  const f = setup(t), daily = { ...command, timeframe: "ONE_DAY" };
  f.load(minutes(Array.from({ length: 240 }, (_, i) => i)));
  for (const timeframe of ["ONE_HOUR", "FOUR_HOURS"]) await f.service.calculateDay({ ...command, timeframe });
  const otherCandles = () => f.database.prepare("SELECT * FROM moex_iss_aggregated_candles WHERE timeframe<>'ONE_DAY' ORDER BY timeframe,begin_at").all();
  const before = otherCandles();
  const calendar = async () => (await f.service.calendar({ ...daily, month: "2026-09" })).days[14];
  assert.equal((await calendar()).status, "PENDING");
  for (let i = 0; i < 2; i++) {
    const response = await f.api.calculateDay(daily);
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.sufficientCount, 1);
    const day = await calendar();
    assert.equal(day.candleCount, 1); assert.equal(day.requiresRecalculation, false);
    assert.deepEqual([day.completeCount, day.partialCount, day.insufficientCount, day.sufficientCount], [0,0,0,1]);
    const details = await f.service.dayDetails(daily);
    assert.equal(details.minimumMinutes, 240); assert.equal(details.expectedMinutes, null);
    assert.equal(details.intervalCoverage, null);
    assert.equal(details.candles[0].coverage, "SUFFICIENT");
  }
  assert.deepEqual(otherCandles(), before);
  f.load(minutes(), "2026-09-23T13:00:00.000Z");
  assert.equal((await calendar()).requiresRecalculation, true);
  const sourceBefore = f.source.findByPeriod({ ...command, timeframe: "ONE_MINUTE", from, till });
  await f.service.calculateDay(daily);
  assert.equal((await calendar()).requiresRecalculation, false);
  assert.deepEqual(f.source.findByPeriod({ ...command, timeframe: "ONE_MINUTE", from, till }), sourceBefore);
});

test("daily missing source, No data and insufficient coverage remain distinct", async t => {
  const f = setup(t), daily = { ...command, timeframe: "ONE_DAY" };
  assert.equal((await f.api.calculateDay(daily)).statusCode, 409);
  f.load([]);
  assert.equal((await f.api.calculateDay(daily)).body.status, "NO_DATA");
  f.load(minutes([0]));
  const result = await f.api.calculateDay(daily);
  assert.equal(result.body.status, "CALCULATED");
  assert.equal(result.body.insufficientCount, 1);
  const details = await f.service.dayDetails(daily);
  assert.equal(details.candles[0].componentCount, 1);
  assert.equal(details.candles[0].coverage, "INSUFFICIENT");
  const day = (await f.service.calendar({ ...daily, month: "2026-09" })).days[14];
  assert.deepEqual([day.sufficientCount, day.partialCount, day.insufficientCount], [0,0,1]);
});

test("daily migration preserves existing tables and indexes, enables daily candles and is idempotent", async t => {
  const database = new DatabaseSync(":memory:"); t.after(() => database.close());
  const schema = fs.readFileSync(path.resolve(__dirname, "../../../schema.sql"), "utf8")
    .replace(/'FOUR_HOURS',\s*'ONE_DAY'/g, "'FOUR_HOURS'");
  database.exec(schema);
  const repository = new SqliteCandleAggregationRepository(database);
  const candles = aggregateHourlyCandles({ candles: minutes(), from, till }).candles;
  repository.replaceDay({ ...command, from, till, candles, calculatedAt: "2026-09-23T12:00:00.000Z", sourceLoadedAt: "source" });
  repository.recordFailure({ ...command, timeframe: "FOUR_HOURS", error: "failure" });
  database.exec("CREATE INDEX test_aggregation_date ON moex_iss_aggregated_candles(begin_at)");
  const tables = ["moex_iss_aggregated_candles", "moex_iss_candle_aggregation_result"];
  const rows = () => tables.map(table => database.prepare(`SELECT * FROM ${table} ORDER BY 1,2,3`).all());
  const before = rows();
  assert.equal(migrateDailyAggregation(database), true);
  assert.deepEqual(rows(), before);
  assert.ok(database.prepare("SELECT 1 FROM sqlite_master WHERE name='test_aggregation_date'").get());
  assert.equal(migrateDailyAggregation(database), false);
  repository.replaceDay({ ...command, timeframe: "ONE_DAY", from, till,
    candles: aggregateCandlesFromMinutes({ candles: minutes([0]), from, till, timeframe: "ONE_DAY" }).candles,
    calculatedAt: "2026-09-23T12:00:00.000Z", sourceLoadedAt: "source" });
  assert.equal(repository.findByPeriod({ ...command, timeframe: "ONE_DAY", from, till }).length, 1);
  assert.equal(database.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
});

test("daily migration rolls back both tables if upgrading the second one fails", t => {
  const database = new DatabaseSync(":memory:"); t.after(() => database.close());
  database.exec(fs.readFileSync(path.resolve(__dirname, "../../../schema.sql"), "utf8")
    .replace(/'FOUR_HOURS',\s*'ONE_DAY'/g, "'FOUR_HOURS'"));
  database.exec("CREATE TABLE moex_iss_candle_aggregation_result_daily_upgrade (blocked TEXT)");
  const before = database.prepare("SELECT name,sql FROM sqlite_master ORDER BY name").all();
  assert.throws(() => migrateDailyAggregation(database), /already exists/);
  assert.deepEqual(database.prepare("SELECT name,sql FROM sqlite_master ORDER BY name").all(), before);
});

test("four-hour coverage classifies all nonempty candles without excluding any from storage", () => {
  for (const [count, coverage] of [[1,"INSUFFICIENT"],[119,"INSUFFICIENT"],[120,"PARTIAL"],[239,"PARTIAL"],[240,"COMPLETE"]]) {
    const result = aggregateCandlesFromMinutes({ candles: fourHourMinutes(count).reverse(), from, till, timeframe: "FOUR_HOURS" });
    const candle = result.candles[0];
    assert.equal(candle.coverage, coverage);
    assert.equal(candle.componentCount, count);
    assert.equal(candle.missingMinutes.length, 240 - count);
    assert.equal(result.candles.length, 1);
    assert.equal(candle.begin, "2026-09-15T05:00:00.000Z");
    assert.equal(candle.end, "2026-09-15T08:59:59.000Z");
    {
      assert.equal(candle.open, "10"); assert.equal(candle.close, String(10 + count));
      assert.equal(candle.high, String(11 + count)); assert.equal(candle.low, "9");
    }
  }
});

test("four-hour buckets align to Moscow midnight and cover exactly six non-overlapping intervals", () => {
  const source = fourHourMinutes(1440, 0);
  const { candles } = aggregateCandlesFromMinutes({ candles: source, from, till, timeframe: "FOUR_HOURS" });
  assert.equal(candles.length, 6);
  assert.equal(candles[0].begin, from);
  assert.equal(Date.parse(candles[5].end) + 1000, Date.parse(till));
  candles.forEach((c, i) => {
    assert.equal(c.componentCount, 240);
    assert.equal(c.open, source[i * 240].open);
    assert.equal(c.close, source[i * 240 + 239].close);
  });
});

test("four-hour calendar, details and recalculation are isolated from hourly results", async t => {
  const f = setup(t);
  const four = { ...command, timeframe: "FOUR_HOURS" };
  const source = [...fourHourMinutes(240), ...fourHourMinutes(120, 12), ...fourHourMinutes(119, 16)];
  f.load(source);
  await f.service.calculateDay(command);
  const hourly = f.repository.findByPeriod({ ...command, from, till });
  const calendar = () => f.service.calendar({ ...four, month: "2026-09" });
  assert.equal((await calendar()).days[14].status, "PENDING");
  for (let i = 0; i < 2; i++) {
    assert.equal((await f.api.calculateDay(four)).statusCode, 200);
    const day = (await calendar()).days[14];
    assert.equal(day.status, "CALCULATED");
    assert.deepEqual([day.completeCount, day.partialCount, day.insufficientCount], [1,1,1]);
    assert.equal(day.candleCount, 3);
  }
  assert.deepEqual(f.repository.findByPeriod({ ...command, from, till }), hourly);
  const details = await f.service.dayDetails(four);
  assert.equal(details.expectedMinutes, 240);
  assert.deepEqual(details.intervalCoverage.map(c => [c.hour, c.coverage]),
    [[0,"NO_DATA"],[4,"NO_DATA"],[8,"COMPLETE"],[12,"PARTIAL"],[16,"INSUFFICIENT"],[20,"NO_DATA"]]);
  assert.equal(details.candles.length, 3);
  assert.equal(details.candles[2].componentCount, 119);
  assert.equal(details.candles[2].coverage, "INSUFFICIENT");
  f.load(source, "2026-09-23T13:00:00.000Z");
  assert.equal((await calendar()).days[14].requiresRecalculation, true);
  assert.equal((await f.day()).requiresRecalculation, true);
});

test("four-hour empty days, failed loads and insufficient-only days stay distinct", async t => {
  const f = setup(t), four = { ...command, timeframe: "FOUR_HOURS" };
  assert.equal((await f.api.calculateDay(four)).statusCode, 409);
  f.load([]);
  assert.equal((await f.api.calculateDay(four)).body.status, "NO_DATA");
  f.load(fourHourMinutes(1));
  const result = await f.api.calculateDay(four);
  assert.equal(result.body.status, "CALCULATED");
  assert.equal(result.body.insufficientCount, 1);
  assert.equal(result.body.candleCount, 1);
});

test("aggregation timeframe migration preserves successful, empty and failed day records and is idempotent", t => {
  const database = new DatabaseSync(":memory:"); t.after(() => database.close());
  const schema = fs.readFileSync(path.resolve(__dirname, "../../../schema.sql"), "utf8")
    .replace("timeframe IN ('ONE_HOUR', 'FOUR_HOURS', 'ONE_DAY')", "timeframe = 'ONE_HOUR'");
  database.exec(schema);
  database.exec(`INSERT INTO moex_iss_candle_aggregation_result VALUES
    ('CNYRUB_TOM','ONE_HOUR','2026-09-15','done','source',NULL),
    ('CNYRUB_TOM','ONE_HOUR','2026-09-16',NULL,NULL,'failure'),
    ('CNYRUB_TOM','ONE_HOUR','2026-09-19','done','source',NULL)`);
  const before = database.prepare("SELECT * FROM moex_iss_candle_aggregation_result ORDER BY calculation_date").all();
  assert.equal(migrateAggregationTimeframes(database), true);
  assert.deepEqual(database.prepare("SELECT * FROM moex_iss_candle_aggregation_result ORDER BY calculation_date").all(), before);
  assert.equal(migrateAggregationTimeframes(database), false);
  database.exec(`INSERT INTO moex_iss_candle_aggregation_result
    (instrument_id,timeframe,calculation_date) VALUES ('CNYRUB_TOM','FOUR_HOURS','2026-09-15')`);
});
