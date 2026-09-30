"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  AUTO_MANAGEMENT_ADMISSION_REASON,
  AUTO_MANAGEMENT_ADMISSION_STATE,
  AUTO_MANAGEMENT_ELIGIBILITY_CHECK_STATUS,
  determineInitialAdmissionState
} = require("./auto-management-admission-decision");

function eligibleSource(overrides = {}) {
  return {
    admissionMode: "AUTO_IF_ELIGIBLE",
    ccyPairCode: "EUR_USD",
    baseCcyAmountMinor: 5_000_000_00,
    pairRule: {
      ccyPairCode: "EUR_USD",
      enabled: true,
      maxBaseCcyAmountMinor: 10_000_000_00
    },
    side: "BUY",
    transferRate: "1.105",
    marketPulseStatus: "RUNNING",
    marketBid: "1.10",
    marketOffer: "1.10",
    maxTransferRateDeviationPercent: "0.50",
    ...overrides
  };
}

test("holds trades without a Trade Context Position Management Mode", () => {
  const decision = determineInitialAdmissionState({ admissionMode: null });

  assert.equal(decision.state, AUTO_MANAGEMENT_ADMISSION_STATE.HELD);
  assert.deepEqual(decision.reasonCodes, [
    AUTO_MANAGEMENT_ADMISSION_REASON.TRADE_CONTEXT_POSITION_MANAGEMENT_MODE_REQUIRED
  ]);
  assert.equal(decision.releasable, true);
});

test("MANUAL assigns Manual at creation", () => {
  const reviewRequired = determineInitialAdmissionState({ admissionMode: "MANUAL" });

  assert.equal(reviewRequired.state, "HELD");
  assert.equal(reviewRequired.releasable, true);
  assert.deepEqual(reviewRequired.reasonCodes, ["MANUAL"]);
});

test("AUTO_IF_ELIGIBLE releases only when both configured checks pass", () => {
  const decision = determineInitialAdmissionState(eligibleSource());

  assert.equal(decision.state, AUTO_MANAGEMENT_ADMISSION_STATE.RELEASED);
  assert.deepEqual(decision.reasonCodes, [AUTO_MANAGEMENT_ADMISSION_REASON.ELIGIBLE]);
  assert.equal(decision.checks.length, 2);
  assert.ok(decision.checks.every(
    check => check.status === AUTO_MANAGEMENT_ELIGIBILITY_CHECK_STATUS.PASS
  ));
});

test("an absent or disabled Ccy Pair fails closed", () => {
  const absent = determineInitialAdmissionState(eligibleSource({ pairRule: null }));
  const disabled = determineInitialAdmissionState(eligibleSource({
    pairRule: {
      ccyPairCode: "EUR_USD",
      enabled: false,
      maxBaseCcyAmountMinor: 10_000_000_00
    }
  }));

  assert.equal(absent.state, "HELD");
  assert.ok(absent.reasonCodes.includes("CCY_PAIR_NOT_ENABLED"));
  assert.ok(disabled.reasonCodes.includes("CCY_PAIR_NOT_ENABLED"));
});

test("the Base Ccy amount limit is inclusive and exact", () => {
  const atLimit = determineInitialAdmissionState(eligibleSource({
    baseCcyAmountMinor: 10_000_000_00
  }));
  const aboveLimit = determineInitialAdmissionState(eligibleSource({
    baseCcyAmountMinor: 10_000_000_01
  }));

  assert.equal(atLimit.state, "RELEASED");
  assert.equal(aboveLimit.state, "HELD");
  assert.ok(aboveLimit.reasonCodes.includes("TRADE_AMOUNT_LIMIT_EXCEEDED"));
});

test("BUY uses Offer and SELL uses Bid for the deviation check", () => {
  const buy = determineInitialAdmissionState(eligibleSource({
    side: "BUY",
    transferRate: "1.11",
    marketBid: "1.00",
    marketOffer: "1.11",
    maxTransferRateDeviationPercent: "0"
  }));
  const sell = determineInitialAdmissionState(eligibleSource({
    side: "SELL",
    transferRate: "1.00",
    marketBid: "1.00",
    marketOffer: "1.11",
    maxTransferRateDeviationPercent: "0"
  }));

  assert.equal(buy.state, "RELEASED");
  assert.equal(sell.state, "RELEASED");
  assert.equal(buy.checks[1].evidence.marketRateSide, "OFFER");
  assert.equal(sell.checks[1].evidence.marketRateSide, "BID");
});

test("missing or stopped Market Pulse data holds the trade", () => {
  const stopped = determineInitialAdmissionState(eligibleSource({
    marketPulseStatus: "STOPPED"
  }));
  const missing = determineInitialAdmissionState(eligibleSource({
    marketOffer: null
  }));

  assert.equal(stopped.state, "HELD");
  assert.ok(stopped.reasonCodes.includes("MARKET_PULSE_UNAVAILABLE"));
  assert.ok(missing.reasonCodes.includes("MARKET_PULSE_UNAVAILABLE"));
});

test("deviation is compared as an exact percentage", () => {
  const atLimit = determineInitialAdmissionState(eligibleSource({
    transferRate: "101",
    marketBid: "100",
    marketOffer: "100",
    maxTransferRateDeviationPercent: "1"
  }));
  const aboveLimit = determineInitialAdmissionState(eligibleSource({
    transferRate: "101.0001",
    marketBid: "100",
    marketOffer: "100",
    maxTransferRateDeviationPercent: "1"
  }));

  assert.equal(atLimit.state, "RELEASED");
  assert.equal(aboveLimit.state, "HELD");
  assert.ok(aboveLimit.reasonCodes.includes("TRANSFER_RATE_DEVIATION_EXCEEDED"));
});

test("invalid Policy percentages are rejected", () => {
  assert.throws(
    () => determineInitialAdmissionState(eligibleSource({
      maxTransferRateDeviationPercent: "100.01"
    })),
    error => error?.code === "INVALID_AUTO_MANAGEMENT_ADMISSION_POLICY"
  );
});

test("a missing per-pair deviation limit holds the trade fail-closed", () => {
  const decision = determineInitialAdmissionState(eligibleSource({
    maxTransferRateDeviationPercent: null
  }));

  assert.equal(decision.state, "HELD");
  assert.ok(decision.reasonCodes.includes(
    "TRANSFER_RATE_DEVIATION_LIMIT_NOT_CONFIGURED"
  ));
  assert.equal(decision.checks[1].status, "UNAVAILABLE");
});
