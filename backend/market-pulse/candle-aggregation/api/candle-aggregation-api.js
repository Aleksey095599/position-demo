"use strict";

function createCandleAggregationApi(service) {
  let calculating = false;
  const failure = (statusCode, code, message) => ({ statusCode, body: { code, message } });
  async function execute(action, input, field) {
    const keys = action === "batchPlan" ? ["instrumentId"] : ["instrumentId", "timeframe", field];
    if (!input || typeof input !== "object" || Array.isArray(input)
        || Object.keys(input).length !== keys.length || keys.some(key => typeof input[key] !== "string")
        || Object.keys(input).some(key => !keys.includes(key))
        || input.instrumentId !== "CNYRUB_TOM" || action !== "batchPlan" && !["FIVE_MINUTES", "FIFTEEN_MINUTES", "ONE_HOUR", "FOUR_HOURS", "ONE_DAY"].includes(input.timeframe)) {
      return failure(400, "INVALID_CANDLE_AGGREGATION_REQUEST", "Choose CNYRUB_TOM, FIVE_MINUTES, FIFTEEN_MINUTES, ONE_HOUR, FOUR_HOURS or ONE_DAY and a valid historical date or month.");
    }
    if (action === "calculateDay" && calculating) return failure(409, "CANDLE_AGGREGATION_BUSY", "Wait for the current calculation to finish.");
    if (action === "calculateDay") calculating = true;
    try { return { statusCode: 200, body: await service[action](input) }; }
    catch (error) {
      if (["INVALID_CANDLE_AGGREGATION_REQUEST", "INVALID_SOURCE_CANDLE_CALENDAR_REQUEST"].includes(error.code)) {
        return failure(400, error.code, error.message);
      }
      if (["AGGREGATION_SOURCE_DAY_NOT_LOADED", "INVALID_AGGREGATION_SOURCE_CANDLES"].includes(error.code)) {
        return failure(409, error.code, error.message);
      }
      return failure(500, "CANDLE_AGGREGATION_FAILED", "Candle aggregation could not be completed. Check the day details and retry.");
    } finally { if (action === "calculateDay") calculating = false; }
  }
  function query(params) {
    if ([...params.keys()].some(key => params.getAll(key).length !== 1)) return null;
    return Object.fromEntries(params);
  }
  return {
    batchPlan: params => execute("batchPlan", query(params)),
    calendar: params => execute("calendar", query(params), "month"),
    day: params => execute("dayDetails", query(params), "date"),
    calculateDay: body => execute("calculateDay", body, "date")
  };
}

module.exports = { createCandleAggregationApi };
