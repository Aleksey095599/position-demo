"use strict";

const {
  CandleTimeframe
} = require("../domain/candle-timeframe");
const {
  requireMarketCandleLoadRangeRepository
} = require("../domain/market-candle-load-range-repository");
const {
  createHistoricalCandleBackfillPlan
} = require("./historical-candle-backfill-plan");

function configurationError(message) {
  const error = new TypeError(message);
  error.code = "INVALID_HISTORICAL_CANDLE_BACKFILL_STATUS_CONFIGURATION";
  return error;
}

function rangeIsCovered(range, loadedRanges) {
  const fromTimestamp = Date.parse(range.from);
  const tillTimestamp = Date.parse(range.till);

  return loadedRanges.some(loadedRange => (
    Date.parse(loadedRange.from) <= fromTimestamp
    && Date.parse(loadedRange.till) >= tillTimestamp
  ));
}

function progressFor({ timeframe, plannedRanges, loadedRanges, window }) {
  const coveredRanges = plannedRanges.filter(range => (
    rangeIsCovered(range, loadedRanges)
  ));
  const nextRange = plannedRanges.find(range => (
    !rangeIsCovered(range, loadedRanges)
  )) || null;

  return Object.freeze({
    timeframe,
    from: window.from,
    till: window.till,
    plannedRangeCount: plannedRanges.length,
    loadedRangeCount: coveredRanges.length,
    complete: coveredRanges.length === plannedRanges.length,
    nextRange
  });
}

class GetHistoricalCandleBackfillStatusUseCase {
  constructor({
    marketSourceCandleRepository,
    createPlan = createHistoricalCandleBackfillPlan
  } = {}) {
    this.marketSourceCandleRepository = requireMarketCandleLoadRangeRepository(
      marketSourceCandleRepository
    );

    if (typeof createPlan !== "function") {
      throw configurationError("Backfill status requires a plan dependency.");
    }

    this.createPlan = createPlan;
  }

  async execute({ instrumentId, asOf } = {}) {
    const plan = this.createPlan({ instrumentId, asOf });
    const [minuteLoadedRanges, dailyLoadedRanges] = await Promise.all([
      this.marketSourceCandleRepository.findLoadedRanges({
        instrumentId: plan.instrumentId,
        timeframe: CandleTimeframe.ONE_MINUTE,
        ...plan.minuteWindow
      }),
      this.marketSourceCandleRepository.findLoadedRanges({
        instrumentId: plan.instrumentId,
        timeframe: CandleTimeframe.ONE_DAY,
        ...plan.dailyWindow
      })
    ]);
    const minute = progressFor({
      timeframe: CandleTimeframe.ONE_MINUTE,
      plannedRanges: plan.minuteRanges,
      loadedRanges: minuteLoadedRanges,
      window: plan.minuteWindow
    });
    const daily = progressFor({
      timeframe: CandleTimeframe.ONE_DAY,
      plannedRanges: plan.dailyRanges,
      loadedRanges: dailyLoadedRanges,
      window: plan.dailyWindow
    });

    return Object.freeze({
      instrumentId: plan.instrumentId,
      asOf: plan.asOf,
      complete: minute.complete && daily.complete,
      minute,
      daily
    });
  }
}

module.exports = {
  GetHistoricalCandleBackfillStatusUseCase
};
