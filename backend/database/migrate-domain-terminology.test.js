"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { DatabaseSync } = require("node:sqlite");
const { migrateDomainTerminology } = require("./migrate-domain-terminology");

function legacyDatabase() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE fx_batches (
      batch_id INTEGER PRIMARY KEY AUTOINCREMENT,
      description TEXT NOT NULL,
      CONSTRAINT chk_fx_batches_id CHECK (batch_id > 0)
    );
    CREATE TABLE fx_trade_exposure (
      trade_id INTEGER PRIMARY KEY,
      amount_minor INTEGER NOT NULL,
      external_code TEXT NOT NULL DEFAULT 'FX_EXTERNAL'
    );
    CREATE UNIQUE INDEX uq_fx_trade_exposure_identity ON fx_trade_exposure(trade_id);
    CREATE TABLE client_fx_deals (
      trade_id INTEGER PRIMARY KEY REFERENCES fx_trade_exposure(trade_id),
      comment TEXT NOT NULL
    );
    CREATE TABLE fx_batch_members (
      batch_id INTEGER NOT NULL REFERENCES fx_batches(batch_id),
      trade_id INTEGER NOT NULL REFERENCES fx_trade_exposure(trade_id),
      CONSTRAINT pk_fx_batch_members PRIMARY KEY(batch_id, trade_id)
    );
    CREATE INDEX idx_fx_batch_members_trade ON fx_batch_members(trade_id);
    CREATE TRIGGER trg_fx_batches_immutable BEFORE UPDATE ON fx_batches BEGIN
      SELECT RAISE(ABORT, 'FX_BATCH_IMMUTABLE');
    END;
    CREATE VIEW v_fx_batch_formation_audit AS
      SELECT batch_id, trade_id, amount_minor FROM fx_batch_members
      JOIN fx_trade_exposure USING(trade_id);
    CREATE TABLE evidence (
      evidence_id INTEGER PRIMARY KEY,
      batch_id INTEGER REFERENCES fx_batches(batch_id),
      payload TEXT NOT NULL
    );
    CREATE TABLE ui_table_column_settings (
      table_key TEXT NOT NULL,
      column_key TEXT NOT NULL,
      column_label TEXT NOT NULL,
      display_order INTEGER NOT NULL,
      width_px INTEGER NOT NULL,
      default_width_px INTEGER NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(table_key, column_key), UNIQUE(table_key, display_order)
    );
    INSERT INTO fx_batches VALUES (1, 'FX Batch original'), (50, 'Removed batch');
    DELETE FROM fx_batches WHERE batch_id = 50;
    INSERT INTO fx_trade_exposure VALUES (11, 123456789, 'IB_FX');
    INSERT INTO client_fx_deals VALUES (11, 'Original FX trade comment');
    INSERT INTO fx_batch_members VALUES (1, 11);
    INSERT INTO evidence VALUES (8, 1, '{"fxBatchId":1,"type":"FX"}');
    INSERT INTO ui_table_column_settings VALUES
      ('fx_position_grid', 'trade_id', 'Trade ID', 0, 317, 230, 'unchanged'),
      ('client_fx_deals_grid', 'initial_fx_position_mode', 'Initial FX Position Mode', 0, 291, 232, 'unchanged'),
      ('hedge_fx_deals_grid', 'trade_id', 'Trade ID', 0, 399, 96, 'unchanged');
  `);
  return sqlite;
}

function schemaSnapshot(sqlite) {
  return sqlite.prepare("SELECT type, name, sql FROM sqlite_master ORDER BY type, name").all();
}

test("renames tables, dependent schema and saved layout keys while retaining every stored value", t => {
  const sqlite = legacyDatabase();
  t.after(() => sqlite.close());
  migrateDomainTerminology(sqlite);
  assert.deepEqual({ ...sqlite.prepare("SELECT * FROM batches").get() }, { batch_id: 1, description: "FX Batch original" });
  assert.deepEqual({ ...sqlite.prepare("SELECT * FROM trade_exposures").get() }, { trade_id: 11, amount_minor: 123456789, external_code: "IB_FX" });
  assert.deepEqual({ ...sqlite.prepare("SELECT * FROM client_deals").get() }, { trade_id: 11, comment: "Original FX trade comment" });
  assert.deepEqual({ ...sqlite.prepare("SELECT * FROM batch_members").get() }, { batch_id: 1, trade_id: 11 });
  assert.deepEqual({ ...sqlite.prepare("SELECT * FROM evidence").get() }, { evidence_id: 8, batch_id: 1, payload: '{"fxBatchId":1,"type":"FX"}' });
  assert.deepEqual({ ...sqlite.prepare("SELECT * FROM v_batch_formation_audit").get() }, { batch_id: 1, trade_id: 11, amount_minor: 123456789 });
  assert.deepEqual(sqlite.prepare("SELECT * FROM ui_table_column_settings ORDER BY table_key").all().map(row => ({ ...row })), [
    { table_key: "client_deals_grid", column_key: "initial_position_management_mode", column_label: "Initial FX Position Mode", display_order: 0, width_px: 291, default_width_px: 232, updated_at: "unchanged" },
    { table_key: "hedge_deals_grid", column_key: "trade_id", column_label: "Trade ID", display_order: 0, width_px: 399, default_width_px: 96, updated_at: "unchanged" },
    { table_key: "position_grid", column_key: "trade_id", column_label: "Trade ID", display_order: 0, width_px: 317, default_width_px: 230, updated_at: "unchanged" }
  ]);
  assert.equal(sqlite.prepare("PRAGMA foreign_keys").get().foreign_keys, 1);
  assert.deepEqual(sqlite.prepare("PRAGMA foreign_key_check").all(), []);
  assert.equal(sqlite.prepare("PRAGMA quick_check").get().quick_check, "ok");
  assert.throws(() => sqlite.exec("UPDATE batches SET description = 'changed'"), /BATCH_IMMUTABLE/);
  assert.throws(() => sqlite.exec("INSERT INTO batch_members VALUES (1, 999)"), /FOREIGN KEY/);
  assert.throws(() => sqlite.exec("INSERT INTO batches VALUES (-1, 'invalid')"), /CHECK/);
  sqlite.exec("INSERT INTO batches(description) VALUES ('Next batch')");
  assert.equal(sqlite.prepare("SELECT MAX(batch_id) AS id FROM batches").get().id, 51);
  sqlite.exec("INSERT INTO trade_exposures(trade_id, amount_minor) VALUES (12, 100)");
  assert.equal(sqlite.prepare("SELECT external_code FROM trade_exposures WHERE trade_id = 12").get().external_code, "FX_EXTERNAL");
  const before = schemaSnapshot(sqlite);
  migrateDomainTerminology(sqlite);
  assert.deepEqual(schemaSnapshot(sqlite), before);
});

test("uses consistent collection names for every current table and retains distinct legacy output tables", t => {
  const sqlite = new DatabaseSync(":memory:");
  t.after(() => sqlite.close());
  const renames = [
    ["client_fx_deals", "client_deals"],
    ["fx_hedge_deals", "hedge_deals"],
    ["fx_trade_exposure", "trade_exposures"],
    ["fx_trade_market_snapshot", "trade_market_snapshots"],
    ["fx_trade_position_management", "trade_position_management"],
    ["fx_trade_position_management_transitions", "trade_position_management_transitions"],
    ["fx_auto_management_admission_decisions", "auto_management_admission_decisions"],
    ["fx_batches", "batches"],
    ["fx_batch_members", "batch_members"],
    ["fx_batch_balance_trade", "batch_balance_trades"],
    ["fx_batch_position_output", "batch_position_outputs"],
    ["fx_batch_quote_cash_output", "batch_quote_cash_outputs"],
    ["fx_batching_settings", "batching_settings"],
    ["fx_auto_batching_settings", "auto_batching_settings"],
    ["fx_auto_batching_ccy_pairs", "auto_batching_ccy_pairs"],
    ["fx_hedge_quick_mode_settings", "hedge_quick_mode_settings"],
    ["fx_batch_outputs", "batch_outputs"],
    ["fx_batch_quote_cash_outputs", "legacy_batch_quote_cash_outputs"],
    ["fx_auto_hedging_admission_decisions", "auto_hedging_admission_decisions"]
  ];
  for (const [name] of renames) sqlite.exec(`CREATE TABLE ${name}(id INTEGER PRIMARY KEY); INSERT INTO ${name} VALUES(7)`);
  migrateDomainTerminology(sqlite);
  for (const [legacy, current] of renames) {
    assert.equal(sqlite.prepare("SELECT name FROM sqlite_master WHERE name = ?").get(legacy), undefined);
    assert.equal(sqlite.prepare(`SELECT id FROM ${current}`).get().id, 7);
  }
  assert.equal(sqlite.prepare("PRAGMA foreign_keys").get().foreign_keys, 1);
});

test("rejects legacy/current coexistence without modifying either schema", t => {
  const sqlite = legacyDatabase();
  t.after(() => sqlite.close());
  sqlite.exec("CREATE TABLE batches(batch_id INTEGER PRIMARY KEY)");
  const before = schemaSnapshot(sqlite);
  assert.throws(() => migrateDomainTerminology(sqlite), /Both legacy and current database objects/);
  assert.deepEqual(schemaSnapshot(sqlite), before);
  assert.equal(sqlite.prepare("PRAGMA foreign_keys").get().foreign_keys, 1);
});

test("rolls back earlier rebuilt tables when a later table has conflicting column names", t => {
  const sqlite = legacyDatabase();
  t.after(() => sqlite.close());
  sqlite.exec("CREATE TABLE fx_z_conflict(fx_value TEXT, value TEXT)");
  const before = schemaSnapshot(sqlite);
  assert.throws(() => migrateDomainTerminology(sqlite), /column names are ambiguous/);
  assert.deepEqual(schemaSnapshot(sqlite), before);
  assert.equal(sqlite.prepare("SELECT amount_minor FROM fx_trade_exposure").get().amount_minor, 123456789);
  assert.equal(sqlite.prepare("PRAGMA foreign_keys").get().foreign_keys, 1);
});

test("rejects conflicting saved layouts and rolls back instead of discarding user settings", t => {
  const sqlite = legacyDatabase();
  t.after(() => sqlite.close());
  sqlite.exec(`INSERT INTO ui_table_column_settings VALUES
    ('position_grid', 'trade_id', 'Trade ID', 0, 420, 96, 'newer')`);
  const before = schemaSnapshot(sqlite);
  assert.throws(() => migrateDomainTerminology(sqlite), /Both legacy and current layout settings/);
  assert.deepEqual(schemaSnapshot(sqlite), before);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM ui_table_column_settings").get().count, 4);
});

test("restores disabled foreign keys after migration", t => {
  const sqlite = legacyDatabase();
  t.after(() => sqlite.close());
  sqlite.exec("PRAGMA foreign_keys = OFF");
  migrateDomainTerminology(sqlite);
  assert.equal(sqlite.prepare("PRAGMA foreign_keys").get().foreign_keys, 0);
  assert.deepEqual(sqlite.prepare("PRAGMA foreign_key_check").all(), []);
});
