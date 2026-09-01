"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..", "..");
const hedgingSettingsPageHtml = fs.readFileSync(
  path.join(ROOT, "frontend", "features", "hedging", "hedging-settings.page.html"),
  "utf8"
);
const admissionPairDialogHtml = fs.readFileSync(
  path.join(
    ROOT,
    "frontend",
    "features",
    "hedging",
    "components",
    "auto-hedging-admission-pairs.dialog.html"
  ),
  "utf8"
);
const documentHtml = [
  hedgingSettingsPageHtml,
  admissionPairDialogHtml
].join("\n");
const appScript = [
  path.join(ROOT, "frontend", "app", "core", "runtime.js"),
  path.join(ROOT, "frontend", "features", "hedging", "hedging.page.js")
].map(filePath => fs.readFileSync(filePath, "utf8")).join("\n");
const settingsStyle = fs.readFileSync(
  path.join(ROOT, "frontend", "features", "hedging", "hedging-settings.css"),
  "utf8"
);
const fragmentManifest = fs.readFileSync(
  path.join(ROOT, "frontend", "fragment-manifest.json"),
  "utf8"
);
const policyMarkup = documentHtml.match(
  /<div class="[^"]*auto-hedging-admission-settings-panel"[\s\S]*?<\/div>\s*<\/div>\s*<\/section>/
)?.[0] || "";

test("Auto Hedging Settings presents the required core rule and configurable eligibility checks", () => {
  assert.match(
    documentHtml,
    />Initial Auto Hedging Admission Policy<\/h3>[\s\S]*?Defines how an FX Trade is routed when it enters FX Position: to Auto Hedging or Manual Review\./
  );
  assert.match(
    policyMarkup,
    /aria-label="Client FX Deal Initial Admission Policy"/
  );
  assert.doesNotMatch(
    policyMarkup,
    />Client FX Deal Initial Admission Policy<\/strong>/
  );
  assert.doesNotMatch(
    policyMarkup,
    /Current executable demo policy for automatic admission of Client FX Deals\./
  );
  assert.match(policyMarkup, /id="autoHedgingAdmissionPolicyRevision" hidden/);
  assert.match(
    policyMarkup,
    />hub<\/span>[\s\S]*?>Execution Context<\/h5>[\s\S]*?Uses the Auto Hedging Admission configured in the Client FX Deal's Execution Context\./
  );
  assert.doesNotMatch(policyMarkup, />lock<\/span>/);
  assert.doesNotMatch(policyMarkup, />Required<\/span>/);
  assert.doesNotMatch(policyMarkup, />Always applied<\/span>/);
  assert.doesNotMatch(policyMarkup, /aria-label="Rule status"/);
  assert.match(
    policyMarkup,
    /href="#execution-context\?focus=auto-hedging-admission&amp;return=%23hedging-settings%3Aauto-hedging%3Ainitial-admission"[\s\S]*?aria-label="Open Execution Context settings"[\s\S]*?data-tooltip="Open Execution Context settings"[\s\S]*?>settings<\/span>/
  );
  const policyNodeTitles = [...policyMarkup.matchAll(/<h5\b[^>]*>([^<]+)<\/h5>/g)]
    .map(match => match[1].trim());
  assert.deepEqual(policyNodeTitles, [
    "Execution Context",
    "Pricing Rule",
    "Ccy Pair",
    "Amount Limits",
    "Transfer Rate Deviation"
  ]);
  assert.match(
    policyMarkup,
    />Ccy Pair<\/h5>[\s\S]*?Defines which Ccy Pairs are eligible for Auto Hedging\./
  );
  assert.match(
    policyMarkup,
    />Amount Limits<\/h5>[\s\S]*?Sets the maximum Trade Amount in Base Ccy for each eligible Ccy Pair\./
  );
  assert.match(
    policyMarkup,
    />Transfer Rate Deviation<\/h5>[\s\S]*?Sets the maximum permitted deviation from the applicable Market Pulse rate for each Ccy Pair\./
  );
  assert.doesNotMatch(policyMarkup, /\bsemantic-section\b/);
  assert.doesNotMatch(policyMarkup, />Core Rule<\/h3>/);
  assert.doesNotMatch(policyMarkup, />Eligibility Checks<\/h3>/);
  assert.match(
    admissionPairDialogHtml,
    /id="autoHedgingAdmissionPairSearch"/
  );
  assert.match(
    settingsStyle,
    /\.auto-hedging-admission-rule-tree::before \{[\s\S]*?background: var\(--bs-border-color\)/
  );
  assert.match(
    settingsStyle,
    /\.auto-hedging-admission-policy-block:last-of-type::after \{[\s\S]*?background: var\(--auto-hedging-admission-tree-bg\)/
  );
  assert.match(
    settingsStyle,
    /\.auto-hedging-admission-policy-block \.reference-grid-action \{[\s\S]*?display: inline-flex;[\s\S]*?align-items: center;[\s\S]*?justify-content: center;[\s\S]*?width: 30px;[\s\S]*?height: 30px;/
  );
  assert.doesNotMatch(policyMarkup, /id="autoHedgingAdmissionPolicySaveButton"/);
  assert.doesNotMatch(policyMarkup, />Save Policy<\/span>/);
  assert.doesNotMatch(settingsStyle, /\.auto-hedging-client-policy-head/);
});

test("Ccy Pair, Amount Limits and Transfer Rate Deviation open one focused editor", () => {
  const editButtons = [...policyMarkup.matchAll(
    /<button\b[^>]*id="(autoHedgingAdmission(?:CcyPair|AmountLimit|Deviation)EditButton)"[^>]*>/g
  )].map(match => match[0]);

  assert.equal(editButtons.length, 3);
  assert.deepEqual(
    editButtons.map(button => button.match(/id="([^"]+)"/)?.[1]),
    [
      "autoHedgingAdmissionCcyPairEditButton",
      "autoHedgingAdmissionAmountLimitEditButton",
      "autoHedgingAdmissionDeviationEditButton"
    ]
  );
  assert.deepEqual(
    editButtons.map(button => button.match(/data-auto-hedging-admission-focus="([^"]+)"/)?.[1]),
    ["automatic-admission", "amount-limit", "transfer-rate-deviation"]
  );
  editButtons.forEach(button => {
    assert.match(button, /aria-haspopup="dialog"/);
    assert.match(button, /aria-controls="autoHedgingAdmissionPairDialog"/);
  });
  assert.doesNotMatch(
    hedgingSettingsPageHtml,
    /aria-controls="autoHedgingAdmissionDeviationDialog"/
  );
  assert.doesNotMatch(
    fragmentManifest,
    /auto-hedging-admission-deviation\.dialog\.html/
  );
  assert.match(
    appScript,
    /\[\s*autoHedgingAdmissionCcyPairEditButton,\s*autoHedgingAdmissionAmountLimitEditButton,\s*autoHedgingAdmissionDeviationEditButton\s*\]\.forEach\(button => \{[\s\S]*?button\.addEventListener\("click", openAutoHedgingAdmissionPairDialog\)/
  );
  assert.doesNotMatch(appScript, /\bautoHedgingAdmissionPairEditButton\b/);
});

test("Admission Policy edits all per-pair criteria in one searchable table", () => {
  assert.match(documentHtml, /id="autoHedgingAdmissionPairDialog"[^>]*aria-labelledby="autoHedgingAdmissionPairDialogTitle"/);
  assert.match(
    admissionPairDialogHtml,
    />Ccy Pair Admission Criteria<\/h2>/
  );
  assert.match(documentHtml, /id="autoHedgingAdmissionPairSearch"/);
  assert.match(documentHtml, /id="autoHedgingAdmissionPairFilter"/);
  assert.match(documentHtml, /<option value="ALL">All<\/option>/);
  assert.match(documentHtml, /<option value="ENABLED">Enabled<\/option>/);
  assert.match(documentHtml, /<option value="DISABLED">Disabled<\/option>/);
  const focusedColumns = [...admissionPairDialogHtml.matchAll(
    /<th\b[^>]*data-auto-hedging-admission-column="([^"]+)"[^>]*>/g
  )].map(match => match[1]);
  assert.deepEqual(focusedColumns, [
    "automatic-admission",
    "amount-limit",
    "transfer-rate-deviation"
  ]);
  assert.match(
    admissionPairDialogHtml,
    /<th scope="col">[\s\S]*?class="reference-column-title">Ccy Pair<\/span>[\s\S]*?class="reference-header-filter"[^>]*id="autoHedgingAdmissionPairSearch"/
  );
  assert.match(
    admissionPairDialogHtml,
    /data-auto-hedging-admission-column="automatic-admission"[\s\S]*?class="reference-column-title">Eligible for Auto Hedging<\/span>[\s\S]*?class="reference-header-filter form-select"[^>]*id="autoHedgingAdmissionPairFilter"/
  );
  assert.match(
    admissionPairDialogHtml,
    /data-auto-hedging-admission-column="amount-limit"[\s\S]*?class="reference-column-title">Maximum Trade Amount \(Base Ccy\)<\/span>/
  );
  assert.match(
    admissionPairDialogHtml,
    /data-auto-hedging-admission-column="transfer-rate-deviation"[\s\S]*?class="reference-column-title">Transfer Rate Deviation \(%\)<\/span>/
  );
  assert.match(
    admissionPairDialogHtml,
    /class="[^"]*unified-data-table[^"]*auto-hedging-admission-pair-table"[^>]*data-column-sizing="managed"[\s\S]*?<colgroup>/
  );
  assert.doesNotMatch(
    admissionPairDialogHtml,
    /auto-hedging-admission-pair-toolbar|autoHedgingAdmissionPairSearchClear/
  );
  assert.doesNotMatch(documentHtml, />Save Policy<\/span>/);
  assert.match(documentHtml, /id="autoHedgingAdmissionPairDialogCancel"/);
  assert.match(
    documentHtml,
    /id="autoHedgingAdmissionPairDialogSave"[^>]*>[\s\S]*?>Save Changes<\/span>/
  );
  assert.match(
    settingsStyle,
    /\.auto-hedging-admission-pair-table-viewport \{[\s\S]*?overflow: auto[\s\S]*?border: var\(--data-grid-line-width\) solid var\(--data-grid-line-color\)/
  );
  assert.match(
    settingsStyle,
    /\.auto-hedging-admission-pair-table thead \{[\s\S]*?position: sticky/
  );
  assert.match(
    settingsStyle,
    /\.auto-hedging-admission-pair-dialog\s+\.is-auto-hedging-admission-column-focused \{[\s\S]*?animation: auto-hedging-admission-column-focus 2\.6s/
  );
  assert.match(
    settingsStyle,
    /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\.is-auto-hedging-admission-column-focused \{[\s\S]*?animation: none;[\s\S]*?box-shadow:/
  );
  assert.match(
    appScript,
    /function openAutoHedgingAdmissionPairDialog\(event\)[\s\S]*?autoHedgingAdmissionPairControlSnapshot\(\)[\s\S]*?trigger\?\.dataset\.autoHedgingAdmissionFocus[\s\S]*?openDialogWithoutFieldFocus\(autoHedgingAdmissionPairDialog\)[\s\S]*?focusAutoHedgingAdmissionDialogColumn/
  );
  assert.match(
    appScript,
    /function setAutoHedgingAdmissionDialogFocus\(focusTarget\)[\s\S]*?querySelectorAll\("\[data-auto-hedging-admission-column\]"\)[\s\S]*?classList\.toggle\([\s\S]*?"is-auto-hedging-admission-column-focused"[\s\S]*?cell\.dataset\.autoHedgingAdmissionColumn === target/
  );
  assert.match(
    appScript,
    /function focusAutoHedgingAdmissionDialogColumn\(\)[\s\S]*?"automatic-admission"[\s\S]*?"amount-limit"[\s\S]*?"transfer-rate-deviation"[\s\S]*?targetHeader\?\.scrollIntoView[\s\S]*?control\?\.focus\(/
  );
  assert.match(
    appScript,
    /function closeAutoHedgingAdmissionPairDialog\(\{ restore = false \} = \{\}\)[\s\S]*?restoreAutoHedgingAdmissionPairControlSnapshot[\s\S]*?returnFocus\?\.focus\(\)/
  );
  assert.match(
    appScript,
    /function saveAutoHedgingAdmissionPairDialog\(\)[\s\S]*?querySelector\(":invalid"\)[\s\S]*?persistAutoHedgingAdmissionPolicy/
  );
});

test("Manual Release is represented honestly as a read-only shared demo policy", () => {
  assert.match(documentHtml, />Manual Release to Auto Hedging<\/h3>/);
  assert.match(documentHtml, />Shared in demo<\/span>/);
  assert.match(documentHtml, /id="autoHedgingManualReleaseSharedRevision"/);
  assert.match(documentHtml, /id="autoHedgingManualReleaseSharedPairSummary"/);
  assert.match(documentHtml, /id="autoHedgingManualReleaseSharedDeviation"/);
  assert.match(
    documentHtml,
    /Manual Release currently reuses the Client FX Deal Initial Admission eligibility settings\./
  );
  assert.match(
    appScript,
    /autoHedgingManualReleaseSharedDeviation\.textContent =\s*`\$\{configuredDeviationCount\} of \$\{autoHedgingAdmissionPolicy\.currencyPairs\.length\} Ccy Pairs configured`/
  );
});

test("Admission Policy loads and saves revisioned API data without duplicate submissions", () => {
  assert.match(
    appScript,
    /demoApiRequest\(\s*"\/api\/v1\/auto-hedging-admission-policy"\s*\)/
  );
  assert.match(
    appScript,
    /expectedRevision: autoHedgingAdmissionPolicy\.revision/
  );
  assert.match(
    appScript,
    /function autoHedgingAdmissionPolicyDraft\(\)[\s\S]*?maxBaseCcyAmount[\s\S]*?maxTransferRateDeviationPercent/
  );
  assert.doesNotMatch(appScript, /function autoHedgingAdmissionDeviationDraft\(/);
  assert.match(
    appScript,
    /method: "PUT",\s*body: JSON\.stringify\(draft\)/
  );
  assert.match(
    appScript,
    /if \(autoHedgingAdmissionPolicySaving\) \{\s*return false;/
  );
  assert.match(appScript, /if \(error\.status === 409\)/);
  assert.match(
    appScript,
    /await reloadAutoHedgingAdmissionPolicyFromApi\(\)/
  );
  assert.match(
    appScript,
    /autoHedgingAdmissionPairDialogForm\.addEventListener\("submit"/
  );
  assert.doesNotMatch(appScript, /autoHedgingAdmissionDeviationDialogForm/);
  assert.match(
    appScript,
    /autoHedgingAdmissionPairSearch\.addEventListener\("keydown", event => \{[\s\S]*?event\.key === "Enter"[\s\S]*?event\.preventDefault\(\)/
  );
});

test("Missing per-pair deviation remains unconfigured instead of becoming permissive zero", () => {
  assert.match(
    appScript,
    /let maxTransferRateDeviationPercent = null;/
  );
  assert.doesNotMatch(
    appScript,
    /let maxTransferRateDeviationPercent = "0";/
  );
  assert.match(
    appScript,
    /const deviationValue = pair\.maxTransferRateDeviationPercent === null\s*\? ""/
  );
  assert.match(
    appScript,
    /data-auto-hedging-admission-deviation[\s\S]*?required/
  );
  assert.match(
    appScript,
    /configuredDeviationCount = autoHedgingAdmissionPolicy\.currencyPairs[\s\S]*?pair\.maxTransferRateDeviationPercent !== null/
  );
});

test("Ccy Pair switches lock disabled limits and validate enabled Base Ccy amounts", () => {
  assert.match(
    appScript,
    /data-auto-hedging-admission-pair-enabled/
  );
  assert.match(
    appScript,
    /limitControl\.disabled = autoHedgingAdmissionPolicySaving[\s\S]*?\|\| !enabledControl\.checked/
  );
  assert.match(
    appScript,
    /parsedMaxBaseCcyAmount !== null[\s\S]*?<= pair\.baseCcyFractionDigits/
  );
  assert.match(
    appScript,
    /ccyPairCode: pair\.ccyPairCode,\s*enabled,\s*maxBaseCcyAmount/
  );
});
