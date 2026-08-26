"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..", "..");
const html = [
  path.join(root, "frontend", "features", "pricing", "execution-context.page.html"),
  path.join(root, "frontend", "app", "core", "runtime.js"),
  path.join(root, "frontend", "features", "counterparties", "counterparties.page.js")
].map(filePath => fs.readFileSync(filePath, "utf8")).join("\n");
const layoutsSource = fs.readFileSync(
  path.join(root, "backend", "ui-table-layout", "ui-table-layouts.js"),
  "utf8"
);
const routeSource = fs.readFileSync(
  path.join(root, "frontend", "features", "fx-position", "fx-position.page.js"),
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

function executionContextRouteHelpers() {
  return new Function(
    `
      const location = { hash: "#execution-context" };
      const PRICING_CONTEXT_REFERENCE_FILTERS = Object.freeze({
        servicingBranch: Object.freeze({ parameter: "servicing-location", field: "servicingBranchCode" }),
        settlementSystem: Object.freeze({ parameter: "accounting-system", field: "settlementSystemId" }),
        tradeCaptureChannel: Object.freeze({ parameter: "execution-system", field: "tradeCaptureChannelId" })
      });
      function pricingRoute() { return "#execution-context"; }
      function hedgingSettingsRoute(section = "quick") {
        return section === "initial"
          ? "#hedging-settings:auto-hedging:initial-admission"
          : "#hedging-settings:quick-hedge";
      }
      ${functionSource(routeSource, "normalizedAutoHedgingAdmissionReturnRoute")}
      ${functionSource(routeSource, "autoHedgingAdmissionExecutionContextRoute")}
      ${functionSource(routeSource, "pricingRouteStateFromLocation")}
      return { autoHedgingAdmissionExecutionContextRoute, pricingRouteStateFromLocation };
    `
  )();
}

test("Execution Context exposes Auto Hedging Admission Mode in its grid and editor", () => {
  assert.ok(html.includes('data-ui-column-key="auto_hedging_admission_mode"'));
  assert.ok(html.includes(
    '<span class="button-icon" aria-hidden="true">verified_user</span>\n                      <span>Auto Hedging Admission</span>'
  ));
  assert.ok(html.includes('data-pricing-context-header-filter="autoHedgingAdmissionMode"'));
  assert.ok(html.includes('data-pricing-context-field="autoHedgingAdmissionMode"'));
  assert.ok(html.includes("autoHedgingAdmissionModeBadgeMarkup(context.autoHedgingAdmissionMode)"));
  assert.ok(layoutsSource.includes(
    '["auto_hedging_admission_mode", "Auto Hedging Admission", 232]'
  ));
});

test("Execution Context UI offers exactly the three domain admission modes", () => {
  const editorSelect = html.match(
    /<select class="inline-edit-control" data-pricing-context-field="autoHedgingAdmissionMode"[\s\S]*?<\/select>/
  )?.[0] || "";
  const values = [...editorSelect.matchAll(/<option value="([A-Z_]+)"/g)]
    .map(match => match[1]);

  assert.deepEqual(values, [
    "AUTO_IF_ELIGIBLE",
    "REVIEW_REQUIRED",
    "MANUAL_ONLY"
  ]);
  assert.ok(html.includes("autoHedgingAdmissionMode: context.autoHedgingAdmissionMode"));
});

test("Initial Admission opens the full Execution Context list with a safe return route", () => {
  const helpers = executionContextRouteHelpers();
  const initialAdmissionHash = "#hedging-settings:auto-hedging:initial-admission";
  const route = helpers.autoHedgingAdmissionExecutionContextRoute(initialAdmissionHash);

  assert.equal(
    route,
    "#execution-context?focus=auto-hedging-admission&return=%23hedging-settings%3Aauto-hedging%3Ainitial-admission"
  );
  assert.deepEqual(helpers.pricingRouteStateFromLocation(route), {
    matches: true,
    mode: "focused",
    scope: null,
    focus: "auto-hedging-admission",
    returnHash: initialAdmissionHash
  });
  assert.equal(
    helpers.pricingRouteStateFromLocation(
      "#execution-context?focus=auto-hedging-admission&return=%23database"
    ).returnHash,
    initialAdmissionHash
  );

  const legacyRelatedRoute = helpers.pricingRouteStateFromLocation(
    "#execution-context?servicing-location=002"
  );
  assert.equal(legacyRelatedRoute.mode, "related");
  assert.equal(legacyRelatedRoute.scope.field, "servicingBranchCode");
  assert.equal(legacyRelatedRoute.scope.value, "002");
});

test("focused Execution Context route keeps the list editable and briefly emphasizes Admission", () => {
  const syncSource = functionSource(contextPageSource, "syncPricingContextRouteView");
  const highlightSource = functionSource(contextPageSource, "highlightPricingContextAutoHedgingAdmissionColumn");

  assert.match(html, /id="pricingContextAutoHedgingAdmissionHeader"/);
  assert.match(
    html,
    /id="pricingContextAutoHedgingAdmissionHeader"[^>]*tabindex="-1"[^>]*data-pricing-context-column="autoHedgingAdmissionMode"/
  );
  assert.match(syncSource, /pricingContextNewButton\.hidden = Boolean\(pricingContextRouteScope\)/);
  assert.match(syncSource, /pricingContextBreadcrumb\.hidden = !pricingContextRouteScope && !focusedAdmissionView/);
  assert.match(syncSource, /pricingContextBreadcrumbBackLink\.href = routeState\.returnHash/);
  assert.match(syncSource, /Initial Auto Hedging Admission Policy/);
  assert.match(syncSource, /highlightPricingContextAutoHedgingAdmissionColumn\(focusedAdmissionView\)/);
  assert.doesNotMatch(syncSource, /pricingContextRouteScope = focusedAdmissionView/);
  assert.match(highlightSource, /is-auto-hedging-admission-focused/);
  assert.match(highlightSource, /scrollIntoView/);
  assert.match(highlightSource, /prefers-reduced-motion: reduce/);
  assert.match(highlightSource, /\.focus\(\{ preventScroll: true \}\)/);
  assert.match(highlightSource, /2600/);
  assert.match(
    referenceTableStyles,
    /#executionContextsTable\.is-auto-hedging-admission-focused \[data-pricing-context-column="autoHedgingAdmissionMode"\]/
  );
});
