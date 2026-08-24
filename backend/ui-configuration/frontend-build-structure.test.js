"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..", "..");
const FRONTEND = path.join(ROOT, "frontend");

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

test("frontend build is deterministic and current", () => {
  const result = spawnSync(
    process.execPath,
    [path.join(ROOT, "scripts", "build-frontend.mjs"), "--check"],
    { cwd: ROOT, encoding: "utf8" }
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Frontend build is current\./);
});

test("route pages and dialog components are owned by feature fragments", () => {
  const manifest = JSON.parse(read("frontend/fragment-manifest.json"));
  const pageFragments = manifest.fragments.filter(fragment => fragment.kind === "page");
  const dialogFragments = manifest.fragments.filter(fragment => fragment.kind === "dialog");

  assert.equal(pageFragments.length, 14);
  assert.equal(dialogFragments.length, 14);
  assert.ok(pageFragments.every(fragment => fragment.file.startsWith("features/")));
  assert.ok(dialogFragments.every(fragment =>
    fragment.file.startsWith("features/") || fragment.file.startsWith("shared/")
  ));

  for (const fragment of manifest.fragments) {
    const fragmentPath = path.join(FRONTEND, fragment.file);
    const source = fs.readFileSync(fragmentPath, "utf8");
    const expectedElement = fragment.kind === "page" ? "main" : "dialog";

    assert.match(source, new RegExp(`<${expectedElement}\\b[^>]*\\bid="${fragment.id}"`));
    assert.equal(
      (source.match(new RegExp(`<${expectedElement}\\b`, "g")) || []).length,
      1,
      `${fragment.file} must own exactly one ${expectedElement} root.`
    );
  }
});

test("every Bootstrap tab list uses the shared workbench tab contract", () => {
  const html = read("index.html");
  const sharedTabsStyle = read("frontend/shared/components/workbench-tabs.css");
  const fxPositionStyle = read("frontend/features/fx-position/fx-position-workbench.css");
  const tabLists = [...html.matchAll(
    /<nav\b[^>]*class="([^"]*\bnav-tabs\b[^"]*)"[^>]*>/g
  )];

  assert.equal(tabLists.length, 7);
  for (const [, classNames] of tabLists) {
    assert.match(classNames, /\bworkbench-section-tabs\b/);
  }

  assert.match(sharedTabsStyle, /\.workbench-page \.workbench-section-tabs \{/);
  assert.doesNotMatch(sharedTabsStyle, /\.unified-bootstrap-workspace/);
  assert.doesNotMatch(
    fxPositionStyle,
    /\.fx-position-mode-tabs \.nav-link(?:(?:\.active)|(?::not\([^)]*\))|(?::hover))*\s*\{/
  );
});

test("generated entry point contains no monolithic inline CSS or application JavaScript", () => {
  const html = read("index.html");
  const shell = read("frontend/index.shell.html");
  const appStyle = read("frontend/styles/app.css");
  const appScript = read("frontend/app/app.js");

  assert.doesNotMatch(html, /<style\b/);
  assert.match(html, /<link rel="stylesheet" href="\.\/frontend\/styles\/app\.css">/);
  assert.match(html, /<script src="\.\/frontend\/app\/app\.js"><\/script>/);
  assert.ok(Buffer.byteLength(html) < 350_000);
  assert.ok(Buffer.byteLength(shell) < 20_000);
  assert.ok(Buffer.byteLength(appStyle) > 500_000);
  assert.ok(Buffer.byteLength(appScript) > 1_000_000);
  assert.doesNotThrow(() => new Function(appScript));
});

test("JavaScript and CSS bundles are assembled from owned source segments", () => {
  const scriptManifest = JSON.parse(read("frontend/app/source-manifest.json"));
  const styleManifest = JSON.parse(read("frontend/styles/source-manifest.json"));

  assert.ok(scriptManifest.sources.length >= 10);
  assert.ok(styleManifest.sources.length >= 8);
  assert.ok(scriptManifest.sources.some(source => source.startsWith("features/database/")));
  assert.ok(scriptManifest.sources.some(source => source.startsWith("features/hedging/")));
  assert.ok(styleManifest.sources.some(source => source.startsWith("features/fx-position/")));
  assert.ok(styleManifest.sources.some(source => source.startsWith("shared/components/")));

  for (const source of [...scriptManifest.sources, ...styleManifest.sources]) {
    assert.ok(fs.statSync(path.join(FRONTEND, source)).isFile(), `${source} must exist.`);
  }
});
