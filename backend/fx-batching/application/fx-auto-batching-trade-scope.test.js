"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  selectFxTradesForAutoBatchingRun
} = require("./fx-auto-batching-trade-scope");

test("selects only new incoming Trades and Carry-in Positions", () => {
  const trades = [
    { tradeId: 10, tradeType: "CLIENT_DEAL" },
    { tradeId: 11, tradeType: "HEDGE_DEAL" },
    { tradeId: 12, tradeType: "BATCH_POSITION_OUT" },
    { tradeId: 13, tradeType: "BATCH_BALANCE_TRADE" },
    { tradeId: 14, tradeType: "CLIENT_DEAL" },
    { tradeId: 15, tradeType: "BATCH_POSITION_OUT" }
  ];
  const selected = selectFxTradesForAutoBatchingRun({
    trades,
    afterTradeId: 12
  });

  assert.deepEqual(selected.map(trade => trade.tradeId), [14, 15]);
  assert.deepEqual(trades.map(trade => trade.tradeId), [10, 11, 12, 13, 14, 15]);
});

test("removes explicitly excluded incoming Trades and Carry-in Positions", () => {
  const selected = selectFxTradesForAutoBatchingRun({
    trades: [
      { tradeId: 10, tradeType: "BATCH_POSITION_OUT" },
      { tradeId: 11, tradeType: "CLIENT_DEAL" },
      { tradeId: 12, tradeType: "HEDGE_DEAL" }
    ],
    afterTradeId: 10,
    excludedTradeIds: [10, 12]
  });

  assert.deepEqual(selected.map(trade => trade.tradeId), [11]);
});

test("filters new Trades by configured Auto Batching Currency Pairs", () => {
  const selected = selectFxTradesForAutoBatchingRun({
    trades: [
      { tradeId: 11, tradeType: "CLIENT_DEAL", ccyPairCode: "EUR_USD" },
      { tradeId: 12, tradeType: "HEDGE_DEAL", ccyPairCode: "GBP_USD" },
      { tradeId: 13, tradeType: "BATCH_POSITION_OUT", ccyPairCode: "EUR_USD" }
    ],
    afterTradeId: 10,
    eligibleCcyPairCodes: ["EUR_USD"]
  });

  assert.deepEqual(selected.map(trade => trade.tradeId), [11, 13]);
});

test("rejects malformed Auto Batching run boundaries", () => {
  assert.throws(
    () => selectFxTradesForAutoBatchingRun({
      trades: [],
      afterTradeId: -1
    }),
    /non-negative safe integer/
  );
  assert.throws(
    () => selectFxTradesForAutoBatchingRun({
      trades: [],
      excludedTradeIds: [0]
    }),
    /positive integers/
  );
  assert.throws(
    () => selectFxTradesForAutoBatchingRun({
      trades: [],
      eligibleCcyPairCodes: []
    }),
    /non-empty collection/
  );
});
