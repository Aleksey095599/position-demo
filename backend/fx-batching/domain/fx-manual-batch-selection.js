"use strict";

const FX_MANUAL_BATCH_SELECTION_MODE = Object.freeze({
  SINGLE_BATCH: "SINGLE_BATCH",
  SEPARATE_BY_TENOR: "SEPARATE_BY_TENOR"
});

const STANDARD_TENOR_ORDER = new Map([
  ["TOD", 0],
  ["TOM", 1],
  ["SPOT", 2]
]);

function selectionError(code, message, details = {}) {
  const error = new RangeError(message);
  error.code = code;
  Object.assign(error, details);
  return error;
}

function normalizedMode(value) {
  const mode = String(
    value || FX_MANUAL_BATCH_SELECTION_MODE.SINGLE_BATCH
  ).trim().toUpperCase();

  if (!Object.values(FX_MANUAL_BATCH_SELECTION_MODE).includes(mode)) {
    throw selectionError(
      "INVALID_FX_MANUAL_BATCH_SELECTION",
      "Manual Batch Selection Mode must be SINGLE_BATCH or SEPARATE_BY_TENOR."
    );
  }

  return mode;
}

function normalizedAllowCrossTenorBatching(value) {
  if (value === undefined) {
    return false;
  }

  if (typeof value !== "boolean") {
    throw selectionError(
      "INVALID_FX_MANUAL_BATCH_SELECTION",
      "Allow Cross-Tenor Batching must be a boolean."
    );
  }

  return value;
}

function normalizedTrades(value) {
  if (!Array.isArray(value) || value.length === 0) {
    throw selectionError(
      "INVALID_FX_MANUAL_BATCH_SELECTION",
      "Manual Batch Selection requires at least one FX Trade."
    );
  }

  const normalized = value.map(trade => {
    const tradeId = Number(trade?.tradeId);
    const tenor = String(trade?.tenor || "").trim().toUpperCase();

    if (!Number.isSafeInteger(tradeId) || tradeId <= 0) {
      throw selectionError(
        "INVALID_FX_MANUAL_BATCH_SELECTION",
        "Every selected FX Trade must have a positive integer Trade ID."
      );
    }

    if (!tenor) {
      throw selectionError(
        "INVALID_FX_MANUAL_BATCH_SELECTION",
        `FX Trade ${tradeId} must have a Tenor.`
      );
    }

    return { trade, tradeId, tenor };
  });

  if (new Set(normalized.map(item => item.tradeId)).size !== normalized.length) {
    throw selectionError(
      "INVALID_FX_MANUAL_BATCH_SELECTION",
      "Every FX Trade may be selected only once."
    );
  }

  return normalized.sort((left, right) => left.tradeId - right.tradeId);
}

function compareTenors(left, right) {
  const leftOrder = STANDARD_TENOR_ORDER.get(left) ?? Number.MAX_SAFE_INTEGER;
  const rightOrder = STANDARD_TENOR_ORDER.get(right) ?? Number.MAX_SAFE_INTEGER;

  if (leftOrder !== rightOrder) {
    return leftOrder - rightOrder;
  }

  return left < right ? -1 : left > right ? 1 : 0;
}

function tenorSummary(trades) {
  const counts = {};

  trades.forEach(({ tenor }) => {
    counts[tenor] = (counts[tenor] || 0) + 1;
  });

  const tenors = Object.freeze(Object.keys(counts).sort(compareTenors));
  const orderedCounts = Object.freeze(Object.fromEntries(
    tenors.map(tenor => [tenor, counts[tenor]])
  ));

  return { tenors, counts: orderedCounts };
}

function frozenGroup(tenor, trades) {
  return Object.freeze({
    tenor,
    trades: Object.freeze(trades.map(item => item.trade))
  });
}

function planManualBatchSelection({
  trades,
  mode = FX_MANUAL_BATCH_SELECTION_MODE.SINGLE_BATCH,
  allowCrossTenorBatching = false
} = {}) {
  const normalizedTradesValue = normalizedTrades(trades);
  const normalizedModeValue = normalizedMode(mode);
  const crossTenorAllowed = normalizedAllowCrossTenorBatching(
    allowCrossTenorBatching
  );
  const { tenors, counts } = tenorSummary(normalizedTradesValue);

  if (
    normalizedModeValue === FX_MANUAL_BATCH_SELECTION_MODE.SINGLE_BATCH
    && tenors.length > 1
    && !crossTenorAllowed
  ) {
    const countSummary = tenors
      .map(tenor => `${tenor}: ${counts[tenor]}`)
      .join(", ");

    throw selectionError(
      "CROSS_TENOR_BATCHING_RESOLUTION_REQUIRED",
      `Selected FX Trades use multiple Tenors (${countSummary}). `
        + "Choose Independent Batching by Tenor.",
      { tenors, counts }
    );
  }

  if (normalizedModeValue === FX_MANUAL_BATCH_SELECTION_MODE.SINGLE_BATCH) {
    return Object.freeze([
      frozenGroup(tenors.length === 1 ? tenors[0] : null, normalizedTradesValue)
    ]);
  }

  return Object.freeze(tenors.map(tenor => frozenGroup(
    tenor,
    normalizedTradesValue.filter(item => item.tenor === tenor)
  )));
}

module.exports = {
  FX_MANUAL_BATCH_SELECTION_MODE,
  planManualBatchSelection
};
