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
    ccy_pair_code TEXT PRIMARY KEY,
    bid_min       REAL NOT NULL,
    spread        REAL NOT NULL,
    bid_max       REAL NOT NULL,

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

CREATE TABLE IF NOT EXISTS trading_parties
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

CREATE TABLE IF NOT EXISTS pricing_rules
(
    pricing_rule_id     INTEGER PRIMARY KEY,
    party_id            INTEGER NOT NULL,
    execution_context_id INTEGER NOT NULL,
    ccy_pair_code       TEXT    NOT NULL,
    margin_percent      REAL    NOT NULL,

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

CREATE UNIQUE INDEX IF NOT EXISTS uq_pricing_rules_hedge_quick_mode_reference
    ON pricing_rules (pricing_rule_id, ccy_pair_code);

CREATE TABLE IF NOT EXISTS fx_hedge_quick_mode_settings
(
    ccy_pair_code                       TEXT    PRIMARY KEY,
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
    CONSTRAINT fk_fx_hedge_quick_mode_settings_rule_pair
        FOREIGN KEY (pricing_rule_id, ccy_pair_code)
            REFERENCES pricing_rules (pricing_rule_id, ccy_pair_code)
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
    trade_id             INTEGER PRIMARY KEY,
    entry_timestamp      TEXT    NOT NULL,
    trade_type           TEXT    NOT NULL,
    trade_date           TEXT    NOT NULL,
    ccy_pair_code        TEXT    NOT NULL,
    base_ccy_side        TEXT    NOT NULL,
    dealt_ccy_code       TEXT    NOT NULL,
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
    party_id                    INTEGER NOT NULL,
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
    party_id                    INTEGER NOT NULL,
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
    CONSTRAINT fk_fx_hedge_deals_party
        FOREIGN KEY (party_id)
            REFERENCES trading_parties (party_id)
            ON UPDATE RESTRICT
            ON DELETE RESTRICT,
    CONSTRAINT fk_fx_hedge_deals_execution_context
        FOREIGN KEY (execution_context_id)
            REFERENCES execution_contexts (execution_context_id)
            ON UPDATE RESTRICT
            ON DELETE RESTRICT,
    CONSTRAINT fk_fx_hedge_deals_pricing_rule_scope
        FOREIGN KEY (pricing_rule_id, party_id, execution_context_id)
            REFERENCES pricing_rules (pricing_rule_id, party_id, execution_context_id)
            ON UPDATE RESTRICT
            ON DELETE RESTRICT,
    CONSTRAINT chk_fx_hedge_deals_trade_type
        CHECK (trade_type = 'HEDGE_DEAL'),
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
        CHECK (member_role IN ('TRADE', 'BALANCE_TRADE')),
    CONSTRAINT chk_fx_batch_members_role_trade_type
        CHECK (
            member_role = 'TRADE'
            OR (member_role = 'BALANCE_TRADE'
                AND trade_type = 'BATCH_BALANCE_TRADE')
        )
);

CREATE TABLE IF NOT EXISTS fx_batch_position_output
(
    batch_id    INTEGER PRIMARY KEY,
    trade_id    INTEGER NOT NULL,
    trade_type  TEXT    NOT NULL,

    CONSTRAINT fk_fx_batch_position_output_batch
        FOREIGN KEY (batch_id)
            REFERENCES fx_batches (batch_id)
            ON UPDATE RESTRICT
            ON DELETE RESTRICT,
    CONSTRAINT fk_fx_batch_position_output_trade
        FOREIGN KEY (trade_id, trade_type)
            REFERENCES fx_trade_exposure (trade_id, trade_type)
            ON UPDATE RESTRICT
            ON DELETE RESTRICT,
    CONSTRAINT uq_fx_batch_position_output_trade
        UNIQUE (trade_id),
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

CREATE INDEX IF NOT EXISTS idx_pricing_rules_party
    ON pricing_rules (party_id);

CREATE INDEX IF NOT EXISTS idx_pricing_rules_execution_context
    ON pricing_rules (execution_context_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_pricing_rules_client_deal_reference
    ON pricing_rules (pricing_rule_id, party_id, execution_context_id);

CREATE INDEX IF NOT EXISTS idx_pricing_rules_ccy_pair
    ON pricing_rules (ccy_pair_code);

CREATE INDEX IF NOT EXISTS idx_fx_trade_exposure_entry_timestamp
    ON fx_trade_exposure (entry_timestamp);

CREATE INDEX IF NOT EXISTS idx_fx_trade_exposure_trade_type
    ON fx_trade_exposure (trade_type);

CREATE INDEX IF NOT EXISTS idx_fx_trade_exposure_trade_date
    ON fx_trade_exposure (trade_date);

CREATE INDEX IF NOT EXISTS idx_fx_trade_exposure_ccy_pair
    ON fx_trade_exposure (ccy_pair_code);

CREATE UNIQUE INDEX IF NOT EXISTS uq_fx_trade_exposure_identity
    ON fx_trade_exposure (trade_id, trade_type);

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

CREATE INDEX IF NOT EXISTS idx_client_fx_deals_party
    ON client_fx_deals (party_id);

CREATE INDEX IF NOT EXISTS idx_fx_hedge_deals_party
    ON fx_hedge_deals (party_id);

CREATE INDEX IF NOT EXISTS idx_fx_batches_status_pair
    ON fx_batches (batch_status, ccy_pair_code);

CREATE INDEX IF NOT EXISTS idx_fx_batch_members_trade
    ON fx_batch_members (trade_id, batch_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_fx_batch_members_single_balancer
    ON fx_batch_members (batch_id, member_role)
    WHERE member_role = 'BALANCE_TRADE';

CREATE UNIQUE INDEX IF NOT EXISTS uq_fx_batch_members_single_technical_origin
    ON fx_batch_members (trade_id)
    WHERE member_role = 'BALANCE_TRADE';

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
            FROM fx_batch_position_output o
            INNER JOIN fx_batches source_batch
                ON source_batch.batch_id = o.batch_id
            INNER JOIN fx_trade_exposure e
                ON e.trade_id = o.trade_id
                AND e.trade_type = o.trade_type
            WHERE o.trade_id = NEW.trade_id
              AND o.trade_type = NEW.trade_type
              AND source_batch.batch_status IN ('FORMED', 'ROLLED_BACK')
              AND e.trade_type = 'BATCH_POSITION_OUT'
              AND e.base_ccy_side IN ('BUY', 'SELL')
              AND e.trade_rate IS NOT NULL
            UNION ALL
            SELECT 1
            FROM fx_batch_members origin_member
            INNER JOIN fx_batches source_batch
                ON source_batch.batch_id = origin_member.batch_id
            INNER JOIN fx_trade_exposure e
                ON e.trade_id = origin_member.trade_id
                AND e.trade_type = origin_member.trade_type
            WHERE origin_member.trade_id = NEW.trade_id
              AND origin_member.trade_type = NEW.trade_type
              AND origin_member.member_role = 'BALANCE_TRADE'
              AND source_batch.batch_status = 'ROLLED_BACK'
              AND e.trade_type = 'BATCH_BALANCE_TRADE'
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
    )
BEGIN
    SELECT RAISE(
        ABORT,
        'trade may belong to only one active batch and source trades require a transfer rate'
    );
END;

CREATE TRIGGER IF NOT EXISTS trg_fx_batch_position_output_validate_insert
BEFORE INSERT ON fx_batch_position_output
FOR EACH ROW
WHEN NOT EXISTS
(
    SELECT 1
    FROM fx_batches b
    INNER JOIN fx_trade_exposure e ON e.trade_id = NEW.trade_id
    WHERE b.batch_id = NEW.batch_id
      AND b.batch_status = 'BUILDING'
      AND e.trade_type = NEW.trade_type
      AND e.ccy_pair_code = b.ccy_pair_code
)
BEGIN
    SELECT RAISE(ABORT, 'batch position output must match a BUILDING batch');
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
            INNER JOIN fx_trade_exposure e ON e.trade_id = m.trade_id
            WHERE m.batch_id = OLD.batch_id
              AND e.ccy_pair_code <> OLD.ccy_pair_code
        )
        OR EXISTS
        (
            SELECT 1
            FROM fx_batch_position_output o
            INNER JOIN fx_trade_exposure e ON e.trade_id = o.trade_id
            WHERE o.batch_id = OLD.batch_id
              AND e.ccy_pair_code <> OLD.ccy_pair_code
        )
        THEN RAISE(ABORT, 'formed batch trades must use the batch currency pair')
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
                INNER JOIN fx_trade_exposure e ON e.trade_id = m.trade_id
                WHERE m.batch_id = OLD.batch_id

                UNION ALL

                SELECT
                    e.trade_date,
                    e.tenor,
                    e.base_ccy_value_date,
                    e.quote_ccy_value_date
                FROM fx_batch_position_output o
                INNER JOIN fx_trade_exposure e ON e.trade_id = o.trade_id
                WHERE o.batch_id = OLD.batch_id
            )
            HAVING COUNT(DISTINCT trade_date) <> 1
                OR COUNT(DISTINCT tenor) <> 1
                OR COUNT(DISTINCT base_ccy_value_date) <> 1
                OR COUNT(DISTINCT quote_ccy_value_date) <> 1
        )
        THEN RAISE(ABORT, 'formed batch trades must use one settlement bucket')
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
                INNER JOIN fx_trade_exposure e ON e.trade_id = m.trade_id
                WHERE m.batch_id = OLD.batch_id

                UNION ALL

                SELECT
                    e.base_ccy_fraction_digits,
                    e.quote_ccy_fraction_digits
                FROM fx_batch_position_output o
                INNER JOIN fx_trade_exposure e ON e.trade_id = o.trade_id
                WHERE o.batch_id = OLD.batch_id
            )
            HAVING COUNT(DISTINCT base_ccy_fraction_digits) <> 1
                OR COUNT(DISTINCT quote_ccy_fraction_digits) <> 1
        )
        THEN RAISE(ABORT, 'formed batch trades must use one currency precision')
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
            INNER JOIN fx_trade_exposure e ON e.trade_id = m.trade_id
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
            INNER JOIN fx_trade_exposure e ON e.trade_id = m.trade_id
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
            INNER JOIN fx_trade_exposure e ON e.trade_id = m.trade_id
            WHERE m.batch_id = OLD.batch_id
              AND m.member_role = 'TRADE'
        ) <> 0
        AND NOT EXISTS
        (
            SELECT 1
            FROM fx_batch_position_output
            WHERE batch_id = OLD.batch_id
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
            INNER JOIN fx_trade_exposure e ON e.trade_id = m.trade_id
            WHERE m.batch_id = OLD.batch_id
              AND m.member_role = 'TRADE'
        ) = 0
        AND EXISTS
        (
            SELECT 1
            FROM fx_batch_position_output
            WHERE batch_id = OLD.batch_id
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
            INNER JOIN fx_trade_exposure e ON e.trade_id = m.trade_id
            WHERE m.batch_id = OLD.batch_id
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
            INNER JOIN fx_trade_exposure e ON e.trade_id = m.trade_id
            WHERE m.batch_id = OLD.batch_id
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
            INNER JOIN fx_trade_exposure e ON e.trade_id = m.trade_id
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
            FROM fx_batch_position_output o
            INNER JOIN fx_trade_exposure e ON e.trade_id = o.trade_id
            WHERE o.batch_id = OLD.batch_id
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

CREATE TRIGGER IF NOT EXISTS trg_fx_batch_position_output_immutable_update
BEFORE UPDATE ON fx_batch_position_output
FOR EACH ROW
WHEN EXISTS
(
    SELECT 1 FROM fx_batches
    WHERE batch_id = OLD.batch_id
      AND batch_status IN ('FORMED', 'ROLLED_BACK')
)
BEGIN
    SELECT RAISE(ABORT, 'completed batch position output is immutable');
END;

CREATE TRIGGER IF NOT EXISTS trg_fx_batch_position_output_immutable_delete
BEFORE DELETE ON fx_batch_position_output
FOR EACH ROW
WHEN EXISTS
(
    SELECT 1 FROM fx_batches
    WHERE batch_id = OLD.batch_id
      AND batch_status IN ('FORMED', 'ROLLED_BACK')
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
    FROM fx_batches b
    LEFT JOIN fx_batch_members m
        ON m.batch_id = b.batch_id AND m.trade_id = OLD.trade_id
    LEFT JOIN fx_batch_position_output o
        ON o.batch_id = b.batch_id AND o.trade_id = OLD.trade_id
    WHERE b.batch_status IN ('FORMED', 'ROLLED_BACK')
      AND (m.trade_id IS NOT NULL OR o.trade_id IS NOT NULL)
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
    FROM fx_batches b
    LEFT JOIN fx_batch_members m
        ON m.batch_id = b.batch_id AND m.trade_id = OLD.trade_id
    LEFT JOIN fx_batch_position_output o
        ON o.batch_id = b.batch_id AND o.trade_id = OLD.trade_id
    WHERE b.batch_status IN ('FORMED', 'ROLLED_BACK')
      AND (m.trade_id IS NOT NULL OR o.trade_id IS NOT NULL)
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

CREATE TRIGGER IF NOT EXISTS trg_client_deal_generation_settings_require_auto_priced_client_insert
BEFORE INSERT ON client_deal_generation_settings
FOR EACH ROW
WHEN NOT EXISTS
(
    SELECT 1
    FROM pricing_rules r
    INNER JOIN trading_parties p ON p.party_id = r.party_id
    INNER JOIN execution_contexts c ON c.execution_context_id = r.execution_context_id
    INNER JOIN execution_systems e ON e.execution_system_id = c.execution_system_id
    WHERE r.pricing_rule_id = NEW.pricing_rule_id
      AND p.party_type = 'CLIENT'
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
    INNER JOIN trading_parties p ON p.party_id = r.party_id
    INNER JOIN execution_contexts c ON c.execution_context_id = r.execution_context_id
    INNER JOIN execution_systems e ON e.execution_system_id = c.execution_system_id
    WHERE r.pricing_rule_id = NEW.pricing_rule_id
      AND p.party_type = 'CLIENT'
      AND e.pricing_mode = 'AUTO_PRICED'
)
BEGIN
    SELECT RAISE(ABORT, 'client_deal_generation_settings.pricing_rule_id must reference an AUTO_PRICED CLIENT Pricing Rule');
END;

CREATE TRIGGER IF NOT EXISTS trg_pricing_rules_preserve_auto_priced_client_generation_settings
BEFORE UPDATE OF party_id, execution_context_id ON pricing_rules
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
    FROM trading_parties p
    INNER JOIN execution_contexts c ON c.execution_context_id = NEW.execution_context_id
    INNER JOIN execution_systems e ON e.execution_system_id = c.execution_system_id
    WHERE p.party_id = NEW.party_id
      AND p.party_type = 'CLIENT'
      AND e.pricing_mode = 'AUTO_PRICED'
)
BEGIN
    SELECT RAISE(ABORT, 'a Pricing Rule used by client_deal_generation_settings must remain an AUTO_PRICED CLIENT rule');
END;

CREATE TRIGGER IF NOT EXISTS trg_trading_parties_preserve_auto_priced_client_generation_settings
BEFORE UPDATE OF party_type ON trading_parties
FOR EACH ROW
WHEN NEW.party_type <> 'CLIENT'
    AND EXISTS
    (
        SELECT 1
        FROM pricing_rules r
        INNER JOIN client_deal_generation_settings s
            ON s.pricing_rule_id = r.pricing_rule_id
        WHERE r.party_id = OLD.party_id
    )
BEGIN
    SELECT RAISE(ABORT, 'a Trading Party used by client_deal_generation_settings must remain a CLIENT');
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
    INNER JOIN trading_parties p ON p.party_id = r.party_id
    INNER JOIN execution_contexts c ON c.execution_context_id = r.execution_context_id
    INNER JOIN execution_systems e ON e.execution_system_id = c.execution_system_id
    WHERE r.pricing_rule_id = NEW.pricing_rule_id
      AND r.ccy_pair_code = NEW.ccy_pair_code
      AND p.party_type = 'HEDGE_COUNTERPARTY'
      AND e.pricing_mode = 'AUTO_PRICED'
)
BEGIN
    SELECT RAISE(ABORT, 'fx_hedge_quick_mode_settings must reference an AUTO_PRICED HEDGE_COUNTERPARTY Pricing Rule for the same Ccy Pair');
END;

CREATE TRIGGER IF NOT EXISTS trg_fx_hedge_quick_mode_settings_require_auto_priced_hedge_update
BEFORE UPDATE OF pricing_rule_id, ccy_pair_code ON fx_hedge_quick_mode_settings
FOR EACH ROW
WHEN NOT EXISTS
(
    SELECT 1
    FROM pricing_rules r
    INNER JOIN trading_parties p ON p.party_id = r.party_id
    INNER JOIN execution_contexts c ON c.execution_context_id = r.execution_context_id
    INNER JOIN execution_systems e ON e.execution_system_id = c.execution_system_id
    WHERE r.pricing_rule_id = NEW.pricing_rule_id
      AND r.ccy_pair_code = NEW.ccy_pair_code
      AND p.party_type = 'HEDGE_COUNTERPARTY'
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
BEFORE UPDATE OF party_id, execution_context_id, ccy_pair_code ON pricing_rules
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
    FROM trading_parties p
    INNER JOIN execution_contexts c ON c.execution_context_id = NEW.execution_context_id
    INNER JOIN execution_systems e ON e.execution_system_id = c.execution_system_id
    WHERE p.party_id = NEW.party_id
      AND p.party_type = 'HEDGE_COUNTERPARTY'
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

CREATE TRIGGER IF NOT EXISTS trg_trading_parties_preserve_fx_hedge_quick_mode_settings
BEFORE UPDATE OF party_type ON trading_parties
FOR EACH ROW
WHEN NEW.party_type <> 'HEDGE_COUNTERPARTY'
    AND EXISTS
    (
        SELECT 1
        FROM pricing_rules r
        INNER JOIN fx_hedge_quick_mode_settings settings
            ON settings.pricing_rule_id = r.pricing_rule_id
        WHERE r.party_id = OLD.party_id
    )
BEGIN
    SELECT RAISE(ABORT, 'a Trading Party used by fx_hedge_quick_mode_settings must remain a HEDGE_COUNTERPARTY');
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
