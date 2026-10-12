"use strict";

const LEGACY_TABLE = "auto_management_admission_decisions";
const CURRENT_TABLE = "position_management_mode_decisions";

function migratePositionManagementModeDecisions(sqlite, schema) {
  if (!sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(LEGACY_TABLE)) return;

  const start = schema.indexOf(`CREATE TABLE IF NOT EXISTS ${CURRENT_TABLE}`);
  const end = schema.indexOf("CREATE TABLE IF NOT EXISTS client_deals", start);
  if (start < 0 || end < 0) throw new Error("Position Management decision schema was not found.");

  sqlite.exec("BEGIN IMMEDIATE");
  try {
    const objects = sqlite.prepare("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE sql IS NOT NULL").all();
    const dependency = objects.find(object => object.tbl_name !== LEGACY_TABLE
      && /\bauto_management_admission_decisions\b/i.test(object.sql));
    if (dependency) throw new Error(`Decision migration requires reviewing ${dependency.type} ${dependency.name}.`);

    const rows = sqlite.prepare(`SELECT decision.*, management.position_management_mode AS actual_mode
      FROM auto_management_admission_decisions decision
      LEFT JOIN trade_position_management management USING (trade_id, trade_type)
      ORDER BY decision_id`).all();
    const seen = new Set();
    for (const row of rows) {
      const identity = `${row.trade_type}:${row.trade_id}`;
      // Не превращаем старую оценку или историю переводов в выдуманный факт назначения.
      if (seen.has(identity) || row.decision_stage !== "INITIAL" || row.is_enforced !== 1) {
        throw new Error(`Decision history for ${identity} requires review before migration.`);
      }
      seen.add(identity);
      const expectedMode = { HELD: "MANUAL", RELEASED: "AUTO" }[row.admission_state];
      if (!expectedMode || expectedMode !== row.actual_mode) {
        throw new Error(`Decision mode does not match the immutable Trade mode for ${identity}.`);
      }
    }

    sqlite.exec(schema.slice(start, end));
    if (sqlite.prepare(`SELECT COUNT(*) AS count FROM ${CURRENT_TABLE}`).get().count && rows.length) {
      throw new Error("Both legacy and current Position Management decisions contain records.");
    }
    const insert = sqlite.prepare(`INSERT INTO position_management_mode_decisions
      (decision_id, trade_id, trade_type, mode_setting, position_management_mode,
       reason_codes_json, checks_json, decided_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    for (const row of rows) {
      const setting = ["MANUAL_ONLY", "REVIEW_REQUIRED"].includes(row.admission_mode) ? "MANUAL" : row.admission_mode;
      insert.run(row.decision_id, row.trade_id, row.trade_type, setting, row.actual_mode,
        row.reason_codes_json, row.checks_json, row.decided_at);
    }
    sqlite.exec(`DROP TABLE ${LEGACY_TABLE}`);
    if (sqlite.prepare("PRAGMA foreign_key_check").all().length
      || sqlite.prepare("PRAGMA quick_check").get().quick_check !== "ok") {
      throw new Error("Position Management decision migration failed database integrity checks.");
    }
    sqlite.exec("COMMIT");
  } catch (error) {
    sqlite.exec("ROLLBACK");
    throw error;
  }
}

module.exports = { migratePositionManagementModeDecisions };
