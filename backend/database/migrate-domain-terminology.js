"use strict";

const TABLE_RENAMES = Object.freeze([
  ["fx_batch_quote_cash_outputs", "legacy_batch_quote_cash_outputs"],
  ["fx_batch_quote_cash_output", "batch_quote_cash_outputs"],
  ["fx_batch_position_output", "batch_position_outputs"],
  ["fx_batch_balance_trade", "batch_balance_trades"],
  ["fx_trade_market_snapshot", "trade_market_snapshots"],
  ["fx_trade_exposure", "trade_exposures"]
]);

const TRADE_CONTEXT_RENAMES = Object.freeze([
  ["execution_context", "trade_context"],
  ["execution_system", "originating_system"]
]);

function currentIdentifier(identifier) {
  let result = identifier.replaceAll("initial_fx_position_mode", "initial_position_management_mode")
    .replaceAll("current_fx_position_mode", "current_position_management_mode");
  for (const [legacy, current] of [...TABLE_RENAMES, ...TRADE_CONTEXT_RENAMES]) {
    result = result.replaceAll(legacy, current)
      .replaceAll(legacy.toUpperCase(), current.toUpperCase());
  }
  return result.replace(/(^|_)fx_/g, "$1").replace(/(^|_)FX_/g, "$1");
}

function currentContextLabel(label) {
  return label.replaceAll("Execution Context", "Trade Context")
    .replaceAll("Execution System", "Originating System")
    .replaceAll("an Trade Context", "a Trade Context")
    .replaceAll("An Trade Context", "A Trade Context");
}

function currentDefinition(definition) {
  // Значения DEFAULT и CHECK остаются прежними: меняются имена, а не данные.
  return definition.replace(/('(?:''|[^'])*')|([A-Za-z_][A-Za-z_0-9]*)/g,
    (token, literal) => literal ? token : currentIdentifier(token))
    .replace(/(RAISE\s*\(\s*(?:ABORT|FAIL|ROLLBACK)\s*,\s*)('(?:''|[^'])*')/gi,
      (_, prefix, message) => prefix + "'"
        + currentContextLabel(currentIdentifier(message.slice(1, -1))).replace(/\bFX /g, "") + "'");
}

function quotedIdentifier(identifier) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function currentLayoutKey(key) {
  return currentIdentifier(key
    .replaceAll("initial_fx_position_mode", "initial_position_management_mode")
    .replaceAll("current_fx_position_mode", "current_position_management_mode"));
}

function migrateLayoutKeys(sqlite) {
  if (!sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'ui_table_column_settings'").get()) {
    return;
  }

  const settings = sqlite.prepare("SELECT table_key, column_key, column_label FROM ui_table_column_settings").all();
  for (const setting of settings) {
    const tableKey = currentLayoutKey(setting.table_key);
    const columnKey = currentLayoutKey(setting.column_key);
    const columnLabel = currentContextLabel(setting.column_label);
    const keyChanged = tableKey !== setting.table_key || columnKey !== setting.column_key;
    if (!keyChanged && columnLabel === setting.column_label) {
      continue;
    }
    const target = sqlite.prepare(`
      SELECT 1 FROM ui_table_column_settings WHERE table_key = ? AND column_key = ?
    `).get(tableKey, columnKey);
    if (keyChanged && target) {
      throw new Error(`Both legacy and current layout settings exist: ${setting.table_key}.${setting.column_key}, ${tableKey}.${columnKey}.`);
    }
    sqlite.prepare(`
      UPDATE ui_table_column_settings SET table_key = ?, column_key = ?, column_label = ?
      WHERE table_key = ? AND column_key = ?
    `).run(tableKey, columnKey, columnLabel, setting.table_key, setting.column_key);
  }
}

function schemaObjects(sqlite) {
  return sqlite.prepare(`
    SELECT type, name, tbl_name, sql FROM sqlite_master
    WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY type, name
  `).all();
}

function assertUniqueTargetNames(objects) {
  const names = new Map();
  for (const object of objects) {
    const target = currentIdentifier(object.name);
    const namespace = object.type === "trigger" ? "trigger" : "schema";
    const key = `${namespace}:${target.toLowerCase()}`;
    if (names.has(key)) {
      throw new Error(`Both legacy and current database objects exist: ${names.get(key)}, ${object.name}.`);
    }
    names.set(key, object.name);
  }
}

// Перестройка сохраняет ограничения и историю, включая выданные AUTOINCREMENT ID.
function migrateDomainTerminology(sqlite) {
  const objects = schemaObjects(sqlite);
  const tables = objects.filter(object => object.type === "table");
  const affectedTables = tables.filter(table => currentDefinition(table.sql) !== table.sql);
  const hasLegacyLayoutKeys = tables.some(table => table.name === "ui_table_column_settings")
    && sqlite.prepare("SELECT table_key, column_key, column_label FROM ui_table_column_settings").all()
      .some(setting => currentLayoutKey(setting.table_key) !== setting.table_key
        || currentLayoutKey(setting.column_key) !== setting.column_key
        || currentContextLabel(setting.column_label) !== setting.column_label);
  const changedObjects = objects.some(object => currentDefinition(object.sql) !== object.sql);
  if (affectedTables.length === 0 && !hasLegacyLayoutKeys && !changedObjects) {
    return;
  }

  assertUniqueTargetNames(objects);
  const foreignKeysEnabled = sqlite.prepare("PRAGMA foreign_keys").get().foreign_keys;
  sqlite.exec("PRAGMA foreign_keys = OFF");
  try {
    sqlite.exec("BEGIN IMMEDIATE");
    const affectedNames = new Set(affectedTables.map(table => table.name));
    const dependentObjects = objects.filter(object => object.type === "view"
      || object.type === "trigger"
      || (object.type === "index" && (affectedNames.has(object.tbl_name)
        || currentDefinition(object.sql) !== object.sql)));
    for (const object of dependentObjects) {
      sqlite.exec(`DROP ${object.type.toUpperCase()} ${quotedIdentifier(object.name)}`);
    }

    const hasSequence = Boolean(sqlite.prepare("SELECT 1 FROM sqlite_master WHERE name = 'sqlite_sequence'").get());
    for (const table of affectedTables) {
      const targetName = currentIdentifier(table.name);
      const temporaryName = `__domain_terminology_${targetName}`;
      if (sqlite.prepare("SELECT 1 FROM sqlite_master WHERE name = ?").get(temporaryName)) {
        throw new Error(`Domain terminology migration temporary object already exists: ${temporaryName}.`);
      }
      const columns = sqlite.prepare(`PRAGMA table_xinfo(${quotedIdentifier(table.name)})`).all()
        .filter(column => column.hidden === 0);
      const targetColumns = columns.map(column => currentIdentifier(column.name));
      if (new Set(targetColumns.map(column => column.toLowerCase())).size !== columns.length) {
        throw new Error(`Domain terminology column names are ambiguous in ${table.name}.`);
      }
      const originalCount = sqlite.prepare(`SELECT COUNT(*) AS count FROM ${quotedIdentifier(table.name)}`).get().count;
      const sequence = hasSequence
        ? sqlite.prepare("SELECT seq FROM sqlite_sequence WHERE name = ?").get(table.name)?.seq
        : undefined;
      const definition = currentDefinition(table.sql.slice(table.sql.indexOf("(")));
      sqlite.exec(`CREATE TABLE ${quotedIdentifier(temporaryName)} ${definition}`);
      sqlite.exec(`
        INSERT INTO ${quotedIdentifier(temporaryName)} (${targetColumns.map(quotedIdentifier).join(", ")})
        SELECT ${columns.map(column => quotedIdentifier(column.name)).join(", ")}
        FROM ${quotedIdentifier(table.name)}
      `);
      const copiedCount = sqlite.prepare(`SELECT COUNT(*) AS count FROM ${quotedIdentifier(temporaryName)}`).get().count;
      if (copiedCount !== originalCount) {
        throw new Error(`Domain terminology migration did not preserve every row in ${table.name}.`);
      }
      sqlite.exec(`DROP TABLE ${quotedIdentifier(table.name)}`);
      sqlite.exec(`ALTER TABLE ${quotedIdentifier(temporaryName)} RENAME TO ${quotedIdentifier(targetName)}`);
      if (sequence !== undefined) {
        sqlite.prepare("UPDATE sqlite_sequence SET seq = MAX(seq, ?) WHERE name = ?").run(sequence, targetName);
      }
    }

    for (const object of dependentObjects) {
      sqlite.exec(currentDefinition(object.sql));
    }
    migrateLayoutKeys(sqlite);
    if (sqlite.prepare("PRAGMA foreign_key_check").all().length > 0) {
      throw new Error("Domain terminology migration produced foreign key violations.");
    }
    if (sqlite.prepare("PRAGMA quick_check").get().quick_check !== "ok") {
      throw new Error("Domain terminology migration failed the database integrity check.");
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

module.exports = { migrateDomainTerminology };
