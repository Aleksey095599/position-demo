    const MARKET_CHART_LABELS = Object.freeze({ ONE_MINUTE: "M1", FIVE_MINUTES: "M5", FIFTEEN_MINUTES: "M15", ONE_HOUR: "H1", FOUR_HOURS: "H4", ONE_DAY: "D1" });

    function createMarketChartApi(request) {
      return {
        catalog: () => request("/api/v1/market-pulse/charts/catalog"),
        candles: (query, signal) => request("/api/v1/market-pulse/charts/candles?" + new URLSearchParams(query), { signal })
      };
    }

    function marketChartPoints(candles, timeframe) {
      let previous = -Infinity;
      return candles.map(candle => {
        const stamp = Date.parse(candle.begin);
        const point = { time: timeframe === "ONE_DAY" ? new Date(stamp + 10800000).toISOString().slice(0, 10) : Math.floor(stamp / 1000),
          open: Number(candle.open), high: Number(candle.high), low: Number(candle.low), close: Number(candle.close) };
        if (!Number.isFinite(stamp) || stamp <= previous || ![point.open, point.high, point.low, point.close].every(Number.isFinite)
          || point.low > Math.min(point.open, point.close) || point.high < Math.max(point.open, point.close)) {
          throw new Error("Stored chart candles are invalid or out of order.");
        }
        previous = stamp;
        return point;
      });
    }

    function restoreMarketChartSelection(catalog, saved) {
      const source = catalog.sources.find(item => item.id === saved?.source) || catalog.sources[0];
      const instrument = source?.instruments.find(item => item.id === saved?.instrumentId) || source?.instruments[0];
      if (!instrument) throw new Error("No chart instruments are configured.");
      return { source: source.id, instrumentId: instrument.id,
        timeframe: instrument.timeframes.includes(saved?.timeframe) ? saved.timeframe : instrument.timeframes.includes("ONE_HOUR") ? "ONE_HOUR" : instrument.timeframes[0] };
    }
