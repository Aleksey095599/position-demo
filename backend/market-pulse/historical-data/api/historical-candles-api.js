"use strict";

const DEFAULT_ALLOWED_INSTRUMENT_IDS = Object.freeze(["CNYRUB_TOM"]);
const DEFAULT_MIN_REQUEST_INTERVAL_MS = 2000;
function defaultSleep(milliseconds) { return new Promise(resolve => setTimeout(resolve, milliseconds)); }
function response(statusCode, body) { return { statusCode, body }; }
function errorResponse(statusCode, code, message) { return response(statusCode, { code, message }); }

function validateInstrument(instrumentId, allowedInstruments) {
  if (!allowedInstruments.has(instrumentId)) {
    return errorResponse(
      400,
      "UNSUPPORTED_HISTORICAL_INSTRUMENT",
      "The requested historical market instrument is not supported."
    );
  }

  return null;
}


function mappedError(error) {
  if (error?.code === "CANDLE_VERIFICATION_LOG_FAILED") return errorResponse(500,error.code,error.message);
  if (["INVALID_SOURCE_CANDLE_CALENDAR_REQUEST", "INVALID_HISTORICAL_CANDLES_QUERY", "MOEX_ISS_UNSUPPORTED_CANDLE_TIMEFRAME"].includes(error?.code)) {
    return errorResponse(400,error.code,error.message);
  }
  if (["MOEX_ISS_REQUEST_FAILED", "MOEX_ISS_INVALID_RESPONSE", "INVALID_HISTORICAL_CANDLE_BACKFILL_PAGE", "HISTORICAL_CANDLE_BACKFILL_PAGE_LIMIT_REACHED"].includes(error?.code)) {
    return errorResponse(502,error.code,"Historical market data is temporarily unavailable.");
  }
  return null;
}

function createHistoricalCandlesApi({
  getSourceCandleCalendarUseCase,
  loadSourceCandleDayUseCase,
  allowedInstrumentIds = DEFAULT_ALLOWED_INSTRUMENT_IDS,
  minRequestIntervalMs = DEFAULT_MIN_REQUEST_INTERVAL_MS,
  sleep = defaultSleep,
  now = Date.now
} = {}) {
  if (typeof getSourceCandleCalendarUseCase?.execute !== "function" || typeof loadSourceCandleDayUseCase?.execute !== "function") {
    throw new TypeError("Historical Candles API requires calendar and day-loading use cases.");
  }
  if (typeof sleep !== "function" || typeof now !== "function" || !Number.isSafeInteger(minRequestIntervalMs) || minRequestIntervalMs < 0) {
    throw new TypeError("Historical Candles API requires a valid clock, sleep function and request interval.");
  }
  const allowedInstruments = new Set(allowedInstrumentIds);
  let requestInFlight = false;
  let nextRequestAt = 0;

  async function runDayLoad(action) {
    if (requestInFlight) {
      return errorResponse(
        429,
        "HISTORICAL_CANDLES_REQUEST_THROTTLED",
        "Wait for the current historical market data request to finish."
      );
    }

    requestInFlight = true;

    try {
      const currentTimestamp = Number(now());
      const cooldownMs = Number.isFinite(currentTimestamp)
        ? Math.max(0, nextRequestAt - currentTimestamp)
        : 0;

      if (cooldownMs > 0) {
        await sleep(cooldownMs);
      }

      return await action();
    } catch (error) {
      const mapped = mappedError(error);

      if (mapped) {
        return mapped;
      }

      throw error;
    } finally {
      requestInFlight = false;
      const completedAt = now();

      if (Number.isFinite(completedAt)) {
        nextRequestAt = Math.max(
          nextRequestAt,
          completedAt + minRequestIntervalMs
        );
      }
    }
  }

  return Object.freeze({
    async calendar(searchParams) {
      const keys = [...searchParams.keys()];
      if (keys.some(key => !["instrumentId","month","timeframe"].includes(key))
          || searchParams.getAll("instrumentId").length !== 1 || searchParams.getAll("month").length !== 1
          || searchParams.getAll("timeframe").length > 1) {
        return errorResponse(400,"INVALID_SOURCE_CANDLE_CALENDAR_REQUEST","Calendar requires instrumentId, month and an optional source timeframe.");
      }
      const command = {instrumentId:searchParams.get("instrumentId"),month:searchParams.get("month"),timeframe:searchParams.get("timeframe") ?? "ONE_MINUTE"};
      const instrumentError = validateInstrument(command.instrumentId,allowedInstruments);
      if (instrumentError) return instrumentError;
      try { return response(200,await getSourceCandleCalendarUseCase.execute(command)); }
      catch (error) { const mapped = mappedError(error); if (mapped) return mapped; throw error; }
    },

    async loadDay(body) {
      if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some(key => !["instrumentId","date","timeframe"].includes(key))
          || !Object.hasOwn(body,"instrumentId") || !Object.hasOwn(body,"date")) {
        return errorResponse(400,"INVALID_SOURCE_CANDLE_CALENDAR_REQUEST","Day loading requires instrumentId, date and an optional source timeframe.");
      }
      const instrumentError = validateInstrument(body.instrumentId,allowedInstruments);
      if (instrumentError) return instrumentError;
      if (Object.hasOwn(body,"timeframe") && !["ONE_MINUTE","ONE_DAY"].includes(body.timeframe)) {
        return errorResponse(400,"INVALID_SOURCE_CANDLE_CALENDAR_REQUEST","Source timeframe must be ONE_MINUTE or ONE_DAY.");
      }
      return runDayLoad(async () => response(200,await loadSourceCandleDayUseCase.execute(body)));
    }
  });
}
module.exports = { createHistoricalCandlesApi };
