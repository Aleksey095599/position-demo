"use strict";

const { aggregateHourlyCandles, MINIMUM_HOURLY_COMPONENTS } = require("../domain/aggregate-hourly-candles");
const { calendarBounds, sourceDayQuery } = require("../../historical-data/application/source-candle-calendar");
const { readSourceDayIntegrity } = require("../../historical-data/application/source-candle-integrity");

function aggregationError(code, message) {
  return Object.assign(new Error(message), { code });
}

function requiresRecalculation(result, source) {
  return Boolean(result?.calculatedAt && (result.sourceLoadedAt !== source?.completedAt
    || result.minimumComponentCount < MINIMUM_HOURLY_COMPONENTS));
}

function insufficientCount(result, source) {
  // После расчёта каждому непустому исходному часу соответствует сохранённая свеча либо исключение по покрытию.
  return Math.max(0, (source?.hourCount || 0) - (result?.candleCount || 0));
}

function dayStatus(result, source) {
  if (result?.lastError) return "ERROR";
  if (!result?.calculatedAt || !source?.completedAt || requiresRecalculation(result, source)) return "PENDING";
  return source.candleCount ? "CALCULATED" : "NO_DATA";
}

class CandleAggregationService {
  constructor({ sourceRepository, aggregationRepository, now = Date.now }) {
    this.source = sourceRepository;
    this.repository = aggregationRepository;
    this.now = now;
  }

  async calendar({ instrumentId, month, timeframe }) {
    const bounds = calendarBounds(this.now());
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
        completeCount: (result?.candleCount || 0) - (result?.partialCount || 0),
        insufficientCount: result?.calculatedAt && !requiresRecalculation(result, source) ? insufficientCount(result, source) : 0,
        requiresRecalculation: requiresRecalculation(result, source),
        calculatedAt: result?.calculatedAt || null, lastError: result?.lastError || null,
        sourceLoaded: Boolean(source?.completedAt), sourceCandleCount: source?.candleCount || 0,
        status: available ? dayStatus(result, source) : "UNAVAILABLE" });
    }
    return { instrumentId, timeframe, baseTimeframe: "ONE_MINUTE", month, ...bounds, days };
  }

  async sourceDay(command) {
    const query = sourceDayQuery({ ...command, timeframe: "ONE_MINUTE" }, this.now());
    const [source] = await this.source.findSourceDaySummaries({ instrumentId: command.instrumentId,
      timeframe: "ONE_MINUTE", fromDate: command.date, throughDate: command.date });
    return { query, source };
  }

  async calculateDay(command) {
    const { query, source } = await this.sourceDay(command);
    const attempt = { ...command, attemptedAt: new Date(this.now()).toISOString() };
    try {
      if (!source?.completedAt) {
        throw aggregationError("AGGREGATION_SOURCE_DAY_NOT_LOADED", "Load the complete minute source day before calculating candles.");
      }
      const { candles, skippedHours } = aggregateHourlyCandles({ ...query, candles: await this.source.findByPeriod(query) });
      const calculatedAt = new Date(this.now()).toISOString();
      await this.repository.replaceDay({ ...query, ...command, candles, calculatedAt, sourceLoadedAt: source.completedAt });
      return { ...command, candleCount: candles.length, partialCount: candles.filter(c => c.coverage === "PARTIAL").length,
        completeCount: candles.filter(c => c.coverage === "COMPLETE").length,
        insufficientCount: skippedHours.length, requiresRecalculation: false,
        status: candles.length || skippedHours.length ? "CALCULATED" : "NO_DATA", calculatedAt };
    } catch (error) {
      await this.repository.recordFailure({ ...attempt, error: error.message });
      throw error;
    }
  }

  async dayDetails(command) {
    const { query, source } = await this.sourceDay(command);
    const [result] = await this.repository.findDaySummaries({ ...command, fromDate: command.date, throughDate: command.date });
    const stored = await this.repository.findByPeriod({ ...query, timeframe: command.timeframe });
    const current = aggregateHourlyCandles({ ...query, candles: await this.source.findByPeriod(query) });
    const byBegin = new Map([...current.candles, ...current.skippedHours].map(c => [c.begin, c]));
    const stale = requiresRecalculation(result, source);
    const sourceIntegrity = await readSourceDayIntegrity(this.source, command.instrumentId, command.date);
    const hourCoverage = result?.calculatedAt && !stale ? Array.from({ length: 24 }, (_, hour) => {
      const begin = new Date(Date.parse(query.from) + hour * 3600000).toISOString();
      const covered = byBegin.get(begin);
      return { hour, coverage: covered?.coverage || "NO_DATA", componentCount: covered?.componentCount || 0 };
    }) : null;
    return { ...command, status: dayStatus(result, source), calculatedAt: result?.calculatedAt || null,
      lastError: result?.lastError || null, sourceLoaded: Boolean(source?.completedAt), sourceIntegrity,
      stale, hourCoverage,
      skippedHours: result?.calculatedAt && !stale ? current.skippedHours : [],
      hours: stored.map(candle => ({ ...candle,
        firstSourceBegin: byBegin.get(candle.begin)?.firstSourceBegin || null,
        lastSourceBegin: byBegin.get(candle.begin)?.lastSourceBegin || null,
        missingMinutes: byBegin.get(candle.begin)?.missingMinutes || [] })) };
  }
}

module.exports = { CandleAggregationService };
