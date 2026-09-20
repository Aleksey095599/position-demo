"use strict";

const { DuplicateTradePurposeError } = require("../../application/trade-purpose-service");

class SqliteTradePurposeRepository {
  constructor(database) {
    this.database = database;
  }

  list() {
    return this.database.prepare(`
      SELECT trade_purpose_id AS tradePurposeId, name
      FROM trade_purposes
      ORDER BY trade_purpose_id
    `).all().map(row => ({ ...row }));
  }

  find(id) {
    const row = this.database.prepare(`
      SELECT trade_purpose_id AS tradePurposeId, name
      FROM trade_purposes
      WHERE trade_purpose_id = ?
    `).get(id);
    return row ? { ...row } : null;
  }

  create(purpose) {
    this.write(purpose.tradePurposeId, () => this.database.prepare(`
      INSERT INTO trade_purposes (trade_purpose_id, name)
      VALUES (?, ?)
    `).run(purpose.tradePurposeId, purpose.name));
  }

  replace(id, purpose) {
    this.write(purpose.tradePurposeId, () => this.database.prepare(`
      UPDATE trade_purposes SET trade_purpose_id = ?, name = ?
      WHERE trade_purpose_id = ?
    `).run(purpose.tradePurposeId, purpose.name, id));
  }

  delete(id) {
    this.database.prepare("DELETE FROM trade_purposes WHERE trade_purpose_id = ?").run(id);
  }

  write(id, operation) {
    try {
      operation();
    } catch (error) {
      if (error.errcode === 1555 || error.errcode === 2067) {
        throw new DuplicateTradePurposeError(`Trade Purpose ${id} already exists.`);
      }

      throw error;
    }
  }
}

function seedInitialTradePurposes(database) {
  database.exec(`
    INSERT INTO trade_purposes (trade_purpose_id, name)
    VALUES
      ('CLIENT_CONVERSION', 'Client Account Conversion'),
      ('LOAN_REPAYMENT', 'Loan Repayment'),
      ('FEE_COLLECTION', 'Fee Collection'),
      ('POSITION_HEDGING', 'Position Hedging');
  `);
}

module.exports = { SqliteTradePurposeRepository, seedInitialTradePurposes };
