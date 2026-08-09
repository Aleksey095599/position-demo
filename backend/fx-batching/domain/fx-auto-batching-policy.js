"use strict";

const {
  DEFAULT_MAX_TRADES_PER_BATCH,
  compareByAge,
  eligibleFxTrades,
  batchingKey,
  isCarryInPosition
} = require("./fx-auto-batch-selection");
const {
  FX_BATCHING_WINDOW_STATUS,
  planFxBatchingWindows
} = require("./fx-batching-window-planner");
const {
  FX_BATCH_FORMATION_REASON_CODE
} = require("./fx-batch-formation-reason");
const {
  FX_AUTO_BATCHING_TENOR_COMPATIBILITY_MODE
} = require("./fx-auto-batching-settings");

const DEFAULT_MIN_TRADES_PER_AUTO_BATCH = 2;

function policyError(message) {
  const error = new RangeError(message);
  error.code = "INVALID_FX_AUTO_BATCHING_POLICY";
  return error;
}

function normalizedNow(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);

  if (!Number.isFinite(date.getTime())) {
    throw policyError("FX Auto Batching requires a valid evaluation time.");
  }

  return date;
}

function normalizedPositiveInteger(value, name) {
  const number = Number(value);

  if (!Number.isInteger(number) || number <= 0) {
    throw policyError(`${name} must be a positive integer.`);
  }

  return number;
}

function tradesByBatchingKey(trades) {
  const groups = new Map();

  trades.forEach(trade => {
    const key = batchingKey(trade);

    if (!groups.has(key)) {
      groups.set(key, []);
    }

    groups.get(key).push(trade);
  });

  return [...groups.values()]
    .map(group => [...group].sort(compareByAge))
    .sort((left, right) => compareByAge(left[0], right[0]));
}

function carryInPositionsAvailableForWindow(carryInPositions, window) {
  if (
    window.closeTrigger ===
      FX_BATCH_FORMATION_REASON_CODE.TRANSFER_RATE_CORRIDOR_BREACHED
    && window.breachingTrade
  ) {
    return carryInPositions.filter(position =>
      compareByAge(position, window.breachingTrade) < 0
    );
  }

  const boundaryMilliseconds = Date.parse(window.closedAt);

  return carryInPositions.filter(position =>
    Date.parse(position.receivedTimestamp) <= boundaryMilliseconds
  );
}

function selectedBatchSources({
  window,
  carryInPositions,
  maxTradesPerBatch
}) {
  // Резервируем место входящей сделке: один Carry-in не формирует FX Batch.
  const selectedCarryInPositions = carryInPositions.slice(
    0,
    Math.max(0, maxTradesPerBatch - 1)
  );
  const selectedWindowTrades = window.trades.slice(
    0,
    maxTradesPerBatch - selectedCarryInPositions.length
  );

  return Object.freeze({
    trades: Object.freeze([
      ...selectedCarryInPositions,
      ...selectedWindowTrades
    ].sort(compareByAge)),
    windowTrades: Object.freeze(selectedWindowTrades),
    carryInPositions: Object.freeze(selectedCarryInPositions),
    deferredCarryInPositionCount:
      carryInPositions.length - selectedCarryInPositions.length,
    deferredWindowTradeCount:
      window.trades.length - selectedWindowTrades.length
  });
}

function corridorReasonDetails(
  window,
  maxSpreadPercent,
  selectedSources
) {
  return Object.freeze({
    maxSpreadPercent: String(maxSpreadPercent),
    acceptedTradeCount: window.trades.length,
    carryInPositionCount: selectedSources.carryInPositions.length,
    deferredCarryInPositionCount:
      selectedSources.deferredCarryInPositionCount,
    deferredWindowTradeCount: selectedSources.deferredWindowTradeCount,
    selectedTradeCount: selectedSources.trades.length,
    acceptedMinTransferRate:
      window.corridorPlan.acceptedCorridor?.minTransferRate ?? null,
    acceptedMaxTransferRate:
      window.corridorPlan.acceptedCorridor?.maxTransferRate ?? null,
    acceptedSpreadPercent:
      window.corridorPlan.acceptedCorridor?.spreadPercent ?? null,
    breachingTradeId: window.corridorPlan.breachingTradeId,
    incomingTransferRate: window.breachingTrade === null
      ? null
      : String(window.breachingTrade.transferRate),
    breachedMinTransferRate:
      window.corridorPlan.breachedCorridor?.minTransferRate ?? null,
    breachedMaxTransferRate:
      window.corridorPlan.breachedCorridor?.maxTransferRate ?? null,
    breachedSpreadPercent:
      window.corridorPlan.breachedCorridor?.spreadPercent ?? null
  });
}

function arrivedTradesAt(trades, evaluationTime) {
  const arrived = [];
  let nextArrivalAtMilliseconds = null;

  trades.forEach(trade => {
    const receivedAtMilliseconds = Date.parse(trade.receivedTimestamp);

    if (!Number.isFinite(receivedAtMilliseconds)) {
      throw policyError(
        `FX Trade ${trade.tradeId} Received Timestamp must be a valid timestamp.`
      );
    }

    if (receivedAtMilliseconds <= evaluationTime.getTime()) {
      arrived.push(trade);
      return;
    }

    if (!isCarryInPosition(trade)) {
      nextArrivalAtMilliseconds = nextArrivalAtMilliseconds === null
        ? receivedAtMilliseconds
        : Math.min(nextArrivalAtMilliseconds, receivedAtMilliseconds);
    }
  });

  return Object.freeze({
    trades: Object.freeze(arrived),
    nextArrivalAtMilliseconds
  });
}

function intervalReasonDetails({
  window,
  maxIntervalSeconds,
  selectedSources
}) {
  const windowDurationMilliseconds = Date.parse(window.closedAt)
    - Date.parse(window.openedAt);

  return Object.freeze({
    maxIntervalSeconds,
    oldestTradeId: Number(window.trades[0].tradeId),
    windowDurationMilliseconds,
    candidateTradeCount: window.trades.length,
    carryInPositionCount: selectedSources.carryInPositions.length,
    deferredCarryInPositionCount:
      selectedSources.deferredCarryInPositionCount,
    deferredWindowTradeCount: selectedSources.deferredWindowTradeCount,
    selectedTradeCount: selectedSources.trades.length,
    corridorMinTransferRate:
      window.corridorPlan.acceptedCorridor?.minTransferRate ?? null,
    corridorMaxTransferRate:
      window.corridorPlan.acceptedCorridor?.maxTransferRate ?? null,
    corridorSpreadPercent:
      window.corridorPlan.acceptedCorridor?.spreadPercent ?? null
  });
}

function planFxAutoBatching({
  trades,
  maxSpreadPercent,
  maxIntervalSeconds,
  tenorCompatibilityMode =
    FX_AUTO_BATCHING_TENOR_COMPATIBILITY_MODE.SAME_TENOR_ONLY,
  now = new Date(),
  minTradesPerBatch = DEFAULT_MIN_TRADES_PER_AUTO_BATCH,
  maxTradesPerBatch = DEFAULT_MAX_TRADES_PER_BATCH
}) {
  const evaluationTime = normalizedNow(now);
  const intervalSeconds = normalizedPositiveInteger(
    maxIntervalSeconds,
    "Maximum Batching Interval"
  );
  const minimumTrades = normalizedPositiveInteger(
    minTradesPerBatch,
    "Minimum trades per Auto Batch"
  );
  const maximumTrades = normalizedPositiveInteger(
    maxTradesPerBatch,
    "Maximum trades per Auto Batch"
  );

  if (
    tenorCompatibilityMode
      !== FX_AUTO_BATCHING_TENOR_COMPATIBILITY_MODE.SAME_TENOR_ONLY
  ) {
    throw policyError(
      "FX Auto Batching currently supports SAME_TENOR_ONLY Tenor Compatibility."
    );
  }

  if (minimumTrades > maximumTrades) {
    throw policyError(
      "Minimum trades per Auto Batch must not exceed its maximum."
    );
  }

  const eligibleTrades = eligibleFxTrades(trades, maximumTrades);
  const arrivalPlan = arrivedTradesAt(eligibleTrades, evaluationTime);
  const pairGroups = new Map();

  tradesByBatchingKey(arrivalPlan.trades).forEach(group => {
    const pairCode = String(group[0]?.ccyPairCode || "").trim().toUpperCase();

    if (!pairGroups.has(pairCode)) {
      pairGroups.set(pairCode, []);
    }

    pairGroups.get(pairCode).push(group);
  });

  const candidates = [];
  const closedWithoutBatchTradeIds = new Set();
  let openWindowCount = 0;
  let nextEvaluationAtMilliseconds = arrivalPlan.nextArrivalAtMilliseconds;

  for (const [ccyPairCode, groups] of pairGroups) {
    let selectedForPair = false;

    for (const group of groups) {
      const carryInPositions = group.filter(isCarryInPosition);
      const windowTrades = group.filter(trade => !isCarryInPosition(trade));

      if (windowTrades.length === 0) {
        continue;
      }

      const windows = planFxBatchingWindows({
        trades: windowTrades,
        maxSpreadPercent,
        maxIntervalSeconds: intervalSeconds,
        now: evaluationTime
      });

      for (const window of windows) {
        if (window.status === FX_BATCHING_WINDOW_STATUS.OPEN) {
          openWindowCount += 1;
          const deadline = Date.parse(window.deadlineAt);
          nextEvaluationAtMilliseconds = nextEvaluationAtMilliseconds === null
            ? deadline
            : Math.min(nextEvaluationAtMilliseconds, deadline);
          continue;
        }

        const selectedSources = selectedBatchSources({
          window,
          carryInPositions: carryInPositionsAvailableForWindow(
            carryInPositions,
            window
          ),
          maxTradesPerBatch: maximumTrades
        });
        const tradeIds = selectedSources.trades
          .map(trade => Number(trade.tradeId));
        const canFormBatch = selectedSources.windowTrades.length > 0
          && selectedSources.trades.length >= minimumTrades;

        if (!canFormBatch) {
          selectedSources.windowTrades.forEach(trade =>
            closedWithoutBatchTradeIds.add(Number(trade.tradeId))
          );
          continue;
        }

        if (
          window.closeTrigger ===
            FX_BATCH_FORMATION_REASON_CODE.TRANSFER_RATE_CORRIDOR_BREACHED
        ) {
          candidates.push(Object.freeze({
            ccyPairCode,
            tradeIds: Object.freeze(tradeIds),
            windowOpenedAt: window.openedAt,
            windowClosedAt: window.closedAt,
            formationReasonCode:
              FX_BATCH_FORMATION_REASON_CODE.TRANSFER_RATE_CORRIDOR_BREACHED,
            formationReasonDetails: corridorReasonDetails(
              window,
              maxSpreadPercent,
              selectedSources
            )
          }));
          selectedForPair = true;
          break;
        }

        if (
          window.closeTrigger ===
            FX_BATCH_FORMATION_REASON_CODE.MAX_INTERVAL_REACHED
        ) {
          candidates.push(Object.freeze({
            ccyPairCode,
            tradeIds: Object.freeze(tradeIds),
            windowOpenedAt: window.openedAt,
            windowClosedAt: window.closedAt,
            formationReasonCode:
              FX_BATCH_FORMATION_REASON_CODE.MAX_INTERVAL_REACHED,
            formationReasonDetails: intervalReasonDetails({
              window,
              maxIntervalSeconds: intervalSeconds,
              selectedSources
            })
          }));
          selectedForPair = true;
          break;
        }
      }

      if (selectedForPair) {
        break;
      }
    }
  }

  return Object.freeze({
    candidates: Object.freeze(candidates),
    closedWithoutBatchTradeIds: Object.freeze([...closedWithoutBatchTradeIds]),
    openWindowCount,
    nextEvaluationDelayMs:
      candidates.length > 0 || closedWithoutBatchTradeIds.size > 0
      ? 0
      : nextEvaluationAtMilliseconds === null
        ? null
        : Math.max(0, Math.ceil(
          nextEvaluationAtMilliseconds - evaluationTime.getTime()
        ))
  });
}

module.exports = {
  DEFAULT_MIN_TRADES_PER_AUTO_BATCH,
  planFxAutoBatching
};
