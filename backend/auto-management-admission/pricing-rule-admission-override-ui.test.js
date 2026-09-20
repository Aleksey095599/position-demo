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
  return normalizedReferenceCode(value) === "REVIEW_REQUIRED" ? "REVIEW_REQUIRED" : null;
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
    "normalizedPricingRuleAutoManagementAdmissionModeOverride",
    { normalizedReferenceCode }
  );
  const overrideFromControl = compileFunction(
    runtimeSource,
    "pricingRuleAutoManagementAdmissionModeOverrideFromControl",
    { normalizedReferenceCode }
  );

  assert.equal(normalizeOverride(null), null);
  assert.equal(normalizeOverride(""), null);
  assert.equal(normalizeOverride(" review_required "), "REVIEW_REQUIRED");
  assert.equal(normalizeOverride("MANUAL_ONLY"), "REVIEW_REQUIRED");
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

  control.value = "review_required";
  assert.equal(overrideFromControl(control), "REVIEW_REQUIRED");
  assert.equal(control.validationMessage, "");

  control.value = "MANUAL_ONLY";
  assert.equal(overrideFromControl(control), undefined);

  control.value = "AUTO_IF_ELIGIBLE";
  assert.equal(overrideFromControl(control), undefined);
  assert.equal(
    control.validationMessage,
    "Select an Initial Mode Assignment value."
  );

  const manualOverride = {
    type: "checkbox",
    checked: false,
    value: "REVIEW_REQUIRED",
    validationMessage: "",
    setCustomValidity(message) {
      this.validationMessage = message;
    }
  };
  assert.equal(overrideFromControl(manualOverride), null);
  manualOverride.checked = true;
  assert.equal(overrideFromControl(manualOverride), "REVIEW_REQUIRED");
  assert.equal(overrideFromControl(null), undefined);
});

test("normalizes the complete Pricing Rule admission read contract", () => {
  const normalizerSource = functionSource(runtimeSource, "normalizedClientPricingRules");
  const effectiveMode = compileFunction(
    runtimeSource,
    "effectiveAutoManagementAdmissionModeForRule",
    {
      normalizedPricingRuleAutoManagementAdmissionModeOverride: normalizedAdmissionOverride,
      normalizedReferenceCode,
      AUTO_MANAGEMENT_ADMISSION_MODES: [
        "AUTO_IF_ELIGIBLE",
        "REVIEW_REQUIRED"
      ],
      pricingContextById: () => null,
      normalizedAutoManagementAdmissionMode: value => {
        const mode = normalizedReferenceCode(value);
        return ["AUTO_IF_ELIGIBLE", "REVIEW_REQUIRED"].includes(mode)
          ? mode
          : "REVIEW_REQUIRED";
      }
    }
  );

  assert.match(
    normalizerSource,
    /item\?\.autoManagementAdmissionModeOverride\s*\?\?\s*item\?\.auto_management_admission_mode_override/
  );
  assert.match(
    normalizerSource,
    /item\?\.tradeContextAdmissionMode\s*\?\?\s*item\?\.trade_context_admission_mode/
  );
  assert.match(
    normalizerSource,
    /item\?\.effectiveAutoManagementAdmissionMode\s*\?\?\s*item\?\.effective_auto_management_admission_mode/
  );
  assert.match(
    normalizerSource,
    /autoManagementAdmissionModeOverride,\s*tradeContextAdmissionMode,\s*effectiveAutoManagementAdmissionMode,/
  );

  assert.equal(
    effectiveMode({
      autoManagementAdmissionModeOverride: "REVIEW_REQUIRED",
      effectiveAutoManagementAdmissionMode: "AUTO_IF_ELIGIBLE",
      tradeContextAdmissionMode: "AUTO_IF_ELIGIBLE"
    }),
    "REVIEW_REQUIRED"
  );
  assert.equal(
    effectiveMode({
      autoManagementAdmissionModeOverride: null,
      effectiveAutoManagementAdmissionMode: "REVIEW_REQUIRED",
      tradeContextAdmissionMode: "AUTO_IF_ELIGIBLE"
    }),
    "REVIEW_REQUIRED"
  );
  assert.equal(
    effectiveMode({
      autoManagementAdmissionModeOverride: null,
      tradeContextAdmissionMode: "AUTO_IF_ELIGIBLE"
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
    normalizedPricingRuleAutoManagementAdmissionModeOverride: normalizedAdmissionOverride
  });

  assert.deepEqual(
    payload(
      {
        marginPercent: "1.25",
        autoManagementAdmissionModeOverride: "REVIEW_REQUIRED",
        positionManagementModeOverride: "AUTO"
      },
      { pricingRuleId: 12 }
    ),
    {
      marginPercent: 1.25,
      autoManagementAdmissionModeOverride: "REVIEW_REQUIRED"
    }
  );

  assert.deepEqual(
    payload({
      counterpartyId: 7,
      inn: profile.inn,
      pricingContextId: 42,
      currencyPair: "eur/usd",
      marginPercent: "0.15",
      autoManagementAdmissionModeOverride: null,
      positionManagementModeOverride: "MANUAL"
    }),
    {
      counterpartyId: 7,
      tradeContextId: "42",
      ccyPairCode: "EUR_USD",
      marginPercent: 0.15,
      autoManagementAdmissionModeOverride: null
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
    "renderClientTradeContextsPanel"
  );
  const assignmentLabel = compileFunction(
    runtimeSource,
    "pricingRuleInitialModeAssignmentLabel",
    {
      normalizedPricingRuleAutoManagementAdmissionModeOverride: normalizedAdmissionOverride,
      normalizedReferenceCode
    }
  );
  const options = compileFunction(
    runtimeSource,
    "pricingRuleAutoManagementAdmissionOptions",
    {
      normalizedPricingRuleAutoManagementAdmissionModeOverride: normalizedAdmissionOverride,
      pricingRuleInitialModeAssignmentLabel: assignmentLabel
    }
  );
  const assignmentMarkup = compileFunction(
    runtimeSource,
    "pricingRuleAutoManagementAdmissionMarkup",
    {
      pricingRuleInitialModeAssignmentLabel: assignmentLabel,
      effectiveAutoManagementAdmissionModeForRule: rule => rule.effectiveMode,
      initialModeAssignmentIcon: mode => mode === "AUTO_IF_ELIGIBLE" ? "smart_toy" : "touch_app",
      escapeHtml: value => String(value)
    }
  );

  assert.match(
    pricingRulesMarkup,
    /data-ui-column-key="auto_management_admission"/
  );
  const assignmentHeader = pricingRulesMarkup.match(
    /<th id="pricingRuleAutoManagementAdmissionHeader"[\s\S]*?<\/th>/
  )?.[0] || "";
  assert.match(assignmentHeader, /<span>Initial Mode Assignment<\/span>/);
  assert.doesNotMatch(assignmentHeader, /smart_toy|touch_app/);
  assert.doesNotMatch(pricingRulesMarkup, /Position Management Mode|positionManagementModeOverride/);

  const dialogControl = pricingRuleDialogMarkup.match(
    /<input\b[^>]*type="checkbox"[^>]*name="autoManagementAdmissionModeOverride"[^>]*>/
  )?.[0] || "";
  assert.ok(dialogControl);
  assert.match(dialogControl, /value="REVIEW_REQUIRED"/);
  assert.match(pricingRuleDialogMarkup, /data-client-pricing-rule-mode-override-value>Manual Mode by Trade Context<\/span>/);
  assert.match(pricingRuleDialogMarkup, /<span class="form-check-label">Manual Mode Override<\/span>/);
  assert.doesNotMatch(pricingRuleDialogMarkup, /<select\b[^>]*name="autoManagementAdmissionModeOverride"/);
  assert.doesNotMatch(
    pricingRuleDialogMarkup,
    /Trade Context Default|Position Management Mode|positionManagementModeOverride/
  );

  assert.match(globalEditSource, /data-pricing-rule-field="autoManagementAdmissionModeOverride"/);
  assert.match(globalEditSource, /data-pricing-rule-initial-mode-assignment-icon/);
  assert.match(globalViewSource, /pricingRuleAutoManagementAdmissionMarkup\(rule\)/);
  assert.match(
    inlineEditorSource,
    /data-client-pricing-rule-inline-field="autoManagementAdmissionModeOverride"/
  );
  assert.match(inlineEditorSource, /type="checkbox"[\s\S]*?value="REVIEW_REQUIRED"[\s\S]*?Manual Mode Override/);
  assert.match(clientPanelSource, /clientPricingRuleAutoManagementAdmissionMarkup\(rule\)/);
  assert.match(clientPanelSource, /pricingRuleInitialModeAssignmentIcon\(rule\.autoManagementAdmissionModeOverride, context\.autoManagementAdmissionMode\)/);
  [globalEditSource, inlineEditorSource, clientPanelSource].forEach(source => {
    assert.doesNotMatch(
      source,
      /Trade Context Default|Position Management Mode|positionManagementModeOverride/
    );
  });

  assert.equal(
    assignmentLabel(null, "AUTO_IF_ELIGIBLE"),
    "Auto Mode by Trade Context"
  );
  assert.equal(
    assignmentLabel(null, "REVIEW_REQUIRED"),
    "Manual Mode by Trade Context"
  );
  assert.equal(
    assignmentLabel("REVIEW_REQUIRED", "REVIEW_REQUIRED"),
    "Manual Mode by Pricing Rule Override"
  );
  assert.match(
    assignmentMarkup({ autoManagementAdmissionModeOverride: null, effectiveMode: "AUTO_IF_ELIGIBLE" }),
    />smart_toy<\/span>[\s\S]*?<span>Auto Mode by Trade Context<\/span>/
  );
  assert.match(
    assignmentMarkup({ autoManagementAdmissionModeOverride: null, effectiveMode: "REVIEW_REQUIRED" }),
    />touch_app<\/span>[\s\S]*?<span>Manual Mode by Trade Context<\/span>/
  );
  assert.match(
    assignmentMarkup({ autoManagementAdmissionModeOverride: "REVIEW_REQUIRED", effectiveMode: "REVIEW_REQUIRED" }),
    />touch_app<\/span>[\s\S]*?<span>Manual Mode by Pricing Rule Override<\/span>/
  );
  assert.equal((options(null, "AUTO_IF_ELIGIBLE").match(/<option\b/g) || []).length, 2);
  assert.match(options(null, "AUTO_IF_ELIGIBLE"), /<option value="" selected>Auto Mode by Trade Context<\/option>/);
  assert.match(options(null, "REVIEW_REQUIRED"), /<option value="" selected>Manual Mode by Trade Context<\/option>/);
  assert.match(options("REVIEW_REQUIRED", "AUTO_IF_ELIGIBLE"), /<option value="REVIEW_REQUIRED" selected>Manual Mode by Pricing Rule Override<\/option>/);
  assert.doesNotMatch(options("REVIEW_REQUIRED", "AUTO_IF_ELIGIBLE"), /AUTO_IF_ELIGIBLE|MANUAL_ONLY/);
});

test("client inline editor persists admission-only changes", () => {
  const inlineMarkup = compileFunction(
    counterpartiesSource,
    "clientPricingRuleInlineEditorMarkup",
    {
      normalizedPricingRuleAutoManagementAdmissionModeOverride: normalizedAdmissionOverride,
      normalizedReferenceCode,
      escapeHtml: value => String(value),
      pricingRuleInitialModeAssignmentLabel: (selected, tradeContextMode) =>
        normalizedAdmissionOverride(selected) === "REVIEW_REQUIRED"
          ? "Manual Mode by Pricing Rule Override"
          : normalizedReferenceCode(tradeContextMode) === "AUTO_IF_ELIGIBLE"
            ? "Auto Mode by Trade Context"
            : "Manual Mode by Trade Context",
      pricingRuleInitialModeAssignmentIcon: (selected, tradeContextMode) =>
        normalizedAdmissionOverride(selected) === "REVIEW_REQUIRED"
          || normalizedReferenceCode(tradeContextMode) !== "AUTO_IF_ELIGIBLE"
          ? "touch_app"
          : "smart_toy"
    }
  );
  const editMarkup = inlineMarkup({
    contextId: 42,
    currencyPairs: ["EUR/USD"],
    selectedCurrencyPair: "EUR/USD",
    tradeContextAdmissionMode: "AUTO_IF_ELIGIBLE",
    autoManagementAdmissionModeOverride: "REVIEW_REQUIRED",
    marginValue: "1.2500",
    editing: true,
    index: 0,
    saving: false,
    canSave: true
  });

  assert.match(
    editMarkup,
    /data-client-pricing-rule-inline-field="autoManagementAdmissionModeOverride"/
  );
  assert.match(editMarkup, /type="checkbox"[^>]*value="REVIEW_REQUIRED"[^>]*checked/);
  assert.match(editMarkup, /data-client-pricing-rule-inline-mode-override-value>Manual Mode by Pricing Rule Override<\/span>/);
  assert.match(editMarkup, /data-client-pricing-rule-inline-mode-override-icon>touch_app<\/span>/);
  assert.match(editMarkup, /aria-label="Initial Mode Assignment" data-tooltip="Initial Mode Assignment"/);
  assert.match(editMarkup, /<span class="form-check-label">Manual Mode Override<\/span>/);
  assert.doesNotMatch(editMarkup, /<select\b[^>]*data-client-pricing-rule-inline-field="autoManagementAdmissionModeOverride"/);
  assert.doesNotMatch(editMarkup, /Trade Context Default|positionManagementModeOverride/);

  const state = {
    mode: "edit",
    index: 0,
    saving: false,
    autoManagementAdmissionModeOverride: null
  };
  const admissionControl = {
    type: "checkbox",
    value: "REVIEW_REQUIRED",
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
    '[data-client-pricing-rule-inline-field="autoManagementAdmissionModeOverride"]': admissionControl,
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
    "normalizedPricingRuleAutoManagementAdmissionModeOverride",
    "normalizeNumber",
    functionSource(runtimeSource, "pricingRuleAutoManagementAdmissionModeOverrideFromControl")
      + functionSource(runtimeSource, "pricingRuleInitialModeAssignmentLabel")
      + functionSource(
        counterpartiesSource,
        "clientPricingRuleInlineAutoManagementAdmissionModeOverride"
      )
      + functionSource(
        counterpartiesSource,
        "pricingRuleInitialModeAssignmentIcon"
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
      autoManagementAdmissionModeOverride: null
    }],
    normalizedReferenceCode,
    normalizedAdmissionOverride,
    value => Number.isFinite(Number(value)) ? Number(value) : null
  );

  updateAvailability(row);
  assert.equal(state.autoManagementAdmissionModeOverride, null);
  assert.equal(controls['[data-client-pricing-rule-inline-mode-override-icon]'].textContent, "smart_toy");
  assert.equal(
    controls['[data-client-pricing-rule-inline-mode-override-value]'].textContent,
    "Auto Mode by Trade Context"
  );
  assert.equal(saveButton.disabled, true);
  assert.equal(saveButton.title, "No changes to save");

  admissionControl.checked = true;
  updateAvailability(row);
  assert.equal(state.autoManagementAdmissionModeOverride, "REVIEW_REQUIRED");
  assert.equal(controls['[data-client-pricing-rule-inline-mode-override-icon]'].textContent, "touch_app");
  assert.equal(
    controls['[data-client-pricing-rule-inline-mode-override-value]'].textContent,
    "Manual Mode by Pricing Rule Override"
  );
  assert.equal(saveButton.disabled, false);
  assert.equal(saveButton.title, "");

  admissionControl.checked = false;
  updateAvailability(row);
  assert.equal(state.autoManagementAdmissionModeOverride, null);
  assert.equal(saveButton.disabled, true);
  assert.equal(admissionControl.validationMessage, "");
});
