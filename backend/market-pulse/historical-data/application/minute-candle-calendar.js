"use strict";

const DAY_MS = 86400000;
function invalid(message) {
  const error = new RangeError(message);
  error.code = "INVALID_MINUTE_CANDLE_CALENDAR_REQUEST";
  return error;
}
function calendarBounds(now = Date.now()) {
  const timestamp = Number(now);
  if (!Number.isFinite(timestamp)) throw invalid("Calendar clock is invalid.");
  const today = new Date(timestamp + 10800000).toISOString().slice(0,10);
  const throughDate = new Date(Date.parse(today) - DAY_MS).toISOString().slice(0,10);
  const earliestDate = new Date(Date.parse(today) - 366 * DAY_MS).toISOString().slice(0,10);
  return {today,throughDate,earliestDate};
}
function minuteDayQuery({ instrumentId, date }, now) {
  const bounds = calendarBounds(now);
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)
      || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0,10) !== date
      || date < bounds.earliestDate || date > bounds.throughDate) {
    throw invalid("Choose a completed Moscow calendar day within the latest 366 days.");
  }
  const from = Date.parse(`${date}T00:00:00+03:00`);
  return {instrumentId,timeframe:"ONE_MINUTE",from:new Date(from).toISOString(),till:new Date(from+DAY_MS).toISOString()};
}
class GetMinuteCandleCalendarUseCase {
  constructor({ marketSourceCandleRepository, now = Date.now }) {
    this.repository = marketSourceCandleRepository;
    this.now = now;
  }
  async execute({ instrumentId, month }) {
    const bounds = calendarBounds(this.now());
    if (typeof month !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)
        || month < bounds.earliestDate.slice(0,7) || month > bounds.today.slice(0,7)) {
      throw invalid("Choose a month within the available calendar window.");
    }
    const fromDate = `${month}-01`;
    const first = new Date(`${fromDate}T00:00:00Z`);
    const next = new Date(first); next.setUTCMonth(next.getUTCMonth()+1);
    const throughDate = new Date(next.getTime()-DAY_MS).toISOString().slice(0,10);
    const summaries = new Map((await this.repository.findMinuteDaySummaries({instrumentId,fromDate,throughDate})).map(day => [day.date,day]));
    const days = [];
    for (let t=first.getTime(); t<next.getTime(); t+=DAY_MS) {
      const date = new Date(t).toISOString().slice(0,10);
      const day = {date,candleCount:0,completedAt:null,lastAttemptAt:null,lastError:null,firstCandleAt:null,lastCandleAt:null,...summaries.get(date)};
      const available = date >= bounds.earliestDate && date <= bounds.throughDate;
      const status = !available ? "UNAVAILABLE" : day.completedAt ? "COMPLETED" : day.lastError ? "ERROR" : day.candleCount > 0 ? "PARTIAL" : "PENDING";
      days.push({...day,available,status});
    }
    return {instrumentId,month,...bounds,days};
  }
}
class LoadMinuteCandleDayUseCase {
  constructor({ backfillRangeUseCase, now = Date.now }) {
    this.backfillRangeUseCase = backfillRangeUseCase;
    this.now = now;
  }
  async execute(command) {
    return this.backfillRangeUseCase.execute(minuteDayQuery(command,this.now()));
  }
}
module.exports = { GetMinuteCandleCalendarUseCase, LoadMinuteCandleDayUseCase, calendarBounds, minuteDayQuery };
