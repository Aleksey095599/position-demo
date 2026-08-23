"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..", "..");
const documentHtml = fs.readFileSync(
  path.join(ROOT, "frontend", "features", "hedging", "hedging-settings.page.html"),
  "utf8"
);
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
  assert.match(policyMarkup, />Client FX Trade Initial Admission Policy<\/strong>/);
  assert.match(policyMarkup, />Execution Context Admission Mode<\/h5>/);
  assert.match(policyMarkup, />Required<\/span>/);
  assert.match(policyMarkup, />Always applied<\/span>/);
  assert.match(
    policyMarkup,
    /class="auto-hedging-admission-policy-block auto-hedging-admission-deviation-card semantic-section"/
  );
  assert.match(
    policyMarkup,
    />Maximum Transfer Rate Deviation from Market Pulse<\/h5>/
  );
  assert.match(
    policyMarkup,
    /class="auto-hedging-admission-pair-policy semantic-section"/
  );
  assert.equal((policyMarkup.match(/\bsemantic-section\b/g) || []).length, 3);
  assert.doesNotMatch(policyMarkup, />Core Rule<\/h3>/);
  assert.doesNotMatch(policyMarkup, />Eligibility Checks<\/h3>/);
  assert.match(
    policyMarkup,
    /for="autoHedgingMaxTransferRateDeviationPercent">Maximum Transfer Rate Deviation from Market Pulse \(%\)<\/label>/
  );
  assert.match(
    settingsStyle,
    /\.auto-hedging-admission-settings-body > \.semantic-section \{[\s\S]*?--semantic-section-accent: var\(--palette-blue-500\)/
  );
});

test("Admission Policy uses one searchable and filterable responsive Ccy Pair table", () => {
  assert.match(policyMarkup, /id="autoHedgingAdmissionPairSearch"/);
  assert.match(policyMarkup, /id="autoHedgingAdmissionPairFilter"/);
  assert.match(policyMarkup, /<option value="ALL">All<\/option>/);
  assert.match(policyMarkup, /<option value="ENABLED">Enabled<\/option>/);
  assert.match(policyMarkup, /<option value="DISABLED">Disabled<\/option>/);
  assert.match(policyMarkup, />Ccy Pair<\/th>/);
  assert.match(policyMarkup, />Automatic Admission Enabled<\/th>/);
  assert.match(policyMarkup, />Maximum Trade Amount \(Base Ccy\)<\/th>/);
  assert.match(policyMarkup, />Save Policy<\/span>/);
  assert.match(settingsStyle, /\.auto-hedging-admission-pair-table-viewport \{[\s\S]*?overflow: auto/);
  assert.match(settingsStyle, /\.auto-hedging-admission-pair-table thead th \{[\s\S]*?position: sticky/);
});

test("Manual Release is represented honestly as a read-only shared demo policy", () => {
  assert.match(documentHtml, />Manual Release to Auto Hedging<\/h3>/);
  assert.match(documentHtml, />Shared in demo<\/span>/);
  assert.match(documentHtml, /id="autoHedgingManualReleaseSharedRevision"/);
  assert.match(documentHtml, /id="autoHedgingManualReleaseSharedPairSummary"/);
  assert.match(documentHtml, /id="autoHedgingManualReleaseSharedDeviation"/);
  assert.match(
    documentHtml,
    /Manual Release currently reuses the Client FX Trade Initial Admission eligibility settings\./
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
