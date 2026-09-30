    const marketDataTabs = Array.from(document.querySelectorAll("[data-market-data-tab]"));
    const marketDataPanels = Array.from(document.querySelectorAll("[data-market-data-panel]"));

    function selectMarketDataTab(period) {
      if (!marketDataTabs.some(tab => tab.dataset.marketDataTab === period)) return;

      marketDataTabs.forEach(tab => {
        const selected = tab.dataset.marketDataTab === period;
        tab.classList.toggle("active", selected);
        tab.setAttribute("aria-selected", String(selected));
        tab.tabIndex = selected ? 0 : -1;
      });
      marketDataPanels.forEach(panel => {
        panel.hidden = panel.dataset.marketDataPanel !== period;
      });
      syncMarketCurrentDayPolling();
    }

    function handleMarketDataTabKeydown(event) {
      const index = marketDataTabs.indexOf(event.currentTarget);
      let nextIndex;

      switch (event.key) {
        case "ArrowRight": nextIndex = (index + 1) % marketDataTabs.length; break;
        case "ArrowLeft": nextIndex = (index - 1 + marketDataTabs.length) % marketDataTabs.length; break;
        case "Home": nextIndex = 0; break;
        case "End": nextIndex = marketDataTabs.length - 1; break;
        default: return;
      }

      event.preventDefault();
      const nextTab = marketDataTabs[nextIndex];
      selectMarketDataTab(nextTab.dataset.marketDataTab);
      nextTab.focus();
    }

    marketDataTabs.forEach(tab => {
      tab.addEventListener("click", () => selectMarketDataTab(tab.dataset.marketDataTab));
      tab.addEventListener("keydown", handleMarketDataTabKeydown);
    });

    function renderMarketCurrentDay(snapshot = null) {
      const grid = document.getElementById("marketCurrentDayGrid");
      const date = document.getElementById("marketCurrentDayDate");
      if (!grid || !date) return;
      const now = snapshot?.date ? new Date(snapshot.date + "T12:00:00+03:00") : new Date();
      date.dateTime = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Moscow",
        year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
      document.getElementById("marketCurrentDayNumber").textContent = String(Number(date.dateTime.slice(-2)));
      document.getElementById("marketCurrentDayMonth").textContent = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Europe/Moscow", month: "long", year: "numeric" }).format(now);
      if (grid.childElementCount) {
        if (snapshot) renderMarketCurrentDayState(snapshot);
        return;
      }

      const pad = value => String(value).padStart(2, "0");
      const makeLabel = (text, role) => {
        const label = document.createElement("span");
        label.className = "market-current-day-axis";
        label.setAttribute("role", role);
        label.textContent = text;
        return label;
      };
      const fragment = document.createDocumentFragment();
      const header = document.createElement("div");
      header.className = "market-current-day-row market-current-day-minutes";
      header.setAttribute("role", "row");
      header.append(makeLabel("Hour", "columnheader"));
      for (let minute = 0; minute < 60; minute++) {
        header.append(makeLabel(String(minute), "columnheader"));
      }
      fragment.append(header);
      for (let hour = 0; hour < 24; hour++) {
        const row = document.createElement("div");
        row.className = "market-current-day-row";
        row.setAttribute("role", "row");
        row.append(makeLabel(pad(hour) + ":00", "rowheader"));
        for (let minute = 0; minute < 60; minute++) {
          const cell = document.createElement("span");
          const label = pad(hour) + ":" + pad(minute) + " · Not loaded";
          cell.className = "market-current-minute is-not-loaded";
          cell.setAttribute("role", "cell");
          cell.setAttribute("aria-label", label);
          row.append(cell);
        }
        fragment.append(row);
      }
      grid.replaceChildren(fragment);
      if (snapshot) renderMarketCurrentDayState(snapshot);
    }


    let marketCurrentDayTimer = null;
    let marketCurrentDayRequest = false;
    let marketCurrentDayCommand = false;
    let marketCurrentDayRequestVersion = 0;
    let marketCurrentDaySnapshot = null;
    const marketCurrentDayStart = document.getElementById("marketCurrentDayStart");
    const marketCurrentDayStop = document.getElementById("marketCurrentDayStop");

    function marketCurrentDayVisible() {
      return !document.hidden && !document.getElementById("marketPage")?.hidden
        && !document.getElementById("marketCurrentDayPanel")?.hidden
        && location.hash === "#market-pulse:source-data";
    }
    function marketCurrentDayTime(value) {
      return value ? new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Moscow",
        hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(value)) : "—";
    }
    function renderMarketCurrentDayState(snapshot) {
      marketCurrentDaySnapshot = snapshot;
      const start = Date.parse(snapshot.date + "T00:00:00+03:00");
      const candles = snapshot.candles || [];
      const loaded = new Set(candles.map(candle => Math.floor((Date.parse(candle.begin) - start) / 60000)));
      const checked = (snapshot.checkedRanges || []).map(range => [Date.parse(range.from), Date.parse(range.till)]);
      const error = snapshot.errorRange && [Date.parse(snapshot.errorRange.from), Date.parse(snapshot.errorRange.till)];
      document.querySelectorAll("#marketCurrentDayGrid [role=cell]").forEach((cell, index) => {
        const begin = start + index * 60000;
        const status = loaded.has(index) ? "loaded" : error && begin >= error[0] && begin + 60000 <= error[1] ? "error"
          : checked.some(([from, till]) => begin >= from && begin < till) ? "no-data" : "not-loaded";
        cell.className = "market-current-minute is-" + status;
        const label = { loaded: "Loaded", error: "Error", "no-data": "No data", "not-loaded": "Not loaded" }[status];
        cell.setAttribute("aria-label", String(Math.floor(index / 60)).padStart(2, "0") + ":" + String(index % 60).padStart(2, "0") + " · " + label);
      });
      document.getElementById("marketCurrentDayCount").textContent = String(candles.length);
      document.getElementById("marketCurrentDayLatest").textContent = marketCurrentDayTime(candles.at(-1)?.begin);
      document.getElementById("marketCurrentDayLastCheck").textContent = marketCurrentDayTime(snapshot.lastSuccessAt);
      document.getElementById("marketCurrentDayNextCheck").textContent = marketCurrentDayTime(snapshot.nextRunAt);
      document.getElementById("marketCurrentDaySpinner").hidden = !snapshot.inFlight;
      document.getElementById("marketCurrentDayProcessState").textContent = snapshot.inFlight ? (snapshot.running ? "Loading…" : "Stopping…")
        : snapshot.running ? "Running" : "Stopped";
      marketCurrentDayStart.disabled = marketCurrentDayCommand || snapshot.running || snapshot.inFlight;
      marketCurrentDayStop.disabled = marketCurrentDayCommand || !snapshot.running;
      document.getElementById("marketCurrentDayInstrument").disabled = snapshot.running || snapshot.inFlight;
      const notice = document.getElementById("marketCurrentDayNotice");
      notice.classList.toggle("is-error", Boolean(snapshot.lastError));
      notice.textContent = snapshot.lastError
        ? "Loading failed. Saved candles are retained." + (snapshot.running ? " The process will retry automatically." : " Start loading to retry.")
        : candles.length ? "The latest candle may be updated. Minutes beyond the latest available candle are waiting for source data."
        : snapshot.lastSuccessAt ? "The source returned no candles. Waiting for available data; the day is not marked complete."
        : "Start loading to receive today's available minute candles.";
      document.getElementById("marketCurrentDayError").hidden = !snapshot.lastError;
      document.getElementById("marketCurrentDayErrorText").textContent = snapshot.lastError
        ? "Last attempt: " + marketCurrentDayTime(snapshot.lastAttemptAt) + " (Moscow)\n" + snapshot.lastError : "";
      const finalization = document.getElementById("marketCurrentDayFinalization");
      const pending = snapshot.finalization?.pending || [];
      const completed = snapshot.finalization?.lastCompleted;
      finalization.hidden = !pending.length && !completed;
      finalization.classList.toggle("is-error", Boolean(snapshot.finalization?.enabled && pending[0]?.lastError));
      if (pending.length && !snapshot.finalization.enabled) finalization.textContent = "Day-end reload is paused in Settings. Pending: " + pending.map(job => job.date).join(", ");
      else if (pending.length) finalization.textContent = pending[0].lastError
        ? "Day-end reload for " + pending[0].date + " failed. It will retry while loading is running."
        : "Day-end reload and recalculation pending: " + pending.map(job => job.date).join(", ");
      else if (completed) finalization.textContent = "Reloaded and recalculated: " + completed.date;
    }
    async function refreshMarketCurrentDay() {
      if (marketCurrentDayRequest || marketCurrentDayCommand || !marketCurrentDayVisible()) return;
      clearTimeout(marketCurrentDayTimer);
      marketCurrentDayRequest = true;
      const version = marketCurrentDayRequestVersion;
      try {
        const snapshot = await demoApiRequest("/api/v1/market-pulse/current-day/status");
        if (version === marketCurrentDayRequestVersion) renderMarketCurrentDay(snapshot);
      } catch (error) {
        if (version === marketCurrentDayRequestVersion) {
          const notice = document.getElementById("marketCurrentDayNotice");
          notice.classList.add("is-error");
          notice.textContent = "Unable to read loading status. " + error.message;
        }
      } finally {
        marketCurrentDayRequest = false;
        if (marketCurrentDayVisible()) marketCurrentDayTimer = setTimeout(refreshMarketCurrentDay, 3000);
      }
    }
    function syncMarketCurrentDayPolling() {
      clearTimeout(marketCurrentDayTimer);
      if (marketCurrentDayVisible()) { renderMarketCurrentDay(); void refreshMarketCurrentDay(); }
    }
    async function commandMarketCurrentDay(action) {
      if (marketCurrentDayCommand) return;
      marketCurrentDayCommand = true;
      marketCurrentDayRequestVersion++;
      marketCurrentDayStart.disabled = true;
      marketCurrentDayStop.disabled = true;
      try {
        const snapshot = await demoApiRequest("/api/v1/market-pulse/current-day/" + action, {
          method: "POST", body: JSON.stringify(action === "start" ? { instrumentId: document.getElementById("marketCurrentDayInstrument").value } : {})
        });
        renderMarketCurrentDay(snapshot);
      } catch (error) {
        const notice = document.getElementById("marketCurrentDayNotice");
        notice.classList.add("is-error"); notice.textContent = error.message;
      } finally {
        marketCurrentDayCommand = false;
        if (marketCurrentDaySnapshot) {
          marketCurrentDayStart.disabled = marketCurrentDaySnapshot.running || marketCurrentDaySnapshot.inFlight;
          marketCurrentDayStop.disabled = !marketCurrentDaySnapshot.running;
        } else { marketCurrentDayStart.disabled = false; marketCurrentDayStop.disabled = true; }
        void refreshMarketCurrentDay();
      }
    }
    marketCurrentDayStart.addEventListener("click", () => void commandMarketCurrentDay("start"));
    marketCurrentDayStop.addEventListener("click", () => void commandMarketCurrentDay("stop"));
    document.addEventListener("visibilitychange", syncMarketCurrentDayPolling);
    window.addEventListener("hashchange", () => requestAnimationFrame(syncMarketCurrentDayPolling));
