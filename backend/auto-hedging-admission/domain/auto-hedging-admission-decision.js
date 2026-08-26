"use strict";

const Big = require("big.js");
const {
  AUTO_HEDGING_ADMISSION_MODE,
  normalizeAutoHedgingAdmissionMode
} = require("./auto-hedging-admission-mode");

const Decimal = Big();
Decimal.strict = true;
Decimal.DP = 40;
Decimal.RM = Decimal.roundHalfUp;

const AUTO_HEDGING_ADMISSION_STATE = Object.freeze({
  HELD: "HELD",
  RELEASED: "RELEASED"
});

const AUTO_HEDGING_ELIGIBILITY_CHECK = Object.freeze({
  CCY_PAIR_ELIGIBILITY: "CCY_PAIR_ELIGIBILITY",
  TRANSFER_RATE_DEVIATION: "TRANSFER_RATE_DEVIATION"
});

const AUTO_HEDGING_ELIGIBILITY_CHECK_STATUS = Object.freeze({
  PASS: "PASS",
  FAIL: "FAIL",
  UNAVAILABLE: "UNAVAILABLE"
});

const AUTO_HEDGING_ADMISSION_REASON = Object.freeze({
  ELIGIBLE: "ELIGIBLE",
  EXECUTION_CONTEXT_ADMISSION_MODE_REQUIRED:
    "EXECUTION_CONTEXT_ADMISSION_MODE_REQUIRED",
  MANUAL_ONLY: "MANUAL_ONLY",
  REVIEW_REQUIRED: "REVIEW_REQUIRED",
  CCY_PAIR_NOT_ENABLED: "CCY_PAIR_NOT_ENABLED",
  TRADE_AMOUNT_LIMIT_NOT_CONFIGURED: "TRADE_AMOUNT_LIMIT_NOT_CONFIGURED",
  TRADE_AMOUNT_UNAVAILABLE: "TRADE_AMOUNT_UNAVAILABLE",
  TRADE_AMOUNT_LIMIT_EXCEEDED: "TRADE_AMOUNT_LIMIT_EXCEEDED",
  MARKET_PULSE_UNAVAILABLE: "MARKET_PULSE_UNAVAILABLE",
  TRANSFER_RATE_UNAVAILABLE: "TRANSFER_RATE_UNAVAILABLE",
  TRANSFER_RATE_DEVIATION_LIMIT_NOT_CONFIGURED:
    "TRANSFER_RATE_DEVIATION_LIMIT_NOT_CONFIGURED",
  TRADE_SIDE_UNSUPPORTED: "TRADE_SIDE_UNSUPPORTED",
  TRANSFER_RATE_DEVIATION_EXCEEDED: "TRANSFER_RATE_DEVIATION_EXCEEDED"
});

function decimal(value) {
  if (value === null || value === undefined || String(value).trim() === "") {
    return null;
  }

  try {
    return new Decimal(String(value));
  } catch {
    return null;
  }
}

function nonNegativeIntegerDecimal(value) {
  const parsed = decimal(value);
  return parsed && parsed.gte("0") && parsed.round(0, Decimal.roundDown).eq(parsed)
    ? parsed
    : null;
}

function positiveDecimal(value) {
  const parsed = decimal(value);
  return parsed && parsed.gt("0") ? parsed : null;
}

function frozenCheck({ code, status, reasonCode, evidence = {} }) {
  return Object.freeze({
    code,
    status,
    reasonCode,
    evidence: Object.freeze({ ...evidence })
  });
}

function ccyPairEligibilityCheck({
  ccyPairCode,
  baseCcyAmountMinor,
  pairRule
}) {
  const normalizedPairCode = String(ccyPairCode || "").trim().toUpperCase();

  if (!pairRule || pairRule.enabled === false
    || String(pairRule.ccyPairCode || "").trim().toUpperCase() !== normalizedPairCode) {
    return frozenCheck({
      code: AUTO_HEDGING_ELIGIBILITY_CHECK.CCY_PAIR_ELIGIBILITY,
      status: AUTO_HEDGING_ELIGIBILITY_CHECK_STATUS.FAIL,
      reasonCode: AUTO_HEDGING_ADMISSION_REASON.CCY_PAIR_NOT_ENABLED,
      evidence: { ccyPairCode: normalizedPairCode }
    });
  }

  const amount = nonNegativeIntegerDecimal(baseCcyAmountMinor);
  const limit = nonNegativeIntegerDecimal(pairRule.maxBaseCcyAmountMinor);

  if (!limit || limit.eq("0")) {
    return frozenCheck({
      code: AUTO_HEDGING_ELIGIBILITY_CHECK.CCY_PAIR_ELIGIBILITY,
      status: AUTO_HEDGING_ELIGIBILITY_CHECK_STATUS.FAIL,
      reasonCode: AUTO_HEDGING_ADMISSION_REASON.TRADE_AMOUNT_LIMIT_NOT_CONFIGURED,
      evidence: { ccyPairCode: normalizedPairCode }
    });
  }

  if (!amount) {
    return frozenCheck({
      code: AUTO_HEDGING_ELIGIBILITY_CHECK.CCY_PAIR_ELIGIBILITY,
      status: AUTO_HEDGING_ELIGIBILITY_CHECK_STATUS.UNAVAILABLE,
      reasonCode: AUTO_HEDGING_ADMISSION_REASON.TRADE_AMOUNT_UNAVAILABLE,
      evidence: {
        ccyPairCode: normalizedPairCode,
        maxBaseCcyAmountMinor: limit.toString()
      }
    });
  }

  const isWithinLimit = amount.lte(limit);
  return frozenCheck({
    code: AUTO_HEDGING_ELIGIBILITY_CHECK.CCY_PAIR_ELIGIBILITY,
    status: isWithinLimit
      ? AUTO_HEDGING_ELIGIBILITY_CHECK_STATUS.PASS
      : AUTO_HEDGING_ELIGIBILITY_CHECK_STATUS.FAIL,
    reasonCode: isWithinLimit
      ? AUTO_HEDGING_ADMISSION_REASON.ELIGIBLE
      : AUTO_HEDGING_ADMISSION_REASON.TRADE_AMOUNT_LIMIT_EXCEEDED,
    evidence: {
      ccyPairCode: normalizedPairCode,
      baseCcyAmountMinor: amount.toString(),
      maxBaseCcyAmountMinor: limit.toString()
    }
  });
}

function transferRateDeviationCheck({
  side,
  transferRate,
  marketPulseStatus,
  marketBid,
  marketOffer,
  maxTransferRateDeviationPercent
}) {
  const threshold = decimal(maxTransferRateDeviationPercent);
  if (!threshold) {
    return frozenCheck({
      code: AUTO_HEDGING_ELIGIBILITY_CHECK.TRANSFER_RATE_DEVIATION,
      status: AUTO_HEDGING_ELIGIBILITY_CHECK_STATUS.UNAVAILABLE,
      reasonCode:
        AUTO_HEDGING_ADMISSION_REASON.TRANSFER_RATE_DEVIATION_LIMIT_NOT_CONFIGURED,
      evidence: {}
    });
  }

  if (threshold.lt("0") || threshold.gt("100")) {
    const error = new RangeError(
      "Maximum Transfer Rate Deviation must be a decimal percentage from 0 to 100."
    );
    error.code = "INVALID_AUTO_HEDGING_ADMISSION_POLICY";
    throw error;
  }

  const normalizedSide = String(side || "").trim().toUpperCase();
  if (!(["BUY", "SELL"].includes(normalizedSide))) {
    return frozenCheck({
      code: AUTO_HEDGING_ELIGIBILITY_CHECK.TRANSFER_RATE_DEVIATION,
      status: AUTO_HEDGING_ELIGIBILITY_CHECK_STATUS.UNAVAILABLE,
      reasonCode: AUTO_HEDGING_ADMISSION_REASON.TRADE_SIDE_UNSUPPORTED,
      evidence: { side: normalizedSide }
    });
  }

  const normalizedStreamStatus = String(marketPulseStatus || "").trim().toUpperCase();
  const applicableMarketRate = normalizedSide === "BUY"
    ? positiveDecimal(marketOffer)
    : positiveDecimal(marketBid);

  if (normalizedStreamStatus !== "RUNNING" || !applicableMarketRate) {
    return frozenCheck({
      code: AUTO_HEDGING_ELIGIBILITY_CHECK.TRANSFER_RATE_DEVIATION,
      status: AUTO_HEDGING_ELIGIBILITY_CHECK_STATUS.UNAVAILABLE,
      reasonCode: AUTO_HEDGING_ADMISSION_REASON.MARKET_PULSE_UNAVAILABLE,
      evidence: {
        side: normalizedSide,
        marketPulseStatus: normalizedStreamStatus,
        marketRateSide: normalizedSide === "BUY" ? "OFFER" : "BID"
      }
    });
  }

  const normalizedTransferRate = positiveDecimal(transferRate);
  if (!normalizedTransferRate) {
    return frozenCheck({
      code: AUTO_HEDGING_ELIGIBILITY_CHECK.TRANSFER_RATE_DEVIATION,
      status: AUTO_HEDGING_ELIGIBILITY_CHECK_STATUS.UNAVAILABLE,
      reasonCode: AUTO_HEDGING_ADMISSION_REASON.TRANSFER_RATE_UNAVAILABLE,
      evidence: {
        side: normalizedSide,
        marketRate: applicableMarketRate.toString()
      }
    });
  }

  const deviationPercent = normalizedTransferRate
    .minus(applicableMarketRate)
    .abs()
    .times("100")
    .div(applicableMarketRate);
  const isWithinLimit = deviationPercent.lte(threshold);

  return frozenCheck({
    code: AUTO_HEDGING_ELIGIBILITY_CHECK.TRANSFER_RATE_DEVIATION,
    status: isWithinLimit
      ? AUTO_HEDGING_ELIGIBILITY_CHECK_STATUS.PASS
      : AUTO_HEDGING_ELIGIBILITY_CHECK_STATUS.FAIL,
    reasonCode: isWithinLimit
      ? AUTO_HEDGING_ADMISSION_REASON.ELIGIBLE
      : AUTO_HEDGING_ADMISSION_REASON.TRANSFER_RATE_DEVIATION_EXCEEDED,
    evidence: {
      side: normalizedSide,
      marketRateSide: normalizedSide === "BUY" ? "OFFER" : "BID",
      transferRate: normalizedTransferRate.toString(),
      marketRate: applicableMarketRate.toString(),
      deviationPercent: deviationPercent.toString(),
      maxDeviationPercent: threshold.toString()
    }
  });
}

function heldDecision(mode, reasonCode, releasable) {
  return Object.freeze({
    state: AUTO_HEDGING_ADMISSION_STATE.HELD,
    admissionMode: mode,
    releasable,
    reasonCodes: Object.freeze([reasonCode]),
    checks: Object.freeze([])
  });
}

function eligibilityDecision(source, admissionMode) {
  const checks = Object.freeze([
    ccyPairEligibilityCheck(source),
    transferRateDeviationCheck(source)
  ]);
  const failedReasonCodes = checks
    .filter(check => check.status !== AUTO_HEDGING_ELIGIBILITY_CHECK_STATUS.PASS)
    .map(check => check.reasonCode);
  const eligible = failedReasonCodes.length === 0;

  return Object.freeze({
    state: eligible
      ? AUTO_HEDGING_ADMISSION_STATE.RELEASED
      : AUTO_HEDGING_ADMISSION_STATE.HELD,
    admissionMode,
    releasable: !eligible,
    reasonCodes: Object.freeze(
      eligible ? [AUTO_HEDGING_ADMISSION_REASON.ELIGIBLE] : failedReasonCodes
    ),
    checks
  });
}

function determineInitialAdmissionState(source = {}) {
  if (source.admissionMode === null || source.admissionMode === undefined
    || String(source.admissionMode).trim() === "") {
    return heldDecision(
      null,
      AUTO_HEDGING_ADMISSION_REASON.EXECUTION_CONTEXT_ADMISSION_MODE_REQUIRED,
      false
    );
  }

  const admissionMode = normalizeAutoHedgingAdmissionMode(source.admissionMode);

  if (admissionMode === AUTO_HEDGING_ADMISSION_MODE.MANUAL_ONLY) {
    return heldDecision(
      admissionMode,
      AUTO_HEDGING_ADMISSION_REASON.MANUAL_ONLY,
      false
    );
  }

  if (admissionMode === AUTO_HEDGING_ADMISSION_MODE.REVIEW_REQUIRED) {
    return heldDecision(
      admissionMode,
      AUTO_HEDGING_ADMISSION_REASON.REVIEW_REQUIRED,
      true
    );
  }

  return eligibilityDecision(source, admissionMode);
}

function decideReleaseToAutoHedging(source = {}) {
  if (source.admissionMode === null || source.admissionMode === undefined
    || String(source.admissionMode).trim() === "") {
    return heldDecision(
      null,
      AUTO_HEDGING_ADMISSION_REASON.EXECUTION_CONTEXT_ADMISSION_MODE_REQUIRED,
      false
    );
  }

  const admissionMode = normalizeAutoHedgingAdmissionMode(source.admissionMode);
  if (admissionMode === AUTO_HEDGING_ADMISSION_MODE.MANUAL_ONLY) {
    return heldDecision(
      admissionMode,
      AUTO_HEDGING_ADMISSION_REASON.MANUAL_ONLY,
      false
    );
  }

  return eligibilityDecision(source, admissionMode);
}

module.exports = {
  AUTO_HEDGING_ADMISSION_REASON,
  AUTO_HEDGING_ADMISSION_STATE,
  AUTO_HEDGING_ELIGIBILITY_CHECK,
  AUTO_HEDGING_ELIGIBILITY_CHECK_STATUS,
  decideReleaseToAutoHedging,
  determineInitialAdmissionState
};
