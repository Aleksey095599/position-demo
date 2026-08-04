"use strict";

function positiveIntervalMilliseconds(value) {
  const intervalMs = Number(value);

  if (!Number.isInteger(intervalMs) || intervalMs <= 0) {
    throw new RangeError("Auto Batching interval must be a positive integer number of milliseconds.");
  }

  return intervalMs;
}

class FxAutoBatchingProcess {
  constructor({
    selectNextTradeIds,
    formBatch,
    getIntervalMs,
    createIdempotencyKey,
    setTimeoutFn = setTimeout,
    clearTimeoutFn = clearTimeout,
    now = () => new Date()
  }) {
    if (typeof selectNextTradeIds !== "function") {
      throw new TypeError("FX Auto Batching Process requires a trade-selection query.");
    }

    if (typeof formBatch !== "function") {
      throw new TypeError("FX Auto Batching Process requires a form-batch use case.");
    }

    if (typeof getIntervalMs !== "function") {
      throw new TypeError("FX Auto Batching Process requires a batching-interval provider.");
    }

    if (typeof createIdempotencyKey !== "function") {
      throw new TypeError("FX Auto Batching Process requires an Idempotency Key factory.");
    }

    this.selectNextTradeIds = selectNextTradeIds;
    this.formBatch = formBatch;
    this.getIntervalMs = getIntervalMs;
    this.createIdempotencyKey = createIdempotencyKey;
    this.setTimeoutFn = setTimeoutFn;
    this.clearTimeoutFn = clearTimeoutFn;
    this.now = now;
    this.running = false;
    this.timer = null;
    this.batchingInProgress = false;
    this.formedBatchCount = 0;
    this.lastCandidateTradeCount = 0;
    this.lastFormedBatchId = null;
    this.lastFormedAt = null;
    this.lastCycleAt = null;
    this.nextCycleAt = null;
    this.lastError = null;
  }

  intervalMs() {
    return positiveIntervalMilliseconds(this.getIntervalMs());
  }

  status() {
    return {
      running: this.running,
      status: this.running ? "RUNNING" : "STOPPED",
      intervalMs: this.intervalMs(),
      batchingInProgress: this.batchingInProgress,
      formedBatchCount: this.formedBatchCount,
      lastCandidateTradeCount: this.lastCandidateTradeCount,
      lastFormedBatchId: this.lastFormedBatchId,
      lastFormedAt: this.lastFormedAt,
      lastCycleAt: this.lastCycleAt,
      nextCycleAt: this.nextCycleAt,
      lastError: this.lastError
    };
  }

  async tick() {
    if (this.batchingInProgress) {
      return null;
    }

    this.batchingInProgress = true;

    try {
      const tradeIds = await this.selectNextTradeIds();
      this.lastCycleAt = this.now().toISOString();
      this.lastCandidateTradeCount = Array.isArray(tradeIds)
        ? tradeIds.length
        : 0;

      if (this.lastCandidateTradeCount === 0) {
        this.lastError = null;
        return null;
      }

      const result = await this.formBatch({
        idempotencyKey: this.createIdempotencyKey(),
        tradeIds
      });
      this.formedBatchCount += result?.replayed === true ? 0 : 1;
      this.lastFormedBatchId = Number(result?.batchId) || null;
      this.lastFormedAt = this.now().toISOString();
      this.lastError = null;
      return result;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      return null;
    } finally {
      this.batchingInProgress = false;
    }
  }

  scheduleNextCycle() {
    if (!this.running || this.timer !== null || this.batchingInProgress) {
      return;
    }

    const intervalMs = this.intervalMs();
    this.nextCycleAt = new Date(this.now().getTime() + intervalMs).toISOString();
    this.timer = this.setTimeoutFn(async () => {
      this.timer = null;
      this.nextCycleAt = null;

      if (!this.running) {
        return;
      }

      await this.tick();
      this.scheduleNextCycle();
    }, intervalMs);
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
    this.formedBatchCount = 0;
    this.lastCandidateTradeCount = 0;
    this.lastFormedBatchId = null;
    this.lastFormedAt = null;
    this.lastCycleAt = null;
    this.lastError = null;
    return this.status();
  }

  dispose() {
    this.stop();
  }
}

module.exports = {
  FxAutoBatchingProcess,
  positiveIntervalMilliseconds
};
