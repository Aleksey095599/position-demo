"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..", "..");
const tradesSource = fs.readFileSync(
  path.join(ROOT, "frontend", "features", "trades", "trades.page.js"),
  "utf8"
);
const dialogMarkup = fs.readFileSync(
  path.join(
    ROOT,
    "frontend",
    "features",
    "trades",
    "components",
    "client-deal-duplicate-check.dialog.html"
  ),
  "utf8"
);
const pricingStyles = fs.readFileSync(
  path.join(ROOT, "frontend", "features", "pricing", "pricing-workflows.css"),
  "utf8"
);
const dataTablesStyles = fs.readFileSync(
  path.join(ROOT, "frontend", "shared", "components", "data-tables.css"),
  "utf8"
);

function functionSource(name) {
  const marker = `function ${name}(`;
  const start = tradesSource.indexOf(marker);
  assert.notEqual(start, -1, `Expected ${name}.`);
  const remaining = tradesSource.slice(start + marker.length);
  const nextFunction = /\n    (?:async )?function [A-Za-z_$][\w$]*\s*\(/.exec(remaining);
  const end = nextFunction
    ? start + marker.length + nextFunction.index
    : tradesSource.length;

  return tradesSource.slice(start, end);
}

test("duplicate check reuses the flat Client Deals column subset", () => {
  const source = functionSource("clientDealDuplicateCheckColumns");

  assert.match(source, /clientDealColumnDefinitions\(\)/);
  assert.match(source, /\.flatMap\(group => group\.columns \|\| \[group\]\)/);
  assert.match(source, /uiTableColumns\("client_deals_grid", columns\)/);
  assert.match(source, /headerFilter[\s\S]*?headerFilterFunc/);
  assert.match(source, /width[\s\S]*?minWidth[\s\S]*?maxWidth/);
  assert.doesNotMatch(source, /title:\s*"Trade (?:Details|Economics)"/);
});

test("duplicate check uses standard table panel and Tabulator chrome", () => {
  assert.match(dialogMarkup, /class="table-panel table-panel--standalone"/);
  assert.match(
    dialogMarkup,
    /class="table-panel__body table-panel__viewport client-deals-bootstrap"/
  );
  assert.match(
    pricingStyles,
    /\.client-deal-duplicate-dialog \.table-panel__body\.client-deals-bootstrap\s*\{[^}]*padding-top:\s*0;/s
  );
  assert.match(dialogMarkup, /class="deals-grid" id="clientDealDuplicateCheckGrid"/);
  assert.doesNotMatch(dialogMarkup, /table-panel--compact/);
  assert.doesNotMatch(
    pricingStyles,
    /\.client-deal-duplicate-dialog \.tabulator(?:\s|\{)/
  );
  assert.doesNotMatch(
    pricingStyles,
    /\.client-deal-duplicate-dialog \.modal-body\s*\{[^}]*gap:/s
  );
  assert.match(
    dataTablesStyles,
    /\.client-deal-duplicate-dialog \.table-panel\s*\{[^}]*box-shadow:\s*var\(--bs-box-shadow-sm\);/s
  );
  assert.match(
    dataTablesStyles,
    /\.client-deal-duplicate-dialog \.tabulator \.tabulator-header \.tabulator-col:last-child,[\s\S]*?border-right:\s*0;/
  );
  assert.match(
    dataTablesStyles,
    /\.client-deal-duplicate-dialog \.tabulator \.tabulator-row:last-child\s*\{[^}]*border-bottom:\s*0;/s
  );
});

test("duplicate check fills the available width without forcing empty height", () => {
  const source = functionSource("initializeClientDealDuplicateCheckGrid");
  const columnsSource = functionSource("clientDealDuplicateCheckColumns");

  assert.match(source, /layout:\s*"fitColumns"/);
  assert.doesNotMatch(source, /\b(?:height|maxHeight):/);
  assert.match(columnsSource, /\.map\(column => \{[\s\S]*?\.\.\.fluidColumn/);
  assert.match(pricingStyles, /#clientDealDuplicateCheckGrid\s*\{[^}]*\bheight:\s*auto;/s);
  assert.doesNotMatch(pricingStyles, /#clientDealDuplicateCheckGrid\s*\{[^}]*\bmin-height:/s);
  assert.match(
    pricingStyles,
    /#clientDealDuplicateCheckGrid \.tabulator-tableholder\s*\{[^}]*height:\s*auto !important;[^}]*max-height:\s*267px !important;[^}]*overflow-y:\s*auto;/s
  );
});
