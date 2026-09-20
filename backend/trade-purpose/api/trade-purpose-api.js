"use strict";

const { InvalidTradePurposeError } = require("../domain/trade-purpose");
const {
  DuplicateTradePurposeError,
  TradePurposeNotFoundError
} = require("../application/trade-purpose-service");

function tradePurposeResponse(purpose) {
  return { ...purpose, tradeContextCount: 0 };
}

function tradePurposeFields(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new InvalidTradePurposeError("Trade Purpose request body must be a JSON object.");
  }

  return { tradePurposeId: body.tradePurposeId, name: body.name };
}

function execute(statusCode, operation) {
  try {
    return { statusCode, body: operation() };
  } catch (error) {
    if (error instanceof InvalidTradePurposeError) {
      return { statusCode: 400, body: { code: "INVALID_TRADE_PURPOSE", message: error.message } };
    }
    if (error instanceof TradePurposeNotFoundError) {
      return { statusCode: 404, body: { code: "TRADE_PURPOSE_NOT_FOUND", message: error.message } };
    }
    if (error instanceof DuplicateTradePurposeError) {
      return { statusCode: 409, body: { code: "TRADE_PURPOSE_ALREADY_EXISTS", message: error.message } };
    }

    throw error;
  }
}

function createTradePurposeApi(service) {
  return {
    list: () => service.list().map(tradePurposeResponse),
    create: body => execute(201, () => tradePurposeResponse(service.create(tradePurposeFields(body)))),
    replace: (id, body) => execute(200, () => tradePurposeResponse(service.replace(id, tradePurposeFields(body)))),
    delete: id => execute(204, () => service.delete(id))
  };
}

module.exports = { createTradePurposeApi };
