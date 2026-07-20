"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { URL } = require("node:url");
const { DatabaseSync } = require("node:sqlite");
const { MarketPulseSimulator } = require("./backend/market-pulse-simulation/market-pulse-simulator");

const HOST = "127.0.0.1";
const configuredPort = Number(process.env.DEMO_PORT);
const PORT = Number.isInteger(configuredPort) && configuredPort >= 1 && configuredPort <= 65535
  ? configuredPort
  : 8000;
const ROOT_DIR = __dirname;
const DATA_DIR = path.join(ROOT_DIR, "data");
const DATABASE_PATH = process.env.DEMO_DATABASE_PATH
  ? path.resolve(process.env.DEMO_DATABASE_PATH)
  : path.join(DATA_DIR, "demo.sqlite");
const SCHEMA_PATH = path.join(ROOT_DIR, "schema.sql");
const SEED_PATH = path.join(ROOT_DIR, "seed.sql");
const MAX_BODY_BYTES = 1024 * 1024;
const NOT_APPLICABLE_ACCOUNTING_SYSTEM_ID = "NOT_APPLICABLE";
const PRICING_MODES = ["AUTO_PRICED", "DEALER_PRICED", "DEALER_APPROVED"];
const SERVICING_LOCATION_TYPES = ["BRANCH", "HEAD_OFFICE"];
const PARTY_TYPES = ["CLIENT", "EXTERNAL_COUNTERPARTY", "INTERNAL_DESK"];
const PARTY_CODE_TYPES = ["INN", "OTHER"];
const SERVICING_LOCATION_ID_MAX_LENGTH = 10;
const SERVICING_LOCATION_NAME_MAX_LENGTH = 50;
const SERVICING_LOCATION_REGION_MAX_LENGTH = 50;
const SERVICING_LOCATION_TYPE_MAX_LENGTH = "HEAD_OFFICE".length;
const ACCOUNTING_SYSTEM_ID_MAX_LENGTH = 20;
const ACCOUNTING_SYSTEM_NAME_MAX_LENGTH = 50;
const EXECUTION_SYSTEM_ID_MAX_LENGTH = 30;
const EXECUTION_SYSTEM_NAME_MAX_LENGTH = 50;
const EXECUTION_SYSTEM_PRICING_MODE_MAX_LENGTH = "DEALER_APPROVED".length;
const CCY_OPTION_NAME_MAX_LENGTH = 20;
const CCY_OPTION_COUNTRY_MAX_LENGTH = 30;
const PARTY_CODE_MAX_LENGTH = 20;
const PARTY_NAME_MAX_LENGTH = 200;

fs.mkdirSync(path.dirname(DATABASE_PATH), { recursive: true });

const database = new DatabaseSync(DATABASE_PATH);
database.exec("PRAGMA foreign_keys = ON");
database.exec("PRAGMA journal_mode = WAL");
database.exec("PRAGMA busy_timeout = 5000");
const databaseAlreadyInitialized = Boolean(database.prepare(`
  SELECT 1 AS present
  FROM sqlite_master
  WHERE type = 'table' AND name = 'ccy_options'
`).get());
const servicingLocationsAlreadyInitialized = Boolean(database.prepare(`
  SELECT 1 AS present
  FROM sqlite_master
  WHERE type = 'table' AND name = 'servicing_locations'
`).get());
const accountingSystemsAlreadyInitialized = Boolean(database.prepare(`
  SELECT 1 AS present
  FROM sqlite_master
  WHERE type = 'table' AND name = 'accounting_systems'
`).get());
const executionSystemsAlreadyInitialized = Boolean(database.prepare(`
  SELECT 1 AS present
  FROM sqlite_master
  WHERE type = 'table' AND name = 'execution_systems'
`).get());
const executionContextsAlreadyInitialized = Boolean(database.prepare(`
  SELECT 1 AS present
  FROM sqlite_master
  WHERE type = 'table' AND name = 'execution_contexts'
`).get());
const tradingPartiesAlreadyInitialized = Boolean(database.prepare(`
  SELECT 1 AS present
  FROM sqlite_master
  WHERE type = 'table' AND name = 'trading_parties'
`).get());
const pricingRulesAlreadyInitialized = Boolean(database.prepare(`
  SELECT 1 AS present
  FROM sqlite_master
  WHERE type = 'table' AND name = 'pricing_rules'
`).get());
const clientFxDealsAlreadyInitialized = Boolean(database.prepare(`
  SELECT 1 AS present
  FROM sqlite_master
  WHERE type = 'table' AND name = 'client_fx_deals'
`).get());
database.exec(fs.readFileSync(SCHEMA_PATH, "utf8"));
dropClientFxDealTriggers(database);
dropLegacyTradingPartyExecutionContexts(database);
migrateCcyOptionsConstraints(database);
if (databaseAlreadyInitialized) {
  migrateLegacySimulationSettings(database);
}
migrateCcyPairOptionsConstraints(database);
migrateLegacyExecutionContextIds(database);
migrateServicingLocationTextLimits(database);
migrateAccountingSystemsShape(database);
migrateExecutionSystemsShape(database);
migrateTradingPartiesConstraints(database);
ensureClientFxDealTriggers(database);

if (!databaseAlreadyInitialized) {
  database.exec(fs.readFileSync(SEED_PATH, "utf8"));
} else {
  if (!servicingLocationsAlreadyInitialized) {
    seedInitialServicingLocations(database);
  }

  if (!accountingSystemsAlreadyInitialized) {
    seedInitialAccountingSystems(database);
  }

  if (!executionSystemsAlreadyInitialized) {
    seedInitialExecutionSystems(database);
  }

  if (!executionContextsAlreadyInitialized) {
    seedInitialExecutionContexts(database);
  }

  if (!tradingPartiesAlreadyInitialized) {
    seedInitialTradingParties(database);
  }

  if (!pricingRulesAlreadyInitialized) {
    seedInitialPricingRules(database);
  }

  if (!clientFxDealsAlreadyInitialized) {
    seedInitialClientFxDeals(database);
  }

}

function tableColumnNames(sqlite, tableName) {
  return new Set(sqlite.prepare(`PRAGMA table_info(${tableName})`).all().map(column => column.name));
}

function dropLegacyTradingPartyExecutionContexts(sqlite) {
  sqlite.exec("DROP TABLE IF EXISTS trading_party_execution_contexts");
}

function dropClientFxDealTriggers(sqlite) {
  sqlite.exec(`
    DROP TRIGGER IF EXISTS trg_client_fx_deals_require_client_insert;
    DROP TRIGGER IF EXISTS trg_client_fx_deals_require_client_update;
    DROP TRIGGER IF EXISTS trg_trading_parties_preserve_client_deals;
  `);
}

function ensureClientFxDealTriggers(sqlite) {
  sqlite.exec(`
    CREATE TRIGGER IF NOT EXISTS trg_client_fx_deals_require_client_insert
    BEFORE INSERT ON client_fx_deals
    FOR EACH ROW
    WHEN EXISTS
    (
        SELECT 1
        FROM trading_parties
        WHERE party_id = NEW.party_id AND party_type <> 'CLIENT'
    )
    BEGIN
        SELECT RAISE(ABORT, 'client_fx_deals.party_id must reference a CLIENT trading party');
    END;

    CREATE TRIGGER IF NOT EXISTS trg_client_fx_deals_require_client_update
    BEFORE UPDATE OF party_id ON client_fx_deals
    FOR EACH ROW
    WHEN EXISTS
    (
        SELECT 1
        FROM trading_parties
        WHERE party_id = NEW.party_id AND party_type <> 'CLIENT'
    )
    BEGIN
        SELECT RAISE(ABORT, 'client_fx_deals.party_id must reference a CLIENT trading party');
    END;

    CREATE TRIGGER IF NOT EXISTS trg_trading_parties_preserve_client_deals
    BEFORE UPDATE OF party_type ON trading_parties
    FOR EACH ROW
    WHEN NEW.party_type <> 'CLIENT'
        AND EXISTS (SELECT 1 FROM client_fx_deals WHERE party_id = OLD.party_id)
    BEGIN
        SELECT RAISE(ABORT, 'a Trading Party used by client_fx_deals must remain a CLIENT');
    END;
  `);
}

function migrateCcyOptionsConstraints(sqlite) {
  const tableDefinition = sqlite.prepare(`
    SELECT sql
    FROM sqlite_master
    WHERE type = 'table' AND name = 'ccy_options'
  `).get()?.sql || "";

  if (tableDefinition.includes("chk_ccy_options_latin_text")) {
    return;
  }

  const invalidRecord = sqlite.prepare(`
    SELECT ccy_code
    FROM ccy_options
    WHERE length(name) NOT BETWEEN 1 AND ?
      OR length(country) NOT BETWEEN 1 AND ?
      OR name != trim(name)
      OR country != trim(country)
      OR name GLOB '*[^A-Za-z ]*'
      OR country GLOB '*[^A-Za-z ]*'
      OR name GLOB '*  *'
      OR country GLOB '*  *'
    LIMIT 1
  `).get(CCY_OPTION_NAME_MAX_LENGTH, CCY_OPTION_COUNTRY_MAX_LENGTH);

  if (invalidRecord) {
    throw new Error(`Ccy ${invalidRecord.ccy_code} does not satisfy the configured name and country constraints.`);
  }

  sqlite.exec("PRAGMA foreign_keys = OFF");

  try {
    sqlite.exec("BEGIN IMMEDIATE");
    sqlite.exec(`
      CREATE TABLE ccy_options_migrated
      (
          ccy_code        TEXT    PRIMARY KEY,
          name            TEXT    NOT NULL,
          country         TEXT    NOT NULL,
          fraction_digits INTEGER NOT NULL DEFAULT 2,

          CONSTRAINT uq_ccy_options_name
              UNIQUE (name),
          CONSTRAINT chk_ccy_options_code
              CHECK (
                  length(ccy_code) = 3
                  AND ccy_code = upper(ccy_code)
                  AND ccy_code NOT GLOB '*[^A-Z]*'
              ),
          CONSTRAINT chk_ccy_options_latin_text
              CHECK (
                  length(name) BETWEEN 1 AND ${CCY_OPTION_NAME_MAX_LENGTH}
                  AND name = trim(name)
                  AND name NOT GLOB '*[^A-Za-z ]*'
                  AND name NOT GLOB '*  *'
                  AND length(country) BETWEEN 1 AND ${CCY_OPTION_COUNTRY_MAX_LENGTH}
                  AND country = trim(country)
                  AND country NOT GLOB '*[^A-Za-z ]*'
                  AND country NOT GLOB '*  *'
              ),
          CONSTRAINT chk_ccy_options_fraction_digits
              CHECK (fraction_digits BETWEEN 0 AND 10)
      );

      INSERT INTO ccy_options_migrated
        (ccy_code, name, country, fraction_digits)
      SELECT ccy_code, name, country, fraction_digits
      FROM ccy_options;

      DROP TABLE ccy_options;
      ALTER TABLE ccy_options_migrated RENAME TO ccy_options;
    `);

    const foreignKeyViolations = sqlite.prepare("PRAGMA foreign_key_check").all();

    if (foreignKeyViolations.length > 0) {
      throw new Error("Ccy Option constraint migration produced foreign key violations.");
    }

    sqlite.exec("COMMIT");
  } catch (error) {
    try {
      sqlite.exec("ROLLBACK");
    } catch {}

    throw error;
  } finally {
    sqlite.exec("PRAGMA foreign_keys = ON");
  }
}

function migrateCcyPairOptionsConstraints(sqlite) {
  const tableDefinition = sqlite.prepare(`
    SELECT sql
    FROM sqlite_master
    WHERE type = 'table' AND name = 'ccy_pair_options'
  `).get()?.sql || "";

  if (tableDefinition.includes("chk_ccy_pair_options_format")) {
    return;
  }

  const invalidRecord = sqlite.prepare(`
    SELECT ccy_pair_code
    FROM ccy_pair_options
    WHERE length(base_ccy_code) != 3
      OR base_ccy_code != upper(base_ccy_code)
      OR base_ccy_code GLOB '*[^A-Z]*'
      OR length(quote_ccy_code) != 3
      OR quote_ccy_code != upper(quote_ccy_code)
      OR quote_ccy_code GLOB '*[^A-Z]*'
      OR length(ccy_pair_code) != 7
      OR ccy_pair_code GLOB '*[^A-Z_]*'
      OR substr(ccy_pair_code, 4, 1) != '_'
      OR ccy_pair_code != base_ccy_code || '_' || quote_ccy_code
      OR base_ccy_code = quote_ccy_code
      OR default_quote_decimals NOT BETWEEN 0 AND 8
    LIMIT 1
  `).get();

  if (invalidRecord) {
    throw new Error(`Ccy Pair ${invalidRecord.ccy_pair_code} does not satisfy the configured format constraints.`);
  }

  sqlite.exec("PRAGMA foreign_keys = OFF");

  try {
    sqlite.exec("BEGIN IMMEDIATE");
    sqlite.exec(`
      CREATE TABLE ccy_pair_options_migrated
      (
          ccy_pair_code          TEXT    PRIMARY KEY,
          base_ccy_code          TEXT    NOT NULL,
          quote_ccy_code         TEXT    NOT NULL,
          default_quote_decimals INTEGER NOT NULL DEFAULT 4,

          CONSTRAINT fk_ccy_pair_options_base
              FOREIGN KEY (base_ccy_code)
                  REFERENCES ccy_options (ccy_code)
                  ON UPDATE RESTRICT
                  ON DELETE RESTRICT,
          CONSTRAINT fk_ccy_pair_options_quote
              FOREIGN KEY (quote_ccy_code)
                  REFERENCES ccy_options (ccy_code)
                  ON UPDATE RESTRICT
                  ON DELETE RESTRICT,
          CONSTRAINT uq_ccy_pair_options_pair
              UNIQUE (base_ccy_code, quote_ccy_code),
          CONSTRAINT chk_ccy_pair_options_format
              CHECK (
                  length(base_ccy_code) = 3
                  AND base_ccy_code = upper(base_ccy_code)
                  AND base_ccy_code NOT GLOB '*[^A-Z]*'
                  AND length(quote_ccy_code) = 3
                  AND quote_ccy_code = upper(quote_ccy_code)
                  AND quote_ccy_code NOT GLOB '*[^A-Z]*'
                  AND length(ccy_pair_code) = 7
                  AND ccy_pair_code NOT GLOB '*[^A-Z_]*'
                  AND substr(ccy_pair_code, 4, 1) = '_'
              ),
          CONSTRAINT chk_ccy_pair_options_code
              CHECK (ccy_pair_code = base_ccy_code || '_' || quote_ccy_code),
          CONSTRAINT chk_ccy_pair_options_different_currencies
              CHECK (base_ccy_code <> quote_ccy_code),
          CONSTRAINT chk_ccy_pair_options_quote_decimals
              CHECK (default_quote_decimals BETWEEN 0 AND 8)
      );

      INSERT INTO ccy_pair_options_migrated
        (ccy_pair_code, base_ccy_code, quote_ccy_code, default_quote_decimals)
      SELECT ccy_pair_code, base_ccy_code, quote_ccy_code, default_quote_decimals
      FROM ccy_pair_options;

      DROP TABLE ccy_pair_options;
      ALTER TABLE ccy_pair_options_migrated RENAME TO ccy_pair_options;

      CREATE INDEX idx_ccy_pair_options_base
          ON ccy_pair_options (base_ccy_code);
      CREATE INDEX idx_ccy_pair_options_quote
          ON ccy_pair_options (quote_ccy_code);
    `);

    const foreignKeyViolations = sqlite.prepare("PRAGMA foreign_key_check").all();

    if (foreignKeyViolations.length > 0) {
      throw new Error("Ccy Pair constraint migration produced foreign key violations.");
    }

    sqlite.exec("COMMIT");
  } catch (error) {
    try {
      sqlite.exec("ROLLBACK");
    } catch {}

    throw error;
  } finally {
    sqlite.exec("PRAGMA foreign_keys = ON");
  }
}

function migrateLegacyExecutionContextIds(sqlite) {
  const columns = sqlite.prepare("PRAGMA table_info(execution_contexts)").all();
  const columnByName = new Map(columns.map(column => [column.name, column]));
  const foreignKeys = sqlite.prepare("PRAGMA foreign_key_list(execution_contexts)").all();
  const idColumn = columnByName.get("execution_context_id");
  const hasExpectedForeignKey = (column, referencedTable, referencedColumn) => foreignKeys.some(foreignKey =>
    foreignKey.from === column
    && foreignKey.table === referencedTable
    && foreignKey.to === referencedColumn
    && foreignKey.on_update === "RESTRICT"
    && foreignKey.on_delete === "RESTRICT"
  );
  const requiresMigration = String(idColumn?.type || "").toUpperCase() !== "INTEGER"
    || String(columnByName.get("servicing_location_id")?.type || "").toUpperCase() !== "TEXT"
    || columnByName.get("servicing_location_id")?.notnull !== 1
    || String(columnByName.get("accounting_system_id")?.type || "").toUpperCase() !== "TEXT"
    || columnByName.get("accounting_system_id")?.notnull !== 0
    || String(columnByName.get("execution_system_id")?.type || "").toUpperCase() !== "TEXT"
    || columnByName.get("execution_system_id")?.notnull !== 1
    || !hasExpectedForeignKey("servicing_location_id", "servicing_locations", "servicing_location_id")
    || !hasExpectedForeignKey("accounting_system_id", "accounting_systems", "accounting_system_id")
    || !hasExpectedForeignKey("execution_system_id", "execution_systems", "execution_system_id");

  if (!requiresMigration) {
    return;
  }

  const preserveIntegerIds = String(idColumn?.type || "").toUpperCase() === "INTEGER";
  const contextInsertColumns = preserveIntegerIds
    ? "execution_context_id, servicing_location_id, accounting_system_id, execution_system_id"
    : "servicing_location_id, accounting_system_id, execution_system_id";
  const contextSelectColumns = contextInsertColumns;

  sqlite.exec("PRAGMA foreign_keys = OFF");

  try {
    sqlite.exec("BEGIN IMMEDIATE");
    sqlite.exec(`
      CREATE TABLE execution_contexts_migrated
      (
          execution_context_id  INTEGER PRIMARY KEY,
          servicing_location_id TEXT NOT NULL,
          accounting_system_id  TEXT,
          execution_system_id   TEXT NOT NULL,

          CONSTRAINT fk_execution_contexts_servicing_location
              FOREIGN KEY (servicing_location_id)
                  REFERENCES servicing_locations (servicing_location_id)
                  ON UPDATE RESTRICT
                  ON DELETE RESTRICT,
          CONSTRAINT fk_execution_contexts_accounting_system
              FOREIGN KEY (accounting_system_id)
                  REFERENCES accounting_systems (accounting_system_id)
                  ON UPDATE RESTRICT
                  ON DELETE RESTRICT,
          CONSTRAINT fk_execution_contexts_execution_system
              FOREIGN KEY (execution_system_id)
                  REFERENCES execution_systems (execution_system_id)
                  ON UPDATE RESTRICT
                  ON DELETE RESTRICT
      );

      INSERT INTO execution_contexts_migrated
        (${contextInsertColumns})
      SELECT ${contextSelectColumns}
      FROM execution_contexts
      ORDER BY execution_context_id;

      CREATE TEMP TABLE execution_context_id_map
      (
          legacy_execution_context_id TEXT PRIMARY KEY,
          execution_context_id        INTEGER NOT NULL UNIQUE
      );

      INSERT INTO execution_context_id_map
        (legacy_execution_context_id, execution_context_id)
      SELECT legacy.execution_context_id, migrated.execution_context_id
      FROM execution_contexts legacy
      INNER JOIN execution_contexts_migrated migrated
        ON migrated.servicing_location_id = legacy.servicing_location_id
        AND migrated.accounting_system_id IS legacy.accounting_system_id
        AND migrated.execution_system_id = legacy.execution_system_id;

      CREATE TABLE pricing_rules_migrated
      (
          pricing_rule_id      INTEGER PRIMARY KEY,
          party_id             INTEGER NOT NULL,
          execution_context_id INTEGER NOT NULL,
          ccy_pair_code        TEXT    NOT NULL,
          margin_percent       REAL    NOT NULL,

          CONSTRAINT fk_pricing_rules_party
              FOREIGN KEY (party_id)
                  REFERENCES trading_parties (party_id)
                  ON UPDATE RESTRICT
                  ON DELETE RESTRICT,
          CONSTRAINT fk_pricing_rules_execution_context
              FOREIGN KEY (execution_context_id)
                  REFERENCES execution_contexts (execution_context_id)
                  ON UPDATE RESTRICT
                  ON DELETE RESTRICT,
          CONSTRAINT fk_pricing_rules_ccy_pair
              FOREIGN KEY (ccy_pair_code)
                  REFERENCES ccy_pair_options (ccy_pair_code)
                  ON UPDATE RESTRICT
                  ON DELETE RESTRICT,
          CONSTRAINT uq_pricing_rules_scope
              UNIQUE (party_id, execution_context_id, ccy_pair_code),
          CONSTRAINT chk_pricing_rules_margin
              CHECK (margin_percent >= 0 AND margin_percent < 100)
      );

      INSERT INTO pricing_rules_migrated
        (pricing_rule_id, party_id, execution_context_id, ccy_pair_code, margin_percent)
      SELECT
        rule.pricing_rule_id,
        rule.party_id,
        context_map.execution_context_id,
        rule.ccy_pair_code,
        rule.margin_percent
      FROM pricing_rules rule
      INNER JOIN execution_context_id_map context_map
        ON context_map.legacy_execution_context_id = rule.execution_context_id;

      DROP TABLE pricing_rules;
      DROP TABLE execution_contexts;
      ALTER TABLE execution_contexts_migrated RENAME TO execution_contexts;
      ALTER TABLE pricing_rules_migrated RENAME TO pricing_rules;

      CREATE UNIQUE INDEX uq_execution_contexts_components
          ON execution_contexts
          (
              servicing_location_id,
              COALESCE(accounting_system_id, 'NOT_APPLICABLE'),
              execution_system_id
          );
      CREATE INDEX idx_execution_contexts_servicing_location
          ON execution_contexts (servicing_location_id);
      CREATE INDEX idx_execution_contexts_accounting_system
          ON execution_contexts (accounting_system_id);
      CREATE INDEX idx_execution_contexts_execution_system
          ON execution_contexts (execution_system_id);
      CREATE INDEX idx_pricing_rules_party
          ON pricing_rules (party_id);
      CREATE INDEX idx_pricing_rules_execution_context
          ON pricing_rules (execution_context_id);
      CREATE INDEX idx_pricing_rules_ccy_pair
          ON pricing_rules (ccy_pair_code);

      DROP TABLE execution_context_id_map;
    `);

    const foreignKeyViolations = sqlite.prepare("PRAGMA foreign_key_check").all();

    if (foreignKeyViolations.length > 0) {
      throw new Error("Execution Context ID migration produced foreign key violations.");
    }

    sqlite.exec("COMMIT");
  } catch (error) {
    try {
      sqlite.exec("ROLLBACK");
    } catch {}

    throw error;
  } finally {
    sqlite.exec("PRAGMA foreign_keys = ON");
  }
}

function migrateServicingLocationTextLimits(sqlite) {
  const tableDefinition = sqlite.prepare(`
    SELECT sql
    FROM sqlite_master
    WHERE type = 'table' AND name = 'servicing_locations'
  `).get()?.sql || "";

  const requiresMigration = !tableDefinition.includes("BETWEEN 1 AND 10")
    || !tableDefinition.includes("length(name) BETWEEN 1 AND 50")
    || !tableDefinition.includes("length(region) <= 50")
    || tableDefinition.includes("NOT GLOB '*[^0-9]*'");

  if (!requiresMigration) {
    return;
  }

  const invalidRecord = sqlite.prepare(`
    SELECT servicing_location_id
    FROM servicing_locations
    WHERE length(servicing_location_id) NOT BETWEEN 1 AND ?
      OR servicing_location_id != trim(servicing_location_id)
      OR length(name) NOT BETWEEN 1 AND ?
      OR name != trim(name)
      OR length(region) > ?
      OR region != trim(region)
    LIMIT 1
  `).get(
    SERVICING_LOCATION_ID_MAX_LENGTH,
    SERVICING_LOCATION_NAME_MAX_LENGTH,
    SERVICING_LOCATION_REGION_MAX_LENGTH
  );

  if (invalidRecord) {
    throw new Error(`Servicing Location ${invalidRecord.servicing_location_id} violates the configured field limits.`);
  }

  sqlite.exec("PRAGMA foreign_keys = OFF");

  try {
    sqlite.exec("BEGIN IMMEDIATE");
    sqlite.exec(`
      CREATE TABLE servicing_locations_migrated
      (
          servicing_location_id TEXT    PRIMARY KEY,
          name                  TEXT    NOT NULL,
          region                TEXT    NOT NULL DEFAULT '',
          location_type         TEXT    NOT NULL DEFAULT 'BRANCH',
          is_active             INTEGER NOT NULL DEFAULT 1,

          CONSTRAINT chk_servicing_locations_id
              CHECK (
                  length(servicing_location_id) BETWEEN 1 AND 10
                  AND servicing_location_id = trim(servicing_location_id)
              ),
          CONSTRAINT chk_servicing_locations_name
              CHECK (length(name) BETWEEN 1 AND 50 AND name = trim(name)),
          CONSTRAINT chk_servicing_locations_text_length
              CHECK (length(region) <= 50 AND region = trim(region)),
          CONSTRAINT chk_servicing_locations_type
              CHECK (location_type IN ('BRANCH', 'HEAD_OFFICE')),
          CONSTRAINT chk_servicing_locations_active
              CHECK (is_active IN (0, 1))
      );

      INSERT INTO servicing_locations_migrated
        (servicing_location_id, name, region, location_type, is_active)
      SELECT servicing_location_id, name, region, location_type, is_active
      FROM servicing_locations;

      DROP TABLE servicing_locations;
      ALTER TABLE servicing_locations_migrated RENAME TO servicing_locations;
    `);

    const foreignKeyViolations = sqlite.prepare("PRAGMA foreign_key_check").all();

    if (foreignKeyViolations.length > 0) {
      throw new Error("Servicing Location text-limit migration produced foreign key violations.");
    }

    sqlite.exec("COMMIT");
  } catch (error) {
    try {
      sqlite.exec("ROLLBACK");
    } catch {}

    throw error;
  } finally {
    sqlite.exec("PRAGMA foreign_keys = ON");
  }
}

function migrateAccountingSystemsShape(sqlite) {
  const tableDefinition = sqlite.prepare(`
    SELECT sql
    FROM sqlite_master
    WHERE type = 'table' AND name = 'accounting_systems'
  `).get()?.sql || "";

  const requiresMigration = tableDefinition.includes("description")
    || !tableDefinition.includes("BETWEEN 2 AND 20")
    || !tableDefinition.includes("BETWEEN 1 AND 50");

  if (!requiresMigration) {
    return;
  }

  const invalidRecord = sqlite.prepare(`
    SELECT accounting_system_id
    FROM accounting_systems
    WHERE length(accounting_system_id) > ? OR length(name) > ?
    LIMIT 1
  `).get(ACCOUNTING_SYSTEM_ID_MAX_LENGTH, ACCOUNTING_SYSTEM_NAME_MAX_LENGTH);

  if (invalidRecord) {
    throw new Error(`Accounting System ${invalidRecord.accounting_system_id} exceeds the configured text limit.`);
  }

  sqlite.exec("PRAGMA foreign_keys = OFF");

  try {
    sqlite.exec("BEGIN IMMEDIATE");
    sqlite.exec(`
      CREATE TABLE accounting_systems_migrated
      (
          accounting_system_id TEXT    PRIMARY KEY,
          name                 TEXT    NOT NULL,
          is_active            INTEGER NOT NULL DEFAULT 1,

          CONSTRAINT chk_accounting_systems_id
              CHECK (
                  length(accounting_system_id) BETWEEN 2 AND 20
                  AND accounting_system_id = upper(accounting_system_id)
                  AND accounting_system_id NOT GLOB '*[^A-Z0-9_-]*'
              ),
          CONSTRAINT chk_accounting_systems_name
              CHECK (length(trim(name)) BETWEEN 1 AND 50),
          CONSTRAINT chk_accounting_systems_active
              CHECK (is_active IN (0, 1))
      );

      INSERT INTO accounting_systems_migrated
        (accounting_system_id, name, is_active)
      SELECT accounting_system_id, name, is_active
      FROM accounting_systems;

      DROP TABLE accounting_systems;
      ALTER TABLE accounting_systems_migrated RENAME TO accounting_systems;
    `);

    const foreignKeyViolations = sqlite.prepare("PRAGMA foreign_key_check").all();

    if (foreignKeyViolations.length > 0) {
      throw new Error("Accounting System migration produced foreign key violations.");
    }

    sqlite.exec("COMMIT");
  } catch (error) {
    try {
      sqlite.exec("ROLLBACK");
    } catch {}

    throw error;
  } finally {
    sqlite.exec("PRAGMA foreign_keys = ON");
  }
}

function migrateExecutionSystemsShape(sqlite) {
  const tableDefinition = sqlite.prepare(`
    SELECT sql
    FROM sqlite_master
    WHERE type = 'table' AND name = 'execution_systems'
  `).get()?.sql || "";

  const requiresMigration = !tableDefinition.includes("BETWEEN 2 AND 30")
    || !tableDefinition.includes("BETWEEN 1 AND 50")
    || !tableDefinition.includes("length('DEALER_APPROVED')");

  if (!requiresMigration) {
    return;
  }

  const invalidRecord = sqlite.prepare(`
    SELECT execution_system_id
    FROM execution_systems
    WHERE length(execution_system_id) > ?
      OR length(trim(name)) NOT BETWEEN 1 AND ?
      OR pricing_mode NOT IN ('AUTO_PRICED', 'DEALER_PRICED', 'DEALER_APPROVED')
      OR length(pricing_mode) > ?
      OR is_active NOT IN (0, 1)
    LIMIT 1
  `).get(
    EXECUTION_SYSTEM_ID_MAX_LENGTH,
    EXECUTION_SYSTEM_NAME_MAX_LENGTH,
    EXECUTION_SYSTEM_PRICING_MODE_MAX_LENGTH
  );

  if (invalidRecord) {
    throw new Error(`Execution System ${invalidRecord.execution_system_id} exceeds the configured constraint.`);
  }

  sqlite.exec("PRAGMA foreign_keys = OFF");

  try {
    sqlite.exec("BEGIN IMMEDIATE");
    sqlite.exec(`
      CREATE TABLE execution_systems_migrated
      (
          execution_system_id TEXT    PRIMARY KEY,
          name                TEXT    NOT NULL,
          pricing_mode        TEXT    NOT NULL,
          is_active           INTEGER NOT NULL DEFAULT 1,

          CONSTRAINT chk_execution_systems_id
              CHECK (
                  length(execution_system_id) BETWEEN 2 AND 30
                  AND execution_system_id = upper(execution_system_id)
                  AND execution_system_id NOT GLOB '*[^A-Z0-9_-]*'
              ),
          CONSTRAINT chk_execution_systems_name
              CHECK (length(trim(name)) BETWEEN 1 AND 50),
          CONSTRAINT chk_execution_systems_pricing_mode
              CHECK (
                  pricing_mode IN ('AUTO_PRICED', 'DEALER_PRICED', 'DEALER_APPROVED')
                  AND length(pricing_mode) <= length('DEALER_APPROVED')
              ),
          CONSTRAINT chk_execution_systems_active
              CHECK (is_active IN (0, 1))
      );

      INSERT INTO execution_systems_migrated
        (execution_system_id, name, pricing_mode, is_active)
      SELECT execution_system_id, name, pricing_mode, is_active
      FROM execution_systems;

      DROP TABLE execution_systems;
      ALTER TABLE execution_systems_migrated RENAME TO execution_systems;
    `);

    const foreignKeyViolations = sqlite.prepare("PRAGMA foreign_key_check").all();

    if (foreignKeyViolations.length > 0) {
      throw new Error("Execution System migration produced foreign key violations.");
    }

    sqlite.exec("COMMIT");
  } catch (error) {
    try {
      sqlite.exec("ROLLBACK");
    } catch {}

    throw error;
  } finally {
    sqlite.exec("PRAGMA foreign_keys = ON");
  }
}

function migrateTradingPartiesConstraints(sqlite) {
  const tableDefinition = sqlite.prepare(`
    SELECT sql
    FROM sqlite_master
    WHERE type = 'table' AND name = 'trading_parties'
  `).get()?.sql || "";

  const requiresMigration = !tableDefinition.includes("length(party_code) <= 20")
    || !tableDefinition.includes("length(party_name) BETWEEN 1 AND 200")
    || !tableDefinition.includes("is_active IN (0, 1)");

  if (!requiresMigration) {
    return;
  }

  const invalidRecord = sqlite.prepare(`
    SELECT party_id
    FROM trading_parties
    WHERE party_type NOT IN ('CLIENT', 'EXTERNAL_COUNTERPARTY', 'INTERNAL_DESK')
      OR party_code_type NOT IN ('INN', 'OTHER')
      OR length(party_code) > ?
      OR (
        party_code_type = 'INN'
        AND (length(party_code) NOT BETWEEN 10 AND 12 OR party_code GLOB '*[^0-9]*')
      )
      OR (
        party_code_type = 'OTHER'
        AND (
          length(party_code) NOT BETWEEN 2 AND ?
          OR party_code != upper(party_code)
          OR party_code GLOB '*[^A-Z0-9_-]*'
        )
      )
      OR length(party_name) NOT BETWEEN 1 AND ?
      OR length(trim(party_name)) = 0
      OR is_active NOT IN (0, 1)
    LIMIT 1
  `).get(PARTY_CODE_MAX_LENGTH, PARTY_CODE_MAX_LENGTH, PARTY_NAME_MAX_LENGTH);

  if (invalidRecord) {
    throw new Error(`Trading Party ${invalidRecord.party_id} violates the configured constraint.`);
  }

  sqlite.exec("PRAGMA foreign_keys = OFF");

  try {
    sqlite.exec("BEGIN IMMEDIATE");
    sqlite.exec(`
      CREATE TABLE trading_parties_migrated
      (
          party_id        INTEGER PRIMARY KEY,
          party_type      TEXT    NOT NULL,
          party_code      TEXT    NOT NULL,
          party_code_type TEXT    NOT NULL,
          party_name      TEXT    NOT NULL,
          is_active       INTEGER NOT NULL DEFAULT 1,

          CONSTRAINT uq_trading_parties_code
              UNIQUE (party_code_type, party_code),
          CONSTRAINT chk_trading_parties_type
              CHECK (party_type IN ('CLIENT', 'EXTERNAL_COUNTERPARTY', 'INTERNAL_DESK')),
          CONSTRAINT chk_trading_parties_code_type
              CHECK (party_code_type IN ('INN', 'OTHER')),
          CONSTRAINT chk_trading_parties_code
              CHECK (
                  length(party_code) <= 20
                  AND (
                      (
                          party_code_type = 'INN'
                          AND length(party_code) BETWEEN 10 AND 12
                          AND party_code NOT GLOB '*[^0-9]*'
                      )
                      OR
                      (
                          party_code_type = 'OTHER'
                          AND length(party_code) BETWEEN 2 AND 20
                          AND party_code = upper(party_code)
                          AND party_code NOT GLOB '*[^A-Z0-9_-]*'
                      )
                  )
              ),
          CONSTRAINT chk_trading_parties_name
              CHECK (length(party_name) BETWEEN 1 AND 200 AND length(trim(party_name)) > 0),
          CONSTRAINT chk_trading_parties_active
              CHECK (is_active IN (0, 1))
      );

      INSERT INTO trading_parties_migrated
        (party_id, party_type, party_code, party_code_type, party_name, is_active)
      SELECT party_id, party_type, party_code, party_code_type, party_name, is_active
      FROM trading_parties;

      DROP TABLE trading_parties;
      ALTER TABLE trading_parties_migrated RENAME TO trading_parties;
    `);

    const foreignKeyViolations = sqlite.prepare("PRAGMA foreign_key_check").all();

    if (foreignKeyViolations.length > 0) {
      throw new Error("Trading Party constraint migration produced foreign key violations.");
    }

    sqlite.exec("COMMIT");
  } catch (error) {
    try {
      sqlite.exec("ROLLBACK");
    } catch {}

    throw error;
  } finally {
    sqlite.exec("PRAGMA foreign_keys = ON");
  }
}

function migrateLegacySimulationSettings(sqlite) {
  const pairColumns = tableColumnNames(sqlite, "ccy_pair_options");
  const legacyColumns = ["bid_min", "spread", "bid_max"];

  if (!legacyColumns.every(column => pairColumns.has(column))) {
    return;
  }

  sqlite.exec("PRAGMA foreign_keys = OFF");

  try {
    sqlite.exec("BEGIN IMMEDIATE");
    sqlite.exec(`
      INSERT OR REPLACE INTO market_quote_simulation_settings
        (ccy_pair_code, bid_min, spread, bid_max)
      SELECT ccy_pair_code, bid_min, spread, bid_max
      FROM ccy_pair_options
      WHERE bid_min IS NOT NULL AND spread IS NOT NULL AND bid_max IS NOT NULL;

      CREATE TABLE ccy_pair_options_migrated
      (
          ccy_pair_code          TEXT    PRIMARY KEY,
          base_ccy_code          TEXT    NOT NULL,
          quote_ccy_code         TEXT    NOT NULL,
          default_quote_decimals INTEGER NOT NULL DEFAULT 4,

          CONSTRAINT fk_ccy_pair_options_base
              FOREIGN KEY (base_ccy_code)
                  REFERENCES ccy_options (ccy_code)
                  ON UPDATE RESTRICT
                  ON DELETE RESTRICT,
          CONSTRAINT fk_ccy_pair_options_quote
              FOREIGN KEY (quote_ccy_code)
                  REFERENCES ccy_options (ccy_code)
                  ON UPDATE RESTRICT
                  ON DELETE RESTRICT,
          CONSTRAINT uq_ccy_pair_options_pair
              UNIQUE (base_ccy_code, quote_ccy_code),
          CONSTRAINT chk_ccy_pair_options_code
              CHECK (ccy_pair_code = base_ccy_code || '_' || quote_ccy_code),
          CONSTRAINT chk_ccy_pair_options_different_currencies
              CHECK (base_ccy_code <> quote_ccy_code),
          CONSTRAINT chk_ccy_pair_options_quote_decimals
              CHECK (default_quote_decimals BETWEEN 0 AND 8)
      );

      INSERT INTO ccy_pair_options_migrated
        (ccy_pair_code, base_ccy_code, quote_ccy_code, default_quote_decimals)
      SELECT ccy_pair_code, base_ccy_code, quote_ccy_code, default_quote_decimals
      FROM ccy_pair_options;

      DROP TABLE ccy_pair_options;
      ALTER TABLE ccy_pair_options_migrated RENAME TO ccy_pair_options;

      CREATE INDEX idx_ccy_pair_options_base
          ON ccy_pair_options (base_ccy_code);
      CREATE INDEX idx_ccy_pair_options_quote
          ON ccy_pair_options (quote_ccy_code);
    `);

    const foreignKeyViolations = sqlite.prepare("PRAGMA foreign_key_check").all();

    if (foreignKeyViolations.length > 0) {
      throw new Error("SQLite migration produced foreign key violations.");
    }

    sqlite.exec("COMMIT");
  } catch (error) {
    try {
      sqlite.exec("ROLLBACK");
    } catch {}

    throw error;
  } finally {
    sqlite.exec("PRAGMA foreign_keys = ON");
  }
}

function seedInitialServicingLocations(sqlite) {
  sqlite.exec(`
    INSERT INTO servicing_locations
      (servicing_location_id, name, region, location_type, is_active)
    VALUES
      ('000', 'Bank Central Office', 'Middle-earth, Mordor', 'HEAD_OFFICE', 1),
      ('001', 'Emerald City Branch', 'Oz', 'BRANCH', 1),
      ('002', 'Neverland Harbor Branch', 'Neverland', 'BRANCH', 1),
      ('1234', 'Wonderland Gate Branch', 'Wonderland', 'BRANCH', 1),
      ('7777', 'Narnia Lantern Branch', 'Narnia', 'BRANCH', 1),
      ('8888', 'Shire Hill Branch', 'Middle-earth', 'BRANCH', 1);
  `);
}

function seedInitialAccountingSystems(sqlite) {
  sqlite.exec(`
    INSERT INTO accounting_systems
      (accounting_system_id, name, is_active)
    VALUES
      ('AFINA', 'Afina Core Ledger', 1),
      ('CTF3', 'CTF3 Treasury Settlement', 1);
  `);
}

function seedInitialExecutionSystems(sqlite) {
  sqlite.exec(`
    INSERT INTO execution_systems
      (execution_system_id, name, pricing_mode, is_active)
    VALUES
      ('CLICK_TRADE_EFX', 'Click Trade eFX', 'AUTO_PRICED', 1),
      ('RFQ', 'Request for Quote', 'DEALER_APPROVED', 1),
      ('MANUAL_CLIENT_DEAL_ENTRY', 'Manual Client Deal Entry', 'DEALER_PRICED', 1);
  `);
}

function seedInitialExecutionContexts(sqlite) {
  sqlite.exec(`
    INSERT INTO execution_contexts
      (servicing_location_id, accounting_system_id, execution_system_id)
    VALUES
      ('002', 'AFINA', 'CLICK_TRADE_EFX'),
      ('002', 'AFINA', 'RFQ'),
      ('002', 'CTF3', 'MANUAL_CLIENT_DEAL_ENTRY'),
      ('1234', 'AFINA', 'RFQ'),
      ('001', 'CTF3', 'CLICK_TRADE_EFX');
  `);
}

function seedInitialTradingParties(sqlite) {
  sqlite.exec(`
    INSERT INTO trading_parties
      (party_type, party_code, party_code_type, party_name, is_active)
    VALUES
      ('CLIENT', '7701234567', 'INN', 'Romashka Company', 1),
      ('CLIENT', '7812345678', 'INN', 'Vasilek Company', 1),
      ('CLIENT', '5409876543', 'INN', 'Gladiolus Company', 1);
  `);
}

function seedInitialPricingRules(sqlite) {
  const rules = [
    ["7701234567", "002", "AFINA", "CLICK_TRADE_EFX", "EUR_USD", 0.10],
    ["7701234567", "002", "AFINA", "RFQ", "EUR_USD", 0.12],
    ["7701234567", "002", "CTF3", "MANUAL_CLIENT_DEAL_ENTRY", "EUR_USD", 0.08],
    ["7812345678", "1234", "AFINA", "RFQ", "EUR_USD", 0.05],
    ["5409876543", "001", "CTF3", "CLICK_TRADE_EFX", "EUR_USD", 0.20]
  ];
  const insert = sqlite.prepare(`
    INSERT OR IGNORE INTO pricing_rules
      (party_id, execution_context_id, ccy_pair_code, margin_percent)
    SELECT p.party_id, e.execution_context_id, pair.ccy_pair_code, ?
    FROM trading_parties p
    INNER JOIN execution_contexts e
      ON e.servicing_location_id = ?
      AND COALESCE(e.accounting_system_id, 'NOT_APPLICABLE') = ?
      AND e.execution_system_id = ?
    INNER JOIN ccy_pair_options pair ON pair.ccy_pair_code = ?
    WHERE p.party_code_type = 'INN' AND p.party_code = ?
  `);

  rules.forEach(([
    partyCode,
    servicingLocationId,
    accountingSystemId,
    executionSystemId,
    ccyPairCode,
    marginPercent
  ]) => {
    insert.run(
      marginPercent,
      servicingLocationId,
      accountingSystemId,
      executionSystemId,
      ccyPairCode,
      partyCode
    );
  });
}

function seedInitialClientFxDeals(sqlite) {
  sqlite.prepare(`
    INSERT INTO client_fx_deals
      (
        entry_timestamp,
        party_id,
        trade_date,
        ccy_pair_code,
        side,
        base_ccy_amount,
        quote_ccy_amount,
        trade_rate,
        tenor,
        base_ccy_value_date,
        quote_ccy_value_date
      )
    SELECT
      '2026-07-15T09:30:00.000Z',
      party_id,
      '2026-07-15',
      'EUR_USD',
      'BUY',
      30000000,
      33693000,
      1.1231,
      'TOD',
      '2026-07-15',
      '2026-07-15'
    FROM trading_parties
    WHERE party_code_type = 'INN' AND party_code = '7701234567'
  `).run();
}

function ccyOptions() {
  return database.prepare(`
    SELECT
      c.ccy_code AS code,
      c.name,
      c.country,
      c.fraction_digits AS fractionDigits,
      (
        SELECT COUNT(*)
        FROM ccy_pair_options p
        WHERE p.base_ccy_code = c.ccy_code OR p.quote_ccy_code = c.ccy_code
      ) AS pairCount
    FROM ccy_options c
    ORDER BY c.ccy_code
  `).all();
}

function ccyPairOptions() {
  return database.prepare(`
    SELECT
      p.ccy_pair_code AS pairCode,
      p.base_ccy_code AS baseCcy,
      p.quote_ccy_code AS quoteCcy,
      p.base_ccy_code || '/' || p.quote_ccy_code AS currencyPair,
      p.default_quote_decimals AS defaultQuoteDecimals,
      (
        SELECT COUNT(*)
        FROM pricing_rules r
        WHERE r.ccy_pair_code = p.ccy_pair_code
      ) AS pricingRulesCount,
      s.bid_min AS bidMin,
      s.spread,
      s.bid_max AS bidMax
    FROM ccy_pair_options p
    LEFT JOIN market_quote_simulation_settings s
      ON s.ccy_pair_code = p.ccy_pair_code
    ORDER BY p.base_ccy_code, p.quote_ccy_code
  `).all();
}

function ccyPairOption(pairCode) {
  return database.prepare(`
    SELECT
      p.ccy_pair_code AS pairCode,
      p.base_ccy_code AS baseCcy,
      p.quote_ccy_code AS quoteCcy,
      p.base_ccy_code || '/' || p.quote_ccy_code AS currencyPair,
      p.default_quote_decimals AS defaultQuoteDecimals,
      (
        SELECT COUNT(*)
        FROM pricing_rules r
        WHERE r.ccy_pair_code = p.ccy_pair_code
      ) AS pricingRulesCount,
      s.bid_min AS bidMin,
      s.spread,
      s.bid_max AS bidMax
    FROM ccy_pair_options p
    LEFT JOIN market_quote_simulation_settings s
      ON s.ccy_pair_code = p.ccy_pair_code
    WHERE p.ccy_pair_code = ?
  `).get(pairCode) || null;
}

function marketQuoteSimulationSettings(pairCode) {
  return database.prepare(`
    SELECT
      ccy_pair_code AS pairCode,
      bid_min AS bidMin,
      spread,
      bid_max AS bidMax
    FROM market_quote_simulation_settings
    WHERE ccy_pair_code = ?
  `).get(pairCode) || null;
}

function marketPulseSimulationConfigurations() {
  return database.prepare(`
    SELECT
      p.ccy_pair_code AS pairCode,
      p.base_ccy_code || '/' || p.quote_ccy_code AS currencyPair,
      p.default_quote_decimals AS defaultQuoteDecimals,
      s.bid_min AS bidMin,
      s.spread,
      s.bid_max AS bidMax
    FROM ccy_pair_options p
    INNER JOIN market_quote_simulation_settings s
      ON s.ccy_pair_code = p.ccy_pair_code
    ORDER BY p.ccy_pair_code
  `).all();
}

function servicingLocations() {
  return database.prepare(`
    SELECT
      s.servicing_location_id AS servicingLocationId,
      s.name,
      s.region,
      s.location_type AS type,
      s.is_active AS active,
      (
        SELECT COUNT(*)
        FROM execution_contexts c
        WHERE c.servicing_location_id = s.servicing_location_id
      ) AS executionContextCount
    FROM servicing_locations s
    ORDER BY s.servicing_location_id
  `).all().map(location => ({
    ...location,
    active: location.active === 1
  }));
}

function servicingLocation(locationId) {
  return servicingLocations().find(location => location.servicingLocationId === locationId) || null;
}

function accountingSystems() {
  return database.prepare(`
    SELECT
      a.accounting_system_id AS accountingSystemId,
      a.name,
      a.is_active AS active,
      (
        SELECT COUNT(*)
        FROM execution_contexts c
        WHERE c.accounting_system_id = a.accounting_system_id
      ) AS executionContextCount
    FROM accounting_systems a
    ORDER BY a.accounting_system_id
  `).all().map(system => ({
    ...system,
    active: system.active === 1
  }));
}

function accountingSystem(accountingSystemId) {
  return accountingSystems().find(system => system.accountingSystemId === accountingSystemId) || null;
}

function executionSystems() {
  return database.prepare(`
    SELECT
      e.execution_system_id AS executionSystemId,
      e.name,
      e.pricing_mode AS pricingMode,
      e.is_active AS active,
      (
        SELECT COUNT(*)
        FROM execution_contexts c
        WHERE c.execution_system_id = e.execution_system_id
      ) AS executionContextCount
    FROM execution_systems e
    ORDER BY e.execution_system_id
  `).all().map(system => ({
    ...system,
    active: system.active === 1
  }));
}

function executionSystem(executionSystemId) {
  return executionSystems().find(system => system.executionSystemId === executionSystemId) || null;
}

function executionContexts() {
  return database.prepare(`
    SELECT
      execution_context_id AS executionContextId,
      servicing_location_id AS servicingLocationId,
      COALESCE(accounting_system_id, 'NOT_APPLICABLE') AS accountingSystemId,
      execution_system_id AS executionSystemId
    FROM execution_contexts
    ORDER BY execution_context_id
  `).all();
}

function executionContext(executionContextId) {
  return executionContexts().find(context => context.executionContextId === Number(executionContextId)) || null;
}

function tradingParties() {
  return database.prepare(`
    SELECT
      party_id AS partyId,
      party_type AS partyType,
      party_code AS partyCode,
      party_code_type AS partyCodeType,
      party_name AS partyName,
      is_active AS active
    FROM trading_parties
    ORDER BY party_name, party_code
  `).all().map(party => ({ ...party, active: party.active === 1 }));
}

function tradingParty(partyId) {
  return tradingParties().find(party => party.partyId === Number(partyId)) || null;
}

function pricingRules() {
  return database.prepare(`
    SELECT
      r.pricing_rule_id AS pricingRuleId,
      r.party_id AS partyId,
      p.party_code AS partyCode,
      p.party_code_type AS partyCodeType,
      p.party_name AS partyName,
      r.execution_context_id AS executionContextId,
      r.ccy_pair_code AS ccyPairCode,
      c.base_ccy_code || '/' || c.quote_ccy_code AS currencyPair,
      r.margin_percent AS marginPercent
    FROM pricing_rules r
    INNER JOIN trading_parties p ON p.party_id = r.party_id
    INNER JOIN ccy_pair_options c ON c.ccy_pair_code = r.ccy_pair_code
    ORDER BY p.party_name, c.ccy_pair_code, r.execution_context_id
  `).all();
}

function pricingRule(pricingRuleId) {
  return pricingRules().find(rule => rule.pricingRuleId === Number(pricingRuleId)) || null;
}

function clientFxDeals() {
  return database.prepare(`
    SELECT
      d.client_deal_id AS clientDealId,
      d.entry_timestamp AS entryTimestamp,
      d.party_id AS partyId,
      p.party_code AS clientCode,
      p.party_code_type AS clientCodeType,
      p.party_name AS clientName,
      d.trade_date AS tradeDate,
      d.ccy_pair_code AS ccyPairCode,
      pair.base_ccy_code || '/' || pair.quote_ccy_code AS currencyPair,
      d.side,
      d.base_ccy_amount AS baseCcyAmount,
      d.quote_ccy_amount AS quoteCcyAmount,
      d.trade_rate AS tradeRate,
      d.tenor,
      d.base_ccy_value_date AS baseCcyValueDate,
      d.quote_ccy_value_date AS quoteCcyValueDate
    FROM client_fx_deals d
    INNER JOIN trading_parties p ON p.party_id = d.party_id
    INNER JOIN ccy_pair_options pair ON pair.ccy_pair_code = d.ccy_pair_code
    ORDER BY d.client_deal_id
  `).all();
}

function clientFxDeal(clientDealId) {
  return clientFxDeals().find(deal => deal.clientDealId === Number(clientDealId)) || null;
}

const marketPulseSimulator = new MarketPulseSimulator({
  loadConfigurations: marketPulseSimulationConfigurations
});

function sendJson(response, statusCode, body) {
  const json = JSON.stringify(body);
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(json),
    "Cache-Control": "no-store"
  });
  response.end(json);
}

function sendText(response, statusCode, text, contentType = "text/plain; charset=utf-8") {
  response.writeHead(statusCode, {
    "Content-Type": contentType,
    "Content-Length": Buffer.byteLength(text),
    "Cache-Control": "no-store"
  });
  response.end(text);
}

function openMarketPulseSimulationStream(request, response) {
  response.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no"
  });
  response.write("retry: 2000\n\n");

  const unsubscribe = marketPulseSimulator.subscribe(snapshot => {
    response.write(`event: snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`);
  });
  const heartbeat = setInterval(() => response.write(": keep-alive\n\n"), 15000);
  heartbeat.unref?.();
  const close = () => {
    clearInterval(heartbeat);
    unsubscribe();
  };

  request.on("close", close);
}

function apiError(response, statusCode, code, message) {
  sendJson(response, statusCode, { code, message });
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;

  for await (const chunk of request) {
    size += chunk.length;

    if (size > MAX_BODY_BYTES) {
      const error = new Error("Request body is too large.");
      error.statusCode = 413;
      throw error;
    }

    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const error = new Error("Request body must contain valid JSON.");
    error.statusCode = 400;
    throw error;
  }
}

function normalizedCcyCode(value) {
  return String(value || "").trim().toUpperCase();
}

function normalizedText(value) {
  return String(value || "").trim();
}

function normalizedCcyText(value) {
  return normalizedText(value).replace(/\s+/g, " ");
}

function normalizedServicingLocationId(value) {
  return normalizedText(value);
}

function isValidServicingLocationId(value) {
  return value.length >= 1 && value.length <= SERVICING_LOCATION_ID_MAX_LENGTH;
}

function normalizedAccountingSystemId(value) {
  return normalizedText(value).toUpperCase();
}

function normalizedExecutionSystemId(value) {
  return normalizedText(value).toUpperCase();
}

function normalizedExecutionContextId(value) {
  return integerInRange(value, 1, Number.MAX_SAFE_INTEGER);
}

function normalizedPartyType(value) {
  return normalizedText(value).toUpperCase();
}

function normalizedPartyCodeType(value) {
  return normalizedText(value).toUpperCase();
}

function normalizedPartyCode(value, codeType) {
  const code = normalizedText(value);
  return codeType === "INN" ? code : code.toUpperCase();
}

function integerInRange(value, min, max) {
  const number = Number(value);
  return Number.isInteger(number) && number >= min && number <= max ? number : null;
}

function nullablePositiveNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : NaN;
}

function validateCcyPayload(body, includeCode) {
  const code = normalizedCcyCode(body.code);
  const name = normalizedCcyText(body.name);
  const country = normalizedCcyText(body.country);
  const fractionDigits = integerInRange(body.fractionDigits, 0, 10);

  if (includeCode && !/^[A-Z]{3}$/.test(code)) {
    return { error: "Ccy Code must contain exactly three uppercase letters." };
  }

  if (!/^[A-Za-z]+(?: [A-Za-z]+)*$/.test(name) || name.length > CCY_OPTION_NAME_MAX_LENGTH) {
    return { error: `Name must contain from one to ${CCY_OPTION_NAME_MAX_LENGTH} Latin letters and spaces.` };
  }

  if (!/^[A-Za-z]+(?: [A-Za-z]+)*$/.test(country) || country.length > CCY_OPTION_COUNTRY_MAX_LENGTH) {
    return { error: `Country must contain from one to ${CCY_OPTION_COUNTRY_MAX_LENGTH} Latin letters and spaces.` };
  }

  if (fractionDigits === null) {
    return { error: "Fraction Digits must be a whole number from 0 to 10." };
  }

  return { code, name, country, fractionDigits };
}

function validatePairCreatePayload(body) {
  const baseCcy = normalizedCcyCode(body.baseCcy);
  const quoteCcy = normalizedCcyCode(body.quoteCcy);
  const defaultQuoteDecimals = integerInRange(body.defaultQuoteDecimals, 0, 8);

  if (!/^[A-Z]{3}$/.test(baseCcy) || !/^[A-Z]{3}$/.test(quoteCcy)) {
    return { error: "Base Ccy and Quote Ccy must contain three uppercase letters." };
  }

  if (baseCcy === quoteCcy) {
    return { error: "Base Ccy and Quote Ccy must be different." };
  }

  if (defaultQuoteDecimals === null) {
    return { error: "Default Quote Decimals must be a whole number from 0 to 8." };
  }

  return {
    pairCode: `${baseCcy}_${quoteCcy}`,
    baseCcy,
    quoteCcy,
    defaultQuoteDecimals
  };
}

function validateServicingLocationPayload(body) {
  const servicingLocationId = normalizedServicingLocationId(body.servicingLocationId);
  const name = normalizedText(body.name);
  const region = normalizedText(body.region);
  const type = normalizedText(body.type).toUpperCase();
  const active = typeof body.active === "boolean" ? body.active : null;

  if (!isValidServicingLocationId(servicingLocationId)) {
    return { error: `Servicing Location ID must contain from one to ${SERVICING_LOCATION_ID_MAX_LENGTH} characters.` };
  }

  if (!name) {
    return { error: "Name must not be blank." };
  }

  if (name.length > SERVICING_LOCATION_NAME_MAX_LENGTH || region.length > SERVICING_LOCATION_REGION_MAX_LENGTH) {
    return { error: `Name and Region must contain at most ${SERVICING_LOCATION_NAME_MAX_LENGTH} characters.` };
  }

  if (!SERVICING_LOCATION_TYPES.includes(type) || type.length > SERVICING_LOCATION_TYPE_MAX_LENGTH) {
    return { error: "Type must be BRANCH or HEAD_OFFICE." };
  }

  if (active === null) {
    return { error: "Active must be a boolean value." };
  }

  return { servicingLocationId, name, region, type, active };
}

function validateAccountingSystemPayload(body) {
  const accountingSystemId = normalizedAccountingSystemId(body.accountingSystemId);
  const name = normalizedText(body.name);
  const active = typeof body.active === "boolean" ? body.active : null;

  if (!new RegExp(`^[A-Z0-9_-]{2,${ACCOUNTING_SYSTEM_ID_MAX_LENGTH}}$`).test(accountingSystemId)) {
    return { error: `Accounting System ID must contain from 2 to ${ACCOUNTING_SYSTEM_ID_MAX_LENGTH} uppercase letters, digits, underscores or hyphens.` };
  }

  if (!name) {
    return { error: "Name must not be blank." };
  }

  if (name.length > ACCOUNTING_SYSTEM_NAME_MAX_LENGTH) {
    return { error: `Name must contain at most ${ACCOUNTING_SYSTEM_NAME_MAX_LENGTH} characters.` };
  }

  if (active === null) {
    return { error: "Active must be a boolean value." };
  }

  return { accountingSystemId, name, active };
}

function validateExecutionSystemPayload(body) {
  const executionSystemId = normalizedExecutionSystemId(body.executionSystemId);
  const name = normalizedText(body.name);
  const pricingMode = normalizedText(body.pricingMode).toUpperCase();
  const active = typeof body.active === "boolean" ? body.active : null;

  if (!new RegExp(`^[A-Z0-9_-]{2,${EXECUTION_SYSTEM_ID_MAX_LENGTH}}$`).test(executionSystemId)) {
    return { error: `Execution System ID must contain from 2 to ${EXECUTION_SYSTEM_ID_MAX_LENGTH} uppercase letters, digits, underscores or hyphens.` };
  }

  if (!name || name.length > EXECUTION_SYSTEM_NAME_MAX_LENGTH) {
    return { error: `Name must contain from one to ${EXECUTION_SYSTEM_NAME_MAX_LENGTH} characters.` };
  }

  if (!PRICING_MODES.includes(pricingMode) || pricingMode.length > EXECUTION_SYSTEM_PRICING_MODE_MAX_LENGTH) {
    return { error: "Pricing Mode must be AUTO_PRICED, DEALER_PRICED or DEALER_APPROVED." };
  }

  if (active === null) {
    return { error: "Active must be a boolean value." };
  }

  return { executionSystemId, name, pricingMode, active };
}

function validateExecutionContextPayload(body) {
  const servicingLocationId = normalizedServicingLocationId(body.servicingLocationId);
  const accountingSystemId = normalizedAccountingSystemId(body.accountingSystemId);
  const executionSystemId = normalizedExecutionSystemId(body.executionSystemId);

  if (!isValidServicingLocationId(servicingLocationId)) {
    return { error: `Servicing Location ID must contain from one to ${SERVICING_LOCATION_ID_MAX_LENGTH} characters.` };
  }

  if (!new RegExp(`^[A-Z0-9_-]{2,${ACCOUNTING_SYSTEM_ID_MAX_LENGTH}}$`).test(accountingSystemId)) {
    return { error: "Accounting System ID is invalid." };
  }

  if (!new RegExp(`^[A-Z0-9_-]{2,${EXECUTION_SYSTEM_ID_MAX_LENGTH}}$`).test(executionSystemId)) {
    return { error: "Execution System ID is invalid." };
  }

  return {
    servicingLocationId,
    accountingSystemId,
    accountingSystemDatabaseId: accountingSystemId === NOT_APPLICABLE_ACCOUNTING_SYSTEM_ID
      ? null
      : accountingSystemId,
    executionSystemId
  };
}

function validateTradingPartyPayload(body) {
  const partyType = normalizedPartyType(body.partyType);
  const partyCodeType = normalizedPartyCodeType(body.partyCodeType);
  const partyCode = normalizedPartyCode(body.partyCode, partyCodeType);
  const partyName = normalizedText(body.partyName);
  const active = typeof body.active === "boolean" ? body.active : null;

  if (!PARTY_TYPES.includes(partyType)) {
    return { error: "Party Type must be CLIENT, EXTERNAL_COUNTERPARTY or INTERNAL_DESK." };
  }

  if (!PARTY_CODE_TYPES.includes(partyCodeType)) {
    return { error: "Party Code Type must be INN or OTHER." };
  }

  const validPartyCode = partyCodeType === "INN"
    ? /^\d{10,12}$/.test(partyCode)
    : new RegExp(`^[A-Z0-9_-]{2,${PARTY_CODE_MAX_LENGTH}}$`).test(partyCode);

  if (!validPartyCode) {
    return {
      error: partyCodeType === "INN"
        ? "Party Code with type INN must contain 10 to 12 digits."
        : `Party Code with type OTHER must contain from 2 to ${PARTY_CODE_MAX_LENGTH} uppercase letters, digits, underscores or hyphens.`
    };
  }

  if (!partyName || partyName.length > PARTY_NAME_MAX_LENGTH) {
    return { error: `Party Name must contain from 1 to ${PARTY_NAME_MAX_LENGTH} characters.` };
  }

  if (active === null) {
    return { error: "Active must be a boolean value." };
  }

  return { partyType, partyCode, partyCodeType, partyName, active };
}

function validatePricingRulePayload(body) {
  const partyId = integerInRange(body.partyId, 1, Number.MAX_SAFE_INTEGER);
  const executionContextId = normalizedExecutionContextId(body.executionContextId);
  const ccyPairCode = normalizedText(body.ccyPairCode).toUpperCase();
  const marginPercent = Number(body.marginPercent);

  if (partyId === null) {
    return { error: "Party ID must be a positive integer." };
  }

  if (!executionContextId) {
    return { error: "Execution Context ID is invalid." };
  }

  if (!/^[A-Z]{3}_[A-Z]{3}$/.test(ccyPairCode)) {
    return { error: "Ccy Pair Code must look like EUR_USD." };
  }

  if (!Number.isFinite(marginPercent) || marginPercent < 0 || marginPercent >= 100) {
    return { error: "Margin Percent must be a number from 0 up to, but not including, 100." };
  }

  return { partyId, executionContextId, ccyPairCode, marginPercent };
}

function isIsoCalendarDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isIsoUtcTimestamp(value) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    return false;
  }

  const timestamp = new Date(value);
  return !Number.isNaN(timestamp.getTime()) && timestamp.toISOString() === value;
}

function validateClientFxDealPayload(body) {
  const entryTimestamp = normalizedText(body.entryTimestamp);
  const partyId = integerInRange(body.partyId, 1, Number.MAX_SAFE_INTEGER);
  const tradeDate = normalizedText(body.tradeDate);
  const ccyPairCode = normalizedText(body.ccyPairCode).toUpperCase();
  const side = normalizedText(body.side).toUpperCase();
  const baseCcyAmount = Number(body.baseCcyAmount);
  const quoteCcyAmount = Number(body.quoteCcyAmount);
  const tradeRate = Number(body.tradeRate);
  const tenor = normalizedText(body.tenor).toUpperCase();
  const baseCcyValueDate = normalizedText(body.baseCcyValueDate);
  const quoteCcyValueDate = normalizedText(body.quoteCcyValueDate);

  if (!isIsoUtcTimestamp(entryTimestamp)) {
    return { error: "Entry Timestamp must be an ISO UTC timestamp with milliseconds." };
  }

  if (partyId === null) {
    return { error: "Party ID must be a positive integer." };
  }

  if (!isIsoCalendarDate(tradeDate)) {
    return { error: "Trade Date must use YYYY-MM-DD format and be a valid date." };
  }

  if (!/^[A-Z]{3}_[A-Z]{3}$/.test(ccyPairCode)) {
    return { error: "Ccy Pair Code must look like EUR_USD." };
  }

  if (!["BUY", "SELL"].includes(side)) {
    return { error: "Side must be BUY or SELL." };
  }

  if (![baseCcyAmount, quoteCcyAmount, tradeRate].every(value => Number.isFinite(value) && value > 0)) {
    return { error: "Base Ccy Amount, Quote Ccy Amount and Trade Rate must be positive numbers." };
  }

  if (!/^[A-Z0-9_]{1,10}$/.test(tenor)) {
    return { error: "Tenor must contain from 1 to 10 uppercase letters, digits or underscores." };
  }

  if (!isIsoCalendarDate(baseCcyValueDate) || !isIsoCalendarDate(quoteCcyValueDate)) {
    return { error: "Base and Quote Ccy Value Dates must use YYYY-MM-DD format and be valid dates." };
  }

  return {
    entryTimestamp,
    partyId,
    tradeDate,
    ccyPairCode,
    side,
    baseCcyAmount,
    quoteCcyAmount,
    tradeRate,
    tenor,
    baseCcyValueDate,
    quoteCcyValueDate
  };
}

function executionContextReferenceError(payload) {
  if (!servicingLocation(payload.servicingLocationId)) {
    return `Servicing Location ${payload.servicingLocationId} was not found.`;
  }

  if (payload.accountingSystemDatabaseId !== null && !accountingSystem(payload.accountingSystemId)) {
    return `Accounting System ${payload.accountingSystemId} was not found.`;
  }

  if (!executionSystem(payload.executionSystemId)) {
    return `Execution System ${payload.executionSystemId} was not found.`;
  }

  return "";
}

function pricingRuleReferenceError(payload) {
  if (!tradingParty(payload.partyId)) {
    return `Trading Party ${payload.partyId} was not found.`;
  }

  if (!executionContext(payload.executionContextId)) {
    return `Execution Context ${payload.executionContextId} was not found.`;
  }

  if (!ccyPairOption(payload.ccyPairCode)) {
    return `Ccy Pair ${payload.ccyPairCode} was not found.`;
  }

  return "";
}

function clientFxDealReferenceError(payload) {
  const party = tradingParty(payload.partyId);

  if (!party) {
    return `Trading Party ${payload.partyId} was not found.`;
  }

  if (party.partyType !== "CLIENT") {
    return `Trading Party ${payload.partyId} must have type CLIENT.`;
  }

  if (!ccyPairOption(payload.ccyPairCode)) {
    return `Ccy Pair ${payload.ccyPairCode} was not found.`;
  }

  return "";
}

function databaseConstraintMessage(error) {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes("a Trading Party used by client_fx_deals must remain a CLIENT")) {
    return {
      status: 409,
      code: "TRADING_PARTY_HAS_CLIENT_FX_DEALS",
      message: "A Trading Party used by Client FX Deals must remain a CLIENT."
    };
  }

  if (message.includes("client_fx_deals.party_id must reference a CLIENT trading party")) {
    return {
      status: 400,
      code: "INVALID_CLIENT_FX_DEAL_PARTY",
      message: "A Client FX Deal must reference a Trading Party with type CLIENT."
    };
  }

  if (message.includes("FOREIGN KEY constraint failed")) {
    return { status: 409, code: "REFERENCE_IN_USE", message: "The record is referenced by another table." };
  }

  if (message.includes("UNIQUE constraint failed")) {
    return { status: 409, code: "DUPLICATE_RECORD", message: "A record with the same key already exists." };
  }

  if (message.includes("CHECK constraint failed")) {
    return { status: 400, code: "CONSTRAINT_VIOLATION", message: "The record violates a database constraint." };
  }

  return { status: 500, code: "DATABASE_ERROR", message: "The database operation failed." };
}

function handleDatabaseError(response, error) {
  const mapped = databaseConstraintMessage(error);
  apiError(response, mapped.status, mapped.code, mapped.message);
}

function tableNames() {
  return database.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `).all().map(row => row.name);
}

function quotedIdentifier(identifier) {
  if (!tableNames().includes(identifier)) {
    return null;
  }

  return `"${identifier.replaceAll('"', '""')}"`;
}

function databaseTableDetails(tableName) {
  const quotedTable = quotedIdentifier(tableName);

  if (!quotedTable) {
    return null;
  }

  const schemaRow = database.prepare(`
    SELECT sql
    FROM sqlite_master
    WHERE type = 'table' AND name = ?
  `).get(tableName);
  const columns = database.prepare(`PRAGMA table_info(${quotedTable})`).all().map(column => ({
    position: column.cid,
    name: column.name,
    type: column.type,
    notNull: column.notnull === 1,
    defaultValue: column.dflt_value,
    primaryKey: column.pk > 0
  }));
  const foreignKeys = database.prepare(`PRAGMA foreign_key_list(${quotedTable})`).all().map(key => ({
    from: key.from,
    referencedTable: key.table,
    referencedColumn: key.to,
    onUpdate: key.on_update,
    onDelete: key.on_delete
  }));
  const rows = database.prepare(`SELECT * FROM ${quotedTable} LIMIT 200`).all();
  const rowCount = database.prepare(`SELECT COUNT(*) AS count FROM ${quotedTable}`).get().count;

  return {
    tableName,
    createSql: schemaRow?.sql || "",
    columns,
    foreignKeys,
    rows,
    rowCount
  };
}

async function handleApi(request, response, url) {
  const pathname = url.pathname;
  const method = request.method || "GET";

  if (method === "GET" && pathname === "/api/health") {
    sendJson(response, 200, { status: "UP", database: "data/demo.sqlite" });
    return true;
  }

  if (method === "GET" && pathname === "/api/v1/market-pulse-simulation/status") {
    sendJson(response, 200, marketPulseSimulator.snapshot());
    return true;
  }

  if (method === "POST" && pathname === "/api/v1/market-pulse-simulation/start") {
    try {
      sendJson(response, 200, marketPulseSimulator.start());
    } catch (error) {
      if (error?.code === "SIMULATION_NOT_CONFIGURED") {
        apiError(response, 409, error.code, error.message);
      } else {
        throw error;
      }
    }

    return true;
  }

  if (method === "POST" && pathname === "/api/v1/market-pulse-simulation/stop") {
    sendJson(response, 200, marketPulseSimulator.stop());
    return true;
  }

  if (method === "GET" && pathname === "/api/v1/market-pulse-simulation/stream") {
    openMarketPulseSimulationStream(request, response);
    return true;
  }

  if (method === "GET" && pathname === "/api/bootstrap.js") {
    const bootstrap = JSON.stringify({
      available: true,
      ccyOptions: ccyOptions(),
      ccyPairOptions: ccyPairOptions(),
      servicingLocations: servicingLocations(),
      accountingSystems: accountingSystems(),
      executionSystems: executionSystems(),
      executionContexts: executionContexts(),
      tradingParties: tradingParties(),
      pricingRules: pricingRules(),
      clientFxDeals: clientFxDeals()
    }).replace(/</g, "\\u003c");
    sendText(
      response,
      200,
      `window.__DEMO_API_BOOTSTRAP__ = ${bootstrap};\n`,
      "text/javascript; charset=utf-8"
    );
    return true;
  }

  if (pathname === "/api/v1/client-fx-deals" && method === "GET") {
    sendJson(response, 200, clientFxDeals());
    return true;
  }

  if (pathname === "/api/v1/client-fx-deals" && method === "POST") {
    const body = await readJsonBody(request);
    const payload = validateClientFxDealPayload(body);

    if (payload.error) {
      apiError(response, 400, "INVALID_CLIENT_FX_DEAL", payload.error);
      return true;
    }

    const referenceError = clientFxDealReferenceError(payload);

    if (referenceError) {
      apiError(response, 400, "INVALID_CLIENT_FX_DEAL_REFERENCE", referenceError);
      return true;
    }

    try {
      const result = database.prepare(`
        INSERT INTO client_fx_deals
          (
            entry_timestamp,
            party_id,
            trade_date,
            ccy_pair_code,
            side,
            base_ccy_amount,
            quote_ccy_amount,
            trade_rate,
            tenor,
            base_ccy_value_date,
            quote_ccy_value_date
          )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        payload.entryTimestamp,
        payload.partyId,
        payload.tradeDate,
        payload.ccyPairCode,
        payload.side,
        payload.baseCcyAmount,
        payload.quoteCcyAmount,
        payload.tradeRate,
        payload.tenor,
        payload.baseCcyValueDate,
        payload.quoteCcyValueDate
      );
      sendJson(response, 201, clientFxDeal(Number(result.lastInsertRowid)));
    } catch (error) {
      handleDatabaseError(response, error);
    }

    return true;
  }

  const clientFxDealMatch = /^\/api\/v1\/client-fx-deals\/(\d+)$/.exec(pathname);

  if (clientFxDealMatch && method === "GET") {
    const deal = clientFxDeal(Number(clientFxDealMatch[1]));

    if (!deal) {
      apiError(response, 404, "CLIENT_FX_DEAL_NOT_FOUND", "Client FX Deal was not found.");
    } else {
      sendJson(response, 200, deal);
    }

    return true;
  }

  if (clientFxDealMatch && method === "PUT") {
    const clientDealId = Number(clientFxDealMatch[1]);

    if (!clientFxDeal(clientDealId)) {
      apiError(response, 404, "CLIENT_FX_DEAL_NOT_FOUND", "Client FX Deal was not found.");
      return true;
    }

    const body = await readJsonBody(request);
    const payload = validateClientFxDealPayload(body);

    if (payload.error) {
      apiError(response, 400, "INVALID_CLIENT_FX_DEAL", payload.error);
      return true;
    }

    const referenceError = clientFxDealReferenceError(payload);

    if (referenceError) {
      apiError(response, 400, "INVALID_CLIENT_FX_DEAL_REFERENCE", referenceError);
      return true;
    }

    try {
      database.prepare(`
        UPDATE client_fx_deals
        SET
          entry_timestamp = ?,
          party_id = ?,
          trade_date = ?,
          ccy_pair_code = ?,
          side = ?,
          base_ccy_amount = ?,
          quote_ccy_amount = ?,
          trade_rate = ?,
          tenor = ?,
          base_ccy_value_date = ?,
          quote_ccy_value_date = ?
        WHERE client_deal_id = ?
      `).run(
        payload.entryTimestamp,
        payload.partyId,
        payload.tradeDate,
        payload.ccyPairCode,
        payload.side,
        payload.baseCcyAmount,
        payload.quoteCcyAmount,
        payload.tradeRate,
        payload.tenor,
        payload.baseCcyValueDate,
        payload.quoteCcyValueDate,
        clientDealId
      );
      sendJson(response, 200, clientFxDeal(clientDealId));
    } catch (error) {
      handleDatabaseError(response, error);
    }

    return true;
  }

  if (clientFxDealMatch && method === "DELETE") {
    const clientDealId = Number(clientFxDealMatch[1]);
    const result = database.prepare("DELETE FROM client_fx_deals WHERE client_deal_id = ?").run(clientDealId);

    if (result.changes === 0) {
      apiError(response, 404, "CLIENT_FX_DEAL_NOT_FOUND", "Client FX Deal was not found.");
    } else {
      response.writeHead(204);
      response.end();
    }

    return true;
  }

  if (pathname === "/api/v1/pricing-rules" && method === "GET") {
    sendJson(response, 200, pricingRules());
    return true;
  }

  if (pathname === "/api/v1/pricing-rules" && method === "POST") {
    const body = await readJsonBody(request);
    const payload = validatePricingRulePayload(body);

    if (payload.error) {
      apiError(response, 400, "INVALID_PRICING_RULE", payload.error);
      return true;
    }

    const referenceError = pricingRuleReferenceError(payload);

    if (referenceError) {
      apiError(response, 400, "INVALID_PRICING_RULE_REFERENCE", referenceError);
      return true;
    }

    try {
      const result = database.prepare(`
        INSERT INTO pricing_rules
          (party_id, execution_context_id, ccy_pair_code, margin_percent)
        VALUES (?, ?, ?, ?)
      `).run(
        payload.partyId,
        payload.executionContextId,
        payload.ccyPairCode,
        payload.marginPercent
      );
      sendJson(response, 201, pricingRule(Number(result.lastInsertRowid)));
    } catch (error) {
      handleDatabaseError(response, error);
    }

    return true;
  }

  const pricingRuleMatch = /^\/api\/v1\/pricing-rules\/(\d+)$/.exec(pathname);

  if (pricingRuleMatch && method === "PUT") {
    const pricingRuleId = Number(pricingRuleMatch[1]);
    const current = pricingRule(pricingRuleId);

    if (!current) {
      apiError(response, 404, "PRICING_RULE_NOT_FOUND", `Pricing Rule ${pricingRuleId} was not found.`);
      return true;
    }

    const body = await readJsonBody(request);
    const payload = validatePricingRulePayload(body);

    if (payload.error) {
      apiError(response, 400, "INVALID_PRICING_RULE", payload.error);
      return true;
    }

    const referenceError = pricingRuleReferenceError(payload);

    if (referenceError) {
      apiError(response, 400, "INVALID_PRICING_RULE_REFERENCE", referenceError);
      return true;
    }

    try {
      database.prepare(`
        UPDATE pricing_rules
        SET party_id = ?, execution_context_id = ?, ccy_pair_code = ?, margin_percent = ?
        WHERE pricing_rule_id = ?
      `).run(
        payload.partyId,
        payload.executionContextId,
        payload.ccyPairCode,
        payload.marginPercent,
        pricingRuleId
      );
      sendJson(response, 200, pricingRule(pricingRuleId));
    } catch (error) {
      handleDatabaseError(response, error);
    }

    return true;
  }

  if (pricingRuleMatch && method === "DELETE") {
    const pricingRuleId = Number(pricingRuleMatch[1]);
    const result = database.prepare("DELETE FROM pricing_rules WHERE pricing_rule_id = ?").run(pricingRuleId);

    if (result.changes === 0) {
      apiError(response, 404, "PRICING_RULE_NOT_FOUND", `Pricing Rule ${pricingRuleId} was not found.`);
      return true;
    }

    response.writeHead(204);
    response.end();
    return true;
  }

  if (pathname === "/api/v1/trading-parties" && method === "GET") {
    sendJson(response, 200, tradingParties());
    return true;
  }

  if (pathname === "/api/v1/trading-parties" && method === "POST") {
    const body = await readJsonBody(request);
    const payload = validateTradingPartyPayload(body);

    if (payload.error) {
      apiError(response, 400, "INVALID_TRADING_PARTY", payload.error);
      return true;
    }

    try {
      const result = database.prepare(`
        INSERT INTO trading_parties
          (party_type, party_code, party_code_type, party_name, is_active)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        payload.partyType,
        payload.partyCode,
        payload.partyCodeType,
        payload.partyName,
        payload.active ? 1 : 0
      );
      const partyId = Number(result.lastInsertRowid);
      sendJson(response, 201, tradingParty(partyId));
    } catch (error) {
      handleDatabaseError(response, error);
    }

    return true;
  }

  const tradingPartyMatch = /^\/api\/v1\/trading-parties\/(\d+)$/.exec(pathname);

  if (tradingPartyMatch && method === "PUT") {
    const partyId = Number(tradingPartyMatch[1]);
    const current = tradingParty(partyId);

    if (!current) {
      apiError(response, 404, "TRADING_PARTY_NOT_FOUND", `Trading Party ${partyId} was not found.`);
      return true;
    }

    const body = await readJsonBody(request);
    const payload = validateTradingPartyPayload(body);

    if (payload.error) {
      apiError(response, 400, "INVALID_TRADING_PARTY", payload.error);
      return true;
    }

    try {
      database.prepare(`
        UPDATE trading_parties
        SET party_type = ?, party_code = ?, party_code_type = ?, party_name = ?, is_active = ?
        WHERE party_id = ?
      `).run(
        payload.partyType,
        payload.partyCode,
        payload.partyCodeType,
        payload.partyName,
        payload.active ? 1 : 0,
        partyId
      );
      sendJson(response, 200, tradingParty(partyId));
    } catch (error) {
      handleDatabaseError(response, error);
    }

    return true;
  }

  if (tradingPartyMatch && method === "DELETE") {
    const partyId = Number(tradingPartyMatch[1]);
    const current = tradingParty(partyId);

    if (!current) {
      apiError(response, 404, "TRADING_PARTY_NOT_FOUND", `Trading Party ${partyId} was not found.`);
      return true;
    }

    try {
      database.prepare("DELETE FROM trading_parties WHERE party_id = ?").run(partyId);
      response.writeHead(204);
      response.end();
    } catch (error) {
      handleDatabaseError(response, error);
    }

    return true;
  }

  if (pathname === "/api/v1/servicing-locations" && method === "GET") {
    sendJson(response, 200, servicingLocations());
    return true;
  }

  if (pathname === "/api/v1/servicing-locations" && method === "POST") {
    const body = await readJsonBody(request);
    const payload = validateServicingLocationPayload(body);

    if (payload.error) {
      apiError(response, 400, "INVALID_SERVICING_LOCATION", payload.error);
      return true;
    }

    try {
      database.prepare(`
        INSERT INTO servicing_locations
          (servicing_location_id, name, region, location_type, is_active)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        payload.servicingLocationId,
        payload.name,
        payload.region,
        payload.type,
        payload.active ? 1 : 0
      );
      sendJson(response, 201, servicingLocation(payload.servicingLocationId));
    } catch (error) {
      handleDatabaseError(response, error);
    }

    return true;
  }

  const servicingLocationMatch = /^\/api\/v1\/servicing-locations\/([^/]+)$/.exec(pathname);
  const servicingLocationId = servicingLocationMatch ? decodeURIComponent(servicingLocationMatch[1]) : null;

  if (servicingLocationMatch && method === "PUT") {
    const currentId = servicingLocationId;
    const current = servicingLocation(currentId);

    if (!current) {
      apiError(response, 404, "SERVICING_LOCATION_NOT_FOUND", `Servicing Location ${currentId} was not found.`);
      return true;
    }

    const body = await readJsonBody(request);
    const payload = validateServicingLocationPayload(body);

    if (payload.error) {
      apiError(response, 400, "INVALID_SERVICING_LOCATION", payload.error);
      return true;
    }

    if (payload.servicingLocationId !== currentId && current.executionContextCount > 0) {
      apiError(
        response,
        409,
        "SERVICING_LOCATION_IN_USE",
        `Servicing Location ${currentId} ID cannot be changed while it is used by Execution Context.`
      );
      return true;
    }

    try {
      database.prepare(`
        UPDATE servicing_locations
        SET servicing_location_id = ?, name = ?, region = ?, location_type = ?, is_active = ?
        WHERE servicing_location_id = ?
      `).run(
        payload.servicingLocationId,
        payload.name,
        payload.region,
        payload.type,
        payload.active ? 1 : 0,
        currentId
      );
      sendJson(response, 200, servicingLocation(payload.servicingLocationId));
    } catch (error) {
      handleDatabaseError(response, error);
    }

    return true;
  }

  if (servicingLocationMatch && method === "DELETE") {
    const locationId = servicingLocationId;
    const current = servicingLocation(locationId);

    if (!current) {
      apiError(response, 404, "SERVICING_LOCATION_NOT_FOUND", `Servicing Location ${locationId} was not found.`);
      return true;
    }

    if (current.executionContextCount > 0) {
      apiError(
        response,
        409,
        "SERVICING_LOCATION_IN_USE",
        `Servicing Location ${locationId} cannot be deleted while it is used by Execution Context.`
      );
      return true;
    }

    database.prepare("DELETE FROM servicing_locations WHERE servicing_location_id = ?").run(locationId);
    response.writeHead(204);
    response.end();
    return true;
  }

  if (pathname === "/api/v1/accounting-systems" && method === "GET") {
    sendJson(response, 200, accountingSystems());
    return true;
  }

  if (pathname === "/api/v1/accounting-systems" && method === "POST") {
    const body = await readJsonBody(request);
    const payload = validateAccountingSystemPayload(body);

    if (payload.error) {
      apiError(response, 400, "INVALID_ACCOUNTING_SYSTEM", payload.error);
      return true;
    }

    try {
      database.prepare(`
        INSERT INTO accounting_systems
          (accounting_system_id, name, is_active)
        VALUES (?, ?, ?)
      `).run(
        payload.accountingSystemId,
        payload.name,
        payload.active ? 1 : 0
      );
      sendJson(response, 201, accountingSystem(payload.accountingSystemId));
    } catch (error) {
      handleDatabaseError(response, error);
    }

    return true;
  }

  const accountingSystemMatch = /^\/api\/v1\/accounting-systems\/([A-Za-z0-9_-]{2,20})$/.exec(pathname);

  if (accountingSystemMatch && method === "PUT") {
    const currentId = normalizedAccountingSystemId(accountingSystemMatch[1]);
    const current = accountingSystem(currentId);

    if (!current) {
      apiError(response, 404, "ACCOUNTING_SYSTEM_NOT_FOUND", `Accounting System ${currentId} was not found.`);
      return true;
    }

    const body = await readJsonBody(request);
    const payload = validateAccountingSystemPayload(body);

    if (payload.error) {
      apiError(response, 400, "INVALID_ACCOUNTING_SYSTEM", payload.error);
      return true;
    }

    if (payload.accountingSystemId !== currentId && current.executionContextCount > 0) {
      apiError(
        response,
        409,
        "ACCOUNTING_SYSTEM_IN_USE",
        `Accounting System ${currentId} ID cannot be changed while it is used by Execution Context.`
      );
      return true;
    }

    try {
      database.prepare(`
        UPDATE accounting_systems
        SET accounting_system_id = ?, name = ?, is_active = ?
        WHERE accounting_system_id = ?
      `).run(
        payload.accountingSystemId,
        payload.name,
        payload.active ? 1 : 0,
        currentId
      );
      sendJson(response, 200, accountingSystem(payload.accountingSystemId));
    } catch (error) {
      handleDatabaseError(response, error);
    }

    return true;
  }

  if (accountingSystemMatch && method === "DELETE") {
    const accountingSystemId = normalizedAccountingSystemId(accountingSystemMatch[1]);
    const current = accountingSystem(accountingSystemId);

    if (!current) {
      apiError(response, 404, "ACCOUNTING_SYSTEM_NOT_FOUND", `Accounting System ${accountingSystemId} was not found.`);
      return true;
    }

    if (current.executionContextCount > 0) {
      apiError(
        response,
        409,
        "ACCOUNTING_SYSTEM_IN_USE",
        `Accounting System ${accountingSystemId} cannot be deleted while it is used by Execution Context.`
      );
      return true;
    }

    database.prepare("DELETE FROM accounting_systems WHERE accounting_system_id = ?").run(accountingSystemId);
    response.writeHead(204);
    response.end();
    return true;
  }

  if (pathname === "/api/v1/execution-systems" && method === "GET") {
    sendJson(response, 200, executionSystems());
    return true;
  }

  if (pathname === "/api/v1/execution-systems" && method === "POST") {
    const body = await readJsonBody(request);
    const payload = validateExecutionSystemPayload(body);

    if (payload.error) {
      apiError(response, 400, "INVALID_EXECUTION_SYSTEM", payload.error);
      return true;
    }

    try {
      database.prepare(`
        INSERT INTO execution_systems
          (execution_system_id, name, pricing_mode, is_active)
        VALUES (?, ?, ?, ?)
      `).run(
        payload.executionSystemId,
        payload.name,
        payload.pricingMode,
        payload.active ? 1 : 0
      );
      sendJson(response, 201, executionSystem(payload.executionSystemId));
    } catch (error) {
      handleDatabaseError(response, error);
    }

    return true;
  }

  const executionSystemMatch = /^\/api\/v1\/execution-systems\/([A-Za-z0-9_-]{2,30})$/.exec(pathname);

  if (executionSystemMatch && method === "PUT") {
    const currentId = normalizedExecutionSystemId(executionSystemMatch[1]);
    const current = executionSystem(currentId);

    if (!current) {
      apiError(response, 404, "EXECUTION_SYSTEM_NOT_FOUND", `Execution System ${currentId} was not found.`);
      return true;
    }

    const body = await readJsonBody(request);
    const payload = validateExecutionSystemPayload(body);

    if (payload.error) {
      apiError(response, 400, "INVALID_EXECUTION_SYSTEM", payload.error);
      return true;
    }

    if (payload.executionSystemId !== currentId && current.executionContextCount > 0) {
      apiError(
        response,
        409,
        "EXECUTION_SYSTEM_IN_USE",
        `Execution System ${currentId} ID cannot be changed while it is used by Execution Context.`
      );
      return true;
    }

    try {
      database.prepare(`
        UPDATE execution_systems
        SET execution_system_id = ?, name = ?, pricing_mode = ?, is_active = ?
        WHERE execution_system_id = ?
      `).run(
        payload.executionSystemId,
        payload.name,
        payload.pricingMode,
        payload.active ? 1 : 0,
        currentId
      );
      sendJson(response, 200, executionSystem(payload.executionSystemId));
    } catch (error) {
      handleDatabaseError(response, error);
    }

    return true;
  }

  if (executionSystemMatch && method === "DELETE") {
    const executionSystemId = normalizedExecutionSystemId(executionSystemMatch[1]);
    const current = executionSystem(executionSystemId);

    if (!current) {
      apiError(response, 404, "EXECUTION_SYSTEM_NOT_FOUND", `Execution System ${executionSystemId} was not found.`);
      return true;
    }

    if (current.executionContextCount > 0) {
      apiError(
        response,
        409,
        "EXECUTION_SYSTEM_IN_USE",
        `Execution System ${executionSystemId} cannot be deleted while it is used by Execution Context.`
      );
      return true;
    }

    database.prepare("DELETE FROM execution_systems WHERE execution_system_id = ?").run(executionSystemId);
    response.writeHead(204);
    response.end();
    return true;
  }

  if (pathname === "/api/v1/execution-contexts" && method === "GET") {
    sendJson(response, 200, executionContexts());
    return true;
  }

  if (pathname === "/api/v1/execution-contexts" && method === "POST") {
    const body = await readJsonBody(request);
    const payload = validateExecutionContextPayload(body);

    if (payload.error) {
      apiError(response, 400, "INVALID_EXECUTION_CONTEXT", payload.error);
      return true;
    }

    const referenceError = executionContextReferenceError(payload);

    if (referenceError) {
      apiError(response, 409, "EXECUTION_CONTEXT_REFERENCE_NOT_FOUND", referenceError);
      return true;
    }

    try {
      const result = database.prepare(`
        INSERT INTO execution_contexts
          (servicing_location_id, accounting_system_id, execution_system_id)
        VALUES (?, ?, ?)
      `).run(
        payload.servicingLocationId,
        payload.accountingSystemDatabaseId,
        payload.executionSystemId
      );
      sendJson(response, 201, executionContext(Number(result.lastInsertRowid)));
    } catch (error) {
      handleDatabaseError(response, error);
    }

    return true;
  }

  const executionContextMatch = /^\/api\/v1\/execution-contexts\/(\d+)$/.exec(pathname);
  const currentExecutionContextId = executionContextMatch
    ? normalizedExecutionContextId(executionContextMatch[1])
    : null;

  if (executionContextMatch && method === "PUT") {
    const current = currentExecutionContextId ? executionContext(currentExecutionContextId) : null;

    if (!current) {
      apiError(response, 404, "EXECUTION_CONTEXT_NOT_FOUND", "Execution Context was not found.");
      return true;
    }

    const body = await readJsonBody(request);
    const payload = validateExecutionContextPayload(body);

    if (payload.error) {
      apiError(response, 400, "INVALID_EXECUTION_CONTEXT", payload.error);
      return true;
    }

    const referenceError = executionContextReferenceError(payload);

    if (referenceError) {
      apiError(response, 409, "EXECUTION_CONTEXT_REFERENCE_NOT_FOUND", referenceError);
      return true;
    }

    try {
      database.prepare(`
        UPDATE execution_contexts
        SET servicing_location_id = ?,
            accounting_system_id = ?,
            execution_system_id = ?
        WHERE execution_context_id = ?
      `).run(
        payload.servicingLocationId,
        payload.accountingSystemDatabaseId,
        payload.executionSystemId,
        currentExecutionContextId
      );
      sendJson(response, 200, executionContext(currentExecutionContextId));
    } catch (error) {
      handleDatabaseError(response, error);
    }

    return true;
  }

  if (executionContextMatch && method === "DELETE") {
    const current = currentExecutionContextId ? executionContext(currentExecutionContextId) : null;

    if (!current) {
      apiError(response, 404, "EXECUTION_CONTEXT_NOT_FOUND", "Execution Context was not found.");
      return true;
    }

    try {
      database.prepare("DELETE FROM execution_contexts WHERE execution_context_id = ?").run(currentExecutionContextId);
      response.writeHead(204);
      response.end();
    } catch (error) {
      handleDatabaseError(response, error);
    }

    return true;
  }

  if (pathname === "/api/v1/ccy-options" && method === "GET") {
    sendJson(response, 200, ccyOptions());
    return true;
  }

  if (pathname === "/api/v1/ccy-options" && method === "POST") {
    const body = await readJsonBody(request);
    const payload = validateCcyPayload(body, true);

    if (payload.error) {
      apiError(response, 400, "INVALID_CCY", payload.error);
      return true;
    }

    try {
      database.prepare(`
        INSERT INTO ccy_options (ccy_code, name, country, fraction_digits)
        VALUES (?, ?, ?, ?)
      `).run(payload.code, payload.name, payload.country, payload.fractionDigits);
      const created = ccyOptions().find(item => item.code === payload.code);
      sendJson(response, 201, created);
    } catch (error) {
      handleDatabaseError(response, error);
    }

    return true;
  }

  const ccyMatch = /^\/api\/v1\/ccy-options\/([A-Za-z]{3})$/.exec(pathname);

  if (ccyMatch && method === "PUT") {
    const code = normalizedCcyCode(ccyMatch[1]);
    const body = await readJsonBody(request);
    const payload = validateCcyPayload(body, false);

    if (payload.error) {
      apiError(response, 400, "INVALID_CCY", payload.error);
      return true;
    }

    try {
      const result = database.prepare(`
        UPDATE ccy_options
        SET name = ?, country = ?, fraction_digits = ?
        WHERE ccy_code = ?
      `).run(payload.name, payload.country, payload.fractionDigits, code);

      if (result.changes === 0) {
        apiError(response, 404, "CCY_NOT_FOUND", `Ccy ${code} was not found.`);
      } else {
        sendJson(response, 200, ccyOptions().find(item => item.code === code));
      }
    } catch (error) {
      handleDatabaseError(response, error);
    }

    return true;
  }

  if (ccyMatch && method === "DELETE") {
    const code = normalizedCcyCode(ccyMatch[1]);

    try {
      const result = database.prepare("DELETE FROM ccy_options WHERE ccy_code = ?").run(code);

      if (result.changes === 0) {
        apiError(response, 404, "CCY_NOT_FOUND", `Ccy ${code} was not found.`);
      } else {
        response.writeHead(204);
        response.end();
      }
    } catch (error) {
      const mapped = databaseConstraintMessage(error);
      const message = mapped.code === "REFERENCE_IN_USE"
        ? `Ccy ${code} cannot be deleted while it is used by a Ccy Pair.`
        : mapped.message;
      apiError(response, mapped.status, mapped.code, message);
    }

    return true;
  }

  if (pathname === "/api/v1/ccy-pair-options" && method === "GET") {
    sendJson(response, 200, ccyPairOptions());
    return true;
  }

  if (pathname === "/api/v1/ccy-pair-options" && method === "POST") {
    const body = await readJsonBody(request);
    const payload = validatePairCreatePayload(body);

    if (payload.error) {
      apiError(response, 400, "INVALID_CCY_PAIR", payload.error);
      return true;
    }

    try {
      database.prepare(`
        INSERT INTO ccy_pair_options
          (ccy_pair_code, base_ccy_code, quote_ccy_code, default_quote_decimals)
        VALUES (?, ?, ?, ?)
      `).run(payload.pairCode, payload.baseCcy, payload.quoteCcy, payload.defaultQuoteDecimals);
      sendJson(response, 201, ccyPairOption(payload.pairCode));
    } catch (error) {
      if (String(error?.message || "").includes("FOREIGN KEY constraint failed")) {
        apiError(response, 409, "CCY_NOT_FOUND", "Base Ccy and Quote Ccy must exist in Ccy Options.");
      } else {
        handleDatabaseError(response, error);
      }
    }

    return true;
  }

  const simulationSettingsMatch = /^\/api\/v1\/ccy-pair-options\/([A-Za-z]{3}_[A-Za-z]{3})\/simulation-settings$/.exec(pathname);

  if (simulationSettingsMatch && method === "GET") {
    const pairCode = simulationSettingsMatch[1].toUpperCase();
    const pair = ccyPairOption(pairCode);

    if (!pair) {
      apiError(response, 404, "CCY_PAIR_NOT_FOUND", `Ccy Pair ${pairCode} was not found.`);
      return true;
    }

    const settings = marketQuoteSimulationSettings(pairCode);

    if (!settings) {
      apiError(response, 404, "SIMULATION_SETTINGS_NOT_FOUND", `Simulation Settings for ${pairCode} were not found.`);
    } else {
      sendJson(response, 200, settings);
    }

    return true;
  }

  if (simulationSettingsMatch && method === "PUT") {
    const pairCode = simulationSettingsMatch[1].toUpperCase();

    if (!ccyPairOption(pairCode)) {
      apiError(response, 404, "CCY_PAIR_NOT_FOUND", `Ccy Pair ${pairCode} was not found.`);
      return true;
    }

    const body = await readJsonBody(request);
    const bidMin = nullablePositiveNumber(body.bidMin);
    const spread = nullablePositiveNumber(body.spread);
    const bidMax = nullablePositiveNumber(body.bidMax);
    const validSettings = Number.isFinite(bidMin)
      && Number.isFinite(spread)
      && Number.isFinite(bidMax)
      && bidMax > bidMin;

    if (!validSettings) {
      apiError(response, 400, "INVALID_SIMULATION_SETTINGS", "Simulation values must be positive and Max Bid must exceed Min Bid.");
      return true;
    }

    try {
      database.prepare(`
        INSERT INTO market_quote_simulation_settings
          (ccy_pair_code, bid_min, spread, bid_max)
        VALUES (?, ?, ?, ?)
        ON CONFLICT (ccy_pair_code) DO UPDATE SET
          bid_min = excluded.bid_min,
          spread = excluded.spread,
          bid_max = excluded.bid_max
      `).run(pairCode, bidMin, spread, bidMax);
      marketPulseSimulator.refresh();
      sendJson(response, 200, marketQuoteSimulationSettings(pairCode));
    } catch (error) {
      handleDatabaseError(response, error);
    }

    return true;
  }

  if (simulationSettingsMatch && method === "DELETE") {
    const pairCode = simulationSettingsMatch[1].toUpperCase();
    const result = database.prepare(`
      DELETE FROM market_quote_simulation_settings
      WHERE ccy_pair_code = ?
    `).run(pairCode);

    if (result.changes === 0) {
      apiError(response, 404, "SIMULATION_SETTINGS_NOT_FOUND", `Simulation Settings for ${pairCode} were not found.`);
    } else {
      marketPulseSimulator.refresh();
      response.writeHead(204);
      response.end();
    }

    return true;
  }

  const pairMatch = /^\/api\/v1\/ccy-pair-options\/([A-Za-z]{3}_[A-Za-z]{3})$/.exec(pathname);

  if (pairMatch && method === "PATCH") {
    const pairCode = pairMatch[1].toUpperCase();
    const current = ccyPairOption(pairCode);

    if (!current) {
      apiError(response, 404, "CCY_PAIR_NOT_FOUND", `Ccy Pair ${pairCode} was not found.`);
      return true;
    }

    const body = await readJsonBody(request);
    const defaultQuoteDecimals = Object.prototype.hasOwnProperty.call(body, "defaultQuoteDecimals")
      ? integerInRange(body.defaultQuoteDecimals, 0, 8)
      : current.defaultQuoteDecimals;

    if (defaultQuoteDecimals === null) {
      apiError(response, 400, "INVALID_CCY_PAIR", "Default Quote Decimals must be a whole number from 0 to 8.");
      return true;
    }

    try {
      database.prepare(`
        UPDATE ccy_pair_options
        SET default_quote_decimals = ?
        WHERE ccy_pair_code = ?
      `).run(defaultQuoteDecimals, pairCode);
      marketPulseSimulator.refresh();
      sendJson(response, 200, ccyPairOption(pairCode));
    } catch (error) {
      handleDatabaseError(response, error);
    }

    return true;
  }

  if (pairMatch && method === "DELETE") {
    const pairCode = pairMatch[1].toUpperCase();
    const current = ccyPairOption(pairCode);

    if (!current) {
      apiError(response, 404, "CCY_PAIR_NOT_FOUND", `Ccy Pair ${pairCode} was not found.`);
      return true;
    }

    if (current.pricingRulesCount > 0) {
      const ruleLabel = current.pricingRulesCount === 1 ? "Pricing Rule" : "Pricing Rules";
      apiError(
        response,
        409,
        "CCY_PAIR_IN_USE",
        `Ccy Pair ${current.currencyPair} is used in ${current.pricingRulesCount} ${ruleLabel}.`
      );
      return true;
    }

    database.prepare("DELETE FROM ccy_pair_options WHERE ccy_pair_code = ?").run(pairCode);
    marketPulseSimulator.refresh();
    response.writeHead(204);
    response.end();

    return true;
  }

  if (pathname === "/api/database/tables" && method === "GET") {
    sendJson(response, 200, tableNames().map(tableName => ({
      tableName,
      rowCount: database.prepare(`SELECT COUNT(*) AS count FROM ${quotedIdentifier(tableName)}`).get().count
    })));
    return true;
  }

  const tableMatch = /^\/api\/database\/tables\/([A-Za-z0-9_]+)$/.exec(pathname);

  if (tableMatch && method === "GET") {
    const details = databaseTableDetails(tableMatch[1]);

    if (!details) {
      apiError(response, 404, "TABLE_NOT_FOUND", `Table ${tableMatch[1]} was not found.`);
    } else {
      sendJson(response, 200, details);
    }

    return true;
  }

  return false;
}

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

function serveStatic(response, pathname) {
  const requestedPath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const resolvedPath = path.resolve(ROOT_DIR, requestedPath);

  if (!resolvedPath.startsWith(`${ROOT_DIR}${path.sep}`) || !fs.existsSync(resolvedPath) || !fs.statSync(resolvedPath).isFile()) {
    sendText(response, 404, "Not found.");
    return;
  }

  const content = fs.readFileSync(resolvedPath);
  response.writeHead(200, {
    "Content-Type": MIME_TYPES[path.extname(resolvedPath).toLowerCase()] || "application/octet-stream",
    "Content-Length": content.length,
    "Cache-Control": "no-store"
  });
  response.end(content);
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || `${HOST}:${PORT}`}`);

  try {
    if (url.pathname.startsWith("/api/")) {
      const handled = await handleApi(request, response, url);

      if (!handled) {
        apiError(response, 404, "API_NOT_FOUND", "API endpoint was not found.");
      }

      return;
    }

    serveStatic(response, decodeURIComponent(url.pathname));
  } catch (error) {
    const statusCode = Number(error?.statusCode) || 500;
    const message = statusCode >= 500 ? "Unexpected server error." : error.message;
    apiError(response, statusCode, "REQUEST_FAILED", message);
  }
});

server.on("error", error => {
  if (error?.code === "EADDRINUSE") {
    console.error(`Port ${PORT} is already in use. Open http://${HOST}:${PORT} if the demo is already running.`);
  } else {
    console.error(error);
  }

  marketPulseSimulator.dispose();
  database.close();
  process.exitCode = 1;
});

let shutdownStarted = false;

function closeServer() {
  if (shutdownStarted) {
    return;
  }

  shutdownStarted = true;
  server.close(() => {
    marketPulseSimulator.dispose();
    database.close();
    process.exit(0);
  });

  // Market Pulse keeps an SSE stream open while the page is loaded.
  // Close it explicitly so Ctrl+C does not wait for the browser to disconnect.
  server.closeAllConnections();
}

if (require.main === module) {
  process.on("SIGINT", closeServer);
  process.on("SIGTERM", closeServer);

  if (process.argv.includes("--init-only")) {
    database.close();
    console.log(`SQLite initialized: ${DATABASE_PATH}`);
  } else {
    server.listen(PORT, HOST, () => {
      console.log(`Demo application: http://${HOST}:${PORT}`);
      console.log(`SQLite database: ${DATABASE_PATH}`);
      console.log("Press Ctrl+C to stop.");
    });
  }
}

module.exports = {
  handleApi,
  closeDatabase: () => {
    marketPulseSimulator.dispose();
    database.close();
  }
};
