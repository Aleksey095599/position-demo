"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const root = path.resolve(__dirname, "../../..");
const read = name => fs.readFileSync(path.join(root, "frontend/features/market-pulse", name), "utf8");
const context = vm.createContext({});
vm.runInContext(read("market-calendar-range.js") + read("market-aggregation-range.js"), context);
const selection = { start: "2026-09-15", end: "2026-09-17" };

test("aggregation calendar has separate controls, details, and coverage statuses", () => {
  const html = read("market.page.html");
  assert.match(html, /id="marketAggregationForm"/);
  assert.match(html, /Source Candle Timeframe/); assert.match(html, /Calculation Timeframe/);
  assert.match(html, /id="marketAggregationTitle">Calculate Aggregated Candles<\/h2>/);
  assert.match(html, /class="market-history-field-value">1 min<\/span>/);
  assert.doesNotMatch(html, /name="baseTimeframe"/);
  assert.match(html, /Calculate Candles/);
  assert.match(html, /Complete coverage/); assert.match(html, /Partial coverage/); assert.match(html, /No data/);
  assert.match(html, /Complete coverage<\/span>/);
  assert.match(html, /Partial coverage · 50–100%/);
  assert.match(html, /Insufficient coverage · &lt;50%/);
  assert.match(read("components/market-aggregation-details.dialog.html"), /id="marketAggregationDetails"/);
  assert.doesNotMatch(read("market-aggregation-api.js"), /load-day|moex\.com|historical-candles/);
});

test("range calculation is sequential, includes endpoints and accepts sparse and empty days", async () => {
  const calls = [], progress = [];
  let active = 0;
  const result = await context.calculateMarketAggregationRange({ selection, instrumentId: "CNYRUB_TOM", timeframe: "ONE_HOUR",
    calculateDay: async command => {
      assert.equal(active++, 0); calls.push(command.date); await Promise.resolve(); active--;
      return { ...command, status: command.date.endsWith("16") ? "NO_DATA" : "CALCULATED", candleCount: 1 };
    }, onProgress: value => progress.push(value.phase) });
  assert.deepEqual(calls, ["2026-09-15", "2026-09-16", "2026-09-17"]);
  assert.equal(result.completed, 3);
  assert.deepEqual(progress, ["calculating", "completed", "calculating", "completed", "calculating", "completed"]);
});

test("first failed day stops the queue and identifies the retry boundary", async () => {
  const calls = [];
  await assert.rejects(() => context.calculateMarketAggregationRange({ selection, instrumentId: "CNYRUB_TOM", timeframe: "ONE_HOUR",
    calculateDay: async command => {
      calls.push(command.date);
      if (command.date.endsWith("16")) throw new Error("Failed");
      return { ...command, status: "COMPLETE", candleCount: 1 };
    }, onProgress() {} }), error => error.date === "2026-09-16");
  assert.deepEqual(calls, ["2026-09-15", "2026-09-16"]);
});

test("insufficient coverage is a successful calculation and does not stop the remaining days", async () => {
  const calls=[];
  const result=await context.calculateMarketAggregationRange({selection,instrumentId:"CNYRUB_TOM",timeframe:"ONE_HOUR",
    calculateDay:async command=>{calls.push(command.date);return {...command,status:"CALCULATED",candleCount:0,insufficientCount:1};},onProgress(){}});
  assert.equal(result.completed,3);
  assert.equal(calls.length,3);
});

test("mismatched responses cannot mark a different day as calculated", async () => {
  await assert.rejects(() => context.calculateMarketAggregationRange({ selection, instrumentId: "CNYRUB_TOM", timeframe: "ONE_HOUR",
    calculateDay: async command => ({ ...command, date: "2026-09-14", status: "COMPLETE", candleCount: 1 }), onProgress() {} }), /response is invalid/);
});

function calendarHarness(apiOverrides = {}) {
  const nodes = new Map();
  function node() {
    const classes = new Set(), attributes = new Map();
    return {
      children: [], dataset: {}, style: {}, handlers: {}, value: "", textContent: "", validity: {}, disabled: false, inert: false,
      classList: { add: name => classes.add(name), remove: name => classes.delete(name),
        contains: name => classes.has(name), toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name) },
      setAttribute(name, value) { attributes.set(name, value); },
      getAttribute: name => attributes.get(name),
      addEventListener(type, handler) { this.handlers[type] = handler; },
      append(...items) { this.children.push(...items); },
      replaceChildren(...items) { this.children = items; this.replacements = (this.replacements || 0) + 1; },
      querySelectorAll() {
        return this.children.flatMap(child => [child, ...child.querySelectorAll()]).filter(child => child.dataset.aggregationDate);
      },
      setCustomValidity(message) { this.validationMessage = message; },
      reportValidity() { return true; }, focus() {},
      showModal() { this.open = true; }, close() { this.open = false; }
    };
  }
  const get = key => { if (!nodes.has(key)) nodes.set(key, node()); return nodes.get(key); };
  const fields = [];
  for (const [name, value] of Object.entries({ instrumentId: "CNYRUB_TOM", timeframe: "ONE_HOUR", fromDate: "", toDate: "" })) {
    fields[name] = node(); fields[name].value = value; fields.push(fields[name]);
  }
  get("#marketAggregationForm").elements = fields;
  get("marketAggregationDetails").querySelector = get;
  get("marketAggregationDetails").id = "marketAggregationDetails";
  const response = query => ({ ...query, today: "2026-09-23", earliestDate: "2025-09-22", throughDate: "2026-09-22",
    days: Array.from({ length: 30 }, (_, i) => ({ date: `${query.month}-${String(i + 1).padStart(2, "0")}`,
      available: i < 22, status: i < 22 ? "PENDING" : "UNAVAILABLE", candleCount: 0 })) });
  const api = { calendar: async query => response(query), ...apiOverrides };
  const environment = vm.createContext({
    document: { getElementById: get, createElement: node }, window: { addEventListener() {} },
    marketHistorySyncYesterday: () => "2026-09-22",
    marketHistorySyncMonthFormatter: { format: date => date.toISOString().slice(0, 7) },
    formatMarketHistorySyncDate: date => date,
    MARKET_HISTORY_SYNC_WEEKDAYS: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
  });
  vm.runInContext(read("market-calendar-range.js") + read("market-aggregation-range.js")
    + read("market-aggregation-calendar.js").split("    const marketAggregationCalendar =")[0], environment);
  const calendar = environment.createMarketAggregationCalendar({ querySelector: get }, api);
  function inputRange(start, end) {
    fields.fromDate.value = start; fields.toDate.value = end;
    fields.toDate.handlers.input();
  }
  return { calendar, get, fields, response, inputRange, grid: get("[data-aggregation-grid]"),
    submit: () => get("#marketAggregationForm").handlers.submit({ preventDefault() {} }) };
}

test("day details explain skipped hours without displaying fictitious OHLC", async () => {
  const h=calendarHarness({day:async()=>({sourceLoaded:true,status:"INSUFFICIENT",hours:[],skippedHours:[{
    begin:"2026-09-15T05:00:00.000Z",componentCount:1,firstSourceBegin:"2026-09-15T05:59:00.000Z",
    lastSourceBegin:"2026-09-15T05:59:00.000Z",missingMinutes:["2026-09-15T05:00:00.000Z"]
  }]})});
  await h.calendar.load();
  const wrapper=h.grid.children[0].children.find(node=>node.children.some(child=>child.dataset.aggregationDate));
  wrapper.children[1].handlers.click();
  await new Promise(setImmediate);
  const content=node=>[node.textContent,...node.children.map(content)].join(" ");
  const text=content(h.get("[data-aggregation-details-body]"));
  assert.match(text,/Insufficient coverage/);
  assert.match(text,/08:00–09:00 · 1\/60 minutes/);
  assert.match(text,/No hourly candle created/);
  assert.doesNotMatch(text,/Open |undefined/);
});

test("calculated mixed days replace the total with three coverage counters joined by plus signs", async () => {
  const h=calendarHarness();
  await h.calendar.load();
  const response=h.response({instrumentId:"CNYRUB_TOM",timeframe:"ONE_HOUR",month:"2026-09"});
  Object.assign(response.days[17],{status:"CALCULATED",candleCount:10,completeCount:9,partialCount:1,insufficientCount:1});
  const mixed=calendarHarness({calendar:async()=>response});
  await mixed.calendar.load();
  const cell=mixed.grid.querySelectorAll().find(node=>node.dataset.aggregationDate==="2026-09-18");
  assert.match(cell.className,/is-completed/);
  assert.equal(cell.children.some(node=>node.className==="market-calendar-candle-count"),false);
  const counts=cell.children.find(node=>node.className==="market-aggregation-coverage-counts");
  assert.deepEqual(Array.from(counts.children,node=>node.textContent),["9","+","1","+","1"]);
  const caption=cell.children.find(node=>node.className==="market-calendar-candle-caption");
  assert.equal(caption.textContent,"");
  assert.equal(caption.classList.contains("is-empty"),true);
  assert.equal(caption.getAttribute("aria-hidden"),"true");
  assert.match(cell.getAttribute("aria-label"),/Calculated, 10 candles saved, 1 interval skipped/);
  assert.match(cell.getAttribute("aria-label"),/Insufficient coverage: 1 interval/);
});

test("hour coverage strip contains all 24 labeled Moscow hours and a separate color legend", async () => {
  const hourCoverage=Array.from({length:24},(_,hour)=>({hour,coverage:hour===8?"INSUFFICIENT":hour===9?"COMPLETE":hour===18?"PARTIAL":"NO_DATA",
    componentCount:hour===8?1:hour===9?60:hour===18?58:0}));
  const h=calendarHarness({day:async()=>({sourceLoaded:true,status:"CALCULATED",hours:[],skippedHours:[],hourCoverage})});
  await h.calendar.load();
  const wrapper=h.grid.children[0].children.find(node=>node.children.some(child=>child.dataset.aggregationDate));
  wrapper.children[1].handlers.click(); await new Promise(setImmediate);
  const body=h.get("[data-aggregation-details-body]");
  const strip=body.children.find(node=>node.className==="market-aggregation-hour-strip");
  assert.equal(strip.children.length,24);
  assert.match(strip.children[8].className,/is-insufficient/);
  assert.match(strip.children[9].className,/is-completed/);
  assert.match(strip.children[18].className,/is-partial/);
  assert.match(strip.children[23].getAttribute("aria-label"),/23:00–24:00: No data/);
  assert.equal(body.children.find(node=>node.className.includes("market-aggregation-strip-legend")).children.length,4);
});

test("calendar reserves six weeks and manual dates share selection with day cells", async () => {
  const h = calendarHarness(); await h.calendar.load();
  assert.equal(h.grid.children[0].children.length, 49);
  h.inputRange("2026-09-15", "2026-09-16");
  assert.equal(h.get("[data-aggregation-selection]").textContent, "2 days selected");
  assert.equal(h.get("[data-aggregation-calculate]").disabled, false);
  const cells = h.grid.querySelectorAll();
  assert.equal(cells.find(cell => cell.dataset.aggregationDate === "2026-09-15").getAttribute("aria-pressed"), "true");
  h.get("[data-aggregation-clear]").handlers.click();
  cells.find(cell => cell.dataset.aggregationDate === "2026-09-17").handlers.click();
  assert.equal(h.fields.fromDate.value, "2026-09-17"); assert.equal(h.fields.toDate.value, "2026-09-17");
  h.inputRange("2026-09-23", "2026-09-24");
  assert.equal(h.get("[data-aggregation-calculate]").disabled, true);
});

test("starting calculation clears selection, queues remaining days and restores the failed range", async () => {
  let reject;
  const h = calendarHarness({ calculateDay: () => new Promise((_, fail) => { reject = fail; }) });
  await h.calendar.load(); h.inputRange("2026-09-15", "2026-09-17");
  const pending = h.submit(); await Promise.resolve();
  assert.equal(h.fields.fromDate.value, ""); assert.equal(h.fields.toDate.value, "");
  assert.equal(h.fields.instrumentId.disabled, true);
  assert.match(h.grid.querySelectorAll().find(cell => cell.dataset.aggregationDate === "2026-09-15").className, /is-loading/);
  assert.match(h.grid.querySelectorAll().find(cell => cell.dataset.aggregationDate === "2026-09-16").className, /is-queued/);
  reject(new Error("Local calculation failed.")); await pending;
  assert.equal(h.fields.fromDate.value, "2026-09-15"); assert.equal(h.fields.toDate.value, "2026-09-17");
  assert.equal(h.fields.instrumentId.disabled, false);
  assert.match(h.grid.querySelectorAll().find(cell => cell.dataset.aggregationDate === "2026-09-15").className, /is-error/);
});

test("unchanged refresh preserves the calendar DOM and old responses cannot replace a new month", async () => {
  let resolveOld;
  let calls = 0;
  const h = calendarHarness({ calendar: query => {
    calls++;
    if (calls === 3) return new Promise(resolve => { resolveOld = () => resolve(h.response(query)); });
    return Promise.resolve(h.response(query));
  } });
  await h.calendar.load(); const count = h.grid.replacements;
  await h.calendar.load(true); assert.equal(h.grid.replacements, count);
  const old = h.calendar.load(true);
  h.get("[data-aggregation-previous]").handlers.click();
  await Promise.resolve(); await Promise.resolve();
  resolveOld(); await old;
  assert.equal(h.get("[data-aggregation-month]").textContent, "2026-08");
  assert.equal(h.grid.querySelectorAll()[0].dataset.aggregationDate, "2026-08-01");
  assert.equal(h.get("[data-aggregation-refresh]").disabled, false);
});
