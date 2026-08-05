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

function nonNegativeTradeId(value, name) {
  const tradeId = Number(value);

  if (!Number.isSafeInteger(tradeId) || tradeId < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer Trade ID.`);
  }

  return tradeId;
}

function tradeIdCollection(value, name) {
  if (value === null || value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new TypeError(`${name} must be a Trade ID collection.`);
  }

  return value.map((tradeId, index) => {
    const normalized = nonNegativeTradeId(tradeId, `${name} item ${index + 1}`);

    if (normalized === 0) {
      throw new RangeError(`${name} must contain positive Trade IDs.`);
    }

    return normalized;
  });
}

class FxAutoBatchingProcess {
  constructor({
    selectCandidates,
    formBatch,
    getIntervalMs,
    getLatestTradeId = () => 0,
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

    if (typeof getLatestTradeId !== "function") {
      throw new TypeError("FX Auto Batching Process requires a latest Trade ID provider.");
    }

    if (typeof createIdempotencyKey !== "function") {
      throw new TypeError("FX Auto Batching Process requires an Idempotency Key factory.");
    }

    this.selectCandidates = selectCandidates;
    this.formBatch = formBatch;
    this.getIntervalMs = getIntervalMs;
    this.getLatestTradeId = getLatestTradeId;
    this.createIdempotencyKey = createIdempotencyKey;
    this.setTimeoutFn = setTimeoutFn;
    this.clearTimeoutFn = clearTimeoutFn;
    this.now = now;
    this.running = false;
    this.runRevision = 0;
    this.startedAt = null;
    this.acceptTradesAfterId = null;
    this.excludedTradeIds = new Set();
    this.timer = null;
    this.batchingInProgress = false;
    this.formationInProgress = false;
    this.evaluationRequested = false;
    this.nextEvaluationDelayMs = null;
    this.formedBatchCount = 0;
    this.lastCandidateTradeCount = 0;
    this.lastCandidatePairCount = 0;
    this.lastOpenWindowCount = 0;
    this.lastClosedWithoutBatchTradeCount = 0;
    this.lastCancelledWindowCount = 0;
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
    const phase = !this.running
      ? "STOPPED"
      : this.formationInProgress
        ? "FORMING_BATCH"
        : this.lastOpenWindowCount > 0
          ? "WINDOW_OPEN"
          : "WAITING_FOR_FIRST_TRADE";

    return {
      running: this.running,
      status: this.running ? "RUNNING" : "STOPPED",
      phase,
      startedAt: this.startedAt,
      intervalMs: this.intervalMs(),
      batchingInProgress: this.batchingInProgress,
      formationInProgress: this.formationInProgress,
      evaluationRequested: this.evaluationRequested,
      formedBatchCount: this.formedBatchCount,
      lastCandidateTradeCount: this.lastCandidateTradeCount,
      lastCandidatePairCount: this.lastCandidatePairCount,
      lastOpenWindowCount: this.lastOpenWindowCount,
      lastClosedWithoutBatchTradeCount:
        this.lastClosedWithoutBatchTradeCount,
      lastCancelledWindowCount: this.lastCancelledWindowCount,
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
    const runRevision = this.runRevision;

    try {
      const selection = await this.selectCandidates({
        afterTradeId: this.acceptTradesAfterId,
        excludedTradeIds: [...this.excludedTradeIds]
      });

      if (!this.running || runRevision !== this.runRevision) {
        return [];
      }

      const candidates = Array.isArray(selection)
        ? selection
        : selection?.candidates;

      if (!Array.isArray(candidates)) {
        throw new TypeError("FX Auto Batching selection must return a candidate collection.");
      }

      this.nextEvaluationDelayMs = Array.isArray(selection)
        ? this.intervalMs()
        : optionalDelayMilliseconds(selection?.nextEvaluationDelayMs);
      const closedWithoutBatchTradeIds = Array.isArray(selection)
        ? []
        : tradeIdCollection(
            selection?.closedWithoutBatchTradeIds,
            "Closed Batching Window Trade IDs"
          );
      const openWindowCount = Array.isArray(selection)
        ? 0
        : Number(selection?.openWindowCount || 0);

      if (!Number.isInteger(openWindowCount) || openWindowCount < 0) {
        throw new RangeError(
          "FX Auto Batching open Batching Window count must be a non-negative integer."
        );
      }

      closedWithoutBatchTradeIds.forEach(tradeId => {
        this.excludedTradeIds.add(tradeId);
      });

      this.lastCycleAt = this.now().toISOString();
      this.lastOpenWindowCount = openWindowCount;
      this.lastClosedWithoutBatchTradeCount = closedWithoutBatchTradeIds.length;
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
        if (!this.running || runRevision !== this.runRevision) {
          break;
        }

        const ccyPairCode = String(candidate?.ccyPairCode || "").trim().toUpperCase();
        const tradeIds = Array.isArray(candidate?.tradeIds) ? candidate.tradeIds : [];

        if (!ccyPairCode || tradeIds.length === 0) {
          errors.push(`${ccyPairCode || "Unknown Ccy Pair"}: invalid Auto Batching candidate.`);
          continue;
        }

        try {
          this.formationInProgress = true;
          const result = await this.formBatch({
            idempotencyKey: this.createIdempotencyKey(),
            tradeIds,
            ...(candidate?.windowOpenedAt || candidate?.windowClosedAt
              ? {
                  windowOpenedAt: candidate.windowOpenedAt,
                  windowClosedAt: candidate.windowClosedAt
                }
              : {}),
            ...(candidate?.formationReasonCode
              ? {
                  formationReasonCode: candidate.formationReasonCode,
                  formationReasonDetails: candidate.formationReasonDetails
                }
              : {})
          });

          if (!this.running || runRevision !== this.runRevision) {
            results.push(result);
            break;
          }

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
        } finally {
          this.formationInProgress = false;
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
      this.formationInProgress = false;
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

    this.acceptTradesAfterId = nonNegativeTradeId(
      this.getLatestTradeId(),
      "Latest Trade ID at Auto Batching start"
    );
    this.excludedTradeIds.clear();
    this.lastOpenWindowCount = 0;
    this.lastClosedWithoutBatchTradeCount = 0;
    this.lastCancelledWindowCount = 0;
    this.startedAt = this.now().toISOString();
    this.runRevision += 1;
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

  keepTradesUnderManualControl(tradeIds) {
    const manualTradeIds = tradeIdCollection(
      tradeIds,
      "Trades returned to manual control"
    );

    if (!this.running) {
      return this.status();
    }

    manualTradeIds.forEach(tradeId => {
      this.excludedTradeIds.add(tradeId);
    });

    return this.requestEvaluation();
  }

  reschedule() {
    if (!this.running) {
      return this.status();
    }

    return this.requestEvaluation();
  }

  stop() {
    const cancelledWindowCount = this.running
      ? this.lastOpenWindowCount
      : 0;

    this.running = false;
    this.runRevision += 1;

    if (this.timer !== null) {
      this.clearTimeoutFn(this.timer);
      this.timer = null;
    }

    this.nextCycleAt = null;
    this.evaluationRequested = false;
    this.nextEvaluationDelayMs = null;
    this.startedAt = null;
    this.acceptTradesAfterId = null;
    this.excludedTradeIds.clear();
    this.lastOpenWindowCount = 0;
    this.lastClosedWithoutBatchTradeCount = 0;
    this.lastCancelledWindowCount = cancelledWindowCount;
    return this.status();
  }

  reset() {
    this.stop();
    this.formedBatchCount = 0;
    this.lastCandidateTradeCount = 0;
    this.lastCandidatePairCount = 0;
    this.lastOpenWindowCount = 0;
    this.lastClosedWithoutBatchTradeCount = 0;
    this.lastCancelledWindowCount = 0;
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
