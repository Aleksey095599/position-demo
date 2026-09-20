"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { DatabaseSync } = require("node:sqlite");
const { migrateAdmissionEnforcement } = require("./migrate-admission-enforcement");
const root = path.resolve(__dirname, "../../../..");

function legacyDatabase() {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");
  database.exec(fs.readFileSync(path.join(root, "schema.sql"), "utf8")
    .replace(/(auto_management_admission_mode\s+TEXT)/, "default_position_management_mode TEXT NOT NULL DEFAULT 'MANUAL' CHECK(default_position_management_mode IN ('MANUAL', 'AUTO')),\n    $1")
    .replace(/(auto_management_admission_mode_override\s+TEXT)/, "position_management_mode_override TEXT CHECK(position_management_mode_override IN ('MANUAL', 'AUTO')),\n    $1")
    .replace("chk_auto_management_admission_decisions_enforcement", "chk_auto_management_admission_decisions_shadow_only")
    .replace("typeof(is_enforced) = 'integer' AND is_enforced IN (0, 1)", "typeof(is_enforced) = 'integer' AND is_enforced = 0")
    .replace("CHECK (trade_type IN ('CLIENT_DEAL', 'HEDGE_DEAL')),\n    CONSTRAINT chk_auto_management", "CHECK (trade_type = 'CLIENT_DEAL'),\n    CONSTRAINT chk_auto_management"));
  database.exec(fs.readFileSync(path.join(root, "seed.sql"), "utf8"));
  database.exec(`
    UPDATE pricing_rules SET position_management_mode_override = 'MANUAL' WHERE pricing_rule_id = 1;
    UPDATE pricing_rules SET position_management_mode_override = 'AUTO' WHERE pricing_rule_id = 2;
    UPDATE trade_position_management SET initial_position_management_mode = 'AUTO', current_position_management_mode = 'AUTO' WHERE trade_id = 1;
    INSERT INTO auto_management_admission_decisions
      (trade_id, trade_type, admission_state, releasable, reason_codes_json, checks_json, is_enforced)
      SELECT trade_id, trade_type, 'HELD', 1, '["REVIEW_REQUIRED"]', '[]', 0
      FROM client_deals LIMIT 1;
    UPDATE ui_table_column_settings SET width_px = 345
      WHERE table_key = 'trade_contexts_grid' AND column_key = 'auto_management_admission_mode';
    CREATE VIEW admission_context_names AS SELECT trade_context_id, auto_management_admission_mode FROM trade_contexts;
  `);
  return database;
}

test("removes legacy settings, preserves trades, immutable audit and remaining widths, and is idempotent", () => {
  const database = legacyDatabase();
  try {
    const states = database.prepare("SELECT * FROM trade_position_management ORDER BY trade_id").all();
    const audit = database.prepare("SELECT * FROM auto_management_admission_decisions").all();
    migrateAdmissionEnforcement(database);
    assert.equal(database.prepare("PRAGMA foreign_keys").get().foreign_keys, 1);
    assert.deepEqual(database.prepare("SELECT * FROM trade_position_management ORDER BY trade_id").all(), states);
    assert.deepEqual(database.prepare("SELECT * FROM auto_management_admission_decisions").all(), audit);
    assert.ok(!database.prepare("PRAGMA table_info(trade_contexts)").all().some(c => c.name === "default_position_management_mode"));
    assert.ok(!database.prepare("PRAGMA table_info(pricing_rules)").all().some(c => c.name === "position_management_mode_override"));
    assert.equal(database.prepare("SELECT auto_management_admission_mode_override AS mode FROM pricing_rules WHERE pricing_rule_id = 1").get().mode, "REVIEW_REQUIRED");
    assert.equal(database.prepare("SELECT auto_management_admission_mode_override AS mode FROM pricing_rules WHERE pricing_rule_id = 2").get().mode, null);
    assert.equal(database.prepare("SELECT width_px AS width FROM ui_table_column_settings WHERE table_key = 'trade_contexts_grid' AND column_key = 'auto_management_admission_mode'").get().width, 345);
    assert.ok(database.prepare("SELECT * FROM admission_context_names").all().length > 0);
    assert.throws(() => database.exec("DELETE FROM auto_management_admission_decisions"), /IMMUTABLE/);
    database.exec(`INSERT INTO auto_management_admission_decisions
      (trade_id, trade_type, decision_sequence, decision_stage, admission_state, releasable, reason_codes_json, checks_json, is_enforced)
      SELECT trade_id, trade_type, 2, 'RELEASE', 'RELEASED', 0, '["ELIGIBLE"]', '[]', 1 FROM client_deals LIMIT 1`);
    const schema = database.prepare("SELECT * FROM sqlite_master ORDER BY type, name").all();
    migrateAdmissionEnforcement(database);
    assert.deepEqual(database.prepare("SELECT * FROM sqlite_master ORDER BY type, name").all(), schema);
  } finally { database.close(); }
});

test("preserves the original database when a custom object still references a retired setting", () => {
  const database = legacyDatabase();
  try {
    database.exec("CREATE VIEW legacy_routing AS SELECT default_position_management_mode FROM trade_contexts");
    const schema = database.prepare("SELECT * FROM sqlite_master ORDER BY type, name").all();
    assert.throws(() => migrateAdmissionEnforcement(database), /Retired routing settings are referenced/);
    assert.deepEqual(database.prepare("SELECT * FROM sqlite_master ORDER BY type, name").all(), schema);
    assert.equal(database.prepare("PRAGMA foreign_keys").get().foreign_keys, 1);
  } finally { database.close(); }
});
