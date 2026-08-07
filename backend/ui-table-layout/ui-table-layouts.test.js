"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const {
  UI_TABLE_COLUMN_KEY_ALIASES,
  UI_TABLE_COLUMN_WIDTH_MIN_PX,
  UI_TABLE_COLUMN_WIDTH_MAX_PX,
  UI_TABLE_LAYOUTS
} = require("./ui-table-layouts");

const EXPECTED_COLUMN_COUNTS = Object.freeze({
  pricing_rules_grid: 7,
  internal_pricing_rules_grid: 8,
  market_stream_grid: 4,
  ccy_options_grid: 6,
  ccy_pair_options_grid: 6,
  fx_position_grid: 12,
  client_fx_deals_grid: 18,
  hedge_fx_deals_grid: 18,
  batching_history_grid: 6,
  batch_formation_audit_grid: 10,
  batch_members_grid: 9,
  batch_cash_output_grid: 3,
  batch_position_output_grid: 9,
  external_counterparties_grid: 8,
  internal_units_grid: 8,
  users_grid: 7,
  execution_contexts_grid: 6,
  servicing_locations_grid: 7,
  accounting_systems_grid: 5,
  execution_systems_grid: 6,
  hedge_quick_mode_settings_grid: 7,
  deal_generation_settings_grid: 11
});

test("defines a valid default width for every managed UI table column", () => {
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(UI_TABLE_LAYOUTS).map(([tableKey, tableLayout]) => [
        tableKey,
        tableLayout.columns.length
      ])
    ),
    EXPECTED_COLUMN_COUNTS
  );

  const fullyQualifiedColumnKeys = new Set();

  Object.entries(UI_TABLE_LAYOUTS).forEach(([tableKey, tableLayout]) => {
    assert.match(tableKey, /^[a-z0-9_]+$/);
    assert.ok(tableLayout.tableLabel.trim());

    tableLayout.columns.forEach(column => {
      assert.match(column.columnKey, /^[a-z0-9_]+$/);
      assert.ok(column.columnLabel.trim());
      assert.ok(Number.isInteger(column.defaultWidthPx));
      assert.ok(column.defaultWidthPx >= UI_TABLE_COLUMN_WIDTH_MIN_PX);
      assert.ok(column.defaultWidthPx <= UI_TABLE_COLUMN_WIDTH_MAX_PX);

      const fullyQualifiedColumnKey = `${tableKey}.${column.columnKey}`;
      assert.equal(fullyQualifiedColumnKeys.has(fullyQualifiedColumnKey), false);
      fullyQualifiedColumnKeys.add(fullyQualifiedColumnKey);
    });
  });

  assert.equal(fullyQualifiedColumnKeys.size, 181);
});

test("keeps fresh-database defaults aligned with the UI layout registry", () => {
  const database = new DatabaseSync(":memory:");
  const root = path.resolve(__dirname, "..", "..");

  database.exec(fs.readFileSync(path.join(root, "schema.sql"), "utf8"));
  database.exec(fs.readFileSync(path.join(root, "seed.sql"), "utf8"));

  const actual = database.prepare(`
    SELECT
      table_key AS tableKey,
      column_key AS columnKey,
      column_label AS columnLabel,
      display_order AS displayOrder,
      default_width_px AS defaultWidthPx,
      width_px AS widthPx
    FROM ui_table_column_settings
    ORDER BY table_key, display_order
  `).all().map(row => ({ ...row }));
  const expected = Object.entries(UI_TABLE_LAYOUTS)
    .flatMap(([tableKey, tableLayout]) =>
      tableLayout.columns.map((column, displayOrder) => ({
        tableKey,
        columnKey: column.columnKey,
        columnLabel: column.columnLabel,
        displayOrder,
        defaultWidthPx: column.defaultWidthPx,
        widthPx: column.defaultWidthPx
      }))
    )
    .sort((left, right) =>
      left.tableKey.localeCompare(right.tableKey)
      || left.displayOrder - right.displayOrder
    );

  assert.deepEqual(actual, expected);
  database.close();
});

test("labels boolean activity columns consistently without changing lifecycle statuses", () => {
  const activityColumns = [
    ["external_counterparties_grid", "active"],
    ["internal_units_grid", "active"],
    ["users_grid", "active"],
    ["servicing_locations_grid", "active"],
    ["accounting_systems_grid", "active"],
    ["execution_systems_grid", "active"]
  ];

  activityColumns.forEach(([tableKey, columnKey]) => {
    const column = UI_TABLE_LAYOUTS[tableKey].columns.find(item => item.columnKey === columnKey);
    assert.equal(column?.columnLabel, "Active");
  });

  assert.equal(
    UI_TABLE_LAYOUTS.batching_history_grid.columns.find(column => column.columnKey === "batch_status")?.columnLabel,
    "Batch Status"
  );
  assert.equal(
    UI_TABLE_LAYOUTS.hedge_quick_mode_settings_grid.columns.find(column => column.columnKey === "state")?.columnLabel,
    "Status"
  );

  UI_TABLE_COLUMN_KEY_ALIASES.forEach(alias => {
    const columns = UI_TABLE_LAYOUTS[alias.tableKey].columns;
    assert.ok(columns.some(column => column.columnKey === alias.columnKey));
    assert.equal(columns.some(column => column.columnKey === alias.legacyColumnKey), false);
  });
});
