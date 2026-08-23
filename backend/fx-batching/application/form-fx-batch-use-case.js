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
const {
  normalizeFxPositionManagementMode
} = require(
  "../../fx-position-management/domain/fx-position-management-policy"
);

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

  if (idempotencyKey.startsWith("__fx_manual_batch__:")) {
    throw applicationError(
      "INVALID_BATCH_COMMAND",
      "Idempotency Key uses a reserved internal namespace."
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

function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }

  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value);
}

function commonSourcePositionManagementMode(sourceTrades) {
  const sourceModes = new Set(sourceTrades.map(trade =>
    normalizeFxPositionManagementMode(
      trade?.currentPositionManagementMode,
      `FX Trade ${trade?.tradeId ?? "<unknown>"} Current FX Position Mode`
    )
  ));

  if (sourceModes.size !== 1) {
    throw applicationError(
      "INCOMPATIBLE_BATCH_SELECTION",
      "All source FX Trades in one Batch must have the same current FX Position Mode."
    );
  }

  return sourceModes.values().next().value;
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

  #executeNormalizedWithinTransaction(normalized) {
    const existing = this.fxBatchRepository.findFormedByIdempotencyKey(
      normalized.idempotencyKey
    );

    if (existing) {
      const existingTradeIds = [...existing.sourceTradeIds]
        .sort((left, right) => left - right);

      if (
        existing.formationReasonCode !== normalized.formationReason.reasonCode
        || canonicalJson(existing.formationReasonDetails)
          !== canonicalJson(normalized.formationReason.details)
        || (existing.windowOpenedAt ?? null)
          !== normalized.formationTiming.windowOpenedAt
        || (existing.windowClosedAt ?? null)
          !== normalized.formationTiming.windowClosedAt
        || !sameTradeIds(existingTradeIds, normalized.tradeIds)
      ) {
        throw applicationError(
          "BATCH_IDEMPOTENCY_CONFLICT",
          "Idempotency Key was already used for a different FX Batch command."
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
    const sourceTradeIds = Array.isArray(sourceTrades)
      ? sourceTrades
        .map(trade => Number(trade?.tradeId))
        .sort((left, right) => left - right)
      : [];

    if (!sameTradeIds(sourceTradeIds, normalized.tradeIds)) {
      const sourceTradeIdSet = new Set(sourceTradeIds);
      const missingTradeIds = normalized.tradeIds.filter(
        tradeId => !sourceTradeIdSet.has(tradeId)
      );

      if (missingTradeIds.length > 0) {
        throw applicationError(
          "BATCH_SOURCE_TRADE_NOT_FOUND",
          `FX Trade IDs unavailable for Batch formation: ${missingTradeIds.join(", ")}.`
        );
      }

      throw applicationError(
        "INVALID_BATCH_COMMAND",
        "Provided source FX Trades must match the command Trade IDs."
      );
    }

    const sourcePositionManagementMode = commonSourcePositionManagementMode(
      sourceTrades
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
      formationTiming: normalized.formationTiming,
      sourcePositionManagementMode
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
