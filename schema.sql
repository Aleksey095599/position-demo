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

CREATE TABLE IF NOT EXISTS client_deal_generation_settings
(
    pricing_rule_id         INTEGER PRIMARY KEY,
    min_base_ccy_amount     NUMERIC NOT NULL,
    max_base_ccy_amount     NUMERIC NOT NULL,
    base_ccy_amount_step    NUMERIC NOT NULL,
    buy_probability_percent INTEGER NOT NULL DEFAULT 50,
    is_active               INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT fk_client_deal_generation_settings_pricing_rule
        FOREIGN KEY (pricing_rule_id)
            REFERENCES pricing_rules (pricing_rule_id)
            ON UPDATE RESTRICT
            ON DELETE CASCADE,
    CONSTRAINT chk_client_deal_generation_settings_amounts
        CHECK (
            typeof(min_base_ccy_amount) IN ('integer', 'real')
            AND min_base_ccy_amount > 0
            AND typeof(max_base_ccy_amount) IN ('integer', 'real')
            AND max_base_ccy_amount >= min_base_ccy_amount
            AND typeof(base_ccy_amount_step) IN ('integer', 'real')
            AND base_ccy_amount_step > 0
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
    side                 TEXT    NOT NULL,
    base_ccy_amount      NUMERIC NOT NULL,
    quote_ccy_amount     NUMERIC NOT NULL,
    trade_rate           NUMERIC NOT NULL,
    tenor                TEXT    NOT NULL,
    base_ccy_value_date  TEXT    NOT NULL,
    quote_ccy_value_date TEXT    NOT NULL,

    CONSTRAINT fk_fx_trade_exposure_ccy_pair
        FOREIGN KEY (ccy_pair_code)
            REFERENCES ccy_pair_options (ccy_pair_code)
            ON UPDATE RESTRICT
            ON DELETE RESTRICT,
    CONSTRAINT chk_fx_trade_exposure_entry_timestamp
        CHECK (
            length(entry_timestamp) = 24
            AND entry_timestamp GLOB '????-??-??T??:??:??.???Z'
            AND strftime('%Y-%m-%dT%H:%M:%fZ', entry_timestamp) = entry_timestamp
        ),
    CONSTRAINT chk_fx_trade_exposure_trade_type
        CHECK (trade_type IN ('CLIENT_DEAL', 'HEDGE_DEAL')),
    CONSTRAINT chk_fx_trade_exposure_trade_date
        CHECK (
            trade_date GLOB '????-??-??'
            AND strftime('%Y-%m-%d', trade_date) = trade_date
        ),
    CONSTRAINT chk_fx_trade_exposure_side
        CHECK (side IN ('BUY', 'SELL')),
    CONSTRAINT chk_fx_trade_exposure_amounts_and_rate
        CHECK (
            typeof(base_ccy_amount) IN ('integer', 'real')
            AND base_ccy_amount > 0
            AND typeof(quote_ccy_amount) IN ('integer', 'real')
            AND quote_ccy_amount > 0
            AND typeof(trade_rate) IN ('integer', 'real')
            AND trade_rate > 0
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
    analytical_pnl              NUMERIC,
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
    CONSTRAINT chk_client_fx_deals_analytical_pnl
        CHECK (
            analytical_pnl IS NULL
            OR typeof(analytical_pnl) IN ('integer', 'real')
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
    analytical_pnl              NUMERIC,

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
    CONSTRAINT chk_fx_hedge_deals_analytical_pnl
        CHECK (
            analytical_pnl IS NULL
            OR typeof(analytical_pnl) IN ('integer', 'real')
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

CREATE INDEX IF NOT EXISTS idx_client_fx_deals_party
    ON client_fx_deals (party_id);

CREATE INDEX IF NOT EXISTS idx_fx_hedge_deals_party
    ON fx_hedge_deals (party_id);

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
