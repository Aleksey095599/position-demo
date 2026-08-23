"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..", "..");
const HTML_PATH = path.join(ROOT, "index.html");
const html = fs.readFileSync(HTML_PATH, "utf8");
const scripts = [...html.matchAll(/<script(?:[^>]*)>([\s\S]*?)<\/script>/g)];
const inlineScript = scripts.at(-1)?.[1] || "";

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
      ${topLevelFunctionSource("normalizedCurrencySettingsReturnRoute")}
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

test("Currency drilldown route preserves its exact Currency Settings return hash", () => {
  const helpers = routeHelpers();
  const route = helpers.currencyPairSettingsForCurrencyRoute("usd", "#settings:currencies");

  assert.equal(
    route,
    "#settings:currency-pairs?currency=USD&return=%23settings%3Acurrencies"
  );
  assert.deepEqual(helpers.currencySettingsRouteStateFromLocation(route), {
    matches: true,
    kind: "pairs",
    mode: "related",
    scope: {
      currencyCode: "USD",
      returnHash: "#settings:currencies"
    }
  });
  assert.equal(
    helpers.currencySettingsRouteStateFromLocation(
      "#settings:currency-pairs?currency=USD&return=%23database"
    ).scope.returnHash,
    "#settings:currencies"
  );
});

test("Pricing Rules drilldown selects a populated scope and preserves the nested return route", () => {
  const helpers = routeHelpers();
  const pairReturnHash = helpers.currencyPairSettingsForCurrencyRoute(
    "USD",
    "#settings:currencies"
  );
  const route = helpers.pricingRulesForCcyPairRoute("USD_JPY", pairReturnHash);

  assert.equal(
    route,
    "#pricing-rules:internal-units?ccy-pair=USD_JPY&return=%23settings%3Acurrency-pairs%3Fcurrency%3DUSD%26return%3D%2523settings%253Acurrencies"
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

test("both usage counters render accessible eye actions with disabled zero states", () => {
  const markupSource = topLevelFunctionSource("marketRelatedViewButtonMarkup");
  const ccyFormatterSource = topLevelFunctionSource("marketCcyPairsViewFormatter");
  const pairFormatterSource = topLevelFunctionSource("marketPairPricingRulesViewFormatter");

  assert.match(markupSource, /View \$\{normalizedCount\} \$\{label\}/);
  assert.match(markupSource, /`No \$\{pluralLabel\}`/);
  assert.match(markupSource, /disabled = editing \|\| !hasRelatedRows/);
  assert.match(markupSource, /data-tooltip=/);
  assert.match(markupSource, />visibility<\/span>/);
  assert.match(ccyFormatterSource, /"view-currency-pairs"/);
  assert.match(ccyFormatterSource, /item\.pairCount/);
  assert.match(pairFormatterSource, /"view-pricing-rules"/);
  assert.match(pairFormatterSource, /item\.pricingRulesCount/);
});

test("related Currency Pair and Pricing Rules views enforce their route scopes", () => {
  const pairRenderSource = topLevelFunctionSource("renderMarketPairOptionRows");
  const marketSyncSource = topLevelFunctionSource("syncMarketSettingsRouteView");
  const pricingFilterSource = topLevelFunctionSource("filteredPricingRules");
  const pricingSyncSource = topLevelFunctionSource("syncPricingRulesRouteView");
  const pricingPresentationSource = topLevelFunctionSource("syncPricingRulesScopePresentation");

  assert.match(html, /id="marketSettingsBreadcrumb" hidden/);
  assert.match(html, /id="pricingRulesBreadcrumb" hidden/);
  assert.match(pairRenderSource, /pair\.baseCcy === marketSettingsRouteScope\.currencyCode/);
  assert.match(pairRenderSource, /pair\.quoteCcy === marketSettingsRouteScope\.currencyCode/);
  assert.match(pairRenderSource, /!marketSettingsRouteScope && marketPairOptionsEditState\?\.mode === "create"/);
  assert.match(marketSyncSource, /marketPairOptionNewButton\.hidden = Boolean\(marketSettingsRouteScope\)/);
  assert.match(marketSyncSource, /marketPairOptionsEditState = null/);
  assert.match(pricingFilterSource, /pricingRuleMatchesRouteScope\(rule\)/);
  assert.match(pricingSyncSource, /currencyPairFilter\.readOnly = true/);
  assert.match(pricingSyncSource, /pricingRulesBreadcrumbBackLink\.href = pricingRulesRouteScope\.returnHash/);
  assert.match(pricingPresentationSource, /pricingRulesForCcyPairRoute/);
});
