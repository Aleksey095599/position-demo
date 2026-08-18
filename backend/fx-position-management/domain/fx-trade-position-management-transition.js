"use strict";

const {
  FX_POSITION_MANAGEMENT_MODE,
  normalizeFxPositionManagementMode
} = require("./fx-position-management-policy");

const FX_POSITION_MANAGEMENT_TRADE_TYPE = Object.freeze({
  CLIENT_DEAL: "CLIENT_DEAL",
  HEDGE_DEAL: "HEDGE_DEAL"
});
const FX_POSITION_MANAGEMENT_TRADE_TYPES = Object.freeze(
  Object.values(FX_POSITION_MANAGEMENT_TRADE_TYPE)
);
const supportedTradeTypeSet = new Set(FX_POSITION_MANAGEMENT_TRADE_TYPES);

const FX_POSITION_MODE_TRANSITION_REASON = Object.freeze({
  MANUAL_REVIEW_COMPLETED: "MANUAL_REVIEW_COMPLETED"
});

function domainError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function normalizeFxTradePositionManagementIdentity(source, name = "FX Trade") {
  if (source === null || typeof source !== "object" || Array.isArray(source)) {
    throw domainError(
      "INVALID_FX_TRADE_IDENTITY",
      `${name} identity must be an object.`
    );
  }

  const tradeId = Number(source.tradeId);
  const tradeType = typeof source.tradeType === "string"
    ? source.tradeType.trim().toUpperCase()
    : "";

  if (!Number.isSafeInteger(tradeId) || tradeId <= 0) {
    throw domainError(
      "INVALID_FX_TRADE_IDENTITY",
      `${name} Trade ID must be a positive safe integer.`
    );
  }

  if (!supportedTradeTypeSet.has(tradeType)) {
    throw domainError(
      "INVALID_FX_TRADE_IDENTITY",
      `${name} Trade Type must be CLIENT_DEAL or HEDGE_DEAL.`
    );
  }

  return Object.freeze({ tradeId, tradeType });
}

function planFxTradePositionManagementTransitionToAuto(state) {
  if (state === null || typeof state !== "object" || Array.isArray(state)) {
    throw domainError(
      "INVALID_FX_POSITION_MANAGEMENT_STATE",
      "FX Trade Position Management State must be an object."
    );
  }

  const identity = normalizeFxTradePositionManagementIdentity(state);
  const initialPositionManagementMode = normalizeFxPositionManagementMode(
    state.initialPositionManagementMode,
    "Initial FX Position Mode"
  );
  const previousPositionManagementMode = normalizeFxPositionManagementMode(
    state.currentPositionManagementMode,
    "Current FX Position Mode"
  );

  if (initialPositionManagementMode !== FX_POSITION_MANAGEMENT_MODE.MANUAL) {
    throw domainError(
      "FX_POSITION_MODE_TRANSITION_REJECTED",
      `FX Trade ${identity.tradeId} (${identity.tradeType}) was not initially routed to Manual Control.`
    );
  }

  const replayed = previousPositionManagementMode
    === FX_POSITION_MANAGEMENT_MODE.AUTO;

  if (!replayed && (state.batchBlocked === true || state.batchBlocked === 1)) {
    throw domainError(
      "FX_POSITION_MODE_TRANSITION_BLOCKED",
      `FX Trade ${identity.tradeId} (${identity.tradeType}) is already involved in FX Batching or Hedging.`
    );
  }

  return Object.freeze({
    identity,
    initialPositionManagementMode,
    previousPositionManagementMode,
    currentPositionManagementMode: FX_POSITION_MANAGEMENT_MODE.AUTO,
    transitionReason:
      FX_POSITION_MODE_TRANSITION_REASON.MANUAL_REVIEW_COMPLETED,
    replayed,
    requiresSave: !replayed,
    previousTransitionedAt: state.transitionedAt ?? null
  });
}

module.exports = {
  FX_POSITION_MANAGEMENT_TRADE_TYPE,
  FX_POSITION_MANAGEMENT_TRADE_TYPES,
  FX_POSITION_MODE_TRANSITION_REASON,
  normalizeFxTradePositionManagementIdentity,
  planFxTradePositionManagementTransitionToAuto
};
