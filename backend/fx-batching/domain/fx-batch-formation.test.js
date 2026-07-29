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
  assert.equal(result.balanceTrade.tradeRate, 1.1223);
  assert.equal(result.balanceTrade.quoteCcyAmountMinor, 33669000n);
  assert.equal(result.balanceTrade.quoteCcyFractionDigits, 2);
  assert.equal(result.roundingResidualQuoteAmountMinor, 0n);
  assert.equal(result.positionOut.tradeType, "BATCH_POSITION_OUT");
  assert.equal(result.positionOut.side, "SELL");
  assert.equal(result.positionOut.dealtCcyCode, "EUR");
  assert.equal(result.positionOut.baseCcyAmountMinor, 30000000n);
  assert.equal(result.positionOut.tradeRate, result.balanceTrade.tradeRate);
  assert.equal(
    result.positionOut.quoteCcyAmountMinor,
    result.balanceTrade.quoteCcyAmountMinor
  );
  assert.equal(result.netQuoteCcyAmountMinorBeforeCash, -7000n);
  assert.deepEqual(result.quoteCashOut, {
    tradeType: "BATCH_QUOTE_CASH_OUT",
    memberRole: "BALANCE_QUOTE_CASH",
    quoteCcyCode: "USD",
    quoteBalanceContributionMinor: 7000n,
    quoteCcyFractionDigits: 2,
    quoteCcyValueDate: "2026-07-24",
    createdAt: "2026-07-24T14:00:00.000Z"
  });
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

test("uses the Base-weighted Transfer Rate of the side causing a SELL imbalance", () => {
  const result = formFxBatch({
    trades: [
      {
        ...commonTerms,
        tradeId: 12,
        side: "SELL",
        baseCcyAmountMinor: 100000000n,
        quoteCcyAmountMinor: 110000000n,
        transferRate: 1.1
      },
      {
        ...commonTerms,
        tradeId: 13,
        side: "SELL",
        baseCcyAmountMinor: 50000000n,
        quoteCcyAmountMinor: 65000000n,
        transferRate: 1.3
      },
      {
        ...commonTerms,
        tradeId: 14,
        side: "BUY",
        baseCcyAmountMinor: 120000000n,
        quoteCcyAmountMinor: 144000000n,
        transferRate: 1.2
      }
    ],
    now: fixedNow
  });

  assert.equal(result.sourceNetSide, "SELL");
  assert.equal(result.sourceNetBaseCcyAmountMinor, 30000000n);
  assert.equal(result.balanceTrade.side, "BUY");
  assert.equal(result.positionOut.side, "SELL");
  assert.equal(result.balanceTrade.tradeRate, 1.1667);
  assert.equal(result.balanceTrade.quoteCcyAmountMinor, 35001000n);
  assert.equal(result.positionOut.tradeRate, result.balanceTrade.tradeRate);
  assert.equal(
    result.positionOut.quoteCcyAmountMinor,
    result.balanceTrade.quoteCcyAmountMinor
  );
});

test("uses the Base-weighted Transfer Rate of the side causing a BUY imbalance", () => {
  const result = formFxBatch({
    trades: [
      {
        ...commonTerms,
        tradeId: 15,
        side: "SELL",
        baseCcyAmountMinor: 30000000n,
        quoteCcyAmountMinor: 36000000n,
        transferRate: 1.2
      },
      {
        ...commonTerms,
        tradeId: 16,
        side: "BUY",
        baseCcyAmountMinor: 100000000n,
        quoteCcyAmountMinor: 110000000n,
        transferRate: 1.1
      },
      {
        ...commonTerms,
        tradeId: 17,
        side: "BUY",
        baseCcyAmountMinor: 50000000n,
        quoteCcyAmountMinor: 65000000n,
        transferRate: 1.3
      }
    ],
    now: fixedNow
  });

  assert.equal(result.sourceNetSide, "BUY");
  assert.equal(result.sourceNetBaseCcyAmountMinor, 120000000n);
  assert.equal(result.balanceTrade.side, "SELL");
  assert.equal(result.positionOut.side, "BUY");
  assert.equal(result.balanceTrade.tradeRate, 1.1667);
  assert.equal(result.balanceTrade.quoteCcyAmountMinor, 140004000n);
  assert.equal(result.positionOut.tradeRate, result.balanceTrade.tradeRate);
  assert.equal(
    result.positionOut.quoteCcyAmountMinor,
    result.balanceTrade.quoteCcyAmountMinor
  );
});

test("forms an ideal flat batch without technical trades", () => {
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
  assert.equal(result.sourceNetTransferQuoteAmountMinor, 0n);
  assert.equal(result.balanceTrade, null);
  assert.equal(result.positionOut, null);
  assert.equal(result.netQuoteCcyAmountMinorBeforeCash, 0n);
  assert.equal(result.quoteCashOut.quoteBalanceContributionMinor, 0n);
});

test("forms a flat Base batch regardless of its Quote cash imbalance", () => {
  const result = formFxBatch({
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
  });

  assert.equal(result.sourceNetSide, "FLAT");
  assert.equal(result.sourceNetBaseCcyAmountMinor, 0n);
  assert.equal(result.sourceNetTransferQuoteAmountMinor, 100000n);
  assert.equal(result.balanceTrade, null);
  assert.equal(result.positionOut, null);
  assert.equal(result.netQuoteCcyAmountMinorBeforeCash, -100000n);
  assert.equal(result.quoteCashOut.tradeType, "BATCH_QUOTE_CASH_OUT");
  assert.equal(result.quoteCashOut.quoteBalanceContributionMinor, 100000n);
});

test("accepts an upstream Position Out as an ordinary batch source", () => {
  const result = formFxBatch({
    trades: [
      {
        ...commonTerms,
        tradeId: 24,
        tradeType: "BATCH_POSITION_OUT",
        side: "SELL",
        baseCcyAmountMinor: 10000000n,
        quoteCcyAmountMinor: 11200000n,
        transferRate: 1.12
      },
      {
        ...commonTerms,
        tradeId: 25,
        side: "BUY",
        baseCcyAmountMinor: 10000000n,
        quoteCcyAmountMinor: 11300000n,
        transferRate: 1.13
      }
    ],
    now: fixedNow
  });

  assert.deepEqual(result.sourceTradeIds, [24, 25]);
  assert.equal(result.sourceNetSide, "FLAT");
  assert.equal(result.balanceTrade, null);
  assert.equal(result.positionOut, null);
});

test("accepts an upstream Balance Trade as an ordinary batch source", () => {
  const result = formFxBatch({
    trades: [
      {
        ...commonTerms,
        tradeId: 26,
        tradeType: "BATCH_BALANCE_TRADE",
        side: "BUY",
        baseCcyAmountMinor: 10000000n,
        quoteCcyAmountMinor: 11200000n,
        transferRate: 1.12
      },
      {
        ...commonTerms,
        tradeId: 27,
        side: "SELL",
        baseCcyAmountMinor: 10000000n,
        quoteCcyAmountMinor: 11300000n,
        transferRate: 1.13
      }
    ],
    now: fixedNow
  });

  assert.deepEqual(result.sourceTradeIds, [26, 27]);
  assert.equal(result.sourceNetSide, "FLAT");
  assert.equal(result.balanceTrade, null);
  assert.equal(result.positionOut, null);
});

test("accepts any FX trade type when the trade has a positive Transfer Rate", () => {
  const result = formFxBatch({
    trades: [{
      ...commonTerms,
      tradeId: 28,
      tradeType: "FUTURE_FX_TRADE",
      side: "SELL",
      baseCcyAmountMinor: 10000000n,
      quoteCcyAmountMinor: 11200000n,
      transferRate: 1.12
    }],
    now: fixedNow
  });

  assert.deepEqual(result.sourceTradeIds, [28]);
  assert.equal(result.balanceTrade.tradeType, "BATCH_BALANCE_TRADE");
});

test("rejects any FX trade without a positive Transfer Rate", () => {
  for (const transferRate of [null, 0, -1]) {
    assert.throws(
      () => formFxBatch({
        trades: [{
          ...commonTerms,
          tradeId: 29,
          tradeType: "FUTURE_FX_TRADE",
          side: "SELL",
          baseCcyAmountMinor: 10000000n,
          quoteCcyAmountMinor: 11200000n,
          transferRate
        }],
        now: fixedNow
      }),
      error => error.code === "INVALID_BATCH_SOURCE_TRADE"
    );
  }
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
