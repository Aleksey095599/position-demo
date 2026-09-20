"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  BATCH_FORMATION_REASON_CODE,
  BATCH_FORMATION_REASON_DETAILS_MAX_LENGTH,
  batchFormationReason
} = require("./batch-formation-reason");

test("defaults a direct batch command to manual selection", () => {
  assert.deepEqual(batchFormationReason({}, 3), {
    reasonCode: BATCH_FORMATION_REASON_CODE.MANUAL_SELECTION,
    details: { selectedTradeCount: 3 },
    detailsJson: '{"selectedTradeCount":3}'
  });
});

test("preserves a supported automatic reason and its structured values", () => {
  const reason = batchFormationReason({
    reasonCode: BATCH_FORMATION_REASON_CODE.TRANSFER_RATE_CORRIDOR_BREACHED,
    details: {
      maxSpreadPercent: "0.05",
      acceptedSpreadPercent: "0.0125"
    }
  }, 2);

  assert.equal(
    reason.reasonCode,
    BATCH_FORMATION_REASON_CODE.TRANSFER_RATE_CORRIDOR_BREACHED
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
    () => batchFormationReason({ reasonCode: "UNKNOWN" }, 2),
    /Unsupported Batch Formation Reason/
  );
  assert.throws(
    () => batchFormationReason({}, 0),
    /positive selected Trade count/
  );

  const circularDetails = {};
  circularDetails.self = circularDetails;
  assert.throws(
    () => batchFormationReason({ details: circularDetails }, 2),
    /must be serializable/
  );
  assert.throws(
    () => batchFormationReason({
      details: { value: "X".repeat(BATCH_FORMATION_REASON_DETAILS_MAX_LENGTH) }
    }, 2),
    /must not exceed/
  );
});
