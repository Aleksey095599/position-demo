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

    CREATE TABLE trading_parties
    (
      party_id        INTEGER PRIMARY KEY,
      party_type      TEXT NOT NULL,
      party_code      TEXT NOT NULL,
      party_code_type TEXT NOT NULL,
      party_name      TEXT NOT NULL,
      is_active       INTEGER NOT NULL,
      UNIQUE (party_code_type, party_code)
    );

    CREATE TABLE pricing_rules
    (
      pricing_rule_id      INTEGER PRIMARY KEY,
      party_id             INTEGER NOT NULL REFERENCES trading_parties (party_id),
      execution_context_id TEXT NOT NULL REFERENCES execution_contexts (execution_context_id),
      ccy_pair_code        TEXT NOT NULL REFERENCES ccy_pair_options (ccy_pair_code),
      margin_percent       REAL NOT NULL
    );

    CREATE TABLE client_fx_deals
    (
      client_deal_id       INTEGER PRIMARY KEY,
      entry_timestamp      TEXT    NOT NULL,
      party_id             INTEGER NOT NULL REFERENCES trading_parties (party_id) ON UPDATE RESTRICT ON DELETE RESTRICT,
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

    CREATE TABLE trading_party_execution_contexts
    (
      party_id INTEGER NOT NULL,
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

    INSERT INTO trading_parties
      (party_id, party_type, party_code, party_code_type, party_name, is_active)
    VALUES
      (1, 'CLIENT', '7701234567', 'INN', 'Romashka Company', 1),
      (2, 'CLIENT', '7812345678', 'INN', 'Vasilek Company', 1),
      (3, 'CLIENT', '5409876543', 'INN', 'Gladiolus Company', 1),
      (4, 'EXTERNAL_COUNTERPARTY', 'LEGACY_EXTERNAL', 'OTHER', 'Legacy External Counterparty', 1),
      (5, 'INTERNAL_DESK', 'LEGACY_INTERNAL', 'OTHER', 'Legacy Internal Desk', 1);

    INSERT INTO pricing_rules
      (pricing_rule_id, party_id, execution_context_id, ccy_pair_code, margin_percent)
    VALUES
      (1, 1, '002:AFINA:CLICK_TRADE_EFX', 'EUR_USD', 0.10),
      (2, 1, '002:AFINA:RFQ', 'EUR_USD', 0.12),
      (3, 1, '002:CTF3:MANUAL_CLIENT_DEAL_ENTRY', 'EUR_USD', 0.08),
      (4, 2, '1234:AFINA:RFQ', 'EUR_USD', 0.05),
      (5, 3, '001:CTF3:CLICK_TRADE_EFX', 'EUR_USD', 0.20);

    INSERT INTO client_fx_deals
      (
        client_deal_id, entry_timestamp, party_id, trade_date, ccy_pair_code, side,
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
  let tradingPartyConstraintsEnforced = true;
  let userConstraintsEnforced = true;
  let frontSystemFolderIdCodeTypeSupported = false;
  let clientDealGenerationSettingsConstraintsEnforced = true;
  let clientDealGenerationSettingsPartyTypeEnforced = true;
  let clientDealGenerationSettingsPricingModeEnforced = true;
  let clientDealGenerationSettingsCascadeDeleteEnforced = true;
  let fxTradeExposureConstraintsEnforced = true;
  let clientFxDealConstraintsEnforced = true;
  let clientFxDealParentRestrictionEnforced = true;
  let clientFxDealAttributionReferencesRestricted = true;
  let clientFxDealPartyTypeEnforced = true;
  let hedgeFxDealConstraintsEnforced = true;
  let hedgeFxDealParentRestrictionEnforced = true;
  let hedgeFxDealPartyTypeEnforced = true;
  let fxTradeBatchDefaultsSupported = false;
  let fxTradeBatchConstraintsEnforced = true;
  let batchTradeTypesSupported = false;
  let batchBalancingTradeConstraintsEnforced = true;
  let batchBalancingTradeParentRestrictionEnforced = true;

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
    ["EXTERNAL_COUNTERPARTY", "VERIFY_EXTERNAL", "OTHER", "Valid party name", 1],
    ["INTERNAL_DESK", "VERIFY_INTERNAL", "OTHER", "Valid party name", 1],
    ["UNKNOWN", "VERIFY_UNKNOWN", "OTHER", "Valid party name", 1],
    ["CLIENT", "VERIFY_LEI", "LEI", "Valid party name", 1],
    ["CLIENT", "X".repeat(21), "OTHER", "Valid party name", 1],
    ["CLIENT", "VERIFY_NAME", "OTHER", "X".repeat(201), 1],
    ["CLIENT", "VERIFY_ACTIVE", "OTHER", "Valid party name", 2]
  ].forEach(([partyType, partyCode, partyCodeType, partyName, isActive]) => {
    try {
      database.prepare(`
        INSERT INTO trading_parties
          (party_type, party_code, party_code_type, party_name, is_active)
        VALUES (?, ?, ?, ?, ?)
      `).run(partyType, partyCode, partyCodeType, partyName, isActive);
      tradingPartyConstraintsEnforced = false;
    } catch {}
  });

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

  try {
    const frontSystemPartyId = database.prepare(`
      INSERT INTO trading_parties
        (party_type, party_code, party_code_type, party_name, is_active)
      VALUES ('CLIENT', 'FRONT_FOLDER_1', 'FRONT_SYSTEM_FOLDER_ID', 'Front System Client', 1)
    `).run().lastInsertRowid;
    frontSystemFolderIdCodeTypeSupported = true;
    database.prepare("DELETE FROM trading_parties WHERE party_id = ?").run(frontSystemPartyId);
  } catch {}

  const clientGenerationPricingRuleId = Number(database.prepare(`
    SELECT r.pricing_rule_id
    FROM pricing_rules r
    INNER JOIN trading_parties p ON p.party_id = r.party_id
    INNER JOIN execution_contexts c ON c.execution_context_id = r.execution_context_id
    INNER JOIN execution_systems e ON e.execution_system_id = c.execution_system_id
    WHERE p.party_type = 'CLIENT'
      AND e.pricing_mode = 'AUTO_PRICED'
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
    INNER JOIN trading_parties p ON p.party_id = r.party_id
    INNER JOIN execution_contexts c ON c.execution_context_id = r.execution_context_id
    INNER JOIN execution_systems e ON e.execution_system_id = c.execution_system_id
    WHERE p.party_type = 'CLIENT'
      AND e.pricing_mode <> 'AUTO_PRICED'
    ORDER BY r.pricing_rule_id
    LIMIT 1
  `).get().pricing_rule_id);
  const hedgeGenerationPricingRuleId = Number(database.prepare(`
    SELECT r.pricing_rule_id
    FROM pricing_rules r
    INNER JOIN trading_parties p ON p.party_id = r.party_id
    WHERE p.party_type = 'HEDGE_COUNTERPARTY'
    ORDER BY r.pricing_rule_id
    LIMIT 1
  `).get().pricing_rule_id);

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
    clientDealGenerationSettingsPartyTypeEnforced = false;
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

  const clientGenerationPartyId = Number(database.prepare(`
    SELECT party_id
    FROM trading_parties
    WHERE party_code = '5409876543'
  `).get().party_id);
  const clientGenerationPartyRuleId = Number(database.prepare(`
    SELECT pricing_rule_id
    FROM pricing_rules
    WHERE party_id = ?
    ORDER BY pricing_rule_id
    LIMIT 1
  `).get(clientGenerationPartyId).pricing_rule_id);
  const hedgeGenerationPartyId = Number(database.prepare(`
    SELECT party_id
    FROM trading_parties
    WHERE party_type = 'HEDGE_COUNTERPARTY'
    ORDER BY party_id
    LIMIT 1
  `).get().party_id);

  try {
    database.prepare(`
      UPDATE pricing_rules
      SET party_id = ?
      WHERE pricing_rule_id = ?
    `).run(hedgeGenerationPartyId, clientGenerationPartyRuleId);
    clientDealGenerationSettingsPartyTypeEnforced = false;
  } catch {}

  try {
    database.prepare(`
      UPDATE trading_parties
      SET party_type = 'HEDGE_COUNTERPARTY'
      WHERE party_id = ?
    `).run(clientGenerationPartyId);
    clientDealGenerationSettingsPartyTypeEnforced = false;
  } catch {}

  const cascadePricingRuleId = Number(database.prepare(`
    INSERT INTO pricing_rules
      (party_id, execution_context_id, ccy_pair_code, margin_percent)
    SELECT ?, c.execution_context_id, 'EUR_USD', 0.01
    FROM execution_contexts c
    INNER JOIN execution_systems e ON e.execution_system_id = c.execution_system_id
    WHERE c.execution_context_id NOT IN
      (SELECT execution_context_id FROM pricing_rules WHERE party_id = ? AND ccy_pair_code = 'EUR_USD')
      AND e.pricing_mode = 'AUTO_PRICED'
    ORDER BY c.execution_context_id
    LIMIT 1
  `).run(clientGenerationPartyId, clientGenerationPartyId).lastInsertRowid);

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
    ["2026-07-15 09:30:00", "CLIENT_DEAL", "2026-07-15", "EUR_USD", "BUY", 10000, 2, 11231, 2, 1.1231, "TOD", "2026-07-15", "2026-07-15"],
    ["2026-07-15T09:30:00.000Z", "CLIENT", "2026-07-15", "EUR_USD", "BUY", 10000, 2, 11231, 2, 1.1231, "TOD", "2026-07-15", "2026-07-15"],
    ["2026-07-15T09:30:00.000Z", "TECHNICAL_DEAL", "2026-07-15", "EUR_USD", "BUY", 10000, 2, 11231, 2, 1.1231, "TOD", "2026-07-15", "2026-07-15"],
    ["2026-07-15T09:30:00.000Z", "CLIENT_DEAL", "15.07.2026", "EUR_USD", "BUY", 10000, 2, 11231, 2, 1.1231, "TOD", "2026-07-15", "2026-07-15"],
    ["2026-07-15T09:30:00.000Z", "CLIENT_DEAL", "2026-07-15", "UNKNOWN_PAIR", "BUY", 10000, 2, 11231, 2, 1.1231, "TOD", "2026-07-15", "2026-07-15"],
    ["2026-07-15T09:30:00.000Z", "CLIENT_DEAL", "2026-07-15", "EUR_USD", "HOLD", 10000, 2, 11231, 2, 1.1231, "TOD", "2026-07-15", "2026-07-15"],
    ["2026-07-15T09:30:00.000Z", "CLIENT_DEAL", "2026-07-15", "EUR_USD", "BUY", 0, 2, 11231, 2, 1.1231, "TOD", "2026-07-15", "2026-07-15"],
    ["2026-07-15T09:30:00.000Z", "CLIENT_DEAL", "2026-07-15", "EUR_USD", "BUY", 10000, 2, 11231, 2, 1.1231, "spot value", "2026-07-15", "2026-07-15"],
    ["2026-07-15T09:30:00.000Z", "CLIENT_DEAL", "2026-07-15", "EUR_USD", "BUY", 10000, 2, 11231, 2, 1.1231, "TOD", "15.07.2026", "2026-07-15"]
  ].forEach(values => {
    try {
      database.prepare(`
        INSERT INTO fx_trade_exposure
          (
            entry_timestamp, trade_type, trade_date, ccy_pair_code, base_ccy_side,
            dealt_ccy_code,
            base_ccy_amount_minor, base_ccy_fraction_digits,
            quote_ccy_amount_minor, quote_ccy_fraction_digits,
            trade_rate, tenor,
            base_ccy_value_date, quote_ccy_value_date
          )
        VALUES (?, ?, ?, ?, ?, 'EUR', ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(...values);
      fxTradeExposureConstraintsEnforced = false;
    } catch {}
  });

  try {
    database.prepare(`
      INSERT INTO fx_trade_exposure
        (
          entry_timestamp, trade_type, trade_date, ccy_pair_code, base_ccy_side,
          dealt_ccy_code,
          base_ccy_amount_minor, base_ccy_fraction_digits,
          quote_ccy_amount_minor, quote_ccy_fraction_digits,
          trade_rate, tenor,
          base_ccy_value_date, quote_ccy_value_date
        )
      VALUES ('2026-07-15T09:30:00.000Z', 'CLIENT_DEAL', '2026-07-15', 'EUR_USD', 'BUY', 'JPY', 10000, 2, 11231, 2, 1.1231, 'TOD', '2026-07-15', '2026-07-15')
    `).run();
    fxTradeExposureConstraintsEnforced = false;
  } catch {}

  database.prepare(`
    INSERT INTO fx_trade_exposure
      (
        entry_timestamp, trade_type, trade_date, ccy_pair_code, base_ccy_side,
        dealt_ccy_code,
        base_ccy_amount_minor, base_ccy_fraction_digits,
        quote_ccy_amount_minor, quote_ccy_fraction_digits,
        trade_rate, tenor,
        base_ccy_value_date, quote_ccy_value_date
      )
    VALUES ('2026-07-15T09:30:00.000Z', 'CLIENT_DEAL', '2026-07-15', 'EUR_USD', 'BUY', 'EUR', 3000000000, 2, 3369300000, 2, 1.1231, 'TOD', '2026-07-15', '2026-07-15')
  `).run();

  database.prepare(`
    INSERT INTO fx_trade_exposure
      (
        entry_timestamp, trade_type, trade_date, ccy_pair_code, base_ccy_side,
        dealt_ccy_code,
        base_ccy_amount_minor, base_ccy_fraction_digits,
        quote_ccy_amount_minor, quote_ccy_fraction_digits,
        trade_rate, tenor,
        base_ccy_value_date, quote_ccy_value_date
      )
    VALUES ('2026-07-15T09:31:00.000Z', 'HEDGE_DEAL', '2026-07-15', 'EUR_USD', 'SELL', 'EUR', 3000000000, 2, 3369000000, 2, 1.123, 'TOD', '2026-07-15', '2026-07-15')
  `).run();

  database.prepare(`
    INSERT INTO fx_trade_exposure
      (
        entry_timestamp, trade_type, trade_date, ccy_pair_code, base_ccy_side,
        dealt_ccy_code,
        base_ccy_amount_minor, base_ccy_fraction_digits,
        quote_ccy_amount_minor, quote_ccy_fraction_digits,
        trade_rate, tenor,
        base_ccy_value_date, quote_ccy_value_date
      )
    VALUES ('2026-07-15T09:32:00.000Z', 'CLIENT_DEAL', '2026-07-15', 'EUR_USD', 'BUY', 'EUR', 100000000, 2, 112310000, 2, 1.1231, 'TOM', '2026-07-16', '2026-07-16')
  `).run();

  database.prepare(`
    INSERT INTO fx_trade_exposure
      (
        entry_timestamp, trade_type, trade_date, ccy_pair_code, base_ccy_side,
        dealt_ccy_code,
        base_ccy_amount_minor, base_ccy_fraction_digits,
        quote_ccy_amount_minor, quote_ccy_fraction_digits,
        trade_rate, tenor,
        base_ccy_value_date, quote_ccy_value_date
      )
    VALUES ('2026-07-15T09:33:00.000Z', 'HEDGE_DEAL', '2026-07-15', 'EUR_USD', 'SELL', 'EUR', 100000000, 2, 112300000, 2, 1.123, 'SPOT', '2026-07-17', '2026-07-17')
  `).run();

  const seededClientTradeId = Number(database.prepare(`
    SELECT trade_id
    FROM client_fx_deals
    LIMIT 1
  `).get().trade_id);
  const hedgeTradeId = Number(database.prepare(`
    SELECT trade_id
    FROM fx_trade_exposure
    WHERE entry_timestamp = '2026-07-15T09:31:00.000Z'
  `).get().trade_id);
  const unlinkedClientTradeId = Number(database.prepare(`
    SELECT trade_id
    FROM fx_trade_exposure
    WHERE entry_timestamp = '2026-07-15T09:32:00.000Z'
  `).get().trade_id);
  const seededHedgeTradeId = Number(database.prepare(`
    SELECT trade_id
    FROM fx_hedge_deals
    LIMIT 1
  `).get().trade_id);
  const unlinkedHedgeTradeId = Number(database.prepare(`
    SELECT trade_id
    FROM fx_trade_exposure
    WHERE entry_timestamp = '2026-07-15T09:33:00.000Z'
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
      && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(storedBatch?.created_at || "");

    try {
      database.prepare(`
        INSERT INTO fx_batches (idempotency_key, ccy_pair_code, batch_status)
        VALUES ('verify-invalid-batch', 'EUR_USD', 'COMPLETED')
      `).run();
      fxTradeBatchConstraintsEnforced = false;
    } catch {}
  } finally {
    database.exec("ROLLBACK TO verify_batches");
    database.exec("RELEASE verify_batches");
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
        INSERT INTO client_fx_deals (trade_id, trade_type, party_id)
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
        INSERT INTO fx_hedge_deals (trade_id, trade_type, party_id)
        VALUES (?, ?, ?)
      `).run(...values);
      hedgeFxDealConstraintsEnforced = false;
    } catch {}
  });

  const hedgePricingRuleReference = database.prepare(`
    SELECT pricing_rule_id, party_id, execution_context_id
    FROM fx_hedge_deals
    WHERE trade_id = ?
  `).get(seededHedgeTradeId);

  [
    [unlinkedHedgeTradeId, hedgePricingRuleReference.party_id, null, null, 0, 0, 2],
    [unlinkedHedgeTradeId, hedgePricingRuleReference.party_id, null, null, 1.12, "INVALID", 2],
    [unlinkedHedgeTradeId, hedgePricingRuleReference.party_id, null, null, 1.12, 0, null],
    [unlinkedHedgeTradeId, hedgePricingRuleReference.party_id, null, hedgePricingRuleReference.pricing_rule_id, 1.12, 0, 2],
    [unlinkedHedgeTradeId, 1, hedgePricingRuleReference.execution_context_id, hedgePricingRuleReference.pricing_rule_id, 1.12, 0, 2]
  ].forEach(values => {
    try {
      database.prepare(`
        INSERT INTO fx_hedge_deals
          (
            trade_id,
            trade_type,
            party_id,
            execution_context_id,
            pricing_rule_id,
            transfer_rate,
            analytical_pnl_quote_minor,
            analytical_pnl_quote_fraction_digits
          )
        VALUES (?, 'HEDGE_DEAL', ?, ?, ?, ?, ?, ?)
      `).run(...values);
      hedgeFxDealConstraintsEnforced = false;
    } catch {}
  });

  const pricingRuleReference = database.prepare(`
    SELECT pricing_rule_id, execution_context_id
    FROM pricing_rules
    WHERE party_id = 1
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
            party_id,
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

  const nonClientPartyId = Number(database.prepare(`
    INSERT INTO trading_parties
      (party_type, party_code, party_code_type, party_name, is_active)
    VALUES ('HEDGE_COUNTERPARTY', 'VERIFY_DEAL_CP', 'OTHER', 'Verification Deal Counterparty', 1)
  `).run().lastInsertRowid);

  try {
    database.prepare(`
      INSERT INTO client_fx_deals (trade_id, trade_type, party_id)
      VALUES (?, 'CLIENT_DEAL', ?)
    `).run(unlinkedClientTradeId, nonClientPartyId);
    clientFxDealPartyTypeEnforced = false;
  } catch {}

  try {
    database.prepare("UPDATE trading_parties SET party_type = 'HEDGE_COUNTERPARTY' WHERE party_id = 1").run();
    clientFxDealPartyTypeEnforced = false;
  } catch {}

  try {
    database.prepare(`
      INSERT INTO fx_hedge_deals (trade_id, trade_type, party_id)
      VALUES (?, 'HEDGE_DEAL', 1)
    `).run(unlinkedHedgeTradeId);
    hedgeFxDealPartyTypeEnforced = false;
  } catch {}

  try {
    database.prepare("UPDATE trading_parties SET party_type = 'CLIENT' WHERE party_id = 4").run();
    hedgeFxDealPartyTypeEnforced = false;
  } catch {}

  database.prepare("DELETE FROM trading_parties WHERE party_id = ?").run(nonClientPartyId);

  const result = {
    currencies: database.prepare("SELECT COUNT(*) AS count FROM ccy_options").get().count,
    pairs: database.prepare("SELECT COUNT(*) AS count FROM ccy_pair_options").get().count,
    simulationSettings: database.prepare("SELECT COUNT(*) AS count FROM market_quote_simulation_settings").get().count,
    servicingLocations: database.prepare("SELECT COUNT(*) AS count FROM servicing_locations").get().count,
    accountingSystems: database.prepare("SELECT COUNT(*) AS count FROM accounting_systems").get().count,
    executionSystems: database.prepare("SELECT COUNT(*) AS count FROM execution_systems").get().count,
    executionContexts: database.prepare("SELECT COUNT(*) AS count FROM execution_contexts").get().count,
    executionContextIdType: database.prepare("PRAGMA table_info(execution_contexts)").all()
      .find(column => column.name === "execution_context_id")?.type,
    tradingParties: database.prepare("SELECT COUNT(*) AS count FROM trading_parties").get().count,
    tradingPartyTypes: database.prepare(`
      SELECT DISTINCT party_type
      FROM trading_parties
      ORDER BY party_type
    `).all().map(row => row.party_type),
    users: database.prepare("SELECT COUNT(*) AS count FROM users").get().count,
    userColumns: database.prepare("PRAGMA table_info(users)").all().map(column => column.name),
    userRoles: database.prepare(`
      SELECT DISTINCT user_role
      FROM users
      ORDER BY user_role
    `).all().map(row => row.user_role),
    pricingRules: database.prepare("SELECT COUNT(*) AS count FROM pricing_rules").get().count,
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
    clientDealGenerationSettingsColumns: database.prepare(`
      PRAGMA table_info(client_deal_generation_settings)
    `).all().map(column => column.name),
    clientDealGenerationSettingsForeignKeys: database.prepare(`
      PRAGMA foreign_key_list(client_deal_generation_settings)
    `).all(),
    clientDealGenerationSettingsRows: database.prepare(`
      SELECT
        s.*,
        p.party_type,
        e.pricing_mode
      FROM client_deal_generation_settings s
      INNER JOIN pricing_rules r ON r.pricing_rule_id = s.pricing_rule_id
      INNER JOIN trading_parties p ON p.party_id = r.party_id
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
    fxTradeBatches: database.prepare(`
      SELECT COUNT(*) AS count
      FROM fx_batches
    `).get().count,
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
    tradingPartyConstraintsEnforced,
    userConstraintsEnforced,
    frontSystemFolderIdCodeTypeSupported,
    clientDealGenerationSettingsConstraintsEnforced,
    clientDealGenerationSettingsPartyTypeEnforced,
    clientDealGenerationSettingsPricingModeEnforced,
    clientDealGenerationSettingsCascadeDeleteEnforced,
    fxTradeExposureConstraintsEnforced,
    clientFxDealConstraintsEnforced,
    clientFxDealParentRestrictionEnforced,
    clientFxDealAttributionReferencesRestricted,
    clientFxDealPartyTypeEnforced,
    hedgeFxDealConstraintsEnforced,
    hedgeFxDealParentRestrictionEnforced,
    hedgeFxDealPartyTypeEnforced,
    fxTradeBatchDefaultsSupported,
    fxTradeBatchConstraintsEnforced,
    batchTradeTypesSupported,
    batchBalancingTradeConstraintsEnforced,
    batchBalancingTradeParentRestrictionEnforced,
    legacyAssignmentTablePresent: Boolean(database.prepare(`
      SELECT 1 AS present
      FROM sqlite_master
      WHERE type = 'table' AND name = 'trading_party_execution_contexts'
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
  const html = normalizedSource("index.html");
  const serverSource = normalizedSource("server.js");
  const schemaSource = normalizedSource("schema.sql");
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
  const clientDealGeneratorSource = normalizedSource(
    path.join("backend", "client-fx-deal", "client-fx-deal-generator.js")
  );
  const moneyDomainSource = normalizedSource(
    path.join("backend", "money", "money.js")
  );
  const startScript = normalizedSource("start-demo.bat");
  const scripts = [...html.matchAll(/<script(?:[^>]*)>([\s\S]*?)<\/script>/g)];
  const inlineScript = scripts.at(-1)?.[1] || "";
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

  const ids = [...html.matchAll(/\bid="([^"]+)"/g)]
    .map(match => match[1])
    .filter(id => !id.includes("${"));
  const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
  const domReferences = [...inlineScript.matchAll(/getElementById\("([^"]+)"\)/g)].map(match => match[1]);
  const addClientDealDialogMarkup = html.match(/<dialog class="client-deal-create-dialog"[\s\S]*?<\/dialog>/)?.[0] || "";
  const addHedgeDealDialogMarkup = html.match(
    /<dialog class="client-deal-create-dialog hedge-deal-create-dialog"[\s\S]*?<\/dialog>/
  )?.[0] || "";
  const editClientDealDialogMarkup = html.match(
    /<dialog class="client-deal-create-dialog" id="editDealDialog"[\s\S]*?<\/dialog>/
  )?.[0] || "";
  const clientDealDuplicateCheckMarkup = html.match(/<dialog class="client-deal-create-dialog client-deal-duplicate-dialog"[\s\S]*?<\/dialog>/)?.[0] || "";
  const fxPositionPageMarkup = html.match(
    /<main class="shell fx-position-bootstrap workbench-page" id="mainPage"[\s\S]*?<\/main>/
  )?.[0] || "";
  const fxPositionDealToolbarMarkup = fxPositionPageMarkup.match(
    /<section class="deal-toolbar\b[^"]*"[\s\S]*?<\/section>/
  )?.[0] || "";
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
    usesTradingPartiesEndpoint: inlineScript.includes("/api/v1/trading-parties"),
    usesUsersWorkspace: inlineScript.includes("/api/v1/users")
      && html.includes('href="#users" data-workspace-route="users"')
      && html.includes('id="usersView"')
      && html.includes('class="button-icon workspace-nav-icon" aria-hidden="true">person</span>')
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
    displaysPricingRulePartyType: serverSource.includes("p.party_type AS partyType")
      && html.includes('<span class="reference-column-title">Party Type</span>')
      && html.includes('data-pricing-rule-header-filter="partyType"')
      && inlineScript.includes("partyType: normalizedPartyType(")
      && inlineScript.includes("data-pricing-rule-party-type")
      && inlineScript.includes("partyTypeForInn(rule.inn)"),
    displaysPricingRulePricingMode: serverSource.includes("e.pricing_mode AS pricingMode")
      && html.includes('<span class="reference-column-title">Pricing Mode</span>')
      && html.includes('data-pricing-rule-header-filter="pricingMode"')
      && inlineScript.includes("pricingMode: sourcePricingMode")
      && inlineScript.includes("pricingModeIndicatorMarkup("),
    usesDealerPricedClientDealRules: serverSource.includes('function clientDealPricingRules()')
      && serverSource.includes('pricingRules("DEALER_PRICED")')
      && serverSource.includes('pathname === "/api/v1/client-deal-pricing-rules"')
      && inlineScript.includes("DEMO_API_BOOTSTRAP.clientDealPricingRules")
      && inlineScript.includes("clientDealEligiblePricingRules"),
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
      && addHedgeDealDialogMarkup.includes('name="baseCcyAmount"')
      && addHedgeDealDialogMarkup.includes('name="quoteCcyAmount"')
      && addHedgeDealDialogMarkup.includes('name="tradeRate"')
      && addHedgeDealDialogMarkup.includes('name="tenor"')
      && addHedgeDealDialogMarkup.includes('id="addHedgeDealMarketPulse"')
      && addHedgeDealDialogMarkup.includes('name="analyticalPnl"')
      && addHedgeDealDialogMarkup.includes('name="amountFixingCurrency" value="base"')
      && (addHedgeDealDialogMarkup.match(/data-add-hedge-deal-fixing-currency=/g) || []).length === 2
      && !addHedgeDealDialogMarkup.includes("Net Difference")
      && inlineScript.includes('openAddHedgeDealDialog("SELL")')
      && inlineScript.includes('openAddHedgeDealDialog("BUY")')
      && inlineScript.includes('demoApiRequest("/api/v1/hedge-fx-deals"')
      && inlineScript.includes("function syncAddHedgeDealAmounts()")
      && inlineScript.includes("function addHedgeDealExactAmounts()")
      && inlineScript.includes("dealtCcyAmount,")
      && !inlineScript.includes("baseCcyAmount,\n            tradeRate,")
      && inlineScript.includes("function selectAddHedgeDealAmountFixingCurrency(event)")
      && inlineScript.includes('addHedgeDealForm.addEventListener("click", selectAddHedgeDealAmountFixingCurrency)')
      && inlineScript.includes("async function reloadHedgeFxDealsFromApi()"),
    usesHedgeCounterpartyPricingRules: serverSource.includes("function hedgeDealPricingRules()")
      && serverSource.includes('party?.partyType === "HEDGE_COUNTERPARTY"')
      && serverSource.includes('return pricingRules("DEALER_PRICED").filter(rule =>')
      && serverSource.includes('pathname === "/api/v1/hedge-deal-pricing-rules"')
      && serverSource.includes("createHedgeFxDealTerms")
      && serverSource.includes("hedgeFxDealWithCalculatedTerms(payload, exposureAmounts)")
      && inlineScript.includes("DEMO_API_BOOTSTRAP.hedgeDealPricingRules")
      && inlineScript.includes("function isHedgeDealPricingRule(rule)")
      && inlineScript.includes("return isDealerPricedPricingRule(rule);")
      && inlineScript.includes("function eligibleHedgeDealPartyIds(")
      && inlineScript.includes("eligiblePartyIds.has(String(profile.partyId))")
      && inlineScript.includes("profiles.length === 1 ? profiles[0] : null")
      && inlineScript.includes("No Hedge Counterparty with a Dealer Priced Pricing Rule is available")
      && inlineScript.includes("addHedgeDealPricingRuleContentMarkup")
      && inlineScript.includes('id="addHedgeDealPricingRuleLabel">Pricing Rule</span>')
      && inlineScript.includes("Select Pricing Rule")
      && inlineScript.includes("Select a Pricing Rule.")
      && inlineScript.includes("return addClientDealPricingRuleContentMarkup(rule, context);")
      && addHedgeDealDialogMarkup.includes('id="addHedgeDealCounterpartyPicker"')
      && addHedgeDealDialogMarkup.includes(">Hedge Counterparty</span>")
      && inlineScript.includes("selectedAddHedgeDealCounterparty")
      && inlineScript.includes("Select a Hedge Counterparty to see available Pricing Rules."),
    usesPricingModeIndicators:
      html.includes("const PRICING_TYPE_PRESENTATION = Object.freeze({")
      && html.includes('icon: "bolt"')
      && html.includes('icon: "contact_phone"')
      && html.includes('icon: "price_change"')
      && (html.match(/icon: "price_change"/g) || []).length === 1
      && html.includes('icon: "verified"')
      && html.includes(".pricing-mode-indicator.is-auto-priced")
      && html.includes(".pricing-mode-indicator.is-dealer-priced")
      && html.includes(".pricing-mode-indicator.is-dealer-approved")
      && html.includes(".pricing-mode-indicator.is-manual-pricing")
      && inlineScript.includes("function pricingModeIndicatorMarkup(")
      && inlineScript.includes("pricingModeIndicatorMarkup(pricingModeForRule(rule, context))")
      && inlineScript.includes("pricingModeIndicatorMarkup(\n            item.pricingType,")
      && inlineScript.includes("highlightedReferenceDataText(kind, item.pricingType),\n            false")
      && inlineScript.includes('data-tooltip="${escapeHtml(presentation.label)}"'),
    usesUnifiedMarginIndicators:
      inlineScript.includes("function marginIndicatorMarkup(marginPercent")
      && inlineScript.includes('data-tooltip="Margin"')
      && inlineScript.includes(">percent</span>")
      && inlineScript.includes("marginIndicatorMarkup(rule.marginPercent)")
      && inlineScript.includes('marginIndicatorMarkup(rule.marginPercent, "client-pricing-rules-margin", false)')
      && html.includes(".client-deal-pricing-rule-margin-icon")
      && html.includes(".client-deal-pricing-rule-margin-value"),
    usesDatabaseBackedFxPositions: inlineScript.includes("function loadFxPositionsFromDatabase()")
      && inlineScript.includes("fxPositionRecords.map(record =>")
      && inlineScript.includes('demoApiRequest("/api/v1/fx-positions")')
      && serverSource.includes("function fxPositions()")
      && serverSource.includes('pathname === "/api/v1/fx-positions"')
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
    usesClientDealCommentOnlyEditing:
      html.includes('id="editDealButton" disabled>Edit Comment</button>')
      && editClientDealDialogMarkup.includes(">Edit Client Deal Comment</h2>")
      && editClientDealDialogMarkup.includes('id="editClientDealSide" name="side" disabled')
      && editClientDealDialogMarkup.includes('id="editClientDealTenor" name="tenor" disabled')
      && editClientDealDialogMarkup.includes('id="editClientDealComment" name="comment" maxlength="500"')
      && editClientDealDialogMarkup.includes('id="dealSubmitButton">Save Comment</button>')
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
      && serverSource.includes("new ClientDealGenerationProcess")
      && inlineScript.includes('"/api/v1/client-deal-generation/one"')
      && inlineScript.includes('"/api/v1/client-deal-generation/settings"')
      && inlineScript.includes('"/api/v1/client-deal-generation/process/start"')
      && inlineScript.includes("runClientDealGenerationButton"),
    removesBrowserClientDealGeneration: !inlineScript.includes("generatedClientDealDraft")
      && !inlineScript.includes("clientDealGenerationSettings.marketBidMin")
      && !inlineScript.includes('DemoDb.get("clientDealGenerationSettings")')
      && !demoDatabaseSource.includes('"clientDealGenerationSettings"')
      && !demoDatabaseSource.includes("clientDealGenerationSettings:"),
    usesFxBatchFormation:
      batchToolbarMarkup.includes('id="oneBatchButton"')
      && batchToolbarMarkup.includes(">One Batch</button>")
      && serverSource.includes('pathname === "/api/v1/fx-batches"')
      && serverSource.includes("new FormFxBatchUseCase")
      && serverSource.includes("INSERT INTO fx_batch_members")
      && serverSource.includes("INSERT INTO fx_batch_outputs")
      && fxBatchFormationApplicationSource.includes("class FormFxBatchUseCase")
      && inlineScript.includes("formOneBatchFromSelection")
      && inlineScript.includes('"/api/v1/fx-batches"')
      && inlineScript.includes(
        'oneBatchButton.addEventListener("click", formOneBatchFromSelection)'
      )
      && inlineScript.includes("selectedDealIds")
      && !inlineScript.includes("deleteSelectedGeneratedBatchTrades")
      && !inlineScript.includes("generateOpenPositionByAutoBatch")
      && !inlineScript.includes("openBatchSettingsPage")
      && !inlineScript.includes('DemoDb.get("batchSettings")')
      && !demoDatabaseSource.includes('"batchSettings"')
      && !demoDatabaseSource.includes("batchSettings:"),
    usesBatchingHistory:
      html.includes('id="workspaceBatchingToggle"')
      && html.includes('href="#batching:history"')
      && html.includes('id="batchingHistoryPage"')
      && html.includes('id="batchingHistoryGrid"')
      && html.includes(">Batching History</span>")
      && inlineScript.includes("function initializeBatchingHistoryGrid(data)")
      && inlineScript.includes('demoApiRequest("/api/v1/fx-batches")')
      && inlineScript.includes('title: "Batch ID"')
      && inlineScript.includes('title: "Ccy Pair Code"')
      && inlineScript.includes('title: "Batch Status"')
      && inlineScript.includes('title: "Created At"')
      && serverSource.includes("function fxBatches()")
      && serverSource.includes(
        'pathname === "/api/v1/fx-batches" && method === "GET"'
      ),
    usesBatchStructure:
      html.includes('data-workspace-routes="batching-history batch-details"')
      && !html.includes('href="#batching:details"')
      && html.includes('<h1 class="page-title">Batch Structure</h1>')
      && !html.includes(">Batch Details<")
      && html.includes('id="batchDetailsPage"')
      && !html.includes('id="batchDetailsSelect"')
      && !html.includes('id="batchDetailsPickerSearch"')
      && html.includes('id="batchDetailsContent"')
      && html.includes('id="batchDetailsMembersGrid"')
      && html.includes('id="batchDetailsOutputsGrid"')
      && html.includes(
        'class="btn btn-sm btn-outline-secondary workbench-detail-back-button" href="#batching:history" aria-label="Back to Batching History"'
      )
      && html.includes('<span class="button-icon" aria-hidden="true">arrow_back</span>')
      && html.includes("This batch did not create any outputs.")
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
      && inlineScript.includes('batchStructureTradeColumns("memberRole")')
      && inlineScript.includes('batchStructureTradeColumns("outputRole")')
      && batchStructureColumnsSource.indexOf('title: "Trade ID"')
        < batchStructureColumnsSource.indexOf('title: "Trade Type"')
      && batchStructureColumnsSource.includes('title: "Base Ccy Leg"')
      && batchStructureColumnsSource.includes('title: "Quote Ccy Leg"')
      && batchStructureColumnsSource.includes('field: "baseBalanceContributionMinor"')
      && batchStructureColumnsSource.includes('field: "quoteBalanceContributionMinor"')
      && batchStructureColumnsSource.includes('title: "Base Ccy Value Date"')
      && batchStructureColumnsSource.includes('field: "baseCcyValueDate"')
      && batchStructureColumnsSource.includes('title: "Quote Ccy Value Date"')
      && batchStructureColumnsSource.includes('field: "quoteCcyValueDate"')
      && batchStructureColumnsSource.includes('bottomCalc: () => "NET"')
      && batchStructureColumnsSource.includes('bottomCalc: "sum"')
      && batchStructureColumnsSource.includes("function batchStructureTradeTypeFormatter")
      && batchStructureColumnsSource.includes("fxPositionTradeTypePresentation(trade)")
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
      && fxBatchBalanceDomainSource.includes(
        'baseBalanceContributionMinor: normalizedSide === "SELL"'
      )
      && fxBatchBalanceDomainSource.includes(
        'quoteBalanceContributionMinor: normalizedSide === "BUY"'
      )
      && serverSource.includes("function fxBatchDetails(batchId)")
      && serverSource.includes("members: content.members")
      && serverSource.includes("outputs: content.outputs")
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
      && fxPositionPageMarkup.includes('class="form-check-input select-all-checkbox"')
      && fxPositionPageMarkup.includes('aria-label="Ccy pair selector"')
      && (fxPositionPageMarkup.match(/>play_arrow<\/span>/g) || []).length === 2
      && (fxPositionPageMarkup.match(/>settings<\/span>/g) || []).length === 2
      && !fxPositionPageMarkup.includes("&#9654;")
      && !fxPositionPageMarkup.includes("&#9881;")
      && !fxPositionPageMarkup.includes('type="search"')
      && !fxPositionPageMarkup.includes("header-filter")
      && html.includes("#mainPage.fx-position-bootstrap.workbench-page .fx-position-grid")
      && html.includes("grid-template-columns: 136px minmax(0, 1fr)")
      && html.includes("grid-template-rows: minmax(0, 1fr) auto auto")
      && html.includes("#mainPage.fx-position-bootstrap.workbench-page .fx-position-grid thead")
      && html.includes("#mainPage.fx-position-bootstrap.workbench-page .fx-position-grid tfoot")
      && html.includes(".sell-check-zone .select-all-checkbox:is(:checked, :indeterminate)")
      && html.includes(".buy-check-zone .select-all-checkbox:is(:checked, :indeterminate)")
      && fxPositionPageMarkup.includes('title="Select all SELL deals · Shortcut: S"')
      && fxPositionPageMarkup.includes('title="Select all BUY deals · Shortcut: B"')
      && html.includes(".deal-toolbar .action-button.primary:hover:not(:disabled)")
      && html.includes(".deal-toolbar #editDealButton:is(:hover, :focus-visible):not(:disabled)"),
    usesBootstrapDealGenerationSettings: generationSettingsDialogMarkup.includes(
      'class="generation-dialog-title-block"'
    )
      && generationSettingsDialogMarkup.includes(
        'class="table table-sm table-hover align-middle generation-settings-table"'
      )
      && generationSettingsDialogMarkup.includes('class="dialog-close btn-close"')
      && html.includes('class="btn btn-sm btn-outline-primary generation-settings-save"')
      && html.includes(".generation-dialog .modal-header")
      && html.includes("font-family: var(--bs-body-font-family);")
      && html.includes(".generation-settings-table tbody tr:nth-child(even)"),
    showsAutoPricedClientDealGenerationMode:
      generationSettingsDialogMarkup.includes(">Pricing Mode</th>")
      && generationSettingsDialogMarkup.includes(
        "Generation settings for each AUTO_PRICED CLIENT Pricing Rule"
      )
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
    usesGroupedTradesNavigation: html.includes('id="workspaceTradesToggle"')
      && html.includes('aria-controls="workspaceTradesMenu"')
      && html.includes('data-workspace-nav-menu-toggle="workspaceTradesMenu"')
      && html.includes(
        'data-workspace-routes="client-fx-deals hedge-fx-deals"'
      )
      && html.includes('>currency_exchange</span>')
      && html.includes('id="workspaceTradesMenu" role="menu" aria-label="Trades" data-workspace-nav-menu hidden')
      && html.includes('class="workspace-nav-menu-link" href="#client-fx-deals"')
      && html.includes('class="workspace-nav-menu-link" href="#hedge-fx-deals"'),
    usesGroupedPricingWorkspace: html.includes(
      '<section class="home-navigation-group" aria-labelledby="homePricingTitle">'
    )
      && html.includes(
        '<h2 class="home-navigation-group-title" id="homePricingTitle">Pricing</h2>'
      )
      && html.includes('<nav class="home-links" aria-label="Pricing navigation">')
      && html.includes("#homePage.workbench-home .home-navigation-group {")
      && html.includes("grid-template-columns: repeat(3, minmax(220px, 1fr));"),
    usesGroupedTradesWorkspace: html.includes(
      '<section class="home-navigation-group" aria-labelledby="homeTradesTitle">'
    )
      && html.includes(
        '<h2 class="home-navigation-group-title" id="homeTradesTitle">Trades</h2>'
      )
      && html.includes('<nav class="home-links" aria-label="Trades navigation">')
      && html.includes('<span class="home-link-title">Client FX Deals</span>')
      && html.includes('<span class="home-link-title">Hedge FX Deals</span>'),
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
      && inlineScript.includes('title: "Trading Party Details"')
      && inlineScript.includes('title: "Trade Economics"')
      && inlineScript.includes('title: "Value Date Details"')
      && inlineScript.includes('title: "Pricing Details"')
      && !html.includes('id="hedgeFxDealsTable"'),
    persistsClientFxDealAttribution: inlineScript.includes("executionContextId:")
      && inlineScript.includes("pricingRuleId:")
      && inlineScript.includes("transferRate,")
      && inlineScript.includes("analyticalPnl,"),
    usesDedicatedAddClientDealFlow: addClientDealDialogMarkup.includes('id="addClientDealDialog"')
      && addClientDealDialogMarkup.includes('id="addClientDealForm"')
      && addClientDealDialogMarkup.includes('name="partyId"')
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
      && inlineScript.includes("pricingContextFacetsMarkup(context)")
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
        < addClientDealDialogMarkup.indexOf('id="addClientDealPartyId"')
      && addClientDealDialogMarkup.includes('class="client-deal-currency-pair-field"')
      && html.includes("grid-template-columns: max-content minmax(0, 1fr);")
      && html.includes(".client-deal-create-dialog .client-deal-currency-pair-field .form-select")
      && html.includes("width: calc(7ch + 4rem);")
      && /:is\(#addClientDealDialog, #addHedgeDealDialog\)[\s\S]*?\.client-deal-currency-pair-field \.form-select \{[\s\S]*?height: 44px;[\s\S]*?font-size: 15px;[\s\S]*?font-weight: 600;/.test(html),
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
      && inlineScript.includes('addClientDealForm.elements.partyId.value = "";'),
    usesSearchableAddHedgeDealCounterpartyPicker:
      addHedgeDealDialogMarkup.includes('id="addHedgeDealCounterpartyPickerValue" placeholder="Type Hedge Counterparty name..." role="combobox"')
      && addHedgeDealDialogMarkup.includes('aria-autocomplete="list"')
      && addHedgeDealDialogMarkup.includes('id="addHedgeDealCounterpartyPickerClear" aria-label="Clear Hedge Counterparty" hidden')
      && inlineScript.includes('function renderAddHedgeDealCounterpartyOptions(')
      && inlineScript.includes("function syncAddHedgeDealCounterpartyClearAvailability()")
      && inlineScript.includes('addHedgeDealCounterpartyPickerValue.addEventListener("input"')
      && inlineScript.includes('event.target.closest("#addHedgeDealCounterpartyPickerClear")')
      && inlineScript.includes('renderAddHedgeDealCounterpartyOptions(addHedgeDealCounterpartyPickerValue.value)'),
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
      (html.match(/<dialog\b/g) || []).length === 9
      && (html.match(/class="[^"]*btn-close[^"]*"[^>]*aria-label="Close"/g) || []).length === 9
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
      && addClientDealDialogMarkup.includes("Hold Ctrl and click Create Deal")
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
      && clientDealDuplicateCheckMarkup.includes('>Create Deal</span>')
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
    usesTradingPartiesLanguage: html.includes(">Trading Parties<")
      && html.includes(">Party Type<")
      && html.includes('name="partyType"'),
    usesTradingPartyBadgeIcon: (html.match(/>badge<\/span>/g) || []).length >= 3
      && !html.includes(">manage_accounts</span>"),
    usesTradingPartyColumnFilters: html.includes('id="tradingPartyTypeFilter"')
      && html.includes('id="tradingPartyCodeTypeFilter"')
      && html.includes('id="tradingPartyStatusFilter"')
      && (html.match(/data-trading-party-header-filter=/g) || []).length === 6
      && inlineScript.includes("tradingPartyHeaderFilterValue")
      && inlineScript.includes('tradingPartyIdSortDirection = "asc"'),
    usesBootstrapTradingPartyGrid: html.includes('class="profile-table reference-table client-profile-table unified-data-table"')
      && html.includes('class="btn btn-sm btn-outline-primary reference-new-button" id="clientProfileNewButton"')
      && html.includes('class="client-profile-actions-col"')
      && html.includes('data-profile-action="edit"')
      && html.includes('data-profile-action="remove"')
      && !html.includes("Trading Party List")
      && !html.includes("clientProfileSearchInput"),
    usesTradingPartyPricingContextBricks: inlineScript.includes("function pricingContextFacetsMarkup(contextOrId)")
      && html.includes(".client-pricing-rules-context-path")
      && inlineScript.includes('class="client-pricing-context-candidate-path client-pricing-rules-context-path"'),
    usesTradingPartyDetailRoutes: html.includes('id="clientProfileListView"')
      && html.includes('id="clientProfileDetailView"')
      && html.includes('id="clientProfileBackButton"')
      && html.includes('client-profile-back-button workbench-detail-back-button" id="clientProfileBackButton"')
      && inlineScript.includes("function clientProfileRouteStateFromLocation()")
      && inlineScript.includes("function syncClientProfileRouteView()")
      && inlineScript.includes("navigateToClientProfileIndex(index)"),
    usesInlineTradingPartyCreate: inlineScript.includes("function renderTradingPartyCreateRow(profile)")
      && inlineScript.includes("function startTradingPartyRowCreate()")
      && inlineScript.includes("function saveTradingPartyFromRow(row)")
      && inlineScript.includes("data-trading-party-edit-row")
      && inlineScript.includes('data-profile-action="save"')
      && inlineScript.includes('data-profile-action="cancel"')
      && inlineScript.includes('clientProfileNewButton.addEventListener("click", startTradingPartyRowCreate)')
      && inlineScript.includes("navigateToClientProfileIndex(actionIndex)")
      && !inlineScript.includes("function startTradingPartyRowEdit("),
    usesConstrainedTradingPartyWidth: html.includes("--trading-party-name-column-width: 420px")
      && html.includes("--trading-party-code-type-column-width: 184px")
      && html.includes("--trading-party-content-width: 1184px")
      && html.includes("--trading-party-frame-width: 1186px")
      && html.includes("width: min(var(--trading-party-frame-width), 100%)")
      && html.includes('class="form-field party-name-field"'),
    usesBootstrapPricingRuleDialog: html.includes('class="deal-dialog client-pricing-rule-dialog pricing-rule-bootstrap-dialog"')
      && html.includes('class="deal-form modal-content" id="clientPricingRuleForm"')
      && html.includes('class="dialog-head modal-header"')
      && html.includes('class="dialog-close btn-close" id="clientPricingRuleDialogClose"')
      && html.includes('class="dialog-actions modal-footer"')
      && html.includes(".pricing-rule-bootstrap-dialog .pricing-rule-bootstrap-section")
      && html.includes(".pricing-rule-bootstrap-dialog .modal-footer .btn"),
    usesMutedUnavailablePricingContextOptions: inlineScript.includes('option.matchCount === 0 ? " is-unavailable" : ""')
      && html.includes(".pricing-rule-bootstrap-dialog .client-pricing-context-option.is-unavailable")
      && html.includes("color: var(--bs-tertiary-color, #6c757d)")
      && html.includes(".client-pricing-context-option-count {\n      color: inherit;\n      font-weight: 400;"),
    usesFilterAwareSmartSizing: inlineScript.includes("function smartHeaderMinimumWidth(headerCell, policy)")
      && inlineScript.includes('headerCell.querySelector(".reference-filterable-head")')
      && inlineScript.includes("smartElementOuterWidth(filterTrigger)")
      && inlineScript.includes("const headerWidth = smartHeaderMinimumWidth(headerCell, policy)"),
    removesExecutionContextAssignments: !html.includes("clientExecutionContextAssignment")
      && !inlineScript.includes("executionContextIds")
      && !html.includes("Execution Context Assignment"),
    pricingRulesUseDirectExecutionContexts: html.includes('<section class="deal-form-section pricing-rule-bootstrap-section" aria-label="Execution Context">')
      && inlineScript.includes("availablePricingRuleExecutionContextIds()")
      && inlineScript.includes("Select an existing Execution Context."),
    usesPricingRuleContextBuilder: html.includes('id="clientPricingContextBuilder"')
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
      && html.includes("background: #eaf1f5")
      && html.includes("background: #edf0ea")
      && html.includes("background: #efedf1")
      && !html.includes("client-pricing-context-candidate-separator"),
    avoidsTradingPartyCodeAutoSelect: !inlineScript.includes("clientProfileForm.elements.inn.select()"),
    usesSynchronizedContextIcons: /data-reference-route="servicingBranch">\s*<span class="button-icon" aria-hidden="true">location_on<\/span>/.test(html)
      && /data-reference-route="tradeCaptureChannel">\s*<span class="button-icon" aria-hidden="true">terminal<\/span>/.test(html)
      && /client-pricing-context-facet-icon" aria-hidden="true">location_on<\/span>/.test(html)
      && /client-pricing-context-facet-icon" aria-hidden="true">terminal<\/span>/.test(html),
    supportsRequiredPartyTypes: inlineScript.includes('["CLIENT", "HEDGE_COUNTERPARTY"]')
      && !inlineScript.includes('"EXTERNAL_COUNTERPARTY"')
      && !inlineScript.includes('"INTERNAL_DESK"'),
    supportsRequiredPartyCodeTypes: inlineScript.includes('["INN", "OTHER", "FRONT_SYSTEM_FOLDER_ID"]')
      && serverSource.includes('["INN", "OTHER", "FRONT_SYSTEM_FOLDER_ID"]')
      && serverSource.includes("'FRONT_SYSTEM_FOLDER_ID'")
      && html.includes('<option value="FRONT_SYSTEM_FOLDER_ID">FRONT_SYSTEM_FOLDER_ID</option>'),
    usesExplicitTooltipLayer: html.includes('id="appTooltip" role="tooltip" aria-hidden="true" popover="manual"')
      && inlineScript.includes("initializeTooltips();")
      && inlineScript.includes("suppressNativeTooltips();")
      && inlineScript.includes('typeof appTooltipEl.showPopover === "function"')
      && inlineScript.includes('target.closest("dialog") || document.body'),
    explicitTooltipCount: (html.match(/\bdata-tooltip=/g) || []).length,
    usesExplicitTradeIdCopy: html.includes('data-copy-trade-id="${safeTradeId}"')
      && inlineScript.includes("function fxPositionTradeId(deal)")
      && inlineScript.includes("showTradeIdCopyFeedback(copyButton, copied)")
      && html.includes('data-tooltip="Copy Trade ID"')
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
      && html.includes('Exec. Context Count')
      && !html.includes('id="servicingLocationUsageInfo"'),
    usesServicingLocationIdSort: html.includes('id="servicingBranchIdSort"')
      && html.includes('id="servicingBranchIdHeader" aria-sort="ascending"')
      && inlineScript.includes('servicingBranchIdSortDirection = "asc"'),
    usesAccountingSystemTextLimits: html.includes('data-reference-field="settlementSystemId"')
      && html.includes('data-reference-field="settlementSystemId" value="${escapeHtml(item.settlementSystemId)}" maxlength="20"')
      && html.includes('data-reference-field="settlementSystemName" value="${escapeHtml(item.settlementSystemName)}" maxlength="50"')
      && serverSource.includes('ACCOUNTING_SYSTEM_ID_MAX_LENGTH = 20')
      && html.includes('Exec. Context Count')
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
      && html.includes('<span class="reference-column-title">Exec. Context Count</span>')
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
      && inlineScript.includes('data-pricing-context-edit-row'),
    usesExecutionSystemNameOnly: inlineScript.includes("item => item.tradeCaptureChannelName"),
    usesExecutionContextNames: html.includes(">Servicing Location</span>")
      && html.includes(">Accounting System</span>")
      && html.includes(">Execution System</span>"),
    usesExecutionContextUsage: html.includes(">Pricing Rules Count</span>")
      && !html.includes('id="pricingContextUsageInfo"'),
    usesExecutionContextColumnWidths: html.includes("--pricing-context-id-width: 9ch")
      && html.includes("--pricing-context-location-width: 52ch")
      && html.includes("--pricing-context-accounting-width: 52ch")
      && html.includes("--pricing-context-execution-width: 52ch")
      && html.includes("--pricing-context-count-width: 20ch")
      && !html.includes(">Execution Context List<"),
    usesExecutionContextHeaderFiltersAndSort: html.includes('id="pricingContextIdSort"')
      && html.includes('id="pricingContextIdHeader" aria-sort="ascending"')
      && (html.match(/data-pricing-context-header-filter=/g) || []).length === 4
      && inlineScript.includes('pricingContextIdSortDirection = "asc"')
      && inlineScript.includes("pricingContextMatchesHeaderFilters"),
    usesConciseIntegerIdHeaders: html.includes('<table class="profile-table pricing-context-table unified-data-table" data-fixed-column-widths>')
      && html.includes('<table class="profile-table pricing-rules-table unified-data-table" data-fixed-column-widths>')
      && html.includes('id="pricingRuleIdSort"')
      && html.includes('id="pricingRuleIdHeader" aria-sort="ascending"')
      && (html.match(/data-pricing-rule-header-filter=/g) || []).length === 7
      && inlineScript.includes('pricingRuleIdSortDirection = "asc"')
      && inlineScript.includes('function updatePricingRuleIdSortControl()')
      && !html.includes('<input type="text" name="pricingContextId" placeholder="Assigned on save" readonly>')
      && !html.includes('id="pricingContextSearchInput"')
      && !html.includes("<th>Execution Context ID</th>")
      && !html.includes("<th>Pricing Rule ID</th>"),
    usesHumanReadablePricingRuleContexts: inlineScript.includes("function pricingContextDisplayPath(contextOrId)")
      && inlineScript.includes("pricingContextDisplayPath(rule.pricingContextId)")
      && inlineScript.includes('class="client-pricing-context-candidate-path pricing-rules-context-path"')
      && inlineScript.includes("pricingContextFacetsMarkup(rule.pricingContextId)")
      && html.includes('<th class="pricing-rule-context-column">')
      && html.includes('<span class="reference-column-title">Execution Context</span>')
      && html.includes('--pricing-rule-context-width: 82ch'),
    usesLocalBootstrapAndTabulator: html.includes('./vendor/bootstrap/bootstrap.min.css')
      && html.includes('./vendor/tabulator/tabulator_bootstrap5.min.css')
      && html.includes('./vendor/tabulator/tabulator.min.js')
      && fs.existsSync(path.join(root, 'vendor', 'bootstrap', 'bootstrap.min.css'))
      && fs.existsSync(path.join(root, 'vendor', 'tabulator', 'tabulator_bootstrap5.min.css'))
      && fs.existsSync(path.join(root, 'vendor', 'tabulator', 'tabulator.min.js')),
    usesBootstrapMarketPulse: /<main class="[^"]*\bmarket-bootstrap\b[^"]*" id="marketPage"/.test(html)
      && html.includes('class="nav nav-underline market-tabs reference-switcher"')
      && html.includes('class="btn btn-sm btn-primary" id="marketStreamToggleButton"')
      && html.includes('class="market-bootstrap-dialog market-simulation-dialog" id="marketSimulationDialog"'),
    usesTabulatorMarketPulseGrids: html.includes('id="marketCcyOptionRows"')
      && html.includes('id="marketPairOptionRows"')
      && html.includes('id="marketStreamTable"')
      && inlineScript.includes('marketCcyOptionGrid = new Tabulator')
      && inlineScript.includes('marketPairOptionGrid = new Tabulator')
      && inlineScript.includes('marketStreamGrid = new Tabulator')
      && inlineScript.includes('marketStreamGrid.updateData'),
    usesCompactStaticMarketStreamColumns: inlineScript.includes('{ title: "Ccy Pair", field: "currencyPair", width: 104, minWidth: 104, headerFilter: "input", headerSort: true }')
      && inlineScript.includes('title: "Bid",\n            field: "bid",\n            width: 120,\n            minWidth: 120,\n            headerSort: false')
      && inlineScript.includes('title: "Offer",\n            field: "offer",\n            width: 120,\n            minWidth: 120,\n            headerSort: false')
      && inlineScript.includes('width: 120')
      && inlineScript.includes('width: workbenchActionsColumnWidth')
      && html.includes('[data-market-panel="streams"] .market-grid-frame')
      && html.includes('width: min(426px, 100%);'),
    usesMarketPulseRoute: html.includes('href="#market-pulse" data-workspace-route="market"')
      && html.includes('href="#market-pulse:streams" data-market-route="streams"')
      && inlineScript.includes('function marketRoute(kind = "streams")')
      && inlineScript.includes('return "#market-pulse:streams";')
      && inlineScript.includes('location.hash === "#market-pulse"')
      && inlineScript.includes('location.hash.startsWith("#market:")'),
    usesCcyOptionLimits: serverSource.includes('CCY_OPTION_NAME_MAX_LENGTH = 20')
      && serverSource.includes('CCY_OPTION_COUNTRY_MAX_LENGTH = 30')
      && serverSource.includes('function migrateCcyOptionsConstraints(sqlite)')
      && inlineScript.includes('const ccyOptionTextLimits = Object.freeze({ code: 3, name: 20, country: 30 });')
      && inlineScript.includes('pattern="${pattern}"')
      && inlineScript.includes('function marketCcyTextIsValid(value, maxLength)'),
    usesCompactCcyOptionColumns: inlineScript.includes('const ccyOptionColumnWidths = Object.freeze({')
      && inlineScript.includes('code: 104')
      && inlineScript.includes('name: 176')
      && inlineScript.includes('country: 248')
      && inlineScript.includes('fractionDigits: 116')
      && inlineScript.includes('pairCount: 92')
      && html.includes('[data-market-panel="currencies"] .market-grid-frame')
      && html.includes('width: min(816px, 100%);')
      && inlineScript.includes('headerSort: true')
      && (inlineScript.match(/headerSort: false/g) || []).length >= 6
      && inlineScript.includes('initialSort: [{ column: "code", dir: "asc" }]'),
    usesCompactCcyPairOptionColumns: inlineScript.includes('const ccyPairOptionColumnWidths = Object.freeze({')
      && inlineScript.includes('baseCcy: 88')
      && inlineScript.includes('quoteCcy: 88')
      && inlineScript.includes('currencyPair: 104')
      && inlineScript.includes('defaultQuoteDecimals: 176')
      && inlineScript.includes('pricingRulesCount: 144')
      && inlineScript.includes('initialSort: [{ column: "currencyPair", dir: "asc" }]')
      && inlineScript.includes('title: "Pricing Rules Count", field: "pricingRulesCount"')
      && inlineScript.includes('Delete unavailable: ${item.currencyPair} is used in ${pricingRulesCount} ${ruleLabel}.')
      && html.includes('[data-market-panel="pairs"] .market-grid-frame')
      && html.includes('width: min(680px, 100%);'),
    usesUnifiedActionsColumnWidth: html.includes('--workbench-actions-column-width: 80px;')
      && inlineScript.includes('width: workbenchActionsColumnWidth')
      && html.includes('--settlement-system-actions-width: var(--workbench-actions-column-width);')
      && html.includes('--trade-capture-channel-actions-width: var(--workbench-actions-column-width);'),
    usesUnifiedFilterFocus: html.includes('Header filters and inline Reference Data editors share one non-shifting Bootstrap focus treatment.')
      && html.includes('.tabulator-header-filter input:focus,')
      && html.includes('.reference-header-filter:focus,')
      && html.includes('.inline-edit-control:focus {'),
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
    usesSemanticMarketCommands: html.includes('class="btn btn-sm btn-outline-primary" id="marketCcyOptionNewButton"')
      && html.includes('class="btn btn-sm btn-outline-primary" id="marketPairOptionNewButton"')
      && inlineScript.includes('marketStreamToggleButton.classList.toggle("btn-primary", !marketStreamRunning)')
      && inlineScript.includes('marketStreamToggleButton.classList.toggle("btn-outline-danger", marketStreamRunning)'),
    usesSeparatedDialogActions: html.includes('.market-bootstrap-dialog .modal-footer > * {')
      && /\.market-bootstrap-dialog \.modal-footer \{[\s\S]*?gap: 8px;/.test(html)
      && /\.dialog-actions \{[\s\S]*?gap: 8px;/.test(html)
      && /\.profile-form-actions \{[\s\S]*?gap: 8px;/.test(html),
    avoidsDoubleTabbedPageDividers: /#marketPage\.market-bootstrap\.workbench-page \.settings-topbar,\s*#referenceDataPage\.unified-bootstrap-workspace\.workbench-page \.settings-topbar \{\s*padding-bottom: 0;\s*border-bottom: 0;/.test(html),
    usesLargeClientFxDealsTabulator: html.includes('id="clientFxDealsPage"')
      && html.includes('client-deals-bootstrap workbench-page')
      && html.includes('id="clientFxDealsGrid"')
      && !html.includes('id="clientFxDealsTable"')
      && !html.includes('id="clientFxDealRows"')
      && inlineScript.includes('clientFxDealsGrid = new Tabulator')
      && inlineScript.includes('renderVertical: "virtual"')
      && inlineScript.includes('layout: "fitData"')
      && inlineScript.includes('title: "Trade Details"')
      && inlineScript.includes('title: "Trade ID"')
      && inlineScript.includes('title: "Client Details"')
      && inlineScript.includes('title: "Entry Timestamp"')
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
      && inlineScript.includes('transferRate: { width: 136, minWidth: 128 }')
      && inlineScript.includes('tabulatorSizedColumn("transferRate", { title: "Transfer Rate"')
      && inlineScript.includes('deal?.inn || deal?.clientCode || ""')
      && inlineScript.includes('title: "FX Position Processing"')
      && inlineScript.includes('title: "Transfer Rate"')
      && inlineScript.includes('title: "Analytical PnL"')
      && inlineScript.includes('title: "Client Code Type", field: "clientCodeType", headerSort: false')
      && inlineScript.includes('title: "Client Code", field: "clientCode", headerSort: false')
      && inlineScript.includes('title: "Client Side", field: "side", headerSort: false')
      && inlineScript.includes('title: "Tenor", field: "tenor", headerSort: false')
      && inlineScript.includes('title: "Execution Context", field: "executionContextLabel", headerSort: false')
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
      && html.includes('<th class="section-name common-title" colspan="3">SHARED TRADE ATTRIBUTES</th>')
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
      && serverSource.includes('"FX_BATCH_TECHNICAL_TRADES_IMMUTABLE"')
      && schemaSource.includes("CREATE TABLE IF NOT EXISTS fx_demo_hidden_batches"),
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
      && serverSource.includes('DELETE FROM fx_trade_exposure;')
      && serverSource.includes('DELETE FROM fx_batches;')
      && serverSource.includes("DELETE FROM sqlite_sequence WHERE name = 'fx_batches';")
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
      && html.includes('return { min: 70, max: 76, pad: 14, ellipsize: false };'),
    usesFxPositionHedgeDealTerminology: (html.match(/>Add Hedge Deal<\/button>/g) || []).length === 2
      && html.includes('<span class="hedge-deals-center-label">Hedge Deals</span>')
      && html.includes('id="addHedgeSellDealButton"')
      && html.includes('id="addHedgeBuyDealButton"')
      && !html.includes('id="deleteHedgeDealDemoButton"')
      && !inlineScript.includes("function selectedDeletableHedgeDeals()")
      && !inlineScript.includes("async function deleteSelectedHedgeDealsForDemo()")
      && !html.includes("Add Market Deal")
      && !html.includes("Market Deals"),
    usesCentralTabulatorColumnSizing: inlineScript.includes('const TABULATOR_COLUMN_SIZES = Object.freeze({')
      && inlineScript.includes('function tabulatorSizedColumn(size, definition)')
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
      && html.includes('#pricingRulesPage.unified-bootstrap-workspace.workbench-page .pricing-rules-table {'),
    usesPricingRulesHeaderLayout: html.includes(':is(#pricingPage, #referenceDataPage, #pricingRulesPage).unified-bootstrap-workspace .reference-column-head {')
      && html.includes(':is(#pricingPage, #referenceDataPage, #pricingRulesPage).unified-bootstrap-workspace .reference-header-filter {')
      && html.includes(':is(#pricingPage, #referenceDataPage, #pricingRulesPage).unified-bootstrap-workspace .reference-sort-control {'),
    usesExecutionContextRoute: html.includes('href="#execution-context" data-workspace-route="pricing"')
      && html.includes('function pricingRoute() {\n      return "#execution-context";')
      && inlineScript.includes('location.hash === pricingRoute() || location.hash === "#pricing"'),
    usesBootstrapReferenceDataControls: (html.match(/btn btn-sm btn-outline-primary reference-new-button/g) || []).length === 5
      && inlineScript.includes('btn btn-sm btn-outline-secondary reference-grid-action')
      && inlineScript.includes('btn btn-sm btn-outline-danger reference-grid-action')
      && html.includes('<span class="reference-column-title">Exec. Context Count</span>'),
    usesUniformReferenceDataGrid: html.includes('#referenceDataPage.unified-bootstrap-workspace .reference-table {')
      && html.includes('border-collapse: separate;')
      && html.includes('#referenceDataPage.unified-bootstrap-workspace .reference-table tbody tr:nth-child(even) td {')
      && html.includes('class="nav nav-underline reference-switcher"'),
    usesUnifiedDataGridLineSystem: html.includes('--data-grid-line-width: 1px;')
      && html.includes('--data-grid-line-color: var(--bs-border-color, #dee2e6);')
      && html.includes('#marketPage.market-bootstrap .market-tabulator,')
      && html.includes('.client-deals-bootstrap .tabulator,')
      && html.includes('#referenceDataPage.unified-bootstrap-workspace .reference-table thead tr th,'),
    usesOwnedRoundedTableFrames: html.includes('Keep a single, clipping owner for every rounded data-grid outline.')
      && html.includes(':is(#pricingPage, #pricingRulesPage, #databasePage).unified-bootstrap-workspace.workbench-page .profile-table-wrap')
      && html.includes('#pricingRulesPage.unified-bootstrap-workspace.workbench-page .profile-table-wrap,')
      && html.includes('width: fit-content;'),
    usesCentralWorkbenchDesignContract: html.includes('--workbench-title-size: 22px;')
      && html.includes('--workbench-grid-size: 12px;')
      && html.includes('--workbench-grid-row-height: 36px;')
      && html.includes('--workbench-grid-header-bg: var(--bs-tertiary-bg, #f8f9fa);')
      && html.includes('class="home-shell workbench-page workbench-home"')
      && html.includes('class="settings-shell profile-shell market-shell market-bootstrap workbench-page"')
      && html.includes('class="shell blotter-shell client-deals-bootstrap workbench-page"')
      && html.includes('.workbench-grid-toolbar,')
      && html.includes('border: var(--data-grid-line-width) solid var(--data-grid-line-color);'),
    usesSingleMarketOuterEdge: /#marketPage\.market-bootstrap\.workbench-page \.market-tabulator \.tabulator-header \.tabulator-col\.market-grid-actions-cell,\s*#marketPage\.market-bootstrap\.workbench-page \.market-tabulator \.tabulator-row \.tabulator-cell\.market-grid-actions-cell \{\s*border-right: 0;\s*\}/.test(html),
    usesSingleClientDealsOuterEdge: html.includes('.tabulator-header .client-deals-group-position-processing .tabulator-col-group-cols > .tabulator-col:not([style*="display: none"]):not(:has(~ .tabulator-col:not([style*="display: none"])))')
      && html.includes('.tabulator-row .tabulator-cell:not([style*="display: none"]):not(:has(~ .tabulator-cell:not([style*="display: none"]))) {'),
    avoidsMarketScrollbarGutter: /#marketPage\.market-bootstrap\.workbench-page \.market-grid-frame \{\s*overflow: hidden;\s*\}/.test(html)
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
      bidMax: 1.1222
    }],
    now: () => timestamp,
    random: () => 0.5
  });
  const started = simulator.start();
  timestamp += 1000;
  const refreshed = simulator.refresh();
  const stopped = simulator.stop();
  simulator.dispose();

  return {
    startedRunning: started.running,
    refreshedRunning: refreshed.running,
    stoppedRunning: stopped.running,
    startedQuote: started.quotes[0],
    refreshedQuote: refreshed.quotes[0]
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
    const tradingPartiesTable = await request("GET", "/api/database/tables/trading_parties");
    const usersTable = await request("GET", "/api/database/tables/users");
    const pricingRulesTable = await request("GET", "/api/database/tables/pricing_rules");
    const clientDealGenerationSettingsTable = await request(
      "GET",
      "/api/database/tables/client_deal_generation_settings"
    );
    const fxTradeExposureTable = await request("GET", "/api/database/tables/fx_trade_exposure");
    const fxTradeMarketSnapshotTable = await request("GET", "/api/database/tables/fx_trade_market_snapshot");
    const clientFxDealsTable = await request("GET", "/api/database/tables/client_fx_deals");
    const hedgeFxDealsTable = await request("GET", "/api/database/tables/fx_hedge_deals");
    const fxTradeBatchesTable = await request(
      "GET",
      "/api/database/tables/fx_batches"
    );
    const batchBalancingTradesTable = await request(
      "GET",
      "/api/database/tables/fx_batch_members"
    );
    const legacyAssignmentTable = await request("GET", "/api/database/tables/trading_party_execution_contexts");
    const servicingLocations = await request("GET", "/api/v1/servicing-locations");
    const accountingSystems = await request("GET", "/api/v1/accounting-systems");
    const executionSystems = await request("GET", "/api/v1/execution-systems");
    const executionContexts = await request("GET", "/api/v1/execution-contexts");
    const tradingParties = await request("GET", "/api/v1/trading-parties");
    const users = await request("GET", "/api/v1/users");
    const pricingRules = await request("GET", "/api/v1/pricing-rules");
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
    const createFxBatch = await request(
      "POST",
      "/api/v1/fx-batches",
      { idempotencyKey: "verify-batch-41", tradeIds: [41] }
    );
    const fxBatchHistoryAfterCreate = await request("GET", "/api/v1/fx-batches");
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
    const rejectReformedBatchTechnicalDelete = await request(
      "POST",
      "/api/v1/fx-batches/demo-hide-technical-trades",
      { batchIds: [reformedFxBatch.body?.batchId] }
    );
    const fxPositionsAfterRejectedTechnicalDelete = await request("GET", "/api/v1/fx-positions");
    const fxBatchHistoryAfterRejectedTechnicalDelete = await request("GET", "/api/v1/fx-batches");
    const fxDemoHiddenBatchesAfterRejectedDelete = await request(
      "GET",
      "/api/database/tables/fx_demo_hidden_batches"
    );
    const fxTradeExposureAfterRejectedTechnicalDelete = await request(
      "GET",
      "/api/database/tables/fx_trade_exposure"
    );
    const fxBatchMembersAfterRejectedTechnicalDelete = await request(
      "GET",
      "/api/database/tables/fx_batch_members"
    );
    const fxBatchOutputsAfterRejectedTechnicalDelete = await request(
      "GET",
      "/api/database/tables/fx_batch_outputs"
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
      rule.partyId === 1
      && rule.executionContextId === clientDealExecutionContextId
      && rule.ccyPairCode === "EUR_USD"
    )?.pricingRuleId;
    const nonDealerPricedExecutionContextId = executionContexts.body?.find(context =>
      context.servicingLocationId === "002"
      && context.accountingSystemId === "AFINA"
      && context.executionSystemId === "CLICK_TRADE_EFX"
    )?.executionContextId;
    const nonDealerPricedPricingRuleId = pricingRules.body?.find(rule =>
      rule.partyId === 1
      && rule.executionContextId === nonDealerPricedExecutionContextId
      && rule.ccyPairCode === "EUR_USD"
    )?.pricingRuleId;
    const clientFxDealPayload = {
      entryTimestamp: "2026-07-16T10:15:30.000Z",
      partyId: 1,
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
    const invalidClientFxDealParty = await request("POST", "/api/v1/client-fx-deals", {
      ...clientFxDealPayload,
      partyId: 999999
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
      partyId: 2
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
    const startClientDealGenerationProcess = await request(
      "POST",
      "/api/v1/client-deal-generation/process/start"
    );
    const clientDealGenerationProcessStatus = await request(
      "GET",
      "/api/v1/client-deal-generation/process"
    );
    const stopClientDealGenerationProcess = await request(
      "POST",
      "/api/v1/client-deal-generation/process/stop"
    );
    const processGeneratedTradeId = Number(
      startClientDealGenerationProcess.body?.lastGeneratedTradeId
    );
    const rejectProcessGeneratedClientFxDealDelete = await request(
      "DELETE",
      `/api/v1/client-fx-deals/${processGeneratedTradeId}`
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
      bidMax: 1.2
    });
    const getSettings = await request("GET", "/api/v1/ccy-pair-options/QAA_EUR/simulation-settings");
    const patchPair = await request("PATCH", "/api/v1/ccy-pair-options/QAA_EUR", {
      defaultQuoteDecimals: 4
    });
    const deleteSettings = await request("DELETE", "/api/v1/ccy-pair-options/QAA_EUR/simulation-settings");
    const restoreSettings = await request("PUT", "/api/v1/ccy-pair-options/QAA_EUR/simulation-settings", {
      bidMin: 1.1,
      spread: 0.0002,
      bidMax: 1.2
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
    const createTradingParty = await request("POST", "/api/v1/trading-parties", {
      partyType: "HEDGE_COUNTERPARTY",
      partyCode: "FRONT_FOLDER_1",
      partyCodeType: "FRONT_SYSTEM_FOLDER_ID",
      partyName: "Verification FX Desk",
      active: true
    });
    const tradingPartyId = encodeURIComponent(createTradingParty.body?.partyId ?? "");
    const updateTradingParty = await request("PUT", `/api/v1/trading-parties/${tradingPartyId}`, {
      partyType: "HEDGE_COUNTERPARTY",
      partyCode: "VERIFY_FOLDER",
      partyCodeType: "FRONT_SYSTEM_FOLDER_ID",
      partyName: "Verification Counterparty",
      active: false
    });
    const duplicateTradingParty = await request("POST", "/api/v1/trading-parties", {
      partyType: "CLIENT",
      partyCode: "7701234567",
      partyCodeType: "INN",
      partyName: "Duplicate Client",
      active: true
    });
    const invalidLegacyExternalPartyType = await request("POST", "/api/v1/trading-parties", {
      partyType: "EXTERNAL_COUNTERPARTY",
      partyCode: "VERIFY_EXTERNAL",
      partyCodeType: "OTHER",
      partyName: "Invalid Legacy External Counterparty",
      active: true
    });
    const invalidLegacyInternalPartyType = await request("POST", "/api/v1/trading-parties", {
      partyType: "INTERNAL_DESK",
      partyCode: "VERIFY_INTERNAL",
      partyCodeType: "OTHER",
      partyName: "Invalid Legacy Internal Desk",
      active: true
    });
    const invalidTradingPartyCodeType = await request("POST", "/api/v1/trading-parties", {
      partyType: "CLIENT",
      partyCode: "VERIFY_LEI",
      partyCodeType: "LEI",
      partyName: "Invalid Code Type",
      active: true
    });
    const invalidTradingPartyCodeLength = await request("POST", "/api/v1/trading-parties", {
      partyType: "CLIENT",
      partyCode: "X".repeat(21),
      partyCodeType: "OTHER",
      partyName: "Invalid Code Length",
      active: true
    });
    const invalidTradingPartyNameLength = await request("POST", "/api/v1/trading-parties", {
      partyType: "CLIENT",
      partyCode: "VERIFY_NAME_LIMIT",
      partyCodeType: "OTHER",
      partyName: "X".repeat(201),
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
      partyId: createTradingParty.body?.partyId,
      executionContextId: emeraldClickContextId,
      ccyPairCode: "EUR_USD",
      marginPercent: 0.25
    });
    const pricingRuleId = encodeURIComponent(createPricingRule.body?.pricingRuleId ?? "");
    const updatePricingRule = await request("PUT", `/api/v1/pricing-rules/${pricingRuleId}`, {
      partyId: createTradingParty.body?.partyId,
      executionContextId: wonderlandRfqContextId,
      ccyPairCode: "EUR_USD",
      marginPercent: 0.3
    });
    const duplicatePricingRule = await request("POST", "/api/v1/pricing-rules", {
      partyId: createTradingParty.body?.partyId,
      executionContextId: wonderlandRfqContextId,
      ccyPairCode: "EUR_USD",
      marginPercent: 0.4
    });
    const invalidPricingRuleParty = await request("POST", "/api/v1/pricing-rules", {
      partyId: 999999,
      executionContextId: wonderlandRfqContextId,
      ccyPairCode: "EUR_USD",
      marginPercent: 0.4
    });
    const invalidPricingRuleMargin = await request("POST", "/api/v1/pricing-rules", {
      partyId: createTradingParty.body?.partyId,
      executionContextId: neverlandRfqContextId,
      ccyPairCode: "EUR_USD",
      marginPercent: 100
    });
    const blockedTradingPartyDelete = await request("DELETE", `/api/v1/trading-parties/${tradingPartyId}`);
    const deletePricingRule = await request("DELETE", `/api/v1/pricing-rules/${pricingRuleId}`);
    const deleteTradingParty = await request("DELETE", `/api/v1/trading-parties/${tradingPartyId}`);
    const tradingPartiesAfterDelete = await request("GET", "/api/v1/trading-parties");
    const createHedgeCounterparty = await request("POST", "/api/v1/trading-parties", {
      partyType: "HEDGE_COUNTERPARTY",
      partyCode: "VERIFY_HEDGE",
      partyCodeType: "OTHER",
      partyName: "Verification Hedge Counterparty",
      active: true
    });
    const createDealerApprovedHedgePricingRule = await request("POST", "/api/v1/pricing-rules", {
      partyId: createHedgeCounterparty.body?.partyId,
      executionContextId: neverlandRfqContextId,
      ccyPairCode: "EUR_USD",
      marginPercent: 0.12
    });
    const createHedgePricingRule = await request("POST", "/api/v1/pricing-rules", {
      partyId: createHedgeCounterparty.body?.partyId,
      executionContextId: clientDealExecutionContextId,
      ccyPairCode: "EUR_USD",
      marginPercent: 0.15
    });
    const hedgeDealPricingRules = await request("GET", "/api/v1/hedge-deal-pricing-rules");
    const createHedgeFxDeal = await request("POST", "/api/v1/hedge-fx-deals", {
      pricingRuleId: createHedgePricingRule.body?.pricingRuleId,
      ccyPairCode: "EUR_USD",
      side: "BUY",
      dealtCcyCode: "USD",
      dealtCcyAmount: "2808500",
      tradeRate: "1.1234",
      tenor: "TOD"
    });
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
    const migratedExposureRow = fxTradeExposureTable.body?.rows?.find(row => row.trade_id === 41) || null;
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
    const flatBatchSourceDatabase = new DatabaseSync(verificationDatabasePath);
    flatBatchSourceDatabase.exec("PRAGMA foreign_keys = ON");
    const insertFlatBatchExposure = flatBatchSourceDatabase.prepare(`
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
      VALUES (?, 'CLIENT_DEAL', '2026-07-15', 'EUR_USD', ?, 'EUR',
        100000000, 2, ?, 2, ?, 'TOM', '2026-07-16', '2026-07-16')
    `);
    const insertFlatBatchClientDeal = flatBatchSourceDatabase.prepare(`
      INSERT INTO client_fx_deals
        (
          trade_id,
          trade_type,
          party_id,
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
        "SELL",
        112300000,
        1.123
      ).lastInsertRowid
    );
    insertFlatBatchClientDeal.run(flatSellTradeId, 1.123);
    const flatBuyTradeId = Number(
      insertFlatBatchExposure.run(
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
        o.trade_id AS tradeId,
        o.output_role AS outputRole,
        e.trade_type AS tradeType,
        e.base_ccy_side AS side,
        e.base_ccy_amount_minor AS baseCcyAmountMinor,
        e.quote_ccy_amount_minor AS quoteCcyAmountMinor,
        e.trade_rate AS tradeRate
      FROM fx_batch_outputs o
      INNER JOIN fx_trade_exposure e
        ON e.trade_id = o.trade_id AND e.trade_type = o.trade_type
      WHERE o.batch_id = ?
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
      request("GET", "/api/v1/trading-parties"),
      request("GET", "/api/v1/pricing-rules"),
      request("GET", "/api/v1/client-deal-generation/settings")
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
      request("GET", "/api/v1/trading-parties"),
      request("GET", "/api/v1/pricing-rules"),
      request("GET", "/api/v1/client-deal-generation/settings")
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
      "client_fx_deals",
      "fx_hedge_deals",
      "fx_trade_market_snapshot",
      "fx_batches",
      "fx_batch_members",
      "fx_batch_outputs",
      "fx_demo_hidden_batches"
    ].map(tableName => Number(
      demoResetProbe.prepare(`SELECT COUNT(*) AS count FROM ${tableName}`).get().count
    ));
    const demoResetDeleteTriggers = demoResetProbe.prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'trigger'
        AND name IN
        (
          'trg_fx_batch_members_immutable_delete',
          'trg_fx_batch_outputs_immutable_delete',
          'trg_fx_batches_immutable_delete'
        )
      ORDER BY name
    `).all();
    const demoResetBatchSequence = demoResetProbe.prepare(`
      SELECT seq
      FROM sqlite_sequence
      WHERE name = 'fx_batches'
    `).get();
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
      tradingPartyConstraintsMigrated: tradingPartiesTable.body?.createSql?.includes("length(party_code) <= 20")
        && tradingPartiesTable.body?.createSql?.includes("length(party_name) BETWEEN 1 AND 200")
        && tradingPartiesTable.body?.createSql?.includes("is_active IN (0, 1)")
        && tradingPartiesTable.body?.createSql?.includes("'HEDGE_COUNTERPARTY'")
        && tradingPartiesTable.body?.createSql?.includes("'FRONT_SYSTEM_FOLDER_ID'")
        && !tradingPartiesTable.body?.createSql?.includes("'EXTERNAL_COUNTERPARTY'")
        && !tradingPartiesTable.body?.createSql?.includes("'INTERNAL_DESK'"),
      userConstraintsMigrated: usersTable.body?.createSql?.includes("length(user_code) BETWEEN 2 AND 30")
        && usersTable.body?.createSql?.includes("length(trim(first_name)) BETWEEN 1 AND 50")
        && usersTable.body?.createSql?.includes("length(trim(last_name)) BETWEEN 1 AND 50")
        && usersTable.body?.createSql?.includes("'DEALER', 'SUPERVISOR', 'ADMIN'")
        && usersTable.body?.createSql?.includes("is_active IN (0, 1)"),
      pairColumns: pairTable.body?.columns?.map(column => column.name) || [],
      pairForeignKeys: pairTable.body?.foreignKeys?.length ?? -1,
      settingsForeignKeys: settingsTable.body?.foreignKeys || [],
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
        createdId: createExecutionContext.body?.executionContextId,
        createdAccountingSystemId: createExecutionContext.body?.accountingSystemId,
        updatedId: updateExecutionContext.body?.executionContextId,
        usageAfterCreate: servicingLocationsAfterContextCreate.body
          ?.find(location => location.servicingLocationId === "SITE-998")?.executionContextCount,
        usageAfterDelete: servicingLocationsAfterContextDelete.body
          ?.find(location => location.servicingLocationId === "SITE-998")?.executionContextCount
      },
      tradingPartyColumns: tradingPartiesTable.body?.columns?.map(column => column.name) || [],
      userColumns: usersTable.body?.columns?.map(column => column.name) || [],
      legacyAssignmentTableRemoved: legacyAssignmentTable.statusCode === 404,
      pricingRuleColumns: pricingRulesTable.body?.columns?.map(column => column.name) || [],
      pricingRuleExecutionContextIdType: pricingRulesTable.body?.columns
        ?.find(column => column.name === "execution_context_id")?.type,
      pricingRuleForeignKeys: pricingRulesTable.body?.foreignKeys || [],
      clientDealGenerationSettingsColumns: clientDealGenerationSettingsTable.body?.columns
        ?.map(column => column.name) || [],
      clientDealGenerationSettingsForeignKeys: clientDealGenerationSettingsTable.body?.foreignKeys || [],
      clientDealGenerationSettings: {
        count: clientDealGenerationSettingsTable.body?.rowCount ?? -1,
        allClientRules: clientDealGenerationSettingsTable.body?.rows?.every(row =>
          tradingParties.body?.find(party =>
            party.partyId === pricingRules.body?.find(rule =>
              rule.pricingRuleId === row.pricing_rule_id
            )?.partyId
          )?.partyType === "CLIENT"
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
      fxTradeMarketSnapshotColumns: fxTradeMarketSnapshotTable.body?.columns?.map(column => column.name) || [],
      fxTradeMarketSnapshotForeignKeys: fxTradeMarketSnapshotTable.body?.foreignKeys || [],
      fxTradeMarketSnapshots: {
        count: fxTradeMarketSnapshotTable.body?.rowCount ?? -1
      },
      clientFxDealColumns: clientFxDealsTable.body?.columns?.map(column => column.name) || [],
      clientFxDealForeignKeys: clientFxDealsTable.body?.foreignKeys || [],
      hedgeFxDealColumns: hedgeFxDealsTable.body?.columns?.map(column => column.name) || [],
      hedgeFxDealForeignKeys: hedgeFxDealsTable.body?.foreignKeys || [],
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
      batchBalancingFlow: {
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
        roundingResidualQuoteAmountMinor:
          createFxBatch.body?.roundingResidualQuoteAmountMinor,
        historyStatus: fxBatchHistoryAfterCreate.statusCode,
        historyCount: fxBatchHistoryAfterCreate.body?.length ?? -1,
        historyFields: Object.keys(fxBatchHistoryAfterCreate.body?.[0] || {}).sort(),
        historyHidesIdempotencyKey: fxBatchHistoryAfterCreate.body?.every(batch =>
          !Object.hasOwn(batch, "idempotencyKey")
        ) === true,
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
        detailSettlementBucket:
          batchBalancingTradesAfterCreate.body?.settlementBucket || null,
        detailMemberCount: batchBalancingTradesAfterCreate.body?.memberCount ?? -1,
        detailOutputCount: batchBalancingTradesAfterCreate.body?.outputCount ?? -1,
        detailMemberRoles:
          batchBalancingTradesAfterCreate.body?.members
            ?.map(member => member.memberRole) || [],
        detailOutputRoles:
          batchBalancingTradesAfterCreate.body?.outputs
            ?.map(output => output.outputRole) || [],
        detailContainsAttributedSource:
          batchBalancingTradesAfterCreate.body?.members?.some(member =>
            member.tradeId === 41
            && member.tradeType === "CLIENT_DEAL"
            && member.partyName === "Romashka Company"
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
        technicalDeleteStatus: rejectReformedBatchTechnicalDelete.statusCode,
        technicalDeleteCode: rejectReformedBatchTechnicalDelete.body?.code,
        batchRemainsFormedAfterRejectedTechnicalDelete:
          fxBatchHistoryAfterRejectedTechnicalDelete.body?.some(batch =>
            batch.batchId === reformedFxBatch.body?.batchId
            && batch.batchStatus === "FORMED"
          ) === true,
        sourceRemainsHiddenAfterRejectedTechnicalDelete:
          fxPositionsAfterRejectedTechnicalDelete.body?.every(
            trade => trade.tradeId !== 41
          ) === true,
        balanceTradeRemainsHiddenAfterRejectedDelete:
          reformedFxBatch.body?.trades
            ?.filter(trade => trade.tradeType === "BATCH_BALANCE_TRADE")
            .every(balanceTrade =>
              fxPositionsAfterRejectedTechnicalDelete.body?.every(trade =>
                trade.tradeId !== balanceTrade.tradeId
              )
            ) === true,
        positionOutRemainsVisibleAfterRejectedDelete:
          reformedFxBatch.body?.trades
            ?.filter(trade => trade.tradeType === "BATCH_POSITION_OUT")
            .every(positionOut =>
              fxPositionsAfterRejectedTechnicalDelete.body?.some(trade =>
                trade.tradeId === positionOut.tradeId
              )
            ) === true,
        positionPreservedByRejectedTechnicalDelete:
          signedBasePosition(fxPositionsAfterReformedBatch.body)
          === signedBasePosition(fxPositionsAfterRejectedTechnicalDelete.body),
        demoHiddenBatchNotRecorded:
          fxDemoHiddenBatchesAfterRejectedDelete.body?.rows?.every(row =>
            row.batch_id !== reformedFxBatch.body?.batchId
          ) === true,
        technicalTradeAuditRowsRetained:
          reformedFxBatch.body?.trades?.every(createdTrade =>
            fxTradeExposureAfterRejectedTechnicalDelete.body?.rows?.some(row =>
              row.trade_id === createdTrade.tradeId
              && row.trade_type === createdTrade.tradeType
            )
          ) === true
          && fxBatchMembersAfterRejectedTechnicalDelete.body?.rows?.some(row =>
            row.batch_id === reformedFxBatch.body?.batchId
            && row.member_role === "BALANCE_TRADE"
          ) === true
          && fxBatchOutputsAfterRejectedTechnicalDelete.body?.rows?.some(row =>
            row.batch_id === reformedFxBatch.body?.batchId
            && row.output_role === "POSITION_OUT"
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
        createdTrades: createFlatFxBatch.body?.trades || [],
        members: flatBatchMembers,
        outputs: flatBatchOutputs,
        detailStatus: flatBatchDetails.statusCode,
        detailMembers: flatBatchDetails.body?.members || [],
        detailOutputs: flatBatchDetails.body?.outputs || [],
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
        removedBatches: demoTradeReset.body?.removed?.batches,
        generationProcess: demoTradeReset.body?.generationProcess,
        tradeReadsEmpty: demoResetTradeReads.every(result =>
          Array.isArray(result.body) && result.body.length === 0
        ),
        tradeTablesEmpty: demoResetTradeTableCounts.every(count => count === 0),
        referenceDataPreserved:
          JSON.stringify(demoResetReferenceBefore.map(result => result.body))
          === JSON.stringify(demoResetReferenceAfter.map(result => result.body)),
        deleteTriggersRestored: demoResetDeleteTriggers.length === 3,
        batchSequenceCleared: demoResetBatchSequence === undefined,
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
        eligiblePricingRulesStatus: hedgeDealPricingRules.statusCode,
        eligiblePricingRulesCount: hedgeDealPricingRules.body?.length ?? -1,
        allHedgeCounterpartyRules: hedgeDealPricingRules.body?.every(rule =>
          rule.partyType === "HEDGE_COUNTERPARTY"
          && rule.pricingMode === "DEALER_PRICED"
        ) === true,
        excludesDealerApprovedRules: hedgeDealPricingRules.body?.every(rule =>
          rule.pricingMode !== "DEALER_APPROVED"
        ) === true,
        rejectedDealerApprovedRuleStatus: invalidHedgeFxDealDealerApprovedRule.statusCode,
        dealerApprovedRuleDeleteStatus: deleteDealerApprovedHedgePricingRule.statusCode,
        createdStatus: createHedgeFxDeal.statusCode,
        createdTradeId: createHedgeFxDeal.body?.tradeId,
        createdSide: createHedgeFxDeal.body?.side,
        createdPartyId: createHedgeFxDeal.body?.partyId,
        expectedPartyId: createHedgeCounterparty.body?.partyId,
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
          && createdHedgeDealRow?.trade_id === createdHedgeTradeId
          && createdHedgeDealRow?.trade_type === "HEDGE_DEAL"
          && createdHedgeDealRow?.party_id === createHedgeCounterparty.body?.partyId
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
          && updatedClientRow?.party_id === 1
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
          invalidClientFxDealParty.statusCode,
          invalidClientFxDealTransferRate.statusCode,
          invalidClientFxDealSubMinorAmount.statusCode,
          invalidClientFxDealPricingScope.statusCode,
          invalidClientFxDealPricingMode.statusCode,
          rejectClientFxDealDelete.statusCode
        ]
      },
      pricingRules: {
        count: pricingRules.body?.length ?? -1,
        migratedPartyTypes: [...new Set((pricingRules.body || []).map(rule => rule.partyType))].sort(),
        allPricingModesResolved: pricingRules.body?.every(rule =>
          ["AUTO_PRICED", "DEALER_PRICED", "DEALER_APPROVED"].includes(rule.pricingMode)
        ) === true,
        migratedIdsPreserved: pricingRules.body?.map(rule => rule.pricingRuleId).sort((left, right) => left - right).join(",") === "1,2,3,4,5",
        migratedContextIdsAreIntegers: pricingRules.body?.every(rule => Number.isInteger(rule.executionContextId)),
        createdId: createPricingRule.body?.pricingRuleId,
        createdPartyId: createPricingRule.body?.partyId,
        createdPartyType: createPricingRule.body?.partyType,
        createdPairCode: createPricingRule.body?.ccyPairCode,
        createdCurrencyPair: createPricingRule.body?.currencyPair,
        updatedId: updatePricingRule.body?.pricingRuleId,
        updatedContextId: updatePricingRule.body?.executionContextId,
        expectedUpdatedContextId: wonderlandRfqContextId,
        updatedMargin: updatePricingRule.body?.marginPercent,
        lifecycle: [
          createPricingRule.statusCode,
          updatePricingRule.statusCode,
          duplicatePricingRule.statusCode,
          invalidPricingRuleParty.statusCode,
          invalidPricingRuleMargin.statusCode,
          blockedTradingPartyDelete.statusCode,
          deletePricingRule.statusCode
        ]
      },
      tradingParties: {
        count: tradingParties.body?.length ?? -1,
        migratedTypes: [...new Set((tradingParties.body || []).map(party => party.partyType))].sort(),
        legacyExternalType: tradingParties.body
          ?.find(party => party.partyCode === "LEGACY_EXTERNAL")?.partyType,
        legacyInternalType: tradingParties.body
          ?.find(party => party.partyCode === "LEGACY_INTERNAL")?.partyType,
        createdId: createTradingParty.body?.partyId,
        createdType: createTradingParty.body?.partyType,
        createdCodeType: createTradingParty.body?.partyCodeType,
        updatedType: updateTradingParty.body?.partyType,
        updatedCode: updateTradingParty.body?.partyCode,
        updatedActive: updateTradingParty.body?.active,
        countAfterDelete: tradingPartiesAfterDelete.body?.length ?? -1,
        lifecycle: [
          createTradingParty.statusCode,
          updateTradingParty.statusCode,
          duplicateTradingParty.statusCode,
          invalidLegacyExternalPartyType.statusCode,
          invalidLegacyInternalPartyType.statusCode,
          invalidTradingPartyCodeType.statusCode,
          invalidTradingPartyCodeLength.statusCode,
          invalidTradingPartyNameLength.statusCode,
          deleteTradingParty.statusCode
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
          ?.every(settings => settings.partyType === "CLIENT") === true,
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
        processStartStatus: startClientDealGenerationProcess.statusCode,
        processStartedRunning: startClientDealGenerationProcess.body?.running,
        processIntervalMs: startClientDealGenerationProcess.body?.intervalMs,
        processGeneratedCount: startClientDealGenerationProcess.body?.generatedDealCount,
        processStatus: clientDealGenerationProcessStatus.statusCode,
        processStatusRunning: clientDealGenerationProcessStatus.body?.running,
        processStopStatus: stopClientDealGenerationProcess.statusCode,
        processStoppedRunning: stopClientDealGenerationProcess.body?.running,
        processGeneratedDeleteStatus: rejectProcessGeneratedClientFxDealDelete.statusCode,
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
      "ccy_options",
      "ccy_pair_options",
      "client_deal_generation_settings",
      "client_fx_deals",
      "execution_contexts",
      "execution_systems",
      "fx_batch_members",
      "fx_batch_outputs",
      "fx_batches",
      "fx_demo_hidden_batches",
      "fx_hedge_deals",
      "fx_trade_exposure",
      "fx_trade_market_snapshot",
      "market_quote_simulation_settings",
      "pricing_rules",
      "servicing_locations",
      "trading_parties",
      "users"
    ];
    const simulationForeignKey = apiAndMigration.settingsForeignKeys[0];
    const failed = freshSchema.currencies !== 5
      || freshSchema.pairs !== 3
      || freshSchema.simulationSettings !== 3
      || freshSchema.servicingLocations !== 6
      || freshSchema.accountingSystems !== 2
      || freshSchema.executionSystems !== 3
      || freshSchema.executionContexts !== 5
      || freshSchema.executionContextIdType !== "INTEGER"
      || freshSchema.tradingParties !== 4
      || freshSchema.tradingPartyTypes.join(",") !== "CLIENT,HEDGE_COUNTERPARTY"
      || freshSchema.users !== 3
      || freshSchema.userColumns.join(",") !== "user_id,user_code,first_name,last_name,user_role,is_active"
      || freshSchema.userRoles.join(",") !== "ADMIN,DEALER,SUPERVISOR"
      || freshSchema.pricingRules !== 6
      || freshSchema.legacyMonetaryColumns.length !== 0
      || freshSchema.clientDealGenerationSettings !== 2
      || freshSchema.clientDealGenerationSettingsColumns.join(",") !== "pricing_rule_id,min_base_ccy_amount_minor,max_base_ccy_amount_minor,base_ccy_amount_step_minor,base_ccy_fraction_digits,buy_probability_percent,is_active"
      || freshSchema.clientDealGenerationSettingsForeignKeys.length !== 1
      || freshSchema.clientDealGenerationSettingsForeignKeys[0]?.table !== "pricing_rules"
      || freshSchema.clientDealGenerationSettingsForeignKeys[0]?.on_update !== "RESTRICT"
      || freshSchema.clientDealGenerationSettingsForeignKeys[0]?.on_delete !== "CASCADE"
      || !freshSchema.clientDealGenerationSettingsRows.every(row =>
        row.party_type === "CLIENT"
        && row.pricing_mode === "AUTO_PRICED"
        && row.min_base_ccy_amount_minor === 500000 * (10 ** row.base_ccy_fraction_digits)
        && row.max_base_ccy_amount_minor === 1500000 * (10 ** row.base_ccy_fraction_digits)
        && row.base_ccy_amount_step_minor === 100000 * (10 ** row.base_ccy_fraction_digits)
        && Number.isInteger(row.base_ccy_fraction_digits)
        && row.buy_probability_percent === 50
        && row.is_active === 1
      )
      || freshSchema.fxTradeExposures !== 6
      || freshSchema.fxTradeExposureColumns.join(",") !== "trade_id,entry_timestamp,trade_type,trade_date,ccy_pair_code,base_ccy_side,dealt_ccy_code,base_ccy_amount_minor,base_ccy_fraction_digits,quote_ccy_amount_minor,quote_ccy_fraction_digits,trade_rate,tenor,base_ccy_value_date,quote_ccy_value_date"
      || freshSchema.fxTradeExposureForeignKeys.length !== 2
      || !freshSchema.fxTradeExposureIdentityIndex
      || freshSchema.fxTradeExposureIdentityIndexColumns.join(",") !== "trade_id,trade_type"
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
      || freshSchema.clientFxDealColumns.join(",") !== "trade_id,trade_type,party_id,execution_context_id,pricing_rule_id,transfer_rate,analytical_pnl_quote_minor,analytical_pnl_quote_fraction_digits,comment"
      || freshSchema.clientFxDealForeignKeys.length !== 7
      || !freshSchema.clientFxDealForeignKeys.every(foreignKey =>
        foreignKey.on_update === "RESTRICT" && foreignKey.on_delete === "RESTRICT"
      )
      || !["trading_parties", "execution_contexts", "pricing_rules", "fx_trade_exposure"].every(referencedTable =>
        freshSchema.clientFxDealForeignKeys.some(foreignKey => foreignKey.table === referencedTable)
      )
      || freshSchema.clientFxDealSeedRow?.execution_context_id !== 3
      || freshSchema.clientFxDealSeedRow?.pricing_rule_id !== 3
      || freshSchema.clientFxDealSeedRow?.transfer_rate !== 1.1222
      || freshSchema.clientFxDealSeedRow?.analytical_pnl_quote_minor !== 2700000
      || freshSchema.clientFxDealSeedRow?.analytical_pnl_quote_fraction_digits !== 2
      || freshSchema.hedgeFxDeals !== 1
      || freshSchema.hedgeFxDealColumns.join(",") !== "trade_id,trade_type,party_id,execution_context_id,pricing_rule_id,transfer_rate,analytical_pnl_quote_minor,analytical_pnl_quote_fraction_digits"
      || freshSchema.hedgeFxDealForeignKeys.length !== 7
      || !freshSchema.hedgeFxDealForeignKeys.every(foreignKey =>
        foreignKey.on_update === "RESTRICT" && foreignKey.on_delete === "RESTRICT"
      )
      || !["trading_parties", "execution_contexts", "pricing_rules", "fx_trade_exposure"].every(referencedTable =>
        freshSchema.hedgeFxDealForeignKeys.some(foreignKey => foreignKey.table === referencedTable)
      )
      || freshSchema.hedgeFxDealSeedRow?.trade_type !== "HEDGE_DEAL"
      || freshSchema.hedgeFxDealSeedRow?.transfer_rate !== 1.1222
      || freshSchema.hedgeFxDealSeedRow?.analytical_pnl_quote_minor !== 0
      || freshSchema.hedgeFxDealSeedRow?.analytical_pnl_quote_fraction_digits !== 2
      || freshSchema.fxTradeBatches !== 0
      || freshSchema.fxTradeBatchColumns.join(",") !== "batch_id,idempotency_key,ccy_pair_code,batch_status,created_at,rolled_back_at"
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
      || !/\bmember_role\s*=\s*'TRADE'\s+OR\b/i
        .test(freshSchema.batchMemberCreateSql)
      || /\bmember_role\s*=\s*'TRADE'\s+AND\s+trade_type\s+IN\b/i
        .test(freshSchema.batchMemberCreateSql)
      || !freshSchema.batchMemberTechnicalOriginIndex
      || !freshSchema.batchTradeTypesSupported
      || !freshSchema.batchBalancingTradeConstraintsEnforced
      || !freshSchema.batchBalancingTradeParentRestrictionEnforced
      || !freshSchema.pricingRuleReferenceIndex
      || freshSchema.pricingRuleReferenceIndexColumns.join(",") !== "pricing_rule_id,party_id,execution_context_id"
      || freshSchema.pricingRuleExecutionContextIdType !== "INTEGER"
      || !freshSchema.ccyOptionsConstraintsEnforced
      || !freshSchema.ccyPairOptionsConstraintsEnforced
      || !freshSchema.servicingLocationConstraintsEnforced
      || !freshSchema.accountingSystemTextLimitsEnforced
      || !freshSchema.executionSystemConstraintsEnforced
      || !freshSchema.tradingPartyConstraintsEnforced
      || !freshSchema.userConstraintsEnforced
      || !freshSchema.frontSystemFolderIdCodeTypeSupported
      || !freshSchema.clientDealGenerationSettingsConstraintsEnforced
      || !freshSchema.clientDealGenerationSettingsPartyTypeEnforced
      || !freshSchema.clientDealGenerationSettingsPricingModeEnforced
      || !freshSchema.clientDealGenerationSettingsCascadeDeleteEnforced
      || !freshSchema.fxTradeExposureConstraintsEnforced
      || !freshSchema.clientFxDealConstraintsEnforced
      || !freshSchema.clientFxDealParentRestrictionEnforced
      || !freshSchema.clientFxDealAttributionReferencesRestricted
      || !freshSchema.clientFxDealPartyTypeEnforced
      || !freshSchema.hedgeFxDealConstraintsEnforced
      || !freshSchema.hedgeFxDealParentRestrictionEnforced
      || !freshSchema.hedgeFxDealPartyTypeEnforced
      || freshSchema.legacyAssignmentTablePresent
      || freshSchema.foreignKeyViolations !== 0
      || frontend.duplicateIds.length > 0
      || frontend.missingDomIds.length > 0
      || !frontend.usesSimulationSettingsEndpoint
      || !frontend.usesBackendSimulationStream
      || !frontend.usesServicingLocationsEndpoint
      || !frontend.usesHedgeFxDealsEndpoint
      || !frontend.usesDedicatedAddHedgeDealFlow
      || !frontend.usesHedgeCounterpartyPricingRules
      || !frontend.usesPricingModeIndicators
      || !frontend.usesUnifiedMarginIndicators
      || !frontend.usesDatabaseBackedFxPositions
      || !frontend.usesClientDealCommentOnlyEditing
      || !frontend.usesDatabaseBackedClientDealGeneration
      || !frontend.removesBrowserClientDealGeneration
      || !frontend.usesFxBatchFormation
      || !frontend.usesBatchingHistory
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
      || !frontend.usesGroupedTradesNavigation
      || !frontend.usesGroupedPricingWorkspace
      || !frontend.usesGroupedTradesWorkspace
      || !frontend.usesImmutableClientFxDealEdit
      || !frontend.usesAuthoritativeClientDealRefresh
      || !frontend.usesHedgeFxDealsTabulator
      || !frontend.usesAccountingSystemsEndpoint
      || !frontend.usesExecutionSystemsEndpoint
      || !frontend.persistsReferenceDataItemsWithoutUndefinedAlias
      || !frontend.usesExecutionContextsEndpoint
      || !frontend.usesTradingPartiesEndpoint
      || !frontend.usesUsersWorkspace
      || !frontend.usesInlineUsersEditor
      || !frontend.usesPricingRulesEndpoint
      || !frontend.usesPricingRulesBootstrap
      || !frontend.displaysPricingRulePartyType
      || !frontend.displaysPricingRulePricingMode
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
      || !frontend.usesBootstrapClientDealDialog
      || !frontend.usesStructuredTradeEconomicsLayout
      || !frontend.usesNegativeClientDealPnlConfirmation
      || !frontend.usesBaseCurrencyClientDealSideLabels
      || !frontend.usesInlineFixedAmountCurrencySelection
      || !frontend.usesCollapsibleAdditionalAttributes
      || !frontend.usesClientDealDuplicateCheck
      || !frontend.usesTradingPartiesLanguage
      || !frontend.usesTradingPartyBadgeIcon
      || !frontend.usesTradingPartyColumnFilters
      || !frontend.usesBootstrapTradingPartyGrid
      || !frontend.usesTradingPartyPricingContextBricks
      || !frontend.usesTradingPartyDetailRoutes
      || !frontend.usesInlineTradingPartyCreate
      || !frontend.usesConstrainedTradingPartyWidth
      || !frontend.usesBootstrapPricingRuleDialog
      || !frontend.usesMutedUnavailablePricingContextOptions
      || !frontend.usesFilterAwareSmartSizing
      || !frontend.removesExecutionContextAssignments
      || !frontend.pricingRulesUseDirectExecutionContexts
      || !frontend.usesPricingRuleContextBuilder
      || !frontend.usesVerticalPricingRuleContextLayout
      || !frontend.suppressesDuplicatePricingContextClear
      || !frontend.usesHumanReadablePricingContextCandidates
      || !frontend.usesMutedPricingContextBricks
      || !frontend.avoidsTradingPartyCodeAutoSelect
      || !frontend.usesSynchronizedContextIcons
      || !frontend.supportsRequiredPartyTypes
      || !frontend.supportsRequiredPartyCodeTypes
      || !frontend.usesExplicitTooltipLayer
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
      || !frontend.usesExecutionSystemNameOnly
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
      || !frontend.usesUnifiedActionsColumnWidth
      || !frontend.usesUnifiedFilterFocus
      || !frontend.disablesTabulatorColumnMoving
      || !frontend.disablesTabulatorColumnResizing
      || !frontend.usesInlineMarketPulseEditors
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
      || !frontend.usesCentralTabulatorColumnSizing
      || !frontend.usesUnifiedBootstrapWorkspaceStyle
      || !frontend.usesMarketVerticalGridlines
      || !frontend.usesReferenceDataColumnFilters
      || !frontend.usesFluidReferenceDataTables
      || !frontend.usesFluidPricingContextTable
      || !frontend.usesFluidPricingRulesTable
      || !frontend.usesPricingRulesHeaderLayout
      || !frontend.usesExecutionContextRoute
      || !frontend.usesBootstrapReferenceDataControls
      || !frontend.usesUniformReferenceDataGrid
      || !frontend.usesUnifiedDataGridLineSystem
      || !frontend.usesOwnedRoundedTableFrames
      || !frontend.usesCentralWorkbenchDesignContract
      || !frontend.usesSingleMarketOuterEdge
      || !frontend.usesSingleClientDealsOuterEdge
      || !frontend.avoidsMarketScrollbarGutter
      || !frontend.usesZoomSafeMarketHeight
      || frontend.containsFrontendQuoteGenerator
      || !simulator.startedRunning
      || !simulator.refreshedRunning
      || simulator.stoppedRunning
      || simulator.startedQuote.bid < 1.122
      || simulator.startedQuote.bid > 1.1222
      || simulator.startedQuote.offer < simulator.startedQuote.bid
      || apiAndMigration.demoTradeReset.invalidStatus !== 400
      || apiAndMigration.demoTradeReset.invalidCode
        !== "INVALID_DEMO_TRADE_RESET_CONFIRMATION"
      || apiAndMigration.demoTradeReset.status !== 200
      || !(apiAndMigration.demoTradeReset.removedTrades > 0)
      || !(apiAndMigration.demoTradeReset.removedBatches > 0)
      || apiAndMigration.demoTradeReset.generationProcess?.running !== false
      || apiAndMigration.demoTradeReset.generationProcess?.generatedDealCount !== 0
      || apiAndMigration.demoTradeReset.generationProcess?.lastGeneratedTradeId !== null
      || !apiAndMigration.demoTradeReset.tradeReadsEmpty
      || !apiAndMigration.demoTradeReset.tradeTablesEmpty
      || !apiAndMigration.demoTradeReset.referenceDataPreserved
      || !apiAndMigration.demoTradeReset.deleteTriggersRestored
      || !apiAndMigration.demoTradeReset.batchSequenceCleared
      || apiAndMigration.demoTradeReset.foreignKeyViolations !== 0
      || apiAndMigration.tables.join(",") !== expectedTables.join(",")
      || !apiAndMigration.ccyOptionsConstraintMigrated
      || !apiAndMigration.ccyPairOptionsConstraintMigrated
      || !apiAndMigration.executionSystemConstraintMigrated
      || !apiAndMigration.tradingPartyConstraintsMigrated
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
      || apiAndMigration.executionContextColumns.join(",") !== "execution_context_id,servicing_location_id,accounting_system_id,execution_system_id"
      || apiAndMigration.executionContextIdType !== "INTEGER"
      || apiAndMigration.executionContextForeignKeys.length !== 3
      || !apiAndMigration.executionContextForeignKeys.every(foreignKey => foreignKey.onDelete === "RESTRICT")
      || !["servicing_locations", "accounting_systems", "execution_systems"].every(referencedTable =>
        apiAndMigration.executionContextForeignKeys.some(foreignKey => foreignKey.referencedTable === referencedTable)
      )
      || apiAndMigration.executionContexts.count !== 5
      || !apiAndMigration.executionContexts.migratedIdsAreIntegers
      || !Number.isInteger(apiAndMigration.executionContexts.createdId)
      || apiAndMigration.executionContexts.createdId <= 0
      || apiAndMigration.executionContexts.createdAccountingSystemId !== "NOT_APPLICABLE"
      || apiAndMigration.executionContexts.updatedId !== apiAndMigration.executionContexts.createdId
      || apiAndMigration.executionContexts.usageAfterCreate !== 1
      || apiAndMigration.executionContexts.usageAfterDelete !== 0
      || apiAndMigration.tradingPartyColumns.join(",") !== "party_id,party_type,party_code,party_code_type,party_name,is_active"
      || apiAndMigration.userColumns.join(",") !== "user_id,user_code,first_name,last_name,user_role,is_active"
      || !apiAndMigration.legacyAssignmentTableRemoved
      || apiAndMigration.pricingRuleColumns.join(",") !== "pricing_rule_id,party_id,execution_context_id,ccy_pair_code,margin_percent"
      || apiAndMigration.pricingRuleExecutionContextIdType !== "INTEGER"
      || apiAndMigration.pricingRuleForeignKeys.length !== 3
      || !apiAndMigration.pricingRuleForeignKeys.every(foreignKey => foreignKey.onUpdate === "RESTRICT" && foreignKey.onDelete === "RESTRICT")
      || !["trading_parties", "execution_contexts", "ccy_pair_options"].every(referencedTable =>
        apiAndMigration.pricingRuleForeignKeys.some(foreignKey => foreignKey.referencedTable === referencedTable)
      )
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
      || apiAndMigration.clientDealGeneration.processStartStatus !== 200
      || !apiAndMigration.clientDealGeneration.processStartedRunning
      || apiAndMigration.clientDealGeneration.processIntervalMs !== 1000
      || apiAndMigration.clientDealGeneration.processGeneratedCount !== 1
      || apiAndMigration.clientDealGeneration.processStatus !== 200
      || !apiAndMigration.clientDealGeneration.processStatusRunning
      || apiAndMigration.clientDealGeneration.processStopStatus !== 200
      || apiAndMigration.clientDealGeneration.processStoppedRunning
      || apiAndMigration.clientDealGeneration.processGeneratedDeleteStatus !== 405
      || apiAndMigration.clientDealGeneration.rejectedProcessStartStatus !== 409
      || apiAndMigration.clientDealGeneration.rejectedProcessStartCode
        !== "CLIENT_DEAL_GENERATION_NOT_CONFIGURED"
      || !apiAndMigration.clientDealGeneration.remainsStoppedWithoutEligibleRules
      || !apiAndMigration.clientDealGeneration.settingsRestored
      || apiAndMigration.fxTradeExposureColumns.join(",") !== "trade_id,entry_timestamp,trade_type,trade_date,ccy_pair_code,base_ccy_side,dealt_ccy_code,base_ccy_amount_minor,base_ccy_fraction_digits,quote_ccy_amount_minor,quote_ccy_fraction_digits,trade_rate,tenor,base_ccy_value_date,quote_ccy_value_date"
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
      || apiAndMigration.fxTradeMarketSnapshotColumns.join(",") !== "trade_id,trade_type,market_pulse_stream_status,market_pulse_bid,market_pulse_offer,market_pulse_timestamp"
      || apiAndMigration.fxTradeMarketSnapshotForeignKeys.length !== 2
      || !apiAndMigration.fxTradeMarketSnapshotForeignKeys.every(foreignKey =>
        foreignKey.onUpdate === "RESTRICT"
        && foreignKey.onDelete === "RESTRICT"
        && foreignKey.referencedTable === "fx_trade_exposure"
      )
      || apiAndMigration.fxTradeMarketSnapshots.count !== 0
      || apiAndMigration.clientFxDealColumns.join(",") !== "trade_id,trade_type,party_id,execution_context_id,pricing_rule_id,transfer_rate,analytical_pnl_quote_minor,analytical_pnl_quote_fraction_digits,comment"
      || apiAndMigration.clientFxDealForeignKeys.length !== 7
      || !apiAndMigration.clientFxDealForeignKeys.every(foreignKey => foreignKey.onUpdate === "RESTRICT" && foreignKey.onDelete === "RESTRICT")
      || !["trading_parties", "execution_contexts", "pricing_rules", "fx_trade_exposure"].every(referencedTable =>
        apiAndMigration.clientFxDealForeignKeys.some(foreignKey => foreignKey.referencedTable === referencedTable)
      )
      || apiAndMigration.hedgeFxDealColumns.join(",") !== "trade_id,trade_type,party_id,execution_context_id,pricing_rule_id,transfer_rate,analytical_pnl_quote_minor,analytical_pnl_quote_fraction_digits"
      || apiAndMigration.hedgeFxDealForeignKeys.length !== 7
      || !apiAndMigration.hedgeFxDealForeignKeys.every(foreignKey => foreignKey.onUpdate === "RESTRICT" && foreignKey.onDelete === "RESTRICT")
      || !["trading_parties", "execution_contexts", "pricing_rules", "fx_trade_exposure"].every(referencedTable =>
        apiAndMigration.hedgeFxDealForeignKeys.some(foreignKey => foreignKey.referencedTable === referencedTable)
      )
      || apiAndMigration.fxTradeBatchColumns.join(",") !== "batch_id,idempotency_key,ccy_pair_code,batch_status,created_at,rolled_back_at"
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
      || !/\bmember_role\s*=\s*'TRADE'\s+OR\b/i
        .test(apiAndMigration.batchMemberCreateSql)
      || /\bmember_role\s*=\s*'TRADE'\s+AND\s+trade_type\s+IN\b/i
        .test(apiAndMigration.batchMemberCreateSql)
      || apiAndMigration.batchBalancingTrades.status !== 200
      || apiAndMigration.batchBalancingTrades.count !== 0
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
      || apiAndMigration.batchBalancingFlow.roundingResidualQuoteAmountMinor !== 0
      || apiAndMigration.batchBalancingFlow.historyStatus !== 200
      || apiAndMigration.batchBalancingFlow.historyCount !== 1
      || apiAndMigration.batchBalancingFlow.historyFields.join(",")
        !== "batchId,batchStatus,ccyPairCode,createdAt,rolledBackAt"
      || !apiAndMigration.batchBalancingFlow.historyHidesIdempotencyKey
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
      || apiAndMigration.batchBalancingFlow.detailSettlementBucket?.tradeDate !== "2026-07-15"
      || apiAndMigration.batchBalancingFlow.detailSettlementBucket?.tenor !== "TOM"
      || apiAndMigration.batchBalancingFlow.detailMemberCount !== 2
      || apiAndMigration.batchBalancingFlow.detailOutputCount !== 1
      || apiAndMigration.batchBalancingFlow.detailMemberRoles.join(",")
        !== "TRADE,BALANCE_TRADE"
      || apiAndMigration.batchBalancingFlow.detailOutputRoles.join(",")
        !== "POSITION_OUT"
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
      || apiAndMigration.batchBalancingFlow.technicalDeleteStatus !== 405
      || apiAndMigration.batchBalancingFlow.technicalDeleteCode
        !== "FX_BATCH_TECHNICAL_TRADES_IMMUTABLE"
      || !apiAndMigration.batchBalancingFlow.batchRemainsFormedAfterRejectedTechnicalDelete
      || !apiAndMigration.batchBalancingFlow.sourceRemainsHiddenAfterRejectedTechnicalDelete
      || !apiAndMigration.batchBalancingFlow.balanceTradeRemainsHiddenAfterRejectedDelete
      || !apiAndMigration.batchBalancingFlow.positionOutRemainsVisibleAfterRejectedDelete
      || !apiAndMigration.batchBalancingFlow.positionPreservedByRejectedTechnicalDelete
      || !apiAndMigration.batchBalancingFlow.demoHiddenBatchNotRecorded
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
      || apiAndMigration.hedgeFxDeals.rejectedDealerApprovedRuleStatus !== 400
      || apiAndMigration.hedgeFxDeals.dealerApprovedRuleDeleteStatus !== 204
      || apiAndMigration.hedgeFxDeals.createdStatus !== 201
      || !Number.isInteger(apiAndMigration.hedgeFxDeals.createdTradeId)
      || apiAndMigration.hedgeFxDeals.createdSide !== "BUY"
      || apiAndMigration.hedgeFxDeals.createdPartyId
        !== apiAndMigration.hedgeFxDeals.expectedPartyId
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
      || apiAndMigration.clientFxDeals.first?.entryTimestamp !== "2026-07-15T11:45:00.000Z"
      || apiAndMigration.clientFxDeals.migratedRow?.trade_id !== 41
      || apiAndMigration.clientFxDeals.migratedRow?.trade_type !== "CLIENT_DEAL"
      || apiAndMigration.clientFxDeals.migratedRow?.party_id !== 1
      || apiAndMigration.clientFxDeals.migratedRow?.execution_context_id !== null
      || apiAndMigration.clientFxDeals.migratedRow?.pricing_rule_id !== null
      || apiAndMigration.clientFxDeals.migratedRow?.transfer_rate !== null
      || apiAndMigration.clientFxDeals.migratedRow?.analytical_pnl_quote_minor !== null
      || apiAndMigration.clientFxDeals.migratedRow
        ?.analytical_pnl_quote_fraction_digits !== null
      || apiAndMigration.clientFxDeals.migratedRow?.comment !== null
      || !Number.isInteger(apiAndMigration.clientFxDeals.createdId)
      || apiAndMigration.clientFxDeals.createdTradeId !== apiAndMigration.clientFxDeals.createdId
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
      || apiAndMigration.pricingRules.migratedPartyTypes.join(",") !== "CLIENT"
      || !apiAndMigration.pricingRules.allPricingModesResolved
      || !apiAndMigration.pricingRules.migratedIdsPreserved
      || !apiAndMigration.pricingRules.migratedContextIdsAreIntegers
      || !Number.isInteger(apiAndMigration.pricingRules.createdId)
      || apiAndMigration.pricingRules.createdId <= 0
      || apiAndMigration.pricingRules.createdPartyId !== apiAndMigration.tradingParties.createdId
      || apiAndMigration.pricingRules.createdPartyType !== "HEDGE_COUNTERPARTY"
      || apiAndMigration.pricingRules.createdPairCode !== "EUR_USD"
      || apiAndMigration.pricingRules.createdCurrencyPair !== "EUR/USD"
      || apiAndMigration.pricingRules.updatedId !== apiAndMigration.pricingRules.createdId
      || apiAndMigration.pricingRules.updatedContextId !== apiAndMigration.pricingRules.expectedUpdatedContextId
      || apiAndMigration.pricingRules.updatedMargin !== 0.3
      || apiAndMigration.pricingRules.lifecycle.join(",") !== "201,200,409,400,400,409,204"
      || apiAndMigration.tradingParties.count !== 5
      || apiAndMigration.tradingParties.migratedTypes.join(",") !== "CLIENT,HEDGE_COUNTERPARTY"
      || apiAndMigration.tradingParties.legacyExternalType !== "HEDGE_COUNTERPARTY"
      || apiAndMigration.tradingParties.legacyInternalType !== "HEDGE_COUNTERPARTY"
      || apiAndMigration.tradingParties.createdType !== "HEDGE_COUNTERPARTY"
      || apiAndMigration.tradingParties.createdCodeType !== "FRONT_SYSTEM_FOLDER_ID"
      || apiAndMigration.tradingParties.updatedType !== "HEDGE_COUNTERPARTY"
      || apiAndMigration.tradingParties.updatedCode !== "VERIFY_FOLDER"
      || apiAndMigration.tradingParties.updatedActive !== false
      || apiAndMigration.tradingParties.countAfterDelete !== 5
      || apiAndMigration.tradingParties.lifecycle.join(",") !== "201,200,409,400,400,400,400,400,204"
      || apiAndMigration.users.count !== 3
      || !Number.isInteger(apiAndMigration.users.createdId)
      || apiAndMigration.users.updatedRole !== "SUPERVISOR"
      || apiAndMigration.users.updatedActive !== false
      || apiAndMigration.users.countAfterDelete !== 3
      || apiAndMigration.users.lifecycle.join(",") !== "201,200,409,400,400,204"
      || simulationForeignKey?.referencedTable !== "ccy_pair_options"
      || simulationForeignKey?.referencedColumn !== "ccy_pair_code"
      || simulationForeignKey?.onDelete !== "CASCADE"
      || apiAndMigration.migratedPair?.bidMin !== 1.122
      || apiAndMigration.eurUsdPricingRulesCount !== 5
      || apiAndMigration.blockedPairDelete.status !== 409
      || apiAndMigration.blockedPairDelete.code !== "CCY_PAIR_IN_USE"
      || apiAndMigration.blockedPairDelete.message !== "Ccy Pair EUR/USD is used in 5 Pricing Rules."
      || apiAndMigration.migratedSettings?.bidMax !== 1.1222
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
