"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { EventEmitter } = require("node:events");
const { DatabaseSync } = require("node:sqlite");
const { MarketPulseSimulator } = require("./backend/market-pulse-simulation/market-pulse-simulator");

const root = __dirname;
const verificationDatabasePath = path.join(root, "data", `verify-demo-${process.pid}.sqlite`);

function removeVerificationDatabase() {
  [verificationDatabasePath, `${verificationDatabasePath}-wal`, `${verificationDatabasePath}-shm`]
    .forEach(filePath => {
      try {
        fs.rmSync(filePath, { force: true });
      } catch (error) {
        if (error.code !== "EPERM") {
          throw error;
        }
      }
    });
}

function createLegacyDatabase() {
  removeVerificationDatabase();
  const database = new DatabaseSync(verificationDatabasePath);
  database.exec("PRAGMA foreign_keys = ON");
  database.exec(`
    CREATE TABLE ccy_options
    (
      ccy_code        TEXT PRIMARY KEY,
      name            TEXT NOT NULL UNIQUE,
      country         TEXT NOT NULL,
      fraction_digits INTEGER NOT NULL
    );

    CREATE TABLE ccy_pair_options
    (
      ccy_pair_code          TEXT PRIMARY KEY,
      base_ccy_code          TEXT NOT NULL REFERENCES ccy_options (ccy_code) ON DELETE RESTRICT,
      quote_ccy_code         TEXT NOT NULL REFERENCES ccy_options (ccy_code) ON DELETE RESTRICT,
      default_quote_decimals INTEGER NOT NULL,
      bid_min                REAL,
      spread                 REAL,
      bid_max                REAL
    );

    CREATE INDEX idx_ccy_pair_options_base ON ccy_pair_options (base_ccy_code);
    CREATE INDEX idx_ccy_pair_options_quote ON ccy_pair_options (quote_ccy_code);

    CREATE TABLE servicing_locations
    (
      servicing_location_id TEXT PRIMARY KEY,
      name                  TEXT NOT NULL,
      region                TEXT NOT NULL,
      location_type         TEXT NOT NULL,
      is_active             INTEGER NOT NULL
    );

    CREATE TABLE accounting_systems
    (
      accounting_system_id TEXT PRIMARY KEY,
      name                 TEXT NOT NULL,
      description          TEXT NOT NULL,
      is_active             INTEGER NOT NULL
    );

    CREATE TABLE execution_systems
    (
      execution_system_id TEXT PRIMARY KEY,
      name                TEXT NOT NULL,
      pricing_mode        TEXT NOT NULL,
      is_active           INTEGER NOT NULL
    );

    CREATE TABLE execution_contexts
    (
      execution_context_id  TEXT PRIMARY KEY,
      servicing_location_id TEXT NOT NULL REFERENCES servicing_locations (servicing_location_id),
      accounting_system_id  TEXT REFERENCES accounting_systems (accounting_system_id),
      execution_system_id   TEXT NOT NULL REFERENCES execution_systems (execution_system_id)
    );

    CREATE TABLE trading_counterparties
    (
      counterparty_id        INTEGER PRIMARY KEY,
      counterparty_type      TEXT NOT NULL,
      counterparty_code      TEXT NOT NULL,
      counterparty_code_type TEXT NOT NULL,
      counterparty_name      TEXT NOT NULL,
      is_active       INTEGER NOT NULL,
      UNIQUE (counterparty_code_type, counterparty_code)
    );

    CREATE TABLE pricing_rules
    (
      pricing_rule_id      INTEGER PRIMARY KEY,
      counterparty_id             INTEGER NOT NULL REFERENCES trading_counterparties (counterparty_id),
      execution_context_id TEXT NOT NULL REFERENCES execution_contexts (execution_context_id),
      ccy_pair_code        TEXT NOT NULL REFERENCES ccy_pair_options (ccy_pair_code),
      margin_percent       REAL NOT NULL
    );

    CREATE TABLE client_fx_deals
    (
      client_deal_id       INTEGER PRIMARY KEY,
      entry_timestamp      TEXT    NOT NULL,
      counterparty_id             INTEGER NOT NULL REFERENCES trading_counterparties (counterparty_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
      trade_date           TEXT    NOT NULL,
      ccy_pair_code        TEXT    NOT NULL REFERENCES ccy_pair_options (ccy_pair_code) ON UPDATE RESTRICT ON DELETE RESTRICT,
      side                 TEXT    NOT NULL,
      base_ccy_amount      NUMERIC NOT NULL,
      quote_ccy_amount     NUMERIC NOT NULL,
      trade_rate           NUMERIC NOT NULL,
      tenor                TEXT    NOT NULL,
      base_ccy_value_date  TEXT    NOT NULL,
      quote_ccy_value_date TEXT    NOT NULL
    );

    CREATE TABLE trading_counterparty_execution_contexts
    (
      counterparty_id INTEGER NOT NULL,
      execution_context_id TEXT NOT NULL
    );

    CREATE TABLE fx_trade_audit
    (
      trade_id               INTEGER PRIMARY KEY,
      trade_type             TEXT    NOT NULL,
      market_pulse_bid       NUMERIC NOT NULL,
      market_pulse_offer     NUMERIC NOT NULL,
      market_pulse_timestamp TEXT    NOT NULL
    );

    CREATE TABLE fx_trade_market_snapshot
    (
      trade_id               INTEGER PRIMARY KEY,
      trade_type             TEXT    NOT NULL,
      market_pulse_bid       NUMERIC NOT NULL,
      market_pulse_offer     NUMERIC NOT NULL,
      market_pulse_timestamp TEXT    NOT NULL
    );

    CREATE TABLE fx_batch_outputs
    (
      batch_id    INTEGER NOT NULL,
      trade_id    INTEGER NOT NULL,
      trade_type  TEXT    NOT NULL,
      output_role TEXT    NOT NULL
    );

    CREATE TABLE fx_batch_quote_cash_members
    (
      batch_id                         INTEGER PRIMARY KEY,
      quote_ccy_code                   TEXT    NOT NULL,
      quote_balance_contribution_minor INTEGER NOT NULL,
      quote_ccy_fraction_digits        INTEGER NOT NULL,
      quote_ccy_value_date             TEXT    NOT NULL,
      created_at                       TEXT    NOT NULL
    );

    INSERT INTO ccy_options (ccy_code, name, country, fraction_digits)
    VALUES
      ('EUR', 'Euro', 'Euro Area', 2),
      ('USD', 'US Dollar', 'United States', 2);

    INSERT INTO ccy_pair_options
      (ccy_pair_code, base_ccy_code, quote_ccy_code, default_quote_decimals, bid_min, spread, bid_max)
    VALUES
      ('EUR_USD', 'EUR', 'USD', 4, 1.1220, 0.0002, 1.1222);

    INSERT INTO servicing_locations
      (servicing_location_id, name, region, location_type, is_active)
    VALUES
      ('000', 'Bank Central Office', 'Middle-earth, Mordor', 'HEAD_OFFICE', 1),
      ('001', 'Emerald City Branch', 'Oz', 'BRANCH', 1),
      ('002', 'Neverland Harbor Branch', 'Neverland', 'BRANCH', 1),
      ('1234', 'Wonderland Gate Branch', 'Wonderland', 'BRANCH', 1),
      ('7777', 'Narnia Lantern Branch', 'Narnia', 'BRANCH', 1),
      ('8888', 'Shire Hill Branch', 'Middle-earth', 'BRANCH', 1);

    INSERT INTO accounting_systems
      (accounting_system_id, name, description, is_active)
    VALUES
      ('AFINA', 'Afina Core Ledger', 'Primary settlement and posting system.', 1),
      ('CTF3', 'CTF3 Treasury Settlement', 'Treasury settlement system for FX operations.', 1);

    INSERT INTO execution_systems
      (execution_system_id, name, pricing_mode, is_active)
    VALUES
      ('CLICK_TRADE_EFX', 'Click Trade eFX', 'AUTO_PRICED', 1),
      ('RFQ', 'Request for Quote', 'DEALER_APPROVED', 1),
      ('MANUAL_CLIENT_DEAL_ENTRY', 'Manual Client Deal Entry', 'DEALER_PRICED', 1);

    INSERT INTO execution_contexts
      (execution_context_id, servicing_location_id, accounting_system_id, execution_system_id)
    VALUES
      ('002:AFINA:CLICK_TRADE_EFX', '002', 'AFINA', 'CLICK_TRADE_EFX'),
      ('002:AFINA:RFQ', '002', 'AFINA', 'RFQ'),
      ('002:CTF3:MANUAL_CLIENT_DEAL_ENTRY', '002', 'CTF3', 'MANUAL_CLIENT_DEAL_ENTRY'),
      ('1234:AFINA:RFQ', '1234', 'AFINA', 'RFQ'),
      ('001:CTF3:CLICK_TRADE_EFX', '001', 'CTF3', 'CLICK_TRADE_EFX');

    INSERT INTO trading_counterparties
      (counterparty_id, counterparty_type, counterparty_code, counterparty_code_type, counterparty_name, is_active)
    VALUES
      (1, 'CLIENT', '7701234567', 'INN', 'Romashka Company', 1),
      (2, 'CLIENT', '7812345678', 'INN', 'Vasilek Company', 1),
      (3, 'CLIENT', '5409876543', 'INN', 'Gladiolus Company', 1),
      (4, 'EXTERNAL_COUNTERPARTY', 'LEGACY_EXTERNAL', 'OTHER', 'Legacy External Counterparty', 1),
      (5, 'INTERNAL_DESK', 'LEGACY_INTERNAL', 'OTHER', 'Legacy Internal Desk', 1);

    INSERT INTO trading_counterparty_execution_contexts
      (counterparty_id, execution_context_id)
    VALUES
      (2, '002:AFINA:CLICK_TRADE_EFX');

    INSERT INTO pricing_rules
      (pricing_rule_id, counterparty_id, execution_context_id, ccy_pair_code, margin_percent)
    VALUES
      (1, 1, '002:AFINA:CLICK_TRADE_EFX', 'EUR_USD', 0.10),
      (2, 1, '002:AFINA:RFQ', 'EUR_USD', 0.12),
      (3, 1, '002:CTF3:MANUAL_CLIENT_DEAL_ENTRY', 'EUR_USD', 0.08),
      (4, 2, '1234:AFINA:RFQ', 'EUR_USD', 0.05),
      (5, 3, '001:CTF3:CLICK_TRADE_EFX', 'EUR_USD', 0.20);

    INSERT INTO client_fx_deals
      (
        client_deal_id, entry_timestamp, counterparty_id, trade_date, ccy_pair_code, side,
        base_ccy_amount, quote_ccy_amount, trade_rate, tenor,
        base_ccy_value_date, quote_ccy_value_date
      )
    VALUES
      (
        41, '2026-07-15T11:45:00.000Z', 1, '2026-07-15', 'EUR_USD', 'SELL',
        1500000, 1684500, 1.123, 'TOM', '2026-07-16', '2026-07-16'
      );
  `);
  database.close();
}

function verifyFreshSchemaAndSeed() {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");
  database.exec(fs.readFileSync(path.join(root, "schema.sql"), "utf8"));
  database.exec(fs.readFileSync(path.join(root, "seed.sql"), "utf8"));
  let ccyOptionsConstraintsEnforced = true;
  let ccyPairOptionsConstraintsEnforced = true;
  let servicingLocationConstraintsEnforced = true;
  let accountingSystemTextLimitsEnforced = false;
  let executionSystemConstraintsEnforced = true;
  let tradingCounterpartyConstraintsEnforced = true;
  let counterpartyExecutionContextConstraintsEnforced = true;
  let userConstraintsEnforced = true;
  let uiTableColumnSettingsConstraintsEnforced = true;
  let normalizedTradingCounterpartyProfilesSupported = false;
  let clientDealGenerationProcessSettingsConstraintsEnforced = true;
  let clientDealGenerationSettingsConstraintsEnforced = true;
  let clientDealGenerationSettingsCounterpartyTypeEnforced = true;
  let clientDealGenerationSettingsPricingModeEnforced = true;
  let clientDealGenerationSettingsCascadeDeleteEnforced = true;
  let fxTradeExposureConstraintsEnforced = true;
  let clientFxDealConstraintsEnforced = true;
  let clientFxDealParentRestrictionEnforced = true;
  let clientFxDealAttributionReferencesRestricted = true;
  let clientFxDealCounterpartyTypeEnforced = true;
  let hedgeFxDealConstraintsEnforced = true;
  let hedgeFxDealParentRestrictionEnforced = true;
  let hedgeFxDealCounterpartyTypeEnforced = true;
  let fxTradeBatchDefaultsSupported = false;
  let fxTradeBatchConstraintsEnforced = true;
  let batchTradeTypesSupported = false;
  let batchBalancingTradeConstraintsEnforced = true;
  let batchBalancingTradeParentRestrictionEnforced = true;
  let batchQuoteCashMemberSupported = false;
  let batchQuoteCashMemberConstraintsEnforced = true;
  let batchQuoteCashMemberParentRestrictionEnforced = false;
  let batchQuoteCashMemberSinglePerBatchEnforced = false;
  let batchQuoteCashNeutralityEnforced = false;
  let completedBatchQuoteCashMemberImmutable = false;

  const seededCounterpartyExecutionContext = database.prepare(`
    SELECT counterparty_id, execution_context_id
    FROM trading_counterparty_execution_contexts
    ORDER BY counterparty_id, execution_context_id
    LIMIT 1
  `).get();
  const counterpartyExecutionContextProbes = [
    [
      seededCounterpartyExecutionContext.counterparty_id,
      seededCounterpartyExecutionContext.execution_context_id
    ],
    [999999, seededCounterpartyExecutionContext.execution_context_id],
    [seededCounterpartyExecutionContext.counterparty_id, 999999]
  ];

  counterpartyExecutionContextProbes.forEach(([counterpartyId, executionContextId], index) => {
    database.exec(`SAVEPOINT verify_counterparty_execution_context_${index}`);

    try {
      database.prepare(`
        INSERT INTO trading_counterparty_execution_contexts
          (counterparty_id, execution_context_id)
        VALUES (?, ?)
      `).run(counterpartyId, executionContextId);
      counterpartyExecutionContextConstraintsEnforced = false;
    } catch {} finally {
      database.exec(`
        ROLLBACK TO verify_counterparty_execution_context_${index};
        RELEASE verify_counterparty_execution_context_${index};
      `);
    }
  });

  [
    ["width_px", 47],
    ["width_px", 1601],
    ["default_width_px", 47],
    ["default_width_px", 1601]
  ].forEach(([columnName, value]) => {
    try {
      database.prepare(`
        UPDATE ui_table_column_settings
        SET ${columnName} = ?
        WHERE table_key = 'pricing_rules_grid' AND column_key = 'id'
      `).run(value);
      uiTableColumnSettingsConstraintsEnforced = false;
    } catch {}
  });

  [
    ["AA1", "Valid Name", "Valid Country", 2],
    ["QAB", "A".repeat(21), "Valid Country", 2],
    ["QAC", "Valid Name", "B".repeat(31), 2],
    ["QAD", "Name1", "Valid Country", 2],
    ["QAE", "Valid Name", "Country1", 2],
    ["QAF", "Valid Name", "Valid Country", 11]
  ].forEach(([code, name, country, fractionDigits]) => {
    try {
      database.prepare(`
        INSERT INTO ccy_options (ccy_code, name, country, fraction_digits)
        VALUES (?, ?, ?, ?)
      `).run(code, name, country, fractionDigits);
      ccyOptionsConstraintsEnforced = false;
    } catch {}
  });

  [
    ["EURUSD", "EUR", "USD", 4],
    ["EUR_EUR", "EUR", "EUR", 4],
    ["USD_EUR", "USD", "EUR", 9],
    ["AA1_USD", "AA1", "USD", 4]
  ].forEach(([pairCode, baseCcy, quoteCcy, decimals]) => {
    try {
      database.prepare(`
        INSERT INTO ccy_pair_options
          (ccy_pair_code, base_ccy_code, quote_ccy_code, default_quote_decimals)
        VALUES (?, ?, ?, ?)
      `).run(pairCode, baseCcy, quoteCcy, decimals);
      ccyPairOptionsConstraintsEnforced = false;
    } catch {}
  });

  [
    ["X".repeat(11), "Valid location", "Valid region", "BRANCH", 1],
    ["VERIFY-01", "X".repeat(51), "Valid region", "BRANCH", 1],
    ["VERIFY-02", "Valid location", "X".repeat(51), "BRANCH", 1],
    ["VERIFY-03", "Valid location", "Valid region", "HEAD_OFFICE", 2]
  ].forEach(([locationId, name, region, locationType, isActive]) => {
    try {
      database.prepare(`
        INSERT INTO servicing_locations
          (servicing_location_id, name, region, location_type, is_active)
        VALUES (?, ?, ?, ?, ?)
      `).run(locationId, name, region, locationType, isActive);
      servicingLocationConstraintsEnforced = false;
    } catch {}
  });

  try {
    database.prepare(`
      INSERT INTO accounting_systems
        (accounting_system_id, name, is_active)
      VALUES (?, ?, ?)
    `).run("A".repeat(21), "Verification accounting system", 1);
  } catch {
    accountingSystemTextLimitsEnforced = true;
  }

  if (accountingSystemTextLimitsEnforced) {
    try {
      database.prepare(`
        INSERT INTO accounting_systems
          (accounting_system_id, name, is_active)
        VALUES (?, ?, ?)
      `).run("VERIFY", "X".repeat(51), 1);
      accountingSystemTextLimitsEnforced = false;
    } catch {}
  }

  [
    ["X".repeat(31), "Valid execution system", "AUTO_PRICED", 1],
    ["VERIFY_EXECUTION_NAME", "X".repeat(51), "AUTO_PRICED", 1],
    ["VERIFY_EXECUTION_MODE", "Valid execution system", "MANUAL_PRICING_MODE", 1],
    ["VERIFY_EXECUTION_ACTIVE", "Valid execution system", "AUTO_PRICED", 2]
  ].forEach(([id, name, pricingMode, isActive]) => {
    try {
      database.prepare(`
        INSERT INTO execution_systems
          (execution_system_id, name, pricing_mode, is_active)
        VALUES (?, ?, ?, ?)
      `).run(id, name, pricingMode, isActive);
      executionSystemConstraintsEnforced = false;
    } catch {}
  });

  [
    ["", 1],
    ["X".repeat(201), 1],
    ["Valid counterparty name", 2]
  ].forEach(([counterpartyName, isActive]) => {
    try {
      database.prepare(`
        INSERT INTO trading_counterparties (counterparty_name, is_active)
        VALUES (?, ?)
      `).run(counterpartyName, isActive);
      tradingCounterpartyConstraintsEnforced = false;
    } catch {}
  });

  [
    ["VERIFY_LEI", "LEI", "CORPORATE"],
    ["X".repeat(21), "OTHER", "CORPORATE"],
    ["VERIFY_KIND", "OTHER", "UNKNOWN"],
    ["123", "INN", "CORPORATE"]
  ].forEach(([counterpartyCode, counterpartyCodeType, counterpartyKind]) => {
    database.exec("SAVEPOINT verify_external_counterparty");

    try {
      const counterpartyId = database.prepare(`
        INSERT INTO trading_counterparties (counterparty_name, is_active)
        VALUES ('Verification External Counterparty', 1)
      `).run().lastInsertRowid;
      database.prepare(`
        INSERT INTO external_counterparties
          (counterparty_id, counterparty_code, counterparty_code_type, external_counterparty_kind)
        VALUES (?, ?, ?, ?)
      `).run(counterpartyId, counterpartyCode, counterpartyCodeType, counterpartyKind);
      tradingCounterpartyConstraintsEnforced = false;
    } catch {} finally {
      database.exec("ROLLBACK TO verify_external_counterparty; RELEASE verify_external_counterparty;");
    }
  });

  database.exec("SAVEPOINT verify_internal_counterparty");

  try {
    const counterpartyId = database.prepare(`
      INSERT INTO trading_counterparties (counterparty_name, is_active)
      VALUES ('Verification Internal Unit', 1)
    `).run().lastInsertRowid;
    database.prepare(`
      INSERT INTO internal_units (counterparty_id, unit_code, unit_type)
      VALUES (?, 'VERIFY_DESK', 'DESK')
    `).run(counterpartyId);
    database.prepare(`
      INSERT INTO trading_counterparty_roles (counterparty_id, role_code)
      VALUES (?, 'HEDGE_COUNTERPARTY')
    `).run(counterpartyId);
    normalizedTradingCounterpartyProfilesSupported = true;

    try {
      database.prepare(`
        INSERT INTO external_counterparties
          (counterparty_id, counterparty_code, counterparty_code_type, external_counterparty_kind)
        VALUES (?, 'VERIFY_DUPLICATE_PROFILE', 'OTHER', 'CORPORATE')
      `).run(counterpartyId);
      tradingCounterpartyConstraintsEnforced = false;
    } catch {}
  } finally {
    database.exec("ROLLBACK TO verify_internal_counterparty; RELEASE verify_internal_counterparty;");
  }

  [
    ["A", "Valid", "User", "DEALER", 1],
    ["BAD CODE", "Valid", "User", "DEALER", 1],
    ["VALID_CODE", "X".repeat(51), "User", "DEALER", 1],
    ["VALID_CODE", "Valid", "X".repeat(51), "DEALER", 1],
    ["VALID_CODE", "Valid", "User", "UNKNOWN", 1],
    ["VALID_CODE", "Valid", "User", "DEALER", 2]
  ].forEach(([userCode, firstName, lastName, userRole, isActive]) => {
    try {
      database.prepare(`
        INSERT INTO users
          (user_code, first_name, last_name, user_role, is_active)
        VALUES (?, ?, ?, ?, ?)
      `).run(userCode, firstName, lastName, userRole, isActive);
      userConstraintsEnforced = false;
    } catch {}
  });

  const clientGenerationPricingRuleId = Number(database.prepare(`
    SELECT r.pricing_rule_id
    FROM pricing_rules r
    INNER JOIN trading_counterparties p ON p.counterparty_id = r.counterparty_id
    INNER JOIN trading_counterparty_roles role
      ON role.counterparty_id = p.counterparty_id AND role.role_code = 'CLIENT'
    INNER JOIN execution_contexts c ON c.execution_context_id = r.execution_context_id
    INNER JOIN execution_systems e ON e.execution_system_id = c.execution_system_id
    WHERE e.pricing_mode = 'AUTO_PRICED'
    ORDER BY r.pricing_rule_id
    LIMIT 1
  `).get().pricing_rule_id);
  const clientGenerationBaseFractionDigits = Number(database.prepare(`
    SELECT base_ccy.fraction_digits
    FROM pricing_rules r
    INNER JOIN ccy_pair_options pair ON pair.ccy_pair_code = r.ccy_pair_code
    INNER JOIN ccy_options base_ccy ON base_ccy.ccy_code = pair.base_ccy_code
    WHERE r.pricing_rule_id = ?
  `).get(clientGenerationPricingRuleId).fraction_digits);
  const clientGenerationMinorFactor = 10 ** clientGenerationBaseFractionDigits;
  const nonAutoClientGenerationPricingRuleId = Number(database.prepare(`
    SELECT r.pricing_rule_id
    FROM pricing_rules r
    INNER JOIN trading_counterparties p ON p.counterparty_id = r.counterparty_id
    INNER JOIN trading_counterparty_roles role
      ON role.counterparty_id = p.counterparty_id AND role.role_code = 'CLIENT'
    INNER JOIN execution_contexts c ON c.execution_context_id = r.execution_context_id
    INNER JOIN execution_systems e ON e.execution_system_id = c.execution_system_id
    WHERE e.pricing_mode <> 'AUTO_PRICED'
    ORDER BY r.pricing_rule_id
    LIMIT 1
  `).get().pricing_rule_id);
  const hedgeGenerationPricingRuleId = Number(database.prepare(`
    SELECT r.pricing_rule_id
    FROM pricing_rules r
    INNER JOIN trading_counterparties p ON p.counterparty_id = r.counterparty_id
    INNER JOIN trading_counterparty_roles role
      ON role.counterparty_id = p.counterparty_id AND role.role_code = 'HEDGE_COUNTERPARTY'
    ORDER BY r.pricing_rule_id
    LIMIT 1
  `).get().pricing_rule_id);

  [
    [0, 3, 3, 7],
    [3, 2, 3, 7],
    [1.5, 3, 3, 7],
    [1, 3601, 3, 7],
    [1, 3, 0, 7],
    [1, 3, 7, 3],
    [1, 3, 3.5, 7],
    [1, 3, 3, 101]
  ].forEach(values => {
    database.exec("SAVEPOINT verify_generation_process_settings");

    try {
      database.prepare(`
        UPDATE client_deal_generation_process_settings
        SET
          min_interval_seconds = ?,
          max_interval_seconds = ?,
          min_deals_per_cycle = ?,
          max_deals_per_cycle = ?
        WHERE settings_id = 1
      `).run(...values);
      clientDealGenerationProcessSettingsConstraintsEnforced = false;
    } catch {} finally {
      database.exec(`
        ROLLBACK TO verify_generation_process_settings;
        RELEASE verify_generation_process_settings;
      `);
    }
  });

  database.exec("SAVEPOINT verify_generation_process_settings_singleton");

  try {
    database.prepare(`
      INSERT INTO client_deal_generation_process_settings
        (
          settings_id,
          min_interval_seconds,
          max_interval_seconds,
          min_deals_per_cycle,
          max_deals_per_cycle
        )
      VALUES (2, 1, 3, 3, 7)
    `).run();
    clientDealGenerationProcessSettingsConstraintsEnforced = false;
  } catch {} finally {
    database.exec(`
      ROLLBACK TO verify_generation_process_settings_singleton;
      RELEASE verify_generation_process_settings_singleton;
    `);
  }

  [
    [0, 1500000 * clientGenerationMinorFactor, 100000 * clientGenerationMinorFactor, 50, 1],
    [500000 * clientGenerationMinorFactor, 400000 * clientGenerationMinorFactor, 100000 * clientGenerationMinorFactor, 50, 1],
    [500000 * clientGenerationMinorFactor, 1500000 * clientGenerationMinorFactor, 0, 50, 1],
    [500000.5, 1500000 * clientGenerationMinorFactor, 100000 * clientGenerationMinorFactor, 50, 1],
    [500000 * clientGenerationMinorFactor, 1500000 * clientGenerationMinorFactor, 100000 * clientGenerationMinorFactor, -1, 1],
    [500000 * clientGenerationMinorFactor, 1500000 * clientGenerationMinorFactor, 100000 * clientGenerationMinorFactor, 101, 1],
    [500000 * clientGenerationMinorFactor, 1500000 * clientGenerationMinorFactor, 100000 * clientGenerationMinorFactor, 50.5, 1],
    [500000 * clientGenerationMinorFactor, 1500000 * clientGenerationMinorFactor, 100000 * clientGenerationMinorFactor, 50, 2]
  ].forEach(values => {
    try {
      database.prepare(`
        UPDATE client_deal_generation_settings
        SET
          min_base_ccy_amount_minor = ?,
          max_base_ccy_amount_minor = ?,
          base_ccy_amount_step_minor = ?,
          buy_probability_percent = ?,
          is_active = ?
        WHERE pricing_rule_id = ?
      `).run(...values, clientGenerationPricingRuleId);
      clientDealGenerationSettingsConstraintsEnforced = false;
    } catch {}
  });

  try {
    database.prepare(`
      INSERT INTO client_deal_generation_settings
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
      hedgeGenerationPricingRuleId,
      500000 * clientGenerationMinorFactor,
      1500000 * clientGenerationMinorFactor,
      100000 * clientGenerationMinorFactor,
      clientGenerationBaseFractionDigits
    );
    clientDealGenerationSettingsCounterpartyTypeEnforced = false;
  } catch {}

  try {
    database.prepare(`
      INSERT INTO client_deal_generation_settings
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
      nonAutoClientGenerationPricingRuleId,
      500000 * clientGenerationMinorFactor,
      1500000 * clientGenerationMinorFactor,
      100000 * clientGenerationMinorFactor,
      clientGenerationBaseFractionDigits
    );
    clientDealGenerationSettingsPricingModeEnforced = false;
  } catch {}

  try {
    database.prepare(`
      UPDATE execution_systems
      SET pricing_mode = 'DEALER_PRICED'
      WHERE execution_system_id = 'CLICK_TRADE_EFX'
    `).run();
    clientDealGenerationSettingsPricingModeEnforced = false;
  } catch {}

  try {
    database.prepare(`
      UPDATE execution_contexts
      SET execution_system_id = 'RFQ'
      WHERE execution_context_id =
      (
        SELECT r.execution_context_id
        FROM pricing_rules r
        INNER JOIN client_deal_generation_settings s
          ON s.pricing_rule_id = r.pricing_rule_id
        ORDER BY r.pricing_rule_id
        LIMIT 1
      )
    `).run();
    clientDealGenerationSettingsPricingModeEnforced = false;
  } catch {}

  const clientGenerationCounterpartyId = Number(database.prepare(`
    SELECT counterparty_id
    FROM external_counterparties
    WHERE counterparty_code_type = 'INN' AND counterparty_code = '5409876543'
  `).get().counterparty_id);
  const clientGenerationCounterpartyRuleId = Number(database.prepare(`
    SELECT pricing_rule_id
    FROM pricing_rules
    WHERE counterparty_id = ?
    ORDER BY pricing_rule_id
    LIMIT 1
  `).get(clientGenerationCounterpartyId).pricing_rule_id);
  const hedgeGenerationCounterpartyId = Number(database.prepare(`
    SELECT counterparty_id
    FROM trading_counterparty_roles
    WHERE role_code = 'HEDGE_COUNTERPARTY'
    ORDER BY counterparty_id
    LIMIT 1
  `).get().counterparty_id);

  try {
    database.prepare(`
      UPDATE pricing_rules
      SET counterparty_id = ?
      WHERE pricing_rule_id = ?
    `).run(hedgeGenerationCounterpartyId, clientGenerationCounterpartyRuleId);
    clientDealGenerationSettingsCounterpartyTypeEnforced = false;
  } catch {}

  try {
    database.prepare(`
      DELETE FROM trading_counterparty_roles
      WHERE counterparty_id = ? AND role_code = 'CLIENT'
    `).run(clientGenerationCounterpartyId);
    clientDealGenerationSettingsCounterpartyTypeEnforced = false;
  } catch {}

  const cascadePricingRuleId = Number(database.prepare(`
    INSERT INTO pricing_rules
      (counterparty_id, execution_context_id, ccy_pair_code, margin_percent)
    SELECT ?, c.execution_context_id, pair.ccy_pair_code, 0.01
    FROM execution_contexts c
    INNER JOIN trading_counterparty_execution_contexts assignment
      ON assignment.execution_context_id = c.execution_context_id
      AND assignment.counterparty_id = ?
    INNER JOIN execution_systems e ON e.execution_system_id = c.execution_system_id
    CROSS JOIN ccy_pair_options pair
    WHERE e.pricing_mode = 'AUTO_PRICED'
      AND NOT EXISTS
      (
        SELECT 1
        FROM pricing_rules existing_rule
        WHERE existing_rule.counterparty_id = ?
          AND existing_rule.execution_context_id = c.execution_context_id
          AND existing_rule.ccy_pair_code = pair.ccy_pair_code
      )
    ORDER BY c.execution_context_id, pair.ccy_pair_code
    LIMIT 1
  `).run(
    clientGenerationCounterpartyId,
    clientGenerationCounterpartyId,
    clientGenerationCounterpartyId
  ).lastInsertRowid);

  database.prepare(`
    INSERT INTO client_deal_generation_settings
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
    cascadePricingRuleId,
    500000 * clientGenerationMinorFactor,
    1500000 * clientGenerationMinorFactor,
    100000 * clientGenerationMinorFactor,
    clientGenerationBaseFractionDigits
  );
  database.prepare("DELETE FROM pricing_rules WHERE pricing_rule_id = ?").run(cascadePricingRuleId);

  if (database.prepare(`
    SELECT 1 AS present
    FROM client_deal_generation_settings
    WHERE pricing_rule_id = ?
  `).get(cascadePricingRuleId)) {
    clientDealGenerationSettingsCascadeDeleteEnforced = false;
  }

  [
    ["2026-07-15 09:30:00", "2026-07-15T09:30:00.000Z", "CLIENT_DEAL", "2026-07-15", "EUR_USD", "BUY", 10000, 2, 11231, 2, 1.1231, "TOD", "2026-07-15", "2026-07-15"],
    ["2026-07-15T09:30:00.000Z", "2026-07-15T09:30:00.000Z", "CLIENT", "2026-07-15", "EUR_USD", "BUY", 10000, 2, 11231, 2, 1.1231, "TOD", "2026-07-15", "2026-07-15"],
    ["2026-07-15T09:30:00.000Z", "2026-07-15T09:30:00.000Z", "TECHNICAL_DEAL", "2026-07-15", "EUR_USD", "BUY", 10000, 2, 11231, 2, 1.1231, "TOD", "2026-07-15", "2026-07-15"],
    ["2026-07-15T09:30:00.000Z", "2026-07-15T09:30:00.000Z", "CLIENT_DEAL", "15.07.2026", "EUR_USD", "BUY", 10000, 2, 11231, 2, 1.1231, "TOD", "2026-07-15", "2026-07-15"],
    ["2026-07-15T09:30:00.000Z", "2026-07-15T09:30:00.000Z", "CLIENT_DEAL", "2026-07-15", "UNKNOWN_PAIR", "BUY", 10000, 2, 11231, 2, 1.1231, "TOD", "2026-07-15", "2026-07-15"],
    ["2026-07-15T09:30:00.000Z", "2026-07-15T09:30:00.000Z", "CLIENT_DEAL", "2026-07-15", "EUR_USD", "HOLD", 10000, 2, 11231, 2, 1.1231, "TOD", "2026-07-15", "2026-07-15"],
    ["2026-07-15T09:30:00.000Z", "2026-07-15T09:30:00.000Z", "CLIENT_DEAL", "2026-07-15", "EUR_USD", "BUY", 0, 2, 11231, 2, 1.1231, "TOD", "2026-07-15", "2026-07-15"],
    ["2026-07-15T09:30:00.000Z", "2026-07-15T09:30:00.000Z", "CLIENT_DEAL", "2026-07-15", "EUR_USD", "BUY", 10000, 2, 11231, 2, 1.1231, "spot value", "2026-07-15", "2026-07-15"],
    ["2026-07-15T09:30:00.000Z", "2026-07-15T09:30:00.000Z", "CLIENT_DEAL", "2026-07-15", "EUR_USD", "BUY", 10000, 2, 11231, 2, 1.1231, "TOD", "15.07.2026", "2026-07-15"]
  ].forEach(values => {
    try {
      database.prepare(`
        INSERT INTO fx_trade_exposure
          (
            execution_timestamp, received_timestamp, trade_type, trade_date, ccy_pair_code, base_ccy_side,
            dealt_ccy_code,
            base_ccy_amount_minor, base_ccy_fraction_digits,
            quote_ccy_amount_minor, quote_ccy_fraction_digits,
            trade_rate, tenor,
            base_ccy_value_date, quote_ccy_value_date
          )
        VALUES (?, ?, ?, ?, ?, ?, 'EUR', ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(...values);
      fxTradeExposureConstraintsEnforced = false;
    } catch {}
  });

  try {
    database.prepare(`
      INSERT INTO fx_trade_exposure
        (
          execution_timestamp, received_timestamp, trade_type, trade_date, ccy_pair_code, base_ccy_side,
          dealt_ccy_code,
          base_ccy_amount_minor, base_ccy_fraction_digits,
          quote_ccy_amount_minor, quote_ccy_fraction_digits,
          trade_rate, tenor,
          base_ccy_value_date, quote_ccy_value_date
        )
      VALUES ('2026-07-15T09:30:00.000Z', '2026-07-15T09:30:00.000Z', 'CLIENT_DEAL', '2026-07-15', 'EUR_USD', 'BUY', 'JPY', 10000, 2, 11231, 2, 1.1231, 'TOD', '2026-07-15', '2026-07-15')
    `).run();
    fxTradeExposureConstraintsEnforced = false;
  } catch {}

  database.prepare(`
    INSERT INTO fx_trade_exposure
      (
        execution_timestamp, received_timestamp, trade_type, trade_date, ccy_pair_code, base_ccy_side,
        dealt_ccy_code,
        base_ccy_amount_minor, base_ccy_fraction_digits,
        quote_ccy_amount_minor, quote_ccy_fraction_digits,
        trade_rate, tenor,
        base_ccy_value_date, quote_ccy_value_date
      )
    VALUES ('2026-07-15T09:30:00.000Z', '2026-07-15T09:30:00.000Z', 'CLIENT_DEAL', '2026-07-15', 'EUR_USD', 'BUY', 'EUR', 3000000000, 2, 3369300000, 2, 1.1231, 'TOD', '2026-07-15', '2026-07-15')
  `).run();

  database.prepare(`
    INSERT INTO fx_trade_exposure
      (
        execution_timestamp, received_timestamp, trade_type, trade_date, ccy_pair_code, base_ccy_side,
        dealt_ccy_code,
        base_ccy_amount_minor, base_ccy_fraction_digits,
        quote_ccy_amount_minor, quote_ccy_fraction_digits,
        trade_rate, tenor,
        base_ccy_value_date, quote_ccy_value_date
      )
    VALUES ('2026-07-15T09:31:00.000Z', '2026-07-15T09:31:00.000Z', 'HEDGE_DEAL', '2026-07-15', 'EUR_USD', 'SELL', 'EUR', 3000000000, 2, 3369000000, 2, 1.123, 'TOD', '2026-07-15', '2026-07-15')
  `).run();

  database.prepare(`
    INSERT INTO fx_trade_exposure
      (
        execution_timestamp, received_timestamp, trade_type, trade_date, ccy_pair_code, base_ccy_side,
        dealt_ccy_code,
        base_ccy_amount_minor, base_ccy_fraction_digits,
        quote_ccy_amount_minor, quote_ccy_fraction_digits,
        trade_rate, tenor,
        base_ccy_value_date, quote_ccy_value_date
      )
    VALUES ('2026-07-15T09:32:00.000Z', '2026-07-15T09:32:00.000Z', 'CLIENT_DEAL', '2026-07-15', 'EUR_USD', 'BUY', 'EUR', 100000000, 2, 112310000, 2, 1.1231, 'TOM', '2026-07-16', '2026-07-16')
  `).run();

  database.prepare(`
    INSERT INTO fx_trade_exposure
      (
        execution_timestamp, received_timestamp, trade_type, trade_date, ccy_pair_code, base_ccy_side,
        dealt_ccy_code,
        base_ccy_amount_minor, base_ccy_fraction_digits,
        quote_ccy_amount_minor, quote_ccy_fraction_digits,
        trade_rate, tenor,
        base_ccy_value_date, quote_ccy_value_date
      )
    VALUES ('2026-07-15T09:33:00.000Z', '2026-07-15T09:33:00.000Z', 'HEDGE_DEAL', '2026-07-15', 'EUR_USD', 'SELL', 'EUR', 100000000, 2, 112300000, 2, 1.123, 'SPOT', '2026-07-17', '2026-07-17')
  `).run();

  const seededClientTradeId = Number(database.prepare(`
    SELECT trade_id
    FROM client_fx_deals
    LIMIT 1
  `).get().trade_id);
  const hedgeTradeId = Number(database.prepare(`
    SELECT trade_id
    FROM fx_trade_exposure
    WHERE execution_timestamp = '2026-07-15T09:31:00.000Z'
  `).get().trade_id);
  const unlinkedClientTradeId = Number(database.prepare(`
    SELECT trade_id
    FROM fx_trade_exposure
    WHERE execution_timestamp = '2026-07-15T09:32:00.000Z'
  `).get().trade_id);
  const seededHedgeTradeId = Number(database.prepare(`
    SELECT trade_id
    FROM fx_hedge_deals
    LIMIT 1
  `).get().trade_id);
  const unlinkedHedgeTradeId = Number(database.prepare(`
    SELECT trade_id
    FROM fx_trade_exposure
    WHERE execution_timestamp = '2026-07-15T09:33:00.000Z'
  `).get().trade_id);

  database.exec("SAVEPOINT verify_batches");
  try {
    const batchId = Number(database.prepare(`
      INSERT INTO fx_batches
        (idempotency_key, ccy_pair_code)
      VALUES ('verify-batch', 'EUR_USD')
    `).run().lastInsertRowid);
    const storedBatch = database.prepare(`
      SELECT *
      FROM fx_batches
      WHERE batch_id = ?
    `).get(batchId);

    fxTradeBatchDefaultsSupported = batchId > 0
      && storedBatch?.idempotency_key === "verify-batch"
      && storedBatch?.ccy_pair_code === "EUR_USD"
      && storedBatch?.batch_status === "BUILDING"
      && storedBatch?.formation_reason_code === "MANUAL_SELECTION"
      && storedBatch?.formation_reason_details_json === "{}"
      && storedBatch?.window_opened_at === null
      && storedBatch?.window_closed_at === null
      && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(storedBatch?.created_at || "");

    const insertQuoteCashMember = database.prepare(`
      INSERT INTO fx_batch_quote_cash_output
        (
          batch_id,
          quote_ccy_code,
          quote_balance_contribution_minor,
          quote_ccy_fraction_digits,
          quote_ccy_value_date
        )
      VALUES (?, ?, ?, ?, ?)
    `);
    insertQuoteCashMember.run(
      batchId,
      "USD",
      0,
      2,
      "2026-07-16"
    );
    const storedQuoteCashMember = database.prepare(`
      SELECT *
      FROM fx_batch_quote_cash_output
      WHERE batch_id = ?
    `).get(batchId);
    batchQuoteCashMemberSupported =
      storedQuoteCashMember?.batch_id === batchId
      && storedQuoteCashMember?.quote_ccy_code === "USD"
      && storedQuoteCashMember?.quote_balance_contribution_minor === 0
      && storedQuoteCashMember?.quote_ccy_fraction_digits === 2
      && storedQuoteCashMember?.quote_ccy_value_date === "2026-07-16"
      && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
        .test(storedQuoteCashMember?.created_at || "");

    try {
      database.prepare("DELETE FROM fx_batches WHERE batch_id = ?").run(batchId);
    } catch {
      batchQuoteCashMemberParentRestrictionEnforced = true;
    }

    try {
      insertQuoteCashMember.run(batchId, "USD", 0, 2, "2026-07-16");
    } catch {
      batchQuoteCashMemberSinglePerBatchEnforced = true;
    }

    database.prepare(`
      DELETE FROM fx_batch_quote_cash_output
      WHERE batch_id = ?
    `).run(batchId);

    [
      ["EUR", 0, 2, "2026-07-16"],
      ["USD", 0, 3, "2026-07-16"],
      ["USD", 1.5, 2, "2026-07-16"],
      ["USD", 9007199254740992, 2, "2026-07-16"],
      ["USD", 0, 2, "16.07.2026"]
    ].forEach(values => {
      try {
        insertQuoteCashMember.run(batchId, ...values);
        batchQuoteCashMemberConstraintsEnforced = false;
        database.prepare(`
          DELETE FROM fx_batch_quote_cash_output
          WHERE batch_id = ?
        `).run(batchId);
      } catch {}
    });

    const settlementBatchId = Number(database.prepare(`
      INSERT INTO fx_batches
        (idempotency_key, ccy_pair_code)
      VALUES ('verify-cash-settlement-batch', 'EUR_USD')
    `).run().lastInsertRowid);
    database.prepare(`
      INSERT INTO fx_batch_members
        (batch_id, trade_id, trade_type, member_role)
      VALUES (?, ?, 'CLIENT_DEAL', 'TRADE')
    `).run(settlementBatchId, seededClientTradeId);

    try {
      insertQuoteCashMember.run(
        settlementBatchId,
        "USD",
        0,
        2,
        "2026-07-17"
      );
      batchQuoteCashMemberConstraintsEnforced = false;
    } catch {}

    try {
      database.prepare(`
        INSERT INTO fx_batches (idempotency_key, ccy_pair_code, batch_status)
        VALUES ('verify-invalid-batch', 'EUR_USD', 'COMPLETED')
      `).run();
      fxTradeBatchConstraintsEnforced = false;
    } catch {}

    [
      ["verify-invalid-reason", "UNKNOWN", "{}"],
      ["verify-invalid-reason-json", "MANUAL_SELECTION", "{invalid}"],
      ["verify-non-object-reason-json", "MANUAL_SELECTION", "[]"]
    ].forEach(([idempotencyKey, reasonCode, detailsJson]) => {
      try {
        database.prepare(`
          INSERT INTO fx_batches
            (
              idempotency_key,
              ccy_pair_code,
              formation_reason_code,
              formation_reason_details_json
            )
          VALUES (?, 'EUR_USD', ?, ?)
        `).run(idempotencyKey, reasonCode, detailsJson);
        fxTradeBatchConstraintsEnforced = false;
      } catch {}
    });
  } finally {
    database.exec("ROLLBACK TO verify_batches");
    database.exec("RELEASE verify_batches");
  }

  database.exec("SAVEPOINT verify_quote_cash_neutrality");

  try {
    const cashNeutralityBatchId = Number(database.prepare(`
      INSERT INTO fx_batches (idempotency_key, ccy_pair_code)
      VALUES ('verify-quote-cash-neutrality', 'EUR_USD')
    `).run().lastInsertRowid);
    const insertMember = database.prepare(`
      INSERT INTO fx_batch_members
        (batch_id, trade_id, trade_type, member_role)
      VALUES (?, ?, ?, 'TRADE')
    `);
    insertMember.run(cashNeutralityBatchId, seededClientTradeId, "CLIENT_DEAL");
    insertMember.run(cashNeutralityBatchId, seededHedgeTradeId, "HEDGE_DEAL");
    const insertCashMember = database.prepare(`
      INSERT INTO fx_batch_quote_cash_output
        (
          batch_id,
          quote_ccy_code,
          quote_balance_contribution_minor,
          quote_ccy_fraction_digits,
          quote_ccy_value_date
        )
      VALUES (?, 'USD', ?, 2, '2026-07-15')
    `);
    insertCashMember.run(cashNeutralityBatchId, 0);

    try {
      database.prepare(`
        UPDATE fx_batches
        SET batch_status = 'FORMED'
        WHERE batch_id = ?
      `).run(cashNeutralityBatchId);
    } catch {
      batchQuoteCashNeutralityEnforced = true;
    }

    database.prepare(`
      DELETE FROM fx_batch_quote_cash_output
      WHERE batch_id = ?
    `).run(cashNeutralityBatchId);
    insertCashMember.run(cashNeutralityBatchId, -2700000);
    database.prepare(`
      UPDATE fx_batches
      SET batch_status = 'FORMED'
      WHERE batch_id = ?
    `).run(cashNeutralityBatchId);

    try {
      database.prepare(`
        UPDATE fx_batch_quote_cash_output
        SET quote_balance_contribution_minor = 0
        WHERE batch_id = ?
      `).run(cashNeutralityBatchId);
    } catch {
      completedBatchQuoteCashMemberImmutable = true;
    }
  } finally {
    database.exec("ROLLBACK TO verify_quote_cash_neutrality");
    database.exec("RELEASE verify_quote_cash_neutrality");
  }

  batchTradeTypesSupported = true;

  [
    [999999, "CLIENT_DEAL", 1],
    [hedgeTradeId, "CLIENT_DEAL", 1],
    [hedgeTradeId, "HEDGE_DEAL", 1],
    [seededClientTradeId, "CLIENT_DEAL", 1]
  ].forEach(values => {
    try {
      database.prepare(`
        INSERT INTO client_fx_deals (trade_id, trade_type, counterparty_id)
        VALUES (?, ?, ?)
      `).run(...values);
      clientFxDealConstraintsEnforced = false;
    } catch {}
  });

  [
    [999999, "HEDGE_DEAL", 4],
    [unlinkedClientTradeId, "HEDGE_DEAL", 4],
    [unlinkedHedgeTradeId, "CLIENT_DEAL", 4],
    [seededHedgeTradeId, "HEDGE_DEAL", 4]
  ].forEach(values => {
    try {
      database.prepare(`
        INSERT INTO fx_hedge_deals
          (trade_id, trade_type, request_timestamp, counterparty_id)
        VALUES (?, ?, '2026-07-15T09:31:00.000Z', ?)
      `).run(...values);
      hedgeFxDealConstraintsEnforced = false;
    } catch {}
  });

  const hedgePricingRuleReference = database.prepare(`
    SELECT pricing_rule_id, counterparty_id, execution_context_id
    FROM fx_hedge_deals
    WHERE trade_id = ?
  `).get(seededHedgeTradeId);

  [
    [unlinkedHedgeTradeId, hedgePricingRuleReference.counterparty_id, null, null, 0, 0, 2],
    [unlinkedHedgeTradeId, hedgePricingRuleReference.counterparty_id, null, null, 1.12, "INVALID", 2],
    [unlinkedHedgeTradeId, hedgePricingRuleReference.counterparty_id, null, null, 1.12, 0, null],
    [unlinkedHedgeTradeId, hedgePricingRuleReference.counterparty_id, null, hedgePricingRuleReference.pricing_rule_id, 1.12, 0, 2],
    [unlinkedHedgeTradeId, 1, hedgePricingRuleReference.execution_context_id, hedgePricingRuleReference.pricing_rule_id, 1.12, 0, 2]
  ].forEach(values => {
    try {
      database.prepare(`
        INSERT INTO fx_hedge_deals
          (
            trade_id,
            trade_type,
            request_timestamp,
            counterparty_id,
            execution_context_id,
            pricing_rule_id,
            transfer_rate,
            analytical_pnl_quote_minor,
            analytical_pnl_quote_fraction_digits
          )
        VALUES (?, 'HEDGE_DEAL', '2026-07-15T09:33:00.000Z', ?, ?, ?, ?, ?, ?)
      `).run(...values);
      hedgeFxDealConstraintsEnforced = false;
    } catch {}
  });

  const pricingRuleReference = database.prepare(`
    SELECT pricing_rule_id, execution_context_id
    FROM pricing_rules
    WHERE counterparty_id = 1
    ORDER BY pricing_rule_id
    LIMIT 1
  `).get();
  const mismatchedExecutionContextId = Number(database.prepare(`
    SELECT execution_context_id
    FROM execution_contexts
    WHERE execution_context_id <> ?
    ORDER BY execution_context_id
    LIMIT 1
  `).get(pricingRuleReference.execution_context_id).execution_context_id);

  [
    [unlinkedClientTradeId, 1, null, null, 0, 0, 2],
    [unlinkedClientTradeId, 1, null, null, 1.12, "INVALID", 2],
    [unlinkedClientTradeId, 1, null, null, 1.12, 0, null],
    [unlinkedClientTradeId, 1, null, pricingRuleReference.pricing_rule_id, 1.12, 0, 2],
    [unlinkedClientTradeId, 1, mismatchedExecutionContextId, pricingRuleReference.pricing_rule_id, 1.12, 0, 2]
  ].forEach(values => {
    try {
      database.prepare(`
        INSERT INTO client_fx_deals
          (
            trade_id,
            trade_type,
            counterparty_id,
            execution_context_id,
            pricing_rule_id,
            transfer_rate,
            analytical_pnl_quote_minor,
            analytical_pnl_quote_fraction_digits
          )
        VALUES (?, 'CLIENT_DEAL', ?, ?, ?, ?, ?, ?)
      `).run(...values);
      clientFxDealConstraintsEnforced = false;
    } catch {}
  });

  ["X".repeat(501), "First line\nSecond line"].forEach(comment => {
    try {
      database.prepare(`
        UPDATE client_fx_deals
        SET comment = ?
        WHERE trade_id = ?
      `).run(comment, seededClientTradeId);
      clientFxDealConstraintsEnforced = false;
    } catch {}
  });

  try {
    database.prepare("DELETE FROM fx_trade_exposure WHERE trade_id = ?").run(seededClientTradeId);
    clientFxDealParentRestrictionEnforced = false;
  } catch {}

  try {
    database.prepare("DELETE FROM fx_trade_exposure WHERE trade_id = ?").run(seededHedgeTradeId);
    hedgeFxDealParentRestrictionEnforced = false;
  } catch {}

  try {
    database.prepare(`
      UPDATE fx_trade_exposure
      SET trade_type = 'CLIENT_DEAL'
      WHERE trade_id = ?
    `).run(seededHedgeTradeId);
    hedgeFxDealParentRestrictionEnforced = false;
  } catch {}

  try {
    database.prepare(`
      UPDATE fx_trade_exposure
      SET trade_type = 'HEDGE_DEAL'
      WHERE trade_id = ?
    `).run(seededClientTradeId);
    clientFxDealParentRestrictionEnforced = false;
  } catch {}

  const seededPricingRuleId = Number(database.prepare(`
    SELECT pricing_rule_id
    FROM client_fx_deals
    WHERE trade_id = ?
  `).get(seededClientTradeId).pricing_rule_id);

  try {
    database.prepare("DELETE FROM pricing_rules WHERE pricing_rule_id = ?").run(seededPricingRuleId);
    clientFxDealAttributionReferencesRestricted = false;
  } catch {}

  const nonClientCounterpartyId = Number(database.prepare(`
    INSERT INTO trading_counterparties (counterparty_name, is_active)
    VALUES ('Verification Deal Counterparty', 1)
  `).run().lastInsertRowid);
  database.prepare(`
    INSERT INTO external_counterparties
      (counterparty_id, counterparty_code, counterparty_code_type, external_counterparty_kind)
    VALUES (?, 'VERIFY_DEAL_CP', 'OTHER', 'CORPORATE')
  `).run(nonClientCounterpartyId);
  database.prepare(`
    INSERT INTO trading_counterparty_roles (counterparty_id, role_code)
    VALUES (?, 'HEDGE_COUNTERPARTY')
  `).run(nonClientCounterpartyId);

  try {
    database.prepare(`
      INSERT INTO client_fx_deals (trade_id, trade_type, counterparty_id)
      VALUES (?, 'CLIENT_DEAL', ?)
    `).run(unlinkedClientTradeId, nonClientCounterpartyId);
    clientFxDealCounterpartyTypeEnforced = false;
  } catch {}

  try {
    database.prepare(`
      DELETE FROM trading_counterparty_roles
      WHERE counterparty_id = 1 AND role_code = 'CLIENT'
    `).run();
    clientFxDealCounterpartyTypeEnforced = false;
  } catch {}

  try {
    database.prepare(`
      INSERT INTO fx_hedge_deals
        (trade_id, trade_type, request_timestamp, counterparty_id)
      VALUES (?, 'HEDGE_DEAL', '2026-07-15T09:33:00.000Z', 1)
    `).run(unlinkedHedgeTradeId);
    hedgeFxDealCounterpartyTypeEnforced = false;
  } catch {}

  try {
    database.prepare(`
      DELETE FROM trading_counterparty_roles
      WHERE counterparty_id = 4 AND role_code = 'HEDGE_COUNTERPARTY'
    `).run();
    hedgeFxDealCounterpartyTypeEnforced = false;
  } catch {}

  database.prepare("DELETE FROM trading_counterparties WHERE counterparty_id = ?").run(nonClientCounterpartyId);

  const result = {
    currencies: database.prepare("SELECT COUNT(*) AS count FROM ccy_options").get().count,
    pairs: database.prepare("SELECT COUNT(*) AS count FROM ccy_pair_options").get().count,
    simulationSettings: database.prepare("SELECT COUNT(*) AS count FROM market_quote_simulation_settings").get().count,
    simulationSettingsColumns: database.prepare("PRAGMA table_info(market_quote_simulation_settings)").all()
      .map(column => column.name),
    simulationSettingsRows: database.prepare(`
      SELECT
        ccy_pair_code,
        bid_min,
        spread,
        bid_max,
        one_way_duration_seconds,
        fluctuation_spreads
      FROM market_quote_simulation_settings
      ORDER BY ccy_pair_code
    `).all(),
    servicingLocations: database.prepare("SELECT COUNT(*) AS count FROM servicing_locations").get().count,
    accountingSystems: database.prepare("SELECT COUNT(*) AS count FROM accounting_systems").get().count,
    executionSystems: database.prepare("SELECT COUNT(*) AS count FROM execution_systems").get().count,
    executionContexts: database.prepare("SELECT COUNT(*) AS count FROM execution_contexts").get().count,
    executionContextIdType: database.prepare("PRAGMA table_info(execution_contexts)").all()
      .find(column => column.name === "execution_context_id")?.type,
    executionContextDefaultPositionManagementModeColumn:
      database.prepare("PRAGMA table_info(execution_contexts)").all()
        .find(column => column.name === "default_position_management_mode"),
    executionContextPositionManagementModeCounts: database.prepare(`
      SELECT default_position_management_mode AS mode, COUNT(*) AS count
      FROM execution_contexts
      GROUP BY default_position_management_mode
      ORDER BY default_position_management_mode
    `).all(),
    tradingCounterparties: database.prepare("SELECT COUNT(*) AS count FROM trading_counterparties").get().count,
    tradingCounterpartyRoles: database.prepare(`
      SELECT DISTINCT role_code
      FROM trading_counterparty_roles
      ORDER BY role_code
    `).all().map(row => row.role_code),
    tradingCounterpartyColumns: database.prepare("PRAGMA table_info(trading_counterparties)").all()
      .map(column => column.name),
    externalCounterpartyColumns: database.prepare("PRAGMA table_info(external_counterparties)").all()
      .map(column => column.name),
    internalUnitColumns: database.prepare("PRAGMA table_info(internal_units)").all()
      .map(column => column.name),
    tradingCounterpartyRoleColumns: database.prepare("PRAGMA table_info(trading_counterparty_roles)").all()
      .map(column => column.name),
    counterpartyExecutionContexts: database.prepare(`
      SELECT COUNT(*) AS count
      FROM trading_counterparty_execution_contexts
    `).get().count,
    counterpartyExecutionContextColumns: database.prepare(`
      PRAGMA table_info(trading_counterparty_execution_contexts)
    `).all().map(column => column.name),
    counterpartyExecutionContextForeignKeys: database.prepare(`
      PRAGMA foreign_key_list(trading_counterparty_execution_contexts)
    `).all(),
    counterpartyExecutionContextIndexColumns: database.prepare(`
      PRAGMA index_info(idx_trading_counterparty_execution_contexts_context)
    `).all().map(column => column.name),
    users: database.prepare("SELECT COUNT(*) AS count FROM users").get().count,
    userColumns: database.prepare("PRAGMA table_info(users)").all().map(column => column.name),
    userRoles: database.prepare(`
      SELECT DISTINCT user_role
      FROM users
      ORDER BY user_role
    `).all().map(row => row.user_role),
    uiColorTokens: database.prepare(`
      SELECT COUNT(*) AS count
      FROM ui_color_tokens
    `).get().count,
    uiColorTokenColumns: database.prepare(`
      PRAGMA table_info(ui_color_tokens)
    `).all().map(column => column.name),
    uiColorTokenFamilies: database.prepare(`
      SELECT DISTINCT palette_family
      FROM ui_color_tokens
      ORDER BY palette_family
    `).all().map(row => row.palette_family),
    uiColorTokenSamples: database.prepare(`
      SELECT token_code, palette_family, shade, color_value
      FROM ui_color_tokens
      WHERE token_code IN ('blue_500', 'red_100', 'green_100')
      ORDER BY display_order
    `).all(),
    uiTableColumnSettings: database.prepare(`
      SELECT COUNT(*) AS count
      FROM ui_table_column_settings
    `).get().count,
    uiTableColumnLayoutKeys: database.prepare(`
      SELECT table_key, COUNT(*) AS column_count
      FROM ui_table_column_settings
      GROUP BY table_key
      ORDER BY table_key
    `).all(),
    uiTableColumnSettingColumns: database.prepare(`
      PRAGMA table_info(ui_table_column_settings)
    `).all().map(column => column.name),
    uiTableColumnSettingRows: database.prepare(`
      SELECT
        table_key,
        column_key,
        column_label,
        display_order,
        default_width_px,
        width_px
      FROM ui_table_column_settings
      WHERE table_key = 'pricing_rules_grid'
      ORDER BY display_order
    `).all(),
    pricingRules: database.prepare("SELECT COUNT(*) AS count FROM pricing_rules").get().count,
    pricingRulePositionManagementModeOverrideColumn:
      database.prepare("PRAGMA table_info(pricing_rules)").all()
        .find(column => column.name === "position_management_mode_override"),
    pricingRuleNullPositionManagementModeOverrides: database.prepare(`
      SELECT COUNT(*) AS count
      FROM pricing_rules
      WHERE position_management_mode_override IS NULL
    `).get().count,
    legacyMonetaryColumns: database.prepare(`
      SELECT
        schema_entry.name AS table_name,
        table_column.name AS column_name
      FROM sqlite_schema schema_entry
      INNER JOIN pragma_table_info(schema_entry.name) table_column
      WHERE schema_entry.type = 'table'
        AND schema_entry.name NOT LIKE 'sqlite_%'
        AND (
          lower(table_column.name) LIKE '%amount%'
          OR lower(table_column.name) LIKE '%pnl%'
          OR lower(table_column.name) LIKE '%balance%'
          OR lower(table_column.name) LIKE '%notional%'
          OR lower(table_column.name) LIKE '%fee%'
          OR lower(table_column.name) LIKE '%commission%'
        )
        AND lower(table_column.name) NOT LIKE '%_minor'
        AND lower(table_column.name) NOT LIKE '%fraction_digits'
      ORDER BY schema_entry.name, table_column.cid
    `).all(),
    clientDealGenerationSettings: database.prepare(`
      SELECT COUNT(*) AS count
      FROM client_deal_generation_settings
    `).get().count,
    clientDealGenerationProcessSettings: database.prepare(`
      SELECT *
      FROM client_deal_generation_process_settings
      WHERE settings_id = 1
    `).get(),
    clientDealGenerationProcessSettingsColumns: database.prepare(`
      PRAGMA table_info(client_deal_generation_process_settings)
    `).all().map(column => column.name),
    fxBatchingSettings: database.prepare(`
      SELECT *
      FROM fx_batching_settings
      WHERE settings_id = 1
    `).get(),
    fxBatchingSettingsColumns: database.prepare(`
      PRAGMA table_info(fx_batching_settings)
    `).all().map(column => column.name),
    fxAutoBatchingSettings: database.prepare(`
      SELECT *
      FROM fx_auto_batching_settings
      WHERE settings_id = 1
    `).get(),
    fxAutoBatchingSettingsColumns: database.prepare(`
      PRAGMA table_info(fx_auto_batching_settings)
    `).all().map(column => column.name),
    fxAutoBatchingCcyPairs: database.prepare(`
      SELECT ccy_pair_code
      FROM fx_auto_batching_ccy_pairs
      WHERE settings_id = 1
      ORDER BY ccy_pair_code
    `).all(),
    fxAutoBatchingCcyPairColumns: database.prepare(`
      PRAGMA table_info(fx_auto_batching_ccy_pairs)
    `).all().map(column => column.name),
    fxAutoBatchingCcyPairForeignKeys: database.prepare(`
      PRAGMA foreign_key_list(fx_auto_batching_ccy_pairs)
    `).all(),
    clientDealGenerationSettingsColumns: database.prepare(`
      PRAGMA table_info(client_deal_generation_settings)
    `).all().map(column => column.name),
    clientDealGenerationSettingsForeignKeys: database.prepare(`
      PRAGMA foreign_key_list(client_deal_generation_settings)
    `).all(),
    clientDealGenerationSettingsRows: database.prepare(`
      SELECT
        s.*,
        role.role_code AS counterparty_type,
        e.pricing_mode
      FROM client_deal_generation_settings s
      INNER JOIN pricing_rules r ON r.pricing_rule_id = s.pricing_rule_id
      INNER JOIN trading_counterparties p ON p.counterparty_id = r.counterparty_id
      INNER JOIN trading_counterparty_roles role
        ON role.counterparty_id = p.counterparty_id AND role.role_code = 'CLIENT'
      INNER JOIN execution_contexts c ON c.execution_context_id = r.execution_context_id
      INNER JOIN execution_systems e ON e.execution_system_id = c.execution_system_id
      ORDER BY s.pricing_rule_id
    `).all(),
    fxTradeExposures: database.prepare("SELECT COUNT(*) AS count FROM fx_trade_exposure").get().count,
    fxTradeExposureColumns: database.prepare("PRAGMA table_info(fx_trade_exposure)").all().map(column => column.name),
    fxTradeExposureForeignKeys: database.prepare("PRAGMA foreign_key_list(fx_trade_exposure)").all(),
    fxTradeExposureIdentityIndex: database.prepare("PRAGMA index_list(fx_trade_exposure)").all()
      .some(index => index.name === "uq_fx_trade_exposure_identity" && index.unique === 1),
    fxTradeExposureIdentityIndexColumns: database.prepare("PRAGMA index_info(uq_fx_trade_exposure_identity)").all()
      .map(column => column.name),
    fxTradePositionManagementRows: database.prepare(`
      SELECT COUNT(*) AS count
      FROM fx_trade_position_management
    `).get().count,
    fxTradePositionManagementColumns: database.prepare(`
      PRAGMA table_info(fx_trade_position_management)
    `).all().map(column => column.name),
    fxTradePositionManagementForeignKeys: database.prepare(`
      PRAGMA foreign_key_list(fx_trade_position_management)
    `).all(),
    fxTradePositionManagementInitialModeCounts: database.prepare(`
      SELECT initial_position_management_mode AS mode, COUNT(*) AS count
      FROM fx_trade_position_management
      GROUP BY initial_position_management_mode
      ORDER BY initial_position_management_mode
    `).all(),
    fxTradePositionManagementCurrentModeCounts: database.prepare(`
      SELECT current_position_management_mode AS mode, COUNT(*) AS count
      FROM fx_trade_position_management
      GROUP BY current_position_management_mode
      ORDER BY current_position_management_mode
    `).all(),
    fxTradePositionManagementMissingRows: database.prepare(`
      SELECT COUNT(*) AS count
      FROM fx_trade_exposure exposure
      LEFT JOIN fx_trade_position_management management
        ON management.trade_id = exposure.trade_id
        AND management.trade_type = exposure.trade_type
      WHERE management.trade_id IS NULL
    `).get().count,
    fxTradePositionManagementOrphanRows: database.prepare(`
      SELECT COUNT(*) AS count
      FROM fx_trade_position_management management
      LEFT JOIN fx_trade_exposure exposure
        ON exposure.trade_id = management.trade_id
        AND exposure.trade_type = management.trade_type
      WHERE exposure.trade_id IS NULL
    `).get().count,
    fxTradePositionManagementTrigger: database.prepare(`
      SELECT name, sql
      FROM sqlite_master
      WHERE type = 'trigger'
        AND name = 'trg_fx_trade_position_management_initialize'
    `).get(),
    fxTradePositionManagementTransitionRows: database.prepare(`
      SELECT COUNT(*) AS count
      FROM fx_trade_position_management_transitions
    `).get().count,
    fxTradePositionManagementTransitionColumns: database.prepare(`
      PRAGMA table_info(fx_trade_position_management_transitions)
    `).all().map(column => column.name),
    fxTradePositionManagementTransitionForeignKeys: database.prepare(`
      PRAGMA foreign_key_list(fx_trade_position_management_transitions)
    `).all(),
    fxTradePositionManagementTransitionCreateSql: database.prepare(`
      SELECT sql
      FROM sqlite_master
      WHERE type = 'table'
        AND name = 'fx_trade_position_management_transitions'
    `).get()?.sql || "",
    fxTradeMarketSnapshots: database.prepare("SELECT COUNT(*) AS count FROM fx_trade_market_snapshot").get().count,
    fxTradeMarketSnapshotColumns: database.prepare("PRAGMA table_info(fx_trade_market_snapshot)").all()
      .map(column => column.name),
    fxTradeMarketSnapshotForeignKeys: database.prepare("PRAGMA foreign_key_list(fx_trade_market_snapshot)").all(),
    fxTradeMarketSnapshotSeedRows: database.prepare(`
      SELECT *
      FROM fx_trade_market_snapshot
      ORDER BY trade_id
    `).all(),
    clientFxDeals: database.prepare("SELECT COUNT(*) AS count FROM client_fx_deals").get().count,
    clientFxDealColumns: database.prepare("PRAGMA table_info(client_fx_deals)").all().map(column => column.name),
    clientFxDealForeignKeys: database.prepare("PRAGMA foreign_key_list(client_fx_deals)").all(),
    clientFxDealSeedRow: database.prepare("SELECT * FROM client_fx_deals LIMIT 1").get(),
    hedgeFxDeals: database.prepare("SELECT COUNT(*) AS count FROM fx_hedge_deals").get().count,
    hedgeFxDealColumns: database.prepare("PRAGMA table_info(fx_hedge_deals)").all().map(column => column.name),
    hedgeFxDealForeignKeys: database.prepare("PRAGMA foreign_key_list(fx_hedge_deals)").all(),
    hedgeFxDealSeedRow: database.prepare("SELECT * FROM fx_hedge_deals LIMIT 1").get(),
    hedgeQuickModeSettings: database.prepare(`
      SELECT COUNT(*) AS count
      FROM fx_hedge_quick_mode_settings
    `).get().count,
    hedgeQuickModeSettingsColumns: database.prepare(`
      PRAGMA table_info(fx_hedge_quick_mode_settings)
    `).all().map(column => column.name),
    hedgeQuickModeSettingsForeignKeys: database.prepare(`
      PRAGMA foreign_key_list(fx_hedge_quick_mode_settings)
    `).all(),
    hedgeQuickModeSettingsSeedRow: database.prepare(`
      SELECT
        settings.*,
        role.role_code AS counterparty_type,
        execution.pricing_mode
      FROM fx_hedge_quick_mode_settings settings
      INNER JOIN pricing_rules rule
        ON rule.pricing_rule_id = settings.pricing_rule_id
        AND rule.counterparty_id = settings.counterparty_id
        AND rule.ccy_pair_code = settings.ccy_pair_code
      INNER JOIN trading_counterparties counterparty ON counterparty.counterparty_id = settings.counterparty_id
      INNER JOIN trading_counterparty_roles role
        ON role.counterparty_id = counterparty.counterparty_id AND role.role_code = 'HEDGE_COUNTERPARTY'
      INNER JOIN execution_contexts context
        ON context.execution_context_id = rule.execution_context_id
      INNER JOIN execution_systems execution
        ON execution.execution_system_id = context.execution_system_id
      WHERE settings.ccy_pair_code = 'EUR_USD'
    `).get(),
    hedgeQuickModeSettingsReferenceIndex: database.prepare(`
      PRAGMA index_list(pricing_rules)
    `).all().some(index =>
      index.name === "uq_pricing_rules_hedge_quick_mode_reference"
      && index.unique === 1
    ),
    hedgeQuickModeSettingsReferenceIndexColumns: database.prepare(`
      PRAGMA index_info(uq_pricing_rules_hedge_quick_mode_reference)
    `).all().map(column => column.name),
    hedgeQuickModeSettingsTriggers: database.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'trigger'
        AND name LIKE '%hedge_quick_mode_settings%'
      ORDER BY name
    `).all().map(trigger => trigger.name),
    fxTradeBatches: database.prepare(`
      SELECT COUNT(*) AS count
      FROM fx_batches
    `).get().count,
    batchFormationAuditView: database.prepare(`
      SELECT type, sql
      FROM sqlite_schema
      WHERE name = 'v_fx_batch_formation_audit'
    `).get(),
    batchFormationAuditViewColumns: database.prepare(`
      PRAGMA table_info(v_fx_batch_formation_audit)
    `).all().map(column => column.name),
    fxTradeBatchColumns: database.prepare(`
      PRAGMA table_info(fx_batches)
    `).all().map(column => column.name),
    fxTradeBatchForeignKeys: database.prepare(`
      PRAGMA foreign_key_list(fx_batches)
    `).all(),
    fxTradeBatchCreateSql: database.prepare(`
      SELECT sql
      FROM sqlite_schema
      WHERE type = 'table' AND name = 'fx_batches'
    `).get()?.sql || "",
    fxTradeBatchStatusPairIndexColumns: database.prepare(`
      PRAGMA index_info(idx_fx_batches_status_pair)
    `).all().map(column => column.name),
    batchBalancingTrades: database.prepare(`
      SELECT COUNT(*) AS count
      FROM fx_batch_members
    `).get().count,
    batchBalancingTradeColumns: database.prepare(`
      PRAGMA table_info(fx_batch_members)
    `).all().map(column => column.name),
    batchBalancingTradeForeignKeys: database.prepare(`
      PRAGMA foreign_key_list(fx_batch_members)
    `).all(),
    batchMemberCreateSql: database.prepare(`
      SELECT sql
      FROM sqlite_schema
      WHERE type = 'table' AND name = 'fx_batch_members'
    `).get()?.sql || "",
    batchMemberTechnicalOriginIndex: database.prepare(`
      PRAGMA index_list(fx_batch_members)
    `).all().some(index =>
      index.name === "uq_fx_batch_members_single_technical_origin"
      && index.unique === 1
    ),
    batchBalanceTrades: database.prepare(`
      SELECT COUNT(*) AS count
      FROM fx_batch_balance_trade
    `).get().count,
    batchBalanceTradeColumns: database.prepare(`
      PRAGMA table_info(fx_batch_balance_trade)
    `).all(),
    batchBalanceTradeForeignKeys: database.prepare(`
      PRAGMA foreign_key_list(fx_batch_balance_trade)
    `).all(),
    batchBalanceTradeCreateSql: database.prepare(`
      SELECT sql
      FROM sqlite_schema
      WHERE type = 'table' AND name = 'fx_batch_balance_trade'
    `).get()?.sql || "",
    batchPositionOutputs: database.prepare(`
      SELECT COUNT(*) AS count
      FROM fx_batch_position_output
    `).get().count,
    batchPositionOutputColumns: database.prepare(`
      PRAGMA table_info(fx_batch_position_output)
    `).all(),
    batchPositionOutputForeignKeys: database.prepare(`
      PRAGMA foreign_key_list(fx_batch_position_output)
    `).all(),
    batchPositionOutputCreateSql: database.prepare(`
      SELECT sql
      FROM sqlite_schema
      WHERE type = 'table' AND name = 'fx_batch_position_output'
    `).get()?.sql || "",
    batchQuoteCashMembers: database.prepare(`
      SELECT COUNT(*) AS count
      FROM fx_batch_quote_cash_output
    `).get().count,
    batchQuoteCashMemberColumns: database.prepare(`
      PRAGMA table_info(fx_batch_quote_cash_output)
    `).all().map(column => column.name),
    batchQuoteCashMemberForeignKeys: database.prepare(`
      PRAGMA foreign_key_list(fx_batch_quote_cash_output)
    `).all(),
    batchQuoteCashMemberCreateSql: database.prepare(`
      SELECT sql
      FROM sqlite_schema
      WHERE type = 'table' AND name = 'fx_batch_quote_cash_output'
    `).get()?.sql || "",
    batchQuoteCashMemberTriggers: database.prepare(`
      SELECT name
      FROM sqlite_schema
      WHERE type = 'trigger'
        AND tbl_name = 'fx_batch_quote_cash_output'
      ORDER BY name
    `).all().map(trigger => trigger.name),
    pricingRuleReferenceIndex: database.prepare("PRAGMA index_list(pricing_rules)").all()
      .some(index => index.name === "uq_pricing_rules_client_deal_reference" && index.unique === 1),
    pricingRuleReferenceIndexColumns: database.prepare("PRAGMA index_info(uq_pricing_rules_client_deal_reference)").all()
      .map(column => column.name),
    pricingRuleExecutionContextIdType: database.prepare("PRAGMA table_info(pricing_rules)").all()
      .find(column => column.name === "execution_context_id")?.type,
    ccyOptionsConstraintsEnforced,
    ccyPairOptionsConstraintsEnforced,
    servicingLocationConstraintsEnforced,
    accountingSystemTextLimitsEnforced,
    executionSystemConstraintsEnforced,
    tradingCounterpartyConstraintsEnforced,
    counterpartyExecutionContextConstraintsEnforced,
    userConstraintsEnforced,
    uiTableColumnSettingsConstraintsEnforced,
    normalizedTradingCounterpartyProfilesSupported,
    clientDealGenerationProcessSettingsConstraintsEnforced,
    clientDealGenerationSettingsConstraintsEnforced,
    clientDealGenerationSettingsCounterpartyTypeEnforced,
    clientDealGenerationSettingsPricingModeEnforced,
    clientDealGenerationSettingsCascadeDeleteEnforced,
    fxTradeExposureConstraintsEnforced,
    clientFxDealConstraintsEnforced,
    clientFxDealParentRestrictionEnforced,
    clientFxDealAttributionReferencesRestricted,
    clientFxDealCounterpartyTypeEnforced,
    hedgeFxDealConstraintsEnforced,
    hedgeFxDealParentRestrictionEnforced,
    hedgeFxDealCounterpartyTypeEnforced,
    fxTradeBatchDefaultsSupported,
    fxTradeBatchConstraintsEnforced,
    batchTradeTypesSupported,
    batchBalancingTradeConstraintsEnforced,
    batchBalancingTradeParentRestrictionEnforced,
    batchQuoteCashMemberSupported,
    batchQuoteCashMemberConstraintsEnforced,
    batchQuoteCashMemberParentRestrictionEnforced,
    batchQuoteCashMemberSinglePerBatchEnforced,
    batchQuoteCashNeutralityEnforced,
    completedBatchQuoteCashMemberImmutable,
    counterpartyExecutionContextTablePresent: Boolean(database.prepare(`
      SELECT 1 AS present
      FROM sqlite_master
      WHERE type = 'table' AND name = 'trading_counterparty_execution_contexts'
    `).get()),
    foreignKeyViolations: database.prepare("PRAGMA foreign_key_check").all().length
  };
  database.close();
  return result;
}

function verifyFrontendStructure() {
  const normalizedSource = fileName => fs
    .readFileSync(path.join(root, fileName), "utf8")
    .replace(/\r\n?/g, "\n");
  const documentHtml = normalizedSource("index.html");
  const frontendStyle = normalizedSource(path.join("frontend", "styles", "app.css"));
  const inlineScript = normalizedSource(path.join("frontend", "app", "app.js"));
  const html = `${documentHtml}\n${frontendStyle}\n${inlineScript}`;
  const serverSource = normalizedSource("server.js");
  const schemaSource = normalizedSource("schema.sql");
  const uiTableLayoutsSource = normalizedSource(
    path.join("backend", "ui-table-layout", "ui-table-layouts.js")
  );
  const demoDatabaseSource = normalizedSource("demo-db.js");
  const fxBatchFormationDomainSource = normalizedSource(
    path.join("backend", "fx-batching", "domain", "fx-batch-formation.js")
  );
  const fxBatchBalanceDomainSource = normalizedSource(
    path.join("backend", "fx-batching", "domain", "fx-batch-balance.js")
  );
  const fxBatchFormationApplicationSource = normalizedSource(
    path.join("backend", "fx-batching", "application", "form-fx-batch-use-case.js")
  );
  const fxAutoBatchingProcessSource = normalizedSource(
    path.join("backend", "fx-batching", "application", "fx-auto-batching-process.js")
  );
  const fxAutoBatchingTradeScopeSource = normalizedSource(
    path.join("backend", "fx-batching", "application", "fx-auto-batching-trade-scope.js")
  );
  const fxAutoBatchSelectionSource = normalizedSource(
    path.join("backend", "fx-batching", "domain", "fx-auto-batch-selection.js")
  );
  const sendFxTradesToAutoPositionManagementSource = normalizedSource(
    path.join(
      "backend",
      "fx-position-management",
      "application",
      "send-fx-trades-to-auto-position-management-use-case.js"
    )
  );
  const fxAutoBatchingPolicySource = normalizedSource(
    path.join("backend", "fx-batching", "domain", "fx-auto-batching-policy.js")
  );
  const fxBatchingWindowPlannerSource = normalizedSource(
    path.join("backend", "fx-batching", "domain", "fx-batching-window-planner.js")
  );
  const fxBatchFormationReasonSource = normalizedSource(
    path.join("backend", "fx-batching", "domain", "fx-batch-formation-reason.js")
  );
  const clientDealGeneratorSource = normalizedSource(
    path.join("backend", "client-fx-deal", "client-fx-deal-generator.js")
  );
  const clientDealGenerationProcessSource = normalizedSource(
    path.join("backend", "client-fx-deal", "client-deal-generation-process.js")
  );
  const moneyDomainSource = normalizedSource(
    path.join("backend", "money", "money.js")
  );
  const startScript = normalizedSource("start-demo.bat");
  const nativeTableOpenings = documentHtml.match(/<table\b[^>]*>/g) || [];
  const dialogCount = (documentHtml.match(/<dialog\b/g) || []).length;
  const dialogCloseButtonCount = (
    html.match(/class="[^"]*btn-close[^"]*"[^>]*aria-label="Close"/g) || []
  ).length;
  new Function(inlineScript);
  const batchStructureColumnsSource = inlineScript.match(
    /function batchStructureTradeTypeFormatter[\s\S]*?function initializeBatchDetailsGrid/
  )?.[0] || "";
  const batchDetailsGridInitializerSource = inlineScript.match(
    /function initializeBatchDetailsGrid[\s\S]*?function renderBatchDetailsGrids/
  )?.[0] || "";
  const batchDetailsGridCss = html.match(
    /#batchDetailsPage \.batch-details-grid \{[\s\S]*?\}/
  )?.[0] || "";
  const batchDetailsPageLoaderSource = inlineScript.match(
    /async function loadBatchDetailsPage\(\)[\s\S]*?function marketGridActionMarkup/
  )?.[0] || "";

  const ids = [...documentHtml.matchAll(/\bid="([^"]+)"/g)]
    .map(match => match[1])
    .filter(id => !id.includes("${"));
  const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
  const domReferences = [...inlineScript.matchAll(/getElementById\("([^"]+)"\)/g)].map(match => match[1]);
  const addClientDealDialogMarkup = html.match(/<dialog class="client-deal-create-dialog"[\s\S]*?<\/dialog>/)?.[0] || "";
  const addHedgeDealDialogMarkup = html.match(
    /<dialog class="client-deal-create-dialog hedge-deal-create-dialog"[\s\S]*?<\/dialog>/
  )?.[0] || "";
  const hedgingSettingsPageMarkup = html.match(
    /<main class="settings-shell profile-shell unified-bootstrap-workspace workbench-page hedging-settings-page" id="hedgingSettingsPage"[\s\S]*?<\/main>/
  )?.[0] || "";
  const batchingSettingsPageMarkup = html.match(
    /<main class="settings-shell profile-shell unified-bootstrap-workspace workbench-page batching-settings-page" id="batchingSettingsPage"[\s\S]*?<\/main>/
  )?.[0] || "";
  const autoBatchingProcessFlowDialogMarkup = html.match(
    /<dialog class="market-bootstrap-dialog auto-batching-flow-dialog"[\s\S]*?<\/dialog>/
  )?.[0] || "";
  const manualBatchFormationProcessPageMarkup = html.match(
    /<main class="settings-shell profile-shell processes-shell unified-bootstrap-workspace workbench-page" id="processesPage"[\s\S]*?<\/main>/
  )?.[0] || "";
  const manualBatchFormationProcessViewMarkup = manualBatchFormationProcessPageMarkup.match(
    /<article class="profile-panel processes-details" id="manualBatchFormationProcessView"[\s\S]*?<\/article>/
  )?.[0] || "";
  const autoHedgingProcessViewMarkup = manualBatchFormationProcessPageMarkup.match(
    /<article class="profile-panel processes-details" id="autoHedgingProcessView"[\s\S]*?<\/article>/
  )?.[0] || "";
  const automationAdmissionProcessViewMarkup = manualBatchFormationProcessPageMarkup.match(
    /<article class="profile-panel processes-details" id="automationAdmissionProcessView"[\s\S]*?<\/article>/
  )?.[0] || "";
  const domainGlossaryProcessViewMarkup = manualBatchFormationProcessPageMarkup.match(
    /<article class="profile-panel processes-details" id="domainGlossaryProcessView"[\s\S]*?<\/article>/
  )?.[0] || "";
  const oneBatchTenorDialogMarkup = html.match(
    /<dialog class="market-bootstrap-dialog one-batch-tenor-dialog"[\s\S]*?<\/dialog>/
  )?.[0] || "";
  const editClientDealDialogMarkup = html.match(
    /<dialog class="client-deal-create-dialog" id="editDealDialog"[\s\S]*?<\/dialog>/
  )?.[0] || "";
  const clientDealDuplicateCheckMarkup = html.match(/<dialog class="client-deal-create-dialog client-deal-duplicate-dialog"[\s\S]*?<\/dialog>/)?.[0] || "";
  const fxPositionPageMarkup = html.match(
    /<main class="shell fx-position-bootstrap workbench-page" id="mainPage"[\s\S]*?<\/main>/
  )?.[0] || "";
  const fxPositionModeTabsMarkup = fxPositionPageMarkup.match(
    /<nav\b[^>]*id="fxPositionModeTabs"[\s\S]*?<\/nav>/
  )?.[0] || "";
  const fxPositionGridMarkup = fxPositionPageMarkup.match(
    /<table\b[^>]*class="[^"]*\bfx-position-grid\b[^"]*"[^>]*>[\s\S]*?<\/table>/
  )?.[0] || "";
  const fxPositionModeRoutingSource = inlineScript.match(
    /function fxPositionRoute\([\s\S]*?function batchingHistoryRoute/
  )?.[0] || "";
  const fxPositionModeViewSource = inlineScript.match(
    /function fxPositionRowsForMode\([\s\S]*?function updateSortButtons/
  )?.[0] || "";
  const selectedBatchSourceTradesSource = inlineScript.match(
    /function selectedBatchSourceTrades\([\s\S]*?(?=function isManualReviewTradeEligibleForAuto)/
  )?.[0] || "";
  const sendToAutoPositionModeSource = inlineScript.match(
    /function isManualReviewTradeEligibleForAuto\([\s\S]*?function oneBatchCompatibilityKey/
  )?.[0] || "";
  const fxPositionsEndpointSource = serverSource.match(
    /if \(pathname === "\/api\/v1\/fx-positions" && method === "GET"\) \{[\s\S]*?return true;\s*\}/
  )?.[0] || "";
  const fxPositionDealToolbarMarkup = fxPositionPageMarkup.match(
    /<section class="deal-toolbar\b[^"]*"[\s\S]*?<\/section>/
  )?.[0] || "";
  const batchingSummaryRendererSource = inlineScript.match(
    /function renderBatchingSummary\(source\)[\s\S]*?function clientFxDealClientCode/
  )?.[0] || "";
  const fxPositionWorkspaceMainCss = html.match(
    /#mainPage\.fx-position-bootstrap\.workbench-page \.batching-workspace-main \{([\s\S]*?)\}/
  )?.[1] || "";
  const fxPositionGridFrameCss = html.match(
    /#mainPage\.fx-position-bootstrap\.workbench-page \.fx-position-grid-frame \{([\s\S]*?)\}/
  )?.[1] || "";
  const generationSettingsDialogMarkup = html.match(
    /<dialog class="deal-dialog generation-dialog" id="clientDealGenerationDialog"[\s\S]*?<\/dialog>/
  )?.[0] || "";
  const batchToolbarMarkup = html.match(/<section class="batch-toolbar\b[^"]*"[\s\S]*?<\/section>/)?.[0] || "";
  const marketPulseIconStyles = html.match(/\.market-pulse-icon \{[\s\S]*?\n    \}/)?.[0] || "";
  const saveEditedDealFunction = inlineScript.match(
    /async function saveEditedDeal\(event\) \{[\s\S]*?\n    \}\n\n    function renderDealRow/
  )?.[0] || "";
  const reloadClientFxDealsFunction = inlineScript.match(
    /async function reloadClientFxDealsFromApi\(\) \{[\s\S]*?\n    \}/
  )?.[0] || "";
  const reloadHedgeFxDealsFunction = inlineScript.match(
    /async function reloadHedgeFxDealsFromApi\(\) \{[\s\S]*?\n    \}/
  )?.[0] || "";
  const persistCreatedClientDealFunction = inlineScript.match(
    /async function persistCreatedClientDeal\(targetDeal\) \{[\s\S]*?\n    \}(?=\n\n    async function confirmClientDealDuplicateCheck)/
  )?.[0] || "";
  const databaseTableSectionsSource = inlineScript.match(
    /const DATABASE_TABLE_SECTIONS = Object\.freeze\(\[[\s\S]*?\n    \]\);/
  )?.[0] || "";
  const clientPricingRuleFormMarkup = html.match(
    /<form\b[^>]*\bid="clientPricingRuleForm"[\s\S]*?<\/form>/
  )?.[0] || "";
  const pricingRulePositionModeOptionsSource = inlineScript.match(
    /function positionManagementModeOptions\([\s\S]*?function positionManagementModeOverrideFromControls/
  )?.[0] || "";
  const positionModeOverrideControlSource = inlineScript.match(
    /function positionManagementModeOverrideFromControls\([\s\S]*?function pricingTypePresentation/
  )?.[0] || "";
  const pricingRulePositionModeViewSource = inlineScript.match(
    /function pricingRulePositionManagementModeMarkup\([\s\S]*?function positionManagementModeOptions/
  )?.[0] || "";
  const globalPricingRuleEditorSource = inlineScript.match(
    /function renderPricingRuleEditRow\([\s\S]*?function renderPricingRuleViewRow/
  )?.[0] || "";
  const globalPricingRulePositionModeSource = inlineScript.match(
    /function pricingRuleRowPositionManagementModeOverride\([\s\S]*?function syncPricingRuleRowPreview/
  )?.[0] || "";
  const clientPricingRuleDialogPositionModeSource = inlineScript.match(
    /function clientPricingRuleDialogPositionManagementModeOverride\([\s\S]*?function clientPricingRuleDraftFromDialog/
  )?.[0] || "";
  const clientPricingRuleInlineEditorSource = inlineScript.match(
    /function clientPricingRuleInlineEditorMarkup\([\s\S]*?function renderClientExecutionContextsPanel/
  )?.[0] || "";
  const clientPricingRuleInlinePositionModeSource = inlineScript.match(
    /function clientPricingRuleInlinePositionManagementModeOverride\([\s\S]*?function clientPricingRuleFromInlineEditorRow/
  )?.[0] || "";
  const usesPricingRulePositionModeInheritanceControls =
    (html.match(/>Execution Context Default<\/span>/g) || []).length === 3
    && clientPricingRuleFormMarkup.includes('id="clientPricingRuleUseExecutionContextDefault"')
    && clientPricingRuleFormMarkup.includes('name="useExecutionContextDefault"')
    && clientPricingRuleFormMarkup.includes('aria-controls="clientPricingRulePositionManagementModeOverride"')
    && clientPricingRuleFormMarkup.includes('id="clientPricingRulePositionManagementModeOverride"')
    && clientPricingRuleFormMarkup.includes('name="positionManagementModeOverride"')
    && clientPricingRuleFormMarkup.includes('>Execution Context Default</span>')
    && globalPricingRuleEditorSource.includes('data-pricing-rule-field="useExecutionContextDefault"')
    && globalPricingRuleEditorSource.includes('data-pricing-rule-field="positionManagementModeOverride"')
    && globalPricingRuleEditorSource.includes('>Execution Context Default</span>')
    && clientPricingRuleInlineEditorSource.includes('data-client-pricing-rule-inline-field="useExecutionContextDefault"')
    && clientPricingRuleInlineEditorSource.includes('data-client-pricing-rule-inline-field="positionManagementModeOverride"')
    && clientPricingRuleInlineEditorSource.includes('>Execution Context Default</span>')
    && pricingRulePositionModeOptionsSource.includes('<option value="MANUAL"')
    && pricingRulePositionModeOptionsSource.includes('<option value="AUTO"')
    && !pricingRulePositionModeOptionsSource.includes('<option value=""')
    && positionModeOverrideControlSource.includes('return inherited ? null : override || undefined;')
    && positionModeOverrideControlSource.includes('overrideControl.required = !inherited;')
    && globalPricingRulePositionModeSource.includes(
      'return positionManagementModeOverrideFromControls(inheritControl, overrideControl);'
    )
    && globalPricingRulePositionModeSource.includes('overrideControl.disabled = inherited;')
    && clientPricingRuleDialogPositionModeSource.includes(
      'return positionManagementModeOverrideFromControls(inheritControl, overrideControl);'
    )
    && clientPricingRuleDialogPositionModeSource.includes('overrideControl.disabled = inherited;')
    && clientPricingRuleInlinePositionModeSource.includes(
      'return positionManagementModeOverrideFromControls(inheritControl, overrideControl);'
    )
    && clientPricingRuleInlinePositionModeSource.includes(
      'positionManagementModeOverrideControl.disabled = state.saving || inherited;'
    )
    && inlineScript.includes('positionManagementModeOverride: normalizedPositionManagementModeOverride(')
    && schemaSource.includes('position_management_mode_override TEXT')
    && !schemaSource.includes('use_execution_context_default')
    && !serverSource.includes('useExecutionContextDefault');

  return {
    inlineJavaScript: "OK",
    duplicateIds,
    missingDomIds: [...new Set(domReferences.filter(id => !ids.includes(id)))],
    usesSimulationSettingsEndpoint: inlineScript.includes("/simulation-settings"),
    usesBackendSimulationStream: inlineScript.includes("/market-pulse-simulation/stream"),
    usesServicingLocationsEndpoint: inlineScript.includes("/api/v1/servicing-locations"),
    usesAccountingSystemsEndpoint: inlineScript.includes("/api/v1/accounting-systems"),
    usesExecutionSystemsEndpoint: inlineScript.includes("/api/v1/execution-systems"),
    persistsReferenceDataItemsWithoutUndefinedAlias:
      inlineScript.includes("executionSystemId: item.tradeCaptureChannelId")
      && inlineScript.includes("name: item.tradeCaptureChannelName")
      && inlineScript.includes("pricingMode: item.pricingType")
      && inlineScript.includes("collection.push(item);")
      && !inlineScript.includes("persistedItem"),
    usesExecutionContextsEndpoint: inlineScript.includes("/api/v1/execution-contexts"),
    usesTradingCounterpartiesEndpoint: inlineScript.includes("/api/v1/trading-counterparties"),
    usesUsersWorkspace: inlineScript.includes("/api/v1/users")
      && html.includes('href="#users" data-workspace-route="users"')
      && html.includes('id="usersView"')
      && html.includes('class="button-icon workspace-nav-icon" aria-hidden="true">group</span>')
      && html.includes('id="usersNewButton"')
      && html.includes('data-user-header-filter="userCode"')
      && html.includes('data-user-action="edit"')
      && html.includes('data-user-action="remove"')
      && inlineScript.includes("function usersRouteStateFromLocation()"),
    usesInlineUsersEditor: inlineScript.includes("function renderUserEditRow(item, index)")
      && inlineScript.includes("function startUserRowCreate()")
      && inlineScript.includes("function saveUserFromRow(row)")
      && inlineScript.includes("data-user-edit-row")
      && inlineScript.includes('data-user-action="save"')
      && inlineScript.includes('data-user-action="cancel"')
      && inlineScript.includes('<span class="button-icon" aria-hidden="true">edit</span>')
      && inlineScript.includes('<span class="button-icon" aria-hidden="true">delete</span>'),
    usesPricingRulesEndpoint: inlineScript.includes("/api/v1/pricing-rules"),
    usesPricingRulesBootstrap: inlineScript.includes("DEMO_API_BOOTSTRAP.pricingRules"),
    usesPricingRulePositionModeInheritanceControls,
    usesFxPositionManagementPolicyConfiguration:
      schemaSource.includes("default_position_management_mode")
      && schemaSource.includes("auto_hedging_admission_mode")
      && schemaSource.includes("position_management_mode_override")
      && serverSource.includes("ensureFxPositionManagementPolicyColumns(database)")
      && serverSource.includes("effectivePositionManagementMode: resolveFxPositionManagementMode")
      && html.includes('data-ui-column-key="default_position_management_mode"')
      && html.includes('data-ui-column-key="auto_hedging_admission_mode"')
      && html.includes('data-ui-column-key="position_management_mode"')
      && html.includes('name="positionManagementModeOverride"')
      && inlineScript.includes("function effectivePositionManagementModeForRule(rule, context = null)")
      && inlineScript.includes("defaultPositionManagementMode: context.defaultPositionManagementMode")
      && inlineScript.includes("autoHedgingAdmissionMode: context.autoHedgingAdmissionMode")
      && inlineScript.includes("positionManagementModeOverride: normalizedPositionManagementModeOverride"),
    usesUiColorTokenPalette:
      schemaSource.includes("CREATE TABLE IF NOT EXISTS ui_color_tokens")
      && databaseTableSectionsSource.includes('"ui_color_tokens"')
      && html.includes('id="databaseColorPalettePanel"')
      && html.includes('id="databaseColorPalette"')
      && inlineScript.includes('tableName === "ui_color_tokens"')
      && inlineScript.includes("function renderDatabaseColorPalette(tableName, rows)")
      && html.includes(".database-color-token-swatch"),
    usesFxPositionColorPalette:
      html.includes("--palette-gray-300: #DEE2E6;")
      && html.includes("--palette-blue-500: #0D6EFD;")
      && html.includes("--app-primary: var(--palette-blue-500);")
      && html.includes("--app-process-idle: var(--palette-blue-200);")
      && html.includes("--app-process-idle-hover: var(--palette-blue-300);")
      && html.includes("--data-grid-line-color: var(--palette-gray-300);")
      && html.includes("--market-trade-bg: var(--palette-yellow-100);")
      && html.includes(".fx-position-grid .sell-head")
      && html.includes("background: rgba(var(--bs-danger-rgb), 0.055);")
      && html.includes(".fx-position-grid .buy-head")
      && html.includes("background: rgba(var(--bs-success-rgb), 0.055);"),
    usesDatabaseBackedUiTableColumnLayouts:
      schemaSource.includes("CREATE TABLE IF NOT EXISTS ui_table_column_settings")
      && uiTableLayoutsSource.includes("const UI_TABLE_LAYOUTS = Object.freeze({")
      && uiTableLayoutsSource.includes('hedge_quick_mode_settings_grid: layout("Quick Hedge Settings"')
      && uiTableLayoutsSource.includes('fx_position_grid: layout("FX Position"')
      && serverSource.includes("function ensureUiTableColumnSettings(sqlite)")
      && serverSource.includes("const uiTableColumnSettingsMatch =")
      && serverSource.includes("uiTableLayouts: Object.entries(UI_TABLE_LAYOUTS)")
      && inlineScript.includes("/api/v1/ui-table-column-settings/${encodeURIComponent")
      && databaseTableSectionsSource.includes('"ui_table_column_settings"')
      && html.includes('id="pricingRulesTableLayoutButton"')
      && html.includes('data-ui-table-layout-host="client_fx_deals_grid"')
      && html.includes('data-ui-table-layout-host="servicing_locations_grid"')
      && html.includes('data-ui-table-layout-host="fx_position_grid"')
      && html.includes('id="pricingRulesTable" data-ui-table-layout-key="pricing_rules_grid"')
      && html.includes('data-ui-table-layout-key="fx_position_grid"')
      && html.includes('data-ui-column-key="execution_context"')
      && html.includes('id="pricingRulesTableLayoutDialog"')
      && html.includes('id="pricingRulesTableLayoutSaveDefaultButton"')
      && html.includes('class="btn btn-sm btn-outline-primary with-icon" id="pricingRulesTableLayoutSaveButton"')
      && inlineScript.includes("function applyNativeUiTableLayout(tableKey, tableLayout)")
      && inlineScript.includes("function applyFxPositionGridLayout(tableLayout)")
      && inlineScript.includes("function saveUiTableLayoutAsDefault(event)")
      && inlineScript.includes('confirmation: "SAVE_AS_DEFAULT"')
      && serverSource.includes("function updateUiTableColumnDefaults(payload)")
      && serverSource.includes("uiTableColumnSettingsDefaultsMatch")
      && inlineScript.includes("function registerUiTableTabulator(tableKey, table)")
      && inlineScript.includes("async function saveUiTableLayout(event)")
      && inlineScript.includes("async function resetUiTableLayout()"),
    displaysPricingRuleCounterpartyType: serverSource.includes("counterpartyRoles")
      && html.includes('<span class="reference-column-title">Counterparty Type</span>')
      && html.includes('data-pricing-rule-header-filter="counterpartyType"')
      && inlineScript.includes("counterpartyRoles: normalizedCounterpartyRoles(")
      && inlineScript.includes("data-pricing-rule-counterparty-type")
      && inlineScript.includes("counterpartyTypeForInn(rule.inn)"),
    embedsPricingModeInPricingRuleExecutionContext: serverSource.includes("e.pricing_mode AS pricingMode")
      && !html.includes('data-pricing-rule-header-filter="pricingMode"')
      && !html.includes('<col data-ui-column-key="pricing_mode">\n              <col data-ui-column-key="position_management_mode">')
      && inlineScript.includes("pricingMode: sourcePricingMode")
      && inlineScript.includes("pricingContextFacetsMarkup(rule.pricingContextId, { executionSystemLabel: true })"),
    usesDealerPricedClientDealRules: serverSource.includes('function clientDealPricingRules()')
      && serverSource.includes('pricingRules("DEALER_PRICED")')
      && serverSource.includes('pathname === "/api/v1/client-deal-pricing-rules"')
      && addClientDealDialogMarkup.includes('id="addClientDealPricingMode" aria-readonly="true" disabled')
      && addClientDealDialogMarkup.includes('<option value="DEALER_PRICED">DEALER_PRICED</option>')
      && addClientDealDialogMarkup.includes('client-deal-pricing-mode-icon is-dealer-priced')
      && addClientDealDialogMarkup.includes('aria-label="Dealer Priced"')
      && addClientDealDialogMarkup.includes('aria-hidden="true">contact_phone</span>')
      && inlineScript.includes("function selectedAddClientDealPricingMode()")
      && inlineScript.includes("return clientPricingRules")
      && inlineScript.includes('pricingModeForRule(rule) === pricingMode')
      && !inlineScript.includes("clientDealEligiblePricingRules"),
    usesClientFxDealsEndpoint: serverSource.includes('pathname === "/api/v1/client-fx-deals"')
      && serverSource.includes('r.margin_percent AS pricingRuleMargin')
      && serverSource.includes('LEFT JOIN pricing_rules r ON r.pricing_rule_id = d.pricing_rule_id')
      && serverSource.includes('calculateClientFxDealEconomics')
      && serverSource.includes('function clientFxDealWithCalculatedEconomics(payload, exposureAmounts)')
      && serverSource.includes('clientFxDealWithCalculatedEconomics(validation, exposureAmounts)')
      && inlineScript.includes("DEMO_API_BOOTSTRAP.clientFxDeals"),
    usesHedgeFxDealsEndpoint: serverSource.includes('pathname === "/api/v1/hedge-fx-deals"')
      && serverSource.includes("function hedgeFxDeals()")
      && serverSource.includes("FROM fx_hedge_deals d")
      && serverSource.includes('"HEDGE_FX_DEAL_IMMUTABLE"')
      && !serverSource.includes("function deleteHedgeFxDeal(tradeId)")
      && inlineScript.includes("DEMO_API_BOOTSTRAP.hedgeFxDeals"),
    usesDedicatedAddHedgeDealFlow: addHedgeDealDialogMarkup.includes('id="addHedgeDealDialog"')
      && addHedgeDealDialogMarkup.includes('id="addHedgeDealForm"')
      && addHedgeDealDialogMarkup.includes('name="pricingRuleId"')
      && addHedgeDealDialogMarkup.includes('name="side"')
      && addHedgeDealDialogMarkup.includes('for="addHedgeDealSide">Our Side</label>')
      && addHedgeDealDialogMarkup.includes('<select class="form-select" id="addHedgeDealSide" required>')
      && addHedgeDealDialogMarkup.includes('<option value="">Select...</option>')
      && addHedgeDealDialogMarkup.includes('name="baseCcyAmount"')
      && addHedgeDealDialogMarkup.includes('name="quoteCcyAmount"')
      && addHedgeDealDialogMarkup.includes('name="tradeRate"')
      && addHedgeDealDialogMarkup.includes('name="tenor"')
      && addHedgeDealDialogMarkup.includes('id="addHedgeDealMarketPulse"')
      && addHedgeDealDialogMarkup.includes('name="analyticalPnl"')
      && addHedgeDealDialogMarkup.includes('name="amountFixingCurrency" value="base"')
      && (addHedgeDealDialogMarkup.match(/data-add-hedge-deal-fixing-currency=/g) || []).length === 2
      && !addHedgeDealDialogMarkup.includes("Net Difference")
      && addHedgeDealDialogMarkup.includes('id="addHedgeDealPricingMode" required')
      && addHedgeDealDialogMarkup.includes('<option value="DEALER_PRICED">DEALER_PRICED</option>')
      && addHedgeDealDialogMarkup.includes('<option value="AUTO_PRICED">AUTO_PRICED</option>')
      && !addHedgeDealDialogMarkup.includes("DEALER_APPROVED")
      && addHedgeDealDialogMarkup.includes('id="addHedgeDealDialogTitle">Add Hedge Deal</h2>')
      && !addHedgeDealDialogMarkup.includes("Hedge Deal - Manual")
      && !addHedgeDealDialogMarkup.includes("Hedge Deal - Auto Pricing")
      && addHedgeDealDialogMarkup.includes('id="addHedgeDealPricingModeIcon"')
      && inlineScript.includes("function syncAddHedgeDealPricingModeIcon()")
      && inlineScript.includes("presentation.icon")
      && inlineScript.includes("function openAddHedgeDealDialog(")
      && inlineScript.includes('pricingMode = "DEALER_PRICED"')
      && inlineScript.includes("addHedgeDealPricingModeControl.value = normalizedPricingMode;")
      && inlineScript.includes("function selectedAddHedgeDealPricingMode()")
      && inlineScript.includes("const ourSide = oppositeFxSide(positionSide);")
      && inlineScript.includes("addHedgeDealSideControl.innerHTML = `\n        <option value=\"\">Select...</option>")
      && inlineScript.includes("addHedgeDealForm.elements.side.value = oppositeFxSide(normalizedOurSide);")
      && inlineScript.includes("oppositeFxSide(addHedgeDealSideControl.value)")
      && inlineScript.includes('"/api/v1/hedge-fx-deals/auto-priced"')
      && inlineScript.includes('"/api/v1/hedge-fx-deals"')
      && inlineScript.includes('selectedAddHedgeDealPricingMode() === "AUTO_PRICED"')
      && inlineScript.includes("tradeRateInput.readOnly = autoPriced;")
      && inlineScript.includes('ourSide === "SELL"')
      && inlineScript.includes('document.getElementById("addHedgeDealMarketBid").value')
      && inlineScript.includes('document.getElementById("addHedgeDealMarketOffer").value')
      && inlineScript.includes("if (!autoPriced) {")
      && inlineScript.includes("requestBody.tradeRate = tradeRate;")
      && inlineScript.includes("function syncAddHedgeDealAmounts()")
      && inlineScript.includes("function addHedgeDealExactAmounts()")
      && inlineScript.includes("dealtCcyAmount,")
      && !inlineScript.includes("baseCcyAmount,\n            tradeRate,")
      && inlineScript.includes("function selectAddHedgeDealAmountFixingCurrency(event)")
      && inlineScript.includes('addHedgeDealForm.addEventListener("click", selectAddHedgeDealAmountFixingCurrency)')
      && inlineScript.includes("async function reloadHedgeFxDealsFromApi()"),
    usesQuickHedgeMode:
      serverSource.includes('pathname === "/api/v1/hedge-quick-mode-settings"')
      && serverSource.includes('pathname === "/api/v1/hedge-fx-deals/quick-mode"')
      && serverSource.includes("function validateHedgeQuickModeDealPayload(body)")
      && serverSource.includes("hedgeQuickModeSettings: hedgeQuickModeSettings(),")
      && inlineScript.includes("DEMO_API_BOOTSTRAP.hedgeQuickModeSettings")
      && inlineScript.includes('demoApiRequest("/api/v1/hedge-quick-mode-settings")')
      && fxPositionPageMarkup.includes('id="hedgeQuickModeToolbar"')
      && /<section class="table-wrap fx-position-grid-frame"[\s\S]*?<\/section>\s*<section class="hedge-toolbar btn-toolbar"[\s\S]*?id="hedgeQuickModeToolbar"/.test(
        fxPositionPageMarkup
      )
      && inlineScript.includes("function renderHedgeQuickModeToolbar()")
      && inlineScript.includes("function hedgeQuickModeToolbarStructureSignature(")
      && inlineScript.includes("function syncHedgeQuickModeToolbarQuote(")
      && inlineScript.includes("hedgeQuickModeToolbarSignature === structureSignature")
      && inlineScript.includes('data-hedge-quick-quote="bid"')
      && inlineScript.includes('data-hedge-quick-quote="offer"')
      && inlineScript.includes("function syncHedgeQuickModeQuoteAlignment()")
      && inlineScript.includes("scheduleHedgeQuickModeQuoteAlignment")
      && inlineScript.includes('data-hedge-quick-preset')
      && inlineScript.includes('class="btn btn-sm hedge-quick-preset')
      && !inlineScript.includes('btn-outline-secondary hedge-quick-preset')
      && html.includes('--bs-btn-hover-color: var(--bs-btn-color);')
      && html.includes('--bs-btn-active-color: var(--bs-btn-color);')
      && html.includes('transparent 80%')
      && html.includes('var(--bs-btn-bg) 88%')
      && html.includes('.hedge-quick-action-sell {')
      && html.includes('--bs-btn-bg: rgba(var(--bs-danger-rgb), 0.055);')
      && html.includes('.hedge-quick-action-buy {')
      && html.includes('--bs-btn-bg: rgba(var(--bs-success-rgb), 0.055);')
      && !/#mainPage\.fx-position-bootstrap\.workbench-page \.hedge-quick-action(?:-sell|-buy)? \{[^}]*\bbackground\s*:/.test(html)
      && inlineScript.includes('data-hedge-quick-action')
      && inlineScript.includes('hedgeQuickModeBoundaryMarkup("start")')
      && inlineScript.includes('hedgeQuickModeBoundaryMarkup("end")')
      && inlineScript.includes('hedgeQuickModeUnlocked ? "lock_open" : "lock"')
      && inlineScript.includes("function setHedgeQuickModeUnlocked(")
      && inlineScript.includes('document.addEventListener("keydown", event => {')
      && inlineScript.includes('document.addEventListener("keyup", event => {')
      && inlineScript.includes('window.addEventListener("blur", () => setHedgeQuickModeUnlocked(false))')
      && inlineScript.includes("!controlConfirmed || !hedgeQuickModeUnlocked")
      && html.includes(".hedge-quick-boundary-start")
      && html.includes(".hedge-quick-boundary-end")
      && html.includes(".hedge-quick-toolbar.is-unlocked")
      && inlineScript.includes('class="hedge-quick-execution"')
      && inlineScript.includes("configured price stream")
      && inlineScript.includes('const tooltip = disabled ? "" : "Hold Ctrl and click";')
      && !inlineScript.includes('data-tooltip="Configured price stream Bid"')
      && !inlineScript.includes('data-tooltip="Configured price stream Offer"')
      && !inlineScript.includes(' at ${marketSide} ${rate}')
      && !html.includes("hedge-quick-quote-icon")
      && !batchingSummaryRendererSource.includes('data-hedge-quick-')
      && !inlineScript.includes('data-hedge-quick-menu')
      && !html.includes(".hedge-deal-quick-menu")
      && inlineScript.includes("async function createQuickHedgeDeal(ourSide, presetCode)")
      && inlineScript.includes(
        'demoApiRequest("/api/v1/hedge-fx-deals/quick-mode"'
      )
      && inlineScript.includes("side: oppositeFxSide(normalizedOurSide)")
      && inlineScript.includes("if (hedgeQuickModeDealCreating)")
      && inlineScript.includes("!event.ctrlKey")
      && inlineScript.includes("Hold Ctrl")
      && /event\.key\s*[!=]==?\s*"Enter"/.test(inlineScript)
      && /hedgeQuickModeToolbar\.addEventListener\(\s*"click"/.test(inlineScript)
      && /hedgeQuickModeToolbar\.addEventListener\(\s*"keydown"/.test(inlineScript),
    usesHedgeQuickModeSettingsEditor:
      fxPositionPageMarkup.includes('id="hedgeQuickModeSettingsButton"')
      && fxPositionPageMarkup.includes('aria-label="Hedging Settings"')
      && fxPositionPageMarkup.includes('class="batch-control hedge-toolbar-settings"')
      && hedgingSettingsPageMarkup.includes(
        '<h1 class="settings-title">Hedging Settings</h1>'
      )
      && hedgingSettingsPageMarkup.includes(
        'id="hedgeQuickModeSettingsHeader" hidden'
      )
      && !hedgingSettingsPageMarkup.includes(
        'id="hedgeQuickModeSettingsTitle">Quick Hedge Settings</h2>'
      )
      && hedgingSettingsPageMarkup.includes(
        '<h3 class="table-panel__title">Quick Hedge Settings</h3>'
      )
      && hedgingSettingsPageMarkup.includes(
        'id="hedgeQuickModeSettingsCurrencyPair" name="currencyPair"'
      )
      && hedgingSettingsPageMarkup.includes(
        'id="hedgeQuickModePricingMode" name="pricingMode" aria-readonly="true" disabled'
      )
      && hedgingSettingsPageMarkup.includes(
        '<option value="AUTO_PRICED">AUTO_PRICED</option>'
      )
      && hedgingSettingsPageMarkup.includes(
        'pricing-mode-indicator client-deal-pricing-mode-icon is-auto-priced'
      )
      && hedgingSettingsPageMarkup.includes(
        'id="hedgeQuickModeSettingsOverview"'
      )
      && hedgingSettingsPageMarkup.includes(
        'id="hedgeQuickModeSettingsGrid"'
      )
      && hedgingSettingsPageMarkup.includes(
        'id="hedgeQuickModeSettingsNewButton"'
      )
      && hedgingSettingsPageMarkup.includes(
        'id="hedgeQuickModeSettingsEditor" hidden'
      )
      && hedgingSettingsPageMarkup.includes(
        'id="hedgeQuickModeCounterpartyId" name="counterpartyId"'
      )
      && hedgingSettingsPageMarkup.includes('name="pricingRuleId"')
      && (hedgingSettingsPageMarkup.match(/name="(?:small|medium|large|xlarge)BaseCcyAmount"/g) || []).length === 4
      && hedgingSettingsPageMarkup.includes('name="defaultTenor"')
      && hedgingSettingsPageMarkup.includes('name="active"')
      && inlineScript.includes('function hedgingSettingsRoute()')
      && inlineScript.includes('function isHedgingSettingsRoute()')
      && inlineScript.includes('async function loadHedgingSettingsPage()')
      && /function applyInitialPageMode\(\)[\s\S]*?if \(isHedgingSettingsRoute\(\)\)[\s\S]*?loadHedgingSettingsPage\(\)/.test(inlineScript)
      && /hedgeQuickModeSettingsButton\.addEventListener\("click",[\s\S]*?location\.hash = hedgingSettingsRoute\(\)/.test(inlineScript)
      && inlineScript.includes("function hedgeQuickModeCounterpartyProfiles()")
      && inlineScript.includes("function selectedHedgeQuickModePricingMode()")
      && inlineScript.includes('return pricingMode === "AUTO_PRICED" ? pricingMode : "";')
      && inlineScript.includes("function hedgeQuickModeEligiblePricingRules()")
      && inlineScript.includes("isHedgeDealPricingRule(rule, pricingMode)")
      && inlineScript.includes("hedgeQuickModeEligiblePricingRules().map")
      && inlineScript.includes("function initializeHedgeQuickModeSettingsGrid(data)")
      && inlineScript.includes("function renderHedgeQuickModeSettingsOverview()")
      && inlineScript.includes("pricingContextFacetsMarkup(setting.context, { executionSystemLabel: true })")
      && inlineScript.includes("function openHedgeQuickModeSettingsEditor(setting = null)")
      && inlineScript.includes("function hedgeQuickModeUnconfiguredPairs()")
      && inlineScript.includes("function renderHedgeQuickModePricingRules()")
      && inlineScript.includes("async function saveHedgeQuickModeSettings(event)")
      && inlineScript.includes("async function deleteHedgeQuickModeSettings()")
      && inlineScript.includes("counterpartyId: counterparty.counterpartyId")
      && serverSource.includes("rule.counterpartyId !== payload.counterpartyId")
      && schemaSource.includes(
        "FOREIGN KEY (pricing_rule_id, counterparty_id, ccy_pair_code)"
      ),
    usesFxAutoBatchingSettings:
      schemaSource.includes("CREATE TABLE IF NOT EXISTS fx_batching_settings")
      && schemaSource.includes("CREATE TABLE IF NOT EXISTS fx_auto_batching_settings")
      && schemaSource.includes("CREATE TABLE IF NOT EXISTS fx_auto_batching_ccy_pairs")
      && serverSource.includes("function ensureFxBatchingSettings(sqlite)")
      && serverSource.includes("function fxBatchingSettings()")
      && serverSource.includes('pathname === "/api/v1/fx-batching-settings"')
      && serverSource.includes("fxBatchingSettings: fxBatchingSettings()")
      && serverSource.includes("function ensureFxAutoBatchingSettings(sqlite)")
      && serverSource.includes("function fxAutoBatchingSettings()")
      && serverSource.includes('pathname === "/api/v1/fx-auto-batching-settings"')
      && serverSource.includes("fxAutoBatchingSettings: fxAutoBatchingSettings()")
      && batchingSettingsPageMarkup.includes(">Batching Settings</h1>")
      && batchingSettingsPageMarkup.includes(">Manual Batch Settings</span>")
      && batchingSettingsPageMarkup.includes(">Auto Batching Settings</span>")
      && batchingSettingsPageMarkup.includes('id="manualBatchingProcessFlowLink"')
      && batchingSettingsPageMarkup.includes('name="allowCrossTenorBatching"')
      && batchingSettingsPageMarkup.includes('value="true" disabled>Yes (In Development)</option>')
      && batchingSettingsPageMarkup.includes('name="maxIntervalSeconds"')
      && batchingSettingsPageMarkup.includes('name="maxTransferRateSpreadPercent"')
      && batchingSettingsPageMarkup.includes('id="autoBatchingEligibleCcyPairCodes"')
      && batchingSettingsPageMarkup.includes('id="autoBatchingEligibleCcyPairSearch"')
      && batchingSettingsPageMarkup.includes('id="autoBatchingEligibleCcyPairCount"')
      && batchingSettingsPageMarkup.includes('class="batching-settings-actions profile-form-actions"')
      && inlineScript.includes('name="eligibleCcyPairCodes"')
      && inlineScript.includes("function filterAutoBatchingEligibleCcyPairOptions()")
      && batchingSettingsPageMarkup.includes('name="tenorCompatibilityMode"')
      && batchingSettingsPageMarkup.includes(">Auto Batching Settings</h2>")
      && batchingSettingsPageMarkup.includes(">Tenor Compatibility</h3>")
      && batchingSettingsPageMarkup.includes(">Batching Window Close Triggers</h3>")
      && batchingSettingsPageMarkup.includes(">Maximum Batching Interval</span>")
      && batchingSettingsPageMarkup.includes(">Default Transfer Rate Corridor</span>")
      && autoBatchingProcessFlowDialogMarkup.includes(
        ">AutoBatch Process Starts</div>"
      )
      && autoBatchingProcessFlowDialogMarkup.includes(">Captured / Logged</span>")
      && manualBatchFormationProcessPageMarkup.includes(
        ">Manual Batching</h2>"
      )
      && manualBatchFormationProcessPageMarkup.includes(">Process Catalog</h1>")
      && !manualBatchFormationProcessPageMarkup.includes(">Process Catalog</h2>")
      && manualBatchFormationProcessPageMarkup.includes(
        ">Create the FX Batch Aggregate</div>"
      )
      && manualBatchFormationProcessPageMarkup.includes(
        'aria-label="Manual Batching process map"'
      )
      && manualBatchFormationProcessPageMarkup.includes(
        'aria-label="Process goal"'
      )
      && manualBatchFormationProcessPageMarkup.includes(
        '>Process goal:</span>'
      )
      && !manualBatchFormationProcessPageMarkup.includes('data-process-catalog-view="auto-hedging"')
      && !manualBatchFormationProcessPageMarkup.includes('data-process-catalog-view="admission"')
      && !manualBatchFormationProcessPageMarkup.includes('data-process-catalog-group="auto-hedging"')
      && !manualBatchFormationProcessPageMarkup.includes('href="#processes:auto-hedging"')
      && !manualBatchFormationProcessPageMarkup.includes('href="#processes:auto-hedging-admission"')
      && autoHedgingProcessViewMarkup === ""
      && automationAdmissionProcessViewMarkup === ""
      && !html.includes(".auto-hedging-subcatalog-link")
      && !html.includes(".automation-admission-summary")
      && manualBatchFormationProcessPageMarkup.includes(
        'href="#processes:domain-glossary" data-process-catalog-view="glossary"'
      )
      && domainGlossaryProcessViewMarkup.includes(
        'id="domainGlossaryTitle" data-process-copy="domainGlossary">Domain Glossary</h2>'
      )
      && domainGlossaryProcessViewMarkup.includes('<dt>FX Position</dt>')
      && !domainGlossaryProcessViewMarkup.includes('href="#fx-position"')
      && domainGlossaryProcessViewMarkup.includes('id="process-term-auto-hedging"')
      && domainGlossaryProcessViewMarkup.includes('id="process-term-auto-hedging-admission"')
      && domainGlossaryProcessViewMarkup.includes('id="process-term-execution-context-admission-mode"')
      && domainGlossaryProcessViewMarkup.includes('id="process-term-auto-hedging-admission-policy"')
      && domainGlossaryProcessViewMarkup.includes('id="process-term-eligibility-check"')
      && domainGlossaryProcessViewMarkup.includes('id="process-term-admission-state"')
      && domainGlossaryProcessViewMarkup.includes('id="process-term-ccy-pair"')
      && domainGlossaryProcessViewMarkup.includes('id="process-term-fx-batch"')
      && domainGlossaryProcessViewMarkup.includes('id="process-term-batching"')
      && domainGlossaryProcessViewMarkup.includes('id="process-term-fx-trade"')
      && domainGlossaryProcessViewMarkup.includes('id="process-term-client-deal"')
      && domainGlossaryProcessViewMarkup.includes('id="process-term-hedge-deal"')
      && domainGlossaryProcessViewMarkup.includes('id="process-term-fx-position"')
      && domainGlossaryProcessViewMarkup.includes('id="process-term-execution-context"')
      && domainGlossaryProcessViewMarkup.includes('id="process-term-servicing-location"')
      && domainGlossaryProcessViewMarkup.includes('id="process-term-accounting-system"')
      && domainGlossaryProcessViewMarkup.includes('id="process-term-execution-system"')
      && domainGlossaryProcessViewMarkup.includes('id="process-term-pricing-mode"')
      && domainGlossaryProcessViewMarkup.includes('id="process-term-market-pulse"')
      && domainGlossaryProcessViewMarkup.includes('id="process-term-base-currency"')
      && domainGlossaryProcessViewMarkup.includes('id="process-term-quote-currency"')
      && domainGlossaryProcessViewMarkup.includes('id="process-term-trade-date"')
      && domainGlossaryProcessViewMarkup.includes('id="process-term-tenor"')
      && domainGlossaryProcessViewMarkup.includes('id="process-term-value-date"')
      && domainGlossaryProcessViewMarkup.includes('id="process-term-batching-key"')
      && domainGlossaryProcessViewMarkup.includes('id="process-term-cross-tenor-batching"')
      && domainGlossaryProcessViewMarkup.includes('id="process-term-batch-internal-swap"')
      && !manualBatchFormationProcessViewMarkup.includes('class="manual-process-definitions"')
      && manualBatchFormationProcessViewMarkup.includes(
        '>Stage goal:</span>'
      )
      && manualBatchFormationProcessViewMarkup.includes(
        'data-process-copy="selectedFxTrades" data-process-linked-copy>Selected FX Trades</span>'
      )
      && manualBatchFormationProcessViewMarkup.includes(
        'data-process-copy="formedFxBatch" data-process-linked-copy>Formed FX Batch</span>'
      )
      && manualBatchFormationProcessViewMarkup.includes(
        'data-process-copy="fxPositionUnchanged" data-process-linked-copy>FX Position unchanged</span>'
      )
      && !manualBatchFormationProcessPageMarkup.includes(
        'Saved together or not at all'
      )
      && manualBatchFormationProcessPageMarkup.includes(
        'data-manual-process-stage="select"'
      )
      && manualBatchFormationProcessPageMarkup.includes(
        'data-process-copy="selectFxTrades">FX Trade Selection for FX Batch Formation</span>'
      )
      && !manualBatchFormationProcessPageMarkup.includes(
        'data-process-copy="eligibleTradeSnapshot"'
      )
      && manualBatchFormationProcessPageMarkup.includes(
        'data-manual-process-stage="commit"'
      )
      && manualBatchFormationProcessPageMarkup.includes(
        'id="manualProcessInspector"'
      )
      && manualBatchFormationProcessPageMarkup.includes('data-process-language="en"')
      && manualBatchFormationProcessPageMarkup.includes('data-process-language="ru"')
      && manualBatchFormationProcessPageMarkup.includes('data-process-copy="pageTitle"')
      && manualBatchFormationProcessPageMarkup.includes(
        '<details class="processes-technical-details" hidden aria-hidden="true">'
      )
      && manualBatchFormationProcessPageMarkup.includes("<code>selectedTradeIds</code>")
      && manualBatchFormationProcessPageMarkup.includes("<code>tradeIds</code>")
      && inlineScript.includes("const MANUAL_BATCH_PROCESS_STAGES")
      && inlineScript.includes("const MANUAL_BATCH_PROCESS_STAGES_RU")
      && inlineScript.includes("function setProcessCatalogLanguage")
      && inlineScript.includes("position.processCatalogLanguage")
      && inlineScript.includes('manualBatching: "Ручной Batching"')
      && inlineScript.includes('selectedFxTrades: "Выбранные FX Trades"')
      && inlineScript.includes('selectFxTrades: "Выбор FX Trades для создания FX Batch"')
      && inlineScript.includes("Зафиксировать корректный набор FX Trades, выбранных пользователем в FX Position, для создания FX Batch.")
      && inlineScript.includes("Получить выбранные FX Trades из FX Position.")
      && inlineScript.includes("Сопоставить selectedTradeIds со строками, отображаемыми для выбранной валютной пары.")
      && inlineScript.includes("function renderManualBatchProcessInspector")
      && inlineScript.includes("function setManualProcessLinkedText")
      && inlineScript.includes('element.hasAttribute("data-process-linked-copy")')
      && inlineScript.includes("function linkDomainGlossaryDefinitions")
      && inlineScript.includes('excludeTermKey = ""')
      && inlineScript.includes('termKey === "batching" || termKey === "value-date"')
      && inlineScript.indexOf('{ text: "Market Pulse", key: "market-pulse" }')
        > inlineScript.indexOf("const MANUAL_PROCESS_TERM_REFERENCES")
      && inlineScript.includes('{ text: "Auto Hedging", key: "auto-hedging" }')
      && inlineScript.includes('{ text: "Servicing Location", key: "servicing-location" }')
      && inlineScript.includes('{ text: "Accounting System", key: "accounting-system" }')
      && inlineScript.includes('{ text: "Execution Context", key: "execution-context" }')
      && inlineScript.includes('{ text: "Execution System", key: "execution-system" }')
      && inlineScript.includes('{ text: "Pricing Mode", key: "pricing-mode" }')
      && inlineScript.includes('{ text: "Cross-Tenor Batching", key: "cross-tenor-batching" }')
      && inlineScript.includes('{ text: "Batch Internal Swap", key: "batch-internal-swap" }')
      && inlineScript.includes('{ text: "Base Currency", key: "base-currency" }')
      && inlineScript.includes('{ text: "Quote Currency", key: "quote-currency" }')
      && inlineScript.includes('{ text: "Trade Date", key: "trade-date" }')
      && inlineScript.includes('{ text: "Value Date", key: "value-date" }')
      && !inlineScript.includes('{ text: "Batch", key: "fx-batch" }')
      && !inlineScript.includes('{ text: "FX-сделка", key: "fx-trade" }')
      && inlineScript.includes("linkDomainGlossaryDefinitions();")
      && !inlineScript.includes("function highlightAutomationAdmissionTechnicalTokens()")
      && inlineScript.includes('{ text: "Execution Context Admission Mode", key: "execution-context-admission-mode" }')
      && inlineScript.includes('{ text: "Auto Hedging Admission Policy", key: "auto-hedging-admission-policy" }')
      && inlineScript.includes('{ text: "Eligibility Check", key: "eligibility-check" }')
      && inlineScript.includes('{ text: "Ccy Pair", key: "ccy-pair" }')
      && inlineScript.includes("function showManualProcessDefinition")
      && inlineScript.includes("function domainGlossaryRoute")
      && !inlineScript.includes('return "#processes:auto-hedging";')
      && !inlineScript.includes('return "#processes:auto-hedging-admission";')
      && !inlineScript.includes('return "#processes:automation-admission";')
      && inlineScript.includes("function isDomainGlossaryRoute")
      && inlineScript.includes("function isProcessCatalogRoute")
      && inlineScript.includes("function renderProcessCatalogRoute")
      && inlineScript.includes("function isManualProcessTermBoundary")
      && inlineScript.includes("function isManualProcessQuotedLabel")
      && inlineScript.includes("isManualProcessQuotedLabel(value, index, term.text.length)")
      && inlineScript.includes("dataset.processTermReference")
      && !inlineScript.includes('node.addEventListener("pointerenter"')
      && !inlineScript.includes('node.addEventListener("pointerleave"')
      && !inlineScript.includes('node.addEventListener("focus"')
      && !inlineScript.includes('node.addEventListener("blur"')
      && inlineScript.includes('node.addEventListener("click"')
      && html.includes('data-workspace-route="processes"')
      && !html.includes('id="manualBatchingProcessFlowDialog"')
      && inlineScript.includes("function manualBatchFormationProcessRoute()")
      && inlineScript.includes("function isManualBatchFormationProcessRoute()")
      && !inlineScript.includes("function autoHedgingRoute()")
      && !inlineScript.includes("function isAutoHedgingRoute()")
      && !inlineScript.includes("autoHedgingProcessView")
      && !inlineScript.includes("function automationAdmissionRoute()")
      && !inlineScript.includes("function isAutomationAdmissionRoute()")
      && !inlineScript.includes("automationAdmissionProcessView")
      && batchingSettingsPageMarkup.includes('id="autoBatchingSettingsSaveButton"')
      && inlineScript.includes("function batchingSettingsRoute()")
      && inlineScript.includes("function isBatchingSettingsRoute()")
      && inlineScript.includes("async function loadBatchingSettingsPage()")
      && inlineScript.includes("async function saveBatchingSettings(event)")
      && inlineScript.includes("async function saveAutoBatchingSettings(event)")
      && fxPositionPageMarkup.includes('id="autoBatchingSettingsButton"')
      && /autoBatchingSettingsButton\.addEventListener\("click",[\s\S]*?location\.hash = batchingSettingsRoute\(\)/.test(inlineScript)
      && /class="batch-control batch-toolbar-settings"[\s\S]*?id="autoBatchingSettingsButton"/.test(batchToolbarMarkup),
    usesFxAutoBatchingProcess:
      fxAutoBatchingProcessSource.includes("class FxAutoBatchingProcess")
      && fxAutoBatchingProcessSource.includes("scheduleNextCycle(")
      && fxAutoBatchingProcessSource.includes("batchingInProgress")
      && fxAutoBatchingProcessSource.includes("requestEvaluation()")
      && fxAutoBatchingProcessSource.includes("nextEvaluationDelayMs")
      && fxAutoBatchingProcessSource.includes("WAITING_FOR_FIRST_TRADE")
      && fxAutoBatchingProcessSource.includes("getLatestTradeId")
      && fxAutoBatchingProcessSource.includes("afterTradeId")
      && fxAutoBatchingProcessSource.includes("keepTradesUnderManualControl")
      && !fxAutoBatchingProcessSource.includes("setIntervalFn")
      && fxAutoBatchingTradeScopeSource.includes("function currentFxPositionMode(trade)")
      && fxAutoBatchingTradeScopeSource.includes("function wasReleasedFromManualControl(trade)")
      && fxAutoBatchingTradeScopeSource.includes('currentFxPositionMode(trade) === "AUTO"')
      && fxAutoBatchingTradeScopeSource.includes(
        "tradeId > startBoundaryTradeId || releasedFromManualControl"
      )
      && fxAutoBatchingTradeScopeSource.includes("positionManagementModeChangedAt")
      && fxAutoBatchSelectionSource.includes("batchingKey")
      && fxAutoBatchingPolicySource.includes("function planFxAutoBatching(")
      && fxAutoBatchingPolicySource.includes("DEFAULT_MIN_TRADES_PER_AUTO_BATCH = 2")
      && fxAutoBatchingPolicySource.includes("TRANSFER_RATE_CORRIDOR_BREACHED")
      && fxAutoBatchingPolicySource.includes("MAX_INTERVAL_REACHED")
      && fxAutoBatchingPolicySource.includes("nextArrivalAtMilliseconds")
      && fxBatchingWindowPlannerSource.includes("FX_BATCHING_WINDOW_STATUS")
      && fxBatchingWindowPlannerSource.includes("incomingAtMilliseconds >= deadlineAtMilliseconds")
      && fxBatchingWindowPlannerSource.includes("before its Received Timestamp")
      && fxBatchFormationReasonSource.includes("MANUAL_SELECTION")
      && fxAutoBatchingProcessSource.includes("lastCandidatePairCount")
      && fxAutoBatchingProcessSource.includes("for (const candidate of candidates)")
      && serverSource.includes("new FxAutoBatchingProcess")
      && serverSource.includes("planFxAutoBatching({")
      && serverSource.includes("fxAutoBatchingProcess.notifyTradeCreated()")
      && serverSource.includes("fxAutoBatchingProcess.keepTradesUnderManualControl(")
      && serverSource.includes('pathname === "/api/v1/fx-auto-batching/process"')
      && serverSource.includes('pathname === "/api/v1/fx-auto-batching/process/start"')
      && serverSource.includes('pathname === "/api/v1/fx-auto-batching/process/stop"')
      && serverSource.includes("fxAutoBatchingProcess: fxAutoBatchingProcess.status()")
      && inlineScript.includes("async function toggleFxAutoBatchingProcess()")
      && inlineScript.includes("async function refreshFxAutoBatchingProcess()")
      && inlineScript.includes("is waiting for the first new Trade")
      && inlineScript.includes(
        'autoBatchButton.addEventListener("click", toggleFxAutoBatchingProcess)'
      ),
    usesCompactHedgingSettingsLayout:
      /#hedgingSettingsPage\.unified-bootstrap-workspace\.workbench-page \.hedging-settings-panel \{[\s\S]*?width: fit-content;[\s\S]*?max-width: 100%;/.test(html)
      && html.includes(
        "#hedgingSettingsPage.unified-bootstrap-workspace.workbench-page .hedge-quick-settings-grid .tabulator {"
      )
      && html.includes("width: fit-content;")
      && html.includes("min-width: 0;")
      && html.includes(
        ".hedge-quick-settings-grid .tabulator-tableholder {"
      )
      && html.includes("height: auto !important;")
      && html.includes(
        "border: var(--data-grid-line-width) solid var(--data-grid-line-color);"
      )
      && html.includes(
        "#hedgingSettingsPage.unified-bootstrap-workspace.workbench-page .hedge-quick-settings-grid .tabulator-col-title {"
      )
      && inlineScript.includes("rowHeight: 36")
      && /tabulatorSizedColumn\("contextPath",\s*\{\s*title: "Execution Context",\s*field: "contextPath",\s*formatter: hedgeQuickModeSettingsContextFormatter/.test(inlineScript)
      && /tabulatorSizedColumn\("compactActions",\s*\{\s*title: "Actions"/.test(inlineScript)
      && html.includes("#hedgeQuickModeSettingsNewButton:disabled {")
      && html.includes(".app-status-token.is-active {")
      && inlineScript.includes("applicationStatusTokenMarkup(cell.getValue())"),
    usesHedgeCounterpartyPricingRules: serverSource.includes("function eligibleHedgeDealPricingRules(pricingMode)")
      && serverSource.includes('new Set(["AUTO_PRICED", "DEALER_PRICED"])')
      && serverSource.includes('tradingCounterpartyHasRole(counterparty, "HEDGE_COUNTERPARTY")')
      && serverSource.includes("pricingRules(normalizedPricingMode).filter(rule =>")
      && serverSource.includes('pathname === "/api/v1/hedge-deal-pricing-rules"')
      && serverSource.includes('url.searchParams.get("pricingMode")')
      && serverSource.includes("...autoPricedHedgeDealPricingRules()")
      && serverSource.includes("createHedgeFxDealTerms")
      && serverSource.includes("hedgeFxDealWithCalculatedTerms(payload, exposureAmounts)")
      && inlineScript.includes('function isHedgeDealPricingRule(rule, pricingMode)')
      && inlineScript.includes("rulePricingMode === requestedPricingMode")
      && inlineScript.includes("function eligibleHedgeDealCounterpartyIds(")
      && inlineScript.includes("const pricingMode = selectedAddHedgeDealPricingMode();")
      && inlineScript.includes("pricingModeForRule(rule) === pricingMode")
      && !inlineScript.includes("hedgeDealEligiblePricingRules")
      && inlineScript.includes("eligibleCounterpartyIds.has(String(profile.counterpartyId))")
      && inlineScript.includes("profiles.length === 1 ? profiles[0] : null")
      && inlineScript.includes("No Hedge Counterparty with ${escapeHtml(")
      && inlineScript.includes("addHedgeDealPricingRuleContentMarkup")
      && inlineScript.includes('id="addHedgeDealPricingRuleLabel">Pricing Rule</span>')
      && !inlineScript.includes('id="addHedgeDealPricingRuleHelp"')
      && inlineScript.includes("Select Pricing Rule")
      && inlineScript.includes("Select a Pricing Rule.")
      && inlineScript.includes("function addHedgeDealPricingRuleContentMarkup(rule, context)")
      && inlineScript.includes("{ executionSystemLabel: true, showPricingModeIndicator: false }")
      && addHedgeDealDialogMarkup.includes('id="addHedgeDealCounterpartyPicker"')
      && addHedgeDealDialogMarkup.includes(">Hedge Counterparty</span>")
      && inlineScript.includes("selectedAddHedgeDealCounterparty")
      && inlineScript.includes("Select a Hedge Counterparty to see available Pricing Rules."),
    usesPricingModeIndicators:
      html.includes("const PRICING_TYPE_PRESENTATION = Object.freeze({")
      && html.includes('icon: "bolt"')
      && html.includes('icon: "contact_phone"')
      && html.includes('icon: "price_change"')
      && /MANUAL_PRICING:\s*Object\.freeze\(\{\s*label: "Manual Pricing",\s*icon: "price_change"/.test(
        inlineScript
      )
      && html.includes('icon: "verified"')
      && html.includes(".pricing-mode-indicator.is-auto-priced")
      && html.includes(".pricing-mode-indicator.is-dealer-priced")
      && html.includes(".pricing-mode-indicator.is-dealer-approved")
      && html.includes(".pricing-mode-indicator.is-manual-pricing")
      && inlineScript.includes("function pricingModeIndicatorMarkup(")
      && inlineScript.includes('class="reference-pricing-mode" data-smart-width-content')
      && inlineScript.includes("pricingModeIndicatorMarkup(pricingModeForRule(rule, context))")
      && inlineScript.includes("pricingModeIndicatorMarkup(\n            item.pricingType,")
      && inlineScript.includes("highlightedReferenceDataText(kind, pricingTypeLabel),\n            false")
      && inlineScript.includes('data-tooltip="${escapeHtml(presentation.label)}"'),
    usesExecutionSystemLabels:
      html.includes('data-ui-column-key="execution_system_label" data-ui-fallback-width="250"')
      && html.includes('<span>Execution System Label</span>')
      && html.includes('data-reference-filter-field="executionSystemLabel"')
      && uiTableLayoutsSource.includes('["execution_system_label", "Execution System Label", 250]')
      && /\.execution-system-label\s*\{[^}]*border: 1px solid var\(--palette-purple-200\);[^}]*background: var\(--palette-purple-100\);/.test(html)
      && inlineScript.includes("function executionSystemLabelMarkup(name, pricingType)")
      && inlineScript.includes('class="execution-system-label"')
      && inlineScript.includes('class="execution-system-label__pricing"')
      && !inlineScript.includes('class="execution-system-label__pricing is-${')
      && inlineScript.includes("const pricingTypeLabel = pricingTypePresentation(item.pricingType).label;")
      && inlineScript.includes("highlightedReferenceDataText(kind, pricingTypeLabel)")
      && inlineScript.includes("data-disable-overflow-tooltip")
      && inlineScript.includes('data-execution-system-label-preview')
      && inlineScript.includes("function syncExecutionSystemLabelPreview(row)")
      && !/class="execution-system-label"[^>]*data-tooltip/.test(inlineScript),
    usesUnifiedMarginIndicators:
      inlineScript.includes("function marginIndicatorMarkup(marginPercent")
      && inlineScript.includes('data-tooltip="Margin"')
      && inlineScript.includes(">savings</span>")
      && inlineScript.includes("marginIndicatorMarkup(rule.marginPercent)")
      && inlineScript.includes('marginIndicatorMarkup(rule.marginPercent, "client-pricing-rules-margin", false)')
      && html.includes(".client-deal-pricing-rule-margin-icon")
      && html.includes(".client-deal-pricing-rule-margin-value"),
    usesGroupedDatabaseExplorer:
      html.includes('id="databaseTableSearch"')
      && html.includes('placeholder="Find table..."')
      && [
        "FX Trades",
        "FX Position",
        "FX Batching",
        "Pricing",
        "Settings",
        "Trading Counterparties & Users",
        "Demo & Generation",
        "Audit",
        "Other"
      ].every(label => databaseTableSectionsSource.includes(`label: "${label}"`))
      && databaseTableSectionsSource.includes('"fx_trade_exposure"')
      && databaseTableSectionsSource.includes('"fx_trade_position_management"')
      && /id: "fx-trading",[\s\S]*?label: "FX Trades",[\s\S]*?tables: \[\s*"client_fx_deals",\s*"fx_hedge_deals",\s*"fx_trade_exposure",\s*"fx_batch_balance_trade",\s*"fx_batch_position_output"\s*\]/.test(
        databaseTableSectionsSource
      )
      && /id: "fx-position",[\s\S]*?label: "FX Position",[\s\S]*?tables: \[\s*"fx_trade_position_management"\s*\]/.test(
        databaseTableSectionsSource
      )
      && /id: "fx-batching",[\s\S]*?tables: \[\s*"fx_batches",\s*"fx_batch_members",\s*"fx_batch_quote_cash_output"\s*\]/.test(
        databaseTableSectionsSource
      )
      && databaseTableSectionsSource.includes('"fx_batch_quote_cash_output"')
      && !databaseTableSectionsSource.includes('"fx_manual_batch_formations"')
      && !databaseTableSectionsSource.includes('"fx_manual_batch_formation_batches"')
      && databaseTableSectionsSource.includes('"pricing_rules"')
      && databaseTableSectionsSource.includes('"execution_contexts"')
      && databaseTableSectionsSource.includes('"ccy_pair_options"')
      && databaseTableSectionsSource.includes('"trading_counterparties"')
      && databaseTableSectionsSource.includes('"client_deal_generation_settings"')
      && /id: "pricing",[\s\S]*?label: "Pricing",[\s\S]*?icon: "price_change",[\s\S]*?tables: \[\s*"pricing_rules",\s*"accounting_systems",\s*"execution_contexts",\s*"execution_systems",\s*"servicing_locations"\s*\]/.test(
        databaseTableSectionsSource
      )
      && !databaseTableSectionsSource.includes('id: "execution-context"')
      && /id: "settings",[\s\S]*?label: "Settings",[\s\S]*?icon: "settings",[\s\S]*?tables: \[\s*"ccy_options",\s*"ccy_pair_options",\s*"fx_hedge_quick_mode_settings",\s*"fx_batching_settings",\s*"fx_auto_batching_settings",\s*"fx_auto_batching_ccy_pairs",\s*"auto_hedging_admission_policy_current",\s*"auto_hedging_admission_policy_revisions",\s*"auto_hedging_admission_policy_pair_rules"\s*\]/.test(
        databaseTableSectionsSource
      )
      && !databaseTableSectionsSource.includes('id: "hedging-settings"')
      && !databaseTableSectionsSource.includes('id: "market-pulse"')
      && /id: "demo-generation",[\s\S]*?tables: \[\s*"client_deal_generation_process_settings",\s*"client_deal_generation_settings",\s*"market_quote_simulation_settings"\s*\]/.test(
        databaseTableSectionsSource
      )
      && databaseTableSectionsSource.includes('label: "Audit"')
      && databaseTableSectionsSource.includes('icon: "policy"')
      && /id: "audit",[\s\S]*?tables: \[\s*"fx_trade_position_management_transitions",\s*"fx_trade_market_snapshot",\s*"fx_auto_hedging_admission_decisions",\s*"v_fx_batch_formation_audit"\s*\]/.test(
        databaseTableSectionsSource
      )
      && (databaseTableSectionsSource.match(/"fx_trade_position_management_transitions"/g) || []).length === 1
      && (databaseTableSectionsSource.match(/"fx_trade_market_snapshot"/g) || []).length === 1
      && (databaseTableSectionsSource.match(/"fx_auto_hedging_admission_decisions"/g) || []).length === 1
      && (databaseTableSectionsSource.match(/"v_fx_batch_formation_audit"/g) || []).length === 1
      && (databaseTableSectionsSource.match(/"fx_batch_balance_trade"/g) || []).length === 1
      && (databaseTableSectionsSource.match(/"fx_batch_position_output"/g) || []).length === 1
      && (databaseTableSectionsSource.match(/"fx_trade_position_management"/g) || []).length === 1
      && inlineScript.includes('function databaseTableGroups(query = "")')
      && inlineScript.includes('data-database-section="${escapeHtml(section.id)}"')
      && inlineScript.includes('databaseTableSearchEl.addEventListener("input"')
      && !inlineScript.includes("const containsSelectedTable")
      && inlineScript.includes('expandedDatabaseTableSections.add(databaseTableSection(selectedDatabaseTable).id)'),
    usesDatabaseBackedFxPositions: inlineScript.includes("function loadFxPositionsFromDatabase()")
      && inlineScript.includes("fxPositionRecords.map(record =>")
      && inlineScript.includes('demoApiRequest("/api/v1/fx-positions")')
      && serverSource.includes("function fxPositions()")
      && serverSource.includes('pathname === "/api/v1/fx-positions"')
      && serverSource.includes("management.initial_position_management_mode")
      && serverSource.includes("AS initialFxPositionMode")
      && serverSource.includes("management.current_position_management_mode")
      && serverSource.includes("AS currentFxPositionMode")
      && serverSource.includes("AS fxPositionMode")
      && serverSource.includes("management.updated_at AS positionManagementModeChangedAt")
      && serverSource.includes("LEFT JOIN fx_trade_position_management management")
      && inlineScript.includes("initialFxPositionMode: normalizedPositionManagementMode(")
      && inlineScript.includes("record?.initialFxPositionMode")
      && inlineScript.includes("currentFxPositionMode")
      && inlineScript.includes("record?.currentFxPositionMode")
      && inlineScript.includes("fxPositionMode: currentFxPositionMode")
      && serverSource.includes("NOT EXISTS")
      && !inlineScript.includes('DemoDb.get("fxPositions")')
      && !inlineScript.includes('DemoDb.get("technicalFxDeals")')
      && !inlineScript.includes("function applyStoredFxPosition(")
      && !["clientFxDeals", "hedgeFxDeals", "technicalFxDeals", "fxPositions"]
        .some(tableName => demoDatabaseSource.includes(`${tableName}:`)
          || demoDatabaseSource.includes(`"${tableName}"`))
      && serverSource.includes("LEFT JOIN fx_trade_market_snapshot a")
      && serverSource.includes("a.market_pulse_stream_status AS marketPulseStreamStatus")
      && serverSource.includes("a.market_pulse_bid AS marketPulseBid")
      && serverSource.includes("a.market_pulse_offer AS marketPulseOffer"),
    usesModeSeparatedFxPositionWorkspace:
      fxPositionModeTabsMarkup.includes('id="fxPositionManualTab"')
      && fxPositionModeTabsMarkup.includes('href="#fx-position:manual"')
      && fxPositionModeTabsMarkup.includes('data-fx-position-mode="MANUAL"')
      && fxPositionModeTabsMarkup.includes('id="fxPositionManualCount"')
      && fxPositionModeTabsMarkup.includes('>Manual Review</span>')
      && fxPositionModeTabsMarkup.includes('id="fxPositionAutoTab"')
      && fxPositionModeTabsMarkup.includes('href="#fx-position:auto"')
      && fxPositionModeTabsMarkup.includes('data-fx-position-mode="AUTO"')
      && fxPositionModeTabsMarkup.includes('id="fxPositionAutoCount"')
      && fxPositionModeTabsMarkup.includes('>Auto Hedging</span>')
      && fxPositionModeTabsMarkup.includes('aria-controls="fxPositionGridPanel"')
      && fxPositionPageMarkup.includes('id="fxPositionGridPanel"')
      && (fxPositionPageMarkup.match(/<table\b[^>]*\bfx-position-grid\b/g) || []).length === 1
      && (fxPositionPageMarkup.match(/\bid="dealRows"/g) || []).length === 1
      && !/data-ui-column-key="(?:fx_)?position_management_mode"|>\s*FX Position Mode\s*</i
        .test(fxPositionGridMarkup)
      && html.includes('class="workspace-nav-link" href="#fx-position:manual" data-workspace-route="batching"')
      && fxPositionModeRoutingSource.includes("function fxPositionRoute(")
      && fxPositionModeRoutingSource.includes("#fx-position:${")
      && fxPositionModeRoutingSource.includes("function fxPositionModeFromLocation(")
      && fxPositionModeRoutingSource.includes("(manual|auto)")
      && fxPositionModeRoutingSource.includes('? "AUTO" : "MANUAL"')
      && fxPositionModeViewSource.includes("function fxPositionRowsForMode(")
      && fxPositionModeViewSource.includes(
        "deal?.currentFxPositionMode ?? deal?.fxPositionMode"
      )
      && fxPositionModeViewSource.includes("function fxPositionModeCounts(")
      && fxPositionModeViewSource.includes(
        "const pairRows = activeCurrencyPairRows(source)"
      )
      && fxPositionModeViewSource.includes('fxPositionRowsForMode(pairRows, "MANUAL").length')
      && fxPositionModeViewSource.includes('fxPositionRowsForMode(pairRows, "AUTO").length')
      && fxPositionModeViewSource.includes("fxPositionManualCount.textContent = String(counts.MANUAL)")
      && fxPositionModeViewSource.includes("fxPositionAutoCount.textContent = String(counts.AUTO)")
      && fxPositionModeViewSource.includes("function clearHiddenFxPositionSelection(")
      && fxPositionModeViewSource.includes("selectedTradeIds.delete(tradeId)")
      && fxPositionModeViewSource.includes("function setActiveFxPositionMode(")
      && fxPositionModeViewSource.includes("clearHiddenFxPositionSelection()")
      && inlineScript.includes(
        "return sortedDeals(activeCurrencyPairRows(fxPositionRowsForMode(fxPositions)))"
      )
      && inlineScript.includes("setActiveFxPositionMode(fxPositionModeFromLocation())")
      && inlineScript.includes('demoApiRequest("/api/v1/fx-positions")')
      && selectedBatchSourceTradesSource.includes("currentDisplayRows().filter")
      && !selectedBatchSourceTradesSource.includes("fxPositionMode")
      && fxPositionsEndpointSource.includes("sendJson(response, 200, fxPositions())")
      && !fxPositionsEndpointSource.includes("searchParams"),
    usesManualToAutoFxPositionTransition:
      fxPositionPageMarkup.includes('id="sendToAutoPositionModeButton"')
      && fxPositionPageMarkup.includes(
        'aria-label="Send selected Trades to Auto Hedging"'
      )
      && fxPositionPageMarkup.includes('>Send to Auto</span>')
      && html.includes('id="sendToAutoPositionModeDialog"')
      && !html.includes("Initial FX Position Mode will remain Manual Control")
      && sendToAutoPositionModeSource.includes("to Auto Hedging?`")
      && !sendToAutoPositionModeSource.includes("from Manual Control?")
      && sendToAutoPositionModeSource.includes("function selectedManualReviewTradesForAuto()")
      && sendToAutoPositionModeSource.includes('activeFxPositionMode !== "MANUAL"')
      && sendToAutoPositionModeSource.includes('initialMode === "MANUAL"')
      && sendToAutoPositionModeSource.includes('currentMode === "MANUAL"')
      && sendToAutoPositionModeSource.includes(
        '"/api/v1/fx-positions/send-to-auto-batching"'
      )
      && sendToAutoPositionModeSource.includes("JSON.stringify({ trades: submittedTrades })")
      && serverSource.includes("new SendFxTradesToAutoPositionManagementUseCase")
      && serverSource.includes("function saveFxTradePositionManagementTransition")
      && serverSource.includes('pathname === "/api/v1/fx-positions/send-to-auto-batching"')
      && serverSource.includes("fxAutoBatchingProcess.requestEvaluation()")
      && sendFxTradesToAutoPositionManagementSource.includes(
        "planFxTradePositionManagementTransitionToAuto"
      )
      && schemaSource.includes("CREATE TABLE IF NOT EXISTS fx_trade_position_management_transitions"),
    usesClientDealCommentOnlyEditing:
      html.includes('id="editDealButton" disabled>Edit Comment</button>')
      && editClientDealDialogMarkup.includes(">Edit Client Deal Comment</h2>")
      && editClientDealDialogMarkup.includes('id="editClientDealSide" name="side" disabled')
      && editClientDealDialogMarkup.includes('id="editClientDealTenor" name="tenor" disabled')
      && editClientDealDialogMarkup.includes('id="editClientDealComment" name="comment" maxlength="500"')
      && editClientDealDialogMarkup.includes('id="dealSubmitButton">Save Comment</button>')
      && !inlineScript.includes("isDealerPricedPricingRule")
      && inlineScript.includes("dealIdentitySection.open = true;")
      && inlineScript.includes("showDealDialog(editForm.elements.comment);")
      && saveEditedDealFunction.includes('method: "PATCH"')
      && saveEditedDealFunction.includes("JSON.stringify({ comment })")
      && serverSource.includes("function updateClientFxDealComment(tradeId, comment)")
      && serverSource.includes('"CLIENT_FX_DEAL_IMMUTABLE"')
      && !serverSource.includes("function deleteClientFxDeal(tradeId)"),
    usesDatabaseBackedClientDealGeneration: serverSource.includes(
      'pathname === "/api/v1/client-deal-generation/one"'
    )
      && serverSource.includes(
        'pathname === "/api/v1/client-deal-generation/settings"'
      )
      && serverSource.includes(
        'pathname === "/api/v1/client-deal-generation/process/start"'
      )
      && serverSource.includes(
        'pathname === "/api/v1/client-deal-generation/process-settings"'
      )
      && serverSource.includes("new ClientDealGenerationProcess")
      && inlineScript.includes('"/api/v1/client-deal-generation/one"')
      && inlineScript.includes('"/api/v1/client-deal-generation/settings"')
      && inlineScript.includes('"/api/v1/client-deal-generation/process/start"')
      && inlineScript.includes('"/api/v1/client-deal-generation/process-settings"')
      && inlineScript.includes("runClientDealGenerationButton")
      && html.includes('id="clientDealGenerationProcessSettingsForm"')
      && html.includes('id="generationMinIntervalSeconds"')
      && html.includes('id="generationMaxIntervalSeconds"')
      && html.includes('id="generationMinDealsPerCycle"')
      && html.includes('id="generationMaxDealsPerCycle"')
      && html.includes('data-column-kind="compactActions">Actions</th>')
      && inlineScript.includes("compactActions: {")
      && inlineScript.includes("const configuredPricingRuleIds = new Set(")
      && inlineScript.includes('const pricingRuleLabel = configuredPricingRuleCount === 1 ? "Pricing Rule" : "Pricing Rules"')
      && inlineScript.includes("${pricingRuleLabel} linked to AUTO_PRICED ")
      && html.includes('id="generationCycleDelayLabel"')
      && html.includes(">schedule</span>")
      && html.includes("<span>Delay between generation cycles</span>")
      && html.includes('id="generationCycleDealsLabel"')
      && html.includes(">format_list_numbered</span>")
      && html.includes("<span>Deals per generation cycle</span>")
      && (html.match(/class="generation-cycle-settings-range-control"/g) || []).length === 2
      && clientDealGenerationProcessSource.includes("randomIntegerInRange")
      && clientDealGenerationProcessSource.includes("setTimeoutFn")
      && clientDealGenerationProcessSource.includes("minDealsPerCycle")
      && !clientDealGenerationProcessSource.includes("setIntervalFn"),
    removesBrowserClientDealGeneration: !inlineScript.includes("generatedClientDealDraft")
      && !inlineScript.includes("clientDealGenerationSettings.marketBidMin")
      && !inlineScript.includes('DemoDb.get("clientDealGenerationSettings")')
      && !demoDatabaseSource.includes('"clientDealGenerationSettings"')
      && !demoDatabaseSource.includes("clientDealGenerationSettings:"),
    usesFxBatchFormation:
      batchToolbarMarkup.includes('id="oneBatchButton"')
      && batchToolbarMarkup.includes(">Create Batch</button>")
      && serverSource.includes('pathname === "/api/v1/fx-batches"')
      && serverSource.includes("new FormFxBatchUseCase")
      && !serverSource.includes("new FormManualFxBatchesUseCase")
      && !schemaSource.includes("CREATE TABLE IF NOT EXISTS fx_manual_batch_formations")
      && !schemaSource.includes("CREATE TABLE IF NOT EXISTS fx_manual_batch_formation_batches")
      && serverSource.includes("INSERT INTO fx_batch_members")
      && serverSource.includes("INSERT INTO fx_batch_balance_trade")
      && serverSource.includes("INSERT INTO fx_batch_position_output")
      && fxBatchFormationApplicationSource.includes("class FormFxBatchUseCase")
      && serverSource.includes("migrateLegacyManualBatchFormations")
      && serverSource.includes("Manual batching creates exactly one FX Batch")
      && inlineScript.includes("formOneBatchFromSelection")
      && inlineScript.includes("submitOneBatchSelection")
      && inlineScript.includes(
        "oneBatchCompatibilityGroups(sourceDeals).length > 1"
      )
      && /function oneBatchCompatibilityKey\(deal\)[\s\S]*?ccyPairCode[\s\S]*?fxPositionBaseCcyFractionDigits\(deal\)[\s\S]*?fxPositionQuoteCcyFractionDigits\(deal\)[\s\S]*?positionTradeDate\(deal\)[\s\S]*?positionTenor\(deal\)[\s\S]*?baseCurrencyValueDate\(deal\)[\s\S]*?quoteCurrencyValueDate\(deal\)/.test(
        inlineScript
      )
      && inlineScript.includes(
        "oneBatchCompatibilityKey(deal) === selectedCompatibilityKey"
      )
      && !inlineScript.includes(
        "batchingSettings.allowCrossTenorBatching !== true"
      )
      && oneBatchTenorDialogMarkup.includes(
        ">Incompatible Batching Keys Selected</h2>"
      )
      && !oneBatchTenorDialogMarkup.includes("Create Independent Batches")
      && !inlineScript.includes("SEPARATE_BY_TENOR")
      && inlineScript.includes('"/api/v1/fx-batches"')
      && inlineScript.includes(
        'oneBatchButton.addEventListener("click", formOneBatchFromSelection)'
      )
      && batchToolbarMarkup.includes('aria-keyshortcuts="G"')
      && batchToolbarMarkup.includes('title="Create Batch · Shortcut: G"')
      && /key === "g" \|\| key === "\\u043f"/.test(inlineScript)
      && inlineScript.includes("if (!oneBatchButton.disabled) {")
      && inlineScript.includes("oneBatchButton.click();")
      && inlineScript.includes("selectedTradeIds")
      && !inlineScript.includes("deleteSelectedGeneratedBatchTrades")
      && !inlineScript.includes("generateOpenPositionByAutoBatch")
      && !inlineScript.includes("openBatchSettingsPage")
      && !inlineScript.includes('DemoDb.get("batchSettings")')
      && !demoDatabaseSource.includes('"batchSettings"')
      && !demoDatabaseSource.includes("batchSettings:"),
    serializesFxBatchUiRequests:
      inlineScript.includes("let oneBatchInFlight = false;")
      && inlineScript.includes("if (oneBatchInFlight) {")
      && inlineScript.includes("oneBatchInFlight = true;")
      && inlineScript.includes("|| oneBatchInFlight")
      && inlineScript.includes("oneBatchInFlight = false;")
      && inlineScript.includes("submittedDealIds.forEach(dealId => selectedTradeIds.delete(dealId));")
      && inlineScript.includes("let clientDealGenerationRefreshInFlight = false;")
      && inlineScript.includes("if (clientDealGenerationRefreshInFlight) {")
      && inlineScript.includes("void refreshClientDealGenerationViews();")
      && !inlineScript.includes("clientDealGenerationRefreshTimer = window.setInterval(async")
      && inlineScript.includes("let fxPositionsRequestSequence = 0;")
      && inlineScript.includes("requestSequence !== fxPositionsRequestSequence"),
    usesBatchingHistory:
      html.includes('id="workspaceBatchesLink"')
      && !html.includes('id="workspaceBatchesMenu"')
      && html.includes('href="#batching:history"')
      && html.includes('>FX Batches</span>')
      && html.includes('id="fxBatchesPage"')
      && html.includes('id="fxBatchesTab"')
      && html.includes('id="batchingHistoryPage"')
      && html.includes('id="batchingHistoryGrid"')
      && html.includes('<h1 class="page-title">FX Batches</h1>')
      && inlineScript.includes("function initializeBatchingHistoryGrid(data)")
      && inlineScript.includes('demoApiRequest("/api/v1/fx-batches")')
      && inlineScript.includes('title: "Batch ID"')
      && inlineScript.includes('title: "Ccy Pair Code"')
      && inlineScript.includes('title: "Batch Status"')
      && inlineScript.includes('title: "Formation Reason"')
      && /title: "Formation Reason",[\s\S]*?field: "formationReasonCode",/.test(inlineScript)
      && !inlineScript.includes('title: "Trigger Details (Demo)"')
      && !inlineScript.includes('field: "formationReasonDescription"')
       && inlineScript.includes('title: "Formed At"')
       && html.includes('#fxBatchesPage:not([hidden])')
       && html.includes('height: calc(100vh - var(--workspace-nav-height));')
      && html.includes(':is(#batchingHistoryPage, #batchFormationAuditPage) .batching-history-content')
      && html.includes(':is(#batchingHistoryPage, #batchFormationAuditPage) .batching-history-grid')
      && /function initializeBatchingHistoryGrid\(data\) \{[\s\S]*?renderVertical: "virtual",[\s\S]*?maxHeight: "calc\(100vh - var\(--workspace-nav-height\) - 170px\)",/.test(inlineScript)
      && /tabulatorSizedColumn\("timestamp", \{[\s\S]*?title: "Formed At",[\s\S]*?field: "formedAt",/.test(inlineScript)
      && serverSource.includes("function fxBatches()")
      && serverSource.includes("function fxBatchFormationReasonDescription(")
      && schemaSource.includes("formation_reason_code")
      && schemaSource.includes("formation_reason_details_json")
      && serverSource.includes(
        'pathname === "/api/v1/fx-batches" && method === "GET"'
      ),
    usesUnifiedBatchHeaderFilterFocus: html.includes(
      ':is(#batchingHistoryPage, #batchFormationAuditPage) .tabulator .tabulator-header-filter :is(input, select):focus {'
    )
      && html.includes('border-color: var(--bs-primary);')
      && html.includes('box-shadow: 0 0 0 2px rgba(var(--bs-primary-rgb), 0.16);'),
    usesBatchFormationAudit:
      html.includes('href="#batching:formation-audit"')
      && html.includes('data-fx-batches-route="batch-formation-audit"')
      && html.includes('id="batchFormationAuditTab"')
      && html.includes('id="batchFormationAuditPage"')
      && html.includes('id="batchFormationAuditGrid"')
      && html.includes('data-ui-table-layout-host="batch_formation_audit_grid"')
      && html.includes('<span>Batch Formation Audit</span>')
      && inlineScript.includes("function initializeBatchFormationAuditGrid(data)")
      && inlineScript.includes('demoApiRequest("/api/v1/fx-batch-formation-audit")')
      && inlineScript.includes('title: "Batching Key"')
      && inlineScript.includes('title: "Window Opened At"')
      && inlineScript.includes('title: "Window Closed At"')
      && inlineScript.includes('title: "Batch Formed At"')
      && inlineScript.includes('title: "Duration"')
       && inlineScript.includes('title: "Source Trades"')
       && inlineScript.includes('data-batch-formation-audit-action="view"')
       && /function initializeBatchFormationAuditGrid\(data\) \{[\s\S]*?renderVertical: "virtual",[\s\S]*?maxHeight: "calc\(100vh - var\(--workspace-nav-height\) - 170px\)",/.test(inlineScript)
       && serverSource.includes("function fxBatchFormationAudit()")
      && serverSource.includes(
        'pathname === "/api/v1/fx-batch-formation-audit" && method === "GET"'
      )
      && schemaSource.includes("CREATE VIEW IF NOT EXISTS v_fx_batch_formation_audit")
      && schemaSource.includes("member.member_role = 'TRADE'"),
    usesBatchStructure:
      html.includes('data-workspace-routes="batching-history batch-formation-audit batch-details"')
      && !html.includes('href="#batching:details"')
      && html.includes('<h1 class="page-title">Batch Structure</h1>')
      && !html.includes(">Batch Details<")
      && html.includes('id="batchDetailsPage"')
      && !html.includes('id="batchDetailsSelect"')
      && !html.includes('id="batchDetailsPickerSearch"')
      && html.includes('id="batchDetailsContent"')
      && html.includes('id="batchDetailsMembersGrid"')
      && html.includes('id="batchDetailsCashOutputGrid"')
      && html.includes('id="batchDetailsOutputsGrid"')
      && html.includes(
        '<h2 class="batch-details-section-title" id="batchDetailsMembersTitle">FX Trade Members</h2>'
      )
      && html.includes(
        '<h2 class="batch-details-section-title" id="batchDetailsCashOutputTitle">Cash Output</h2>'
      )
      && html.includes(
        '<h2 class="batch-details-section-title" id="batchDetailsOutputsTitle">Net Position Output</h2>'
      )
      && html.includes(
        'class="btn btn-sm btn-outline-secondary workbench-detail-back-button" href="#batching:history" aria-label="Back to FX Batches"'
      )
      && html.includes('<span class="button-icon" aria-hidden="true">arrow_back</span>')
      && html.includes("source position was already flat")
      && html.includes('id="batchNeutralityMembersBase"')
      && html.includes('id="batchNeutralityCashQuote"')
      && html.includes(">FX Position Neutral</span>")
      && html.includes(">Cash Balance Neutral</span>")
      && inlineScript.includes("function batchDetailsRoute(batchId)")
      && inlineScript.includes("/^#batching:details\\/(\\d+)$/")
      && inlineScript.includes("async function loadFxBatchDetailsFromApi(batchId)")
      && inlineScript.includes("function normalizedFxBatchDetails(value)")
      && inlineScript.includes("function initializeBatchDetailsGrid(")
      && batchDetailsPageLoaderSource.includes("await loadSelectedBatchDetails(batchId)")
      && !batchDetailsPageLoaderSource.includes("reloadFxBatchesFromApi")
      && !batchDetailsPageLoaderSource.includes("renderBatchDetailsSelect")
      && inlineScript.includes('if (location.hash === "#batching:details")')
      && inlineScript.includes("location.hash = batchingHistoryRoute()")
      && batchDetailsGridInitializerSource.includes('layout: "fitDataTable"')
      && batchDetailsGridInitializerSource.includes('renderVertical: "basic"')
      && !batchDetailsGridInitializerSource.includes('renderVertical: "virtual"')
      && batchDetailsGridCss.includes("max-width: 100%")
      && batchDetailsGridCss.includes("height: auto")
      && !/^\s*width:\s*100%;/m.test(batchDetailsGridCss)
      && /#batchDetailsPage \.batch-details-section-header \.client-deals-count \{[\s\S]*?margin-left: 0;/.test(html)
      && inlineScript.includes('batchStructureTradeColumns("memberRole")')
      && inlineScript.includes('batchStructureTradeColumns("outputRole")')
      && inlineScript.includes("function batchStructureCashOutputColumns()")
      && inlineScript.includes("function renderBatchNeutrality(details)")
      && batchStructureColumnsSource.includes(
        'const isMemberTable = roleField === "memberRole";'
      )
      && batchStructureColumnsSource.includes('headerFilter: "input"')
      && batchStructureColumnsSource.includes('headerFilterFunc: "like"')
      && batchStructureColumnsSource.includes("headerSort: isMemberTable")
      && /title: "Base Ccy Value Date",[\s\S]*?headerSort: false/.test(
        batchStructureColumnsSource
      )
      && /title: "Quote Ccy Value Date",[\s\S]*?headerSort: false/.test(
        batchStructureColumnsSource
      )
      && batchDetailsGridInitializerSource.includes(
        'column.field === "tradeId" && column.headerSort === true'
      )
      && batchDetailsGridInitializerSource.includes(
        'initialSort: supportsTradeIdSorting'
      )
      && batchDetailsGridInitializerSource.includes(
        "headerFilterLiveFilterDelay: 300"
      )
      && batchDetailsGridInitializerSource.includes("headerSort: false")
      && inlineScript.includes(
        'tabulatorSizedColumn("tradeSummary", {\n          title: "Trade Type"'
      )
      && /tabulatorSizedColumn\("tradeSummary", \{[\s\S]*?formatter: batchStructureTradeTypeFormatter,[\s\S]*?tooltip: false/.test(
        batchStructureColumnsSource
      )
      && inlineScript.includes(
        'batchDetailsSummaryTitle.textContent = `Batch #${details.batchId}`;'
      )
      && batchStructureColumnsSource.indexOf('title: "Trade ID"')
        < batchStructureColumnsSource.indexOf('title: "Trade Type"')
      && batchStructureColumnsSource.includes('title: "Base Ccy Leg"')
      && batchStructureColumnsSource.includes('title: "Quote Ccy Leg"')
      && batchStructureColumnsSource.includes('field: "baseBalanceContributionMinor"')
      && batchStructureColumnsSource.includes('field: "quoteBalanceContributionMinor"')
      && batchStructureColumnsSource.indexOf('title: "Transfer Rate"')
        < batchStructureColumnsSource.indexOf('title: "Analytical PnL"')
      && batchStructureColumnsSource.includes('field: "analyticalPnlQuoteMinor"')
      && batchStructureColumnsSource.includes(
        "function batchStructureAnalyticalPnlFormatter"
      )
      && batchStructureColumnsSource.includes(
        'const sign = pnlMinor > 0 ? "+" : "";'
      )
      && batchStructureColumnsSource.includes(
        "`${sign}${formattedValue}${quoteCcyCode ? ` ${quoteCcyCode}` : \"\"}`"
      )
      && batchStructureColumnsSource.includes(
        "bottomCalcFormatter: batchStructureAnalyticalPnlFormatter"
      )
      && batchStructureColumnsSource.includes('title: "Base Ccy Value Date"')
      && batchStructureColumnsSource.includes('field: "baseCcyValueDate"')
      && batchStructureColumnsSource.includes('title: "Quote Ccy Value Date"')
      && batchStructureColumnsSource.includes('field: "quoteCcyValueDate"')
      && batchStructureColumnsSource.includes('bottomCalc: () => "NET"')
      && batchStructureColumnsSource.includes('bottomCalc: "sum"')
      && batchStructureColumnsSource.includes("function batchStructureTradeTypeFormatter")
      && batchStructureColumnsSource.includes("fxPositionTradeTypePresentation(trade)")
      && inlineScript.includes('index: "batchContentKey"')
      && inlineScript.includes("function normalizedBatchCashOutput(value)")
      && !inlineScript.includes('member.tradeType === "BATCH_QUOTE_CASH_OUT"')
      && !batchStructureColumnsSource.includes("emptyForQuoteCash")
      && batchStructureColumnsSource.includes('trade.memberRole === "TRADE"')
      && batchStructureColumnsSource.includes("trade.createdByBatchId")
      && batchStructureColumnsSource.includes("position-trade-type-chip")
      && !batchStructureColumnsSource.includes('title: "Created By Batch"')
      && !batchStructureColumnsSource.includes('title: "Side"')
      && inlineScript.includes("function loadBatchDetailsPage()")
      && inlineScript.includes('data-batching-history-action="view"')
      && inlineScript.includes("location.hash = batchDetailsRoute(batch.batchId)")
      && !inlineScript.includes("batchDetailsSelect")
      && serverSource.includes("function fxBatchContent(batchId)")
      && serverSource.includes("function fxBatchBalanceRow(row)")
      && serverSource.includes(".map(fxBatchBalanceRow)")
      && serverSource.includes(
        "WHEN 'CLIENT_DEAL' THEN client.analytical_pnl_quote_minor"
      )
      && serverSource.includes(
        "WHEN 'HEDGE_DEAL' THEN hedge.analytical_pnl_quote_minor"
      )
      && serverSource.includes("END AS analyticalPnlQuoteMinor")
      && serverSource.includes("END AS analyticalPnlQuoteFractionDigits")
      && fxBatchBalanceDomainSource.includes(
        'baseBalanceContributionMinor: normalizedSide === "SELL"'
      )
      && fxBatchBalanceDomainSource.includes(
        'quoteBalanceContributionMinor: normalizedSide === "BUY"'
      )
      && serverSource.includes("function fxBatchDetails(batchId)")
      && serverSource.includes("members: content.members")
      && serverSource.includes("outputs: content.outputs")
      && serverSource.includes("cashOutput")
      && !serverSource.includes("content.members.push")
      && serverSource.includes("sendJson(response, 200, fxBatchDetails(batchId))"),
    removesBatchingPositionsWorkspace:
      !html.includes('href="#batching-positions"')
      && !html.includes('data-workspace-route="batching-positions"')
      && !html.includes('id="batchingPositionsPage"')
      && !html.includes(">Batching Positions</span>")
      && !inlineScript.includes("function initializeBatchingPositionsGrid(data)")
      && !inlineScript.includes('demoApiRequest("/api/v1/batching-positions")')
      && !serverSource.includes("batchingPositions: fxBatchTrades()")
      && inlineScript.includes('type === "BATCH_BALANCE_TRADE"')
      && fxBatchFormationDomainSource.includes('"BATCH_BALANCE_TRADE"')
      && serverSource.includes(
        'pathname === "/api/v1/batching-positions" && method === "GET"'
      ),
    supportsBatchRollback:
      html.includes('id="batchRollbackDialog"')
      && html.includes(">Rollback batch</span>")
      && inlineScript.includes("function confirmBatchRollback()")
      && inlineScript.includes("batchingHistoryActionFormatter")
      && inlineScript.includes("/rollback`")
      && serverSource.includes("function rollbackFxBatch(batchId)")
      && serverSource.includes("batch_status = 'ROLLED_BACK'")
      && serverSource.includes("/rollback$/.exec(pathname)")
      && schemaSource.includes("'ROLLED_BACK'")
      && schemaSource.includes("rolled_back_at"),
    usesMinorUnitBatchBalancing:
      fxBatchFormationDomainSource.includes("baseCcyAmountMinor")
      && fxBatchFormationDomainSource.includes("quoteCcyAmountMinor")
      && fxBatchFormationDomainSource.includes("exactNetTransferQuoteAmountMinor")
      && fxBatchFormationDomainSource.includes("calculateQuoteMinor")
      && fxBatchFormationDomainSource.includes("formQuoteCashOut")
      && fxBatchFormationDomainSource.includes(
        "quoteCashOutContributionMinor"
      )
      && fxBatchBalanceDomainSource.includes(
        "fxTradeBalanceContributionsMinor"
      )
      && fxBatchFormationDomainSource.includes("dealtCcyCode: first.baseCcyCode")
      && fxBatchFormationDomainSource.includes('sourceNetSide: "FLAT"')
      && !fxBatchFormationDomainSource.includes(
        "trade.baseCcyAmount * trade.transferRate"
      )
      && serverSource.includes(
        'minorToSafeInteger(trade.baseCcyAmountMinor, "Batch Base Ccy Amount Minor")'
      )
      && serverSource.includes(
        'minorToSafeInteger(trade.quoteCcyAmountMinor, "Batch Quote Ccy Amount Minor")'
      )
      && serverSource.includes("INSERT INTO fx_batch_quote_cash_output")
      && schemaSource.includes(
        "formed batch must have zero quote currency cash balance"
      )
      && !serverSource.includes(
        "const exposureAmounts = fxTradeExposureAmounts(trade);"
      ),
    usesMinorUnitAnalyticalPnl:
      serverSource.includes("analytical_pnl_quote_minor")
      && serverSource.includes("analytical_pnl_quote_fraction_digits")
      && serverSource.includes("calculateAnalyticalPnlMinor")
      && inlineScript.includes("analyticalPnlQuoteMinor")
      && inlineScript.includes("analyticalPnlQuoteFractionDigits")
      && inlineScript.includes("minorToMajorDecimal("),
    usesStrictMinorUnitDealInputs:
      moneyDomainSource.includes("majorToMinorExact(dealtAmount, baseFractionDigits)")
      && moneyDomainSource.includes("majorToMinorExact(dealtAmount, quoteFractionDigits)")
      && inlineScript.includes("function majorToMinorExactDecimal(")
      && inlineScript.includes("function validateMinorPrecision(")
      && inlineScript.includes("validateMinorPrecision(dealtInput, dealtCcyCode, dealtFractionDigits)"),
    usesMinorUnitDealGridFormatting:
      inlineScript.includes("minorAmountCell(row[minorField], fractionDigits)")
      && inlineScript.includes("minorAmountCell(pnlMinor, fractionDigits)"),
    usesMinorUnitClientDealGenerationSettings:
      serverSource.includes("migrateClientDealGenerationSettingsToMinorUnits")
      && serverSource.includes("min_base_ccy_amount_minor")
      && serverSource.includes("base_ccy_fraction_digits")
      && clientDealGeneratorSource.includes("generatedBaseCcyAmountMinor")
      && clientDealGeneratorSource.includes("minorToMajor")
      && !clientDealGeneratorSource.includes(
        "settings.minBaseCcyAmount,"
      ),
    usesMinorUnitFxPositionSummary:
      inlineScript.includes("function sideAmountMinor(")
      && inlineScript.includes("function scaledMinorAmount(")
      && inlineScript.includes("amountMinor: sideRows.reduce(")
      && inlineScript.includes("const netMinor = sell.amountMinor - buy.amountMinor;")
      && inlineScript.includes("new Big(String(value))")
      && inlineScript.includes("minorAmountCell(sell.amountMinor, fractionDigits)")
      && inlineScript.includes("function fxPositionQuoteAmountMinor(")
      && inlineScript.includes("deal?.analyticalPnlQuoteMinor")
      && inlineScript.includes("minorToMajorDecimal(pnlMinor, fractionDigits)")
      && !inlineScript.includes("acc.sell += deal.amountSell")
      && !inlineScript.includes("acc.sum += value * amount")
      && !inlineScript.includes("function quoteCurrencyAmount(")
      && !inlineScript.includes("function pnlCashFromTransfer(")
      && !inlineScript.includes("baseCcyAmount * tradeRate"),
    usesBootstrapFxPositionWorkspace: fxPositionPageMarkup.includes(
      'class="table table-sm align-middle batching-table fx-position-grid"'
    )
      && fxPositionPageMarkup.includes('class="deal-toolbar btn-toolbar"')
      && fxPositionPageMarkup.includes('class="batch-toolbar btn-toolbar"')
      && fxPositionPageMarkup.includes('class="position-toolbar-row"')
      && fxPositionPageMarkup.includes('class="hedge-toolbar btn-toolbar"')
      && fxPositionPageMarkup.includes('aria-label="Hedging Toolbar"')
      && fxPositionPageMarkup.includes('class="batch-toolbar-title hedge-toolbar-title"')
      && fxPositionPageMarkup.includes('data-tooltip="Hedging Toolbar"')
      && fxPositionPageMarkup.includes('aria-hidden="true">shield</span>')
      && html.includes('.action-button:not(.btn) {')
      && html.includes('.action-button:not(.btn):hover:not(:disabled) {')
      && !fxPositionPageMarkup.includes('>Hedge Toolbar</span>')
      && fxPositionPageMarkup.includes('class="form-check-input select-all-checkbox"')
      && fxPositionPageMarkup.includes('aria-label="Ccy pair selector"')
      && fxPositionPageMarkup.includes('id="runClientDealGenerationLabel">Auto Generate</span>')
      && fxPositionPageMarkup.includes('id="autoBatchButton" aria-label="Start Auto Batching"')
      && fxPositionPageMarkup.includes('id="autoBatchLabel">Auto Batch</span>')
      && !fxPositionPageMarkup.includes(">play_arrow</span>")
      && (fxPositionPageMarkup.match(/>settings<\/span>/g) || []).length === 3
      && !fxPositionPageMarkup.includes("&#9654;")
      && !fxPositionPageMarkup.includes("&#9881;")
      && !fxPositionPageMarkup.includes('type="search"')
      && !fxPositionPageMarkup.includes("header-filter")
      && html.includes("#mainPage.fx-position-bootstrap.workbench-page .fx-position-grid")
      && html.includes("grid-template-columns: 136px minmax(0, 1fr)")
      && fxPositionWorkspaceMainCss.includes("display: flex;")
      && fxPositionWorkspaceMainCss.includes("flex-direction: column;")
      && !fxPositionWorkspaceMainCss.includes("grid-template-rows:")
      && fxPositionGridFrameCss.includes("flex: 1 1 auto;")
      && fxPositionGridFrameCss.includes("min-height: 0;")
      && fxPositionGridFrameCss.includes("overflow: auto;")
      && /#mainPage\.fx-position-bootstrap\.workbench-page \.hedge-toolbar \{[\s\S]*?flex: 0 0 auto;[\s\S]*?\}/.test(html)
      && !fxPositionPageMarkup.includes('class="fx-position-toolbar-spacer"')
      && inlineScript.includes("function fxPositionGridFillRow()")
      && inlineScript.includes('class="fx-position-grid-fill"')
      && inlineScript.includes("function syncFxPositionGridFillHeight()")
      && inlineScript.includes("fxPositionLayoutObserver.observe(fxPositionGridFrame)")
      && inlineScript.includes("fxPositionLayoutObserver.observe(fxPositionGrid)")
      && /#mainPage\.fx-position-bootstrap\.workbench-page \.fx-position-grid thead \{\s*position: static;\s*\}/.test(html)
      && /#mainPage\.fx-position-bootstrap\.workbench-page \.fx-position-grid tfoot \{[\s\S]*?position: sticky;[\s\S]*?bottom: 0;[\s\S]*?\}/.test(html)
      && /#mainPage\.fx-position-bootstrap\.workbench-page \.fx-position-grid tfoot tr:last-child td \{[\s\S]*?border-bottom: 0;[\s\S]*?\}/.test(html)
      && html.includes("--fx-position-section-rule-width: 2px;")
      && /#mainPage\.fx-position-bootstrap\.workbench-page \.fx-position-grid \.section-name::before \{[\s\S]*?position: absolute;[\s\S]*?top: 7px;[\s\S]*?height: var\(--fx-position-section-rule-width\);[\s\S]*?margin: 0;/.test(html)
      && /#mainPage\.fx-position-bootstrap\.workbench-page \.fx-position-grid \.batching-summary-total td \{[\s\S]*?border-top: 3px solid var\(--palette-gray-500\);[\s\S]*?border-bottom: 0;/.test(html)
      && html.includes(".sell-check-zone .select-all-checkbox:is(:checked, :indeterminate)")
      && html.includes(".buy-check-zone .select-all-checkbox:is(:checked, :indeterminate)")
      && fxPositionPageMarkup.includes('title="Select all SELL deals · Shortcut: S"')
      && fxPositionPageMarkup.includes('title="Select all BUY deals · Shortcut: B"')
      && fxPositionPageMarkup.includes('class="action-button primary btn btn-sm btn-soft-primary with-icon" id="createDealButton"')
      && html.includes(".toolbar-secondary-action:is("),
    usesBootstrapDealGenerationSettings: generationSettingsDialogMarkup.includes(
      'class="generation-dialog-title-block"'
    )
      && generationSettingsDialogMarkup.includes(
        'class="table table-sm table-hover align-middle generation-settings-table unified-data-table"'
      )
      && generationSettingsDialogMarkup.includes(
        'data-ui-table-layout-host="deal_generation_settings_grid"'
      )
      && generationSettingsDialogMarkup.includes(
        'data-ui-table-layout-key="deal_generation_settings_grid"'
      )
      && generationSettingsDialogMarkup.includes('class="dialog-close btn-close"')
      && html.includes('class="btn btn-sm btn-outline-primary generation-settings-save"')
      && html.includes(".generation-dialog .modal-header")
      && /\.generation-dialog \{\s*width: fit-content;\s*max-width: calc\(100vw - 32px\);/.test(html)
      && html.includes("font-family: var(--bs-body-font-family);")
      && /\.generation-cycle-settings-range-label\s*\{[\s\S]*?color: var\(--bs-emphasis-color, #212529\);[\s\S]*?font-size: 11px;[\s\S]*?font-weight: 500;[\s\S]*?text-transform: none;[\s\S]*?\}/.test(
        html
      )
      && !inlineScript.includes(
        'document.getElementById("generationMinIntervalSeconds")?.focus()'
      )
      && html.includes(".generation-settings-table tbody tr:nth-child(even)")
      && inlineScript.includes("settings.counterpartyName")
      && !inlineScript.includes("generation-settings-client-code")
      && /pricingModeIndicatorMarkup\(\s*settings\.pricingMode,\s*escapeHtml\(settings\.pricingMode\),\s*false\s*\)/.test(inlineScript),
    showsAutoPricedClientDealGenerationMode:
      generationSettingsDialogMarkup.includes(">Pricing Mode</span>")
      && generationSettingsDialogMarkup.includes(
        "Only AUTO_PRICED Execution Systems are available for Client Deal generation."
      )
      && generationSettingsDialogMarkup.indexOf(
        "Only AUTO_PRICED Execution Systems are available for Client Deal generation."
      ) > generationSettingsDialogMarkup.indexOf("<table")
      && generationSettingsDialogMarkup.indexOf(
        "Only AUTO_PRICED Execution Systems are available for Client Deal generation."
      ) < generationSettingsDialogMarkup.indexOf("</thead>")
      && generationSettingsDialogMarkup.includes('class="button-icon form-label-help"')
      && !generationSettingsDialogMarkup.includes("configured for deal generation")
      && !generationSettingsDialogMarkup.includes(">Margin %</th>")
      && !inlineScript.includes("editNumber(settings.marginPercent, 4)")
      && inlineScript.includes("settings.pricingMode"),
    usesNeutralMarketPulseNavigationIcon: marketPulseIconStyles.includes("color: inherit;")
      && html.includes('<span class="button-icon workspace-nav-icon market-pulse-icon" aria-hidden="true">monitoring</span>')
      && html.includes('<span class="button-icon workspace-nav-icon" aria-hidden="true">handshake</span>')
      && html.includes('<span class="button-icon workspace-nav-icon" aria-hidden="true">shield</span>')
      && !html.includes("client-deals-icon")
      && !html.includes("hedge-deals-icon")
      && !html.includes("market-pulse-icon-exchange")
      && html.includes(".market-reference-brand .market-reference-icon {")
      && html.includes(".client-deal-market-pulse-brand .button-icon {"),
    usesGroupedPricingNavigation: html.includes('id="workspacePricingToggle"')
      && html.includes('aria-controls="workspacePricingMenu"')
      && html.includes('data-workspace-nav-menu-toggle="workspacePricingMenu"')
      && html.includes('data-workspace-routes="reference pricing pricing-rules"')
      && html.includes('>price_change</span>')
      && html.includes('id="workspacePricingMenu" role="menu" aria-label="Pricing" data-workspace-nav-menu hidden')
      && html.includes('class="workspace-nav-menu-link" href="#reference-data"')
      && html.includes('class="workspace-nav-menu-link" href="#execution-context"')
      && html.includes('class="workspace-nav-menu-link" href="#pricing-rules"')
      && inlineScript.includes("function setWorkspaceNavMenuOpen")
      && inlineScript.includes("workspaceNavMenuEntries.forEach(entry =>"),
    usesTabbedTradesWorkspace: html.includes('id="workspaceTradesLink"')
      && html.includes('href="#client-fx-deals"')
      && html.includes('data-workspace-routes="client-fx-deals hedge-fx-deals"')
      && html.includes('>currency_exchange</span>')
      && !html.includes('id="workspaceTradesMenu"')
      && html.includes('id="fxDealsPage"')
      && html.includes('<h1 class="page-title">Trades</h1>')
      && html.includes('id="clientFxDealsTab" href="#client-fx-deals"')
      && html.includes('id="hedgeFxDealsTab" href="#hedge-fx-deals"')
      && html.includes('role="tabpanel" aria-labelledby="clientFxDealsTab"')
      && html.includes('role="tabpanel" aria-labelledby="hedgeFxDealsTab"')
      && inlineScript.includes("function setFxDealsActiveTab(activeRoute)")
      && !html.includes('class="workspace-nav-link" href="#hedging-settings" data-workspace-route="hedging-settings"'),
    usesGroupedSettingsNavigation: html.includes('id="workspaceSettingsToggle"')
      && html.includes('aria-controls="workspaceSettingsMenu"')
      && html.includes('data-workspace-nav-menu-toggle="workspaceSettingsMenu"')
      && html.includes('data-workspace-routes="settings-currencies settings-currency-pairs hedging-settings"')
      && html.includes('id="workspaceSettingsMenu" role="menu" aria-label="Settings" data-workspace-nav-menu hidden')
      && html.includes('href="#settings:currencies" data-workspace-route="settings-currencies"')
      && html.includes('href="#settings:currency-pairs" data-workspace-route="settings-currency-pairs"')
      && html.includes('href="#hedging-settings" data-workspace-route="hedging-settings"')
      && html.includes('<span>Currency Settings</span>')
      && html.includes('<span>Currency Pair Settings</span>')
      && html.includes('<span>Hedging Settings</span>'),
    usesFxPositionAsDefaultWorkspace: !html.includes('id="homePage"')
      && !html.includes('data-workspace-route="home"')
      && html.includes('<title>FX Position</title>')
      && inlineScript.includes('function batchingBlotterRoute()')
      && inlineScript.includes('return fxPositionRoute("MANUAL");')
      && inlineScript.includes('location.hash = batchingBlotterRoute();'),
    usesImmutableClientFxDealEdit: editClientDealDialogMarkup.includes(">Edit Client Deal Comment</h2>")
      && editClientDealDialogMarkup.includes('class="modal-content"')
      && editClientDealDialogMarkup.includes(">Trade Context</div>")
      && editClientDealDialogMarkup.includes(">Trade Economics</div>")
      && editClientDealDialogMarkup.includes('id="editClientDealClientPickerValue"')
      && editClientDealDialogMarkup.includes('class="form-control client-deal-client-picker-value"')
      && editClientDealDialogMarkup.includes('id="editClientDealPricingRulePicker"')
      && editClientDealDialogMarkup.includes('class="client-deal-main-economics-row"')
      && editClientDealDialogMarkup.includes('class="client-deal-pricing-row"')
      && editClientDealDialogMarkup.includes('class="client-deal-market-pulse-card"')
      && editClientDealDialogMarkup.includes('class="client-deal-create-section client-deal-additional-section"')
      && editClientDealDialogMarkup.includes('class="client-deal-value-dates-grid"')
      && editClientDealDialogMarkup.includes("Trade Date <span data-edit-client-deal-trade-date-summary>")
      && editClientDealDialogMarkup.includes("Base Ccy Value Date <span data-edit-client-deal-base-value-date-summary>")
      && editClientDealDialogMarkup.includes("Quote Ccy Value Date <span data-edit-client-deal-quote-value-date-summary>")
      && addClientDealDialogMarkup.includes('class="client-deal-additional-comment"')
      && editClientDealDialogMarkup.includes('class="client-deal-additional-comment"')
      && editClientDealDialogMarkup.includes('name="comment" maxlength="500"')
      && !editClientDealDialogMarkup.includes('<section class="client-deal-create-section" aria-label="Comment">')
      && editClientDealDialogMarkup.includes(">Save Comment</button>")
      && inlineScript.includes("function renderLockedEditClientDealContext(deal)")
      && inlineScript.includes('return fxPositions.find(deal => String(deal.id ?? "") === normalizedDealId) || null;')
      && !inlineScript.includes("batchingRowsWithReplacement")
      && inlineScript.includes("addClientDealProfileIdentityMarkup(profile)")
      && inlineScript.includes("addClientDealPricingRuleContentMarkup(rule, context)")
      && inlineScript.includes('control.name === "comment"')
      && inlineScript.includes('deal.databaseBackedClientFxDeal !== true')
      && saveEditedDealFunction.includes('method: "PATCH"')
      && saveEditedDealFunction.includes("await refreshClientDealViewsFromApi();")
      && !saveEditedDealFunction.includes("persistClientFxDealRecord")
      && !saveEditedDealFunction.includes("targetDeal.")
      && serverSource.includes("function updateClientFxDealComment(tradeId, comment)")
      && serverSource.includes("SET comment = ?")
      && serverSource.includes('"CLIENT_FX_DEAL_IMMUTABLE"')
      && !serverSource.includes("function replaceClientFxDeal("),
    usesAuthoritativeClientDealRefresh:
      inlineScript.includes("async function refreshClientDealViewsFromApi()")
      && inlineScript.includes("async function refreshHedgeDealViewsFromApi()")
      && !reloadClientFxDealsFunction.includes("reloadFxPositionsFromApi")
      && !reloadHedgeFxDealsFunction.includes("reloadFxPositionsFromApi")
      && persistCreatedClientDealFunction.includes(
        "const createdDeal = await createClientFxDealRecord(targetDeal);"
      )
      && persistCreatedClientDealFunction.includes(
        "await refreshClientDealViewsFromApi();"
      )
      && persistCreatedClientDealFunction.includes(
        "selectedCurrencyPair = createdDeal.currencyPair;"
      )
      && !persistCreatedClientDealFunction.includes("fxPositions.push")
      && inlineScript.includes("return normalizedClientFxDeal(saved);"),
    usesHedgeFxDealsTabulator: html.includes('id="hedgeFxDealsGrid"')
      && html.includes('id="hedgeFxDealsColumnMenu"')
      && inlineScript.includes("hedgeFxDealsGrid = new Tabulator")
      && /function initializeHedgeFxDealsGrid\(data\) \{[\s\S]*?maxHeight: "calc\(100vh - 225px\)",/.test(inlineScript)
      && inlineScript.includes('title: "Trading Counterparty Details"')
      && inlineScript.includes('title: "Trade Economics"')
      && inlineScript.includes('title: "Value Date Details"')
      && inlineScript.includes('title: "Pricing Details"')
      && inlineScript.includes('formatter: fxDealsExecutionContextFormatter')
      && !html.includes('id="hedgeFxDealsTable"'),
    persistsClientFxDealAttribution: inlineScript.includes("executionContextId:")
      && inlineScript.includes("pricingRuleId:")
      && inlineScript.includes("transferRate,")
      && inlineScript.includes("analyticalPnl,"),
    usesDedicatedAddClientDealFlow: addClientDealDialogMarkup.includes('id="addClientDealDialog"')
      && addClientDealDialogMarkup.includes('id="addClientDealForm"')
      && addClientDealDialogMarkup.includes('name="counterpartyId"')
      && addClientDealDialogMarkup.includes('name="executionContextId"')
      && addClientDealDialogMarkup.includes('name="pricingRuleId"')
      && addClientDealDialogMarkup.includes('id="addClientDealPricingRulePicker"')
      && addClientDealDialogMarkup.includes('id="addClientDealMarketPulse"')
      && addClientDealDialogMarkup.includes('name="transferRate" readonly required')
      && addClientDealDialogMarkup.includes('name="analyticalPnl" readonly required')
      && !addClientDealDialogMarkup.includes('name="dealId"')
      && !addClientDealDialogMarkup.includes('name="entryDate"')
      && !addClientDealDialogMarkup.includes('name="clientCode"')
      && !addClientDealDialogMarkup.includes('name="clientName"')
      && inlineScript.includes('createDealButton.addEventListener("click", openAddClientDealDialog)')
      && inlineScript.includes("async function createClientDeal(event)")
      && !inlineScript.includes("dealFormMode")
      && !inlineScript.includes("openCreateDealDialog"),
    supportsClientOnboardingManualPricing:
      addClientDealDialogMarkup.includes('name="manualPricingReason"')
      && addClientDealDialogMarkup.includes('data-add-client-deal-manual-pricing-badge')
      && inlineScript.includes('const CLIENT_ONBOARDING_MANUAL_PRICING = "CLIENT_ONBOARDING"')
      && inlineScript.includes("Client Onboarding")
      && inlineScript.includes("Manual Pricing")
      && inlineScript.includes('pricingModeIndicatorMarkup("MANUAL_PRICING")')
      && inlineScript.includes("data-add-client-deal-onboarding-pricing")
      && !inlineScript.includes('id="addClientDealPricingRuleHelp"')
      && inlineScript.includes("Pricing Rule is pending. Transfer Rate must be entered manually.")
      && inlineScript.includes("addClientDealManualTransferEdited")
      && inlineScript.includes('pricingRuleControlStatus: onboardingPricing')
      && html.includes(".client-deal-onboarding-option")
      && html.includes(".client-deal-transfer-rate-input-group.is-manual")
      && serverSource.includes('const CLIENT_ONBOARDING_MANUAL_PRICING = "CLIENT_ONBOARDING"')
      && serverSource.includes("payload.pricingRuleId === null")
      && serverSource.includes("Manual Pricing Reason cannot be used together with a Pricing Rule."),
    usesContextRichPricingRulePicker: !addClientDealDialogMarkup.includes('for="addClientDealPricingRuleId"')
      && !addClientDealDialogMarkup.includes('id="addClientDealExecutionContext"')
      && inlineScript.includes("function addClientDealPricingRuleOptions()")
      && inlineScript.includes("function renderAddClientDealPricingRules()")
      && inlineScript.includes("Select Pricing Rule")
      && inlineScript.includes("client-deal-pricing-rule-margin")
      && inlineScript.includes("options.executionSystemLabel === true ? { executionSystemLabel: true } : {}")
      && inlineScript.includes("options.showPricingModeIndicator === false")
      && /\.client-deal-create-dialog \.client-deal-context-picker-label \{\s*margin-bottom: 0;/.test(html)
      && inlineScript.includes('addClientDealPricingRulePicker.addEventListener("click", handleAddClientDealPricingRulePicker)'),
    usesPricingRuleDropdown: inlineScript.includes("client-deal-pricing-rule-select-toggle")
      && inlineScript.includes("client-deal-pricing-rule-select-value")
      && inlineScript.includes('class="btn btn-outline-secondary client-deal-pricing-rule-select-toggle"')
      && inlineScript.includes('role="listbox"')
      && inlineScript.includes('role="option"')
      && inlineScript.includes("event.stopPropagation()")
      && addClientDealDialogMarkup.includes("client-deal-create-context-section")
      && html.includes("overflow: visible;")
      && html.includes(".client-deal-context-picker-viewport")
      && html.includes("position: absolute;"),
    autoSelectsSinglePricingRule: inlineScript.includes("options.length === 1 ? options[0] : null")
      && inlineScript.includes("effectiveSelectedRuleId"),
    keepsPricingRuleMarginVisible: html.includes(".client-deal-create-dialog .client-pricing-context-candidate-path")
      && html.includes("overflow-x: auto;")
      && html.includes(".client-deal-create-dialog .client-pricing-context-candidate-facet")
      && html.includes("flex: 0 0 auto;")
      && html.includes("min-width: max-content;"),
    usesCompactCurrencyPairBeforeClient: addClientDealDialogMarkup.indexOf('id="addClientDealCurrencyPair"')
        < addClientDealDialogMarkup.indexOf('id="addClientDealCounterpartyId"')
      && addClientDealDialogMarkup.includes('class="client-deal-currency-pair-field"')
      && html.includes("grid-template-columns: max-content minmax(0, 1fr);")
      && html.includes("grid-template-columns: max-content max-content minmax(0, 1fr);")
      && html.includes(".client-deal-create-dialog .client-deal-currency-pair-field .form-select")
      && html.includes("width: calc(7ch + 4rem);")
      && /:is\(#addClientDealDialog, #addHedgeDealDialog, #hedgingSettingsPage\)[\s\S]*?:is\(\.client-deal-currency-pair-field, \.client-deal-pricing-mode-field\) \.form-select \{[\s\S]*?height: 44px;[\s\S]*?min-height: 44px;/.test(html)
      && /:is\(#addClientDealDialog, #addHedgeDealDialog, #hedgingSettingsPage\)[\s\S]*?\.client-deal-currency-pair-field \.form-select,[\s\S]*?#hedgingSettingsPage \.client-deal-pricing-mode-field \.form-select \{[\s\S]*?font-size: var\(--app-font-size-control-emphasis\);[\s\S]*?font-weight: var\(--app-font-weight-semibold\);/.test(html)
      && /:is\(#addClientDealDialog, #addHedgeDealDialog\)[\s\S]*?\.client-deal-pricing-mode-field \.form-select \{[\s\S]*?font-size: var\(--app-font-size-control\);[\s\S]*?font-weight: var\(--app-font-weight-medium\);/.test(html),
    usesWrappingClientPicker: addClientDealDialogMarkup.includes('id="addClientDealClientPicker"')
      && addClientDealDialogMarkup.includes('id="addClientDealClientPickerValue"')
      && addClientDealDialogMarkup.includes('id="addClientDealClientPickerToggle"')
      && addClientDealDialogMarkup.includes('class="btn btn-outline-secondary client-deal-client-picker-toggle"')
      && addClientDealDialogMarkup.includes('id="addClientDealClientOptions"')
      && inlineScript.includes("function addClientDealProfileIdentityMarkup(profile)")
      && inlineScript.includes("function handleAddClientDealClientPicker(event)")
      && html.includes("overflow-wrap: anywhere;"),
    usesSearchableAddClientDealClientPicker:
      addClientDealDialogMarkup.includes('id="addClientDealClientPickerValue" placeholder="Type client name..." role="combobox"')
      && addClientDealDialogMarkup.includes('aria-autocomplete="list"')
      && addClientDealDialogMarkup.includes('id="addClientDealClientPickerClear" aria-label="Clear client" hidden')
      && inlineScript.includes('function renderAddClientDealProfileOptions(searchText = ""')
      && inlineScript.includes("function syncAddClientDealClientClearAvailability()")
      && inlineScript.includes('addClientDealClientPickerValue.addEventListener("input"')
      && inlineScript.includes("searchTerms.every(term => searchableText.includes(term))")
      && inlineScript.includes('event.target.closest("#addClientDealClientPickerClear")')
      && inlineScript.includes('addClientDealForm.elements.counterpartyId.value = "";'),
    usesSearchableAddHedgeDealCounterpartyPicker:
      addHedgeDealDialogMarkup.includes('id="addHedgeDealCounterpartyPickerValue" placeholder="Type Hedge Counterparty name..." role="combobox"')
      && addHedgeDealDialogMarkup.includes('aria-autocomplete="list"')
      && addHedgeDealDialogMarkup.includes('id="addHedgeDealCounterpartyPickerClear" aria-label="Clear Hedge Counterparty" hidden')
      && inlineScript.includes('function renderAddHedgeDealCounterpartyOptions(')
      && inlineScript.includes("function syncAddHedgeDealCounterpartyClearAvailability()")
      && inlineScript.includes('addHedgeDealCounterpartyPickerValue.addEventListener("input"')
      && inlineScript.includes('event.target.closest("#addHedgeDealCounterpartyPickerClear")')
      && inlineScript.includes('renderAddHedgeDealCounterpartyOptions(addHedgeDealCounterpartyPickerValue.value)'),
    usesUnifiedEmbeddedFieldClearButtons:
      (html.match(/class="[^"]*client-deal-client-picker-clear[^"]*"/g) || []).length === 3
      && (html.match(/class="client-pricing-context-facet-clear"/g) || []).length === 3
      && /\.client-deal-client-picker-clear \{[\s\S]*?position: static;[\s\S]*?width: 40px;[\s\S]*?min-height: 44px;[\s\S]*?border-radius: 0 !important;/.test(html)
      && /\.client-deal-client-picker-clear:hover,[\s\S]*?border-color: var\(--bs-border-color\);[\s\S]*?background: var\(--bs-secondary-bg\);/.test(html)
      && /\.client-pricing-context-facet-clear \{[\s\S]*?border-left: 1px solid var\(--large-table-line\);/.test(html)
      && /\.pricing-rule-bootstrap-dialog \.client-pricing-context-facet-clear \{[\s\S]*?border-left: 1px solid var\(--bs-border-color\);[\s\S]*?background: var\(--bs-body-bg\);/.test(html),
    usesUnifiedCustomDropdownToggles:
      (addClientDealDialogMarkup.match(/client-deal-client-picker-toggle/g) || []).length === 1
      && (addHedgeDealDialogMarkup.match(/client-deal-client-picker-toggle/g) || []).length === 1
      && addClientDealDialogMarkup.includes('client-deal-client-picker-toggle" id="addClientDealClientPickerToggle"')
      && addClientDealDialogMarkup.includes('aria-hidden="true">arrow_drop_down</span>')
      && addHedgeDealDialogMarkup.includes('client-deal-client-picker-toggle" id="addHedgeDealCounterpartyPickerToggle"')
      && addHedgeDealDialogMarkup.includes('aria-hidden="true">arrow_drop_down</span>')
      && !inlineScript.includes('addClientDealClientPickerToggle.querySelector(".button-icon").textContent')
      && !inlineScript.includes('addHedgeDealCounterpartyPickerToggle.querySelector(".button-icon").textContent')
      && (inlineScript.match(/client-deal-pricing-rule-select-toggle/g) || []).length >= 3
      && (inlineScript.match(/<span class="button-icon" aria-hidden="true">arrow_drop_down<\/span>/g) || []).length >= 3
      && /\.client-deal-client-picker-toggle,[\s\S]*?\.client-deal-pricing-rule-select-toggle \{[\s\S]*?background: var\(--bs-tertiary-bg\);[\s\S]*?color: var\(--bs-secondary-color\);/.test(html),
    usesCompactAddDealMarketQuotes:
      (html.match(/client-deal-market-pulse-card is-compact/g) || []).length === 2
      && addClientDealDialogMarkup.includes('id="addClientDealMarketQuote" role="textbox" aria-readonly="true" aria-label="Bid / Offer"')
      && addHedgeDealDialogMarkup.includes('id="addHedgeDealMarketQuote" role="textbox" aria-readonly="true" aria-label="Bid / Offer"')
      && (html.match(/class="client-deal-market-pulse-quote-bid" data-market-quote-bid/g) || []).length === 2
      && (html.match(/class="client-deal-market-pulse-quote-offer" data-market-quote-offer/g) || []).length === 2
      && !addClientDealDialogMarkup.includes('for="addClientDealMarketBid">Bid</label>')
      && !addClientDealDialogMarkup.includes('for="addClientDealMarketOffer">Offer</label>')
      && !addHedgeDealDialogMarkup.includes('for="addHedgeDealMarketBid">Bid</label>')
      && !addHedgeDealDialogMarkup.includes('for="addHedgeDealMarketOffer">Offer</label>')
      && (addClientDealDialogMarkup.match(/title="Market Pulse">monitoring<\/span>/g) || []).length === 1
      && (addHedgeDealDialogMarkup.match(/title="Market Pulse">monitoring<\/span>/g) || []).length === 1
      && (html.match(/class="visually-hidden" data-add-(?:client|hedge)-deal-market-status-text/g) || []).length === 2
      && html.includes("grid-template-columns: 40px minmax(0, 1fr) 30px;")
      && html.includes("width: 280px;")
      && html.includes("height: 36px;")
      && html.includes("background: var(--bs-tertiary-bg);")
      && /\.client-deal-market-pulse-quote-bid \{[\s\S]*?color: var\(--bs-success\);/.test(html)
      && /\.client-deal-market-pulse-quote-offer \{[\s\S]*?color: var\(--bs-danger\);/.test(html)
      && inlineScript.includes("statusIndicator.title = status;")
      && inlineScript.includes('quoteDisplay.querySelector("[data-market-quote-bid]").textContent')
      && inlineScript.includes('quoteDisplay.querySelector("[data-market-quote-offer]").textContent'),
    usesUnifiedDialogCloseButtons:
      dialogCount > 0
      && dialogCloseButtonCount === dialogCount
      && html.includes("dialog .modal-header > .btn-close {")
      && /dialog \.modal-header > \.btn-close \{[\s\S]*?width: 32px;[\s\S]*?height: 32px;[\s\S]*?border-radius: var\(--bs-border-radius\);/.test(html)
      && html.includes("dialog .modal-header > .btn-close:hover,"),
    usesMarketFirstClientDealPricingFlow:
      addClientDealDialogMarkup.includes('class="client-deal-pricing-row is-market-first"')
      && addClientDealDialogMarkup.indexOf('id="addClientDealMarketPulse"')
        < addClientDealDialogMarkup.indexOf('id="addClientDealRate"')
      && addClientDealDialogMarkup.indexOf('id="addClientDealRate"')
        < addClientDealDialogMarkup.indexOf('id="addClientDealTransferRate"')
      && addClientDealDialogMarkup.indexOf('id="addClientDealTransferRate"')
        < addClientDealDialogMarkup.indexOf('id="addClientDealAnalyticalPnl"')
      && html.includes("grid-template-columns: max-content 200px 200px 230px;")
      && html.includes("justify-content: start;"),
    usesMarketFirstHedgeDealPricingFlow:
      addHedgeDealDialogMarkup.includes('class="hedge-deal-main-economics-row"')
      && (addHedgeDealDialogMarkup.match(/client-deal-economics-field/g) || []).length === 4
      && addHedgeDealDialogMarkup.includes('class="client-deal-pricing-row is-market-first"')
      && addHedgeDealDialogMarkup.includes('id="addHedgeDealQuoteAmount"')
      && addHedgeDealDialogMarkup.indexOf('id="addHedgeDealMarketPulse"')
        < addHedgeDealDialogMarkup.indexOf('id="addHedgeDealRate"')
      && addHedgeDealDialogMarkup.indexOf('id="addHedgeDealRate"')
        < addHedgeDealDialogMarkup.indexOf('id="addHedgeDealTransferRate"')
      && addHedgeDealDialogMarkup.indexOf('id="addHedgeDealTransferRate"')
        < addHedgeDealDialogMarkup.indexOf('id="addHedgeDealAnalyticalPnl"')
      && /class="hedge-deal-main-economics-row"[\s\S]*?id="addHedgeDealSide"[\s\S]*?id="addHedgeDealBaseAmount"[\s\S]*?id="addHedgeDealQuoteAmount"[\s\S]*?id="addHedgeDealTenor"/.test(addHedgeDealDialogMarkup)
      && /\.hedge-deal-main-economics-row \{[\s\S]*?grid-template-columns: repeat\(4, minmax\(0, 1fr\)\);/.test(html)
      && /\.hedge-deal-create-dialog \.client-deal-pricing-row\.is-market-first \{[\s\S]*?grid-template-columns: repeat\(4, minmax\(0, 1fr\)\);/.test(html)
      && /\.hedge-deal-create-dialog \.client-deal-market-pulse-card,[\s\S]*?width: 100%;/.test(html)
      && inlineScript.includes("const amounts = addHedgeDealExactAmounts();")
      && inlineScript.includes("quoteInput.value = formattedMinorAmount(")
      && inlineScript.includes('document.getElementById("addHedgeDealAnalyticalPnl").value'),
    usesBootstrapClientDealDialog: addClientDealDialogMarkup.includes('class="modal-content"')
      && addClientDealDialogMarkup.includes('class="modal-header"')
      && addClientDealDialogMarkup.includes('class="modal-body"')
      && addClientDealDialogMarkup.includes('class="modal-footer"')
      && addClientDealDialogMarkup.includes('class="form-select"')
      && addClientDealDialogMarkup.includes('class="form-control')
      && addClientDealDialogMarkup.includes('class="btn btn-primary btn-sm"')
      && inlineScript.includes("clientFxDealsGrid = new Tabulator"),
    usesStructuredTradeEconomicsLayout: addClientDealDialogMarkup.includes('class="client-deal-main-economics-row"')
      && (addClientDealDialogMarkup.match(/client-deal-economics-field/g) || []).length === 4
      && addClientDealDialogMarkup.includes('class="client-deal-pricing-row is-market-first"')
      && addClientDealDialogMarkup.includes('class="client-deal-market-pulse-card is-compact"')
      && /#addClientDealDialog \.client-deal-main-economics-row,[\s\S]*?#addClientDealDialog \.client-deal-pricing-row\.is-market-first \{[\s\S]*?grid-template-columns: repeat\(4, minmax\(0, 1fr\)\);/.test(html)
      && /#addClientDealDialog \.client-deal-market-pulse-card\.is-compact \{[\s\S]*?width: 100%;/.test(html)
      && html.includes("background: var(--bs-tertiary-bg);")
      && html.includes(".client-deal-market-pulse-brand .button-icon")
      && html.includes("color: var(--bs-primary);")
      && html.includes(".client-deal-market-pulse-quote-bid")
      && html.includes(".client-deal-market-pulse-quote-offer")
      && inlineScript.includes("syncDealMarketQuotes();")
      && inlineScript.includes("syncAddClientDealMarketQuote();")
      && addClientDealDialogMarkup.indexOf('id="addClientDealRate"')
        < addClientDealDialogMarkup.indexOf('id="addClientDealTransferRate"'),
    usesNegativeClientDealPnlConfirmation: addClientDealDialogMarkup.includes('class="button-icon">payments</span>')
      && html.includes('.client-deal-pnl-input-group .client-deal-rate-icon')
      && html.includes('color: var(--bs-primary);')
      && (addClientDealDialogMarkup.match(/data-add-client-deal-loss-field/g) || []).length === 3
      && addClientDealDialogMarkup.includes('id="addClientDealLossConfirmation"')
      && addClientDealDialogMarkup.includes("Hold Ctrl and click Client Deal")
      && html.includes(".client-deal-loss-sensitive-field.is-negative-pnl")
      && inlineScript.includes("function syncAddClientDealLossState(analyticalPnl)")
      && inlineScript.includes('analyticalPnl < 0 && !controlConfirmed')
      && inlineScript.includes("function handleAddClientDealControlEnter(event)")
      && inlineScript.includes('addClientDealSubmitButton.addEventListener("click", captureAddClientDealControlConfirmation)'),
    usesBaseCurrencyClientDealSideLabels: inlineScript.includes('<option value="BUY">BUY ${escapeHtml(currencies.base)}</option>')
      && inlineScript.includes('<option value="SELL">SELL ${escapeHtml(currencies.base)}</option>')
      && inlineScript.includes('sideControl.value = selectedSide;'),
    usesInlineFixedAmountCurrencySelection: addClientDealDialogMarkup.includes('name="amountFixingCurrency" value="base"')
      && (addClientDealDialogMarkup.match(/data-add-client-deal-fixing-currency=/g) || []).length === 2
      && !addClientDealDialogMarkup.includes('>Fixed Amount Ccy</label>')
      && inlineScript.includes("function selectAddClientDealAmountFixingCurrency(event)")
      && inlineScript.includes('control.classList.toggle("is-active", isFixed)')
      && inlineScript.includes('amountInput.focus();'),
    usesCollapsibleAdditionalAttributes: addClientDealDialogMarkup.includes('id="addClientDealAdditionalDetails"')
      && addClientDealDialogMarkup.includes('>Additional Attributes</span>')
      && addClientDealDialogMarkup.includes('Trade Date <span data-add-client-deal-trade-date-summary>')
      && addClientDealDialogMarkup.includes('Base Ccy Value Date <span data-add-client-deal-base-value-date-summary>')
      && addClientDealDialogMarkup.includes('Quote Ccy Value Date <span data-add-client-deal-quote-value-date-summary>')
      && !addClientDealDialogMarkup.includes("Base and Quote Value Dates are calculated from Trade Date and Tenor.")
      && addClientDealDialogMarkup.includes('data-add-client-deal-trade-date-summary')
      && addClientDealDialogMarkup.includes('name="baseCcyValueDate" readonly')
      && addClientDealDialogMarkup.includes('name="quoteCcyValueDate" readonly')
      && addClientDealDialogMarkup.includes('data-add-client-deal-base-value-date-summary')
      && addClientDealDialogMarkup.includes('data-add-client-deal-quote-value-date-summary')
      && addClientDealDialogMarkup.includes('aria-label="Custom Trade Date"')
      && inlineScript.includes('addClientDealAdditionalDetails.open = false;')
      && inlineScript.includes('function syncAddClientDealValueDates()')
      && inlineScript.includes('addClientDealForm.elements.baseCcyValueDate.value')
      && inlineScript.includes('addClientDealForm.elements.quoteCcyValueDate.value')
      && inlineScript.includes('quoteCurrencySettlementDay: quoteValueDateLabel'),
    usesClientDealDuplicateCheck: clientDealDuplicateCheckMarkup.includes('id="clientDealDuplicateCheckDialog"')
      && clientDealDuplicateCheckMarkup.includes('id="clientDealDuplicateCheckGrid"')
      && clientDealDuplicateCheckMarkup.includes('>Check Existing Client Deals</h2>')
      && clientDealDuplicateCheckMarkup.includes('>Client Deal</span>')
      && clientDealDuplicateCheckMarkup.includes('>Cancel</button>')
      && html.includes('.client-deal-duplicate-dialog .tabulator')
      && inlineScript.includes('async function currentClientDealsForDuplicateCheck()')
      && inlineScript.includes('async function clientDealDuplicateCandidates(targetDeal)')
      && inlineScript.includes('return reloadClientFxDealsFromApi();')
      && inlineScript.includes('const currentDeals = await currentClientDealsForDuplicateCheck();')
      && !inlineScript.includes('function clientDealTradeEconomicsMatch(existingDeal, draftDeal)')
      && !inlineScript.includes('exactEconomicsMatch')
      && !clientDealDuplicateCheckMarkup.includes('Value Date Details')
      && !clientDealDuplicateCheckMarkup.includes('Exact match')
      && inlineScript.includes('clientDealDuplicateCheckGrid = new Tabulator')
      && inlineScript.includes('openClientDealDuplicateCheck(targetDeal, duplicateCandidates)')
      && inlineScript.includes('clientDealDuplicateCheckConfirmButton.addEventListener("click", confirmClientDealDuplicateCheck)'),
    usesTradingCounterpartiesLanguage: html.includes(">Trading Counterparties<")
      && html.includes(">External Counterparties<")
      && html.includes(">Internal Units<")
      && html.includes('name="counterpartyRole"'),
    usesDomainNavigationIcons:
      html.includes('<span class="button-icon workspace-nav-icon" aria-hidden="true">stacks</span>\n        <span>Batches</span>')
      && html.includes('<span class="button-icon workspace-nav-icon" aria-hidden="true">badge</span>\n        <span>Trading Counterparties</span>')
      && html.includes('<span class="button-icon workspace-nav-icon" aria-hidden="true">group</span>\n        <span>Users</span>')
      && (html.match(/>badge<\/span>/g) || []).length === 2
      && !html.includes(">manage_accounts</span>"),
    usesTradingCounterpartyColumnFilters: html.includes('id="tradingCounterpartyTypeFilter"')
      && html.includes('id="tradingCounterpartyCodeTypeFilter"')
      && html.includes('id="tradingCounterpartyExternalKindFilter"')
      && html.includes('id="tradingCounterpartyActiveFilter"')
      && html.includes('data-trading-counterparty-header-filter="active"')
      && html.includes('<option value="YES">Yes</option>')
      && html.includes('<option value="NO">No</option>')
      && (html.match(/data-trading-counterparty-header-filter=/g) || []).length === 7
      && html.includes('<option value="NON_BANK_FINANCIAL_INSTITUTION">Financial Institution</option>')
      && inlineScript.includes('normalizedExternalCounterpartyKind(field("externalCounterpartyKind")?.value)')
      && inlineScript.includes("tradingCounterpartyHeaderFilterValue")
      && inlineScript.includes('tradingCounterpartyIdSortDirection = "asc"'),
    usesUnifiedBooleanActivityPresentation:
      html.includes('data-trading-counterparty-header-filter="active"')
      && html.includes('data-user-header-filter="active"')
      && html.includes('data-reference-filter-field="isActive"')
      && html.includes('<option value="true">Yes</option>')
      && html.includes('<option value="false">No</option>')
      && inlineScript.includes('function activeBooleanOptions(selectedValue)')
      && inlineScript.includes('function activeBooleanTokenMarkup(isActive)')
      && !html.includes('data-user-header-filter="status"')
      && !html.includes('id="tradingCounterpartyStatusFilter"')
      && !inlineScript.includes('function activeStatusTokenMarkup(isActive)'),
    usesBootstrapTradingCounterpartyGrid: html.includes('class="profile-table reference-table client-profile-table unified-data-table"')
      && html.includes('class="btn btn-sm btn-outline-primary reference-new-button" id="clientProfileNewButton"')
      && html.includes('class="client-profile-actions-col"')
      && html.includes('data-profile-action="edit"')
      && !html.includes('data-profile-action="remove"')
      && html.includes('id="clientProfileDeleteButton" hidden')
      && inlineScript.includes("function updateClientProfileDeleteAvailability()")
      && inlineScript.includes('clientProfileDeleteButton.addEventListener("click"')
      && !html.includes("Trading Counterparty List")
      && !html.includes("clientProfileSearchInput"),
    usesContextualDeletePlacement:
      html.includes('id="clientPricingRuleDeleteButton" hidden')
      && !html.includes('data-client-pricing-rule-action="remove"')
      && inlineScript.includes("async function deleteClientPricingRuleFromDialog()")
      && inlineScript.includes('clientPricingRuleDeleteButton.addEventListener("click"')
      && inlineScript.includes('data-user-action="remove"')
      && inlineScript.includes('data-pricing-context-action="remove"')
      && inlineScript.includes('data-reference-action="remove"')
      && inlineScript.includes('marketGridActionMarkup("delete"'),
    usesTradingCounterpartyPricingContextBricks: inlineScript.includes("function pricingContextFacetsMarkup(contextOrId)")
      && html.includes(".client-pricing-rules-context-path")
      && inlineScript.includes('class="client-pricing-context-candidate-path client-pricing-rules-context-path"'),
    usesTradingCounterpartyDetailRoutes: html.includes('id="clientProfileListView"')
      && html.includes('id="clientProfileDetailView"')
      && html.includes('id="clientProfileBackButton"')
      && html.includes('client-profile-back-button workbench-detail-back-button" id="clientProfileBackButton"')
      && inlineScript.includes("function clientProfileRouteStateFromLocation()")
      && inlineScript.includes("function syncClientProfileRouteView()")
      && inlineScript.includes("navigateToClientProfileIndex(index)"),
    usesInlineTradingCounterpartyCreate: inlineScript.includes("function renderTradingCounterpartyCreateRow(profile)")
      && inlineScript.includes("function startTradingCounterpartyRowCreate()")
      && inlineScript.includes("function saveTradingCounterpartyFromRow(row)")
      && inlineScript.includes("data-trading-counterparty-edit-row")
      && inlineScript.includes('data-profile-action="save"')
      && inlineScript.includes('data-profile-action="cancel"')
      && inlineScript.includes('clientProfileNewButton.addEventListener("click", startTradingCounterpartyRowCreate)')
      && inlineScript.includes("navigateToClientProfileIndex(actionIndex)")
      && !inlineScript.includes("function startTradingCounterpartyRowEdit("),
    usesUnifiedConstrainedTableSizing:
      inlineScript.includes("const TABLE_COLUMN_POLICIES = Object.freeze({")
      && inlineScript.includes("function tableColumnPolicy(type)")
      && inlineScript.includes("function applySmartTableSizing(table)")
      && inlineScript.includes('"[data-smart-width-content], "')
      && inlineScript.includes("smartElementOuterWidth(composite)")
      && inlineScript.includes("executionSystemId: { min: 120, max: 360, pad: 18, ellipsize: false }")
      && html.includes('id="tradeCaptureChannelIdHeader" data-column-kind="executionSystemId"')
      && inlineScript.includes("function syncSmartCellTooltip(cell, ellipsize)")
      && inlineScript.includes("cell.dataset.tooltip = text;")
      && !inlineScript.includes("cell.dataset.smartSizingTitle")
      && inlineScript.includes("minWidth: policy.min")
      && inlineScript.includes("maxWidth: policy.max")
      && inlineScript.includes('layout: "fitDataTable"')
      && !html.includes("data-fixed-column-widths")
      && !inlineScript.includes('layout: "fitColumns"')
      && nativeTableOpenings.length > 0
      && nativeTableOpenings.every(markup =>
        /\bclass="[^"]*\b(?:batching-table|blotter-table|profile-table|generation-settings-table)\b/.test(markup)
      )
      && html.includes('class="form-field counterparty-name-field"'),
    usesBootstrapPricingRuleDialog: html.includes('class="deal-dialog client-pricing-rule-dialog pricing-rule-bootstrap-dialog"')
      && html.includes('class="deal-form modal-content" id="clientPricingRuleForm"')
      && html.includes('class="dialog-head modal-header"')
      && html.includes('class="dialog-close btn-close" id="clientPricingRuleDialogClose"')
      && html.includes('class="dialog-actions modal-footer"')
      && html.includes(".pricing-rule-bootstrap-dialog .pricing-rule-bootstrap-section")
      && html.includes(".pricing-rule-bootstrap-dialog .modal-footer .btn"),
    usesPolicyAwarePricingRuleEditing:
      html.includes('id="clientPricingRuleContextSearchSection" aria-label="Find Execution Context"')
      && html.includes('id="clientPricingRuleFixedTermsSection" aria-label="Pricing Rule fixed terms" hidden')
      && html.includes('id="clientPricingRuleCurrencyPairField"')
      && html.includes('name="positionManagementModeOverride"')
      && inlineScript.includes('clientPricingRuleContextSearchSection.hidden = contextFixed;')
      && inlineScript.includes('clientPricingRuleFixedTermsSection.hidden = !contextFixed;')
      && inlineScript.includes('clientPricingRuleCurrencyPairField.hidden = editing;')
      && inlineScript.includes('function clientPricingRulePositionManagementModeMarkup(rule, context = null)')
      && pricingRulePositionModeViewSource.includes(
        "client-pricing-configuration-node-copy is-read-only"
      )
      && !pricingRulePositionModeViewSource.includes(
        "client-pricing-configuration-inheritance-indicator"
      )
      && !pricingRulePositionModeViewSource.includes(">link</span>")
      && !pricingRulePositionModeViewSource.includes(">edit</span>")
      && !pricingRulePositionModeViewSource.includes("Execution Context Default")
      && !/Pricing Rule override|Effective:/.test(pricingRulePositionModeViewSource)
      && inlineScript.includes("client-pricing-configuration-rule-piece is-pair")
      && inlineScript.includes('data-tooltip="Ccy Pair">swap_horiz</span>')
      && inlineScript.includes("client-pricing-configuration-rule-piece is-mode")
      && inlineScript.includes('data-tooltip="FX Position Mode">table_chart</span>')
      && inlineScript.includes("client-pricing-configuration-rule-piece is-margin")
      && inlineScript.includes('data-tooltip="Margin">savings</span>')
      && inlineScript.includes('client-pricing-configuration-context-title">\n                    <span class="button-icon" aria-hidden="true">hub</span>')
      && !inlineScript.includes('data-tooltip="Execution Context">hub</span>')
      && inlineScript.includes('client-pricing-configuration-context-label">Execution Context</span>')
      && inlineScript.includes("pricingContextFacetsMarkup(context, { executionSystemLabel: true })")
      && !inlineScript.includes('client-pricing-configuration-context-meta')
      && !inlineScript.includes('data-tooltip="Pricing Mode">price_change</span>')
      && !inlineScript.includes('client-pricing-configuration-context-label">Pricing Context</span>')
      && !inlineScript.includes("with Pricing Mode =")
      && html.includes(".client-pricing-configuration-branch {")
      && html.includes("border-left: 1px solid var(--bs-border-color);")
      && usesPricingRulePositionModeInheritanceControls
      && !clientPricingRuleInlineEditorSource.includes('positionManagementModeChoice')
      && inlineScript.includes('? savedRule.currencyPair')
      && serverSource.includes('function validatePricingRuleUpdatePayload(body, current)')
      && serverSource.includes('function pricingRuleImmutableTermsChanged(body, current)')
      && serverSource.includes('"PRICING_RULE_TERMS_IMMUTABLE"')
      && serverSource.includes('SET margin_percent = ?,')
      && serverSource.includes('position_management_mode_override = ?'),
    usesMutedUnavailablePricingContextOptions: inlineScript.includes('option.matchCount === 0 ? " is-unavailable" : ""')
      && html.includes(".pricing-rule-bootstrap-dialog .client-pricing-context-option.is-unavailable")
      && html.includes("color: var(--bs-tertiary-color, #6c757d)")
      && html.includes(".client-pricing-context-option-count {\n      color: inherit;\n      font-weight: 400;"),
    usesFilterAwareSmartSizing: inlineScript.includes("function smartHeaderMinimumWidth(headerCell, policy)")
      && inlineScript.includes('headerCell.querySelector(".reference-filterable-head")')
      && inlineScript.includes("smartElementOuterWidth(filterTrigger)")
      && inlineScript.includes("const headerWidth = smartHeaderMinimumWidth(headerCell, policy)"),
    usesTradingCounterpartyExecutionContextAssignments:
      html.includes('id="clientExecutionContextsPanel"')
      && html.includes('id="clientExecutionContextsAttachButton"')
      && html.includes('class="btn btn-sm btn-primary reference-new-button" id="clientExecutionContextsAttachButton"')
      && html.includes('<span id="clientExecutionContextsAttachButtonLabel">Attach Execution Context</span>')
      && inlineScript.includes('class="btn btn-sm btn-primary reference-new-button client-pricing-configuration-add-rule"')
      && html.includes('id="clientExecutionContextAttachDialogTitle">Attach Execution Contexts</h2>')
      && (html.match(/data-client-context-attach-filter=/g) || []).length === 5
      && html.includes('id="clientExecutionContextAttachSelectAll"')
      && html.includes('id="clientExecutionContextAttachSubmitButton" disabled')
      && inlineScript.includes("async function refreshTradingCounterpartyExecutionContexts(profile, options = {})")
      && inlineScript.includes("function availableExecutionContextsForProfile(profile)")
      && inlineScript.includes("async function attachSelectedExecutionContexts(event)")
      && inlineScript.includes("JSON.stringify({ executionContextIds: executionContextIds.map(Number) })")
      && inlineScript.includes("async function detachClientExecutionContext(profile, contextId)")
      && inlineScript.includes("data-client-execution-context-action=\"detach\"")
      && inlineScript.includes("pricingRuleCount > 0"),
    pricingRulesUseDirectExecutionContexts: html.includes('id="clientPricingRuleContextSearchSection" aria-label="Find Execution Context"')
      && inlineScript.includes("availablePricingRuleExecutionContextIds()")
      && inlineScript.includes("Select an existing Execution Context."),
    usesPricingRuleContextBuilder: html.includes('id="clientPricingContextBuilder"')
      && html.includes('aria-label="Find Execution Context"')
      && html.includes('<span class="button-icon" aria-hidden="true">filter_alt</span>')
      && html.includes("Use the filters below to find an existing Execution Context.")
      && (html.match(/placeholder="Filter by code or name"/g) || []).length === 3
      && html.includes('data-pricing-context-facet="servicingBranchCode"')
      && html.includes('data-pricing-context-facet="settlementSystemId"')
      && html.includes('data-pricing-context-facet="tradeCaptureChannelId"')
      && html.includes('id="clientPricingContextResults"')
      && html.includes('id="clientPricingLocationMenu" role="listbox"')
      && html.includes('data-pricing-context-toggle="servicingBranchCode"')
      && html.includes('<input type="hidden" name="pricingContextId">')
      && inlineScript.includes("matchingClientPricingRuleContexts")
      && inlineScript.includes("openClientPricingContextFacetMenu")
      && inlineScript.includes("selectClientPricingContext")
      && inlineScript.includes("clientPricingContextCandidatesExpanded")
      && inlineScript.includes("data-pricing-context-results-toggle")
      && inlineScript.includes("No matching Execution Context"),
    usesVerticalPricingRuleContextLayout: html.includes("width: min(720px, calc(100vw - 32px))")
      && html.includes(".client-pricing-context-facets {\n      display: grid;\n      grid-template-columns: minmax(0, 1fr);")
      && html.includes("grid-template-columns: 28px minmax(0, 1fr) auto 28px"),
    suppressesDuplicatePricingContextClear: (html.match(/class="client-pricing-context-facet-clear"/g) || []).length === 3
      && html.includes('input[type="search"]::-webkit-search-cancel-button')
      && html.includes('input[type="search"]::-ms-clear')
      && html.includes(".client-pricing-context-facet-clear[hidden]"),
    usesHumanReadablePricingContextCandidates: inlineScript.includes("return pricingContextFacetDisplayName(field, code) || code")
      && inlineScript.includes('class="client-pricing-context-candidate-path"')
      && inlineScript.includes('class="button-icon client-pricing-context-candidate-facet-icon"')
      && inlineScript.includes("Execution Context selected")
      && inlineScript.includes("const searchable = [")
      && inlineScript.includes("const selectedDisplayValue = clientPricingContextBuilderState[field]")
      && !html.includes("client-pricing-context-candidate-code")
      && !html.includes("client-pricing-context-summary-code"),
    usesMutedPricingContextBricks: inlineScript.includes('data-pricing-context-candidate-facet="${escapeHtml(field)}"')
      && html.includes('data-pricing-context-candidate-facet="servicingBranchCode"')
      && html.includes("background: var(--palette-gray-200)")
      && html.includes("background: var(--palette-green-100)")
      && html.includes("background: var(--palette-purple-100)")
      && !html.includes("client-pricing-context-candidate-separator"),
    avoidsTradingCounterpartyCodeAutoSelect: !inlineScript.includes("clientProfileForm.elements.inn.select()"),
    usesSynchronizedContextIcons: /data-reference-route="servicingBranch">\s*<span class="button-icon" aria-hidden="true">location_on<\/span>/.test(html)
      && /data-reference-route="tradeCaptureChannel">\s*<span class="button-icon" aria-hidden="true">terminal<\/span>/.test(html)
      && /client-pricing-context-facet-icon" aria-hidden="true">location_on<\/span>/.test(html)
      && /client-pricing-context-facet-icon" aria-hidden="true">terminal<\/span>/.test(html),
    supportsRequiredCounterpartyTypes: inlineScript.includes('const COUNTERPARTY_ROLES = ["CLIENT", "HEDGE_COUNTERPARTY"]')
      && inlineScript.includes('const COUNTERPARTY_SCOPES = ["EXTERNAL", "INTERNAL"]')
      && serverSource.includes('const COUNTERPARTY_ROLES = ["CLIENT", "HEDGE_COUNTERPARTY"]')
      && serverSource.includes('const COUNTERPARTY_SCOPES = ["EXTERNAL", "INTERNAL"]'),
    supportsRequiredCounterpartyCodeTypes: inlineScript.includes('const EXTERNAL_COUNTERPARTY_CODE_TYPES = ["INN", "OTHER"]')
      && inlineScript.includes('const INTERNAL_UNIT_TYPES = ["DESK", "DEPARTMENT", "OTHER"]')
      && serverSource.includes('const EXTERNAL_COUNTERPARTY_CODE_TYPES = ["INN", "OTHER"]')
      && serverSource.includes('const INTERNAL_UNIT_TYPES = ["DESK", "DEPARTMENT", "OTHER"]')
      && schemaSource.includes("CREATE TABLE IF NOT EXISTS external_counterparties")
      && schemaSource.includes("CREATE TABLE IF NOT EXISTS internal_units")
      && schemaSource.includes("CREATE TABLE IF NOT EXISTS trading_counterparty_roles"),
    usesExplicitTooltipLayer: html.includes('id="appTooltip" role="tooltip" aria-hidden="true" popover="manual"')
      && inlineScript.includes("initializeTooltips();")
      && inlineScript.includes("migrateNativeTooltips();")
      && inlineScript.includes('typeof appTooltipEl.showPopover === "function"')
      && inlineScript.includes('target.closest("dialog") || document.body')
      && !html.includes('cursor: help;'),
    usesUnifiedIconCursor: html.includes('.button-icon,\n    [role="img"] {')
      && html.includes(':is(button, a, [role="button"]) .button-icon,')
      && html.includes('user-select: none;'),
    usesLocalMaterialSymbols: !html.includes("fonts.googleapis.com")
      && !html.includes("fonts.gstatic.com")
      && html.includes('@font-face {')
      && html.includes('font-family: "Material Symbols Outlined";')
      && html.includes('url("./vendor/material-symbols/material-symbols-outlined.woff2") format("woff2")')
      && html.includes('font-feature-settings: "liga";')
      && serverSource.includes('".woff2": "font/woff2"')
      && fs.existsSync(path.join(root, "vendor", "material-symbols", "material-symbols-outlined.woff2")),
    explicitTooltipCount: (html.match(/\bdata-tooltip=/g) || []).length,
    usesExplicitTradeIdCopy: html.includes('data-copy-trade-id="${safeTradeId}"')
      && inlineScript.includes("function fxPositionTradeId(deal)")
      && inlineScript.includes("showTradeIdCopyFeedback(copyButton, copied)")
      && html.includes('data-tooltip="Copy Trade ID"')
      && html.includes('<th class="trade-id-column common-head">ID</th>')
      && inlineScript.includes('<td class="identity trade-id-column">${tradeIdCopyButton}</td>')
      && !html.includes("data-copy-position-id")
      && !html.includes("trade-id-copy-value"),
    usesLocalTradeIdCopyFeedback: html.includes(".trade-id-copy.is-copied")
      && html.includes(".trade-id-copy.is-copy-error")
      && inlineScript.includes("function showTradeIdCopyFeedback(button, copied)")
      && !html.includes('id="tradeCopyErrorToast"'),
    usesServicingLocationConstraints: html.includes('data-reference-field="servicingBranchCode" value="${escapeHtml(item.servicingBranchCode)}" maxlength="10"')
      && html.includes('data-reference-field="servicingBranchName" value="${escapeHtml(item.servicingBranchName)}" maxlength="50"')
      && html.includes('data-reference-field="region" value="${escapeHtml(item.region)}" maxlength="50"')
      && serverSource.includes('SERVICING_LOCATION_ID_MAX_LENGTH = 10')
      && serverSource.includes('SERVICING_LOCATION_NAME_MAX_LENGTH = 50')
      && serverSource.includes('SERVICING_LOCATION_REGION_MAX_LENGTH = 50')
      && inlineScript.includes('count: { min: 64, max: 80')
      && html.includes('data-reference-panel="servicingBranch"')
      && !html.includes('id="servicingLocationUsageInfo"'),
    usesServicingLocationIdSort: html.includes('id="servicingBranchIdSort"')
      && html.includes('id="servicingBranchIdHeader" aria-sort="ascending"')
      && inlineScript.includes('servicingBranchIdSortDirection = "asc"'),
    usesAccountingSystemTextLimits: html.includes('data-reference-field="settlementSystemId"')
      && html.includes('data-reference-field="settlementSystemId" value="${escapeHtml(item.settlementSystemId)}" maxlength="20"')
      && html.includes('data-reference-field="settlementSystemName" value="${escapeHtml(item.settlementSystemName)}" maxlength="50"')
      && serverSource.includes('ACCOUNTING_SYSTEM_ID_MAX_LENGTH = 20')
      && inlineScript.includes('count: { min: 64, max: 80')
      && html.includes('data-reference-panel="settlementSystem"')
      && !html.includes('id="accountingSystemUsageInfo"')
      && !serverSource.includes('pricingRuleCount')
      && !inlineScript.includes('description: persistedItem.description'),
    usesAccountingSystemIdSort: html.includes('id="settlementSystemIdSort"')
      && html.includes('id="settlementSystemIdHeader" aria-sort="ascending"')
      && inlineScript.includes('settlementSystemIdSortDirection = "asc"'),
    usesExecutionSystemTextLimits: html.includes('data-reference-field="tradeCaptureChannelId" value="${escapeHtml(item.tradeCaptureChannelId)}" maxlength="30"')
      && html.includes('data-reference-field="tradeCaptureChannelName" value="${escapeHtml(item.tradeCaptureChannelName)}" maxlength="50"')
      && serverSource.includes('EXECUTION_SYSTEM_ID_MAX_LENGTH = 30')
      && serverSource.includes('EXECUTION_SYSTEM_NAME_MAX_LENGTH = 50')
      && inlineScript.includes('count: { min: 64, max: 80')
      && html.includes('data-reference-panel="tradeCaptureChannel"')
      && !html.includes('id="executionSystemUsageInfo"'),
    usesExecutionSystemIdSort: html.includes('id="tradeCaptureChannelIdSort"')
      && html.includes('aria-sort="ascending"')
      && inlineScript.includes('tradeCaptureChannelIdSortDirection = "asc"')
      && (html.match(/class="reference-sort-indicator"/g) || []).length >= 6
      && !html.includes('arrow_upward'),
    usesGracefulWindowsShutdown: serverSource.includes('server.closeAllConnections();')
      && serverSource.includes('let shutdownStarted = false;')
      && startScript.includes('if not "%EXIT_CODE%"=="0" (')
      && startScript.includes("  pause\n)"),
    usesInlineExecutionContextEditor: !html.includes('id="pricingContextDialog"')
      && !html.includes('id="pricingContextForm"')
      && inlineScript.includes("function renderPricingContextEditRow(context, index)")
      && inlineScript.includes("function savePricingContextFromRow(row)")
      && inlineScript.includes("updatePricingContextRowSaveAvailability(row)")
      && inlineScript.includes('data-pricing-context-edit-row')
      && html.includes('#pricingPage.unified-bootstrap-workspace [data-pricing-context-action="save"]')
      && html.includes("--bs-btn-color: var(--app-primary);")
      && html.includes("--bs-btn-border-color: var(--app-primary);"),
    usesReferenceLabelsInExecutionContexts:
      inlineScript.includes("item => item.tradeCaptureChannelName")
      && inlineScript.includes('pricingContextFacetMarkup(context, "servicingBranchCode")')
      && inlineScript.includes('pricingContextFacetMarkup(context, "settlementSystemId")')
      && inlineScript.includes("executionSystemLabelMarkup(executionSystemName, executionSystem?.pricingType)")
      && inlineScript.includes("pricingTypePresentation(pricingMode).label"),
    usesExecutionContextNames: html.includes(">Servicing Location</span>")
      && html.includes(">Accounting System</span>")
      && html.includes(">Execution System</span>"),
    usesExecutionContextUsage:
      html.includes('aria-label="Attached Trading Counterparties"')
      && html.includes('data-tooltip="Attached Trading Counterparties"')
      && !html.includes('id="pricingContextUsageInfo"'),
    usesExecutionContextColumnWidths:
      html.includes('id="executionContextsTable" data-ui-table-layout-key="execution_contexts_grid"')
      && html.includes('data-ui-column-key="servicing_location"')
      && html.includes('data-ui-column-key="counterparties_count"')
      && uiTableLayoutsSource.includes('execution_contexts_grid: layout("Execution Context", [')
      && uiTableLayoutsSource.includes('["servicing_location", "Servicing Location", 250]')
      && uiTableLayoutsSource.includes('["accounting_system", "Accounting System", 300]')
      && uiTableLayoutsSource.includes('["execution_system", "Execution System", 250]')
      && uiTableLayoutsSource.includes('["auto_hedging_admission_mode", "Auto Hedging Admission", 232]')
      && uiTableLayoutsSource.includes(
        '["counterparties_count", "Trading Counterparties Count", 64]'
      )
      && uiTableLayoutsSource.includes('legacyColumnKey: "pricing_rules_count"')
      && uiTableLayoutsSource.includes('columnKey: "counterparties_count"')
      && inlineScript.includes("function applyNativeUiTableLayout(tableKey, tableLayout)")
      && !html.includes("data-fixed-column-widths")
      && !html.includes(">Execution Context List<"),
    usesExecutionContextHeaderFiltersAndSort: html.includes('id="pricingContextIdSort"')
      && html.includes('id="pricingContextIdHeader" aria-sort="ascending"')
      && (html.match(/data-pricing-context-header-filter=/g) || []).length === 6
      && inlineScript.includes('pricingContextIdSortDirection = "asc"')
      && inlineScript.includes("pricingContextMatchesHeaderFilters"),
    usesConciseIntegerIdHeaders: html.includes('class="profile-table pricing-context-table unified-data-table"')
      && html.includes('data-ui-table-layout-key="execution_contexts_grid"')
      && html.includes('<table class="profile-table pricing-rules-table unified-data-table" id="pricingRulesTable"')
      && html.includes('id="pricingRuleIdSort"')
      && html.includes('id="pricingRuleIdHeader" aria-sort="ascending"')
      && (html.match(/data-pricing-rule-header-filter=/g) || []).length === 6
      && inlineScript.includes('pricingRuleIdSortDirection = "asc"')
      && inlineScript.includes('function updatePricingRuleIdSortControl()')
      && html.includes('<span class="reference-column-title">Margin</span>')
      && inlineScript.includes('primaryId: { min: 64, max: 110')
      && inlineScript.includes(
        '<td>${escapeHtml(editNumber(rule.marginPercent, 2))}%</td>'
      )
      && !html.includes('<input type="text" name="pricingContextId" placeholder="Assigned on save" readonly>')
      && !html.includes('id="pricingContextSearchInput"')
      && !html.includes("<th>Execution Context ID</th>")
      && !html.includes("<th>Pricing Rule ID</th>"),
    usesHumanReadablePricingRuleContexts: inlineScript.includes("function pricingContextDisplayPath(contextOrId)")
      && inlineScript.includes("pricingContextDisplayPath(rule.pricingContextId)")
      && inlineScript.includes('class="client-pricing-context-candidate-path pricing-rules-context-path"')
      && inlineScript.includes("pricingContextFacetsMarkup(rule.pricingContextId, { executionSystemLabel: true })")
      && inlineScript.includes('if (options.executionSystemLabel === true && field === "tradeCaptureChannelId")')
      && html.includes('<th class="pricing-rule-context-column">')
      && html.includes('<span class="reference-column-title">Execution Context</span>')
      && inlineScript.includes('contextPath: { min: 280, max: 620')
      && inlineScript.includes('classes.contains("pricing-rule-context-column")')
      && inlineScript.includes(".pricing-rules-context-path, .client-pricing-context-candidate-path")
      && inlineScript.includes("Math.ceil(compositeWidth + smartHorizontalChrome(cell))"),
    usesLocalBootstrapAndTabulator: html.includes('./vendor/bootstrap/bootstrap.min.css')
      && html.includes('./vendor/tabulator/tabulator_bootstrap5.min.css')
      && html.includes('./vendor/tabulator/tabulator.min.js')
      && fs.existsSync(path.join(root, 'vendor', 'bootstrap', 'bootstrap.min.css'))
      && fs.existsSync(path.join(root, 'vendor', 'tabulator', 'tabulator_bootstrap5.min.css'))
      && fs.existsSync(path.join(root, 'vendor', 'tabulator', 'tabulator.min.js')),
    usesBootstrapMarketPulse: /<main class="[^"]*\bmarket-bootstrap\b[^"]*" id="marketPage"/.test(html)
      && !html.includes('class="nav nav-underline market-tabs reference-switcher"')
      && html.includes('id="marketPageTitle">Market Pulse</h1>')
      && html.includes('class="btn btn-sm btn-outline-primary process-toggle-button" id="marketStreamToggleButton"')
      && html.includes('class="market-bootstrap-dialog market-simulation-dialog" id="marketSimulationDialog"'),
    usesTabulatorMarketPulseGrids: html.includes('id="marketCcyOptionRows"')
      && html.includes('id="marketPairOptionRows"')
      && html.includes('id="marketStreamTable"')
      && inlineScript.includes('marketCcyOptionGrid = new Tabulator')
      && inlineScript.includes('marketPairOptionGrid = new Tabulator')
      && inlineScript.includes('marketStreamGrid = new Tabulator')
      && inlineScript.includes('marketStreamGrid.updateData'),
    usesCompactStaticMarketStreamColumns:
      inlineScript.includes('tabulatorSizedColumn("pair", { title: "Ccy Pair", field: "currencyPair", headerFilter: "input", headerSort: true })')
      && (inlineScript.match(/tabulatorSizedColumn\("rate", \{/g) || []).length >= 3
      && inlineScript.includes('title: "Bid",\n            field: "bid",\n            headerSort: false')
      && inlineScript.includes('title: "Offer",\n            field: "offer",\n            headerSort: false')
      && inlineScript.includes('tabulatorSizedColumn("actions", {')
      && inlineScript.includes('layout: "fitDataTable"')
      && html.includes('#marketPage.market-bootstrap.workbench-page .market-bootstrap-panel {\n      justify-self: start;\n      width: fit-content;')
      && html.includes('#marketPage.market-bootstrap.workbench-page .market-grid-frame {\n      width: fit-content;')
      && html.includes('#marketPage.market-bootstrap.workbench-page .market-tabulator {\n      width: max-content;')
      && !html.includes('[data-market-panel="streams"] .market-grid-frame {\n      width: min(426px'),
    usesMarketPulseRoute: html.includes('href="#market-pulse" data-workspace-route="market"')
      && inlineScript.includes('function marketRoute()')
      && inlineScript.includes('return "#market-pulse";')
      && inlineScript.includes('function settingsRoute(kind = "currencies")')
      && inlineScript.includes('return kind === "pairs"')
      && inlineScript.includes('function currencySettingsRouteStateFromLocation(hash = location.hash)')
      && inlineScript.includes('function isCurrencySettingsRoute()')
      && inlineScript.includes('return currencySettingsRouteStateFromLocation().matches;')
      && inlineScript.includes('location.hash === "#market-pulse"')
      && !html.includes('href="#market-pulse:ccy-options"')
      && !html.includes('href="#market-pulse:ccy-pair-options"'),
    usesCcyOptionLimits: serverSource.includes('CCY_OPTION_NAME_MAX_LENGTH = 20')
      && serverSource.includes('CCY_OPTION_COUNTRY_MAX_LENGTH = 30')
      && serverSource.includes('function migrateCcyOptionsConstraints(sqlite)')
      && inlineScript.includes('const ccyOptionTextLimits = Object.freeze({ code: 3, name: 20, country: 30 });')
      && inlineScript.includes('pattern="${pattern}"')
      && inlineScript.includes('function marketCcyTextIsValid(value, maxLength)'),
    usesCompactCcyOptionColumns:
      inlineScript.includes('tabulatorSizedColumn("code", { title: "Code"')
      && inlineScript.includes('tabulatorSizedColumn("name", { title: "Name"')
      && inlineScript.includes('tabulatorSizedColumn("name", { title: "Country"')
      && inlineScript.includes('title: tabulatorIconColumnTitle("decimal_increase", "Fraction Digits")')
      && inlineScript.includes('title: "Ccy Pairs",\n            field: "pairCount"')
      && inlineScript.includes('formatter: marketCcyPairsViewFormatter')
      && inlineScript.includes('headerSort: true')
      && (inlineScript.match(/headerSort: false/g) || []).length >= 6
      && inlineScript.includes('initialSort: [{ column: "code", dir: "asc" }]')
      && !html.includes('[data-market-panel="currencies"] .market-grid-frame {\n      width: min(816px'),
    usesCompactCcyPairOptionColumns:
      inlineScript.includes('tabulatorSizedColumn("code", { title: "Base Ccy"')
      && inlineScript.includes('tabulatorSizedColumn("code", { title: "Quote Ccy"')
      && inlineScript.includes('tabulatorSizedColumn("pair", { title: "Ccy Pair"')
      && inlineScript.includes('title: tabulatorIconColumnTitle("decimal_increase", "Default Quote Decimals")')
      && inlineScript.includes('title: tabulatorIconColumnTitle("rule", "Pricing Rules using this Ccy Pair")')
      && inlineScript.includes('initialSort: [{ column: "currencyPair", dir: "asc" }]')
      && inlineScript.includes('field: "pricingRulesCount"')
      && inlineScript.includes('formatter: marketPairPricingRulesViewFormatter')
      && inlineScript.includes('Delete unavailable: ${item.currencyPair} is used in ${pricingRulesCount} ${ruleLabel}.')
      && !html.includes('[data-market-panel="pairs"] .market-grid-frame {\n      width: min(680px'),
    usesCurrencySettingsRelatedDrilldowns:
      html.includes('id="marketSettingsBreadcrumb" hidden')
      && html.includes('id="pricingRulesBreadcrumb" hidden')
      && inlineScript.includes('data-market-grid-action="${escapeHtml(action)}"')
      && inlineScript.includes('"view-currency-pairs"')
      && inlineScript.includes('"view-pricing-rules"')
      && inlineScript.includes('function currencyPairSettingsForCurrencyRoute(currencyCode, returnHash = location.hash)')
      && inlineScript.includes('function pricingRulesForCcyPairRoute(')
      && inlineScript.includes('pair.baseCcy === marketSettingsRouteScope.currencyCode')
      && inlineScript.includes('pair.quoteCcy === marketSettingsRouteScope.currencyCode')
      && inlineScript.includes('rule.ccyPairCode === pricingRulesRouteScope.pairCode')
      && inlineScript.includes('marketPairOptionNewButton.hidden = Boolean(marketSettingsRouteScope)')
      && inlineScript.includes('actionsColumn.hide()')
      && inlineScript.includes('currencyPairFilter.readOnly = true'),
    usesUnifiedActionsColumnWidth: html.includes('--workbench-actions-column-width: 80px;')
      && inlineScript.includes('getPropertyValue("--workbench-actions-column-width")')
      && inlineScript.includes('min: smartActionsColumnWidth')
      && inlineScript.includes('max: smartActionsColumnWidth')
      && inlineScript.includes('tabulatorSizedColumn("actions", {'),
    usesUnifiedFilterFocus: html.includes('Header filters and inline Reference Data editors share one non-shifting Bootstrap focus treatment.')
      && html.includes('.tabulator-header-filter input:focus,')
      && html.includes('.reference-header-filter:focus,')
      && html.includes('.inline-edit-control:focus {')
      && html.includes(':is(#pricingPage, #referenceDataPage).unified-bootstrap-workspace.workbench-page .inline-edit-control {')
      && html.includes('border-radius: var(--workbench-radius);'),
    disablesTabulatorColumnMoving: !inlineScript.includes('movableColumns: true')
      && (inlineScript.match(/movableColumns: false/g) || []).length >= 2,
    disablesTabulatorColumnResizing: !inlineScript.includes('resizable: true')
      && (inlineScript.match(/resizableColumns: false/g) || []).length >= 2
      && (inlineScript.match(/resizable: false/g) || []).length >= 2,
    usesInlineMarketPulseEditors: !html.includes('id="marketCcyOptionDialog"')
      && !html.includes('id="marketPairOptionDialog"')
      && !html.includes('id="marketCcyOptionForm"')
      && !html.includes('id="marketPairOptionForm"')
      && html.includes('class="market-bootstrap-dialog market-simulation-dialog"')
      && html.includes('id="marketSimulationForm"')
      && inlineScript.includes('startMarketCcyOptionEdit')
      && inlineScript.includes('saveMarketCcyOptionFromRow')
      && inlineScript.includes('startMarketPairOptionEdit')
      && inlineScript.includes('saveMarketPairOptionsFromRow')
      && inlineScript.includes('market-inline-edit-row')
      && inlineScript.includes('saveMarketSimulationSettingsFromForm'),
    preservesMarketReferenceEditorsDuringQuoteUpdates:
      inlineScript.includes('function renderMarketQuoteState()')
      && /function applyMarketPulseSimulationSnapshot\(snapshot\)[\s\S]*?renderMarketQuoteState\(\);/.test(inlineScript)
      && /function renderMarketPage\(\)[\s\S]*?renderMarketCcyOptionRows\(\);[\s\S]*?renderMarketPairOptionRows\(\);[\s\S]*?renderMarketQuoteState\(\);/.test(inlineScript)
      && inlineScript.includes('setMarketStatus("Market Pulse Simulation connection lost. Reconnecting...");\n        renderMarketQuoteState();'),
    usesSemanticMarketCommands: html.includes('class="btn btn-sm btn-outline-primary" id="marketCcyOptionNewButton"')
      && html.includes('class="btn btn-sm btn-outline-primary" id="marketPairOptionNewButton"')
      && html.includes('class="btn btn-sm btn-outline-primary process-toggle-button" id="marketStreamToggleButton"')
      && !html.includes('id="marketStreamToggleButton" aria-label="Start stream" title="Start stream"')
      && inlineScript.includes('marketStreamToggleButton.classList.toggle("is-running", marketStreamRunning)')
      && html.includes('#marketPage.market-bootstrap #marketStreamToggleButton.is-running {')
      && html.includes('background: var(--app-process-running);'),
    usesSeparatedDialogActions: html.includes('.market-bootstrap-dialog .modal-footer > * {')
      && /\.market-bootstrap-dialog \.modal-footer \{[\s\S]*?gap: 8px;/.test(html)
      && /\.dialog-actions \{[\s\S]*?gap: 8px;/.test(html)
      && /\.profile-form-actions \{[\s\S]*?gap: 8px;/.test(html),
    avoidsDoubleTabbedPageDividers: html.includes('class="settings-topbar workbench-page-header" id="marketPageHeader"')
      && html.includes('class="settings-topbar workbench-page-header" aria-label="Reference Data header"')
      && /\.workbench-page-header\s*\{\s*border-bottom:\s*0;/.test(html),
    usesLargeClientFxDealsTabulator: html.includes('id="clientFxDealsPage"')
      && html.includes('client-deals-bootstrap unified-bootstrap-workspace workbench-page')
      && html.includes('id="clientFxDealsGrid"')
      && !html.includes('id="clientFxDealsTable"')
      && !html.includes('id="clientFxDealRows"')
      && inlineScript.includes('clientFxDealsGrid = new Tabulator')
      && /function initializeClientFxDealsGrid\(data\) \{[\s\S]*?maxHeight: "calc\(100vh - 225px\)",/.test(inlineScript)
      && inlineScript.includes('renderVertical: "virtual"')
      && inlineScript.includes('layout: "fitData"')
      && inlineScript.includes('title: "Trade Details"')
      && inlineScript.includes('title: "Trade ID"')
      && inlineScript.includes('title: "Client Details"')
      && inlineScript.includes('title: "Execution Timestamp"')
      && inlineScript.includes('title: "Received Timestamp"')
      && inlineScript.includes('title: "Trade Economics"')
      && inlineScript.includes('title: "Client Side"')
      && inlineScript.includes('title: "Value Date Details"')
      && inlineScript.includes('field: "baseCcyValueDate"')
      && inlineScript.includes('field: "quoteCcyValueDate"')
      && inlineScript.includes('title: "Pricing Details"')
      && inlineScript.includes('title: "Execution Context"')
      && inlineScript.includes('title: "Margin %", field: "pricingRuleMargin"')
      && inlineScript.includes('pricingRuleMargin: fxDealPricingRuleMargin(deal)')
      && !inlineScript.includes('field: "pricingRuleLabel"')
      && inlineScript.includes('transferRate: "rate"')
      && inlineScript.includes('tabulatorSizedColumn("transferRate", { title: "Transfer Rate"')
      && inlineScript.includes('deal?.inn || deal?.clientCode || ""')
      && inlineScript.includes('title: "FX Position Processing"')
      && inlineScript.includes('title: "Transfer Rate"')
      && inlineScript.includes('title: "Analytical PnL"')
      && inlineScript.includes('title: "Identifier"')
      && inlineScript.includes('field: "identifier"')
      && inlineScript.includes('formatter: clientFxDealsIdentifierFormatter')
      && inlineScript.includes('headerFilter: clientFxDealsIdentifierHeaderFilter')
      && inlineScript.includes('title: "Client Side", field: "side", headerSort: false')
      && inlineScript.includes('title: "Tenor", field: "tenor", headerSort: false')
      && inlineScript.includes('title: "Execution Context", field: "executionContextLabel", headerSort: false, formatter: fxDealsExecutionContextFormatter')
      && inlineScript.includes('class="client-pricing-context-candidate-path fx-deals-execution-context-path"')
      && inlineScript.includes('pricingContextFacetsMarkup(context)')
      && html.includes('.client-deals-bootstrap .fx-deals-execution-context-path {')
      && html.includes('.client-deals-bootstrap .tabulator .tabulator-header .tabulator-col.tabulator-sortable .tabulator-col-sorter {')
      && html.includes('transition: opacity 120ms ease;')
      && html.includes('.tabulator-col.tabulator-sortable[aria-sort="none"]:hover .tabulator-col-sorter {')
      && html.includes('.tabulator-col.tabulator-sortable:is([aria-sort="ascending"], [aria-sort="descending"]) .tabulator-col-sorter {')
      && inlineScript.includes('initialSort: [{ column: "tradeId", dir: "asc" }]')
      && !html.includes('id="clientFxDealsPinMode"')
      && !inlineScript.includes('applyClientFxDealsPinMode'),
    usesClientFxDealsDataTools: !html.includes('id="clientFxDealsSearchInput"')
      && !inlineScript.includes('function applyClientFxDealsSearch()')
      && !html.includes('id="clientFxDealsClearFiltersButton"')
      && !inlineScript.includes('clientFxDealsGrid.clearFilter(true)')
      && !inlineScript.includes('updateClientFxDealsClearAvailability')
      && html.includes('id="clientFxDealsColumnPicker"')
      && html.includes('id="clientFxDealsColumnMenu"')
      && inlineScript.includes('function renderClientFxDealsColumnMenu(definitions)')
      && html.includes('justify-content: flex-end;')
      && html.includes('margin-top: 10px;'),
    usesClientFxDealsVerticalGridlines: html.includes('.client-deals-bootstrap .tabulator .tabulator-cell')
      && html.includes('border-right: 1px solid var(--bs-border-color);')
      && html.includes('text-align: center;'),
    usesClientFxDealsFixedHeaders: html.includes('height: max(360px, calc(100vh - 178px));')
      && inlineScript.includes('renderVertical: "virtual"'),
    removesLegacyFxPositionBlotter: !html.includes('FX Position Blotter')
      && !html.includes('#fx-position-blotter')
      && !inlineScript.includes('fxPositionBlotter')
      && html.includes('aria-hidden="true">table_chart</span>\n        <span>FX Position</span>'),
    usesFxPositionExposureDates: html.includes('<th class="base-value-date common-head">Base Ccy Value Date</th>')
      && html.includes('<th class="section-name common-title" colspan="4">SHARED TRADE ATTRIBUTES</th>')
      && !html.includes('<th class="tenor common-head">Tenor</th>')
      && inlineScript.includes('${escapeHtml(positionTradeDate(deal))}')
      && inlineScript.includes("function baseCurrencyValueDateLabel(deal)")
      && inlineScript.includes('.join(" · ")')
      && inlineScript.includes('${escapeHtml(baseCurrencyValueDateLabel(deal))}')
      && serverSource.includes('e.trade_date AS tradeDate')
      && serverSource.includes('e.tenor')
      && serverSource.includes('e.base_ccy_value_date AS baseCcyValueDate'),
    usesFxPositionTradeAttributes: html.includes('<th class="section-name sell-title" colspan="3">SELL SIDE</th>')
      && html.includes('<th class="section-name buy-title" colspan="3">BUY SIDE</th>')
      && (html.match(/>Base Ccy Amount<\/th>/g) || []).length === 2
      && inlineScript.includes('class="identity client position-label-cell">${tradeCell}</td>')
      && !inlineScript.includes('class="identity client position-label-cell" title="${safeTradeLabel}"')
      && inlineScript.includes('function syncSmartCellTooltip(cell, ellipsize)')
      && inlineScript.includes('cell.querySelector("[data-smart-tooltip-content]") || cell')
      && inlineScript.includes('class="position-label-text" data-smart-tooltip-content')
      && (html.match(/data-sort-key="tradeRate" title="Trade Rate">Trade<\/button>/g) || []).length === 2
      && (html.match(/data-sort-key="transferRate" title="Transfer Rate">Transfer<\/button>/g) || []).length === 2
      && inlineScript.includes("function fxPositionTradeRate(deal)")
      && inlineScript.includes("return deal?.clientRate ?? null;")
      && inlineScript.includes("return deal?.autoBatchRate ?? null;")
      && inlineScript.includes("const baseCcyAmount = flatActive")
      && inlineScript.includes(": fxPositionBaseAmountCell(deal);")
      && inlineScript.includes("fxPositionTradeRate,\n          targetFractionDigits")
      && inlineScript.includes("fxPositionTransferRate,\n          targetFractionDigits")
      && inlineScript.includes('{ label: "Trade", type: "rate" }')
      && inlineScript.includes("column.label === label && column.type === type")
      && serverSource.includes("function fxTradeRowWithMajorAmounts(row)")
      && serverSource.includes('e.trade_rate AS tradeRate')
      && serverSource.includes('d.transfer_rate AS transferRate'),
    removesFxPositionTradeTypeIndicators:
      !html.includes("amount-with-trade-type")
      && !html.includes("sell-trade-type-amount")
      && !html.includes("buy-trade-type-amount")
      && !html.includes("trade-type-indicator")
      && !inlineScript.includes("function fxPositionTradeTypeIndicator(deal)")
      && !inlineScript.includes("const tradeTypeIndicator = fxPositionTradeTypeIndicator(deal);"),
    usesFxPositionTradeTypeChips:
      html.includes(".position-trade-type-chip")
      && html.includes(".position-trade-type-icon")
      && inlineScript.includes("function fxPositionTradeTypePresentation(deal)")
      && inlineScript.includes('{ type, label: "CLIENT DEAL", icon: "handshake" }')
      && inlineScript.includes('{ type, label: "HEDGE DEAL", icon: "shield" }')
      && inlineScript.includes(
        '{ type, label: "BATCH POSITION OUT", icon: "output" }'
      )
      && inlineScript.includes(
        '{ type, label: "BATCH BALANCE TRADE", icon: "balance" }'
      )
      && inlineScript.includes('function fxPositionTradeContext(deal, tradeType')
      && inlineScript.includes('`Position Out · Batch #${batchId}`')
      && inlineScript.includes('`Batch Balance · Batch #${batchId}`')
      && inlineScript.includes('function fxPositionTradeTypeTooltip(deal, presentation)')
      && inlineScript.includes(
        '`BATCH POSITION OUT · created by FX Batch #${batchId}`'
      )
      && inlineScript.includes('data-tooltip="${escapeHtml(tradeTypeTooltip)}"')
      && !inlineScript.includes("position-trade-type-label"),
    removesFxPositionDemoDeleteActions:
      !html.includes("Delete (Demo)")
      && !html.includes('id="deleteDealButton"')
      && !html.includes('id="deleteBatchTechnicalTradesButton"')
      && !html.includes('id="deleteHedgeDealDemoButton"')
      && inlineScript.includes("function isBatchableFxPositionTrade(deal)")
      && inlineScript.includes('${sellActive || flatActive ? selectionBox : ""}')
      && !inlineScript.includes("function selectedTechnicalBatchIds()")
      && !inlineScript.includes("async function deleteSelectedBatchTechnicalTradesForDemo()")
      && !inlineScript.includes("async function deleteSelectedClientDeal()")
      && !inlineScript.includes("async function deleteSelectedHedgeDealsForDemo()")
      && !inlineScript.includes('"/api/v1/fx-batches/demo-hide-technical-trades"')
      && !serverSource.includes("function hideFxBatchTechnicalTradesForDemo(batchIds)")
      && !serverSource.includes('"/api/v1/fx-batches/demo-hide-technical-trades"')
      && !serverSource.includes('"FX_BATCH_TECHNICAL_TRADES_IMMUTABLE"')
      && !schemaSource.includes("fx_demo_hidden_batches"),
    usesDemoTradeReset:
      html.includes('id="resetDemoTradesButton">Reset Trades (Demo)</button>')
      && fxPositionPageMarkup.includes('class="fx-position-footer"')
      && fxPositionPageMarkup.includes('id="batchStatus"')
      && !fxPositionDealToolbarMarkup.includes('id="resetDemoTradesButton"')
      && !fxPositionDealToolbarMarkup.includes('id="batchStatus"')
      && html.includes('id="resetDemoTradesDialog"')
      && html.includes('id="resetDemoTradesConfirmButton"')
      && html.includes('id="resetDemoTradesDialogTitle">Reset Trading Demo</h2>')
      && html.includes("<strong>Will be preserved:</strong>")
      && inlineScript.includes("function openResetDemoTradesDialog()")
      && inlineScript.includes("async function confirmResetDemoTradeWorkspace()")
      && !inlineScript.includes("window.confirm(")
      && inlineScript.includes('"/api/v1/demo/trades/reset"')
      && inlineScript.includes('confirmation: "RESET_ALL_TRADES"')
      && inlineScript.includes("reloadClientFxDealsFromApi()")
      && inlineScript.includes("reloadHedgeFxDealsFromApi()")
      && inlineScript.includes("reloadFxBatchesFromApi()")
      && serverSource.includes("function resetDemoTrades()")
      && serverSource.includes("positionManagementStates")
      && serverSource.includes("positionManagementTransitions")
      && serverSource.includes("fx_trade_position_management_transitions")
      && serverSource.includes('DELETE FROM fx_trade_exposure;')
      && serverSource.includes('DELETE FROM fx_batches;')
      && serverSource.includes("DELETE FROM sqlite_sequence")
      && serverSource.includes("'fx_trade_position_management_transitions'")
      && serverSource.includes("runInImmediateTransaction(database, () =>")
      && serverSource.includes("Demo Trade reset requires confirmation"),
    supportsLargeFxPositionAmounts:
      (html.match(/data-smart-min-text="100 000 000 000\.00"/g) || []).length === 2
      && !html.includes('data-smart-extra-width="48"')
      && inlineScript.includes("function smartRequestedMinimumWidth(headerCell)")
      && inlineScript.includes("const minimumText = headerCell.dataset.smartMinText;")
      && inlineScript.includes("const extraWidth = smartCssPixels(headerCell.dataset.smartExtraWidth);")
      && inlineScript.includes("requestedMinimumWidth"),
    usesFxPositionMarketPulseBrand: html.includes('<span class="button-icon market-reference-icon market-pulse-icon" role="img" aria-label="Market Pulse" tabindex="0" data-tooltip="Market Pulse">monitoring</span>')
      && (html.match(/class="[^"]*market-pulse-icon[^"]*"[^>]*>monitoring<\/span>/g) || []).length >= 6
      && html.includes('.market-pulse-icon {')
      && !html.includes('market-pulse-icon-chart')
      && !html.includes('market-pulse-icon-exchange')
      && !html.includes('class="market-reference-label"')
      && html.includes('<span class="market-reference-heading">')
      && html.includes('.market-reference-brand {')
      && !html.includes('market-reference-info')
      && !html.includes('Market Pulse rates captured when the trade was entered.')
      && inlineScript.includes('marketRate: { min: 70, max: 76, pad: 12, ellipsize: false }'),
    usesFxPositionHedgeDealTerminology:
      inlineScript.includes('hedgeQuickModeActionMarkup("SELL", setting.baseCcyCode')
      && inlineScript.includes('hedgeQuickModeActionMarkup("BUY", setting.baseCcyCode')
      && html.includes('class="action-button primary btn btn-sm btn-soft-primary with-icon" id="addHedgeDealButton">')
      && html.includes('<span>Hedge Deal</span>')
      && fxPositionPageMarkup.includes('id="hedgeQuickModeToolbar"')
      && !html.includes('id="addHedgeSellDealButton"')
      && !html.includes('id="addHedgeBuyDealButton"')
      && !inlineScript.includes("addAutoHedge")
      && !inlineScript.includes("data-hedge-pricing-mode")
      && !inlineScript.includes("Add AUTO_PRICED Hedge Deal")
      && !inlineScript.includes('class="hedge-deal-quick-control"')
      && inlineScript.includes('data-hedge-quick-preset')
      && inlineScript.includes('data-hedge-quick-action')
      && inlineScript.includes("function oppositeFxSide(side)")
      && inlineScript.includes("const positionSide = addHedgeDealForm.elements.side.value;")
      && inlineScript.includes("const ourSide = oppositeFxSide(positionSide);")
      && inlineScript.includes("addHedgeDealForm.elements.side.value = oppositeFxSide(normalizedOurSide);")
      && inlineScript.includes("() => openAddHedgeDealDialog()")
      && inlineScript.includes("oppositeFxSide(addHedgeDealSideControl.value)")
      && !html.includes('id="deleteHedgeDealDemoButton"')
      && !inlineScript.includes("function selectedDeletableHedgeDeals()")
      && !inlineScript.includes("async function deleteSelectedHedgeDealsForDemo()")
      && !html.includes("Add Market Deal")
      && !html.includes("Market Deals"),
    usesCompactClientDealToolbarTitle:
      fxPositionPageMarkup.includes(
        'class="deal-toolbar-title client-deal-toolbar-title" role="img" aria-label="Client Deal Toolbar"'
      )
      && fxPositionPageMarkup.includes(
        '<span class="button-icon" aria-hidden="true">handshake</span>'
      )
      && html.includes(".client-deal-toolbar-title"),
    usesCompactBatchToolbarTitle:
      fxPositionPageMarkup.includes(
        'class="batch-toolbar-title batch-toolbar-icon-title" role="img" aria-label="Batch Toolbar"'
      )
      && fxPositionPageMarkup.includes(
        '<span class="button-icon" aria-hidden="true">stacks</span>'
      )
      && html.includes(".batch-toolbar-icon-title"),
    usesStandaloneToolbarCommands:
      /#mainPage\.fx-position-bootstrap\.workbench-page \.batch-control \{[\s\S]*?gap: 6px;[\s\S]*?border: 0;[\s\S]*?background: transparent;/.test(html)
      && /#mainPage\.fx-position-bootstrap\.workbench-page \.batch-control \.action-button \{[\s\S]*?border-width: 1px;[\s\S]*?border-radius: var\(--workbench-radius\);/.test(html)
      && /#mainPage\.fx-position-bootstrap\.workbench-page :is\(\.deal-toolbar, \.batch-toolbar, \.hedge-toolbar\) \.action-button:disabled \{[\s\S]*?opacity: 1;/.test(html)
      && batchToolbarMarkup.includes('class="action-button primary btn btn-sm btn-outline-primary batch-main" id="oneBatchButton"')
      && !html.includes(".batch-toolbar #oneBatchButton:is(")
      && html.includes('class="batch-control client-deal-actions" aria-label="Client Deal actions"')
      && html.includes('class="action-button primary btn btn-sm btn-outline-primary with-icon" id="createDealButton"')
      && html.includes('class="batch-control deal-generation-control" aria-label="Demo Deal Generation actions"')
      && html.includes('<span class="batch-label">Demo Generation</span>')
      && html.includes('id="runClientDealGenerationLabel">Auto Generate</span>')
      && html.includes('id="autoBatchButton" aria-label="Start Auto Batching"')
      && html.includes('id="autoBatchLabel">Auto Batch</span>')
      && (fxPositionPageMarkup.match(/toolbar-secondary-action/g) || []).length === 5
      && fxPositionPageMarkup.includes('class="action-button btn btn-sm btn-outline-primary batch-process process-toggle-button with-icon" id="runClientDealGenerationButton"')
      && fxPositionPageMarkup.includes('class="action-button btn btn-sm btn-outline-primary batch-process process-toggle-button with-icon" id="autoBatchButton"')
      && !fxPositionPageMarkup.includes('btn-outline-success batch-process" id="autoBatchButton"')
      && !html.includes("batch-control input-group")
      && !html.includes("batch-label input-group-text")
      && html.includes('#mainPage.fx-position-bootstrap.workbench-page .batch-toolbar {')
      && html.includes('background: var(--bs-body-bg);')
      && html.includes('.process-toggle-button:not(.is-running) {')
      && html.includes('--bs-btn-bg: transparent;')
      && /#mainPage\.fx-position-bootstrap\.workbench-page \.toolbar-secondary-action:is\([\s\S]*?:hover,[\s\S]*?:focus-visible,[\s\S]*?:active[\s\S]*?\):not\(:disabled\):not\(\.is-running\) \{[\s\S]*?border-color: var\(--bs-secondary\);[\s\S]*?background: var\(--bs-secondary-bg\);/.test(html)
      && html.includes('--bs-btn-hover-color: var(--bs-btn-color);')
      && html.includes('--bs-btn-active-color: var(--bs-btn-color);')
      && inlineScript.includes('runClientDealGenerationLabel.textContent = running ? "Stop Generation" : "Auto Generate";'),
    keepsSpecialFxPositionTradesVisuallyNeutral:
      !html.includes('.position-amount-chip')
      && !html.includes('--hedge-deal-side-accent')
      && !html.includes('tr.is-hedge-deal .position-trade-type-chip')
      && !html.includes('tr.is-batch-technical .position-trade-type-chip')
      && !html.includes('.position-label-cell::before {')
      && !html.includes('--fx-position-row-highlight-bg')
      && inlineScript.includes('positionType === "HEDGE_DEAL"')
      && inlineScript.includes('" is-hedge-deal"')
      && inlineScript.includes('["BATCH_POSITION_OUT", "BATCH_BALANCE_TRADE"].includes(positionType)')
      && inlineScript.includes('" is-batch-technical"'),
    usesCentralTabulatorColumnSizing:
      inlineScript.includes('const TABLE_COLUMN_POLICIES = Object.freeze({')
      && inlineScript.includes('const TABLE_COLUMN_POLICY_ALIASES = Object.freeze({')
      && !inlineScript.includes('const TABULATOR_COLUMN_SIZES = Object.freeze({')
      && inlineScript.includes('function tabulatorSizedColumn(size, definition)')
      && inlineScript.includes('const policy = tableColumnPolicy(size);')
      && inlineScript.includes('clientFxDealsFilterableColumn("date"')
      && inlineScript.includes('tabulatorSizedColumn("amount"'),
    usesUnifiedBootstrapWorkspaceStyle: (html.match(/unified-bootstrap-workspace/g) || []).length >= 6
      && (html.match(/unified-data-table/g) || []).length >= 9
      && html.includes('.unified-bootstrap-workspace .unified-data-table th,')
      && html.includes('.unified-bootstrap-workspace .action-button'),
    usesMarketVerticalGridlines: html.includes('#marketPage .tabulator .tabulator-cell {')
      && html.includes('border-right: 1px solid var(--bs-border-color);'),
    usesReferenceDataColumnFilters: (html.match(/data-reference-filter-kind=/g) || []).length === 12
      && inlineScript.includes('const referenceDataFilterControls = Array.from')
      && inlineScript.includes('function referenceDataMatchesFilters(kind, item)'),
    usesFluidReferenceDataTables: html.includes('Execution Context, Pricing Rules, and Reference Data tables use their natural column width on wide screens and scroll only when needed.')
      && html.includes('width: fit-content;')
      && html.includes('max-width: calc(100vw - var(--workbench-page-inline-total));'),
    usesFluidPricingContextTable: html.includes('#pricingPage.unified-bootstrap-workspace.workbench-page .pricing-layout .profile-table-panel,')
      && html.includes('#pricingPage .profile-panel-head,')
      && html.includes('justify-content: flex-end;'),
    usesFluidPricingRulesTable: html.includes('#pricingRulesPage.unified-bootstrap-workspace.workbench-page .pricing-layout .profile-table-panel,')
      && html.includes('#pricingRulesPage.unified-bootstrap-workspace.workbench-page .pricing-rules-table {')
      && /#pricingRulesPage\.unified-bootstrap-workspace\.workbench-page \.pricing-layout \.profile-table-panel \{[\s\S]*?height: auto;[\s\S]*?max-height: 100%;[\s\S]*?align-self: start;/.test(html)
      && /#pricingRulesPage\.unified-bootstrap-workspace\.workbench-page \.profile-table-wrap \{[\s\S]*?flex: 0 1 auto;/.test(html),
    usesPricingRulesHeaderLayout: html.includes(':is(#pricingPage, #referenceDataPage, #pricingRulesPage).unified-bootstrap-workspace .reference-column-head {')
      && html.includes(':is(#pricingPage, #referenceDataPage, #pricingRulesPage).unified-bootstrap-workspace .reference-header-filter {')
      && html.includes(':is(#pricingPage, #referenceDataPage, #pricingRulesPage).unified-bootstrap-workspace .reference-sort-control {'),
    usesExecutionContextRoute: html.includes('href="#execution-context" data-workspace-route="pricing"')
      && inlineScript.includes('function pricingRoute(referenceKind = "", referenceId = "")')
      && inlineScript.includes('function pricingRouteStateFromLocation(hash = location.hash)')
      && inlineScript.includes('return pricingRouteStateFromLocation().matches;'),
    usesReferenceDataExecutionContextDrilldown:
      html.includes('id="pricingContextBreadcrumb" aria-label="breadcrumb" hidden')
      && html.includes('data-pricing-context-actions-column')
      && inlineScript.includes('data-reference-action="view-execution-contexts"')
      && inlineScript.includes('View ${count} attached ${contextLabel}')
      && inlineScript.includes('parameter: "servicing-location"')
      && inlineScript.includes('parameter: "accounting-system"')
      && inlineScript.includes('parameter: "execution-system"')
      && inlineScript.includes('pricingContextNewButton.hidden = Boolean(pricingContextRouteScope)')
      && inlineScript.includes('String(context?.[pricingContextRouteScope.field] ?? "") !== pricingContextRouteScope.value'),
    usesExecutionContextTradingCounterpartyDrilldown:
      html.includes('id="clientProfileBreadcrumb" aria-label="breadcrumb" hidden')
      && html.includes('data-client-profile-actions-column')
      && inlineScript.includes('data-pricing-context-action="view-trading-counterparties"')
      && inlineScript.includes('View ${count} attached ${counterpartyLabel}')
      && inlineScript.includes('function tradingCounterpartiesForExecutionContextRoute(executionContextId, returnHash = location.hash)')
      && inlineScript.includes('mode: "related"')
      && inlineScript.includes('/trading-counterparties`')
      && inlineScript.includes('function tradingCounterpartyMatchesRouteScope(profile)')
      && inlineScript.includes('clientProfileNewButton.hidden = true')
      && inlineScript.includes('if (clientProfileRouteScope) {')
      && serverSource.includes('function executionContextTradingCounterparties(executionContextId)')
      && serverSource.includes('executionContextTradingCounterpartiesMatch'),
    usesBootstrapReferenceDataControls: (html.match(/btn btn-sm btn-primary reference-new-button/g) || []).length >= 6
      && inlineScript.includes('btn btn-sm btn-outline-secondary reference-grid-action')
      && inlineScript.includes('btn btn-sm btn-outline-danger reference-grid-action')
      && inlineScript.includes('<span class="button-icon" aria-hidden="true">visibility</span>'),
    usesUniformReferenceDataGrid: html.includes('#referenceDataPage.unified-bootstrap-workspace .reference-table {')
      && html.includes('border-collapse: separate;')
      && html.includes('#referenceDataPage.unified-bootstrap-workspace .reference-table tbody tr:nth-child(even) td {')
      && html.includes('class="nav nav-tabs workbench-section-tabs reference-switcher"')
      && html.includes('class="nav nav-tabs workbench-section-tabs trading-counterparty-scope-tabs"')
      && html.includes('.workbench-section-tabs .nav-link:is(.active, .is-active) {'),
    usesHoverTabWithoutBottomBorder:
      html.includes(
        '.workbench-section-tabs .nav-link:not(.active):not(.is-active):hover {'
      )
      && html.includes('border-color: var(--palette-gray-400) var(--palette-gray-400) transparent;')
      && html.includes('background: var(--palette-gray-100);')
      && html.includes('color: var(--bs-secondary-color);')
      && html.includes(
        '#marketPage.market-bootstrap .market-tabs .nav-link:hover {'
      )
      && html.includes('border-bottom-color: transparent;'),
    usesUnifiedTableHeaderAndSortContract:
      html.includes('--table-sort-arrow-width: 3px;')
      && html.includes('--table-sort-arrow-height: 4px;')
      && html.includes(
        '.tabulator .tabulator-header .tabulator-col.tabulator-sortable.tabulator-col-sorter-element:hover {'
      )
      && html.includes('background: var(--workbench-grid-hover-bg) !important;')
      && html.includes('.workbench-page .batching-table th:has(.sort-button):hover {')
      && html.includes('.fx-position-grid .column-title :is(.common-head, .market-head):has(.sort-button):hover {')
      && html.includes('background: var(--palette-gray-200) !important;')
      && html.includes('.fx-position-grid .column-title .sell-head:has(.sort-button):hover {')
      && html.includes('background: rgba(var(--bs-danger-rgb), 0.12) !important;')
      && html.includes('.fx-position-grid .column-title .buy-head:has(.sort-button):hover {')
      && html.includes('background: rgba(var(--bs-success-rgb), 0.12) !important;')
      && html.includes(
        '.tabulator .tabulator-header .tabulator-col.tabulator-sortable .tabulator-col-sorter {'
      )
      && inlineScript.includes(
        'column.headerHozAlign || !column.hozAlign'
      )
      && inlineScript.includes('headerHozAlign: "right"'),
    usesUnifiedTableRowInteractionContract:
      html.includes('--app-table-action-bg: var(--bs-body-bg);')
      && html.includes('--app-table-action-hover-bg: var(--palette-gray-300);')
      && html.includes('Tables share one hover and neutral row-action contract across the application.')
      && html.includes('.tabulator-row:hover:not(.tabulator-selected):not(.market-inline-edit-row) {')
      && html.includes('tr:hover:not(.is-selected):not(.is-editing):not(.fx-position-grid-fill)')
      && html.includes('.icon-action:not(.profile-danger-action)')
      && html.includes('background: var(--app-table-action-hover-bg) !important;')
      && html.includes('.generation-settings-table tbody tr:hover {\n      background: var(--workbench-grid-hover-bg);')
      && html.includes('.hedge-quick-settings-grid .tabulator-row:hover {\n      background: var(--workbench-grid-hover-bg);'),
    separatesUsersFromTradingCounterpartyTabs: inlineScript.includes('tradingCounterpartyScopeTabs.hidden = usersVisible;'),
    usesUnifiedDataGridLineSystem: html.includes('--data-grid-line-width: 1px;')
      && html.includes('--data-grid-line-color: var(--bs-border-color, #dee2e6);')
      && html.includes('#marketPage.market-bootstrap .market-tabulator,')
      && html.includes('.client-deals-bootstrap .tabulator,')
      && html.includes('#referenceDataPage.unified-bootstrap-workspace .reference-table thead tr th,'),
    usesOwnedRoundedTableFrames: html.includes('Keep a single, clipping owner for every rounded data-grid outline.')
      && html.includes(':is(#pricingPage, #pricingRulesPage, #databasePage).unified-bootstrap-workspace.workbench-page .profile-table-wrap')
      && html.includes('#pricingRulesPage.unified-bootstrap-workspace.workbench-page .profile-table-wrap,')
      && html.includes('#databasePage.unified-bootstrap-workspace.workbench-page .database-details > .profile-table-panel')
      && html.includes('justify-self: start;')
      && html.includes('width: fit-content;'),
    usesCentralWorkbenchDesignContract: html.includes('--app-font-size-page-title: 22px;')
      && html.includes('--app-font-size-dialog-title: 18px;')
      && html.includes('--app-font-size-section-title: 15px;')
      && html.includes('--app-font-size-body: 13px;')
      && html.includes('--app-font-size-table: 12px;')
      && html.includes('--app-font-size-label: 12px;')
      && html.includes('--app-font-size-caption: 11px;')
      && html.includes('--workbench-title-size: var(--app-font-size-page-title);')
      && html.includes('--workbench-grid-size: var(--app-font-size-table);')
      && html.includes('--workbench-grid-row-height: 36px;')
      && html.includes('--workbench-grid-header-bg: var(--bs-tertiary-bg, #f8f9fa);')
      && html.includes('class="settings-shell profile-shell market-shell market-bootstrap workbench-page"')
      && html.includes('class="shell blotter-shell client-deals-bootstrap unified-bootstrap-workspace workbench-page"')
      && html.includes('.workbench-grid-toolbar,')
      && html.includes('border: var(--data-grid-line-width) solid var(--data-grid-line-color);'),
    usesUnifiedPageHeaderSeparation: (html.match(/class="[^"]*\bworkbench-page-header\b[^"]*"/g) || []).length === 13
      && html.includes('class="workspace-nav bg-body-tertiary border-bottom"')
      && html.includes('background: var(--bs-tertiary-bg);')
      && html.includes('The global navigation owns the page boundary; page headings use whitespace, not a second rule.')
      && /\.workbench-page-header\s*\{\s*border-bottom:\s*0;/.test(html),
    usesSingleMarketOuterEdge: /#marketPage\.market-bootstrap\.workbench-page \.market-tabulator \.tabulator-header \.tabulator-col\.market-grid-actions-cell,\s*#marketPage\.market-bootstrap\.workbench-page \.market-tabulator \.tabulator-row \.tabulator-cell\.market-grid-actions-cell \{\s*border-right: 0;\s*\}/.test(html),
    usesSingleClientDealsOuterEdge: html.includes('.tabulator-header .client-deals-group-position-processing .tabulator-col-group-cols > .tabulator-col:not([style*="display: none"]):not(:has(~ .tabulator-col:not([style*="display: none"])))')
      && html.includes('.tabulator-row .tabulator-cell:not([style*="display: none"]):not(:has(~ .tabulator-cell:not([style*="display: none"]))) {'),
    avoidsMarketScrollbarGutter: /#marketPage\.market-bootstrap\.workbench-page \.market-grid-frame \{[\s\S]*?width: fit-content;[\s\S]*?overflow-x: auto;[\s\S]*?overflow-y: hidden;[\s\S]*?\}/.test(html)
      && /#marketPage\.market-bootstrap\.workbench-page \.market-tabulator \.tabulator-tableholder \{\s*height: auto !important;\s*max-height: 446px;\s*overflow-x: hidden;\s*overflow-y: auto;\s*\}/.test(html),
    usesZoomSafeMarketHeight: !inlineScript.includes('maxHeight: "520px"')
      && html.includes('max-height: 446px;'),
    containsFrontendQuoteGenerator: inlineScript.includes("function marketQuoteForPair")
  };
}

function verifyMarketPulseSimulator() {
  let timestamp = 100000;
  const simulator = new MarketPulseSimulator({
    loadConfigurations: () => [{
      pairCode: "EUR_USD",
      currencyPair: "EUR/USD",
      defaultQuoteDecimals: 4,
      bidMin: 1.1220,
      spread: 0.0002,
      bidMax: 1.1250,
      oneWayDurationSeconds: 60,
      fluctuationSpreads: 3
    }],
    now: () => timestamp,
    random: () => 0.5
  });
  const started = simulator.start();
  timestamp += 60000;
  const upperBoundary = simulator.refresh();
  timestamp += 60000;
  const returned = simulator.refresh();
  const stopped = simulator.stop();
  simulator.dispose();

  return {
    startedRunning: started.running,
    refreshedRunning: upperBoundary.running,
    stoppedRunning: stopped.running,
    startedQuote: started.quotes[0],
    upperBoundaryQuote: upperBoundary.quotes[0],
    returnedQuote: returned.quotes[0]
  };
}

async function verifyApiAndMigration() {
  process.env.DEMO_DATABASE_PATH = verificationDatabasePath;
  const { handleApi, closeDatabase } = require("./server.js");

  async function request(method, pathname, body) {
    let statusCode = 0;
    let responseBody = "";
    const requestBody = body === undefined ? "" : JSON.stringify(body);
    const apiRequest = {
      method,
      async *[Symbol.asyncIterator]() {
        if (requestBody) {
          yield Buffer.from(requestBody, "utf8");
        }
      }
    };
    const response = {
      writeHead(code) {
        statusCode = code;
      },
      end(chunk = "") {
        responseBody += chunk;
      }
    };

    const handled = await handleApi(
      apiRequest,
      response,
      new URL(pathname, "http://127.0.0.1:8000")
    );

    return {
      handled,
      statusCode,
      body: responseBody ? JSON.parse(responseBody) : null
    };
  }

  async function openEventStream(pathname) {
    let statusCode = 0;
    let responseBody = "";
    const apiRequest = new EventEmitter();
    apiRequest.method = "GET";
    const response = {
      writeHead(code) {
        statusCode = code;
      },
      write(chunk = "") {
        responseBody += chunk;
      },
      end(chunk = "") {
        responseBody += chunk;
      }
    };
    const handled = await handleApi(
      apiRequest,
      response,
      new URL(pathname, "http://127.0.0.1:8000")
    );
    apiRequest.emit("close");
    return { handled, statusCode, responseBody };
  }

  try {
    const migratedPair = await request("GET", "/api/v1/ccy-pair-options");
    const blockedPairDelete = await request("DELETE", "/api/v1/ccy-pair-options/EUR_USD");
    const migratedSettings = await request("GET", "/api/v1/ccy-pair-options/EUR_USD/simulation-settings");
    const tables = await request("GET", "/api/database/tables");
    const ccyOptionsTable = await request("GET", "/api/database/tables/ccy_options");
    const pairTable = await request("GET", "/api/database/tables/ccy_pair_options");
    const settingsTable = await request("GET", "/api/database/tables/market_quote_simulation_settings");
    const servicingLocationsTable = await request("GET", "/api/database/tables/servicing_locations");
    const accountingSystemsTable = await request("GET", "/api/database/tables/accounting_systems");
    const executionSystemsTable = await request("GET", "/api/database/tables/execution_systems");
    const executionContextsTable = await request("GET", "/api/database/tables/execution_contexts");
    const tradingCounterpartiesTable = await request("GET", "/api/database/tables/trading_counterparties");
    const externalCounterpartiesTable = await request("GET", "/api/database/tables/external_counterparties");
    const internalUnitsTable = await request("GET", "/api/database/tables/internal_units");
    const tradingCounterpartyRolesTable = await request("GET", "/api/database/tables/trading_counterparty_roles");
    const usersTable = await request("GET", "/api/database/tables/users");
    const uiColorTokensTable = await request("GET", "/api/database/tables/ui_color_tokens");
    const pricingRulesTable = await request("GET", "/api/database/tables/pricing_rules");
    const clientDealGenerationProcessSettingsTable = await request(
      "GET",
      "/api/database/tables/client_deal_generation_process_settings"
    );
    const clientDealGenerationSettingsTable = await request(
      "GET",
      "/api/database/tables/client_deal_generation_settings"
    );
    const fxTradeExposureTable = await request("GET", "/api/database/tables/fx_trade_exposure");
    const fxTradePositionManagementTable = await request(
      "GET",
      "/api/database/tables/fx_trade_position_management"
    );
    const fxTradePositionManagementTransitionsTable = await request(
      "GET",
      "/api/database/tables/fx_trade_position_management_transitions"
    );
    const fxTradeMarketSnapshotTable = await request("GET", "/api/database/tables/fx_trade_market_snapshot");
    const clientFxDealsTable = await request("GET", "/api/database/tables/client_fx_deals");
    const hedgeFxDealsTable = await request("GET", "/api/database/tables/fx_hedge_deals");
    const hedgeQuickModeSettingsTable = await request(
      "GET",
      "/api/database/tables/fx_hedge_quick_mode_settings"
    );
    const fxTradeBatchesTable = await request(
      "GET",
      "/api/database/tables/fx_batches"
    );
    const batchBalancingTradesTable = await request(
      "GET",
      "/api/database/tables/fx_batch_members"
    );
    const batchBalanceTradeTable = await request(
      "GET",
      "/api/database/tables/fx_batch_balance_trade"
    );
    const batchPositionOutputTable = await request(
      "GET",
      "/api/database/tables/fx_batch_position_output"
    );
    const batchQuoteCashMembersTable = await request(
      "GET",
      "/api/database/tables/fx_batch_quote_cash_output"
    );
    const counterpartyExecutionContextsTable = await request(
      "GET",
      "/api/database/tables/trading_counterparty_execution_contexts"
    );
    const servicingLocations = await request("GET", "/api/v1/servicing-locations");
    const accountingSystems = await request("GET", "/api/v1/accounting-systems");
    const executionSystems = await request("GET", "/api/v1/execution-systems");
    const executionContexts = await request("GET", "/api/v1/execution-contexts");
    const tradingCounterparties = await request("GET", "/api/v1/trading-counterparties");
    const users = await request("GET", "/api/v1/users");
    const pricingRules = await request("GET", "/api/v1/pricing-rules");
    const migratedFxPositions = await request("GET", "/api/v1/fx-positions");
    const migratedClient1ExecutionContexts = await request(
      "GET",
      "/api/v1/trading-counterparties/1/execution-contexts"
    );
    const migratedClient2ExecutionContexts = await request(
      "GET",
      "/api/v1/trading-counterparties/2/execution-contexts"
    );
    const missingCounterpartyExecutionContexts = await request(
      "GET",
      "/api/v1/trading-counterparties/999999/execution-contexts"
    );
    const clientDealPricingRules = await request("GET", "/api/v1/client-deal-pricing-rules");
    const clientFxDeals = await request("GET", "/api/v1/client-fx-deals");
    const hedgeFxDeals = await request("GET", "/api/v1/hedge-fx-deals");
    const fxPositionsBeforeBatch = await request("GET", "/api/v1/fx-positions");
    const batchSourceProbe = new DatabaseSync(verificationDatabasePath);
    batchSourceProbe.prepare(`
      UPDATE client_fx_deals
      SET transfer_rate = 1.123
      WHERE trade_id = 41
    `).run();
    batchSourceProbe.close();
    const rejectedSplitBatchMode = await request(
      "POST",
      "/api/v1/fx-batches",
      {
        idempotencyKey: "verify-removed-split-mode",
        tradeIds: [41],
        mode: "SEPARATE_BY_TENOR"
      }
    );
    const createFxBatch = await request(
      "POST",
      "/api/v1/fx-batches",
      { idempotencyKey: "verify-batch-41", tradeIds: [41] }
    );
    const fxBatchHistoryAfterCreate = await request("GET", "/api/v1/fx-batches");
    const batchFormationAuditAfterCreate = await request(
      "GET",
      "/api/v1/fx-batch-formation-audit"
    );
    const batchBalancingTradesAfterCreate = await request(
      "GET",
      `/api/v1/fx-batches/${createFxBatch.body?.batchId}`
    );
    const missingFxBatchDetails = await request(
      "GET",
      "/api/v1/fx-batches/999999"
    );
    const duplicateBatchSelection = await request(
      "POST",
      "/api/v1/fx-batches",
      { idempotencyKey: "verify-duplicate-batch", tradeIds: [41, 41] }
    );
    const missingBatchSourceTrade = await request(
      "POST",
      "/api/v1/fx-batches",
      { idempotencyKey: "verify-missing-batch", tradeIds: [999999] }
    );
    const replayFxBatch = await request(
      "POST",
      "/api/v1/fx-batches",
      { idempotencyKey: "verify-batch-41", tradeIds: [41] }
    );
    const idempotencyConflict = await request(
      "POST",
      "/api/v1/fx-batches",
      { idempotencyKey: "verify-batch-41", tradeIds: [999999] }
    );
    const batchBalancingTradesAfterReplay = await request(
      "GET",
      `/api/v1/fx-batches/${createFxBatch.body?.batchId}`
    );
    const fxPositionsAfterBatch = await request("GET", "/api/v1/fx-positions");
    const rollbackFxBatch = await request(
      "POST",
      `/api/v1/fx-batches/${createFxBatch.body?.batchId}/rollback`
    );
    const fxBatchHistoryAfterRollback = await request("GET", "/api/v1/fx-batches");
    const batchFormationAuditAfterRollback = await request(
      "GET",
      "/api/v1/fx-batch-formation-audit"
    );
    const batchFormationAuditCreatedRecord = batchFormationAuditAfterCreate.body
      ?.find(record => record.batchId === createFxBatch.body?.batchId);
    const batchFormationAuditRolledBackRecord = batchFormationAuditAfterRollback.body
      ?.find(record => record.batchId === createFxBatch.body?.batchId);
    const fxPositionsAfterRollback = await request("GET", "/api/v1/fx-positions");
    const replayRollbackFxBatch = await request(
      "POST",
      `/api/v1/fx-batches/${createFxBatch.body?.batchId}/rollback`
    );
    const reformedFxBatch = await request(
      "POST",
      "/api/v1/fx-batches",
      { idempotencyKey: "verify-reformed-batch-41", tradeIds: [41] }
    );
    const fxPositionsAfterReformedBatch = await request("GET", "/api/v1/fx-positions");
    const fxBatchHistoryAfterReformedBatch = await request("GET", "/api/v1/fx-batches");
    const fxTradeExposureAfterReformedBatch = await request(
      "GET",
      "/api/database/tables/fx_trade_exposure"
    );
    const fxBatchMembersAfterReformedBatch = await request(
      "GET",
      "/api/database/tables/fx_batch_members"
    );
    const fxBatchBalanceTradesAfterReformedBatch = await request(
      "GET",
      "/api/database/tables/fx_batch_balance_trade"
    );
    const fxBatchOutputsAfterReformedBatch = await request(
      "GET",
      "/api/database/tables/fx_batch_position_output"
    );
    const signedBasePosition = records => (Array.isArray(records) ? records : [])
      .reduce((total, trade) => {
        if (trade.side === "BUY") {
          return total + Number(trade.baseCcyAmountMinor || 0);
        }

        if (trade.side === "SELL") {
          return total - Number(trade.baseCcyAmountMinor || 0);
        }

        return total;
      }, 0);
    const rolledBackTradeImmutableProbe = new DatabaseSync(verificationDatabasePath);
    let rolledBackTradeImmutable = false;

    try {
      rolledBackTradeImmutableProbe.prepare(`
        UPDATE fx_trade_exposure
        SET trade_rate = trade_rate + 0.0001
        WHERE trade_id = 41
      `).run();
    } catch {
      rolledBackTradeImmutable = true;
    } finally {
      rolledBackTradeImmutableProbe.close();
    }
    const clientDealExecutionContextId = executionContexts.body?.find(context =>
      context.servicingLocationId === "002"
      && context.accountingSystemId === "CTF3"
      && context.executionSystemId === "MANUAL_CLIENT_DEAL_ENTRY"
    )?.executionContextId;
    const clientDealPricingRuleId = pricingRules.body?.find(rule =>
      rule.counterpartyId === 1
      && rule.executionContextId === clientDealExecutionContextId
      && rule.ccyPairCode === "EUR_USD"
    )?.pricingRuleId;
    const nonDealerPricedExecutionContextId = executionContexts.body?.find(context =>
      context.servicingLocationId === "002"
      && context.accountingSystemId === "AFINA"
      && context.executionSystemId === "CLICK_TRADE_EFX"
    )?.executionContextId;
    const nonDealerPricedPricingRuleId = pricingRules.body?.find(rule =>
      rule.counterpartyId === 1
      && rule.executionContextId === nonDealerPricedExecutionContextId
      && rule.ccyPairCode === "EUR_USD"
    )?.pricingRuleId;
    const clientFxDealPayload = {
      executionTimestamp: "2026-07-16T10:15:30.000Z",
      counterpartyId: 1,
      executionContextId: clientDealExecutionContextId,
      pricingRuleId: clientDealPricingRuleId,
      tradeDate: "2026-07-16",
      ccyPairCode: "EUR_USD",
      side: "SELL",
      dealtCcyCode: "USD",
      dealtCcyAmount: "2246200",
      tradeRate: "1.1231",
      tenor: "TOD",
      baseCcyValueDate: "2026-07-16",
      quoteCcyValueDate: "2026-07-16",
      marketPulseStreamStatus: "RUNNING",
      marketPulseBid: 1.1228,
      marketPulseOffer: 1.1230,
      marketPulseTimestamp: "2026-07-16T10:15:29.000Z",
      comment: "Initial verification comment"
    };

    const rollbackProbe = new DatabaseSync(verificationDatabasePath);
    rollbackProbe.exec("PRAGMA busy_timeout = 5000");
    const rollbackCountsBefore = {
      exposures: Number(rollbackProbe.prepare("SELECT COUNT(*) AS count FROM fx_trade_exposure").get().count),
      clientDeals: Number(rollbackProbe.prepare("SELECT COUNT(*) AS count FROM client_fx_deals").get().count),
      marketSnapshots: Number(rollbackProbe.prepare("SELECT COUNT(*) AS count FROM fx_trade_market_snapshot").get().count)
    };
    let rollbackClientFxDeal;
    let rollbackCountsAfter;

    try {
      rollbackProbe.exec(`
        CREATE TRIGGER verify_client_fx_deal_transaction_rollback
        BEFORE INSERT ON client_fx_deals
        BEGIN
          SELECT RAISE(ABORT, 'verification forced client insert failure');
        END;
      `);
      rollbackClientFxDeal = await request("POST", "/api/v1/client-fx-deals", clientFxDealPayload);
      rollbackCountsAfter = {
        exposures: Number(rollbackProbe.prepare("SELECT COUNT(*) AS count FROM fx_trade_exposure").get().count),
        clientDeals: Number(rollbackProbe.prepare("SELECT COUNT(*) AS count FROM client_fx_deals").get().count),
        marketSnapshots: Number(rollbackProbe.prepare("SELECT COUNT(*) AS count FROM fx_trade_market_snapshot").get().count)
      };
    } finally {
      rollbackProbe.exec("DROP TRIGGER IF EXISTS verify_client_fx_deal_transaction_rollback");
      rollbackProbe.close();
    }

    const createClientFxDeal = await request("POST", "/api/v1/client-fx-deals", clientFxDealPayload);
    const clientFxDealId = encodeURIComponent(createClientFxDeal.body?.clientDealId ?? "");
    const fxTradeExposureAfterCreate = await request("GET", "/api/database/tables/fx_trade_exposure");
    const fxTradeMarketSnapshotAfterCreate = await request("GET", "/api/database/tables/fx_trade_market_snapshot");
    const clientFxDealsAfterCreate = await request("GET", "/api/database/tables/client_fx_deals");
    const immutableClientFxDealUpdate = await request("PUT", `/api/v1/client-fx-deals/${clientFxDealId}`, {
      ...clientFxDealPayload,
      dealtCcyAmount: "2807750",
      marketPulseStreamStatus: "STOPPED",
      marketPulseBid: 1.1200,
      marketPulseOffer: 1.1202,
      marketPulseTimestamp: "2026-07-16T10:20:00.000Z"
    });
    const updateClientFxDealComment = await request(
      "PATCH",
      `/api/v1/client-fx-deals/${clientFxDealId}`,
      { comment: "Reviewed verification comment" }
    );
    const invalidClientFxDealComment = await request(
      "PATCH",
      `/api/v1/client-fx-deals/${clientFxDealId}`,
      { comment: "X".repeat(501) }
    );
    const fxTradeExposureAfterCommentUpdate = await request("GET", "/api/database/tables/fx_trade_exposure");
    const fxTradeMarketSnapshotAfterCommentUpdate = await request("GET", "/api/database/tables/fx_trade_market_snapshot");
    const clientFxDealsAfterCommentUpdate = await request("GET", "/api/database/tables/client_fx_deals");
    const invalidClientFxDealSide = await request("POST", "/api/v1/client-fx-deals", {
      ...clientFxDealPayload,
      side: "HOLD"
    });
    const invalidClientFxDealCounterparty = await request("POST", "/api/v1/client-fx-deals", {
      ...clientFxDealPayload,
      counterpartyId: 999999
    });
    const invalidClientFxDealTransferRate = await request("POST", "/api/v1/client-fx-deals", {
      ...clientFxDealPayload,
      executionContextId: null,
      pricingRuleId: null,
      manualPricingReason: "CLIENT_ONBOARDING",
      transferRate: "0"
    });
    const invalidClientFxDealSubMinorAmount = await request("POST", "/api/v1/client-fx-deals", {
      ...clientFxDealPayload,
      dealtCcyAmount: "2246200.001"
    });
    const invalidClientFxDealPricingScope = await request("POST", "/api/v1/client-fx-deals", {
      ...clientFxDealPayload,
      counterpartyId: 2
    });
    const invalidClientFxDealPricingMode = await request("POST", "/api/v1/client-fx-deals", {
      ...clientFxDealPayload,
      executionContextId: nonDealerPricedExecutionContextId,
      pricingRuleId: nonDealerPricedPricingRuleId
    });
    const rejectClientFxDealDelete = await request(
      "DELETE",
      `/api/v1/client-fx-deals/${clientFxDealId}`
    );
    const clientFxDealsAfterRejectedDelete = await request("GET", "/api/v1/client-fx-deals");
    const fxTradeExposureAfterRejectedClientDelete = await request(
      "GET",
      "/api/database/tables/fx_trade_exposure"
    );
    const fxTradeMarketSnapshotAfterRejectedClientDelete = await request(
      "GET",
      "/api/database/tables/fx_trade_market_snapshot"
    );
    const clientFxDealsTableAfterRejectedDelete = await request(
      "GET",
      "/api/database/tables/client_fx_deals"
    );
    const integrityProbe = new DatabaseSync(verificationDatabasePath);
    integrityProbe.exec("PRAGMA foreign_keys = ON");
    const foreignKeyViolations = integrityProbe.prepare("PRAGMA foreign_key_check").all().length;
    integrityProbe.close();
    const contextIdByComponents = (servicingLocationId, accountingSystemId, executionSystemId) =>
      executionContexts.body?.find(context =>
        context.servicingLocationId === servicingLocationId
        && context.accountingSystemId === accountingSystemId
        && context.executionSystemId === executionSystemId
      )?.executionContextId;
    const emeraldClickContextId = contextIdByComponents("001", "CTF3", "CLICK_TRADE_EFX");
    const wonderlandRfqContextId = contextIdByComponents("1234", "AFINA", "RFQ");
    const neverlandRfqContextId = contextIdByComponents("002", "AFINA", "RFQ");
    const simulationStatus = await request("GET", "/api/v1/market-pulse-simulation/status");
    const startSimulation = await request("POST", "/api/v1/market-pulse-simulation/start");
    const eventStream = await openEventStream("/api/v1/market-pulse-simulation/stream");
    const stopSimulation = await request("POST", "/api/v1/market-pulse-simulation/stop");
    const generationSettingsBefore = await request(
      "GET",
      "/api/v1/client-deal-generation/settings"
    );
    const generationRule = generationSettingsBefore.body
      ?.find(settings => settings.pricingMode === "AUTO_PRICED")
      || generationSettingsBefore.body?.[0];

    for (const settings of generationSettingsBefore.body || []) {
      await request(
        "PUT",
        `/api/v1/client-deal-generation/settings/${settings.pricingRuleId}`,
        {
          minBaseCcyAmount: settings.pricingRuleId === generationRule?.pricingRuleId
            ? 700000
            : settings.minBaseCcyAmount,
          maxBaseCcyAmount: settings.pricingRuleId === generationRule?.pricingRuleId
            ? 700000
            : settings.maxBaseCcyAmount,
          baseCcyAmountStep: settings.baseCcyAmountStep,
          buyProbabilityPercent: settings.pricingRuleId === generationRule?.pricingRuleId
            ? 100
            : settings.buyProbabilityPercent,
          active: settings.pricingRuleId === generationRule?.pricingRuleId
        }
      );
    }

    const generationSettingsConfigured = await request(
      "GET",
      "/api/v1/client-deal-generation/settings"
    );
    const invalidGenerationSettings = await request(
      "PUT",
      `/api/v1/client-deal-generation/settings/${generationRule?.pricingRuleId}`,
      {
        minBaseCcyAmount: 0,
        maxBaseCcyAmount: 700000,
        baseCcyAmountStep: 100000,
        buyProbabilityPercent: 100,
        active: true
      }
    );
    const generationPairCurrencies = String(generationRule?.currencyPair || "").split("/");
    const generationFractionDigitsProbe = new DatabaseSync(verificationDatabasePath);
    generationFractionDigitsProbe.exec("PRAGMA busy_timeout = 5000");
    const originalGenerationFractionDigits = generationFractionDigitsProbe.prepare(`
      SELECT ccy_code AS ccyCode, fraction_digits AS fractionDigits
      FROM ccy_options
      WHERE ccy_code IN (?, ?)
    `).all(generationPairCurrencies[0], generationPairCurrencies[1]);
    generationFractionDigitsProbe.prepare(`
      UPDATE ccy_options
      SET fraction_digits = ?
      WHERE ccy_code = ?
    `).run(3, generationPairCurrencies[0]);
    generationFractionDigitsProbe.prepare(`
      UPDATE ccy_options
      SET fraction_digits = ?
      WHERE ccy_code = ?
    `).run(0, generationPairCurrencies[1]);
    generationFractionDigitsProbe.close();
    const generatedClientFxDeal = await request(
      "POST",
      "/api/v1/client-deal-generation/one"
    );
    const generatedClientFxDealId = Number(generatedClientFxDeal.body?.tradeId);
    const generatedExposureTable = await request(
      "GET",
      "/api/database/tables/fx_trade_exposure"
    );
    const generatedExposureRow = generatedExposureTable.body?.rows
      ?.find(row => row.trade_id === generatedClientFxDealId) || null;
    const restoreGenerationFractionDigitsProbe = new DatabaseSync(verificationDatabasePath);
    restoreGenerationFractionDigitsProbe.exec("PRAGMA busy_timeout = 5000");

    for (const currency of originalGenerationFractionDigits) {
      restoreGenerationFractionDigitsProbe.prepare(`
        UPDATE ccy_options
        SET fraction_digits = ?
        WHERE ccy_code = ?
      `).run(currency.fractionDigits, currency.ccyCode);
    }

    restoreGenerationFractionDigitsProbe.close();
    const rejectGeneratedClientFxDealDelete = await request(
      "DELETE",
      `/api/v1/client-fx-deals/${generatedClientFxDealId}`
    );
    const generationProcessSettingsBefore = await request(
      "GET",
      "/api/v1/client-deal-generation/process-settings"
    );
    const invalidGenerationProcessSettings = await request(
      "PUT",
      "/api/v1/client-deal-generation/process-settings",
      {
        minIntervalSeconds: 3,
        maxIntervalSeconds: 2,
        minDealsPerCycle: 3,
        maxDealsPerCycle: 7
      }
    );
    const configuredGenerationProcessSettings = await request(
      "PUT",
      "/api/v1/client-deal-generation/process-settings",
      {
        minIntervalSeconds: 1,
        maxIntervalSeconds: 1,
        minDealsPerCycle: 3,
        maxDealsPerCycle: 3
      }
    );
    const startClientDealGenerationProcess = await request(
      "POST",
      "/api/v1/client-deal-generation/process/start"
    );
    let clientDealGenerationProcessStatus = await request(
      "GET",
      "/api/v1/client-deal-generation/process"
    );
    const generationProcessDeadline = Date.now() + 3000;

    while (
      Number(clientDealGenerationProcessStatus.body?.generatedDealCount) < 3
      && Date.now() < generationProcessDeadline
    ) {
      await new Promise(resolve => setTimeout(resolve, 25));
      clientDealGenerationProcessStatus = await request(
        "GET",
        "/api/v1/client-deal-generation/process"
      );
    }

    const stopClientDealGenerationProcess = await request(
      "POST",
      "/api/v1/client-deal-generation/process/stop"
    );
    const processGeneratedTradeId = Number(
      clientDealGenerationProcessStatus.body?.lastGeneratedTradeId
    );
    const rejectProcessGeneratedClientFxDealDelete = await request(
      "DELETE",
      `/api/v1/client-fx-deals/${processGeneratedTradeId}`
    );
    const restoredGenerationProcessSettings = await request(
      "PUT",
      "/api/v1/client-deal-generation/process-settings",
      generationProcessSettingsBefore.body
    );

    for (const settings of generationSettingsBefore.body || []) {
      await request(
        "PUT",
        `/api/v1/client-deal-generation/settings/${settings.pricingRuleId}`,
        {
          minBaseCcyAmount: settings.minBaseCcyAmount,
          maxBaseCcyAmount: settings.maxBaseCcyAmount,
          baseCcyAmountStep: settings.baseCcyAmountStep,
          buyProbabilityPercent: settings.buyProbabilityPercent,
          active: false
        }
      );
    }

    const rejectedClientDealGenerationProcessStart = await request(
      "POST",
      "/api/v1/client-deal-generation/process/start"
    );
    const stoppedClientDealGenerationProcessStatus = await request(
      "GET",
      "/api/v1/client-deal-generation/process"
    );

    for (const settings of generationSettingsBefore.body || []) {
      await request(
        "PUT",
        `/api/v1/client-deal-generation/settings/${settings.pricingRuleId}`,
        {
          minBaseCcyAmount: settings.minBaseCcyAmount,
          maxBaseCcyAmount: settings.maxBaseCcyAmount,
          baseCcyAmountStep: settings.baseCcyAmountStep,
          buyProbabilityPercent: settings.buyProbabilityPercent,
          active: settings.active
        }
      );
    }

    const generationSettingsRestored = await request(
      "GET",
      "/api/v1/client-deal-generation/settings"
    );

    const createCurrency = await request("POST", "/api/v1/ccy-options", {
      code: "QAA",
      name: "Verification QAA",
      country: "Verification",
      fractionDigits: 2
    });
    const createPair = await request("POST", "/api/v1/ccy-pair-options", {
      baseCcy: "QAA",
      quoteCcy: "EUR",
      defaultQuoteDecimals: 5
    });
    const putSettings = await request("PUT", "/api/v1/ccy-pair-options/QAA_EUR/simulation-settings", {
      bidMin: 1.1,
      spread: 0.0002,
      bidMax: 1.2,
      oneWayDurationSeconds: 45,
      fluctuationSpreads: 2.5
    });
    const getSettings = await request("GET", "/api/v1/ccy-pair-options/QAA_EUR/simulation-settings");
    const patchPair = await request("PATCH", "/api/v1/ccy-pair-options/QAA_EUR", {
      defaultQuoteDecimals: 4
    });
    const deleteSettings = await request("DELETE", "/api/v1/ccy-pair-options/QAA_EUR/simulation-settings");
    const restoreSettings = await request("PUT", "/api/v1/ccy-pair-options/QAA_EUR/simulation-settings", {
      bidMin: 1.1,
      spread: 0.0002,
      bidMax: 1.2,
      oneWayDurationSeconds: 60,
      fluctuationSpreads: 3
    });
    const blockedCurrencyDelete = await request("DELETE", "/api/v1/ccy-options/QAA");
    const deletePair = await request("DELETE", "/api/v1/ccy-pair-options/QAA_EUR");
    const deleteCurrency = await request("DELETE", "/api/v1/ccy-options/QAA");
    const createServicingLocation = await request("POST", "/api/v1/servicing-locations", {
      servicingLocationId: "SITE-999",
      name: "Verification Branch",
      region: "Verification",
      type: "BRANCH",
      active: true
    });
    const updateServicingLocation = await request("PUT", "/api/v1/servicing-locations/SITE-999", {
      servicingLocationId: "SITE-998",
      name: "Updated Verification Branch",
      region: "Verification",
      type: "BRANCH",
      active: false
    });
    const blockedServicingLocationDelete = await request("DELETE", "/api/v1/servicing-locations/001");
    const createAccountingSystem = await request("POST", "/api/v1/accounting-systems", {
      accountingSystemId: "VERIFY_LEDGER",
      name: "Verification Ledger",
      active: true
    });
    const updateAccountingSystem = await request("PUT", "/api/v1/accounting-systems/VERIFY_LEDGER", {
      accountingSystemId: "UPDATED_LEDGER",
      name: "Updated Verification Ledger",
      active: false
    });
    const blockedAccountingSystemDelete = await request("DELETE", "/api/v1/accounting-systems/AFINA");
    const deleteAccountingSystem = await request("DELETE", "/api/v1/accounting-systems/UPDATED_LEDGER");
    const createExecutionSystem = await request("POST", "/api/v1/execution-systems", {
      executionSystemId: "VERIFY_EXECUTION",
      name: "Verification Execution System",
      pricingMode: "DEALER_APPROVED",
      active: true
    });
    const updateExecutionSystem = await request("PUT", "/api/v1/execution-systems/VERIFY_EXECUTION", {
      executionSystemId: "UPDATED_EXECUTION",
      name: "Updated Verification Execution System",
      pricingMode: "AUTO_PRICED",
      active: false
    });
    const blockedExecutionSystemDelete = await request("DELETE", "/api/v1/execution-systems/CLICK_TRADE_EFX");
    const deleteExecutionSystem = await request("DELETE", "/api/v1/execution-systems/UPDATED_EXECUTION");
    const createExecutionContext = await request("POST", "/api/v1/execution-contexts", {
      servicingLocationId: "SITE-998",
      accountingSystemId: "NOT_APPLICABLE",
      executionSystemId: "RFQ"
    });
    const contextId = encodeURIComponent(createExecutionContext.body?.executionContextId ?? "");
    const servicingLocationsAfterContextCreate = await request("GET", "/api/v1/servicing-locations");
    const updateExecutionContext = await request("PUT", `/api/v1/execution-contexts/${contextId}`, {
      servicingLocationId: "SITE-998",
      accountingSystemId: "CTF3",
      executionSystemId: "RFQ"
    });
    const invalidExecutionContext = await request("POST", "/api/v1/execution-contexts", {
      servicingLocationId: "SITE-998",
      accountingSystemId: "UNKNOWN_LEDGER",
      executionSystemId: "RFQ"
    });
    const deleteExecutionContext = await request("DELETE", `/api/v1/execution-contexts/${contextId}`);
    const servicingLocationsAfterContextDelete = await request("GET", "/api/v1/servicing-locations");
    const deleteServicingLocation = await request("DELETE", "/api/v1/servicing-locations/SITE-998");
    const createTradingCounterparty = await request("POST", "/api/v1/trading-counterparties", {
      counterpartyScope: "INTERNAL",
      counterpartyRoles: ["HEDGE_COUNTERPARTY"],
      unitCode: "FRONT_FOLDER_1",
      unitType: "DESK",
      counterpartyName: "Verification FX Desk",
      active: true
    });
    const tradingCounterpartyId = encodeURIComponent(createTradingCounterparty.body?.counterpartyId ?? "");
    const updateTradingCounterparty = await request("PUT", `/api/v1/trading-counterparties/${tradingCounterpartyId}`, {
      counterpartyScope: "INTERNAL",
      counterpartyRoles: ["HEDGE_COUNTERPARTY"],
      unitCode: "VERIFY_FOLDER",
      unitType: "DEPARTMENT",
      counterpartyName: "Verification Counterparty",
      active: false
    });
    const counterpartyExecutionContextsPath =
      `/api/v1/trading-counterparties/${tradingCounterpartyId}/execution-contexts`;
    const attachCounterpartyExecutionContexts = await request(
      "PUT",
      counterpartyExecutionContextsPath,
      { executionContextIds: [emeraldClickContextId, wonderlandRfqContextId] }
    );
    const idempotentCounterpartyExecutionContextAttach = await request(
      "PUT",
      counterpartyExecutionContextsPath,
      { executionContextIds: [emeraldClickContextId] }
    );
    const invalidCounterpartyExecutionContextAssignments = await request(
      "PUT",
      counterpartyExecutionContextsPath,
      { executionContextIds: [] }
    );
    const atomicCounterpartyExecutionContextAttach = await request(
      "PUT",
      counterpartyExecutionContextsPath,
      { executionContextIds: [neverlandRfqContextId, 999999] }
    );
    const counterpartyExecutionContextsAfterAtomicFailure = await request(
      "GET",
      counterpartyExecutionContextsPath
    );
    const attachSingleCounterpartyExecutionContext = await request(
      "PUT",
      `${counterpartyExecutionContextsPath}/${neverlandRfqContextId}`
    );
    const detachSingleCounterpartyExecutionContext = await request(
      "DELETE",
      `${counterpartyExecutionContextsPath}/${neverlandRfqContextId}`
    );
    const idempotentCounterpartyExecutionContextDetach = await request(
      "DELETE",
      `${counterpartyExecutionContextsPath}/${neverlandRfqContextId}`
    );
    const counterpartyExecutionContextsAfterDetach = await request(
      "GET",
      counterpartyExecutionContextsPath
    );
    const duplicateTradingCounterparty = await request("POST", "/api/v1/trading-counterparties", {
      counterpartyScope: "EXTERNAL",
      counterpartyRoles: ["CLIENT"],
      counterpartyCode: "7701234567",
      counterpartyCodeType: "INN",
      externalCounterpartyKind: "CORPORATE",
      counterpartyName: "Duplicate Client",
      active: true
    });
    const invalidLegacyExternalCounterpartyType = await request("POST", "/api/v1/trading-counterparties", {
      counterpartyScope: "UNKNOWN",
      counterpartyRoles: ["HEDGE_COUNTERPARTY"],
      counterpartyCode: "VERIFY_EXTERNAL",
      counterpartyCodeType: "OTHER",
      externalCounterpartyKind: "CORPORATE",
      counterpartyName: "Invalid Counterparty Scope",
      active: true
    });
    const invalidLegacyInternalCounterpartyType = await request("POST", "/api/v1/trading-counterparties", {
      counterpartyScope: "INTERNAL",
      counterpartyRoles: ["UNKNOWN"],
      unitCode: "VERIFY_INTERNAL",
      unitType: "DESK",
      counterpartyName: "Invalid Trading Counterparty Role",
      active: true
    });
    const invalidTradingCounterpartyCodeType = await request("POST", "/api/v1/trading-counterparties", {
      counterpartyScope: "EXTERNAL",
      counterpartyRoles: ["CLIENT"],
      counterpartyCode: "VERIFY_LEI",
      counterpartyCodeType: "LEI",
      externalCounterpartyKind: "CORPORATE",
      counterpartyName: "Invalid Code Type",
      active: true
    });
    const invalidTradingCounterpartyCodeLength = await request("POST", "/api/v1/trading-counterparties", {
      counterpartyScope: "EXTERNAL",
      counterpartyRoles: ["CLIENT"],
      counterpartyCode: "X".repeat(21),
      counterpartyCodeType: "OTHER",
      externalCounterpartyKind: "CORPORATE",
      counterpartyName: "Invalid Code Length",
      active: true
    });
    const invalidTradingCounterpartyNameLength = await request("POST", "/api/v1/trading-counterparties", {
      counterpartyScope: "EXTERNAL",
      counterpartyRoles: ["CLIENT"],
      counterpartyCode: "VERIFY_NAME_LIMIT",
      counterpartyCodeType: "OTHER",
      externalCounterpartyKind: "CORPORATE",
      counterpartyName: "X".repeat(201),
      active: true
    });
    const createUser = await request("POST", "/api/v1/users", {
      userCode: "VERIFY.USER",
      firstName: "Verification",
      lastName: "Dealer",
      userRole: "DEALER",
      active: true
    });
    const userId = encodeURIComponent(createUser.body?.userId ?? "");
    const updateUser = await request("PUT", `/api/v1/users/${userId}`, {
      userCode: "VERIFY.USER",
      firstName: "Verified",
      lastName: "Supervisor",
      userRole: "SUPERVISOR",
      active: false
    });
    const duplicateUser = await request("POST", "/api/v1/users", {
      userCode: "VERIFY.USER",
      firstName: "Duplicate",
      lastName: "User",
      userRole: "DEALER",
      active: true
    });
    const invalidUserCode = await request("POST", "/api/v1/users", {
      userCode: "invalid code",
      firstName: "Invalid",
      lastName: "Code",
      userRole: "DEALER",
      active: true
    });
    const invalidUserRole = await request("POST", "/api/v1/users", {
      userCode: "VERIFY_ROLE",
      firstName: "Invalid",
      lastName: "Role",
      userRole: "UNKNOWN",
      active: true
    });
    const deleteUser = await request("DELETE", `/api/v1/users/${userId}`);
    const usersAfterDelete = await request("GET", "/api/v1/users");
    const createPricingRule = await request("POST", "/api/v1/pricing-rules", {
      counterpartyId: createTradingCounterparty.body?.counterpartyId,
      executionContextId: emeraldClickContextId,
      ccyPairCode: "EUR_USD",
      marginPercent: 0.25
    });
    const pricingRuleId = encodeURIComponent(createPricingRule.body?.pricingRuleId ?? "");
    const updatePricingRule = await request("PUT", `/api/v1/pricing-rules/${pricingRuleId}`, {
      marginPercent: 0.3
    });
    const immutablePricingRuleUpdate = await request("PUT", `/api/v1/pricing-rules/${pricingRuleId}`, {
      executionContextId: wonderlandRfqContextId,
      marginPercent: 0.35
    });
    const pricingRulesAfterImmutableUpdate = await request("GET", "/api/v1/pricing-rules");
    const pricingRuleAfterImmutableUpdate = pricingRulesAfterImmutableUpdate.body
      ?.find(rule => rule.pricingRuleId === Number(pricingRuleId));
    const duplicatePricingRule = await request("POST", "/api/v1/pricing-rules", {
      counterpartyId: createTradingCounterparty.body?.counterpartyId,
      executionContextId: emeraldClickContextId,
      ccyPairCode: "EUR_USD",
      marginPercent: 0.4
    });
    const invalidPricingRuleCounterparty = await request("POST", "/api/v1/pricing-rules", {
      counterpartyId: 999999,
      executionContextId: wonderlandRfqContextId,
      ccyPairCode: "EUR_USD",
      marginPercent: 0.4
    });
    const invalidPricingRuleMargin = await request("POST", "/api/v1/pricing-rules", {
      counterpartyId: createTradingCounterparty.body?.counterpartyId,
      executionContextId: neverlandRfqContextId,
      ccyPairCode: "EUR_USD",
      marginPercent: 100
    });
    const blockedCounterpartyExecutionContextDetach = await request(
      "DELETE",
      `${counterpartyExecutionContextsPath}/${emeraldClickContextId}`
    );
    const blockedTradingCounterpartyDelete = await request("DELETE", `/api/v1/trading-counterparties/${tradingCounterpartyId}`);
    const deletePricingRule = await request("DELETE", `/api/v1/pricing-rules/${pricingRuleId}`);
    const detachCounterpartyExecutionContextAfterPricingRuleDelete = await request(
      "DELETE",
      `${counterpartyExecutionContextsPath}/${emeraldClickContextId}`
    );
    const deleteTradingCounterparty = await request("DELETE", `/api/v1/trading-counterparties/${tradingCounterpartyId}`);
    const tradingCounterpartiesAfterDelete = await request("GET", "/api/v1/trading-counterparties");
    const createHedgeCounterparty = await request("POST", "/api/v1/trading-counterparties", {
      counterpartyScope: "EXTERNAL",
      counterpartyRoles: ["HEDGE_COUNTERPARTY"],
      counterpartyCode: "VERIFY_HEDGE",
      counterpartyCodeType: "OTHER",
      externalCounterpartyKind: "BANK",
      counterpartyName: "Verification Hedge Counterparty",
      active: true
    });
    const attachHedgeCounterpartyExecutionContexts = await request(
      "PUT",
      `/api/v1/trading-counterparties/${createHedgeCounterparty.body?.counterpartyId}/execution-contexts`,
      {
        executionContextIds: [
          neverlandRfqContextId,
          clientDealExecutionContextId,
          nonDealerPricedExecutionContextId
        ]
      }
    );
    const createDealerApprovedHedgePricingRule = await request("POST", "/api/v1/pricing-rules", {
      counterpartyId: createHedgeCounterparty.body?.counterpartyId,
      executionContextId: neverlandRfqContextId,
      ccyPairCode: "EUR_USD",
      marginPercent: 0.12
    });
    const createHedgePricingRule = await request("POST", "/api/v1/pricing-rules", {
      counterpartyId: createHedgeCounterparty.body?.counterpartyId,
      executionContextId: clientDealExecutionContextId,
      ccyPairCode: "EUR_USD",
      marginPercent: 0.15
    });
    const createAutoPricedHedgePricingRule = await request("POST", "/api/v1/pricing-rules", {
      counterpartyId: createHedgeCounterparty.body?.counterpartyId,
      executionContextId: nonDealerPricedExecutionContextId,
      ccyPairCode: "EUR_USD",
      marginPercent: 0
    });
    const hedgeDealPricingRules = await request("GET", "/api/v1/hedge-deal-pricing-rules");
    const autoPricedHedgeDealPricingRules = await request(
      "GET",
      "/api/v1/hedge-deal-pricing-rules?pricingMode=AUTO_PRICED"
    );
    const invalidHedgeDealPricingMode = await request(
      "GET",
      "/api/v1/hedge-deal-pricing-rules?pricingMode=DEALER_APPROVED"
    );
    const createHedgeFxDeal = await request("POST", "/api/v1/hedge-fx-deals", {
      pricingRuleId: createHedgePricingRule.body?.pricingRuleId,
      ccyPairCode: "EUR_USD",
      side: "BUY",
      dealtCcyCode: "USD",
      dealtCcyAmount: "2808500",
      tradeRate: "1.1234",
      tenor: "TOD"
    });
    const invalidManualHedgeFxDealAutoPricedRule = await request(
      "POST",
      "/api/v1/hedge-fx-deals",
      {
        pricingRuleId: createAutoPricedHedgePricingRule.body?.pricingRuleId,
        ccyPairCode: "EUR_USD",
        side: "BUY",
        dealtCcyCode: "EUR",
        dealtCcyAmount: "1000000",
        tradeRate: "1.1234",
        tenor: "TOD"
      }
    );
    const invalidHedgeFxDealDealerApprovedRule = await request("POST", "/api/v1/hedge-fx-deals", {
      pricingRuleId: createDealerApprovedHedgePricingRule.body?.pricingRuleId,
      ccyPairCode: "EUR_USD",
      side: "BUY",
      dealtCcyCode: "EUR",
      dealtCcyAmount: "2500000",
      tradeRate: "1.1234",
      tenor: "TOD"
    });
    const invalidHedgeFxDealSubMinorAmount = await request("POST", "/api/v1/hedge-fx-deals", {
      pricingRuleId: createHedgePricingRule.body?.pricingRuleId,
      ccyPairCode: "EUR_USD",
      side: "BUY",
      dealtCcyCode: "USD",
      dealtCcyAmount: "2808500.001",
      tradeRate: "1.1234",
      tenor: "TOD"
    });
    const deleteDealerApprovedHedgePricingRule = await request(
      "DELETE",
      `/api/v1/pricing-rules/${createDealerApprovedHedgePricingRule.body?.pricingRuleId}`
    );
    const invalidHedgeFxDealClientRule = await request("POST", "/api/v1/hedge-fx-deals", {
      pricingRuleId: clientDealPricingRuleId,
      ccyPairCode: "EUR_USD",
      side: "BUY",
      dealtCcyCode: "EUR",
      dealtCcyAmount: "2500000",
      tradeRate: "1.1234",
      tenor: "TOD"
    });
    const hedgeFxDealsAfterCreate = await request("GET", "/api/v1/hedge-fx-deals");
    const fxTradeExposureAfterHedgeCreate = await request("GET", "/api/database/tables/fx_trade_exposure");
    const fxHedgeDealsAfterCreate = await request("GET", "/api/database/tables/fx_hedge_deals");
    const fxTradeMarketSnapshotAfterHedgeCreate = await request(
      "GET",
      "/api/database/tables/fx_trade_market_snapshot"
    );
    const createdTradeId = Number(createClientFxDeal.body?.tradeId);
    const createdHedgeTradeId = Number(createHedgeFxDeal.body?.tradeId);
    const sendCreatedClientDealToAuto = await request(
      "POST",
      "/api/v1/fx-positions/send-to-auto-batching",
      { trades: [{ tradeId: createdTradeId, tradeType: "CLIENT_DEAL" }] }
    );
    const replayCreatedClientDealToAuto = await request(
      "POST",
      "/api/v1/fx-positions/send-to-auto-batching",
      { trades: [{ tradeId: createdTradeId, tradeType: "CLIENT_DEAL" }] }
    );
    const fxPositionsAfterSendToAuto = await request("GET", "/api/v1/fx-positions");
    const fxTradePositionManagementTransitionsAfterSend = await request(
      "GET",
      "/api/database/tables/fx_trade_position_management_transitions"
    );
    const transitionedCreatedFxPosition = fxPositionsAfterSendToAuto.body
      ?.find(row => row.tradeId === createdTradeId && row.tradeType === "CLIENT_DEAL") || null;
    const createdTradePositionManagementTransitions =
      fxTradePositionManagementTransitionsAfterSend.body?.rows?.filter(row =>
        row.trade_id === createdTradeId && row.trade_type === "CLIENT_DEAL"
      ) || [];
    const migratedExposureRow = fxTradeExposureTable.body?.rows?.find(row => row.trade_id === 41) || null;
    const migratedPositionManagementRow = fxTradePositionManagementTable.body?.rows
      ?.find(row => row.trade_id === 41 && row.trade_type === "CLIENT_DEAL") || null;
    const migratedFxPosition = migratedFxPositions.body
      ?.find(row => row.tradeId === 41 && row.tradeType === "CLIENT_DEAL") || null;
    const migratedClientRow = clientFxDealsTable.body?.rows?.find(row => row.trade_id === 41) || null;
    const createdExposureRow = fxTradeExposureAfterCreate.body?.rows
      ?.find(row => row.trade_id === createdTradeId) || null;
    const createdClientRow = clientFxDealsAfterCreate.body?.rows
      ?.find(row => row.trade_id === createdTradeId) || null;
    const updatedExposureRow = fxTradeExposureAfterCommentUpdate.body?.rows
      ?.find(row => row.trade_id === createdTradeId) || null;
    const updatedClientRow = clientFxDealsAfterCommentUpdate.body?.rows
      ?.find(row => row.trade_id === createdTradeId) || null;
    const createdMarketSnapshotRow = fxTradeMarketSnapshotAfterCreate.body?.rows
      ?.find(row => row.trade_id === createdTradeId) || null;
    const updatedMarketSnapshotRow = fxTradeMarketSnapshotAfterCommentUpdate.body?.rows
      ?.find(row => row.trade_id === createdTradeId) || null;
    const createdHedgeExposureRow = fxTradeExposureAfterHedgeCreate.body?.rows
      ?.find(row => row.trade_id === createdHedgeTradeId) || null;
    const createdHedgeDealRow = fxHedgeDealsAfterCreate.body?.rows
      ?.find(row => row.trade_id === createdHedgeTradeId) || null;
    const createdHedgeMarketSnapshotRow = fxTradeMarketSnapshotAfterHedgeCreate.body?.rows
      ?.find(row => row.trade_id === createdHedgeTradeId) || null;
    const rejectHedgeFxDealDelete = await request(
      "DELETE",
      `/api/v1/hedge-fx-deals/${createdHedgeTradeId}`
    );
    const hedgeFxDealsAfterRejectedDelete = await request("GET", "/api/v1/hedge-fx-deals");
    const fxTradeExposureAfterRejectedHedgeDelete = await request(
      "GET",
      "/api/database/tables/fx_trade_exposure"
    );
    const fxHedgeDealsAfterRejectedDelete = await request(
      "GET",
      "/api/database/tables/fx_hedge_deals"
    );
    const fxTradeMarketSnapshotAfterRejectedHedgeDelete = await request(
      "GET",
      "/api/database/tables/fx_trade_market_snapshot"
    );
    const invalidAutoPricedHedgeFxDealDealerRule = await request(
      "POST",
      "/api/v1/hedge-fx-deals/auto-priced",
      {
        pricingRuleId: createHedgePricingRule.body?.pricingRuleId,
        ccyPairCode: "EUR_USD",
        side: "BUY",
        dealtCcyCode: "EUR",
        dealtCcyAmount: "1000000",
        tenor: "TOD"
      }
    );
    const invalidAutoPricedHedgeFxDealSuppliedRate = await request(
      "POST",
      "/api/v1/hedge-fx-deals/auto-priced",
      {
        pricingRuleId: createAutoPricedHedgePricingRule.body?.pricingRuleId,
        ccyPairCode: "EUR_USD",
        side: "BUY",
        dealtCcyCode: "EUR",
        dealtCcyAmount: "1000000",
        tradeRate: "9.9999",
        tenor: "TOD"
      }
    );
    const hedgeQuickModeSettingsBefore = await request(
      "GET",
      "/api/v1/hedge-quick-mode-settings"
    );
    const hedgeQuickModeSettingsPayload = {
      counterpartyId: createHedgeCounterparty.body?.counterpartyId,
      pricingRuleId: createAutoPricedHedgePricingRule.body?.pricingRuleId,
      smallBaseCcyAmount: "5000000",
      mediumBaseCcyAmount: "20000000",
      largeBaseCcyAmount: "50000000",
      xlargeBaseCcyAmount: "100000000",
      defaultTenor: "TOD",
      active: true
    };
    const createHedgeQuickModeSettings = await request(
      "PUT",
      "/api/v1/hedge-quick-mode-settings/EUR_USD",
      hedgeQuickModeSettingsPayload
    );
    const getHedgeQuickModeSettings = await request(
      "GET",
      "/api/v1/hedge-quick-mode-settings/EUR_USD"
    );
    const invalidHedgeQuickModeSettings = await request(
      "PUT",
      "/api/v1/hedge-quick-mode-settings/EUR_USD",
      {
        ...hedgeQuickModeSettingsPayload,
        mediumBaseCcyAmount: "5000000"
      }
    );
    const invalidHedgeQuickModeOwnedField = await request(
      "POST",
      "/api/v1/hedge-fx-deals/quick-mode",
      {
        ccyPairCode: "EUR_USD",
        side: "BUY",
        presetCode: "SMALL",
        tenor: "TOD",
        pricingRuleId: createAutoPricedHedgePricingRule.body?.pricingRuleId
      }
    );
    const invalidHedgeQuickModeExtraField = await request(
      "POST",
      "/api/v1/hedge-fx-deals/quick-mode",
      {
        ccyPairCode: "EUR_USD",
        side: "BUY",
        presetCode: "SMALL",
        tenor: "TOD",
        counterpartyId: createHedgeCounterparty.body?.counterpartyId
      }
    );
    const invalidHedgeQuickModePreset = await request(
      "POST",
      "/api/v1/hedge-fx-deals/quick-mode",
      {
        ccyPairCode: "EUR_USD",
        side: "BUY",
        presetCode: "CUSTOM",
        tenor: "TOD"
      }
    );
    const createQuickModeBankSellHedgeFxDeal = await request(
      "POST",
      "/api/v1/hedge-fx-deals/quick-mode",
      {
        ccyPairCode: "EUR_USD",
        side: "BUY",
        presetCode: "MEDIUM"
      }
    );
    const createQuickModeBankBuyHedgeFxDeal = await request(
      "POST",
      "/api/v1/hedge-fx-deals/quick-mode",
      {
        ccyPairCode: "EUR_USD",
        side: "SELL",
        presetCode: "LARGE",
        tenor: "TOD"
      }
    );
    const disableHedgeQuickModeSettings = await request(
      "PUT",
      "/api/v1/hedge-quick-mode-settings/EUR_USD",
      {
        ...hedgeQuickModeSettingsPayload,
        active: false
      }
    );
    const rejectDisabledHedgeQuickMode = await request(
      "POST",
      "/api/v1/hedge-fx-deals/quick-mode",
      {
        ccyPairCode: "EUR_USD",
        side: "BUY",
        presetCode: "SMALL",
        tenor: "TOD"
      }
    );
    const deleteHedgeQuickModeSettings = await request(
      "DELETE",
      "/api/v1/hedge-quick-mode-settings/EUR_USD"
    );
    const missingHedgeQuickModeSettings = await request(
      "GET",
      "/api/v1/hedge-quick-mode-settings/EUR_USD"
    );
    const restoreHedgeQuickModeSettings = await request(
      "PUT",
      "/api/v1/hedge-quick-mode-settings/EUR_USD",
      hedgeQuickModeSettingsPayload
    );
    const hedgeQuickModeSettingsAfterRestore = await request(
      "GET",
      "/api/v1/hedge-quick-mode-settings"
    );
    const createAutoPricedBankSellHedgeFxDeal = await request(
      "POST",
      "/api/v1/hedge-fx-deals/auto-priced",
      {
        pricingRuleId: createAutoPricedHedgePricingRule.body?.pricingRuleId,
        ccyPairCode: "EUR_USD",
        side: "BUY",
        dealtCcyCode: "EUR",
        dealtCcyAmount: "1000000",
        tenor: "TOD"
      }
    );
    const createAutoPricedBankBuyHedgeFxDeal = await request(
      "POST",
      "/api/v1/hedge-fx-deals/auto-priced",
      {
        pricingRuleId: createAutoPricedHedgePricingRule.body?.pricingRuleId,
        ccyPairCode: "EUR_USD",
        side: "SELL",
        dealtCcyCode: "EUR",
        dealtCcyAmount: "1200000",
        tenor: "TOD"
      }
    );
    const fxTradeExposureAfterAutoPricedHedgeCreate = await request(
      "GET",
      "/api/database/tables/fx_trade_exposure"
    );
    const fxHedgeDealsAfterAutoPricedHedgeCreate = await request(
      "GET",
      "/api/database/tables/fx_hedge_deals"
    );
    const fxTradeMarketSnapshotAfterAutoPricedHedgeCreate = await request(
      "GET",
      "/api/database/tables/fx_trade_market_snapshot"
    );
    const autoPricedBankSellTradeId = Number(
      createAutoPricedBankSellHedgeFxDeal.body?.tradeId
    );
    const autoPricedBankBuyTradeId = Number(
      createAutoPricedBankBuyHedgeFxDeal.body?.tradeId
    );
    const quickModeBankSellTradeId = Number(
      createQuickModeBankSellHedgeFxDeal.body?.tradeId
    );
    const quickModeBankBuyTradeId = Number(
      createQuickModeBankBuyHedgeFxDeal.body?.tradeId
    );
    const autoPricedBankSellExposureRow =
      fxTradeExposureAfterAutoPricedHedgeCreate.body?.rows
        ?.find(row => row.trade_id === autoPricedBankSellTradeId) || null;
    const autoPricedBankBuyExposureRow =
      fxTradeExposureAfterAutoPricedHedgeCreate.body?.rows
        ?.find(row => row.trade_id === autoPricedBankBuyTradeId) || null;
    const autoPricedBankSellDealRow =
      fxHedgeDealsAfterAutoPricedHedgeCreate.body?.rows
        ?.find(row => row.trade_id === autoPricedBankSellTradeId) || null;
    const autoPricedBankBuyDealRow =
      fxHedgeDealsAfterAutoPricedHedgeCreate.body?.rows
        ?.find(row => row.trade_id === autoPricedBankBuyTradeId) || null;
    const autoPricedBankSellSnapshotRow =
      fxTradeMarketSnapshotAfterAutoPricedHedgeCreate.body?.rows
        ?.find(row => row.trade_id === autoPricedBankSellTradeId) || null;
    const autoPricedBankBuySnapshotRow =
      fxTradeMarketSnapshotAfterAutoPricedHedgeCreate.body?.rows
        ?.find(row => row.trade_id === autoPricedBankBuyTradeId) || null;
    const quickModeBankSellExposureRow =
      fxTradeExposureAfterAutoPricedHedgeCreate.body?.rows
        ?.find(row => row.trade_id === quickModeBankSellTradeId) || null;
    const quickModeBankBuyExposureRow =
      fxTradeExposureAfterAutoPricedHedgeCreate.body?.rows
        ?.find(row => row.trade_id === quickModeBankBuyTradeId) || null;
    const quickModeBankSellDealRow =
      fxHedgeDealsAfterAutoPricedHedgeCreate.body?.rows
        ?.find(row => row.trade_id === quickModeBankSellTradeId) || null;
    const quickModeBankBuyDealRow =
      fxHedgeDealsAfterAutoPricedHedgeCreate.body?.rows
        ?.find(row => row.trade_id === quickModeBankBuyTradeId) || null;
    const quickModeBankSellSnapshotRow =
      fxTradeMarketSnapshotAfterAutoPricedHedgeCreate.body?.rows
        ?.find(row => row.trade_id === quickModeBankSellTradeId) || null;
    const quickModeBankBuySnapshotRow =
      fxTradeMarketSnapshotAfterAutoPricedHedgeCreate.body?.rows
        ?.find(row => row.trade_id === quickModeBankBuyTradeId) || null;
    const flatBatchSourceDatabase = new DatabaseSync(verificationDatabasePath);
    flatBatchSourceDatabase.exec("PRAGMA foreign_keys = ON");
    const insertFlatBatchExposure = flatBatchSourceDatabase.prepare(`
      INSERT INTO fx_trade_exposure
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
      VALUES (?, ?, 'CLIENT_DEAL', '2026-07-15', 'EUR_USD', ?, 'EUR',
        100000000, 2, ?, 2, ?, 'TOM', '2026-07-16', '2026-07-16')
    `);
    const insertFlatBatchClientDeal = flatBatchSourceDatabase.prepare(`
      INSERT INTO client_fx_deals
        (
          trade_id,
          trade_type,
          counterparty_id,
          execution_context_id,
          pricing_rule_id,
          transfer_rate,
          analytical_pnl_quote_minor,
          analytical_pnl_quote_fraction_digits,
          comment
        )
      VALUES (?, 'CLIENT_DEAL', 1, NULL, NULL, ?, NULL, NULL, NULL)
    `);
    const flatSellTradeId = Number(
      insertFlatBatchExposure.run(
        "2026-07-27T10:00:00.000Z",
        "2026-07-27T10:00:00.000Z",
        "SELL",
        112300000,
        1.123
      ).lastInsertRowid
    );
    insertFlatBatchClientDeal.run(flatSellTradeId, 1.123);
    const flatBuyTradeId = Number(
      insertFlatBatchExposure.run(
        "2026-07-27T10:00:01.000Z",
        "2026-07-27T10:00:01.000Z",
        "BUY",
        112400000,
        1.124
      ).lastInsertRowid
    );
    insertFlatBatchClientDeal.run(flatBuyTradeId, 1.124);
    flatBatchSourceDatabase.close();

    const fxPositionsBeforeFlatBatch = await request("GET", "/api/v1/fx-positions");
    const createParentPositionOutBatch = await request("POST", "/api/v1/fx-batches", {
      idempotencyKey: "verify-position-out-source-parent",
      tradeIds: [flatSellTradeId]
    });
    const parentPositionOutTrade = createParentPositionOutBatch.body?.trades?.find(
      trade => trade.tradeType === "BATCH_POSITION_OUT"
    ) || null;
    const parentBalanceTrade = createParentPositionOutBatch.body?.trades?.find(
      trade => trade.tradeType === "BATCH_BALANCE_TRADE"
    ) || null;
    const parentPositionOutTradeId = Number(parentPositionOutTrade?.tradeId);
    const parentBalanceTradeId = Number(parentBalanceTrade?.tradeId);
    const fxPositionsAfterParentPositionOut = await request(
      "GET",
      "/api/v1/fx-positions"
    );
    const batchingPositionsWhileParentFormed = await request(
      "GET",
      "/api/v1/batching-positions"
    );
    const rejectBalanceSourceWhileParentFormed = await request(
      "POST",
      "/api/v1/fx-batches",
      {
        idempotencyKey: "verify-balance-trade-source-active-rejection",
        tradeIds: [parentBalanceTradeId]
      }
    );
    const activeMembershipProbe = new DatabaseSync(verificationDatabasePath);
    activeMembershipProbe.exec("PRAGMA foreign_keys = ON");
    let activeMembershipConstraintEnforced = false;

    try {
      activeMembershipProbe.exec("BEGIN IMMEDIATE");
      const probeBatchId = Number(activeMembershipProbe.prepare(`
        INSERT INTO fx_batches (idempotency_key, ccy_pair_code)
        VALUES ('verify-active-membership-db-guard', 'EUR_USD')
      `).run().lastInsertRowid);
      activeMembershipProbe.prepare(`
        INSERT INTO fx_batch_members
          (batch_id, trade_id, trade_type, member_role)
        VALUES (?, ?, 'BATCH_BALANCE_TRADE', 'TRADE')
      `).run(probeBatchId, parentBalanceTradeId);
    } catch (error) {
      activeMembershipConstraintEnforced = String(error?.message || "")
        .includes("trade may belong to only one active batch");
    } finally {
      try {
        activeMembershipProbe.exec("ROLLBACK");
      } catch {}
      activeMembershipProbe.close();
    }
    const rollbackParentFxBatch = await request(
      "POST",
      `/api/v1/fx-batches/${createParentPositionOutBatch.body?.batchId}/rollback`
    );
    const fxPositionsAfterParentRollback = await request(
      "GET",
      "/api/v1/fx-positions"
    );
    const batchingPositionsAfterParentRollback = await request(
      "GET",
      "/api/v1/batching-positions"
    );
    const createBalanceSourceBatch = await request("POST", "/api/v1/fx-batches", {
      idempotencyKey: "verify-balance-trade-source",
      tradeIds: [parentBalanceTradeId]
    });
    const balanceSourceBatchDetails = await request(
      "GET",
      `/api/v1/fx-batches/${createBalanceSourceBatch.body?.batchId}`
    );
    const fxPositionsAfterBalanceRebatch = await request(
      "GET",
      "/api/v1/fx-positions"
    );
    const batchingPositionsAfterBalanceRebatch = await request(
      "GET",
      "/api/v1/batching-positions"
    );
    const createFlatFxBatch = await request("POST", "/api/v1/fx-batches", {
      idempotencyKey: "verify-flat-batch",
      tradeIds: [parentPositionOutTradeId, flatBuyTradeId]
    });
    const flatBatchId = Number(createFlatFxBatch.body?.batchId);
    const flatBatchDetails = Number.isInteger(flatBatchId) && flatBatchId > 0
      ? await request("GET", `/api/v1/fx-batches/${flatBatchId}`)
      : { statusCode: 0, body: null };
    const fxPositionsAfterFlatBatch = await request("GET", "/api/v1/fx-positions");
    const rollbackFlatFxBatch = Number.isInteger(flatBatchId) && flatBatchId > 0
      ? await request("POST", `/api/v1/fx-batches/${flatBatchId}/rollback`)
      : { statusCode: 0, body: null };
    const fxPositionsAfterFlatRollback = await request(
      "GET",
      "/api/v1/fx-positions"
    );
    const flatBatchIntegrityDatabase = new DatabaseSync(verificationDatabasePath);
    flatBatchIntegrityDatabase.exec("PRAGMA foreign_keys = ON");
    const flatBatchMembers = flatBatchIntegrityDatabase.prepare(`
      SELECT trade_id AS tradeId, member_role AS memberRole, trade_type AS tradeType
      FROM fx_batch_members
      WHERE batch_id = ?
      ORDER BY trade_id
    `).all(Number.isInteger(flatBatchId) ? flatBatchId : -1);
    const flatBatchOutputs = flatBatchIntegrityDatabase.prepare(`
      SELECT
        member.trade_id AS tradeId,
        'POSITION_OUT' AS outputRole,
        e.trade_type AS tradeType,
        e.base_ccy_side AS side,
        e.base_ccy_amount_minor AS baseCcyAmountMinor,
        e.quote_ccy_amount_minor AS quoteCcyAmountMinor,
        e.trade_rate AS tradeRate
      FROM fx_batch_members member
      INNER JOIN fx_batch_position_output o
        ON o.trade_id = member.trade_id
        AND o.trade_type = member.trade_type
      INNER JOIN fx_trade_exposure e
        ON e.trade_id = o.trade_id AND e.trade_type = o.trade_type
      WHERE member.batch_id = ?
        AND member.member_role = 'POSITION_OUT'
    `).all(Number.isInteger(flatBatchId) ? flatBatchId : -1);
    let flatBatchImmutable = false;

    try {
      flatBatchIntegrityDatabase.prepare(`
        UPDATE fx_batch_members
        SET member_role = member_role
        WHERE batch_id = ?
      `).run(Number.isInteger(flatBatchId) ? flatBatchId : -1);
    } catch {
      flatBatchImmutable = true;
    }

    const flatBatchForeignKeyViolations =
      flatBatchIntegrityDatabase.prepare("PRAGMA foreign_key_check").all().length;
    flatBatchIntegrityDatabase.close();

    const demoResetReferenceBefore = await Promise.all([
      request("GET", "/api/v1/ccy-options"),
      request("GET", "/api/v1/ccy-pair-options"),
      request("GET", "/api/v1/execution-contexts"),
      request("GET", "/api/v1/trading-counterparties"),
      request("GET", "/api/v1/pricing-rules"),
      request("GET", "/api/v1/client-deal-generation/settings"),
      request("GET", "/api/v1/hedge-quick-mode-settings")
    ]);
    const invalidDemoTradeReset = await request(
      "POST",
      "/api/v1/demo/trades/reset",
      { confirmation: "WRONG" }
    );
    const demoTradeReset = await request(
      "POST",
      "/api/v1/demo/trades/reset",
      { confirmation: "RESET_ALL_TRADES" }
    );
    const demoResetReferenceAfter = await Promise.all([
      request("GET", "/api/v1/ccy-options"),
      request("GET", "/api/v1/ccy-pair-options"),
      request("GET", "/api/v1/execution-contexts"),
      request("GET", "/api/v1/trading-counterparties"),
      request("GET", "/api/v1/pricing-rules"),
      request("GET", "/api/v1/client-deal-generation/settings"),
      request("GET", "/api/v1/hedge-quick-mode-settings")
    ]);
    const demoResetTradeReads = await Promise.all([
      request("GET", "/api/v1/client-fx-deals"),
      request("GET", "/api/v1/hedge-fx-deals"),
      request("GET", "/api/v1/fx-positions"),
      request("GET", "/api/v1/fx-batches"),
      request("GET", "/api/v1/batching-positions")
    ]);
    const demoResetProbe = new DatabaseSync(verificationDatabasePath);
    demoResetProbe.exec("PRAGMA foreign_keys = ON");
    const demoResetTradeTableCounts = [
      "fx_trade_exposure",
      "fx_trade_position_management",
      "fx_trade_position_management_transitions",
      "client_fx_deals",
      "fx_hedge_deals",
      "fx_trade_market_snapshot",
      "fx_auto_hedging_admission_decisions",
      "fx_batches",
      "fx_batch_members",
      "fx_batch_balance_trade",
      "fx_batch_position_output",
      "fx_batch_quote_cash_output"
    ].map(tableName => Number(
      demoResetProbe.prepare(`SELECT COUNT(*) AS count FROM ${tableName}`).get().count
    ));
    const demoResetDeleteTriggers = demoResetProbe.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'trigger'
        AND name IN
        (
          'trg_fx_auto_hedging_admission_decisions_immutable_delete',
          'trg_fx_batch_members_immutable_delete',
          'trg_fx_batch_balance_trade_immutable_delete',
          'trg_fx_batch_position_output_immutable_delete',
          'trg_fx_batch_quote_cash_output_immutable_delete',
          'trg_fx_batches_immutable_delete'
        )
      ORDER BY name
    `).all();
    const demoResetBatchSequences = demoResetProbe.prepare(`
      SELECT name, seq
      FROM sqlite_sequence
      WHERE name IN
        (
          'fx_batches',
          'fx_trade_position_management_transitions'
        )
    `).all();
    const demoResetForeignKeyViolations =
      demoResetProbe.prepare("PRAGMA foreign_key_check").all().length;
    demoResetProbe.close();

    return {
      migratedPair: migratedPair.body?.[0] || null,
      eurUsdPricingRulesCount: migratedPair.body?.find(pair => pair.pairCode === "EUR_USD")?.pricingRulesCount,
      blockedPairDelete: {
        status: blockedPairDelete.statusCode,
        code: blockedPairDelete.body?.code,
        message: blockedPairDelete.body?.message
      },
      migratedSettings: migratedSettings.body,
      tables: tables.body?.map(table => table.tableName) || [],
      ccyOptionsConstraintMigrated: ccyOptionsTable.body?.createSql?.includes("chk_ccy_options_latin_text"),
      ccyPairOptionsConstraintMigrated: pairTable.body?.createSql?.includes("chk_ccy_pair_options_format"),
      executionSystemConstraintMigrated: executionSystemsTable.body?.createSql?.includes("length('DEALER_APPROVED')"),
      tradingCounterpartyConstraintsMigrated: tradingCounterpartiesTable.body?.createSql?.includes("length(counterparty_name) BETWEEN 1 AND 200")
        && tradingCounterpartiesTable.body?.createSql?.includes("is_active IN (0, 1)")
        && externalCounterpartiesTable.body?.createSql?.includes("length(counterparty_code) <= 20")
        && externalCounterpartiesTable.body?.createSql?.includes("'INN', 'OTHER'")
        && internalUnitsTable.body?.createSql?.includes("length(unit_code) BETWEEN 2 AND 20")
        && internalUnitsTable.body?.createSql?.includes("'DESK', 'DEPARTMENT', 'OTHER'")
        && tradingCounterpartyRolesTable.body?.createSql?.includes("'CLIENT', 'HEDGE_COUNTERPARTY'"),
      userConstraintsMigrated: usersTable.body?.createSql?.includes("length(user_code) BETWEEN 2 AND 30")
        && usersTable.body?.createSql?.includes("length(trim(first_name)) BETWEEN 1 AND 50")
        && usersTable.body?.createSql?.includes("length(trim(last_name)) BETWEEN 1 AND 50")
        && usersTable.body?.createSql?.includes("'DEALER', 'SUPERVISOR', 'ADMIN'")
        && usersTable.body?.createSql?.includes("is_active IN (0, 1)"),
      uiColorTokens: {
        count: uiColorTokensTable.body?.rowCount ?? -1,
        columns: uiColorTokensTable.body?.columns?.map(column => column.name) || [],
        blue500: uiColorTokensTable.body?.rows?.find(
          row => row.token_code === "blue_500"
        ) || null
      },
      pairColumns: pairTable.body?.columns?.map(column => column.name) || [],
      pairForeignKeys: pairTable.body?.foreignKeys?.length ?? -1,
      simulationSettingsColumns: settingsTable.body?.columns?.map(column => column.name) || [],
      settingsForeignKeys: settingsTable.body?.foreignKeys || [],
      simulationSettingsLifecycle: {
        savedDuration: putSettings.body?.oneWayDurationSeconds,
        savedFluctuation: putSettings.body?.fluctuationSpreads,
        readDuration: getSettings.body?.oneWayDurationSeconds,
        readFluctuation: getSettings.body?.fluctuationSpreads
      },
      servicingLocationColumns: servicingLocationsTable.body?.columns?.map(column => column.name) || [],
      servicingLocations: {
        count: servicingLocations.body?.length ?? -1,
        location002ContextCount: servicingLocations.body?.find(location => location.servicingLocationId === "002")?.executionContextCount
      },
      accountingSystemColumns: accountingSystemsTable.body?.columns?.map(column => column.name) || [],
      accountingSystems: {
        count: accountingSystems.body?.length ?? -1,
        afinaContextCount: accountingSystems.body?.find(system => system.accountingSystemId === "AFINA")?.executionContextCount
      },
      executionSystemColumns: executionSystemsTable.body?.columns?.map(column => column.name) || [],
      executionSystems: {
        count: executionSystems.body?.length ?? -1,
        clickTradeContextCount: executionSystems.body?.find(system => system.executionSystemId === "CLICK_TRADE_EFX")?.executionContextCount
      },
      executionContextColumns: executionContextsTable.body?.columns?.map(column => column.name) || [],
      executionContextIdType: executionContextsTable.body?.columns
        ?.find(column => column.name === "execution_context_id")?.type,
      executionContextForeignKeys: executionContextsTable.body?.foreignKeys || [],
      executionContexts: {
        count: executionContexts.body?.length ?? -1,
        migratedIdsAreIntegers: executionContexts.body?.every(context => Number.isInteger(context.executionContextId)),
        migratedModesUseSafeManualDefault: executionContexts.body?.every(
          context => context.defaultPositionManagementMode === "MANUAL"
        ) === true,
        assignedCounterpartyCounts: (executionContexts.body || []).map(context => ({
          executionContextId: context.executionContextId,
          servicingLocationId: context.servicingLocationId,
          accountingSystemId: context.accountingSystemId,
          executionSystemId: context.executionSystemId,
          assignedCounterpartyCount: context.assignedCounterpartyCount
        })),
        createdId: createExecutionContext.body?.executionContextId,
        createdAccountingSystemId: createExecutionContext.body?.accountingSystemId,
        createdDefaultPositionManagementMode:
          createExecutionContext.body?.defaultPositionManagementMode,
        updatedId: updateExecutionContext.body?.executionContextId,
        updatedDefaultPositionManagementMode:
          updateExecutionContext.body?.defaultPositionManagementMode,
        usageAfterCreate: servicingLocationsAfterContextCreate.body
          ?.find(location => location.servicingLocationId === "SITE-998")?.executionContextCount,
        usageAfterDelete: servicingLocationsAfterContextDelete.body
          ?.find(location => location.servicingLocationId === "SITE-998")?.executionContextCount
      },
      tradingCounterpartyColumns: tradingCounterpartiesTable.body?.columns?.map(column => column.name) || [],
      externalCounterpartyColumns: externalCounterpartiesTable.body?.columns?.map(column => column.name) || [],
      internalUnitColumns: internalUnitsTable.body?.columns?.map(column => column.name) || [],
      tradingCounterpartyRoleColumns: tradingCounterpartyRolesTable.body?.columns?.map(column => column.name) || [],
      userColumns: usersTable.body?.columns?.map(column => column.name) || [],
      counterpartyExecutionContextTable: {
        status: counterpartyExecutionContextsTable.statusCode,
        columns: counterpartyExecutionContextsTable.body?.columns?.map(column => column.name) || [],
        foreignKeys: counterpartyExecutionContextsTable.body?.foreignKeys || [],
        createSql: counterpartyExecutionContextsTable.body?.createSql || "",
        rowCount: counterpartyExecutionContextsTable.body?.rowCount ?? -1
      },
      counterpartyExecutionContextMigration: {
        client1Status: migratedClient1ExecutionContexts.statusCode,
        client1Assignments: migratedClient1ExecutionContexts.body || [],
        client2Status: migratedClient2ExecutionContexts.statusCode,
        client2Assignments: migratedClient2ExecutionContexts.body || [],
        missingCounterpartyStatus: missingCounterpartyExecutionContexts.statusCode,
        missingCounterpartyCode: missingCounterpartyExecutionContexts.body?.code
      },
      counterpartyExecutionContextLifecycle: {
        attachStatus: attachCounterpartyExecutionContexts.statusCode,
        attached: attachCounterpartyExecutionContexts.body || [],
        idempotentAttachStatus: idempotentCounterpartyExecutionContextAttach.statusCode,
        idempotentAttached: idempotentCounterpartyExecutionContextAttach.body || [],
        invalidBodyStatus: invalidCounterpartyExecutionContextAssignments.statusCode,
        invalidBodyCode: invalidCounterpartyExecutionContextAssignments.body?.code,
        atomicFailureStatus: atomicCounterpartyExecutionContextAttach.statusCode,
        atomicFailureCode: atomicCounterpartyExecutionContextAttach.body?.code,
        assignmentsAfterAtomicFailure: counterpartyExecutionContextsAfterAtomicFailure.body || [],
        singleAttachStatus: attachSingleCounterpartyExecutionContext.statusCode,
        singleAttached: attachSingleCounterpartyExecutionContext.body,
        singleDetachStatus: detachSingleCounterpartyExecutionContext.statusCode,
        idempotentDetachStatus: idempotentCounterpartyExecutionContextDetach.statusCode,
        assignmentsAfterDetach: counterpartyExecutionContextsAfterDetach.body || [],
        blockedDetachStatus: blockedCounterpartyExecutionContextDetach.statusCode,
        blockedDetachCode: blockedCounterpartyExecutionContextDetach.body?.code,
        detachAfterRuleDeleteStatus:
          detachCounterpartyExecutionContextAfterPricingRuleDelete.statusCode
      },
      pricingRuleColumns: pricingRulesTable.body?.columns?.map(column => column.name) || [],
      pricingRuleExecutionContextIdType: pricingRulesTable.body?.columns
        ?.find(column => column.name === "execution_context_id")?.type,
      pricingRuleForeignKeys: pricingRulesTable.body?.foreignKeys || [],
      clientDealGenerationProcessSettingsColumns:
        clientDealGenerationProcessSettingsTable.body?.columns
          ?.map(column => column.name) || [],
      clientDealGenerationProcessSettingsRows:
        clientDealGenerationProcessSettingsTable.body?.rows || [],
      clientDealGenerationSettingsColumns: clientDealGenerationSettingsTable.body?.columns
        ?.map(column => column.name) || [],
      clientDealGenerationSettingsForeignKeys: clientDealGenerationSettingsTable.body?.foreignKeys || [],
      clientDealGenerationSettings: {
        count: clientDealGenerationSettingsTable.body?.rowCount ?? -1,
        allClientRules: clientDealGenerationSettingsTable.body?.rows?.every(row =>
          tradingCounterparties.body?.find(counterparty =>
            counterparty.counterpartyId === pricingRules.body?.find(rule =>
              rule.pricingRuleId === row.pricing_rule_id
            )?.counterpartyId
          )?.counterpartyRoles?.includes("CLIENT")
        ) === true,
        allAutoPricedRules: clientDealGenerationSettingsTable.body?.rows?.every(row =>
          pricingRules.body?.find(rule =>
            rule.pricingRuleId === row.pricing_rule_id
          )?.pricingMode === "AUTO_PRICED"
        ) === true
      },
      fxTradeExposureColumns: fxTradeExposureTable.body?.columns?.map(column => column.name) || [],
      fxTradeExposureForeignKeys: fxTradeExposureTable.body?.foreignKeys || [],
      fxTradeExposureCreateSql: fxTradeExposureTable.body?.createSql || "",
      fxTradeExposures: {
        count: fxTradeExposureTable.body?.rowCount ?? -1,
        migratedRow: migratedExposureRow
      },
      fxTradePositionManagementColumns:
        fxTradePositionManagementTable.body?.columns?.map(column => column.name) || [],
      fxTradePositionManagementForeignKeys:
        fxTradePositionManagementTable.body?.foreignKeys || [],
      fxTradePositionManagementCreateSql:
        fxTradePositionManagementTable.body?.createSql || "",
      fxTradePositionManagement: {
        status: fxTradePositionManagementTable.statusCode,
        count: fxTradePositionManagementTable.body?.rowCount ?? -1,
        migratedRow: migratedPositionManagementRow,
        projectedInitialMode: migratedFxPosition?.initialFxPositionMode,
        projectedCurrentMode: migratedFxPosition?.currentFxPositionMode,
        projectedCompatibilityMode: migratedFxPosition?.fxPositionMode
      },
      fxTradePositionManagementTransitionColumns:
        fxTradePositionManagementTransitionsTable.body?.columns
          ?.map(column => column.name) || [],
      fxTradePositionManagementTransitionForeignKeys:
        fxTradePositionManagementTransitionsTable.body?.foreignKeys || [],
      fxTradePositionManagementTransitionCreateSql:
        fxTradePositionManagementTransitionsTable.body?.createSql || "",
      fxTradePositionManagementTransitions: {
        status: fxTradePositionManagementTransitionsTable.statusCode,
        initialCount: fxTradePositionManagementTransitionsTable.body?.rowCount ?? -1,
        sendStatus: sendCreatedClientDealToAuto.statusCode,
        targetMode: sendCreatedClientDealToAuto.body?.targetPositionManagementMode,
        transitionedCount: sendCreatedClientDealToAuto.body?.transitionedCount,
        replayStatus: replayCreatedClientDealToAuto.statusCode,
        replayed: replayCreatedClientDealToAuto.body?.replayed,
        replayedCount: replayCreatedClientDealToAuto.body?.replayedCount,
        projectedInitialMode: transitionedCreatedFxPosition?.initialFxPositionMode,
        projectedCurrentMode: transitionedCreatedFxPosition?.currentFxPositionMode,
        projectedCompatibilityMode: transitionedCreatedFxPosition?.fxPositionMode,
        auditRows: createdTradePositionManagementTransitions
      },
      fxTradeMarketSnapshotColumns: fxTradeMarketSnapshotTable.body?.columns?.map(column => column.name) || [],
      fxTradeMarketSnapshotForeignKeys: fxTradeMarketSnapshotTable.body?.foreignKeys || [],
      fxTradeMarketSnapshots: {
        count: fxTradeMarketSnapshotTable.body?.rowCount ?? -1
      },
      clientFxDealColumns: clientFxDealsTable.body?.columns?.map(column => column.name) || [],
      clientFxDealForeignKeys: clientFxDealsTable.body?.foreignKeys || [],
      hedgeFxDealColumns: hedgeFxDealsTable.body?.columns?.map(column => column.name) || [],
      hedgeFxDealForeignKeys: hedgeFxDealsTable.body?.foreignKeys || [],
      hedgeQuickModeSettingsColumns: hedgeQuickModeSettingsTable.body?.columns
        ?.map(column => column.name) || [],
      hedgeQuickModeSettingsForeignKeys:
        hedgeQuickModeSettingsTable.body?.foreignKeys || [],
      hedgeQuickModeSettingsCreateSql:
        hedgeQuickModeSettingsTable.body?.createSql || "",
      fxTradeBatchColumns: fxTradeBatchesTable.body?.columns
        ?.map(column => column.name) || [],
      fxTradeBatchForeignKeys: fxTradeBatchesTable.body?.foreignKeys || [],
      fxTradeBatchCreateSql: fxTradeBatchesTable.body?.createSql || "",
      fxTradeBatches: {
        status: fxTradeBatchesTable.statusCode,
        count: fxTradeBatchesTable.body?.rowCount ?? -1
      },
      batchBalancingTradeColumns: batchBalancingTradesTable.body?.columns
        ?.map(column => column.name) || [],
      batchBalancingTradeForeignKeys: batchBalancingTradesTable.body?.foreignKeys || [],
      batchMemberCreateSql: batchBalancingTradesTable.body?.createSql || "",
      batchBalancingTrades: {
        status: batchBalancingTradesTable.statusCode,
        count: batchBalancingTradesTable.body?.rowCount ?? -1
      },
      batchBalanceTradeColumns: batchBalanceTradeTable.body?.columns || [],
      batchBalanceTradeForeignKeys: batchBalanceTradeTable.body?.foreignKeys || [],
      batchBalanceTradeCreateSql: batchBalanceTradeTable.body?.createSql || "",
      batchBalanceTrades: {
        status: batchBalanceTradeTable.statusCode,
        count: batchBalanceTradeTable.body?.rowCount ?? -1
      },
      batchPositionOutputColumns: batchPositionOutputTable.body?.columns || [],
      batchPositionOutputForeignKeys:
        batchPositionOutputTable.body?.foreignKeys || [],
      batchPositionOutputCreateSql:
        batchPositionOutputTable.body?.createSql || "",
      batchPositionOutputs: {
        status: batchPositionOutputTable.statusCode,
        count: batchPositionOutputTable.body?.rowCount ?? -1
      },
      batchQuoteCashMemberColumns: batchQuoteCashMembersTable.body?.columns
        ?.map(column => column.name) || [],
      batchQuoteCashMemberForeignKeys:
        batchQuoteCashMembersTable.body?.foreignKeys || [],
      batchQuoteCashMemberCreateSql:
        batchQuoteCashMembersTable.body?.createSql || "",
      batchQuoteCashMembers: {
        status: batchQuoteCashMembersTable.statusCode,
        count: batchQuoteCashMembersTable.body?.rowCount ?? -1
      },
      batchBalancingFlow: {
        rejectedSplitModeStatus: rejectedSplitBatchMode.statusCode,
        rejectedSplitModeCode: rejectedSplitBatchMode.body?.code,
        createStatus: createFxBatch.statusCode,
        createErrorCode: createFxBatch.body?.code,
        createErrorMessage: createFxBatch.body?.message,
        batchId: createFxBatch.body?.batchId,
        batchPairId: createFxBatch.body?.batchPairId,
        sourceTradeIds: createFxBatch.body?.sourceTradeIds || [],
        sourceNetSide: createFxBatch.body?.sourceNetSide,
        sourceNetBaseCcyAmount: createFxBatch.body?.sourceNetBaseCcyAmount,
        sourceNetBaseCcyAmountMinor:
          createFxBatch.body?.sourceNetBaseCcyAmountMinor,
        sourceNetBaseCcyFractionDigits:
          createFxBatch.body?.sourceNetBaseCcyFractionDigits,
        sourceNetTransferQuoteAmountMinor:
          createFxBatch.body?.sourceNetTransferQuoteAmountMinor,
        sourceNetTransferQuoteFractionDigits:
          createFxBatch.body?.sourceNetTransferQuoteFractionDigits,
        netQuoteCcyAmountMinorBeforeCash:
          createFxBatch.body?.netQuoteCcyAmountMinorBeforeCash,
        quoteCashOut: createFxBatch.body?.quoteCashOut || null,
        roundingResidualQuoteAmountMinor:
          createFxBatch.body?.roundingResidualQuoteAmountMinor,
        historyStatus: fxBatchHistoryAfterCreate.statusCode,
        historyCount: fxBatchHistoryAfterCreate.body?.length ?? -1,
        historyFields: Object.keys(fxBatchHistoryAfterCreate.body?.[0] || {}).sort(),
        historyHidesIdempotencyKey: fxBatchHistoryAfterCreate.body?.every(batch =>
          !Object.hasOwn(batch, "idempotencyKey")
        ) === true,
        formationAuditStatus: batchFormationAuditAfterCreate.statusCode,
        formationAuditCount: batchFormationAuditAfterCreate.body?.length ?? -1,
        formationAuditRecord: batchFormationAuditCreatedRecord || null,
        formationAuditAfterRollbackStatus:
          batchFormationAuditAfterRollback.statusCode,
        formationAuditRolledBackRecord:
          batchFormationAuditRolledBackRecord || null,
        createdTypes: createFxBatch.body?.trades?.map(trade => trade.tradeType) || [],
        createdSides: createFxBatch.body?.trades?.map(trade => trade.side) || [],
        createdAmounts: createFxBatch.body?.trades?.map(trade => trade.baseCcyAmount) || [],
        createdDealtCcyCodes:
          createFxBatch.body?.trades?.map(trade => trade.dealtCcyCode) || [],
        createdBaseAmountMinors:
          createFxBatch.body?.trades?.map(trade => trade.baseCcyAmountMinor) || [],
        createdBaseFractionDigits:
          createFxBatch.body?.trades?.map(trade => trade.baseCcyFractionDigits) || [],
        createdQuoteAmountMinors:
          createFxBatch.body?.trades?.map(trade => trade.quoteCcyAmountMinor) || [],
        createdQuoteFractionDigits:
          createFxBatch.body?.trades?.map(trade => trade.quoteCcyFractionDigits) || [],
        storedCount: batchBalancingTradesAfterCreate.body?.trades?.length ?? -1,
        detailStatus: batchBalancingTradesAfterCreate.statusCode,
        detailCurrencyPair: batchBalancingTradesAfterCreate.body?.currencyPair,
        detailBatchingKey:
          batchBalancingTradesAfterCreate.body?.batchingKey || null,
        detailMemberCount: batchBalancingTradesAfterCreate.body?.memberCount ?? -1,
        detailOutputCount: batchBalancingTradesAfterCreate.body?.outputCount ?? -1,
        detailMemberRoles:
          batchBalancingTradesAfterCreate.body?.members
            ?.map(member => member.memberRole) || [],
        detailCashOutput:
          batchBalancingTradesAfterCreate.body?.cashOutput || null,
        detailOutputRoles:
          batchBalancingTradesAfterCreate.body?.outputs
            ?.map(output => output.outputRole) || [],
        detailPnlFieldsPresent:
          [
            ...(batchBalancingTradesAfterCreate.body?.members || []),
            ...(batchBalancingTradesAfterCreate.body?.outputs || [])
          ].every(trade =>
            Object.hasOwn(trade, "analyticalPnlQuoteMinor")
            && Object.hasOwn(trade, "analyticalPnlQuoteFractionDigits")
            && Object.hasOwn(trade, "analyticalPnl")
          ),
        detailContainsAttributedSource:
          batchBalancingTradesAfterCreate.body?.members?.some(member =>
            member.tradeId === 41
            && member.tradeType === "CLIENT_DEAL"
            && member.counterpartyName === "Romashka Company"
            && member.transferRate === 1.123
            && member.createdByBatchId === null
          ) === true,
        detailTechnicalTradeSemantics:
          [
            ...(batchBalancingTradesAfterCreate.body?.members || []),
            ...(batchBalancingTradesAfterCreate.body?.outputs || [])
          ].filter(trade =>
            ["BATCH_BALANCE_TRADE", "BATCH_POSITION_OUT"].includes(trade.tradeType)
          ).every(trade =>
            trade.createdByBatchId === createFxBatch.body?.batchId
            && trade.transferRate === trade.tradeRate
            && trade.analyticalPnlQuoteMinor === 0
            && trade.analyticalPnlQuoteFractionDigits
              === trade.quoteCcyFractionDigits
            && trade.analyticalPnl === 0
          ),
        detailBalanceContributionSemantics:
          batchBalancingTradesAfterCreate.body?.members?.some(trade =>
            trade.tradeId === 41
            && trade.baseCcyCode === "EUR"
            && trade.quoteCcyCode === "USD"
            && trade.baseBalanceContributionMinor === 150000000
            && trade.quoteBalanceContributionMinor === -168450000
          ) === true
          && batchBalancingTradesAfterCreate.body?.members?.some(trade =>
            trade.tradeType === "BATCH_BALANCE_TRADE"
            && trade.baseBalanceContributionMinor === -150000000
            && trade.quoteBalanceContributionMinor === 168450000
          ) === true
          && batchBalancingTradesAfterCreate.body?.cashOutput?.outputType
            === "BATCH_QUOTE_CASH_OUT"
          && batchBalancingTradesAfterCreate.body?.cashOutput
            ?.balanceContributionMinor === 0
          && batchBalancingTradesAfterCreate.body?.outputs?.some(trade =>
            trade.tradeType === "BATCH_POSITION_OUT"
            && trade.baseBalanceContributionMinor === 150000000
            && trade.quoteBalanceContributionMinor === -168450000
          ) === true,
        detailMemberBaseBalanceMinor:
          (batchBalancingTradesAfterCreate.body?.members || [])
            .reduce(
              (total, trade) => total + trade.baseBalanceContributionMinor,
              0
            ),
        detailMemberQuoteBalanceMinor:
          (batchBalancingTradesAfterCreate.body?.members || [])
            .reduce(
              (total, trade) => total + trade.quoteBalanceContributionMinor,
              0
            ),
        missingDetailStatus: missingFxBatchDetails.statusCode,
        missingDetailCode: missingFxBatchDetails.body?.code,
        duplicateSelectionStatus: duplicateBatchSelection.statusCode,
        missingSourceStatus: missingBatchSourceTrade.statusCode,
        replayStatus: replayFxBatch.statusCode,
        replayed: replayFxBatch.body?.replayed === true,
        replayBatchId: replayFxBatch.body?.batchId,
        idempotencyConflictStatus: idempotencyConflict.statusCode,
        storedCountAfterReplay: batchBalancingTradesAfterReplay.body?.trades?.length ?? -1,
        sourceVisibleBeforeBatch: fxPositionsBeforeBatch.body?.some(
          trade => trade.tradeId === 41
        ) === true,
        sourceHiddenAfterBatch: fxPositionsAfterBatch.body?.every(
          trade => trade.tradeId !== 41
        ) === true,
        balanceHiddenAfterBatch:
          createFxBatch.body?.trades
            ?.filter(trade => trade.tradeType === "BATCH_BALANCE_TRADE")
            .every(balanceTrade =>
              fxPositionsAfterBatch.body?.every(trade =>
                trade.tradeId !== balanceTrade.tradeId
              )
            ) === true,
        outputVisibleAfterBatch: fxPositionsAfterBatch.body?.some(
          trade => trade.tradeType === "BATCH_POSITION_OUT"
            && trade.batchId === createFxBatch.body?.batchId
        ) === true,
        rollbackStatus: rollbackFxBatch.statusCode,
        rolledBackBatchStatus: rollbackFxBatch.body?.batchStatus,
        rolledBackAtRecorded: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
          .test(String(rollbackFxBatch.body?.rolledBackAt || "")),
        historyShowsRolledBack: fxBatchHistoryAfterRollback.body?.some(batch =>
          batch.batchId === createFxBatch.body?.batchId
          && batch.batchStatus === "ROLLED_BACK"
        ) === true,
        sourceVisibleAfterRollback: fxPositionsAfterRollback.body?.some(
          trade => trade.tradeId === 41
            && trade.tradeType === "CLIENT_DEAL"
            && Number(trade.historicalBatchMember) === 1
        ) === true,
        balanceVisibleAfterRollback: fxPositionsAfterRollback.body?.some(
          trade => trade.tradeType === "BATCH_BALANCE_TRADE"
            && trade.batchId === createFxBatch.body?.batchId
        ) === true,
        originalTechnicalTradesPreservedAfterRollback:
          createFxBatch.body?.trades?.every(createdTrade =>
            fxPositionsAfterRollback.body?.some(trade =>
              trade.tradeId === createdTrade.tradeId
              && trade.tradeType === createdTrade.tradeType
            )
          ) === true,
        positionPreservedByRollback:
          signedBasePosition(fxPositionsBeforeBatch.body)
          === signedBasePosition(fxPositionsAfterRollback.body),
        rollbackReplayStatus: replayRollbackFxBatch.statusCode,
        rollbackReplayed: replayRollbackFxBatch.body?.replayed === true,
        rolledBackTradeImmutable,
        reformedStatus: reformedFxBatch.statusCode,
        reformedBatchId: reformedFxBatch.body?.batchId,
        sourceHiddenAfterReformedBatch: fxPositionsAfterReformedBatch.body?.every(
          trade => trade.tradeId !== 41
        ) === true,
        reformedBatchRemainsFormed:
          fxBatchHistoryAfterReformedBatch.body?.some(batch =>
            batch.batchId === reformedFxBatch.body?.batchId
            && batch.batchStatus === "FORMED"
          ) === true,
        balanceTradeHiddenAfterReformedBatch:
          reformedFxBatch.body?.trades
            ?.filter(trade => trade.tradeType === "BATCH_BALANCE_TRADE")
            .every(balanceTrade =>
              fxPositionsAfterReformedBatch.body?.every(trade =>
                trade.tradeId !== balanceTrade.tradeId
              )
            ) === true,
        positionOutVisibleAfterReformedBatch:
          reformedFxBatch.body?.trades
            ?.filter(trade => trade.tradeType === "BATCH_POSITION_OUT")
            .every(positionOut =>
              fxPositionsAfterReformedBatch.body?.some(trade =>
                trade.tradeId === positionOut.tradeId
              )
            ) === true,
        positionPreservedAfterReformedBatch:
          signedBasePosition(fxPositionsBeforeBatch.body)
          === signedBasePosition(fxPositionsAfterReformedBatch.body),
        technicalTradeAuditRowsRetained:
          reformedFxBatch.body?.trades?.every(createdTrade =>
            fxTradeExposureAfterReformedBatch.body?.rows?.some(row =>
              row.trade_id === createdTrade.tradeId
              && row.trade_type === createdTrade.tradeType
            )
          ) === true
          && reformedFxBatch.body?.trades?.every(createdTrade =>
            fxBatchMembersAfterReformedBatch.body?.rows?.some(row =>
              row.batch_id === reformedFxBatch.body?.batchId
              && row.trade_id === createdTrade.tradeId
              && row.trade_type === createdTrade.tradeType
              && row.member_role === (
                createdTrade.tradeType === "BATCH_BALANCE_TRADE"
                  ? "BALANCE_TRADE"
                  : "POSITION_OUT"
              )
            )
          ) === true
          && fxBatchBalanceTradesAfterReformedBatch.body?.rows?.some(row =>
            row.trade_id === reformedFxBatch.body?.trades?.find(
              trade => trade.tradeType === "BATCH_BALANCE_TRADE"
            )?.tradeId
            && row.trade_type === "BATCH_BALANCE_TRADE"
          ) === true
          && fxBatchOutputsAfterReformedBatch.body?.rows?.some(row =>
            row.trade_id === reformedFxBatch.body?.trades?.find(
              trade => trade.tradeType === "BATCH_POSITION_OUT"
            )?.tradeId
            && row.trade_type === "BATCH_POSITION_OUT"
          ) === true
      },
      flatBatchFlow: {
        parentCreateStatus: createParentPositionOutBatch.statusCode,
        parentCreateCode: createParentPositionOutBatch.body?.code,
        parentCreateMessage: createParentPositionOutBatch.body?.message,
        parentBatchId: createParentPositionOutBatch.body?.batchId,
        parentPositionOutTradeId,
        parentPositionOutVisible:
          fxPositionsAfterParentPositionOut.body?.some(trade =>
            trade.tradeId === parentPositionOutTradeId
            && trade.tradeType === "BATCH_POSITION_OUT"
          ) === true,
        createStatus: createFlatFxBatch.statusCode,
        createCode: createFlatFxBatch.body?.code,
        createMessage: createFlatFxBatch.body?.message,
        batchStatus: createFlatFxBatch.body?.batchStatus,
        sourceTradeIds: createFlatFxBatch.body?.sourceTradeIds || [],
        sourceNetSide: createFlatFxBatch.body?.sourceNetSide,
        sourceNetBaseCcyAmountMinor:
          createFlatFxBatch.body?.sourceNetBaseCcyAmountMinor,
        sourceNetTransferQuoteAmountMinor:
          createFlatFxBatch.body?.sourceNetTransferQuoteAmountMinor,
        netQuoteCcyAmountMinorBeforeCash:
          createFlatFxBatch.body?.netQuoteCcyAmountMinorBeforeCash,
        quoteCashOut: createFlatFxBatch.body?.quoteCashOut || null,
        createdTrades: createFlatFxBatch.body?.trades || [],
        members: flatBatchMembers,
        outputs: flatBatchOutputs,
        detailStatus: flatBatchDetails.statusCode,
        detailMembers: flatBatchDetails.body?.members || [],
        detailOutputs: flatBatchDetails.body?.outputs || [],
        detailMemberBaseBalanceMinor:
          (flatBatchDetails.body?.members || []).reduce(
            (total, member) => total + member.baseBalanceContributionMinor,
            0
          ),
        detailMemberQuoteBalanceMinor:
          (flatBatchDetails.body?.members || []).reduce(
            (total, member) => total + member.quoteBalanceContributionMinor,
            0
          ),
        detailCashOutput: flatBatchDetails.body?.cashOutput || null,
        detailPositionOutPreservesOrigin:
          flatBatchDetails.body?.members?.some(member =>
            member.tradeId === parentPositionOutTradeId
            && member.tradeType === "BATCH_POSITION_OUT"
            && member.memberRole === "TRADE"
            && member.createdByBatchId === createParentPositionOutBatch.body?.batchId
            && member.transferRate === member.tradeRate
          ) === true,
        sourcesVisibleBefore: [flatSellTradeId, flatBuyTradeId].every(tradeId =>
          fxPositionsBeforeFlatBatch.body?.some(trade => trade.tradeId === tradeId)
        ),
        sourcesHiddenAfter: [parentPositionOutTradeId, flatBuyTradeId].every(tradeId =>
          fxPositionsAfterFlatBatch.body?.every(trade => trade.tradeId !== tradeId)
        ),
        rollbackStatus: rollbackFlatFxBatch.statusCode,
        rolledBackBatchStatus: rollbackFlatFxBatch.body?.batchStatus,
        sourcesVisibleAfterRollback:
          [parentPositionOutTradeId, flatBuyTradeId].every(tradeId =>
            fxPositionsAfterFlatRollback.body?.some(trade => trade.tradeId === tradeId)
          ),
        immutable: flatBatchImmutable,
        foreignKeyViolations: flatBatchForeignKeyViolations
      },
      demoTradeReset: {
        invalidStatus: invalidDemoTradeReset.statusCode,
        invalidCode: invalidDemoTradeReset.body?.code,
        status: demoTradeReset.statusCode,
        removedTrades: demoTradeReset.body?.removed?.trades,
        removedPositionManagementStates:
          demoTradeReset.body?.removed?.positionManagementStates,
        removedPositionManagementTransitions:
          demoTradeReset.body?.removed?.positionManagementTransitions,
        removedBatches: demoTradeReset.body?.removed?.batches,
        generationProcess: demoTradeReset.body?.generationProcess,
        tradeReadsEmpty: demoResetTradeReads.every(result =>
          Array.isArray(result.body) && result.body.length === 0
        ),
        tradeTablesEmpty: demoResetTradeTableCounts.every(count => count === 0),
        referenceDataPreserved:
          JSON.stringify(demoResetReferenceBefore.map(result => result.body))
          === JSON.stringify(demoResetReferenceAfter.map(result => result.body)),
        deleteTriggersRestored: demoResetDeleteTriggers.length === 6,
        tradeSequencesCleared: demoResetBatchSequences.length === 0,
        foreignKeyViolations: demoResetForeignKeyViolations
      },
      balanceTradeSourceFlow: {
        parentBalanceTradeId,
        hiddenWhileParentFormed:
          fxPositionsAfterParentPositionOut.body?.every(trade =>
            trade.tradeId !== parentBalanceTradeId
          ) === true,
        unavailableWhileParentFormed:
          batchingPositionsWhileParentFormed.body?.some(trade =>
            trade.tradeId === parentBalanceTradeId
            && trade.tradeType === "BATCH_BALANCE_TRADE"
            && trade.availableForBatching === 0
            && trade.transferRate === trade.tradeRate
          ) === true,
        activeRebatchStatus: rejectBalanceSourceWhileParentFormed.statusCode,
        activeRebatchCode: rejectBalanceSourceWhileParentFormed.body?.code,
        activeMembershipConstraintEnforced,
        parentRollbackStatus: rollbackParentFxBatch.statusCode,
        visibleAfterParentRollback:
          fxPositionsAfterParentRollback.body?.some(trade =>
            trade.tradeId === parentBalanceTradeId
            && trade.tradeType === "BATCH_BALANCE_TRADE"
            && trade.transferRate === trade.tradeRate
          ) === true,
        availableAfterParentRollback:
          batchingPositionsAfterParentRollback.body?.some(trade =>
            trade.tradeId === parentBalanceTradeId
            && trade.tradeType === "BATCH_BALANCE_TRADE"
            && trade.availableForBatching === 1
            && trade.transferRate === trade.tradeRate
          ) === true,
        createStatus: createBalanceSourceBatch.statusCode,
        sourceTradeIds: createBalanceSourceBatch.body?.sourceTradeIds || [],
        reusedAsOrdinaryTrade:
          balanceSourceBatchDetails.body?.members?.some(member =>
            member.tradeId === parentBalanceTradeId
            && member.tradeType === "BATCH_BALANCE_TRADE"
            && member.memberRole === "TRADE"
            && member.createdByBatchId
              === createParentPositionOutBatch.body?.batchId
          ) === true,
        hiddenAfterBatching:
          fxPositionsAfterBalanceRebatch.body?.every(trade =>
            trade.tradeId !== parentBalanceTradeId
          ) === true,
        listedAsConsumed:
          batchingPositionsAfterBalanceRebatch.body?.some(trade =>
            trade.tradeId === parentBalanceTradeId
            && trade.availableForBatching === 0
            && trade.consumedByBatchId === createBalanceSourceBatch.body?.batchId
            && trade.consumedByBatchStatus === "FORMED"
          ) === true
      },
      hedgeFxDeals: {
        status: hedgeFxDeals.statusCode,
        count: hedgeFxDeals.body?.length ?? -1,
        executionContextAssignmentStatus:
          attachHedgeCounterpartyExecutionContexts.statusCode,
        eligiblePricingRulesStatus: hedgeDealPricingRules.statusCode,
        eligiblePricingRulesCount: hedgeDealPricingRules.body?.length ?? -1,
        allHedgeCounterpartyRules: hedgeDealPricingRules.body?.every(rule =>
          rule.counterpartyType === "HEDGE_COUNTERPARTY"
          && rule.pricingMode === "DEALER_PRICED"
        ) === true,
        excludesDealerApprovedRules: hedgeDealPricingRules.body?.every(rule =>
          rule.pricingMode !== "DEALER_APPROVED"
        ) === true,
        autoPriced: {
          pricingRuleCreateStatus: createAutoPricedHedgePricingRule.statusCode,
          pricingRuleId: createAutoPricedHedgePricingRule.body?.pricingRuleId,
          eligiblePricingRulesStatus: autoPricedHedgeDealPricingRules.statusCode,
          eligiblePricingRulesCount:
            autoPricedHedgeDealPricingRules.body?.length ?? -1,
          allEligibleRulesAreAutoPricedHedgeRules:
            autoPricedHedgeDealPricingRules.body?.every(rule =>
              rule.counterpartyType === "HEDGE_COUNTERPARTY"
              && rule.pricingMode === "AUTO_PRICED"
            ) === true,
          includesCreatedPricingRule:
            autoPricedHedgeDealPricingRules.body?.some(rule =>
              rule.pricingRuleId
                === createAutoPricedHedgePricingRule.body?.pricingRuleId
            ) === true,
          invalidPricingModeStatus: invalidHedgeDealPricingMode.statusCode,
          invalidPricingModeCode: invalidHedgeDealPricingMode.body?.code,
          manualEndpointAutoRuleStatus:
            invalidManualHedgeFxDealAutoPricedRule.statusCode,
          manualEndpointAutoRuleCode:
            invalidManualHedgeFxDealAutoPricedRule.body?.code,
          manualEndpointAutoRuleMessage:
            invalidManualHedgeFxDealAutoPricedRule.body?.message,
          autoEndpointDealerRuleStatus:
            invalidAutoPricedHedgeFxDealDealerRule.statusCode,
          autoEndpointDealerRuleCode:
            invalidAutoPricedHedgeFxDealDealerRule.body?.code,
          autoEndpointDealerRuleMessage:
            invalidAutoPricedHedgeFxDealDealerRule.body?.message,
          suppliedTradeRateStatus:
            invalidAutoPricedHedgeFxDealSuppliedRate.statusCode,
          suppliedTradeRateCode:
            invalidAutoPricedHedgeFxDealSuppliedRate.body?.code,
          suppliedTradeRateMessage:
            invalidAutoPricedHedgeFxDealSuppliedRate.body?.message,
          bankSell: {
            status: createAutoPricedBankSellHedgeFxDeal.statusCode,
            tradeId: createAutoPricedBankSellHedgeFxDeal.body?.tradeId,
            counterpartySide: createAutoPricedBankSellHedgeFxDeal.body?.side,
            tradeRate: createAutoPricedBankSellHedgeFxDeal.body?.tradeRate,
            marketBid: createAutoPricedBankSellHedgeFxDeal.body?.marketPulseBid,
            marketOffer:
              createAutoPricedBankSellHedgeFxDeal.body?.marketPulseOffer,
            usesBid:
              createAutoPricedBankSellHedgeFxDeal.body?.tradeRate
                === createAutoPricedBankSellHedgeFxDeal.body?.marketPulseBid,
            persistedFromSameSnapshot:
              autoPricedBankSellExposureRow?.base_ccy_side === "BUY"
              && autoPricedBankSellExposureRow?.trade_rate
                === createAutoPricedBankSellHedgeFxDeal.body?.tradeRate
              && autoPricedBankSellDealRow?.pricing_rule_id
                === createAutoPricedHedgePricingRule.body?.pricingRuleId
              && autoPricedBankSellDealRow?.transfer_rate
                === createAutoPricedBankSellHedgeFxDeal.body?.transferRate
              && autoPricedBankSellSnapshotRow?.market_pulse_bid
                === createAutoPricedBankSellHedgeFxDeal.body?.marketPulseBid
              && autoPricedBankSellSnapshotRow?.market_pulse_offer
                === createAutoPricedBankSellHedgeFxDeal.body?.marketPulseOffer
              && autoPricedBankSellSnapshotRow?.market_pulse_timestamp
                === createAutoPricedBankSellHedgeFxDeal.body
                  ?.marketPulseTimestamp
          },
          bankBuy: {
            status: createAutoPricedBankBuyHedgeFxDeal.statusCode,
            tradeId: createAutoPricedBankBuyHedgeFxDeal.body?.tradeId,
            counterpartySide: createAutoPricedBankBuyHedgeFxDeal.body?.side,
            tradeRate: createAutoPricedBankBuyHedgeFxDeal.body?.tradeRate,
            marketBid: createAutoPricedBankBuyHedgeFxDeal.body?.marketPulseBid,
            marketOffer:
              createAutoPricedBankBuyHedgeFxDeal.body?.marketPulseOffer,
            usesOffer:
              createAutoPricedBankBuyHedgeFxDeal.body?.tradeRate
                === createAutoPricedBankBuyHedgeFxDeal.body
                  ?.marketPulseOffer,
            persistedFromSameSnapshot:
              autoPricedBankBuyExposureRow?.base_ccy_side === "SELL"
              && autoPricedBankBuyExposureRow?.trade_rate
                === createAutoPricedBankBuyHedgeFxDeal.body?.tradeRate
              && autoPricedBankBuyDealRow?.pricing_rule_id
                === createAutoPricedHedgePricingRule.body?.pricingRuleId
              && autoPricedBankBuyDealRow?.transfer_rate
                === createAutoPricedBankBuyHedgeFxDeal.body?.transferRate
              && autoPricedBankBuySnapshotRow?.market_pulse_bid
                === createAutoPricedBankBuyHedgeFxDeal.body?.marketPulseBid
              && autoPricedBankBuySnapshotRow?.market_pulse_offer
                === createAutoPricedBankBuyHedgeFxDeal.body?.marketPulseOffer
              && autoPricedBankBuySnapshotRow?.market_pulse_timestamp
                === createAutoPricedBankBuyHedgeFxDeal.body
                  ?.marketPulseTimestamp
          }
        },
        quickMode: {
          settingsBeforeCount:
            hedgeQuickModeSettingsBefore.body?.length ?? -1,
          createSettingsStatus: createHedgeQuickModeSettings.statusCode,
          getSettingsStatus: getHedgeQuickModeSettings.statusCode,
          configuredPricingRuleId:
            getHedgeQuickModeSettings.body?.pricingRuleId,
          configuredDefaultTenor:
            getHedgeQuickModeSettings.body?.defaultTenor,
          configuredPresetCodes:
            getHedgeQuickModeSettings.body?.presets
              ?.map(preset => preset.presetCode) || [],
          configuredPresetAmounts:
            getHedgeQuickModeSettings.body?.presets
              ?.map(preset => preset.baseCcyAmount) || [],
          invalidSettingsStatus: invalidHedgeQuickModeSettings.statusCode,
          invalidSettingsCode: invalidHedgeQuickModeSettings.body?.code,
          ownedFieldStatus: invalidHedgeQuickModeOwnedField.statusCode,
          ownedFieldCode: invalidHedgeQuickModeOwnedField.body?.code,
          extraFieldStatus: invalidHedgeQuickModeExtraField.statusCode,
          extraFieldCode: invalidHedgeQuickModeExtraField.body?.code,
          invalidPresetStatus: invalidHedgeQuickModePreset.statusCode,
          invalidPresetCode: invalidHedgeQuickModePreset.body?.code,
          bankSell: {
            status: createQuickModeBankSellHedgeFxDeal.statusCode,
            tradeId: createQuickModeBankSellHedgeFxDeal.body?.tradeId,
            counterpartySide: createQuickModeBankSellHedgeFxDeal.body?.side,
            baseCcyAmountMinor:
              createQuickModeBankSellHedgeFxDeal.body?.baseCcyAmountMinor,
            tradeRate: createQuickModeBankSellHedgeFxDeal.body?.tradeRate,
            marketBid: createQuickModeBankSellHedgeFxDeal.body?.marketPulseBid,
            marketOffer:
              createQuickModeBankSellHedgeFxDeal.body?.marketPulseOffer,
            usesBid:
              createQuickModeBankSellHedgeFxDeal.body?.tradeRate
                === createQuickModeBankSellHedgeFxDeal.body?.marketPulseBid,
            persistedFromSameSnapshot:
              quickModeBankSellExposureRow?.base_ccy_side === "BUY"
              && quickModeBankSellExposureRow?.base_ccy_amount_minor
                === 2000000000
              && quickModeBankSellDealRow?.pricing_rule_id
                === createAutoPricedHedgePricingRule.body?.pricingRuleId
              && quickModeBankSellSnapshotRow?.market_pulse_bid
                === createQuickModeBankSellHedgeFxDeal.body?.marketPulseBid
              && quickModeBankSellSnapshotRow?.market_pulse_offer
                === createQuickModeBankSellHedgeFxDeal.body?.marketPulseOffer
              && quickModeBankSellSnapshotRow?.market_pulse_timestamp
                === createQuickModeBankSellHedgeFxDeal.body
                  ?.marketPulseTimestamp
          },
          bankBuy: {
            status: createQuickModeBankBuyHedgeFxDeal.statusCode,
            tradeId: createQuickModeBankBuyHedgeFxDeal.body?.tradeId,
            counterpartySide: createQuickModeBankBuyHedgeFxDeal.body?.side,
            baseCcyAmountMinor:
              createQuickModeBankBuyHedgeFxDeal.body?.baseCcyAmountMinor,
            tradeRate: createQuickModeBankBuyHedgeFxDeal.body?.tradeRate,
            marketBid: createQuickModeBankBuyHedgeFxDeal.body?.marketPulseBid,
            marketOffer:
              createQuickModeBankBuyHedgeFxDeal.body?.marketPulseOffer,
            usesOffer:
              createQuickModeBankBuyHedgeFxDeal.body?.tradeRate
                === createQuickModeBankBuyHedgeFxDeal.body?.marketPulseOffer,
            persistedFromSameSnapshot:
              quickModeBankBuyExposureRow?.base_ccy_side === "SELL"
              && quickModeBankBuyExposureRow?.base_ccy_amount_minor
                === 5000000000
              && quickModeBankBuyDealRow?.pricing_rule_id
                === createAutoPricedHedgePricingRule.body?.pricingRuleId
              && quickModeBankBuySnapshotRow?.market_pulse_bid
                === createQuickModeBankBuyHedgeFxDeal.body?.marketPulseBid
              && quickModeBankBuySnapshotRow?.market_pulse_offer
                === createQuickModeBankBuyHedgeFxDeal.body?.marketPulseOffer
              && quickModeBankBuySnapshotRow?.market_pulse_timestamp
                === createQuickModeBankBuyHedgeFxDeal.body
                  ?.marketPulseTimestamp
          },
          disableSettingsStatus: disableHedgeQuickModeSettings.statusCode,
          disabledDealStatus: rejectDisabledHedgeQuickMode.statusCode,
          disabledDealCode: rejectDisabledHedgeQuickMode.body?.code,
          deleteSettingsStatus: deleteHedgeQuickModeSettings.statusCode,
          missingSettingsStatus: missingHedgeQuickModeSettings.statusCode,
          restoreSettingsStatus: restoreHedgeQuickModeSettings.statusCode,
          restoredSettingsCount:
            hedgeQuickModeSettingsAfterRestore.body?.length ?? -1,
          restoredAvailable:
            hedgeQuickModeSettingsAfterRestore.body?.[0]?.available
        },
        rejectedDealerApprovedRuleStatus: invalidHedgeFxDealDealerApprovedRule.statusCode,
        dealerApprovedRuleDeleteStatus: deleteDealerApprovedHedgePricingRule.statusCode,
        createdStatus: createHedgeFxDeal.statusCode,
        createdTradeId: createHedgeFxDeal.body?.tradeId,
        createdRequestTimestamp: createHedgeFxDeal.body?.requestTimestamp,
        createdExecutionTimestamp: createHedgeFxDeal.body?.executionTimestamp,
        createdReceivedTimestamp: createHedgeFxDeal.body?.receivedTimestamp,
        createdSide: createHedgeFxDeal.body?.side,
        createdCounterpartyId: createHedgeFxDeal.body?.counterpartyId,
        expectedCounterpartyId: createHedgeCounterparty.body?.counterpartyId,
        createdPricingRuleId: createHedgeFxDeal.body?.pricingRuleId,
        expectedPricingRuleId: createHedgePricingRule.body?.pricingRuleId,
        createdTransferRate: createHedgeFxDeal.body?.transferRate,
        createdAnalyticalPnl: createHedgeFxDeal.body?.analyticalPnl,
        createdAnalyticalPnlQuoteMinor: createHedgeFxDeal.body?.analyticalPnlQuoteMinor,
        createdAnalyticalPnlQuoteFractionDigits:
          createHedgeFxDeal.body?.analyticalPnlQuoteFractionDigits,
        createdDealtCcyCode: createHedgeFxDeal.body?.dealtCcyCode,
        createdBaseCcyAmountMinor: createHedgeFxDeal.body?.baseCcyAmountMinor,
        createdBaseCcyFractionDigits: createHedgeFxDeal.body?.baseCcyFractionDigits,
        createdQuoteCcyAmountMinor: createHedgeFxDeal.body?.quoteCcyAmountMinor,
        createdQuoteCcyFractionDigits: createHedgeFxDeal.body?.quoteCcyFractionDigits,
        createdMarketPulseStreamStatus: createHedgeFxDeal.body?.marketPulseStreamStatus,
        subMinorAmountStatus: invalidHedgeFxDealSubMinorAmount.statusCode,
        subMinorAmountCode: invalidHedgeFxDealSubMinorAmount.body?.code,
        invalidClientRuleStatus: invalidHedgeFxDealClientRule.statusCode,
        countAfterCreate: hedgeFxDealsAfterCreate.body?.length ?? -1,
        deleteStatus: rejectHedgeFxDealDelete.statusCode,
        deleteCode: rejectHedgeFxDealDelete.body?.code,
        countAfterRejectedDelete: hedgeFxDealsAfterRejectedDelete.body?.length ?? -1,
        preservedAfterRejectedDelete:
          fxTradeExposureAfterRejectedHedgeDelete.body?.rows?.some(row =>
            row.trade_id === createdHedgeTradeId && row.trade_type === "HEDGE_DEAL"
          )
          && fxHedgeDealsAfterRejectedDelete.body?.rows?.some(row =>
            row.trade_id === createdHedgeTradeId && row.trade_type === "HEDGE_DEAL"
          )
          && fxTradeMarketSnapshotAfterRejectedHedgeDelete.body?.rows?.some(row =>
            row.trade_id === createdHedgeTradeId && row.trade_type === "HEDGE_DEAL"
          ),
        createdRowsShareId: createdHedgeExposureRow?.trade_id === createdHedgeTradeId
          && createdHedgeExposureRow?.trade_type === "HEDGE_DEAL"
          && createdHedgeExposureRow?.ccy_pair_code === "EUR_USD"
          && createdHedgeExposureRow?.base_ccy_side === "BUY"
          && createdHedgeExposureRow?.dealt_ccy_code === "USD"
          && createdHedgeExposureRow?.base_ccy_amount_minor === 250000000
          && createdHedgeExposureRow?.base_ccy_fraction_digits === 2
          && createdHedgeExposureRow?.quote_ccy_amount_minor === 280850000
          && createdHedgeExposureRow?.quote_ccy_fraction_digits === 2
          && createdHedgeExposureRow?.execution_timestamp
            === createHedgeFxDeal.body?.executionTimestamp
          && createdHedgeExposureRow?.received_timestamp
            === createHedgeFxDeal.body?.receivedTimestamp
          && createdHedgeDealRow?.trade_id === createdHedgeTradeId
          && createdHedgeDealRow?.trade_type === "HEDGE_DEAL"
          && createdHedgeDealRow?.request_timestamp
            === createHedgeFxDeal.body?.requestTimestamp
          && createdHedgeDealRow?.counterparty_id === createHedgeCounterparty.body?.counterpartyId
          && createdHedgeDealRow?.pricing_rule_id === createHedgePricingRule.body?.pricingRuleId
          && createdHedgeDealRow?.transfer_rate === createHedgeFxDeal.body?.transferRate
          && createdHedgeDealRow?.analytical_pnl_quote_minor
            === createHedgeFxDeal.body?.analyticalPnlQuoteMinor
          && createdHedgeDealRow?.analytical_pnl_quote_fraction_digits
            === createHedgeFxDeal.body?.analyticalPnlQuoteFractionDigits
          && createdHedgeMarketSnapshotRow?.trade_id === createdHedgeTradeId
          && createdHedgeMarketSnapshotRow?.trade_type === "HEDGE_DEAL"
      },
      clientDealPricingRules: {
        status: clientDealPricingRules.statusCode,
        count: clientDealPricingRules.body?.length ?? -1,
        allDealerPriced: clientDealPricingRules.body?.every(rule => rule.pricingMode === "DEALER_PRICED") === true
      },
      clientFxDeals: {
        count: clientFxDeals.body?.length ?? -1,
        first: clientFxDeals.body?.[0] || null,
        createdId: createClientFxDeal.body?.clientDealId,
        createdTradeId: createClientFxDeal.body?.tradeId,
        createdExecutionTimestamp: createClientFxDeal.body?.executionTimestamp,
        createdReceivedTimestamp: createClientFxDeal.body?.receivedTimestamp,
        createdSide: createClientFxDeal.body?.side,
        createdExecutionContextId: createClientFxDeal.body?.executionContextId,
        createdPricingRuleId: createClientFxDeal.body?.pricingRuleId,
        expectedExecutionContextId: clientDealExecutionContextId,
        expectedPricingRuleId: clientDealPricingRuleId,
        createdTransferRate: createClientFxDeal.body?.transferRate,
        createdAnalyticalPnl: createClientFxDeal.body?.analyticalPnl,
        createdAnalyticalPnlQuoteMinor: createClientFxDeal.body?.analyticalPnlQuoteMinor,
        createdAnalyticalPnlQuoteFractionDigits:
          createClientFxDeal.body?.analyticalPnlQuoteFractionDigits,
        createdDealtCcyCode: createClientFxDeal.body?.dealtCcyCode,
        createdBaseCcyAmountMinor: createClientFxDeal.body?.baseCcyAmountMinor,
        createdBaseCcyFractionDigits: createClientFxDeal.body?.baseCcyFractionDigits,
        createdQuoteCcyAmountMinor: createClientFxDeal.body?.quoteCcyAmountMinor,
        createdQuoteCcyFractionDigits: createClientFxDeal.body?.quoteCcyFractionDigits,
        createdMarketPulseStreamStatus: createClientFxDeal.body?.marketPulseStreamStatus,
        createdMarketPulseBid: createClientFxDeal.body?.marketPulseBid,
        createdMarketPulseOffer: createClientFxDeal.body?.marketPulseOffer,
        createdMarketPulseTimestamp: createClientFxDeal.body?.marketPulseTimestamp,
        createdComment: createClientFxDeal.body?.comment,
        immutableUpdateStatus: immutableClientFxDealUpdate.statusCode,
        immutableUpdateCode: immutableClientFxDealUpdate.body?.code,
        updatedComment: updateClientFxDealComment.body?.comment,
        invalidCommentStatus: invalidClientFxDealComment.statusCode,
        deleteStatus: rejectClientFxDealDelete.statusCode,
        deleteCode: rejectClientFxDealDelete.body?.code,
        countAfterRejectedDelete: clientFxDealsAfterRejectedDelete.body?.length ?? -1,
        migratedRow: migratedClientRow,
        rollbackStatus: rollbackClientFxDeal?.statusCode,
        rollbackPreservedCounts: rollbackCountsBefore.exposures === rollbackCountsAfter.exposures
          && rollbackCountsBefore.clientDeals === rollbackCountsAfter.clientDeals
          && rollbackCountsBefore.marketSnapshots === rollbackCountsAfter.marketSnapshots,
        createdRowsShareId: createdExposureRow?.trade_id === createdTradeId
          && createdExposureRow?.base_ccy_side === "SELL"
          && createdExposureRow?.dealt_ccy_code === "USD"
          && createdExposureRow?.execution_timestamp
            === createClientFxDeal.body?.executionTimestamp
          && createdExposureRow?.received_timestamp
            === createClientFxDeal.body?.receivedTimestamp
          && createdClientRow?.trade_id === createdTradeId
          && createdClientRow?.trade_type === "CLIENT_DEAL"
          && createdClientRow?.execution_context_id === clientDealExecutionContextId
          && createdClientRow?.pricing_rule_id === clientDealPricingRuleId
          && createdClientRow?.transfer_rate === 1.124
          && createdClientRow?.analytical_pnl_quote_minor === 180000
          && createdClientRow?.analytical_pnl_quote_fraction_digits === 2
          && createdClientRow?.comment === "Initial verification comment"
          && createdMarketSnapshotRow?.trade_id === createdTradeId
          && createdMarketSnapshotRow?.trade_type === "CLIENT_DEAL"
          && createdMarketSnapshotRow?.market_pulse_stream_status === "RUNNING"
          && createdMarketSnapshotRow?.market_pulse_bid === 1.1228
          && createdMarketSnapshotRow?.market_pulse_offer === 1.123
          && createdMarketSnapshotRow?.market_pulse_timestamp === "2026-07-16T10:15:29.000Z",
        commentUpdatePreservesTrade: updatedExposureRow?.base_ccy_amount_minor === 200000000
          && updatedExposureRow?.base_ccy_fraction_digits === 2
          && updatedExposureRow?.quote_ccy_amount_minor === 224620000
          && updatedExposureRow?.quote_ccy_fraction_digits === 2
          && updatedExposureRow?.trade_rate === 1.1231
          && updatedClientRow?.trade_id === createdTradeId
          && updatedClientRow?.counterparty_id === 1
          && updatedClientRow?.execution_context_id === clientDealExecutionContextId
          && updatedClientRow?.pricing_rule_id === clientDealPricingRuleId
          && updatedClientRow?.transfer_rate === 1.124
          && updatedClientRow?.analytical_pnl_quote_minor === 180000
          && updatedClientRow?.analytical_pnl_quote_fraction_digits === 2
          && updatedClientRow?.comment === "Reviewed verification comment"
          && updatedMarketSnapshotRow?.market_pulse_stream_status === "RUNNING"
          && updatedMarketSnapshotRow?.market_pulse_bid === 1.1228
          && updatedMarketSnapshotRow?.market_pulse_offer === 1.123
          && updatedMarketSnapshotRow?.market_pulse_timestamp === "2026-07-16T10:15:29.000Z",
        preservedAfterRejectedDelete:
          fxTradeExposureAfterRejectedClientDelete.body?.rows
            ?.some(row => row.trade_id === createdTradeId && row.trade_type === "CLIENT_DEAL")
          && clientFxDealsTableAfterRejectedDelete.body?.rows
            ?.some(row => row.trade_id === createdTradeId && row.trade_type === "CLIENT_DEAL")
          && fxTradeMarketSnapshotAfterRejectedClientDelete.body?.rows
            ?.some(row => row.trade_id === createdTradeId && row.trade_type === "CLIENT_DEAL"),
        foreignKeyViolations,
        subMinorAmountStatus: invalidClientFxDealSubMinorAmount.statusCode,
        subMinorAmountCode: invalidClientFxDealSubMinorAmount.body?.code,
        nonDealerPricingRuleStatus: invalidClientFxDealPricingMode.statusCode,
        nonDealerPricingRuleMessage: invalidClientFxDealPricingMode.body?.message,
        lifecycle: [
          createClientFxDeal.statusCode,
          immutableClientFxDealUpdate.statusCode,
          updateClientFxDealComment.statusCode,
          invalidClientFxDealComment.statusCode,
          invalidClientFxDealSide.statusCode,
          invalidClientFxDealCounterparty.statusCode,
          invalidClientFxDealTransferRate.statusCode,
          invalidClientFxDealSubMinorAmount.statusCode,
          invalidClientFxDealPricingScope.statusCode,
          invalidClientFxDealPricingMode.statusCode,
          rejectClientFxDealDelete.statusCode
        ]
      },
      pricingRules: {
        count: pricingRules.body?.length ?? -1,
        migratedCounterpartyTypes: [...new Set((pricingRules.body || []).map(rule => rule.counterpartyType))].sort(),
        allPricingModesResolved: pricingRules.body?.every(rule =>
          ["AUTO_PRICED", "DEALER_PRICED", "DEALER_APPROVED"].includes(rule.pricingMode)
        ) === true,
        migratedIdsPreserved: pricingRules.body?.map(rule => rule.pricingRuleId).sort((left, right) => left - right).join(",") === "1,2,3,4,5",
        migratedContextIdsAreIntegers: pricingRules.body?.every(rule => Number.isInteger(rule.executionContextId)),
        migratedOverridesAreNull: pricingRules.body?.every(
          rule => rule.positionManagementModeOverride === null
        ) === true,
        migratedEffectiveModesUseSafeManualDefault: pricingRules.body?.every(
          rule => rule.effectivePositionManagementMode === "MANUAL"
        ) === true,
        createdId: createPricingRule.body?.pricingRuleId,
        createdCounterpartyId: createPricingRule.body?.counterpartyId,
        createdCounterpartyType: createPricingRule.body?.counterpartyType,
        createdPairCode: createPricingRule.body?.ccyPairCode,
        createdCurrencyPair: createPricingRule.body?.currencyPair,
        createdPositionManagementModeOverride:
          createPricingRule.body?.positionManagementModeOverride,
        createdEffectivePositionManagementMode:
          createPricingRule.body?.effectivePositionManagementMode,
        updatedId: updatePricingRule.body?.pricingRuleId,
        updatedContextId: updatePricingRule.body?.executionContextId,
        expectedUpdatedContextId: emeraldClickContextId,
        updatedMargin: updatePricingRule.body?.marginPercent,
        updatedPositionManagementModeOverride:
          updatePricingRule.body?.positionManagementModeOverride,
        immutableUpdateStatus: immutablePricingRuleUpdate.statusCode,
        immutableUpdateCode: immutablePricingRuleUpdate.body?.code,
        immutableUpdateContextId: pricingRuleAfterImmutableUpdate?.executionContextId,
        immutableUpdateMargin: pricingRuleAfterImmutableUpdate?.marginPercent,
        lifecycle: [
          createPricingRule.statusCode,
          updatePricingRule.statusCode,
          immutablePricingRuleUpdate.statusCode,
          duplicatePricingRule.statusCode,
          invalidPricingRuleCounterparty.statusCode,
          invalidPricingRuleMargin.statusCode,
          blockedTradingCounterpartyDelete.statusCode,
          deletePricingRule.statusCode
        ]
      },
      tradingCounterparties: {
        count: tradingCounterparties.body?.length ?? -1,
        migratedScopes: [...new Set((tradingCounterparties.body || []).map(counterparty => counterparty.counterpartyScope))].sort(),
        migratedRoles: [...new Set((tradingCounterparties.body || [])
          .flatMap(counterparty => counterparty.counterpartyRoles || []))].sort(),
        legacyExternalProfile: tradingCounterparties.body
          ?.find(counterparty => counterparty.counterpartyCode === "LEGACY_EXTERNAL") || null,
        legacyInternalProfile: tradingCounterparties.body
          ?.find(counterparty => counterparty.counterpartyCode === "LEGACY_INTERNAL") || null,
        createdId: createTradingCounterparty.body?.counterpartyId,
        createdScope: createTradingCounterparty.body?.counterpartyScope,
        createdRoles: createTradingCounterparty.body?.counterpartyRoles,
        createdUnitType: createTradingCounterparty.body?.unitType,
        updatedScope: updateTradingCounterparty.body?.counterpartyScope,
        updatedCode: updateTradingCounterparty.body?.counterpartyCode,
        updatedUnitType: updateTradingCounterparty.body?.unitType,
        updatedActive: updateTradingCounterparty.body?.active,
        countAfterDelete: tradingCounterpartiesAfterDelete.body?.length ?? -1,
        lifecycle: [
          createTradingCounterparty.statusCode,
          updateTradingCounterparty.statusCode,
          duplicateTradingCounterparty.statusCode,
          invalidLegacyExternalCounterpartyType.statusCode,
          invalidLegacyInternalCounterpartyType.statusCode,
          invalidTradingCounterpartyCodeType.statusCode,
          invalidTradingCounterpartyCodeLength.statusCode,
          invalidTradingCounterpartyNameLength.statusCode,
          deleteTradingCounterparty.statusCode
        ]
      },
      users: {
        count: users.body?.length ?? -1,
        createdId: createUser.body?.userId,
        updatedRole: updateUser.body?.userRole,
        updatedActive: updateUser.body?.active,
        countAfterDelete: usersAfterDelete.body?.length ?? -1,
        lifecycle: [
          createUser.statusCode,
          updateUser.statusCode,
          duplicateUser.statusCode,
          invalidUserCode.statusCode,
          invalidUserRole.statusCode,
          deleteUser.statusCode
        ]
      },
      clientDealGeneration: {
        settingsStatus: generationSettingsBefore.statusCode,
        settingsCount: generationSettingsBefore.body?.length ?? -1,
        allClientRules: generationSettingsBefore.body
          ?.every(settings => settings.counterpartyType === "CLIENT") === true,
        allAutoPricedRules: generationSettingsBefore.body
          ?.every(settings => settings.pricingMode === "AUTO_PRICED") === true,
        allAmountsUseStoredMinorUnits: generationSettingsBefore.body
          ?.every(settings =>
            Number.isSafeInteger(settings.minBaseCcyAmountMinor)
            && Number.isSafeInteger(settings.maxBaseCcyAmountMinor)
            && Number.isSafeInteger(settings.baseCcyAmountStepMinor)
            && Number.isInteger(settings.baseCcyFractionDigits)
            && settings.minBaseCcyAmount
              === settings.minBaseCcyAmountMinor
                / (10 ** settings.baseCcyFractionDigits)
            && settings.maxBaseCcyAmount
              === settings.maxBaseCcyAmountMinor
                / (10 ** settings.baseCcyFractionDigits)
            && settings.baseCcyAmountStep
              === settings.baseCcyAmountStepMinor
                / (10 ** settings.baseCcyFractionDigits)
          ) === true,
        configuredActiveCount: generationSettingsConfigured.body
          ?.filter(settings => settings.active).length ?? -1,
        invalidSettingsStatus: invalidGenerationSettings.statusCode,
        generatedStatus: generatedClientFxDeal.statusCode,
        generatedErrorCode: generatedClientFxDeal.body?.code,
        generatedErrorMessage: generatedClientFxDeal.body?.message,
        generatedTradeId: generatedClientFxDeal.body?.tradeId,
        generatedPricingRuleId: generatedClientFxDeal.body?.pricingRuleId,
        expectedPricingRuleId: generationRule?.pricingRuleId,
        generatedSide: generatedClientFxDeal.body?.side,
        generatedBaseCcyAmount: generatedClientFxDeal.body?.baseCcyAmount,
        generatedTenor: generatedClientFxDeal.body?.tenor,
        generatedMarketPulseStatus: generatedClientFxDeal.body?.marketPulseStreamStatus,
        generatedMarketPulseBid: generatedClientFxDeal.body?.marketPulseBid,
        generatedMarketPulseOffer: generatedClientFxDeal.body?.marketPulseOffer,
        generatedDealtCcyCode: generatedExposureRow?.dealt_ccy_code,
        expectedDealtCcyCode: generationRule?.currencyPair?.split("/")[0],
        generatedBaseFractionDigits: generatedExposureRow?.base_ccy_fraction_digits,
        expectedBaseFractionDigits: 3,
        generatedQuoteFractionDigits: generatedExposureRow?.quote_ccy_fraction_digits,
        expectedQuoteFractionDigits: 0,
        generatedDeleteStatus: rejectGeneratedClientFxDealDelete.statusCode,
        processSettingsStatus: generationProcessSettingsBefore.statusCode,
        processSettings: generationProcessSettingsBefore.body,
        invalidProcessSettingsStatus: invalidGenerationProcessSettings.statusCode,
        configuredProcessSettingsStatus: configuredGenerationProcessSettings.statusCode,
        configuredProcessSettings: configuredGenerationProcessSettings.body,
        processStartStatus: startClientDealGenerationProcess.statusCode,
        processStartedRunning: startClientDealGenerationProcess.body?.running,
        processStartedGeneratedCount:
          startClientDealGenerationProcess.body?.generatedDealCount,
        processStartedNextCycleAt: startClientDealGenerationProcess.body?.nextCycleAt,
        processStatus: clientDealGenerationProcessStatus.statusCode,
        processStatusRunning: clientDealGenerationProcessStatus.body?.running,
        processGeneratedCount:
          clientDealGenerationProcessStatus.body?.generatedDealCount,
        processLastCycleSize: clientDealGenerationProcessStatus.body?.lastCycleSize,
        processLastCycleGeneratedCount:
          clientDealGenerationProcessStatus.body?.lastCycleGeneratedDealCount,
        processStopStatus: stopClientDealGenerationProcess.statusCode,
        processStoppedRunning: stopClientDealGenerationProcess.body?.running,
        processGeneratedDeleteStatus: rejectProcessGeneratedClientFxDealDelete.statusCode,
        processSettingsRestored:
          restoredGenerationProcessSettings.statusCode === 200
          && Object.entries(generationProcessSettingsBefore.body || {}).every(
            ([field, value]) => restoredGenerationProcessSettings.body?.[field] === value
          ),
        rejectedProcessStartStatus: rejectedClientDealGenerationProcessStart.statusCode,
        rejectedProcessStartCode: rejectedClientDealGenerationProcessStart.body?.code,
        remainsStoppedWithoutEligibleRules:
          stoppedClientDealGenerationProcessStatus.body?.running === false,
        settingsRestored: generationSettingsRestored.body?.every(restored => {
          const original = generationSettingsBefore.body?.find(settings =>
            settings.pricingRuleId === restored.pricingRuleId
          );

          return Boolean(original)
            && restored.minBaseCcyAmount === original.minBaseCcyAmount
            && restored.maxBaseCcyAmount === original.maxBaseCcyAmount
            && restored.baseCcyAmountStep === original.baseCcyAmountStep
            && restored.buyProbabilityPercent === original.buyProbabilityPercent
            && restored.active === original.active;
        }) === true
      },
      simulationControl: {
        status: simulationStatus.statusCode,
        start: startSimulation.statusCode,
        startRunning: startSimulation.body?.running,
        stream: eventStream.statusCode,
        streamHasSnapshot: eventStream.responseBody.includes("event: snapshot"),
        stop: stopSimulation.statusCode,
        stopRunning: stopSimulation.body?.running
      },
      writeLifecycle: [
        createCurrency.statusCode,
        createPair.statusCode,
        putSettings.statusCode,
        getSettings.statusCode,
        patchPair.statusCode,
        deleteSettings.statusCode,
        restoreSettings.statusCode,
        blockedCurrencyDelete.statusCode,
        deletePair.statusCode,
        deleteCurrency.statusCode,
        createServicingLocation.statusCode,
        updateServicingLocation.statusCode,
        blockedServicingLocationDelete.statusCode,
        createAccountingSystem.statusCode,
        updateAccountingSystem.statusCode,
        blockedAccountingSystemDelete.statusCode,
        deleteAccountingSystem.statusCode,
        createExecutionSystem.statusCode,
        updateExecutionSystem.statusCode,
        blockedExecutionSystemDelete.statusCode,
        deleteExecutionSystem.statusCode,
        createExecutionContext.statusCode,
        updateExecutionContext.statusCode,
        invalidExecutionContext.statusCode,
        deleteExecutionContext.statusCode,
        deleteServicingLocation.statusCode
      ]
    };
  } finally {
    closeDatabase();
  }
}

async function main() {
  createLegacyDatabase();

  try {
    const freshSchema = verifyFreshSchemaAndSeed();
    const frontend = verifyFrontendStructure();
    const simulator = verifyMarketPulseSimulator();
    const apiAndMigration = await verifyApiAndMigration();
    const expectedTables = [
      "accounting_systems",
      "auto_hedging_admission_policy_current",
      "auto_hedging_admission_policy_pair_rules",
      "auto_hedging_admission_policy_revisions",
      "ccy_options",
      "ccy_pair_options",
      "client_deal_generation_process_settings",
      "client_deal_generation_settings",
      "client_fx_deals",
      "execution_contexts",
      "execution_systems",
      "external_counterparties",
      "fx_auto_batching_ccy_pairs",
      "fx_auto_batching_settings",
      "fx_auto_hedging_admission_decisions",
      "fx_batch_balance_trade",
      "fx_batch_members",
      "fx_batch_position_output",
      "fx_batch_quote_cash_output",
      "fx_batches",
      "fx_batching_settings",
      "fx_hedge_deals",
      "fx_hedge_quick_mode_settings",
      "fx_trade_exposure",
      "fx_trade_market_snapshot",
      "fx_trade_position_management",
      "fx_trade_position_management_transitions",
      "internal_units",
      "market_quote_simulation_settings",
      "pricing_rules",
      "servicing_locations",
      "trading_counterparties",
      "trading_counterparty_execution_contexts",
      "trading_counterparty_roles",
      "ui_color_tokens",
      "ui_table_column_settings",
      "users",
      "v_fx_batch_formation_audit"
    ];
    const simulationForeignKey = apiAndMigration.settingsForeignKeys[0];
    const failed = freshSchema.currencies !== 5
      || freshSchema.pairs !== 3
      || freshSchema.simulationSettings !== 3
      || freshSchema.simulationSettingsColumns.join(",")
        !== "ccy_pair_code,bid_min,spread,bid_max,one_way_duration_seconds,fluctuation_spreads"
      || !freshSchema.simulationSettingsRows.every(row =>
        row.one_way_duration_seconds === 60
        && row.fluctuation_spreads === 3
      )
      || freshSchema.servicingLocations !== 6
      || freshSchema.accountingSystems !== 2
      || freshSchema.executionSystems !== 3
      || freshSchema.executionContexts !== 5
      || freshSchema.executionContextIdType !== "INTEGER"
      || freshSchema.executionContextDefaultPositionManagementModeColumn?.notnull !== 1
      || freshSchema.executionContextDefaultPositionManagementModeColumn?.dflt_value !== "'MANUAL'"
      || freshSchema.executionContextPositionManagementModeCounts
        .map(row => `${row.mode}:${row.count}`).join(",") !== "AUTO:2,MANUAL:3"
      || freshSchema.tradingCounterparties !== 5
      || freshSchema.tradingCounterpartyRoles.join(",") !== "CLIENT,HEDGE_COUNTERPARTY"
      || freshSchema.tradingCounterpartyColumns.join(",") !== "counterparty_id,counterparty_name,is_active"
      || freshSchema.externalCounterpartyColumns.join(",")
        !== "counterparty_id,counterparty_code,counterparty_code_type,external_counterparty_kind"
      || freshSchema.internalUnitColumns.join(",") !== "counterparty_id,unit_code,unit_type"
      || freshSchema.tradingCounterpartyRoleColumns.join(",") !== "counterparty_id,role_code"
      || freshSchema.counterpartyExecutionContexts !== 7
      || freshSchema.counterpartyExecutionContextColumns.join(",")
        !== "counterparty_id,execution_context_id"
      || freshSchema.counterpartyExecutionContextForeignKeys.length !== 2
      || !freshSchema.counterpartyExecutionContextForeignKeys.some(foreignKey =>
        foreignKey.table === "trading_counterparties"
        && foreignKey.on_update === "RESTRICT"
        && foreignKey.on_delete === "CASCADE"
      )
      || !freshSchema.counterpartyExecutionContextForeignKeys.some(foreignKey =>
        foreignKey.table === "execution_contexts"
        && foreignKey.on_update === "RESTRICT"
        && foreignKey.on_delete === "RESTRICT"
      )
      || freshSchema.counterpartyExecutionContextIndexColumns.join(",")
        !== "execution_context_id,counterparty_id"
      || freshSchema.users !== 3
      || freshSchema.userColumns.join(",") !== "user_id,user_code,first_name,last_name,user_role,is_active"
      || freshSchema.userRoles.join(",") !== "ADMIN,DEALER,SUPERVISOR"
      || freshSchema.uiColorTokens !== 99
      || freshSchema.uiColorTokenColumns.join(",")
        !== "token_code,palette_family,shade,color_value,display_order,updated_at"
      || freshSchema.uiColorTokenFamilies.join(",")
        !== "BLUE,CYAN,GRAY,GREEN,INDIGO,ORANGE,PINK,PURPLE,RED,TEAL,YELLOW"
      || freshSchema.uiColorTokenSamples.map(row => `${row.token_code}:${row.color_value}`).join(",")
        !== "blue_500:#0D6EFD,red_100:#F8D7DA,green_100:#D1E7DD"
      || freshSchema.uiTableColumnSettings !== 207
      || freshSchema.uiTableColumnLayoutKeys.map(row =>
        `${row.table_key}:${row.column_count}`
      ).join(",") !== "accounting_systems_grid:5,analytical_pnl_report_grid:12,analytical_pnl_summary_grid:3,batch_cash_output_grid:3,batch_formation_audit_grid:10,batch_members_grid:9,batch_position_output_grid:9,batching_history_grid:6,ccy_options_grid:6,ccy_pair_options_grid:6,client_fx_deals_grid:21,deal_generation_settings_grid:11,execution_contexts_grid:8,execution_systems_grid:7,external_counterparties_grid:8,fx_position_grid:13,hedge_fx_deals_grid:22,hedge_quick_mode_settings_grid:7,internal_pricing_rules_grid:8,internal_units_grid:8,market_stream_grid:4,pricing_rules_grid:7,servicing_locations_grid:7,users_grid:7"
      || freshSchema.uiTableColumnSettingColumns.join(",")
        !== "table_key,column_key,column_label,display_order,default_width_px,width_px,updated_at"
      || freshSchema.uiTableColumnSettingRows.map(row =>
        `${row.column_key}:${row.default_width_px}:${row.width_px}`
      ).join(",") !== "id:64:64,counterparty_code:122:122,counterparty_name:158:158,execution_context:596:596,ccy_pair:88:88,position_management_mode:232:232,margin:82:82"
      || !freshSchema.uiTableColumnSettingsConstraintsEnforced
      || freshSchema.pricingRules !== 7
      || freshSchema.pricingRulePositionManagementModeOverrideColumn?.notnull !== 0
      || freshSchema.pricingRuleNullPositionManagementModeOverrides !== 7
      || freshSchema.legacyMonetaryColumns.length !== 0
      || freshSchema.clientDealGenerationProcessSettingsColumns.join(",")
        !== "settings_id,min_interval_seconds,max_interval_seconds,min_deals_per_cycle,max_deals_per_cycle"
      || freshSchema.clientDealGenerationProcessSettings?.settings_id !== 1
      || freshSchema.clientDealGenerationProcessSettings?.min_interval_seconds !== 1
      || freshSchema.clientDealGenerationProcessSettings?.max_interval_seconds !== 3
      || freshSchema.clientDealGenerationProcessSettings?.min_deals_per_cycle !== 3
      || freshSchema.clientDealGenerationProcessSettings?.max_deals_per_cycle !== 7
      || freshSchema.fxBatchingSettingsColumns.join(",")
        !== "settings_id,allow_cross_tenor_batching,updated_at"
      || freshSchema.fxBatchingSettings?.settings_id !== 1
      || freshSchema.fxBatchingSettings?.allow_cross_tenor_batching !== 0
      || freshSchema.fxAutoBatchingSettingsColumns.join(",")
        !== "settings_id,max_interval_seconds,default_transfer_rate_spread_percent,tenor_compatibility_mode,updated_at"
      || freshSchema.fxAutoBatchingSettings?.settings_id !== 1
      || freshSchema.fxAutoBatchingSettings?.max_interval_seconds !== 60
      || freshSchema.fxAutoBatchingSettings?.default_transfer_rate_spread_percent !== "0.05"
      || freshSchema.fxAutoBatchingSettings?.tenor_compatibility_mode !== "SAME_TENOR_ONLY"
      || freshSchema.fxAutoBatchingCcyPairs.map(row => row.ccy_pair_code).join(",")
        !== "EUR_USD,GBP_USD"
      || freshSchema.fxAutoBatchingCcyPairColumns.join(",")
        !== "settings_id,ccy_pair_code"
      || freshSchema.fxAutoBatchingCcyPairForeignKeys.length !== 2
      || freshSchema.clientDealGenerationSettings !== 2
      || freshSchema.clientDealGenerationSettingsColumns.join(",") !== "pricing_rule_id,min_base_ccy_amount_minor,max_base_ccy_amount_minor,base_ccy_amount_step_minor,base_ccy_fraction_digits,buy_probability_percent,is_active"
      || freshSchema.clientDealGenerationSettingsForeignKeys.length !== 1
      || freshSchema.clientDealGenerationSettingsForeignKeys[0]?.table !== "pricing_rules"
      || freshSchema.clientDealGenerationSettingsForeignKeys[0]?.on_update !== "RESTRICT"
      || freshSchema.clientDealGenerationSettingsForeignKeys[0]?.on_delete !== "CASCADE"
      || !freshSchema.clientDealGenerationSettingsRows.every(row =>
        row.counterparty_type === "CLIENT"
        && row.pricing_mode === "AUTO_PRICED"
        && row.min_base_ccy_amount_minor === 500000 * (10 ** row.base_ccy_fraction_digits)
        && row.max_base_ccy_amount_minor === 1500000 * (10 ** row.base_ccy_fraction_digits)
        && row.base_ccy_amount_step_minor === 100000 * (10 ** row.base_ccy_fraction_digits)
        && Number.isInteger(row.base_ccy_fraction_digits)
        && row.buy_probability_percent === 50
        && row.is_active === 1
      )
      || freshSchema.fxTradeExposures !== 6
      || freshSchema.fxTradeExposureColumns.join(",") !== "trade_id,execution_timestamp,received_timestamp,trade_type,trade_date,ccy_pair_code,base_ccy_side,dealt_ccy_code,base_ccy_amount_minor,base_ccy_fraction_digits,quote_ccy_amount_minor,quote_ccy_fraction_digits,trade_rate,tenor,base_ccy_value_date,quote_ccy_value_date"
      || freshSchema.fxTradeExposureForeignKeys.length !== 2
      || !freshSchema.fxTradeExposureIdentityIndex
      || freshSchema.fxTradeExposureIdentityIndexColumns.join(",") !== "trade_id,trade_type"
      || freshSchema.fxTradePositionManagementRows !== freshSchema.fxTradeExposures
      || freshSchema.fxTradePositionManagementColumns.join(",")
        !== "trade_id,trade_type,initial_position_management_mode,current_position_management_mode,created_at,updated_at"
      || freshSchema.fxTradePositionManagementInitialModeCounts.length !== 1
      || freshSchema.fxTradePositionManagementInitialModeCounts[0]?.mode !== "MANUAL"
      || freshSchema.fxTradePositionManagementInitialModeCounts[0]?.count
        !== freshSchema.fxTradeExposures
      || freshSchema.fxTradePositionManagementCurrentModeCounts.length !== 1
      || freshSchema.fxTradePositionManagementCurrentModeCounts[0]?.mode !== "MANUAL"
      || freshSchema.fxTradePositionManagementCurrentModeCounts[0]?.count
        !== freshSchema.fxTradeExposures
      || freshSchema.fxTradePositionManagementMissingRows !== 0
      || freshSchema.fxTradePositionManagementOrphanRows !== 0
      || freshSchema.fxTradePositionManagementForeignKeys.length !== 2
      || !freshSchema.fxTradePositionManagementForeignKeys.every(foreignKey =>
        foreignKey.table === "fx_trade_exposure"
        && foreignKey.on_update === "RESTRICT"
        && foreignKey.on_delete === "CASCADE"
      )
      || freshSchema.fxTradePositionManagementForeignKeys
        .slice()
        .sort((left, right) => left.seq - right.seq)
        .map(foreignKey => `${foreignKey.from}:${foreignKey.to}`).join(",")
        !== "trade_id:trade_id,trade_type:trade_type"
      || freshSchema.fxTradePositionManagementTrigger?.name
        !== "trg_fx_trade_position_management_initialize"
      || !freshSchema.fxTradePositionManagementTrigger?.sql
        ?.includes("AFTER INSERT ON fx_trade_exposure")
      || !freshSchema.fxTradePositionManagementTrigger?.sql
        ?.includes("INSERT INTO fx_trade_position_management")
      || !freshSchema.fxTradePositionManagementTrigger?.sql
        ?.includes("(NEW.trade_id, NEW.trade_type, 'MANUAL', 'MANUAL')")
      || freshSchema.fxTradePositionManagementTransitionRows !== 0
      || freshSchema.fxTradePositionManagementTransitionColumns.join(",")
        !== "transition_id,trade_id,trade_type,from_position_management_mode,to_position_management_mode,reason_code,transition_source,transitioned_at"
      || freshSchema.fxTradePositionManagementTransitionForeignKeys.length !== 2
      || !freshSchema.fxTradePositionManagementTransitionForeignKeys.every(foreignKey =>
        foreignKey.table === "fx_trade_exposure"
        && foreignKey.on_update === "RESTRICT"
        && foreignKey.on_delete === "CASCADE"
      )
      || freshSchema.fxTradePositionManagementTransitionForeignKeys
        .slice()
        .sort((left, right) => left.seq - right.seq)
        .map(foreignKey => `${foreignKey.from}:${foreignKey.to}`).join(",")
        !== "trade_id:trade_id,trade_type:trade_type"
      || !freshSchema.fxTradePositionManagementTransitionCreateSql
        .includes("from_position_management_mode = 'MANUAL'")
      || !freshSchema.fxTradePositionManagementTransitionCreateSql
        .includes("to_position_management_mode = 'AUTO'")
      || !freshSchema.fxTradePositionManagementTransitionCreateSql
        .includes("reason_code = 'MANUAL_REVIEW_COMPLETED'")
      || !freshSchema.fxTradePositionManagementTransitionCreateSql
        .includes("transition_source = 'OPERATOR'")
      || freshSchema.fxTradeMarketSnapshots !== 2
      || freshSchema.fxTradeMarketSnapshotColumns.join(",") !== "trade_id,trade_type,market_pulse_stream_status,market_pulse_bid,market_pulse_offer,market_pulse_timestamp"
      || freshSchema.fxTradeMarketSnapshotForeignKeys.length !== 2
      || !freshSchema.fxTradeMarketSnapshotForeignKeys.every(foreignKey =>
        foreignKey.on_update === "RESTRICT" && foreignKey.on_delete === "RESTRICT"
      )
      || !freshSchema.fxTradeMarketSnapshotForeignKeys.every(foreignKey =>
        foreignKey.table === "fx_trade_exposure"
      )
      || freshSchema.fxTradeMarketSnapshotSeedRows[0]?.market_pulse_bid !== 1.122
      || freshSchema.fxTradeMarketSnapshotSeedRows[0]?.market_pulse_offer !== 1.1222
      || freshSchema.fxTradeMarketSnapshotSeedRows[0]?.market_pulse_stream_status !== "RUNNING"
      || freshSchema.fxTradeMarketSnapshotSeedRows[0]?.market_pulse_timestamp !== "2026-07-15T09:30:00.000Z"
      || freshSchema.clientFxDeals !== 1
      || freshSchema.clientFxDealColumns.join(",") !== "trade_id,trade_type,counterparty_id,execution_context_id,pricing_rule_id,transfer_rate,analytical_pnl_quote_minor,analytical_pnl_quote_fraction_digits,comment"
      || freshSchema.clientFxDealForeignKeys.length !== 7
      || !freshSchema.clientFxDealForeignKeys.every(foreignKey =>
        foreignKey.on_update === "RESTRICT" && foreignKey.on_delete === "RESTRICT"
      )
      || !["trading_counterparties", "execution_contexts", "pricing_rules", "fx_trade_exposure"].every(referencedTable =>
        freshSchema.clientFxDealForeignKeys.some(foreignKey => foreignKey.table === referencedTable)
      )
      || freshSchema.clientFxDealSeedRow?.execution_context_id !== 3
      || freshSchema.clientFxDealSeedRow?.pricing_rule_id !== 3
      || freshSchema.clientFxDealSeedRow?.transfer_rate !== 1.1222
      || freshSchema.clientFxDealSeedRow?.analytical_pnl_quote_minor !== 2700000
      || freshSchema.clientFxDealSeedRow?.analytical_pnl_quote_fraction_digits !== 2
      || freshSchema.hedgeFxDeals !== 1
      || freshSchema.hedgeFxDealColumns.join(",") !== "trade_id,trade_type,request_timestamp,counterparty_id,execution_context_id,pricing_rule_id,transfer_rate,analytical_pnl_quote_minor,analytical_pnl_quote_fraction_digits"
      || freshSchema.hedgeFxDealForeignKeys.length !== 7
      || !freshSchema.hedgeFxDealForeignKeys.every(foreignKey =>
        foreignKey.on_update === "RESTRICT" && foreignKey.on_delete === "RESTRICT"
      )
      || !["trading_counterparties", "execution_contexts", "pricing_rules", "fx_trade_exposure"].every(referencedTable =>
        freshSchema.hedgeFxDealForeignKeys.some(foreignKey => foreignKey.table === referencedTable)
      )
      || freshSchema.hedgeFxDealSeedRow?.trade_type !== "HEDGE_DEAL"
      || freshSchema.hedgeFxDealSeedRow?.transfer_rate !== 1.1222
      || freshSchema.hedgeFxDealSeedRow?.analytical_pnl_quote_minor !== 0
      || freshSchema.hedgeFxDealSeedRow?.analytical_pnl_quote_fraction_digits !== 2
      || freshSchema.hedgeQuickModeSettings !== 1
      || freshSchema.hedgeQuickModeSettingsColumns.join(",")
        !== "ccy_pair_code,counterparty_id,pricing_rule_id,base_ccy_fraction_digits,small_base_ccy_amount_minor,medium_base_ccy_amount_minor,large_base_ccy_amount_minor,xlarge_base_ccy_amount_minor,is_active,default_tenor"
      || freshSchema.hedgeQuickModeSettingsForeignKeys.length !== 5
      || !freshSchema.hedgeQuickModeSettingsForeignKeys.every(foreignKey =>
        ["ccy_pair_options", "trading_counterparties", "pricing_rules"].includes(foreignKey.table)
        && foreignKey.on_update === "RESTRICT"
        && foreignKey.on_delete === "RESTRICT"
      )
      || freshSchema.hedgeQuickModeSettingsSeedRow?.ccy_pair_code !== "EUR_USD"
      || freshSchema.hedgeQuickModeSettingsSeedRow?.counterparty_id !== 4
      || freshSchema.hedgeQuickModeSettingsSeedRow
        ?.base_ccy_fraction_digits !== 2
      || freshSchema.hedgeQuickModeSettingsSeedRow
        ?.small_base_ccy_amount_minor !== 500000000
      || freshSchema.hedgeQuickModeSettingsSeedRow
        ?.medium_base_ccy_amount_minor !== 2000000000
      || freshSchema.hedgeQuickModeSettingsSeedRow
        ?.large_base_ccy_amount_minor !== 5000000000
      || freshSchema.hedgeQuickModeSettingsSeedRow
        ?.xlarge_base_ccy_amount_minor !== 10000000000
      || freshSchema.hedgeQuickModeSettingsSeedRow?.is_active !== 1
      || freshSchema.hedgeQuickModeSettingsSeedRow?.default_tenor !== "TOD"
      || freshSchema.hedgeQuickModeSettingsSeedRow
        ?.counterparty_type !== "HEDGE_COUNTERPARTY"
      || freshSchema.hedgeQuickModeSettingsSeedRow
        ?.pricing_mode !== "AUTO_PRICED"
      || !freshSchema.hedgeQuickModeSettingsReferenceIndex
      || freshSchema.hedgeQuickModeSettingsReferenceIndexColumns.join(",")
        !== "pricing_rule_id,ccy_pair_code"
      || freshSchema.hedgeQuickModeSettingsTriggers.length < 9
      || freshSchema.fxTradeBatches !== 0
      || freshSchema.fxTradeBatchColumns.join(",") !== "batch_id,idempotency_key,ccy_pair_code,batch_status,formation_reason_code,formation_reason_details_json,window_opened_at,window_closed_at,created_at,rolled_back_at"
      || freshSchema.batchFormationAuditView?.type !== "view"
      || freshSchema.batchFormationAuditViewColumns.join(",")
        !== "batch_id,batch_status,ccy_pair_code,trade_date,tenor,base_ccy_value_date,quote_ccy_value_date,base_ccy_fraction_digits,quote_ccy_fraction_digits,window_opened_at,window_closed_at,formed_at,formation_reason_code,formation_reason_details_json,source_trade_count,rolled_back_at"
      || freshSchema.fxTradeBatchForeignKeys.length !== 1
      || freshSchema.fxTradeBatchForeignKeys[0]?.table !== "ccy_pair_options"
      || freshSchema.fxTradeBatchForeignKeys[0]?.on_update !== "RESTRICT"
      || freshSchema.fxTradeBatchForeignKeys[0]?.on_delete !== "RESTRICT"
      || !freshSchema.fxTradeBatchCreateSql.includes("AUTOINCREMENT")
      || freshSchema.fxTradeBatchStatusPairIndexColumns.join(",") !== "batch_status,ccy_pair_code"
      || !freshSchema.fxTradeBatchDefaultsSupported
      || !freshSchema.fxTradeBatchConstraintsEnforced
      || freshSchema.batchBalancingTrades !== 0
      || freshSchema.batchBalancingTradeColumns.join(",") !== "batch_id,trade_id,trade_type,member_role"
      || freshSchema.batchBalancingTradeForeignKeys.length !== 3
      || !freshSchema.batchBalancingTradeForeignKeys.every(foreignKey =>
        ["fx_trade_exposure", "fx_batches"].includes(foreignKey.table)
        && foreignKey.on_update === "RESTRICT"
        && foreignKey.on_delete === "RESTRICT"
      )
      || !/\bCHECK\s*\(\s*member_role\s+IN\s*\(\s*'TRADE'\s*,\s*'BALANCE_TRADE'\s*,\s*'POSITION_OUT'\s*\)\s*\)/i
        .test(freshSchema.batchMemberCreateSql)
      || !freshSchema.batchMemberCreateSql.includes("trade_type = 'BATCH_BALANCE_TRADE'")
      || !freshSchema.batchMemberCreateSql.includes("trade_type = 'BATCH_POSITION_OUT'")
      || freshSchema.batchMemberCreateSql.includes("BALANCE_QUOTE_CASH")
      || !freshSchema.batchMemberTechnicalOriginIndex
      || freshSchema.batchBalanceTrades !== 0
      || freshSchema.batchBalanceTradeColumns.map(column => column.name).join(",")
        !== "trade_id,trade_type"
      || freshSchema.batchBalanceTradeColumns
        .find(column => column.name === "trade_id")?.pk !== 1
      || freshSchema.batchBalanceTradeForeignKeys.length !== 2
      || !freshSchema.batchBalanceTradeForeignKeys.every(foreignKey =>
        foreignKey.table === "fx_trade_exposure"
        && foreignKey.on_update === "RESTRICT"
        && foreignKey.on_delete === "RESTRICT"
      )
      || !/\btrade_id\s+INTEGER\s+PRIMARY KEY\b/i
        .test(freshSchema.batchBalanceTradeCreateSql)
      || !/\bCHECK\s*\(\s*trade_type\s*=\s*'BATCH_BALANCE_TRADE'\s*\)/i
        .test(freshSchema.batchBalanceTradeCreateSql)
      || freshSchema.batchPositionOutputs !== 0
      || freshSchema.batchPositionOutputColumns.map(column => column.name).join(",")
        !== "trade_id,trade_type"
      || freshSchema.batchPositionOutputColumns
        .find(column => column.name === "trade_id")?.pk !== 1
      || freshSchema.batchPositionOutputForeignKeys.length !== 2
      || !freshSchema.batchPositionOutputForeignKeys.every(foreignKey =>
        foreignKey.table === "fx_trade_exposure"
        && foreignKey.on_update === "RESTRICT"
        && foreignKey.on_delete === "RESTRICT"
      )
      || !/\btrade_id\s+INTEGER\s+PRIMARY KEY\b/i
        .test(freshSchema.batchPositionOutputCreateSql)
      || !/\bCHECK\s*\(\s*trade_type\s*=\s*'BATCH_POSITION_OUT'\s*\)/i
        .test(freshSchema.batchPositionOutputCreateSql)
      || freshSchema.batchPositionOutputCreateSql.includes("output_role")
      || freshSchema.batchQuoteCashMembers !== 0
      || freshSchema.batchQuoteCashMemberColumns.join(",")
        !== "batch_id,quote_ccy_code,quote_balance_contribution_minor,quote_ccy_fraction_digits,quote_ccy_value_date,created_at"
      || freshSchema.batchQuoteCashMemberForeignKeys.length !== 2
      || !freshSchema.batchQuoteCashMemberForeignKeys.every(foreignKey =>
        ["fx_batches", "ccy_options"].includes(foreignKey.table)
        && foreignKey.on_update === "RESTRICT"
        && foreignKey.on_delete === "RESTRICT"
      )
      || !/\bbatch_id\s+INTEGER\s+PRIMARY KEY\b/i
        .test(freshSchema.batchQuoteCashMemberCreateSql)
      || freshSchema.batchQuoteCashMemberColumns.includes("batch_status")
      || freshSchema.batchQuoteCashMemberTriggers.join(",")
        !== "trg_fx_batch_quote_cash_output_immutable_delete,trg_fx_batch_quote_cash_output_immutable_update,trg_fx_batch_quote_cash_output_validate_insert"
      || !freshSchema.batchQuoteCashMemberSupported
      || !freshSchema.batchQuoteCashMemberConstraintsEnforced
      || !freshSchema.batchQuoteCashMemberParentRestrictionEnforced
      || !freshSchema.batchQuoteCashMemberSinglePerBatchEnforced
      || !freshSchema.batchQuoteCashNeutralityEnforced
      || !freshSchema.completedBatchQuoteCashMemberImmutable
      || !freshSchema.batchTradeTypesSupported
      || !freshSchema.batchBalancingTradeConstraintsEnforced
      || !freshSchema.batchBalancingTradeParentRestrictionEnforced
      || !freshSchema.pricingRuleReferenceIndex
      || freshSchema.pricingRuleReferenceIndexColumns.join(",") !== "pricing_rule_id,counterparty_id,execution_context_id"
      || freshSchema.pricingRuleExecutionContextIdType !== "INTEGER"
      || !freshSchema.ccyOptionsConstraintsEnforced
      || !freshSchema.ccyPairOptionsConstraintsEnforced
      || !freshSchema.servicingLocationConstraintsEnforced
      || !freshSchema.accountingSystemTextLimitsEnforced
      || !freshSchema.executionSystemConstraintsEnforced
      || !freshSchema.tradingCounterpartyConstraintsEnforced
      || !freshSchema.counterpartyExecutionContextConstraintsEnforced
      || !freshSchema.userConstraintsEnforced
      || !freshSchema.normalizedTradingCounterpartyProfilesSupported
      || !freshSchema.clientDealGenerationProcessSettingsConstraintsEnforced
      || !freshSchema.clientDealGenerationSettingsConstraintsEnforced
      || !freshSchema.clientDealGenerationSettingsCounterpartyTypeEnforced
      || !freshSchema.clientDealGenerationSettingsPricingModeEnforced
      || !freshSchema.clientDealGenerationSettingsCascadeDeleteEnforced
      || !freshSchema.fxTradeExposureConstraintsEnforced
      || !freshSchema.clientFxDealConstraintsEnforced
      || !freshSchema.clientFxDealParentRestrictionEnforced
      || !freshSchema.clientFxDealAttributionReferencesRestricted
      || !freshSchema.clientFxDealCounterpartyTypeEnforced
      || !freshSchema.hedgeFxDealConstraintsEnforced
      || !freshSchema.hedgeFxDealParentRestrictionEnforced
      || !freshSchema.hedgeFxDealCounterpartyTypeEnforced
      || !freshSchema.counterpartyExecutionContextTablePresent
      || freshSchema.foreignKeyViolations !== 0
      || frontend.duplicateIds.length > 0
      || frontend.missingDomIds.length > 0
      || !frontend.usesSimulationSettingsEndpoint
      || !frontend.usesBackendSimulationStream
      || !frontend.usesServicingLocationsEndpoint
      || !frontend.usesHedgeFxDealsEndpoint
      || !frontend.usesDedicatedAddHedgeDealFlow
      || !frontend.usesQuickHedgeMode
      || !frontend.usesHedgeQuickModeSettingsEditor
      || !frontend.usesFxAutoBatchingSettings
      || !frontend.usesCompactHedgingSettingsLayout
      || !frontend.usesHedgeCounterpartyPricingRules
      || !frontend.usesPricingModeIndicators
      || !frontend.usesExecutionSystemLabels
      || !frontend.usesUnifiedMarginIndicators
      || !frontend.usesGroupedDatabaseExplorer
      || !frontend.usesUiColorTokenPalette
      || !frontend.usesFxPositionColorPalette
      || !frontend.usesDatabaseBackedFxPositions
      || !frontend.usesModeSeparatedFxPositionWorkspace
      || !frontend.usesManualToAutoFxPositionTransition
      || !frontend.usesClientDealCommentOnlyEditing
      || !frontend.usesDatabaseBackedClientDealGeneration
      || !frontend.removesBrowserClientDealGeneration
      || !frontend.usesFxBatchFormation
      || !frontend.serializesFxBatchUiRequests
      || !frontend.usesBatchingHistory
      || !frontend.usesUnifiedBatchHeaderFilterFocus
      || !frontend.usesBatchFormationAudit
      || !frontend.usesBatchStructure
      || !frontend.removesBatchingPositionsWorkspace
      || !frontend.supportsBatchRollback
      || !frontend.usesMinorUnitBatchBalancing
      || !frontend.usesMinorUnitAnalyticalPnl
      || !frontend.usesStrictMinorUnitDealInputs
      || !frontend.usesMinorUnitDealGridFormatting
      || !frontend.usesMinorUnitClientDealGenerationSettings
      || !frontend.usesMinorUnitFxPositionSummary
      || !frontend.usesBootstrapFxPositionWorkspace
      || !frontend.usesBootstrapDealGenerationSettings
      || !frontend.showsAutoPricedClientDealGenerationMode
      || !frontend.usesNeutralMarketPulseNavigationIcon
      || !frontend.usesGroupedPricingNavigation
      || !frontend.usesTabbedTradesWorkspace
      || !frontend.usesGroupedSettingsNavigation
      || !frontend.usesFxPositionAsDefaultWorkspace
      || !frontend.usesImmutableClientFxDealEdit
      || !frontend.usesAuthoritativeClientDealRefresh
      || !frontend.usesHedgeFxDealsTabulator
      || !frontend.usesAccountingSystemsEndpoint
      || !frontend.usesExecutionSystemsEndpoint
      || !frontend.persistsReferenceDataItemsWithoutUndefinedAlias
      || !frontend.usesExecutionContextsEndpoint
      || !frontend.usesTradingCounterpartiesEndpoint
      || !frontend.usesUsersWorkspace
      || !frontend.usesInlineUsersEditor
      || !frontend.usesPricingRulesEndpoint
      || !frontend.usesPricingRulesBootstrap
      || !frontend.usesPricingRulePositionModeInheritanceControls
      || !frontend.usesFxPositionManagementPolicyConfiguration
      || !frontend.usesDatabaseBackedUiTableColumnLayouts
      || !frontend.displaysPricingRuleCounterpartyType
      || !frontend.embedsPricingModeInPricingRuleExecutionContext
      || !frontend.usesDealerPricedClientDealRules
      || !frontend.usesClientFxDealsEndpoint
      || !frontend.persistsClientFxDealAttribution
      || !frontend.usesDedicatedAddClientDealFlow
      || !frontend.supportsClientOnboardingManualPricing
      || !frontend.usesContextRichPricingRulePicker
      || !frontend.usesPricingRuleDropdown
      || !frontend.autoSelectsSinglePricingRule
      || !frontend.keepsPricingRuleMarginVisible
      || !frontend.usesCompactCurrencyPairBeforeClient
      || !frontend.usesWrappingClientPicker
      || !frontend.usesSearchableAddClientDealClientPicker
      || !frontend.usesSearchableAddHedgeDealCounterpartyPicker
      || !frontend.usesUnifiedEmbeddedFieldClearButtons
      || !frontend.usesUnifiedCustomDropdownToggles
      || !frontend.usesBootstrapClientDealDialog
      || !frontend.usesStructuredTradeEconomicsLayout
      || !frontend.usesNegativeClientDealPnlConfirmation
      || !frontend.usesBaseCurrencyClientDealSideLabels
      || !frontend.usesInlineFixedAmountCurrencySelection
      || !frontend.usesCollapsibleAdditionalAttributes
      || !frontend.usesClientDealDuplicateCheck
      || !frontend.usesTradingCounterpartiesLanguage
      || !frontend.usesDomainNavigationIcons
      || !frontend.usesTradingCounterpartyColumnFilters
      || !frontend.usesUnifiedBooleanActivityPresentation
      || !frontend.usesBootstrapTradingCounterpartyGrid
      || !frontend.usesContextualDeletePlacement
      || !frontend.usesTradingCounterpartyPricingContextBricks
      || !frontend.usesTradingCounterpartyDetailRoutes
      || !frontend.usesInlineTradingCounterpartyCreate
      || !frontend.usesUnifiedConstrainedTableSizing
      || !frontend.usesBootstrapPricingRuleDialog
      || !frontend.usesPolicyAwarePricingRuleEditing
      || !frontend.usesMutedUnavailablePricingContextOptions
      || !frontend.usesFilterAwareSmartSizing
      || !frontend.usesTradingCounterpartyExecutionContextAssignments
      || !frontend.pricingRulesUseDirectExecutionContexts
      || !frontend.usesPricingRuleContextBuilder
      || !frontend.usesVerticalPricingRuleContextLayout
      || !frontend.suppressesDuplicatePricingContextClear
      || !frontend.usesHumanReadablePricingContextCandidates
      || !frontend.usesMutedPricingContextBricks
      || !frontend.avoidsTradingCounterpartyCodeAutoSelect
      || !frontend.usesSynchronizedContextIcons
      || !frontend.supportsRequiredCounterpartyTypes
      || !frontend.supportsRequiredCounterpartyCodeTypes
      || !frontend.usesExplicitTooltipLayer
      || !frontend.usesUnifiedIconCursor
      || !frontend.usesLocalMaterialSymbols
      || frontend.explicitTooltipCount < 1
      || !frontend.usesExplicitTradeIdCopy
      || !frontend.usesLocalTradeIdCopyFeedback
      || !frontend.usesServicingLocationConstraints
      || !frontend.usesServicingLocationIdSort
      || !frontend.usesAccountingSystemTextLimits
      || !frontend.usesAccountingSystemIdSort
      || !frontend.usesExecutionSystemTextLimits
      || !frontend.usesExecutionSystemIdSort
      || !frontend.usesGracefulWindowsShutdown
      || !frontend.usesInlineExecutionContextEditor
      || !frontend.usesReferenceLabelsInExecutionContexts
      || !frontend.usesExecutionContextNames
      || !frontend.usesExecutionContextUsage
      || !frontend.usesExecutionContextColumnWidths
      || !frontend.usesExecutionContextHeaderFiltersAndSort
      || !frontend.usesConciseIntegerIdHeaders
      || !frontend.usesHumanReadablePricingRuleContexts
      || !frontend.usesLocalBootstrapAndTabulator
      || !frontend.usesBootstrapMarketPulse
      || !frontend.usesTabulatorMarketPulseGrids
      || !frontend.usesCompactStaticMarketStreamColumns
      || !frontend.usesMarketPulseRoute
      || !frontend.usesCcyOptionLimits
      || !frontend.usesCompactCcyOptionColumns
      || !frontend.usesCompactCcyPairOptionColumns
      || !frontend.usesCurrencySettingsRelatedDrilldowns
      || !frontend.usesUnifiedActionsColumnWidth
      || !frontend.usesUnifiedFilterFocus
      || !frontend.disablesTabulatorColumnMoving
      || !frontend.disablesTabulatorColumnResizing
      || !frontend.usesInlineMarketPulseEditors
      || !frontend.preservesMarketReferenceEditorsDuringQuoteUpdates
      || !frontend.usesSemanticMarketCommands
      || !frontend.usesSeparatedDialogActions
      || !frontend.avoidsDoubleTabbedPageDividers
      || !frontend.usesLargeClientFxDealsTabulator
      || !frontend.usesClientFxDealsDataTools
      || !frontend.usesClientFxDealsVerticalGridlines
      || !frontend.usesClientFxDealsFixedHeaders
      || !frontend.removesLegacyFxPositionBlotter
      || !frontend.usesFxPositionExposureDates
      || !frontend.usesFxPositionTradeAttributes
      || !frontend.removesFxPositionTradeTypeIndicators
      || !frontend.usesFxPositionTradeTypeChips
      || !frontend.removesFxPositionDemoDeleteActions
      || !frontend.usesDemoTradeReset
      || !frontend.supportsLargeFxPositionAmounts
      || !frontend.usesFxPositionMarketPulseBrand
      || !frontend.usesFxPositionHedgeDealTerminology
      || !frontend.usesStandaloneToolbarCommands
      || !frontend.keepsSpecialFxPositionTradesVisuallyNeutral
      || !frontend.usesCentralTabulatorColumnSizing
      || !frontend.usesUnifiedBootstrapWorkspaceStyle
      || !frontend.usesMarketVerticalGridlines
      || !frontend.usesReferenceDataColumnFilters
      || !frontend.usesFluidReferenceDataTables
      || !frontend.usesFluidPricingContextTable
      || !frontend.usesFluidPricingRulesTable
      || !frontend.usesPricingRulesHeaderLayout
      || !frontend.usesExecutionContextRoute
      || !frontend.usesReferenceDataExecutionContextDrilldown
      || !frontend.usesExecutionContextTradingCounterpartyDrilldown
      || !frontend.usesBootstrapReferenceDataControls
      || !frontend.usesUniformReferenceDataGrid
      || !frontend.usesHoverTabWithoutBottomBorder
      || !frontend.usesUnifiedTableHeaderAndSortContract
      || !frontend.usesUnifiedTableRowInteractionContract
      || !frontend.separatesUsersFromTradingCounterpartyTabs
      || !frontend.usesUnifiedDataGridLineSystem
      || !frontend.usesOwnedRoundedTableFrames
      || !frontend.usesCentralWorkbenchDesignContract
      || !frontend.usesUnifiedPageHeaderSeparation
      || !frontend.usesSingleMarketOuterEdge
      || !frontend.usesSingleClientDealsOuterEdge
      || !frontend.avoidsMarketScrollbarGutter
      || !frontend.usesZoomSafeMarketHeight
      || frontend.containsFrontendQuoteGenerator
      || !simulator.startedRunning
      || !simulator.refreshedRunning
      || simulator.stoppedRunning
      || simulator.startedQuote.bid !== 1.122
      || simulator.startedQuote.offer < simulator.startedQuote.bid
      || simulator.upperBoundaryQuote.bid !== 1.125
      || simulator.returnedQuote.bid !== 1.122
      || apiAndMigration.demoTradeReset.invalidStatus !== 400
      || apiAndMigration.demoTradeReset.invalidCode
        !== "INVALID_DEMO_TRADE_RESET_CONFIRMATION"
      || apiAndMigration.demoTradeReset.status !== 200
      || !(apiAndMigration.demoTradeReset.removedTrades > 0)
      || !(apiAndMigration.demoTradeReset.removedPositionManagementStates > 0)
      || !(apiAndMigration.demoTradeReset.removedPositionManagementTransitions > 0)
      || !(apiAndMigration.demoTradeReset.removedBatches > 0)
      || apiAndMigration.demoTradeReset.generationProcess?.running !== false
      || apiAndMigration.demoTradeReset.generationProcess?.generatedDealCount !== 0
      || apiAndMigration.demoTradeReset.generationProcess?.lastGeneratedTradeId !== null
      || !apiAndMigration.demoTradeReset.tradeReadsEmpty
      || !apiAndMigration.demoTradeReset.tradeTablesEmpty
      || !apiAndMigration.demoTradeReset.referenceDataPreserved
      || !apiAndMigration.demoTradeReset.deleteTriggersRestored
      || !apiAndMigration.demoTradeReset.tradeSequencesCleared
      || apiAndMigration.demoTradeReset.foreignKeyViolations !== 0
      || apiAndMigration.tables.join(",") !== expectedTables.join(",")
      || !apiAndMigration.ccyOptionsConstraintMigrated
      || !apiAndMigration.ccyPairOptionsConstraintMigrated
      || !apiAndMigration.executionSystemConstraintMigrated
      || !apiAndMigration.tradingCounterpartyConstraintsMigrated
      || !apiAndMigration.userConstraintsMigrated
      || apiAndMigration.pairColumns.some(column => ["bid_min", "spread", "bid_max"].includes(column))
      || apiAndMigration.pairForeignKeys !== 2
      || apiAndMigration.servicingLocationColumns.join(",") !== "servicing_location_id,name,region,location_type,is_active"
      || apiAndMigration.servicingLocations.count !== 6
      || apiAndMigration.servicingLocations.location002ContextCount !== 3
      || apiAndMigration.accountingSystemColumns.join(",") !== "accounting_system_id,name,is_active"
      || apiAndMigration.accountingSystems.count !== 2
      || apiAndMigration.accountingSystems.afinaContextCount !== 3
      || apiAndMigration.executionSystemColumns.join(",") !== "execution_system_id,name,pricing_mode,is_active"
      || apiAndMigration.executionSystems.count !== 3
      || apiAndMigration.executionSystems.clickTradeContextCount !== 2
      || apiAndMigration.executionContextColumns.join(",") !== "execution_context_id,servicing_location_id,accounting_system_id,execution_system_id,default_position_management_mode,auto_hedging_admission_mode"
      || apiAndMigration.executionContextIdType !== "INTEGER"
      || apiAndMigration.executionContextForeignKeys.length !== 3
      || !apiAndMigration.executionContextForeignKeys.every(foreignKey => foreignKey.onDelete === "RESTRICT")
      || !["servicing_locations", "accounting_systems", "execution_systems"].every(referencedTable =>
        apiAndMigration.executionContextForeignKeys.some(foreignKey => foreignKey.referencedTable === referencedTable)
      )
      || apiAndMigration.executionContexts.count !== 5
      || !apiAndMigration.executionContexts.migratedIdsAreIntegers
      || !apiAndMigration.executionContexts.migratedModesUseSafeManualDefault
      || !Number.isInteger(apiAndMigration.executionContexts.createdId)
      || apiAndMigration.executionContexts.createdId <= 0
      || apiAndMigration.executionContexts.createdAccountingSystemId !== "NOT_APPLICABLE"
      || apiAndMigration.executionContexts.createdDefaultPositionManagementMode !== "MANUAL"
      || apiAndMigration.executionContexts.updatedId !== apiAndMigration.executionContexts.createdId
      || apiAndMigration.executionContexts.updatedDefaultPositionManagementMode !== "MANUAL"
      || apiAndMigration.executionContexts.usageAfterCreate !== 1
      || apiAndMigration.executionContexts.usageAfterDelete !== 0
      || apiAndMigration.tradingCounterpartyColumns.join(",") !== "counterparty_id,counterparty_name,is_active"
      || apiAndMigration.externalCounterpartyColumns.join(",")
        !== "counterparty_id,counterparty_code,counterparty_code_type,external_counterparty_kind"
      || apiAndMigration.internalUnitColumns.join(",") !== "counterparty_id,unit_code,unit_type"
      || apiAndMigration.tradingCounterpartyRoleColumns.join(",") !== "counterparty_id,role_code"
      || apiAndMigration.userColumns.join(",") !== "user_id,user_code,first_name,last_name,user_role,is_active"
      || apiAndMigration.uiColorTokens.count !== 99
      || apiAndMigration.uiColorTokens.columns.join(",")
        !== "token_code,palette_family,shade,color_value,display_order,updated_at"
      || apiAndMigration.uiColorTokens.blue500?.color_value !== "#0D6EFD"
      || apiAndMigration.counterpartyExecutionContextTable.status !== 200
      || apiAndMigration.counterpartyExecutionContextTable.columns.join(",")
        !== "counterparty_id,execution_context_id"
      || apiAndMigration.counterpartyExecutionContextTable.foreignKeys.length !== 2
      || !apiAndMigration.counterpartyExecutionContextTable.foreignKeys.some(foreignKey =>
        foreignKey.referencedTable === "trading_counterparties"
        && foreignKey.onUpdate === "RESTRICT"
        && foreignKey.onDelete === "CASCADE"
      )
      || !apiAndMigration.counterpartyExecutionContextTable.foreignKeys.some(foreignKey =>
        foreignKey.referencedTable === "execution_contexts"
        && foreignKey.onUpdate === "RESTRICT"
        && foreignKey.onDelete === "RESTRICT"
      )
      || !apiAndMigration.counterpartyExecutionContextTable.createSql
        .includes("PRIMARY KEY (counterparty_id, execution_context_id)")
      || apiAndMigration.counterpartyExecutionContextTable.rowCount !== 6
      || apiAndMigration.counterpartyExecutionContextMigration.client1Status !== 200
      || apiAndMigration.counterpartyExecutionContextMigration.client1Assignments.length !== 3
      || !apiAndMigration.counterpartyExecutionContextMigration.client1Assignments.every(context =>
        context.pricingRulesCount === 1
      )
      || apiAndMigration.counterpartyExecutionContextMigration.client2Status !== 200
      || apiAndMigration.counterpartyExecutionContextMigration.client2Assignments.length !== 2
      || !apiAndMigration.counterpartyExecutionContextMigration.client2Assignments.some(context =>
        context.servicingLocationId === "002"
        && context.accountingSystemId === "AFINA"
        && context.executionSystemId === "CLICK_TRADE_EFX"
        && context.pricingRulesCount === 0
      )
      || !apiAndMigration.counterpartyExecutionContextMigration.client2Assignments.some(context =>
        context.servicingLocationId === "1234"
        && context.accountingSystemId === "AFINA"
        && context.executionSystemId === "RFQ"
        && context.pricingRulesCount === 1
      )
      || apiAndMigration.counterpartyExecutionContextMigration.missingCounterpartyStatus !== 404
      || apiAndMigration.counterpartyExecutionContextMigration.missingCounterpartyCode
        !== "TRADING_COUNTERPARTY_NOT_FOUND"
      || apiAndMigration.executionContexts.assignedCounterpartyCounts
        .reduce((total, context) => total + context.assignedCounterpartyCount, 0) !== 6
      || !apiAndMigration.executionContexts.assignedCounterpartyCounts.every(context =>
        Number.isInteger(context.assignedCounterpartyCount)
        && context.assignedCounterpartyCount >= 0
      )
      || apiAndMigration.counterpartyExecutionContextLifecycle.attachStatus !== 200
      || apiAndMigration.counterpartyExecutionContextLifecycle.attached.length !== 2
      || apiAndMigration.counterpartyExecutionContextLifecycle.idempotentAttachStatus !== 200
      || apiAndMigration.counterpartyExecutionContextLifecycle.idempotentAttached.length !== 2
      || apiAndMigration.counterpartyExecutionContextLifecycle.invalidBodyStatus !== 400
      || apiAndMigration.counterpartyExecutionContextLifecycle.invalidBodyCode
        !== "INVALID_EXECUTION_CONTEXT_ASSIGNMENTS"
      || apiAndMigration.counterpartyExecutionContextLifecycle.atomicFailureStatus !== 404
      || apiAndMigration.counterpartyExecutionContextLifecycle.atomicFailureCode
        !== "EXECUTION_CONTEXT_NOT_FOUND"
      || apiAndMigration.counterpartyExecutionContextLifecycle.assignmentsAfterAtomicFailure.length !== 2
      || apiAndMigration.counterpartyExecutionContextLifecycle.assignmentsAfterAtomicFailure.some(context =>
        context.executionContextId === apiAndMigration.counterpartyExecutionContextLifecycle
          .singleAttached?.executionContextId
      )
      || apiAndMigration.counterpartyExecutionContextLifecycle.singleAttachStatus !== 200
      || apiAndMigration.counterpartyExecutionContextLifecycle.singleAttached?.pricingRulesCount !== 0
      || apiAndMigration.counterpartyExecutionContextLifecycle.singleDetachStatus !== 204
      || apiAndMigration.counterpartyExecutionContextLifecycle.idempotentDetachStatus !== 204
      || apiAndMigration.counterpartyExecutionContextLifecycle.assignmentsAfterDetach.length !== 2
      || apiAndMigration.counterpartyExecutionContextLifecycle.blockedDetachStatus !== 409
      || apiAndMigration.counterpartyExecutionContextLifecycle.blockedDetachCode
        !== "COUNTERPARTY_EXECUTION_CONTEXT_IN_USE"
      || apiAndMigration.counterpartyExecutionContextLifecycle.detachAfterRuleDeleteStatus !== 204
      || apiAndMigration.pricingRuleColumns.join(",") !== "pricing_rule_id,counterparty_id,execution_context_id,ccy_pair_code,margin_percent,position_management_mode_override"
      || apiAndMigration.pricingRuleExecutionContextIdType !== "INTEGER"
      || apiAndMigration.pricingRuleForeignKeys.length !== 3
      || !apiAndMigration.pricingRuleForeignKeys.every(foreignKey => foreignKey.onUpdate === "RESTRICT" && foreignKey.onDelete === "RESTRICT")
      || !["trading_counterparties", "execution_contexts", "ccy_pair_options"].every(referencedTable =>
        apiAndMigration.pricingRuleForeignKeys.some(foreignKey => foreignKey.referencedTable === referencedTable)
      )
      || !apiAndMigration.pricingRules.migratedOverridesAreNull
      || !apiAndMigration.pricingRules.migratedEffectiveModesUseSafeManualDefault
      || apiAndMigration.pricingRules.createdPositionManagementModeOverride !== null
      || apiAndMigration.pricingRules.createdEffectivePositionManagementMode !== "MANUAL"
      || apiAndMigration.pricingRules.updatedPositionManagementModeOverride !== null
      || apiAndMigration.clientDealGenerationProcessSettingsColumns.join(",")
        !== "settings_id,min_interval_seconds,max_interval_seconds,min_deals_per_cycle,max_deals_per_cycle"
      || apiAndMigration.clientDealGenerationProcessSettingsRows.length !== 1
      || apiAndMigration.clientDealGenerationProcessSettingsRows[0]?.settings_id !== 1
      || apiAndMigration.clientDealGenerationProcessSettingsRows[0]?.min_interval_seconds !== 1
      || apiAndMigration.clientDealGenerationProcessSettingsRows[0]?.max_interval_seconds !== 3
      || apiAndMigration.clientDealGenerationProcessSettingsRows[0]?.min_deals_per_cycle !== 3
      || apiAndMigration.clientDealGenerationProcessSettingsRows[0]?.max_deals_per_cycle !== 7
      || apiAndMigration.clientDealGenerationSettingsColumns.join(",") !== "pricing_rule_id,min_base_ccy_amount_minor,max_base_ccy_amount_minor,base_ccy_amount_step_minor,base_ccy_fraction_digits,buy_probability_percent,is_active"
      || apiAndMigration.clientDealGenerationSettingsForeignKeys.length !== 1
      || apiAndMigration.clientDealGenerationSettingsForeignKeys[0]?.referencedTable !== "pricing_rules"
      || apiAndMigration.clientDealGenerationSettingsForeignKeys[0]?.onUpdate !== "RESTRICT"
      || apiAndMigration.clientDealGenerationSettingsForeignKeys[0]?.onDelete !== "CASCADE"
      || apiAndMigration.clientDealGenerationSettings.count !== 2
      || !apiAndMigration.clientDealGenerationSettings.allClientRules
      || !apiAndMigration.clientDealGenerationSettings.allAutoPricedRules
      || apiAndMigration.clientDealGeneration.settingsStatus !== 200
      || apiAndMigration.clientDealGeneration.settingsCount !== 2
      || !apiAndMigration.clientDealGeneration.allClientRules
      || !apiAndMigration.clientDealGeneration.allAutoPricedRules
      || !apiAndMigration.clientDealGeneration.allAmountsUseStoredMinorUnits
      || apiAndMigration.clientDealGeneration.configuredActiveCount !== 1
      || apiAndMigration.clientDealGeneration.invalidSettingsStatus !== 400
      || apiAndMigration.clientDealGeneration.generatedStatus !== 201
      || !Number.isInteger(apiAndMigration.clientDealGeneration.generatedTradeId)
      || apiAndMigration.clientDealGeneration.generatedPricingRuleId
        !== apiAndMigration.clientDealGeneration.expectedPricingRuleId
      || apiAndMigration.clientDealGeneration.generatedSide !== "BUY"
      || apiAndMigration.clientDealGeneration.generatedBaseCcyAmount !== 700000
      || apiAndMigration.clientDealGeneration.generatedTenor !== "TOD"
      || apiAndMigration.clientDealGeneration.generatedMarketPulseStatus !== "STOPPED"
      || !Number.isFinite(apiAndMigration.clientDealGeneration.generatedMarketPulseBid)
      || !Number.isFinite(apiAndMigration.clientDealGeneration.generatedMarketPulseOffer)
      || apiAndMigration.clientDealGeneration.generatedDealtCcyCode
        !== apiAndMigration.clientDealGeneration.expectedDealtCcyCode
      || apiAndMigration.clientDealGeneration.generatedBaseFractionDigits
        !== apiAndMigration.clientDealGeneration.expectedBaseFractionDigits
      || apiAndMigration.clientDealGeneration.generatedQuoteFractionDigits
        !== apiAndMigration.clientDealGeneration.expectedQuoteFractionDigits
      || apiAndMigration.clientDealGeneration.generatedDeleteStatus !== 405
      || apiAndMigration.clientDealGeneration.processSettingsStatus !== 200
      || apiAndMigration.clientDealGeneration.processSettings?.minIntervalSeconds !== 1
      || apiAndMigration.clientDealGeneration.processSettings?.maxIntervalSeconds !== 3
      || apiAndMigration.clientDealGeneration.processSettings?.minDealsPerCycle !== 3
      || apiAndMigration.clientDealGeneration.processSettings?.maxDealsPerCycle !== 7
      || apiAndMigration.clientDealGeneration.invalidProcessSettingsStatus !== 400
      || apiAndMigration.clientDealGeneration.configuredProcessSettingsStatus !== 200
      || apiAndMigration.clientDealGeneration.configuredProcessSettings?.minIntervalSeconds !== 1
      || apiAndMigration.clientDealGeneration.configuredProcessSettings?.maxIntervalSeconds !== 1
      || apiAndMigration.clientDealGeneration.configuredProcessSettings?.minDealsPerCycle !== 3
      || apiAndMigration.clientDealGeneration.configuredProcessSettings?.maxDealsPerCycle !== 3
      || apiAndMigration.clientDealGeneration.processStartStatus !== 200
      || !apiAndMigration.clientDealGeneration.processStartedRunning
      || apiAndMigration.clientDealGeneration.processStartedGeneratedCount !== 0
      || typeof apiAndMigration.clientDealGeneration.processStartedNextCycleAt !== "string"
      || apiAndMigration.clientDealGeneration.processStatus !== 200
      || !apiAndMigration.clientDealGeneration.processStatusRunning
      || apiAndMigration.clientDealGeneration.processGeneratedCount !== 3
      || apiAndMigration.clientDealGeneration.processLastCycleSize !== 3
      || apiAndMigration.clientDealGeneration.processLastCycleGeneratedCount !== 3
      || apiAndMigration.clientDealGeneration.processStopStatus !== 200
      || apiAndMigration.clientDealGeneration.processStoppedRunning
      || apiAndMigration.clientDealGeneration.processGeneratedDeleteStatus !== 405
      || !apiAndMigration.clientDealGeneration.processSettingsRestored
      || apiAndMigration.clientDealGeneration.rejectedProcessStartStatus !== 409
      || apiAndMigration.clientDealGeneration.rejectedProcessStartCode
        !== "CLIENT_DEAL_GENERATION_NOT_CONFIGURED"
      || !apiAndMigration.clientDealGeneration.remainsStoppedWithoutEligibleRules
      || !apiAndMigration.clientDealGeneration.settingsRestored
      || apiAndMigration.fxTradeExposureColumns.join(",") !== "trade_id,execution_timestamp,received_timestamp,trade_type,trade_date,ccy_pair_code,base_ccy_side,dealt_ccy_code,base_ccy_amount_minor,base_ccy_fraction_digits,quote_ccy_amount_minor,quote_ccy_fraction_digits,trade_rate,tenor,base_ccy_value_date,quote_ccy_value_date"
      || apiAndMigration.fxTradeExposureForeignKeys.length !== 2
      || !apiAndMigration.fxTradeExposureCreateSql.includes("'BATCH_BALANCE_TRADE'")
      || !apiAndMigration.fxTradeExposureCreateSql.includes("'BATCH_POSITION_OUT'")
      || !apiAndMigration.fxTradeExposureCreateSql.includes("base_ccy_side = 'FLAT'")
      || apiAndMigration.fxTradeExposures.count !== 1
      || apiAndMigration.fxTradeExposures.migratedRow?.trade_id !== 41
      || apiAndMigration.fxTradeExposures.migratedRow?.trade_type !== "CLIENT_DEAL"
      || apiAndMigration.fxTradeExposures.migratedRow?.base_ccy_side !== "SELL"
      || apiAndMigration.fxTradeExposures.migratedRow?.dealt_ccy_code !== "EUR"
      || apiAndMigration.fxTradeExposures.migratedRow?.base_ccy_amount_minor !== 150000000
      || apiAndMigration.fxTradeExposures.migratedRow?.base_ccy_fraction_digits !== 2
      || apiAndMigration.fxTradeExposures.migratedRow?.quote_ccy_amount_minor !== 168450000
      || apiAndMigration.fxTradeExposures.migratedRow?.quote_ccy_fraction_digits !== 2
      || apiAndMigration.fxTradeExposures.migratedRow?.tenor !== "TOM"
      || apiAndMigration.fxTradePositionManagement.status !== 200
      || apiAndMigration.fxTradePositionManagementColumns.join(",")
        !== "trade_id,trade_type,initial_position_management_mode,current_position_management_mode,created_at,updated_at"
      || apiAndMigration.fxTradePositionManagementForeignKeys.length !== 2
      || !apiAndMigration.fxTradePositionManagementForeignKeys.every(foreignKey =>
        foreignKey.referencedTable === "fx_trade_exposure"
        && foreignKey.onUpdate === "RESTRICT"
        && foreignKey.onDelete === "CASCADE"
      )
      || apiAndMigration.fxTradePositionManagementForeignKeys
        .map(foreignKey => `${foreignKey.from}:${foreignKey.referencedColumn}`).join(",")
        !== "trade_id:trade_id,trade_type:trade_type"
      || !apiAndMigration.fxTradePositionManagementCreateSql
        .includes("initial_position_management_mode IN ('MANUAL', 'AUTO')")
      || !apiAndMigration.fxTradePositionManagementCreateSql
        .includes("current_position_management_mode IN ('MANUAL', 'AUTO')")
      || apiAndMigration.fxTradePositionManagement.count !== 1
      || apiAndMigration.fxTradePositionManagement.count
        !== apiAndMigration.fxTradeExposures.count
      || apiAndMigration.fxTradePositionManagement.migratedRow?.trade_id !== 41
      || apiAndMigration.fxTradePositionManagement.migratedRow?.trade_type !== "CLIENT_DEAL"
      || apiAndMigration.fxTradePositionManagement.migratedRow?.initial_position_management_mode
        !== "MANUAL"
      || apiAndMigration.fxTradePositionManagement.migratedRow?.current_position_management_mode
        !== "MANUAL"
      || apiAndMigration.fxTradePositionManagement.projectedInitialMode !== "MANUAL"
      || apiAndMigration.fxTradePositionManagement.projectedCurrentMode !== "MANUAL"
      || apiAndMigration.fxTradePositionManagement.projectedCompatibilityMode !== "MANUAL"
      || apiAndMigration.fxTradePositionManagementTransitions.status !== 200
      || apiAndMigration.fxTradePositionManagementTransitions.initialCount !== 0
      || apiAndMigration.fxTradePositionManagementTransitionColumns.join(",")
        !== "transition_id,trade_id,trade_type,from_position_management_mode,to_position_management_mode,reason_code,transition_source,transitioned_at"
      || apiAndMigration.fxTradePositionManagementTransitionForeignKeys.length !== 2
      || !apiAndMigration.fxTradePositionManagementTransitionForeignKeys.every(foreignKey =>
        foreignKey.referencedTable === "fx_trade_exposure"
        && foreignKey.onUpdate === "RESTRICT"
        && foreignKey.onDelete === "CASCADE"
      )
      || apiAndMigration.fxTradePositionManagementTransitionForeignKeys
        .map(foreignKey => `${foreignKey.from}:${foreignKey.referencedColumn}`).join(",")
        !== "trade_id:trade_id,trade_type:trade_type"
      || !apiAndMigration.fxTradePositionManagementTransitionCreateSql
        .includes("from_position_management_mode = 'MANUAL'")
      || !apiAndMigration.fxTradePositionManagementTransitionCreateSql
        .includes("to_position_management_mode = 'AUTO'")
      || apiAndMigration.fxTradePositionManagementTransitions.sendStatus !== 200
      || apiAndMigration.fxTradePositionManagementTransitions.targetMode !== "AUTO"
      || apiAndMigration.fxTradePositionManagementTransitions.transitionedCount !== 1
      || apiAndMigration.fxTradePositionManagementTransitions.replayStatus !== 200
      || !apiAndMigration.fxTradePositionManagementTransitions.replayed
      || apiAndMigration.fxTradePositionManagementTransitions.replayedCount !== 1
      || apiAndMigration.fxTradePositionManagementTransitions.projectedInitialMode !== "MANUAL"
      || apiAndMigration.fxTradePositionManagementTransitions.projectedCurrentMode !== "AUTO"
      || apiAndMigration.fxTradePositionManagementTransitions.projectedCompatibilityMode !== "AUTO"
      || apiAndMigration.fxTradePositionManagementTransitions.auditRows.length !== 1
      || apiAndMigration.fxTradePositionManagementTransitions.auditRows[0]
        ?.from_position_management_mode !== "MANUAL"
      || apiAndMigration.fxTradePositionManagementTransitions.auditRows[0]
        ?.to_position_management_mode !== "AUTO"
      || apiAndMigration.fxTradePositionManagementTransitions.auditRows[0]?.reason_code
        !== "MANUAL_REVIEW_COMPLETED"
      || apiAndMigration.fxTradePositionManagementTransitions.auditRows[0]?.transition_source
        !== "OPERATOR"
      || apiAndMigration.fxTradeMarketSnapshotColumns.join(",") !== "trade_id,trade_type,market_pulse_stream_status,market_pulse_bid,market_pulse_offer,market_pulse_timestamp"
      || apiAndMigration.fxTradeMarketSnapshotForeignKeys.length !== 2
      || !apiAndMigration.fxTradeMarketSnapshotForeignKeys.every(foreignKey =>
        foreignKey.onUpdate === "RESTRICT"
        && foreignKey.onDelete === "RESTRICT"
        && foreignKey.referencedTable === "fx_trade_exposure"
      )
      || apiAndMigration.fxTradeMarketSnapshots.count !== 0
      || apiAndMigration.clientFxDealColumns.join(",") !== "trade_id,trade_type,counterparty_id,execution_context_id,pricing_rule_id,transfer_rate,analytical_pnl_quote_minor,analytical_pnl_quote_fraction_digits,comment"
      || apiAndMigration.clientFxDealForeignKeys.length !== 7
      || !apiAndMigration.clientFxDealForeignKeys.every(foreignKey => foreignKey.onUpdate === "RESTRICT" && foreignKey.onDelete === "RESTRICT")
      || !["trading_counterparties", "execution_contexts", "pricing_rules", "fx_trade_exposure"].every(referencedTable =>
        apiAndMigration.clientFxDealForeignKeys.some(foreignKey => foreignKey.referencedTable === referencedTable)
      )
      || apiAndMigration.hedgeFxDealColumns.join(",") !== "trade_id,trade_type,request_timestamp,counterparty_id,execution_context_id,pricing_rule_id,transfer_rate,analytical_pnl_quote_minor,analytical_pnl_quote_fraction_digits"
      || apiAndMigration.hedgeFxDealForeignKeys.length !== 7
      || !apiAndMigration.hedgeFxDealForeignKeys.every(foreignKey => foreignKey.onUpdate === "RESTRICT" && foreignKey.onDelete === "RESTRICT")
      || !["trading_counterparties", "execution_contexts", "pricing_rules", "fx_trade_exposure"].every(referencedTable =>
        apiAndMigration.hedgeFxDealForeignKeys.some(foreignKey => foreignKey.referencedTable === referencedTable)
      )
      || apiAndMigration.hedgeQuickModeSettingsColumns.join(",")
        !== "ccy_pair_code,counterparty_id,pricing_rule_id,base_ccy_fraction_digits,small_base_ccy_amount_minor,medium_base_ccy_amount_minor,large_base_ccy_amount_minor,xlarge_base_ccy_amount_minor,is_active,default_tenor"
      || apiAndMigration.hedgeQuickModeSettingsForeignKeys.length !== 5
      || !apiAndMigration.hedgeQuickModeSettingsForeignKeys.every(foreignKey =>
        foreignKey.onUpdate === "RESTRICT"
        && foreignKey.onDelete === "RESTRICT"
        && ["ccy_pair_options", "trading_counterparties", "pricing_rules"].includes(
          foreignKey.referencedTable
        )
      )
      || !apiAndMigration.hedgeQuickModeSettingsCreateSql
        .includes("small_base_ccy_amount_minor < medium_base_ccy_amount_minor")
      || !apiAndMigration.hedgeQuickModeSettingsCreateSql
        .includes("large_base_ccy_amount_minor < xlarge_base_ccy_amount_minor")
      || !apiAndMigration.hedgeQuickModeSettingsCreateSql
        .includes("default_tenor IN ('TOD', 'TOM', 'SPOT')")
      || apiAndMigration.fxTradeBatchColumns.join(",") !== "batch_id,idempotency_key,ccy_pair_code,batch_status,formation_reason_code,formation_reason_details_json,window_opened_at,window_closed_at,created_at,rolled_back_at"
      || apiAndMigration.fxTradeBatchForeignKeys.length !== 1
      || apiAndMigration.fxTradeBatchForeignKeys[0]?.onUpdate !== "RESTRICT"
      || apiAndMigration.fxTradeBatchForeignKeys[0]?.onDelete !== "RESTRICT"
      || apiAndMigration.fxTradeBatchForeignKeys[0]?.referencedTable !== "ccy_pair_options"
      || !apiAndMigration.fxTradeBatchCreateSql.includes("AUTOINCREMENT")
      || apiAndMigration.fxTradeBatches.status !== 200
      || apiAndMigration.fxTradeBatches.count !== 0
      || apiAndMigration.batchBalancingTradeColumns.join(",") !== "batch_id,trade_id,trade_type,member_role"
      || apiAndMigration.batchBalancingTradeForeignKeys.length !== 3
      || !apiAndMigration.batchBalancingTradeForeignKeys.every(foreignKey =>
        foreignKey.onUpdate === "RESTRICT"
        && foreignKey.onDelete === "RESTRICT"
        && ["fx_trade_exposure", "fx_batches"].includes(foreignKey.referencedTable)
      )
      || !/\bCHECK\s*\(\s*member_role\s+IN\s*\(\s*'TRADE'\s*,\s*'BALANCE_TRADE'\s*,\s*'POSITION_OUT'\s*\)\s*\)/i
        .test(apiAndMigration.batchMemberCreateSql)
      || !apiAndMigration.batchMemberCreateSql.includes("trade_type = 'BATCH_BALANCE_TRADE'")
      || !apiAndMigration.batchMemberCreateSql.includes("trade_type = 'BATCH_POSITION_OUT'")
      || apiAndMigration.batchMemberCreateSql.includes("BALANCE_QUOTE_CASH")
      || apiAndMigration.batchBalancingTrades.status !== 200
      || apiAndMigration.batchBalancingTrades.count !== 0
      || apiAndMigration.batchBalanceTradeColumns.map(column => column.name).join(",")
        !== "trade_id,trade_type"
      || !apiAndMigration.batchBalanceTradeColumns
        .find(column => column.name === "trade_id")?.primaryKey
      || apiAndMigration.batchBalanceTradeForeignKeys.length !== 2
      || !apiAndMigration.batchBalanceTradeForeignKeys.every(foreignKey =>
        foreignKey.onUpdate === "RESTRICT"
        && foreignKey.onDelete === "RESTRICT"
        && foreignKey.referencedTable === "fx_trade_exposure"
      )
      || !/\btrade_id\s+INTEGER\s+PRIMARY KEY\b/i
        .test(apiAndMigration.batchBalanceTradeCreateSql)
      || !/\bCHECK\s*\(\s*trade_type\s*=\s*'BATCH_BALANCE_TRADE'\s*\)/i
        .test(apiAndMigration.batchBalanceTradeCreateSql)
      || apiAndMigration.batchBalanceTrades.status !== 200
      || apiAndMigration.batchBalanceTrades.count !== 0
      || apiAndMigration.batchPositionOutputColumns.map(column => column.name).join(",")
        !== "trade_id,trade_type"
      || !apiAndMigration.batchPositionOutputColumns
        .find(column => column.name === "trade_id")?.primaryKey
      || apiAndMigration.batchPositionOutputForeignKeys.length !== 2
      || !apiAndMigration.batchPositionOutputForeignKeys.every(foreignKey =>
        foreignKey.onUpdate === "RESTRICT"
        && foreignKey.onDelete === "RESTRICT"
        && foreignKey.referencedTable === "fx_trade_exposure"
      )
      || !/\btrade_id\s+INTEGER\s+PRIMARY KEY\b/i
        .test(apiAndMigration.batchPositionOutputCreateSql)
      || !/\bCHECK\s*\(\s*trade_type\s*=\s*'BATCH_POSITION_OUT'\s*\)/i
        .test(apiAndMigration.batchPositionOutputCreateSql)
      || apiAndMigration.batchPositionOutputCreateSql.includes("output_role")
      || apiAndMigration.batchPositionOutputs.status !== 200
      || apiAndMigration.batchPositionOutputs.count !== 0
      || apiAndMigration.batchQuoteCashMemberColumns.join(",")
        !== "batch_id,quote_ccy_code,quote_balance_contribution_minor,quote_ccy_fraction_digits,quote_ccy_value_date,created_at"
      || apiAndMigration.batchQuoteCashMemberForeignKeys.length !== 2
      || !apiAndMigration.batchQuoteCashMemberForeignKeys.every(foreignKey =>
        foreignKey.onUpdate === "RESTRICT"
        && foreignKey.onDelete === "RESTRICT"
        && ["fx_batches", "ccy_options"].includes(foreignKey.referencedTable)
      )
      || apiAndMigration.batchQuoteCashMemberColumns.includes("batch_status")
      || !/\bbatch_id\s+INTEGER\s+PRIMARY KEY\b/i
        .test(apiAndMigration.batchQuoteCashMemberCreateSql)
      || apiAndMigration.batchQuoteCashMembers.status !== 200
      || apiAndMigration.batchQuoteCashMembers.count !== 0
      || apiAndMigration.batchBalancingFlow.createStatus !== 201
      || apiAndMigration.batchBalancingFlow.batchId !== 1
      || apiAndMigration.batchBalancingFlow.batchPairId !== 1
      || apiAndMigration.batchBalancingFlow.sourceTradeIds.join(",") !== "41"
      || apiAndMigration.batchBalancingFlow.sourceNetSide !== "SELL"
      || apiAndMigration.batchBalancingFlow.sourceNetBaseCcyAmount !== 1500000
      || apiAndMigration.batchBalancingFlow.sourceNetBaseCcyAmountMinor !== 150000000
      || apiAndMigration.batchBalancingFlow.sourceNetBaseCcyFractionDigits !== 2
      || apiAndMigration.batchBalancingFlow.sourceNetTransferQuoteAmountMinor !== 168450000
      || apiAndMigration.batchBalancingFlow.sourceNetTransferQuoteFractionDigits !== 2
      || apiAndMigration.batchBalancingFlow.netQuoteCcyAmountMinorBeforeCash !== 0
      || apiAndMigration.batchBalancingFlow.quoteCashOut?.outputType
        !== "BATCH_QUOTE_CASH_OUT"
      || apiAndMigration.batchBalancingFlow.quoteCashOut
        ?.balanceContributionMinor !== 0
      || apiAndMigration.batchBalancingFlow.roundingResidualQuoteAmountMinor !== 0
      || apiAndMigration.batchBalancingFlow.historyStatus !== 200
      || apiAndMigration.batchBalancingFlow.historyCount !== 1
      || apiAndMigration.batchBalancingFlow.historyFields.join(",")
        !== "batchId,batchStatus,ccyPairCode,formationReasonCode,formationReasonDescription,formationReasonDetails,formationReasonDetailsJson,formedAt,rolledBackAt"
      || !apiAndMigration.batchBalancingFlow.historyHidesIdempotencyKey
      || apiAndMigration.batchBalancingFlow.formationAuditStatus !== 200
      || apiAndMigration.batchBalancingFlow.formationAuditCount !== 1
      || apiAndMigration.batchBalancingFlow.formationAuditRecord?.batchId
        !== apiAndMigration.batchBalancingFlow.batchId
      || apiAndMigration.batchBalancingFlow.formationAuditRecord
        ?.formationReasonCode !== "MANUAL_SELECTION"
      || apiAndMigration.batchBalancingFlow.formationAuditRecord
        ?.sourceTradeCount !== 1
      || apiAndMigration.batchBalancingFlow.formationAuditRecord
        ?.batchStatus !== "FORMED"
      || apiAndMigration.batchBalancingFlow.formationAuditRecord
        ?.windowOpenedAt !== null
      || apiAndMigration.batchBalancingFlow.formationAuditRecord
        ?.windowClosedAt !== null
      || apiAndMigration.batchBalancingFlow.formationAuditRecord
        ?.windowDurationMs !== null
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
        .test(String(
          apiAndMigration.batchBalancingFlow.formationAuditRecord
            ?.formedAt || ""
        ))
      || apiAndMigration.batchBalancingFlow.formationAuditRecord
        ?.batchingKey?.ccyPairCode !== "EUR_USD"
      || apiAndMigration.batchBalancingFlow.formationAuditRecord
        ?.batchingKey?.tradeDate !== "2026-07-15"
      || apiAndMigration.batchBalancingFlow.formationAuditRecord
        ?.batchingKey?.tenor !== "TOM"
      || apiAndMigration.batchBalancingFlow.formationAuditRecord
        ?.batchingKey?.baseCcyValueDate !== "2026-07-16"
      || apiAndMigration.batchBalancingFlow.formationAuditRecord
        ?.batchingKey?.quoteCcyValueDate !== "2026-07-16"
      || apiAndMigration.batchBalancingFlow.formationAuditRecord
        ?.batchingKey?.baseCcyFractionDigits !== 2
      || apiAndMigration.batchBalancingFlow.formationAuditRecord
        ?.batchingKey?.quoteCcyFractionDigits !== 2
      || apiAndMigration.batchBalancingFlow.formationAuditAfterRollbackStatus
        !== 200
      || apiAndMigration.batchBalancingFlow.formationAuditRolledBackRecord
        ?.batchStatus !== "ROLLED_BACK"
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
        .test(String(
          apiAndMigration.batchBalancingFlow.formationAuditRolledBackRecord
            ?.rolledBackAt || ""
        ))
      || apiAndMigration.batchBalancingFlow.formationAuditRolledBackRecord
        ?.formedAt
        !== apiAndMigration.batchBalancingFlow.formationAuditRecord
          ?.formedAt
      || apiAndMigration.batchBalancingFlow.rejectedSplitModeStatus !== 400
      || apiAndMigration.batchBalancingFlow.rejectedSplitModeCode
        !== "INVALID_BATCH_COMMAND"
      || apiAndMigration.batchBalancingFlow.createdTypes.join(",") !== "BATCH_BALANCE_TRADE,BATCH_POSITION_OUT"
      || apiAndMigration.batchBalancingFlow.createdSides.join(",") !== "BUY,SELL"
      || apiAndMigration.batchBalancingFlow.createdAmounts.join(",") !== "1500000,1500000"
      || apiAndMigration.batchBalancingFlow.createdDealtCcyCodes.join(",") !== "EUR,EUR"
      || apiAndMigration.batchBalancingFlow.createdBaseAmountMinors.join(",") !== "150000000,150000000"
      || apiAndMigration.batchBalancingFlow.createdBaseFractionDigits.join(",") !== "2,2"
      || apiAndMigration.batchBalancingFlow.createdQuoteAmountMinors.join(",") !== "168450000,168450000"
      || apiAndMigration.batchBalancingFlow.createdQuoteFractionDigits.join(",") !== "2,2"
      || apiAndMigration.batchBalancingFlow.storedCount !== 2
      || apiAndMigration.batchBalancingFlow.detailStatus !== 200
      || apiAndMigration.batchBalancingFlow.detailCurrencyPair !== "EUR/USD"
      || apiAndMigration.batchBalancingFlow.detailBatchingKey?.ccyPairCode !== "EUR_USD"
      || apiAndMigration.batchBalancingFlow.detailBatchingKey?.tradeDate !== "2026-07-15"
      || apiAndMigration.batchBalancingFlow.detailBatchingKey?.tenor !== "TOM"
      || apiAndMigration.batchBalancingFlow.detailBatchingKey?.baseCcyValueDate !== "2026-07-16"
      || apiAndMigration.batchBalancingFlow.detailBatchingKey?.quoteCcyValueDate !== "2026-07-16"
      || apiAndMigration.batchBalancingFlow.detailBatchingKey?.baseCcyFractionDigits !== 2
      || apiAndMigration.batchBalancingFlow.detailBatchingKey?.quoteCcyFractionDigits !== 2
      || apiAndMigration.batchBalancingFlow.detailMemberCount !== 2
      || apiAndMigration.batchBalancingFlow.detailOutputCount !== 1
      || apiAndMigration.batchBalancingFlow.detailMemberRoles.join(",")
        !== "TRADE,BALANCE_TRADE"
      || apiAndMigration.batchBalancingFlow.detailOutputRoles.join(",")
        !== "POSITION_OUT"
      || apiAndMigration.batchBalancingFlow.detailCashOutput?.outputType
        !== "BATCH_QUOTE_CASH_OUT"
      || apiAndMigration.batchBalancingFlow.detailCashOutput?.batchId
        !== apiAndMigration.batchBalancingFlow.batchId
      || !apiAndMigration.batchBalancingFlow.detailPnlFieldsPresent
      || !apiAndMigration.batchBalancingFlow.detailContainsAttributedSource
      || !apiAndMigration.batchBalancingFlow.detailTechnicalTradeSemantics
      || !apiAndMigration.batchBalancingFlow.detailBalanceContributionSemantics
      || apiAndMigration.batchBalancingFlow.detailMemberBaseBalanceMinor !== 0
      || apiAndMigration.batchBalancingFlow.detailMemberQuoteBalanceMinor !== 0
      || apiAndMigration.batchBalancingFlow.missingDetailStatus !== 404
      || apiAndMigration.batchBalancingFlow.missingDetailCode !== "FX_BATCH_NOT_FOUND"
      || apiAndMigration.batchBalancingFlow.duplicateSelectionStatus !== 400
      || apiAndMigration.batchBalancingFlow.missingSourceStatus !== 404
      || apiAndMigration.batchBalancingFlow.replayStatus !== 200
      || !apiAndMigration.batchBalancingFlow.replayed
      || apiAndMigration.batchBalancingFlow.replayBatchId
        !== apiAndMigration.batchBalancingFlow.batchId
      || apiAndMigration.batchBalancingFlow.idempotencyConflictStatus !== 409
      || apiAndMigration.batchBalancingFlow.storedCountAfterReplay !== 2
      || !apiAndMigration.batchBalancingFlow.sourceVisibleBeforeBatch
      || !apiAndMigration.batchBalancingFlow.sourceHiddenAfterBatch
      || !apiAndMigration.batchBalancingFlow.balanceHiddenAfterBatch
      || !apiAndMigration.batchBalancingFlow.outputVisibleAfterBatch
      || apiAndMigration.batchBalancingFlow.rollbackStatus !== 200
      || apiAndMigration.batchBalancingFlow.rolledBackBatchStatus !== "ROLLED_BACK"
      || !apiAndMigration.batchBalancingFlow.rolledBackAtRecorded
      || !apiAndMigration.batchBalancingFlow.historyShowsRolledBack
      || !apiAndMigration.batchBalancingFlow.sourceVisibleAfterRollback
      || !apiAndMigration.batchBalancingFlow.balanceVisibleAfterRollback
      || !apiAndMigration.batchBalancingFlow.originalTechnicalTradesPreservedAfterRollback
      || !apiAndMigration.batchBalancingFlow.positionPreservedByRollback
      || apiAndMigration.batchBalancingFlow.rollbackReplayStatus !== 200
      || !apiAndMigration.batchBalancingFlow.rollbackReplayed
      || !apiAndMigration.batchBalancingFlow.rolledBackTradeImmutable
      || apiAndMigration.batchBalancingFlow.reformedStatus !== 201
      || apiAndMigration.batchBalancingFlow.reformedBatchId
        === apiAndMigration.batchBalancingFlow.batchId
      || !apiAndMigration.batchBalancingFlow.sourceHiddenAfterReformedBatch
      || !apiAndMigration.batchBalancingFlow.reformedBatchRemainsFormed
      || !apiAndMigration.batchBalancingFlow.balanceTradeHiddenAfterReformedBatch
      || !apiAndMigration.batchBalancingFlow.positionOutVisibleAfterReformedBatch
      || !apiAndMigration.batchBalancingFlow.positionPreservedAfterReformedBatch
      || !apiAndMigration.batchBalancingFlow.technicalTradeAuditRowsRetained
      || apiAndMigration.flatBatchFlow.parentCreateStatus !== 201
      || !Number.isInteger(apiAndMigration.flatBatchFlow.parentPositionOutTradeId)
      || !apiAndMigration.flatBatchFlow.parentPositionOutVisible
      || apiAndMigration.flatBatchFlow.createStatus !== 201
      || apiAndMigration.flatBatchFlow.batchStatus !== "FORMED"
      || apiAndMigration.flatBatchFlow.sourceTradeIds.length !== 2
      || apiAndMigration.flatBatchFlow.sourceNetSide !== "FLAT"
      || apiAndMigration.flatBatchFlow.sourceNetBaseCcyAmountMinor !== 0
      || apiAndMigration.flatBatchFlow.sourceNetTransferQuoteAmountMinor !== 100000
      || apiAndMigration.flatBatchFlow.netQuoteCcyAmountMinorBeforeCash !== 100000
      || apiAndMigration.flatBatchFlow.quoteCashOut?.outputType
        !== "BATCH_QUOTE_CASH_OUT"
      || apiAndMigration.flatBatchFlow.quoteCashOut?.balanceContributionMinor
        !== -100000
      || apiAndMigration.flatBatchFlow.createdTrades.length !== 0
      || apiAndMigration.flatBatchFlow.members.length !== 2
      || !apiAndMigration.flatBatchFlow.members.every(
        member => member.memberRole === "TRADE"
      )
      || apiAndMigration.flatBatchFlow.members
        .map(member => member.tradeType)
        .sort()
        .join(",") !== "BATCH_POSITION_OUT,CLIENT_DEAL"
      || apiAndMigration.flatBatchFlow.outputs.length !== 0
      || apiAndMigration.flatBatchFlow.detailStatus !== 200
      || apiAndMigration.flatBatchFlow.detailMembers.length !== 2
      || apiAndMigration.flatBatchFlow.detailOutputs.length !== 0
      || apiAndMigration.flatBatchFlow.detailCashOutput?.outputType
        !== "BATCH_QUOTE_CASH_OUT"
      || apiAndMigration.flatBatchFlow.detailCashOutput
        ?.balanceContributionMinor !== -100000
      || apiAndMigration.flatBatchFlow.detailMemberBaseBalanceMinor !== 0
      || apiAndMigration.flatBatchFlow.detailMemberQuoteBalanceMinor !== 100000
      || !apiAndMigration.flatBatchFlow.detailPositionOutPreservesOrigin
      || !apiAndMigration.flatBatchFlow.sourcesVisibleBefore
      || !apiAndMigration.flatBatchFlow.sourcesHiddenAfter
      || apiAndMigration.flatBatchFlow.rollbackStatus !== 200
      || apiAndMigration.flatBatchFlow.rolledBackBatchStatus !== "ROLLED_BACK"
      || !apiAndMigration.flatBatchFlow.sourcesVisibleAfterRollback
      || !apiAndMigration.flatBatchFlow.immutable
      || apiAndMigration.flatBatchFlow.foreignKeyViolations !== 0
      || !Number.isInteger(apiAndMigration.balanceTradeSourceFlow.parentBalanceTradeId)
      || !apiAndMigration.balanceTradeSourceFlow.hiddenWhileParentFormed
      || !apiAndMigration.balanceTradeSourceFlow.unavailableWhileParentFormed
      || apiAndMigration.balanceTradeSourceFlow.activeRebatchStatus !== 404
      || apiAndMigration.balanceTradeSourceFlow.activeRebatchCode
        !== "BATCH_SOURCE_TRADE_NOT_FOUND"
      || !apiAndMigration.balanceTradeSourceFlow.activeMembershipConstraintEnforced
      || apiAndMigration.balanceTradeSourceFlow.parentRollbackStatus !== 200
      || !apiAndMigration.balanceTradeSourceFlow.visibleAfterParentRollback
      || !apiAndMigration.balanceTradeSourceFlow.availableAfterParentRollback
      || apiAndMigration.balanceTradeSourceFlow.createStatus !== 201
      || apiAndMigration.balanceTradeSourceFlow.sourceTradeIds.join(",")
        !== String(apiAndMigration.balanceTradeSourceFlow.parentBalanceTradeId)
      || !apiAndMigration.balanceTradeSourceFlow.reusedAsOrdinaryTrade
      || !apiAndMigration.balanceTradeSourceFlow.hiddenAfterBatching
      || !apiAndMigration.balanceTradeSourceFlow.listedAsConsumed
      || apiAndMigration.hedgeFxDeals.status !== 200
      || apiAndMigration.hedgeFxDeals.count !== 0
      || apiAndMigration.hedgeFxDeals.eligiblePricingRulesStatus !== 200
      || apiAndMigration.hedgeFxDeals.eligiblePricingRulesCount !== 1
      || !apiAndMigration.hedgeFxDeals.allHedgeCounterpartyRules
      || !apiAndMigration.hedgeFxDeals.excludesDealerApprovedRules
      || apiAndMigration.hedgeFxDeals.autoPriced.pricingRuleCreateStatus !== 201
      || !Number.isInteger(
        apiAndMigration.hedgeFxDeals.autoPriced.pricingRuleId
      )
      || apiAndMigration.hedgeFxDeals.autoPriced.eligiblePricingRulesStatus
        !== 200
      || apiAndMigration.hedgeFxDeals.autoPriced.eligiblePricingRulesCount
        !== 1
      || !apiAndMigration.hedgeFxDeals.autoPriced
        .allEligibleRulesAreAutoPricedHedgeRules
      || !apiAndMigration.hedgeFxDeals.autoPriced.includesCreatedPricingRule
      || apiAndMigration.hedgeFxDeals.autoPriced.invalidPricingModeStatus
        !== 400
      || apiAndMigration.hedgeFxDeals.autoPriced.invalidPricingModeCode
        !== "INVALID_HEDGE_DEAL_PRICING_MODE"
      || apiAndMigration.hedgeFxDeals.autoPriced.manualEndpointAutoRuleStatus
        !== 400
      || apiAndMigration.hedgeFxDeals.autoPriced.manualEndpointAutoRuleCode
        !== "INVALID_HEDGE_FX_DEAL_REFERENCE"
      || !apiAndMigration.hedgeFxDeals.autoPriced
        .manualEndpointAutoRuleMessage?.includes("DEALER_PRICED")
      || apiAndMigration.hedgeFxDeals.autoPriced.autoEndpointDealerRuleStatus
        !== 400
      || apiAndMigration.hedgeFxDeals.autoPriced.autoEndpointDealerRuleCode
        !== "INVALID_AUTO_PRICED_HEDGE_FX_DEAL_REFERENCE"
      || !apiAndMigration.hedgeFxDeals.autoPriced
        .autoEndpointDealerRuleMessage?.includes("AUTO_PRICED")
      || apiAndMigration.hedgeFxDeals.autoPriced.suppliedTradeRateStatus
        !== 400
      || apiAndMigration.hedgeFxDeals.autoPriced.suppliedTradeRateCode
        !== "INVALID_AUTO_PRICED_HEDGE_FX_DEAL"
      || !apiAndMigration.hedgeFxDeals.autoPriced
        .suppliedTradeRateMessage?.includes("must not be provided")
      || apiAndMigration.hedgeFxDeals.autoPriced.bankSell.status !== 201
      || !Number.isInteger(
        apiAndMigration.hedgeFxDeals.autoPriced.bankSell.tradeId
      )
      || apiAndMigration.hedgeFxDeals.autoPriced.bankSell.counterpartySide
        !== "BUY"
      || !(apiAndMigration.hedgeFxDeals.autoPriced.bankSell.marketBid
        < apiAndMigration.hedgeFxDeals.autoPriced.bankSell.marketOffer)
      || !apiAndMigration.hedgeFxDeals.autoPriced.bankSell.usesBid
      || !apiAndMigration.hedgeFxDeals.autoPriced.bankSell
        .persistedFromSameSnapshot
      || apiAndMigration.hedgeFxDeals.autoPriced.bankBuy.status !== 201
      || !Number.isInteger(
        apiAndMigration.hedgeFxDeals.autoPriced.bankBuy.tradeId
      )
      || apiAndMigration.hedgeFxDeals.autoPriced.bankBuy.counterpartySide
        !== "SELL"
      || !(apiAndMigration.hedgeFxDeals.autoPriced.bankBuy.marketBid
        < apiAndMigration.hedgeFxDeals.autoPriced.bankBuy.marketOffer)
      || !apiAndMigration.hedgeFxDeals.autoPriced.bankBuy.usesOffer
      || !apiAndMigration.hedgeFxDeals.autoPriced.bankBuy
        .persistedFromSameSnapshot
      || apiAndMigration.hedgeFxDeals.quickMode.settingsBeforeCount !== 0
      || apiAndMigration.hedgeFxDeals.quickMode.createSettingsStatus !== 201
      || apiAndMigration.hedgeFxDeals.quickMode.getSettingsStatus !== 200
      || apiAndMigration.hedgeFxDeals.quickMode.configuredPricingRuleId
        !== apiAndMigration.hedgeFxDeals.autoPriced.pricingRuleId
      || apiAndMigration.hedgeFxDeals.quickMode.configuredDefaultTenor !== "TOD"
      || apiAndMigration.hedgeFxDeals.quickMode.configuredPresetCodes.join(",")
        !== "SMALL,MEDIUM,LARGE,XLARGE"
      || apiAndMigration.hedgeFxDeals.quickMode
        .configuredPresetAmounts.join(",")
        !== "5000000.00,20000000.00,50000000.00,100000000.00"
      || apiAndMigration.hedgeFxDeals.quickMode.invalidSettingsStatus !== 400
      || apiAndMigration.hedgeFxDeals.quickMode.invalidSettingsCode
        !== "INVALID_HEDGE_QUICK_MODE_SETTINGS"
      || apiAndMigration.hedgeFxDeals.quickMode.ownedFieldStatus !== 400
      || apiAndMigration.hedgeFxDeals.quickMode.ownedFieldCode
        !== "INVALID_HEDGE_QUICK_MODE_DEAL"
      || apiAndMigration.hedgeFxDeals.quickMode.extraFieldStatus !== 400
      || apiAndMigration.hedgeFxDeals.quickMode.extraFieldCode
        !== "INVALID_HEDGE_QUICK_MODE_DEAL"
      || apiAndMigration.hedgeFxDeals.quickMode.invalidPresetStatus !== 400
      || apiAndMigration.hedgeFxDeals.quickMode.invalidPresetCode
        !== "INVALID_HEDGE_QUICK_MODE_DEAL"
      || apiAndMigration.hedgeFxDeals.quickMode.bankSell.status !== 201
      || !Number.isInteger(
        apiAndMigration.hedgeFxDeals.quickMode.bankSell.tradeId
      )
      || apiAndMigration.hedgeFxDeals.quickMode.bankSell.counterpartySide
        !== "BUY"
      || apiAndMigration.hedgeFxDeals.quickMode.bankSell.baseCcyAmountMinor
        !== 2000000000
      || !apiAndMigration.hedgeFxDeals.quickMode.bankSell.usesBid
      || !apiAndMigration.hedgeFxDeals.quickMode.bankSell
        .persistedFromSameSnapshot
      || apiAndMigration.hedgeFxDeals.quickMode.bankBuy.status !== 201
      || !Number.isInteger(
        apiAndMigration.hedgeFxDeals.quickMode.bankBuy.tradeId
      )
      || apiAndMigration.hedgeFxDeals.quickMode.bankBuy.counterpartySide
        !== "SELL"
      || apiAndMigration.hedgeFxDeals.quickMode.bankBuy.baseCcyAmountMinor
        !== 5000000000
      || !apiAndMigration.hedgeFxDeals.quickMode.bankBuy.usesOffer
      || !apiAndMigration.hedgeFxDeals.quickMode.bankBuy
        .persistedFromSameSnapshot
      || apiAndMigration.hedgeFxDeals.quickMode.disableSettingsStatus !== 200
      || apiAndMigration.hedgeFxDeals.quickMode.disabledDealStatus !== 409
      || apiAndMigration.hedgeFxDeals.quickMode.disabledDealCode
        !== "HEDGE_QUICK_MODE_DISABLED"
      || apiAndMigration.hedgeFxDeals.quickMode.deleteSettingsStatus !== 200
      || apiAndMigration.hedgeFxDeals.quickMode.missingSettingsStatus !== 404
      || apiAndMigration.hedgeFxDeals.quickMode.restoreSettingsStatus !== 201
      || apiAndMigration.hedgeFxDeals.quickMode.restoredSettingsCount !== 1
      || apiAndMigration.hedgeFxDeals.quickMode.restoredAvailable !== true
      || apiAndMigration.hedgeFxDeals.rejectedDealerApprovedRuleStatus !== 400
      || apiAndMigration.hedgeFxDeals.dealerApprovedRuleDeleteStatus !== 204
      || apiAndMigration.hedgeFxDeals.executionContextAssignmentStatus !== 200
      || apiAndMigration.hedgeFxDeals.createdStatus !== 201
      || !Number.isInteger(apiAndMigration.hedgeFxDeals.createdTradeId)
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
        .test(apiAndMigration.hedgeFxDeals.createdRequestTimestamp || "")
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
        .test(apiAndMigration.hedgeFxDeals.createdExecutionTimestamp || "")
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
        .test(apiAndMigration.hedgeFxDeals.createdReceivedTimestamp || "")
      || apiAndMigration.hedgeFxDeals.createdRequestTimestamp
        > apiAndMigration.hedgeFxDeals.createdExecutionTimestamp
      || apiAndMigration.hedgeFxDeals.createdExecutionTimestamp
        > apiAndMigration.hedgeFxDeals.createdReceivedTimestamp
      || apiAndMigration.hedgeFxDeals.createdSide !== "BUY"
      || apiAndMigration.hedgeFxDeals.createdCounterpartyId
        !== apiAndMigration.hedgeFxDeals.expectedCounterpartyId
      || apiAndMigration.hedgeFxDeals.createdPricingRuleId
        !== apiAndMigration.hedgeFxDeals.expectedPricingRuleId
      || !Number.isFinite(apiAndMigration.hedgeFxDeals.createdTransferRate)
      || !Number.isFinite(apiAndMigration.hedgeFxDeals.createdAnalyticalPnl)
      || !Number.isSafeInteger(apiAndMigration.hedgeFxDeals.createdAnalyticalPnlQuoteMinor)
      || apiAndMigration.hedgeFxDeals.createdAnalyticalPnlQuoteFractionDigits !== 2
      || apiAndMigration.hedgeFxDeals.createdDealtCcyCode !== "USD"
      || apiAndMigration.hedgeFxDeals.createdBaseCcyAmountMinor !== 250000000
      || apiAndMigration.hedgeFxDeals.createdBaseCcyFractionDigits !== 2
      || apiAndMigration.hedgeFxDeals.createdQuoteCcyAmountMinor !== 280850000
      || apiAndMigration.hedgeFxDeals.createdQuoteCcyFractionDigits !== 2
      || !["RUNNING", "STOPPED"].includes(
        apiAndMigration.hedgeFxDeals.createdMarketPulseStreamStatus
      )
      || apiAndMigration.hedgeFxDeals.subMinorAmountStatus !== 400
      || apiAndMigration.hedgeFxDeals.subMinorAmountCode !== "INVALID_HEDGE_FX_DEAL_AMOUNT"
      || apiAndMigration.hedgeFxDeals.invalidClientRuleStatus !== 400
      || apiAndMigration.hedgeFxDeals.countAfterCreate !== 1
      || apiAndMigration.hedgeFxDeals.deleteStatus !== 405
      || apiAndMigration.hedgeFxDeals.deleteCode !== "HEDGE_FX_DEAL_IMMUTABLE"
      || apiAndMigration.hedgeFxDeals.countAfterRejectedDelete !== 1
      || !apiAndMigration.hedgeFxDeals.preservedAfterRejectedDelete
      || !apiAndMigration.hedgeFxDeals.createdRowsShareId
      || apiAndMigration.clientDealPricingRules.status !== 200
      || apiAndMigration.clientDealPricingRules.count !== 1
      || !apiAndMigration.clientDealPricingRules.allDealerPriced
      || apiAndMigration.clientFxDeals.count !== 1
      || apiAndMigration.clientFxDeals.first?.tradeId !== 41
      || apiAndMigration.clientFxDeals.first?.clientDealId !== 41
      || apiAndMigration.clientFxDeals.first?.clientCode !== "7701234567"
      || apiAndMigration.clientFxDeals.first?.clientName !== "Romashka Company"
      || apiAndMigration.clientFxDeals.first?.currencyPair !== "EUR/USD"
      || apiAndMigration.clientFxDeals.first?.executionTimestamp !== "2026-07-15T11:45:00.000Z"
      || apiAndMigration.clientFxDeals.first?.receivedTimestamp !== "2026-07-15T11:45:00.000Z"
      || apiAndMigration.clientFxDeals.migratedRow?.trade_id !== 41
      || apiAndMigration.clientFxDeals.migratedRow?.trade_type !== "CLIENT_DEAL"
      || apiAndMigration.clientFxDeals.migratedRow?.counterparty_id !== 1
      || apiAndMigration.clientFxDeals.migratedRow?.execution_context_id !== null
      || apiAndMigration.clientFxDeals.migratedRow?.pricing_rule_id !== null
      || apiAndMigration.clientFxDeals.migratedRow?.transfer_rate !== null
      || apiAndMigration.clientFxDeals.migratedRow?.analytical_pnl_quote_minor !== null
      || apiAndMigration.clientFxDeals.migratedRow
        ?.analytical_pnl_quote_fraction_digits !== null
      || apiAndMigration.clientFxDeals.migratedRow?.comment !== null
      || !Number.isInteger(apiAndMigration.clientFxDeals.createdId)
      || apiAndMigration.clientFxDeals.createdTradeId !== apiAndMigration.clientFxDeals.createdId
      || apiAndMigration.clientFxDeals.createdExecutionTimestamp
        !== "2026-07-16T10:15:30.000Z"
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
        .test(apiAndMigration.clientFxDeals.createdReceivedTimestamp || "")
      || apiAndMigration.clientFxDeals.createdExecutionTimestamp
        > apiAndMigration.clientFxDeals.createdReceivedTimestamp
      || apiAndMigration.clientFxDeals.createdSide !== "SELL"
      || apiAndMigration.clientFxDeals.createdExecutionContextId !== apiAndMigration.clientFxDeals.expectedExecutionContextId
      || apiAndMigration.clientFxDeals.createdPricingRuleId !== apiAndMigration.clientFxDeals.expectedPricingRuleId
      || apiAndMigration.clientFxDeals.createdTransferRate !== 1.124
      || apiAndMigration.clientFxDeals.createdAnalyticalPnl !== 1800
      || apiAndMigration.clientFxDeals.createdAnalyticalPnlQuoteMinor !== 180000
      || apiAndMigration.clientFxDeals.createdAnalyticalPnlQuoteFractionDigits !== 2
      || apiAndMigration.clientFxDeals.createdDealtCcyCode !== "USD"
      || apiAndMigration.clientFxDeals.createdBaseCcyAmountMinor !== 200000000
      || apiAndMigration.clientFxDeals.createdBaseCcyFractionDigits !== 2
      || apiAndMigration.clientFxDeals.createdQuoteCcyAmountMinor !== 224620000
      || apiAndMigration.clientFxDeals.createdQuoteCcyFractionDigits !== 2
      || apiAndMigration.clientFxDeals.createdMarketPulseStreamStatus !== "RUNNING"
      || apiAndMigration.clientFxDeals.createdMarketPulseBid !== 1.1228
      || apiAndMigration.clientFxDeals.createdMarketPulseOffer !== 1.123
      || apiAndMigration.clientFxDeals.createdMarketPulseTimestamp !== "2026-07-16T10:15:29.000Z"
      || apiAndMigration.clientFxDeals.createdComment !== "Initial verification comment"
      || apiAndMigration.clientFxDeals.immutableUpdateStatus !== 405
      || apiAndMigration.clientFxDeals.immutableUpdateCode !== "CLIENT_FX_DEAL_IMMUTABLE"
      || apiAndMigration.clientFxDeals.updatedComment !== "Reviewed verification comment"
      || apiAndMigration.clientFxDeals.invalidCommentStatus !== 400
      || apiAndMigration.clientFxDeals.deleteStatus !== 405
      || apiAndMigration.clientFxDeals.deleteCode !== "CLIENT_FX_DEAL_IMMUTABLE"
      || apiAndMigration.clientFxDeals.countAfterRejectedDelete !== 2
      || apiAndMigration.clientFxDeals.rollbackStatus !== 500
      || !apiAndMigration.clientFxDeals.rollbackPreservedCounts
      || !apiAndMigration.clientFxDeals.createdRowsShareId
      || !apiAndMigration.clientFxDeals.commentUpdatePreservesTrade
      || !apiAndMigration.clientFxDeals.preservedAfterRejectedDelete
      || apiAndMigration.clientFxDeals.foreignKeyViolations !== 0
      || apiAndMigration.clientFxDeals.subMinorAmountStatus !== 400
      || apiAndMigration.clientFxDeals.subMinorAmountCode !== "INVALID_CLIENT_FX_DEAL_AMOUNT"
      || apiAndMigration.clientFxDeals.nonDealerPricingRuleStatus !== 400
      || !apiAndMigration.clientFxDeals.nonDealerPricingRuleMessage?.includes("DEALER_PRICED")
      || apiAndMigration.clientFxDeals.lifecycle.join(",") !== "201,405,200,400,400,400,400,400,400,400,405"
      || apiAndMigration.pricingRules.count !== 5
      || apiAndMigration.pricingRules.migratedCounterpartyTypes.join(",") !== "CLIENT"
      || !apiAndMigration.pricingRules.allPricingModesResolved
      || !apiAndMigration.pricingRules.migratedIdsPreserved
      || !apiAndMigration.pricingRules.migratedContextIdsAreIntegers
      || !Number.isInteger(apiAndMigration.pricingRules.createdId)
      || apiAndMigration.pricingRules.createdId <= 0
      || apiAndMigration.pricingRules.createdCounterpartyId !== apiAndMigration.tradingCounterparties.createdId
      || apiAndMigration.pricingRules.createdCounterpartyType !== "HEDGE_COUNTERPARTY"
      || apiAndMigration.pricingRules.createdPairCode !== "EUR_USD"
      || apiAndMigration.pricingRules.createdCurrencyPair !== "EUR/USD"
      || apiAndMigration.pricingRules.updatedId !== apiAndMigration.pricingRules.createdId
      || apiAndMigration.pricingRules.updatedContextId !== apiAndMigration.pricingRules.expectedUpdatedContextId
      || apiAndMigration.pricingRules.updatedMargin !== 0.3
      || apiAndMigration.pricingRules.immutableUpdateStatus !== 409
      || apiAndMigration.pricingRules.immutableUpdateCode !== "PRICING_RULE_TERMS_IMMUTABLE"
      || apiAndMigration.pricingRules.immutableUpdateContextId !== apiAndMigration.pricingRules.expectedUpdatedContextId
      || apiAndMigration.pricingRules.immutableUpdateMargin !== 0.3
      || apiAndMigration.pricingRules.lifecycle.join(",") !== "201,200,409,409,400,400,409,204"
      || apiAndMigration.tradingCounterparties.count !== 5
      || apiAndMigration.tradingCounterparties.migratedScopes.join(",") !== "EXTERNAL,INTERNAL"
      || apiAndMigration.tradingCounterparties.migratedRoles.join(",") !== "CLIENT,HEDGE_COUNTERPARTY"
      || apiAndMigration.tradingCounterparties.legacyExternalProfile?.counterpartyScope !== "EXTERNAL"
      || !apiAndMigration.tradingCounterparties.legacyExternalProfile?.counterpartyRoles?.includes("HEDGE_COUNTERPARTY")
      || apiAndMigration.tradingCounterparties.legacyInternalProfile?.counterpartyScope !== "INTERNAL"
      || !apiAndMigration.tradingCounterparties.legacyInternalProfile?.counterpartyRoles?.includes("HEDGE_COUNTERPARTY")
      || apiAndMigration.tradingCounterparties.createdScope !== "INTERNAL"
      || !apiAndMigration.tradingCounterparties.createdRoles?.includes("HEDGE_COUNTERPARTY")
      || apiAndMigration.tradingCounterparties.createdUnitType !== "DESK"
      || apiAndMigration.tradingCounterparties.updatedScope !== "INTERNAL"
      || apiAndMigration.tradingCounterparties.updatedCode !== "VERIFY_FOLDER"
      || apiAndMigration.tradingCounterparties.updatedUnitType !== "DEPARTMENT"
      || apiAndMigration.tradingCounterparties.updatedActive !== false
      || apiAndMigration.tradingCounterparties.countAfterDelete !== 5
      || apiAndMigration.tradingCounterparties.lifecycle.join(",") !== "201,200,409,400,400,400,400,400,204"
      || apiAndMigration.users.count !== 3
      || !Number.isInteger(apiAndMigration.users.createdId)
      || apiAndMigration.users.updatedRole !== "SUPERVISOR"
      || apiAndMigration.users.updatedActive !== false
      || apiAndMigration.users.countAfterDelete !== 3
      || apiAndMigration.users.lifecycle.join(",") !== "201,200,409,400,400,204"
      || simulationForeignKey?.referencedTable !== "ccy_pair_options"
      || simulationForeignKey?.referencedColumn !== "ccy_pair_code"
      || simulationForeignKey?.onDelete !== "CASCADE"
      || apiAndMigration.simulationSettingsColumns.join(",")
        !== "ccy_pair_code,bid_min,spread,bid_max,one_way_duration_seconds,fluctuation_spreads"
      || apiAndMigration.simulationSettingsLifecycle.savedDuration !== 45
      || apiAndMigration.simulationSettingsLifecycle.savedFluctuation !== 2.5
      || apiAndMigration.simulationSettingsLifecycle.readDuration !== 45
      || apiAndMigration.simulationSettingsLifecycle.readFluctuation !== 2.5
      || apiAndMigration.migratedPair?.bidMin !== 1.122
      || apiAndMigration.eurUsdPricingRulesCount !== 5
      || apiAndMigration.blockedPairDelete.status !== 409
      || apiAndMigration.blockedPairDelete.code !== "CCY_PAIR_IN_USE"
      || apiAndMigration.blockedPairDelete.message !== "Ccy Pair EUR/USD is used in 5 Pricing Rules."
      || apiAndMigration.migratedSettings?.bidMax !== 1.1222
      || apiAndMigration.migratedSettings?.oneWayDurationSeconds !== 60
      || apiAndMigration.migratedSettings?.fluctuationSpreads !== 3
      || apiAndMigration.simulationControl.status !== 200
      || apiAndMigration.simulationControl.start !== 200
      || !apiAndMigration.simulationControl.startRunning
      || apiAndMigration.simulationControl.stream !== 200
      || !apiAndMigration.simulationControl.streamHasSnapshot
      || apiAndMigration.simulationControl.stop !== 200
      || apiAndMigration.simulationControl.stopRunning
      || apiAndMigration.writeLifecycle.join(",") !== "201,201,200,200,200,204,200,409,204,204,201,200,409,201,200,409,204,201,200,409,204,201,200,409,204,204";
    const result = { freshSchema, frontend, simulator, apiAndMigration };

    if (failed) {
      console.error(JSON.stringify(result, null, 2));
      process.exitCode = 1;
    } else {
      console.log(JSON.stringify(result, null, 2));
    }
  } finally {
    removeVerificationDatabase();
  }
}

main().catch(error => {
  removeVerificationDatabase();
  console.error(error);
  process.exitCode = 1;
});
