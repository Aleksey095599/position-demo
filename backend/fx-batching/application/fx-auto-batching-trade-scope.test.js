"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  selectFxTradesForAutoBatchingRun
} = require("./fx-auto-batching-trade-scope");

test("selects only new incoming Trades and Carry-in Positions", () => {
  const trades = [
    { tradeId: 10, tradeType: "CLIENT_DEAL", currentFxPositionMode: "AUTO" },
    { tradeId: 11, tradeType: "HEDGE_DEAL", currentFxPositionMode: "AUTO" },
    { tradeId: 12, tradeType: "BATCH_POSITION_OUT", currentFxPositionMode: "AUTO" },
    { tradeId: 13, tradeType: "BATCH_BALANCE_TRADE", currentFxPositionMode: "AUTO" },
    { tradeId: 14, tradeType: "CLIENT_DEAL", currentFxPositionMode: "AUTO" },
    { tradeId: 15, tradeType: "BATCH_POSITION_OUT", currentFxPositionMode: "AUTO" }
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
      { tradeId: 10, tradeType: "BATCH_POSITION_OUT", currentFxPositionMode: "AUTO" },
      { tradeId: 11, tradeType: "CLIENT_DEAL", currentFxPositionMode: "AUTO" },
      { tradeId: 12, tradeType: "HEDGE_DEAL", currentFxPositionMode: "AUTO" }
    ],
    afterTradeId: 10,
    excludedTradeIds: [10, 12]
  });

  assert.deepEqual(selected.map(trade => trade.tradeId), [11]);
});

test("filters new Trades by configured Auto Batching Currency Pairs", () => {
  const selected = selectFxTradesForAutoBatchingRun({
    trades: [
      { tradeId: 11, tradeType: "CLIENT_DEAL", ccyPairCode: "EUR_USD", currentFxPositionMode: "AUTO" },
      { tradeId: 12, tradeType: "HEDGE_DEAL", ccyPairCode: "GBP_USD", currentFxPositionMode: "AUTO" },
      { tradeId: 13, tradeType: "BATCH_POSITION_OUT", ccyPairCode: "EUR_USD", currentFxPositionMode: "AUTO" }
    ],
    afterTradeId: 10,
    eligibleCcyPairCodes: ["EUR_USD"]
  });

  assert.deepEqual(selected.map(trade => trade.tradeId), [11, 13]);
});

test("uses current mode and admits reviewed Manual Trades across the run boundary", () => {
  const selected = selectFxTradesForAutoBatchingRun({
    trades: [
      {
        tradeId: 8,
        tradeType: "CLIENT_DEAL",
        initialFxPositionMode: "MANUAL",
        currentFxPositionMode: "MANUAL",
        receivedTimestamp: "2026-08-18T08:00:00.000Z"
      },
      {
        tradeId: 9,
        tradeType: "CLIENT_DEAL",
        initialFxPositionMode: "MANUAL",
        currentFxPositionMode: "AUTO",
        receivedTimestamp: "2026-08-18T08:01:00.000Z",
        positionManagementModeChangedAt: "2026-08-18T09:00:00.000Z"
      },
      {
        tradeId: 10,
        tradeType: "HEDGE_DEAL",
        initialFxPositionMode: "AUTO",
        currentFxPositionMode: "AUTO"
      },
      {
        tradeId: 12,
        tradeType: "HEDGE_DEAL",
        initialFxPositionMode: "AUTO",
        currentFxPositionMode: "AUTO"
      }
    ],
    afterTradeId: 10
  });

  assert.deepEqual(selected.map(trade => trade.tradeId), [9, 12]);
  assert.equal(selected[0].receivedTimestamp, "2026-08-18T09:00:00.000Z");
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
