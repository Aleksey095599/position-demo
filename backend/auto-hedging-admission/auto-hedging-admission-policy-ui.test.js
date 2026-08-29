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
const admissionDeviationDialogHtml = fs.readFileSync(
  path.join(
    ROOT,
    "frontend",
    "features",
    "hedging",
    "components",
    "auto-hedging-admission-deviation.dialog.html"
  ),
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
  admissionDeviationDialogHtml,
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
  assert.match(
    policyMarkup,
    /class="auto-hedging-admission-policy-block auto-hedging-admission-deviation-card"/
  );
  assert.match(
    policyMarkup,
    />Transfer Rate Deviation<\/h5>/
  );
  assert.match(policyMarkup, /id="autoHedgingAdmissionDeviationSummary"/);
  assert.match(policyMarkup, /id="autoHedgingAdmissionDeviationEditButton"/);
  assert.doesNotMatch(
    policyMarkup,
    /id="autoHedgingAdmissionDeviationEditButton"[^>]*(?:data-tooltip|title)=/
  );
  assert.doesNotMatch(
    policyMarkup,
    /data-auto-hedging-admission-deviation/
  );
  assert.match(
    policyMarkup,
    /class="auto-hedging-admission-policy-block auto-hedging-admission-pair-policy"/
  );
  assert.match(
    policyMarkup,
    />Ccy Pair and Amount Limits<\/h5>[\s\S]*?Determines whether a Client FX Deal may be initially admitted to Auto Hedging based on its Ccy Pair and Trade Amount in Base Ccy\./
  );
  assert.match(policyMarkup, /id="autoHedgingAdmissionPairEditButton"/);
  assert.doesNotMatch(
    policyMarkup,
    /id="autoHedgingAdmissionPairEditButton"[^>]*(?:data-tooltip|title)=/
  );
  assert.doesNotMatch(policyMarkup, /\bsemantic-section\b/);
  assert.doesNotMatch(policyMarkup, />Core Rule<\/h3>/);
  assert.doesNotMatch(policyMarkup, />Eligibility Checks<\/h3>/);
  assert.match(
    admissionDeviationDialogHtml,
    /id="autoHedgingAdmissionDeviationSearch"/
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

test("Transfer Rate deviation is edited and saved in its own dialog", () => {
  assert.match(
    admissionDeviationDialogHtml,
    /id="autoHedgingAdmissionDeviationDialog"[^>]*aria-labelledby="autoHedgingAdmissionDeviationDialogTitle"/
  );
  assert.match(
    admissionDeviationDialogHtml,
    />Transfer Rate Deviation<\/h2>/
  );
  assert.match(
    admissionDeviationDialogHtml,
    /class="reference-column-head reference-column-head-static">[\s\S]*?>Maximum Transfer Rate Deviation \(%\)<\/span>/
  );
  assert.match(
    admissionDeviationDialogHtml,
    /<th scope="col">[\s\S]*?class="reference-column-title">Ccy Pair<\/span>[\s\S]*?class="reference-header-filter"[^>]*id="autoHedgingAdmissionDeviationSearch"/
  );
  assert.match(
    admissionDeviationDialogHtml,
    /class="[^"]*unified-data-table[^"]*auto-hedging-admission-deviation-table"[^>]*data-column-sizing="managed"[\s\S]*?<colgroup>/
  );
  assert.doesNotMatch(
    admissionDeviationDialogHtml,
    /auto-hedging-admission-deviation-toolbar|autoHedgingAdmissionDeviationSearchClear/
  );
  assert.match(
    admissionDeviationDialogHtml,
    /id="autoHedgingAdmissionDeviationRows"/
  );
  assert.match(
    admissionDeviationDialogHtml,
    /id="autoHedgingAdmissionDeviationDialogSave"[^>]*>[\s\S]*?>Save Changes<\/span>/
  );
  assert.match(
    appScript,
    /function openAutoHedgingAdmissionDeviationDialog\(\)[\s\S]*?openDialogWithoutFieldFocus\(autoHedgingAdmissionDeviationDialog\)/
  );
  assert.match(
    appScript,
    /function closeAutoHedgingAdmissionDeviationDialog\(\{ restore = false \} = \{\}\)[\s\S]*?restoreAutoHedgingAdmissionDeviationControlSnapshot/
  );
  assert.match(
    appScript,
    /function saveAutoHedgingAdmissionDeviationDialog\(\)[\s\S]*?persistAutoHedgingAdmissionPolicy/
  );
});

test("Admission Policy edits the searchable and filterable Ccy Pair table in a dialog", () => {
  assert.match(documentHtml, /id="autoHedgingAdmissionPairDialog"[^>]*aria-labelledby="autoHedgingAdmissionPairDialogTitle"/);
  assert.match(
    admissionPairDialogHtml,
    />Ccy Pair and Amount Limits<\/h2>/
  );
  assert.match(documentHtml, /id="autoHedgingAdmissionPairSearch"/);
  assert.match(documentHtml, /id="autoHedgingAdmissionPairFilter"/);
  assert.match(documentHtml, /<option value="ALL">All<\/option>/);
  assert.match(documentHtml, /<option value="ENABLED">Enabled<\/option>/);
  assert.match(documentHtml, /<option value="DISABLED">Disabled<\/option>/);
  assert.match(
    admissionPairDialogHtml,
    /<th scope="col">[\s\S]*?class="reference-column-title">Ccy Pair<\/span>[\s\S]*?class="reference-header-filter"[^>]*id="autoHedgingAdmissionPairSearch"/
  );
  assert.match(
    admissionPairDialogHtml,
    /class="reference-column-title">Automatic Admission Enabled<\/span>[\s\S]*?class="reference-header-filter form-select"[^>]*id="autoHedgingAdmissionPairFilter"/
  );
  assert.match(
    admissionPairDialogHtml,
    /class="reference-column-head reference-column-head-static">[\s\S]*?>Maximum Trade Amount \(Base Ccy\)<\/span>/
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
    /:is\([\s\S]*?\.auto-hedging-admission-pair-table-viewport[\s\S]*?\) \{[\s\S]*?overflow: auto[\s\S]*?border: var\(--data-grid-line-width\) solid var\(--data-grid-line-color\)/
  );
  assert.match(
    settingsStyle,
    /:is\([\s\S]*?\.auto-hedging-admission-pair-table[\s\S]*?\) thead \{[\s\S]*?position: sticky/
  );
  assert.match(
    appScript,
    /function openAutoHedgingAdmissionPairDialog\(\)[\s\S]*?autoHedgingAdmissionPairControlSnapshot\(\)[\s\S]*?openDialogWithoutFieldFocus\(autoHedgingAdmissionPairDialog\)/
  );
  assert.match(
    appScript,
    /function closeAutoHedgingAdmissionPairDialog\(\{ restore = false \} = \{\}\)[\s\S]*?restoreAutoHedgingAdmissionPairControlSnapshot/
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
    /function autoHedgingAdmissionDeviationDraft\(\)[\s\S]*?maxTransferRateDeviationPercent: deviation/
  );
  assert.match(
    appScript,
    /function autoHedgingAdmissionPairDraft\(\)[\s\S]*?maxTransferRateDeviationPercent:\s*pair\.maxTransferRateDeviationPercent/
  );
  assert.doesNotMatch(appScript, /function autoHedgingAdmissionPolicyDraft\(/);
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
    /autoHedgingAdmissionDeviationDialogForm\.addEventListener\("submit"/
  );
  assert.match(
    appScript,
    /autoHedgingAdmissionPairDialogForm\.addEventListener\("submit"/
  );
  assert.match(
    appScript,
    /autoHedgingAdmissionDeviationSearch\.addEventListener\("keydown", event => \{[\s\S]*?event\.key === "Enter"[\s\S]*?event\.preventDefault\(\)/
  );
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
