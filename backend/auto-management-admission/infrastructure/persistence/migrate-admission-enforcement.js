"use strict";

function quote(value) {
  return `"${value.replaceAll('"', '""')}"`;
}

function admissionDefinition(sql) {
  const retiredField = /\b(default_position_management_mode|position_management_mode_override)\b/i;
  if (retiredField.test(sql)) {
    const start = sql.indexOf("(");
    const end = sql.lastIndexOf(")");
    const definition = sql.slice(start + 1, end);
    const parts = [];
    let depth = 0;
    let delimiter = null;
    let partStart = 0;
    for (let index = 0; index < definition.length; index += 1) {
      const character = definition[index];
      if (delimiter) {
        if (character === delimiter) {
          if (definition[index + 1] === delimiter) index += 1;
          else delimiter = null;
        }
      } else if (["'", '"', '`', '['].includes(character)) {
        delimiter = character === '[' ? ']' : character;
      } else if (character === "(") depth += 1;
      else if (character === ")") depth -= 1;
      else if (character === "," && depth === 0) {
        parts.push(definition.slice(partStart, index));
        partStart = index + 1;
      }
    }
    parts.push(definition.slice(partStart));
    sql = sql.slice(0, start + 1) + parts.filter(part => !retiredField.test(part)).join(",") + sql.slice(end);
  }
  return sql
    .replace("CHECK (trade_type = 'CLIENT_DEAL')", "CHECK (trade_type IN ('CLIENT_DEAL', 'HEDGE_DEAL'))")
    .replace("chk_auto_management_admission_decisions_shadow_only", "chk_auto_management_admission_decisions_enforcement")
    .replace("typeof(is_enforced) = 'integer' AND is_enforced = 0", "typeof(is_enforced) = 'integer' AND is_enforced IN (0, 1)");
}

// Admission уже заполнен предыдущим этапом обновления. Старые MANUAL overrides
// сохраняют ограничение; AUTO больше не может обходить проверки допуска.
function migrateAdmissionEnforcement(sqlite) {
  const tables = sqlite.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'table'").all();
  const affected = tables.filter(table =>
    ["trade_contexts", "pricing_rules", "auto_management_admission_decisions"].includes(table.name)
    && admissionDefinition(table.sql) !== table.sql
  );
  if (affected.length === 0) return;

  const foreignKeys = sqlite.prepare("PRAGMA foreign_keys").get().foreign_keys;
  sqlite.exec("PRAGMA foreign_keys = OFF");
  try {
    sqlite.exec("BEGIN IMMEDIATE");
    const objects = sqlite.prepare(`
      SELECT type, name, tbl_name, sql FROM sqlite_master
      WHERE type IN ('trigger', 'view', 'index') AND sql IS NOT NULL
    `).all().filter(object => object.type !== "index"
      || affected.some(table => table.name === object.tbl_name));
    for (const object of objects) {
      if (/\b(default_position_management_mode|position_management_mode_override)\b/i.test(object.sql)) {
        throw new Error(`Retired routing settings are referenced by ${object.type} ${object.name}.`);
      }
    }
    for (const object of objects) {
      sqlite.exec(`DROP ${object.type.toUpperCase()} ${quote(object.name)}`);
    }
    const ruleColumns = sqlite.prepare("PRAGMA table_info(pricing_rules)").all();
    if (ruleColumns.some(column => column.name === "position_management_mode_override")) {
      const reviewMode = tables.find(table => table.name === "pricing_rules").sql.includes("'MANUAL_ONLY'")
        ? "MANUAL_ONLY" : "REVIEW_REQUIRED";
      sqlite.prepare(`UPDATE pricing_rules SET auto_management_admission_mode_override = ?
        WHERE position_management_mode_override = 'MANUAL'
          AND auto_management_admission_mode_override IS NULL`).run(reviewMode);
    }
    for (const table of affected) {
      const temporaryName = `__admission_enforcement_${table.name}`;
      const columns = sqlite.prepare(`PRAGMA table_info(${quote(table.name)})`).all()
        .filter(column => !["default_position_management_mode", "position_management_mode_override"].includes(column.name))
        .map(column => quote(column.name)).join(", ");
      const sequence = tables.some(item => item.name === "sqlite_sequence")
        ? sqlite.prepare("SELECT seq FROM sqlite_sequence WHERE name = ?").get(table.name)?.seq
        : undefined;
      sqlite.exec(`CREATE TABLE ${quote(temporaryName)} ${admissionDefinition(table.sql).slice(table.sql.indexOf("("))}`);
      sqlite.exec(`INSERT INTO ${quote(temporaryName)} (${columns}) SELECT ${columns} FROM ${quote(table.name)}`);
      sqlite.exec(`DROP TABLE ${quote(table.name)}`);
      sqlite.exec(`ALTER TABLE ${quote(temporaryName)} RENAME TO ${quote(table.name)}`);
      if (sequence !== undefined) {
        sqlite.prepare("UPDATE sqlite_sequence SET seq = MAX(seq, ?) WHERE name = ?").run(sequence, table.name);
      }
    }
    for (const object of objects) sqlite.exec(object.sql);
    if (tables.some(table => table.name === "ui_table_column_settings")) {
      sqlite.exec(`DELETE FROM ui_table_column_settings
        WHERE table_key = 'trade_contexts_grid' AND column_key = 'default_position_management_mode'`);
    }
    if (sqlite.prepare("PRAGMA foreign_key_check").all().length > 0
      || sqlite.prepare("PRAGMA quick_check").get().quick_check !== "ok") {
      throw new Error("Admission enforcement migration failed the database integrity check.");
    }
    sqlite.exec("COMMIT");
  } catch (error) {
    sqlite.exec("ROLLBACK");
    throw error;
  } finally {
    sqlite.exec(`PRAGMA foreign_keys = ${foreignKeys ? "ON" : "OFF"}`);
  }
}

module.exports = { migrateAdmissionEnforcement };
