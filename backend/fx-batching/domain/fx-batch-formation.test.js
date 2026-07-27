"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  formFxBatch
} = require("./fx-batch-formation");

const fixedNow = () => new Date("2026-07-24T14:00:00.000Z");
const commonTerms = {
  tradeType: "CLIENT_DEAL",
  ccyPairCode: "EUR_USD",
  baseCcyCode: "EUR",
  quoteCcyCode: "USD",
  dealtCcyCode: "EUR",
  baseCcyFractionDigits: 2,
  quoteCcyFractionDigits: 2,
  tradeDate: "2026-07-24",
  tenor: "TOD",
  baseCcyValueDate: "2026-07-24",
  quoteCcyValueDate: "2026-07-24"
};

test("creates the expected mirrored pair for Trade IDs 5 and 16", () => {
  const result = formFxBatch({
    trades: [
      {
        ...commonTerms,
        tradeId: 5,
        side: "SELL",
        baseCcyAmountMinor: 100000000n,
        quoteCcyAmountMinor: 112230000n,
        transferRate: 1.1223
      },
      {
        ...commonTerms,
        tradeId: 16,
        side: "BUY",
        dealtCcyCode: "USD",
        baseCcyAmountMinor: 70000000n,
        quoteCcyAmountMinor: 78554000n,
        transferRate: 1.1222
      }
    ],
    now: fixedNow
  });

  assert.deepEqual(result.sourceTradeIds, [5, 16]);
  assert.equal(result.sourceNetSide, "SELL");
  assert.equal(result.sourceNetBaseCcyAmountMinor, 30000000n);
  assert.equal(result.sourceNetBaseCcyFractionDigits, 2);
  assert.equal(result.sourceNetTransferQuoteAmountMinor, 33676000n);
  assert.equal(result.balanceTrade.tradeType, "BATCH_BALANCE_TRADE");
  assert.equal(result.balanceTrade.side, "BUY");
  assert.equal(result.balanceTrade.dealtCcyCode, "EUR");
  assert.equal(result.balanceTrade.baseCcyAmountMinor, 30000000n);
  assert.equal(result.balanceTrade.baseCcyFractionDigits, 2);
  assert.equal(result.balanceTrade.tradeRate, 1.1225);
  assert.equal(result.balanceTrade.quoteCcyAmountMinor, 33675000n);
  assert.equal(result.balanceTrade.quoteCcyFractionDigits, 2);
  assert.equal(result.roundingResidualQuoteAmountMinor, 1000n);
  assert.equal(result.positionOut.tradeType, "BATCH_POSITION_OUT");
  assert.equal(result.positionOut.side, "SELL");
  assert.equal(result.positionOut.dealtCcyCode, "EUR");
  assert.equal(result.positionOut.baseCcyAmountMinor, 30000000n);
  assert.equal(result.positionOut.tradeRate, result.balanceTrade.tradeRate);
  assert.equal(
    result.positionOut.quoteCcyAmountMinor,
    result.balanceTrade.quoteCcyAmountMinor
  );
});

test("supports a selection containing trades in one direction", () => {
  const result = formFxBatch({
    trades: [
      {
        ...commonTerms,
        tradeId: 10,
        side: "BUY",
        baseCcyAmountMinor: 20000000n,
        quoteCcyAmountMinor: 22400000n,
        transferRate: 1.12
      },
      {
        ...commonTerms,
        tradeId: 11,
        side: "BUY",
        baseCcyAmountMinor: 30000000n,
        quoteCcyAmountMinor: 33900000n,
        transferRate: 1.13
      }
    ],
    now: fixedNow
  });

  assert.equal(result.sourceNetSide, "BUY");
  assert.equal(result.balanceTrade.side, "SELL");
  assert.equal(result.positionOut.side, "BUY");
  assert.equal(result.balanceTrade.baseCcyAmountMinor, 50000000n);
  assert.equal(result.balanceTrade.tradeRate, 1.126);
});

test("forms an ideal flat batch without an unnecessary balance trade", () => {
  const result = formFxBatch({
    trades: [
      {
        ...commonTerms,
        tradeId: 20,
        side: "BUY",
        baseCcyAmountMinor: 10000000n,
        quoteCcyAmountMinor: 11200000n,
        transferRate: 1.12
      },
      {
        ...commonTerms,
        tradeId: 21,
        side: "SELL",
        baseCcyAmountMinor: 10000000n,
        quoteCcyAmountMinor: 11200000n,
        transferRate: 1.12
      }
    ],
    now: fixedNow
  });

  assert.equal(result.sourceNetSide, "FLAT");
  assert.equal(result.sourceNetBaseCcyAmountMinor, 0n);
  assert.equal(result.balanceTrade, null);
  assert.equal(result.positionOut.tradeType, "BATCH_POSITION_OUT");
  assert.equal(result.positionOut.side, "FLAT");
  assert.equal(result.positionOut.baseCcyAmountMinor, 0n);
  assert.equal(result.positionOut.quoteCcyAmountMinor, 0n);
  assert.equal(result.positionOut.tradeRate, null);
});

test("requires the future quote cash balancer for a flat base with non-zero cash", () => {
  assert.throws(
    () => formFxBatch({
      trades: [
        {
          ...commonTerms,
          tradeId: 22,
          side: "BUY",
          baseCcyAmountMinor: 10000000n,
          quoteCcyAmountMinor: 11200000n,
          transferRate: 1.12
        },
        {
          ...commonTerms,
          tradeId: 23,
          side: "SELL",
          baseCcyAmountMinor: 10000000n,
          quoteCcyAmountMinor: 11300000n,
          transferRate: 1.13
        }
      ],
      now: fixedNow
    }),
    error => error.code === "BATCH_QUOTE_CASH_BALANCER_REQUIRED"
  );
});

test("rejects trades from different settlement buckets", () => {
  assert.throws(
    () => formFxBatch({
      trades: [
        {
          ...commonTerms,
          tradeId: 30,
          side: "SELL",
          baseCcyAmountMinor: 10000000n,
          quoteCcyAmountMinor: 11200000n,
          transferRate: 1.12
        },
        {
          ...commonTerms,
          tradeId: 31,
          side: "BUY",
          baseCcyAmountMinor: 5000000n,
          quoteCcyAmountMinor: 5600000n,
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

test("rejects source trades with different recorded currency precision", () => {
  assert.throws(
    () => formFxBatch({
      trades: [
        {
          ...commonTerms,
          tradeId: 32,
          side: "SELL",
          baseCcyAmountMinor: 10000000n,
          quoteCcyAmountMinor: 11200000n,
          transferRate: 1.12
        },
        {
          ...commonTerms,
          tradeId: 33,
          side: "BUY",
          baseCcyAmountMinor: 50000000n,
          baseCcyFractionDigits: 3,
          quoteCcyAmountMinor: 5600000n,
          transferRate: 1.12
        }
      ],
      now: fixedNow
    }),
    error => error.code === "INCOMPATIBLE_BATCH_SELECTION"
  );
});

test("preserves non-standard currency precision without floating-point amounts", () => {
  const result = formFxBatch({
    trades: [{
      ...commonTerms,
      tradeId: 40,
      ccyPairCode: "BHD_JPY",
      baseCcyCode: "BHD",
      quoteCcyCode: "JPY",
      dealtCcyCode: "JPY",
      baseCcyAmountMinor: 1001n,
      baseCcyFractionDigits: 3,
      quoteCcyAmountMinor: 150n,
      quoteCcyFractionDigits: 0,
      side: "SELL",
      transferRate: "150.005"
    }],
    rateFractionDigits: 3,
    now: fixedNow
  });

  assert.equal(result.sourceNetBaseCcyAmountMinor, 1001n);
  assert.equal(result.sourceNetBaseCcyFractionDigits, 3);
  assert.equal(result.balanceTrade.dealtCcyCode, "BHD");
  assert.equal(result.balanceTrade.baseCcyAmountMinor, 1001n);
  assert.equal(result.balanceTrade.baseCcyFractionDigits, 3);
  assert.equal(result.balanceTrade.quoteCcyAmountMinor, 150n);
  assert.equal(result.balanceTrade.quoteCcyFractionDigits, 0);
  assert.equal(result.balanceTrade.tradeRate, 150.005);
});
