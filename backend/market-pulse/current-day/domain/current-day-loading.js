"use strict";

const MINUTE_MS = 60000;
const DAY_MS = 86400000;
const MOSCOW_OFFSET_MS = 10800000;
const AGGREGATION_TIMEFRAMES = Object.freeze(["FIVE_MINUTES", "FIFTEEN_MINUTES", "ONE_HOUR", "FOUR_HOURS", "ONE_DAY"]);
const DEFAULT_SETTINGS = Object.freeze({ autoStart: false, pollIntervalMinutes: 1, reloadAfterDayEnd: false });
function invalid(message) {
  return Object.assign(new RangeError(message), { code: "INVALID_CURRENT_DAY_LOADING_REQUEST" });
}
function instrumentId(value = "CNYRUB_TOM") {
  if (typeof value !== "string" || !/^[A-Z0-9_]{1,64}$/.test(value)) throw invalid("Choose a valid market instrument.");
  return value;
}
function moscowDay(timestamp) {
  if (!Number.isFinite(Number(timestamp))) throw invalid("Current day clock must return a valid timestamp.");
  const date = new Date(Number(timestamp) + MOSCOW_OFFSET_MS).toISOString().slice(0, 10);
  const from = new Date(date + "T00:00:00+03:00").toISOString();
  return { date, from, till: new Date(Date.parse(from) + DAY_MS).toISOString() };
}
function validateSettings(patch, current = DEFAULT_SETTINGS) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw invalid("Current day settings must be an object.");
  if (Object.keys(patch).some(key => !Object.hasOwn(DEFAULT_SETTINGS, key))) throw invalid("Unknown current day setting.");
  const settings = { ...current, ...patch };
  if (typeof settings.autoStart !== "boolean" || typeof settings.reloadAfterDayEnd !== "boolean") throw invalid("Current day flags must be boolean values.");
  if (!Number.isSafeInteger(settings.pollIntervalMinutes) || settings.pollIntervalMinutes < 1 || settings.pollIntervalMinutes > 60) {
    throw invalid("Polling interval must be a whole number from 1 to 60 minutes.");
  }
  return Object.freeze(settings);
}
function mergeRanges(ranges) {
  const result = [];
  for (const range of [...ranges].sort((a, b) => a.from.localeCompare(b.from))) {
    const previous = result.at(-1);
    if (previous && previous.till >= range.from) previous.till = previous.till > range.till ? previous.till : range.till;
    else result.push({ from: range.from, till: range.till });
  }
  return result;
}
module.exports = { MINUTE_MS, DAY_MS, AGGREGATION_TIMEFRAMES, DEFAULT_SETTINGS, invalid, instrumentId, moscowDay, validateSettings, mergeRanges };
