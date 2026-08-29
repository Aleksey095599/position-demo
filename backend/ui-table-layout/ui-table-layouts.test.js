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
  pricing_rules_grid: 8,
  internal_pricing_rules_grid: 9,
  market_stream_grid: 4,
  ccy_options_grid: 6,
  ccy_pair_options_grid: 6,
  fx_position_grid: 13,
  client_fx_deals_grid: 21,
  hedge_fx_deals_grid: 22,
  analytical_pnl_report_grid: 12,
  analytical_pnl_summary_grid: 3,
  batching_history_grid: 11,
  batch_members_grid: 9,
  batch_cash_output_grid: 3,
  batch_position_output_grid: 9,
  external_counterparties_grid: 8,
  internal_units_grid: 8,
  users_grid: 7,
  execution_contexts_grid: 8,
  servicing_locations_grid: 7,
  accounting_systems_grid: 5,
  execution_systems_grid: 7,
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

  assert.equal(fullyQualifiedColumnKeys.size, 204);
});

test("includes the Ccy Pair selector width in the FX Position layout", () => {
  const selector = UI_TABLE_LAYOUTS.fx_position_grid.columns[0];

  assert.deepEqual(selector, {
    columnKey: "ccy_pair_selector",
    columnLabel: "Ccy Pair Selector",
    defaultWidthPx: 136
  });
});

test("keeps Standard and Audit View columns in one FX Batches layout", () => {
  assert.deepEqual(
    UI_TABLE_LAYOUTS.batching_history_grid.columns.map(column => column.columnKey),
    [
      "batch_id",
      "ccy_pair_code",
      "batching_key",
      "window_opened_at",
      "window_closed_at",
      "window_duration_ms",
      "batch_status",
      "formation_reason_code",
      "formed_at",
      "source_trade_count",
      "actions"
    ]
  );
  assert.equal(UI_TABLE_LAYOUTS.batch_formation_audit_grid, undefined);
});

test("keeps Pricing Mode inside Execution Context for pricing rule layouts", () => {
  ["pricing_rules_grid", "internal_pricing_rules_grid"].forEach(tableKey => {
    const columnKeys = UI_TABLE_LAYOUTS[tableKey].columns.map(column => column.columnKey);

    assert.ok(columnKeys.includes("execution_context"));
    assert.equal(columnKeys.includes("pricing_mode"), false);
  });
});

test("keeps Initial and Current FX Position Mode together in FX deal layouts", () => {
  ["client_fx_deals_grid", "hedge_fx_deals_grid"].forEach(tableKey => {
    const columns = UI_TABLE_LAYOUTS[tableKey].columns;
    const modeColumns = columns.filter(column =>
      ["initial_fx_position_mode", "current_fx_position_mode"].includes(column.columnKey)
    );

    assert.deepEqual(
      modeColumns.map(column => [column.columnKey, column.columnLabel]),
      [
        ["initial_fx_position_mode", "Initial FX Position Mode"],
        ["current_fx_position_mode", "Current FX Position Mode"]
      ]
    );
    assert.equal(
      columns.findIndex(column => column.columnKey === "current_fx_position_mode") + 1,
      columns.findIndex(column => column.columnKey === "transfer_rate")
    );
  });
});

test("places the derived Execution System Label after Pricing Mode", () => {
  const columns = UI_TABLE_LAYOUTS.execution_systems_grid.columns;

  assert.deepEqual(
    columns.slice(1, 4).map(column => [column.columnKey, column.columnLabel]),
    [
      ["name", "Name"],
      ["pricing_mode", "Pricing Mode"],
      ["execution_system_label", "Execution System Label"]
    ]
  );
  assert.equal(
    columns.find(column => column.columnKey === "execution_system_label")?.defaultWidthPx,
    250
  );
});

test("reserves label widths for reference fields in Execution Contexts", () => {
  const columns = UI_TABLE_LAYOUTS.execution_contexts_grid.columns;

  assert.deepEqual(
    Object.fromEntries(
      columns
        .filter(column => ["servicing_location", "accounting_system", "execution_system"].includes(column.columnKey))
        .map(column => [column.columnKey, column.defaultWidthPx])
    ),
    {
      servicing_location: 250,
      accounting_system: 300,
      execution_system: 250
    }
  );
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
