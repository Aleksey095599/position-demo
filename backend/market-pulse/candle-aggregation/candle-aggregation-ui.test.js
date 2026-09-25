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
  assert.match(html, /Source Timeframe/);
  assert.match(html, /<label for="marketAggregationTimeframe">Timeframe<\/label>/);
  assert.doesNotMatch(html, /About candle aggregation timeframes/);
  assert.match(html, /id="marketAggregationTitle">Calculate Aggregated Candles<\/h2>/);
  assert.match(html, /class="market-history-field-value">M1<\/span>/);
  assert.doesNotMatch(html, /name="baseTimeframe"/);
  assert.match(html, /Calculate Candles/);
  assert.match(html, /value="FOUR_HOURS">H4/);
  assert.match(html, /value="FIFTEEN_MINUTES">M15/);
  assert.match(html, /value="FIVE_MINUTES">M5/);
  assert.match(html, /Complete coverage/); assert.match(html, /Partial coverage/); assert.match(html, /No data/);
  assert.match(html, /Complete coverage<\/span>/);
  assert.match(html, /Partial coverage · 50–100%/);
  assert.match(html, /Insufficient coverage · &lt;50%/);
  assert.match(html, /aria-label="About coverage in Charts" data-tooltip-trigger="click"/);
  assert.doesNotMatch(html, /data-aggregation-coverage-note/);
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
    calculateDay:async command=>{calls.push(command.date);return {...command,status:"CALCULATED",candleCount:1,insufficientCount:1};},onProgress(){}});
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
      showModal() { this.open = true; }, close() { this.open = false; this.handlers.close?.(); }
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
  vm.runInContext(read("market-calendar-range.js") + read("market-aggregation-range.js") + read("market-aggregation-batch.js")
    + read("market-aggregation-calendar.js").split("    const marketAggregationCalendar =")[0], environment);
  const calendar = environment.createMarketAggregationCalendar({ querySelector: get }, api);
  function inputRange(start, end) {
    fields.fromDate.value = start; fields.toDate.value = end;
    fields.toDate.handlers.input();
  }
  return { calendar, get, fields, response, inputRange, grid: get("[data-aggregation-grid]"),
    submit: () => get("#marketAggregationForm").handlers.submit({ preventDefault() {} }) };
}

test("batch requires confirmation, calculates only its plan, stops after current work and preserves timeframe isolation", async () => {
  const commands=[{instrumentId:"CNYRUB_TOM",timeframe:"ONE_DAY",date:"2026-08-15"},
    {instrumentId:"CNYRUB_TOM",timeframe:"ONE_HOUR",date:"2026-09-15"}];
  let finish; const calculated=[], plans=[];
  const h=calendarHarness({batchPlan:async query=>{
    plans.push(query);
    return {instrumentId:"CNYRUB_TOM",source:"MOEX_ISS",eligibleDayCount:2,pendingDayCount:2,
      calculationCount:2,upToDateCount:8,fromDate:"2026-08-15",throughDate:"2026-09-15",commands};
  },calculateDay:async command=>{
    calculated.push(command);
    return new Promise(resolve=>{finish=()=>resolve({...command,status:"CALCULATED",candleCount:1});});
  }});
  await h.calendar.load(); h.inputRange("2026-09-20","2026-09-21");
  await h.get("[data-aggregation-batch]").handlers.click();
  assert.equal(calculated.length,0);
  assert.equal(Object.keys(plans[0]).join(","),"instrumentId");
  assert.equal(h.get("[data-aggregation-batch-dialog]").open,true);
  assert.equal(h.fields.timeframe.disabled,true);
  const pending=h.get("[data-aggregation-batch-start]").handlers.click();
  await new Promise(setImmediate);
  assert.equal(calculated[0].date,"2026-08-15");
  assert.equal(h.fields.fromDate.value,"");
  h.get("[data-aggregation-batch-stop]").handlers.click();
  finish(); await pending;
  assert.equal(calculated.length,1);
  assert.equal(h.fields.timeframe.disabled,false);
  assert.match(h.get("[data-aggregation-batch-status]").textContent,/Stopped: 1\/2/);
});

test("batch confirmation explains source data and pending days without operation counters", async () => {
  const html = read("market.page.html");
  assert.match(html, /id="marketAggregationBatchSourceTitle">Source data/);
  assert.match(html, /id="marketAggregationBatchCalculationTitle">Calculation/);
  assert.match(html, /Existing up-to-date results will remain unchanged\./);
  assert.match(html, /Keep this page open until calculation finishes\./);
  for (const count of [1, 20]) {
    const commands = Array.from({ length: count }, (_, index) => ({
      instrumentId: "CNYRUB_TOM", timeframe: "ONE_HOUR", date: `2026-09-${String(index + 1).padStart(2, "0")}`
    }));
    const h = calendarHarness({ batchPlan: async () => ({
      instrumentId: "CNYRUB_TOM", source: "MOEX_ISS", eligibleDayCount: 102, pendingDayCount: count,
      calculationCount: count, upToDateCount: 510 - count, fromDate: "2026-05-04", throughDate: "2026-09-23", commands
    }) });
    await h.calendar.load();
    await h.get("[data-aggregation-batch]").handlers.click();
    assert.match(h.get("[data-aggregation-batch-context]").textContent, /MOEX ISS/);
    assert.equal(h.get("[data-aggregation-batch-summary]").textContent,
      "M1 candles are available for 102 days between 2026-05-04 and 2026-09-23.");
    assert.equal(h.get("[data-aggregation-batch-pending]").textContent,
      count === 1 ? "1 day requires calculation or an update." : "20 days require calculation or an update.");
  }
});

test("batch cancellation and an up-to-date plan never calculate candles", async () => {
  let calls=0;
  const h=calendarHarness({batchPlan:async()=>({instrumentId:"CNYRUB_TOM",source:"MOEX_ISS",
    eligibleDayCount:1,pendingDayCount:1,upToDateCount:4,calculationCount:1,commands:[{instrumentId:"CNYRUB_TOM",timeframe:"ONE_HOUR",date:"2026-09-15"}]}),
    calculateDay:async()=>{calls++;}});
  await h.calendar.load();
  await h.get("[data-aggregation-batch]").handlers.click();
  h.get("[data-aggregation-batch-cancel]").handlers.click();
  assert.equal(calls,0); assert.equal(h.fields.instrumentId.disabled,false);
  const empty=calendarHarness({batchPlan:async()=>({instrumentId:"CNYRUB_TOM",source:"MOEX_ISS",
    eligibleDayCount:1,pendingDayCount:0,upToDateCount:5,calculationCount:0,commands:[]})});
  await empty.calendar.load(); await empty.get("[data-aggregation-batch]").handlers.click();
  assert.match(empty.get("[data-aggregation-batch-status]").textContent,/up to date/);
  assert.equal(empty.get("[data-aggregation-batch-dialog]").open,undefined);
});

test("batch preparation and execution errors are highlighted and retry resets the warning", async () => {
  let attempt = 0;
  const h = calendarHarness({batchPlan: async () => {
    if (++attempt === 1) throw new Error("API endpoint was not found.");
    return {instrumentId:"CNYRUB_TOM",source:"MOEX_ISS",eligibleDayCount:1,pendingDayCount:1,
      calculationCount:1,upToDateCount:4,commands:[{instrumentId:"CNYRUB_TOM",timeframe:"ONE_HOUR",date:"2026-09-15"}]};
  },calculateDay: async () => { throw new Error("Calculation failed."); }});
  await h.calendar.load();
  const panel = h.get("[data-aggregation-batch-progress]");
  await h.get("[data-aggregation-batch]").handlers.click();
  assert.equal(panel.classList.contains("is-warning"),true);
  assert.match(h.get("[data-aggregation-batch-status]").textContent,/API endpoint was not found/);
  await h.get("[data-aggregation-batch]").handlers.click();
  assert.equal(panel.classList.contains("is-warning"),false);
  await h.get("[data-aggregation-batch-start]").handlers.click();
  assert.equal(panel.classList.contains("is-warning"),true);
  assert.match(h.get("[data-aggregation-batch-status]").textContent,/Calculation failed/);
});

test("batch execution is sequential and stops on failed or mismatched results", async () => {
  const env=vm.createContext({}); vm.runInContext(read("market-aggregation-batch.js"),env);
  const commands=["ONE_HOUR","FOUR_HOURS","ONE_DAY"].map(timeframe=>({instrumentId:"CNYRUB_TOM",timeframe,date:"2026-09-15"}));
  const calls=[];
  await assert.rejects(()=>env.runMarketAggregationBatch({commands,shouldStop:()=>false,onProgress:()=>{},
    calculateDay:async command=>{calls.push(command.timeframe); if(calls.length===2)throw new Error("Failed");return {...command,status:"CALCULATED",candleCount:1};}}),
    error=>error.completed===1&&error.command.timeframe==="FOUR_HOURS");
  assert.deepEqual(calls,["ONE_HOUR","FOUR_HOURS"]);
  await assert.rejects(()=>env.runMarketAggregationBatch({commands,shouldStop:()=>false,onProgress:()=>{},
    calculateDay:async command=>({...command,date:"2026-09-16",status:"CALCULATED",candleCount:1})}),/response is invalid/);
});

test("calendar refresh errors use the shared warning style and clear after successful refresh", async () => {
  let fail=true;
  const h=calendarHarness({calendar:async query=>{if(fail)throw new Error("Calendar offline");return h.response(query);}});
  await h.calendar.load();
  const message=h.get("[data-aggregation-message]");
  assert.equal(message.classList.contains("market-aggregation-warning"),true);
  assert.match(message.textContent,/Calendar offline/);
  fail=false; await h.calendar.load(true);
  assert.equal(message.classList.contains("market-aggregation-warning"),false);
  assert.equal(message.textContent,"");
});

test("range validation and calculation errors use the shared style without styling successful progress", async () => {
  let fail=true;
  const h=calendarHarness({calculateDay:async command=>{
    if(fail)throw new Error("Calculation offline");
    return {...command,status:"CALCULATED",candleCount:1};
  }});
  await h.calendar.load();
  h.inputRange("2026-09-18","2026-09-15");
  assert.equal(h.get("[data-aggregation-selection]").classList.contains("market-aggregation-warning"),true);
  h.inputRange("2026-09-15","2026-09-15");
  assert.equal(h.get("[data-aggregation-selection]").classList.contains("market-aggregation-warning"),false);
  await h.submit();
  const message=h.get("[data-aggregation-message]");
  assert.match(message.textContent,/Calculation offline/);
  assert.equal(message.classList.contains("market-aggregation-warning"),true);
  fail=false; await h.submit();
  assert.equal(message.classList.contains("market-aggregation-warning"),false);
  assert.match(message.textContent,/1 days calculated/);
});

test("detail request failures, stored errors and source integrity warnings share the same banner", async () => {
  for(const kind of ["request","stored","generic","integrity"]) {
    const h=calendarHarness({day:async()=>{
      if(kind==="request")throw new Error("Details offline");
      return {sourceLoaded:true,status:kind==="integrity"?"CALCULATED":"ERROR",candles:[],
        lastError:kind==="stored"?"Stored failure":null,
        sourceIntegrity:kind==="integrity"?{status:"MISMATCH"}:null};
    }});
    await h.calendar.load();
    const wrapper=h.grid.children[0].children.find(node=>node.children.some(child=>child.dataset.aggregationDate));
    wrapper.children[1].handlers.click(); await new Promise(setImmediate);
    const warnings=h.get("[data-aggregation-details-body]").children.filter(node=>node.className==="market-aggregation-warning");
    assert.equal(warnings.length,1,kind);
    assert.ok(warnings[0].textContent.length>0);
  }
});

test("day details display saved insufficient candles with their OHLC and coverage", async () => {
  const h=calendarHarness({day:async()=>({sourceLoaded:true,status:"CALCULATED",candles:[{
    open:"12",high:"12",low:"12",close:"12",coverage:"INSUFFICIENT",
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
  assert.match(text,/Candle saved/);
  assert.match(text,/Open 12/);
  assert.doesNotMatch(text,/skipped|No candle created|undefined/i);
});

test("daily calendar shows one unnumbered coverage square and switches back to the hourly legend", async () => {
  const h = calendarHarness({ calendar: async query => ({ ...h.response(query), days: [
    { date: "2026-09-18", available: true, status: "CALCULATED", candleCount: 1,
      completeCount: 0, partialCount: 0, sufficientCount: 1, insufficientCount: 0 },
    { date: "2026-09-19", available: true, status: "CALCULATED", candleCount: 1,
      completeCount: 0, partialCount: 0, sufficientCount: 0, insufficientCount: 1 },
    { date: "2026-09-20", available: true, status: "NO_DATA", candleCount: 0,
      completeCount: 0, partialCount: 0, sufficientCount: 0, insufficientCount: 0 }
  ] }) });
  const text = node => [node.textContent, ...node.children.map(text)].join(" ");
  h.fields.timeframe.value = "ONE_DAY";
  await h.calendar.load();
  const cell = h.grid.querySelectorAll()[0];
  const counts = cell.children.find(node => node.className === "market-aggregation-coverage-counts");
  assert.deepEqual(Array.from(counts.children, node => node.textContent), [""]);
  assert.match(counts.children[0].className, /is-completed/);
  assert.match(cell.getAttribute("aria-label"), /Sufficient coverage/);
  assert.doesNotMatch(cell.getAttribute("aria-label"), /Insufficient coverage/);
  const insufficient = h.grid.querySelectorAll()[1];
  const insufficientCounts = insufficient.children.find(node => node.className === "market-aggregation-coverage-counts");
  assert.deepEqual(Array.from(insufficientCounts.children, node => node.textContent), [""]);
  assert.match(insufficientCounts.children[0].className, /is-insufficient/);
  assert.match(insufficient.getAttribute("aria-label"), /Insufficient coverage/);
  assert.match(insufficient.className, /is-completed/);
  assert.equal(h.grid.querySelectorAll()[2].children.some(node => node.className === "market-aggregation-coverage-counts"), false);
  const legend = h.get("[data-aggregation-coverage-legend]");
  assert.match(text(legend), /Sufficient coverage · ≥240 min/);
  assert.match(text(legend), /Insufficient coverage · <240 min/);
  assert.doesNotMatch(text(legend), /Partial|Complete|%/);
  const coverageHelp = () => legend.children[0].children[0];
  assert.equal(coverageHelp().type, "button");
  assert.equal(coverageHelp().dataset.tooltipTrigger, "click");
  assert.equal(coverageHelp().getAttribute("aria-label"), "About coverage in Charts");
  assert.equal(coverageHelp().dataset.tooltip, "Only Sufficient coverage candles are used in Charts. Insufficient coverage candles remain stored but are excluded.");
  h.fields.timeframe.value = "ONE_HOUR";
  h.fields.timeframe.handlers.change();
  await new Promise(setImmediate);
  assert.match(text(legend), /Partial coverage/);
  assert.doesNotMatch(text(legend), /240 min|Sufficient coverage/);
  assert.equal(coverageHelp().dataset.tooltipTrigger, "click");
  assert.equal(coverageHelp().dataset.tooltip, "Only Complete and Partial coverage candles are used in Charts. Insufficient coverage candles remain stored but are excluded.");
});

test("daily details show actual minute count and sufficient threshold without overnight gaps or hourly ratios", async () => {
  for (const [componentCount, coverage] of [[239,"INSUFFICIENT"],[240,"SUFFICIENT"]]) {
    const h = calendarHarness({ day: async () => ({ sourceLoaded: true, status: "CALCULATED",
      minimumMinutes: 240, expectedMinutes: null, intervalCoverage: null, candles: [{
        begin: "2026-09-17T21:00:00.000Z", end: "2026-09-18T20:59:59.000Z",
        open: "12", high: "13", low: "11", close: "12.5", componentCount, coverage,
        firstSourceBegin: "2026-09-18T07:00:00.000Z", lastSourceBegin: "2026-09-18T15:59:00.000Z", missingMinutes: []
      }] }) });
    h.fields.timeframe.value = "ONE_DAY";
    await h.calendar.load();
    const wrapper = h.grid.children[0].children.find(node => node.children.some(child => child.dataset.aggregationDate));
    wrapper.children[1].handlers.click();
    await new Promise(setImmediate);
    const text = node => [node.textContent, ...node.children.map(text)].join(" ");
    assert.match(h.get("marketAggregationDetailsTitle").textContent, /D1/);
    const body = text(h.get("[data-aggregation-details-body]"));
    assert.match(body, new RegExp(`${componentCount} M1 candles`));
    assert.match(body, /240 M1 candles. Candle saved/);
    assert.match(body, /Open 12 · High 13 · Low 11 · Close 12.5/);
    assert.match(body, /First: 10:00 · Last: 18:59/);
    assert.doesNotMatch(body, /Partial|Complete coverage|\/1440|\/60|Minutes without candles|Interval coverage|undefined/);
  }
});

test("switching to daily calendar ignores a late four-hour response", async () => {
  let release;
  const queries = [];
  const h = calendarHarness({ calendar: query => {
    queries.push(query.timeframe);
    if (query.timeframe === "FOUR_HOURS") return new Promise(resolve => { release = () => resolve(h.response(query)); });
    return Promise.resolve(h.response(query));
  } });
  h.fields.timeframe.value = "FOUR_HOURS";
  const pending = h.calendar.load(true);
  h.fields.timeframe.value = "ONE_DAY";
  h.fields.timeframe.handlers.change();
  await new Promise(setImmediate);
  const replacements = h.grid.replacements;
  release(); await pending;
  assert.deepEqual(queries, ["FOUR_HOURS", "ONE_DAY"]);
  assert.equal(h.grid.replacements, replacements);
  assert.equal(h.grid.inert, false);
});

test("calculated mixed days replace the total with three coverage counters without separators", async () => {
  const h=calendarHarness();
  await h.calendar.load();
  const response=h.response({instrumentId:"CNYRUB_TOM",timeframe:"ONE_HOUR",month:"2026-09"});
  Object.assign(response.days[17],{status:"CALCULATED",candleCount:11,completeCount:9,partialCount:1,insufficientCount:1});
  const mixed=calendarHarness({calendar:async()=>response});
  await mixed.calendar.load();
  const cell=mixed.grid.querySelectorAll().find(node=>node.dataset.aggregationDate==="2026-09-18");
  assert.match(cell.className,/is-completed/);
  assert.equal(cell.children.some(node=>node.className==="market-calendar-candle-count"),false);
  const counts=cell.children.find(node=>node.className==="market-aggregation-coverage-counts");
  assert.deepEqual(Array.from(counts.children,node=>node.textContent),["9","1","1"]);
  const caption=cell.children.find(node=>node.className==="market-calendar-candle-caption");
  assert.equal(caption.textContent,"");
  assert.equal(caption.classList.contains("is-empty"),true);
  assert.equal(caption.getAttribute("aria-hidden"),"true");
  assert.match(cell.getAttribute("aria-label"),/Calculated, 11 candles saved/);
  assert.doesNotMatch(cell.getAttribute("aria-label"),/skipped/);
  assert.match(cell.getAttribute("aria-label"),/Insufficient coverage: 1 interval/);
});

test("hour coverage strip contains all 24 labeled Moscow hours and a separate color legend", async () => {
  const intervalCoverage=Array.from({length:24},(_,hour)=>({hour,coverage:hour===8?"INSUFFICIENT":hour===9?"COMPLETE":hour===18?"PARTIAL":"NO_DATA",
    componentCount:hour===8?1:hour===9?60:hour===18?58:0}));
  const h=calendarHarness({day:async()=>({sourceLoaded:true,status:"CALCULATED",candles:[],intervalCoverage})});
  await h.calendar.load();
  const wrapper=h.grid.children[0].children.find(node=>node.children.some(child=>child.dataset.aggregationDate));
  wrapper.children[1].handlers.click(); await new Promise(setImmediate);
  const body=h.get("[data-aggregation-details-body]");
  const strip=body.children.find(node=>node.className==="market-aggregation-hour-strip");
  assert.equal(strip.children.length,24);
  assert.ok(strip.children.every(slot => slot.children.length === 1));
  assert.equal(strip.children[8].children[0].textContent, "08:00");
  assert.equal(strip.children[8].children[0].className, "market-aggregation-hour-square");
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

test("switching timeframe requests a separate calendar and ignores a late hourly response", async () => {
  let oldResponse;
  const calls = [];
  const h = calendarHarness({ calendar: query => {
    calls.push(query.timeframe);
    if (calls.length === 2) return new Promise(resolve => { oldResponse = () => resolve(h.response(query)); });
    const response = h.response(query);
    if (query.timeframe === "FOUR_HOURS") Object.assign(response.days[14],
      { status: "CALCULATED", candleCount: 3, completeCount: 1, partialCount: 1, insufficientCount: 1 });
    return Promise.resolve(response);
  } });
  await h.calendar.load();
  const pending = h.calendar.load(true);
  h.fields.timeframe.value = "FOUR_HOURS";
  h.fields.timeframe.handlers.change();
  await new Promise(setImmediate);
  oldResponse(); await pending;
  assert.deepEqual(calls, ["ONE_HOUR", "ONE_HOUR", "FOUR_HOURS"]);
  const cell = h.grid.querySelectorAll().find(node => node.dataset.aggregationDate === "2026-09-15");
  assert.match(cell.getAttribute("aria-label"), /Calculated, 3 candles saved/);
});

test("five-minute calendar ignores late responses and displays 288 opening times inside the colored blocks", async () => {
  let release;
  const calls=[];
  const h=calendarHarness({calendar:query=>{
    calls.push(query.timeframe);
    if(query.timeframe==="ONE_HOUR") return new Promise(resolve=>{ release=()=>resolve(h.response(query)); });
    const response=h.response(query);
    Object.assign(response.days[14],{status:"CALCULATED",candleCount:3,completeCount:1,partialCount:1,insufficientCount:1});
    return Promise.resolve(response);
  },day:async query=>{
    assert.equal(query.timeframe,"FIVE_MINUTES");
    return {sourceLoaded:true,status:"CALCULATED",intervalCoverage:Array.from({length:288},(_,i)=>({
      hour:Math.floor(i/12),minuteOfDay:i*5,coverage:"NO_DATA",componentCount:0})),
      candles:[{begin:"2026-09-15T07:05:00.000Z",componentCount:2,missingMinutes:[],
        open:"12",high:"12",low:"12",close:"12",coverage:"INSUFFICIENT"}]};
  }});
  const pending=h.calendar.load();
  h.fields.timeframe.value="FIVE_MINUTES";
  h.fields.timeframe.handlers.change(); await new Promise(setImmediate);
  release(); await pending;
  assert.deepEqual(calls,["ONE_HOUR","FIVE_MINUTES"]);
  const cell=h.grid.querySelectorAll().find(node=>node.dataset.aggregationDate==="2026-09-15");
  const counts=cell.children.find(node=>node.className==="market-aggregation-coverage-counts");
  assert.deepEqual(Array.from(counts.children,node=>node.textContent),["1","1","1"]);
  const wrapper=h.grid.children[0].children.find(node=>node.children.includes(cell));
  wrapper.children[1].handlers.click(); await new Promise(setImmediate);
  assert.match(h.get("marketAggregationDetailsTitle").textContent,/M5/);
  const body=h.get("[data-aggregation-details-body]");
  const strip=body.children.find(node=>node.className==="market-aggregation-hour-strip");
  assert.equal(strip.children.length,288);
  assert.ok(strip.children.every(slot=>slot.children.length===1));
  assert.equal(strip.children[1].children[0].textContent,"00:05");
  assert.equal(strip.children[287].children[0].textContent,"23:55");
  assert.match(strip.children[287].getAttribute("aria-label"),/23:55–24:00: No data, 0\/5 minutes/);
  const content=node=>[node.textContent,...node.children.map(content)].join(" ");
  assert.match(content(body),/10:05–10:10 · 2\/5 minutes/);
  assert.match(content(h.get("[data-aggregation-coverage-legend]")),/Partial coverage · 50–100%/);
  assert.doesNotMatch(content(body),/undefined|NaN/);
});

test("quarter-hour details show 96 precisely labeled intervals and 15-minute coverage", async () => {
  const h = calendarHarness({ day: async () => ({ sourceLoaded: true, status: "CALCULATED",
    intervalCoverage: Array.from({ length: 96 }, (_, i) => ({ hour: Math.floor(i / 4), minuteOfDay: i * 15,
      coverage: "NO_DATA", componentCount: 0 })),
    candles: [{ begin: "2026-09-15T07:15:00.000Z", componentCount: 7, missingMinutes: [],
      open:"12",high:"12",low:"12",close:"12",coverage:"INSUFFICIENT" }] }) });
  h.fields.timeframe.value = "FIFTEEN_MINUTES";
  await h.calendar.load();
  const wrapper = h.grid.children[0].children.find(node => node.children.some(child => child.dataset.aggregationDate));
  wrapper.children[1].handlers.click(); await new Promise(setImmediate);
  assert.match(h.get("marketAggregationDetailsTitle").textContent, /M15/);
  const body = h.get("[data-aggregation-details-body]");
  const strip = body.children.find(node => node.className === "market-aggregation-hour-strip");
  assert.equal(strip.children.length, 96);
  assert.ok(strip.children.every(slot => slot.children.length === 1));
  assert.equal(strip.children[1].children[0].textContent, "00:15");
  assert.equal(strip.children[95].children[0].textContent, "23:45");
  assert.equal(strip.classList.contains("is-quarter-hour"), true);
  assert.match(strip.children[1].getAttribute("aria-label"), /00:15–00:30: No data, 0\/15 minutes/);
  assert.match(strip.children[95].getAttribute("aria-label"), /23:45–24:00: No data, 0\/15 minutes/);
  const content = node => [node.textContent, ...node.children.map(content)].join(" ");
  assert.match(content(body), /10:15–10:30 · 7\/15 minutes/);
  assert.doesNotMatch(content(body), /undefined|0\.25/);
});

test("quarter-hour calendar rejects late hourly responses and keeps three coverage counters", async () => {
  let release;
  const calls = [];
  const h = calendarHarness({ calendar: query => {
    calls.push(query.timeframe);
    if (query.timeframe === "ONE_HOUR") return new Promise(resolve => { release = () => resolve(h.response(query)); });
    const response = h.response(query);
    Object.assign(response.days[14], { status: "CALCULATED", candleCount: 3, completeCount: 1, partialCount: 1, insufficientCount: 1 });
    return Promise.resolve(response);
  } });
  const pending = h.calendar.load();
  h.fields.timeframe.value = "FIFTEEN_MINUTES";
  h.fields.timeframe.handlers.change(); await new Promise(setImmediate);
  release(); await pending;
  assert.deepEqual(calls, ["ONE_HOUR", "FIFTEEN_MINUTES"]);
  const cell = h.grid.querySelectorAll().find(node => node.dataset.aggregationDate === "2026-09-15");
  const counters = cell.children.find(node => node.className === "market-aggregation-coverage-counts");
  assert.deepEqual(Array.from(counters.children, node => node.textContent), ["1","1","1"]);
  const content = node => [node.textContent, ...node.children.map(content)].join(" ");
  assert.match(content(h.get("[data-aggregation-coverage-legend]")), /Partial coverage · 50–100%/);
});

test("four-hour details show six intervals and 240-minute coverage", async () => {
  const h = calendarHarness({ day: async () => ({ sourceLoaded: true, status: "CALCULATED",
    intervalCoverage: Array.from({ length: 6 }, (_, i) => ({ hour: i * 4, coverage: "NO_DATA", componentCount: 0 })),
    candles: [{ begin: "2026-09-15T05:00:00.000Z", componentCount: 119, missingMinutes: [],
      open:"12",high:"12",low:"12",close:"12",coverage:"INSUFFICIENT" }] }) });
  h.fields.timeframe.value = "FOUR_HOURS";
  await h.calendar.load();
  const wrapper = h.grid.children[0].children.find(node => node.children.some(child => child.dataset.aggregationDate));
  wrapper.children[1].handlers.click(); await new Promise(setImmediate);
  assert.match(h.get("marketAggregationDetailsTitle").textContent, /H4/);
  const body = h.get("[data-aggregation-details-body]");
  const strip = body.children.find(node => node.className === "market-aggregation-hour-strip");
  assert.equal(strip.children.length, 6);
  assert.ok(strip.children.every(slot => slot.children.length === 1));
  assert.equal(strip.children[5].children[0].textContent, "20:00");
  assert.equal(strip.classList.contains("is-four-hours"), true);
  assert.match(strip.children[5].getAttribute("aria-label"), /20:00–24:00: No data, 0\/240 minutes/);
  const content = node => [node.textContent, ...node.children.map(content)].join(" ");
  assert.match(content(body), /08:00–12:00 · 119\/240 minutes/);
  assert.match(content(body), /Insufficient coverage · <50%. Candle saved/);
});
