"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  FormFxBatchUseCase
} = require("./form-fx-batch-use-case");

const commonTrade = {
  tradeId: 1,
  tradeType: "CLIENT_DEAL",
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
  return new FormFxBatchUseCase({
    transactionRunner: {
      run: operation => operation()
    },
    fxBatchRepository: {
      findFormedByIdempotencyKey: () => null,
      saveFormed: value => ({
        batchId: 7,
        batchStatus: "FORMED",
        sourceTradeIds: value.formation.sourceTradeIds
      })
    },
    fxTradeExposureRepository: {
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
    fxBatchRepository: {
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
});

test("preserves an automatic formation reason with its structured values", () => {
  let savedBatch;
  const useCase = useCaseWith({
    fxBatchRepository: {
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
    fxBatchRepository: {
      findFormedByIdempotencyKey: () => ({
        batchId: 7,
        batchStatus: "FORMED",
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
    fxBatchRepository: {
      findFormedByIdempotencyKey: () => ({
        batchId: 7,
        batchStatus: "FORMED",
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
