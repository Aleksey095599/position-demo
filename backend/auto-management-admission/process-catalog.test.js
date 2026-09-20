"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const ROOT = path.resolve(__dirname, "..", "..");
const processMarkup = fs.readFileSync(
  path.join(ROOT, "frontend", "features", "processes", "processes.page.html"),
  "utf8"
);
const processScript = fs.readFileSync(
  path.join(ROOT, "frontend", "features", "processes", "processes.page.js"),
  "utf8"
);
const processCopySource = fs.readFileSync(
  path.join(ROOT, "frontend", "features", "database", "database.page.js"),
  "utf8"
);
const positionRouteSource = fs.readFileSync(
  path.join(ROOT, "frontend", "features", "position", "position.page.js"),
  "utf8"
);
const runtimeSource = fs.readFileSync(
  path.join(ROOT, "frontend", "app", "core", "runtime.js"),
  "utf8"
);
const processStyleSource = fs.readFileSync(
  path.join(ROOT, "frontend", "features", "pricing", "pricing-workflows.css"),
  "utf8"
);
const glossaryMarkup = processMarkup.match(
  /<article class="profile-panel processes-details" id="domainGlossaryProcessView"[\s\S]*?<\/article>/
)?.[0] || "";

test("management mode glossary links resolve to full terms, including previous links", () => {
  const glossaryRoutes = processCopySource.slice(
    processCopySource.indexOf("    function domainGlossaryRoute("),
    processCopySource.indexOf("    const PROCESS_CATALOG_LANGUAGE_STORAGE_KEY")
  );
  const context = vm.createContext({ location: { hash: "" } });
  vm.runInContext(glossaryRoutes, context);

  for (const mode of ["auto", "manual"]) {
    const canonicalKey = `${mode}-position-management-mode`;
    for (const key of [canonicalKey, `${mode}-management`]) {
      context.location.hash = `#processes:domain-glossary/${key}`;
      assert.equal(context.domainGlossaryTermFromRoute(), canonicalKey);
    }
    assert.ok(glossaryMarkup.includes(`id="process-term-${canonicalKey}"`));
    assert.ok(!glossaryMarkup.includes(`id="process-term-${mode}-management"`));
  }
  context.location.hash = "#processes:domain-glossary/unknown-mode";
  assert.equal(context.domainGlossaryTermFromRoute(), null);
});

test("Process Catalog no longer exposes Auto Hedging process views or navigation", () => {
  assert.match(processMarkup, /data-process-catalog-view="manual"/);
  assert.match(processMarkup, /data-process-catalog-view="glossary"/);
  assert.doesNotMatch(processMarkup, /data-process-catalog-view="auto-hedging"/);
  assert.doesNotMatch(processMarkup, /data-process-catalog-view="admission"/);
  assert.doesNotMatch(processMarkup, /data-process-catalog-group="auto-hedging"/);
  assert.doesNotMatch(processMarkup, /href="#processes:auto-hedging(?:-admission)?"/);
  assert.doesNotMatch(processMarkup, /id="autoHedgingProcessView"/);
  assert.doesNotMatch(processMarkup, /id="automationAdmissionProcessView"/);
});

test("removed Process Catalog routes and view bindings are not retained", () => {
  for (const source of [processScript, processCopySource, positionRouteSource, runtimeSource]) {
    assert.doesNotMatch(source, /\bautoHedgingRoute\s*\(/);
    assert.doesNotMatch(source, /\bautomationAdmissionRoute\s*\(/);
    assert.doesNotMatch(source, /\blegacyAutomationAdmissionRoute\s*\(/);
    assert.doesNotMatch(source, /\bisAutoHedgingRoute\s*\(/);
    assert.doesNotMatch(source, /\bisAutomationAdmissionRoute\s*\(/);
    assert.doesNotMatch(source, /\bautoHedgingProcessView\b/);
    assert.doesNotMatch(source, /\bautomationAdmissionProcessView\b/);
  }
  assert.doesNotMatch(processScript, /highlightAutomationAdmissionTechnicalTokens/);
  assert.doesNotMatch(processStyleSource, /\.auto-hedging-subcatalog/);
  assert.doesNotMatch(processStyleSource, /\.automation-admission/);
});

test("Domain Glossary retains shared Auto Hedging vocabulary independently", () => {
  const terms = [
    "auto-hedging",
    "auto-management-admission",
    "trade-context-admission-mode",
    "auto-mode-eligibility",
    "eligibility-check",
    "admission-state",
    "ccy-pair"
  ];

  terms.forEach(term => {
    assert.ok(glossaryMarkup.includes(`id="process-term-${term}"`));
    assert.ok(processCopySource.includes(`"${term}",`));
  });
  assert.match(
    processScript,
    /text: "Auto Mode Eligibility", key: "auto-mode-eligibility"/
  );
  assert.match(processScript, /text: "Eligibility Check", key: "eligibility-check"/);
  assert.match(processScript, /text: "Ccy Pair", key: "ccy-pair"/);
});

test("Domain Glossary keeps shared Auto Hedging definitions bilingual", () => {
  const sharedKeys = [
    "autoHedgingDefinition",
    "autoManagementAdmissionDefinition",
    "tradeContextAdmissionModeDefinition",
    "autoModeEligibilityDefinition",
    "eligibilityCheckDefinition",
    "ccyPairDefinition",
    "automationAdmissionStateDefinition"
  ];

  sharedKeys.forEach(key => {
    const occurrences = processCopySource.match(new RegExp(`^\\s*${key}:`, "gm")) || [];
    assert.equal(occurrences.length, 2, `${key} must exist in both language maps`);
  });
  assert.doesNotMatch(processCopySource, /automationAdmissionSummary/);
  assert.doesNotMatch(processCopySource, /determineInitialAdmissionStateDescription/);
  assert.doesNotMatch(processCopySource, /decideReleaseToAutoManagementDescription/);
});
