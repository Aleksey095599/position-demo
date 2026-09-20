"use strict";

const {
  CandleTimeframe
} = require("../domain/candle-timeframe");
const {
  createHistoricalCandlesQuery
} = require("./historical-candles-query");

const MOSCOW_TIME_ZONE = "Europe/Moscow";
const SECOND_MS = 1000;
const DAY_MS = 24 * 60 * 60 * SECOND_MS;
const MINUTE_LOOKBACK_YEARS = 1;
const DAILY_LOOKBACK_YEARS = 10;
const MOSCOW_DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: MOSCOW_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23"
});

function planError(message) {
  const error = new RangeError(message);
  error.code = "INVALID_HISTORICAL_CANDLE_BACKFILL_PLAN";
  return error;
}

function timestampOf(value) {
  const timestamp = value instanceof Date
    ? value.getTime()
    : typeof value === "number"
      ? value
      : Date.parse(value);

  if (!Number.isFinite(timestamp)) {
    throw planError("Backfill As Of must be a valid timestamp.");
  }

  return timestamp;
}

function moscowParts(timestamp) {
  const parts = Object.fromEntries(
    MOSCOW_DATE_TIME_FORMATTER
      .formatToParts(new Date(timestamp))
      .filter(part => part.type !== "literal")
      .map(part => [part.type, Number(part.value)])
  );

  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second
  };
}

function utcTimestamp(parts) {
  return Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour ?? 0,
    parts.minute ?? 0,
    parts.second ?? 0
  );
}

function moscowOffset(timestamp) {
  const secondAlignedTimestamp = Math.floor(timestamp / SECOND_MS) * SECOND_MS;

  return utcTimestamp(moscowParts(secondAlignedTimestamp))
    - secondAlignedTimestamp;
}

function moscowTimestamp(parts) {
  const localTimestamp = utcTimestamp(parts);
  let timestamp = localTimestamp - moscowOffset(localTimestamp);

  // A second pass keeps the conversion correct across historical offset changes.
  timestamp = localTimestamp - moscowOffset(timestamp);

  return timestamp;
}

function dateParts(parts) {
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: 0,
    minute: 0,
    second: 0
  };
}

function addCalendarDays(parts, days) {
  const shifted = new Date(utcTimestamp(parts) + days * DAY_MS);

  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: 0,
    minute: 0,
    second: 0
  };
}

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function addCalendarYears(parts, years) {
  const year = parts.year + years;

  return {
    year,
    month: parts.month,
    day: Math.min(parts.day, daysInMonth(year, parts.month)),
    hour: 0,
    minute: 0,
    second: 0
  };
}

function range({ instrumentId, timeframe, fromParts, tillParts }) {
  return createHistoricalCandlesQuery({
    instrumentId,
    timeframe,
    from: new Date(moscowTimestamp(fromParts)).toISOString(),
    till: new Date(moscowTimestamp(tillParts)).toISOString()
  });
}

function frozenWindow(ranges) {
  return Object.freeze({
    from: ranges[0].from,
    till: ranges[ranges.length - 1].till
  });
}

function createHistoricalCandleBackfillPlan({ instrumentId, asOf = Date.now() } = {}) {
  const asOfTimestamp = timestampOf(asOf);
  const currentMoscowDay = dateParts(moscowParts(asOfTimestamp));
  const firstMinuteDay = addCalendarYears(
    currentMoscowDay,
    -MINUTE_LOOKBACK_YEARS
  );
  const minuteRanges = [];

  for (
    let cursor = firstMinuteDay;
    moscowTimestamp(cursor) < moscowTimestamp(currentMoscowDay);
    cursor = addCalendarDays(cursor, 1)
  ) {
    minuteRanges.push(range({
      instrumentId,
      timeframe: CandleTimeframe.ONE_MINUTE,
      fromParts: cursor,
      tillParts: addCalendarDays(cursor, 1)
    }));
  }

  const dailyRanges = [];

  for (let offset = -DAILY_LOOKBACK_YEARS; offset < 0; offset += 1) {
    dailyRanges.push(range({
      instrumentId,
      timeframe: CandleTimeframe.ONE_DAY,
      fromParts: addCalendarYears(currentMoscowDay, offset),
      tillParts: addCalendarYears(currentMoscowDay, offset + 1)
    }));
  }

  const frozenMinuteRanges = Object.freeze(minuteRanges);
  const frozenDailyRanges = Object.freeze(dailyRanges);

  return Object.freeze({
    instrumentId: minuteRanges[0].instrumentId,
    asOf: new Date(asOfTimestamp).toISOString(),
    minuteWindow: frozenWindow(frozenMinuteRanges),
    dailyWindow: frozenWindow(frozenDailyRanges),
    minuteRanges: frozenMinuteRanges,
    dailyRanges: frozenDailyRanges,
    ranges: Object.freeze([...minuteRanges, ...dailyRanges])
  });
}

module.exports = {
  createHistoricalCandleBackfillPlan
};
