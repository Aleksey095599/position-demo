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
  assert.match(html, /<option value="ONE_DAY">1 day<\/option>/);
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
    marketHistorySyncForm:element("form"),marketHistorySyncInstrument:element("instrument"),MARKET_HISTORY_SYNC_WEEKDAYS:["MON","TUE","WED","THU","FRI","SAT","SUN"],
    marketHistorySyncMonthFormatter:{format:date=>date.toISOString().slice(0,7)},formatMarketHistorySyncDate:date=>date,
    marketHistoryTimeFormatter:{format:date=>date.toISOString()}
  });
  vm.runInContext(script,context);
  vm.runInContext(fs.readFileSync(path.join(root,"frontend/features/market-pulse/market-source-calendar.js"),"utf8"),context);
  vm.runInContext(fs.readFileSync(path.join(root,"frontend/features/market-pulse/market-calendar-day-details.js"),"utf8"),context);
  return {context,element};
}
function calendarResponse(timeframe, instrument=instrumentId) {
  return {instrumentId:instrument,timeframe,month:"2026-09",today:"2026-09-20",throughDate:"2026-09-19",
    earliestDate:timeframe==="ONE_DAY"?"2016-09-20":"2025-09-19",
    days:[{date:"2026-09-15",available:true,status:"COMPLETED",completedAt:"2026-09-20T12:00:00Z",candleCount:timeframe==="ONE_DAY"?1:597}]};
}
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
  element("calendar").querySelectorAll().find(node=>node.dataset.marketCalendarInfoDate).handlers.click();
  assert.match(element("marketCalendarDaySummary").textContent,/no daily candle, although minute candles exist/);
});
