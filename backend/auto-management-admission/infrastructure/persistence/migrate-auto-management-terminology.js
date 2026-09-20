"use strict";

const LEGACY_ADMISSION_TOKEN = /auto_hedging_admission/i;

function currentIdentifier(value) {
  return value.replaceAll("auto_hedging_admission", "auto_management_admission")
    .replaceAll("AUTO_HEDGING_ADMISSION", "AUTO_MANAGEMENT_ADMISSION");
}

function quotedIdentifier(value) {
  return `"${value.replaceAll('"', '""')}"`;
}

function currentLayoutKey(value) {
  return currentIdentifier(value)
    .replaceAll("eligible_for_auto_hedging", "eligible_for_auto_management")
    .replaceAll("initial_fx_position_mode", "initial_position_management_mode")
    .replaceAll("current_fx_position_mode", "current_position_management_mode");
}

function legacyLayoutSettings(sqlite) {
  if (!sqlite.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'ui_table_column_settings'"
  ).get()) {
    return [];
  }

  return sqlite.prepare(
    "SELECT table_key, column_key FROM ui_table_column_settings"
  ).all().filter(row => currentLayoutKey(row.table_key) !== row.table_key
    || currentLayoutKey(row.column_key) !== row.column_key);
}

// Меняются имена схемы и ключи UI, но не факты трейдов и не история решений.
function migrateAutoManagementTerminology(sqlite) {
  const tables = sqlite.prepare(
    "SELECT name, sql FROM sqlite_master WHERE type = 'table' AND sql IS NOT NULL"
  ).all();
  const affectedTables = tables.filter(table => LEGACY_ADMISSION_TOKEN.test(table.sql));
  const layoutSettings = legacyLayoutSettings(sqlite);

  if (affectedTables.length === 0 && layoutSettings.length === 0) {
    return;
  }

  const existingNames = new Set(tables.map(table => table.name));
  for (const table of affectedTables) {
    const targetName = currentIdentifier(table.name);
    if (targetName !== table.name && existingNames.has(targetName)) {
      throw new Error(`Both legacy and current Auto Management tables exist: ${table.name}, ${targetName}.`);
    }
  }

  const foreignKeysEnabled = sqlite.prepare("PRAGMA foreign_keys").get().foreign_keys;
  sqlite.exec("PRAGMA foreign_keys = OFF");

  try {
    sqlite.exec("BEGIN IMMEDIATE");
    const dependentObjects = affectedTables.length === 0 ? [] : sqlite.prepare(`
      SELECT type, name, tbl_name, sql FROM sqlite_master
      WHERE type IN ('trigger', 'view', 'index') AND sql IS NOT NULL
      ORDER BY type, name
    `).all().filter(object => object.type !== "index"
      || affectedTables.some(table => table.name === object.tbl_name));

    // Триггеры и представления восстанавливаются в той же транзакции, включая
    // определения из старых версий схемы, которые ещё не обновлены при запуске.
    for (const object of dependentObjects) {
      sqlite.exec(`DROP ${object.type.toUpperCase()} ${quotedIdentifier(object.name)}`);
    }

    for (const table of affectedTables) {
      const targetName = currentIdentifier(table.name);
      const temporaryName = `__management_terminology_${targetName}`;
      if (existingNames.has(temporaryName)) {
        throw new Error(`Auto Management migration temporary table already exists: ${temporaryName}.`);
      }
      const columns = sqlite.prepare(`PRAGMA table_info(${quotedIdentifier(table.name)})`).all();
      const targetColumns = columns.map(column => currentIdentifier(column.name));
      if (new Set(targetColumns).size !== columns.length) {
        throw new Error(`Auto Management column names are ambiguous in ${table.name}.`);
      }
      const originalCount = sqlite.prepare(`SELECT COUNT(*) AS count FROM ${quotedIdentifier(table.name)}`).get().count;
      const sequence = existingNames.has("sqlite_sequence")
        ? sqlite.prepare("SELECT seq FROM sqlite_sequence WHERE name = ?").get(table.name)?.seq
        : undefined;
      const definition = currentIdentifier(table.sql.slice(table.sql.indexOf("(")));
      sqlite.exec(`CREATE TABLE ${quotedIdentifier(temporaryName)} ${definition}`);
      sqlite.exec(`
        INSERT INTO ${quotedIdentifier(temporaryName)} (${targetColumns.map(quotedIdentifier).join(", ")})
        SELECT ${columns.map(column => quotedIdentifier(column.name)).join(", ")}
        FROM ${quotedIdentifier(table.name)}
      `);
      const copiedCount = sqlite.prepare(`SELECT COUNT(*) AS count FROM ${quotedIdentifier(temporaryName)}`).get().count;
      if (copiedCount !== originalCount) {
        throw new Error(`Auto Management migration did not preserve every row in ${table.name}.`);
      }
      sqlite.exec(`DROP TABLE ${quotedIdentifier(table.name)}`);
      sqlite.exec(`ALTER TABLE ${quotedIdentifier(temporaryName)} RENAME TO ${quotedIdentifier(targetName)}`);
      if (sequence !== undefined) {
        sqlite.prepare("UPDATE sqlite_sequence SET seq = MAX(seq, ?) WHERE name = ?").run(sequence, targetName);
      }
    }

    for (const object of dependentObjects) {
      sqlite.exec(currentIdentifier(object.sql));
    }

    for (const row of layoutSettings) {
      const tableKey = currentLayoutKey(row.table_key);
      const columnKey = currentLayoutKey(row.column_key);
      const current = sqlite.prepare(`
        SELECT 1 FROM ui_table_column_settings WHERE table_key = ? AND column_key = ?
      `).get(tableKey, columnKey);
      if (current) {
        // При частичном обновлении приоритет у уже сохранённых текущих настроек.
        sqlite.prepare("DELETE FROM ui_table_column_settings WHERE table_key = ? AND column_key = ?")
          .run(row.table_key, row.column_key);
      } else {
        sqlite.prepare(`
          UPDATE ui_table_column_settings SET table_key = ?, column_key = ?
          WHERE table_key = ? AND column_key = ?
        `).run(tableKey, columnKey, row.table_key, row.column_key);
      }
    }

    if (sqlite.prepare("PRAGMA foreign_key_check").all().length > 0) {
      throw new Error("Auto Management terminology migration produced foreign key violations.");
    }
    if (sqlite.prepare("PRAGMA quick_check").get().quick_check !== "ok") {
      throw new Error("Auto Management terminology migration failed the database integrity check.");
    }
    sqlite.exec("COMMIT");
  } catch (error) {
    try {
      sqlite.exec("ROLLBACK");
    } catch {}
    throw error;
  } finally {
    sqlite.exec(`PRAGMA foreign_keys = ${foreignKeysEnabled ? "ON" : "OFF"}`);
  }
}

module.exports = { migrateAutoManagementTerminology };
