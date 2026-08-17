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
  const marker = `function ${name}(`;
  const start = inlineScript.indexOf(marker);
  assert.notEqual(start, -1, `Expected inline function ${name}.`);
  const remainingSource = inlineScript.slice(start + marker.length);
  const nextFunctionMatch = /\n    (?:async )?function [A-Za-z_$][\w$]*\s*\(/.exec(remainingSource);
  const end = nextFunctionMatch
    ? start + marker.length + nextFunctionMatch.index
    : inlineScript.length;
  return inlineScript.slice(start, end).trim();
}

function normalizedMode(value) {
  return String(value || "").trim().toUpperCase() === "AUTO" ? "AUTO" : "MANUAL";
}

test("Manual and Auto routes control one shared FX Position grid", () => {
  const tabsMarkup = elementMarkup("fxPositionModeTabs", "nav");
  const manualTabMarkup = elementMarkup("fxPositionManualTab", "a");
  const autoTabMarkup = elementMarkup("fxPositionAutoTab", "a");
  const sharedPanelMarkup = elementMarkup("fxPositionGridPanel", "section");

  assert.match(tabsMarkup, /role="tablist"/);
  assert.match(manualTabMarkup, /href="#fx-position:manual"/);
  assert.match(manualTabMarkup, /data-fx-position-mode="MANUAL"/);
  assert.match(manualTabMarkup, /aria-controls="fxPositionGridPanel"/);
  assert.match(manualTabMarkup, />FX Position Manual</);
  assert.match(manualTabMarkup, /id="fxPositionManualCount"/);
  assert.match(autoTabMarkup, /href="#fx-position:auto"/);
  assert.match(autoTabMarkup, /data-fx-position-mode="AUTO"/);
  assert.match(autoTabMarkup, /aria-controls="fxPositionGridPanel"/);
  assert.match(autoTabMarkup, />FX Position Auto</);
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

test("persisted fxPositionMode drives rows and mode-specific counts", () => {
  const rowsFunctionSource = topLevelFunctionSource("fxPositionRowsForMode");
  const countsFunctionSource = topLevelFunctionSource("fxPositionModeCounts");
  const fxPositionRowsForMode = new Function(
    "normalizedPositionManagementMode",
    `${rowsFunctionSource}; return fxPositionRowsForMode;`
  )(normalizedMode);
  const fxPositionModeCounts = new Function(
    "normalizedPositionManagementMode",
    `${rowsFunctionSource}\n${countsFunctionSource}; return fxPositionModeCounts;`
  )(normalizedMode);
  const records = [
    { id: "manual-1", fxPositionMode: "MANUAL", pricingMode: "AUTO_PRICED" },
    { id: "auto-1", fxPositionMode: "AUTO", pricingMode: "DEALER_PRICED" },
    { id: "auto-2", fxPositionMode: "AUTO", pricingMode: "DEALER_PRICED" },
    { id: "missing-mode", pricingMode: "AUTO_PRICED" }
  ];

  assert.deepEqual(
    fxPositionRowsForMode(records, "MANUAL").map(record => record.id),
    ["manual-1"]
  );
  assert.deepEqual(
    fxPositionRowsForMode(records, "AUTO").map(record => record.id),
    ["auto-1", "auto-2"]
  );
  assert.deepEqual(fxPositionModeCounts(records), { MANUAL: 1, AUTO: 2 });

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
  const modeHarness = new Function(
    "normalizedPositionManagementMode",
    "closeOneBatchTenorDialog",
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
    () => { clearCalls += 1; },
    () => {}
  );

  assert.equal(modeHarness.setActiveFxPositionMode("AUTO"), true);
  assert.equal(modeHarness.activeMode(), "AUTO");
  assert.equal(clearCalls, 1);
  assert.equal(modeHarness.setActiveFxPositionMode("AUTO"), false);
  assert.equal(clearCalls, 1);
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
