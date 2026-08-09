"use strict";

const {
  compareByAge,
  isCarryInPosition
} = require("./fx-auto-batch-selection");
const {
  planAutoBatchByTransferRateCorridor
} = require("./fx-auto-batch-corridor-planner");
const {
  FX_BATCH_FORMATION_REASON_CODE
} = require("./fx-batch-formation-reason");

const FX_BATCHING_WINDOW_STATUS = Object.freeze({
  OPEN: "OPEN",
  CLOSED: "CLOSED"
});

function planningError(message) {
  const error = new RangeError(message);
  error.code = "INVALID_FX_BATCHING_WINDOW_PLAN";
  return error;
}

function normalizedPositiveInteger(value, name) {
  const number = Number(value);

  if (!Number.isInteger(number) || number <= 0) {
    throw planningError(`${name} must be a positive integer.`);
  }

  return number;
}

function normalizedTime(value, name) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);

  if (!Number.isFinite(date.getTime())) {
    throw planningError(`${name} must be a valid timestamp.`);
  }

  return date;
}

function frozenWindow({
  trades,
  status,
  openedAt,
  deadlineAt,
  closedAt = null,
  closeTrigger = null,
  corridorPlan,
  breachingTrade = null
}) {
  return Object.freeze({
    trades: Object.freeze([...trades]),
    status,
    openedAt,
    deadlineAt,
    closedAt,
    closeTrigger,
    corridorPlan,
    breachingTrade
  });
}

function planFxBatchingWindows({
  trades,
  maxSpreadPercent,
  maxIntervalSeconds,
  now = new Date()
}) {
  if (!Array.isArray(trades)) {
    throw new TypeError("FX Batching Window planning requires an FX Trade collection.");
  }

  if (trades.length === 0) {
    return Object.freeze([]);
  }

  const carryInPosition = trades.find(isCarryInPosition);

  if (carryInPosition) {
    throw planningError(
      `Carry-in Position ${carryInPosition.tradeId} cannot open or enter a Batching Window.`
    );
  }

  const intervalSeconds = normalizedPositiveInteger(
    maxIntervalSeconds,
    "Maximum Batching Interval"
  );
  const evaluationTime = normalizedTime(now, "FX Batching Window evaluation time");
  const orderedTrades = [...trades].sort(compareByAge);

  // The corridor planner validates Trade IDs, timestamps and one Batching Key.
  planAutoBatchByTransferRateCorridor({
    trades: orderedTrades,
    maxSpreadPercent
  });

  const notYetArrivedTrade = orderedTrades.find(
    trade => Date.parse(trade.receivedTimestamp) > evaluationTime.getTime()
  );

  if (notYetArrivedTrade) {
    throw planningError(
      `FX Trade ${notYetArrivedTrade.tradeId} cannot enter a Batching Window before its Received Timestamp.`
    );
  }

  const windows = [];
  let firstTradeIndex = 0;

  while (firstTradeIndex < orderedTrades.length) {
    const firstTrade = orderedTrades[firstTradeIndex];
    const openedAtMilliseconds = Date.parse(firstTrade.receivedTimestamp);
    const deadlineAtMilliseconds = openedAtMilliseconds + intervalSeconds * 1000;
    const acceptedTrades = [firstTrade];
    let corridorPlan = planAutoBatchByTransferRateCorridor({
      trades: acceptedTrades,
      maxSpreadPercent
    });
    let nextTradeIndex = firstTradeIndex + 1;
    let windowClosed = false;

    while (nextTradeIndex < orderedTrades.length) {
      const incomingTrade = orderedTrades[nextTradeIndex];
      const incomingAtMilliseconds = Date.parse(incomingTrade.receivedTimestamp);

      if (incomingAtMilliseconds >= deadlineAtMilliseconds) {
        windows.push(frozenWindow({
          trades: acceptedTrades,
          status: FX_BATCHING_WINDOW_STATUS.CLOSED,
          openedAt: new Date(openedAtMilliseconds).toISOString(),
          deadlineAt: new Date(deadlineAtMilliseconds).toISOString(),
          closedAt: new Date(deadlineAtMilliseconds).toISOString(),
          closeTrigger: FX_BATCH_FORMATION_REASON_CODE.MAX_INTERVAL_REACHED,
          corridorPlan
        }));
        windowClosed = true;
        break;
      }

      const attemptedCorridor = planAutoBatchByTransferRateCorridor({
        trades: [...acceptedTrades, incomingTrade],
        maxSpreadPercent
      });

      if (attemptedCorridor.shouldBatch) {
        windows.push(frozenWindow({
          trades: acceptedTrades,
          status: FX_BATCHING_WINDOW_STATUS.CLOSED,
          openedAt: new Date(openedAtMilliseconds).toISOString(),
          deadlineAt: new Date(deadlineAtMilliseconds).toISOString(),
          closedAt: new Date(incomingAtMilliseconds).toISOString(),
          closeTrigger:
            FX_BATCH_FORMATION_REASON_CODE.TRANSFER_RATE_CORRIDOR_BREACHED,
          corridorPlan: attemptedCorridor,
          breachingTrade: incomingTrade
        }));
        windowClosed = true;
        break;
      }

      acceptedTrades.push(incomingTrade);
      corridorPlan = attemptedCorridor;
      nextTradeIndex += 1;
    }

    if (windowClosed) {
      firstTradeIndex = nextTradeIndex;
      continue;
    }

    const reachedDeadline = evaluationTime.getTime() >= deadlineAtMilliseconds;
    windows.push(frozenWindow({
      trades: acceptedTrades,
      status: reachedDeadline
        ? FX_BATCHING_WINDOW_STATUS.CLOSED
        : FX_BATCHING_WINDOW_STATUS.OPEN,
      openedAt: new Date(openedAtMilliseconds).toISOString(),
      deadlineAt: new Date(deadlineAtMilliseconds).toISOString(),
      closedAt: reachedDeadline
        ? new Date(deadlineAtMilliseconds).toISOString()
        : null,
      closeTrigger: reachedDeadline
        ? FX_BATCH_FORMATION_REASON_CODE.MAX_INTERVAL_REACHED
        : null,
      corridorPlan
    }));
    firstTradeIndex = orderedTrades.length;
  }

  return Object.freeze(windows);
}

module.exports = {
  FX_BATCHING_WINDOW_STATUS,
  planFxBatchingWindows
};
