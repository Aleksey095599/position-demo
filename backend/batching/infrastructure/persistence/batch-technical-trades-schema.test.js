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
  return database;
}

function tableSql(database, tableName) {
  return database.prepare(`
    SELECT sql
    FROM sqlite_schema
    WHERE type = 'table' AND name = ?
  `).get(tableName)?.sql || "";
}

function insertBatch(database, idempotencyKey, {
  ccyPairCode = "EUR_USD",
  batchStatus = "BUILDING"
} = {}) {
  const rolledBackAt = batchStatus === "ROLLED_BACK"
    ? "2026-08-21T10:00:00.000Z"
    : null;
  return Number(database.prepare(`
    INSERT INTO batches
      (idempotency_key, ccy_pair_code, batch_status, rolled_back_at)
    VALUES (?, ?, ?, ?)
  `).run(idempotencyKey, ccyPairCode, batchStatus, rolledBackAt).lastInsertRowid);
}

function insertTechnicalExposure(database, {
  tradeId,
  tradeType,
  ccyPairCode = "EUR_USD",
  baseCcySide,
  baseCcyAmountMinor,
  quoteCcyAmountMinor,
  tradeRate
}) {
  const isPositionOutput = tradeType === "BATCH_POSITION_OUT";
  database.prepare(`
    INSERT INTO trade_exposures
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
      (?, '2026-08-21T10:00:00.000Z', '2026-08-21T10:00:00.000Z',
       ?, '2026-08-21', ?, ?, ?, ?, 2, ?, 2, ?, 'TOD',
       '2026-08-21', '2026-08-21')
  `).run(
    tradeId,
    tradeType,
    ccyPairCode,
    baseCcySide ?? (isPositionOutput ? "FLAT" : "BUY"),
    ccyPairCode.slice(0, 3),
    baseCcyAmountMinor ?? (isPositionOutput ? 0 : 10000),
    quoteCcyAmountMinor ?? (isPositionOutput ? 0 : 11200),
    tradeRate ?? (isPositionOutput ? null : 1.12)
  );
}

function insertSubtype(database, tradeId, tradeType) {
  const tableName = tradeType === "BATCH_BALANCE_TRADE"
    ? "batch_balance_trades"
    : "batch_position_outputs";
  database.prepare(`
    INSERT INTO ${tableName} (trade_id, trade_type)
    VALUES (?, ?)
  `).run(tradeId, tradeType);
}

function insertMember(database, batchId, tradeId, tradeType, memberRole) {
  database.prepare(`
    INSERT INTO batch_members
      (batch_id, trade_id, trade_type, member_role)
    VALUES (?, ?, ?, ?)
  `).run(batchId, tradeId, tradeType, memberRole);
}

test("all Trade types share membership while technical data stays in subtype tables", () => {
  const database = databaseWithCanonicalSchema();

  try {
    const membersSql = tableSql(database, "batch_members");
    const balanceTradeSql = tableSql(database, "batch_balance_trades");
    const positionOutputSql = tableSql(database, "batch_position_outputs");
    const balanceTradeColumns = database.prepare(`
      PRAGMA table_info(batch_balance_trades)
    `).all();
    const positionOutputColumns = database.prepare(`
      PRAGMA table_info(batch_position_outputs)
    `).all();
    const balanceTradeForeignKeys = database.prepare(`
      PRAGMA foreign_key_list(batch_balance_trades)
    `).all();
    const positionOutputForeignKeys = database.prepare(`
      PRAGMA foreign_key_list(batch_position_outputs)
    `).all();

    assert.match(
      membersSql,
      /member_role\s+IN\s*\(\s*'TRADE'\s*,\s*'BALANCE_TRADE'\s*,\s*'POSITION_OUT'\s*\)/i
    );
    assert.match(membersSql, /trade_type\s*=\s*'BATCH_BALANCE_TRADE'/i);
    assert.match(membersSql, /trade_type\s*=\s*'BATCH_POSITION_OUT'/i);
    assert.deepEqual(
      balanceTradeColumns.map(column => column.name),
      ["trade_id", "trade_type"]
    );
    assert.deepEqual(
      positionOutputColumns.map(column => column.name),
      ["trade_id", "trade_type"]
    );
    assert.equal(balanceTradeColumns[0].pk, 1);
    assert.equal(positionOutputColumns[0].pk, 1);
    assert.match(balanceTradeSql, /CHECK\s*\(\s*trade_type\s*=\s*'BATCH_BALANCE_TRADE'\s*\)/i);
    assert.match(positionOutputSql, /CHECK\s*\(\s*trade_type\s*=\s*'BATCH_POSITION_OUT'\s*\)/i);
    assert.deepEqual(
      new Set(balanceTradeForeignKeys.map(foreignKey => foreignKey.table)),
      new Set(["trade_exposures"])
    );
    assert.deepEqual(
      new Set(positionOutputForeignKeys.map(foreignKey => foreignKey.table)),
      new Set(["trade_exposures"])
    );
  } finally {
    database.close();
  }
});

test("Balance Trade and Position Out are physical members of their Batch", () => {
  const database = databaseWithCanonicalSchema();

  try {
    const batchId = insertBatch(database, "complete-membership-main");
    const anotherBatchId = insertBatch(database, "complete-membership-another");
    const completedBatchId = insertBatch(database, "complete-membership-completed", {
      batchStatus: "ROLLED_BACK"
    });

    for (const technicalTrade of [
      { tradeId: 9101, tradeType: "BATCH_BALANCE_TRADE" },
      { tradeId: 9102, tradeType: "BATCH_BALANCE_TRADE" },
      { tradeId: 9103, tradeType: "BATCH_BALANCE_TRADE", ccyPairCode: "GBP_USD" },
      { tradeId: 9201, tradeType: "BATCH_POSITION_OUT" }
    ]) {
      insertTechnicalExposure(database, technicalTrade);
      insertSubtype(database, technicalTrade.tradeId, technicalTrade.tradeType);
    }

    insertMember(
      database,
      batchId,
      9101,
      "BATCH_BALANCE_TRADE",
      "BALANCE_TRADE"
    );
    insertMember(
      database,
      batchId,
      9201,
      "BATCH_POSITION_OUT",
      "POSITION_OUT"
    );

    const members = database.prepare(`
      SELECT trade_id AS tradeId, trade_type AS tradeType, member_role AS memberRole
      FROM batch_members
      WHERE batch_id = ?
      ORDER BY trade_id
    `).all(batchId);
    assert.deepEqual(
      members.map(member => [member.tradeId, member.tradeType, member.memberRole]),
      [
        [9101, "BATCH_BALANCE_TRADE", "BALANCE_TRADE"],
        [9201, "BATCH_POSITION_OUT", "POSITION_OUT"]
      ]
    );

    assert.throws(
      () => insertMember(
        database,
        anotherBatchId,
        9201,
        "BATCH_POSITION_OUT",
        "BALANCE_TRADE"
      ),
      /membership requires a matching subtype or available source Trade/
    );
    assert.throws(
      () => insertMember(
        database,
        batchId,
        9102,
        "BATCH_BALANCE_TRADE",
        "BALANCE_TRADE"
      ),
      /UNIQUE constraint failed: batch_members.batch_id, batch_members.member_role/
    );
    assert.throws(
      () => insertMember(
        database,
        anotherBatchId,
        9101,
        "BATCH_BALANCE_TRADE",
        "BALANCE_TRADE"
      ),
      /membership requires a matching subtype or available source Trade/
    );
    assert.throws(
      () => insertMember(
        database,
        anotherBatchId,
        9103,
        "BATCH_BALANCE_TRADE",
        "BALANCE_TRADE"
      ),
      /membership requires a matching subtype or available source Trade/
    );
    assert.throws(
      () => insertMember(
        database,
        completedBatchId,
        9102,
        "BATCH_BALANCE_TRADE",
        "BALANCE_TRADE"
      ),
      /membership requires a matching subtype or available source Trade/
    );
    assert.throws(
      () => database.prepare(`
        INSERT INTO batch_balance_trades (trade_id, trade_type)
        VALUES (9201, 'BATCH_POSITION_OUT')
      `).run(),
      /CHECK constraint failed: chk_batch_balance_trades_trade_type/
    );
    assert.deepEqual(database.prepare("PRAGMA foreign_key_check").all(), []);
  } finally {
    database.close();
  }
});

test("forming a Batch requires both technical Trades to inherit the source Mode", () => {
  const database = databaseWithCanonicalSchema();

  try {
    const batchId = insertBatch(database, "technical-mode-inheritance");
    const sourceTradeId = 9301;
    const balanceTradeId = 9302;
    const positionOutTradeId = 9303;

    insertTechnicalExposure(database, {
      tradeId: sourceTradeId,
      tradeType: "CLIENT_DEAL",
      baseCcySide: "BUY"
    });
    database.prepare(`
      INSERT INTO client_deals
        (trade_id, trade_type, counterparty_id, transfer_rate)
      SELECT ?, 'CLIENT_DEAL', MIN(counterparty_id), 1.12
      FROM trading_counterparties
    `).run(sourceTradeId);
    insertTechnicalExposure(database, {
      tradeId: balanceTradeId,
      tradeType: "BATCH_BALANCE_TRADE",
      baseCcySide: "SELL"
    });
    insertTechnicalExposure(database, {
      tradeId: positionOutTradeId,
      tradeType: "BATCH_POSITION_OUT",
      baseCcySide: "BUY",
      baseCcyAmountMinor: 10000,
      quoteCcyAmountMinor: 11200,
      tradeRate: 1.12
    });
    insertSubtype(database, balanceTradeId, "BATCH_BALANCE_TRADE");
    insertSubtype(database, positionOutTradeId, "BATCH_POSITION_OUT");
    insertMember(database, batchId, sourceTradeId, "CLIENT_DEAL", "TRADE");
    insertMember(
      database,
      batchId,
      balanceTradeId,
      "BATCH_BALANCE_TRADE",
      "BALANCE_TRADE"
    );
    insertMember(
      database,
      batchId,
      positionOutTradeId,
      "BATCH_POSITION_OUT",
      "POSITION_OUT"
    );
    database.prepare(`
      INSERT INTO batch_quote_cash_outputs
        (
          batch_id,
          quote_ccy_code,
          quote_balance_contribution_minor,
          quote_ccy_fraction_digits,
          quote_ccy_value_date,
          created_at
        )
      VALUES (?, 'USD', 0, 2, '2026-08-21', '2026-08-21T10:00:00.000Z')
    `).run(batchId);
    database.prepare(`
      UPDATE trade_position_management
      SET initial_position_management_mode = 'AUTO',
          current_position_management_mode = 'AUTO'
      WHERE trade_id = ? AND trade_type = 'BATCH_POSITION_OUT'
    `).run(positionOutTradeId);

    assert.throws(
      () => database.prepare(`
        UPDATE batches
        SET batch_status = 'FORMED'
        WHERE batch_id = ?
      `).run(batchId),
      /Batch technical Trades must inherit the Batch source Position Management Mode/
    );

    database.prepare(`
      UPDATE trade_position_management
      SET initial_position_management_mode = 'MANUAL',
          current_position_management_mode = 'MANUAL'
      WHERE trade_id = ? AND trade_type = 'BATCH_POSITION_OUT'
    `).run(positionOutTradeId);
    database.prepare(`
      UPDATE batches
      SET batch_status = 'FORMED'
      WHERE batch_id = ?
    `).run(batchId);
    assert.equal(
      database.prepare(`
        SELECT batch_status AS batchStatus
        FROM batches
        WHERE batch_id = ?
      `).get(batchId).batchStatus,
      "FORMED"
    );
  } finally {
    database.close();
  }
});
