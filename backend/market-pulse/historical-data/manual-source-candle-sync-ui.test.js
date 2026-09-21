"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const root = path.resolve(__dirname, "../../..");
const html = fs.readFileSync(path.join(root, "frontend/features/market-pulse/market.page.html"), "utf8");
const script = fs.readFileSync(path.join(root, "frontend/features/market-pulse/market-calendar-range.js"), "utf8");
const model = vm.createContext({ Date });
vm.runInContext(script, model);
const { selectMarketCalendarRange, marketCalendarRangeDates, loadMarketCalendarRange } = model;
const instrumentId = "CNYRUB_TOM";
const plain = value => JSON.parse(JSON.stringify(value));
function monthResult(month, loaded = new Set()) {
  const start = new Date(`${month}-01T00:00:00Z`);
  const end = new Date(start); end.setUTCMonth(end.getUTCMonth() + 1);
  const days = [];
  for (let t = start.getTime(); t < end.getTime(); t += 86400000) {
    const date = new Date(t).toISOString().slice(0,10);
    days.push({ date, available: date < "2026-09-20", completedAt: loaded.has(date) ? "2026-09-20T12:00:00Z" : null });
  }
  return { instrumentId, month, days };
}
test("one click selects one day; a second click includes both endpoints; a third starts over", () => {
  let selection = selectMarketCalendarRange(null, "2026-09-15");
  assert.deepEqual(plain(marketCalendarRangeDates(selection)), ["2026-09-15"]);
  selection = selectMarketCalendarRange(selection, "2026-09-17");
  assert.deepEqual(plain(marketCalendarRangeDates(selection)), ["2026-09-15", "2026-09-16", "2026-09-17"]);
  assert.equal(selection.choosingEnd, false);
  selection = selectMarketCalendarRange(selection, "2026-09-10");
  assert.deepEqual(plain(marketCalendarRangeDates(selection)), ["2026-09-10"]);
  assert.equal(selection.choosingEnd, true);
});
test("reverse selection and a range across months retain inclusive boundaries", () => {
  const selection = selectMarketCalendarRange(selectMarketCalendarRange(null,"2026-09-02"),"2026-08-30");
  assert.deepEqual(plain(marketCalendarRangeDates(selection)), ["2026-08-30","2026-08-31","2026-09-01","2026-09-02"]);
  assert.deepEqual(plain(marketCalendarRangeDates(selectMarketCalendarRange(selectMarketCalendarRange(null,"2026-09-15"),"2026-09-15"))),["2026-09-15"]);
});
test("invalid, reversed, and oversized ranges are rejected", () => {
  for (const selection of [{start:"2026-02-30",end:"2026-03-02"},{start:"2026-09-17",end:"2026-09-15"},{start:"2024-01-01",end:"2026-01-01"}]) {
    assert.throws(() => marketCalendarRangeDates(selection), /valid range/);
  }
});
test("only missing selected days are loaded in order, including the final date", async () => {
  const requests = []; const reads = []; const loaded = new Set(["2026-08-31","2026-09-01"]); let active = 0;
  const result = await loadMarketCalendarRange({
    instrumentId, selection:{start:"2026-08-30",end:"2026-09-02"},
    readMonth: async ({month}) => { reads.push(month); return monthResult(month,loaded); },
    loadDay: async ({date}) => { assert.equal(active++,0); await Promise.resolve(); requests.push(date); active--; },
    onProgress: async () => {}
  });
  assert.deepEqual(reads,["2026-08","2026-09"]);
  assert.deepEqual(requests,["2026-08-30","2026-09-02"]);
  assert.deepEqual(plain(result),{total:4,loaded:2,skipped:2});
});
test("the first failure stops the range; retry skips days already completed", async () => {
  const requests = []; const loaded = new Set(); let fail = true;
  const options = {
    instrumentId, selection:{start:"2026-09-15",end:"2026-09-17"},
    readMonth: async ({month}) => monthResult(month,loaded),
    loadDay: async ({date}) => { requests.push(date); if (fail && date === "2026-09-16") throw new Error("Source unavailable"); loaded.add(date); },
    onProgress: async () => {}
  };
  await assert.rejects(loadMarketCalendarRange(options), error => error.date === "2026-09-16");
  assert.deepEqual(requests,["2026-09-15","2026-09-16"]);
  fail = false; requests.length = 0;
  const result = await loadMarketCalendarRange(options);
  assert.deepEqual(requests,["2026-09-16","2026-09-17"]);
  assert.equal(result.skipped,1);
});
test("fully loaded ranges cause no load request", async () => {
  const result = await loadMarketCalendarRange({instrumentId,selection:{start:"2026-09-15",end:"2026-09-15"},
    readMonth:async ({month}) => monthResult(month,new Set(["2026-09-15"])),
    loadDay:async () => assert.fail("Unexpected load"),onProgress:async () => {}});
  assert.equal(result.loaded,0); assert.equal(result.skipped,1);
});
test("unavailable dates and an incomplete plan fail before the first source request", async () => {
  for (const readMonth of [async ({month}) => monthResult(month),async ({month}) => ({instrumentId,month,days:[]})]) {
    await assert.rejects(loadMarketCalendarRange({instrumentId,selection:{start:"2026-09-19",end:"2026-09-20"},readMonth,
      loadDay:async () => assert.fail("Unexpected load"),onProgress:async () => {}}), /completed Moscow days/);
  }
});
test("Data Management provides calendar selection and a single load action", () => {
  assert.match(html, /id="marketHistorySyncInstrument"/);
  assert.match(html, /id="marketCalendarSelection"/);
  assert.match(html, /Load selected days/);
  assert.doesNotMatch(html, /id="marketHistorySync(?:FromDate|ThroughDate)"|id="marketCalendarLoadDay"/);
});
