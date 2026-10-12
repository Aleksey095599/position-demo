"use strict";

const fs = require("node:fs");
const path = require("node:path");

function withLegacyAdmissionDecisions(schema) {
  const start = schema.indexOf("CREATE TABLE IF NOT EXISTS position_management_mode_decisions");
  const end = schema.indexOf("CREATE TABLE IF NOT EXISTS client_deals", start);
  if (start < 0 || end < 0) throw new Error("Decision schema block was not found.");
  return schema.slice(0, start)
    + fs.readFileSync(path.join(__dirname, "fixtures/legacy-admission-decisions.sql"), "utf8")
    + schema.slice(end);
}

module.exports = { withLegacyAdmissionDecisions };
