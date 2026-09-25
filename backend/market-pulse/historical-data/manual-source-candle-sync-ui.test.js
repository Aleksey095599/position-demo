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

test("manual date ranges share calendar bounds and include both endpoints", () => {
  const range = model.marketCalendarRangeFromDates("2026-08-31", "2026-09-02", "2025-09-20", "2026-09-19");
  assert.deepEqual(plain(marketCalendarRangeDates(range)), ["2026-08-31", "2026-09-01", "2026-09-02"]);
  assert.equal(range.choosingEnd, false);
  assert.equal(model.marketCalendarRangeFromDates("2026-09-15", "", "", "2026-09-19"), null);
  for (const [start, end] of [
    ["2026-09-17", "2026-09-15"], ["2026-02-30", "2026-03-02"],
    ["2026-09-19", "2026-09-20"], ["2025-09-19", "2025-09-20"],
    ["2025-09-20", "2026-09-21"]
  ]) {
    assert.throws(() => model.marketCalendarRangeFromDates(start, end, "2025-09-20", "2026-09-19"));
  }
});

test("manual inputs update calendar selection and clearing a date prevents stale loads", () => {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, {
      value: "", hidden: false, handlers: {},
      addEventListener(type, handler) { this.handlers[type] = handler; },
      setCustomValidity(message) { this.validationMessage = message; },
      querySelectorAll() { return []; }
    });
    return elements.get(id);
  };
  const context = vm.createContext({
    Date, closeMarketCalendarDay() {},
    document: { getElementById: element },
    marketHistorySyncYesterday: () => "2026-09-19",
    marketHistorySyncRunning: false,
    marketHistorySyncActiveDate: "",
    marketHistoryLoading: false,
    marketHistorySyncButton: element("load"),
    marketHistorySyncCalendar: element("calendar"),
    marketHistorySyncProgress: element("progress"),
    marketHistorySyncForm: element("form"),
    marketHistorySyncInstrument: element("instrument")
  });
  vm.runInContext(script, context);
  vm.runInContext(fs.readFileSync(path.join(root, "frontend/features/market-pulse/market-source-calendar.js"), "utf8"), context);
  const from = element("marketCalendarFromDate");
  const to = element("marketCalendarToDate");
  from.value = "2026-09-15";
  from.handlers.input();
  assert.equal(element("load").disabled, true);
  to.value = "2026-09-17";
  to.handlers.input();
  assert.equal(element("marketCalendarSelection").textContent, "3 days selected");
  assert.equal(element("load").disabled, false);
  to.value = "2026-09-14";
  to.handlers.input();
  assert.equal(element("load").disabled, true);
  assert.ok(to.validationMessage);
  to.value = "";
  to.handlers.input();
  assert.equal(element("load").disabled, true);
  assert.equal(vm.runInContext("marketCalendarRange", context), null);
  vm.runInContext('marketCalendarRange = selectMarketCalendarRange(null, "2026-09-16"); syncMarketCalendarDateInputs(); renderMarketCalendarSelection();', context);
  assert.equal(from.value, "2026-09-16");
  assert.equal(to.value, "2026-09-16");
  assert.equal(to.validationMessage, "");
  assert.equal(element("marketCalendarSelection").textContent, "1 day selected");
  let monthReads = 0;
  context.loadMarketSourceCalendar = () => { monthReads++; };
  from.value = "2026-08-31";
  from.handlers.change({ currentTarget: from });
  assert.equal(vm.runInContext("marketCalendarMonthKey", context), "2026-08");
  assert.equal(monthReads, 1);
  from.handlers.change({ currentTarget: from });
  assert.equal(monthReads, 1);
  to.handlers.change({ currentTarget: to });
  assert.equal(vm.runInContext("marketCalendarMonthKey", context), "2026-09");
  assert.equal(monthReads, 2);
  context.marketHistorySyncRunning = true;
  context.renderMarketCalendarSelection();
  assert.equal(element("instrument").disabled, true);
  assert.equal(element("marketHistorySourceTimeframe").disabled, true);
  context.marketHistorySyncRunning = false;
  context.renderMarketCalendarSelection();
  assert.equal(element("instrument").disabled, false);
  assert.equal(element("marketHistorySourceTimeframe").disabled, false);
  vm.runInContext('marketCalendarData = { earliestDate: "2026-09-01" }; renderMarketCalendarSelection();', context);
  assert.equal(element("load").disabled, true);
  assert.equal(from.value, "2026-08-31");
  vm.runInContext('marketCalendarData = { earliestDate: "2026-08-01" }; renderMarketCalendarSelection();', context);
  assert.equal(element("load").disabled, false);
});
function monthResult(month, loaded = new Set(), timeframe = "ONE_MINUTE") {
  const start = new Date(`${month}-01T00:00:00Z`);
  const end = new Date(start); end.setUTCMonth(end.getUTCMonth() + 1);
  const days = [];
  for (let t = start.getTime(); t < end.getTime(); t += 86400000) {
    const date = new Date(t).toISOString().slice(0,10);
    days.push({ date, available: date < "2026-09-20", completedAt: loaded.has(date) ? "2026-09-20T12:00:00Z" : null });
  }
  return { instrumentId, timeframe, month, days };
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
test("only missing selected daily candles are loaded in order, including the final date", async () => {
  const requests = []; const reads = []; const loaded = new Set(["2026-08-31","2026-09-01"]); let active = 0;
  const result = await loadMarketCalendarRange({
    instrumentId, timeframe:"ONE_DAY", selection:{start:"2026-08-30",end:"2026-09-02"},
    readMonth: async ({month}) => { reads.push(month); return monthResult(month,loaded,"ONE_DAY"); },
    loadDay: async ({date}) => { assert.equal(active++,0); await Promise.resolve(); requests.push(date); active--; },
    onProgress: async () => {}
  });
  assert.deepEqual(reads,["2026-08","2026-09"]);
  assert.deepEqual(requests,["2026-08-30","2026-09-02"]);
  assert.deepEqual(plain(result),{total:4,loaded:2,skipped:2,mismatches:0,notChecked:0,missingData:0});
});
test("the first failure stops the minute range; retry rechecks saved days", async () => {
  const requests = []; const loaded = new Set(); let fail = true;
  const options = {
    instrumentId, selection:{start:"2026-09-15",end:"2026-09-17"},
    readMonth: async ({month}) => monthResult(month,loaded),
    loadDay: async ({date}) => { requests.push(date); if (fail && date === "2026-09-16") throw new Error("Source unavailable"); const skipped=loaded.has(date); loaded.add(date); return {skipped}; },
    onProgress: async () => {}
  };
  await assert.rejects(loadMarketCalendarRange(options), error => error.date === "2026-09-16");
  assert.deepEqual(requests,["2026-09-15","2026-09-16"]);
  fail = false; requests.length = 0;
  const result = await loadMarketCalendarRange(options);
  assert.deepEqual(requests,["2026-09-15","2026-09-16","2026-09-17"]);
  assert.equal(result.skipped,1);
});
test("fully loaded daily ranges cause no load request", async () => {
  const result = await loadMarketCalendarRange({instrumentId,timeframe:"ONE_DAY",selection:{start:"2026-09-15",end:"2026-09-15"},
    readMonth:async ({month}) => monthResult(month,new Set(["2026-09-15"]),"ONE_DAY"),
    loadDay:async () => assert.fail("Unexpected load"),onProgress:async () => {}});
  assert.equal(result.loaded,0); assert.equal(result.skipped,1);
});

test("minute ranges keep going after mismatches and report skipped comparisons separately", async () => {
  const calls=[];
  const result=await loadMarketCalendarRange({instrumentId,selection:{start:"2026-09-15",end:"2026-09-17"},
    readMonth:async ({month})=>monthResult(month,new Set(["2026-09-15"])),
    loadDay:async ({date})=>{calls.push(date); return {skipped:date==="2026-09-15",verification:{status:date==="2026-09-16"?"NOT_CHECKED":"MISMATCH"}};},
    onProgress:async()=>{}});
  assert.equal(calls.length,3);
  assert.equal(result.mismatches,2);
  assert.equal(result.notChecked,1);
  assert.equal(result.skipped,1);
});
test("unavailable dates and an incomplete plan fail before the first source request", async () => {
  for (const readMonth of [async ({month}) => monthResult(month),async ({month}) => ({instrumentId,timeframe:"ONE_MINUTE",month,days:[]})]) {
    await assert.rejects(loadMarketCalendarRange({instrumentId,selection:{start:"2026-09-19",end:"2026-09-20"},readMonth,
      loadDay:async () => assert.fail("Unexpected load"),onProgress:async () => {}}), /completed Moscow days/);
  }
});
test("Data Management provides calendar selection and a single load action", () => {
  assert.match(html, /id="marketHistorySyncInstrument"/);
  assert.match(html, /id="marketCalendarSelection"/);
  assert.match(html, /Load Candles/);
  assert.doesNotMatch(html, /id="marketHistorySync(?:FromDate|ThroughDate)"|id="marketCalendarLoadDay"/);
  assert.match(html, /<option value="ONE_DAY">D1<\/option>/);
});

test("daily range loading uses daily coverage and preserves the timeframe on every command", async () => {
  const requests = [];
  const result = await loadMarketCalendarRange({instrumentId,timeframe:"ONE_DAY",selection:{start:"2020-09-15",end:"2020-09-17"},
    readMonth:async command => {
      assert.equal(command.timeframe,"ONE_DAY");
      return monthResult(command.month,new Set(["2020-09-16"]),"ONE_DAY");
    },
    loadDay:async command => requests.push(plain(command)),onProgress:async () => {}});
  assert.equal(result.skipped,1);
  assert.deepEqual(requests,[
    {instrumentId,timeframe:"ONE_DAY",date:"2020-09-15"},
    {instrumentId,timeframe:"ONE_DAY",date:"2020-09-17"}
  ]);
  await assert.rejects(loadMarketCalendarRange({instrumentId,timeframe:"ONE_DAY",selection:{start:"2020-09-15",end:"2020-09-15"},
    readMonth:async ({month}) => monthResult(month),loadDay:async () => assert.fail("Unexpected load"),onProgress:async () => {}}),/response is invalid/);
});

function calendarUi() {
  class Element {
    constructor() { this.textContent=""; this.style={}; this.selectedOptions=[{textContent:"CNY/RUB TOM"}]; this.value=""; this.children=[]; this.handlers={}; this.dataset={}; this.className=""; this.attributes={}; this.classList={toggle(){}}; }
    addEventListener(type,handler) { this.handlers[type]=handler; }
    setCustomValidity(message) { this.validationMessage=message; }
    reportValidity() { return true; }
    setAttribute(name,value) { this.attributes[name]=value; }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children=children; }
    querySelectorAll(selector) { const all=this.children.flatMap(child=>[child,...child.querySelectorAll()]); return selector === "[data-market-history-sync-date]" ? all.filter(x=>x.dataset.marketHistorySyncDate) : all; }
    querySelector(selector) { return this.querySelectorAll().find(x=>x.dataset.marketCalendarInfoDate===selector.split('"')[1]); }
    matches() { return Boolean(this.open); }
    showPopover() { this.open=true; }
    hidePopover() { this.open=false; }
    contains() { return false; }
    focus() {}
    getBoundingClientRect() { return {top:100,bottom:130,left:100,right:130,width:360,height:250}; }
  }
  const elements = new Map();
  const element = id => { if(!elements.has(id)) elements.set(id,new Element()); return elements.get(id); };
  element("instrument").value=instrumentId;
  element("marketHistorySourceTimeframe").value="ONE_MINUTE";
  const context = vm.createContext({Date,URLSearchParams,
    document:{getElementById:element,createElement:()=>new Element(),addEventListener(){}},
    window:{addEventListener(){},requestAnimationFrame(callback){callback();},innerWidth:1440,innerHeight:900},
    marketHistorySyncYesterday:()=>"2026-09-19",marketHistorySyncRunning:false,marketHistoryLoading:false,marketHistorySyncActiveDate:"",
    marketHistorySyncButton:element("load"),marketHistorySyncCalendar:element("calendar"),marketHistorySyncProgress:element("progress"),
    marketHistorySyncSummary:element("summary"),marketHistorySyncCount:element("count"),marketHistorySyncProgressBar:element("progressBar"),
    setMarketStatus() {},
    marketHistorySyncForm:element("form"),marketHistorySyncInstrument:element("instrument"),MARKET_HISTORY_SYNC_WEEKDAYS:["MON","TUE","WED","THU","FRI","SAT","SUN"],
    marketHistorySyncMonthFormatter:{format:date=>date.toISOString().slice(0,7)},formatMarketHistorySyncDate:date=>date,
    marketHistoryTimeFormatter:{format:date=>date.toISOString()}
  });
  vm.runInContext(script,context);
  vm.runInContext(fs.readFileSync(path.join(root,"frontend/features/market-pulse/market-source-calendar.js"),"utf8"),context);
  vm.runInContext(fs.readFileSync(path.join(root,"frontend/features/market-pulse/market-calendar-day-details.js"),"utf8"),context);
  context.setMarketHistorySyncRunning = running => {
    context.marketHistorySyncRunning = running;
    context.renderMarketSourceCalendar();
  };
  return {context,element};
}

function calendarLoadUi(timeframe = "ONE_MINUTE") {
  const ui = calendarUi();
  ui.element("marketHistorySourceTimeframe").value = timeframe;
  const response = calendarResponse(timeframe);
  response.days = ["2026-09-15","2026-09-16","2026-09-17"].map(date => ({
    date,available:true,status:"PENDING",completedAt:null,candleCount:0
  }));
  vm.runInContext('marketCalendarRange = {start:"2026-09-15",end:"2026-09-17",choosingEnd:false}; syncMarketCalendarDateInputs();',ui.context);
  return {...ui,response};
}

test("starting a load replaces selection with a queue and only the active day spins", async () => {
  const {context,element,response} = calendarLoadUi();
  const loaded = [];
  context.demoApiRequest = async (url, options) => {
    if (!options) return response;
    const {date} = JSON.parse(options.body);
    loaded.push(date);
    assert.equal(vm.runInContext("marketCalendarRange",context),null);
    assert.equal(element("marketCalendarFromDate").value,"");
    const cells = element("calendar").querySelectorAll("[data-market-history-sync-date]");
    assert.equal(cells.filter(cell => cell.className.includes("is-loading")).length,1);
    for (const cell of cells) {
      assert.equal(cell.attributes["aria-pressed"],"false");
      assert.equal(cell.children[1].textContent,cell.dataset.marketHistorySyncDate === date ? "progress_activity"
        : cell.dataset.marketHistorySyncDate > date ? "schedule" : "check");
    }
    Object.assign(response.days.find(day => day.date === date),{status:"COMPLETED",completedAt:"2026-09-20T12:00:00Z",candleCount:600});
    return {};
  };
  await context.loadMarketSourceCalendar();
  await context.loadSelectedMarketCalendarRange({preventDefault(){}});
  assert.deepEqual(loaded,response.days.map(day => day.date));
  assert.equal(vm.runInContext("marketCalendarQueuedDates.size",context),0);
  assert.equal(vm.runInContext("marketCalendarRange",context),null);
  assert.equal(context.marketHistorySyncRunning,false);
});

test("a failed load restores the failed and remaining dates for retry and clears the queue", async () => {
  const {context,element,response} = calendarLoadUi();
  const requested = [];
  context.demoApiRequest = async (url,options) => {
    if (!options) return response;
    const {date} = JSON.parse(options.body);
    requested.push(date);
    if (date === "2026-09-16") throw new Error("Source unavailable");
    return {};
  };
  await context.loadSelectedMarketCalendarRange({preventDefault(){}});
  assert.deepEqual(requested,["2026-09-15","2026-09-16"]);
  assert.equal(element("marketCalendarFromDate").value,"2026-09-16");
  assert.equal(element("marketCalendarToDate").value,"2026-09-17");
  assert.equal(vm.runInContext("marketCalendarQueuedDates.size",context),0);
  assert.equal(context.marketHistorySyncActiveDate,"");
  assert.equal(element("load").disabled,false);
});

test("planning failure restores the entire selection before any day is loaded", async () => {
  const {context,element} = calendarLoadUi();
  context.demoApiRequest = async () => { throw new Error("Calendar unavailable"); };
  await context.loadSelectedMarketCalendarRange({preventDefault(){}});
  assert.equal(element("marketCalendarFromDate").value,"2026-09-15");
  assert.equal(element("marketCalendarToDate").value,"2026-09-17");
  assert.equal(vm.runInContext("marketCalendarQueuedDates.size",context),0);
  assert.equal(context.marketHistorySyncRunning,false);
});

test("already loaded daily candles leave the queue without source requests", async () => {
  const {context,response} = calendarLoadUi("ONE_DAY");
  response.days.forEach(day => Object.assign(day,{status:"COMPLETED",completedAt:"2026-09-20T12:00:00Z",candleCount:1}));
  context.demoApiRequest = async (url,options) => {
    assert.equal(options,undefined);
    return response;
  };
  await context.loadSelectedMarketCalendarRange({preventDefault(){}});
  assert.equal(vm.runInContext("marketCalendarQueuedDates.size",context),0);
  assert.equal(vm.runInContext("marketCalendarRange",context),null);
});
function calendarResponse(timeframe, instrument=instrumentId) {
  return {instrumentId:instrument,timeframe,month:"2026-09",today:"2026-09-20",throughDate:"2026-09-19",
    earliestDate:timeframe==="ONE_DAY"?"2016-09-20":"2025-09-19",
    days:[{date:"2026-09-15",available:true,status:"COMPLETED",completedAt:"2026-09-20T12:00:00Z",candleCount:timeframe==="ONE_DAY"?1:597}]};
}

test("No data is accepted in both source calendars and is distinct from Not loaded", async () => {
  assert.ok(html.includes('market-history-legend-icon is-no-data" aria-hidden="true">block</span>No data'));
  for (const timeframe of ["ONE_MINUTE", "ONE_DAY"]) {
    const {context,element} = calendarUi();
    element("marketHistorySourceTimeframe").value = timeframe;
    context.demoApiRequest = async () => {
      const response = calendarResponse(timeframe);
      Object.assign(response.days[0], {status:"NO_DATA",candleCount:0});
      return response;
    };
    await context.loadMarketSourceCalendar();
    const nodes = element("calendar").querySelectorAll();
    const cell = nodes.find(node => node.dataset.marketHistorySyncDate);
    assert.match(cell.className, /is-no-data/);
    assert.match(cell.attributes["aria-label"], /No data/);
    assert.equal(cell.children[1].textContent, "block");
    assert.notEqual(context.marketCalendarStatusDefinition("PENDING").icon, cell.children[1].textContent);
    const count = nodes.find(node => node.className === "market-calendar-candle-count");
    if (timeframe === "ONE_MINUTE") assert.equal(count.textContent, "0");
    else assert.equal(count, undefined);
    const info = nodes.find(node => node.dataset.marketCalendarInfoDate);
    assert.match(info.attributes["aria-label"], /No data/);
  }
});

test("a separate info icon opens details without selecting dates or showing a hover hint", async () => {
  const {context,element} = calendarUi();
  context.demoApiRequest = async () => calendarResponse("ONE_MINUTE");
  await context.loadMarketSourceCalendar();
  const nodes = element("calendar").querySelectorAll();
  const cell = nodes.find(node => node.dataset.marketHistorySyncDate);
  const info = nodes.find(node => node.dataset.marketCalendarInfoDate);
  assert.equal(cell.children[1].textContent,"check");
  assert.equal(cell.children[1].className,"button-icon");
  assert.equal(info.children.length,1);
  assert.equal(info.children[0].textContent,"info");
  assert.equal(info.attributes.title,undefined);
  assert.equal(cell.children.includes(info),false);
  info.handlers.click();
  assert.equal(element("marketCalendarDetail").open,true);
  assert.equal(vm.runInContext("marketCalendarRange",context),null);
  cell.handlers.click();
  assert.equal(element("marketCalendarDetail").open,false);
  assert.equal(element("marketCalendarFromDate").value,"2026-09-15");
});

test("unavailable calendar days offer details but cannot be selected", async () => {
  const {context,element} = calendarUi();
  context.demoApiRequest = async () => {
    const response = calendarResponse("ONE_MINUTE");
    response.days = [{date:"2026-09-20",available:false,status:"UNAVAILABLE",candleCount:0}];
    return response;
  };
  element("marketHistorySourceTimeframe").value = "ONE_MINUTE";
  await context.loadMarketSourceCalendar();
  const nodes = element("calendar").querySelectorAll();
  assert.equal(nodes.some(node => node.className === "market-calendar-candle-count"),false);
  assert.equal(nodes.some(node => node.className === "market-calendar-candle-caption"),false);
  assert.doesNotMatch(nodes.find(node => node.dataset.marketHistorySyncDate).attributes["aria-label"],/candles stored/);
  assert.equal(nodes.find(node => node.dataset.marketHistorySyncDate).disabled,true);
  nodes.find(node => node.dataset.marketCalendarInfoDate).handlers.click();
  assert.equal(element("marketCalendarDetail").open,true);
  assert.match(element("marketCalendarDaySummary").textContent,/outside the available historical loading range/);
  assert.equal(vm.runInContext("marketCalendarRange",context),null);
});
test("daily calendar hides counts and timeframe changes invalidate the cached minute calendar", async () => {
  const {context,element} = calendarUi();
  const requests = [];
  context.demoApiRequest = async url => {
    const query = new URL(url,"http://localhost").searchParams;
    requests.push(query.get("timeframe"));
    return calendarResponse(query.get("timeframe"));
  };
  await context.loadMarketSourceCalendar();
  assert.equal(element("calendar").querySelectorAll().filter(node=>node.className==="market-calendar-candle-count").length,1);
  await context.loadMarketSourceCalendar();
  assert.equal(requests.length,1);
  element("marketHistorySourceTimeframe").value="ONE_DAY";
  await context.loadMarketSourceCalendar();
  assert.deepEqual(requests,["ONE_MINUTE","ONE_DAY"]);
  assert.equal(element("calendar").querySelectorAll().filter(node=>node.className==="market-calendar-candle-count").length,0);
  const cell = element("calendar").querySelectorAll().find(node=>node.dataset.marketHistorySyncDate);
  assert.equal(cell.attributes["aria-label"],"2026-09-15: Loaded");
  cell.handlers.click();
  assert.doesNotMatch(element("marketCalendarDaySummary").textContent,/1 candles/);
  assert.equal(element("marketCalendarFromDate").value,"2026-09-15");
  assert.equal(element("marketCalendarToDate").value,"2026-09-15");
});
test("refresh keeps the grid and selection intact and avoids duplicate clicks and unchanged redraws", async () => {
  const {context,element} = calendarUi();
  context.demoApiRequest = async () => calendarResponse("ONE_MINUTE");
  await context.loadMarketSourceCalendar();
  const grid = element("calendar").children[0];
  grid.querySelectorAll("[data-market-history-sync-date]")[0].handlers.click();
  const selection = vm.runInContext("JSON.stringify(marketCalendarRange)",context);
  let release, requests = 0;
  context.demoApiRequest = () => { requests++; return new Promise(resolve => { release = resolve; }); };
  const pending = context.loadMarketSourceCalendar(true);
  assert.equal(element("calendar").children[0],grid);
  assert.equal(element("marketCalendarMessage").textContent,"");
  assert.equal(element("marketCalendarRefresh").disabled,true);
  assert.equal(element("calendar").attributes["aria-busy"],"true");
  element("marketCalendarRefresh").handlers.click();
  assert.equal(requests,1);
  release(calendarResponse("ONE_MINUTE"));
  await pending;
  assert.equal(element("calendar").children[0],grid);
  assert.equal(vm.runInContext("JSON.stringify(marketCalendarRange)",context),selection);
  assert.equal(element("marketCalendarRefresh").disabled,false);
  assert.equal(element("calendar").attributes["aria-busy"],"false");
});

test("refresh applies changed data only after the response arrives", async () => {
  const {context,element} = calendarUi();
  context.demoApiRequest = async () => calendarResponse("ONE_MINUTE");
  await context.loadMarketSourceCalendar();
  const grid = element("calendar").children[0];
  let release;
  context.demoApiRequest = () => new Promise(resolve => { release = resolve; });
  const pending = context.loadMarketSourceCalendar(true);
  assert.equal(element("calendar").children[0],grid);
  const next = calendarResponse("ONE_MINUTE");
  next.days[0].candleCount = 600;
  release(next);
  await pending;
  assert.notEqual(element("calendar").children[0],grid);
  assert.equal(element("calendar").querySelectorAll().find(node => node.className === "market-calendar-candle-count").textContent,"600");
});

test("failed refresh retains the calendar and restores the refresh button", async () => {
  const {context,element} = calendarUi();
  context.demoApiRequest = async () => calendarResponse("ONE_MINUTE");
  await context.loadMarketSourceCalendar();
  const grid = element("calendar").children[0];
  context.demoApiRequest = async () => { throw new Error("Connection unavailable"); };
  await context.loadMarketSourceCalendar(true);
  assert.equal(element("calendar").children[0],grid);
  assert.match(element("marketCalendarMessage").textContent,/Connection unavailable/);
  assert.equal(element("marketCalendarRefresh").disabled,false);
  assert.equal(element("calendar").attributes["aria-busy"],"false");
});

test("an obsolete refresh cannot stop the indicator of the newer request", async () => {
  const {context,element} = calendarUi();
  const releases = [];
  context.demoApiRequest = () => new Promise(resolve => { releases.push(resolve); });
  const old = context.loadMarketSourceCalendar(true);
  element("marketHistorySourceTimeframe").value = "ONE_DAY";
  const current = context.loadMarketSourceCalendar(true);
  releases[0](calendarResponse("ONE_MINUTE"));
  await old;
  assert.equal(element("marketCalendarRefresh").disabled,true);
  assert.equal(element("calendar").attributes["aria-busy"],"true");
  releases[1](calendarResponse("ONE_DAY"));
  await current;
  assert.equal(element("marketCalendarRefresh").disabled,false);
  assert.equal(element("calendar").attributes["aria-busy"],"false");
});

test("month navigation retains calendar space while the new month loads", async () => {
  const {context,element} = calendarUi();
  context.demoApiRequest = async () => calendarResponse("ONE_MINUTE");
  await context.loadMarketSourceCalendar();
  const grid = element("calendar").children[0];
  let release;
  context.demoApiRequest = () => new Promise(resolve => { release = resolve; });
  vm.runInContext('marketCalendarMonthKey="2026-08"',context);
  const pending = context.loadMarketSourceCalendar(true);
  assert.equal(element("calendar").children[0],grid);
  assert.equal(element("calendar").style.visibility,"hidden");
  assert.equal(element("calendar").inert,true);
  assert.equal(element("marketCalendarMonth").textContent,"2026-08");
  const response = calendarResponse("ONE_MINUTE");
  response.month = "2026-08";
  response.days[0].date = "2026-08-15";
  release(response);
  await pending;
  assert.equal(element("calendar").style.visibility,"");
  assert.equal(element("calendar").inert,false);
  assert.equal(element("calendar").querySelectorAll("[data-market-history-sync-date]")[0].dataset.marketHistorySyncDate,"2026-08-15");
});

test("four, five and six week months reserve the same 42 day slots", async () => {
  const {context,element} = calendarUi();
  for (const timeframe of ["ONE_MINUTE","ONE_DAY"]) {
    element("marketHistorySourceTimeframe").value = timeframe;
    for (const month of ["2021-02","2026-09","2026-08"]) {
      vm.runInContext(`marketCalendarMonthKey="${month}"`,context);
      const response = calendarResponse(timeframe);
      response.month = month;
      const [year,number] = month.split("-").map(Number);
      const count = new Date(Date.UTC(year,number,0)).getUTCDate();
      response.days = Array.from({length:count},(_,i) => ({...response.days[0],date:month+"-"+String(i+1).padStart(2,"0")}));
      context.demoApiRequest = async () => response;
      await context.loadMarketSourceCalendar(true);
      assert.equal(element("calendar").children[0].children.length,7+42);
      assert.equal(element("calendar").querySelectorAll("[data-market-history-sync-date]").length,count);
    }
  }
});

test("returning to the cached month restores its grid even if the response is unchanged", async () => {
  const {context,element} = calendarUi();
  context.demoApiRequest = async () => calendarResponse("ONE_MINUTE");
  await context.loadMarketSourceCalendar();
  let reject;
  context.demoApiRequest = () => new Promise((resolve,rejectRequest) => { reject = rejectRequest; });
  vm.runInContext('marketCalendarMonthKey="2026-08"',context);
  const old = context.loadMarketSourceCalendar(true);
  vm.runInContext('marketCalendarMonthKey="2026-09"',context);
  context.demoApiRequest = async () => calendarResponse("ONE_MINUTE");
  await context.loadMarketSourceCalendar(true);
  reject(new Error("Obsolete request failed"));
  await old;
  assert.equal(element("calendar").style.visibility,"");
  assert.equal(element("calendar").inert,false);
  assert.equal(element("marketCalendarMonth").textContent,"2026-09");
  assert.equal(element("marketCalendarMessage").textContent,"");
});

test("late responses cannot replace a different instrument or timeframe calendar", async () => {
  const {context,element} = calendarUi();
  let release;
  context.demoApiRequest = () => new Promise(resolve=>{release=resolve;});
  const old = context.loadMarketSourceCalendar();
  element("marketHistorySourceTimeframe").value="ONE_DAY";
  element("instrument").value="EUR_RUB__TOM";
  context.demoApiRequest=async()=>calendarResponse("ONE_DAY","EUR_RUB__TOM");
  await context.loadMarketSourceCalendar();
  release(calendarResponse("ONE_MINUTE"));
  await old;
  assert.equal(vm.runInContext("marketCalendarData.timeframe",context),"ONE_DAY");
  assert.equal(vm.runInContext("marketCalendarData.instrumentId",context),"EUR_RUB__TOM");
});
test("switching back to minutes clamps an old month and invalidates an out-of-window selection", () => {
  const {context,element} = calendarUi();
  element("marketHistorySourceTimeframe").value="ONE_DAY";
  vm.runInContext('marketCalendarMonthKey="2020-09"; marketCalendarRange={start:"2020-09-15",end:"2020-09-17"}; syncMarketCalendarDateInputs();',context);
  context.renderMarketCalendarSelection();
  assert.equal(element("load").disabled,false);
  let reads=0;
  context.loadMarketSourceCalendar=()=>{reads++;context.renderMarketCalendarSelection();};
  element("marketHistorySourceTimeframe").value="ONE_MINUTE";
  element("marketHistorySourceTimeframe").handlers.change();
  assert.equal(reads,1);
  assert.equal(vm.runInContext("marketCalendarMonthKey",context),"2025-09");
  assert.equal(element("load").disabled,true);
  assert.equal(element("marketCalendarFromDate").value,"2020-09-15");
});

test("completed empty daily errors remain eligible for a manual retry",async()=>{
  let calls=0;
  const result=await loadMarketCalendarRange({instrumentId,timeframe:"ONE_DAY",selection:{start:"2026-09-15",end:"2026-09-15"},
    readMonth:async ({month})=>{
      const value=monthResult(month,new Set(["2026-09-15"]),"ONE_DAY");
      value.days[14].status="ERROR";
      return value;
    },loadDay:async()=>{calls++;return {verification:{status:"MISSING_DAILY"}};},onProgress:async()=>{}});
  assert.equal(calls,1);
  assert.equal(result.missingData,1);
});
test("integrity warnings render in both timeframe calendars and explain mismatched prices",async()=>{
  const {context,element}=calendarUi();
  context.demoApiRequest=async url=>{
    const timeframe=new URL(url,"http://localhost").searchParams.get("timeframe");
    const value=calendarResponse(timeframe);
    value.days[0].status="INTEGRITY_WARNING";
    value.days[0].integrity={status:"MISMATCH",message:"Open/Close mismatch: daily 12 / 13; minutes 12 / 12.9."};
    return value;
  };
  for(const timeframe of ["ONE_MINUTE","ONE_DAY"]) {
    element("marketHistorySourceTimeframe").value=timeframe;
    await context.loadMarketSourceCalendar(true);
    const cell=element("calendar").querySelectorAll().find(node=>node.dataset.marketHistorySyncDate);
    assert.match(cell.className,/is-integrity-warning/);
    assert.equal(cell.children[1].textContent,"compare_arrows");
    assert.equal(cell.children[1].className,"button-icon");
    assert.match(cell.attributes["aria-label"],/Integrity warning/);
    element("calendar").querySelectorAll().find(node=>node.dataset.marketCalendarInfoDate).handlers.click();
    assert.match(element("marketCalendarDaySummary").textContent,/daily 12 \/ 13; minutes 12 \/ 12.9/);
  }
});
test("missing source data renders an error and a specific explanation",async()=>{
  const {context,element}=calendarUi();
  element("marketHistorySourceTimeframe").value="ONE_DAY";
  context.demoApiRequest=async()=>{
    const value=calendarResponse("ONE_DAY");
    Object.assign(value.days[0],{candleCount:0,status:"ERROR",integrity:{status:"MISSING_DAILY",affectedTimeframe:"ONE_DAY",message:"Daily source returned no candle while minute candles exist."}});
    return value;
  };
  await context.loadMarketSourceCalendar();
  const cell=element("calendar").querySelectorAll().find(node=>node.dataset.marketHistorySyncDate);
  assert.match(cell.className,/is-error/);
  assert.equal(cell.children[1].textContent,"priority_high");
  assert.equal(cell.children[1].className,"button-icon");
  element("calendar").querySelectorAll().find(node=>node.dataset.marketCalendarInfoDate).handlers.click();
  assert.match(element("marketCalendarDaySummary").textContent,/no D1 candle, although M1 candles exist/);
});

test("September 21 displays its stored status without a simulated warning in both calendars", async () => {
  const {context,element} = calendarUi();
  for (const timeframe of ["ONE_MINUTE","ONE_DAY"]) {
    element("marketHistorySourceTimeframe").value = timeframe;
    const response = calendarResponse(timeframe);
    response.today = "2026-09-22";
    response.throughDate = "2026-09-21";
    response.days[0].date = "2026-09-21";
    const before = JSON.stringify(response);
    context.demoApiRequest = async (url,options) => {
      assert.equal(options,undefined);
      return response;
    };
    await context.loadMarketSourceCalendar(true);
    const cell = element("calendar").querySelectorAll().find(node => node.dataset.marketHistorySyncDate);
    assert.match(cell.className,/is-completed/);
    assert.equal(cell.children[1].textContent,"check");
    assert.doesNotMatch(cell.attributes["aria-label"],/preview/i);
    element("calendar").querySelectorAll().find(node => node.dataset.marketCalendarInfoDate).handlers.click();
    assert.equal(element("marketCalendarDayStatus").textContent,"Loaded");
    assert.doesNotMatch(element("marketCalendarDaySummary").textContent,/preview|simulated/i);
    assert.equal(JSON.stringify(response),before);
    vm.runInContext('marketCalendarQueuedDates.add("2026-09-21")',context);
    assert.equal(context.marketCalendarStatus(response.days[0]),"QUEUED");
    context.marketHistorySyncActiveDate = "2026-09-21";
    assert.equal(context.marketCalendarStatus(response.days[0]),"LOADING");
    context.marketHistorySyncActiveDate = "";
    vm.runInContext('marketCalendarQueuedDates.clear()',context);
    assert.equal(context.marketCalendarStatus({...response.days[0],date:"2026-10-21"}),"COMPLETED");
    assert.equal(context.marketCalendarStatus({...response.days[0],available:false,status:"UNAVAILABLE"}),"UNAVAILABLE");
  }
});
