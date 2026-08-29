"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..", "..");
const hedgingSettingsMarkup = fs.readFileSync(
  path.join(root, "frontend", "features", "hedging", "hedging-settings.page.html"),
  "utf8"
);
const routeSource = fs.readFileSync(
  path.join(root, "frontend", "features", "fx-position", "fx-position.page.js"),
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
      function hedgingSettingsRoute(section = "quick") {
        return section === "initial"
          ? "#hedging-settings:auto-hedging:initial-admission"
          : "#hedging-settings:quick-hedge";
      }
      function settingsRoute() { return "#settings:currency-pairs"; }
      function normalizedCurrencyPairSettingsReturnRoute() {
        return "#settings:currency-pairs";
      }
      ${functionSource(routeSource, "normalizedAutoHedgingAdmissionReturnRoute")}
      ${functionSource(routeSource, "pricingRulesRoute")}
      ${functionSource(routeSource, "autoHedgingAdmissionPricingRulesRoute")}
      ${functionSource(routeSource, "normalizedCcyPairRouteCode")}
      ${functionSource(routeSource, "pricingRulesRouteStateFromLocation")}
      return {
        autoHedgingAdmissionPricingRulesRoute,
        pricingRulesRouteStateFromLocation
      };
    `
  )();
}

test("Client FX Deals policy presents Pricing Rule after Execution Context", () => {
  const executionContextIndex = hedgingSettingsMarkup.indexOf(
    'id="autoHedgingAdmissionCoreRuleTitle"'
  );
  const pricingRuleIndex = hedgingSettingsMarkup.indexOf(
    'id="autoHedgingAdmissionPricingRuleTitle"'
  );
  const deviationIndex = hedgingSettingsMarkup.indexOf(
    'id="autoHedgingEligibilityChecksTitle"'
  );

  assert.ok(executionContextIndex >= 0);
  assert.ok(pricingRuleIndex > executionContextIndex);
  assert.ok(deviationIndex > pricingRuleIndex);
  assert.match(
    hedgingSettingsMarkup,
    />rule<\/span>[\s\S]*?id="autoHedgingAdmissionPricingRuleTitle">Pricing Rule<\/h5>[\s\S]*?Uses the Execution Context Admission Policy unless overridden by Manual Control\./
  );
  assert.match(
    hedgingSettingsMarkup,
    /href="#pricing-rules:external-counterparties\?focus=auto-hedging-admission&amp;return=%23hedging-settings%3Aauto-hedging%3Ainitial-admission"[\s\S]*?aria-label="Open Pricing Rule settings"[\s\S]*?data-tooltip="Open Pricing Rule settings"[\s\S]*?>settings<\/span>/
  );
});

test("Pricing Rule Admission navigation preserves focus, scope and a safe return route", () => {
  const helpers = pricingRulesRouteHelpers();
  const initialAdmissionHash = "#hedging-settings:auto-hedging:initial-admission";
  const externalRoute = helpers.autoHedgingAdmissionPricingRulesRoute(
    initialAdmissionHash
  );

  assert.equal(
    externalRoute,
    "#pricing-rules:external-counterparties?focus=auto-hedging-admission&return=%23hedging-settings%3Aauto-hedging%3Ainitial-admission"
  );
  assert.deepEqual(helpers.pricingRulesRouteStateFromLocation(externalRoute), {
    matches: true,
    mode: "focused",
    scope: "EXTERNAL",
    pairCode: "",
    currencyPair: "",
    focus: "auto-hedging-admission",
    returnHash: initialAdmissionHash
  });

  const internalRoute = helpers.autoHedgingAdmissionPricingRulesRoute(
    initialAdmissionHash,
    "INTERNAL"
  );
  assert.match(internalRoute, /^#pricing-rules:internal-units\?/);
  assert.equal(
    helpers.pricingRulesRouteStateFromLocation(internalRoute).scope,
    "INTERNAL"
  );
  assert.equal(
    helpers.pricingRulesRouteStateFromLocation(
      "#pricing-rules:external-counterparties?focus=auto-hedging-admission&return=%23database"
    ).returnHash,
    initialAdmissionHash
  );
});

test("focused Pricing Rules route provides breadcrumbs and briefly emphasizes the override column", () => {
  const syncSource = functionSource(runtimeSource, "syncPricingRulesRouteView");
  const highlightSource = functionSource(
    runtimeSource,
    "highlightPricingRuleAutoHedgingAdmissionColumn"
  );
  const scopePresentationSource = functionSource(
    runtimeSource,
    "syncPricingRulesScopePresentation"
  );

  assert.match(
    pricingRulesMarkup,
    /id="pricingRuleAutoHedgingAdmissionHeader"[^>]*tabindex="-1"[^>]*data-pricing-rule-column="autoHedgingAdmissionModeOverride"/
  );
  assert.match(syncSource, /pricingRulesBreadcrumb\.hidden = !pricingRulesRouteScope && !focusedAdmissionView/);
  assert.match(syncSource, /pricingRulesBreadcrumbBackLink\.href = routeState\.returnHash/);
  assert.match(syncSource, /Initial Auto Hedging Admission Policy/);
  assert.match(syncSource, /Pricing Rules — Auto Hedging Admission/);
  assert.match(syncSource, /highlightPricingRuleAutoHedgingAdmissionColumn\(focusedAdmissionView\)/);
  assert.match(scopePresentationSource, /autoHedgingAdmissionPricingRulesRoute/);
  assert.match(highlightSource, /is-auto-hedging-admission-focused/);
  assert.match(highlightSource, /scrollIntoView/);
  assert.match(highlightSource, /prefers-reduced-motion: reduce/);
  assert.match(highlightSource, /\.focus\(\{ preventScroll: true \}\)/);
  assert.match(highlightSource, /2600/);
  assert.match(
    referenceTableStyles,
    /#pricingRulesTable\.is-auto-hedging-admission-focused \[data-pricing-rule-column="autoHedgingAdmissionModeOverride"\]/
  );
});
