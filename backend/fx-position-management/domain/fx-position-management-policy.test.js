"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  FX_POSITION_MANAGEMENT_MODE,
  FX_POSITION_MANAGEMENT_MODES,
  normalizeFxPositionManagementMode,
  resolveFxPositionManagementMode
} = require("./fx-position-management-policy");

test("defines the complete immutable FX Position Management Mode vocabulary", () => {
  assert.deepEqual(FX_POSITION_MANAGEMENT_MODE, {
    MANUAL: "MANUAL",
    AUTO: "AUTO"
  });
  assert.deepEqual(FX_POSITION_MANAGEMENT_MODES, ["MANUAL", "AUTO"]);
  assert.equal(Object.isFrozen(FX_POSITION_MANAGEMENT_MODE), true);
  assert.equal(Object.isFrozen(FX_POSITION_MANAGEMENT_MODES), true);
});

test("normalizes supported FX Position Management Modes", () => {
  assert.equal(
    normalizeFxPositionManagementMode(" manual "),
    FX_POSITION_MANAGEMENT_MODE.MANUAL
  );
  assert.equal(
    normalizeFxPositionManagementMode("Auto"),
    FX_POSITION_MANAGEMENT_MODE.AUTO
  );
});

test("strictly rejects absent, blank, non-string and unsupported modes", () => {
  [undefined, null, "", "   ", 1, true, {}, "AUTO_PRICED"].forEach(value => {
    assert.throws(
      () => normalizeFxPositionManagementMode(value),
      error => error instanceof RangeError
        && error.code === "INVALID_FX_POSITION_MANAGEMENT_MODE"
    );
  });
});

test("Pricing Rule override takes precedence over Execution Context default", () => {
  assert.equal(
    resolveFxPositionManagementMode({
      pricingRuleOverride: " auto ",
      executionContextDefault: "manual"
    }),
    FX_POSITION_MANAGEMENT_MODE.AUTO
  );
});

test("Execution Context default is used when Pricing Rule has no override", () => {
  assert.equal(
    resolveFxPositionManagementMode({
      pricingRuleOverride: null,
      executionContextDefault: " auto "
    }),
    FX_POSITION_MANAGEMENT_MODE.AUTO
  );
  assert.equal(
    resolveFxPositionManagementMode({
      executionContextDefault: "manual"
    }),
    FX_POSITION_MANAGEMENT_MODE.MANUAL
  );
});

test("MANUAL is the safe fallback when neither policy value is configured", () => {
  assert.equal(
    resolveFxPositionManagementMode(),
    FX_POSITION_MANAGEMENT_MODE.MANUAL
  );
  assert.equal(
    resolveFxPositionManagementMode({
      pricingRuleOverride: undefined,
      executionContextDefault: null
    }),
    FX_POSITION_MANAGEMENT_MODE.MANUAL
  );
});

test("resolver validates every configured policy value before applying precedence", () => {
  assert.throws(
    () => resolveFxPositionManagementMode({
      pricingRuleOverride: "AUTO",
      executionContextDefault: "AUTO_PRICED"
    }),
    error => error instanceof RangeError
      && error.code === "INVALID_FX_POSITION_MANAGEMENT_MODE"
      && /Execution Context/.test(error.message)
  );
});

test("resolver rejects malformed policy containers", () => {
  [null, [], "AUTO", 1].forEach(policy => {
    assert.throws(
      () => resolveFxPositionManagementMode(policy),
      error => error instanceof TypeError
        && error.code === "INVALID_FX_POSITION_MANAGEMENT_POLICY"
    );
  });
});
