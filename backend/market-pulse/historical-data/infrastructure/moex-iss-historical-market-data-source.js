"use strict";

const {
  CandleTimeframe
} = require("../domain/candle-timeframe");
const {
  createCandle
} = require("../domain/candle");

const DEFAULT_BASE_URL = "https://iss.moex.com";
const DEFAULT_REQUEST_TIMEOUT_MS = 10000;
const MOEX_ISS_PAGE_SIZE = 500;
const MOEX_TIME_ZONE = "Europe/Moscow";
const NATIVE_INTERVAL_BY_TIMEFRAME = new Map([
  [CandleTimeframe.ONE_MINUTE, "1"],
  [CandleTimeframe.ONE_DAY, "24"]
]);

const moexDateTimeFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: MOEX_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23"
});

function sourceError(code, message, cause) {
  const error = new Error(message, cause ? { cause } : undefined);
  error.code = code;
  return error;
}

function dateTimeParts(timestamp) {
  return Object.fromEntries(
    moexDateTimeFormatter
      .formatToParts(new Date(timestamp))
      .filter(part => part.type !== "literal")
      .map(part => [part.type, part.value])
  );
}

function formatMoexDateTime(timestamp) {
  const parts = dateTimeParts(timestamp);
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

function parseMoexDateTime(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(
    String(value || "")
  );

  if (!match) {
    throw sourceError(
      "MOEX_ISS_INVALID_RESPONSE",
      "MOEX ISS returned an invalid Candle timestamp."
    );
  }

  const [, year, month, day, hour, minute, second] = match;
  const localTimestamp = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second)
  );
  let timestamp = localTimestamp;

  // Resolve the exchange-local timestamp without relying on the server time zone.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const parts = dateTimeParts(timestamp);
    const renderedAsUtc = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second)
    );
    timestamp = localTimestamp - (renderedAsUtc - timestamp);
  }

  const resolved = dateTimeParts(timestamp);

  if (
    resolved.year !== year
    || resolved.month !== month
    || resolved.day !== day
    || resolved.hour !== hour
    || resolved.minute !== minute
    || resolved.second !== second
  ) {
    throw sourceError(
      "MOEX_ISS_INVALID_RESPONSE",
      "MOEX ISS returned an invalid Candle timestamp."
    );
  }

  return new Date(timestamp).toISOString();
}

function candleBlock(responseBody) {
  const columns = responseBody?.candles?.columns;
  const data = responseBody?.candles?.data;

  if (!Array.isArray(columns) || !Array.isArray(data)) {
    throw sourceError(
      "MOEX_ISS_INVALID_RESPONSE",
      "MOEX ISS returned an invalid Candles response."
    );
  }

  const requiredColumns = ["open", "close", "high", "low", "begin", "end"];
  const columnIndexes = Object.fromEntries(
    requiredColumns.map(column => [column, columns.indexOf(column)])
  );

  if (Object.values(columnIndexes).some(index => index < 0)) {
    throw sourceError(
      "MOEX_ISS_INVALID_RESPONSE",
      "MOEX ISS Candles response is missing required columns."
    );
  }

  return { columnIndexes, data };
}

function sourceCandles(responseBody) {
  const { columnIndexes, data } = candleBlock(responseBody);

  return data.map(row => {
    if (!Array.isArray(row)) {
      throw sourceError(
        "MOEX_ISS_INVALID_RESPONSE",
        "MOEX ISS returned an invalid Candle row."
      );
    }

    try {
      return createCandle({
        begin: parseMoexDateTime(row[columnIndexes.begin]),
        end: parseMoexDateTime(row[columnIndexes.end]),
        open: row[columnIndexes.open],
        high: row[columnIndexes.high],
        low: row[columnIndexes.low],
        close: row[columnIndexes.close]
      });
    } catch (error) {
      if (error?.code === "MOEX_ISS_INVALID_RESPONSE") {
        throw error;
      }

      throw sourceError(
        "MOEX_ISS_INVALID_RESPONSE",
        "MOEX ISS returned an invalid Candle row.",
        error
      );
    }
  });
}

function normalizedPageStart(options) {
  if (options === undefined) {
    return 0;
  }

  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw sourceError(
      "INVALID_MOEX_ISS_PAGE",
      "MOEX ISS Candle page options must be an object."
    );
  }

  const start = options.start ?? 0;

  if (!Number.isSafeInteger(start) || start < 0) {
    throw sourceError(
      "INVALID_MOEX_ISS_PAGE",
      "MOEX ISS Candle page start must be a non-negative integer."
    );
  }

  return start;
}

class MoexIssHistoricalMarketDataSource {
  constructor({
    fetchImpl = globalThis.fetch,
    baseUrl = DEFAULT_BASE_URL,
    requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS
  } = {}) {
    if (typeof fetchImpl !== "function") {
      throw sourceError(
        "INVALID_MOEX_ISS_CONFIGURATION",
        "MOEX ISS data source requires a Fetch implementation."
      );
    }

    if (!Number.isInteger(requestTimeoutMs) || requestTimeoutMs <= 0) {
      throw sourceError(
        "INVALID_MOEX_ISS_CONFIGURATION",
        "MOEX ISS request timeout must be a positive integer."
      );
    }

    try {
      this.baseUrl = new URL(baseUrl).toString().replace(/\/$/, "");
    } catch (error) {
      throw sourceError(
        "INVALID_MOEX_ISS_CONFIGURATION",
        "MOEX ISS Base URL must be valid.",
        error
      );
    }

    this.fetchImpl = fetchImpl;
    this.requestTimeoutMs = requestTimeoutMs;
  }

  async #requestCandlePage(query, { interval, start }) {
    const url = new URL(
      `${this.baseUrl}/iss/engines/currency/markets/selt/boards/CETS/securities/${encodeURIComponent(query.instrumentId)}/candles.json`
    );
    url.searchParams.set("interval", interval);
    url.searchParams.set("from", formatMoexDateTime(query.from));
    url.searchParams.set("till", formatMoexDateTime(query.till));
    url.searchParams.set("start", String(start));
    url.searchParams.set("iss.meta", "off");
    url.searchParams.set("iss.only", "candles");
    url.searchParams.set(
      "candles.columns",
      "open,close,high,low,begin,end"
    );

    let response;

    try {
      response = await this.fetchImpl(url, {
        method: "GET",
        headers: {
          accept: "application/json",
          "user-agent": "MarketPulse/1.0"
        },
        signal: AbortSignal.timeout(this.requestTimeoutMs)
      });
    } catch (error) {
      throw sourceError(
        "MOEX_ISS_REQUEST_FAILED",
        "MOEX ISS Candles request failed.",
        error
      );
    }

    if (!response?.ok) {
      throw sourceError(
        "MOEX_ISS_REQUEST_FAILED",
        `MOEX ISS Candles request failed with HTTP ${response?.status || "unknown"}.`
      );
    }

    let responseBody;

    try {
      responseBody = await response.json();
    } catch (error) {
      throw sourceError(
        "MOEX_ISS_INVALID_RESPONSE",
        "MOEX ISS returned unreadable JSON.",
        error
      );
    }

    const block = candleBlock(responseBody);

    if (block.data.length > MOEX_ISS_PAGE_SIZE) {
      throw sourceError(
        "MOEX_ISS_INVALID_RESPONSE",
        "MOEX ISS returned more than 500 source Candles in one page."
      );
    }

    return Object.freeze({
      responseBody,
      rowCount: block.data.length
    });
  }

  async loadCandlePage(query, options) {
    const interval = NATIVE_INTERVAL_BY_TIMEFRAME.get(query.timeframe);

    if (!interval) {
      throw sourceError(
        "MOEX_ISS_UNSUPPORTED_CANDLE_TIMEFRAME",
        "MOEX ISS paged loading supports native one-minute and one-day Candles."
      );
    }

    const start = normalizedPageStart(options);
    const page = await this.#requestCandlePage(query, { interval, start });
    // Полная страница требует проверки следующего offset, иначе backfill может потерять данные.
    const hasMore = page.rowCount === MOEX_ISS_PAGE_SIZE;

    return Object.freeze({
      candles: Object.freeze(sourceCandles(page.responseBody)),
      nextStart: hasMore ? start + page.rowCount : null,
      hasMore
    });
  }

}

module.exports = {
  MoexIssHistoricalMarketDataSource
};
