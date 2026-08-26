"use strict";

const { createHash } = require("node:crypto");
const os = require("node:os");
const path = require("node:path");

const DEMO_APPLICATION_ID = "position-demo";

function normalizedProjectRoot(projectRoot) {
  const resolved = path.resolve(String(projectRoot || ""));
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function runtimeFilePath(projectRoot, port) {
  const projectIdentity = createHash("sha256")
    .update(normalizedProjectRoot(projectRoot))
    .digest("hex")
    .slice(0, 16);

  return path.join(
    os.tmpdir(),
    "position-demo-runtime",
    projectIdentity,
    `server-${port}.json`
  );
}

function runtimeRecordMatches(record, { projectRoot, port, pid }) {
  return Boolean(
    record
    && record.application === DEMO_APPLICATION_ID
    && Number(record.port) === Number(port)
    && Number(record.pid) === Number(pid)
    && normalizedProjectRoot(record.projectRoot) === normalizedProjectRoot(projectRoot)
  );
}

module.exports = {
  DEMO_APPLICATION_ID,
  normalizedProjectRoot,
  runtimeFilePath,
  runtimeRecordMatches
};
