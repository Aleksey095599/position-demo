"use strict";

const {
  DEFAULT_MAX_TRADES_PER_BATCH,
  compareByAge,
  eligibleFxTrades,
  settlementBucketKey
} = require("./fx-auto-batch-selection");
const {
  planAutoBatchByTransferRateCorridor
} = require("./fx-auto-batch-corridor-planner");
const {
  FX_BATCH_FORMATION_REASON_CODE
} = require("./fx-batch-formation-reason");

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

function tradeGroups(trades) {
  const groups = new Map();

  trades.forEach(trade => {
    const key = settlementBucketKey(trade);

    if (!groups.has(key)) {
      groups.set(key, []);
    }

    groups.get(key).push(trade);
  });

  return [...groups.values()]
    .map(group => [...group].sort(compareByAge))
    .sort((left, right) => compareByAge(left[0], right[0]));
}

function tradesByIds(trades, tradeIds) {
  const byId = new Map(trades.map(trade => [Number(trade.tradeId), trade]));
  return tradeIds.map(tradeId => byId.get(Number(tradeId)));
}

function corridorSegments(trades, maxSpreadPercent) {
  const segments = [];
  let remainingTrades = [...trades];

  while (remainingTrades.length > 0) {
    const plan = planAutoBatchByTransferRateCorridor({
      trades: remainingTrades,
      maxSpreadPercent
    });

    if (!plan.shouldBatch) {
      segments.push(Object.freeze({
        trades: Object.freeze([...remainingTrades]),
        closedByCorridor: false,
        breachingTrade: null,
        plan
      }));
      break;
    }

    const acceptedTrades = tradesByIds(
      remainingTrades,
      plan.candidateTradeIds
    );
    const nextTrades = tradesByIds(remainingTrades, plan.remainingTradeIds);
    segments.push(Object.freeze({
      trades: Object.freeze(acceptedTrades),
      closedByCorridor: true,
      breachingTrade: nextTrades[0] || null,
      plan
    }));
    remainingTrades = nextTrades;
  }

  return segments;
}

function containsAutomaticSource(trades) {
  return trades.some(trade => String(trade.tradeType || "").trim().toUpperCase()
    !== "BATCH_POSITION_OUT");
}

function selectedTradeIds(segment, maxTradesPerBatch) {
  return segment.trades
    .slice(0, maxTradesPerBatch)
    .map(trade => Number(trade.tradeId));
}

function corridorReasonDetails(segment, maxSpreadPercent, selectedCount) {
  return Object.freeze({
    maxSpreadPercent: String(maxSpreadPercent),
    acceptedTradeCount: segment.trades.length,
    selectedTradeCount: selectedCount,
    acceptedMinTransferRate: segment.plan.acceptedCorridor?.minTransferRate ?? null,
    acceptedMaxTransferRate: segment.plan.acceptedCorridor?.maxTransferRate ?? null,
    acceptedSpreadPercent: segment.plan.acceptedCorridor?.spreadPercent ?? null,
    breachingTradeId: segment.plan.breachingTradeId,
    incomingTransferRate: segment.breachingTrade === null
      ? null
      : String(segment.breachingTrade.transferRate),
    breachedMinTransferRate: segment.plan.breachedCorridor?.minTransferRate ?? null,
    breachedMaxTransferRate: segment.plan.breachedCorridor?.maxTransferRate ?? null,
    breachedSpreadPercent: segment.plan.breachedCorridor?.spreadPercent ?? null
  });
}

function intervalReasonDetails({
  segment,
  maxIntervalSeconds,
  ageMilliseconds,
  selectedCount
}) {
  return Object.freeze({
    maxIntervalSeconds,
    oldestTradeId: Number(segment.trades[0].tradeId),
    oldestTradeAgeMilliseconds: ageMilliseconds,
    candidateTradeCount: segment.trades.length,
    selectedTradeCount: selectedCount,
    corridorMinTransferRate: segment.plan.acceptedCorridor?.minTransferRate ?? null,
    corridorMaxTransferRate: segment.plan.acceptedCorridor?.maxTransferRate ?? null,
    corridorSpreadPercent: segment.plan.acceptedCorridor?.spreadPercent ?? null
  });
}

function planFxAutoBatching({
  trades,
  maxSpreadPercent,
  maxIntervalSeconds,
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
  const eligibleTrades = eligibleFxTrades(trades, maximumTrades);
  const pairGroups = new Map();

  tradeGroups(eligibleTrades).forEach(group => {
    const pairCode = String(group[0]?.ccyPairCode || "").trim().toUpperCase();

    if (!pairGroups.has(pairCode)) {
      pairGroups.set(pairCode, []);
    }

    pairGroups.get(pairCode).push(group);
  });

  const candidates = [];
  let nextEvaluationAtMilliseconds = null;

  for (const [ccyPairCode, groups] of pairGroups) {
    let selectedForPair = false;

    for (const group of groups) {
      for (const segment of corridorSegments(group, maxSpreadPercent)) {
        if (
          segment.trades.length < minimumTrades
          || !containsAutomaticSource(segment.trades)
        ) {
          continue;
        }

        const tradeIds = selectedTradeIds(segment, maximumTrades);

        if (segment.closedByCorridor) {
          candidates.push(Object.freeze({
            ccyPairCode,
            tradeIds: Object.freeze(tradeIds),
            formationReasonCode:
              FX_BATCH_FORMATION_REASON_CODE.TRANSFER_RATE_CORRIDOR_BREACHED,
            formationReasonDetails: corridorReasonDetails(
              segment,
              maxSpreadPercent,
              tradeIds.length
            )
          }));
          selectedForPair = true;
          break;
        }

        const oldestTimestamp = Date.parse(segment.trades[0].entryTimestamp || "");

        if (!Number.isFinite(oldestTimestamp)) {
          throw policyError(
            `FX Trade ${segment.trades[0].tradeId} must have a valid Entry Timestamp.`
          );
        }

        const deadline = oldestTimestamp + intervalSeconds * 1000;
        const ageMilliseconds = Math.max(0, evaluationTime.getTime() - oldestTimestamp);

        if (deadline <= evaluationTime.getTime()) {
          candidates.push(Object.freeze({
            ccyPairCode,
            tradeIds: Object.freeze(tradeIds),
            formationReasonCode:
              FX_BATCH_FORMATION_REASON_CODE.MAX_INTERVAL_REACHED,
            formationReasonDetails: intervalReasonDetails({
              segment,
              maxIntervalSeconds: intervalSeconds,
              ageMilliseconds,
              selectedCount: tradeIds.length
            })
          }));
          selectedForPair = true;
          break;
        }

        nextEvaluationAtMilliseconds = nextEvaluationAtMilliseconds === null
          ? deadline
          : Math.min(nextEvaluationAtMilliseconds, deadline);
      }

      if (selectedForPair) {
        break;
      }
    }
  }

  return Object.freeze({
    candidates: Object.freeze(candidates),
    nextEvaluationDelayMs: candidates.length > 0
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
