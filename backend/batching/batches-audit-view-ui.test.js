"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { readFrontendSources } = require("../test-support/frontend-source.js");

const ROOT = path.resolve(__dirname, "..", "..");
const { documentHtml, appScript, appStyle } = readFrontendSources(ROOT);
const serverSource = fs.readFileSync(path.join(ROOT, "server.js"), "utf8");

test("Batches uses one grid with an Audit View switch instead of view tabs", () => {
  assert.equal((documentHtml.match(/\bid="batchingHistoryGrid"/g) || []).length, 1);
  assert.match(documentHtml, /id="batchesAuditView"/);
  assert.match(documentHtml, /for="batchesAuditView">Audit View<\/label>/);
  assert.match(
    documentHtml,
    /class="batching-history-toolbar table-panel__head" data-ui-table-layout-host="batching_history_grid"/
  );
  assert.match(
    documentHtml,
    /<h2 class="table-panel__title">Batches<\/h2>\s*<div class="form-check form-switch batches-view-switch">/
  );
  assert.doesNotMatch(documentHtml, /data-batches-route|id="batchFormationAudit(?:Tab|Page|Grid)"/);
  assert.doesNotMatch(documentHtml, /data-ui-table-layout-host="batch_formation_audit_grid"/);

  assert.match(
    appStyle,
    /:is\(\.deals-view-switch, \.batches-view-switch, \.pricing-rules-view-switch\)/
  );
  assert.match(appStyle, /#batchingHistoryPage \.batching-history-grid/);
  assert.doesNotMatch(
    appStyle,
    /#batchingHistoryPage \.batching-history-toolbar > \.table-panel__title[\s\S]*?margin-right: auto;/
  );
});

test("Audit View expands the shared Batches grid with formation audit columns", () => {
  assert.match(appScript, /function batchesAuditViewEnabled\(\)/);
  assert.match(appScript, /function applyBatchesViewMode\(\)/);
  assert.match(appScript, /function setBatchesViewMode\(mode\)/);
  assert.match(appScript, /batchesAuditViewToggle\.addEventListener\("change"/);

  [
    ["Batching Key", "batchingKey"],
    ["Window Opened At", "windowOpenedAt"],
    ["Window Closed At", "windowClosedAt"],
    ["Duration", "windowDurationMs"],
    ["Source Trades", "sourceTradeCount"]
  ].forEach(([title, field]) => {
    const columnPattern = new RegExp(
      `title: "${title}",[\\s\\S]*?field: "${field}",[\\s\\S]*?visible: batchesAuditViewEnabled\\(\\)`,
      "m"
    );
    assert.match(appScript, columnPattern);
  });

  assert.match(appScript, /column\?\.show\(\)/);
  assert.match(appScript, /column\?\.hide\(\)/);
  assert.match(
    appScript,
    /if \(isBatchFormationAuditRoute\(\)\) \{[\s\S]*?setBatchesViewMode\(BATCHES_VIEW_MODE_AUDIT\);[\s\S]*?loadBatchingHistoryPage\(\);/
  );
  assert.doesNotMatch(appScript, /initializeBatchFormationAuditGrid|loadBatchFormationAuditPage/);
});

test("the main Batches response carries both standard and audit fields", () => {
  assert.match(
    serverSource,
    /function batches\(\) \{[\s\S]*?LEFT JOIN v_batch_formation_audit audit[\s\S]*?map\(batchWithAuditFields\)/
  );
  assert.match(serverSource, /batchingKey: hasBatchingKey/);
  assert.match(serverSource, /windowDurationMs,/);
  assert.match(serverSource, /sourceTradeCount:/);
});
