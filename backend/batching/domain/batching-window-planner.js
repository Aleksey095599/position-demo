"use strict";

const {
  compareByAge,
  isCarryInPosition
} = require("./auto-batch-selection");
const {
  planAutoBatchByTransferRateCorridor
} = require("./auto-batch-corridor-planner");
const {
  BATCH_FORMATION_REASON_CODE
} = require("./batch-formation-reason");

const BATCHING_WINDOW_STATUS = Object.freeze({
  OPEN: "OPEN",
  CLOSED: "CLOSED"
});

function planningError(message) {
  const error = new RangeError(message);
  error.code = "INVALID_BATCHING_WINDOW_PLAN";
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

function planBatchingWindows({
  trades,
  maxSpreadPercent,
  maxIntervalSeconds,
  now = new Date()
}) {
  if (!Array.isArray(trades)) {
    throw new TypeError("Batching Window planning requires a Trade collection.");
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
  const evaluationTime = normalizedTime(now, "Batching Window evaluation time");
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
      `Trade ${notYetArrivedTrade.tradeId} cannot enter a Batching Window before its Received Timestamp.`
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
          status: BATCHING_WINDOW_STATUS.CLOSED,
          openedAt: new Date(openedAtMilliseconds).toISOString(),
          deadlineAt: new Date(deadlineAtMilliseconds).toISOString(),
          closedAt: new Date(deadlineAtMilliseconds).toISOString(),
          closeTrigger: BATCH_FORMATION_REASON_CODE.MAX_INTERVAL_REACHED,
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
          status: BATCHING_WINDOW_STATUS.CLOSED,
          openedAt: new Date(openedAtMilliseconds).toISOString(),
          deadlineAt: new Date(deadlineAtMilliseconds).toISOString(),
          closedAt: new Date(incomingAtMilliseconds).toISOString(),
          closeTrigger:
            BATCH_FORMATION_REASON_CODE.TRANSFER_RATE_CORRIDOR_BREACHED,
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
        ? BATCHING_WINDOW_STATUS.CLOSED
        : BATCHING_WINDOW_STATUS.OPEN,
      openedAt: new Date(openedAtMilliseconds).toISOString(),
      deadlineAt: new Date(deadlineAtMilliseconds).toISOString(),
      closedAt: reachedDeadline
        ? new Date(deadlineAtMilliseconds).toISOString()
        : null,
      closeTrigger: reachedDeadline
        ? BATCH_FORMATION_REASON_CODE.MAX_INTERVAL_REACHED
        : null,
      corridorPlan
    }));
    firstTradeIndex = orderedTrades.length;
  }

  return Object.freeze(windows);
}

module.exports = {
  BATCHING_WINDOW_STATUS,
  planBatchingWindows
};
