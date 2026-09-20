"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  createHistoricalCandlesApi
} = require("./historical-candles-api");

const VALID_PARAMETERS = Object.freeze({
  instrumentId: "CNYRUB_TOM",
  timeframe: "FIVE_MINUTES",
  from: "2026-09-15T07:00:00.000Z",
  till: "2026-09-15T08:00:00.000Z"
});

function searchParams(overrides = {}) {
  return new URLSearchParams({ ...VALID_PARAMETERS, ...overrides });
}

test("loads a bounded supported Historical Candles request", async () => {
  let receivedQuery;
  const candles = [{ begin: "2026-09-15T07:00:00.000Z" }];
  const api = createHistoricalCandlesApi({
    getHistoricalCandlesUseCase: {
      async execute(query) {
        receivedQuery = query;
        return candles;
      }
    },
    now: () => 1000
  });

  const result = await api.load(searchParams());

  assert.equal(result.statusCode, 200);
  assert.deepEqual(receivedQuery, VALID_PARAMETERS);
  assert.deepEqual(result.body, { ...VALID_PARAMETERS, candles });
});

test("accepts the fifteen-minute Timeframe", async () => {
  let receivedQuery;
  const api = createHistoricalCandlesApi({
    getHistoricalCandlesUseCase: {
      async execute(query) {
        receivedQuery = query;
        return [];
      }
    }
  });

  const result = await api.load(searchParams({ timeframe: "FIFTEEN_MINUTES" }));

  assert.equal(result.statusCode, 200);
  assert.equal(receivedQuery.timeframe, "FIFTEEN_MINUTES");
});

test("rejects unsupported instruments before calling the use case", async () => {
  let called = false;
  const api = createHistoricalCandlesApi({
    getHistoricalCandlesUseCase: {
      async execute() {
        called = true;
        return [];
      }
    }
  });

  const result = await api.load(searchParams({ instrumentId: "USD000UTSTOM" }));

  assert.equal(result.statusCode, 400);
  assert.equal(result.body.code, "UNSUPPORTED_HISTORICAL_INSTRUMENT");
  assert.equal(called, false);
});

test("rejects ranges longer than six hours before calling the use case", async () => {
  let called = false;
  const api = createHistoricalCandlesApi({
    getHistoricalCandlesUseCase: {
      async execute() {
        called = true;
        return [];
      }
    }
  });

  const result = await api.load(searchParams({
    till: "2026-09-15T14:00:00.001Z"
  }));

  assert.equal(result.statusCode, 400);
  assert.equal(result.body.code, "HISTORICAL_CANDLES_RANGE_TOO_LARGE");
  assert.equal(called, false);
});

test("rejects malformed periods before consuming the request throttle", async () => {
  let callCount = 0;
  const api = createHistoricalCandlesApi({
    getHistoricalCandlesUseCase: {
      async execute() {
        callCount += 1;
        return [];
      }
    },
    now: () => 1000
  });

  const malformed = await api.load(searchParams({
    from: "2026-09-15 07:00:00"
  }));
  const reversed = await api.load(searchParams({
    from: VALID_PARAMETERS.till,
    till: VALID_PARAMETERS.from
  }));
  const valid = await api.load(searchParams());

  assert.equal(malformed.statusCode, 400);
  assert.equal(malformed.body.code, "INVALID_HISTORICAL_CANDLES_QUERY");
  assert.equal(reversed.statusCode, 400);
  assert.equal(reversed.body.code, "INVALID_HISTORICAL_CANDLES_QUERY");
  assert.equal(valid.statusCode, 200);
  assert.equal(callCount, 1);
});

test("rejects a parallel request without starting another load", async () => {
  let releaseFirstRequest;
  let callCount = 0;
  const api = createHistoricalCandlesApi({
    getHistoricalCandlesUseCase: {
      async execute() {
        callCount += 1;
        await new Promise(resolve => {
          releaseFirstRequest = resolve;
        });
        return [];
      }
    },
    now: () => 1000
  });

  const firstRequest = api.load(searchParams());
  await Promise.resolve();
  const secondResult = await api.load(searchParams());
  releaseFirstRequest();
  await firstRequest;

  assert.equal(secondResult.statusCode, 429);
  assert.equal(secondResult.body.code, "HISTORICAL_CANDLES_REQUEST_THROTTLED");
  assert.equal(callCount, 1);
});

test("enforces the minimum interval between outbound requests", async () => {
  let currentTimestamp = 1000;
  let callCount = 0;
  const api = createHistoricalCandlesApi({
    getHistoricalCandlesUseCase: {
      async execute() {
        callCount += 1;
        return [];
      }
    },
    now: () => currentTimestamp
  });

  assert.equal((await api.load(searchParams())).statusCode, 200);
  currentTimestamp = 2999;
  assert.equal((await api.load(searchParams())).statusCode, 429);
  currentTimestamp = 3000;
  assert.equal((await api.load(searchParams())).statusCode, 200);
  assert.equal(callCount, 2);
});

test("maps MOEX failures without exposing their cause", async () => {
  const api = createHistoricalCandlesApi({
    getHistoricalCandlesUseCase: {
      async execute() {
        const error = new Error("Internal remote response details.");
        error.code = "MOEX_ISS_INVALID_RESPONSE";
        throw error;
      }
    }
  });

  const result = await api.load(searchParams());

  assert.deepEqual(result, {
    statusCode: 502,
    body: {
      code: "MOEX_ISS_INVALID_RESPONSE",
      message: "Historical market data is temporarily unavailable."
    }
  });
});

test("synchronizes one-minute candles and returns the use case result", async () => {
  let receivedQuery;
  const synchronization = Object.freeze({
    ...VALID_PARAMETERS,
    storedMinuteCandleCount: 12,
    candles: [{ begin: "2026-09-15T07:00:00.000Z" }]
  });
  const api = createHistoricalCandlesApi({
    getHistoricalCandlesUseCase: { async execute() { return []; } },
    syncOneMinuteCandlesUseCase: {
      async execute(query) {
        receivedQuery = query;
        return synchronization;
      }
    },
    now: () => 1000
  });

  const result = await api.sync({ ...VALID_PARAMETERS });

  assert.deepEqual(receivedQuery, VALID_PARAMETERS);
  assert.deepEqual(result, {
    statusCode: 200,
    body: synchronization
  });
});

test("requires an exact plain-object synchronization body", async () => {
  let callCount = 0;
  const api = createHistoricalCandlesApi({
    getHistoricalCandlesUseCase: { async execute() { return []; } },
    syncOneMinuteCandlesUseCase: {
      async execute() {
        callCount += 1;
        return {};
      }
    }
  });
  const invalidBodies = [
    null,
    [],
    "not-an-object",
    { ...VALID_PARAMETERS, unexpected: true },
    {
      instrumentId: VALID_PARAMETERS.instrumentId,
      timeframe: VALID_PARAMETERS.timeframe,
      from: VALID_PARAMETERS.from
    }
  ];

  for (const body of invalidBodies) {
    const result = await api.sync(body);

    assert.equal(result.statusCode, 400);
    assert.equal(result.body.code, "INVALID_HISTORICAL_CANDLES_REQUEST");
  }

  assert.equal(callCount, 0);
});

test("applies the same supported instrument, timeframe, and range rules to synchronization", async () => {
  let callCount = 0;
  const api = createHistoricalCandlesApi({
    getHistoricalCandlesUseCase: { async execute() { return []; } },
    syncOneMinuteCandlesUseCase: {
      async execute() {
        callCount += 1;
        return {};
      }
    }
  });

  const unsupportedInstrument = await api.sync({
    ...VALID_PARAMETERS,
    instrumentId: "USD000UTSTOM"
  });
  const unsupportedTimeframe = await api.sync({
    ...VALID_PARAMETERS,
    timeframe: "ONE_HOUR"
  });
  const excessiveRange = await api.sync({
    ...VALID_PARAMETERS,
    till: "2026-09-15T14:00:00.001Z"
  });

  assert.equal(unsupportedInstrument.statusCode, 400);
  assert.equal(unsupportedInstrument.body.code, "UNSUPPORTED_HISTORICAL_INSTRUMENT");
  assert.equal(unsupportedTimeframe.statusCode, 400);
  assert.equal(unsupportedTimeframe.body.code, "UNSUPPORTED_HISTORICAL_TIMEFRAME");
  assert.equal(excessiveRange.statusCode, 400);
  assert.equal(excessiveRange.body.code, "HISTORICAL_CANDLES_RANGE_TOO_LARGE");
  assert.equal(callCount, 0);
});

test("shares the in-flight request guard between load and synchronization", async () => {
  let releaseLoad;
  let loadCount = 0;
  let syncCount = 0;
  const api = createHistoricalCandlesApi({
    getHistoricalCandlesUseCase: {
      async execute() {
        loadCount += 1;
        await new Promise(resolve => {
          releaseLoad = resolve;
        });
        return [];
      }
    },
    syncOneMinuteCandlesUseCase: {
      async execute() {
        syncCount += 1;
        return {};
      }
    },
    now: () => 1000
  });

  const loadRequest = api.load(searchParams());
  await Promise.resolve();
  const syncResult = await api.sync({ ...VALID_PARAMETERS });
  releaseLoad();
  await loadRequest;

  assert.equal(syncResult.statusCode, 429);
  assert.equal(syncResult.body.code, "HISTORICAL_CANDLES_REQUEST_THROTTLED");
  assert.equal(loadCount, 1);
  assert.equal(syncCount, 0);
});

test("shares the minimum request interval between synchronization and load", async () => {
  let currentTimestamp = 1000;
  let loadCount = 0;
  let syncCount = 0;
  const api = createHistoricalCandlesApi({
    getHistoricalCandlesUseCase: {
      async execute() {
        loadCount += 1;
        return [];
      }
    },
    syncOneMinuteCandlesUseCase: {
      async execute() {
        syncCount += 1;
        return {};
      }
    },
    now: () => currentTimestamp
  });

  assert.equal((await api.sync({ ...VALID_PARAMETERS })).statusCode, 200);
  currentTimestamp = 2999;
  assert.equal((await api.load(searchParams())).statusCode, 429);
  currentTimestamp = 3000;
  assert.equal((await api.load(searchParams())).statusCode, 200);
  assert.equal(syncCount, 1);
  assert.equal(loadCount, 1);
});

test("maps synchronization MOEX failures without exposing their cause", async () => {
  const api = createHistoricalCandlesApi({
    getHistoricalCandlesUseCase: { async execute() { return []; } },
    syncOneMinuteCandlesUseCase: {
      async execute() {
        const error = new Error("Internal remote response details.");
        error.code = "MOEX_ISS_REQUEST_FAILED";
        throw error;
      }
    }
  });

  const result = await api.sync({ ...VALID_PARAMETERS });

  assert.deepEqual(result, {
    statusCode: 502,
    body: {
      code: "MOEX_ISS_REQUEST_FAILED",
      message: "Historical market data is temporarily unavailable."
    }
  });
});

test("loads exactly one resumable backfill range", async () => {
  let receivedCommand;
  const backfillResult = Object.freeze({
    instrumentId: "CNYRUB_TOM",
    loadedRangeCount: 1,
    complete: false
  });
  const api = createHistoricalCandlesApi({
    getHistoricalCandlesUseCase: { async execute() { return []; } },
    backfillHistoricalCandlesUseCase: {
      async execute(command) {
        receivedCommand = command;
        return backfillResult;
      }
    },
    now: () => Date.parse("2026-09-17T08:15:00.000Z")
  });

  const result = await api.backfillStep({ instrumentId: "CNYRUB_TOM" });

  assert.deepEqual(receivedCommand, {
    instrumentId: "CNYRUB_TOM",
    asOf: "2026-09-17T08:15:00.000Z",
    maxRanges: 1
  });
  assert.deepEqual(result, { statusCode: 200, body: backfillResult });
});

test("requires an exact supported backfill command", async () => {
  let callCount = 0;
  const api = createHistoricalCandlesApi({
    getHistoricalCandlesUseCase: { async execute() { return []; } },
    backfillHistoricalCandlesUseCase: {
      async execute() {
        callCount += 1;
        return {};
      }
    }
  });

  for (const body of [
    null,
    [],
    {},
    { instrumentId: "CNYRUB_TOM", maxRanges: 2 }
  ]) {
    const result = await api.backfillStep(body);

    assert.equal(result.statusCode, 400);
    assert.equal(
      result.body.code,
      "INVALID_HISTORICAL_CANDLES_BACKFILL_REQUEST"
    );
  }

  const unsupported = await api.backfillStep({
    instrumentId: "USD000UTSTOM"
  });

  assert.equal(unsupported.statusCode, 400);
  assert.equal(unsupported.body.code, "UNSUPPORTED_HISTORICAL_INSTRUMENT");
  assert.equal(callCount, 0);
});

test("shares the outbound request guard with backfill", async () => {
  let releaseBackfill;
  let loadCount = 0;
  const api = createHistoricalCandlesApi({
    getHistoricalCandlesUseCase: {
      async execute() {
        loadCount += 1;
        return [];
      }
    },
    backfillHistoricalCandlesUseCase: {
      async execute() {
        await new Promise(resolve => {
          releaseBackfill = resolve;
        });
        return {};
      }
    },
    now: () => 1000
  });

  const backfillRequest = api.backfillStep({ instrumentId: "CNYRUB_TOM" });
  await Promise.resolve();
  const loadResult = await api.load(searchParams());
  releaseBackfill();
  await backfillRequest;

  assert.equal(loadResult.statusCode, 429);
  assert.equal(loadResult.body.code, "HISTORICAL_CANDLES_REQUEST_THROTTLED");
  assert.equal(loadCount, 0);
});

test("reads backfill status without consuming the MOEX request guard", async () => {
  let receivedQuery;
  let loadCount = 0;
  const status = Object.freeze({
    instrumentId: "CNYRUB_TOM",
    complete: false
  });
  const api = createHistoricalCandlesApi({
    getHistoricalCandlesUseCase: {
      async execute() {
        loadCount += 1;
        return [];
      }
    },
    getHistoricalCandleBackfillStatusUseCase: {
      async execute(query) {
        receivedQuery = query;
        return status;
      }
    },
    now: () => Date.parse("2026-09-17T08:15:00.000Z")
  });

  const statusResult = await api.backfillStatus(new URLSearchParams({
    instrumentId: "CNYRUB_TOM"
  }));
  const loadResult = await api.load(searchParams());

  assert.deepEqual(receivedQuery, {
    instrumentId: "CNYRUB_TOM",
    asOf: "2026-09-17T08:15:00.000Z"
  });
  assert.deepEqual(statusResult, { statusCode: 200, body: status });
  assert.equal(loadResult.statusCode, 200);
  assert.equal(loadCount, 1);
});

test("validates backfill status parameters before reading storage", async () => {
  let callCount = 0;
  const api = createHistoricalCandlesApi({
    getHistoricalCandlesUseCase: { async execute() { return []; } },
    getHistoricalCandleBackfillStatusUseCase: {
      async execute() {
        callCount += 1;
        return {};
      }
    }
  });

  const missing = await api.backfillStatus(new URLSearchParams());
  const extra = await api.backfillStatus(new URLSearchParams({
    instrumentId: "CNYRUB_TOM",
    unexpected: "true"
  }));
  const unsupported = await api.backfillStatus(new URLSearchParams({
    instrumentId: "USD000UTSTOM"
  }));

  assert.equal(missing.statusCode, 400);
  assert.equal(extra.statusCode, 400);
  assert.equal(unsupported.statusCode, 400);
  assert.equal(callCount, 0);
});

test("reads a manual Source Candle synchronization plan without consuming the request guard", async () => {
  let receivedCommand;
  let loadCount = 0;
  const plan = Object.freeze({
    instrumentId: "CNYRUB_TOM",
    fromDate: "2026-09-14",
    throughDate: "2026-09-16",
    days: Object.freeze([])
  });
  const api = createHistoricalCandlesApi({
    getHistoricalCandlesUseCase: {
      async execute() {
        loadCount += 1;
        return [];
      }
    },
    getManualHistoricalSourceCandleSyncPlanUseCase: {
      async execute(command) {
        receivedCommand = command;
        return plan;
      }
    },
    now: () => 1000
  });

  const planResult = await api.manualSyncPlan(new URLSearchParams({
    instrumentId: "CNYRUB_TOM",
    fromDate: "2026-09-14"
  }));
  const loadResult = await api.load(searchParams());

  assert.deepEqual(receivedCommand, {
    instrumentId: "CNYRUB_TOM",
    fromDate: "2026-09-14"
  });
  assert.deepEqual(planResult, { statusCode: 200, body: plan });
  assert.equal(loadResult.statusCode, 200);
  assert.equal(loadCount, 1);
});

test("synchronizes exactly the next manual Source Candle day", async () => {
  let receivedCommand;
  const resultBody = Object.freeze({
    instrumentId: "CNYRUB_TOM",
    fromDate: "2026-09-14",
    throughDate: "2026-09-16",
    complete: false,
    processedDay: Object.freeze({
      date: "2026-09-14",
      status: "COMPLETED",
      storedCandleCount: 480
    })
  });
  const api = createHistoricalCandlesApi({
    getHistoricalCandlesUseCase: { async execute() { return []; } },
    syncNextManualHistoricalSourceCandleDayUseCase: {
      async execute(command) {
        receivedCommand = command;
        return resultBody;
      }
    }
  });

  const result = await api.manualSyncStep({
    instrumentId: "CNYRUB_TOM",
    fromDate: "2026-09-14"
  });

  assert.deepEqual(receivedCommand, {
    instrumentId: "CNYRUB_TOM",
    fromDate: "2026-09-14"
  });
  assert.deepEqual(result, { statusCode: 200, body: resultBody });
});

test("waits for the shared source cooldown before a manual synchronization step", async () => {
  const waits = [];
  let stepCount = 0;
  const api = createHistoricalCandlesApi({
    getHistoricalCandlesUseCase: { async execute() { return []; } },
    syncNextManualHistoricalSourceCandleDayUseCase: {
      async execute() {
        stepCount += 1;
        return {};
      }
    },
    sleep(milliseconds) {
      waits.push(milliseconds);
    },
    now: () => 1000
  });

  assert.equal((await api.load(searchParams())).statusCode, 200);
  const result = await api.manualSyncStep({
    instrumentId: "CNYRUB_TOM",
    fromDate: "2026-09-14"
  });

  assert.equal(result.statusCode, 200);
  assert.deepEqual(waits, [2000]);
  assert.equal(stepCount, 1);
});

test("validates manual Source Candle synchronization parameters before execution", async () => {
  let callCount = 0;
  const api = createHistoricalCandlesApi({
    getHistoricalCandlesUseCase: { async execute() { return []; } },
    getManualHistoricalSourceCandleSyncPlanUseCase: {
      async execute() {
        callCount += 1;
        return {};
      }
    },
    syncNextManualHistoricalSourceCandleDayUseCase: {
      async execute() {
        callCount += 1;
        return {};
      }
    }
  });

  const invalidPlan = await api.manualSyncPlan(new URLSearchParams({
    instrumentId: "CNYRUB_TOM"
  }));
  const extraBody = await api.manualSyncStep({
    instrumentId: "CNYRUB_TOM",
    fromDate: "2026-09-14",
    unexpected: true
  });
  const unsupported = await api.manualSyncStep({
    instrumentId: "USD000UTSTOM",
    fromDate: "2026-09-14"
  });

  assert.equal(invalidPlan.statusCode, 400);
  assert.equal(extraBody.statusCode, 400);
  assert.equal(unsupported.statusCode, 400);
  assert.equal(callCount, 0);
});

test("maps a failed manual day without exposing its internal cause", async () => {
  const api = createHistoricalCandlesApi({
    getHistoricalCandlesUseCase: { async execute() { return []; } },
    syncNextManualHistoricalSourceCandleDayUseCase: {
      async execute() {
        const cause = new Error("Remote details.");
        cause.code = "MOEX_ISS_REQUEST_FAILED";
        const error = new Error(
          "Historical Source Candle synchronization failed for 2026-09-14."
        );
        error.code = "HISTORICAL_SOURCE_CANDLE_DAY_SYNC_FAILED";
        error.date = "2026-09-14";
        error.cause = cause;
        throw error;
      }
    }
  });

  const result = await api.manualSyncStep({
    instrumentId: "CNYRUB_TOM",
    fromDate: "2026-09-14"
  });

  assert.deepEqual(result, {
    statusCode: 502,
    body: {
      code: "HISTORICAL_SOURCE_CANDLE_DAY_SYNC_FAILED",
      message: "Historical Source Candle synchronization failed for 2026-09-14.",
      date: "2026-09-14"
    }
  });
});

test("shares the in-flight guard with manual Source Candle synchronization", async () => {
  let releaseStep;
  let loadCount = 0;
  const api = createHistoricalCandlesApi({
    getHistoricalCandlesUseCase: {
      async execute() {
        loadCount += 1;
        return [];
      }
    },
    syncNextManualHistoricalSourceCandleDayUseCase: {
      async execute() {
        await new Promise(resolve => {
          releaseStep = resolve;
        });
        return {};
      }
    }
  });

  const stepRequest = api.manualSyncStep({
    instrumentId: "CNYRUB_TOM",
    fromDate: "2026-09-14"
  });
  await Promise.resolve();
  const loadResult = await api.load(searchParams());
  releaseStep();
  await stepRequest;

  assert.equal(loadResult.statusCode, 429);
  assert.equal(loadCount, 0);
});
