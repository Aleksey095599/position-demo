"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  FormBatchUseCase
} = require("./form-batch-use-case");

const commonTrade = {
  tradeId: 1,
  tradeType: "CLIENT_DEAL",
  currentPositionManagementMode: "MANUAL",
  ccyPairCode: "EUR_USD",
  baseCcyCode: "EUR",
  quoteCcyCode: "USD",
  tradeDate: "2026-07-27",
  side: "SELL",
  dealtCcyCode: "EUR",
  baseCcyAmountMinor: 10000,
  baseCcyFractionDigits: 2,
  quoteCcyAmountMinor: 11200,
  quoteCcyFractionDigits: 2,
  transferRate: 1.12,
  tenor: "TOD",
  baseCcyValueDate: "2026-07-27",
  quoteCcyValueDate: "2026-07-27",
  rateFractionDigits: 4
};

function useCaseWith(overrides = {}) {
  return new FormBatchUseCase({
    transactionRunner: {
      run: operation => operation()
    },
    batchRepository: {
      findFormedByIdempotencyKey: () => null,
      saveFormed: value => ({
        batchId: 7,
        batchStatus: "FORMED",
        sourceTradeIds: value.formation.sourceTradeIds
      })
    },
    tradeExposureRepository: {
      findBatchSources: () => [commonTrade]
    },
    clock: () => new Date("2026-07-27T10:00:00.000Z"),
    ...overrides
  });
}

test("forms a batch through one transaction boundary", () => {
  let transactions = 0;
  let savedBatch;
  const useCase = useCaseWith({
    transactionRunner: {
      run(operation) {
        transactions += 1;
        return operation();
      }
    },
    batchRepository: {
      findFormedByIdempotencyKey: () => null,
      saveFormed(value) {
        savedBatch = value;
        return {
          batchId: 7,
          batchStatus: "FORMED",
          sourceTradeIds: value.formation.sourceTradeIds
        };
      }
    }
  });

  const result = useCase.execute({
    idempotencyKey: "one-batch-1",
    tradeIds: [1]
  });

  assert.equal(transactions, 1);
  assert.equal(result.batchId, 7);
  assert.equal(result.replayed, false);
  assert.equal("tradeType" in savedBatch.formation.quoteCashOut, false);
  assert.equal("memberRole" in savedBatch.formation.quoteCashOut, false);
  assert.equal(savedBatch.formation.quoteCashOut.quoteBalanceContributionMinor, 0n);
  assert.equal(savedBatch.formationReason.reasonCode, "MANUAL_SELECTION");
  assert.deepEqual(savedBatch.formationReason.details, { selectedTradeCount: 1 });
  assert.deepEqual(savedBatch.formationTiming, {
    windowOpenedAt: null,
    windowClosedAt: null
  });
  assert.equal(savedBatch.formation.positionManagementMode, "MANUAL");
});

test("preserves the current source Position Management Mode independently of formation reason", () => {
  let savedBatch;
  const useCase = useCaseWith({
    batchRepository: {
      findFormedByIdempotencyKey: () => null,
      saveFormed(value) {
        savedBatch = value;
        return {
          batchId: 8,
          batchStatus: "FORMED",
          sourceTradeIds: value.formation.sourceTradeIds
        };
      }
    },
    tradeExposureRepository: {
      findBatchSources: () => [{
        ...commonTrade,
        currentPositionManagementMode: "AUTO"
      }]
    }
  });

  useCase.execute({
    idempotencyKey: "manual-command-for-auto-source",
    tradeIds: [1]
  });

  assert.equal(savedBatch.formationReason.reasonCode, "MANUAL_SELECTION");
  assert.equal(savedBatch.formation.positionManagementMode, "AUTO");
});

test("rejects source trades from different Position Management Modes", () => {
  let saveCalls = 0;
  const useCase = useCaseWith({
    batchRepository: {
      findFormedByIdempotencyKey: () => null,
      saveFormed() {
        saveCalls += 1;
      }
    },
    tradeExposureRepository: {
      findBatchSources: () => [
        commonTrade,
        {
          ...commonTrade,
          tradeId: 2,
          currentPositionManagementMode: "AUTO"
        }
      ]
    }
  });

  assert.throws(
    () => useCase.execute({
      idempotencyKey: "mixed-position-modes",
      tradeIds: [1, 2]
    }),
    error => error.code === "INCOMPATIBLE_BATCH_SELECTION"
  );
  assert.equal(saveCalls, 0);
});

test("preserves an automatic formation reason with its structured values", () => {
  let savedBatch;
  const useCase = useCaseWith({
    batchRepository: {
      findFormedByIdempotencyKey: () => null,
      saveFormed(value) {
        savedBatch = value;
        return {
          batchId: 8,
          batchStatus: "FORMED",
          sourceTradeIds: value.formation.sourceTradeIds
        };
      }
    }
  });

  useCase.execute({
    idempotencyKey: "auto-batch-1",
    tradeIds: [1],
    formationReasonCode: "MAX_INTERVAL_REACHED",
    formationReasonDetails: {
      maxIntervalSeconds: 60,
      oldestTradeAgeMilliseconds: 60000
    },
    windowOpenedAt: "2026-07-27T09:59:00.000Z",
    windowClosedAt: "2026-07-27T10:00:00.000Z"
  });

  assert.equal(savedBatch.formationReason.reasonCode, "MAX_INTERVAL_REACHED");
  assert.deepEqual(savedBatch.formationReason.details, {
    maxIntervalSeconds: 60,
    oldestTradeAgeMilliseconds: 60000,
    selectedTradeCount: 1
  });
  assert.equal(
    savedBatch.formationReason.detailsJson,
    "{\"maxIntervalSeconds\":60,\"oldestTradeAgeMilliseconds\":60000,\"selectedTradeCount\":1}"
  );
  assert.deepEqual(savedBatch.formationTiming, {
    windowOpenedAt: "2026-07-27T09:59:00.000Z",
    windowClosedAt: "2026-07-27T10:00:00.000Z"
  });
});

test("returns an idempotent replay for the same selection", () => {
  const useCase = useCaseWith({
    batchRepository: {
      findFormedByIdempotencyKey: () => ({
        batchId: 7,
        batchStatus: "FORMED",
        formationReasonCode: "MANUAL_SELECTION",
        formationReasonDetails: {
          selectedTradeCount: 2
        },
        windowOpenedAt: null,
        windowClosedAt: null,
        sourceTradeIds: [2, 1]
      })
    }
  });

  const result = useCase.execute({
    idempotencyKey: "one-batch-1",
    tradeIds: [1, 2]
  });

  assert.equal(result.batchId, 7);
  assert.equal(result.replayed, true);
});

test("rejects reuse of an idempotency key for another selection", () => {
  const useCase = useCaseWith({
    batchRepository: {
      findFormedByIdempotencyKey: () => ({
        batchId: 7,
        batchStatus: "FORMED",
        formationReasonCode: "MANUAL_SELECTION",
        sourceTradeIds: [1]
      })
    }
  });

  assert.throws(
    () => useCase.execute({
      idempotencyKey: "one-batch-1",
      tradeIds: [2]
    }),
    error => error.code === "BATCH_IDEMPOTENCY_CONFLICT"
  );
});

test("rejects reuse of an automatic Batch key by a manual command", () => {
  const useCase = useCaseWith({
    batchRepository: {
      findFormedByIdempotencyKey: () => ({
        batchId: 7,
        batchStatus: "FORMED",
        formationReasonCode: "MAX_INTERVAL_REACHED",
        sourceTradeIds: [1]
      })
    }
  });

  assert.throws(
    () => useCase.execute({
      idempotencyKey: "auto-batch-1",
      tradeIds: [1]
    }),
    error => error.code === "BATCH_IDEMPOTENCY_CONFLICT"
  );
});

test("rejects replay when automatic formation details or timing differ", () => {
  const useCase = useCaseWith({
    batchRepository: {
      findFormedByIdempotencyKey: () => ({
        batchId: 7,
        batchStatus: "FORMED",
        formationReasonCode: "MAX_INTERVAL_REACHED",
        formationReasonDetails: {
          maxIntervalSeconds: 60,
          selectedTradeCount: 1
        },
        windowOpenedAt: "2026-07-27T09:59:00.000Z",
        windowClosedAt: "2026-07-27T10:00:00.000Z",
        sourceTradeIds: [1]
      })
    }
  });

  assert.throws(
    () => useCase.execute({
      idempotencyKey: "auto-batch-details-1",
      tradeIds: [1],
      formationReasonCode: "MAX_INTERVAL_REACHED",
      formationReasonDetails: {
        maxIntervalSeconds: 90
      },
      windowOpenedAt: "2026-07-27T09:59:00.000Z",
      windowClosedAt: "2026-07-27T10:00:00.000Z"
    }),
    error => error.code === "BATCH_IDEMPOTENCY_CONFLICT"
  );
});

test("replays the same automatic command with canonicalized reason details", () => {
  const useCase = useCaseWith({
    batchRepository: {
      findFormedByIdempotencyKey: () => ({
        batchId: 7,
        batchStatus: "FORMED",
        formationReasonCode: "MAX_INTERVAL_REACHED",
        formationReasonDetails: {
          selectedTradeCount: 1,
          maxIntervalSeconds: 60
        },
        windowOpenedAt: "2026-07-27T09:59:00.000Z",
        windowClosedAt: "2026-07-27T10:00:00.000Z",
        sourceTradeIds: [1]
      })
    }
  });

  const result = useCase.execute({
    idempotencyKey: "auto-batch-details-2",
    tradeIds: [1],
    formationReasonCode: "MAX_INTERVAL_REACHED",
    formationReasonDetails: {
      maxIntervalSeconds: 60
    },
    windowOpenedAt: "2026-07-27T09:59:00.000Z",
    windowClosedAt: "2026-07-27T10:00:00.000Z"
  });

  assert.equal(result.batchId, 7);
  assert.equal(result.replayed, true);
});

test("reports source Trade IDs that were not found", () => {
  const useCase = useCaseWith({
    tradeExposureRepository: {
      findBatchSources: () => [commonTrade]
    }
  });

  assert.throws(
    () => useCase.execute({
      idempotencyKey: "one-batch-missing-source",
      tradeIds: [1, 2]
    }),
    error => error.code === "BATCH_SOURCE_TRADE_NOT_FOUND"
      && error.message.includes("2")
  );
});

test("rejects current and historical internal manual batching key namespaces", () => {
  const useCase = useCaseWith();

  for (const idempotencyKey of ["__manual_batch__:8:1", "__fx_manual_batch__:8:1"]) {
    assert.throws(
      () => useCase.execute({ idempotencyKey, tradeIds: [1] }),
      error => error.code === "INVALID_BATCH_COMMAND"
    );
  }
});
