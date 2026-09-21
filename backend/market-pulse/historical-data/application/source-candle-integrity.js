"use strict";

const { checkSourceCandleIntegrity } = require("../domain/check-source-candle-integrity");

function checkDaySummaries(minuteDay, dailyDay) {
  return checkSourceCandleIntegrity({
    minuteCandles:minuteDay?.firstCandle ? [minuteDay.firstCandle,minuteDay.lastCandle] : [],
    dailyCandle:dailyDay?.firstCandle,
    minuteLoadCompleted:Boolean(minuteDay?.completedAt),
    dailyLoadCompleted:Boolean(dailyDay?.completedAt)
  });
}

async function readSourceDayIntegrity(repository, instrumentId, date) {
  const query = {instrumentId,fromDate:date,throughDate:date};
  const [minutes, daily] = await Promise.all([
    repository.findSourceDaySummaries({...query,timeframe:"ONE_MINUTE"}),
    repository.findSourceDaySummaries({...query,timeframe:"ONE_DAY"})
  ]);
  return checkDaySummaries(minutes[0],daily[0]);
}

module.exports = { checkDaySummaries, readSourceDayIntegrity };
