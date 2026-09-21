"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { verifyDailyCandleOpenClose: verify } = require("./verify-daily-candle-open-close");
const candle = (begin,open,close) => ({begin,end:new Date(Date.parse(begin)+59000).toISOString(),open,close,high:"20",low:"1"});
const daily = {...candle("2026-09-14T21:00:00Z","12.50","13.00"),end:"2026-09-15T20:59:59Z"};
const first = candle("2026-09-15T05:59:00Z","12.5","12.7");
const last = candle("2026-09-15T15:59:00Z","12.8","13");

test("compares decimal Open/Close in chronological order without mutating input",()=>{
  const minutes=[last,first];
  const result=verify({dailyCandle:daily,minuteCandles:minutes});
  assert.equal(result.status,"MATCH");
  assert.equal(result.firstMinuteBegin,"2026-09-15T05:59:00.000Z");
  assert.equal(result.lastMinuteBegin,"2026-09-15T15:59:00.000Z");
  assert.equal(minutes[0],last);
});
test("reports either or both price mismatches without comparing High/Low",()=>{
  for (const [open,close] of [["12.51","13"],["12.5","13.01"],["12.51","13.01"]]) {
    const result=verify({dailyCandle:{...daily,open,close},minuteCandles:[first,last]});
    assert.equal(result.status,"MISMATCH");
    assert.equal(result.openMatches,open==="12.5");
    assert.equal(result.closeMatches,close==="13");
  }
  assert.equal(verify({dailyCandle:{...daily,high:"19",low:"2"},minuteCandles:[first,last]}).status,"MATCH");
});
test("supports a single minute and treats absent data as not checked",()=>{
  assert.equal(verify({dailyCandle:daily,minuteCandles:[{...first,close:"13"}]}).status,"MATCH");
  assert.equal(verify({dailyCandle:null,minuteCandles:[first]}).reason,"NO_DAILY_CANDLE");
  assert.equal(verify({dailyCandle:daily,minuteCandles:[]}).reason,"NO_MINUTE_CANDLES");
});
