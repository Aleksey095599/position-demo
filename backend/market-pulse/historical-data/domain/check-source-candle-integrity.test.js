"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { checkSourceCandleIntegrity: check } = require("./check-source-candle-integrity");
const minute={begin:"2026-09-15T05:59:00Z",end:"2026-09-15T05:59:59Z",open:"12",high:"13",low:"11",close:"12.5"};
const daily={...minute,begin:"2026-09-14T21:00:00Z",end:"2026-09-15T20:59:59Z"};
test("distinguishes not requested, partial, confirmed empty, matching and mismatching data",()=>{
  const base={minuteCandles:[],dailyCandle:null,minuteLoadCompleted:false,dailyLoadCompleted:false};
  assert.equal(check(base).status,"NOT_CHECKED");
  assert.equal(check({...base,dailyCandle:daily,dailyLoadCompleted:true}).status,"NOT_CHECKED");
  assert.equal(check({...base,minuteCandles:[minute],dailyCandle:daily,dailyLoadCompleted:true}).status,"NOT_CHECKED");
  assert.equal(check({...base,minuteLoadCompleted:true,dailyLoadCompleted:true}).status,"EMPTY");
  assert.equal(check({...base,minuteCandles:[minute],dailyLoadCompleted:true}).affectedTimeframe,"ONE_DAY");
  assert.equal(check({...base,dailyCandle:daily,minuteLoadCompleted:true}).affectedTimeframe,"ONE_MINUTE");
  assert.equal(check({...base,minuteCandles:[minute],dailyCandle:daily,minuteLoadCompleted:true}).status,"MATCH");
  assert.equal(check({...base,minuteCandles:[minute],dailyCandle:{...daily,close:"12.6"},minuteLoadCompleted:true}).status,"MISMATCH");
});
