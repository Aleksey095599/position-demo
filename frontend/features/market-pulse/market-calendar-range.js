    function selectMarketCalendarRange(selection, date) {
      if (!selection?.choosingEnd) {
        return { start: date, end: date, anchor: date, choosingEnd: true };
      }
      return {
        start: date < selection.anchor ? date : selection.anchor,
        end: date > selection.anchor ? date : selection.anchor,
        anchor: selection.anchor,
        choosingEnd: false
      };
    }

    function marketCalendarRangeDates(selection) {
      if (!selection?.start || !selection?.end) return [];
      const parse = value => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;
        const time = Date.parse(`${value}T00:00:00Z`);
        return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? time : NaN;
      };
      const start = parse(selection.start);
      const end = parse(selection.end);
      const count = (end - start) / 86400000 + 1;
      if (!Number.isInteger(count) || count < 1 || count > 366) {
        throw new Error("Select a valid range of up to 366 calendar days.");
      }
      return Array.from({ length: count }, (_, index) => new Date(start + index * 86400000).toISOString().slice(0, 10));
    }

    function marketCalendarRangeFromDates(start, end, earliestDate, latestDate) {
      if (!start || !end) return null;
      const selection = { start, end, anchor: start, choosingEnd: false };
      marketCalendarRangeDates(selection);
      if ((earliestDate && start < earliestDate) || (latestDate && end > latestDate)) {
        throw new Error("Select only completed Moscow days within the available calendar window.");
      }
      return selection;
    }

    async function loadMarketCalendarRange({ instrumentId, timeframe = "ONE_MINUTE", selection, readMonth, loadDay, onProgress }) {
      const dates = marketCalendarRangeDates(selection);
      if (!dates.length) throw new Error("Select dates in the calendar first.");
      const days = new Map();
      for (const month of new Set(dates.map(date => date.slice(0, 7)))) {
        const result = await readMonth({ instrumentId, timeframe, month });
        if (result?.instrumentId !== instrumentId || result?.timeframe !== timeframe || result?.month !== month || !Array.isArray(result.days)) {
          throw new Error("Source candle calendar response is invalid.");
        }
        for (const day of result.days) days.set(day.date, day);
      }
      // Validate the whole selection before making any source request.
      if (dates.some(date => !days.get(date)?.available)) {
        throw new Error("Select only completed Moscow days within the available calendar window.");
      }
      // Сохранённые минуты тоже проверяем: дневная загрузка могла завершиться ошибкой.
      const pending = dates.filter(date => timeframe === "ONE_MINUTE" || !days.get(date).completedAt
        || ["ERROR","INTEGRITY_WARNING"].includes(days.get(date).status));
      let completed = dates.length - pending.length;
      let skipped = completed;
      let mismatches = 0;
      let notChecked = 0;
      let missingData = 0;
      await onProgress({ phase: "ready", completed, total: dates.length, skipped, date: "" });
      for (const date of pending) {
        await onProgress({ phase: "loading", completed, total: dates.length, skipped, date });
        try {
          const result = await loadDay({ instrumentId, timeframe, date });
          if (result?.skipped) skipped += 1;
          if (result?.verification?.status === "MISMATCH") mismatches += 1;
          if (result?.verification?.status === "NOT_CHECKED") notChecked += 1;
          if (["MISSING_DAILY","MISSING_MINUTES"].includes(result?.verification?.status)) missingData += 1;
        } catch (error) {
          error.date = date;
          throw error;
        }
        completed += 1;
        await onProgress({ phase: "completed", completed, total: dates.length, skipped, date });
      }
      return { total: dates.length, loaded: dates.length-skipped, skipped, mismatches, notChecked, missingData };
    }
