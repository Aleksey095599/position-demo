"use strict";

class SqliteCandleAggregationRepository {
  constructor(database) { this.database = database; }

  replaceDay({ instrumentId, timeframe, date, from, till, candles, calculatedAt, sourceLoadedAt }) {
    const insert = this.database.prepare(`INSERT INTO moex_iss_aggregated_candles
      (instrument_id,timeframe,begin_at,end_at,open_price,high_price,low_price,close_price,base_timeframe,component_count,calculated_at)
      VALUES (?,?,?,?,?,?,?,?,'ONE_MINUTE',?,?)`);
    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.database.prepare(`DELETE FROM moex_iss_aggregated_candles WHERE instrument_id=? AND timeframe=? AND begin_at>=? AND begin_at<?`)
        .run(instrumentId, timeframe, from, till);
      for (const candle of candles) insert.run(instrumentId, timeframe, candle.begin, candle.end,
        candle.open, candle.high, candle.low, candle.close, candle.componentCount, calculatedAt);
      this.database.prepare(`INSERT INTO moex_iss_candle_aggregation_result
        (instrument_id,timeframe,calculation_date,calculated_at,source_loaded_at,last_attempt_at,last_error)
        VALUES (?,?,?,?,?,?,NULL) ON CONFLICT (instrument_id,timeframe,calculation_date) DO UPDATE SET
        calculated_at=excluded.calculated_at,source_loaded_at=excluded.source_loaded_at,
        last_attempt_at=excluded.last_attempt_at,last_error=NULL`)
        .run(instrumentId, timeframe, date, calculatedAt, sourceLoadedAt, calculatedAt);
      this.database.exec("COMMIT");
    } catch (error) { this.database.exec("ROLLBACK"); throw error; }
  }

  recordFailure({ instrumentId, timeframe, date, attemptedAt, error }) {
    this.database.prepare(`INSERT INTO moex_iss_candle_aggregation_result
      (instrument_id,timeframe,calculation_date,last_attempt_at,last_error) VALUES (?,?,?,?,?)
      ON CONFLICT (instrument_id,timeframe,calculation_date) DO UPDATE SET
      last_attempt_at=excluded.last_attempt_at,last_error=excluded.last_error`)
      .run(instrumentId, timeframe, date, attemptedAt, String(error).slice(0, 1000));
  }

  findDaySummaries({ instrumentId, timeframe, fromDate, throughDate }) {
    const rows = this.database.prepare(`SELECT calculation_date date,calculated_at calculatedAt,
      source_loaded_at sourceLoadedAt,last_error lastError FROM moex_iss_candle_aggregation_result
      WHERE instrument_id=? AND timeframe=? AND calculation_date BETWEEN ? AND ?`)
      .all(instrumentId, timeframe, fromDate, throughDate);
    const days = new Map(rows.map(row => [row.date, { ...row, candleCount: 0, partialCount: 0 }]));
    const from = new Date(`${fromDate}T00:00:00+03:00`).toISOString();
    const till = new Date(Date.parse(`${throughDate}T00:00:00+03:00`) + 86400000).toISOString();
    for (const row of this.database.prepare(`SELECT date(begin_at,'+3 hours') date,COUNT(*) candleCount,
      MIN(component_count) minimumComponentCount,
      SUM(CASE WHEN component_count<60 THEN 1 ELSE 0 END) partialCount FROM moex_iss_aggregated_candles
      WHERE instrument_id=? AND timeframe=? AND begin_at>=? AND begin_at<? GROUP BY date(begin_at,'+3 hours')`)
      .all(instrumentId, timeframe, from, till)) days.set(row.date, { ...days.get(row.date), ...row });
    return [...days.values()];
  }

  findByPeriod({ instrumentId, timeframe, from, till }) {
    return this.database.prepare(`SELECT begin_at begin,end_at end,open_price open,high_price high,
      low_price low,close_price close,component_count componentCount FROM moex_iss_aggregated_candles
      WHERE instrument_id=? AND timeframe=? AND begin_at>=? AND begin_at<? ORDER BY begin_at`)
      .all(instrumentId, timeframe, from, till).map(row => ({ ...row,
        open: String(row.open), high: String(row.high), low: String(row.low), close: String(row.close) }));
  }
}

module.exports = { SqliteCandleAggregationRepository };
