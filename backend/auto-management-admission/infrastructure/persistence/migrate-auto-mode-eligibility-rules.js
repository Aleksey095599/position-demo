"use strict";

function tableExists(sqlite, tableName) {
  return Boolean(sqlite.prepare(`
    SELECT 1 AS present
    FROM sqlite_master
    WHERE type = 'table' AND name = ?
  `).get(tableName));
}

function columnNames(sqlite, tableName) {
  return new Set(sqlite.prepare(`PRAGMA table_info("${tableName}")`).all()
    .map(column => column.name));
}

function autoModeEligibilityRulesNeedRebuild(sqlite) {
  if (!tableExists(sqlite, "auto_mode_eligibility_rules")) {
    return false;
  }

  const definition = String(sqlite.prepare(`
    SELECT sql
    FROM sqlite_master
    WHERE type = 'table' AND name = 'auto_mode_eligibility_rules'
  `).get()?.sql || "").toUpperCase();

  return !definition.includes("CHK_AUTO_MODE_ELIGIBILITY_RULES_TRADE_TYPE")
    || definition.includes("'BATCH_BALANCE_TRADE'");
}

function rebuildAutoModeEligibilityRulesWithoutBatchBalanceTrade(sqlite) {
  if (!autoModeEligibilityRulesNeedRebuild(sqlite)) {
    return;
  }

  sqlite.exec(`
    CREATE TABLE __auto_mode_eligibility_rules_without_batch_balance
    (
        trade_type                          TEXT    NOT NULL,
        ccy_pair_code                       TEXT    NOT NULL,
        is_eligible                         INTEGER NOT NULL,
        max_base_ccy_amount_minor           INTEGER,
        max_transfer_rate_deviation_percent TEXT,

        CONSTRAINT pk_auto_mode_eligibility_rules
            PRIMARY KEY (trade_type, ccy_pair_code),
        CONSTRAINT fk_auto_mode_eligibility_rules_pair
            FOREIGN KEY (ccy_pair_code)
                REFERENCES ccy_pair_options (ccy_pair_code)
                ON UPDATE RESTRICT
                ON DELETE RESTRICT,
        CONSTRAINT chk_auto_mode_eligibility_rules_trade_type
            CHECK (
                trade_type IN
                    ('CLIENT_DEAL', 'HEDGE_DEAL', 'BATCH_POSITION_OUT')
            ),
        CONSTRAINT chk_auto_mode_eligibility_rules_eligible
            CHECK (typeof(is_eligible) = 'integer' AND is_eligible IN (0, 1)),
        CONSTRAINT chk_auto_mode_eligibility_rules_requirements
            CHECK (
                (
                    is_eligible = 0
                    AND max_base_ccy_amount_minor IS NULL
                    AND max_transfer_rate_deviation_percent IS NULL
                )
                OR
                (
                    is_eligible = 1
                    AND typeof(max_base_ccy_amount_minor) = 'integer'
                    AND max_base_ccy_amount_minor > 0
                    AND typeof(max_transfer_rate_deviation_percent) = 'text'
                    AND length(max_transfer_rate_deviation_percent) BETWEEN 1 AND 32
                    AND max_transfer_rate_deviation_percent GLOB '[0-9]*'
                    AND max_transfer_rate_deviation_percent NOT GLOB '*[^0-9.]*'
                    AND length(max_transfer_rate_deviation_percent)
                        - length(replace(max_transfer_rate_deviation_percent, '.', '')) <= 1
                    AND substr(max_transfer_rate_deviation_percent, -1, 1) <> '.'
                    AND CAST(max_transfer_rate_deviation_percent AS REAL) BETWEEN 0 AND 100
                )
            )
    ) WITHOUT ROWID;

    INSERT INTO __auto_mode_eligibility_rules_without_batch_balance
      (
        trade_type,
        ccy_pair_code,
        is_eligible,
        max_base_ccy_amount_minor,
        max_transfer_rate_deviation_percent
      )
    SELECT
      trade_type,
      ccy_pair_code,
      is_eligible,
      max_base_ccy_amount_minor,
      max_transfer_rate_deviation_percent
    FROM auto_mode_eligibility_rules
    WHERE trade_type IN ('CLIENT_DEAL', 'HEDGE_DEAL', 'BATCH_POSITION_OUT');

    DROP TABLE auto_mode_eligibility_rules;
    ALTER TABLE __auto_mode_eligibility_rules_without_batch_balance
      RENAME TO auto_mode_eligibility_rules;
  `);
}

function rebuildAdmissionDecisionsWithoutPolicyRevision(sqlite) {
  if (!tableExists(sqlite, "auto_management_admission_decisions")
    || !columnNames(sqlite, "auto_management_admission_decisions").has("policy_revision")) {
    return;
  }

  sqlite.exec(`
    DROP TRIGGER IF EXISTS trg_auto_management_admission_decisions_immutable_update;
    DROP TRIGGER IF EXISTS trg_auto_management_admission_decisions_immutable_delete;
    DROP INDEX IF EXISTS idx_auto_management_admission_decisions_trade;
    DROP INDEX IF EXISTS idx_auto_management_admission_decisions_policy_revision;

    CREATE TABLE __auto_management_admission_decisions_without_revision
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
                OR admission_mode IN ('AUTO_IF_ELIGIBLE', 'REVIEW_REQUIRED')
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

    INSERT INTO __auto_management_admission_decisions_without_revision
      (
        decision_id,
        trade_id,
        trade_type,
        decision_sequence,
        decision_stage,
        admission_mode,
        admission_state,
        releasable,
        reason_codes_json,
        checks_json,
        is_enforced,
        decided_at
      )
    SELECT
      decision_id,
      trade_id,
      trade_type,
      decision_sequence,
      decision_stage,
      CASE WHEN admission_mode = 'MANUAL_ONLY' THEN 'REVIEW_REQUIRED' ELSE admission_mode END,
      admission_state,
      releasable,
      reason_codes_json,
      checks_json,
      is_enforced,
      decided_at
    FROM auto_management_admission_decisions;

    DROP TABLE auto_management_admission_decisions;
    ALTER TABLE __auto_management_admission_decisions_without_revision
      RENAME TO auto_management_admission_decisions;
  `);
}

function copyCurrentRules(sqlite) {
  const legacyTables = [
    "auto_management_admission_policy_current",
    "auto_management_admission_policy_pair_deviations",
    "auto_management_admission_policy_pair_rules"
  ];
  if (!legacyTables.every(tableName => tableExists(sqlite, tableName))) {
    return;
  }

  const currentColumns = columnNames(sqlite, "auto_management_admission_policy_current");
  const scopedByTradeType = currentColumns.has("trade_type");
  const currentScope = scopedByTradeType
    ? "current.trade_type"
    : "trade_type.trade_type";
  const currentJoin = scopedByTradeType
    ? ""
    : "CROSS JOIN (SELECT 'CLIENT_DEAL' AS trade_type UNION ALL SELECT 'HEDGE_DEAL') trade_type";

  sqlite.exec(`
    INSERT OR REPLACE INTO auto_mode_eligibility_rules
      (
        trade_type,
        ccy_pair_code,
        is_eligible,
        max_base_ccy_amount_minor,
        max_transfer_rate_deviation_percent
      )
    SELECT
      ${currentScope},
      pair.ccy_pair_code,
      CASE WHEN rule.ccy_pair_code IS NULL THEN 0 ELSE 1 END,
      rule.max_base_ccy_amount_minor,
      CASE
        WHEN rule.ccy_pair_code IS NULL THEN NULL
        ELSE deviation.max_transfer_rate_deviation_percent
      END
    FROM auto_management_admission_policy_current current
    ${currentJoin}
    CROSS JOIN ccy_pair_options pair
    LEFT JOIN auto_management_admission_policy_pair_rules rule
      ON rule.revision = current.revision
      AND rule.ccy_pair_code = pair.ccy_pair_code
    LEFT JOIN auto_management_admission_policy_pair_deviations deviation
      ON deviation.revision = current.revision
      AND deviation.ccy_pair_code = pair.ccy_pair_code;
  `);
}

function dropLegacyPolicyTables(sqlite) {
  sqlite.exec(`
    DROP TABLE IF EXISTS auto_management_admission_policy_current;
    DROP TABLE IF EXISTS auto_management_admission_policy_pair_rules;
    DROP TABLE IF EXISTS auto_management_admission_policy_pair_deviations;
    DROP TABLE IF EXISTS auto_management_admission_policy_revisions;
  `);
}

function ensureRuleMatrix(sqlite) {
  sqlite.exec(`
    INSERT OR IGNORE INTO auto_mode_eligibility_rules
      (
        trade_type,
        ccy_pair_code,
        is_eligible,
        max_base_ccy_amount_minor,
        max_transfer_rate_deviation_percent
      )
    SELECT trade_type.trade_type, pair.ccy_pair_code, 0, NULL, NULL
    FROM
      (
        SELECT 'CLIENT_DEAL' AS trade_type
        UNION ALL SELECT 'HEDGE_DEAL'
        UNION ALL SELECT 'BATCH_POSITION_OUT'
      ) trade_type
    CROSS JOIN ccy_pair_options pair;
  `);
}

function migrateAutoModeEligibilityRules(sqlite) {
  const hasLegacyPolicy = tableExists(sqlite, "auto_management_admission_policy_current")
    || tableExists(sqlite, "auto_management_admission_policy_pair_deviations")
    || tableExists(sqlite, "auto_management_admission_policy_pair_rules")
    || tableExists(sqlite, "auto_management_admission_policy_revisions");
  const admissionDecisionsHaveRevision = tableExists(sqlite, "auto_management_admission_decisions")
    && columnNames(sqlite, "auto_management_admission_decisions").has("policy_revision");
  const eligibilityRulesNeedRebuild =
    autoModeEligibilityRulesNeedRebuild(sqlite);

  if (
    !hasLegacyPolicy
    && !admissionDecisionsHaveRevision
    && !eligibilityRulesNeedRebuild
  ) {
    return;
  }

  const foreignKeys = sqlite.prepare("PRAGMA foreign_keys").get().foreign_keys;
  sqlite.exec("PRAGMA foreign_keys = OFF");
  try {
    sqlite.exec("BEGIN IMMEDIATE");
    copyCurrentRules(sqlite);
    ensureRuleMatrix(sqlite);
    rebuildAutoModeEligibilityRulesWithoutBatchBalanceTrade(sqlite);
    rebuildAdmissionDecisionsWithoutPolicyRevision(sqlite);
    dropLegacyPolicyTables(sqlite);
    if (sqlite.prepare("PRAGMA foreign_key_check").all().length > 0
      || sqlite.prepare("PRAGMA quick_check").get().quick_check !== "ok") {
      throw new Error("Auto Mode Eligibility migration failed the database integrity check.");
    }
    sqlite.exec("COMMIT");
  } catch (error) {
    sqlite.exec("ROLLBACK");
    throw error;
  } finally {
    sqlite.exec(`PRAGMA foreign_keys = ${foreignKeys ? "ON" : "OFF"}`);
  }
}

module.exports = { migrateAutoModeEligibilityRules };
