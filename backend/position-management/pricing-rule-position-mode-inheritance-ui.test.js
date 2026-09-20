"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..", "..");
const schemaSource = fs.readFileSync(path.join(ROOT, "schema.sql"), "utf8");
const serverSource = fs.readFileSync(path.join(ROOT, "server.js"), "utf8");
const runtimeSource = fs.readFileSync(
  path.join(ROOT, "frontend", "app", "core", "runtime.js"),
  "utf8"
);
const counterpartiesSource = fs.readFileSync(
  path.join(ROOT, "frontend", "features", "counterparties", "counterparties.page.js"),
  "utf8"
);
const pricingRulesMarkup = fs.readFileSync(
  path.join(ROOT, "frontend", "features", "pricing", "pricing-rules.page.html"),
  "utf8"
);
const pricingRuleDialogMarkup = fs.readFileSync(
  path.join(
    ROOT,
    "frontend",
    "features",
    "counterparties",
    "components",
    "pricing-rule.dialog.html"
  ),
  "utf8"
);

function functionSource(source, name) {
  const marker = "function " + name + "(";
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, "Expected function " + name + ".");
  const remainingSource = source.slice(start + marker.length);
  const nextFunctionMatch = /\n    (?:async )?function [A-Za-z_$][\w$]*\s*\(/.exec(
    remainingSource
  );
  const end = nextFunctionMatch
    ? start + marker.length + nextFunctionMatch.index
    : source.length;

  return source.slice(start, end).trim();
}

test("Pricing Rule UI no longer exposes the legacy Position Management Mode override", () => {
  const globalEditorSource = functionSource(runtimeSource, "renderPricingRuleEditRow");
  const globalViewSource = functionSource(runtimeSource, "renderPricingRuleViewRow");
  const clientInlineEditorSource = functionSource(
    counterpartiesSource,
    "clientPricingRuleInlineEditorMarkup"
  );
  const clientPanelSource = functionSource(
    counterpartiesSource,
    "renderClientTradeContextsPanel"
  );

  [
    pricingRulesMarkup,
    pricingRuleDialogMarkup,
    globalEditorSource,
    globalViewSource,
    clientInlineEditorSource,
    clientPanelSource
  ].forEach(source => {
    assert.doesNotMatch(source, /Trade Context Default/);
    assert.doesNotMatch(source, /Position Management Mode/);
    assert.doesNotMatch(
      source,
      /(?:data-[\w-]+|name)="positionManagementModeOverride"/
    );
  });

  assert.match(
    pricingRulesMarkup,
    /data-pricing-rule-column="autoManagementAdmissionModeOverride"/
  );
  assert.match(
    pricingRuleDialogMarkup,
    /name="autoManagementAdmissionModeOverride"/
  );
  assert.match(
    clientInlineEditorSource,
    /data-client-pricing-rule-inline-field="autoManagementAdmissionModeOverride"/
  );

  assert.doesNotMatch(runtimeSource, /defaultPositionManagementMode|positionManagementModeOverride|effectivePositionManagementMode/);
  const tradeContextMarkup = fs.readFileSync(path.join(ROOT, "frontend/features/pricing/trade-context.page.html"), "utf8");
  assert.doesNotMatch(tradeContextMarkup, /default_position_management_mode|Default Position Management/);
  assert.match(tradeContextMarkup, /data-ui-column-key="auto_management_admission_mode"/);
  assert.doesNotMatch(schemaSource, /\bdefault_position_management_mode\b|\bposition_management_mode_override\b/);
});
