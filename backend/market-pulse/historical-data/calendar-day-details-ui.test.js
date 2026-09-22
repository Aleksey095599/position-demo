"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const source=fs.readFileSync(path.resolve(__dirname,"../../../frontend/features/market-pulse/market-calendar-day-details.js"),"utf8");
const context=vm.createContext({});vm.runInContext(source.slice(0,source.indexOf("    const marketCalendarDetailClose")),context);
const details=context.marketCalendarDayDetails;
const loaded={candleCount:599,completedAt:"2026-09-21T12:04:00Z",lastAttemptAt:"2026-09-21T12:00:00Z",firstCandleAt:"2026-09-15T06:00:00Z",lastCandleAt:"2026-09-15T15:59:00Z"};
test("loaded details contain candle start times and one loading timestamp without count duplication",()=>{
 const result=details(loaded,"ONE_MINUTE","COMPLETED");
 assert.equal(result.message,"");assert.deepEqual(Array.from(result.rows,row=>row[0]),["First candle starts","Last candle starts","Loaded at"]);
 assert.equal(result.rows[0][1],"09:00");assert.match(result.rows[2][1],/2026/);
 assert.equal(details(loaded,"ONE_DAY","COMPLETED").rows.length,1);
});
test("pending, empty and loading states have distinct explanations",()=>{
 assert.match(details({candleCount:0},"ONE_MINUTE","PENDING").message,/not been loaded/);
 assert.match(details({...loaded,candleCount:0},"ONE_MINUTE","COMPLETED").message,/returned no candles/);
 assert.match(details({},"ONE_MINUTE","LOADING").message,/Loading/);
});
test("source failures show a readable explanation while preserving the technical error",()=>{
 const lastError="MOEX_ISS_REQUEST_FAILED: <script>bad</script>";
 const result=details({candleCount:0,lastAttemptAt:loaded.lastAttemptAt,lastError},"ONE_MINUTE","ERROR");
 assert.match(result.message,/Could not retrieve data from MOEX ISS/);assert.doesNotMatch(result.message,/script|MOEX_ISS_/);
 assert.equal(result.technicalError,lastError);assert.equal(result.rows[0][0],"Last attempt");
});
test("integrity warnings present both sets of prices and missing data explains the affected timeframe",()=>{
 const integrity={status:"MISMATCH",dailyOpen:"12",dailyClose:"13",firstMinuteOpen:"12.1",lastMinuteClose:"12.9"};
 const result=details({...loaded,integrity},"ONE_MINUTE","INTEGRITY_WARNING");
 assert.equal(result.rows[0][1],"12 / 13");assert.equal(result.rows[1][1],"12.1 / 12.9");
 assert.match(details({integrity:{status:"MISSING_DAILY",affectedTimeframe:"ONE_DAY"}},"ONE_DAY","ERROR").message,/no daily candle/);
});
