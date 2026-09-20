"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..", "..", "..");
const pageHtml = fs.readFileSync(
  path.join(ROOT, "frontend", "features", "market-pulse", "market.page.html"),
  "utf8"
);
const pageScript = fs.readFileSync(
  path.join(ROOT, "frontend", "features", "market-pulse", "market.page.js"),
  "utf8"
);
const pageStyle = fs.readFileSync(
  path.join(ROOT, "frontend", "features", "market-pulse", "market-pulse.css"),
  "utf8"
);

test("provides a date-only manual source Candle synchronization form", () => {
  assert.match(pageHtml, /id="marketHistorySyncForm"/);
  assert.match(pageHtml, /id="marketHistorySyncFromDate"[^>]*type="date"/);
  assert.match(pageHtml, /id="marketHistorySyncThroughDate"/);
  assert.match(pageHtml, /Yesterday, Moscow time/);
  assert.match(pageHtml, /Up to 366 closed Moscow calendar days/);
  assert.match(pageHtml, /id="marketHistorySyncButton"[^>]*type="submit"/);
  assert.doesNotMatch(pageHtml, /id="marketHistorySyncTillDate"/);
});

test("synchronizes one server-planned day at a time and stops on failure", () => {
  assert.match(
    pageScript,
    /\/api\/v1\/market-pulse\/historical-candles\/manual-sync\/plan\?/
  );
  assert.match(
    pageScript,
    /"\/api\/v1\/market-pulse\/historical-candles\/manual-sync\/step"/
  );
  assert.match(pageScript, /while \(!marketHistorySyncPlan\.complete\)/);
  assert.match(pageScript, /MARKET_HISTORY_SYNC_MAX_DAY_COUNT = 366/);
  assert.match(pageScript, /find\(day => day\.status === "PENDING"\)/);
  assert.match(pageScript, /marketHistorySyncDayStates\.set\(nextDay\.date, "ERROR"\)/);
  assert.doesNotMatch(pageScript, /setInterval\(/);
});

test("renders calendar progress safely with all manual synchronization states", () => {
  for (const status of [
    "pending",
    "loading",
    "completed",
    "already-loaded",
    "error"
  ]) {
    assert.match(pageStyle, new RegExp(`is-${status}`));
  }

  assert.match(pageScript, /document\.createElement\("div"\)/);
  assert.match(pageScript, /marketHistorySyncCalendar\.replaceChildren\(fragment\)/);
  assert.match(pageScript, /accessibleStatus\.textContent/);
  assert.match(pageScript, /fetchedCandleCount === 0/);
});
