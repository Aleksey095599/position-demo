"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..", "..");
const routeSource = fs.readFileSync(path.join(root, "frontend/features/position/position.page.js"), "utf8");
const settingsSource = fs.readFileSync(path.join(root, "frontend/features/position/position-management-settings.page.js"), "utf8");
const settingsMarkup = fs.readFileSync(path.join(root, "frontend/features/position/position-management-settings.page.html"), "utf8");
const shellMarkup = fs.readFileSync(path.join(root, "frontend/index.shell.html"), "utf8");
const shellSource = fs.readFileSync(path.join(root, "frontend/app/shell/workspace-shell.js"), "utf8");
const headingSource = fs.readFileSync(path.join(root, "frontend/shared/navigation/workspace-page-heading.js"), "utf8");

const settingsRoot = "#position-management-settings";
const eligibilityRoute = `${settingsRoot}/auto-mode-eligibility`;
const initialRoute = `${settingsRoot}/initial-mode-assignment`;
const quickRoute = `${settingsRoot}/quick-hedge`;

function routeHarness() {
  const location = { hash: eligibilityRoute };
  const helpers = new Function("location", `
    ${routeSource}
    return {
      positionManagementSettingsRoute,
      positionManagementSettingsSectionFromLocation,
      positionManagementSettingsNavigationItems,
      isPositionManagementSettingsRoute
    };
  `)(location);
  return { ...helpers, location };
}

function functionSource(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} must exist`);
  const bodyStart = source.indexOf("{", start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") depth -= 1;
    if (depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`Unable to read ${name}`);
}

test("Position Management settings has three canonical peer routes", () => {
  const helpers = routeHarness();
  for (const [section, route] of [
    ["eligibility", eligibilityRoute],
    ["initial", initialRoute],
    ["quick", quickRoute]
  ]) {
    assert.equal(helpers.positionManagementSettingsRoute(section), route);
    assert.equal(helpers.positionManagementSettingsSectionFromLocation(route), section);
    assert.equal(helpers.isPositionManagementSettingsRoute(route), true);
  }
  assert.equal(helpers.positionManagementSettingsRoute(), eligibilityRoute);
  assert.equal(helpers.positionManagementSettingsSectionFromLocation(settingsRoot), "eligibility");
});

test("legacy Position Management Mode and eligibility routes normalize to Auto Mode Eligibility", () => {
  const helpers = routeHarness();
  for (const route of [
    `${settingsRoot}/position-management-mode`,
    `${settingsRoot}/position-management-mode/client-deals`,
    `${settingsRoot}/position-management-mode/hedge-deals/eligibility-settings?focus=amount-limit`,
    `${settingsRoot}/position-management-mode/technical-trades`,
    `${settingsRoot}:client-deal`,
    `${settingsRoot}:hedge-deal`,
    `${settingsRoot}:technical-trades`,
    "#auto-management-admission-criteria?tradeType=HEDGE_DEAL"
  ]) {
    assert.equal(helpers.isPositionManagementSettingsRoute(route), true, route);
    assert.equal(helpers.positionManagementSettingsSectionFromLocation(route), "eligibility", route);
  }
  assert.equal(helpers.positionManagementSettingsSectionFromLocation(`${settingsRoot}:initial-admission`), "initial");
  assert.equal(helpers.positionManagementSettingsSectionFromLocation(`${settingsRoot}:manual-release`), "initial");
});

test("navigation hierarchy names the page and selected section without trade categories", () => {
  const helpers = routeHarness();
  assert.deepEqual(helpers.positionManagementSettingsNavigationItems("eligibility"), [
    { label: "Position Management Settings", href: settingsRoot },
    { label: "Auto Mode Eligibility", href: eligibilityRoute }
  ]);
  assert.deepEqual(helpers.positionManagementSettingsNavigationItems("initial"), [
    { label: "Position Management Settings", href: settingsRoot },
    { label: "Initial Mode Assignment", href: initialRoute }
  ]);
  assert.doesNotMatch(routeSource, /label: "Client Deals"|label: "Hedge Deals"|label: "Technical Trades"/);
});

test("section rendering keeps the page heading and canonicalizes old URLs", () => {
  const location = { hash: `${settingsRoot}/position-management-mode/client-deals` };
  const replacements = [];
  const document = { title: "" };
  const helpers = routeHarness();
  const render = new Function(
    "document",
    "location",
    "window",
    "positionManagementSettingsNavigationItems",
    "positionManagementSettingsRoute",
    "renderWorkspacePageHeading",
    `${functionSource(settingsSource, "renderPositionManagementSettingsNavigation")}; return renderPositionManagementSettingsNavigation;`
  )(
    document,
    location,
    {
      history: {
        state: { retained: true },
        replaceState(state, _title, hash) {
          replacements.push({ state, hash });
          location.hash = hash;
        }
      }
    },
    helpers.positionManagementSettingsNavigationItems,
    helpers.positionManagementSettingsRoute,
    () => {}
  );

  render("eligibility");
  assert.equal(document.title, "Position Management Settings / Auto Mode Eligibility");
  assert.equal(location.hash, eligibilityRoute);
  assert.deepEqual(replacements, [{ state: { retained: true }, hash: eligibilityRoute }]);
  assert.match(headingSource, /return heading\("#positionManagementSettingsPage h1", "Position Management Settings"\)/);
});

test("Quick Hedge action opens its dedicated peer section", () => {
  const binding = shellSource.match(
    /hedgeQuickModeSettingsButton\.addEventListener\("click", event => \{[\s\S]*?\n    \}\);/
  )?.[0];
  assert.ok(binding);
  const helpers = routeHarness();
  let click;
  new Function("hedgeQuickModeSettingsButton", "positionManagementSettingsRoute", "location", binding)(
    { addEventListener(_type, listener) { click = listener; } },
    helpers.positionManagementSettingsRoute,
    helpers.location
  );
  click({ stopPropagation() {} });
  assert.equal(helpers.location.hash, quickRoute);
});

test("eligibility table is embedded without breadcrumbs or a second route page", () => {
  assert.match(settingsMarkup, /data-position-management-settings-section-panel="eligibility"/);
  assert.match(settingsMarkup, /id="autoManagementAdmissionCriteriaTable"/);
  assert.doesNotMatch(settingsMarkup, /Open Auto Mode Eligibility settings|arrow_back|aria-label="Breadcrumb"/);
  assert.doesNotMatch(shellMarkup, /auto-management-admission-criteria\.page\.html/);
  assert.doesNotMatch(shellSource, /isAutoManagementAdmissionCriteriaRoute\(\)/);
});
