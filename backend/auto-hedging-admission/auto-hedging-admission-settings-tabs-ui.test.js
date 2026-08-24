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
    /id="autoHedgingSettingsGroupToggle"[^>]*aria-expanded="true"[^>]*aria-controls="autoHedgingSettingsSubnav"/
  );
  assert.match(
    hedgingPageMarkup,
    /id="initialAdmissionSettingsNavLink"[^>]*href="#hedging-settings:auto-hedging:initial-admission"[^>]*data-hedging-settings-section="initial"/
  );
  assert.match(
    hedgingPageMarkup,
    /id="manualReleaseSettingsNavLink"[^>]*href="#hedging-settings:auto-hedging:manual-release"[^>]*data-hedging-settings-section="manual-release"/
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
    /class="hedging-settings-navigation-subnav" id="autoHedgingSettingsSubnav"/
  );
  assert.match(
    appScript,
    /function setHedgingSettingsAutoGroupExpanded\(expanded\)[\s\S]*?hedgingSettingsAutoSubnav\.hidden = !isExpanded/
  );
  assert.match(
    appScript,
    /hedgingSettingsAutoGroupToggle\.addEventListener\("click"[\s\S]*?setHedgingSettingsAutoGroupExpanded/
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
    /\.hedging-settings-navigation-link\.is-active \{[\s\S]*?box-shadow: inset 3px 0 0 var\(--bs-primary\)/
  );
  assert.match(settingsStyle, /@media \(max-width: 900px\)[\s\S]*?grid-template-columns: 1fr/);
  assert.doesNotMatch(settingsStyle, /auto-hedging-entry-route-switch/);
});
