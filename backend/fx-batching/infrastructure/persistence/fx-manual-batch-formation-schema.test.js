"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { DatabaseSync } = require("node:sqlite");

function databaseWithCanonicalSchema() {
  const database = new DatabaseSync(":memory:");
  const repositoryRoot = path.resolve(__dirname, "..", "..", "..", "..");
  database.exec("PRAGMA foreign_keys = ON");
  database.exec(fs.readFileSync(path.join(repositoryRoot, "schema.sql"), "utf8"));
  database.exec(fs.readFileSync(path.join(repositoryRoot, "seed.sql"), "utf8"));
  database.exec("DROP TRIGGER trg_fx_batch_members_validate_insert");
  return database;
}

function insertExposure(database, tradeId) {
  database.prepare(`
    INSERT INTO fx_trade_exposure
      (
        trade_id,
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
      (?, '2026-08-09T10:00:00.000Z', '2026-08-09T10:00:00.000Z',
       'CLIENT_DEAL', '2026-08-09', 'EUR_USD', 'SELL', 'EUR',
       10000, 2, 11200, 2, 1.12, 'TOD', '2026-08-09', '2026-08-09')
  `).run(tradeId);
}

function createFormation(database, idempotencyKey, tradeIds) {
  return Number(database.prepare(`
    INSERT INTO fx_manual_batch_formations
      (idempotency_key, selection_mode, trade_ids_json, batch_count)
    VALUES (?, 'SINGLE_BATCH', ?, 1)
  `).run(idempotencyKey, JSON.stringify(tradeIds)).lastInsertRowid);
}

function insertFormedBatch(database, {
  idempotencyKey,
  formationReasonCode = "MANUAL_SELECTION"
}) {
  if (formationReasonCode === "MANUAL_SELECTION") {
    return Number(database.prepare(`
      INSERT INTO fx_batches
        (idempotency_key, ccy_pair_code, batch_status, formation_reason_code)
      VALUES (?, 'EUR_USD', 'FORMED', 'MANUAL_SELECTION')
    `).run(idempotencyKey).lastInsertRowid);
  }

  return Number(database.prepare(`
    INSERT INTO fx_batches
      (
        idempotency_key,
        ccy_pair_code,
        batch_status,
        formation_reason_code,
        window_opened_at,
        window_closed_at,
        created_at
      )
    VALUES
      (?, 'EUR_USD', 'FORMED', ?,
       '2026-08-09T09:59:00.000Z', '2026-08-09T10:00:00.000Z',
       '2026-08-09T10:00:00.001Z')
  `).run(idempotencyKey, formationReasonCode).lastInsertRowid);
}

function linkBatch(database, formationId, batchId) {
  database.prepare(`
    INSERT INTO fx_manual_batch_formation_batches
      (formation_id, batch_ordinal, tenor, batch_id)
    VALUES (?, 1, 'TOD', ?)
  `).run(formationId, batchId);
}

function addSourceMember(database, batchId, tradeId) {
  database.prepare(`
    INSERT INTO fx_batch_members
      (batch_id, trade_id, trade_type, member_role)
    VALUES (?, ?, 'CLIENT_DEAL', 'TRADE')
  `).run(batchId, tradeId);
}

function completeFormation(database, formationId) {
  database.prepare(`
    UPDATE fx_manual_batch_formations
    SET operation_status = 'COMPLETED',
        completed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE formation_id = ?
  `).run(formationId);
}

test("manual formation accepts only its own manual child batch", () => {
  const database = databaseWithCanonicalSchema();

  try {
    const wrongKeyFormationId = createFormation(
      database,
      "manual-root-wrong-key",
      [9001]
    );
    const wrongKeyBatchId = insertFormedBatch(database, {
      idempotencyKey: "another-manual-batch"
    });

    assert.throws(
      () => linkBatch(database, wrongKeyFormationId, wrongKeyBatchId),
      /manual batching operation does not accept this batch/
    );

    const wrongReasonFormationId = createFormation(
      database,
      "manual-root-wrong-reason",
      [9001]
    );
    const wrongReasonBatchId = insertFormedBatch(database, {
      idempotencyKey: `__fx_manual_batch__:${wrongReasonFormationId}:1`,
      formationReasonCode: "MAX_INTERVAL_REACHED"
    });

    assert.throws(
      () => linkBatch(database, wrongReasonFormationId, wrongReasonBatchId),
      /manual batching operation does not accept this batch/
    );
  } finally {
    database.close();
  }
});

test("manual formation completes only with its exact source Trade set", () => {
  const database = databaseWithCanonicalSchema();

  try {
    insertExposure(database, 9001);
    insertExposure(database, 9002);

    const incompleteFormationId = createFormation(
      database,
      "manual-root-incomplete-members",
      [9001, 9002]
    );
    const incompleteBatchId = insertFormedBatch(database, {
      idempotencyKey: `__fx_manual_batch__:${incompleteFormationId}:1`
    });
    addSourceMember(database, incompleteBatchId, 9001);
    linkBatch(database, incompleteFormationId, incompleteBatchId);

    assert.throws(
      () => completeFormation(database, incompleteFormationId),
      /manual batching operation has incomplete batch results/
    );

    const exactFormationId = createFormation(
      database,
      "manual-root-exact-members",
      [9001]
    );
    const exactBatchId = insertFormedBatch(database, {
      idempotencyKey: `__fx_manual_batch__:${exactFormationId}:1`
    });
    addSourceMember(database, exactBatchId, 9001);
    linkBatch(database, exactFormationId, exactBatchId);
    completeFormation(database, exactFormationId);

    assert.equal(
      database.prepare(`
        SELECT operation_status
        FROM fx_manual_batch_formations
        WHERE formation_id = ?
      `).get(exactFormationId).operation_status,
      "COMPLETED"
    );
  } finally {
    database.close();
  }
});
