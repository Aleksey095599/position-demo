    const MARKET_AGGREGATION_STATUSES = Object.freeze({
      PENDING: { className: "pending", icon: "remove", label: "Not calculated" },
      CALCULATED: { className: "completed", icon: "check", label: "Calculated" },
      COMPLETE: { className: "completed", icon: "check", label: "Complete coverage" },
      PARTIAL: { className: "partial", icon: "donut_large", label: "Partial coverage" },
      INSUFFICIENT: { className: "insufficient", icon: "filter_alt_off", label: "Insufficient coverage" },
      NO_DATA: { className: "no-data", icon: "block", label: "No data" },
      ERROR: { className: "error", icon: "priority_high", label: "Error" },
      UNAVAILABLE: { className: "unavailable", icon: "", label: "Unavailable" },
      QUEUED: { className: "queued", icon: "schedule", label: "Queued" },
      LOADING: { className: "loading", icon: "progress_activity", label: "Calculating" }
    });

    async function calculateMarketAggregationRange({ selection, instrumentId, timeframe, calculateDay, onProgress }) {
      const dates = marketCalendarRangeDates(selection);
      if (!dates.length) throw new Error("Select dates first.");
      let completed = 0;
      for (const date of dates) {
        await onProgress({ date, completed, total: dates.length, phase: "calculating" });
        try {
          const result = await calculateDay({ instrumentId, timeframe, date });
          if (result?.date !== date || result?.instrumentId !== instrumentId || result?.timeframe !== timeframe
              || !["CALCULATED", "COMPLETE", "PARTIAL", "INSUFFICIENT", "NO_DATA"].includes(result.status)
              || !Number.isSafeInteger(result.candleCount) || result.candleCount < 0) {
            throw new Error("Candle aggregation response is invalid.");
          }
          completed++;
          await onProgress({ date, completed, total: dates.length, phase: "completed", result });
        } catch (error) {
          error.date = date;
          throw error;
        }
      }
      return { completed };
    }
