"use strict";

const { checkDaySummaries, readSourceDayIntegrity } = require("./source-candle-integrity");

const DAY_MS = 86400000;
function invalid(message) {
  const error = new RangeError(message);
  error.code = "INVALID_SOURCE_CANDLE_CALENDAR_REQUEST";
  return error;
}
function calendarBounds(now = Date.now(), timeframe = "ONE_MINUTE") {
  if (!["ONE_MINUTE", "ONE_DAY"].includes(timeframe)) {
    throw invalid("Source timeframe must be ONE_MINUTE or ONE_DAY.");
  }
  const timestamp = Number(now);
  if (!Number.isFinite(timestamp)) throw invalid("Calendar clock is invalid.");
  const today = new Date(timestamp + 10800000).toISOString().slice(0,10);
  const throughDate = new Date(Date.parse(today) - DAY_MS).toISOString().slice(0,10);
  const earliest = new Date(Date.parse(today) - 366 * DAY_MS);
  if (timeframe === "ONE_DAY") {
    earliest.setTime(Date.parse(today));
    earliest.setUTCFullYear(earliest.getUTCFullYear() - 10);
  }
  const earliestDate = earliest.toISOString().slice(0,10);
  return {today,throughDate,earliestDate};
}
function sourceDayQuery({ instrumentId, date, timeframe = "ONE_MINUTE" }, now) {
  const bounds = calendarBounds(now, timeframe);
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)
      || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0,10) !== date
      || date < bounds.earliestDate || date > bounds.throughDate) {
    throw invalid("Choose a completed Moscow calendar day within the available calendar window.");
  }
  const from = Date.parse(`${date}T00:00:00+03:00`);
  return {instrumentId,timeframe,from:new Date(from).toISOString(),till:new Date(from+DAY_MS).toISOString()};
}
class GetSourceCandleCalendarUseCase {
  constructor({ marketSourceCandleRepository, now = Date.now }) {
    this.repository = marketSourceCandleRepository;
    this.now = now;
  }
  async execute({ instrumentId, month, timeframe = "ONE_MINUTE" }) {
    const bounds = calendarBounds(this.now(), timeframe);
    if (typeof month !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)
        || month < bounds.earliestDate.slice(0,7) || month > bounds.today.slice(0,7)) {
      throw invalid("Choose a month within the available calendar window.");
    }
    const fromDate = `${month}-01`;
    const first = new Date(`${fromDate}T00:00:00Z`);
    const next = new Date(first); next.setUTCMonth(next.getUTCMonth()+1);
    const throughDate = new Date(next.getTime()-DAY_MS).toISOString().slice(0,10);
    const summaries = new Map((await this.repository.findSourceDaySummaries({instrumentId,timeframe,fromDate,throughDate})).map(day => [day.date,day]));
    const otherTimeframe = timeframe === "ONE_MINUTE" ? "ONE_DAY" : "ONE_MINUTE";
    const otherSummaries = new Map((await this.repository.findSourceDaySummaries({instrumentId,timeframe:otherTimeframe,fromDate,throughDate})).map(day => [day.date,day]));
    const days = [];
    for (let t=first.getTime(); t<next.getTime(); t+=DAY_MS) {
      const date = new Date(t).toISOString().slice(0,10);
      const day = {date,candleCount:0,completedAt:null,lastError:null,firstCandleAt:null,lastCandleAt:null,...summaries.get(date)};
      const integrity = timeframe === "ONE_MINUTE" ? checkDaySummaries(day,otherSummaries.get(date))
        : checkDaySummaries(otherSummaries.get(date),day);
      const available = date >= bounds.earliestDate && date <= bounds.throughDate;
      const loadError = day.lastError && (!day.completedAt || day.candleCount === 0);
      const status = !available ? "UNAVAILABLE" : loadError || integrity.affectedTimeframe === timeframe ? "ERROR"
        : integrity.status === "MISMATCH" ? "INTEGRITY_WARNING"
        : day.completedAt ? (day.candleCount === 0 ? "NO_DATA" : "COMPLETED") : day.lastError ? "ERROR" : "PENDING";
      const {firstCandle,lastCandle,...view} = day;
      days.push({...view,available,status,integrity});
    }
    return {instrumentId,timeframe,month,...bounds,days};
  }
}
class LoadSourceCandleDayUseCase {
  constructor({ backfillRangeUseCase, marketSourceCandleRepository, verificationLogger, now = Date.now }) {
    if (typeof marketSourceCandleRepository?.findByPeriod !== "function" || typeof verificationLogger?.writeEvent !== "function") {
      throw new TypeError("Source day loading requires a source repository and a verification logger.");
    }
    this.backfillRangeUseCase = backfillRangeUseCase;
    this.repository = marketSourceCandleRepository;
    this.verificationLogger = verificationLogger;
    this.now = now;
  }
  async execute(command) {
    const query = sourceDayQuery(command,this.now());
    const before = await readSourceDayIntegrity(this.repository,query.instrumentId,command.date);
    const result = await this.loadRange(query,command.date,{retryEmptyRange:before.affectedTimeframe === query.timeframe});
    let dailyResult = {skipped:true};
    if (query.timeframe === "ONE_MINUTE") {
      const dailyQuery = {...query,timeframe:"ONE_DAY"};
      const dailyCandles = await this.repository.findByPeriod(dailyQuery);
      if (dailyCandles.length === 0) {
        const minutes = await this.repository.findByPeriod(query);
        dailyResult = await this.loadRange(dailyQuery,command.date,{retryEmptyRange:minutes.length > 0});
      }
    }
    const verification = await readSourceDayIntegrity(this.repository,query.instrumentId,command.date);
    const eventType = {MISMATCH:"OPEN_CLOSE_MISMATCH",MISSING_DAILY:"MISSING_DAILY_CANDLE",MISSING_MINUTES:"MISSING_MINUTE_CANDLES"}[verification.status];
    if (eventType) {
      await this.verificationLogger.writeEvent({
        eventType,
        checkedAt:new Date(this.now()).toISOString(),source:"MOEX_ISS",board:"CETS",
        instrumentId:query.instrumentId,date:command.date,...verification
      });
    }
    return {...result,skipped:result.skipped && dailyResult.skipped,dailySkipped:dailyResult.skipped,verification};
  }
  async loadRange(query, date, options) {
    try {
      return await this.backfillRangeUseCase.execute(query,options);
    } catch (error) {
      await this.verificationLogger.writeEvent({
        eventType:"LOAD_ERROR",checkedAt:new Date(this.now()).toISOString(),
        source:"MOEX_ISS",board:"CETS",instrumentId:query.instrumentId,date,timeframe:query.timeframe,
        errorCode:error.code || "SOURCE_LOAD_FAILED",message:error.message
      });
      throw error;
    }
  }
}
module.exports = { GetSourceCandleCalendarUseCase, LoadSourceCandleDayUseCase, calendarBounds, sourceDayQuery };
