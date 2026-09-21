"use strict";

const {
  CandleTimeframe
} = require("../domain/candle-timeframe");
const {
  createHistoricalCandlesQuery
} = require("../application/historical-candles-query");

const DEFAULT_ALLOWED_INSTRUMENT_IDS = Object.freeze(["CNYRUB_TOM"]);
const DEFAULT_MAX_RANGE_MS = 6 * 60 * 60 * 1000;
const DEFAULT_MIN_REQUEST_INTERVAL_MS = 2000;
const SUPPORTED_TIMEFRAMES = new Set([
  CandleTimeframe.FIVE_MINUTES,
  CandleTimeframe.FIFTEEN_MINUTES
]);
const REQUIRED_QUERY_PARAMETERS = Object.freeze([
  "instrumentId",
  "timeframe",
  "from",
  "till"
]);
const REQUIRED_BACKFILL_PARAMETERS = Object.freeze(["instrumentId"]);
const REQUIRED_MANUAL_SYNC_PARAMETERS = Object.freeze([
  "instrumentId",
  "fromDate"
]);

function defaultSleep(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function response(statusCode, body) {
  return { statusCode, body };
}

function errorResponse(statusCode, code, message) {
  return response(statusCode, { code, message });
}

function requestParameters(searchParams) {
  const allowedNames = new Set(REQUIRED_QUERY_PARAMETERS);

  for (const name of searchParams.keys()) {
    if (!allowedNames.has(name)) {
      return errorResponse(
        400,
        "INVALID_HISTORICAL_CANDLES_REQUEST",
        "Historical Candles request contains an unsupported parameter."
      );
    }
  }

  for (const name of REQUIRED_QUERY_PARAMETERS) {
    if (searchParams.getAll(name).length !== 1) {
      return errorResponse(
        400,
        "INVALID_HISTORICAL_CANDLES_REQUEST",
        `Historical Candles request requires exactly one ${name} parameter.`
      );
    }
  }

  return {
    instrumentId: searchParams.get("instrumentId"),
    timeframe: searchParams.get("timeframe"),
    from: searchParams.get("from"),
    till: searchParams.get("till")
  };
}

function isPlainObject(value) {
  if (value === null || typeof value !== "object") {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function bodyParameters(body) {
  if (!isPlainObject(body)) {
    return errorResponse(
      400,
      "INVALID_HISTORICAL_CANDLES_REQUEST",
      "Historical Candles request body must be a JSON object."
    );
  }

  const parameterNames = Object.keys(body);
  const allowedNames = new Set(REQUIRED_QUERY_PARAMETERS);

  if (
    parameterNames.length !== REQUIRED_QUERY_PARAMETERS.length
    || parameterNames.some(name => !allowedNames.has(name))
    || REQUIRED_QUERY_PARAMETERS.some(name => !Object.hasOwn(body, name))
  ) {
    return errorResponse(
      400,
      "INVALID_HISTORICAL_CANDLES_REQUEST",
      "Historical Candles request body must contain exactly instrumentId, timeframe, from, and till."
    );
  }

  return {
    instrumentId: body.instrumentId,
    timeframe: body.timeframe,
    from: body.from,
    till: body.till
  };
}

function backfillBodyParameters(body) {
  if (!isPlainObject(body)) {
    return errorResponse(
      400,
      "INVALID_HISTORICAL_CANDLES_BACKFILL_REQUEST",
      "Historical Candles backfill request body must be a JSON object."
    );
  }

  const parameterNames = Object.keys(body);

  if (
    parameterNames.length !== REQUIRED_BACKFILL_PARAMETERS.length
    || parameterNames.some(name => !REQUIRED_BACKFILL_PARAMETERS.includes(name))
    || REQUIRED_BACKFILL_PARAMETERS.some(name => !Object.hasOwn(body, name))
  ) {
    return errorResponse(
      400,
      "INVALID_HISTORICAL_CANDLES_BACKFILL_REQUEST",
      "Historical Candles backfill request body must contain exactly instrumentId."
    );
  }

  return { instrumentId: body.instrumentId };
}

function backfillStatusParameters(searchParams) {
  for (const name of searchParams.keys()) {
    if (!REQUIRED_BACKFILL_PARAMETERS.includes(name)) {
      return errorResponse(
        400,
        "INVALID_HISTORICAL_CANDLES_BACKFILL_REQUEST",
        "Historical Candles backfill status contains an unsupported parameter."
      );
    }
  }

  if (searchParams.getAll("instrumentId").length !== 1) {
    return errorResponse(
      400,
      "INVALID_HISTORICAL_CANDLES_BACKFILL_REQUEST",
      "Historical Candles backfill status requires exactly one instrumentId parameter."
    );
  }

  return { instrumentId: searchParams.get("instrumentId") };
}

function manualSyncBodyParameters(body) {
  if (!isPlainObject(body)) {
    return errorResponse(
      400,
      "INVALID_MANUAL_HISTORICAL_SOURCE_CANDLE_SYNC_REQUEST",
      "Manual Historical Source Candle synchronization request body must be a JSON object."
    );
  }

  const parameterNames = Object.keys(body);

  if (
    parameterNames.length !== REQUIRED_MANUAL_SYNC_PARAMETERS.length
    || parameterNames.some(name => !REQUIRED_MANUAL_SYNC_PARAMETERS.includes(name))
    || REQUIRED_MANUAL_SYNC_PARAMETERS.some(name => !Object.hasOwn(body, name))
  ) {
    return errorResponse(
      400,
      "INVALID_MANUAL_HISTORICAL_SOURCE_CANDLE_SYNC_REQUEST",
      "Manual Historical Source Candle synchronization request body must contain exactly instrumentId and fromDate."
    );
  }

  return {
    instrumentId: body.instrumentId,
    fromDate: body.fromDate
  };
}

function manualSyncPlanParameters(searchParams) {
  for (const name of searchParams.keys()) {
    if (!REQUIRED_MANUAL_SYNC_PARAMETERS.includes(name)) {
      return errorResponse(
        400,
        "INVALID_MANUAL_HISTORICAL_SOURCE_CANDLE_SYNC_REQUEST",
        "Manual Historical Source Candle synchronization plan contains an unsupported parameter."
      );
    }
  }

  for (const name of REQUIRED_MANUAL_SYNC_PARAMETERS) {
    if (searchParams.getAll(name).length !== 1) {
      return errorResponse(
        400,
        "INVALID_MANUAL_HISTORICAL_SOURCE_CANDLE_SYNC_REQUEST",
        `Manual Historical Source Candle synchronization plan requires exactly one ${name} parameter.`
      );
    }
  }

  return {
    instrumentId: searchParams.get("instrumentId"),
    fromDate: searchParams.get("fromDate")
  };
}

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

function validateQuery(query, allowedInstruments, maxRangeMs) {
  const instrumentError = validateInstrument(query.instrumentId, allowedInstruments);

  if (instrumentError) {
    return instrumentError;
  }

  if (!SUPPORTED_TIMEFRAMES.has(query.timeframe)) {
    return errorResponse(
      400,
      "UNSUPPORTED_HISTORICAL_TIMEFRAME",
      "The requested historical market timeframe is not supported."
    );
  }

  let normalizedQuery;

  try {
    normalizedQuery = createHistoricalCandlesQuery(query);
  } catch (error) {
    const mapped = mappedError(error);

    if (mapped) {
      return mapped;
    }

    throw error;
  }

  const fromTimestamp = Date.parse(normalizedQuery.from);
  const tillTimestamp = Date.parse(normalizedQuery.till);

  if (
    Number.isFinite(fromTimestamp)
    && Number.isFinite(tillTimestamp)
    && tillTimestamp - fromTimestamp > maxRangeMs
  ) {
    return errorResponse(
      400,
      "HISTORICAL_CANDLES_RANGE_TOO_LARGE",
      "Historical Candles range must not exceed six hours."
    );
  }

  return { query: normalizedQuery, fromTimestamp, tillTimestamp };
}

function mappedError(error) {
  if (error?.code === "INVALID_MINUTE_CANDLE_CALENDAR_REQUEST") return errorResponse(400,error.code,error.message);
  if (error?.code === "INVALID_HISTORICAL_CANDLES_QUERY") {
    return errorResponse(400, error.code, error.message);
  }

  if (error?.code === "MOEX_ISS_UNSUPPORTED_CANDLE_TIMEFRAME") {
    return errorResponse(400, error.code, error.message);
  }

  if (error?.code === "UNSUPPORTED_HISTORICAL_SYNC_TIMEFRAME") {
    return errorResponse(400, error.code, error.message);
  }

  if (
    error?.code === "INVALID_HISTORICAL_CANDLE_BACKFILL_PLAN"
    || error?.code === "INVALID_HISTORICAL_CANDLES_BACKFILL_COMMAND"
    || error?.code === "INVALID_MANUAL_HISTORICAL_SOURCE_CANDLE_SYNC_COMMAND"
  ) {
    return errorResponse(400, error.code, error.message);
  }

  if (error?.code === "MOEX_ISS_RESULT_LIMIT_REACHED") {
    return errorResponse(422, error.code, error.message);
  }

  if (
    error?.code === "MOEX_ISS_REQUEST_FAILED"
    || error?.code === "MOEX_ISS_INVALID_RESPONSE"
    || error?.code === "INVALID_HISTORICAL_MARKET_DATA_SOURCE_RESULT"
    || error?.code === "INVALID_HISTORICAL_CANDLE_BACKFILL_PAGE"
    || error?.code === "HISTORICAL_CANDLE_BACKFILL_PAGE_LIMIT_REACHED"
  ) {
    return errorResponse(
      502,
      error.code,
      "Historical market data is temporarily unavailable."
    );
  }

  if (error?.code === "HISTORICAL_SOURCE_CANDLE_DAY_SYNC_FAILED") {
    const sourceFailure = mappedError(error.cause);

    return response(sourceFailure?.statusCode || 500, {
      code: error.code,
      message: error.message,
      date: error.date
    });
  }

  return null;
}

function createHistoricalCandlesApi({
  getMinuteCandleCalendarUseCase,
  loadMinuteCandleDayUseCase,
  getHistoricalCandlesUseCase,
  syncOneMinuteCandlesUseCase,
  backfillHistoricalCandlesUseCase,
  getHistoricalCandleBackfillStatusUseCase,
  getManualHistoricalSourceCandleSyncPlanUseCase,
  syncNextManualHistoricalSourceCandleDayUseCase,
  allowedInstrumentIds = DEFAULT_ALLOWED_INSTRUMENT_IDS,
  maxRangeMs = DEFAULT_MAX_RANGE_MS,
  minRequestIntervalMs = DEFAULT_MIN_REQUEST_INTERVAL_MS,
  sleep = defaultSleep,
  now = Date.now
} = {}) {
  if (typeof getHistoricalCandlesUseCase?.execute !== "function") {
    throw new TypeError("Historical Candles API requires a Get Historical Candles Use Case.");
  }

  if (typeof sleep !== "function") {
    throw new TypeError("Historical Candles API requires a sleep function.");
  }

  if (
    syncOneMinuteCandlesUseCase !== undefined
    && typeof syncOneMinuteCandlesUseCase?.execute !== "function"
  ) {
    throw new TypeError("Historical Candles API requires a Sync One Minute Candles Use Case.");
  }

  if (
    backfillHistoricalCandlesUseCase !== undefined
    && typeof backfillHistoricalCandlesUseCase?.execute !== "function"
  ) {
    throw new TypeError("Historical Candles API requires a Backfill Historical Candles Use Case.");
  }

  if (
    getHistoricalCandleBackfillStatusUseCase !== undefined
    && typeof getHistoricalCandleBackfillStatusUseCase?.execute !== "function"
  ) {
    throw new TypeError("Historical Candles API requires a Get Backfill Status Use Case.");
  }


  if (
    getManualHistoricalSourceCandleSyncPlanUseCase !== undefined
    && typeof getManualHistoricalSourceCandleSyncPlanUseCase?.execute !== "function"
  ) {
    throw new TypeError(
      "Historical Candles API requires a Get Manual Historical Source Candle Sync Plan Use Case."
    );
  }

  if (
    syncNextManualHistoricalSourceCandleDayUseCase !== undefined
    && typeof syncNextManualHistoricalSourceCandleDayUseCase?.execute !== "function"
  ) {
    throw new TypeError(
      "Historical Candles API requires a Sync Next Manual Historical Source Candle Day Use Case."
    );
  }

  const allowedInstruments = new Set(allowedInstrumentIds);
  let requestInFlight = false;
  let nextRequestAt = 0;

  async function runThrottled(action) {
    const currentTimestamp = now();

    if (requestInFlight || currentTimestamp < nextRequestAt) {
      return errorResponse(
        429,
        "HISTORICAL_CANDLES_REQUEST_THROTTLED",
        "Wait briefly before requesting historical market data again."
      );
    }

    requestInFlight = true;
    nextRequestAt = currentTimestamp + minRequestIntervalMs;

    try {
      return await action(currentTimestamp);
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

  async function runManualSyncStep(action) {
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
    async load(searchParams) {
      const query = requestParameters(searchParams);

      if (query.statusCode) {
        return query;
      }

      const validated = validateQuery(query, allowedInstruments, maxRangeMs);

      if (validated.statusCode) {
        return validated;
      }

      return runThrottled(async () => {
        const candles = await getHistoricalCandlesUseCase.execute(validated.query);

        return response(200, {
          instrumentId: validated.query.instrumentId,
          timeframe: validated.query.timeframe,
          from: new Date(validated.fromTimestamp).toISOString(),
          till: new Date(validated.tillTimestamp).toISOString(),
          candles
        });
      });
    },

    async sync(body) {
      if (typeof syncOneMinuteCandlesUseCase?.execute !== "function") {
        throw new TypeError("Historical Candles API requires a Sync One Minute Candles Use Case.");
      }

      const query = bodyParameters(body);

      if (query.statusCode) {
        return query;
      }

      const validated = validateQuery(query, allowedInstruments, maxRangeMs);

      if (validated.statusCode) {
        return validated;
      }

      return runThrottled(async () => response(
        200,
        await syncOneMinuteCandlesUseCase.execute(validated.query)
      ));
    },

    async backfillStep(body) {
      if (typeof backfillHistoricalCandlesUseCase?.execute !== "function") {
        throw new TypeError("Historical Candles API requires a Backfill Historical Candles Use Case.");
      }

      const command = backfillBodyParameters(body);

      if (command.statusCode) {
        return command;
      }

      const instrumentError = validateInstrument(
        command.instrumentId,
        allowedInstruments
      );

      if (instrumentError) {
        return instrumentError;
      }

      return runThrottled(async currentTimestamp => response(
        200,
        await backfillHistoricalCandlesUseCase.execute({
          instrumentId: command.instrumentId,
          asOf: new Date(currentTimestamp).toISOString(),
          maxRanges: 1
        })
      ));
    },

    async backfillStatus(searchParams) {
      if (typeof getHistoricalCandleBackfillStatusUseCase?.execute !== "function") {
        throw new TypeError("Historical Candles API requires a Get Backfill Status Use Case.");
      }

      const query = backfillStatusParameters(searchParams);

      if (query.statusCode) {
        return query;
      }

      const instrumentError = validateInstrument(
        query.instrumentId,
        allowedInstruments
      );

      if (instrumentError) {
        return instrumentError;
      }

      try {
        return response(
          200,
          await getHistoricalCandleBackfillStatusUseCase.execute({
            instrumentId: query.instrumentId,
            asOf: new Date(now()).toISOString()
          })
        );
      } catch (error) {
        const mapped = mappedError(error);

        if (mapped) {
          return mapped;
        }

        throw error;
      }
    },

    async calendar(searchParams) {
      const keys = [...searchParams.keys()];
      if (keys.length !== 2 || searchParams.getAll("instrumentId").length !== 1 || searchParams.getAll("month").length !== 1) {
        return errorResponse(400,"INVALID_MINUTE_CANDLE_CALENDAR_REQUEST","Calendar requires exactly instrumentId and month.");
      }
      const command = {instrumentId:searchParams.get("instrumentId"),month:searchParams.get("month")};
      const instrumentError = validateInstrument(command.instrumentId,allowedInstruments);
      if (instrumentError) return instrumentError;
      try { return response(200,await getMinuteCandleCalendarUseCase.execute(command)); }
      catch (error) { const mapped = mappedError(error); if (mapped) return mapped; throw error; }
    },

    async loadDay(body) {
      if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== 2
          || !Object.hasOwn(body,"instrumentId") || !Object.hasOwn(body,"date")) {
        return errorResponse(400,"INVALID_MINUTE_CANDLE_CALENDAR_REQUEST","Day loading requires exactly instrumentId and date.");
      }
      const instrumentError = validateInstrument(body.instrumentId,allowedInstruments);
      if (instrumentError) return instrumentError;
      return runManualSyncStep(async () => response(200,await loadMinuteCandleDayUseCase.execute(body)));
    },

    async manualSyncPlan(searchParams) {
      if (typeof getManualHistoricalSourceCandleSyncPlanUseCase?.execute !== "function") {
        throw new TypeError(
          "Historical Candles API requires a Get Manual Historical Source Candle Sync Plan Use Case."
        );
      }

      const command = manualSyncPlanParameters(searchParams);

      if (command.statusCode) {
        return command;
      }

      const instrumentError = validateInstrument(
        command.instrumentId,
        allowedInstruments
      );

      if (instrumentError) {
        return instrumentError;
      }

      try {
        return response(
          200,
          await getManualHistoricalSourceCandleSyncPlanUseCase.execute(command)
        );
      } catch (error) {
        const mapped = mappedError(error);

        if (mapped) {
          return mapped;
        }

        throw error;
      }
    },

    async manualSyncStep(body) {
      if (typeof syncNextManualHistoricalSourceCandleDayUseCase?.execute !== "function") {
        throw new TypeError(
          "Historical Candles API requires a Sync Next Manual Historical Source Candle Day Use Case."
        );
      }

      const command = manualSyncBodyParameters(body);

      if (command.statusCode) {
        return command;
      }

      const instrumentError = validateInstrument(
        command.instrumentId,
        allowedInstruments
      );

      if (instrumentError) {
        return instrumentError;
      }

      // The day-range use case owns MOEX request pacing across consecutive steps.
      return runManualSyncStep(async () => response(
        200,
        await syncNextManualHistoricalSourceCandleDayUseCase.execute(command)
      ));
    }
  });
}

module.exports = {
  createHistoricalCandlesApi
};
