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
    pricingContexts: [{ id: 7, defaultPositionManagementMode: "AUTO", autoHedgingAdmissionMode: "REVIEW_REQUIRED" }],
    clientPricingRules: [{ pricingRuleId: 9, marginPercent: 0.12, autoHedgingAdmissionModeOverride: "MANUAL_ONLY" }]
  });
  assert.equal(migrated.selectedCurrencyPair, "GBP/USD");
  assert.deepEqual(migrated.pricingContexts, [{
    id: 7, autoManagementAdmissionMode: "REVIEW_REQUIRED"
  }]);
  assert.deepEqual(migrated.clientPricingRules, [{
    pricingRuleId: 9, marginPercent: 0.12,
    autoManagementAdmissionModeOverride: "REVIEW_REQUIRED"
  }]);
  assert.deepEqual(loadBrowserDatabase(migrated), migrated);
});

test("current admission fields take precedence, including an explicit null override", () => {
  const migrated = loadBrowserDatabase({
    pricingContexts: [{ defaultPositionManagementMode: "AUTO", autoManagementAdmissionMode: "MANUAL_ONLY", autoHedgingAdmissionMode: "AUTO_IF_ELIGIBLE" }],
    clientPricingRules: [{ autoManagementAdmissionModeOverride: null, autoHedgingAdmissionModeOverride: "MANUAL_ONLY" }]
  });
  assert.equal(migrated.pricingContexts[0].autoManagementAdmissionMode, "REVIEW_REQUIRED");
  assert.equal(migrated.clientPricingRules[0].autoManagementAdmissionModeOverride, null);
  assert.equal(Object.hasOwn(migrated.pricingContexts[0], "autoHedgingAdmissionMode"), false);
  assert.equal(Object.hasOwn(migrated.clientPricingRules[0], "autoHedgingAdmissionModeOverride"), false);
});

test("stored manual-only settings become initial review requirements without losing inheritance", () => {
  const migrated = loadBrowserDatabase({
    pricingContexts: [
      { autoManagementAdmissionMode: "MANUAL_ONLY" },
      { autoHedgingAdmissionMode: "MANUAL_ONLY", defaultPositionManagementMode: "AUTO" },
      { autoManagementAdmissionMode: "AUTO_IF_ELIGIBLE" }
    ],
    clientPricingRules: [
      { autoManagementAdmissionModeOverride: "MANUAL_ONLY" },
      { autoManagementAdmissionModeOverride: "REVIEW_REQUIRED" },
      { autoManagementAdmissionModeOverride: null }
    ]
  });

  assert.deepEqual(migrated.pricingContexts, [
    { autoManagementAdmissionMode: "REVIEW_REQUIRED" },
    { autoManagementAdmissionMode: "REVIEW_REQUIRED" },
    { autoManagementAdmissionMode: "AUTO_IF_ELIGIBLE" }
  ]);
  assert.deepEqual(migrated.clientPricingRules, [
    { autoManagementAdmissionModeOverride: "REVIEW_REQUIRED" },
    { autoManagementAdmissionModeOverride: "REVIEW_REQUIRED" },
    { autoManagementAdmissionModeOverride: null }
  ]);
  assert.deepEqual(loadBrowserDatabase(migrated), migrated);
});

test("retired manual routing overrides migrate to Admission and are removed from browser settings", () => {
  const migrated = loadBrowserDatabase({
    clientPricingRules: [
      { positionManagementModeOverride: "MANUAL", autoManagementAdmissionModeOverride: null },
      { positionManagementModeOverride: "AUTO", effectivePositionManagementMode: "AUTO" }
    ]
  });
  assert.deepEqual(migrated.clientPricingRules, [
    { autoManagementAdmissionModeOverride: "REVIEW_REQUIRED" },
    { autoManagementAdmissionModeOverride: null }
  ]);
  assert.deepEqual(loadBrowserDatabase(migrated), migrated);
});
