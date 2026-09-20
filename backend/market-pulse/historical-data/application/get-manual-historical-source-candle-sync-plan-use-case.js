"use strict";

const {
  CandleTimeframe
} = require("../domain/candle-timeframe");
const {
  requireMarketCandleLoadRangeRepository
} = require("../domain/market-candle-load-range-repository");
const {
  applyLoadedRangesToManualHistoricalSourceCandleSyncSchedule,
  createManualHistoricalSourceCandleSyncSchedule
} = require("./manual-historical-source-candle-sync-plan");

function configurationError(message) {
  const error = new TypeError(message);
  error.code = "INVALID_MANUAL_HISTORICAL_SOURCE_CANDLE_SYNC_CONFIGURATION";
  return error;
}

class GetManualHistoricalSourceCandleSyncPlanUseCase {
  constructor({ marketSourceCandleRepository, now = Date.now } = {}) {
    this.marketSourceCandleRepository = requireMarketCandleLoadRangeRepository(
      marketSourceCandleRepository
    );

    if (typeof now !== "function") {
      throw configurationError(
        "Manual Historical Source Candle synchronization requires a clock."
      );
    }

    this.now = now;
  }

  async execute(command = {}) {
    const asOf = Number(this.now());

    if (!Number.isFinite(asOf)) {
      throw configurationError(
        "Manual Historical Source Candle synchronization clock must return a valid timestamp."
      );
    }

    const schedule = createManualHistoricalSourceCandleSyncSchedule({
      instrumentId: command?.instrumentId,
      fromDate: command?.fromDate,
      asOf
    });
    const loadedRanges = await this.marketSourceCandleRepository.findLoadedRanges({
      instrumentId: schedule.instrumentId,
      timeframe: CandleTimeframe.ONE_MINUTE,
      from: schedule.from,
      till: schedule.till
    });

    return applyLoadedRangesToManualHistoricalSourceCandleSyncSchedule(
      schedule,
      loadedRanges
    );
  }
}

module.exports = {
  GetManualHistoricalSourceCandleSyncPlanUseCase
};
