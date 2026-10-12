"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { DatabaseSync } = require("node:sqlite");
const { withLegacyAdmissionDecisions } = require("../../../test-support/legacy-admission-decision-schema");
const { migratePositionManagementModeDecisions } = require("./migrate-position-management-mode-decisions");
const root = path.resolve(__dirname, "../../../..");
const schema = fs.readFileSync(path.join(root, "schema.sql"), "utf8");
const seed = fs.readFileSync(path.join(root, "seed.sql"), "utf8");

function fixture(legacy = true) {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(legacy ? withLegacyAdmissionDecisions(schema) : schema);
  db.exec(seed);
  if (legacy) db.exec(`INSERT INTO auto_management_admission_decisions
    (decision_id, trade_id, trade_type, admission_mode, admission_state, releasable,
     reason_codes_json, checks_json, is_enforced, decided_at)
    SELECT 42, trade_id, trade_type, 'AUTO_IF_ELIGIBLE', 'HELD', 1,
      '["MARKET_PULSE_UNAVAILABLE"]', '[{"code":"TRANSFER_RATE_DEVIATION","status":"UNAVAILABLE"}]',
      1, '2026-09-30T12:00:00.000Z' FROM client_deals LIMIT 1;`);
  return db;
}

test("preserves actual mode, decision identity, setting, evidence and time and migrates only once", () => {
  const db = fixture();
  try {
    const modes = db.prepare("SELECT * FROM trade_position_management ORDER BY trade_id").all();
    const before = db.prepare("SELECT * FROM auto_management_admission_decisions").get();
    migratePositionManagementModeDecisions(db, schema);
    const row = db.prepare("SELECT * FROM position_management_mode_decisions").get();
    assert.deepEqual({ ...row }, {
      decision_id: before.decision_id, trade_id: before.trade_id, trade_type: before.trade_type,
      mode_setting: before.admission_mode, position_management_mode: "MANUAL",
      reason_codes_json: before.reason_codes_json, checks_json: before.checks_json, decided_at: before.decided_at
    });
    assert.deepEqual(db.prepare("SELECT * FROM trade_position_management ORDER BY trade_id").all(), modes);
    assert.equal(db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'auto_management_admission_decisions'").get(), undefined);
    assert.equal(db.prepare("PRAGMA foreign_keys").get().foreign_keys, 1);
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
    const objects = db.prepare("SELECT * FROM sqlite_master ORDER BY name").all();
    migratePositionManagementModeDecisions(db, schema);
    assert.deepEqual(db.prepare("SELECT * FROM sqlite_master ORDER BY name").all(), objects);
  } finally { db.close(); }
});

test("rejects ambiguous history, shadow evaluation and mode mismatch without changing data", () => {
  for (const setup of [
    "UPDATE auto_management_admission_decisions SET admission_state = 'RELEASED'",
    "UPDATE auto_management_admission_decisions SET is_enforced = 0",
    "UPDATE auto_management_admission_decisions SET decision_stage = 'RELEASE'",
    `INSERT INTO auto_management_admission_decisions
      (trade_id, trade_type, decision_sequence, admission_mode, admission_state, releasable, reason_codes_json, checks_json, is_enforced)
      SELECT trade_id, trade_type, 2, admission_mode, admission_state, releasable, reason_codes_json, checks_json, 1
      FROM auto_management_admission_decisions`,
    "CREATE VIEW external_decisions AS SELECT * FROM auto_management_admission_decisions"
  ]) {
    const db = fixture();
    try {
      db.exec("DROP TRIGGER trg_auto_management_admission_decisions_immutable_update");
      db.exec(setup);
      const objects = db.prepare("SELECT * FROM sqlite_master ORDER BY name").all();
      const rows = db.prepare("SELECT * FROM auto_management_admission_decisions ORDER BY decision_id").all();
      assert.throws(() => migratePositionManagementModeDecisions(db, schema), /requires review|does not match/);
      assert.deepEqual(db.prepare("SELECT * FROM sqlite_master ORDER BY name").all(), objects);
      assert.deepEqual(db.prepare("SELECT * FROM auto_management_admission_decisions ORDER BY decision_id").all(), rows);
    } finally { db.close(); }
  }
});

test("preserves an Auto mode assigned by an enforced creation decision", () => {
  const db = fixture();
  try {
    db.exec(`DROP TRIGGER trg_trade_position_management_immutable_update;
      DROP TRIGGER trg_auto_management_admission_decisions_immutable_update;
      UPDATE trade_position_management SET position_management_mode = 'AUTO'
        WHERE trade_id IN (SELECT trade_id FROM auto_management_admission_decisions);
      UPDATE auto_management_admission_decisions SET admission_state = 'RELEASED',
        reason_codes_json = '["ELIGIBLE"]', checks_json = '[]';`);
    const modes = db.prepare("SELECT * FROM trade_position_management ORDER BY trade_id").all();
    migratePositionManagementModeDecisions(db, schema);
    assert.equal(db.prepare("SELECT position_management_mode FROM position_management_mode_decisions").get().position_management_mode, "AUTO");
    assert.deepEqual(db.prepare("SELECT * FROM trade_position_management ORDER BY trade_id").all(), modes);
  } finally { db.close(); }
});

test("one immutable decision must agree with the Trade mode, including INSERT OR REPLACE", () => {
  const db = fixture(false);
  try {
    const trade = db.prepare("SELECT trade_id, trade_type FROM client_deals LIMIT 1").get();
    const insert = `INSERT INTO position_management_mode_decisions
      (trade_id, trade_type, mode_setting, position_management_mode, reason_codes_json, checks_json)
      VALUES (?, ?, 'MANUAL', ?, '["MANUAL"]', '[]')`;
    assert.throws(() => db.prepare(insert).run(trade.trade_id, trade.trade_type, "AUTO"), /MISMATCH/);
    db.prepare(insert).run(trade.trade_id, trade.trade_type, "MANUAL");
    assert.throws(() => db.prepare(insert).run(trade.trade_id, trade.trade_type, "MANUAL"), /IMMUTABLE/);
    assert.throws(() => db.prepare(insert.replace("INSERT INTO", "INSERT OR REPLACE INTO")).run(trade.trade_id, trade.trade_type, "MANUAL"), /IMMUTABLE/);
    assert.throws(() => db.exec("UPDATE position_management_mode_decisions SET mode_setting = NULL"), /IMMUTABLE/);
    assert.throws(() => db.exec("DELETE FROM position_management_mode_decisions"), /IMMUTABLE/);
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
  } finally { db.close(); }
});
