"use strict";

const { candleCoverage, aggregationTimeframe } = require("../../candle-aggregation/domain/aggregation-timeframe");
const CHART_TIMEFRAMES = Object.freeze(["ONE_MINUTE", "FIVE_MINUTES", "FIFTEEN_MINUTES", "ONE_HOUR", "FOUR_HOURS", "ONE_DAY"]);
const CHART_SOURCES = Object.freeze([{ id: "MOEX_ISS", label: "MOEX ISS", instruments: [
  { id: "CNYRUB_TOM", label: "CNY/RUB TOM", precision: 4, minMove: 0.0001, timeframes: CHART_TIMEFRAMES }
] }]);

class ChartCandlesQuery {
  constructor(repository) { this.repository = repository; }

  execute({ source, instrumentId, timeframe, before, limit = "500" }) {
    const instrument = CHART_SOURCES.find(item => item.id === source)?.instruments.find(item => item.id === instrumentId);
    if (!instrument?.timeframes.includes(timeframe) || !/^\d+$/.test(String(limit)) || Number(limit) < 1 || Number(limit) > 1000
      || before !== undefined && (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(before) || !Number.isFinite(Date.parse(before)) || new Date(before).toISOString() !== before)) {
      throw Object.assign(new Error("Choose an available source, instrument, timeframe and a valid candle cursor."), { code: "INVALID_CHART_QUERY" });
    }
    const size = Number(limit);
    const minimumComponentCount = timeframe === "ONE_MINUTE" ? 0 : aggregationTimeframe(timeframe).minimumMinutes;
    const rows = this.repository.findPage({ instrumentId, timeframe, before: before ?? "9999-12-31T23:59:59.999Z", limit: size + 1, minimumComponentCount });
    const candles = rows.slice(0, size).reverse().map(row => ({ ...row,
      stale: Boolean(row.stale), coverage: row.origin === "CALCULATED" ? candleCoverage(timeframe, row.componentCount) : null
    }));
    return { source, instrumentId, timeframe, precision: instrument.precision, minMove: instrument.minMove,
      candles, hasMore: rows.length > size, nextBefore: candles[0]?.begin ?? null };
  }
}

module.exports = { ChartCandlesQuery, CHART_SOURCES };
