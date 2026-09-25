"use strict";
const { ChartCandlesQuery } = require("../application/chart-candles-query");
const { SqliteChartCandlesQuery } = require("../infrastructure/persistence/sqlite-chart-candles-query");
const { createChartCandlesApi } = require("../api/chart-candles-api");

function createChartsModule(database) {
  return createChartCandlesApi(new ChartCandlesQuery(new SqliteChartCandlesQuery(database)));
}
module.exports = { createChartsModule };
