"use strict";

const DEFAULT_UPDATE_INTERVAL_MS = 1000;
const DEFAULT_QUOTE_DECIMALS = 4;
const MAX_QUOTE_DECIMALS = 8;

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
  ) {
    return null;
  }

  return {
    pairCode,
    currencyPair,
    defaultQuoteDecimals: normalizedQuoteDecimals(source.defaultQuoteDecimals),
    bidMin,
    spread,
    bidMax
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
    const mid = (configuration.bidMin + configuration.bidMax) / 2;
    const amplitude = range / 2;
    const elapsed = Math.max(0, timestamp - this.startedAt);
    const seed = this.seedFor(configuration, index);
    const period = 13000 + (index % 5) * 1800;
    const primary = Math.sin((elapsed / period) * Math.PI * 2 + seed - Math.PI / 2);
    const noise =
      Math.sin((elapsed / (2300 + index * 120)) + seed) * 0.045
      + Math.sin((elapsed / (5100 + index * 220)) + seed * 0.47) * 0.025;
    const bid = roundRate(
      Math.min(configuration.bidMax, Math.max(configuration.bidMin, mid + amplitude * (primary + noise))),
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

module.exports = { MarketPulseSimulator };
