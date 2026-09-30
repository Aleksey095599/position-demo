"use strict";

const RETIRED_TRIGGERS = new Set([
  "trg_trade_position_management_initialize",
  "trg_batch_balance_trade_position_management_mode_immutable_update",
  "trg_batch_balance_trade_position_management_mode_immutable_delete",
  "trg_batch_balance_trade_position_management_transition_reject"
]);

function quote(name) {
  return `"${name.replaceAll('"', '""')}"`;
}

function definition(schema, type, name) {
  const ending = type === "TRIGGER" ? "\\nEND;" : "\\n\\);";
  const match = schema.match(new RegExp(`CREATE ${type} IF NOT EXISTS ${name}\\b[\\s\\S]*?${ending}`));
  if (!match) throw new Error(`Canonical ${type} ${name} was not found.`);
  return match[0];
}

function migrateLayout(sqlite) {
  if (!sqlite.prepare("SELECT 1 FROM sqlite_master WHERE name = 'ui_table_column_settings'").get()) return;
  for (const table of ["client_deals_grid", "hedge_deals_grid"]) {
    const rows = sqlite.prepare("SELECT column_key FROM ui_table_column_settings WHERE table_key = ?").all(table);
    const keys = new Set(rows.map(row => row.column_key));
    if (!keys.has("position_management_mode")) {
      const source = keys.has("current_position_management_mode")
        ? "current_position_management_mode" : "initial_position_management_mode";
      sqlite.prepare(`UPDATE ui_table_column_settings
        SET column_key = 'position_management_mode', column_label = 'Position Management Mode'
        WHERE table_key = ? AND column_key = ?`).run(table, source);
    }
    sqlite.prepare(`DELETE FROM ui_table_column_settings WHERE table_key = ?
      AND column_key IN ('initial_position_management_mode', 'current_position_management_mode')`).run(table);
  }
}

// Сохраняем фактический режим: исторический MANUAL → AUTO не откатывается.
// Правила контекста и eligibility при миграции повторно не вычисляются.
function migrateImmutablePositionManagement(sqlite, schema) {
  const columns = sqlite.prepare("PRAGMA table_info(trade_position_management)").all().map(column => column.name);
  if (columns.length === 0) return;
  const hasTransitions = Boolean(sqlite.prepare("SELECT 1 FROM sqlite_master WHERE name = 'trade_position_management_transitions'").get());
  const canonical = ["trade_id", "trade_type", "position_management_mode", "created_at"];
  if (canonical.length === columns.length && canonical.every(column => columns.includes(column)) && !hasTransitions) return;
  const source = columns.includes("current_position_management_mode")
    ? "current_position_management_mode" : "position_management_mode";
  if (!["trade_id", "trade_type", "created_at", source].every(column => columns.includes(column))) {
    throw new Error("Trade Position Management schema cannot be migrated safely.");
  }
  const objects = sqlite.prepare(`SELECT type, name, sql FROM sqlite_master
    WHERE type IN ('trigger', 'view') AND sql IS NOT NULL`).all()
    .filter(object => /\btrade_position_management(?:_transitions)?\b/.test(object.sql));
  const restored = [];
  for (const object of objects) {
    if (RETIRED_TRIGGERS.has(object.name)) continue;
    if (object.type === "trigger" && (object.name === "trg_batches_form" || object.name.startsWith("trg_trade_position_management_"))) {
      restored.push(definition(schema, "TRIGGER", object.name));
    } else {
      throw new Error(`Position Management migration requires reviewing ${object.type} ${object.name}.`);
    }
  }
  const foreignKeys = sqlite.prepare("PRAGMA foreign_keys").get().foreign_keys;
  sqlite.exec("PRAGMA foreign_keys = OFF");
  try {
    sqlite.exec("BEGIN IMMEDIATE");
    for (const object of objects) sqlite.exec(`DROP ${object.type.toUpperCase()} ${quote(object.name)}`);
    const count = sqlite.prepare("SELECT COUNT(*) AS count FROM trade_position_management").get().count;
    sqlite.exec(definition(schema, "TABLE", "trade_position_management").replace(
      "CREATE TABLE IF NOT EXISTS trade_position_management", "CREATE TABLE __immutable_position_management"
    ));
    sqlite.exec(`INSERT INTO __immutable_position_management (trade_id, trade_type, position_management_mode, created_at)
      SELECT trade_id, trade_type, ${quote(source)}, created_at FROM trade_position_management`);
    if (sqlite.prepare("SELECT COUNT(*) AS count FROM __immutable_position_management").get().count !== count) {
      throw new Error("Position Management migration did not preserve every Trade.");
    }
    sqlite.exec(`DROP TABLE IF EXISTS trade_position_management_transitions;
      DROP TABLE trade_position_management;
      ALTER TABLE __immutable_position_management RENAME TO trade_position_management;`);
    migrateLayout(sqlite);
    for (const sql of restored) sqlite.exec(sql);
    for (const name of ["immutable_update", "immutable_delete", "no_replace"]) {
      sqlite.exec(definition(schema, "TRIGGER", `trg_trade_position_management_${name}`));
    }
    sqlite.exec("CREATE INDEX idx_trade_position_management_mode ON trade_position_management (position_management_mode, trade_id)");
    if (sqlite.prepare("PRAGMA foreign_key_check").all().length || sqlite.prepare("PRAGMA quick_check").get().quick_check !== "ok") {
      throw new Error("Position Management migration failed database integrity checks.");
    }
    sqlite.exec("COMMIT");
  } catch (error) {
    sqlite.exec("ROLLBACK");
    throw error;
  } finally {
    sqlite.exec(`PRAGMA foreign_keys = ${foreignKeys ? "ON" : "OFF"}`);
  }
}

module.exports = { migrateImmutablePositionManagement };
