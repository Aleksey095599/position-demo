"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  MAX_FX_TRADES_PER_POSITION_MODE_TRANSITION,
  SendFxTradesToAutoPositionManagementUseCase
} = require("./send-fx-trades-to-auto-position-management-use-case");

const FIXED_TIME = "2026-08-18T10:15:30.000Z";

function state(tradeId, tradeType = "CLIENT_DEAL", overrides = {}) {
  return {
    tradeId,
    tradeType,
    initialPositionManagementMode: "MANUAL",
    currentPositionManagementMode: "MANUAL",
    batchBlocked: false,
    transitionedAt: null,
    ...overrides
  };
}

function identityKey(value) {
  return `${value.tradeType}:${value.tradeId}`;
}

function useCaseWith({
  states = [state(1)],
  transactionRunner,
  repository,
  clock = () => new Date(FIXED_TIME)
} = {}) {
  const stateByIdentity = new Map(
    states.map(candidate => [identityKey(candidate), candidate])
  );

  return new SendFxTradesToAutoPositionManagementUseCase({
    transactionRunner: transactionRunner || {
      run: operation => operation()
    },
    fxTradePositionManagementRepository: repository || {
      findByIdentities: identities => identities
        .map(identity => stateByIdentity.get(identityKey(identity)))
        .filter(Boolean),
      saveTransition: () => {}
    },
    clock
  });
}

test("atomically sends MANUAL Trades to AUTO and returns replay details", () => {
  let transactions = 0;
  const requestedIdentities = [];
  const savedTransitions = [];
  const states = [
    state(2, "HEDGE_DEAL", {
      currentPositionManagementMode: "AUTO",
      transitionedAt: "2026-08-18T09:00:00.000Z"
    }),
    state(1)
  ];
  const stateByIdentity = new Map(
    states.map(candidate => [identityKey(candidate), candidate])
  );
  const useCase = useCaseWith({
    transactionRunner: {
      run(operation) {
        transactions += 1;
        return operation();
      }
    },
    repository: {
      findByIdentities(identities) {
        requestedIdentities.push(...identities);
        return [...identities]
          .reverse()
          .map(identity => stateByIdentity.get(identityKey(identity)));
      },
      saveTransition(transition) {
        savedTransitions.push(transition);
      }
    }
  });

  const result = useCase.execute({
    trades: [
      { tradeId: 2, tradeType: "hedge_deal" },
      { tradeId: "1", tradeType: " client_deal " }
    ]
  });

  assert.equal(transactions, 1);
  assert.deepEqual(requestedIdentities, [
    { tradeId: 1, tradeType: "CLIENT_DEAL" },
    { tradeId: 2, tradeType: "HEDGE_DEAL" }
  ]);
  assert.deepEqual(savedTransitions, [{
    identity: { tradeId: 1, tradeType: "CLIENT_DEAL" },
    initialPositionManagementMode: "MANUAL",
    previousPositionManagementMode: "MANUAL",
    currentPositionManagementMode: "AUTO",
    transitionReason: "MANUAL_REVIEW_COMPLETED",
    transitionedAt: FIXED_TIME
  }]);
  assert.deepEqual(result, {
    targetPositionManagementMode: "AUTO",
    transitionReason: "MANUAL_REVIEW_COMPLETED",
    transitions: [
      {
        tradeId: 1,
        tradeType: "CLIENT_DEAL",
        initialPositionManagementMode: "MANUAL",
        currentPositionManagementMode: "AUTO",
        transitionReason: "MANUAL_REVIEW_COMPLETED",
        transitionedAt: FIXED_TIME,
        replayed: false
      },
      {
        tradeId: 2,
        tradeType: "HEDGE_DEAL",
        initialPositionManagementMode: "MANUAL",
        currentPositionManagementMode: "AUTO",
        transitionReason: "MANUAL_REVIEW_COMPLETED",
        transitionedAt: "2026-08-18T09:00:00.000Z",
        replayed: true
      }
    ],
    transitionedCount: 1,
    replayedCount: 1,
    replayed: false
  });
});

test("does not create a second transition for an initial MANUAL current AUTO replay", () => {
  let saves = 0;
  let clockCalls = 0;
  const useCase = useCaseWith({
    states: [state(1, "CLIENT_DEAL", {
      currentPositionManagementMode: "AUTO",
      batchBlocked: true,
      transitionedAt: "2026-08-18T09:00:00.000Z"
    })],
    repository: {
      findByIdentities: () => [state(1, "CLIENT_DEAL", {
        currentPositionManagementMode: "AUTO",
        batchBlocked: true,
        transitionedAt: "2026-08-18T09:00:00.000Z"
      })],
      saveTransition() {
        saves += 1;
      }
    },
    clock() {
      clockCalls += 1;
      return new Date(FIXED_TIME);
    }
  });

  const result = useCase.execute({
    trades: [{ tradeId: 1, tradeType: "CLIENT_DEAL" }]
  });

  assert.equal(saves, 0);
  assert.equal(clockCalls, 0);
  assert.equal(result.replayed, true);
  assert.equal(result.replayedCount, 1);
  assert.equal(result.transitions[0].replayed, true);
});

test("distinguishes a missing composite FX Trade identity", () => {
  const useCase = useCaseWith({ states: [state(1, "CLIENT_DEAL")] });

  assert.throws(
    () => useCase.execute({
      trades: [{ tradeId: 1, tradeType: "HEDGE_DEAL" }]
    }),
    error => error?.code === "FX_POSITION_TRADE_NOT_FOUND"
      && /1 \(HEDGE_DEAL\)/.test(error.message)
  );
});

test("validates every State before writing any transition", () => {
  for (const invalidState of [
    state(2, "CLIENT_DEAL", {
      initialPositionManagementMode: "AUTO",
      currentPositionManagementMode: "AUTO"
    }),
    state(2, "CLIENT_DEAL", { batchBlocked: true })
  ]) {
    let saves = 0;
    const useCase = useCaseWith({
      repository: {
        findByIdentities: () => [state(1), invalidState],
        saveTransition() {
          saves += 1;
        }
      }
    });

    assert.throws(
      () => useCase.execute({
        trades: [
          { tradeId: 1, tradeType: "CLIENT_DEAL" },
          { tradeId: 2, tradeType: "CLIENT_DEAL" }
        ]
      }),
      error => [
        "FX_POSITION_MODE_TRANSITION_REJECTED",
        "FX_POSITION_MODE_TRANSITION_BLOCKED"
      ].includes(error?.code)
    );
    assert.equal(saves, 0);
  }
});

test("rolls back the complete selection when one save fails", () => {
  const persistedTransitions = [];
  let transactions = 0;
  const useCase = useCaseWith({
    transactionRunner: {
      run(operation) {
        transactions += 1;
        const before = [...persistedTransitions];

        try {
          return operation();
        } catch (error) {
          persistedTransitions.splice(
            0,
            persistedTransitions.length,
            ...before
          );
          throw error;
        }
      }
    },
    repository: {
      findByIdentities: () => [state(1), state(2, "HEDGE_DEAL")],
      saveTransition(transition) {
        persistedTransitions.push(transition);

        if (transition.identity.tradeId === 2) {
          throw new Error("Simulated persistence failure.");
        }
      }
    }
  });

  assert.throws(
    () => useCase.execute({
      trades: [
        { tradeId: 1, tradeType: "CLIENT_DEAL" },
        { tradeId: 2, tradeType: "HEDGE_DEAL" }
      ]
    }),
    /Simulated persistence failure/
  );
  assert.equal(transactions, 1);
  assert.deepEqual(persistedTransitions, []);
});

test("enforces a unique composite identity and the 200 Trade limit", () => {
  assert.equal(MAX_FX_TRADES_PER_POSITION_MODE_TRANSITION, 200);
  const useCase = useCaseWith();

  for (const trades of [
    [],
    [
      { tradeId: 1, tradeType: "CLIENT_DEAL" },
      { tradeId: 1, tradeType: "client_deal" }
    ],
    Array.from({ length: 201 }, (_, index) => ({
      tradeId: index + 1,
      tradeType: "CLIENT_DEAL"
    }))
  ]) {
    assert.throws(
      () => useCase.execute({ trades }),
      error => error?.code ===
        "INVALID_FX_POSITION_MODE_TRANSITION_COMMAND"
    );
  }
});

test("accepts the same Trade ID for different supported Trade Types", () => {
  const saved = [];
  const useCase = useCaseWith({
    repository: {
      findByIdentities: () => [
        state(1, "CLIENT_DEAL"),
        state(1, "HEDGE_DEAL")
      ],
      saveTransition: transition => saved.push(transition)
    }
  });

  const result = useCase.execute({
    trades: [
      { tradeId: 1, tradeType: "CLIENT_DEAL" },
      { tradeId: 1, tradeType: "HEDGE_DEAL" }
    ],
    targetPositionManagementMode: "MANUAL"
  });

  assert.equal(saved.length, 2);
  assert.equal(result.targetPositionManagementMode, "AUTO");
});

test("rejects Trade Types outside CLIENT_DEAL and HEDGE_DEAL", () => {
  const useCase = useCaseWith();

  assert.throws(
    () => useCase.execute({
      trades: [{ tradeId: 1, tradeType: "BATCH_POSITION_OUT" }]
    }),
    error => error?.code ===
      "INVALID_FX_POSITION_MODE_TRANSITION_COMMAND"
  );
});
