"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { readFrontendSources } = require("../test-support/frontend-source.js");

const ROOT = path.resolve(__dirname, "..", "..");
const { documentHtml, appScript, appStyle } = readFrontendSources(ROOT);
const serverSource = fs.readFileSync(path.join(ROOT, "server.js"), "utf8");

test("FX Batches uses one grid with an Audit View switch instead of view tabs", () => {
  assert.equal((documentHtml.match(/\bid="batchingHistoryGrid"/g) || []).length, 1);
  assert.match(documentHtml, /id="fxBatchesAuditView"/);
  assert.match(documentHtml, /for="fxBatchesAuditView">Audit View<\/label>/);
  assert.match(
    documentHtml,
    /class="batching-history-toolbar table-panel__head" data-ui-table-layout-host="batching_history_grid"/
  );
  assert.match(
    documentHtml,
    /<h2 class="table-panel__title">FX Batches<\/h2>\s*<div class="form-check form-switch fx-batches-view-switch">/
  );
  assert.doesNotMatch(documentHtml, /data-fx-batches-route|id="batchFormationAudit(?:Tab|Page|Grid)"/);
  assert.doesNotMatch(documentHtml, /data-ui-table-layout-host="batch_formation_audit_grid"/);

  assert.match(appStyle, /:is\(\.fx-deals-view-switch, \.fx-batches-view-switch\)/);
  assert.match(appStyle, /#batchingHistoryPage \.batching-history-grid/);
  assert.doesNotMatch(
    appStyle,
    /#batchingHistoryPage \.batching-history-toolbar > \.table-panel__title[\s\S]*?margin-right: auto;/
  );
});

test("Audit View expands the shared FX Batches grid with formation audit columns", () => {
  assert.match(appScript, /function fxBatchesAuditViewEnabled\(\)/);
  assert.match(appScript, /function applyFxBatchesViewMode\(\)/);
  assert.match(appScript, /function setFxBatchesViewMode\(mode\)/);
  assert.match(appScript, /fxBatchesAuditViewToggle\.addEventListener\("change"/);

  [
    ["Batching Key", "batchingKey"],
    ["Window Opened At", "windowOpenedAt"],
    ["Window Closed At", "windowClosedAt"],
    ["Duration", "windowDurationMs"],
    ["Source Trades", "sourceTradeCount"]
  ].forEach(([title, field]) => {
    const columnPattern = new RegExp(
      `title: "${title}",[\\s\\S]*?field: "${field}",[\\s\\S]*?visible: fxBatchesAuditViewEnabled\\(\\)`,
      "m"
    );
    assert.match(appScript, columnPattern);
  });

  assert.match(appScript, /column\?\.show\(\)/);
  assert.match(appScript, /column\?\.hide\(\)/);
  assert.match(
    appScript,
    /if \(isBatchFormationAuditRoute\(\)\) \{[\s\S]*?setFxBatchesViewMode\(FX_BATCHES_VIEW_MODE_AUDIT\);[\s\S]*?loadBatchingHistoryPage\(\);/
  );
  assert.doesNotMatch(appScript, /initializeBatchFormationAuditGrid|loadBatchFormationAuditPage/);
});

test("the main FX Batches response carries both standard and audit fields", () => {
  assert.match(
    serverSource,
    /function fxBatches\(\) \{[\s\S]*?LEFT JOIN v_fx_batch_formation_audit audit[\s\S]*?map\(fxBatchWithAuditFields\)/
  );
  assert.match(serverSource, /batchingKey: hasBatchingKey/);
  assert.match(serverSource, /windowDurationMs,/);
  assert.match(serverSource, /sourceTradeCount:/);
});
