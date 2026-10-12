    function databaseTableSection(tableName) {
      const sectionId = DATABASE_TABLE_SECTION_ID_BY_TABLE.get(tableName) || "other";
      return DATABASE_TABLE_SECTION_BY_ID.get(sectionId);
    }

    function normalizedDatabaseTableSearch(value) {
      return String(value || "").trim().toLowerCase().replace(/[\s-]+/g, "_");
    }

    function databaseTableGroups(query = "") {
      const normalizedQuery = normalizedDatabaseTableSearch(query);
      const tablesBySection = new Map(
        DATABASE_TABLE_SECTIONS.map(section => [section.id, []])
      );

      databaseTables.forEach(table => {
        tablesBySection.get(databaseTableSection(table.tableName).id).push(table);
      });

      return DATABASE_TABLE_SECTIONS.map(section => {
        const sectionMatches = normalizedQuery
          && normalizedDatabaseTableSearch(section.label).includes(normalizedQuery);
        const tables = tablesBySection.get(section.id)
          .sort((left, right) => left.tableName.localeCompare(right.tableName))
          .filter(table => !normalizedQuery
            || sectionMatches
            || normalizedDatabaseTableSearch(table.tableName).includes(normalizedQuery));

        return { section, tables };
      }).filter(group => group.tables.length > 0);
    }

    function databaseObjectCountLabel(count) {
      return `${count} ${count === 1 ? "object" : "objects"}`;
    }

    function databaseRowCountLabel(count) {
      return `${count} ${count === 1 ? "row" : "rows"}`;
    }

    function databaseTableButtonMarkup(table) {
      const isActive = table.tableName === selectedDatabaseTable;

      return `
        <button
          type="button"
          class="database-table-button ${isActive ? "is-active" : ""}"
          data-database-table="${escapeHtml(table.tableName)}"
          ${isActive ? 'aria-current="true"' : ""}
        >
          <span class="database-table-name">${escapeHtml(table.tableName)}</span>
          <span class="database-table-meta">
            ${table.objectType === "view" ? '<span class="database-object-type">View</span>' : ""}
            <span class="database-row-count">${escapeHtml(databaseRowCountLabel(table.rowCount))}</span>
          </span>
        </button>
      `;
    }

    function renderDatabaseTableList() {
      if (databaseTables.length === 0) {
        databaseTableListEl.innerHTML = `<div class="database-empty-state">No SQLite tables found.</div>`;
        return;
      }

      const groups = databaseTableGroups(databaseTableSearchQuery);

      if (groups.length === 0) {
        databaseTableListEl.innerHTML = `
          <div class="database-empty-state">
            No tables match “${escapeHtml(databaseTableSearchQuery.trim())}”.
          </div>
        `;
        return;
      }

      databaseTableListEl.innerHTML = groups.map(({ section, tables }) => {
        const rowCount = tables.reduce((total, table) => total + Number(table.rowCount || 0), 0);
        const isOpen = Boolean(databaseTableSearchQuery.trim())
          || expandedDatabaseTableSections.has(section.id);

        return `
          <details
            class="database-table-section"
            data-database-section="${escapeHtml(section.id)}"
            ${isOpen ? "open" : ""}
          >
            <summary class="database-table-section-summary">
              <span class="button-icon database-table-section-icon${section.icon === "trade" ? " trade-icon" : ""}" aria-hidden="true">${section.icon === "trade" ? TRADE_ICON_CONTENT : escapeHtml(section.icon)}</span>
              <span class="database-table-section-name">${escapeHtml(section.label)}</span>
              <span class="database-table-section-meta">
                ${escapeHtml(databaseObjectCountLabel(tables.length))} · ${escapeHtml(databaseRowCountLabel(rowCount))}
              </span>
              <span class="button-icon database-table-section-chevron" aria-hidden="true">chevron_right</span>
            </summary>
            <div class="database-table-section-tables">
              ${tables.map(databaseTableButtonMarkup).join("")}
            </div>
          </details>
        `;
      }).join("");
    }

    function databaseCellValue(value) {
      if (value === null || value === undefined) {
        return "NULL";
      }

      return typeof value === "object" ? JSON.stringify(value) : String(value);
    }

    const DATABASE_DATA_COLUMN_PRESENTATION = Object.freeze({
      external_counterparties: Object.freeze({
        order: Object.freeze([
          "counterparty_id",
          "external_counterparty_kind",
          "counterparty_code_type",
          "counterparty_code"
        ]),
        labels: Object.freeze({
          counterparty_id: "ID",
          external_counterparty_kind: "Counterparty Type",
          counterparty_code_type: "Business ID Type",
          counterparty_code: "Business ID"
        })
      }),
      internal_units: Object.freeze({
        order: Object.freeze(["counterparty_id", "unit_type", "unit_code"]),
        labels: Object.freeze({
          counterparty_id: "ID",
          unit_type: "Unit Type",
          unit_code: "Business ID"
        })
      }),
      ui_color_tokens: Object.freeze({
        order: Object.freeze([
          "palette_family",
          "shade",
          "color_value",
          "token_code",
          "display_order",
          "updated_at"
        ]),
        labels: Object.freeze({
          palette_family: "Palette",
          shade: "Shade",
          color_value: "Color",
          token_code: "Token",
          display_order: "Order",
          updated_at: "Updated At"
        })
      })
    });
    function databaseDataColumnNames(tableName, columns) {
      const names = columns.map(column => column.name);
      const preferredOrder = DATABASE_DATA_COLUMN_PRESENTATION[tableName]?.order || [];

      return [
        ...preferredOrder.filter(columnName => names.includes(columnName)),
        ...names.filter(columnName => !preferredOrder.includes(columnName))
      ];
    }

    function databaseDataColumnHeader(tableName, columnName) {
      const label = DATABASE_DATA_COLUMN_PRESENTATION[tableName]?.labels?.[columnName] || columnName;

      if (label === columnName) {
        return escapeHtml(columnName);
      }

      return `<span data-tooltip="SQLite column: ${escapeHtml(columnName)}">${escapeHtml(label)}</span>`;
    }

    function safeDatabaseColorValue(value) {
      const colorValue = String(value || "").trim().toUpperCase();
      return /^#[0-9A-F]{6}$/.test(colorValue) ? colorValue : "#212529";
    }

    function databaseDataCellMarkup(tableName, columnName, value) {
      if (tableName === "ui_color_tokens" && columnName === "color_value") {
        const colorValue = safeDatabaseColorValue(value);

        return `
          <span class="database-color-value-cell">
            <span
              class="database-color-value-swatch"
              style="--database-token-color: ${colorValue}"
              aria-hidden="true"
            ></span>
            <span class="database-color-value-code">${escapeHtml(colorValue)}</span>
          </span>
        `;
      }

      return escapeHtml(databaseCellValue(value));
    }

    function renderDatabaseColorPalette(tableName, rows) {
      const isColorPalette = tableName === "ui_color_tokens";
      databaseColorPalettePanelEl.hidden = !isColorPalette;

      if (!isColorPalette) {
        databaseColorPaletteEl.innerHTML = "";
        return;
      }

      const rowsByFamily = new Map();

      [...rows]
        .sort((left, right) => Number(left.display_order || 0) - Number(right.display_order || 0))
        .forEach(row => {
          const family = String(row.palette_family || "OTHER");
          rowsByFamily.set(family, [...(rowsByFamily.get(family) || []), row]);
        });

      databaseColorPaletteEl.innerHTML = [...rowsByFamily.entries()]
        .map(([family, familyRows]) => `
          <section class="database-color-palette-group" aria-label="${escapeHtml(family)} palette">
            <h3 class="database-color-palette-group-title">${escapeHtml(family.replaceAll("_", " "))}</h3>
            <div class="database-color-palette-group-grid">
              ${familyRows.map(row => {
                const colorValue = safeDatabaseColorValue(row.color_value);

                return `
                  <article class="database-color-token-card">
                    <span
                      class="database-color-token-swatch"
                      style="--database-token-color: ${colorValue}"
                      aria-label="${escapeHtml(colorValue)}"
                      role="img"
                    ></span>
                    <span class="database-color-token-copy">
                      <span class="database-color-token-code">${escapeHtml(row.token_code)}</span>
                      <span class="database-color-token-value">${escapeHtml(colorValue)}</span>
                      <span class="database-color-token-shade">Shade ${escapeHtml(row.shade)}</span>
                    </span>
                  </article>
                `;
              }).join("")}
            </div>
          </section>
        `).join("");
    }

    function renderDatabaseTableDetails(details) {
      const columns = Array.isArray(details?.columns) ? details.columns : [];
      const foreignKeys = Array.isArray(details?.foreignKeys) ? details.foreignKeys : [];
      const rows = Array.isArray(details?.rows) ? details.rows : [];
      const dataColumns = databaseDataColumnNames(details.tableName, columns);

      renderDatabaseColorPalette(details.tableName, rows);
      const objectTypeLabel = details.objectType === "view" ? "View" : "Table";
      databaseTableTitleEl.textContent = `${details.tableName} · ${objectTypeLabel} · ${details.rowCount} rows`;
      databaseSchemaRowsEl.innerHTML = columns.length > 0
        ? columns.map(column => `
            <tr>
              <td>${escapeHtml(column.name)}</td>
              <td>${escapeHtml(column.type || "")}</td>
              <td>${column.notNull ? "Yes" : "No"}</td>
              <td>${column.primaryKey ? "Yes" : "No"}</td>
              <td>${escapeHtml(databaseCellValue(column.defaultValue))}</td>
            </tr>
          `).join("")
        : `<tr><td class="profile-empty" colspan="5">No columns.</td></tr>`;
      databaseForeignKeyRowsEl.innerHTML = foreignKeys.length > 0
        ? foreignKeys.map(key => `
            <tr>
              <td>${escapeHtml(key.from)}</td>
              <td>${escapeHtml(key.referencedTable)}</td>
              <td>${escapeHtml(key.referencedColumn)}</td>
              <td>${escapeHtml(key.onUpdate)}</td>
              <td>${escapeHtml(key.onDelete)}</td>
            </tr>
          `).join("")
        : `<tr><td class="profile-empty" colspan="5">No foreign keys.</td></tr>`;
      databaseDataHeadEl.innerHTML = dataColumns.length > 0
        ? `<tr>${dataColumns.map(column => `<th>${databaseDataColumnHeader(details.tableName, column)}</th>`).join("")}</tr>`
        : "";
      databaseDataRowsEl.innerHTML = rows.length > 0
        ? rows.map(row => `<tr>${dataColumns.map(column => `<td>${databaseDataCellMarkup(details.tableName, column, row[column])}</td>`).join("")}</tr>`).join("")
        : `<tr><td class="profile-empty" colspan="${Math.max(1, dataColumns.length)}">No rows.</td></tr>`;
      databaseCreateSqlEl.textContent = details.createSql || "";
      scheduleSmartColumnSizing();
    }

    function clearDatabaseTableDetails(message) {
      databaseTableTitleEl.textContent = "Database unavailable";
      databaseSchemaRowsEl.innerHTML = `<tr><td class="profile-empty" colspan="5">${escapeHtml(message)}</td></tr>`;
      databaseForeignKeyRowsEl.innerHTML = `<tr><td class="profile-empty" colspan="5">—</td></tr>`;
      databaseColorPalettePanelEl.hidden = true;
      databaseColorPaletteEl.innerHTML = "";
      databaseDataHeadEl.innerHTML = "";
      databaseDataRowsEl.innerHTML = "";
      databaseCreateSqlEl.textContent = "";
    }

    async function loadDatabaseExplorer(preferredTable = selectedDatabaseTable) {
      if (!DEMO_API_ENABLED) {
        databaseTables = [];
        selectedDatabaseTable = "";
        setDatabaseStatus(
          "Start the application with start-demo.bat to inspect SQLite.",
          "warning"
        );
        renderDatabaseTableList();
        clearDatabaseTableDetails("SQLite API is unavailable.");
        return;
      }

      databaseRefreshButton.disabled = true;
      setDatabaseStatus("Loading SQLite schema...");

      try {
        databaseTables = await demoApiRequest("/api/database/tables");
        const firstTableInDisplayOrder = databaseTableGroups()
          .flatMap(group => group.tables)[0]?.tableName || "";
        selectedDatabaseTable = databaseTables.some(table => table.tableName === preferredTable)
          ? preferredTable
          : firstTableInDisplayOrder;

        renderDatabaseTableList();

        if (selectedDatabaseTable) {
          const details = await demoApiRequest(`/api/database/tables/${encodeURIComponent(selectedDatabaseTable)}`);
          renderDatabaseTableDetails(details);
        } else {
          clearDatabaseTableDetails("No tables found.");
        }

        setDatabaseStatus(
          `data/demo.sqlite · ${databaseObjectCountLabel(databaseTables.length)}`
        );
      } catch (error) {
        setDatabaseStatus(error.message || "Unable to load the SQLite schema.", "error");
        clearDatabaseTableDetails(error.message);
      } finally {
        databaseRefreshButton.disabled = false;
      }
    }

    function positionWorkspaceNavMenu(entry) {
      if (entry.menu.hidden) {
        return;
      }

      const toggleBounds = entry.toggle.getBoundingClientRect();
      const menuWidth = entry.menu.offsetWidth;
      const left = Math.max(8, Math.min(toggleBounds.left, window.innerWidth - menuWidth - 8));

      entry.menu.style.left = `${left}px`;
      entry.menu.style.top = `${toggleBounds.bottom + 4}px`;
      positionWorkspaceNavSubgroups(entry);
    }

    function setWorkspaceNavMenuOpen(entry, open, focusFirstItem = false) {
      const nextOpen = Boolean(open);

      if (nextOpen) {
        workspaceNavMenuEntries.forEach(otherEntry => {
          if (otherEntry !== entry) {
            otherEntry.toggle.setAttribute("aria-expanded", "false");
            otherEntry.menu.hidden = true;
            closeWorkspaceNavSubgroups(otherEntry);
          }
        });
      }

      entry.toggle.setAttribute("aria-expanded", String(nextOpen));
      entry.menu.hidden = !nextOpen;

      if (!nextOpen) {
        closeWorkspaceNavSubgroups(entry);
        return;
      }

      positionWorkspaceNavMenu(entry);

      if (focusFirstItem) {
        workspaceNavMenuItems(entry)[0]?.focus();
      }
    }

    function closeWorkspaceNavMenus() {
      workspaceNavMenuEntries.forEach(entry => setWorkspaceNavMenuOpen(entry, false));
    }

    function setWorkspaceRoute(activeRoute) {
      workspaceNav.hidden = activeRoute === "home";
      closeWorkspaceNavMenus();
      workspaceNavLinks.forEach(link => {
        const routes = String(
          link.dataset.workspaceRoutes || link.dataset.workspaceRoute || ""
        ).split(/\s+/).filter(Boolean);
        const isActive = routes.includes(activeRoute);
        link.classList.toggle("is-active", isActive);

        if (isActive) {
          link.setAttribute("aria-current", "page");
        } else {
          link.removeAttribute("aria-current");
        }
      });

      workspaceNavMenuEntries.forEach(entry => {
        entry.toggle.classList.toggle("is-active", entry.routes.includes(activeRoute));
      });
      syncWorkspaceNavSubgroups(activeRoute);
      renderWorkspacePageHeading();
    }

    function positionRoute(mode = "MANUAL") {
      return `#position:${normalizedPositionManagementMode(mode).toLowerCase()}`;
    }

    function batchingBlotterRoute() {
      return positionRoute("MANUAL");
    }

    function positionModeFromLocation(hash = location.hash) {
      const match = /^#position(?::(manual|auto))?$/i.exec(String(hash || "").trim());
      return match?.[1]?.toUpperCase() === "AUTO" ? "AUTO" : "MANUAL";
    }

    function batchingHistoryRoute() {
      return "#batching:history";
    }

    function batchFormationAuditRoute() {
      return "#batching:formation-audit";
    }

    function setDealsActiveTab(activeRoute) {
      dealsTabs.forEach(tab => {
        const isActive = tab.dataset.dealsRoute === activeRoute;
        tab.classList.toggle("active", isActive);
        tab.setAttribute("aria-selected", String(isActive));
      });
    }

    function batchDetailsRoute(batchId) {
      const normalizedBatchId = Number(batchId);

      return Number.isInteger(normalizedBatchId) && normalizedBatchId > 0
        ? `#batching:details/${normalizedBatchId}`
        : batchingHistoryRoute();
    }

    function batchDetailsRouteStateFromLocation() {
      const match = /^#batching:details\/(\d+)$/.exec(location.hash);
      const batchId = match?.[1] ? Number(match[1]) : null;

      return {
        batchId: Number.isInteger(batchId) && batchId > 0 ? batchId : null
      };
    }

    function normalizedTradingCounterpartyListRoute(value) {
      const candidate = String(value || "").trim();
      const match = /^#trading-counterparties(?:\?trade-context=(\d+))?$/.exec(candidate);
      const tradeContextId = Number(match?.[1]);

      return match && (!match[1] || Number.isInteger(tradeContextId) && tradeContextId > 0)
        ? candidate
        : "#trading-counterparties";
    }

    function clientProfileRoute(counterpartyId = "", returnHash = "") {
      const routeToken = String(counterpartyId ?? "").trim();

      if (!routeToken) {
        return "#trading-counterparties";
      }

      const route = `#trading-counterparties/${encodeURIComponent(routeToken)}`;
      const normalizedReturnHash = normalizedTradingCounterpartyListRoute(returnHash);
      return normalizedReturnHash === "#trading-counterparties"
        ? route
        : `${route}?return=${encodeURIComponent(normalizedReturnHash)}`;
    }

    function normalizedPricingRulesReturnRoute(value) {
      const candidate = String(value || "").trim();

      return pricingRulesRouteStateFromLocation(candidate).matches
        ? candidate
        : pricingRulesRoute();
    }

    function pricingRuleClientProfileRoute(
      counterpartyId,
      pricingRuleId,
      returnHash = location.hash
    ) {
      const counterpartyRoute = clientProfileRoute(counterpartyId);
      const normalizedCounterpartyId = String(counterpartyId ?? "").trim();
      const normalizedPricingRuleId = String(pricingRuleId ?? "").trim();

      if (!normalizedCounterpartyId || !normalizedPricingRuleId) {
        return counterpartyRoute;
      }

      const parameters = new URLSearchParams();
      parameters.set("pricing-rule", normalizedPricingRuleId);
      parameters.set("return", normalizedPricingRulesReturnRoute(returnHash));
      return `${counterpartyRoute}?${parameters.toString()}`;
    }

    function tradingCounterpartiesForTradeContextRoute(tradeContextId) {
      const normalizedTradeContextId = Number(tradeContextId);

      if (!Number.isInteger(normalizedTradeContextId) || normalizedTradeContextId <= 0) {
        return clientProfileRoute();
      }

      const parameters = new URLSearchParams();
      parameters.set("trade-context", String(normalizedTradeContextId));
      return `#trading-counterparties?${parameters.toString()}`;
    }

    function clientProfileRouteStateFromLocation(hash = location.hash) {
      const match = /^#(?:trading-counterparties|client-profile)(?:\/([^/?#]+))?(?:\?([^#]*))?$/.exec(
        String(hash || "").trim()
      );

      if (!match) {
        return { matches: false, mode: "list", counterpartyId: "", tradeContextId: null, returnHash: pricingRoute() };
      }

      let routeToken = "";

      try {
        routeToken = match[1] ? decodeURIComponent(match[1]) : "";
      } catch (_error) {
        return { matches: false, mode: "list", counterpartyId: "", tradeContextId: null, returnHash: pricingRoute() };
      }

      const parameters = new URLSearchParams(match[2] || "");
      const tradeContextId = Number(parameters.get("trade-context"));
      const pricingRuleId = String(parameters.get("pricing-rule") || "").trim();

      if (!routeToken && Number.isInteger(tradeContextId) && tradeContextId > 0) {
        return {
          matches: true,
          mode: "list",
          counterpartyId: "",
          tradeContextId,
          returnHash: pricingRoute()
        };
      }

      if (!routeToken) {
        return { matches: true, mode: "list", counterpartyId: "", tradeContextId: null, returnHash: pricingRoute() };
      }

      if (routeToken.toLowerCase() === "new") {
        return { matches: true, mode: "create", counterpartyId: "", tradeContextId: null, returnHash: pricingRoute() };
      }

      if (pricingRuleId) {
        return {
          matches: true,
          mode: "pricing-rule",
          counterpartyId: routeToken,
          tradeContextId: null,
          pricingRuleId,
          returnHash: normalizedPricingRulesReturnRoute(parameters.get("return"))
        };
      }

      return {
        matches: true,
        mode: "detail",
        counterpartyId: routeToken,
        tradeContextId: null,
        returnHash: pricingRoute(),
        listReturnHash: normalizedTradingCounterpartyListRoute(parameters.get("return"))
      };
    }

    function usersRoute(userId = "") {
      const routeToken = String(userId ?? "").trim();

      return routeToken
        ? `#users/${encodeURIComponent(routeToken)}`
        : "#users";
    }

    function usersRouteStateFromLocation() {
      const match = /^#users(?:\/([^/?#]+))?$/.exec(location.hash);
      const routeToken = match?.[1] ? decodeURIComponent(match[1]) : "";

      if (!routeToken) {
        return { mode: "list", userId: "" };
      }

      if (routeToken.toLowerCase() === "new") {
        return { mode: "create", userId: "" };
      }

      return { mode: "detail", userId: routeToken };
    }

    function marketRoute() {
      return "#market-pulse:quote-stream";
    }

    function settingsRoute(kind = "currencies") {
      return kind === "pairs"
        ? "#settings:currency-pairs"
        : "#settings:currencies";
    }

    function currencyPairSettingsForCurrencyRoute(currencyCode) {
      const normalizedCurrencyCode = String(currencyCode || "").trim().toUpperCase();

      if (!/^[A-Z]{3}$/.test(normalizedCurrencyCode)) {
        return settingsRoute("pairs");
      }

      const parameters = new URLSearchParams();
      parameters.set("currency", normalizedCurrencyCode);
      return `${settingsRoute("pairs")}?${parameters.toString()}`;
    }

    function currencySettingsRouteStateFromLocation(hash = location.hash) {
      const source = String(hash || "").trim();
      const settingsMatch = /^#settings:(currencies|currency-pairs)(?:\?([^#]*))?$/.exec(source);
      const legacyMatch = /^#(?:market-pulse|market):(ccy-options|ccy-pair-options)(?:\?([^#]*))?$/.exec(source);
      const routeToken = settingsMatch?.[1] || legacyMatch?.[1] || "";

      if (!routeToken) {
        return { matches: false, kind: "streams", mode: "list", filter: null };
      }

      const kind = routeToken === "currency-pairs" || routeToken === "ccy-pair-options"
        ? "pairs"
        : "currencies";
      const parameters = new URLSearchParams(settingsMatch?.[2] || legacyMatch?.[2] || "");
      const currencyCode = String(parameters.get("currency") || "").trim().toUpperCase();

      if (kind === "pairs" && /^[A-Z]{3}$/.test(currencyCode)) {
        return {
          matches: true,
          kind,
          mode: "filtered",
          filter: { currencyCode }
        };
      }

      return { matches: true, kind, mode: "list", filter: null };
    }

    function normalizedCurrencyPairSettingsReturnRoute(value) {
      const candidate = String(value || "").trim();
      const routeState = currencySettingsRouteStateFromLocation(candidate);

      return routeState.matches && routeState.kind === "pairs"
        ? candidate
        : settingsRoute("pairs");
    }

    function databaseRoute() {
      return "#database";
    }

    function manualBatchFormationProcessRoute() {
      return "#processes:manual-batch-formation";
    }

    const PROCESS_CATALOG_LANGUAGE_STORAGE_KEY = "position.processCatalogLanguage";
    const PROCESS_CATALOG_COPY = Object.freeze({
      en: Object.freeze({
        pageTitle: "Process Catalog",
        manualBatching: "Manual Batching",
        goal: "Process goal:",
        selectedTrades: "Selected Trades",
        formedBatch: "Formed Batch",
        stageInput: "INPUT",
        stageDecision: "DECISION",
        stageControl: "CONTROL",
        stageDomain: "DOMAIN",
        stageCommit: "COMMIT",
        selectTrades: "Trade Selection for Batch Formation",
        resolveTenors: "Resolve Batching Key",
        tenorResolvedRequest: "Tenor-resolved request",
        validateAndPlan: "Verify Command & Selection",
        deterministicGroupPlan: "Deterministic group plan",
        formAndNeutralize: "Form & Neutralize",
        neutralBatchModel: "Neutral Batch model",
        oneDbTransaction: "ONE DB TX",
        commitAndRefresh: "Commit & Refresh",
        formedBatches: "Formed Batches",
        sameTenor: "Same Tenor",
        continueAction: "Continue",
        mixedTenors: "Mixed Batching Key",
        chooseOrSplit: "Choose one Group",
        serverTransactionFailure: "Server transaction failure",
        fullRollback: "Full rollback",
        positionUnchanged: "Position unchanged",
        stageObjective: "Stage goal:",
        executionSteps: "Execution steps",
        controlsAndFailure: "Controls & failure",
        dataArtifacts: "Data artifacts",
        artifactKind: "Kind",
        artifactNameType: "Name / type",
        artifactScope: "Scope",
        artifactPurpose: "Purpose",
        traceability: "Traceability",
        stageResult: "Stage result"
      }),
      ru: Object.freeze({
        pageTitle: "Каталог процессов",
        manualBatching: "Ручной Batching",
        goal: "Цель процесса:",
        selectedTrades: "Выбранные Trades",
        formedBatch: "Сформированный Batch",
        stageInput: "ВХОД",
        stageDecision: "РЕШЕНИЕ",
        stageControl: "КОНТРОЛЬ",
        stageDomain: "ДОМЕН",
        stageCommit: "ФИКСАЦИЯ",
        selectTrades: "Выбор Trades для создания Batch",
        resolveTenors: "Разрешить Batching Key",
        tenorResolvedRequest: "Запрос с разрешённым Tenor",
        validateAndPlan: "Проверить команду и выборку",
        deterministicGroupPlan: "Детерминированный план групп",
        formAndNeutralize: "Сформировать и нейтрализовать",
        neutralBatchModel: "Нейтральная модель Batch",
        oneDbTransaction: "ОДНА ТРАНЗАКЦИЯ БД",
        commitAndRefresh: "Зафиксировать и обновить",
        formedBatches: "Сформированные Batches",
        sameTenor: "Один Tenor",
        continueAction: "Продолжить",
        mixedTenors: "Разные Batching Key",
        chooseOrSplit: "Выбрать одну группу",
        serverTransactionFailure: "Ошибка серверной транзакции",
        fullRollback: "Полный откат",
        positionUnchanged: "Position не изменена",
        stageObjective: "Цель этапа:",
        executionSteps: "Шаги выполнения",
        controlsAndFailure: "Проверки и ошибки",
        dataArtifacts: "Данные этапа",
        artifactKind: "Вид",
        artifactNameType: "Имя / тип",
        artifactScope: "Область",
        artifactPurpose: "Назначение",
        traceability: "Трассируемость",
        stageResult: "Результат этапа"
      }),
      aria: Object.freeze({
        en: Object.freeze({
          pageHeader: "Processes header",
          languageSwitch: "Process Catalog language",
          catalog: "Process catalog",
          processes: "Processes",
          processGoal: "Process goal",
          processMap: "Manual Batching process map",
          tenorOutcomes: "Tenor decision outcomes",
          stageSpecification: "Selected process phase specification"
        }),
        ru: Object.freeze({
          pageHeader: "Заголовок каталога процессов",
          languageSwitch: "Язык каталога процессов",
          catalog: "Каталог процессов",
          processes: "Процессы",
          processGoal: "Цель процесса",
          processMap: "Схема процесса «Ручной Batching»",
          tenorOutcomes: "Варианты разрешения Tenor",
          stageSpecification: "Описание выбранного этапа процесса"
        })
      })
    });
