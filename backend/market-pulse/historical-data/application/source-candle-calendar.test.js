"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { SqliteMarketSourceCandleRepository } = require("../infrastructure/persistence/sqlite-market-source-candle-repository");
const { BackfillHistoricalCandleRangeUseCase } = require("./backfill-historical-candle-range-use-case");
const { GetSourceCandleCalendarUseCase, LoadSourceCandleDayUseCase, sourceDayQuery, calendarBounds } = require("./source-candle-calendar");
const { createHistoricalCandlesApi } = require("../api/historical-candles-api");
const now = () => Date.parse("2026-09-20T12:00:00Z");
const instrumentId = "CNYRUB_TOM";
function setup(t,source = {async loadCandlePage(){return {candles:[],hasMore:false,nextStart:null};}}) {
  const db = new DatabaseSync(":memory:");t.after(()=>db.close());
  db.exec(fs.readFileSync(path.resolve(__dirname,"../../../../schema.sql"),"utf8"));
  const repository = new SqliteMarketSourceCandleRepository({database:db});
  const loader = new BackfillHistoricalCandleRangeUseCase({historicalMarketDataSource:source,marketSourceCandleRepository:repository,now,minimumRequestIntervalMs:0});
  const calendar = new GetSourceCandleCalendarUseCase({marketSourceCandleRepository:repository,now});
  const logEntries = [];
  const loadDay = new LoadSourceCandleDayUseCase({backfillRangeUseCase:loader,marketSourceCandleRepository:repository,verificationLogger:{async writeEvent(entry){logEntries.push(entry);}},now});
  const api = createHistoricalCandlesApi({getSourceCandleCalendarUseCase:calendar,loadSourceCandleDayUseCase:loadDay,now,minRequestIntervalMs:0});
  return {db,repository,calendar,loadDay,api,logEntries};
}
function candle(at="2026-09-15T07:00:00.000Z") {
  return {begin:at,end:new Date(Date.parse(at)+59000).toISOString(),open:"12",high:"13",low:"11",close:"12.5"};
}
// Seed historical/inconsistent records directly; production has no untracked writer.
function seedUntracked(repository, {instrumentId,timeframe,candles,dataSource,loadedAt}) {
  const table = timeframe === "ONE_DAY" ? "moex_iss_day_candles" : "moex_iss_minute_candles";
  const insert = repository.database.prepare("INSERT INTO " + table + " VALUES (?,?,?,?,?,?,?,?,?,?)");
  for (const c of candles) insert.run(instrumentId,timeframe,c.begin,c.end,c.open,c.high,c.low,c.close,dataSource,loadedAt);
}
function write(repository,candles) {
  return seedUntracked(repository,{instrumentId,timeframe:"ONE_MINUTE",candles,dataSource:"MOEX_ISS",loadedAt:new Date(now()).toISOString()});
}
function month(calendar,month="2026-09") {return calendar.execute({instrumentId,month});}
test("calendar reads are local, count stored candles, and do not mark partial data complete",async t=>{
  const {repository,calendar}=setup(t,{loadCandlePage(){throw new Error("must not call source");}});
  write(repository,[candle(),candle("2026-09-14T21:00:00.000Z")]);
  const result=await month(calendar);
  assert.equal(result.days.length,30);
  const day=result.days.find(d=>d.date==="2026-09-15");
  assert.equal(day.candleCount,2);assert.equal(day.status,"PENDING");
  assert.equal(result.days.find(d=>d.date==="2026-09-14").candleCount,0);
  assert.equal(result.days.find(d=>d.date==="2026-09-20").available,false);
});
test("empty source day is successfully completed and skipped on retry",async t=>{
  let calls=0;const {calendar,loadDay}=setup(t,{async loadCandlePage(){calls++;return {candles:[],hasMore:false,nextStart:null};}});
  await loadDay.execute({instrumentId,date:"2026-09-19"});
  const result=await loadDay.execute({instrumentId,date:"2026-09-19"});
  assert.equal(result.skipped,true);assert.equal(calls,2);
  const day=(await month(calendar)).days[18];assert.equal(day.status,"NO_DATA");assert.equal(day.candleCount,0);
});
test("failure after the first page preserves old candles and persists an error without confirming the day",async t=>{
  let calls=0;
  const context=setup(t,{async loadCandlePage(){if(++calls===2)throw new Error("Upstream unavailable");return {candles:[candle("2026-09-15T07:01:00Z")],hasMore:true,nextStart:500};}});
  write(context.repository,[candle()]);
  await assert.rejects(context.loadDay.execute({instrumentId,date:"2026-09-15"}),/Upstream unavailable/);
  const day=(await month(context.calendar)).days[14];
  assert.equal(day.status,"ERROR");assert.equal(day.candleCount,1);assert.equal(day.completedAt,null);assert.match(day.lastError,/Upstream unavailable/);
  const reopened = new GetSourceCandleCalendarUseCase({marketSourceCandleRepository:new SqliteMarketSourceCandleRepository({database:context.db}),now});
  assert.equal((await month(reopened)).days[14].status,"ERROR");
});
test("retry clears the saved error and atomically completes the day",async t=>{
  let fail=true;const {loadDay,calendar,repository}=setup(t,{async loadCandlePage(){if(fail)throw new Error("Temporary failure");return {candles:[candle()],hasMore:false,nextStart:null};}});
  await assert.rejects(loadDay.execute({instrumentId,date:"2026-09-15"}));fail=false;
  await loadDay.execute({instrumentId,date:"2026-09-15"});
  const day=(await month(calendar)).days[14];assert.equal(day.status,"COMPLETED");assert.equal(day.candleCount,1);assert.equal(day.lastError,null);
  repository.recordDayAttempt({...sourceDayQuery({instrumentId,date:"2026-09-15"},now()),attemptedAt:new Date(now()).toISOString(),error:"Later error"});
  const after=(await month(calendar)).days[14];assert.equal(after.status,"COMPLETED");assert.equal(after.lastError,"Later error");
});
test("calendar respects Moscow midnight, month length, and the 366-day bound",async t=>{
  assert.equal(calendarBounds(Date.parse("2026-09-19T21:00:00Z")).today,"2026-09-20");
  const {calendar,loadDay}=setup(t);
  assert.equal((await month(calendar,"2026-02")).days.length,28);
  for(const date of ["2026-09-20","2026-09-21","2025-09-18","2026-02-30","invalid"]) {
    await assert.rejects(loadDay.execute({instrumentId,date}),e=>e.code==="INVALID_SOURCE_CANDLE_CALENDAR_REQUEST");
  }
  for(const value of ["2026-13","2025-08","2026-10","invalid"]) await assert.rejects(month(calendar,value));
});
test("API validates exact calendar parameters and instrument without contacting the source",async t=>{
  const {api}=setup(t);
  for(const query of ["instrumentId=CNYRUB_TOM&month=2026-09&month=2026-08","instrumentId=CNYRUB_TOM&month=2026-09&timeframe=ONE_HOUR","instrumentId=OTHER&month=2026-09","instrumentId=CNYRUB_TOM&month=2026-09&timeframe=ONE_DAY&timeframe=ONE_MINUTE"]) {
    assert.equal((await api.calendar(new URLSearchParams(query))).statusCode,400);
  }
  for(const body of [{instrumentId,date:"2026-09-15",timeframe:"ONE_HOUR"},{instrumentId:"OTHER",date:"2026-09-15"},{instrumentId,date:"2026-09-20"}]) assert.equal((await api.loadDay(body)).statusCode,400);
  assert.equal((await api.calendar(new URLSearchParams({instrumentId,month:"2026-09"}))).statusCode,200);
});
test("a second load cannot run concurrently, while calendar reads remain available",async t=>{
  let release;const gate=new Promise(resolve=>{release=resolve;});
  let entered;const started=new Promise(resolve=>{entered=resolve;});
  const {api}=setup(t,{async loadCandlePage(){entered();await gate;return {candles:[],hasMore:false,nextStart:null};}});
  const first=api.loadDay({instrumentId,date:"2026-09-15"});await started;
  assert.equal((await api.loadDay({instrumentId,date:"2026-09-16",timeframe:"ONE_DAY"})).statusCode,429);
  assert.equal((await api.calendar(new URLSearchParams({instrumentId,month:"2026-09"}))).statusCode,200);
  release();assert.equal((await first).statusCode,200);
});
test("day schema rejects invalid dates and keeps one row per instrument and date",t=>{
  const {db}=setup(t);
  const insert=db.prepare("INSERT INTO moex_iss_minute_candle_load_result (instrument_id,load_date,last_attempt_at) VALUES (?,?,?)");
  for(const date of ['2026-02-30','2026-13-01','not-a-date']) assert.throws(()=>insert.run(instrumentId,date,new Date(now()).toISOString()),/CHECK/);
  insert.run(instrumentId,'2026-09-15',new Date(now()).toISOString());
  assert.throws(()=>insert.run(instrumentId,'2026-09-15',new Date(now()).toISOString()),/UNIQUE/);
});

test("daily calendar loads native MOEX daily candles, independently from minute data", async t => {
  const { MoexIssHistoricalMarketDataSource } = require("../infrastructure/moex-iss-historical-market-data-source");
  const requests = [];
  const source = new MoexIssHistoricalMarketDataSource({ fetchImpl: async url => {
    requests.push(new URL(url));
    return {ok:true,status:200,json:async () => ({candles:{
      columns:["open","close","high","low","begin","end"],
      data:[[12,12.5,13,11,"2020-09-15 00:00:00","2020-09-15 23:59:59"]]
    }})};
  }});
  const {api,repository,db,calendar} = setup(t,source);
  const command = {instrumentId,timeframe:"ONE_DAY",date:"2020-09-15"};
  assert.equal((await api.loadDay(command)).statusCode,200);
  assert.equal((await api.loadDay(command)).statusCode,200);
  assert.equal(requests.length,1);
  assert.equal(requests[0].searchParams.get("interval"),"24");
  assert.match(requests[0].searchParams.get("from"),/^2020-09-15/);
  const saved = repository.findByPeriod(sourceDayQuery(command,now()));
  assert.equal(saved.length,1);
  assert.equal(saved[0].begin,"2020-09-14T21:00:00.000Z");
  assert.equal(db.prepare("SELECT COUNT(*) n FROM moex_iss_minute_candles").get().n,0);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM moex_iss_minute_candle_load_result").get().n,0);
  const result = await calendar.execute({instrumentId,timeframe:"ONE_DAY",month:"2020-09"});
  assert.equal(result.timeframe,"ONE_DAY");
  assert.equal(result.days[14].status,"COMPLETED");
  assert.equal(result.days[14].candleCount,1);
  assert.equal((await calendar.execute({instrumentId:"OTHER",timeframe:"ONE_DAY",month:"2020-09"})).days[14].status,"PENDING");
});

test("daily empty days are completed and failures persist until a successful retry", async t => {
  let fail = true, calls = 0;
  const {loadDay,calendar,db} = setup(t,{async loadCandlePage(){
    calls++;
    if (fail) throw new Error("Temporary daily failure");
    return {candles:[],hasMore:false,nextStart:null};
  }});
  const command = {instrumentId,timeframe:"ONE_DAY",date:"2026-09-19"};
  await assert.rejects(loadDay.execute(command),/Temporary daily failure/);
  const reopened = new GetSourceCandleCalendarUseCase({marketSourceCandleRepository:new SqliteMarketSourceCandleRepository({database:db}),now});
  const failed = (await reopened.execute({instrumentId,timeframe:"ONE_DAY",month:"2026-09"})).days[18];
  assert.equal(failed.status,"ERROR");
  assert.equal(failed.completedAt,null);
  assert.match(failed.lastError,/Temporary daily failure/);
  assert.equal((await month(calendar)).days[18].status,"PENDING");
  fail = false;
  await loadDay.execute(command);
  assert.equal((await loadDay.execute(command)).skipped,true);
  assert.equal(calls,2);
  const completed = (await reopened.execute({instrumentId,timeframe:"ONE_DAY",month:"2026-09"})).days[18];
  assert.equal(completed.status,"NO_DATA");
  assert.equal(completed.candleCount,0);
  assert.equal(completed.lastError,null);
});

test("a daily candle alone does not confirm coverage and a failed save rolls back the entire day", async t => {
  const dailyCandle = {...candle("2026-09-14T21:00:00.000Z"),end:"2026-09-15T20:59:59.000Z"};
  const {repository,loadDay,calendar,db} = setup(t,{async loadCandlePage(){return {candles:[dailyCandle],hasMore:false,nextStart:null};}});
  seedUntracked(repository,{instrumentId,timeframe:"ONE_DAY",candles:[{...dailyCandle,close:"12"}],dataSource:"MOEX_ISS",loadedAt:new Date(now()).toISOString()});
  assert.equal((await calendar.execute({instrumentId,timeframe:"ONE_DAY",month:"2026-09"})).days[14].status,"PENDING");
  db.exec("CREATE TRIGGER fail_daily_coverage BEFORE INSERT ON moex_iss_day_candle_load_result WHEN NEW.completed_at IS NOT NULL BEGIN SELECT RAISE(ABORT,'Test coverage failure'); END");
  await assert.rejects(loadDay.execute({instrumentId,timeframe:"ONE_DAY",date:"2026-09-15"}),/Test coverage failure/);
  assert.equal(repository.findLatest({instrumentId,timeframe:"ONE_DAY"}).close,"12");
  assert.equal((await calendar.execute({instrumentId,timeframe:"ONE_DAY",month:"2026-09"})).days[14].status,"ERROR");
});

test("daily calendar permits ten years but excludes today and does not widen the minute window", async t => {
  const {calendar,loadDay,api} = setup(t);
  const query = {instrumentId,timeframe:"ONE_DAY",month:"2016-09"};
  const result = await calendar.execute(query);
  assert.equal(result.earliestDate,"2016-09-20");
  assert.equal(result.days[18].available,false);
  assert.equal(result.days[19].available,true);
  assert.equal((await calendar.execute({...query,month:"2024-02"})).days.length,29);
  assert.equal((await api.calendar(new URLSearchParams(query))).statusCode,200);
  for (const date of ["2016-09-19","2026-09-20","2026-09-21","2020-02-30"]) {
    await assert.rejects(loadDay.execute({instrumentId,timeframe:"ONE_DAY",date}),e=>e.code==="INVALID_SOURCE_CANDLE_CALENDAR_REQUEST");
  }
  await assert.rejects(loadDay.execute({instrumentId,timeframe:"ONE_MINUTE",date:"2020-09-15"}));
});

function dailyCandle(close="12.5") {
  return {...candle("2026-09-14T21:00:00.000Z"),end:"2026-09-15T20:59:59.000Z",close};
}
test("minute day loading saves minutes first, then loads and verifies the daily candle",async t=>{
  const requests=[];
  const {loadDay,repository,logEntries}=setup(t,{async loadCandlePage(query){
    requests.push(query.timeframe);
    if(query.timeframe==="ONE_DAY") assert.equal(repository.findByPeriod({...query,timeframe:"ONE_MINUTE"}).length,1);
    return {candles:[query.timeframe==="ONE_MINUTE"?candle():dailyCandle()],hasMore:false,nextStart:null};
  }});
  const command={instrumentId,date:"2026-09-15"};
  const result=await loadDay.execute(command);
  assert.deepEqual(requests,["ONE_MINUTE","ONE_DAY"]);
  assert.equal(result.verification.status,"MATCH");
  assert.equal(logEntries.length,0);
  const retry=await loadDay.execute(command);
  assert.equal(retry.skipped,true);
  assert.equal(retry.verification.status,"MATCH");
  assert.equal(requests.length,2);
});
test("an existing daily candle is reused and a price mismatch is logged without failing the load",async t=>{
  const requests=[];
  const {loadDay,repository,logEntries}=setup(t,{async loadCandlePage(query){
    requests.push(query.timeframe);return {candles:[candle()],hasMore:false,nextStart:null};
  }});
  seedUntracked(repository,{instrumentId,timeframe:"ONE_DAY",candles:[dailyCandle("12.6")],dataSource:"MOEX_ISS",loadedAt:new Date(now()).toISOString()});
  const result=await loadDay.execute({instrumentId,date:"2026-09-15"});
  assert.deepEqual(requests,["ONE_MINUTE"]);
  assert.equal(result.verification.status,"MISMATCH");
  assert.equal(result.verification.openMatches,true);
  assert.equal(result.verification.closeMatches,false);
  assert.equal(logEntries.length,1);
  assert.equal(logEntries[0].date,"2026-09-15");
  assert.equal(logEntries[0].dailyClose,"12.6");
  assert.equal(logEntries[0].lastMinuteClose,"12.5");
  assert.equal(repository.findLatest({instrumentId,timeframe:"ONE_DAY"}).close,"12.6");
});
test("daily request failure preserves minutes and retry fetches only the daily candle",async t=>{
  let fail=true;
  const requests=[];
  const {loadDay,repository,logEntries}=setup(t,{async loadCandlePage(query){
    requests.push(query.timeframe);
    if(query.timeframe==="ONE_DAY" && fail) throw new Error("Daily unavailable");
    return {candles:[query.timeframe==="ONE_MINUTE"?candle():dailyCandle()],hasMore:false,nextStart:null};
  }});
  const command={instrumentId,date:"2026-09-15"};
  await assert.rejects(loadDay.execute(command),/Daily unavailable/);
  assert.equal(repository.coversLoadedRange(sourceDayQuery(command,now())),true);
  assert.equal(logEntries.length,1);
  assert.equal(logEntries[0].eventType,"LOAD_ERROR");
  assert.equal(logEntries[0].timeframe,"ONE_DAY");
  fail=false;
  const result=await loadDay.execute(command);
  assert.deepEqual(requests,["ONE_MINUTE","ONE_DAY","ONE_DAY"]);
  assert.equal(result.verification.status,"MATCH");
});
test("an empty daily response with minutes is logged and retried without reloading minutes",async t=>{
  let calls=0;
  const {loadDay,logEntries}=setup(t,{async loadCandlePage(query){
    calls++;return {candles:query.timeframe==="ONE_MINUTE"?[candle()]:[],hasMore:false,nextStart:null};
  }});
  const command={instrumentId,date:"2026-09-15"};
  assert.equal((await loadDay.execute(command)).verification.status,"MISSING_DAILY");
  assert.equal((await loadDay.execute(command)).verification.status,"MISSING_DAILY");
  assert.equal(calls,3);
  assert.equal(logEntries.length,2);
  assert.equal(logEntries[0].eventType,"MISSING_DAILY_CANDLE");
});
test("a logger failure reaches the API without reverting candles",async t=>{
  const {api,loadDay,repository}=setup(t,{async loadCandlePage(query){
    return {candles:[query.timeframe==="ONE_MINUTE"?candle():dailyCandle("12.6")],hasMore:false,nextStart:null};
  }});
  loadDay.verificationLogger={async writeEvent(){const error=new Error("Candle verification log could not be written.");error.code="CANDLE_VERIFICATION_LOG_FAILED";throw error;}};
  const response=await api.loadDay({instrumentId,date:"2026-09-15"});
  assert.equal(response.statusCode,500);
  assert.equal(repository.findLatest({instrumentId,timeframe:"ONE_DAY"}).close,"12.6");
  assert.equal(repository.findLatest({instrumentId,timeframe:"ONE_MINUTE"}).close,"12.5");
});

function saveDay(repository,timeframe,candles) {
  repository.upsertLoadedRange({...sourceDayQuery({instrumentId,timeframe,date:"2026-09-15"},now()),candles,dataSource:"MOEX_ISS",loadedAt:new Date(now()).toISOString()});
}
async function statuses(calendar) {
  return Promise.all(["ONE_MINUTE","ONE_DAY"].map(async timeframe=>(await calendar.execute({instrumentId,timeframe,month:"2026-09"})).days[14].status));
}
test("loading a daily candle checks saved complete minutes and warns in both calendars without loading minutes",async t=>{
  const requests=[];
  const {repository,loadDay,calendar,logEntries}=setup(t,{async loadCandlePage(query){
    requests.push(query.timeframe);return {candles:[dailyCandle("12.6")],hasMore:false,nextStart:null};
  }});
  saveDay(repository,"ONE_MINUTE",[candle()]);
  const result=await loadDay.execute({instrumentId,timeframe:"ONE_DAY",date:"2026-09-15"});
  assert.equal(result.verification.status,"MISMATCH");
  assert.deepEqual(requests,["ONE_DAY"]);
  assert.equal(logEntries[0].eventType,"OPEN_CLOSE_MISMATCH");
  assert.deepEqual(await statuses(calendar),["INTEGRITY_WARNING","INTEGRITY_WARNING"]);
  assert.deepEqual(await statuses(calendar),["INTEGRITY_WARNING","INTEGRITY_WARNING"]);
  assert.equal(logEntries.length,1);
  assert.equal(requests.length,1);
});
test("daily data alone is loaded, not an error; partial minutes are not compared",async t=>{
  const {repository,loadDay,calendar,logEntries}=setup(t,{async loadCandlePage(query){
    assert.equal(query.timeframe,"ONE_DAY");return {candles:[dailyCandle("12.6")],hasMore:false,nextStart:null};
  }});
  const result=await loadDay.execute({instrumentId,timeframe:"ONE_DAY",date:"2026-09-15"});
  assert.equal(result.verification.status,"NOT_CHECKED");
  assert.deepEqual(await statuses(calendar),["PENDING","COMPLETED"]);
  write(repository,[candle()]);
  assert.deepEqual(await statuses(calendar),["PENDING","COMPLETED"]);
  assert.equal(logEntries.length,0);
});
test("empty minute data with a daily candle is an error only in minutes and can be retried",async t=>{
  let empty=true;
  const requests=[];
  const {repository,loadDay,calendar,logEntries}=setup(t,{async loadCandlePage(query){
    requests.push(query.timeframe);return {candles:empty?[]:[candle()],hasMore:false,nextStart:null};
  }});
  saveDay(repository,"ONE_DAY",[dailyCandle()]);
  const command={instrumentId,timeframe:"ONE_MINUTE",date:"2026-09-15"};
  assert.equal((await loadDay.execute(command)).verification.status,"MISSING_MINUTES");
  assert.deepEqual(await statuses(calendar),["ERROR","COMPLETED"]);
  assert.equal(logEntries[0].eventType,"MISSING_MINUTE_CANDLES");
  empty=false;
  assert.equal((await loadDay.execute(command)).verification.status,"MATCH");
  assert.deepEqual(await statuses(calendar),["COMPLETED","COMPLETED"]);
  assert.deepEqual(requests,["ONE_MINUTE","ONE_MINUTE"]);
  await loadDay.execute(command);
  assert.equal(requests.length,2);
});
test("missing daily data stays red through a failed retry and recovers without fetching minutes",async t=>{
  let mode="empty";
  const requests=[];
  const {repository,loadDay,calendar,logEntries}=setup(t,{async loadCandlePage(query){
    requests.push(query.timeframe);
    if(mode==="fail") throw new Error("Daily retry unavailable");
    return {candles:mode==="empty"?[]:[dailyCandle()],hasMore:false,nextStart:null};
  }});
  saveDay(repository,"ONE_MINUTE",[candle()]);
  const command={instrumentId,timeframe:"ONE_DAY",date:"2026-09-15"};
  assert.equal((await loadDay.execute(command)).verification.status,"MISSING_DAILY");
  assert.deepEqual(await statuses(calendar),["COMPLETED","ERROR"]);
  mode="fail";
  await assert.rejects(loadDay.execute(command),/Daily retry unavailable/);
  assert.deepEqual(await statuses(calendar),["COMPLETED","ERROR"]);
  assert.deepEqual(logEntries.map(entry=>entry.eventType),["MISSING_DAILY_CANDLE","LOAD_ERROR"]);
  mode="match";
  assert.equal((await loadDay.execute(command)).verification.status,"MATCH");
  assert.deepEqual(await statuses(calendar),["COMPLETED","COMPLETED"]);
  assert.deepEqual(requests,["ONE_DAY","ONE_DAY","ONE_DAY"]);
});
test("both confirmed empty datasets show No data without warnings, logs or repeat source requests",async t=>{
  let calls=0;
  const {loadDay,calendar,logEntries}=setup(t,{async loadCandlePage(){calls++;return {candles:[],hasMore:false,nextStart:null};}});
  const command={instrumentId,date:"2026-09-15"};
  assert.equal((await loadDay.execute(command)).verification.status,"EMPTY");
  assert.equal((await loadDay.execute(command)).verification.status,"EMPTY");
  assert.deepEqual(await statuses(calendar),["NO_DATA","NO_DATA"]);
  assert.equal(logEntries.length,0);
  assert.equal(calls,2);
});
test("failed attempts take priority over No data in both source calendars",async t=>{
  const {repository,calendar}=setup(t);
  for (const timeframe of ["ONE_MINUTE","ONE_DAY"]) {
    saveDay(repository,timeframe,[]);
    repository.recordDayAttempt({...sourceDayQuery({instrumentId,timeframe,date:"2026-09-15"},now()),attemptedAt:new Date(now()).toISOString(),error:"Source unavailable"});
  }
  assert.deepEqual(await statuses(calendar),["ERROR","ERROR"]);
});

test("a failed daily request leaves the minute calendar loaded and the daily calendar red",async t=>{
  const {loadDay,calendar,logEntries}=setup(t,{async loadCandlePage(query){
    if(query.timeframe==="ONE_DAY") throw new Error("Daily unavailable");
    return {candles:[candle()],hasMore:false,nextStart:null};
  }});
  await assert.rejects(loadDay.execute({instrumentId,date:"2026-09-15"}),/Daily unavailable/);
  assert.deepEqual(await statuses(calendar),["COMPLETED","ERROR"]);
  assert.equal(logEntries.length,1);
  assert.equal(logEntries[0].eventType,"LOAD_ERROR");
});


test("successful source day loading retains the attempt start separately from completion",async t=>{
  const {db,repository}=setup(t);
  let clock=Date.parse("2026-09-20T12:00:00Z");
  const loader=new BackfillHistoricalCandleRangeUseCase({marketSourceCandleRepository:repository,now:()=>clock,minimumRequestIntervalMs:0,
    historicalMarketDataSource:{async loadCandlePage(){clock+=5000;return {candles:[],hasMore:false,nextStart:null};}}});
  const query=sourceDayQuery({instrumentId,date:"2026-09-15"},now());
  await loader.execute(query);
  const row=db.prepare("SELECT * FROM moex_iss_minute_candle_load_result").get();
  assert.equal(row.last_attempt_at,"2026-09-20T12:00:00.000Z");assert.equal(row.completed_at,"2026-09-20T12:00:05.000Z");
  clock+=10000;await loader.execute(query);
  assert.deepEqual(db.prepare("SELECT * FROM moex_iss_minute_candle_load_result").get(),row);
});
