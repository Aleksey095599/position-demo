import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FRONTEND_DIR = path.join(ROOT, "frontend");
const SHELL_PATH = path.join(FRONTEND_DIR, "index.shell.html");
const MANIFEST_PATH = path.join(FRONTEND_DIR, "fragment-manifest.json");
const OUTPUT_PATH = path.join(ROOT, "index.html");
const APP_SCRIPT_PATH = path.join(FRONTEND_DIR, "app", "app.js");
const APP_SOURCE_MANIFEST_PATH = path.join(FRONTEND_DIR, "app", "source-manifest.json");
const APP_STYLE_PATH = path.join(FRONTEND_DIR, "styles", "app.css");
const STYLE_SOURCE_MANIFEST_PATH = path.join(FRONTEND_DIR, "styles", "source-manifest.json");
const INCLUDE_PATTERN = /<!-- @include:([^ ]+) -->/g;

function countOccurrences(source, value) {
  return source.split(value).length - 1;
}

function duplicateValues(values) {
  return [...new Set(values.filter((value, index) => values.indexOf(value) !== index))];
}

async function readUtf8(filePath) {
  return fs.readFile(filePath, "utf8");
}

async function frontendManifest() {
  const manifest = JSON.parse(await readUtf8(MANIFEST_PATH));

  if (!Array.isArray(manifest.fragments) || manifest.fragments.length === 0) {
    throw new Error("frontend/fragment-manifest.json must declare at least one fragment.");
  }

  return manifest;
}

async function assembleAppScript() {
  const manifest = JSON.parse(await readUtf8(APP_SOURCE_MANIFEST_PATH));

  if (!Array.isArray(manifest.sources) || manifest.sources.length === 0) {
    throw new Error("frontend/app/source-manifest.json must declare application sources.");
  }

  const sources = await Promise.all(
    manifest.sources.map(source => readUtf8(path.join(FRONTEND_DIR, source)))
  );

  return sources.join("");
}

async function assembleAppStyle() {
  const manifest = JSON.parse(await readUtf8(STYLE_SOURCE_MANIFEST_PATH));

  if (!Array.isArray(manifest.sources) || manifest.sources.length === 0) {
    throw new Error("frontend/styles/source-manifest.json must declare stylesheet sources.");
  }

  const sources = await Promise.all(
    manifest.sources.map(source => readUtf8(path.join(FRONTEND_DIR, source)))
  );

  return sources.join("");
}

async function assembleFrontend(appScript, appStyle) {
  const manifest = await frontendManifest();
  let output = await readUtf8(SHELL_PATH);

  for (const fragment of manifest.fragments) {
    const marker = `<!-- @include:${fragment.file} -->`;

    if (countOccurrences(output, marker) !== 1) {
      throw new Error(`Expected exactly one ${marker} marker in frontend/index.shell.html.`);
    }

    const fragmentSource = await readUtf8(path.join(FRONTEND_DIR, fragment.file));
    output = output.replace(marker, fragmentSource.trimEnd());
  }

  const unresolvedIncludes = [...output.matchAll(INCLUDE_PATTERN)].map(match => match[1]);

  if (unresolvedIncludes.length > 0) {
    throw new Error(`Unresolved frontend includes: ${unresolvedIncludes.join(", ")}.`);
  }

  validateAssembledFrontend(output, manifest, appScript, appStyle);
  return output.endsWith("\n") ? output : `${output}\n`;
}

function validateAssembledFrontend(html, manifest, appScript, appStyle) {
  new Function(appScript);

  if (!appStyle.trim()) {
    throw new Error("frontend/styles/app.css must not be empty.");
  }

  if (!html.includes('<link rel="stylesheet" href="./frontend/styles/app.css">')) {
    throw new Error("The frontend shell must load frontend/styles/app.css.");
  }

  if (!html.includes('<script src="./frontend/app/app.js"></script>')) {
    throw new Error("The frontend shell must load frontend/app/app.js.");
  }

  if (/<style\b/.test(html)) {
    throw new Error("Generated index.html must not contain an inline style block.");
  }

  const ids = [...html.matchAll(/\bid="([^"]+)"/g)]
    .map(match => match[1])
    .filter(id => !id.includes("${"));
  const duplicateIds = duplicateValues(ids);

  if (duplicateIds.length > 0) {
    throw new Error(`Generated index.html contains duplicate IDs: ${duplicateIds.join(", ")}.`);
  }

  const pageFragments = manifest.fragments.filter(fragment => fragment.kind === "page");
  const dialogFragments = manifest.fragments.filter(fragment => fragment.kind === "dialog");
  const pageIds = [...html.matchAll(/<main\b[^>]*\bid="([^"]+)"/g)].map(match => match[1]);
  const dialogIds = [...html.matchAll(/<dialog\b[^>]*\bid="([^"]+)"/g)].map(match => match[1]);
  const expectedPageIds = pageFragments.map(fragment => fragment.id);
  const expectedDialogIds = dialogFragments.map(fragment => fragment.id);

  if (JSON.stringify(pageIds) !== JSON.stringify(expectedPageIds)) {
    throw new Error("Generated page order does not match frontend/fragment-manifest.json.");
  }

  if (JSON.stringify(dialogIds) !== JSON.stringify(expectedDialogIds)) {
    throw new Error("Generated dialog order does not match frontend/fragment-manifest.json.");
  }
}

async function writeAtomically(filePath, content) {
  const temporaryPath = `${filePath}.tmp-${process.pid}`;
  await fs.writeFile(temporaryPath, content, "utf8");
  await fs.rename(temporaryPath, filePath);
}

async function main() {
  const [expectedAppScript, expectedAppStyle] = await Promise.all([
    assembleAppScript(),
    assembleAppStyle()
  ]);
  const expected = await assembleFrontend(expectedAppScript, expectedAppStyle);

  if (process.argv.includes("--check")) {
    const [actual, actualAppScript, actualAppStyle] = await Promise.all([
      readUtf8(OUTPUT_PATH),
      readUtf8(APP_SCRIPT_PATH),
      readUtf8(APP_STYLE_PATH)
    ]);

    if (actualAppScript !== expectedAppScript) {
      throw new Error("frontend/app/app.js is stale. Run `npm run build:frontend`.");
    }

    if (actualAppStyle !== expectedAppStyle) {
      throw new Error("frontend/styles/app.css is stale. Run `npm run build:frontend`.");
    }

    if (actual !== expected) {
      throw new Error("index.html is stale. Run `npm run build:frontend`.");
    }

    console.log("Frontend build is current.");
    return;
  }

  await writeAtomically(APP_SCRIPT_PATH, expectedAppScript);
  await writeAtomically(APP_STYLE_PATH, expectedAppStyle);
  await writeAtomically(OUTPUT_PATH, expected);
  console.log("Built index.html from frontend sources.");
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
