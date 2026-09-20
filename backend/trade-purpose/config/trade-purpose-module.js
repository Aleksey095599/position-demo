"use strict";

const { TradePurposeService } = require("../application/trade-purpose-service");
const { createTradePurposeApi } = require("../api/trade-purpose-api");
const { SqliteTradePurposeRepository } = require("../infrastructure/persistence/sqlite-trade-purpose-repository");

function createTradePurposeModule(database) {
  const repository = new SqliteTradePurposeRepository(database);
  const service = new TradePurposeService(repository);
  return createTradePurposeApi(service);
}

module.exports = { createTradePurposeModule };
