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
    entryTimestamp: "2026-08-05T09:00:00.000Z",
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

test("keeps a quiet corridor open until its pair-specific maximum interval", () => {
  const plan = planFxAutoBatching({
    trades: [
      trade({ tradeId: 1 }),
      trade({
        tradeId: 2,
        entryTimestamp: "2026-08-05T09:00:10.000Z",
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

test("forms a quiet corridor when its maximum interval is reached", () => {
  const plan = planFxAutoBatching({
    trades: [
      trade({ tradeId: 1 }),
      trade({
        tradeId: 2,
        entryTimestamp: "2026-08-05T09:00:10.000Z",
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
  assert.deepEqual(plan.candidates[0].formationReasonDetails, {
    maxIntervalSeconds: 60,
    oldestTradeId: 1,
    oldestTradeAgeMilliseconds: 60000,
    candidateTradeCount: 2,
    selectedTradeCount: 2,
    corridorMinTransferRate: "1.122",
    corridorMaxTransferRate: "1.1221",
    corridorSpreadPercent: plan.candidates[0]
      .formationReasonDetails.corridorSpreadPercent
  });
});

test("forms the accepted prefix immediately when the corridor is breached", () => {
  const plan = planFxAutoBatching({
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
        entryTimestamp: "2026-08-05T09:00:01.000Z",
        transferRate: "1.2000"
      }),
      trade({
        tradeId: 3,
        entryTimestamp: "2026-08-05T09:00:02.000Z",
        transferRate: "1.2001"
      }),
      trade({
        tradeId: 4,
        entryTimestamp: "2026-08-05T09:00:03.000Z",
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
      trade({ tradeId: 2, entryTimestamp: "2026-08-05T09:00:01.000Z" }),
      trade({ tradeId: 3, ccyPairCode: "GBP_USD", transferRate: "1.3000" }),
      trade({
        tradeId: 4,
        ccyPairCode: "GBP_USD",
        entryTimestamp: "2026-08-05T09:00:01.000Z",
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
        entryTimestamp: "2026-08-05T09:00:01.000Z"
      })
    ],
    maxSpreadPercent: "0.05",
    maxIntervalSeconds: 60,
    now: new Date("2026-08-05T09:10:00.000Z")
  });

  assert.deepEqual(plan.candidates, []);
  assert.equal(plan.nextEvaluationDelayMs, null);
});
