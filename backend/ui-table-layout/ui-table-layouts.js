"use strict";

const UI_TABLE_COLUMN_WIDTH_MIN_PX = 50;
const UI_TABLE_COLUMN_WIDTH_MAX_PX = 1600;
const UI_TABLE_COLUMN_KEY_ALIASES = Object.freeze([
  Object.freeze({ tableKey: "external_counterparties_grid", legacyColumnKey: "status", columnKey: "active" }),
  Object.freeze({ tableKey: "external_counterparties_grid", legacyColumnKey: "identifier", columnKey: "business_id" }),
  Object.freeze({ tableKey: "external_counterparties_grid", legacyColumnKey: "external_counterparty_type", columnKey: "counterparty_type" }),
  Object.freeze({ tableKey: "internal_units_grid", legacyColumnKey: "status", columnKey: "active" }),
  Object.freeze({ tableKey: "internal_units_grid", legacyColumnKey: "unit_code", columnKey: "business_id" }),
  Object.freeze({ tableKey: "internal_units_grid", legacyColumnKey: "counterparty_name", columnKey: "unit_name" }),
  Object.freeze({ tableKey: "users_grid", legacyColumnKey: "status", columnKey: "active" }),
  Object.freeze({
    tableKey: "pricing_rules_grid",
    legacyColumnKey: "position_management_mode",
    columnKey: "auto_management_admission"
  }),
  Object.freeze({
    tableKey: "internal_pricing_rules_grid",
    legacyColumnKey: "position_management_mode",
    columnKey: "auto_management_admission"
  }),
  Object.freeze({
    tableKey: "client_deals_grid",
    legacyColumnKey: "entry_timestamp",
    columnKey: "execution_timestamp"
  }),
  Object.freeze({
    tableKey: "hedge_deals_grid",
    legacyColumnKey: "entry_timestamp",
    columnKey: "execution_timestamp"
  }),
  Object.freeze({
    tableKey: "batching_history_grid",
    legacyColumnKey: "formation_reason",
    columnKey: "formation_reason_code"
  }),
  Object.freeze({
    tableKey: "batching_history_grid",
    legacyColumnKey: "created_at",
    columnKey: "formed_at"
  }),
  Object.freeze({
    tableKey: "trade_contexts_grid",
    legacyColumnKey: "pricing_rules_count",
    columnKey: "counterparties_count"
  }),
  Object.freeze({
    tableKey: "trade_contexts_grid",
    legacyColumnKey: "auto_management_admission_policy",
    columnKey: "auto_management_admission_mode"
  })
]);

function layout(tableLabel, columns) {
  return Object.freeze({
    tableLabel,
    columns: Object.freeze(columns.map(([columnKey, columnLabel, defaultWidthPx]) =>
      Object.freeze({ columnKey, columnLabel, defaultWidthPx })
    ))
  });
}

const UI_TABLE_LAYOUTS = Object.freeze({
  pricing_rules_grid: layout("Pricing Rules", [
    ["id", "ID", 64],
    ["counterparty_code", "Counterparty Code", 122],
    ["counterparty_name", "Counterparty Name", 158],
    ["trade_context_id", "Trade Context ID", 130],
    ["trade_context", "Trade Context", 596],
    ["ccy_pair", "Ccy Pair", 88],
    ["auto_management_admission", "Initial Mode Assignment", 232],
    ["margin", "Margin", 82],
    ["actions", "Actions", 80]
  ]),
  internal_pricing_rules_grid: layout("Internal Unit Pricing Rules", [
    ["id", "ID", 64],
    ["counterparty_code", "Unit Code", 122],
    ["counterparty_name", "Counterparty Name", 158],
    ["trade_context_id", "Trade Context ID", 130],
    ["trade_context", "Trade Context", 596],
    ["ccy_pair", "Ccy Pair", 88],
    ["auto_management_admission", "Initial Mode Assignment", 232],
    ["margin", "Margin", 82],
    ["quick_hedge", "Quick Hedge", 112],
    ["actions", "Actions", 80]
  ]),
  market_stream_grid: layout("Market Pulse", [
    ["currency_pair", "Ccy Pair", 94],
    ["bid", "Bid", 83],
    ["offer", "Offer", 83],
    ["actions", "Actions", 80]
  ]),
  ccy_options_grid: layout("Ccy Options", [
    ["code", "Code", 101],
    ["name", "Name", 141],
    ["country", "Country", 141],
    ["fraction_digits", "Fraction Digits", 83],
    ["pair_count", "Ccy Pairs", 74],
    ["actions", "Actions", 80]
  ]),
  ccy_pair_options_grid: layout("Ccy Pair Options", [
    ["base_ccy", "Base Ccy", 85],
    ["quote_ccy", "Quote Ccy", 85],
    ["currency_pair", "Ccy Pair", 94],
    ["default_quote_decimals", "Default Quote Decimals", 83],
    ["pricing_rules_count", "Pricing Rules Count", 65],
    ["actions", "Actions", 80]
  ]),
  position_grid: layout("Position", [
    ["ccy_pair_selector", "Ccy Pair Selector", 136],
    ["trade_id", "ID", 50],
    ["trade", "Trade", 280],
    ["trade_date", "Trade Date", 100],
    ["base_ccy_value_date", "Base Ccy Value Date", 145],
    ["sell_base_ccy_amount", "SELL Base Ccy Amount", 145],
    ["sell_trade_rate", "SELL Trade Rate", 90],
    ["sell_transfer_rate", "SELL Transfer Rate", 95],
    ["market_bid", "Market Bid", 75],
    ["market_offer", "Market Offer", 75],
    ["buy_transfer_rate", "BUY Transfer Rate", 95],
    ["buy_trade_rate", "BUY Trade Rate", 90],
    ["buy_base_ccy_amount", "BUY Base Ccy Amount", 167]
  ]),
  client_deals_grid: layout("Client Deals", [
    ["trade_id", "Trade ID", 96],
    ["execution_timestamp", "Execution Timestamp", 170],
    ["received_timestamp", "Received Timestamp", 170],
    ["client_code_type", "Business ID Type", 150],
    ["client_code", "Business ID", 170],
    ["client_name", "Client Name", 141],
    ["trade_date", "Trade Date", 109],
    ["currency_pair", "Ccy Pair", 94],
    ["side", "Side", 84],
    ["base_ccy_amount", "Base Ccy Amount", 146],
    ["quote_ccy_amount", "Quote Ccy Amount", 155],
    ["trade_rate", "Trade Rate", 108],
    ["tenor", "Tenor", 73],
    ["base_ccy_value_date", "Base Ccy Value Date", 160],
    ["quote_ccy_value_date", "Quote Ccy Value Date", 168],
    ["trade_context_label", "Trade Context", 435],
    ["pricing_rule_margin", "Margin", 102],
    ["initial_position_management_mode", "Initial Position Management Mode", 232],
    ["current_position_management_mode", "Current Position Management Mode", 232],
    ["transfer_rate", "Transfer Rate", 122],
    ["analytical_pnl", "Analytical PnL", 126]
  ]),
  hedge_deals_grid: layout("Hedge Deals", [
    ["trade_id", "Trade ID", 96],
    ["request_timestamp", "Request Timestamp", 170],
    ["execution_timestamp", "Execution Timestamp", 170],
    ["received_timestamp", "Received Timestamp", 170],
    ["counterparty_code_type", "Business ID Type", 150],
    ["counterparty_code", "Business ID", 170],
    ["counterparty_name", "Counterparty Name", 158],
    ["trade_date", "Trade Date", 109],
    ["currency_pair", "Ccy Pair", 94],
    ["side", "Hedge Side", 88],
    ["base_ccy_amount", "Base Ccy Amount", 146],
    ["quote_ccy_amount", "Quote Ccy Amount", 155],
    ["trade_rate", "Trade Rate", 108],
    ["tenor", "Tenor", 73],
    ["base_ccy_value_date", "Base Ccy Value Date", 160],
    ["quote_ccy_value_date", "Quote Ccy Value Date", 168],
    ["trade_context_label", "Trade Context", 435],
    ["pricing_rule_margin", "Margin", 102],
    ["initial_position_management_mode", "Initial Position Management Mode", 232],
    ["current_position_management_mode", "Current Position Management Mode", 232],
    ["transfer_rate", "Transfer Rate", 122],
    ["analytical_pnl", "Analytical PnL", 126]
  ]),
  analytical_pnl_report_grid: layout("Analytical PnL Report", [
    ["trade_id", "Trade ID", 96],
    ["trade_type", "Trade Type", 122],
    ["trade_date", "Trade Date", 109],
    ["identifier", "Identifier", 210],
    ["counterparty_name", "Counterparty Name", 180],
    ["currency_pair", "Ccy Pair", 94],
    ["side", "Side", 90],
    ["base_ccy_amount", "Base Ccy Amount", 146],
    ["quote_ccy_amount", "Quote Ccy Amount", 155],
    ["trade_rate", "Trade Rate", 108],
    ["transfer_rate", "Transfer Rate", 122],
    ["analytical_pnl", "Analytical PnL", 145]
  ]),
  analytical_pnl_summary_grid: layout("Net Analytical PnL", [
    ["currency", "Currency", 100],
    ["amount", "Amount", 150],
    ["weighted_average_margin", "Weighted Average Margin", 190]
  ]),
  batching_history_grid: layout("Batches", [
    ["batch_id", "Batch ID", 96],
    ["ccy_pair_code", "Ccy Pair Code", 100],
    ["batching_key", "Batching Key", 450],
    ["window_opened_at", "Window Opened At", 157],
    ["window_closed_at", "Window Closed At", 157],
    ["window_duration_ms", "Duration", 105],
    ["batch_status", "Batch Status", 101],
    ["formation_reason_code", "Formation Reason", 252],
    ["formed_at", "Formed At", 157],
    ["source_trade_count", "Source Trades", 108],
    ["actions", "Actions", 80]
  ]),
  batch_members_grid: layout("Batch Members and Position Outputs", [
    ["trade_id", "Trade ID", 96],
    ["trade_type", "Trade Type", 281],
    ["member_role", "Role", 124],
    ["base_balance_contribution_minor", "Base Ccy Leg", 125],
    ["quote_balance_contribution_minor", "Quote Ccy Leg", 130],
    ["trade_rate", "Trade Rate", 108],
    ["transfer_rate", "Transfer Rate", 122],
    ["analytical_pnl_quote_minor", "Analytical PnL", 127],
    ["base_ccy_value_date", "Base Ccy Value Date", 135],
    ["quote_ccy_value_date", "Quote Ccy Value Date", 143]
  ]),
  batch_cash_output_grid: layout("Batch Quote Cash Outputs", [
    ["currency_code", "Currency", 85],
    ["balance_contribution_minor", "Cash Leg", 119],
    ["value_date", "Value Date", 105]
  ]),
  external_counterparties_grid: layout("External Counterparties", [
    ["id", "ID", 70],
    ["counterparty_type", "Counterparty Type", 176],
    ["business_id_type", "Business ID Type", 150],
    ["business_id", "Business ID", 170],
    ["counterparty_name", "Counterparty Name", 180],
    ["role", "Role", 174],
    ["active", "Active", 100],
    ["actions", "Actions", 90]
  ]),
  internal_units_grid: layout("Internal Units", [
    ["id", "ID", 70],
    ["unit_type", "Unit Type", 130],
    ["business_id_type", "Business ID Type", 178],
    ["business_id", "Business ID", 170],
    ["unit_name", "Unit Name", 180],
    ["role", "Role", 174],
    ["active", "Active", 100],
    ["actions", "Actions", 90]
  ]),
  users_grid: layout("Users", [
    ["id", "ID", 64],
    ["user_code", "User Code", 107],
    ["first_name", "First Name", 140],
    ["last_name", "Last Name", 140],
    ["role", "Role", 100],
    ["active", "Active", 100],
    ["actions", "Actions", 80]
  ]),
  trade_contexts_grid: layout("Trade Context", [
    ["id", "ID", 64],
    ["servicing_location", "Servicing Location", 250],
    ["accounting_system", "Accounting System", 300],
    ["originating_system", "Originating System", 250],
    ["auto_management_admission_mode", "Initial Mode Assignment", 232],
    ["counterparties_count", "Attached Counterparties", 64],
    ["actions", "Actions", 80]
  ]),
  servicing_locations_grid: layout("Servicing Locations", [
    ["id", "ID", 64],
    ["name", "Name", 153],
    ["region", "Region", 134],
    ["type", "Type", 100],
    ["active", "Active", 72],
    ["trade_context_count", "Exec. Context Count", 64],
    ["actions", "Actions", 80]
  ]),
  accounting_systems_grid: layout("Accounting Systems", [
    ["id", "ID", 64],
    ["name", "Name", 152],
    ["active", "Active", 72],
    ["trade_context_count", "Trade Context Count", 64],
    ["actions", "Actions", 80]
  ]),
  originating_systems_grid: layout("Originating Systems", [
    ["id", "ID", 183],
    ["name", "Name", 149],
    ["pricing_mode", "Pricing Mode", 156],
    ["originating_system_label", "Originating System Label", 250],
    ["active", "Active", 72],
    ["trade_context_count", "Trade Context Count", 64],
    ["actions", "Actions", 80]
  ]),
  trade_purposes_grid: layout("Trade Purpose", [
    ["id", "ID", 210],
    ["name", "Name", 260],
    ["trade_context_count", "Attached Trade Contexts", 64],
    ["actions", "Actions", 100]
  ]),
  auto_management_admission_criteria_grid: layout("Auto Mode Eligibility", [
    ["ccy_pair", "Ccy Pair", 150],
    ["trade_type", "Trade Type", 210],
    ["eligible_for_auto_mode", "Eligible", 150],
    ["maximum_trade_amount", "Amount Limit", 180],
    ["transfer_rate_deviation", "Max. Transfer Rate Deviation", 230],
    ["actions", "Actions", 100]
  ]),
  hedge_quick_mode_settings_grid: layout("Quick Hedge Settings", [
    ["currency_pair", "Ccy Pair", 89],
    ["counterparty_name", "Hedge Counterparty", 141],
    ["context_path", "Trade Context", 469],
    ["presets_summary", "Quick Amounts", 221],
    ["default_tenor", "Tenor", 73],
    ["state", "Status", 73],
    ["actions", "Actions", 72]
  ]),
  deal_generation_settings_grid: layout("Deal Generating Settings", [
    ["pricing_rule", "Pricing Rule", 96],
    ["client", "Client", 180],
    ["currency_pair", "Ccy Pair", 94],
    ["pricing_mode", "Pricing Mode", 156],
    ["min_base_ccy_amount", "Min Base Ccy Amount", 150],
    ["max_base_ccy_amount", "Max Base Ccy Amount", 150],
    ["amount_step", "Amount Step", 130],
    ["buy_probability", "BUY %", 80],
    ["sell_probability", "SELL %", 80],
    ["active", "Active", 72],
    ["actions", "Actions", 80]
  ])
});

module.exports = {
  UI_TABLE_COLUMN_KEY_ALIASES,
  UI_TABLE_COLUMN_WIDTH_MIN_PX,
  UI_TABLE_COLUMN_WIDTH_MAX_PX,
  UI_TABLE_LAYOUTS
};
