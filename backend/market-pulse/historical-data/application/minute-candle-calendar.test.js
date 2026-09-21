"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { SqliteMarketSourceCandleRepository } = require("../infrastructure/persistence/sqlite-market-source-candle-repository");
const { BackfillHistoricalCandleRangeUseCase } = require("./backfill-historical-candle-range-use-case");
const { GetMinuteCandleCalendarUseCase, LoadMinuteCandleDayUseCase, minuteDayQuery, calendarBounds } = require("./minute-candle-calendar");
const { createHistoricalCandlesApi } = require("../api/historical-candles-api");
const now = () => Date.parse("2026-09-20T12:00:00Z");
const instrumentId = "CNYRUB_TOM";
function setup(t,source = {async loadCandlePage(){return {candles:[],hasMore:false,nextStart:null};}}) {
  const db = new DatabaseSync(":memory:");t.after(()=>db.close());
  db.exec(fs.readFileSync(path.resolve(__dirname,"../../../../schema.sql"),"utf8"));
  const repository = new SqliteMarketSourceCandleRepository({database:db});
  const loader = new BackfillHistoricalCandleRangeUseCase({historicalMarketDataSource:source,marketSourceCandleRepository:repository,now,minimumRequestIntervalMs:0});
  const calendar = new GetMinuteCandleCalendarUseCase({marketSourceCandleRepository:repository,now});
  const loadDay = new LoadMinuteCandleDayUseCase({backfillRangeUseCase:loader,now});
  const api = createHistoricalCandlesApi({getHistoricalCandlesUseCase:{execute:async()=>[]},getMinuteCandleCalendarUseCase:calendar,loadMinuteCandleDayUseCase:loadDay,now,minRequestIntervalMs:0});
  return {db,repository,calendar,loadDay,api};
}
function candle(at="2026-09-15T07:00:00.000Z") {
  return {begin:at,end:new Date(Date.parse(at)+59000).toISOString(),open:"12",high:"13",low:"11",close:"12.5"};
}
function write(repository,candles) {
  return repository.upsertAll({instrumentId,timeframe:"ONE_MINUTE",candles,dataSource:"MOEX_ISS",loadedAt:new Date(now()).toISOString()});
}
function month(calendar,month="2026-09") {return calendar.execute({instrumentId,month});}
test("calendar reads are local, count stored candles, and do not mark partial data complete",async t=>{
  const {repository,calendar}=setup(t,{loadCandlePage(){throw new Error("must not call source");}});
  write(repository,[candle(),candle("2026-09-14T21:00:00.000Z")]);
  const result=await month(calendar);
  assert.equal(result.days.length,30);
  const day=result.days.find(d=>d.date==="2026-09-15");
  assert.equal(day.candleCount,2);assert.equal(day.status,"PARTIAL");
  assert.equal(result.days.find(d=>d.date==="2026-09-14").candleCount,0);
  assert.equal(result.days.find(d=>d.date==="2026-09-20").available,false);
});
test("empty source day is successfully completed and skipped on retry",async t=>{
  let calls=0;const {calendar,loadDay}=setup(t,{async loadCandlePage(){calls++;return {candles:[],hasMore:false,nextStart:null};}});
  await loadDay.execute({instrumentId,date:"2026-09-19"});
  const result=await loadDay.execute({instrumentId,date:"2026-09-19"});
  assert.equal(result.skipped,true);assert.equal(calls,1);
  const day=(await month(calendar)).days[18];assert.equal(day.status,"COMPLETED");assert.equal(day.candleCount,0);
});
test("failure after the first page preserves old candles and persists an error without confirming the day",async t=>{
  let calls=0;
  const context=setup(t,{async loadCandlePage(){if(++calls===2)throw new Error("Upstream unavailable");return {candles:[candle("2026-09-15T07:01:00Z")],hasMore:true,nextStart:500};}});
  write(context.repository,[candle()]);
  await assert.rejects(context.loadDay.execute({instrumentId,date:"2026-09-15"}),/Upstream unavailable/);
  const day=(await month(context.calendar)).days[14];
  assert.equal(day.status,"ERROR");assert.equal(day.candleCount,1);assert.equal(day.completedAt,null);assert.match(day.lastError,/Upstream unavailable/);
  const reopened = new GetMinuteCandleCalendarUseCase({marketSourceCandleRepository:new SqliteMarketSourceCandleRepository({database:context.db}),now});
  assert.equal((await month(reopened)).days[14].status,"ERROR");
});
test("retry clears the saved error and atomically completes the day",async t=>{
  let fail=true;const {loadDay,calendar,repository}=setup(t,{async loadCandlePage(){if(fail)throw new Error("Temporary failure");return {candles:[candle()],hasMore:false,nextStart:null};}});
  await assert.rejects(loadDay.execute({instrumentId,date:"2026-09-15"}));fail=false;
  await loadDay.execute({instrumentId,date:"2026-09-15"});
  const day=(await month(calendar)).days[14];assert.equal(day.status,"COMPLETED");assert.equal(day.candleCount,1);assert.equal(day.lastError,null);
  repository.recordDayAttempt({...minuteDayQuery({instrumentId,date:"2026-09-15"},now()),attemptedAt:new Date(now()).toISOString(),error:"Later error"});
  const after=(await month(calendar)).days[14];assert.equal(after.status,"COMPLETED");assert.equal(after.lastError,"Later error");
});
test("calendar respects Moscow midnight, month length, and the 366-day bound",async t=>{
  assert.equal(calendarBounds(Date.parse("2026-09-19T21:00:00Z")).today,"2026-09-20");
  const {calendar,loadDay}=setup(t);
  assert.equal((await month(calendar,"2026-02")).days.length,28);
  for(const date of ["2026-09-20","2026-09-21","2025-09-18","2026-02-30","invalid"]) {
    await assert.rejects(loadDay.execute({instrumentId,date}),e=>e.code==="INVALID_MINUTE_CANDLE_CALENDAR_REQUEST");
  }
  for(const value of ["2026-13","2025-08","2026-10","invalid"]) await assert.rejects(month(calendar,value));
});
test("API validates exact calendar parameters and instrument without contacting the source",async t=>{
  const {api}=setup(t);
  for(const query of ["instrumentId=CNYRUB_TOM&month=2026-09&month=2026-08","instrumentId=CNYRUB_TOM&month=2026-09&timeframe=ONE_DAY","instrumentId=OTHER&month=2026-09"]) {
    assert.equal((await api.calendar(new URLSearchParams(query))).statusCode,400);
  }
  for(const body of [{instrumentId,date:"2026-09-15",timeframe:"ONE_DAY"},{instrumentId:"OTHER",date:"2026-09-15"},{instrumentId,date:"2026-09-20"}]) assert.equal((await api.loadDay(body)).statusCode,400);
  assert.equal((await api.calendar(new URLSearchParams({instrumentId,month:"2026-09"}))).statusCode,200);
});
test("a second load cannot run concurrently, while calendar reads remain available",async t=>{
  let release;const gate=new Promise(resolve=>{release=resolve;});
  let entered;const started=new Promise(resolve=>{entered=resolve;});
  const {api}=setup(t,{async loadCandlePage(){entered();await gate;return {candles:[],hasMore:false,nextStart:null};}});
  const first=api.loadDay({instrumentId,date:"2026-09-15"});await started;
  assert.equal((await api.loadDay({instrumentId,date:"2026-09-16"})).statusCode,429);
  assert.equal((await api.calendar(new URLSearchParams({instrumentId,month:"2026-09"}))).statusCode,200);
  release();assert.equal((await first).statusCode,200);
});
test("day schema rejects invalid dates and keeps one row per instrument and date",t=>{
  const {db}=setup(t);
  const insert=db.prepare("INSERT INTO moex_iss_minute_candle_load_days (instrument_id,load_date,last_attempt_at) VALUES (?,?,?)");
  for(const date of ['2026-02-30','2026-13-01','not-a-date']) assert.throws(()=>insert.run(instrumentId,date,new Date(now()).toISOString()),/CHECK/);
  insert.run(instrumentId,'2026-09-15',new Date(now()).toISOString());
  assert.throws(()=>insert.run(instrumentId,'2026-09-15',new Date(now()).toISOString()),/UNIQUE/);
});
