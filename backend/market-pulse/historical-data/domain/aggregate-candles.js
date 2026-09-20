"use strict";

const Big = require("big.js");
const {
  createCandle
} = require("./candle");
const {
  CandleTimeframe,
  requireCandleTimeframe
} = require("./candle-timeframe");

const MOSCOW_TIME_ZONE = "Europe/Moscow";
const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const INTRADAY_DURATION_MS = Object.freeze({
  [CandleTimeframe.ONE_MINUTE]: MINUTE_MS,
  [CandleTimeframe.FIVE_MINUTES]: 5 * MINUTE_MS,
  [CandleTimeframe.FIFTEEN_MINUTES]: 15 * MINUTE_MS,
  [CandleTimeframe.ONE_HOUR]: HOUR_MS,
  [CandleTimeframe.FOUR_HOURS]: 4 * HOUR_MS
});
const SUPPORTED_TARGETS_BY_BASE = Object.freeze({
  [CandleTimeframe.ONE_MINUTE]: new Set([
    CandleTimeframe.ONE_MINUTE,
    CandleTimeframe.FIVE_MINUTES,
    CandleTimeframe.FIFTEEN_MINUTES,
    CandleTimeframe.ONE_HOUR,
    CandleTimeframe.FOUR_HOURS
  ]),
  [CandleTimeframe.ONE_DAY]: new Set([
    CandleTimeframe.ONE_WEEK,
    CandleTimeframe.ONE_MONTH
  ])
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

function aggregationError(message) {
  const error = new RangeError(message);
  error.code = "UNSUPPORTED_CANDLE_AGGREGATION_TIMEFRAME";
  return error;
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

  // A second pass also handles historical Moscow offset changes.
  timestamp = localTimestamp - moscowOffset(timestamp);

  return timestamp;
}

function shiftedLocalParts(parts, milliseconds) {
  const shifted = new Date(utcTimestamp(parts) + milliseconds);

  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds()
  };
}

function intradayBucket(timestamp, timeframe) {
  const parts = moscowParts(timestamp);
  const durationMs = INTRADAY_DURATION_MS[timeframe];
  const bucketParts = {
    ...parts,
    second: 0
  };

  if (timeframe === CandleTimeframe.FIVE_MINUTES) {
    bucketParts.minute = Math.floor(parts.minute / 5) * 5;
  } else if (timeframe === CandleTimeframe.FIFTEEN_MINUTES) {
    bucketParts.minute = Math.floor(parts.minute / 15) * 15;
  } else if (timeframe === CandleTimeframe.ONE_HOUR) {
    bucketParts.minute = 0;
  } else if (timeframe === CandleTimeframe.FOUR_HOURS) {
    bucketParts.hour = Math.floor(parts.hour / 4) * 4;
    bucketParts.minute = 0;
  }

  return {
    begin: moscowTimestamp(bucketParts),
    end: moscowTimestamp(shiftedLocalParts(bucketParts, durationMs))
  };
}

function weekBucket(timestamp) {
  const parts = moscowParts(timestamp);
  const localDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  const daysSinceMonday = (localDate.getUTCDay() + 6) % 7;
  const beginParts = shiftedLocalParts({
    ...parts,
    hour: 0,
    minute: 0,
    second: 0
  }, -daysSinceMonday * DAY_MS);

  return {
    begin: moscowTimestamp(beginParts),
    end: moscowTimestamp(shiftedLocalParts(beginParts, 7 * DAY_MS))
  };
}

function monthBucket(timestamp) {
  const parts = moscowParts(timestamp);
  const beginParts = {
    year: parts.year,
    month: parts.month,
    day: 1,
    hour: 0,
    minute: 0,
    second: 0
  };
  const endParts = shiftedLocalParts(beginParts, 32 * DAY_MS);

  endParts.day = 1;
  endParts.hour = 0;
  endParts.minute = 0;
  endParts.second = 0;

  return {
    begin: moscowTimestamp(beginParts),
    end: moscowTimestamp(endParts)
  };
}

function bucketFor(timestamp, timeframe) {
  if (INTRADAY_DURATION_MS[timeframe]) {
    return intradayBucket(timestamp, timeframe);
  }

  if (timeframe === CandleTimeframe.ONE_WEEK) {
    return weekBucket(timestamp);
  }

  return monthBucket(timestamp);
}

function aggregateCandles({
  candles,
  timeframe,
  baseTimeframe = CandleTimeframe.ONE_MINUTE,
  from,
  till
} = {}) {
  const normalizedTimeframe = requireCandleTimeframe(timeframe);
  const normalizedBaseTimeframe = requireCandleTimeframe(baseTimeframe);
  const supportedTargets = SUPPORTED_TARGETS_BY_BASE[normalizedBaseTimeframe];

  if (!supportedTargets?.has(normalizedTimeframe)) {
    throw aggregationError(
      "Candle aggregation does not support this base and target Timeframe pair."
    );
  }

  if (!Array.isArray(candles)) {
    throw new TypeError("Candle aggregation requires a Candle collection.");
  }

  const fromTimestamp = Date.parse(from);
  const tillTimestamp = Date.parse(till);

  if (
    !Number.isFinite(fromTimestamp)
    || !Number.isFinite(tillTimestamp)
    || fromTimestamp >= tillTimestamp
  ) {
    throw new RangeError("Candle aggregation requires a valid period.");
  }

  const groups = new Map();

  [...candles]
    .sort((left, right) => Date.parse(left.begin) - Date.parse(right.begin))
    .forEach(candle => {
      const candleBegin = Date.parse(candle.begin);
      const bucket = bucketFor(candleBegin, normalizedTimeframe);

      if (bucket.begin < fromTimestamp || bucket.end > tillTimestamp) {
        return;
      }

      const current = groups.get(bucket.begin);

      if (!current) {
        groups.set(bucket.begin, {
          end: bucket.end,
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close
        });
        return;
      }

      current.close = candle.close;

      if (new Big(candle.high).gt(current.high)) {
        current.high = candle.high;
      }

      if (new Big(candle.low).lt(current.low)) {
        current.low = candle.low;
      }
    });

  return Object.freeze(
    [...groups.entries()].map(([bucketBegin, { end, ...values }]) => createCandle({
      begin: new Date(bucketBegin).toISOString(),
      end: new Date(end - SECOND_MS).toISOString(),
      ...values
    }))
  );
}

module.exports = {
  aggregateCandles
};
