PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS ccy_options
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
            length(name) BETWEEN 1 AND 20
            AND name = trim(name)
            AND name NOT GLOB '*[^A-Za-z ]*'
            AND name NOT GLOB '*  *'
            AND
            length(country) BETWEEN 1 AND 30
            AND country = trim(country)
            AND country NOT GLOB '*[^A-Za-z ]*'
            AND country NOT GLOB '*  *'
        ),
    CONSTRAINT chk_ccy_options_fraction_digits
        CHECK (fraction_digits BETWEEN 0 AND 10)
);

CREATE TABLE IF NOT EXISTS ccy_pair_options
(
    ccy_pair_code         TEXT    PRIMARY KEY,
    base_ccy_code         TEXT    NOT NULL,
    quote_ccy_code        TEXT    NOT NULL,
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

CREATE TABLE IF NOT EXISTS market_quote_simulation_settings
(
    ccy_pair_code            TEXT    PRIMARY KEY,
    bid_min                  REAL    NOT NULL,
    spread                   REAL    NOT NULL,
    bid_max                  REAL    NOT NULL,
    one_way_duration_seconds INTEGER NOT NULL DEFAULT 60,
    fluctuation_spreads      REAL    NOT NULL DEFAULT 3,

    CONSTRAINT fk_market_quote_simulation_settings_pair
        FOREIGN KEY (ccy_pair_code)
            REFERENCES ccy_pair_options (ccy_pair_code)
            ON UPDATE RESTRICT
            ON DELETE CASCADE,
    CONSTRAINT chk_market_quote_simulation_settings_values
        CHECK (
            bid_min > 0
            AND spread > 0
            AND bid_max > bid_min
        ),
    CONSTRAINT chk_market_quote_simulation_settings_duration
        CHECK (
            typeof(one_way_duration_seconds) = 'integer'
            AND one_way_duration_seconds BETWEEN 5 AND 3600
        ),
    CONSTRAINT chk_market_quote_simulation_settings_fluctuation
        CHECK (
            typeof(fluctuation_spreads) IN ('integer', 'real')
            AND fluctuation_spreads BETWEEN 0 AND 10
        )
);

CREATE TABLE IF NOT EXISTS servicing_locations
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

CREATE TABLE IF NOT EXISTS accounting_systems
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

CREATE TABLE IF NOT EXISTS execution_systems
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

CREATE TABLE IF NOT EXISTS execution_contexts
(
    execution_context_id             INTEGER PRIMARY KEY,
    servicing_location_id            TEXT NOT NULL,
    accounting_system_id             TEXT,
    execution_system_id              TEXT NOT NULL,
    default_position_management_mode TEXT NOT NULL DEFAULT 'MANUAL',

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
            ON DELETE RESTRICT,
    CONSTRAINT chk_execution_contexts_default_position_management_mode
        CHECK (default_position_management_mode IN ('MANUAL', 'AUTO'))
);

CREATE TABLE IF NOT EXISTS trading_counterparties
(
    counterparty_id   INTEGER PRIMARY KEY,
    counterparty_name TEXT    NOT NULL,
    is_active  INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT chk_trading_counterparties_name
        CHECK (length(counterparty_name) BETWEEN 1 AND 200 AND length(trim(counterparty_name)) > 0),
    CONSTRAINT chk_trading_counterparties_active
        CHECK (is_active IN (0, 1))
);

CREATE TABLE IF NOT EXISTS trading_counterparty_execution_contexts
(
    counterparty_id      INTEGER NOT NULL,
    execution_context_id INTEGER NOT NULL,

    CONSTRAINT pk_trading_counterparty_execution_contexts
        PRIMARY KEY (counterparty_id, execution_context_id),
    CONSTRAINT fk_trading_counterparty_execution_contexts_counterparty
        FOREIGN KEY (counterparty_id)
            REFERENCES trading_counterparties (counterparty_id)
            ON UPDATE RESTRICT
            ON DELETE CASCADE,
    CONSTRAINT fk_trading_counterparty_execution_contexts_execution_context
        FOREIGN KEY (execution_context_id)
            REFERENCES execution_contexts (execution_context_id)
            ON UPDATE RESTRICT
            ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS external_counterparties
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
            length(counterparty_code) <= 20
            AND (
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

CREATE TABLE IF NOT EXISTS internal_units
(
    counterparty_id  INTEGER PRIMARY KEY,
    unit_code TEXT NOT NULL,
    unit_type TEXT NOT NULL DEFAULT 'DESK',

    CONSTRAINT fk_internal_units_counterparty
        FOREIGN KEY (counterparty_id)
            REFERENCES trading_counterparties (counterparty_id)
            ON UPDATE RESTRICT
            ON DELETE CASCADE,
    CONSTRAINT uq_internal_units_code
        UNIQUE (unit_code),
    CONSTRAINT chk_internal_units_code
        CHECK (
            length(unit_code) BETWEEN 2 AND 20
            AND unit_code = upper(unit_code)
            AND unit_code NOT GLOB '*[^A-Z0-9_-]*'
        ),
    CONSTRAINT chk_internal_units_type
        CHECK (unit_type IN ('DESK', 'DEPARTMENT', 'OTHER'))
);

CREATE TABLE IF NOT EXISTS trading_counterparty_roles
(
    counterparty_id INTEGER NOT NULL,
    role_code TEXT    NOT NULL,

    CONSTRAINT pk_trading_counterparty_roles
        PRIMARY KEY (counterparty_id, role_code),
    CONSTRAINT fk_trading_counterparty_roles_counterparty
        FOREIGN KEY (counterparty_id)
            REFERENCES trading_counterparties (counterparty_id)
            ON UPDATE RESTRICT
            ON DELETE CASCADE,
    CONSTRAINT chk_trading_counterparty_roles_code
        CHECK (role_code IN ('CLIENT', 'HEDGE_COUNTERPARTY'))
);

CREATE INDEX IF NOT EXISTS idx_trading_counterparty_roles_role
    ON trading_counterparty_roles (role_code, counterparty_id);

CREATE TRIGGER IF NOT EXISTS trg_external_counterparties_exclusive_profile_insert
BEFORE INSERT ON external_counterparties
FOR EACH ROW
WHEN EXISTS (SELECT 1 FROM internal_units WHERE counterparty_id = NEW.counterparty_id)
BEGIN
    SELECT RAISE(ABORT, 'a Trading Counterparty cannot have both external and internal profiles');
END;

CREATE TRIGGER IF NOT EXISTS trg_internal_units_exclusive_profile_insert
BEFORE INSERT ON internal_units
FOR EACH ROW
WHEN EXISTS (SELECT 1 FROM external_counterparties WHERE counterparty_id = NEW.counterparty_id)
BEGIN
    SELECT RAISE(ABORT, 'a Trading Counterparty cannot have both external and internal profiles');
END;

CREATE TABLE IF NOT EXISTS users
(
    user_id    INTEGER PRIMARY KEY,
    user_code  TEXT    NOT NULL COLLATE NOCASE,
    first_name TEXT    NOT NULL,
    last_name  TEXT    NOT NULL,
    user_role  TEXT    NOT NULL,
    is_active  INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT uq_users_code
        UNIQUE (user_code),
    CONSTRAINT chk_users_code
        CHECK (
            length(user_code) BETWEEN 2 AND 30
            AND user_code = upper(user_code)
            AND user_code NOT GLOB '*[^A-Z0-9._-]*'
        ),
    CONSTRAINT chk_users_first_name
        CHECK (length(trim(first_name)) BETWEEN 1 AND 50),
    CONSTRAINT chk_users_last_name
        CHECK (length(trim(last_name)) BETWEEN 1 AND 50),
    CONSTRAINT chk_users_role
        CHECK (user_role IN ('DEALER', 'SUPERVISOR', 'ADMIN')),
    CONSTRAINT chk_users_active
        CHECK (is_active IN (0, 1))
);

CREATE TABLE IF NOT EXISTS ui_table_column_settings
(
    table_key        TEXT    NOT NULL,
    column_key       TEXT    NOT NULL,
    column_label     TEXT    NOT NULL,
    display_order    INTEGER NOT NULL,
    default_width_px INTEGER NOT NULL,
    width_px         INTEGER NOT NULL,
    updated_at       TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),

    CONSTRAINT pk_ui_table_column_settings
        PRIMARY KEY (table_key, column_key),
    CONSTRAINT uq_ui_table_column_settings_order
        UNIQUE (table_key, display_order),
    CONSTRAINT chk_ui_table_column_settings_table_key
        CHECK (
            length(table_key) BETWEEN 1 AND 64
            AND table_key = lower(table_key)
            AND table_key NOT GLOB '*[^a-z0-9_]*'
        ),
    CONSTRAINT chk_ui_table_column_settings_column_key
        CHECK (
            length(column_key) BETWEEN 1 AND 64
            AND column_key = lower(column_key)
            AND column_key NOT GLOB '*[^a-z0-9_]*'
        ),
    CONSTRAINT chk_ui_table_column_settings_label
        CHECK (length(trim(column_label)) BETWEEN 1 AND 100),
    CONSTRAINT chk_ui_table_column_settings_order
        CHECK (display_order BETWEEN 0 AND 999),
    CONSTRAINT chk_ui_table_column_settings_widths
        CHECK (
            default_width_px BETWEEN 48 AND 1600
            AND width_px BETWEEN 48 AND 1600
        )
);

CREATE TABLE IF NOT EXISTS ui_color_tokens
(
    token_code     TEXT    PRIMARY KEY,
    palette_family TEXT    NOT NULL,
    shade          INTEGER NOT NULL,
    color_value    TEXT    NOT NULL,
    display_order  INTEGER NOT NULL UNIQUE,
    updated_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),

    CONSTRAINT uq_ui_color_tokens_family_shade
        UNIQUE (palette_family, shade),
    CONSTRAINT chk_ui_color_tokens_code
        CHECK (
            length(token_code) BETWEEN 1 AND 50
            AND token_code = lower(token_code)
            AND token_code NOT GLOB '*[^a-z0-9_]*'
        ),
    CONSTRAINT chk_ui_color_tokens_family
        CHECK (
            palette_family IN
            (
                'BLUE',
                'INDIGO',
                'PURPLE',
                'PINK',
                'RED',
                'ORANGE',
                'YELLOW',
                'GREEN',
                'TEAL',
                'CYAN',
                'GRAY'
            )
        ),
    CONSTRAINT chk_ui_color_tokens_shade
        CHECK (shade IN (100, 200, 300, 400, 500, 600, 700, 800, 900)),
    CONSTRAINT chk_ui_color_tokens_value
        CHECK (
            length(color_value) = 7
            AND color_value GLOB '#[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]'
        ),
    CONSTRAINT chk_ui_color_tokens_order
        CHECK (display_order BETWEEN 0 AND 9999)
);

CREATE TABLE IF NOT EXISTS pricing_rules
(
    pricing_rule_id                  INTEGER PRIMARY KEY,
    counterparty_id                  INTEGER NOT NULL,
    execution_context_id             INTEGER NOT NULL,
    ccy_pair_code                    TEXT    NOT NULL,
    margin_percent                   REAL    NOT NULL,
    position_management_mode_override TEXT,

    CONSTRAINT fk_pricing_rules_counterparty
        FOREIGN KEY (counterparty_id)
            REFERENCES trading_counterparties (counterparty_id)
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
        UNIQUE (counterparty_id, execution_context_id, ccy_pair_code),
    CONSTRAINT chk_pricing_rules_margin
        CHECK (margin_percent >= 0 AND margin_percent < 100),
    CONSTRAINT chk_pricing_rules_position_management_mode_override
        CHECK (
            position_management_mode_override IS NULL
            OR position_management_mode_override IN ('MANUAL', 'AUTO')
        )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_pricing_rules_hedge_quick_mode_reference
    ON pricing_rules (pricing_rule_id, ccy_pair_code);

CREATE UNIQUE INDEX IF NOT EXISTS uq_pricing_rules_hedge_quick_mode_counterparty_reference
    ON pricing_rules (pricing_rule_id, counterparty_id, ccy_pair_code);

CREATE TRIGGER IF NOT EXISTS trg_pricing_rules_require_attached_execution_context_insert
BEFORE INSERT ON pricing_rules
FOR EACH ROW
WHEN NOT EXISTS
(
    SELECT 1
    FROM trading_counterparty_execution_contexts assignment
    WHERE assignment.counterparty_id = NEW.counterparty_id
      AND assignment.execution_context_id = NEW.execution_context_id
)
BEGIN
    SELECT RAISE(ABORT, 'Pricing Rule Execution Context must be attached to its Trading Counterparty');
END;

CREATE TRIGGER IF NOT EXISTS trg_pricing_rules_require_attached_execution_context_update
BEFORE UPDATE OF counterparty_id, execution_context_id ON pricing_rules
FOR EACH ROW
WHEN NOT EXISTS
(
    SELECT 1
    FROM trading_counterparty_execution_contexts assignment
    WHERE assignment.counterparty_id = NEW.counterparty_id
      AND assignment.execution_context_id = NEW.execution_context_id
)
BEGIN
    SELECT RAISE(ABORT, 'Pricing Rule Execution Context must be attached to its Trading Counterparty');
END;

CREATE TRIGGER IF NOT EXISTS trg_trading_counterparty_execution_contexts_preserve_pricing_rules_delete
BEFORE DELETE ON trading_counterparty_execution_contexts
FOR EACH ROW
WHEN EXISTS
(
    SELECT 1
    FROM pricing_rules rule
    WHERE rule.counterparty_id = OLD.counterparty_id
      AND rule.execution_context_id = OLD.execution_context_id
)
BEGIN
    SELECT RAISE(ABORT, 'an Execution Context assignment used by Pricing Rules cannot be detached from its Trading Counterparty');
END;

CREATE TRIGGER IF NOT EXISTS trg_trading_counterparty_execution_contexts_immutable_update
BEFORE UPDATE OF counterparty_id, execution_context_id ON trading_counterparty_execution_contexts
FOR EACH ROW
WHEN NEW.counterparty_id <> OLD.counterparty_id
  OR NEW.execution_context_id <> OLD.execution_context_id
BEGIN
    SELECT RAISE(ABORT, 'an Execution Context assignment identity cannot be changed; attach a new Context and detach the old one');
END;

CREATE TABLE IF NOT EXISTS fx_hedge_quick_mode_settings
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

    CONSTRAINT fk_fx_hedge_quick_mode_settings_pair
        FOREIGN KEY (ccy_pair_code)
            REFERENCES ccy_pair_options (ccy_pair_code)
            ON UPDATE RESTRICT
            ON DELETE RESTRICT,
    CONSTRAINT fk_fx_hedge_quick_mode_settings_counterparty
        FOREIGN KEY (counterparty_id)
            REFERENCES trading_counterparties (counterparty_id)
            ON UPDATE RESTRICT
            ON DELETE RESTRICT,
    CONSTRAINT fk_fx_hedge_quick_mode_settings_rule_counterparty_pair
        FOREIGN KEY (pricing_rule_id, counterparty_id, ccy_pair_code)
            REFERENCES pricing_rules (pricing_rule_id, counterparty_id, ccy_pair_code)
            ON UPDATE RESTRICT
            ON DELETE RESTRICT,
    CONSTRAINT chk_fx_hedge_quick_mode_settings_fraction_digits
        CHECK (
            typeof(base_ccy_fraction_digits) = 'integer'
            AND base_ccy_fraction_digits BETWEEN 0 AND 10
        ),
    CONSTRAINT chk_fx_hedge_quick_mode_settings_amounts
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
    CONSTRAINT chk_fx_hedge_quick_mode_settings_active
        CHECK (is_active IN (0, 1)),
    CONSTRAINT chk_fx_hedge_quick_mode_settings_default_tenor
        CHECK (default_tenor IN ('TOD', 'TOM', 'SPOT'))
);

CREATE TABLE IF NOT EXISTS client_deal_generation_process_settings
(
    settings_id             INTEGER PRIMARY KEY,
    min_interval_seconds    INTEGER NOT NULL DEFAULT 1,
    max_interval_seconds    INTEGER NOT NULL DEFAULT 3,
    min_deals_per_cycle     INTEGER NOT NULL DEFAULT 3,
    max_deals_per_cycle     INTEGER NOT NULL DEFAULT 7,

    CONSTRAINT chk_client_deal_generation_process_settings_singleton
        CHECK (settings_id = 1),
    CONSTRAINT chk_client_deal_generation_process_settings_interval
        CHECK (
            typeof(min_interval_seconds) = 'integer'
            AND min_interval_seconds BETWEEN 1 AND 3600
            AND typeof(max_interval_seconds) = 'integer'
            AND max_interval_seconds BETWEEN min_interval_seconds AND 3600
        ),
    CONSTRAINT chk_client_deal_generation_process_settings_cycle_size
        CHECK (
            typeof(min_deals_per_cycle) = 'integer'
            AND min_deals_per_cycle BETWEEN 1 AND 100
            AND typeof(max_deals_per_cycle) = 'integer'
            AND max_deals_per_cycle BETWEEN min_deals_per_cycle AND 100
        )
);

CREATE TABLE IF NOT EXISTS fx_batching_settings
(
    settings_id                    INTEGER PRIMARY KEY,
    allow_cross_tenor_batching     INTEGER NOT NULL DEFAULT 0,
    updated_at                     TEXT    NOT NULL
        DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),

    CONSTRAINT chk_fx_batching_settings_singleton
        CHECK (settings_id = 1),
    CONSTRAINT chk_fx_batching_settings_cross_tenor
        CHECK (
            typeof(allow_cross_tenor_batching) = 'integer'
            AND allow_cross_tenor_batching = 0
        ),
    CONSTRAINT chk_fx_batching_settings_updated_at
        CHECK (
            length(updated_at) = 24
            AND updated_at GLOB '????-??-??T??:??:??.???Z'
            AND strftime('%Y-%m-%dT%H:%M:%fZ', updated_at) = updated_at
        )
);

CREATE TABLE IF NOT EXISTS fx_auto_batching_settings
(
    settings_id                           INTEGER PRIMARY KEY,
    max_interval_seconds                  INTEGER NOT NULL DEFAULT 60,
    default_transfer_rate_spread_percent  TEXT    NOT NULL DEFAULT '0.05',
    tenor_compatibility_mode              TEXT    NOT NULL DEFAULT 'SAME_TENOR_ONLY',
    updated_at                            TEXT    NOT NULL
        DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),

    CONSTRAINT chk_fx_auto_batching_settings_singleton
        CHECK (settings_id = 1),
    CONSTRAINT chk_fx_auto_batching_settings_max_interval
        CHECK (
            typeof(max_interval_seconds) = 'integer'
            AND max_interval_seconds BETWEEN 1 AND 3600
        ),
    CONSTRAINT chk_fx_auto_batching_settings_transfer_rate_spread
        CHECK (
            typeof(default_transfer_rate_spread_percent) = 'text'
            AND default_transfer_rate_spread_percent GLOB '[0-9]*'
            AND default_transfer_rate_spread_percent NOT GLOB '*[^0-9.]*'
            AND length(default_transfer_rate_spread_percent)
                - length(replace(default_transfer_rate_spread_percent, '.', '')) <= 1
            AND CAST(default_transfer_rate_spread_percent AS REAL)
                BETWEEN 0.0001 AND 100
        ),
    CONSTRAINT chk_fx_auto_batching_settings_tenor_compatibility
        CHECK (tenor_compatibility_mode = 'SAME_TENOR_ONLY'),
    CONSTRAINT chk_fx_auto_batching_settings_updated_at
        CHECK (
            length(updated_at) = 24
            AND updated_at GLOB '????-??-??T??:??:??.???Z'
            AND strftime('%Y-%m-%dT%H:%M:%fZ', updated_at) = updated_at
        )
);

CREATE TABLE IF NOT EXISTS fx_auto_batching_ccy_pairs
(
    settings_id    INTEGER NOT NULL DEFAULT 1,
    ccy_pair_code  TEXT    NOT NULL,

    PRIMARY KEY (settings_id, ccy_pair_code),

    CONSTRAINT fk_fx_auto_batching_ccy_pairs_settings
        FOREIGN KEY (settings_id)
            REFERENCES fx_auto_batching_settings (settings_id)
            ON UPDATE RESTRICT
            ON DELETE CASCADE,
    CONSTRAINT fk_fx_auto_batching_ccy_pairs_ccy_pair
        FOREIGN KEY (ccy_pair_code)
            REFERENCES ccy_pair_options (ccy_pair_code)
            ON UPDATE RESTRICT
            ON DELETE RESTRICT,
    CONSTRAINT chk_fx_auto_batching_ccy_pairs_singleton
        CHECK (settings_id = 1)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS client_deal_generation_settings
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
            AND max_base_ccy_amount_minor BETWEEN min_base_ccy_amount_minor AND 9007199254740991
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

CREATE TABLE IF NOT EXISTS fx_trade_exposure
(
    trade_id                    INTEGER PRIMARY KEY,
    execution_timestamp         TEXT    NOT NULL,
    received_timestamp          TEXT    NOT NULL,
    trade_type                  TEXT    NOT NULL,
    trade_date                  TEXT    NOT NULL,
    ccy_pair_code               TEXT    NOT NULL,
    base_ccy_side               TEXT    NOT NULL,
    dealt_ccy_code              TEXT    NOT NULL,
    base_ccy_amount_minor      INTEGER NOT NULL,
    base_ccy_fraction_digits   INTEGER NOT NULL,
    quote_ccy_amount_minor     INTEGER NOT NULL,
    quote_ccy_fraction_digits  INTEGER NOT NULL,
    trade_rate                 NUMERIC,
    tenor                      TEXT    NOT NULL,
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
    CONSTRAINT chk_fx_trade_exposure_execution_timestamp
        CHECK (
            length(execution_timestamp) = 24
            AND execution_timestamp GLOB '????-??-??T??:??:??.???Z'
            AND strftime('%Y-%m-%dT%H:%M:%fZ', execution_timestamp)
                = execution_timestamp
        ),
    CONSTRAINT chk_fx_trade_exposure_received_timestamp
        CHECK (
            length(received_timestamp) = 24
            AND received_timestamp GLOB '????-??-??T??:??:??.???Z'
            AND strftime('%Y-%m-%dT%H:%M:%fZ', received_timestamp)
                = received_timestamp
        ),
    CONSTRAINT chk_fx_trade_exposure_trade_type
        CHECK (
            trade_type IN
            (
                'CLIENT_DEAL',
                'HEDGE_DEAL',
                'BATCH_BALANCE_TRADE',
                'BATCH_POSITION_OUT'
            )
        ),
    CONSTRAINT chk_fx_trade_exposure_trade_date
        CHECK (
            trade_date GLOB '????-??-??'
            AND strftime('%Y-%m-%d', trade_date) = trade_date
        ),
    CONSTRAINT chk_fx_trade_exposure_dealt_ccy_code
        CHECK (
            length(dealt_ccy_code) = 3
            AND dealt_ccy_code = upper(dealt_ccy_code)
            AND dealt_ccy_code NOT GLOB '*[^A-Z]*'
        ),
    CONSTRAINT chk_fx_trade_exposure_amounts
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
    CONSTRAINT chk_fx_trade_exposure_fraction_digits
        CHECK (
            typeof(base_ccy_fraction_digits) = 'integer'
            AND base_ccy_fraction_digits BETWEEN 0 AND 10
            AND typeof(quote_ccy_fraction_digits) = 'integer'
            AND quote_ccy_fraction_digits BETWEEN 0 AND 10
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

CREATE TABLE IF NOT EXISTS fx_trade_position_management
(
    trade_id                        INTEGER NOT NULL,
    trade_type                      TEXT    NOT NULL,
    initial_position_management_mode TEXT    NOT NULL DEFAULT 'MANUAL',
    current_position_management_mode TEXT    NOT NULL DEFAULT 'MANUAL',
    created_at                      TEXT    NOT NULL
        DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at                      TEXT    NOT NULL
        DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),

    CONSTRAINT pk_fx_trade_position_management
        PRIMARY KEY (trade_id, trade_type),
    CONSTRAINT fk_fx_trade_position_management_trade
        FOREIGN KEY (trade_id, trade_type)
            REFERENCES fx_trade_exposure (trade_id, trade_type)
            ON UPDATE RESTRICT
            ON DELETE CASCADE,
    CONSTRAINT chk_fx_trade_position_management_initial_mode
        CHECK (initial_position_management_mode IN ('MANUAL', 'AUTO')),
    CONSTRAINT chk_fx_trade_position_management_current_mode
        CHECK (current_position_management_mode IN ('MANUAL', 'AUTO')),
    CONSTRAINT chk_fx_trade_position_management_created_at
        CHECK (
            length(created_at) = 24
            AND created_at GLOB '????-??-??T??:??:??.???Z'
            AND strftime('%Y-%m-%dT%H:%M:%fZ', created_at) = created_at
        ),
    CONSTRAINT chk_fx_trade_position_management_updated_at
        CHECK (
            length(updated_at) = 24
            AND updated_at GLOB '????-??-??T??:??:??.???Z'
            AND strftime('%Y-%m-%dT%H:%M:%fZ', updated_at) = updated_at
            AND updated_at >= created_at
        )
);

CREATE TABLE IF NOT EXISTS fx_trade_position_management_transitions
(
    transition_id                INTEGER PRIMARY KEY AUTOINCREMENT,
    trade_id                     INTEGER NOT NULL,
    trade_type                   TEXT    NOT NULL,
    from_position_management_mode TEXT    NOT NULL,
    to_position_management_mode   TEXT    NOT NULL,
    reason_code                  TEXT    NOT NULL,
    transition_source            TEXT    NOT NULL,
    transitioned_at              TEXT    NOT NULL
        DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),

    CONSTRAINT fk_fx_trade_position_management_transition_trade
        FOREIGN KEY (trade_id, trade_type)
            REFERENCES fx_trade_exposure (trade_id, trade_type)
            ON UPDATE RESTRICT
            ON DELETE CASCADE,
    CONSTRAINT uq_fx_trade_position_management_transition
        UNIQUE
        (
            trade_id,
            trade_type,
            from_position_management_mode,
            to_position_management_mode,
            reason_code
        ),
    CONSTRAINT chk_fx_trade_position_management_transition_modes
        CHECK (
            from_position_management_mode = 'MANUAL'
            AND to_position_management_mode = 'AUTO'
        ),
    CONSTRAINT chk_fx_trade_position_management_transition_reason
        CHECK (reason_code = 'MANUAL_REVIEW_COMPLETED'),
    CONSTRAINT chk_fx_trade_position_management_transition_source
        CHECK (transition_source = 'OPERATOR'),
    CONSTRAINT chk_fx_trade_position_management_transitioned_at
        CHECK (
            length(transitioned_at) = 24
            AND transitioned_at GLOB '????-??-??T??:??:??.???Z'
            AND strftime('%Y-%m-%dT%H:%M:%fZ', transitioned_at) = transitioned_at
        )
);

CREATE TABLE IF NOT EXISTS fx_trade_market_snapshot
(
    trade_id                INTEGER PRIMARY KEY,
    trade_type              TEXT    NOT NULL,
    market_pulse_stream_status TEXT NOT NULL,
    market_pulse_bid        NUMERIC,
    market_pulse_offer      NUMERIC,
    market_pulse_timestamp  TEXT,

    CONSTRAINT fk_fx_trade_market_snapshot_trade
        FOREIGN KEY (trade_id, trade_type)
            REFERENCES fx_trade_exposure (trade_id, trade_type)
            ON UPDATE RESTRICT
            ON DELETE RESTRICT,
    CONSTRAINT chk_fx_trade_market_snapshot_trade_type
        CHECK (trade_type IN ('CLIENT_DEAL', 'HEDGE_DEAL')),
    CONSTRAINT chk_fx_trade_market_snapshot_stream_status
        CHECK (market_pulse_stream_status IN ('RUNNING', 'STOPPED')),
    CONSTRAINT chk_fx_trade_market_snapshot_rates
        CHECK (
            (
                market_pulse_bid IS NULL
                AND market_pulse_offer IS NULL
                AND market_pulse_timestamp IS NULL
            )
            OR (
                typeof(market_pulse_bid) IN ('integer', 'real')
                AND market_pulse_bid > 0
                AND typeof(market_pulse_offer) IN ('integer', 'real')
                AND market_pulse_offer >= market_pulse_bid
                AND market_pulse_timestamp IS NOT NULL
            )
        ),
    CONSTRAINT chk_fx_trade_market_snapshot_timestamp
        CHECK (
            market_pulse_timestamp IS NULL
            OR (
                length(market_pulse_timestamp) = 24
                AND market_pulse_timestamp GLOB '????-??-??T??:??:??.???Z'
                AND strftime('%Y-%m-%dT%H:%M:%fZ', market_pulse_timestamp) = market_pulse_timestamp
            )
        )
);

CREATE TABLE IF NOT EXISTS client_fx_deals
(
    trade_id                    INTEGER PRIMARY KEY,
    trade_type                  TEXT    NOT NULL DEFAULT 'CLIENT_DEAL',
    counterparty_id                    INTEGER NOT NULL,
    execution_context_id        INTEGER,
    pricing_rule_id             INTEGER,
    transfer_rate               NUMERIC,
    analytical_pnl_quote_minor  INTEGER,
    analytical_pnl_quote_fraction_digits INTEGER,
    comment                     TEXT,

    CONSTRAINT fk_client_fx_deals_trade
        FOREIGN KEY (trade_id, trade_type)
            REFERENCES fx_trade_exposure (trade_id, trade_type)
            ON UPDATE RESTRICT
            ON DELETE RESTRICT,
    CONSTRAINT fk_client_fx_deals_counterparty
        FOREIGN KEY (counterparty_id)
            REFERENCES trading_counterparties (counterparty_id)
            ON UPDATE RESTRICT
            ON DELETE RESTRICT,
    CONSTRAINT fk_client_fx_deals_execution_context
        FOREIGN KEY (execution_context_id)
            REFERENCES execution_contexts (execution_context_id)
            ON UPDATE RESTRICT
            ON DELETE RESTRICT,
    CONSTRAINT fk_client_fx_deals_pricing_rule_scope
        FOREIGN KEY (pricing_rule_id, counterparty_id, execution_context_id)
            REFERENCES pricing_rules (pricing_rule_id, counterparty_id, execution_context_id)
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
    CONSTRAINT chk_client_fx_deals_analytical_pnl_quote
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

CREATE TABLE IF NOT EXISTS fx_hedge_deals
(
    trade_id                    INTEGER PRIMARY KEY,
    trade_type                  TEXT    NOT NULL DEFAULT 'HEDGE_DEAL',
    request_timestamp           TEXT    NOT NULL,
    counterparty_id                    INTEGER NOT NULL,
    execution_context_id        INTEGER,
    pricing_rule_id             INTEGER,
    transfer_rate               NUMERIC,
    analytical_pnl_quote_minor  INTEGER,
    analytical_pnl_quote_fraction_digits INTEGER,

    CONSTRAINT fk_fx_hedge_deals_trade
        FOREIGN KEY (trade_id, trade_type)
            REFERENCES fx_trade_exposure (trade_id, trade_type)
            ON UPDATE RESTRICT
            ON DELETE RESTRICT,
    CONSTRAINT fk_fx_hedge_deals_counterparty
        FOREIGN KEY (counterparty_id)
            REFERENCES trading_counterparties (counterparty_id)
            ON UPDATE RESTRICT
            ON DELETE RESTRICT,
    CONSTRAINT fk_fx_hedge_deals_execution_context
        FOREIGN KEY (execution_context_id)
            REFERENCES execution_contexts (execution_context_id)
            ON UPDATE RESTRICT
            ON DELETE RESTRICT,
    CONSTRAINT fk_fx_hedge_deals_pricing_rule_scope
        FOREIGN KEY (pricing_rule_id, counterparty_id, execution_context_id)
            REFERENCES pricing_rules (pricing_rule_id, counterparty_id, execution_context_id)
            ON UPDATE RESTRICT
            ON DELETE RESTRICT,
    CONSTRAINT chk_fx_hedge_deals_trade_type
        CHECK (trade_type = 'HEDGE_DEAL'),
    CONSTRAINT chk_fx_hedge_deals_request_timestamp
        CHECK (
            length(request_timestamp) = 24
            AND request_timestamp GLOB '????-??-??T??:??:??.???Z'
            AND strftime('%Y-%m-%dT%H:%M:%fZ', request_timestamp)
                = request_timestamp
        ),
    CONSTRAINT chk_fx_hedge_deals_pricing_context
        CHECK (pricing_rule_id IS NULL OR execution_context_id IS NOT NULL),
    CONSTRAINT chk_fx_hedge_deals_transfer_rate
        CHECK (
            transfer_rate IS NULL
            OR (
                typeof(transfer_rate) IN ('integer', 'real')
                AND transfer_rate > 0
            )
        ),
    CONSTRAINT chk_fx_hedge_deals_analytical_pnl_quote
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

CREATE TABLE IF NOT EXISTS fx_batches
(
    batch_id        INTEGER PRIMARY KEY AUTOINCREMENT,
    idempotency_key TEXT    NOT NULL,
    ccy_pair_code   TEXT    NOT NULL,
    batch_status    TEXT    NOT NULL DEFAULT 'BUILDING',
    formation_reason_code TEXT NOT NULL DEFAULT 'MANUAL_SELECTION',
    formation_reason_details_json TEXT NOT NULL DEFAULT '{}',
    window_opened_at TEXT,
    window_closed_at TEXT,
    created_at      TEXT    NOT NULL
        DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    rolled_back_at  TEXT,

    CONSTRAINT fk_fx_batches_ccy_pair
        FOREIGN KEY (ccy_pair_code)
            REFERENCES ccy_pair_options (ccy_pair_code)
            ON UPDATE RESTRICT
            ON DELETE RESTRICT,
    CONSTRAINT uq_fx_batches_idempotency_key
        UNIQUE (idempotency_key),
    CONSTRAINT chk_fx_batches_id
        CHECK (batch_id > 0),
    CONSTRAINT chk_fx_batches_idempotency_key
        CHECK (
            length(idempotency_key) BETWEEN 1 AND 100
            AND idempotency_key = trim(idempotency_key)
        ),
    CONSTRAINT chk_fx_batches_status
        CHECK (batch_status IN ('BUILDING', 'FORMED', 'ROLLED_BACK')),
    CONSTRAINT chk_fx_batches_formation_reason_code
        CHECK (
            formation_reason_code IN (
                'MANUAL_SELECTION',
                'MAX_INTERVAL_REACHED',
                'TRANSFER_RATE_CORRIDOR_BREACHED'
            )
        ),
    CONSTRAINT chk_fx_batches_formation_reason_details
        CHECK (
            length(formation_reason_details_json) BETWEEN 2 AND 4000
            AND json_valid(formation_reason_details_json) = 1
            AND substr(formation_reason_details_json, 1, 1) = '{'
            AND substr(formation_reason_details_json, -1, 1) = '}'
        ),
    CONSTRAINT chk_fx_batches_formation_timing
        CHECK (
            (
                formation_reason_code = 'MANUAL_SELECTION'
                AND window_opened_at IS NULL
                AND window_closed_at IS NULL
            )
            OR (
                formation_reason_code IN (
                    'MAX_INTERVAL_REACHED',
                    'TRANSFER_RATE_CORRIDOR_BREACHED'
                )
                AND length(window_opened_at) = 24
                AND window_opened_at GLOB '????-??-??T??:??:??.???Z'
                AND strftime('%Y-%m-%dT%H:%M:%fZ', window_opened_at)
                    = window_opened_at
                AND length(window_closed_at) = 24
                AND window_closed_at GLOB '????-??-??T??:??:??.???Z'
                AND strftime('%Y-%m-%dT%H:%M:%fZ', window_closed_at)
                    = window_closed_at
                AND window_opened_at <= window_closed_at
                AND window_closed_at <= created_at
            )
        ),
    CONSTRAINT chk_fx_batches_created_at
        CHECK (
            length(created_at) = 24
            AND created_at GLOB '????-??-??T??:??:??.???Z'
            AND strftime('%Y-%m-%dT%H:%M:%fZ', created_at) = created_at
        ),
    CONSTRAINT chk_fx_batches_rolled_back_at
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

CREATE TABLE IF NOT EXISTS fx_batch_members
(
    batch_id    INTEGER NOT NULL,
    trade_id    INTEGER NOT NULL,
    trade_type  TEXT    NOT NULL,
    member_role TEXT    NOT NULL,

    CONSTRAINT pk_fx_batch_members
        PRIMARY KEY (batch_id, trade_id),
    CONSTRAINT fk_fx_batch_members_batch
        FOREIGN KEY (batch_id)
            REFERENCES fx_batches (batch_id)
            ON UPDATE RESTRICT
            ON DELETE RESTRICT,
    CONSTRAINT fk_fx_batch_members_trade
        FOREIGN KEY (trade_id, trade_type)
            REFERENCES fx_trade_exposure (trade_id, trade_type)
            ON UPDATE RESTRICT
            ON DELETE RESTRICT,
    CONSTRAINT chk_fx_batch_members_role
        CHECK (member_role IN ('TRADE', 'BALANCE_TRADE', 'POSITION_OUT')),
    CONSTRAINT chk_fx_batch_members_role_trade_type
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

CREATE TABLE IF NOT EXISTS fx_batch_balance_trade
(
    trade_id    INTEGER PRIMARY KEY,
    trade_type  TEXT    NOT NULL DEFAULT 'BATCH_BALANCE_TRADE',

    CONSTRAINT fk_fx_batch_balance_trade_trade
        FOREIGN KEY (trade_id, trade_type)
            REFERENCES fx_trade_exposure (trade_id, trade_type)
            ON UPDATE RESTRICT
            ON DELETE RESTRICT,
    CONSTRAINT chk_fx_batch_balance_trade_trade_type
        CHECK (trade_type = 'BATCH_BALANCE_TRADE')
);

CREATE TABLE IF NOT EXISTS fx_batch_position_output
(
    trade_id    INTEGER PRIMARY KEY,
    trade_type  TEXT    NOT NULL DEFAULT 'BATCH_POSITION_OUT',

    CONSTRAINT fk_fx_batch_position_output_trade
        FOREIGN KEY (trade_id, trade_type)
            REFERENCES fx_trade_exposure (trade_id, trade_type)
            ON UPDATE RESTRICT
            ON DELETE RESTRICT,
    CONSTRAINT chk_fx_batch_position_output_trade_type
        CHECK (trade_type = 'BATCH_POSITION_OUT')
);

CREATE TABLE IF NOT EXISTS fx_batch_quote_cash_output
(
    batch_id                        INTEGER PRIMARY KEY,
    quote_ccy_code                  TEXT    NOT NULL,
    quote_balance_contribution_minor INTEGER NOT NULL,
    quote_ccy_fraction_digits       INTEGER NOT NULL,
    quote_ccy_value_date            TEXT    NOT NULL,
    created_at                      TEXT    NOT NULL
        DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),

    CONSTRAINT fk_fx_batch_quote_cash_output_batch
        FOREIGN KEY (batch_id)
            REFERENCES fx_batches (batch_id)
            ON UPDATE RESTRICT
            ON DELETE RESTRICT,
    CONSTRAINT fk_fx_batch_quote_cash_output_currency
        FOREIGN KEY (quote_ccy_code)
            REFERENCES ccy_options (ccy_code)
            ON UPDATE RESTRICT
            ON DELETE RESTRICT,
    CONSTRAINT chk_fx_batch_quote_cash_output_amount
        CHECK (
            typeof(quote_balance_contribution_minor) = 'integer'
            AND quote_balance_contribution_minor
                BETWEEN -9007199254740991 AND 9007199254740991
        ),
    CONSTRAINT chk_fx_batch_quote_cash_output_fraction_digits
        CHECK (
            typeof(quote_ccy_fraction_digits) = 'integer'
            AND quote_ccy_fraction_digits BETWEEN 0 AND 10
        ),
    CONSTRAINT chk_fx_batch_quote_cash_output_value_date
        CHECK (
            quote_ccy_value_date GLOB '????-??-??'
            AND strftime('%Y-%m-%d', quote_ccy_value_date) = quote_ccy_value_date
        ),
    CONSTRAINT chk_fx_batch_quote_cash_output_created_at
        CHECK (
            length(created_at) = 24
            AND created_at GLOB '????-??-??T??:??:??.???Z'
            AND strftime('%Y-%m-%dT%H:%M:%fZ', created_at) = created_at
        )
);

CREATE VIEW IF NOT EXISTS v_fx_batch_formation_audit AS
WITH source_trade_summary AS
(
    SELECT
        member.batch_id,
        COUNT(*) AS source_trade_count,
        MIN(exposure.trade_date) AS trade_date,
        MIN(exposure.tenor) AS tenor,
        MIN(exposure.base_ccy_value_date) AS base_ccy_value_date,
        MIN(exposure.quote_ccy_value_date) AS quote_ccy_value_date,
        MIN(exposure.base_ccy_fraction_digits) AS base_ccy_fraction_digits,
        MIN(exposure.quote_ccy_fraction_digits) AS quote_ccy_fraction_digits
    FROM fx_batch_members member
    INNER JOIN fx_trade_exposure exposure
        ON exposure.trade_id = member.trade_id
        AND exposure.trade_type = member.trade_type
    WHERE member.member_role = 'TRADE'
    GROUP BY member.batch_id
)
SELECT
    batch.batch_id,
    batch.batch_status,
    batch.ccy_pair_code,
    source.trade_date,
    source.tenor,
    source.base_ccy_value_date,
    source.quote_ccy_value_date,
    source.base_ccy_fraction_digits,
    source.quote_ccy_fraction_digits,
    batch.window_opened_at,
    batch.window_closed_at,
    batch.created_at AS formed_at,
    batch.formation_reason_code,
    batch.formation_reason_details_json,
    source.source_trade_count,
    batch.rolled_back_at
FROM fx_batches batch
INNER JOIN source_trade_summary source ON source.batch_id = batch.batch_id
WHERE batch.batch_status IN ('FORMED', 'ROLLED_BACK');

CREATE UNIQUE INDEX IF NOT EXISTS uq_execution_contexts_components
    ON execution_contexts
    (
        servicing_location_id,
        COALESCE(accounting_system_id, 'NOT_APPLICABLE'),
        execution_system_id
    );

CREATE INDEX IF NOT EXISTS idx_execution_contexts_servicing_location
    ON execution_contexts (servicing_location_id);

CREATE INDEX IF NOT EXISTS idx_execution_contexts_accounting_system
    ON execution_contexts (accounting_system_id);

CREATE INDEX IF NOT EXISTS idx_execution_contexts_execution_system
    ON execution_contexts (execution_system_id);

CREATE INDEX IF NOT EXISTS idx_trading_counterparty_execution_contexts_context
    ON trading_counterparty_execution_contexts (execution_context_id, counterparty_id);

CREATE INDEX IF NOT EXISTS idx_pricing_rules_counterparty
    ON pricing_rules (counterparty_id);

CREATE INDEX IF NOT EXISTS idx_pricing_rules_execution_context
    ON pricing_rules (execution_context_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_pricing_rules_client_deal_reference
    ON pricing_rules (pricing_rule_id, counterparty_id, execution_context_id);

CREATE INDEX IF NOT EXISTS idx_pricing_rules_ccy_pair
    ON pricing_rules (ccy_pair_code);

CREATE INDEX IF NOT EXISTS idx_fx_trade_exposure_trade_type
    ON fx_trade_exposure (trade_type);

CREATE INDEX IF NOT EXISTS idx_fx_trade_exposure_trade_date
    ON fx_trade_exposure (trade_date);

CREATE INDEX IF NOT EXISTS idx_fx_trade_exposure_ccy_pair
    ON fx_trade_exposure (ccy_pair_code);

CREATE UNIQUE INDEX IF NOT EXISTS uq_fx_trade_exposure_identity
    ON fx_trade_exposure (trade_id, trade_type);

CREATE INDEX IF NOT EXISTS idx_fx_trade_position_management_current_mode
    ON fx_trade_position_management (current_position_management_mode, trade_id);

CREATE INDEX IF NOT EXISTS idx_fx_trade_position_management_transition_trade
    ON fx_trade_position_management_transitions (trade_id, trade_type, transitioned_at);

CREATE TRIGGER IF NOT EXISTS trg_fx_trade_position_management_initialize
AFTER INSERT ON fx_trade_exposure
FOR EACH ROW
BEGIN
    INSERT INTO fx_trade_position_management
        (
            trade_id,
            trade_type,
            initial_position_management_mode,
            current_position_management_mode
        )
    VALUES
        (NEW.trade_id, NEW.trade_type, 'MANUAL', 'MANUAL');
END;

CREATE TRIGGER IF NOT EXISTS trg_fx_trade_exposure_require_dealt_ccy_insert
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

CREATE TRIGGER IF NOT EXISTS trg_fx_trade_exposure_require_dealt_ccy_update
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

CREATE TRIGGER IF NOT EXISTS trg_ccy_pair_options_preserve_exposure_dealt_ccy
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

CREATE INDEX IF NOT EXISTS idx_client_fx_deals_counterparty
    ON client_fx_deals (counterparty_id);

CREATE INDEX IF NOT EXISTS idx_fx_hedge_deals_counterparty
    ON fx_hedge_deals (counterparty_id);

CREATE INDEX IF NOT EXISTS idx_fx_batches_status_pair
    ON fx_batches (batch_status, ccy_pair_code);

CREATE INDEX IF NOT EXISTS idx_fx_batch_members_trade
    ON fx_batch_members (trade_id, batch_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_fx_batch_members_single_technical_role
    ON fx_batch_members (batch_id, member_role)
    WHERE member_role IN ('BALANCE_TRADE', 'POSITION_OUT');

CREATE UNIQUE INDEX IF NOT EXISTS uq_fx_batch_members_single_technical_origin
    ON fx_batch_members (trade_id)
    WHERE member_role IN ('BALANCE_TRADE', 'POSITION_OUT');

CREATE TRIGGER IF NOT EXISTS trg_fx_batch_members_validate_insert
BEFORE INSERT ON fx_batch_members
FOR EACH ROW
WHEN
    NOT EXISTS
    (
        SELECT 1
        FROM fx_batches b
        INNER JOIN fx_trade_exposure e ON e.trade_id = NEW.trade_id
        WHERE b.batch_id = NEW.batch_id
          AND b.batch_status = 'BUILDING'
          AND e.trade_type = NEW.trade_type
          AND e.ccy_pair_code = b.ccy_pair_code
    )
    OR (
        NEW.member_role = 'BALANCE_TRADE'
        AND NOT EXISTS
        (
            SELECT 1
            FROM fx_batch_balance_trade balance_trade
            WHERE balance_trade.trade_id = NEW.trade_id
              AND balance_trade.trade_type = NEW.trade_type
        )
    )
    OR (
        NEW.member_role = 'POSITION_OUT'
        AND NOT EXISTS
        (
            SELECT 1
            FROM fx_batch_position_output output
            WHERE output.trade_id = NEW.trade_id
              AND output.trade_type = NEW.trade_type
        )
    )
    OR (
        NEW.member_role = 'TRADE'
        AND NOT EXISTS
        (
            SELECT 1
            FROM client_fx_deals d
            WHERE d.trade_id = NEW.trade_id
              AND d.trade_type = NEW.trade_type
              AND d.transfer_rate IS NOT NULL

            UNION ALL

            SELECT 1
            FROM fx_hedge_deals d
            WHERE d.trade_id = NEW.trade_id
              AND d.trade_type = NEW.trade_type
              AND d.transfer_rate IS NOT NULL

            UNION ALL

            SELECT 1
            FROM fx_batch_position_output output
            INNER JOIN fx_batch_members origin
                ON origin.trade_id = output.trade_id
                AND origin.trade_type = output.trade_type
                AND origin.member_role = 'POSITION_OUT'
            INNER JOIN fx_batches source_batch
                ON source_batch.batch_id = origin.batch_id
            INNER JOIN fx_trade_exposure e
                ON e.trade_id = output.trade_id
                AND e.trade_type = output.trade_type
            WHERE output.trade_id = NEW.trade_id
              AND output.trade_type = NEW.trade_type
              AND source_batch.batch_status IN ('FORMED', 'ROLLED_BACK')
              AND e.base_ccy_side IN ('BUY', 'SELL')
              AND e.trade_rate IS NOT NULL

            UNION ALL

            SELECT 1
            FROM fx_batch_balance_trade balance_trade
            INNER JOIN fx_batch_members origin
                ON origin.trade_id = balance_trade.trade_id
                AND origin.trade_type = balance_trade.trade_type
                AND origin.member_role = 'BALANCE_TRADE'
            INNER JOIN fx_batches source_batch
                ON source_batch.batch_id = origin.batch_id
            INNER JOIN fx_trade_exposure e
                ON e.trade_id = balance_trade.trade_id
                AND e.trade_type = balance_trade.trade_type
            WHERE balance_trade.trade_id = NEW.trade_id
              AND balance_trade.trade_type = NEW.trade_type
              AND source_batch.batch_status = 'ROLLED_BACK'
              AND e.base_ccy_side IN ('BUY', 'SELL')
              AND e.trade_rate IS NOT NULL
        )
    )
    OR EXISTS
    (
        SELECT 1
        FROM fx_batch_members existing
        INNER JOIN fx_batches existing_batch
            ON existing_batch.batch_id = existing.batch_id
        WHERE existing.trade_id = NEW.trade_id
          AND existing.trade_type = NEW.trade_type
          AND existing.batch_id <> NEW.batch_id
          AND existing_batch.batch_status IN ('BUILDING', 'FORMED')
          AND NOT (
              NEW.member_role = 'TRADE'
              AND NEW.trade_type = 'BATCH_POSITION_OUT'
              AND existing.member_role = 'POSITION_OUT'
          )
    )
BEGIN
    SELECT RAISE(
        ABORT,
        'trade may belong to only one active batch and membership requires a matching subtype or available source Trade'
    );
END;

CREATE TRIGGER IF NOT EXISTS trg_fx_batch_quote_cash_output_validate_insert
BEFORE INSERT ON fx_batch_quote_cash_output
FOR EACH ROW
WHEN
    NOT EXISTS
    (
        SELECT 1
        FROM fx_batches b
        INNER JOIN ccy_pair_options p
            ON p.ccy_pair_code = b.ccy_pair_code
        INNER JOIN ccy_options c
            ON c.ccy_code = p.quote_ccy_code
        WHERE b.batch_id = NEW.batch_id
          AND b.batch_status = 'BUILDING'
          AND p.quote_ccy_code = NEW.quote_ccy_code
          AND c.fraction_digits = NEW.quote_ccy_fraction_digits
    )
    OR EXISTS
    (
        SELECT 1
        FROM fx_batch_members m
        INNER JOIN fx_trade_exposure e
            ON e.trade_id = m.trade_id
            AND e.trade_type = m.trade_type
        WHERE m.batch_id = NEW.batch_id
          AND m.member_role IN ('TRADE', 'BALANCE_TRADE')
          AND (
              e.quote_ccy_fraction_digits <> NEW.quote_ccy_fraction_digits
              OR e.quote_ccy_value_date <> NEW.quote_ccy_value_date
          )
    )
BEGIN
    SELECT RAISE(
        ABORT,
        'batch quote cash output must match the BUILDING batch quote currency and settlement'
    );
END;

CREATE TRIGGER IF NOT EXISTS trg_fx_batches_form
BEFORE UPDATE OF batch_status ON fx_batches
FOR EACH ROW
WHEN OLD.batch_status = 'BUILDING' AND NEW.batch_status = 'FORMED'
BEGIN
    SELECT CASE
        WHEN EXISTS
        (
            SELECT 1
            FROM fx_batch_members m
            INNER JOIN fx_trade_exposure e
                ON e.trade_id = m.trade_id
                AND e.trade_type = m.trade_type
            WHERE m.batch_id = OLD.batch_id
              AND e.ccy_pair_code <> OLD.ccy_pair_code
        )
        THEN RAISE(ABORT, 'formed FX Batch trades must share the Batching Key currency pair')
    END;
    SELECT CASE
        WHEN EXISTS
        (
            SELECT COUNT(*)
            FROM
            (
                SELECT
                    e.trade_date,
                    e.tenor,
                    e.base_ccy_value_date,
                    e.quote_ccy_value_date
                FROM fx_batch_members m
                INNER JOIN fx_trade_exposure e
                    ON e.trade_id = m.trade_id
                    AND e.trade_type = m.trade_type
                WHERE m.batch_id = OLD.batch_id
            )
            HAVING COUNT(DISTINCT trade_date) <> 1
                OR COUNT(DISTINCT tenor) <> 1
                OR COUNT(DISTINCT base_ccy_value_date) <> 1
                OR COUNT(DISTINCT quote_ccy_value_date) <> 1
        )
        THEN RAISE(ABORT, 'formed FX Batch trades must share the Batching Key settlement terms')
    END;
    SELECT CASE
        WHEN EXISTS
        (
            SELECT COUNT(*)
            FROM
            (
                SELECT
                    e.base_ccy_fraction_digits,
                    e.quote_ccy_fraction_digits
                FROM fx_batch_members m
                INNER JOIN fx_trade_exposure e
                    ON e.trade_id = m.trade_id
                    AND e.trade_type = m.trade_type
                WHERE m.batch_id = OLD.batch_id
            )
            HAVING COUNT(DISTINCT base_ccy_fraction_digits) <> 1
                OR COUNT(DISTINCT quote_ccy_fraction_digits) <> 1
        )
        THEN RAISE(ABORT, 'formed FX Batch trades must share the Batching Key currency precision')
    END;
    SELECT CASE
        WHEN EXISTS
        (
            SELECT 1
            FROM fx_batch_members member
            WHERE member.batch_id = OLD.batch_id
              AND (
                  (
                      member.member_role = 'BALANCE_TRADE'
                      AND NOT EXISTS
                      (
                          SELECT 1
                          FROM fx_batch_balance_trade balance_trade
                          WHERE balance_trade.trade_id = member.trade_id
                            AND balance_trade.trade_type = member.trade_type
                      )
                  )
                  OR (
                      member.member_role = 'POSITION_OUT'
                      AND NOT EXISTS
                      (
                          SELECT 1
                          FROM fx_batch_position_output output
                          WHERE output.trade_id = member.trade_id
                            AND output.trade_type = member.trade_type
                      )
                  )
              )
        )
        THEN RAISE(ABORT, 'formed batch technical trades require their subtype records')
    END;
    SELECT CASE
        WHEN NOT EXISTS
        (
            SELECT 1
            FROM fx_batch_members
            WHERE batch_id = OLD.batch_id
              AND member_role = 'TRADE'
        )
        THEN RAISE(ABORT, 'formed batch must contain at least one ordinary trade')
    END;
    SELECT CASE
        WHEN NOT EXISTS
        (
            SELECT 1
            FROM fx_batch_quote_cash_output
            WHERE batch_id = OLD.batch_id
        )
        THEN RAISE(ABORT, 'formed batch must contain one quote cash output')
    END;
    SELECT CASE
        WHEN
        (
            SELECT COALESCE(SUM(
                CASE e.base_ccy_side
                    WHEN 'BUY' THEN e.base_ccy_amount_minor
                    ELSE -e.base_ccy_amount_minor
                END
            ), 0)
            FROM fx_batch_members m
            INNER JOIN fx_trade_exposure e
                ON e.trade_id = m.trade_id
                AND e.trade_type = m.trade_type
            WHERE m.batch_id = OLD.batch_id
              AND m.member_role = 'TRADE'
        ) <> 0
        AND NOT EXISTS
        (
            SELECT 1
            FROM fx_batch_members
            WHERE batch_id = OLD.batch_id
              AND member_role = 'BALANCE_TRADE'
        )
        THEN RAISE(ABORT, 'non-flat batch must contain a balance trade')
    END;
    SELECT CASE
        WHEN
        (
            SELECT COALESCE(SUM(
                CASE e.base_ccy_side
                    WHEN 'BUY' THEN e.base_ccy_amount_minor
                    ELSE -e.base_ccy_amount_minor
                END
            ), 0)
            FROM fx_batch_members m
            INNER JOIN fx_trade_exposure e
                ON e.trade_id = m.trade_id
                AND e.trade_type = m.trade_type
            WHERE m.batch_id = OLD.batch_id
              AND m.member_role = 'TRADE'
        ) = 0
        AND EXISTS
        (
            SELECT 1
            FROM fx_batch_members
            WHERE batch_id = OLD.batch_id
              AND member_role = 'BALANCE_TRADE'
        )
        THEN RAISE(ABORT, 'flat batch must not contain a balance trade')
    END;
    SELECT CASE
        WHEN
        (
            SELECT COALESCE(SUM(
                CASE e.base_ccy_side
                    WHEN 'BUY' THEN e.base_ccy_amount_minor
                    ELSE -e.base_ccy_amount_minor
                END
            ), 0)
            FROM fx_batch_members m
            INNER JOIN fx_trade_exposure e
                ON e.trade_id = m.trade_id
                AND e.trade_type = m.trade_type
            WHERE m.batch_id = OLD.batch_id
              AND m.member_role = 'TRADE'
        ) <> 0
        AND NOT EXISTS
        (
            SELECT 1
            FROM fx_batch_members
            WHERE batch_id = OLD.batch_id
              AND member_role = 'POSITION_OUT'
        )
        THEN RAISE(ABORT, 'non-flat batch must contain a position output')
    END;
    SELECT CASE
        WHEN
        (
            SELECT COALESCE(SUM(
                CASE e.base_ccy_side
                    WHEN 'BUY' THEN e.base_ccy_amount_minor
                    ELSE -e.base_ccy_amount_minor
                END
            ), 0)
            FROM fx_batch_members m
            INNER JOIN fx_trade_exposure e
                ON e.trade_id = m.trade_id
                AND e.trade_type = m.trade_type
            WHERE m.batch_id = OLD.batch_id
              AND m.member_role = 'TRADE'
        ) = 0
        AND EXISTS
        (
            SELECT 1
            FROM fx_batch_members
            WHERE batch_id = OLD.batch_id
              AND member_role = 'POSITION_OUT'
        )
        THEN RAISE(ABORT, 'flat batch must not contain a position output')
    END;
    SELECT CASE
        WHEN
        (
            SELECT COALESCE(SUM(
                CASE e.base_ccy_side
                    WHEN 'BUY' THEN e.base_ccy_amount_minor
                    ELSE -e.base_ccy_amount_minor
                END
            ), 0)
            FROM fx_batch_members m
            INNER JOIN fx_trade_exposure e
                ON e.trade_id = m.trade_id
                AND e.trade_type = m.trade_type
            WHERE m.batch_id = OLD.batch_id
              AND m.member_role IN ('TRADE', 'BALANCE_TRADE')
        ) <> 0
        THEN RAISE(ABORT, 'formed batch must have zero base currency position')
    END;
    SELECT CASE
        WHEN
        (
            SELECT COALESCE(SUM(
                CASE e.base_ccy_side
                    WHEN 'BUY' THEN e.quote_ccy_amount_minor
                    ELSE -e.quote_ccy_amount_minor
                END
            ), 0)
            FROM fx_batch_members m
            INNER JOIN fx_trade_exposure e
                ON e.trade_id = m.trade_id
                AND e.trade_type = m.trade_type
            WHERE m.batch_id = OLD.batch_id
              AND m.member_role IN ('TRADE', 'BALANCE_TRADE')
        )
        +
        (
            SELECT quote_balance_contribution_minor
            FROM fx_batch_quote_cash_output
            WHERE batch_id = OLD.batch_id
        ) <> 0
        THEN RAISE(ABORT, 'formed batch must have zero quote currency cash balance')
    END;
    SELECT CASE
        WHEN
        (
            SELECT COALESCE(SUM(
                CASE e.base_ccy_side
                    WHEN 'BUY' THEN e.base_ccy_amount_minor
                    ELSE -e.base_ccy_amount_minor
                END
            ), 0)
            FROM fx_batch_members m
            INNER JOIN fx_trade_exposure e
                ON e.trade_id = m.trade_id
                AND e.trade_type = m.trade_type
            WHERE m.batch_id = OLD.batch_id
              AND m.member_role = 'TRADE'
        ) <>
        (
            SELECT COALESCE(SUM(
                CASE e.base_ccy_side
                    WHEN 'BUY' THEN e.base_ccy_amount_minor
                    WHEN 'SELL' THEN -e.base_ccy_amount_minor
                    ELSE 0
                END
            ), 0)
            FROM fx_batch_members output
            INNER JOIN fx_trade_exposure e
                ON e.trade_id = output.trade_id
                AND e.trade_type = output.trade_type
            WHERE output.batch_id = OLD.batch_id
              AND output.member_role = 'POSITION_OUT'
        )
        THEN RAISE(ABORT, 'position output must equal the source Base Ccy position')
    END;
END;

CREATE TRIGGER IF NOT EXISTS trg_fx_batches_reject_invalid_status_update
BEFORE UPDATE OF batch_status ON fx_batches
FOR EACH ROW
WHEN NOT (
    (OLD.batch_status = 'BUILDING' AND NEW.batch_status = 'FORMED')
    OR (OLD.batch_status = 'FORMED' AND NEW.batch_status = 'ROLLED_BACK')
)
BEGIN
    SELECT RAISE(ABORT, 'batch status transition is not allowed');
END;

CREATE TRIGGER IF NOT EXISTS trg_fx_batches_validate_formation_reason_insert
BEFORE INSERT ON fx_batches
FOR EACH ROW
WHEN CASE
    WHEN json_valid(NEW.formation_reason_details_json) = 0 THEN 1
    WHEN json_type(NEW.formation_reason_details_json) <> 'object' THEN 1
    ELSE 0
END
BEGIN
    SELECT RAISE(ABORT, 'batch formation reason details must be a JSON object');
END;

CREATE TRIGGER IF NOT EXISTS trg_fx_batches_validate_formation_reason_update
BEFORE UPDATE OF formation_reason_details_json ON fx_batches
FOR EACH ROW
WHEN CASE
    WHEN json_valid(NEW.formation_reason_details_json) = 0 THEN 1
    WHEN json_type(NEW.formation_reason_details_json) <> 'object' THEN 1
    ELSE 0
END
BEGIN
    SELECT RAISE(ABORT, 'batch formation reason details must be a JSON object');
END;

CREATE TRIGGER IF NOT EXISTS trg_fx_batches_validate_formation_timing_insert
BEFORE INSERT ON fx_batches
FOR EACH ROW
WHEN
    (
        NEW.formation_reason_code = 'MANUAL_SELECTION'
        AND (NEW.window_opened_at IS NOT NULL OR NEW.window_closed_at IS NOT NULL)
    )
    OR (
        NEW.formation_reason_code <> 'MANUAL_SELECTION'
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

CREATE TRIGGER IF NOT EXISTS trg_fx_batches_validate_formation_timing_update
BEFORE UPDATE OF formation_reason_code, window_opened_at, window_closed_at, created_at
ON fx_batches
FOR EACH ROW
WHEN
    (
        NEW.formation_reason_code = 'MANUAL_SELECTION'
        AND (NEW.window_opened_at IS NOT NULL OR NEW.window_closed_at IS NOT NULL)
    )
    OR (
        NEW.formation_reason_code <> 'MANUAL_SELECTION'
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

CREATE TRIGGER IF NOT EXISTS trg_fx_batches_immutable_update
BEFORE UPDATE ON fx_batches
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

CREATE TRIGGER IF NOT EXISTS trg_fx_batches_immutable_delete
BEFORE DELETE ON fx_batches
FOR EACH ROW
WHEN OLD.batch_status IN ('FORMED', 'ROLLED_BACK')
BEGIN
    SELECT RAISE(ABORT, 'completed batch is immutable');
END;

CREATE TRIGGER IF NOT EXISTS trg_fx_batch_members_immutable_update
BEFORE UPDATE ON fx_batch_members
FOR EACH ROW
WHEN EXISTS
(
    SELECT 1 FROM fx_batches
    WHERE batch_id = OLD.batch_id
      AND batch_status IN ('FORMED', 'ROLLED_BACK')
)
BEGIN
    SELECT RAISE(ABORT, 'completed batch members are immutable');
END;

CREATE TRIGGER IF NOT EXISTS trg_fx_batch_members_immutable_delete
BEFORE DELETE ON fx_batch_members
FOR EACH ROW
WHEN EXISTS
(
    SELECT 1 FROM fx_batches
    WHERE batch_id = OLD.batch_id
      AND batch_status IN ('FORMED', 'ROLLED_BACK')
)
BEGIN
    SELECT RAISE(ABORT, 'completed batch members are immutable');
END;

CREATE TRIGGER IF NOT EXISTS trg_fx_batch_balance_trade_immutable_update
BEFORE UPDATE ON fx_batch_balance_trade
FOR EACH ROW
WHEN EXISTS
(
    SELECT 1
    FROM fx_batch_members member
    INNER JOIN fx_batches batch ON batch.batch_id = member.batch_id
    WHERE member.trade_id = OLD.trade_id
      AND member.trade_type = OLD.trade_type
      AND member.member_role = 'BALANCE_TRADE'
      AND batch.batch_status IN ('FORMED', 'ROLLED_BACK')
)
BEGIN
    SELECT RAISE(ABORT, 'completed batch balance trade is immutable');
END;

CREATE TRIGGER IF NOT EXISTS trg_fx_batch_balance_trade_immutable_delete
BEFORE DELETE ON fx_batch_balance_trade
FOR EACH ROW
WHEN EXISTS
(
    SELECT 1
    FROM fx_batch_members member
    INNER JOIN fx_batches batch ON batch.batch_id = member.batch_id
    WHERE member.trade_id = OLD.trade_id
      AND member.trade_type = OLD.trade_type
      AND member.member_role = 'BALANCE_TRADE'
      AND batch.batch_status IN ('FORMED', 'ROLLED_BACK')
)
BEGIN
    SELECT RAISE(ABORT, 'completed batch balance trade is immutable');
END;

CREATE TRIGGER IF NOT EXISTS trg_fx_batch_position_output_immutable_update
BEFORE UPDATE ON fx_batch_position_output
FOR EACH ROW
WHEN EXISTS
(
    SELECT 1
    FROM fx_batch_members member
    INNER JOIN fx_batches batch ON batch.batch_id = member.batch_id
    WHERE member.trade_id = OLD.trade_id
      AND member.trade_type = OLD.trade_type
      AND member.member_role = 'POSITION_OUT'
      AND batch.batch_status IN ('FORMED', 'ROLLED_BACK')
)
BEGIN
    SELECT RAISE(ABORT, 'completed batch position output is immutable');
END;

CREATE TRIGGER IF NOT EXISTS trg_fx_batch_position_output_immutable_delete
BEFORE DELETE ON fx_batch_position_output
FOR EACH ROW
WHEN EXISTS
(
    SELECT 1
    FROM fx_batch_members member
    INNER JOIN fx_batches batch ON batch.batch_id = member.batch_id
    WHERE member.trade_id = OLD.trade_id
      AND member.trade_type = OLD.trade_type
      AND member.member_role = 'POSITION_OUT'
      AND batch.batch_status IN ('FORMED', 'ROLLED_BACK')
)
BEGIN
    SELECT RAISE(ABORT, 'completed batch position output is immutable');
END;

CREATE TRIGGER IF NOT EXISTS trg_fx_batch_quote_cash_output_immutable_update
BEFORE UPDATE ON fx_batch_quote_cash_output
FOR EACH ROW
WHEN EXISTS
(
    SELECT 1 FROM fx_batches
    WHERE batch_id = OLD.batch_id
      AND batch_status IN ('FORMED', 'ROLLED_BACK')
)
BEGIN
    SELECT RAISE(ABORT, 'completed batch quote cash output is immutable');
END;

CREATE TRIGGER IF NOT EXISTS trg_fx_batch_quote_cash_output_immutable_delete
BEFORE DELETE ON fx_batch_quote_cash_output
FOR EACH ROW
WHEN EXISTS
(
    SELECT 1 FROM fx_batches
    WHERE batch_id = OLD.batch_id
      AND batch_status IN ('FORMED', 'ROLLED_BACK')
)
BEGIN
    SELECT RAISE(ABORT, 'completed batch quote cash output is immutable');
END;

CREATE TRIGGER IF NOT EXISTS trg_formed_batch_trade_immutable_update
BEFORE UPDATE ON fx_trade_exposure
FOR EACH ROW
WHEN EXISTS
(
    SELECT 1
    FROM fx_batch_members member
    INNER JOIN fx_batches batch ON batch.batch_id = member.batch_id
    WHERE member.trade_id = OLD.trade_id
      AND member.trade_type = OLD.trade_type
      AND batch.batch_status IN ('FORMED', 'ROLLED_BACK')
)
BEGIN
    SELECT RAISE(ABORT, 'trade linked to a completed batch is immutable');
END;

CREATE TRIGGER IF NOT EXISTS trg_formed_batch_trade_immutable_delete
BEFORE DELETE ON fx_trade_exposure
FOR EACH ROW
WHEN EXISTS
(
    SELECT 1
    FROM fx_batch_members member
    INNER JOIN fx_batches batch ON batch.batch_id = member.batch_id
    WHERE member.trade_id = OLD.trade_id
      AND member.trade_type = OLD.trade_type
      AND batch.batch_status IN ('FORMED', 'ROLLED_BACK')
)
BEGIN
    SELECT RAISE(ABORT, 'trade linked to a completed batch is immutable');
END;

CREATE TRIGGER IF NOT EXISTS trg_formed_batch_client_trade_immutable_update
BEFORE UPDATE ON client_fx_deals
FOR EACH ROW
WHEN EXISTS
(
    SELECT 1
    FROM fx_batch_members m
    INNER JOIN fx_batches b ON b.batch_id = m.batch_id
    WHERE m.trade_id = OLD.trade_id
      AND b.batch_status IN ('FORMED', 'ROLLED_BACK')
)
BEGIN
    SELECT RAISE(ABORT, 'client trade linked to a completed batch is immutable');
END;

CREATE TRIGGER IF NOT EXISTS trg_formed_batch_client_trade_immutable_delete
BEFORE DELETE ON client_fx_deals
FOR EACH ROW
WHEN EXISTS
(
    SELECT 1
    FROM fx_batch_members m
    INNER JOIN fx_batches b ON b.batch_id = m.batch_id
    WHERE m.trade_id = OLD.trade_id
      AND b.batch_status IN ('FORMED', 'ROLLED_BACK')
)
BEGIN
    SELECT RAISE(ABORT, 'client trade linked to a completed batch is immutable');
END;

CREATE TRIGGER IF NOT EXISTS trg_formed_batch_hedge_trade_immutable_update
BEFORE UPDATE ON fx_hedge_deals
FOR EACH ROW
WHEN EXISTS
(
    SELECT 1
    FROM fx_batch_members m
    INNER JOIN fx_batches b ON b.batch_id = m.batch_id
    WHERE m.trade_id = OLD.trade_id
      AND b.batch_status IN ('FORMED', 'ROLLED_BACK')
)
BEGIN
    SELECT RAISE(ABORT, 'hedge trade linked to a completed batch is immutable');
END;

CREATE TRIGGER IF NOT EXISTS trg_formed_batch_hedge_trade_immutable_delete
BEFORE DELETE ON fx_hedge_deals
FOR EACH ROW
WHEN EXISTS
(
    SELECT 1
    FROM fx_batch_members m
    INNER JOIN fx_batches b ON b.batch_id = m.batch_id
    WHERE m.trade_id = OLD.trade_id
      AND b.batch_status IN ('FORMED', 'ROLLED_BACK')
)
BEGIN
    SELECT RAISE(ABORT, 'hedge trade linked to a completed batch is immutable');
END;

CREATE INDEX IF NOT EXISTS idx_ccy_pair_options_base
    ON ccy_pair_options (base_ccy_code);

CREATE INDEX IF NOT EXISTS idx_ccy_pair_options_quote
    ON ccy_pair_options (quote_ccy_code);

CREATE TRIGGER IF NOT EXISTS trg_client_fx_deals_require_client_insert
BEFORE INSERT ON client_fx_deals
FOR EACH ROW
WHEN NOT EXISTS
(
    SELECT 1
    FROM trading_counterparty_roles
    WHERE counterparty_id = NEW.counterparty_id AND role_code = 'CLIENT'
)
BEGIN
    SELECT RAISE(ABORT, 'client_fx_deals.counterparty_id must reference a Trading Counterparty with the CLIENT role');
END;

CREATE TRIGGER IF NOT EXISTS trg_client_fx_deals_require_client_update
BEFORE UPDATE OF counterparty_id ON client_fx_deals
FOR EACH ROW
WHEN NOT EXISTS
(
    SELECT 1
    FROM trading_counterparty_roles
    WHERE counterparty_id = NEW.counterparty_id AND role_code = 'CLIENT'
)
BEGIN
    SELECT RAISE(ABORT, 'client_fx_deals.counterparty_id must reference a Trading Counterparty with the CLIENT role');
END;

CREATE TRIGGER IF NOT EXISTS trg_trading_counterparty_roles_preserve_client_deals
BEFORE DELETE ON trading_counterparty_roles
FOR EACH ROW
WHEN OLD.role_code = 'CLIENT'
    AND EXISTS (SELECT 1 FROM client_fx_deals WHERE counterparty_id = OLD.counterparty_id)
BEGIN
    SELECT RAISE(ABORT, 'a Trading Counterparty used by client_fx_deals must retain the CLIENT role');
END;

CREATE TRIGGER IF NOT EXISTS trg_fx_hedge_deals_require_hedge_counterparty_insert
BEFORE INSERT ON fx_hedge_deals
FOR EACH ROW
WHEN NOT EXISTS
(
    SELECT 1
    FROM trading_counterparty_roles
    WHERE counterparty_id = NEW.counterparty_id AND role_code = 'HEDGE_COUNTERPARTY'
)
BEGIN
    SELECT RAISE(ABORT, 'fx_hedge_deals.counterparty_id must reference a Trading Counterparty with the HEDGE_COUNTERPARTY role');
END;

CREATE TRIGGER IF NOT EXISTS trg_fx_hedge_deals_require_hedge_counterparty_update
BEFORE UPDATE OF counterparty_id ON fx_hedge_deals
FOR EACH ROW
WHEN NOT EXISTS
(
    SELECT 1
    FROM trading_counterparty_roles
    WHERE counterparty_id = NEW.counterparty_id AND role_code = 'HEDGE_COUNTERPARTY'
)
BEGIN
    SELECT RAISE(ABORT, 'fx_hedge_deals.counterparty_id must reference a Trading Counterparty with the HEDGE_COUNTERPARTY role');
END;

CREATE TRIGGER IF NOT EXISTS trg_trading_counterparty_roles_preserve_hedge_deals
BEFORE DELETE ON trading_counterparty_roles
FOR EACH ROW
WHEN OLD.role_code = 'HEDGE_COUNTERPARTY'
    AND EXISTS (SELECT 1 FROM fx_hedge_deals WHERE counterparty_id = OLD.counterparty_id)
BEGIN
    SELECT RAISE(ABORT, 'a Trading Counterparty used by fx_hedge_deals must retain the HEDGE_COUNTERPARTY role');
END;

CREATE TRIGGER IF NOT EXISTS trg_client_deal_generation_settings_require_auto_priced_client_insert
BEFORE INSERT ON client_deal_generation_settings
FOR EACH ROW
WHEN NOT EXISTS
(
    SELECT 1
    FROM pricing_rules r
    INNER JOIN trading_counterparty_roles role
        ON role.counterparty_id = r.counterparty_id AND role.role_code = 'CLIENT'
    INNER JOIN execution_contexts c ON c.execution_context_id = r.execution_context_id
    INNER JOIN execution_systems e ON e.execution_system_id = c.execution_system_id
    WHERE r.pricing_rule_id = NEW.pricing_rule_id
      AND e.pricing_mode = 'AUTO_PRICED'
)
BEGIN
    SELECT RAISE(ABORT, 'client_deal_generation_settings.pricing_rule_id must reference an AUTO_PRICED CLIENT Pricing Rule');
END;

CREATE TRIGGER IF NOT EXISTS trg_client_deal_generation_settings_require_auto_priced_client_update
BEFORE UPDATE OF pricing_rule_id ON client_deal_generation_settings
FOR EACH ROW
WHEN NOT EXISTS
(
    SELECT 1
    FROM pricing_rules r
    INNER JOIN trading_counterparty_roles role
        ON role.counterparty_id = r.counterparty_id AND role.role_code = 'CLIENT'
    INNER JOIN execution_contexts c ON c.execution_context_id = r.execution_context_id
    INNER JOIN execution_systems e ON e.execution_system_id = c.execution_system_id
    WHERE r.pricing_rule_id = NEW.pricing_rule_id
      AND e.pricing_mode = 'AUTO_PRICED'
)
BEGIN
    SELECT RAISE(ABORT, 'client_deal_generation_settings.pricing_rule_id must reference an AUTO_PRICED CLIENT Pricing Rule');
END;

CREATE TRIGGER IF NOT EXISTS trg_pricing_rules_preserve_auto_priced_client_generation_settings
BEFORE UPDATE OF counterparty_id, execution_context_id ON pricing_rules
FOR EACH ROW
WHEN EXISTS
(
    SELECT 1
    FROM client_deal_generation_settings s
    WHERE s.pricing_rule_id = OLD.pricing_rule_id
)
AND NOT EXISTS
(
    SELECT 1
    FROM trading_counterparty_roles role
    INNER JOIN execution_contexts c ON c.execution_context_id = NEW.execution_context_id
    INNER JOIN execution_systems e ON e.execution_system_id = c.execution_system_id
    WHERE role.counterparty_id = NEW.counterparty_id
      AND role.role_code = 'CLIENT'
      AND e.pricing_mode = 'AUTO_PRICED'
)
BEGIN
    SELECT RAISE(ABORT, 'a Pricing Rule used by client_deal_generation_settings must remain an AUTO_PRICED CLIENT rule');
END;

CREATE TRIGGER IF NOT EXISTS trg_trading_counterparty_roles_preserve_auto_priced_client_generation_settings
BEFORE DELETE ON trading_counterparty_roles
FOR EACH ROW
WHEN OLD.role_code = 'CLIENT'
    AND EXISTS
    (
        SELECT 1
        FROM pricing_rules r
        INNER JOIN client_deal_generation_settings s
            ON s.pricing_rule_id = r.pricing_rule_id
        WHERE r.counterparty_id = OLD.counterparty_id
    )
BEGIN
    SELECT RAISE(ABORT, 'a Trading Counterparty used by client_deal_generation_settings must retain the CLIENT role');
END;

CREATE TRIGGER IF NOT EXISTS trg_execution_contexts_preserve_auto_priced_client_generation_settings
BEFORE UPDATE OF execution_system_id ON execution_contexts
FOR EACH ROW
WHEN EXISTS
(
    SELECT 1
    FROM pricing_rules r
    INNER JOIN client_deal_generation_settings s
        ON s.pricing_rule_id = r.pricing_rule_id
    WHERE r.execution_context_id = OLD.execution_context_id
)
AND NOT EXISTS
(
    SELECT 1
    FROM execution_systems e
    WHERE e.execution_system_id = NEW.execution_system_id
      AND e.pricing_mode = 'AUTO_PRICED'
)
BEGIN
    SELECT RAISE(ABORT, 'an Execution Context used by client_deal_generation_settings must remain AUTO_PRICED');
END;

CREATE TRIGGER IF NOT EXISTS trg_execution_systems_preserve_auto_priced_client_generation_settings
BEFORE UPDATE OF pricing_mode ON execution_systems
FOR EACH ROW
WHEN NEW.pricing_mode <> 'AUTO_PRICED'
    AND EXISTS
    (
        SELECT 1
        FROM execution_contexts c
        INNER JOIN pricing_rules r ON r.execution_context_id = c.execution_context_id
        INNER JOIN client_deal_generation_settings s
            ON s.pricing_rule_id = r.pricing_rule_id
        WHERE c.execution_system_id = OLD.execution_system_id
    )
BEGIN
    SELECT RAISE(ABORT, 'an Execution System used by client_deal_generation_settings must remain AUTO_PRICED');
END;

CREATE TRIGGER IF NOT EXISTS trg_fx_hedge_quick_mode_settings_require_auto_priced_hedge_insert
BEFORE INSERT ON fx_hedge_quick_mode_settings
FOR EACH ROW
WHEN NOT EXISTS
(
    SELECT 1
    FROM pricing_rules r
    INNER JOIN trading_counterparty_roles role
        ON role.counterparty_id = r.counterparty_id AND role.role_code = 'HEDGE_COUNTERPARTY'
    INNER JOIN execution_contexts c ON c.execution_context_id = r.execution_context_id
    INNER JOIN execution_systems e ON e.execution_system_id = c.execution_system_id
    WHERE r.pricing_rule_id = NEW.pricing_rule_id
      AND r.counterparty_id = NEW.counterparty_id
      AND r.ccy_pair_code = NEW.ccy_pair_code
      AND e.pricing_mode = 'AUTO_PRICED'
)
BEGIN
    SELECT RAISE(ABORT, 'fx_hedge_quick_mode_settings must reference an AUTO_PRICED HEDGE_COUNTERPARTY Pricing Rule for the same Ccy Pair');
END;

CREATE TRIGGER IF NOT EXISTS trg_fx_hedge_quick_mode_settings_require_auto_priced_hedge_update
BEFORE UPDATE OF pricing_rule_id, counterparty_id, ccy_pair_code ON fx_hedge_quick_mode_settings
FOR EACH ROW
WHEN NOT EXISTS
(
    SELECT 1
    FROM pricing_rules r
    INNER JOIN trading_counterparty_roles role
        ON role.counterparty_id = r.counterparty_id AND role.role_code = 'HEDGE_COUNTERPARTY'
    INNER JOIN execution_contexts c ON c.execution_context_id = r.execution_context_id
    INNER JOIN execution_systems e ON e.execution_system_id = c.execution_system_id
    WHERE r.pricing_rule_id = NEW.pricing_rule_id
      AND r.counterparty_id = NEW.counterparty_id
      AND r.ccy_pair_code = NEW.ccy_pair_code
      AND e.pricing_mode = 'AUTO_PRICED'
)
BEGIN
    SELECT RAISE(ABORT, 'fx_hedge_quick_mode_settings must reference an AUTO_PRICED HEDGE_COUNTERPARTY Pricing Rule for the same Ccy Pair');
END;

CREATE TRIGGER IF NOT EXISTS trg_fx_hedge_quick_mode_settings_require_base_precision_insert
BEFORE INSERT ON fx_hedge_quick_mode_settings
FOR EACH ROW
WHEN NOT EXISTS
(
    SELECT 1
    FROM ccy_pair_options pair
    INNER JOIN ccy_options base_ccy ON base_ccy.ccy_code = pair.base_ccy_code
    WHERE pair.ccy_pair_code = NEW.ccy_pair_code
      AND base_ccy.fraction_digits = NEW.base_ccy_fraction_digits
)
BEGIN
    SELECT RAISE(ABORT, 'fx_hedge_quick_mode_settings.base_ccy_fraction_digits must match the configured base currency precision');
END;

CREATE TRIGGER IF NOT EXISTS trg_fx_hedge_quick_mode_settings_require_base_precision_update
BEFORE UPDATE OF ccy_pair_code, base_ccy_fraction_digits ON fx_hedge_quick_mode_settings
FOR EACH ROW
WHEN NOT EXISTS
(
    SELECT 1
    FROM ccy_pair_options pair
    INNER JOIN ccy_options base_ccy ON base_ccy.ccy_code = pair.base_ccy_code
    WHERE pair.ccy_pair_code = NEW.ccy_pair_code
      AND base_ccy.fraction_digits = NEW.base_ccy_fraction_digits
)
BEGIN
    SELECT RAISE(ABORT, 'fx_hedge_quick_mode_settings.base_ccy_fraction_digits must match the configured base currency precision');
END;

CREATE TRIGGER IF NOT EXISTS trg_pricing_rules_preserve_fx_hedge_quick_mode_settings
BEFORE UPDATE OF counterparty_id, execution_context_id, ccy_pair_code ON pricing_rules
FOR EACH ROW
WHEN EXISTS
(
    SELECT 1
    FROM fx_hedge_quick_mode_settings settings
    WHERE settings.pricing_rule_id = OLD.pricing_rule_id
)
AND NOT EXISTS
(
    SELECT 1
    FROM trading_counterparty_roles role
    INNER JOIN execution_contexts c ON c.execution_context_id = NEW.execution_context_id
    INNER JOIN execution_systems e ON e.execution_system_id = c.execution_system_id
    WHERE role.counterparty_id = NEW.counterparty_id
      AND NEW.counterparty_id = (
          SELECT settings.counterparty_id
          FROM fx_hedge_quick_mode_settings settings
          WHERE settings.pricing_rule_id = OLD.pricing_rule_id
      )
      AND role.role_code = 'HEDGE_COUNTERPARTY'
      AND e.pricing_mode = 'AUTO_PRICED'
      AND NEW.ccy_pair_code = (
          SELECT settings.ccy_pair_code
          FROM fx_hedge_quick_mode_settings settings
          WHERE settings.pricing_rule_id = OLD.pricing_rule_id
      )
)
BEGIN
    SELECT RAISE(ABORT, 'a Pricing Rule used by fx_hedge_quick_mode_settings must remain an AUTO_PRICED HEDGE_COUNTERPARTY rule for the configured Ccy Pair');
END;

CREATE TRIGGER IF NOT EXISTS trg_trading_counterparty_roles_preserve_fx_hedge_quick_mode_settings
BEFORE DELETE ON trading_counterparty_roles
FOR EACH ROW
WHEN OLD.role_code = 'HEDGE_COUNTERPARTY'
    AND EXISTS
    (
        SELECT 1
        FROM fx_hedge_quick_mode_settings settings
        WHERE settings.counterparty_id = OLD.counterparty_id
    )
BEGIN
    SELECT RAISE(ABORT, 'a Trading Counterparty used by fx_hedge_quick_mode_settings must retain the HEDGE_COUNTERPARTY role');
END;

CREATE TRIGGER IF NOT EXISTS trg_execution_contexts_preserve_fx_hedge_quick_mode_settings
BEFORE UPDATE OF execution_system_id ON execution_contexts
FOR EACH ROW
WHEN EXISTS
(
    SELECT 1
    FROM pricing_rules r
    INNER JOIN fx_hedge_quick_mode_settings settings
        ON settings.pricing_rule_id = r.pricing_rule_id
    WHERE r.execution_context_id = OLD.execution_context_id
)
AND NOT EXISTS
(
    SELECT 1
    FROM execution_systems e
    WHERE e.execution_system_id = NEW.execution_system_id
      AND e.pricing_mode = 'AUTO_PRICED'
)
BEGIN
    SELECT RAISE(ABORT, 'an Execution Context used by fx_hedge_quick_mode_settings must remain AUTO_PRICED');
END;

CREATE TRIGGER IF NOT EXISTS trg_execution_systems_preserve_fx_hedge_quick_mode_settings
BEFORE UPDATE OF pricing_mode ON execution_systems
FOR EACH ROW
WHEN NEW.pricing_mode <> 'AUTO_PRICED'
    AND EXISTS
    (
        SELECT 1
        FROM execution_contexts c
        INNER JOIN pricing_rules r ON r.execution_context_id = c.execution_context_id
        INNER JOIN fx_hedge_quick_mode_settings settings
            ON settings.pricing_rule_id = r.pricing_rule_id
        WHERE c.execution_system_id = OLD.execution_system_id
    )
BEGIN
    SELECT RAISE(ABORT, 'an Execution System used by fx_hedge_quick_mode_settings must remain AUTO_PRICED');
END;

CREATE TRIGGER IF NOT EXISTS trg_ccy_options_preserve_fx_hedge_quick_mode_settings_precision
BEFORE UPDATE OF fraction_digits ON ccy_options
FOR EACH ROW
WHEN EXISTS
(
    SELECT 1
    FROM ccy_pair_options pair
    INNER JOIN fx_hedge_quick_mode_settings settings
        ON settings.ccy_pair_code = pair.ccy_pair_code
    WHERE pair.base_ccy_code = OLD.ccy_code
      AND settings.base_ccy_fraction_digits <> NEW.fraction_digits
)
BEGIN
    SELECT RAISE(ABORT, 'base currency precision used by fx_hedge_quick_mode_settings cannot be changed');
END;
