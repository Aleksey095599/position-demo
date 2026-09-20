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

test("provides separate Quote Stream, Charts, and Data Management views", () => {
  assert.match(documentHtml, /id="workspaceMarketPulseToggle"[^>]*data-workspace-routes="market-quote-stream market-charts market-data-management"/);
  assert.match(documentHtml, /href="#market-pulse:quote-stream"[\s\S]*?>finance_mode<\/span>[\s\S]*?>Quote Stream<\/span>/);
  assert.match(documentHtml, /href="#market-pulse:charts"[\s\S]*?>candlestick_chart<\/span>[\s\S]*?>Charts<\/span>/);
  assert.match(documentHtml, /href="#market-pulse:data-management"[\s\S]*?>cloud_sync<\/span>[\s\S]*?>Data Management<\/span>/);
  assert.match(documentHtml, /data-market-panel="quote-stream"/);
  assert.match(documentHtml, /data-market-panel="charts"/);
  assert.match(documentHtml, /data-market-panel="data-management"/);
  assert.doesNotMatch(documentHtml, /id="marketTabs"|data-market-tab=/);
  assert.match(documentHtml, /data-market-panel="data-management"[\s\S]*?id="marketHistorySyncForm"/);
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
    ["#market-pulse:data-management", "data-management"],
    ["#market-pulse:streams", "quote-stream"],
    ["#market-pulse:history", "data-management"]
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
  assert.match(marketPulseSection[1], /"market_source_candles"/);
  assert.match(marketPulseSection[1], /"market_aggregated_candles"/);
  assert.match(marketPulseSection[1], /"market_candle_load_ranges"/);
  assert.ok(demoGenerationSection);
  assert.match(demoGenerationSection[1], /"market_quote_simulation_settings"/);
  assert.doesNotMatch(demoGenerationSection[1], /"market_(?:source|aggregated)_candles"/);
});

test("loads Historical Candles only from an explicit form submission", () => {
  const renderSource = topLevelFunctionSource("renderMarketPage", marketPageScript);
  const loadSource = topLevelFunctionSource("loadMarketHistoryCandles", marketPageScript);

  assert.match(appScript, /marketHistoryForm\.addEventListener\("submit", loadMarketHistoryCandles\)/);
  assert.doesNotMatch(renderSource, /demoApiRequest|fetch\(/);
  assert.match(loadSource, /demoApiRequest\(/);
  assert.equal((loadSource.match(/demoApiRequest\(/g) || []).length, 1);
  assert.match(loadSource, /"\/api\/v1\/market-pulse\/historical-candles\/sync"/);
  assert.match(loadSource, /method: "POST"/);
  assert.match(
    loadSource,
    /const payload = \{\s*instrumentId: marketHistoryInstrument\.value,\s*timeframe: marketHistoryTimeframe\.value,\s*from: new Date\(fromTimestamp\)\.toISOString\(\),\s*till: new Date\(tillTimestamp\)\.toISOString\(\)\s*};/
  );
  assert.match(loadSource, /body: JSON\.stringify\(payload\)/);
  assert.match(loadSource, /marketHistoryMoscowTimestamp\(marketHistoryFrom\.value\)/);
  assert.match(loadSource, /marketHistoryMoscowTimestamp\(marketHistoryTill\.value\)/);
  assert.doesNotMatch(loadSource, /new Date\(marketHistory(?:From|Till)\.value\)/);
  assert.match(loadSource, /Number\(result\?\.storedMinuteCandleCount\)/);
  assert.match(loadSource, /closed one-minute candles stored/);
  assert.doesNotMatch(loadSource, /URLSearchParams|historical-candles\?/);
  assert.doesNotMatch(loadSource, /setInterval|setTimeout/);
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

test("wires one MOEX source to the read and storing Historical Candles paths", () => {
  assert.equal(
    (serverSource.match(/new MoexIssHistoricalMarketDataSource\(/g) || []).length,
    1
  );
  assert.equal(
    (serverSource.match(/new SqliteMarketSourceCandleRepository\(\{ database \}\)/g) || []).length,
    1
  );
  assert.match(serverSource, /new SyncOneMinuteCandlesUseCase\(\{[\s\S]*?historicalMarketDataSource,[\s\S]*?marketSourceCandleRepository/);
  assert.match(serverSource, /new BackfillHistoricalCandleRangeUseCase\(\{[\s\S]*?historicalMarketDataSource,[\s\S]*?marketSourceCandleRepository/);
  assert.match(
    serverSource,
    /method === "POST" && pathname === "\/api\/v1\/market-pulse\/historical-candles\/sync"[\s\S]*?readJsonBody\(request\)[\s\S]*?historicalCandlesApi\.sync\(body\)/
  );
  assert.match(
    serverSource,
    /method === "POST" && pathname === "\/api\/v1\/market-pulse\/historical-candles\/backfill\/step"[\s\S]*?historicalCandlesApi\.backfillStep\(body\)/
  );
  assert.match(
    serverSource,
    /method === "GET" && pathname === "\/api\/v1\/market-pulse\/historical-candles\/backfill\/status"[\s\S]*?historicalCandlesApi\.backfillStatus\(url\.searchParams\)/
  );
  assert.match(
    serverSource,
    /new GetManualHistoricalSourceCandleSyncPlanUseCase\(\{[\s\S]*?marketSourceCandleRepository[\s\S]*?\}\)/
  );
  assert.match(
    serverSource,
    /new SyncNextManualHistoricalSourceCandleDayUseCase\(\{[\s\S]*?getPlanUseCase: getManualHistoricalSourceCandleSyncPlanUseCase,[\s\S]*?backfillRangeUseCase: backfillHistoricalCandleRangeUseCase/
  );
  assert.match(
    serverSource,
    /method === "GET" && pathname === "\/api\/v1\/market-pulse\/historical-candles\/manual-sync\/plan"[\s\S]*?historicalCandlesApi\.manualSyncPlan\(url\.searchParams\)/
  );
  assert.match(
    serverSource,
    /method === "POST" && pathname === "\/api\/v1\/market-pulse\/historical-candles\/manual-sync\/step"[\s\S]*?readJsonBody\(request\)[\s\S]*?historicalCandlesApi\.manualSyncStep\(body\)/
  );
});

test("renders remote Candle values without injecting HTML", () => {
  const loadSource = topLevelFunctionSource("loadMarketHistoryCandles", marketPageScript);
  const normalizeSource = topLevelFunctionSource("normalizedMarketHistoryCandles", marketPageScript);

  assert.match(normalizeSource, /Number\(candle\?\.open\)/);
  assert.match(normalizeSource, /every\(Number\.isFinite\)/);
  assert.doesNotMatch(`${loadSource}\n${normalizeSource}`, /innerHTML|outerHTML|insertAdjacentHTML|eval\(/);
  assert.match(loadSource, /marketHistorySummary\.textContent/);
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
