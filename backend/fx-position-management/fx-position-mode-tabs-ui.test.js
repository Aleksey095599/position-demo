"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..", "..");
const HTML_PATH = path.join(ROOT, "index.html");
const SERVER_PATH = path.join(ROOT, "server.js");
const html = fs.readFileSync(HTML_PATH, "utf8");
const serverSource = fs.readFileSync(SERVER_PATH, "utf8");
const scripts = [...html.matchAll(/<script(?:[^>]*)>([\s\S]*?)<\/script>/g)];
const inlineScript = scripts.at(-1)?.[1] || "";
const fxPositionPageMarkup = html.match(
  /<main class="shell fx-position-bootstrap workbench-page" id="mainPage"[\s\S]*?<\/main>/
)?.[0] || "";
const fxPositionGridMarkup = fxPositionPageMarkup.match(
  /<table\b[^>]*class="[^"]*\bfx-position-grid\b[^"]*"[^>]*>[\s\S]*?<\/table>/
)?.[0] || "";

function elementMarkup(id, tagName) {
  const expression = new RegExp(
    `<${tagName}\\b[^>]*\\bid="${id}"[^>]*>[\\s\\S]*?<\\/${tagName}>`
  );
  return html.match(expression)?.[0] || "";
}

function topLevelFunctionSource(name) {
  const asyncMarker = `async function ${name}(`;
  const marker = inlineScript.includes(asyncMarker)
    ? asyncMarker
    : `function ${name}(`;
  const start = inlineScript.indexOf(marker);
  assert.notEqual(start, -1, `Expected inline function ${name}.`);
  const remainingSource = inlineScript.slice(start + marker.length);
  const nextFunctionMatch = /\n    (?:async )?function [A-Za-z_$][\w$]*\s*\(/.exec(remainingSource);
  const end = nextFunctionMatch
    ? start + marker.length + nextFunctionMatch.index
    : inlineScript.length;
  return inlineScript.slice(start, end).trim();
}

function normalizedMode(value, fallback = "MANUAL") {
  const mode = String(value || "").trim().toUpperCase();
  const fallbackMode = String(fallback || "").trim().toUpperCase();

  if (["MANUAL", "AUTO"].includes(mode)) {
    return mode;
  }

  return ["MANUAL", "AUTO"].includes(fallbackMode) ? fallbackMode : "MANUAL";
}

test("Manual Control and Auto Batching & Hedging routes control one shared FX Position grid", () => {
  const tabsMarkup = elementMarkup("fxPositionModeTabs", "nav");
  const manualTabMarkup = elementMarkup("fxPositionManualTab", "a");
  const autoTabMarkup = elementMarkup("fxPositionAutoTab", "a");
  const sharedPanelMarkup = elementMarkup("fxPositionGridPanel", "section");

  assert.match(tabsMarkup, /role="tablist"/);
  assert.match(manualTabMarkup, /href="#fx-position:manual"/);
  assert.match(manualTabMarkup, /data-fx-position-mode="MANUAL"/);
  assert.match(manualTabMarkup, /aria-controls="fxPositionGridPanel"/);
  assert.match(manualTabMarkup, />Manual Control</);
  assert.match(manualTabMarkup, /id="fxPositionManualCount"/);
  assert.match(autoTabMarkup, /href="#fx-position:auto"/);
  assert.match(autoTabMarkup, /data-fx-position-mode="AUTO"/);
  assert.match(autoTabMarkup, /aria-controls="fxPositionGridPanel"/);
  assert.match(autoTabMarkup, />Auto Batching &amp; Hedging</);
  assert.match(autoTabMarkup, /id="fxPositionAutoCount"/);
  assert.match(sharedPanelMarkup, /role="tabpanel"/);

  assert.equal(
    (fxPositionPageMarkup.match(/<table\b[^>]*\bfx-position-grid\b/g) || []).length,
    1
  );
  assert.equal((fxPositionPageMarkup.match(/\bid="dealRows"/g) || []).length, 1);
  assert.ok(fxPositionGridMarkup.includes('id="dealRows"'));
  assert.doesNotMatch(
    fxPositionGridMarkup,
    /data-ui-column-key="(?:fx_)?position_management_mode"|>\s*FX Position Mode\s*</i
  );
});

test("Manual Control exposes an explicit confirmation before sending Trades to Auto", () => {
  const buttonMarkup = elementMarkup("sendToAutoPositionModeButton", "button");
  const dialogMarkup = elementMarkup("sendToAutoPositionModeDialog", "dialog");

  assert.match(buttonMarkup, /class="[^"]*\bbtn-outline-secondary\b[^"]*"/);
  assert.match(buttonMarkup, /disabled/);
  assert.match(buttonMarkup, /aria-label="Send selected Trades to Auto Batching &amp; Hedging"/);
  assert.match(buttonMarkup, />Send to Auto</);
  assert.match(dialogMarkup, /id="sendToAutoPositionModeDialogTitle"/);
  assert.doesNotMatch(dialogMarkup, /Initial FX Position Mode|Current FX Position Mode/);
  assert.match(dialogMarkup, /id="sendToAutoPositionModeConfirmButton"/);
});

test("route helpers preserve the legacy Manual default and explicit mode state", () => {
  const fxPositionRoute = new Function(
    "normalizedPositionManagementMode",
    `${topLevelFunctionSource("fxPositionRoute")}; return fxPositionRoute;`
  )(normalizedMode);
  const fxPositionModeFromLocation = new Function(
    "location",
    `${topLevelFunctionSource("fxPositionModeFromLocation")}; return fxPositionModeFromLocation;`
  )({ hash: "#fx-position" });

  assert.equal(fxPositionRoute("MANUAL"), "#fx-position:manual");
  assert.equal(fxPositionRoute("AUTO"), "#fx-position:auto");
  assert.equal(fxPositionModeFromLocation("#fx-position"), "MANUAL");
  assert.equal(fxPositionModeFromLocation("#fx-position:manual"), "MANUAL");
  assert.equal(fxPositionModeFromLocation("#fx-position:auto"), "AUTO");

  const pageModeSource = topLevelFunctionSource("applyInitialPageMode");
  assert.match(
    pageModeSource,
    /setActiveFxPositionMode\(fxPositionModeFromLocation\(\)\)/
  );
  assert.match(
    html,
    /class="workspace-nav-link" href="#fx-position:manual" data-workspace-route="batching"/
  );
});

test("persisted currentFxPositionMode drives rows and selected-Ccy-Pair counts", () => {
  const rowsFunctionSource = topLevelFunctionSource("fxPositionRowsForMode");
  const countsFunctionSource = topLevelFunctionSource("fxPositionModeCounts");
  const fxPositionRowsForMode = new Function(
    "normalizedPositionManagementMode",
    `${rowsFunctionSource}; return fxPositionRowsForMode;`
  )(normalizedMode);
  const fxPositionModeCounts = new Function(
    "normalizedPositionManagementMode",
    "activeCurrencyPairRows",
    `${rowsFunctionSource}\n${countsFunctionSource}; return fxPositionModeCounts;`
  )(
    normalizedMode,
    source => source.filter(record => record.currencyPair === "EUR/USD")
  );
  const records = [
    {
      id: "manual-1",
      initialFxPositionMode: "MANUAL",
      currentFxPositionMode: "MANUAL",
      currencyPair: "EUR/USD"
    },
    {
      id: "auto-1",
      initialFxPositionMode: "AUTO",
      currentFxPositionMode: "AUTO",
      currencyPair: "EUR/USD"
    },
    {
      id: "promoted-to-auto",
      initialFxPositionMode: "MANUAL",
      currentFxPositionMode: "AUTO",
      currencyPair: "EUR/USD"
    },
    {
      id: "current-mode-wins",
      currentFxPositionMode: "AUTO",
      fxPositionMode: "MANUAL",
      currencyPair: "GBP/USD"
    },
    { id: "legacy-auto", fxPositionMode: "AUTO", currencyPair: "GBP/USD" },
    { id: "missing-mode", pricingMode: "AUTO_PRICED", currencyPair: "GBP/USD" }
  ];

  assert.deepEqual(
    fxPositionRowsForMode(records, "MANUAL").map(record => record.id),
    ["manual-1", "missing-mode"]
  );
  assert.deepEqual(
    fxPositionRowsForMode(records, "AUTO").map(record => record.id),
    ["auto-1", "promoted-to-auto", "current-mode-wins", "legacy-auto"]
  );
  assert.deepEqual(fxPositionModeCounts(records), { MANUAL: 1, AUTO: 2 });

  assert.match(rowsFunctionSource, /deal\?\.currentFxPositionMode \?\? deal\?\.fxPositionMode/);
  assert.match(countsFunctionSource, /const pairRows = activeCurrencyPairRows\(source\)/);

  const displayRowsSource = topLevelFunctionSource("currentDisplayRows");
  const tabRendererSource = topLevelFunctionSource("renderFxPositionModeTabs");
  assert.match(
    displayRowsSource,
    /activeCurrencyPairRows\(fxPositionRowsForMode\(fxPositions\)\)/
  );
  assert.match(tabRendererSource, /fxPositionModeCounts\(source\)/);
  assert.match(tabRendererSource, /fxPositionManualCount\.textContent = String\(counts\.MANUAL\)/);
  assert.match(tabRendererSource, /fxPositionAutoCount\.textContent = String\(counts\.AUTO\)/);
});

test("switching mode removes selections hidden by the new route", () => {
  const selectedTradeIds = new Set(["manual-visible", "auto-hidden"]);
  const clearHiddenFxPositionSelection = new Function(
    "currentDisplayRows",
    "selectedTradeIds",
    `${topLevelFunctionSource("clearHiddenFxPositionSelection")}; return clearHiddenFxPositionSelection;`
  )(
    () => [{ id: "manual-visible" }],
    selectedTradeIds
  );

  clearHiddenFxPositionSelection();
  assert.deepEqual([...selectedTradeIds], ["manual-visible"]);

  let clearCalls = 0;
  let closeSendToAutoCalls = 0;
  const modeHarness = new Function(
    "normalizedPositionManagementMode",
    "closeOneBatchTenorDialog",
    "closeSendToAutoPositionModeDialog",
    "clearHiddenFxPositionSelection",
    "setBatchStatus",
    `let activeFxPositionMode = "MANUAL";
     ${topLevelFunctionSource("setActiveFxPositionMode")}
     return {
       setActiveFxPositionMode,
       activeMode: () => activeFxPositionMode
     };`
  )(
    normalizedMode,
    () => {},
    () => { closeSendToAutoCalls += 1; },
    () => { clearCalls += 1; },
    () => {}
  );

  assert.equal(modeHarness.setActiveFxPositionMode("AUTO"), true);
  assert.equal(modeHarness.activeMode(), "AUTO");
  assert.equal(clearCalls, 1);
  assert.equal(closeSendToAutoCalls, 1);
  assert.equal(modeHarness.setActiveFxPositionMode("AUTO"), false);
  assert.equal(clearCalls, 1);
  assert.equal(closeSendToAutoCalls, 1);
});

test("Send to Auto accepts only a fully eligible Manual Client/Hedge selection", () => {
  const eligibilitySource = topLevelFunctionSource("isManualReviewTradeEligibleForAuto");
  const selectionSource = topLevelFunctionSource("selectedManualReviewTradesForAuto");
  const eligibility = new Function(
    "normalizedPositionManagementMode",
    "fxPositionType",
    "isBatchableFxPositionTrade",
    `${eligibilitySource}; return isManualReviewTradeEligibleForAuto;`
  )(
    normalizedMode,
    deal => deal.tradeType,
    deal => deal.batchable === true
  );

  assert.equal(eligibility({
    tradeType: "CLIENT_DEAL",
    initialFxPositionMode: "MANUAL",
    currentFxPositionMode: "MANUAL",
    batchable: true
  }), true);
  assert.equal(eligibility({
    tradeType: "HEDGE_DEAL",
    initialFxPositionMode: "MANUAL",
    currentFxPositionMode: "MANUAL",
    batchable: true
  }), true);
  assert.equal(eligibility({
    tradeType: "CLIENT_DEAL",
    initialFxPositionMode: "AUTO",
    currentFxPositionMode: "MANUAL",
    batchable: true
  }), false);
  assert.equal(eligibility({
    tradeType: "CLIENT_DEAL",
    initialFxPositionMode: "MANUAL",
    currentFxPositionMode: "AUTO",
    batchable: true
  }), false);
  assert.equal(eligibility({
    tradeType: "BATCH_POSITION_OUT",
    initialFxPositionMode: "MANUAL",
    currentFxPositionMode: "MANUAL",
    batchable: true
  }), false);
  assert.equal(eligibility({
    tradeType: "HEDGE_DEAL",
    initialFxPositionMode: "MANUAL",
    currentFxPositionMode: "MANUAL",
    batchable: false
  }), false);

  assert.match(selectionSource, /activeFxPositionMode !== "MANUAL"/);
  assert.match(selectionSource, /selectedRows\.length > 0/);
  assert.match(selectionSource, /selectedRows\.every\(isManualReviewTradeEligibleForAuto\)/);

  const updateButtonsSource = topLevelFunctionSource("updateActionButtons");
  assert.match(
    updateButtonsSource,
    /sendToAutoPositionModeButton\.hidden = activeFxPositionMode !== "MANUAL"/
  );
  assert.match(updateButtonsSource, /selectedManualReviewTradesForAuto\(\)/);
  assert.match(updateButtonsSource, /sendToAutoPositionModeInFlight/);
});

test("Send to Auto posts composite identities and protects success/error/in-flight state", () => {
  const openSource = topLevelFunctionSource("openSendToAutoPositionModeDialog");
  const closeSource = topLevelFunctionSource("closeSendToAutoPositionModeDialog");
  const confirmSource = topLevelFunctionSource("confirmSendToAutoPositionMode");

  assert.match(openSource, /tradeId: Number\(fxPositionTradeId\(deal\)\)/);
  assert.match(openSource, /tradeType: fxPositionType\(deal\)/);
  assert.match(openSource, /to Auto Batching & Hedging\?`/);
  assert.doesNotMatch(openSource, /from Manual Control/);
  assert.match(closeSource, /if \(sendToAutoPositionModeInFlight\)/);
  assert.match(confirmSource, /sendToAutoPositionModeInFlight = true/);
  assert.match(confirmSource, /sendToAutoPositionModeDialogClose\.disabled = true/);
  assert.match(confirmSource, /sendToAutoPositionModeCancelButton\.disabled = true/);
  assert.match(confirmSource, /sendToAutoPositionModeConfirmButton\.disabled = true/);
  assert.match(confirmSource, /"\/api\/v1\/fx-positions\/send-to-auto-batching"/);
  assert.match(confirmSource, /method: "POST"/);
  assert.match(confirmSource, /body: JSON\.stringify\(\{ trades: submittedTrades \}\)/);
  assert.match(confirmSource, /selectedTradeIds\.delete\(String\(trade\.tradeId\)\)/);
  assert.match(confirmSource, /await Promise\.all\(\[/);
  assert.match(confirmSource, /reloadClientFxDealsFromApi\(\)/);
  assert.match(confirmSource, /reloadHedgeFxDealsFromApi\(\)/);
  assert.match(confirmSource, /reloadFxPositionsFromApi\(\)/);
  assert.match(confirmSource, /renderClientFxDeals\(clientFxDeals\)/);
  assert.match(confirmSource, /renderHedgeFxDeals\(hedgeFxDeals\)/);
  assert.match(confirmSource, /render\(fxPositions\)/);
  assert.match(confirmSource, /closeSendToAutoPositionModeDialog\(\)/);
  assert.match(confirmSource, /catch \(error\)/);
  assert.match(confirmSource, /sendToAutoPositionModeStatus\.textContent = message/);
  assert.match(confirmSource, /setBatchStatus\(message, "error"\)/);
  assert.match(confirmSource, /finally \{/);
  assert.match(confirmSource, /sendToAutoPositionModeInFlight = false/);
  assert.match(confirmSource, /sendToAutoPositionModeDialogClose\.disabled = false/);
  assert.match(confirmSource, /sendToAutoPositionModeCancelButton\.disabled = false/);
  assert.match(confirmSource, /sendToAutoPositionModeConfirmButton\.disabled = false/);
});

test("Client and Hedge deal grids expose Initial and Current FX Position modes", () => {
  ["clientFxDealColumnDefinitions", "hedgeFxDealColumnDefinitions"].forEach(name => {
    const source = topLevelFunctionSource(name);

    assert.match(source, /title: "FX Position Processing"/);
    assert.match(
      source,
      /title: "Initial FX Position Mode", field: "initialFxPositionMode"/
    );
    assert.match(
      source,
      /title: "Current FX Position Mode", field: "currentFxPositionMode"/
    );
    assert.match(source, /formatter: clientFxDealsPositionManagementModeFormatter/);
  });
});

test("the UI split leaves batching and the FX Position backend selector mode-agnostic", () => {
  const reloadSource = topLevelFunctionSource("reloadFxPositionsFromApi");
  const manualBatchSelectorSource = topLevelFunctionSource("selectedBatchSourceTrades");
  const fxPositionsEndpointSource = serverSource.match(
    /if \(pathname === "\/api\/v1\/fx-positions" && method === "GET"\) \{[\s\S]*?return true;\s*\}/
  )?.[0] || "";

  assert.match(reloadSource, /demoApiRequest\("\/api\/v1\/fx-positions"\)/);
  assert.doesNotMatch(reloadSource, /[?&](?:mode|fxPositionMode)=/);
  assert.match(manualBatchSelectorSource, /currentDisplayRows\(\)\.filter/);
  assert.doesNotMatch(manualBatchSelectorSource, /fxPositionMode|activeFxPositionMode/);
  assert.match(fxPositionsEndpointSource, /sendJson\(response, 200, fxPositions\(\)\)/);
  assert.doesNotMatch(fxPositionsEndpointSource, /searchParams|fxPositionMode|position_management_mode/);
});
