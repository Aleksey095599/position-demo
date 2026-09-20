const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..", "..");
const markup = fs.readFileSync(
  path.join(ROOT, "frontend", "features", "batching", "batch-details.page.html"),
  "utf8"
);
const style = fs.readFileSync(
  path.join(ROOT, "frontend", "features", "pricing", "pricing-workflows.css"),
  "utf8"
);
const semanticSectionStyle = fs.readFileSync(
  path.join(ROOT, "frontend", "shared", "components", "semantic-sections.css"),
  "utf8"
);
const runtime = fs.readFileSync(
  path.join(ROOT, "frontend", "app", "core", "runtime.js"),
  "utf8"
);
const behavior = fs.readFileSync(
  path.join(ROOT, "frontend", "features", "batching", "batching.page.js"),
  "utf8"
);

test("Batch Neutrality is a collapsed disclosure with a result summary", () => {
  assert.match(
    markup,
    /<details class="batch-neutrality semantic-section" id="batchNeutralityDetails"(?![^>]*\sopen)[^>]*>/
  );
  assert.match(markup, /<summary class="batch-neutrality-summary semantic-section-head">/);
  assert.match(markup, /id="batchNeutralitySummaryStatusText">Neutral Batch</);
  assert.match(markup, /class="batch-neutrality-equation"/);

  assert.match(style, /\.batch-neutrality-summary \{[\s\S]*?cursor: pointer;[\s\S]*?list-style: none;/);
  assert.match(style, /\.batch-neutrality\[open\][\s\S]*?\.batch-neutrality-summary-toggle \{[\s\S]*?rotate\(180deg\)/);
});

test("Batch Neutrality summary follows the calculated neutrality result", () => {
  for (const id of [
    "batchNeutralityDetails",
    "batchNeutralitySummaryStatus",
    "batchNeutralitySummaryStatusIcon",
    "batchNeutralitySummaryStatusText"
  ]) {
    assert.match(runtime, new RegExp(`getElementById\\("${id}"\\)`));
  }

  assert.match(behavior, /const neutralBatch = positionNeutral && cashNeutral;/);
  assert.match(behavior, /batchNeutralityDetails\.open = false;/);
  assert.match(behavior, /\? "Neutral Batch"\s*:\s*"Neutrality Exception"/);
  assert.match(behavior, /batchNeutralityResult\.classList\.toggle\([\s\S]*?!neutralBatch/);
});

test("Batch Members and Position Outputs share one table layout", () => {
  assert.equal(
    (markup.match(/data-ui-table-layout-host="batch_members_grid"/g) || []).length,
    2
  );
  assert.doesNotMatch(markup, /data-ui-table-layout-host="batch_position_output_grid"/);
  assert.equal(
    (behavior.match(/initializeBatchDetailsGrid\(\s*"batch_members_grid"/g) || []).length,
    2
  );
  assert.match(behavior, /field: "memberRole"/);
  assert.match(behavior, /memberRole: trade\?\.\[roleField\] \|\| ""/);
  assert.match(
    behavior,
    /title: "Trade Rate",[\s\S]*?field: "tradeRate",[\s\S]*?title: "Transfer Rate",[\s\S]*?field: "transferRate"/
  );
  assert.match(runtime, /const tables = uiTableTabulatorInstances\.get\(tableKey\) \|\| new Set\(\);/);
  assert.match(runtime, /tables\.forEach\(table => \{[\s\S]*?column\.setWidth\(setting\.widthPx\);/);
});

test("Batch Structure table section headers keep their bottom divider", () => {
  assert.equal(
    (markup.match(/<section class="[^"]*\bbatch-details-section\b[^"]*\bsemantic-table-section\b[^"]*"/g) || []).length,
    3
  );
  assert.match(
    semanticSectionStyle,
    /#batchDetailsPage\.workbench-page\s+\.batch-details-section\.semantic-table-section\s*>\s*\.semantic-table-section-head\s*\{[\s\S]*?border-bottom:\s*1px solid var\(--bs-border-color\);/
  );
});
