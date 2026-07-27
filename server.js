"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { URL } = require("node:url");
const { DatabaseSync } = require("node:sqlite");
const { MarketPulseSimulator } = require("./backend/market-pulse-simulation/market-pulse-simulator");
const {
  calculateAnalyticalPnl,
  calculateClientFxDealEconomics,
  roundToFractionDigits
} = require("./backend/client-fx-deal/client-fx-deal-economics");
const {
  generatedClientFxDeal
} = require("./backend/client-fx-deal/client-fx-deal-generator");
const {
  ClientDealGenerationProcess
} = require("./backend/client-fx-deal/client-deal-generation-process");
const {
  createHedgeFxDealTerms
} = require("./backend/hedge-fx-deal/hedge-fx-deal-terms");
const {
  calculateBatchBalancingTradePair
} = require("./backend/batch-balancing/batch-balancing-trade-pair");
const {
  calculateFxAmountsFromDealt,
  calculateQuoteMinor,
  majorToMinor,
  minorToMajor,
  minorToSafeInteger
} = require("./backend/money/money");

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
const PARTY_TYPES = ["CLIENT", "HEDGE_COUNTERPARTY"];
const PARTY_CODE_TYPES = ["INN", "OTHER", "FRONT_SYSTEM_FOLDER_ID"];
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
const USER_CODE_MAX_LENGTH = 30;
const USER_NAME_MAX_LENGTH = 50;
const USER_ROLES = ["DEALER", "SUPERVISOR", "ADMIN"];
const FX_TRADE_TYPES = [
  "CLIENT_DEAL",
  "HEDGE_DEAL",
  "BATCH_BALANCING_TRADE",
  "BATCH_POSITION_OUT"
];
const CLIENT_DEAL_GENERATION_INTERVAL_MS = 1000;
const CLIENT_ONBOARDING_MANUAL_PRICING = "CLIENT_ONBOARDING";

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
const usersAlreadyInitialized = Boolean(database.prepare(`
  SELECT 1 AS present
  FROM sqlite_master
  WHERE type = 'table' AND name = 'users'
`).get());
const pricingRulesAlreadyInitialized = Boolean(database.prepare(`
  SELECT 1 AS present
  FROM sqlite_master
  WHERE type = 'table' AND name = 'pricing_rules'
`).get());
const clientDealGenerationSettingsAlreadyInitialized = Boolean(database.prepare(`
  SELECT 1 AS present
  FROM sqlite_master
  WHERE type = 'table' AND name = 'client_deal_generation_settings'
`).get());
const clientFxDealsAlreadyInitialized = Boolean(database.prepare(`
  SELECT 1 AS present
  FROM sqlite_master
  WHERE type = 'table' AND name = 'client_fx_deals'
`).get());
const hedgeFxDealsAlreadyInitialized = Boolean(database.prepare(`
  SELECT 1 AS present
  FROM sqlite_master
  WHERE type = 'table' AND name = 'fx_hedge_deals'
`).get());
database.exec(fs.readFileSync(SCHEMA_PATH, "utf8"));
if (!hedgeFxDealsAlreadyInitialized) {
  database.exec("DROP TABLE fx_hedge_deals");
}
dropFxTradeExposureDealtCurrencyTriggers(database);
dropClientFxDealTriggers(database);
dropHedgeFxDealTriggers(database);
dropClientDealGenerationSettingsTriggers(database);
dropLegacyTradingPartyExecutionContexts(database);
migrateCcyOptionsConstraints(database);
if (databaseAlreadyInitialized) {
  migrateLegacySimulationSettings(database);
}
migrateCcyPairOptionsConstraints(database);
migrateFxTradeExposureTypes(database);
migrateLegacyExecutionContextIds(database);
migrateServicingLocationTextLimits(database);
migrateAccountingSystemsShape(database);
migrateExecutionSystemsShape(database);
migrateTradingPartiesConstraints(database);
ensurePricingRuleClientDealReferenceIndex(database);
synchronizeClientDealGenerationSettings(database);
migrateClientFxDealsToTradeExposure(database);
migrateFxTradeExposureAmountsToMinorUnits(database);
migrateFxTradeExposureTradeSemantics(database);
ensureFxTradeExposureDealtCurrencyTriggers(database);
migrateFxTradeMarketSnapshot(database);
ensureClientFxDealIndexes(database);
backfillInitialClientFxDealAttribution(database);
ensureClientFxDealTriggers(database);
database.exec(fs.readFileSync(SCHEMA_PATH, "utf8"));
ensureHedgeFxDealTriggers(database);

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

  if (!usersAlreadyInitialized) {
    seedInitialUsers(database);
  }

  if (!pricingRulesAlreadyInitialized) {
    seedInitialPricingRules(database);
  }

  if (!clientDealGenerationSettingsAlreadyInitialized) {
    seedInitialClientDealGenerationSettings(database);
  }

  if (!clientFxDealsAlreadyInitialized) {
    seedInitialClientFxDeals(database);
  }

}

function tableColumnNames(sqlite, tableName) {
  return new Set(sqlite.prepare(`PRAGMA table_info(${tableName})`).all().map(column => column.name));
}

function runInImmediateTransaction(sqlite, operation) {
  sqlite.exec("BEGIN IMMEDIATE");

  try {
    const result = operation();
    sqlite.exec("COMMIT");
    return result;
  } catch (error) {
    try {
      sqlite.exec("ROLLBACK");
    } catch {}

    throw error;
  }
}

function migrateFxTradeExposureTypes(sqlite) {
  const tableDefinition = sqlite.prepare(`
    SELECT sql
    FROM sqlite_master
    WHERE type = 'table' AND name = 'fx_trade_exposure'
  `).get()?.sql || "";
  const supportsEveryTradeType = FX_TRADE_TYPES.every(tradeType =>
    tableDefinition.includes(`'${tradeType}'`)
  );

  if (supportsEveryTradeType) {
    return;
  }

  const expectedColumns = [
    "trade_id",
    "entry_timestamp",
    "trade_type",
    "trade_date",
    "ccy_pair_code",
    "side",
    "base_ccy_amount",
    "quote_ccy_amount",
    "trade_rate",
    "tenor",
    "base_ccy_value_date",
    "quote_ccy_value_date"
  ];
  const columns = sqlite.prepare("PRAGMA table_info(fx_trade_exposure)").all()
    .map(column => column.name);

  if (columns.join(",") !== expectedColumns.join(",")) {
    throw new Error("Unsupported FX Trade Exposure schema.");
  }

  const invalidTrade = sqlite.prepare(`
    SELECT trade_id, trade_type
    FROM fx_trade_exposure
    WHERE trade_type NOT IN (${FX_TRADE_TYPES.map(() => "?").join(", ")})
    LIMIT 1
  `).get(...FX_TRADE_TYPES);

  if (invalidTrade) {
    throw new Error(
      `FX Trade Exposure ${invalidTrade.trade_id} has unsupported type ${invalidTrade.trade_type}.`
    );
  }

  const originalRowCount = Number(
    sqlite.prepare("SELECT COUNT(*) AS count FROM fx_trade_exposure").get().count
  );
  sqlite.exec("PRAGMA foreign_keys = OFF");

  try {
    sqlite.exec("BEGIN IMMEDIATE");
    sqlite.exec(`
      CREATE TABLE fx_trade_exposure_migrated
      (
          trade_id             INTEGER PRIMARY KEY,
          entry_timestamp      TEXT    NOT NULL,
          trade_type           TEXT    NOT NULL,
          trade_date           TEXT    NOT NULL,
          ccy_pair_code        TEXT    NOT NULL,
          side                 TEXT    NOT NULL,
          base_ccy_amount      NUMERIC NOT NULL,
          quote_ccy_amount     NUMERIC NOT NULL,
          trade_rate           NUMERIC NOT NULL,
          tenor                TEXT    NOT NULL,
          base_ccy_value_date  TEXT    NOT NULL,
          quote_ccy_value_date TEXT    NOT NULL,

          CONSTRAINT fk_fx_trade_exposure_ccy_pair
              FOREIGN KEY (ccy_pair_code)
                  REFERENCES ccy_pair_options (ccy_pair_code)
                  ON UPDATE RESTRICT
                  ON DELETE RESTRICT,
          CONSTRAINT chk_fx_trade_exposure_entry_timestamp
              CHECK (
                  length(entry_timestamp) = 24
                  AND entry_timestamp GLOB '????-??-??T??:??:??.???Z'
                  AND strftime('%Y-%m-%dT%H:%M:%fZ', entry_timestamp) = entry_timestamp
              ),
          CONSTRAINT chk_fx_trade_exposure_trade_type
              CHECK (
                  trade_type IN
                  (
                      'CLIENT_DEAL',
                      'HEDGE_DEAL',
                      'BATCH_BALANCING_TRADE',
                      'BATCH_POSITION_OUT'
                  )
              ),
          CONSTRAINT chk_fx_trade_exposure_trade_date
              CHECK (
                  trade_date GLOB '????-??-??'
                  AND strftime('%Y-%m-%d', trade_date) = trade_date
              ),
          CONSTRAINT chk_fx_trade_exposure_side
              CHECK (side IN ('BUY', 'SELL')),
          CONSTRAINT chk_fx_trade_exposure_amounts_and_rate
              CHECK (
                  typeof(base_ccy_amount) IN ('integer', 'real')
                  AND base_ccy_amount > 0
                  AND typeof(quote_ccy_amount) IN ('integer', 'real')
                  AND quote_ccy_amount > 0
                  AND typeof(trade_rate) IN ('integer', 'real')
                  AND trade_rate > 0
              ),
          CONSTRAINT chk_fx_trade_exposure_tenor
              CHECK (tenor IN ('TOD', 'TOM', 'SPOT')),
          CONSTRAINT chk_fx_trade_exposure_value_dates
              CHECK (
                  base_ccy_value_date GLOB '????-??-??'
                  AND strftime('%Y-%m-%d', base_ccy_value_date) = base_ccy_value_date
                  AND quote_ccy_value_date GLOB '????-??-??'
                  AND strftime('%Y-%m-%d', quote_ccy_value_date) = quote_ccy_value_date
              )
      );

      INSERT INTO fx_trade_exposure_migrated
        (
          trade_id,
          entry_timestamp,
          trade_type,
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
        trade_id,
        entry_timestamp,
        trade_type,
        trade_date,
        ccy_pair_code,
        side,
        base_ccy_amount,
        quote_ccy_amount,
        trade_rate,
        tenor,
        base_ccy_value_date,
        quote_ccy_value_date
      FROM fx_trade_exposure
      ORDER BY trade_id;

      DROP TABLE fx_trade_exposure;
      ALTER TABLE fx_trade_exposure_migrated RENAME TO fx_trade_exposure;

      CREATE INDEX idx_fx_trade_exposure_entry_timestamp
          ON fx_trade_exposure (entry_timestamp);
      CREATE INDEX idx_fx_trade_exposure_trade_type
          ON fx_trade_exposure (trade_type);
      CREATE INDEX idx_fx_trade_exposure_trade_date
          ON fx_trade_exposure (trade_date);
      CREATE INDEX idx_fx_trade_exposure_ccy_pair
          ON fx_trade_exposure (ccy_pair_code);
      CREATE UNIQUE INDEX uq_fx_trade_exposure_identity
          ON fx_trade_exposure (trade_id, trade_type);
    `);

    const migratedRowCount = Number(
      sqlite.prepare("SELECT COUNT(*) AS count FROM fx_trade_exposure").get().count
    );
    const foreignKeyViolations = sqlite.prepare("PRAGMA foreign_key_check").all();

    if (migratedRowCount !== originalRowCount) {
      throw new Error("FX Trade Exposure type migration did not preserve every row.");
    }

    if (foreignKeyViolations.length > 0) {
      throw new Error("FX Trade Exposure type migration produced foreign key violations.");
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

function migrateFxTradeExposureAmountsToMinorUnits(sqlite) {
  const sourceColumns = [
    "trade_id",
    "entry_timestamp",
    "trade_type",
    "trade_date",
    "ccy_pair_code",
    "side",
    "base_ccy_amount",
    "quote_ccy_amount",
    "trade_rate",
    "tenor",
    "base_ccy_value_date",
    "quote_ccy_value_date"
  ];
  const targetColumns = [
    "trade_id",
    "entry_timestamp",
    "trade_type",
    "trade_date",
    "ccy_pair_code",
    "side",
    "base_ccy_amount_minor",
    "base_ccy_fraction_digits",
    "quote_ccy_amount_minor",
    "quote_ccy_fraction_digits",
    "trade_rate",
    "tenor",
    "base_ccy_value_date",
    "quote_ccy_value_date"
  ];
  const finalColumns = [
    "trade_id",
    "entry_timestamp",
    "trade_type",
    "trade_date",
    "ccy_pair_code",
    "base_ccy_side",
    "dealt_ccy_code",
    "base_ccy_amount_minor",
    "base_ccy_fraction_digits",
    "quote_ccy_amount_minor",
    "quote_ccy_fraction_digits",
    "trade_rate",
    "tenor",
    "base_ccy_value_date",
    "quote_ccy_value_date"
  ];
  const tableInfo = sqlite.prepare("PRAGMA table_info(fx_trade_exposure)").all();
  const columns = tableInfo.map(column => column.name);
  const tableDefinition = sqlite.prepare(`
    SELECT sql
    FROM sqlite_master
    WHERE type = 'table' AND name = 'fx_trade_exposure'
  `).get()?.sql || "";

  const isIntermediateSchema = columns.join(",") === targetColumns.join(",");
  const isFinalSchema = columns.join(",") === finalColumns.join(",");

  if (isIntermediateSchema || isFinalSchema) {
    const amountColumnOffset = isFinalSchema ? 7 : 6;
    const targetDefinitionsAreValid = tableInfo[amountColumnOffset]?.type === "INTEGER"
      && tableInfo[amountColumnOffset]?.notnull === 1
      && tableInfo[amountColumnOffset + 1]?.type === "INTEGER"
      && tableInfo[amountColumnOffset + 1]?.notnull === 1
      && tableInfo[amountColumnOffset + 2]?.type === "INTEGER"
      && tableInfo[amountColumnOffset + 2]?.notnull === 1
      && tableInfo[amountColumnOffset + 3]?.type === "INTEGER"
      && tableInfo[amountColumnOffset + 3]?.notnull === 1
      && tableDefinition.includes("chk_fx_trade_exposure_amounts")
      && tableDefinition.includes("chk_fx_trade_exposure_fraction_digits");

    if (!targetDefinitionsAreValid) {
      throw new Error("Unsupported FX Trade Exposure minor-unit schema.");
    }

    return;
  }

  if (columns.join(",") !== sourceColumns.join(",")) {
    throw new Error("Unsupported FX Trade Exposure amount schema.");
  }

  const sourceRows = sqlite.prepare(`
    SELECT
      e.*,
      base_ccy.fraction_digits AS base_ccy_fraction_digits,
      quote_ccy.fraction_digits AS quote_ccy_fraction_digits
    FROM fx_trade_exposure e
    INNER JOIN ccy_pair_options pair ON pair.ccy_pair_code = e.ccy_pair_code
    INNER JOIN ccy_options base_ccy ON base_ccy.ccy_code = pair.base_ccy_code
    INNER JOIN ccy_options quote_ccy ON quote_ccy.ccy_code = pair.quote_ccy_code
    ORDER BY e.trade_id
  `).all();
  const originalRowCount = Number(
    sqlite.prepare("SELECT COUNT(*) AS count FROM fx_trade_exposure").get().count
  );

  if (sourceRows.length !== originalRowCount) {
    throw new Error("Every FX Trade Exposure must resolve both currency fraction digits.");
  }

  sqlite.exec("PRAGMA foreign_keys = OFF");

  try {
    sqlite.exec("BEGIN IMMEDIATE");
    sqlite.exec(`
      CREATE TABLE fx_trade_exposure_minor
      (
          trade_id                    INTEGER PRIMARY KEY,
          entry_timestamp             TEXT    NOT NULL,
          trade_type                  TEXT    NOT NULL,
          trade_date                  TEXT    NOT NULL,
          ccy_pair_code               TEXT    NOT NULL,
          side                        TEXT    NOT NULL,
          base_ccy_amount_minor       INTEGER NOT NULL,
          base_ccy_fraction_digits    INTEGER NOT NULL,
          quote_ccy_amount_minor      INTEGER NOT NULL,
          quote_ccy_fraction_digits   INTEGER NOT NULL,
          trade_rate                  NUMERIC NOT NULL,
          tenor                       TEXT    NOT NULL,
          base_ccy_value_date         TEXT    NOT NULL,
          quote_ccy_value_date        TEXT    NOT NULL,

          CONSTRAINT fk_fx_trade_exposure_ccy_pair
              FOREIGN KEY (ccy_pair_code)
                  REFERENCES ccy_pair_options (ccy_pair_code)
                  ON UPDATE RESTRICT
                  ON DELETE RESTRICT,
          CONSTRAINT chk_fx_trade_exposure_entry_timestamp
              CHECK (
                  length(entry_timestamp) = 24
                  AND entry_timestamp GLOB '????-??-??T??:??:??.???Z'
                  AND strftime('%Y-%m-%dT%H:%M:%fZ', entry_timestamp) = entry_timestamp
              ),
          CONSTRAINT chk_fx_trade_exposure_trade_type
              CHECK (
                  trade_type IN
                  (
                      'CLIENT_DEAL',
                      'HEDGE_DEAL',
                      'BATCH_BALANCING_TRADE',
                      'BATCH_POSITION_OUT'
                  )
              ),
          CONSTRAINT chk_fx_trade_exposure_trade_date
              CHECK (
                  trade_date GLOB '????-??-??'
                  AND strftime('%Y-%m-%d', trade_date) = trade_date
              ),
          CONSTRAINT chk_fx_trade_exposure_side
              CHECK (side IN ('BUY', 'SELL')),
          CONSTRAINT chk_fx_trade_exposure_amounts
              CHECK (
                  typeof(base_ccy_amount_minor) = 'integer'
                  AND base_ccy_amount_minor BETWEEN 1 AND 9007199254740991
                  AND typeof(quote_ccy_amount_minor) = 'integer'
                  AND quote_ccy_amount_minor BETWEEN 1 AND 9007199254740991
              ),
          CONSTRAINT chk_fx_trade_exposure_fraction_digits
              CHECK (
                  typeof(base_ccy_fraction_digits) = 'integer'
                  AND base_ccy_fraction_digits BETWEEN 0 AND 10
                  AND typeof(quote_ccy_fraction_digits) = 'integer'
                  AND quote_ccy_fraction_digits BETWEEN 0 AND 10
              ),
          CONSTRAINT chk_fx_trade_exposure_rate
              CHECK (
                  typeof(trade_rate) IN ('integer', 'real')
                  AND trade_rate > 0
              ),
          CONSTRAINT chk_fx_trade_exposure_tenor
              CHECK (tenor IN ('TOD', 'TOM', 'SPOT')),
          CONSTRAINT chk_fx_trade_exposure_value_dates
              CHECK (
                  base_ccy_value_date GLOB '????-??-??'
                  AND strftime('%Y-%m-%d', base_ccy_value_date) = base_ccy_value_date
                  AND quote_ccy_value_date GLOB '????-??-??'
                  AND strftime('%Y-%m-%d', quote_ccy_value_date) = quote_ccy_value_date
              )
      );
    `);

    const insert = sqlite.prepare(`
      INSERT INTO fx_trade_exposure_minor
        (
          trade_id,
          entry_timestamp,
          trade_type,
          trade_date,
          ccy_pair_code,
          side,
          base_ccy_amount_minor,
          base_ccy_fraction_digits,
          quote_ccy_amount_minor,
          quote_ccy_fraction_digits,
          trade_rate,
          tenor,
          base_ccy_value_date,
          quote_ccy_value_date
        )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    sourceRows.forEach(row => {
      const baseMinor = minorToSafeInteger(
        majorToMinor(String(row.base_ccy_amount), row.base_ccy_fraction_digits),
        "Base Ccy Amount Minor"
      );
      const quoteMinor = minorToSafeInteger(
        majorToMinor(String(row.quote_ccy_amount), row.quote_ccy_fraction_digits),
        "Quote Ccy Amount Minor"
      );

      insert.run(
        row.trade_id,
        row.entry_timestamp,
        row.trade_type,
        row.trade_date,
        row.ccy_pair_code,
        row.side,
        baseMinor,
        row.base_ccy_fraction_digits,
        quoteMinor,
        row.quote_ccy_fraction_digits,
        row.trade_rate,
        row.tenor,
        row.base_ccy_value_date,
        row.quote_ccy_value_date
      );
    });

    sqlite.exec(`
      DROP TABLE fx_trade_exposure;
      ALTER TABLE fx_trade_exposure_minor RENAME TO fx_trade_exposure;

      CREATE INDEX idx_fx_trade_exposure_entry_timestamp
          ON fx_trade_exposure (entry_timestamp);
      CREATE INDEX idx_fx_trade_exposure_trade_type
          ON fx_trade_exposure (trade_type);
      CREATE INDEX idx_fx_trade_exposure_trade_date
          ON fx_trade_exposure (trade_date);
      CREATE INDEX idx_fx_trade_exposure_ccy_pair
          ON fx_trade_exposure (ccy_pair_code);
      CREATE UNIQUE INDEX uq_fx_trade_exposure_identity
          ON fx_trade_exposure (trade_id, trade_type);
    `);

    const migratedRowCount = Number(
      sqlite.prepare("SELECT COUNT(*) AS count FROM fx_trade_exposure").get().count
    );
    const foreignKeyViolations = sqlite.prepare("PRAGMA foreign_key_check").all();

    if (migratedRowCount !== originalRowCount) {
      throw new Error("FX Trade Exposure minor-unit migration did not preserve every row.");
    }

    if (foreignKeyViolations.length > 0) {
      throw new Error("FX Trade Exposure minor-unit migration produced foreign key violations.");
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

function migrateFxTradeExposureTradeSemantics(sqlite) {
  const sourceColumns = [
    "trade_id",
    "entry_timestamp",
    "trade_type",
    "trade_date",
    "ccy_pair_code",
    "side",
    "base_ccy_amount_minor",
    "base_ccy_fraction_digits",
    "quote_ccy_amount_minor",
    "quote_ccy_fraction_digits",
    "trade_rate",
    "tenor",
    "base_ccy_value_date",
    "quote_ccy_value_date"
  ];
  const targetColumns = [
    "trade_id",
    "entry_timestamp",
    "trade_type",
    "trade_date",
    "ccy_pair_code",
    "base_ccy_side",
    "dealt_ccy_code",
    "base_ccy_amount_minor",
    "base_ccy_fraction_digits",
    "quote_ccy_amount_minor",
    "quote_ccy_fraction_digits",
    "trade_rate",
    "tenor",
    "base_ccy_value_date",
    "quote_ccy_value_date"
  ];
  const tableInfo = sqlite.prepare("PRAGMA table_info(fx_trade_exposure)").all();
  const columns = tableInfo.map(column => column.name);
  const tableDefinition = sqlite.prepare(`
    SELECT sql
    FROM sqlite_master
    WHERE type = 'table' AND name = 'fx_trade_exposure'
  `).get()?.sql || "";

  if (columns.join(",") === targetColumns.join(",")) {
    const definitionsAreValid = tableInfo[5]?.type === "TEXT"
      && tableInfo[5]?.notnull === 1
      && tableInfo[6]?.type === "TEXT"
      && tableInfo[6]?.notnull === 1
      && tableDefinition.includes("chk_fx_trade_exposure_base_ccy_side")
      && tableDefinition.includes("chk_fx_trade_exposure_dealt_ccy_code");

    if (!definitionsAreValid) {
      throw new Error("Unsupported FX Trade Exposure trade-semantics schema.");
    }

    return;
  }

  if (columns.join(",") !== sourceColumns.join(",")) {
    throw new Error("Unsupported FX Trade Exposure trade-semantics migration source.");
  }

  const sourceRows = sqlite.prepare(`
    SELECT e.*, pair.base_ccy_code
    FROM fx_trade_exposure e
    INNER JOIN ccy_pair_options pair ON pair.ccy_pair_code = e.ccy_pair_code
    ORDER BY e.trade_id
  `).all();
  const originalRowCount = Number(
    sqlite.prepare("SELECT COUNT(*) AS count FROM fx_trade_exposure").get().count
  );

  if (sourceRows.length !== originalRowCount) {
    throw new Error("Every FX Trade Exposure must resolve its Ccy Pair.");
  }

  sqlite.exec("PRAGMA foreign_keys = OFF");

  try {
    sqlite.exec("BEGIN IMMEDIATE");
    sqlite.exec(`
      CREATE TABLE fx_trade_exposure_semantics
      (
          trade_id                    INTEGER PRIMARY KEY,
          entry_timestamp             TEXT    NOT NULL,
          trade_type                  TEXT    NOT NULL,
          trade_date                  TEXT    NOT NULL,
          ccy_pair_code               TEXT    NOT NULL,
          base_ccy_side               TEXT    NOT NULL,
          dealt_ccy_code              TEXT    NOT NULL,
          base_ccy_amount_minor       INTEGER NOT NULL,
          base_ccy_fraction_digits    INTEGER NOT NULL,
          quote_ccy_amount_minor      INTEGER NOT NULL,
          quote_ccy_fraction_digits   INTEGER NOT NULL,
          trade_rate                  NUMERIC NOT NULL,
          tenor                       TEXT    NOT NULL,
          base_ccy_value_date         TEXT    NOT NULL,
          quote_ccy_value_date        TEXT    NOT NULL,

          CONSTRAINT fk_fx_trade_exposure_ccy_pair
              FOREIGN KEY (ccy_pair_code)
                  REFERENCES ccy_pair_options (ccy_pair_code)
                  ON UPDATE RESTRICT
                  ON DELETE RESTRICT,
          CONSTRAINT fk_fx_trade_exposure_dealt_ccy
              FOREIGN KEY (dealt_ccy_code)
                  REFERENCES ccy_options (ccy_code)
                  ON UPDATE RESTRICT
                  ON DELETE RESTRICT,
          CONSTRAINT chk_fx_trade_exposure_entry_timestamp
              CHECK (
                  length(entry_timestamp) = 24
                  AND entry_timestamp GLOB '????-??-??T??:??:??.???Z'
                  AND strftime('%Y-%m-%dT%H:%M:%fZ', entry_timestamp) = entry_timestamp
              ),
          CONSTRAINT chk_fx_trade_exposure_trade_type
              CHECK (
                  trade_type IN
                  (
                      'CLIENT_DEAL',
                      'HEDGE_DEAL',
                      'BATCH_BALANCING_TRADE',
                      'BATCH_POSITION_OUT'
                  )
              ),
          CONSTRAINT chk_fx_trade_exposure_trade_date
              CHECK (
                  trade_date GLOB '????-??-??'
                  AND strftime('%Y-%m-%d', trade_date) = trade_date
              ),
          CONSTRAINT chk_fx_trade_exposure_base_ccy_side
              CHECK (base_ccy_side IN ('BUY', 'SELL')),
          CONSTRAINT chk_fx_trade_exposure_dealt_ccy_code
              CHECK (
                  length(dealt_ccy_code) = 3
                  AND dealt_ccy_code = upper(dealt_ccy_code)
                  AND dealt_ccy_code NOT GLOB '*[^A-Z]*'
              ),
          CONSTRAINT chk_fx_trade_exposure_amounts
              CHECK (
                  typeof(base_ccy_amount_minor) = 'integer'
                  AND base_ccy_amount_minor BETWEEN 1 AND 9007199254740991
                  AND typeof(quote_ccy_amount_minor) = 'integer'
                  AND quote_ccy_amount_minor BETWEEN 1 AND 9007199254740991
              ),
          CONSTRAINT chk_fx_trade_exposure_fraction_digits
              CHECK (
                  typeof(base_ccy_fraction_digits) = 'integer'
                  AND base_ccy_fraction_digits BETWEEN 0 AND 10
                  AND typeof(quote_ccy_fraction_digits) = 'integer'
                  AND quote_ccy_fraction_digits BETWEEN 0 AND 10
              ),
          CONSTRAINT chk_fx_trade_exposure_rate
              CHECK (
                  typeof(trade_rate) IN ('integer', 'real')
                  AND trade_rate > 0
              ),
          CONSTRAINT chk_fx_trade_exposure_tenor
              CHECK (tenor IN ('TOD', 'TOM', 'SPOT')),
          CONSTRAINT chk_fx_trade_exposure_value_dates
              CHECK (
                  base_ccy_value_date GLOB '????-??-??'
                  AND strftime('%Y-%m-%d', base_ccy_value_date) = base_ccy_value_date
                  AND quote_ccy_value_date GLOB '????-??-??'
                  AND strftime('%Y-%m-%d', quote_ccy_value_date) = quote_ccy_value_date
              )
      );
    `);

    const insert = sqlite.prepare(`
      INSERT INTO fx_trade_exposure_semantics
        (
          trade_id,
          entry_timestamp,
          trade_type,
          trade_date,
          ccy_pair_code,
          base_ccy_side,
          dealt_ccy_code,
          base_ccy_amount_minor,
          base_ccy_fraction_digits,
          quote_ccy_amount_minor,
          quote_ccy_fraction_digits,
          trade_rate,
          tenor,
          base_ccy_value_date,
          quote_ccy_value_date
        )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    sourceRows.forEach(row => {
      insert.run(
        row.trade_id,
        row.entry_timestamp,
        row.trade_type,
        row.trade_date,
        row.ccy_pair_code,
        row.side,
        row.base_ccy_code,
        row.base_ccy_amount_minor,
        row.base_ccy_fraction_digits,
        row.quote_ccy_amount_minor,
        row.quote_ccy_fraction_digits,
        row.trade_rate,
        row.tenor,
        row.base_ccy_value_date,
        row.quote_ccy_value_date
      );
    });

    sqlite.exec(`
      DROP TABLE fx_trade_exposure;
      ALTER TABLE fx_trade_exposure_semantics RENAME TO fx_trade_exposure;

      CREATE INDEX idx_fx_trade_exposure_entry_timestamp
          ON fx_trade_exposure (entry_timestamp);
      CREATE INDEX idx_fx_trade_exposure_trade_type
          ON fx_trade_exposure (trade_type);
      CREATE INDEX idx_fx_trade_exposure_trade_date
          ON fx_trade_exposure (trade_date);
      CREATE INDEX idx_fx_trade_exposure_ccy_pair
          ON fx_trade_exposure (ccy_pair_code);
      CREATE UNIQUE INDEX uq_fx_trade_exposure_identity
          ON fx_trade_exposure (trade_id, trade_type);
    `);

    const migratedRowCount = Number(
      sqlite.prepare("SELECT COUNT(*) AS count FROM fx_trade_exposure").get().count
    );
    const foreignKeyViolations = sqlite.prepare("PRAGMA foreign_key_check").all();

    if (migratedRowCount !== originalRowCount) {
      throw new Error("FX Trade Exposure trade-semantics migration did not preserve every row.");
    }

    if (foreignKeyViolations.length > 0) {
      throw new Error("FX Trade Exposure trade-semantics migration produced foreign key violations.");
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

function dropFxTradeExposureDealtCurrencyTriggers(sqlite) {
  sqlite.exec(`
    DROP TRIGGER IF EXISTS trg_fx_trade_exposure_require_dealt_ccy_insert;
    DROP TRIGGER IF EXISTS trg_fx_trade_exposure_require_dealt_ccy_update;
    DROP TRIGGER IF EXISTS trg_ccy_pair_options_preserve_exposure_dealt_ccy;
  `);
}

function ensureFxTradeExposureDealtCurrencyTriggers(sqlite) {
  dropFxTradeExposureDealtCurrencyTriggers(sqlite);

  sqlite.exec(`
    CREATE TRIGGER trg_fx_trade_exposure_require_dealt_ccy_insert
    BEFORE INSERT ON fx_trade_exposure
    FOR EACH ROW
    WHEN NOT EXISTS
    (
      SELECT 1
      FROM ccy_pair_options p
      WHERE p.ccy_pair_code = NEW.ccy_pair_code
        AND NEW.dealt_ccy_code IN (p.base_ccy_code, p.quote_ccy_code)
    )
    BEGIN
      SELECT RAISE(ABORT, 'fx_trade_exposure.dealt_ccy_code must belong to its Ccy Pair');
    END;

    CREATE TRIGGER trg_fx_trade_exposure_require_dealt_ccy_update
    BEFORE UPDATE OF ccy_pair_code, dealt_ccy_code ON fx_trade_exposure
    FOR EACH ROW
    WHEN NOT EXISTS
    (
      SELECT 1
      FROM ccy_pair_options p
      WHERE p.ccy_pair_code = NEW.ccy_pair_code
        AND NEW.dealt_ccy_code IN (p.base_ccy_code, p.quote_ccy_code)
    )
    BEGIN
      SELECT RAISE(ABORT, 'fx_trade_exposure.dealt_ccy_code must belong to its Ccy Pair');
    END;

    CREATE TRIGGER trg_ccy_pair_options_preserve_exposure_dealt_ccy
    BEFORE UPDATE OF base_ccy_code, quote_ccy_code ON ccy_pair_options
    FOR EACH ROW
    WHEN EXISTS
    (
      SELECT 1
      FROM fx_trade_exposure e
      WHERE e.ccy_pair_code = OLD.ccy_pair_code
        AND e.dealt_ccy_code NOT IN (NEW.base_ccy_code, NEW.quote_ccy_code)
    )
    BEGIN
      SELECT RAISE(ABORT, 'a Ccy Pair used by fx_trade_exposure must preserve its dealt currency');
    END;
  `);
}

function migrateFxTradeMarketSnapshot(sqlite) {
  const targetTable = "fx_trade_market_snapshot";
  const legacyTable = "fx_trade_audit";
  const expectedColumns = [
    "trade_id",
    "trade_type",
    "market_pulse_stream_status",
    "market_pulse_bid",
    "market_pulse_offer",
    "market_pulse_timestamp"
  ];
  const tableExists = tableName => Boolean(sqlite.prepare(`
    SELECT 1 AS present
    FROM sqlite_master
    WHERE type = 'table' AND name = ?
  `).get(tableName));
  const targetExists = tableExists(targetTable);
  const legacyExists = tableExists(legacyTable);
  const targetColumns = targetExists
    ? [...tableColumnNames(sqlite, targetTable)]
    : [];
  const targetIsCurrent = targetColumns.join(",") === expectedColumns.join(",");

  if (targetIsCurrent && !legacyExists) {
    return;
  }

  const incompatibleTables = [
    targetExists && !targetIsCurrent ? targetTable : null,
    legacyExists ? legacyTable : null
  ].filter(Boolean);
  const populatedTable = incompatibleTables.find(tableName =>
    Number(sqlite.prepare(`SELECT COUNT(*) AS count FROM "${tableName}"`).get().count) > 0
  );

  if (populatedTable) {
    throw new Error(
      `Legacy table ${populatedTable} contains Market Snapshot data and requires an explicit status migration.`
    );
  }

  sqlite.exec("PRAGMA foreign_keys = OFF");

  try {
    sqlite.exec("BEGIN IMMEDIATE");

    if (legacyExists) {
      sqlite.exec(`DROP TABLE "${legacyTable}"`);
    }

    if (targetExists && !targetIsCurrent) {
      sqlite.exec(`DROP TABLE "${targetTable}"`);
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

function dropHedgeFxDealTriggers(sqlite) {
  sqlite.exec(`
    DROP TRIGGER IF EXISTS trg_fx_hedge_deals_require_hedge_counterparty_insert;
    DROP TRIGGER IF EXISTS trg_fx_hedge_deals_require_hedge_counterparty_update;
    DROP TRIGGER IF EXISTS trg_trading_parties_preserve_hedge_deals;
  `);
}

function dropClientDealGenerationSettingsTriggers(sqlite) {
  sqlite.exec(`
    DROP TRIGGER IF EXISTS trg_client_deal_generation_settings_require_client_insert;
    DROP TRIGGER IF EXISTS trg_client_deal_generation_settings_require_client_update;
    DROP TRIGGER IF EXISTS trg_pricing_rules_preserve_client_generation_settings;
    DROP TRIGGER IF EXISTS trg_trading_parties_preserve_client_generation_settings;
    DROP TRIGGER IF EXISTS trg_client_deal_generation_settings_require_auto_priced_client_insert;
    DROP TRIGGER IF EXISTS trg_client_deal_generation_settings_require_auto_priced_client_update;
    DROP TRIGGER IF EXISTS trg_pricing_rules_preserve_auto_priced_client_generation_settings;
    DROP TRIGGER IF EXISTS trg_trading_parties_preserve_auto_priced_client_generation_settings;
    DROP TRIGGER IF EXISTS trg_execution_contexts_preserve_auto_priced_client_generation_settings;
    DROP TRIGGER IF EXISTS trg_execution_systems_preserve_auto_priced_client_generation_settings;
  `);
}

function synchronizeClientDealGenerationSettings(sqlite) {
  sqlite.exec(`
    DELETE FROM client_deal_generation_settings
    WHERE NOT EXISTS
    (
      SELECT 1
      FROM pricing_rules r
      INNER JOIN trading_parties p ON p.party_id = r.party_id
      INNER JOIN execution_contexts c ON c.execution_context_id = r.execution_context_id
      INNER JOIN execution_systems e ON e.execution_system_id = c.execution_system_id
      WHERE r.pricing_rule_id = client_deal_generation_settings.pricing_rule_id
        AND p.party_type = 'CLIENT'
        AND e.pricing_mode = 'AUTO_PRICED'
    );

    INSERT OR IGNORE INTO client_deal_generation_settings
      (
        pricing_rule_id,
        min_base_ccy_amount,
        max_base_ccy_amount,
        base_ccy_amount_step,
        buy_probability_percent,
        is_active
      )
    SELECT
      r.pricing_rule_id,
      500000,
      1500000,
      100000,
      50,
      1
    FROM pricing_rules r
    INNER JOIN trading_parties p ON p.party_id = r.party_id
    INNER JOIN execution_contexts c ON c.execution_context_id = r.execution_context_id
    INNER JOIN execution_systems e ON e.execution_system_id = c.execution_system_id
    WHERE p.party_type = 'CLIENT'
      AND e.pricing_mode = 'AUTO_PRICED';
  `);
}

function clientDealGenerationReferenceEligible(partyId, executionContextId) {
  return Boolean(database.prepare(`
    SELECT 1 AS eligible
    FROM trading_parties p
    INNER JOIN execution_contexts c ON c.execution_context_id = ?
    INNER JOIN execution_systems e ON e.execution_system_id = c.execution_system_id
    WHERE p.party_id = ?
      AND p.party_type = 'CLIENT'
      AND e.pricing_mode = 'AUTO_PRICED'
  `).get(executionContextId, partyId));
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

function ensureHedgeFxDealTriggers(sqlite) {
  sqlite.exec(`
    CREATE TRIGGER IF NOT EXISTS trg_fx_hedge_deals_require_hedge_counterparty_insert
    BEFORE INSERT ON fx_hedge_deals
    FOR EACH ROW
    WHEN EXISTS
    (
      SELECT 1
      FROM trading_parties
      WHERE party_id = NEW.party_id AND party_type <> 'HEDGE_COUNTERPARTY'
    )
    BEGIN
      SELECT RAISE(ABORT, 'fx_hedge_deals.party_id must reference a HEDGE_COUNTERPARTY trading party');
    END;

    CREATE TRIGGER IF NOT EXISTS trg_fx_hedge_deals_require_hedge_counterparty_update
    BEFORE UPDATE OF party_id ON fx_hedge_deals
    FOR EACH ROW
    WHEN EXISTS
    (
      SELECT 1
      FROM trading_parties
      WHERE party_id = NEW.party_id AND party_type <> 'HEDGE_COUNTERPARTY'
    )
    BEGIN
      SELECT RAISE(ABORT, 'fx_hedge_deals.party_id must reference a HEDGE_COUNTERPARTY trading party');
    END;

    CREATE TRIGGER IF NOT EXISTS trg_trading_parties_preserve_hedge_deals
    BEFORE UPDATE OF party_type ON trading_parties
    FOR EACH ROW
    WHEN NEW.party_type <> 'HEDGE_COUNTERPARTY'
      AND EXISTS (SELECT 1 FROM fx_hedge_deals WHERE party_id = OLD.party_id)
    BEGIN
      SELECT RAISE(ABORT, 'a Trading Party used by fx_hedge_deals must remain a HEDGE_COUNTERPARTY');
    END;
  `);
}

function migrateClientFxDealsToTradeExposure(sqlite) {
  const tableInfo = sqlite.prepare("PRAGMA table_info(client_fx_deals)").all();
  const columns = tableInfo.map(column => column.name);
  const exposureColumns = sqlite.prepare("PRAGMA table_info(fx_trade_exposure)")
    .all()
    .map(column => column.name);
  const exposureUsesMajorAmounts = exposureColumns.includes("base_ccy_amount")
    && exposureColumns.includes("quote_ccy_amount");
  const exposureUsesMinorAmounts = exposureColumns.includes("base_ccy_amount_minor")
    && exposureColumns.includes("base_ccy_fraction_digits")
    && exposureColumns.includes("quote_ccy_amount_minor")
    && exposureColumns.includes("quote_ccy_fraction_digits");
  const exposureUsesBaseCcySide = exposureColumns.includes("base_ccy_side");
  const exposureUsesDealtCcyCode = exposureColumns.includes("dealt_ccy_code");
  const foreignKeys = sqlite.prepare("PRAGMA foreign_key_list(client_fx_deals)").all();
  const tableDefinition = sqlite.prepare(`
    SELECT sql
    FROM sqlite_master
    WHERE type = 'table' AND name = 'client_fx_deals'
  `).get()?.sql || "";
  const targetColumns = [
    "trade_id",
    "trade_type",
    "party_id",
    "execution_context_id",
    "pricing_rule_id",
    "transfer_rate",
    "analytical_pnl",
    "comment"
  ];
  const preCommentTargetColumns = [
    "trade_id",
    "trade_type",
    "party_id",
    "execution_context_id",
    "pricing_rule_id",
    "transfer_rate",
    "analytical_pnl"
  ];
  const previousTargetColumns = [
    "trade_id",
    "trade_type",
    "party_id",
    "execution_context_id",
    "pricing_rule_id",
    "transfer_rate",
    "analytical_pnl_quote_amount"
  ];
  const sharedIdentityColumns = ["trade_id", "trade_type", "party_id"];
  const legacyColumns = [
    "client_deal_id",
    "entry_timestamp",
    "party_id",
    "trade_date",
    "ccy_pair_code",
    "side",
    "base_ccy_amount",
    "quote_ccy_amount",
    "trade_rate",
    "tenor",
    "base_ccy_value_date",
    "quote_ccy_value_date"
  ];
  const hasColumns = expected => columns.length === expected.length
    && columns.every((column, index) => column === expected[index]);
  const hasCompositeForeignKey = (referencedTable, mappings) => {
    const keys = foreignKeys
      .filter(key => key.table === referencedTable)
      .sort((left, right) => left.seq - right.seq);

    return keys.length === mappings.length
      && keys.every(key => key.id === keys[0].id)
      && mappings.every((mapping, index) => keys[index].seq === index
        && keys[index].from === mapping.from
        && keys[index].to === mapping.to);
  };
  const partyForeignKeys = foreignKeys.filter(key => key.table === "trading_parties");
  const executionContextForeignKeys = foreignKeys.filter(key => key.table === "execution_contexts");
  const hasSharedIdentityForeignKeys = foreignKeys.length === 3
    && foreignKeys.every(key => key.on_update === "RESTRICT" && key.on_delete === "RESTRICT")
    && hasCompositeForeignKey("fx_trade_exposure", [
      { from: "trade_id", to: "trade_id" },
      { from: "trade_type", to: "trade_type" }
    ])
    && partyForeignKeys.length === 1
    && partyForeignKeys[0].from === "party_id"
    && partyForeignKeys[0].to === "party_id";
  const hasTargetForeignKeys = foreignKeys.length === 7
    && foreignKeys.every(key => key.on_update === "RESTRICT" && key.on_delete === "RESTRICT")
    && hasCompositeForeignKey("fx_trade_exposure", [
      { from: "trade_id", to: "trade_id" },
      { from: "trade_type", to: "trade_type" }
    ])
    && partyForeignKeys.length === 1
    && partyForeignKeys[0].from === "party_id"
    && partyForeignKeys[0].to === "party_id"
    && executionContextForeignKeys.length === 1
    && executionContextForeignKeys[0].from === "execution_context_id"
    && executionContextForeignKeys[0].to === "execution_context_id"
    && hasCompositeForeignKey("pricing_rules", [
      { from: "pricing_rule_id", to: "pricing_rule_id" },
      { from: "party_id", to: "party_id" },
      { from: "execution_context_id", to: "execution_context_id" }
    ]);
  const hasSharedIdentityColumnDefinitions = tableInfo[0]?.type === "INTEGER"
    && tableInfo[0]?.pk === 1
    && tableInfo[1]?.type === "TEXT"
    && tableInfo[1]?.notnull === 1
    && tableInfo[1]?.dflt_value === "'CLIENT_DEAL'"
    && tableInfo[2]?.type === "INTEGER"
    && tableInfo[2]?.notnull === 1
    && /CHECK\s*\(\s*trade_type\s*=\s*'CLIENT_DEAL'\s*\)/i.test(tableDefinition);
  const hasPreCommentTargetColumnDefinitions = tableInfo[0]?.type === "INTEGER"
    && tableInfo[0]?.pk === 1
    && tableInfo[1]?.type === "TEXT"
    && tableInfo[1]?.notnull === 1
    && tableInfo[1]?.dflt_value === "'CLIENT_DEAL'"
    && tableInfo[2]?.type === "INTEGER"
    && tableInfo[2]?.notnull === 1
    && tableInfo[3]?.type === "INTEGER"
    && tableInfo[3]?.notnull === 0
    && tableInfo[4]?.type === "INTEGER"
    && tableInfo[4]?.notnull === 0
    && tableInfo[5]?.type === "NUMERIC"
    && tableInfo[5]?.notnull === 0
    && tableInfo[6]?.type === "NUMERIC"
    && tableInfo[6]?.notnull === 0
    && hasSharedIdentityColumnDefinitions
    && tableDefinition.includes("chk_client_fx_deals_pricing_context")
    && tableDefinition.includes("chk_client_fx_deals_transfer_rate")
    && tableDefinition.includes("chk_client_fx_deals_analytical_pnl");
  const hasTargetColumnDefinitions = hasPreCommentTargetColumnDefinitions
    && tableInfo[7]?.type === "TEXT"
    && tableInfo[7]?.notnull === 0
    && tableDefinition.includes("chk_client_fx_deals_comment");
  const identityIndex = sqlite.prepare("PRAGMA index_list(fx_trade_exposure)").all()
    .find(index => index.name === "uq_fx_trade_exposure_identity"
      && index.unique === 1
      && index.partial === 0);
  const identityIndexColumns = identityIndex
    ? sqlite.prepare("PRAGMA index_info(uq_fx_trade_exposure_identity)").all().map(column => column.name)
    : [];
  const pricingReferenceIndex = sqlite.prepare("PRAGMA index_list(pricing_rules)").all()
    .find(index => index.name === "uq_pricing_rules_client_deal_reference"
      && index.unique === 1
      && index.partial === 0);
  const pricingReferenceIndexColumns = pricingReferenceIndex
    ? sqlite.prepare("PRAGMA index_info(uq_pricing_rules_client_deal_reference)").all().map(column => column.name)
    : [];

  if (!identityIndex || identityIndexColumns.join(",") !== "trade_id,trade_type") {
    throw new Error("FX Trade Exposure identity index is missing or invalid.");
  }

  if (!pricingReferenceIndex
    || pricingReferenceIndexColumns.join(",") !== "pricing_rule_id,party_id,execution_context_id") {
    throw new Error("Pricing Rule Client FX Deal reference index is missing or invalid.");
  }

  if (hasColumns(targetColumns)) {
    if (!hasTargetColumnDefinitions || !hasTargetForeignKeys) {
      throw new Error("Unsupported Client FX Deal target schema.");
    }

    return;
  }

  const hasPreviousTargetSchema = hasColumns(previousTargetColumns);
  const hasPreCommentTargetSchema = hasColumns(preCommentTargetColumns);
  const hasSharedIdentitySchema = hasColumns(sharedIdentityColumns);
  const hasLegacySchema = hasColumns(legacyColumns);

  if (hasPreviousTargetSchema
    && (!hasPreCommentTargetColumnDefinitions || !hasTargetForeignKeys)) {
    throw new Error("Unsupported previous Client FX Deal target schema.");
  }

  if (hasPreCommentTargetSchema
    && (!hasPreCommentTargetColumnDefinitions || !hasTargetForeignKeys)) {
    throw new Error("Unsupported pre-Comment Client FX Deal target schema.");
  }

  if (hasSharedIdentitySchema
    && (!hasSharedIdentityColumnDefinitions || !hasSharedIdentityForeignKeys)) {
    throw new Error("Unsupported Client FX Deal shared identity schema.");
  }

  if (!hasPreviousTargetSchema
    && !hasPreCommentTargetSchema
    && !hasSharedIdentitySchema
    && !hasLegacySchema) {
    throw new Error("Unsupported Client FX Deal schema.");
  }

  if (hasLegacySchema) {
    if (!exposureUsesMajorAmounts && !exposureUsesMinorAmounts) {
      throw new Error("Unsupported FX Trade Exposure amount schema.");
    }

    const invalidTenor = sqlite.prepare(`
      SELECT client_deal_id
      FROM client_fx_deals
      WHERE tenor NOT IN ('TOD', 'TOM', 'SPOT')
      LIMIT 1
    `).get();

    if (invalidTenor) {
      throw new Error(`Client FX Deal ${invalidTenor.client_deal_id} has an unsupported tenor.`);
    }

    const invalidParty = sqlite.prepare(`
      SELECT d.client_deal_id
      FROM client_fx_deals d
      LEFT JOIN trading_parties p ON p.party_id = d.party_id
      WHERE p.party_id IS NULL OR p.party_type <> 'CLIENT'
      LIMIT 1
    `).get();

    if (invalidParty) {
      throw new Error(`Client FX Deal ${invalidParty.client_deal_id} does not reference a CLIENT Trading Party.`);
    }

    const collidingExposure = sqlite.prepare(`
      SELECT d.client_deal_id
      FROM client_fx_deals d
      INNER JOIN fx_trade_exposure e ON e.trade_id = d.client_deal_id
      LIMIT 1
    `).get();

    if (collidingExposure) {
      throw new Error(`Client FX Deal ${collidingExposure.client_deal_id} collides with an existing FX Trade Exposure.`);
    }
  }

  const legacyRowCount = Number(sqlite.prepare("SELECT COUNT(*) AS count FROM client_fx_deals").get().count);
  sqlite.exec("PRAGMA foreign_keys = OFF");

  try {
    sqlite.exec("BEGIN IMMEDIATE");
    if (hasLegacySchema) {
      if (exposureUsesMinorAmounts) {
        const legacyRows = sqlite.prepare(`
          SELECT
            d.*,
            pair.base_ccy_code,
            base_ccy.fraction_digits AS base_ccy_fraction_digits,
            quote_ccy.fraction_digits AS quote_ccy_fraction_digits
          FROM client_fx_deals d
          INNER JOIN ccy_pair_options pair
            ON pair.ccy_pair_code = d.ccy_pair_code
          INNER JOIN ccy_options base_ccy
            ON base_ccy.ccy_code = pair.base_ccy_code
          INNER JOIN ccy_options quote_ccy
            ON quote_ccy.ccy_code = pair.quote_ccy_code
          ORDER BY d.client_deal_id
        `).all();
        const exposureUsesFinalTradeSemantics = exposureUsesBaseCcySide
          && exposureUsesDealtCcyCode;
        const insertExposure = sqlite.prepare(exposureUsesFinalTradeSemantics
          ? `
            INSERT INTO fx_trade_exposure
              (
                trade_id,
                entry_timestamp,
                trade_type,
                trade_date,
                ccy_pair_code,
                base_ccy_side,
                dealt_ccy_code,
                base_ccy_amount_minor,
                base_ccy_fraction_digits,
                quote_ccy_amount_minor,
                quote_ccy_fraction_digits,
                trade_rate,
                tenor,
                base_ccy_value_date,
                quote_ccy_value_date
              )
            VALUES (?, ?, 'CLIENT_DEAL', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `
          : `
            INSERT INTO fx_trade_exposure
              (
                trade_id,
                entry_timestamp,
                trade_type,
                trade_date,
                ccy_pair_code,
                side,
                base_ccy_amount_minor,
                base_ccy_fraction_digits,
                quote_ccy_amount_minor,
                quote_ccy_fraction_digits,
                trade_rate,
                tenor,
                base_ccy_value_date,
                quote_ccy_value_date
              )
            VALUES (?, ?, 'CLIENT_DEAL', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);

        for (const row of legacyRows) {
          const baseMinor = majorToMinor(
            String(row.base_ccy_amount),
            row.base_ccy_fraction_digits
          );
          const quoteMinor = majorToMinor(
            String(row.quote_ccy_amount),
            row.quote_ccy_fraction_digits
          );

          const values = [
            row.client_deal_id,
            row.entry_timestamp,
            row.trade_date,
            row.ccy_pair_code,
            row.side
          ];

          if (exposureUsesFinalTradeSemantics) {
            values.push(row.base_ccy_code);
          }

          values.push(
            minorToSafeInteger(baseMinor, "Legacy Base Ccy Amount Minor"),
            row.base_ccy_fraction_digits,
            minorToSafeInteger(quoteMinor, "Legacy Quote Ccy Amount Minor"),
            row.quote_ccy_fraction_digits,
            row.trade_rate,
            row.tenor,
            row.base_ccy_value_date,
            row.quote_ccy_value_date
          );
          insertExposure.run(...values);
        }
      } else {
        sqlite.exec(`
          INSERT INTO fx_trade_exposure
            (
              trade_id,
              entry_timestamp,
              trade_type,
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
            d.client_deal_id,
            d.entry_timestamp,
            'CLIENT_DEAL',
            d.trade_date,
            d.ccy_pair_code,
            d.side,
            d.base_ccy_amount,
            d.quote_ccy_amount,
            d.trade_rate,
            d.tenor,
            d.base_ccy_value_date,
            d.quote_ccy_value_date
          FROM client_fx_deals d;
        `);
      }
    }

    sqlite.exec(`
      CREATE TABLE client_fx_deals_migrated
      (
          trade_id                    INTEGER PRIMARY KEY,
          trade_type                  TEXT    NOT NULL DEFAULT 'CLIENT_DEAL',
          party_id                    INTEGER NOT NULL,
          execution_context_id        INTEGER,
          pricing_rule_id             INTEGER,
          transfer_rate               NUMERIC,
          analytical_pnl              NUMERIC,
          comment                     TEXT,

          CONSTRAINT fk_client_fx_deals_trade
              FOREIGN KEY (trade_id, trade_type)
                  REFERENCES fx_trade_exposure (trade_id, trade_type)
                  ON UPDATE RESTRICT
                  ON DELETE RESTRICT,
          CONSTRAINT fk_client_fx_deals_party
              FOREIGN KEY (party_id)
                  REFERENCES trading_parties (party_id)
                  ON UPDATE RESTRICT
                  ON DELETE RESTRICT,
          CONSTRAINT fk_client_fx_deals_execution_context
              FOREIGN KEY (execution_context_id)
                  REFERENCES execution_contexts (execution_context_id)
                  ON UPDATE RESTRICT
                  ON DELETE RESTRICT,
          CONSTRAINT fk_client_fx_deals_pricing_rule_scope
              FOREIGN KEY (pricing_rule_id, party_id, execution_context_id)
                  REFERENCES pricing_rules (pricing_rule_id, party_id, execution_context_id)
                  ON UPDATE RESTRICT
                  ON DELETE RESTRICT,
          CONSTRAINT chk_client_fx_deals_trade_type
              CHECK (trade_type = 'CLIENT_DEAL'),
          CONSTRAINT chk_client_fx_deals_pricing_context
              CHECK (pricing_rule_id IS NULL OR execution_context_id IS NOT NULL),
          CONSTRAINT chk_client_fx_deals_transfer_rate
              CHECK (
                  transfer_rate IS NULL
                  OR (
                      typeof(transfer_rate) IN ('integer', 'real')
                      AND transfer_rate > 0
                  )
              ),
          CONSTRAINT chk_client_fx_deals_analytical_pnl
              CHECK (
                  analytical_pnl IS NULL
                  OR typeof(analytical_pnl) IN ('integer', 'real')
              ),
          CONSTRAINT chk_client_fx_deals_comment
              CHECK (
                  comment IS NULL
                  OR (
                      length(comment) <= 500
                      AND instr(comment, char(10)) = 0
                      AND instr(comment, char(13)) = 0
                  )
              )
      );
    `);

    const sourceTradeIdColumn = hasLegacySchema ? "client_deal_id" : "trade_id";
    const sourceTradeTypeExpression = hasLegacySchema ? "'CLIENT_DEAL'" : "trade_type";
    const hasAttributionColumns = hasPreviousTargetSchema || hasPreCommentTargetSchema;
    const sourceExecutionContextExpression = hasAttributionColumns ? "execution_context_id" : "NULL";
    const sourcePricingRuleExpression = hasAttributionColumns ? "pricing_rule_id" : "NULL";
    const sourceTransferRateExpression = hasAttributionColumns ? "transfer_rate" : "NULL";
    const sourceAnalyticalPnlExpression = hasPreviousTargetSchema
      ? "analytical_pnl_quote_amount"
      : hasPreCommentTargetSchema
        ? "analytical_pnl"
        : "NULL";
    sqlite.exec(`
      INSERT INTO client_fx_deals_migrated
        (
          trade_id,
          trade_type,
          party_id,
          execution_context_id,
          pricing_rule_id,
          transfer_rate,
          analytical_pnl,
          comment
        )
      SELECT
        ${sourceTradeIdColumn},
        ${sourceTradeTypeExpression},
        party_id,
        ${sourceExecutionContextExpression},
        ${sourcePricingRuleExpression},
        ${sourceTransferRateExpression},
        ${sourceAnalyticalPnlExpression},
        NULL
      FROM client_fx_deals
      ORDER BY ${sourceTradeIdColumn};

      DROP TABLE client_fx_deals;
      ALTER TABLE client_fx_deals_migrated RENAME TO client_fx_deals;

      CREATE INDEX idx_client_fx_deals_party
          ON client_fx_deals (party_id);
      CREATE INDEX idx_client_fx_deals_execution_context
          ON client_fx_deals (execution_context_id);
      CREATE INDEX idx_client_fx_deals_pricing_rule
          ON client_fx_deals (pricing_rule_id);
    `);

    const migratedRowCount = Number(sqlite.prepare("SELECT COUNT(*) AS count FROM client_fx_deals").get().count);
    const linkedRowCount = Number(sqlite.prepare(`
      SELECT COUNT(*) AS count
      FROM client_fx_deals d
      INNER JOIN fx_trade_exposure e
        ON e.trade_id = d.trade_id AND e.trade_type = d.trade_type
    `).get().count);
    const foreignKeyViolations = sqlite.prepare("PRAGMA foreign_key_check").all();

    if (migratedRowCount !== legacyRowCount || linkedRowCount !== legacyRowCount) {
      throw new Error("Client FX Deal migration did not preserve every row.");
    }

    if (foreignKeyViolations.length > 0) {
      throw new Error("Client FX Deal migration produced foreign key violations.");
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

function ensureClientFxDealIndexes(sqlite) {
  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_client_fx_deals_party
        ON client_fx_deals (party_id);
    CREATE INDEX IF NOT EXISTS idx_client_fx_deals_execution_context
        ON client_fx_deals (execution_context_id);
    CREATE INDEX IF NOT EXISTS idx_client_fx_deals_pricing_rule
        ON client_fx_deals (pricing_rule_id);
  `);
}

function ensurePricingRuleClientDealReferenceIndex(sqlite) {
  sqlite.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_pricing_rules_client_deal_reference
        ON pricing_rules (pricing_rule_id, party_id, execution_context_id);
  `);
}

function backfillInitialClientFxDealAttribution(sqlite) {
  const deal = sqlite.prepare(`
    SELECT
      d.trade_id,
      d.party_id,
      e.trade_rate,
      e.base_ccy_amount_minor,
      e.base_ccy_fraction_digits,
      e.base_ccy_side AS side,
      e.ccy_pair_code
    FROM client_fx_deals d
    INNER JOIN fx_trade_exposure e
      ON e.trade_id = d.trade_id AND e.trade_type = d.trade_type
    INNER JOIN trading_parties p ON p.party_id = d.party_id
    WHERE d.execution_context_id IS NULL
      AND d.pricing_rule_id IS NULL
      AND d.transfer_rate IS NULL
      AND d.analytical_pnl IS NULL
      AND p.party_code_type = 'INN'
      AND p.party_code = '7701234567'
      AND e.entry_timestamp = '2026-07-15T09:30:00.000Z'
      AND e.trade_date = '2026-07-15'
      AND e.ccy_pair_code = 'EUR_USD'
      AND e.base_ccy_side = 'BUY'
      AND e.base_ccy_amount_minor = 3000000000
      AND e.quote_ccy_amount_minor = 3369300000
      AND e.trade_rate = 1.1231
      AND e.tenor = 'TOD'
      AND e.base_ccy_value_date = '2026-07-15'
      AND e.quote_ccy_value_date = '2026-07-15'
    LIMIT 1
  `).get();

  if (!deal) {
    return;
  }

  const pricingRule = sqlite.prepare(`
    SELECT r.pricing_rule_id, r.execution_context_id
    FROM pricing_rules r
    WHERE r.pricing_rule_id = 3
      AND r.party_id = ?
      AND r.ccy_pair_code = ?
    LIMIT 1
  `).get(deal.party_id, deal.ccy_pair_code);

  if (!pricingRule) {
    return;
  }

  const transferRate = 1.1222;
  const analyticalPnl = calculateAnalyticalPnl({
    clientSide: deal.side,
    baseCcyAmount: Number(minorToMajor(
      deal.base_ccy_amount_minor,
      deal.base_ccy_fraction_digits
    )),
    tradeRate: deal.trade_rate,
    transferRate
  });

  sqlite.prepare(`
    UPDATE client_fx_deals
    SET
      execution_context_id = ?,
      pricing_rule_id = ?,
      transfer_rate = ?,
      analytical_pnl = ?
    WHERE trade_id = ?
      AND execution_context_id IS NULL
      AND pricing_rule_id IS NULL
      AND transfer_rate IS NULL
      AND analytical_pnl IS NULL
  `).run(
    pricingRule.execution_context_id,
    pricingRule.pricing_rule_id,
    transferRate,
    analyticalPnl,
    deal.trade_id
  );
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
    || !tableDefinition.includes("is_active IN (0, 1)")
    || !tableDefinition.includes("'HEDGE_COUNTERPARTY'")
    || !tableDefinition.includes("'FRONT_SYSTEM_FOLDER_ID'")
    || tableDefinition.includes("'EXTERNAL_COUNTERPARTY'")
    || tableDefinition.includes("'INTERNAL_DESK'");

  if (!requiresMigration) {
    return;
  }

  const invalidRecord = sqlite.prepare(`
    SELECT party_id
    FROM trading_parties
    WHERE party_type NOT IN ('CLIENT', 'HEDGE_COUNTERPARTY', 'EXTERNAL_COUNTERPARTY', 'INTERNAL_DESK')
      OR party_code_type NOT IN ('INN', 'OTHER', 'FRONT_SYSTEM_FOLDER_ID')
      OR length(party_code) > ?
      OR (
        party_code_type = 'INN'
        AND (length(party_code) NOT BETWEEN 10 AND 12 OR party_code GLOB '*[^0-9]*')
      )
      OR (
        party_code_type IN ('OTHER', 'FRONT_SYSTEM_FOLDER_ID')
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
              CHECK (party_type IN ('CLIENT', 'HEDGE_COUNTERPARTY')),
          CONSTRAINT chk_trading_parties_code_type
              CHECK (party_code_type IN ('INN', 'OTHER', 'FRONT_SYSTEM_FOLDER_ID')),
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
                          party_code_type IN ('OTHER', 'FRONT_SYSTEM_FOLDER_ID')
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
      SELECT
        party_id,
        CASE
          WHEN party_type = 'CLIENT' THEN 'CLIENT'
          ELSE 'HEDGE_COUNTERPARTY'
        END,
        party_code,
        party_code_type,
        party_name,
        is_active
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
      ('CLIENT', '5409876543', 'INN', 'Gladiolus Company', 1),
      ('HEDGE_COUNTERPARTY', '7707000001', 'INN', 'Aurora Bank', 1);
  `);
}

function seedInitialUsers(sqlite) {
  sqlite.exec(`
    INSERT INTO users
      (user_code, first_name, last_name, user_role, is_active)
    VALUES
      ('GANDALF', 'Gandalf', 'Grey', 'DEALER', 1),
      ('TIN_WOODMAN', 'Tin', 'Woodman', 'SUPERVISOR', 1),
      ('ALICE', 'Alice', 'Wonderland', 'ADMIN', 1);
  `);
}

function seedInitialPricingRules(sqlite) {
  const rules = [
    ["7701234567", "002", "AFINA", "CLICK_TRADE_EFX", "EUR_USD", 0.10],
    ["7701234567", "002", "AFINA", "RFQ", "EUR_USD", 0.12],
    ["7701234567", "002", "CTF3", "MANUAL_CLIENT_DEAL_ENTRY", "EUR_USD", 0.08],
    ["7812345678", "1234", "AFINA", "RFQ", "EUR_USD", 0.05],
    ["5409876543", "001", "CTF3", "CLICK_TRADE_EFX", "EUR_USD", 0.20],
    ["7707000001", "002", "CTF3", "MANUAL_CLIENT_DEAL_ENTRY", "EUR_USD", 0.03]
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

function seedInitialClientDealGenerationSettings(sqlite) {
  sqlite.exec(`
    INSERT OR IGNORE INTO client_deal_generation_settings
      (
        pricing_rule_id,
        min_base_ccy_amount,
        max_base_ccy_amount,
        base_ccy_amount_step,
        buy_probability_percent,
        is_active
      )
    SELECT
      r.pricing_rule_id,
      500000,
      1500000,
      100000,
      50,
      1
    FROM pricing_rules r
    INNER JOIN trading_parties p ON p.party_id = r.party_id
    INNER JOIN execution_contexts c ON c.execution_context_id = r.execution_context_id
    INNER JOIN execution_systems e ON e.execution_system_id = c.execution_system_id
    WHERE p.party_type = 'CLIENT'
      AND e.pricing_mode = 'AUTO_PRICED';
  `);
}

function seedInitialClientFxDeals(sqlite) {
  runInImmediateTransaction(sqlite, () => {
    const pricingRule = sqlite.prepare(`
      SELECT r.pricing_rule_id, r.party_id, r.execution_context_id
      FROM pricing_rules r
      INNER JOIN trading_parties p ON p.party_id = r.party_id
      INNER JOIN execution_contexts e ON e.execution_context_id = r.execution_context_id
      WHERE p.party_code_type = 'INN'
        AND p.party_code = '7701234567'
        AND r.ccy_pair_code = 'EUR_USD'
        AND e.servicing_location_id = '002'
        AND e.accounting_system_id = 'CTF3'
        AND e.execution_system_id = 'MANUAL_CLIENT_DEAL_ENTRY'
      LIMIT 1
    `).get();

    if (!pricingRule) {
      throw new Error("Initial Client FX Deal Pricing Rule was not found.");
    }

    const exposureResult = sqlite.prepare(`
      INSERT INTO fx_trade_exposure
        (
          entry_timestamp,
          trade_type,
          trade_date,
          ccy_pair_code,
          base_ccy_side,
          dealt_ccy_code,
          base_ccy_amount_minor,
          base_ccy_fraction_digits,
          quote_ccy_amount_minor,
          quote_ccy_fraction_digits,
          trade_rate,
          tenor,
          base_ccy_value_date,
          quote_ccy_value_date
        )
      VALUES
        (
          '2026-07-15T09:30:00.000Z',
          'CLIENT_DEAL',
          '2026-07-15',
          'EUR_USD',
          'BUY',
          'EUR',
          3000000000,
          2,
          3369300000,
          2,
          1.1231,
          'TOD',
          '2026-07-15',
          '2026-07-15'
        )
    `).run();
    const tradeId = Number(exposureResult.lastInsertRowid);
    const clientResult = sqlite.prepare(`
      INSERT INTO client_fx_deals
        (
          trade_id,
          trade_type,
          party_id,
          execution_context_id,
          pricing_rule_id,
          transfer_rate,
          analytical_pnl
        )
      VALUES (?, 'CLIENT_DEAL', ?, ?, ?, 1.1222, 27000)
    `).run(
      tradeId,
      pricingRule.party_id,
      pricingRule.execution_context_id,
      pricingRule.pricing_rule_id
    );

    if (clientResult.changes !== 1) {
      throw new Error("Initial Client FX Deal was not created.");
    }

    sqlite.prepare(`
      INSERT INTO fx_trade_market_snapshot
        (
          trade_id,
          trade_type,
          market_pulse_stream_status,
          market_pulse_bid,
          market_pulse_offer,
          market_pulse_timestamp
        )
      VALUES (?, 'CLIENT_DEAL', 'RUNNING', 1.1220, 1.1222, '2026-07-15T09:30:00.000Z')
    `).run(tradeId);
  });
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
      base_ccy.fraction_digits AS baseCurrencyFractionDigits,
      quote_ccy.fraction_digits AS quoteCurrencyFractionDigits,
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
    INNER JOIN ccy_options base_ccy ON base_ccy.ccy_code = p.base_ccy_code
    INNER JOIN ccy_options quote_ccy ON quote_ccy.ccy_code = p.quote_ccy_code
    LEFT JOIN market_quote_simulation_settings s
      ON s.ccy_pair_code = p.ccy_pair_code
    WHERE p.ccy_pair_code = ?
  `).get(pairCode) || null;
}

function fxTradeExposureAmounts(payload, generatedAmounts = null) {
  const pair = ccyPairOption(payload.ccyPairCode);

  if (!pair) {
    throw new Error(`Ccy Pair ${payload.ccyPairCode} was not found.`);
  }

  const baseFractionDigits = pair.baseCurrencyFractionDigits;
  const quoteFractionDigits = pair.quoteCurrencyFractionDigits;
  const dealtCcyCode = normalizedText(payload.dealtCcyCode || pair.baseCcy).toUpperCase();

  if (!/^[A-Z]{3}$/.test(dealtCcyCode)
    || ![pair.baseCcy, pair.quoteCcy].includes(dealtCcyCode)) {
    throw new Error(
      `Dealt Ccy Code must be ${pair.baseCcy} or ${pair.quoteCcy} for ${pair.currencyPair}.`
    );
  }

  let calculatedBaseMinor;
  let calculatedQuoteMinor;

  if (payload.dealtCcyAmount !== null
    && payload.dealtCcyAmount !== undefined
    && String(payload.dealtCcyAmount).trim() !== "") {
    const calculated = calculateFxAmountsFromDealt({
      dealtAmount: String(payload.dealtCcyAmount),
      dealtCcyCode,
      baseCcyCode: pair.baseCcy,
      quoteCcyCode: pair.quoteCcy,
      baseFractionDigits,
      quoteFractionDigits,
      rate: String(payload.tradeRate)
    });
    calculatedBaseMinor = calculated.baseAmountMinor;
    calculatedQuoteMinor = calculated.quoteAmountMinor;
  } else {
    calculatedBaseMinor = majorToMinor(String(payload.baseCcyAmount), baseFractionDigits);
    calculatedQuoteMinor = majorToMinor(String(payload.quoteCcyAmount), quoteFractionDigits);
  }

  const baseMinor = generatedAmounts?.baseCcyAmountMinor ?? calculatedBaseMinor;
  const quoteMinor = generatedAmounts?.quoteCcyAmountMinor ?? calculatedQuoteMinor;

  if (generatedAmounts) {
    if (generatedAmounts.baseCcyFractionDigits !== baseFractionDigits
      || generatedAmounts.quoteCcyFractionDigits !== quoteFractionDigits) {
      throw new Error("Generated FX Trade currency fraction digits do not match Reference Data.");
    }

    if (BigInt(baseMinor) !== calculatedBaseMinor || BigInt(quoteMinor) !== calculatedQuoteMinor) {
      throw new Error("Generated FX Trade major and minor amounts are inconsistent.");
    }
  }

  return {
    dealtCcyCode,
    baseCcyAmountMinor: minorToSafeInteger(baseMinor, "Base Ccy Amount Minor"),
    baseCcyFractionDigits: baseFractionDigits,
    quoteCcyAmountMinor: minorToSafeInteger(quoteMinor, "Quote Ccy Amount Minor"),
    quoteCcyFractionDigits: quoteFractionDigits,
    baseCcyAmount: minorToMajor(baseMinor, baseFractionDigits),
    quoteCcyAmount: minorToMajor(quoteMinor, quoteFractionDigits)
  };
}

function fxTradeRowWithMajorAmounts(row) {
  return {
    ...row,
    baseCcyAmount: Number(minorToMajor(
      row.baseCcyAmountMinor,
      row.baseCcyFractionDigits
    )),
    quoteCcyAmount: Number(minorToMajor(
      row.quoteCcyAmountMinor,
      row.quoteCcyFractionDigits
    ))
  };
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

function users() {
  return database.prepare(`
    SELECT
      user_id AS userId,
      user_code AS userCode,
      first_name AS firstName,
      last_name AS lastName,
      user_role AS userRole,
      is_active AS active
    FROM users
    ORDER BY last_name, first_name, user_code
  `).all().map(user => ({ ...user, active: user.active === 1 }));
}

function user(userId) {
  return users().find(item => item.userId === Number(userId)) || null;
}

function pricingRules(pricingMode = null) {
  return database.prepare(`
    SELECT
      r.pricing_rule_id AS pricingRuleId,
      r.party_id AS partyId,
      p.party_type AS partyType,
      p.party_code AS partyCode,
      p.party_code_type AS partyCodeType,
      p.party_name AS partyName,
      r.execution_context_id AS executionContextId,
      r.ccy_pair_code AS ccyPairCode,
      c.base_ccy_code || '/' || c.quote_ccy_code AS currencyPair,
      r.margin_percent AS marginPercent,
      e.pricing_mode AS pricingMode
    FROM pricing_rules r
    INNER JOIN trading_parties p ON p.party_id = r.party_id
    INNER JOIN ccy_pair_options c ON c.ccy_pair_code = r.ccy_pair_code
    INNER JOIN execution_contexts x ON x.execution_context_id = r.execution_context_id
    INNER JOIN execution_systems e ON e.execution_system_id = x.execution_system_id
    WHERE (? IS NULL OR e.pricing_mode = ?)
    ORDER BY p.party_name, c.ccy_pair_code, r.execution_context_id
  `).all(pricingMode, pricingMode);
}

function pricingRule(pricingRuleId) {
  return pricingRules().find(rule => rule.pricingRuleId === Number(pricingRuleId)) || null;
}

function clientDealPricingRules() {
  return pricingRules("DEALER_PRICED");
}

function clientDealPricingRule(pricingRuleId) {
  return clientDealPricingRules()
    .find(rule => rule.pricingRuleId === Number(pricingRuleId)) || null;
}

function hedgeDealPricingRules() {
  return pricingRules("DEALER_PRICED").filter(rule => {
    const party = tradingParty(rule.partyId);
    const context = executionContext(rule.executionContextId);
    const system = context ? executionSystem(context.executionSystemId) : null;

    return party?.partyType === "HEDGE_COUNTERPARTY"
      && party.active
      && Boolean(system?.active);
  });
}

function hedgeDealPricingRule(pricingRuleId) {
  return hedgeDealPricingRules()
    .find(rule => rule.pricingRuleId === Number(pricingRuleId)) || null;
}

function clientDealGenerationSettings() {
  return database.prepare(`
    SELECT
      s.pricing_rule_id AS pricingRuleId,
      r.party_id AS partyId,
      p.party_type AS partyType,
      p.party_code AS partyCode,
      p.party_code_type AS partyCodeType,
      p.party_name AS partyName,
      p.is_active AS partyActive,
      r.execution_context_id AS executionContextId,
      r.ccy_pair_code AS ccyPairCode,
      pair.base_ccy_code || '/' || pair.quote_ccy_code AS currencyPair,
      pair.default_quote_decimals AS defaultQuoteDecimals,
      base_ccy.fraction_digits AS baseCurrencyFractionDigits,
      quote_ccy.fraction_digits AS quoteCurrencyFractionDigits,
      r.margin_percent AS marginPercent,
      location.servicing_location_id AS servicingLocationId,
      location.name AS servicingLocationName,
      context.accounting_system_id AS accountingSystemId,
      COALESCE(accounting.name, 'Not applicable') AS accountingSystemName,
      execution.execution_system_id AS executionSystemId,
      execution.name AS executionSystemName,
      execution.pricing_mode AS pricingMode,
      execution.is_active AS executionSystemActive,
      s.min_base_ccy_amount AS minBaseCcyAmount,
      s.max_base_ccy_amount AS maxBaseCcyAmount,
      s.base_ccy_amount_step AS baseCcyAmountStep,
      s.buy_probability_percent AS buyProbabilityPercent,
      100 - s.buy_probability_percent AS sellProbabilityPercent,
      s.is_active AS active
    FROM client_deal_generation_settings s
    INNER JOIN pricing_rules r ON r.pricing_rule_id = s.pricing_rule_id
    INNER JOIN trading_parties p ON p.party_id = r.party_id
    INNER JOIN ccy_pair_options pair ON pair.ccy_pair_code = r.ccy_pair_code
    INNER JOIN ccy_options base_ccy ON base_ccy.ccy_code = pair.base_ccy_code
    INNER JOIN ccy_options quote_ccy ON quote_ccy.ccy_code = pair.quote_ccy_code
    INNER JOIN execution_contexts context ON context.execution_context_id = r.execution_context_id
    INNER JOIN servicing_locations location
      ON location.servicing_location_id = context.servicing_location_id
    LEFT JOIN accounting_systems accounting
      ON accounting.accounting_system_id = context.accounting_system_id
    INNER JOIN execution_systems execution
      ON execution.execution_system_id = context.execution_system_id
    WHERE p.party_type = 'CLIENT'
      AND execution.pricing_mode = 'AUTO_PRICED'
    ORDER BY p.party_name, pair.ccy_pair_code, s.pricing_rule_id
  `).all().map(settings => ({
    ...settings,
    active: settings.active === 1,
    partyActive: settings.partyActive === 1,
    executionSystemActive: settings.executionSystemActive === 1
  }));
}

function clientDealGenerationSetting(pricingRuleId) {
  return clientDealGenerationSettings()
    .find(settings => settings.pricingRuleId === Number(pricingRuleId)) || null;
}

function eligibleClientDealGenerationSettings() {
  return clientDealGenerationSettings()
    .filter(settings =>
      settings.active
      && settings.partyActive
      && settings.executionSystemActive
      && settings.pricingMode === "AUTO_PRICED"
    );
}

function updateClientDealGenerationSettings(pricingRuleId, payload) {
  const result = database.prepare(`
    UPDATE client_deal_generation_settings
    SET
      min_base_ccy_amount = ?,
      max_base_ccy_amount = ?,
      base_ccy_amount_step = ?,
      buy_probability_percent = ?,
      is_active = ?
    WHERE pricing_rule_id = ?
  `).run(
    payload.minBaseCcyAmount,
    payload.maxBaseCcyAmount,
    payload.baseCcyAmountStep,
    payload.buyProbabilityPercent,
    payload.active ? 1 : 0,
    pricingRuleId
  );

  return result.changes === 1;
}

function ensureClientDealGenerationSettingsForPricingRule(pricingRuleId) {
  database.prepare(`
    INSERT OR IGNORE INTO client_deal_generation_settings
      (
        pricing_rule_id,
        min_base_ccy_amount,
        max_base_ccy_amount,
        base_ccy_amount_step,
        buy_probability_percent,
        is_active
      )
    SELECT
      r.pricing_rule_id,
      500000,
      1500000,
      100000,
      50,
      1
    FROM pricing_rules r
    INNER JOIN trading_parties p ON p.party_id = r.party_id
    INNER JOIN execution_contexts c ON c.execution_context_id = r.execution_context_id
    INNER JOIN execution_systems e ON e.execution_system_id = c.execution_system_id
    WHERE r.pricing_rule_id = ?
      AND p.party_type = 'CLIENT'
      AND e.pricing_mode = 'AUTO_PRICED'
  `).run(pricingRuleId);
}

function clientFxDeals() {
  return database.prepare(`
    SELECT
      e.trade_id AS tradeId,
      e.trade_id AS clientDealId,
      e.entry_timestamp AS entryTimestamp,
      d.party_id AS partyId,
      d.execution_context_id AS executionContextId,
      d.pricing_rule_id AS pricingRuleId,
      r.margin_percent AS pricingRuleMargin,
      d.transfer_rate AS transferRate,
      d.analytical_pnl AS analyticalPnl,
      d.comment,
      a.market_pulse_stream_status AS marketPulseStreamStatus,
      a.market_pulse_bid AS marketPulseBid,
      a.market_pulse_offer AS marketPulseOffer,
      a.market_pulse_timestamp AS marketPulseTimestamp,
      p.party_code AS clientCode,
      p.party_code_type AS clientCodeType,
      p.party_name AS clientName,
      e.trade_date AS tradeDate,
      e.ccy_pair_code AS ccyPairCode,
      pair.base_ccy_code || '/' || pair.quote_ccy_code AS currencyPair,
      e.base_ccy_side AS side,
      e.dealt_ccy_code AS dealtCcyCode,
      e.base_ccy_amount_minor AS baseCcyAmountMinor,
      e.base_ccy_fraction_digits AS baseCcyFractionDigits,
      e.quote_ccy_amount_minor AS quoteCcyAmountMinor,
      e.quote_ccy_fraction_digits AS quoteCcyFractionDigits,
      e.trade_rate AS tradeRate,
      e.tenor,
      e.base_ccy_value_date AS baseCcyValueDate,
      e.quote_ccy_value_date AS quoteCcyValueDate
    FROM client_fx_deals d
    INNER JOIN fx_trade_exposure e
      ON e.trade_id = d.trade_id AND e.trade_type = d.trade_type
    INNER JOIN trading_parties p ON p.party_id = d.party_id
    INNER JOIN ccy_pair_options pair ON pair.ccy_pair_code = e.ccy_pair_code
    LEFT JOIN pricing_rules r ON r.pricing_rule_id = d.pricing_rule_id
    LEFT JOIN fx_trade_market_snapshot a
      ON a.trade_id = e.trade_id AND a.trade_type = e.trade_type
    ORDER BY e.trade_id
  `).all().map(fxTradeRowWithMajorAmounts);
}

function clientFxDeal(clientDealId) {
  return clientFxDeals().find(deal => deal.clientDealId === Number(clientDealId)) || null;
}

function hedgeFxDeals() {
  return database.prepare(`
    SELECT
      e.trade_id AS tradeId,
      e.trade_id AS hedgeDealId,
      e.entry_timestamp AS entryTimestamp,
      d.party_id AS partyId,
      d.execution_context_id AS executionContextId,
      d.pricing_rule_id AS pricingRuleId,
      r.margin_percent AS pricingRuleMargin,
      d.transfer_rate AS transferRate,
      d.analytical_pnl AS analyticalPnl,
      a.market_pulse_stream_status AS marketPulseStreamStatus,
      a.market_pulse_bid AS marketPulseBid,
      a.market_pulse_offer AS marketPulseOffer,
      a.market_pulse_timestamp AS marketPulseTimestamp,
      p.party_code AS partyCode,
      p.party_code_type AS partyCodeType,
      p.party_name AS partyName,
      e.trade_date AS tradeDate,
      e.ccy_pair_code AS ccyPairCode,
      pair.base_ccy_code || '/' || pair.quote_ccy_code AS currencyPair,
      e.base_ccy_side AS side,
      e.dealt_ccy_code AS dealtCcyCode,
      e.base_ccy_amount_minor AS baseCcyAmountMinor,
      e.base_ccy_fraction_digits AS baseCcyFractionDigits,
      e.quote_ccy_amount_minor AS quoteCcyAmountMinor,
      e.quote_ccy_fraction_digits AS quoteCcyFractionDigits,
      e.trade_rate AS tradeRate,
      e.tenor,
      e.base_ccy_value_date AS baseCcyValueDate,
      e.quote_ccy_value_date AS quoteCcyValueDate
    FROM fx_hedge_deals d
    INNER JOIN fx_trade_exposure e
      ON e.trade_id = d.trade_id AND e.trade_type = d.trade_type
    INNER JOIN trading_parties p ON p.party_id = d.party_id
    INNER JOIN ccy_pair_options pair ON pair.ccy_pair_code = e.ccy_pair_code
    LEFT JOIN pricing_rules r ON r.pricing_rule_id = d.pricing_rule_id
    LEFT JOIN fx_trade_market_snapshot a
      ON a.trade_id = e.trade_id AND a.trade_type = e.trade_type
    ORDER BY e.trade_id
  `).all().map(fxTradeRowWithMajorAmounts);
}

function hedgeFxDeal(hedgeDealId) {
  return hedgeFxDeals().find(deal => deal.hedgeDealId === Number(hedgeDealId)) || null;
}

function batchBalancingTrades() {
  return database.prepare(`
    SELECT
      b.batch_trade_id AS batchTradeId,
      b.batch_pair_id AS batchPairId,
      b.batch_id AS batchId,
      b.trade_type AS tradeType,
      b.trade_id AS tradeId,
      b.created_at AS createdAt,
      e.entry_timestamp AS entryTimestamp,
      e.trade_date AS tradeDate,
      e.ccy_pair_code AS ccyPairCode,
      pair.base_ccy_code || '/' || pair.quote_ccy_code AS currencyPair,
      e.base_ccy_side AS side,
      e.dealt_ccy_code AS dealtCcyCode,
      e.base_ccy_amount_minor AS baseCcyAmountMinor,
      e.base_ccy_fraction_digits AS baseCcyFractionDigits,
      e.quote_ccy_amount_minor AS quoteCcyAmountMinor,
      e.quote_ccy_fraction_digits AS quoteCcyFractionDigits,
      e.trade_rate AS tradeRate,
      e.tenor,
      e.base_ccy_value_date AS baseCcyValueDate,
      e.quote_ccy_value_date AS quoteCcyValueDate
    FROM batch_balancing_trades b
    INNER JOIN fx_trade_exposure e
      ON e.trade_id = b.trade_id AND e.trade_type = b.trade_type
    INNER JOIN ccy_pair_options pair ON pair.ccy_pair_code = e.ccy_pair_code
    ORDER BY b.batch_id, b.batch_pair_id, b.batch_trade_id
  `).all().map(fxTradeRowWithMajorAmounts);
}

function batchBalancingTradeSources(tradeIds) {
  const placeholders = tradeIds.map(() => "?").join(", ");
  const sourceTrades = database.prepare(`
    SELECT
      e.trade_id AS tradeId,
      e.trade_type AS tradeType,
      e.ccy_pair_code AS ccyPairCode,
      e.trade_date AS tradeDate,
      e.base_ccy_side AS side,
      e.dealt_ccy_code AS dealtCcyCode,
      e.base_ccy_amount_minor AS baseCcyAmountMinor,
      e.base_ccy_fraction_digits AS baseCcyFractionDigits,
      e.quote_ccy_amount_minor AS quoteCcyAmountMinor,
      e.quote_ccy_fraction_digits AS quoteCcyFractionDigits,
      COALESCE(c.transfer_rate, h.transfer_rate, e.trade_rate) AS transferRate,
      e.tenor,
      e.base_ccy_value_date AS baseCcyValueDate,
      e.quote_ccy_value_date AS quoteCcyValueDate,
      pair.default_quote_decimals AS rateFractionDigits,
      quote_ccy.fraction_digits AS quoteFractionDigits
    FROM fx_trade_exposure e
    INNER JOIN ccy_pair_options pair ON pair.ccy_pair_code = e.ccy_pair_code
    INNER JOIN ccy_options quote_ccy ON quote_ccy.ccy_code = pair.quote_ccy_code
    LEFT JOIN client_fx_deals c
      ON c.trade_id = e.trade_id AND c.trade_type = e.trade_type
    LEFT JOIN fx_hedge_deals h
      ON h.trade_id = e.trade_id AND h.trade_type = e.trade_type
    WHERE e.trade_id IN (${placeholders})
      AND e.trade_type IN ('CLIENT_DEAL', 'HEDGE_DEAL')
    ORDER BY e.trade_id
  `).all(...tradeIds).map(fxTradeRowWithMajorAmounts);
  const foundTradeIds = new Set(sourceTrades.map(trade => trade.tradeId));
  const missingTradeIds = tradeIds.filter(tradeId => !foundTradeIds.has(tradeId));

  if (missingTradeIds.length > 0) {
    const error = new Error(
      `Trade ${missingTradeIds.join(", ")} was not found or is not a Client/Hedge FX Deal.`
    );
    error.code = "BATCH_SOURCE_TRADE_NOT_FOUND";
    throw error;
  }

  return sourceTrades;
}

function createBatchBalancingTradePair(sourceTradeIds) {
  return runInImmediateTransaction(database, () => {
    const sourceTrades = batchBalancingTradeSources(sourceTradeIds);
    const calculation = calculateBatchBalancingTradePair({
      trades: sourceTrades,
      rateFractionDigits: sourceTrades[0].rateFractionDigits,
      quoteFractionDigits: sourceTrades[0].quoteFractionDigits
    });
    const batchId = Number(database.prepare(`
      SELECT COALESCE(MAX(batch_id), 0) + 1 AS nextId
      FROM batch_balancing_trades
    `).get().nextId);
    const batchPairId = Number(database.prepare(`
      SELECT COALESCE(MAX(batch_pair_id), 0) + 1 AS nextId
      FROM batch_balancing_trades
    `).get().nextId);
    const insertExposure = database.prepare(`
      INSERT INTO fx_trade_exposure
        (
          entry_timestamp,
          trade_type,
          trade_date,
          ccy_pair_code,
          base_ccy_side,
          dealt_ccy_code,
          base_ccy_amount_minor,
          base_ccy_fraction_digits,
          quote_ccy_amount_minor,
          quote_ccy_fraction_digits,
          trade_rate,
          tenor,
          base_ccy_value_date,
          quote_ccy_value_date
        )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertBatchTrade = database.prepare(`
      INSERT INTO batch_balancing_trades
        (batch_pair_id, batch_id, trade_type, trade_id)
      VALUES (?, ?, ?, ?)
    `);
    const createdTradeIds = [
      calculation.balancingTrade,
      calculation.positionOutTrade
    ].map(trade => {
      const exposureAmounts = fxTradeExposureAmounts(trade);
      const exposureResult = insertExposure.run(
        trade.entryTimestamp,
        trade.tradeType,
        trade.tradeDate,
        trade.ccyPairCode,
        trade.side,
        exposureAmounts.dealtCcyCode,
        exposureAmounts.baseCcyAmountMinor,
        exposureAmounts.baseCcyFractionDigits,
        exposureAmounts.quoteCcyAmountMinor,
        exposureAmounts.quoteCcyFractionDigits,
        trade.tradeRate,
        trade.tenor,
        trade.baseCcyValueDate,
        trade.quoteCcyValueDate
      );
      const tradeId = Number(exposureResult.lastInsertRowid);

      insertBatchTrade.run(batchPairId, batchId, trade.tradeType, tradeId);
      return tradeId;
    });
    const createdTradeIdSet = new Set(createdTradeIds);

    return {
      batchId,
      batchPairId,
      sourceTradeIds: calculation.sourceTradeIds,
      sourceNetSide: calculation.sourceNetSide,
      sourceNetBaseCcyAmount: calculation.sourceNetBaseCcyAmount,
      sourceNetTransferQuoteAmount: calculation.sourceNetTransferQuoteAmount,
      balancingRate: calculation.balancingTrade.tradeRate,
      roundingResidualQuoteAmount: calculation.roundingResidualQuoteAmount,
      trades: batchBalancingTrades().filter(trade => createdTradeIdSet.has(trade.tradeId))
    };
  });
}

function deleteBatchBalancingTrades(tradeIds) {
  return runInImmediateTransaction(database, () => {
    const placeholders = tradeIds.map(() => "?").join(", ");
    const storedTrades = database.prepare(`
      SELECT trade_id AS tradeId, trade_type AS tradeType
      FROM batch_balancing_trades
      WHERE trade_id IN (${placeholders})
        AND trade_type IN ('BATCH_BALANCING_TRADE', 'BATCH_POSITION_OUT')
      ORDER BY trade_id
    `).all(...tradeIds);
    const storedTradeIds = new Set(storedTrades.map(trade => trade.tradeId));
    const missingTradeIds = tradeIds.filter(tradeId => !storedTradeIds.has(tradeId));

    if (missingTradeIds.length > 0) {
      const error = new Error(
        `Trade ${missingTradeIds.join(", ")} was not found or is not a generated Batch Trade.`
      );
      error.code = "BATCH_GENERATED_TRADE_NOT_FOUND";
      throw error;
    }

    const subtypeResult = database.prepare(`
      DELETE FROM batch_balancing_trades
      WHERE trade_id IN (${placeholders})
        AND trade_type IN ('BATCH_BALANCING_TRADE', 'BATCH_POSITION_OUT')
    `).run(...tradeIds);

    if (subtypeResult.changes !== tradeIds.length) {
      throw new Error("Not every selected generated Batch Trade was deleted.");
    }

    const exposureResult = database.prepare(`
      DELETE FROM fx_trade_exposure
      WHERE trade_id IN (${placeholders})
        AND trade_type IN ('BATCH_BALANCING_TRADE', 'BATCH_POSITION_OUT')
    `).run(...tradeIds);

    if (exposureResult.changes !== tradeIds.length) {
      throw new Error("Not every generated FX Trade Exposure was deleted.");
    }

    return {
      deletedTradeIds: [...tradeIds].sort((left, right) => left - right)
    };
  });
}

function clientFxDealWithCalculatedEconomics(payload, exposureAmounts) {
  const pair = ccyPairOption(payload.ccyPairCode);
  const quoteCurrency = ccyOptions().find(currency => currency.code === pair.quoteCcy);
  const pnlFractionDigits = quoteCurrency?.fractionDigits ?? 2;
  const baseCcyAmount = exposureAmounts.baseCcyAmount;

  if (payload.pricingRuleId === null) {
    const transferRate = roundToFractionDigits(
      payload.transferRate,
      pair.defaultQuoteDecimals
    );
    const analyticalPnl = calculateAnalyticalPnl({
      clientSide: payload.side,
      baseCcyAmount,
      tradeRate: payload.tradeRate,
      transferRate,
      pnlFractionDigits
    });

    return {
      ...payload,
      baseCcyAmount,
      quoteCcyAmount: exposureAmounts.quoteCcyAmount,
      transferRate,
      analyticalPnl
    };
  }

  const rule = pricingRule(payload.pricingRuleId);
  const economics = calculateClientFxDealEconomics({
    clientSide: payload.side,
    baseCcyAmount,
    tradeRate: payload.tradeRate,
    marginPercent: rule.marginPercent,
    rateFractionDigits: pair.defaultQuoteDecimals,
    pnlFractionDigits
  });

  return {
    ...payload,
    baseCcyAmount,
    quoteCcyAmount: exposureAmounts.quoteCcyAmount,
    ...economics
  };
}

function createClientFxDeal(payload, suppliedExposureAmounts = null) {
  return runInImmediateTransaction(database, () => {
    const exposureAmounts = suppliedExposureAmounts || fxTradeExposureAmounts(payload);
    const exposureResult = database.prepare(`
      INSERT INTO fx_trade_exposure
        (
          entry_timestamp,
          trade_type,
          trade_date,
          ccy_pair_code,
          base_ccy_side,
          dealt_ccy_code,
          base_ccy_amount_minor,
          base_ccy_fraction_digits,
          quote_ccy_amount_minor,
          quote_ccy_fraction_digits,
          trade_rate,
          tenor,
          base_ccy_value_date,
          quote_ccy_value_date
        )
      VALUES (?, 'CLIENT_DEAL', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      payload.entryTimestamp,
      payload.tradeDate,
      payload.ccyPairCode,
      payload.side,
      exposureAmounts.dealtCcyCode,
      exposureAmounts.baseCcyAmountMinor,
      exposureAmounts.baseCcyFractionDigits,
      exposureAmounts.quoteCcyAmountMinor,
      exposureAmounts.quoteCcyFractionDigits,
      payload.tradeRate,
      payload.tenor,
      payload.baseCcyValueDate,
      payload.quoteCcyValueDate
    );
    const tradeId = Number(exposureResult.lastInsertRowid);

    database.prepare(`
      INSERT INTO client_fx_deals
        (
          trade_id,
          trade_type,
          party_id,
          execution_context_id,
          pricing_rule_id,
          transfer_rate,
          analytical_pnl,
          comment
        )
      VALUES (?, 'CLIENT_DEAL', ?, ?, ?, ?, ?, ?)
    `).run(
      tradeId,
      payload.partyId,
      payload.executionContextId,
      payload.pricingRuleId,
      payload.transferRate,
      payload.analyticalPnl,
      payload.comment
    );

    database.prepare(`
      INSERT INTO fx_trade_market_snapshot
        (
          trade_id,
          trade_type,
          market_pulse_stream_status,
          market_pulse_bid,
          market_pulse_offer,
          market_pulse_timestamp
        )
      VALUES (?, 'CLIENT_DEAL', ?, ?, ?, ?)
    `).run(
      tradeId,
      payload.marketPulseStreamStatus,
      payload.marketPulseBid,
      payload.marketPulseOffer,
      payload.marketPulseTimestamp
    );

    return tradeId;
  });
}

function hedgeFxDealWithCalculatedTerms(payload, exposureAmounts) {
  const rule = hedgeDealPricingRule(payload.pricingRuleId);
  const pair = ccyPairOption(rule.ccyPairCode);
  const terms = createHedgeFxDealTerms({
    hedgeSide: payload.side,
    baseCcyAmount: exposureAmounts.baseCcyAmount,
    tradeRate: payload.tradeRate,
    tenor: payload.tenor,
    marginPercent: rule.marginPercent,
    rateFractionDigits: pair.defaultQuoteDecimals,
    baseFractionDigits: exposureAmounts.baseCcyFractionDigits,
    quoteFractionDigits: exposureAmounts.quoteCcyFractionDigits
  });
  const marketPulseSnapshot = marketPulseSimulator.snapshot();
  const marketQuote = marketPulseSnapshot.quotes
    .find(quote => quote.pairCode === rule.ccyPairCode);

  return {
    ...terms,
    partyId: rule.partyId,
    executionContextId: rule.executionContextId,
    pricingRuleId: rule.pricingRuleId,
    ccyPairCode: rule.ccyPairCode,
    dealtCcyCode: exposureAmounts.dealtCcyCode,
    dealtCcyAmount: payload.dealtCcyAmount,
    baseCcyAmount: exposureAmounts.baseCcyAmount,
    quoteCcyAmount: exposureAmounts.quoteCcyAmount,
    tradeRate: payload.tradeRate,
    marketPulseStreamStatus: marketPulseSnapshot.status,
    marketPulseBid: marketQuote?.bid ?? null,
    marketPulseOffer: marketQuote?.offer ?? null,
    marketPulseTimestamp: marketQuote ? marketPulseSnapshot.generatedAt : null
  };
}

function createHedgeFxDeal(payload, suppliedExposureAmounts = null) {
  return runInImmediateTransaction(database, () => {
    const exposureAmounts = suppliedExposureAmounts || fxTradeExposureAmounts(payload);
    const exposureResult = database.prepare(`
      INSERT INTO fx_trade_exposure
        (
          entry_timestamp,
          trade_type,
          trade_date,
          ccy_pair_code,
          base_ccy_side,
          dealt_ccy_code,
          base_ccy_amount_minor,
          base_ccy_fraction_digits,
          quote_ccy_amount_minor,
          quote_ccy_fraction_digits,
          trade_rate,
          tenor,
          base_ccy_value_date,
          quote_ccy_value_date
        )
      VALUES (?, 'HEDGE_DEAL', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      payload.entryTimestamp,
      payload.tradeDate,
      payload.ccyPairCode,
      payload.side,
      exposureAmounts.dealtCcyCode,
      exposureAmounts.baseCcyAmountMinor,
      exposureAmounts.baseCcyFractionDigits,
      exposureAmounts.quoteCcyAmountMinor,
      exposureAmounts.quoteCcyFractionDigits,
      payload.tradeRate,
      payload.tenor,
      payload.baseCcyValueDate,
      payload.quoteCcyValueDate
    );
    const tradeId = Number(exposureResult.lastInsertRowid);

    database.prepare(`
      INSERT INTO fx_hedge_deals
        (
          trade_id,
          trade_type,
          party_id,
          execution_context_id,
          pricing_rule_id,
          transfer_rate,
          analytical_pnl
        )
      VALUES (?, 'HEDGE_DEAL', ?, ?, ?, ?, ?)
    `).run(
      tradeId,
      payload.partyId,
      payload.executionContextId,
      payload.pricingRuleId,
      payload.transferRate,
      payload.analyticalPnl
    );

    database.prepare(`
      INSERT INTO fx_trade_market_snapshot
        (
          trade_id,
          trade_type,
          market_pulse_stream_status,
          market_pulse_bid,
          market_pulse_offer,
          market_pulse_timestamp
        )
      VALUES (?, 'HEDGE_DEAL', ?, ?, ?, ?)
    `).run(
      tradeId,
      payload.marketPulseStreamStatus,
      payload.marketPulseBid,
      payload.marketPulseOffer,
      payload.marketPulseTimestamp
    );

    return tradeId;
  });
}

function updateClientFxDealComment(tradeId, comment) {
  const result = database.prepare(`
    UPDATE client_fx_deals
    SET comment = ?
    WHERE trade_id = ? AND trade_type = 'CLIENT_DEAL'
  `).run(comment, tradeId);

  return result.changes === 1;
}

function deleteClientFxDeal(tradeId) {
  return runInImmediateTransaction(database, () => {
    database.prepare(`
      DELETE FROM fx_trade_market_snapshot
      WHERE trade_id = ? AND trade_type = 'CLIENT_DEAL'
    `).run(tradeId);

    const clientResult = database.prepare(`
      DELETE FROM client_fx_deals
      WHERE trade_id = ? AND trade_type = 'CLIENT_DEAL'
    `).run(tradeId);

    if (clientResult.changes === 0) {
      return false;
    }

    const exposureResult = database.prepare(`
      DELETE FROM fx_trade_exposure
      WHERE trade_id = ? AND trade_type = 'CLIENT_DEAL'
    `).run(tradeId);

    if (exposureResult.changes !== 1) {
      throw new Error(`FX Trade Exposure ${tradeId} was not deleted with its Client FX Deal.`);
    }

    return true;
  });
}

function deleteHedgeFxDeal(tradeId) {
  return runInImmediateTransaction(database, () => {
    database.prepare(`
      DELETE FROM fx_trade_market_snapshot
      WHERE trade_id = ? AND trade_type = 'HEDGE_DEAL'
    `).run(tradeId);

    const hedgeResult = database.prepare(`
      DELETE FROM fx_hedge_deals
      WHERE trade_id = ? AND trade_type = 'HEDGE_DEAL'
    `).run(tradeId);

    if (hedgeResult.changes === 0) {
      return false;
    }

    const exposureResult = database.prepare(`
      DELETE FROM fx_trade_exposure
      WHERE trade_id = ? AND trade_type = 'HEDGE_DEAL'
    `).run(tradeId);

    if (exposureResult.changes !== 1) {
      throw new Error(`FX Trade Exposure ${tradeId} was not deleted with its Hedge FX Deal.`);
    }

    return true;
  });
}

const marketPulseSimulator = new MarketPulseSimulator({
  loadConfigurations: marketPulseSimulationConfigurations
});

function clientDealGenerationError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function configuredClientDealGenerationSettings() {
  const settings = eligibleClientDealGenerationSettings();

  if (settings.length === 0) {
    throw clientDealGenerationError(
      "CLIENT_DEAL_GENERATION_NOT_CONFIGURED",
      "Activate Client Deal Generation Settings for at least one active AUTO_PRICED CLIENT Pricing Rule."
    );
  }

  return settings;
}

function generateOneClientFxDeal() {
  const settings = configuredClientDealGenerationSettings();
  const marketPulseSnapshot = marketPulseSimulator.snapshot();
  const settingsWithQuotes = settings
    .map(item => ({
      settings: item,
      quote: marketPulseSnapshot.quotes.find(quote => quote.pairCode === item.ccyPairCode)
    }))
    .filter(item => item.quote);

  if (settingsWithQuotes.length === 0) {
    throw clientDealGenerationError(
      "CLIENT_DEAL_GENERATION_MARKET_QUOTE_NOT_FOUND",
      "Market Pulse has no quote for any active Client Deal Generation Pricing Rule."
    );
  }

  const selected = settingsWithQuotes[Math.floor(Math.random() * settingsWithQuotes.length)];
  const pair = ccyPairOption(selected.settings.ccyPairCode);
  const payload = generatedClientFxDeal({
    settings: selected.settings,
    marketPulseSnapshot,
    quote: selected.quote,
    pair
  });
  const validation = validateClientFxDealPayload(payload);

  if (validation.error) {
    throw clientDealGenerationError(
      "GENERATED_CLIENT_FX_DEAL_INVALID",
      validation.error
    );
  }

  const exposureAmounts = fxTradeExposureAmounts(validation);
  const tradeId = createClientFxDeal(
    clientFxDealWithCalculatedEconomics(validation, exposureAmounts),
    exposureAmounts
  );
  return clientFxDeal(tradeId);
}

const clientDealGenerationProcess = new ClientDealGenerationProcess({
  generateOne: generateOneClientFxDeal,
  intervalMs: CLIENT_DEAL_GENERATION_INTERVAL_MS
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

function normalizedPositiveDecimalText(value) {
  const text = normalizedText(value);

  if (!/^(?:\d+)(?:\.\d+)?$/.test(text) || !/[1-9]/.test(text)) {
    return null;
  }

  return text;
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

function optionalPositiveInteger(value) {
  if (value === null || value === undefined || String(value).trim() === "") {
    return null;
  }

  const number = integerInRange(value, 1, Number.MAX_SAFE_INTEGER);
  return number === null ? NaN : number;
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
    return { error: "Party Type must be CLIENT or HEDGE_COUNTERPARTY." };
  }

  if (!PARTY_CODE_TYPES.includes(partyCodeType)) {
    return { error: "Party Code Type must be INN, OTHER or FRONT_SYSTEM_FOLDER_ID." };
  }

  const validPartyCode = partyCodeType === "INN"
    ? /^\d{10,12}$/.test(partyCode)
    : new RegExp(`^[A-Z0-9_-]{2,${PARTY_CODE_MAX_LENGTH}}$`).test(partyCode);

  if (!validPartyCode) {
    return {
      error: partyCodeType === "INN"
        ? "Party Code with type INN must contain 10 to 12 digits."
        : `Party Code with type ${partyCodeType} must contain from 2 to ${PARTY_CODE_MAX_LENGTH} uppercase letters, digits, underscores or hyphens.`
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

function validateUserPayload(body) {
  const userCode = normalizedText(body.userCode).toUpperCase();
  const firstName = normalizedText(body.firstName);
  const lastName = normalizedText(body.lastName);
  const userRole = normalizedText(body.userRole).toUpperCase();
  const active = typeof body.active === "boolean" ? body.active : null;

  if (!new RegExp(`^[A-Z0-9._-]{2,${USER_CODE_MAX_LENGTH}}$`).test(userCode)) {
    return {
      error: `User Code must contain from 2 to ${USER_CODE_MAX_LENGTH} uppercase letters, digits, dots, underscores or hyphens.`
    };
  }

  if (!firstName || firstName.length > USER_NAME_MAX_LENGTH) {
    return { error: `First Name must contain from 1 to ${USER_NAME_MAX_LENGTH} characters.` };
  }

  if (!lastName || lastName.length > USER_NAME_MAX_LENGTH) {
    return { error: `Last Name must contain from 1 to ${USER_NAME_MAX_LENGTH} characters.` };
  }

  if (!USER_ROLES.includes(userRole)) {
    return { error: `Role must be ${USER_ROLES.join(", ")}.` };
  }

  if (active === null) {
    return { error: "Active must be a boolean value." };
  }

  return { userCode, firstName, lastName, userRole, active };
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

function validateClientDealGenerationSettingsPayload(body) {
  const minBaseCcyAmount = Number(body.minBaseCcyAmount);
  const maxBaseCcyAmount = Number(body.maxBaseCcyAmount);
  const baseCcyAmountStep = Number(body.baseCcyAmountStep);
  const buyProbabilityPercent = Number(body.buyProbabilityPercent);
  const active = typeof body.active === "boolean" ? body.active : null;

  if (![minBaseCcyAmount, maxBaseCcyAmount, baseCcyAmountStep]
    .every(value => Number.isFinite(value) && value > 0)) {
    return { error: "Min Amount, Max Amount and Amount Step must be positive numbers." };
  }

  if (maxBaseCcyAmount < minBaseCcyAmount) {
    return { error: "Max Base Ccy Amount must not be below Min Base Ccy Amount." };
  }

  if (!Number.isInteger(buyProbabilityPercent)
    || buyProbabilityPercent < 0
    || buyProbabilityPercent > 100) {
    return { error: "Buy Probability Percent must be an integer from 0 to 100." };
  }

  if (active === null) {
    return { error: "Active must be a boolean." };
  }

  return {
    minBaseCcyAmount,
    maxBaseCcyAmount,
    baseCcyAmountStep,
    buyProbabilityPercent,
    active
  };
}

function validateClientFxDealPayload(body) {
  const entryTimestamp = normalizedText(body.entryTimestamp);
  const partyId = integerInRange(body.partyId, 1, Number.MAX_SAFE_INTEGER);
  const executionContextId = optionalPositiveInteger(body.executionContextId);
  const pricingRuleId = optionalPositiveInteger(body.pricingRuleId);
  const manualPricingReason = normalizedText(body.manualPricingReason).toUpperCase();
  const transferRate = normalizedPositiveDecimalText(body.transferRate);
  const tradeDate = normalizedText(body.tradeDate);
  const ccyPairCode = normalizedText(body.ccyPairCode).toUpperCase();
  const side = normalizedText(body.side).toUpperCase();
  const dealtCcyCode = normalizedText(body.dealtCcyCode).toUpperCase();
  const dealtCcyAmount = normalizedPositiveDecimalText(body.dealtCcyAmount);
  const tradeRate = normalizedPositiveDecimalText(body.tradeRate);
  const tenor = normalizedText(body.tenor).toUpperCase();
  const baseCcyValueDate = normalizedText(body.baseCcyValueDate);
  const quoteCcyValueDate = normalizedText(body.quoteCcyValueDate);
  const marketPulseBidProvided = body.marketPulseBid !== null
    && body.marketPulseBid !== undefined
    && String(body.marketPulseBid).trim() !== "";
  const marketPulseOfferProvided = body.marketPulseOffer !== null
    && body.marketPulseOffer !== undefined
    && String(body.marketPulseOffer).trim() !== "";
  const marketPulseTimestamp = normalizedText(body.marketPulseTimestamp);
  const marketPulseStreamStatus = normalizedText(body.marketPulseStreamStatus).toUpperCase();
  const marketPulseBid = marketPulseBidProvided ? Number(body.marketPulseBid) : null;
  const marketPulseOffer = marketPulseOfferProvided ? Number(body.marketPulseOffer) : null;
  const comment = normalizedText(body.comment);

  if (comment.length > 500 || /[\r\n]/.test(comment)) {
    return { error: "Comment must be a single line of no more than 500 characters." };
  }

  if (!isIsoUtcTimestamp(entryTimestamp)) {
    return { error: "Entry Timestamp must be an ISO UTC timestamp with milliseconds." };
  }

  if (partyId === null) {
    return { error: "Party ID must be a positive integer." };
  }

  if (Number.isNaN(executionContextId)) {
    return { error: "Execution Context ID must be a positive integer when provided." };
  }

  if (Number.isNaN(pricingRuleId)) {
    return { error: "Pricing Rule ID must be a positive integer when provided." };
  }

  if (manualPricingReason
    && manualPricingReason !== CLIENT_ONBOARDING_MANUAL_PRICING) {
    return { error: "Manual Pricing Reason must be CLIENT_ONBOARDING when provided." };
  }

  if ((pricingRuleId === null) !== (executionContextId === null)) {
    return {
      error: "Pricing Rule ID and Execution Context ID must either both be provided or both be omitted."
    };
  }

  if (pricingRuleId === null
    && manualPricingReason !== CLIENT_ONBOARDING_MANUAL_PRICING) {
    return {
      error: "Pricing Rule ID is required unless Client Onboarding — Manual Pricing is selected."
    };
  }

  if (pricingRuleId !== null && manualPricingReason) {
    return {
      error: "Manual Pricing Reason cannot be used together with a Pricing Rule."
    };
  }

  if (pricingRuleId === null && transferRate === null) {
    return { error: "Transfer Rate must be a positive decimal for manual pricing." };
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

  if (!/^[A-Z]{3}$/.test(dealtCcyCode)) {
    return { error: "Dealt Ccy Code must contain exactly three uppercase Latin letters." };
  }

  if (dealtCcyAmount === null) {
    return { error: "Dealt Ccy Amount must be a positive decimal string." };
  }

  if (tradeRate === null) {
    return { error: "Trade Rate must be a positive decimal string." };
  }

  if (!["TOD", "TOM", "SPOT"].includes(tenor)) {
    return { error: "Tenor must be TOD, TOM or SPOT." };
  }

  if (!isIsoCalendarDate(baseCcyValueDate) || !isIsoCalendarDate(quoteCcyValueDate)) {
    return { error: "Base and Quote Ccy Value Dates must use YYYY-MM-DD format and be valid dates." };
  }

  if (marketPulseBidProvided !== marketPulseOfferProvided) {
    return { error: "Market Pulse Bid and Offer must be provided together." };
  }

  if (!["RUNNING", "STOPPED"].includes(marketPulseStreamStatus)) {
    return { error: "Market Pulse Stream Status must be RUNNING or STOPPED." };
  }

  if (marketPulseBidProvided
    && (!Number.isFinite(marketPulseBid)
      || marketPulseBid <= 0
      || !Number.isFinite(marketPulseOffer)
      || marketPulseOffer < marketPulseBid)) {
    return { error: "Market Pulse Bid and Offer must be positive numbers with Offer not below Bid." };
  }

  if (marketPulseBidProvided && !isIsoUtcTimestamp(marketPulseTimestamp)) {
    return { error: "Market Pulse Timestamp must be an ISO UTC timestamp with milliseconds." };
  }

  if (!marketPulseBidProvided && marketPulseTimestamp) {
    return { error: "Market Pulse Timestamp requires Bid and Offer." };
  }

  return {
    entryTimestamp,
    partyId,
    executionContextId,
    pricingRuleId,
    manualPricingReason: manualPricingReason || null,
    transferRate: pricingRuleId === null ? transferRate : null,
    tradeDate,
    ccyPairCode,
    side,
    dealtCcyCode,
    dealtCcyAmount,
    tradeRate,
    tenor,
    baseCcyValueDate,
    quoteCcyValueDate,
    marketPulseStreamStatus,
    marketPulseBid,
    marketPulseOffer,
    marketPulseTimestamp: marketPulseBidProvided ? marketPulseTimestamp : null,
    comment: comment || null
  };
}

function validateHedgeFxDealPayload(body) {
  const pricingRuleId = optionalPositiveInteger(body.pricingRuleId);
  const ccyPairCode = normalizedText(body.ccyPairCode).toUpperCase();
  const side = normalizedText(body.side).toUpperCase();
  const dealtCcyCode = normalizedText(body.dealtCcyCode).toUpperCase();
  const dealtCcyAmount = normalizedPositiveDecimalText(body.dealtCcyAmount);
  const tradeRate = normalizedPositiveDecimalText(body.tradeRate);
  const tenor = normalizedText(body.tenor).toUpperCase();

  if (Number.isNaN(pricingRuleId) || pricingRuleId === null) {
    return { error: "Pricing Rule ID must be a positive integer." };
  }

  if (!/^[A-Z]{3}_[A-Z]{3}$/.test(ccyPairCode)) {
    return { error: "Ccy Pair Code must look like EUR_USD." };
  }

  if (!["BUY", "SELL"].includes(side)) {
    return { error: "Hedge Side must be BUY or SELL." };
  }

  if (!/^[A-Z]{3}$/.test(dealtCcyCode)) {
    return { error: "Dealt Ccy Code must contain exactly three uppercase Latin letters." };
  }

  if (dealtCcyAmount === null) {
    return { error: "Dealt Ccy Amount must be a positive decimal string." };
  }

  if (tradeRate === null) {
    return { error: "Trade Rate must be a positive decimal string." };
  }

  if (!["TOD", "TOM", "SPOT"].includes(tenor)) {
    return { error: "Tenor must be TOD, TOM or SPOT." };
  }

  return {
    pricingRuleId,
    ccyPairCode,
    side,
    dealtCcyCode,
    dealtCcyAmount,
    tradeRate,
    tenor
  };
}

function validateBatchBalancingTradeSelection(body) {
  if (!Array.isArray(body?.tradeIds) || body.tradeIds.length === 0) {
    return { error: "Select at least one Client or Hedge FX Deal." };
  }

  if (body.tradeIds.length > 200) {
    return { error: "No more than 200 trades can be processed at once." };
  }

  const tradeIds = body.tradeIds.map(tradeId =>
    integerInRange(tradeId, 1, Number.MAX_SAFE_INTEGER)
  );

  if (tradeIds.some(tradeId => tradeId === null)) {
    return { error: "Every Trade ID must be a positive integer." };
  }

  if (new Set(tradeIds).size !== tradeIds.length) {
    return { error: "Every Trade ID may be selected only once." };
  }

  return { tradeIds };
}

function validateGeneratedBatchTradeSelection(body) {
  if (!Array.isArray(body?.tradeIds) || body.tradeIds.length === 0) {
    return { error: "Select at least one generated Batch Trade." };
  }

  if (body.tradeIds.length > 200) {
    return { error: "No more than 200 generated Batch Trades can be deleted at once." };
  }

  const tradeIds = body.tradeIds.map(tradeId =>
    integerInRange(tradeId, 1, Number.MAX_SAFE_INTEGER)
  );

  if (tradeIds.some(tradeId => tradeId === null)) {
    return { error: "Every Trade ID must be a positive integer." };
  }

  if (new Set(tradeIds).size !== tradeIds.length) {
    return { error: "Every Trade ID may be selected only once." };
  }

  return { tradeIds };
}

function validateClientFxDealCommentPayload(body) {
  const comment = normalizedText(body.comment);

  if (comment.length > 500 || /[\r\n]/.test(comment)) {
    return { error: "Comment must be a single line of no more than 500 characters." };
  }

  return { comment: comment || null };
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

  const pair = ccyPairOption(payload.ccyPairCode);

  if (!pair) {
    return `Ccy Pair ${payload.ccyPairCode} was not found.`;
  }

  if (payload.dealtCcyCode
    && ![pair.baseCcy, pair.quoteCcy].includes(payload.dealtCcyCode)) {
    return `Dealt Ccy Code must be ${pair.baseCcy} or ${pair.quoteCcy}.`;
  }

  if (payload.executionContextId !== null && !executionContext(payload.executionContextId)) {
    return `Execution Context ${payload.executionContextId} was not found.`;
  }

  if (payload.pricingRuleId !== null) {
    const rule = pricingRule(payload.pricingRuleId);

    if (!rule) {
      return `Pricing Rule ${payload.pricingRuleId} was not found.`;
    }

    if (!clientDealPricingRule(payload.pricingRuleId)) {
      return `Pricing Rule ${payload.pricingRuleId} must use an Execution System with DEALER_PRICED pricing mode.`;
    }

    if (rule.partyId !== payload.partyId
      || rule.executionContextId !== payload.executionContextId
      || rule.ccyPairCode !== payload.ccyPairCode) {
      return `Pricing Rule ${payload.pricingRuleId} does not match the Client FX Deal scope.`;
    }
  }

  return "";
}

function hedgeFxDealReferenceError(payload) {
  const rule = pricingRule(payload.pricingRuleId);

  if (!rule) {
    return `Pricing Rule ${payload.pricingRuleId} was not found.`;
  }

  if (rule.partyType !== "HEDGE_COUNTERPARTY") {
    return `Pricing Rule ${payload.pricingRuleId} must reference a HEDGE_COUNTERPARTY.`;
  }

  if (!hedgeDealPricingRule(payload.pricingRuleId)) {
    return `Pricing Rule ${payload.pricingRuleId} must reference an active HEDGE_COUNTERPARTY and use an active DEALER_PRICED Execution System.`;
  }

  if (rule.ccyPairCode !== payload.ccyPairCode) {
    return `Pricing Rule ${payload.pricingRuleId} does not match Ccy Pair ${payload.ccyPairCode}.`;
  }

  const pair = ccyPairOption(payload.ccyPairCode);

  if (payload.dealtCcyCode
    && ![pair.baseCcy, pair.quoteCcy].includes(payload.dealtCcyCode)) {
    return `Dealt Ccy Code must be ${pair.baseCcy} or ${pair.quoteCcy}.`;
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

  if (message.includes("a Trading Party used by fx_hedge_deals must remain a HEDGE_COUNTERPARTY")) {
    return {
      status: 409,
      code: "TRADING_PARTY_HAS_HEDGE_FX_DEALS",
      message: "A Trading Party used by Hedge FX Deals must remain a HEDGE_COUNTERPARTY."
    };
  }

  if (message.includes("fx_hedge_deals.party_id must reference a HEDGE_COUNTERPARTY trading party")) {
    return {
      status: 400,
      code: "INVALID_HEDGE_FX_DEAL_PARTY",
      message: "A Hedge FX Deal must reference a Trading Party with type HEDGE_COUNTERPARTY."
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
      users: users(),
      pricingRules: pricingRules(),
      clientDealPricingRules: clientDealPricingRules(),
      hedgeDealPricingRules: hedgeDealPricingRules(),
      clientFxDeals: clientFxDeals(),
      hedgeFxDeals: hedgeFxDeals(),
      batchBalancingTrades: batchBalancingTrades()
    }).replace(/</g, "\\u003c");
    sendText(
      response,
      200,
      `window.__DEMO_API_BOOTSTRAP__ = ${bootstrap};\n`,
      "text/javascript; charset=utf-8"
    );
    return true;
  }

  if (pathname === "/api/v1/client-deal-generation/settings" && method === "GET") {
    sendJson(response, 200, clientDealGenerationSettings());
    return true;
  }

  const clientDealGenerationSettingsMatch =
    /^\/api\/v1\/client-deal-generation\/settings\/(\d+)$/.exec(pathname);

  if (clientDealGenerationSettingsMatch && method === "PUT") {
    const pricingRuleId = Number(clientDealGenerationSettingsMatch[1]);

    if (!clientDealGenerationSetting(pricingRuleId)) {
      apiError(
        response,
        404,
        "CLIENT_DEAL_GENERATION_SETTINGS_NOT_FOUND",
        `Client Deal Generation Settings for Pricing Rule ${pricingRuleId} were not found.`
      );
      return true;
    }

    const body = await readJsonBody(request);
    const payload = validateClientDealGenerationSettingsPayload(body);

    if (payload.error) {
      apiError(response, 400, "INVALID_CLIENT_DEAL_GENERATION_SETTINGS", payload.error);
      return true;
    }

    try {
      updateClientDealGenerationSettings(pricingRuleId, payload);
      sendJson(response, 200, clientDealGenerationSetting(pricingRuleId));
    } catch (error) {
      handleDatabaseError(response, error);
    }

    return true;
  }

  if (pathname === "/api/v1/client-deal-generation/one" && method === "POST") {
    try {
      const deal = generateOneClientFxDeal();
      sendJson(response, 201, deal);
    } catch (error) {
      if (String(error?.code || "").startsWith("CLIENT_DEAL_GENERATION_")
        || error?.code === "GENERATED_CLIENT_FX_DEAL_INVALID") {
        apiError(response, 409, error.code, error.message);
      } else {
        handleDatabaseError(response, error);
      }
    }

    return true;
  }

  if (pathname === "/api/v1/client-deal-generation/process" && method === "GET") {
    sendJson(response, 200, clientDealGenerationProcess.status());
    return true;
  }

  if (pathname === "/api/v1/client-deal-generation/process/start" && method === "POST") {
    try {
      configuredClientDealGenerationSettings();
      sendJson(response, 200, await clientDealGenerationProcess.start());
    } catch (error) {
      if (String(error?.code || "").startsWith("CLIENT_DEAL_GENERATION_")) {
        apiError(response, 409, error.code, error.message);
      } else {
        handleDatabaseError(response, error);
      }
    }
    return true;
  }

  if (pathname === "/api/v1/client-deal-generation/process/stop" && method === "POST") {
    sendJson(response, 200, clientDealGenerationProcess.stop());
    return true;
  }

  if (pathname === "/api/v1/client-fx-deals" && method === "GET") {
    sendJson(response, 200, clientFxDeals());
    return true;
  }

  if (pathname === "/api/v1/batch-balancing-trades" && method === "GET") {
    sendJson(response, 200, batchBalancingTrades());
    return true;
  }

  if (pathname === "/api/v1/batch-balancing-trades" && method === "POST") {
    const body = await readJsonBody(request);
    const payload = validateBatchBalancingTradeSelection(body);

    if (payload.error) {
      apiError(response, 400, "INVALID_BATCH_SELECTION", payload.error);
      return true;
    }

    try {
      sendJson(response, 201, createBatchBalancingTradePair(payload.tradeIds));
    } catch (error) {
      if (error?.code === "BATCH_SOURCE_TRADE_NOT_FOUND") {
        apiError(response, 404, error.code, error.message);
      } else if (String(error?.code || "").startsWith("BATCH_")
        || error?.code === "INCOMPATIBLE_BATCH_SELECTION"
        || error?.code === "INVALID_BATCH_BALANCING_RATE") {
        apiError(response, 409, error.code, error.message);
      } else {
        handleDatabaseError(response, error);
      }
    }

    return true;
  }

  if (pathname === "/api/v1/batch-balancing-trades" && method === "DELETE") {
    const body = await readJsonBody(request);
    const payload = validateGeneratedBatchTradeSelection(body);

    if (payload.error) {
      apiError(response, 400, "INVALID_GENERATED_BATCH_SELECTION", payload.error);
      return true;
    }

    try {
      // Temporary test-only deletion until generated trades move into the complete Batch workflow.
      sendJson(response, 200, deleteBatchBalancingTrades(payload.tradeIds));
    } catch (error) {
      if (error?.code === "BATCH_GENERATED_TRADE_NOT_FOUND") {
        apiError(response, 404, error.code, error.message);
      } else {
        handleDatabaseError(response, error);
      }
    }

    return true;
  }

  if (pathname === "/api/v1/hedge-deal-pricing-rules" && method === "GET") {
    sendJson(response, 200, hedgeDealPricingRules());
    return true;
  }

  if (pathname === "/api/v1/hedge-fx-deals" && method === "GET") {
    sendJson(response, 200, hedgeFxDeals());
    return true;
  }

  if (pathname === "/api/v1/hedge-fx-deals" && method === "POST") {
    const body = await readJsonBody(request);
    const payload = validateHedgeFxDealPayload(body);

    if (payload.error) {
      apiError(response, 400, "INVALID_HEDGE_FX_DEAL", payload.error);
      return true;
    }

    const referenceError = hedgeFxDealReferenceError(payload);

    if (referenceError) {
      apiError(response, 400, "INVALID_HEDGE_FX_DEAL_REFERENCE", referenceError);
      return true;
    }

    try {
      const exposureAmounts = fxTradeExposureAmounts(payload);
      const tradeId = createHedgeFxDeal(
        hedgeFxDealWithCalculatedTerms(payload, exposureAmounts),
        exposureAmounts
      );
      sendJson(response, 201, hedgeFxDeal(tradeId));
    } catch (error) {
      if (error instanceof TypeError || error instanceof RangeError) {
        apiError(response, 400, "INVALID_HEDGE_FX_DEAL_AMOUNT", error.message);
      } else {
        handleDatabaseError(response, error);
      }
    }

    return true;
  }

  const hedgeFxDealMatch = /^\/api\/v1\/hedge-fx-deals\/(\d+)$/.exec(pathname);

  if (hedgeFxDealMatch && method === "DELETE") {
    const hedgeDealId = Number(hedgeFxDealMatch[1]);

    try {
      const deleted = deleteHedgeFxDeal(hedgeDealId);

      if (!deleted) {
        apiError(response, 404, "HEDGE_FX_DEAL_NOT_FOUND", "Hedge FX Deal was not found.");
      } else {
        response.writeHead(204);
        response.end();
      }
    } catch (error) {
      handleDatabaseError(response, error);
    }

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
      const exposureAmounts = fxTradeExposureAmounts(payload);
      const tradeId = createClientFxDeal(
        clientFxDealWithCalculatedEconomics(payload, exposureAmounts),
        exposureAmounts
      );
      sendJson(response, 201, clientFxDeal(tradeId));
    } catch (error) {
      if (error instanceof TypeError || error instanceof RangeError) {
        apiError(response, 400, "INVALID_CLIENT_FX_DEAL_AMOUNT", error.message);
      } else {
        handleDatabaseError(response, error);
      }
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
    apiError(
      response,
      405,
      "CLIENT_FX_DEAL_IMMUTABLE",
      "Client FX Deal attributes are immutable. Only Comment can be changed."
    );
    return true;
  }

  if (clientFxDealMatch && method === "PATCH") {
    const clientDealId = Number(clientFxDealMatch[1]);

    if (!clientFxDeal(clientDealId)) {
      apiError(response, 404, "CLIENT_FX_DEAL_NOT_FOUND", "Client FX Deal was not found.");
      return true;
    }

    const body = await readJsonBody(request);
    const payload = validateClientFxDealCommentPayload(body);

    if (payload.error) {
      apiError(response, 400, "INVALID_CLIENT_FX_DEAL_COMMENT", payload.error);
      return true;
    }

    try {
      const updated = updateClientFxDealComment(clientDealId, payload.comment);

      if (!updated) {
        apiError(response, 404, "CLIENT_FX_DEAL_NOT_FOUND", "Client FX Deal was not found.");
      } else {
        sendJson(response, 200, clientFxDeal(clientDealId));
      }
    } catch (error) {
      handleDatabaseError(response, error);
    }

    return true;
  }

  if (clientFxDealMatch && method === "DELETE") {
    const clientDealId = Number(clientFxDealMatch[1]);
    try {
      const deleted = deleteClientFxDeal(clientDealId);

      if (!deleted) {
        apiError(response, 404, "CLIENT_FX_DEAL_NOT_FOUND", "Client FX Deal was not found.");
      } else {
        response.writeHead(204);
        response.end();
      }
    } catch (error) {
      handleDatabaseError(response, error);
    }

    return true;
  }

  if (pathname === "/api/v1/pricing-rules" && method === "GET") {
    sendJson(response, 200, pricingRules());
    return true;
  }

  if (pathname === "/api/v1/client-deal-pricing-rules" && method === "GET") {
    sendJson(response, 200, clientDealPricingRules());
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
      const pricingRuleId = runInImmediateTransaction(database, () => {
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
        const createdPricingRuleId = Number(result.lastInsertRowid);
        ensureClientDealGenerationSettingsForPricingRule(createdPricingRuleId);
        return createdPricingRuleId;
      });
      sendJson(response, 201, pricingRule(pricingRuleId));
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
      runInImmediateTransaction(database, () => {
        if (!clientDealGenerationReferenceEligible(
          payload.partyId,
          payload.executionContextId
        )) {
          database.prepare(`
            DELETE FROM client_deal_generation_settings
            WHERE pricing_rule_id = ?
          `).run(pricingRuleId);
        }

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
        ensureClientDealGenerationSettingsForPricingRule(pricingRuleId);
      });
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
      runInImmediateTransaction(database, () => {
        if (payload.partyType !== "CLIENT") {
          database.prepare(`
            DELETE FROM client_deal_generation_settings
            WHERE pricing_rule_id IN
            (
              SELECT pricing_rule_id
              FROM pricing_rules
              WHERE party_id = ?
            )
          `).run(partyId);
        }

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
        synchronizeClientDealGenerationSettings(database);
      });
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

  if (pathname === "/api/v1/users" && method === "GET") {
    sendJson(response, 200, users());
    return true;
  }

  if (pathname === "/api/v1/users" && method === "POST") {
    const body = await readJsonBody(request);
    const payload = validateUserPayload(body);

    if (payload.error) {
      apiError(response, 400, "INVALID_USER", payload.error);
      return true;
    }

    try {
      const result = database.prepare(`
        INSERT INTO users
          (user_code, first_name, last_name, user_role, is_active)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        payload.userCode,
        payload.firstName,
        payload.lastName,
        payload.userRole,
        payload.active ? 1 : 0
      );
      sendJson(response, 201, user(Number(result.lastInsertRowid)));
    } catch (error) {
      handleDatabaseError(response, error);
    }

    return true;
  }

  const userMatch = /^\/api\/v1\/users\/(\d+)$/.exec(pathname);

  if (userMatch && method === "PUT") {
    const userId = Number(userMatch[1]);

    if (!user(userId)) {
      apiError(response, 404, "USER_NOT_FOUND", `User ${userId} was not found.`);
      return true;
    }

    const body = await readJsonBody(request);
    const payload = validateUserPayload(body);

    if (payload.error) {
      apiError(response, 400, "INVALID_USER", payload.error);
      return true;
    }

    try {
      database.prepare(`
        UPDATE users
        SET user_code = ?, first_name = ?, last_name = ?, user_role = ?, is_active = ?
        WHERE user_id = ?
      `).run(
        payload.userCode,
        payload.firstName,
        payload.lastName,
        payload.userRole,
        payload.active ? 1 : 0,
        userId
      );
      sendJson(response, 200, user(userId));
    } catch (error) {
      handleDatabaseError(response, error);
    }

    return true;
  }

  if (userMatch && method === "DELETE") {
    const userId = Number(userMatch[1]);
    const result = database.prepare("DELETE FROM users WHERE user_id = ?").run(userId);

    if (result.changes === 0) {
      apiError(response, 404, "USER_NOT_FOUND", `User ${userId} was not found.`);
      return true;
    }

    response.writeHead(204);
    response.end();
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
      runInImmediateTransaction(database, () => {
        if (payload.pricingMode !== "AUTO_PRICED") {
          database.prepare(`
            DELETE FROM client_deal_generation_settings
            WHERE pricing_rule_id IN
            (
              SELECT r.pricing_rule_id
              FROM pricing_rules r
              INNER JOIN execution_contexts c
                ON c.execution_context_id = r.execution_context_id
              WHERE c.execution_system_id = ?
            )
          `).run(currentId);
        }

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
        synchronizeClientDealGenerationSettings(database);
      });
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
      runInImmediateTransaction(database, () => {
        if (executionSystem(payload.executionSystemId)?.pricingMode !== "AUTO_PRICED") {
          database.prepare(`
            DELETE FROM client_deal_generation_settings
            WHERE pricing_rule_id IN
            (
              SELECT pricing_rule_id
              FROM pricing_rules
              WHERE execution_context_id = ?
            )
          `).run(currentExecutionContextId);
        }

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
        synchronizeClientDealGenerationSettings(database);
      });
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

  clientDealGenerationProcess.dispose();
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
    clientDealGenerationProcess.dispose();
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
    clientDealGenerationProcess.dispose();
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
    clientDealGenerationProcess.dispose();
    marketPulseSimulator.dispose();
    database.close();
  }
};
