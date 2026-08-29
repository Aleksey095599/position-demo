"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const {
  FX_POSITION_MANAGEMENT_MODE,
  resolveFxPositionManagementMode
} = require("./domain/fx-position-management-policy.js");

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

test("Pricing Rule UI no longer exposes the legacy FX Position Mode override", () => {
  const globalEditorSource = functionSource(runtimeSource, "renderPricingRuleEditRow");
  const globalViewSource = functionSource(runtimeSource, "renderPricingRuleViewRow");
  const clientInlineEditorSource = functionSource(
    counterpartiesSource,
    "clientPricingRuleInlineEditorMarkup"
  );
  const clientPanelSource = functionSource(
    counterpartiesSource,
    "renderClientExecutionContextsPanel"
  );

  [
    pricingRulesMarkup,
    pricingRuleDialogMarkup,
    globalEditorSource,
    globalViewSource,
    clientInlineEditorSource,
    clientPanelSource
  ].forEach(source => {
    assert.doesNotMatch(source, /Execution Context Default/);
    assert.doesNotMatch(source, /FX Position Mode/);
    assert.doesNotMatch(
      source,
      /(?:data-[\w-]+|name)="positionManagementModeOverride"/
    );
  });

  assert.match(
    pricingRulesMarkup,
    /data-pricing-rule-column="autoHedgingAdmissionModeOverride"/
  );
  assert.match(
    pricingRuleDialogMarkup,
    /name="autoHedgingAdmissionModeOverride"/
  );
  assert.match(
    clientInlineEditorSource,
    /data-client-pricing-rule-inline-field="autoHedgingAdmissionModeOverride"/
  );

  const ruleNormalizerSource = functionSource(runtimeSource, "normalizedClientPricingRules");
  assert.match(
    ruleNormalizerSource,
    /item\?\.positionManagementModeOverride \?\? item\?\.position_management_mode_override/
  );
  assert.match(
    ruleNormalizerSource,
    /positionManagementModeOverride,\s*effectivePositionManagementMode,/
  );
});

test("legacy nullable override remains a supported schema and API compatibility contract", () => {
  const pricingRulesSchema = schemaSource.match(
    /CREATE TABLE IF NOT EXISTS pricing_rules\b[\s\S]*?\n\);/
  )?.[0] || "";
  const createValidationSource = functionSource(serverSource, "validatePricingRulePayload");
  const updateValidationSource = functionSource(
    serverSource,
    "validatePricingRuleUpdatePayload"
  );

  assert.match(pricingRulesSchema, /position_management_mode_override\s+TEXT/);
  assert.match(
    pricingRulesSchema,
    /position_management_mode_override IS NULL[\s\S]*?IN \('MANUAL', 'AUTO'\)/
  );
  assert.doesNotMatch(pricingRulesSchema, /use_execution_context_default/i);

  assert.match(
    createValidationSource,
    /hasOwnProperty\.call\(body, "positionManagementModeOverride"\)/
  );
  assert.match(
    updateValidationSource,
    /hasPositionManagementModeOverride[\s\S]*?body\.positionManagementModeOverride[\s\S]*?current\.positionManagementModeOverride/
  );
  assert.match(
    updateValidationSource,
    /positionManagementModeOverride: positionManagementModeOverride\.value/
  );

  const pricingRulesReadSource = functionSource(serverSource, "pricingRules");
  assert.match(
    pricingRulesReadSource,
    /r\.position_management_mode_override AS positionManagementModeOverride/
  );
  assert.match(
    pricingRulesReadSource,
    /effectivePositionManagementMode: resolveFxPositionManagementMode\(\{[\s\S]*?pricingRuleOverride: rule\.positionManagementModeOverride,[\s\S]*?executionContextDefault: rule\.executionContextDefaultPositionManagementMode/
  );
});

test("legacy materialization precedence remains Pricing Rule then Execution Context then Manual", () => {
  assert.equal(
    resolveFxPositionManagementMode({
      pricingRuleOverride: "AUTO",
      executionContextDefault: "MANUAL"
    }),
    FX_POSITION_MANAGEMENT_MODE.AUTO
  );
  assert.equal(
    resolveFxPositionManagementMode({
      pricingRuleOverride: null,
      executionContextDefault: "AUTO"
    }),
    FX_POSITION_MANAGEMENT_MODE.AUTO
  );
  assert.equal(
    resolveFxPositionManagementMode({
      pricingRuleOverride: null,
      executionContextDefault: null
    }),
    FX_POSITION_MANAGEMENT_MODE.MANUAL
  );

  const initialModeSource = functionSource(serverSource, "initialFxPositionMode");
  assert.match(
    initialModeSource,
    /rule\.position_management_mode_override AS pricingRuleOverride/
  );
  assert.match(
    initialModeSource,
    /context\.default_position_management_mode AS executionContextDefault/
  );
  assert.match(initialModeSource, /return resolveFxPositionManagementMode\(policy\)/);
});
