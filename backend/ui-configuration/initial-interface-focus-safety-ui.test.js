"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const { readFrontendSources } = require("../test-support/frontend-source.js");

const ROOT = path.resolve(__dirname, "..", "..");
const { documentHtml, appScript } = readFrontendSources(ROOT);

function topLevelFunctionSource(name) {
  const asyncMarker = `async function ${name}(`;
  const marker = appScript.includes(asyncMarker)
    ? asyncMarker
    : `function ${name}(`;
  const start = appScript.indexOf(marker);

  assert.notEqual(start, -1, `Expected frontend function ${name}.`);

  const remainingSource = appScript.slice(start + marker.length);
  const nextFunction = /\n    (?:async )?function [A-Za-z_$][\w$]*\s*\(/.exec(remainingSource);
  const end = nextFunction
    ? start + marker.length + nextFunction.index
    : appScript.length;

  return appScript.slice(start, end);
}

test("every modal dialog opens with neutral heading focus instead of field focus", () => {
  const dialogCount = (documentHtml.match(/<dialog\b/g) || []).length;
  const safeOpenCalls = (appScript.match(/openDialogWithoutFieldFocus\(/g) || []).length - 1;

  assert.ok(dialogCount > 0);
  assert.equal(safeOpenCalls, dialogCount);
  assert.equal((appScript.match(/\.showModal\(\)/g) || []).length, 1);
  assert.doesNotMatch(documentHtml, /\sautofocus(?:\s|=|>)/i);

  const targetSource = topLevelFunctionSource("dialogInitialFocusTarget");
  const focusSource = topLevelFunctionSource("focusDialogWithoutEditableControl");
  const openSource = topLevelFunctionSource("openDialogWithoutFieldFocus");

  assert.match(targetSource, /getAttribute\("aria-labelledby"\)/);
  assert.match(targetSource, /\.modal-title, \.dialog-title, h1, h2, h3/);
  assert.match(focusSource, /setAttribute\("tabindex", "-1"\)/);
  assert.match(focusSource, /target\.focus\(\{ preventScroll: true \}\)/);
  assert.match(openSource, /focusDialogWithoutEditableControl\(dialog\)/);
});

test("opening editable interfaces does not focus or select their first value", () => {
  [
    "openMarketSimulationDialog",
    "showDealDialog",
    "openClientPricingRuleDialog",
    "openClientExecutionContextAttachDialog",
    "openClientDealGenerationDialog",
    "openBatchRollbackDialog",
    "openHedgeQuickModeSettingsEditor",
    "startMarketCcyOptionEdit",
    "startMarketPairOptionEdit",
    "startPricingRuleCreate",
    "startPricingRuleEdit",
    "startClientPricingRuleCreate",
    "startClientPricingRuleEdit",
    "startTradingCounterpartyRowCreate",
    "startClientProfileCreate",
    "startUserRowCreate",
    "startUserRowEdit",
    "startUserCreate",
    "startPricingContextCreate",
    "startPricingContextEdit",
    "startReferenceDataCreate",
    "startReferenceDataEdit",
    "editClientDealGenerationSettingsRow"
  ].forEach(name => {
    const source = topLevelFunctionSource(name);
    assert.doesNotMatch(source, /\.focus\(|\.select\(/, `${name} must not focus an editable field when opened.`);
  });

  assert.doesNotMatch(appScript, /marketSimulationForm\.elements\.bidMin\.(?:focus|select)\(/);
  assert.doesNotMatch(appScript, /queueMarketInlineEditorFocus/);
  assert.doesNotMatch(appScript, /pricingRulesTableLayoutList\.querySelector\("input"\)\?\.focus\(\)/);
});
