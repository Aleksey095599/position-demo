    const marketAggregationApi = Object.freeze({
      calendar: query => demoApiRequest("/api/v1/market-pulse/candle-aggregation/calendar?" + new URLSearchParams(query)),
      day: query => demoApiRequest("/api/v1/market-pulse/candle-aggregation/day?" + new URLSearchParams(query)),
      calculateDay: command => demoApiRequest("/api/v1/market-pulse/candle-aggregation/calculate-day", {
        method: "POST", body: JSON.stringify(command)
      })
    });
