    function createMarketAggregationCalendar(root, api) {
      const find = selector => root.querySelector(selector);
      const form = find("#marketAggregationForm");
      const fields = form.elements;
      const grid = find("[data-aggregation-grid]");
      const monthLabel = find("[data-aggregation-month]");
      const selectionLabel = find("[data-aggregation-selection]");
      const message = find("[data-aggregation-message]");
      const refreshStatus = find("[data-aggregation-refresh-status]");
      const previous = find("[data-aggregation-previous]");
      const next = find("[data-aggregation-next]");
      const refresh = find("[data-aggregation-refresh]");
      const clear = find("[data-aggregation-clear]");
      const calculate = find("[data-aggregation-calculate]");
      const dialog = document.getElementById("marketAggregationDetails");
      const detailTitle = document.getElementById("marketAggregationDetailsTitle");
      const detailBody = dialog.querySelector("[data-aggregation-details-body]");
      let month = marketHistorySyncYesterday().slice(0, 7);
      let data = null, selection = null, previewDate = "", activeDate = "";
      let running = false, refreshing = false, requestId = 0, detailRequestId = 0, loadedAt = 0;
      let batchRunning = false;
      const queued = new Set(), localErrors = new Map();
      const element = (tag, className, text) => {
        const node = document.createElement(tag);
        node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
      };
      const icon = name => {
        const node = element("span", "button-icon", name);
        node.setAttribute("aria-hidden", "true");
        return node;
      };
      const query = () => ({ instrumentId: fields.instrumentId.value, timeframe: fields.timeframe.value });
      const isDaily = () => fields.timeframe.value === "ONE_DAY";
      function setMessage(text, warning = false) {
        message.textContent = text;
        message.classList.toggle("market-aggregation-warning", warning);
      }
      const matches = () => data?.month === month && data?.instrumentId === fields.instrumentId.value && data?.timeframe === fields.timeframe.value;
      const earliestDate = () => data?.earliestDate || new Date(Date.parse(marketHistorySyncYesterday()) - 365 * 86400000).toISOString().slice(0, 10);
      function status(day) {
        const savedStatus = ["COMPLETE", "PARTIAL", "INSUFFICIENT"].includes(day.status) ? "CALCULATED" : day.status;
        return MARKET_AGGREGATION_STATUSES[activeDate === day.date ? "LOADING" : queued.has(day.date) ? "QUEUED"
          : localErrors.has(day.date) ? "ERROR" : savedStatus];
      }
      function readSelection() {
        return marketCalendarRangeFromDates(fields.fromDate.value, fields.toDate.value, earliestDate(), marketHistorySyncYesterday());
      }
      function updateControls() {
        let dates = [], error = "";
        try { dates = marketCalendarRangeDates(readSelection()); } catch (reason) { error = reason.message; }
        fields.toDate.setCustomValidity(error);
        selectionLabel.classList.toggle("market-aggregation-warning", Boolean(error));
        for (const field of [fields.fromDate, fields.toDate]) {
          field.min = earliestDate(); field.max = marketHistorySyncYesterday();
        }
        for (const field of Array.from(fields)) field.disabled = running;
        batch.setDisabled(running || refreshing);
        calculate.disabled = running || !dates.length || Boolean(error) || !data;
        clear.disabled = running || !(fields.fromDate.value || fields.toDate.value || fields.fromDate.validity.badInput || fields.toDate.validity.badInput);
        refresh.disabled = refreshing || running;
        previous.disabled = !data || running || month <= earliestDate().slice(0, 7);
        next.disabled = !data || running || month >= data.today.slice(0, 7);
        selectionLabel.textContent = running && !batchRunning ? `${queued.size - Number(queued.has(activeDate))} days queued`
          : error || `${dates.length} ${dates.length === 1 ? "day" : "days"} selected`;
        const preview = selection?.choosingEnd && previewDate ? selectMarketCalendarRange(selection, previewDate) : null;
        for (const cell of grid.querySelectorAll("[data-aggregation-date]")) {
          const date = cell.dataset.aggregationDate;
          const selected = Boolean(selection && date >= selection.start && date <= selection.end);
          cell.setAttribute("aria-pressed", String(selected));
          cell.classList.toggle("is-range-start", date === selection?.start);
          cell.classList.toggle("is-range-end", date === selection?.end);
          cell.classList.toggle("is-range-preview", Boolean(preview && !selected && date >= preview.start && date <= preview.end));
        }
      }
      function syncInputs() {
        fields.fromDate.value = selection?.start || "";
        fields.toDate.value = selection?.end || "";
        fields.toDate.setCustomValidity("");
      }
      function render() {
        const coverageHelp = element("button", "form-label-help");
        coverageHelp.type = "button";
        coverageHelp.setAttribute("aria-label", "About coverage in Charts");
        coverageHelp.dataset.tooltipTrigger = "click";
        coverageHelp.dataset.tooltip = isDaily()
          ? "Only Sufficient coverage candles are used in Charts. Insufficient coverage candles remain stored but are excluded."
          : "Only Complete and Partial coverage candles are used in Charts. Insufficient coverage candles remain stored but are excluded.";
        coverageHelp.append(icon("info"));
        const coverageLabel = element("span", "market-aggregation-legend-label", "Coverage");
        coverageLabel.append(coverageHelp);
        const legend = find("[data-aggregation-coverage-legend]");
        legend.replaceChildren(coverageLabel);
        const entries = isDaily()
          ? [["SUFFICIENT", " · ≥240 min"], ["INSUFFICIENT", " · <240 min"]]
          : [["COMPLETE", ""], ["PARTIAL", " · 50–100%"], ["INSUFFICIENT", " · <50%"]];
        for (const [key, criterion] of entries) {
          const definition = MARKET_AGGREGATION_STATUSES[key];
          const entry = element("span", "");
          const square = element("span", `market-aggregation-coverage-dot is-${definition.className}`);
          square.setAttribute("aria-hidden", "true");
          entry.append(square, element("span", "", definition.label + criterion));
          legend.append(entry);
        }
        monthLabel.textContent = marketHistorySyncMonthFormatter.format(new Date(`${month}-01T12:00:00Z`));
        updateControls();
        grid.style.visibility = matches() ? "" : "hidden";
        grid.inert = !matches();
        if (!matches()) return;
        const content = element("div", "market-history-calendar-grid");
        for (const day of MARKET_HISTORY_SYNC_WEEKDAYS) content.append(element("span", "market-history-calendar-weekday", day));
        const offset = (new Date(`${month}-01T12:00:00Z`).getUTCDay() + 6) % 7;
        const spacer = () => { const node = element("span", ""); node.setAttribute("aria-hidden", "true"); content.append(node); };
        for (let i = 0; i < offset; i++) spacer();
        for (const day of data.days) {
          const definition = status(day);
          const wrapper = element("div", "market-calendar-day-cell");
          const cell = element("button", `market-history-calendar-day is-${definition.className}`);
          cell.type = "button"; cell.disabled = !day.available || running;
          cell.dataset.aggregationDate = day.date;
          cell.setAttribute("aria-label", `${formatMarketHistorySyncDate(day.date)}: ${definition.label}${day.available ? `, ${day.candleCount} calculated candles` : ""}`);
          const date = element("time", "market-history-calendar-day-number"); date.dateTime = day.date;
          const outline = element("span", "market-calendar-date-outline"); outline.setAttribute("aria-hidden", "true");
          date.append(outline, element("span", "market-calendar-date-value", String(Number(day.date.slice(-2)))));
          cell.append(date, icon(definition.icon));
          const hasCurrentResult = definition === MARKET_AGGREGATION_STATUSES.CALCULATED && !day.requiresRecalculation;
          const completeCount = day.completeCount ?? day.candleCount - day.partialCount - day.insufficientCount;
          const coverageCounts = isDaily()
            ? [["SUFFICIENT", day.sufficientCount], ["INSUFFICIENT", day.insufficientCount]]
            : [["COMPLETE", completeCount], ["PARTIAL", day.partialCount], ["INSUFFICIENT", day.insufficientCount]];
          const hasCoverageCounts = day.available && hasCurrentResult
            && coverageCounts.every(([, value]) => Number.isSafeInteger(value) && value >= 0);
          if (day.available && !hasCoverageCounts) {
            cell.append(element("span", "market-calendar-candle-count", String(day.candleCount)));
          }
          if (hasCoverageCounts) {
            const counts = element("span", "market-aggregation-coverage-counts");
            const labels = [];
            for (const [key, count] of coverageCounts) {
              if (isDaily() && count === 0) continue;
              const coverage = MARKET_AGGREGATION_STATUSES[key];
              labels.push(isDaily() ? coverage.label : `${coverage.label}: ${count} ${count === 1 ? "interval" : "intervals"}`);
              const badge = element("span", `market-aggregation-coverage-count is-${coverage.className}`, isDaily() ? "" : String(count));
              badge.setAttribute("aria-hidden", "true");
              counts.append(badge);
            }
            cell.setAttribute("aria-label", `${formatMarketHistorySyncDate(day.date)}: Calculated, ${day.candleCount} candles saved. ${labels.join(". ")}`);
            counts.setAttribute("aria-hidden", "true");
            cell.append(counts);
          }
          if (day.available) {
            const caption = element("span", "market-calendar-candle-caption", hasCurrentResult ? "" : "candles");
            if (hasCurrentResult) {
              caption.classList.add("is-empty");
              caption.setAttribute("aria-hidden", "true");
            }
            cell.append(caption);
          }
          cell.addEventListener("click", () => {
            if (running || !day.available) return;
            selection = selectMarketCalendarRange(selection, day.date); previewDate = "";
            syncInputs(); updateControls();
          });
          for (const event of ["mouseenter", "focus"]) cell.addEventListener(event, () => {
            if (!running && day.available && selection?.choosingEnd) { previewDate = day.date; updateControls(); }
          });
          const info = element("button", "market-calendar-day-info"); info.type = "button";
          info.append(icon("info")); info.disabled = !day.available;
          info.setAttribute("aria-label", `${formatMarketHistorySyncDate(day.date)}: ${definition.label}. Aggregation details`);
          info.setAttribute("aria-haspopup", "dialog"); info.setAttribute("aria-controls", dialog.id);
          info.addEventListener("click", () => { void openDetails(day); });
          wrapper.append(cell, info); content.append(wrapper);
        }
        for (let i = offset + data.days.length; i < 42; i++) spacer();
        grid.replaceChildren(content); updateControls();
      }
      async function load(force = false) {
        if (!force && (refreshing || matches() && Date.now() - loadedAt < 5000)) return;
        const requestedMonth = month, context = query(), id = ++requestId;
        refreshing = true; refresh.classList.add("is-refreshing"); refresh.setAttribute("aria-busy", "true");
        grid.setAttribute("aria-busy", "true"); refreshStatus.textContent = "Refreshing calendar…";
        if (!matches()) render(); else updateControls();
        try {
          const value = await api.calendar({ ...context, month: requestedMonth });
          if (id !== requestId) return;
          if (value?.month !== requestedMonth || value.instrumentId !== context.instrumentId || value.timeframe !== context.timeframe
              || !Array.isArray(value.days) || value.days.some(day => !MARKET_AGGREGATION_STATUSES[day.status]
                || !Number.isSafeInteger(day.candleCount) || day.candleCount < 0)) throw new Error("Aggregation calendar response is invalid.");
          const changed = JSON.stringify(data) !== JSON.stringify(value);
          data = value; loadedAt = Date.now();
          if (message.textContent.startsWith("Calendar could not be refreshed.")) setMessage("");
          if (changed || grid.inert) render();
          refreshStatus.textContent = "Calendar refreshed.";
        } catch (error) {
          if (id === requestId) { setMessage(`Calendar could not be refreshed. ${error.message}`, true); loadedAt = 0; }
        } finally {
          if (id === requestId) {
            refreshing = false; refresh.classList.remove("is-refreshing"); refresh.setAttribute("aria-busy", "false");
            grid.setAttribute("aria-busy", "false"); updateControls();
          }
        }
      }
      async function openDetails(day) {
        const id = ++detailRequestId;
        const fourHours = fields.timeframe.value === "FOUR_HOURS";
        const quarterHour = fields.timeframe.value === "FIFTEEN_MINUTES";
        const fiveMinutes = fields.timeframe.value === "FIVE_MINUTES";
        const daily = isDaily();
        const expectedMinutes = fiveMinutes ? 5 : quarterHour ? 15 : fourHours ? 240 : 60;
        const durationMs = expectedMinutes * 60000;
        detailTitle.textContent = `${formatMarketHistorySyncDate(day.date)} · ${MARKET_AGGREGATION_TIMEFRAME_LABELS[fields.timeframe.value]}`;
        detailBody.replaceChildren(element("p", "", "Reading stored candles…"));
        dialog.showModal(); detailTitle.focus();
        try {
          const value = await api.day({ ...query(), date: day.date });
          if (id !== detailRequestId || !dialog.open) return;
          const text = !value.sourceLoaded ? "The source M1 candles for this day have not been fully loaded."
            : value.stale ? "Source data changed or some nonempty intervals were not saved. Recalculate this day; previous saved candles are shown below."
              : value.status === "PENDING" ? "This day has not been calculated."
                : value.status === "NO_DATA" ? "The loaded source day contains no M1 candles."
                  : value.status === "CALCULATED" ? "Calculation completed. All nonempty candles are saved; coverage is shown below."
                  : value.status === "COMPLETE" ? `Every stored candle contains all ${expectedMinutes} minutes.`
                    : value.status === "PARTIAL" ? "Some calculated candles have partial coverage (50–<100%)."
                      : value.status === "INSUFFICIENT" ? "Candles with less than 50% coverage are saved and marked Insufficient coverage."
                      : "The last calculation failed. Select this day to retry.";
          detailBody.replaceChildren(element("p", value.status === "ERROR" && !value.lastError && !localErrors.get(day.date) ? "market-aggregation-warning" : "", text));
          if (value.lastError || localErrors.get(day.date)) detailBody.append(element("p", "market-aggregation-warning", value.lastError || localErrors.get(day.date)));
          if (["MISMATCH", "MISSING_DAILY", "MISSING_MINUTES"].includes(value.sourceIntegrity?.status)) {
            detailBody.append(element("p", "market-aggregation-warning", "Source data has an integrity warning. See Source Data for details."));
          }
          if (value.calculatedAt) detailBody.append(element("p", "text-body-secondary", "Calculated: " + new Date(value.calculatedAt).toLocaleString("en-GB", { timeZone: "Europe/Moscow" }) + " (Moscow)"));
          const time = stamp => stamp ? new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Moscow", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(stamp)) : "—";
          if (value.intervalCoverage && !value.stale && !daily) {
            detailBody.append(element("h4", "market-aggregation-coverage-title", "Interval coverage · Moscow time"));
            const strip = element("div", "market-aggregation-hour-strip");
            if (fourHours) strip.classList.add("is-four-hours");
            if (quarterHour) strip.classList.add("is-quarter-hour");
            strip.setAttribute("role", "list");
            strip.setAttribute("aria-label", `Coverage of ${1440 / expectedMinutes} calendar intervals`);
            for (const hour of value.intervalCoverage) {
              const definition = MARKET_AGGREGATION_STATUSES[hour.coverage];
              const startMinute = hour.minuteOfDay ?? hour.hour * 60;
              const intervalTime = minute => `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
              const slot = element("div", `market-aggregation-hour-slot is-${definition.className}`);
              slot.setAttribute("role", "listitem");
              slot.setAttribute("aria-label", `${intervalTime(startMinute)}–${intervalTime(startMinute + expectedMinutes)}: ${definition.label}, ${hour.componentCount}/${expectedMinutes} minutes`);
              const square = element("span", "market-aggregation-hour-square", intervalTime(startMinute));
              square.setAttribute("aria-hidden", "true");
              slot.append(square); strip.append(slot);
            }
            detailBody.append(strip);
            const legend = element("div", "market-history-sync-legend market-aggregation-strip-legend");
            for (const key of ["COMPLETE", "PARTIAL", "INSUFFICIENT", "NO_DATA"]) {
              const definition = MARKET_AGGREGATION_STATUSES[key];
              const entry = element("span", "");
              const square = element("span", `market-aggregation-coverage-dot is-${definition.className}`);
              square.setAttribute("aria-hidden", "true");
              entry.append(square, element("span", "", key === "NO_DATA" ? "No M1 data" : definition.label));
              legend.append(entry);
            }
            detailBody.append(legend);
          }
          for (const hour of value.candles) {
            const section = element("section", "market-aggregation-hour");
            const end = new Date(Date.parse(hour.begin) + durationMs).toISOString();
            section.append(element("h4", "", daily ? `${hour.componentCount} M1 candles`
              : `${time(hour.begin)}–${time(end)} · ${hour.componentCount}/${expectedMinutes} minutes`));
            if (daily) {
              const coverage = MARKET_AGGREGATION_STATUSES[hour.coverage];
              section.append(element("p", hour.coverage === "INSUFFICIENT" ? "text-warning-emphasis" : "text-body-secondary",
                `${coverage.label} · ${hour.coverage === "INSUFFICIENT" ? "<" : "≥"}${value.minimumMinutes} M1 candles. Candle saved.`));
            } else if (hour.coverage === "INSUFFICIENT") section.append(element("p", "text-warning-emphasis", "Insufficient coverage · <50%. Candle saved."));
            section.append(element("p", "", `Open ${hour.open} · High ${hour.high} · Low ${hour.low} · Close ${hour.close}`));
            if (!value.stale) {
              section.append(element("p", "text-body-secondary", `First: ${time(hour.firstSourceBegin)} · Last: ${time(hour.lastSourceBegin)}`));
              if (!daily && hour.missingMinutes.length) section.append(element("p", "text-warning-emphasis", "Minutes without candles: " + hour.missingMinutes.map(time).join(", ")));
            }
            detailBody.append(section);
          }
        } catch (error) { if (id === detailRequestId && dialog.open) detailBody.replaceChildren(element("p", "market-aggregation-warning", error.message)); }
      }
      const batch = createMarketAggregationBatch(root, api, {
        context: () => ({ instrumentId: fields.instrumentId.value,
          instrumentLabel: fields.instrumentId.selectedOptions?.[0]?.textContent || fields.instrumentId.value }),
        onBusy: value => { running = value; batchRunning = value; updateControls(); },
        onStart: commands => {
          setMessage("");
          selection = null; previewDate = ""; syncInputs();
          for (const command of commands) {
            if (command.timeframe === fields.timeframe.value) { queued.add(command.date); localErrors.delete(command.date); }
          }
          render();
        },
        onProgress: event => {
          const visible = event.command.timeframe === fields.timeframe.value;
          activeDate = visible && event.phase === "calculating" ? event.command.date : "";
          if (visible && event.result) {
            queued.delete(event.command.date);
            const day = data?.days.find(day => day.date === event.command.date);
            if (day) Object.assign(day, event.result);
          }
          if (visible && event.error) localErrors.set(event.command.date, event.error.message);
          if (visible) render();
        },
        onFinished: async () => { activeDate = ""; queued.clear(); render(); await load(true); }
      });
      form.addEventListener("submit", async event => {
        event.preventDefault();
        if (running || !form.reportValidity()) return;
        let snapshot;
        try { snapshot = readSelection(); } catch (error) { setMessage(error.message, true); return; }
        if (!snapshot) return;
        const context = query();
        for (const date of marketCalendarRangeDates(snapshot)) { queued.add(date); localErrors.delete(date); }
        running = true; selection = null; previewDate = ""; syncInputs(); render();
        try {
          const result = await calculateMarketAggregationRange({ ...context, selection: snapshot, calculateDay: api.calculateDay,
            onProgress: progress => {
              activeDate = progress.phase === "calculating" ? progress.date : "";
              if (progress.result) {
                queued.delete(progress.date);
                const day = data?.days.find(day => day.date === progress.date);
                if (day) Object.assign(day, progress.result);
              }
              setMessage(progress.phase === "calculating" ? `Calculating ${formatMarketHistorySyncDate(progress.date)}… (${progress.completed}/${progress.total})`
                : `${progress.completed}/${progress.total} days calculated.`);
              render();
            }
          });
          setMessage(`${result.completed} days calculated.`);
        } catch (error) {
          if (error.date) localErrors.set(error.date, error.message);
          const remaining = [...queued];
          if (remaining.length) selection = { start: remaining[0], end: remaining.at(-1), choosingEnd: false };
          syncInputs(); setMessage(`Stopped${error.date ? " on " + formatMarketHistorySyncDate(error.date) : ""}. ${error.message}`, true);
        } finally {
          activeDate = ""; queued.clear(); running = false; render(); await load(true);
        }
      });
      for (const field of [fields.fromDate, fields.toDate]) {
        field.addEventListener("input", () => {
          selection = null; previewDate = "";
          try { selection = readSelection(); } catch { /* Validation is shown beside the selected range. */ }
          updateControls();
        });
        field.addEventListener("change", () => {
          if (selection && field.value.slice(0, 7) !== month) { month = field.value.slice(0, 7); void load(true); }
        });
      }
      function shiftMonth(delta) {
        const date = new Date(`${month}-01T12:00:00Z`); date.setUTCMonth(date.getUTCMonth() + delta);
        month = date.toISOString().slice(0, 7); previewDate = ""; void load(true);
      }
      previous.addEventListener("click", () => shiftMonth(-1)); next.addEventListener("click", () => shiftMonth(1));
      refresh.addEventListener("click", () => {
        if (!refresh.disabled) { localErrors.clear(); void load(true); }
      });
      clear.addEventListener("click", () => { selection = null; previewDate = ""; syncInputs(); updateControls(); });
      grid.addEventListener("mouseleave", () => { previewDate = ""; updateControls(); });
      for (const field of [fields.instrumentId, fields.timeframe]) field.addEventListener("change", () => {
        selection = null; data = null; localErrors.clear(); setMessage(""); syncInputs(); void load(true);
      });
      dialog.addEventListener("close", () => { detailRequestId++; });
      window.addEventListener("hashchange", () => { if (dialog.open) dialog.close(); });
      return { load };
    }

    const marketAggregationCalendar = createMarketAggregationCalendar(document.getElementById("marketAggregationCalendar"), marketAggregationApi);

    function loadMarketAggregationCalendar() { return marketAggregationCalendar.load(); }
