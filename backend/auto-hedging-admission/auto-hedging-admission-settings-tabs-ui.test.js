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
  path.join(ROOT, "frontend", "features", "hedging", "hedging.page.js"),
  path.join(ROOT, "frontend", "app", "shell", "workspace-shell.js")
].map(filePath => fs.readFileSync(filePath, "utf8")).join("\n");
const sharedTabsStyle = fs.readFileSync(
  path.join(ROOT, "frontend", "shared", "components", "workbench-tabs.css"),
  "utf8"
);
const styleManifest = JSON.parse(fs.readFileSync(
  path.join(ROOT, "frontend", "styles", "source-manifest.json"),
  "utf8"
));
const hedgingPageMarkup = documentHtml;

test("Hedging Settings exposes Quick Hedge and Auto Hedging tabs", () => {
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
  assert.match(hedgingPageMarkup, />Auto Hedging Settings<\/span>/);
  assert.match(hedgingPageMarkup, />Auto Hedging Settings<\/h2>/);
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

test("Auto Hedging uses a segmented route switch instead of nesting Bootstrap tabs", () => {
  assert.match(
    hedgingPageMarkup,
    /class="auto-hedging-entry-route-switch" role="group" aria-label="Auto Hedging entry route"/
  );
  assert.match(
    hedgingPageMarkup,
    /data-auto-hedging-settings-route="initial"[^>]*aria-pressed="true"[^>]*aria-controls="autoHedgingInitialAdmissionRoute"/
  );
  assert.match(
    hedgingPageMarkup,
    /data-auto-hedging-settings-route="manual-release"[^>]*aria-pressed="false"[^>]*aria-controls="autoHedgingManualReleaseRoute"/
  );
  assert.match(
    hedgingPageMarkup,
    /id="autoHedgingManualReleaseRoute"[^>]*data-auto-hedging-settings-route-panel="manual-release"[^>]*hidden/
  );
  assert.equal(
    (hedgingPageMarkup.match(/\bauto-hedging-entry-route-switch\b/g) || []).length,
    1
  );
  assert.doesNotMatch(
    hedgingPageMarkup,
    /auto-hedging-entry-route-switch[^>]*nav-tabs/
  );

  const routeSwitchSource = appScript.match(
    /function setAutoHedgingSettingsRoute\(routeName,[\s\S]*?\n    \}/
  )?.[0] || "";
  assert.match(routeSwitchSource, /control\.classList\.toggle\("is-active", active\)/);
  assert.match(routeSwitchSource, /control\.setAttribute\("aria-pressed", String\(active\)\)/);
  assert.match(routeSwitchSource, /panel\.hidden = panel\.dataset\.autoHedgingSettingsRoutePanel !== normalizedRoute/);
});

test("each entry route exposes Client, Hedge and Technical FX Trade accordions", () => {
  assert.equal(
    (hedgingPageMarkup.match(/data-auto-hedging-segment-toggle/g) || []).length,
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
