"use strict";

function analyticalPnlReportQuery(whereSql = "") {
  return `
    WITH report_deals AS
    (
      SELECT
        trade_id,
        trade_type,
        counterparty_id,
        transfer_rate,
        analytical_pnl_quote_minor,
        analytical_pnl_quote_fraction_digits
      FROM client_fx_deals

      UNION ALL

      SELECT
        trade_id,
        trade_type,
        counterparty_id,
        transfer_rate,
        analytical_pnl_quote_minor,
        analytical_pnl_quote_fraction_digits
      FROM fx_hedge_deals
    )
    SELECT
      exposure.trade_id AS tradeId,
      exposure.trade_type AS tradeType,
      exposure.trade_date AS tradeDate,
      exposure.execution_timestamp AS executionTimestamp,
      exposure.received_timestamp AS receivedTimestamp,
      deal.counterparty_id AS counterpartyId,
      COALESCE(external.counterparty_code_type, 'INTERNAL_UNIT_CODE')
        AS counterpartyCodeType,
      COALESCE(external.counterparty_code, internal.unit_code)
        AS counterpartyCode,
      counterparty.counterparty_name AS counterpartyName,
      exposure.ccy_pair_code AS ccyPairCode,
      pair.base_ccy_code AS baseCcyCode,
      pair.quote_ccy_code AS quoteCcyCode,
      pair.base_ccy_code || '/' || pair.quote_ccy_code AS currencyPair,
      exposure.base_ccy_side AS side,
      exposure.base_ccy_amount_minor AS baseCcyAmountMinor,
      exposure.base_ccy_fraction_digits AS baseCcyFractionDigits,
      exposure.quote_ccy_amount_minor AS quoteCcyAmountMinor,
      exposure.quote_ccy_fraction_digits AS quoteCcyFractionDigits,
      exposure.trade_rate AS tradeRate,
      deal.transfer_rate AS transferRate,
      deal.analytical_pnl_quote_minor AS analyticalPnlQuoteMinor,
      deal.analytical_pnl_quote_fraction_digits AS analyticalPnlQuoteFractionDigits
    FROM report_deals deal
    INNER JOIN fx_trade_exposure exposure
      ON exposure.trade_id = deal.trade_id
      AND exposure.trade_type = deal.trade_type
    INNER JOIN trading_counterparties counterparty
      ON counterparty.counterparty_id = deal.counterparty_id
    LEFT JOIN external_counterparties external
      ON external.counterparty_id = counterparty.counterparty_id
    LEFT JOIN internal_units internal
      ON internal.counterparty_id = counterparty.counterparty_id
    INNER JOIN ccy_pair_options pair
      ON pair.ccy_pair_code = exposure.ccy_pair_code
    ${whereSql}
    ORDER BY exposure.trade_date DESC, exposure.trade_id DESC
  `;
}

module.exports = {
  analyticalPnlReportQuery
};
