"use strict";

const SOURCE_TRADE_TYPES = new Set(["CLIENT_DEAL", "HEDGE_DEAL"]);
const TRADE_SIDES = new Set(["BUY", "SELL"]);

function batchCalculationError(code, message) {
  const error = new RangeError(message);
  error.code = code;
  return error;
}

function positiveNumber(value, name) {
  const number = Number(value);

  if (!Number.isFinite(number) || number <= 0) {
    throw batchCalculationError(
      "INVALID_BATCH_SOURCE_TRADE",
      `${name} must be a positive number.`
    );
  }

  return number;
}

function fractionDigits(value, name) {
  const digits = Number(value);

  if (!Number.isInteger(digits) || digits < 0 || digits > 10) {
    throw batchCalculationError(
      "INVALID_BATCH_CURRENCY_PRECISION",
      `${name} must be an integer from 0 to 10.`
    );
  }

  return digits;
}

function requiredText(value, name) {
  const text = String(value || "").trim().toUpperCase();

  if (!text) {
    throw batchCalculationError(
      "INVALID_BATCH_SOURCE_TRADE",
      `${name} is required.`
    );
  }

  return text;
}

function roundToFractionDigits(value, digits) {
  return Number(value.toFixed(digits));
}

function normalizedSourceTrade(value) {
  const source = value && typeof value === "object" ? value : {};
  const tradeId = Number(source.tradeId);
  const tradeType = requiredText(source.tradeType, "Trade Type");
  const side = requiredText(source.side, "Trade Side");

  if (!Number.isInteger(tradeId) || tradeId <= 0) {
    throw batchCalculationError(
      "INVALID_BATCH_SOURCE_TRADE",
      "Trade ID must be a positive integer."
    );
  }

  if (!SOURCE_TRADE_TYPES.has(tradeType)) {
    throw batchCalculationError(
      "INVALID_BATCH_SOURCE_TRADE",
      `Trade ${tradeId} must be a CLIENT_DEAL or HEDGE_DEAL.`
    );
  }

  if (!TRADE_SIDES.has(side)) {
    throw batchCalculationError(
      "INVALID_BATCH_SOURCE_TRADE",
      `Trade ${tradeId} Side must be BUY or SELL.`
    );
  }

  return {
    tradeId,
    tradeType,
    side,
    ccyPairCode: requiredText(source.ccyPairCode, "Ccy Pair Code"),
    tradeDate: requiredText(source.tradeDate, "Trade Date"),
    tenor: requiredText(source.tenor, "Tenor"),
    baseCcyValueDate: requiredText(source.baseCcyValueDate, "Base Ccy Value Date"),
    quoteCcyValueDate: requiredText(source.quoteCcyValueDate, "Quote Ccy Value Date"),
    baseCcyAmount: positiveNumber(source.baseCcyAmount, `Trade ${tradeId} Base Ccy Amount`),
    transferRate: positiveNumber(source.transferRate, `Trade ${tradeId} Transfer Rate`)
  };
}

function assertSingleSettlementBucket(trades) {
  const first = trades[0];
  const fields = [
    ["ccyPairCode", "Ccy Pair"],
    ["tradeDate", "Trade Date"],
    ["tenor", "Tenor"],
    ["baseCcyValueDate", "Base Ccy Value Date"],
    ["quoteCcyValueDate", "Quote Ccy Value Date"]
  ];

  for (const [field, label] of fields) {
    if (trades.some(trade => trade[field] !== first[field])) {
      throw batchCalculationError(
        "INCOMPATIBLE_BATCH_SELECTION",
        `Selected trades must have the same ${label}.`
      );
    }
  }
}

function calculateBatchBalancingTradePair({
  trades,
  rateFractionDigits = 4,
  quoteFractionDigits = 2,
  now = () => new Date()
}) {
  if (!Array.isArray(trades) || trades.length === 0) {
    throw batchCalculationError(
      "EMPTY_BATCH_SELECTION",
      "Select at least one Client or Hedge FX Deal."
    );
  }

  const normalizedTrades = trades.map(normalizedSourceTrade);
  const sourceTradeIds = normalizedTrades.map(trade => trade.tradeId);

  if (new Set(sourceTradeIds).size !== sourceTradeIds.length) {
    throw batchCalculationError(
      "DUPLICATE_BATCH_SOURCE_TRADE",
      "Each selected Trade ID may be included only once."
    );
  }

  assertSingleSettlementBucket(normalizedTrades);

  const rateDigits = fractionDigits(rateFractionDigits, "Rate Fraction Digits");
  const quoteDigits = fractionDigits(quoteFractionDigits, "Quote Fraction Digits");
  const timestamp = now();

  if (!(timestamp instanceof Date) || Number.isNaN(timestamp.getTime())) {
    throw batchCalculationError(
      "INVALID_BATCH_TIMESTAMP",
      "Current timestamp must be a valid Date."
    );
  }

  const net = normalizedTrades.reduce((position, trade) => {
    const direction = trade.side === "SELL" ? 1 : -1;
    position.base += direction * trade.baseCcyAmount;
    position.quote -= direction * trade.baseCcyAmount * trade.transferRate;
    return position;
  }, { base: 0, quote: 0 });
  const normalizedNetBase = roundToFractionDigits(net.base, 10);
  const normalizedNetQuote = roundToFractionDigits(net.quote, 10);

  if (normalizedNetBase === 0) {
    throw batchCalculationError(
      "BATCH_SELECTION_ALREADY_BALANCED",
      "Selected trades already have a flat Base Ccy position."
    );
  }

  if (normalizedNetQuote === 0 || Math.sign(normalizedNetBase) === Math.sign(normalizedNetQuote)) {
    throw batchCalculationError(
      "INVALID_BATCH_BALANCING_RATE",
      "Selected trades do not produce a positive balancing Transfer Rate."
    );
  }

  const balancingSide = normalizedNetBase > 0 ? "BUY" : "SELL";
  const positionOutSide = balancingSide === "BUY" ? "SELL" : "BUY";
  const baseCcyAmount = Math.abs(normalizedNetBase);
  const exactTransferRate = Math.abs(normalizedNetQuote / normalizedNetBase);
  const tradeRate = roundToFractionDigits(exactTransferRate, rateDigits);
  const quoteCcyAmount = roundToFractionDigits(baseCcyAmount * tradeRate, quoteDigits);
  const first = normalizedTrades[0];
  const commonTerms = {
    entryTimestamp: timestamp.toISOString(),
    tradeDate: first.tradeDate,
    ccyPairCode: first.ccyPairCode,
    baseCcyAmount,
    quoteCcyAmount,
    tradeRate,
    tenor: first.tenor,
    baseCcyValueDate: first.baseCcyValueDate,
    quoteCcyValueDate: first.quoteCcyValueDate
  };

  return {
    sourceTradeIds,
    sourceNetSide: normalizedNetBase > 0 ? "SELL" : "BUY",
    sourceNetBaseCcyAmount: baseCcyAmount,
    sourceNetTransferQuoteAmount: Math.abs(normalizedNetQuote),
    exactTransferRate,
    roundingResidualQuoteAmount: roundToFractionDigits(
      Math.abs(normalizedNetQuote) - quoteCcyAmount,
      quoteDigits
    ),
    balancingTrade: {
      ...commonTerms,
      tradeType: "BATCH_BALANCING_TRADE",
      side: balancingSide
    },
    positionOutTrade: {
      ...commonTerms,
      tradeType: "BATCH_POSITION_OUT",
      side: positionOutSide
    }
  };
}

module.exports = {
  calculateBatchBalancingTradePair
};
