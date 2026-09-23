"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { DatabaseSync } = require("node:sqlite");
const { aggregateHourlyCandles } = require("./domain/aggregate-hourly-candles");
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

test("single-minute hours are skipped, empty hours are absent and exact next hour is separate", () => {
  assert.deepEqual(aggregateHourlyCandles({ candles: [], from, till }), {candles:[],skippedHours:[]});
  const {candles, skippedHours} = aggregateHourlyCandles({ candles: minutes([59, 60]), from, till });
  assert.equal(candles.length, 0);
  assert.equal(skippedHours.length, 2);
  for (const hour of skippedHours) {
    assert.equal(hour.componentCount, 1); assert.equal(hour.coverage,"INSUFFICIENT");
    assert.equal(hour.open, undefined);
  }
});

test("duplicate and misaligned minutes cannot produce a green coverage count", () => {
  assert.throws(() => aggregateHourlyCandles({ candles: [...minutes(), ...minutes([0])], from, till }), /unique/);
  assert.throws(() => aggregateHourlyCandles({ candles: [{ ...minutes([0])[0], begin: "2026-09-15T07:00:01.000Z" }], from, till }), /minute-aligned/);
});

test("fixed coverage thresholds include exactly 30 minutes and require exactly 60 for complete coverage", () => {
  for (const [count, coverage] of [[1,"INSUFFICIENT"],[29,"INSUFFICIENT"],[30,"PARTIAL"],[59,"PARTIAL"],[60,"COMPLETE"]]) {
    const result = aggregateHourlyCandles({candles:minutes(Array.from({length:count},(_,i)=>i)),from,till});
    const excluded = coverage === "INSUFFICIENT";
    assert.equal(result.candles.length, excluded ? 0 : 1);
    assert.equal(result.skippedHours.length, excluded ? 1 : 0);
    const hour = [...result.candles,...result.skippedHours][0];
    assert.equal(hour.coverage,coverage);
    assert.equal(hour.componentCount,count);
  }
});

test("mixed days retain eligible candles and expose skipped hours after repository reload", async t => {
  const f = setup(t);
  f.load(minutes([...Array.from({length:60},(_,i)=>i),60,...Array.from({length:58},(_,i)=>120+i)]));
  const response = await f.api.calculateDay(command);
  assert.equal(response.statusCode,200);
  assert.equal(response.body.status,"CALCULATED");
  assert.equal(response.body.candleCount,2);
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
  assert.equal(details.hourCoverage.length,24);
  assert.deepEqual(details.hourCoverage.filter(h=>h.coverage!=="NO_DATA").map(h=>[h.hour,h.coverage]),
    [[10,"COMPLETE"],[11,"INSUFFICIENT"],[12,"PARTIAL"]]);
  assert.equal(details.hourCoverage.filter(h=>h.coverage==="NO_DATA").length,21);
  assert.deepEqual(details.hours.map(h=>h.componentCount),[60,58]);
  assert.equal(details.skippedHours[0].componentCount,1);
  assert.equal(details.skippedHours[0].missingMinutes.length,59);
  assert.equal(details.skippedHours[0].open,undefined);
  assert.equal(f.source.findByPeriod({...command,timeframe:"ONE_MINUTE",from,till}).length,119);
});

test("all-insufficient days remain distinct from No data and recalculation is idempotent", async t => {
  const f = setup(t); f.load(minutes([0,1]));
  for (let attempt=0;attempt<2;attempt++) {
    const response = await f.api.calculateDay(command);
    assert.equal(response.body.status,"CALCULATED");
    assert.equal(response.body.candleCount,0);
    assert.equal((await f.day()).status,"CALCULATED");
    const details = await f.service.dayDetails(command);
    assert.equal(details.hours.length,0);
    assert.equal(details.skippedHours.length,1);
  }
});

test("legacy low-coverage candles require recalculation and are removed only when recalculated", async t => {
  const f = setup(t); f.load(minutes([0]));
  f.repository.replaceDay({...command,from,till,candles:[{...minutes([0])[0],componentCount:1}],
    calculatedAt:"2026-09-22T12:00:00.000Z",sourceLoadedAt:"2026-09-20T12:00:00.000Z"});
  assert.equal((await f.day()).status,"PENDING");
  assert.equal((await f.day()).requiresRecalculation,true);
  const before = await f.service.dayDetails(command);
  assert.equal(before.stale,true);
  assert.equal(before.hourCoverage,null);
  assert.equal(before.hours.length,1);
  assert.equal(before.skippedHours.length,0);
  await f.service.calculateDay(command);
  assert.equal((await f.day()).status,"CALCULATED");
  assert.equal(f.repository.findByPeriod({...command,from,till}).length,0);
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
  assert.equal(details.hours[0].missingMinutes.length, 30);
  assert.equal(details.hours[0].componentCount, 30);
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
  assert.equal((await f.service.dayDetails(command)).hours.length, 0);
  assert.ok((await f.service.dayDetails(command)).hourCoverage.every(hour=>hour.coverage==="NO_DATA"));
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
  assert.equal((await f.service.dayDetails(command)).hourCoverage,null);
});

test("a failed replacement rolls back the entire day", async t => {
  const f = setup(t); f.load(minutes()); await f.service.calculateDay(command);
  const { candles } = aggregateHourlyCandles({ candles: minutes(), from, till });
  assert.throws(() => f.repository.replaceDay({ ...command, from, till, candles: [{ ...candles[0], low: "-1" }],
    calculatedAt: "2026-09-23T12:00:00.000Z", sourceLoadedAt: "2026-09-20T12:00:00.000Z" }));
  assert.equal((await f.day()).status, "CALCULATED");
  assert.equal((await f.service.dayDetails(command)).hours[0].low, "9");
});

test("API rejects future days, bad dates, unsupported timeframes, duplicate and extra parameters", async t => {
  const f = setup(t);
  for (const body of [{ ...command, date: "2026-09-23" }, { ...command, date: "2026-02-30" },
    { ...command, timeframe: "FOUR_HOURS" }, { ...command, instrumentId: "UNKNOWN" }, { ...command, force: true }]) {
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
