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
    (
        ccy_pair_code,
        bid_min,
        spread,
        bid_max,
        one_way_duration_seconds,
        fluctuation_spreads
    )
VALUES
    ('EUR_USD', 1.1220, 0.0002, 1.1250, 60, 3),
    ('GBP_USD', 1.2680, 0.0003, 1.2710, 60, 3),
    ('USD_RUB', 88.5000, 0.1500, 90.2500, 60, 3);

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
    (
        servicing_location_id,
        accounting_system_id,
        execution_system_id,
        default_position_management_mode
    )
VALUES
    ('002', 'AFINA', 'CLICK_TRADE_EFX', 'AUTO'),
    ('002', 'AFINA', 'RFQ', 'MANUAL'),
    ('002', 'CTF3', 'MANUAL_CLIENT_DEAL_ENTRY', 'MANUAL'),
    ('1234', 'AFINA', 'RFQ', 'MANUAL'),
    ('001', 'CTF3', 'CLICK_TRADE_EFX', 'AUTO');

INSERT INTO trading_counterparties
    (counterparty_name, is_active)
VALUES
    ('Romashka Company', 1),
    ('Vasilek Company', 1),
    ('Gladiolus Company', 1),
    ('Aurora Bank', 1),
    ('Treasury Trading Desk', 1);

WITH external_counterparty_seed (counterparty_name, counterparty_code, counterparty_code_type, external_counterparty_kind) AS
(
    VALUES
        ('Romashka Company', '7701234567', 'INN', 'CORPORATE'),
        ('Vasilek Company', '7812345678', 'INN', 'CORPORATE'),
        ('Gladiolus Company', '5409876543', 'INN', 'CORPORATE'),
        ('Aurora Bank', '7707000001', 'INN', 'BANK')
)
INSERT INTO external_counterparties (counterparty_id, counterparty_code, counterparty_code_type, external_counterparty_kind)
SELECT counterparty.counterparty_id, seed.counterparty_code, seed.counterparty_code_type, seed.external_counterparty_kind
FROM external_counterparty_seed seed
INNER JOIN trading_counterparties counterparty ON counterparty.counterparty_name = seed.counterparty_name;

INSERT INTO trading_counterparty_roles (counterparty_id, role_code)
SELECT counterparty_id, 'CLIENT'
FROM trading_counterparties
WHERE counterparty_name IN ('Romashka Company', 'Vasilek Company', 'Gladiolus Company');

INSERT INTO trading_counterparty_roles (counterparty_id, role_code)
SELECT counterparty_id, 'HEDGE_COUNTERPARTY'
FROM trading_counterparties
WHERE counterparty_name IN ('Aurora Bank', 'Treasury Trading Desk');

INSERT INTO internal_units (counterparty_id, unit_code, unit_type)
SELECT counterparty_id, 'IB_FX', 'DESK'
FROM trading_counterparties
WHERE counterparty_name = 'Treasury Trading Desk';

INSERT INTO users
    (user_code, first_name, last_name, user_role, is_active)
VALUES
    ('GANDALF', 'Gandalf', 'Grey', 'DEALER', 1),
    ('TIN_WOODMAN', 'Tin', 'Woodman', 'SUPERVISOR', 1),
    ('ALICE', 'Alice', 'Wonderland', 'ADMIN', 1);

WITH bootstrap_palette
    (
        palette_family,
        family_order,
        shade_100,
        shade_200,
        shade_300,
        shade_400,
        shade_500,
        shade_600,
        shade_700,
        shade_800,
        shade_900
    )
AS
(
    VALUES
        ('BLUE', 0, '#CFE2FF', '#9EC5FE', '#6EA8FE', '#3D8BFD', '#0D6EFD', '#0A58CA', '#084298', '#052C65', '#031633'),
        ('INDIGO', 1, '#E0CFFC', '#C29FFA', '#A370F7', '#8540F5', '#6610F2', '#520DC2', '#3D0A91', '#290661', '#140330'),
        ('PURPLE', 2, '#E2D9F3', '#C5B3E6', '#A98EDA', '#8C68CD', '#6F42C1', '#59359A', '#432874', '#2C1A4D', '#160D27'),
        ('PINK', 3, '#F7D6E6', '#EFADCE', '#E685B5', '#DE5C9D', '#D63384', '#AB296A', '#801F4F', '#561435', '#2B0A1A'),
        ('RED', 4, '#F8D7DA', '#F1AEB5', '#EA868F', '#E35D6A', '#DC3545', '#B02A37', '#842029', '#58151C', '#2C0B0E'),
        ('ORANGE', 5, '#FFE5D0', '#FECBA1', '#FEB272', '#FD9843', '#FD7E14', '#CA6510', '#984C0C', '#653208', '#331904'),
        ('YELLOW', 6, '#FFF3CD', '#FFE69C', '#FFDA6A', '#FFCD39', '#FFC107', '#CC9A06', '#997404', '#664D03', '#332701'),
        ('GREEN', 7, '#D1E7DD', '#A3CFBB', '#75B798', '#479F76', '#198754', '#146C43', '#0F5132', '#0A3622', '#051B11'),
        ('TEAL', 8, '#D2F4EA', '#A6E9D5', '#79DFC1', '#4DD4AC', '#20C997', '#1AA179', '#13795B', '#0D503C', '#06281E'),
        ('CYAN', 9, '#CFF4FC', '#9EEAF9', '#6EDFF6', '#3DD5F3', '#0DCAF0', '#0AA2C0', '#087990', '#055160', '#032830'),
        ('GRAY', 10, '#F8F9FA', '#E9ECEF', '#DEE2E6', '#CED4DA', '#ADB5BD', '#6C757D', '#495057', '#343A40', '#212529')
),
bootstrap_shades (shade, shade_order)
AS
(
    VALUES
        (100, 1),
        (200, 2),
        (300, 3),
        (400, 4),
        (500, 5),
        (600, 6),
        (700, 7),
        (800, 8),
        (900, 9)
)
INSERT INTO ui_color_tokens
    (
        token_code,
        palette_family,
        shade,
        color_value,
        display_order
    )
SELECT
    lower(palette_family) || '_' || shade,
    palette_family,
    shade,
    CASE shade
        WHEN 100 THEN shade_100
        WHEN 200 THEN shade_200
        WHEN 300 THEN shade_300
        WHEN 400 THEN shade_400
        WHEN 500 THEN shade_500
        WHEN 600 THEN shade_600
        WHEN 700 THEN shade_700
        WHEN 800 THEN shade_800
        WHEN 900 THEN shade_900
    END,
    (family_order * 100) + (shade_order * 10)
FROM bootstrap_palette
CROSS JOIN bootstrap_shades
ORDER BY family_order, shade_order;

INSERT INTO ui_table_column_settings
    (table_key, column_key, column_label, display_order, default_width_px, width_px)
VALUES
    ('pricing_rules_grid', 'id', 'ID', 0, 64, 64),
    ('pricing_rules_grid', 'counterparty_code', 'Counterparty Code', 1, 122, 122),
    ('pricing_rules_grid', 'counterparty_name', 'Counterparty Name', 2, 158, 158),
    ('pricing_rules_grid', 'execution_context', 'Execution Context', 3, 596, 596),
    ('pricing_rules_grid', 'ccy_pair', 'Ccy Pair', 4, 88, 88),
    ('pricing_rules_grid', 'pricing_mode', 'Pricing Mode', 5, 156, 156),
    ('pricing_rules_grid', 'position_management_mode', 'FX Position Mode', 6, 232, 232),
    ('pricing_rules_grid', 'margin', 'Margin', 7, 82, 82),
    ('internal_pricing_rules_grid', 'id', 'ID', 0, 64, 64),
    ('internal_pricing_rules_grid', 'counterparty_code', 'Unit Code', 1, 122, 122),
    ('internal_pricing_rules_grid', 'counterparty_name', 'Counterparty Name', 2, 158, 158),
    ('internal_pricing_rules_grid', 'execution_context', 'Execution Context', 3, 596, 596),
    ('internal_pricing_rules_grid', 'ccy_pair', 'Ccy Pair', 4, 88, 88),
    ('internal_pricing_rules_grid', 'pricing_mode', 'Pricing Mode', 5, 156, 156),
    ('internal_pricing_rules_grid', 'position_management_mode', 'FX Position Mode', 6, 232, 232),
    ('internal_pricing_rules_grid', 'margin', 'Margin', 7, 82, 82),
    ('internal_pricing_rules_grid', 'quick_hedge', 'Quick Hedge', 8, 112, 112),
    ('market_stream_grid', 'currency_pair', 'Ccy Pair', 0, 94, 94),
    ('market_stream_grid', 'bid', 'Bid', 1, 83, 83),
    ('market_stream_grid', 'offer', 'Offer', 2, 83, 83),
    ('market_stream_grid', 'actions', 'Actions', 3, 80, 80),
    ('ccy_options_grid', 'code', 'Code', 0, 101, 101),
    ('ccy_options_grid', 'name', 'Name', 1, 141, 141),
    ('ccy_options_grid', 'country', 'Country', 2, 141, 141),
    ('ccy_options_grid', 'fraction_digits', 'Fraction Digits', 3, 83, 83),
    ('ccy_options_grid', 'pair_count', 'Ccy Pairs', 4, 74, 74),
    ('ccy_options_grid', 'actions', 'Actions', 5, 80, 80),
    ('ccy_pair_options_grid', 'base_ccy', 'Base Ccy', 0, 85, 85),
    ('ccy_pair_options_grid', 'quote_ccy', 'Quote Ccy', 1, 85, 85),
    ('ccy_pair_options_grid', 'currency_pair', 'Ccy Pair', 2, 94, 94),
    ('ccy_pair_options_grid', 'default_quote_decimals', 'Default Quote Decimals', 3, 83, 83),
    ('ccy_pair_options_grid', 'pricing_rules_count', 'Pricing Rules Count', 4, 65, 65),
    ('ccy_pair_options_grid', 'actions', 'Actions', 5, 80, 80),
    ('fx_position_grid', 'trade_id', 'ID', 0, 48, 48),
    ('fx_position_grid', 'trade', 'Trade', 1, 280, 280),
    ('fx_position_grid', 'trade_date', 'Trade Date', 2, 100, 100),
    ('fx_position_grid', 'base_ccy_value_date', 'Base Ccy Value Date', 3, 145, 145),
    ('fx_position_grid', 'sell_base_ccy_amount', 'SELL Base Ccy Amount', 4, 145, 145),
    ('fx_position_grid', 'sell_trade_rate', 'SELL Trade Rate', 5, 90, 90),
    ('fx_position_grid', 'sell_transfer_rate', 'SELL Transfer Rate', 6, 95, 95),
    ('fx_position_grid', 'market_bid', 'Market Bid', 7, 75, 75),
    ('fx_position_grid', 'market_offer', 'Market Offer', 8, 75, 75),
    ('fx_position_grid', 'buy_transfer_rate', 'BUY Transfer Rate', 9, 95, 95),
    ('fx_position_grid', 'buy_trade_rate', 'BUY Trade Rate', 10, 90, 90),
    ('fx_position_grid', 'buy_base_ccy_amount', 'BUY Base Ccy Amount', 11, 167, 167),
    ('client_fx_deals_grid', 'trade_id', 'Trade ID', 0, 96, 96),
    ('client_fx_deals_grid', 'execution_timestamp', 'Execution Timestamp', 1, 170, 170),
    ('client_fx_deals_grid', 'received_timestamp', 'Received Timestamp', 2, 170, 170),
    ('client_fx_deals_grid', 'client_code_type', 'Business ID Type', 3, 150, 150),
    ('client_fx_deals_grid', 'client_code', 'Business ID', 4, 170, 170),
    ('client_fx_deals_grid', 'client_name', 'Client Name', 5, 141, 141),
    ('client_fx_deals_grid', 'trade_date', 'Trade Date', 6, 109, 109),
    ('client_fx_deals_grid', 'currency_pair', 'Ccy Pair', 7, 94, 94),
    ('client_fx_deals_grid', 'side', 'Side', 8, 84, 84),
    ('client_fx_deals_grid', 'base_ccy_amount', 'Base Ccy Amount', 9, 146, 146),
    ('client_fx_deals_grid', 'quote_ccy_amount', 'Quote Ccy Amount', 10, 155, 155),
    ('client_fx_deals_grid', 'trade_rate', 'Trade Rate', 11, 108, 108),
    ('client_fx_deals_grid', 'tenor', 'Tenor', 12, 73, 73),
    ('client_fx_deals_grid', 'base_ccy_value_date', 'Base Ccy Value Date', 13, 160, 160),
    ('client_fx_deals_grid', 'quote_ccy_value_date', 'Quote Ccy Value Date', 14, 168, 168),
    ('client_fx_deals_grid', 'execution_context_label', 'Execution Context', 15, 435, 435),
    ('client_fx_deals_grid', 'pricing_rule_margin', 'Margin', 16, 102, 102),
    ('client_fx_deals_grid', 'initial_fx_position_mode', 'Initial FX Position Mode', 17, 232, 232),
    ('client_fx_deals_grid', 'current_fx_position_mode', 'Current FX Position Mode', 18, 232, 232),
    ('client_fx_deals_grid', 'transfer_rate', 'Transfer Rate', 19, 122, 122),
    ('client_fx_deals_grid', 'analytical_pnl', 'Analytical PnL', 20, 126, 126),
    ('hedge_fx_deals_grid', 'trade_id', 'Trade ID', 0, 96, 96),
    ('hedge_fx_deals_grid', 'request_timestamp', 'Request Timestamp', 1, 170, 170),
    ('hedge_fx_deals_grid', 'execution_timestamp', 'Execution Timestamp', 2, 170, 170),
    ('hedge_fx_deals_grid', 'received_timestamp', 'Received Timestamp', 3, 170, 170),
    ('hedge_fx_deals_grid', 'counterparty_code_type', 'Business ID Type', 4, 150, 150),
    ('hedge_fx_deals_grid', 'counterparty_code', 'Business ID', 5, 170, 170),
    ('hedge_fx_deals_grid', 'counterparty_name', 'Counterparty Name', 6, 158, 158),
    ('hedge_fx_deals_grid', 'trade_date', 'Trade Date', 7, 109, 109),
    ('hedge_fx_deals_grid', 'currency_pair', 'Ccy Pair', 8, 94, 94),
    ('hedge_fx_deals_grid', 'side', 'Hedge Side', 9, 88, 88),
    ('hedge_fx_deals_grid', 'base_ccy_amount', 'Base Ccy Amount', 10, 146, 146),
    ('hedge_fx_deals_grid', 'quote_ccy_amount', 'Quote Ccy Amount', 11, 155, 155),
    ('hedge_fx_deals_grid', 'trade_rate', 'Trade Rate', 12, 108, 108),
    ('hedge_fx_deals_grid', 'tenor', 'Tenor', 13, 73, 73),
    ('hedge_fx_deals_grid', 'base_ccy_value_date', 'Base Ccy Value Date', 14, 160, 160),
    ('hedge_fx_deals_grid', 'quote_ccy_value_date', 'Quote Ccy Value Date', 15, 168, 168),
    ('hedge_fx_deals_grid', 'execution_context_label', 'Execution Context', 16, 435, 435),
    ('hedge_fx_deals_grid', 'pricing_rule_margin', 'Margin', 17, 102, 102),
    ('hedge_fx_deals_grid', 'initial_fx_position_mode', 'Initial FX Position Mode', 18, 232, 232),
    ('hedge_fx_deals_grid', 'current_fx_position_mode', 'Current FX Position Mode', 19, 232, 232),
    ('hedge_fx_deals_grid', 'transfer_rate', 'Transfer Rate', 20, 122, 122),
    ('hedge_fx_deals_grid', 'analytical_pnl', 'Analytical PnL', 21, 126, 126),
    ('analytical_pnl_report_grid', 'trade_id', 'Trade ID', 0, 96, 96),
    ('analytical_pnl_report_grid', 'trade_type', 'Trade Type', 1, 122, 122),
    ('analytical_pnl_report_grid', 'trade_date', 'Trade Date', 2, 109, 109),
    ('analytical_pnl_report_grid', 'identifier', 'Identifier', 3, 210, 210),
    ('analytical_pnl_report_grid', 'counterparty_name', 'Counterparty Name', 4, 180, 180),
    ('analytical_pnl_report_grid', 'currency_pair', 'Ccy Pair', 5, 94, 94),
    ('analytical_pnl_report_grid', 'side', 'Side', 6, 90, 90),
    ('analytical_pnl_report_grid', 'base_ccy_amount', 'Base Ccy Amount', 7, 146, 146),
    ('analytical_pnl_report_grid', 'quote_ccy_amount', 'Quote Ccy Amount', 8, 155, 155),
    ('analytical_pnl_report_grid', 'trade_rate', 'Trade Rate', 9, 108, 108),
    ('analytical_pnl_report_grid', 'transfer_rate', 'Transfer Rate', 10, 122, 122),
    ('analytical_pnl_report_grid', 'analytical_pnl', 'Analytical PnL', 11, 145, 145),
    ('analytical_pnl_summary_grid', 'currency', 'Currency', 0, 100, 100),
    ('analytical_pnl_summary_grid', 'amount', 'Amount', 1, 150, 150),
    ('analytical_pnl_summary_grid', 'weighted_average_margin', 'Weighted Average Margin', 2, 190, 190),
    ('batching_history_grid', 'batch_id', 'Batch ID', 0, 96, 96),
    ('batching_history_grid', 'ccy_pair_code', 'Ccy Pair Code', 1, 100, 100),
    ('batching_history_grid', 'batch_status', 'Batch Status', 2, 101, 101),
    ('batching_history_grid', 'formation_reason_code', 'Formation Reason', 3, 252, 252),
    ('batching_history_grid', 'formed_at', 'Formed At', 4, 157, 157),
    ('batching_history_grid', 'actions', 'Actions', 5, 80, 80),
    ('batch_formation_audit_grid', 'batch_id', 'Batch ID', 0, 96, 96),
    ('batch_formation_audit_grid', 'batching_key', 'Batching Key', 1, 450, 450),
    ('batch_formation_audit_grid', 'window_opened_at', 'Window Opened At', 2, 157, 157),
    ('batch_formation_audit_grid', 'window_closed_at', 'Window Closed At', 3, 157, 157),
    ('batch_formation_audit_grid', 'formed_at', 'Batch Formed At', 4, 157, 157),
    ('batch_formation_audit_grid', 'window_duration_ms', 'Duration', 5, 105, 105),
    ('batch_formation_audit_grid', 'formation_reason_code', 'Formation Reason', 6, 252, 252),
    ('batch_formation_audit_grid', 'source_trade_count', 'Source Trades', 7, 108, 108),
    ('batch_formation_audit_grid', 'batch_status', 'Status', 8, 101, 101),
    ('batch_formation_audit_grid', 'actions', 'Actions', 9, 80, 80),
    ('batch_members_grid', 'trade_id', 'Trade ID', 0, 96, 96),
    ('batch_members_grid', 'trade_type', 'Trade Type', 1, 281, 281),
    ('batch_members_grid', 'member_role', 'Member Role', 2, 124, 124),
    ('batch_members_grid', 'base_balance_contribution_minor', 'Base Ccy Leg', 3, 125, 125),
    ('batch_members_grid', 'quote_balance_contribution_minor', 'Quote Ccy Leg', 4, 130, 130),
    ('batch_members_grid', 'transfer_rate', 'Transfer Rate', 5, 122, 122),
    ('batch_members_grid', 'analytical_pnl_quote_minor', 'Analytical PnL', 6, 127, 127),
    ('batch_members_grid', 'base_ccy_value_date', 'Base Ccy Value Date', 7, 135, 135),
    ('batch_members_grid', 'quote_ccy_value_date', 'Quote Ccy Value Date', 8, 143, 143),
    ('batch_cash_output_grid', 'currency_code', 'Currency', 0, 85, 85),
    ('batch_cash_output_grid', 'balance_contribution_minor', 'Cash Leg', 1, 119, 119),
    ('batch_cash_output_grid', 'value_date', 'Value Date', 2, 105, 105),
    ('batch_position_output_grid', 'trade_id', 'Trade ID', 0, 93, 93),
    ('batch_position_output_grid', 'trade_type', 'Trade Type', 1, 281, 281),
    ('batch_position_output_grid', 'output_role', 'Output Role', 2, 101, 101),
    ('batch_position_output_grid', 'base_balance_contribution_minor', 'Base Ccy Leg', 3, 121, 121),
    ('batch_position_output_grid', 'quote_balance_contribution_minor', 'Quote Ccy Leg', 4, 126, 126),
    ('batch_position_output_grid', 'transfer_rate', 'Transfer Rate', 5, 97, 97),
    ('batch_position_output_grid', 'analytical_pnl_quote_minor', 'Analytical PnL', 6, 119, 119),
    ('batch_position_output_grid', 'base_ccy_value_date', 'Base Ccy Value Date', 7, 135, 135),
    ('batch_position_output_grid', 'quote_ccy_value_date', 'Quote Ccy Value Date', 8, 143, 143),
    ('external_counterparties_grid', 'id', 'ID', 0, 70, 70),
    ('external_counterparties_grid', 'counterparty_type', 'Counterparty Type', 1, 176, 176),
    ('external_counterparties_grid', 'business_id_type', 'Business ID Type', 2, 150, 150),
    ('external_counterparties_grid', 'business_id', 'Business ID', 3, 170, 170),
    ('external_counterparties_grid', 'counterparty_name', 'Counterparty Name', 4, 180, 180),
    ('external_counterparties_grid', 'role', 'Role', 5, 174, 174),
    ('external_counterparties_grid', 'active', 'Active', 6, 100, 100),
    ('external_counterparties_grid', 'actions', 'Actions', 7, 90, 90),
    ('internal_units_grid', 'id', 'ID', 0, 70, 70),
    ('internal_units_grid', 'unit_type', 'Unit Type', 1, 130, 130),
    ('internal_units_grid', 'business_id_type', 'Business ID Type', 2, 178, 178),
    ('internal_units_grid', 'business_id', 'Business ID', 3, 170, 170),
    ('internal_units_grid', 'unit_name', 'Unit Name', 4, 180, 180),
    ('internal_units_grid', 'role', 'Role', 5, 174, 174),
    ('internal_units_grid', 'active', 'Active', 6, 100, 100),
    ('internal_units_grid', 'actions', 'Actions', 7, 90, 90),
    ('users_grid', 'id', 'ID', 0, 64, 64),
    ('users_grid', 'user_code', 'User Code', 1, 107, 107),
    ('users_grid', 'first_name', 'First Name', 2, 140, 140),
    ('users_grid', 'last_name', 'Last Name', 3, 140, 140),
    ('users_grid', 'role', 'Role', 4, 100, 100),
    ('users_grid', 'active', 'Active', 5, 100, 100),
    ('users_grid', 'actions', 'Actions', 6, 80, 80),
    ('execution_contexts_grid', 'id', 'ID', 0, 64, 64),
    ('execution_contexts_grid', 'servicing_location', 'Servicing Location', 1, 153, 153),
    ('execution_contexts_grid', 'accounting_system', 'Accounting System', 2, 152, 152),
    ('execution_contexts_grid', 'execution_system', 'Execution System', 3, 149, 149),
    ('execution_contexts_grid', 'default_position_management_mode', 'Default FX Position Mode', 4, 176, 176),
    ('execution_contexts_grid', 'counterparties_count', 'Trading Counterparties Count', 5, 64, 64),
    ('execution_contexts_grid', 'actions', 'Actions', 6, 80, 80),
    ('servicing_locations_grid', 'id', 'ID', 0, 64, 64),
    ('servicing_locations_grid', 'name', 'Name', 1, 153, 153),
    ('servicing_locations_grid', 'region', 'Region', 2, 134, 134),
    ('servicing_locations_grid', 'type', 'Type', 3, 100, 100),
    ('servicing_locations_grid', 'active', 'Active', 4, 72, 72),
    ('servicing_locations_grid', 'execution_context_count', 'Exec. Context Count', 5, 64, 64),
    ('servicing_locations_grid', 'actions', 'Actions', 6, 80, 80),
    ('accounting_systems_grid', 'id', 'ID', 0, 64, 64),
    ('accounting_systems_grid', 'name', 'Name', 1, 152, 152),
    ('accounting_systems_grid', 'active', 'Active', 2, 72, 72),
    ('accounting_systems_grid', 'execution_context_count', 'Exec. Context Count', 3, 64, 64),
    ('accounting_systems_grid', 'actions', 'Actions', 4, 80, 80),
    ('execution_systems_grid', 'id', 'ID', 0, 183, 183),
    ('execution_systems_grid', 'name', 'Name', 1, 149, 149),
    ('execution_systems_grid', 'pricing_mode', 'Pricing Mode', 2, 156, 156),
    ('execution_systems_grid', 'active', 'Active', 3, 72, 72),
    ('execution_systems_grid', 'execution_context_count', 'Exec. Context Count', 4, 64, 64),
    ('execution_systems_grid', 'actions', 'Actions', 5, 80, 80),
    ('hedge_quick_mode_settings_grid', 'currency_pair', 'Ccy Pair', 0, 89, 89),
    ('hedge_quick_mode_settings_grid', 'counterparty_name', 'Hedge Counterparty', 1, 141, 141),
    ('hedge_quick_mode_settings_grid', 'context_path', 'Execution Context', 2, 469, 469),
    ('hedge_quick_mode_settings_grid', 'presets_summary', 'Quick Amounts', 3, 221, 221),
    ('hedge_quick_mode_settings_grid', 'default_tenor', 'Tenor', 4, 73, 73),
    ('hedge_quick_mode_settings_grid', 'state', 'Status', 5, 73, 73),
    ('hedge_quick_mode_settings_grid', 'actions', 'Actions', 6, 72, 72),
    ('deal_generation_settings_grid', 'pricing_rule', 'Pricing Rule', 0, 96, 96),
    ('deal_generation_settings_grid', 'client', 'Client', 1, 180, 180),
    ('deal_generation_settings_grid', 'currency_pair', 'Ccy Pair', 2, 94, 94),
    ('deal_generation_settings_grid', 'pricing_mode', 'Pricing Mode', 3, 156, 156),
    ('deal_generation_settings_grid', 'min_base_ccy_amount', 'Min Base Ccy Amount', 4, 150, 150),
    ('deal_generation_settings_grid', 'max_base_ccy_amount', 'Max Base Ccy Amount', 5, 150, 150),
    ('deal_generation_settings_grid', 'amount_step', 'Amount Step', 6, 130, 130),
    ('deal_generation_settings_grid', 'buy_probability', 'BUY %', 7, 80, 80),
    ('deal_generation_settings_grid', 'sell_probability', 'SELL %', 8, 80, 80),
    ('deal_generation_settings_grid', 'active', 'Active', 9, 72, 72),
    ('deal_generation_settings_grid', 'actions', 'Actions', 10, 80, 80);

WITH counterparty_execution_context_seed
    (counterparty_code, servicing_location_id, accounting_system_id, execution_system_id)
AS
(
    VALUES
        ('7701234567', '002', 'AFINA', 'CLICK_TRADE_EFX'),
        ('7701234567', '002', 'AFINA', 'RFQ'),
        ('7701234567', '002', 'CTF3', 'MANUAL_CLIENT_DEAL_ENTRY'),
        ('7812345678', '1234', 'AFINA', 'RFQ'),
        ('5409876543', '001', 'CTF3', 'CLICK_TRADE_EFX'),
        ('7707000001', '002', 'CTF3', 'MANUAL_CLIENT_DEAL_ENTRY'),
        ('7707000001', '002', 'AFINA', 'CLICK_TRADE_EFX')
)
INSERT INTO trading_counterparty_execution_contexts
    (counterparty_id, execution_context_id)
SELECT
    counterparty.counterparty_id,
    context.execution_context_id
FROM counterparty_execution_context_seed seed
INNER JOIN external_counterparties external
    ON external.counterparty_code_type = 'INN'
    AND external.counterparty_code = seed.counterparty_code
INNER JOIN trading_counterparties counterparty
    ON counterparty.counterparty_id = external.counterparty_id
INNER JOIN execution_contexts context
    ON context.servicing_location_id = seed.servicing_location_id
    AND context.accounting_system_id = seed.accounting_system_id
    AND context.execution_system_id = seed.execution_system_id;

WITH pricing_rule_seed
    (
        counterparty_code,
        servicing_location_id,
        accounting_system_id,
        execution_system_id,
        ccy_pair_code,
        margin_percent,
        position_management_mode_override
    )
AS
(
    VALUES
        ('7701234567', '002', 'AFINA', 'CLICK_TRADE_EFX', 'EUR_USD', 0.10, NULL),
        ('7701234567', '002', 'AFINA', 'RFQ', 'EUR_USD', 0.12, NULL),
        ('7701234567', '002', 'CTF3', 'MANUAL_CLIENT_DEAL_ENTRY', 'EUR_USD', 0.08, NULL),
        ('7812345678', '1234', 'AFINA', 'RFQ', 'EUR_USD', 0.05, NULL),
        ('5409876543', '001', 'CTF3', 'CLICK_TRADE_EFX', 'EUR_USD', 0.20, NULL),
        ('7707000001', '002', 'CTF3', 'MANUAL_CLIENT_DEAL_ENTRY', 'EUR_USD', 0.03, NULL),
        ('7707000001', '002', 'AFINA', 'CLICK_TRADE_EFX', 'EUR_USD', 0.03, NULL)
)
INSERT INTO pricing_rules
    (
        counterparty_id,
        execution_context_id,
        ccy_pair_code,
        margin_percent,
        position_management_mode_override
    )
SELECT
    p.counterparty_id,
    e.execution_context_id,
    seed.ccy_pair_code,
    seed.margin_percent,
    seed.position_management_mode_override
FROM pricing_rule_seed seed
INNER JOIN external_counterparties external
    ON external.counterparty_code_type = 'INN'
    AND external.counterparty_code = seed.counterparty_code
INNER JOIN trading_counterparties p ON p.counterparty_id = external.counterparty_id
INNER JOIN execution_contexts e
    ON e.servicing_location_id = seed.servicing_location_id
    AND e.accounting_system_id = seed.accounting_system_id
    AND e.execution_system_id = seed.execution_system_id;

WITH eligible_rule AS
(
    SELECT
        MIN(r.pricing_rule_id) AS pricing_rule_id,
        MIN(r.counterparty_id) AS counterparty_id,
        base_ccy.fraction_digits AS base_ccy_fraction_digits
    FROM pricing_rules r
    INNER JOIN trading_counterparties p ON p.counterparty_id = r.counterparty_id
    INNER JOIN trading_counterparty_roles role
        ON role.counterparty_id = p.counterparty_id AND role.role_code = 'HEDGE_COUNTERPARTY'
    INNER JOIN execution_contexts c
        ON c.execution_context_id = r.execution_context_id
    INNER JOIN execution_systems e
        ON e.execution_system_id = c.execution_system_id
    INNER JOIN ccy_pair_options pair
        ON pair.ccy_pair_code = r.ccy_pair_code
    INNER JOIN ccy_options base_ccy
        ON base_ccy.ccy_code = pair.base_ccy_code
    WHERE r.ccy_pair_code = 'EUR_USD'
      AND p.is_active = 1
      AND e.pricing_mode = 'AUTO_PRICED'
      AND e.is_active = 1
    GROUP BY base_ccy.fraction_digits
    HAVING COUNT(*) = 1
)
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
        is_active,
        default_tenor
    )
SELECT
    'EUR_USD',
    counterparty_id,
    pricing_rule_id,
    base_ccy_fraction_digits,
    500000000,
    2000000000,
    5000000000,
    10000000000,
    1,
    'TOD'
FROM eligible_rule
WHERE base_ccy_fraction_digits = 2;

INSERT OR IGNORE INTO client_deal_generation_process_settings
    (
        settings_id,
        min_interval_seconds,
        max_interval_seconds,
        min_deals_per_cycle,
        max_deals_per_cycle
    )
VALUES (1, 1, 3, 3, 7);

INSERT OR IGNORE INTO fx_batching_settings
    (
        settings_id,
        allow_cross_tenor_batching
    )
VALUES (1, 0);

INSERT OR IGNORE INTO fx_auto_batching_settings
    (
        settings_id,
        max_interval_seconds,
        default_transfer_rate_spread_percent,
        tenor_compatibility_mode
    )
VALUES (1, 60, '0.05', 'SAME_TENOR_ONLY');

INSERT OR IGNORE INTO fx_auto_batching_ccy_pairs
    (settings_id, ccy_pair_code)
VALUES
    (1, 'EUR_USD'),
    (1, 'GBP_USD');

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
SELECT
    r.pricing_rule_id,
    500000 * CASE base_ccy.fraction_digits
        WHEN 0 THEN 1
        WHEN 1 THEN 10
        WHEN 2 THEN 100
        WHEN 3 THEN 1000
        WHEN 4 THEN 10000
        WHEN 5 THEN 100000
        WHEN 6 THEN 1000000
        WHEN 7 THEN 10000000
        WHEN 8 THEN 100000000
        WHEN 9 THEN 1000000000
        WHEN 10 THEN 10000000000
    END,
    1500000 * CASE base_ccy.fraction_digits
        WHEN 0 THEN 1
        WHEN 1 THEN 10
        WHEN 2 THEN 100
        WHEN 3 THEN 1000
        WHEN 4 THEN 10000
        WHEN 5 THEN 100000
        WHEN 6 THEN 1000000
        WHEN 7 THEN 10000000
        WHEN 8 THEN 100000000
        WHEN 9 THEN 1000000000
        WHEN 10 THEN 10000000000
    END,
    100000 * CASE base_ccy.fraction_digits
        WHEN 0 THEN 1
        WHEN 1 THEN 10
        WHEN 2 THEN 100
        WHEN 3 THEN 1000
        WHEN 4 THEN 10000
        WHEN 5 THEN 100000
        WHEN 6 THEN 1000000
        WHEN 7 THEN 10000000
        WHEN 8 THEN 100000000
        WHEN 9 THEN 1000000000
        WHEN 10 THEN 10000000000
    END,
    base_ccy.fraction_digits,
    50,
    1
FROM pricing_rules r
INNER JOIN trading_counterparties p ON p.counterparty_id = r.counterparty_id
INNER JOIN trading_counterparty_roles role
    ON role.counterparty_id = p.counterparty_id AND role.role_code = 'CLIENT'
INNER JOIN execution_contexts c ON c.execution_context_id = r.execution_context_id
INNER JOIN execution_systems e ON e.execution_system_id = c.execution_system_id
INNER JOIN ccy_pair_options pair ON pair.ccy_pair_code = r.ccy_pair_code
INNER JOIN ccy_options base_ccy ON base_ccy.ccy_code = pair.base_ccy_code
WHERE e.pricing_mode = 'AUTO_PRICED';

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
    );

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
SELECT
    last_insert_rowid(),
    'CLIENT_DEAL',
    r.counterparty_id,
    r.execution_context_id,
    r.pricing_rule_id,
    1.1222,
    2700000,
    2
FROM pricing_rules r
INNER JOIN trading_counterparties p ON p.counterparty_id = r.counterparty_id
INNER JOIN external_counterparties external ON external.counterparty_id = p.counterparty_id
INNER JOIN execution_contexts e ON e.execution_context_id = r.execution_context_id
WHERE external.counterparty_code_type = 'INN'
  AND external.counterparty_code = '7701234567'
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
        '2026-07-15T09:31:00.000Z',
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
        request_timestamp,
        counterparty_id,
        execution_context_id,
        pricing_rule_id,
        transfer_rate,
        analytical_pnl_quote_minor,
        analytical_pnl_quote_fraction_digits
    )
SELECT
    last_insert_rowid(),
    'HEDGE_DEAL',
    '2026-07-15T09:31:00.000Z',
    r.counterparty_id,
    r.execution_context_id,
    r.pricing_rule_id,
    1.1222,
    0,
    2
FROM pricing_rules r
INNER JOIN trading_counterparties p ON p.counterparty_id = r.counterparty_id
INNER JOIN external_counterparties external ON external.counterparty_id = p.counterparty_id
INNER JOIN execution_contexts e ON e.execution_context_id = r.execution_context_id
WHERE external.counterparty_code_type = 'INN'
  AND external.counterparty_code = '7707000001'
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
