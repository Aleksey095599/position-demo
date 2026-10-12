"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const runtime = fs.readFileSync(path.join(root, "frontend/app/core/runtime.js"), "utf8");
const page = fs.readFileSync(path.join(root, "frontend/features/counterparties/counterparties.page.js"), "utf8");

function functionSource(source, name) {
  const start = source.indexOf(`    function ${name}(`);
  assert.ok(start >= 0, name);
  const end = source.indexOf("\n    }", start);
  return source.slice(start, end + 6);
}

test("UI keeps contexts differing only by purpose and does not guess an ambiguous legacy context", () => {
  const sandbox = vm.createContext({
    DEFAULT_PRICING_CONTEXTS: [],
    NOT_APPLICABLE_ACCOUNTING_SYSTEM_ID: "NOT_APPLICABLE",
    MANUAL_CLIENT_DEAL_ENTRY_CHANNEL_ID: "MANUAL_CLIENT_DEAL_ENTRY",
    normalizedContextCode: value => String(value ?? "").trim().toUpperCase(),
    normalizedTradeCaptureChannelId: value => value,
    normalizedPositionManagementModeSetting: value => value,
    isValidServicingLocationId: value => Boolean(value)
  });
  for (const name of ["normalizedIntegerId", "pricingContextNaturalKey", "normalizedPricingContexts", "pricingContextIdForComponents"]) {
    vm.runInContext(functionSource(runtime, name), sandbox);
  }
  vm.runInContext(functionSource(page, "samePricingContextIdentity"), sandbox);
  sandbox.input = ["CLIENT_CONVERSION", "POSITION_HEDGING"].map((tradePurposeId, index) => ({
    tradeContextId: index + 1,
    servicingLocationId: "001",
    accountingSystemId: "AFINA",
    originatingSystemId: "RFQ",
    tradePurposeId,
    positionManagementMode: "MANUAL"
  }));
  vm.runInContext("var pricingContexts = normalizedPricingContexts(input);", sandbox);
  assert.equal(sandbox.pricingContexts.length, 2);
  assert.equal(vm.runInContext("samePricingContextIdentity(pricingContexts[0], pricingContexts[1])", sandbox), false);
  assert.equal(vm.runInContext("pricingContextIdForComponents('001','AFINA','RFQ')", sandbox), "");
  assert.equal(vm.runInContext("pricingContextIdForComponents('001','AFINA','RFQ','POSITION_HEDGING')", sandbox), "2");
});

test("Trade Purpose drilldown selects the purpose filter", () => {
  const source = fs.readFileSync(path.join(root, "frontend/features/position/position.page.js"), "utf8");
  const start = source.indexOf("    const PRICING_CONTEXT_REFERENCE_FILTERS");
  const end = source.indexOf("\n    });", start) + 8;
  const sandbox = vm.createContext({});
  vm.runInContext(source.slice(start, end) + "\n" + functionSource(source, "pricingRoute"), sandbox);
  assert.equal(vm.runInContext("pricingRoute('tradePurpose','POSITION_HEDGING')", sandbox),
    "#trade-context?trade-purpose=POSITION_HEDGING");
});
