"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  selectTradesForAutoBatchingRun
} = require("./auto-batching-trade-scope");

test("selects only new incoming Trades and Carry-in Positions", () => {
  const trades = [
    { tradeId: 10, tradeType: "CLIENT_DEAL", currentPositionManagementMode: "AUTO" },
    { tradeId: 11, tradeType: "HEDGE_DEAL", currentPositionManagementMode: "AUTO" },
    { tradeId: 12, tradeType: "BATCH_POSITION_OUT", currentPositionManagementMode: "AUTO" },
    { tradeId: 13, tradeType: "BATCH_BALANCE_TRADE", currentPositionManagementMode: "AUTO" },
    { tradeId: 14, tradeType: "CLIENT_DEAL", currentPositionManagementMode: "AUTO" },
    { tradeId: 15, tradeType: "BATCH_POSITION_OUT", currentPositionManagementMode: "AUTO" }
  ];
  const selected = selectTradesForAutoBatchingRun({
    trades,
    afterTradeId: 12
  });

  assert.deepEqual(selected.map(trade => trade.tradeId), [14, 15]);
  assert.deepEqual(trades.map(trade => trade.tradeId), [10, 11, 12, 13, 14, 15]);
});

test("removes explicitly excluded incoming Trades and Carry-in Positions", () => {
  const selected = selectTradesForAutoBatchingRun({
    trades: [
      { tradeId: 10, tradeType: "BATCH_POSITION_OUT", currentPositionManagementMode: "AUTO" },
      { tradeId: 11, tradeType: "CLIENT_DEAL", currentPositionManagementMode: "AUTO" },
      { tradeId: 12, tradeType: "HEDGE_DEAL", currentPositionManagementMode: "AUTO" }
    ],
    afterTradeId: 10,
    excludedTradeIds: [10, 12]
  });

  assert.deepEqual(selected.map(trade => trade.tradeId), [11]);
});

test("filters new Trades by configured Auto Batching Currency Pairs", () => {
  const selected = selectTradesForAutoBatchingRun({
    trades: [
      { tradeId: 11, tradeType: "CLIENT_DEAL", ccyPairCode: "EUR_USD", currentPositionManagementMode: "AUTO" },
      { tradeId: 12, tradeType: "HEDGE_DEAL", ccyPairCode: "GBP_USD", currentPositionManagementMode: "AUTO" },
      { tradeId: 13, tradeType: "BATCH_POSITION_OUT", ccyPairCode: "EUR_USD", currentPositionManagementMode: "AUTO" }
    ],
    afterTradeId: 10,
    eligibleCcyPairCodes: ["EUR_USD"]
  });

  assert.deepEqual(selected.map(trade => trade.tradeId), [11, 13]);
});

test("uses current mode and admits reviewed Manual Trades across the run boundary", () => {
  const selected = selectTradesForAutoBatchingRun({
    trades: [
      {
        tradeId: 8,
        tradeType: "CLIENT_DEAL",
        initialPositionManagementMode: "MANUAL",
        currentPositionManagementMode: "MANUAL",
        receivedTimestamp: "2026-08-18T08:00:00.000Z"
      },
      {
        tradeId: 9,
        tradeType: "CLIENT_DEAL",
        initialPositionManagementMode: "MANUAL",
        currentPositionManagementMode: "AUTO",
        receivedTimestamp: "2026-08-18T08:01:00.000Z",
        positionManagementModeChangedAt: "2026-08-18T09:00:00.000Z"
      },
      {
        tradeId: 10,
        tradeType: "HEDGE_DEAL",
        initialPositionManagementMode: "AUTO",
        currentPositionManagementMode: "AUTO"
      },
      {
        tradeId: 12,
        tradeType: "HEDGE_DEAL",
        initialPositionManagementMode: "AUTO",
        currentPositionManagementMode: "AUTO"
      }
    ],
    afterTradeId: 10
  });

  assert.deepEqual(selected.map(trade => trade.tradeId), [9, 12]);
  assert.equal(selected[0].receivedTimestamp, "2026-08-18T09:00:00.000Z");
});

test("rejects malformed Auto Batching run boundaries", () => {
  assert.throws(
    () => selectTradesForAutoBatchingRun({
      trades: [],
      afterTradeId: -1
    }),
    /non-negative safe integer/
  );
  assert.throws(
    () => selectTradesForAutoBatchingRun({
      trades: [],
      excludedTradeIds: [0]
    }),
    /positive integers/
  );
  assert.throws(
    () => selectTradesForAutoBatchingRun({
      trades: [],
      eligibleCcyPairCodes: []
    }),
    /non-empty collection/
  );
});
