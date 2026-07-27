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
  const useCase = useCaseWith({
    transactionRunner: {
      run(operation) {
        transactions += 1;
        return operation();
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
