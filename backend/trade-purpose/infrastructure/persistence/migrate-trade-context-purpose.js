"use strict";

const quote = name => `"${name.replaceAll('"', '""')}"`;

// Назначения согласованы для текущей демобазы. Не угадываем цель по одному ID
// или роли контрагента: перед переносом проверяем полный прежний контекст.
const APPROVED_CONTEXTS = [
  [1, "000", null, "INTERNAL_FRONT_SYSTEM", "POSITION_HEDGING"],
  [2, "001", "AFINA", "CLICK_TRADE_EFX", "CLIENT_CONVERSION"],
  [3, "002", "CFT-2", "CLICK_TRADE_EFX", "CLIENT_CONVERSION"],
  [4, "002", "CFT-2", "INTERNAL_FRONT_SYSTEM", "CLIENT_CONVERSION"],
  [5, "002", "CFT-2", "RFQ", "CLIENT_CONVERSION"],
  [9, "005", "HERCULES-PRO", "FX_ONLINE_24", "CLIENT_CONVERSION"],
  [10, "000", null, "EFX_PRO", "POSITION_HEDGING"],
  [11, "000", null, "EFX_PRO2", "POSITION_HEDGING"]
];

function migrateTradeContextPurpose(sqlite, assignments = APPROVED_CONTEXTS) {
  const table = sqlite.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='trade_contexts'").get();
  if (!table || sqlite.prepare("PRAGMA table_info(trade_contexts)").all().some(column => column.name === "trade_purpose_id")) return;
  const foreignKeys = sqlite.prepare("PRAGMA foreign_keys").get().foreign_keys;
  sqlite.exec("PRAGMA foreign_keys = OFF");
  try {
    sqlite.exec("BEGIN IMMEDIATE");
    const rows = sqlite.prepare("SELECT * FROM trade_contexts").all();
    const purposes = new Map();
    for (const row of rows) {
      const match = assignments.find(([id, location, accounting, origin]) =>
        id === row.trade_context_id && location === row.servicing_location_id &&
        accounting === row.accounting_system_id && origin === row.originating_system_id);
      if (!match) throw new Error(`Trade Context ${row.trade_context_id} requires an explicit Trade Purpose migration assignment.`);
      if (!sqlite.prepare("SELECT 1 FROM trade_purposes WHERE trade_purpose_id=?").get(match[4])) {
        throw new Error(`Trade Purpose ${match[4]} was not found.`);
      }
      purposes.set(row.trade_context_id, match[4]);
    }
    const objects = sqlite.prepare(`SELECT type,name,tbl_name,sql FROM sqlite_master
      WHERE sql IS NOT NULL AND (type IN ('trigger','view') OR (type='index' AND tbl_name='trade_contexts'))`).all();
    for (const object of objects) sqlite.exec(`DROP ${object.type.toUpperCase()} ${quote(object.name)}`);
    const definition = table.sql.slice(table.sql.indexOf("(") + 1);
    sqlite.exec(`CREATE TABLE __trade_contexts_with_purpose (
      trade_purpose_id TEXT NOT NULL REFERENCES trade_purposes(trade_purpose_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
      ${definition}`);
    const columns = sqlite.prepare("PRAGMA table_info(trade_contexts)").all().map(column => column.name);
    const insert = sqlite.prepare(`INSERT INTO __trade_contexts_with_purpose (${columns.map(quote)},trade_purpose_id)
      VALUES (${columns.map(() => "?").join(",")},?)`);
    for (const row of rows) insert.run(...columns.map(column => row[column]), purposes.get(row.trade_context_id));
    sqlite.exec("DROP TABLE trade_contexts; ALTER TABLE __trade_contexts_with_purpose RENAME TO trade_contexts");
    for (const object of objects) {
      if (object.name !== "uq_trade_contexts_components") sqlite.exec(object.sql);
    }
    sqlite.exec(`CREATE UNIQUE INDEX uq_trade_contexts_components ON trade_contexts
      (servicing_location_id,COALESCE(accounting_system_id,'NOT_APPLICABLE'),originating_system_id,trade_purpose_id)`);
    if (sqlite.prepare("PRAGMA foreign_key_check").all().length || sqlite.prepare("PRAGMA quick_check").get().quick_check !== "ok") {
      throw new Error("Trade Purpose migration failed database integrity checks.");
    }
    sqlite.exec("COMMIT");
  } catch (error) {
    sqlite.exec("ROLLBACK");
    throw error;
  } finally {
    sqlite.exec(`PRAGMA foreign_keys = ${foreignKeys ? "ON" : "OFF"}`);
  }
}

module.exports = { migrateTradeContextPurpose, APPROVED_CONTEXTS };
