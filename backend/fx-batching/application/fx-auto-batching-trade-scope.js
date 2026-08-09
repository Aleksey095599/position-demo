"use strict";

const {
  isCarryInPosition
} = require("../domain/fx-auto-batch-selection");

const AUTO_BATCHING_INCOMING_TRADE_TYPES = new Set([
  "CLIENT_DEAL",
  "HEDGE_DEAL"
]);

function normalizedText(value) {
  return String(value || "").trim().toUpperCase();
}

function nonNegativeTradeId(value, name) {
  const tradeId = Number(value);

  if (!Number.isSafeInteger(tradeId) || tradeId < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer Trade ID.`);
  }

  return tradeId;
}

function excludedTradeIdSet(value) {
  if (!Array.isArray(value)) {
    throw new TypeError("Excluded FX Trades must be a Trade ID collection.");
  }

  return new Set(value.map((tradeId, index) => {
    const normalized = nonNegativeTradeId(
      tradeId,
      `Excluded FX Trade ID ${index + 1}`
    );

    if (normalized === 0) {
      throw new RangeError("Excluded FX Trade IDs must be positive integers.");
    }

    return normalized;
  }));
}

function selectFxTradesForAutoBatchingRun({
  trades,
  afterTradeId = 0,
  excludedTradeIds = [],
  eligibleCcyPairCodes = null
}) {
  if (!Array.isArray(trades)) {
    throw new TypeError("FX Auto Batching run requires an FX Trade collection.");
  }

  const startBoundaryTradeId = nonNegativeTradeId(
    afterTradeId,
    "FX Auto Batching start boundary"
  );
  const excluded = excludedTradeIdSet(excludedTradeIds);

  if (
    eligibleCcyPairCodes !== null
    && (!Array.isArray(eligibleCcyPairCodes) || eligibleCcyPairCodes.length === 0)
  ) {
    throw new RangeError(
      "Eligible Auto Batching Currency Pairs must be a non-empty collection."
    );
  }

  const eligiblePairs = eligibleCcyPairCodes === null
    ? null
    : new Set(eligibleCcyPairCodes.map(normalizedText));

  return Object.freeze(trades.filter(trade => {
    const tradeId = Number(trade?.tradeId);
    const tradeType = normalizedText(trade?.tradeType);
    const ccyPairCode = normalizedText(trade?.ccyPairCode);

    return !excluded.has(tradeId)
      && tradeId > startBoundaryTradeId
      && (
        AUTO_BATCHING_INCOMING_TRADE_TYPES.has(tradeType)
        || isCarryInPosition(trade)
      )
      && (eligiblePairs === null || eligiblePairs.has(ccyPairCode));
  }));
}

module.exports = {
  AUTO_BATCHING_INCOMING_TRADE_TYPES,
  selectFxTradesForAutoBatchingRun
};
