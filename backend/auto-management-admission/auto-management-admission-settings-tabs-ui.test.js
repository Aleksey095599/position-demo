"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..", "..");
const documentHtml = fs.readFileSync(
  path.join(ROOT, "frontend", "features", "position", "position-management-settings.page.html"),
  "utf8"
);
const appScript = [
  path.join(ROOT, "frontend", "app", "core", "runtime.js"),
  path.join(ROOT, "frontend", "features", "position", "position.page.js"),
  path.join(ROOT, "frontend", "features", "hedging", "hedging.page.js"),
  path.join(ROOT, "frontend", "features", "position", "position-management-settings.page.js"),
  path.join(ROOT, "frontend", "app", "shell", "workspace-shell.js")
].map(filePath => fs.readFileSync(filePath, "utf8")).join("\n");
const settingsStyle = fs.readFileSync(
  path.join(ROOT, "frontend", "features", "position", "position-management-settings.css"),
  "utf8"
);
const semanticSectionsStyle = fs.readFileSync(
  path.join(ROOT, "frontend", "shared", "components", "semantic-sections.css"),
  "utf8"
);
const dataTablesStyle = fs.readFileSync(
  path.join(ROOT, "frontend", "shared", "components", "data-tables.css"),
  "utf8"
);
const referenceTablesStyle = fs.readFileSync(
  path.join(ROOT, "frontend", "shared", "components", "reference-tables.css"),
  "utf8"
);
const styleManifest = JSON.parse(fs.readFileSync(
  path.join(ROOT, "frontend", "styles", "source-manifest.json"),
  "utf8"
));
const hedgingPageMarkup = documentHtml;

test("Position Management Settings exposes three peer sections without trade tabs", () => {
  const sidebar = hedgingPageMarkup.match(/<aside[^]*?<\/aside>/)?.[0] || "";
  [
    ["quick-hedge", "quick", "Quick Hedge"],
    ["auto-mode-eligibility", "eligibility", "Auto Mode Eligibility"],
    ["initial-mode-assignment", "initial", "Initial Mode Assignment"]
  ].forEach(([route, section, label]) => {
    assert.ok(sidebar.includes('href="#position-management-settings/' + route + '"'));
    assert.ok(sidebar.includes('data-position-management-settings-section="' + section + '"'));
    assert.ok(sidebar.includes('>' + label + '</span>'));
  });
  assert.doesNotMatch(hedgingPageMarkup, /id="autoManagementSettingsTradeTabs"|role="tablist"/);
  assert.doesNotMatch(sidebar, /Position Management Mode|Client Deals|Hedge Deals|Technical Trades/);
});

test("Auto Mode Eligibility and Initial Mode Assignment own separate right-hand panels", () => {
  assert.match(hedgingPageMarkup, /id="autoManagementAdmissionCriteriaPage"[^>]*data-position-management-settings-section-panel="eligibility"/);
  assert.match(hedgingPageMarkup, /id="initialModeAssignmentPanel"[^>]*data-position-management-settings-section-panel="initial"[^>]*hidden/);
  assert.equal((hedgingPageMarkup.match(/id="autoManagementAdmissionCriteriaTable"/g) || []).length, 1);
  assert.doesNotMatch(hedgingPageMarkup, /<h5>Ccy Pair<\/h5>|<h5>Amount Limits<\/h5>|<h5>Transfer Rate Deviation<\/h5>/);
  assert.doesNotMatch(hedgingPageMarkup, /Open Auto Mode Eligibility settings|clientAutoModeEligibilitySettingsButton|hedgeAutoModeEligibilitySettingsButton/);
  assert.match(hedgingPageMarkup, /Batch Balance Trades and Batch Position Outs inherit Position Management Mode/);
});

test("URL-backed switching controls active navigation and panel visibility", () => {
  assert.match(appScript, /function setPositionManagementSettingsSection\(sectionName\)/);
  assert.match(appScript, /\["quick", "eligibility", "initial"\]\.includes\(sectionName\)/);
  assert.match(appScript, /link\.setAttribute\("aria-current", "page"\)/);
  assert.match(appScript, /link\.removeAttribute\("aria-current"\)/);
  assert.match(appScript, /panel\.hidden = panel\.dataset\.positionManagementSettingsSectionPanel !== normalizedSection/);
  assert.match(appScript, /positionManagementSettingsSectionFromLocation\(hash = location\.hash\)/);
  assert.match(appScript, /section === "eligibility"/);
  assert.match(appScript, /loadAutoManagementAdmissionCriteriaPage\(\{ reload \}\)/);
});

test("one eligibility table exposes the stored dimensions and read-only technical rows", () => {
  ["trade_type", "ccy_pair", "eligible_for_auto_mode", "maximum_trade_amount", "transfer_rate_deviation", "actions"].forEach(column => {
    assert.match(hedgingPageMarkup, new RegExp(`data-ui-column-key="${column}"`));
  });
  ["CLIENT_DEAL", "HEDGE_DEAL", "BATCH_POSITION_OUT"].forEach(tradeType => {
    assert.match(hedgingPageMarkup, new RegExp(`<option value="${tradeType}">`));
  });
  assert.doesNotMatch(hedgingPageMarkup, /<option value="BATCH_BALANCE_TRADE">/);
  assert.match(appScript, /function autoManagementAdmissionRuleGroups\(\)/);
  assert.match(appScript, /pairRowspan: group\.rules\.length/);
  assert.match(appScript, /Not evaluated/);
  assert.match(appScript, /tradeTypePresentation\.evaluated/);
  assert.match(appScript, /\/api\/v1\/auto-mode-eligibility-rules\?scope=all/);
});

test("Position Management Settings sidebar has a responsive page-local style contract", () => {
  assert.ok(styleManifest.sources.includes("features/position/position-management-settings.css"));
  assert.match(
    settingsStyle,
    /\.position-management-settings-workspace-layout \{[\s\S]*?grid-template-columns: minmax\(220px, 250px\) minmax\(0, 1fr\)/
  );
  assert.match(settingsStyle, /\.position-management-settings-sidebar \{[\s\S]*?position: sticky/);
  assert.match(
    settingsStyle,
    /\.position-management-settings-navigation-link\.is-active \{[\s\S]*?border-color: var\(--selection-accent\)[\s\S]*?background: var\(--control-soft-bg\)/
  );
  const activeNavigationStyle = settingsStyle.match(
    /\.position-management-settings-navigation-link\.is-active \{([\s\S]*?)\}/
  )?.[1] || "";
  assert.doesNotMatch(activeNavigationStyle, /box-shadow|palette-yellow|position-management-settings-accent/);
  assert.doesNotMatch(
    settingsStyle,
    /\.position-management-settings-navigation-(?:subnav|sublink)::before/
  );
  assert.match(settingsStyle, /@media \(max-width: 900px\)[\s\S]*?grid-template-columns: 1fr/);
  assert.doesNotMatch(settingsStyle, /auto-management-entry-route-switch/);
});

test("Quick Hedge Settings table uses the shared neutral table chrome", () => {
  assert.match(
    hedgingPageMarkup,
    /class="hedge-quick-settings-overview table-panel table-panel--standalone"/
  );
  assert.match(
    dataTablesStyle,
    /\.hedge-quick-settings-overview\.table-panel > \.hedge-quick-settings-overview-toolbar/
  );
  assert.match(
    dataTablesStyle,
    /\.hedge-quick-settings-overview\.table-panel \{\s*gap: 0;/
  );
  assert.doesNotMatch(
    semanticSectionsStyle,
    /\.hedge-quick-settings-overview\.table-panel--standalone/
  );
  assert.doesNotMatch(semanticSectionsStyle, /\.hedge-quick-settings-count\s*\{/);
  assert.doesNotMatch(semanticSectionsStyle, /#hedgeQuickModeSettingsNewButton\s*\{/);
  assert.doesNotMatch(
    referenceTablesStyle,
    /\.hedge-quick-settings-overview \{[\s\S]*?gap:/
  );
});

test("Quick Hedge Settings editor reuses the Client Deal blue palette", () => {
  assert.match(
    semanticSectionsStyle,
    /--quick-hedge-settings-accent: var\(--app-primary\)/
  );
  assert.match(
    semanticSectionsStyle,
    /--quick-hedge-settings-accent-soft: var\(--palette-blue-100\)/
  );
  const quickEditorStyle = semanticSectionsStyle.match(
    /\.hedge-quick-settings-editor > \.client-deal-create-section\.semantic-section \{[\s\S]*?#hedgeQuickModeSettingsSaveButton \{[\s\S]*?\n    \}/
  )?.[0] || "";
  assert.match(quickEditorStyle, /var\(--quick-hedge-settings-accent\)/);
  assert.match(quickEditorStyle, /var\(--palette-blue-100\)/);
  assert.match(quickEditorStyle, /var\(--app-button-primary-bg\)/);
  assert.doesNotMatch(quickEditorStyle, /palette-yellow|var\(--position-management-settings-accent/);
  assert.doesNotMatch(quickEditorStyle, /border-left/);
  assert.doesNotMatch(quickEditorStyle, /\.client-deal-create-section\.semantic-section::before/);
  assert.doesNotMatch(quickEditorStyle, /box-shadow: none/);
  assert.match(
    quickEditorStyle,
    /box-shadow: var\(--bs-box-shadow-sm\)/
  );
  assert.match(
    referenceTablesStyle,
    /\.hedge-quick-settings-editor \{\s*display: grid;\s*gap: 16px;/
  );
  assert.match(
    referenceTablesStyle,
    /\.position-management-settings-panel \.modal-content \{\s*overflow: visible;/
  );
});
