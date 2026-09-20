"use strict";

class InvalidTradePurposeError extends Error {}

function tradePurposeId(value) {
  const id = typeof value === "string" ? value.trim().toUpperCase() : "";

  if (!/^[A-Z0-9_-]{2,30}$/.test(id)) {
    throw new InvalidTradePurposeError(
      "Trade Purpose ID must contain 2 to 30 letters, digits, underscores, or hyphens."
    );
  }

  return id;
}

function tradePurpose({ tradePurposeId: id, name } = {}) {
  const normalizedId = tradePurposeId(id);
  const normalizedName = typeof name === "string" ? name.trim() : "";

  if (normalizedName.length < 1 || normalizedName.length > 100) {
    throw new InvalidTradePurposeError("Trade Purpose Name must contain 1 to 100 characters.");
  }

  return Object.freeze({ tradePurposeId: normalizedId, name: normalizedName });
}

module.exports = { InvalidTradePurposeError, tradePurpose, tradePurposeId };
