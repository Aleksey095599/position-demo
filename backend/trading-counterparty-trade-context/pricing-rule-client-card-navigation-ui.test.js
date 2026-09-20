"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..", "..");
const databaseSource = fs.readFileSync(
  path.join(root, "frontend", "features", "database", "database.page.js"),
  "utf8"
);
const counterpartySource = fs.readFileSync(
  path.join(root, "frontend", "features", "counterparties", "counterparties.page.js"),
  "utf8"
);
const runtimeSource = fs.readFileSync(
  path.join(root, "frontend", "app", "core", "runtime.js"),
  "utf8"
);
const workspaceSource = fs.readFileSync(
  path.join(root, "frontend", "app", "shell", "workspace-shell.js"),
  "utf8"
);
const pricingRulesMarkup = fs.readFileSync(
  path.join(root, "frontend", "features", "pricing", "pricing-rules.page.html"),
  "utf8"
);
const tradesMarkup = fs.readFileSync(
  path.join(root, "frontend", "features", "trades", "trades.page.html"),
  "utf8"
);
const foundationStyles = fs.readFileSync(
  path.join(root, "frontend", "styles", "core", "foundation.css"),
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

test("detail context identifies the focused rule and preserves the Cancel action", () => {
  for (const scope of ["EXTERNAL", "INTERNAL"]) {
    const cancelLabel = { textContent: "" };
    const context = { hidden: true, textContent: "" };
    const backNavigation = { hidden: true };
    const backLabel = { textContent: "" };
    const sync = new Function(
      "clientProfileContextLabel", "clientProfileResetButton",
      "clientProfileBackNavigation", "clientProfileBackButton", "activeTradingCounterpartyScope",
      `${functionSource(counterpartySource, "setClientProfileDetailNavigation")}; return setClientProfileDetailNavigation;`
    )(context, { querySelector: () => cancelLabel }, backNavigation, { querySelector: () => backLabel }, scope);

    sync({ mode: "detail" });
    assert.equal(backNavigation.hidden, false);
    assert.equal(backLabel.textContent, scope === "INTERNAL" ? "Back to Internal Units" : "Back to External Counterparties");

    sync({ mode: "pricing-rule", pricingRuleId: "42" });
    assert.equal(backNavigation.hidden, true);
    assert.equal(context.hidden, false);
    assert.equal(context.textContent, "Pricing Rule 42");
    assert.equal(cancelLabel.textContent, "Cancel");

    sync();
    assert.equal(backNavigation.hidden, true);
    assert.equal(context.hidden, true);
    assert.equal(cancelLabel.textContent, "Cancel");
  }
});

function routeHelpers(initialHash = "#pricing-rules:external-counterparties") {
  return new Function(
    "location",
    `
      function pricingRoute() { return "#trade-context"; }
      function pricingRouteStateFromLocation(hash = location.hash) {
        return { matches: String(hash || "").startsWith("#trade-context") };
      }
      function pricingRulesRoute(scope = "EXTERNAL") {
        return scope === "INTERNAL"
          ? "#pricing-rules:internal-units"
          : "#pricing-rules:external-counterparties";
      }
      function pricingRulesRouteStateFromLocation(hash = location.hash) {
        return { matches: String(hash || "").startsWith("#pricing-rules:") };
      }
      ${functionSource(databaseSource, "normalizedTradingCounterpartyListRoute")}
      ${functionSource(databaseSource, "clientProfileRoute")}
      ${functionSource(databaseSource, "normalizedPricingRulesReturnRoute")}
      ${functionSource(databaseSource, "pricingRuleClientProfileRoute")}
      ${functionSource(databaseSource, "clientProfileRouteStateFromLocation")}
      return {
        pricingRuleClientProfileRoute,
        clientProfileRouteStateFromLocation
      };
    `
  )({ hash: initialHash });
}

test("Pricing Rule view route preserves the exact Pricing Rules entry route", () => {
  const helpers = routeHelpers();
  const returnHash = "#pricing-rules:internal-units?ccy-pair=USD_KZT";
  const route = helpers.pricingRuleClientProfileRoute("42", "PR/17", returnHash);

  assert.equal(
    route,
    "#trading-counterparties/42?pricing-rule=PR%2F17&return=%23pricing-rules%3Ainternal-units%3Fccy-pair%3DUSD_KZT"
  );
  assert.deepEqual(helpers.clientProfileRouteStateFromLocation(route), {
    matches: true,
    mode: "pricing-rule",
    counterpartyId: "42",
    tradeContextId: null,
    pricingRuleId: "PR/17",
    returnHash
  });
  assert.equal(
    helpers.pricingRuleClientProfileRoute("42", "PR-17", "#database"),
    "#trading-counterparties/42?pricing-rule=PR-17&return=%23pricing-rules%3Aexternal-counterparties"
  );
  assert.equal(
    helpers.pricingRuleClientProfileRoute("42", "", returnHash),
    "#trading-counterparties/42"
  );
});

test("Pricing Rules table exposes a direct view action into the counterparty settings", () => {
  const viewRowSource = functionSource(runtimeSource, "renderPricingRuleViewRow");
  const renderSource = functionSource(runtimeSource, "renderPricingRules");

  assert.match(
    pricingRulesMarkup,
    /<col class="pricing-rule-actions-column" data-ui-column-key="actions" data-ui-fallback-width="80">/
  );
  assert.match(
    pricingRulesMarkup,
    /<th class="profile-actions-cell">[\s\S]*?<span class="reference-column-title">Actions<\/span>/
  );
  assert.match(viewRowSource, /pricingRuleClientProfileRoute\(/);
  assert.match(viewRowSource, /href="\$\{escapeHtml\(viewRoute\)\}"/);
  assert.match(viewRowSource, /data-pricing-rule-action="view-counterparty"/);
  assert.match(viewRowSource, />visibility<\/span>/);
  assert.match(
    viewRowSource,
    /aria-label="View Pricing Rule \$\{escapeHtml\(rule\.pricingRuleId\)\} in Trading Counterparty settings"/
  );
  assert.doesNotMatch(viewRowSource, /data-tooltip="View Pricing Rule"|title="View Pricing Rule"/);
  assert.match(renderSource, /activePricingRulesScope === "INTERNAL" \? 10 : 9/);
});

test("Pricing Rules suppresses hover tooltips across the page", () => {
  const viewRowSource = functionSource(runtimeSource, "renderPricingRuleViewRow");
  const editRowSource = functionSource(runtimeSource, "renderPricingRuleEditRow");
  const assignmentSource = functionSource(
    runtimeSource,
    "pricingRuleAutoManagementAdmissionMarkup"
  );
  const overflowSource = functionSource(runtimeSource, "syncNativeTableOverflowTooltips");
  const tooltipSource = functionSource(runtimeSource, "showAppTooltip");
  const nativeTooltipSource = functionSource(runtimeSource, "migrateNativeTooltipElement");
  const saveAvailabilitySource = functionSource(runtimeSource, "setSaveButtonAvailability");

  assert.match(pricingRulesMarkup, /id="pricingRulesPage"[^>]*data-disable-tooltips/);
  [pricingRulesMarkup, viewRowSource, editRowSource, assignmentSource].forEach(source => {
    assert.doesNotMatch(source, /\bdata-tooltip=|\btitle=/);
  });
  [overflowSource, tooltipSource, nativeTooltipSource, saveAvailabilitySource].forEach(source => {
    assert.match(source, /data-disable-tooltips/);
  });
});

test("Pricing Rules offers a compact default and an Advanced View for Trade Context", () => {
  const syncSource = functionSource(runtimeSource, "syncPricingRulesAdvancedViewPresentation");
  const setSource = functionSource(runtimeSource, "setPricingRulesAdvancedView");
  const viewRowSource = functionSource(runtimeSource, "renderPricingRuleViewRow");

  assert.match(
    pricingRulesMarkup,
    /id="pricingRulesAdvancedView"[\s\S]*?for="pricingRulesAdvancedView">Advanced View<\/label>/
  );
  assert.match(
    pricingRulesMarkup,
    /data-ui-column-key="trade_context_id">[\s\S]*?data-ui-column-key="trade_context" hidden>/
  );
  assert.match(pricingRulesMarkup, />Trade Context ID<\/span>/);
  assert.match(pricingRulesMarkup, /id="pricingRuleTradeContextHeader" hidden/);
  assert.match(syncSource, /pricingRuleTradeContextHeader\.hidden = !pricingRulesAdvancedViewEnabled/);
  assert.match(setSource, /pricingRuleHeaderFilterControl\("pricingContextPath"\)/);
  assert.match(viewRowSource, /<td>\$\{escapeHtml\(rule\.pricingContextId\)\}<\/td>/);
  assert.match(viewRowSource, /pricing-rule-context-column"\$\{tradeContextHidden\}/);
  assert.match(viewRowSource, /class="pricing-rule-margin-column"/);
  assert.match(
    foundationStyles,
    /\.pricing-rules-table \.pricing-rule-margin-column\s*\{[\s\S]*?text-align:\s*right;/
  );
  assert.doesNotMatch(foundationStyles, /\.pricing-rules-table td:nth-child\(/);
});

test("Trades labels its detail switch as Advanced View", () => {
  assert.equal((tradesMarkup.match(/>Advanced View<\/label>/g) || []).length, 2);
  assert.doesNotMatch(tradesMarkup, />Audit View<\/label>/);
});

test("Pricing Rule route reveals its Trade Context without editing the rule", () => {
  const syncSource = functionSource(counterpartySource, "syncClientProfileRouteView");
  const revealSource = functionSource(counterpartySource, "revealClientPricingRuleRoute");
  const navigationSource = functionSource(counterpartySource, "setClientProfileDetailNavigation");
  const backSource = functionSource(counterpartySource, "navigateBackFromClientProfileRoute");
  const profileEditSource = functionSource(counterpartySource, "startClientProfileEdit");

  assert.match(syncSource, /routeState\.mode === "pricing-rule"/);
  assert.match(syncSource, /Promise\.resolve\(tradeContextsRequest\)/);
  assert.match(syncSource, /revealClientPricingRuleRoute\(\)/);
  assert.match(revealSource, /String\(rule\.pricingRuleId\) === routeState\.pricingRuleId/);
  assert.match(revealSource, /contextIsAttached/);
  assert.doesNotMatch(revealSource, /startClientPricingRuleEdit/);
  assert.match(revealSource, /collapseAllClientPricingConfigurationContexts\(profile\)/);
  assert.match(revealSource, /clientPricingConfigurationCollapsedSet\(profile\)\.delete/);
  assert.doesNotMatch(counterpartySource, /is-route-focused|focusClientPricingRuleRouteNode/);
  assert.doesNotMatch(navigationSource, /clientProfileReturnNavigation/);

  assert.match(navigationSource, /`Pricing Rule \$\{routeState\.pricingRuleId\}`/);
  assert.match(backSource, /location\.hash = routeState\.returnHash/);
  assert.match(profileEditSource, /return tradeContextsRequest/);
  assert.equal(
    (workspaceSource.match(/navigateBackFromClientProfileRoute/g) || []).length,
    3
  );
});

test("opening Trading Counterparty settings collapses every Trade Context by default", () => {
  const syncSource = functionSource(counterpartySource, "syncClientProfileRouteView");
  const profileEditSource = functionSource(counterpartySource, "startClientProfileEdit");
  const collapseSource = functionSource(
    counterpartySource,
    "collapseAllClientPricingConfigurationContexts"
  );

  assert.match(syncSource, /startClientProfileEdit\(index, \{\s*collapseTradeContexts: true\s*\}\)/);
  assert.match(profileEditSource, /if \(options\.collapseTradeContexts\)/);
  assert.match(profileEditSource, /render: !options\.collapseTradeContexts/);
  assert.match(profileEditSource, /collapseAllClientPricingConfigurationContexts\(profile, contexts\)/);
  assert.match(collapseSource, /collapsedContexts\.clear\(\)/);
  assert.match(collapseSource, /collapsedContexts\.add\(String\(context\.pricingContextId\)\)/);
});
