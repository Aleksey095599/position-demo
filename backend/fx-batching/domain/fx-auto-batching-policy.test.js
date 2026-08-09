"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  planFxAutoBatching
} = require("./fx-auto-batching-policy");
const {
  FX_BATCH_FORMATION_REASON_CODE
} = require("./fx-batch-formation-reason");

function trade(overrides = {}) {
  return {
    tradeId: 1,
    tradeType: "CLIENT_DEAL",
    receivedTimestamp: "2026-08-05T09:00:00.000Z",
    ccyPairCode: "EUR_USD",
    side: "SELL",
    transferRate: "1.1220",
    tradeDate: "2026-08-05",
    tenor: "TOD",
    baseCcyValueDate: "2026-08-05",
    quoteCcyValueDate: "2026-08-05",
    baseCcyFractionDigits: 2,
    quoteCcyFractionDigits: 2,
    ...overrides
  };
}

test("keeps a Batching Window open until its maximum interval", () => {
  const plan = planFxAutoBatching({
    trades: [
      trade({ tradeId: 1 }),
      trade({
        tradeId: 2,
        receivedTimestamp: "2026-08-05T09:00:10.000Z",
        transferRate: "1.1221"
      })
    ],
    maxSpreadPercent: "0.05",
    maxIntervalSeconds: 60,
    now: new Date("2026-08-05T09:00:30.000Z")
  });

  assert.deepEqual(plan.candidates, []);
  assert.equal(plan.nextEvaluationDelayMs, 30000);
});

test("closes a Batching Window when its maximum interval is reached", () => {
  const plan = planFxAutoBatching({
    trades: [
      trade({ tradeId: 1 }),
      trade({
        tradeId: 2,
        receivedTimestamp: "2026-08-05T09:00:10.000Z",
        transferRate: "1.1221"
      })
    ],
    maxSpreadPercent: "0.05",
    maxIntervalSeconds: 60,
    now: new Date("2026-08-05T09:01:00.000Z")
  });

  assert.equal(plan.nextEvaluationDelayMs, 0);
  assert.deepEqual(plan.candidates[0].tradeIds, [1, 2]);
  assert.equal(
    plan.candidates[0].formationReasonCode,
    FX_BATCH_FORMATION_REASON_CODE.MAX_INTERVAL_REACHED
  );
  assert.equal(plan.candidates[0].windowOpenedAt, "2026-08-05T09:00:00.000Z");
  assert.equal(plan.candidates[0].windowClosedAt, "2026-08-05T09:01:00.000Z");
  assert.deepEqual(plan.candidates[0].formationReasonDetails, {
    maxIntervalSeconds: 60,
    oldestTradeId: 1,
    windowDurationMilliseconds: 60000,
    candidateTradeCount: 2,
    carryInPositionCount: 0,
    deferredCarryInPositionCount: 0,
    deferredWindowTradeCount: 0,
    selectedTradeCount: 2,
    corridorMinTransferRate: "1.122",
    corridorMaxTransferRate: "1.1221",
    corridorSpreadPercent: plan.candidates[0]
      .formationReasonDetails.corridorSpreadPercent
  });
});

test("treats Client and Hedge Deals as equal Auto Batching sources", () => {
  const plan = planFxAutoBatching({
    trades: [
      trade({ tradeId: 1, tradeType: "CLIENT_DEAL" }),
      trade({
        tradeId: 2,
        tradeType: "HEDGE_DEAL",
        receivedTimestamp: "2026-08-05T09:00:10.000Z",
        side: "BUY",
        transferRate: "1.1221"
      })
    ],
    maxSpreadPercent: "0.05",
    maxIntervalSeconds: 60,
    now: new Date("2026-08-05T09:01:00.000Z")
  });

  assert.deepEqual(plan.candidates[0].tradeIds, [1, 2]);
  assert.equal(
    plan.candidates[0].formationReasonCode,
    FX_BATCH_FORMATION_REASON_CODE.MAX_INTERVAL_REACHED
  );
  assert.equal(plan.candidates[0].formationReasonDetails.candidateTradeCount, 2);
});

test("closes the accepted Batching Window before the corridor is breached", () => {
  const plan = planFxAutoBatching({
    trades: [
      trade({ tradeId: 1, transferRate: "1.1220" }),
      trade({
        tradeId: 2,
        receivedTimestamp: "2026-08-05T09:00:01.000Z",
        transferRate: "1.1222"
      }),
      trade({
        tradeId: 3,
        receivedTimestamp: "2026-08-05T09:00:02.000Z",
        transferRate: "1.1221"
      }),
      trade({
        tradeId: 4,
        receivedTimestamp: "2026-08-05T09:00:03.000Z",
        transferRate: "1.1250"
      })
    ],
    maxSpreadPercent: "0.05",
    maxIntervalSeconds: 60,
    now: new Date("2026-08-05T09:00:03.000Z")
  });

  const candidate = plan.candidates[0];

  assert.deepEqual(candidate.tradeIds, [1, 2, 3]);
  assert.equal(
    candidate.formationReasonCode,
    FX_BATCH_FORMATION_REASON_CODE.TRANSFER_RATE_CORRIDOR_BREACHED
  );
  assert.equal(candidate.windowOpenedAt, "2026-08-05T09:00:00.000Z");
  assert.equal(candidate.windowClosedAt, "2026-08-05T09:00:03.000Z");
  assert.equal(candidate.formationReasonDetails.breachingTradeId, 4);
  assert.equal(candidate.formationReasonDetails.acceptedTradeCount, 3);
  assert.equal(candidate.formationReasonDetails.maxSpreadPercent, "0.05");
  assert.equal(plan.nextEvaluationDelayMs, 0);
});

test("leaves an isolated outlier manual without blocking a later compatible group", () => {
  const plan = planFxAutoBatching({
    trades: [
      trade({ tradeId: 1, transferRate: "1.1000" }),
      trade({
        tradeId: 2,
        receivedTimestamp: "2026-08-05T09:00:01.000Z",
        transferRate: "1.2000"
      }),
      trade({
        tradeId: 3,
        receivedTimestamp: "2026-08-05T09:00:02.000Z",
        transferRate: "1.2001"
      }),
      trade({
        tradeId: 4,
        receivedTimestamp: "2026-08-05T09:00:03.000Z",
        transferRate: "1.3000"
      })
    ],
    maxSpreadPercent: "0.05",
    maxIntervalSeconds: 60,
    now: new Date("2026-08-05T09:00:03.000Z")
  });

  assert.deepEqual(plan.candidates[0].tradeIds, [2, 3]);
  assert.equal(plan.candidates[0].formationReasonDetails.breachingTradeId, 4);
});

test("plans one independent candidate for every currency pair", () => {
  const plan = planFxAutoBatching({
    trades: [
      trade({ tradeId: 1 }),
      trade({ tradeId: 2, receivedTimestamp: "2026-08-05T09:00:01.000Z" }),
      trade({ tradeId: 3, ccyPairCode: "GBP_USD", transferRate: "1.3000" }),
      trade({
        tradeId: 4,
        ccyPairCode: "GBP_USD",
        receivedTimestamp: "2026-08-05T09:00:01.000Z",
        transferRate: "1.3001"
      })
    ],
    maxSpreadPercent: "0.05",
    maxIntervalSeconds: 60,
    now: new Date("2026-08-05T09:01:00.000Z")
  });

  assert.deepEqual(plan.candidates.map(candidate => ({
    ccyPairCode: candidate.ccyPairCode,
    tradeIds: candidate.tradeIds
  })), [
    { ccyPairCode: "EUR_USD", tradeIds: [1, 2] },
    { ccyPairCode: "GBP_USD", tradeIds: [3, 4] }
  ]);
});

test("does not create an automatic chain from Position Out trades alone", () => {
  const plan = planFxAutoBatching({
    trades: [
      trade({ tradeId: 1, tradeType: "BATCH_POSITION_OUT" }),
      trade({
        tradeId: 2,
        tradeType: "BATCH_POSITION_OUT",
        receivedTimestamp: "2026-08-05T09:00:01.000Z"
      })
    ],
    maxSpreadPercent: "0.05",
    maxIntervalSeconds: 60,
    now: new Date("2026-08-05T09:10:00.000Z")
  });

  assert.deepEqual(plan.candidates, []);
  assert.deepEqual(plan.closedWithoutBatchTradeIds, []);
  assert.equal(plan.openWindowCount, 0);
  assert.equal(plan.nextEvaluationDelayMs, null);
});

test("does not schedule an evaluation for a future Carry-in Position", () => {
  const plan = planFxAutoBatching({
    trades: [trade({
      tradeId: 1,
      tradeType: "BATCH_POSITION_OUT",
      receivedTimestamp: "2026-08-05T09:05:00.000Z"
    })],
    maxSpreadPercent: "0.05",
    maxIntervalSeconds: 60,
    now: new Date("2026-08-05T09:00:00.000Z")
  });

  assert.deepEqual(plan.candidates, []);
  assert.equal(plan.openWindowCount, 0);
  assert.equal(plan.nextEvaluationDelayMs, null);
});

test("uses Position Out as Carry-in without opening or timing the Batching Window", () => {
  const trades = [
    trade({
      tradeId: 1,
      tradeType: "BATCH_POSITION_OUT",
      receivedTimestamp: "2026-08-05T09:00:00.000Z",
      transferRate: "1.1000"
    }),
    trade({
      tradeId: 2,
      receivedTimestamp: "2026-08-05T09:05:00.000Z",
      transferRate: "1.1220"
    })
  ];
  const openPlan = planFxAutoBatching({
    trades,
    maxSpreadPercent: "0.05",
    maxIntervalSeconds: 60,
    now: new Date("2026-08-05T09:05:30.000Z")
  });

  assert.deepEqual(openPlan.candidates, []);
  assert.equal(openPlan.openWindowCount, 1);
  assert.equal(openPlan.nextEvaluationDelayMs, 30000);

  const closedPlan = planFxAutoBatching({
    trades,
    maxSpreadPercent: "0.05",
    maxIntervalSeconds: 60,
    now: new Date("2026-08-05T09:06:00.000Z")
  });
  const candidate = closedPlan.candidates[0];

  assert.deepEqual(candidate.tradeIds, [1, 2]);
  assert.equal(candidate.windowOpenedAt, "2026-08-05T09:05:00.000Z");
  assert.equal(candidate.windowClosedAt, "2026-08-05T09:06:00.000Z");
  assert.equal(candidate.formationReasonDetails.candidateTradeCount, 1);
  assert.equal(candidate.formationReasonDetails.carryInPositionCount, 1);
  assert.equal(candidate.formationReasonDetails.corridorMinTransferRate, "1.122");
  assert.equal(candidate.formationReasonDetails.corridorMaxTransferRate, "1.122");
});

test("excludes Carry-in Position from a Transfer Rate Corridor breach", () => {
  const plan = planFxAutoBatching({
    trades: [
      trade({
        tradeId: 1,
        tradeType: "BATCH_POSITION_OUT",
        receivedTimestamp: "2026-08-05T08:55:00.000Z",
        transferRate: "1.1000"
      }),
      trade({
        tradeId: 2,
        receivedTimestamp: "2026-08-05T09:00:00.000Z",
        transferRate: "1.1220"
      }),
      trade({
        tradeId: 3,
        tradeType: "HEDGE_DEAL",
        receivedTimestamp: "2026-08-05T09:00:01.000Z",
        transferRate: "1.1222"
      }),
      trade({
        tradeId: 4,
        receivedTimestamp: "2026-08-05T09:00:02.000Z",
        transferRate: "1.1250"
      })
    ],
    maxSpreadPercent: "0.05",
    maxIntervalSeconds: 60,
    now: new Date("2026-08-05T09:00:02.000Z")
  });
  const candidate = plan.candidates[0];

  assert.deepEqual(candidate.tradeIds, [1, 2, 3]);
  assert.equal(candidate.windowOpenedAt, "2026-08-05T09:00:00.000Z");
  assert.equal(candidate.formationReasonDetails.breachingTradeId, 4);
  assert.equal(candidate.formationReasonDetails.acceptedTradeCount, 2);
  assert.equal(candidate.formationReasonDetails.carryInPositionCount, 1);
  assert.equal(candidate.formationReasonDetails.acceptedMinTransferRate, "1.122");
  assert.equal(candidate.formationReasonDetails.acceptedMaxTransferRate, "1.1222");
});

test("does not attach Carry-in Position to a window closed before it existed", () => {
  const plan = planFxAutoBatching({
    trades: [
      trade({
        tradeId: 1,
        receivedTimestamp: "2026-08-05T09:00:00.000Z"
      }),
      trade({
        tradeId: 2,
        tradeType: "BATCH_POSITION_OUT",
        receivedTimestamp: "2026-08-05T09:01:30.000Z",
        transferRate: "1.1000"
      }),
      trade({
        tradeId: 3,
        receivedTimestamp: "2026-08-05T09:02:00.000Z"
      })
    ],
    maxSpreadPercent: "0.05",
    maxIntervalSeconds: 60,
    now: new Date("2026-08-05T09:03:00.000Z")
  });

  assert.deepEqual(plan.closedWithoutBatchTradeIds, [1]);
  assert.deepEqual(plan.candidates[0].tradeIds, [2, 3]);
  assert.equal(plan.candidates[0].windowOpenedAt, "2026-08-05T09:02:00.000Z");
  assert.equal(plan.candidates[0].windowClosedAt, "2026-08-05T09:03:00.000Z");
});

test("uses Trade ID order for Carry-in at the corridor-close timestamp", () => {
  const plan = planFxAutoBatching({
    trades: [
      trade({ tradeId: 10 }),
      trade({
        tradeId: 19,
        tradeType: "BATCH_POSITION_OUT",
        receivedTimestamp: "2026-08-05T09:00:02.000Z",
        transferRate: "1.1000"
      }),
      trade({
        tradeId: 20,
        receivedTimestamp: "2026-08-05T09:00:02.000Z",
        transferRate: "1.1250"
      }),
      trade({
        tradeId: 21,
        tradeType: "BATCH_POSITION_OUT",
        receivedTimestamp: "2026-08-05T09:00:02.000Z",
        transferRate: "1.1000"
      })
    ],
    maxSpreadPercent: "0.05",
    maxIntervalSeconds: 60,
    now: new Date("2026-08-05T09:00:02.000Z")
  });

  assert.deepEqual(plan.candidates[0].tradeIds, [10, 19]);
  assert.equal(plan.candidates[0].formationReasonDetails.breachingTradeId, 20);
  assert.equal(plan.candidates[0].formationReasonDetails.carryInPositionCount, 1);
});

test("forms a full 200-Trade batch from 199 Carry-ins and one incoming Trade", () => {
  const carryInPositions = Array.from({ length: 199 }, (_, index) => trade({
    tradeId: index + 1,
    tradeType: "BATCH_POSITION_OUT",
    receivedTimestamp: "2026-08-05T08:59:00.000Z"
  }));
  const plan = planFxAutoBatching({
    trades: [
      ...carryInPositions,
      trade({ tradeId: 200 })
    ],
    maxSpreadPercent: "0.05",
    maxIntervalSeconds: 60,
    now: new Date("2026-08-05T09:01:00.000Z")
  });
  const candidate = plan.candidates[0];

  assert.equal(candidate.tradeIds.length, 200);
  assert.equal(candidate.formationReasonDetails.carryInPositionCount, 199);
  assert.equal(candidate.formationReasonDetails.deferredCarryInPositionCount, 0);
  assert.equal(candidate.formationReasonDetails.deferredWindowTradeCount, 0);
});

test("defers excess Carry-in Positions without losing the incoming Trade", () => {
  const carryInPositions = Array.from({ length: 200 }, (_, index) => trade({
    tradeId: index + 1,
    tradeType: "BATCH_POSITION_OUT",
    receivedTimestamp: "2026-08-05T08:59:00.000Z"
  }));
  const plan = planFxAutoBatching({
    trades: [
      ...carryInPositions,
      trade({ tradeId: 201 })
    ],
    maxSpreadPercent: "0.05",
    maxIntervalSeconds: 60,
    now: new Date("2026-08-05T09:01:00.000Z")
  });
  const candidate = plan.candidates[0];

  assert.equal(candidate.tradeIds.length, 200);
  assert.equal(candidate.tradeIds.includes(200), false);
  assert.equal(candidate.tradeIds.includes(201), true);
  assert.equal(candidate.formationReasonDetails.carryInPositionCount, 199);
  assert.equal(candidate.formationReasonDetails.deferredCarryInPositionCount, 1);
});

test("defers excess window Trades after reserving capacity for Carry-in", () => {
  const incomingTrades = Array.from({ length: 200 }, (_, index) => trade({
    tradeId: index + 2
  }));
  const plan = planFxAutoBatching({
    trades: [
      trade({
        tradeId: 1,
        tradeType: "BATCH_POSITION_OUT",
        receivedTimestamp: "2026-08-05T08:59:00.000Z"
      }),
      ...incomingTrades
    ],
    maxSpreadPercent: "0.05",
    maxIntervalSeconds: 60,
    now: new Date("2026-08-05T09:01:00.000Z")
  });
  const candidate = plan.candidates[0];

  assert.equal(candidate.tradeIds.length, 200);
  assert.equal(candidate.tradeIds.includes(1), true);
  assert.equal(candidate.tradeIds.includes(201), false);
  assert.equal(candidate.formationReasonDetails.deferredCarryInPositionCount, 0);
  assert.equal(candidate.formationReasonDetails.deferredWindowTradeCount, 1);
});

test("rejects a minimum batch size greater than the maximum", () => {
  assert.throws(
    () => planFxAutoBatching({
      trades: [trade()],
      maxSpreadPercent: "0.05",
      maxIntervalSeconds: 60,
      minTradesPerBatch: 3,
      maxTradesPerBatch: 2
    }),
    error => {
      assert.equal(error.code, "INVALID_FX_AUTO_BATCHING_POLICY");
      assert.match(error.message, /must not exceed/);
      return true;
    }
  );
});

test("rejects an unsupported cross-tenor Auto Batching mode", () => {
  assert.throws(
    () => planFxAutoBatching({
      trades: [],
      maxSpreadPercent: "0.05",
      maxIntervalSeconds: 60,
      tenorCompatibilityMode: "CROSS_TENOR_WITH_SWAPS"
    }),
    error => error?.code === "INVALID_FX_AUTO_BATCHING_POLICY"
  );
});

test("closes a single-Trade window without a batch and leaves the Trade manual", () => {
  const plan = planFxAutoBatching({
    trades: [trade({ tradeId: 1 })],
    maxSpreadPercent: "0.05",
    maxIntervalSeconds: 60,
    now: new Date("2026-08-05T09:01:00.000Z")
  });

  assert.deepEqual(plan.candidates, []);
  assert.deepEqual(plan.closedWithoutBatchTradeIds, [1]);
  assert.equal(plan.openWindowCount, 0);
  assert.equal(plan.nextEvaluationDelayMs, 0);
});

test("does not include a Trade received after the first window deadline", () => {
  const plan = planFxAutoBatching({
    trades: [
      trade({ tradeId: 1 }),
      trade({
        tradeId: 2,
        receivedTimestamp: "2026-08-05T09:00:10.000Z",
        transferRate: "1.1221"
      }),
      trade({
        tradeId: 3,
        receivedTimestamp: "2026-08-05T09:01:00.000Z",
        transferRate: "1.1221"
      })
    ],
    maxSpreadPercent: "0.05",
    maxIntervalSeconds: 60,
    now: new Date("2026-08-05T09:01:05.000Z")
  });

  assert.deepEqual(plan.candidates[0].tradeIds, [1, 2]);
  assert.equal(plan.candidates[0].windowClosedAt, "2026-08-05T09:01:00.000Z");
  assert.equal(plan.openWindowCount, 0);
});

test("waits until a future Received Timestamp before opening a Batching Window", () => {
  const plan = planFxAutoBatching({
    trades: [
      trade({
        tradeId: 1,
        receivedTimestamp: "2026-08-05T09:00:10.000Z"
      })
    ],
    maxSpreadPercent: "0.05",
    maxIntervalSeconds: 60,
    now: new Date("2026-08-05T09:00:05.000Z")
  });

  assert.deepEqual(plan.candidates, []);
  assert.deepEqual(plan.closedWithoutBatchTradeIds, []);
  assert.equal(plan.openWindowCount, 0);
  assert.equal(plan.nextEvaluationDelayMs, 5000);
});
