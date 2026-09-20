"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  HEDGE_QUICK_MODE_PRESET_CODES,
  hedgeQuickModeInstruction,
  hedgeQuickModePresets
} = require("./hedge-quick-mode");

const settings = {
  ccyPairCode: "EUR_USD",
  baseCcyCode: "EUR",
  pricingRuleId: 41,
  defaultTenor: "TOD",
  baseCcyFractionDigits: 2,
  smallBaseCcyAmountMinor: 500_000_000,
  mediumBaseCcyAmountMinor: 2_000_000_000,
  largeBaseCcyAmountMinor: 5_000_000_000,
  xlargeBaseCcyAmountMinor: 10_000_000_000
};

test("Hedge Quick Mode exposes the four ordered preset codes", () => {
  assert.deepEqual(
    HEDGE_QUICK_MODE_PRESET_CODES,
    ["SMALL", "MEDIUM", "LARGE", "XLARGE"]
  );
  assert.deepEqual(
    hedgeQuickModePresets(settings).map(item => item.baseCcyAmount),
    ["5000000.00", "20000000.00", "50000000.00", "100000000.00"]
  );
});

test("Hedge Quick Mode resolves only the server-side configured amount and rule", () => {
  assert.deepEqual(
    hedgeQuickModeInstruction({
      settings,
      presetCode: "medium",
      side: "BUY",
      tenor: "SPOT"
    }),
    {
      pricingRuleId: 41,
      ccyPairCode: "EUR_USD",
      side: "BUY",
      dealtCcyCode: "EUR",
      dealtCcyAmount: "20000000.00",
      tenor: "SPOT"
    }
  );
});

test("Hedge Quick Mode uses the configured default tenor when none is supplied", () => {
  assert.equal(
    hedgeQuickModeInstruction({
      settings,
      presetCode: "small",
      side: "SELL"
    }).tenor,
    "TOD"
  );
});

test("Hedge Quick Mode rejects an unknown preset", () => {
  assert.throws(
    () => hedgeQuickModeInstruction({
      settings,
      presetCode: "CUSTOM",
      side: "SELL",
      tenor: "TOD"
    }),
    /Preset Code/
  );
});

test("Hedge Quick Mode rejects unordered configured amounts defensively", () => {
  assert.throws(
    () => hedgeQuickModePresets({
      ...settings,
      largeBaseCcyAmountMinor: settings.mediumBaseCcyAmountMinor
    }),
    /strictly increasing/
  );
});
