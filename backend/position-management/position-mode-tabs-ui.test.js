"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { readFrontendSources } = require("../test-support/frontend-source.js");

const ROOT = path.resolve(__dirname, "..", "..");
const SERVER_PATH = path.join(ROOT, "server.js");
const { combinedSource: html, appScript: inlineScript } = readFrontendSources(ROOT);
const serverSource = fs.readFileSync(SERVER_PATH, "utf8");
const positionPageMarkup = html.match(
  /<main class="shell position-bootstrap workbench-page" id="mainPage"[\s\S]*?<\/main>/
)?.[0] || "";
const positionGridMarkup = positionPageMarkup.match(
  /<table\b[^>]*class="[^"]*\bposition-grid\b[^"]*"[^>]*>[\s\S]*?<\/table>/
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

test("Manual Management and Auto Management routes control one shared Position grid", () => {
  const tabsMarkup = elementMarkup("positionModeTabs", "nav");
  const manualTabMarkup = elementMarkup("positionManualTab", "a");
  const autoTabMarkup = elementMarkup("positionAutoTab", "a");
  const sharedPanelMarkup = elementMarkup("positionGridPanel", "section");

  assert.match(tabsMarkup, /role="tablist"/);
  assert.match(tabsMarkup, /aria-labelledby="positionModeLabel"/);
  assert.match(elementMarkup("positionModeLabel", "span"), />Position Management Mode:</);
  assert.doesNotMatch(tabsMarkup, /nav-tabs|workbench-section-tabs/);
  assert.match(manualTabMarkup, /href="#position:manual"/);
  assert.match(manualTabMarkup, /data-position-management-mode="MANUAL"/);
  assert.match(manualTabMarkup, /aria-controls="positionGridPanel"/);
  assert.match(manualTabMarkup, /class="button-icon position-mode-icon" aria-hidden="true">touch_app<\/span>/);
  assert.match(manualTabMarkup, />Manual</);
  assert.match(manualTabMarkup, /id="positionManualCount"/);
  assert.match(autoTabMarkup, /href="#position:auto"/);
  assert.match(autoTabMarkup, /data-position-management-mode="AUTO"/);
  assert.match(autoTabMarkup, /aria-controls="positionGridPanel"/);
  assert.match(
    autoTabMarkup,
    /class="button-icon position-mode-icon" aria-hidden="true">smart_toy<\/span>/
  );
  assert.doesNotMatch(autoTabMarkup, />verified_user<\/span>/);
  assert.match(autoTabMarkup, />Auto</);
  assert.match(autoTabMarkup, /id="positionAutoCount"/);
  assert.match(sharedPanelMarkup, /role="tabpanel"/);
  assert.match(
    html,
    /\.position-grid-frame \{[\s\S]*?margin-top: 12px;/
  );
  assert.match(
    html,
    /body:has\(#mainPage\.position-bootstrap\.workbench-page:not\(\[hidden\]\)\) \{\s*overflow: hidden;/
  );
  assert.match(
    html,
    /\.position-grid-frame \{[\s\S]*?overflow: auto;[\s\S]*?overscroll-behavior: contain;/
  );

  assert.equal(
    (positionPageMarkup.match(/<table\b[^>]*\bposition-grid\b/g) || []).length,
    1
  );
  assert.equal((positionPageMarkup.match(/\bid="dealRows"/g) || []).length, 1);
  assert.ok(positionGridMarkup.includes('id="dealRows"'));
  assert.doesNotMatch(
    positionGridMarkup,
    /data-ui-column-key="(?:)?position_management_mode"|>\s*Position Management Mode\s*</i
  );
});

test("Manual Management exposes an explicit confirmation before moving Trades to Auto Management", () => {
  const buttonMarkup = elementMarkup("moveToAutoManagementButton", "button");
  const dialogMarkup = elementMarkup("moveToAutoManagementDialog", "dialog");

  assert.match(buttonMarkup, /class="[^"]*\bbtn-outline-secondary\b[^"]*"/);
  assert.match(buttonMarkup, /disabled/);
  assert.match(buttonMarkup, /aria-label="Move selected Trades to Auto Management"/);
  assert.match(buttonMarkup, />Move to Auto Management</);
  assert.match(dialogMarkup, /id="moveToAutoManagementDialogTitle"/);
  assert.match(dialogMarkup, />Move Trades to Auto Management<\/h2>/);
  assert.doesNotMatch(dialogMarkup, /Initial Position Management Mode|Current Position Management Mode/);
  assert.match(
    dialogMarkup,
    /id="moveToAutoManagementConfirmButton"[^>]*>Move to Auto Management<\/button>/
  );
});

test("demo-only Position actions are isolated in the Demo Toolbar", () => {
  const dealToolbarMarkup = positionPageMarkup.match(
    /<section class="deal-toolbar\b[^"]*"[\s\S]*?<\/section>/
  )?.[0] || "";
  const demoToolbarMarkup = elementMarkup("positionDemoToolbar", "section");
  const demoActionIds = [
    "generateClientDealButton",
    "runClientDealGenerationButton",
    "clientDealSettingsButton",
    "resetDemoTradesButton"
  ];

  assert.match(demoToolbarMarkup, /aria-label="Demo Toolbar"/);
  assert.match(demoToolbarMarkup, />science<\/span>/);
  for (const actionId of demoActionIds) {
    assert.match(demoToolbarMarkup, new RegExp(`id="${actionId}"`));
    assert.doesNotMatch(dealToolbarMarkup, new RegExp(`id="${actionId}"`));
  }
  assert.ok(
    positionPageMarkup.indexOf('id="positionDemoToolbar"') >
      positionPageMarkup.indexOf('class="position-toolbar-row"')
  );
});

test("Position toolbars separate Quick Hedge, Trade, selection, and Automation actions", () => {
  const quickHedgeToolbarMarkup = elementMarkup("positionQuickHedgeToolbar", "section");
  const tradeActionsToolbarMarkup = elementMarkup("positionTradeActionsToolbar", "section");
  const selectedTradesToolbarMarkup = elementMarkup("positionSelectedTradesToolbar", "section");
  const selectedTradeActionsMarkup = elementMarkup("positionSelectedTradeActions", "div");
  const automationControlsMarkup = elementMarkup("positionAutomationControls", "div");
  const actionIds = [
    "createDealButton",
    "addHedgeDealButton",
    "oneBatchButton",
    "moveToAutoManagementButton",
    "autoBatchButton",
    "autoBatchingSettingsButton"
  ];

  assert.match(quickHedgeToolbarMarkup, /aria-label="Quick Hedge Toolbar"/);
  assert.match(quickHedgeToolbarMarkup, />bolt<\/span>/);
  assert.match(quickHedgeToolbarMarkup, /id="hedgeQuickModeToolbar"/);
  assert.match(quickHedgeToolbarMarkup, /id="hedgeQuickModeSettingsButton"/);
  assert.doesNotMatch(quickHedgeToolbarMarkup, /id="addHedgeDealButton"/);

  assert.match(tradeActionsToolbarMarkup, /aria-label="Trade Actions Toolbar"/);
  assert.match(tradeActionsToolbarMarkup, />currency_exchange<\/span>/);
  assert.match(tradeActionsToolbarMarkup, /id="createDealButton"/);
  assert.match(tradeActionsToolbarMarkup, /id="addHedgeDealButton"/);
  assert.doesNotMatch(html, /id="editDealDialog"/);
  assert.doesNotMatch(tradeActionsToolbarMarkup, /Edit Trade|editDealButton/);
  assert.doesNotMatch(tradeActionsToolbarMarkup, /id="(?:oneBatchButton|autoBatchButton)"/);

  assert.match(selectedTradesToolbarMarkup, /aria-label="Selected Trades Toolbar"/);
  assert.match(selectedTradesToolbarMarkup, />checklist<\/span>/);
  assert.match(selectedTradeActionsMarkup, /id="selectedTradesCount"/);
  assert.match(selectedTradeActionsMarkup, /id="oneBatchButton"/);
  assert.match(selectedTradeActionsMarkup, /id="moveToAutoManagementButton"/);
  assert.doesNotMatch(selectedTradeActionsMarkup, /id="autoBatchButton"/);
  assert.match(automationControlsMarkup, />Automation<\/span>/);
  assert.match(automationControlsMarkup, /id="autoBatchButton"/);
  assert.match(automationControlsMarkup, /id="autoBatchingSettingsButton"/);

  for (const actionId of actionIds) {
    assert.equal((positionPageMarkup.match(new RegExp(`id="${actionId}"`, "g")) || []).length, 1);
  }

  const updateActionsSource = topLevelFunctionSource("updateActionButtons");
  assert.match(
    updateActionsSource,
    /currentDisplayRows\(\)\.filter\(deal =>\s*selectedTradeIds\.has\(deal\.id\)\s*\)\.length/
  );
  assert.match(
    updateActionsSource,
    /selectedTradesCount\.textContent = `\$\{selectedVisibleTradeCount\} selected`/
  );
});

test("route helpers preserve the legacy Manual default and explicit mode state", () => {
  const positionRoute = new Function(
    "normalizedPositionManagementMode",
    `${topLevelFunctionSource("positionRoute")}; return positionRoute;`
  )(normalizedMode);
  const positionModeFromLocation = new Function(
    "location",
    `${topLevelFunctionSource("positionModeFromLocation")}; return positionModeFromLocation;`
  )({ hash: "#position" });

  assert.equal(positionRoute("MANUAL"), "#position:manual");
  assert.equal(positionRoute("AUTO"), "#position:auto");
  assert.equal(positionModeFromLocation("#position"), "MANUAL");
  assert.equal(positionModeFromLocation("#position:manual"), "MANUAL");
  assert.equal(positionModeFromLocation("#position:auto"), "AUTO");

  const pageModeSource = topLevelFunctionSource("applyInitialPageMode");
  assert.match(
    pageModeSource,
    /setActivePositionMode\(positionModeFromLocation\(\)\)/
  );
  assert.match(
    html,
    /class="workspace-nav-link" href="#position:manual" data-workspace-route="batching"/
  );
});

test("persisted currentPositionManagementMode drives rows and selected-Ccy-Pair tab counts", () => {
  const rowsFunctionSource = topLevelFunctionSource("positionRowsForMode");
  const countsFunctionSource = topLevelFunctionSource("positionModeCounts");
  const pairTradeCountFunctionSource = topLevelFunctionSource("positionTradeCountForPair");
  const positionRowsForMode = new Function(
    "normalizedPositionManagementMode",
    `${rowsFunctionSource}; return positionRowsForMode;`
  )(normalizedMode);
  const positionModeCounts = new Function(
    "normalizedPositionManagementMode",
    "activeCurrencyPairRows",
    `${rowsFunctionSource}\n${countsFunctionSource}; return positionModeCounts;`
  )(
    normalizedMode,
    source => source.filter(record => record.currencyPair === "EUR/USD")
  );
  const positionTradeCountForPair = new Function(
    "currencyPair",
    `${pairTradeCountFunctionSource}; return positionTradeCountForPair;`
  )(
    record => record.currencyPair
  );
  const records = [
    {
      id: "manual-1",
      initialPositionManagementMode: "MANUAL",
      currentPositionManagementMode: "MANUAL",
      currencyPair: "EUR/USD"
    },
    {
      id: "auto-1",
      initialPositionManagementMode: "AUTO",
      currentPositionManagementMode: "AUTO",
      currencyPair: "EUR/USD"
    },
    {
      id: "promoted-to-auto",
      initialPositionManagementMode: "MANUAL",
      currentPositionManagementMode: "AUTO",
      currencyPair: "EUR/USD"
    },
    {
      id: "current-mode-wins",
      currentPositionManagementMode: "AUTO",
      positionManagementMode: "MANUAL",
      currencyPair: "GBP/USD"
    },
    { id: "legacy-auto", positionManagementMode: "AUTO", currencyPair: "GBP/USD" },
    { id: "missing-mode", pricingMode: "AUTO_PRICED", currencyPair: "GBP/USD" }
  ];

  assert.deepEqual(
    positionRowsForMode(records, "MANUAL").map(record => record.id),
    ["manual-1", "missing-mode"]
  );
  assert.deepEqual(
    positionRowsForMode(records, "AUTO").map(record => record.id),
    ["auto-1", "promoted-to-auto", "current-mode-wins", "legacy-auto"]
  );
  assert.deepEqual(positionModeCounts(records), { MANUAL: 1, AUTO: 2 });
  assert.equal(positionTradeCountForPair(records, "GBP/USD"), 3);

  assert.match(rowsFunctionSource, /deal\?\.currentPositionManagementMode \?\? deal\?\.positionManagementMode/);
  assert.match(countsFunctionSource, /const pairRows = activeCurrencyPairRows\(source\)/);
  assert.match(
    pairTradeCountFunctionSource,
    /source\.filter\(deal => currencyPair\(deal\) === pair\)/
  );

  const displayRowsSource = topLevelFunctionSource("currentDisplayRows");
  const tabRendererSource = topLevelFunctionSource("renderPositionModeTabs");
  const pairListRendererSource = topLevelFunctionSource("renderCurrencyPairList");
  assert.match(
    displayRowsSource,
    /activeCurrencyPairRows\(positionRowsForMode\(positions\)\)/
  );
  assert.match(tabRendererSource, /positionModeCounts\(source\)/);
  assert.match(tabRendererSource, /positionManualCount\.textContent = String\(counts\.MANUAL\)/);
  assert.match(tabRendererSource, /positionAutoCount\.textContent = String\(counts\.AUTO\)/);
  assert.match(pairListRendererSource, /positionTradeCountForPair\(source, pair\)/);
  assert.match(pairListRendererSource, /class="currency-pair-count"/);
  assert.match(pairListRendererSource, /Total trades: \$\{count\}/);
  assert.doesNotMatch(pairListRendererSource, /activePositionMode/);
  assert.doesNotMatch(pairListRendererSource, />touch_app<\/span>|>automation<\/span>/);
});

test("Position Table Layout controls the Ccy Pair selector width", () => {
  const pairPanelMarkup = positionPageMarkup.match(
    /<section class="currency-pair-panel"[^>]*>/
  )?.[0] || "";
  const auxiliaryKeysSource = topLevelFunctionSource("auxiliaryUiTableLayoutColumnKeys");
  const applyLayoutSource = topLevelFunctionSource("applyPositionGridLayout");
  const editorSource = topLevelFunctionSource("renderUiTableLayoutEditor");

  assert.match(pairPanelMarkup, /data-ui-table-layout-key="position_grid"/);
  assert.match(pairPanelMarkup, /data-ui-table-layout-column-key="ccy_pair_selector"/);
  assert.match(
    html,
    /grid-template-columns: var\(--position-ccy-pair-selector-width, 136px\) minmax\(0, 1fr\)/
  );
  assert.match(auxiliaryKeysSource, /data-ui-table-layout-column-key/);
  assert.match(editorSource, /auxiliaryUiTableLayoutColumnKeys\(tableLayout\.tableKey\)/);
  assert.match(applyLayoutSource, /settingsByKey\.get\("ccy_pair_selector"\)\?\.widthPx/);
  assert.match(
    applyLayoutSource,
    /mainPage\.style\.setProperty\([\s\S]*?--position-ccy-pair-selector-width/
  );
});

test("switching mode removes selections hidden by the new route", () => {
  const selectedTradeIds = new Set(["manual-visible", "auto-hidden"]);
  const clearHiddenPositionSelection = new Function(
    "currentDisplayRows",
    "selectedTradeIds",
    `${topLevelFunctionSource("clearHiddenPositionSelection")}; return clearHiddenPositionSelection;`
  )(
    () => [{ id: "manual-visible" }],
    selectedTradeIds
  );

  clearHiddenPositionSelection();
  assert.deepEqual([...selectedTradeIds], ["manual-visible"]);

  let clearCalls = 0;
  let closeSendToAutoCalls = 0;
  const modeHarness = new Function(
    "normalizedPositionManagementMode",
    "closeOneBatchTenorDialog",
    "closeMoveToAutoManagementDialog",
    "clearHiddenPositionSelection",
    "setBatchStatus",
    `let activePositionMode = "MANUAL";
     ${topLevelFunctionSource("setActivePositionMode")}
     return {
       setActivePositionMode,
       activeMode: () => activePositionMode
     };`
  )(
    normalizedMode,
    () => {},
    () => { closeSendToAutoCalls += 1; },
    () => { clearCalls += 1; },
    () => {}
  );

  assert.equal(modeHarness.setActivePositionMode("AUTO"), true);
  assert.equal(modeHarness.activeMode(), "AUTO");
  assert.equal(clearCalls, 1);
  assert.equal(closeSendToAutoCalls, 1);
  assert.equal(modeHarness.setActivePositionMode("AUTO"), false);
  assert.equal(clearCalls, 1);
  assert.equal(closeSendToAutoCalls, 1);
});

test("Move to Auto Management accepts only a fully eligible Manual Client/Hedge selection", () => {
  const eligibilitySource = topLevelFunctionSource("isTradeEligibleForAutoManagement");
  const selectionSource = topLevelFunctionSource("selectedTradesForAutoManagement");
  const eligibility = new Function(
    "normalizedPositionManagementMode",
    "positionType",
    "isBatchablePositionTrade",
    `${eligibilitySource}; return isTradeEligibleForAutoManagement;`
  )(
    normalizedMode,
    deal => deal.tradeType,
    deal => deal.batchable === true
  );

  assert.equal(eligibility({
    tradeType: "CLIENT_DEAL",
    initialPositionManagementMode: "MANUAL",
    currentPositionManagementMode: "MANUAL",
    batchable: true
  }), true);
  assert.equal(eligibility({
    tradeType: "HEDGE_DEAL",
    initialPositionManagementMode: "MANUAL",
    currentPositionManagementMode: "MANUAL",
    batchable: true
  }), true);
  assert.equal(eligibility({
    tradeType: "CLIENT_DEAL",
    initialPositionManagementMode: "AUTO",
    currentPositionManagementMode: "MANUAL",
    batchable: true
  }), false);
  assert.equal(eligibility({
    tradeType: "CLIENT_DEAL",
    initialPositionManagementMode: "MANUAL",
    currentPositionManagementMode: "AUTO",
    batchable: true
  }), false);
  assert.equal(eligibility({
    tradeType: "BATCH_POSITION_OUT",
    initialPositionManagementMode: "MANUAL",
    currentPositionManagementMode: "MANUAL",
    batchable: true
  }), false);
  assert.equal(eligibility({
    tradeType: "HEDGE_DEAL",
    initialPositionManagementMode: "MANUAL",
    currentPositionManagementMode: "MANUAL",
    batchable: false
  }), false);

  assert.match(selectionSource, /activePositionMode !== "MANUAL"/);
  assert.match(selectionSource, /selectedRows\.length > 0/);
  assert.match(selectionSource, /selectedRows\.every\(isTradeEligibleForAutoManagement\)/);

  const updateButtonsSource = topLevelFunctionSource("updateActionButtons");
  assert.match(
    updateButtonsSource,
    /moveToAutoManagementButton\.hidden = activePositionMode !== "MANUAL"/
  );
  assert.match(updateButtonsSource, /selectedTradesForAutoManagement\(\)/);
  assert.match(updateButtonsSource, /moveToAutoManagementInFlight/);
});

test("Move to Auto Management posts composite identities and protects success/error/in-flight state", () => {
  const openSource = topLevelFunctionSource("openMoveToAutoManagementDialog");
  const closeSource = topLevelFunctionSource("closeMoveToAutoManagementDialog");
  const confirmSource = topLevelFunctionSource("confirmMoveToAutoManagement");

  assert.match(openSource, /tradeId: Number\(positionTradeId\(deal\)\)/);
  assert.match(openSource, /tradeType: positionType\(deal\)/);
  assert.match(openSource, /to Auto Management\?`/);
  assert.doesNotMatch(openSource, /from Manual Management/);
  assert.match(closeSource, /if \(moveToAutoManagementInFlight\)/);
  assert.match(confirmSource, /moveToAutoManagementInFlight = true/);
  assert.match(confirmSource, /moveToAutoManagementDialogClose\.disabled = true/);
  assert.match(confirmSource, /moveToAutoManagementCancelButton\.disabled = true/);
  assert.match(confirmSource, /moveToAutoManagementConfirmButton\.disabled = true/);
  assert.match(confirmSource, /"\/api\/v1\/positions\/move-to-auto-management"/);
  assert.match(confirmSource, /method: "POST"/);
  assert.match(confirmSource, /body: JSON\.stringify\(\{ trades: submittedTrades \}\)/);
  assert.match(confirmSource, /selectedTradeIds\.delete\(String\(trade\.tradeId\)\)/);
  assert.match(confirmSource, /await Promise\.all\(\[/);
  assert.match(confirmSource, /reloadClientDealsFromApi\(\)/);
  assert.match(confirmSource, /reloadHedgeDealsFromApi\(\)/);
  assert.match(confirmSource, /reloadPositionsFromApi\(\)/);
  assert.match(confirmSource, /renderClientDeals\(clientDeals\)/);
  assert.match(confirmSource, /renderHedgeDeals\(hedgeDeals\)/);
  assert.match(confirmSource, /render\(positions\)/);
  assert.match(confirmSource, /closeMoveToAutoManagementDialog\(\)/);
  assert.match(confirmSource, /catch \(error\)/);
  assert.match(confirmSource, /moveToAutoManagementStatus\.textContent = message/);
  assert.match(confirmSource, /setBatchStatus\(message, "error"\)/);
  assert.match(confirmSource, /finally \{/);
  assert.match(confirmSource, /moveToAutoManagementInFlight = false/);
  assert.match(confirmSource, /moveToAutoManagementDialogClose\.disabled = false/);
  assert.match(confirmSource, /moveToAutoManagementCancelButton\.disabled = false/);
  assert.match(confirmSource, /moveToAutoManagementConfirmButton\.disabled = false/);
});

test("Hedge Deals inherit the Position Management Mode of the initiating tab", () => {
  const quickHedgeSource = topLevelFunctionSource("createQuickHedgeDeal");
  const openDialogSource = topLevelFunctionSource("openAddHedgeDealDialog");
  const createHedgeSource = topLevelFunctionSource("createHedgeDeal");
  const createHedgeServerSource = serverSource.match(
    /function createHedgeDeal\([\s\S]*?\n\}/
  )?.[0] || "";
  const baseValidatorSource = serverSource.match(
    /function validateHedgeDealBasePayload\([\s\S]*?\n\}/
  )?.[0] || "";
  const quickValidatorSource = serverSource.match(
    /function validateHedgeQuickModeDealPayload\([\s\S]*?\n\}/
  )?.[0] || "";

  assert.match(
    quickHedgeSource,
    /const positionManagementMode = normalizedPositionManagementMode\(\s*activePositionMode\s*\)/
  );
  assert.match(quickHedgeSource, /presetCode: preset\.presetCode,\s*positionManagementMode/);
  assert.match(
    openDialogSource,
    /addHedgeDealPositionManagementMode = normalizedPositionManagementMode\(\s*activePositionMode\s*\)/
  );
  assert.equal(
    (createHedgeSource.match(
      /positionManagementMode: addHedgeDealPositionManagementMode/g
    ) || []).length,
    2
  );
  assert.match(
    inlineScript,
    /addHedgeDealQuickModeSelection = null;\s*addHedgeDealPositionManagementMode = null;/
  );

  assert.match(baseValidatorSource, /validatedPositionManagementMode\(/);
  assert.match(baseValidatorSource, /"Hedge Deal Position Management Mode"/);
  assert.match(quickValidatorSource, /"positionManagementMode"/);
  assert.match(quickValidatorSource, /validatedPositionManagementMode\(/);
  assert.match(
    createHedgeServerSource,
    /payload\.positionManagementMode === null[\s\S]*?materializeTradeAdmission\([\s\S]*?materializeTradePositionModeState\(/
  );
});

test("Client and Hedge deal grids show Initial and Current Position Management modes only in Audit view", () => {
  ["clientDealColumnDefinitions", "hedgeDealColumnDefinitions"].forEach(name => {
    const source = topLevelFunctionSource(name);
    const viewMode = name === "clientDealColumnDefinitions"
      ? "clientDealsViewMode"
      : "hedgeDealsViewMode";

    assert.match(source, /title: "Position Processing"/);
    assert.match(
      source,
      new RegExp(
        `title: "Initial Position Management Mode", field: "initialPositionManagementMode", visible: ${viewMode} === DEALS_VIEW_MODE_AUDIT`
      )
    );
    assert.match(
      source,
      new RegExp(
        `title: "Current Position Management Mode", field: "currentPositionManagementMode", visible: ${viewMode} === DEALS_VIEW_MODE_AUDIT`
      )
    );
    assert.match(source, /formatter: clientDealsPositionManagementModeFormatter/);
  });

  const viewModeSource = topLevelFunctionSource("applyDealsViewMode");
  assert.match(viewModeSource, /"initialPositionManagementMode", "currentPositionManagementMode"/);
});

test("the UI split leaves batching and the Position backend selector mode-agnostic", () => {
  const reloadSource = topLevelFunctionSource("reloadPositionsFromApi");
  const manualBatchSelectorSource = topLevelFunctionSource("selectedBatchSourceTrades");
  const positionsEndpointSource = serverSource.match(
    /if \(pathname === "\/api\/v1\/positions" && method === "GET"\) \{[\s\S]*?return true;\s*\}/
  )?.[0] || "";

  assert.match(reloadSource, /demoApiRequest\("\/api\/v1\/positions"\)/);
  assert.doesNotMatch(reloadSource, /[?&](?:mode|positionManagementMode)=/);
  assert.match(manualBatchSelectorSource, /currentDisplayRows\(\)\.filter/);
  assert.doesNotMatch(manualBatchSelectorSource, /positionManagementMode|activePositionMode/);
  assert.match(positionsEndpointSource, /sendJson\(response, 200, positions\(\)\)/);
  assert.doesNotMatch(positionsEndpointSource, /searchParams|positionManagementMode|position_management_mode/);
});
