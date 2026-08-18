"use strict";

const {
  FX_POSITION_MODE_TRANSITION_REASON,
  normalizeFxTradePositionManagementIdentity,
  planFxTradePositionManagementTransitionToAuto
} = require("../domain/fx-trade-position-management-transition");

const MAX_FX_TRADES_PER_POSITION_MODE_TRANSITION = 200;

function applicationError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function invalidCommand(message) {
  return applicationError(
    "INVALID_FX_POSITION_MODE_TRANSITION_COMMAND",
    message
  );
}

function identityKey(identity) {
  return `${identity.tradeType}:${identity.tradeId}`;
}

function normalizedCommand(command) {
  const source = command && typeof command === "object" && !Array.isArray(command)
    ? command
    : {};

  if (!Array.isArray(source.trades) || source.trades.length === 0) {
    throw invalidCommand(
      "Select at least one FX Trade from Manual Control."
    );
  }

  if (source.trades.length > MAX_FX_TRADES_PER_POSITION_MODE_TRANSITION) {
    throw invalidCommand(
      "No more than 200 FX Trades can be sent to Auto Batching & Hedging at once."
    );
  }

  const identities = source.trades.map((trade, index) => {
    try {
      return normalizeFxTradePositionManagementIdentity(
        trade,
        `Selected FX Trade ${index + 1}`
      );
    } catch (error) {
      throw invalidCommand(error.message);
    }
  });
  const identityKeys = identities.map(identityKey);

  if (new Set(identityKeys).size !== identityKeys.length) {
    throw invalidCommand(
      "Every FX Trade identity may be selected only once."
    );
  }

  return Object.freeze({
    identities: Object.freeze([...identities].sort((left, right) =>
      left.tradeId - right.tradeId
      || left.tradeType.localeCompare(right.tradeType)
    ))
  });
}

function transitionTimestamp(clock) {
  const value = clock();
  const instant = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(instant.getTime())) {
    throw applicationError(
      "INVALID_FX_POSITION_MODE_TRANSITION_TIME",
      "FX Position Mode transition time must be a valid instant."
    );
  }

  return instant.toISOString();
}

function missingTradeError(identities) {
  const renderedIdentities = identities.map(
    identity => `${identity.tradeId} (${identity.tradeType})`
  );

  return applicationError(
    "FX_POSITION_TRADE_NOT_FOUND",
    `FX Trade ${renderedIdentities.join(", ")} was not found in FX Position Management.`
  );
}

function repositoryIntegrityError(message) {
  return applicationError(
    "FX_POSITION_MANAGEMENT_REPOSITORY_INTEGRITY_ERROR",
    message
  );
}

class SendFxTradesToAutoPositionManagementUseCase {
  constructor({
    transactionRunner,
    fxTradePositionManagementRepository,
    clock = () => new Date()
  }) {
    this.transactionRunner = transactionRunner;
    this.fxTradePositionManagementRepository =
      fxTradePositionManagementRepository;
    this.clock = clock;
  }

  execute(command) {
    const normalized = normalizedCommand(command);

    return this.transactionRunner.run(() => {
      const states = this.fxTradePositionManagementRepository
        .findByIdentities(normalized.identities);

      if (!Array.isArray(states)) {
        throw repositoryIntegrityError(
          "FX Position Management repository must return a State collection."
        );
      }

      const requestedIdentityKeys = new Set(
        normalized.identities.map(identityKey)
      );
      const stateByIdentity = new Map();

      states.forEach(state => {
        let identity;

        try {
          identity = normalizeFxTradePositionManagementIdentity(state);
        } catch (error) {
          throw repositoryIntegrityError(error.message);
        }

        const key = identityKey(identity);

        if (!requestedIdentityKeys.has(key) || stateByIdentity.has(key)) {
          throw repositoryIntegrityError(
            "FX Position Management repository returned unexpected or duplicate State."
          );
        }

        stateByIdentity.set(key, state);
      });

      const missingIdentities = normalized.identities.filter(
        identity => !stateByIdentity.has(identityKey(identity))
      );

      if (missingIdentities.length > 0) {
        throw missingTradeError(missingIdentities);
      }

      // Validate the complete selection before the first write.
      const plans = normalized.identities.map(identity =>
        planFxTradePositionManagementTransitionToAuto(
          stateByIdentity.get(identityKey(identity))
        )
      );
      const plansToSave = plans.filter(plan => plan.requiresSave);
      const transitionedAt = plansToSave.length > 0
        ? transitionTimestamp(this.clock)
        : null;

      plansToSave.forEach(plan => {
        this.fxTradePositionManagementRepository.saveTransition({
          identity: plan.identity,
          initialPositionManagementMode: plan.initialPositionManagementMode,
          previousPositionManagementMode: plan.previousPositionManagementMode,
          currentPositionManagementMode: plan.currentPositionManagementMode,
          transitionReason: plan.transitionReason,
          transitionedAt
        });
      });

      const transitions = plans.map(plan => Object.freeze({
        ...plan.identity,
        initialPositionManagementMode: plan.initialPositionManagementMode,
        currentPositionManagementMode: plan.currentPositionManagementMode,
        transitionReason: plan.transitionReason,
        transitionedAt: plan.replayed
          ? plan.previousTransitionedAt
          : transitionedAt,
        replayed: plan.replayed
      }));

      return Object.freeze({
        targetPositionManagementMode: "AUTO",
        transitionReason:
          FX_POSITION_MODE_TRANSITION_REASON.MANUAL_REVIEW_COMPLETED,
        transitions: Object.freeze(transitions),
        transitionedCount: plansToSave.length,
        replayedCount: plans.length - plansToSave.length,
        replayed: plansToSave.length === 0
      });
    });
  }
}

module.exports = {
  MAX_FX_TRADES_PER_POSITION_MODE_TRANSITION,
  SendFxTradesToAutoPositionManagementUseCase
};
