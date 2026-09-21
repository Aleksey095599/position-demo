    const marketQuoteTabs = Array.from(document.querySelectorAll("[data-market-quote-tab]"));
    const marketQuotePanels = Array.from(document.querySelectorAll("[data-market-quote-panel]"));

    function selectMarketQuoteTab(source) {
      if (!marketQuoteTabs.some(tab => tab.dataset.marketQuoteTab === source)) {
        return;
      }

      marketQuoteTabs.forEach(tab => {
        const selected = tab.dataset.marketQuoteTab === source;
        tab.classList.toggle("active", selected);
        tab.setAttribute("aria-selected", String(selected));
        tab.tabIndex = selected ? 0 : -1;
      });
      marketQuotePanels.forEach(panel => {
        panel.hidden = panel.dataset.marketQuotePanel !== source;
      });

      if (source === "simulation") {
        window.requestAnimationFrame(() => {
          if (marketStreamGridReady) marketStreamGrid?.redraw(true);
        });
      }
    }

    function handleMarketQuoteTabKeydown(event) {
      const currentIndex = marketQuoteTabs.indexOf(event.currentTarget);
      let nextIndex;

      switch (event.key) {
        case "ArrowRight": nextIndex = (currentIndex + 1) % marketQuoteTabs.length; break;
        case "ArrowLeft": nextIndex = (currentIndex - 1 + marketQuoteTabs.length) % marketQuoteTabs.length; break;
        case "Home": nextIndex = 0; break;
        case "End": nextIndex = marketQuoteTabs.length - 1; break;
        default: return;
      }

      event.preventDefault();
      const nextTab = marketQuoteTabs[nextIndex];
      selectMarketQuoteTab(nextTab.dataset.marketQuoteTab);
      nextTab.focus();
    }

    const marketHistoryTimeFormatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Moscow",
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23"
    });
    const marketHistoryInputFormatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Moscow",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23"
    });
    const marketHistorySyncDateFormatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: "UTC",
      year: "numeric",
      month: "short",
      day: "2-digit"
    });
    const marketHistorySyncMonthFormatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: "UTC",
      year: "numeric",
      month: "long"
    });
    const marketHistorySyncForm = document.getElementById("marketHistorySyncForm");
    const marketHistorySyncInstrument = document.getElementById("marketHistorySyncInstrument");
    const marketHistorySyncButton = document.getElementById("marketHistorySyncButton");
    const marketHistorySyncButtonText = document.getElementById("marketHistorySyncButtonText");
    const marketHistorySyncProgress = document.getElementById("marketHistorySyncProgress");
    const marketHistorySyncSummary = document.getElementById("marketHistorySyncSummary");
    const marketHistorySyncCount = document.getElementById("marketHistorySyncCount");
    const marketHistorySyncProgressBar = document.getElementById("marketHistorySyncProgressBar");
    const marketHistorySyncCalendar = document.getElementById("marketHistorySyncCalendar");
    const MARKET_HISTORY_SYNC_WEEKDAYS = Object.freeze(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
    let marketHistorySyncRunning = false;
    let marketHistorySyncActiveDate = "";

    function marketGridActionMarkup(action, icon, label, { danger = false, primary = false, disabled = false } = {}) {
      const variant = danger ? "btn-outline-danger" : primary ? "btn-primary" : "btn-outline-secondary";
      const tooltipAttribute = ["edit", "delete", "simulation", "save", "cancel"].includes(action)
        ? ""
        : ` title="${escapeHtml(label)}"`;
      return `
        <button type="button" class="btn btn-sm ${variant} market-grid-action"
          data-market-grid-action="${escapeHtml(action)}" aria-label="${escapeHtml(label)}"${tooltipAttribute} ${disabled ? "disabled" : ""}>
          <span class="button-icon" aria-hidden="true">${escapeHtml(icon)}</span>
        </button>
      `;
    }

    function marketRelatedViewButtonMarkup(
      action,
      count,
      singularLabel,
      pluralLabel,
      editing = false,
      { showCount = false, showTooltip = true } = {}
    ) {
      const normalizedCount = Math.max(0, Number(count) || 0);
      const hasRelatedRows = normalizedCount > 0;
      const label = normalizedCount === 1 ? singularLabel : pluralLabel;
      const tooltip = editing && hasRelatedRows
        ? `Finish editing to view ${pluralLabel}`
        : hasRelatedRows
          ? `View ${normalizedCount} ${label}`
          : `No ${pluralLabel}`;
      const disabled = editing || !hasRelatedRows;
      const wrapperTooltip = showTooltip && disabled
        ? ` tabindex="0" data-tooltip="${escapeHtml(tooltip)}"`
        : "";
      const buttonTooltip = showTooltip && !disabled
        ? ` data-tooltip="${escapeHtml(tooltip)}"`
        : "";
      const countMarkup = showCount
        ? `<span class="reference-related-count" aria-label="${normalizedCount} ${escapeHtml(label)}">${normalizedCount}</span>`
        : "";

      return `
        <span class="reference-related-view-control"${wrapperTooltip}>
          ${countMarkup}
          <button type="button" class="btn btn-sm btn-outline-secondary market-grid-action"
            data-market-grid-action="${escapeHtml(action)}"
            aria-label="${escapeHtml(tooltip)}"${buttonTooltip}${disabled ? " disabled" : ""}>
            <span class="button-icon" aria-hidden="true">visibility</span>
          </button>
        </span>
      `;
    }

    function marketCcyOptionGridData() {
      const rows = ccyOptions.map((ccy, sourceIndex) => ({
        id: ccy.code,
        sourceIndex,
        code: ccy.code,
        name: ccy.name,
        country: ccy.country,
        fractionDigits: ccy.fractionDigits,
        pairCount: marketCcyPairCount(ccy.code)
      }));

      if (marketCcyOptionsEditState?.mode === "create") {
        rows.unshift({
          id: "__new_currency__",
          sourceIndex: null,
          ...defaultMarketCcyDraft(),
          isEditing: true,
          isCreating: true,
          editIndex: "new"
        });
      } else if (marketCcyOptionsEditState?.mode === "edit" && rows[marketCcyOptionsEditState.index]) {
        rows[marketCcyOptionsEditState.index] = {
          ...rows[marketCcyOptionsEditState.index],
          isEditing: true,
          isCreating: false,
          editIndex: String(marketCcyOptionsEditState.index)
        };
      }

      return rows;
    }

    function marketCcyOptionFieldFormatter(field) {
      return cell => {
        const item = cell.getRow().getData();

        if (!item.isEditing) {
          return escapeHtml(String(cell.getValue() ?? ""));
        }

        const value = escapeHtml(String(cell.getValue() ?? ""));

        if (field === "fractionDigits") {
          return `<input class="market-inline-control market-inline-number" type="number" inputmode="numeric" min="0" max="10" step="1"
            data-market-ccy-option-field="fractionDigits" value="${value}" aria-label="Fraction Digits" required>`;
        }

        const isCode = field === "code";
        const label = isCode ? "Code" : field === "name" ? "Name" : "Country";
        const controlClass = isCode ? " market-inline-code" : "";
        const readOnly = isCode && !item.isCreating ? " readonly" : "";
        const maxLength = ccyOptionTextLimits[field];
        const pattern = isCode ? "[A-Z]{3}" : "[A-Za-z]+(?: [A-Za-z]+)*";
        return `<input class="market-inline-control${controlClass}" type="text" data-market-ccy-option-field="${field}"
          value="${value}" maxlength="${maxLength}" pattern="${pattern}" aria-label="${label}"${readOnly} required>`;
      };
    }

    function marketCcyOptionActionsFormatter(cell) {
      const item = cell.getRow().getData();

      if (item.isEditing) {
        return `<div class="market-grid-actions">
          ${marketGridActionMarkup("save", "save", "Save Ccy options", { primary: true, disabled: true })}
          ${marketGridActionMarkup("cancel", "close", "Cancel editing")}
        </div>`;
      }

      return `<div class="market-grid-actions">
        ${marketGridActionMarkup("edit", "edit", `Edit ${item.code}`)}
        ${marketGridActionMarkup("delete", "delete", `Delete ${item.code}`, { danger: true, disabled: item.pairCount > 0 })}
      </div>`;
    }

    function marketCcyPairsViewFormatter(cell) {
      const item = cell.getRow().getData();

      return marketRelatedViewButtonMarkup(
        "view-currency-pairs",
        item.pairCount,
        "Ccy Pair",
        "Ccy Pairs",
        Boolean(item.isEditing),
        { showCount: true, showTooltip: false }
      );
    }

    function marketCcyOptionRowFormatter(row) {
      const element = row.getElement();
      const item = row.getData();
      element.classList.toggle("market-inline-edit-row", Boolean(item.isEditing));

      if (item.isEditing) {
        element.dataset.marketCcyOptionEditIndex = item.editIndex;
      } else {
        delete element.dataset.marketCcyOptionEditIndex;
      }
    }

    function handleMarketCcyOptionGridAction(event, cell) {
      const button = event.target.closest("[data-market-grid-action]");

      if (!button) {
        return;
      }

      const action = button.dataset.marketGridAction;
      const row = cell.getRow();
      const index = Number(row.getData().sourceIndex);

      if (button.disabled) {
        return;
      }

      if (action === "view-currency-pairs") {
        const code = row.getData().code;
        const route = currencyPairSettingsForCurrencyRoute(code);

        if (location.hash === route) {
          syncMarketSettingsRouteView();
          renderMarketPage();
        } else {
          location.hash = route;
        }
      } else if (action === "edit") {
        startMarketCcyOptionEdit(index);
      } else if (action === "delete") {
        deleteMarketCcyOption(index);
      } else if (action === "save") {
        saveMarketCcyOptionFromRow(row.getElement());
      } else if (action === "cancel") {
        cancelMarketCcyOptionEdit();
      }
    }

    function renderMarketCcyOptionRows() {
      const data = marketCcyOptionGridData();

      if (!marketCcyOptionGrid) {
        marketCcyOptionGrid = new Tabulator(marketCcyOptionRowsEl, marketTabulatorOptions("No currencies configured.", [
          tabulatorSizedColumn("code", { title: "Code", field: "code", headerFilter: "input", headerSort: true, formatter: marketCcyOptionFieldFormatter("code") }),
          tabulatorSizedColumn("name", { title: "Name", field: "name", headerFilter: "input", headerSort: false, formatter: marketCcyOptionFieldFormatter("name") }),
          tabulatorSizedColumn("name", { title: "Country", field: "country", headerFilter: "input", headerSort: false, formatter: marketCcyOptionFieldFormatter("country") }),
          tabulatorSizedColumn("number", {
            title: tabulatorIconColumnTitle("decimal_increase", "Fraction Digits"),
            field: "fractionDigits",
            headerSort: false,
            hozAlign: "right",
            headerHozAlign: "right",
            formatter: marketCcyOptionFieldFormatter("fractionDigits")
          }),
          tabulatorSizedColumn("count", {
            title: "Ccy Pairs",
            field: "pairCount",
            cssClass: "reference-related-view-cell",
            headerSort: false,
            hozAlign: "center",
            headerHozAlign: "center",
            formatter: marketCcyPairsViewFormatter,
            cellClick: handleMarketCcyOptionGridAction
          }),
          tabulatorSizedColumn("actions", {
            title: "Actions",
            field: "actions",
            cssClass: "market-grid-actions-cell",
            headerSort: false,
            hozAlign: "center",
            headerHozAlign: "center",
            formatter: marketCcyOptionActionsFormatter,
            cellClick: handleMarketCcyOptionGridAction
          })
        ], data, {
          rowFormatter: marketCcyOptionRowFormatter,
          initialSort: [{ column: "code", dir: "asc" }]
        }, "ccy_options_grid"));
        registerUiTableTabulator("ccy_options_grid", marketCcyOptionGrid);
        marketCcyOptionGrid.on("tableBuilt", () => {
          marketCcyOptionGridReady = true;
          marketCcyOptionGrid.redraw(true);
        });
      } else if (marketCcyOptionGridReady) {
        marketCcyOptionGrid.replaceData(data);
      }
    }

    function queueMarketInlineEditorReady(container, selector, onReady = null) {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const control = container.querySelector(selector);
        onReady?.(control?.closest(".tabulator-row") || null);
      }));
    }

    function startMarketCcyOptionEdit(index = null) {
      const isEditing = Number.isInteger(index) && Boolean(ccyOptions[index]);
      marketCcyOptionsEditState = { mode: isEditing ? "edit" : "create", index: isEditing ? index : null };
      marketPairOptionsEditState = null;
      marketCcyOptionGrid?.clearHeaderFilter();
      setMarketStatus("");
      renderMarketPage();
      queueMarketInlineEditorReady(
        marketCcyOptionRowsEl,
        `[data-market-ccy-option-edit-index="${isEditing ? index : "new"}"] [data-market-ccy-option-field="${isEditing ? "name" : "code"}"]`,
        row => row && updateMarketCcyOptionRowSaveAvailability(row)
      );
    }

    function cancelMarketCcyOptionEdit() {
      marketCcyOptionsEditState = null;
      setMarketStatus("");
      renderMarketPage();
    }

    function marketCcyOptionDraftFromRow(row) {
      const field = name => row.querySelector(`[data-market-ccy-option-field="${name}"]`);
      const code = String(field("code")?.value || "").trim().toUpperCase();
      const name = normalizedMarketCcyText(field("name")?.value);
      const country = normalizedMarketCcyText(field("country")?.value);
      const fractionDigits = Number(field("fractionDigits")?.value);

      if (!/^[A-Z]{3}$/.test(code)
        || !marketCcyTextIsValid(name, ccyOptionTextLimits.name)
        || !marketCcyTextIsValid(country, ccyOptionTextLimits.country)
        || !Number.isInteger(fractionDigits)
        || fractionDigits < 0
        || fractionDigits > 10) {
        return null;
      }

      return { code, name, country, fractionDigits };
    }

    function normalizedMarketCcyText(value) {
      return String(value || "").trim().replace(/\s+/g, " ");
    }

    function marketCcyTextIsValid(value, maxLength) {
      return value.length >= 1
        && value.length <= maxLength
        && /^[A-Za-z]+(?: [A-Za-z]+)*$/.test(value);
    }

    function updateMarketCcyOptionRowSaveAvailability(row) {
      const button = row.querySelector("[data-market-grid-action='save']");
      const draft = marketCcyOptionDraftFromRow(row);
      const indexValue = row.dataset.marketCcyOptionEditIndex;
      const currentIndex = indexValue === "new" ? null : Number(indexValue);
      const duplicate = draft && ccyOptions.some((item, index) => item.code === draft.code && index !== currentIndex);
      const current = Number.isInteger(currentIndex) ? ccyOptions[currentIndex] : null;
      const changed = !current || !draft || ["name", "country", "fractionDigits"].some(key => draft[key] !== current[key]);

      setSaveButtonAvailability(button, Boolean(draft) && !duplicate && changed, duplicate ? "Ccy Code already exists" : "Complete required fields before saving");
    }

    async function saveMarketCcyOptionFromRow(row) {
      const draft = marketCcyOptionDraftFromRow(row);
      const indexValue = row.dataset.marketCcyOptionEditIndex;
      const currentIndex = indexValue === "new" ? null : Number(indexValue);
      const isCreating = currentIndex === null || !Number.isInteger(currentIndex);

      if (!draft) {
        setMarketStatus("Complete all Currency fields before saving.", "error");
        return;
      }

      if (ccyOptions.some((item, index) => item.code === draft.code && index !== currentIndex)) {
        setMarketStatus(`Currency ${draft.code} already exists. Enter a unique code.`, "error");
        return;
      }

      try {
        if (DEMO_API_ENABLED) {
          await demoApiRequest(
            isCreating ? "/api/v1/ccy-options" : `/api/v1/ccy-options/${encodeURIComponent(ccyOptions[currentIndex].code)}`,
            { method: isCreating ? "POST" : "PUT", body: JSON.stringify(draft) }
          );
          await refreshMarketReferenceDataFromApi();
        } else if (isCreating) {
          ccyOptions = normalizedCcyOptions([...ccyOptions, draft], []);
          saveCcyOptions();
        } else {
          ccyOptions[currentIndex] = { ...ccyOptions[currentIndex], ...draft };
          ccyOptions = normalizedCcyOptions(ccyOptions, []);
          saveCcyOptions();
        }

        marketCcyOptionsEditState = null;
        setMarketStatus(
          completedActionMessage(`Currency ${draft.code}`, isCreating ? "created" : "saved"),
          "success"
        );
        renderMarketPage();
      } catch (error) {
        setMarketStatus(error.message, "error");
      }
    }

    async function deleteMarketCcyOption(index) {
      const ccy = ccyOptions[index];

      if (!ccy || marketCcyPairCount(ccy.code) > 0) {
        return;
      }

      try {
        if (DEMO_API_ENABLED) {
          await demoApiRequest(`/api/v1/ccy-options/${encodeURIComponent(ccy.code)}`, { method: "DELETE" });
          await refreshMarketReferenceDataFromApi();
        } else {
          ccyOptions.splice(index, 1);
          saveCcyOptions();
        }

        marketCcyOptionsEditState = null;
        setMarketStatus(completedActionMessage(`Currency ${ccy.code}`, "deleted"), "success");
        renderMarketPage();
      } catch (error) {
        setMarketStatus(error.message, "error");
      }
    }

    function defaultMarketPairDraft() {
      const fallback = DEFAULT_MARKET_PAIRS[0];
      const usedPairs = new Set(marketPairs.map(pair => pair.currencyPair));
      const availablePair = ccyOptions
        .flatMap(base => ccyOptions.map(quote => `${base.code}/${quote.code}`))
        .find(candidate => candidate.split("/")[0] !== candidate.split("/")[1] && !usedPairs.has(candidate));
      const pair = availablePair || fallback.currencyPair;
      const [baseCcy, quoteCcy] = pair.split("/");

      return {
        baseCcy,
        quoteCcy,
        currencyPair: pair || fallback.currencyPair,
        defaultQuoteDecimals: fallback.defaultQuoteDecimals ?? DEFAULT_QUOTE_DECIMALS,
        bidMin: null,
        spread: null,
        bidMax: null
      };
    }

    function marketCcySelectOptions(selectedCode) {
      return ccyOptions
        .map(ccy => `<option value="${escapeHtml(ccy.code)}" ${ccy.code === selectedCode ? "selected" : ""}>${escapeHtml(ccy.code)}</option>`)
        .join("");
    }

    function renderMarketPairOptionRows() {
      const data = marketPairs
        .map((pair, sourceIndex) => ({ pair, sourceIndex }))
        .map(({ pair, sourceIndex }) => ({
          id: pair.pairCode,
          sourceIndex,
          baseCcy: pair.baseCcy,
          quoteCcy: pair.quoteCcy,
          currencyPair: pair.currencyPair,
          defaultQuoteDecimals: pair.defaultQuoteDecimals,
          pricingRulesCount: pair.pricingRulesCount
        }))
        .sort((left, right) => left.currencyPair.localeCompare(right.currencyPair));

      if (marketPairOptionsEditState?.mode === "create") {
        data.unshift({
          id: "__new_currency_pair__",
          sourceIndex: null,
          ...defaultMarketPairDraft(),
          isEditing: true,
          isCreating: true,
          editIndex: "new"
        });
      } else if (marketPairOptionsEditState?.mode === "edit") {
        const editingRow = data.find(item => item.sourceIndex === marketPairOptionsEditState.index);

        if (editingRow) {
          Object.assign(editingRow, {
            isEditing: true,
            isCreating: false,
            editIndex: String(marketPairOptionsEditState.index)
          });
        }
      }

      if (!marketPairOptionGrid) {
        marketPairOptionGrid = new Tabulator(marketPairOptionRowsEl, marketTabulatorOptions("No Ccy Pairs configured.", [
          tabulatorSizedColumn("code", { title: "Base Ccy", field: "baseCcy", headerFilter: "input", headerSort: false, formatter: marketPairOptionCurrencyFormatter("baseCcy") }),
          tabulatorSizedColumn("code", { title: "Quote Ccy", field: "quoteCcy", headerFilter: "input", headerSort: false, formatter: marketPairOptionCurrencyFormatter("quoteCcy") }),
          tabulatorSizedColumn("pair", { title: "Ccy Pair", field: "currencyPair", headerFilter: "input", headerSort: true, formatter: marketPairOptionCodeFormatter }),
          tabulatorSizedColumn("number", {
            title: tabulatorIconColumnTitle("decimal_increase", "Default Quote Decimals"),
            field: "defaultQuoteDecimals",
            headerSort: false,
            hozAlign: "right",
            headerHozAlign: "right",
            formatter: marketPairOptionDecimalsFormatter
          }),
          tabulatorSizedColumn("count", {
            title: tabulatorIconColumnTitle("rule", "Pricing Rules using Currency Pair"),
            field: "pricingRulesCount",
            cssClass: "reference-related-view-cell",
            headerSort: false,
            hozAlign: "center",
            headerHozAlign: "center",
            formatter: marketPairPricingRulesViewFormatter,
            cellClick: handleMarketPairOptionGridAction
          }),
          tabulatorSizedColumn("actions", {
            title: "Actions",
            field: "actions",
            cssClass: "market-grid-actions-cell",
            headerSort: false,
            hozAlign: "center",
            headerHozAlign: "center",
            formatter: marketPairOptionActionsFormatter,
            cellClick: handleMarketPairOptionGridAction
          })
        ], data, {
          rowFormatter: marketPairOptionRowFormatter,
          initialSort: [{ column: "currencyPair", dir: "asc" }]
        }, "ccy_pair_options_grid"));
        registerUiTableTabulator("ccy_pair_options_grid", marketPairOptionGrid);
        marketPairOptionGrid.on("tableBuilt", () => {
          marketPairOptionGridReady = true;
          applyMarketPairRouteCurrencyFilter();
          syncMarketPairClearFiltersButton();
          marketPairOptionGrid.redraw(true);
        });
        marketPairOptionGrid.on("dataFiltered", syncMarketPairClearFiltersButton);
      } else if (marketPairOptionGridReady) {
        marketPairOptionGrid.replaceData(data);
        syncMarketPairClearFiltersButton();
      }
    }

    function marketPairOptionCurrencyFormatter(field) {
      return cell => {
        const item = cell.getRow().getData();

        if (!item.isEditing) {
          return escapeHtml(String(cell.getValue() || ""));
        }

        return `<select class="market-inline-control" data-market-pair-option-field="${field}"
          aria-label="${field === "baseCcy" ? "Base Ccy" : "Quote Ccy"}" ${item.isCreating ? "" : "disabled"} required>
          ${marketCcySelectOptions(cell.getValue())}
        </select>`;
      };
    }

    function marketPairOptionCodeFormatter(cell) {
      const item = cell.getRow().getData();
      const value = escapeHtml(String(cell.getValue() || ""));
      return item.isEditing
        ? `<span class="market-inline-pair-code" data-market-pair-option-computed>${value}</span>`
        : value;
    }

    function marketPairOptionDecimalsFormatter(cell) {
      const item = cell.getRow().getData();

      if (!item.isEditing) {
        return escapeHtml(String(cell.getValue() ?? ""));
      }

      return `<input class="market-inline-control market-inline-number" type="number" inputmode="numeric"
        min="0" max="${MAX_DEFAULT_QUOTE_DECIMALS}" step="1" data-market-pair-option-field="defaultQuoteDecimals"
        value="${escapeHtml(String(cell.getValue() ?? ""))}" aria-label="Default Quote Decimals" required>`;
    }

    function marketPairOptionActionsFormatter(cell) {
      const item = cell.getRow().getData();

      if (item.isEditing) {
        return `<div class="market-grid-actions">
          ${marketGridActionMarkup("save", "save", "Save Ccy Pair options", { primary: true, disabled: true })}
          ${marketGridActionMarkup("cancel", "close", "Cancel editing")}
        </div>`;
      }

      const pricingRulesCount = Math.max(0, Number(item.pricingRulesCount) || 0);
      const ruleLabel = pricingRulesCount === 1 ? "Pricing Rule" : "Pricing Rules";
      const deleteLabel = pricingRulesCount > 0
        ? `Delete unavailable: ${item.currencyPair} is used in ${pricingRulesCount} ${ruleLabel}.`
        : `Delete ${item.currencyPair}`;

      return `<div class="market-grid-actions">
        ${marketGridActionMarkup("edit", "edit", `Edit ${item.currencyPair}`)}
        ${marketGridActionMarkup("delete", "delete", deleteLabel, { danger: true, disabled: pricingRulesCount > 0 })}
      </div>`;
    }

    function marketPairPricingRulesViewFormatter(cell) {
      const item = cell.getRow().getData();

      return marketRelatedViewButtonMarkup(
        "view-pricing-rules",
        item.pricingRulesCount,
        "Pricing Rule",
        "Pricing Rules",
        Boolean(item.isEditing),
        { showCount: true, showTooltip: false }
      );
    }

    function marketPairOptionRowFormatter(row) {
      const element = row.getElement();
      const item = row.getData();
      element.classList.toggle("market-inline-edit-row", Boolean(item.isEditing));

      if (item.isEditing) {
        element.dataset.marketPairOptionEditIndex = item.editIndex;
      } else {
        delete element.dataset.marketPairOptionEditIndex;
      }
    }

    function handleMarketPairOptionGridAction(event, cell) {
      const button = event.target.closest("[data-market-grid-action]");

      if (!button) {
        return;
      }

      if (button.disabled) {
        return;
      }

      const action = button.dataset.marketGridAction;
      const row = cell.getRow();
      const index = Number(row.getData().sourceIndex);

      if (action === "view-pricing-rules") {
        const route = pricingRulesForCcyPairRoute(row.getData().pairCode || row.getData().id);

        if (location.hash === route) {
          syncPricingRulesRouteView();
          renderPricingRules();
        } else {
          location.hash = route;
        }
      } else if (action === "edit") {
        startMarketPairOptionEdit(index);
      } else if (action === "delete") {
        deleteMarketPair(index);
      } else if (action === "save") {
        saveMarketPairOptionsFromRow(row.getElement());
      } else if (action === "cancel") {
        cancelMarketPairOptionEdit();
      }
    }

    function startMarketPairOptionEdit(index = null) {
      const isEditing = Number.isInteger(index) && Boolean(marketPairs[index]);
      marketPairOptionsEditState = { mode: isEditing ? "edit" : "create", index: isEditing ? index : null };
      marketCcyOptionsEditState = null;
      marketPairOptionGrid?.clearHeaderFilter();
      setMarketStatus("");
      renderMarketPage();
      queueMarketInlineEditorReady(
        marketPairOptionRowsEl,
        `[data-market-pair-option-edit-index="${isEditing ? index : "new"}"] [data-market-pair-option-field="${isEditing ? "defaultQuoteDecimals" : "baseCcy"}"]`,
        row => row && syncMarketPairOptionEditRow(row)
      );
    }

    function cancelMarketPairOptionEdit() {
      marketPairOptionsEditState = null;
      setMarketStatus("");
      renderMarketPage();
    }

    function marketPairOptionsDraftFromRow(row) {
      const field = name => row.querySelector(`[data-market-pair-option-field="${name}"]`);
      const baseCcy = String(field("baseCcy")?.value || "").trim().toUpperCase();
      const quoteCcy = String(field("quoteCcy")?.value || "").trim().toUpperCase();
      const currencyPair = /^[A-Z]{3}$/.test(baseCcy) && /^[A-Z]{3}$/.test(quoteCcy) && baseCcy !== quoteCcy
        ? `${baseCcy}/${quoteCcy}`
        : "";
      const defaultQuoteDecimals = Number(field("defaultQuoteDecimals")?.value);

      if (
        !currencyPair ||
        !Number.isInteger(defaultQuoteDecimals) ||
        defaultQuoteDecimals < 0 ||
        defaultQuoteDecimals > MAX_DEFAULT_QUOTE_DECIMALS
      ) {
        return null;
      }

      return { pairCode: currencyPair.replace("/", "_"), baseCcy, quoteCcy, currencyPair, defaultQuoteDecimals };
    }

    function marketPairOptionsFromEditRow(row, currentIndex) {
      const field = name => row.querySelector(`[data-market-pair-option-field="${name}"]`);
      const baseCcyInput = field("baseCcy");
      const quoteCcyInput = field("quoteCcy");
      const defaultQuoteDecimalsInput = field("defaultQuoteDecimals");
      const options = marketPairOptionsDraftFromRow(row);
      const parsedDecimals = Number(defaultQuoteDecimalsInput.value);

      const distinctCurrencies = baseCcyInput.value !== quoteCcyInput.value;
      quoteCcyInput.setCustomValidity(distinctCurrencies ? "" : "Base Ccy and Quote Ccy must be different.");
      defaultQuoteDecimalsInput.setCustomValidity(
        Number.isInteger(parsedDecimals) && parsedDecimals >= 0 && parsedDecimals <= MAX_DEFAULT_QUOTE_DECIMALS
          ? ""
          : `Default Quote Decimals must be a whole number from 0 to ${MAX_DEFAULT_QUOTE_DECIMALS}.`
      );

      if (!distinctCurrencies) {
        quoteCcyInput.reportValidity();
        return null;
      }

      if (!Number.isInteger(parsedDecimals) || parsedDecimals < 0 || parsedDecimals > MAX_DEFAULT_QUOTE_DECIMALS) {
        defaultQuoteDecimalsInput.reportValidity();
        return null;
      }

      if (!options) {
        return null;
      }

      const duplicateIndex = marketPairs.findIndex((item, index) =>
        item.currencyPair === options.currencyPair && index !== currentIndex
      );

      if (duplicateIndex !== -1) {
        quoteCcyInput.setCustomValidity("Ccy Pair already exists.");
        quoteCcyInput.reportValidity();
        return null;
      }

      return options;
    }

    function sameMarketPairOptions(left, right) {
      return Boolean(left && right) &&
        left.currencyPair === right.currencyPair &&
        left.defaultQuoteDecimals === right.defaultQuoteDecimals;
    }

    function updateMarketPairOptionRowSaveAvailability(row) {
      const button = row.querySelector("[data-market-grid-action='save']");
      const options = marketPairOptionsDraftFromRow(row);
      const indexValue = row.dataset.marketPairOptionEditIndex;
      const currentIndex = indexValue === "new" ? null : Number(indexValue);

      if (!options) {
        setSaveButtonAvailability(button, false, "Complete required fields before saving");
        return;
      }

      const duplicateIndex = marketPairs.findIndex((item, index) =>
        item.currencyPair === options.currencyPair && index !== currentIndex
      );

      if (duplicateIndex !== -1) {
        setSaveButtonAvailability(button, false, "Ccy Pair already exists");
        return;
      }

      const currentPair = currentIndex === null || !Number.isInteger(currentIndex) ? null : marketPairs[currentIndex];
      const changed = currentIndex === null || !sameMarketPairOptions(options, currentPair);
      setSaveButtonAvailability(button, changed);
    }

    function syncMarketPairOptionEditRow(row) {
      const baseCcy = String(row.querySelector("[data-market-pair-option-field='baseCcy']")?.value || "").trim().toUpperCase();
      const quoteCcy = String(row.querySelector("[data-market-pair-option-field='quoteCcy']")?.value || "").trim().toUpperCase();
      const computed = row.querySelector("[data-market-pair-option-computed]");

      if (computed) {
        computed.textContent = /^[A-Z]{3}$/.test(baseCcy) && /^[A-Z]{3}$/.test(quoteCcy)
          ? `${baseCcy}/${quoteCcy}`
          : "-";
      }

      updateMarketPairOptionRowSaveAvailability(row);
    }

    async function saveMarketPairOptionsFromRow(row) {
      const indexValue = row.dataset.marketPairOptionEditIndex;
      const currentIndex = indexValue === "new" ? null : Number(indexValue);
      const options = marketPairOptionsFromEditRow(row, currentIndex);
      const isCreating = currentIndex === null || !Number.isInteger(currentIndex);

      if (!options) {
        return;
      }

      try {
        if (DEMO_API_ENABLED) {
          await demoApiRequest(
            isCreating
              ? "/api/v1/ccy-pair-options"
              : `/api/v1/ccy-pair-options/${encodeURIComponent(marketPairs[currentIndex].pairCode)}`,
            {
              method: isCreating ? "POST" : "PATCH",
              body: JSON.stringify(isCreating
                ? { baseCcy: options.baseCcy, quoteCcy: options.quoteCcy, defaultQuoteDecimals: options.defaultQuoteDecimals }
                : { defaultQuoteDecimals: options.defaultQuoteDecimals })
            }
          );
          await refreshMarketReferenceDataFromApi();
        } else if (isCreating) {
          marketPairs.push({ ...options, bidMin: null, spread: null, bidMax: null });
          marketPairs = normalizedMarketPairs(marketPairs, []);
          saveMarketPairs();
        } else {
          marketPairs[currentIndex] = { ...marketPairs[currentIndex], defaultQuoteDecimals: options.defaultQuoteDecimals };
          marketPairs = normalizedMarketPairs(marketPairs, []);
          saveMarketPairs();
        }

        marketPairOptionsEditState = null;
        clearMarketStreamCache();
        setMarketStatus(
          isCreating
            ? `Ccy Pair ${options.currencyPair} was created successfully. Configure its simulation settings.`
            : `Options for Ccy Pair ${options.currencyPair} were saved successfully.`,
          "success"
        );
        renderMarketPage();

        if (isCreating) {
          openMarketSimulationDialog(marketPairs.findIndex(pair => pair.currencyPair === options.currencyPair));
        }
      } catch (error) {
        setMarketStatus(error.message, "error");
      }
    }

    function clearMarketStreamCache() {
      marketLastQuotes.clear();
    }

    function openMarketSimulationDialog(pairIndex) {
      const pair = marketPairs[pairIndex];

      if (!pair) {
        return;
      }

      editingMarketSimulationCurrencyPair = pair.currencyPair;
      marketSimulationDialogTitle.textContent = `${pair.currencyPair} Simulation Settings`;
      marketSimulationForm.elements.bidMin.value = editNumber(pair.bidMin, pair.defaultQuoteDecimals);
      marketSimulationForm.elements.spread.value = editNumber(pair.spread, pair.defaultQuoteDecimals);
      marketSimulationForm.elements.bidMax.value = editNumber(pair.bidMax, pair.defaultQuoteDecimals);
      marketSimulationForm.elements.oneWayDurationSeconds.value = String(pair.oneWayDurationSeconds);
      marketSimulationForm.elements.fluctuationSpreads.value = String(pair.fluctuationSpreads);

      [
        marketSimulationForm.elements.bidMin,
        marketSimulationForm.elements.spread,
        marketSimulationForm.elements.bidMax,
        marketSimulationForm.elements.oneWayDurationSeconds,
        marketSimulationForm.elements.fluctuationSpreads
      ].forEach(input => input.setCustomValidity(""));

      openDialogWithoutFieldFocus(marketSimulationDialog);
    }

    function closeMarketSimulationDialog() {
      if (typeof marketSimulationDialog.close === "function") {
        marketSimulationDialog.close();
      } else {
        marketSimulationDialog.removeAttribute("open");
        editingMarketSimulationCurrencyPair = null;
      }
    }

    function marketSimulationValuesFromForm() {
      const bidMinInput = marketSimulationForm.elements.bidMin;
      const spreadInput = marketSimulationForm.elements.spread;
      const bidMaxInput = marketSimulationForm.elements.bidMax;
      const oneWayDurationInput = marketSimulationForm.elements.oneWayDurationSeconds;
      const fluctuationInput = marketSimulationForm.elements.fluctuationSpreads;
      const bidMin = normalizeNumber(bidMinInput.value);
      const spread = normalizeNumber(spreadInput.value);
      const bidMax = normalizeNumber(bidMaxInput.value);
      const oneWayDurationSeconds = Number(oneWayDurationInput.value);
      const fluctuationSpreads = normalizeNumber(fluctuationInput.value);
      const validBidMin = Number.isFinite(bidMin) && bidMin > 0;
      const validSpread = Number.isFinite(spread) && spread > 0;
      const validBidMax = Number.isFinite(bidMax) && bidMax > 0;
      const validDuration = Number.isInteger(oneWayDurationSeconds) &&
        oneWayDurationSeconds >= MIN_MARKET_ONE_WAY_DURATION_SECONDS &&
        oneWayDurationSeconds <= MAX_MARKET_ONE_WAY_DURATION_SECONDS;
      const validFluctuation = Number.isFinite(fluctuationSpreads) &&
        fluctuationSpreads >= 0 &&
        fluctuationSpreads <= MAX_MARKET_FLUCTUATION_SPREADS;

      bidMinInput.setCustomValidity(validBidMin ? "" : "Min Bid must be greater than zero.");
      spreadInput.setCustomValidity(validSpread ? "" : "Spread must be greater than zero.");
      bidMaxInput.setCustomValidity(
        !validBidMax
          ? "Max Bid must be greater than zero."
          : validBidMin && bidMax <= bidMin
            ? "Max Bid must be greater than Min Bid."
            : ""
      );
      oneWayDurationInput.setCustomValidity(
        validDuration
          ? ""
          : `One-way Duration must be a whole number from ${MIN_MARKET_ONE_WAY_DURATION_SECONDS} to ${MAX_MARKET_ONE_WAY_DURATION_SECONDS} seconds.`
      );
      fluctuationInput.setCustomValidity(
        validFluctuation
          ? ""
          : `Fluctuation must be from 0 to ${MAX_MARKET_FLUCTUATION_SPREADS} spreads.`
      );

      if (!validBidMin) {
        bidMinInput.reportValidity();
        return null;
      }

      if (!validSpread) {
        spreadInput.reportValidity();
        return null;
      }

      if (!validBidMax || bidMax <= bidMin) {
        bidMaxInput.reportValidity();
        return null;
      }

      if (!validDuration) {
        oneWayDurationInput.reportValidity();
        return null;
      }

      if (!validFluctuation) {
        fluctuationInput.reportValidity();
        return null;
      }

      return { bidMin, spread, bidMax, oneWayDurationSeconds, fluctuationSpreads };
    }

    async function saveMarketSimulationSettingsFromForm(event) {
      event.preventDefault();

      const pairIndex = marketPairs.findIndex(pair =>
        pair.currencyPair === editingMarketSimulationCurrencyPair
      );

      if (pairIndex === -1) {
        closeMarketSimulationDialog();
        return;
      }

      const settings = marketSimulationValuesFromForm();

      if (!settings) {
        return;
      }

      const pair = marketPairs[pairIndex];

      try {
        if (DEMO_API_ENABLED) {
          await demoApiRequest(`/api/v1/ccy-pair-options/${encodeURIComponent(pair.pairCode)}/simulation-settings`, {
            method: "PUT",
            body: JSON.stringify(settings)
          });
          await refreshMarketReferenceDataFromApi();
        } else {
          marketPairs[pairIndex] = { ...marketPairs[pairIndex], ...settings };
          marketPairs = normalizedMarketPairs(marketPairs, []);
          saveMarketPairs();
        }

        clearMarketStreamCache();
        closeMarketSimulationDialog();
        setMarketStatus(
          `Simulation settings for ${pair.currencyPair} were saved successfully.`,
          "success"
        );
        renderMarketPage();
      } catch (error) {
        setMarketStatus(error.message, "error");
      }
    }

    async function deleteMarketPair(index) {
      if (!Number.isInteger(index) || !marketPairs[index]) {
        return;
      }

      const pair = marketPairs[index];

      try {
        if (DEMO_API_ENABLED) {
          await demoApiRequest(`/api/v1/ccy-pair-options/${encodeURIComponent(pair.pairCode)}`, { method: "DELETE" });
          await refreshMarketReferenceDataFromApi();
        } else {
          marketPairs.splice(index, 1);
          saveMarketPairs();
        }

        marketPairOptionsEditState = null;
        clearMarketStreamCache();

        setMarketStatus(completedActionMessage(`Ccy Pair ${pair.currencyPair}`, "deleted"), "success");
        renderMarketPage();
      } catch (error) {
        setMarketStatus(error.message, "error");
      }
    }

    function applyMarketPulseSimulationSnapshot(snapshot) {
      if (!snapshot || typeof snapshot !== "object") {
        return;
      }

      marketStreamRunning = snapshot.running === true;
      marketStreamConnected = true;
      marketLastQuotes.clear();
      const generatedAt = String(snapshot.generatedAt || "").trim();
      (Array.isArray(snapshot.quotes) ? snapshot.quotes : []).forEach(quote => {
        const currencyPair = normalizedPricingRuleCurrencyPair(quote.currencyPair);
        const bid = Number(quote.bid);
        const offer = Number(quote.offer);

        if (currencyPair && Number.isFinite(bid) && Number.isFinite(offer)) {
          marketLastQuotes.set(currencyPair, { bid, offer, generatedAt });
        }
      });
      renderMarketQuoteState();
    }

    async function connectMarketPulseSimulation() {
      if (!DEMO_API_ENABLED) {
        marketStreamConnected = false;
        marketStreamToggleButton.disabled = true;
        return;
      }

      if (typeof EventSource === "undefined") {
        setMarketStatus("This browser does not support the Market Pulse Simulation stream.", "error");
        return;
      }

      marketStreamEventSource?.close();
      marketStreamEventSource = new EventSource("/api/v1/market-pulse-simulation/stream");
      marketStreamEventSource.addEventListener("snapshot", event => {
        try {
          applyMarketPulseSimulationSnapshot(JSON.parse(event.data));
        } catch {
          setMarketStatus("Market Pulse Simulation returned an invalid update.", "error");
        }
      });
      marketStreamEventSource.addEventListener("open", () => {
        marketStreamConnected = true;
      });
      marketStreamEventSource.addEventListener("error", () => {
        marketStreamConnected = false;
        setMarketStatus("Market Pulse Simulation connection was lost. Reconnecting...", "warning");
        renderMarketQuoteState();
      });

      try {
        const snapshot = await demoApiRequest("/api/v1/market-pulse-simulation/status");
        applyMarketPulseSimulationSnapshot(snapshot);
      } catch (error) {
        setMarketStatus(error.message, "error");
      }
    }

    function currentMarketQuoteForPair(currencyPairValue) {
      const pairValue = normalizedPricingRuleCurrencyPair(currencyPairValue);
      return marketLastQuotes.get(pairValue) || null;
    }

    function renderMarketStreamRow(pair, index) {
      const isConfigured = marketSimulationConfigured(pair);
      const quote = isConfigured ? marketLastQuotes.get(pair.currencyPair) || null : null;
      const bidText = quote
        ? formatMarketQuote(quote.bid, pair)
        : isConfigured
          ? DEMO_API_ENABLED ? "Waiting..." : "Backend required"
          : "Not configured";

      return `
        <tr${isConfigured ? "" : " class=\"is-not-configured\""}>
          <td>${escapeHtml(pair.currencyPair)}</td>
          <td class="number market-rate-cell market-bid-cell">${escapeHtml(bidText)}</td>
          <td class="number market-rate-cell market-offer-cell">${quote ? escapeHtml(formatMarketQuote(quote.offer, pair)) : ""}</td>
          <td class="profile-actions-cell">
            <button type="button" class="icon-action" data-market-simulation-action="edit" data-market-pair-index="${index}" aria-label="Open ${escapeHtml(pair.currencyPair)} simulation settings">
              <span class="button-icon" aria-hidden="true">tune</span>
            </button>
          </td>
        </tr>
      `;
    }

    function renderMarketStreamRows() {
      const rows = marketPairs.map((pair, pairIndex) => {
        const configured = marketSimulationConfigured(pair);
        const quote = configured ? marketLastQuotes.get(pair.currencyPair) || null : null;
        const bid = quote
          ? formatMarketQuote(quote.bid, pair)
          : configured
            ? DEMO_API_ENABLED ? "Waiting..." : "Backend required"
            : "Not configured";

        return {
          id: pair.pairCode || pair.currencyPair,
          pairIndex,
          currencyPair: pair.currencyPair,
          bid,
          offer: quote ? formatMarketQuote(quote.offer, pair) : "",
          configured,
          running: marketStreamRunning
        };
      });
      const signature = `${marketStreamRunning}|${rows.map(row => `${row.id}:${row.pairIndex}:${row.configured}`).join("|")}`;

      if (!marketStreamGrid) {
        marketStreamGrid = new Tabulator(marketStreamTable, marketTabulatorOptions("No market pairs configured.", [
          tabulatorSizedColumn("pair", { title: "Ccy Pair", field: "currencyPair", headerFilter: "input", headerSort: true }),
          tabulatorSizedColumn("rate", {
            title: "Bid",
            field: "bid",
            headerSort: false,
            hozAlign: "right",
            headerHozAlign: "right",
            formatter: marketStreamRateFormatter
          }),
          tabulatorSizedColumn("rate", {
            title: "Offer",
            field: "offer",
            headerSort: false,
            hozAlign: "right",
            headerHozAlign: "right",
            formatter: marketStreamRateFormatter
          }),
          tabulatorSizedColumn("actions", {
            title: "Settings",
            field: "actions",
            cssClass: "market-grid-actions-cell",
            headerSort: false,
            hozAlign: "center",
            headerHozAlign: "center",
            formatter: marketStreamActionsFormatter,
            cellClick: handleMarketStreamGridAction
          })
        ], rows, {}, "market_stream_grid"));
        registerUiTableTabulator("market_stream_grid", marketStreamGrid);
        marketStreamGrid.on("tableBuilt", () => {
          marketStreamGridReady = true;
          marketStreamGrid.redraw(true);
        });
        marketStreamGridSignature = signature;
      } else if (marketStreamGridReady && marketStreamGridSignature !== signature) {
        marketStreamGrid.replaceData(rows);
        marketStreamGridSignature = signature;
      } else if (marketStreamGridReady) {
        marketStreamGrid.updateData(rows.map(row => ({ id: row.id, bid: row.bid, offer: row.offer })));
      }
    }

    function marketStreamRateFormatter(cell) {
      const item = cell.getRow().getData();
      const field = cell.getField();
      const tone = !item.running || !item.configured
        ? "text-secondary"
        : field === "bid"
          ? "text-success"
          : "text-danger";
      return `<span class="market-tabulator-rate ${tone}">${escapeHtml(String(cell.getValue() || ""))}</span>`;
    }

    function marketStreamActionsFormatter(cell) {
      const item = cell.getRow().getData();
      return `<div class="market-grid-actions">
        ${marketGridActionMarkup("simulation", "tune", `Open ${item.currencyPair} simulation settings`)}
      </div>`;
    }

    function handleMarketStreamGridAction(event, cell) {
      if (!event.target.closest("[data-market-grid-action='simulation']")) {
        return;
      }

      openMarketSimulationDialog(Number(cell.getRow().getData().pairIndex));
    }

    function renderMarketQuoteState() {
      renderMarketStreamRows();
      renderHedgeQuickModeToolbar();
      marketStreamToggleIcon.textContent = marketStreamRunning ? "stop" : "play_arrow";
      marketStreamToggleText.textContent = marketStreamRunning ? "Stop stream" : "Start stream";
      marketStreamToggleButton.classList.toggle("is-running", marketStreamRunning);
      marketStreamToggleButton.setAttribute("aria-pressed", String(marketStreamRunning));
      marketStreamToggleButton.setAttribute(
        "aria-label",
        marketStreamRunning ? "Stop stream" : "Start stream"
      );
      marketStreamToggleButton.disabled = !DEMO_API_ENABLED
        || (!marketStreamRunning && !marketPairs.some(marketSimulationConfigured));
      syncAddClientDealMarketQuote();
      if (addHedgeDealDialog.open) {
        syncAddHedgeDealDerivedFields();
      } else {
        syncAddHedgeDealMarketQuote();
      }
    }

    function marketHistorySyncDateTimestamp(value) {
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));

      if (!match) {
        return Number.NaN;
      }

      const timestamp = Date.UTC(
        Number(match[1]),
        Number(match[2]) - 1,
        Number(match[3])
      );

      return new Date(timestamp).toISOString().slice(0, 10) === value
        ? timestamp
        : Number.NaN;
    }

    function marketHistorySyncYesterday() {
      const today = marketHistoryMoscowParts(Date.now());
      const todayTimestamp = Date.UTC(
        Number(today.year),
        Number(today.month) - 1,
        Number(today.day)
      );

      return new Date(todayTimestamp - 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);
    }

    function formatMarketHistorySyncDate(value) {
      const timestamp = marketHistorySyncDateTimestamp(value);
      return Number.isFinite(timestamp)
        ? marketHistorySyncDateFormatter.format(new Date(timestamp))
        : "";
    }

    function setMarketHistorySyncRunning(running) {
      marketHistorySyncRunning = running;
      marketHistorySyncInstrument.disabled = running || marketHistoryLoading;
      marketHistoryLoadButton.disabled = running || marketHistoryLoading;
      marketHistorySyncButtonText.textContent = running ? "Loading…" : "Load selected days";
      marketHistorySyncButton.classList.toggle("is-loading", running);
      marketHistorySyncButton.querySelector(".button-icon").textContent = running ? "progress_activity" : "download";
      marketHistorySyncProgress.setAttribute("aria-busy", String(running));
      renderMarketSourceCalendar();
    }

    function marketHistoryMoscowParts(timestamp) {
      return Object.fromEntries(
        marketHistoryInputFormatter
          .formatToParts(new Date(timestamp))
          .filter(part => part.type !== "literal")
          .map(part => [part.type, part.value])
      );
    }

    function marketHistoryMoscowTimestamp(value) {
      const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);

      if (!match) {
        return Number.NaN;
      }

      const [, year, month, day, hour, minute] = match;
      const moscowWallClock = Date.UTC(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hour),
        Number(minute),
        0
      );
      let timestamp = moscowWallClock;

      for (let attempt = 0; attempt < 2; attempt += 1) {
        const parts = marketHistoryMoscowParts(timestamp);
        const renderedAsUtc = Date.UTC(
          Number(parts.year),
          Number(parts.month) - 1,
          Number(parts.day),
          Number(parts.hour),
          Number(parts.minute),
          Number(parts.second)
        );
        timestamp = moscowWallClock - (renderedAsUtc - timestamp);
      }

      const resolved = marketHistoryMoscowParts(timestamp);

      return resolved.year === year
        && resolved.month === month
        && resolved.day === day
        && resolved.hour === hour
        && resolved.minute === minute
        ? timestamp
        : Number.NaN;
    }

    function initializeMarketHistoryPeriod() {
      if (marketHistoryFrom.value || marketHistoryTill.value) {
        return;
      }

      const moscowToday = marketHistoryMoscowParts(Date.now());
      const previousBusinessDay = new Date(Date.UTC(
        Number(moscowToday.year),
        Number(moscowToday.month) - 1,
        Number(moscowToday.day)
      ));
      previousBusinessDay.setUTCDate(previousBusinessDay.getUTCDate() - 1);

      while ([0, 6].includes(previousBusinessDay.getUTCDay())) {
        previousBusinessDay.setUTCDate(previousBusinessDay.getUTCDate() - 1);
      }

      const pad = value => String(value).padStart(2, "0");
      const businessDate = [
        previousBusinessDay.getUTCFullYear(),
        pad(previousBusinessDay.getUTCMonth() + 1),
        pad(previousBusinessDay.getUTCDate())
      ].join("-");
      marketHistoryFrom.value = `${businessDate}T10:00`;
      marketHistoryTill.value = `${businessDate}T14:00`;
    }

    function marketHistoryTimestamp(value) {
      if (typeof value === "number") {
        return value * 1000;
      }

      if (value && typeof value === "object") {
        return Date.UTC(value.year, value.month - 1, value.day);
      }

      return Number.NaN;
    }

    function formatMarketHistoryTime(value) {
      const timestamp = marketHistoryTimestamp(value);

      if (!Number.isFinite(timestamp)) {
        return "";
      }

      return marketHistoryTimeFormatter.format(new Date(timestamp));
    }

    function ensureMarketHistoryChart() {
      if (marketHistoryChart) {
        return;
      }

      const charts = window.LightweightCharts;

      if (!charts?.createChart || !charts?.CandlestickSeries) {
        throw new Error("Candlestick chart library is unavailable.");
      }

      const rootStyle = getComputedStyle(document.documentElement);
      const color = name => rootStyle.getPropertyValue(name).trim();
      marketHistoryChart = charts.createChart(marketHistoryChartEl, {
        width: Math.max(320, marketHistoryChartEl.clientWidth),
        height: 420,
        layout: {
          attributionLogo: true,
          background: {
            type: charts.ColorType.Solid,
            color: color("--bs-body-bg") || "#ffffff"
          },
          textColor: color("--bs-secondary-color") || "#6c757d"
        },
        grid: {
          vertLines: { color: color("--bs-border-color-translucent") || "#e9ecef" },
          horzLines: { color: color("--bs-border-color-translucent") || "#e9ecef" }
        },
        rightPriceScale: {
          borderColor: color("--bs-border-color") || "#dee2e6"
        },
        timeScale: {
          borderColor: color("--bs-border-color") || "#dee2e6",
          timeVisible: true,
          secondsVisible: false,
          tickMarkFormatter: formatMarketHistoryTime
        },
        localization: {
          timeFormatter: formatMarketHistoryTime
        }
      });
      marketHistorySeries = marketHistoryChart.addSeries(charts.CandlestickSeries, {
        upColor: "#198754",
        downColor: "#dc3545",
        borderUpColor: "#198754",
        borderDownColor: "#dc3545",
        wickUpColor: "#198754",
        wickDownColor: "#dc3545"
      });

      if (typeof ResizeObserver === "function") {
        marketHistoryResizeObserver = new ResizeObserver(entries => {
          const width = Math.floor(entries[0]?.contentRect?.width || 0);

          if (width > 0) {
            marketHistoryChart.applyOptions({ width });
          }
        });
        marketHistoryResizeObserver.observe(marketHistoryChartEl);
      }
    }

    function normalizedMarketHistoryCandles(candles) {
      if (!Array.isArray(candles)) {
        throw new Error("Historical market data response is invalid.");
      }

      return candles.map(candle => {
        const time = Math.floor(Date.parse(candle?.begin) / 1000);
        const open = Number(candle?.open);
        const high = Number(candle?.high);
        const low = Number(candle?.low);
        const close = Number(candle?.close);

        if (
          ![time, open, high, low, close].every(Number.isFinite)
          || high < Math.max(open, close)
          || low > Math.min(open, close)
        ) {
          throw new Error("Historical market data response is invalid.");
        }

        return { time, open, high, low, close };
      }).sort((left, right) => left.time - right.time);
    }

    function setMarketHistoryLoading(loading) {
      marketHistoryLoading = loading;
      marketHistoryLoadButton.disabled = loading || marketHistorySyncRunning;
      marketHistorySyncInstrument.disabled = loading || marketHistorySyncRunning;
      renderMarketCalendarSelection();
      marketHistoryLoadButton.textContent = loading ? "Loading…" : "Load candles";
    }

    async function loadMarketHistoryCandles(event) {
      event.preventDefault();

      if (marketHistoryLoading || !marketHistoryForm.reportValidity()) {
        return;
      }

      const fromTimestamp = marketHistoryMoscowTimestamp(marketHistoryFrom.value);
      const tillTimestamp = marketHistoryMoscowTimestamp(marketHistoryTill.value);
      const rangeMs = tillTimestamp - fromTimestamp;

      if (!Number.isFinite(rangeMs) || rangeMs <= 0) {
        setMarketStatus("From must be earlier than Till.", "warning");
        return;
      }

      if (rangeMs > 6 * 60 * 60 * 1000) {
        setMarketStatus("Historical data range must not exceed six hours.", "warning");
        return;
      }

      const payload = {
        instrumentId: marketHistoryInstrument.value,
        timeframe: marketHistoryTimeframe.value,
        from: new Date(fromTimestamp).toISOString(),
        till: new Date(tillTimestamp).toISOString()
      };

      setMarketHistoryLoading(true);
      marketHistorySummary.textContent = "Loading historical candles…";
      setMarketStatus("Requesting one historical data window from MOEX ISS…");

      try {
        const result = await demoApiRequest(
          "/api/v1/market-pulse/historical-candles/sync",
          {
            method: "POST",
            body: JSON.stringify(payload)
          }
        );
        const candles = normalizedMarketHistoryCandles(result?.candles);
        const storedMinuteCandleCount = Number(result?.storedMinuteCandleCount);

        if (!Number.isInteger(storedMinuteCandleCount) || storedMinuteCandleCount < 0) {
          throw new Error("Historical market data response is invalid.");
        }

        const timeframeLabel = result?.timeframe === "FIFTEEN_MINUTES"
          ? "15-minute"
          : "5-minute";
        ensureMarketHistoryChart();
        marketHistorySeries.setData(candles);
        marketHistoryChart.timeScale().fitContent();
        marketHistoryChartEl.setAttribute(
          "aria-label",
          `CNY/RUB ${timeframeLabel} Candlestick chart`
        );
        marketHistoryEmpty.hidden = candles.length > 0;
        marketHistoryEmpty.textContent = candles.length > 0
          ? ""
          : "MOEX ISS returned no candles for this period.";
        const candleSummary = candles.length === 1
          ? `1 ${timeframeLabel} candle loaded. Time is shown in Moscow time.`
          : `${candles.length} ${timeframeLabel} candles loaded. Time is shown in Moscow time.`;
        const storageSummary = storedMinuteCandleCount === 1
          ? "1 closed one-minute candle stored."
          : `${storedMinuteCandleCount} closed one-minute candles stored.`;
        marketHistorySummary.textContent = `${candleSummary} ${storageSummary}`;
        setMarketStatus(
          candles.length > 0
            ? "Historical market data loaded and stored successfully."
            : "No complete display candles were available for the selected period.",
          candles.length > 0 ? "success" : "warning"
        );
      } catch (error) {
        marketHistorySummary.textContent = "Historical candles could not be loaded.";
        setMarketStatus(error.message, "error");
      } finally {
        setMarketHistoryLoading(false);
      }
    }

    function renderMarketPage() {
      updateMarketVisibility();
      renderMarketCcyOptionRows();
      renderMarketPairOptionRows();
      renderMarketQuoteState();

      if (activeMarketKind() === "data-management") {
        void loadMarketSourceCalendar();
      }

      if (activeMarketKind() === "charts") {
        initializeMarketHistoryPeriod();
        window.requestAnimationFrame(() => {
          try {
            ensureMarketHistoryChart();
          } catch (error) {
            marketHistorySummary.textContent = "Candlestick chart is unavailable.";
            setMarketStatus(error.message, "error");
          }
        });
      }
    }

    async function startMarketStream() {
      if (marketStreamRunning) {
        return;
      }

      if (!DEMO_API_ENABLED) {
        setMarketStatus("Start the application with start-demo.bat to use Market Pulse Simulation.", "warning");
        return;
      }

      try {
        const snapshot = await demoApiRequest("/api/v1/market-pulse-simulation/start", { method: "POST" });
        applyMarketPulseSimulationSnapshot(snapshot);
        setMarketStatus("Market Pulse Simulation is running.", "success");
      } catch (error) {
        setMarketStatus(error.message, "error");
      }
    }

    async function stopMarketStream() {
      if (!marketStreamRunning) {
        return;
      }

      try {
        const snapshot = await demoApiRequest("/api/v1/market-pulse-simulation/stop", { method: "POST" });
        applyMarketPulseSimulationSnapshot(snapshot);
        setMarketStatus("Market Pulse Simulation was stopped successfully.", "success");
      } catch (error) {
        setMarketStatus(error.message, "error");
      }
    }

    async function toggleMarketStream() {
      if (marketStreamRunning) {
        await stopMarketStream();
      } else {
        await startMarketStream();
      }
    }

    marketQuoteTabs.forEach(tab => {
      tab.addEventListener("click", () => selectMarketQuoteTab(tab.dataset.marketQuoteTab));
      tab.addEventListener("keydown", handleMarketQuoteTabKeydown);
    });
