CREATE TABLE IF NOT EXISTS auto_management_admission_decisions
(
    decision_id       INTEGER PRIMARY KEY,
    trade_id          INTEGER NOT NULL,
    trade_type        TEXT    NOT NULL DEFAULT 'CLIENT_DEAL',
    decision_sequence INTEGER NOT NULL DEFAULT 1,
    decision_stage    TEXT    NOT NULL DEFAULT 'INITIAL',
    admission_mode    TEXT,
    admission_state   TEXT    NOT NULL,
    releasable        INTEGER NOT NULL,
    reason_codes_json TEXT    NOT NULL,
    checks_json       TEXT    NOT NULL,
    is_enforced       INTEGER NOT NULL DEFAULT 0,
    decided_at        TEXT    NOT NULL
        DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),

    CONSTRAINT fk_auto_management_admission_decisions_trade
        FOREIGN KEY (trade_id, trade_type)
            REFERENCES trade_exposures (trade_id, trade_type)
            ON UPDATE RESTRICT
            ON DELETE RESTRICT,
    CONSTRAINT uq_auto_management_admission_decisions_sequence
        UNIQUE (trade_id, trade_type, decision_sequence),
    CONSTRAINT chk_auto_management_admission_decisions_trade_type
        CHECK (trade_type IN ('CLIENT_DEAL', 'HEDGE_DEAL')),
    CONSTRAINT chk_auto_management_admission_decisions_sequence
        CHECK (typeof(decision_sequence) = 'integer' AND decision_sequence >= 1),
    CONSTRAINT chk_auto_management_admission_decisions_stage
        CHECK (decision_stage IN ('INITIAL', 'RELEASE')),
    CONSTRAINT chk_auto_management_admission_decisions_mode
        CHECK (
            admission_mode IS NULL
            OR admission_mode IN
                ('AUTO_IF_ELIGIBLE', 'MANUAL', 'MANUAL_ONLY')
        ),
    CONSTRAINT chk_auto_management_admission_decisions_state
        CHECK (admission_state IN ('HELD', 'RELEASED')),
    CONSTRAINT chk_auto_management_admission_decisions_releasable
        CHECK (typeof(releasable) = 'integer' AND releasable IN (0, 1)),
    CONSTRAINT chk_auto_management_admission_decisions_reason_codes
        CHECK (
            length(reason_codes_json) BETWEEN 2 AND 4000
            AND json_valid(reason_codes_json) = 1
            AND json_type(reason_codes_json) = 'array'
        ),
    CONSTRAINT chk_auto_management_admission_decisions_checks
        CHECK (
            length(checks_json) BETWEEN 2 AND 16000
            AND json_valid(checks_json) = 1
            AND json_type(checks_json) = 'array'
        ),
    CONSTRAINT chk_auto_management_admission_decisions_enforcement
        CHECK (typeof(is_enforced) = 'integer' AND is_enforced IN (0, 1)),
    CONSTRAINT chk_auto_management_admission_decisions_decided_at
        CHECK (
            length(decided_at) = 24
            AND decided_at GLOB '????-??-??T??:??:??.???Z'
            AND strftime('%Y-%m-%dT%H:%M:%fZ', decided_at) = decided_at
        )
);

CREATE INDEX IF NOT EXISTS idx_auto_management_admission_decisions_trade
    ON auto_management_admission_decisions
        (trade_id, trade_type, decision_sequence);

CREATE TRIGGER IF NOT EXISTS trg_auto_management_admission_decisions_immutable_update
BEFORE UPDATE ON auto_management_admission_decisions
FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'AUTO_MANAGEMENT_ADMISSION_DECISION_IMMUTABLE');
END;

CREATE TRIGGER IF NOT EXISTS trg_auto_management_admission_decisions_immutable_delete
BEFORE DELETE ON auto_management_admission_decisions
FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'AUTO_MANAGEMENT_ADMISSION_DECISION_IMMUTABLE');
END;

