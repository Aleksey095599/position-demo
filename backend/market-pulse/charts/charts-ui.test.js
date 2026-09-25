"use strict";
const test = require("node:test"), assert = require("node:assert/strict"), fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const root = path.resolve(__dirname, "../../../frontend/features/market-pulse/charts");
const source = fs.readFileSync(path.join(root, "chart-data.js"), "utf8") + fs.readFileSync(path.join(root, "chart-workspace.js"), "utf8");
const catalog = { sources: [{ id: "MOEX_ISS", label: "MOEX ISS", instruments: [{ id: "CNYRUB_TOM", label: "CNY/RUB TOM", timeframes: ["ONE_MINUTE", "ONE_HOUR", "ONE_DAY"] }] }] };
const candle = (begin, extra = {}) => ({ begin, open: 12.1234, high: 13, low: 11, close: 12.5678, origin: "CALCULATED", componentCount: 60, coverage: "COMPLETE", stale: false, ...extra });
const tick = () => new Promise(setImmediate);

function harness(candles) {
  const elements = new Map(), calls = [], data = [], storage = new Map();
  function el() { return { value: "", textContent: "", hidden: false, disabled: true, clientWidth: 800, handlers: {},
    addEventListener(name, fn) { this.handlers[name] = fn; }, removeEventListener() {}, replaceChildren() {}, setAttribute() {} }; }
  const get = selector => { if (!elements.has(selector)) elements.set(selector, el()); return elements.get(selector); };
  let range = { from: 100, to: 200 }, rangeHandler, chartOptions;
  const scale = { getVisibleLogicalRange: () => range, setVisibleLogicalRange: value => { range = value; }, subscribeVisibleLogicalRangeChange: fn => { rangeHandler = fn; } };
  const series = { setData(value) { data.push(value); }, applyOptions() {} };
  const chart = { addSeries: () => series, subscribeCrosshairMove() {}, timeScale: () => scale, applyOptions() {}, remove() {} };
  const context = vm.createContext({ document: { documentElement: {}, createElement: el }, getComputedStyle: () => ({ getPropertyValue: () => "#fff" }),
    window: { LightweightCharts: { CandlestickSeries: {}, ColorType: { Solid: "solid" }, CrosshairMode: { Normal: 0 }, createChart: (_canvas, options) => { chartOptions = options; return chart; } },
      localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) } },
    ResizeObserver: class { observe() {} disconnect() {} }, AbortController, URLSearchParams });
  vm.runInContext(source, context);
  const api = { catalog: async () => catalog, candles: async query => {
    calls.push(query);
    return { ...query, precision: 4, minMove: 0.0001, hasMore: false, candles: [candle("2026-09-15T07:00:00.000Z")], ...await candles?.(query) };
  } };
  const workspace = context.createMarketChartWorkspace({ querySelector: get }, api);
  return { workspace, context, calls, data, get, storage, scroll(value) { range = value; rangeHandler(value); }, range: () => range, chartOptions: () => chartOptions };
}

test("Charts starts at H1 and restores a valid source/instrument/timeframe without changing internal codes", async () => {
  const h = harness();
  const saved = h.context.restoreMarketChartSelection(catalog, { source: "REMOVED", timeframe: "ONE_WEEK" });
  assert.equal(saved.source, "MOEX_ISS"); assert.equal(saved.timeframe, "ONE_HOUR");
  await h.workspace.activate();
  assert.equal(h.calls.length, 1); assert.equal(h.calls[0].timeframe, "ONE_HOUR");
  assert.equal(h.get("[data-chart-empty]").hidden, true);
  assert.equal(h.chartOptions().crosshair.mode, h.context.window.LightweightCharts.CrosshairMode.Normal);
  assert.equal(h.data.at(-1)[0].open, 12.1234);
  h.get("[data-chart-timeframe]").value = "ONE_MINUTE";
  h.get("[data-chart-timeframe]").handlers.change({ target: h.get("[data-chart-timeframe]") });
  await tick();
  assert.equal(JSON.parse(h.storage.get("market-chart-selection-v1")).timeframe, "ONE_MINUTE");
});

test("late responses cannot replace a newly selected timeframe", async () => {
  let finish;
  const h = harness(async query => query.timeframe === "ONE_HOUR" ? new Promise(resolve => { finish = resolve; })
    : { candles: [candle("2026-09-16T08:00:00.000Z")] });
  const initial = h.workspace.activate(); await tick();
  const field = h.get("[data-chart-timeframe]"); field.value = "ONE_MINUTE"; field.handlers.change({ target: field });
  await tick();
  finish({ candles: [candle("2026-09-15T07:00:00.000Z")] }); await initial;
  assert.equal(h.data.at(-1)[0].time, Date.parse("2026-09-16T08:00:00.000Z") / 1000);
});

test("prepending stored history preserves the visible candle positions", async () => {
  const h = harness(async query => query.before ? { candles: [candle("2026-09-14T07:00:00.000Z")] }
    : { candles: [candle("2026-09-15T07:00:00.000Z")], hasMore: true });
  await h.workspace.activate(); h.scroll({ from: 10, to: 50 }); await tick();
  assert.equal(h.calls[1].before, "2026-09-15T07:00:00.000Z");
  assert.equal(h.range().from, 11); assert.equal(h.range().to, 51);
  assert.equal(h.data.at(-1).length, 2);
});

test("Latest returns to the last stored candle without changing zoom or requesting data", async () => {
  const h = harness(async () => ({ candles: Array.from({ length: 100 }, (_, i) => candle(new Date(Date.UTC(2026, 8, 1, i)).toISOString())) }));
  await h.workspace.activate();
  h.scroll({ from: 10, to: 40 });
  h.get("[data-chart-latest]").handlers.click();
  assert.equal(h.range().to, 101);
  assert.equal(h.range().to - h.range().from, 30);
  assert.equal(h.calls.length, 1);
  h.get("[data-chart-latest]").handlers.click();
  assert.equal(h.range().to, 101);
  assert.equal(h.range().from, 71);
});

test("chart tables are isolated from application data-table minimum widths and borders", () => {
  const css = fs.readFileSync(path.join(root, "../market-pulse.css"), "utf8");
  assert.match(css, /\.market-history-chart table\s*\{[^}]*min-width: 0;[^}]*table-layout: auto;[^}]*border: 0;/);
  assert.match(css, /\.market-history-chart td\s*\{[^}]*border: 0;/);
});

test("failed older history remains retryable without clearing existing candles", async () => {
  let failed = true;
  const h = harness(async query => {
    if (!query.before) return { hasMore: true };
    if (failed) throw new Error("Temporary failure");
    return { candles: [candle("2026-09-14T07:00:00.000Z")] };
  });
  await h.workspace.activate(); h.scroll({ from: 10, to: 50 }); await tick();
  assert.equal(h.data.at(-1).length, 1); assert.equal(h.get("[data-chart-notice]").hidden, false);
  failed = false; h.get("[data-chart-refresh]").handlers.click(); await tick();
  assert.equal(h.data.at(-1).length, 2);
});

test("D1 uses Moscow trading dates; empty states are explicit", async () => {
  const h = harness(async () => ({ candles: [] }));
  const point = h.context.marketChartPoints([candle("2026-09-14T21:00:00.000Z", { coverage: "SUFFICIENT", componentCount: 240 })], "ONE_DAY")[0];
  assert.equal(point.time, "2026-09-15");
  assert.throws(() => h.context.marketChartPoints([candle("2026-09-15T07:00:00Z"), candle("2026-09-15T07:00:00Z")], "ONE_HOUR"));
  await h.workspace.activate(); assert.equal(h.get("[data-chart-empty]").hidden, false);
  assert.match(h.get("[data-chart-status]").textContent, /No data/);
});

test("Charts omits technical summary and quality details while retaining accessible status", async () => {
  const html = fs.readFileSync(path.join(root, "../market.page.html"), "utf8");
  assert.doesNotMatch(html, /data-chart-detail/);
  assert.match(html, /class="visually-hidden" data-chart-status role="status"/);
  assert.doesNotMatch(source, /Stored history|subscribeCrosshairMove|data-chart-detail/);
  const h = harness(async () => ({ candles: [candle("2026-09-15T07:00:00.000Z", { stale: true, coverage: "PARTIAL", componentCount: 30 })] }));
  await h.workspace.activate();
  assert.equal(h.get("[data-chart-notice]").hidden, true);
  assert.equal(h.get("[data-chart-status]").textContent, "Chart updated.");
});
