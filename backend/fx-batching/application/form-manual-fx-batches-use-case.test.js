"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  FX_MANUAL_BATCH_SELECTION_MODE
} = require("../domain/fx-manual-batch-selection");
const {
  FormManualFxBatchesUseCase
} = require("./form-manual-fx-batches-use-case");

function trade(tradeId, tenor, overrides = {}) {
  return {
    tradeId,
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
    tenor,
    baseCcyValueDate: "2026-07-27",
    quoteCcyValueDate: "2026-07-27",
    rateFractionDigits: 4,
    ...overrides
  };
}

function useCaseWith({
  sourceTrades = [trade(1, "TOD")],
  transactionRunner,
  formFxBatchUseCase,
  batchingSettings = { allowCrossTenorBatching: false },
  manualBatchFormationRepository,
  fxBatchResultRepository
} = {}) {
  let nextFormationId = 1;

  return new FormManualFxBatchesUseCase({
    transactionRunner: transactionRunner || {
      run: operation => operation()
    },
    formFxBatchUseCase: formFxBatchUseCase || {
      executeWithinTransaction: command => ({
        batchId: command.tradeIds[0] + 100,
        sourceTradeIds: command.tradeIds,
        replayed: false
      })
    },
    fxTradeExposureRepository: {
      findBatchSources: tradeIds => sourceTrades.filter(sourceTrade =>
        tradeIds.includes(sourceTrade.tradeId)
      )
    },
    batchingSettingsProvider: {
      get: () => batchingSettings
    },
    manualBatchFormationRepository: manualBatchFormationRepository || {
      findByIdempotencyKey: () => null,
      create: () => nextFormationId++,
      addBatch: () => {},
      complete: () => {}
    },
    fxBatchResultRepository: fxBatchResultRepository || {
      findCompletedById: () => null,
      findCompletedByIdempotencyKey: () => null
    }
  });
}

test("forms one manual FX Batch through one outer transaction", () => {
  let transactions = 0;
  const commands = [];
  const verifiedGroups = [];
  const useCase = useCaseWith({
    sourceTrades: [trade(2, "TOD"), trade(1, "TOD")],
    transactionRunner: {
      run(operation) {
        transactions += 1;
        return operation();
      }
    },
    formFxBatchUseCase: {
      executeWithinTransaction(command, options) {
        commands.push(command);
        verifiedGroups.push(
          options.verifiedSourceTrades.map(sourceTrade => sourceTrade.tradeId)
        );
        return { batchId: 41, replayed: false };
      }
    }
  });

  const result = useCase.execute({
    idempotencyKey: "manual-selection-1",
    mode: FX_MANUAL_BATCH_SELECTION_MODE.SINGLE_BATCH,
    tradeIds: [2, 1]
  });

  assert.equal(transactions, 1);
  assert.deepEqual(commands, [{
    idempotencyKey: "__fx_manual_batch__:1:1",
    tradeIds: [1, 2]
  }]);
  assert.deepEqual(verifiedGroups, [[1, 2]]);
  assert.deepEqual(result.batchIds, [41]);
  assert.equal(result.batchId, 41);
  assert.equal(result.separatedByTenor, false);
  assert.equal(result.replayed, false);
});

test("separates a mixed selection by Tenor with deterministic child keys", () => {
  const commands = [];
  const useCase = useCaseWith({
    sourceTrades: [trade(3, "TOM"), trade(2, "TOD"), trade(1, "TOD")],
    formFxBatchUseCase: {
      execute() {
        throw new Error("A child FX Batch must not open a nested transaction.");
      },
      executeWithinTransaction(command) {
        commands.push(command);
        return {
          batchId: command.tradeIds[0] === 1 ? 51 : 52,
          replayed: true
        };
      }
    }
  });

  const result = useCase.execute({
    idempotencyKey: "manual-selection-2",
    mode: FX_MANUAL_BATCH_SELECTION_MODE.SEPARATE_BY_TENOR,
    tradeIds: [3, 2, 1]
  });

  assert.deepEqual(commands, [
    {
      idempotencyKey: "__fx_manual_batch__:1:1",
      tradeIds: [1, 2]
    },
    {
      idempotencyKey: "__fx_manual_batch__:1:2",
      tradeIds: [3]
    }
  ]);
  assert.deepEqual(result.batchIds, [51, 52]);
  assert.equal(result.batchId, null);
  assert.equal(result.separatedByTenor, true);
  assert.equal(result.replayed, true);
});

test("requires an explicit resolution for a mixed single-batch selection", () => {
  let formations = 0;
  const useCase = useCaseWith({
    sourceTrades: [trade(1, "TOD"), trade(2, "TOM")],
    formFxBatchUseCase: {
      executeWithinTransaction() {
        formations += 1;
      }
    }
  });

  assert.throws(
    () => useCase.execute({
      idempotencyKey: "manual-selection-3",
      mode: FX_MANUAL_BATCH_SELECTION_MODE.SINGLE_BATCH,
      tradeIds: [1, 2]
    }),
    error => error?.code === "CROSS_TENOR_BATCHING_RESOLUTION_REQUIRED"
  );
  assert.equal(formations, 0);
});

test("rejects a selection when a requested trade cannot be resolved", () => {
  const useCase = useCaseWith({
    sourceTrades: [trade(1, "TOD")]
  });

  assert.throws(
    () => useCase.execute({
      idempotencyKey: "manual-selection-missing",
      tradeIds: [1, 2]
    }),
    error => error?.code === "BATCH_SOURCE_TRADE_NOT_FOUND"
  );
});

test("rejects an invalid source trade before planning or child formation", () => {
  let formations = 0;
  let registers = 0;
  const useCase = useCaseWith({
    sourceTrades: [trade(1, "TOD", { transferRate: 0 })],
    formFxBatchUseCase: {
      executeWithinTransaction() {
        formations += 1;
      }
    },
    manualBatchFormationRepository: {
      findByIdempotencyKey: () => null,
      create() {
        registers += 1;
      },
      addBatch: () => {},
      complete: () => {}
    }
  });

  assert.throws(
    () => useCase.execute({
      idempotencyKey: "manual-selection-invalid-source",
      tradeIds: [1]
    }),
    error => error?.code === "INVALID_BATCH_SOURCE_TRADE"
  );
  assert.equal(formations, 0);
  assert.equal(registers, 0);
});

test("rolls back every child batch when one Tenor group fails", () => {
  let transactions = 0;
  let nestedTransactions = 0;
  const persistedKeys = [];
  const transactionRunner = {
    run(operation) {
      transactions += 1;
      const before = [...persistedKeys];

      try {
        return operation();
      } catch (error) {
        persistedKeys.splice(0, persistedKeys.length, ...before);
        throw error;
      }
    }
  };
  const useCase = useCaseWith({
    sourceTrades: [trade(1, "TOD"), trade(2, "TOM")],
    transactionRunner,
    formFxBatchUseCase: {
      execute() {
        nestedTransactions += 1;
        return transactionRunner.run(() => ({}));
      },
      executeWithinTransaction(command) {
        persistedKeys.push(command.idempotencyKey);

        if (command.idempotencyKey.endsWith(":2")) {
          const error = new Error("TOM batch formation failed.");
          error.code = "INCOMPATIBLE_BATCH_SELECTION";
          throw error;
        }

        return { batchId: 61, replayed: false };
      }
    }
  });

  assert.throws(
    () => useCase.execute({
      idempotencyKey: "manual-selection-4",
      mode: FX_MANUAL_BATCH_SELECTION_MODE.SEPARATE_BY_TENOR,
      tradeIds: [1, 2]
    }),
    error => error?.code === "INCOMPATIBLE_BATCH_SELECTION"
  );
  assert.equal(transactions, 1);
  assert.equal(nestedTransactions, 0);
  assert.deepEqual(persistedKeys, []);
});

test("reserves the root Idempotency Key for the complete split operation", () => {
  const formations = new Map();
  const batchResults = new Map();
  let nextFormationId = 1;
  let nextBatchId = 81;
  let childFormations = 0;
  const manualBatchFormationRepository = {
    findByIdempotencyKey(idempotencyKey) {
      return formations.get(idempotencyKey) || null;
    },
    create({ idempotencyKey, selectionMode, tradeIds, batchCount }) {
      const formationId = nextFormationId++;
      formations.set(idempotencyKey, {
        formationId,
        idempotencyKey,
        selectionMode,
        tradeIds,
        batchCount,
        operationStatus: "BUILDING",
        batches: []
      });
      return formationId;
    },
    addBatch({ formationId, batchOrdinal, tenor, batchId }) {
      const formation = [...formations.values()].find(
        candidate => candidate.formationId === formationId
      );
      formation.batches.push({ batchOrdinal, tenor, batchId });
    },
    complete(formationId) {
      const formation = [...formations.values()].find(
        candidate => candidate.formationId === formationId
      );
      formation.operationStatus = "COMPLETED";
    }
  };
  const fxBatchResultRepository = {
    findCompletedById: batchId => batchResults.get(batchId) || null,
    findCompletedByIdempotencyKey: () => null
  };
  const useCase = useCaseWith({
    sourceTrades: [trade(1, "TOD"), trade(2, "TOM"), trade(3, "SPOT")],
    manualBatchFormationRepository,
    fxBatchResultRepository,
    formFxBatchUseCase: {
      executeWithinTransaction(command) {
        childFormations += 1;
        const result = {
          batchId: nextBatchId++,
          sourceTradeIds: command.tradeIds,
          formationReasonCode: "MANUAL_SELECTION",
          replayed: false
        };
        batchResults.set(result.batchId, result);
        return result;
      }
    }
  });
  const command = {
    idempotencyKey: "whole-manual-operation",
    mode: FX_MANUAL_BATCH_SELECTION_MODE.SEPARATE_BY_TENOR,
    tradeIds: [2, 1]
  };

  const first = useCase.execute(command);
  const replay = useCase.execute(command);

  assert.deepEqual(first.batchIds, [81, 82]);
  assert.deepEqual(replay.batchIds, [81, 82]);
  assert.equal(replay.replayed, true);
  assert.equal(childFormations, 2);
  assert.throws(
    () => useCase.execute({ ...command, tradeIds: [1, 3] }),
    error => error?.code === "BATCH_IDEMPOTENCY_CONFLICT"
  );
  assert.throws(
    () => useCase.execute({
      ...command,
      mode: FX_MANUAL_BATCH_SELECTION_MODE.SINGLE_BATCH
    }),
    error => error?.code === "BATCH_IDEMPOTENCY_CONFLICT"
  );
});

test("keeps the full public Idempotency Key length available for split mode", () => {
  const commands = [];
  const useCase = useCaseWith({
    sourceTrades: [trade(1, "TOD"), trade(2, "TOM")],
    formFxBatchUseCase: {
      executeWithinTransaction(command) {
        commands.push(command);
        return { batchId: 90 + commands.length, replayed: false };
      }
    }
  });

  useCase.execute({
    idempotencyKey: "x".repeat(100),
    mode: FX_MANUAL_BATCH_SELECTION_MODE.SEPARATE_BY_TENOR,
    tradeIds: [1, 2]
  });

  assert.deepEqual(commands.map(command => command.idempotencyKey), [
    "__fx_manual_batch__:1:1",
    "__fx_manual_batch__:1:2"
  ]);
});
