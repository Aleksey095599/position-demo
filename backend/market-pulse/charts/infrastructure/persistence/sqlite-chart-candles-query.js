"use strict";

class SqliteChartCandlesQuery {
  constructor(database) { this.database = database; }

  findPage({ instrumentId, timeframe, before, limit, minimumComponentCount }) {
    const prices = "c.open_price AS open,c.high_price AS high,c.low_price AS low,c.close_price AS close";
    if (timeframe === "ONE_MINUTE") {
      return this.database.prepare(`SELECT c.begin_at AS begin,${prices},'SOURCE' AS origin,NULL AS componentCount,0 AS stale
        FROM moex_iss_minute_candles c WHERE c.instrument_id=? AND c.timeframe=? AND c.begin_at<?
        ORDER BY c.begin_at DESC LIMIT ?`).all(instrumentId, timeframe, before, limit);
    }
    const calculated = `SELECT c.begin_at AS begin,${prices},'CALCULATED' AS origin,c.component_count AS componentCount,
      (r.calculated_at IS NULL OR r.last_error IS NOT NULL OR r.source_loaded_at IS NOT m.completed_at) AS stale
      FROM moex_iss_aggregated_candles c
      LEFT JOIN moex_iss_candle_aggregation_result r ON r.instrument_id=c.instrument_id AND r.timeframe=c.timeframe AND r.calculation_date=date(c.begin_at,'+3 hours')
      LEFT JOIN moex_iss_minute_candle_load_result m ON m.instrument_id=c.instrument_id AND m.load_date=date(c.begin_at,'+3 hours')
      WHERE c.instrument_id=? AND c.timeframe=? AND c.begin_at<? AND c.component_count>=?`;
    if (timeframe !== "ONE_DAY") {
      return this.database.prepare(`${calculated} ORDER BY begin DESC LIMIT ?`).all(instrumentId, timeframe, before, minimumComponentCount, limit);
    }
    // Исходная D1 используется только при отсутствии расчётной: исключённую свечу не подменяем.
    const fallback = `SELECT c.begin_at AS begin,${prices},'SOURCE' AS origin,NULL AS componentCount,0 AS stale
      FROM moex_iss_day_candles c WHERE c.instrument_id=? AND c.timeframe='ONE_DAY' AND c.begin_at<?
      AND NOT EXISTS (SELECT 1 FROM moex_iss_aggregated_candles a WHERE a.instrument_id=c.instrument_id
        AND a.timeframe='ONE_DAY' AND a.begin_at>=strftime('%Y-%m-%dT%H:%M:%fZ',date(c.begin_at,'+3 hours'),'-3 hours')
        AND a.begin_at<strftime('%Y-%m-%dT%H:%M:%fZ',date(c.begin_at,'+3 hours'),'+1 day','-3 hours'))`;
    return this.database.prepare(`${calculated} UNION ALL ${fallback} ORDER BY begin DESC LIMIT ?`)
      .all(instrumentId, timeframe, before, minimumComponentCount, instrumentId, before, limit);
  }
}
module.exports = { SqliteChartCandlesQuery };
