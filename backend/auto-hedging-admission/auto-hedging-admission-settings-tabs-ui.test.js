"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { readFrontendSources } = require("../test-support/frontend-source.js");

const ROOT = path.resolve(__dirname, "..", "..");
const { documentHtml, appScript } = readFrontendSources(ROOT);
const sharedTabsStyle = fs.readFileSync(
  path.join(ROOT, "frontend", "shared", "components", "workbench-tabs.css"),
  "utf8"
);
const styleManifest = JSON.parse(fs.readFileSync(
  path.join(ROOT, "frontend", "styles", "source-manifest.json"),
  "utf8"
));
const hedgingPageMarkup = documentHtml.match(
  /<main class="[^"]*hedging-settings-page" id="hedgingSettingsPage"[\s\S]*?<\/main>/
)?.[0] || "";

test("Hedging Settings exposes Quick Hedge and Auto Hedging Admission tabs", () => {
  assert.match(
    hedgingPageMarkup,
    /class="nav nav-tabs workbench-section-tabs hedging-settings-tabs"[^>]*role="tablist"/
  );
  assert.match(
    hedgingPageMarkup,
    /id="quickHedgeSettingsTab"[^>]*data-hedging-settings-tab="quick"[^>]*role="tab"[^>]*aria-controls="quickHedgeSettingsPanel"[^>]*aria-selected="true"/
  );
  assert.match(
    hedgingPageMarkup,
    /id="autoHedgingAdmissionSettingsTab"[^>]*data-hedging-settings-tab="auto-admission"[^>]*role="tab"[^>]*aria-controls="autoHedgingAdmissionSettingsPanel"[^>]*aria-selected="false"/
  );
  assert.match(
    hedgingPageMarkup,
    /id="quickHedgeSettingsPanel"[^>]*role="tabpanel"[^>]*aria-labelledby="quickHedgeSettingsTab"/
  );
  assert.match(
    hedgingPageMarkup,
    /id="autoHedgingAdmissionSettingsPanel"[^>]*role="tabpanel"[^>]*aria-labelledby="autoHedgingAdmissionSettingsTab" hidden/
  );
  assert.match(hedgingPageMarkup, />Auto Hedging Admission Settings<\/h2>/);
});

test("Hedging Settings tab switching owns active and panel visibility state", () => {
  const tabSwitchSource = appScript.match(
    /function setHedgingSettingsTab\(tabName\)[\s\S]*?\n    \}/
  )?.[0] || "";

  assert.match(tabSwitchSource, /tab\.classList\.toggle\("active", active\)/);
  assert.match(tabSwitchSource, /tab\.setAttribute\("aria-selected", String\(active\)\)/);
  assert.match(tabSwitchSource, /quickHedgeSettingsPanel\.hidden = normalizedTab !== "quick"/);
  assert.match(
    tabSwitchSource,
    /autoHedgingAdmissionSettingsPanel\.hidden = normalizedTab !== "auto-admission"/
  );
  assert.match(
    appScript,
    /setHedgingSettingsTab\(tab\.dataset\.hedgingSettingsTab\)/
  );
});

test("Workbench tabs use a reusable page-independent style contract", () => {
  assert.ok(styleManifest.sources.includes("shared/components/workbench-tabs.css"));
  assert.ok(styleManifest.sources.includes("features/hedging/hedging-settings.css"));
  assert.match(
    sharedTabsStyle,
    /\.workbench-page \.workbench-section-tabs \{/
  );
  assert.match(sharedTabsStyle, /border-bottom: 1px solid var\(--bs-border-color\)/);
  assert.match(sharedTabsStyle, /border-bottom-color: var\(--bs-primary\)/);
  assert.match(sharedTabsStyle, /gap: 16px/);
  assert.doesNotMatch(
    sharedTabsStyle,
    /#(?:clientProfilePage|referenceDataPage|hedgingSettingsPage|mainPage)/
  );
});
