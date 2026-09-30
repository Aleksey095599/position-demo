"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { createCurrentDayModule } = require("./config/current-day-module");
const { SqliteMarketSourceCandleRepository } = require("../historical-data/infrastructure/persistence/sqlite-market-source-candle-repository");
const { AGGREGATION_TIMEFRAMES } = require("./domain/current-day-loading");

const INSTRUMENT = "CNYRUB_TOM";
function iso(local) { return new Date(local + "+03:00").toISOString(); }
function minute(time, date = "2026-09-27", close = "10") {
  return { begin: iso(date + "T" + time + ":00"), end: iso(date + "T" + time + ":59"), open: "10", high: "11", low: "9", close };
}
function page(candles, hasMore = false, nextStart = null) { return { candles, hasMore, nextStart }; }
function harness(context, initial = "2026-09-27T12:00:00") {
  const database = new DatabaseSync(":memory:");
  database.exec(fs.readFileSync(path.resolve(__dirname, "../../../schema.sql"), "utf8"));
  const sourceRepository = new SqliteMarketSourceCandleRepository({ database });
  let clock = Date.parse(initial + "+03:00");
  const requests = [], calculations = [], timers = new Map();
  let timerSequence = 0;
  let responder = async () => page([]);
  let calculator = async command => { calculations.push(command); };
  const dependencies = { database, sourceRepository, now: () => clock, minimumRequestIntervalMs: 0,
    marketDataSource: { loadCandlePage: async (query, options) => { requests.push({ ...query, ...options }); return responder(query, options); } },
    calculateDay: command => calculator(command),
    setTimeoutImpl: (callback, delay) => { const id = ++timerSequence; timers.set(id, { callback, delay }); return id; },
    clearTimeoutImpl: id => timers.delete(id) };
  let module = createCurrentDayModule(dependencies);
  const result = { database, sourceRepository, requests, calculations, timers, dependencies,
    get module() { return module; }, setTime: value => { clock = Date.parse(value + "+03:00"); },
    respond: value => { responder = value; }, calculate: value => { calculator = value; },
    restart: async () => { await module.process.dispose(); module = createCurrentDayModule(dependencies); return module; },
    run: async () => { if (!module.process.running) module.process.start(); await module.process.runNow(); return module.process.status(); } };
  context.after(async () => { await module.process.dispose(); database.close(); });
  return result;
}

test("module creation is passive; settings persist and reject unsupported values", async context => {
  const h = harness(context);
  assert.deepEqual(h.module.settings.get(), { autoStart: false, pollIntervalMinutes: 1, reloadAfterDayEnd: false });
  assert.equal(h.module.process.status().running, false);
  h.module.settings.update({ autoStart: true, pollIntervalMinutes: 15, reloadAfterDayEnd: true });
  await h.restart();
  assert.equal(h.module.process.status().running, false);
  assert.equal(h.requests.length, 0);
  for (const patch of [{ autoStart: 1 }, { reloadAfterDayEnd: "yes" }, { pollIntervalMinutes: 0 },
    { pollIntervalMinutes: 61 }, { pollIntervalMinutes: 1.5 }, { pollIntervalMinutes: "5" }, { extra: true }, null]) {
    assert.throws(() => h.module.settings.update(patch), { code: "INVALID_CURRENT_DAY_LOADING_REQUEST" });
  }
  h.module.process.bootstrap(); await h.module.process.runNow();
  assert.equal(h.module.process.status().running, true);
  assert.equal([...h.timers.values()][0].delay, 900000);
});

test("initial pages commit together; delayed data bounds No data without a fixed lag", async context => {
  const h = harness(context);
  h.respond(async (_, { start }) => start === 0 ? page([minute("08:59")], true, 500) : page([minute("11:43"), minute("11:44") ]));
  const state = await h.run();
  assert.equal(h.requests.length, 2);
  assert.equal(h.requests[0].from, iso("2026-09-27T00:00:00"));
  assert.equal(h.requests[0].till, iso("2026-09-27T12:00:00"));
  assert.equal(state.candles.length, 3);
  assert.deepEqual(state.checkedRanges, [{ from: iso("2026-09-27T00:00:00"), till: iso("2026-09-27T11:45:00") }]);
  assert.equal(h.database.prepare("SELECT COUNT(*) count FROM moex_iss_minute_candle_load_result").get().count, 0);
  h.setTime("2026-09-27T12:01:00");
  h.respond(async () => page([minute("11:44", undefined, "10.5"), minute("11:45")]));
  await h.run();
  assert.equal(h.requests.at(-1).from, iso("2026-09-27T11:44:00"));
  assert.equal(h.module.process.status().candles.length, 4);
  assert.equal(h.module.process.status().candles.find(candle => candle.begin === iso("2026-09-27T11:44:00")).close, "10.5");
});

test("the forming wall-clock minute and future source candles are excluded", async context => {
  const h = harness(context, "2026-09-27T12:00:30");
  h.respond(async () => page([minute("11:59"), minute("12:00"), minute("12:01")]));
  const state = await h.run();
  assert.equal(state.candles.length, 1);
  assert.equal(state.candles[0].begin, iso("2026-09-27T11:59:00"));
});

test("an empty weekend response is successful but does not invent checked minutes", async context => {
  const h = harness(context);
  const state = await h.run();
  assert.deepEqual(state.checkedRanges, []);
  assert.equal(state.lastError, null);
  assert.ok(state.lastSuccessAt);
  h.setTime("2026-09-27T12:01:00"); await h.run();
  assert.equal(h.requests.at(-1).from, iso("2026-09-27T00:00:00"));
});

test("a failed later page leaves candles and successful coverage unchanged", async context => {
  const h = harness(context);
  h.respond(async () => page([minute("11:44")])); await h.run();
  const before = h.module.process.status();
  h.setTime("2026-09-27T12:01:00");
  h.respond(async (_, { start }) => { if (start) throw new Error("network offline"); return page([minute("11:45")], true, 500); });
  const state = await h.run();
  assert.deepEqual(state.candles, before.candles);
  assert.deepEqual(state.checkedRanges, before.checkedRanges);
  assert.match(state.lastError, /network offline/);
  assert.deepEqual(state.errorRange, { from: iso("2026-09-27T11:44:00"), till: iso("2026-09-27T12:01:00") });
  h.respond(async () => page([minute("11:44"), minute("11:45")])); await h.run();
  assert.equal(h.module.process.status().lastError, null);
  assert.equal(h.module.process.status().errorRange, null);
});

test("start rereads today's beginning despite existing stored candles and persisted coverage", async context => {
  const h = harness(context);
  h.respond(async () => page([minute("11:44")])); await h.run();
  await h.restart();
  h.setTime("2026-09-27T15:08:00"); await h.run();
  assert.equal(h.requests.at(-1).from, iso("2026-09-27T00:00:00"));
  assert.equal(h.module.process.status().candles.length, 1);
});

test("only one source operation runs; stop discards in-flight results and no timer restarts", async context => {
  const h = harness(context);
  let resolve;
  h.respond(() => new Promise(done => { resolve = done; }));
  h.module.process.start();
  const first = h.module.process.runNow(), second = h.module.process.runNow();
  assert.equal(first, second);
  await Promise.resolve();
  assert.equal(h.requests.length, 1);
  assert.equal(h.module.process.status().inFlight, true);
  h.module.process.stop();
  resolve(page([minute("11:44")])); await first;
  assert.equal(h.module.process.status().candles.length, 0);
  assert.equal(h.module.process.status().running, false);
  assert.equal(h.timers.size, 0);
});

test("interval changes reschedule active timers and do not implicitly start a stopped process", async context => {
  const h = harness(context);
  h.module.settings.update({ pollIntervalMinutes: 5 });
  assert.equal(h.timers.size, 0);
  await h.run(); assert.equal([...h.timers.values()][0].delay, 300000);
  h.module.settings.update({ pollIntervalMinutes: 15 });
  assert.equal(h.timers.size, 1);
  assert.equal([...h.timers.values()][0].delay, 900000);
});

test("rollover begins a fresh Moscow day and waits until after 00:01 to finalize", async context => {
  const h = harness(context, "2026-09-27T23:59:00");
  h.module.settings.update({ reloadAfterDayEnd: true });
  await h.run();
  h.setTime("2026-09-28T00:00:30"); await h.run();
  assert.equal(h.requests.at(-1).from, iso("2026-09-28T00:00:00"));
  assert.equal(h.calculations.length, 0);
  assert.equal(h.module.process.status().finalization.pending[0].date, "2026-09-27");
  h.setTime("2026-09-28T00:01:00"); await h.run();
  assert.deepEqual(h.calculations.map(value => value.timeframe), AGGREGATION_TIMEFRAMES);
  assert.equal(h.module.process.status().finalization.pending.length, 0);
  assert.equal(h.module.process.status().finalization.lastCompleted.date, "2026-09-27");
});

test("after-day-end reload replaces obsolete candles and rebuilds all derived timeframes", async context => {
  const h = harness(context);
  h.module.settings.update({ reloadAfterDayEnd: true });
  h.respond(async () => page([minute("11:43"), minute("11:44")])); await h.run();
  h.setTime("2026-09-28T00:01:00");
  h.respond(async query => query.from === iso("2026-09-27T00:00:00") ?
    page(query.timeframe === "ONE_MINUTE" ? [minute("11:44", undefined, "10.5")] :
      [{ ...minute("00:00"), end: iso("2026-09-27T23:59:59") }]) : page([]));
  await h.run();
  const stored = h.sourceRepository.findByPeriod({ instrumentId: INSTRUMENT, timeframe: "ONE_MINUTE",
    from: iso("2026-09-27T00:00:00"), till: iso("2026-09-28T00:00:00") });
  assert.equal(stored.length, 1);
  assert.equal(stored[0].close, "10.5");
  assert.equal(h.calculations.length, 5);
  assert.ok(h.database.prepare("SELECT completed_at FROM moex_iss_minute_candle_load_result WHERE load_date='2026-09-27'").get().completed_at);
});

test("finalization failures remain pending across restart and retry all timeframes", async context => {
  const h = harness(context);
  h.module.settings.update({ reloadAfterDayEnd: true }); await h.run();
  h.setTime("2026-09-28T00:02:00");
  h.calculate(async () => { throw new Error("calculation failed"); }); await h.run();
  assert.match(h.module.process.status().finalization.pending[0].lastError, /calculation failed/);
  await h.restart();
  h.calculate(async command => h.calculations.push(command)); await h.run();
  assert.equal(h.calculations.length, 5);
  assert.equal(h.module.process.status().finalization.pending.length, 0);
  await h.run(); assert.equal(h.calculations.length, 5);
});

test("failed finalization fetching preserves previous day, disabling finalization pauses durable work", async context => {
  const h = harness(context);
  h.module.settings.update({ reloadAfterDayEnd: true });
  h.respond(async () => page([minute("11:44")])); await h.run();
  h.setTime("2026-09-28T00:01:00");
  h.respond(async query => { if (query.timeframe === "ONE_DAY") throw new Error("daily offline"); return page([]); });
  await h.run();
  assert.equal(h.database.prepare("SELECT COUNT(*) count FROM moex_iss_minute_candles").get().count, 1);
  h.module.settings.update({ reloadAfterDayEnd: false });
  h.respond(async () => page([])); await h.run();
  assert.equal(h.calculations.length, 0);
  assert.equal(h.module.process.status().finalization.pending.length, 1);
  h.module.settings.update({ reloadAfterDayEnd: true }); await h.run();
  assert.equal(h.module.process.status().finalization.pending.length, 0);
});

test("malformed pagination and excessive page counts cannot partially commit", async context => {
  const h = harness(context);
  h.respond(async () => page([minute("11:44")], true, 0)); await h.run();
  assert.match(h.module.process.status().lastError, /invalid candle page/);
  assert.equal(h.module.process.status().candles.length, 0);
  h.respond(async (_, options) => page([minute("11:44")], true, options.start + 500)); await h.run();
  assert.match(h.module.process.status().lastError, /page limit/);
  assert.equal(h.module.process.status().candles.length, 0);
});

test("enabling end-day reload after the final poll remembers that day across midnight", async context => {
  const h = harness(context, "2026-09-27T23:50:00");
  h.module.settings.update({ pollIntervalMinutes: 15 }); await h.run();
  h.setTime("2026-09-27T23:59:00");
  h.module.settings.update({ reloadAfterDayEnd: true });
  h.module.process.stop();
  h.setTime("2026-09-28T00:14:00"); await h.run();
  assert.equal(h.calculations.length, 5);
  assert.equal(h.module.process.status().finalization.lastCompleted.date, "2026-09-27");
});

test("start then immediate stop does not write an attempt or contact the source", async context => {
  const h = harness(context);
  h.module.process.start();
  h.module.process.stop();
  await h.module.process.runNow();
  assert.equal(h.requests.length, 0);
  assert.equal(h.database.prepare("SELECT COUNT(*) count FROM moex_iss_current_day_load_result").get().count, 0);
});

test("a SQLite failure rolls back both new candles and checked coverage", async context => {
  const h = harness(context);
  h.respond(async () => page([minute("11:43")])); await h.run();
  const before = h.module.process.status();
  h.database.exec(`CREATE TRIGGER reject_candle BEFORE INSERT ON moex_iss_minute_candles
    WHEN NEW.begin_at='${iso("2026-09-27T11:45:00")}' BEGIN SELECT RAISE(ABORT,'disk write failure'); END;`);
  h.respond(async () => page([minute("11:43"), minute("11:44"), minute("11:45")])); await h.run();
  const after = h.module.process.status();
  assert.deepEqual(after.candles, before.candles);
  assert.deepEqual(after.checkedRanges, before.checkedRanges);
  assert.match(after.lastError, /disk write failure/);
});

for (const missing of ["ONE_MINUTE", "ONE_DAY"]) {
  test("finalization retries missing " + missing + " counterpart before replacing or recalculating", async context => {
    const h = harness(context);
    h.module.settings.update({ reloadAfterDayEnd: true });
    h.respond(async () => page([minute("11:44")])); await h.run();
    h.setTime("2026-09-28T00:01:00");
    const daily = { ...minute("00:00"), end: iso("2026-09-27T23:59:59") };
    h.respond(async query => query.from === iso("2026-09-27T00:00:00") && query.timeframe !== missing
      ? page(query.timeframe === "ONE_MINUTE" ? [minute("11:45")] : [daily]) : page([]));
    await h.run();
    assert.equal(h.calculations.length, 0);
    assert.equal(h.module.process.status().finalization.pending.length, 1);
    assert.match(h.module.process.status().finalization.pending[0].lastError, /MISSING_/);
    assert.equal(h.database.prepare("SELECT begin_at FROM moex_iss_minute_candles").get().begin_at, minute("11:44").begin);
    h.respond(async query => query.from === iso("2026-09-27T00:00:00")
      ? page(query.timeframe === "ONE_MINUTE" ? [minute("11:45")] : [daily]) : page([]));
    await h.run();
    assert.equal(h.calculations.length, 5);
    assert.equal(h.module.process.status().finalization.pending.length, 0);
  });
}
