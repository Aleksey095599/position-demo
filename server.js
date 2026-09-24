"use strict";

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { URL } = require("node:url");
const { DatabaseSync } = require("node:sqlite");
const { migrateDomainTerminology } = require("./backend/database/migrate-domain-terminology");
const { createTradePurposeModule } = require("./backend/trade-purpose/config/trade-purpose-module");
const { seedInitialTradePurposes } = require("./backend/trade-purpose/infrastructure/persistence/sqlite-trade-purpose-repository");
const {
  DEMO_APPLICATION_ID,
  runtimeFilePath,
  runtimeRecordMatches
} = require("./scripts/demo-server-runtime.cjs");
const {
  DEFAULT_FLUCTUATION_SPREADS,
  DEFAULT_ONE_WAY_DURATION_SECONDS,
  MAX_FLUCTUATION_SPREADS,
  MAX_ONE_WAY_DURATION_SECONDS,
  MIN_ONE_WAY_DURATION_SECONDS,
  MarketPulseSimulator
} = require("./backend/market-pulse/simulation/market-pulse-simulator");
const {
  BackfillHistoricalCandleRangeUseCase
} = require("./backend/market-pulse/historical-data/application/backfill-historical-candle-range-use-case");
const {
  createHistoricalCandlesApi
} = require("./backend/market-pulse/historical-data/api/historical-candles-api");
const {
  MoexIssHistoricalMarketDataSource
} = require("./backend/market-pulse/historical-data/infrastructure/moex-iss-historical-market-data-source");
const {
  SqliteMarketSourceCandleRepository
} = require("./backend/market-pulse/historical-data/infrastructure/persistence/sqlite-market-source-candle-repository");
const {
  migrateMarketCandleStorage
} = require("./backend/market-pulse/historical-data/infrastructure/persistence/migrate-market-candle-storage");
const { migrateDayCandleStorage } = require("./backend/market-pulse/historical-data/infrastructure/persistence/migrate-day-candle-storage");
const { migrateMinuteCandleLoadResult } = require("./backend/market-pulse/historical-data/infrastructure/persistence/migrate-minute-candle-load-result");
const { migrateAggregationTimeframes } = require("./backend/market-pulse/candle-aggregation/infrastructure/persistence/migrate-aggregation-timeframes");
const { migrateDailyAggregation } = require("./backend/market-pulse/candle-aggregation/infrastructure/persistence/migrate-daily-aggregation");
const { migrateCandleResultAttemptTimestamps } = require("./backend/market-pulse/historical-data/infrastructure/persistence/migrate-candle-result-attempt-timestamps");
const { createCandleAggregationModule } = require("./backend/market-pulse/candle-aggregation/config/candle-aggregation-module");
const {
  calculateAnalyticalPnlMinor,
  calculateClientDealEconomics,
  roundToFractionDigits
} = require("./backend/client-deal/client-deal-economics");
const {
  generatedClientDeal
} = require("./backend/client-deal/client-deal-generator");
const {
  ClientDealGenerationProcess
} = require("./backend/client-deal/client-deal-generation-process");
const {
  createHedgeDealTerms
} = require("./backend/hedge-deal/hedge-deal-terms");
const {
  autoPricedHedgeTradeRate
} = require("./backend/hedge-deal/auto-priced-hedge-rate");
const {
  HEDGE_QUICK_MODE_PRESET_CODES,
  hedgeQuickModeInstruction,
  hedgeQuickModePresets
} = require("./backend/hedge-deal/hedge-quick-mode");
const {
  FormBatchUseCase
} = require("./backend/batching/application/form-batch-use-case");
const {
  migrateLegacyManualBatchFormations
} = require(
  "./backend/batching/infrastructure/persistence/migrate-legacy-manual-batch-formations"
);
const {
  AutoBatchingProcess
} = require("./backend/batching/application/auto-batching-process");
const {
  selectTradesForAutoBatchingRun
} = require("./backend/batching/application/auto-batching-trade-scope");
const {
  planAutoBatching
} = require("./backend/batching/domain/auto-batching-policy");
const {
  BATCH_FORMATION_REASON_CODE,
  BATCH_FORMATION_REASON_CODES,
  BATCH_FORMATION_REASON_DETAILS_MAX_LENGTH
} = require("./backend/batching/domain/batch-formation-reason");
const {
  AUTO_BATCHING_CCY_PAIR_CODES_DEFAULT,
  AUTO_BATCHING_MAX_INTERVAL_SECONDS_DEFAULT,
  AUTO_BATCHING_MAX_TRANSFER_RATE_SPREAD_PERCENT_DEFAULT,
  AUTO_BATCHING_TENOR_COMPATIBILITY_MODE_DEFAULT,
  autoBatchingSettings: validatedAutoBatchingSettings
} = require("./backend/batching/domain/auto-batching-settings");
const {
  BATCHING_ALLOW_CROSS_TENOR_BATCHING_DEFAULT,
  batchingSettings: validatedBatchingSettings
} = require("./backend/batching/domain/batching-settings");
const {
  BATCH_MEMBER_ROLE,
  BATCH_MEMBERSHIP_BLOCKING_STATUSES,
  BATCH_STATUS
} = require("./backend/batching/domain/trade-batching-policy");
const {
  tradeBalanceContributions
} = require("./backend/batching/domain/batch-balance");
const {
  calculateAmountsFromDealt,
  calculateQuoteMinor,
  majorToMinor,
  majorToMinorExact,
  minorToMajor,
  minorToSafeInteger
} = require("./backend/money/money");
const {
  UI_TABLE_COLUMN_KEY_ALIASES,
  UI_TABLE_COLUMN_WIDTH_MIN_PX,
  UI_TABLE_COLUMN_WIDTH_MAX_PX,
  UI_TABLE_LAYOUTS
} = require("./backend/ui-table-layout/ui-table-layouts");
const {
  DEFAULT_UI_COLOR_TOKENS,
  UI_COLOR_TOKEN_TABLE_SQL
} = require("./backend/ui-configuration/ui-color-tokens");
const {
  analyticalPnlReportQuery
} = require("./backend/reporting/analytical-pnl-report-query");
const {
  analyticalPnlSummary
} = require("./backend/reporting/analytical-pnl-summary");
const {
  POSITION_MANAGEMENT_MODE,
  normalizePositionManagementMode
} = require("./backend/position-management/domain/position-management-policy");
const {
  AUTO_MANAGEMENT_ADMISSION_MODE,
  normalizeAutoManagementAdmissionMode
} = require("./backend/auto-management-admission/domain/auto-management-admission-mode");
const {
  normalizePricingRuleAutoManagementAdmissionModeOverride,
  resolvePricingRuleAutoManagementAdmissionMode
} = require(
  "./backend/auto-management-admission/domain/pricing-rule-admission-policy"
);
const {
  determineInitialAdmissionState,
  decideReleaseToAutoManagement
} = require("./backend/auto-management-admission/domain/auto-management-admission-decision");
const {
  migrateAutoManagementTerminology
} = require("./backend/auto-management-admission/infrastructure/persistence/migrate-auto-management-terminology");
const {
  migrateAdmissionEnforcement
} = require("./backend/auto-management-admission/infrastructure/persistence/migrate-admission-enforcement");
const {
  migrateAutoModeEligibilityRules
} = require("./backend/auto-management-admission/infrastructure/persistence/migrate-auto-mode-eligibility-rules");
const {
  normalizeAutoManagementAdmissionTradeType
} = require("./backend/auto-management-admission/domain/auto-management-admission-trade-type");
const {
  MoveTradesToAutoManagementUseCase
} = require("./backend/position-management/application/move-trades-to-auto-management-use-case");

const HOST = "127.0.0.1";
const UI_TABLE_DEFAULT_CONFIRMATION = "SAVE_AS_DEFAULT";
const configuredPort = Number(process.env.DEMO_PORT);
const PORT = Number.isInteger(configuredPort) && configuredPort >= 1 && configuredPort <= 65535
  ? configuredPort
  : 8000;
const ROOT_DIR = __dirname;
const DATA_DIR = path.join(ROOT_DIR, "data");
const SERVER_RUNTIME_FILE_PATH = runtimeFilePath(ROOT_DIR, PORT);
const DATABASE_PATH = process.env.DEMO_DATABASE_PATH
  ? path.resolve(process.env.DEMO_DATABASE_PATH)
  : path.join(DATA_DIR, "demo.sqlite");
const SCHEMA_PATH = path.join(ROOT_DIR, "schema.sql");
const SEED_PATH = path.join(ROOT_DIR, "seed.sql");
const MAX_BODY_BYTES = 1024 * 1024;
const NOT_APPLICABLE_ACCOUNTING_SYSTEM_ID = "NOT_APPLICABLE";
const PRICING_MODES = ["AUTO_PRICED", "DEALER_PRICED", "DEALER_APPROVED"];
const SERVICING_LOCATION_TYPES = ["BRANCH", "HEAD_OFFICE"];
const COUNTERPARTY_ROLES = ["CLIENT", "HEDGE_COUNTERPARTY"];
const COUNTERPARTY_SCOPES = ["EXTERNAL", "INTERNAL"];
const EXTERNAL_COUNTERPARTY_CODE_TYPES = ["INN", "OTHER"];
const EXTERNAL_COUNTERPARTY_KINDS = [
  "CORPORATE",
  "INDIVIDUAL",
  "BANK",
  "NON_BANK_FINANCIAL_INSTITUTION",
  "OTHER"
];
const INTERNAL_UNIT_TYPES = ["DESK", "DEPARTMENT", "OTHER"];
const SERVICING_LOCATION_ID_MAX_LENGTH = 10;
const SERVICING_LOCATION_NAME_MAX_LENGTH = 50;
const SERVICING_LOCATION_REGION_MAX_LENGTH = 50;
const SERVICING_LOCATION_TYPE_MAX_LENGTH = "HEAD_OFFICE".length;
const ACCOUNTING_SYSTEM_ID_MAX_LENGTH = 20;
const ACCOUNTING_SYSTEM_NAME_MAX_LENGTH = 50;
const ORIGINATING_SYSTEM_ID_MAX_LENGTH = 30;
const ORIGINATING_SYSTEM_NAME_MAX_LENGTH = 50;
const ORIGINATING_SYSTEM_PRICING_MODE_MAX_LENGTH = "DEALER_APPROVED".length;
const CCY_OPTION_NAME_MAX_LENGTH = 20;
const CCY_OPTION_COUNTRY_MAX_LENGTH = 30;
const COUNTERPARTY_CODE_MAX_LENGTH = 20;
const COUNTERPARTY_NAME_MAX_LENGTH = 200;
const USER_CODE_MAX_LENGTH = 30;
const USER_NAME_MAX_LENGTH = 50;
const USER_ROLES = ["DEALER", "SUPERVISOR", "ADMIN"];
const TRADE_TYPES = [
  "CLIENT_DEAL",
  "HEDGE_DEAL",
  "BATCH_BALANCE_TRADE",
  "BATCH_POSITION_OUT"
];
const AUTO_MODE_ELIGIBILITY_MATRIX_TRADE_TYPES = [
  "CLIENT_DEAL",
  "HEDGE_DEAL",
  "BATCH_POSITION_OUT"
];
const BATCH_MEMBERSHIP_BLOCKING_STATUS_PLACEHOLDERS =
  BATCH_MEMBERSHIP_BLOCKING_STATUSES.map(() => "?").join(", ");
const CLIENT_ONBOARDING_MANUAL_PRICING = "CLIENT_ONBOARDING";
const HEDGE_DEAL_PRICING_MODES = new Set(["AUTO_PRICED", "DEALER_PRICED"]);

fs.mkdirSync(path.dirname(DATABASE_PATH), { recursive: true });

function serverRuntimeRecord() {
  return {
    application: DEMO_APPLICATION_ID,
    projectRoot: path.resolve(ROOT_DIR),
    port: PORT,
    pid: process.pid,
    startedAt: new Date().toISOString()
  };
}

function writeServerRuntimeFile() {
  const temporaryPath = `${SERVER_RUNTIME_FILE_PATH}.${process.pid}.tmp`;

  fs.mkdirSync(path.dirname(SERVER_RUNTIME_FILE_PATH), { recursive: true });
  fs.writeFileSync(temporaryPath, `${JSON.stringify(serverRuntimeRecord(), null, 2)}\n`, "utf8");
  fs.rmSync(SERVER_RUNTIME_FILE_PATH, { force: true });
  fs.renameSync(temporaryPath, SERVER_RUNTIME_FILE_PATH);
}

function removeServerRuntimeFile() {
  try {
    const record = JSON.parse(fs.readFileSync(SERVER_RUNTIME_FILE_PATH, "utf8"));

    if (runtimeRecordMatches(record, { projectRoot: ROOT_DIR, port: PORT, pid: process.pid })) {
      fs.rmSync(SERVER_RUNTIME_FILE_PATH, { force: true });
    }
  } catch (error) {
    if (error?.code !== "ENOENT") {
      console.error(`Unable to clean up server runtime file: ${error.message}`);
    }
  }
}

const database = new DatabaseSync(DATABASE_PATH);
database.exec("PRAGMA foreign_keys = ON");
database.exec("PRAGMA journal_mode = WAL");
database.exec("PRAGMA busy_timeout = 5000");
migrateDomainTerminology(database);
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
const originatingSystemsAlreadyInitialized = Boolean(database.prepare(`
  SELECT 1 AS present
  FROM sqlite_master
  WHERE type = 'table' AND name = 'originating_systems'
`).get());
const tradeContextsAlreadyInitialized = Boolean(database.prepare(`
  SELECT 1 AS present
  FROM sqlite_master
  WHERE type = 'table' AND name = 'trade_contexts'
`).get());
const tradePurposesAlreadyInitialized = Boolean(database.prepare(`
  SELECT 1 AS present
  FROM sqlite_master
  WHERE type = 'table' AND name = 'trade_purposes'
`).get());
const tradingCounterpartiesAlreadyInitialized = Boolean(database.prepare(`
  SELECT 1 AS present
  FROM sqlite_master
  WHERE type = 'table' AND name IN ('trading_counterparties', 'trading_parties')
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
const hedgeQuickModeSettingsAlreadyInitialized = Boolean(database.prepare(`
  SELECT 1 AS present
  FROM sqlite_master
  WHERE type = 'table' AND name = 'hedge_quick_mode_settings'
`).get());
const clientDealsAlreadyInitialized = Boolean(database.prepare(`
  SELECT 1 AS present
  FROM sqlite_master
  WHERE type = 'table' AND name = 'client_deals'
`).get());
const hedgeDealsAlreadyInitialized = Boolean(database.prepare(`
  SELECT 1 AS present
  FROM sqlite_master
  WHERE type = 'table' AND name = 'hedge_deals'
`).get());
const tradePositionManagementAlreadyInitialized = Boolean(database.prepare(`
  SELECT 1 AS present
  FROM sqlite_master
  WHERE type = 'table' AND name = 'trade_position_management'
`).get());
migrateAutoManagementTerminology(database);
migrateTradingCounterpartyTerminology(database);
prepareTradingCounterpartyTradeContextSchema(database);
if (sqliteTableExists(database, "batches")) {
  ensureBatchFormationTiming(database);
  ensureBatchFormationReason(database);
}
migrateTradePositionManagementState(database);
// Upgrade the Trade Context columns before schema.sql creates triggers that
// reference their current names on an already initialized SQLite database.
ensurePositionManagementPolicyColumns(database);
migrateAdmissionEnforcement(database);
migrateMinuteCandleLoadResult(database);
migrateCandleResultAttemptTimestamps(database);
migrateAggregationTimeframes(database);
migrateDailyAggregation(database);
database.exec(fs.readFileSync(SCHEMA_PATH, "utf8"));
migrateDayCandleStorage(database);
migrateMarketCandleStorage(database);
if (sqliteTableExists(database, "trading_counterparties")
  && !tableColumnNames(database, "trading_counterparties").has("counterparty_scope")) {
  dropTradingCounterpartyProfileIntegrityTriggers(database);
}
migrateAutoModeEligibilityRules(database);
if (!tradePositionManagementAlreadyInitialized) {
  database.exec(`
    DROP TRIGGER IF EXISTS trg_trade_position_management_initialize;
    DROP TABLE IF EXISTS trade_position_management;
  `);
}
database.exec("DROP VIEW IF EXISTS analytical_pnl_report");
database.exec("DROP VIEW IF EXISTS v_batch_formation_audit");
dropTradingCounterpartyTradeContextIntegrityTriggers(database);
ensureHedgeQuickModeSettingsDefaultTenor(database);
dropBatchIntegrityTriggers(database);
migrateLegacyBatchOutputTables(database);
migrateLegacyBatchTables(database);
assertBatchMembershipConsistency(database);
dropBatchIntegrityTriggers(database);
dropLegacyDemoHiddenBatches(database);
if (!hedgeDealsAlreadyInitialized) {
  database.exec("DROP TABLE hedge_deals");
}
dropTradeExposureDealtCurrencyTriggers(database);
dropClientDealTriggers(database);
dropHedgeDealTriggers(database);
dropClientDealGenerationSettingsTriggers(database);
dropHedgeQuickModeSettingsTriggers(database);
migrateCcyOptionsConstraints(database);
if (databaseAlreadyInitialized) {
  migrateLegacySimulationSettings(database);
}
ensureMarketQuoteSimulationSettings(database);
migrateCcyPairOptionsConstraints(database);
migrateTradeExposureTypes(database);
migrateLegacyTradeContextIds(database);
migrateServicingLocationTextLimits(database);
migrateAccountingSystemsShape(database);
migrateOriginatingSystemsShape(database);
migrateTradingCounterpartyModel(database);
migrateTradingCounterpartyScope(database);
migrateExternalCounterpartyKinds(database);
ensurePricingRuleClientDealReferenceIndex(database);
migrateHedgeQuickModeSettingsCounterpartyReference(database);
migrateClientDealGenerationSettingsToMinorUnits(database);
ensureClientDealGenerationProcessSettings(database);
synchronizeClientDealGenerationSettings(database);
migrateClientDealsToTradeExposure(database);
migrateTradeExposureAmountsToMinorUnits(database);
migrateTradeExposureTradeSemantics(database);
migrateBatchTradeSemantics(database);
migrateTradeExposureTimestamps(database);
migrateBatchRollbackSemantics(database);
migrateBatchMemberRoleSemantics(database);
backfillLegacyBatchFormationReasonDetails(database);
migrateLegacyManualBatchFormations(database);
migrateBatchTradeMembershipSemantics(database);
migrateBatchQuoteCashOutput(database);
migrateDealAnalyticalPnlToMinorUnits(database);
migrateHedgeDealRequestTimestamp(database);
ensureTradeExposureDealtCurrencyTriggers(database);
migrateTradeMarketSnapshot(database);
ensureClientDealIndexes(database);
backfillInitialClientDealAttribution(database);
ensureClientDealTriggers(database);
rebuildLegacyCounterpartyConstraintNames(database);
ensureBatchFormationTiming(database);
ensureBatchFormationReason(database);
ensurePositionManagementPolicyColumns(database);
ensureTradePositionManagementRows(database);
repairLegacyBatchTechnicalTradeManagementModes(database);
database.exec(fs.readFileSync(SCHEMA_PATH, "utf8"));
ensureHedgeDealTriggers(database);

if (!databaseAlreadyInitialized) {
  database.exec(fs.readFileSync(SEED_PATH, "utf8"));
} else {
  if (!servicingLocationsAlreadyInitialized) {
    seedInitialServicingLocations(database);
  }

  if (!accountingSystemsAlreadyInitialized) {
    seedInitialAccountingSystems(database);
  }

  if (!originatingSystemsAlreadyInitialized) {
    seedInitialOriginatingSystems(database);
  }

  if (!tradeContextsAlreadyInitialized) {
    seedInitialTradeContexts(database);
  }

  if (!tradePurposesAlreadyInitialized) {
    seedInitialTradePurposes(database);
  }

  if (!tradingCounterpartiesAlreadyInitialized) {
    seedInitialTradingCounterparties(database);
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

  if (!clientDealsAlreadyInitialized) {
    seedInitialClientDeals(database);
  }

}

if (databaseAlreadyInitialized && !hedgeQuickModeSettingsAlreadyInitialized) {
  seedInitialHedgeQuickModeSettings(database);
}

// Финальная миграция может перестроить частично созданную relation-таблицу уже
// после schema.sql, поэтому integrity-триггеры восстанавливаются явно.
migrateTradingCounterpartyTradeContexts(database);
ensureTradingCounterpartyTradeContextIntegrityTriggers(database);
ensureUiTableColumnSettings(database);
ensureUiColorTokens(database);
ensureBatchingSettings(database);
ensureAutoBatchingSettings(database);
ensureAutoModeEligibilityRules(database);
ensureBatchFormationReason(database);
assertTradingCounterpartyProfileConsistency(database);

const tradePurposeApi = createTradePurposeModule(database);

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

function ensureBatchingSettings(sqlite) {
  runInImmediateTransaction(sqlite, () => {
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS batching_settings
      (
        settings_id INTEGER PRIMARY KEY,
        allow_cross_tenor_batching INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
          DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        CONSTRAINT chk_batching_settings_singleton
          CHECK (settings_id = 1),
        CONSTRAINT chk_batching_settings_cross_tenor
          CHECK (
            typeof(allow_cross_tenor_batching) = 'integer'
            AND allow_cross_tenor_batching = 0
          ),
        CONSTRAINT chk_batching_settings_updated_at
          CHECK (
            length(updated_at) = 24
            AND updated_at GLOB '????-??-??T??:??:??.???Z'
            AND strftime('%Y-%m-%dT%H:%M:%fZ', updated_at) = updated_at
          )
      )
    `);

    sqlite.prepare(`
      INSERT OR IGNORE INTO batching_settings
        (settings_id, allow_cross_tenor_batching)
      VALUES (1, ?)
    `).run(BATCHING_ALLOW_CROSS_TENOR_BATCHING_DEFAULT ? 1 : 0);
  });
}

function ensureAutoBatchingSettings(sqlite) {
  const columns = tableColumnNames(sqlite, "auto_batching_settings");

  if (!columns.has("default_transfer_rate_spread_percent")) {
    sqlite.exec(`
      ALTER TABLE auto_batching_settings
      ADD COLUMN default_transfer_rate_spread_percent TEXT NOT NULL
        DEFAULT '${AUTO_BATCHING_MAX_TRANSFER_RATE_SPREAD_PERCENT_DEFAULT}'
        CONSTRAINT chk_auto_batching_settings_transfer_rate_spread
        CHECK (
          typeof(default_transfer_rate_spread_percent) = 'text'
          AND default_transfer_rate_spread_percent GLOB '[0-9]*'
          AND default_transfer_rate_spread_percent NOT GLOB '*[^0-9.]*'
          AND length(default_transfer_rate_spread_percent)
            - length(replace(default_transfer_rate_spread_percent, '.', '')) <= 1
          AND CAST(default_transfer_rate_spread_percent AS REAL)
            BETWEEN 0.0001 AND 100
        )
    `);
  }

  if (!columns.has("tenor_compatibility_mode")) {
    sqlite.exec(`
      ALTER TABLE auto_batching_settings
      ADD COLUMN tenor_compatibility_mode TEXT NOT NULL
        DEFAULT '${AUTO_BATCHING_TENOR_COMPATIBILITY_MODE_DEFAULT}'
        CONSTRAINT chk_auto_batching_settings_tenor_compatibility
        CHECK (tenor_compatibility_mode = 'SAME_TENOR_ONLY')
    `);
  }

  sqlite.prepare(`
    INSERT OR IGNORE INTO auto_batching_settings
      (
        settings_id,
        max_interval_seconds,
        default_transfer_rate_spread_percent,
        tenor_compatibility_mode
      )
    VALUES (1, ?, ?, ?)
  `).run(
    AUTO_BATCHING_MAX_INTERVAL_SECONDS_DEFAULT,
    AUTO_BATCHING_MAX_TRANSFER_RATE_SPREAD_PERCENT_DEFAULT,
    AUTO_BATCHING_TENOR_COMPATIBILITY_MODE_DEFAULT
  );

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS auto_batching_ccy_pairs
    (
      settings_id INTEGER NOT NULL DEFAULT 1,
      ccy_pair_code TEXT NOT NULL,
      PRIMARY KEY (settings_id, ccy_pair_code),
      CONSTRAINT fk_auto_batching_ccy_pairs_settings
        FOREIGN KEY (settings_id)
          REFERENCES auto_batching_settings (settings_id)
          ON UPDATE RESTRICT
          ON DELETE CASCADE,
      CONSTRAINT fk_auto_batching_ccy_pairs_ccy_pair
        FOREIGN KEY (ccy_pair_code)
          REFERENCES ccy_pair_options (ccy_pair_code)
          ON UPDATE RESTRICT
          ON DELETE RESTRICT,
      CONSTRAINT chk_auto_batching_ccy_pairs_singleton
        CHECK (settings_id = 1)
    ) WITHOUT ROWID
  `);

  const configuredPairCount = Number(sqlite.prepare(`
    SELECT COUNT(*) AS pair_count
    FROM auto_batching_ccy_pairs
    WHERE settings_id = 1
  `).get().pair_count);

  if (configuredPairCount === 0) {
    const insertDefaultPair = sqlite.prepare(`
      INSERT OR IGNORE INTO auto_batching_ccy_pairs
        (settings_id, ccy_pair_code)
      SELECT 1, ccy_pair_code
      FROM ccy_pair_options
      WHERE ccy_pair_code = ?
    `);

    AUTO_BATCHING_CCY_PAIR_CODES_DEFAULT.forEach(ccyPairCode => {
      insertDefaultPair.run(ccyPairCode);
    });

    const insertedDefaultPairCount = Number(sqlite.prepare(`
      SELECT COUNT(*) AS pair_count
      FROM auto_batching_ccy_pairs
      WHERE settings_id = 1
    `).get().pair_count);

    if (insertedDefaultPairCount === 0) {
      sqlite.prepare(`
        INSERT INTO auto_batching_ccy_pairs
          (settings_id, ccy_pair_code)
        SELECT 1, ccy_pair_code
        FROM ccy_pair_options
        ORDER BY ccy_pair_code
        LIMIT 1
      `).run();
    }
  }
}

function ensureAutoModeEligibilityRules(sqlite) {
  runInImmediateTransaction(sqlite, () => {
    sqlite.exec(`
      INSERT OR IGNORE INTO auto_mode_eligibility_rules
        (
          trade_type,
          ccy_pair_code,
          is_eligible,
          max_base_ccy_amount_minor,
          max_transfer_rate_deviation_percent
        )
      SELECT trade_type.trade_type, pair.ccy_pair_code, 0, NULL, NULL
      FROM
        (
          SELECT 'CLIENT_DEAL' AS trade_type
          UNION ALL SELECT 'HEDGE_DEAL'
          UNION ALL SELECT 'BATCH_POSITION_OUT'
        ) trade_type
      CROSS JOIN ccy_pair_options pair;
    `);
  });
}

function ensureBatchFormationTiming(sqlite) {
  const columns = tableColumnNames(sqlite, "batches");

  if (!columns.has("window_opened_at")) {
    sqlite.exec(`
      ALTER TABLE batches
      ADD COLUMN window_opened_at TEXT
        CONSTRAINT chk_batches_window_opened_at
        CHECK (
          window_opened_at IS NULL
          OR (
            length(window_opened_at) = 24
            AND window_opened_at GLOB '????-??-??T??:??:??.???Z'
            AND strftime('%Y-%m-%dT%H:%M:%fZ', window_opened_at)
              = window_opened_at
          )
        )
    `);
  }

  if (!columns.has("window_closed_at")) {
    sqlite.exec(`
      ALTER TABLE batches
      ADD COLUMN window_closed_at TEXT
        CONSTRAINT chk_batches_window_closed_at
        CHECK (
          window_closed_at IS NULL
          OR (
            length(window_closed_at) = 24
            AND window_closed_at GLOB '????-??-??T??:??:??.???Z'
            AND strftime('%Y-%m-%dT%H:%M:%fZ', window_closed_at)
              = window_closed_at
          )
        )
    `);
  }
}

function ensureBatchFormationReason(sqlite) {
  const columns = tableColumnNames(sqlite, "batches");

  if (!columns.has("formation_reason_code")) {
    sqlite.exec(`
      ALTER TABLE batches
      ADD COLUMN formation_reason_code TEXT NOT NULL
        DEFAULT '${BATCH_FORMATION_REASON_CODE.MANUAL_SELECTION}'
        CONSTRAINT chk_batches_formation_reason_code
        CHECK (formation_reason_code IN (
          '${BATCH_FORMATION_REASON_CODE.MANUAL_SELECTION}',
          '${BATCH_FORMATION_REASON_CODE.MAX_INTERVAL_REACHED}',
          '${BATCH_FORMATION_REASON_CODE.TRANSFER_RATE_CORRIDOR_BREACHED}'
        ))
    `);
  }

  if (!columns.has("formation_reason_details_json")) {
    sqlite.exec(`
      ALTER TABLE batches
      ADD COLUMN formation_reason_details_json TEXT NOT NULL DEFAULT '{}'
        CONSTRAINT chk_batches_formation_reason_details
        CHECK (
          length(formation_reason_details_json) BETWEEN 2
            AND ${BATCH_FORMATION_REASON_DETAILS_MAX_LENGTH}
          AND json_valid(formation_reason_details_json) = 1
          AND substr(formation_reason_details_json, 1, 1) = '{'
          AND substr(formation_reason_details_json, -1, 1) = '}'
        )
    `);
  }

  sqlite.exec(`
    DROP TRIGGER IF EXISTS trg_batches_validate_formation_reason_insert;
    DROP TRIGGER IF EXISTS trg_batches_validate_formation_reason_update;
    DROP TRIGGER IF EXISTS trg_batches_validate_formation_timing_insert;
    DROP TRIGGER IF EXISTS trg_batches_validate_formation_timing_update;
    DROP TRIGGER IF EXISTS trg_batches_immutable_update;

    CREATE TRIGGER trg_batches_validate_formation_reason_insert
    BEFORE INSERT ON batches
    FOR EACH ROW
    WHEN CASE
      WHEN json_valid(NEW.formation_reason_details_json) = 0 THEN 1
      WHEN json_type(NEW.formation_reason_details_json) <> 'object' THEN 1
      ELSE 0
    END
    BEGIN
      SELECT RAISE(ABORT, 'batch formation reason details must be a JSON object');
    END;

    CREATE TRIGGER trg_batches_validate_formation_reason_update
    BEFORE UPDATE OF formation_reason_details_json ON batches
    FOR EACH ROW
    WHEN CASE
      WHEN json_valid(NEW.formation_reason_details_json) = 0 THEN 1
      WHEN json_type(NEW.formation_reason_details_json) <> 'object' THEN 1
      ELSE 0
    END
    BEGIN
      SELECT RAISE(ABORT, 'batch formation reason details must be a JSON object');
    END;

    CREATE TRIGGER trg_batches_validate_formation_timing_insert
    BEFORE INSERT ON batches
    FOR EACH ROW
    WHEN
      (
        NEW.formation_reason_code = '${BATCH_FORMATION_REASON_CODE.MANUAL_SELECTION}'
        AND (NEW.window_opened_at IS NOT NULL OR NEW.window_closed_at IS NOT NULL)
      )
      OR (
        NEW.formation_reason_code <> '${BATCH_FORMATION_REASON_CODE.MANUAL_SELECTION}'
        AND (
          NEW.window_opened_at IS NULL
          OR NEW.window_closed_at IS NULL
          OR NEW.window_opened_at > NEW.window_closed_at
          OR NEW.window_closed_at > NEW.created_at
        )
      )
    BEGIN
      SELECT RAISE(ABORT, 'batch formation timing is inconsistent');
    END;

    CREATE TRIGGER trg_batches_validate_formation_timing_update
    BEFORE UPDATE OF formation_reason_code, window_opened_at, window_closed_at, created_at
    ON batches
    FOR EACH ROW
    WHEN
      (
        NEW.formation_reason_code = '${BATCH_FORMATION_REASON_CODE.MANUAL_SELECTION}'
        AND (NEW.window_opened_at IS NOT NULL OR NEW.window_closed_at IS NOT NULL)
      )
      OR (
        NEW.formation_reason_code <> '${BATCH_FORMATION_REASON_CODE.MANUAL_SELECTION}'
        AND (
          NEW.window_opened_at IS NULL
          OR NEW.window_closed_at IS NULL
          OR NEW.window_opened_at > NEW.window_closed_at
          OR NEW.window_closed_at > NEW.created_at
        )
      )
    BEGIN
      SELECT RAISE(ABORT, 'batch formation timing is inconsistent');
    END;

    CREATE TRIGGER trg_batches_immutable_update
    BEFORE UPDATE ON batches
    FOR EACH ROW
    WHEN
      OLD.batch_status = 'ROLLED_BACK'
      OR (
        OLD.batch_status = 'FORMED'
        AND NOT (
          NEW.batch_id = OLD.batch_id
          AND NEW.idempotency_key = OLD.idempotency_key
          AND NEW.ccy_pair_code = OLD.ccy_pair_code
          AND NEW.batch_status = 'ROLLED_BACK'
          AND NEW.created_at = OLD.created_at
          AND NEW.formation_reason_code = OLD.formation_reason_code
          AND NEW.formation_reason_details_json = OLD.formation_reason_details_json
          AND NEW.window_opened_at IS OLD.window_opened_at
          AND NEW.window_closed_at IS OLD.window_closed_at
          AND OLD.rolled_back_at IS NULL
          AND NEW.rolled_back_at IS NOT NULL
        )
      )
    BEGIN
      SELECT RAISE(ABORT, 'completed batch is immutable');
    END;
  `);
}

function backfillLegacyBatchFormationReasonDetails(sqlite) {
  if (
    !sqliteTableExists(sqlite, "batches")
    || !sqliteTableExists(sqlite, "batch_members")
  ) {
    return;
  }

  sqlite.exec(`
    UPDATE batches
    SET formation_reason_details_json = json_object(
      'selectedTradeCount',
      (
        SELECT COUNT(*)
        FROM batch_members member
        WHERE member.batch_id = batches.batch_id
          AND member.member_role = 'TRADE'
      )
    )
    WHERE formation_reason_details_json = '{}'
      AND batch_status IN ('FORMED', 'ROLLED_BACK')
      AND EXISTS (
        SELECT 1
        FROM batch_members member
        WHERE member.batch_id = batches.batch_id
          AND member.member_role = 'TRADE'
      );
  `);
}

function sqliteTableExists(sqlite, tableName) {
  return Boolean(sqlite.prepare(`
    SELECT 1 AS present
    FROM sqlite_master
    WHERE type = 'table' AND name = ?
  `).get(tableName));
}

function ensurePositionManagementPolicyColumns(sqlite) {
  if (sqliteTableExists(sqlite, "trade_contexts")) {
    const contextColumns = tableColumnNames(sqlite, "trade_contexts");

    if (contextColumns.has("auto_management_admission_policy")
      && !contextColumns.has("auto_management_admission_mode")) {
      sqlite.exec(`
        ALTER TABLE trade_contexts
        RENAME COLUMN auto_management_admission_policy TO auto_management_admission_mode
      `);
    }
  }

  if (
    sqliteTableExists(sqlite, "trade_contexts")
    && !tableColumnNames(sqlite, "trade_contexts")
      .has("auto_management_admission_mode")
  ) {
    sqlite.exec(`
      ALTER TABLE trade_contexts
      ADD COLUMN auto_management_admission_mode TEXT NOT NULL DEFAULT 'REVIEW_REQUIRED'
        CHECK (
          auto_management_admission_mode IN
            ('AUTO_IF_ELIGIBLE', 'REVIEW_REQUIRED')
        );

      UPDATE trade_contexts
      SET auto_management_admission_mode = 'AUTO_IF_ELIGIBLE'
      WHERE ${tableColumnNames(sqlite, 'trade_contexts').has('default_position_management_mode') ? "default_position_management_mode = 'AUTO'" : '0'}
        AND EXISTS
        (
          SELECT 1
          FROM originating_systems system
          WHERE system.originating_system_id = trade_contexts.originating_system_id
            AND system.pricing_mode = 'AUTO_PRICED'
        );
    `);
  }

  if (
    sqliteTableExists(sqlite, "pricing_rules")
    && !tableColumnNames(sqlite, "pricing_rules")
      .has("auto_management_admission_mode_override")
  ) {
    sqlite.exec(`
      ALTER TABLE pricing_rules
      ADD COLUMN auto_management_admission_mode_override TEXT
        CHECK (
          auto_management_admission_mode_override IS NULL
          OR auto_management_admission_mode_override = 'REVIEW_REQUIRED'
        )
    `);
  }
}

function migrateTradePositionManagementState(sqlite) {
  if (!sqliteTableExists(sqlite, "trade_position_management")) {
    return;
  }

  const columns = tableColumnNames(sqlite, "trade_position_management");
  const canonicalColumns = [
    "trade_id",
    "trade_type",
    "initial_position_management_mode",
    "current_position_management_mode",
    "created_at",
    "updated_at"
  ];

  if (
    columns.size === canonicalColumns.length
    && canonicalColumns.every(column => columns.has(column))
  ) {
    return;
  }

  const legacyCurrentColumn = columns.has("current_position_management_mode")
    ? "current_position_management_mode"
    : columns.has("position_management_mode")
      ? "position_management_mode"
      : null;
  const initialColumn = columns.has("initial_position_management_mode")
    ? "initial_position_management_mode"
    : legacyCurrentColumn;
  const requiredColumns = ["trade_id", "trade_type", "created_at", "updated_at"];

  if (
    !legacyCurrentColumn
    || !initialColumn
    || requiredColumns.some(column => !columns.has(column))
  ) {
    throw new Error(
      "Trade Position Management schema cannot be migrated safely."
    );
  }

  const originalRowCount = Number(sqlite.prepare(`
    SELECT COUNT(*) AS count
    FROM trade_position_management
  `).get().count);

  sqlite.exec("PRAGMA foreign_keys = OFF");

  try {
    sqlite.exec("BEGIN IMMEDIATE");
    sqlite.exec(`
      DROP TRIGGER IF EXISTS trg_trade_position_management_initialize;
      DROP INDEX IF EXISTS idx_trade_position_management_mode;
      DROP INDEX IF EXISTS idx_trade_position_management_current_mode;

      CREATE TABLE trade_position_management_migrated
      (
          trade_id                          INTEGER NOT NULL,
          trade_type                        TEXT    NOT NULL,
          initial_position_management_mode  TEXT    NOT NULL DEFAULT 'MANUAL',
          current_position_management_mode  TEXT    NOT NULL DEFAULT 'MANUAL',
          created_at                        TEXT    NOT NULL
              DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
          updated_at                        TEXT    NOT NULL
              DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),

          CONSTRAINT pk_trade_position_management
              PRIMARY KEY (trade_id, trade_type),
          CONSTRAINT fk_trade_position_management_trade
              FOREIGN KEY (trade_id, trade_type)
                  REFERENCES trade_exposures (trade_id, trade_type)
                  ON UPDATE RESTRICT
                  ON DELETE CASCADE,
          CONSTRAINT chk_trade_position_management_initial_mode
              CHECK (initial_position_management_mode IN ('MANUAL', 'AUTO')),
          CONSTRAINT chk_trade_position_management_current_mode
              CHECK (current_position_management_mode IN ('MANUAL', 'AUTO')),
          CONSTRAINT chk_trade_position_management_created_at
              CHECK (
                  length(created_at) = 24
                  AND created_at GLOB '????-??-??T??:??:??.???Z'
                  AND strftime('%Y-%m-%dT%H:%M:%fZ', created_at) = created_at
              ),
          CONSTRAINT chk_trade_position_management_updated_at
              CHECK (
                  length(updated_at) = 24
                  AND updated_at GLOB '????-??-??T??:??:??.???Z'
                  AND strftime('%Y-%m-%dT%H:%M:%fZ', updated_at) = updated_at
                  AND updated_at >= created_at
              )
      );

      INSERT INTO trade_position_management_migrated
        (
          trade_id,
          trade_type,
          initial_position_management_mode,
          current_position_management_mode,
          created_at,
          updated_at
        )
      SELECT
        trade_id,
        trade_type,
        ${initialColumn},
        ${legacyCurrentColumn},
        created_at,
        updated_at
      FROM trade_position_management
      ORDER BY trade_id, trade_type;

      DROP TABLE trade_position_management;
      ALTER TABLE trade_position_management_migrated
        RENAME TO trade_position_management;
    `);

    const migratedRowCount = Number(sqlite.prepare(`
      SELECT COUNT(*) AS count
      FROM trade_position_management
    `).get().count);

    if (migratedRowCount !== originalRowCount) {
      throw new Error(
        "Trade Position Management migration did not preserve every row."
      );
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

  const foreignKeyViolations = sqlite.prepare("PRAGMA foreign_key_check").all();

  if (foreignKeyViolations.length > 0) {
    throw new Error(
      "Trade Position Management migration produced foreign key violations."
    );
  }
}

function ensureTradePositionManagementRows(sqlite) {
  if (!sqliteTableExists(sqlite, "trade_position_management")) {
    return;
  }

  sqlite.exec(`
    INSERT INTO trade_position_management
      (
        trade_id,
        trade_type,
        initial_position_management_mode,
        current_position_management_mode
      )
    SELECT
      exposure.trade_id,
      exposure.trade_type,
      'MANUAL',
      'MANUAL'
    FROM trade_exposures exposure
    WHERE NOT EXISTS
    (
      SELECT 1
      FROM trade_position_management management
      WHERE management.trade_id = exposure.trade_id
        AND management.trade_type = exposure.trade_type
    )
  `);
}

function repairLegacyBatchTechnicalTradeManagementModes(sqlite) {
  const requiredTables = [
    "batches",
    "batch_members",
    "trade_position_management"
  ];

  if (requiredTables.some(tableName => !sqliteTableExists(sqlite, tableName))) {
    return;
  }

  sqlite.exec(`
    UPDATE trade_position_management
    SET initial_position_management_mode = 'AUTO',
        current_position_management_mode = 'AUTO',
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE trade_type IN ('BATCH_BALANCE_TRADE', 'BATCH_POSITION_OUT')
      AND initial_position_management_mode = 'MANUAL'
      AND current_position_management_mode = 'MANUAL'
      AND EXISTS
      (
        SELECT 1
        FROM batch_members output_member
        INNER JOIN batches batch
          ON batch.batch_id = output_member.batch_id
        WHERE output_member.trade_id = trade_position_management.trade_id
          AND output_member.trade_type = trade_position_management.trade_type
          AND
          (
            (
              trade_position_management.trade_type = 'BATCH_BALANCE_TRADE'
              AND output_member.member_role = 'BALANCE_TRADE'
            )
            OR
            (
              trade_position_management.trade_type = 'BATCH_POSITION_OUT'
              AND output_member.member_role = 'POSITION_OUT'
            )
          )
          AND batch.batch_status = 'FORMED'
          AND EXISTS
          (
            SELECT 1
            FROM batch_members source_member
            WHERE source_member.batch_id = output_member.batch_id
              AND source_member.member_role = 'TRADE'
          )
          AND NOT EXISTS
          (
            SELECT 1
            FROM batch_members source_member
            LEFT JOIN trade_position_management source_management
              ON source_management.trade_id = source_member.trade_id
              AND source_management.trade_type = source_member.trade_type
            WHERE source_member.batch_id = output_member.batch_id
              AND source_member.member_role = 'TRADE'
              AND
              (
                source_management.current_position_management_mode IS NULL
                OR source_management.current_position_management_mode <> 'AUTO'
              )
          )
      )
  `);
}

function prepareTradingCounterpartyTradeContextSchema(sqlite) {
  const tableName = "trading_counterparty_trade_contexts";

  if (!sqliteTableExists(sqlite, tableName)) {
    return;
  }

  const columns = tableColumnNames(sqlite, tableName);

  // A legacy party_id column would make schema.sql fail while creating the reverse index.
  if (!columns.has("counterparty_id") || !columns.has("trade_context_id")) {
    migrateTradingCounterpartyTradeContexts(sqlite);
  }
}

function uiTableColumnDefinitions(tableKey) {
  return UI_TABLE_LAYOUTS[tableKey]?.columns || null;
}

function ensureUiTableColumnSettings(sqlite) {
  const normalizedPersistedWidth = (value, fallback) => {
    const width = Number(value);

    return Number.isInteger(width)
      ? Math.min(UI_TABLE_COLUMN_WIDTH_MAX_PX, Math.max(UI_TABLE_COLUMN_WIDTH_MIN_PX, width))
      : fallback;
  };
  const existingSettings = sqlite.prepare(`
    SELECT
      table_key AS tableKey,
      column_key AS columnKey,
      default_width_px AS defaultWidthPx,
      width_px AS widthPx,
      updated_at AS updatedAt
    FROM ui_table_column_settings
  `).all();
  const existingSettingsByKey = new Map(
    existingSettings.map(setting => [
      `${setting.tableKey}.${setting.columnKey}`,
      setting
    ])
  );
  const insert = sqlite.prepare(`
    INSERT INTO ui_table_column_settings
      (table_key, column_key, column_label, display_order, default_width_px, width_px, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, COALESCE(?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')))
  `);

  UI_TABLE_COLUMN_KEY_ALIASES.forEach(alias => {
    const legacyKey = `${alias.tableKey}.${alias.legacyColumnKey}`;
    const currentKey = `${alias.tableKey}.${alias.columnKey}`;

    if (!existingSettingsByKey.has(currentKey)
      && existingSettingsByKey.has(legacyKey)) {
      existingSettingsByKey.set(currentKey, existingSettingsByKey.get(legacyKey));
    }
  });

  runInImmediateTransaction(sqlite, () => {
    sqlite.exec("DELETE FROM ui_table_column_settings");

    Object.entries(UI_TABLE_LAYOUTS).forEach(([tableKey, tableLayout]) => {
      tableLayout.columns.forEach((column, displayOrder) => {
        const existingSetting = existingSettingsByKey.get(
          `${tableKey}.${column.columnKey}`
        );
        const defaultWidthPx = normalizedPersistedWidth(
          existingSetting?.defaultWidthPx,
          column.defaultWidthPx
        );
        const widthPx = normalizedPersistedWidth(
          existingSetting?.widthPx,
          defaultWidthPx
        );

        insert.run(
          tableKey,
          column.columnKey,
          column.columnLabel,
          displayOrder,
          defaultWidthPx,
          widthPx,
          existingSetting?.updatedAt ?? null
        );
      });
    });
  });
}

function ensureUiColorTokens(sqlite) {
  const expectedColumns = [
    "token_code",
    "palette_family",
    "shade",
    "color_value",
    "display_order",
    "updated_at"
  ];
  const existingColumns = [...tableColumnNames(sqlite, "ui_color_tokens")];
  const columnsMatch = existingColumns.join(",") === expectedColumns.join(",");
  const tableSql = sqlite.prepare(`
    SELECT sql
    FROM sqlite_master
    WHERE type = 'table'
      AND name = 'ui_color_tokens'
  `).get()?.sql || "";
  const paletteFamilies = [...new Set(
    DEFAULT_UI_COLOR_TOKENS.map(token => token.paletteFamily)
  )];
  const supportsPaletteFamilies = paletteFamilies.every(
    paletteFamily => tableSql.includes(`'${paletteFamily}'`)
  );
  if (!columnsMatch || !supportsPaletteFamilies) {
    runInImmediateTransaction(sqlite, () => {
      sqlite.exec("DROP TABLE ui_color_tokens");
      sqlite.exec(UI_COLOR_TOKEN_TABLE_SQL);
    });
  }

  const insert = sqlite.prepare(`
    INSERT OR IGNORE INTO ui_color_tokens
      (
        token_code,
        palette_family,
        shade,
        color_value,
        display_order
      )
    VALUES (?, ?, ?, ?, ?)
  `);

  runInImmediateTransaction(sqlite, () => {
    DEFAULT_UI_COLOR_TOKENS.forEach(token => {
      insert.run(
        token.tokenCode,
        token.paletteFamily,
        token.shade,
        token.colorValue,
        token.displayOrder
      );
    });
  });
}

function uiTableColumnSettings(tableKey) {
  return database.prepare(`
    SELECT
      table_key AS tableKey,
      column_key AS columnKey,
      column_label AS columnLabel,
      display_order AS displayOrder,
      default_width_px AS defaultWidthPx,
      width_px AS widthPx,
      updated_at AS updatedAt
    FROM ui_table_column_settings
    WHERE table_key = ?
    ORDER BY display_order, column_key
  `).all(tableKey);
}

function validateUiTableColumnSettingsPayload(tableKey, body) {
  const definitions = uiTableColumnDefinitions(tableKey);

  if (!definitions) {
    return { error: `UI table layout ${tableKey} is not supported.` };
  }

  if (!Array.isArray(body?.columns)) {
    return { error: "UI table layout must contain a columns array." };
  }

  const expectedKeys = new Set(definitions.map(column => column.columnKey));
  const submittedKeys = new Set();
  const columns = [];

  for (const source of body.columns) {
    const columnKey = normalizedText(source?.columnKey).toLowerCase();
    const widthPx = Number(source?.widthPx);

    if (!expectedKeys.has(columnKey)) {
      return { error: `Unknown column ${columnKey || "(empty)"} for UI table layout ${tableKey}.` };
    }

    if (submittedKeys.has(columnKey)) {
      return { error: `Column ${columnKey} is duplicated.` };
    }

    if (!Number.isInteger(widthPx)
      || widthPx < UI_TABLE_COLUMN_WIDTH_MIN_PX
      || widthPx > UI_TABLE_COLUMN_WIDTH_MAX_PX) {
      return {
        error: `Column ${columnKey} width must be an integer from ${UI_TABLE_COLUMN_WIDTH_MIN_PX} to ${UI_TABLE_COLUMN_WIDTH_MAX_PX} pixels.`
      };
    }

    submittedKeys.add(columnKey);
    columns.push({ columnKey, widthPx });
  }

  if (submittedKeys.size !== expectedKeys.size) {
    return { error: `UI table layout ${tableKey} must contain every configured column.` };
  }

  return { tableKey, columns };
}

function updateUiTableColumnSettings(payload) {
  const update = database.prepare(`
    UPDATE ui_table_column_settings
    SET width_px = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE table_key = ? AND column_key = ?
  `);

  runInImmediateTransaction(database, () => {
    payload.columns.forEach(column => {
      update.run(column.widthPx, payload.tableKey, column.columnKey);
    });
  });

  return uiTableColumnSettings(payload.tableKey);
}

function updateUiTableColumnDefaults(payload) {
  const update = database.prepare(`
    UPDATE ui_table_column_settings
    SET default_width_px = ?,
        width_px = ?,
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE table_key = ? AND column_key = ?
  `);

  runInImmediateTransaction(database, () => {
    payload.columns.forEach(column => {
      update.run(
        column.widthPx,
        column.widthPx,
        payload.tableKey,
        column.columnKey
      );
    });
  });

  return uiTableColumnSettings(payload.tableKey);
}

function resetUiTableColumnSettings(tableKey) {
  database.prepare(`
    UPDATE ui_table_column_settings
    SET width_px = default_width_px,
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE table_key = ?
  `).run(tableKey);

  return uiTableColumnSettings(tableKey);
}

function migrateTradeExposureTypes(sqlite) {
  const tableDefinition = sqlite.prepare(`
    SELECT sql
    FROM sqlite_master
    WHERE type = 'table' AND name = 'trade_exposures'
  `).get()?.sql || "";
  const supportsEveryTradeType = TRADE_TYPES.every(tradeType =>
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
  const columns = sqlite.prepare("PRAGMA table_info(trade_exposures)").all()
    .map(column => column.name);
  const modernColumns = [
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

  if (columns.join(",") === modernColumns.join(",")) {
    return;
  }

  if (columns.join(",") !== expectedColumns.join(",")) {
    throw new Error("Unsupported Trade Exposure schema.");
  }

  const invalidTrade = sqlite.prepare(`
    SELECT trade_id, trade_type
    FROM trade_exposures
    WHERE trade_type NOT IN (${TRADE_TYPES.map(() => "?").join(", ")})
    LIMIT 1
  `).get(...TRADE_TYPES);

  if (invalidTrade) {
    throw new Error(
      `Trade Exposure ${invalidTrade.trade_id} has unsupported type ${invalidTrade.trade_type}.`
    );
  }

  const originalRowCount = Number(
    sqlite.prepare("SELECT COUNT(*) AS count FROM trade_exposures").get().count
  );
  sqlite.exec("PRAGMA foreign_keys = OFF");

  try {
    sqlite.exec("BEGIN IMMEDIATE");
    sqlite.exec(`
      CREATE TABLE trade_exposures_migrated
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

          CONSTRAINT fk_trade_exposures_ccy_pair
              FOREIGN KEY (ccy_pair_code)
                  REFERENCES ccy_pair_options (ccy_pair_code)
                  ON UPDATE RESTRICT
                  ON DELETE RESTRICT,
          CONSTRAINT chk_trade_exposures_entry_timestamp
              CHECK (
                  length(entry_timestamp) = 24
                  AND entry_timestamp GLOB '????-??-??T??:??:??.???Z'
                  AND strftime('%Y-%m-%dT%H:%M:%fZ', entry_timestamp) = entry_timestamp
              ),
          CONSTRAINT chk_trade_exposures_trade_type
              CHECK (
                  trade_type IN
                  (
                      'CLIENT_DEAL',
                      'HEDGE_DEAL',
                      'BATCH_BALANCE_TRADE',
                      'BATCH_POSITION_OUT'
                  )
              ),
          CONSTRAINT chk_trade_exposures_trade_date
              CHECK (
                  trade_date GLOB '????-??-??'
                  AND strftime('%Y-%m-%d', trade_date) = trade_date
              ),
          CONSTRAINT chk_trade_exposures_side
              CHECK (side IN ('BUY', 'SELL')),
          CONSTRAINT chk_trade_exposures_amounts_and_rate
              CHECK (
                  typeof(base_ccy_amount) IN ('integer', 'real')
                  AND base_ccy_amount > 0
                  AND typeof(quote_ccy_amount) IN ('integer', 'real')
                  AND quote_ccy_amount > 0
                  AND typeof(trade_rate) IN ('integer', 'real')
                  AND trade_rate > 0
              ),
          CONSTRAINT chk_trade_exposures_tenor
              CHECK (tenor IN ('TOD', 'TOM', 'SPOT')),
          CONSTRAINT chk_trade_exposures_value_dates
              CHECK (
                  base_ccy_value_date GLOB '????-??-??'
                  AND strftime('%Y-%m-%d', base_ccy_value_date) = base_ccy_value_date
                  AND quote_ccy_value_date GLOB '????-??-??'
                  AND strftime('%Y-%m-%d', quote_ccy_value_date) = quote_ccy_value_date
              )
      );

      INSERT INTO trade_exposures_migrated
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
      FROM trade_exposures
      ORDER BY trade_id;

      DROP TABLE trade_exposures;
      ALTER TABLE trade_exposures_migrated RENAME TO trade_exposures;

      CREATE INDEX idx_trade_exposures_entry_timestamp
          ON trade_exposures (entry_timestamp);
      CREATE INDEX idx_trade_exposures_trade_type
          ON trade_exposures (trade_type);
      CREATE INDEX idx_trade_exposures_trade_date
          ON trade_exposures (trade_date);
      CREATE INDEX idx_trade_exposures_ccy_pair
          ON trade_exposures (ccy_pair_code);
      CREATE UNIQUE INDEX uq_trade_exposures_identity
          ON trade_exposures (trade_id, trade_type);
    `);

    const migratedRowCount = Number(
      sqlite.prepare("SELECT COUNT(*) AS count FROM trade_exposures").get().count
    );
    const foreignKeyViolations = sqlite.prepare("PRAGMA foreign_key_check").all();

    if (migratedRowCount !== originalRowCount) {
      throw new Error("Trade Exposure type migration did not preserve every row.");
    }

    if (foreignKeyViolations.length > 0) {
      throw new Error("Trade Exposure type migration produced foreign key violations.");
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

function migrateTradeExposureAmountsToMinorUnits(sqlite) {
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
  const timestampedFinalColumns = [
    "trade_id",
    "execution_timestamp",
    "received_timestamp",
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
  const tableInfo = sqlite.prepare("PRAGMA table_info(trade_exposures)").all();
  const columns = tableInfo.map(column => column.name);
  const tableDefinition = sqlite.prepare(`
    SELECT sql
    FROM sqlite_master
    WHERE type = 'table' AND name = 'trade_exposures'
  `).get()?.sql || "";

  const isIntermediateSchema = columns.join(",") === targetColumns.join(",");
  const isFinalSchema = columns.join(",") === finalColumns.join(",");
  const isTimestampedFinalSchema =
    columns.join(",") === timestampedFinalColumns.join(",");

  if (isIntermediateSchema || isFinalSchema || isTimestampedFinalSchema) {
    const amountColumnOffset = isTimestampedFinalSchema
      ? 8
      : isFinalSchema
        ? 7
        : 6;
    const targetDefinitionsAreValid = tableInfo[amountColumnOffset]?.type === "INTEGER"
      && tableInfo[amountColumnOffset]?.notnull === 1
      && tableInfo[amountColumnOffset + 1]?.type === "INTEGER"
      && tableInfo[amountColumnOffset + 1]?.notnull === 1
      && tableInfo[amountColumnOffset + 2]?.type === "INTEGER"
      && tableInfo[amountColumnOffset + 2]?.notnull === 1
      && tableInfo[amountColumnOffset + 3]?.type === "INTEGER"
      && tableInfo[amountColumnOffset + 3]?.notnull === 1
      && tableDefinition.includes("chk_trade_exposures_amounts")
      && tableDefinition.includes("chk_trade_exposures_fraction_digits");

    if (!targetDefinitionsAreValid) {
      throw new Error("Unsupported Trade Exposure minor-unit schema.");
    }

    return;
  }

  if (columns.join(",") !== sourceColumns.join(",")) {
    throw new Error("Unsupported Trade Exposure amount schema.");
  }

  const sourceRows = sqlite.prepare(`
    SELECT
      e.*,
      base_ccy.fraction_digits AS base_ccy_fraction_digits,
      quote_ccy.fraction_digits AS quote_ccy_fraction_digits
    FROM trade_exposures e
    INNER JOIN ccy_pair_options pair ON pair.ccy_pair_code = e.ccy_pair_code
    INNER JOIN ccy_options base_ccy ON base_ccy.ccy_code = pair.base_ccy_code
    INNER JOIN ccy_options quote_ccy ON quote_ccy.ccy_code = pair.quote_ccy_code
    ORDER BY e.trade_id
  `).all();
  const originalRowCount = Number(
    sqlite.prepare("SELECT COUNT(*) AS count FROM trade_exposures").get().count
  );

  if (sourceRows.length !== originalRowCount) {
    throw new Error("Every Trade Exposure must resolve both currency fraction digits.");
  }

  sqlite.exec("PRAGMA foreign_keys = OFF");

  try {
    sqlite.exec("BEGIN IMMEDIATE");
    sqlite.exec(`
      CREATE TABLE trade_exposures_minor
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

          CONSTRAINT fk_trade_exposures_ccy_pair
              FOREIGN KEY (ccy_pair_code)
                  REFERENCES ccy_pair_options (ccy_pair_code)
                  ON UPDATE RESTRICT
                  ON DELETE RESTRICT,
          CONSTRAINT chk_trade_exposures_entry_timestamp
              CHECK (
                  length(entry_timestamp) = 24
                  AND entry_timestamp GLOB '????-??-??T??:??:??.???Z'
                  AND strftime('%Y-%m-%dT%H:%M:%fZ', entry_timestamp) = entry_timestamp
              ),
          CONSTRAINT chk_trade_exposures_trade_type
              CHECK (
                  trade_type IN
                  (
                      'CLIENT_DEAL',
                      'HEDGE_DEAL',
                      'BATCH_BALANCE_TRADE',
                      'BATCH_POSITION_OUT'
                  )
              ),
          CONSTRAINT chk_trade_exposures_trade_date
              CHECK (
                  trade_date GLOB '????-??-??'
                  AND strftime('%Y-%m-%d', trade_date) = trade_date
              ),
          CONSTRAINT chk_trade_exposures_side
              CHECK (side IN ('BUY', 'SELL')),
          CONSTRAINT chk_trade_exposures_amounts
              CHECK (
                  typeof(base_ccy_amount_minor) = 'integer'
                  AND base_ccy_amount_minor BETWEEN 1 AND 9007199254740991
                  AND typeof(quote_ccy_amount_minor) = 'integer'
                  AND quote_ccy_amount_minor BETWEEN 1 AND 9007199254740991
              ),
          CONSTRAINT chk_trade_exposures_fraction_digits
              CHECK (
                  typeof(base_ccy_fraction_digits) = 'integer'
                  AND base_ccy_fraction_digits BETWEEN 0 AND 10
                  AND typeof(quote_ccy_fraction_digits) = 'integer'
                  AND quote_ccy_fraction_digits BETWEEN 0 AND 10
              ),
          CONSTRAINT chk_trade_exposures_rate
              CHECK (
                  typeof(trade_rate) IN ('integer', 'real')
                  AND trade_rate > 0
              ),
          CONSTRAINT chk_trade_exposures_tenor
              CHECK (tenor IN ('TOD', 'TOM', 'SPOT')),
          CONSTRAINT chk_trade_exposures_value_dates
              CHECK (
                  base_ccy_value_date GLOB '????-??-??'
                  AND strftime('%Y-%m-%d', base_ccy_value_date) = base_ccy_value_date
                  AND quote_ccy_value_date GLOB '????-??-??'
                  AND strftime('%Y-%m-%d', quote_ccy_value_date) = quote_ccy_value_date
              )
      );
    `);

    const insert = sqlite.prepare(`
      INSERT INTO trade_exposures_minor
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
      DROP TABLE trade_exposures;
      ALTER TABLE trade_exposures_minor RENAME TO trade_exposures;

      CREATE INDEX idx_trade_exposures_entry_timestamp
          ON trade_exposures (entry_timestamp);
      CREATE INDEX idx_trade_exposures_trade_type
          ON trade_exposures (trade_type);
      CREATE INDEX idx_trade_exposures_trade_date
          ON trade_exposures (trade_date);
      CREATE INDEX idx_trade_exposures_ccy_pair
          ON trade_exposures (ccy_pair_code);
      CREATE UNIQUE INDEX uq_trade_exposures_identity
          ON trade_exposures (trade_id, trade_type);
    `);

    const migratedRowCount = Number(
      sqlite.prepare("SELECT COUNT(*) AS count FROM trade_exposures").get().count
    );
    const foreignKeyViolations = sqlite.prepare("PRAGMA foreign_key_check").all();

    if (migratedRowCount !== originalRowCount) {
      throw new Error("Trade Exposure minor-unit migration did not preserve every row.");
    }

    if (foreignKeyViolations.length > 0) {
      throw new Error("Trade Exposure minor-unit migration produced foreign key violations.");
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

function migrateTradeExposureTradeSemantics(sqlite) {
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
  const timestampedTargetColumns = [
    "trade_id",
    "execution_timestamp",
    "received_timestamp",
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
  const tableInfo = sqlite.prepare("PRAGMA table_info(trade_exposures)").all();
  const columns = tableInfo.map(column => column.name);
  const tableDefinition = sqlite.prepare(`
    SELECT sql
    FROM sqlite_master
    WHERE type = 'table' AND name = 'trade_exposures'
  `).get()?.sql || "";

  const usesTimestampedTarget =
    columns.join(",") === timestampedTargetColumns.join(",");

  if (columns.join(",") === targetColumns.join(",") || usesTimestampedTarget) {
    const semanticColumnOffset = usesTimestampedTarget ? 6 : 5;
    const definitionsAreValid = tableInfo[semanticColumnOffset]?.type === "TEXT"
      && tableInfo[semanticColumnOffset]?.notnull === 1
      && tableInfo[semanticColumnOffset + 1]?.type === "TEXT"
      && tableInfo[semanticColumnOffset + 1]?.notnull === 1
      && (
        tableDefinition.includes("chk_trade_exposures_base_ccy_side")
        || tableDefinition.includes("base_ccy_side = 'FLAT'")
      )
      && tableDefinition.includes("chk_trade_exposures_dealt_ccy_code");

    if (!definitionsAreValid) {
      throw new Error("Unsupported Trade Exposure trade-semantics schema.");
    }

    return;
  }

  if (columns.join(",") !== sourceColumns.join(",")) {
    throw new Error("Unsupported Trade Exposure trade-semantics migration source.");
  }

  const sourceRows = sqlite.prepare(`
    SELECT e.*, pair.base_ccy_code
    FROM trade_exposures e
    INNER JOIN ccy_pair_options pair ON pair.ccy_pair_code = e.ccy_pair_code
    ORDER BY e.trade_id
  `).all();
  const originalRowCount = Number(
    sqlite.prepare("SELECT COUNT(*) AS count FROM trade_exposures").get().count
  );

  if (sourceRows.length !== originalRowCount) {
    throw new Error("Every Trade Exposure must resolve its Ccy Pair.");
  }

  sqlite.exec("PRAGMA foreign_keys = OFF");

  try {
    sqlite.exec("BEGIN IMMEDIATE");
    sqlite.exec(`
      CREATE TABLE trade_exposures_semantics
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

          CONSTRAINT fk_trade_exposures_ccy_pair
              FOREIGN KEY (ccy_pair_code)
                  REFERENCES ccy_pair_options (ccy_pair_code)
                  ON UPDATE RESTRICT
                  ON DELETE RESTRICT,
          CONSTRAINT fk_trade_exposures_dealt_ccy
              FOREIGN KEY (dealt_ccy_code)
                  REFERENCES ccy_options (ccy_code)
                  ON UPDATE RESTRICT
                  ON DELETE RESTRICT,
          CONSTRAINT chk_trade_exposures_entry_timestamp
              CHECK (
                  length(entry_timestamp) = 24
                  AND entry_timestamp GLOB '????-??-??T??:??:??.???Z'
                  AND strftime('%Y-%m-%dT%H:%M:%fZ', entry_timestamp) = entry_timestamp
              ),
          CONSTRAINT chk_trade_exposures_trade_type
              CHECK (
                  trade_type IN
                  (
                      'CLIENT_DEAL',
                      'HEDGE_DEAL',
                      'BATCH_BALANCE_TRADE',
                      'BATCH_POSITION_OUT'
                  )
              ),
          CONSTRAINT chk_trade_exposures_trade_date
              CHECK (
                  trade_date GLOB '????-??-??'
                  AND strftime('%Y-%m-%d', trade_date) = trade_date
              ),
          CONSTRAINT chk_trade_exposures_base_ccy_side
              CHECK (base_ccy_side IN ('BUY', 'SELL')),
          CONSTRAINT chk_trade_exposures_dealt_ccy_code
              CHECK (
                  length(dealt_ccy_code) = 3
                  AND dealt_ccy_code = upper(dealt_ccy_code)
                  AND dealt_ccy_code NOT GLOB '*[^A-Z]*'
              ),
          CONSTRAINT chk_trade_exposures_amounts
              CHECK (
                  typeof(base_ccy_amount_minor) = 'integer'
                  AND base_ccy_amount_minor BETWEEN 1 AND 9007199254740991
                  AND typeof(quote_ccy_amount_minor) = 'integer'
                  AND quote_ccy_amount_minor BETWEEN 1 AND 9007199254740991
              ),
          CONSTRAINT chk_trade_exposures_fraction_digits
              CHECK (
                  typeof(base_ccy_fraction_digits) = 'integer'
                  AND base_ccy_fraction_digits BETWEEN 0 AND 10
                  AND typeof(quote_ccy_fraction_digits) = 'integer'
                  AND quote_ccy_fraction_digits BETWEEN 0 AND 10
              ),
          CONSTRAINT chk_trade_exposures_rate
              CHECK (
                  typeof(trade_rate) IN ('integer', 'real')
                  AND trade_rate > 0
              ),
          CONSTRAINT chk_trade_exposures_tenor
              CHECK (tenor IN ('TOD', 'TOM', 'SPOT')),
          CONSTRAINT chk_trade_exposures_value_dates
              CHECK (
                  base_ccy_value_date GLOB '????-??-??'
                  AND strftime('%Y-%m-%d', base_ccy_value_date) = base_ccy_value_date
                  AND quote_ccy_value_date GLOB '????-??-??'
                  AND strftime('%Y-%m-%d', quote_ccy_value_date) = quote_ccy_value_date
              )
      );
    `);

    const insert = sqlite.prepare(`
      INSERT INTO trade_exposures_semantics
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
      DROP TABLE trade_exposures;
      ALTER TABLE trade_exposures_semantics RENAME TO trade_exposures;

      CREATE INDEX idx_trade_exposures_entry_timestamp
          ON trade_exposures (entry_timestamp);
      CREATE INDEX idx_trade_exposures_trade_type
          ON trade_exposures (trade_type);
      CREATE INDEX idx_trade_exposures_trade_date
          ON trade_exposures (trade_date);
      CREATE INDEX idx_trade_exposures_ccy_pair
          ON trade_exposures (ccy_pair_code);
      CREATE UNIQUE INDEX uq_trade_exposures_identity
          ON trade_exposures (trade_id, trade_type);
    `);

    const migratedRowCount = Number(
      sqlite.prepare("SELECT COUNT(*) AS count FROM trade_exposures").get().count
    );
    const foreignKeyViolations = sqlite.prepare("PRAGMA foreign_key_check").all();

    if (migratedRowCount !== originalRowCount) {
      throw new Error("Trade Exposure trade-semantics migration did not preserve every row.");
    }

    if (foreignKeyViolations.length > 0) {
      throw new Error("Trade Exposure trade-semantics migration produced foreign key violations.");
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

function ensureTradeExposureTimestampIndexes(sqlite) {
  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_trade_exposures_execution_timestamp
        ON trade_exposures (execution_timestamp);
    CREATE INDEX IF NOT EXISTS idx_trade_exposures_received_timestamp
        ON trade_exposures (received_timestamp);
  `);
}

function migrateTradeExposureTimestamps(sqlite) {
  const tableInfo = sqlite.prepare("PRAGMA table_info(trade_exposures)").all();
  const columns = tableInfo.map(column => column.name);
  const legacyColumns = [
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
  const targetColumns = [
    "trade_id",
    "execution_timestamp",
    "received_timestamp",
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
  const columnSignature = columns.join(",");

  if (columnSignature === targetColumns.join(",")) {
    const tableDefinition = sqlite.prepare(`
      SELECT sql
      FROM sqlite_master
      WHERE type = 'table' AND name = 'trade_exposures'
    `).get()?.sql || "";
    const definitionsAreValid = tableInfo[1]?.type === "TEXT"
      && tableInfo[1]?.notnull === 1
      && tableInfo[2]?.type === "TEXT"
      && tableInfo[2]?.notnull === 1
      && tableDefinition.includes("chk_trade_exposures_execution_timestamp")
      && tableDefinition.includes("chk_trade_exposures_received_timestamp")
      && !tableDefinition.includes("entry_timestamp");

    if (!definitionsAreValid) {
      throw new Error("Unsupported Trade Exposure timestamp schema.");
    }

    ensureTradeExposureTimestampIndexes(sqlite);
    return;
  }

  if (columnSignature !== legacyColumns.join(",")) {
    throw new Error("Unsupported Trade Exposure timestamp migration source.");
  }

  const originalRowCount = Number(
    sqlite.prepare("SELECT COUNT(*) AS count FROM trade_exposures").get().count
  );
  sqlite.exec("PRAGMA foreign_keys = OFF");

  try {
    sqlite.exec("BEGIN IMMEDIATE");
    sqlite.exec(`
      CREATE TABLE trade_exposures_timestamps
      (
          trade_id                    INTEGER PRIMARY KEY,
          execution_timestamp         TEXT    NOT NULL,
          received_timestamp          TEXT    NOT NULL,
          trade_type                  TEXT    NOT NULL,
          trade_date                  TEXT    NOT NULL,
          ccy_pair_code               TEXT    NOT NULL,
          base_ccy_side               TEXT    NOT NULL,
          dealt_ccy_code              TEXT    NOT NULL,
          base_ccy_amount_minor       INTEGER NOT NULL,
          base_ccy_fraction_digits    INTEGER NOT NULL,
          quote_ccy_amount_minor      INTEGER NOT NULL,
          quote_ccy_fraction_digits   INTEGER NOT NULL,
          trade_rate                  NUMERIC,
          tenor                       TEXT    NOT NULL,
          base_ccy_value_date         TEXT    NOT NULL,
          quote_ccy_value_date        TEXT    NOT NULL,

          CONSTRAINT fk_trade_exposures_ccy_pair
              FOREIGN KEY (ccy_pair_code)
                  REFERENCES ccy_pair_options (ccy_pair_code)
                  ON UPDATE RESTRICT
                  ON DELETE RESTRICT,
          CONSTRAINT fk_trade_exposures_dealt_ccy
              FOREIGN KEY (dealt_ccy_code)
                  REFERENCES ccy_options (ccy_code)
                  ON UPDATE RESTRICT
                  ON DELETE RESTRICT,
          CONSTRAINT uq_trade_exposures_identity
              UNIQUE (trade_id, trade_type),
          CONSTRAINT chk_trade_exposures_execution_timestamp
              CHECK (
                  length(execution_timestamp) = 24
                  AND execution_timestamp GLOB '????-??-??T??:??:??.???Z'
                  AND strftime('%Y-%m-%dT%H:%M:%fZ', execution_timestamp)
                      = execution_timestamp
              ),
          CONSTRAINT chk_trade_exposures_received_timestamp
              CHECK (
                  length(received_timestamp) = 24
                  AND received_timestamp GLOB '????-??-??T??:??:??.???Z'
                  AND strftime('%Y-%m-%dT%H:%M:%fZ', received_timestamp)
                      = received_timestamp
              ),
          CONSTRAINT chk_trade_exposures_trade_type
              CHECK (
                  trade_type IN
                  (
                      'CLIENT_DEAL',
                      'HEDGE_DEAL',
                      'BATCH_BALANCE_TRADE',
                      'BATCH_POSITION_OUT'
                  )
              ),
          CONSTRAINT chk_trade_exposures_trade_date
              CHECK (
                  trade_date GLOB '????-??-??'
                  AND strftime('%Y-%m-%d', trade_date) = trade_date
              ),
          CONSTRAINT chk_trade_exposures_dealt_ccy_code
              CHECK (
                  length(dealt_ccy_code) = 3
                  AND dealt_ccy_code = upper(dealt_ccy_code)
                  AND dealt_ccy_code NOT GLOB '*[^A-Z]*'
              ),
          CONSTRAINT chk_trade_exposures_amounts
              CHECK (
                  (
                      trade_type = 'BATCH_POSITION_OUT'
                      AND base_ccy_side = 'FLAT'
                      AND typeof(base_ccy_amount_minor) = 'integer'
                      AND base_ccy_amount_minor = 0
                      AND typeof(quote_ccy_amount_minor) = 'integer'
                      AND quote_ccy_amount_minor = 0
                      AND trade_rate IS NULL
                  )
                  OR (
                      base_ccy_side IN ('BUY', 'SELL')
                      AND typeof(base_ccy_amount_minor) = 'integer'
                      AND base_ccy_amount_minor BETWEEN 1 AND 9007199254740991
                      AND typeof(quote_ccy_amount_minor) = 'integer'
                      AND quote_ccy_amount_minor BETWEEN 1 AND 9007199254740991
                      AND typeof(trade_rate) IN ('integer', 'real')
                      AND trade_rate > 0
                  )
              ),
          CONSTRAINT chk_trade_exposures_fraction_digits
              CHECK (
                  typeof(base_ccy_fraction_digits) = 'integer'
                  AND base_ccy_fraction_digits BETWEEN 0 AND 10
                  AND typeof(quote_ccy_fraction_digits) = 'integer'
                  AND quote_ccy_fraction_digits BETWEEN 0 AND 10
              ),
          CONSTRAINT chk_trade_exposures_tenor
              CHECK (tenor IN ('TOD', 'TOM', 'SPOT')),
          CONSTRAINT chk_trade_exposures_value_dates
              CHECK (
                  base_ccy_value_date GLOB '????-??-??'
                  AND strftime('%Y-%m-%d', base_ccy_value_date) = base_ccy_value_date
                  AND quote_ccy_value_date GLOB '????-??-??'
                  AND strftime('%Y-%m-%d', quote_ccy_value_date) = quote_ccy_value_date
              )
      );

      INSERT INTO trade_exposures_timestamps
        (
          trade_id,
          execution_timestamp,
          received_timestamp,
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
      SELECT
          trade_id,
          entry_timestamp,
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
      FROM trade_exposures
      ORDER BY trade_id;

      DROP TABLE trade_exposures;
      ALTER TABLE trade_exposures_timestamps RENAME TO trade_exposures;

      CREATE INDEX idx_trade_exposures_execution_timestamp
          ON trade_exposures (execution_timestamp);
      CREATE INDEX idx_trade_exposures_received_timestamp
          ON trade_exposures (received_timestamp);
      CREATE INDEX idx_trade_exposures_trade_type
          ON trade_exposures (trade_type);
      CREATE INDEX idx_trade_exposures_trade_date
          ON trade_exposures (trade_date);
      CREATE INDEX idx_trade_exposures_ccy_pair
          ON trade_exposures (ccy_pair_code);
      CREATE UNIQUE INDEX uq_trade_exposures_identity
          ON trade_exposures (trade_id, trade_type);
    `);

    const migratedRowCount = Number(
      sqlite.prepare("SELECT COUNT(*) AS count FROM trade_exposures").get().count
    );
    const foreignKeyViolations = sqlite.prepare("PRAGMA foreign_key_check").all();

    if (migratedRowCount !== originalRowCount) {
      throw new Error("Trade Exposure timestamp migration did not preserve every row.");
    }

    if (foreignKeyViolations.length > 0) {
      throw new Error("Trade Exposure timestamp migration produced foreign key violations.");
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

function migrateBatchTradeSemantics(sqlite) {
  const exposureSql = sqlite.prepare(`
    SELECT sql
    FROM sqlite_master
    WHERE type = 'table' AND name = 'trade_exposures'
  `).get()?.sql || "";
  const membersSql = sqlite.prepare(`
    SELECT sql
    FROM sqlite_master
    WHERE type = 'table' AND name = 'batch_members'
  `).get()?.sql || "";
  const balanceTradeSql = sqlite.prepare(`
    SELECT sql
    FROM sqlite_master
    WHERE type = 'table' AND name = 'batch_balance_trades'
  `).get()?.sql || "";
  const alreadyMigrated = exposureSql.includes("'BATCH_BALANCE_TRADE'")
    && exposureSql.includes("base_ccy_side = 'FLAT'")
    && (
      membersSql.includes("'BATCH_BALANCE_TRADE'")
      || (
        /CHECK\s*\(\s*member_role\s*=\s*'TRADE'\s*\)/i.test(membersSql)
        && balanceTradeSql.includes("'BATCH_BALANCE_TRADE'")
      )
    );

  if (alreadyMigrated) {
    return;
  }

  const exposureCount = Number(
    sqlite.prepare("SELECT COUNT(*) AS count FROM trade_exposures").get().count
  );
  const batchCount = Number(
    sqlite.prepare("SELECT COUNT(*) AS count FROM batches").get().count
  );
  const memberCount = Number(
    sqlite.prepare("SELECT COUNT(*) AS count FROM batch_members").get().count
  );
  const outputCount = Number(
    sqlite.prepare("SELECT COUNT(*) AS count FROM batch_position_outputs").get().count
  );

  sqlite.exec("PRAGMA foreign_keys = OFF");

  try {
    sqlite.exec("BEGIN IMMEDIATE");
    sqlite.exec(`
      CREATE TABLE trade_exposures_batch_semantics
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
          trade_rate                  NUMERIC,
          tenor                       TEXT    NOT NULL,
          base_ccy_value_date         TEXT    NOT NULL,
          quote_ccy_value_date        TEXT    NOT NULL,

          CONSTRAINT fk_trade_exposures_ccy_pair
              FOREIGN KEY (ccy_pair_code)
                  REFERENCES ccy_pair_options (ccy_pair_code)
                  ON UPDATE RESTRICT
                  ON DELETE RESTRICT,
          CONSTRAINT fk_trade_exposures_dealt_ccy
              FOREIGN KEY (dealt_ccy_code)
                  REFERENCES ccy_options (ccy_code)
                  ON UPDATE RESTRICT
                  ON DELETE RESTRICT,
          CONSTRAINT uq_trade_exposures_identity
              UNIQUE (trade_id, trade_type),
          CONSTRAINT chk_trade_exposures_entry_timestamp
              CHECK (
                  length(entry_timestamp) = 24
                  AND entry_timestamp GLOB '????-??-??T??:??:??.???Z'
                  AND strftime('%Y-%m-%dT%H:%M:%fZ', entry_timestamp) = entry_timestamp
              ),
          CONSTRAINT chk_trade_exposures_trade_type
              CHECK (
                  trade_type IN
                  (
                      'CLIENT_DEAL',
                      'HEDGE_DEAL',
                      'BATCH_BALANCE_TRADE',
                      'BATCH_POSITION_OUT'
                  )
              ),
          CONSTRAINT chk_trade_exposures_trade_date
              CHECK (
                  trade_date GLOB '????-??-??'
                  AND strftime('%Y-%m-%d', trade_date) = trade_date
              ),
          CONSTRAINT chk_trade_exposures_dealt_ccy_code
              CHECK (
                  length(dealt_ccy_code) = 3
                  AND dealt_ccy_code = upper(dealt_ccy_code)
                  AND dealt_ccy_code NOT GLOB '*[^A-Z]*'
              ),
          CONSTRAINT chk_trade_exposures_amounts
              CHECK (
                  (
                      trade_type = 'BATCH_POSITION_OUT'
                      AND base_ccy_side = 'FLAT'
                      AND typeof(base_ccy_amount_minor) = 'integer'
                      AND base_ccy_amount_minor = 0
                      AND typeof(quote_ccy_amount_minor) = 'integer'
                      AND quote_ccy_amount_minor = 0
                      AND trade_rate IS NULL
                  )
                  OR (
                      base_ccy_side IN ('BUY', 'SELL')
                      AND typeof(base_ccy_amount_minor) = 'integer'
                      AND base_ccy_amount_minor BETWEEN 1 AND 9007199254740991
                      AND typeof(quote_ccy_amount_minor) = 'integer'
                      AND quote_ccy_amount_minor BETWEEN 1 AND 9007199254740991
                      AND typeof(trade_rate) IN ('integer', 'real')
                      AND trade_rate > 0
                  )
              ),
          CONSTRAINT chk_trade_exposures_fraction_digits
              CHECK (
                  typeof(base_ccy_fraction_digits) = 'integer'
                  AND base_ccy_fraction_digits BETWEEN 0 AND 10
                  AND typeof(quote_ccy_fraction_digits) = 'integer'
                  AND quote_ccy_fraction_digits BETWEEN 0 AND 10
              ),
          CONSTRAINT chk_trade_exposures_tenor
              CHECK (tenor IN ('TOD', 'TOM', 'SPOT')),
          CONSTRAINT chk_trade_exposures_value_dates
              CHECK (
                  base_ccy_value_date GLOB '????-??-??'
                  AND strftime('%Y-%m-%d', base_ccy_value_date) = base_ccy_value_date
                  AND quote_ccy_value_date GLOB '????-??-??'
                  AND strftime('%Y-%m-%d', quote_ccy_value_date) = quote_ccy_value_date
              )
      );

      INSERT INTO trade_exposures_batch_semantics
      SELECT
          trade_id,
          entry_timestamp,
          CASE trade_type
              WHEN 'BATCH_BALANCING_TRADE' THEN 'BATCH_BALANCE_TRADE'
              ELSE trade_type
          END,
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
      FROM trade_exposures
      ORDER BY trade_id;

      CREATE TABLE batches_batch_semantics
      (
          batch_id        INTEGER PRIMARY KEY AUTOINCREMENT,
          idempotency_key TEXT    NOT NULL,
          ccy_pair_code   TEXT    NOT NULL,
          batch_status    TEXT    NOT NULL DEFAULT 'BUILDING',
          created_at      TEXT    NOT NULL
              DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),

          CONSTRAINT fk_batches_ccy_pair
              FOREIGN KEY (ccy_pair_code)
                  REFERENCES ccy_pair_options (ccy_pair_code)
                  ON UPDATE RESTRICT
                  ON DELETE RESTRICT,
          CONSTRAINT uq_batches_idempotency_key
              UNIQUE (idempotency_key),
          CONSTRAINT chk_batches_id
              CHECK (batch_id > 0),
          CONSTRAINT chk_batches_idempotency_key
              CHECK (
                  length(idempotency_key) BETWEEN 1 AND 100
                  AND idempotency_key = trim(idempotency_key)
              ),
          CONSTRAINT chk_batches_status
              CHECK (batch_status IN ('BUILDING', 'FORMED')),
          CONSTRAINT chk_batches_created_at
              CHECK (
                  length(created_at) = 24
                  AND created_at GLOB '????-??-??T??:??:??.???Z'
                  AND strftime('%Y-%m-%dT%H:%M:%fZ', created_at) = created_at
              )
      );

      INSERT INTO batches_batch_semantics
      SELECT batch_id, idempotency_key, ccy_pair_code, batch_status, created_at
      FROM batches
      ORDER BY batch_id;

      CREATE TABLE batch_members_batch_semantics
      (
          batch_id    INTEGER NOT NULL,
          trade_id    INTEGER NOT NULL,
          trade_type  TEXT    NOT NULL,
          member_role TEXT    NOT NULL,

          CONSTRAINT pk_batch_members
              PRIMARY KEY (batch_id, trade_id),
          CONSTRAINT fk_batch_members_batch
              FOREIGN KEY (batch_id)
                  REFERENCES batches_batch_semantics (batch_id)
                  ON UPDATE RESTRICT
                  ON DELETE RESTRICT,
          CONSTRAINT fk_batch_members_trade
              FOREIGN KEY (trade_id, trade_type)
                  REFERENCES trade_exposures_batch_semantics (trade_id, trade_type)
                  ON UPDATE RESTRICT
                  ON DELETE RESTRICT,
          CONSTRAINT uq_batch_members_trade
              UNIQUE (trade_id),
          CONSTRAINT chk_batch_members_role
              CHECK (member_role IN ('TRADE', 'BALANCE_TRADE', 'BALANCE_QUOTE_CASH')),
          CONSTRAINT chk_batch_members_role_trade_type
              CHECK (
                  (member_role = 'TRADE'
                      AND trade_type IN
                      (
                          'CLIENT_DEAL',
                          'HEDGE_DEAL',
                          'BATCH_POSITION_OUT'
                      ))
                  OR (member_role = 'BALANCE_TRADE'
                      AND trade_type = 'BATCH_BALANCE_TRADE')
                  OR (member_role = 'BALANCE_QUOTE_CASH'
                      AND trade_type = 'BATCH_BALANCE_QUOTE_CASH')
              )
      );

      INSERT INTO batch_members_batch_semantics
      SELECT
          batch_id,
          trade_id,
          CASE trade_type
              WHEN 'BATCH_BALANCING_TRADE' THEN 'BATCH_BALANCE_TRADE'
              ELSE trade_type
          END,
          member_role
      FROM batch_members
      ORDER BY batch_id, trade_id;

      CREATE TABLE batch_position_outputs_batch_semantics
      (
          batch_id    INTEGER PRIMARY KEY,
          trade_id    INTEGER NOT NULL,
          trade_type  TEXT    NOT NULL,

          CONSTRAINT fk_batch_position_outputs_batch
              FOREIGN KEY (batch_id)
                  REFERENCES batches_batch_semantics (batch_id)
                  ON UPDATE RESTRICT
                  ON DELETE RESTRICT,
          CONSTRAINT fk_batch_position_outputs_trade
              FOREIGN KEY (trade_id, trade_type)
                  REFERENCES trade_exposures_batch_semantics (trade_id, trade_type)
                  ON UPDATE RESTRICT
                  ON DELETE RESTRICT,
          CONSTRAINT uq_batch_position_outputs_trade
              UNIQUE (trade_id),
          CONSTRAINT chk_batch_position_outputs_trade_type
              CHECK (trade_type = 'BATCH_POSITION_OUT')
      );

      INSERT INTO batch_position_outputs_batch_semantics
      SELECT batch_id, trade_id, trade_type
      FROM batch_position_outputs
      ORDER BY batch_id, trade_id;

      DROP TABLE batch_position_outputs;
      DROP TABLE batch_members;
      DROP TABLE batches;
      DROP TABLE trade_exposures;

      ALTER TABLE trade_exposures_batch_semantics
          RENAME TO trade_exposures;
      ALTER TABLE batches_batch_semantics
          RENAME TO batches;
      ALTER TABLE batch_members_batch_semantics
          RENAME TO batch_members;
      ALTER TABLE batch_position_outputs_batch_semantics
          RENAME TO batch_position_outputs;
    `);

    const migratedCounts = {
      exposure: Number(
        sqlite.prepare("SELECT COUNT(*) AS count FROM trade_exposures").get().count
      ),
      batches: Number(
        sqlite.prepare("SELECT COUNT(*) AS count FROM batches").get().count
      ),
      members: Number(
        sqlite.prepare("SELECT COUNT(*) AS count FROM batch_members").get().count
      ),
      outputs: Number(
        sqlite.prepare("SELECT COUNT(*) AS count FROM batch_position_outputs").get().count
      )
    };

    if (migratedCounts.exposure !== exposureCount
      || migratedCounts.batches !== batchCount
      || migratedCounts.members !== memberCount
      || migratedCounts.outputs !== outputCount) {
      throw new Error("Batch trade-semantics migration did not preserve every row.");
    }

    const foreignKeyViolations = sqlite.prepare("PRAGMA foreign_key_check").all();

    if (foreignKeyViolations.length > 0) {
      throw new Error("Batch trade-semantics migration produced foreign key violations.");
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

function migrateBatchRollbackSemantics(sqlite) {
  const batchColumns = [...tableColumnNames(sqlite, "batches")];
  const batchSql = sqlite.prepare(`
    SELECT sql
    FROM sqlite_master
    WHERE type = 'table' AND name = 'batches'
  `).get()?.sql || "";
  const membersSql = sqlite.prepare(`
    SELECT sql
    FROM sqlite_master
    WHERE type = 'table' AND name = 'batch_members'
  `).get()?.sql || "";
  const alreadyMigrated = batchColumns.includes("rolled_back_at")
    && batchSql.includes("'ROLLED_BACK'")
    && !/\bUNIQUE\s*\(\s*trade_id\s*\)/i.test(membersSql);

  if (alreadyMigrated) {
    return;
  }

  const invalidBatch = sqlite.prepare(`
    SELECT batch_id, batch_status
    FROM batches
    WHERE batch_status NOT IN ('BUILDING', 'FORMED')
    LIMIT 1
  `).get();

  if (invalidBatch) {
    throw new Error(
      `Batch ${invalidBatch.batch_id} has unsupported status ${invalidBatch.batch_status}.`
    );
  }

  const originalCounts = {
    batches: Number(sqlite.prepare("SELECT COUNT(*) AS count FROM batches").get().count),
    members: Number(sqlite.prepare("SELECT COUNT(*) AS count FROM batch_members").get().count),
    outputs: Number(sqlite.prepare("SELECT COUNT(*) AS count FROM batch_position_outputs").get().count)
  };

  sqlite.exec("PRAGMA foreign_keys = OFF");

  try {
    sqlite.exec("BEGIN IMMEDIATE");
    sqlite.exec(`
      CREATE TABLE batches_rollback_semantics
      (
          batch_id        INTEGER PRIMARY KEY AUTOINCREMENT,
          idempotency_key TEXT    NOT NULL,
          ccy_pair_code   TEXT    NOT NULL,
          batch_status    TEXT    NOT NULL DEFAULT 'BUILDING',
          created_at      TEXT    NOT NULL
              DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
          rolled_back_at  TEXT,

          CONSTRAINT fk_batches_ccy_pair
              FOREIGN KEY (ccy_pair_code)
                  REFERENCES ccy_pair_options (ccy_pair_code)
                  ON UPDATE RESTRICT
                  ON DELETE RESTRICT,
          CONSTRAINT uq_batches_idempotency_key
              UNIQUE (idempotency_key),
          CONSTRAINT chk_batches_id
              CHECK (batch_id > 0),
          CONSTRAINT chk_batches_idempotency_key
              CHECK (
                  length(idempotency_key) BETWEEN 1 AND 100
                  AND idempotency_key = trim(idempotency_key)
              ),
          CONSTRAINT chk_batches_status
              CHECK (batch_status IN ('BUILDING', 'FORMED', 'ROLLED_BACK')),
          CONSTRAINT chk_batches_created_at
              CHECK (
                  length(created_at) = 24
                  AND created_at GLOB '????-??-??T??:??:??.???Z'
                  AND strftime('%Y-%m-%dT%H:%M:%fZ', created_at) = created_at
              ),
          CONSTRAINT chk_batches_rolled_back_at
              CHECK (
                  (
                      batch_status IN ('BUILDING', 'FORMED')
                      AND rolled_back_at IS NULL
                  )
                  OR (
                      batch_status = 'ROLLED_BACK'
                      AND length(rolled_back_at) = 24
                      AND rolled_back_at GLOB '????-??-??T??:??:??.???Z'
                      AND strftime('%Y-%m-%dT%H:%M:%fZ', rolled_back_at) = rolled_back_at
                  )
              )
      );

      INSERT INTO batches_rollback_semantics
        (batch_id, idempotency_key, ccy_pair_code, batch_status, created_at)
      SELECT batch_id, idempotency_key, ccy_pair_code, batch_status, created_at
      FROM batches
      ORDER BY batch_id;

      CREATE TABLE batch_members_rollback_semantics
      (
          batch_id    INTEGER NOT NULL,
          trade_id    INTEGER NOT NULL,
          trade_type  TEXT    NOT NULL,
          member_role TEXT    NOT NULL,

          CONSTRAINT pk_batch_members
              PRIMARY KEY (batch_id, trade_id),
          CONSTRAINT fk_batch_members_batch
              FOREIGN KEY (batch_id)
                  REFERENCES batches_rollback_semantics (batch_id)
                  ON UPDATE RESTRICT
                  ON DELETE RESTRICT,
          CONSTRAINT fk_batch_members_trade
              FOREIGN KEY (trade_id, trade_type)
                  REFERENCES trade_exposures (trade_id, trade_type)
                  ON UPDATE RESTRICT
                  ON DELETE RESTRICT,
          CONSTRAINT chk_batch_members_role
              CHECK (member_role IN ('TRADE', 'BALANCE_TRADE', 'BALANCE_QUOTE_CASH')),
          CONSTRAINT chk_batch_members_role_trade_type
              CHECK (
                  (member_role = 'TRADE'
                      AND trade_type IN
                      (
                          'CLIENT_DEAL',
                          'HEDGE_DEAL',
                          'BATCH_POSITION_OUT'
                      ))
                  OR (member_role = 'BALANCE_TRADE'
                      AND trade_type = 'BATCH_BALANCE_TRADE')
                  OR (member_role = 'BALANCE_QUOTE_CASH'
                      AND trade_type = 'BATCH_BALANCE_QUOTE_CASH')
              )
      );

      INSERT INTO batch_members_rollback_semantics
      SELECT batch_id, trade_id, trade_type, member_role
      FROM batch_members
      ORDER BY batch_id, trade_id;

      CREATE TABLE batch_position_outputs_rollback_semantics
      (
          batch_id    INTEGER PRIMARY KEY,
          trade_id    INTEGER NOT NULL,
          trade_type  TEXT    NOT NULL,

          CONSTRAINT fk_batch_position_outputs_batch
              FOREIGN KEY (batch_id)
                  REFERENCES batches_rollback_semantics (batch_id)
                  ON UPDATE RESTRICT
                  ON DELETE RESTRICT,
          CONSTRAINT fk_batch_position_outputs_trade
              FOREIGN KEY (trade_id, trade_type)
                  REFERENCES trade_exposures (trade_id, trade_type)
                  ON UPDATE RESTRICT
                  ON DELETE RESTRICT,
          CONSTRAINT uq_batch_position_outputs_trade
              UNIQUE (trade_id),
          CONSTRAINT chk_batch_position_outputs_trade_type
              CHECK (trade_type = 'BATCH_POSITION_OUT')
      );

      INSERT INTO batch_position_outputs_rollback_semantics
      SELECT batch_id, trade_id, trade_type
      FROM batch_position_outputs
      ORDER BY batch_id, trade_id;

      DROP TABLE batch_position_outputs;
      DROP TABLE batch_members;
      DROP TABLE batches;

      ALTER TABLE batches_rollback_semantics
          RENAME TO batches;
      ALTER TABLE batch_members_rollback_semantics
          RENAME TO batch_members;
      ALTER TABLE batch_position_outputs_rollback_semantics
          RENAME TO batch_position_outputs;
    `);

    const migratedCounts = {
      batches: Number(sqlite.prepare("SELECT COUNT(*) AS count FROM batches").get().count),
      members: Number(sqlite.prepare("SELECT COUNT(*) AS count FROM batch_members").get().count),
      outputs: Number(sqlite.prepare("SELECT COUNT(*) AS count FROM batch_position_outputs").get().count)
    };

    if (migratedCounts.batches !== originalCounts.batches
      || migratedCounts.members !== originalCounts.members
      || migratedCounts.outputs !== originalCounts.outputs) {
      throw new Error("Batch rollback migration did not preserve every row.");
    }

    const foreignKeyViolations = sqlite.prepare("PRAGMA foreign_key_check").all();

    if (foreignKeyViolations.length > 0) {
      throw new Error("Batch rollback migration produced foreign key violations.");
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

function migrateBatchMemberRoleSemantics(sqlite) {
  const membersSql = sqlite.prepare(`
    SELECT sql
    FROM sqlite_master
    WHERE type = 'table' AND name = 'batch_members'
  `).get()?.sql || "";
  const normalizedMembersSql = membersSql.replace(/\s+/g, " ");

  if (
    /\bCHECK\s*\(\s*member_role\s+IN\s*\(\s*'TRADE'\s*,\s*'BALANCE_TRADE'\s*,\s*'POSITION_OUT'\s*\)\s*\)/i
      .test(normalizedMembersSql)
    && normalizedMembersSql.includes("trade_type = 'BATCH_BALANCE_TRADE'")
    && normalizedMembersSql.includes("trade_type = 'BATCH_POSITION_OUT'")
  ) {
    return;
  }

  if (/\bCHECK\s*\(\s*member_role\s*=\s*'TRADE'\s*\)/i.test(normalizedMembersSql)) {
    return;
  }

  if (
    /\bCHECK\s*\(\s*member_role\s+IN\s*\(\s*'TRADE'\s*,\s*'BALANCE_TRADE'\s*\)\s*\)/i
      .test(normalizedMembersSql)
    && !normalizedMembersSql.includes("BALANCE_QUOTE_CASH")
  ) {
    return;
  }

  const unsupportedCashMember = sqlite.prepare(`
    SELECT batch_id, trade_id
    FROM batch_members
    WHERE member_role = 'BALANCE_QUOTE_CASH'
    LIMIT 1
  `).get();

  if (unsupportedCashMember) {
    throw new Error(
      `Legacy Batch ${unsupportedCashMember.batch_id} stores Quote cash as `
        + `Trade ${unsupportedCashMember.trade_id}; automatic migration is unsafe.`
    );
  }

  const originalCount = Number(
    sqlite.prepare("SELECT COUNT(*) AS count FROM batch_members").get().count
  );

  sqlite.exec("PRAGMA foreign_keys = OFF");

  try {
    sqlite.exec("BEGIN IMMEDIATE");
    sqlite.exec(`
      CREATE TABLE batch_members_role_semantics
      (
          batch_id    INTEGER NOT NULL,
          trade_id    INTEGER NOT NULL,
          trade_type  TEXT    NOT NULL,
          member_role TEXT    NOT NULL,

          CONSTRAINT pk_batch_members
              PRIMARY KEY (batch_id, trade_id),
          CONSTRAINT fk_batch_members_batch
              FOREIGN KEY (batch_id)
                  REFERENCES batches (batch_id)
                  ON UPDATE RESTRICT
                  ON DELETE RESTRICT,
          CONSTRAINT fk_batch_members_trade
              FOREIGN KEY (trade_id, trade_type)
                  REFERENCES trade_exposures (trade_id, trade_type)
                  ON UPDATE RESTRICT
                  ON DELETE RESTRICT,
          CONSTRAINT chk_batch_members_role
              CHECK (member_role IN ('TRADE', 'BALANCE_TRADE')),
          CONSTRAINT chk_batch_members_role_trade_type
              CHECK (
                  member_role = 'TRADE'
                  OR (member_role = 'BALANCE_TRADE'
                      AND trade_type = 'BATCH_BALANCE_TRADE')
              )
      );

      INSERT INTO batch_members_role_semantics
        (batch_id, trade_id, trade_type, member_role)
      SELECT batch_id, trade_id, trade_type, member_role
      FROM batch_members
      ORDER BY batch_id, trade_id;

      DROP TABLE batch_members;

      ALTER TABLE batch_members_role_semantics
          RENAME TO batch_members;
    `);

    const migratedCount = Number(
      sqlite.prepare("SELECT COUNT(*) AS count FROM batch_members").get().count
    );

    if (migratedCount !== originalCount) {
      throw new Error(
        "Batch member-role migration did not preserve every row."
      );
    }

    const foreignKeyViolations = sqlite.prepare("PRAGMA foreign_key_check").all();

    if (foreignKeyViolations.length > 0) {
      throw new Error(
        "Batch member-role migration produced foreign key violations."
      );
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

function migrateBatchQuoteCashOutput(sqlite) {
  const targetTableExists = Boolean(sqlite.prepare(`
    SELECT 1 AS present
    FROM sqlite_master
    WHERE type = 'table' AND name = 'batch_quote_cash_outputs'
  `).get());

  if (!targetTableExists) {
    throw new Error("Batch Quote cash output table was not initialized.");
  }

  sqlite.exec("BEGIN IMMEDIATE");

  try {
    sqlite.exec(`
    INSERT INTO batch_quote_cash_outputs
      (
        batch_id,
        quote_ccy_code,
        quote_balance_contribution_minor,
        quote_ccy_fraction_digits,
        quote_ccy_value_date,
        created_at
      )
    SELECT
      batch.batch_id,
      pair.quote_ccy_code,
      -SUM(
        CASE exposure.base_ccy_side
          WHEN 'BUY' THEN exposure.quote_ccy_amount_minor
          ELSE -exposure.quote_ccy_amount_minor
        END
      ),
      MIN(exposure.quote_ccy_fraction_digits),
      MIN(exposure.quote_ccy_value_date),
      batch.created_at
    FROM batches batch
    INNER JOIN ccy_pair_options pair
      ON pair.ccy_pair_code = batch.ccy_pair_code
    INNER JOIN batch_members member ON member.batch_id = batch.batch_id
    INNER JOIN trade_exposures exposure
      ON exposure.trade_id = member.trade_id
      AND exposure.trade_type = member.trade_type
    LEFT JOIN batch_quote_cash_outputs cash
      ON cash.batch_id = batch.batch_id
    WHERE batch.batch_status IN ('FORMED', 'ROLLED_BACK')
      AND member.member_role IN ('TRADE', 'BALANCE_TRADE')
      AND cash.batch_id IS NULL
    GROUP BY batch.batch_id, pair.quote_ccy_code, batch.created_at
    HAVING COUNT(DISTINCT exposure.quote_ccy_fraction_digits) = 1
      AND COUNT(DISTINCT exposure.quote_ccy_value_date) = 1;
  `);

    const missingCashOutput = sqlite.prepare(`
    SELECT batch.batch_id AS batchId
    FROM batches batch
    LEFT JOIN batch_quote_cash_outputs cash
      ON cash.batch_id = batch.batch_id
    WHERE batch.batch_status IN ('FORMED', 'ROLLED_BACK')
      AND cash.batch_id IS NULL
    LIMIT 1
  `).get();

    if (missingCashOutput) {
      throw new Error(
        `Completed Batch ${missingCashOutput.batchId} cannot be migrated to `
          + "the Quote cash output model."
      );
    }

    const invalidCashOutput = sqlite.prepare(`
      SELECT batch.batch_id AS batchId
      FROM batches batch
      INNER JOIN ccy_pair_options pair
        ON pair.ccy_pair_code = batch.ccy_pair_code
      INNER JOIN batch_quote_cash_outputs cash
        ON cash.batch_id = batch.batch_id
      WHERE cash.quote_ccy_code <> pair.quote_ccy_code
        OR EXISTS
        (
          SELECT 1
          FROM batch_members member
          INNER JOIN trade_exposures exposure
            ON exposure.trade_id = member.trade_id
            AND exposure.trade_type = member.trade_type
          WHERE member.batch_id = batch.batch_id
            AND member.member_role IN ('TRADE', 'BALANCE_TRADE')
            AND (
              exposure.quote_ccy_fraction_digits
                <> cash.quote_ccy_fraction_digits
              OR exposure.quote_ccy_value_date <> cash.quote_ccy_value_date
            )
        )
        OR (
          batch.batch_status IN ('FORMED', 'ROLLED_BACK')
          AND (
            SELECT COALESCE(SUM(
              CASE exposure.base_ccy_side
                WHEN 'BUY' THEN exposure.quote_ccy_amount_minor
                ELSE -exposure.quote_ccy_amount_minor
              END
            ), 0)
            FROM batch_members member
            INNER JOIN trade_exposures exposure
              ON exposure.trade_id = member.trade_id
              AND exposure.trade_type = member.trade_type
            WHERE member.batch_id = batch.batch_id
              AND member.member_role IN ('TRADE', 'BALANCE_TRADE')
          ) + cash.quote_balance_contribution_minor <> 0
        )
      LIMIT 1
    `).get();

    if (invalidCashOutput) {
      throw new Error(
        `Batch ${invalidCashOutput.batchId} has an invalid Quote cash output.`
      );
    }

    sqlite.exec("COMMIT");
  } catch (error) {
    try {
      sqlite.exec("ROLLBACK");
    } catch {}

    throw error;
  }
}

function migrateBatchTradeMembershipSemantics(sqlite) {
  for (const tableName of [
    "batch_members",
    "batch_balance_trades",
    "batch_position_outputs"
  ]) {
    if (!sqliteTableExists(sqlite, tableName)) {
      throw new Error(`Batch table ${tableName} was not initialized.`);
    }
  }

  const membersSql = sqlite.prepare(`
    SELECT sql
    FROM sqlite_master
    WHERE type = 'table' AND name = 'batch_members'
  `).get()?.sql || "";
  const normalizedMembersSql = membersSql.replace(/\s+/g, " ");
  const balanceTradeColumns = [...tableColumnNames(
    sqlite,
    "batch_balance_trades"
  )];
  const positionOutputColumns = [...tableColumnNames(
    sqlite,
    "batch_position_outputs"
  )];
  const canonicalMembers =
    /\bCHECK\s*\(\s*member_role\s+IN\s*\(\s*'TRADE'\s*,\s*'BALANCE_TRADE'\s*,\s*'POSITION_OUT'\s*\)\s*\)/i
      .test(normalizedMembersSql)
    && normalizedMembersSql.includes("trade_type = 'BATCH_BALANCE_TRADE'")
    && normalizedMembersSql.includes("trade_type = 'BATCH_POSITION_OUT'");
  const canonicalSubtypes =
    balanceTradeColumns.join(",") === "trade_id,trade_type"
    && positionOutputColumns.join(",") === "trade_id,trade_type";

  if (canonicalMembers && canonicalSubtypes) {
    const invalidTechnicalTrade = sqlite.prepare(`
      SELECT member.batch_id AS batchId, member.trade_id AS tradeId
      FROM batch_members member
      WHERE (
          member.member_role = 'BALANCE_TRADE'
          AND NOT EXISTS
          (
            SELECT 1
            FROM batch_balance_trades balance_trade
            WHERE balance_trade.trade_id = member.trade_id
              AND balance_trade.trade_type = member.trade_type
          )
        )
        OR (
          member.member_role = 'POSITION_OUT'
          AND NOT EXISTS
          (
            SELECT 1
            FROM batch_position_outputs output
            WHERE output.trade_id = member.trade_id
              AND output.trade_type = member.trade_type
          )
        )
      LIMIT 1
    `).get();

    if (invalidTechnicalTrade) {
      throw new Error(
        `Batch ${invalidTechnicalTrade.batchId} technical Trade `
          + `${invalidTechnicalTrade.tradeId} has no subtype record.`
      );
    }

    const technicalTradeWithoutOrigin = sqlite.prepare(`
      SELECT exposure.trade_id AS tradeId, exposure.trade_type AS tradeType
      FROM trade_exposures exposure
      WHERE exposure.trade_type IN ('BATCH_BALANCE_TRADE', 'BATCH_POSITION_OUT')
        AND NOT EXISTS
        (
          SELECT 1
          FROM batch_members member
          WHERE member.trade_id = exposure.trade_id
            AND member.trade_type = exposure.trade_type
            AND member.member_role = CASE exposure.trade_type
              WHEN 'BATCH_BALANCE_TRADE' THEN 'BALANCE_TRADE'
              ELSE 'POSITION_OUT'
            END
        )
      LIMIT 1
    `).get();

    if (technicalTradeWithoutOrigin) {
      throw new Error(
        `technical Trade ${technicalTradeWithoutOrigin.tradeId} `
          + `(${technicalTradeWithoutOrigin.tradeType}) has no origin Batch membership.`
      );
    }

    return;
  }

  const unsupportedMember = sqlite.prepare(`
    SELECT batch_id AS batchId, trade_id AS tradeId, member_role AS memberRole
    FROM batch_members
    WHERE member_role NOT IN ('TRADE', 'BALANCE_TRADE', 'POSITION_OUT')
    LIMIT 1
  `).get();

  if (unsupportedMember) {
    throw new Error(
      `Batch ${unsupportedMember.batchId} Trade ${unsupportedMember.tradeId} `
        + `has unsupported member role ${unsupportedMember.memberRole}.`
    );
  }

  const balanceTradeHasBatchId = balanceTradeColumns.includes("batch_id");
  const positionOutputHasBatchId = positionOutputColumns.includes("batch_id");

  sqlite.exec("PRAGMA foreign_keys = OFF");

  try {
    sqlite.exec("BEGIN IMMEDIATE");
    sqlite.exec(`
      CREATE TABLE batch_members_complete_semantics
      (
          batch_id    INTEGER NOT NULL,
          trade_id    INTEGER NOT NULL,
          trade_type  TEXT    NOT NULL,
          member_role TEXT    NOT NULL,

          CONSTRAINT pk_batch_members
              PRIMARY KEY (batch_id, trade_id),
          CONSTRAINT fk_batch_members_batch
              FOREIGN KEY (batch_id)
                  REFERENCES batches (batch_id)
                  ON UPDATE RESTRICT
                  ON DELETE RESTRICT,
          CONSTRAINT fk_batch_members_trade
              FOREIGN KEY (trade_id, trade_type)
                  REFERENCES trade_exposures (trade_id, trade_type)
                  ON UPDATE RESTRICT
                  ON DELETE RESTRICT,
          CONSTRAINT chk_batch_members_role
              CHECK (member_role IN ('TRADE', 'BALANCE_TRADE', 'POSITION_OUT')),
          CONSTRAINT chk_batch_members_role_trade_type
              CHECK (
                  member_role = 'TRADE'
                  OR (
                      member_role = 'BALANCE_TRADE'
                      AND trade_type = 'BATCH_BALANCE_TRADE'
                  )
                  OR (
                      member_role = 'POSITION_OUT'
                      AND trade_type = 'BATCH_POSITION_OUT'
                  )
              )
      );

      INSERT INTO batch_members_complete_semantics
        (batch_id, trade_id, trade_type, member_role)
      SELECT batch_id, trade_id, trade_type, member_role
      FROM batch_members
      ORDER BY batch_id, trade_id;

      CREATE TABLE batch_balance_trades_subtype
      (
          trade_id   INTEGER PRIMARY KEY,
          trade_type TEXT NOT NULL DEFAULT 'BATCH_BALANCE_TRADE',

          CONSTRAINT fk_batch_balance_trades_trade
              FOREIGN KEY (trade_id, trade_type)
                  REFERENCES trade_exposures (trade_id, trade_type)
                  ON UPDATE RESTRICT
                  ON DELETE RESTRICT,
          CONSTRAINT chk_batch_balance_trades_trade_type
              CHECK (trade_type = 'BATCH_BALANCE_TRADE')
      );

      INSERT INTO batch_balance_trades_subtype (trade_id, trade_type)
      SELECT trade_id, trade_type
      FROM trade_exposures
      WHERE trade_type = 'BATCH_BALANCE_TRADE'
      ORDER BY trade_id;

      CREATE TABLE batch_position_outputs_subtype
      (
          trade_id   INTEGER PRIMARY KEY,
          trade_type TEXT NOT NULL DEFAULT 'BATCH_POSITION_OUT',

          CONSTRAINT fk_batch_position_outputs_trade
              FOREIGN KEY (trade_id, trade_type)
                  REFERENCES trade_exposures (trade_id, trade_type)
                  ON UPDATE RESTRICT
                  ON DELETE RESTRICT,
          CONSTRAINT chk_batch_position_outputs_trade_type
              CHECK (trade_type = 'BATCH_POSITION_OUT')
      );

      INSERT INTO batch_position_outputs_subtype (trade_id, trade_type)
      SELECT trade_id, trade_type
      FROM trade_exposures
      WHERE trade_type = 'BATCH_POSITION_OUT'
      ORDER BY trade_id;
    `);

    if (balanceTradeHasBatchId) {
      sqlite.exec(`
        INSERT OR IGNORE INTO batch_members_complete_semantics
          (batch_id, trade_id, trade_type, member_role)
        SELECT batch_id, trade_id, trade_type, 'BALANCE_TRADE'
        FROM batch_balance_trades
        ORDER BY batch_id, trade_id;
      `);

      const missingBalanceOrigin = sqlite.prepare(`
        SELECT balance_trade.batch_id AS batchId, balance_trade.trade_id AS tradeId
        FROM batch_balance_trades balance_trade
        LEFT JOIN batch_members_complete_semantics member
          ON member.batch_id = balance_trade.batch_id
          AND member.trade_id = balance_trade.trade_id
          AND member.trade_type = balance_trade.trade_type
          AND member.member_role = 'BALANCE_TRADE'
        WHERE member.batch_id IS NULL
        LIMIT 1
      `).get();

      if (missingBalanceOrigin) {
        throw new Error(
          `Batch ${missingBalanceOrigin.batchId} Balance Trade `
            + `${missingBalanceOrigin.tradeId} conflicts with its membership.`
        );
      }
    }

    if (positionOutputHasBatchId) {
      sqlite.exec(`
        INSERT OR IGNORE INTO batch_members_complete_semantics
          (batch_id, trade_id, trade_type, member_role)
        SELECT batch_id, trade_id, trade_type, 'POSITION_OUT'
        FROM batch_position_outputs
        ORDER BY batch_id, trade_id;
      `);

      const missingPositionOutputOrigin = sqlite.prepare(`
        SELECT output.batch_id AS batchId, output.trade_id AS tradeId
        FROM batch_position_outputs output
        LEFT JOIN batch_members_complete_semantics member
          ON member.batch_id = output.batch_id
          AND member.trade_id = output.trade_id
          AND member.trade_type = output.trade_type
          AND member.member_role = 'POSITION_OUT'
        WHERE member.batch_id IS NULL
        LIMIT 1
      `).get();

      if (missingPositionOutputOrigin) {
        throw new Error(
          `Batch ${missingPositionOutputOrigin.batchId} Position Out `
            + `${missingPositionOutputOrigin.tradeId} conflicts with its membership.`
        );
      }
    }

    sqlite.exec(`
      DROP TABLE batch_balance_trades;
      DROP TABLE batch_position_outputs;
      DROP TABLE batch_members;

      ALTER TABLE batch_members_complete_semantics
        RENAME TO batch_members;
      ALTER TABLE batch_balance_trades_subtype
        RENAME TO batch_balance_trades;
      ALTER TABLE batch_position_outputs_subtype
        RENAME TO batch_position_outputs;
    `);

    const incompleteTechnicalTrade = sqlite.prepare(`
      SELECT exposure.trade_id AS tradeId, exposure.trade_type AS tradeType
      FROM trade_exposures exposure
      WHERE exposure.trade_type IN ('BATCH_BALANCE_TRADE', 'BATCH_POSITION_OUT')
        AND NOT EXISTS
        (
          SELECT 1
          FROM batch_members member
          WHERE member.trade_id = exposure.trade_id
            AND member.trade_type = exposure.trade_type
            AND member.member_role = CASE exposure.trade_type
              WHEN 'BATCH_BALANCE_TRADE' THEN 'BALANCE_TRADE'
              ELSE 'POSITION_OUT'
            END
        )
      LIMIT 1
    `).get();

    if (incompleteTechnicalTrade) {
      throw new Error(
        `technical Trade ${incompleteTechnicalTrade.tradeId} `
          + `(${incompleteTechnicalTrade.tradeType}) has no origin Batch membership.`
      );
    }

    const foreignKeyViolations = sqlite.prepare("PRAGMA foreign_key_check").all();

    if (foreignKeyViolations.length > 0) {
      throw new Error(
        "Batch full-membership migration produced foreign key violations."
      );
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

function assertBatchMembershipConsistency(sqlite) {
  const conflict = sqlite.prepare(`
    SELECT
      member.trade_id AS tradeId,
      member.trade_type AS tradeType,
      GROUP_CONCAT(member.batch_id, ',') AS batchIds
    FROM batch_members member
    INNER JOIN batches batch ON batch.batch_id = member.batch_id
    WHERE member.member_role = 'TRADE'
      AND batch.batch_status IN
      (${BATCH_MEMBERSHIP_BLOCKING_STATUS_PLACEHOLDERS})
    GROUP BY member.trade_id, member.trade_type
    HAVING COUNT(*) > 1
    LIMIT 1
  `).get(...BATCH_MEMBERSHIP_BLOCKING_STATUSES);

  if (conflict) {
    throw new Error(
      `Trade ${conflict.tradeId} (${conflict.tradeType}) belongs to multiple `
        + `active batches: ${conflict.batchIds}.`
    );
  }
}

function dropTradeExposureDealtCurrencyTriggers(sqlite) {
  sqlite.exec(`
    DROP TRIGGER IF EXISTS trg_trade_exposures_require_dealt_ccy_insert;
    DROP TRIGGER IF EXISTS trg_trade_exposures_require_dealt_ccy_update;
    DROP TRIGGER IF EXISTS trg_ccy_pair_options_preserve_exposure_dealt_ccy;
  `);
}

function ensureTradeExposureDealtCurrencyTriggers(sqlite) {
  dropTradeExposureDealtCurrencyTriggers(sqlite);

  sqlite.exec(`
    CREATE TRIGGER trg_trade_exposures_require_dealt_ccy_insert
    BEFORE INSERT ON trade_exposures
    FOR EACH ROW
    WHEN NOT EXISTS
    (
      SELECT 1
      FROM ccy_pair_options p
      WHERE p.ccy_pair_code = NEW.ccy_pair_code
        AND NEW.dealt_ccy_code IN (p.base_ccy_code, p.quote_ccy_code)
    )
    BEGIN
      SELECT RAISE(ABORT, 'trade_exposures.dealt_ccy_code must belong to its Ccy Pair');
    END;

    CREATE TRIGGER trg_trade_exposures_require_dealt_ccy_update
    BEFORE UPDATE OF ccy_pair_code, dealt_ccy_code ON trade_exposures
    FOR EACH ROW
    WHEN NOT EXISTS
    (
      SELECT 1
      FROM ccy_pair_options p
      WHERE p.ccy_pair_code = NEW.ccy_pair_code
        AND NEW.dealt_ccy_code IN (p.base_ccy_code, p.quote_ccy_code)
    )
    BEGIN
      SELECT RAISE(ABORT, 'trade_exposures.dealt_ccy_code must belong to its Ccy Pair');
    END;

    CREATE TRIGGER trg_ccy_pair_options_preserve_exposure_dealt_ccy
    BEFORE UPDATE OF base_ccy_code, quote_ccy_code ON ccy_pair_options
    FOR EACH ROW
    WHEN EXISTS
    (
      SELECT 1
      FROM trade_exposures e
      WHERE e.ccy_pair_code = OLD.ccy_pair_code
        AND e.dealt_ccy_code NOT IN (NEW.base_ccy_code, NEW.quote_ccy_code)
    )
    BEGIN
      SELECT RAISE(ABORT, 'a Ccy Pair used by trade_exposures must preserve its dealt currency');
    END;
  `);
}

function migrateTradeMarketSnapshot(sqlite) {
  const targetTable = "trade_market_snapshots";
  const legacyTable = "trade_audit";
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

function migrateTradingCounterpartyTradeContexts(sqlite) {
  const tableName = "trading_counterparty_trade_contexts";
  const migratedTableName = "trading_counterparty_trade_contexts_migrated";
  const tableInfo = sqlite.prepare(`PRAGMA table_info(${tableName})`).all();
  const foreignKeys = sqlite.prepare(`PRAGMA foreign_key_list(${tableName})`).all();
  const columns = tableInfo.map(column => column.name);
  const hasCounterpartyForeignKey = foreignKeys.some(key =>
    key.from === "counterparty_id"
      && key.table === "trading_counterparties"
      && key.to === "counterparty_id"
      && key.on_update === "RESTRICT"
      && key.on_delete === "CASCADE"
  );
  const hasTradeContextForeignKey = foreignKeys.some(key =>
    key.from === "trade_context_id"
      && key.table === "trade_contexts"
      && key.to === "trade_context_id"
      && key.on_update === "RESTRICT"
      && key.on_delete === "RESTRICT"
  );
  const schemaIsCurrent = columns.join(",") === "counterparty_id,trade_context_id"
    && String(tableInfo[0]?.type || "").toUpperCase() === "INTEGER"
    && tableInfo[0]?.notnull === 1
    && tableInfo[0]?.pk === 1
    && String(tableInfo[1]?.type || "").toUpperCase() === "INTEGER"
    && tableInfo[1]?.notnull === 1
    && tableInfo[1]?.pk === 2
    && hasCounterpartyForeignKey
    && hasTradeContextForeignKey;

  runInImmediateTransaction(sqlite, () => {
    sqlite.exec("DROP TABLE IF EXISTS trading_party_trade_contexts");

    if (!schemaIsCurrent) {
      // Триггеры Pricing Rule ссылаются на эту таблицу по имени. Удаляем их только
      // на время перестройки legacy-таблицы; следующий проход schema.sql восстановит их.
      sqlite.exec(`
        DROP TRIGGER IF EXISTS trg_pricing_rules_require_attached_trade_context_insert;
        DROP TRIGGER IF EXISTS trg_pricing_rules_require_attached_trade_context_update;
      `);

      const sourceCounterpartyColumn = columns.includes("counterparty_id")
        ? "counterparty_id"
        : columns.includes("party_id")
          ? "party_id"
          : null;
      const canPreserveRows = sourceCounterpartyColumn && columns.includes("trade_context_id");

      sqlite.exec(`
        DROP TABLE IF EXISTS ${migratedTableName};

        CREATE TABLE ${migratedTableName}
        (
            counterparty_id      INTEGER NOT NULL,
            trade_context_id INTEGER NOT NULL,

            CONSTRAINT pk_trading_counterparty_trade_contexts
                PRIMARY KEY (counterparty_id, trade_context_id),
            CONSTRAINT fk_trading_counterparty_trade_contexts_counterparty
                FOREIGN KEY (counterparty_id)
                    REFERENCES trading_counterparties (counterparty_id)
                    ON UPDATE RESTRICT
                    ON DELETE CASCADE,
            CONSTRAINT fk_trading_counterparty_trade_contexts_trade_context
                FOREIGN KEY (trade_context_id)
                    REFERENCES trade_contexts (trade_context_id)
                    ON UPDATE RESTRICT
                    ON DELETE RESTRICT
        );
      `);

      if (canPreserveRows) {
        sqlite.exec(`
          INSERT OR IGNORE INTO ${migratedTableName}
            (counterparty_id, trade_context_id)
          SELECT source.${sourceCounterpartyColumn}, source.trade_context_id
          FROM ${tableName} source
          INNER JOIN trading_counterparties counterparty
            ON counterparty.counterparty_id = source.${sourceCounterpartyColumn}
          INNER JOIN trade_contexts context
            ON context.trade_context_id = source.trade_context_id;
        `);
      }

      sqlite.exec(`
        DROP TABLE IF EXISTS ${tableName};
        ALTER TABLE ${migratedTableName} RENAME TO ${tableName};
      `);
    }

    if (sqliteTableExists(sqlite, "pricing_rules")) {
      sqlite.exec(`
        INSERT OR IGNORE INTO ${tableName}
          (counterparty_id, trade_context_id)
        SELECT DISTINCT counterparty_id, trade_context_id
        FROM pricing_rules;
      `);
    }

    sqlite.exec(`
      CREATE INDEX IF NOT EXISTS idx_trading_counterparty_trade_contexts_context
        ON ${tableName} (trade_context_id, counterparty_id);
    `);

    const foreignKeyViolations = sqlite
      .prepare(`PRAGMA foreign_key_check(${tableName})`)
      .all();

    if (foreignKeyViolations.length > 0) {
      throw new Error(
        `${tableName} contains ${foreignKeyViolations.length} invalid foreign-key reference(s).`
      );
    }
  });
}

function dropTradingCounterpartyTradeContextIntegrityTriggers(sqlite) {
  sqlite.exec(`
    DROP TRIGGER IF EXISTS trg_pricing_rules_require_attached_trade_context_insert;
    DROP TRIGGER IF EXISTS trg_pricing_rules_require_attached_trade_context_update;
    DROP TRIGGER IF EXISTS trg_trading_counterparty_trade_contexts_preserve_pricing_rules_delete;
    DROP TRIGGER IF EXISTS trg_trading_counterparty_trade_contexts_immutable_update;
  `);
}

function ensureTradingCounterpartyTradeContextIntegrityTriggers(sqlite) {
  sqlite.exec(`
    CREATE TRIGGER IF NOT EXISTS trg_pricing_rules_require_attached_trade_context_insert
    BEFORE INSERT ON pricing_rules
    FOR EACH ROW
    WHEN NOT EXISTS
    (
        SELECT 1
        FROM trading_counterparty_trade_contexts assignment
        WHERE assignment.counterparty_id = NEW.counterparty_id
          AND assignment.trade_context_id = NEW.trade_context_id
    )
    BEGIN
        SELECT RAISE(ABORT, 'Pricing Rule Trade Context must be attached to its Trading Counterparty');
    END;

    CREATE TRIGGER IF NOT EXISTS trg_pricing_rules_require_attached_trade_context_update
    BEFORE UPDATE OF counterparty_id, trade_context_id ON pricing_rules
    FOR EACH ROW
    WHEN NOT EXISTS
    (
        SELECT 1
        FROM trading_counterparty_trade_contexts assignment
        WHERE assignment.counterparty_id = NEW.counterparty_id
          AND assignment.trade_context_id = NEW.trade_context_id
    )
    BEGIN
        SELECT RAISE(ABORT, 'Pricing Rule Trade Context must be attached to its Trading Counterparty');
    END;

    CREATE TRIGGER IF NOT EXISTS trg_trading_counterparty_trade_contexts_preserve_pricing_rules_delete
    BEFORE DELETE ON trading_counterparty_trade_contexts
    FOR EACH ROW
    WHEN EXISTS
    (
        SELECT 1
        FROM pricing_rules rule
        WHERE rule.counterparty_id = OLD.counterparty_id
          AND rule.trade_context_id = OLD.trade_context_id
    )
    BEGIN
        SELECT RAISE(ABORT, 'a Trade Context assignment used by Pricing Rules cannot be detached from its Trading Counterparty');
    END;

    CREATE TRIGGER IF NOT EXISTS trg_trading_counterparty_trade_contexts_immutable_update
    BEFORE UPDATE OF counterparty_id, trade_context_id ON trading_counterparty_trade_contexts
    FOR EACH ROW
    WHEN NEW.counterparty_id <> OLD.counterparty_id
      OR NEW.trade_context_id <> OLD.trade_context_id
    BEGIN
        SELECT RAISE(ABORT, 'a Trade Context assignment identity cannot be changed; attach a new Context and detach the old one');
    END;
  `);
}

function dropClientDealTriggers(sqlite) {
  sqlite.exec(`
    DROP TRIGGER IF EXISTS trg_client_deals_require_client_insert;
    DROP TRIGGER IF EXISTS trg_client_deals_require_client_update;
    DROP TRIGGER IF EXISTS trg_trading_counterparties_preserve_client_deals;
    DROP TRIGGER IF EXISTS trg_trading_counterparty_roles_preserve_client_deals;
  `);
}

function dropHedgeDealTriggers(sqlite) {
  sqlite.exec(`
    DROP TRIGGER IF EXISTS trg_hedge_deals_require_hedge_counterparty_insert;
    DROP TRIGGER IF EXISTS trg_hedge_deals_require_hedge_counterparty_update;
    DROP TRIGGER IF EXISTS trg_trading_counterparties_preserve_hedge_deals;
    DROP TRIGGER IF EXISTS trg_trading_counterparty_roles_preserve_hedge_deals;
  `);
}

function dropClientDealGenerationSettingsTriggers(sqlite) {
  sqlite.exec(`
    DROP TRIGGER IF EXISTS trg_client_deal_generation_settings_require_client_insert;
    DROP TRIGGER IF EXISTS trg_client_deal_generation_settings_require_client_update;
    DROP TRIGGER IF EXISTS trg_pricing_rules_preserve_client_generation_settings;
    DROP TRIGGER IF EXISTS trg_trading_counterparties_preserve_client_generation_settings;
    DROP TRIGGER IF EXISTS trg_client_deal_generation_settings_require_auto_priced_client_insert;
    DROP TRIGGER IF EXISTS trg_client_deal_generation_settings_require_auto_priced_client_update;
    DROP TRIGGER IF EXISTS trg_pricing_rules_preserve_auto_priced_client_generation_settings;
    DROP TRIGGER IF EXISTS trg_trading_counterparties_preserve_auto_priced_client_generation_settings;
    DROP TRIGGER IF EXISTS trg_trading_counterparty_roles_preserve_auto_priced_client_generation_settings;
    DROP TRIGGER IF EXISTS trg_trade_contexts_preserve_auto_priced_client_generation_settings;
    DROP TRIGGER IF EXISTS trg_originating_systems_preserve_auto_priced_client_generation_settings;
  `);
}

function dropHedgeQuickModeSettingsTriggers(sqlite) {
  sqlite.exec(`
    DROP TRIGGER IF EXISTS trg_hedge_quick_mode_settings_require_auto_priced_hedge_insert;
    DROP TRIGGER IF EXISTS trg_hedge_quick_mode_settings_require_auto_priced_hedge_update;
    DROP TRIGGER IF EXISTS trg_hedge_quick_mode_settings_require_base_precision_insert;
    DROP TRIGGER IF EXISTS trg_hedge_quick_mode_settings_require_base_precision_update;
    DROP TRIGGER IF EXISTS trg_pricing_rules_preserve_hedge_quick_mode_settings;
    DROP TRIGGER IF EXISTS trg_trading_counterparties_preserve_hedge_quick_mode_settings;
    DROP TRIGGER IF EXISTS trg_trading_counterparty_roles_preserve_hedge_quick_mode_settings;
    DROP TRIGGER IF EXISTS trg_trade_contexts_preserve_hedge_quick_mode_settings;
    DROP TRIGGER IF EXISTS trg_originating_systems_preserve_hedge_quick_mode_settings;
    DROP TRIGGER IF EXISTS trg_ccy_options_preserve_hedge_quick_mode_settings_precision;
  `);
}

function ensureHedgeQuickModeSettingsDefaultTenor(sqlite) {
  if (tableColumnNames(sqlite, "hedge_quick_mode_settings").has("default_tenor")) {
    return;
  }

  sqlite.exec(`
    ALTER TABLE hedge_quick_mode_settings
    ADD COLUMN default_tenor TEXT NOT NULL DEFAULT 'TOD'
      CHECK (default_tenor IN ('TOD', 'TOM', 'SPOT'));
  `);
}

function migrateHedgeQuickModeSettingsCounterpartyReference(sqlite) {
  const targetColumns = [
    "ccy_pair_code",
    "counterparty_id",
    "pricing_rule_id",
    "base_ccy_fraction_digits",
    "small_base_ccy_amount_minor",
    "medium_base_ccy_amount_minor",
    "large_base_ccy_amount_minor",
    "xlarge_base_ccy_amount_minor",
    "is_active",
    "default_tenor"
  ];
  const legacyColumns = targetColumns.filter(column => column !== "counterparty_id");
  const columns = [...tableColumnNames(sqlite, "hedge_quick_mode_settings")];

  if (columns.join(",") === targetColumns.join(",")) {
    return;
  }

  if (columns.join(",") !== legacyColumns.join(",")) {
    throw new Error("Unsupported Hedge Quick Mode Settings counterparty-reference schema.");
  }

  const sourceRows = sqlite.prepare(`
    SELECT settings.*, rule.counterparty_id
    FROM hedge_quick_mode_settings settings
    INNER JOIN pricing_rules rule
      ON rule.pricing_rule_id = settings.pricing_rule_id
      AND rule.ccy_pair_code = settings.ccy_pair_code
    ORDER BY settings.ccy_pair_code
  `).all();
  const originalRowCount = Number(sqlite.prepare(`
    SELECT COUNT(*) AS count
    FROM hedge_quick_mode_settings
  `).get().count);

  if (sourceRows.length !== originalRowCount) {
    throw new Error(
      "Every Hedge Quick Mode Settings row must resolve its Trading Counterparty."
    );
  }

  sqlite.exec("PRAGMA foreign_keys = OFF");

  try {
    sqlite.exec("BEGIN IMMEDIATE");
    sqlite.exec(`
      CREATE TABLE hedge_quick_mode_settings_migrated
      (
          ccy_pair_code                       TEXT    PRIMARY KEY,
          counterparty_id                            INTEGER NOT NULL,
          pricing_rule_id                     INTEGER NOT NULL,
          base_ccy_fraction_digits            INTEGER NOT NULL,
          small_base_ccy_amount_minor         INTEGER NOT NULL,
          medium_base_ccy_amount_minor        INTEGER NOT NULL,
          large_base_ccy_amount_minor         INTEGER NOT NULL,
          xlarge_base_ccy_amount_minor        INTEGER NOT NULL,
          is_active                           INTEGER NOT NULL DEFAULT 1,
          default_tenor                       TEXT    NOT NULL DEFAULT 'TOD',

          CONSTRAINT fk_hedge_quick_mode_settings_pair
              FOREIGN KEY (ccy_pair_code)
                  REFERENCES ccy_pair_options (ccy_pair_code)
                  ON UPDATE RESTRICT
                  ON DELETE RESTRICT,
          CONSTRAINT fk_hedge_quick_mode_settings_counterparty
              FOREIGN KEY (counterparty_id)
                  REFERENCES trading_counterparties (counterparty_id)
                  ON UPDATE RESTRICT
                  ON DELETE RESTRICT,
          CONSTRAINT fk_hedge_quick_mode_settings_rule_counterparty_pair
              FOREIGN KEY (pricing_rule_id, counterparty_id, ccy_pair_code)
                  REFERENCES pricing_rules (pricing_rule_id, counterparty_id, ccy_pair_code)
                  ON UPDATE RESTRICT
                  ON DELETE RESTRICT,
          CONSTRAINT chk_hedge_quick_mode_settings_fraction_digits
              CHECK (
                  typeof(base_ccy_fraction_digits) = 'integer'
                  AND base_ccy_fraction_digits BETWEEN 0 AND 10
              ),
          CONSTRAINT chk_hedge_quick_mode_settings_amounts
              CHECK (
                  typeof(small_base_ccy_amount_minor) = 'integer'
                  AND small_base_ccy_amount_minor BETWEEN 1 AND 9007199254740991
                  AND typeof(medium_base_ccy_amount_minor) = 'integer'
                  AND medium_base_ccy_amount_minor BETWEEN 1 AND 9007199254740991
                  AND typeof(large_base_ccy_amount_minor) = 'integer'
                  AND large_base_ccy_amount_minor BETWEEN 1 AND 9007199254740991
                  AND typeof(xlarge_base_ccy_amount_minor) = 'integer'
                  AND xlarge_base_ccy_amount_minor BETWEEN 1 AND 9007199254740991
                  AND small_base_ccy_amount_minor < medium_base_ccy_amount_minor
                  AND medium_base_ccy_amount_minor < large_base_ccy_amount_minor
                  AND large_base_ccy_amount_minor < xlarge_base_ccy_amount_minor
              ),
          CONSTRAINT chk_hedge_quick_mode_settings_active
              CHECK (is_active IN (0, 1)),
          CONSTRAINT chk_hedge_quick_mode_settings_default_tenor
              CHECK (default_tenor IN ('TOD', 'TOM', 'SPOT'))
      );
    `);

    const insert = sqlite.prepare(`
      INSERT INTO hedge_quick_mode_settings_migrated
        (
          ccy_pair_code,
          counterparty_id,
          pricing_rule_id,
          base_ccy_fraction_digits,
          small_base_ccy_amount_minor,
          medium_base_ccy_amount_minor,
          large_base_ccy_amount_minor,
          xlarge_base_ccy_amount_minor,
          is_active,
          default_tenor
        )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const row of sourceRows) {
      insert.run(
        row.ccy_pair_code,
        row.counterparty_id,
        row.pricing_rule_id,
        row.base_ccy_fraction_digits,
        row.small_base_ccy_amount_minor,
        row.medium_base_ccy_amount_minor,
        row.large_base_ccy_amount_minor,
        row.xlarge_base_ccy_amount_minor,
        row.is_active,
        row.default_tenor
      );
    }

    sqlite.exec(`
      DROP TABLE hedge_quick_mode_settings;
      ALTER TABLE hedge_quick_mode_settings_migrated
        RENAME TO hedge_quick_mode_settings;
    `);

    const migratedRowCount = Number(sqlite.prepare(`
      SELECT COUNT(*) AS count
      FROM hedge_quick_mode_settings
    `).get().count);
    const foreignKeyViolations = sqlite.prepare("PRAGMA foreign_key_check").all();

    if (migratedRowCount !== originalRowCount) {
      throw new Error(
        "Hedge Quick Mode Settings counterparty-reference migration did not preserve every row."
      );
    }

    if (foreignKeyViolations.length > 0) {
      throw new Error(
        "Hedge Quick Mode Settings counterparty-reference migration produced foreign key violations."
      );
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

function migrateLegacyBatchOutputTables(sqlite) {
  const tableExists = tableName => Boolean(sqlite.prepare(`
    SELECT 1
    FROM sqlite_master
    WHERE type = 'table' AND name = ?
  `).get(tableName));
  const legacyPositionTableExists = tableExists("batch_outputs");
  const legacyCashMemberTableExists = tableExists("batch_quote_cash_members");
  const legacyCashOutputTableExists = tableExists("legacy_batch_quote_cash_outputs");

  if (!legacyPositionTableExists
    && !legacyCashMemberTableExists
    && !legacyCashOutputTableExists) {
    return;
  }

  let positionTargetHasBatchId = tableColumnNames(
    sqlite,
    "batch_position_outputs"
  ).has("batch_id");
  const legacyPositionOutputCount = legacyPositionTableExists
    ? Number(sqlite.prepare(`
      SELECT COUNT(*) AS count
      FROM batch_outputs
    `).get().count)
    : 0;
  const requiresPositionBridge = legacyPositionOutputCount > 0
    && !positionTargetHasBatchId;

  if (requiresPositionBridge) {
    sqlite.exec("PRAGMA foreign_keys = OFF");
  }

  try {
    sqlite.exec("BEGIN IMMEDIATE");

    if (legacyPositionTableExists) {
      const invalidPositionOutput = sqlite.prepare(`
        SELECT batch_id, trade_id, trade_type, output_role
        FROM batch_outputs
        WHERE trade_type <> 'BATCH_POSITION_OUT'
          OR output_role <> 'POSITION_OUT'
        LIMIT 1
      `).get();

      if (invalidPositionOutput) {
        throw new Error(
          `Legacy Batch ${invalidPositionOutput.batch_id} has an unsupported `
            + `position output ${invalidPositionOutput.trade_id}.`
        );
      }

      if (requiresPositionBridge) {
        sqlite.exec(`
          CREATE TABLE batch_position_outputs_legacy_semantics
          (
              batch_id   INTEGER PRIMARY KEY,
              trade_id   INTEGER NOT NULL UNIQUE,
              trade_type TEXT    NOT NULL,

              CONSTRAINT fk_batch_position_outputs_batch
                  FOREIGN KEY (batch_id)
                      REFERENCES batches (batch_id)
                      ON UPDATE RESTRICT
                      ON DELETE RESTRICT,
              CONSTRAINT fk_batch_position_outputs_trade
                  FOREIGN KEY (trade_id, trade_type)
                      REFERENCES trade_exposures (trade_id, trade_type)
                      ON UPDATE RESTRICT
                      ON DELETE RESTRICT,
              CONSTRAINT chk_batch_position_outputs_trade_type
                  CHECK (trade_type = 'BATCH_POSITION_OUT')
          );

          INSERT INTO batch_position_outputs_legacy_semantics
            (batch_id, trade_id, trade_type)
          SELECT batch_id, trade_id, trade_type
          FROM batch_outputs
          ORDER BY batch_id, trade_id;

          INSERT OR IGNORE INTO batch_position_outputs_legacy_semantics
            (batch_id, trade_id, trade_type)
          SELECT member.batch_id, target.trade_id, target.trade_type
          FROM batch_position_outputs target
          INNER JOIN batch_members member
            ON member.trade_id = target.trade_id
            AND member.trade_type = target.trade_type
            AND member.member_role = 'POSITION_OUT'
          ORDER BY member.batch_id, target.trade_id;
        `);

        const unmappedPositionSubtype = sqlite.prepare(`
          SELECT target.trade_id AS tradeId
          FROM batch_position_outputs target
          LEFT JOIN batch_position_outputs_legacy_semantics migrated
            ON migrated.trade_id = target.trade_id
            AND migrated.trade_type = target.trade_type
          WHERE migrated.trade_id IS NULL
          LIMIT 1
        `).get();

        if (unmappedPositionSubtype) {
          throw new Error(
            `Legacy Position Out ${unmappedPositionSubtype.tradeId} has no origin Batch.`
          );
        }

        sqlite.exec(`
          DROP TABLE batch_position_outputs;
          ALTER TABLE batch_position_outputs_legacy_semantics
            RENAME TO batch_position_outputs;
        `);
        positionTargetHasBatchId = true;
      }

      if (positionTargetHasBatchId) {
        sqlite.exec(`
          INSERT OR IGNORE INTO batch_position_outputs
            (batch_id, trade_id, trade_type)
          SELECT batch_id, trade_id, trade_type
          FROM batch_outputs;
        `);
      } else {
        sqlite.exec(`
          INSERT OR IGNORE INTO batch_position_outputs
            (trade_id, trade_type)
          SELECT trade_id, trade_type
          FROM batch_outputs;
        `);
      }

      const missingPositionOutput = positionTargetHasBatchId
        ? sqlite.prepare(`
          SELECT legacy.batch_id, legacy.trade_id
          FROM batch_outputs legacy
          LEFT JOIN batch_position_outputs target
            ON target.batch_id = legacy.batch_id
            AND target.trade_id = legacy.trade_id
            AND target.trade_type = legacy.trade_type
          WHERE target.batch_id IS NULL
          LIMIT 1
        `).get()
        : sqlite.prepare(`
          SELECT legacy.batch_id, legacy.trade_id
          FROM batch_outputs legacy
          LEFT JOIN batch_position_outputs target
            ON target.trade_id = legacy.trade_id
            AND target.trade_type = legacy.trade_type
          WHERE target.trade_id IS NULL
          LIMIT 1
        `).get();

      if (missingPositionOutput) {
        throw new Error(
          `Legacy Batch ${missingPositionOutput.batch_id} position output `
            + `${missingPositionOutput.trade_id} could not be migrated.`
        );
      }
    }

    if (legacyCashMemberTableExists) {
      sqlite.exec(`
        INSERT OR IGNORE INTO batch_quote_cash_outputs
          (
            batch_id,
            quote_ccy_code,
            quote_balance_contribution_minor,
            quote_ccy_fraction_digits,
            quote_ccy_value_date,
            created_at
          )
        SELECT
          batch_id,
          quote_ccy_code,
          quote_balance_contribution_minor,
          quote_ccy_fraction_digits,
          quote_ccy_value_date,
          created_at
        FROM batch_quote_cash_members;
      `);

      const missingCashOutput = sqlite.prepare(`
        SELECT legacy.batch_id
        FROM batch_quote_cash_members legacy
        LEFT JOIN batch_quote_cash_outputs target
          ON target.batch_id = legacy.batch_id
          AND target.quote_ccy_code = legacy.quote_ccy_code
          AND target.quote_balance_contribution_minor
              = legacy.quote_balance_contribution_minor
          AND target.quote_ccy_fraction_digits = legacy.quote_ccy_fraction_digits
          AND target.quote_ccy_value_date = legacy.quote_ccy_value_date
          AND target.created_at = legacy.created_at
        WHERE target.batch_id IS NULL
        LIMIT 1
      `).get();

      if (missingCashOutput) {
        throw new Error(
          `Legacy Batch ${missingCashOutput.batch_id} Quote cash output `
            + "could not be migrated."
        );
      }
    }

    if (legacyCashOutputTableExists) {
      sqlite.exec(`
        INSERT OR IGNORE INTO batch_quote_cash_outputs
          (
            batch_id,
            quote_ccy_code,
            quote_balance_contribution_minor,
            quote_ccy_fraction_digits,
            quote_ccy_value_date,
            created_at
          )
        SELECT
          batch_id,
          quote_ccy_code,
          quote_cash_amount_minor,
          quote_ccy_fraction_digits,
          quote_ccy_value_date,
          created_at
        FROM legacy_batch_quote_cash_outputs;
      `);

      const missingLegacyCashOutput = sqlite.prepare(`
        SELECT legacy.batch_id
        FROM legacy_batch_quote_cash_outputs legacy
        LEFT JOIN batch_quote_cash_outputs target
          ON target.batch_id = legacy.batch_id
          AND target.quote_ccy_code = legacy.quote_ccy_code
          AND target.quote_balance_contribution_minor
              = legacy.quote_cash_amount_minor
          AND target.quote_ccy_fraction_digits = legacy.quote_ccy_fraction_digits
          AND target.quote_ccy_value_date = legacy.quote_ccy_value_date
          AND target.created_at = legacy.created_at
        WHERE target.batch_id IS NULL
        LIMIT 1
      `).get();

      if (missingLegacyCashOutput) {
        throw new Error(
          `Legacy Batch ${missingLegacyCashOutput.batch_id} Quote cash output `
            + "could not be migrated."
        );
      }
    }

    const positionForeignKeyViolations =
      sqlite.prepare("PRAGMA foreign_key_check(batch_position_outputs)").all();
    const cashForeignKeyViolations =
      sqlite.prepare("PRAGMA foreign_key_check(batch_quote_cash_outputs)").all();

    if (positionForeignKeyViolations.length > 0 || cashForeignKeyViolations.length > 0) {
      throw new Error("Batch output-table migration produced foreign key violations.");
    }

    if (legacyPositionTableExists) {
      sqlite.exec("DROP TABLE batch_outputs");
    }

    if (legacyCashMemberTableExists) {
      sqlite.exec("DROP TABLE batch_quote_cash_members");
    }

    if (legacyCashOutputTableExists) {
      sqlite.exec("DROP TABLE legacy_batch_quote_cash_outputs");
    }

    sqlite.exec("COMMIT");
  } catch (error) {
    try {
      sqlite.exec("ROLLBACK");
    } catch {}

    throw error;
  } finally {
    if (requiresPositionBridge) {
      sqlite.exec("PRAGMA foreign_keys = ON");
    }
  }
}

function migrateLegacyBatchTables(sqlite) {
  const legacyTables = ["batch_balancing_trades", "trade_batches"];
  const existingLegacyTables = legacyTables.filter(tableName => Boolean(sqlite.prepare(`
    SELECT 1
    FROM sqlite_master
    WHERE type = 'table' AND name = ?
  `).get(tableName)));

  if (existingLegacyTables.length === 0) {
    return;
  }

  for (const tableName of existingLegacyTables) {
    const rowCount = Number(
      sqlite.prepare(`SELECT COUNT(*) AS count FROM ${tableName}`).get().count
    );

    if (rowCount !== 0) {
      throw new Error(
        `Legacy Batch table ${tableName} contains data and cannot be migrated automatically.`
      );
    }
  }

  sqlite.exec("BEGIN IMMEDIATE");

  try {
    if (existingLegacyTables.includes("batch_balancing_trades")) {
      sqlite.exec("DROP TABLE batch_balancing_trades");
    }

    if (existingLegacyTables.includes("trade_batches")) {
      sqlite.exec("DROP TABLE trade_batches");
    }

    sqlite.exec("COMMIT");
  } catch (error) {
    try {
      sqlite.exec("ROLLBACK");
    } catch {}

    throw error;
  }
}

function dropBatchIntegrityTriggers(sqlite) {
  const triggerNames = sqlite.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'trigger'
      AND (
        name LIKE 'trg_batch%'
        OR name LIKE 'trg_batch%'
        OR name LIKE 'trg_formed_batch%'
      )
  `).all().map(row => row.name);

  for (const triggerName of triggerNames) {
    if (!/^[a-z0-9_]+$/i.test(triggerName)) {
      throw new Error(`Unsupported Batch trigger name ${triggerName}.`);
    }

    sqlite.exec(`DROP TRIGGER ${triggerName}`);
  }
}

function dropLegacyDemoHiddenBatches(sqlite) {
  const legacyTableExists = Boolean(sqlite.prepare(`
    SELECT 1 AS present
    FROM sqlite_master
    WHERE type = 'table' AND name = 'demo_hidden_batches'
  `).get());

  if (legacyTableExists) {
    sqlite.exec("DROP TABLE demo_hidden_batches");
  }
}

function migrateClientDealGenerationSettingsToMinorUnits(sqlite) {
  const targetColumns = [
    "pricing_rule_id",
    "min_base_ccy_amount_minor",
    "max_base_ccy_amount_minor",
    "base_ccy_amount_step_minor",
    "base_ccy_fraction_digits",
    "buy_probability_percent",
    "is_active"
  ];
  const legacyColumns = [
    "pricing_rule_id",
    "min_base_ccy_amount",
    "max_base_ccy_amount",
    "base_ccy_amount_step",
    "buy_probability_percent",
    "is_active"
  ];
  const columns = [...tableColumnNames(sqlite, "client_deal_generation_settings")];

  if (columns.join(",") === targetColumns.join(",")) {
    return;
  }

  if (columns.join(",") !== legacyColumns.join(",")) {
    throw new Error("Unsupported Client Deal Generation Settings amount schema.");
  }

  const sourceRows = sqlite.prepare(`
    SELECT
      s.*,
      base_ccy.fraction_digits AS base_ccy_fraction_digits
    FROM client_deal_generation_settings s
    INNER JOIN pricing_rules r ON r.pricing_rule_id = s.pricing_rule_id
    INNER JOIN ccy_pair_options pair ON pair.ccy_pair_code = r.ccy_pair_code
    INNER JOIN ccy_options base_ccy ON base_ccy.ccy_code = pair.base_ccy_code
    ORDER BY s.pricing_rule_id
  `).all();
  const originalRowCount = Number(sqlite.prepare(`
    SELECT COUNT(*) AS count
    FROM client_deal_generation_settings
  `).get().count);

  if (sourceRows.length !== originalRowCount) {
    throw new Error(
      "Every Client Deal Generation Settings row must resolve its Base Ccy Fraction Digits."
    );
  }

  sqlite.exec("PRAGMA foreign_keys = OFF");

  try {
    sqlite.exec("BEGIN IMMEDIATE");
    sqlite.exec(`
      CREATE TABLE client_deal_generation_settings_minor
      (
          pricing_rule_id                   INTEGER PRIMARY KEY,
          min_base_ccy_amount_minor         INTEGER NOT NULL,
          max_base_ccy_amount_minor         INTEGER NOT NULL,
          base_ccy_amount_step_minor        INTEGER NOT NULL,
          base_ccy_fraction_digits          INTEGER NOT NULL,
          buy_probability_percent           INTEGER NOT NULL DEFAULT 50,
          is_active                         INTEGER NOT NULL DEFAULT 1,

          CONSTRAINT fk_client_deal_generation_settings_pricing_rule
              FOREIGN KEY (pricing_rule_id)
                  REFERENCES pricing_rules (pricing_rule_id)
                  ON UPDATE RESTRICT
                  ON DELETE CASCADE,
          CONSTRAINT chk_client_deal_generation_settings_amounts
              CHECK (
                  typeof(min_base_ccy_amount_minor) = 'integer'
                  AND min_base_ccy_amount_minor BETWEEN 1 AND 9007199254740991
                  AND typeof(max_base_ccy_amount_minor) = 'integer'
                  AND max_base_ccy_amount_minor
                      BETWEEN min_base_ccy_amount_minor AND 9007199254740991
                  AND typeof(base_ccy_amount_step_minor) = 'integer'
                  AND base_ccy_amount_step_minor BETWEEN 1 AND 9007199254740991
              ),
          CONSTRAINT chk_client_deal_generation_settings_fraction_digits
              CHECK (
                  typeof(base_ccy_fraction_digits) = 'integer'
                  AND base_ccy_fraction_digits BETWEEN 0 AND 10
              ),
          CONSTRAINT chk_client_deal_generation_settings_buy_probability
              CHECK (
                  typeof(buy_probability_percent) = 'integer'
                  AND buy_probability_percent BETWEEN 0 AND 100
              ),
          CONSTRAINT chk_client_deal_generation_settings_active
              CHECK (is_active IN (0, 1))
      );
    `);

    const insert = sqlite.prepare(`
      INSERT INTO client_deal_generation_settings_minor
        (
          pricing_rule_id,
          min_base_ccy_amount_minor,
          max_base_ccy_amount_minor,
          base_ccy_amount_step_minor,
          base_ccy_fraction_digits,
          buy_probability_percent,
          is_active
        )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    for (const row of sourceRows) {
      insert.run(
        row.pricing_rule_id,
        minorToSafeInteger(
          majorToMinor(
            String(row.min_base_ccy_amount),
            row.base_ccy_fraction_digits
          ),
          "Min Base Ccy Amount Minor"
        ),
        minorToSafeInteger(
          majorToMinor(
            String(row.max_base_ccy_amount),
            row.base_ccy_fraction_digits
          ),
          "Max Base Ccy Amount Minor"
        ),
        minorToSafeInteger(
          majorToMinor(
            String(row.base_ccy_amount_step),
            row.base_ccy_fraction_digits
          ),
          "Base Ccy Amount Step Minor"
        ),
        row.base_ccy_fraction_digits,
        row.buy_probability_percent,
        row.is_active
      );
    }

    sqlite.exec(`
      DROP TABLE client_deal_generation_settings;
      ALTER TABLE client_deal_generation_settings_minor
        RENAME TO client_deal_generation_settings;
    `);

    const migratedRowCount = Number(sqlite.prepare(`
      SELECT COUNT(*) AS count
      FROM client_deal_generation_settings
    `).get().count);
    const foreignKeyViolations = sqlite.prepare("PRAGMA foreign_key_check").all();

    if (migratedRowCount !== originalRowCount) {
      throw new Error(
        "Client Deal Generation Settings minor-unit migration did not preserve every row."
      );
    }

    if (foreignKeyViolations.length > 0) {
      throw new Error(
        "Client Deal Generation Settings minor-unit migration produced foreign key violations."
      );
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

function defaultClientDealGenerationAmounts(fractionDigits) {
  return {
    minBaseCcyAmountMinor: minorToSafeInteger(
      majorToMinor("500000", fractionDigits),
      "Default Min Base Ccy Amount Minor"
    ),
    maxBaseCcyAmountMinor: minorToSafeInteger(
      majorToMinor("1500000", fractionDigits),
      "Default Max Base Ccy Amount Minor"
    ),
    baseCcyAmountStepMinor: minorToSafeInteger(
      majorToMinor("100000", fractionDigits),
      "Default Base Ccy Amount Step Minor"
    )
  };
}

function ensureClientDealGenerationProcessSettings(sqlite) {
  sqlite.prepare(`
    INSERT OR IGNORE INTO client_deal_generation_process_settings
      (
        settings_id,
        min_interval_seconds,
        max_interval_seconds,
        min_deals_per_cycle,
        max_deals_per_cycle
      )
    VALUES (1, 1, 3, 3, 7)
  `).run();
}

function synchronizeClientDealGenerationSettings(sqlite) {
  sqlite.exec(`
    DELETE FROM client_deal_generation_settings
    WHERE NOT EXISTS
    (
      SELECT 1
      FROM pricing_rules r
      INNER JOIN trading_counterparty_roles role
        ON role.counterparty_id = r.counterparty_id AND role.role_code = 'CLIENT'
      INNER JOIN trade_contexts c ON c.trade_context_id = r.trade_context_id
      INNER JOIN originating_systems e ON e.originating_system_id = c.originating_system_id
      WHERE r.pricing_rule_id = client_deal_generation_settings.pricing_rule_id
        AND e.pricing_mode = 'AUTO_PRICED'
    );
  `);

  const eligibleRules = sqlite.prepare(`
    SELECT
      r.pricing_rule_id,
      base_ccy.fraction_digits AS base_ccy_fraction_digits
    FROM pricing_rules r
    INNER JOIN trading_counterparty_roles role
      ON role.counterparty_id = r.counterparty_id AND role.role_code = 'CLIENT'
    INNER JOIN trade_contexts c ON c.trade_context_id = r.trade_context_id
    INNER JOIN originating_systems e ON e.originating_system_id = c.originating_system_id
    INNER JOIN ccy_pair_options pair ON pair.ccy_pair_code = r.ccy_pair_code
    INNER JOIN ccy_options base_ccy ON base_ccy.ccy_code = pair.base_ccy_code
    WHERE e.pricing_mode = 'AUTO_PRICED'
  `).all();
  const insert = sqlite.prepare(`
    INSERT OR IGNORE INTO client_deal_generation_settings
      (
        pricing_rule_id,
        min_base_ccy_amount_minor,
        max_base_ccy_amount_minor,
        base_ccy_amount_step_minor,
        base_ccy_fraction_digits,
        buy_probability_percent,
        is_active
      )
    VALUES (?, ?, ?, ?, ?, 50, 1)
  `);

  for (const rule of eligibleRules) {
    const defaults = defaultClientDealGenerationAmounts(rule.base_ccy_fraction_digits);
    insert.run(
      rule.pricing_rule_id,
      defaults.minBaseCcyAmountMinor,
      defaults.maxBaseCcyAmountMinor,
      defaults.baseCcyAmountStepMinor,
      rule.base_ccy_fraction_digits
    );
  }
}

function clientDealGenerationReferenceEligible(counterpartyId, tradeContextId) {
  return Boolean(database.prepare(`
    SELECT 1 AS eligible
    FROM trading_counterparty_roles role
    INNER JOIN trade_contexts c ON c.trade_context_id = ?
    INNER JOIN originating_systems e ON e.originating_system_id = c.originating_system_id
    WHERE role.counterparty_id = ?
      AND role.role_code = 'CLIENT'
      AND e.pricing_mode = 'AUTO_PRICED'
  `).get(tradeContextId, counterpartyId));
}

function ensureClientDealTriggers(sqlite) {
  sqlite.exec(`
    CREATE TRIGGER IF NOT EXISTS trg_client_deals_require_client_insert
    BEFORE INSERT ON client_deals
    FOR EACH ROW
    WHEN NOT EXISTS
    (
        SELECT 1
        FROM trading_counterparty_roles
        WHERE counterparty_id = NEW.counterparty_id AND role_code = 'CLIENT'
    )
    BEGIN
        SELECT RAISE(ABORT, 'client_deals.counterparty_id must reference a Trading Counterparty with the CLIENT role');
    END;

    CREATE TRIGGER IF NOT EXISTS trg_client_deals_require_client_update
    BEFORE UPDATE OF counterparty_id ON client_deals
    FOR EACH ROW
    WHEN NOT EXISTS
    (
        SELECT 1
        FROM trading_counterparty_roles
        WHERE counterparty_id = NEW.counterparty_id AND role_code = 'CLIENT'
    )
    BEGIN
        SELECT RAISE(ABORT, 'client_deals.counterparty_id must reference a Trading Counterparty with the CLIENT role');
    END;

    CREATE TRIGGER IF NOT EXISTS trg_trading_counterparty_roles_preserve_client_deals
    BEFORE DELETE ON trading_counterparty_roles
    FOR EACH ROW
    WHEN OLD.role_code = 'CLIENT'
        AND EXISTS (SELECT 1 FROM client_deals WHERE counterparty_id = OLD.counterparty_id)
    BEGIN
        SELECT RAISE(ABORT, 'a Trading Counterparty used by client_deals must retain the CLIENT role');
    END;
  `);
}

function ensureHedgeDealTriggers(sqlite) {
  sqlite.exec(`
    CREATE TRIGGER IF NOT EXISTS trg_hedge_deals_require_hedge_counterparty_insert
    BEFORE INSERT ON hedge_deals
    FOR EACH ROW
    WHEN NOT EXISTS
    (
      SELECT 1
      FROM trading_counterparty_roles
      WHERE counterparty_id = NEW.counterparty_id AND role_code = 'HEDGE_COUNTERPARTY'
    )
    BEGIN
      SELECT RAISE(ABORT, 'hedge_deals.counterparty_id must reference a Trading Counterparty with the HEDGE_COUNTERPARTY role');
    END;

    CREATE TRIGGER IF NOT EXISTS trg_hedge_deals_require_hedge_counterparty_update
    BEFORE UPDATE OF counterparty_id ON hedge_deals
    FOR EACH ROW
    WHEN NOT EXISTS
    (
      SELECT 1
      FROM trading_counterparty_roles
      WHERE counterparty_id = NEW.counterparty_id AND role_code = 'HEDGE_COUNTERPARTY'
    )
    BEGIN
      SELECT RAISE(ABORT, 'hedge_deals.counterparty_id must reference a Trading Counterparty with the HEDGE_COUNTERPARTY role');
    END;

    CREATE TRIGGER IF NOT EXISTS trg_trading_counterparty_roles_preserve_hedge_deals
    BEFORE DELETE ON trading_counterparty_roles
    FOR EACH ROW
    WHEN OLD.role_code = 'HEDGE_COUNTERPARTY'
      AND EXISTS (SELECT 1 FROM hedge_deals WHERE counterparty_id = OLD.counterparty_id)
    BEGIN
      SELECT RAISE(ABORT, 'a Trading Counterparty used by hedge_deals must retain the HEDGE_COUNTERPARTY role');
    END;
  `);
}

function migrateClientDealsToTradeExposure(sqlite) {
  const tableInfo = sqlite.prepare("PRAGMA table_info(client_deals)").all();
  const columns = tableInfo.map(column => column.name);
  const exposureColumns = sqlite.prepare("PRAGMA table_info(trade_exposures)")
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
  const exposureUsesExecutionAndReceivedTimestamps =
    exposureColumns.includes("execution_timestamp")
    && exposureColumns.includes("received_timestamp");
  const foreignKeys = sqlite.prepare("PRAGMA foreign_key_list(client_deals)").all();
  const tableDefinition = sqlite.prepare(`
    SELECT sql
    FROM sqlite_master
    WHERE type = 'table' AND name = 'client_deals'
  `).get()?.sql || "";
  const targetColumns = [
    "trade_id",
    "trade_type",
    "counterparty_id",
    "trade_context_id",
    "pricing_rule_id",
    "transfer_rate",
    "analytical_pnl_quote_minor",
    "analytical_pnl_quote_fraction_digits",
    "comment"
  ];
  const majorPnlTargetColumns = [
    "trade_id",
    "trade_type",
    "counterparty_id",
    "trade_context_id",
    "pricing_rule_id",
    "transfer_rate",
    "analytical_pnl",
    "comment"
  ];
  const preCommentTargetColumns = [
    "trade_id",
    "trade_type",
    "counterparty_id",
    "trade_context_id",
    "pricing_rule_id",
    "transfer_rate",
    "analytical_pnl"
  ];
  const previousTargetColumns = [
    "trade_id",
    "trade_type",
    "counterparty_id",
    "trade_context_id",
    "pricing_rule_id",
    "transfer_rate",
    "analytical_pnl_quote_amount"
  ];
  const sharedIdentityColumns = ["trade_id", "trade_type", "counterparty_id"];
  const legacyColumns = [
    "client_deal_id",
    "entry_timestamp",
    "counterparty_id",
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
  const counterpartyForeignKeys = foreignKeys.filter(key => key.table === "trading_counterparties");
  const tradeContextForeignKeys = foreignKeys.filter(key => key.table === "trade_contexts");
  const hasSharedIdentityForeignKeys = foreignKeys.length === 3
    && foreignKeys.every(key => key.on_update === "RESTRICT" && key.on_delete === "RESTRICT")
    && hasCompositeForeignKey("trade_exposures", [
      { from: "trade_id", to: "trade_id" },
      { from: "trade_type", to: "trade_type" }
    ])
    && counterpartyForeignKeys.length === 1
    && counterpartyForeignKeys[0].from === "counterparty_id"
    && counterpartyForeignKeys[0].to === "counterparty_id";
  const hasTargetForeignKeys = foreignKeys.length === 7
    && foreignKeys.every(key => key.on_update === "RESTRICT" && key.on_delete === "RESTRICT")
    && hasCompositeForeignKey("trade_exposures", [
      { from: "trade_id", to: "trade_id" },
      { from: "trade_type", to: "trade_type" }
    ])
    && counterpartyForeignKeys.length === 1
    && counterpartyForeignKeys[0].from === "counterparty_id"
    && counterpartyForeignKeys[0].to === "counterparty_id"
    && tradeContextForeignKeys.length === 1
    && tradeContextForeignKeys[0].from === "trade_context_id"
    && tradeContextForeignKeys[0].to === "trade_context_id"
    && hasCompositeForeignKey("pricing_rules", [
      { from: "pricing_rule_id", to: "pricing_rule_id" },
      { from: "counterparty_id", to: "counterparty_id" },
      { from: "trade_context_id", to: "trade_context_id" }
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
    && tableDefinition.includes("chk_client_deals_pricing_context")
    && tableDefinition.includes("chk_client_deals_transfer_rate")
    && tableDefinition.includes("chk_client_deals_analytical_pnl");
  const hasMajorPnlTargetColumnDefinitions = hasPreCommentTargetColumnDefinitions
    && tableInfo[7]?.type === "TEXT"
    && tableInfo[7]?.notnull === 0
    && tableDefinition.includes("chk_client_deals_comment");
  const hasTargetColumnDefinitions = tableInfo[0]?.type === "INTEGER"
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
    && tableInfo[6]?.type === "INTEGER"
    && tableInfo[6]?.notnull === 0
    && tableInfo[7]?.type === "INTEGER"
    && tableInfo[7]?.notnull === 0
    && tableInfo[8]?.type === "TEXT"
    && tableInfo[8]?.notnull === 0
    && hasSharedIdentityColumnDefinitions
    && tableDefinition.includes("chk_client_deals_pricing_context")
    && tableDefinition.includes("chk_client_deals_transfer_rate")
    && tableDefinition.includes("chk_client_deals_analytical_pnl_quote")
    && tableDefinition.includes("chk_client_deals_comment");
  const identityIndex = sqlite.prepare("PRAGMA index_list(trade_exposures)").all()
    .find(index => index.name === "uq_trade_exposures_identity"
      && index.unique === 1
      && index.partial === 0);
  const identityIndexColumns = identityIndex
    ? sqlite.prepare("PRAGMA index_info(uq_trade_exposures_identity)").all().map(column => column.name)
    : [];
  const pricingReferenceIndex = sqlite.prepare("PRAGMA index_list(pricing_rules)").all()
    .find(index => index.name === "uq_pricing_rules_client_deal_reference"
      && index.unique === 1
      && index.partial === 0);
  const pricingReferenceIndexColumns = pricingReferenceIndex
    ? sqlite.prepare("PRAGMA index_info(uq_pricing_rules_client_deal_reference)").all().map(column => column.name)
    : [];

  if (!identityIndex || identityIndexColumns.join(",") !== "trade_id,trade_type") {
    throw new Error("Trade Exposure identity index is missing or invalid.");
  }

  if (!pricingReferenceIndex
    || pricingReferenceIndexColumns.join(",") !== "pricing_rule_id,counterparty_id,trade_context_id") {
    throw new Error("Pricing Rule Client Deal reference index is missing or invalid.");
  }

  if (hasColumns(targetColumns)) {
    if (!hasTargetColumnDefinitions || !hasTargetForeignKeys) {
      throw new Error("Unsupported Client Deal target schema.");
    }

    return;
  }

  const hasMajorPnlTargetSchema = hasColumns(majorPnlTargetColumns);
  const hasPreviousTargetSchema = hasColumns(previousTargetColumns);
  const hasPreCommentTargetSchema = hasColumns(preCommentTargetColumns);
  const hasSharedIdentitySchema = hasColumns(sharedIdentityColumns);
  const hasLegacySchema = hasColumns(legacyColumns);

  if (hasMajorPnlTargetSchema
    && (!hasMajorPnlTargetColumnDefinitions || !hasTargetForeignKeys)) {
    throw new Error("Unsupported major-PnL Client Deal target schema.");
  }

  if (hasMajorPnlTargetSchema) {
    return;
  }

  if (hasPreviousTargetSchema
    && (!hasPreCommentTargetColumnDefinitions || !hasTargetForeignKeys)) {
    throw new Error("Unsupported previous Client Deal target schema.");
  }

  if (hasPreCommentTargetSchema
    && (!hasPreCommentTargetColumnDefinitions || !hasTargetForeignKeys)) {
    throw new Error("Unsupported pre-Comment Client Deal target schema.");
  }

  if (hasSharedIdentitySchema
    && (!hasSharedIdentityColumnDefinitions || !hasSharedIdentityForeignKeys)) {
    throw new Error("Unsupported Client Deal shared identity schema.");
  }

  if (!hasPreviousTargetSchema
    && !hasMajorPnlTargetSchema
    && !hasPreCommentTargetSchema
    && !hasSharedIdentitySchema
    && !hasLegacySchema) {
    throw new Error("Unsupported Client Deal schema.");
  }

  if (hasLegacySchema) {
    if (!exposureUsesMajorAmounts && !exposureUsesMinorAmounts) {
      throw new Error("Unsupported Trade Exposure amount schema.");
    }

    const invalidTenor = sqlite.prepare(`
      SELECT client_deal_id
      FROM client_deals
      WHERE tenor NOT IN ('TOD', 'TOM', 'SPOT')
      LIMIT 1
    `).get();

    if (invalidTenor) {
      throw new Error(`Client Deal ${invalidTenor.client_deal_id} has an unsupported tenor.`);
    }

    const invalidCounterparty = sqlite.prepare(`
      SELECT d.client_deal_id
      FROM client_deals d
      LEFT JOIN trading_counterparties p ON p.counterparty_id = d.counterparty_id
      LEFT JOIN trading_counterparty_roles role
        ON role.counterparty_id = d.counterparty_id AND role.role_code = 'CLIENT'
      WHERE p.counterparty_id IS NULL OR role.counterparty_id IS NULL
      LIMIT 1
    `).get();

    if (invalidCounterparty) {
      throw new Error(`Client Deal ${invalidCounterparty.client_deal_id} does not reference a CLIENT Trading Counterparty.`);
    }

    const collidingExposure = sqlite.prepare(`
      SELECT d.client_deal_id
      FROM client_deals d
      INNER JOIN trade_exposures e ON e.trade_id = d.client_deal_id
      LIMIT 1
    `).get();

    if (collidingExposure) {
      throw new Error(`Client Deal ${collidingExposure.client_deal_id} collides with an existing Trade Exposure.`);
    }
  }

  const legacyRowCount = Number(sqlite.prepare("SELECT COUNT(*) AS count FROM client_deals").get().count);
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
          FROM client_deals d
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
          ? exposureUsesExecutionAndReceivedTimestamps
            ? `
              INSERT INTO trade_exposures
                (
                  trade_id,
                  execution_timestamp,
                  received_timestamp,
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
              VALUES (?, ?, ?, 'CLIENT_DEAL', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `
            : `
            INSERT INTO trade_exposures
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
            INSERT INTO trade_exposures
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
            row.entry_timestamp
          ];

          if (exposureUsesExecutionAndReceivedTimestamps) {
            values.push(row.entry_timestamp);
          }

          values.push(row.trade_date, row.ccy_pair_code, row.side);

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
          INSERT INTO trade_exposures
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
          FROM client_deals d;
        `);
      }
    }

    sqlite.exec(`
      CREATE TABLE client_deals_migrated
      (
          trade_id                    INTEGER PRIMARY KEY,
          trade_type                  TEXT    NOT NULL DEFAULT 'CLIENT_DEAL',
          counterparty_id                    INTEGER NOT NULL,
          trade_context_id        INTEGER,
          pricing_rule_id             INTEGER,
          transfer_rate               NUMERIC,
          analytical_pnl              NUMERIC,
          comment                     TEXT,

          CONSTRAINT fk_client_deals_trade
              FOREIGN KEY (trade_id, trade_type)
                  REFERENCES trade_exposures (trade_id, trade_type)
                  ON UPDATE RESTRICT
                  ON DELETE RESTRICT,
          CONSTRAINT fk_client_deals_counterparty
              FOREIGN KEY (counterparty_id)
                  REFERENCES trading_counterparties (counterparty_id)
                  ON UPDATE RESTRICT
                  ON DELETE RESTRICT,
          CONSTRAINT fk_client_deals_trade_context
              FOREIGN KEY (trade_context_id)
                  REFERENCES trade_contexts (trade_context_id)
                  ON UPDATE RESTRICT
                  ON DELETE RESTRICT,
          CONSTRAINT fk_client_deals_pricing_rule_scope
              FOREIGN KEY (pricing_rule_id, counterparty_id, trade_context_id)
                  REFERENCES pricing_rules (pricing_rule_id, counterparty_id, trade_context_id)
                  ON UPDATE RESTRICT
                  ON DELETE RESTRICT,
          CONSTRAINT chk_client_deals_trade_type
              CHECK (trade_type = 'CLIENT_DEAL'),
          CONSTRAINT chk_client_deals_pricing_context
              CHECK (pricing_rule_id IS NULL OR trade_context_id IS NOT NULL),
          CONSTRAINT chk_client_deals_transfer_rate
              CHECK (
                  transfer_rate IS NULL
                  OR (
                      typeof(transfer_rate) IN ('integer', 'real')
                      AND transfer_rate > 0
                  )
              ),
          CONSTRAINT chk_client_deals_analytical_pnl
              CHECK (
                  analytical_pnl IS NULL
                  OR typeof(analytical_pnl) IN ('integer', 'real')
              ),
          CONSTRAINT chk_client_deals_comment
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
    const sourceTradeContextExpression = hasAttributionColumns ? "trade_context_id" : "NULL";
    const sourcePricingRuleExpression = hasAttributionColumns ? "pricing_rule_id" : "NULL";
    const sourceTransferRateExpression = hasAttributionColumns ? "transfer_rate" : "NULL";
    const sourceAnalyticalPnlExpression = hasPreviousTargetSchema
      ? "analytical_pnl_quote_amount"
      : hasPreCommentTargetSchema
        ? "analytical_pnl"
        : "NULL";
    sqlite.exec(`
      INSERT INTO client_deals_migrated
        (
          trade_id,
          trade_type,
          counterparty_id,
          trade_context_id,
          pricing_rule_id,
          transfer_rate,
          analytical_pnl,
          comment
        )
      SELECT
        ${sourceTradeIdColumn},
        ${sourceTradeTypeExpression},
        counterparty_id,
        ${sourceTradeContextExpression},
        ${sourcePricingRuleExpression},
        ${sourceTransferRateExpression},
        ${sourceAnalyticalPnlExpression},
        NULL
      FROM client_deals
      ORDER BY ${sourceTradeIdColumn};

      DROP TABLE client_deals;
      ALTER TABLE client_deals_migrated RENAME TO client_deals;

      CREATE INDEX idx_client_deals_counterparty
          ON client_deals (counterparty_id);
      CREATE INDEX idx_client_deals_trade_context
          ON client_deals (trade_context_id);
      CREATE INDEX idx_client_deals_pricing_rule
          ON client_deals (pricing_rule_id);
    `);

    const migratedRowCount = Number(sqlite.prepare("SELECT COUNT(*) AS count FROM client_deals").get().count);
    const linkedRowCount = Number(sqlite.prepare(`
      SELECT COUNT(*) AS count
      FROM client_deals d
      INNER JOIN trade_exposures e
        ON e.trade_id = d.trade_id AND e.trade_type = d.trade_type
    `).get().count);
    const foreignKeyViolations = sqlite.prepare("PRAGMA foreign_key_check").all();

    if (migratedRowCount !== legacyRowCount || linkedRowCount !== legacyRowCount) {
      throw new Error("Client Deal migration did not preserve every row.");
    }

    if (foreignKeyViolations.length > 0) {
      throw new Error("Client Deal migration produced foreign key violations.");
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

function migrateDealAnalyticalPnlTable(sqlite, {
  tableName,
  migratedTableName,
  tradeType,
  targetColumns,
  compatibleTargetColumns = [],
  sourceColumns,
  analyticalPnlConstraint,
  createTableSql,
  includesComment
}) {
  const tableExists = Boolean(sqlite.prepare(`
    SELECT 1 AS present
    FROM sqlite_master
    WHERE type = 'table' AND name = ?
  `).get(tableName));

  if (!tableExists) {
    return;
  }

  const tableInfo = sqlite.prepare(`PRAGMA table_info(${tableName})`).all();
  const columns = tableInfo.map(column => column.name);
  const tableDefinition = sqlite.prepare(`
    SELECT sql
    FROM sqlite_master
    WHERE type = 'table' AND name = ?
  `).get(tableName)?.sql || "";
  const columnNames = columns.join(",");

  const matchedTargetColumns = [targetColumns, ...compatibleTargetColumns]
    .find(candidateColumns => columnNames === candidateColumns.join(","));

  if (matchedTargetColumns) {
    const analyticalPnlMinorIndex = matchedTargetColumns.indexOf("analytical_pnl_quote_minor");
    const analyticalPnlFractionDigitsIndex = matchedTargetColumns
      .indexOf("analytical_pnl_quote_fraction_digits");
    const targetDefinitionIsValid = tableInfo[analyticalPnlMinorIndex]?.type === "INTEGER"
      && tableInfo[analyticalPnlMinorIndex]?.notnull === 0
      && tableInfo[analyticalPnlFractionDigitsIndex]?.type === "INTEGER"
      && tableInfo[analyticalPnlFractionDigitsIndex]?.notnull === 0
      && tableDefinition.includes(analyticalPnlConstraint);

    if (!targetDefinitionIsValid) {
      throw new Error(`Unsupported ${tableName} Analytical PnL minor-unit schema.`);
    }

    return;
  }

  if (columnNames !== sourceColumns.join(",")) {
    throw new Error(`Unsupported ${tableName} Analytical PnL schema.`);
  }

  const sourceRows = sqlite.prepare(`
    SELECT
      d.*,
      quote_ccy.fraction_digits AS quote_ccy_fraction_digits
    FROM ${tableName} d
    INNER JOIN trade_exposures e
      ON e.trade_id = d.trade_id AND e.trade_type = d.trade_type
    INNER JOIN ccy_pair_options pair
      ON pair.ccy_pair_code = e.ccy_pair_code
    INNER JOIN ccy_options quote_ccy
      ON quote_ccy.ccy_code = pair.quote_ccy_code
    WHERE d.trade_type = ?
    ORDER BY d.trade_id
  `).all(tradeType);
  const originalRowCount = Number(
    sqlite.prepare(`SELECT COUNT(*) AS count FROM ${tableName}`).get().count
  );

  if (sourceRows.length !== originalRowCount) {
    throw new Error(
      `Every ${tableName} row must resolve its quote currency Fraction Digits.`
    );
  }

  sqlite.exec("PRAGMA foreign_keys = OFF");

  try {
    sqlite.exec("BEGIN IMMEDIATE");
    sqlite.exec(createTableSql);

    const insertColumns = [
      "trade_id",
      "trade_type",
      "counterparty_id",
      "trade_context_id",
      "pricing_rule_id",
      "transfer_rate",
      "analytical_pnl_quote_minor",
      "analytical_pnl_quote_fraction_digits"
    ];

    if (includesComment) {
      insertColumns.push("comment");
    }

    const placeholders = insertColumns.map(() => "?").join(", ");
    const insertRow = sqlite.prepare(`
      INSERT INTO ${migratedTableName}
        (${insertColumns.join(", ")})
      VALUES (${placeholders})
    `);

    for (const row of sourceRows) {
      const analyticalPnlQuoteFractionDigits = row.analytical_pnl === null
        ? null
        : row.quote_ccy_fraction_digits;
      const analyticalPnlQuoteMinor = row.analytical_pnl === null
        ? null
        : minorToSafeInteger(
          majorToMinor(
            String(row.analytical_pnl),
            analyticalPnlQuoteFractionDigits
          ),
          "Analytical PnL Quote Minor"
        );
      const values = [
        row.trade_id,
        row.trade_type,
        row.counterparty_id,
        row.trade_context_id,
        row.pricing_rule_id,
        row.transfer_rate,
        analyticalPnlQuoteMinor,
        analyticalPnlQuoteFractionDigits
      ];

      if (includesComment) {
        values.push(row.comment);
      }

      insertRow.run(...values);
    }

    sqlite.exec(`
      DROP TABLE ${tableName};
      ALTER TABLE ${migratedTableName} RENAME TO ${tableName};
    `);

    const migratedRowCount = Number(
      sqlite.prepare(`SELECT COUNT(*) AS count FROM ${tableName}`).get().count
    );
    const foreignKeyViolations = sqlite.prepare("PRAGMA foreign_key_check").all();

    if (migratedRowCount !== originalRowCount) {
      throw new Error(`${tableName} Analytical PnL migration did not preserve every row.`);
    }

    if (foreignKeyViolations.length > 0) {
      throw new Error(`${tableName} Analytical PnL migration produced foreign key violations.`);
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

function migrateDealAnalyticalPnlToMinorUnits(sqlite) {
  migrateDealAnalyticalPnlTable(sqlite, {
    tableName: "client_deals",
    migratedTableName: "client_deals_migrated",
    tradeType: "CLIENT_DEAL",
    targetColumns: [
      "trade_id",
      "trade_type",
      "counterparty_id",
      "trade_context_id",
      "pricing_rule_id",
      "transfer_rate",
      "analytical_pnl_quote_minor",
      "analytical_pnl_quote_fraction_digits",
      "comment"
    ],
    sourceColumns: [
      "trade_id",
      "trade_type",
      "counterparty_id",
      "trade_context_id",
      "pricing_rule_id",
      "transfer_rate",
      "analytical_pnl",
      "comment"
    ],
    analyticalPnlConstraint: "chk_client_deals_analytical_pnl_quote",
    includesComment: true,
    createTableSql: `
      CREATE TABLE client_deals_migrated
      (
          trade_id                    INTEGER PRIMARY KEY,
          trade_type                  TEXT    NOT NULL DEFAULT 'CLIENT_DEAL',
          counterparty_id                    INTEGER NOT NULL,
          trade_context_id        INTEGER,
          pricing_rule_id             INTEGER,
          transfer_rate               NUMERIC,
          analytical_pnl_quote_minor  INTEGER,
          analytical_pnl_quote_fraction_digits INTEGER,
          comment                     TEXT,

          CONSTRAINT fk_client_deals_trade
              FOREIGN KEY (trade_id, trade_type)
                  REFERENCES trade_exposures (trade_id, trade_type)
                  ON UPDATE RESTRICT
                  ON DELETE RESTRICT,
          CONSTRAINT fk_client_deals_counterparty
              FOREIGN KEY (counterparty_id)
                  REFERENCES trading_counterparties (counterparty_id)
                  ON UPDATE RESTRICT
                  ON DELETE RESTRICT,
          CONSTRAINT fk_client_deals_trade_context
              FOREIGN KEY (trade_context_id)
                  REFERENCES trade_contexts (trade_context_id)
                  ON UPDATE RESTRICT
                  ON DELETE RESTRICT,
          CONSTRAINT fk_client_deals_pricing_rule_scope
              FOREIGN KEY (pricing_rule_id, counterparty_id, trade_context_id)
                  REFERENCES pricing_rules (pricing_rule_id, counterparty_id, trade_context_id)
                  ON UPDATE RESTRICT
                  ON DELETE RESTRICT,
          CONSTRAINT chk_client_deals_trade_type
              CHECK (trade_type = 'CLIENT_DEAL'),
          CONSTRAINT chk_client_deals_pricing_context
              CHECK (pricing_rule_id IS NULL OR trade_context_id IS NOT NULL),
          CONSTRAINT chk_client_deals_transfer_rate
              CHECK (
                  transfer_rate IS NULL
                  OR (
                      typeof(transfer_rate) IN ('integer', 'real')
                      AND transfer_rate > 0
                  )
              ),
          CONSTRAINT chk_client_deals_analytical_pnl_quote
              CHECK (
                  (
                      analytical_pnl_quote_minor IS NULL
                      AND analytical_pnl_quote_fraction_digits IS NULL
                  )
                  OR (
                      typeof(analytical_pnl_quote_minor) = 'integer'
                      AND analytical_pnl_quote_minor
                          BETWEEN -9007199254740991 AND 9007199254740991
                      AND typeof(analytical_pnl_quote_fraction_digits) = 'integer'
                      AND analytical_pnl_quote_fraction_digits BETWEEN 0 AND 10
                  )
              ),
          CONSTRAINT chk_client_deals_comment
              CHECK (
                  comment IS NULL
                  OR (
                      length(comment) <= 500
                      AND instr(comment, char(10)) = 0
                      AND instr(comment, char(13)) = 0
                  )
              )
      );
    `
  });

  migrateDealAnalyticalPnlTable(sqlite, {
    tableName: "hedge_deals",
    migratedTableName: "hedge_deals_migrated",
    tradeType: "HEDGE_DEAL",
    targetColumns: [
      "trade_id",
      "trade_type",
      "counterparty_id",
      "trade_context_id",
      "pricing_rule_id",
      "transfer_rate",
      "analytical_pnl_quote_minor",
      "analytical_pnl_quote_fraction_digits"
    ],
    compatibleTargetColumns: [[
      "trade_id",
      "trade_type",
      "request_timestamp",
      "counterparty_id",
      "trade_context_id",
      "pricing_rule_id",
      "transfer_rate",
      "analytical_pnl_quote_minor",
      "analytical_pnl_quote_fraction_digits"
    ]],
    sourceColumns: [
      "trade_id",
      "trade_type",
      "counterparty_id",
      "trade_context_id",
      "pricing_rule_id",
      "transfer_rate",
      "analytical_pnl"
    ],
    analyticalPnlConstraint: "chk_hedge_deals_analytical_pnl_quote",
    includesComment: false,
    createTableSql: `
      CREATE TABLE hedge_deals_migrated
      (
          trade_id                    INTEGER PRIMARY KEY,
          trade_type                  TEXT    NOT NULL DEFAULT 'HEDGE_DEAL',
          counterparty_id                    INTEGER NOT NULL,
          trade_context_id        INTEGER,
          pricing_rule_id             INTEGER,
          transfer_rate               NUMERIC,
          analytical_pnl_quote_minor  INTEGER,
          analytical_pnl_quote_fraction_digits INTEGER,

          CONSTRAINT fk_hedge_deals_trade
              FOREIGN KEY (trade_id, trade_type)
                  REFERENCES trade_exposures (trade_id, trade_type)
                  ON UPDATE RESTRICT
                  ON DELETE RESTRICT,
          CONSTRAINT fk_hedge_deals_counterparty
              FOREIGN KEY (counterparty_id)
                  REFERENCES trading_counterparties (counterparty_id)
                  ON UPDATE RESTRICT
                  ON DELETE RESTRICT,
          CONSTRAINT fk_hedge_deals_trade_context
              FOREIGN KEY (trade_context_id)
                  REFERENCES trade_contexts (trade_context_id)
                  ON UPDATE RESTRICT
                  ON DELETE RESTRICT,
          CONSTRAINT fk_hedge_deals_pricing_rule_scope
              FOREIGN KEY (pricing_rule_id, counterparty_id, trade_context_id)
                  REFERENCES pricing_rules (pricing_rule_id, counterparty_id, trade_context_id)
                  ON UPDATE RESTRICT
                  ON DELETE RESTRICT,
          CONSTRAINT chk_hedge_deals_trade_type
              CHECK (trade_type = 'HEDGE_DEAL'),
          CONSTRAINT chk_hedge_deals_pricing_context
              CHECK (pricing_rule_id IS NULL OR trade_context_id IS NOT NULL),
          CONSTRAINT chk_hedge_deals_transfer_rate
              CHECK (
                  transfer_rate IS NULL
                  OR (
                      typeof(transfer_rate) IN ('integer', 'real')
                      AND transfer_rate > 0
                  )
              ),
          CONSTRAINT chk_hedge_deals_analytical_pnl_quote
              CHECK (
                  (
                      analytical_pnl_quote_minor IS NULL
                      AND analytical_pnl_quote_fraction_digits IS NULL
                  )
                  OR (
                      typeof(analytical_pnl_quote_minor) = 'integer'
                      AND analytical_pnl_quote_minor
                          BETWEEN -9007199254740991 AND 9007199254740991
                      AND typeof(analytical_pnl_quote_fraction_digits) = 'integer'
                      AND analytical_pnl_quote_fraction_digits BETWEEN 0 AND 10
                  )
              )
      );
    `
  });
}

function migrateHedgeDealRequestTimestamp(sqlite) {
  const tableExists = Boolean(sqlite.prepare(`
    SELECT 1 AS present
    FROM sqlite_master
    WHERE type = 'table' AND name = 'hedge_deals'
  `).get());

  if (!tableExists) {
    return;
  }

  const targetColumns = [
    "trade_id",
    "trade_type",
    "request_timestamp",
    "counterparty_id",
    "trade_context_id",
    "pricing_rule_id",
    "transfer_rate",
    "analytical_pnl_quote_minor",
    "analytical_pnl_quote_fraction_digits"
  ];
  const legacyColumns = targetColumns.filter(column => column !== "request_timestamp");
  const tableInfo = sqlite.prepare("PRAGMA table_info(hedge_deals)").all();
  const columnNames = tableInfo.map(column => column.name).join(",");
  const tableDefinition = sqlite.prepare(`
    SELECT sql
    FROM sqlite_master
    WHERE type = 'table' AND name = 'hedge_deals'
  `).get()?.sql || "";

  if (columnNames === targetColumns.join(",")) {
    const requestTimestampColumn = tableInfo[targetColumns.indexOf("request_timestamp")];
    const targetDefinitionIsValid = requestTimestampColumn?.type === "TEXT"
      && requestTimestampColumn?.notnull === 1
      && tableDefinition.includes("chk_hedge_deals_request_timestamp");

    if (!targetDefinitionIsValid) {
      throw new Error("Unsupported Hedge Deal Request Timestamp schema.");
    }

    return;
  }

  if (columnNames !== legacyColumns.join(",")) {
    throw new Error("Unsupported Hedge Deal Request Timestamp migration source schema.");
  }

  const originalRowCount = Number(
    sqlite.prepare("SELECT COUNT(*) AS count FROM hedge_deals").get().count
  );

  sqlite.exec("PRAGMA foreign_keys = OFF");

  try {
    sqlite.exec("BEGIN IMMEDIATE");
    sqlite.exec(`
      CREATE TABLE hedge_deals_request_timestamp_migrated
      (
          trade_id                    INTEGER PRIMARY KEY,
          trade_type                  TEXT    NOT NULL DEFAULT 'HEDGE_DEAL',
          request_timestamp           TEXT    NOT NULL,
          counterparty_id             INTEGER NOT NULL,
          trade_context_id        INTEGER,
          pricing_rule_id             INTEGER,
          transfer_rate               NUMERIC,
          analytical_pnl_quote_minor  INTEGER,
          analytical_pnl_quote_fraction_digits INTEGER,

          CONSTRAINT fk_hedge_deals_trade
              FOREIGN KEY (trade_id, trade_type)
                  REFERENCES trade_exposures (trade_id, trade_type)
                  ON UPDATE RESTRICT
                  ON DELETE RESTRICT,
          CONSTRAINT fk_hedge_deals_counterparty
              FOREIGN KEY (counterparty_id)
                  REFERENCES trading_counterparties (counterparty_id)
                  ON UPDATE RESTRICT
                  ON DELETE RESTRICT,
          CONSTRAINT fk_hedge_deals_trade_context
              FOREIGN KEY (trade_context_id)
                  REFERENCES trade_contexts (trade_context_id)
                  ON UPDATE RESTRICT
                  ON DELETE RESTRICT,
          CONSTRAINT fk_hedge_deals_pricing_rule_scope
              FOREIGN KEY (pricing_rule_id, counterparty_id, trade_context_id)
                  REFERENCES pricing_rules (pricing_rule_id, counterparty_id, trade_context_id)
                  ON UPDATE RESTRICT
                  ON DELETE RESTRICT,
          CONSTRAINT chk_hedge_deals_trade_type
              CHECK (trade_type = 'HEDGE_DEAL'),
          CONSTRAINT chk_hedge_deals_request_timestamp
              CHECK (
                  length(request_timestamp) = 24
                  AND request_timestamp GLOB '????-??-??T??:??:??.???Z'
                  AND strftime('%Y-%m-%dT%H:%M:%fZ', request_timestamp)
                      = request_timestamp
              ),
          CONSTRAINT chk_hedge_deals_pricing_context
              CHECK (pricing_rule_id IS NULL OR trade_context_id IS NOT NULL),
          CONSTRAINT chk_hedge_deals_transfer_rate
              CHECK (
                  transfer_rate IS NULL
                  OR (
                      typeof(transfer_rate) IN ('integer', 'real')
                      AND transfer_rate > 0
                  )
              ),
          CONSTRAINT chk_hedge_deals_analytical_pnl_quote
              CHECK (
                  (
                      analytical_pnl_quote_minor IS NULL
                      AND analytical_pnl_quote_fraction_digits IS NULL
                  )
                  OR (
                      typeof(analytical_pnl_quote_minor) = 'integer'
                      AND analytical_pnl_quote_minor
                          BETWEEN -9007199254740991 AND 9007199254740991
                      AND typeof(analytical_pnl_quote_fraction_digits) = 'integer'
                      AND analytical_pnl_quote_fraction_digits BETWEEN 0 AND 10
                  )
              )
      );

      INSERT INTO hedge_deals_request_timestamp_migrated
      (
          trade_id,
          trade_type,
          request_timestamp,
          counterparty_id,
          trade_context_id,
          pricing_rule_id,
          transfer_rate,
          analytical_pnl_quote_minor,
          analytical_pnl_quote_fraction_digits
      )
      SELECT
          d.trade_id,
          d.trade_type,
          e.execution_timestamp,
          d.counterparty_id,
          d.trade_context_id,
          d.pricing_rule_id,
          d.transfer_rate,
          d.analytical_pnl_quote_minor,
          d.analytical_pnl_quote_fraction_digits
      FROM hedge_deals d
      INNER JOIN trade_exposures e
        ON e.trade_id = d.trade_id AND e.trade_type = d.trade_type
      ORDER BY d.trade_id;

      DROP TABLE hedge_deals;
      ALTER TABLE hedge_deals_request_timestamp_migrated RENAME TO hedge_deals;

      CREATE INDEX idx_hedge_deals_counterparty
          ON hedge_deals (counterparty_id);
    `);

    const migratedRowCount = Number(
      sqlite.prepare("SELECT COUNT(*) AS count FROM hedge_deals").get().count
    );
    const foreignKeyViolations = sqlite.prepare("PRAGMA foreign_key_check").all();

    if (migratedRowCount !== originalRowCount) {
      throw new Error("Hedge Deal Request Timestamp migration did not preserve every row.");
    }

    if (foreignKeyViolations.length > 0) {
      throw new Error("Hedge Deal Request Timestamp migration produced foreign key violations.");
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

function ensureClientDealIndexes(sqlite) {
  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_client_deals_counterparty
        ON client_deals (counterparty_id);
    CREATE INDEX IF NOT EXISTS idx_client_deals_trade_context
        ON client_deals (trade_context_id);
    CREATE INDEX IF NOT EXISTS idx_client_deals_pricing_rule
        ON client_deals (pricing_rule_id);
  `);
}

function ensurePricingRuleClientDealReferenceIndex(sqlite) {
  sqlite.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_pricing_rules_client_deal_reference
        ON pricing_rules (pricing_rule_id, counterparty_id, trade_context_id);
  `);
}

function backfillInitialClientDealAttribution(sqlite) {
  const deal = sqlite.prepare(`
    SELECT
      d.trade_id,
      d.counterparty_id,
      e.trade_rate,
      e.base_ccy_amount_minor,
      e.base_ccy_fraction_digits,
      e.base_ccy_side AS side,
      e.ccy_pair_code,
      quote_ccy.fraction_digits AS quote_ccy_fraction_digits
    FROM client_deals d
    INNER JOIN trade_exposures e
      ON e.trade_id = d.trade_id AND e.trade_type = d.trade_type
    INNER JOIN trading_counterparties p ON p.counterparty_id = d.counterparty_id
    INNER JOIN external_counterparties external ON external.counterparty_id = p.counterparty_id
    INNER JOIN ccy_pair_options pair ON pair.ccy_pair_code = e.ccy_pair_code
    INNER JOIN ccy_options quote_ccy ON quote_ccy.ccy_code = pair.quote_ccy_code
    WHERE d.trade_context_id IS NULL
      AND d.pricing_rule_id IS NULL
      AND d.transfer_rate IS NULL
      AND d.analytical_pnl_quote_minor IS NULL
      AND d.analytical_pnl_quote_fraction_digits IS NULL
      AND external.counterparty_code_type = 'INN'
      AND external.counterparty_code = '7701234567'
      AND e.execution_timestamp = '2026-07-15T09:30:00.000Z'
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
    SELECT r.pricing_rule_id, r.trade_context_id
    FROM pricing_rules r
    WHERE r.pricing_rule_id = 3
      AND r.counterparty_id = ?
      AND r.ccy_pair_code = ?
    LIMIT 1
  `).get(deal.counterparty_id, deal.ccy_pair_code);

  if (!pricingRule) {
    return;
  }

  const transferRate = 1.1222;
  const analyticalPnlQuoteMinor = calculateAnalyticalPnlMinor({
    clientSide: deal.side,
    baseCcyAmountMinor: deal.base_ccy_amount_minor,
    baseCcyFractionDigits: deal.base_ccy_fraction_digits,
    tradeRate: deal.trade_rate,
    transferRate,
    quoteCcyFractionDigits: deal.quote_ccy_fraction_digits
  });

  sqlite.prepare(`
    UPDATE client_deals
    SET
      trade_context_id = ?,
      pricing_rule_id = ?,
      transfer_rate = ?,
      analytical_pnl_quote_minor = ?,
      analytical_pnl_quote_fraction_digits = ?
    WHERE trade_id = ?
      AND trade_context_id IS NULL
      AND pricing_rule_id IS NULL
      AND transfer_rate IS NULL
      AND analytical_pnl_quote_minor IS NULL
      AND analytical_pnl_quote_fraction_digits IS NULL
  `).run(
    pricingRule.trade_context_id,
    pricingRule.pricing_rule_id,
    transferRate,
    minorToSafeInteger(analyticalPnlQuoteMinor, "Analytical PnL Quote Minor"),
    deal.quote_ccy_fraction_digits,
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

function migrateLegacyTradeContextIds(sqlite) {
  const columns = sqlite.prepare("PRAGMA table_info(trade_contexts)").all();
  const columnByName = new Map(columns.map(column => [column.name, column]));
  const foreignKeys = sqlite.prepare("PRAGMA foreign_key_list(trade_contexts)").all();
  const idColumn = columnByName.get("trade_context_id");
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
    || String(columnByName.get("originating_system_id")?.type || "").toUpperCase() !== "TEXT"
    || columnByName.get("originating_system_id")?.notnull !== 1
    || !hasExpectedForeignKey("servicing_location_id", "servicing_locations", "servicing_location_id")
    || !hasExpectedForeignKey("accounting_system_id", "accounting_systems", "accounting_system_id")
    || !hasExpectedForeignKey("originating_system_id", "originating_systems", "originating_system_id");

  if (!requiresMigration) {
    return;
  }

  const preserveIntegerIds = String(idColumn?.type || "").toUpperCase() === "INTEGER";
  const legacyDefaultModeExpression = columnByName.has("default_position_management_mode")
    ? `CASE
        WHEN default_position_management_mode IN ('MANUAL', 'AUTO')
          THEN default_position_management_mode
        ELSE 'MANUAL'
      END`
    : "'MANUAL'";
  const legacyAdmissionColumn = columnByName.has("auto_management_admission_mode")
    ? "auto_management_admission_mode"
    : columnByName.has("auto_management_admission_policy")
      ? "auto_management_admission_policy"
      : null;
  const legacyAdmissionModeExpression = legacyAdmissionColumn
    ? `CASE
        WHEN ${legacyAdmissionColumn} IN
          ('AUTO_IF_ELIGIBLE', 'REVIEW_REQUIRED')
          THEN ${legacyAdmissionColumn}
        WHEN ${legacyDefaultModeExpression} = 'AUTO' THEN 'AUTO_IF_ELIGIBLE'
        ELSE 'REVIEW_REQUIRED'
      END`
    : `CASE
        WHEN ${legacyDefaultModeExpression} = 'AUTO' THEN 'AUTO_IF_ELIGIBLE'
        ELSE 'REVIEW_REQUIRED'
      END`;
  const contextInsertColumns = `${preserveIntegerIds ? "trade_context_id, " : ""}`
    + "servicing_location_id, accounting_system_id, originating_system_id, "
    + "auto_management_admission_mode";
  const contextSelectColumns = `${preserveIntegerIds ? "trade_context_id, " : ""}`
    + "servicing_location_id, accounting_system_id, originating_system_id, "
    + legacyAdmissionModeExpression;
  const pricingRuleColumns = new Set(
    sqlite.prepare("PRAGMA table_info(pricing_rules)").all()
      .map(column => column.name)
  );
  const admissionModeOverrideExpression = pricingRuleColumns
    .has("auto_management_admission_mode_override")
    ? "rule.auto_management_admission_mode_override"
    : "NULL";

  sqlite.exec("PRAGMA foreign_keys = OFF");

  try {
    sqlite.exec("BEGIN IMMEDIATE");
    sqlite.exec(`
      DROP TRIGGER IF EXISTS trg_originating_systems_lock_pricing_mode_while_referenced;
    `);
    sqlite.exec(`
      CREATE TABLE trade_contexts_migrated
      (
          trade_context_id  INTEGER PRIMARY KEY,
          servicing_location_id TEXT NOT NULL,
          accounting_system_id  TEXT,
          originating_system_id   TEXT NOT NULL,
          auto_management_admission_mode TEXT NOT NULL DEFAULT 'REVIEW_REQUIRED',

          CONSTRAINT fk_trade_contexts_servicing_location
              FOREIGN KEY (servicing_location_id)
                  REFERENCES servicing_locations (servicing_location_id)
                  ON UPDATE RESTRICT
                  ON DELETE RESTRICT,
          CONSTRAINT fk_trade_contexts_accounting_system
              FOREIGN KEY (accounting_system_id)
                  REFERENCES accounting_systems (accounting_system_id)
                  ON UPDATE RESTRICT
                  ON DELETE RESTRICT,
          CONSTRAINT fk_trade_contexts_originating_system
              FOREIGN KEY (originating_system_id)
                  REFERENCES originating_systems (originating_system_id)
                  ON UPDATE RESTRICT
                  ON DELETE RESTRICT,
          CONSTRAINT chk_trade_contexts_auto_management_admission_mode
              CHECK (
                  auto_management_admission_mode IN
                      ('AUTO_IF_ELIGIBLE', 'REVIEW_REQUIRED')
              )
      );

      INSERT INTO trade_contexts_migrated
        (${contextInsertColumns})
      SELECT ${contextSelectColumns}
      FROM trade_contexts
      ORDER BY trade_context_id;

      CREATE TEMP TABLE trade_context_id_map
      (
          legacy_trade_context_id TEXT PRIMARY KEY,
          trade_context_id        INTEGER NOT NULL UNIQUE
      );

      INSERT INTO trade_context_id_map
        (legacy_trade_context_id, trade_context_id)
      SELECT legacy.trade_context_id, migrated.trade_context_id
      FROM trade_contexts legacy
      INNER JOIN trade_contexts_migrated migrated
        ON migrated.servicing_location_id = legacy.servicing_location_id
        AND migrated.accounting_system_id IS legacy.accounting_system_id
        AND migrated.originating_system_id = legacy.originating_system_id;

      UPDATE trading_counterparty_trade_contexts
      SET trade_context_id =
      (
        SELECT context_map.trade_context_id
        FROM trade_context_id_map context_map
        WHERE context_map.legacy_trade_context_id =
          trading_counterparty_trade_contexts.trade_context_id
      )
      WHERE EXISTS
      (
        SELECT 1
        FROM trade_context_id_map context_map
        WHERE context_map.legacy_trade_context_id =
          trading_counterparty_trade_contexts.trade_context_id
      );

      CREATE TABLE pricing_rules_migrated
      (
          pricing_rule_id      INTEGER PRIMARY KEY,
          counterparty_id             INTEGER NOT NULL,
          trade_context_id INTEGER NOT NULL,
          ccy_pair_code        TEXT    NOT NULL,
          margin_percent       REAL    NOT NULL,
          auto_management_admission_mode_override TEXT,

          CONSTRAINT fk_pricing_rules_counterparty
              FOREIGN KEY (counterparty_id)
                  REFERENCES trading_counterparties (counterparty_id)
                  ON UPDATE RESTRICT
                  ON DELETE RESTRICT,
          CONSTRAINT fk_pricing_rules_trade_context
              FOREIGN KEY (trade_context_id)
                  REFERENCES trade_contexts (trade_context_id)
                  ON UPDATE RESTRICT
                  ON DELETE RESTRICT,
          CONSTRAINT fk_pricing_rules_ccy_pair
              FOREIGN KEY (ccy_pair_code)
                  REFERENCES ccy_pair_options (ccy_pair_code)
                  ON UPDATE RESTRICT
                  ON DELETE RESTRICT,
          CONSTRAINT uq_pricing_rules_scope
              UNIQUE (counterparty_id, trade_context_id, ccy_pair_code),
          CONSTRAINT chk_pricing_rules_margin
              CHECK (margin_percent >= 0 AND margin_percent < 100),
          CONSTRAINT chk_pricing_rules_auto_management_admission_mode_override
              CHECK (
                  auto_management_admission_mode_override IS NULL
                  OR auto_management_admission_mode_override = 'REVIEW_REQUIRED'
              )
      );

      INSERT INTO pricing_rules_migrated
        (
          pricing_rule_id,
          counterparty_id,
          trade_context_id,
          ccy_pair_code,
          margin_percent,
          auto_management_admission_mode_override
        )
      SELECT
        rule.pricing_rule_id,
        rule.counterparty_id,
        context_map.trade_context_id,
        rule.ccy_pair_code,
        rule.margin_percent,
        ${admissionModeOverrideExpression}
      FROM pricing_rules rule
      INNER JOIN trade_context_id_map context_map
        ON context_map.legacy_trade_context_id = rule.trade_context_id;

      DROP TABLE pricing_rules;
      DROP TABLE trade_contexts;
      ALTER TABLE trade_contexts_migrated RENAME TO trade_contexts;
      ALTER TABLE pricing_rules_migrated RENAME TO pricing_rules;

      CREATE UNIQUE INDEX uq_trade_contexts_components
          ON trade_contexts
          (
              servicing_location_id,
              COALESCE(accounting_system_id, 'NOT_APPLICABLE'),
              originating_system_id
          );
      CREATE INDEX idx_trade_contexts_servicing_location
          ON trade_contexts (servicing_location_id);
      CREATE INDEX idx_trade_contexts_accounting_system
          ON trade_contexts (accounting_system_id);
      CREATE INDEX idx_trade_contexts_originating_system
          ON trade_contexts (originating_system_id);
      CREATE INDEX idx_pricing_rules_counterparty
          ON pricing_rules (counterparty_id);
      CREATE INDEX idx_pricing_rules_trade_context
          ON pricing_rules (trade_context_id);
      CREATE INDEX idx_pricing_rules_ccy_pair
          ON pricing_rules (ccy_pair_code);
      CREATE UNIQUE INDEX uq_pricing_rules_hedge_quick_mode_reference
          ON pricing_rules (pricing_rule_id, ccy_pair_code);
      CREATE UNIQUE INDEX uq_pricing_rules_hedge_quick_mode_counterparty_reference
          ON pricing_rules (pricing_rule_id, counterparty_id, ccy_pair_code);

      CREATE TRIGGER trg_originating_systems_lock_pricing_mode_while_referenced
      BEFORE UPDATE OF pricing_mode ON originating_systems
      FOR EACH ROW
      WHEN NEW.pricing_mode <> OLD.pricing_mode
          AND EXISTS
          (
              SELECT 1
              FROM trade_contexts context
              WHERE context.originating_system_id = OLD.originating_system_id
          )
      BEGIN
          SELECT RAISE(ABORT, 'an Originating System used by Trade Context cannot change Pricing Mode');
      END;

      DROP TABLE trade_context_id_map;
    `);

    const foreignKeyViolations = sqlite.prepare("PRAGMA foreign_key_check").all();

    if (foreignKeyViolations.length > 0) {
      throw new Error("Trade Context ID migration produced foreign key violations.");
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

function migrateOriginatingSystemsShape(sqlite) {
  const tableDefinition = sqlite.prepare(`
    SELECT sql
    FROM sqlite_master
    WHERE type = 'table' AND name = 'originating_systems'
  `).get()?.sql || "";

  const requiresMigration = !tableDefinition.includes("BETWEEN 2 AND 30")
    || !tableDefinition.includes("BETWEEN 1 AND 50")
    || !tableDefinition.includes("length('DEALER_APPROVED')");

  if (!requiresMigration) {
    return;
  }

  const invalidRecord = sqlite.prepare(`
    SELECT originating_system_id
    FROM originating_systems
    WHERE length(originating_system_id) > ?
      OR length(trim(name)) NOT BETWEEN 1 AND ?
      OR pricing_mode NOT IN ('AUTO_PRICED', 'DEALER_PRICED', 'DEALER_APPROVED')
      OR length(pricing_mode) > ?
      OR is_active NOT IN (0, 1)
    LIMIT 1
  `).get(
    ORIGINATING_SYSTEM_ID_MAX_LENGTH,
    ORIGINATING_SYSTEM_NAME_MAX_LENGTH,
    ORIGINATING_SYSTEM_PRICING_MODE_MAX_LENGTH
  );

  if (invalidRecord) {
    throw new Error(`Originating System ${invalidRecord.originating_system_id} exceeds the configured constraint.`);
  }

  sqlite.exec("PRAGMA foreign_keys = OFF");

  try {
    sqlite.exec("BEGIN IMMEDIATE");
    sqlite.exec(`
      CREATE TABLE originating_systems_migrated
      (
          originating_system_id TEXT    PRIMARY KEY,
          name                TEXT    NOT NULL,
          pricing_mode        TEXT    NOT NULL,
          is_active           INTEGER NOT NULL DEFAULT 1,

          CONSTRAINT chk_originating_systems_id
              CHECK (
                  length(originating_system_id) BETWEEN 2 AND 30
                  AND originating_system_id = upper(originating_system_id)
                  AND originating_system_id NOT GLOB '*[^A-Z0-9_-]*'
              ),
          CONSTRAINT chk_originating_systems_name
              CHECK (length(trim(name)) BETWEEN 1 AND 50),
          CONSTRAINT chk_originating_systems_pricing_mode
              CHECK (
                  pricing_mode IN ('AUTO_PRICED', 'DEALER_PRICED', 'DEALER_APPROVED')
                  AND length(pricing_mode) <= length('DEALER_APPROVED')
              ),
          CONSTRAINT chk_originating_systems_active
              CHECK (is_active IN (0, 1))
      );

      INSERT INTO originating_systems_migrated
        (originating_system_id, name, pricing_mode, is_active)
      SELECT originating_system_id, name, pricing_mode, is_active
      FROM originating_systems;

      DROP TABLE originating_systems;
      ALTER TABLE originating_systems_migrated RENAME TO originating_systems;
    `);

    const foreignKeyViolations = sqlite.prepare("PRAGMA foreign_key_check").all();

    if (foreignKeyViolations.length > 0) {
      throw new Error("Originating System migration produced foreign key violations.");
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

function migrateTradingCounterpartyModel(sqlite) {
  const columns = tableColumnNames(sqlite, "trading_counterparties");

  if (!columns.has("counterparty_type") && !columns.has("counterparty_code") && !columns.has("counterparty_code_type")) {
    return;
  }

  const invalidRecord = sqlite.prepare(`
    SELECT counterparty_id
    FROM trading_counterparties
    WHERE counterparty_type NOT IN ('CLIENT', 'HEDGE_COUNTERPARTY', 'EXTERNAL_COUNTERPARTY', 'INTERNAL_DESK')
      OR counterparty_code_type NOT IN ('INN', 'OTHER', 'FRONT_SYSTEM_FOLDER_ID')
      OR length(counterparty_code) > ?
      OR (
        counterparty_code_type = 'INN'
        AND (length(counterparty_code) NOT BETWEEN 10 AND 12 OR counterparty_code GLOB '*[^0-9]*')
      )
      OR (
        counterparty_code_type IN ('OTHER', 'FRONT_SYSTEM_FOLDER_ID')
        AND (
          length(counterparty_code) NOT BETWEEN 2 AND ?
          OR counterparty_code != upper(counterparty_code)
          OR counterparty_code GLOB '*[^A-Z0-9_-]*'
        )
      )
      OR length(counterparty_name) NOT BETWEEN 1 AND ?
      OR length(trim(counterparty_name)) = 0
      OR is_active NOT IN (0, 1)
    LIMIT 1
  `).get(COUNTERPARTY_CODE_MAX_LENGTH, COUNTERPARTY_CODE_MAX_LENGTH, COUNTERPARTY_NAME_MAX_LENGTH);

  if (invalidRecord) {
    throw new Error(`Trading Counterparty ${invalidRecord.counterparty_id} cannot be migrated to the profile model.`);
  }

  sqlite.exec("PRAGMA foreign_keys = OFF");

  try {
    sqlite.exec("BEGIN IMMEDIATE");
    dropTradingCounterpartyProfileIntegrityTriggers(sqlite);
    sqlite.exec(`
      DELETE FROM trading_counterparty_roles;
      DELETE FROM external_counterparties;
      DELETE FROM internal_units;

      CREATE TABLE trading_counterparties_migrated
      (
          counterparty_id    INTEGER PRIMARY KEY,
          counterparty_scope TEXT    NOT NULL,
          counterparty_name  TEXT    NOT NULL,
          is_active          INTEGER NOT NULL DEFAULT 1,

          CONSTRAINT chk_trading_counterparties_scope
              CHECK (counterparty_scope IN ('EXTERNAL', 'INTERNAL')),
          CONSTRAINT chk_trading_counterparties_name
              CHECK (length(counterparty_name) BETWEEN 1 AND 200 AND length(trim(counterparty_name)) > 0),
          CONSTRAINT chk_trading_counterparties_active
              CHECK (is_active IN (0, 1))
      );

      INSERT INTO trading_counterparties_migrated
        (counterparty_id, counterparty_scope, counterparty_name, is_active)
      SELECT
        counterparty_id,
        CASE
          WHEN counterparty_type = 'INTERNAL_DESK'
            OR counterparty_code_type = 'FRONT_SYSTEM_FOLDER_ID'
          THEN 'INTERNAL'
          ELSE 'EXTERNAL'
        END,
        counterparty_name,
        is_active
      FROM trading_counterparties;

      INSERT INTO external_counterparties
        (counterparty_id, counterparty_code, counterparty_code_type, external_counterparty_kind)
      SELECT
        counterparty_id,
        counterparty_code,
        CASE WHEN counterparty_code_type = 'INN' THEN 'INN' ELSE 'OTHER' END,
        CASE
          WHEN counterparty_code_type = 'INN' AND upper(counterparty_name) LIKE '%BANK%' THEN 'BANK'
          ELSE 'CORPORATE'
        END
      FROM trading_counterparties
      WHERE counterparty_type <> 'INTERNAL_DESK'
        AND counterparty_code_type <> 'FRONT_SYSTEM_FOLDER_ID';

      INSERT INTO internal_units (counterparty_id, unit_code, unit_type)
      SELECT counterparty_id, counterparty_code, 'DESK'
      FROM trading_counterparties
      WHERE counterparty_type = 'INTERNAL_DESK'
         OR counterparty_code_type = 'FRONT_SYSTEM_FOLDER_ID';

      INSERT INTO trading_counterparty_roles (counterparty_id, role_code)
      SELECT
        counterparty_id,
        CASE WHEN counterparty_type = 'CLIENT' THEN 'CLIENT' ELSE 'HEDGE_COUNTERPARTY' END
      FROM trading_counterparties;

      DROP TABLE trading_counterparties;
      ALTER TABLE trading_counterparties_migrated RENAME TO trading_counterparties;
    `);

    const foreignKeyViolations = sqlite.prepare("PRAGMA foreign_key_check").all();

    if (foreignKeyViolations.length > 0) {
      throw new Error("Trading Counterparty profile migration produced foreign key violations.");
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

function dropTradingCounterpartyProfileIntegrityTriggers(sqlite) {
  sqlite.exec(`
    DROP TRIGGER IF EXISTS trg_external_counterparties_exclusive_profile_insert;
    DROP TRIGGER IF EXISTS trg_external_counterparties_exclusive_profile_update;
    DROP TRIGGER IF EXISTS trg_internal_units_exclusive_profile_insert;
    DROP TRIGGER IF EXISTS trg_internal_units_exclusive_profile_update;
    DROP TRIGGER IF EXISTS trg_trading_counterparties_immutable_scope;
    DROP TRIGGER IF EXISTS trg_external_counterparties_preserve_profile;
    DROP TRIGGER IF EXISTS trg_internal_units_preserve_profile;
  `);
}

function tradingCounterpartyProfileIntegrityViolation(sqlite) {
  if (!sqliteTableExists(sqlite, "trading_counterparties")
    || !sqliteTableExists(sqlite, "external_counterparties")
    || !sqliteTableExists(sqlite, "internal_units")) {
    return null;
  }

  const hasScope = tableColumnNames(sqlite, "trading_counterparties").has("counterparty_scope");
  const scopeProjection = hasScope
    ? "counterparty.counterparty_scope"
    : "NULL";
  const scopeConstraint = hasScope
    ? `
      OR counterparty.counterparty_scope IS NULL
      OR counterparty.counterparty_scope NOT IN ('EXTERNAL', 'INTERNAL')
      OR (counterparty.counterparty_scope = 'EXTERNAL' AND external.counterparty_id IS NULL)
      OR (counterparty.counterparty_scope = 'EXTERNAL' AND internal.counterparty_id IS NOT NULL)
      OR (counterparty.counterparty_scope = 'INTERNAL' AND internal.counterparty_id IS NULL)
      OR (counterparty.counterparty_scope = 'INTERNAL' AND external.counterparty_id IS NOT NULL)
    `
    : "";

  return sqlite.prepare(`
    SELECT
      counterparty.counterparty_id AS counterpartyId,
      ${scopeProjection} AS counterpartyScope,
      external.counterparty_id IS NOT NULL AS hasExternalProfile,
      internal.counterparty_id IS NOT NULL AS hasInternalProfile
    FROM trading_counterparties counterparty
    LEFT JOIN external_counterparties external
      ON external.counterparty_id = counterparty.counterparty_id
    LEFT JOIN internal_units internal
      ON internal.counterparty_id = counterparty.counterparty_id
    WHERE (external.counterparty_id IS NULL AND internal.counterparty_id IS NULL)
      OR (external.counterparty_id IS NOT NULL AND internal.counterparty_id IS NOT NULL)
      ${scopeConstraint}
    LIMIT 1
  `).get() || null;
}

function assertTradingCounterpartyProfileConsistency(sqlite) {
  const violation = tradingCounterpartyProfileIntegrityViolation(sqlite);

  if (!violation) {
    return;
  }

  throw new Error(
    `Trading Counterparty ${violation.counterpartyId} must have exactly one profile matching its Scope.`
  );
}

function migrateTradingCounterpartyScope(sqlite) {
  if (!sqliteTableExists(sqlite, "trading_counterparties")) {
    return;
  }

  if (tableColumnNames(sqlite, "trading_counterparties").has("counterparty_scope")) {
    assertTradingCounterpartyProfileConsistency(sqlite);
    return;
  }

  assertTradingCounterpartyProfileConsistency(sqlite);
  sqlite.exec("PRAGMA foreign_keys = OFF");

  try {
    sqlite.exec("BEGIN IMMEDIATE");
    dropTradingCounterpartyProfileIntegrityTriggers(sqlite);
    sqlite.exec(`
      CREATE TABLE trading_counterparties_with_scope
      (
          counterparty_id    INTEGER PRIMARY KEY,
          counterparty_scope TEXT    NOT NULL,
          counterparty_name  TEXT    NOT NULL,
          is_active          INTEGER NOT NULL DEFAULT 1,

          CONSTRAINT chk_trading_counterparties_scope
              CHECK (counterparty_scope IN ('EXTERNAL', 'INTERNAL')),
          CONSTRAINT chk_trading_counterparties_name
              CHECK (length(counterparty_name) BETWEEN 1 AND 200 AND length(trim(counterparty_name)) > 0),
          CONSTRAINT chk_trading_counterparties_active
              CHECK (is_active IN (0, 1))
      );

      INSERT INTO trading_counterparties_with_scope
        (counterparty_id, counterparty_scope, counterparty_name, is_active)
      SELECT
        counterparty.counterparty_id,
        CASE
          WHEN external.counterparty_id IS NOT NULL THEN 'EXTERNAL'
          ELSE 'INTERNAL'
        END,
        counterparty.counterparty_name,
        counterparty.is_active
      FROM trading_counterparties counterparty
      LEFT JOIN external_counterparties external
        ON external.counterparty_id = counterparty.counterparty_id;

      DROP TABLE trading_counterparties;
      ALTER TABLE trading_counterparties_with_scope RENAME TO trading_counterparties;
    `);

    const foreignKeyViolations = sqlite.prepare("PRAGMA foreign_key_check").all();

    if (foreignKeyViolations.length > 0) {
      throw new Error("Trading Counterparty Scope migration produced foreign key violations.");
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

function migrateTradingCounterpartyTerminology(sqlite) {
  const tableExists = tableName => Boolean(sqlite.prepare(`
    SELECT 1 AS present
    FROM sqlite_master
    WHERE type = 'table' AND name = ?
  `).get(tableName));
  const legacyParentExists = tableExists("trading_parties");
  const currentParentExists = tableExists("trading_counterparties");

  if (!legacyParentExists) {
    return;
  }

  if (currentParentExists) {
    throw new Error(
      "Both legacy and current Trading Counterparty tables exist; automatic migration is ambiguous."
    );
  }

  const renameTable = (legacyName, currentName) => {
    if (tableExists(legacyName) && !tableExists(currentName)) {
      sqlite.exec(`ALTER TABLE ${legacyName} RENAME TO ${currentName}`);
    }
  };
  const renameColumn = (tableName, legacyName, currentName) => {
    const columns = tableColumnNames(sqlite, tableName);

    if (columns.has(legacyName) && !columns.has(currentName)) {
      sqlite.exec(`ALTER TABLE ${tableName} RENAME COLUMN ${legacyName} TO ${currentName}`);
    }
  };

  sqlite.exec("PRAGMA foreign_keys = OFF");

  try {
    sqlite.exec("BEGIN IMMEDIATE");

    const legacyTriggers = sqlite.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'trigger'
        AND (lower(name) LIKE '%party%' OR lower(sql) LIKE '%party%')
    `).all();
    const legacyIndexes = sqlite.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'index'
        AND sql IS NOT NULL
        AND (lower(name) LIKE '%party%' OR lower(sql) LIKE '%party%')
    `).all();

    legacyTriggers.forEach(({ name }) => sqlite.exec(`DROP TRIGGER ${name}`));
    legacyIndexes.forEach(({ name }) => sqlite.exec(`DROP INDEX ${name}`));

    renameTable("trading_parties", "trading_counterparties");
    renameTable("external_parties", "external_counterparties");
    renameTable("trading_party_roles", "trading_counterparty_roles");

    [
      "trading_counterparties",
      "external_counterparties",
      "internal_units",
      "trading_counterparty_roles",
      "pricing_rules",
      "hedge_quick_mode_settings",
      "client_deals",
      "hedge_deals"
    ].forEach(tableName => {
      if (tableExists(tableName)) {
        renameColumn(tableName, "party_id", "counterparty_id");
      }
    });

    if (tableExists("trading_counterparties")) {
      renameColumn("trading_counterparties", "party_name", "counterparty_name");
      renameColumn("trading_counterparties", "party_type", "counterparty_type");
      renameColumn("trading_counterparties", "party_code", "counterparty_code");
      renameColumn("trading_counterparties", "party_code_type", "counterparty_code_type");
    }

    if (tableExists("external_counterparties")) {
      renameColumn("external_counterparties", "party_code", "counterparty_code");
      renameColumn("external_counterparties", "party_code_type", "counterparty_code_type");
      renameColumn(
        "external_counterparties",
        "external_party_kind",
        "external_counterparty_kind"
      );
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

function migrateExternalCounterpartyKinds(sqlite) {
  const tableDefinition = sqlite.prepare(`
    SELECT sql
    FROM sqlite_master
    WHERE type = 'table' AND name = 'external_counterparties'
  `).get()?.sql || "";
  const requiresMigration = tableDefinition.includes("'ORGANIZATION'")
    || tableDefinition.includes("'FUND'")
    || !tableDefinition.includes("'CORPORATE'")
    || !tableDefinition.includes("'NON_BANK_FINANCIAL_INSTITUTION'");

  if (!tableDefinition || !requiresMigration) {
    return;
  }

  const invalidRecord = sqlite.prepare(`
    SELECT counterparty_id
    FROM external_counterparties
    WHERE external_counterparty_kind NOT IN
      (
        'ORGANIZATION',
        'FUND',
        'CORPORATE',
        'INDIVIDUAL',
        'BANK',
        'NON_BANK_FINANCIAL_INSTITUTION',
        'OTHER'
      )
    LIMIT 1
  `).get();

  if (invalidRecord) {
    throw new Error(`External Counterparty ${invalidRecord.counterparty_id} has an unsupported type.`);
  }

  sqlite.exec("PRAGMA foreign_keys = OFF");

  try {
    sqlite.exec("BEGIN IMMEDIATE");
    sqlite.exec(`
      DROP TRIGGER IF EXISTS trg_external_counterparties_exclusive_profile_insert;
      DROP TRIGGER IF EXISTS trg_external_counterparties_exclusive_profile_update;
      DROP TRIGGER IF EXISTS trg_internal_units_exclusive_profile_insert;
      DROP TRIGGER IF EXISTS trg_internal_units_exclusive_profile_update;

      CREATE TABLE external_counterparties_migrated
      (
          counterparty_id            INTEGER PRIMARY KEY,
          counterparty_code          TEXT    NOT NULL,
          counterparty_code_type     TEXT    NOT NULL,
          external_counterparty_kind TEXT    NOT NULL DEFAULT 'CORPORATE',

          CONSTRAINT fk_external_counterparties_counterparty
              FOREIGN KEY (counterparty_id)
                  REFERENCES trading_counterparties (counterparty_id)
                  ON UPDATE RESTRICT
                  ON DELETE CASCADE,
          CONSTRAINT uq_external_counterparties_code
              UNIQUE (counterparty_code_type, counterparty_code),
          CONSTRAINT chk_external_counterparties_code_type
              CHECK (counterparty_code_type IN ('INN', 'OTHER')),
          CONSTRAINT chk_external_counterparties_code
              CHECK (
                  (
                      counterparty_code_type = 'INN'
                      AND length(counterparty_code) BETWEEN 10 AND 12
                      AND counterparty_code NOT GLOB '*[^0-9]*'
                  )
                  OR
                  (
                      counterparty_code_type = 'OTHER'
                      AND length(counterparty_code) BETWEEN 2 AND 20
                      AND counterparty_code = upper(counterparty_code)
                      AND counterparty_code NOT GLOB '*[^A-Z0-9_-]*'
                  )
              ),
          CONSTRAINT chk_external_counterparties_kind
              CHECK (
                  external_counterparty_kind IN
                  (
                      'CORPORATE',
                      'INDIVIDUAL',
                      'BANK',
                      'NON_BANK_FINANCIAL_INSTITUTION',
                      'OTHER'
                  )
              )
      );

      INSERT INTO external_counterparties_migrated
        (counterparty_id, counterparty_code, counterparty_code_type, external_counterparty_kind)
      SELECT
        counterparty_id,
        counterparty_code,
        counterparty_code_type,
        CASE external_counterparty_kind
          WHEN 'ORGANIZATION' THEN 'CORPORATE'
          WHEN 'FUND' THEN 'NON_BANK_FINANCIAL_INSTITUTION'
          ELSE external_counterparty_kind
        END
      FROM external_counterparties;

      DROP TABLE external_counterparties;
      ALTER TABLE external_counterparties_migrated RENAME TO external_counterparties;
    `);

    const foreignKeyViolations = sqlite.prepare("PRAGMA foreign_key_check").all();

    if (foreignKeyViolations.length > 0) {
      throw new Error("External Counterparty type migration produced foreign key violations.");
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

function rebuildLegacyCounterpartyConstraintNames(sqlite) {
  const targetTables = [
    "trading_counterparties",
    "external_counterparties",
    "internal_units",
    "trading_counterparty_roles",
    "pricing_rules",
    "hedge_quick_mode_settings",
    "client_deals",
    "hedge_deals"
  ];
  const legacyTerm = /(?<!counter)part(?:y|ies)/i;
  const tablesToRebuild = targetTables.filter(tableName => {
    const definition = sqlite.prepare(`
      SELECT sql
      FROM sqlite_master
      WHERE type = 'table' AND name = ?
    `).get(tableName)?.sql || "";

    return legacyTerm.test(definition);
  });

  if (tablesToRebuild.length === 0) {
    return;
  }

  const schemaSource = fs.readFileSync(SCHEMA_PATH, "utf8");
  const tableDefinition = tableName => {
    const escapedName = tableName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = schemaSource.match(new RegExp(
      `CREATE TABLE IF NOT EXISTS ${escapedName}\\s*\\([\\s\\S]*?\\r?\\n\\);`
    ));

    if (!match) {
      throw new Error(`Schema definition for ${tableName} was not found.`);
    }

    return match[0];
  };

  sqlite.exec("PRAGMA foreign_keys = OFF");

  try {
    sqlite.exec("BEGIN IMMEDIATE");

    const relatedTriggers = sqlite.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'trigger'
        AND (
          lower(sql) LIKE '%trading_counterpart%'
          OR lower(sql) LIKE '%counterparty_id%'
        )
    `).all();

    relatedTriggers.forEach(({ name }) => sqlite.exec(`DROP TRIGGER ${name}`));

    tablesToRebuild.forEach(tableName => {
      const migratedTableName = `__counterparty_migrated_${tableName}`;
      const columns = [...tableColumnNames(sqlite, tableName)];
      const definition = tableDefinition(tableName).replace(
        `CREATE TABLE IF NOT EXISTS ${tableName}`,
        `CREATE TABLE ${migratedTableName}`
      );
      const columnList = columns.join(", ");

      sqlite.exec(definition);
      sqlite.exec(`
        INSERT INTO ${migratedTableName} (${columnList})
        SELECT ${columnList}
        FROM ${tableName};
        DROP TABLE ${tableName};
        ALTER TABLE ${migratedTableName} RENAME TO ${tableName};
      `);
    });

    sqlite.exec(schemaSource);

    const foreignKeyViolations = sqlite.prepare("PRAGMA foreign_key_check").all();

    if (foreignKeyViolations.length > 0) {
      throw new Error("Trading Counterparty constraint migration produced foreign key violations.");
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

function seedInitialOriginatingSystems(sqlite) {
  sqlite.exec(`
    INSERT INTO originating_systems
      (originating_system_id, name, pricing_mode, is_active)
    VALUES
      ('CLICK_TRADE_EFX', 'Click Trade eFX', 'AUTO_PRICED', 1),
      ('RFQ', 'Request for Quote', 'DEALER_APPROVED', 1),
      ('MANUAL_CLIENT_DEAL_ENTRY', 'Manual Client Deal Entry', 'DEALER_PRICED', 1);
  `);
}

function seedInitialTradeContexts(sqlite) {
  sqlite.exec(`
    INSERT INTO trade_contexts
      (
        servicing_location_id,
        accounting_system_id,
        originating_system_id,
        auto_management_admission_mode
      )
    VALUES
      ('002', 'AFINA', 'CLICK_TRADE_EFX', 'AUTO_IF_ELIGIBLE'),
      ('002', 'AFINA', 'RFQ', 'REVIEW_REQUIRED'),
      ('002', 'CTF3', 'MANUAL_CLIENT_DEAL_ENTRY', 'REVIEW_REQUIRED'),
      ('1234', 'AFINA', 'RFQ', 'REVIEW_REQUIRED'),
      ('001', 'CTF3', 'CLICK_TRADE_EFX', 'AUTO_IF_ELIGIBLE');
  `);
}

function seedInitialTradingCounterparties(sqlite) {
  sqlite.exec(`
    INSERT INTO trading_counterparties
      (counterparty_scope, counterparty_name, is_active)
    VALUES
      ('EXTERNAL', 'Romashka Company', 1),
      ('EXTERNAL', 'Vasilek Company', 1),
      ('EXTERNAL', 'Gladiolus Company', 1),
      ('EXTERNAL', 'Aurora Bank', 1),
      ('INTERNAL', 'Treasury Trading Desk', 1);

    WITH seed (counterparty_name, counterparty_code, counterparty_code_type, external_counterparty_kind, role_code) AS
    (
      VALUES
        ('Romashka Company', '7701234567', 'INN', 'CORPORATE', 'CLIENT'),
        ('Vasilek Company', '7812345678', 'INN', 'CORPORATE', 'CLIENT'),
        ('Gladiolus Company', '5409876543', 'INN', 'CORPORATE', 'CLIENT'),
        ('Aurora Bank', '7707000001', 'INN', 'BANK', 'HEDGE_COUNTERPARTY')
    )
    INSERT INTO external_counterparties (counterparty_id, counterparty_code, counterparty_code_type, external_counterparty_kind)
    SELECT counterparty.counterparty_id, seed.counterparty_code, seed.counterparty_code_type, seed.external_counterparty_kind
    FROM seed
    INNER JOIN trading_counterparties counterparty ON counterparty.counterparty_name = seed.counterparty_name;

    WITH seed (counterparty_name, role_code) AS
    (
      VALUES
        ('Romashka Company', 'CLIENT'),
        ('Vasilek Company', 'CLIENT'),
        ('Gladiolus Company', 'CLIENT'),
        ('Aurora Bank', 'HEDGE_COUNTERPARTY'),
        ('Treasury Trading Desk', 'HEDGE_COUNTERPARTY')
    )
    INSERT INTO trading_counterparty_roles (counterparty_id, role_code)
    SELECT counterparty.counterparty_id, seed.role_code
    FROM seed
    INNER JOIN trading_counterparties counterparty ON counterparty.counterparty_name = seed.counterparty_name;

    INSERT INTO internal_units (counterparty_id, unit_code, unit_type)
    SELECT counterparty_id, 'IB_FX', 'DESK'
    FROM trading_counterparties
    WHERE counterparty_name = 'Treasury Trading Desk';
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
    ["7707000001", "002", "CTF3", "MANUAL_CLIENT_DEAL_ENTRY", "EUR_USD", 0.03],
    ["7707000001", "002", "AFINA", "CLICK_TRADE_EFX", "EUR_USD", 0.03]
  ];
  const resolveScope = sqlite.prepare(`
    SELECT
      p.counterparty_id AS counterpartyId,
      e.trade_context_id AS tradeContextId,
      pair.ccy_pair_code AS ccyPairCode
    FROM trading_counterparties p
    INNER JOIN external_counterparties external ON external.counterparty_id = p.counterparty_id
    INNER JOIN trade_contexts e
      ON e.servicing_location_id = ?
      AND COALESCE(e.accounting_system_id, 'NOT_APPLICABLE') = ?
      AND e.originating_system_id = ?
    INNER JOIN ccy_pair_options pair ON pair.ccy_pair_code = ?
    WHERE external.counterparty_code_type = 'INN' AND external.counterparty_code = ?
  `);
  const attachContext = sqlite.prepare(`
    INSERT OR IGNORE INTO trading_counterparty_trade_contexts
      (counterparty_id, trade_context_id)
    VALUES (?, ?)
  `);
  const insertRule = sqlite.prepare(`
    INSERT OR IGNORE INTO pricing_rules
      (counterparty_id, trade_context_id, ccy_pair_code, margin_percent)
    VALUES (?, ?, ?, ?)
  `);

  runInImmediateTransaction(sqlite, () => {
    rules.forEach(([
      counterpartyCode,
      servicingLocationId,
      accountingSystemId,
      originatingSystemId,
      ccyPairCode,
      marginPercent
    ]) => {
      const scope = resolveScope.get(
        servicingLocationId,
        accountingSystemId,
        originatingSystemId,
        ccyPairCode,
        counterpartyCode
      );

      if (!scope) {
        return;
      }

      attachContext.run(scope.counterpartyId, scope.tradeContextId);
      insertRule.run(
        scope.counterpartyId,
        scope.tradeContextId,
        scope.ccyPairCode,
        marginPercent
      );
    });
  });
}

function seedInitialClientDealGenerationSettings(sqlite) {
  synchronizeClientDealGenerationSettings(sqlite);
}

function seedInitialHedgeQuickModeSettings(sqlite) {
  const eligibleRules = sqlite.prepare(`
    SELECT
      rule.pricing_rule_id AS pricingRuleId,
      rule.counterparty_id AS counterpartyId,
      rule.ccy_pair_code AS ccyPairCode,
      base_ccy.fraction_digits AS baseCcyFractionDigits
    FROM pricing_rules rule
    INNER JOIN trading_counterparties counterparty ON counterparty.counterparty_id = rule.counterparty_id
    INNER JOIN trading_counterparty_roles role
      ON role.counterparty_id = counterparty.counterparty_id AND role.role_code = 'HEDGE_COUNTERPARTY'
    INNER JOIN trade_contexts context
      ON context.trade_context_id = rule.trade_context_id
    INNER JOIN originating_systems originating
      ON originating.originating_system_id = context.originating_system_id
    INNER JOIN ccy_pair_options pair
      ON pair.ccy_pair_code = rule.ccy_pair_code
    INNER JOIN ccy_options base_ccy ON base_ccy.ccy_code = pair.base_ccy_code
    WHERE rule.ccy_pair_code = 'EUR_USD'
      AND counterparty.is_active = 1
      AND originating.pricing_mode = 'AUTO_PRICED'
      AND originating.is_active = 1
    ORDER BY rule.pricing_rule_id
  `).all();

  // Не выбираем правило неоднозначно: Quick Mode требует ровно одну явную ссылку.
  if (eligibleRules.length !== 1) {
    return;
  }

  const rule = eligibleRules[0];
  const amountMinor = amount => minorToSafeInteger(
    majorToMinorExact(amount, rule.baseCcyFractionDigits),
    "Initial Hedge Quick Mode Base Ccy Amount Minor"
  );

  sqlite.prepare(`
    INSERT INTO hedge_quick_mode_settings
      (
        ccy_pair_code,
        counterparty_id,
        pricing_rule_id,
        base_ccy_fraction_digits,
        small_base_ccy_amount_minor,
        medium_base_ccy_amount_minor,
        large_base_ccy_amount_minor,
        xlarge_base_ccy_amount_minor,
        is_active,
        default_tenor
      )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 'TOD')
  `).run(
    rule.ccyPairCode,
    rule.counterpartyId,
    rule.pricingRuleId,
    rule.baseCcyFractionDigits,
    amountMinor("5000000"),
    amountMinor("20000000"),
    amountMinor("50000000"),
    amountMinor("100000000")
  );
}

function seedInitialClientDeals(sqlite) {
  runInImmediateTransaction(sqlite, () => {
    const pricingRule = sqlite.prepare(`
      SELECT r.pricing_rule_id, r.counterparty_id, r.trade_context_id
      FROM pricing_rules r
      INNER JOIN trading_counterparties p ON p.counterparty_id = r.counterparty_id
      INNER JOIN external_counterparties external ON external.counterparty_id = p.counterparty_id
      INNER JOIN trade_contexts e ON e.trade_context_id = r.trade_context_id
      WHERE external.counterparty_code_type = 'INN'
        AND external.counterparty_code = '7701234567'
        AND r.ccy_pair_code = 'EUR_USD'
        AND e.servicing_location_id = '002'
        AND e.accounting_system_id = 'CTF3'
        AND e.originating_system_id = 'MANUAL_CLIENT_DEAL_ENTRY'
      LIMIT 1
    `).get();

    if (!pricingRule) {
      throw new Error("Initial Client Deal Pricing Rule was not found.");
    }

    const exposureResult = sqlite.prepare(`
      INSERT INTO trade_exposures
        (
          execution_timestamp,
          received_timestamp,
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
      INSERT INTO client_deals
        (
          trade_id,
          trade_type,
          counterparty_id,
          trade_context_id,
          pricing_rule_id,
          transfer_rate,
          analytical_pnl_quote_minor,
          analytical_pnl_quote_fraction_digits
        )
      VALUES (?, 'CLIENT_DEAL', ?, ?, ?, 1.1222, 2700000, 2)
    `).run(
      tradeId,
      pricingRule.counterparty_id,
      pricingRule.trade_context_id,
      pricingRule.pricing_rule_id
    );

    if (clientResult.changes !== 1) {
      throw new Error("Initial Client Deal was not created.");
    }

    sqlite.prepare(`
      INSERT INTO trade_market_snapshots
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
      s.bid_max AS bidMax,
      s.one_way_duration_seconds AS oneWayDurationSeconds,
      s.fluctuation_spreads AS fluctuationSpreads
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
      s.bid_max AS bidMax,
      s.one_way_duration_seconds AS oneWayDurationSeconds,
      s.fluctuation_spreads AS fluctuationSpreads
    FROM ccy_pair_options p
    INNER JOIN ccy_options base_ccy ON base_ccy.ccy_code = p.base_ccy_code
    INNER JOIN ccy_options quote_ccy ON quote_ccy.ccy_code = p.quote_ccy_code
    LEFT JOIN market_quote_simulation_settings s
      ON s.ccy_pair_code = p.ccy_pair_code
    WHERE p.ccy_pair_code = ?
  `).get(pairCode) || null;
}

function tradeContextAdmissionMode(tradeContextId) {
  const normalizedId = normalizedTradeContextId(tradeContextId);

  if (normalizedId === null) {
    return null;
  }

  return database.prepare(`
    SELECT auto_management_admission_mode AS autoManagementAdmissionMode
    FROM trade_contexts
    WHERE trade_context_id = ?
  `).get(normalizedId)?.autoManagementAdmissionMode ?? null;
}

function pricingRuleAutoManagementAdmissionPolicy(
  pricingRuleId,
  tradeContextId
) {
  const normalizedContextId = normalizedTradeContextId(tradeContextId);

  if (pricingRuleId === null || pricingRuleId === undefined) {
    const tradeContextMode = tradeContextAdmissionMode(normalizedContextId);

    return {
      autoManagementAdmissionModeOverride: null,
      tradeContextAdmissionMode: tradeContextMode,
      effectiveAutoManagementAdmissionMode:
        resolvePricingRuleAutoManagementAdmissionMode({
          autoManagementAdmissionModeOverride: null,
          tradeContextAdmissionMode: tradeContextMode
        })
    };
  }

  const normalizedPricingRuleId = integerInRange(
    pricingRuleId,
    1,
    Number.MAX_SAFE_INTEGER
  );
  const policy = normalizedPricingRuleId === null || normalizedContextId === null
    ? null
    : database.prepare(`
        SELECT
          rule.auto_management_admission_mode_override
            AS autoManagementAdmissionModeOverride,
          context.auto_management_admission_mode AS tradeContextAdmissionMode
        FROM pricing_rules rule
        INNER JOIN trade_contexts context
          ON context.trade_context_id = rule.trade_context_id
        WHERE rule.pricing_rule_id = ?
          AND rule.trade_context_id = ?
      `).get(normalizedPricingRuleId, normalizedContextId);

  if (!policy) {
    throw new Error(
      `Initial Mode Assignment was not found for Pricing Rule ${pricingRuleId} and Trade Context ${tradeContextId}.`
    );
  }

  return {
    ...policy,
    effectiveAutoManagementAdmissionMode:
      resolvePricingRuleAutoManagementAdmissionMode(policy)
  };
}

function storedAutoModeEligibilityRules(tradeType) {
  tradeType = normalizedText(tradeType).toUpperCase();
  if (!TRADE_TYPES.includes(tradeType)) {
    throw new RangeError(
      `Auto Mode Eligibility Rule trade type must be one of: ${TRADE_TYPES.join(", ")}.`
    );
  }
  const currencyPairs = database.prepare(`
    SELECT
      pair.ccy_pair_code AS ccyPairCode,
      pair.base_ccy_code || '/' || pair.quote_ccy_code AS currencyPair,
      pair.base_ccy_code AS baseCcyCode,
      base_ccy.fraction_digits AS baseCcyFractionDigits,
      COALESCE(rule.is_eligible, 0) AS enabled,
      rule.max_base_ccy_amount_minor AS maxBaseCcyAmountMinor,
      rule.max_transfer_rate_deviation_percent AS maxTransferRateDeviationPercent
    FROM ccy_pair_options pair
    INNER JOIN ccy_options base_ccy
      ON base_ccy.ccy_code = pair.base_ccy_code
    LEFT JOIN auto_mode_eligibility_rules rule
      ON rule.trade_type = ?
      AND rule.ccy_pair_code = pair.ccy_pair_code
    ORDER BY pair.base_ccy_code, pair.quote_ccy_code
  `).all(tradeType).map(pair => ({
    ccyPairCode: pair.ccyPairCode,
    currencyPair: pair.currencyPair,
    baseCcyCode: pair.baseCcyCode,
    baseCcyFractionDigits: pair.baseCcyFractionDigits,
    enabled: pair.enabled === 1,
    maxTransferRateDeviationPercent: pair.maxTransferRateDeviationPercent,
    maxBaseCcyAmount: pair.enabled === 1
      ? minorToMajor(pair.maxBaseCcyAmountMinor, pair.baseCcyFractionDigits)
      : null
  }));

  return {
    tradeType,
    currencyPairs
  };
}

function autoModeEligibilityRules(tradeType = "CLIENT_DEAL") {
  return storedAutoModeEligibilityRules(
    normalizeAutoManagementAdmissionTradeType(tradeType)
  );
}

function autoModeEligibilityRuleMatrix() {
  return {
    ruleSets: AUTO_MODE_ELIGIBILITY_MATRIX_TRADE_TYPES.map(
      storedAutoModeEligibilityRules
    )
  };
}

function normalizedMaxTransferRateDeviationPercent(value) {
  if (typeof value !== "string") {
    return null;
  }

  const text = value.trim();

  if (text.length < 1
    || text.length > 32
    || !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(text)
    || Number(text) > 100) {
    return null;
  }

  return text;
}

function validateAutoModeEligibilityRulesPayload(body) {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { error: "Auto Mode Eligibility Rules payload must be a JSON object." };
  }

  let tradeType;
  try {
    tradeType = normalizeAutoManagementAdmissionTradeType(
      body.tradeType === undefined ? "CLIENT_DEAL" : body.tradeType
    );
  } catch (error) {
    return { error: error.message };
  }
  if (Object.hasOwn(body, "maxTransferRateDeviationPercent")) {
    return {
      error: "Maximum Transfer Rate deviation must be configured for each Currency Pair."
    };
  }

  if (!Array.isArray(body.currencyPairs)) {
    return { error: "Currency Pairs must be provided as an array." };
  }

  const pairCatalog = new Map(database.prepare(`
    SELECT
      pair.ccy_pair_code AS ccyPairCode,
      base_ccy.fraction_digits AS baseCcyFractionDigits
    FROM ccy_pair_options pair
    INNER JOIN ccy_options base_ccy
      ON base_ccy.ccy_code = pair.base_ccy_code
  `).all().map(pair => [pair.ccyPairCode, pair]));
  const seenPairCodes = new Set();
  const rules = [];

  for (const item of body.currencyPairs) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      return { error: "Every Currency Pair rule must be a JSON object." };
    }

    const ccyPairCode = normalizedText(item.ccyPairCode).toUpperCase();
    const pair = pairCatalog.get(ccyPairCode);

    if (!pair) {
      return { error: `Ccy Pair ${ccyPairCode || "<empty>"} was not found.` };
    }

    if (seenPairCodes.has(ccyPairCode)) {
      return { error: `Ccy Pair ${ccyPairCode} is duplicated.` };
    }

    seenPairCodes.add(ccyPairCode);

    if (typeof item.enabled !== "boolean") {
      return { error: `Enabled must be a boolean value for ${ccyPairCode}.` };
    }

    if (!item.enabled) {
      rules.push({
        ccyPairCode,
        isEligible: false,
        maxBaseCcyAmountMinor: null,
        maxTransferRateDeviationPercent: null
      });
      continue;
    }

    const maxTransferRateDeviationPercent =
      normalizedMaxTransferRateDeviationPercent(
        item.maxTransferRateDeviationPercent
      );
    if (maxTransferRateDeviationPercent === null) {
      return {
        error: `Maximum Transfer Rate deviation for ${ccyPairCode} must be a decimal string from 0 through 100 percent.`
      };
    }

    if (typeof item.maxBaseCcyAmount !== "string") {
      return { error: `Maximum Base Ccy amount for ${ccyPairCode} must be a decimal string.` };
    }

    let maxBaseCcyAmountMinor;

    try {
      maxBaseCcyAmountMinor = minorToSafeInteger(
        majorToMinorExact(item.maxBaseCcyAmount.trim(), pair.baseCcyFractionDigits),
        `Maximum Base Ccy amount for ${ccyPairCode}`
      );
    } catch (error) {
      return { error: error.message };
    }

    if (maxBaseCcyAmountMinor <= 0) {
      return { error: `Maximum Base Ccy amount for ${ccyPairCode} must be greater than zero.` };
    }

    rules.push({
      ccyPairCode,
      isEligible: true,
      maxBaseCcyAmountMinor,
      maxTransferRateDeviationPercent
    });
  }

  if (seenPairCodes.size !== pairCatalog.size) {
    const missingPairCodes = [...pairCatalog.keys()]
      .filter(ccyPairCode => !seenPairCodes.has(ccyPairCode))
      .sort();
    return {
      error: `Currency Pairs must be a full replacement. Missing Ccy Pairs: ${missingPairCodes.join(", ")}.`
    };
  }

  return {
    tradeType,
    rules
  };
}

function saveAutoModeEligibilityRules(payload) {
  runInImmediateTransaction(database, () => {
    database.prepare(`
      DELETE FROM auto_mode_eligibility_rules
      WHERE trade_type = ?
    `).run(payload.tradeType);

    const insertRule = database.prepare(`
      INSERT INTO auto_mode_eligibility_rules
        (
          trade_type,
          ccy_pair_code,
          is_eligible,
          max_base_ccy_amount_minor,
          max_transfer_rate_deviation_percent
        )
      VALUES (?, ?, ?, ?, ?)
    `);

    payload.rules.forEach(rule => {
      insertRule.run(
        payload.tradeType,
        rule.ccyPairCode,
        rule.isEligible ? 1 : 0,
        rule.maxBaseCcyAmountMinor,
        rule.maxTransferRateDeviationPercent
      );
    });
  });

  return autoModeEligibilityRules(payload.tradeType);
}

function createCcyPairOptionWithEligibilityRules(payload) {
  return runInImmediateTransaction(database, () => {
    database.prepare(`
      INSERT INTO ccy_pair_options
        (ccy_pair_code, base_ccy_code, quote_ccy_code, default_quote_decimals)
      VALUES (?, ?, ?, ?)
    `).run(
      payload.pairCode,
      payload.baseCcy,
      payload.quoteCcy,
      payload.defaultQuoteDecimals
    );

    const insertRule = database.prepare(`
      INSERT INTO auto_mode_eligibility_rules
        (
          trade_type,
          ccy_pair_code,
          is_eligible,
          max_base_ccy_amount_minor,
          max_transfer_rate_deviation_percent
        )
      VALUES (?, ?, 0, NULL, NULL)
    `);
    for (const tradeType of AUTO_MODE_ELIGIBILITY_MATRIX_TRADE_TYPES) {
      insertRule.run(tradeType, payload.pairCode);
    }

    return ccyPairOption(payload.pairCode);
  });
}

function autoModeEligibilityRule(ccyPairCode, tradeType) {
  tradeType = normalizeAutoManagementAdmissionTradeType(tradeType);
  const normalizedPairCode = normalizedText(ccyPairCode).toUpperCase();
  const rule = database.prepare(`
    SELECT
      is_eligible AS isEligible,
      max_transfer_rate_deviation_percent AS maxTransferRateDeviationPercent,
      max_base_ccy_amount_minor AS maxBaseCcyAmountMinor
    FROM auto_mode_eligibility_rules
    WHERE trade_type = ? AND ccy_pair_code = ?
  `).get(tradeType, normalizedPairCode);

  if (!rule) {
    throw new Error("Auto Mode Eligibility Rule is not configured.");
  }

  return {
    maxTransferRateDeviationPercent: rule.maxTransferRateDeviationPercent,
    pairRule: rule.isEligible === 1
      ? {
          ccyPairCode: normalizedPairCode,
          enabled: true,
          maxBaseCcyAmountMinor: rule.maxBaseCcyAmountMinor
        }
      : null
  };
}

function evaluateTradeAdmission(tradeType, payload, exposureAmounts, stage = "INITIAL") {
  const eligibilityRule = autoModeEligibilityRule(payload.ccyPairCode, tradeType);
  const admissionMode = stage === "INITIAL"
    ? pricingRuleAutoManagementAdmissionPolicy(
        payload.pricingRuleId, payload.tradeContextId
      ).effectiveAutoManagementAdmissionMode
    : null;
  const evaluate = stage === "RELEASE" ? decideReleaseToAutoManagement : determineInitialAdmissionState;
  return evaluate({
      admissionMode,
      ccyPairCode: payload.ccyPairCode,
      baseCcyAmountMinor: exposureAmounts.baseCcyAmountMinor,
      pairRule: eligibilityRule.pairRule,
      side: payload.side,
      transferRate: payload.transferRate,
      marketPulseStatus: payload.marketPulseStreamStatus,
      marketBid: payload.marketPulseBid,
      marketOffer: payload.marketPulseOffer,
      maxTransferRateDeviationPercent: eligibilityRule.maxTransferRateDeviationPercent
    });
}

function recordTradeAdmissionDecision(identity, decision, stage) {
  database.prepare(`
    INSERT INTO auto_management_admission_decisions
      (trade_id, trade_type, decision_sequence, decision_stage, admission_mode,
       admission_state, releasable, reason_codes_json, checks_json, is_enforced)
    VALUES (?, ?, (SELECT COALESCE(MAX(decision_sequence), 0) + 1
      FROM auto_management_admission_decisions WHERE trade_id = ? AND trade_type = ?),
      ?, ?, ?, ?, ?, ?, 1)
  `).run(identity.tradeId, identity.tradeType, identity.tradeId, identity.tradeType,
    stage, decision.admissionMode, decision.state,
    decision.releasable ? 1 : 0, JSON.stringify(decision.reasonCodes), JSON.stringify(decision.checks));
}

function materializeTradeAdmission(identity, payload, exposureAmounts) {
  const decision = evaluateTradeAdmission(identity.tradeType, payload, exposureAmounts);
  materializeTradePositionModeState(database, {
    ...identity,
    positionManagementMode: decision.state === "RELEASED" ? "AUTO" : "MANUAL"
  });
  recordTradeAdmissionDecision(identity, decision, "INITIAL");
}

function evaluateTradeRelease(identity) {
  const trade = database.prepare(`
    SELECT exposure.ccy_pair_code AS ccyPairCode, exposure.base_ccy_side AS side,
      exposure.base_ccy_amount_minor AS baseCcyAmountMinor,
      COALESCE(client.transfer_rate, hedge.transfer_rate) AS transferRate
    FROM trade_exposures exposure
    LEFT JOIN client_deals client USING (trade_id, trade_type)
    LEFT JOIN hedge_deals hedge USING (trade_id, trade_type)
    WHERE exposure.trade_id = ? AND exposure.trade_type = ?
  `).get(identity.tradeId, identity.tradeType);
  const market = marketPulseSimulator.snapshot();
  const quote = market.quotes.find(item => item.pairCode === trade.ccyPairCode);
  return evaluateTradeAdmission(identity.tradeType, {
    ...trade, marketPulseStreamStatus: market.status,
    marketPulseBid: quote?.bid, marketPulseOffer: quote?.offer
  }, trade, "RELEASE");
}

function tradeExposureAmounts(payload, generatedAmounts = null) {
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
    const calculated = calculateAmountsFromDealt({
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
    calculatedBaseMinor = majorToMinorExact(
      String(payload.baseCcyAmount),
      baseFractionDigits
    );
    calculatedQuoteMinor = majorToMinorExact(
      String(payload.quoteCcyAmount),
      quoteFractionDigits
    );
  }

  const baseMinor = generatedAmounts?.baseCcyAmountMinor ?? calculatedBaseMinor;
  const quoteMinor = generatedAmounts?.quoteCcyAmountMinor ?? calculatedQuoteMinor;

  if (generatedAmounts) {
    if (generatedAmounts.baseCcyFractionDigits !== baseFractionDigits
      || generatedAmounts.quoteCcyFractionDigits !== quoteFractionDigits) {
      throw new Error("Generated Trade currency fraction digits do not match Reference Data.");
    }

    if (BigInt(baseMinor) !== calculatedBaseMinor || BigInt(quoteMinor) !== calculatedQuoteMinor) {
      throw new Error("Generated Trade major and minor amounts are inconsistent.");
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

function tradeRowWithMajorAmounts(row) {
  const normalized = {
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

  if (row.analyticalPnlQuoteMinor !== undefined) {
    normalized.analyticalPnl = row.analyticalPnlQuoteMinor === null
      ? null
      : Number(minorToMajor(
        row.analyticalPnlQuoteMinor,
        row.analyticalPnlQuoteFractionDigits
      ));
  }

  return normalized;
}

function batchBalanceRow(row) {
  const trade = tradeRowWithMajorAmounts(row);
  const contributions = tradeBalanceContributions(trade);

  return {
    ...trade,
    ...contributions,
    baseBalanceContribution: Number(minorToMajor(
      contributions.baseBalanceContributionMinor,
      trade.baseCcyFractionDigits
    )),
    quoteBalanceContribution: Number(minorToMajor(
      contributions.quoteBalanceContributionMinor,
      trade.quoteCcyFractionDigits
    ))
  };
}

function batchQuoteCashOutput(batchId) {
  const row = database.prepare(`
    SELECT
      cash.batch_id AS batchId,
      cash.quote_ccy_code AS quoteCcyCode,
      cash.quote_balance_contribution_minor AS quoteBalanceContributionMinor,
      cash.quote_ccy_fraction_digits AS quoteCcyFractionDigits,
      cash.quote_ccy_value_date AS quoteCcyValueDate,
      cash.created_at AS createdAt,
      batch.ccy_pair_code AS ccyPairCode,
      pair.base_ccy_code || '/' || pair.quote_ccy_code AS currencyPair
    FROM batch_quote_cash_outputs cash
    INNER JOIN batches batch
      ON batch.batch_id = cash.batch_id
    INNER JOIN ccy_pair_options pair
      ON pair.ccy_pair_code = batch.ccy_pair_code
    WHERE cash.batch_id = ?
  `).get(batchId);

  if (!row) {
    return null;
  }

  const amountMinor = Math.abs(row.quoteBalanceContributionMinor);

  return {
    outputType: "BATCH_QUOTE_CASH_OUT",
    batchId: row.batchId,
    createdAt: row.createdAt,
    ccyPairCode: row.ccyPairCode,
    currencyPair: row.currencyPair,
    currencyCode: row.quoteCcyCode,
    amountMinor,
    fractionDigits: row.quoteCcyFractionDigits,
    amount: Number(minorToMajor(
      amountMinor,
      row.quoteCcyFractionDigits
    )),
    balanceContributionMinor: row.quoteBalanceContributionMinor,
    balanceContribution: Number(minorToMajor(
      row.quoteBalanceContributionMinor,
      row.quoteCcyFractionDigits
    )),
    valueDate: row.quoteCcyValueDate
  };
}

function marketQuoteSimulationSettings(pairCode) {
  return database.prepare(`
    SELECT
      ccy_pair_code AS pairCode,
      bid_min AS bidMin,
      spread,
      bid_max AS bidMax,
      one_way_duration_seconds AS oneWayDurationSeconds,
      fluctuation_spreads AS fluctuationSpreads
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
      s.bid_max AS bidMax,
      s.one_way_duration_seconds AS oneWayDurationSeconds,
      s.fluctuation_spreads AS fluctuationSpreads
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
        FROM trade_contexts c
        WHERE c.servicing_location_id = s.servicing_location_id
      ) AS tradeContextCount
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
        FROM trade_contexts c
        WHERE c.accounting_system_id = a.accounting_system_id
      ) AS tradeContextCount
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

function originatingSystems() {
  return database.prepare(`
    SELECT
      e.originating_system_id AS originatingSystemId,
      e.name,
      e.pricing_mode AS pricingMode,
      e.is_active AS active,
      (
        SELECT COUNT(*)
        FROM trade_contexts c
        WHERE c.originating_system_id = e.originating_system_id
      ) AS tradeContextCount
    FROM originating_systems e
    ORDER BY e.originating_system_id
  `).all().map(system => ({
    ...system,
    active: system.active === 1
  }));
}

function originatingSystem(originatingSystemId) {
  return originatingSystems().find(system => system.originatingSystemId === originatingSystemId) || null;
}

function tradeContexts() {
  return database.prepare(`
    SELECT
      context.trade_context_id AS tradeContextId,
      context.servicing_location_id AS servicingLocationId,
      COALESCE(context.accounting_system_id, 'NOT_APPLICABLE') AS accountingSystemId,
      context.originating_system_id AS originatingSystemId,
      context.auto_management_admission_mode AS autoManagementAdmissionMode,
      (
        SELECT COUNT(*)
        FROM trading_counterparty_trade_contexts assignment
        WHERE assignment.trade_context_id = context.trade_context_id
      ) AS assignedCounterpartyCount
    FROM trade_contexts context
    ORDER BY context.trade_context_id
  `).all();
}

function tradeContext(tradeContextId) {
  return tradeContexts().find(context => context.tradeContextId === Number(tradeContextId)) || null;
}

function tradingCounterparties() {
  return database.prepare(`
    SELECT
      counterparty.counterparty_id AS counterpartyId,
      counterparty.counterparty_name AS counterpartyName,
      counterparty.is_active AS active,
      counterparty.counterparty_scope AS counterpartyScope,
      external.counterparty_code AS externalCounterpartyCode,
      external.counterparty_code_type AS externalCounterpartyCodeType,
      external.external_counterparty_kind AS externalCounterpartyKind,
      internal.unit_code AS unitCode,
      internal.unit_type AS unitType,
      COALESCE(external.counterparty_code, internal.unit_code) AS counterpartyCode,
      COALESCE(external.counterparty_code_type, 'INTERNAL_UNIT_CODE') AS counterpartyCodeType,
      (
        SELECT GROUP_CONCAT(role.role_code, '|')
        FROM trading_counterparty_roles role
        WHERE role.counterparty_id = counterparty.counterparty_id
      ) AS counterpartyRoles
    FROM trading_counterparties counterparty
    LEFT JOIN external_counterparties external ON external.counterparty_id = counterparty.counterparty_id
    LEFT JOIN internal_units internal ON internal.counterparty_id = counterparty.counterparty_id
    ORDER BY counterparty.counterparty_name, COALESCE(external.counterparty_code, internal.unit_code)
  `).all().map(counterparty => {
    const counterpartyRoles = String(counterparty.counterpartyRoles || "")
      .split("|")
      .filter(role => COUNTERPARTY_ROLES.includes(role))
      .sort((left, right) => COUNTERPARTY_ROLES.indexOf(left) - COUNTERPARTY_ROLES.indexOf(right));

    return {
      ...counterparty,
      counterpartyRoles,
      counterpartyType: counterpartyRoles[0] || "",
      active: counterparty.active === 1
    };
  });
}

function tradingCounterparty(counterpartyId) {
  return tradingCounterparties().find(counterparty => counterparty.counterpartyId === Number(counterpartyId)) || null;
}

function tradeContextTradingCounterparties(tradeContextId) {
  const attachedCounterpartyIds = new Set(
    database.prepare(`
      SELECT counterparty_id AS counterpartyId
      FROM trading_counterparty_trade_contexts
      WHERE trade_context_id = ?
    `).all(Number(tradeContextId)).map(assignment => assignment.counterpartyId)
  );

  return tradingCounterparties().filter(counterparty =>
    attachedCounterpartyIds.has(counterparty.counterpartyId)
  );
}

function tradingCounterpartyTradeContexts(counterpartyId) {
  return database.prepare(`
    SELECT
      context.trade_context_id AS tradeContextId,
      context.servicing_location_id AS servicingLocationId,
      COALESCE(context.accounting_system_id, 'NOT_APPLICABLE') AS accountingSystemId,
      context.originating_system_id AS originatingSystemId,
      context.auto_management_admission_mode AS autoManagementAdmissionMode,
      (
        SELECT COUNT(*)
        FROM trading_counterparty_trade_contexts context_assignment
        WHERE context_assignment.trade_context_id = context.trade_context_id
      ) AS assignedCounterpartyCount,
      (
        SELECT COUNT(*)
        FROM pricing_rules rule
        WHERE rule.counterparty_id = assignment.counterparty_id
          AND rule.trade_context_id = assignment.trade_context_id
      ) AS pricingRulesCount
    FROM trading_counterparty_trade_contexts assignment
    INNER JOIN trade_contexts context
      ON context.trade_context_id = assignment.trade_context_id
    WHERE assignment.counterparty_id = ?
    ORDER BY context.trade_context_id
  `).all(Number(counterpartyId));
}

function tradingCounterpartyTradeContext(counterpartyId, tradeContextId) {
  return tradingCounterpartyTradeContexts(counterpartyId)
    .find(context => context.tradeContextId === Number(tradeContextId)) || null;
}

function tradingCounterpartyTradeContextPricingRulesCount(counterpartyId, tradeContextId) {
  return Number(database.prepare(`
    SELECT COUNT(*) AS count
    FROM pricing_rules
    WHERE counterparty_id = ? AND trade_context_id = ?
  `).get(Number(counterpartyId), Number(tradeContextId)).count);
}

function tradingCounterpartyHasRole(counterparty, roleCode) {
  return Array.isArray(counterparty?.counterpartyRoles) && counterparty.counterpartyRoles.includes(roleCode);
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
  const counterpartiesById = new Map(tradingCounterparties().map(counterparty => [counterparty.counterpartyId, counterparty]));

  return database.prepare(`
    SELECT
      r.pricing_rule_id AS pricingRuleId,
      r.counterparty_id AS counterpartyId,
      p.counterparty_name AS counterpartyName,
      r.trade_context_id AS tradeContextId,
      r.ccy_pair_code AS ccyPairCode,
      c.base_ccy_code || '/' || c.quote_ccy_code AS currencyPair,
      r.margin_percent AS marginPercent,
      e.pricing_mode AS pricingMode,
      r.auto_management_admission_mode_override AS autoManagementAdmissionModeOverride,
      x.auto_management_admission_mode AS tradeContextAdmissionMode,
      (
        SELECT COUNT(*)
        FROM hedge_quick_mode_settings settings
        WHERE settings.pricing_rule_id = r.pricing_rule_id
      ) AS quickHedgeSettingsCount
    FROM pricing_rules r
    INNER JOIN trading_counterparties p ON p.counterparty_id = r.counterparty_id
    INNER JOIN ccy_pair_options c ON c.ccy_pair_code = r.ccy_pair_code
    INNER JOIN trade_contexts x ON x.trade_context_id = r.trade_context_id
    INNER JOIN originating_systems e ON e.originating_system_id = x.originating_system_id
    WHERE (? IS NULL OR e.pricing_mode = ?)
    ORDER BY p.counterparty_name, c.ccy_pair_code, r.trade_context_id
  `).all(pricingMode, pricingMode).map(rule => {
    const counterparty = counterpartiesById.get(rule.counterpartyId);

    return {
      ...rule,
      effectiveAutoManagementAdmissionMode:
        resolvePricingRuleAutoManagementAdmissionMode(rule),
      counterpartyType: counterparty?.counterpartyType || "",
      counterpartyRoles: counterparty?.counterpartyRoles || [],
      counterpartyScope: counterparty?.counterpartyScope || "",
      counterpartyCode: counterparty?.counterpartyCode || "",
      counterpartyCodeType: counterparty?.counterpartyCodeType || ""
    };
  });
}

function pricingRule(pricingRuleId) {
  return pricingRules().find(rule => rule.pricingRuleId === Number(pricingRuleId)) || null;
}

function pricingRuleDeletionUsage(pricingRuleId) {
  const quickHedgePairs = database.prepare(`
    SELECT pair.base_ccy_code || '/' || pair.quote_ccy_code AS currencyPair
    FROM hedge_quick_mode_settings settings
    INNER JOIN ccy_pair_options pair ON pair.ccy_pair_code = settings.ccy_pair_code
    WHERE settings.pricing_rule_id = ?
    ORDER BY settings.ccy_pair_code
  `).all(pricingRuleId).map(item => item.currencyPair);
  const clientDealCount = Number(database.prepare(`
    SELECT COUNT(*) AS count
    FROM client_deals
    WHERE pricing_rule_id = ?
  `).get(pricingRuleId)?.count || 0);
  const hedgeDealCount = Number(database.prepare(`
    SELECT COUNT(*) AS count
    FROM hedge_deals
    WHERE pricing_rule_id = ?
  `).get(pricingRuleId)?.count || 0);

  return { quickHedgePairs, clientDealCount, hedgeDealCount };
}

function pricingRuleDeletionConflictMessage(pricingRuleId, usage) {
  const references = [];

  if (usage.quickHedgePairs.length > 0) {
    references.push(`Quick Hedge Settings for ${usage.quickHedgePairs.join(", ")}`);
  }

  if (usage.clientDealCount > 0) {
    const label = usage.clientDealCount === 1 ? "Client Deal" : "Client Deals";
    references.push(`${usage.clientDealCount} ${label}`);
  }

  if (usage.hedgeDealCount > 0) {
    const label = usage.hedgeDealCount === 1 ? "Hedge Deal" : "Hedge Deals";
    references.push(`${usage.hedgeDealCount} ${label}`);
  }

  if (references.length === 0) {
    return "";
  }

  const referenceList = references.length === 1
    ? references[0]
    : `${references.slice(0, -1).join(", ")} and ${references.at(-1)}`;
  return `Pricing Rule ${pricingRuleId} cannot be deleted because it is used by ${referenceList}. Remove or change those references first.`;
}

function clientDealPricingRules() {
  return pricingRules("DEALER_PRICED");
}

function clientDealPricingRule(pricingRuleId) {
  return clientDealPricingRules()
    .find(rule => rule.pricingRuleId === Number(pricingRuleId)) || null;
}

function eligibleHedgeDealPricingRules(pricingMode) {
  const normalizedPricingMode = normalizedText(pricingMode).toUpperCase();

  if (!HEDGE_DEAL_PRICING_MODES.has(normalizedPricingMode)) {
    return [];
  }

  return pricingRules(normalizedPricingMode).filter(rule => {
    const counterparty = tradingCounterparty(rule.counterpartyId);
    const context = tradeContext(rule.tradeContextId);
    const system = context ? originatingSystem(context.originatingSystemId) : null;

    return tradingCounterpartyHasRole(counterparty, "HEDGE_COUNTERPARTY")
      && counterparty.active
      && Boolean(system?.active);
  });
}

function eligibleHedgeDealPricingRule(pricingRuleId, pricingMode) {
  return eligibleHedgeDealPricingRules(pricingMode)
    .find(rule => rule.pricingRuleId === Number(pricingRuleId)) || null;
}

function hedgeDealPricingRules() {
  return eligibleHedgeDealPricingRules("DEALER_PRICED");
}

function hedgeDealPricingRule(pricingRuleId) {
  return eligibleHedgeDealPricingRule(pricingRuleId, "DEALER_PRICED");
}

function autoPricedHedgeDealPricingRules() {
  return eligibleHedgeDealPricingRules("AUTO_PRICED");
}

function autoPricedHedgeDealPricingRule(pricingRuleId) {
  return eligibleHedgeDealPricingRule(pricingRuleId, "AUTO_PRICED");
}

function hedgeQuickModeSettings() {
  return database.prepare(`
    SELECT
      settings.ccy_pair_code AS ccyPairCode,
      pair.base_ccy_code || '/' || pair.quote_ccy_code AS currencyPair,
      pair.base_ccy_code AS baseCcyCode,
      settings.counterparty_id AS counterpartyId,
      settings.pricing_rule_id AS pricingRuleId,
      'HEDGE_COUNTERPARTY' AS counterpartyType,
      counterparty.counterparty_name AS counterpartyName,
      counterparty.is_active AS counterpartyActive,
      rule.trade_context_id AS tradeContextId,
      originating.originating_system_id AS originatingSystemId,
      originating.name AS originatingSystemName,
      originating.pricing_mode AS pricingMode,
      originating.is_active AS originatingSystemActive,
      settings.base_ccy_fraction_digits AS baseCcyFractionDigits,
      settings.small_base_ccy_amount_minor AS smallBaseCcyAmountMinor,
      settings.medium_base_ccy_amount_minor AS mediumBaseCcyAmountMinor,
      settings.large_base_ccy_amount_minor AS largeBaseCcyAmountMinor,
      settings.xlarge_base_ccy_amount_minor AS xlargeBaseCcyAmountMinor,
      settings.is_active AS active,
      settings.default_tenor AS defaultTenor
    FROM hedge_quick_mode_settings settings
    INNER JOIN ccy_pair_options pair
      ON pair.ccy_pair_code = settings.ccy_pair_code
    INNER JOIN pricing_rules rule
      ON rule.pricing_rule_id = settings.pricing_rule_id
      AND rule.counterparty_id = settings.counterparty_id
      AND rule.ccy_pair_code = settings.ccy_pair_code
    INNER JOIN trading_counterparties counterparty ON counterparty.counterparty_id = settings.counterparty_id
    INNER JOIN trading_counterparty_roles role
      ON role.counterparty_id = counterparty.counterparty_id AND role.role_code = 'HEDGE_COUNTERPARTY'
    INNER JOIN trade_contexts context
      ON context.trade_context_id = rule.trade_context_id
    INNER JOIN originating_systems originating
      ON originating.originating_system_id = context.originating_system_id
    ORDER BY pair.base_ccy_code, pair.quote_ccy_code
  `).all().map(row => {
    const settings = {
      ...row,
      active: row.active === 1,
      counterpartyActive: row.counterpartyActive === 1,
      originatingSystemActive: row.originatingSystemActive === 1
    };

    return {
      ...settings,
      available: settings.active
        && settings.counterpartyActive
        && settings.originatingSystemActive
        && settings.counterpartyType === "HEDGE_COUNTERPARTY"
        && settings.pricingMode === "AUTO_PRICED",
      presets: hedgeQuickModePresets(settings)
    };
  });
}

function hedgeQuickModeSetting(ccyPairCode) {
  const normalizedPairCode = normalizedText(ccyPairCode).toUpperCase();
  return hedgeQuickModeSettings()
    .find(settings => settings.ccyPairCode === normalizedPairCode) || null;
}

function replaceHedgeQuickModeSetting(payload) {
  database.prepare(`
    INSERT INTO hedge_quick_mode_settings
      (
        ccy_pair_code,
        counterparty_id,
        pricing_rule_id,
        base_ccy_fraction_digits,
        small_base_ccy_amount_minor,
        medium_base_ccy_amount_minor,
        large_base_ccy_amount_minor,
        xlarge_base_ccy_amount_minor,
        is_active,
        default_tenor
      )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (ccy_pair_code) DO UPDATE SET
      counterparty_id = excluded.counterparty_id,
      pricing_rule_id = excluded.pricing_rule_id,
      base_ccy_fraction_digits = excluded.base_ccy_fraction_digits,
      small_base_ccy_amount_minor = excluded.small_base_ccy_amount_minor,
      medium_base_ccy_amount_minor = excluded.medium_base_ccy_amount_minor,
      large_base_ccy_amount_minor = excluded.large_base_ccy_amount_minor,
      xlarge_base_ccy_amount_minor = excluded.xlarge_base_ccy_amount_minor,
      is_active = excluded.is_active,
      default_tenor = excluded.default_tenor
  `).run(
    payload.ccyPairCode,
    payload.counterpartyId,
    payload.pricingRuleId,
    payload.baseCcyFractionDigits,
    payload.smallBaseCcyAmountMinor,
    payload.mediumBaseCcyAmountMinor,
    payload.largeBaseCcyAmountMinor,
    payload.xlargeBaseCcyAmountMinor,
    payload.active ? 1 : 0,
    payload.defaultTenor
  );

  return hedgeQuickModeSetting(payload.ccyPairCode);
}

function deleteHedgeQuickModeSetting(ccyPairCode) {
  return database.prepare(`
    DELETE FROM hedge_quick_mode_settings
    WHERE ccy_pair_code = ?
  `).run(ccyPairCode).changes === 1;
}

function batchingSettings() {
  const row = database.prepare(`
    SELECT
      allow_cross_tenor_batching AS allowCrossTenorBatching,
      updated_at AS updatedAt
    FROM batching_settings
    WHERE settings_id = 1
  `).get();

  if (!row) {
    throw new Error("Batching Settings are not configured.");
  }

  return {
    ...validatedBatchingSettings({
      allowCrossTenorBatching: row.allowCrossTenorBatching === 1
    }),
    updatedAt: row.updatedAt
  };
}

function updateBatchingSettings(payload) {
  const result = database.prepare(`
    UPDATE batching_settings
    SET allow_cross_tenor_batching = ?,
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE settings_id = 1
  `).run(payload.allowCrossTenorBatching ? 1 : 0);

  if (result.changes !== 1) {
    throw new Error("Batching Settings are not configured.");
  }

  return batchingSettings();
}

function autoBatchingSettings() {
  const settings = database.prepare(`
    SELECT
      max_interval_seconds AS maxIntervalSeconds,
      default_transfer_rate_spread_percent AS maxTransferRateSpreadPercent,
      tenor_compatibility_mode AS tenorCompatibilityMode,
      updated_at AS updatedAt
    FROM auto_batching_settings
    WHERE settings_id = 1
  `).get();

  if (!settings) {
    throw new Error("Auto Batching Settings are not configured.");
  }

  const eligibleCcyPairCodes = database.prepare(`
    SELECT ccy_pair_code AS ccyPairCode
    FROM auto_batching_ccy_pairs
    WHERE settings_id = 1
    ORDER BY ccy_pair_code
  `).all().map(row => row.ccyPairCode);

  return {
    ...validatedAutoBatchingSettings({
      ...settings,
      eligibleCcyPairCodes
    }),
    updatedAt: settings.updatedAt
  };
}

function updateAutoBatchingSettings(payload) {
  return runInImmediateTransaction(database, () => {
    const result = database.prepare(`
      UPDATE auto_batching_settings
      SET max_interval_seconds = ?,
          default_transfer_rate_spread_percent = ?,
          tenor_compatibility_mode = ?,
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE settings_id = 1
    `).run(
      payload.maxIntervalSeconds,
      payload.maxTransferRateSpreadPercent,
      payload.tenorCompatibilityMode
    );

    if (result.changes !== 1) {
      throw new Error("Auto Batching Settings are not configured.");
    }

    database.prepare(`
      DELETE FROM auto_batching_ccy_pairs
      WHERE settings_id = 1
    `).run();
    const insertPair = database.prepare(`
      INSERT INTO auto_batching_ccy_pairs
        (settings_id, ccy_pair_code)
      VALUES (1, ?)
    `);

    payload.eligibleCcyPairCodes.forEach(ccyPairCode => {
      insertPair.run(ccyPairCode);
    });

    return autoBatchingSettings();
  });
}

function clientDealGenerationProcessSettings() {
  const settings = database.prepare(`
    SELECT
      min_interval_seconds AS minIntervalSeconds,
      max_interval_seconds AS maxIntervalSeconds,
      min_deals_per_cycle AS minDealsPerCycle,
      max_deals_per_cycle AS maxDealsPerCycle
    FROM client_deal_generation_process_settings
    WHERE settings_id = 1
  `).get();

  if (!settings) {
    throw new Error("Client Deal Generation Process Settings are not configured.");
  }

  return settings;
}

function clientDealGenerationCycle() {
  const settings = clientDealGenerationProcessSettings();

  return {
    minIntervalMs: settings.minIntervalSeconds * 1000,
    maxIntervalMs: settings.maxIntervalSeconds * 1000,
    minDealsPerCycle: settings.minDealsPerCycle,
    maxDealsPerCycle: settings.maxDealsPerCycle
  };
}

function updateClientDealGenerationProcessSettings(payload) {
  const result = database.prepare(`
    UPDATE client_deal_generation_process_settings
    SET
      min_interval_seconds = ?,
      max_interval_seconds = ?,
      min_deals_per_cycle = ?,
      max_deals_per_cycle = ?
    WHERE settings_id = 1
  `).run(
    payload.minIntervalSeconds,
    payload.maxIntervalSeconds,
    payload.minDealsPerCycle,
    payload.maxDealsPerCycle
  );

  return result.changes === 1;
}

function clientDealGenerationSettings() {
  return database.prepare(`
    SELECT
      s.pricing_rule_id AS pricingRuleId,
      r.counterparty_id AS counterpartyId,
      'CLIENT' AS counterpartyType,
      external.counterparty_code AS counterpartyCode,
      external.counterparty_code_type AS counterpartyCodeType,
      p.counterparty_name AS counterpartyName,
      p.is_active AS counterpartyActive,
      r.trade_context_id AS tradeContextId,
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
      originating.originating_system_id AS originatingSystemId,
      originating.name AS originatingSystemName,
      originating.pricing_mode AS pricingMode,
      originating.is_active AS originatingSystemActive,
      s.min_base_ccy_amount_minor AS minBaseCcyAmountMinor,
      s.max_base_ccy_amount_minor AS maxBaseCcyAmountMinor,
      s.base_ccy_amount_step_minor AS baseCcyAmountStepMinor,
      s.base_ccy_fraction_digits AS baseCcyFractionDigits,
      s.buy_probability_percent AS buyProbabilityPercent,
      100 - s.buy_probability_percent AS sellProbabilityPercent,
      s.is_active AS active
    FROM client_deal_generation_settings s
    INNER JOIN pricing_rules r ON r.pricing_rule_id = s.pricing_rule_id
    INNER JOIN trading_counterparties p ON p.counterparty_id = r.counterparty_id
    INNER JOIN external_counterparties external ON external.counterparty_id = p.counterparty_id
    INNER JOIN trading_counterparty_roles role
      ON role.counterparty_id = p.counterparty_id AND role.role_code = 'CLIENT'
    INNER JOIN ccy_pair_options pair ON pair.ccy_pair_code = r.ccy_pair_code
    INNER JOIN ccy_options base_ccy ON base_ccy.ccy_code = pair.base_ccy_code
    INNER JOIN ccy_options quote_ccy ON quote_ccy.ccy_code = pair.quote_ccy_code
    INNER JOIN trade_contexts context ON context.trade_context_id = r.trade_context_id
    INNER JOIN servicing_locations location
      ON location.servicing_location_id = context.servicing_location_id
    LEFT JOIN accounting_systems accounting
      ON accounting.accounting_system_id = context.accounting_system_id
    INNER JOIN originating_systems originating
      ON originating.originating_system_id = context.originating_system_id
    WHERE originating.pricing_mode = 'AUTO_PRICED'
    ORDER BY p.counterparty_name, pair.ccy_pair_code, s.pricing_rule_id
  `).all().map(settings => ({
    ...settings,
    minBaseCcyAmount: Number(minorToMajor(
      settings.minBaseCcyAmountMinor,
      settings.baseCcyFractionDigits
    )),
    maxBaseCcyAmount: Number(minorToMajor(
      settings.maxBaseCcyAmountMinor,
      settings.baseCcyFractionDigits
    )),
    baseCcyAmountStep: Number(minorToMajor(
      settings.baseCcyAmountStepMinor,
      settings.baseCcyFractionDigits
    )),
    active: settings.active === 1,
    counterpartyActive: settings.counterpartyActive === 1,
    originatingSystemActive: settings.originatingSystemActive === 1
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
      && settings.counterpartyActive
      && settings.originatingSystemActive
      && settings.pricingMode === "AUTO_PRICED"
    );
}

function updateClientDealGenerationSettings(pricingRuleId, payload) {
  const result = database.prepare(`
    UPDATE client_deal_generation_settings
    SET
      min_base_ccy_amount_minor = ?,
      max_base_ccy_amount_minor = ?,
      base_ccy_amount_step_minor = ?,
      buy_probability_percent = ?,
      is_active = ?
    WHERE pricing_rule_id = ?
  `).run(
    payload.minBaseCcyAmountMinor,
    payload.maxBaseCcyAmountMinor,
    payload.baseCcyAmountStepMinor,
    payload.buyProbabilityPercent,
    payload.active ? 1 : 0,
    pricingRuleId
  );

  return result.changes === 1;
}

function ensureClientDealGenerationSettingsForPricingRule(pricingRuleId) {
  const rule = database.prepare(`
    SELECT
      r.pricing_rule_id,
      base_ccy.fraction_digits AS base_ccy_fraction_digits
    FROM pricing_rules r
    INNER JOIN trading_counterparty_roles role
      ON role.counterparty_id = r.counterparty_id AND role.role_code = 'CLIENT'
    INNER JOIN trade_contexts c ON c.trade_context_id = r.trade_context_id
    INNER JOIN originating_systems e ON e.originating_system_id = c.originating_system_id
    INNER JOIN ccy_pair_options pair ON pair.ccy_pair_code = r.ccy_pair_code
    INNER JOIN ccy_options base_ccy ON base_ccy.ccy_code = pair.base_ccy_code
    WHERE r.pricing_rule_id = ?
      AND e.pricing_mode = 'AUTO_PRICED'
  `).get(pricingRuleId);

  if (!rule) {
    return;
  }

  const defaults = defaultClientDealGenerationAmounts(rule.base_ccy_fraction_digits);
  database.prepare(`
    INSERT OR IGNORE INTO client_deal_generation_settings
      (
        pricing_rule_id,
        min_base_ccy_amount_minor,
        max_base_ccy_amount_minor,
        base_ccy_amount_step_minor,
        base_ccy_fraction_digits,
        buy_probability_percent,
        is_active
      )
    VALUES (?, ?, ?, ?, ?, 50, 1)
  `).run(
    rule.pricing_rule_id,
    defaults.minBaseCcyAmountMinor,
    defaults.maxBaseCcyAmountMinor,
    defaults.baseCcyAmountStepMinor,
    rule.base_ccy_fraction_digits
  );
}

function clientDeals() {
  return database.prepare(`
    SELECT
      e.trade_id AS tradeId,
      e.trade_id AS clientDealId,
      COALESCE(
        management.initial_position_management_mode,
        management.current_position_management_mode,
        'MANUAL'
      ) AS initialPositionManagementMode,
      COALESCE(
        management.current_position_management_mode,
        'MANUAL'
      ) AS currentPositionManagementMode,
      e.execution_timestamp AS executionTimestamp,
      e.received_timestamp AS receivedTimestamp,
      d.counterparty_id AS counterpartyId,
      d.trade_context_id AS tradeContextId,
      d.pricing_rule_id AS pricingRuleId,
      r.margin_percent AS pricingRuleMargin,
      d.transfer_rate AS transferRate,
      d.analytical_pnl_quote_minor AS analyticalPnlQuoteMinor,
      d.analytical_pnl_quote_fraction_digits AS analyticalPnlQuoteFractionDigits,
      d.comment,
      a.market_pulse_stream_status AS marketPulseStreamStatus,
      a.market_pulse_bid AS marketPulseBid,
      a.market_pulse_offer AS marketPulseOffer,
      a.market_pulse_timestamp AS marketPulseTimestamp,
      COALESCE(external.counterparty_code, internal.unit_code) AS clientCode,
      COALESCE(external.counterparty_code_type, 'INTERNAL_UNIT_CODE') AS clientCodeType,
      p.counterparty_name AS clientName,
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
    FROM client_deals d
    INNER JOIN trade_exposures e
      ON e.trade_id = d.trade_id AND e.trade_type = d.trade_type
    LEFT JOIN trade_position_management management
      ON management.trade_id = e.trade_id
      AND management.trade_type = e.trade_type
    INNER JOIN trading_counterparties p ON p.counterparty_id = d.counterparty_id
    LEFT JOIN external_counterparties external ON external.counterparty_id = p.counterparty_id
    LEFT JOIN internal_units internal ON internal.counterparty_id = p.counterparty_id
    INNER JOIN ccy_pair_options pair ON pair.ccy_pair_code = e.ccy_pair_code
    LEFT JOIN pricing_rules r ON r.pricing_rule_id = d.pricing_rule_id
    LEFT JOIN trade_market_snapshots a
      ON a.trade_id = e.trade_id AND a.trade_type = e.trade_type
    ORDER BY e.trade_id
  `).all().map(tradeRowWithMajorAmounts);
}

function clientDeal(clientDealId) {
  return clientDeals().find(deal => deal.clientDealId === Number(clientDealId)) || null;
}

function hedgeDeals() {
  return database.prepare(`
    SELECT
      e.trade_id AS tradeId,
      e.trade_id AS hedgeDealId,
      COALESCE(
        management.initial_position_management_mode,
        management.current_position_management_mode,
        'MANUAL'
      ) AS initialPositionManagementMode,
      COALESCE(
        management.current_position_management_mode,
        'MANUAL'
      ) AS currentPositionManagementMode,
      e.execution_timestamp AS executionTimestamp,
      e.received_timestamp AS receivedTimestamp,
      d.request_timestamp AS requestTimestamp,
      d.counterparty_id AS counterpartyId,
      d.trade_context_id AS tradeContextId,
      d.pricing_rule_id AS pricingRuleId,
      r.margin_percent AS pricingRuleMargin,
      d.transfer_rate AS transferRate,
      d.analytical_pnl_quote_minor AS analyticalPnlQuoteMinor,
      d.analytical_pnl_quote_fraction_digits AS analyticalPnlQuoteFractionDigits,
      a.market_pulse_stream_status AS marketPulseStreamStatus,
      a.market_pulse_bid AS marketPulseBid,
      a.market_pulse_offer AS marketPulseOffer,
      a.market_pulse_timestamp AS marketPulseTimestamp,
      COALESCE(external.counterparty_code, internal.unit_code) AS counterpartyCode,
      COALESCE(external.counterparty_code_type, 'INTERNAL_UNIT_CODE') AS counterpartyCodeType,
      p.counterparty_name AS counterpartyName,
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
    FROM hedge_deals d
    INNER JOIN trade_exposures e
      ON e.trade_id = d.trade_id AND e.trade_type = d.trade_type
    LEFT JOIN trade_position_management management
      ON management.trade_id = e.trade_id
      AND management.trade_type = e.trade_type
    INNER JOIN trading_counterparties p ON p.counterparty_id = d.counterparty_id
    LEFT JOIN external_counterparties external ON external.counterparty_id = p.counterparty_id
    LEFT JOIN internal_units internal ON internal.counterparty_id = p.counterparty_id
    INNER JOIN ccy_pair_options pair ON pair.ccy_pair_code = e.ccy_pair_code
    LEFT JOIN pricing_rules r ON r.pricing_rule_id = d.pricing_rule_id
    LEFT JOIN trade_market_snapshots a
      ON a.trade_id = e.trade_id AND a.trade_type = e.trade_type
    ORDER BY e.trade_id
  `).all().map(tradeRowWithMajorAmounts);
}

function hedgeDeal(hedgeDealId) {
  return hedgeDeals().find(deal => deal.hedgeDealId === Number(hedgeDealId)) || null;
}

function analyticalPnlReportFilters(searchParams) {
  const dateFrom = normalizedText(searchParams.get("dateFrom"));
  const dateTo = normalizedText(searchParams.get("dateTo"));
  const tradeType = normalizedText(searchParams.get("tradeType")).toUpperCase();
  const counterpartyCode = normalizedText(searchParams.get("counterpartyCode"));

  if (dateFrom && !isIsoCalendarDate(dateFrom)) {
    return { error: "Date From must be a valid date in YYYY-MM-DD format." };
  }

  if (dateTo && !isIsoCalendarDate(dateTo)) {
    return { error: "Date To must be a valid date in YYYY-MM-DD format." };
  }

  if (dateFrom && dateTo && dateFrom > dateTo) {
    return { error: "Date From must not be later than Date To." };
  }

  if (tradeType && !["CLIENT_DEAL", "HEDGE_DEAL"].includes(tradeType)) {
    return { error: "Trade Type must be CLIENT_DEAL or HEDGE_DEAL." };
  }

  if (counterpartyCode.length > COUNTERPARTY_CODE_MAX_LENGTH) {
    return {
      error: `Counterparty Code must not exceed ${COUNTERPARTY_CODE_MAX_LENGTH} characters.`
    };
  }

  return { dateFrom, dateTo, tradeType, counterpartyCode };
}

function analyticalPnlReport(filters) {
  const where = [];
  const parameters = [];

  if (filters.dateFrom) {
    where.push("exposure.trade_date >= ?");
    parameters.push(filters.dateFrom);
  }

  if (filters.dateTo) {
    where.push("exposure.trade_date <= ?");
    parameters.push(filters.dateTo);
  }

  if (filters.tradeType) {
    where.push("deal.trade_type = ?");
    parameters.push(filters.tradeType);
  }

  if (filters.counterpartyCode) {
    where.push(`
      instr(
        upper(COALESCE(external.counterparty_code, internal.unit_code)),
        upper(?)
      ) > 0
    `);
    parameters.push(filters.counterpartyCode);
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
  const rows = database.prepare(analyticalPnlReportQuery(whereSql))
    .all(...parameters)
    .map(tradeRowWithMajorAmounts);
  const summary = analyticalPnlSummary(rows);

  summary.totals.forEach(total => {
    total.analyticalPnl = minorToMajor(
      total.analyticalPnlQuoteMinor,
      total.analyticalPnlQuoteFractionDigits
    );
    total.quoteCcyAmount = minorToMajor(
      total.quoteCcyAmountMinor,
      total.quoteCcyFractionDigits
    );
  });

  return {
    filters,
    rows,
    summary
  };
}

function positions() {
  return database.prepare(`
    SELECT
      e.trade_id AS tradeId,
      e.trade_type AS tradeType,
      COALESCE(
        management.initial_position_management_mode,
        management.current_position_management_mode,
        'MANUAL'
      ) AS initialPositionManagementMode,
      COALESCE(
        management.current_position_management_mode,
        'MANUAL'
      ) AS currentPositionManagementMode,
      COALESCE(
        management.current_position_management_mode,
        'MANUAL'
      ) AS positionManagementMode,
      management.updated_at AS positionManagementModeChangedAt,
      e.execution_timestamp AS executionTimestamp,
      e.received_timestamp AS receivedTimestamp,
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
      e.quote_ccy_value_date AS quoteCcyValueDate,
      COALESCE(c.counterparty_id, h.counterparty_id) AS counterpartyId,
      COALESCE(c.trade_context_id, h.trade_context_id) AS tradeContextId,
      COALESCE(c.pricing_rule_id, h.pricing_rule_id) AS pricingRuleId,
      r.margin_percent AS pricingRuleMargin,
      COALESCE(
        c.transfer_rate,
        h.transfer_rate,
        CASE
          WHEN e.trade_type IN ('BATCH_BALANCE_TRADE', 'BATCH_POSITION_OUT')
            THEN e.trade_rate
        END
      ) AS transferRate,
      COALESCE(
        c.analytical_pnl_quote_minor,
        h.analytical_pnl_quote_minor
      ) AS analyticalPnlQuoteMinor,
      COALESCE(
        c.analytical_pnl_quote_fraction_digits,
        h.analytical_pnl_quote_fraction_digits
      ) AS analyticalPnlQuoteFractionDigits,
      c.comment,
      COALESCE(external.counterparty_code, internal.unit_code) AS counterpartyCode,
      COALESCE(external.counterparty_code_type, 'INTERNAL_UNIT_CODE') AS counterpartyCodeType,
      p.counterparty_name AS counterpartyName,
      a.market_pulse_stream_status AS marketPulseStreamStatus,
      a.market_pulse_bid AS marketPulseBid,
      a.market_pulse_offer AS marketPulseOffer,
      a.market_pulse_timestamp AS marketPulseTimestamp,
      technical_origin.batch_id AS batchId,
      CASE
        WHEN technical_origin.member_role = 'POSITION_OUT' THEN 'POSITION_OUT'
      END AS outputRole,
      EXISTS
      (
        SELECT 1
        FROM batch_members historical_member
        INNER JOIN batches historical_batch
          ON historical_batch.batch_id = historical_member.batch_id
        WHERE historical_member.trade_id = e.trade_id
          AND historical_member.trade_type = e.trade_type
          AND historical_member.member_role IN ('TRADE', 'BALANCE_TRADE')
          AND historical_batch.batch_status = 'ROLLED_BACK'
      ) AS historicalBatchMember
    FROM trade_exposures e
    INNER JOIN ccy_pair_options pair ON pair.ccy_pair_code = e.ccy_pair_code
    LEFT JOIN trade_position_management management
      ON management.trade_id = e.trade_id
      AND management.trade_type = e.trade_type
    LEFT JOIN client_deals c
      ON c.trade_id = e.trade_id AND c.trade_type = e.trade_type
    LEFT JOIN hedge_deals h
      ON h.trade_id = e.trade_id AND h.trade_type = e.trade_type
    LEFT JOIN trading_counterparties p
      ON p.counterparty_id = COALESCE(c.counterparty_id, h.counterparty_id)
    LEFT JOIN external_counterparties external ON external.counterparty_id = p.counterparty_id
    LEFT JOIN internal_units internal ON internal.counterparty_id = p.counterparty_id
    LEFT JOIN pricing_rules r
      ON r.pricing_rule_id = COALESCE(c.pricing_rule_id, h.pricing_rule_id)
    LEFT JOIN trade_market_snapshots a
      ON a.trade_id = e.trade_id AND a.trade_type = e.trade_type
    LEFT JOIN batch_members technical_origin
      ON technical_origin.trade_id = e.trade_id
      AND technical_origin.trade_type = e.trade_type
      AND technical_origin.member_role IN ('BALANCE_TRADE', 'POSITION_OUT')
    WHERE e.trade_type IN
      ('CLIENT_DEAL', 'HEDGE_DEAL', 'BATCH_BALANCE_TRADE', 'BATCH_POSITION_OUT')
      AND NOT EXISTS
      (
        SELECT 1
        FROM batch_members member
        INNER JOIN batches batch ON batch.batch_id = member.batch_id
        WHERE member.trade_id = e.trade_id
          AND member.trade_type = e.trade_type
          AND member.member_role IN ('TRADE', 'BALANCE_TRADE')
          AND batch.batch_status = ?
      )
    ORDER BY e.trade_id
  `).all(BATCH_STATUS.FORMED).map(row => ({
    ...tradeRowWithMajorAmounts(row),
    clientDealId: row.tradeType === "CLIENT_DEAL" ? row.tradeId : undefined,
    hedgeDealId: row.tradeType === "HEDGE_DEAL" ? row.tradeId : undefined,
    clientCode: row.tradeType === "CLIENT_DEAL" ? row.counterpartyCode : undefined,
    clientCodeType: row.tradeType === "CLIENT_DEAL" ? row.counterpartyCodeType : undefined,
    clientName: row.tradeType === "CLIENT_DEAL" ? row.counterpartyName : undefined
  }));
}

function batches() {
  return database.prepare(`
    SELECT
      batch.batch_id AS batchId,
      batch.ccy_pair_code AS ccyPairCode,
      batch.batch_status AS batchStatus,
      audit.trade_date AS tradeDate,
      audit.tenor,
      audit.base_ccy_value_date AS baseCcyValueDate,
      audit.quote_ccy_value_date AS quoteCcyValueDate,
      audit.base_ccy_fraction_digits AS baseCcyFractionDigits,
      audit.quote_ccy_fraction_digits AS quoteCcyFractionDigits,
      batch.window_opened_at AS windowOpenedAt,
      batch.window_closed_at AS windowClosedAt,
      batch.created_at AS formedAt,
      batch.formation_reason_code AS formationReasonCode,
      batch.formation_reason_details_json AS formationReasonDetailsJson,
      audit.source_trade_count AS sourceTradeCount,
      batch.rolled_back_at AS rolledBackAt
    FROM batches batch
    LEFT JOIN v_batch_formation_audit audit
      ON audit.batch_id = batch.batch_id
    ORDER BY batch.batch_id DESC
  `).all().map(batchWithAuditFields);
}

function ensureMarketQuoteSimulationSettings(sqlite) {
  if (!sqliteTableExists(sqlite, "market_quote_simulation_settings")) {
    return;
  }

  const columns = tableColumnNames(sqlite, "market_quote_simulation_settings");

  if (!columns.has("one_way_duration_seconds")) {
    sqlite.exec(`
      ALTER TABLE market_quote_simulation_settings
      ADD COLUMN one_way_duration_seconds INTEGER NOT NULL DEFAULT ${DEFAULT_ONE_WAY_DURATION_SECONDS}
        CHECK (
          typeof(one_way_duration_seconds) = 'integer'
          AND one_way_duration_seconds BETWEEN ${MIN_ONE_WAY_DURATION_SECONDS} AND ${MAX_ONE_WAY_DURATION_SECONDS}
        )
    `);
  }

  if (!columns.has("fluctuation_spreads")) {
    sqlite.exec(`
      ALTER TABLE market_quote_simulation_settings
      ADD COLUMN fluctuation_spreads REAL NOT NULL DEFAULT ${DEFAULT_FLUCTUATION_SPREADS}
        CHECK (
          typeof(fluctuation_spreads) IN ('integer', 'real')
          AND fluctuation_spreads BETWEEN 0 AND ${MAX_FLUCTUATION_SPREADS}
        )
    `);
  }
}

function batchFormationAudit() {
  return database.prepare(`
    SELECT
      batch_id AS batchId,
      batch_status AS batchStatus,
      ccy_pair_code AS ccyPairCode,
      trade_date AS tradeDate,
      tenor,
      base_ccy_value_date AS baseCcyValueDate,
      quote_ccy_value_date AS quoteCcyValueDate,
      base_ccy_fraction_digits AS baseCcyFractionDigits,
      quote_ccy_fraction_digits AS quoteCcyFractionDigits,
      window_opened_at AS windowOpenedAt,
      window_closed_at AS windowClosedAt,
      formed_at AS formedAt,
      formation_reason_code AS formationReasonCode,
      formation_reason_details_json AS formationReasonDetailsJson,
      source_trade_count AS sourceTradeCount,
      rolled_back_at AS rolledBackAt
    FROM v_batch_formation_audit
    ORDER BY batch_id DESC
  `).all().map(batchWithAuditFields);
}

function batchWithAuditFields(row) {
  const batch = batchWithFormationReason(row);
  const windowOpenedAtMilliseconds = Date.parse(row.windowOpenedAt || "");
  const windowClosedAtMilliseconds = Date.parse(row.windowClosedAt || "");
  const windowDurationMs = Number.isFinite(windowOpenedAtMilliseconds)
    && Number.isFinite(windowClosedAtMilliseconds)
    && windowClosedAtMilliseconds >= windowOpenedAtMilliseconds
    ? windowClosedAtMilliseconds - windowOpenedAtMilliseconds
    : null;
  const hasBatchingKey = row.tradeDate !== null
    && row.tradeDate !== undefined
    && String(row.tradeDate).trim() !== "";

  return {
    batchId: Number(row.batchId),
    ccyPairCode: row.ccyPairCode,
    batchingKey: hasBatchingKey
      ? {
          ccyPairCode: row.ccyPairCode,
          tradeDate: row.tradeDate,
          tenor: row.tenor,
          baseCcyValueDate: row.baseCcyValueDate,
          quoteCcyValueDate: row.quoteCcyValueDate,
          baseCcyFractionDigits: Number(row.baseCcyFractionDigits),
          quoteCcyFractionDigits: Number(row.quoteCcyFractionDigits)
        }
      : null,
    windowOpenedAt: row.windowOpenedAt || null,
    windowClosedAt: row.windowClosedAt || null,
    formedAt: row.formedAt,
    windowDurationMs,
    formationReasonCode: batch.formationReasonCode,
    formationReasonDetails: batch.formationReasonDetails,
    formationReasonDescription: batch.formationReasonDescription,
    sourceTradeCount: row.sourceTradeCount === null || row.sourceTradeCount === undefined
      ? null
      : Number(row.sourceTradeCount),
    batchStatus: row.batchStatus,
    rolledBackAt: row.rolledBackAt || null
  };
}

function parsedBatchFormationReasonDetails(value) {
  try {
    const details = JSON.parse(String(value || "{}"));
    return details && typeof details === "object" && !Array.isArray(details)
      ? details
      : {};
  } catch {
    return {};
  }
}

function formationReasonTradeCountLabel(details) {
  const count = Number(details?.selectedTradeCount);

  return Number.isInteger(count) && count > 0
    ? `${count} ${count === 1 ? "trade" : "trades"} selected.`
    : "";
}

function conciseBatchReasonPercent(value) {
  const percent = Number(value);

  if (!Number.isFinite(percent)) {
    return String(value ?? "");
  }

  return percent.toFixed(6).replace(/\.?0+$/, "");
}

function batchFormationReasonDescription(reasonCode, details) {
  const tradeCountLabel = formationReasonTradeCountLabel(details);

  if (reasonCode === BATCH_FORMATION_REASON_CODE.MAX_INTERVAL_REACHED) {
    const durationMilliseconds = Number(
      details?.windowDurationMilliseconds
        ?? details?.oldestTradeAgeMilliseconds
    );
    const durationSeconds = Number.isFinite(durationMilliseconds)
      ? (durationMilliseconds / 1000).toFixed(
          durationMilliseconds % 1000 === 0 ? 0 : 3
        )
      : null;
    const intervalSeconds = Number(details?.maxIntervalSeconds);
    const intervalLabel = Number.isFinite(intervalSeconds)
      ? `${intervalSeconds} sec`
      : "the configured limit";
    const durationLabel = durationSeconds === null
      ? "the configured limit"
      : `${durationSeconds} sec`;

    return [
      `Maximum Batching Interval reached: the Batching Window was open `
        + `${durationLabel} (limit ${intervalLabel}).`,
      tradeCountLabel
    ].filter(Boolean).join(" ");
  }

  if (
    reasonCode ===
      BATCH_FORMATION_REASON_CODE.TRANSFER_RATE_CORRIDOR_BREACHED
  ) {
    const acceptedRange = details?.acceptedMinTransferRate
      && details?.acceptedMaxTransferRate
      ? `${details.acceptedMinTransferRate}-${details.acceptedMaxTransferRate}`
      : "the accepted range";
    const acceptedSpread = details?.acceptedSpreadPercent === null
      || details?.acceptedSpreadPercent === undefined
      ? ""
      : ` (${conciseBatchReasonPercent(details.acceptedSpreadPercent)}%)`;
    const limit = details?.maxSpreadPercent
      ? `${conciseBatchReasonPercent(details.maxSpreadPercent)}%`
      : "the configured limit";
    const incoming = details?.incomingTransferRate
      ? `Trade #${details.breachingTradeId} at ${details.incomingTransferRate}`
      : "The incoming trade";
    const breachedSpread = details?.breachedSpreadPercent === null
      || details?.breachedSpreadPercent === undefined
      ? ""
      : ` to ${conciseBatchReasonPercent(details.breachedSpreadPercent)}%`;

    return [
      `Transfer Rate corridor breached: accepted ${acceptedRange}${acceptedSpread}, `
        + `limit ${limit}; ${incoming} would widen the full spread${breachedSpread}.`,
      tradeCountLabel
    ].filter(Boolean).join(" ");
  }

  return ["Manual selection.", tradeCountLabel].filter(Boolean).join(" ");
}

function batchWithFormationReason(batch) {
  const formationReasonCode = BATCH_FORMATION_REASON_CODES.includes(
    batch?.formationReasonCode
  )
    ? batch.formationReasonCode
    : BATCH_FORMATION_REASON_CODE.MANUAL_SELECTION;
  const formationReasonDetails = parsedBatchFormationReasonDetails(
    batch?.formationReasonDetailsJson
  );

  return {
    ...batch,
    formationReasonCode,
    formationReasonDetails,
    formationReasonDescription: batchFormationReasonDescription(
      formationReasonCode,
      formationReasonDetails
    )
  };
}

function batchTrades() {
  return database.prepare(`
    WITH batch_trades AS
    (
      SELECT
        member.batch_id,
        member.trade_id,
        member.trade_type,
        member.member_role AS batch_role
      FROM batch_members member
      WHERE member.member_role IN ('BALANCE_TRADE', 'POSITION_OUT')
    )
    SELECT
      t.trade_id AS batchTradeId,
      t.batch_id AS batchPairId,
      t.batch_id AS batchId,
      t.batch_role AS batchRole,
      t.trade_type AS tradeType,
      t.trade_id AS tradeId,
      b.created_at AS createdAt,
      b.batch_status AS originatingBatchStatus,
      e.execution_timestamp AS executionTimestamp,
      e.received_timestamp AS receivedTimestamp,
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
      e.trade_rate AS transferRate,
      e.tenor,
      e.base_ccy_value_date AS baseCcyValueDate,
      e.quote_ccy_value_date AS quoteCcyValueDate,
      (
        SELECT consuming_member.batch_id
        FROM batch_members consuming_member
        INNER JOIN batches consuming_batch
          ON consuming_batch.batch_id = consuming_member.batch_id
        WHERE consuming_member.trade_id = t.trade_id
          AND consuming_member.trade_type = t.trade_type
          AND consuming_member.member_role = 'TRADE'
          AND consuming_member.batch_id <> t.batch_id
        ORDER BY
          CASE consuming_batch.batch_status
            WHEN 'FORMED' THEN 1
            WHEN 'BUILDING' THEN 2
            ELSE 3
          END,
          consuming_member.batch_id DESC
        LIMIT 1
      ) AS consumedByBatchId,
      (
        SELECT consuming_batch.batch_status
        FROM batch_members consuming_member
        INNER JOIN batches consuming_batch
          ON consuming_batch.batch_id = consuming_member.batch_id
        WHERE consuming_member.trade_id = t.trade_id
          AND consuming_member.trade_type = t.trade_type
          AND consuming_member.member_role = 'TRADE'
          AND consuming_member.batch_id <> t.batch_id
        ORDER BY
          CASE consuming_batch.batch_status
            WHEN 'FORMED' THEN 1
            WHEN 'BUILDING' THEN 2
            ELSE 3
          END,
          consuming_member.batch_id DESC
        LIMIT 1
      ) AS consumedByBatchStatus,
      CASE
        WHEN e.base_ccy_side IN ('BUY', 'SELL')
          AND e.trade_rate IS NOT NULL
          AND (
            t.trade_type <> 'BATCH_BALANCE_TRADE'
            OR b.batch_status = 'ROLLED_BACK'
          )
          AND NOT EXISTS
          (
            SELECT 1
            FROM batch_members consuming_member
            INNER JOIN batches consuming_batch
              ON consuming_batch.batch_id = consuming_member.batch_id
            WHERE consuming_member.trade_id = t.trade_id
              AND consuming_member.trade_type = t.trade_type
              AND consuming_member.member_role = 'TRADE'
              AND consuming_batch.batch_status IN
                (${BATCH_MEMBERSHIP_BLOCKING_STATUS_PLACEHOLDERS})
          )
        THEN 1
        ELSE 0
      END AS availableForBatching
    FROM batch_trades t
    INNER JOIN batches b ON b.batch_id = t.batch_id
    INNER JOIN trade_exposures e
      ON e.trade_id = t.trade_id AND e.trade_type = t.trade_type
    INNER JOIN ccy_pair_options pair ON pair.ccy_pair_code = e.ccy_pair_code
    WHERE b.batch_status IN ('FORMED', 'ROLLED_BACK')
    ORDER BY t.batch_id, t.trade_id
  `).all(...BATCH_MEMBERSHIP_BLOCKING_STATUSES)
    .map(tradeRowWithMajorAmounts);
}

function batchContent(batchId) {
  const rows = database.prepare(`
    WITH selected_batch (batch_id) AS
    (
      VALUES (?)
    ),
    batch_content AS
    (
      SELECT
        member.batch_id,
        CASE member.member_role
          WHEN 'POSITION_OUT' THEN 'OUTPUT'
          ELSE 'MEMBER'
        END AS relation_type,
        member.member_role AS content_role,
        member.trade_id,
        member.trade_type
      FROM batch_members member
      INNER JOIN selected_batch selected
        ON selected.batch_id = member.batch_id
    ),
    technical_origins AS
    (
      SELECT
        trade_id,
        trade_type,
        batch_id AS created_by_batch_id
      FROM batch_members
      WHERE member_role IN ('BALANCE_TRADE', 'POSITION_OUT')
    )
    SELECT
      content.relation_type AS relationType,
      content.content_role AS contentRole,
      exposure.trade_id AS tradeId,
      exposure.trade_type AS tradeType,
      exposure.execution_timestamp AS executionTimestamp,
      exposure.received_timestamp AS receivedTimestamp,
      exposure.trade_date AS tradeDate,
      exposure.ccy_pair_code AS ccyPairCode,
      pair.base_ccy_code || '/' || pair.quote_ccy_code AS currencyPair,
      pair.base_ccy_code AS baseCcyCode,
      pair.quote_ccy_code AS quoteCcyCode,
      exposure.base_ccy_side AS side,
      exposure.dealt_ccy_code AS dealtCcyCode,
      exposure.base_ccy_amount_minor AS baseCcyAmountMinor,
      exposure.base_ccy_fraction_digits AS baseCcyFractionDigits,
      exposure.quote_ccy_amount_minor AS quoteCcyAmountMinor,
      exposure.quote_ccy_fraction_digits AS quoteCcyFractionDigits,
      exposure.trade_rate AS tradeRate,
      CASE exposure.trade_type
        WHEN 'CLIENT_DEAL' THEN client.transfer_rate
        WHEN 'HEDGE_DEAL' THEN hedge.transfer_rate
        ELSE exposure.trade_rate
      END AS transferRate,
      CASE exposure.trade_type
        WHEN 'CLIENT_DEAL' THEN client.analytical_pnl_quote_minor
        WHEN 'HEDGE_DEAL' THEN hedge.analytical_pnl_quote_minor
        ELSE 0
      END AS analyticalPnlQuoteMinor,
      CASE exposure.trade_type
        WHEN 'CLIENT_DEAL' THEN client.analytical_pnl_quote_fraction_digits
        WHEN 'HEDGE_DEAL' THEN hedge.analytical_pnl_quote_fraction_digits
        ELSE exposure.quote_ccy_fraction_digits
      END AS analyticalPnlQuoteFractionDigits,
      exposure.tenor,
      exposure.base_ccy_value_date AS baseCcyValueDate,
      exposure.quote_ccy_value_date AS quoteCcyValueDate,
      COALESCE(client.counterparty_id, hedge.counterparty_id) AS counterpartyId,
      COALESCE(external.counterparty_code, internal.unit_code) AS counterpartyCode,
      COALESCE(external.counterparty_code_type, 'INTERNAL_UNIT_CODE') AS counterpartyCodeType,
      counterparty.counterparty_name AS counterpartyName,
      origins.created_by_batch_id AS createdByBatchId
    FROM batch_content content
    INNER JOIN trade_exposures exposure
      ON exposure.trade_id = content.trade_id
      AND exposure.trade_type = content.trade_type
    INNER JOIN ccy_pair_options pair
      ON pair.ccy_pair_code = exposure.ccy_pair_code
    LEFT JOIN client_deals client
      ON client.trade_id = exposure.trade_id
      AND client.trade_type = exposure.trade_type
    LEFT JOIN hedge_deals hedge
      ON hedge.trade_id = exposure.trade_id
      AND hedge.trade_type = exposure.trade_type
    LEFT JOIN trading_counterparties counterparty
      ON counterparty.counterparty_id = COALESCE(client.counterparty_id, hedge.counterparty_id)
    LEFT JOIN external_counterparties external ON external.counterparty_id = counterparty.counterparty_id
    LEFT JOIN internal_units internal ON internal.counterparty_id = counterparty.counterparty_id
    LEFT JOIN technical_origins origins
      ON origins.trade_id = exposure.trade_id
      AND origins.trade_type = exposure.trade_type
    ORDER BY
      CASE content.relation_type WHEN 'MEMBER' THEN 1 ELSE 2 END,
      CASE content.content_role
        WHEN 'TRADE' THEN 1
        WHEN 'BALANCE_TRADE' THEN 2
        ELSE 3
      END,
      exposure.trade_id
  `).all(batchId).map(batchBalanceRow);

  return rows.reduce((result, row) => {
    const { relationType, contentRole, ...trade } = row;

    if (relationType === "MEMBER") {
      result.members.push({ ...trade, memberRole: contentRole });
    } else {
      result.outputs.push({ ...trade, outputRole: contentRole });
    }

    return result;
  }, { members: [], outputs: [] });
}

function batchSourceTrades(tradeIds) {
  const placeholders = tradeIds.map(() => "?").join(", ");
  const sourceTrades = database.prepare(`
    SELECT
      e.trade_id AS tradeId,
      e.trade_type AS tradeType,
      e.ccy_pair_code AS ccyPairCode,
      pair.base_ccy_code AS baseCcyCode,
      pair.quote_ccy_code AS quoteCcyCode,
      e.trade_date AS tradeDate,
      e.base_ccy_side AS side,
      e.dealt_ccy_code AS dealtCcyCode,
      e.base_ccy_amount_minor AS baseCcyAmountMinor,
      e.base_ccy_fraction_digits AS baseCcyFractionDigits,
      e.quote_ccy_amount_minor AS quoteCcyAmountMinor,
      e.quote_ccy_fraction_digits AS quoteCcyFractionDigits,
      COALESCE(
        c.transfer_rate,
        h.transfer_rate,
        CASE
          WHEN e.trade_type IN ('BATCH_BALANCE_TRADE', 'BATCH_POSITION_OUT')
            THEN e.trade_rate
        END
      ) AS transferRate,
      e.tenor,
      e.base_ccy_value_date AS baseCcyValueDate,
      e.quote_ccy_value_date AS quoteCcyValueDate,
      pair.default_quote_decimals AS rateFractionDigits,
      management.current_position_management_mode AS currentPositionManagementMode
    FROM trade_exposures e
    INNER JOIN ccy_pair_options pair ON pair.ccy_pair_code = e.ccy_pair_code
    INNER JOIN trade_position_management management
      ON management.trade_id = e.trade_id
      AND management.trade_type = e.trade_type
    LEFT JOIN client_deals c
      ON c.trade_id = e.trade_id AND c.trade_type = e.trade_type
    LEFT JOIN hedge_deals h
      ON h.trade_id = e.trade_id AND h.trade_type = e.trade_type
    WHERE e.trade_id IN (${placeholders})
      AND
      (
        e.trade_type IN ('CLIENT_DEAL', 'HEDGE_DEAL')
        OR (
          e.trade_type IN ('BATCH_BALANCE_TRADE', 'BATCH_POSITION_OUT')
          AND e.base_ccy_side IN ('BUY', 'SELL')
          AND e.trade_rate IS NOT NULL
          AND
          (
            (
              e.trade_type = 'BATCH_POSITION_OUT'
              AND EXISTS
              (
                SELECT 1
                FROM batch_position_outputs source_output
                INNER JOIN batch_members origin
                  ON origin.trade_id = source_output.trade_id
                  AND origin.trade_type = source_output.trade_type
                  AND origin.member_role = 'POSITION_OUT'
                INNER JOIN batches source_batch
                  ON source_batch.batch_id = origin.batch_id
                WHERE source_output.trade_id = e.trade_id
                  AND source_output.trade_type = e.trade_type
                  AND source_batch.batch_status IN ('FORMED', 'ROLLED_BACK')
              )
            )
            OR (
              e.trade_type = 'BATCH_BALANCE_TRADE'
              AND EXISTS
              (
                SELECT 1
                FROM batch_balance_trades source_balance_trade
                INNER JOIN batch_members origin
                  ON origin.trade_id = source_balance_trade.trade_id
                  AND origin.trade_type = source_balance_trade.trade_type
                  AND origin.member_role = 'BALANCE_TRADE'
                INNER JOIN batches source_batch
                  ON source_batch.batch_id = origin.batch_id
                WHERE source_balance_trade.trade_id = e.trade_id
                  AND source_balance_trade.trade_type = e.trade_type
                  AND source_batch.batch_status = 'ROLLED_BACK'
              )
            )
          )
        )
      )
      AND NOT EXISTS
      (
        SELECT 1
        FROM batch_members m
        INNER JOIN batches b ON b.batch_id = m.batch_id
        WHERE m.trade_id = e.trade_id
          AND m.trade_type = e.trade_type
          AND m.member_role = 'TRADE'
          AND b.batch_status IN
            (${BATCH_MEMBERSHIP_BLOCKING_STATUS_PLACEHOLDERS})
      )
    ORDER BY e.trade_id
  `).all(...tradeIds, ...BATCH_MEMBERSHIP_BLOCKING_STATUSES);
  const foundTradeIds = new Set(sourceTrades.map(trade => trade.tradeId));
  const missingTradeIds = tradeIds.filter(tradeId => !foundTradeIds.has(tradeId));

  if (missingTradeIds.length > 0) {
    const error = new Error(
      `Trade ${missingTradeIds.join(", ")} was not found or is not available `
        + "for batching."
    );
    error.code = "BATCH_SOURCE_TRADE_NOT_FOUND";
    throw error;
  }

  const missingTransferRate = sourceTrades.find(trade => trade.transferRate === null);

  if (missingTransferRate) {
    const error = new Error(
      `Trade ${missingTransferRate.tradeId} requires transfer_rate before batching.`
    );
    error.code = "BATCH_TRANSFER_RATE_REQUIRED";
    throw error;
  }

  return sourceTrades;
}

function saveFormedBatch({
  idempotencyKey,
  sourceTrades,
  formation,
  formationReason,
  formationTiming
}) {
    const firstSourceTrade = sourceTrades[0];
    const pair = ccyPairOption(firstSourceTrade.ccyPairCode);

    if (!pair
      || firstSourceTrade.baseCcyCode !== pair.baseCcy
      || firstSourceTrade.quoteCcyCode !== pair.quoteCcy
      || firstSourceTrade.baseCcyFractionDigits
        !== pair.baseCurrencyFractionDigits
      || firstSourceTrade.quoteCcyFractionDigits
        !== pair.quoteCurrencyFractionDigits) {
      const error = new RangeError(
        "Selected trades use currency precision that differs from current Reference Data."
      );
      error.code = "INCOMPATIBLE_BATCH_SELECTION";
      throw error;
    }

    const batchResult = database.prepare(`
      INSERT INTO batches
        (
          idempotency_key,
          ccy_pair_code,
          formation_reason_code,
          formation_reason_details_json,
          window_opened_at,
          window_closed_at
        )
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      idempotencyKey,
      firstSourceTrade.ccyPairCode,
      formationReason.reasonCode,
      formationReason.detailsJson,
      formationTiming.windowOpenedAt,
      formationTiming.windowClosedAt
    );
    const batchId = Number(batchResult.lastInsertRowid);
    const insertExposure = database.prepare(`
      INSERT INTO trade_exposures
        (
          execution_timestamp,
          received_timestamp,
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
    const insertMember = database.prepare(`
      INSERT INTO batch_members (batch_id, trade_id, trade_type, member_role)
      VALUES (?, ?, ?, ?)
    `);
    const insertBalanceTrade = database.prepare(`
      INSERT INTO batch_balance_trades (trade_id, trade_type)
      VALUES (?, ?)
    `);
    const insertOutput = database.prepare(`
      INSERT INTO batch_position_outputs (trade_id, trade_type)
      VALUES (?, ?)
    `);
    const insertQuoteCashOutput = database.prepare(`
      INSERT INTO batch_quote_cash_outputs
        (
          batch_id,
          quote_ccy_code,
          quote_balance_contribution_minor,
          quote_ccy_fraction_digits,
          quote_ccy_value_date,
          created_at
        )
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (const sourceTrade of sourceTrades) {
      insertMember.run(
        batchId,
        sourceTrade.tradeId,
        sourceTrade.tradeType,
        BATCH_MEMBER_ROLE.SOURCE_TRADE
      );
    }

    const createdTradeIds = [formation.balanceTrade, formation.positionOut]
      .filter(Boolean)
      .map(trade => {
      const exposureResult = insertExposure.run(
        trade.executionTimestamp,
        trade.receivedTimestamp,
        trade.tradeType,
        trade.tradeDate,
        trade.ccyPairCode,
        trade.side,
        trade.dealtCcyCode,
        minorToSafeInteger(trade.baseCcyAmountMinor, "Batch Base Ccy Amount Minor"),
        trade.baseCcyFractionDigits,
        minorToSafeInteger(trade.quoteCcyAmountMinor, "Batch Quote Ccy Amount Minor"),
        trade.quoteCcyFractionDigits,
        trade.tradeRate,
        trade.tenor,
        trade.baseCcyValueDate,
        trade.quoteCcyValueDate
      );
      const tradeId = Number(exposureResult.lastInsertRowid);

      materializeTradePositionModeState(database, {
        tradeId,
        tradeType: trade.tradeType,
        positionManagementMode: formation.positionManagementMode
      });

      if (trade.tradeType === "BATCH_BALANCE_TRADE") {
        insertBalanceTrade.run(tradeId, trade.tradeType);
        insertMember.run(
          batchId,
          tradeId,
          trade.tradeType,
          BATCH_MEMBER_ROLE.BALANCE_TRADE
        );
      } else {
        insertOutput.run(tradeId, trade.tradeType);
        insertMember.run(
          batchId,
          tradeId,
          trade.tradeType,
          BATCH_MEMBER_ROLE.POSITION_OUT
        );
      }
      return tradeId;
    });
    insertQuoteCashOutput.run(
      batchId,
      formation.quoteCashOut.quoteCcyCode,
      minorToSafeInteger(
        formation.quoteCashOut.quoteBalanceContributionMinor,
        "Batch Quote Cash Balance Contribution Minor"
      ),
      formation.quoteCashOut.quoteCcyFractionDigits,
      formation.quoteCashOut.quoteCcyValueDate,
      formation.quoteCashOut.createdAt
    );

    database.prepare(`
      UPDATE batches
      SET batch_status = 'FORMED'
      WHERE batch_id = ? AND batch_status = 'BUILDING'
    `).run(batchId);

    return {
      ...completedBatchResult(batchId),
      batchPairId: batchId,
      sourceTradeIds: formation.sourceTradeIds,
      sourceNetSide: formation.sourceNetSide,
      sourceNetBaseCcyAmountMinor: minorToSafeInteger(
        formation.sourceNetBaseCcyAmountMinor,
        "Source Net Base Ccy Amount Minor"
      ),
      sourceNetBaseCcyFractionDigits: formation.sourceNetBaseCcyFractionDigits,
      sourceNetBaseCcyAmount: Number(minorToMajor(
        formation.sourceNetBaseCcyAmountMinor,
        formation.sourceNetBaseCcyFractionDigits
      )),
      sourceNetTransferQuoteAmountMinor: minorToSafeInteger(
        formation.sourceNetTransferQuoteAmountMinor,
        "Source Net Transfer Quote Amount Minor"
      ),
      sourceNetTransferQuoteFractionDigits:
        formation.sourceNetTransferQuoteFractionDigits,
      sourceNetTransferQuoteAmount: Number(minorToMajor(
        formation.sourceNetTransferQuoteAmountMinor,
        formation.sourceNetTransferQuoteFractionDigits
      )),
      netQuoteCcyAmountMinorBeforeCash: minorToSafeInteger(
        formation.netQuoteCcyAmountMinorBeforeCash,
        "Batch Net Quote Ccy Amount Minor Before Cash"
      ),
      balancingRate: formation.balanceTrade?.tradeRate ?? null,
      roundingResidualQuoteAmountMinor: minorToSafeInteger(
        formation.roundingResidualQuoteAmountMinor,
        "Batch Rounding Residual Quote Amount Minor"
      ),
      roundingResidualQuoteFractionDigits:
        formation.roundingResidualQuoteFractionDigits,
      roundingResidualQuoteAmount: Number(minorToMajor(
        formation.roundingResidualQuoteAmountMinor,
        formation.roundingResidualQuoteFractionDigits
      )),
      createdTradeIds
    };
}

function completedBatchResult(batchId) {
  const batchRecord = database.prepare(`
    SELECT
      batch_id AS batchId,
      idempotency_key AS idempotencyKey,
      ccy_pair_code AS ccyPairCode,
      batch_status AS batchStatus,
      formation_reason_code AS formationReasonCode,
      formation_reason_details_json AS formationReasonDetailsJson,
      window_opened_at AS windowOpenedAt,
      window_closed_at AS windowClosedAt,
      created_at AS formedAt,
      rolled_back_at AS rolledBackAt
    FROM batches
    WHERE batch_id = ?
      AND batch_status IN ('FORMED', 'ROLLED_BACK')
  `).get(batchId);

  if (!batchRecord) {
    throw new Error(`Completed Batch ${batchId} was not found.`);
  }

  const batch = batchWithFormationReason(batchRecord);

  const quoteCashOut = batchQuoteCashOutput(batchId);

  return {
    ...batch,
    sourceTradeIds: database.prepare(`
      SELECT trade_id AS tradeId
      FROM batch_members
      WHERE batch_id = ? AND member_role = 'TRADE'
      ORDER BY trade_id
    `).all(batchId).map(row => row.tradeId),
    trades: batchTrades().filter(trade => trade.batchId === Number(batchId)),
    quoteCashOut
  };
}

function batchDetails(batchId) {
  const batch = completedBatchResult(batchId);
  const content = batchContent(batchId);
  const batchingKeyTrade = content.members[0] || content.outputs[0] || null;
  const cashOutput = batchQuoteCashOutput(batchId);

  return {
    ...batch,
    currencyPair: batchingKeyTrade?.currencyPair ?? null,
    batchingKey: batchingKeyTrade
      ? {
          ccyPairCode: batchingKeyTrade.ccyPairCode,
          tradeDate: batchingKeyTrade.tradeDate,
          tenor: batchingKeyTrade.tenor,
          baseCcyValueDate: batchingKeyTrade.baseCcyValueDate,
          quoteCcyValueDate: batchingKeyTrade.quoteCcyValueDate,
          baseCcyFractionDigits: batchingKeyTrade.baseCcyFractionDigits,
          quoteCcyFractionDigits: batchingKeyTrade.quoteCcyFractionDigits
        }
      : null,
    memberCount: content.members.length,
    outputCount: content.outputs.length,
    members: content.members,
    outputs: content.outputs,
    cashOutput
  };
}

function formedBatchByIdempotencyKey(idempotencyKey) {
  const batch = database.prepare(`
    SELECT batch_id AS batchId
    FROM batches
    WHERE idempotency_key = ?
      AND batch_status IN ('FORMED', 'ROLLED_BACK')
  `).get(idempotencyKey);

  return batch ? completedBatchResult(batch.batchId) : null;
}

function batchMemberTradeIds(batchId) {
  return database.prepare(`
    SELECT trade_id AS tradeId
    FROM batch_members
    WHERE batch_id = ?
    ORDER BY trade_id
  `).all(batchId).map(row => Number(row.tradeId));
}

function rollbackBatchWithinTransaction(batchId) {
  const batch = database.prepare(`
    SELECT batch_status AS batchStatus
    FROM batches
    WHERE batch_id = ?
  `).get(batchId);

  if (!batch) {
    const error = new Error(`Batch ${batchId} was not found.`);
    error.code = "BATCH_NOT_FOUND";
    throw error;
  }

  if (batch.batchStatus === "ROLLED_BACK") {
    return {
      ...completedBatchResult(batchId),
      returnedTradeIds: batchMemberTradeIds(batchId),
      replayed: true
    };
  }

  if (batch.batchStatus !== "FORMED") {
    const error = new Error(
      `Batch ${batchId} cannot be rolled back from status ${batch.batchStatus}.`
    );
    error.code = "BATCH_NOT_ROLLBACKABLE";
    throw error;
  }

  const rolledBackAt = new Date().toISOString();
  const update = database.prepare(`
    UPDATE batches
    SET batch_status = 'ROLLED_BACK',
        rolled_back_at = ?
    WHERE batch_id = ?
      AND batch_status = 'FORMED'
      AND rolled_back_at IS NULL
  `).run(rolledBackAt, batchId);

  if (Number(update.changes) !== 1) {
    const error = new Error(`Batch ${batchId} could not be rolled back.`);
    error.code = "BATCH_ROLLBACK_CONFLICT";
    throw error;
  }

  return {
    ...completedBatchResult(batchId),
    returnedTradeIds: batchMemberTradeIds(batchId),
    replayed: false
  };
}

function rollbackBatch(batchId) {
  return runInImmediateTransaction(
    database,
    () => rollbackBatchWithinTransaction(batchId)
  );
}

const formBatchUseCase = new FormBatchUseCase({
  transactionRunner: {
    run: operation => runInImmediateTransaction(database, operation)
  },
  batchRepository: {
    findFormedByIdempotencyKey: formedBatchByIdempotencyKey,
    saveFormed: saveFormedBatch
  },
  tradeExposureRepository: {
    findBatchSources: batchSourceTrades
  }
});

function latestTradeId() {
  return Number(database.prepare(`
    SELECT COALESCE(MAX(trade_id), 0) AS trade_id
    FROM trade_exposures
  `).get().trade_id);
}

function materializeTradePositionModeState(sqlite, {
  tradeId,
  tradeType,
  positionManagementMode
}) {
  const normalizedMode = normalizePositionManagementMode(
    positionManagementMode,
    "Initial Position Management Mode"
  );
  const result = sqlite.prepare(`
    UPDATE trade_position_management
    SET initial_position_management_mode = ?,
        current_position_management_mode = ?,
        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE trade_id = ? AND trade_type = ?
  `).run(normalizedMode, normalizedMode, tradeId, tradeType);

  if (result.changes !== 1) {
    throw new Error(
      `Position Management Mode state was not initialized for ${tradeType} ${tradeId}.`
    );
  }

  return normalizedMode;
}

function tradePositionManagementStates(identities) {
  const findState = database.prepare(`
    SELECT
      management.trade_id AS tradeId,
      management.trade_type AS tradeType,
      management.initial_position_management_mode AS initialPositionManagementMode,
      management.current_position_management_mode AS currentPositionManagementMode,
      EXISTS
      (
        SELECT 1
        FROM batch_members member
        INNER JOIN batches batch ON batch.batch_id = member.batch_id
        WHERE member.trade_id = management.trade_id
          AND member.trade_type = management.trade_type
          AND member.member_role IN ('TRADE', 'BALANCE_TRADE')
          AND batch.batch_status IN
            (${BATCH_MEMBERSHIP_BLOCKING_STATUS_PLACEHOLDERS})
      ) AS batchBlocked,
      transition.transitioned_at AS transitionedAt
    FROM trade_position_management management
    LEFT JOIN trade_position_management_transitions transition
      ON transition.trade_id = management.trade_id
      AND transition.trade_type = management.trade_type
      AND transition.reason_code = 'MANUAL_REVIEW_COMPLETED'
    WHERE management.trade_id = ?
      AND management.trade_type = ?
  `);

  return identities.map(identity => findState.get(
    ...BATCH_MEMBERSHIP_BLOCKING_STATUSES,
    identity.tradeId,
    identity.tradeType
  )).filter(Boolean);
}

function saveTradePositionManagementTransition({
  identity,
  initialPositionManagementMode,
  previousPositionManagementMode,
  currentPositionManagementMode,
  transitionReason,
  transitionedAt
}) {
  const update = database.prepare(`
    UPDATE trade_position_management
    SET current_position_management_mode = ?,
        updated_at = ?
    WHERE trade_id = ?
      AND trade_type = ?
      AND initial_position_management_mode = ?
      AND current_position_management_mode = ?
  `).run(
    currentPositionManagementMode,
    transitionedAt,
    identity.tradeId,
    identity.tradeType,
    initialPositionManagementMode,
    previousPositionManagementMode
  );

  if (update.changes !== 1) {
    const error = new Error(
      `Trade ${identity.tradeId} (${identity.tradeType}) changed during the Position Management Mode transition.`
    );
    error.code = "POSITION_MODE_TRANSITION_CONFLICT";
    throw error;
  }

  database.prepare(`
    INSERT INTO trade_position_management_transitions
      (
        trade_id,
        trade_type,
        from_position_management_mode,
        to_position_management_mode,
        reason_code,
        transition_source,
        transitioned_at
      )
    VALUES (?, ?, ?, ?, ?, 'OPERATOR', ?)
  `).run(
    identity.tradeId,
    identity.tradeType,
    previousPositionManagementMode,
    currentPositionManagementMode,
    transitionReason,
    transitionedAt
  );
}

const moveTradesToAutoManagementUseCase =
  new MoveTradesToAutoManagementUseCase({
    clock: () => database.prepare("SELECT strftime('%Y-%m-%dT%H:%M:%fZ', 'now') AS timestamp").get().timestamp,
    transactionRunner: {
      run: operation => runInImmediateTransaction(database, operation)
    },
    admissionPolicy: {
      evaluateRelease: evaluateTradeRelease,
      recordRelease: (identity, decision) => recordTradeAdmissionDecision(identity, decision, "RELEASE")
    },
    tradePositionManagementRepository: {
      findByIdentities: tradePositionManagementStates,
      saveTransition: saveTradePositionManagementTransition
    }
  });

function nextAutoBatchPlan({
  afterTradeId = 0,
  excludedTradeIds = []
} = {}) {
  const settings = autoBatchingSettings();

  return planAutoBatching({
    trades: selectTradesForAutoBatchingRun({
      trades: positions(),
      afterTradeId,
      excludedTradeIds,
      eligibleCcyPairCodes: settings.eligibleCcyPairCodes
    }),
    maxSpreadPercent: settings.maxTransferRateSpreadPercent,
    maxIntervalSeconds: settings.maxIntervalSeconds,
    tenorCompatibilityMode: settings.tenorCompatibilityMode,
    now: new Date()
  });
}

const autoBatchingProcess = new AutoBatchingProcess({
  selectCandidates: nextAutoBatchPlan,
  formBatch: command => formBatchUseCase.execute(command),
  getIntervalMs: () => autoBatchingSettings().maxIntervalSeconds * 1000,
  getLatestTradeId: latestTradeId,
  createIdempotencyKey: () => `auto-batch:${randomUUID()}`
});

function clientDealWithCalculatedEconomics(payload, exposureAmounts) {
  const pair = ccyPairOption(payload.ccyPairCode);
  const baseCcyAmount = exposureAmounts.baseCcyAmount;
  const analyticalPnlQuoteFractionDigits = pair.quoteCurrencyFractionDigits;

  if (payload.pricingRuleId === null) {
    const transferRate = roundToFractionDigits(
      payload.transferRate,
      pair.defaultQuoteDecimals
    );
    const analyticalPnlQuoteMinor = calculateAnalyticalPnlMinor({
      clientSide: payload.side,
      baseCcyAmountMinor: exposureAmounts.baseCcyAmountMinor,
      baseCcyFractionDigits: exposureAmounts.baseCcyFractionDigits,
      tradeRate: payload.tradeRate,
      transferRate,
      quoteCcyFractionDigits: analyticalPnlQuoteFractionDigits
    });

    return {
      ...payload,
      baseCcyAmount,
      quoteCcyAmount: exposureAmounts.quoteCcyAmount,
      transferRate,
      analyticalPnlQuoteMinor: minorToSafeInteger(
        analyticalPnlQuoteMinor,
        "Analytical PnL Quote Minor"
      ),
      analyticalPnlQuoteFractionDigits
    };
  }

  const rule = pricingRule(payload.pricingRuleId);
  const economics = calculateClientDealEconomics({
    clientSide: payload.side,
    baseCcyAmountMinor: exposureAmounts.baseCcyAmountMinor,
    baseCcyFractionDigits: exposureAmounts.baseCcyFractionDigits,
    tradeRate: payload.tradeRate,
    marginPercent: rule.marginPercent,
    rateFractionDigits: pair.defaultQuoteDecimals,
    quoteCcyFractionDigits: analyticalPnlQuoteFractionDigits
  });

  return {
    ...payload,
    baseCcyAmount,
    quoteCcyAmount: exposureAmounts.quoteCcyAmount,
    ...economics,
    analyticalPnlQuoteMinor: minorToSafeInteger(
      economics.analyticalPnlQuoteMinor,
      "Analytical PnL Quote Minor"
    )
  };
}

function createClientDeal(payload, suppliedExposureAmounts = null) {
  const receivedTimestamp = new Date().toISOString();
  const tradeId = runInImmediateTransaction(database, () => {
    const exposureAmounts = suppliedExposureAmounts || tradeExposureAmounts(payload);
    const exposureResult = database.prepare(`
      INSERT INTO trade_exposures
        (
          execution_timestamp,
          received_timestamp,
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
    `).run(
      payload.executionTimestamp,
      receivedTimestamp,
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

    materializeTradeAdmission({ tradeId, tradeType: "CLIENT_DEAL" }, payload, exposureAmounts);

    database.prepare(`
      INSERT INTO client_deals
        (
          trade_id,
          trade_type,
          counterparty_id,
          trade_context_id,
          pricing_rule_id,
          transfer_rate,
          analytical_pnl_quote_minor,
          analytical_pnl_quote_fraction_digits,
          comment
        )
      VALUES (?, 'CLIENT_DEAL', ?, ?, ?, ?, ?, ?, ?)
    `).run(
      tradeId,
      payload.counterpartyId,
      payload.tradeContextId,
      payload.pricingRuleId,
      payload.transferRate,
      payload.analyticalPnlQuoteMinor,
      payload.analyticalPnlQuoteFractionDigits,
      payload.comment
    );

    database.prepare(`
      INSERT INTO trade_market_snapshots
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

  autoBatchingProcess.notifyTradeCreated();
  return tradeId;
}

function hedgeDealWithCalculatedTerms(
  payload,
  exposureAmounts,
  rule = hedgeDealPricingRule(payload.pricingRuleId),
  marketPulseSnapshot = marketPulseSimulator.snapshot()
) {
  const pair = ccyPairOption(rule.ccyPairCode);
  const terms = createHedgeDealTerms({
    hedgeSide: payload.side,
    baseCcyAmount: exposureAmounts.baseCcyAmount,
    tradeRate: payload.tradeRate,
    tenor: payload.tenor,
    marginPercent: rule.marginPercent,
    rateFractionDigits: pair.defaultQuoteDecimals,
    baseFractionDigits: exposureAmounts.baseCcyFractionDigits,
    quoteFractionDigits: exposureAmounts.quoteCcyFractionDigits
  });
  const marketQuote = marketPulseSnapshot.quotes
    .find(quote => quote.pairCode === rule.ccyPairCode);

  return {
    ...terms,
    analyticalPnlQuoteMinor: minorToSafeInteger(
      terms.analyticalPnlQuoteMinor,
      "Analytical PnL Quote Minor"
    ),
    counterpartyId: rule.counterpartyId,
    tradeContextId: rule.tradeContextId,
    pricingRuleId: rule.pricingRuleId,
    ccyPairCode: rule.ccyPairCode,
    dealtCcyCode: exposureAmounts.dealtCcyCode,
    dealtCcyAmount: payload.dealtCcyAmount,
    baseCcyAmount: exposureAmounts.baseCcyAmount,
    quoteCcyAmount: exposureAmounts.quoteCcyAmount,
    tradeRate: payload.tradeRate,
    positionManagementMode: payload.positionManagementMode ?? null,
    marketPulseStreamStatus: marketPulseSnapshot.status,
    marketPulseBid: marketQuote?.bid ?? null,
    marketPulseOffer: marketQuote?.offer ?? null,
    marketPulseTimestamp: marketQuote ? marketPulseSnapshot.generatedAt : null
  };
}

function autoPricedHedgeDealWithCalculatedTerms(payload) {
  const rule = autoPricedHedgeDealPricingRule(payload.pricingRuleId);
  const pair = ccyPairOption(rule.ccyPairCode);
  const marketPulseSnapshot = marketPulseSimulator.snapshot();
  const marketQuote = marketPulseSnapshot.quotes
    .find(quote => quote.pairCode === rule.ccyPairCode);

  if (!marketQuote) {
    const error = new Error(
      `Market Pulse quote for ${rule.currencyPair} is unavailable.`
    );
    error.code = "AUTO_PRICED_HEDGE_MARKET_QUOTE_UNAVAILABLE";
    throw error;
  }

  const pricedPayload = {
    ...payload,
    tradeRate: String(autoPricedHedgeTradeRate({
      counterpartySide: payload.side,
      marketBid: marketQuote.bid,
      marketOffer: marketQuote.offer,
      rateFractionDigits: pair.defaultQuoteDecimals
    }))
  };
  const exposureAmounts = tradeExposureAmounts(pricedPayload);

  return {
    deal: hedgeDealWithCalculatedTerms(
      pricedPayload,
      exposureAmounts,
      rule,
      marketPulseSnapshot
    ),
    exposureAmounts
  };
}

function createHedgeDeal(
  payload,
  suppliedExposureAmounts = null,
  requestTimestamp = payload.executionTimestamp
) {
  if (!isIsoUtcTimestamp(requestTimestamp)) {
    throw new RangeError("Hedge Deal Request Timestamp must be a valid ISO UTC timestamp.");
  }

  const receivedTimestamp = new Date().toISOString();
  const tradeId = runInImmediateTransaction(database, () => {
    const exposureAmounts = suppliedExposureAmounts || tradeExposureAmounts(payload);
    const exposureResult = database.prepare(`
      INSERT INTO trade_exposures
        (
          execution_timestamp,
          received_timestamp,
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
      VALUES (?, ?, 'HEDGE_DEAL', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      payload.executionTimestamp,
      receivedTimestamp,
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

    if (payload.positionManagementMode === null
      || payload.positionManagementMode === undefined) {
      materializeTradeAdmission({ tradeId, tradeType: "HEDGE_DEAL" }, payload, exposureAmounts);
    } else {
      materializeTradePositionModeState(database, {
        tradeId,
        tradeType: "HEDGE_DEAL",
        positionManagementMode: payload.positionManagementMode
      });
    }

    database.prepare(`
      INSERT INTO hedge_deals
        (
          trade_id,
          trade_type,
          request_timestamp,
          counterparty_id,
          trade_context_id,
          pricing_rule_id,
          transfer_rate,
          analytical_pnl_quote_minor,
          analytical_pnl_quote_fraction_digits
        )
      VALUES (?, 'HEDGE_DEAL', ?, ?, ?, ?, ?, ?, ?)
    `).run(
      tradeId,
      requestTimestamp,
      payload.counterpartyId,
      payload.tradeContextId,
      payload.pricingRuleId,
      payload.transferRate,
      payload.analyticalPnlQuoteMinor,
      payload.analyticalPnlQuoteFractionDigits
    );

    database.prepare(`
      INSERT INTO trade_market_snapshots
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

  autoBatchingProcess.notifyTradeCreated();
  return tradeId;
}

const marketPulseSimulator = new MarketPulseSimulator({
  loadConfigurations: marketPulseSimulationConfigurations
});
const { GetSourceCandleCalendarUseCase, LoadSourceCandleDayUseCase } = require("./backend/market-pulse/historical-data/application/source-candle-calendar");
const { FileCandleVerificationLogger } = require("./backend/market-pulse/historical-data/infrastructure/file-candle-verification-logger");
const historicalMarketDataSource = new MoexIssHistoricalMarketDataSource();
const marketSourceCandleRepository = new SqliteMarketSourceCandleRepository({ database });
const candleAggregationApi = createCandleAggregationModule({ database, sourceRepository: marketSourceCandleRepository });
const backfillHistoricalCandleRangeUseCase = new BackfillHistoricalCandleRangeUseCase({
  historicalMarketDataSource,
  marketSourceCandleRepository
});
const historicalCandlesApi = createHistoricalCandlesApi({
  getSourceCandleCalendarUseCase: new GetSourceCandleCalendarUseCase({ marketSourceCandleRepository }),
  loadSourceCandleDayUseCase: new LoadSourceCandleDayUseCase({
    backfillRangeUseCase: backfillHistoricalCandleRangeUseCase,
    marketSourceCandleRepository,
    verificationLogger: new FileCandleVerificationLogger({directory:path.join(ROOT_DIR,"logs","candle_load")})
  })
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

function generateOneClientDeal() {
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
  const payload = generatedClientDeal({
    settings: selected.settings,
    marketPulseSnapshot,
    quote: selected.quote,
    pair
  });
  const validation = validateClientDealPayload(payload);

  if (validation.error) {
    throw clientDealGenerationError(
      "GENERATED_CLIENT_DEAL_INVALID",
      validation.error
    );
  }

  const exposureAmounts = tradeExposureAmounts(validation);
  const tradeId = createClientDeal(
    clientDealWithCalculatedEconomics(validation, exposureAmounts),
    exposureAmounts
  );
  return clientDeal(tradeId);
}

const clientDealGenerationProcess = new ClientDealGenerationProcess({
  generateOne: generateOneClientDeal,
  getGenerationCycle: clientDealGenerationCycle
});

const DEMO_TRADE_RESET_CONFIRMATION = "RESET_ALL_TRADES";
const DEMO_TRADE_RESET_DELETE_TRIGGERS = Object.freeze([
  "trg_auto_management_admission_decisions_immutable_delete",
  "trg_batch_members_immutable_delete",
  "trg_batch_balance_trades_immutable_delete",
  "trg_batch_position_outputs_immutable_delete",
  "trg_batch_quote_cash_outputs_immutable_delete",
  "trg_batches_immutable_delete"
]);

function demoTradeTableCounts() {
  return {
    trades: Number(database.prepare("SELECT COUNT(*) AS count FROM trade_exposures").get().count),
    clientDeals: Number(database.prepare("SELECT COUNT(*) AS count FROM client_deals").get().count),
    hedgeDeals: Number(database.prepare("SELECT COUNT(*) AS count FROM hedge_deals").get().count),
    marketSnapshots: Number(
      database.prepare("SELECT COUNT(*) AS count FROM trade_market_snapshots").get().count
    ),
    autoManagementAdmissionDecisions: Number(
      database.prepare(`
        SELECT COUNT(*) AS count
        FROM auto_management_admission_decisions
      `).get().count
    ),
    positionManagementStates: Number(
      database.prepare("SELECT COUNT(*) AS count FROM trade_position_management").get().count
    ),
    positionManagementTransitions: Number(
      database.prepare(`
        SELECT COUNT(*) AS count
        FROM trade_position_management_transitions
      `).get().count
    ),
    batches: Number(database.prepare("SELECT COUNT(*) AS count FROM batches").get().count),
    batchMembers: Number(database.prepare("SELECT COUNT(*) AS count FROM batch_members").get().count),
    batchBalanceTrades: Number(
      database.prepare("SELECT COUNT(*) AS count FROM batch_balance_trades").get().count
    ),
    batchOutputs: Number(database.prepare("SELECT COUNT(*) AS count FROM batch_position_outputs").get().count),
    batchQuoteCashMembers: Number(
      database.prepare("SELECT COUNT(*) AS count FROM batch_quote_cash_outputs").get().count
    )
  };
}

function resetDemoTrades() {
  clientDealGenerationProcess.stop();
  autoBatchingProcess.stop();

  const triggerPlaceholders = DEMO_TRADE_RESET_DELETE_TRIGGERS.map(() => "?").join(", ");
  const triggerDefinitions = database.prepare(`
    SELECT name, sql
    FROM sqlite_master
    WHERE type = 'trigger'
      AND name IN (${triggerPlaceholders})
    ORDER BY name
  `).all(...DEMO_TRADE_RESET_DELETE_TRIGGERS);

  if (
    triggerDefinitions.length !== DEMO_TRADE_RESET_DELETE_TRIGGERS.length
    || triggerDefinitions.some(trigger => !trigger.sql)
  ) {
    throw new Error("Demo Trade reset requires all Trade delete integrity triggers.");
  }

  const removed = runInImmediateTransaction(database, () => {
    const counts = demoTradeTableCounts();

    for (const trigger of triggerDefinitions) {
      if (!DEMO_TRADE_RESET_DELETE_TRIGGERS.includes(trigger.name)) {
        throw new Error(`Unsupported Demo Trade reset trigger ${trigger.name}.`);
      }

      database.exec(`DROP TRIGGER "${trigger.name}"`);
    }

    database.exec(`
      DELETE FROM batch_quote_cash_outputs;
      DELETE FROM batch_members;
      DELETE FROM batch_position_outputs;
      DELETE FROM batch_balance_trades;
      DELETE FROM batches;
      DELETE FROM auto_management_admission_decisions;
      DELETE FROM trade_market_snapshots;
      DELETE FROM client_deals;
      DELETE FROM hedge_deals;
      DELETE FROM trade_exposures;
      DELETE FROM sqlite_sequence
      WHERE name IN
        (
          'batches',
          'trade_position_management_transitions'
        );
    `);

    for (const trigger of triggerDefinitions) {
      database.exec(trigger.sql);
    }

    const remaining = demoTradeTableCounts();

    if (Object.values(remaining).some(count => count !== 0)) {
      throw new Error("Demo Trade reset did not clear every Trade and Batch table.");
    }

    if (database.prepare("PRAGMA foreign_key_check").all().length !== 0) {
      throw new Error("Demo Trade reset violated database foreign keys.");
    }

    return counts;
  });

  return {
    removed,
    generationProcess: clientDealGenerationProcess.reset(),
    autoBatchingProcess: autoBatchingProcess.reset(),
    resetAt: new Date().toISOString()
  };
}

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

function normalizedOriginatingSystemId(value) {
  return normalizedText(value).toUpperCase();
}

function normalizedTradeContextId(value) {
  return integerInRange(value, 1, Number.MAX_SAFE_INTEGER);
}

function normalizedCounterpartyType(value) {
  return normalizedText(value).toUpperCase();
}

function normalizedCounterpartyCodeType(value) {
  return normalizedText(value).toUpperCase();
}

function normalizedCounterpartyScope(value) {
  return normalizedText(value).toUpperCase();
}

function normalizedExternalCounterpartyKind(value) {
  const normalized = normalizedText(value).toUpperCase();

  if (normalized === "ORGANIZATION") {
    return "CORPORATE";
  }

  if (normalized === "FUND") {
    return "NON_BANK_FINANCIAL_INSTITUTION";
  }

  return normalized;
}

function normalizedInternalUnitType(value) {
  return normalizedText(value).toUpperCase();
}

function normalizedCounterpartyRoles(value, legacyCounterpartyType = "") {
  const source = Array.isArray(value) ? value : [];
  const roles = source
    .map(role => normalizedText(role).toUpperCase())
    .filter(role => COUNTERPARTY_ROLES.includes(role));

  if (roles.length === 0) {
    const legacyRole = normalizedCounterpartyType(legacyCounterpartyType);

    if (legacyRole === "CLIENT") {
      roles.push("CLIENT");
    } else if (["HEDGE_COUNTERPARTY", "EXTERNAL_COUNTERPARTY", "INTERNAL_DESK"].includes(legacyRole)) {
      roles.push("HEDGE_COUNTERPARTY");
    }
  }

  return [...new Set(roles)]
    .sort((left, right) => COUNTERPARTY_ROLES.indexOf(left) - COUNTERPARTY_ROLES.indexOf(right));
}

function normalizedCounterpartyCode(value, codeType) {
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

function validateOriginatingSystemPayload(body) {
  const originatingSystemId = normalizedOriginatingSystemId(body.originatingSystemId);
  const name = normalizedText(body.name);
  const pricingMode = normalizedText(body.pricingMode).toUpperCase();
  const active = typeof body.active === "boolean" ? body.active : null;

  if (!new RegExp(`^[A-Z0-9_-]{2,${ORIGINATING_SYSTEM_ID_MAX_LENGTH}}$`).test(originatingSystemId)) {
    return { error: `Originating System ID must contain from 2 to ${ORIGINATING_SYSTEM_ID_MAX_LENGTH} uppercase letters, digits, underscores or hyphens.` };
  }

  if (!name || name.length > ORIGINATING_SYSTEM_NAME_MAX_LENGTH) {
    return { error: `Name must contain from one to ${ORIGINATING_SYSTEM_NAME_MAX_LENGTH} characters.` };
  }

  if (!PRICING_MODES.includes(pricingMode) || pricingMode.length > ORIGINATING_SYSTEM_PRICING_MODE_MAX_LENGTH) {
    return { error: "Pricing Mode must be AUTO_PRICED, DEALER_PRICED or DEALER_APPROVED." };
  }

  if (active === null) {
    return { error: "Active must be a boolean value." };
  }

  return { originatingSystemId, name, pricingMode, active };
}

function validatedPositionManagementMode(value, label, { nullable = false } = {}) {
  if (nullable && value === null) {
    return { value: null };
  }

  try {
    return { value: normalizePositionManagementMode(value, label) };
  } catch (error) {
    if (error?.code === "INVALID_POSITION_MANAGEMENT_MODE") {
      return { error: `${label} must be MANUAL or AUTO${nullable ? ", or null to inherit" : ""}.` };
    }

    throw error;
  }
}

function validatedAutoManagementAdmissionMode(value) {
  try {
    return { value: normalizeAutoManagementAdmissionMode(value) };
  } catch (error) {
    if (error?.code === "INVALID_AUTO_MANAGEMENT_ADMISSION_MODE") {
      return {
        error: "Initial Mode Assignment must be AUTO_IF_ELIGIBLE or REVIEW_REQUIRED."
      };
    }

    throw error;
  }
}

function validatedPricingRuleAutoManagementAdmissionModeOverride(value) {
  try {
    return {
      value: normalizePricingRuleAutoManagementAdmissionModeOverride(value)
    };
  } catch (error) {
    if (error?.code ===
      "INVALID_PRICING_RULE_AUTO_MANAGEMENT_ADMISSION_MODE_OVERRIDE") {
      return {
        error: "Pricing Rule Initial Mode Assignment override must be REVIEW_REQUIRED, or null to use the Trade Context value."
      };
    }

    throw error;
  }
}

function validateTradeContextPayload(body, current = null) {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { error: "Trade Context payload must be a JSON object." };
  }

  const servicingLocationId = normalizedServicingLocationId(body.servicingLocationId);
  const accountingSystemId = normalizedAccountingSystemId(body.accountingSystemId);
  const originatingSystemId = normalizedOriginatingSystemId(body.originatingSystemId);
  const requestedAutoManagementAdmissionMode = Object.prototype.hasOwnProperty.call(
    body,
    "autoManagementAdmissionMode"
  )
    ? body.autoManagementAdmissionMode
    : current?.autoManagementAdmissionMode
      ?? AUTO_MANAGEMENT_ADMISSION_MODE.REVIEW_REQUIRED;
  const autoManagementAdmissionMode = validatedAutoManagementAdmissionMode(
    requestedAutoManagementAdmissionMode
  );

  if (!isValidServicingLocationId(servicingLocationId)) {
    return { error: `Servicing Location ID must contain from one to ${SERVICING_LOCATION_ID_MAX_LENGTH} characters.` };
  }

  if (!new RegExp(`^[A-Z0-9_-]{2,${ACCOUNTING_SYSTEM_ID_MAX_LENGTH}}$`).test(accountingSystemId)) {
    return { error: "Accounting System ID is invalid." };
  }

  if (!new RegExp(`^[A-Z0-9_-]{2,${ORIGINATING_SYSTEM_ID_MAX_LENGTH}}$`).test(originatingSystemId)) {
    return { error: "Originating System ID is invalid." };
  }

  if (autoManagementAdmissionMode.error) {
    return autoManagementAdmissionMode;
  }

  const referencedOriginatingSystem = originatingSystem(originatingSystemId);

  if (autoManagementAdmissionMode.value === AUTO_MANAGEMENT_ADMISSION_MODE.AUTO_IF_ELIGIBLE
    && referencedOriginatingSystem
    && referencedOriginatingSystem.pricingMode !== "AUTO_PRICED") {
    return {
      error: "AUTO_IF_ELIGIBLE requires an Originating System with AUTO_PRICED Pricing Mode."
    };
  }

  return {
    servicingLocationId,
    accountingSystemId,
    accountingSystemDatabaseId: accountingSystemId === NOT_APPLICABLE_ACCOUNTING_SYSTEM_ID
      ? null
      : accountingSystemId,
    originatingSystemId,
    autoManagementAdmissionMode: autoManagementAdmissionMode.value
  };
}

function validateTradingCounterpartyTradeContextsPayload(body) {
  if (!Array.isArray(body?.tradeContextIds) || body.tradeContextIds.length === 0) {
    return { error: "Trade Context IDs must contain at least one item." };
  }

  const tradeContextIds = body.tradeContextIds
    .map(normalizedTradeContextId);

  if (tradeContextIds.some(tradeContextId => tradeContextId === null)) {
    return { error: "Every Trade Context ID must be a positive integer." };
  }

  return { tradeContextIds: [...new Set(tradeContextIds)] };
}

function validateTradingCounterpartyPayload(body) {
  const requestedScope = normalizedCounterpartyScope(body.counterpartyScope);
  const legacyCodeType = normalizedCounterpartyCodeType(body.counterpartyCodeType);
  const inferredScope = body.unitCode !== undefined
    || legacyCodeType === "INTERNAL_UNIT_CODE"
    || legacyCodeType === "FRONT_SYSTEM_FOLDER_ID"
    || normalizedCounterpartyType(body.counterpartyType) === "INTERNAL_DESK"
    ? "INTERNAL"
    : "EXTERNAL";
  const counterpartyScope = requestedScope || inferredScope;
  const counterpartyRoles = normalizedCounterpartyRoles(body.counterpartyRoles, body.counterpartyType);
  const requestedRoles = Array.isArray(body.counterpartyRoles)
    ? body.counterpartyRoles.map(role => normalizedText(role).toUpperCase())
    : [];
  const counterpartyName = normalizedText(body.counterpartyName);
  const active = typeof body.active === "boolean" ? body.active : null;

  if (!COUNTERPARTY_SCOPES.includes(counterpartyScope)) {
    return { error: "Counterparty Scope must be EXTERNAL or INTERNAL." };
  }

  if (counterpartyRoles.length === 0) {
    return { error: "At least one Trading Counterparty role is required." };
  }

  if (requestedRoles.some(role => !COUNTERPARTY_ROLES.includes(role))) {
    return { error: "Trading Counterparty roles must be CLIENT or HEDGE_COUNTERPARTY." };
  }

  if (!counterpartyName || counterpartyName.length > COUNTERPARTY_NAME_MAX_LENGTH) {
    return { error: `Counterparty Name must contain from 1 to ${COUNTERPARTY_NAME_MAX_LENGTH} characters.` };
  }

  if (active === null) {
    return { error: "Active must be a boolean value." };
  }

  if (counterpartyScope === "EXTERNAL") {
    if (legacyCodeType && !EXTERNAL_COUNTERPARTY_CODE_TYPES.includes(legacyCodeType)) {
      return { error: "External Counterparty Code Type must be INN or OTHER." };
    }

    const counterpartyCodeType = EXTERNAL_COUNTERPARTY_CODE_TYPES.includes(legacyCodeType)
      ? legacyCodeType
      : "INN";
    const counterpartyCode = normalizedCounterpartyCode(
      body.externalCounterpartyCode ?? body.counterpartyCode,
      counterpartyCodeType
    );
    const requestedKind = normalizedExternalCounterpartyKind(body.externalCounterpartyKind);
    const externalCounterpartyKind = requestedKind || "CORPORATE";

    if (!EXTERNAL_COUNTERPARTY_KINDS.includes(externalCounterpartyKind)) {
      return { error: `External Counterparty Type must be ${EXTERNAL_COUNTERPARTY_KINDS.join(", ")}.` };
    }

    const validCounterpartyCode = counterpartyCodeType === "INN"
      ? /^\d{10,12}$/.test(counterpartyCode)
      : new RegExp(`^[A-Z0-9_-]{2,${COUNTERPARTY_CODE_MAX_LENGTH}}$`).test(counterpartyCode);

    if (!validCounterpartyCode) {
      return {
        error: counterpartyCodeType === "INN"
          ? "Counterparty Code with type INN must contain 10 to 12 digits."
          : `Counterparty Code must contain from 2 to ${COUNTERPARTY_CODE_MAX_LENGTH} uppercase letters, digits, underscores or hyphens.`
      };
    }

    return {
      counterpartyScope,
      counterpartyRoles,
      counterpartyName,
      active,
      counterpartyCode,
      counterpartyCodeType,
      externalCounterpartyKind,
      unitCode: null,
      unitType: null
    };
  }

  const unitCode = normalizedCounterpartyCode(body.unitCode ?? body.counterpartyCode, "OTHER");
  const requestedUnitType = normalizedInternalUnitType(body.unitType);
  const unitType = requestedUnitType || "DESK";

  if (!new RegExp(`^[A-Z0-9_-]{2,${COUNTERPARTY_CODE_MAX_LENGTH}}$`).test(unitCode)) {
    return {
      error: `Unit Code must contain from 2 to ${COUNTERPARTY_CODE_MAX_LENGTH} uppercase letters, digits, underscores or hyphens.`
    };
  }

  if (!INTERNAL_UNIT_TYPES.includes(unitType)) {
    return { error: `Unit Type must be ${INTERNAL_UNIT_TYPES.join(", ")}.` };
  }

  return {
    counterpartyScope,
    counterpartyRoles,
    counterpartyName,
    active,
    counterpartyCode: null,
    counterpartyCodeType: null,
    externalCounterpartyKind: null,
    unitCode,
    unitType
  };
}

function saveTradingCounterpartyProfile(sqlite, counterpartyId, payload) {
  if (payload.counterpartyScope === "EXTERNAL") {
    sqlite.prepare(`
      INSERT INTO external_counterparties
        (counterparty_id, counterparty_code, counterparty_code_type, external_counterparty_kind)
      VALUES (?, ?, ?, ?)
      ON CONFLICT (counterparty_id) DO UPDATE SET
        counterparty_code = excluded.counterparty_code,
        counterparty_code_type = excluded.counterparty_code_type,
        external_counterparty_kind = excluded.external_counterparty_kind
    `).run(
      counterpartyId,
      payload.counterpartyCode,
      payload.counterpartyCodeType,
      payload.externalCounterpartyKind
    );
    return;
  }

  sqlite.prepare(`
    INSERT INTO internal_units (counterparty_id, unit_code, unit_type)
    VALUES (?, ?, ?)
    ON CONFLICT (counterparty_id) DO UPDATE SET
      unit_code = excluded.unit_code,
      unit_type = excluded.unit_type
  `).run(counterpartyId, payload.unitCode, payload.unitType);
}

function synchronizeTradingCounterpartyRoles(sqlite, counterpartyId, requestedRoles) {
  const existingRoles = new Set(sqlite.prepare(`
    SELECT role_code AS roleCode
    FROM trading_counterparty_roles
    WHERE counterparty_id = ?
  `).all(counterpartyId).map(row => row.roleCode));
  const requestedRoleSet = new Set(requestedRoles);

  requestedRoles.forEach(roleCode => {
    if (!existingRoles.has(roleCode)) {
      sqlite.prepare(`
        INSERT INTO trading_counterparty_roles (counterparty_id, role_code)
        VALUES (?, ?)
      `).run(counterpartyId, roleCode);
    }
  });

  if (existingRoles.has("CLIENT") && !requestedRoleSet.has("CLIENT")) {
    sqlite.prepare(`
      DELETE FROM client_deal_generation_settings
      WHERE pricing_rule_id IN
      (
        SELECT pricing_rule_id
        FROM pricing_rules
        WHERE counterparty_id = ?
      )
    `).run(counterpartyId);
  }

  existingRoles.forEach(roleCode => {
    if (!requestedRoleSet.has(roleCode)) {
      sqlite.prepare(`
        DELETE FROM trading_counterparty_roles
        WHERE counterparty_id = ? AND role_code = ?
      `).run(counterpartyId, roleCode);
    }
  });
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
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { error: "Pricing Rule payload must be a JSON object." };
  }

  const counterpartyId = integerInRange(body.counterpartyId, 1, Number.MAX_SAFE_INTEGER);
  const tradeContextId = normalizedTradeContextId(body.tradeContextId);
  const ccyPairCode = normalizedText(body.ccyPairCode).toUpperCase();
  const marginPercent = Number(body.marginPercent);
  const autoManagementAdmissionModeOverride =
    validatedPricingRuleAutoManagementAdmissionModeOverride(
      Object.prototype.hasOwnProperty.call(
        body,
        "autoManagementAdmissionModeOverride"
      )
        ? body.autoManagementAdmissionModeOverride
        : null
    );

  if (counterpartyId === null) {
    return { error: "Counterparty ID must be a positive integer." };
  }

  if (!tradeContextId) {
    return { error: "Trade Context ID is invalid." };
  }

  if (!/^[A-Z]{3}_[A-Z]{3}$/.test(ccyPairCode)) {
    return { error: "Ccy Pair Code must look like EUR_USD." };
  }

  if (!Number.isFinite(marginPercent) || marginPercent < 0 || marginPercent >= 100) {
    return { error: "Margin Percent must be a number from 0 up to, but not including, 100." };
  }

  if (autoManagementAdmissionModeOverride.error) {
    return autoManagementAdmissionModeOverride;
  }

  return {
    counterpartyId,
    tradeContextId,
    ccyPairCode,
    marginPercent,
    autoManagementAdmissionModeOverride: autoManagementAdmissionModeOverride.value
  };
}

function validatePricingRuleUpdatePayload(body, current) {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return { error: "Pricing Rule payload must be a JSON object." };
  }

  const hasMarginPercent = Object.prototype.hasOwnProperty.call(body, "marginPercent");
  const hasAutoManagementAdmissionModeOverride =
    Object.prototype.hasOwnProperty.call(
      body,
      "autoManagementAdmissionModeOverride"
    );

  if (!hasMarginPercent
    && !hasAutoManagementAdmissionModeOverride) {
    return {
      error: "Pricing Rule update must include Margin Percent or Initial Mode Assignment override."
    };
  }

  const rawMarginPercent = hasMarginPercent
    ? body.marginPercent
    : current.marginPercent;
  const marginPercent = rawMarginPercent === null
    || rawMarginPercent === undefined
    || String(rawMarginPercent).trim() === ""
    ? NaN
    : Number(rawMarginPercent);

  if (!Number.isFinite(marginPercent) || marginPercent < 0 || marginPercent >= 100) {
    return { error: "Margin Percent must be a number from 0 up to, but not including, 100." };
  }

  const autoManagementAdmissionModeOverride =
    validatedPricingRuleAutoManagementAdmissionModeOverride(
      hasAutoManagementAdmissionModeOverride
        ? body.autoManagementAdmissionModeOverride
        : current.autoManagementAdmissionModeOverride
    );

  if (autoManagementAdmissionModeOverride.error) {
    return autoManagementAdmissionModeOverride;
  }

  return {
    marginPercent,
    autoManagementAdmissionModeOverride: autoManagementAdmissionModeOverride.value
  };
}

function pricingRuleImmutableTermsChanged(body, current) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return false;
  }

  if (
    Object.prototype.hasOwnProperty.call(body, "counterpartyId")
    && integerInRange(body.counterpartyId, 1, Number.MAX_SAFE_INTEGER) !== current.counterpartyId
  ) {
    return true;
  }

  if (
    Object.prototype.hasOwnProperty.call(body, "tradeContextId")
    && normalizedTradeContextId(body.tradeContextId) !== current.tradeContextId
  ) {
    return true;
  }

  return Object.prototype.hasOwnProperty.call(body, "ccyPairCode")
    && normalizedText(body.ccyPairCode).toUpperCase() !== current.ccyPairCode;
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

function validateClientDealGenerationProcessSettingsPayload(body) {
  const minIntervalSeconds = Number(body.minIntervalSeconds);
  const maxIntervalSeconds = Number(body.maxIntervalSeconds);
  const minDealsPerCycle = Number(body.minDealsPerCycle);
  const maxDealsPerCycle = Number(body.maxDealsPerCycle);

  if (
    !Number.isInteger(minIntervalSeconds)
    || !Number.isInteger(maxIntervalSeconds)
    || minIntervalSeconds < 1
    || maxIntervalSeconds < minIntervalSeconds
    || maxIntervalSeconds > 3600
  ) {
    return {
      error: "Generation Interval must be an ascending range of whole seconds from 1 to 3600."
    };
  }

  if (
    !Number.isInteger(minDealsPerCycle)
    || !Number.isInteger(maxDealsPerCycle)
    || minDealsPerCycle < 1
    || maxDealsPerCycle < minDealsPerCycle
    || maxDealsPerCycle > 100
  ) {
    return {
      error: "Deals per Cycle must be an ascending integer range from 1 to 100."
    };
  }

  return {
    minIntervalSeconds,
    maxIntervalSeconds,
    minDealsPerCycle,
    maxDealsPerCycle
  };
}

function validateClientDealGenerationSettingsPayload(body, baseCcyFractionDigits) {
  const minBaseCcyAmount = normalizedPositiveDecimalText(body.minBaseCcyAmount);
  const maxBaseCcyAmount = normalizedPositiveDecimalText(body.maxBaseCcyAmount);
  const baseCcyAmountStep = normalizedPositiveDecimalText(body.baseCcyAmountStep);
  const buyProbabilityPercent = Number(body.buyProbabilityPercent);
  const active = typeof body.active === "boolean" ? body.active : null;

  if ([minBaseCcyAmount, maxBaseCcyAmount, baseCcyAmountStep]
    .some(value => value === null)) {
    return { error: "Min Amount, Max Amount and Amount Step must be positive numbers." };
  }

  let minBaseCcyAmountMinor;
  let maxBaseCcyAmountMinor;
  let baseCcyAmountStepMinor;

  try {
    minBaseCcyAmountMinor = minorToSafeInteger(
      majorToMinorExact(minBaseCcyAmount, baseCcyFractionDigits),
      "Min Base Ccy Amount Minor"
    );
    maxBaseCcyAmountMinor = minorToSafeInteger(
      majorToMinorExact(maxBaseCcyAmount, baseCcyFractionDigits),
      "Max Base Ccy Amount Minor"
    );
    baseCcyAmountStepMinor = minorToSafeInteger(
      majorToMinorExact(baseCcyAmountStep, baseCcyFractionDigits),
      "Base Ccy Amount Step Minor"
    );
  } catch {
    return {
      error: `Generation amounts must fit Base Ccy precision (${baseCcyFractionDigits} Fraction Digits) and the supported integer range.`
    };
  }

  if (minBaseCcyAmountMinor <= 0
    || maxBaseCcyAmountMinor <= 0
    || baseCcyAmountStepMinor <= 0) {
    return { error: "Min Amount, Max Amount and Amount Step must be positive numbers." };
  }

  if (maxBaseCcyAmountMinor < minBaseCcyAmountMinor) {
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
    minBaseCcyAmountMinor,
    maxBaseCcyAmountMinor,
    baseCcyAmountStepMinor,
    buyProbabilityPercent,
    active
  };
}

function validateClientDealPayload(body) {
  const executionTimestamp = normalizedText(body.executionTimestamp);
  const counterpartyId = integerInRange(body.counterpartyId, 1, Number.MAX_SAFE_INTEGER);
  const tradeContextId = optionalPositiveInteger(body.tradeContextId);
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

  if (Object.prototype.hasOwnProperty.call(body, "receivedTimestamp")) {
    return { error: "Received Timestamp is assigned by the server and must not be provided." };
  }

  if (!isIsoUtcTimestamp(executionTimestamp)) {
    return { error: "Execution Timestamp must be an ISO UTC timestamp with milliseconds." };
  }

  if (counterpartyId === null) {
    return { error: "Counterparty ID must be a positive integer." };
  }

  if (Number.isNaN(tradeContextId)) {
    return { error: "Trade Context ID must be a positive integer when provided." };
  }

  if (Number.isNaN(pricingRuleId)) {
    return { error: "Pricing Rule ID must be a positive integer when provided." };
  }

  if (manualPricingReason
    && manualPricingReason !== CLIENT_ONBOARDING_MANUAL_PRICING) {
    return { error: "Manual Pricing Reason must be CLIENT_ONBOARDING when provided." };
  }

  if ((pricingRuleId === null) !== (tradeContextId === null)) {
    return {
      error: "Pricing Rule ID and Trade Context ID must either both be provided or both be omitted."
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
    executionTimestamp,
    counterpartyId,
    tradeContextId,
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

function validateHedgeDealBasePayload(body) {
  const pricingRuleId = optionalPositiveInteger(body.pricingRuleId);
  const ccyPairCode = normalizedText(body.ccyPairCode).toUpperCase();
  const side = normalizedText(body.side).toUpperCase();
  const dealtCcyCode = normalizedText(body.dealtCcyCode).toUpperCase();
  const dealtCcyAmount = normalizedPositiveDecimalText(body.dealtCcyAmount);
  const tenor = normalizedText(body.tenor).toUpperCase();
  const positionManagementMode = Object.prototype.hasOwnProperty.call(
    body,
    "positionManagementMode"
  )
    ? validatedPositionManagementMode(
      body.positionManagementMode,
      "Hedge Deal Position Management Mode"
    )
    : { value: null };

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

  if (!["TOD", "TOM", "SPOT"].includes(tenor)) {
    return { error: "Tenor must be TOD, TOM or SPOT." };
  }

  if (positionManagementMode.error) {
    return positionManagementMode;
  }

  return {
    pricingRuleId,
    ccyPairCode,
    side,
    dealtCcyCode,
    dealtCcyAmount,
    tenor,
    positionManagementMode: positionManagementMode.value
  };
}

function validateHedgeDealPayload(body) {
  const payload = validateHedgeDealBasePayload(body);

  if (payload.error) {
    return payload;
  }

  const tradeRate = normalizedPositiveDecimalText(body.tradeRate);

  if (tradeRate === null) {
    return { error: "Trade Rate must be a positive decimal string." };
  }

  return {
    ...payload,
    tradeRate
  };
}

function validateAutoPricedHedgeDealPayload(body) {
  const payload = validateHedgeDealBasePayload(body);

  if (payload.error) {
    return payload;
  }

  if (body.tradeRate !== undefined
    && body.tradeRate !== null
    && String(body.tradeRate).trim() !== "") {
    return {
      error: "Trade Rate must not be provided for an AUTO_PRICED Hedge Deal."
    };
  }

  return payload;
}

function validateHedgeQuickModeDealPayload(body) {
  const allowedFields = new Set([
    "ccyPairCode",
    "side",
    "presetCode",
    "tenor",
    "positionManagementMode"
  ]);
  const unexpectedFields = Object.keys(body).filter(field => !allowedFields.has(field));
  const ccyPairCode = normalizedText(body.ccyPairCode).toUpperCase();
  const side = normalizedText(body.side).toUpperCase();
  const presetCode = normalizedText(body.presetCode).toUpperCase();
  const tenor = normalizedText(body.tenor).toUpperCase();
  const positionManagementMode = Object.prototype.hasOwnProperty.call(
    body,
    "positionManagementMode"
  )
    ? validatedPositionManagementMode(
      body.positionManagementMode,
      "Hedge Deal Position Management Mode"
    )
    : { value: null };

  if (unexpectedFields.length > 0) {
    return {
      error: `Only Ccy Pair Code, Side, Preset Code, Tenor and Position Management Mode may be provided. Unexpected fields: ${unexpectedFields.join(", ")}.`
    };
  }

  if (!/^[A-Z]{3}_[A-Z]{3}$/.test(ccyPairCode)) {
    return { error: "Ccy Pair Code must look like EUR_USD." };
  }

  if (!["BUY", "SELL"].includes(side)) {
    return { error: "Hedge Side must be BUY or SELL." };
  }

  if (!HEDGE_QUICK_MODE_PRESET_CODES.includes(presetCode)) {
    return {
      error: `Preset Code must be ${HEDGE_QUICK_MODE_PRESET_CODES.join(", ")}.`
    };
  }

  if (tenor && !["TOD", "TOM", "SPOT"].includes(tenor)) {
    return { error: "Tenor must be TOD, TOM or SPOT." };
  }

  if (positionManagementMode.error) {
    return positionManagementMode;
  }

  return {
    ccyPairCode,
    side,
    presetCode,
    tenor,
    positionManagementMode: positionManagementMode.value
  };
}

function validateHedgeQuickModeSettingsPayload(body, ccyPairCode, baseCcyFractionDigits) {
  const allowedFields = new Set([
    "counterpartyId",
    "pricingRuleId",
    "smallBaseCcyAmount",
    "mediumBaseCcyAmount",
    "largeBaseCcyAmount",
    "xlargeBaseCcyAmount",
    "defaultTenor",
    "active"
  ]);
  const unexpectedFields = Object.keys(body).filter(field => !allowedFields.has(field));
  const counterpartyId = optionalPositiveInteger(body.counterpartyId);
  const pricingRuleId = optionalPositiveInteger(body.pricingRuleId);
  const active = typeof body.active === "boolean" ? body.active : null;
  const defaultTenor = normalizedText(body.defaultTenor).toUpperCase();
  const amountFields = [
    ["smallBaseCcyAmount", "Small"],
    ["mediumBaseCcyAmount", "Medium"],
    ["largeBaseCcyAmount", "Large"],
    ["xlargeBaseCcyAmount", "Extra Large"]
  ];

  if (unexpectedFields.length > 0) {
    return {
      error: `Unexpected Hedge Quick Mode Settings fields: ${unexpectedFields.join(", ")}.`
    };
  }

  if (Number.isNaN(pricingRuleId) || pricingRuleId === null) {
    return { error: "Pricing Rule ID must be a positive integer." };
  }

  if (Number.isNaN(counterpartyId) || counterpartyId === null) {
    return { error: "Counterparty ID must be a positive integer." };
  }

  if (active === null) {
    return { error: "Active must be a boolean value." };
  }

  if (!["TOD", "TOM", "SPOT"].includes(defaultTenor)) {
    return { error: "Default Tenor must be TOD, TOM or SPOT." };
  }

  const amounts = {};

  try {
    for (const [field, label] of amountFields) {
      const amount = normalizedPositiveDecimalText(body[field]);

      if (amount === null) {
        return { error: `${label} Base Ccy Amount must be a positive decimal string.` };
      }

      amounts[`${field}Minor`] = minorToSafeInteger(
        majorToMinorExact(amount, baseCcyFractionDigits),
        `${label} Base Ccy Amount Minor`
      );
    }
  } catch (error) {
    if (error instanceof TypeError || error instanceof RangeError) {
      return { error: error.message };
    }

    throw error;
  }

  if (!(amounts.smallBaseCcyAmountMinor < amounts.mediumBaseCcyAmountMinor
    && amounts.mediumBaseCcyAmountMinor < amounts.largeBaseCcyAmountMinor
    && amounts.largeBaseCcyAmountMinor < amounts.xlargeBaseCcyAmountMinor)) {
    return {
      error: "Quick Mode amounts must be strictly increasing from Small through Extra Large."
    };
  }

  return {
    ccyPairCode,
    counterpartyId,
    pricingRuleId,
    baseCcyFractionDigits,
    ...amounts,
    defaultTenor,
    active
  };
}

function tradeContextReferenceError(payload) {
  if (!servicingLocation(payload.servicingLocationId)) {
    return `Servicing Location ${payload.servicingLocationId} was not found.`;
  }

  if (payload.accountingSystemDatabaseId !== null && !accountingSystem(payload.accountingSystemId)) {
    return `Accounting System ${payload.accountingSystemId} was not found.`;
  }

  if (!originatingSystem(payload.originatingSystemId)) {
    return `Originating System ${payload.originatingSystemId} was not found.`;
  }

  return "";
}

function pricingRuleReferenceError(payload) {
  if (!tradingCounterparty(payload.counterpartyId)) {
    return `Trading Counterparty ${payload.counterpartyId} was not found.`;
  }

  if (!tradeContext(payload.tradeContextId)) {
    return `Trade Context ${payload.tradeContextId} was not found.`;
  }

  if (!ccyPairOption(payload.ccyPairCode)) {
    return `Ccy Pair ${payload.ccyPairCode} was not found.`;
  }

  return "";
}

function validateBatchingSettingsPayload(body) {
  try {
    return validatedBatchingSettings(body);
  } catch (error) {
    return {
      error: String(error?.code || "").includes("BATCHING_SETTINGS")
        || error?.code === "IN_DEVELOPMENT"
        ? error.message
        : "Batching Settings are invalid."
    };
  }
}

function validateAutoBatchingSettingsPayload(body) {
  try {
    const settings = validatedAutoBatchingSettings(body);
    const unknownCcyPairCode = settings.eligibleCcyPairCodes.find(
      ccyPairCode => !ccyPairOption(ccyPairCode)
    );

    if (unknownCcyPairCode) {
      return {
        error: `Ccy Pair ${unknownCcyPairCode} was not found.`
      };
    }

    return settings;
  } catch (error) {
    return {
      error: error?.code === "INVALID_AUTO_BATCHING_SETTINGS"
        ? error.message
        : "Auto Batching Settings are invalid."
    };
  }
}

function pricingRuleTradeContextAssignmentError(payload) {
  if (tradingCounterpartyTradeContext(
    payload.counterpartyId,
    payload.tradeContextId
  )) {
    return "";
  }

  return `Trade Context ${payload.tradeContextId} is not attached to Trading Counterparty ${payload.counterpartyId}.`;
}

function clientDealReferenceError(payload) {
  const counterparty = tradingCounterparty(payload.counterpartyId);

  if (!counterparty) {
    return `Trading Counterparty ${payload.counterpartyId} was not found.`;
  }

  if (!tradingCounterpartyHasRole(counterparty, "CLIENT")) {
    return `Trading Counterparty ${payload.counterpartyId} must have the CLIENT role.`;
  }

  const pair = ccyPairOption(payload.ccyPairCode);

  if (!pair) {
    return `Ccy Pair ${payload.ccyPairCode} was not found.`;
  }

  if (payload.dealtCcyCode
    && ![pair.baseCcy, pair.quoteCcy].includes(payload.dealtCcyCode)) {
    return `Dealt Ccy Code must be ${pair.baseCcy} or ${pair.quoteCcy}.`;
  }

  if (payload.tradeContextId !== null && !tradeContext(payload.tradeContextId)) {
    return `Trade Context ${payload.tradeContextId} was not found.`;
  }

  if (payload.pricingRuleId !== null) {
    const rule = pricingRule(payload.pricingRuleId);

    if (!rule) {
      return `Pricing Rule ${payload.pricingRuleId} was not found.`;
    }

    if (!clientDealPricingRule(payload.pricingRuleId)) {
      return `Pricing Rule ${payload.pricingRuleId} must use an Originating System with DEALER_PRICED pricing mode.`;
    }

    if (rule.counterpartyId !== payload.counterpartyId
      || rule.tradeContextId !== payload.tradeContextId
      || rule.ccyPairCode !== payload.ccyPairCode) {
      return `Pricing Rule ${payload.pricingRuleId} does not match the Client Deal scope.`;
    }
  }

  return "";
}

function hedgeDealReferenceErrorForPricingMode(payload, pricingMode) {
  const rule = pricingRule(payload.pricingRuleId);

  if (!rule) {
    return `Pricing Rule ${payload.pricingRuleId} was not found.`;
  }

  if (!rule.counterpartyRoles.includes("HEDGE_COUNTERPARTY")) {
    return `Pricing Rule ${payload.pricingRuleId} must reference a Trading Counterparty with the HEDGE_COUNTERPARTY role.`;
  }

  if (!eligibleHedgeDealPricingRule(payload.pricingRuleId, pricingMode)) {
    return `Pricing Rule ${payload.pricingRuleId} must reference an active HEDGE_COUNTERPARTY and use an active ${pricingMode} Originating System.`;
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

function hedgeDealReferenceError(payload) {
  return hedgeDealReferenceErrorForPricingMode(payload, "DEALER_PRICED");
}

function autoPricedHedgeDealReferenceError(payload) {
  return hedgeDealReferenceErrorForPricingMode(payload, "AUTO_PRICED");
}

function hedgeQuickModeSettingsReferenceError(payload) {
  const pair = ccyPairOption(payload.ccyPairCode);

  if (!pair) {
    return `Ccy Pair ${payload.ccyPairCode} was not found.`;
  }

  const rule = pricingRule(payload.pricingRuleId);

  if (!rule) {
    return `Pricing Rule ${payload.pricingRuleId} was not found.`;
  }

  if (!rule.counterpartyRoles.includes("HEDGE_COUNTERPARTY")) {
    return `Pricing Rule ${payload.pricingRuleId} must reference a Trading Counterparty with the HEDGE_COUNTERPARTY role.`;
  }

  if (rule.counterpartyId !== payload.counterpartyId) {
    return `Pricing Rule ${payload.pricingRuleId} does not belong to Trading Counterparty ${payload.counterpartyId}.`;
  }

  if (rule.pricingMode !== "AUTO_PRICED") {
    return `Pricing Rule ${payload.pricingRuleId} must use an AUTO_PRICED Originating System.`;
  }

  if (rule.ccyPairCode !== payload.ccyPairCode) {
    return `Pricing Rule ${payload.pricingRuleId} does not match Ccy Pair ${payload.ccyPairCode}.`;
  }

  if (pair.baseCurrencyFractionDigits !== payload.baseCcyFractionDigits) {
    return `Base currency precision for ${payload.ccyPairCode} has changed.`;
  }

  return "";
}

function databaseConstraintMessage(error) {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes("Pricing Rule Trade Context must be attached to its Trading Counterparty")) {
    return {
      status: 409,
      code: "PRICING_RULE_TRADE_CONTEXT_NOT_ATTACHED",
      message: "A Pricing Rule can use only a Trade Context attached to its Trading Counterparty."
    };
  }

  if (message.includes("a Trade Context assignment used by Pricing Rules cannot be detached")) {
    return {
      status: 409,
      code: "COUNTERPARTY_TRADE_CONTEXT_IN_USE",
      message: "The Trade Context cannot be detached while Pricing Rules use this assignment."
    };
  }

  if (message.includes("a Trade Context assignment identity cannot be changed")) {
    return {
      status: 409,
      code: "COUNTERPARTY_TRADE_CONTEXT_IMMUTABLE",
      message: "A Trade Context assignment cannot be changed. Attach a new Context and detach the old one."
    };
  }

  if (message.includes("an Originating System used by Trade Context cannot change Pricing Mode")) {
    return {
      status: 409,
      code: "ORIGINATING_SYSTEM_PRICING_MODE_IMMUTABLE",
      message: "An Originating System Pricing Mode cannot be changed while it is used by Trade Context."
    };
  }

  if (message.includes("a Trading Counterparty used by client_deals must retain the CLIENT role")) {
    return {
      status: 409,
      code: "TRADING_COUNTERPARTY_HAS_CLIENT_DEALS",
      message: "A Trading Counterparty used by Client Deals must retain the CLIENT role."
    };
  }

  if (message.includes("client_deals.counterparty_id must reference a Trading Counterparty with the CLIENT role")) {
    return {
      status: 400,
      code: "INVALID_CLIENT_DEAL_COUNTERPARTY",
      message: "A Client Deal must reference a Trading Counterparty with the CLIENT role."
    };
  }

  if (message.includes("a Trading Counterparty used by hedge_deals must retain the HEDGE_COUNTERPARTY role")) {
    return {
      status: 409,
      code: "TRADING_COUNTERPARTY_HAS_HEDGE_DEALS",
      message: "A Trading Counterparty used by Hedge Deals must retain the HEDGE_COUNTERPARTY role."
    };
  }

  if (message.includes("hedge_deals.counterparty_id must reference a Trading Counterparty with the HEDGE_COUNTERPARTY role")) {
    return {
      status: 400,
      code: "INVALID_HEDGE_DEAL_COUNTERPARTY",
      message: "A Hedge Deal must reference a Trading Counterparty with the HEDGE_COUNTERPARTY role."
    };
  }

  if (message.includes("hedge_quick_mode_settings must reference an AUTO_PRICED HEDGE_COUNTERPARTY")) {
    return {
      status: 400,
      code: "INVALID_HEDGE_QUICK_MODE_SETTINGS_REFERENCE",
      message: "Hedge Quick Mode Settings must reference an AUTO_PRICED HEDGE_COUNTERPARTY Pricing Rule for the same Ccy Pair."
    };
  }

  if (message.includes("hedge_quick_mode_settings.base_ccy_fraction_digits")) {
    return {
      status: 400,
      code: "INVALID_HEDGE_QUICK_MODE_SETTINGS_PRECISION",
      message: "Hedge Quick Mode Settings must use the configured base currency precision."
    };
  }

  if ([
    "a Pricing Rule used by hedge_quick_mode_settings",
    "a Trading Counterparty used by hedge_quick_mode_settings",
    "a Trade Context used by hedge_quick_mode_settings",
    "an Originating System used by hedge_quick_mode_settings",
    "base currency precision used by hedge_quick_mode_settings"
  ].some(fragment => message.includes(fragment))) {
    return {
      status: 409,
      code: "HEDGE_QUICK_MODE_SETTINGS_IN_USE",
      message: "The record is used by Hedge Quick Mode Settings."
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

function databaseObjects() {
  return database.prepare(`
    SELECT name, type AS objectType
    FROM sqlite_master
    WHERE type IN ('table', 'view')
      AND name NOT LIKE 'sqlite_%'
      AND name <> 'application_schema_migrations'
    ORDER BY name
  `).all().map(row => ({ ...row }));
}

function databaseObjectNames() {
  return databaseObjects().map(object => object.name);
}

function quotedIdentifier(identifier) {
  if (!databaseObjectNames().includes(identifier)) {
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
    SELECT type AS objectType, sql
    FROM sqlite_master
    WHERE type IN ('table', 'view') AND name = ?
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
    objectType: schemaRow?.objectType || "table",
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

  if (method === "GET" && pathname === "/api/v1/market-pulse/candle-aggregation/calendar") {
    const result = await candleAggregationApi.calendar(url.searchParams);
    sendJson(response, result.statusCode, result.body);
    return true;
  }
  if (method === "GET" && pathname === "/api/v1/market-pulse/candle-aggregation/day") {
    const result = await candleAggregationApi.day(url.searchParams);
    sendJson(response, result.statusCode, result.body);
    return true;
  }
  if (method === "POST" && pathname === "/api/v1/market-pulse/candle-aggregation/calculate-day") {
    const result = await candleAggregationApi.calculateDay(await readJsonBody(request));
    sendJson(response, result.statusCode, result.body);
    return true;
  }
  if (method === "GET" && pathname === "/api/v1/market-pulse/historical-candles/calendar") {
    const result = await historicalCandlesApi.calendar(url.searchParams);
    sendJson(response, result.statusCode, result.body);
    return true;
  }
  if (method === "POST" && pathname === "/api/v1/market-pulse/historical-candles/calendar/load-day") {
    const result = await historicalCandlesApi.loadDay(await readJsonBody(request));
    sendJson(response, result.statusCode, result.body);
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
      originatingSystems: originatingSystems(),
      tradePurposes: tradePurposeApi.list(),
      tradeContexts: tradeContexts(),
      tradingCounterparties: tradingCounterparties(),
      users: users(),
      pricingRules: pricingRules(),
      clientDealPricingRules: clientDealPricingRules(),
      hedgeDealPricingRules: [
        ...hedgeDealPricingRules(),
        ...autoPricedHedgeDealPricingRules()
      ],
      hedgeQuickModeSettings: hedgeQuickModeSettings(),
      batchingSettings: batchingSettings(),
      autoBatchingSettings: autoBatchingSettings(),
      autoModeEligibilityRules: autoModeEligibilityRules(),
      autoBatchingProcess: autoBatchingProcess.status(),
      clientDeals: clientDeals(),
      hedgeDeals: hedgeDeals(),
      positions: positions(),
      batches: batches(),
      uiTableLayouts: Object.entries(UI_TABLE_LAYOUTS).map(([tableKey, tableLayout]) => ({
        tableKey,
        tableLabel: tableLayout.tableLabel,
        columns: uiTableColumnSettings(tableKey)
      }))
    }).replace(/</g, "\\u003c");
    sendText(
      response,
      200,
      `window.__DEMO_API_BOOTSTRAP__ = ${bootstrap};\n`,
      "text/javascript; charset=utf-8"
    );
    return true;
  }

  const uiTableColumnSettingsMatch =
    /^\/api\/v1\/ui-table-column-settings\/([a-z0-9_]+)$/.exec(pathname);
  const uiTableColumnSettingsResetMatch =
    /^\/api\/v1\/ui-table-column-settings\/([a-z0-9_]+)\/reset$/.exec(pathname);
  const uiTableColumnSettingsDefaultsMatch =
    /^\/api\/v1\/ui-table-column-settings\/([a-z0-9_]+)\/defaults$/.exec(pathname);

  if (uiTableColumnSettingsMatch && method === "GET") {
    const tableKey = uiTableColumnSettingsMatch[1];

    if (!uiTableColumnDefinitions(tableKey)) {
      apiError(response, 404, "UI_TABLE_LAYOUT_NOT_FOUND", `UI table layout ${tableKey} was not found.`);
    } else {
      sendJson(response, 200, uiTableColumnSettings(tableKey));
    }

    return true;
  }

  if (uiTableColumnSettingsMatch && method === "PUT") {
    const tableKey = uiTableColumnSettingsMatch[1];
    const body = await readJsonBody(request);
    const payload = validateUiTableColumnSettingsPayload(tableKey, body);

    if (payload.error) {
      apiError(response, 400, "INVALID_UI_TABLE_COLUMN_SETTINGS", payload.error);
      return true;
    }

    try {
      sendJson(response, 200, updateUiTableColumnSettings(payload));
    } catch (error) {
      handleDatabaseError(response, error);
    }

    return true;
  }

  if (uiTableColumnSettingsResetMatch && method === "POST") {
    const tableKey = uiTableColumnSettingsResetMatch[1];

    if (!uiTableColumnDefinitions(tableKey)) {
      apiError(response, 404, "UI_TABLE_LAYOUT_NOT_FOUND", `UI table layout ${tableKey} was not found.`);
    } else {
      try {
        sendJson(response, 200, resetUiTableColumnSettings(tableKey));
      } catch (error) {
        handleDatabaseError(response, error);
      }
    }

    return true;
  }

  if (uiTableColumnSettingsDefaultsMatch && method === "PUT") {
    const tableKey = uiTableColumnSettingsDefaultsMatch[1];
    const body = await readJsonBody(request);

    if (body.confirmation !== UI_TABLE_DEFAULT_CONFIRMATION) {
      apiError(
        response,
        400,
        "INVALID_UI_TABLE_DEFAULT_CONFIRMATION",
        `Saving default column widths requires confirmation ${UI_TABLE_DEFAULT_CONFIRMATION}.`
      );
      return true;
    }

    const payload = validateUiTableColumnSettingsPayload(tableKey, body);

    if (payload.error) {
      apiError(response, 400, "INVALID_UI_TABLE_COLUMN_SETTINGS", payload.error);
      return true;
    }

    try {
      sendJson(response, 200, updateUiTableColumnDefaults(payload));
    } catch (error) {
      handleDatabaseError(response, error);
    }

    return true;
  }

  if (pathname === "/api/v1/demo/trades/reset" && method === "POST") {
    const body = await readJsonBody(request);

    if (body.confirmation !== DEMO_TRADE_RESET_CONFIRMATION) {
      apiError(
        response,
        400,
        "INVALID_DEMO_TRADE_RESET_CONFIRMATION",
        `Demo Trade reset requires confirmation ${DEMO_TRADE_RESET_CONFIRMATION}.`
      );
      return true;
    }

    try {
      sendJson(response, 200, resetDemoTrades());
    } catch (error) {
      handleDatabaseError(response, error);
    }

    return true;
  }

  if (pathname === "/api/v1/client-deal-generation/settings" && method === "GET") {
    sendJson(response, 200, clientDealGenerationSettings());
    return true;
  }

  if (
    pathname === "/api/v1/client-deal-generation/process-settings"
    && method === "GET"
  ) {
    sendJson(response, 200, clientDealGenerationProcessSettings());
    return true;
  }

  if (
    pathname === "/api/v1/client-deal-generation/process-settings"
    && method === "PUT"
  ) {
    const body = await readJsonBody(request);
    const payload = validateClientDealGenerationProcessSettingsPayload(body);

    if (payload.error) {
      apiError(
        response,
        400,
        "INVALID_CLIENT_DEAL_GENERATION_PROCESS_SETTINGS",
        payload.error
      );
      return true;
    }

    try {
      updateClientDealGenerationProcessSettings(payload);
      clientDealGenerationProcess.reschedule();
      sendJson(response, 200, clientDealGenerationProcessSettings());
    } catch (error) {
      handleDatabaseError(response, error);
    }

    return true;
  }

  const clientDealGenerationSettingsMatch =
    /^\/api\/v1\/client-deal-generation\/settings\/(\d+)$/.exec(pathname);

  if (clientDealGenerationSettingsMatch && method === "PUT") {
    const pricingRuleId = Number(clientDealGenerationSettingsMatch[1]);
    const currentSettings = clientDealGenerationSetting(pricingRuleId);

    if (!currentSettings) {
      apiError(
        response,
        404,
        "CLIENT_DEAL_GENERATION_SETTINGS_NOT_FOUND",
        `Client Deal Generation Settings for Pricing Rule ${pricingRuleId} were not found.`
      );
      return true;
    }

    const body = await readJsonBody(request);
    const payload = validateClientDealGenerationSettingsPayload(
      body,
      currentSettings.baseCcyFractionDigits
    );

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
      const deal = generateOneClientDeal();
      sendJson(response, 201, deal);
    } catch (error) {
      if (String(error?.code || "").startsWith("CLIENT_DEAL_GENERATION_")
        || error?.code === "GENERATED_CLIENT_DEAL_INVALID") {
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

  if (pathname === "/api/v1/client-deals" && method === "GET") {
    sendJson(response, 200, clientDeals());
    return true;
  }

  if (pathname === "/api/v1/reports/analytical-pnl" && method === "GET") {
    const filters = analyticalPnlReportFilters(url.searchParams);

    if (filters.error) {
      apiError(response, 400, "INVALID_ANALYTICAL_PNL_REPORT_FILTERS", filters.error);
    } else {
      sendJson(response, 200, analyticalPnlReport(filters));
    }

    return true;
  }

  if (pathname === "/api/v1/positions" && method === "GET") {
    sendJson(response, 200, positions());
    return true;
  }

  if (
    pathname === "/api/v1/positions/move-to-auto-management"
    && method === "POST"
  ) {
    const body = await readJsonBody(request);

    try {
      const result = moveTradesToAutoManagementUseCase.execute(body);

      if (result.transitionedCount > 0) {
        autoBatchingProcess.requestEvaluation();
      }

      sendJson(response, 200, result);
    } catch (error) {
      if (
        error?.code === "INVALID_POSITION_MODE_TRANSITION_COMMAND"
        || error?.code === "INVALID_TRADE_IDENTITY"
      ) {
        apiError(response, 400, error.code, error.message);
      } else if (error?.code === "POSITION_TRADE_NOT_FOUND") {
        apiError(response, 404, error.code, error.message);
      } else if (
        error?.code === "AUTO_MANAGEMENT_ADMISSION_REJECTED"
        || error?.code === "POSITION_MODE_TRANSITION_REJECTED"
        || error?.code === "POSITION_MODE_TRANSITION_BLOCKED"
        || error?.code === "POSITION_MODE_TRANSITION_CONFLICT"
      ) {
        apiError(response, 409, error.code, error.message);
      } else {
        handleDatabaseError(response, error);
      }
    }

    return true;
  }

  if (pathname === "/api/v1/batching-settings" && method === "GET") {
    sendJson(response, 200, batchingSettings());
    return true;
  }

  if (pathname === "/api/v1/batching-settings" && method === "PUT") {
    const body = await readJsonBody(request);
    const payload = validateBatchingSettingsPayload(body);

    if (payload.error) {
      apiError(response, 400, "INVALID_BATCHING_SETTINGS", payload.error);
      return true;
    }

    try {
      sendJson(response, 200, updateBatchingSettings(payload));
    } catch (error) {
      handleDatabaseError(response, error);
    }

    return true;
  }

  if (pathname === "/api/v1/auto-batching-settings" && method === "GET") {
    sendJson(response, 200, autoBatchingSettings());
    return true;
  }

  if (pathname === "/api/v1/auto-batching-settings" && method === "PUT") {
    const body = await readJsonBody(request);
    const payload = validateAutoBatchingSettingsPayload(body);

    if (payload.error) {
      apiError(response, 400, "INVALID_AUTO_BATCHING_SETTINGS", payload.error);
      return true;
    }

    try {
      const previousSettings = autoBatchingSettings();
      const settings = updateAutoBatchingSettings(payload);

      if (
        settings.maxIntervalSeconds !== previousSettings.maxIntervalSeconds
        || settings.maxTransferRateSpreadPercent
          !== previousSettings.maxTransferRateSpreadPercent
        || settings.tenorCompatibilityMode
          !== previousSettings.tenorCompatibilityMode
        || settings.eligibleCcyPairCodes.join(",")
          !== previousSettings.eligibleCcyPairCodes.join(",")
      ) {
        autoBatchingProcess.reschedule();
      }

      sendJson(response, 200, settings);
    } catch (error) {
      handleDatabaseError(response, error);
    }

    return true;
  }

  if (pathname === "/api/v1/auto-batching/process" && method === "GET") {
    sendJson(response, 200, autoBatchingProcess.status());
    return true;
  }

  if (pathname === "/api/v1/auto-batching/process/start" && method === "POST") {
    try {
      sendJson(response, 200, autoBatchingProcess.start());
    } catch (error) {
      handleDatabaseError(response, error);
    }
    return true;
  }

  if (pathname === "/api/v1/auto-batching/process/stop" && method === "POST") {
    sendJson(response, 200, autoBatchingProcess.stop());
    return true;
  }

  if (pathname === "/api/v1/batches" && method === "GET") {
    sendJson(response, 200, batches());
    return true;
  }

  if (pathname === "/api/v1/batch-formation-audit" && method === "GET") {
    sendJson(response, 200, batchFormationAudit());
    return true;
  }

  if (pathname === "/api/v1/batching-positions" && method === "GET") {
    sendJson(response, 200, batchTrades());
    return true;
  }

  if (pathname === "/api/v1/batches" && method === "POST") {
    const body = await readJsonBody(request);
    const legacyMode = body.mode === undefined
      ? null
      : String(body.mode || "").trim().toUpperCase();

    if (legacyMode !== null && legacyMode !== "SINGLE_BATCH") {
      apiError(
        response,
        400,
        "INVALID_BATCH_COMMAND",
        "Manual batching creates exactly one Batch; selection mode is not supported."
      );
      return true;
    }

    try {
      const result = formBatchUseCase.execute({
        idempotencyKey: request.headers?.["idempotency-key"] ?? body.idempotencyKey,
        tradeIds: body.tradeIds
      });
      autoBatchingProcess.requestEvaluation();
      sendJson(response, result.replayed ? 200 : 201, result);
    } catch (error) {
      if (
        error?.code === "INVALID_BATCH_COMMAND"
      ) {
        apiError(response, 400, error.code, error.message);
      } else if (error?.code === "BATCH_SOURCE_TRADE_NOT_FOUND") {
        apiError(response, 404, error.code, error.message);
      } else if (error?.code === "BATCH_IDEMPOTENCY_CONFLICT") {
        apiError(response, 409, error.code, error.message);
      } else if (String(error?.code || "").includes("BATCH")) {
        apiError(response, 422, error.code, error.message);
      } else {
        handleDatabaseError(response, error);
      }
    }

    return true;
  }

  const batchRollbackMatch = /^\/api\/v1\/batches\/(\d+)\/rollback$/.exec(pathname);

  if (batchRollbackMatch && method === "POST") {
    const batchId = Number(batchRollbackMatch[1]);

    try {
      const result = rollbackBatch(batchId);
      autoBatchingProcess.excludeTradesFromCurrentRun(
        result.returnedTradeIds
      );
      sendJson(response, 200, result);
    } catch (error) {
      if (error?.code === "BATCH_NOT_FOUND") {
        apiError(response, 404, error.code, error.message);
      } else if (
        error?.code === "BATCH_NOT_ROLLBACKABLE"
        || error?.code === "BATCH_ROLLBACK_CONFLICT"
      ) {
        apiError(response, 409, error.code, error.message);
      } else {
        handleDatabaseError(response, error);
      }
    }

    return true;
  }

  const batchMatch = /^\/api\/v1\/batches\/(\d+)$/.exec(pathname);

  if (batchMatch && method === "GET") {
    const batchId = Number(batchMatch[1]);
    const batch = database.prepare(`
      SELECT 1 AS present
      FROM batches
      WHERE batch_id = ?
        AND batch_status IN ('FORMED', 'ROLLED_BACK')
    `).get(batchId);

    if (!batch) {
      apiError(response, 404, "BATCH_NOT_FOUND", `Batch ${batchId} was not found.`);
    } else {
      sendJson(response, 200, batchDetails(batchId));
    }

    return true;
  }

  if (pathname === "/api/v1/hedge-deal-pricing-rules" && method === "GET") {
    const requestedPricingMode = normalizedText(
      url.searchParams.get("pricingMode")
    ).toUpperCase() || "DEALER_PRICED";

    if (!HEDGE_DEAL_PRICING_MODES.has(requestedPricingMode)) {
      apiError(
        response,
        400,
        "INVALID_HEDGE_DEAL_PRICING_MODE",
        "Hedge Deal Pricing Mode must be AUTO_PRICED or DEALER_PRICED."
      );
      return true;
    }

    sendJson(response, 200, eligibleHedgeDealPricingRules(requestedPricingMode));
    return true;
  }

  if (pathname === "/api/v1/hedge-deals" && method === "GET") {
    sendJson(response, 200, hedgeDeals());
    return true;
  }

  if (pathname === "/api/v1/hedge-quick-mode-settings" && method === "GET") {
    sendJson(response, 200, hedgeQuickModeSettings());
    return true;
  }

  const hedgeQuickModeSettingsMatch =
    /^\/api\/v1\/hedge-quick-mode-settings\/([A-Za-z]{3}_[A-Za-z]{3})$/.exec(pathname);

  if (hedgeQuickModeSettingsMatch && method === "GET") {
    const ccyPairCode = hedgeQuickModeSettingsMatch[1].toUpperCase();
    const settings = hedgeQuickModeSetting(ccyPairCode);

    if (!settings) {
      apiError(
        response,
        404,
        "HEDGE_QUICK_MODE_SETTINGS_NOT_FOUND",
        `Hedge Quick Mode Settings for ${ccyPairCode} were not found.`
      );
    } else {
      sendJson(response, 200, settings);
    }

    return true;
  }

  if (hedgeQuickModeSettingsMatch && method === "PUT") {
    const ccyPairCode = hedgeQuickModeSettingsMatch[1].toUpperCase();
    const pair = ccyPairOption(ccyPairCode);

    if (!pair) {
      apiError(
        response,
        404,
        "CCY_PAIR_NOT_FOUND",
        `Ccy Pair ${ccyPairCode} was not found.`
      );
      return true;
    }

    const body = await readJsonBody(request);
    const payload = validateHedgeQuickModeSettingsPayload(
      body,
      ccyPairCode,
      pair.baseCurrencyFractionDigits
    );

    if (payload.error) {
      apiError(
        response,
        400,
        "INVALID_HEDGE_QUICK_MODE_SETTINGS",
        payload.error
      );
      return true;
    }

    const referenceError = hedgeQuickModeSettingsReferenceError(payload);

    if (referenceError) {
      apiError(
        response,
        400,
        "INVALID_HEDGE_QUICK_MODE_SETTINGS_REFERENCE",
        referenceError
      );
      return true;
    }

    const existed = Boolean(hedgeQuickModeSetting(ccyPairCode));

    try {
      const settings = replaceHedgeQuickModeSetting(payload);
      sendJson(response, existed ? 200 : 201, settings);
    } catch (error) {
      handleDatabaseError(response, error);
    }

    return true;
  }

  if (hedgeQuickModeSettingsMatch && method === "DELETE") {
    const ccyPairCode = hedgeQuickModeSettingsMatch[1].toUpperCase();

    if (!deleteHedgeQuickModeSetting(ccyPairCode)) {
      apiError(
        response,
        404,
        "HEDGE_QUICK_MODE_SETTINGS_NOT_FOUND",
        `Hedge Quick Mode Settings for ${ccyPairCode} were not found.`
      );
    } else {
      sendJson(response, 200, { deleted: true, ccyPairCode });
    }

    return true;
  }

  if (pathname === "/api/v1/hedge-deals/quick-mode" && method === "POST") {
    const requestTimestamp = new Date().toISOString();
    const body = await readJsonBody(request);
    const payload = validateHedgeQuickModeDealPayload(body);

    if (payload.error) {
      apiError(response, 400, "INVALID_HEDGE_QUICK_MODE_DEAL", payload.error);
      return true;
    }

    const settings = hedgeQuickModeSetting(payload.ccyPairCode);

    if (!settings) {
      apiError(
        response,
        404,
        "HEDGE_QUICK_MODE_SETTINGS_NOT_FOUND",
        `Hedge Quick Mode Settings for ${payload.ccyPairCode} were not found.`
      );
      return true;
    }

    if (!settings.active) {
      apiError(
        response,
        409,
        "HEDGE_QUICK_MODE_DISABLED",
        `Hedge Quick Mode is disabled for ${payload.ccyPairCode}.`
      );
      return true;
    }

    if (!settings.counterpartyActive || !settings.originatingSystemActive) {
      apiError(
        response,
        409,
        "HEDGE_QUICK_MODE_REFERENCE_INACTIVE",
        "The configured Hedge Counterparty and Originating System must be active."
      );
      return true;
    }

    try {
      const instruction = hedgeQuickModeInstruction({
        settings,
        presetCode: payload.presetCode,
        side: payload.side,
        tenor: payload.tenor || settings.defaultTenor
      });
      const referenceError = autoPricedHedgeDealReferenceError(instruction);

      if (referenceError) {
        apiError(
          response,
          409,
          "HEDGE_QUICK_MODE_REFERENCE_UNAVAILABLE",
          referenceError
        );
        return true;
      }

      const priced = autoPricedHedgeDealWithCalculatedTerms({
        ...instruction,
        positionManagementMode: payload.positionManagementMode
      });
      const tradeId = createHedgeDeal(
        priced.deal,
        priced.exposureAmounts,
        requestTimestamp
      );
      sendJson(response, 201, hedgeDeal(tradeId));
    } catch (error) {
      if (error?.code === "AUTO_PRICED_HEDGE_MARKET_QUOTE_UNAVAILABLE") {
        apiError(response, 409, error.code, error.message);
      } else if (error instanceof TypeError || error instanceof RangeError) {
        apiError(response, 409, "INVALID_HEDGE_QUICK_MODE_CONFIGURATION", error.message);
      } else {
        handleDatabaseError(response, error);
      }
    }

    return true;
  }

  if (pathname === "/api/v1/hedge-deals/auto-priced" && method === "POST") {
    const requestTimestamp = new Date().toISOString();
    const body = await readJsonBody(request);
    const payload = validateAutoPricedHedgeDealPayload(body);

    if (payload.error) {
      apiError(response, 400, "INVALID_AUTO_PRICED_HEDGE_DEAL", payload.error);
      return true;
    }

    const referenceError = autoPricedHedgeDealReferenceError(payload);

    if (referenceError) {
      apiError(
        response,
        400,
        "INVALID_AUTO_PRICED_HEDGE_DEAL_REFERENCE",
        referenceError
      );
      return true;
    }

    try {
      const priced = autoPricedHedgeDealWithCalculatedTerms(payload);
      const tradeId = createHedgeDeal(
        priced.deal,
        priced.exposureAmounts,
        requestTimestamp
      );
      sendJson(response, 201, hedgeDeal(tradeId));
    } catch (error) {
      if (error?.code === "AUTO_PRICED_HEDGE_MARKET_QUOTE_UNAVAILABLE") {
        apiError(response, 409, error.code, error.message);
      } else if (error instanceof TypeError || error instanceof RangeError) {
        apiError(response, 400, "INVALID_AUTO_PRICED_HEDGE_DEAL_AMOUNT", error.message);
      } else {
        handleDatabaseError(response, error);
      }
    }

    return true;
  }

  if (pathname === "/api/v1/hedge-deals" && method === "POST") {
    const requestTimestamp = new Date().toISOString();
    const body = await readJsonBody(request);
    const payload = validateHedgeDealPayload(body);

    if (payload.error) {
      apiError(response, 400, "INVALID_HEDGE_DEAL", payload.error);
      return true;
    }

    const referenceError = hedgeDealReferenceError(payload);

    if (referenceError) {
      apiError(response, 400, "INVALID_HEDGE_DEAL_REFERENCE", referenceError);
      return true;
    }

    try {
      const exposureAmounts = tradeExposureAmounts(payload);
      const tradeId = createHedgeDeal(
        hedgeDealWithCalculatedTerms(payload, exposureAmounts),
        exposureAmounts,
        requestTimestamp
      );
      sendJson(response, 201, hedgeDeal(tradeId));
    } catch (error) {
      if (error instanceof TypeError || error instanceof RangeError) {
        apiError(response, 400, "INVALID_HEDGE_DEAL_AMOUNT", error.message);
      } else {
        handleDatabaseError(response, error);
      }
    }

    return true;
  }

  const hedgeDealMatch = /^\/api\/v1\/hedge-deals\/(\d+)$/.exec(pathname);

  if (hedgeDealMatch && method === "DELETE") {
    apiError(
      response,
      405,
      "HEDGE_DEAL_IMMUTABLE",
      "Hedge Deals cannot be changed or deleted."
    );
    return true;
  }

  if (pathname === "/api/v1/client-deals" && method === "POST") {
    const body = await readJsonBody(request);
    const payload = validateClientDealPayload(body);

    if (payload.error) {
      apiError(response, 400, "INVALID_CLIENT_DEAL", payload.error);
      return true;
    }

    const referenceError = clientDealReferenceError(payload);

    if (referenceError) {
      apiError(response, 400, "INVALID_CLIENT_DEAL_REFERENCE", referenceError);
      return true;
    }

    try {
      const exposureAmounts = tradeExposureAmounts(payload);
      const tradeId = createClientDeal(
        clientDealWithCalculatedEconomics(payload, exposureAmounts),
        exposureAmounts
      );
      sendJson(response, 201, clientDeal(tradeId));
    } catch (error) {
      if (error instanceof TypeError || error instanceof RangeError) {
        apiError(response, 400, "INVALID_CLIENT_DEAL_AMOUNT", error.message);
      } else {
        handleDatabaseError(response, error);
      }
    }

    return true;
  }

  const clientDealMatch = /^\/api\/v1\/client-deals\/(\d+)$/.exec(pathname);

  if (clientDealMatch && method === "GET") {
    const deal = clientDeal(Number(clientDealMatch[1]));

    if (!deal) {
      apiError(response, 404, "CLIENT_DEAL_NOT_FOUND", "Client Deal was not found.");
    } else {
      sendJson(response, 200, deal);
    }

    return true;
  }

  if (clientDealMatch && (method === "PUT" || method === "PATCH")) {
    apiError(
      response,
      405,
      "CLIENT_DEAL_IMMUTABLE",
      "Client Deal attributes, including Comment, are immutable."
    );
    return true;
  }

  if (clientDealMatch && method === "DELETE") {
    apiError(
      response,
      405,
      "CLIENT_DEAL_IMMUTABLE",
      "Client Deals cannot be deleted."
    );
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

    const assignmentError = pricingRuleTradeContextAssignmentError(payload);

    if (assignmentError) {
      apiError(
        response,
        409,
        "PRICING_RULE_TRADE_CONTEXT_NOT_ATTACHED",
        assignmentError
      );
      return true;
    }

    try {
      const pricingRuleId = runInImmediateTransaction(database, () => {
        const result = database.prepare(`
          INSERT INTO pricing_rules
            (
              counterparty_id,
              trade_context_id,
              ccy_pair_code,
              margin_percent,
              auto_management_admission_mode_override
            )
          VALUES (?, ?, ?, ?, ?)
        `).run(
          payload.counterpartyId,
          payload.tradeContextId,
          payload.ccyPairCode,
          payload.marginPercent,
          payload.autoManagementAdmissionModeOverride
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

    if (pricingRuleImmutableTermsChanged(body, current)) {
      apiError(
        response,
        409,
        "PRICING_RULE_TERMS_IMMUTABLE",
        "Counterparty, Ccy Pair and Trade Context cannot be changed. Create a new Pricing Rule for different terms; only Margin Percent and Initial Mode Assignment override can be edited."
      );
      return true;
    }

    const payload = validatePricingRuleUpdatePayload(body, current);

    if (payload.error) {
      apiError(response, 400, "INVALID_PRICING_RULE", payload.error);
      return true;
    }

    try {
      database.prepare(`
        UPDATE pricing_rules
        SET margin_percent = ?,
            auto_management_admission_mode_override = ?
        WHERE pricing_rule_id = ?
      `).run(
        payload.marginPercent,
        payload.autoManagementAdmissionModeOverride,
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
    const current = pricingRule(pricingRuleId);

    if (!current) {
      apiError(response, 404, "PRICING_RULE_NOT_FOUND", `Pricing Rule ${pricingRuleId} was not found.`);
      return true;
    }

    const conflictMessage = pricingRuleDeletionConflictMessage(
      pricingRuleId,
      pricingRuleDeletionUsage(pricingRuleId)
    );

    if (conflictMessage) {
      apiError(response, 409, "PRICING_RULE_IN_USE", conflictMessage);
      return true;
    }

    try {
      database.prepare("DELETE FROM pricing_rules WHERE pricing_rule_id = ?").run(pricingRuleId);
    } catch (error) {
      handleDatabaseError(response, error);
      return true;
    }

    response.writeHead(204);
    response.end();
    return true;
  }

  if (pathname === "/api/v1/trading-counterparties" && method === "GET") {
    sendJson(response, 200, tradingCounterparties());
    return true;
  }

  if (pathname === "/api/v1/trading-counterparties" && method === "POST") {
    const body = await readJsonBody(request);
    const payload = validateTradingCounterpartyPayload(body);

    if (payload.error) {
      apiError(response, 400, "INVALID_TRADING_COUNTERPARTY", payload.error);
      return true;
    }

    try {
      let counterpartyId = null;

      runInImmediateTransaction(database, () => {
        const result = database.prepare(`
          INSERT INTO trading_counterparties (counterparty_scope, counterparty_name, is_active)
          VALUES (?, ?, ?)
        `).run(payload.counterpartyScope, payload.counterpartyName, payload.active ? 1 : 0);
        counterpartyId = Number(result.lastInsertRowid);
        saveTradingCounterpartyProfile(database, counterpartyId, payload);
        synchronizeTradingCounterpartyRoles(database, counterpartyId, payload.counterpartyRoles);
        synchronizeClientDealGenerationSettings(database);
      });
      sendJson(response, 201, tradingCounterparty(counterpartyId));
    } catch (error) {
      handleDatabaseError(response, error);
    }

    return true;
  }

  const tradingCounterpartyTradeContextsMatch =
    /^\/api\/v1\/trading-counterparties\/(\d+)\/trade-contexts$/.exec(pathname);
  const tradingCounterpartyTradeContextMatch =
    /^\/api\/v1\/trading-counterparties\/(\d+)\/trade-contexts\/(\d+)$/.exec(pathname);

  if (tradingCounterpartyTradeContextsMatch && method === "GET") {
    const counterpartyId = Number(tradingCounterpartyTradeContextsMatch[1]);

    if (!tradingCounterparty(counterpartyId)) {
      apiError(
        response,
        404,
        "TRADING_COUNTERPARTY_NOT_FOUND",
        `Trading Counterparty ${counterpartyId} was not found.`
      );
      return true;
    }

    sendJson(response, 200, tradingCounterpartyTradeContexts(counterpartyId));
    return true;
  }

  if (tradingCounterpartyTradeContextsMatch && method === "PUT") {
    const counterpartyId = Number(tradingCounterpartyTradeContextsMatch[1]);

    if (!tradingCounterparty(counterpartyId)) {
      apiError(
        response,
        404,
        "TRADING_COUNTERPARTY_NOT_FOUND",
        `Trading Counterparty ${counterpartyId} was not found.`
      );
      return true;
    }

    const body = await readJsonBody(request);
    const payload = validateTradingCounterpartyTradeContextsPayload(body);

    if (payload.error) {
      apiError(response, 400, "INVALID_TRADE_CONTEXT_ASSIGNMENTS", payload.error);
      return true;
    }

    const missingTradeContextId = payload.tradeContextIds
      .find(tradeContextId => !tradeContext(tradeContextId));

    if (missingTradeContextId !== undefined) {
      apiError(
        response,
        404,
        "TRADE_CONTEXT_NOT_FOUND",
        `Trade Context ${missingTradeContextId} was not found.`
      );
      return true;
    }

    try {
      runInImmediateTransaction(database, () => {
        const attach = database.prepare(`
          INSERT OR IGNORE INTO trading_counterparty_trade_contexts
            (counterparty_id, trade_context_id)
          VALUES (?, ?)
        `);

        payload.tradeContextIds.forEach(tradeContextId => {
          attach.run(counterpartyId, tradeContextId);
        });
      });
      sendJson(response, 200, tradingCounterpartyTradeContexts(counterpartyId));
    } catch (error) {
      handleDatabaseError(response, error);
    }

    return true;
  }

  if (tradingCounterpartyTradeContextMatch && method === "PUT") {
    const counterpartyId = Number(tradingCounterpartyTradeContextMatch[1]);
    const tradeContextId = Number(tradingCounterpartyTradeContextMatch[2]);

    if (!tradingCounterparty(counterpartyId)) {
      apiError(
        response,
        404,
        "TRADING_COUNTERPARTY_NOT_FOUND",
        `Trading Counterparty ${counterpartyId} was not found.`
      );
      return true;
    }

    if (!tradeContext(tradeContextId)) {
      apiError(
        response,
        404,
        "TRADE_CONTEXT_NOT_FOUND",
        `Trade Context ${tradeContextId} was not found.`
      );
      return true;
    }

    try {
      database.prepare(`
        INSERT OR IGNORE INTO trading_counterparty_trade_contexts
          (counterparty_id, trade_context_id)
        VALUES (?, ?)
      `).run(counterpartyId, tradeContextId);
      sendJson(
        response,
        200,
        tradingCounterpartyTradeContext(counterpartyId, tradeContextId)
      );
    } catch (error) {
      handleDatabaseError(response, error);
    }

    return true;
  }

  if (tradingCounterpartyTradeContextMatch && method === "DELETE") {
    const counterpartyId = Number(tradingCounterpartyTradeContextMatch[1]);
    const tradeContextId = Number(tradingCounterpartyTradeContextMatch[2]);

    if (!tradingCounterparty(counterpartyId)) {
      apiError(
        response,
        404,
        "TRADING_COUNTERPARTY_NOT_FOUND",
        `Trading Counterparty ${counterpartyId} was not found.`
      );
      return true;
    }

    if (!tradeContext(tradeContextId)) {
      apiError(
        response,
        404,
        "TRADE_CONTEXT_NOT_FOUND",
        `Trade Context ${tradeContextId} was not found.`
      );
      return true;
    }

    try {
      let assignmentInUse = false;

      runInImmediateTransaction(database, () => {
        assignmentInUse = tradingCounterpartyTradeContextPricingRulesCount(
          counterpartyId,
          tradeContextId
        ) > 0;

        if (!assignmentInUse) {
          database.prepare(`
            DELETE FROM trading_counterparty_trade_contexts
            WHERE counterparty_id = ? AND trade_context_id = ?
          `).run(counterpartyId, tradeContextId);
        }
      });

      if (assignmentInUse) {
        apiError(
          response,
          409,
          "COUNTERPARTY_TRADE_CONTEXT_IN_USE",
          `Trade Context ${tradeContextId} cannot be detached from Trading Counterparty ${counterpartyId} while Pricing Rules use this assignment.`
        );
        return true;
      }

      response.writeHead(204);
      response.end();
    } catch (error) {
      handleDatabaseError(response, error);
    }

    return true;
  }

  const tradingCounterpartyMatch = /^\/api\/v1\/trading-counterparties\/(\d+)$/.exec(pathname);

  if (tradingCounterpartyMatch && method === "PUT") {
    const counterpartyId = Number(tradingCounterpartyMatch[1]);
    const current = tradingCounterparty(counterpartyId);

    if (!current) {
      apiError(response, 404, "TRADING_COUNTERPARTY_NOT_FOUND", `Trading Counterparty ${counterpartyId} was not found.`);
      return true;
    }

    const body = await readJsonBody(request);
    const payload = validateTradingCounterpartyPayload(body);

    if (payload.error) {
      apiError(response, 400, "INVALID_TRADING_COUNTERPARTY", payload.error);
      return true;
    }

    if (payload.counterpartyScope !== current.counterpartyScope) {
      apiError(
        response,
        409,
        "TRADING_COUNTERPARTY_SCOPE_IMMUTABLE",
        "Trading Counterparty Scope cannot be changed."
      );
      return true;
    }

    try {
      runInImmediateTransaction(database, () => {
        database.prepare(`
          UPDATE trading_counterparties
          SET counterparty_name = ?, is_active = ?
          WHERE counterparty_id = ?
        `).run(
          payload.counterpartyName,
          payload.active ? 1 : 0,
          counterpartyId
        );
        saveTradingCounterpartyProfile(database, counterpartyId, payload);
        synchronizeTradingCounterpartyRoles(database, counterpartyId, payload.counterpartyRoles);
        synchronizeClientDealGenerationSettings(database);
      });
      sendJson(response, 200, tradingCounterparty(counterpartyId));
    } catch (error) {
      handleDatabaseError(response, error);
    }

    return true;
  }

  if (tradingCounterpartyMatch && method === "DELETE") {
    const counterpartyId = Number(tradingCounterpartyMatch[1]);
    const current = tradingCounterparty(counterpartyId);

    if (!current) {
      apiError(response, 404, "TRADING_COUNTERPARTY_NOT_FOUND", `Trading Counterparty ${counterpartyId} was not found.`);
      return true;
    }

    try {
      database.prepare("DELETE FROM trading_counterparties WHERE counterparty_id = ?").run(counterpartyId);
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

    if (payload.servicingLocationId !== currentId && current.tradeContextCount > 0) {
      apiError(
        response,
        409,
        "SERVICING_LOCATION_IN_USE",
        `Servicing Location ${currentId} ID cannot be changed while it is used by Trade Context.`
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

    if (current.tradeContextCount > 0) {
      apiError(
        response,
        409,
        "SERVICING_LOCATION_IN_USE",
        `Servicing Location ${locationId} cannot be deleted while it is used by Trade Context.`
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

    if (payload.accountingSystemId !== currentId && current.tradeContextCount > 0) {
      apiError(
        response,
        409,
        "ACCOUNTING_SYSTEM_IN_USE",
        `Accounting System ${currentId} ID cannot be changed while it is used by Trade Context.`
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

    if (current.tradeContextCount > 0) {
      apiError(
        response,
        409,
        "ACCOUNTING_SYSTEM_IN_USE",
        `Accounting System ${accountingSystemId} cannot be deleted while it is used by Trade Context.`
      );
      return true;
    }

    database.prepare("DELETE FROM accounting_systems WHERE accounting_system_id = ?").run(accountingSystemId);
    response.writeHead(204);
    response.end();
    return true;
  }

  if (pathname === "/api/v1/trade-purposes" && method === "GET") {
    sendJson(response, 200, tradePurposeApi.list());
    return true;
  }

  const tradePurposeMatch = /^\/api\/v1\/trade-purposes\/([^/]+)$/.exec(pathname);
  if ((pathname === "/api/v1/trade-purposes" && method === "POST")
    || (tradePurposeMatch && ["PUT", "DELETE"].includes(method))) {
    try {
      let result;
      if (method === "POST") {
        result = tradePurposeApi.create(await readJsonBody(request));
      } else if (method === "PUT") {
        result = tradePurposeApi.replace(tradePurposeMatch[1], await readJsonBody(request));
      } else {
        result = tradePurposeApi.delete(tradePurposeMatch[1]);
      }

      if (result.statusCode === 204) {
        response.writeHead(204);
        response.end();
      } else {
        sendJson(response, result.statusCode, result.body);
      }
    } catch (error) {
      if (error.statusCode) throw error;
      handleDatabaseError(response, error);
    }
    return true;
  }

  if (pathname === "/api/v1/originating-systems" && method === "GET") {
    sendJson(response, 200, originatingSystems());
    return true;
  }

  if (pathname === "/api/v1/originating-systems" && method === "POST") {
    const body = await readJsonBody(request);
    const payload = validateOriginatingSystemPayload(body);

    if (payload.error) {
      apiError(response, 400, "INVALID_ORIGINATING_SYSTEM", payload.error);
      return true;
    }

    try {
      database.prepare(`
        INSERT INTO originating_systems
          (originating_system_id, name, pricing_mode, is_active)
        VALUES (?, ?, ?, ?)
      `).run(
        payload.originatingSystemId,
        payload.name,
        payload.pricingMode,
        payload.active ? 1 : 0
      );
      sendJson(response, 201, originatingSystem(payload.originatingSystemId));
    } catch (error) {
      handleDatabaseError(response, error);
    }

    return true;
  }

  const originatingSystemMatch = /^\/api\/v1\/originating-systems\/([A-Za-z0-9_-]{2,30})$/.exec(pathname);

  if (originatingSystemMatch && method === "PUT") {
    const currentId = normalizedOriginatingSystemId(originatingSystemMatch[1]);
    const current = originatingSystem(currentId);

    if (!current) {
      apiError(response, 404, "ORIGINATING_SYSTEM_NOT_FOUND", `Originating System ${currentId} was not found.`);
      return true;
    }

    const body = await readJsonBody(request);
    const payload = validateOriginatingSystemPayload(body);

    if (payload.error) {
      apiError(response, 400, "INVALID_ORIGINATING_SYSTEM", payload.error);
      return true;
    }

    if (payload.originatingSystemId !== currentId && current.tradeContextCount > 0) {
      apiError(
        response,
        409,
        "ORIGINATING_SYSTEM_IN_USE",
        `Originating System ${currentId} ID cannot be changed while it is used by Trade Context.`
      );
      return true;
    }

    if (payload.pricingMode !== current.pricingMode && current.tradeContextCount > 0) {
      apiError(
        response,
        409,
        "ORIGINATING_SYSTEM_PRICING_MODE_IMMUTABLE",
        `Originating System ${currentId} Pricing Mode cannot be changed while it is used by Trade Context.`
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
              INNER JOIN trade_contexts c
                ON c.trade_context_id = r.trade_context_id
              WHERE c.originating_system_id = ?
            )
          `).run(currentId);
        }

        database.prepare(`
          UPDATE originating_systems
          SET originating_system_id = ?, name = ?, pricing_mode = ?, is_active = ?
          WHERE originating_system_id = ?
        `).run(
          payload.originatingSystemId,
          payload.name,
          payload.pricingMode,
          payload.active ? 1 : 0,
          currentId
        );
        synchronizeClientDealGenerationSettings(database);
      });
      sendJson(response, 200, originatingSystem(payload.originatingSystemId));
    } catch (error) {
      handleDatabaseError(response, error);
    }

    return true;
  }

  if (originatingSystemMatch && method === "DELETE") {
    const originatingSystemId = normalizedOriginatingSystemId(originatingSystemMatch[1]);
    const current = originatingSystem(originatingSystemId);

    if (!current) {
      apiError(response, 404, "ORIGINATING_SYSTEM_NOT_FOUND", `Originating System ${originatingSystemId} was not found.`);
      return true;
    }

    if (current.tradeContextCount > 0) {
      apiError(
        response,
        409,
        "ORIGINATING_SYSTEM_IN_USE",
        `Originating System ${originatingSystemId} cannot be deleted while it is used by Trade Context.`
      );
      return true;
    }

    database.prepare("DELETE FROM originating_systems WHERE originating_system_id = ?").run(originatingSystemId);
    response.writeHead(204);
    response.end();
    return true;
  }

  const tradeContextTradingCounterpartiesMatch =
    /^\/api\/v1\/trade-contexts\/(\d+)\/trading-counterparties$/.exec(pathname);

  if (tradeContextTradingCounterpartiesMatch && method === "GET") {
    const tradeContextId = Number(tradeContextTradingCounterpartiesMatch[1]);

    if (!tradeContext(tradeContextId)) {
      apiError(
        response,
        404,
        "TRADE_CONTEXT_NOT_FOUND",
        `Trade Context ${tradeContextId} was not found.`
      );
      return true;
    }

    sendJson(response, 200, tradeContextTradingCounterparties(tradeContextId));
    return true;
  }

  if (pathname === "/api/v1/auto-mode-eligibility-rules" && method === "GET") {
    if (url.searchParams.get("scope") === "all") {
      sendJson(response, 200, autoModeEligibilityRuleMatrix());
      return true;
    }
    let tradeType;
    try {
      tradeType = normalizeAutoManagementAdmissionTradeType(
        url.searchParams.get("tradeType") ?? "CLIENT_DEAL"
      );
    } catch (error) {
      apiError(response, 400, "INVALID_AUTO_MODE_ELIGIBILITY_RULES", error.message);
      return true;
    }
    sendJson(response, 200, autoModeEligibilityRules(tradeType));
    return true;
  }

  if (pathname === "/api/v1/auto-mode-eligibility-rules" && method === "PUT") {
    const body = await readJsonBody(request);
    const payload = validateAutoModeEligibilityRulesPayload(body);

    if (payload.error) {
      apiError(response, 400, "INVALID_AUTO_MODE_ELIGIBILITY_RULES", payload.error);
      return true;
    }

    try {
      sendJson(response, 200, saveAutoModeEligibilityRules(payload));
    } catch (error) {
      handleDatabaseError(response, error);
    }

    return true;
  }

  if (pathname === "/api/v1/trade-contexts" && method === "GET") {
    sendJson(response, 200, tradeContexts());
    return true;
  }

  if (pathname === "/api/v1/trade-contexts" && method === "POST") {
    const body = await readJsonBody(request);
    const payload = validateTradeContextPayload(body);

    if (payload.error) {
      apiError(response, 400, "INVALID_TRADE_CONTEXT", payload.error);
      return true;
    }

    const referenceError = tradeContextReferenceError(payload);

    if (referenceError) {
      apiError(response, 409, "TRADE_CONTEXT_REFERENCE_NOT_FOUND", referenceError);
      return true;
    }

    try {
      const result = database.prepare(`
        INSERT INTO trade_contexts
          (
            servicing_location_id,
            accounting_system_id,
            originating_system_id,
            auto_management_admission_mode
          )
        VALUES (?, ?, ?, ?)
      `).run(
        payload.servicingLocationId,
        payload.accountingSystemDatabaseId,
        payload.originatingSystemId,
        payload.autoManagementAdmissionMode
      );
      sendJson(response, 201, tradeContext(Number(result.lastInsertRowid)));
    } catch (error) {
      handleDatabaseError(response, error);
    }

    return true;
  }

  const tradeContextMatch = /^\/api\/v1\/trade-contexts\/(\d+)$/.exec(pathname);
  const currentTradeContextId = tradeContextMatch
    ? normalizedTradeContextId(tradeContextMatch[1])
    : null;

  if (tradeContextMatch && method === "PUT") {
    const current = currentTradeContextId ? tradeContext(currentTradeContextId) : null;

    if (!current) {
      apiError(response, 404, "TRADE_CONTEXT_NOT_FOUND", "Trade Context was not found.");
      return true;
    }

    const body = await readJsonBody(request);
    const payload = validateTradeContextPayload(body, current);

    if (payload.error) {
      apiError(response, 400, "INVALID_TRADE_CONTEXT", payload.error);
      return true;
    }

    const referenceError = tradeContextReferenceError(payload);

    if (referenceError) {
      apiError(response, 409, "TRADE_CONTEXT_REFERENCE_NOT_FOUND", referenceError);
      return true;
    }

    try {
      runInImmediateTransaction(database, () => {
        if (originatingSystem(payload.originatingSystemId)?.pricingMode !== "AUTO_PRICED") {
          database.prepare(`
            DELETE FROM client_deal_generation_settings
            WHERE pricing_rule_id IN
            (
              SELECT pricing_rule_id
              FROM pricing_rules
              WHERE trade_context_id = ?
            )
          `).run(currentTradeContextId);
        }

        database.prepare(`
          UPDATE trade_contexts
          SET servicing_location_id = ?,
              accounting_system_id = ?,
              originating_system_id = ?,
              auto_management_admission_mode = ?
          WHERE trade_context_id = ?
        `).run(
          payload.servicingLocationId,
          payload.accountingSystemDatabaseId,
          payload.originatingSystemId,
          payload.autoManagementAdmissionMode,
          currentTradeContextId
        );
        synchronizeClientDealGenerationSettings(database);
      });
      sendJson(response, 200, tradeContext(currentTradeContextId));
    } catch (error) {
      handleDatabaseError(response, error);
    }

    return true;
  }

  if (tradeContextMatch && method === "DELETE") {
    const current = currentTradeContextId ? tradeContext(currentTradeContextId) : null;

    if (!current) {
      apiError(response, 404, "TRADE_CONTEXT_NOT_FOUND", "Trade Context was not found.");
      return true;
    }

    if (current.assignedCounterpartyCount > 0) {
      apiError(
        response,
        409,
        "TRADE_CONTEXT_IN_USE",
        `Trade Context ${currentTradeContextId} cannot be deleted while it is assigned to Trading Counterparties.`
      );
      return true;
    }

    try {
      database.prepare("DELETE FROM trade_contexts WHERE trade_context_id = ?").run(currentTradeContextId);
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
      const created = createCcyPairOptionWithEligibilityRules(payload);
      sendJson(response, 201, created);
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
    const oneWayDurationSeconds = body.oneWayDurationSeconds === undefined
      ? DEFAULT_ONE_WAY_DURATION_SECONDS
      : integerInRange(
          body.oneWayDurationSeconds,
          MIN_ONE_WAY_DURATION_SECONDS,
          MAX_ONE_WAY_DURATION_SECONDS
        );
    const fluctuationSpreads = body.fluctuationSpreads === undefined
      ? DEFAULT_FLUCTUATION_SPREADS
      : Number(body.fluctuationSpreads);
    const validSettings = Number.isFinite(bidMin)
      && Number.isFinite(spread)
      && Number.isFinite(bidMax)
      && bidMax > bidMin
      && Number.isInteger(oneWayDurationSeconds)
      && Number.isFinite(fluctuationSpreads)
      && fluctuationSpreads >= 0
      && fluctuationSpreads <= MAX_FLUCTUATION_SPREADS;

    if (!validSettings) {
      apiError(
        response,
        400,
        "INVALID_SIMULATION_SETTINGS",
        `Simulation values are invalid. Max Bid must exceed Min Bid, One-way Duration must be ${MIN_ONE_WAY_DURATION_SECONDS}-${MAX_ONE_WAY_DURATION_SECONDS} seconds, and Fluctuation must be 0-${MAX_FLUCTUATION_SPREADS} spreads.`
      );
      return true;
    }

    try {
      database.prepare(`
        INSERT INTO market_quote_simulation_settings
          (
            ccy_pair_code,
            bid_min,
            spread,
            bid_max,
            one_way_duration_seconds,
            fluctuation_spreads
          )
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT (ccy_pair_code) DO UPDATE SET
          bid_min = excluded.bid_min,
          spread = excluded.spread,
          bid_max = excluded.bid_max,
          one_way_duration_seconds = excluded.one_way_duration_seconds,
          fluctuation_spreads = excluded.fluctuation_spreads
      `).run(
        pairCode,
        bidMin,
        spread,
        bidMax,
        oneWayDurationSeconds,
        fluctuationSpreads
      );
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

    runInImmediateTransaction(database, () => {
      database.prepare(`
        DELETE FROM auto_mode_eligibility_rules
        WHERE ccy_pair_code = ?
      `).run(pairCode);
      database.prepare("DELETE FROM ccy_pair_options WHERE ccy_pair_code = ?").run(pairCode);
    });
    marketPulseSimulator.refresh();
    response.writeHead(204);
    response.end();

    return true;
  }

  if (pathname === "/api/database/tables" && method === "GET") {
    sendJson(response, 200, databaseObjects().map(object => ({
      tableName: object.name,
      objectType: object.objectType,
      rowCount: database.prepare(`SELECT COUNT(*) AS count FROM ${quotedIdentifier(object.name)}`).get().count
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
  ".woff2": "font/woff2",
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
  autoBatchingProcess.dispose();
  marketPulseSimulator.dispose();
  removeServerRuntimeFile();
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
    autoBatchingProcess.dispose();
    marketPulseSimulator.dispose();
    removeServerRuntimeFile();
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
  process.on("exit", removeServerRuntimeFile);

  if (process.argv.includes("--init-only")) {
    clientDealGenerationProcess.dispose();
    autoBatchingProcess.dispose();
    database.close();
    console.log(`SQLite initialized: ${DATABASE_PATH}`);
  } else {
    server.listen(PORT, HOST, () => {
      try {
        writeServerRuntimeFile();
      } catch (error) {
        console.error(`Unable to register the demo server for safe restart: ${error.message}`);
        closeServer();
        return;
      }

      console.log(`Demo application: http://${HOST}:${PORT}`);
      console.log(`SQLite database: ${DATABASE_PATH}`);
      console.log("Press Ctrl+C to stop.");
    });
  }
}

module.exports = {
  handleApi,
  autoModeEligibilityRules,
  tradeContextAdmissionMode,
  closeDatabase: () => {
    clientDealGenerationProcess.dispose();
    autoBatchingProcess.dispose();
    marketPulseSimulator.dispose();
    database.close();
  }
};
