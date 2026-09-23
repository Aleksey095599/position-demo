"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { readFrontendSources } = require("../test-support/frontend-source.js");
const root = path.resolve(__dirname, "../..");

function harness() {
  const elements = new Map();
  const context = vm.createContext({
    location: { hash: "#users" }, URLSearchParams,
    clientProfiles: [{ counterpartyId: 42, name: "Example Counterparty" }],
    users: [{ userId: 7, firstName: "Alex", lastName: "Smith" }],
    document: {
      querySelector(selector) {
        if (!elements.has(selector)) elements.set(selector, { textContent: "" });
        return elements.get(selector);
      }
    },
    referenceDataPluralLabel: kind => ({ servicingBranch: "Servicing Locations", settlementSystem: "Accounting Systems", tradeCaptureChannel: "Originating Systems" })[kind],
    hedgeQuickModeSettingsView: "overview",
    currentHedgeQuickModeSetting: () => ({ id: 1 }),
    hedgeQuickModeSettingsPair: () => "EUR/USD"
  });
  for (const file of ["features/database/database.page.js", "features/position/position.page.js", "shared/navigation/workspace-page-heading.js"]) {
    vm.runInContext(fs.readFileSync(path.join(root, "frontend", file), "utf8"), context);
  }
  return { context, elements };
}

test("workspace has no breadcrumb panel or renderer", () => {
  const { documentHtml, appScript } = readFrontendSources(root);
  assert.doesNotMatch(documentHtml, /breadcrumb/i);
  assert.doesNotMatch(appScript, /renderWorkspaceBreadcrumbs|workspaceBreadcrumbItems/);
});

test("page headings retain their current labels when navigating without breadcrumbs", () => {
  const { context, elements } = harness();
  for (const [route, selector, title] of [
    ["#settings:currencies", "#marketPageTitle", "Currency Settings"],
    ["#settings:currency-pairs?currency=USD", "#marketPageTitle", "Currency Pair Settings"],
    ["#market-pulse", "#marketPageTitle", "Quote Stream"],
    ["#market-pulse:quote-stream", "#marketPageTitle", "Quote Stream"],
    ["#market-pulse:charts", "#marketPageTitle", "Charts"],
    ["#market-pulse:source-data", "#marketPageTitle", "Source Data"],
    ["#market-pulse:candle-aggregation", "#marketPageTitle", "Candle Aggregation"],
    ["#market-pulse:data-management", "#marketPageTitle", "Source Data"],
    ["#market-pulse:history", "#marketPageTitle", "Source Data"],
    ["#trade-context", "#pricingPage h1", "Trade Contexts"],
    ["#pricing-rules:internal-units", "#pricingRulesPage h1", "Pricing Rules"],
    ["#pricing-rules:external-counterparties", "#pricingRulesPage h1", "Pricing Rules"],
    ["#users/7", "#usersPageTitle", "Alex Smith"],
    ["#users/new", "#usersPageTitle", "New User"],
    ["#users", "#usersPageTitle", "Users"],
    ["#trading-counterparties/42", "#clientProfilePageTitle", "Example Counterparty"],
    ["#trading-counterparties", "#clientProfilePageTitle", "Trading Counterparties"],
    ["#reference-data:servicing-locations", "#referenceDataPage h1", "Trade Context Components"],
    ["#reference-data:accounting-systems", "#referenceDataPage h1", "Trade Context Components"],
    ["#reference-data:originating-systems", "#referenceDataPage h1", "Trade Context Components"],
    ["#reference-data:trade-purposes", "#referenceDataPage h1", "Trade Context Components"],
    ["#trade-intake:contract", "#tradeContractPage h1", "Trade Notification Contract"],
    ["#trade-intake:messages", "#tradeIntakeMessagesPage h1", "Trade Notification Registry"],
    ["#batching:details/12", "#batchDetailsPage h1", "Batch 12 — Structure"],
    ["#position:auto", "#mainPage h1", "Position"],
    ["#hedge-deals", "#dealsPage h1", "Hedge Deals"],
    ["#client-deals", "#dealsPage h1", "Client Deals"],
    ["#batching-settings", "#batchingSettingsPage h1", "Batching Settings"],
    ["#reports:analytical-pnl", "#analyticalPnlReportPage h1", "Analytical PnL Report"]
  ]) {
    context.location.hash = route;
    context.renderWorkspacePageHeading();
    assert.equal(elements.get(selector)?.textContent, title, route);
  }
});

test("Quick Hedge overview and editor retain the Position Management Settings page heading", () => {
  const { context, elements } = harness();
  context.location.hash = "#position-management-settings/quick-hedge";
  context.renderWorkspacePageHeading();
  const heading = elements.get("#positionManagementSettingsPage h1");
  assert.equal(heading.textContent, "Position Management Settings");
  context.hedgeQuickModeSettingsView = "editor";
  context.renderWorkspacePageHeading();
  assert.equal(heading.textContent, "Position Management Settings");
  context.currentHedgeQuickModeSetting = () => null;
  context.renderWorkspacePageHeading();
  assert.equal(heading.textContent, "Position Management Settings");
  context.hedgeQuickModeSettingsView = "overview";
  context.renderWorkspacePageHeading();
  assert.equal(heading.textContent, "Position Management Settings");
});

test("previous context and system bookmarks retain their filters under the new routes", () => {
  const { context } = harness();
  for (const [previous, current] of [
    ["#execution-context", "#trade-context"],
    ["#execution-context?execution-system=CLICK_TRADE_EFX&focus=auto-management-admission", "#trade-context?originating-system=CLICK_TRADE_EFX&focus=auto-management-admission"],
    ["#reference-data:execution-systems", "#reference-data:originating-systems"],
    ["#trading-counterparties?execution-context=42", "#trading-counterparties?trade-context=42"],
    ["#pricing-rules:external-counterparties?counterparty=7&execution-context=42", "#pricing-rules:external-counterparties?counterparty=7&trade-context=42"]
  ]) {
    assert.equal(context.canonicalTradeContextRoute(previous), current);
    assert.equal(context.canonicalTradeContextRoute(current), current);
  }
  const route = context.pricingRouteStateFromLocation(
    context.canonicalTradeContextRoute("#execution-context?execution-system=CLICK_TRADE_EFX")
  );
  assert.equal(route.matches, true);
  assert.equal(route.scope.value, "CLICK_TRADE_EFX");
});
