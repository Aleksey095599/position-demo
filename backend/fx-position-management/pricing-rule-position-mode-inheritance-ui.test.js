"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { readFrontendSources } = require("../test-support/frontend-source.js");

const ROOT = path.resolve(__dirname, "..", "..");
const { combinedSource: html, appScript: inlineScript } = readFrontendSources(ROOT);
const schemaSource = fs.readFileSync(path.join(ROOT, "schema.sql"), "utf8");
const serverSource = fs.readFileSync(path.join(ROOT, "server.js"), "utf8");

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

test("global and client editors expose explicit inheritance controls", () => {
  const dialogMarkup = html.match(
    /<form\b[^>]*\bid="clientPricingRuleForm"[\s\S]*?<\/form>/
  )?.[0] || "";
  const globalEditorSource = topLevelFunctionSource("renderPricingRuleEditRow");
  const inlineEditorSource = topLevelFunctionSource("clientPricingRuleInlineEditorMarkup");

  assert.equal(
    (html.match(/>Execution Context Default<\/span>/g) || []).length,
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
  assert.match(globalEditorSource, />Execution Context Default<\/span>/);

  assert.match(dialogMarkup, /id="clientPricingRuleUseExecutionContextDefault"/);
  assert.match(dialogMarkup, /name="useExecutionContextDefault"/);
  assert.match(dialogMarkup, /aria-controls="clientPricingRulePositionManagementModeOverride"/);
  assert.match(dialogMarkup, />Execution Context Default<\/span>/);
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
  assert.match(inlineEditorSource, />Execution Context Default<\/span>/);
  assert.doesNotMatch(inlineEditorSource, /positionManagementModeChoice/);
  assert.equal(
    (inlineEditorSource.match(/client-pricing-configuration-rule-separator/g) || []).length,
    2
  );

  const inlineEditorMarkup = new Function(
    "normalizedPositionManagementModeOverride",
    "effectivePositionManagementModeForRule",
    "escapeHtml",
    "positionManagementModeOptions",
    `${inlineEditorSource}; return clientPricingRuleInlineEditorMarkup;`
  )(
    normalizedOverride,
    () => "MANUAL",
    value => String(value),
    value => `<option value="${value}">${value}</option>`
  );
  const editorArguments = {
    contextId: 42,
    currencyPairs: ["EUR/USD", "USD/KZT"],
    selectedCurrencyPair: "EUR/USD",
    positionManagementModeOverride: null,
    marginValue: "0.2000",
    index: 3,
    saving: false,
    canSave: true
  };
  const editMarkup = inlineEditorMarkup({ ...editorArguments, editing: true });
  assert.match(
    editMarkup,
    /<input type="hidden" value="EUR\/USD" data-client-pricing-rule-inline-field="currencyPair">/
  );
  assert.match(
    editMarkup,
    /client-pricing-configuration-node-value client-pricing-configuration-rule-pair">EUR\/USD<\/span>/
  );
  assert.doesNotMatch(
    editMarkup,
    /<select[^>]*data-client-pricing-rule-inline-field="currencyPair"/
  );

  const createMarkup = inlineEditorMarkup({ ...editorArguments, editing: false });
  assert.match(
    createMarkup,
    /<select[^>]*data-client-pricing-rule-inline-field="currencyPair"/
  );
  assert.doesNotMatch(createMarkup, /<input type="hidden"[^>]*data-client-pricing-rule-inline-field="currencyPair"/);

  const positionManagementModeLabelsSource = inlineScript.match(
    /const POSITION_MANAGEMENT_MODE_LABELS = Object\.freeze\(\{[\s\S]*?\}\);/
  )?.[0] || "";
  assert.ok(positionManagementModeLabelsSource);
  const positionManagementModeLabel = new Function(
    "normalizedPositionManagementMode",
    `${positionManagementModeLabelsSource}
     ${topLevelFunctionSource("positionManagementModeLabel")};
     return positionManagementModeLabel;`
  )(normalizedMode);
  assert.equal(positionManagementModeLabel("MANUAL"), "Manual Control");
  assert.equal(positionManagementModeLabel("AUTO"), "Auto Hedging");

  const options = new Function(
    "normalizedPositionManagementMode",
    "escapeHtml",
    "positionManagementModeLabel",
    `${topLevelFunctionSource("positionManagementModeOptions")}; return positionManagementModeOptions;`
  )(
    normalizedMode,
    value => value,
    positionManagementModeLabel
  );
  assert.match(options("MANUAL"), /<option value="MANUAL" selected>Manual Control<\/option>/);
  assert.match(options("AUTO"), /<option value="AUTO" selected>Auto Hedging<\/option>/);
  assert.doesNotMatch(options("AUTO"), /<option value="">/);

});

test("read-only client branches show only the effective FX Position Mode", () => {
  const globalViewSource = topLevelFunctionSource("pricingRulePositionManagementModeMarkup");
  const clientViewSource = topLevelFunctionSource("clientPricingRulePositionManagementModeMarkup");
  const clientView = new Function(
    "effectivePositionManagementModeForRule",
    "positionManagementModeLabel",
    "escapeHtml",
    `${clientViewSource}; return clientPricingRulePositionManagementModeMarkup;`
  )(
    rule => rule.positionManagementModeOverride || "AUTO",
    value => value === "AUTO" ? "Auto Hedging" : "Manual Control",
    value => value
  );

  assert.doesNotMatch(globalViewSource, /Execution Context default|Pricing Rule override|Effective:/);
  const inheritedMarkup = clientView({ positionManagementModeOverride: null });
  assert.match(inheritedMarkup, /client-pricing-configuration-node-copy is-read-only/);
  assert.match(inheritedMarkup, /Auto Hedging/);
  assert.doesNotMatch(inheritedMarkup, /checkbox|Execution Context Default|client-pricing-configuration-inheritance-indicator|>link<\/span>/);

  const explicitMarkup = clientView({ positionManagementModeOverride: "MANUAL" });
  assert.match(explicitMarkup, /Manual Control/);
  assert.doesNotMatch(explicitMarkup, /checkbox|Execution Context Default|Pricing Rule override|Effective:|client-pricing-configuration-inheritance-indicator|>edit<\/span>/);
});

test("client Pricing Rules use one context strip with lightweight branches", () => {
  const panelSource = topLevelFunctionSource("renderClientExecutionContextsPanel");
  const attachButtonMarkup = html.match(
    /<button\b[^>]*\bid="clientExecutionContextsAttachButton"[\s\S]*?<\/button>/
  )?.[0] || "";

  assert.match(
    panelSource,
    /client-pricing-configuration-rule-piece is-pair[\s\S]*?data-tooltip="Ccy Pair">swap_horiz<\/span>[\s\S]*?client-pricing-configuration-rule-pair/
  );
  assert.match(
    panelSource,
    /client-pricing-configuration-rule-separator[\s\S]*?client-pricing-configuration-rule-piece is-mode[\s\S]*?data-tooltip="FX Position Mode">table_chart<\/span>[\s\S]*?clientPricingRulePositionManagementModeMarkup/
  );
  assert.match(
    panelSource,
    /client-pricing-configuration-rule-piece is-margin[\s\S]*?data-tooltip="Margin">savings<\/span>[\s\S]*?client-pricing-configuration-margin/
  );
  assert.match(
    panelSource,
    /client-pricing-configuration-context-title[\s\S]*?data-tooltip="Execution Context">hub<\/span>[\s\S]*?>Execution Context<\/span>/
  );
  assert.match(
    panelSource,
    /pricingContextFacetsMarkup\(context, \{ executionSystemLabel: true \}\)/
  );
  assert.match(
    topLevelFunctionSource("executionSystemLabelMarkup"),
    /AUTO_PRICED[\s\S]*?flash_auto/
  );
  assert.match(topLevelFunctionSource("executionSystemLabelMarkup"), /execution-system-label__pricing/);
  assert.doesNotMatch(panelSource, /Pricing Context|with Pricing Mode =/);
  assert.match(
    html,
    /\.client-pricing-configuration-tree > \.client-pricing-configuration-context \{[\s\S]*?border: 0;[\s\S]*?background: transparent;/
  );
  assert.match(
    html,
    /\.client-pricing-configuration-context-head \{[\s\S]*?border: 1px solid var\(--bs-border-color\);[\s\S]*?background: var\(--workbench-grid-header-bg\);/
  );
  assert.match(
    html,
    /\.client-pricing-configuration-branch \{[\s\S]*?border-left: 1px solid var\(--bs-border-color\);/
  );
  assert.match(
    html,
    /\.client-pricing-configuration-add-row::after \{[\s\S]*?top: calc\(50% \+ 1px\);[\s\S]*?background: var\(--bs-body-bg\);/
  );
  assert.match(
    html,
    /\.client-pricing-configuration-rule-separator \{[\s\S]*?color: var\(--palette-gray-400\);/
  );
  assert.match(
    html,
    /\.client-pricing-configuration-inline-mode-control \{[\s\S]*?grid-template-columns: max-content minmax\(220px, 1fr\);[\s\S]*?gap: 0;[\s\S]*?border: 1px solid var\(--bs-border-color\);/
  );
  assert.match(
    html,
    /\.client-pricing-configuration-inline-mode-control[\s\S]*?\.form-select \{[\s\S]*?border-left: 1px solid var\(--bs-border-color\);[\s\S]*?border-radius: 0;/
  );
  assert.match(
    html,
    /\.client-pricing-configuration-inline-mode-control[\s\S]*?\.position-management-mode-inherit \{[\s\S]*?background: var\(--bs-tertiary-bg\);/
  );
  assert.match(
    html,
    /\.client-pricing-configuration-inline-mode-control[\s\S]*?\.form-select:disabled \{[\s\S]*?background-color: var\(--bs-secondary-bg\);[\s\S]*?opacity: 1;/
  );
  assert.match(
    html,
    /\.client-pricing-configuration-inline-editor \{[\s\S]*?display: flex;[\s\S]*?flex-wrap: wrap;[\s\S]*?gap: 10px;/
  );
  assert.match(
    html,
    /\.client-pricing-configuration-inline-field\.is-mode \{[\s\S]*?flex: 0 1 460px;/
  );
  assert.match(
    html,
    /\.client-pricing-configuration-node \{[\s\S]*?display: flex;[\s\S]*?border: 0;[\s\S]*?background: transparent;/
  );
  assert.doesNotMatch(
    html,
    /\.client-pricing-configuration-rule-piece\.is-(?:pair|mode|margin) \{[\s\S]*?min-width:/
  );
  assert.match(
    html,
    /#clientProfilePage\.unified-bootstrap-workspace\.workbench-page \.reference-new-button \{[\s\S]*?min-height: 34px;[\s\S]*?padding: 0 14px;/
  );
  assert.match(attachButtonMarkup, /class="btn btn-sm btn-primary reference-new-button"/);
  assert.match(attachButtonMarkup, />Attach Execution Context<\/span>/);
  assert.match(
    panelSource,
    /class="btn btn-sm btn-primary reference-new-button client-pricing-configuration-add-rule"/
  );
  assert.match(panelSource, /data-tooltip="Edit Pricing Rule"/);
  assert.match(panelSource, /data-tooltip="Delete Pricing Rule"/);
  assert.doesNotMatch(attachButtonMarkup, /btn-outline-primary|>\+ Attach/);
  assert.doesNotMatch(panelSource, /btn-outline-primary with-icon client-pricing-configuration-add-rule/);
});

test("inheritance controls map only to null, MANUAL or AUTO", () => {
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

  const globalControls = {
    "[data-pricing-rule-field='useExecutionContextDefault']": { checked: true },
    "[data-pricing-rule-field='positionManagementModeOverride']": { value: "AUTO" }
  };
  const globalRow = queryRow(globalControls);
  assert.equal(globalResolver(globalRow), null);
  globalControls["[data-pricing-rule-field='useExecutionContextDefault']"].checked = false;
  globalControls["[data-pricing-rule-field='positionManagementModeOverride']"].value = "MANUAL";
  assert.equal(globalResolver(globalRow), "MANUAL");
  globalControls["[data-pricing-rule-field='positionManagementModeOverride']"].value = "AUTO";
  assert.equal(globalResolver(globalRow), "AUTO");

  assert.equal(dialogResolver(), null);
  dialogForm.elements.useExecutionContextDefault.checked = false;
  dialogForm.elements.positionManagementModeOverride.value = "MANUAL";
  assert.equal(dialogResolver(), "MANUAL");
  dialogForm.elements.positionManagementModeOverride.value = "AUTO";
  assert.equal(dialogResolver(), "AUTO");

  const inlineInherit = { checked: true };
  const inlineOverride = {
    value: "AUTO",
    dataset: { positionManagementModeInherited: "true" },
    setCustomValidity() {}
  };
  const inlineRow = queryRow({
    '[data-client-pricing-rule-inline-field="useExecutionContextDefault"]': inlineInherit,
    '[data-client-pricing-rule-inline-field="positionManagementModeOverride"]': inlineOverride
  });
  assert.equal(inlineResolver(inlineRow), null);
  inlineInherit.checked = false;
  inlineOverride.value = "MANUAL";
  assert.equal(inlineResolver(inlineRow), "MANUAL");
  inlineOverride.value = "AUTO";
  assert.equal(inlineResolver(inlineRow), "AUTO");
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
  assert.equal(overrideControl.validityMessage, "Select an FX Position mode.");
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
  const syncDialog = new Function(
    "clientPricingRuleForm",
    "clientPricingRuleEditState",
    "clientPricingRules",
    "normalizedPositionManagementModeOverride",
    "normalizedPositionManagementMode",
    "effectivePositionManagementModeForRule",
    `${topLevelFunctionSource("positionManagementModeOverrideFromControls")}
     ${topLevelFunctionSource("clientPricingRuleDialogPositionManagementModeOverride")}
     ${topLevelFunctionSource("syncClientPricingRulePositionManagementModeControls")};
     return syncClientPricingRulePositionManagementModeControls;`
  )(
    dialogForm,
    { mode: "create" },
    [],
    normalizedOverride,
    normalizedMode,
    ({ positionManagementModeOverride }) => positionManagementModeOverride || "AUTO"
  );

  syncDialog();
  assert.equal(dialogForm.elements.positionManagementModeOverride.value, "AUTO");
  assert.equal(dialogForm.elements.positionManagementModeOverride.disabled, true);
  dialogForm.elements.useExecutionContextDefault.checked = false;
  dialogForm.elements.positionManagementModeOverride.value = "MANUAL";
  syncDialog();
  assert.equal(dialogForm.elements.positionManagementModeOverride.disabled, false);

  const inlineControls = {
    '[data-client-pricing-rule-inline-action="save"]': { disabled: true, title: "" },
    '[data-client-pricing-rule-inline-field="currencyPair"]': { value: "USD/KZT" },
    '[data-client-pricing-rule-inline-field="useExecutionContextDefault"]': {
      checked: true,
      disabled: false
    },
    '[data-client-pricing-rule-inline-field="positionManagementModeOverride"]': {
      value: "MANUAL",
      disabled: false,
      dataset: { positionManagementModeInherited: "true" },
      setCustomValidity() {}
    },
    '[data-client-pricing-rule-inline-field="marginPercent"]': { value: "1.25" }
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
    value => Number.isFinite(Number(value)) ? Number(value) : null
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
