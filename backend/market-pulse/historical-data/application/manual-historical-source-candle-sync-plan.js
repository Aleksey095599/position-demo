"use strict";

const {
  CandleTimeframe
} = require("../domain/candle-timeframe");
const {
  createHistoricalCandlesQuery
} = require("./historical-candles-query");

const MOSCOW_TIME_ZONE = "Europe/Moscow";
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_MANUAL_SYNC_DAY_COUNT = 366;
const MOSCOW_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: MOSCOW_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});
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

const ManualHistoricalSourceCandleDayStatus = Object.freeze({
  COMPLETED: "COMPLETED",
  PENDING: "PENDING"
});

function commandError(message) {
  const error = new RangeError(message);
  error.code = "INVALID_MANUAL_HISTORICAL_SOURCE_CANDLE_SYNC_COMMAND";
  return error;
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

function partsFromFormatter(formatter, timestamp) {
  return Object.fromEntries(
    formatter
      .formatToParts(new Date(timestamp))
      .filter(part => part.type !== "literal")
      .map(part => [part.type, Number(part.value)])
  );
}

function moscowOffset(timestamp) {
  const secondAlignedTimestamp = Math.floor(timestamp / 1000) * 1000;

  return utcTimestamp(
    partsFromFormatter(MOSCOW_DATE_TIME_FORMATTER, secondAlignedTimestamp)
  ) - secondAlignedTimestamp;
}

function moscowTimestamp(parts) {
  const localTimestamp = utcTimestamp(parts);
  let timestamp = localTimestamp - moscowOffset(localTimestamp);

  timestamp = localTimestamp - moscowOffset(timestamp);
  return timestamp;
}

function addCalendarDays(parts, days) {
  const shifted = new Date(utcTimestamp(parts) + days * DAY_MS);

  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate()
  };
}

function renderDate(parts) {
  return [
    String(parts.year).padStart(4, "0"),
    String(parts.month).padStart(2, "0"),
    String(parts.day).padStart(2, "0")
  ].join("-");
}

function normalizedDate(value) {
  const match = typeof value === "string"
    ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
    : null;

  if (!match) {
    throw commandError("From Date must use YYYY-MM-DD format.");
  }

  const parts = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3])
  };
  const date = new Date(utcTimestamp(parts));

  if (
    date.getUTCFullYear() !== parts.year
    || date.getUTCMonth() + 1 !== parts.month
    || date.getUTCDate() !== parts.day
  ) {
    throw commandError("From Date must be a valid calendar date.");
  }

  return parts;
}

function normalizedAsOf(value) {
  const timestamp = value instanceof Date
    ? value.getTime()
    : typeof value === "number"
      ? value
      : Date.parse(value);

  if (!Number.isFinite(timestamp)) {
    throw commandError("As Of must be a valid timestamp.");
  }

  return timestamp;
}

function currentMoscowDate(asOf) {
  const parts = partsFromFormatter(MOSCOW_DATE_FORMATTER, asOf);

  return {
    year: parts.year,
    month: parts.month,
    day: parts.day
  };
}

function createManualHistoricalSourceCandleSyncSchedule({
  instrumentId,
  fromDate,
  asOf
} = {}) {
  const firstDay = normalizedDate(fromDate);
  const today = currentMoscowDate(normalizedAsOf(asOf));
  const firstTimestamp = moscowTimestamp(firstDay);
  const tillTimestamp = moscowTimestamp(today);

  if (firstTimestamp >= tillTimestamp) {
    throw commandError(
      "From Date must be earlier than the current Moscow calendar date."
    );
  }

  const dayCount = (
    utcTimestamp(today) - utcTimestamp(firstDay)
  ) / DAY_MS;

  if (dayCount > MAX_MANUAL_SYNC_DAY_COUNT) {
    throw commandError(
      `Manual synchronization must not exceed ${MAX_MANUAL_SYNC_DAY_COUNT} closed Moscow calendar days.`
    );
  }

  const days = [];

  for (
    let cursor = firstDay;
    moscowTimestamp(cursor) < tillTimestamp;
    cursor = addCalendarDays(cursor, 1)
  ) {
    const nextDay = addCalendarDays(cursor, 1);
    const query = createHistoricalCandlesQuery({
      instrumentId,
      timeframe: CandleTimeframe.ONE_MINUTE,
      from: new Date(moscowTimestamp(cursor)).toISOString(),
      till: new Date(moscowTimestamp(nextDay)).toISOString()
    });

    days.push(Object.freeze({
      date: renderDate(cursor),
      from: query.from,
      till: query.till
    }));
  }

  const frozenDays = Object.freeze(days);

  return Object.freeze({
    instrumentId: createHistoricalCandlesQuery({
      instrumentId,
      timeframe: CandleTimeframe.ONE_MINUTE,
      from: frozenDays[0].from,
      till: frozenDays[0].till
    }).instrumentId,
    fromDate: frozenDays[0].date,
    throughDate: frozenDays.at(-1).date,
    from: frozenDays[0].from,
    till: frozenDays.at(-1).till,
    days: frozenDays
  });
}

function rangeCoversDay(range, day) {
  return Date.parse(range?.from) <= Date.parse(day.from)
    && Date.parse(range?.till) >= Date.parse(day.till);
}

function applyLoadedRangesToManualHistoricalSourceCandleSyncSchedule(
  schedule,
  loadedRanges
) {
  if (!Array.isArray(loadedRanges)) {
    const error = new TypeError(
      "Market Candle Load Range Repository must return a Range collection."
    );
    error.code = "INVALID_MARKET_CANDLE_LOAD_RANGE_REPOSITORY_RESULT";
    throw error;
  }

  let completedDayCount = 0;
  const days = Object.freeze(schedule.days.map(day => {
    const completed = loadedRanges.some(range => rangeCoversDay(range, day));

    if (completed) {
      completedDayCount += 1;
    }

    return Object.freeze({
      ...day,
      status: completed
        ? ManualHistoricalSourceCandleDayStatus.COMPLETED
        : ManualHistoricalSourceCandleDayStatus.PENDING
    });
  }));
  const pendingDayCount = days.length - completedDayCount;

  return Object.freeze({
    instrumentId: schedule.instrumentId,
    fromDate: schedule.fromDate,
    throughDate: schedule.throughDate,
    from: schedule.from,
    till: schedule.till,
    totalDayCount: days.length,
    completedDayCount,
    pendingDayCount,
    complete: pendingDayCount === 0,
    days
  });
}

module.exports = {
  MAX_MANUAL_SYNC_DAY_COUNT,
  ManualHistoricalSourceCandleDayStatus,
  applyLoadedRangesToManualHistoricalSourceCandleSyncSchedule,
  createManualHistoricalSourceCandleSyncSchedule
};
