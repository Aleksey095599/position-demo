"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  analyticalPnlSummary
} = require("./analytical-pnl-summary");

test("calculates net PnL and volume-weighted average margin by quote currency", () => {
  const summary = analyticalPnlSummary([
    {
      quoteCcyCode: "USD",
      quoteCcyAmountMinor: 10000000,
      quoteCcyFractionDigits: 2,
      analyticalPnlQuoteMinor: 20000,
      analyticalPnlQuoteFractionDigits: 2
    },
    {
      quoteCcyCode: "USD",
      quoteCcyAmountMinor: 20000000,
      quoteCcyFractionDigits: 2,
      analyticalPnlQuoteMinor: 30000,
      analyticalPnlQuoteFractionDigits: 2
    },
    {
      quoteCcyCode: "KZT",
      quoteCcyAmountMinor: 100000000,
      quoteCcyFractionDigits: 2,
      analyticalPnlQuoteMinor: -500000,
      analyticalPnlQuoteFractionDigits: 2
    }
  ]);

  assert.equal(summary.dealCount, 3);
  assert.equal(summary.dealsWithPnlCount, 3);
  assert.deepEqual(summary.totals, [
    {
      quoteCcyCode: "KZT",
      analyticalPnlQuoteMinor: "-500000",
      analyticalPnlQuoteFractionDigits: 2,
      quoteCcyAmountMinor: "100000000",
      quoteCcyFractionDigits: 2,
      weightedAverageMarginPercent: "-0.5000"
    },
    {
      quoteCcyCode: "USD",
      analyticalPnlQuoteMinor: "50000",
      analyticalPnlQuoteFractionDigits: 2,
      quoteCcyAmountMinor: "30000000",
      quoteCcyFractionDigits: 2,
      weightedAverageMarginPercent: "0.1667"
    }
  ]);
});

test("excludes deals without calculated PnL from both sides of the ratio", () => {
  const summary = analyticalPnlSummary([
    {
      quoteCcyCode: "USD",
      quoteCcyAmountMinor: 100000,
      quoteCcyFractionDigits: 2,
      analyticalPnlQuoteMinor: 100,
      analyticalPnlQuoteFractionDigits: 2
    },
    {
      quoteCcyCode: "USD",
      quoteCcyAmountMinor: 900000,
      quoteCcyFractionDigits: 2,
      analyticalPnlQuoteMinor: null,
      analyticalPnlQuoteFractionDigits: null
    }
  ]);

  assert.equal(summary.dealCount, 2);
  assert.equal(summary.dealsWithPnlCount, 1);
  assert.equal(summary.dealsWithoutPnlCount, 1);
  assert.equal(summary.totals[0].weightedAverageMarginPercent, "0.1000");
  assert.equal(summary.totals[0].quoteCcyAmountMinor, "100000");
});

test("normalizes historical currency precision before aggregation", () => {
  const summary = analyticalPnlSummary([
    {
      quoteCcyCode: "USD",
      quoteCcyAmountMinor: 100,
      quoteCcyFractionDigits: 2,
      analyticalPnlQuoteMinor: 1,
      analyticalPnlQuoteFractionDigits: 2
    },
    {
      quoteCcyCode: "USD",
      quoteCcyAmountMinor: 1000,
      quoteCcyFractionDigits: 3,
      analyticalPnlQuoteMinor: 10,
      analyticalPnlQuoteFractionDigits: 3
    }
  ]);

  assert.equal(summary.totals[0].analyticalPnlQuoteMinor, "20");
  assert.equal(summary.totals[0].analyticalPnlQuoteFractionDigits, 3);
  assert.equal(summary.totals[0].quoteCcyAmountMinor, "2000");
  assert.equal(summary.totals[0].quoteCcyFractionDigits, 3);
  assert.equal(summary.totals[0].weightedAverageMarginPercent, "1.0000");
});
