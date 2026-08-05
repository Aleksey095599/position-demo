"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { MarketPulseSimulator } = require("./market-pulse-simulator");

function simulatorAt(timestampRef, overrides = {}) {
  return new MarketPulseSimulator({
    loadConfigurations: () => [{
      pairCode: "EUR_USD",
      currencyPair: "EUR/USD",
      defaultQuoteDecimals: 4,
      bidMin: 1.1220,
      spread: 0.0002,
      bidMax: 1.1250,
      oneWayDurationSeconds: 60,
      fluctuationSpreads: 3,
      ...overrides
    }],
    now: () => timestampRef.value,
    random: () => 0.5
  });
}

test("moves from Min Bid to Max Bid and back within the configured cycle", () => {
  const timestamp = { value: 100_000 };
  const simulator = simulatorAt(timestamp);

  assert.equal(simulator.start().quotes[0].bid, 1.1220);

  timestamp.value += 60_000;
  assert.equal(simulator.refresh().quotes[0].bid, 1.1250);

  timestamp.value += 60_000;
  assert.equal(simulator.refresh().quotes[0].bid, 1.1220);

  simulator.dispose();
});

test("keeps smooth fluctuations bounded around the linear path", () => {
  const timestamp = { value: 100_000 };
  const simulator = simulatorAt(timestamp);
  simulator.start();

  timestamp.value += 20_000;
  const quote = simulator.refresh().quotes[0];
  const linearBid = 1.1230;

  assert.notEqual(quote.bid, linearBid);
  assert.ok(Math.abs(quote.bid - linearBid) <= 0.0006);
  assert.ok(quote.bid >= 1.1220 && quote.bid <= 1.1250);
  assert.equal(Number((quote.offer - quote.bid).toFixed(4)), 0.0002);

  simulator.dispose();
});

test("supports a zero-fluctuation deterministic linear path", () => {
  const timestamp = { value: 100_000 };
  const simulator = simulatorAt(timestamp, { fluctuationSpreads: 0 });
  simulator.start();

  timestamp.value += 30_000;
  assert.equal(simulator.refresh().quotes[0].bid, 1.1235);

  simulator.dispose();
});
