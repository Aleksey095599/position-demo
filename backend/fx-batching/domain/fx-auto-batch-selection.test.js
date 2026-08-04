"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  selectNextAutoBatchTradeIds
} = require("./fx-auto-batch-selection");

function trade(overrides = {}) {
  return {
    tradeId: 1,
    tradeType: "CLIENT_DEAL",
    entryTimestamp: "2026-08-04T09:00:00.000Z",
    ccyPairCode: "EUR_USD",
    side: "SELL",
    transferRate: 1.12,
    tradeDate: "2026-08-04",
    tenor: "TOD",
    baseCcyValueDate: "2026-08-04",
    quoteCcyValueDate: "2026-08-04",
    baseCcyFractionDigits: 2,
    quoteCcyFractionDigits: 2,
    ...overrides
  };
}

test("selects every eligible trade from the oldest settlement bucket", () => {
  const selected = selectNextAutoBatchTradeIds([
    trade({ tradeId: 4, ccyPairCode: "GBP_USD" }),
    trade({ tradeId: 3, entryTimestamp: "2026-08-04T09:00:01.000Z" }),
    trade({ tradeId: 2, transferRate: null }),
    trade({ tradeId: 1 })
  ]);

  assert.deepEqual(selected, [1, 3]);
});

test("keeps distinct settlement buckets in separate automatic batches", () => {
  const selected = selectNextAutoBatchTradeIds([
    trade({ tradeId: 1 }),
    trade({
      tradeId: 2,
      entryTimestamp: "2026-08-04T09:00:01.000Z",
      quoteCcyValueDate: "2026-08-06"
    })
  ]);

  assert.deepEqual(selected, [1]);
});

test("does not create an endless automatic chain from a lone Position Out", () => {
  assert.deepEqual(selectNextAutoBatchTradeIds([
    trade({ tradeId: 8, tradeType: "BATCH_POSITION_OUT" })
  ]), []);

  assert.deepEqual(selectNextAutoBatchTradeIds([
    trade({ tradeId: 8, tradeType: "BATCH_POSITION_OUT" }),
    trade({ tradeId: 9, tradeType: "CLIENT_DEAL" })
  ]), [8, 9]);
});
