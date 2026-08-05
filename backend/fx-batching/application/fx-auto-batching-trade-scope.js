"use strict";

const {
  isCarryInPosition
} = require("../domain/fx-auto-batch-selection");

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
  excludedTradeIds = []
}) {
  if (!Array.isArray(trades)) {
    throw new TypeError("FX Auto Batching run requires an FX Trade collection.");
  }

  const startBoundaryTradeId = nonNegativeTradeId(
    afterTradeId,
    "FX Auto Batching start boundary"
  );
  const excluded = excludedTradeIdSet(excludedTradeIds);

  // Граница запуска отсекает старые входящие сделки, но не пассивный Carry-in.
  return Object.freeze(trades.filter(trade => {
    const tradeId = Number(trade?.tradeId);

    return !excluded.has(tradeId)
      && (isCarryInPosition(trade) || tradeId > startBoundaryTradeId);
  }));
}

module.exports = {
  selectFxTradesForAutoBatchingRun
};
