"use strict";

const DEFAULT_MAX_TRADES_PER_BATCH = 200;

function normalizedText(value) {
  return String(value || "").trim().toUpperCase();
}

function settlementBucketKey(trade) {
  return JSON.stringify([
    normalizedText(trade.ccyPairCode),
    String(trade.tradeDate || "").trim(),
    normalizedText(trade.tenor),
    String(trade.baseCcyValueDate || "").trim(),
    String(trade.quoteCcyValueDate || "").trim(),
    Number(trade.baseCcyFractionDigits),
    Number(trade.quoteCcyFractionDigits)
  ]);
}

function isEligibleFxTrade(trade) {
  const tradeId = Number(trade?.tradeId);
  const transferRate = Number(trade?.transferRate);

  return Number.isSafeInteger(tradeId)
    && tradeId > 0
    && ["BUY", "SELL"].includes(normalizedText(trade?.side))
    && Number.isFinite(transferRate)
    && transferRate > 0;
}

function compareByAge(left, right) {
  const leftTimestamp = Date.parse(left.entryTimestamp || "");
  const rightTimestamp = Date.parse(right.entryTimestamp || "");
  const normalizedLeftTimestamp = Number.isFinite(leftTimestamp)
    ? leftTimestamp
    : Number.MAX_SAFE_INTEGER;
  const normalizedRightTimestamp = Number.isFinite(rightTimestamp)
    ? rightTimestamp
    : Number.MAX_SAFE_INTEGER;

  return normalizedLeftTimestamp - normalizedRightTimestamp
    || Number(left.tradeId) - Number(right.tradeId);
}

function selectNextAutoBatchTradeIds(
  trades,
  maxTrades = DEFAULT_MAX_TRADES_PER_BATCH
) {
  if (!Array.isArray(trades)) {
    throw new TypeError("Auto Batching requires an FX Trade collection.");
  }

  if (!Number.isInteger(maxTrades) || maxTrades <= 0) {
    throw new RangeError("Maximum trades per FX Batch must be a positive integer.");
  }

  const eligibleTrades = trades
    .filter(isEligibleFxTrade)
    .sort(compareByAge);
  const triggerTrade = eligibleTrades.find(
    trade => normalizedText(trade.tradeType) !== "BATCH_POSITION_OUT"
  );

  if (!triggerTrade) {
    return [];
  }

  const nextBucketKey = settlementBucketKey(triggerTrade);

  return eligibleTrades
    .filter(trade => settlementBucketKey(trade) === nextBucketKey)
    .slice(0, maxTrades)
    .map(trade => Number(trade.tradeId));
}

module.exports = {
  DEFAULT_MAX_TRADES_PER_BATCH,
  selectNextAutoBatchTradeIds,
  settlementBucketKey
};
