"use strict";

const { createCandle } = require("../../historical-data/domain/candle");
const { checkSourceCandleIntegrity } = require("../../historical-data/domain/check-source-candle-integrity");
const { MINUTE_MS, AGGREGATION_TIMEFRAMES, invalid, instrumentId, moscowDay } = require("../domain/current-day-loading");

function errorMessage(error) { return error.code ? error.code + ": " + error.message : error.message || String(error); }

class CurrentDayLoadingProcess {
  constructor({ repository, sourceRepository, marketDataSource, calculateDay, now = Date.now,
    setTimeoutImpl = setTimeout, clearTimeoutImpl = clearTimeout,
    sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)), minimumRequestIntervalMs = 2000 }) {
    if (typeof marketDataSource?.loadCandlePage !== "function" || typeof calculateDay !== "function") {
      throw new TypeError("Current Day Loading requires a candle source and an aggregation callback.");
    }
    this.repository = repository;
    this.source = sourceRepository;
    this.marketDataSource = marketDataSource;
    this.calculateDay = calculateDay;
    this.now = now;
    this.setTimeout = setTimeoutImpl;
    this.clearTimeout = clearTimeoutImpl;
    this.sleep = sleep;
    this.minimumRequestIntervalMs = minimumRequestIntervalMs;
    this.running = false;
    this.inFlight = null;
    this.timer = null;
    this.nextRunAt = null;
    this.instrumentId = "CNYRUB_TOM";
    this.generation = 0;
    this.fullLoad = true;
    this.activeDate = null;
    this.lastRequestAt = null;
    this.disposed = false;
  }
  status({ instrumentId: requestedInstrument = this.instrumentId } = {}) {
    const instrument = instrumentId(requestedInstrument);
    const day = moscowDay(this.now());
    const state = this.repository.state(instrument, day.date);
    const settings = this.repository.getSettings();
    return { instrumentId: instrument, date: day.date, timeframe: "ONE_MINUTE",
      running: this.running && instrument === this.instrumentId,
      inFlight: Boolean(this.inFlight) && instrument === this.instrumentId,
      nextRunAt: this.running && instrument === this.instrumentId ? this.nextRunAt : null,
      ...state, lastError: state.lastError || this.backgroundError || null, candles: this.source.findByPeriod({ instrumentId: instrument, timeframe: "ONE_MINUTE", from: day.from, till: day.till }),
      settings, finalization: { enabled: settings.reloadAfterDayEnd, pending: this.repository.pending(instrument, day.date),
        lastCompleted: this.repository.latestFinalization(instrument) } };
  }
  bootstrap() {
    if (this.repository.getSettings().autoStart) return this.start();
    return this.status();
  }
  start({ instrumentId: requestedInstrument = this.instrumentId } = {}) {
    if (this.disposed) throw invalid("Current Day Loading has been disposed.");
    const instrument = instrumentId(requestedInstrument);
    if (this.running && this.instrumentId === instrument) return this.status();
    if (this.running || this.inFlight) throw Object.assign(new Error("Current Day Loading is already processing an instrument."), { code: "CURRENT_DAY_LOADING_BUSY" });
    this.instrumentId = instrument;
    this.running = true;
    this.fullLoad = true;
    this.activeDate = null;
    this.generation++;
    void this.runNow();
    return this.status();
  }
  stop() {
    this.running = false;
    this.generation++;
    this.cancelTimer();
    return this.status();
  }
  async dispose() {
    this.stop();
    this.disposed = true;
    if (this.inFlight) await this.inFlight;
  }
  cancelTimer() {
    if (this.timer !== null) this.clearTimeout(this.timer);
    this.timer = null;
    this.nextRunAt = null;
  }
  settingsChanged() {
    if (this.running && !this.disposed) {
      const settings = this.repository.getSettings();
      this.repository.touch({ instrumentId: this.instrumentId, date: moscowDay(this.now()).date, reloadRequested: settings.reloadAfterDayEnd });
      if (!this.inFlight) this.schedule();
    }
  }
  schedule() {
    this.cancelTimer();
    if (!this.running || this.disposed) return;
    const delay = this.repository.getSettings().pollIntervalMinutes * MINUTE_MS;
    this.nextRunAt = new Date(Number(this.now()) + delay).toISOString();
    this.timer = this.setTimeout(() => { this.timer = null; this.nextRunAt = null; void this.runNow(); }, delay);
    this.timer?.unref?.();
  }
  isActive(generation) { return this.running && !this.disposed && this.generation === generation; }
  runNow() {
    if (this.inFlight) return this.inFlight;
    if (!this.running || this.disposed) return Promise.resolve(this.status());
    this.cancelTimer();
    const generation = this.generation;
    // Defer one microtask so the in-flight marker exists before any source request.
    this.inFlight = Promise.resolve().then(() => this.cycle(generation)).catch(error => {
      // Source failures are recorded by cycle. Guard the background task against infrastructure failures too.
      if (this.isActive(generation)) this.backgroundError = errorMessage(error);
    }).finally(() => {
      this.inFlight = null;
      if (this.isActive(generation)) this.schedule();
    });
    return this.inFlight;
  }
  async fetchRange(query, generation) {
    const candles = new Map();
    let start = 0;
    for (let pageNumber = 0; pageNumber < 10; pageNumber++) {
      if (!this.isActive(generation)) return null;
      if (this.lastRequestAt !== null) {
        const wait = this.minimumRequestIntervalMs - (Number(this.now()) - this.lastRequestAt);
        if (wait > 0) await this.sleep(wait);
      }
      if (!this.isActive(generation)) return null;
      this.lastRequestAt = Number(this.now());
      const page = await this.marketDataSource.loadCandlePage(query, { start });
      if (!this.isActive(generation)) return null;
      if (!page || !Array.isArray(page.candles) || typeof page.hasMore !== "boolean"
          || (page.hasMore && (!Number.isSafeInteger(page.nextStart) || page.nextStart <= start))) {
        throw Object.assign(new Error("The source returned an invalid candle page."), { code: "INVALID_CURRENT_DAY_SOURCE_PAGE" });
      }
      for (const value of page.candles) {
        const candle = createCandle(value);
        if (query.timeframe === "ONE_MINUTE" && (Date.parse(candle.begin) % MINUTE_MS !== 0
            || Date.parse(candle.end) >= Date.parse(candle.begin) + MINUTE_MS)) {
          throw Object.assign(new Error("The source returned an invalid minute interval."), { code: "INVALID_CURRENT_DAY_SOURCE_CANDLE" });
        }
        // The request end is a captured timestamp, not a guessed publication-delay boundary.
        // A returned last candle can still change; subsequent cycles reread it inclusively.
        if (candle.begin >= query.from && candle.begin < query.till
            && (query.timeframe !== "ONE_MINUTE" || Date.parse(candle.begin) + MINUTE_MS <= Date.parse(query.till))) candles.set(candle.begin, candle);
      }
      if (!page.hasMore) return [...candles.values()].sort((a, b) => a.begin.localeCompare(b.begin));
      start = page.nextStart;
    }
    throw Object.assign(new Error("The source page limit was reached before the request completed."), { code: "CURRENT_DAY_SOURCE_PAGE_LIMIT_REACHED" });
  }
  async cycle(generation) {
    if (!this.isActive(generation)) return;
    const capturedAt = Number(this.now());
    const day = moscowDay(capturedAt);
    const settings = this.repository.getSettings();
    const instrument = this.instrumentId;
    this.repository.touch({ instrumentId: instrument, date: day.date, reloadRequested: settings.reloadAfterDayEnd });
    if (this.activeDate !== day.date) this.fullLoad = true;
    this.activeDate = day.date;
    const stored = this.source.findByPeriod({ instrumentId: instrument, timeframe: "ONE_MINUTE", from: day.from, till: day.till });
    const from = this.fullLoad || !stored.length ? day.from : stored.at(-1).begin;
    const query = { instrumentId: instrument, timeframe: "ONE_MINUTE", from, till: new Date(capturedAt).toISOString() };
    if (query.from < query.till) {
      this.repository.recordAttempt({ instrumentId: instrument, date: day.date, attemptedAt: query.till });
      try {
        const candles = await this.fetchRange(query, generation);
        if (!candles || !this.isActive(generation)) return;
        const last = candles.at(-1);
        // Only a published candle gives an evidence-based boundary for No data.
        // An empty response cannot distinguish a closed market from delayed publication.
        const checkedTill = last ? new Date(Math.min(Date.parse(last.begin) + MINUTE_MS, capturedAt)).toISOString() : null;
        this.repository.saveCurrent({ instrumentId: instrument, date: day.date, candles,
          checkedRange: checkedTill && from < checkedTill ? { from, till: checkedTill } : null,
          loadedAt: new Date(this.now()).toISOString() });
        this.fullLoad = false;
        this.backgroundError = null;
      } catch (error) {
        if (!this.isActive(generation)) return;
        this.repository.recordFailure({ instrumentId: instrument, date: day.date, error: errorMessage(error), range: { from, till: query.till } });
      }
    }
    if (this.isActive(generation) && this.repository.getSettings().reloadAfterDayEnd) {
      await this.finalizePending(generation, day);
    }
  }
  async finalizePending(generation, today) {
    // 00:01 is a completed-day scheduling policy, not an assumed market-data delay.
    for (const pending of this.repository.pending(this.instrumentId, today.date)) {
      if (!this.isActive(generation) || !this.repository.getSettings().reloadAfterDayEnd) return;
      const day = moscowDay(Date.parse(pending.date + "T12:00:00+03:00"));
      if (Number(this.now()) < Date.parse(day.till) + MINUTE_MS) continue;
      const command = { instrumentId: this.instrumentId, date: day.date };
      try {
        const query = { instrumentId: this.instrumentId, from: day.from, till: day.till };
        const minuteCandles = await this.fetchRange({ ...query, timeframe: "ONE_MINUTE" }, generation);
        if (!minuteCandles || !this.isActive(generation)) return;
        const dayCandles = await this.fetchRange({ ...query, timeframe: "ONE_DAY" }, generation);
        if (!dayCandles || !this.isActive(generation)) return;
        const integrity = checkSourceCandleIntegrity({ minuteCandles, dailyCandle: dayCandles[0], minuteLoadCompleted: true, dailyLoadCompleted: true });
        if (integrity.status === "MISSING_DAILY" || integrity.status === "MISSING_MINUTES") {
          throw Object.assign(new Error(integrity.message), { code: "CURRENT_DAY_FINALIZATION_" + integrity.status });
        }
        this.repository.replaceCompletedDay({ ...command, ...query, minuteCandles, dayCandles, loadedAt: new Date(this.now()).toISOString() });
        for (const timeframe of AGGREGATION_TIMEFRAMES) {
          if (!this.isActive(generation)) return;
          await this.calculateDay({ ...command, timeframe });
        }
        if (!this.isActive(generation)) return;
        this.repository.completeFinalization({ ...command, completedAt: new Date(this.now()).toISOString() });
      } catch (error) {
        if (!this.isActive(generation)) return;
        this.repository.failFinalization({ ...command, error: errorMessage(error) });
        // A failed prior day remains durable and is retried on the next configured cycle.
        return;
      }
    }
  }
}
module.exports = { CurrentDayLoadingProcess };
