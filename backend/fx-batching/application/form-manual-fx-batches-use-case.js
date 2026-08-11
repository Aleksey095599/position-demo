"use strict";

const {
  FX_MANUAL_BATCH_SELECTION_MODE,
  planManualBatchSelection
} = require("../domain/fx-manual-batch-selection");

const MAX_TRADES_PER_MANUAL_FORMATION = 200;
const MAX_BATCH_IDEMPOTENCY_KEY_LENGTH = 100;
const INTERNAL_BATCH_IDEMPOTENCY_KEY_PREFIX = "__fx_manual_batch__:";

function applicationError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function normalizedCommand(command) {
  const source = command && typeof command === "object" ? command : {};
  const idempotencyKey = String(source.idempotencyKey || "").trim();

  if (
    idempotencyKey.length < 1
    || idempotencyKey.length > MAX_BATCH_IDEMPOTENCY_KEY_LENGTH
  ) {
    throw applicationError(
      "INVALID_BATCH_COMMAND",
      "Idempotency Key must contain between 1 and 100 characters."
    );
  }

  if (idempotencyKey.startsWith(INTERNAL_BATCH_IDEMPOTENCY_KEY_PREFIX)) {
    throw applicationError(
      "INVALID_BATCH_COMMAND",
      "Idempotency Key uses a reserved internal prefix."
    );
  }

  if (!Array.isArray(source.tradeIds) || source.tradeIds.length === 0) {
    throw applicationError(
      "INVALID_BATCH_COMMAND",
      "Select at least one eligible FX Trade."
    );
  }

  if (source.tradeIds.length > MAX_TRADES_PER_MANUAL_FORMATION) {
    throw applicationError(
      "INVALID_BATCH_COMMAND",
      "No more than 200 trades can be processed at once."
    );
  }

  const tradeIds = source.tradeIds.map(Number);

  if (tradeIds.some(tradeId => !Number.isSafeInteger(tradeId) || tradeId <= 0)) {
    throw applicationError(
      "INVALID_BATCH_COMMAND",
      "Every Trade ID must be a positive integer."
    );
  }

  if (new Set(tradeIds).size !== tradeIds.length) {
    throw applicationError(
      "INVALID_BATCH_COMMAND",
      "Every Trade ID may be selected only once."
    );
  }

  return {
    idempotencyKey,
    mode: String(
      source.mode || FX_MANUAL_BATCH_SELECTION_MODE.SINGLE_BATCH
    ).trim().toUpperCase(),
    tradeIds: [...tradeIds].sort((left, right) => left - right)
  };
}

function sameTradeIds(left, right) {
  return left.length === right.length
    && left.every((tradeId, index) => tradeId === right[index]);
}

function idempotencyConflict() {
  return applicationError(
    "BATCH_IDEMPOTENCY_CONFLICT",
    "Idempotency Key was already used for a different manual batching request."
  );
}

function childIdempotencyKey(formationId, batchOrdinal) {
  return `${INTERNAL_BATCH_IDEMPOTENCY_KEY_PREFIX}${formationId}:${batchOrdinal}`;
}

function manualFormationResult(batches, separatedByTenor) {
  const batchIds = batches.map(batch => Number(batch.batchId));
  const result = {
    batches,
    batchIds,
    batchId: batches.length === 1 ? batchIds[0] : null,
    separatedByTenor,
    replayed: batches.every(batch => batch.replayed === true)
  };

  return batches.length === 1
    ? { ...batches[0], ...result }
    : result;
}

class FormManualFxBatchesUseCase {
  constructor({
    transactionRunner,
    formFxBatchUseCase,
    fxTradeSelectionRepository,
    batchingSettingsProvider,
    manualBatchFormationRepository,
    fxBatchResultRepository
  }) {
    this.transactionRunner = transactionRunner;
    this.formFxBatchUseCase = formFxBatchUseCase;
    this.fxTradeSelectionRepository = fxTradeSelectionRepository;
    this.batchingSettingsProvider = batchingSettingsProvider;
    this.manualBatchFormationRepository = manualBatchFormationRepository;
    this.fxBatchResultRepository = fxBatchResultRepository;
  }

  execute(command) {
    const normalized = normalizedCommand(command);

    return this.transactionRunner.run(() => {
      const existingFormation =
        this.manualBatchFormationRepository.findByIdempotencyKey(
          normalized.idempotencyKey
        );

      if (existingFormation) {
        if (
          existingFormation.selectionMode !== normalized.mode
          || !sameTradeIds(existingFormation.tradeIds, normalized.tradeIds)
        ) {
          throw idempotencyConflict();
        }

        if (
          existingFormation.operationStatus !== "COMPLETED"
          || existingFormation.batches.length !== existingFormation.batchCount
        ) {
          throw applicationError(
            "MANUAL_FORMATION_INTEGRITY_ERROR",
            "Completed manual batching operation is inconsistent."
          );
        }

        const batches = existingFormation.batches.map(link => {
          const batch = this.fxBatchResultRepository.findCompletedById(
            link.batchId
          );

          if (!batch) {
            throw applicationError(
              "MANUAL_FORMATION_INTEGRITY_ERROR",
              `Completed FX Batch ${link.batchId} was not found.`
            );
          }

          return { ...batch, replayed: true };
        });

        return manualFormationResult(
          batches,
          existingFormation.selectionMode
            === FX_MANUAL_BATCH_SELECTION_MODE.SEPARATE_BY_TENOR
            && batches.length > 1
        );
      }

      const legacyBatch = this.fxBatchResultRepository
        .findCompletedByIdempotencyKey(normalized.idempotencyKey);

      if (legacyBatch) {
        const legacyTradeIds = [...legacyBatch.sourceTradeIds]
          .map(Number)
          .sort((left, right) => left - right);

        if (
          normalized.mode !== FX_MANUAL_BATCH_SELECTION_MODE.SINGLE_BATCH
          || legacyBatch.formationReasonCode !== "MANUAL_SELECTION"
          || !sameTradeIds(legacyTradeIds, normalized.tradeIds)
        ) {
          throw idempotencyConflict();
        }

        return manualFormationResult(
          [{ ...legacyBatch, replayed: true }],
          false
        );
      }

      const sourceTrades = this.fxTradeSelectionRepository.findByIds(
        normalized.tradeIds
      );
      const foundTradeIds = new Set(
        sourceTrades.map(trade => Number(trade?.tradeId))
      );
      const missingTradeIds = normalized.tradeIds.filter(
        tradeId => !foundTradeIds.has(tradeId)
      );

      if (missingTradeIds.length > 0) {
        throw applicationError(
          "BATCH_SOURCE_TRADE_NOT_FOUND",
          `Trade ${missingTradeIds.join(", ")} was not found for manual FX batching.`
        );
      }

      const settings = this.batchingSettingsProvider.get();
      const groups = planManualBatchSelection({
        trades: sourceTrades,
        mode: normalized.mode,
        allowCrossTenorBatching: settings?.allowCrossTenorBatching
      });
      const formationId = this.manualBatchFormationRepository.create({
        idempotencyKey: normalized.idempotencyKey,
        selectionMode: normalized.mode,
        tradeIds: normalized.tradeIds,
        batchCount: groups.length
      });
      const batches = groups.map((group, index) => {
        const batchOrdinal = index + 1;
        const batch = this.formFxBatchUseCase.executeWithinTransaction({
          idempotencyKey: childIdempotencyKey(formationId, batchOrdinal),
          tradeIds: group.trades.map(trade => Number(trade.tradeId))
        });

        this.manualBatchFormationRepository.addBatch({
          formationId,
          batchOrdinal,
          tenor: group.tenor,
          batchId: Number(batch.batchId)
        });
        return batch;
      });

      this.manualBatchFormationRepository.complete(formationId);

      return manualFormationResult(batches, groups.length > 1);
    });
  }
}

module.exports = {
  FormManualFxBatchesUseCase
};
