    const marketCalendarMonth = document.getElementById("marketCalendarMonth");
    const marketCalendarPrevious = document.getElementById("marketCalendarPrevious");
    const marketCalendarNext = document.getElementById("marketCalendarNext");
    const marketCalendarRefresh = document.getElementById("marketCalendarRefresh");
    const marketCalendarMessage = document.getElementById("marketCalendarMessage");
    const marketCalendarDetail = document.getElementById("marketCalendarDetail");
    const marketCalendarDayTitle = document.getElementById("marketCalendarDayTitle");
    const marketCalendarDaySummary = document.getElementById("marketCalendarDaySummary");
    const marketCalendarDayTimes = document.getElementById("marketCalendarDayTimes");
    const marketCalendarDayError = document.getElementById("marketCalendarDayError");
    const marketCalendarSelection = document.getElementById("marketCalendarSelection");
    const marketCalendarSelectionHelp = document.getElementById("marketCalendarSelectionHelp");
    let marketCalendarRange = null;
    let marketCalendarPreviewDate = "";
    let marketCalendarMonthKey = marketHistorySyncYesterday().slice(0,7);
    let marketCalendarSelectedDate = "";
    let marketCalendarData = null;
    let marketCalendarRequest = 0;
    let marketCalendarPendingKey = "";
    let marketCalendarLoadedAt = 0;

    function marketCalendarShiftMonth(delta) {
      const month = new Date(`${marketCalendarMonthKey}-01T12:00:00Z`);
      month.setUTCMonth(month.getUTCMonth()+delta);
      marketCalendarMonthKey = month.toISOString().slice(0,7);
      marketCalendarPreviewDate = "";
      void loadMarketSourceCalendar(true);
    }

    function marketCalendarStatus(day) {
      if (marketHistorySyncActiveDate === day.date) return "LOADING";
      return day.status;
    }

    function marketCalendarStatusDefinition(status) {
      return {
        PENDING: {className:"pending",icon:"remove",label:"Not loaded"},
        PARTIAL: {className:"partial",icon:"contrast",label:"Unconfirmed"},
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
        && marketCalendarData?.instrumentId === marketHistorySyncInstrument.value;
      marketCalendarDetail.hidden = true;
      marketCalendarPrevious.disabled = !marketCalendarData || marketCalendarMonthKey <= marketCalendarData.earliestDate.slice(0,7);
      marketCalendarNext.disabled = !marketCalendarData || marketCalendarMonthKey >= marketCalendarData.today.slice(0,7);
      if (!matching) { marketHistorySyncCalendar.replaceChildren(); return; }
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
        cell.className = `market-history-calendar-day is-${definition.className}`;
        cell.dataset.marketHistorySyncDate = day.date;
        cell.disabled = !day.available || marketHistorySyncRunning;
        cell.setAttribute("aria-pressed", "false");
        cell.setAttribute("aria-label",`${formatMarketHistorySyncDate(day.date)}: ${definition.label}, ${day.candleCount} candles stored`);
        const date = document.createElement("time");
        date.className = "market-history-calendar-day-number";
        date.dateTime = day.date;
        date.textContent = String(Number(day.date.slice(-2)));
        const icon = document.createElement("span");
        icon.className = "button-icon";
        icon.setAttribute("aria-hidden","true");
        icon.textContent = definition.icon;
        const count = document.createElement("span");
        count.className = "market-calendar-candle-count";
        count.textContent = day.available || day.candleCount ? day.candleCount.toLocaleString("en-GB") : "—";
        const caption = document.createElement("span");
        caption.className = "market-calendar-candle-caption";
        caption.textContent = "candles";
        cell.append(date,icon,count,caption);
        cell.addEventListener("click", () => {
          if (marketHistorySyncRunning || !day.available) return;
          marketCalendarRange = selectMarketCalendarRange(marketCalendarRange, day.date);
          marketCalendarSelectedDate = day.date;
          marketCalendarPreviewDate = "";
          marketHistorySyncProgress.hidden = true;
          renderMarketCalendarSelection();
          renderMarketCalendarDay();
        });
        cell.addEventListener("mouseenter", () => previewMarketCalendarDate(day));
        cell.addEventListener("focus", () => previewMarketCalendarDate(day));
        grid.append(cell);
      }
      grid.addEventListener("mouseleave", () => { marketCalendarPreviewDate = ""; renderMarketCalendarSelection(); });
      marketHistorySyncCalendar.replaceChildren(grid);
      renderMarketCalendarSelection();
      renderMarketCalendarDay();
    }

    function renderMarketCalendarDay() {
      const day = marketCalendarData?.days.find(day => day.date === marketCalendarSelectedDate);
      marketCalendarDetail.hidden = !day;
      if (!day) return;
      const status = marketCalendarStatus(day);
      marketCalendarDayTitle.textContent = formatMarketHistorySyncDate(day.date);
      const description = day.completedAt
        ? day.candleCount ? "All source pages saved." : "Source checked; no candles returned."
        : day.candleCount ? "Full-day coverage has not been confirmed." : "No confirmed full-day load.";
      marketCalendarDaySummary.textContent = `${marketCalendarStatusDefinition(status).label} · ${day.candleCount} candles stored. ${description}`;
      const formatTime = value => value ? marketHistoryTimeFormatter.format(new Date(value)) : "";
      marketCalendarDayTimes.textContent = [
        day.firstCandleAt ? `First / last candle: ${formatTime(day.firstCandleAt)} / ${formatTime(day.lastCandleAt)} (Moscow)` : "",
        day.completedAt ? `Completed: ${formatTime(day.completedAt)}` : "",
        day.lastAttemptAt ? `Last attempt: ${formatTime(day.lastAttemptAt)}` : ""
      ].filter(Boolean).join(" · ");
      marketCalendarDayError.hidden = !day.lastError;
      marketCalendarDayError.textContent = day.lastError ? `Last attempt: ${day.lastError}` : "";
    }

    async function loadMarketSourceCalendar(force = false) {
      const month = marketCalendarMonthKey;
      const instrumentId = marketHistorySyncInstrument.value;
      const key = `${instrumentId}:${month}`;
      if (marketCalendarPendingKey === key && !force) return;
      if (!force && marketCalendarData?.month === month && marketCalendarData?.instrumentId === instrumentId && Date.now()-marketCalendarLoadedAt < 5000) return;
      const request = ++marketCalendarRequest;
      marketCalendarPendingKey = key;
      marketCalendarMessage.textContent = "Reading saved candles…";
      renderMarketSourceCalendar();
      try {
        const value = await demoApiRequest(`/api/v1/market-pulse/historical-candles/calendar?${new URLSearchParams({instrumentId,month})}`);
        if (request !== marketCalendarRequest) return;
        if (!value || value.month !== month || value.instrumentId !== instrumentId || !Array.isArray(value.days)
            || value.days.some(day => !marketCalendarStatusDefinition(day.status) || !Number.isSafeInteger(day.candleCount) || day.candleCount < 0)) {
          throw new Error("Minute candle calendar response is invalid.");
        }
        marketCalendarData = value;
        marketCalendarLoadedAt = Date.now();
        const loaded = value.days.filter(day => day.completedAt).length;
        marketCalendarMessage.textContent = `${loaded} days loaded · ${value.days.reduce((sum,day)=>sum+day.candleCount,0).toLocaleString("en-GB")} candles stored · Moscow time`;
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

    function renderMarketCalendarSelection() {
      const dates = marketCalendarRangeDates(marketCalendarRange);
      marketHistorySyncButton.disabled = !dates.length || marketHistorySyncRunning || marketHistoryLoading;
      marketCalendarSelection.textContent = !dates.length
        ? "Select dates in the calendar."
        : dates.length === 1
          ? formatMarketHistorySyncDate(dates[0]) + " · 1 day"
          : formatMarketHistorySyncDate(dates[0]) + " — " + formatMarketHistorySyncDate(dates.at(-1)) + " · " + dates.length + " days";
      marketCalendarSelectionHelp.textContent = marketCalendarRange?.choosingEnd
        ? "Select an end date, or load this single day. Both dates are included."
        : dates.length ? "Both dates included. Click a date to start a new selection."
          : "Click a start date, then an end date. Both dates are included.";
      const preview = marketCalendarRange?.choosingEnd && marketCalendarPreviewDate
        ? selectMarketCalendarRange(marketCalendarRange, marketCalendarPreviewDate) : null;
      for (const cell of marketHistorySyncCalendar.querySelectorAll("button")) {
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
      if (!marketCalendarRange || marketHistorySyncRunning || marketHistoryLoading) return;
      const selection = { ...marketCalendarRange };
      const instrumentId = marketHistorySyncInstrument.value;
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

    marketCalendarPrevious.addEventListener("click",() => marketCalendarShiftMonth(-1));
    marketCalendarNext.addEventListener("click",() => marketCalendarShiftMonth(1));
    marketCalendarRefresh.addEventListener("click",() => { void loadMarketSourceCalendar(true); });
    marketHistorySyncForm.addEventListener("submit", loadSelectedMarketCalendarRange);
    marketHistorySyncInstrument.addEventListener("change", () => {
      marketCalendarData = null;
      marketCalendarSelectedDate = "";
      marketHistorySyncProgress.hidden = true;
      void loadMarketSourceCalendar(true);
    });
