"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { DatabaseSync } = require("node:sqlite");
const {
  migrateAutoModeEligibilityRules
} = require("./migrate-auto-mode-eligibility-rules");

function legacyDatabase() {
  const database = new DatabaseSync(":memory:");
  database.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE ccy_pair_options
    (
      ccy_pair_code TEXT PRIMARY KEY
    );
    INSERT INTO ccy_pair_options VALUES ('EUR_USD'), ('GBP_USD');

    CREATE TABLE auto_mode_eligibility_rules
    (
      trade_type TEXT NOT NULL,
      ccy_pair_code TEXT NOT NULL,
      is_eligible INTEGER NOT NULL,
      max_base_ccy_amount_minor INTEGER,
      max_transfer_rate_deviation_percent TEXT,
      PRIMARY KEY (trade_type, ccy_pair_code),
      FOREIGN KEY (ccy_pair_code) REFERENCES ccy_pair_options (ccy_pair_code),
      CHECK (is_eligible IN (0, 1))
    ) WITHOUT ROWID;

    CREATE TABLE auto_management_admission_policy_revisions
    (
      revision INTEGER PRIMARY KEY
    );
    CREATE TABLE auto_management_admission_policy_pair_deviations
    (
      revision INTEGER NOT NULL,
      ccy_pair_code TEXT NOT NULL,
      max_transfer_rate_deviation_percent TEXT NOT NULL,
      PRIMARY KEY (revision, ccy_pair_code),
      FOREIGN KEY (revision) REFERENCES auto_management_admission_policy_revisions (revision),
      FOREIGN KEY (ccy_pair_code) REFERENCES ccy_pair_options (ccy_pair_code)
    ) WITHOUT ROWID;
    CREATE TABLE auto_management_admission_policy_pair_rules
    (
      revision INTEGER NOT NULL,
      ccy_pair_code TEXT NOT NULL,
      max_base_ccy_amount_minor INTEGER NOT NULL,
      base_ccy_fraction_digits INTEGER NOT NULL,
      PRIMARY KEY (revision, ccy_pair_code),
      FOREIGN KEY (revision) REFERENCES auto_management_admission_policy_revisions (revision),
      FOREIGN KEY (ccy_pair_code) REFERENCES ccy_pair_options (ccy_pair_code)
    ) WITHOUT ROWID;
    CREATE TABLE auto_management_admission_policy_current
    (
      trade_type TEXT PRIMARY KEY,
      revision INTEGER NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (revision) REFERENCES auto_management_admission_policy_revisions (revision)
    );

    INSERT INTO auto_management_admission_policy_revisions VALUES (1), (2);
    INSERT INTO auto_management_admission_policy_pair_deviations VALUES
      (1, 'EUR_USD', '1.00'), (1, 'GBP_USD', '1.10'),
      (2, 'EUR_USD', '2.00'), (2, 'GBP_USD', '2.10');
    INSERT INTO auto_management_admission_policy_pair_rules VALUES
      (1, 'EUR_USD', 10000, 2),
      (2, 'GBP_USD', 20000, 2);
    INSERT INTO auto_management_admission_policy_current VALUES
      ('CLIENT_DEAL', 1, '2026-09-11T00:00:00.000Z'),
      ('HEDGE_DEAL', 2, '2026-09-11T00:00:00.000Z');

    CREATE TABLE trade_exposures
    (
      trade_id INTEGER NOT NULL,
      trade_type TEXT NOT NULL,
      PRIMARY KEY (trade_id, trade_type)
    );
    INSERT INTO trade_exposures VALUES (1, 'CLIENT_DEAL');
    CREATE TABLE auto_management_admission_decisions
    (
      decision_id INTEGER PRIMARY KEY,
      trade_id INTEGER NOT NULL,
      trade_type TEXT NOT NULL,
      decision_sequence INTEGER NOT NULL,
      decision_stage TEXT NOT NULL,
      policy_revision INTEGER NOT NULL,
      admission_mode TEXT,
      admission_state TEXT NOT NULL,
      releasable INTEGER NOT NULL,
      reason_codes_json TEXT NOT NULL,
      checks_json TEXT NOT NULL,
      is_enforced INTEGER NOT NULL,
      decided_at TEXT NOT NULL,
      FOREIGN KEY (trade_id, trade_type) REFERENCES trade_exposures (trade_id, trade_type),
      FOREIGN KEY (policy_revision) REFERENCES auto_management_admission_policy_revisions (revision)
    );
    INSERT INTO auto_management_admission_decisions VALUES
      (1, 1, 'CLIENT_DEAL', 1, 'INITIAL', 1, 'REVIEW_REQUIRED', 'HELD', 1,
       '["REVIEW_REQUIRED"]', '[]', 1, '2026-09-11T00:00:00.000Z');
    CREATE INDEX idx_auto_management_admission_decisions_policy_revision
      ON auto_management_admission_decisions (policy_revision, decision_id);
  `);
  return database;
}

test("migrates active rules and removes the revisioned policy schema", () => {
  const database = legacyDatabase();
  try {
    migrateAutoModeEligibilityRules(database);

    assert.deepEqual(
      database.prepare(`
        SELECT
          trade_type AS tradeType,
          ccy_pair_code AS ccyPairCode,
          is_eligible AS isEligible,
          max_base_ccy_amount_minor AS maxAmountMinor,
          max_transfer_rate_deviation_percent AS maxDeviation
        FROM auto_mode_eligibility_rules
        ORDER BY trade_type, ccy_pair_code
      `).all().map(row => ({ ...row })),
      [
        { tradeType: "BATCH_POSITION_OUT", ccyPairCode: "EUR_USD", isEligible: 0, maxAmountMinor: null, maxDeviation: null },
        { tradeType: "BATCH_POSITION_OUT", ccyPairCode: "GBP_USD", isEligible: 0, maxAmountMinor: null, maxDeviation: null },
        { tradeType: "CLIENT_DEAL", ccyPairCode: "EUR_USD", isEligible: 1, maxAmountMinor: 10000, maxDeviation: "1.00" },
        { tradeType: "CLIENT_DEAL", ccyPairCode: "GBP_USD", isEligible: 0, maxAmountMinor: null, maxDeviation: null },
        { tradeType: "HEDGE_DEAL", ccyPairCode: "EUR_USD", isEligible: 0, maxAmountMinor: null, maxDeviation: null },
        { tradeType: "HEDGE_DEAL", ccyPairCode: "GBP_USD", isEligible: 1, maxAmountMinor: 20000, maxDeviation: "2.10" }
      ]
    );
    assert.deepEqual(
      database.prepare(`
        SELECT name FROM sqlite_master
        WHERE type = 'table' AND name LIKE 'auto_management_admission_policy_%'
      `).all(),
      []
    );
    assert.equal(
      database.prepare("PRAGMA table_info(auto_management_admission_decisions)").all()
        .some(column => column.name === "policy_revision"),
      false
    );
    assert.equal(
      database.prepare("SELECT COUNT(*) AS count FROM auto_management_admission_decisions").get().count,
      1
    );
    assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
    assert.throws(
      () => database.prepare(`
        INSERT INTO auto_mode_eligibility_rules
          (
            trade_type,
            ccy_pair_code,
            is_eligible,
            max_base_ccy_amount_minor,
            max_transfer_rate_deviation_percent
          )
        VALUES ('BATCH_BALANCE_TRADE', 'EUR_USD', 0, NULL, NULL)
      `).run(),
      /chk_auto_mode_eligibility_rules_trade_type|CHECK constraint failed/
    );

    const snapshot = database.prepare(`
      SELECT * FROM auto_mode_eligibility_rules ORDER BY trade_type, ccy_pair_code
    `).all();
    migrateAutoModeEligibilityRules(database);
    assert.deepEqual(
      database.prepare(`
        SELECT * FROM auto_mode_eligibility_rules ORDER BY trade_type, ccy_pair_code
      `).all(),
      snapshot
    );
  } finally {
    database.close();
  }
});
