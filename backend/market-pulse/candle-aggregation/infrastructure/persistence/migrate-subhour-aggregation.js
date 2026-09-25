"use strict";

function migrateSubhourAggregation(database) {
  const name = "moex_iss_candle_aggregation_result";
  const table = database.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(name);
  if (!table) return false;
  const missing = ["FIVE_MINUTES", "FIFTEEN_MINUTES"].filter(timeframe => !table.sql.includes(`'${timeframe}'`));
  if (!missing.length) return false;
  const temporary = `${name}_subhour_upgrade`;
  const sql = table.sql.replace("'ONE_HOUR'", [...missing, "ONE_HOUR"].map(timeframe => `'${timeframe}'`).join(", "));
  const create = sql.replace(new RegExp(`^(CREATE TABLE(?: IF NOT EXISTS)?\\s+)(?:"${name}"|${name})`), `$1${temporary}`);
  if (sql === table.sql || create === sql) throw new Error("Cannot identify candle aggregation result definition.");
  database.exec("BEGIN IMMEDIATE");
  try {
    const dependentSql = database.prepare("SELECT sql FROM sqlite_master WHERE tbl_name=? AND type IN ('index','trigger') AND sql IS NOT NULL").all(name);
    database.exec(create);
    database.exec(`INSERT INTO ${temporary} SELECT * FROM ${name};
      DROP TABLE ${name};
      ALTER TABLE ${temporary} RENAME TO ${name};`);
    for (const entry of dependentSql) database.exec(entry.sql);
    database.exec("COMMIT");
    return true;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

module.exports = { migrateSubhourAggregation };
