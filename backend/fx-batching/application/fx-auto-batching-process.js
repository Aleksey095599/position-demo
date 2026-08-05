"use strict";

function positiveIntervalMilliseconds(value) {
  const intervalMs = Number(value);

  if (!Number.isInteger(intervalMs) || intervalMs <= 0) {
    throw new RangeError("Auto Batching interval must be a positive integer number of milliseconds.");
  }

  return intervalMs;
}

function optionalDelayMilliseconds(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const delayMs = Number(value);

  if (!Number.isInteger(delayMs) || delayMs < 0) {
    throw new RangeError(
      "Auto Batching next evaluation delay must be a non-negative integer number of milliseconds."
    );
  }

  return delayMs;
}

class FxAutoBatchingProcess {
  constructor({
    selectCandidates,
    formBatch,
    getIntervalMs,
    createIdempotencyKey,
    setTimeoutFn = setTimeout,
    clearTimeoutFn = clearTimeout,
    now = () => new Date()
  }) {
    if (typeof selectCandidates !== "function") {
      throw new TypeError("FX Auto Batching Process requires a per-currency-pair selection query.");
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

    this.selectCandidates = selectCandidates;
    this.formBatch = formBatch;
    this.getIntervalMs = getIntervalMs;
    this.createIdempotencyKey = createIdempotencyKey;
    this.setTimeoutFn = setTimeoutFn;
    this.clearTimeoutFn = clearTimeoutFn;
    this.now = now;
    this.running = false;
    this.timer = null;
    this.batchingInProgress = false;
    this.evaluationRequested = false;
    this.nextEvaluationDelayMs = null;
    this.formedBatchCount = 0;
    this.lastCandidateTradeCount = 0;
    this.lastCandidatePairCount = 0;
    this.lastCycleBatchCount = 0;
    this.lastFormedBatchId = null;
    this.lastFormedBatchIds = [];
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
      evaluationRequested: this.evaluationRequested,
      formedBatchCount: this.formedBatchCount,
      lastCandidateTradeCount: this.lastCandidateTradeCount,
      lastCandidatePairCount: this.lastCandidatePairCount,
      lastCycleBatchCount: this.lastCycleBatchCount,
      lastFormedBatchId: this.lastFormedBatchId,
      lastFormedBatchIds: [...this.lastFormedBatchIds],
      lastFormedAt: this.lastFormedAt,
      lastCycleAt: this.lastCycleAt,
      nextCycleAt: this.nextCycleAt,
      lastError: this.lastError
    };
  }

  async tick() {
    if (this.batchingInProgress) {
      this.evaluationRequested = true;
      return null;
    }

    this.batchingInProgress = true;

    try {
      const selection = await this.selectCandidates();
      const candidates = Array.isArray(selection)
        ? selection
        : selection?.candidates;

      if (!Array.isArray(candidates)) {
        throw new TypeError("FX Auto Batching selection must return a candidate collection.");
      }

      this.nextEvaluationDelayMs = Array.isArray(selection)
        ? this.intervalMs()
        : optionalDelayMilliseconds(selection?.nextEvaluationDelayMs);

      this.lastCycleAt = this.now().toISOString();
      this.lastCandidatePairCount = candidates.length;
      this.lastCandidateTradeCount = candidates.reduce(
        (count, candidate) => count + (Array.isArray(candidate?.tradeIds) ? candidate.tradeIds.length : 0),
        0
      );
      this.lastCycleBatchCount = 0;
      this.lastFormedBatchIds = [];

      if (this.lastCandidateTradeCount === 0) {
        this.lastError = null;
        return [];
      }

      const results = [];
      const errors = [];

      for (const candidate of candidates) {
        const ccyPairCode = String(candidate?.ccyPairCode || "").trim().toUpperCase();
        const tradeIds = Array.isArray(candidate?.tradeIds) ? candidate.tradeIds : [];

        if (!ccyPairCode || tradeIds.length === 0) {
          errors.push(`${ccyPairCode || "Unknown Ccy Pair"}: invalid Auto Batching candidate.`);
          continue;
        }

        try {
          const result = await this.formBatch({
            idempotencyKey: this.createIdempotencyKey(),
            tradeIds,
            ...(candidate?.formationReasonCode
              ? {
                  formationReasonCode: candidate.formationReasonCode,
                  formationReasonDetails: candidate.formationReasonDetails
                }
              : {})
          });
          const batchId = Number(result?.batchId) || null;

          results.push(result);

          if (result?.replayed !== true) {
            this.formedBatchCount += 1;
            this.lastCycleBatchCount += 1;
          }

          if (batchId !== null) {
            this.lastFormedBatchId = batchId;
            this.lastFormedBatchIds.push(batchId);
          }

          this.lastFormedAt = this.now().toISOString();
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          errors.push(`${ccyPairCode}: ${message}`);
        }
      }

      this.lastError = errors.length > 0
        ? `Auto Batching failed for ${errors.join("; ")}`
        : null;
      return results;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      this.nextEvaluationDelayMs = this.intervalMs();
      return null;
    } finally {
      this.batchingInProgress = false;
    }
  }

  scheduleNextCycle(delayMs = this.nextEvaluationDelayMs) {
    if (!this.running || this.timer !== null || this.batchingInProgress) {
      return;
    }

    const scheduledDelayMs = optionalDelayMilliseconds(delayMs);

    if (scheduledDelayMs === null) {
      this.nextCycleAt = null;
      return;
    }

    this.nextCycleAt = new Date(this.now().getTime() + scheduledDelayMs).toISOString();
    this.timer = this.setTimeoutFn(async () => {
      this.timer = null;
      this.nextCycleAt = null;

      if (!this.running) {
        return;
      }

      this.evaluationRequested = false;
      await this.tick();
      const requestedDuringEvaluation = this.evaluationRequested;
      this.evaluationRequested = false;
      const retryDelayMs = this.lastError
        ? Math.min(1000, this.intervalMs())
        : null;
      this.scheduleNextCycle(
        requestedDuringEvaluation
          ? 0
          : retryDelayMs ?? this.nextEvaluationDelayMs
      );
    }, scheduledDelayMs);
    this.timer?.unref?.();
  }

  start() {
    if (this.running) {
      return this.status();
    }

    this.running = true;
    this.requestEvaluation();
    return this.status();
  }

  requestEvaluation() {
    if (!this.running) {
      return this.status();
    }

    this.evaluationRequested = true;

    if (this.batchingInProgress) {
      return this.status();
    }

    if (this.timer !== null) {
      this.clearTimeoutFn(this.timer);
      this.timer = null;
    }

    this.nextCycleAt = null;
    this.scheduleNextCycle(0);
    return this.status();
  }

  notifyTradeCreated() {
    return this.requestEvaluation();
  }

  reschedule() {
    if (!this.running) {
      return this.status();
    }

    return this.requestEvaluation();
  }

  stop() {
    this.running = false;

    if (this.timer !== null) {
      this.clearTimeoutFn(this.timer);
      this.timer = null;
    }

    this.nextCycleAt = null;
    this.evaluationRequested = false;
    this.nextEvaluationDelayMs = null;
    return this.status();
  }

  reset() {
    this.stop();
    this.formedBatchCount = 0;
    this.lastCandidateTradeCount = 0;
    this.lastCandidatePairCount = 0;
    this.lastCycleBatchCount = 0;
    this.lastFormedBatchId = null;
    this.lastFormedBatchIds = [];
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
  optionalDelayMilliseconds,
  positiveIntervalMilliseconds
};
