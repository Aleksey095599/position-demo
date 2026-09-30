"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..", "..");
const html = [
  path.join(root, "frontend", "features", "pricing", "trade-context.page.html"),
  path.join(root, "frontend", "app", "core", "runtime.js"),
  path.join(root, "frontend", "features", "counterparties", "counterparties.page.js")
].map(filePath => fs.readFileSync(filePath, "utf8")).join("\n");
const layoutsSource = fs.readFileSync(
  path.join(root, "backend", "ui-table-layout", "ui-table-layouts.js"),
  "utf8"
);
const routeSource = fs.readFileSync(
  path.join(root, "frontend", "features", "position", "position.page.js"),
  "utf8"
);
const contextPageSource = fs.readFileSync(
  path.join(root, "frontend", "features", "counterparties", "counterparties.page.js"),
  "utf8"
);
const referenceTableStyles = fs.readFileSync(
  path.join(root, "frontend", "shared", "components", "reference-tables.css"),
  "utf8"
);

function functionSource(source, name) {
  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `Expected function ${name}.`);
  const remainingSource = source.slice(start + marker.length);
  const nextFunctionMatch = /\n    (?:async )?function [A-Za-z_$][\w$]*\s*\(/.exec(remainingSource);
  const end = nextFunctionMatch
    ? start + marker.length + nextFunctionMatch.index
    : source.length;
  return source.slice(start, end).trim();
}

function tradeContextRouteHelpers() {
  return new Function(
    `
      const location = { hash: "#trade-context" };
      ${routeSource}
      return { pricingRoute, autoManagementAdmissionTradeContextRoute, pricingRouteStateFromLocation };
    `
  )();
}

test("Trade Context exposes Position Management Mode in its grid and editor", () => {
  assert.ok(html.includes('data-ui-column-key="position_management_mode"'));
  const header = html.match(/<th id="pricingContextAutoManagementAdmissionHeader"[\s\S]*?<\/th>/)?.[0] || "";
  assert.match(header, /<span>Position Management Mode<\/span>/);
  assert.doesNotMatch(header, /smart_toy/);
  assert.doesNotMatch(header, /\btitle=|data-tooltip/);
  assert.ok(html.includes('data-pricing-context-header-filter="positionManagementMode"'));
  assert.ok(html.includes('data-pricing-context-field="positionManagementMode"'));
  assert.ok(html.includes("positionManagementModeSettingMarkup(context.positionManagementMode)"));
  assert.ok(layoutsSource.includes(
    '["position_management_mode", "Position Management Mode", 232]'
  ));
});

test("Trade Context UI offers exactly the two initial admission modes", () => {
  const editorSelect = html.match(
    /<select class="inline-edit-control" data-pricing-context-field="positionManagementMode"[\s\S]*?<\/select>/
  )?.[0] || "";
  const values = [...editorSelect.matchAll(/<option value="([A-Z_]+)"/g)]
    .map(match => match[1]);

  assert.deepEqual(values, [
    "AUTO_IF_ELIGIBLE",
    "MANUAL"
  ]);
  assert.ok(html.includes("positionManagementMode: context.positionManagementMode"));
  assert.ok(html.includes('<option value="AUTO_IF_ELIGIBLE">Auto Mode if Eligible</option>'));
  assert.ok(html.includes('<option value="MANUAL">Manual Mode</option>'));
  const label = new Function("normalizedPositionManagementModeSetting",
    functionSource(html, "positionManagementModeSettingLabel") + "; return positionManagementModeSettingLabel;"
  )(value => value);
  assert.equal(label("AUTO_IF_ELIGIBLE"), "Auto Mode if Eligible");
  assert.equal(label("MANUAL"), "Manual Mode");
});

test("Position Management Mode opens the full Trade Context list with a safe return route", () => {
  const helpers = tradeContextRouteHelpers();
  const initialAdmissionHash = "#position-management-settings/position-management-mode";
  const route = helpers.autoManagementAdmissionTradeContextRoute(initialAdmissionHash);

  assert.equal(
    route,
    "#trade-context?focus=position-management-mode&return=%23position-management-settings%2Fposition-management-mode"
  );
  assert.deepEqual(helpers.pricingRouteStateFromLocation(route), {
    matches: true,
    mode: "focused",
    scope: null,
    focus: "position-management-mode",
    returnHash: initialAdmissionHash
  });
  assert.equal(
    helpers.pricingRouteStateFromLocation(
      "#trade-context?focus=position-management-mode&return=%23database"
    ).returnHash,
    initialAdmissionHash
  );

  assert.equal(helpers.pricingRouteStateFromLocation(
    helpers.autoManagementAdmissionTradeContextRoute("#position-management-settings:manual-release")
  ).returnHash, initialAdmissionHash);

  const referenceFilterRoute = helpers.pricingRouteStateFromLocation(
    "#trade-context?servicing-location=002"
  );
  assert.equal(referenceFilterRoute.mode, "filtered");
  assert.equal(referenceFilterRoute.scope.field, "servicingBranchCode");
  assert.equal(referenceFilterRoute.scope.value, "002");
});

test("filtered and focused Trade Context routes keep the standard list editable", () => {
  const syncSource = functionSource(contextPageSource, "syncPricingContextRouteView");
  const highlightSource = functionSource(contextPageSource, "highlightPricingContextAutoManagementAdmissionColumn");
  const helpers = tradeContextRouteHelpers();

  assert.match(html, /id="pricingContextAutoManagementAdmissionHeader"/);
  assert.match(
    html,
    /id="pricingContextAutoManagementAdmissionHeader"[^>]*tabindex="-1"[^>]*data-pricing-context-column="positionManagementMode"/
  );
  assert.equal(helpers.pricingRoute("servicingBranch", "002"), "#trade-context?servicing-location=002");
  assert.equal(helpers.pricingRoute("settlementSystem", "CFT"), "#trade-context?accounting-system=CFT");
  assert.equal(helpers.pricingRoute("tradeCaptureChannel", "C&T"), "#trade-context?originating-system=C%26T");
  assert.match(syncSource, /pricingContextNewButton\.hidden = false/);
  assert.match(syncSource, /pricingPage\.classList\.remove\("is-related-view"\)/);
  assert.match(syncSource, /pricingContextPageContextLabel\.hidden = !focusedAdmissionView/);
  assert.doesNotMatch(syncSource, /readOnly = true|aria-readonly.*true/);
  assert.doesNotMatch(syncSource, /pricingContextReturnLink/);
  assert.match(syncSource, /highlightPricingContextAutoManagementAdmissionColumn\(focusedAdmissionView\)/);
  assert.doesNotMatch(syncSource, /pricingContextRouteScope = focusedAdmissionView/);
  assert.match(highlightSource, /is-auto-management-admission-focused/);
  assert.match(highlightSource, /scrollIntoView/);
  assert.match(highlightSource, /prefers-reduced-motion: reduce/);
  assert.match(highlightSource, /\.focus\(\{ preventScroll: true \}\)/);
  assert.match(highlightSource, /2600/);
  assert.match(
    referenceTableStyles,
    /#tradeContextsTable\.is-auto-management-admission-focused \[data-pricing-context-column="positionManagementMode"\]/
  );
});
