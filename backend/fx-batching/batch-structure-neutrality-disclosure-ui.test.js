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
