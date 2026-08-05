"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  FX_AUTO_BATCH_CORRIDOR_TRIGGER_REASON,
  planAutoBatchByTransferRateCorridor
} = require("./fx-auto-batch-corridor-planner");

function trade(overrides = {}) {
  return {
    tradeId: 1,
    entryTimestamp: "2026-08-05T09:00:00.000Z",
    ccyPairCode: "EUR_USD",
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

test("keeps an empty Batching Window open without an automatic batch candidate", () => {
  assert.deepEqual(planAutoBatchByTransferRateCorridor({
    trades: [],
    maxSpreadPercent: "0.05"
  }), {
    shouldBatch: false,
    reason: null,
    ccyPairCode: null,
    candidateTradeIds: [],
    remainingTradeIds: [],
    breachingTradeId: null,
    acceptedCorridor: null,
    breachedCorridor: null
  });
});

test("keeps a Batching Window open while its Transfer Rates remain in the corridor", () => {
  const plan = planAutoBatchByTransferRateCorridor({
    trades: [
      trade({ tradeId: 1, transferRate: "1.1220" }),
      trade({
        tradeId: 2,
        entryTimestamp: "2026-08-05T09:00:01.000Z",
        transferRate: "1.1223"
      }),
      trade({
        tradeId: 3,
        entryTimestamp: "2026-08-05T09:00:02.000Z",
        transferRate: "1.1219"
      })
    ],
    maxSpreadPercent: "0.05"
  });

  assert.equal(plan.shouldBatch, false);
  assert.equal(plan.reason, null);
  assert.deepEqual(plan.candidateTradeIds, []);
  assert.deepEqual(plan.remainingTradeIds, [1, 2, 3]);
  assert.equal(plan.breachingTradeId, null);
  assert.equal(plan.acceptedCorridor.transferRateCount, 3);
  assert.equal(plan.acceptedCorridor.minTransferRate, "1.1219");
  assert.equal(plan.acceptedCorridor.maxTransferRate, "1.1223");
  assert.equal(plan.breachedCorridor, null);
});

test("closes a Batching Window and leaves the breaching Trade for the next window", () => {
  const plan = planAutoBatchByTransferRateCorridor({
    trades: [
      trade({ tradeId: 1, transferRate: "1.1220" }),
      trade({
        tradeId: 2,
        entryTimestamp: "2026-08-05T09:00:01.000Z",
        transferRate: "1.1222"
      }),
      trade({
        tradeId: 3,
        entryTimestamp: "2026-08-05T09:00:02.000Z",
        transferRate: "1.1221"
      }),
      trade({
        tradeId: 4,
        entryTimestamp: "2026-08-05T09:00:03.000Z",
        transferRate: "1.1250"
      }),
      trade({
        tradeId: 5,
        entryTimestamp: "2026-08-05T09:00:04.000Z",
        transferRate: "1.1251"
      })
    ],
    maxSpreadPercent: "0.05"
  });

  assert.equal(plan.shouldBatch, true);
  assert.equal(
    plan.reason,
    FX_AUTO_BATCH_CORRIDOR_TRIGGER_REASON.TRANSFER_RATE_CORRIDOR_BREACHED
  );
  assert.equal(plan.ccyPairCode, "EUR_USD");
  assert.deepEqual(plan.candidateTradeIds, [1, 2, 3]);
  assert.deepEqual(plan.remainingTradeIds, [4, 5]);
  assert.equal(plan.breachingTradeId, 4);
  assert.equal(plan.acceptedCorridor.transferRateCount, 3);
  assert.equal(plan.acceptedCorridor.isBreached, false);
  assert.equal(plan.breachedCorridor.transferRateCount, 4);
  assert.equal(plan.breachedCorridor.isBreached, true);
});

test("accepts a Transfer Rate exactly on the corridor boundary", () => {
  const plan = planAutoBatchByTransferRateCorridor({
    trades: [
      trade({ tradeId: 1, transferRate: "0.9995" }),
      trade({
        tradeId: 2,
        entryTimestamp: "2026-08-05T09:00:01.000Z",
        transferRate: "1.0005"
      })
    ],
    maxSpreadPercent: "0.1"
  });

  assert.equal(plan.shouldBatch, false);
  assert.deepEqual(plan.remainingTradeIds, [1, 2]);
  assert.equal(plan.acceptedCorridor.spreadPercent, "0.1");
});

test("orders trades by Entry Timestamp and Trade ID without mutating the input", () => {
  const trades = [
    trade({
      tradeId: 4,
      entryTimestamp: "2026-08-05T09:00:03.000Z",
      transferRate: "1.1251"
    }),
    trade({
      tradeId: 3,
      entryTimestamp: "2026-08-05T09:00:02.000Z",
      transferRate: "1.1250"
    }),
    trade({
      tradeId: 2,
      entryTimestamp: "2026-08-05T09:00:01.000Z",
      transferRate: "1.1221"
    }),
    trade({
      tradeId: 1,
      entryTimestamp: "2026-08-05T09:00:01.000Z",
      transferRate: "1.1220"
    })
  ];

  const plan = planAutoBatchByTransferRateCorridor({
    trades,
    maxSpreadPercent: "0.05"
  });

  assert.deepEqual(plan.candidateTradeIds, [1, 2]);
  assert.deepEqual(plan.remainingTradeIds, [3, 4]);
  assert.deepEqual(trades.map(item => item.tradeId), [4, 3, 2, 1]);
});

test("rejects duplicated trades or mixed Batching Keys", () => {
  assert.throws(
    () => planAutoBatchByTransferRateCorridor({
      trades: [trade({ tradeId: 1 }), trade({ tradeId: 1 })],
      maxSpreadPercent: "0.05"
    }),
    error => error?.code === "INVALID_FX_AUTO_BATCH_CORRIDOR_PLAN"
  );

  assert.throws(
    () => planAutoBatchByTransferRateCorridor({
      trades: [
        trade({ tradeId: 1 }),
        trade({
          tradeId: 2,
          entryTimestamp: "2026-08-05T09:00:01.000Z",
          quoteCcyValueDate: "2026-08-06"
        })
      ],
      maxSpreadPercent: "0.05"
    }),
    error => error?.code === "INVALID_FX_AUTO_BATCH_CORRIDOR_PLAN"
  );
});

test("rejects malformed planning input", () => {
  assert.throws(
    () => planAutoBatchByTransferRateCorridor({
      trades: null,
      maxSpreadPercent: "0.05"
    }),
    TypeError
  );

  for (const invalidTrade of [
    trade({ tradeId: 0 }),
    trade({ entryTimestamp: "invalid" }),
    trade({ ccyPairCode: "" })
  ]) {
    assert.throws(
      () => planAutoBatchByTransferRateCorridor({
        trades: [invalidTrade],
        maxSpreadPercent: "0.05"
      }),
      error => error?.code === "INVALID_FX_AUTO_BATCH_CORRIDOR_PLAN"
    );
  }

  assert.throws(
    () => planAutoBatchByTransferRateCorridor({
      trades: [trade({ transferRate: "invalid" })],
      maxSpreadPercent: "0.05"
    }),
    error => error?.code === "INVALID_FX_TRANSFER_RATE_CORRIDOR"
  );
});
