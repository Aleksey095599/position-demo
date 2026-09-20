"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { DatabaseSync } = require("node:sqlite");
const {
  migrateLegacyManualBatchFormations
} = require("./migrate-legacy-manual-batch-formations");

function legacyDatabase() {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");
  database.exec(`
    CREATE TABLE batches
    (
      batch_id INTEGER PRIMARY KEY,
      idempotency_key TEXT NOT NULL UNIQUE,
      batch_status TEXT NOT NULL,
      formation_reason_code TEXT NOT NULL,
      formation_reason_details_json TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE batch_members
    (
      batch_id INTEGER NOT NULL,
      trade_id INTEGER NOT NULL,
      member_role TEXT NOT NULL,
      PRIMARY KEY (batch_id, trade_id),
      FOREIGN KEY (batch_id) REFERENCES batches (batch_id)
    );

    CREATE TABLE manual_batch_formations
    (
      formation_id INTEGER PRIMARY KEY,
      idempotency_key TEXT NOT NULL UNIQUE,
      selection_mode TEXT NOT NULL,
      trade_ids_json TEXT NOT NULL,
      batch_count INTEGER NOT NULL,
      operation_status TEXT NOT NULL
    );

    CREATE TABLE manual_batch_formation_batches
    (
      formation_id INTEGER NOT NULL,
      batch_ordinal INTEGER NOT NULL,
      batch_id INTEGER NOT NULL UNIQUE,
      PRIMARY KEY (formation_id, batch_ordinal),
      FOREIGN KEY (formation_id)
        REFERENCES manual_batch_formations (formation_id),
      FOREIGN KEY (batch_id) REFERENCES batches (batch_id)
    );
  `);
  return database;
}

function insertBatch(database, {
  batchId,
  formationId,
  batchOrdinal,
  tradeIds,
  idempotencyKey = `__fx_manual_batch__:${formationId}:${batchOrdinal}`
}) {
  database.prepare(`
    INSERT INTO batches
      (
        batch_id,
        idempotency_key,
        batch_status,
        formation_reason_code,
        formation_reason_details_json
      )
    VALUES (?, ?, 'FORMED', 'MANUAL_SELECTION', ?)
  `).run(
    batchId,
    idempotencyKey,
    JSON.stringify({ selectedTradeCount: tradeIds.length })
  );

  const insertMember = database.prepare(`
    INSERT INTO batch_members (batch_id, trade_id, member_role)
    VALUES (?, ?, 'TRADE')
  `);

  for (const tradeId of tradeIds) {
    insertMember.run(batchId, tradeId);
  }
}

function insertFormation(database, {
  formationId,
  idempotencyKey,
  selectionMode,
  tradeIds,
  batchIds
}) {
  database.prepare(`
    INSERT INTO manual_batch_formations
      (
        formation_id,
        idempotency_key,
        selection_mode,
        trade_ids_json,
        batch_count,
        operation_status
      )
    VALUES (?, ?, ?, ?, ?, 'COMPLETED')
  `).run(
    formationId,
    idempotencyKey,
    selectionMode,
    JSON.stringify(tradeIds),
    batchIds.length
  );

  const insertLink = database.prepare(`
    INSERT INTO manual_batch_formation_batches
      (formation_id, batch_ordinal, batch_id)
    VALUES (?, ?, ?)
  `);

  batchIds.forEach((batchId, index) => {
    insertLink.run(formationId, index + 1, batchId);
  });
}

function tableExists(database, tableName) {
  return Boolean(database.prepare(`
    SELECT 1 AS present
    FROM sqlite_schema
    WHERE type = 'table' AND name = ?
  `).get(tableName));
}

test("moves a legacy single-result public key directly to its Batch", () => {
  const database = legacyDatabase();

  try {
    insertBatch(database, {
      batchId: 11,
      formationId: 7,
      batchOrdinal: 1,
      tradeIds: [3, 1]
    });
    insertFormation(database, {
      formationId: 7,
      idempotencyKey: "public-single-key",
      selectionMode: "SINGLE_BATCH",
      tradeIds: [1, 3],
      batchIds: [11]
    });
    const warnings = [];
    const result = migrateLegacyManualBatchFormations(database, {
      logger: {
        warn: message => warnings.push(message)
      }
    });

    assert.deepEqual(result, {
      migratedSingleCount: 1,
      retiredSplitCount: 0
    });
    assert.equal(
      database.prepare(`
        SELECT idempotency_key
        FROM batches
        WHERE batch_id = 11
      `).get().idempotency_key,
      "public-single-key"
    );
    assert.equal(tableExists(database, "manual_batch_formations"), false);
    assert.equal(
      tableExists(database, "manual_batch_formation_batches"),
      false
    );
    assert.deepEqual(warnings, []);
    assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
    assert.deepEqual(migrateLegacyManualBatchFormations(database), {
      migratedSingleCount: 0,
      retiredSplitCount: 0
    });
  } finally {
    database.close();
  }
});

test("preserves every child Batch of a retired legacy split operation", () => {
  const database = legacyDatabase();

  try {
    insertBatch(database, {
      batchId: 21,
      formationId: 8,
      batchOrdinal: 1,
      tradeIds: [1, 2]
    });
    insertBatch(database, {
      batchId: 22,
      formationId: 8,
      batchOrdinal: 2,
      tradeIds: [3]
    });
    insertFormation(database, {
      formationId: 8,
      idempotencyKey: "retired-public-split-key",
      selectionMode: "SEPARATE_BY_TENOR",
      tradeIds: [3, 2, 1],
      batchIds: [21, 22]
    });
    const warnings = [];
    const result = migrateLegacyManualBatchFormations(database, {
      logger: {
        warn: message => warnings.push(message)
      }
    });

    assert.deepEqual(result, {
      migratedSingleCount: 0,
      retiredSplitCount: 1
    });
    assert.deepEqual(
      database.prepare(`
        SELECT batch_id AS batchId, idempotency_key AS idempotencyKey
        FROM batches
        ORDER BY batch_id
      `).all().map(row => ({ ...row })),
      [
        {
          batchId: 21,
          idempotencyKey: "retired-public-split-key"
        },
        {
          batchId: 22,
          idempotencyKey: "__fx_manual_batch__:8:2"
        }
      ]
    );
    assert.equal(
      database.prepare("SELECT COUNT(*) AS count FROM batch_members").get().count,
      3
    );
    assert.deepEqual(
      JSON.parse(database.prepare(`
        SELECT formation_reason_details_json AS detailsJson
        FROM batches
        WHERE batch_id = 21
      `).get().detailsJson),
      {
        selectedTradeCount: 2,
        legacyManualSplitRetired: true,
        legacyManualFormationId: 8,
        legacyManualBatchCount: 2
      }
    );
    assert.equal(tableExists(database, "manual_batch_formations"), false);
    assert.equal(
      tableExists(database, "manual_batch_formation_batches"),
      false
    );
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /operations 8/);
    assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    database.close();
  }
});

test("rolls back when the legacy source selection does not match its results", () => {
  const database = legacyDatabase();

  try {
    insertBatch(database, {
      batchId: 31,
      formationId: 9,
      batchOrdinal: 1,
      tradeIds: [1, 2]
    });
    insertFormation(database, {
      formationId: 9,
      idempotencyKey: "invalid-selection-key",
      selectionMode: "SINGLE_BATCH",
      tradeIds: [1, 3],
      batchIds: [31]
    });

    assert.throws(
      () => migrateLegacyManualBatchFormations(database),
      /does not match its Batch results/
    );
    assert.equal(tableExists(database, "manual_batch_formations"), true);
    assert.equal(
      tableExists(database, "manual_batch_formation_batches"),
      true
    );
    assert.equal(
      database.prepare(`
        SELECT idempotency_key
        FROM batches
        WHERE batch_id = 31
      `).get().idempotency_key,
      "__fx_manual_batch__:9:1"
    );
  } finally {
    database.close();
  }
});

test("rolls back every change when a public key collides", () => {
  const database = legacyDatabase();

  try {
    insertBatch(database, {
      batchId: 41,
      formationId: 10,
      batchOrdinal: 1,
      tradeIds: [1]
    });
    insertBatch(database, {
      batchId: 42,
      formationId: 999,
      batchOrdinal: 1,
      tradeIds: [2],
      idempotencyKey: "colliding-public-key"
    });
    insertFormation(database, {
      formationId: 10,
      idempotencyKey: "colliding-public-key",
      selectionMode: "SINGLE_BATCH",
      tradeIds: [1],
      batchIds: [41]
    });

    assert.throws(
      () => migrateLegacyManualBatchFormations(database),
      /already used by Batch 42/
    );
    assert.equal(tableExists(database, "manual_batch_formations"), true);
    assert.equal(
      tableExists(database, "manual_batch_formation_batches"),
      true
    );
    assert.equal(
      database.prepare(`
        SELECT idempotency_key
        FROM batches
        WHERE batch_id = 41
      `).get().idempotency_key,
      "__fx_manual_batch__:10:1"
    );
  } finally {
    database.close();
  }
});
