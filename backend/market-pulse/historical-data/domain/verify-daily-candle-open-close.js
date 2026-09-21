"use strict";

const Big = require("big.js");
const { createCandle } = require("./candle");

function verifyDailyCandleOpenClose({ dailyCandle, minuteCandles }) {
  if (!Array.isArray(minuteCandles)) throw new TypeError("Minute candles must be an array.");
  if (!dailyCandle || minuteCandles.length === 0) {
    return Object.freeze({status:"NOT_CHECKED",reason:!dailyCandle ? "NO_DAILY_CANDLE" : "NO_MINUTE_CANDLES"});
  }
  const daily = createCandle(dailyCandle);
  const minutes = minuteCandles.map(createCandle).sort((a,b) => Date.parse(a.begin)-Date.parse(b.begin));
  const first = minutes[0], last = minutes.at(-1);
  const openMatches = new Big(daily.open).eq(first.open);
  const closeMatches = new Big(daily.close).eq(last.close);
  return Object.freeze({
    status:openMatches && closeMatches ? "MATCH" : "MISMATCH",
    openMatches,closeMatches,
    dailyOpen:daily.open,dailyClose:daily.close,
    firstMinuteBegin:first.begin,firstMinuteOpen:first.open,
    lastMinuteBegin:last.begin,lastMinuteClose:last.close
  });
}

module.exports = { verifyDailyCandleOpenClose };
