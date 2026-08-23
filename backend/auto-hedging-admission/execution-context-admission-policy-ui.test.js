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

test("Execution Context exposes Auto Hedging Admission Mode in its grid and editor", () => {
  assert.ok(html.includes('data-ui-column-key="auto_hedging_admission_mode"'));
  assert.ok(html.includes("<span>Auto Hedging Admission</span>"));
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
