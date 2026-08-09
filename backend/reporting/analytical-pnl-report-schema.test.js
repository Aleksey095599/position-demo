"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const {
  analyticalPnlReportQuery
} = require("./analytical-pnl-report-query");

test("Analytical PnL Report is calculated from Client and Hedge Deals only", () => {
  const database = new DatabaseSync(":memory:");
  const root = path.resolve(__dirname, "..", "..");

  database.exec(fs.readFileSync(path.join(root, "schema.sql"), "utf8"));
  database.exec(fs.readFileSync(path.join(root, "seed.sql"), "utf8"));

  const schemaObject = database.prepare(`
    SELECT type
    FROM sqlite_master
    WHERE name = 'analytical_pnl_report'
  `).get();
  assert.equal(schemaObject, undefined);

  const originalRows = database.prepare(analyticalPnlReportQuery())
    .all()
    .map(row => ({ ...row }));

  assert.deepEqual(
    [...new Set(originalRows.map(row => row.tradeType))].sort(),
    ["CLIENT_DEAL", "HEDGE_DEAL"]
  );
  assert.equal(originalRows.length, 2);
  assert.equal(
    originalRows.reduce(
      (total, row) => total + BigInt(row.analyticalPnlQuoteMinor),
      0n
    ),
    2700000n
  );

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
      (
        999,
        '2026-07-15T12:00:00.000Z',
        '2026-07-15T12:00:00.000Z',
        'BATCH_POSITION_OUT',
        '2026-07-15',
        'EUR_USD',
        'FLAT',
        'EUR',
        0,
        2,
        0,
        2,
        NULL,
        'TOD',
        '2026-07-15',
        '2026-07-15'
      )
  `).run();

  const afterTechnicalTrade = database.prepare(analyticalPnlReportQuery()).all();
  assert.equal(afterTechnicalTrade.length, originalRows.length);

  database.close();
});
