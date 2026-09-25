    const marketAggregationApi = Object.freeze({
      batchPlan: query => demoApiRequest("/api/v1/market-pulse/candle-aggregation/batch-plan?" + new URLSearchParams(query)),
      calendar: query => demoApiRequest("/api/v1/market-pulse/candle-aggregation/calendar?" + new URLSearchParams(query)),
      day: query => demoApiRequest("/api/v1/market-pulse/candle-aggregation/day?" + new URLSearchParams(query)),
      calculateDay: command => demoApiRequest("/api/v1/market-pulse/candle-aggregation/calculate-day", {
        method: "POST", body: JSON.stringify(command)
      })
    });
