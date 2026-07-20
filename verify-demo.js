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
    .forEach(filePath => fs.rmSync(filePath, { force: true }));
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

    CREATE TABLE trading_party_execution_contexts
    (
      party_id INTEGER NOT NULL,
      execution_context_id TEXT NOT NULL
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
      (3, 'CLIENT', '5409876543', 'INN', 'Gladiolus Company', 1);

    INSERT INTO pricing_rules
      (pricing_rule_id, party_id, execution_context_id, ccy_pair_code, margin_percent)
    VALUES
      (1, 1, '002:AFINA:CLICK_TRADE_EFX', 'EUR_USD', 0.10),
      (2, 1, '002:AFINA:RFQ', 'EUR_USD', 0.12),
      (3, 1, '002:CTF3:MANUAL_CLIENT_DEAL_ENTRY', 'EUR_USD', 0.08),
      (4, 2, '1234:AFINA:RFQ', 'EUR_USD', 0.05),
      (5, 3, '001:CTF3:CLICK_TRADE_EFX', 'EUR_USD', 0.20);
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
  let fxTradeExposureConstraintsEnforced = true;
  let clientFxDealConstraintsEnforced = true;
  let clientFxDealPartyTypeEnforced = true;

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
    ["2026-07-15 09:30:00", "CLIENT_DEAL", "2026-07-15", "EUR_USD", "BUY", 100, 112.31, 1.1231, "TOD", "2026-07-15", "2026-07-15"],
    ["2026-07-15T09:30:00.000Z", "CLIENT", "2026-07-15", "EUR_USD", "BUY", 100, 112.31, 1.1231, "TOD", "2026-07-15", "2026-07-15"],
    ["2026-07-15T09:30:00.000Z", "TECHNICAL_DEAL", "2026-07-15", "EUR_USD", "BUY", 100, 112.31, 1.1231, "TOD", "2026-07-15", "2026-07-15"],
    ["2026-07-15T09:30:00.000Z", "CLIENT_DEAL", "15.07.2026", "EUR_USD", "BUY", 100, 112.31, 1.1231, "TOD", "2026-07-15", "2026-07-15"],
    ["2026-07-15T09:30:00.000Z", "CLIENT_DEAL", "2026-07-15", "UNKNOWN_PAIR", "BUY", 100, 112.31, 1.1231, "TOD", "2026-07-15", "2026-07-15"],
    ["2026-07-15T09:30:00.000Z", "CLIENT_DEAL", "2026-07-15", "EUR_USD", "HOLD", 100, 112.31, 1.1231, "TOD", "2026-07-15", "2026-07-15"],
    ["2026-07-15T09:30:00.000Z", "CLIENT_DEAL", "2026-07-15", "EUR_USD", "BUY", 0, 112.31, 1.1231, "TOD", "2026-07-15", "2026-07-15"],
    ["2026-07-15T09:30:00.000Z", "CLIENT_DEAL", "2026-07-15", "EUR_USD", "BUY", 100, 112.31, 1.1231, "spot value", "2026-07-15", "2026-07-15"],
    ["2026-07-15T09:30:00.000Z", "CLIENT_DEAL", "2026-07-15", "EUR_USD", "BUY", 100, 112.31, 1.1231, "TOD", "15.07.2026", "2026-07-15"]
  ].forEach(values => {
    try {
      database.prepare(`
        INSERT INTO fx_trade_exposure
          (
            entry_timestamp, trade_type, trade_date, ccy_pair_code, side,
            base_ccy_amount, quote_ccy_amount, trade_rate, tenor,
            base_ccy_value_date, quote_ccy_value_date
          )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(...values);
      fxTradeExposureConstraintsEnforced = false;
    } catch {}
  });

  database.prepare(`
    INSERT INTO fx_trade_exposure
      (
        entry_timestamp, trade_type, trade_date, ccy_pair_code, side,
        base_ccy_amount, quote_ccy_amount, trade_rate, tenor,
        base_ccy_value_date, quote_ccy_value_date
      )
    VALUES ('2026-07-15T09:30:00.000Z', 'CLIENT_DEAL', '2026-07-15', 'EUR_USD', 'BUY', 30000000, 33693000, 1.1231, 'TOD', '2026-07-15', '2026-07-15')
  `).run();

  database.prepare(`
    INSERT INTO fx_trade_exposure
      (
        entry_timestamp, trade_type, trade_date, ccy_pair_code, side,
        base_ccy_amount, quote_ccy_amount, trade_rate, tenor,
        base_ccy_value_date, quote_ccy_value_date
      )
    VALUES ('2026-07-15T09:31:00.000Z', 'HEDGE_DEAL', '2026-07-15', 'EUR_USD', 'SELL', 30000000, 33690000, 1.123, 'TOD', '2026-07-15', '2026-07-15')
  `).run();

  database.prepare(`
    INSERT INTO fx_trade_exposure
      (
        entry_timestamp, trade_type, trade_date, ccy_pair_code, side,
        base_ccy_amount, quote_ccy_amount, trade_rate, tenor,
        base_ccy_value_date, quote_ccy_value_date
      )
    VALUES ('2026-07-15T09:32:00.000Z', 'CLIENT_DEAL', '2026-07-15', 'EUR_USD', 'BUY', 1000000, 1123100, 1.1231, 'TOM', '2026-07-16', '2026-07-16')
  `).run();

  database.prepare(`
    INSERT INTO fx_trade_exposure
      (
        entry_timestamp, trade_type, trade_date, ccy_pair_code, side,
        base_ccy_amount, quote_ccy_amount, trade_rate, tenor,
        base_ccy_value_date, quote_ccy_value_date
      )
    VALUES ('2026-07-15T09:33:00.000Z', 'HEDGE_DEAL', '2026-07-15', 'EUR_USD', 'SELL', 1000000, 1123000, 1.123, 'SPOT', '2026-07-17', '2026-07-17')
  `).run();

  [
    ["2026-07-15 09:30:00", "2026-07-15", "BUY", 100, 112.31, 1.1231, "TOD", "2026-07-15", "2026-07-15"],
    ["2026-07-15T09:30:00.000Z", "15.07.2026", "BUY", 100, 112.31, 1.1231, "TOD", "2026-07-15", "2026-07-15"],
    ["2026-07-15T09:30:00.000Z", "2026-07-15", "HOLD", 100, 112.31, 1.1231, "TOD", "2026-07-15", "2026-07-15"],
    ["2026-07-15T09:30:00.000Z", "2026-07-15", "BUY", 0, 112.31, 1.1231, "TOD", "2026-07-15", "2026-07-15"],
    ["2026-07-15T09:30:00.000Z", "2026-07-15", "BUY", 100, 112.31, 1.1231, "spot value", "2026-07-15", "2026-07-15"],
    ["2026-07-15T09:30:00.000Z", "2026-07-15", "BUY", 100, 112.31, 1.1231, "TOD", "15.07.2026", "2026-07-15"]
  ].forEach(values => {
    try {
      database.prepare(`
        INSERT INTO client_fx_deals
          (
            entry_timestamp, party_id, trade_date, ccy_pair_code, side,
            base_ccy_amount, quote_ccy_amount, trade_rate, tenor,
            base_ccy_value_date, quote_ccy_value_date
          )
        VALUES (?, 1, ?, 'EUR_USD', ?, ?, ?, ?, ?, ?, ?)
      `).run(...values);
      clientFxDealConstraintsEnforced = false;
    } catch {}
  });

  const nonClientPartyId = Number(database.prepare(`
    INSERT INTO trading_parties
      (party_type, party_code, party_code_type, party_name, is_active)
    VALUES ('EXTERNAL_COUNTERPARTY', 'VERIFY_DEAL_CP', 'OTHER', 'Verification Deal Counterparty', 1)
  `).run().lastInsertRowid);

  try {
    database.prepare(`
      INSERT INTO client_fx_deals
        (
          entry_timestamp, party_id, trade_date, ccy_pair_code, side,
          base_ccy_amount, quote_ccy_amount, trade_rate, tenor,
          base_ccy_value_date, quote_ccy_value_date
        )
      VALUES ('2026-07-15T09:30:00.000Z', ?, '2026-07-15', 'EUR_USD', 'BUY', 100, 112.31, 1.1231, 'TOD', '2026-07-15', '2026-07-15')
    `).run(nonClientPartyId);
    clientFxDealPartyTypeEnforced = false;
  } catch {}

  try {
    database.prepare("UPDATE trading_parties SET party_type = 'EXTERNAL_COUNTERPARTY' WHERE party_id = 1").run();
    clientFxDealPartyTypeEnforced = false;
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
    pricingRules: database.prepare("SELECT COUNT(*) AS count FROM pricing_rules").get().count,
    fxTradeExposures: database.prepare("SELECT COUNT(*) AS count FROM fx_trade_exposure").get().count,
    fxTradeExposureColumns: database.prepare("PRAGMA table_info(fx_trade_exposure)").all().map(column => column.name),
    fxTradeExposureForeignKeys: database.prepare("PRAGMA foreign_key_list(fx_trade_exposure)").all(),
    clientFxDeals: database.prepare("SELECT COUNT(*) AS count FROM client_fx_deals").get().count,
    clientFxDealColumns: database.prepare("PRAGMA table_info(client_fx_deals)").all().map(column => column.name),
    clientFxDealForeignKeys: database.prepare("PRAGMA foreign_key_list(client_fx_deals)").all(),
    pricingRuleExecutionContextIdType: database.prepare("PRAGMA table_info(pricing_rules)").all()
      .find(column => column.name === "execution_context_id")?.type,
    ccyOptionsConstraintsEnforced,
    ccyPairOptionsConstraintsEnforced,
    servicingLocationConstraintsEnforced,
    accountingSystemTextLimitsEnforced,
    executionSystemConstraintsEnforced,
    tradingPartyConstraintsEnforced,
    fxTradeExposureConstraintsEnforced,
    clientFxDealConstraintsEnforced,
    clientFxDealPartyTypeEnforced,
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
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const serverSource = fs.readFileSync(path.join(root, "server.js"), "utf8");
  const startScript = fs.readFileSync(path.join(root, "start-demo.bat"), "utf8");
  const scripts = [...html.matchAll(/<script(?:[^>]*)>([\s\S]*?)<\/script>/g)];
  const inlineScript = scripts.at(-1)?.[1] || "";
  new Function(inlineScript);

  const ids = [...html.matchAll(/\bid="([^"]+)"/g)]
    .map(match => match[1])
    .filter(id => !id.includes("${"));
  const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
  const domReferences = [...inlineScript.matchAll(/getElementById\("([^"]+)"\)/g)].map(match => match[1]);

  return {
    inlineJavaScript: "OK",
    duplicateIds,
    missingDomIds: [...new Set(domReferences.filter(id => !ids.includes(id)))],
    usesSimulationSettingsEndpoint: inlineScript.includes("/simulation-settings"),
    usesBackendSimulationStream: inlineScript.includes("/market-pulse-simulation/stream"),
    usesServicingLocationsEndpoint: inlineScript.includes("/api/v1/servicing-locations"),
    usesAccountingSystemsEndpoint: inlineScript.includes("/api/v1/accounting-systems"),
    usesExecutionSystemsEndpoint: inlineScript.includes("/api/v1/execution-systems"),
    usesExecutionContextsEndpoint: inlineScript.includes("/api/v1/execution-contexts"),
    usesTradingPartiesEndpoint: inlineScript.includes("/api/v1/trading-parties"),
    usesPricingRulesEndpoint: inlineScript.includes("/api/v1/pricing-rules"),
    usesPricingRulesBootstrap: inlineScript.includes("DEMO_API_BOOTSTRAP.pricingRules"),
    usesClientFxDealsEndpoint: serverSource.includes('pathname === "/api/v1/client-fx-deals"')
      && inlineScript.includes("DEMO_API_BOOTSTRAP.clientFxDeals"),
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
      && inlineScript.includes("function clientProfileRouteStateFromLocation()")
      && inlineScript.includes("function syncClientProfileRouteView()")
      && inlineScript.includes('navigateToClientProfileRoute("new")')
      && inlineScript.includes("navigateToClientProfileIndex(actionIndex)"),
    usesConstrainedTradingPartyWidth: html.includes("--trading-party-name-column-width: 420px")
      && html.includes("--trading-party-content-width: 1104px")
      && html.includes("--trading-party-frame-width: 1106px")
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
    supportsRequiredPartyTypes: inlineScript.includes('["CLIENT", "EXTERNAL_COUNTERPARTY", "INTERNAL_DESK"]'),
    supportsRequiredPartyCodeTypes: inlineScript.includes('["INN", "OTHER"]'),
    usesExplicitTooltipLayer: html.includes('id="appTooltip"')
      && inlineScript.includes("initializeTooltips();")
      && inlineScript.includes("suppressNativeTooltips();"),
    explicitTooltipCount: (html.match(/\bdata-tooltip=/g) || []).length,
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
      && startScript.includes('if not "%EXIT_CODE%"=="0" pause'),
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
      && (html.match(/data-pricing-rule-header-filter=/g) || []).length === 5
      && inlineScript.includes('pricingRuleIdSortDirection = "asc"')
      && inlineScript.includes('function updatePricingRuleIdSortControl()')
      && !html.includes('<input type="text" name="pricingContextId" placeholder="Assigned on save" readonly>')
      && !html.includes('id="pricingContextSearchInput"')
      && !html.includes("<th>Execution Context ID</th>")
      && !html.includes("<th>Pricing Rule ID</th>"),
    usesHumanReadablePricingRuleContexts: inlineScript.includes("function pricingContextDisplayPath(contextOrId)")
      && inlineScript.includes("pricingContextDisplayPath(rule.pricingContextId)")
      && html.includes('<th class="pricing-rule-context-column">')
      && html.includes('<span class="reference-column-title">Execution Context</span>')
      && html.includes('--pricing-rule-context-width: 64ch'),
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
      && inlineScript.includes('title: "Entry Timestamp"')
      && inlineScript.includes('title: "Trade Terms"')
      && inlineScript.includes('title: "Settlement"')
      && inlineScript.includes('field: "baseCcyValueDate"')
      && inlineScript.includes('field: "quoteCcyValueDate"')
      && !inlineScript.includes('client-deals-group-pricing')
      && !inlineScript.includes('client-deals-group-position')
      && !html.includes('id="clientFxDealsPinMode"')
      && !inlineScript.includes('applyClientFxDealsPinMode'),
    usesClientFxDealsDataTools: !html.includes('id="clientFxDealsSearchInput"')
      && !inlineScript.includes('function applyClientFxDealsSearch()')
      && html.includes('id="clientFxDealsClearFiltersButton"')
      && html.includes('id="clientFxDealsColumnPicker"')
      && html.includes('id="clientFxDealsColumnMenu"')
      && inlineScript.includes('function renderClientFxDealsColumnMenu(definitions)')
      && inlineScript.includes('clientFxDealsGrid.clearFilter(true)')
      && html.includes('justify-content: flex-end;')
      && html.includes('margin-top: 10px;'),
    usesClientFxDealsVerticalGridlines: html.includes('#clientFxDealsPage .tabulator .tabulator-cell')
      && html.includes('border-right: 1px solid var(--bs-border-color);')
      && html.includes('text-align: center;'),
    usesClientFxDealsFixedHeaders: html.includes('height: max(360px, calc(100vh - 178px));')
      && inlineScript.includes('renderVertical: "virtual"'),
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
    usesBootstrapReferenceDataControls: (html.match(/btn btn-sm btn-outline-primary reference-new-button/g) || []).length === 4
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
      && html.includes('#clientFxDealsPage.client-deals-bootstrap .tabulator,')
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
    usesSingleClientDealsOuterEdge: html.includes('.tabulator-header .client-deals-group-settlement .tabulator-col-group-cols > .tabulator-col:not([style*="display: none"]):not(:has(~ .tabulator-col:not([style*="display: none"])))')
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
    const pricingRulesTable = await request("GET", "/api/database/tables/pricing_rules");
    const clientFxDealsTable = await request("GET", "/api/database/tables/client_fx_deals");
    const legacyAssignmentTable = await request("GET", "/api/database/tables/trading_party_execution_contexts");
    const servicingLocations = await request("GET", "/api/v1/servicing-locations");
    const accountingSystems = await request("GET", "/api/v1/accounting-systems");
    const executionSystems = await request("GET", "/api/v1/execution-systems");
    const executionContexts = await request("GET", "/api/v1/execution-contexts");
    const tradingParties = await request("GET", "/api/v1/trading-parties");
    const pricingRules = await request("GET", "/api/v1/pricing-rules");
    const clientFxDeals = await request("GET", "/api/v1/client-fx-deals");
    const clientFxDealPayload = {
      entryTimestamp: "2026-07-16T10:15:30.000Z",
      partyId: 1,
      tradeDate: "2026-07-16",
      ccyPairCode: "EUR_USD",
      side: "SELL",
      baseCcyAmount: 2000000,
      quoteCcyAmount: 2246200,
      tradeRate: 1.1231,
      tenor: "TOD",
      baseCcyValueDate: "2026-07-16",
      quoteCcyValueDate: "2026-07-16"
    };
    const createClientFxDeal = await request("POST", "/api/v1/client-fx-deals", clientFxDealPayload);
    const clientFxDealId = encodeURIComponent(createClientFxDeal.body?.clientDealId ?? "");
    const updateClientFxDeal = await request("PUT", `/api/v1/client-fx-deals/${clientFxDealId}`, {
      ...clientFxDealPayload,
      baseCcyAmount: 2500000,
      quoteCcyAmount: 2807750
    });
    const invalidClientFxDealSide = await request("POST", "/api/v1/client-fx-deals", {
      ...clientFxDealPayload,
      side: "HOLD"
    });
    const invalidClientFxDealParty = await request("POST", "/api/v1/client-fx-deals", {
      ...clientFxDealPayload,
      partyId: 999999
    });
    const deleteClientFxDeal = await request("DELETE", `/api/v1/client-fx-deals/${clientFxDealId}`);
    const clientFxDealsAfterDelete = await request("GET", "/api/v1/client-fx-deals");
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
      partyType: "INTERNAL_DESK",
      partyCode: "FX_DESK_1",
      partyCodeType: "OTHER",
      partyName: "Verification FX Desk",
      active: true
    });
    const tradingPartyId = encodeURIComponent(createTradingParty.body?.partyId ?? "");
    const updateTradingParty = await request("PUT", `/api/v1/trading-parties/${tradingPartyId}`, {
      partyType: "EXTERNAL_COUNTERPARTY",
      partyCode: "VERIFY_CP",
      partyCodeType: "OTHER",
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
        && tradingPartiesTable.body?.createSql?.includes("is_active IN (0, 1)"),
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
      legacyAssignmentTableRemoved: legacyAssignmentTable.statusCode === 404,
      pricingRuleColumns: pricingRulesTable.body?.columns?.map(column => column.name) || [],
      pricingRuleExecutionContextIdType: pricingRulesTable.body?.columns
        ?.find(column => column.name === "execution_context_id")?.type,
      pricingRuleForeignKeys: pricingRulesTable.body?.foreignKeys || [],
      clientFxDealColumns: clientFxDealsTable.body?.columns?.map(column => column.name) || [],
      clientFxDealForeignKeys: clientFxDealsTable.body?.foreignKeys || [],
      clientFxDeals: {
        count: clientFxDeals.body?.length ?? -1,
        first: clientFxDeals.body?.[0] || null,
        createdId: createClientFxDeal.body?.clientDealId,
        createdSide: createClientFxDeal.body?.side,
        updatedBaseAmount: updateClientFxDeal.body?.baseCcyAmount,
        countAfterDelete: clientFxDealsAfterDelete.body?.length ?? -1,
        lifecycle: [
          createClientFxDeal.statusCode,
          updateClientFxDeal.statusCode,
          invalidClientFxDealSide.statusCode,
          invalidClientFxDealParty.statusCode,
          deleteClientFxDeal.statusCode
        ]
      },
      pricingRules: {
        count: pricingRules.body?.length ?? -1,
        migratedIdsPreserved: pricingRules.body?.map(rule => rule.pricingRuleId).sort((left, right) => left - right).join(",") === "1,2,3,4,5",
        migratedContextIdsAreIntegers: pricingRules.body?.every(rule => Number.isInteger(rule.executionContextId)),
        createdId: createPricingRule.body?.pricingRuleId,
        createdPartyId: createPricingRule.body?.partyId,
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
          invalidTradingPartyCodeType.statusCode,
          invalidTradingPartyCodeLength.statusCode,
          invalidTradingPartyNameLength.statusCode,
          deleteTradingParty.statusCode
        ]
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
      "client_fx_deals",
      "execution_contexts",
      "execution_systems",
      "fx_trade_exposure",
      "market_quote_simulation_settings",
      "pricing_rules",
      "servicing_locations",
      "trading_parties"
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
      || freshSchema.tradingParties !== 3
      || freshSchema.pricingRules !== 5
      || freshSchema.fxTradeExposures !== 4
      || freshSchema.fxTradeExposureColumns.join(",") !== "trade_id,entry_timestamp,trade_type,trade_date,ccy_pair_code,side,base_ccy_amount,quote_ccy_amount,trade_rate,tenor,base_ccy_value_date,quote_ccy_value_date"
      || freshSchema.fxTradeExposureForeignKeys.length !== 1
      || freshSchema.clientFxDeals !== 1
      || freshSchema.clientFxDealColumns.join(",") !== "client_deal_id,entry_timestamp,party_id,trade_date,ccy_pair_code,side,base_ccy_amount,quote_ccy_amount,trade_rate,tenor,base_ccy_value_date,quote_ccy_value_date"
      || freshSchema.clientFxDealForeignKeys.length !== 2
      || freshSchema.pricingRuleExecutionContextIdType !== "INTEGER"
      || !freshSchema.ccyOptionsConstraintsEnforced
      || !freshSchema.ccyPairOptionsConstraintsEnforced
      || !freshSchema.servicingLocationConstraintsEnforced
      || !freshSchema.accountingSystemTextLimitsEnforced
      || !freshSchema.executionSystemConstraintsEnforced
      || !freshSchema.tradingPartyConstraintsEnforced
      || !freshSchema.fxTradeExposureConstraintsEnforced
      || !freshSchema.clientFxDealConstraintsEnforced
      || !freshSchema.clientFxDealPartyTypeEnforced
      || freshSchema.legacyAssignmentTablePresent
      || freshSchema.foreignKeyViolations !== 0
      || frontend.duplicateIds.length > 0
      || frontend.missingDomIds.length > 0
      || !frontend.usesSimulationSettingsEndpoint
      || !frontend.usesBackendSimulationStream
      || !frontend.usesServicingLocationsEndpoint
      || !frontend.usesAccountingSystemsEndpoint
      || !frontend.usesExecutionSystemsEndpoint
      || !frontend.usesExecutionContextsEndpoint
      || !frontend.usesTradingPartiesEndpoint
      || !frontend.usesPricingRulesEndpoint
      || !frontend.usesPricingRulesBootstrap
      || !frontend.usesClientFxDealsEndpoint
      || !frontend.usesTradingPartiesLanguage
      || !frontend.usesTradingPartyBadgeIcon
      || !frontend.usesTradingPartyColumnFilters
      || !frontend.usesBootstrapTradingPartyGrid
      || !frontend.usesTradingPartyPricingContextBricks
      || !frontend.usesTradingPartyDetailRoutes
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
      || frontend.explicitTooltipCount !== 2
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
      || apiAndMigration.tables.join(",") !== expectedTables.join(",")
      || !apiAndMigration.ccyOptionsConstraintMigrated
      || !apiAndMigration.ccyPairOptionsConstraintMigrated
      || !apiAndMigration.executionSystemConstraintMigrated
      || !apiAndMigration.tradingPartyConstraintsMigrated
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
      || !apiAndMigration.legacyAssignmentTableRemoved
      || apiAndMigration.pricingRuleColumns.join(",") !== "pricing_rule_id,party_id,execution_context_id,ccy_pair_code,margin_percent"
      || apiAndMigration.pricingRuleExecutionContextIdType !== "INTEGER"
      || apiAndMigration.pricingRuleForeignKeys.length !== 3
      || !apiAndMigration.pricingRuleForeignKeys.every(foreignKey => foreignKey.onUpdate === "RESTRICT" && foreignKey.onDelete === "RESTRICT")
      || !["trading_parties", "execution_contexts", "ccy_pair_options"].every(referencedTable =>
        apiAndMigration.pricingRuleForeignKeys.some(foreignKey => foreignKey.referencedTable === referencedTable)
      )
      || apiAndMigration.clientFxDealColumns.join(",") !== "client_deal_id,entry_timestamp,party_id,trade_date,ccy_pair_code,side,base_ccy_amount,quote_ccy_amount,trade_rate,tenor,base_ccy_value_date,quote_ccy_value_date"
      || apiAndMigration.clientFxDealForeignKeys.length !== 2
      || !apiAndMigration.clientFxDealForeignKeys.every(foreignKey => foreignKey.onUpdate === "RESTRICT" && foreignKey.onDelete === "RESTRICT")
      || !["trading_parties", "ccy_pair_options"].every(referencedTable =>
        apiAndMigration.clientFxDealForeignKeys.some(foreignKey => foreignKey.referencedTable === referencedTable)
      )
      || apiAndMigration.clientFxDeals.count !== 1
      || apiAndMigration.clientFxDeals.first?.clientCode !== "7701234567"
      || apiAndMigration.clientFxDeals.first?.clientName !== "Romashka Company"
      || apiAndMigration.clientFxDeals.first?.currencyPair !== "EUR/USD"
      || apiAndMigration.clientFxDeals.first?.entryTimestamp !== "2026-07-15T09:30:00.000Z"
      || !Number.isInteger(apiAndMigration.clientFxDeals.createdId)
      || apiAndMigration.clientFxDeals.createdSide !== "SELL"
      || apiAndMigration.clientFxDeals.updatedBaseAmount !== 2500000
      || apiAndMigration.clientFxDeals.countAfterDelete !== 1
      || apiAndMigration.clientFxDeals.lifecycle.join(",") !== "201,200,400,400,204"
      || apiAndMigration.pricingRules.count !== 5
      || !apiAndMigration.pricingRules.migratedIdsPreserved
      || !apiAndMigration.pricingRules.migratedContextIdsAreIntegers
      || !Number.isInteger(apiAndMigration.pricingRules.createdId)
      || apiAndMigration.pricingRules.createdId <= 0
      || apiAndMigration.pricingRules.createdPartyId !== apiAndMigration.tradingParties.createdId
      || apiAndMigration.pricingRules.createdPairCode !== "EUR_USD"
      || apiAndMigration.pricingRules.createdCurrencyPair !== "EUR/USD"
      || apiAndMigration.pricingRules.updatedId !== apiAndMigration.pricingRules.createdId
      || apiAndMigration.pricingRules.updatedContextId !== apiAndMigration.pricingRules.expectedUpdatedContextId
      || apiAndMigration.pricingRules.updatedMargin !== 0.3
      || apiAndMigration.pricingRules.lifecycle.join(",") !== "201,200,409,400,400,409,204"
      || apiAndMigration.tradingParties.count !== 3
      || apiAndMigration.tradingParties.createdType !== "INTERNAL_DESK"
      || apiAndMigration.tradingParties.createdCodeType !== "OTHER"
      || apiAndMigration.tradingParties.updatedType !== "EXTERNAL_COUNTERPARTY"
      || apiAndMigration.tradingParties.updatedCode !== "VERIFY_CP"
      || apiAndMigration.tradingParties.updatedActive !== false
      || apiAndMigration.tradingParties.countAfterDelete !== 3
      || apiAndMigration.tradingParties.lifecycle.join(",") !== "201,200,409,400,400,400,204"
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
