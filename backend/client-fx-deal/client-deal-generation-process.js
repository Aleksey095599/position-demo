"use strict";

const DEFAULT_INTERVAL_MS = 3000;

class ClientDealGenerationProcess {
  constructor({
    generateOne,
    intervalMs = DEFAULT_INTERVAL_MS,
    setIntervalFn = setInterval,
    clearIntervalFn = clearInterval,
    now = () => new Date()
  }) {
    if (typeof generateOne !== "function") {
      throw new TypeError("Client Deal Generation Process requires a generate-one use case.");
    }

    if (!Number.isInteger(intervalMs) || intervalMs <= 0) {
      throw new RangeError("Generation interval must be a positive integer.");
    }

    this.generateOne = generateOne;
    this.intervalMs = intervalMs;
    this.setIntervalFn = setIntervalFn;
    this.clearIntervalFn = clearIntervalFn;
    this.now = now;
    this.timer = null;
    this.generationInProgress = false;
    this.generatedDealCount = 0;
    this.lastGeneratedTradeId = null;
    this.lastGeneratedAt = null;
    this.lastError = null;
  }

  status() {
    return {
      running: this.timer !== null,
      status: this.timer !== null ? "RUNNING" : "STOPPED",
      intervalMs: this.intervalMs,
      generationInProgress: this.generationInProgress,
      generatedDealCount: this.generatedDealCount,
      lastGeneratedTradeId: this.lastGeneratedTradeId,
      lastGeneratedAt: this.lastGeneratedAt,
      lastError: this.lastError
    };
  }

  async tick() {
    if (this.generationInProgress) {
      return null;
    }

    this.generationInProgress = true;

    try {
      const deal = await this.generateOne();
      this.generatedDealCount += 1;
      this.lastGeneratedTradeId = Number(deal?.tradeId ?? deal?.clientDealId) || null;
      this.lastGeneratedAt = this.now().toISOString();
      this.lastError = null;
      return deal;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      return null;
    } finally {
      this.generationInProgress = false;
    }
  }

  async start() {
    if (this.timer !== null) {
      return this.status();
    }

    await this.tick();
    this.timer = this.setIntervalFn(() => {
      void this.tick();
    }, this.intervalMs);
    this.timer?.unref?.();
    return this.status();
  }

  stop() {
    if (this.timer !== null) {
      this.clearIntervalFn(this.timer);
      this.timer = null;
    }

    return this.status();
  }

  dispose() {
    this.stop();
  }
}

module.exports = {
  ClientDealGenerationProcess,
  DEFAULT_INTERVAL_MS
};
