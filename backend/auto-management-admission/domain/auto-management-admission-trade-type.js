"use strict";

const AUTO_MANAGEMENT_ADMISSION_TRADE_TYPES = Object.freeze([
  "CLIENT_DEAL",
  "HEDGE_DEAL"
]);

function normalizeAutoManagementAdmissionTradeType(value) {
  const tradeType = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (!AUTO_MANAGEMENT_ADMISSION_TRADE_TYPES.includes(tradeType)) {
    const error = new RangeError("Auto Management Admission trade type must be CLIENT_DEAL or HEDGE_DEAL.");
    error.code = "INVALID_AUTO_MANAGEMENT_ADMISSION_TRADE_TYPE";
    throw error;
  }
  return tradeType;
}

module.exports = {
  AUTO_MANAGEMENT_ADMISSION_TRADE_TYPES,
  normalizeAutoManagementAdmissionTradeType
};
