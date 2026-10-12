"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  AUTO_MANAGEMENT_ADMISSION_REASON,
  AUTO_MANAGEMENT_ELIGIBILITY_CHECK_STATUS,
  determinePositionManagementMode
} = require("./position-management-mode-decision");

function eligibleSource(overrides = {}) {
  return {
    modeSetting: "AUTO_IF_ELIGIBLE",
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

test("every assignment returns a fixed mode and evidence without transition state", () => {
  for (const [source, expectedMode] of [
    [{}, "MANUAL"],
    [{ modeSetting: "MANUAL" }, "MANUAL"],
    [eligibleSource({ pairRule: null }), "MANUAL"],
    [eligibleSource(), "AUTO"]
  ]) {
    const decision = determinePositionManagementMode(source);
    assert.deepEqual(Object.keys(decision).sort(), [
      "checks", "modeSetting", "positionManagementMode", "reasonCodes"
    ]);
    assert.equal(decision.positionManagementMode, expectedMode);
    assert.ok(Object.isFrozen(decision));
    assert.ok(Object.isFrozen(decision.reasonCodes));
    assert.ok(Object.isFrozen(decision.checks));
    assert.throws(() => { decision.positionManagementMode = "OTHER"; }, TypeError);
  }
});

test("assigns Manual without a Trade Context Position Management Mode", () => {
  const decision = determinePositionManagementMode({ modeSetting: null });

  assert.equal(decision.positionManagementMode, "MANUAL");
  assert.deepEqual(decision.reasonCodes, [
    AUTO_MANAGEMENT_ADMISSION_REASON.TRADE_CONTEXT_POSITION_MANAGEMENT_MODE_REQUIRED
  ]);
});

test("MANUAL assigns Manual at creation", () => {
  const manual = determinePositionManagementMode({ modeSetting: "MANUAL" });

  assert.equal(manual.positionManagementMode, "MANUAL");
  assert.deepEqual(manual.reasonCodes, ["MANUAL"]);
});

test("AUTO_IF_ELIGIBLE assigns Auto only when both configured checks pass", () => {
  const decision = determinePositionManagementMode(eligibleSource());

  assert.equal(decision.positionManagementMode, "AUTO");
  assert.deepEqual(decision.reasonCodes, [AUTO_MANAGEMENT_ADMISSION_REASON.ELIGIBLE]);
  assert.equal(decision.checks.length, 2);
  assert.ok(decision.checks.every(
    check => check.status === AUTO_MANAGEMENT_ELIGIBILITY_CHECK_STATUS.PASS
  ));
});

test("an absent or disabled Ccy Pair fails closed", () => {
  const absent = determinePositionManagementMode(eligibleSource({ pairRule: null }));
  const disabled = determinePositionManagementMode(eligibleSource({
    pairRule: {
      ccyPairCode: "EUR_USD",
      enabled: false,
      maxBaseCcyAmountMinor: 10_000_000_00
    }
  }));

  assert.equal(absent.positionManagementMode, "MANUAL");
  assert.ok(absent.reasonCodes.includes("CCY_PAIR_NOT_ENABLED"));
  assert.ok(disabled.reasonCodes.includes("CCY_PAIR_NOT_ENABLED"));
});

test("the Base Ccy amount limit is inclusive and exact", () => {
  const atLimit = determinePositionManagementMode(eligibleSource({
    baseCcyAmountMinor: 10_000_000_00
  }));
  const aboveLimit = determinePositionManagementMode(eligibleSource({
    baseCcyAmountMinor: 10_000_000_01
  }));

  assert.equal(atLimit.positionManagementMode, "AUTO");
  assert.equal(aboveLimit.positionManagementMode, "MANUAL");
  assert.ok(aboveLimit.reasonCodes.includes("TRADE_AMOUNT_LIMIT_EXCEEDED"));
});

test("BUY uses Offer and SELL uses Bid for the deviation check", () => {
  const buy = determinePositionManagementMode(eligibleSource({
    side: "BUY",
    transferRate: "1.11",
    marketBid: "1.00",
    marketOffer: "1.11",
    maxTransferRateDeviationPercent: "0"
  }));
  const sell = determinePositionManagementMode(eligibleSource({
    side: "SELL",
    transferRate: "1.00",
    marketBid: "1.00",
    marketOffer: "1.11",
    maxTransferRateDeviationPercent: "0"
  }));

  assert.equal(buy.positionManagementMode, "AUTO");
  assert.equal(sell.positionManagementMode, "AUTO");
  assert.equal(buy.checks[1].evidence.marketRateSide, "OFFER");
  assert.equal(sell.checks[1].evidence.marketRateSide, "BID");
});

test("missing or stopped Market Pulse data assigns Manual", () => {
  const stopped = determinePositionManagementMode(eligibleSource({
    marketPulseStatus: "STOPPED"
  }));
  const missing = determinePositionManagementMode(eligibleSource({
    marketOffer: null
  }));

  assert.equal(stopped.positionManagementMode, "MANUAL");
  assert.ok(stopped.reasonCodes.includes("MARKET_PULSE_UNAVAILABLE"));
  assert.ok(missing.reasonCodes.includes("MARKET_PULSE_UNAVAILABLE"));
});

test("deviation is compared as an exact percentage", () => {
  const atLimit = determinePositionManagementMode(eligibleSource({
    transferRate: "101",
    marketBid: "100",
    marketOffer: "100",
    maxTransferRateDeviationPercent: "1"
  }));
  const aboveLimit = determinePositionManagementMode(eligibleSource({
    transferRate: "101.0001",
    marketBid: "100",
    marketOffer: "100",
    maxTransferRateDeviationPercent: "1"
  }));

  assert.equal(atLimit.positionManagementMode, "AUTO");
  assert.equal(aboveLimit.positionManagementMode, "MANUAL");
  assert.ok(aboveLimit.reasonCodes.includes("TRANSFER_RATE_DEVIATION_EXCEEDED"));
});

test("invalid Policy percentages are rejected", () => {
  assert.throws(
    () => determinePositionManagementMode(eligibleSource({
      maxTransferRateDeviationPercent: "100.01"
    })),
    error => error?.code === "INVALID_AUTO_MANAGEMENT_ADMISSION_POLICY"
  );
});

test("a missing per-pair deviation limit assigns Manual fail-closed", () => {
  const decision = determinePositionManagementMode(eligibleSource({
    maxTransferRateDeviationPercent: null
  }));

  assert.equal(decision.positionManagementMode, "MANUAL");
  assert.ok(decision.reasonCodes.includes(
    "TRANSFER_RATE_DEVIATION_LIMIT_NOT_CONFIGURED"
  ));
  assert.equal(decision.checks[1].status, "UNAVAILABLE");
});
