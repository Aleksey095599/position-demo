"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..", "..");
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const schemaSource = fs.readFileSync(path.join(ROOT, "schema.sql"), "utf8");
const serverSource = fs.readFileSync(path.join(ROOT, "server.js"), "utf8");
const scripts = [...html.matchAll(/<script(?:[^>]*)>([\s\S]*?)<\/script>/g)];
const inlineScript = scripts.at(-1)?.[1] || "";

function topLevelFunctionSource(name) {
  const marker = `function ${name}(`;
  const start = inlineScript.indexOf(marker);
  assert.notEqual(start, -1, `Expected inline function ${name}.`);
  const remainingSource = inlineScript.slice(start + marker.length);
  const nextFunctionMatch = /\n    (?:async )?function [A-Za-z_$][\w$]*\s*\(/.exec(remainingSource);
  const end = nextFunctionMatch
    ? start + marker.length + nextFunctionMatch.index
    : inlineScript.length;
  return inlineScript.slice(start, end).trim();
}

function normalizedOverride(value) {
  const mode = String(value || "").trim().toUpperCase();
  return mode === "MANUAL" || mode === "AUTO" ? mode : null;
}

function normalizedMode(value) {
  return String(value || "").trim().toUpperCase() === "AUTO" ? "AUTO" : "MANUAL";
}

function queryRow(controls) {
  return {
    querySelector(selector) {
      return controls[selector] || null;
    }
  };
}

test("global and client editors expose the same explicit inheritance control", () => {
  const dialogMarkup = html.match(
    /<form\b[^>]*\bid="clientPricingRuleForm"[\s\S]*?<\/form>/
  )?.[0] || "";
  const globalEditorSource = topLevelFunctionSource("renderPricingRuleEditRow");
  const inlineEditorSource = topLevelFunctionSource("clientPricingRuleInlineEditorMarkup");

  assert.equal(
    (html.match(/>Use Execution Context default<\/span>/g) || []).length,
    3
  );

  assert.match(
    globalEditorSource,
    /data-pricing-rule-field="useExecutionContextDefault"/
  );
  assert.match(
    globalEditorSource,
    /data-pricing-rule-field="positionManagementModeOverride"/
  );
  assert.match(globalEditorSource, />Use Execution Context default<\/span>/);

  assert.match(dialogMarkup, /id="clientPricingRuleUseExecutionContextDefault"/);
  assert.match(dialogMarkup, /name="useExecutionContextDefault"/);
  assert.match(dialogMarkup, /aria-controls="clientPricingRulePositionManagementModeOverride"/);
  assert.match(dialogMarkup, />Use Execution Context default<\/span>/);
  assert.match(
    dialogMarkup,
    /id="clientPricingRulePositionManagementModeOverride"[^>]*name="positionManagementModeOverride"[^>]*disabled/
  );

  assert.match(
    inlineEditorSource,
    /data-client-pricing-rule-inline-field="useExecutionContextDefault"/
  );
  assert.match(
    inlineEditorSource,
    /data-client-pricing-rule-inline-field="positionManagementModeOverride"/
  );
  assert.match(inlineEditorSource, />Use Execution Context default<\/span>/);

  const options = new Function(
    "normalizedPositionManagementMode",
    `${topLevelFunctionSource("positionManagementModeOptions")}; return positionManagementModeOptions;`
  )(normalizedMode);
  assert.match(options("MANUAL"), /<option value="MANUAL" selected>Manual<\/option>/);
  assert.match(options("AUTO"), /<option value="AUTO" selected>Auto<\/option>/);
  assert.doesNotMatch(options("AUTO"), /<option value="">/);
});

test("checked maps to null and unchecked maps only to MANUAL or AUTO on every editor", () => {
  const globalResolver = new Function(
    "normalizedPositionManagementModeOverride",
    "normalizedPositionManagementMode",
    `${topLevelFunctionSource("positionManagementModeOverrideFromControls")}
     ${topLevelFunctionSource("pricingRuleRowPositionManagementModeOverride")};
     return pricingRuleRowPositionManagementModeOverride;`
  )(normalizedOverride, normalizedMode);
  const dialogForm = {
    elements: {
      useExecutionContextDefault: { checked: true },
      positionManagementModeOverride: { value: "AUTO" }
    }
  };
  const dialogResolver = new Function(
    "clientPricingRuleForm",
    "normalizedPositionManagementModeOverride",
    "normalizedPositionManagementMode",
    `${topLevelFunctionSource("positionManagementModeOverrideFromControls")}
     ${topLevelFunctionSource("clientPricingRuleDialogPositionManagementModeOverride")};
     return clientPricingRuleDialogPositionManagementModeOverride;`
  )(dialogForm, normalizedOverride, normalizedMode);
  const inlineResolver = new Function(
    "normalizedPositionManagementModeOverride",
    "normalizedPositionManagementMode",
    `${topLevelFunctionSource("positionManagementModeOverrideFromControls")}
     ${topLevelFunctionSource("clientPricingRuleInlinePositionManagementModeOverride")};
     return clientPricingRuleInlinePositionManagementModeOverride;`
  )(normalizedOverride, normalizedMode);

  const cases = [
    {
      resolve: globalResolver,
      row: queryRow({
        "[data-pricing-rule-field='useExecutionContextDefault']": { checked: true },
        "[data-pricing-rule-field='positionManagementModeOverride']": { value: "AUTO" }
      })
    },
    { resolve: dialogResolver, row: undefined, form: dialogForm },
    {
      resolve: inlineResolver,
      row: queryRow({
        '[data-client-pricing-rule-inline-field="useExecutionContextDefault"]': { checked: true },
        '[data-client-pricing-rule-inline-field="positionManagementModeOverride"]': { value: "AUTO" }
      })
    }
  ];

  cases.forEach(entry => {
    assert.equal(entry.resolve(entry.row), null);

    if (entry.form) {
      entry.form.elements.useExecutionContextDefault.checked = false;
      entry.form.elements.positionManagementModeOverride.value = "MANUAL";
      assert.equal(entry.resolve(), "MANUAL");
      entry.form.elements.positionManagementModeOverride.value = "AUTO";
      assert.equal(entry.resolve(), "AUTO");
      return;
    }

    const selectorPrefix = entry.resolve === globalResolver
      ? "[data-pricing-rule-field='"
      : '[data-client-pricing-rule-inline-field="';
    const selectorSuffix = entry.resolve === globalResolver ? "']" : '"]';
    entry.row.querySelector(`${selectorPrefix}useExecutionContextDefault${selectorSuffix}`).checked = false;
    entry.row.querySelector(`${selectorPrefix}positionManagementModeOverride${selectorSuffix}`).value = "MANUAL";
    assert.equal(entry.resolve(entry.row), "MANUAL");
    entry.row.querySelector(`${selectorPrefix}positionManagementModeOverride${selectorSuffix}`).value = "AUTO";
    assert.equal(entry.resolve(entry.row), "AUTO");
  });
});

test("temporarily using the context default preserves the explicit draft", () => {
  const resolveOverride = new Function(
    "normalizedPositionManagementModeOverride",
    "normalizedPositionManagementMode",
    `${topLevelFunctionSource("positionManagementModeOverrideFromControls")};
     return positionManagementModeOverrideFromControls;`
  )(normalizedOverride, normalizedMode);
  const inheritControl = { checked: false };
  const overrideControl = {
    value: "AUTO",
    dataset: {
      positionManagementModeInherited: "false",
      explicitPositionManagementMode: "AUTO"
    },
    validityMessage: "",
    setCustomValidity(message) {
      this.validityMessage = message;
    }
  };

  overrideControl.value = "MANUAL";
  assert.equal(resolveOverride(inheritControl, overrideControl), "MANUAL");

  inheritControl.checked = true;
  assert.equal(resolveOverride(inheritControl, overrideControl), null);
  overrideControl.value = "AUTO";

  inheritControl.checked = false;
  assert.equal(resolveOverride(inheritControl, overrideControl), "MANUAL");
  assert.equal(overrideControl.value, "MANUAL");

  overrideControl.value = "";
  assert.equal(resolveOverride(inheritControl, overrideControl), undefined);
  assert.equal(overrideControl.required, true);
  assert.equal(overrideControl.validityMessage, "Select Manual or Auto.");
});

test("inheritance disables selectors and explicit mode re-enables them", () => {
  const globalControls = {
    "[data-pricing-rule-field='useExecutionContextDefault']": { checked: true },
    "[data-pricing-rule-field='positionManagementModeOverride']": {
      value: "MANUAL",
      disabled: false
    },
    "[data-pricing-rule-field='pricingContextId']": { value: " 42 " }
  };
  const syncGlobal = new Function(
    "normalizedPositionManagementModeOverride",
    "normalizedPositionManagementMode",
    "effectivePositionManagementModeForRule",
    `${topLevelFunctionSource("positionManagementModeOverrideFromControls")}
     ${topLevelFunctionSource("pricingRuleRowPositionManagementModeOverride")}
     ${topLevelFunctionSource("syncPricingRuleRowPositionManagementModeControls")};
     return syncPricingRuleRowPositionManagementModeControls;`
  )(normalizedOverride, normalizedMode, ({ positionManagementModeOverride }) => (
    positionManagementModeOverride || "AUTO"
  ));
  const globalRow = queryRow(globalControls);

  assert.equal(syncGlobal(globalRow), null);
  assert.equal(globalControls["[data-pricing-rule-field='positionManagementModeOverride']"].value, "AUTO");
  assert.equal(globalControls["[data-pricing-rule-field='positionManagementModeOverride']"].disabled, true);
  globalControls["[data-pricing-rule-field='useExecutionContextDefault']"].checked = false;
  globalControls["[data-pricing-rule-field='positionManagementModeOverride']"].value = "MANUAL";
  assert.equal(syncGlobal(globalRow), "MANUAL");
  assert.equal(globalControls["[data-pricing-rule-field='positionManagementModeOverride']"].disabled, false);

  const dialogForm = {
    elements: {
      useExecutionContextDefault: { checked: true },
      positionManagementModeOverride: { value: "MANUAL", disabled: false },
      pricingContextId: { value: "42" }
    }
  };
  const effectiveLabel = { textContent: "" };
  const updateDialog = new Function(
    "clientPricingRuleForm",
    "clientPricingRuleEditState",
    "clientPricingRules",
    "normalizedPositionManagementModeOverride",
    "normalizedPositionManagementMode",
    "effectivePositionManagementModeForRule",
    "clientPricingRuleEffectivePositionMode",
    "positionManagementModeLabel",
    `${topLevelFunctionSource("positionManagementModeOverrideFromControls")}
     ${topLevelFunctionSource("clientPricingRuleDialogPositionManagementModeOverride")}
     ${topLevelFunctionSource("updateClientPricingRuleEffectivePositionMode")};
     return updateClientPricingRuleEffectivePositionMode;`
  )(
    dialogForm,
    { mode: "create" },
    [],
    normalizedOverride,
    normalizedMode,
    ({ positionManagementModeOverride }) => positionManagementModeOverride || "AUTO",
    effectiveLabel,
    value => value === "AUTO" ? "Auto" : "Manual"
  );

  updateDialog();
  assert.equal(dialogForm.elements.positionManagementModeOverride.value, "AUTO");
  assert.equal(dialogForm.elements.positionManagementModeOverride.disabled, true);
  assert.match(effectiveLabel.textContent, /Execution Context default/);
  dialogForm.elements.useExecutionContextDefault.checked = false;
  dialogForm.elements.positionManagementModeOverride.value = "MANUAL";
  updateDialog();
  assert.equal(dialogForm.elements.positionManagementModeOverride.disabled, false);
  assert.match(effectiveLabel.textContent, /Pricing Rule override/);

  const inlineControls = {
    '[data-client-pricing-rule-inline-action="save"]': { disabled: true, title: "" },
    '[data-client-pricing-rule-inline-field="currencyPair"]': { value: "USD/KZT" },
    '[data-client-pricing-rule-inline-field="useExecutionContextDefault"]': {
      checked: true,
      disabled: false
    },
    '[data-client-pricing-rule-inline-field="positionManagementModeOverride"]': {
      value: "MANUAL",
      disabled: false
    },
    '[data-client-pricing-rule-inline-field="marginPercent"]': { value: "1.25" },
    "[data-client-pricing-rule-inline-effective-position-mode]": { textContent: "" }
  };
  const inlineState = {
    mode: "create",
    pricingContextId: 42,
    saving: false
  };
  const updateInline = new Function(
    "clientPricingRuleInlineEditorState",
    "clientPricingRules",
    "normalizedPositionManagementModeOverride",
    "normalizedPositionManagementMode",
    "effectivePositionManagementModeForRule",
    "normalizeNumber",
    "positionManagementModeLabel",
    `${topLevelFunctionSource("positionManagementModeOverrideFromControls")}
     ${topLevelFunctionSource("clientPricingRuleInlinePositionManagementModeOverride")}
     ${topLevelFunctionSource("updateClientPricingRuleInlineEditorAvailability")};
     return updateClientPricingRuleInlineEditorAvailability;`
  )(
    inlineState,
    [],
    normalizedOverride,
    normalizedMode,
    ({ positionManagementModeOverride }) => positionManagementModeOverride || "AUTO",
    value => Number.isFinite(Number(value)) ? Number(value) : null,
    value => value === "AUTO" ? "Auto" : "Manual"
  );
  const inlineRow = queryRow(inlineControls);

  updateInline(inlineRow);
  assert.equal(inlineState.positionManagementModeOverride, null);
  assert.equal(
    inlineControls['[data-client-pricing-rule-inline-field="positionManagementModeOverride"]'].value,
    "AUTO"
  );
  assert.equal(
    inlineControls['[data-client-pricing-rule-inline-field="positionManagementModeOverride"]'].disabled,
    true
  );
  inlineControls['[data-client-pricing-rule-inline-field="useExecutionContextDefault"]'].checked = false;
  inlineControls['[data-client-pricing-rule-inline-field="positionManagementModeOverride"]'].value = "MANUAL";
  updateInline(inlineRow);
  assert.equal(inlineState.positionManagementModeOverride, "MANUAL");
  assert.equal(
    inlineControls['[data-client-pricing-rule-inline-field="positionManagementModeOverride"]'].disabled,
    false
  );
});

test("inheritance remains the existing nullable override API and database contract", () => {
  const pricingRuleApiPayload = new Function(
    "normalizedPositionManagementModeOverride",
    `${topLevelFunctionSource("pricingRuleApiPayload")}; return pricingRuleApiPayload;`
  )(normalizedOverride);

  assert.deepEqual(
    pricingRuleApiPayload(
      { marginPercent: "1.25", positionManagementModeOverride: null },
      { pricingRuleId: 1 }
    ),
    { marginPercent: 1.25, positionManagementModeOverride: null }
  );
  assert.deepEqual(
    pricingRuleApiPayload(
      { marginPercent: "1.25", positionManagementModeOverride: "AUTO" },
      { pricingRuleId: 1 }
    ),
    { marginPercent: 1.25, positionManagementModeOverride: "AUTO" }
  );

  const pricingRulesSchema = schemaSource.match(
    /CREATE TABLE IF NOT EXISTS pricing_rules\b[\s\S]*?\n\);/
  )?.[0] || "";
  assert.match(pricingRulesSchema, /position_management_mode_override\s+TEXT/);
  assert.match(
    pricingRulesSchema,
    /position_management_mode_override IS NULL[\s\S]*?IN \('MANUAL', 'AUTO'\)/
  );
  assert.doesNotMatch(pricingRulesSchema, /use_execution_context_default/i);
  assert.doesNotMatch(serverSource, /body\.useExecutionContextDefault/);
  assert.match(
    serverSource,
    /Object\.prototype\.hasOwnProperty\.call\(\s*body,\s*"positionManagementModeOverride"\s*\)/
  );
});
