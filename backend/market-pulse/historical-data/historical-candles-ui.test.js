"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const {
  readFrontendSources
} = require("../../test-support/frontend-source");

const ROOT = path.resolve(__dirname, "..", "..", "..");
const { documentHtml, appScript } = readFrontendSources(ROOT);
const serverSource = fs.readFileSync(path.join(ROOT, "server.js"), "utf8");
const marketPageScript = fs.readFileSync(
  path.join(ROOT, "frontend", "features", "market-pulse", "market.page.js"),
  "utf8"
);

function topLevelFunctionSource(name, source = appScript) {
  const asyncMarker = `async function ${name}(`;
  const marker = source.includes(asyncMarker)
    ? asyncMarker
    : `function ${name}(`;
  const start = source.indexOf(marker);
  assert.notEqual(start, -1, `Expected function ${name}.`);
  const remainingSource = source.slice(start + marker.length);
  const nextFunction = /\n    (?:async )?function [A-Za-z_$][\w$]*\s*\(/.exec(remainingSource);
  const end = nextFunction
    ? start + marker.length + nextFunction.index
    : source.length;

  return source.slice(start, end);
}

test("groups Source Data and Candle Aggregation under Data Management", () => {
  assert.match(documentHtml, /id="workspaceMarketPulseToggle"[^>]*data-workspace-routes="market-quote-stream market-charts market-source-data market-candle-aggregation"/);
  assert.match(documentHtml, /href="#market-pulse:quote-stream"[\s\S]*?>finance_mode<\/span>[\s\S]*?>Quote Stream<\/span>/);
  assert.match(documentHtml, /href="#market-pulse:charts"[\s\S]*?>candlestick_chart<\/span>[\s\S]*?>Charts<\/span>/);
  assert.match(documentHtml, /id="workspaceMarketDataToggle"[\s\S]*?aria-controls="workspaceMarketDataGroup"[\s\S]*?>Data Management<\/span>/);
  assert.match(documentHtml, /id="workspaceMarketDataGroup"[^>]*role="menu"[\s\S]*?href="#market-pulse:source-data"[\s\S]*?>Source Data<\/span>[\s\S]*?href="#market-pulse:candle-aggregation"[\s\S]*?>Candle Aggregation<\/span>/);
  assert.match(documentHtml, /data-market-panel="quote-stream"/);
  assert.match(documentHtml, /data-market-panel="charts"/);
  assert.match(documentHtml, /data-market-panel="source-data"/);
  assert.match(documentHtml, /data-market-panel="candle-aggregation"/);
  assert.doesNotMatch(documentHtml, /data-market-panel="data-management"|data-workspace-route="market-data-management"/);
  assert.doesNotMatch(documentHtml, /id="marketTabs"|data-market-tab=/);
  assert.match(documentHtml, /data-market-panel="source-data"[\s\S]*?>MOEX ISS<\/a>[\s\S]*?>Historical Data<\/button>[\s\S]*?>Current Day<\/button>[\s\S]*?id="marketHistorySyncForm"/);
  assert.equal((documentHtml.match(/id="marketHistorySyncForm"/g) || []).length, 1);
  assert.match(documentHtml, /data-market-panel="charts"[\s\S]*?id="marketHistoryChart"/);
  assert.match(documentHtml, /id="marketHistoryChart"/);
  assert.match(documentHtml, /<option value="FIVE_MINUTES">5 minutes<\/option>/);
  assert.match(documentHtml, /<option value="FIFTEEN_MINUTES">15 minutes<\/option>/);
  assert.match(documentHtml, /From \(Moscow time\)/);
  assert.match(documentHtml, /Till \(Moscow time\)/);
});

test("routes each Market Pulse section and keeps the previous bookmarks compatible", () => {
  const context = {
    location: { hash: "#market-pulse" },
    currencySettingsRouteStateFromLocation: () => ({ matches: false })
  };

  vm.runInNewContext(`
    ${topLevelFunctionSource("activeMarketKind")}
    ${topLevelFunctionSource("isMarketRoute")}
  `, context);

  for (const [route, expectedKind] of [
    ["#market-pulse", "quote-stream"],
    ["#market-pulse:quote-stream", "quote-stream"],
    ["#market-pulse:charts", "charts"],
    ["#market-pulse:source-data", "source-data"],
    ["#market-pulse:candle-aggregation", "candle-aggregation"],
    ["#market-pulse:data-management", "source-data"],
    ["#market-pulse:streams", "quote-stream"],
    ["#market-pulse:history", "source-data"],
    ["#market:history", "source-data"],
    ["#market:data-management", "source-data"]
  ]) {
    context.location.hash = route;
    assert.equal(context.isMarketRoute(), true, route);
    assert.equal(context.activeMarketKind(), expectedKind, route);
  }
});

test("places Market Pulse Candle storage in a dedicated Database section", () => {
  const marketPulseSection = /id: "market-pulse",[\s\S]*?tables: \[([\s\S]*?)\][\s\S]*?\n      }/.exec(appScript);
  const demoGenerationSection = /id: "demo-generation",[\s\S]*?tables: \[([\s\S]*?)\][\s\S]*?\n      }/.exec(appScript);

  assert.ok(marketPulseSection);
  assert.match(marketPulseSection[0], /label: "Market Pulse"/);
  assert.match(marketPulseSection[0], /icon: "monitoring"/);
  assert.match(marketPulseSection[1], /"moex_iss_minute_candles"/);
  assert.match(marketPulseSection[1], /"moex_iss_aggregated_candles"/);
  assert.match(marketPulseSection[1], /"moex_iss_minute_candle_load_result"/);
  assert.match(marketPulseSection[1], /"moex_iss_day_candles"/);
  assert.match(marketPulseSection[1], /"moex_iss_day_candle_load_result"/);
  assert.doesNotMatch(marketPulseSection[1], /moex_iss_daily_/);
  assert.ok(demoGenerationSection);
  assert.match(demoGenerationSection[1], /"market_quote_simulation_settings"/);
  assert.doesNotMatch(demoGenerationSection[1], /"market_(?:source|aggregated)_candles"/);
});

test("interprets Historical data form values in Moscow time", () => {
  const partsSource = topLevelFunctionSource(
    "marketHistoryMoscowParts",
    marketPageScript
  );
  const timestampSource = topLevelFunctionSource(
    "marketHistoryMoscowTimestamp",
    marketPageScript
  );
  const context = { result: Number.NaN };

  vm.runInNewContext(`
    const marketHistoryInputFormatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Moscow",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23"
    });
    ${partsSource}
    ${timestampSource}
    result = marketHistoryMoscowTimestamp("2026-09-15T10:00");
  `, context);

  assert.equal(
    new Date(context.result).toISOString(),
    "2026-09-15T07:00:00.000Z"
  );
});

test("uses a local licensed Candlestick chart build with attribution", () => {
  assert.match(
    documentHtml,
    /\.\/frontend\/vendor\/lightweight-charts\/lightweight-charts\.standalone\.production\.js/
  );
  assert.doesNotMatch(documentHtml, /<script[^>]+https?:\/\//);
  assert.match(documentHtml, /Charting by[\s\S]*?https:\/\/www\.tradingview\.com\//);
  assert.match(documentHtml, /rel="noopener noreferrer"/);
  assert.match(appScript, /attributionLogo: true/);
});

test("Charts keeps its fields but cannot load source candles", () => {
  assert.match(documentHtml, /id="marketHistoryLoadButton"[^>]*disabled/);
  assert.match(documentHtml, /id="marketHistoryFrom"/);
  assert.match(documentHtml, /id="marketHistoryTill"/);
  const handler = topLevelFunctionSource("loadMarketHistoryCandles", marketPageScript);
  const context = {marketHistorySummary:{textContent:""},demoApiRequest(){assert.fail("Charts must not request data");}};
  vm.runInNewContext(handler,context);
  let prevented = false;
  context.loadMarketHistoryCandles({preventDefault(){prevented=true;}});
  assert.equal(prevented,true);
  assert.match(context.marketHistorySummary.textContent,/Data Management/);
  assert.doesNotMatch(handler,/demoApiRequest|fetch\(/);
  assert.doesNotMatch(documentHtml,/Unconfirmed/);
});

test("only calendar source loading is connected to the server", () => {
  assert.equal((serverSource.match(/new MoexIssHistoricalMarketDataSource\(/g) || []).length,1);
  assert.match(serverSource,/new LoadSourceCandleDayUseCase/);
  assert.doesNotMatch(serverSource,/SyncOneMinuteCandlesUseCase|GetHistoricalCandlesUseCase|SyncNextManualHistoricalSourceCandleDayUseCase|BackfillHistoricalCandlesUseCase/);
  assert.doesNotMatch(serverSource,/historicalCandlesApi\.(load|sync|backfillStep|backfillStatus|manualSyncPlan|manualSyncStep)\(/);
});


test("Source Data and Candle Aggregation navigation read their own local calendars", () => {
  let kind="charts",calendarReads=0,chartRenders=0,aggregationReads=0;
  const context={
    activeMarketKind:()=>kind,
    updateMarketVisibility(){},renderMarketCcyOptionRows(){},renderMarketPairOptionRows(){},renderMarketQuoteState(){},
    initializeMarketHistoryPeriod(){},ensureMarketHistoryChart(){chartRenders++;},
    loadMarketSourceCalendar(){calendarReads++;},window:{requestAnimationFrame(callback){callback();}},
    loadMarketAggregationCalendar(){aggregationReads++;},
    demoApiRequest(){assert.fail("Navigation must not load source candles");}
  };
  vm.runInNewContext(topLevelFunctionSource("renderMarketPage",marketPageScript),context);
  context.renderMarketPage();assert.equal(chartRenders,1);assert.equal(calendarReads,0);
  kind="source-data";context.renderMarketPage();assert.equal(calendarReads,1);
  kind="candle-aggregation";context.renderMarketPage();
  assert.equal(calendarReads,1);assert.equal(chartRenders,1);
  assert.equal(aggregationReads,1);
});
