"use strict";

const { minorToMajor } = require("../money/money");

const HEDGE_QUICK_MODE_PRESET = Object.freeze({
  SMALL: Object.freeze({
    code: "SMALL",
    label: "Small",
    amountMinorProperty: "smallBaseCcyAmountMinor"
  }),
  MEDIUM: Object.freeze({
    code: "MEDIUM",
    label: "Medium",
    amountMinorProperty: "mediumBaseCcyAmountMinor"
  }),
  LARGE: Object.freeze({
    code: "LARGE",
    label: "Large",
    amountMinorProperty: "largeBaseCcyAmountMinor"
  }),
  XLARGE: Object.freeze({
    code: "XLARGE",
    label: "Extra Large",
    amountMinorProperty: "xlargeBaseCcyAmountMinor"
  })
});

const HEDGE_QUICK_MODE_PRESET_CODES = Object.freeze(
  Object.keys(HEDGE_QUICK_MODE_PRESET)
);

function hedgeQuickModePresets(settings) {
  if (!settings || typeof settings !== "object") {
    throw new TypeError("Hedge Quick Mode Settings are required.");
  }

  const fractionDigits = settings.baseCcyFractionDigits;

  if (!Number.isInteger(fractionDigits) || fractionDigits < 0 || fractionDigits > 10) {
    throw new RangeError("Base Ccy Fraction Digits must be an integer from 0 to 10.");
  }

  const presets = HEDGE_QUICK_MODE_PRESET_CODES.map(presetCode => {
    const definition = HEDGE_QUICK_MODE_PRESET[presetCode];
    const amountMinor = settings[definition.amountMinorProperty];

    if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
      throw new RangeError(`${definition.label} Base Ccy Amount Minor must be a positive safe integer.`);
    }

    return {
      presetCode,
      label: definition.label,
      baseCcyAmountMinor: amountMinor,
      baseCcyAmount: minorToMajor(amountMinor, fractionDigits)
    };
  });

  if (!presets.every((preset, index) =>
    index === 0 || presets[index - 1].baseCcyAmountMinor < preset.baseCcyAmountMinor
  )) {
    throw new RangeError(
      "Hedge Quick Mode amounts must be strictly increasing from Small through Extra Large."
    );
  }

  return presets;
}

function hedgeQuickModeInstruction({
  settings,
  presetCode,
  side,
  tenor
}) {
  const normalizedPresetCode = String(presetCode || "").trim().toUpperCase();
  const normalizedTenor = String(tenor || settings?.defaultTenor || "")
    .trim()
    .toUpperCase();
  const preset = hedgeQuickModePresets(settings)
    .find(item => item.presetCode === normalizedPresetCode);

  if (!preset) {
    throw new RangeError(
      `Hedge Quick Mode Preset Code must be ${HEDGE_QUICK_MODE_PRESET_CODES.join(", ")}.`
    );
  }

  if (!["TOD", "TOM", "SPOT"].includes(normalizedTenor)) {
    throw new RangeError("Hedge Quick Mode Tenor must be TOD, TOM or SPOT.");
  }

  return {
    pricingRuleId: settings.pricingRuleId,
    ccyPairCode: settings.ccyPairCode,
    side,
    dealtCcyCode: settings.baseCcyCode,
    dealtCcyAmount: minorToMajor(
      preset.baseCcyAmountMinor,
      settings.baseCcyFractionDigits
    ),
    tenor: normalizedTenor
  };
}

module.exports = {
  HEDGE_QUICK_MODE_PRESET_CODES,
  hedgeQuickModeInstruction,
  hedgeQuickModePresets
};
