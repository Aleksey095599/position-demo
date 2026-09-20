"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { DatabaseSync } = require("node:sqlite");
const { migrateAutoManagementTerminology } = require("./migrate-auto-management-terminology");

function legacyDatabase() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE auto_hedging_admission_policy_revisions (
      revision INTEGER PRIMARY KEY AUTOINCREMENT,
      description TEXT NOT NULL,
      CONSTRAINT chk_auto_hedging_admission_revision CHECK (revision > 0)
    );
    CREATE TABLE trade_contexts (
      context_id INTEGER PRIMARY KEY,
      auto_hedging_admission_mode TEXT NOT NULL,
      CONSTRAINT chk_auto_hedging_admission_mode
        CHECK (auto_hedging_admission_mode IN ('AUTO_IF_ELIGIBLE', 'MANUAL_ONLY'))
    );
    CREATE TABLE trade_exposures (trade_id INTEGER PRIMARY KEY, amount INTEGER NOT NULL);
    CREATE TABLE auto_hedging_admission_decisions (
      decision_id INTEGER PRIMARY KEY,
      trade_id INTEGER NOT NULL REFERENCES trade_exposures(trade_id),
      policy_revision INTEGER NOT NULL REFERENCES auto_hedging_admission_policy_revisions(revision),
      reason_codes_json TEXT NOT NULL,
      is_enforced INTEGER NOT NULL CHECK (is_enforced = 0)
    );
    CREATE INDEX idx_auto_hedging_admission_trade ON auto_hedging_admission_decisions(trade_id);
    CREATE TRIGGER trg_auto_hedging_admission_immutable
    BEFORE UPDATE ON auto_hedging_admission_decisions BEGIN
      SELECT RAISE(ABORT, 'AUTO_HEDGING_ADMISSION_DECISION_IMMUTABLE');
    END;
    CREATE VIEW admission_report AS
      SELECT decision_id, description FROM auto_hedging_admission_decisions
      JOIN auto_hedging_admission_policy_revisions ON revision = policy_revision;
    CREATE TABLE ui_table_column_settings (
      table_key TEXT NOT NULL, column_key TEXT NOT NULL,
      column_label TEXT NOT NULL, width_px INTEGER NOT NULL,
      default_width_px INTEGER NOT NULL, updated_at TEXT NOT NULL,
      PRIMARY KEY (table_key, column_key)
    );
    INSERT INTO auto_hedging_admission_policy_revisions VALUES (1, 'Original policy'), (99, 'Removed revision');
    DELETE FROM auto_hedging_admission_policy_revisions WHERE revision = 99;
    INSERT INTO trade_contexts VALUES (7, 'AUTO_IF_ELIGIBLE');
    INSERT INTO trade_exposures VALUES (41, 123456);
    INSERT INTO auto_hedging_admission_decisions VALUES (1, 41, 1, '["REVIEW_REQUIRED"]', 0);
    INSERT INTO ui_table_column_settings VALUES
      ('auto_hedging_admission_criteria_grid', 'eligible_for_auto_hedging', 'Eligible for Auto Hedging', 317, 230, 'unchanged'),
      ('client_deals_grid', 'initial_fx_position_mode', 'Initial Position Mode', 291, 232, 'unchanged');
  `);
  return sqlite;
}

test("renames the legacy schema without changing trades, admission evidence or layout widths", t => {
  const sqlite = legacyDatabase();
  t.after(() => sqlite.close());
  migrateAutoManagementTerminology(sqlite);

  assert.deepEqual({ ...sqlite.prepare("SELECT * FROM trade_exposures").get() }, { trade_id: 41, amount: 123456 });
  assert.deepEqual({ ...sqlite.prepare("SELECT * FROM auto_management_admission_decisions").get() }, {
    decision_id: 1, trade_id: 41, policy_revision: 1, reason_codes_json: '["REVIEW_REQUIRED"]', is_enforced: 0
  });
  assert.equal(sqlite.prepare("SELECT auto_management_admission_mode AS mode FROM trade_contexts").get().mode, "AUTO_IF_ELIGIBLE");
  assert.deepEqual({ ...sqlite.prepare("SELECT * FROM admission_report").get() }, { decision_id: 1, description: "Original policy" });
  const settings = sqlite.prepare(`
    SELECT table_key, column_key, width_px, default_width_px, updated_at
    FROM ui_table_column_settings ORDER BY table_key
  `).all().map(row => ({ ...row }));
  assert.deepEqual(settings, [
    { table_key: "auto_management_admission_criteria_grid", column_key: "eligible_for_auto_management", width_px: 317, default_width_px: 230, updated_at: "unchanged" },
    { table_key: "client_deals_grid", column_key: "initial_position_management_mode", width_px: 291, default_width_px: 232, updated_at: "unchanged" }
  ]);
  assert.equal(sqlite.prepare("PRAGMA foreign_keys").get().foreign_keys, 1);
  assert.deepEqual(sqlite.prepare("PRAGMA foreign_key_check").all(), []);
  assert.equal(sqlite.prepare("PRAGMA quick_check").get().quick_check, "ok");
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE lower(sql) LIKE '%auto_hedging_admission%'").get().count, 0);
  assert.throws(() => sqlite.exec("UPDATE auto_management_admission_decisions SET is_enforced = 0"), /AUTO_MANAGEMENT_ADMISSION_DECISION_IMMUTABLE/);
  assert.throws(() => sqlite.exec("INSERT INTO auto_management_admission_decisions VALUES (2, 999, 1, '[]', 0)"), /FOREIGN KEY/);
  assert.throws(() => sqlite.exec("UPDATE trade_contexts SET auto_management_admission_mode = 'INVALID'"), /CHECK/);
  sqlite.exec("INSERT INTO auto_management_admission_policy_revisions(description) VALUES ('Next policy')");
  assert.equal(sqlite.prepare("SELECT MAX(revision) AS revision FROM auto_management_admission_policy_revisions").get().revision, 100);

  const before = sqlite.prepare("SELECT type, name, sql FROM sqlite_master ORDER BY type, name").all();
  migrateAutoManagementTerminology(sqlite);
  assert.deepEqual(sqlite.prepare("SELECT type, name, sql FROM sqlite_master ORDER BY type, name").all(), before);
});

test("rejects ambiguous legacy/current tables without modifying either schema", t => {
  const sqlite = legacyDatabase();
  t.after(() => sqlite.close());
  sqlite.exec("CREATE TABLE auto_management_admission_policy_revisions (revision INTEGER PRIMARY KEY)");
  const before = sqlite.prepare("SELECT name, sql FROM sqlite_master ORDER BY name").all();
  assert.throws(() => migrateAutoManagementTerminology(sqlite), /Both legacy and current/);
  assert.deepEqual(sqlite.prepare("SELECT name, sql FROM sqlite_master ORDER BY name").all(), before);
  assert.equal(sqlite.prepare("PRAGMA foreign_keys").get().foreign_keys, 1);
});

test("rolls back earlier table rebuilds and restores foreign keys if a later table is ambiguous", t => {
  const sqlite = legacyDatabase();
  t.after(() => sqlite.close());
  sqlite.exec("ALTER TABLE trade_contexts ADD COLUMN auto_management_admission_mode TEXT");
  const before = sqlite.prepare("SELECT name, sql FROM sqlite_master ORDER BY name").all();
  assert.throws(() => migrateAutoManagementTerminology(sqlite), /column names are ambiguous/);
  assert.deepEqual(sqlite.prepare("SELECT name, sql FROM sqlite_master ORDER BY name").all(), before);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM auto_hedging_admission_decisions").get().count, 1);
  assert.equal(sqlite.prepare("PRAGMA foreign_keys").get().foreign_keys, 1);
});

test("keeps current layout settings when both legacy and current keys exist", t => {
  const sqlite = legacyDatabase();
  t.after(() => sqlite.close());
  sqlite.exec(`INSERT INTO ui_table_column_settings VALUES
    ('client_deals_grid', 'initial_position_management_mode', 'Current label', 420, 300, 'newer')`);
  migrateAutoManagementTerminology(sqlite);
  assert.equal(sqlite.prepare("SELECT width_px FROM ui_table_column_settings WHERE table_key = 'client_deals_grid'").get().width_px, 420);
});
