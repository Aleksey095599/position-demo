"use strict";

const { aggregateCandlesFromMinutes } = require("../domain/aggregate-candles-from-minutes");
const { aggregationTimeframe, candleCoverage, AGGREGATION_TIMEFRAMES } = require("../domain/aggregation-timeframe");
const { calendarBounds } = require("../../historical-data/application/source-candle-calendar");
const { readSourceDayIntegrity } = require("../../historical-data/application/source-candle-integrity");

function aggregationError(code, message) {
  return Object.assign(new Error(message), { code });
}

function requiresRecalculation(result, source, timeframe) {
  const sourceIntervalCount = timeframe === "ONE_DAY" ? Number(Boolean(source?.candleCount))
    : timeframe === "FIVE_MINUTES" ? source?.fiveMinuteCount || 0
    : timeframe === "FIFTEEN_MINUTES" ? source?.quarterHourCount || 0
    : (timeframe === "FOUR_HOURS" ? source?.fourHourCount : source?.hourCount) || 0;
  // Старые расчёты исключали интервалы с низким покрытием; они должны быть восстановлены из минут.
  return Boolean(result?.calculatedAt && (result.sourceLoadedAt !== source?.completedAt
    || (result.candleCount || 0) !== sourceIntervalCount));
}

function dayStatus(result, source, timeframe) {
  if (result?.lastError) return "ERROR";
  if (!result?.calculatedAt || !source?.completedAt || requiresRecalculation(result, source, timeframe)) return "PENDING";
  return source.candleCount ? "CALCULATED" : "NO_DATA";
}

class CandleAggregationService {
  constructor({ sourceRepository, aggregationRepository, now = Date.now }) {
    this.source = sourceRepository;
    this.repository = aggregationRepository;
    this.now = now;
  }

  async historyBounds(instrumentId) {
    const bounds = calendarBounds(this.now());
    const storedStart = await this.source.findMinuteHistoryStart({ instrumentId });
    return { ...bounds, earliestDate: storedStart && storedStart < bounds.earliestDate ? storedStart : bounds.earliestDate };
  }

  async batchPlan({ instrumentId }) {
    const bounds = await this.historyBounds(instrumentId);
    const query = { instrumentId, fromDate: bounds.earliestDate, throughDate: bounds.throughDate };
    const days = (await this.source.findSourceDaySummaries({ ...query, timeframe: "ONE_MINUTE" }))
      .filter(day => day.completedAt && day.candleCount > 0).sort((a, b) => a.date.localeCompare(b.date));
    const summaries = new Map();
    for (const timeframe of AGGREGATION_TIMEFRAMES) {
      summaries.set(timeframe, new Map((await this.repository.findDaySummaries({ ...query, timeframe })).map(day => [day.date, day])));
    }
    const commands = [];
    let upToDateCount = 0;
    for (const source of days) {
      for (const timeframe of AGGREGATION_TIMEFRAMES) {
        const result = summaries.get(timeframe).get(source.date);
        if (dayStatus(result, source, timeframe) === "CALCULATED") upToDateCount++;
        else commands.push({ instrumentId, timeframe, date: source.date });
      }
    }
    return { instrumentId, source: "MOEX_ISS", timeframes: AGGREGATION_TIMEFRAMES,
      eligibleDayCount: days.length, pendingDayCount: new Set(commands.map(command => command.date)).size,
      calculationCount: commands.length, upToDateCount,
      fromDate: days[0]?.date || null, throughDate: days.at(-1)?.date || null, commands };
  }

  async calendar({ instrumentId, month, timeframe }) {
    aggregationTimeframe(timeframe);
    const bounds = await this.historyBounds(instrumentId);
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || month < bounds.earliestDate.slice(0, 7)
        || month > bounds.today.slice(0, 7)) {
      throw aggregationError("INVALID_CANDLE_AGGREGATION_REQUEST", "Choose a month within the historical calendar window.");
    }
    const first = Date.parse(`${month}-01T00:00:00Z`);
    const next = new Date(first); next.setUTCMonth(next.getUTCMonth() + 1);
    const query = { instrumentId, timeframe, fromDate: `${month}-01`, throughDate: new Date(next - 86400000).toISOString().slice(0, 10) };
    const sources = new Map((await this.source.findSourceDaySummaries({ ...query, timeframe: "ONE_MINUTE" })).map(day => [day.date, day]));
    const results = new Map((await this.repository.findDaySummaries(query)).map(day => [day.date, day]));
    const days = [];
    for (let time = first; time < next; time += 86400000) {
      const date = new Date(time).toISOString().slice(0, 10);
      const available = date >= bounds.earliestDate && date <= bounds.throughDate;
      const source = sources.get(date);
      const result = results.get(date);
      days.push({ date, available, candleCount: result?.candleCount || 0, partialCount: result?.partialCount || 0,
        completeCount: timeframe === "ONE_DAY" ? 0 : (result?.candleCount || 0) - (result?.partialCount || 0) - (result?.insufficientCount || 0),
        sufficientCount: timeframe === "ONE_DAY" ? (result?.candleCount || 0) - (result?.insufficientCount || 0) : 0,
        insufficientCount: result?.insufficientCount || 0,
        requiresRecalculation: requiresRecalculation(result, source, timeframe),
        calculatedAt: result?.calculatedAt || null, lastError: result?.lastError || null,
        sourceLoaded: Boolean(source?.completedAt), sourceCandleCount: source?.candleCount || 0,
        status: available ? dayStatus(result, source, timeframe) : "UNAVAILABLE" });
    }
    return { instrumentId, timeframe, baseTimeframe: "ONE_MINUTE", month, ...bounds, days };
  }

  async sourceDay(command) {
    aggregationTimeframe(command.timeframe);
    const bounds = await this.historyBounds(command.instrumentId);
    if (typeof command.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(command.date)
        || !Number.isFinite(Date.parse(command.date)) || new Date(command.date).toISOString().slice(0, 10) !== command.date
        || command.date < bounds.earliestDate || command.date > bounds.throughDate) {
      throw aggregationError("INVALID_CANDLE_AGGREGATION_REQUEST", "Choose a completed Moscow day within the stored minute history.");
    }
    const from = Date.parse(`${command.date}T00:00:00+03:00`);
    const query = { instrumentId: command.instrumentId, timeframe: "ONE_MINUTE",
      from: new Date(from).toISOString(), till: new Date(from + 86400000).toISOString() };
    const [source] = await this.source.findSourceDaySummaries({ instrumentId: command.instrumentId,
      timeframe: "ONE_MINUTE", fromDate: command.date, throughDate: command.date });
    return { query, source };
  }

  async calculateDay(command) {
    const { query, source } = await this.sourceDay(command);
    try {
      if (!source?.completedAt) {
        throw aggregationError("AGGREGATION_SOURCE_DAY_NOT_LOADED", "Load the complete minute source day before calculating candles.");
      }
      const { candles } = aggregateCandlesFromMinutes({ ...query, timeframe: command.timeframe, candles: await this.source.findByPeriod(query) });
      const calculatedAt = new Date(this.now()).toISOString();
      await this.repository.replaceDay({ ...query, ...command, candles, calculatedAt, sourceLoadedAt: source.completedAt });
      return { ...command, candleCount: candles.length, partialCount: candles.filter(c => c.coverage === "PARTIAL").length,
        completeCount: candles.filter(c => c.coverage === "COMPLETE").length,
        sufficientCount: candles.filter(c => c.coverage === "SUFFICIENT").length,
        insufficientCount: candles.filter(c => c.coverage === "INSUFFICIENT").length, requiresRecalculation: false,
        status: candles.length ? "CALCULATED" : "NO_DATA", calculatedAt };
    } catch (error) {
      await this.repository.recordFailure({ ...command, error: error.message });
      throw error;
    }
  }

  async dayDetails(command) {
    const { timeframe } = command;
    const { expectedMinutes, minimumMinutes } = aggregationTimeframe(timeframe);
    const { query, source } = await this.sourceDay(command);
    const [result] = await this.repository.findDaySummaries({ ...command, fromDate: command.date, throughDate: command.date });
    const stored = await this.repository.findByPeriod({ ...query, timeframe: command.timeframe });
    const current = aggregateCandlesFromMinutes({ ...query, timeframe: command.timeframe, candles: await this.source.findByPeriod(query) });
    const byBegin = new Map(current.candles.map(c => [c.begin, c]));
    const stale = requiresRecalculation(result, source, timeframe);
    const sourceIntegrity = await readSourceDayIntegrity(this.source, command.instrumentId, command.date);
    const intervalCoverage = expectedMinutes !== null && result?.calculatedAt && !stale ? Array.from({ length: 1440 / expectedMinutes }, (_, index) => {
      const minuteOfDay = index * expectedMinutes;
      const begin = new Date(Date.parse(query.from) + minuteOfDay * 60000).toISOString();
      const covered = byBegin.get(begin);
      return { hour: Math.floor(minuteOfDay / 60), minuteOfDay,
        coverage: covered?.coverage || "NO_DATA", componentCount: covered?.componentCount || 0 };
    }) : null;
    return { ...command, status: dayStatus(result, source, timeframe), calculatedAt: result?.calculatedAt || null,
      lastError: result?.lastError || null, sourceLoaded: Boolean(source?.completedAt), sourceIntegrity,
      stale, intervalCoverage, expectedMinutes, minimumMinutes,
      candles: stored.map(candle => ({ ...candle,
        coverage: candleCoverage(timeframe, candle.componentCount),
        firstSourceBegin: byBegin.get(candle.begin)?.firstSourceBegin || null,
        lastSourceBegin: byBegin.get(candle.begin)?.lastSourceBegin || null,
        missingMinutes: byBegin.get(candle.begin)?.missingMinutes || [] })) };
  }
}

module.exports = { CandleAggregationService };
