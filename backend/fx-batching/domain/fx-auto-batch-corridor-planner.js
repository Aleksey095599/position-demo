"use strict";

const {
  settlementBucketKey
} = require("./fx-auto-batch-selection");
const {
  evaluateTransferRateCorridor
} = require("./fx-transfer-rate-corridor");

const FX_AUTO_BATCH_CORRIDOR_TRIGGER_REASON = Object.freeze({
  TRANSFER_RATE_CORRIDOR_BREACHED: "TRANSFER_RATE_CORRIDOR_BREACHED"
});

function planningError(message) {
  const error = new RangeError(message);
  error.code = "INVALID_FX_AUTO_BATCH_CORRIDOR_PLAN";
  return error;
}

function normalizedText(value) {
  return String(value || "").trim().toUpperCase();
}

function normalizedTrade(trade, index) {
  const tradeId = Number(trade?.tradeId);
  const entryTimestamp = Date.parse(trade?.entryTimestamp || "");
  const ccyPairCode = normalizedText(trade?.ccyPairCode);

  if (!Number.isSafeInteger(tradeId) || tradeId <= 0) {
    throw planningError(`FX Trade ${index + 1} must have a positive integer ID.`);
  }

  if (!Number.isFinite(entryTimestamp)) {
    throw planningError(`FX Trade ${tradeId} must have a valid Entry Timestamp.`);
  }

  if (!ccyPairCode) {
    throw planningError(`FX Trade ${tradeId} must have a Ccy Pair Code.`);
  }

  return Object.freeze({
    tradeId,
    entryTimestamp,
    ccyPairCode,
    transferRate: trade.transferRate,
    settlementBucketKey: settlementBucketKey(trade)
  });
}

function compareByArrival(left, right) {
  return left.entryTimestamp - right.entryTimestamp
    || left.tradeId - right.tradeId;
}

function frozenCorridor(corridor) {
  return corridor === null
    ? null
    : Object.freeze({ ...corridor });
}

function frozenPlan({
  shouldBatch,
  reason,
  ccyPairCode,
  candidateTradeIds,
  remainingTradeIds,
  breachingTradeId,
  acceptedCorridor,
  breachedCorridor
}) {
  return Object.freeze({
    shouldBatch,
    reason,
    ccyPairCode,
    candidateTradeIds: Object.freeze(candidateTradeIds),
    remainingTradeIds: Object.freeze(remainingTradeIds),
    breachingTradeId,
    acceptedCorridor: frozenCorridor(acceptedCorridor),
    breachedCorridor: frozenCorridor(breachedCorridor)
  });
}

function planAutoBatchByTransferRateCorridor({
  trades,
  maxSpreadPercent
}) {
  if (!Array.isArray(trades)) {
    throw new TypeError("Auto Batch corridor planning requires an FX Trade collection.");
  }

  if (trades.length === 0) {
    return frozenPlan({
      shouldBatch: false,
      reason: null,
      ccyPairCode: null,
      candidateTradeIds: [],
      remainingTradeIds: [],
      breachingTradeId: null,
      acceptedCorridor: null,
      breachedCorridor: null
    });
  }

  const normalizedTrades = trades
    .map(normalizedTrade)
    .sort(compareByArrival);
  const tradeIds = new Set();
  const expectedBucketKey = normalizedTrades[0].settlementBucketKey;
  const ccyPairCode = normalizedTrades[0].ccyPairCode;

  normalizedTrades.forEach(trade => {
    if (tradeIds.has(trade.tradeId)) {
      throw planningError(`FX Trade ID ${trade.tradeId} is duplicated.`);
    }

    if (trade.settlementBucketKey !== expectedBucketKey) {
      throw planningError(
        "Auto Batch corridor planning requires one Ccy Pair and settlement bucket."
      );
    }

    tradeIds.add(trade.tradeId);
  });

  const acceptedTransferRates = [];
  let acceptedCorridor = null;

  for (let index = 0; index < normalizedTrades.length; index += 1) {
    const trade = normalizedTrades[index];
    const attemptedCorridor = evaluateTransferRateCorridor({
      currentTransferRates: acceptedTransferRates,
      incomingTransferRate: trade.transferRate,
      maxSpreadPercent
    });

    if (attemptedCorridor.isBreached) {
      return frozenPlan({
        shouldBatch: true,
        reason:
          FX_AUTO_BATCH_CORRIDOR_TRIGGER_REASON.TRANSFER_RATE_CORRIDOR_BREACHED,
        ccyPairCode,
        candidateTradeIds: normalizedTrades
          .slice(0, index)
          .map(candidate => candidate.tradeId),
        remainingTradeIds: normalizedTrades
          .slice(index)
          .map(remaining => remaining.tradeId),
        breachingTradeId: trade.tradeId,
        acceptedCorridor,
        breachedCorridor: attemptedCorridor
      });
    }

    acceptedTransferRates.push(String(trade.transferRate));
    acceptedCorridor = attemptedCorridor;
  }

  return frozenPlan({
    shouldBatch: false,
    reason: null,
    ccyPairCode,
    candidateTradeIds: [],
    remainingTradeIds: normalizedTrades.map(trade => trade.tradeId),
    breachingTradeId: null,
    acceptedCorridor,
    breachedCorridor: null
  });
}

module.exports = {
  FX_AUTO_BATCH_CORRIDOR_TRIGGER_REASON,
  planAutoBatchByTransferRateCorridor
};
