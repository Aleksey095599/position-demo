BEGIN IMMEDIATE;

INSERT INTO ccy_options (ccy_code, name, country, fraction_digits)
VALUES
    ('EUR', 'Euro', 'Euro Area', 2),
    ('GBP', 'Pound Sterling', 'United Kingdom', 2),
    ('JPY', 'Japanese Yen', 'Japan', 0),
    ('RUB', 'Russian Ruble', 'Russia', 2),
    ('USD', 'US Dollar', 'United States', 2);

INSERT INTO ccy_pair_options
    (ccy_pair_code, base_ccy_code, quote_ccy_code, default_quote_decimals)
VALUES
    ('EUR_USD', 'EUR', 'USD', 4),
    ('GBP_USD', 'GBP', 'USD', 4),
    ('USD_RUB', 'USD', 'RUB', 4);

INSERT INTO market_quote_simulation_settings
    (ccy_pair_code, bid_min, spread, bid_max)
VALUES
    ('EUR_USD', 1.1220, 0.0002, 1.1222),
    ('GBP_USD', 1.2680, 0.0003, 1.2710),
    ('USD_RUB', 88.5000, 0.1500, 90.2500);

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
    (accounting_system_id, name, is_active)
VALUES
    ('AFINA', 'Afina Core Ledger', 1),
    ('CTF3', 'CTF3 Treasury Settlement', 1);

INSERT INTO execution_systems
    (execution_system_id, name, pricing_mode, is_active)
VALUES
    ('CLICK_TRADE_EFX', 'Click Trade eFX', 'AUTO_PRICED', 1),
    ('RFQ', 'Request for Quote', 'DEALER_APPROVED', 1),
    ('MANUAL_CLIENT_DEAL_ENTRY', 'Manual Client Deal Entry', 'DEALER_PRICED', 1);

INSERT INTO execution_contexts
    (servicing_location_id, accounting_system_id, execution_system_id)
VALUES
    ('002', 'AFINA', 'CLICK_TRADE_EFX'),
    ('002', 'AFINA', 'RFQ'),
    ('002', 'CTF3', 'MANUAL_CLIENT_DEAL_ENTRY'),
    ('1234', 'AFINA', 'RFQ'),
    ('001', 'CTF3', 'CLICK_TRADE_EFX');

INSERT INTO trading_parties
    (party_type, party_code, party_code_type, party_name, is_active)
VALUES
    ('CLIENT', '7701234567', 'INN', 'Romashka Company', 1),
    ('CLIENT', '7812345678', 'INN', 'Vasilek Company', 1),
    ('CLIENT', '5409876543', 'INN', 'Gladiolus Company', 1),
    ('HEDGE_COUNTERPARTY', '7707000001', 'INN', 'Aurora Bank', 1);

INSERT INTO users
    (user_code, first_name, last_name, user_role, is_active)
VALUES
    ('GANDALF', 'Gandalf', 'Grey', 'DEALER', 1),
    ('TIN_WOODMAN', 'Tin', 'Woodman', 'SUPERVISOR', 1),
    ('ALICE', 'Alice', 'Wonderland', 'ADMIN', 1);

WITH pricing_rule_seed
    (party_code, servicing_location_id, accounting_system_id, execution_system_id, ccy_pair_code, margin_percent)
AS
(
    VALUES
        ('7701234567', '002', 'AFINA', 'CLICK_TRADE_EFX', 'EUR_USD', 0.10),
        ('7701234567', '002', 'AFINA', 'RFQ', 'EUR_USD', 0.12),
        ('7701234567', '002', 'CTF3', 'MANUAL_CLIENT_DEAL_ENTRY', 'EUR_USD', 0.08),
        ('7812345678', '1234', 'AFINA', 'RFQ', 'EUR_USD', 0.05),
        ('5409876543', '001', 'CTF3', 'CLICK_TRADE_EFX', 'EUR_USD', 0.20),
        ('7707000001', '002', 'CTF3', 'MANUAL_CLIENT_DEAL_ENTRY', 'EUR_USD', 0.03)
)
INSERT INTO pricing_rules (party_id, execution_context_id, ccy_pair_code, margin_percent)
SELECT
    p.party_id,
    e.execution_context_id,
    seed.ccy_pair_code,
    seed.margin_percent
FROM pricing_rule_seed seed
INNER JOIN trading_parties p
    ON p.party_code_type = 'INN'
    AND p.party_code = seed.party_code
INNER JOIN execution_contexts e
    ON e.servicing_location_id = seed.servicing_location_id
    AND e.accounting_system_id = seed.accounting_system_id
    AND e.execution_system_id = seed.execution_system_id;

INSERT INTO client_deal_generation_settings
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
    );

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
SELECT
    last_insert_rowid(),
    'CLIENT_DEAL',
    r.party_id,
    r.execution_context_id,
    r.pricing_rule_id,
    1.1222,
    27000
FROM pricing_rules r
INNER JOIN trading_parties p ON p.party_id = r.party_id
INNER JOIN execution_contexts e ON e.execution_context_id = r.execution_context_id
WHERE p.party_code_type = 'INN'
  AND p.party_code = '7701234567'
  AND r.ccy_pair_code = 'EUR_USD'
  AND e.servicing_location_id = '002'
  AND e.accounting_system_id = 'CTF3'
  AND e.execution_system_id = 'MANUAL_CLIENT_DEAL_ENTRY';

INSERT INTO fx_trade_market_snapshot
    (
        trade_id,
        trade_type,
        market_pulse_stream_status,
        market_pulse_bid,
        market_pulse_offer,
        market_pulse_timestamp
    )
SELECT
    d.trade_id,
    d.trade_type,
    'RUNNING',
    1.1220,
    1.1222,
    '2026-07-15T09:30:00.000Z'
FROM client_fx_deals d
WHERE d.trade_id = last_insert_rowid();

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
        '2026-07-15T09:31:00.000Z',
        'HEDGE_DEAL',
        '2026-07-15',
        'EUR_USD',
        'SELL',
        'EUR',
        3000000000,
        2,
        3366600000,
        2,
        1.1222,
        'TOD',
        '2026-07-15',
        '2026-07-15'
    );

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
SELECT
    last_insert_rowid(),
    'HEDGE_DEAL',
    r.party_id,
    r.execution_context_id,
    r.pricing_rule_id,
    1.1222,
    0
FROM pricing_rules r
INNER JOIN trading_parties p ON p.party_id = r.party_id
INNER JOIN execution_contexts e ON e.execution_context_id = r.execution_context_id
WHERE p.party_code_type = 'INN'
  AND p.party_code = '7707000001'
  AND r.ccy_pair_code = 'EUR_USD'
  AND e.servicing_location_id = '002'
  AND e.accounting_system_id = 'CTF3'
  AND e.execution_system_id = 'MANUAL_CLIENT_DEAL_ENTRY';

INSERT INTO fx_trade_market_snapshot
    (
        trade_id,
        trade_type,
        market_pulse_stream_status,
        market_pulse_bid,
        market_pulse_offer,
        market_pulse_timestamp
    )
SELECT
    d.trade_id,
    d.trade_type,
    'RUNNING',
    1.1220,
    1.1222,
    '2026-07-15T09:31:00.000Z'
FROM fx_hedge_deals d
WHERE d.trade_id = last_insert_rowid();

COMMIT;
