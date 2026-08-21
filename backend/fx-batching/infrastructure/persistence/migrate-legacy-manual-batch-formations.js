"use strict";

function tableExists(database, tableName) {
  return Boolean(database.prepare(`
    SELECT 1 AS present
    FROM sqlite_schema
    WHERE type = 'table' AND name = ?
  `).get(tableName));
}

function runInImmediateTransaction(database, operation) {
  database.exec("BEGIN IMMEDIATE");

  try {
    const result = operation();
    database.exec("COMMIT");
    return result;
  } catch (error) {
    try {
      database.exec("ROLLBACK");
    } catch {}

    throw error;
  }
}

function invalidLegacyOperation(formationId, message) {
  return new Error(
    `Legacy manual batching operation ${formationId} ${message}`
  );
}

function migrateLegacyManualBatchFormations(database, {
  logger = console
} = {}) {
  const formationsExist = tableExists(
    database,
    "fx_manual_batch_formations"
  );
  const linksExist = tableExists(
    database,
    "fx_manual_batch_formation_batches"
  );

  if (!formationsExist && !linksExist) {
    return {
      migratedSingleCount: 0,
      retiredSplitCount: 0
    };
  }

  if (!formationsExist || !linksExist) {
    throw new Error("Incomplete legacy manual FX Batch formation schema.");
  }

  const migrationResult = runInImmediateTransaction(database, () => {
    if (database.prepare("PRAGMA foreign_key_check").all().length > 0) {
      throw new Error(
        "Legacy manual FX Batch schema contains foreign key violations."
      );
    }

    const formations = database.prepare(`
      SELECT
        formation_id AS formationId,
        idempotency_key AS idempotencyKey,
        selection_mode AS selectionMode,
        trade_ids_json AS tradeIdsJson,
        batch_count AS batchCount,
        operation_status AS operationStatus
      FROM fx_manual_batch_formations
      ORDER BY formation_id
    `).all();
    const linksByFormation = database.prepare(`
      SELECT
        batch_ordinal AS batchOrdinal,
        batch_id AS batchId
      FROM fx_manual_batch_formation_batches
      WHERE formation_id = ?
      ORDER BY batch_ordinal
    `);
    const conflictingBatch = database.prepare(`
      SELECT batch_id AS batchId
      FROM fx_batches
      WHERE idempotency_key = ?
        AND batch_id <> ?
    `);
    const updateBatchKey = database.prepare(`
      UPDATE fx_batches
      SET idempotency_key = ?
      WHERE batch_id = ?
    `);
    const retireSplitBatchKey = database.prepare(`
      UPDATE fx_batches
      SET idempotency_key = ?,
          formation_reason_details_json = json_set(
            formation_reason_details_json,
            '$.legacyManualSplitRetired',
            json('true'),
            '$.legacyManualFormationId',
            ?,
            '$.legacyManualBatchCount',
            ?
          )
      WHERE batch_id = ?
    `);
    const batchIdentity = database.prepare(`
      SELECT
        idempotency_key AS idempotencyKey,
        batch_status AS batchStatus,
        formation_reason_code AS formationReasonCode
      FROM fx_batches
      WHERE batch_id = ?
    `);
    const sourceTradeIds = database.prepare(`
      SELECT trade_id AS tradeId
      FROM fx_batch_members
      WHERE batch_id = ?
        AND member_role = 'TRADE'
      ORDER BY trade_id
    `);
    const retiredSplitFormationIds = [];
    let migratedSingleCount = 0;

    for (const formation of formations) {
      const formationId = Number(formation.formationId);
      const links = linksByFormation.all(formationId);
      const batchCount = Number(formation.batchCount);
      const validSelectionMode = [
        "SINGLE_BATCH",
        "SEPARATE_BY_TENOR"
      ].includes(formation.selectionMode);
      const ordinalsAreComplete = links.every(
        (link, index) => Number(link.batchOrdinal) === index + 1
      );

      if (
        !Number.isSafeInteger(formationId)
        || formationId <= 0
        || !validSelectionMode
        || !Number.isSafeInteger(batchCount)
        || batchCount <= 0
        || formation.operationStatus !== "COMPLETED"
        || links.length !== batchCount
        || !ordinalsAreComplete
        || (
          formation.selectionMode === "SINGLE_BATCH"
          && batchCount !== 1
        )
      ) {
        throw invalidLegacyOperation(
          formation.formationId,
          "has an invalid completed result."
        );
      }

      let expectedTradeIds;

      try {
        const parsedTradeIds = JSON.parse(formation.tradeIdsJson);

        if (!Array.isArray(parsedTradeIds)) {
          throw new TypeError("Trade IDs must be an array.");
        }

        expectedTradeIds = parsedTradeIds
          .map(Number)
          .sort((left, right) => left - right);
      } catch {
        throw invalidLegacyOperation(
          formationId,
          "has invalid source Trade IDs."
        );
      }

      const actualTradeIds = [];

      for (const link of links) {
        const batchId = Number(link.batchId);
        const batchOrdinal = Number(link.batchOrdinal);
        const batch = batchIdentity.get(batchId);

        if (
          !Number.isSafeInteger(batchId)
          || batchId <= 0
          || !batch
          || !["FORMED", "ROLLED_BACK"].includes(batch.batchStatus)
          || batch.formationReasonCode !== "MANUAL_SELECTION"
          || batch.idempotencyKey
            !== `__fx_manual_batch__:${formationId}:${batchOrdinal}`
        ) {
          throw invalidLegacyOperation(
            formationId,
            `does not match FX Batch ${batchId}.`
          );
        }

        actualTradeIds.push(
          ...sourceTradeIds.all(batchId).map(row => Number(row.tradeId))
        );
      }

      actualTradeIds.sort((left, right) => left - right);

      if (
        expectedTradeIds.some(
          tradeId => !Number.isSafeInteger(tradeId) || tradeId <= 0
        )
        || new Set(expectedTradeIds).size !== expectedTradeIds.length
        || expectedTradeIds.length !== actualTradeIds.length
        || expectedTradeIds.some(
          (tradeId, index) => tradeId !== actualTradeIds[index]
        )
      ) {
        throw invalidLegacyOperation(
          formationId,
          "does not match its FX Batch results."
        );
      }

      const primaryBatchId = Number(links[0].batchId);
      const conflict = conflictingBatch.get(
        formation.idempotencyKey,
        primaryBatchId
      );

      if (conflict) {
        throw new Error(
          `Manual batching Idempotency Key ${formation.idempotencyKey} `
            + `is already used by FX Batch ${conflict.batchId}.`
        );
      }

      const update = formation.selectionMode === "SEPARATE_BY_TENOR"
        ? retireSplitBatchKey.run(
          formation.idempotencyKey,
          formationId,
          batchCount,
          primaryBatchId
        )
        : updateBatchKey.run(
          formation.idempotencyKey,
          primaryBatchId
        );

      if (Number(update.changes) !== 1) {
        throw new Error(
          `Legacy FX Batch ${primaryBatchId} Idempotency Key was not migrated.`
        );
      }

      if (formation.selectionMode === "SEPARATE_BY_TENOR") {
        retiredSplitFormationIds.push(formationId);
      } else {
        migratedSingleCount += 1;
      }
    }

    database.exec(`
      DROP TABLE fx_manual_batch_formation_batches;
      DROP TABLE fx_manual_batch_formations;
    `);

    if (database.prepare("PRAGMA foreign_key_check").all().length > 0) {
      throw new Error(
        "Manual FX Batch migration produced foreign key violations."
      );
    }

    return {
      migratedSingleCount,
      retiredSplitFormationIds
    };
  });

  if (migrationResult.retiredSplitFormationIds.length > 0) {
    logger.warn(
      "Retired legacy split manual FX Batch operations "
        + `${migrationResult.retiredSplitFormationIds.join(", ")}; `
        + "all child FX Batches were preserved and each public key remains reserved."
    );
  }

  return {
    migratedSingleCount: migrationResult.migratedSingleCount,
    retiredSplitCount: migrationResult.retiredSplitFormationIds.length
  };
}

module.exports = {
  migrateLegacyManualBatchFormations
};
