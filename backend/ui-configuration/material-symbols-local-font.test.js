"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { readFrontendSources } = require("../test-support/frontend-source.js");

const ROOT = path.resolve(__dirname, "..", "..");
const { combinedSource: html, appStyle } = readFrontendSources(ROOT);
const serverSource = fs.readFileSync(path.join(ROOT, "server.js"), "utf8");
const fontPath = path.join(
  ROOT,
  "vendor",
  "material-symbols",
  "material-symbols-outlined.woff2"
);

test("Material Symbols are served locally with ligatures enabled", () => {
  assert.doesNotMatch(html, /fonts\.googleapis\.com|fonts\.gstatic\.com/);
  assert.match(
    html,
    /@font-face\s*\{[\s\S]*?font-family:\s*"Material Symbols Outlined";[\s\S]*?font-display:\s*block;[\s\S]*?url\("\.\.\/\.\.\/vendor\/material-symbols\/material-symbols-outlined\.woff2"\) format\("woff2"\);[\s\S]*?\}/
  );
  assert.match(
    html,
    /\.button-icon\s*\{[\s\S]*?font-family:\s*"Material Symbols Outlined";[\s\S]*?font-feature-settings:\s*"liga";[\s\S]*?\}/
  );
  assert.match(serverSource, /"\.woff2":\s*"font\/woff2"/);

  const fontUrl = appStyle.match(
    /src:\s*url\("([^"]*material-symbols-outlined\.woff2)"\)/
  )?.[1];
  assert.equal(fontUrl, "../../vendor/material-symbols/material-symbols-outlined.woff2");
  assert.equal(
    new URL(fontUrl, "http://localhost/frontend/styles/app.css").pathname,
    "/vendor/material-symbols/material-symbols-outlined.woff2"
  );

  const font = fs.readFileSync(fontPath);
  assert.equal(font.subarray(0, 4).toString("ascii"), "wOF2");
  assert.ok(font.length > 100_000, "Expected the complete Material Symbols font asset.");
});
