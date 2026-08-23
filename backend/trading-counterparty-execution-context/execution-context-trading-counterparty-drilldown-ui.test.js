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

function routeHelpers(initialHash = "#trading-counterparties") {
  return new Function(
    "location",
    `
      function pricingRoute() { return "#execution-context"; }
      function pricingRouteStateFromLocation(hash = location.hash) {
        return { matches: /^#(?:execution-context|pricing)(?:\\?[^#]*)?$/.test(String(hash || "")) };
      }
      ${topLevelFunctionSource("clientProfileRoute")}
      ${topLevelFunctionSource("normalizedPricingContextReturnRoute")}
      ${topLevelFunctionSource("tradingCounterpartiesForExecutionContextRoute")}
      ${topLevelFunctionSource("clientProfileRouteStateFromLocation")}
      return {
        clientProfileRoute,
        tradingCounterpartiesForExecutionContextRoute,
        clientProfileRouteStateFromLocation
      };
    `
  )({ hash: initialHash });
}

test("Trading Counterparty drilldown route preserves the exact Execution Context return hash", () => {
  const helpers = routeHelpers();
  const returnHash = "#execution-context?servicing-location=002";
  const route = helpers.tradingCounterpartiesForExecutionContextRoute(17, returnHash);

  assert.equal(
    route,
    "#trading-counterparties?execution-context=17&return=%23execution-context%3Fservicing-location%3D002"
  );
  assert.deepEqual(helpers.clientProfileRouteStateFromLocation(route), {
    matches: true,
    mode: "related",
    counterpartyId: "",
    executionContextId: 17,
    returnHash
  });
  assert.equal(
    helpers.tradingCounterpartiesForExecutionContextRoute("invalid", "#database"),
    "#trading-counterparties"
  );
  assert.equal(
    helpers.clientProfileRouteStateFromLocation(
      "#trading-counterparties?execution-context=17&return=%23database"
    ).returnHash,
    "#execution-context"
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
      executionContextId: null,
      returnHash: "#execution-context"
    }
  );
  assert.equal(
    helpers.clientProfileRouteStateFromLocation("#trading-counterparties?execution-context=0").mode,
    "list"
  );
});

test("Execution Context usage is rendered as an accessible eye action", () => {
  const markupSource = topLevelFunctionSource("attachedTradingCounterpartiesButtonMarkup");
  const viewRowSource = topLevelFunctionSource("renderPricingContextViewRow");
  const editRowSource = topLevelFunctionSource("renderPricingContextEditRow");

  assert.match(markupSource, /data-pricing-context-action="view-trading-counterparties"/);
  assert.match(markupSource, /View \$\{count\} attached \$\{counterpartyLabel\}/);
  assert.match(markupSource, /No attached Trading Counterparties/);
  assert.match(markupSource, /count === 1 \? "Trading Counterparty" : "Trading Counterparties"/);
  assert.match(markupSource, /disabled \? " disabled" : ""/);
  assert.match(markupSource, />visibility<\/span>/);
  assert.match(viewRowSource, /attachedTradingCounterpartiesButtonMarkup\(context, index\)/);
  assert.match(editRowSource, /attachedTradingCounterpartiesButtonMarkup\(context, index, true\)/);
  assert.doesNotMatch(viewRowSource, /<td>\$\{usage\}<\/td>/);
});

test("related Trading Counterparty list is read-only and never falls back to the full list", () => {
  const rowSource = topLevelFunctionSource("renderTradingCounterpartyViewRow");
  const filterSource = topLevelFunctionSource("filteredClientProfiles");
  const renderSource = topLevelFunctionSource("renderClientProfiles");
  const syncSource = topLevelFunctionSource("syncClientProfileRouteView");

  assert.match(html, /id="clientProfileBreadcrumb" aria-label="breadcrumb" hidden/);
  assert.ok((html.match(/data-client-profile-actions-column/g) || []).length >= 4);
  assert.match(rowSource, /relatedView \? "" : ' tabindex="0"'/);
  assert.match(rowSource, /\$\{relatedView \? "" : `/);
  assert.match(filterSource, /tradingCounterpartyMatchesRouteScope\(profile\)/);
  assert.match(renderSource, /clientProfileRouteScope\?\.status === "loading"/);
  assert.match(renderSource, /clientProfileRouteScope\?\.status === "error"/);
  assert.match(syncSource, /clientProfileNewButton\.hidden = true/);
  assert.match(syncSource, /clientProfileBreadcrumbBackLink\.href = clientProfileRouteScope\.returnHash/);
  assert.match(
    inlineScript,
    /clientProfileRowsEl\.addEventListener\("click", event => \{\s*if \(clientProfileRouteScope\) \{\s*return;/
  );
  assert.match(
    inlineScript,
    /clientProfileRowsEl\.addEventListener\("keydown", event => \{\s*if \(clientProfileRouteScope \|\|/
  );
});
