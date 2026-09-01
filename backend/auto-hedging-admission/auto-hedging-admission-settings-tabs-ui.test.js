"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..", "..");
const documentHtml = fs.readFileSync(
  path.join(ROOT, "frontend", "features", "hedging", "hedging-settings.page.html"),
  "utf8"
);
const appScript = [
  path.join(ROOT, "frontend", "app", "core", "runtime.js"),
  path.join(ROOT, "frontend", "features", "fx-position", "fx-position.page.js"),
  path.join(ROOT, "frontend", "features", "hedging", "hedging.page.js"),
  path.join(ROOT, "frontend", "app", "shell", "workspace-shell.js")
].map(filePath => fs.readFileSync(filePath, "utf8")).join("\n");
const settingsStyle = fs.readFileSync(
  path.join(ROOT, "frontend", "features", "hedging", "hedging-settings.css"),
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

test("Hedging Settings exposes scalable sidebar navigation", () => {
  assert.match(
    hedgingPageMarkup,
    /class="hedging-settings-workspace-layout"[^>]*aria-label="Hedging Settings"/
  );
  assert.match(
    hedgingPageMarkup,
    /<aside class="profile-panel hedging-settings-sidebar">[\s\S]*?<nav class="hedging-settings-navigation"/
  );
  assert.match(
    hedgingPageMarkup,
    /id="quickHedgeSettingsNavLink"[^>]*href="#hedging-settings:quick-hedge"[^>]*data-hedging-settings-section="quick"[^>]*aria-current="page"/
  );
  assert.match(
    hedgingPageMarkup,
    /id="autoHedgingSettingsGroupToggle"[^>]*aria-expanded="false"[^>]*aria-controls="autoHedgingSettingsSubnav"/
  );
  assert.match(
    hedgingPageMarkup,
    /id="initialAdmissionSettingsNavLink"[^>]*href="#hedging-settings:auto-hedging:initial-admission"[^>]*data-hedging-settings-section="initial"/
  );
  assert.match(
    hedgingPageMarkup,
    /id="manualReleaseSettingsNavLink"[^>]*href="#hedging-settings:auto-hedging:manual-release"[^>]*data-hedging-settings-section="manual-release"[^>]*>[\s\S]*?>touch_app<\/span>[\s\S]*?>Manual Release<\/span>/
  );
  assert.match(
    hedgingPageMarkup,
    /id="quickHedgeSettingsPanel"[^>]*data-hedging-settings-section-panel="quick"/
  );
  assert.match(
    hedgingPageMarkup,
    /id="autoHedgingInitialAdmissionRoute"[^>]*data-hedging-settings-section-panel="initial"[^>]*hidden/
  );
  assert.match(
    hedgingPageMarkup,
    /id="autoHedgingManualReleaseRoute"[^>]*data-hedging-settings-section-panel="manual-release"[^>]*hidden/
  );
  assert.doesNotMatch(hedgingPageMarkup, /data-hedging-settings-tab/);
  assert.doesNotMatch(hedgingPageMarkup, /auto-hedging-entry-route-switch/);
});

test("URL-backed section switching owns active and panel visibility state", () => {
  assert.match(appScript, /function setHedgingSettingsSection\(sectionName\)/);
  assert.match(appScript, /link\.classList\.toggle\("is-active", active\)/);
  assert.match(appScript, /link\.setAttribute\("aria-current", "page"\)/);
  assert.match(appScript, /link\.removeAttribute\("aria-current"\)/);
  assert.match(
    appScript,
    /panel\.hidden = panel\.dataset\.hedgingSettingsSectionPanel !== normalizedSection/
  );
  assert.match(appScript, /function hedgingSettingsSectionFromLocation\(hash = location\.hash\)/);
  assert.match(appScript, /#hedging-settings:auto-hedging:initial-admission/);
  assert.match(appScript, /#hedging-settings:auto-hedging:manual-release/);
  assert.match(appScript, /const hedgingSettingsWasVisible = !hedgingSettingsPage\.hidden/);
  assert.match(appScript, /loadHedgingSettingsPage\(\{ reload: !hedgingSettingsWasVisible \}\)/);
  assert.match(
    appScript,
    /async function loadHedgingSettingsPage\(\{ reload = true \} = \{\}\)[\s\S]*?if \(!reload\) \{\s*return;/
  );
});

test("Auto Hedging sidebar group can collapse independently", () => {
  assert.match(
    hedgingPageMarkup,
    /id="autoHedgingSettingsGroupToggle"[^>]*aria-controls="autoHedgingSettingsSubnav"/
  );
  assert.match(
    hedgingPageMarkup,
    /class="hedging-settings-navigation-subnav" id="autoHedgingSettingsSubnav" hidden/
  );
  assert.match(
    appScript,
    /function setHedgingSettingsAutoGroupExpanded\(expanded\)[\s\S]*?hedgingSettingsAutoSubnav\.hidden = !isExpanded/
  );
  assert.match(
    appScript,
    /hedgingSettingsAutoGroupToggle\.addEventListener\("click"[\s\S]*?setHedgingSettingsAutoGroupExpanded/
  );
  assert.match(
    appScript,
    /setHedgingSettingsAutoGroupExpanded\(normalizedSection !== "quick"\)/
  );
});

test("each entry route exposes Client, Hedge and Technical FX Trade accordions", () => {
  assert.equal(
    (hedgingPageMarkup.match(/data-auto-hedging-segment-toggle/g) || []).length,
    6
  );
  assert.equal(
    (hedgingPageMarkup.match(/data-auto-hedging-segment-toggle[^>]*aria-expanded="false"/g) || []).length,
    6
  );
  assert.equal(
    (hedgingPageMarkup.match(/class="auto-hedging-trade-segment-body"[^>]*hidden/g) || []).length,
    6
  );
  [
    "autoHedgingInitialClientPanel",
    "autoHedgingInitialHedgePanel",
    "autoHedgingInitialTechnicalPanel",
    "autoHedgingManualClientPanel",
    "autoHedgingManualHedgePanel",
    "autoHedgingManualTechnicalPanel"
  ].forEach(panelId => {
    assert.match(
      hedgingPageMarkup,
      new RegExp(`aria-controls="${panelId}"`)
    );
    assert.match(
      hedgingPageMarkup,
      new RegExp(`id="${panelId}"[^>]*role="region"`)
    );
  });
  assert.match(
    appScript,
    /function toggleAutoHedgingSettingsSegment\(toggle\)[\s\S]*?otherToggle !== toggle[\s\S]*?setAutoHedgingSettingsSegmentExpanded\(otherToggle, false\)/
  );
});

test("trade segment headings reuse Trades icons and concise domain terminology", () => {
  assert.equal((hedgingPageMarkup.match(/>handshake<\/span>/g) || []).length, 2);
  assert.equal((hedgingPageMarkup.match(/>shield<\/span>/g) || []).length, 2);
  assert.equal((hedgingPageMarkup.match(/>build_circle<\/span>/g) || []).length, 2);
  assert.equal((hedgingPageMarkup.match(/>Client FX Deals<\/strong>/g) || []).length, 2);
  assert.equal((hedgingPageMarkup.match(/>Hedge FX Deals<\/strong>/g) || []).length, 2);
  assert.equal((hedgingPageMarkup.match(/>Technical FX Trades<\/strong>/g) || []).length, 2);
  assert.doesNotMatch(hedgingPageMarkup, />Configured<\/span>|>Not configured<\/span>/);
  const segmentCopies = [...hedgingPageMarkup.matchAll(
    /<span class="auto-hedging-trade-segment-copy">([\s\S]*?)<\/span>/g
  )].map(match => match[1]);
  assert.equal(segmentCopies.length, 6);
  segmentCopies.forEach(copy => assert.doesNotMatch(copy, /<small>/));
});

test("Hedging Settings sidebar has a responsive page-local style contract", () => {
  assert.ok(styleManifest.sources.includes("features/hedging/hedging-settings.css"));
  assert.match(
    settingsStyle,
    /\.hedging-settings-workspace-layout \{[\s\S]*?grid-template-columns: minmax\(220px, 250px\) minmax\(0, 1fr\)/
  );
  assert.match(settingsStyle, /\.hedging-settings-sidebar \{[\s\S]*?position: sticky/);
  assert.match(
    settingsStyle,
    /\.hedging-settings-navigation-link\.is-active \{[\s\S]*?border-color: var\(--selection-accent\)[\s\S]*?background: var\(--control-soft-bg\)/
  );
  const activeNavigationStyle = settingsStyle.match(
    /\.hedging-settings-navigation-link\.is-active \{([\s\S]*?)\}/
  )?.[1] || "";
  assert.doesNotMatch(activeNavigationStyle, /box-shadow|palette-yellow|hedging-settings-accent/);
  assert.match(
    settingsStyle,
    /\.hedging-settings-navigation-group:has\([\s\S]*?\.hedging-settings-navigation-sublink\.is-active[\s\S]*?\) > \.hedging-settings-navigation-group-toggle \{[\s\S]*?background: color-mix\(/
  );
  assert.doesNotMatch(
    settingsStyle,
    /\.hedging-settings-navigation-(?:subnav|sublink)::before/
  );
  assert.match(settingsStyle, /@media \(max-width: 900px\)[\s\S]*?grid-template-columns: 1fr/);
  assert.doesNotMatch(settingsStyle, /auto-hedging-entry-route-switch/);
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
  assert.doesNotMatch(quickEditorStyle, /palette-yellow|var\(--hedging-settings-accent/);
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
    /\.hedging-settings-panel \.modal-content \{\s*overflow: visible;/
  );
});
