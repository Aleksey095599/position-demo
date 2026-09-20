"use strict";

const {
  POSITION_MANAGEMENT_MODE,
  normalizePositionManagementMode
} = require("./position-management-policy");

const POSITION_MANAGEMENT_TRADE_TYPE = Object.freeze({
  CLIENT_DEAL: "CLIENT_DEAL",
  HEDGE_DEAL: "HEDGE_DEAL"
});
const POSITION_MANAGEMENT_TRADE_TYPES = Object.freeze(
  Object.values(POSITION_MANAGEMENT_TRADE_TYPE)
);
const supportedTradeTypeSet = new Set(POSITION_MANAGEMENT_TRADE_TYPES);

const POSITION_MODE_TRANSITION_REASON = Object.freeze({
  MANUAL_REVIEW_COMPLETED: "MANUAL_REVIEW_COMPLETED"
});

function domainError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function normalizeTradePositionManagementIdentity(source, name = "Trade") {
  if (source === null || typeof source !== "object" || Array.isArray(source)) {
    throw domainError(
      "INVALID_TRADE_IDENTITY",
      `${name} identity must be an object.`
    );
  }

  const tradeId = Number(source.tradeId);
  const tradeType = typeof source.tradeType === "string"
    ? source.tradeType.trim().toUpperCase()
    : "";

  if (!Number.isSafeInteger(tradeId) || tradeId <= 0) {
    throw domainError(
      "INVALID_TRADE_IDENTITY",
      `${name} Trade ID must be a positive safe integer.`
    );
  }

  if (!supportedTradeTypeSet.has(tradeType)) {
    throw domainError(
      "INVALID_TRADE_IDENTITY",
      `${name} Trade Type must be CLIENT_DEAL or HEDGE_DEAL.`
    );
  }

  return Object.freeze({ tradeId, tradeType });
}

function planTradePositionManagementTransitionToAuto(state) {
  if (state === null || typeof state !== "object" || Array.isArray(state)) {
    throw domainError(
      "INVALID_POSITION_MANAGEMENT_STATE",
      "Trade Position Management State must be an object."
    );
  }

  const identity = normalizeTradePositionManagementIdentity(state);
  const initialPositionManagementMode = normalizePositionManagementMode(
    state.initialPositionManagementMode,
    "Initial Position Management Mode"
  );
  const previousPositionManagementMode = normalizePositionManagementMode(
    state.currentPositionManagementMode,
    "Current Position Management Mode"
  );

  if (initialPositionManagementMode !== POSITION_MANAGEMENT_MODE.MANUAL) {
    throw domainError(
      "POSITION_MODE_TRANSITION_REJECTED",
      `Trade ${identity.tradeId} (${identity.tradeType}) was not initially routed to Manual Management.`
    );
  }

  const replayed = previousPositionManagementMode
    === POSITION_MANAGEMENT_MODE.AUTO;

  if (!replayed && (state.batchBlocked === true || state.batchBlocked === 1)) {
    throw domainError(
      "POSITION_MODE_TRANSITION_BLOCKED",
      `Trade ${identity.tradeId} (${identity.tradeType}) is already involved in Batching or Hedging.`
    );
  }

  return Object.freeze({
    identity,
    initialPositionManagementMode,
    previousPositionManagementMode,
    currentPositionManagementMode: POSITION_MANAGEMENT_MODE.AUTO,
    transitionReason:
      POSITION_MODE_TRANSITION_REASON.MANUAL_REVIEW_COMPLETED,
    replayed,
    requiresSave: !replayed,
    previousTransitionedAt: state.transitionedAt ?? null
  });
}

module.exports = {
  POSITION_MANAGEMENT_TRADE_TYPE,
  POSITION_MANAGEMENT_TRADE_TYPES,
  POSITION_MODE_TRANSITION_REASON,
  normalizeTradePositionManagementIdentity,
  planTradePositionManagementTransitionToAuto
};
