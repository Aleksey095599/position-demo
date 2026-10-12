"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

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
test("Process Catalog no longer exposes Auto Hedging process views or navigation", () => {
  assert.match(processMarkup, /data-process-catalog-view="manual"/);
  assert.doesNotMatch(processMarkup, /data-process-catalog-view="glossary"|process-term-|domainGlossary/);
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
