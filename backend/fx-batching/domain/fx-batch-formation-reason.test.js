"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  FX_BATCH_FORMATION_REASON_CODE,
  FX_BATCH_FORMATION_REASON_DETAILS_MAX_LENGTH,
  fxBatchFormationReason
} = require("./fx-batch-formation-reason");

test("defaults a direct batch command to manual selection", () => {
  assert.deepEqual(fxBatchFormationReason({}, 3), {
    reasonCode: FX_BATCH_FORMATION_REASON_CODE.MANUAL_SELECTION,
    details: { selectedTradeCount: 3 },
    detailsJson: '{"selectedTradeCount":3}'
  });
});

test("preserves a supported automatic reason and its structured values", () => {
  const reason = fxBatchFormationReason({
    reasonCode: FX_BATCH_FORMATION_REASON_CODE.TRANSFER_RATE_CORRIDOR_BREACHED,
    details: {
      maxSpreadPercent: "0.05",
      acceptedSpreadPercent: "0.0125"
    }
  }, 2);

  assert.equal(
    reason.reasonCode,
    FX_BATCH_FORMATION_REASON_CODE.TRANSFER_RATE_CORRIDOR_BREACHED
  );
  assert.deepEqual(reason.details, {
    maxSpreadPercent: "0.05",
    acceptedSpreadPercent: "0.0125",
    selectedTradeCount: 2
  });
  assert.equal(Object.isFrozen(reason.details), true);
});

test("rejects an unsupported reason or malformed details", () => {
  assert.throws(
    () => fxBatchFormationReason({ reasonCode: "UNKNOWN" }, 2),
    /Unsupported FX Batch Formation Reason/
  );
  assert.throws(
    () => fxBatchFormationReason({}, 0),
    /positive selected Trade count/
  );

  const circularDetails = {};
  circularDetails.self = circularDetails;
  assert.throws(
    () => fxBatchFormationReason({ details: circularDetails }, 2),
    /must be serializable/
  );
  assert.throws(
    () => fxBatchFormationReason({
      details: { value: "X".repeat(FX_BATCH_FORMATION_REASON_DETAILS_MAX_LENGTH) }
    }, 2),
    /must not exceed/
  );
});
