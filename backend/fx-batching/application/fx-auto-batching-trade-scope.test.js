"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  selectFxTradesForAutoBatchingRun
} = require("./fx-auto-batching-trade-scope");

test("keeps old Carry-in passive while excluding old incoming Trades", () => {
  const trades = [
    { tradeId: 10, tradeType: "CLIENT_DEAL" },
    { tradeId: 11, tradeType: "HEDGE_DEAL" },
    { tradeId: 12, tradeType: "BATCH_POSITION_OUT" },
    { tradeId: 13, tradeType: "BATCH_BALANCE_TRADE" }
  ];
  const selected = selectFxTradesForAutoBatchingRun({
    trades,
    afterTradeId: 12
  });

  assert.deepEqual(selected.map(trade => trade.tradeId), [12, 13]);
  assert.deepEqual(trades.map(trade => trade.tradeId), [10, 11, 12, 13]);
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
});
