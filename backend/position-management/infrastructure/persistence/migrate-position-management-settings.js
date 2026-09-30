"use strict";

function quote(name) {
  return `"${name.replaceAll('"', '""')}"`;
}

function currentDefinition(sql) {
  return sql.replaceAll("auto_management_admission_mode", "position_management_mode")
    .replaceAll("'REVIEW_REQUIRED'", "'MANUAL'");
}

// Меняем настройку назначения режима, не режимы существующих Trades и не факты решений.
function migratePositionManagementSettings(sqlite) {
  const tables = sqlite.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'table'").all();
  const affected = tables.filter(table =>
    ["trade_contexts", "pricing_rules", "auto_management_admission_decisions"].includes(table.name)
    && currentDefinition(table.sql) !== table.sql);
  if (!affected.length) return;
  const foreignKeys = sqlite.prepare("PRAGMA foreign_keys").get().foreign_keys;
  sqlite.exec("PRAGMA foreign_keys = OFF");
  try {
    sqlite.exec("BEGIN IMMEDIATE");
    const objects = sqlite.prepare(`SELECT type, name, tbl_name, sql FROM sqlite_master
      WHERE type IN ('trigger', 'view', 'index') AND sql IS NOT NULL`).all()
      .filter(object => object.type !== "index" || affected.some(table => table.name === object.tbl_name));
    for (const object of objects) sqlite.exec(`DROP ${object.type.toUpperCase()} ${quote(object.name)}`);
    for (const table of affected) {
      const columns = sqlite.prepare(`PRAGMA table_info(${quote(table.name)})`).all().map(column => column.name);
      const targetColumns = columns.map(currentDefinition);
      if (new Set(targetColumns).size !== columns.length) throw new Error(`Ambiguous Position Management settings in ${table.name}.`);
      const temporaryName = `__position_management_settings_${table.name}`;
      const sequence = tables.some(item => item.name === "sqlite_sequence")
        ? sqlite.prepare("SELECT seq FROM sqlite_sequence WHERE name = ?").get(table.name)?.seq : undefined;
      const definition = currentDefinition(table.sql.slice(table.sql.indexOf("(")));
      sqlite.exec(`CREATE TABLE ${quote(temporaryName)} ${definition}`);
      const values = columns.map(column => ["auto_management_admission_mode", "auto_management_admission_mode_override", "admission_mode"].includes(column)
        ? `CASE WHEN ${quote(column)} = 'REVIEW_REQUIRED' THEN 'MANUAL' ELSE ${quote(column)} END` : quote(column));
      sqlite.exec(`INSERT INTO ${quote(temporaryName)} (${targetColumns.map(quote).join(", ")})
        SELECT ${values.join(", ")} FROM ${quote(table.name)}`);
      sqlite.exec(`DROP TABLE ${quote(table.name)};
        ALTER TABLE ${quote(temporaryName)} RENAME TO ${quote(table.name)};`);
      if (sequence !== undefined) sqlite.prepare("UPDATE sqlite_sequence SET seq = MAX(seq, ?) WHERE name = ?").run(sequence, table.name);
    }
    for (const object of objects) sqlite.exec(currentDefinition(object.sql));
    if (tables.some(table => table.name === "ui_table_column_settings")) {
      for (const tableKey of ["trade_contexts_grid", "pricing_rules_grid", "internal_pricing_rules_grid"]) {
        const rows = sqlite.prepare(`SELECT column_key FROM ui_table_column_settings WHERE table_key = ?
          AND column_key IN ('auto_management_admission_mode', 'auto_management_admission')`).all(tableKey);
        for (const row of rows) {
          const exists = sqlite.prepare("SELECT 1 FROM ui_table_column_settings WHERE table_key = ? AND column_key = 'position_management_mode'").get(tableKey);
          if (exists) sqlite.prepare("DELETE FROM ui_table_column_settings WHERE table_key = ? AND column_key = ?").run(tableKey, row.column_key);
          else sqlite.prepare(`UPDATE ui_table_column_settings SET column_key = 'position_management_mode',
            column_label = 'Position Management Mode' WHERE table_key = ? AND column_key = ?`).run(tableKey, row.column_key);
        }
      }
    }
    if (sqlite.prepare("PRAGMA foreign_key_check").all().length || sqlite.prepare("PRAGMA quick_check").get().quick_check !== "ok") {
      throw new Error("Position Management settings migration failed database integrity checks.");
    }
    sqlite.exec("COMMIT");
  } catch (error) {
    sqlite.exec("ROLLBACK");
    throw error;
  } finally {
    sqlite.exec(`PRAGMA foreign_keys = ${foreignKeys ? "ON" : "OFF"}`);
  }
}

module.exports = { migratePositionManagementSettings };
