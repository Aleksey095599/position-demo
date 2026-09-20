    function batchingHistoryActionFormatter(cell) {
      const batch = cell.getRow().getData();
      const rollbackAllowed = batch.batchStatus === "FORMED";

      return `
        <div class="batching-history-actions">
          <button type="button"
            class="btn btn-sm btn-outline-secondary batching-history-action"
            data-batching-history-action="view"
            aria-label="View Batch Structure for batch ${escapeHtml(batch.batchId)}">
            <span class="button-icon" aria-hidden="true">visibility</span>
          </button>
          <button type="button"
            class="btn btn-sm btn-outline-secondary batching-history-action"
            data-batching-history-action="rollback"
            aria-label="Rollback batch ${escapeHtml(batch.batchId)}"
            ${rollbackAllowed ? "" : "disabled"}>
            <span class="button-icon" aria-hidden="true">undo</span>
          </button>
        </div>
      `;
    }

    function closeBatchRollbackDialog() {
      rollbackBatchId = null;
      batchRollbackStatus.textContent = "";
      batchRollbackStatus.hidden = true;
      batchRollbackConfirmButton.disabled = false;
      batchRollbackCancelButton.disabled = false;

      if (typeof batchRollbackDialog.close === "function") {
        batchRollbackDialog.close();
      } else {
        batchRollbackDialog.removeAttribute("open");
      }
    }

    function openBatchRollbackDialog(batch) {
      if (!batch || batch.batchStatus !== "FORMED") {
        return;
      }

      rollbackBatchId = batch.batchId;
      batchRollbackSummary.textContent =
        `Batch #${batch.batchId} (${batch.ccyPairCode}) will be ROLLED_BACK. `
        + "Its source trades and Batch Balance Trade, if present, will return to Position.";
      batchRollbackStatus.textContent = "";
      batchRollbackStatus.hidden = true;

      openDialogWithoutFieldFocus(batchRollbackDialog);
    }

    async function confirmBatchRollback() {
      if (!Number.isInteger(rollbackBatchId) || rollbackBatchId <= 0) {
        return;
      }

      const batchId = rollbackBatchId;
      batchRollbackConfirmButton.disabled = true;
      batchRollbackCancelButton.disabled = true;
      batchRollbackStatus.textContent = "Rolling back batch...";
      batchRollbackStatus.className = "alert alert-secondary batch-rollback-status";
      batchRollbackStatus.hidden = false;

      try {
        await demoApiRequest(
          `/api/v1/batches/${encodeURIComponent(batchId)}/rollback`,
          { method: "POST" }
        );
        await Promise.all([
          reloadBatchesFromApi(),
          reloadPositionsFromApi()
        ]);
        selectedTradeIds.clear();
        render(positions);
        closeBatchRollbackDialog();
        setBatchingHistoryStatus(
          `Batch ${batchId} was rolled back successfully. Its source trades were returned to Position.`,
          "success"
        );
      } catch (error) {
        batchRollbackStatus.textContent =
          error.message || `Unable to roll back Batch ${batchId}.`;
        batchRollbackStatus.className = "alert alert-danger batch-rollback-status";
        batchRollbackStatus.hidden = false;
        batchRollbackConfirmButton.disabled = false;
        batchRollbackCancelButton.disabled = false;
      }
    }

    function updateBatchingHistoryCount(filteredCount = batchHistory.length) {
      const total = batchHistory.length;
      const label = total === 1 ? "batch" : "batches";
      batchingHistoryCountEl.textContent = filteredCount === total
        ? `${total} ${label}`
        : `${filteredCount} of ${total} batches`;
    }

    function batchesAuditViewEnabled() {
      return batchesViewMode === BATCHES_VIEW_MODE_AUDIT;
    }

    function syncBatchesAuditToggle() {
      batchesAuditViewToggle.checked = batchesAuditViewEnabled();
    }

    function applyBatchesViewMode() {
      const auditFields = [
        "batchingKey",
        "windowOpenedAt",
        "windowClosedAt",
        "windowDurationMs",
        "sourceTradeCount"
      ];

      auditFields.forEach(field => {
        const column = batchingHistoryGrid?.getColumn(field);

        if (batchesAuditViewEnabled()) {
          column?.show();
        } else {
          column?.hide();
        }
      });

      batchingHistoryGrid?.redraw(true);
      syncBatchesAuditToggle();
    }

    function setBatchesViewMode(mode) {
      batchesViewMode = mode === BATCHES_VIEW_MODE_AUDIT
        ? BATCHES_VIEW_MODE_AUDIT
        : BATCHES_VIEW_MODE_STANDARD;
      applyBatchesViewMode();
    }

    function initializeBatchingHistoryGrid(data) {
      batchingHistoryGrid = new Tabulator(batchingHistoryGridEl, {
        data,
        index: "batchId",
        layout: "fitDataTable",
        renderVertical: "virtual",
        renderVerticalBuffer: 240,
        maxHeight: "calc(100vh - var(--workspace-nav-height) - 170px)",
        placeholder: "No Batches have been formed.",
        movableColumns: false,
        resizableColumns: false,
        headerFilterLiveFilterDelay: 250,
        initialSort: [{ column: "batchId", dir: "desc" }],
        columnDefaults: {
          resizable: false,
          vertAlign: "middle",
          tooltip: tabulatorCellOverflowTooltip,
          headerTooltip: tabulatorHeaderOverflowTooltip,
          headerSort: false
        },
        columns: uiTableColumns("batching_history_grid", [
          tabulatorSizedColumn("primaryId", {
            title: "Batch ID",
            field: "batchId",
            sorter: "number",
            headerSort: true,
            headerFilter: "input"
          }),
          tabulatorSizedColumn("pair", {
            title: "Ccy Pair Code",
            field: "ccyPairCode",
            headerFilter: "input",
            formatter: cell => escapeHtml(String(cell.getValue() || "").replace("_", "/"))
          }),
          tabulatorSizedColumn("tradeContext", {
            title: "Batching Key",
            field: "batchingKey",
            visible: batchesAuditViewEnabled(),
            headerFilter: "input",
            headerFilterFunc: batchFormationAuditBatchingKeyFilter,
            formatter: batchFormationAuditBatchingKeyFormatter
          }),
          tabulatorSizedColumn("timestamp", {
            title: "Window Opened At",
            field: "windowOpenedAt",
            visible: batchesAuditViewEnabled(),
            headerFilter: "input",
            formatter: batchFormationAuditTimestampFormatter
          }),
          tabulatorSizedColumn("timestamp", {
            title: "Window Closed At",
            field: "windowClosedAt",
            visible: batchesAuditViewEnabled(),
            headerFilter: "input",
            formatter: batchFormationAuditTimestampFormatter
          }),
          tabulatorSizedColumn("amount", {
            title: "Duration",
            field: "windowDurationMs",
            visible: batchesAuditViewEnabled(),
            sorter: "number",
            headerFilter: "input",
            formatter: batchFormationAuditDurationFormatter,
            hozAlign: "right",
            headerHozAlign: "right"
          }),
          tabulatorSizedColumn("type", {
            title: "Batch Status",
            field: "batchStatus",
            headerFilter: batchingHistoryStatusHeaderFilter,
            headerFilterFunc: "=",
            formatter: batchingHistoryStatusFormatter
          }),
          tabulatorSizedColumn("name", {
            title: "Formation Reason",
            field: "formationReasonCode",
            headerFilter: batchingHistoryReasonHeaderFilter,
            headerFilterFunc: "=",
            formatter: batchFormationAuditReasonFormatter,
            cssClass: "text-nowrap"
          }),
          tabulatorSizedColumn("timestamp", {
            title: "Formed At",
            field: "formedAt",
            headerFilter: "input"
          }),
          tabulatorSizedColumn("count", {
            title: "Source Trades",
            field: "sourceTradeCount",
            visible: batchesAuditViewEnabled(),
            sorter: "number",
            headerFilter: "input",
            hozAlign: "right",
            headerHozAlign: "right"
          }),
          tabulatorSizedColumn("actions", {
            title: "Actions",
            field: "actions",
            hozAlign: "center",
            headerHozAlign: "center",
            formatter: batchingHistoryActionFormatter,
            cellClick(event, cell) {
              const actionButton = event.target.closest(
                "[data-batching-history-action]"
              );

              if (!actionButton) {
                return;
              }

              const batch = cell.getRow().getData();

              if (actionButton.dataset.batchingHistoryAction === "view") {
                location.hash = batchDetailsRoute(batch.batchId);
              } else if (
                actionButton.dataset.batchingHistoryAction === "rollback"
                && !actionButton.disabled
              ) {
                openBatchRollbackDialog(batch);
              }
            }
          })
        ])
      });
      registerUiTableTabulator("batching_history_grid", batchingHistoryGrid);

      batchingHistoryGrid.on("tableBuilt", () => {
        batchingHistoryGridReady = true;
        updateBatchingHistoryCount(data.length);
        applyBatchesViewMode();
      });
      batchingHistoryGrid.on("dataFiltered", (_filters, rows) => {
        updateBatchingHistoryCount(rows.length);
      });
    }

    function renderBatchingHistory(source = batchHistory) {
      const data = Array.isArray(source) ? source : [];
      updateBatchingHistoryCount(data.length);

      if (!batchingHistoryGrid) {
        if (!batchingHistoryPage.hidden) {
          initializeBatchingHistoryGrid(data);
        }
        return;
      }

      if (!batchingHistoryGridReady) {
        return;
      }

      batchingHistoryGrid.replaceData(data).then(() => {
        batchingHistoryGrid.redraw(true);
      });
    }

    async function loadBatchingHistoryPage() {
      if (!DEMO_API_ENABLED) {
        setBatchingHistoryStatus(
          "Start the demo server to view Batches.",
          "warning"
        );
        renderBatchingHistory([]);
        return;
      }

      setBatchingHistoryStatus("Loading Batches...");

      try {
        await reloadBatchesFromApi();
        setBatchingHistoryStatus();
      } catch (error) {
        setBatchingHistoryStatus(
          error.message || "Unable to load Batches.",
          "error"
        );
      }
    }

    function batchFormationAuditBatchingKeySearchText(value) {
      const key = value && typeof value === "object" ? value : {};

      return [
        key.ccyPairCode,
        String(key.ccyPairCode || "").replace("_", "/"),
        key.tradeDate,
        key.tenor,
        key.baseCcyValueDate,
        key.quoteCcyValueDate,
        key.baseCcyFractionDigits,
        key.quoteCcyFractionDigits
      ].join(" ").toLowerCase();
    }

    function batchFormationAuditBatchingKeyFormatter(cell) {
      const key = cell.getValue() && typeof cell.getValue() === "object"
        ? cell.getValue()
        : {};
      const pair = String(key.ccyPairCode || "").replace("_", "/") || "—";
      const tenor = String(key.tenor || "").trim() || "—";
      const tradeDate = clientDealsDateLabel(key.tradeDate) || "—";
      const baseValueDate = clientDealsDateLabel(key.baseCcyValueDate) || "—";
      const quoteValueDate = clientDealsDateLabel(key.quoteCcyValueDate) || "—";
      const basePrecision = Number.isInteger(key.baseCcyFractionDigits)
        ? key.baseCcyFractionDigits
        : "—";
      const quotePrecision = Number.isInteger(key.quoteCcyFractionDigits)
        ? key.quoteCcyFractionDigits
        : "—";
      const tooltip = `${pair} · Trade ${tradeDate} · ${tenor} · `
        + `Value ${baseValueDate} / ${quoteValueDate} · Precision ${basePrecision} / ${quotePrecision}`;

      return `
        <div class="batching-key-cell" data-tooltip="${escapeHtml(tooltip)}">
          <span class="batching-key-primary">${escapeHtml(pair)} · ${escapeHtml(tenor)} · Trade ${escapeHtml(tradeDate)}</span>
          <span class="batching-key-secondary">Value ${escapeHtml(baseValueDate)} / ${escapeHtml(quoteValueDate)} · Precision ${escapeHtml(basePrecision)} / ${escapeHtml(quotePrecision)}</span>
        </div>
      `;
    }

    function batchFormationAuditBatchingKeyFilter(headerValue, rowValue) {
      const query = String(headerValue || "").trim().toLowerCase();

      return !query || batchFormationAuditBatchingKeySearchText(rowValue).includes(query);
    }

    function batchFormationAuditTimestampFormatter(cell) {
      const value = String(cell.getValue() || "").trim();
      return value ? escapeHtml(batchDetailsTimestampLabel(value)) : "&mdash;";
    }

    function batchFormationAuditDurationLabel(value) {
      if (value === null || value === undefined || value === "") {
        return "—";
      }

      const milliseconds = Number(value);

      if (!Number.isFinite(milliseconds) || milliseconds < 0) {
        return "—";
      }

      if (milliseconds < 1000) {
        return `${milliseconds} ms`;
      }

      const totalSeconds = milliseconds / 1000;

      if (totalSeconds < 60) {
        const seconds = totalSeconds.toFixed(milliseconds % 1000 === 0 ? 0 : 3)
          .replace(/\.?0+$/, "");
        return `${seconds} sec`;
      }

      const minutes = Math.floor(totalSeconds / 60);
      const seconds = Math.floor(totalSeconds % 60);
      return seconds > 0 ? `${minutes} min ${seconds} sec` : `${minutes} min`;
    }

    function batchFormationAuditDurationFormatter(cell) {
      return escapeHtml(batchFormationAuditDurationLabel(cell.getValue()));
    }

    function batchFormationAuditReasonFormatter(cell) {
      const record = cell.getRow().getData();
      return `<span data-tooltip="${escapeHtml(record.formationReasonDescription)}">${escapeHtml(cell.getValue())}</span>`;
    }

    function batchDetailsRoleFormatter(cell) {
      return escapeHtml(
        String(cell.getValue() || "").trim().replaceAll("_", " ")
      );
    }

    function batchStructureTradeIdFormatter(cell) {
      const tradeId = Number(cell.getValue());

      return Number.isInteger(tradeId) && tradeId > 0
        ? escapeHtml(tradeId)
        : "&mdash;";
    }

    function batchStructureTradeTypeFormatter(cell) {
      const trade = cell.getRow().getData();
      const presentation = positionTradeTypePresentation(trade);
      const originBatchId = Number(trade.createdByBatchId);
      const reusedTechnicalTrade = trade.memberRole === "TRADE"
        && ["BATCH_BALANCE_TRADE", "BATCH_POSITION_OUT"].includes(
          presentation.type
        )
        && Number.isInteger(originBatchId)
        && originBatchId > 0;
      const origin = reusedTechnicalTrade
        ? `
          <span aria-hidden="true">&middot;</span>
          <a class="batch-details-origin-link" href="${batchDetailsRoute(originBatchId)}">
            Batch #${escapeHtml(originBatchId)}
          </a>
        `
        : "";

      return `
        <span class="batch-structure-trade-type">
          <span class="position-trade-type-chip" aria-hidden="true">
            <span class="button-icon position-trade-type-icon">${escapeHtml(presentation.icon)}</span>
          </span>
          <span class="batch-structure-trade-label">${escapeHtml(presentation.label)}</span>
          ${origin}
        </span>
      `;
    }

    function batchStructureLegFormatter(cell, formatterParams = {}) {
      const contributionMinor = Number(cell.getValue());
      const rowComponent = typeof cell.getRow === "function"
        ? cell.getRow()
        : null;
      const currentRow = rowComponent && typeof rowComponent.getData === "function"
        ? rowComponent.getData()
        : {};
      const firstTrade = cell.getTable().getData()[0] || {};
      const row = Number.isInteger(
        Number(currentRow[formatterParams.fractionDigitsField])
      )
        ? currentRow
        : firstTrade;
      const fractionDigits = Number(row[formatterParams.fractionDigitsField]);
      const currencyCode = String(
        row[formatterParams.currencyField] || ""
      ).trim().toUpperCase();

      if (
        !Number.isSafeInteger(contributionMinor)
        || !Number.isInteger(fractionDigits)
        || fractionDigits < 0
        || fractionDigits > 10
      ) {
        return "";
      }

      const sign = contributionMinor > 0 ? "+" : "";
      const amount = formattedMinorAmount(
        contributionMinor.toString(),
        fractionDigits
      );

      return escapeHtml(`${sign}${amount}${currencyCode ? ` ${currencyCode}` : ""}`);
    }

    function batchStructureLegColumn({
      title,
      field,
      fractionDigitsField,
      currencyField,
      isMemberTable
    }) {
      const formatterParams = {
        fractionDigitsField,
        currencyField
      };

      return tabulatorSizedColumn("positionAmount", {
        title,
        field,
        sorter: "number",
        headerSort: isMemberTable,
        formatter: batchStructureLegFormatter,
        formatterParams,
        hozAlign: "right",
        headerHozAlign: "right",
        ...(isMemberTable
          ? {
              bottomCalc: "sum",
              bottomCalcFormatter: batchStructureLegFormatter,
              bottomCalcFormatterParams: formatterParams
            }
          : {})
      });
    }

    function batchStructureAnalyticalPnlFormatter(cell) {
      const pnlSource = cell.getValue();

      if (pnlSource === null || pnlSource === undefined || pnlSource === "") {
        return "";
      }

      const pnlMinor = Number(pnlSource);
      const rowComponent = typeof cell.getRow === "function"
        ? cell.getRow()
        : null;
      const currentRow = rowComponent && typeof rowComponent.getData === "function"
        ? rowComponent.getData()
        : {};
      const referenceTrade = cell.getTable().getData().find(trade => {
        const fractionDigits = Number(
          trade.analyticalPnlQuoteFractionDigits
        );

        return Number.isInteger(fractionDigits)
          && fractionDigits >= 0
          && fractionDigits <= 10;
      }) || {};
      const currentFractionDigits = currentRow.analyticalPnlQuoteFractionDigits;
      const row = currentFractionDigits !== null
        && currentFractionDigits !== undefined
        && currentFractionDigits !== ""
        && Number.isInteger(Number(currentFractionDigits))
        ? currentRow
        : referenceTrade;
      const fractionDigits = Number(row.analyticalPnlQuoteFractionDigits);
      const quoteCcyCode = String(row.quoteCcyCode || "").trim().toUpperCase();

      if (
        !Number.isSafeInteger(pnlMinor)
        || !Number.isInteger(fractionDigits)
        || fractionDigits < 0
        || fractionDigits > 10
      ) {
        return "";
      }

      const formattedValue = formattedMinorAmount(
        pnlMinor.toString(),
        fractionDigits
      );
      const sign = pnlMinor > 0 ? "+" : "";
      const tone = pnlMinor < 0 ? " text-danger" : "";

      return `<span class="${tone.trim()}">${escapeHtml(
        `${sign}${formattedValue}${quoteCcyCode ? ` ${quoteCcyCode}` : ""}`
      )}</span>`;
    }

    function batchStructureSignedMinorLabel(
      value,
      fractionDigits,
      currencyCode
    ) {
      const minorValue = Number(value);
      const digits = Number(fractionDigits);
      const code = String(currencyCode || "").trim().toUpperCase();

      if (
        !Number.isSafeInteger(minorValue)
        || !Number.isInteger(digits)
        || digits < 0
        || digits > 10
      ) {
        return "—";
      }

      const sign = minorValue > 0 ? "+" : "";

      return `${sign}${formattedMinorAmount(
        minorValue.toString(),
        digits
      )}${code ? ` ${code}` : ""}`;
    }

    function batchStructureCashOutputColumns() {
      return [
        tabulatorSizedColumn("code", {
          title: "Currency",
          field: "currencyCode"
        }),
        tabulatorSizedColumn("positionAmount", {
          title: "Cash Leg",
          field: "balanceContributionMinor",
          sorter: "number",
          formatter: batchStructureLegFormatter,
          formatterParams: {
            fractionDigitsField: "fractionDigits",
            currencyField: "currencyCode"
          },
          hozAlign: "right",
          headerHozAlign: "right"
        }),
        tabulatorSizedColumn("valueDate", {
          title: "Value Date",
          field: "valueDate",
          formatter: clientDealsDateFormatter,
          hozAlign: "center",
          headerHozAlign: "center"
        })
      ];
    }

    function batchStructureTradeColumns(roleField) {
      const isMemberTable = roleField === "memberRole";
      const memberTextFilter = isMemberTable
        ? {
            headerFilter: "input",
            headerFilterFunc: "like"
          }
        : {};
      const columns = [
        tabulatorSizedColumn("referenceId", {
          title: "Trade ID",
          field: "tradeId",
          sorter: "number",
          headerSort: isMemberTable,
          ...memberTextFilter,
          formatter: batchStructureTradeIdFormatter,
          ...(isMemberTable
            ? {
                bottomCalc: () => "NET",
                bottomCalcFormatter: batchDetailsRoleFormatter
              }
            : {})
        }),
        tabulatorSizedColumn("tradeSummary", {
          title: "Trade Type",
          field: "tradeType",
          headerSort: isMemberTable,
          ...memberTextFilter,
          formatter: batchStructureTradeTypeFormatter
        }),
        tabulatorSizedColumn("type", {
          title: roleField === "memberRole" ? "Member Role" : "Output Role",
          field: "memberRole",
          headerSort: isMemberTable,
          ...memberTextFilter,
          formatter: batchDetailsRoleFormatter
        })
      ];

      columns.push(
        batchStructureLegColumn({
          title: "Base Ccy Leg",
          field: "baseBalanceContributionMinor",
          fractionDigitsField: "baseCcyFractionDigits",
          currencyField: "baseCcyCode",
          isMemberTable
        }),
        batchStructureLegColumn({
          title: "Quote Ccy Leg",
          field: "quoteBalanceContributionMinor",
          fractionDigitsField: "quoteCcyFractionDigits",
          currencyField: "quoteCcyCode",
          isMemberTable
        }),
        tabulatorSizedColumn("rate", {
          title: "Trade Rate",
          field: "tradeRate",
          sorter: "number",
          headerSort: isMemberTable,
          formatter: clientDealsRateFormatter,
          hozAlign: "right",
          headerHozAlign: "right"
        }),
        tabulatorSizedColumn("transferRate", {
          title: "Transfer Rate",
          field: "transferRate",
          sorter: "number",
          headerSort: isMemberTable,
          formatter: clientDealsRateFormatter,
          hozAlign: "right",
          headerHozAlign: "right"
        }),
        tabulatorSizedColumn("positionAmount", {
          title: "Analytical PnL",
          field: "analyticalPnlQuoteMinor",
          sorter: "number",
          headerSort: isMemberTable,
          formatter: batchStructureAnalyticalPnlFormatter,
          hozAlign: "right",
          headerHozAlign: "right",
          ...(isMemberTable
            ? {
                bottomCalc: "sum",
                bottomCalcFormatter: batchStructureAnalyticalPnlFormatter
              }
            : {})
        }),
        tabulatorSizedColumn("valueDate", {
          title: "Base Ccy Value Date",
          field: "baseCcyValueDate",
          headerSort: false,
          ...memberTextFilter,
          formatter: clientDealsDateFormatter,
          hozAlign: "center",
          headerHozAlign: "center"
        }),
        tabulatorSizedColumn("valueDate", {
          title: "Quote Ccy Value Date",
          field: "quoteCcyValueDate",
          headerSort: false,
          ...memberTextFilter,
          formatter: clientDealsDateFormatter,
          hozAlign: "center",
          headerHozAlign: "center"
        })
      );

      return columns;
    }

    function batchStructureTradeRows(trades, roleField) {
      return (Array.isArray(trades) ? trades : []).map(trade => ({
        ...trade,
        memberRole: trade?.[roleField] || ""
      }));
    }

    function initializeBatchDetailsGrid(tableKey, element, data, columns, placeholder) {
      const supportsTradeIdSorting = columns.some(column =>
        column.field === "tradeId" && column.headerSort === true
      );

      const table = new Tabulator(element, {
        data,
        index: "batchContentKey",
        layout: "fitDataTable",
        renderVertical: "basic",
        placeholder,
        movableColumns: false,
        resizableColumns: false,
        headerFilterLiveFilterDelay: 300,
        initialSort: supportsTradeIdSorting
          ? [{ column: "tradeId", dir: "asc" }]
          : [],
        columnHeaderVertAlign: "bottom",
        columnDefaults: {
          resizable: false,
          vertAlign: "middle",
          tooltip: tabulatorCellOverflowTooltip,
          headerTooltip: tabulatorHeaderOverflowTooltip,
          headerSort: false
        },
        columns: uiTableColumns(tableKey, columns)
      });
      registerUiTableTabulator(tableKey, table);
      return table;
    }

    function batchDetailsTimestampLabel(value) {
      const timestamp = new Date(String(value || "").trim());

      if (!Number.isFinite(timestamp.getTime())) {
        return "—";
      }

      const twoDigits = number => String(number).padStart(2, "0");

      return `${twoDigits(timestamp.getDate())}.${twoDigits(timestamp.getMonth() + 1)}.${timestamp.getFullYear()} `
        + `${twoDigits(timestamp.getHours())}:${twoDigits(timestamp.getMinutes())}:${twoDigits(timestamp.getSeconds())}`;
    }

    function setBatchDetailsStatus(message = "", kind = "info") {
      setWorkbenchPageStatus(batchDetailsStatusEl, message, kind);
      batchDetailsStatusEl.hidden = !message;
    }

    function showBatchDetailsPrompt(title, copy) {
      batchDetailsContent.hidden = true;
      batchDetailsPromptTitle.textContent = title;
      batchDetailsPromptCopy.textContent = copy;
      batchDetailsPrompt.hidden = false;
    }

    function renderBatchNeutrality(details) {
      const members = Array.isArray(details.members) ? details.members : [];
      const positionOutput = Array.isArray(details.outputs)
        ? details.outputs[0] || null
        : null;
      const cashOutput = details.cashOutput || null;
      const referenceTrade = members[0] || positionOutput || {};
      const baseNetMinor = members.reduce(
        (sum, trade) => sum + Number(trade.baseBalanceContributionMinor || 0),
        0
      );
      const quoteNetMinor = members.reduce(
        (sum, trade) => sum + Number(trade.quoteBalanceContributionMinor || 0),
        0
      );
      const cashQuoteMinor = cashOutput
        ? Number(cashOutput.balanceContributionMinor)
        : 0;
      const positionNeutral = Number.isSafeInteger(baseNetMinor)
        && baseNetMinor === 0;
      const cashNeutral = Boolean(cashOutput)
        && Number.isSafeInteger(quoteNetMinor)
        && Number.isSafeInteger(cashQuoteMinor)
        && quoteNetMinor + cashQuoteMinor === 0;
      const neutralBatch = positionNeutral && cashNeutral;

      batchNeutralityDetails.open = false;
      batchNeutralitySummaryStatus.classList.toggle("is-invalid", !neutralBatch);
      batchNeutralitySummaryStatusIcon.textContent = neutralBatch
        ? "check_circle"
        : "error";
      batchNeutralitySummaryStatusText.textContent = neutralBatch
        ? "Neutral Batch"
        : "Neutrality Exception";

      batchNeutralityMembersBase.textContent = batchStructureSignedMinorLabel(
        baseNetMinor,
        referenceTrade.baseCcyFractionDigits,
        referenceTrade.baseCcyCode
      );
      batchNeutralityMembersQuote.textContent = batchStructureSignedMinorLabel(
        quoteNetMinor,
        referenceTrade.quoteCcyFractionDigits,
        referenceTrade.quoteCcyCode
      );
      batchNeutralityCashQuote.textContent = cashOutput
        ? batchStructureSignedMinorLabel(
            cashQuoteMinor,
            cashOutput.fractionDigits,
            cashOutput.currencyCode
          )
        : "Missing";
      batchNeutralityPositionStatus.textContent = positionNeutral
        ? "Position Neutral"
        : "Position Imbalance";
      batchNeutralityCashStatus.textContent = cashNeutral
        ? "Cash Balance Neutral"
        : "Cash Balance Imbalance";
      batchNeutralityResult.classList.toggle(
        "is-invalid",
        !neutralBatch
      );

    }

    function renderBatchDetailsGrids(details) {
      const memberRows = batchStructureTradeRows(details.members, "memberRole");

      if (!batchDetailsMembersGrid) {
        batchDetailsMembersGrid = initializeBatchDetailsGrid(
          "batch_members_grid",
          batchDetailsMembersGridEl,
          memberRows,
          batchStructureTradeColumns("memberRole"),
          "This Batch has no members."
        );
      } else {
        batchDetailsMembersGrid.replaceData(memberRows).then(() => {
          batchDetailsMembersGrid.redraw(true);
        });
      }

      const cashOutputs = details.cashOutput ? [details.cashOutput] : [];
      const hasCashOutput = cashOutputs.length > 0;
      batchDetailsCashOutputEmpty.hidden = hasCashOutput;
      batchDetailsCashOutputGridShell.hidden = !hasCashOutput;

      if (hasCashOutput && !batchDetailsCashOutputGrid) {
        batchDetailsCashOutputGrid = initializeBatchDetailsGrid(
          "batch_cash_output_grid",
          batchDetailsCashOutputGridEl,
          cashOutputs,
          batchStructureCashOutputColumns(),
          "This batch has no quote cash outputs."
        );
      } else if (batchDetailsCashOutputGrid) {
        batchDetailsCashOutputGrid.replaceData(cashOutputs).then(() => {
          if (hasCashOutput) {
            batchDetailsCashOutputGrid.redraw(true);
          }
        });
      }

      const hasOutputs = details.outputs.length > 0;
      const outputRows = batchStructureTradeRows(details.outputs, "outputRole");
      batchDetailsOutputsEmpty.hidden = hasOutputs;
      batchDetailsOutputsGridShell.hidden = !hasOutputs;

      if (hasOutputs && !batchDetailsOutputsGrid) {
        batchDetailsOutputsGrid = initializeBatchDetailsGrid(
          "batch_members_grid",
          batchDetailsOutputsGridEl,
          outputRows,
          batchStructureTradeColumns("outputRole"),
          "This batch has no position outputs."
        );
      } else if (batchDetailsOutputsGrid) {
        batchDetailsOutputsGrid.replaceData(outputRows).then(() => {
          if (hasOutputs) {
            batchDetailsOutputsGrid.redraw(true);
          }
        });
      }

    }

    function renderBatchDetails(details) {
      const status = String(details.batchStatus || "").toUpperCase();
      const statusTone = status === "FORMED"
        ? " is-formed"
        : status === "ROLLED_BACK"
          ? " is-rolled-back"
          : "";
      const batchingKey = details.batchingKey || {};

      batchDetailsSummaryTitle.textContent = `Batch #${details.batchId}`;
      batchDetailsBatchStatus.textContent = status;
      batchDetailsBatchStatus.className = `batch-status-token${statusTone}`;
      batchDetailsCurrencyPair.textContent =
        details.currencyPair || details.ccyPairCode || "—";
      batchDetailsFormedAt.textContent = batchDetailsTimestampLabel(details.formedAt);
      batchDetailsRolledBackAt.textContent = details.rolledBackAt
        ? batchDetailsTimestampLabel(details.rolledBackAt)
        : "—";
      batchDetailsTradeDate.textContent = batchingKey.tradeDate
        ? clientDealsDateLabel(batchingKey.tradeDate)
        : "—";
      batchDetailsTenor.textContent = batchingKey.tenor || "—";
      batchDetailsBaseValueDate.textContent = batchingKey.baseCcyValueDate
        ? clientDealsDateLabel(batchingKey.baseCcyValueDate)
        : "—";
      batchDetailsQuoteValueDate.textContent = batchingKey.quoteCcyValueDate
        ? clientDealsDateLabel(batchingKey.quoteCcyValueDate)
        : "—";
      batchDetailsMembersCount.textContent =
        `${details.members.length} ${details.members.length === 1 ? "trade" : "trades"}`;
      batchDetailsCashOutputCount.textContent = details.cashOutput
        ? "1 output"
        : "0 outputs";
      batchDetailsOutputsCount.textContent =
        `${details.outputs.length} ${details.outputs.length === 1 ? "trade" : "trades"}`;
      batchDetailsPrompt.hidden = true;
      batchDetailsContent.hidden = false;
      setBatchDetailsStatus("");
      renderBatchNeutrality(details);
      renderBatchDetailsGrids(details);
    }

    async function loadSelectedBatchDetails(batchId) {
      const requestSequence = ++batchDetailsRequestSequence;
      showBatchDetailsPrompt(
        `Loading Batch #${batchId}`,
        "Reading Batch Members and batch outputs..."
      );
      setBatchDetailsStatus(`Loading Batch #${batchId}...`);

      try {
        const details = await loadBatchDetailsFromApi(batchId);

        if (
          requestSequence !== batchDetailsRequestSequence
          || batchDetailsRouteStateFromLocation().batchId !== batchId
        ) {
          return;
        }

        renderBatchDetails(details);
      } catch (error) {
        if (requestSequence !== batchDetailsRequestSequence) {
          return;
        }

        const message = error.message || `Unable to load Batch ${batchId}.`;
        showBatchDetailsPrompt(`Batch #${batchId} is unavailable`, message);
        setBatchDetailsStatus(message, "error");
      }
    }

    async function loadBatchDetailsPage() {
      const { batchId } = batchDetailsRouteStateFromLocation();

      if (!batchId) {
        location.hash = batchingHistoryRoute();
        return;
      }

      if (!DEMO_API_ENABLED) {
        showBatchDetailsPrompt(
          "Demo server is unavailable",
          "Batch Structure requires the SQLite demo server."
        );
        setBatchDetailsStatus("Start the demo server to view Batch Structure.", "warning");
        return;
      }

      await loadSelectedBatchDetails(batchId);
    }
