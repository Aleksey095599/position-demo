"use strict";

const TABLES = ["moex_iss_aggregated_candles", "moex_iss_candle_aggregation_result"];

function migrateDailyAggregation(database) {
  const upgrades = TABLES.flatMap(name => {
    const table = database.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(name);
    if (!table) return [];
    const sql = table.sql.replace(/'FOUR_HOURS'(?!,\s*'ONE_DAY')/g, "'FOUR_HOURS', 'ONE_DAY'");
    return sql === table.sql ? [] : [{ name, sql }];
  });
  if (!upgrades.length) return false;
  database.exec("BEGIN IMMEDIATE");
  try {
    for (const { name, sql } of upgrades) {
      const dependentSql = database.prepare("SELECT sql FROM sqlite_master WHERE tbl_name=? AND type IN ('index','trigger') AND sql IS NOT NULL").all(name);
      const temporary = `${name}_daily_upgrade`;
      const create = sql.replace(new RegExp(`^(CREATE TABLE(?: IF NOT EXISTS)?\\s+)(?:"${name}"|${name})`), `$1${temporary}`);
      if (create === sql) throw new Error("Cannot identify candle aggregation table definition.");
      database.exec(create);
      database.exec(`INSERT INTO ${temporary} SELECT * FROM ${name};
        DROP TABLE ${name};
        ALTER TABLE ${temporary} RENAME TO ${name};`);
      for (const entry of dependentSql) database.exec(entry.sql);
    }
    database.exec("COMMIT");
    return true;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

module.exports = { migrateDailyAggregation };
