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
              <span class="button-icon database-table-section-icon" aria-hidden="true">${escapeHtml(section.icon)}</span>
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
    }

    function setWorkspaceNavMenuOpen(entry, open, focusFirstItem = false) {
      const nextOpen = Boolean(open);

      if (nextOpen) {
        workspaceNavMenuEntries.forEach(otherEntry => {
          if (otherEntry !== entry) {
            otherEntry.toggle.setAttribute("aria-expanded", "false");
            otherEntry.menu.hidden = true;
          }
        });
      }

      entry.toggle.setAttribute("aria-expanded", String(nextOpen));
      entry.menu.hidden = !nextOpen;

      if (!nextOpen) {
        return;
      }

      positionWorkspaceNavMenu(entry);

      if (focusFirstItem) {
        entry.links[0]?.focus();
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
    }

    function fxPositionRoute(mode = "MANUAL") {
      return `#fx-position:${normalizedPositionManagementMode(mode).toLowerCase()}`;
    }

    function batchingBlotterRoute() {
      return fxPositionRoute("MANUAL");
    }

    function fxPositionModeFromLocation(hash = location.hash) {
      const match = /^#fx-position(?::(manual|auto))?$/i.exec(String(hash || "").trim());
      return match?.[1]?.toUpperCase() === "AUTO" ? "AUTO" : "MANUAL";
    }

    function batchingHistoryRoute() {
      return "#batching:history";
    }

    function batchFormationAuditRoute() {
      return "#batching:formation-audit";
    }

    function setFxDealsActiveTab(activeRoute) {
      fxDealsTabs.forEach(tab => {
        const isActive = tab.dataset.fxDealsRoute === activeRoute;
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

    function clientProfileRoute(counterpartyId = "") {
      const routeToken = String(counterpartyId ?? "").trim();

      return routeToken
        ? `#trading-counterparties/${encodeURIComponent(routeToken)}`
        : "#trading-counterparties";
    }

    function normalizedPricingContextReturnRoute(value) {
      const candidate = String(value || "").trim();

      return pricingRouteStateFromLocation(candidate).matches ? candidate : pricingRoute();
    }

    function tradingCounterpartiesForExecutionContextRoute(executionContextId, returnHash = location.hash) {
      const normalizedExecutionContextId = Number(executionContextId);

      if (!Number.isInteger(normalizedExecutionContextId) || normalizedExecutionContextId <= 0) {
        return clientProfileRoute();
      }

      const parameters = new URLSearchParams();
      parameters.set("execution-context", String(normalizedExecutionContextId));
      parameters.set("return", normalizedPricingContextReturnRoute(returnHash));
      return `#trading-counterparties?${parameters.toString()}`;
    }

    function clientProfileRouteStateFromLocation(hash = location.hash) {
      const match = /^#(?:trading-counterparties|client-profile)(?:\/([^/?#]+))?(?:\?([^#]*))?$/.exec(
        String(hash || "").trim()
      );

      if (!match) {
        return { matches: false, mode: "list", counterpartyId: "", executionContextId: null, returnHash: pricingRoute() };
      }

      let routeToken = "";

      try {
        routeToken = match[1] ? decodeURIComponent(match[1]) : "";
      } catch (_error) {
        return { matches: false, mode: "list", counterpartyId: "", executionContextId: null, returnHash: pricingRoute() };
      }

      const parameters = new URLSearchParams(match[2] || "");
      const executionContextId = Number(parameters.get("execution-context"));

      if (!routeToken && Number.isInteger(executionContextId) && executionContextId > 0) {
        return {
          matches: true,
          mode: "related",
          counterpartyId: "",
          executionContextId,
          returnHash: normalizedPricingContextReturnRoute(parameters.get("return"))
        };
      }

      if (!routeToken) {
        return { matches: true, mode: "list", counterpartyId: "", executionContextId: null, returnHash: pricingRoute() };
      }

      if (routeToken.toLowerCase() === "new") {
        return { matches: true, mode: "create", counterpartyId: "", executionContextId: null, returnHash: pricingRoute() };
      }

      return { matches: true, mode: "detail", counterpartyId: routeToken, executionContextId: null, returnHash: pricingRoute() };
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
      return "#market-pulse";
    }

    function settingsRoute(kind = "currencies") {
      return kind === "pairs"
        ? "#settings:currency-pairs"
        : "#settings:currencies";
    }

    function normalizedCurrencySettingsReturnRoute(value) {
      const candidate = String(value || "").trim();

      return /^(?:#settings:currencies|#(?:market-pulse|market):ccy-options)$/.test(candidate)
        ? candidate
        : settingsRoute("currencies");
    }

    function currencyPairSettingsForCurrencyRoute(currencyCode, returnHash = location.hash) {
      const normalizedCurrencyCode = String(currencyCode || "").trim().toUpperCase();

      if (!/^[A-Z]{3}$/.test(normalizedCurrencyCode)) {
        return settingsRoute("pairs");
      }

      const parameters = new URLSearchParams();
      parameters.set("currency", normalizedCurrencyCode);
      parameters.set("return", normalizedCurrencySettingsReturnRoute(returnHash));
      return `${settingsRoute("pairs")}?${parameters.toString()}`;
    }

    function currencySettingsRouteStateFromLocation(hash = location.hash) {
      const source = String(hash || "").trim();
      const settingsMatch = /^#settings:(currencies|currency-pairs)(?:\?([^#]*))?$/.exec(source);
      const legacyMatch = /^#(?:market-pulse|market):(ccy-options|ccy-pair-options)(?:\?([^#]*))?$/.exec(source);
      const routeToken = settingsMatch?.[1] || legacyMatch?.[1] || "";

      if (!routeToken) {
        return { matches: false, kind: "streams", mode: "list", scope: null };
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
          mode: "related",
          scope: {
            currencyCode,
            returnHash: normalizedCurrencySettingsReturnRoute(parameters.get("return"))
          }
        };
      }

      return { matches: true, kind, mode: "list", scope: null };
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

    function domainGlossaryRoute(termKey = "") {
      return termKey
        ? `#processes:domain-glossary/${encodeURIComponent(termKey)}`
        : "#processes:domain-glossary";
    }

    const PROCESS_CATALOG_GLOSSARY_TERM_KEYS = new Set([
      "auto-hedging",
      "auto-hedging-admission",
      "execution-context-admission-mode",
      "auto-hedging-admission-policy",
      "eligibility-check",
      "admission-state",
      "ccy-pair",
      "fx-batch",
      "batching",
      "market-pulse",
      "fx-trade",
      "client-deal",
      "hedge-deal",
      "fx-position",
      "execution-context",
      "servicing-location",
      "accounting-system",
      "execution-system",
      "pricing-mode",
      "transfer-rate",
      "base-currency",
      "quote-currency",
      "trade-date",
      "tenor",
      "value-date",
      "batching-key",
      "cross-tenor-batching",
      "batch-internal-swap"
    ]);

    function domainGlossaryTermFromRoute() {
      const routePrefix = `${domainGlossaryRoute()}/`;
      if (!location.hash.startsWith(routePrefix)) {
        return null;
      }
      try {
        const termKey = decodeURIComponent(location.hash.slice(routePrefix.length));
        return PROCESS_CATALOG_GLOSSARY_TERM_KEYS.has(termKey) ? termKey : null;
      } catch (_error) {
        return null;
      }
    }

    const PROCESS_CATALOG_LANGUAGE_STORAGE_KEY = "position.processCatalogLanguage";
    const PROCESS_CATALOG_COPY = Object.freeze({
      en: Object.freeze({
        pageTitle: "Process Catalog",
        manualBatching: "Manual Batching",
        autoHedgingDefinition: "An automated FX risk-management process that monitors open currency exposure and applies configured algorithms and controls to keep currency risk within approved limits.",
        autoHedgingAdmissionDefinition: "The domain decision boundary that determines whether an FX Trade remains held under manual control or may be released to Auto Hedging.",
        executionContextAdmissionModeDefinition: "A mandatory Execution Context setting that defines the permitted admission path for its FX Trades.",
        autoHedgingAdmissionPolicyDefinition: "The complete set of mandatory rules that combines the Execution Context Admission Mode with configured Eligibility Checks to decide the Admission State.",
        eligibilityCheckDefinition: "A safety condition evaluated from FX Trade, reference, or market data to determine eligibility for Auto Hedging. Every applicable check must pass before release.",
        ccyPairDefinition: "An ordered pair of currencies defining the Base Currency and Quote Currency used to express an FX Trade amount and exchange rate.",
        automationAdmissionStateDefinition: "Shows whether a specific FX Trade is currently held for manual control or released to Auto Hedging.",
        domainGlossary: "Domain Glossary",
        domainGlossarySubtitle: "Core terms used across documented processes",
        goal: "Process goal:",
        definitions: "Core definitions",
        fxBatchDefinition: "A fixed package of FX Trades compatible by Batching Key—Client Deals, Hedge Deals, and technical FX Trades—whose aggregate open currency position is zero. After formation, its members are excluded from the active FX Position view, which organizes trades and simplifies control of the current currency position.",
        batchingTerm: "Batching",
        marketPulseDefinition: "An application module that provides current normalized market quotes (Bid and Offer) for currency pairs to pricing, validation, and risk-management processes. In the current demo, quotes are generated by a simulator; the domain concept is independent of the data source and may later use real market-data feeds.",
        batchingDefinition: "A manual or automatic process that selects, validates, groups and neutralizes FX Trades compatible by Batching Key to form one or more FX Batches. A user selects FX Trades for Manual Batching; configured rules select them for Automatic Batching.",
        fxTradeDefinition: "A Client Deal, Hedge Deal, or technical FX transaction included in currency-position calculations and displayed in FX Position.",
        clientDealDefinition: "An FX Trade executed with a client and forming the client component of the currency position.",
        hedgeDealDefinition: "An FX Trade executed with a hedge counterparty to manage or neutralize the currency position.",
        fxPositionDefinition: "Application interface for monitoring the currency position and performing operations with FX Trades, including Batching.",
        executionContextDefinition: "A configuration context that determines how an FX Trade is processed for pricing, position management, and other applicable processes. In the current demo, it is defined by the combination of Servicing Location, Accounting System (when applicable), and Execution System.",
        servicingLocationDefinition: "The organizational and geographic point at which an FX Trade is serviced, such as a branch or head office in a particular region.",
        accountingSystemDefinition: "An internal system of record of a bank or financial institution in which an FX Trade and its related accounting entries are registered.",
        executionSystemDefinition: "The system or execution channel in which an FX Trade is actually executed. Its Pricing Mode describes how the execution price is produced or approved.",
        pricingModeDefinition: "An Execution System attribute describing how the execution price is produced or approved: AUTO_PRICED means automatic pricing, DEALER_PRICED means the dealer sets the price, and DEALER_APPROVED means a system-proposed price requires dealer approval.",
        transferRateDefinition: "An internal accounting rate of an FX Trade used to calculate its currency position and allocate analytical P&L. Historically, it was the rate at which a Client Deal was transferred from the Sales book to the book of the desk managing and hedging the position. In the current application no trade is actually transferred between books or systems; the industry term is retained for the internal calculation rate.",
        baseCurrencyDefinition: "The first currency in a currency pair; its amount forms the base currency leg of an FX Trade.",
        quoteCurrencyDefinition: "The second currency in a currency pair, in which the value of the Base Currency is expressed.",
        tradeDateDefinition: "The date on which an FX Trade is executed; Tenor and Value Dates are determined relative to it.",
        tenorDefinition: "The standard settlement term of an FX Trade relative to Trade Date. The current model uses TOD, TOM and SPOT.",
        valueDateDefinition: "The settlement date for one currency leg of an FX Trade. Base Currency Value Date and Quote Currency Value Date are determined separately.",
        batchingKeyDefinition: "A composite compatibility key that determines whether FX Trades may be included in one FX Batch. It always includes the currency pair, Trade Date, and both currency precisions. When Cross-Tenor Batching is disabled, it also includes Tenor and both Value Dates. When Cross-Tenor Batching is enabled, these parameters may differ because the trades are aligned to a common Tenor using a Batch Internal Swap.",
        crossTenorBatchingDefinition: "A Batching mode that allows compatible FX Trades with different Tenors and Value Dates to be included in one FX Batch. Before formation, their settlement terms are aligned to a common Tenor using a Batch Internal Swap.",
        batchInternalSwapDefinition: "An internal technical entity of an FX Batch that aligns FX Trades with different settlement profiles to a common Tenor. It is not a standalone market trade; resulting positions are aggregated across FX Batches and offset by a single net swap at the end of the accounting day.",
        selectedFxTrades: "Selected FX Trades",
        formedFxBatch: "Formed FX Batch",
        stageInput: "INPUT",
        stageDecision: "DECISION",
        stageControl: "CONTROL",
        stageDomain: "DOMAIN",
        stageCommit: "COMMIT",
        selectFxTrades: "FX Trade Selection for FX Batch Formation",
        resolveTenors: "Resolve Batching Key",
        tenorResolvedRequest: "Tenor-resolved request",
        validateAndPlan: "Verify Command & Selection",
        deterministicGroupPlan: "Deterministic group plan",
        formAndNeutralize: "Form & Neutralize",
        neutralBatchModel: "Neutral FX Batch model",
        oneDbTransaction: "ONE DB TX",
        commitAndRefresh: "Commit & Refresh",
        formedBatches: "Formed FX Batches",
        sameTenor: "Same Tenor",
        continueAction: "Continue",
        mixedTenors: "Mixed Batching Key",
        chooseOrSplit: "Choose one Group",
        serverTransactionFailure: "Server transaction failure",
        fullRollback: "Full rollback",
        fxPositionUnchanged: "FX Position unchanged",
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
        transferRateDefinition: "\u0412\u043d\u0443\u0442\u0440\u0435\u043d\u043d\u0438\u0439 \u0443\u0447\u0451\u0442\u043d\u044b\u0439 \u043a\u0443\u0440\u0441 FX Trade, \u0438\u0441\u043f\u043e\u043b\u044c\u0437\u0443\u0435\u043c\u044b\u0439 \u0434\u043b\u044f \u0440\u0430\u0441\u0447\u0451\u0442\u0430 \u0432\u0430\u043b\u044e\u0442\u043d\u043e\u0439 \u043f\u043e\u0437\u0438\u0446\u0438\u0438 \u0438 \u0440\u0430\u0441\u043f\u0440\u0435\u0434\u0435\u043b\u0435\u043d\u0438\u044f \u0430\u043d\u0430\u043b\u0438\u0442\u0438\u0447\u0435\u0441\u043a\u043e\u0433\u043e \u0434\u043e\u0445\u043e\u0434\u0430. \u0418\u0441\u0442\u043e\u0440\u0438\u0447\u0435\u0441\u043a\u0438 \u043f\u043e \u044d\u0442\u043e\u043c\u0443 \u043a\u0443\u0440\u0441\u0443 \u043a\u043b\u0438\u0435\u043d\u0442\u0441\u043a\u0430\u044f \u0441\u0434\u0435\u043b\u043a\u0430 \u043f\u0435\u0440\u0435\u0434\u0430\u0432\u0430\u043b\u0430\u0441\u044c \u0438\u0437 \u043a\u043d\u0438\u0433\u0438 Sales \u0432 \u043a\u043d\u0438\u0433\u0443 \u043f\u043e\u0434\u0440\u0430\u0437\u0434\u0435\u043b\u0435\u043d\u0438\u044f, \u0443\u043f\u0440\u0430\u0432\u043b\u044f\u044e\u0449\u0435\u0433\u043e \u0438 \u043f\u0435\u0440\u0435\u043a\u0440\u044b\u0432\u0430\u044e\u0449\u0435\u0433\u043e \u043f\u043e\u0437\u0438\u0446\u0438\u044e. \u0412 \u0442\u0435\u043a\u0443\u0449\u0435\u043c \u043f\u0440\u0438\u043b\u043e\u0436\u0435\u043d\u0438\u0438 \u0444\u0430\u043a\u0442\u0438\u0447\u0435\u0441\u043a\u043e\u0439 \u043f\u0435\u0440\u0435\u0434\u0430\u0447\u0438 \u043c\u0435\u0436\u0434\u0443 \u043a\u043d\u0438\u0433\u0430\u043c\u0438 \u0438\u043b\u0438 \u0441\u0438\u0441\u0442\u0435\u043c\u0430\u043c\u0438 \u043d\u0435\u0442; \u043e\u0442\u0440\u0430\u0441\u043b\u0435\u0432\u043e\u0439 \u0442\u0435\u0440\u043c\u0438\u043d \u0441\u043e\u0445\u0440\u0430\u043d\u044f\u0435\u0442\u0441\u044f \u0434\u043b\u044f \u043e\u0431\u043e\u0437\u043d\u0430\u0447\u0435\u043d\u0438\u044f \u0432\u043d\u0443\u0442\u0440\u0435\u043d\u043d\u0435\u0433\u043e \u0440\u0430\u0441\u0447\u0451\u0442\u043d\u043e\u0433\u043e \u043a\u0443\u0440\u0441\u0430.",
        pageTitle: "Каталог процессов",
        manualBatching: "Ручной Batching",
        autoHedgingDefinition: "Автоматизированный процесс управления валютным риском, который контролирует открытую валютную позицию и применяет настроенные алгоритмы и ограничения для удержания валютного риска в утверждённых пределах.",
        autoHedgingAdmissionDefinition: "Доменная граница принятия решения, определяющая, остаётся ли FX Trade под ручным контролем или может быть допущена к Auto Hedging.",
        executionContextAdmissionModeDefinition: "Обязательная настройка Execution Context, определяющая допустимый путь допуска связанных с ним FX Trades.",
        autoHedgingAdmissionPolicyDefinition: "Полный набор обязательных правил, объединяющий Execution Context Admission Mode с настроенными Eligibility Checks для определения Admission State.",
        eligibilityCheckDefinition: "Условие безопасности, проверяемое по данным FX Trade, справочным или рыночным данным для определения возможности участия в Auto Hedging. Перед допуском должны быть пройдены все применимые проверки.",
        ccyPairDefinition: "Упорядоченная пара валют, определяющая Base Currency и Quote Currency, в которых выражаются сумма и обменный курс FX Trade.",
        automationAdmissionStateDefinition: "Показывает, удерживается ли конкретная FX Trade для ручного контроля или уже допущена к Auto Hedging.",
        domainGlossary: "Domain Glossary",
        domainGlossarySubtitle: "Основные термины, используемые в описаниях процессов",
        goal: "Цель процесса:",
        definitions: "Основные определения",
        fxBatchDefinition: "Зафиксированный пакет совместимых по Batching Key FX Trades — Client Deals, Hedge Deals и технических FX Trades, — совокупная ОВП которых равна нулю. После формирования участники пакета исключаются из активного представления FX Position, что систематизирует сделки и упрощает контроль текущей валютной позиции.",
        marketPulseDefinition: "Модуль приложения, предоставляющий текущие нормализованные рыночные котировки (Bid и Offer) по валютным парам для ценообразования, проверок и процессов управления риском. В текущей демонстрационной реализации котировки формируются симулятором; доменное понятие не зависит от источника данных и в дальнейшем может использовать реальные потоки рыночных данных.",
        batchingTerm: "Batching",
        batchingDefinition: "Ручной или автоматический процесс выбора, проверки, группировки и нейтрализации совместимых по Batching Key FX Trades, результатом которого становится один или несколько FX Batches. При ручном Batching FX Trades выбирает пользователь, при автоматическом — система по настроенным правилам.",
        fxTradeDefinition: "Client Deal, Hedge Deal или техническая FX Trade, учитываемая при расчёте валютной позиции и отображаемая в FX Position.",
        clientDealDefinition: "FX Trade, заключённый с клиентом и формирующий клиентскую часть валютной позиции.",
        hedgeDealDefinition: "FX Trade, заключённый с хеджирующим контрагентом для управления или нейтрализации валютной позиции.",
        fxPositionDefinition: "Интерфейс приложения для контроля валютной позиции и выполнения операций с FX Trades, в том числе для выполнения Batching.",
        executionContextDefinition: "Конфигурационный контекст, определяющий обработку FX Trade в части ценообразования, управления позицией и других применимых процессов. В текущей демо-реализации он задаётся сочетанием Servicing Location, Accounting System (когда применимо) и Execution System.",
        servicingLocationDefinition: "Организационная и географическая точка обслуживания FX Trade, например филиал или головной офис в определённом регионе.",
        accountingSystemDefinition: "Внутренняя учётная система банка или финансовой организации, в которой регистрируются FX Trade и связанные с ней бухгалтерские проводки.",
        executionSystemDefinition: "Система или канал исполнения, в котором непосредственно заключается FX Trade. Её Pricing Mode определяет способ формирования или подтверждения цены исполнения.",
        pricingModeDefinition: "Атрибут Execution System, определяющий способ формирования или подтверждения цены исполнения: AUTO_PRICED — автоматическое ценообразование, DEALER_PRICED — цену устанавливает дилер, DEALER_APPROVED — предложенная системой цена требует подтверждения дилером.",
        baseCurrencyDefinition: "Первая валюта в валютной паре; её сумма образует базовую валютную часть FX Trade.",
        quoteCurrencyDefinition: "Вторая валюта в валютной паре; в ней выражается стоимость Base Currency.",
        tradeDateDefinition: "Дата заключения FX Trade, относительно которой определяется Tenor и рассчитываются Value Dates.",
        tenorDefinition: "Стандартное обозначение срока расчётов по FX Trade относительно Trade Date. В текущей модели используются TOD, TOM и SPOT.",
        valueDateDefinition: "Дата расчётов по одной из валют FX Trade. Для каждого FX Trade отдельно определяются Base Currency Value Date и Quote Currency Value Date.",
        batchingKeyDefinition: "Составной ключ совместимости FX Trades, определяющий возможность их включения в один FX Batch. Он всегда включает валютную пару, Trade Date и точность обеих валют. При отключённом Cross-Tenor Batching ключ также включает Tenor и обе Value Dates. При включённом Cross-Tenor Batching эти параметры могут различаться, поскольку сделки приводятся к общему Tenor с помощью Batch Internal Swap.",
        crossTenorBatchingDefinition: "Режим Batching, позволяющий включать в один FX Batch совместимые FX Trades с различающимися Tenor и Value Dates. Перед формированием FX Batch их расчётные сроки приводятся к общему Tenor с помощью Batch Internal Swap.",
        batchInternalSwapDefinition: "Внутренняя техническая сущность FX Batch, приводящая FX Trades с разными расчётными сроками к общему Tenor. Она не является отдельной рыночной сделкой; позиции по всем таким сущностям агрегируются и перекрываются одним нетто-свопом в конце учётного дня.",
        selectedFxTrades: "Выбранные FX Trades",
        formedFxBatch: "Сформированный FX Batch",
        stageInput: "ВХОД",
        stageDecision: "РЕШЕНИЕ",
        stageControl: "КОНТРОЛЬ",
        stageDomain: "ДОМЕН",
        stageCommit: "ФИКСАЦИЯ",
        selectFxTrades: "Выбор FX Trades для создания FX Batch",
        resolveTenors: "Разрешить Batching Key",
        tenorResolvedRequest: "Запрос с разрешённым Tenor",
        validateAndPlan: "Проверить команду и выборку",
        deterministicGroupPlan: "Детерминированный план групп",
        formAndNeutralize: "Сформировать и нейтрализовать",
        neutralBatchModel: "Нейтральная модель FX Batch",
        oneDbTransaction: "ОДНА ТРАНЗАКЦИЯ БД",
        commitAndRefresh: "Зафиксировать и обновить",
        formedBatches: "Сформированные FX Batches",
        sameTenor: "Один Tenor",
        continueAction: "Продолжить",
        mixedTenors: "Разные Batching Key",
        chooseOrSplit: "Выбрать одну группу",
        serverTransactionFailure: "Ошибка серверной транзакции",
        fullRollback: "Полный откат",
        fxPositionUnchanged: "FX Position не изменена",
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
