"use strict";

const {
  createHistoricalCandleBackfillPlan
} = require("./historical-candle-backfill-plan");

const DEFAULT_MAX_RANGES = 1;
const MAX_RANGES_PER_EXECUTION = 50;

function configurationError(message) {
  const error = new TypeError(message);
  error.code = "INVALID_HISTORICAL_CANDLES_BACKFILL_CONFIGURATION";
  return error;
}

function commandError(message) {
  const error = new RangeError(message);
  error.code = "INVALID_HISTORICAL_CANDLES_BACKFILL_COMMAND";
  return error;
}

function normalizedMaxRanges(value, fallback) {
  const maxRanges = value ?? fallback;

  if (
    !Number.isSafeInteger(maxRanges)
    || maxRanges < 1
    || maxRanges > MAX_RANGES_PER_EXECUTION
  ) {
    throw commandError(
      `Max ranges must be an integer between 1 and ${MAX_RANGES_PER_EXECUTION}.`
    );
  }

  return maxRanges;
}

class BackfillHistoricalCandlesUseCase {
  constructor({
    backfillRangeUseCase,
    createPlan = createHistoricalCandleBackfillPlan,
    defaultMaxRanges = DEFAULT_MAX_RANGES
  } = {}) {
    if (
      !backfillRangeUseCase
      || typeof backfillRangeUseCase.execute !== "function"
      || typeof createPlan !== "function"
    ) {
      throw configurationError(
        "Historical Candles backfill requires range execution and plan dependencies."
      );
    }

    this.defaultMaxRanges = normalizedMaxRanges(
      defaultMaxRanges,
      DEFAULT_MAX_RANGES
    );
    this.backfillRangeUseCase = backfillRangeUseCase;
    this.createPlan = createPlan;
  }

  async execute(command = {}) {
    const source = command && typeof command === "object" && !Array.isArray(command)
      ? command
      : {};
    const maxRanges = normalizedMaxRanges(
      source.maxRanges,
      this.defaultMaxRanges
    );
    const plan = this.createPlan({
      instrumentId: source.instrumentId,
      asOf: source.asOf
    });
    const loadedRanges = [];
    let skippedRangeCount = 0;
    let inspectedRangeCount = 0;

    for (const range of plan.ranges) {
      const result = await this.backfillRangeUseCase.execute(range);
      inspectedRangeCount += 1;

      if (result.skipped) {
        skippedRangeCount += 1;
        continue;
      }

      loadedRanges.push(result);

      if (loadedRanges.length >= maxRanges) {
        break;
      }
    }

    const frozenLoadedRanges = Object.freeze([...loadedRanges]);

    return Object.freeze({
      instrumentId: plan.instrumentId,
      asOf: plan.asOf,
      minuteWindow: plan.minuteWindow,
      dailyWindow: plan.dailyWindow,
      requestedRangeCount: plan.ranges.length,
      inspectedRangeCount,
      skippedRangeCount,
      loadedRangeCount: frozenLoadedRanges.length,
      fetchedCandleCount: frozenLoadedRanges.reduce(
        (total, result) => total + result.fetchedCandleCount,
        0
      ),
      storedCandleCount: frozenLoadedRanges.reduce(
        (total, result) => total + result.storedCandleCount,
        0
      ),
      pageCount: frozenLoadedRanges.reduce(
        (total, result) => total + result.pageCount,
        0
      ),
      complete: inspectedRangeCount === plan.ranges.length,
      loadedRanges: frozenLoadedRanges
    });
  }
}

module.exports = {
  BackfillHistoricalCandlesUseCase
};
