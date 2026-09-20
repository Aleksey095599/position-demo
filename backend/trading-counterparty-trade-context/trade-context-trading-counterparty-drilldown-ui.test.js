"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { readFrontendSources } = require("../test-support/frontend-source.js");

const ROOT = path.resolve(__dirname, "..", "..");
const { combinedSource: html, appScript: inlineScript } = readFrontendSources(ROOT);

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

function routeHelpers(initialHash = "#trading-counterparties") {
  return new Function(
    "location",
    `
      function pricingRoute() { return "#trade-context"; }
      function pricingRouteStateFromLocation(hash = location.hash) {
        return { matches: /^#(?:trade-context|pricing)(?:\\?[^#]*)?$/.test(String(hash || "")) };
      }
      ${topLevelFunctionSource("normalizedTradingCounterpartyListRoute")}
      ${topLevelFunctionSource("clientProfileRoute")}
      ${topLevelFunctionSource("tradingCounterpartiesForTradeContextRoute")}
      ${topLevelFunctionSource("clientProfileRouteStateFromLocation")}
      return {
        clientProfileRoute,
        tradingCounterpartiesForTradeContextRoute,
        clientProfileRouteStateFromLocation
      };
    `
  )({ hash: initialHash });
}

test("Trade Context opens the standard Trading Counterparty list with a URL filter", () => {
  const helpers = routeHelpers();
  const route = helpers.tradingCounterpartiesForTradeContextRoute(17);

  assert.equal(route, "#trading-counterparties?trade-context=17");
  assert.deepEqual(helpers.clientProfileRouteStateFromLocation(route), {
    matches: true,
    mode: "list",
    counterpartyId: "",
    tradeContextId: 17,
    returnHash: "#trade-context"
  });
  assert.equal(
    helpers.tradingCounterpartiesForTradeContextRoute("invalid", "#database"),
    "#trading-counterparties"
  );
});

test("legacy Trading Counterparty list, create and detail routes remain valid", () => {
  const helpers = routeHelpers();

  assert.equal(helpers.clientProfileRouteStateFromLocation("#trading-counterparties").mode, "list");
  assert.equal(helpers.clientProfileRouteStateFromLocation("#client-profile").mode, "list");
  assert.equal(helpers.clientProfileRouteStateFromLocation("#trading-counterparties/new").mode, "create");
  assert.deepEqual(
    helpers.clientProfileRouteStateFromLocation("#trading-counterparties/42"),
    {
      matches: true,
      mode: "detail",
      counterpartyId: "42",
      tradeContextId: null,
      returnHash: "#trade-context",
      listReturnHash: "#trading-counterparties"
    }
  );
  assert.equal(
    helpers.clientProfileRoute(42, "#trading-counterparties?trade-context=17"),
    "#trading-counterparties/42?return=%23trading-counterparties%3Ftrade-context%3D17"
  );
  assert.equal(
    helpers.clientProfileRouteStateFromLocation(
      "#trading-counterparties/42?return=%23trading-counterparties%3Ftrade-context%3D17"
    ).listReturnHash,
    "#trading-counterparties?trade-context=17"
  );
  assert.equal(
    helpers.clientProfileRouteStateFromLocation("#trading-counterparties?trade-context=0").mode,
    "list"
  );
});

test("Trade Context usage is rendered as an accessible eye action", () => {
  const markupSource = topLevelFunctionSource("attachedTradingCounterpartiesButtonMarkup");
  const viewRowSource = topLevelFunctionSource("renderPricingContextViewRow");
  const editRowSource = topLevelFunctionSource("renderPricingContextEditRow");

  assert.match(markupSource, /data-pricing-context-action="view-trading-counterparties"/);
  assert.match(html, /aria-label="Attached Counterparties"/);
  assert.match(html, /data-tooltip="Attached Counterparties"/);
  assert.doesNotMatch(html, />Attached(?:<br>|\s+)Counterparties<\/span>/);
  assert.match(markupSource, /class="reference-related-count"/);
  assert.match(markupSource, />\$\{count\}<\/span>/);
  assert.match(markupSource, /View \$\{count\} attached/);
  assert.match(markupSource, /No attached Counterparties/);
  assert.match(markupSource, /disabled \? " disabled" : ""/);
  assert.match(markupSource, />visibility<\/span>/);
  assert.doesNotMatch(markupSource, /data-tooltip|title=/);
  assert.match(viewRowSource, /attachedTradingCounterpartiesButtonMarkup\(context, index\)/);
  assert.match(editRowSource, /attachedTradingCounterpartiesButtonMarkup\(context, index, true\)/);
  assert.doesNotMatch(viewRowSource, /<td>\$\{usage\}<\/td>/);
});

test("Reference Data usage shows counts and opens the filtered Trade Context list", () => {
  const markupSource = topLevelFunctionSource("attachedTradeContextsButtonMarkup");
  const viewSource = topLevelFunctionSource("viewReferenceDataTradeContexts");
  const syncSource = topLevelFunctionSource("syncPricingContextRouteView");
  const clearSource = topLevelFunctionSource("clearPricingContextFilters");

  assert.match(markupSource, /class="reference-related-count"/);
  assert.match(markupSource, />\$\{count\}<\/span>/);
  assert.match(markupSource, /data-reference-action="view-trade-contexts"/);
  assert.match(markupSource, /aria-label="\$\{escapeHtml\(viewLabel\)\}"/);
  assert.doesNotMatch(markupSource, /data-tooltip|title=/);
  assert.match(viewSource, /location\.hash = pricingRoute\(kind, referenceId\)/);
  assert.match(syncSource, /routeState\.mode === "filtered"/);
  assert.match(syncSource, /scopeControl\.value = pricingContextRouteScope\.value/);
  assert.doesNotMatch(syncSource, /scopeControl\.readOnly = true/);
  assert.match(html, /id="pricingContextClearFiltersButton"[^>]*aria-label="Clear Trade Context filters"[^>]*disabled/);
  assert.match(
    html,
    /data-ui-table-layout-host="trade_contexts_grid">[\s\S]*?class="ui-table-layout-actions">[\s\S]*?id="pricingContextNewButton"[\s\S]*?id="pricingContextClearFiltersButton"[\s\S]*?<\/div>[\s\S]*?<\/div>/
  );
  assert.match(html, /class="btn btn-sm btn-outline-secondary ui-table-layout-button" id="pricingContextClearFiltersButton"/);
  assert.match(clearSource, /control\.value = ""/);
  assert.match(clearSource, /clearPricingContextReferenceFilterRoute\(\)/);
  assert.match(inlineScript, /pricingContextClearFiltersButton\.addEventListener\("click", clearPricingContextFilters\)/);
});

test("Trade Context filter keeps the standard Trading Counterparty list interactive", () => {
  const rowSource = topLevelFunctionSource("renderTradingCounterpartyViewRow");
  const filterSource = topLevelFunctionSource("filteredClientProfiles");
  const renderSource = topLevelFunctionSource("renderClientProfiles");
  const syncSource = topLevelFunctionSource("syncClientProfileRouteView");
  const filterOptionsSource = topLevelFunctionSource("syncTradingCounterpartyTradeContextFilterOptions");
  const toolbarWidthSource = topLevelFunctionSource("syncTradingCounterpartyFilterToolbarWidth");
  const scopeCountSource = topLevelFunctionSource("tradingCounterpartyTradeContextScopeCounts");
  const syncScopeCountSource = topLevelFunctionSource("syncTradingCounterpartyTradeContextScopeCounts");

  assert.match(html, /id="tradingCounterpartyTradeContextFilter"/);
  assert.match(html, /<span>Trade Context Filter<\/span>/);
  assert.match(html, /All Trade Contexts/);
  assert.match(html, /id="tradingCounterpartyTradeContextToggle"/);
  assert.match(html, /id="tradingCounterpartyTradeContextMenu"/);
  assert.match(html, /id="tradingCounterpartyTradeContextClear"[^>]*disabled/);
  assert.match(html, /id="tradingCounterpartyTradeContextClear"[^>]*aria-label="Clear Trade Context filter"/);
  assert.doesNotMatch(html, /id="tradingCounterpartyTradeContextClear"[^>]*>[\s\S]*?<span>Clear<\/span>/);
  assert.match(html, /data-trading-counterparty-scope-count="EXTERNAL" hidden>\(0\)<\/span>/);
  assert.match(html, /data-trading-counterparty-scope-count="INTERNAL" hidden>\(0\)<\/span>/);
  assert.match(
    html,
    /id="tradingCounterpartyFilterToolbar"[\s\S]*id="tradingCounterpartyTradeContextFilter"[\s\S]*id="tradingCounterpartyScopeTabs"[\s\S]*id="clientProfileLayout"/
  );
  assert.match(filterOptionsSource, /pricingContextFacetsMarkup\(selectedContext, \{ originatingSystemLabel: true \}\)/);
  assert.match(filterOptionsSource, /tradingCounterpartyTradeContextClear\.disabled = !selectedContext/);
  assert.match(inlineScript, /tradingCounterpartyTradeContextClear\.addEventListener\("click"/);
  assert.match(toolbarWidthSource, /clientProfileListView\.getBoundingClientRect\(\)\.width/);
  assert.match(inlineScript, /tradingCounterpartyTableResizeObserver\.observe\(clientProfileListView\)/);
  assert.match(rowSource, /tabindex="0"/);
  assert.match(rowSource, /data-profile-action="edit"/);
  assert.doesNotMatch(rowSource, /relatedView/);
  assert.match(filterSource, /tradingCounterpartyMatchesTradeContextFilter\(profile\)/);
  assert.match(renderSource, /clientProfileTradeContextFilter\?\.status === "loading"/);
  assert.match(renderSource, /clientProfileTradeContextFilter\?\.status === "error"/);
  assert.match(renderSource, /syncTradingCounterpartyTradeContextScopeCounts\(\)/);
  assert.match(syncScopeCountSource, /count\.hidden = !counts/);
  assert.match(syncSource, /routeState\.mode === "list" && routeState\.tradeContextId/);
  assert.match(syncSource, /syncTradingCounterpartyTradeContextFilterOptions\(routeState\.tradeContextId\)/);
  assert.doesNotMatch(syncSource, /is-related-view|clientProfileNewButton\.hidden = true/);
  assert.doesNotMatch(inlineScript, /if \(clientProfileRouteScope\)/);

  const countByScope = new Function(
    "clientProfiles",
    "clientProfileTradeContextFilter",
    "normalizedCounterpartyScope",
    "tradingCounterpartyMatchesTradeContextFilter",
    `${scopeCountSource}; return tradingCounterpartyTradeContextScopeCounts();`
  );
  const profiles = [
    { counterpartyId: 1, counterpartyScope: "EXTERNAL" },
    { counterpartyId: 2, counterpartyScope: "INTERNAL" },
    { counterpartyId: 3, counterpartyScope: "INTERNAL" },
    { counterpartyId: 4, counterpartyScope: "EXTERNAL" }
  ];
  const contextFilter = {
    counterpartyIds: new Set(["1", "2", "3"]),
    status: "loaded"
  };
  const normalizedScope = value => value === "INTERNAL" ? "INTERNAL" : "EXTERNAL";
  const matchesContext = profile => contextFilter.counterpartyIds.has(String(profile.counterpartyId));

  assert.equal(
    countByScope(profiles, null, normalizedScope, () => true),
    null
  );
  assert.deepEqual(
    countByScope(profiles, contextFilter, normalizedScope, matchesContext),
    { EXTERNAL: 1, INTERNAL: 2 }
  );
});
