"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..", "..");
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

function compileFunction(source, name, dependencies = {}) {
  return new Function(
    ...Object.keys(dependencies),
    functionSource(source, name) + "; return " + name + ";"
  )(...Object.values(dependencies));
}

function normalizedReferenceCode(value) {
  return String(value ?? "").trim().toUpperCase();
}

function normalizedAdmissionOverride(value) {
  return normalizedReferenceCode(value) === "MANUAL" ? "MANUAL" : null;
}

function queryRow(controls) {
  return {
    querySelector(selector) {
      return controls[selector] || null;
    }
  };
}

test("normalizes and validates the nullable Pricing Rule admission override", () => {
  const normalizeOverride = compileFunction(
    runtimeSource,
    "normalizedPricingRulePositionManagementModeSettingOverride",
    { normalizedReferenceCode }
  );
  const overrideFromControl = compileFunction(
    runtimeSource,
    "pricingRulePositionManagementModeSettingOverrideFromControl",
    { normalizedReferenceCode }
  );

  assert.equal(normalizeOverride(null), null);
  assert.equal(normalizeOverride(""), null);
  assert.equal(normalizeOverride(" manual "), "MANUAL");
  assert.equal(normalizeOverride("MANUAL_ONLY"), "MANUAL");
  assert.equal(normalizeOverride("REVIEW_REQUIRED"), null);
  assert.equal(normalizeOverride("AUTO_IF_ELIGIBLE"), null);

  const control = {
    value: "",
    validationMessage: "stale",
    setCustomValidity(message) {
      this.validationMessage = message;
    }
  };

  assert.equal(overrideFromControl(control), null);
  assert.equal(control.validationMessage, "");

  control.value = "manual";
  assert.equal(overrideFromControl(control), "MANUAL");
  assert.equal(control.validationMessage, "");

  control.value = "MANUAL_ONLY";
  assert.equal(overrideFromControl(control), undefined);

  control.value = "AUTO_IF_ELIGIBLE";
  assert.equal(overrideFromControl(control), undefined);
  assert.equal(
    control.validationMessage,
    "Select a Position Management Mode value."
  );

  const manualOverride = {
    type: "checkbox",
    checked: false,
    value: "MANUAL",
    validationMessage: "",
    setCustomValidity(message) {
      this.validationMessage = message;
    }
  };
  assert.equal(overrideFromControl(manualOverride), null);
  manualOverride.checked = true;
  assert.equal(overrideFromControl(manualOverride), "MANUAL");
  assert.equal(overrideFromControl(null), undefined);
});

test("normalizes the complete Pricing Rule admission read contract", () => {
  const normalizerSource = functionSource(runtimeSource, "normalizedClientPricingRules");
  const effectiveMode = compileFunction(
    runtimeSource,
    "effectivePositionManagementModeForRule",
    {
      normalizedPricingRulePositionManagementModeSettingOverride: normalizedAdmissionOverride,
      normalizedReferenceCode,
      POSITION_MANAGEMENT_MODE_SETTINGS: [
        "AUTO_IF_ELIGIBLE",
        "MANUAL"
      ],
      pricingContextById: () => null,
      normalizedPositionManagementModeSetting: value => {
        const mode = normalizedReferenceCode(value);
        return ["AUTO_IF_ELIGIBLE", "MANUAL"].includes(mode)
          ? mode
          : "MANUAL";
      }
    }
  );

  assert.match(
    normalizerSource,
    /item\?\.positionManagementModeOverride\s*\?\?\s*item\?\.position_management_mode_override/
  );
  assert.match(
    normalizerSource,
    /item\?\.tradeContextPositionManagementMode\s*\?\?\s*item\?\.trade_context_admission_mode/
  );
  assert.match(
    normalizerSource,
    /item\?\.effectivePositionManagementMode\s*\?\?\s*item\?\.effective_position_management_mode/
  );
  assert.match(
    normalizerSource,
    /positionManagementModeOverride,\s*tradeContextPositionManagementMode,\s*effectivePositionManagementMode,/
  );

  assert.equal(
    effectiveMode({
      positionManagementModeOverride: "MANUAL",
      effectivePositionManagementMode: "AUTO_IF_ELIGIBLE",
      tradeContextPositionManagementMode: "AUTO_IF_ELIGIBLE"
    }),
    "MANUAL"
  );
  assert.equal(
    effectiveMode({
      positionManagementModeOverride: null,
      effectivePositionManagementMode: "MANUAL",
      tradeContextPositionManagementMode: "AUTO_IF_ELIGIBLE"
    }),
    "MANUAL"
  );
  assert.equal(
    effectiveMode({
      positionManagementModeOverride: null,
      tradeContextPositionManagementMode: "AUTO_IF_ELIGIBLE"
    }),
    "AUTO_IF_ELIGIBLE"
  );
});

test("Pricing Rule writes use the admission override without mutating legacy position mode", () => {
  const profile = { counterpartyId: 7, inn: "7701234567" };
  const payload = compileFunction(runtimeSource, "pricingRuleApiPayload", {
    clientProfiles: [profile],
    clientProfileByInn: inn => inn === profile.inn ? profile : null,
    normalizedPricingContextIdValue: value => String(value ?? "").trim(),
    normalizedPricingRulePositionManagementModeSettingOverride: normalizedAdmissionOverride
  });

  assert.deepEqual(
    payload(
      {
        marginPercent: "1.25",
        positionManagementModeOverride: "MANUAL",
        autoManagementAdmissionModeOverride: "AUTO"
      },
      { pricingRuleId: 12 }
    ),
    {
      marginPercent: 1.25,
      positionManagementModeOverride: "MANUAL"
    }
  );

  assert.deepEqual(
    payload({
      counterpartyId: 7,
      inn: profile.inn,
      pricingContextId: 42,
      currencyPair: "eur/usd",
      marginPercent: "0.15",
      positionManagementModeOverride: null,
      autoManagementAdmissionModeOverride: "MANUAL"
    }),
    {
      counterpartyId: 7,
      tradeContextId: "42",
      ccyPairCode: "EUR_USD",
      marginPercent: 0.15,
      positionManagementModeOverride: null
    }
  );

  assert.doesNotMatch(
    functionSource(runtimeSource, "pricingRuleApiPayload"),
    /autoManagementAdmissionModeOverride/
  );
  assert.match(
    functionSource(runtimeSource, "persistPricingRuleRecord"),
    /const mergedRule = currentRule \? \{ \.\.\.currentRule, \.\.\.rule \} : \{ \.\.\.rule \}/
  );
});

test("Pricing Rule screens expose exactly the two admission sources", () => {
  const globalEditSource = functionSource(runtimeSource, "renderPricingRuleEditRow");
  const globalViewSource = functionSource(runtimeSource, "renderPricingRuleViewRow");
  const inlineEditorSource = functionSource(
    counterpartiesSource,
    "clientPricingRuleInlineEditorMarkup"
  );
  const clientPanelSource = functionSource(
    counterpartiesSource,
    "renderClientTradeContextsPanel"
  );
  const assignmentLabel = compileFunction(
    runtimeSource,
    "pricingRulePositionManagementModeSettingLabel",
    {
      normalizedPricingRulePositionManagementModeSettingOverride: normalizedAdmissionOverride,
      normalizedReferenceCode
    }
  );
  const options = compileFunction(
    runtimeSource,
    "pricingRuleAutoManagementAdmissionOptions",
    {
      normalizedPricingRulePositionManagementModeSettingOverride: normalizedAdmissionOverride,
      pricingRulePositionManagementModeSettingLabel: assignmentLabel
    }
  );
  const assignmentMarkup = compileFunction(
    runtimeSource,
    "pricingRuleAutoManagementAdmissionMarkup",
    {
      pricingRulePositionManagementModeSettingLabel: assignmentLabel,
      effectivePositionManagementModeForRule: rule => rule.effectiveMode,
      positionManagementModeSettingIcon: mode => mode === "AUTO_IF_ELIGIBLE" ? "smart_toy" : "touch_app",
      escapeHtml: value => String(value)
    }
  );

  assert.match(
    pricingRulesMarkup,
    /data-ui-column-key="position_management_mode"/
  );
  const assignmentHeader = pricingRulesMarkup.match(
    /<th id="pricingRuleAutoManagementAdmissionHeader"[\s\S]*?<\/th>/
  )?.[0] || "";
  assert.match(assignmentHeader, /<span>Position Management Mode<\/span>/);
  assert.doesNotMatch(assignmentHeader, /smart_toy|touch_app/);
  assert.doesNotMatch(pricingRulesMarkup, /Initial Mode Assignment|autoManagementAdmissionModeOverride/);

  const dialogControl = pricingRuleDialogMarkup.match(
    /<input\b[^>]*type="checkbox"[^>]*name="positionManagementModeOverride"[^>]*>/
  )?.[0] || "";
  assert.ok(dialogControl);
  assert.match(dialogControl, /value="MANUAL"/);
  assert.match(pricingRuleDialogMarkup, /data-client-pricing-rule-mode-override-value>Manual Mode by Trade Context<\/span>/);
  assert.match(pricingRuleDialogMarkup, /<span class="form-check-label">Manual Mode Override<\/span>/);
  assert.doesNotMatch(pricingRuleDialogMarkup, /<select\b[^>]*name="positionManagementModeOverride"/);
  assert.doesNotMatch(
    pricingRuleDialogMarkup,
    /Trade Context Default|Initial Mode Assignment|autoManagementAdmissionModeOverride/
  );

  assert.match(globalEditSource, /data-pricing-rule-field="positionManagementModeOverride"/);
  assert.match(globalEditSource, /data-pricing-rule-position-management-mode-icon/);
  assert.match(globalViewSource, /pricingRuleAutoManagementAdmissionMarkup\(rule\)/);
  assert.match(
    inlineEditorSource,
    /data-client-pricing-rule-inline-field="positionManagementModeOverride"/
  );
  assert.match(inlineEditorSource, /type="checkbox"[\s\S]*?value="MANUAL"[\s\S]*?Manual Mode Override/);
  assert.match(clientPanelSource, /clientPricingRuleAutoManagementAdmissionMarkup\(rule\)/);
  assert.match(clientPanelSource, /pricingRulePositionManagementModeSettingIcon\(rule\.positionManagementModeOverride, context\.positionManagementMode\)/);
  [globalEditSource, inlineEditorSource, clientPanelSource].forEach(source => {
    assert.doesNotMatch(
      source,
      /Trade Context Default|Initial Mode Assignment|autoManagementAdmissionModeOverride/
    );
  });

  assert.equal(
    assignmentLabel(null, "AUTO_IF_ELIGIBLE"),
    "Auto Mode by Trade Context"
  );
  assert.equal(
    assignmentLabel(null, "MANUAL"),
    "Manual Mode by Trade Context"
  );
  assert.equal(
    assignmentLabel("MANUAL", "MANUAL"),
    "Manual Mode by Pricing Rule Override"
  );
  assert.match(
    assignmentMarkup({ positionManagementModeOverride: null, effectiveMode: "AUTO_IF_ELIGIBLE" }),
    />smart_toy<\/span>[\s\S]*?<span>Auto Mode by Trade Context<\/span>/
  );
  assert.match(
    assignmentMarkup({ positionManagementModeOverride: null, effectiveMode: "MANUAL" }),
    />touch_app<\/span>[\s\S]*?<span>Manual Mode by Trade Context<\/span>/
  );
  assert.match(
    assignmentMarkup({ positionManagementModeOverride: "MANUAL", effectiveMode: "MANUAL" }),
    />touch_app<\/span>[\s\S]*?<span>Manual Mode by Pricing Rule Override<\/span>/
  );
  assert.equal((options(null, "AUTO_IF_ELIGIBLE").match(/<option\b/g) || []).length, 2);
  assert.match(options(null, "AUTO_IF_ELIGIBLE"), /<option value="" selected>Auto Mode by Trade Context<\/option>/);
  assert.match(options(null, "MANUAL"), /<option value="" selected>Manual Mode by Trade Context<\/option>/);
  assert.match(options("MANUAL", "AUTO_IF_ELIGIBLE"), /<option value="MANUAL" selected>Manual Mode by Pricing Rule Override<\/option>/);
  assert.doesNotMatch(options("MANUAL", "AUTO_IF_ELIGIBLE"), /AUTO_IF_ELIGIBLE|MANUAL_ONLY/);
});

test("client inline editor persists admission-only changes", () => {
  const inlineMarkup = compileFunction(
    counterpartiesSource,
    "clientPricingRuleInlineEditorMarkup",
    {
      normalizedPricingRulePositionManagementModeSettingOverride: normalizedAdmissionOverride,
      normalizedReferenceCode,
      escapeHtml: value => String(value),
      pricingRulePositionManagementModeSettingLabel: (selected, tradeContextMode) =>
        normalizedAdmissionOverride(selected) === "MANUAL"
          ? "Manual Mode by Pricing Rule Override"
          : normalizedReferenceCode(tradeContextMode) === "AUTO_IF_ELIGIBLE"
            ? "Auto Mode by Trade Context"
            : "Manual Mode by Trade Context",
      pricingRulePositionManagementModeSettingIcon: (selected, tradeContextMode) =>
        normalizedAdmissionOverride(selected) === "MANUAL"
          || normalizedReferenceCode(tradeContextMode) !== "AUTO_IF_ELIGIBLE"
          ? "touch_app"
          : "smart_toy"
    }
  );
  const editMarkup = inlineMarkup({
    contextId: 42,
    currencyPairs: ["EUR/USD"],
    selectedCurrencyPair: "EUR/USD",
    tradeContextPositionManagementMode: "AUTO_IF_ELIGIBLE",
    positionManagementModeOverride: "MANUAL",
    marginValue: "1.2500",
    editing: true,
    index: 0,
    saving: false,
    canSave: true
  });

  assert.match(
    editMarkup,
    /data-client-pricing-rule-inline-field="positionManagementModeOverride"/
  );
  assert.match(editMarkup, /type="checkbox"[^>]*value="MANUAL"[^>]*checked/);
  assert.match(editMarkup, /data-client-pricing-rule-inline-mode-override-value>Manual Mode by Pricing Rule Override<\/span>/);
  assert.match(editMarkup, /data-client-pricing-rule-inline-mode-override-icon>touch_app<\/span>/);
  assert.match(editMarkup, /aria-label="Position Management Mode" data-tooltip="Position Management Mode"/);
  assert.match(editMarkup, /<span class="form-check-label">Manual Mode Override<\/span>/);
  assert.doesNotMatch(editMarkup, /<select\b[^>]*data-client-pricing-rule-inline-field="positionManagementModeOverride"/);
  assert.doesNotMatch(editMarkup, /Trade Context Default|autoManagementAdmissionModeOverride/);

  const state = {
    mode: "edit",
    index: 0,
    saving: false,
    positionManagementModeOverride: null
  };
  const admissionControl = {
    type: "checkbox",
    value: "MANUAL",
    checked: false,
    disabled: false,
    validationMessage: "",
    setCustomValidity(message) {
      this.validationMessage = message;
    }
  };
  const saveButton = { disabled: false, title: "" };
  const controls = {
    '[data-client-pricing-rule-inline-action="save"]': saveButton,
    '[data-client-pricing-rule-inline-field="currencyPair"]': { value: "EUR/USD" },
    '[data-client-pricing-rule-inline-field="positionManagementModeOverride"]': admissionControl,
    '[data-client-pricing-rule-inline-mode-override-value]': { textContent: "" },
    '[data-client-pricing-rule-inline-mode-override-icon]': { textContent: "" },
    '[data-client-pricing-rule-inline-field="marginPercent"]': { value: "1.25" }
  };
  const row = queryRow(controls);
  row.dataset = { clientPricingRuleTradeContextMode: "AUTO_IF_ELIGIBLE" };
  const updateAvailability = new Function(
    "clientPricingRuleInlineEditorState",
    "clientPricingRules",
    "normalizedReferenceCode",
    "normalizedPricingRulePositionManagementModeSettingOverride",
    "normalizeNumber",
    functionSource(runtimeSource, "pricingRulePositionManagementModeSettingOverrideFromControl")
      + functionSource(runtimeSource, "pricingRulePositionManagementModeSettingLabel")
      + functionSource(
        counterpartiesSource,
        "clientPricingRuleInlinePositionManagementModeSettingOverride"
      )
      + functionSource(
        counterpartiesSource,
        "pricingRulePositionManagementModeSettingIcon"
      )
      + functionSource(
        counterpartiesSource,
        "updateClientPricingRuleInlineEditorAvailability"
      )
      + "; return updateClientPricingRuleInlineEditorAvailability;"
  )(
    state,
    [{
      currencyPair: "EUR/USD",
      marginPercent: 1.25,
      positionManagementModeOverride: null
    }],
    normalizedReferenceCode,
    normalizedAdmissionOverride,
    value => Number.isFinite(Number(value)) ? Number(value) : null
  );

  updateAvailability(row);
  assert.equal(state.positionManagementModeOverride, null);
  assert.equal(controls['[data-client-pricing-rule-inline-mode-override-icon]'].textContent, "smart_toy");
  assert.equal(
    controls['[data-client-pricing-rule-inline-mode-override-value]'].textContent,
    "Auto Mode by Trade Context"
  );
  assert.equal(saveButton.disabled, true);
  assert.equal(saveButton.title, "No changes to save");

  admissionControl.checked = true;
  updateAvailability(row);
  assert.equal(state.positionManagementModeOverride, "MANUAL");
  assert.equal(controls['[data-client-pricing-rule-inline-mode-override-icon]'].textContent, "touch_app");
  assert.equal(
    controls['[data-client-pricing-rule-inline-mode-override-value]'].textContent,
    "Manual Mode by Pricing Rule Override"
  );
  assert.equal(saveButton.disabled, false);
  assert.equal(saveButton.title, "");

  admissionControl.checked = false;
  updateAvailability(row);
  assert.equal(state.positionManagementModeOverride, null);
  assert.equal(saveButton.disabled, true);
  assert.equal(admissionControl.validationMessage, "");
});
