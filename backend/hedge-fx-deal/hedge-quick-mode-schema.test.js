"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

function quickModeDatabase() {
  const database = new DatabaseSync(":memory:");
  const schemaPath = path.resolve(__dirname, "..", "..", "schema.sql");
  database.exec(fs.readFileSync(schemaPath, "utf8"));
  database.exec(`
    INSERT INTO ccy_options
      (ccy_code, name, country, fraction_digits)
    VALUES
      ('EUR', 'Euro', 'Europe', 2),
      ('USD', 'Dollar', 'USA', 2);

    INSERT INTO ccy_pair_options
      (ccy_pair_code, base_ccy_code, quote_ccy_code, default_quote_decimals)
    VALUES ('EUR_USD', 'EUR', 'USD', 4);

    INSERT INTO servicing_locations
      (servicing_location_id, name, region, location_type, is_active)
    VALUES ('HQ', 'Head Office', 'Europe', 'HEAD_OFFICE', 1);

    INSERT INTO execution_systems
      (execution_system_id, name, pricing_mode, is_active)
    VALUES
      ('AUTO', 'Auto', 'AUTO_PRICED', 1),
      ('DEALER', 'Dealer', 'DEALER_PRICED', 1);

    INSERT INTO execution_contexts
      (
        execution_context_id,
        servicing_location_id,
        accounting_system_id,
        execution_system_id
      )
    VALUES
      (1, 'HQ', NULL, 'AUTO'),
      (2, 'HQ', NULL, 'DEALER');

    INSERT INTO trading_counterparties
      (counterparty_id, counterparty_name, is_active)
    VALUES
      (1, 'Hedge Counterparty', 1),
      (2, 'Client Counterparty', 1);

    INSERT INTO external_counterparties
      (counterparty_id, counterparty_code, counterparty_code_type, external_counterparty_kind)
    VALUES
      (1, 'HEDGE', 'OTHER', 'CORPORATE'),
      (2, '1234567890', 'INN', 'CORPORATE');

    INSERT INTO trading_counterparty_roles
      (counterparty_id, role_code)
    VALUES
      (1, 'HEDGE_COUNTERPARTY'),
      (2, 'CLIENT');

    INSERT INTO trading_counterparty_execution_contexts
      (counterparty_id, execution_context_id)
    VALUES
      (1, 1),
      (1, 2),
      (2, 1);

    INSERT INTO pricing_rules
      (pricing_rule_id, counterparty_id, execution_context_id, ccy_pair_code, margin_percent)
    VALUES
      (1, 1, 1, 'EUR_USD', 0),
      (2, 1, 2, 'EUR_USD', 0),
      (3, 2, 1, 'EUR_USD', 0);
  `);
  return database;
}

const validSettingsSql = `
  INSERT INTO fx_hedge_quick_mode_settings
    (
      ccy_pair_code,
      counterparty_id,
      pricing_rule_id,
      base_ccy_fraction_digits,
      small_base_ccy_amount_minor,
      medium_base_ccy_amount_minor,
      large_base_ccy_amount_minor,
      xlarge_base_ccy_amount_minor,
      is_active
    )
  VALUES ('EUR_USD', 1, 1, 2, 500000000, 2000000000, 5000000000, 10000000000, 1)
`;

test("Hedge Quick Mode Settings enforce the preset and pricing-rule invariants", () => {
  const database = quickModeDatabase();

  try {
    database.exec(validSettingsSql);
    assert.throws(
      () => database.exec(`
        UPDATE fx_hedge_quick_mode_settings
        SET medium_base_ccy_amount_minor = small_base_ccy_amount_minor
        WHERE ccy_pair_code = 'EUR_USD'
      `),
      /CHECK constraint failed/
    );
    assert.throws(
      () => database.exec(`
        UPDATE fx_hedge_quick_mode_settings
        SET default_tenor = 'FORWARD'
        WHERE ccy_pair_code = 'EUR_USD'
      `),
      /CHECK constraint failed/
    );
    assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    database.close();
  }

  for (const invalidPricingRuleId of [2, 3]) {
    const invalidDatabase = quickModeDatabase();

    try {
      assert.throws(
        () => invalidDatabase.exec(
          validSettingsSql.replace(
            "VALUES ('EUR_USD', 1, 1,",
            `VALUES ('EUR_USD', ${invalidPricingRuleId === 3 ? 2 : 1}, ${invalidPricingRuleId},`
          )
        ),
        /AUTO_PRICED HEDGE_COUNTERPARTY/
      );
    } finally {
      invalidDatabase.close();
    }
  }
});

test("Hedge Quick Mode Settings keep the explicit counterparty aligned with the Pricing Rule", () => {
  const database = quickModeDatabase();

  try {
    assert.throws(
      () => database.exec(
        validSettingsSql.replace(
          "VALUES ('EUR_USD', 1, 1,",
          "VALUES ('EUR_USD', 2, 1,"
        )
      ),
      /FOREIGN KEY constraint failed|AUTO_PRICED HEDGE_COUNTERPARTY/
    );
  } finally {
    database.close();
  }
});

test("Hedge Quick Mode Settings preserve eligibility across reverse mutations", () => {
  const database = quickModeDatabase();

  try {
    database.exec(validSettingsSql);
    assert.throws(
      () => database.exec(`
        DELETE FROM trading_counterparty_roles
        WHERE counterparty_id = 1
          AND role_code = 'HEDGE_COUNTERPARTY'
      `),
      /must (?:remain|retain).*HEDGE_COUNTERPARTY/
    );
    assert.throws(
      () => database.exec(`
        UPDATE execution_systems
        SET pricing_mode = 'DEALER_PRICED'
        WHERE execution_system_id = 'AUTO'
      `),
      /must remain AUTO_PRICED/
    );
    assert.throws(
      () => database.exec(`
        UPDATE ccy_options
        SET fraction_digits = 3
        WHERE ccy_code = 'EUR'
      `),
      /precision/
    );
  } finally {
    database.close();
  }
});

test("Fresh demo seed configures the unambiguous EUR/USD Quick Mode defaults", () => {
  const database = new DatabaseSync(":memory:");
  const schemaPath = path.resolve(__dirname, "..", "..", "schema.sql");
  const seedPath = path.resolve(__dirname, "..", "..", "seed.sql");

  try {
    database.exec(fs.readFileSync(schemaPath, "utf8"));
    database.exec(fs.readFileSync(seedPath, "utf8"));

    const settings = database.prepare(`
      SELECT
        settings.*,
        role.role_code AS counterparty_type,
        execution.pricing_mode AS pricing_mode
      FROM fx_hedge_quick_mode_settings settings
      INNER JOIN pricing_rules rule
        ON rule.pricing_rule_id = settings.pricing_rule_id
      INNER JOIN trading_counterparties counterparty ON counterparty.counterparty_id = settings.counterparty_id
      INNER JOIN trading_counterparty_roles role
        ON role.counterparty_id = counterparty.counterparty_id
       AND role.role_code = 'HEDGE_COUNTERPARTY'
      INNER JOIN execution_contexts context
        ON context.execution_context_id = rule.execution_context_id
      INNER JOIN execution_systems execution
        ON execution.execution_system_id = context.execution_system_id
      WHERE settings.ccy_pair_code = 'EUR_USD'
    `).get();

    assert.deepEqual(
      {
        fractionDigits: settings.base_ccy_fraction_digits,
        amounts: [
          settings.small_base_ccy_amount_minor,
          settings.medium_base_ccy_amount_minor,
          settings.large_base_ccy_amount_minor,
          settings.xlarge_base_ccy_amount_minor
        ],
        defaultTenor: settings.default_tenor,
        counterpartyId: settings.counterparty_id,
        counterpartyType: settings.counterparty_type,
        pricingMode: settings.pricing_mode,
        active: settings.is_active
      },
      {
        fractionDigits: 2,
        amounts: [500_000_000, 2_000_000_000, 5_000_000_000, 10_000_000_000],
        defaultTenor: "TOD",
        counterpartyId: 4,
        counterpartyType: "HEDGE_COUNTERPARTY",
        pricingMode: "AUTO_PRICED",
        active: 1
      }
    );
    assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    database.close();
  }
});
