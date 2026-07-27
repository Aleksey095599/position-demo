"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  calculateBatchBalancingTradePair
} = require("./batch-balancing-trade-pair");

const fixedNow = () => new Date("2026-07-24T14:00:00.000Z");
const commonTerms = {
  tradeType: "CLIENT_DEAL",
  ccyPairCode: "EUR_USD",
  tradeDate: "2026-07-24",
  tenor: "TOD",
  baseCcyValueDate: "2026-07-24",
  quoteCcyValueDate: "2026-07-24"
};

test("creates the expected mirrored pair for Trade IDs 5 and 16", () => {
  const result = calculateBatchBalancingTradePair({
    trades: [
      {
        ...commonTerms,
        tradeId: 5,
        side: "SELL",
        baseCcyAmount: 1000000,
        transferRate: 1.1223
      },
      {
        ...commonTerms,
        tradeId: 16,
        side: "BUY",
        baseCcyAmount: 700000,
        transferRate: 1.1222
      }
    ],
    now: fixedNow
  });

  assert.deepEqual(result.sourceTradeIds, [5, 16]);
  assert.equal(result.sourceNetSide, "SELL");
  assert.equal(result.sourceNetBaseCcyAmount, 300000);
  assert.equal(result.balancingTrade.tradeType, "BATCH_BALANCING_TRADE");
  assert.equal(result.balancingTrade.side, "BUY");
  assert.equal(result.balancingTrade.baseCcyAmount, 300000);
  assert.equal(result.balancingTrade.tradeRate, 1.1225);
  assert.equal(result.balancingTrade.quoteCcyAmount, 336750);
  assert.equal(result.positionOutTrade.tradeType, "BATCH_POSITION_OUT");
  assert.equal(result.positionOutTrade.side, "SELL");
  assert.equal(result.positionOutTrade.baseCcyAmount, 300000);
  assert.equal(result.positionOutTrade.tradeRate, result.balancingTrade.tradeRate);
  assert.equal(result.positionOutTrade.quoteCcyAmount, result.balancingTrade.quoteCcyAmount);
});

test("supports a selection containing trades in one direction", () => {
  const result = calculateBatchBalancingTradePair({
    trades: [
      {
        ...commonTerms,
        tradeId: 10,
        side: "BUY",
        baseCcyAmount: 200000,
        transferRate: 1.12
      },
      {
        ...commonTerms,
        tradeId: 11,
        side: "BUY",
        baseCcyAmount: 300000,
        transferRate: 1.13
      }
    ],
    now: fixedNow
  });

  assert.equal(result.sourceNetSide, "BUY");
  assert.equal(result.balancingTrade.side, "SELL");
  assert.equal(result.positionOutTrade.side, "BUY");
  assert.equal(result.balancingTrade.baseCcyAmount, 500000);
  assert.equal(result.balancingTrade.tradeRate, 1.126);
});

test("rejects a flat base position", () => {
  assert.throws(
    () => calculateBatchBalancingTradePair({
      trades: [
        {
          ...commonTerms,
          tradeId: 20,
          side: "BUY",
          baseCcyAmount: 100000,
          transferRate: 1.12
        },
        {
          ...commonTerms,
          tradeId: 21,
          side: "SELL",
          baseCcyAmount: 100000,
          transferRate: 1.12
        }
      ],
      now: fixedNow
    }),
    error => error.code === "BATCH_SELECTION_ALREADY_BALANCED"
  );
});

test("rejects trades from different settlement buckets", () => {
  assert.throws(
    () => calculateBatchBalancingTradePair({
      trades: [
        {
          ...commonTerms,
          tradeId: 30,
          side: "SELL",
          baseCcyAmount: 100000,
          transferRate: 1.12
        },
        {
          ...commonTerms,
          tradeId: 31,
          side: "BUY",
          baseCcyAmount: 50000,
          transferRate: 1.12,
          tenor: "TOM",
          baseCcyValueDate: "2026-07-25",
          quoteCcyValueDate: "2026-07-25"
        }
      ],
      now: fixedNow
    }),
    error => error.code === "INCOMPATIBLE_BATCH_SELECTION"
  );
});
