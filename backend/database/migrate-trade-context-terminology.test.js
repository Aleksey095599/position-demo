"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { DatabaseSync } = require("node:sqlite");
const { migrateDomainTerminology } = require("./migrate-domain-terminology");

function legacyDatabase() {
  const database = new DatabaseSync(":memory:");
  database.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE execution_systems (
      execution_system_id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      pricing_mode TEXT NOT NULL CHECK (pricing_mode IN ('AUTO_PRICED', 'DEALER_PRICED'))
    );
    CREATE TABLE execution_contexts (
      execution_context_id INTEGER PRIMARY KEY,
      servicing_location_id TEXT NOT NULL,
      accounting_system_id TEXT,
      execution_system_id TEXT NOT NULL REFERENCES execution_systems(execution_system_id)
    );
    CREATE UNIQUE INDEX uq_execution_contexts_components ON execution_contexts
      (servicing_location_id, COALESCE(accounting_system_id, ''), execution_system_id);
    CREATE TABLE trading_counterparty_execution_contexts (
      counterparty_id INTEGER NOT NULL,
      execution_context_id INTEGER NOT NULL REFERENCES execution_contexts(execution_context_id),
      PRIMARY KEY(counterparty_id, execution_context_id)
    );
    CREATE TABLE pricing_rules (
      pricing_rule_id INTEGER PRIMARY KEY,
      execution_context_id INTEGER NOT NULL REFERENCES execution_contexts(execution_context_id)
    );
    CREATE TABLE client_deals (
      trade_id INTEGER PRIMARY KEY,
      execution_context_id INTEGER REFERENCES execution_contexts(execution_context_id),
      comment TEXT NOT NULL DEFAULT 'Execution Context is an external reference'
    );
    CREATE TABLE ui_table_column_settings (
      table_key TEXT NOT NULL, column_key TEXT NOT NULL, column_label TEXT NOT NULL,
      display_order INTEGER NOT NULL, width_px INTEGER NOT NULL,
      PRIMARY KEY(table_key, column_key)
    );
    INSERT INTO execution_systems VALUES ('CLICK_TRADE_EFX', 'Existing Execution System name', 'AUTO_PRICED');
    INSERT INTO execution_contexts VALUES (42, '002', 'AFINA', 'CLICK_TRADE_EFX'),
      (73, '1234', NULL, 'CLICK_TRADE_EFX');
    INSERT INTO trading_counterparty_execution_contexts VALUES (7, 42), (7, 73);
    INSERT INTO pricing_rules VALUES (81, 42);
    INSERT INTO client_deals(trade_id, execution_context_id) VALUES (105, 42);
    INSERT INTO ui_table_column_settings VALUES
      ('execution_contexts_grid', 'execution_system', 'Execution System', 4, 367),
      ('execution_systems_grid', 'execution_context_count', 'Execution Context Count', 1, 181),
      ('client_deals_grid', 'context_path', 'Execution Context', 15, 482);
    CREATE VIEW v_execution_context_usage AS
      SELECT execution_context_id, COUNT(*) AS uses FROM client_deals GROUP BY execution_context_id;
    CREATE TRIGGER trg_execution_systems_lock_pricing_mode BEFORE UPDATE OF pricing_mode ON execution_systems
    WHEN EXISTS (SELECT 1 FROM execution_contexts WHERE execution_system_id = OLD.execution_system_id)
    BEGIN
      SELECT RAISE(ABORT, 'an Execution System used by Execution Context cannot change Pricing Mode');
    END;
  `);
  return database;
}

test("context terminology migration preserves IDs, relationships, user data and saved table dimensions", t => {
  const database = legacyDatabase();
  t.after(() => database.close());
  migrateDomainTerminology(database);

  const rows = sql => database.prepare(sql).all().map(row => ({ ...row }));
  assert.deepEqual(rows("SELECT * FROM originating_systems"), [
    { originating_system_id: "CLICK_TRADE_EFX", name: "Existing Execution System name", pricing_mode: "AUTO_PRICED" }
  ]);
  assert.deepEqual(rows("SELECT * FROM trade_contexts ORDER BY trade_context_id"), [
    { trade_context_id: 42, servicing_location_id: "002", accounting_system_id: "AFINA", originating_system_id: "CLICK_TRADE_EFX" },
    { trade_context_id: 73, servicing_location_id: "1234", accounting_system_id: null, originating_system_id: "CLICK_TRADE_EFX" }
  ]);
  assert.deepEqual(rows("SELECT * FROM trading_counterparty_trade_contexts ORDER BY trade_context_id"), [
    { counterparty_id: 7, trade_context_id: 42 }, { counterparty_id: 7, trade_context_id: 73 }
  ]);
  assert.deepEqual(rows("SELECT * FROM pricing_rules"), [{ pricing_rule_id: 81, trade_context_id: 42 }]);
  assert.deepEqual(rows("SELECT * FROM client_deals"), [
    { trade_id: 105, trade_context_id: 42, comment: "Execution Context is an external reference" }
  ]);
  assert.deepEqual(rows("SELECT * FROM ui_table_column_settings ORDER BY table_key"), [
    { table_key: "client_deals_grid", column_key: "context_path", column_label: "Trade Context", display_order: 15, width_px: 482 },
    { table_key: "originating_systems_grid", column_key: "trade_context_count", column_label: "Trade Context Count", display_order: 1, width_px: 181 },
    { table_key: "trade_contexts_grid", column_key: "originating_system", column_label: "Originating System", display_order: 4, width_px: 367 }
  ]);
  assert.deepEqual(rows("SELECT * FROM v_trade_context_usage"), [{ trade_context_id: 42, uses: 1 }]);
  assert.throws(() => database.exec("UPDATE originating_systems SET pricing_mode = 'DEALER_PRICED'"), /Originating System used by Trade Context/);
  assert.throws(() => database.exec("INSERT INTO pricing_rules VALUES (82, 999)"), /FOREIGN KEY/);
  assert.throws(() => database.exec("INSERT INTO trade_contexts VALUES (99, '1234', NULL, 'CLICK_TRADE_EFX')"), /UNIQUE/);
  assert.deepEqual(rows("PRAGMA foreign_key_check"), []);
  assert.equal(database.prepare("PRAGMA quick_check").get().quick_check, "ok");
  const before = rows("SELECT type, name, sql FROM sqlite_master ORDER BY name");
  migrateDomainTerminology(database);
  assert.deepEqual(rows("SELECT type, name, sql FROM sqlite_master ORDER BY name"), before);
});

test("context migration rejects conflicting system tables without changing the database", t => {
  const database = legacyDatabase();
  t.after(() => database.close());
  database.exec("CREATE TABLE originating_systems(originating_system_id TEXT PRIMARY KEY)");
  const before = database.prepare("SELECT name, sql FROM sqlite_master ORDER BY name").all();
  assert.throws(() => migrateDomainTerminology(database), /Both legacy and current database objects/);
  assert.deepEqual(database.prepare("SELECT name, sql FROM sqlite_master ORDER BY name").all(), before);
});
