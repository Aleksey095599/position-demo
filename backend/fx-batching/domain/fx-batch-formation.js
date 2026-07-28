"use strict";

const Big = require("big.js");
const {
  calculateQuoteMinor
} = require("../../money/money");

const Decimal = Big();
Decimal.strict = true;
Decimal.DP = 40;
Decimal.RM = Decimal.roundHalfUp;

const TRADE_SIDES = new Set(["BUY", "SELL"]);

function batchFormationError(code, message) {
  const error = new RangeError(message);
  error.code = code;
  return error;
}

function positiveDecimal(value, name) {
  let decimal;

  try {
    decimal = new Decimal(String(value));
  } catch {
    throw batchFormationError(
      "INVALID_BATCH_SOURCE_TRADE",
      `${name} must be a positive number.`
    );
  }

  if (decimal.lte("0")) {
    throw batchFormationError(
      "INVALID_BATCH_SOURCE_TRADE",
      `${name} must be a positive number.`
    );
  }

  return decimal;
}

function positiveMinorUnits(value, name) {
  let minorUnits;

  if (typeof value === "bigint") {
    minorUnits = value;
  } else if (typeof value === "number" && Number.isSafeInteger(value)) {
    minorUnits = BigInt(value);
  } else if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    minorUnits = BigInt(value.trim());
  } else {
    throw batchFormationError(
      "INVALID_BATCH_SOURCE_TRADE",
      `${name} must be a positive integer.`
    );
  }

  if (minorUnits <= 0n) {
    throw batchFormationError(
      "INVALID_BATCH_SOURCE_TRADE",
      `${name} must be a positive integer.`
    );
  }

  return minorUnits;
}

function fractionDigits(value, name) {
  const digits = Number(value);

  if (!Number.isInteger(digits) || digits < 0 || digits > 10) {
    throw batchFormationError(
      "INVALID_BATCH_CURRENCY_PRECISION",
      `${name} must be an integer from 0 to 10.`
    );
  }

  return digits;
}

function requiredText(value, name) {
  const text = String(value || "").trim().toUpperCase();

  if (!text) {
    throw batchFormationError(
      "INVALID_BATCH_SOURCE_TRADE",
      `${name} is required.`
    );
  }

  return text;
}

function powerOfTen(exponent) {
  return new Decimal("10").pow(exponent);
}

function exactQuoteMinor(baseAmountMinor, baseDigits, rate, quoteDigits) {
  return new Decimal(baseAmountMinor.toString())
    .div(powerOfTen(baseDigits))
    .times(rate)
    .times(powerOfTen(quoteDigits));
}

function roundedMinorUnits(value) {
  return BigInt(value.round(0, Decimal.roundHalfUp).toFixed(0));
}

function absoluteMinorUnits(value) {
  return value < 0n ? -value : value;
}

function normalizedSourceTrade(value) {
  const source = value && typeof value === "object" ? value : {};
  const tradeId = Number(source.tradeId);
  const tradeType = requiredText(source.tradeType, "Trade Type");
  const side = requiredText(source.side, "Trade Side");

  if (!Number.isInteger(tradeId) || tradeId <= 0) {
    throw batchFormationError(
      "INVALID_BATCH_SOURCE_TRADE",
      "Trade ID must be a positive integer."
    );
  }

  if (!TRADE_SIDES.has(side)) {
    throw batchFormationError(
      "INVALID_BATCH_SOURCE_TRADE",
      `Trade ${tradeId} Side must be BUY or SELL.`
    );
  }

  const baseCcyCode = requiredText(source.baseCcyCode, "Base Ccy Code");
  const quoteCcyCode = requiredText(source.quoteCcyCode, "Quote Ccy Code");
  const dealtCcyCode = requiredText(source.dealtCcyCode, "Dealt Ccy Code");

  if (baseCcyCode === quoteCcyCode) {
    throw batchFormationError(
      "INVALID_BATCH_SOURCE_TRADE",
      `Trade ${tradeId} Base and Quote currencies must differ.`
    );
  }

  if (dealtCcyCode !== baseCcyCode && dealtCcyCode !== quoteCcyCode) {
    throw batchFormationError(
      "INVALID_BATCH_SOURCE_TRADE",
      `Trade ${tradeId} Dealt Ccy Code must be ${baseCcyCode} or ${quoteCcyCode}.`
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
    baseCcyCode,
    quoteCcyCode,
    dealtCcyCode,
    baseCcyAmountMinor: positiveMinorUnits(
      source.baseCcyAmountMinor,
      `Trade ${tradeId} Base Ccy Amount Minor`
    ),
    baseCcyFractionDigits: fractionDigits(
      source.baseCcyFractionDigits,
      `Trade ${tradeId} Base Ccy Fraction Digits`
    ),
    quoteCcyAmountMinor: positiveMinorUnits(
      source.quoteCcyAmountMinor,
      `Trade ${tradeId} Quote Ccy Amount Minor`
    ),
    quoteCcyFractionDigits: fractionDigits(
      source.quoteCcyFractionDigits,
      `Trade ${tradeId} Quote Ccy Fraction Digits`
    ),
    transferRate: positiveDecimal(source.transferRate, `Trade ${tradeId} Transfer Rate`)
  };
}

function assertSingleSettlementBucket(trades) {
  const first = trades[0];
  const fields = [
    ["ccyPairCode", "Ccy Pair"],
    ["baseCcyCode", "Base Ccy"],
    ["quoteCcyCode", "Quote Ccy"],
    ["baseCcyFractionDigits", "Base Ccy Fraction Digits"],
    ["quoteCcyFractionDigits", "Quote Ccy Fraction Digits"],
    ["tradeDate", "Trade Date"],
    ["tenor", "Tenor"],
    ["baseCcyValueDate", "Base Ccy Value Date"],
    ["quoteCcyValueDate", "Quote Ccy Value Date"]
  ];

  for (const [field, label] of fields) {
    if (trades.some(trade => trade[field] !== first[field])) {
      throw batchFormationError(
        "INCOMPATIBLE_BATCH_SELECTION",
        `Selected trades must have the same ${label}.`
      );
    }
  }
}

function commonTradeTerms(first, timestamp) {
  return {
    entryTimestamp: timestamp.toISOString(),
    tradeDate: first.tradeDate,
    ccyPairCode: first.ccyPairCode,
    dealtCcyCode: first.baseCcyCode,
    baseCcyFractionDigits: first.baseCcyFractionDigits,
    quoteCcyFractionDigits: first.quoteCcyFractionDigits,
    tenor: first.tenor,
    baseCcyValueDate: first.baseCcyValueDate,
    quoteCcyValueDate: first.quoteCcyValueDate
  };
}

function formFlatFxBatch({
  sourceTradeIds,
  exactNetTransferQuoteAmountMinor,
  first
}) {
  return {
    sourceTradeIds,
    sourceNetSide: "FLAT",
    sourceNetBaseCcyAmountMinor: 0n,
    sourceNetBaseCcyFractionDigits: first.baseCcyFractionDigits,
    sourceNetTransferQuoteAmountMinor: roundedMinorUnits(
      exactNetTransferQuoteAmountMinor.abs()
    ),
    sourceNetTransferQuoteFractionDigits: first.quoteCcyFractionDigits,
    exactTransferRate: null,
    roundingResidualQuoteAmountMinor: 0n,
    roundingResidualQuoteFractionDigits: first.quoteCcyFractionDigits,
    balanceTrade: null,
    positionOut: null
  };
}

function formFxBatch({
  trades,
  rateFractionDigits = 4,
  now = () => new Date()
}) {
  if (!Array.isArray(trades) || trades.length === 0) {
    throw batchFormationError(
      "EMPTY_BATCH_SELECTION",
      "Select at least one eligible FX Trade."
    );
  }

  const normalizedTrades = trades.map(normalizedSourceTrade);
  const sourceTradeIds = normalizedTrades.map(trade => trade.tradeId);

  if (new Set(sourceTradeIds).size !== sourceTradeIds.length) {
    throw batchFormationError(
      "DUPLICATE_BATCH_SOURCE_TRADE",
      "Each selected Trade ID may be included only once."
    );
  }

  assertSingleSettlementBucket(normalizedTrades);

  const rateDigits = fractionDigits(rateFractionDigits, "Rate Fraction Digits");
  const first = normalizedTrades[0];
  const baseDigits = first.baseCcyFractionDigits;
  const quoteDigits = first.quoteCcyFractionDigits;
  const timestamp = now();

  if (!(timestamp instanceof Date) || Number.isNaN(timestamp.getTime())) {
    throw batchFormationError(
      "INVALID_BATCH_TIMESTAMP",
      "Current timestamp must be a valid Date."
    );
  }

  let netBaseCcyAmountMinor = 0n;
  let exactNetTransferQuoteAmountMinor = new Decimal("0");

  normalizedTrades.forEach(trade => {
    const isSell = trade.side === "SELL";
    netBaseCcyAmountMinor += isSell
      ? trade.baseCcyAmountMinor
      : -trade.baseCcyAmountMinor;

    const transferQuoteAmountMinor = exactQuoteMinor(
      trade.baseCcyAmountMinor,
      trade.baseCcyFractionDigits,
      trade.transferRate,
      trade.quoteCcyFractionDigits
    );
    exactNetTransferQuoteAmountMinor = isSell
      ? exactNetTransferQuoteAmountMinor.minus(transferQuoteAmountMinor)
      : exactNetTransferQuoteAmountMinor.plus(transferQuoteAmountMinor);
  });

  if (netBaseCcyAmountMinor === 0n) {
    return formFlatFxBatch({
      sourceTradeIds,
      exactNetTransferQuoteAmountMinor,
      first
    });
  }

  const netBaseIsPositive = netBaseCcyAmountMinor > 0n;
  const sourceNetSide = netBaseIsPositive ? "SELL" : "BUY";
  const balancingSide = netBaseIsPositive ? "BUY" : "SELL";
  const positionOutSide = balancingSide === "BUY" ? "SELL" : "BUY";
  const baseCcyAmountMinor = absoluteMinorUnits(netBaseCcyAmountMinor);
  let rateSourceBaseCcyAmountMinor = 0n;
  let exactRateSourceQuoteAmountMinor = new Decimal("0");

  normalizedTrades
    .filter(trade => trade.side === sourceNetSide)
    .forEach(trade => {
      rateSourceBaseCcyAmountMinor += trade.baseCcyAmountMinor;
      exactRateSourceQuoteAmountMinor = exactRateSourceQuoteAmountMinor.plus(
        exactQuoteMinor(
          trade.baseCcyAmountMinor,
          trade.baseCcyFractionDigits,
          trade.transferRate,
          trade.quoteCcyFractionDigits
        )
      );
    });

  const exactWeightedTransferRate = exactRateSourceQuoteAmountMinor
    .div(new Decimal(rateSourceBaseCcyAmountMinor.toString()))
    .times(powerOfTen(baseDigits))
    .div(powerOfTen(quoteDigits));
  const tradeRateText = exactWeightedTransferRate
    .round(rateDigits, Decimal.roundHalfUp)
    .toFixed(rateDigits);
  const quoteCcyAmountMinor = calculateQuoteMinor({
    baseAmountMinor: baseCcyAmountMinor,
    baseFractionDigits: baseDigits,
    rate: tradeRateText,
    quoteFractionDigits: quoteDigits
  });
  const sourceNetTransferQuoteAmountMinor = roundedMinorUnits(
    exactNetTransferQuoteAmountMinor.abs()
  );
  const exactBalancingQuoteAmountMinor = exactQuoteMinor(
    baseCcyAmountMinor,
    baseDigits,
    exactWeightedTransferRate,
    quoteDigits
  );
  const roundingResidualQuoteAmountMinor = roundedMinorUnits(
    exactBalancingQuoteAmountMinor.minus(
      new Decimal(quoteCcyAmountMinor.toString())
    )
  );
  const terms = {
    ...commonTradeTerms(first, timestamp),
    baseCcyAmountMinor,
    quoteCcyAmountMinor,
    tradeRate: Number(tradeRateText)
  };

  return {
    sourceTradeIds,
    sourceNetSide,
    sourceNetBaseCcyAmountMinor: baseCcyAmountMinor,
    sourceNetBaseCcyFractionDigits: baseDigits,
    sourceNetTransferQuoteAmountMinor,
    sourceNetTransferQuoteFractionDigits: quoteDigits,
    exactTransferRate: Number(exactWeightedTransferRate.toString()),
    roundingResidualQuoteAmountMinor,
    roundingResidualQuoteFractionDigits: quoteDigits,
    balanceTrade: {
      ...terms,
      tradeType: "BATCH_BALANCE_TRADE",
      side: balancingSide
    },
    positionOut: {
      ...terms,
      tradeType: "BATCH_POSITION_OUT",
      side: positionOutSide
    }
  };
}

module.exports = {
  formFxBatch
};
