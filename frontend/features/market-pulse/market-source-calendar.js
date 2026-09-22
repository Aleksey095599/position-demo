    const marketCalendarMonth = document.getElementById("marketCalendarMonth");
    const marketCalendarPrevious = document.getElementById("marketCalendarPrevious");
    const marketCalendarNext = document.getElementById("marketCalendarNext");
    const marketCalendarRefresh = document.getElementById("marketCalendarRefresh");
    const marketCalendarClearSelection = document.getElementById("marketCalendarClearSelection");
    const marketCalendarMessage = document.getElementById("marketCalendarMessage");
    const marketCalendarDetail = document.getElementById("marketCalendarDetail");
    const marketCalendarDayTitle = document.getElementById("marketCalendarDayTitle");
    const marketCalendarDaySummary = document.getElementById("marketCalendarDaySummary");
    const marketCalendarDayTimes = document.getElementById("marketCalendarDayTimes");
    const marketCalendarDayError = document.getElementById("marketCalendarDayError");
    const marketCalendarSelection = document.getElementById("marketCalendarSelection");
    const marketHistorySourceTimeframe = document.getElementById("marketHistorySourceTimeframe");
    const marketCalendarFromDate = document.getElementById("marketCalendarFromDate");
    const marketCalendarToDate = document.getElementById("marketCalendarToDate");
    let marketCalendarRangeError = "";
    let marketCalendarRange = null;
    let marketCalendarPreviewDate = "";
    let marketCalendarMonthKey = marketHistorySyncYesterday().slice(0,7);

    let marketCalendarData = null;
    let marketCalendarRequest = 0;
    let marketCalendarPendingKey = "";
    let marketCalendarLoadedAt = 0;

    function marketCalendarEarliestDate() {
      if (marketCalendarData?.earliestDate) return marketCalendarData.earliestDate;
      const today = new Date(Date.parse(marketHistorySyncYesterday()) + 86400000);
      if (marketHistorySourceTimeframe.value === "ONE_DAY") today.setUTCFullYear(today.getUTCFullYear() - 10);
      else today.setUTCDate(today.getUTCDate() - 366);
      return today.toISOString().slice(0,10);
    }

    function marketCalendarShiftMonth(delta) {
      const month = new Date(`${marketCalendarMonthKey}-01T12:00:00Z`);
      month.setUTCMonth(month.getUTCMonth()+delta);
      marketCalendarMonthKey = month.toISOString().slice(0,7);
      marketCalendarPreviewDate = "";
      closeMarketCalendarDay(false);
      void loadMarketSourceCalendar(true);
    }

    function marketCalendarStatus(day) {
      if (marketHistorySyncActiveDate === day.date) return "LOADING";
      return day.status;
    }

    function marketCalendarStatusDefinition(status) {
      return {
        PENDING: {className:"pending",icon:"remove",label:"Not loaded"},
        INTEGRITY_WARNING: {className:"integrity-warning",icon:"warning",label:"Integrity warning"},
        LOADING: {className:"loading",icon:"progress_activity",label:"Loading"},
        COMPLETED: {className:"completed",icon:"check",label:"Loaded"},
        ERROR: {className:"error",icon:"error",label:"Error"},
        UNAVAILABLE: {className:"unavailable",icon:"",label:"Unavailable"}
      }[status];
    }

    function renderMarketSourceCalendar() {
      renderMarketCalendarSelection();
      marketCalendarMonth.textContent = marketHistorySyncMonthFormatter.format(new Date(`${marketCalendarMonthKey}-01T12:00:00Z`));
      const matching = marketCalendarData?.month === marketCalendarMonthKey
        && marketCalendarData?.instrumentId === marketHistorySyncInstrument.value
        && marketCalendarData?.timeframe === marketHistorySourceTimeframe.value;
      const daily = marketHistorySourceTimeframe.value === "ONE_DAY";
      marketCalendarPrevious.disabled = !marketCalendarData || marketCalendarMonthKey <= marketCalendarData.earliestDate.slice(0,7);
      marketCalendarNext.disabled = !marketCalendarData || marketCalendarMonthKey >= marketCalendarData.today.slice(0,7);
      if (!matching) { closeMarketCalendarDay(false); marketHistorySyncCalendar.replaceChildren(); return; }
      const grid = document.createElement("div");
      grid.className = "market-history-calendar-grid";
      for (const weekday of MARKET_HISTORY_SYNC_WEEKDAYS) {
        const label = document.createElement("span");
        label.className = "market-history-calendar-weekday";
        label.textContent = weekday;
        grid.append(label);
      }
      const offset = (new Date(`${marketCalendarMonthKey}-01T12:00:00Z`).getUTCDay()+6)%7;
      for (let i=0;i<offset;i++) {
        const spacer = document.createElement("span"); spacer.setAttribute("aria-hidden","true"); grid.append(spacer);
      }
      for (const day of marketCalendarData.days) {
        const status = marketCalendarStatus(day);
        const definition = marketCalendarStatusDefinition(status);
        const cell = document.createElement("button");
        cell.type = "button";
        cell.className = `market-history-calendar-day is-${definition.className}${daily ? " is-daily" : ""}`;
        cell.dataset.marketHistorySyncDate = day.date;
        cell.disabled = !day.available || marketHistorySyncRunning;
        cell.setAttribute("aria-pressed", "false");
        cell.setAttribute("aria-label",`${formatMarketHistorySyncDate(day.date)}: ${definition.label}${daily ? "" : `, ${day.candleCount} candles stored`}`);
        const date = document.createElement("time");
        date.className = "market-history-calendar-day-number";
        date.dateTime = day.date;
        date.textContent = String(Number(day.date.slice(-2)));
        const icon = document.createElement("span");
        icon.className = "button-icon";
        icon.setAttribute("aria-hidden","true");
        icon.textContent = definition.icon;
        const wrapper = document.createElement("div");
        wrapper.className = "market-calendar-day-cell";
        cell.append(date);
        wrapper.append(cell);
        if (day.available) {
          const info = document.createElement("button");
          info.type = "button";
          info.className = "market-calendar-day-info is-" + definition.className;
          info.dataset.marketCalendarInfoDate = day.date;
          info.setAttribute("aria-label",formatMarketHistorySyncDate(day.date) + ": " + definition.label + ". Day details");
          info.setAttribute("aria-haspopup","dialog");
          info.setAttribute("aria-controls","marketCalendarDetail");
          info.setAttribute("aria-expanded",String(marketCalendarDetailDate === day.date));
          const hint = document.createElement("span");
          hint.className = "market-calendar-info-hint";
          hint.setAttribute("aria-hidden","true");
          hint.textContent = "Day details";
          info.append(hint);
          info.append(icon);
          info.addEventListener("click", () => openMarketCalendarDay(day.date));
          wrapper.append(info);
        }
        if (!daily) {
          const count = document.createElement("span");
          count.className = "market-calendar-candle-count";
          count.textContent = day.available || day.candleCount ? day.candleCount.toLocaleString("en-GB") : "—";
          const caption = document.createElement("span");
          caption.className = "market-calendar-candle-caption";
          caption.textContent = "candles";
          cell.append(count,caption);
        }
        cell.addEventListener("click", () => {
          if (marketHistorySyncRunning || !day.available) return;
          marketCalendarRange = selectMarketCalendarRange(marketCalendarRange, day.date);
          syncMarketCalendarDateInputs();
          closeMarketCalendarDay(false);
          marketCalendarPreviewDate = "";
          marketHistorySyncProgress.hidden = true;
          renderMarketCalendarSelection();
        });
        cell.addEventListener("mouseenter", () => previewMarketCalendarDate(day));
        cell.addEventListener("focus", () => previewMarketCalendarDate(day));
        grid.append(wrapper);
      }
      grid.addEventListener("mouseleave", () => { marketCalendarPreviewDate = ""; renderMarketCalendarSelection(); });
      marketHistorySyncCalendar.replaceChildren(grid);
      renderMarketCalendarSelection();
      renderMarketCalendarDay();
    }

    async function loadMarketSourceCalendar(force = false) {
      const month = marketCalendarMonthKey;
      const instrumentId = marketHistorySyncInstrument.value;
      const timeframe = marketHistorySourceTimeframe.value;
      const key = `${instrumentId}:${timeframe}:${month}`;
      if (marketCalendarPendingKey === key && !force) return;
      if (!force && marketCalendarData?.month === month && marketCalendarData?.instrumentId === instrumentId
          && marketCalendarData?.timeframe === timeframe && Date.now()-marketCalendarLoadedAt < 5000) return;
      const request = ++marketCalendarRequest;
      marketCalendarPendingKey = key;
      marketCalendarMessage.textContent = "Reading saved candles…";
      renderMarketSourceCalendar();
      try {
        const value = await demoApiRequest(`/api/v1/market-pulse/historical-candles/calendar?${new URLSearchParams({instrumentId,timeframe,month})}`);
        if (request !== marketCalendarRequest) return;
        if (!value || value.month !== month || value.instrumentId !== instrumentId || value.timeframe !== timeframe || !Array.isArray(value.days)
            || value.days.some(day => !marketCalendarStatusDefinition(day.status) || !Number.isSafeInteger(day.candleCount) || day.candleCount < 0)) {
          throw new Error("Source candle calendar response is invalid.");
        }
        marketCalendarData = value;
        marketCalendarLoadedAt = Date.now();
        marketCalendarMessage.textContent = "";
        renderMarketSourceCalendar();
      } catch (error) {
        if (request !== marketCalendarRequest) return;
        marketCalendarLoadedAt = 0;
        marketCalendarMessage.textContent = `Calendar could not be refreshed. ${error.message}`;
      } finally {
        if (request === marketCalendarRequest) marketCalendarPendingKey = "";
      }
    }

    function previewMarketCalendarDate(day) {
      if (marketHistorySyncRunning || !marketCalendarRange?.choosingEnd || !day.available) return;
      marketCalendarPreviewDate = day.date;
      renderMarketCalendarSelection();
    }

    function syncMarketCalendarDateInputs() {
      marketCalendarRangeError = "";
      marketCalendarFromDate.value = marketCalendarRange?.start || "";
      marketCalendarToDate.value = marketCalendarRange?.end || "";
      marketCalendarFromDate.setCustomValidity("");
      marketCalendarToDate.setCustomValidity("");
    }

    function updateMarketCalendarRangeFromInputs() {
      if (marketHistorySyncRunning || marketHistoryLoading) return;
      marketCalendarRange = null;
      marketCalendarRangeError = "";
      marketCalendarPreviewDate = "";
      closeMarketCalendarDay(false);
      marketHistorySyncProgress.hidden = true;
      marketCalendarToDate.setCustomValidity("");
      try {
        marketCalendarRange = marketCalendarRangeFromDates(
          marketCalendarFromDate.value, marketCalendarToDate.value,
          marketCalendarEarliestDate(), marketHistorySyncYesterday()
        );
      } catch (error) {
        marketCalendarRangeError = error.message;
        marketCalendarToDate.setCustomValidity(error.message);
      }
      renderMarketCalendarSelection();
    }

    function revealMarketCalendarInputMonth(event) {
      if (!marketCalendarRange || marketCalendarRangeError) return;
      const month = event.currentTarget.value.slice(0, 7);
      if (month && month !== marketCalendarMonthKey) {
        marketCalendarMonthKey = month;
        void loadMarketSourceCalendar();
      }
    }

    function clearMarketCalendarSelection() {
      if (marketHistorySyncRunning || marketHistoryLoading) return;
      marketCalendarRange = null;
      marketCalendarPreviewDate = "";
      closeMarketCalendarDay(false);
      syncMarketCalendarDateInputs();
      marketHistorySyncProgress.hidden = true;
      renderMarketCalendarSelection();
    }

    function renderMarketCalendarSelection() {
      let dates = [];
      try {
        if (marketCalendarRange) {
          marketCalendarRangeError = "";
          marketCalendarRangeFromDates(marketCalendarRange.start, marketCalendarRange.end,
            marketCalendarEarliestDate(), marketHistorySyncYesterday());
        }
        dates = marketCalendarRangeDates(marketCalendarRange);
      } catch (error) {
        marketCalendarRangeError = error.message;
      }
      for (const input of [marketCalendarFromDate, marketCalendarToDate]) {
        input.min = marketCalendarEarliestDate();
        input.max = marketHistorySyncYesterday();
        input.disabled = marketHistorySyncRunning || marketHistoryLoading;
      }
      marketHistorySyncInstrument.disabled = marketHistorySyncRunning || marketHistoryLoading;
      marketHistorySourceTimeframe.disabled = marketHistorySyncRunning || marketHistoryLoading;
      marketCalendarClearSelection.disabled = marketHistorySyncRunning || marketHistoryLoading
        || !(marketCalendarRange || marketCalendarFromDate.value || marketCalendarToDate.value
          || marketCalendarFromDate.validity?.badInput || marketCalendarToDate.validity?.badInput);
      marketHistorySyncButton.disabled = !dates.length || Boolean(marketCalendarRangeError) || marketHistorySyncRunning || marketHistoryLoading;
      marketCalendarSelection.textContent = marketCalendarRangeError || `${dates.length} ${dates.length === 1 ? "day" : "days"} selected`;
      const preview = marketCalendarRange?.choosingEnd && marketCalendarPreviewDate
        ? selectMarketCalendarRange(marketCalendarRange, marketCalendarPreviewDate) : null;
      for (const cell of marketHistorySyncCalendar.querySelectorAll("[data-market-history-sync-date]")) {
        const date = cell.dataset.marketHistorySyncDate;
        const selected = Boolean(marketCalendarRange && date >= marketCalendarRange.start && date <= marketCalendarRange.end);
        cell.setAttribute("aria-pressed", String(selected));
        cell.classList.toggle("is-range-start", date === marketCalendarRange?.start);
        cell.classList.toggle("is-range-end", date === marketCalendarRange?.end);
        cell.classList.toggle("is-range-preview", Boolean(preview && date >= preview.start && date <= preview.end && !selected));
      }
    }

    async function loadSelectedMarketCalendarRange(event) {
      event.preventDefault();
      if (!marketCalendarRange || marketCalendarRangeError || marketHistorySyncRunning || marketHistoryLoading
          || !marketHistorySyncForm.reportValidity()) return;
      const selection = { ...marketCalendarRange };
      const instrumentId = marketHistorySyncInstrument.value;
      const timeframe = marketHistorySourceTimeframe.value;
      marketCalendarRange.choosingEnd = false;
      marketCalendarPreviewDate = "";
      setMarketHistorySyncRunning(true);
      marketHistorySyncProgress.hidden = false;
      marketHistorySyncSummary.textContent = "Checking the selected dates…";
      marketHistorySyncCount.textContent = "";
      marketHistorySyncProgressBar.style.width = "0%";
      marketHistorySyncProgressBar.setAttribute("aria-valuenow", "0");
      marketHistorySyncProgressBar.setAttribute("aria-valuemax", String(marketCalendarRangeDates(selection).length));
      try {
        const result = await loadMarketCalendarRange({
          instrumentId,
          timeframe,
          selection,
          readMonth: command => demoApiRequest("/api/v1/market-pulse/historical-candles/calendar?" + new URLSearchParams(command)),
          loadDay: command => demoApiRequest("/api/v1/market-pulse/historical-candles/calendar/load-day", {
            method: "POST", body: JSON.stringify(command)
          }),
          onProgress: async progress => {
            marketHistorySyncActiveDate = progress.phase === "loading" ? progress.date : "";
            marketHistorySyncCount.textContent = progress.completed + " / " + progress.total + " days";
            marketHistorySyncProgressBar.style.width = (100 * progress.completed / progress.total) + "%";
            marketHistorySyncProgressBar.setAttribute("aria-valuenow", String(progress.completed));
            marketHistorySyncSummary.textContent = progress.phase === "loading"
              ? "Loading " + formatMarketHistorySyncDate(progress.date) + "…"
              : progress.completed + " of " + progress.total + " selected days loaded; " + progress.skipped + " already loaded.";
            renderMarketSourceCalendar();
            if (progress.phase === "completed") await loadMarketSourceCalendar(true);
          }
        });
        marketHistorySyncSummary.textContent = result.loaded
          ? result.loaded + " days loaded; " + result.skipped + " already loaded."
          : "All selected days were already loaded.";
        setMarketStatus("Selected source candle days are loaded.", "success");
        if (result.mismatches || result.missingData) {
          const verificationMessage = `${result.mismatches} Open/Close mismatches; ${result.missingData} missing-data errors. See the calendar and candle load log.`;
          marketHistorySyncSummary.textContent += " " + verificationMessage;
          setMarketStatus(verificationMessage,"warning");
        }
      } catch (error) {
        marketHistorySyncSummary.textContent = error.date
          ? "Stopped on " + formatMarketHistorySyncDate(error.date) + ". " + error.message
          : error.message;
        setMarketStatus(error.message, "error");
      } finally {
        marketHistorySyncActiveDate = "";
        await loadMarketSourceCalendar(true);
        setMarketHistorySyncRunning(false);
      }
    }

    for (const input of [marketCalendarFromDate, marketCalendarToDate]) {
      input.addEventListener("input", updateMarketCalendarRangeFromInputs);
      input.addEventListener("change", event => {
        updateMarketCalendarRangeFromInputs();
        revealMarketCalendarInputMonth(event);
      });
    }
    marketCalendarPrevious.addEventListener("click",() => marketCalendarShiftMonth(-1));
    marketCalendarNext.addEventListener("click",() => marketCalendarShiftMonth(1));
    marketCalendarRefresh.addEventListener("click",() => { void loadMarketSourceCalendar(true); });
    marketCalendarClearSelection.addEventListener("click", clearMarketCalendarSelection);
    marketHistorySyncForm.addEventListener("submit", loadSelectedMarketCalendarRange);
    function changeMarketSourceCalendarContext() {
      marketCalendarData = null;
      closeMarketCalendarDay(false);
      marketCalendarPreviewDate = "";
      marketHistorySyncProgress.hidden = true;
      const earliestMonth = marketCalendarEarliestDate().slice(0,7);
      if (marketCalendarMonthKey < earliestMonth) marketCalendarMonthKey = earliestMonth;
      void loadMarketSourceCalendar(true);
    }
    marketHistorySyncInstrument.addEventListener("change", changeMarketSourceCalendarContext);
    marketHistorySourceTimeframe.addEventListener("change", changeMarketSourceCalendarContext);
