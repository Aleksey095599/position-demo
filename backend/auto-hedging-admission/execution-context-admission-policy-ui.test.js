"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..", "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const layoutsSource = fs.readFileSync(
  path.join(root, "backend", "ui-table-layout", "ui-table-layouts.js"),
  "utf8"
);

test("Execution Context exposes Auto Hedging Admission Policy in its grid and editor", () => {
  assert.ok(html.includes('data-ui-column-key="auto_hedging_admission_policy"'));
  assert.ok(html.includes("<span>Auto Hedging Admission Policy</span>"));
  assert.ok(html.includes('data-pricing-context-header-filter="autoHedgingAdmissionPolicy"'));
  assert.ok(html.includes('data-pricing-context-field="autoHedgingAdmissionPolicy"'));
  assert.ok(html.includes("autoHedgingAdmissionPolicyBadgeMarkup(context.autoHedgingAdmissionPolicy)"));
  assert.ok(layoutsSource.includes(
    '["auto_hedging_admission_policy", "Auto Hedging Admission Policy", 232]'
  ));
});

test("Execution Context UI offers exactly the three domain policy values", () => {
  const editorSelect = html.match(
    /<select class="inline-edit-control" data-pricing-context-field="autoHedgingAdmissionPolicy"[\s\S]*?<\/select>/
  )?.[0] || "";
  const values = [...editorSelect.matchAll(/<option value="([A-Z_]+)"/g)]
    .map(match => match[1]);

  assert.deepEqual(values, [
    "AUTO_IF_ELIGIBLE",
    "REVIEW_REQUIRED",
    "MANUAL_ONLY"
  ]);
  assert.ok(html.includes("autoHedgingAdmissionPolicy: context.autoHedgingAdmissionPolicy"));
});
