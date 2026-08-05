"use strict";

const DEFAULT_UPDATE_INTERVAL_MS = 1000;
const DEFAULT_QUOTE_DECIMALS = 4;
const MAX_QUOTE_DECIMALS = 8;
const DEFAULT_ONE_WAY_DURATION_SECONDS = 60;
const MIN_ONE_WAY_DURATION_SECONDS = 5;
const MAX_ONE_WAY_DURATION_SECONDS = 3600;
const DEFAULT_FLUCTUATION_SPREADS = 3;
const MAX_FLUCTUATION_SPREADS = 10;

function normalizedQuoteDecimals(value) {
  const decimals = Number(value);
  return Number.isInteger(decimals) && decimals >= 0 && decimals <= MAX_QUOTE_DECIMALS
    ? decimals
    : DEFAULT_QUOTE_DECIMALS;
}

function roundRate(value, decimals) {
  return Number(value.toFixed(normalizedQuoteDecimals(decimals)));
}

function normalizedConfiguration(value) {
  const source = value && typeof value === "object" ? value : {};
  const bidMin = Number(source.bidMin);
  const spread = Number(source.spread);
  const bidMax = Number(source.bidMax);
  const oneWayDurationSeconds = Number(
    source.oneWayDurationSeconds ?? DEFAULT_ONE_WAY_DURATION_SECONDS
  );
  const fluctuationSpreads = Number(
    source.fluctuationSpreads ?? DEFAULT_FLUCTUATION_SPREADS
  );
  const pairCode = String(source.pairCode || "").trim().toUpperCase();
  const currencyPair = String(source.currencyPair || pairCode.replace("_", "/")).trim().toUpperCase();

  if (
    !/^[A-Z]{3}_[A-Z]{3}$/.test(pairCode)
    || !Number.isFinite(bidMin)
    || !Number.isFinite(spread)
    || !Number.isFinite(bidMax)
    || bidMin <= 0
    || spread <= 0
    || bidMax <= bidMin
    || !Number.isInteger(oneWayDurationSeconds)
    || oneWayDurationSeconds < MIN_ONE_WAY_DURATION_SECONDS
    || oneWayDurationSeconds > MAX_ONE_WAY_DURATION_SECONDS
    || !Number.isFinite(fluctuationSpreads)
    || fluctuationSpreads < 0
    || fluctuationSpreads > MAX_FLUCTUATION_SPREADS
  ) {
    return null;
  }

  return {
    pairCode,
    currencyPair,
    defaultQuoteDecimals: normalizedQuoteDecimals(source.defaultQuoteDecimals),
    bidMin,
    spread,
    bidMax,
    oneWayDurationSeconds,
    fluctuationSpreads
  };
}

class MarketPulseSimulator {
  constructor({
    loadConfigurations,
    updateIntervalMs = DEFAULT_UPDATE_INTERVAL_MS,
    now = () => Date.now(),
    random = () => Math.random()
  }) {
    if (typeof loadConfigurations !== "function") {
      throw new TypeError("Market Pulse Simulator requires a configuration loader.");
    }

    this.loadConfigurations = loadConfigurations;
    this.updateIntervalMs = updateIntervalMs;
    this.now = now;
    this.random = random;
    this.running = false;
    this.startedAt = 0;
    this.timer = null;
    this.seeds = new Map();
    this.quotes = new Map();
    this.subscribers = new Set();
  }

  configurations() {
    const values = this.loadConfigurations();

    return (Array.isArray(values) ? values : [])
      .map(normalizedConfiguration)
      .filter(Boolean)
      .sort((left, right) => left.pairCode.localeCompare(right.pairCode));
  }

  seedFor(configuration, index) {
    if (!this.seeds.has(configuration.pairCode)) {
      this.seeds.set(configuration.pairCode, this.random() * Math.PI * 2 + index * 0.71);
    }

    return this.seeds.get(configuration.pairCode);
  }

  generateQuote(configuration, index, timestamp) {
    const quoteStep = 10 ** -configuration.defaultQuoteDecimals;
    const range = Math.max(configuration.bidMax - configuration.bidMin, quoteStep);
    const elapsed = Math.max(0, timestamp - this.startedAt);
    const seed = this.seedFor(configuration, index);
    const oneWayDurationMs = configuration.oneWayDurationSeconds * 1000;
    const cyclePosition = (elapsed % (oneWayDurationMs * 2)) / oneWayDurationMs;
    const legProgress = cyclePosition <= 1 ? cyclePosition : cyclePosition - 1;
    const trendProgress = cyclePosition <= 1 ? cyclePosition : 2 - cyclePosition;
    const linearBid = configuration.bidMin + range * trendProgress;
    const fluctuationEnvelope = Math.sin(Math.PI * legProgress);
    const fluctuationAmplitude = Math.min(
      configuration.spread * configuration.fluctuationSpreads,
      range / 3
    );
    const fluctuation = fluctuationEnvelope * fluctuationAmplitude * (
      Math.sin(elapsed / (3700 + index * 130) + seed) * 0.55
      + Math.sin(elapsed / (1900 + index * 90) + seed * 1.37) * 0.30
      + Math.sin(elapsed / (970 + index * 50) + seed * 0.63) * 0.15
    );
    const bid = roundRate(
      Math.min(configuration.bidMax, Math.max(configuration.bidMin, linearBid + fluctuation)),
      configuration.defaultQuoteDecimals
    );
    const offer = roundRate(bid + configuration.spread, configuration.defaultQuoteDecimals);

    return { bid, offer };
  }

  buildSnapshot(timestamp = this.now(), generate = this.running, configurations = this.configurations()) {
    const configuredPairCodes = new Set(configurations.map(configuration => configuration.pairCode));

    [...this.quotes.keys()]
      .filter(pairCode => !configuredPairCodes.has(pairCode))
      .forEach(pairCode => this.quotes.delete(pairCode));
    [...this.seeds.keys()]
      .filter(pairCode => !configuredPairCodes.has(pairCode))
      .forEach(pairCode => this.seeds.delete(pairCode));

    const quotes = configurations.map((configuration, index) => {
      const quote = generate
        ? this.generateQuote(configuration, index, timestamp)
        : this.quotes.get(configuration.pairCode) || {
            bid: roundRate(configuration.bidMin, configuration.defaultQuoteDecimals),
            offer: roundRate(configuration.bidMin + configuration.spread, configuration.defaultQuoteDecimals)
          };

      this.quotes.set(configuration.pairCode, quote);

      return {
        pairCode: configuration.pairCode,
        currencyPair: configuration.currencyPair,
        bid: quote.bid,
        offer: quote.offer
      };
    });

    return {
      running: this.running,
      status: this.running ? "RUNNING" : "STOPPED",
      updateIntervalMs: this.updateIntervalMs,
      generatedAt: new Date(timestamp).toISOString(),
      quotes
    };
  }

  publish(snapshot) {
    this.subscribers.forEach(subscriber => {
      try {
        subscriber(snapshot);
      } catch {}
    });
  }

  snapshot() {
    return this.buildSnapshot(this.now(), false);
  }

  refresh() {
    const configurations = this.configurations();

    if (this.running && configurations.length === 0) {
      return this.stop();
    }

    const snapshot = this.buildSnapshot(this.now(), this.running, configurations);
    this.publish(snapshot);
    return snapshot;
  }

  start() {
    if (this.running) {
      return this.snapshot();
    }

    const configurations = this.configurations();

    if (configurations.length === 0) {
      const error = new Error("Configure simulation settings for at least one Ccy Pair before starting Market Pulse Simulation.");
      error.code = "SIMULATION_NOT_CONFIGURED";
      throw error;
    }

    this.running = true;
    this.startedAt = this.now();
    this.seeds.clear();
    this.quotes.clear();
    const snapshot = this.buildSnapshot(this.startedAt, true, configurations);
    this.publish(snapshot);
    this.timer = setInterval(() => this.refresh(), this.updateIntervalMs);
    this.timer.unref?.();
    return snapshot;
  }

  stop() {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }

    this.running = false;
    const snapshot = this.buildSnapshot(this.now(), false);
    this.publish(snapshot);
    return snapshot;
  }

  subscribe(subscriber) {
    this.subscribers.add(subscriber);
    subscriber(this.snapshot());
    return () => this.subscribers.delete(subscriber);
  }

  dispose() {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }

    this.subscribers.clear();
    this.running = false;
  }
}

module.exports = {
  DEFAULT_FLUCTUATION_SPREADS,
  DEFAULT_ONE_WAY_DURATION_SECONDS,
  MAX_FLUCTUATION_SPREADS,
  MAX_ONE_WAY_DURATION_SECONDS,
  MIN_ONE_WAY_DURATION_SECONDS,
  MarketPulseSimulator
};
