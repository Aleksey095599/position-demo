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
const documentHtml = `${hedgingSettingsPageHtml}\n${admissionPairDialogHtml}`;
const appScript = [
  path.join(ROOT, "frontend", "app", "core", "runtime.js"),
  path.join(ROOT, "frontend", "features", "hedging", "hedging.page.js")
].map(filePath => fs.readFileSync(filePath, "utf8")).join("\n");
const settingsStyle = fs.readFileSync(
  path.join(ROOT, "frontend", "features", "hedging", "hedging-settings.css"),
  "utf8"
);
const policyMarkup = documentHtml.match(
  /<form class="[^"]*auto-hedging-admission-settings-panel"[\s\S]*?<\/form>/
)?.[0] || "";

test("Auto Hedging Settings presents the required core rule and configurable eligibility checks", () => {
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
  assert.match(policyMarkup, />Execution Context Admission Mode<\/h5>/);
  assert.match(policyMarkup, />Required<\/span>/);
  assert.match(policyMarkup, />Always applied<\/span>/);
  assert.match(
    policyMarkup,
    /class="auto-hedging-admission-policy-block auto-hedging-admission-deviation-card"/
  );
  assert.match(
    policyMarkup,
    />Maximum Transfer Rate Deviation from Market Pulse<\/h5>/
  );
  assert.match(
    policyMarkup,
    /class="auto-hedging-admission-policy-block auto-hedging-admission-pair-policy"/
  );
  assert.match(policyMarkup, /id="autoHedgingAdmissionPairEditButton"/);
  assert.doesNotMatch(policyMarkup, /\bsemantic-section\b/);
  assert.doesNotMatch(policyMarkup, />Core Rule<\/h3>/);
  assert.doesNotMatch(policyMarkup, />Eligibility Checks<\/h3>/);
  assert.match(
    policyMarkup,
    /for="autoHedgingMaxTransferRateDeviationPercent">Maximum Transfer Rate Deviation from Market Pulse \(%\)<\/label>/
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
    /\.auto-hedging-admission-settings-footer \{[\s\S]*?border-top: 1px solid var\(--bs-border-color\)/
  );
  assert.doesNotMatch(settingsStyle, /\.auto-hedging-client-policy-head/);
});

test("Admission Policy edits the searchable and filterable Ccy Pair table in a dialog", () => {
  assert.match(documentHtml, /id="autoHedgingAdmissionPairDialog"[^>]*aria-labelledby="autoHedgingAdmissionPairDialogTitle"/);
  assert.match(documentHtml, /id="autoHedgingAdmissionPairSearch"/);
  assert.match(documentHtml, /id="autoHedgingAdmissionPairFilter"/);
  assert.match(documentHtml, /<option value="ALL">All<\/option>/);
  assert.match(documentHtml, /<option value="ENABLED">Enabled<\/option>/);
  assert.match(documentHtml, /<option value="DISABLED">Disabled<\/option>/);
  assert.match(documentHtml, />Ccy Pair<\/th>/);
  assert.match(documentHtml, />Automatic Admission Enabled<\/th>/);
  assert.match(documentHtml, />Maximum Trade Amount \(Base Ccy\)<\/th>/);
  assert.match(policyMarkup, />Save Policy<\/span>/);
  assert.match(documentHtml, /id="autoHedgingAdmissionPairDialogCancel"/);
  assert.match(documentHtml, /id="autoHedgingAdmissionPairDialogApply"/);
  assert.match(settingsStyle, /\.auto-hedging-admission-pair-table-viewport \{[\s\S]*?overflow: auto/);
  assert.match(settingsStyle, /\.auto-hedging-admission-pair-table thead th \{[\s\S]*?position: sticky/);
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
    /function applyAutoHedgingAdmissionPairDialog\(\)[\s\S]*?querySelector\(":invalid"\)[\s\S]*?closeAutoHedgingAdmissionPairDialog\(\)/
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
    /autoHedgingManualReleaseSharedPairSummary\.textContent =\s*`\$\{enabledPairCount\} of \$\{autoHedgingAdmissionPolicy\.currencyPairs\.length\} enabled`/
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
    /method: "PUT",\s*body: JSON\.stringify\(draft\)/
  );
  assert.match(
    appScript,
    /if \(autoHedgingAdmissionPolicySaving\) \{\s*return;/
  );
  assert.match(appScript, /if \(error\.status === 409\)/);
  assert.match(
    appScript,
    /await reloadAutoHedgingAdmissionPolicyFromApi\(\)/
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
