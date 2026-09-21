"use strict";

const { verifyDailyCandleOpenClose } = require("./verify-daily-candle-open-close");

function checkSourceCandleIntegrity({ minuteCandles, dailyCandle, minuteLoadCompleted, dailyLoadCompleted }) {
  if (!Array.isArray(minuteCandles)) throw new TypeError("Minute candles must be an array.");
  if (minuteCandles.length && !dailyCandle && dailyLoadCompleted) {
    return Object.freeze({status:"MISSING_DAILY",affectedTimeframe:"ONE_DAY",
      message:"Daily source returned no candle while minute candles exist."});
  }
  if (dailyCandle && !minuteCandles.length && minuteLoadCompleted) {
    return Object.freeze({status:"MISSING_MINUTES",affectedTimeframe:"ONE_MINUTE",
      message:"Minute source returned no candles while a daily candle exists."});
  }
  if (!minuteLoadCompleted || (!dailyCandle && !dailyLoadCompleted)) {
    return Object.freeze({status:"NOT_CHECKED",message:"Both source datasets are not yet available for comparison."});
  }
  if (!dailyCandle && !minuteCandles.length) return Object.freeze({status:"EMPTY"});
  const result = verifyDailyCandleOpenClose({dailyCandle,minuteCandles});
  return Object.freeze({...result,...(result.status === "MISMATCH"
    ? {message:`Open/Close mismatch: daily ${result.dailyOpen} / ${result.dailyClose}; minutes ${result.firstMinuteOpen} / ${result.lastMinuteClose}.`}
    : {})});
}

module.exports = { checkSourceCandleIntegrity };
