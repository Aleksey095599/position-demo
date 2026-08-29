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
  return normalizedReferenceCode(value) === "MANUAL_ONLY" ? "MANUAL_ONLY" : null;
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
    "normalizedPricingRuleAutoHedgingAdmissionModeOverride",
    { normalizedReferenceCode }
  );
  const overrideFromControl = compileFunction(
    runtimeSource,
    "pricingRuleAutoHedgingAdmissionModeOverrideFromControl",
    { normalizedReferenceCode }
  );

  assert.equal(normalizeOverride(null), null);
  assert.equal(normalizeOverride(""), null);
  assert.equal(normalizeOverride(" manual_only "), "MANUAL_ONLY");
  assert.equal(normalizeOverride("MANUAL"), null);
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

  control.value = "manual_only";
  assert.equal(overrideFromControl(control), "MANUAL_ONLY");
  assert.equal(control.validationMessage, "");

  control.value = "AUTO_IF_ELIGIBLE";
  assert.equal(overrideFromControl(control), undefined);
  assert.equal(
    control.validationMessage,
    "Select an Auto Hedging Admission policy."
  );
  assert.equal(overrideFromControl(null), undefined);
});

test("normalizes the complete Pricing Rule admission read contract", () => {
  const normalizerSource = functionSource(runtimeSource, "normalizedClientPricingRules");
  const effectiveMode = compileFunction(
    runtimeSource,
    "effectiveAutoHedgingAdmissionModeForRule",
    {
      normalizedPricingRuleAutoHedgingAdmissionModeOverride: normalizedAdmissionOverride,
      normalizedReferenceCode,
      AUTO_HEDGING_ADMISSION_MODES: [
        "AUTO_IF_ELIGIBLE",
        "REVIEW_REQUIRED",
        "MANUAL_ONLY"
      ],
      pricingContextById: () => null,
      normalizedAutoHedgingAdmissionMode: value => {
        const mode = normalizedReferenceCode(value);
        return ["AUTO_IF_ELIGIBLE", "REVIEW_REQUIRED", "MANUAL_ONLY"].includes(mode)
          ? mode
          : "MANUAL_ONLY";
      }
    }
  );

  assert.match(
    normalizerSource,
    /item\?\.autoHedgingAdmissionModeOverride\s*\?\?\s*item\?\.auto_hedging_admission_mode_override/
  );
  assert.match(
    normalizerSource,
    /item\?\.executionContextAdmissionMode\s*\?\?\s*item\?\.execution_context_admission_mode/
  );
  assert.match(
    normalizerSource,
    /item\?\.effectiveAutoHedgingAdmissionMode\s*\?\?\s*item\?\.effective_auto_hedging_admission_mode/
  );
  assert.match(
    normalizerSource,
    /autoHedgingAdmissionModeOverride,\s*executionContextAdmissionMode,\s*effectiveAutoHedgingAdmissionMode,/
  );

  assert.equal(
    effectiveMode({
      autoHedgingAdmissionModeOverride: "MANUAL_ONLY",
      effectiveAutoHedgingAdmissionMode: "AUTO_IF_ELIGIBLE",
      executionContextAdmissionMode: "AUTO_IF_ELIGIBLE"
    }),
    "MANUAL_ONLY"
  );
  assert.equal(
    effectiveMode({
      autoHedgingAdmissionModeOverride: null,
      effectiveAutoHedgingAdmissionMode: "REVIEW_REQUIRED",
      executionContextAdmissionMode: "AUTO_IF_ELIGIBLE"
    }),
    "REVIEW_REQUIRED"
  );
  assert.equal(
    effectiveMode({
      autoHedgingAdmissionModeOverride: null,
      executionContextAdmissionMode: "AUTO_IF_ELIGIBLE"
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
    normalizedPricingRuleAutoHedgingAdmissionModeOverride: normalizedAdmissionOverride
  });

  assert.deepEqual(
    payload(
      {
        marginPercent: "1.25",
        autoHedgingAdmissionModeOverride: "MANUAL_ONLY",
        positionManagementModeOverride: "AUTO"
      },
      { pricingRuleId: 12 }
    ),
    {
      marginPercent: 1.25,
      autoHedgingAdmissionModeOverride: "MANUAL_ONLY"
    }
  );

  assert.deepEqual(
    payload({
      counterpartyId: 7,
      inn: profile.inn,
      pricingContextId: 42,
      currencyPair: "eur/usd",
      marginPercent: "0.15",
      autoHedgingAdmissionModeOverride: null,
      positionManagementModeOverride: "MANUAL"
    }),
    {
      counterpartyId: 7,
      executionContextId: "42",
      ccyPairCode: "EUR_USD",
      marginPercent: 0.15,
      autoHedgingAdmissionModeOverride: null
    }
  );

  assert.doesNotMatch(
    functionSource(runtimeSource, "pricingRuleApiPayload"),
    /positionManagementModeOverride/
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
    "renderClientExecutionContextsPanel"
  );
  const options = compileFunction(
    runtimeSource,
    "pricingRuleAutoHedgingAdmissionOptions",
    {
      normalizedPricingRuleAutoHedgingAdmissionModeOverride: normalizedAdmissionOverride
    }
  );
  const sourceLabel = compileFunction(
    runtimeSource,
    "pricingRuleAutoHedgingAdmissionSourceLabel",
    {
      normalizedPricingRuleAutoHedgingAdmissionModeOverride: normalizedAdmissionOverride
    }
  );

  assert.match(
    pricingRulesMarkup,
    /data-ui-column-key="auto_hedging_admission"/
  );
  assert.match(
    pricingRulesMarkup,
    /data-pricing-rule-column="autoHedgingAdmissionModeOverride"[\s\S]*?>verified_user<\/span>[\s\S]*?<span>Auto Hedging Admission<\/span>/
  );
  assert.doesNotMatch(pricingRulesMarkup, /FX Position Mode|positionManagementModeOverride/);

  const dialogControl = pricingRuleDialogMarkup.match(
    /<select\b[^>]*name="autoHedgingAdmissionModeOverride"[\s\S]*?<\/select>/
  )?.[0] || "";
  assert.ok(dialogControl);
  assert.equal((dialogControl.match(/<option\b/g) || []).length, 2);
  assert.match(dialogControl, /<option value="">Execution Context Admission Policy<\/option>/);
  assert.match(dialogControl, /<option value="MANUAL_ONLY">Manual Control<\/option>/);
  assert.doesNotMatch(
    pricingRuleDialogMarkup,
    /Execution Context Default|FX Position Mode|positionManagementModeOverride/
  );

  assert.match(globalEditSource, /data-pricing-rule-field="autoHedgingAdmissionModeOverride"/);
  assert.match(globalViewSource, /pricingRuleAutoHedgingAdmissionMarkup\(rule\)/);
  assert.match(
    inlineEditorSource,
    /data-client-pricing-rule-inline-field="autoHedgingAdmissionModeOverride"/
  );
  assert.match(inlineEditorSource, /pricingRuleAutoHedgingAdmissionOptions\(normalizedOverride\)/);
  assert.match(clientPanelSource, /clientPricingRuleAutoHedgingAdmissionMarkup\(rule\)/);
  [globalEditSource, inlineEditorSource, clientPanelSource].forEach(source => {
    assert.doesNotMatch(
      source,
      /Execution Context Default|FX Position Mode|positionManagementModeOverride/
    );
  });

  assert.equal(sourceLabel(null), "Execution Context Admission Policy");
  assert.equal(sourceLabel("MANUAL_ONLY"), "Manual Control");
  assert.equal((options(null).match(/<option\b/g) || []).length, 2);
  assert.match(options(null), /<option value="" selected>Execution Context Admission Policy<\/option>/);
  assert.match(options("MANUAL_ONLY"), /<option value="MANUAL_ONLY" selected>Manual Control<\/option>/);
  assert.doesNotMatch(options("MANUAL_ONLY"), /AUTO_IF_ELIGIBLE|REVIEW_REQUIRED/);
});

test("client inline editor persists admission-only changes", () => {
  const inlineMarkup = compileFunction(
    counterpartiesSource,
    "clientPricingRuleInlineEditorMarkup",
    {
      normalizedPricingRuleAutoHedgingAdmissionModeOverride: normalizedAdmissionOverride,
      escapeHtml: value => String(value),
      pricingRuleAutoHedgingAdmissionOptions: selected => {
        const normalized = normalizedAdmissionOverride(selected);
        return "<option value=\"\"" + (normalized === null ? " selected" : "")
          + ">Execution Context Admission Policy</option>"
          + "<option value=\"MANUAL_ONLY\""
          + (normalized === "MANUAL_ONLY" ? " selected" : "")
          + ">Manual Control</option>";
      }
    }
  );
  const editMarkup = inlineMarkup({
    contextId: 42,
    currencyPairs: ["EUR/USD"],
    selectedCurrencyPair: "EUR/USD",
    autoHedgingAdmissionModeOverride: "MANUAL_ONLY",
    marginValue: "1.2500",
    editing: true,
    index: 0,
    saving: false,
    canSave: true
  });

  assert.match(
    editMarkup,
    /data-client-pricing-rule-inline-field="autoHedgingAdmissionModeOverride"/
  );
  assert.match(editMarkup, /<option value="MANUAL_ONLY" selected>Manual Control<\/option>/);
  assert.doesNotMatch(editMarkup, /Execution Context Default|positionManagementModeOverride/);

  const state = {
    mode: "edit",
    index: 0,
    saving: false,
    autoHedgingAdmissionModeOverride: null
  };
  const admissionControl = {
    value: "",
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
    '[data-client-pricing-rule-inline-field="autoHedgingAdmissionModeOverride"]': admissionControl,
    '[data-client-pricing-rule-inline-field="marginPercent"]': { value: "1.25" }
  };
  const row = queryRow(controls);
  const updateAvailability = new Function(
    "clientPricingRuleInlineEditorState",
    "clientPricingRules",
    "normalizedReferenceCode",
    "normalizedPricingRuleAutoHedgingAdmissionModeOverride",
    "normalizeNumber",
    functionSource(runtimeSource, "pricingRuleAutoHedgingAdmissionModeOverrideFromControl")
      + functionSource(
        counterpartiesSource,
        "clientPricingRuleInlineAutoHedgingAdmissionModeOverride"
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
      autoHedgingAdmissionModeOverride: null
    }],
    normalizedReferenceCode,
    normalizedAdmissionOverride,
    value => Number.isFinite(Number(value)) ? Number(value) : null
  );

  updateAvailability(row);
  assert.equal(state.autoHedgingAdmissionModeOverride, null);
  assert.equal(saveButton.disabled, true);
  assert.equal(saveButton.title, "No changes to save");

  admissionControl.value = "MANUAL_ONLY";
  updateAvailability(row);
  assert.equal(state.autoHedgingAdmissionModeOverride, "MANUAL_ONLY");
  assert.equal(saveButton.disabled, false);
  assert.equal(saveButton.title, "");

  admissionControl.value = "AUTO_IF_ELIGIBLE";
  updateAvailability(row);
  assert.equal(state.autoHedgingAdmissionModeOverride, undefined);
  assert.equal(saveButton.disabled, true);
  assert.equal(
    admissionControl.validationMessage,
    "Select an Auto Hedging Admission policy."
  );
});
