"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..", "..");
const semanticSectionsCss = fs.readFileSync(
  path.join(ROOT, "frontend", "shared", "components", "semantic-sections.css"),
  "utf8"
);

test("selected counterparty options stay neutral until hover or focus", () => {
  ["addClientDealDialog", "addHedgeDealDialog"].forEach(dialogId => {
    const neutralRulePattern = new RegExp(
      `#${dialogId}\\.client-deal-create-dialog\\s+` +
      `\\.client-deal-client-option\\.is-selected\\s*\\{` +
      `[^}]*border-color:\\s*transparent;` +
      `[^}]*background:\\s*var\\(--bs-body-bg\\);`
    );
    const interactiveRulePattern = new RegExp(
      `#${dialogId}\\.client-deal-create-dialog\\s+` +
      `\\.client-deal-client-option\\.is-selected:is\\(:hover, :focus-visible\\)\\s*\\{` +
      `[^}]*border-color:\\s*var\\(--(?:client|hedge)-deal-accent-strong\\);` +
      `[^}]*background:\\s*var\\(--(?:client|hedge)-deal-accent-soft\\);`
    );

    assert.match(semanticSectionsCss, neutralRulePattern);
    assert.match(semanticSectionsCss, interactiveRulePattern);
  });

  const dealDialogThemeSource = semanticSectionsCss.slice(
    semanticSectionsCss.indexOf("#addClientDealDialog.client-deal-create-dialog"),
    semanticSectionsCss.indexOf("#batchingSettingsPage.unified-bootstrap-workspace")
  );

  assert.doesNotMatch(
    dealDialogThemeSource,
    /\.client-deal-client-option:is\([^)]*\.is-selected/
  );
});
