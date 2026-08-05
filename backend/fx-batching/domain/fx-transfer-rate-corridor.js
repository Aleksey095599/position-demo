"use strict";

const Big = require("big.js");

const Decimal = Big();
Decimal.strict = true;
Decimal.DP = 40;
Decimal.RM = Decimal.roundHalfUp;

function corridorError(message) {
  const error = new RangeError(message);
  error.code = "INVALID_FX_TRANSFER_RATE_CORRIDOR";
  return error;
}

function positiveDecimal(value, name) {
  let decimal;

  try {
    decimal = new Decimal(String(value));
  } catch {
    throw corridorError(`${name} must be a positive decimal number.`);
  }

  if (decimal.lte("0")) {
    throw corridorError(`${name} must be a positive decimal number.`);
  }

  return decimal;
}

function nonNegativeDecimal(value, name) {
  let decimal;

  try {
    decimal = new Decimal(String(value));
  } catch {
    throw corridorError(`${name} must be a non-negative decimal number.`);
  }

  if (decimal.lt("0")) {
    throw corridorError(`${name} must be a non-negative decimal number.`);
  }

  return decimal;
}

function evaluateTransferRateCorridor({
  currentTransferRates,
  incomingTransferRate,
  maxSpreadPercent
}) {
  if (!Array.isArray(currentTransferRates)) {
    throw corridorError("Current Transfer Rates must be a collection.");
  }

  const rates = currentTransferRates.map((rate, index) => positiveDecimal(
    rate,
    `Current Transfer Rate ${index + 1}`
  ));
  rates.push(positiveDecimal(incomingTransferRate, "Incoming Transfer Rate"));

  const maximumSpread = nonNegativeDecimal(
    maxSpreadPercent,
    "Maximum Transfer Rate Spread Percent"
  );
  let minimumRate = rates[0];
  let maximumRate = rates[0];

  for (const rate of rates.slice(1)) {
    if (rate.lt(minimumRate)) {
      minimumRate = rate;
    }

    if (rate.gt(maximumRate)) {
      maximumRate = rate;
    }
  }

  const spreadNumerator = maximumRate.minus(minimumRate).times("200");
  const spreadDenominator = maximumRate.plus(minimumRate);
  const spreadPercent = spreadNumerator.div(spreadDenominator);

  return Object.freeze({
    transferRateCount: rates.length,
    minTransferRate: minimumRate.toString(),
    maxTransferRate: maximumRate.toString(),
    spreadPercent: spreadPercent.toString(),
    maxSpreadPercent: maximumSpread.toString(),
    isBreached: spreadNumerator.gt(maximumSpread.times(spreadDenominator))
  });
}

module.exports = {
  evaluateTransferRateCorridor
};
