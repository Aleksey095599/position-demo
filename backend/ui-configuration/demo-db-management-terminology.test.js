"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.resolve(__dirname, "../../demo-db.js"), "utf8");

function loadBrowserDatabase(saved) {
  const entries = new Map([["batching-demo.database.v6", JSON.stringify(saved)]]);
  const window = {
    localStorage: {
      getItem: key => entries.get(key) ?? null,
      setItem: (key, value) => entries.set(key, value),
      removeItem: key => entries.delete(key)
    }
  };
  vm.runInNewContext(source, { window });
  return JSON.parse(entries.get("batching-demo.database.v6"));
}

test("browser storage preserves admission choices when migrating legacy field names", () => {
  const migrated = loadBrowserDatabase({
    selectedCurrencyPair: "GBP/USD",
    pricingContexts: [{ id: 7, defaultPositionManagementMode: "AUTO", autoHedgingAdmissionMode: "MANUAL" }],
    clientPricingRules: [{ pricingRuleId: 9, marginPercent: 0.12, autoHedgingAdmissionModeOverride: "MANUAL_ONLY" }]
  });
  assert.equal(migrated.selectedCurrencyPair, "GBP/USD");
  assert.deepEqual(migrated.pricingContexts, [{
    id: 7, positionManagementMode: "MANUAL"
  }]);
  assert.deepEqual(migrated.clientPricingRules, [{
    pricingRuleId: 9, marginPercent: 0.12,
    positionManagementModeOverride: "MANUAL"
  }]);
  assert.deepEqual(loadBrowserDatabase(migrated), migrated);
});

test("current admission fields take precedence, including an explicit null override", () => {
  const migrated = loadBrowserDatabase({
    pricingContexts: [{ defaultPositionManagementMode: "AUTO", positionManagementMode: "MANUAL_ONLY", autoHedgingAdmissionMode: "AUTO_IF_ELIGIBLE" }],
    clientPricingRules: [{ positionManagementModeOverride: null, autoHedgingAdmissionModeOverride: "MANUAL_ONLY" }]
  });
  assert.equal(migrated.pricingContexts[0].positionManagementMode, "MANUAL");
  assert.equal(migrated.clientPricingRules[0].positionManagementModeOverride, null);
  assert.equal(Object.hasOwn(migrated.pricingContexts[0], "autoHedgingAdmissionMode"), false);
  assert.equal(Object.hasOwn(migrated.clientPricingRules[0], "autoHedgingAdmissionModeOverride"), false);
});

test("stored manual-only settings become Manual mode without losing inheritance", () => {
  const migrated = loadBrowserDatabase({
    pricingContexts: [
      { positionManagementMode: "MANUAL_ONLY" },
      { autoHedgingAdmissionMode: "MANUAL_ONLY", defaultPositionManagementMode: "AUTO" },
      { positionManagementMode: "AUTO_IF_ELIGIBLE" }
    ],
    clientPricingRules: [
      { positionManagementModeOverride: "MANUAL_ONLY" },
      { positionManagementModeOverride: "MANUAL" },
      { positionManagementModeOverride: null }
    ]
  });

  assert.deepEqual(migrated.pricingContexts, [
    { positionManagementMode: "MANUAL" },
    { positionManagementMode: "MANUAL" },
    { positionManagementMode: "AUTO_IF_ELIGIBLE" }
  ]);
  assert.deepEqual(migrated.clientPricingRules, [
    { positionManagementModeOverride: "MANUAL" },
    { positionManagementModeOverride: "MANUAL" },
    { positionManagementModeOverride: null }
  ]);
  assert.deepEqual(loadBrowserDatabase(migrated), migrated);
});

test("legacy admission settings migrate to Position Management Mode", () => {
  const migrated = loadBrowserDatabase({
    clientPricingRules: [
      { autoManagementAdmissionModeOverride: "REVIEW_REQUIRED" },
      { autoManagementAdmissionModeOverride: null, effectiveAutoManagementAdmissionMode: "AUTO_IF_ELIGIBLE" }
    ]
  });
  assert.deepEqual(migrated.clientPricingRules, [
    { positionManagementModeOverride: "MANUAL" },
    { positionManagementModeOverride: null }
  ]);
  assert.deepEqual(loadBrowserDatabase(migrated), migrated);
});
