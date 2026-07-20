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
    ('CLIENT', '5409876543', 'INN', 'Gladiolus Company', 1);

WITH pricing_rule_seed
    (party_code, servicing_location_id, accounting_system_id, execution_system_id, ccy_pair_code, margin_percent)
AS
(
    VALUES
        ('7701234567', '002', 'AFINA', 'CLICK_TRADE_EFX', 'EUR_USD', 0.10),
        ('7701234567', '002', 'AFINA', 'RFQ', 'EUR_USD', 0.12),
        ('7701234567', '002', 'CTF3', 'MANUAL_CLIENT_DEAL_ENTRY', 'EUR_USD', 0.08),
        ('7812345678', '1234', 'AFINA', 'RFQ', 'EUR_USD', 0.05),
        ('5409876543', '001', 'CTF3', 'CLICK_TRADE_EFX', 'EUR_USD', 0.20)
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
WHERE party_code_type = 'INN' AND party_code = '7701234567';
