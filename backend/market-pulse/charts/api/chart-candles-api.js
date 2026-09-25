"use strict";

const { CHART_SOURCES } = require("../application/chart-candles-query");
function createChartCandlesApi(query) {
  return {
    catalog: () => ({ statusCode: 200, body: { sources: CHART_SOURCES } }),
    candles(params) {
      const allowed = ["source", "instrumentId", "timeframe", "before", "limit"];
      try {
        if ([...params.keys()].some(key => !allowed.includes(key) || params.getAll(key).length !== 1)) {
          throw Object.assign(new Error("Chart query contains unsupported or duplicate parameters."), { code: "INVALID_CHART_QUERY" });
        }
        return { statusCode: 200, body: query.execute(Object.fromEntries(params)) };
      } catch (error) {
        if (error.code !== "INVALID_CHART_QUERY") throw error;
        return { statusCode: 400, body: { code: error.code, message: error.message } };
      }
    }
  };
}
module.exports = { createChartCandlesApi };
