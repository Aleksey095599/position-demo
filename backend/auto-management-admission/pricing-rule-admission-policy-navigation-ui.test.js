"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..", "..");
const hedgingSettingsMarkup = fs.readFileSync(
  path.join(root, "frontend", "features", "position", "position-management-settings.page.html"),
  "utf8"
);
const routeSource = fs.readFileSync(
  path.join(root, "frontend", "features", "position", "position.page.js"),
  "utf8"
);
const runtimeSource = fs.readFileSync(
  path.join(root, "frontend", "app", "core", "runtime.js"),
  "utf8"
);
const pricingRulesMarkup = fs.readFileSync(
  path.join(root, "frontend", "features", "pricing", "pricing-rules.page.html"),
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

function pricingRulesRouteHelpers() {
  return new Function(
    `
      const location = { hash: "#pricing-rules" };
      function settingsRoute() { return "#settings:currency-pairs"; }
      function normalizedCurrencyPairSettingsReturnRoute() {
        return "#settings:currency-pairs";
      }
      ${routeSource}
      return {
        autoManagementAdmissionPricingRulesRoute,
        pricingRulesRouteStateFromLocation
      };
    `
  )();
}

test("Initial Mode Assignment links open the shared Trade Context and Pricing Rules settings", () => {
  const suffix = "?focus=auto-management-admission&amp;return=%23position-management-settings%2Finitial-mode-assignment";
  assert.ok(hedgingSettingsMarkup.includes('href="#trade-context' + suffix + '"'));
  assert.ok(hedgingSettingsMarkup.includes('href="#pricing-rules:external-counterparties' + suffix + '"'));
  assert.doesNotMatch(hedgingSettingsMarkup, /Manual only|Manual Release/);
});

test("Pricing Rule Admission navigation preserves focus, scope and a safe return route", () => {
  const helpers = pricingRulesRouteHelpers();
  const initialAdmissionHash = "#position-management-settings/initial-mode-assignment";
  const externalRoute = helpers.autoManagementAdmissionPricingRulesRoute(
    initialAdmissionHash
  );

  assert.equal(
    externalRoute,
    "#pricing-rules:external-counterparties?focus=auto-management-admission&return=%23position-management-settings%2Finitial-mode-assignment"
  );
  assert.deepEqual(helpers.pricingRulesRouteStateFromLocation(externalRoute), {
    matches: true,
    mode: "focused",
    scope: "EXTERNAL",
    pairCode: "",
    currencyPair: "",
    focus: "auto-management-admission",
    returnHash: initialAdmissionHash
  });

  const internalRoute = helpers.autoManagementAdmissionPricingRulesRoute(
    initialAdmissionHash,
    "INTERNAL"
  );
  assert.match(internalRoute, /^#pricing-rules:internal-units\?/);
  assert.equal(
    helpers.pricingRulesRouteStateFromLocation(internalRoute).scope,
    "INTERNAL"
  );
  assert.equal(
    helpers.pricingRulesRouteStateFromLocation(internalRoute).returnHash,
    initialAdmissionHash
  );
  assert.equal(
    helpers.pricingRulesRouteStateFromLocation(
      "#pricing-rules:external-counterparties?focus=auto-management-admission&return=%23database"
    ).returnHash,
    initialAdmissionHash
  );
});

test("focused Pricing Rules route preserves its context and briefly emphasizes the override column", () => {
  const syncSource = functionSource(runtimeSource, "syncPricingRulesRouteView");
  const highlightSource = functionSource(
    runtimeSource,
    "highlightPricingRuleAutoManagementAdmissionColumn"
  );
  const scopePresentationSource = functionSource(
    runtimeSource,
    "syncPricingRulesScopePresentation"
  );

  assert.match(
    pricingRulesMarkup,
    /id="pricingRuleAutoManagementAdmissionHeader"[^>]*tabindex="-1"[^>]*data-pricing-rule-column="autoManagementAdmissionModeOverride"/
  );
  const assignmentHeader = pricingRulesMarkup.match(
    /<th id="pricingRuleAutoManagementAdmissionHeader"[\s\S]*?<\/th>/
  )?.[0] || "";
  assert.doesNotMatch(assignmentHeader, /\stitle=|data-tooltip=/);
  assert.match(syncSource, /pricingRulesContextLabel\.hidden = !focusedAdmissionView/);
  assert.doesNotMatch(syncSource, /pricingRulesReturnLink/);
  assert.match(syncSource, /Pricing Rules — Initial Mode Assignment/);
  assert.match(syncSource, /highlightPricingRuleAutoManagementAdmissionColumn\(focusedAdmissionView\)/);
  assert.match(scopePresentationSource, /autoManagementAdmissionPricingRulesRoute/);
  assert.match(highlightSource, /is-auto-management-admission-focused/);
  assert.match(highlightSource, /scrollIntoView/);
  assert.match(highlightSource, /prefers-reduced-motion: reduce/);
  assert.match(highlightSource, /\.focus\(\{ preventScroll: true \}\)/);
  assert.match(highlightSource, /2600/);
  assert.match(
    referenceTableStyles,
    /#pricingRulesTable\.is-auto-management-admission-focused \[data-pricing-rule-column="autoManagementAdmissionModeOverride"\]/
  );
});
