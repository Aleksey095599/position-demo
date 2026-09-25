    function createMarketChartWorkspace(root, api) {
      const source = root.querySelector("[data-chart-source]");
      const instrument = root.querySelector("[data-chart-instrument]");
      const timeframe = root.querySelector("[data-chart-timeframe]");
      const status = root.querySelector("[data-chart-status]");
      const notice = root.querySelector("[data-chart-notice]");
      const empty = root.querySelector("[data-chart-empty]");
      const canvas = root.querySelector("[data-chart-canvas]");
      const retry = root.querySelector("[data-chart-refresh]");
      const latest = root.querySelector("[data-chart-latest]");
      const storageKey = "market-chart-selection-v1";
      let catalog, selection, chart, series, observer, rows = [], points = [], hasMore = false;
      let generation = 0, controller, loading = false, initializing = false, active = false, applying = false;
      let retryOlder = false;
      const context = () => ({ source: source.value, instrumentId: instrument.value, timeframe: timeframe.value });
      const option = (value, label) => { const el = document.createElement("option"); el.value = value; el.textContent = label; return el; };
      const fail = message => { notice.textContent = message; notice.hidden = false; };
      function configure(saved) {
        selection = restoreMarketChartSelection(catalog, saved);
        source.replaceChildren(...catalog.sources.map(item => option(item.id, item.label)));
        source.value = selection.source;
        const instruments = catalog.sources.find(item => item.id === selection.source).instruments;
        instrument.replaceChildren(...instruments.map(item => option(item.id, item.label)));
        instrument.value = selection.instrumentId;
        const item = instruments.find(item => item.id === selection.instrumentId);
        timeframe.replaceChildren(...item.timeframes.map(value => option(value, MARKET_CHART_LABELS[value])));
        timeframe.value = selection.timeframe;
        for (const field of [source, instrument, timeframe]) field.disabled = false;
      }
      function displayTime(time) {
        if (typeof time === "string") return time;
        if (typeof time === "object") return `${time.year}-${String(time.month).padStart(2, "0")}-${String(time.day).padStart(2, "0")}`;
        return new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Moscow", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(time * 1000));
      }
      function ensureChart() {
        if (chart) return;
        const library = window.LightweightCharts;
        if (!library?.CandlestickSeries) throw new Error("The chart library is unavailable.");
        const style = getComputedStyle(document.documentElement);
        const color = name => style.getPropertyValue(name).trim();
        chart = library.createChart(canvas, {
          width: canvas.clientWidth, height: 480,
          crosshair: { mode: library.CrosshairMode.Normal },
          layout: { attributionLogo: true, background: { type: library.ColorType.Solid, color: color("--bs-body-bg") }, textColor: color("--bs-secondary-color") },
          grid: { vertLines: { color: color("--bs-border-color-translucent") }, horzLines: { color: color("--bs-border-color-translucent") } },
          rightPriceScale: { borderColor: color("--bs-border-color") },
          timeScale: { timeVisible: true, secondsVisible: false, rightOffset: 3 },
          localization: { timeFormatter: displayTime }
        });
        const candleOutline = color("--palette-gray-700");
        series = chart.addSeries(library.CandlestickSeries, {
          upColor: "#FFFFFF", downColor: color("--palette-gray-600"),
          borderVisible: true, borderUpColor: candleOutline, borderDownColor: candleOutline,
          wickUpColor: candleOutline, wickDownColor: candleOutline, priceLineColor: candleOutline
        });
        chart.timeScale().subscribeVisibleLogicalRangeChange(range => {
          if (active && !applying && !loading && !retryOlder && hasMore && range && range.from < 30) void load(true);
        });
        observer = new ResizeObserver(() => {
          if (canvas.clientWidth > 0) chart.applyOptions({ width: canvas.clientWidth });
        });
        observer.observe(canvas);
      }
      function setLatestRange(resetZoom = false) {
        if (!points.length) return;
        const scale = chart.timeScale();
        const visible = scale.getVisibleLogicalRange();
        const span = !resetZoom && visible && visible.to > visible.from
          ? visible.to - visible.from : Math.max(30, Math.floor(canvas.clientWidth / 8));
        const to = points.length + 1;
        scale.setVisibleLogicalRange({ from: to - span, to });
      }
      function showLatest() { setLatestRange(); }
      async function load(older = false) {
        if (!catalog || older && (loading || !hasMore || !rows.length)) return;
        if (!older) { generation++; controller?.abort(); }
        const token = generation, requested = context();
        controller = new AbortController(); loading = true; retryOlder = false; notice.hidden = true;
        status.textContent = older ? "Loading earlier candles…" : "Loading stored candles…";
        canvas.setAttribute("aria-busy", "true");
        try {
          ensureChart();
          if (!older) {
            rows = []; points = []; hasMore = false; applying = true; series.setData([]); applying = false;
            empty.hidden = false; empty.textContent = "Loading…";
          }
          const response = await api.candles({ ...requested, limit: "500", ...(older ? { before: rows[0].begin } : {}) }, controller.signal);
          if (token !== generation) return;
          if (response.source !== requested.source || response.instrumentId !== requested.instrumentId || response.timeframe !== requested.timeframe
              || !Array.isArray(response.candles) || typeof response.hasMore !== "boolean" || response.hasMore && !response.candles.length) throw new Error("Chart response does not match the selected instrument and timeframe.");
          const nextRows = older ? [...response.candles, ...rows] : response.candles;
          const nextPoints = marketChartPoints(nextRows, requested.timeframe);
          const visible = chart.timeScale().getVisibleLogicalRange();
          const added = nextRows.length - rows.length;
          rows = nextRows; points = nextPoints; hasMore = response.hasMore;
          applying = true;
          series.applyOptions({ priceFormat: { type: "price", precision: response.precision, minMove: response.minMove } });
          chart.applyOptions({ timeScale: { timeVisible: requested.timeframe !== "ONE_DAY",
            tickMarkFormatter: time => requested.timeframe === "ONE_DAY" ? displayTime(time) : new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Moscow", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(time * 1000)) } });
          series.setData(points);
          if (older && visible) chart.timeScale().setVisibleLogicalRange({ from: visible.from + added, to: visible.to + added });
          else setLatestRange(true);
          applying = false;
          empty.hidden = rows.length > 0;
          empty.textContent = "No stored candles for this selection.";
          status.textContent = rows.length ? "Chart updated." : "No data. Use Source Data or Candle Aggregation to prepare candles.";
        } catch (error) {
          if (token !== generation || error.name === "AbortError") return;
          retryOlder = older;
          status.textContent = older ? "Earlier candles could not be loaded. The current chart is unchanged." : "Chart data could not be loaded.";
          fail(error.status === 404 ? "Charts API is unavailable. Restart the backend and retry." : error.message);
          if (!rows.length) { empty.hidden = false; empty.textContent = "Unable to load candles. Use Refresh to retry."; }
        } finally {
          if (token === generation) { applying = false; loading = false; canvas.setAttribute("aria-busy", "false"); }
        }
      }
      async function activate() {
        if (active) return;
        active = true;
        if (initializing) return;
        if (catalog) { void load(); return; }
        initializing = true;
        try {
          catalog = await api.catalog();
          let saved;
          try { saved = JSON.parse(window.localStorage.getItem(storageKey)); } catch {}
          configure(saved);
          if (active) await load();
        } catch (error) {
          catalog = null; active = false;
          status.textContent = "Chart data could not be loaded.";
          fail(error.status === 404 ? "Charts API is unavailable. Restart the backend and retry." : error.message);
          empty.textContent = "Unable to open the chart. Use Refresh to retry.";
        } finally { initializing = false; }
      }
      function changed(event) {
        const saved = context();
        if (event.target === source) { saved.instrumentId = ""; saved.timeframe = timeframe.value; }
        configure(saved);
        try { window.localStorage.setItem(storageKey, JSON.stringify(selection)); } catch {}
        void load();
      }
      for (const field of [source, instrument, timeframe]) field.addEventListener("change", changed);
      const refresh = () => { if (!catalog) void activate(); else void load(retryOlder); };
      retry.addEventListener("click", refresh);
      latest.addEventListener("click", showLatest);
      return { activate, deactivate() { if (active) { active = false; generation++; controller?.abort(); loading = false; } },
        destroy() {
          active = false; generation++; controller?.abort(); observer?.disconnect(); chart?.remove();
          for (const field of [source, instrument, timeframe]) field.removeEventListener("change", changed);
          retry.removeEventListener("click", refresh); latest.removeEventListener("click", showLatest);
        } };
    }

    let marketChartWorkspace;
    function openMarketChartWorkspace() {
      marketChartWorkspace ??= createMarketChartWorkspace(document.querySelector('[data-market-panel="charts"]'), createMarketChartApi(demoApiRequest));
      void marketChartWorkspace.activate();
    }
