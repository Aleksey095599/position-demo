    function marketGridActionMarkup(action, icon, label, { danger = false, primary = false, disabled = false } = {}) {
      const variant = danger ? "btn-outline-danger" : primary ? "btn-outline-primary" : "btn-outline-secondary";
      const tooltipAttribute = ["edit", "delete", "simulation"].includes(action)
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
      editing = false
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
      const wrapperTooltip = disabled
        ? ` tabindex="0" data-tooltip="${escapeHtml(tooltip)}"`
        : "";
      const buttonTooltip = disabled ? "" : ` data-tooltip="${escapeHtml(tooltip)}"`;

      return `
        <span class="reference-related-view-control"${wrapperTooltip}>
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
        Boolean(item.isEditing)
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
        .filter(({ pair }) => !marketSettingsRouteScope
          || pair.baseCcy === marketSettingsRouteScope.currencyCode
          || pair.quoteCcy === marketSettingsRouteScope.currencyCode)
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

      if (!marketSettingsRouteScope && marketPairOptionsEditState?.mode === "create") {
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
            title: tabulatorIconColumnTitle("rule", "Pricing Rules using this Ccy Pair"),
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
            visible: !marketSettingsRouteScope,
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
          syncMarketPairActionsColumn();
          marketPairOptionGrid.redraw(true);
        });
      } else if (marketPairOptionGridReady) {
        marketPairOptionGrid.replaceData(data);
        syncMarketPairActionsColumn();
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
        Boolean(item.isEditing)
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

    function syncDealMarketQuotes() {
      if (!editForm?.elements?.currentMarketBid) {
        return null;
      }

      const quote = currentMarketQuoteForPair(editForm.elements.currencyPair.value);
      const pair = marketPairs.find(item => item.currencyPair === normalizedPricingRuleCurrencyPair(editForm.elements.currencyPair.value));
      editForm.elements.currentMarketBid.value = quote ? formatMarketQuote(quote.bid, pair) : "";
      editForm.elements.currentMarketOffer.value = quote ? formatMarketQuote(quote.offer, pair) : "";
      editForm.elements.currentMarketStatus.value = !DEMO_API_ENABLED
        ? "Backend unavailable"
        : !marketSimulationConfigured(pair)
          ? "Not configured"
          : !marketStreamConnected
            ? "Connecting"
            : marketStreamRunning ? "Live" : "Stopped";

      return quote;
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
            title: "Actions",
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
      syncDealMarketQuotes();
      syncAddClientDealMarketQuote();
      if (addHedgeDealDialog.open) {
        syncAddHedgeDealDerivedFields();
      } else {
        syncAddHedgeDealMarketQuote();
      }
    }

    function renderMarketPage() {
      updateMarketVisibility();
      renderMarketCcyOptionRows();
      renderMarketPairOptionRows();
      renderMarketQuoteState();
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
