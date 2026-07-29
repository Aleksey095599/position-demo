"use strict";

const DEFAULT_GENERATION_CYCLE = Object.freeze({
  minIntervalMs: 1000,
  maxIntervalMs: 3000,
  minDealsPerCycle: 3,
  maxDealsPerCycle: 7
});

function normalizedGenerationCycle(value = DEFAULT_GENERATION_CYCLE) {
  const cycle = {
    minIntervalMs: Number(value.minIntervalMs),
    maxIntervalMs: Number(value.maxIntervalMs),
    minDealsPerCycle: Number(value.minDealsPerCycle),
    maxDealsPerCycle: Number(value.maxDealsPerCycle)
  };

  if (
    !Number.isInteger(cycle.minIntervalMs)
    || !Number.isInteger(cycle.maxIntervalMs)
    || cycle.minIntervalMs <= 0
    || cycle.maxIntervalMs < cycle.minIntervalMs
  ) {
    throw new RangeError(
      "Generation interval range must contain positive integers in ascending order."
    );
  }

  if (
    !Number.isInteger(cycle.minDealsPerCycle)
    || !Number.isInteger(cycle.maxDealsPerCycle)
    || cycle.minDealsPerCycle <= 0
    || cycle.maxDealsPerCycle < cycle.minDealsPerCycle
  ) {
    throw new RangeError(
      "Deals-per-cycle range must contain positive integers in ascending order."
    );
  }

  return cycle;
}

function randomIntegerInRange(minimum, maximum, random) {
  const draw = Math.min(Math.max(Number(random()), 0), 1 - Number.EPSILON);
  return minimum + Math.floor(draw * (maximum - minimum + 1));
}

class ClientDealGenerationProcess {
  constructor({
    generateOne,
    getGenerationCycle = () => DEFAULT_GENERATION_CYCLE,
    setTimeoutFn = setTimeout,
    clearTimeoutFn = clearTimeout,
    random = Math.random,
    now = () => new Date()
  }) {
    if (typeof generateOne !== "function") {
      throw new TypeError("Client Deal Generation Process requires a generate-one use case.");
    }

    if (typeof getGenerationCycle !== "function") {
      throw new TypeError(
        "Client Deal Generation Process requires a generation-cycle provider."
      );
    }

    if (typeof random !== "function") {
      throw new TypeError("Client Deal Generation Process requires a random source.");
    }

    this.generateOne = generateOne;
    this.getGenerationCycle = getGenerationCycle;
    this.setTimeoutFn = setTimeoutFn;
    this.clearTimeoutFn = clearTimeoutFn;
    this.random = random;
    this.now = now;
    this.running = false;
    this.timer = null;
    this.generationInProgress = false;
    this.generatedDealCount = 0;
    this.lastCycleSize = null;
    this.lastCycleGeneratedDealCount = 0;
    this.lastGeneratedTradeId = null;
    this.lastGeneratedAt = null;
    this.nextCycleAt = null;
    this.lastError = null;
  }

  generationCycle() {
    return normalizedGenerationCycle(this.getGenerationCycle());
  }

  status() {
    return {
      running: this.running,
      status: this.running ? "RUNNING" : "STOPPED",
      ...this.generationCycle(),
      generationInProgress: this.generationInProgress,
      generatedDealCount: this.generatedDealCount,
      lastCycleSize: this.lastCycleSize,
      lastCycleGeneratedDealCount: this.lastCycleGeneratedDealCount,
      lastGeneratedTradeId: this.lastGeneratedTradeId,
      lastGeneratedAt: this.lastGeneratedAt,
      nextCycleAt: this.nextCycleAt,
      lastError: this.lastError
    };
  }

  async tick() {
    if (this.generationInProgress) {
      return [];
    }

    this.generationInProgress = true;
    const cycle = this.generationCycle();
    const cycleSize = randomIntegerInRange(
      cycle.minDealsPerCycle,
      cycle.maxDealsPerCycle,
      this.random
    );
    const deals = [];
    this.lastCycleSize = cycleSize;
    this.lastCycleGeneratedDealCount = 0;

    try {
      for (let index = 0; index < cycleSize; index += 1) {
        try {
          const deal = await this.generateOne();
          deals.push(deal);
          this.generatedDealCount += 1;
          this.lastCycleGeneratedDealCount = deals.length;
          this.lastGeneratedTradeId =
            Number(deal?.tradeId ?? deal?.clientDealId) || null;
          this.lastGeneratedAt = this.now().toISOString();
          this.lastError = null;
        } catch (error) {
          this.lastError = error instanceof Error ? error.message : String(error);
          break;
        }
      }

      return deals;
    } finally {
      this.generationInProgress = false;
    }
  }

  scheduleNextCycle() {
    if (!this.running || this.timer !== null || this.generationInProgress) {
      return;
    }

    const cycle = this.generationCycle();
    const delayMs = randomIntegerInRange(
      cycle.minIntervalMs,
      cycle.maxIntervalMs,
      this.random
    );
    this.nextCycleAt = new Date(this.now().getTime() + delayMs).toISOString();
    this.timer = this.setTimeoutFn(async () => {
      this.timer = null;
      this.nextCycleAt = null;

      if (!this.running) {
        return;
      }

      await this.tick();
      this.scheduleNextCycle();
    }, delayMs);
    this.timer?.unref?.();
  }

  start() {
    if (this.running) {
      return this.status();
    }

    this.running = true;
    this.scheduleNextCycle();
    return this.status();
  }

  reschedule() {
    if (!this.running) {
      return this.status();
    }

    if (this.timer !== null) {
      this.clearTimeoutFn(this.timer);
      this.timer = null;
    }

    this.nextCycleAt = null;
    this.scheduleNextCycle();
    return this.status();
  }

  stop() {
    this.running = false;

    if (this.timer !== null) {
      this.clearTimeoutFn(this.timer);
      this.timer = null;
    }

    this.nextCycleAt = null;
    return this.status();
  }

  reset() {
    this.stop();
    this.generatedDealCount = 0;
    this.lastCycleSize = null;
    this.lastCycleGeneratedDealCount = 0;
    this.lastGeneratedTradeId = null;
    this.lastGeneratedAt = null;
    this.lastError = null;
    return this.status();
  }

  dispose() {
    this.stop();
  }
}

module.exports = {
  ClientDealGenerationProcess,
  DEFAULT_GENERATION_CYCLE,
  normalizedGenerationCycle,
  randomIntegerInRange
};
