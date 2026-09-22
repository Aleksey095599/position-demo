"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const { createHistoricalCandlesApi } = require("./historical-candles-api");
const command = {instrumentId:"CNYRUB_TOM",timeframe:"ONE_MINUTE",date:"2026-09-15"};
function setup(overrides={}) {
  return createHistoricalCandlesApi({
    getSourceCandleCalendarUseCase:{async execute(query){return query;}},
    loadSourceCandleDayUseCase:{async execute(query){return query;}},
    minRequestIntervalMs:0,...overrides
  });
}
test("exposes only local calendar reads and day loads",async()=>{
  const api=setup();
  assert.deepEqual(Object.keys(api).sort(),["calendar","loadDay"]);
  assert.deepEqual(await api.loadDay(command),{statusCode:200,body:command});
  const query={instrumentId:command.instrumentId,month:"2026-09"};
  assert.deepEqual((await api.calendar(new URLSearchParams(query))).body,{...query,timeframe:"ONE_MINUTE"});
});
test("rejects malformed parameters without reaching the loader",async()=>{
  const api=setup({loadSourceCandleDayUseCase:{execute(){assert.fail("Invalid input reached loader");}}});
  for(const body of [null,[],{}, {...command,from:"2026-09-15"},{...command,instrumentId:"OTHER"},{...command,timeframe:"FIVE_MINUTES"}]) {
    assert.equal((await api.loadDay(body)).statusCode,400);
  }
  for(const query of ["instrumentId=CNYRUB_TOM&month=2026-09&month=2026-08","instrumentId=OTHER&month=2026-09","instrumentId=CNYRUB_TOM&month=2026-09&extra=1"]) {
    assert.equal((await api.calendar(new URLSearchParams(query))).statusCode,400);
  }
});
test("spaces consecutive day loads from completion while local reads do not wait",async()=>{
  let clock=10000;const waits=[];
  const api=setup({now:()=>clock,minRequestIntervalMs:2000,sleep:async ms=>{waits.push(ms);clock+=ms;},loadSourceCandleDayUseCase:{async execute(){clock+=500;return {};}}});
  await api.loadDay(command);
  await api.calendar(new URLSearchParams({instrumentId:command.instrumentId,month:"2026-09"}));
  assert.deepEqual(waits,[]);
  await api.loadDay({...command,timeframe:"ONE_DAY"});
  assert.deepEqual(waits,[2000]);
});
test("source errors are mapped and release the loading lock for retry",async()=>{
  let fail=true;
  const api=setup({loadSourceCandleDayUseCase:{async execute(){if(fail)throw Object.assign(new Error("Source down"),{code:"MOEX_ISS_REQUEST_FAILED"});return {};}}});
  assert.equal((await api.loadDay(command)).statusCode,502);
  fail=false;assert.equal((await api.loadDay(command)).statusCode,200);
});
test("invalid dates and verification log failures retain their error classes",async()=>{
  for(const [code,statusCode] of [["INVALID_SOURCE_CANDLE_CALENDAR_REQUEST",400],["CANDLE_VERIFICATION_LOG_FAILED",500],["HISTORICAL_CANDLE_BACKFILL_PAGE_LIMIT_REACHED",502]]){
    const api=setup({loadSourceCandleDayUseCase:{async execute(){throw Object.assign(new Error(code),{code});}}});
    assert.equal((await api.loadDay(command)).statusCode,statusCode);
  }
});
test("validates required use cases and pacing configuration",()=>{
  assert.throws(()=>createHistoricalCandlesApi(),/calendar and day-loading/);
  for(const overrides of [{sleep:null},{now:null},{minRequestIntervalMs:-1}])assert.throws(()=>setup(overrides),/valid clock/);
});
