"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { readFrontendSources } = require("../../test-support/frontend-source.js");

const ROOT = path.resolve(__dirname, "..", "..", "..");
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

function routeHelpers(initialHash = "#settings:currencies") {
  return new Function(
    "location",
    "clientPricingRules",
    `
      ${topLevelFunctionSource("settingsRoute")}
      ${topLevelFunctionSource("currencyPairSettingsForCurrencyRoute")}
      ${topLevelFunctionSource("currencySettingsRouteStateFromLocation")}
      ${topLevelFunctionSource("normalizedCurrencyPairSettingsReturnRoute")}
      ${topLevelFunctionSource("pricingRulesRoute")}
      ${topLevelFunctionSource("normalizedCcyPairRouteCode")}
      ${topLevelFunctionSource("preferredPricingRulesScopeForPair")}
      ${topLevelFunctionSource("pricingRulesForCcyPairRoute")}
      ${topLevelFunctionSource("pricingRulesRouteStateFromLocation")}
      return {
        currencyPairSettingsForCurrencyRoute,
        currencySettingsRouteStateFromLocation,
        pricingRulesForCcyPairRoute,
        pricingRulesRouteStateFromLocation
      };
    `
  )(
    { hash: initialHash },
    [
      { ccyPairCode: "EUR_USD", counterpartyScope: "EXTERNAL" },
      { ccyPairCode: "USD_JPY", counterpartyScope: "INTERNAL" }
    ]
  );
}

test("Currency drilldown route opens the standard Ccy Pair page with a currency filter", () => {
  const helpers = routeHelpers();
  const route = helpers.currencyPairSettingsForCurrencyRoute("usd");

  assert.equal(
    route,
    "#settings:currency-pairs?currency=USD"
  );
  assert.deepEqual(helpers.currencySettingsRouteStateFromLocation(route), {
    matches: true,
    kind: "pairs",
    mode: "filtered",
    filter: { currencyCode: "USD" }
  });
  assert.deepEqual(
    helpers.currencySettingsRouteStateFromLocation(
      "#settings:currency-pairs?currency=USD&return=%23database"
    ),
    {
      matches: true,
      kind: "pairs",
      mode: "filtered",
      filter: { currencyCode: "USD" }
    }
  );
});

test("Pricing Rules drilldown selects a populated scope and preserves the nested return route", () => {
  const helpers = routeHelpers();
  const pairReturnHash = helpers.currencyPairSettingsForCurrencyRoute("USD");
  const route = helpers.pricingRulesForCcyPairRoute("USD_JPY", pairReturnHash);

  assert.equal(
    route,
    "#pricing-rules:internal-units?ccy-pair=USD_JPY&return=%23settings%3Acurrency-pairs%3Fcurrency%3DUSD"
  );
  assert.deepEqual(helpers.pricingRulesRouteStateFromLocation(route), {
    matches: true,
    mode: "related",
    scope: "INTERNAL",
    pairCode: "USD_JPY",
    currencyPair: "USD/JPY",
    returnHash: pairReturnHash
  });
  assert.equal(
    helpers.pricingRulesRouteStateFromLocation(
      "#pricing-rules:external-counterparties?ccy-pair=EUR_USD&return=%23database"
    ).returnHash,
    "#settings:currency-pairs"
  );
});

test("Currency usage renders its count and eye action without a tooltip", () => {
  const markupSource = topLevelFunctionSource("marketRelatedViewButtonMarkup");
  const ccyFormatterSource = topLevelFunctionSource("marketCcyPairsViewFormatter");
  const pairFormatterSource = topLevelFunctionSource("marketPairPricingRulesViewFormatter");

  assert.match(markupSource, /showCount = false, showTooltip = true/);
  assert.match(markupSource, /class="reference-related-count"/);
  assert.match(markupSource, />visibility<\/span>/);
  assert.match(ccyFormatterSource, /"view-currency-pairs"/);
  assert.match(ccyFormatterSource, /item\.pairCount/);
  assert.match(ccyFormatterSource, /\{ showCount: true, showTooltip: false \}/);
  assert.doesNotMatch(ccyFormatterSource, /data-tooltip/);
  assert.match(pairFormatterSource, /"view-pricing-rules"/);
  assert.match(pairFormatterSource, /item\.pricingRulesCount/);
  assert.match(pairFormatterSource, /\{ showCount: true, showTooltip: false \}/);
  assert.doesNotMatch(pairFormatterSource, /data-tooltip/);
  assert.match(inlineScript, /Pricing Rules using Currency Pair/);
  assert.doesNotMatch(inlineScript, /Pricing Rules using this Ccy Pair/);
});

test("Currency drilldown uses the standard Ccy Pair filters and supports clearing them", () => {
  const pairRenderSource = topLevelFunctionSource("renderMarketPairOptionRows");
  const marketSyncSource = topLevelFunctionSource("syncMarketSettingsRouteView");
  const applyFilterSource = topLevelFunctionSource("applyMarketPairRouteCurrencyFilter");
  const clearFiltersSource = topLevelFunctionSource("clearMarketPairFilters");
  const pricingFilterSource = topLevelFunctionSource("filteredPricingRules");
  const pricingSyncSource = topLevelFunctionSource("syncPricingRulesRouteView");
  const pricingPresentationSource = topLevelFunctionSource("syncPricingRulesScopePresentation");
  const pricingClearFiltersSource = topLevelFunctionSource("clearPricingRuleFilters");
  const pricingSyncClearFiltersSource = topLevelFunctionSource("syncPricingRulesClearFiltersButton");
  const pricingFilterInputSource = topLevelFunctionSource("handlePricingRuleHeaderFilterInput");
  const pricingClearRouteSource = topLevelFunctionSource("clearPricingRuleFilterRoute");

  assert.doesNotMatch(html, /id="workspaceBreadcrumbs"/);
  assert.doesNotMatch(html, /id="(?:marketSettings|pricingRules)ReturnNavigation"/);
  assert.match(
    html,
    /<h2 class="table-panel__title">Currency Pairs<\/h2>[\s\S]*?<div class="table-panel__tools" data-ui-table-layout-host="ccy_pair_options_grid">[\s\S]*?<div class="ui-table-layout-actions">[\s\S]*?id="marketPairOptionNewButton"[\s\S]*?id="marketPairClearFiltersButton"[\s\S]*?<\/div>[\s\S]*?<\/div>/
  );
  assert.match(html, /id="marketPairClearFiltersButton"[^>]*aria-label="Clear Ccy Pair filters"[^>]*disabled/);
  assert.doesNotMatch(pairRenderSource, /marketPairRouteCurrencyFilter/);
  assert.match(pairRenderSource, /if \(marketPairOptionsEditState\?\.mode === "create"\)/);
  assert.doesNotMatch(pairRenderSource, /visible: !marketPairRouteCurrencyFilter/);
  assert.match(marketSyncSource, /routeState\.mode === "filtered"/);
  assert.match(marketSyncSource, /marketPairOptionNewButton\.hidden = false/);
  assert.match(applyFilterSource, /setHeaderFilterValue\(\s*"currencyPair",\s*marketPairRouteCurrencyFilter/);
  assert.match(clearFiltersSource, /clearHeaderFilter\(\)/);
  assert.match(marketSyncSource, /marketPairOptionsEditState = null/);
  assert.doesNotMatch(pricingFilterSource, /pricingRuleMatchesRouteScope/);
  assert.match(pricingSyncSource, /currencyPairFilter\.value = pricingRulesRouteScope\.currencyPair/);
  assert.doesNotMatch(pricingSyncSource, /currencyPairFilter\.readOnly = true|Pricing Rules for/);
  assert.doesNotMatch(pricingSyncSource, /pricingRulesReturnLink/);
  assert.match(pricingPresentationSource, /pricingRulesForCcyPairRoute/);
  assert.match(
    html,
    /id="pricingRulesClearFiltersButton"[\s\S]*?filter_alt_off[\s\S]*?id="pricingRulesTableLayoutButton"/
  );
  assert.match(pricingClearFiltersSource, /pricingRuleHeaderFilterControls\.forEach/);
  assert.match(pricingClearFiltersSource, /clearPricingRuleFilterRoute\(\)/);
  assert.match(pricingSyncClearFiltersSource, /pricingRuleFiltersAreActive\(\)/);
  assert.match(pricingFilterInputSource, /clearPricingRuleFilterRoute\(\)/);
  assert.match(pricingClearRouteSource, /pricingRulesRoute\(activePricingRulesScope\)/);
});
