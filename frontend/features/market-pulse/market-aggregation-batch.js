    const MARKET_AGGREGATION_TIMEFRAME_LABELS = Object.freeze({
      FIVE_MINUTES: "M5", FIFTEEN_MINUTES: "M15", ONE_HOUR: "H1", FOUR_HOURS: "H4", ONE_DAY: "D1"
    });

    async function runMarketAggregationBatch({ commands, calculateDay, shouldStop, onProgress }) {
      let completed = 0;
      for (const command of commands) {
        if (shouldStop()) break;
        await onProgress({ command, completed, total: commands.length, phase: "calculating" });
        try {
          const result = await calculateDay(command);
          if (result?.instrumentId !== command.instrumentId || result?.timeframe !== command.timeframe || result?.date !== command.date
              || !["CALCULATED", "NO_DATA"].includes(result.status) || !Number.isSafeInteger(result.candleCount) || result.candleCount < 0) {
            throw new Error("Candle aggregation response is invalid.");
          }
          completed++;
          await onProgress({ command, result, completed, total: commands.length, phase: "completed" });
        } catch (error) {
          error.command = command;
          error.completed = completed;
          throw error;
        }
      }
      return { completed, total: commands.length, stopped: completed < commands.length };
    }

    function createMarketAggregationBatch(root, api, { context, onBusy, onStart, onProgress, onFinished }) {
      const find = selector => root.querySelector(selector);
      const launch = find("[data-aggregation-batch]");
      const panel = find("[data-aggregation-batch-progress]");
      const status = find("[data-aggregation-batch-status]");
      const progress = find("[data-aggregation-batch-meter]");
      const stop = find("[data-aggregation-batch-stop]");
      const dialog = find("[data-aggregation-batch-dialog]");
      const summary = find("[data-aggregation-batch-summary]");
      const sourceContext = find("[data-aggregation-batch-context]");
      const pendingSummary = find("[data-aggregation-batch-pending]");
      const start = find("[data-aggregation-batch-start]");
      const cancel = find("[data-aggregation-batch-cancel]");
      let plan = null, busy = false, executing = false, stopRequested = false, externalBusy = false;
      const updateLaunch = () => { launch.disabled = busy || externalBusy; };
      function release() { busy = false; onBusy(false); updateLaunch(); }
      launch.addEventListener("click", async () => {
        if (busy || externalBusy) return;
        busy = true; plan = null; onBusy(true); updateLaunch();
        panel.hidden = false; progress.hidden = true; stop.hidden = true;
        panel.classList.remove("is-warning");
        status.textContent = "Checking days with loaded M1 candles…";
        try {
          const selected = context();
          const value = await api.batchPlan({ instrumentId: selected.instrumentId });
          const keys = Object.keys(MARKET_AGGREGATION_TIMEFRAME_LABELS);
          if (value?.instrumentId !== selected.instrumentId || value.source !== "MOEX_ISS"
              || !Array.isArray(value.commands) || value.calculationCount !== value.commands.length
              || ![value.eligibleDayCount, value.pendingDayCount, value.upToDateCount].every(n => Number.isSafeInteger(n) && n >= 0)
              || value.commands.some(c => c.instrumentId !== selected.instrumentId || !keys.includes(c.timeframe) || !/^\d{4}-\d{2}-\d{2}$/.test(c.date))
              || new Set(value.commands.map(c => `${c.timeframe}:${c.date}`)).size !== value.commands.length) {
            throw new Error("Batch calculation plan is invalid.");
          }
          if (!value.commands.length) {
            status.textContent = value.eligibleDayCount ? "All days with loaded M1 candles are up to date for all timeframes." : "No days with completed, nonempty M1 data are available.";
            release(); return;
          }
          plan = value;
          sourceContext.textContent = `${selected.instrumentLabel} · MOEX ISS`;
          summary.textContent = `M1 candles are available for ${value.eligibleDayCount} ${value.eligibleDayCount === 1 ? "day" : "days"} between ${value.fromDate} and ${value.throughDate}.`;
          pendingSummary.textContent = `${value.pendingDayCount} ${value.pendingDayCount === 1 ? "day requires" : "days require"} calculation or an update.`;
          status.textContent = "Ready to calculate. Confirm the batch to start.";
          dialog.showModal(); cancel.focus();
        } catch (error) {
          panel.classList.add("is-warning");
          status.textContent = `Could not prepare calculations. ${error.message}`;
          release();
        }
      });
      cancel.addEventListener("click", () => dialog.close());
      dialog.addEventListener("close", () => {
        if (!executing && busy) { plan = null; status.textContent = "Calculation cancelled."; release(); }
        launch.focus();
      });
      start.addEventListener("click", async () => {
        if (!plan || executing) return;
        const snapshot = plan;
        executing = true; stopRequested = false; dialog.close();
        progress.hidden = false; progress.value = 0; progress.max = snapshot.calculationCount;
        stop.hidden = false; stop.disabled = false;
        onStart(snapshot.commands);
        try {
          const result = await runMarketAggregationBatch({ commands: snapshot.commands, calculateDay: api.calculateDay,
            shouldStop: () => stopRequested,
            onProgress: event => {
              progress.value = event.completed;
              status.textContent = `${event.completed}/${event.total} calculations completed · ${formatMarketHistorySyncDate(event.command.date)} · `
                + MARKET_AGGREGATION_TIMEFRAME_LABELS[event.command.timeframe]
                + (stopRequested ? " · Stopping after the current calculation…" : "");
              onProgress(event);
            } });
          status.textContent = `${result.stopped ? "Stopped" : "Completed"}: ${result.completed}/${result.total} calculations. `
            + (result.stopped ? "Run again to calculate the remaining results." : `${snapshot.upToDateCount} already up to date.`);
        } catch (error) {
          panel.classList.add("is-warning");
          status.textContent = `Stopped after ${error.completed || 0}/${snapshot.calculationCount} calculations`
            + (error.command ? ` · ${error.command.date} · ${MARKET_AGGREGATION_TIMEFRAME_LABELS[error.command.timeframe]}` : "")
            + `. ${error.message} Run again to retry remaining results.`;
          if (error.command) onProgress({ command: error.command, error, phase: "failed" });
        } finally {
          executing = false; plan = null; stop.hidden = true;
          release(); await onFinished();
        }
      });
      stop.addEventListener("click", () => {
        stopRequested = true; stop.disabled = true;
        status.textContent += " · Stopping after the current calculation…";
      });
      window.addEventListener("beforeunload", event => {
        if (executing) { event.preventDefault(); event.returnValue = ""; }
      });
      return { setDisabled(value) { externalBusy = value; updateLaunch(); } };
    }
