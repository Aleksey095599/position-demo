"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { DatabaseSync } = require("node:sqlite");
const { migrateImmutablePositionManagement } = require("./migrate-immutable-position-management");
const schema = fs.readFileSync(path.resolve(__dirname, "../../../..", "schema.sql"), "utf8");

function legacyDatabase() {
  const db = new DatabaseSync(":memory:");
  db.exec(`PRAGMA foreign_keys = ON;
    CREATE TABLE trade_exposures (trade_id INTEGER, trade_type TEXT, PRIMARY KEY (trade_id, trade_type));
    INSERT INTO trade_exposures VALUES (1, 'CLIENT_DEAL'), (2, 'HEDGE_DEAL');
    CREATE TABLE trade_position_management (
      trade_id INTEGER, trade_type TEXT, initial_position_management_mode TEXT,
      current_position_management_mode TEXT, created_at TEXT, updated_at TEXT,
      PRIMARY KEY (trade_id, trade_type),
      FOREIGN KEY (trade_id, trade_type) REFERENCES trade_exposures (trade_id, trade_type));
    INSERT INTO trade_position_management VALUES
      (1, 'CLIENT_DEAL', 'MANUAL', 'AUTO', '2026-09-01T10:00:00.000Z', '2026-09-02T10:00:00.000Z'),
      (2, 'HEDGE_DEAL', 'MANUAL', 'MANUAL', '2026-09-01T10:00:00.000Z', '2026-09-01T10:00:00.000Z');
    CREATE TABLE trade_position_management_transitions (transition_id INTEGER PRIMARY KEY AUTOINCREMENT, trade_id INTEGER);
    INSERT INTO trade_position_management_transitions (trade_id) VALUES (1);
    CREATE TABLE ui_table_column_settings (table_key TEXT, column_key TEXT, column_label TEXT, width_px INTEGER,
      PRIMARY KEY (table_key, column_key));
    INSERT INTO ui_table_column_settings VALUES
      ('client_deals_grid', 'initial_position_management_mode', 'Initial', 211),
      ('client_deals_grid', 'current_position_management_mode', 'Current', 333),
      ('hedge_deals_grid', 'initial_position_management_mode', 'Initial', 222);
  `);
  return db;
}

test("preserves current modes and creation time, migrates saved widths and removes history atomically", () => {
  const db = legacyDatabase();
  try {
    migrateImmutablePositionManagement(db, schema);
    assert.deepEqual(db.prepare("SELECT position_management_mode FROM trade_position_management ORDER BY trade_id").all().map(r => r.position_management_mode), ["AUTO", "MANUAL"]);
    assert.deepEqual(db.prepare("PRAGMA table_info(trade_position_management)").all().map(r => r.name), ["trade_id", "trade_type", "position_management_mode", "created_at"]);
    assert.equal(db.prepare("SELECT created_at FROM trade_position_management WHERE trade_id = 1").get().created_at, "2026-09-01T10:00:00.000Z");
    assert.equal(db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'trade_position_management_transitions'").get(), undefined);
    assert.equal(db.prepare("SELECT 1 FROM sqlite_sequence WHERE name = 'trade_position_management_transitions'").get(), undefined);
    assert.deepEqual(db.prepare("SELECT column_key, column_label, width_px FROM ui_table_column_settings ORDER BY table_key").all().map(r => ({...r})), [
      {column_key: "position_management_mode", column_label: "Position Management Mode", width_px: 333},
      {column_key: "position_management_mode", column_label: "Position Management Mode", width_px: 222}
    ]);
    assert.throws(() => db.exec("UPDATE trade_position_management SET position_management_mode = 'MANUAL' WHERE trade_id = 1"), /immutable/);
    assert.throws(() => db.exec("DELETE FROM trade_position_management WHERE trade_id = 1"), /immutable/);
    assert.throws(() => db.exec("INSERT OR REPLACE INTO trade_position_management (trade_id, trade_type, position_management_mode) VALUES (1, 'CLIENT_DEAL', 'MANUAL')"), /already assigned/);
    const before = db.prepare("SELECT * FROM trade_position_management").all();
    migrateImmutablePositionManagement(db, schema);
    assert.deepEqual(db.prepare("SELECT * FROM trade_position_management").all(), before);
    assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
    assert.equal(db.prepare("PRAGMA foreign_keys").get().foreign_keys, 1);
  } finally { db.close(); }
});

test("migration rolls back all changes when an existing mode is invalid", () => {
  const db = legacyDatabase();
  try {
    db.exec("UPDATE trade_position_management SET current_position_management_mode = 'INVALID' WHERE trade_id = 2");
    assert.throws(() => migrateImmutablePositionManagement(db, schema), /CHECK constraint/);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM trade_position_management_transitions").get().count, 1);
    assert.equal(db.prepare("SELECT current_position_management_mode AS mode FROM trade_position_management WHERE trade_id = 1").get().mode, "AUTO");
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM ui_table_column_settings").get().count, 3);
    assert.equal(db.prepare("SELECT 1 FROM sqlite_master WHERE name = '__immutable_position_management'").get(), undefined);
    assert.equal(db.prepare("PRAGMA foreign_keys").get().foreign_keys, 1);
  } finally { db.close(); }
});

test("does not silently discard an unknown view depending on the old mode model", () => {
  const db = legacyDatabase();
  try {
    db.exec("CREATE VIEW custom_modes AS SELECT current_position_management_mode FROM trade_position_management");
    assert.throws(() => migrateImmutablePositionManagement(db, schema), /reviewing view custom_modes/);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM custom_modes").get().count, 2);
  } finally { db.close(); }
});
