"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { DatabaseSync } = require("node:sqlite");
const { migratePositionManagementSettings } = require("./migrate-position-management-settings");
const { migrateAdmissionEnforcement } = require("../../../auto-management-admission/infrastructure/persistence/migrate-admission-enforcement");
const root = path.resolve(__dirname, "../../../..");

function previousSettings(sql) {
  return sql.replace(/CREATE TABLE IF NOT EXISTS (?:trade_contexts|pricing_rules|auto_management_admission_decisions)\b[\s\S]*?\n\);/g,
    block => block.replaceAll("position_management_mode", "auto_management_admission_mode").replaceAll("'MANUAL'", "'REVIEW_REQUIRED'"))
    .replace(/CREATE TRIGGER IF NOT EXISTS trg_trade_contexts_position_management_mode_[\s\S]*?\nEND;/g,
      block => block.replaceAll("position_management_mode", "auto_management_admission_mode"))
    .replace(/INSERT INTO trade_contexts[\s\S]*?;/g,
      block => block.replaceAll("position_management_mode", "auto_management_admission_mode").replaceAll("'MANUAL'", "'REVIEW_REQUIRED'"))
    .replaceAll("seed.position_management_mode_override", "seed.auto_management_admission_mode_override")
    .replace(/^(\s*)position_management_mode_override$/gm, "$1auto_management_admission_mode_override")
    .replaceAll("'trade_contexts_grid', 'position_management_mode'", "'trade_contexts_grid', 'auto_management_admission_mode'")
    .replaceAll("'pricing_rules_grid', 'position_management_mode'", "'pricing_rules_grid', 'auto_management_admission'")
    .replaceAll("'internal_pricing_rules_grid', 'position_management_mode'", "'internal_pricing_rules_grid', 'auto_management_admission'");
}

function fixture() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(previousSettings(fs.readFileSync(path.join(root, "schema.sql"), "utf8")));
  db.exec(previousSettings(fs.readFileSync(path.join(root, "seed.sql"), "utf8")));
  db.exec(`UPDATE pricing_rules SET auto_management_admission_mode_override = 'REVIEW_REQUIRED' WHERE pricing_rule_id = 1;
    UPDATE ui_table_column_settings SET width_px = 345
      WHERE column_key IN ('auto_management_admission', 'auto_management_admission_mode');
    CREATE VIEW settings_modes AS SELECT trade_context_id, auto_management_admission_mode FROM trade_contexts;
    INSERT INTO auto_management_admission_decisions
      (trade_id, trade_type, admission_mode, admission_state, releasable, reason_codes_json, checks_json, is_enforced)
      SELECT trade_id, trade_type, 'REVIEW_REQUIRED', 'HELD', 1, '["REVIEW_REQUIRED"]', '[]', 1
      FROM client_deals LIMIT 1;`);
  return db;
}

test("migrates settings and widths while preserving Trades and historical decision evidence", () => {
  const db = fixture();
  try {
    const trades = db.prepare("SELECT * FROM trade_position_management ORDER BY trade_id").all();
    const contexts = db.prepare("SELECT trade_context_id AS id, auto_management_admission_mode AS mode FROM trade_contexts ORDER BY trade_context_id").all();
    const decisions = db.prepare("SELECT * FROM auto_management_admission_decisions").all();
    migratePositionManagementSettings(db);
    assert.deepEqual(db.prepare("SELECT * FROM trade_position_management ORDER BY trade_id").all(), trades);
    assert.deepEqual(db.prepare("SELECT trade_context_id AS id, position_management_mode AS mode FROM trade_contexts ORDER BY trade_context_id").all().map(row => ({ ...row })),
      contexts.map(row => ({ ...row, mode: row.mode === "REVIEW_REQUIRED" ? "MANUAL" : row.mode })));
    assert.equal(db.prepare("SELECT position_management_mode_override AS mode FROM pricing_rules WHERE pricing_rule_id = 1").get().mode, "MANUAL");
    assert.equal(db.prepare("SELECT position_management_mode_override AS mode FROM pricing_rules WHERE pricing_rule_id = 2").get().mode, null);
    assert.deepEqual(db.prepare("SELECT * FROM auto_management_admission_decisions").all().map(row => ({ ...row })), decisions.map(row => ({ ...row, admission_mode: "MANUAL" })));
    for (const table of ["trade_contexts_grid", "pricing_rules_grid", "internal_pricing_rules_grid"]) {
      assert.equal(db.prepare("SELECT width_px FROM ui_table_column_settings WHERE table_key = ? AND column_key = 'position_management_mode'").get(table).width_px, 345);
    }
    assert.ok(db.prepare("SELECT * FROM settings_modes").all().length);
    assert.throws(() => db.exec("UPDATE trade_contexts SET position_management_mode = 'REVIEW_REQUIRED'"), /CHECK/);
    assert.throws(() => db.exec("UPDATE pricing_rules SET position_management_mode_override = 'AUTO'"), /CHECK/);
    assert.throws(() => db.exec("UPDATE auto_management_admission_decisions SET admission_mode = 'AUTO_IF_ELIGIBLE'"), /IMMUTABLE/);
    assert.equal(db.prepare("PRAGMA foreign_keys").get().foreign_keys, 1);
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
    const schema = db.prepare("SELECT * FROM sqlite_master ORDER BY type, name").all();
    migrateAdmissionEnforcement(db);
    migratePositionManagementSettings(db);
    assert.deepEqual(db.prepare("SELECT * FROM sqlite_master ORDER BY type, name").all(), schema);
    assert.equal(db.prepare("SELECT position_management_mode_override AS mode FROM pricing_rules WHERE pricing_rule_id = 1").get().mode, "MANUAL");
  } finally { db.close(); }
});

test("rolls back an ambiguous schema without losing settings or dependent objects", () => {
  const db = fixture();
  try {
    db.exec("ALTER TABLE trade_contexts ADD COLUMN position_management_mode TEXT");
    const schema = db.prepare("SELECT * FROM sqlite_master ORDER BY type, name").all();
    const rows = db.prepare("SELECT * FROM trade_contexts").all();
    assert.throws(() => migratePositionManagementSettings(db), /Ambiguous/);
    assert.deepEqual(db.prepare("SELECT * FROM sqlite_master ORDER BY type, name").all(), schema);
    assert.deepEqual(db.prepare("SELECT * FROM trade_contexts").all(), rows);
    assert.equal(db.prepare("PRAGMA foreign_keys").get().foreign_keys, 1);
  } finally { db.close(); }
});
