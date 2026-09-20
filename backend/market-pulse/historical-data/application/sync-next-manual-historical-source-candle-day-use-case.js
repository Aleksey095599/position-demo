"use strict";

const {
  CandleTimeframe
} = require("../domain/candle-timeframe");
const {
  ManualHistoricalSourceCandleDayStatus
} = require("./manual-historical-source-candle-sync-plan");

function configurationError(message) {
  const error = new TypeError(message);
  error.code = "INVALID_MANUAL_HISTORICAL_SOURCE_CANDLE_SYNC_CONFIGURATION";
  return error;
}

function failedDayError(day, cause) {
  const error = new Error(
    `Historical Source Candle synchronization failed for ${day.date}.`
  );
  error.code = "HISTORICAL_SOURCE_CANDLE_DAY_SYNC_FAILED";
  error.date = day.date;
  error.from = day.from;
  error.till = day.till;
  error.cause = cause;
  return error;
}

function planWithCompletedDay(plan, completedDay) {
  const days = Object.freeze(plan.days.map(day => (
    day.date === completedDay.date
      ? Object.freeze({
          ...day,
          status: ManualHistoricalSourceCandleDayStatus.COMPLETED
        })
      : day
  )));
  const completedDayCount = days.filter(
    day => day.status === ManualHistoricalSourceCandleDayStatus.COMPLETED
  ).length;
  const pendingDayCount = days.length - completedDayCount;

  return {
    ...plan,
    completedDayCount,
    pendingDayCount,
    complete: pendingDayCount === 0,
    days
  };
}

class SyncNextManualHistoricalSourceCandleDayUseCase {
  constructor({ getPlanUseCase, backfillRangeUseCase } = {}) {
    if (
      !getPlanUseCase
      || typeof getPlanUseCase.execute !== "function"
      || !backfillRangeUseCase
      || typeof backfillRangeUseCase.execute !== "function"
    ) {
      throw configurationError(
        "Manual Historical Source Candle synchronization requires plan and range execution dependencies."
      );
    }

    this.getPlanUseCase = getPlanUseCase;
    this.backfillRangeUseCase = backfillRangeUseCase;
  }

  async execute(command = {}) {
    const plan = await this.getPlanUseCase.execute(command);
    const pendingDay = plan.days.find(
      day => day.status === ManualHistoricalSourceCandleDayStatus.PENDING
    );

    if (!pendingDay) {
      return Object.freeze({
        ...plan,
        processedDay: null
      });
    }

    let result;

    try {
      result = await this.backfillRangeUseCase.execute({
        instrumentId: plan.instrumentId,
        timeframe: CandleTimeframe.ONE_MINUTE,
        from: pendingDay.from,
        till: pendingDay.till
      });
    } catch (error) {
      throw failedDayError(pendingDay, error);
    }

    const updatedPlan = planWithCompletedDay(plan, pendingDay);
    const processedDay = Object.freeze({
      date: pendingDay.date,
      from: pendingDay.from,
      till: pendingDay.till,
      status: ManualHistoricalSourceCandleDayStatus.COMPLETED,
      skipped: Boolean(result?.skipped),
      pageCount: result?.pageCount ?? 0,
      fetchedCandleCount: result?.fetchedCandleCount ?? 0,
      storedCandleCount: result?.storedCandleCount ?? 0
    });

    return Object.freeze({
      ...updatedPlan,
      processedDay
    });
  }
}

module.exports = {
  SyncNextManualHistoricalSourceCandleDayUseCase
};
