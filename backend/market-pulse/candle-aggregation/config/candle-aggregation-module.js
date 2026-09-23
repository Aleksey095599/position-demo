"use strict";

const { CandleAggregationService } = require("../application/candle-aggregation-service");
const { createCandleAggregationApi } = require("../api/candle-aggregation-api");
const { SqliteCandleAggregationRepository } = require("../infrastructure/persistence/sqlite-candle-aggregation-repository");

function createCandleAggregationModule({ database, sourceRepository }) {
  return createCandleAggregationApi(new CandleAggregationService({
    sourceRepository, aggregationRepository: new SqliteCandleAggregationRepository(database)
  }));
}

module.exports = { createCandleAggregationModule };
