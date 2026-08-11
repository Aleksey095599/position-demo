"use strict";

const {
  formFxBatch
} = require("../domain/fx-batch-formation");
const {
  fxBatchFormationReason
} = require("../domain/fx-batch-formation-reason");
const {
  fxBatchFormationTiming
} = require("../domain/fx-batch-formation-timing");

function applicationError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function normalizedCommand(command) {
  const source = command && typeof command === "object" ? command : {};
  const idempotencyKey = String(source.idempotencyKey || "").trim();

  if (idempotencyKey.length < 1 || idempotencyKey.length > 100) {
    throw applicationError(
      "INVALID_BATCH_COMMAND",
      "Idempotency Key must contain between 1 and 100 characters."
    );
  }

  if (!Array.isArray(source.tradeIds) || source.tradeIds.length === 0) {
    throw applicationError(
      "INVALID_BATCH_COMMAND",
      "Select at least one eligible FX Trade."
    );
  }

  if (source.tradeIds.length > 200) {
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

  const formationReason = fxBatchFormationReason({
    reasonCode: source.formationReasonCode,
    details: source.formationReasonDetails
  }, tradeIds.length);
  const formationTiming = fxBatchFormationTiming({
    reasonCode: formationReason.reasonCode,
    windowOpenedAt: source.windowOpenedAt,
    windowClosedAt: source.windowClosedAt
  });

  return {
    idempotencyKey,
    tradeIds: [...tradeIds].sort((left, right) => left - right),
    formationReason,
    formationTiming
  };
}

function sameTradeIds(left, right) {
  return left.length === right.length
    && left.every((tradeId, index) => tradeId === right[index]);
}

class FormFxBatchUseCase {
  constructor({
    transactionRunner,
    fxBatchRepository,
    fxTradeExposureRepository,
    clock = () => new Date()
  }) {
    this.transactionRunner = transactionRunner;
    this.fxBatchRepository = fxBatchRepository;
    this.fxTradeExposureRepository = fxTradeExposureRepository;
    this.clock = clock;
  }

  execute(command) {
    const normalized = normalizedCommand(command);

    return this.transactionRunner.run(
      () => this.#executeNormalizedWithinTransaction(normalized)
    );
  }

  executeWithinTransaction(command) {
    return this.#executeNormalizedWithinTransaction(normalizedCommand(command));
  }

  #executeNormalizedWithinTransaction(normalized) {
    const existing = this.fxBatchRepository.findFormedByIdempotencyKey(
      normalized.idempotencyKey
    );

    if (existing) {
      const existingTradeIds = [...existing.sourceTradeIds]
        .sort((left, right) => left - right);

      if (!sameTradeIds(existingTradeIds, normalized.tradeIds)) {
        throw applicationError(
          "BATCH_IDEMPOTENCY_CONFLICT",
          "Idempotency Key was already used for a different trade selection."
        );
      }

      return {
        ...existing,
        replayed: true
      };
    }

    const sourceTrades = this.fxTradeExposureRepository.findBatchSources(
      normalized.tradeIds
    );
    const formation = formFxBatch({
      trades: sourceTrades,
      rateFractionDigits: sourceTrades[0]?.rateFractionDigits,
      now: this.clock
    });
    const result = this.fxBatchRepository.saveFormed({
      idempotencyKey: normalized.idempotencyKey,
      sourceTrades,
      formation,
      formationReason: normalized.formationReason,
      formationTiming: normalized.formationTiming
    });

    return {
      ...result,
      replayed: false
    };
  }
}

module.exports = {
  FormFxBatchUseCase
};
