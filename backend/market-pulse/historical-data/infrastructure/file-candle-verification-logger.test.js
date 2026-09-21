"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { FileCandleVerificationLogger } = require("./file-candle-verification-logger");

test("creates the log directory lazily and appends one escaped text line per mismatch",async t=>{
  const temporary=await fs.mkdtemp(path.join(os.tmpdir(),"candle-log-test-"));
  const directory=path.join(temporary,"candle_load");
  const logger=new FileCandleVerificationLogger({directory});
  t.after(async()=>{await fs.unlink(logger.filePath);await fs.rmdir(directory);await fs.rmdir(temporary);});
  await logger.writeEvent({status:"MATCH"});
  await assert.rejects(fs.stat(directory),{code:"ENOENT"});
  const entry={eventType:"OPEN_CLOSE_MISMATCH",status:"MISMATCH",checkedAt:"2026-09-21T10:00:00.000Z",date:"2026-09-15",instrumentId:"CNYRUB_TOM",dailyOpen:"12.5",firstMinuteOpen:"12.6"};
  await logger.writeEvent(entry);
  await logger.writeEvent({...entry,instrumentId:"line\nbreak"});
  const lines=(await fs.readFile(logger.filePath,"utf8")).trim().split("\n");
  assert.equal(lines.length,2);
  assert.deepEqual(JSON.parse(lines[0]),entry);
  assert.equal(JSON.parse(lines[1]).instrumentId,"line\nbreak");
  for (const eventType of ["LOAD_ERROR","MISSING_DAILY_CANDLE","MISSING_MINUTE_CANDLES"]) {
    await logger.writeEvent({eventType,date:entry.date,instrumentId:entry.instrumentId});
  }
  const events=(await fs.readFile(logger.filePath,"utf8")).trim().split("\n").map(JSON.parse);
  assert.deepEqual(events.slice(2).map(event=>event.eventType),["LOAD_ERROR","MISSING_DAILY_CANDLE","MISSING_MINUTE_CANDLES"]);
});
test("a log write failure is reported instead of silently losing the mismatch",async t=>{
  const temporary=await fs.mkdtemp(path.join(os.tmpdir(),"candle-log-failure-"));
  t.after(()=>fs.rmdir(temporary));
  const logger=new FileCandleVerificationLogger({directory:temporary});
  logger.filePath=temporary;
  await assert.rejects(logger.writeEvent({eventType:"LOAD_ERROR"}),{code:"CANDLE_VERIFICATION_LOG_FAILED"});
});
