"use strict";

const TIMEFRAMES = Object.freeze({ ONE_HOUR: 60, FOUR_HOURS: 240, ONE_DAY: 1440 });

function aggregationTimeframe(timeframe) {
  const expectedMinutes = TIMEFRAMES[timeframe];
  if (!expectedMinutes) {
    throw Object.assign(new RangeError("Choose ONE_HOUR, FOUR_HOURS or ONE_DAY for candle calculation."),
      { code: "INVALID_CANDLE_AGGREGATION_REQUEST" });
  }
  return { expectedMinutes: timeframe === "ONE_DAY" ? null : expectedMinutes,
    minimumMinutes: timeframe === "ONE_DAY" ? 240 : expectedMinutes / 2,
    durationMs: expectedMinutes * 60000 };
}

function candleCoverage(timeframe, componentCount) {
  const { expectedMinutes, minimumMinutes } = aggregationTimeframe(timeframe);
  if (!componentCount) return "NO_DATA";
  if (componentCount < minimumMinutes) return "INSUFFICIENT";
  // Для дня достаточность не означает полную сессию: её историческое расписание неизвестно.
  if (expectedMinutes === null) return "SUFFICIENT";
  return componentCount < expectedMinutes ? "PARTIAL" : "COMPLETE";
}

module.exports = { aggregationTimeframe, candleCoverage };
