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

function routeHelpers(initialHash = "#pricing-rules:external-counterparties") {
  return new Function(
    "location",
    `
      function pricingRoute() { return "#execution-context"; }
      function pricingRouteStateFromLocation(hash = location.hash) {
        return { matches: String(hash || "").startsWith("#execution-context") };
      }
      function pricingRulesRoute(scope = "EXTERNAL") {
        return scope === "INTERNAL"
          ? "#pricing-rules:internal-units"
          : "#pricing-rules:external-counterparties";
      }
      function pricingRulesRouteStateFromLocation(hash = location.hash) {
        return { matches: String(hash || "").startsWith("#pricing-rules:") };
      }
      ${functionSource(databaseSource, "clientProfileRoute")}
      ${functionSource(databaseSource, "normalizedPricingRulesReturnRoute")}
      ${functionSource(databaseSource, "pricingRuleClientProfileRoute")}
      ${functionSource(databaseSource, "normalizedPricingContextReturnRoute")}
      ${functionSource(databaseSource, "clientProfileRouteStateFromLocation")}
      return {
        pricingRuleClientProfileRoute,
        clientProfileRouteStateFromLocation
      };
    `
  )({ hash: initialHash });
}

test("Pricing Rule edit route preserves the exact Pricing Rules entry route", () => {
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
    executionContextId: null,
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

test("Pricing Rules table exposes a direct edit action into the counterparty card", () => {
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
  assert.match(viewRowSource, /href="\$\{escapeHtml\(editRoute\)\}"/);
  assert.match(viewRowSource, /data-pricing-rule-action="edit-counterparty"/);
  assert.match(viewRowSource, />edit<\/span>/);
  assert.match(
    viewRowSource,
    /aria-label="Edit Pricing Rule \$\{escapeHtml\(rule\.pricingRuleId\)\} in Trading Counterparty card"/
  );
  assert.match(renderSource, /activePricingRulesScope === "INTERNAL" \? 9 : 8/);
});

test("focused counterparty route opens the requested rule and keeps a return breadcrumb", () => {
  const syncSource = functionSource(counterpartySource, "syncClientProfileRouteView");
  const openSource = functionSource(counterpartySource, "openClientPricingRuleRouteEditor");
  const navigationSource = functionSource(counterpartySource, "setClientProfileDetailNavigation");
  const backSource = functionSource(counterpartySource, "navigateBackFromClientProfileRoute");
  const profileEditSource = functionSource(counterpartySource, "startClientProfileEdit");

  assert.match(syncSource, /routeState\.mode === "pricing-rule"/);
  assert.match(syncSource, /Promise\.resolve\(executionContextsRequest\)/);
  assert.match(syncSource, /openClientPricingRuleRouteEditor\(\)/);
  assert.match(openSource, /String\(rule\.pricingRuleId\) === routeState\.pricingRuleId/);
  assert.match(openSource, /contextIsAttached/);
  assert.match(openSource, /startClientPricingRuleEdit\(pricingRuleIndex\)/);
  assert.match(openSource, /focusClientPricingRuleRouteEditor\(\)/);
  assert.match(navigationSource, /clientProfileBreadcrumbBackLink\.href = routeState\.returnHash/);
  assert.match(navigationSource, /clientProfileBreadcrumbBackLink\.textContent = backLabel/);
  assert.match(navigationSource, /`Pricing Rule \$\{routeState\.pricingRuleId\}`/);
  assert.match(backSource, /location\.hash = routeState\.returnHash/);
  assert.match(profileEditSource, /return executionContextsRequest/);
  assert.equal(
    (workspaceSource.match(/navigateBackFromClientProfileRoute/g) || []).length,
    3
  );
});
