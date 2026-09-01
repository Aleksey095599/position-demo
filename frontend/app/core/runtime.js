    const DEMO_API_BOOTSTRAP = window.__DEMO_API_BOOTSTRAP__ && typeof window.__DEMO_API_BOOTSTRAP__ === "object"
      ? window.__DEMO_API_BOOTSTRAP__
      : null;
    const DEMO_API_ENABLED = DEMO_API_BOOTSTRAP?.available === true;
    const UI_TABLE_COLUMN_WIDTH_MIN_PX = 48;
    const UI_TABLE_COLUMN_WIDTH_MAX_PX = 1600;
    const UI_TABLE_LAYOUT_COLUMN_ALIASES = Object.freeze({
      external_counterparties_grid: Object.freeze({ status: "active" }),
      internal_units_grid: Object.freeze({ status: "active" }),
      users_grid: Object.freeze({ status: "active" }),
      batching_history_grid: Object.freeze({
        formation_reason: "formation_reason_code",
        created_at: "formed_at"
      }),
      pricing_rules_grid: Object.freeze({
        position_management_mode: "auto_hedging_admission"
      }),
      internal_pricing_rules_grid: Object.freeze({
        position_management_mode: "auto_hedging_admission"
      })
    });
    const UI_TABLE_LAYOUT_BOOTSTRAP = Array.isArray(DEMO_API_BOOTSTRAP?.uiTableLayouts)
      ? DEMO_API_BOOTSTRAP.uiTableLayouts
      : [];
    const CLIENT_DEAL_GENERATION_REFRESH_INTERVAL_MS = 1000;
    const FX_AUTO_BATCHING_REFRESH_INTERVAL_MS = 1000;
    const DEFAULT_MARKET_PAIRS = DemoDb.defaults.marketPairs;
    const DEFAULT_CCY_OPTIONS = DemoDb.defaults.ccyOptions;
    const DEFAULT_QUOTE_DECIMALS = 4;
    const MAX_DEFAULT_QUOTE_DECIMALS = 8;
    const DEFAULT_MARKET_ONE_WAY_DURATION_SECONDS = 60;
    const MIN_MARKET_ONE_WAY_DURATION_SECONDS = 5;
    const MAX_MARKET_ONE_WAY_DURATION_SECONDS = 3600;
    const DEFAULT_MARKET_FLUCTUATION_SPREADS = 3;
    const MAX_MARKET_FLUCTUATION_SPREADS = 10;
    Big.DP = 40;
    Big.RM = Big.roundHalfUp;

    function dialogInitialFocusTarget(dialog) {
      const labelledBy = String(dialog?.getAttribute("aria-labelledby") || "").trim();
      const labelledElement = labelledBy ? document.getElementById(labelledBy) : null;

      return labelledElement
        || dialog?.querySelector(".modal-title, .dialog-title, h1, h2, h3")
        || dialog;
    }

    function focusDialogWithoutEditableControl(dialog) {
      const target = dialogInitialFocusTarget(dialog);

      if (!target) {
        return;
      }

      if (!target.hasAttribute("tabindex")) {
        target.setAttribute("tabindex", "-1");
      }

      target.focus({ preventScroll: true });
    }

    function openDialogWithoutFieldFocus(dialog) {
      if (typeof dialog?.showModal === "function") {
        dialog.showModal();
      } else {
        dialog?.setAttribute("open", "");
      }

      focusDialogWithoutEditableControl(dialog);
    }

    const COUNTERPARTY_ROLES = ["CLIENT", "HEDGE_COUNTERPARTY"];
    const COUNTERPARTY_SCOPES = ["EXTERNAL", "INTERNAL"];
    const EXTERNAL_COUNTERPARTY_CODE_TYPES = ["INN", "OTHER"];
    const EXTERNAL_COUNTERPARTY_KINDS = [
      "CORPORATE",
      "INDIVIDUAL",
      "BANK",
      "NON_BANK_FINANCIAL_INSTITUTION",
      "OTHER"
    ];
    const EXTERNAL_COUNTERPARTY_KIND_LABELS = {
      CORPORATE: "Corporate",
      INDIVIDUAL: "Individual",
      BANK: "Bank",
      NON_BANK_FINANCIAL_INSTITUTION: "Financial Institution",
      OTHER: "Other"
    };
    const INTERNAL_UNIT_TYPES = ["DESK", "DEPARTMENT", "OTHER"];
    const COUNTERPARTY_CODE_TYPES = [...EXTERNAL_COUNTERPARTY_CODE_TYPES, "INTERNAL_UNIT_CODE", "FRONT_SYSTEM_FOLDER_ID"];
    const DEFAULT_CLIENT_PROFILES = DemoDb.defaults.clientProfiles;
    const USER_ROLES = ["DEALER", "SUPERVISOR", "ADMIN"];
    const DEFAULT_USERS = DemoDb.defaults.users;
    const DEFAULT_SERVICING_BRANCHES = DemoDb.defaults.servicingBranches;
    const DEFAULT_SETTLEMENT_SYSTEMS = DemoDb.defaults.settlementSystems;
    const DEFAULT_TRADE_CAPTURE_CHANNELS = DemoDb.defaults.tradeCaptureChannels;
    const LEGACY_DEALER_ASSISTED_CHANNEL_ID = "DEALER_ASSISTED";
    const LEGACY_CREATE_CLIENT_DEAL_CHANNEL_ID = "CREATE_CLIENT_DEAL";
    const MANUAL_CLIENT_DEAL_ENTRY_CHANNEL_ID = "MANUAL_CLIENT_DEAL_ENTRY";
    const NOT_APPLICABLE_ACCOUNTING_SYSTEM_ID = "NOT_APPLICABLE";
    const PRICING_TYPES = ["AUTO_PRICED", "DEALER_PRICED", "DEALER_APPROVED"];
    const POSITION_MANAGEMENT_MODES = Object.freeze(["MANUAL", "AUTO"]);
    const POSITION_MANAGEMENT_MODE_LABELS = Object.freeze({
      MANUAL: "Manual Control",
      AUTO: "Auto Hedging"
    });
    const AUTO_HEDGING_ADMISSION_MODES = Object.freeze(["AUTO_IF_ELIGIBLE", "REVIEW_REQUIRED", "MANUAL_ONLY"]);
    const AUTO_HEDGING_ADMISSION_MODE_LABELS = Object.freeze({
      AUTO_IF_ELIGIBLE: "Auto if eligible",
      REVIEW_REQUIRED: "Review required",
      MANUAL_ONLY: "Manual only"
    });
    const HEDGE_DEAL_PRICING_MODES = ["AUTO_PRICED", "DEALER_PRICED"];
    const PRICING_TYPE_PRESENTATION = Object.freeze({
      AUTO_PRICED: Object.freeze({
        label: "Auto Priced",
        icon: "flash_auto",
        tone: "auto-priced"
      }),
      DEALER_PRICED: Object.freeze({
        label: "Dealer Priced",
        icon: "contact_phone",
        tone: "dealer-priced"
      }),
      DEALER_APPROVED: Object.freeze({
        label: "Dealer Approved",
        icon: "verified",
        tone: "dealer-approved"
      }),
      MANUAL_PRICING: Object.freeze({
        label: "Manual Pricing",
        icon: "price_change",
        tone: "manual-pricing"
      })
    });
    const CLIENT_ONBOARDING_MANUAL_PRICING = "CLIENT_ONBOARDING";
    const SERVICING_LOCATION_TYPES = ["BRANCH", "HEAD_OFFICE"];
    const DEFAULT_PRICING_CONTEXTS = DemoDb.defaults.pricingContexts;
    const DEFAULT_CLIENT_PRICING_RULES = DemoDb.defaults.clientPricingRules;
    const PRICING_CONTEXT_FACETS = [
      {
        field: "servicingBranchCode",
        inputName: "contextServicingLocation",
        menuId: "clientPricingLocationMenu",
        label: "Servicing Location",
        icon: "location_on"
      },
      {
        field: "settlementSystemId",
        inputName: "contextAccountingSystem",
        menuId: "clientPricingAccountingMenu",
        label: "Accounting System",
        icon: "account_balance"
      },
      {
        field: "tradeCaptureChannelId",
        inputName: "contextExecutionSystem",
        menuId: "clientPricingExecutionMenu",
        label: "Execution System",
        icon: "terminal"
      }
    ];
    let ccyOptions = loadCcyOptions();
    let marketPairs = loadMarketPairs();
    let clientProfiles = loadClientProfiles();
    let users = loadUsers();
    let servicingBranches = loadServicingBranches();
    let settlementSystems = loadSettlementSystems();
    let tradeCaptureChannels = loadTradeCaptureChannels();
    let pricingContexts = loadPricingContexts();
    let clientPricingRules = loadClientPricingRules();
    let hedgeQuickModeSettings = loadHedgeQuickModeSettings();
    let autoHedgingAdmissionPolicy = loadAutoHedgingAdmissionPolicy();
    let batchingSettings = loadFxBatchingSettings();
    let autoBatchingSettings = loadFxAutoBatchingSettings();
    let clientFxDeals = loadClientFxDeals();
    let hedgeFxDeals = loadHedgeFxDeals();
    let fxBatchHistory = loadFxBatches();
    let fxPositionRecords = Array.isArray(DEMO_API_BOOTSTRAP.fxPositions)
      ? DEMO_API_BOOTSTRAP.fxPositions
      : [];
    let clientDealGenerationSettings = [];
    let clientDealGenerationProcessSettings = {
      minIntervalSeconds: 1,
      maxIntervalSeconds: 3,
      minDealsPerCycle: 3,
      maxDealsPerCycle: 7
    };
    let clientDealGenerationSettingsEditPricingRuleId = null;
    let clientDealGenerationProcessState = {
      running: false,
      status: "STOPPED",
      minIntervalMs: 1000,
      maxIntervalMs: 3000,
      minDealsPerCycle: 3,
      maxDealsPerCycle: 7,
      generatedDealCount: 0,
      lastCycleSize: null,
      lastCycleGeneratedDealCount: 0,
      lastGeneratedTradeId: null,
      lastGeneratedAt: null,
      nextCycleAt: null,
      lastError: null
    };
    let clientDealGenerationRefreshTimer = null;
    let clientDealGenerationRefreshInFlight = false;
    let fxAutoBatchingProcessState = {
      running: DEMO_API_BOOTSTRAP?.fxAutoBatchingProcess?.running === true,
      status: String(DEMO_API_BOOTSTRAP?.fxAutoBatchingProcess?.status || "STOPPED"),
      phase: String(DEMO_API_BOOTSTRAP?.fxAutoBatchingProcess?.phase || "STOPPED"),
      startedAt: DEMO_API_BOOTSTRAP?.fxAutoBatchingProcess?.startedAt || null,
      intervalMs: Number(DEMO_API_BOOTSTRAP?.fxAutoBatchingProcess?.intervalMs) || 60000,
      batchingInProgress: false,
      formedBatchCount: Number(
        DEMO_API_BOOTSTRAP?.fxAutoBatchingProcess?.formedBatchCount
      ) || 0,
      lastCandidateTradeCount: 0,
      lastCandidatePairCount: Number(
        DEMO_API_BOOTSTRAP?.fxAutoBatchingProcess?.lastCandidatePairCount
      ) || 0,
      lastOpenWindowCount: Number(
        DEMO_API_BOOTSTRAP?.fxAutoBatchingProcess?.lastOpenWindowCount
      ) || 0,
      lastCycleBatchCount: Number(
        DEMO_API_BOOTSTRAP?.fxAutoBatchingProcess?.lastCycleBatchCount
      ) || 0,
      lastFormedBatchId: Number(
        DEMO_API_BOOTSTRAP?.fxAutoBatchingProcess?.lastFormedBatchId
      ) || null,
      lastFormedBatchIds: Array.isArray(
        DEMO_API_BOOTSTRAP?.fxAutoBatchingProcess?.lastFormedBatchIds
      )
        ? [...DEMO_API_BOOTSTRAP.fxAutoBatchingProcess.lastFormedBatchIds]
        : [],
      lastFormedAt: DEMO_API_BOOTSTRAP?.fxAutoBatchingProcess?.lastFormedAt || null,
      lastCycleAt: DEMO_API_BOOTSTRAP?.fxAutoBatchingProcess?.lastCycleAt || null,
      nextCycleAt: DEMO_API_BOOTSTRAP?.fxAutoBatchingProcess?.nextCycleAt || null,
      lastError: DEMO_API_BOOTSTRAP?.fxAutoBatchingProcess?.lastError || null
    };
    let fxAutoBatchingRefreshTimer = null;
    let fxAutoBatchingRefreshInFlight = false;
    let fxAutoBatchingToggleInFlight = false;
    let fxPositionsRequestSequence = 0;
    let oneBatchInFlight = false;
    let sendToAutoPositionModeInFlight = false;
    let pendingSendToAutoTrades = [];
    let pendingOneBatchRequest = null;
    let pendingOneBatchTenorSelection = null;
    const fxPositions = [];

    loadFxPositionsFromDatabase();

    const amountFormatter = new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });

    const rateFormatter = new Intl.NumberFormat("en-US", {
      minimumFractionDigits: 4,
      maximumFractionDigits: 4
    });
    const marketQuoteFormatters = new Map();

    function formatMarketQuote(value, pair) {
      if (!Number.isFinite(value)) {
        return "";
      }

      const decimals = normalizedDefaultQuoteDecimals(pair?.defaultQuoteDecimals);

      if (!marketQuoteFormatters.has(decimals)) {
        marketQuoteFormatters.set(decimals, new Intl.NumberFormat("en-US", {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals
        }));
      }

      return marketQuoteFormatters.get(decimals).format(value);
    }

    let smartSizingFrame = null;
    let smartSizingContext = null;
    const smartActionsColumnWidth = Number.parseInt(
      getComputedStyle(document.documentElement)
        .getPropertyValue("--workbench-actions-column-width"),
      10
    ) || 80;

    const TABLE_COLUMN_POLICIES = Object.freeze({
      actions: {
        min: smartActionsColumnWidth,
        max: smartActionsColumnWidth,
        pad: 12,
        ellipsize: false
      },
      compactActions: {
        min: 72,
        max: 72,
        pad: 8,
        ellipsize: false
      },
      amount: { min: 118, max: 220, pad: 18, ellipsize: false },
      boolean: { min: 72, max: 96, pad: 14, ellipsize: false },
      code: { min: 84, max: 180, pad: 18, ellipsize: true },
      contextPath: { min: 280, max: 620, pad: 18, ellipsize: true },
      count: { min: 64, max: 80, pad: 12, ellipsize: false },
      date: { min: 104, max: 172, pad: 18, ellipsize: false },
      default: { min: 92, max: 280, pad: 18, ellipsize: true },
      executionSystemId: { min: 120, max: 360, pad: 18, ellipsize: false },
      marketRate: { min: 70, max: 76, pad: 12, ellipsize: false },
      name: { min: 140, max: 360, pad: 18, ellipsize: true },
      number: { min: 82, max: 160, pad: 18, ellipsize: false },
      pair: { min: 88, max: 132, pad: 18, ellipsize: false },
      presetAmounts: { min: 220, max: 390, pad: 18, ellipsize: false },
      primaryId: { min: 64, max: 110, pad: 18, ellipsize: false },
      rate: { min: 82, max: 150, pad: 18, ellipsize: false },
      referenceId: { min: 92, max: 180, pad: 18, ellipsize: true },
      short: { min: 72, max: 140, pad: 18, ellipsize: true },
      side: { min: 72, max: 100, pad: 14, ellipsize: false },
      text: { min: 120, max: 360, pad: 18, ellipsize: true },
      timestamp: { min: 156, max: 210, pad: 18, ellipsize: false },
      tradeSummary: { min: 280, max: 420, pad: 18, ellipsize: true },
      type: { min: 100, max: 220, pad: 18, ellipsize: true }
    });

    const TABLE_COLUMN_POLICY_ALIASES = Object.freeze({
      dealId: "referenceId",
      id: "primaryId",
      label: "text",
      margin: "number",
      positionAmount: "amount",
      shortText: "short",
      tenor: "short",
      transferRate: "rate",
      valueDate: "date"
    });

    function normalizedTableColumnType(type) {
      return TABLE_COLUMN_POLICY_ALIASES[type] || type || "default";
    }

    function tableColumnPolicy(type) {
      const normalizedType = normalizedTableColumnType(type);

      return TABLE_COLUMN_POLICIES[normalizedType] || TABLE_COLUMN_POLICIES.default;
    }

    function smartSizingFont(element) {
      const style = window.getComputedStyle(element);

      return [
        style.fontStyle,
        style.fontVariant,
        style.fontWeight,
        style.fontSize,
        style.fontFamily
      ].join(" ");
    }

    function smartTextWidth(text, element) {
      if (!smartSizingContext) {
        smartSizingContext = document.createElement("canvas").getContext("2d");
      }

      smartSizingContext.font = smartSizingFont(element);

      return Math.ceil(smartSizingContext.measureText(String(text || "")).width);
    }

    function smartHeaderLabel(headerCell) {
      const labelElement = headerCell.querySelector?.(
        ".reference-column-title, .sort-button, [data-column-label]"
      );
      const clone = (labelElement || headerCell).cloneNode(true);

      clone
        .querySelectorAll(
          ".button-icon, .reference-sort-indicator, .reference-column-filter, "
          + ".reference-column-filter-trigger, .icon-action, input, select, textarea"
        )
        .forEach(element => element.remove());

      return clone.textContent.replace(/\s+/g, " ").trim();
    }

    function smartCellText(cell) {
      const sortButton = cell.querySelector?.(".sort-button");

      if (sortButton) {
        return sortButton.textContent.replace(/\s+/g, " ").trim();
      }

      const priorityText = cell.querySelector?.(".position-label-text");

      if (priorityText) {
        const clone = priorityText.cloneNode(true);
        clone.querySelectorAll(".button-icon").forEach(element => element.remove());
        return clone.textContent.replace(/\s+/g, " ").trim();
      }

      const control = cell.querySelector?.("input, select, textarea");

      if (control) {
        if (control.tagName === "SELECT") {
          return control.selectedOptions?.[0]?.textContent?.trim() || control.value || "";
        }

        return control.value || "";
      }

      const clone = cell.cloneNode(true);

      clone
        .querySelectorAll(".button-icon, .reference-column-filter-trigger, .icon-action, button, input, select, textarea")
        .forEach(element => element.remove());

      return clone.textContent.replace(/\s+/g, " ").trim();
    }

    function smartVisibleCells(row) {
      return Array.from(row.cells).filter(cell => !cell.hidden && cell.colSpan === 1);
    }

    function smartHeaderRow(table) {
      const rows = Array.from(table.tHead?.rows || []);
      const preferred = rows.find(row => row.classList.contains("column-title"));

      if (preferred) {
        return preferred;
      }

      return rows
        .slice()
        .reverse()
        .find(row =>
          !row.classList.contains("group-title") &&
          !row.classList.contains("reference-filter-row") &&
          smartVisibleCells(row).length > 0
        ) || null;
    }

    function smartBodyCellsByIndex(table, columnIndex) {
      const rows = [
        ...Array.from(table.tBodies || []).flatMap(tbody => Array.from(tbody.rows)),
        ...Array.from(table.tFoot?.rows || [])
      ];

      return rows
        .map(row => smartVisibleCells(row)[columnIndex])
        .filter(Boolean);
    }

    function smartColumnType(headerCell) {
      const explicitType = headerCell.dataset.columnKind;

      if (explicitType) {
        return normalizedTableColumnType(explicitType);
      }

      const text = smartHeaderLabel(headerCell).toLowerCase();
      const classes = headerCell.classList;

      if (classes.contains("gap") || classes.contains("selection-gap")) {
        return "gap";
      }

      if (classes.contains("profile-actions-cell") || text === "actions" || text === "open") {
        return "actions";
      }

      if (classes.contains("client") && text === "trade") {
        return "tradeSummary";
      }

      if (classes.contains("market-left") || classes.contains("market-right")) {
        return "marketRate";
      }

      if (
        classes.contains("amount")
        || classes.contains("quote-amount")
        || classes.contains("cash-column")
        || classes.contains("pnl-column")
        || text.includes("amount")
        || text.includes("cash")
        || text.includes("pnl")
      ) {
        return "amount";
      }

      if (classes.contains("rate") || text.includes("rate") || text === "bid" || text === "offer" || text.includes("market")) {
        return "rate";
      }

      if (text.includes("timestamp")) {
        return "timestamp";
      }

      if (
        classes.contains("date")
        || classes.contains("entry-date-column")
        || classes.contains("trade-date-column")
        || classes.contains("value-date-column")
        || classes.contains("settlement-day-column")
        || text.includes("date")
        || text.includes("day")
      ) {
        return "date";
      }

      if (classes.contains("side-column") || text === "side") {
        return "side";
      }

      if (classes.contains("currency-pair-column") || text.includes("pair")) {
        return "pair";
      }

      if (classes.contains("currency-column") || text.includes("ccy") || text.includes("code")) {
        return "code";
      }

      if (classes.contains("deal-id-column")) {
        return "referenceId";
      }

      if (classes.contains("pricing-rule-context-column") || text.includes("context")) {
        return "contextPath";
      }

      if (
        classes.contains("external-ref-column")
        || text.includes("reference")
        || text.includes(" ref")
      ) {
        return "referenceId";
      }

      if (
        classes.contains("batch-id-column")
        || classes.contains("pricing-context-column")
        || classes.contains("position-id-column")
        || text === "id"
        || text.includes(" id")
        || text.endsWith("id")
      ) {
        return "primaryId";
      }

      if (classes.contains("client") || classes.contains("name-column") || text.includes("name") || text.includes("label") || text.includes("description")) {
        return "name";
      }

      if (/\bcount\b/.test(text)) {
        return "count";
      }

      if (text === "active") {
        return "boolean";
      }

      if (text.includes("margin") || text.includes("%") || text.includes("digits")) {
        return "number";
      }

      if (
        text.includes("type")
        || text.includes("mode")
        || text.includes("role")
        || text === "status"
      ) {
        return "type";
      }

      if (classes.contains("tenor-column") || text === "tenor") {
        return "short";
      }

      return "default";
    }

    function smartColumnPolicy(type, headerCell) {
      if (type === "gap") {
        if (headerCell.classList.contains("wide-gap")) {
          return { min: 16, max: 16, pad: 0, ellipsize: false };
        }

        if (headerCell.classList.contains("selection-gap")) {
          return { min: 28, max: 28, pad: 0, ellipsize: false };
        }

        return { min: 14, max: 14, pad: 0, ellipsize: false };
      }

      return tableColumnPolicy(type);
    }

    function smartCssPixels(value) {
      const pixels = Number.parseFloat(value);

      return Number.isFinite(pixels) ? pixels : 0;
    }

    function smartHorizontalChrome(element) {
      const style = window.getComputedStyle(element);

      return smartCssPixels(style.paddingLeft)
        + smartCssPixels(style.paddingRight)
        + smartCssPixels(style.borderLeftWidth)
        + smartCssPixels(style.borderRightWidth);
    }

    function smartElementOuterWidth(element) {
      const style = window.getComputedStyle(element);
      const renderedWidth = element.getBoundingClientRect().width;
      let width = renderedWidth || smartCssPixels(style.width);

      if (!renderedWidth && style.boxSizing !== "border-box") {
        width += smartHorizontalChrome(element);
      }

      return width + smartCssPixels(style.marginLeft) + smartCssPixels(style.marginRight);
    }

    function smartHeaderMinimumWidth(headerCell, policy) {
      const label = smartHeaderLabel(headerCell);
      const legacyWidth = smartTextWidth(label, headerCell)
        + policy.pad
        + (headerCell.querySelector(".sort-button, .reference-column-filter-trigger") ? 16 : 0);
      const filterableHead = headerCell.querySelector(".reference-filterable-head");
      const filterTrigger = filterableHead?.querySelector(".reference-column-filter-trigger");

      if (!filterableHead || !filterTrigger) {
        return legacyWidth;
      }

      const labelElement = Array.from(filterableHead.children)
        .find(element => !element.classList.contains("reference-column-filter"));
      const filterWrapper = filterTrigger.closest(".reference-column-filter") || filterTrigger;
      const filterableHeadStyle = window.getComputedStyle(filterableHead);
      const gap = smartCssPixels(filterableHeadStyle.columnGap || filterableHeadStyle.gap);
      const cellChrome = Math.max(policy.pad, smartHorizontalChrome(headerCell));
      const filterControlWidth = Math.max(
        smartElementOuterWidth(filterWrapper),
        smartElementOuterWidth(filterTrigger)
      );
      const filterableWidth = smartTextWidth(label, labelElement || headerCell)
        + gap
        + filterControlWidth
        + cellChrome;

      return Math.ceil(Math.max(legacyWidth, filterableWidth));
    }

    function smartRequestedMinimumWidth(headerCell) {
      const minimumText = headerCell.dataset.smartMinText;

      if (!minimumText) {
        return 0;
      }

      const extraWidth = smartCssPixels(headerCell.dataset.smartExtraWidth);

      return Math.ceil(smartTextWidth(minimumText, headerCell) + extraWidth);
    }

    function smartCellContentWidth(cell, policy) {
      const text = smartCellText(cell);
      const textWidth = smartTextWidth(text, cell)
        + Math.max(policy.pad, smartHorizontalChrome(cell));
      const composite = cell.querySelector?.(
        "[data-smart-width-content], "
        + ".pricing-rules-context-path, .client-pricing-context-candidate-path"
      );

      if (!composite) {
        return textWidth;
      }

      const compositeWidth = Math.max(
        composite.scrollWidth,
        smartElementOuterWidth(composite)
      );

      return Math.max(
        textWidth,
        Math.ceil(compositeWidth + smartHorizontalChrome(cell))
      );
    }

    function smartColumnWidth(headerCell, bodyCells) {
      const type = smartColumnType(headerCell);
      const policy = smartColumnPolicy(type, headerCell);
      const headerWidth = smartHeaderMinimumWidth(headerCell, policy);
      const requestedMinimumWidth = smartRequestedMinimumWidth(headerCell);
      const contentWidth = bodyCells.reduce((max, cell) => {
        return Math.max(max, smartCellContentWidth(cell, policy));
      }, 0);
      const requiredWidth = Math.max(
        policy.min,
        headerWidth,
        contentWidth,
        requestedMinimumWidth
      );
      const cappedWidth = Math.min(requiredWidth, policy.max);

      return {
        width: cappedWidth,
        type,
        ellipsize: policy.ellipsize
      };
    }

    function syncSmartColumnWidths(table, columns) {
      if (table.classList.contains("batching-table")) {
        [
          { label: "Base Ccy Amount", type: "amount" },
          { label: "Trade", type: "rate" },
          { label: "Transfer", type: "rate" },
          { label: "Bid", type: "rate" },
          { label: "Offer", type: "rate" }
        ].forEach(({ label, type }) => {
          const matching = columns.filter(column =>
            column.label === label && column.type === type
          );
          const width = Math.max(...matching.map(column => column.width), 0);

          matching.forEach(column => {
            column.width = width;
          });
        });
      }
    }

    function resetSmartTableSizing(table) {
      table.classList.remove("smart-sized-table");
      table.style.removeProperty("width");
      table.style.removeProperty("min-width");
      table.style.removeProperty("max-width");
      table.style.removeProperty("table-layout");

      table.querySelectorAll("col").forEach(col => {
        col.style.removeProperty("width");
        col.style.removeProperty("min-width");
        col.style.removeProperty("max-width");
      });

      table.querySelectorAll("colgroup[data-smart-sizing]").forEach(colgroup => {
        delete colgroup.dataset.smartSizing;
      });

      table.querySelectorAll("th, td").forEach(cell => {
        if (cell.dataset.smartSizingTooltip === "true") {
          cell.removeAttribute("data-tooltip");
          delete cell.dataset.smartSizingTooltip;
        }

        cell.style.removeProperty("width");
        cell.style.removeProperty("min-width");
        cell.style.removeProperty("max-width");
        cell.classList.remove("smart-cell-ellipsis");
      });
    }

    function tableContentIsClipped(source, boundary = source) {
      if (!(source instanceof Element) || !(boundary instanceof Element)) {
        return false;
      }

      const sourceRect = source.getBoundingClientRect();
      const boundaryRect = boundary.getBoundingClientRect();

      return source.scrollWidth > source.clientWidth + 1
        || source.scrollHeight > source.clientHeight + 1
        || sourceRect.left < boundaryRect.left - 1
        || sourceRect.right > boundaryRect.right + 1
        || sourceRect.top < boundaryRect.top - 1
        || sourceRect.bottom > boundaryRect.bottom + 1;
    }

    function clearTableOverflowTooltip(cell) {
      if (cell?.dataset.smartSizingTooltip !== "true") {
        return;
      }

      if (activeTooltipTarget === cell) {
        hideAppTooltip();
      }

      cell.removeAttribute("data-tooltip");
      delete cell.dataset.smartSizingTooltip;
    }

    function tableCellOverflowSource(cell) {
      if (cell.tagName === "TH") {
        return cell.querySelector(
          ".reference-column-title, .sort-button, [data-column-label]"
        ) || cell;
      }

      return cell.querySelector(
        "[data-smart-tooltip-content], [data-smart-width-content], .position-label-text"
      ) || cell;
    }

    function syncSmartCellTooltip(cell) {
      if (cell.hasAttribute("data-disable-overflow-tooltip") || cell.querySelector("[data-disable-overflow-tooltip]")) {
        clearTableOverflowTooltip(cell);
        return;
      }

      const managedTooltip = cell.dataset.smartSizingTooltip === "true";

      if (managedTooltip) {
        clearTableOverflowTooltip(cell);
      } else if (cell.hasAttribute("data-tooltip")) {
        return;
      }

      const isHeader = cell.tagName === "TH";

      if (!isHeader && cell.querySelector("input, select, textarea")) {
        return;
      }

      const overflowSource = tableCellOverflowSource(cell);

      if (!tableContentIsClipped(overflowSource, cell)) {
        return;
      }

      const text = isHeader ? smartHeaderLabel(cell) : smartCellText(cell);

      if (text) {
        cell.dataset.tooltip = text;
        cell.dataset.smartSizingTooltip = "true";
        initializeTooltipElement(cell);
      }
    }

    function syncNativeTableOverflowTooltips(table) {
      if (
        !(table instanceof HTMLTableElement)
        || table.hidden
        || table.closest("[hidden]")
      ) {
        return;
      }

      table.querySelectorAll("th, td").forEach(syncSmartCellTooltip);
    }

    function applySmartTableSizing(table) {
      if (table.closest("[hidden]") || table.hidden || table.dataset.columnSizing === "managed") {
        return;
      }

      resetSmartTableSizing(table);

      const headerRow = smartHeaderRow(table);

      if (!headerRow) {
        return;
      }

      const headerCells = smartVisibleCells(headerRow);

      if (headerCells.length === 0) {
        return;
      }

      const columns = headerCells.map((headerCell, index) => ({
        ...smartColumnWidth(headerCell, smartBodyCellsByIndex(table, index)),
        label: smartCellText(headerCell),
        index
      }));

      syncSmartColumnWidths(table, columns);

      const totalWidth = Math.ceil(columns.reduce((sum, column) => sum + column.width, 0));
      let colgroup = table.querySelector("colgroup");

      if (!colgroup) {
        colgroup = document.createElement("colgroup");
        table.insertBefore(colgroup, table.firstChild);
      }

      colgroup.dataset.smartSizing = "true";

      while (colgroup.children.length < columns.length) {
        colgroup.appendChild(document.createElement("col"));
      }

      while (colgroup.children.length > columns.length) {
        colgroup.lastElementChild.remove();
      }

      columns.forEach((column, index) => {
        const col = colgroup.children[index];

        col.style.setProperty("width", `${Math.ceil(column.width)}px`, "important");
      });

      table.classList.add("smart-sized-table");
      table.style.setProperty("width", `${totalWidth}px`, "important");
      table.style.setProperty("min-width", `${totalWidth}px`, "important");
      table.style.setProperty("max-width", `${totalWidth}px`, "important");
      table.style.setProperty("table-layout", "fixed", "important");

      columns.forEach((column, index) => {
        const cells = [
          headerCells[index],
          ...smartBodyCellsByIndex(table, index)
        ];

        cells.forEach(cell => {
          const width = `${Math.ceil(column.width)}px`;

          cell.style.setProperty("width", width, "important");
          cell.style.setProperty("min-width", width, "important");
          cell.style.setProperty("max-width", width, "important");
          cell.classList.toggle("smart-cell-ellipsis", column.ellipsize);
          syncSmartCellTooltip(cell);
        });
      });
    }

    function applySmartColumnSizing() {
      document
        .querySelectorAll(
          ".batching-table, .blotter-table, .profile-table, .generation-settings-table"
        )
        .forEach(applySmartTableSizing);

      document.querySelectorAll("table").forEach(syncNativeTableOverflowTooltips);
    }

    function scheduleSmartColumnSizing() {
      if (smartSizingFrame !== null) {
        return;
      }

      smartSizingFrame = window.requestAnimationFrame(() => {
        smartSizingFrame = null;
        applySmartColumnSizing();
        scheduleHedgeQuickModeQuoteAlignment();
      });
    }

    const workspaceNav = document.getElementById("workspaceNav");
    const workspaceNavMenuEntries = Array.from(
      document.querySelectorAll("[data-workspace-nav-menu-toggle]")
    ).map(toggle => {
      const menu = document.getElementById(toggle.dataset.workspaceNavMenuToggle);

      return {
        toggle,
        menu,
        links: Array.from(menu.querySelectorAll("[data-workspace-route]")),
        routes: toggle.dataset.workspaceRoutes.split(/\s+/).filter(Boolean)
      };
    });
    const ccyOptionTextLimits = Object.freeze({ code: 3, name: 20, country: 30 });
    const workspaceNavLinks = Array.from(document.querySelectorAll("[data-workspace-route]"));
    const marketPage = document.getElementById("marketPage");
    const marketPageHeader = document.getElementById("marketPageHeader");
    const marketPageTitle = document.getElementById("marketPageTitle");
    const marketSettingsBreadcrumb = document.getElementById("marketSettingsBreadcrumb");
    const marketSettingsBreadcrumbBackLink = document.getElementById("marketSettingsBreadcrumbBackLink");
    const marketSettingsBreadcrumbCurrent = document.getElementById("marketSettingsBreadcrumbCurrent");
    const databasePage = document.getElementById("databasePage");
    const processesPage = document.getElementById("processesPage");
    const processCatalogViewLinks = Array.from(
      document.querySelectorAll("[data-process-catalog-view]")
    );
    const manualBatchFormationProcessView = document.getElementById("manualBatchFormationProcessView");
    const domainGlossaryProcessView = document.getElementById("domainGlossaryProcessView");
    const processCatalogLanguageButtons = Array.from(
      document.querySelectorAll("[data-process-language]")
    );
    const processCatalogCopyElements = Array.from(
      document.querySelectorAll("[data-process-copy]")
    );
    const processCatalogAriaElements = Array.from(
      document.querySelectorAll("[data-process-aria-label]")
    );
    const manualProcessNodes = Array.from(
      document.querySelectorAll("[data-manual-process-stage]")
    );
    const manualProcessInspector = document.getElementById("manualProcessInspector");
    const manualProcessInspectorIcon = document.getElementById("manualProcessInspectorIcon");
    const manualProcessInspectorKicker = document.getElementById("manualProcessInspectorKicker");
    const manualProcessInspectorTitle = document.getElementById("manualProcessInspectorTitle");
    const manualProcessInspectorObjective = document.getElementById("manualProcessInspectorObjective");
    const manualProcessInspectorSteps = document.getElementById("manualProcessInspectorSteps");
    const manualProcessInspectorControls = document.getElementById("manualProcessInspectorControls");
    const manualProcessInspectorArtifacts = document.getElementById("manualProcessInspectorArtifacts");
    const manualProcessInspectorTraceability = document.getElementById("manualProcessInspectorTraceability");
    const manualProcessInspectorResult = document.getElementById("manualProcessInspectorResult");
    const mainPage = document.getElementById("mainPage");
    const fxPositionModeTabs = Array.from(
      document.querySelectorAll("[data-fx-position-mode]")
    );
    const fxPositionManualCount = document.getElementById("fxPositionManualCount");
    const fxPositionAutoCount = document.getElementById("fxPositionAutoCount");
    const fxPositionGridPanel = document.getElementById("fxPositionGridPanel");
    const batchingSettingsPage = document.getElementById("batchingSettingsPage");
    const hedgingSettingsPage = document.getElementById("hedgingSettingsPage");
    const fxBatchesPage = document.getElementById("fxBatchesPage");
    const batchingHistoryPage = document.getElementById("batchingHistoryPage");
    const batchingHistoryGridEl = document.getElementById("batchingHistoryGrid");
    const batchingHistoryCountEl = document.getElementById("batchingHistoryCount");
    const batchingHistoryStatusEl = document.getElementById("batchingHistoryStatus");
    const fxBatchesAuditViewToggle = document.getElementById("fxBatchesAuditView");
    const batchDetailsPage = document.getElementById("batchDetailsPage");
    const batchDetailsStatusEl = document.getElementById("batchDetailsStatus");
    const batchDetailsPrompt = document.getElementById("batchDetailsPrompt");
    const batchDetailsPromptTitle = document.getElementById("batchDetailsPromptTitle");
    const batchDetailsPromptCopy = document.getElementById("batchDetailsPromptCopy");
    const batchDetailsContent = document.getElementById("batchDetailsContent");
    const batchDetailsSummaryTitle = document.getElementById("batchDetailsSummaryTitle");
    const batchDetailsBatchStatus = document.getElementById("batchDetailsBatchStatus");
    const batchDetailsCurrencyPair = document.getElementById("batchDetailsCurrencyPair");
    const batchDetailsFormedAt = document.getElementById("batchDetailsFormedAt");
    const batchDetailsRolledBackAt = document.getElementById("batchDetailsRolledBackAt");
    const batchDetailsTradeDate = document.getElementById("batchDetailsTradeDate");
    const batchDetailsTenor = document.getElementById("batchDetailsTenor");
    const batchDetailsBaseValueDate = document.getElementById("batchDetailsBaseValueDate");
    const batchDetailsQuoteValueDate = document.getElementById("batchDetailsQuoteValueDate");
    const batchNeutralityDetails = document.getElementById("batchNeutralityDetails");
    const batchNeutralitySummaryStatus =
      document.getElementById("batchNeutralitySummaryStatus");
    const batchNeutralitySummaryStatusIcon =
      document.getElementById("batchNeutralitySummaryStatusIcon");
    const batchNeutralitySummaryStatusText =
      document.getElementById("batchNeutralitySummaryStatusText");
    const batchNeutralityMembersBase = document.getElementById("batchNeutralityMembersBase");
    const batchNeutralityMembersQuote = document.getElementById("batchNeutralityMembersQuote");
    const batchNeutralityCashQuote = document.getElementById("batchNeutralityCashQuote");
    const batchNeutralityResult = document.getElementById("batchNeutralityResult");
    const batchNeutralityPositionStatus =
      document.getElementById("batchNeutralityPositionStatus");
    const batchNeutralityCashStatus = document.getElementById("batchNeutralityCashStatus");
    const batchDetailsMembersCount = document.getElementById("batchDetailsMembersCount");
    const batchDetailsMembersGridEl = document.getElementById("batchDetailsMembersGrid");
    const batchDetailsCashOutputCount =
      document.getElementById("batchDetailsCashOutputCount");
    const batchDetailsCashOutputEmpty =
      document.getElementById("batchDetailsCashOutputEmpty");
    const batchDetailsCashOutputGridShell =
      document.getElementById("batchDetailsCashOutputGridShell");
    const batchDetailsCashOutputGridEl =
      document.getElementById("batchDetailsCashOutputGrid");
    const batchDetailsOutputsCount = document.getElementById("batchDetailsOutputsCount");
    const batchDetailsOutputsEmpty = document.getElementById("batchDetailsOutputsEmpty");
    const batchDetailsOutputsGridShell =
      document.getElementById("batchDetailsOutputsGridShell");
    const batchDetailsOutputsGridEl = document.getElementById("batchDetailsOutputsGrid");
    const batchRollbackDialog = document.getElementById("batchRollbackDialog");
    const batchRollbackDialogClose = document.getElementById("batchRollbackDialogClose");
    const batchRollbackSummary = document.getElementById("batchRollbackSummary");
    const batchRollbackStatus = document.getElementById("batchRollbackStatus");
    const batchRollbackCancelButton = document.getElementById("batchRollbackCancelButton");
    const batchRollbackConfirmButton = document.getElementById("batchRollbackConfirmButton");
    const fxDealsPage = document.getElementById("fxDealsPage");
    const fxDealsTabs = Array.from(document.querySelectorAll("[data-fx-deals-route]"));
    const fxDealsAuditToggles = Array.from(
      document.querySelectorAll("[data-fx-deals-audit-toggle]")
    );
    const clientFxDealsPage = document.getElementById("clientFxDealsPage");
    const clientFxDealsGridEl = document.getElementById("clientFxDealsGrid");
    const clientFxDealsCountEl = document.getElementById("clientFxDealsCount");
    const hedgeFxDealsPage = document.getElementById("hedgeFxDealsPage");
    const hedgeFxDealsGridEl = document.getElementById("hedgeFxDealsGrid");
    const hedgeFxDealsCountEl = document.getElementById("hedgeFxDealsCount");
    const analyticalPnlReportPage = document.getElementById("analyticalPnlReportPage");
    const analyticalPnlReportStatusEl = document.getElementById("analyticalPnlReportStatus");
    const analyticalPnlReportFiltersForm = document.getElementById("analyticalPnlReportFilters");
    const analyticalPnlReportClearFiltersButton = document.getElementById("analyticalPnlReportClearFilters");
    const analyticalPnlReportSummaryGridEl = document.getElementById("analyticalPnlReportSummaryGrid");
    const analyticalPnlReportSummaryNoteEl = document.getElementById("analyticalPnlReportSummaryNote");
    const clientProfilePage = document.getElementById("clientProfilePage");
    const clientProfileTopbar = document.getElementById("clientProfileTopbar");
    const clientProfileLayout = document.getElementById("clientProfileLayout");
    const clientProfileListView = document.getElementById("clientProfileListView");
    const clientProfileDetailView = document.getElementById("clientProfileDetailView");
    const clientProfileBackButton = document.getElementById("clientProfileBackButton");
    const clientProfilePageTitle = document.getElementById("clientProfilePageTitle");
    const clientProfileBreadcrumb = document.getElementById("clientProfileBreadcrumb");
    const clientProfileBreadcrumbBackLink = document.getElementById("clientProfileBreadcrumbBackLink");
    const clientProfileBreadcrumbCurrent = document.getElementById("clientProfileBreadcrumbCurrent");
    const tradingCounterpartyScopeTabs = document.getElementById("tradingCounterpartyScopeTabs");
    const tradingCounterpartyScopeButtons = Array.from(document.querySelectorAll("[data-trading-counterparty-scope]"));
    const tradingCounterpartiesTable = document.getElementById("tradingCounterpartiesTable");
    const usersView = document.getElementById("usersView");
    const usersLayout = document.getElementById("usersLayout");
    const usersListView = document.getElementById("usersListView");
    const usersDetailView = document.getElementById("usersDetailView");
    const usersBackButton = document.getElementById("usersBackButton");
    const usersPageTitle = document.getElementById("usersPageTitle");
    const usersPageSubtitle = document.getElementById("usersPageSubtitle");
    const pricingPage = document.getElementById("pricingPage");
    const referenceDataPage = document.getElementById("referenceDataPage");
    const pricingRulesPage = document.getElementById("pricingRulesPage");
    const pricingRulesTable = document.getElementById("pricingRulesTable");
    const pricingRulesTableLayoutButton = document.getElementById("pricingRulesTableLayoutButton");
    const pricingRulesTableLayoutDialog = document.getElementById("pricingRulesTableLayoutDialog");
    const pricingRulesTableLayoutForm = document.getElementById("pricingRulesTableLayoutForm");
    const pricingRulesTableLayoutDialogTitle = document.getElementById("pricingRulesTableLayoutDialogTitle");
    const pricingRulesTableLayoutList = document.getElementById("pricingRulesTableLayoutList");
    const pricingRulesTableLayoutStatus = document.getElementById("pricingRulesTableLayoutStatus");
    const pricingRulesTableLayoutDialogClose = document.getElementById("pricingRulesTableLayoutDialogClose");
    const pricingRulesTableLayoutCancelButton = document.getElementById("pricingRulesTableLayoutCancelButton");
    const pricingRulesTableLayoutResetButton = document.getElementById("pricingRulesTableLayoutResetButton");
    const pricingRulesTableLayoutSaveDefaultButton = document.getElementById("pricingRulesTableLayoutSaveDefaultButton");
    const pricingRulesTableLayoutSaveButton = document.getElementById("pricingRulesTableLayoutSaveButton");
    const appTooltipEl = document.getElementById("appTooltip");
    const currencyPairListEl = document.getElementById("currencyPairList");
    const rowsEl = document.getElementById("dealRows");
    const batchingSummaryRowsEl = document.getElementById("batchingSummaryRows");
    const clientProfileRowsEl = document.getElementById("clientProfileRows");
    const clientProfileNewButton = document.getElementById("clientProfileNewButton");
    const clientProfileNewButtonLabel = document.getElementById("clientProfileNewButtonLabel");
    const tradingCounterpartyProfileTypeHeaderLabel = document.getElementById("tradingCounterpartyProfileTypeHeaderLabel");
    const tradingCounterpartyNameHeaderLabel = document.getElementById("tradingCounterpartyNameHeaderLabel");
    const tradingCounterpartyCodeFilter = document.getElementById("tradingCounterpartyCodeFilter");
    const tradingCounterpartyIdSortButton = document.getElementById("tradingCounterpartyIdSort");
    const tradingCounterpartyIdHeader = document.getElementById("tradingCounterpartyIdHeader");
    const tradingCounterpartyHeaderFilterControls = Array.from(document.querySelectorAll("[data-trading-counterparty-header-filter]"));
    const tradingCounterpartyTypeFilter = document.getElementById("tradingCounterpartyTypeFilter");
    const tradingCounterpartyCodeTypeFilter = document.getElementById("tradingCounterpartyCodeTypeFilter");
    const tradingCounterpartyExternalKindFilter = document.getElementById("tradingCounterpartyExternalKindFilter");
    const tradingCounterpartyActiveFilter = document.getElementById("tradingCounterpartyActiveFilter");
    const usersRowsEl = document.getElementById("usersRows");
    const usersNewButton = document.getElementById("usersNewButton");
    const usersIdSortButton = document.getElementById("usersIdSort");
    const usersIdHeader = document.getElementById("usersIdHeader");
    const usersHeaderFilterControls = Array.from(document.querySelectorAll("[data-user-header-filter]"));
    const pricingContextRowsEl = document.getElementById("pricingContextRows");
    const pricingContextIdSortButton = document.getElementById("pricingContextIdSort");
    const pricingContextIdHeader = document.getElementById("pricingContextIdHeader");
    const pricingContextHeaderFilterControls = Array.from(document.querySelectorAll("[data-pricing-context-header-filter]"));
    const pricingContextNewButton = document.getElementById("pricingContextNewButton");
    const executionContextsTable = document.getElementById("executionContextsTable");
    const pricingContextAutoHedgingAdmissionHeader = document.getElementById("pricingContextAutoHedgingAdmissionHeader");
    const pricingContextBreadcrumb = document.getElementById("pricingContextBreadcrumb");
    const pricingContextBreadcrumbBackLink = document.getElementById("pricingContextBreadcrumbBackLink");
    const pricingContextBreadcrumbCurrent = document.getElementById("pricingContextBreadcrumbCurrent");
    const referenceDataStatusEl = document.getElementById("referenceDataStatus");
    const referenceDataPanels = Array.from(document.querySelectorAll("[data-reference-panel]"));
    const referenceDataRouteLinks = Array.from(document.querySelectorAll("[data-reference-route]"));
    const servicingBranchRowsEl = document.getElementById("servicingBranchRows");
    const servicingBranchNewButton = document.getElementById("servicingBranchNewButton");
    const servicingBranchIdSortButton = document.getElementById("servicingBranchIdSort");
    const servicingBranchIdHeader = document.getElementById("servicingBranchIdHeader");
    const referenceDataFilterControls = Array.from(document.querySelectorAll("[data-reference-filter-kind]"));
    const settlementSystemRowsEl = document.getElementById("settlementSystemRows");
    const settlementSystemNewButton = document.getElementById("settlementSystemNewButton");
    const settlementSystemIdSortButton = document.getElementById("settlementSystemIdSort");
    const settlementSystemIdHeader = document.getElementById("settlementSystemIdHeader");
    const tradeCaptureChannelRowsEl = document.getElementById("tradeCaptureChannelRows");
    const tradeCaptureChannelNewButton = document.getElementById("tradeCaptureChannelNewButton");
    const tradeCaptureChannelIdSortButton = document.getElementById("tradeCaptureChannelIdSort");
    const tradeCaptureChannelIdHeader = document.getElementById("tradeCaptureChannelIdHeader");
    const pricingRuleRowsEl = document.getElementById("pricingRuleRows");
    const pricingRulesScopeButtons = Array.from(document.querySelectorAll("[data-pricing-rules-scope]"));
    const pricingRulesBreadcrumb = document.getElementById("pricingRulesBreadcrumb");
    const pricingRulesBreadcrumbBackLink = document.getElementById("pricingRulesBreadcrumbBackLink");
    const pricingRulesBreadcrumbCurrent = document.getElementById("pricingRulesBreadcrumbCurrent");
    const pricingRuleAutoHedgingAdmissionHeader = document.getElementById("pricingRuleAutoHedgingAdmissionHeader");
    const pricingRuleCounterpartyCodeTitle = document.getElementById("pricingRuleCounterpartyCodeTitle");
    const pricingRuleCounterpartyCodeFilter = document.getElementById("pricingRuleCounterpartyCodeFilter");
    const pricingRuleQuickHedgeHeader = document.getElementById("pricingRuleQuickHedgeHeader");
    const pricingRuleIdSortButton = document.getElementById("pricingRuleIdSort");
    const pricingRuleIdHeader = document.getElementById("pricingRuleIdHeader");
    const pricingRuleHeaderFilterControls = Array.from(document.querySelectorAll("[data-pricing-rule-header-filter]"));
    const pricingRuleStatusEl = document.getElementById("pricingRuleStatus");
    const editDealButton = document.getElementById("editDealButton");
    const createDealButton = document.getElementById("createDealButton");
    const resetDemoTradesButton = document.getElementById("resetDemoTradesButton");
    const resetDemoTradesDialog = document.getElementById("resetDemoTradesDialog");
    const resetDemoTradesDialogClose = document.getElementById("resetDemoTradesDialogClose");
    const resetDemoTradesStatus = document.getElementById("resetDemoTradesStatus");
    const resetDemoTradesCancelButton = document.getElementById("resetDemoTradesCancelButton");
    const resetDemoTradesConfirmButton = document.getElementById("resetDemoTradesConfirmButton");
    const generateClientDealButton = document.getElementById("generateClientDealButton");
    const runClientDealGenerationButton = document.getElementById("runClientDealGenerationButton");
    const runClientDealGenerationIcon = document.getElementById("runClientDealGenerationIcon");
    const runClientDealGenerationLabel = document.getElementById("runClientDealGenerationLabel");
    const clientDealSettingsButton = document.getElementById("clientDealSettingsButton");
    const sendToAutoPositionModeButton = document.getElementById("sendToAutoPositionModeButton");
    const sendToAutoPositionModeDialog = document.getElementById("sendToAutoPositionModeDialog");
    const sendToAutoPositionModeDialogClose = document.getElementById("sendToAutoPositionModeDialogClose");
    const sendToAutoPositionModeSummary = document.getElementById("sendToAutoPositionModeSummary");
    const sendToAutoPositionModeStatus = document.getElementById("sendToAutoPositionModeStatus");
    const sendToAutoPositionModeCancelButton = document.getElementById("sendToAutoPositionModeCancelButton");
    const sendToAutoPositionModeConfirmButton = document.getElementById("sendToAutoPositionModeConfirmButton");
    const oneBatchButton = document.getElementById("oneBatchButton");
    const oneBatchTenorDialog = document.getElementById("oneBatchTenorDialog");
    const oneBatchTenorDialogClose = document.getElementById("oneBatchTenorDialogClose");
    const oneBatchTenorSummary = document.getElementById("oneBatchTenorSummary");
    const oneBatchTenorSelect = document.getElementById("oneBatchTenorSelect");
    const oneBatchTenorStatus = document.getElementById("oneBatchTenorStatus");
    const oneBatchTenorCancelButton = document.getElementById("oneBatchTenorCancelButton");
    const oneBatchSelectedTenorButton = document.getElementById("oneBatchSelectedTenorButton");
    const autoBatchButton = document.getElementById("autoBatchButton");
    const autoBatchIcon = document.getElementById("autoBatchIcon");
    const autoBatchLabel = document.getElementById("autoBatchLabel");
    const autoBatchingSettingsButton = document.getElementById("autoBatchingSettingsButton");
    const addHedgeDealButton = document.getElementById("addHedgeDealButton");
    const hedgeQuickModeSettingsButton = document.getElementById("hedgeQuickModeSettingsButton");
    const hedgeQuickModeToolbar = document.getElementById("hedgeQuickModeToolbar");
    const fxPositionGridFrame = document.querySelector(".fx-position-grid-frame");
    const fxPositionGrid = fxPositionGridFrame?.querySelector(".fx-position-grid");
    let fxPositionGridFillFrame = null;
    const clientProfileForm = document.getElementById("clientProfileForm");
    const clientProfileFormTitle = document.getElementById("clientProfileFormTitle");
    const clientProfileCodeTypeField = document.getElementById("clientProfileCodeTypeField");
    const clientProfileKindField = document.getElementById("clientProfileKindField");
    const clientProfileKindLabel = document.getElementById("clientProfileKindLabel");
    const clientProfileCodeLabel = document.getElementById("clientProfileCodeLabel");
    const clientProfileNameLabel = document.getElementById("clientProfileNameLabel");
    const clientProfileSubmitButton = document.getElementById("clientProfileSubmitButton");
    const clientProfileDeleteButton = document.getElementById("clientProfileDeleteButton");
    const clientProfileResetButton = document.getElementById("clientProfileResetButton");
    const clientProfileDetailHint = document.getElementById("clientProfileDetailHint");
    const clientProfileStatusEl = document.getElementById("clientProfileStatus");
    const usersForm = document.getElementById("usersForm");
    const usersFormTitle = document.getElementById("usersFormTitle");
    const usersSubmitButton = document.getElementById("usersSubmitButton");
    const usersResetButton = document.getElementById("usersResetButton");
    const usersDeleteButton = document.getElementById("usersDeleteButton");
    const usersDetailHint = document.getElementById("usersDetailHint");
    const usersStatusEl = document.getElementById("usersStatus");
    const clientExecutionContextsPanel = document.getElementById("clientExecutionContextsPanel");
    const clientExecutionContextsList = document.getElementById("clientExecutionContextsList");
    const clientExecutionContextsCount = document.getElementById("clientExecutionContextsCount");
    const clientExecutionContextsAttachButton = document.getElementById("clientExecutionContextsAttachButton");
    const clientExecutionContextsAttachButtonIcon = document.getElementById("clientExecutionContextsAttachButtonIcon");
    const clientExecutionContextsAttachButtonLabel = document.getElementById("clientExecutionContextsAttachButtonLabel");
    const clientExecutionContextAttachDialog = document.getElementById("clientExecutionContextAttachDialog");
    const clientExecutionContextAttachForm = document.getElementById("clientExecutionContextAttachForm");
    const clientExecutionContextAttachDialogClose = document.getElementById("clientExecutionContextAttachDialogClose");
    const clientExecutionContextAttachDialogSubtitle = document.getElementById("clientExecutionContextAttachDialogSubtitle");
    const clientExecutionContextAttachCancelButton = document.getElementById("clientExecutionContextAttachCancelButton");
    const clientExecutionContextAttachSubmitButton = document.getElementById("clientExecutionContextAttachSubmitButton");
    const clientExecutionContextAttachSubmitLabel = document.getElementById("clientExecutionContextAttachSubmitLabel");
    const clientExecutionContextAttachSelectAll = document.getElementById("clientExecutionContextAttachSelectAll");
    const clientExecutionContextAttachSelection = document.getElementById("clientExecutionContextAttachSelection");
    const clientExecutionContextAttachStatus = document.getElementById("clientExecutionContextAttachStatus");
    const clientExecutionContextAttachRows = document.getElementById("clientExecutionContextAttachRows");
    const clientExecutionContextAttachIdSort = document.getElementById("clientExecutionContextAttachIdSort");
    const clientExecutionContextAttachFilterControls = Array.from(document.querySelectorAll("[data-client-context-attach-filter]"));
    const clientPricingRuleEditor = document.getElementById("clientPricingRuleEditor");
    const clientPricingRuleDialog = document.getElementById("clientPricingRuleDialog");
    const clientPricingRuleForm = document.getElementById("clientPricingRuleForm");
    const clientPricingRuleDialogTitle = document.getElementById("clientPricingRuleDialogTitle");
    const clientPricingRuleDialogClose = document.getElementById("clientPricingRuleDialogClose");
    const clientPricingRuleContextSearchSection = document.getElementById("clientPricingRuleContextSearchSection");
    const clientPricingRuleFixedTermsSection = document.getElementById("clientPricingRuleFixedTermsSection");
    const clientPricingRuleFixedPairTerm = document.getElementById("clientPricingRuleFixedPairTerm");
    const clientPricingRuleFixedPair = document.getElementById("clientPricingRuleFixedPair");
    const clientPricingRuleFixedContext = document.getElementById("clientPricingRuleFixedContext");
    const clientPricingRuleCurrencyPairField = document.getElementById("clientPricingRuleCurrencyPairField");
    const clientPricingRuleCancelButton = document.getElementById("clientPricingRuleCancelButton");
    const clientPricingRuleDeleteButton = document.getElementById("clientPricingRuleDeleteButton");
    const clientPricingRuleSubmitButton = document.getElementById("clientPricingRuleSubmitButton");
    const clientPricingContextResults = document.getElementById("clientPricingContextResults");
    const pricingContextStatusEl = document.getElementById("pricingContextStatus");
    const batchStatusEl = document.getElementById("batchStatus");
    const sortButtons = Array.from(document.querySelectorAll("[data-sort-key]"));
    const selectAllCheckboxes = Array.from(document.querySelectorAll("[data-select-side]"));
    const addClientDealDialog = document.getElementById("addClientDealDialog");
    const addClientDealForm = document.getElementById("addClientDealForm");
    const addClientDealDialogClose = document.getElementById("addClientDealDialogClose");
    const addClientDealCancelButton = document.getElementById("addClientDealCancelButton");
    const addClientDealSubmitButton = document.getElementById("addClientDealSubmitButton");
    const addClientDealLossConfirmation = document.getElementById("addClientDealLossConfirmation");
    const addClientDealClientPicker = document.getElementById("addClientDealClientPicker");
    const addClientDealClientPickerValue = document.getElementById("addClientDealClientPickerValue");
    const addClientDealClientPickerClear = document.getElementById("addClientDealClientPickerClear");
    const addClientDealClientPickerToggle = document.getElementById("addClientDealClientPickerToggle");
    const addClientDealClientOptions = document.getElementById("addClientDealClientOptions");
    const addClientDealPricingModeControl = document.getElementById("addClientDealPricingMode");
    const addClientDealPricingRulePicker = document.getElementById("addClientDealPricingRulePicker");
    const addClientDealAdditionalDetails = document.getElementById("addClientDealAdditionalDetails");
    const addHedgeDealDialog = document.getElementById("addHedgeDealDialog");
    const addHedgeDealForm = document.getElementById("addHedgeDealForm");
    const addHedgeDealDialogTitle = document.getElementById("addHedgeDealDialogTitle");
    const addHedgeDealDialogClose = document.getElementById("addHedgeDealDialogClose");
    const addHedgeDealCancelButton = document.getElementById("addHedgeDealCancelButton");
    const addHedgeDealSubmitButton = document.getElementById("addHedgeDealSubmitButton");
    const addHedgeDealPricingModeControl = document.getElementById("addHedgeDealPricingMode");
    const addHedgeDealPricingModeIcon = document.getElementById("addHedgeDealPricingModeIcon");
    const addHedgeDealSideControl = document.getElementById("addHedgeDealSide");
    const addHedgeDealCounterpartyPicker = document.getElementById("addHedgeDealCounterpartyPicker");
    const addHedgeDealCounterpartyPickerValue = document.getElementById("addHedgeDealCounterpartyPickerValue");
    const addHedgeDealCounterpartyPickerClear = document.getElementById("addHedgeDealCounterpartyPickerClear");
    const addHedgeDealCounterpartyPickerToggle = document.getElementById("addHedgeDealCounterpartyPickerToggle");
    const addHedgeDealCounterpartyOptions = document.getElementById("addHedgeDealCounterpartyOptions");
    const addHedgeDealPricingRulePicker = document.getElementById("addHedgeDealPricingRulePicker");
    const hedgeQuickModeSettingsForm = document.getElementById("hedgeQuickModeSettingsForm");
    const hedgeQuickModeSettingsHeader = document.getElementById("hedgeQuickModeSettingsHeader");
    const hedgeQuickModeSettingsBackButton = document.getElementById("hedgeQuickModeSettingsBackButton");
    const hedgeQuickModeSettingsActiveField = document.getElementById("hedgeQuickModeSettingsActiveField");
    const hedgeQuickModeSettingsOverview = document.getElementById("hedgeQuickModeSettingsOverview");
    const hedgeQuickModeSettingsEditor = document.getElementById("hedgeQuickModeSettingsEditor");
    const hedgeQuickModeSettingsGridEl = document.getElementById("hedgeQuickModeSettingsGrid");
    const hedgeQuickModeSettingsCount = document.getElementById("hedgeQuickModeSettingsCount");
    const hedgeQuickModeSettingsNewButton = document.getElementById("hedgeQuickModeSettingsNewButton");
    const hedgeQuickModeSettingsFooter = document.getElementById("hedgeQuickModeSettingsFooter");
    const hedgeQuickModeSettingsCancelButton = document.getElementById("hedgeQuickModeSettingsCancelButton");
    const hedgeQuickModeSettingsSaveButton = document.getElementById("hedgeQuickModeSettingsSaveButton");
    const hedgeQuickModeSettingsDeleteButton = document.getElementById("hedgeQuickModeSettingsDeleteButton");
    const hedgeQuickModeSettingsStatus = document.getElementById("hedgeQuickModeSettingsStatus");
    const hedgeQuickModeCounterpartyPicker = document.getElementById("hedgeQuickModeCounterpartyPicker");
    const hedgeQuickModeCounterpartyPickerValue = document.getElementById("hedgeQuickModeCounterpartyPickerValue");
    const hedgeQuickModeCounterpartyPickerClear = document.getElementById("hedgeQuickModeCounterpartyPickerClear");
    const hedgeQuickModeCounterpartyPickerToggle = document.getElementById("hedgeQuickModeCounterpartyPickerToggle");
    const hedgeQuickModeCounterpartyOptions = document.getElementById("hedgeQuickModeCounterpartyOptions");
    const hedgeQuickModePricingRulePicker = document.getElementById("hedgeQuickModePricingRulePicker");
    const hedgingSettingsSectionLinks = Array.from(
      document.querySelectorAll("[data-hedging-settings-section]")
    );
    const hedgingSettingsSectionPanels = Array.from(
      document.querySelectorAll("[data-hedging-settings-section-panel]")
    );
    const hedgingSettingsAutoGroupToggle = document.getElementById("autoHedgingSettingsGroupToggle");
    const hedgingSettingsAutoSubnav = document.getElementById("autoHedgingSettingsSubnav");
    const autoHedgingSettingsSegmentToggles = Array.from(
      document.querySelectorAll("[data-auto-hedging-segment-toggle]")
    );
    const autoHedgingAdmissionPolicyPanel = document.getElementById("autoHedgingAdmissionPolicyPanel");
    const autoHedgingAdmissionPolicyRevision = document.getElementById("autoHedgingAdmissionPolicyRevision");
    const autoHedgingAdmissionCcyPairEditButton = document.getElementById("autoHedgingAdmissionCcyPairEditButton");
    const autoHedgingAdmissionAmountLimitEditButton = document.getElementById("autoHedgingAdmissionAmountLimitEditButton");
    const autoHedgingAdmissionDeviationEditButton = document.getElementById("autoHedgingAdmissionDeviationEditButton");
    const autoHedgingAdmissionPairDialog = document.getElementById("autoHedgingAdmissionPairDialog");
    const autoHedgingAdmissionPairDialogForm = document.getElementById("autoHedgingAdmissionPairDialogForm");
    const autoHedgingAdmissionPairDialogClose = document.getElementById("autoHedgingAdmissionPairDialogClose");
    const autoHedgingAdmissionPairDialogCancel = document.getElementById("autoHedgingAdmissionPairDialogCancel");
    const autoHedgingAdmissionPairDialogSave = document.getElementById("autoHedgingAdmissionPairDialogSave");
    const autoHedgingAdmissionPairDialogStatus = document.getElementById("autoHedgingAdmissionPairDialogStatus");
    const autoHedgingAdmissionPairSearch = document.getElementById("autoHedgingAdmissionPairSearch");
    const autoHedgingAdmissionPairFilter = document.getElementById("autoHedgingAdmissionPairFilter");
    const autoHedgingAdmissionPairRows = document.getElementById("autoHedgingAdmissionPairRows");
    const autoHedgingAdmissionPairEmpty = document.getElementById("autoHedgingAdmissionPairEmpty");
    const autoHedgingAdmissionPolicyStatus = document.getElementById("autoHedgingAdmissionPolicyStatus");
    const autoHedgingManualReleaseSharedRevision = document.getElementById("autoHedgingManualReleaseSharedRevision");
    const autoHedgingManualReleaseSharedPairSummary = document.getElementById("autoHedgingManualReleaseSharedPairSummary");
    const autoHedgingManualReleaseSharedDeviation = document.getElementById("autoHedgingManualReleaseSharedDeviation");
    const batchingSettingsTabs = Array.from(
      document.querySelectorAll("[data-batching-settings-tab]")
    );
    const generalBatchingSettingsPanel = document.getElementById("generalBatchingSettingsPanel");
    const autoBatchingSettingsPanel = document.getElementById("autoBatchingSettingsPanel");
    const batchingSettingsForm = document.getElementById("batchingSettingsForm");
    const batchingSettingsSaveButton = document.getElementById("batchingSettingsSaveButton");
    const batchingSettingsStatus = document.getElementById("batchingSettingsStatus");
    const autoBatchingSettingsForm = document.getElementById("autoBatchingSettingsForm");
    const autoBatchingSettingsSaveButton = document.getElementById("autoBatchingSettingsSaveButton");
    const autoBatchingEligibleCcyPairCodes = document.getElementById("autoBatchingEligibleCcyPairCodes");
    const autoBatchingEligibleCcyPairCount = document.getElementById("autoBatchingEligibleCcyPairCount");
    const autoBatchingEligibleCcyPairSearch = document.getElementById("autoBatchingEligibleCcyPairSearch");
    const autoBatchingEligibleCcyPairSearchClear = document.getElementById("autoBatchingEligibleCcyPairSearchClear");
    const autoBatchingEligibleCcyPairEmpty = document.getElementById("autoBatchingEligibleCcyPairEmpty");
    const autoBatchingProcessFlowButton = document.getElementById("autoBatchingProcessFlowButton");
    const autoBatchingProcessFlowDialog = document.getElementById("autoBatchingProcessFlowDialog");
    const autoBatchingProcessFlowDialogClose = document.getElementById("autoBatchingProcessFlowDialogClose");
    const autoBatchingProcessFlowCloseButton = document.getElementById("autoBatchingProcessFlowCloseButton");
    const clientDealDuplicateCheckDialog = document.getElementById("clientDealDuplicateCheckDialog");
    const clientDealDuplicateCheckCloseButton = document.getElementById("clientDealDuplicateCheckCloseButton");
    const clientDealDuplicateCheckSummary = document.getElementById("clientDealDuplicateCheckSummary");
    const clientDealDuplicateCheckGridEl = document.getElementById("clientDealDuplicateCheckGrid");
    const clientDealDuplicateCheckStatus = document.getElementById("clientDealDuplicateCheckStatus");
    const clientDealDuplicateCheckCancelButton = document.getElementById("clientDealDuplicateCheckCancelButton");
    const clientDealDuplicateCheckConfirmButton = document.getElementById("clientDealDuplicateCheckConfirmButton");
    const editDialog = document.getElementById("editDealDialog");
    const editForm = document.getElementById("editDealForm");
    const dealIdentitySection = document.getElementById("dealIdentitySection");
    const dealPricingRuleResults = document.getElementById("dealPricingRuleResults");
    const editDialogClose = document.getElementById("editDialogClose");
    const editCancelButton = document.getElementById("editCancelButton");
    const clientDealGenerationDialog = document.getElementById("clientDealGenerationDialog");
    const clientDealGenerationProcessSettingsForm =
      document.getElementById("clientDealGenerationProcessSettingsForm");
    const clientDealGenerationProcessSettingsSave =
      document.getElementById("clientDealGenerationProcessSettingsSave");
    const clientDealGenerationSettingsRows = document.getElementById("clientDealGenerationSettingsRows");
    const clientDealGenerationSettingsStatus = document.getElementById("clientDealGenerationSettingsStatus");
    const generationDialogClose = document.getElementById("generationDialogClose");
    const generationCancelButton = document.getElementById("generationCancelButton");
    const marketPanels = Array.from(document.querySelectorAll("[data-market-panel]"));
    const marketCcyOptionRowsEl = document.getElementById("marketCcyOptionRows");
    const marketCcyOptionNewButton = document.getElementById("marketCcyOptionNewButton");
    const marketPairOptionRowsEl = document.getElementById("marketPairOptionRows");
    const marketStreamTable = document.getElementById("marketStreamTable");
    const marketPairOptionNewButton = document.getElementById("marketPairOptionNewButton");
    const marketStatusEl = document.getElementById("marketStatus");
    const marketStreamToggleButton = document.getElementById("marketStreamToggleButton");
    const marketStreamToggleIcon = document.getElementById("marketStreamToggleIcon");
    const marketStreamToggleText = document.getElementById("marketStreamToggleText");
    const marketSimulationDialog = document.getElementById("marketSimulationDialog");
    const marketSimulationForm = document.getElementById("marketSimulationForm");
    const marketSimulationDialogTitle = document.getElementById("marketSimulationDialogTitle");
    const marketSimulationDialogClose = document.getElementById("marketSimulationDialogClose");
    const marketSimulationCancelButton = document.getElementById("marketSimulationCancelButton");
    const databaseStatusEl = document.getElementById("databaseStatus");
    const databaseRefreshButton = document.getElementById("databaseRefreshButton");
    const databaseTableSearchEl = document.getElementById("databaseTableSearch");
    const databaseTableListEl = document.getElementById("databaseTableList");
    const databaseTableTitleEl = document.getElementById("databaseTableTitle");
    const databaseSchemaRowsEl = document.getElementById("databaseSchemaRows");
    const databaseForeignKeyRowsEl = document.getElementById("databaseForeignKeyRows");
    const databaseColorPalettePanelEl = document.getElementById("databaseColorPalettePanel");
    const databaseColorPaletteEl = document.getElementById("databaseColorPalette");
    const databaseDataHeadEl = document.getElementById("databaseDataHead");
    const databaseDataRowsEl = document.getElementById("databaseDataRows");
    const databaseCreateSqlEl = document.getElementById("databaseCreateSql");
    const DATABASE_TABLE_SECTIONS = Object.freeze([
      {
        id: "fx-trading",
        label: "FX Trades",
        icon: "currency_exchange",
        tables: [
          "client_fx_deals",
          "fx_hedge_deals",
          "fx_trade_exposure",
          "fx_batch_balance_trade",
          "fx_batch_position_output"
        ]
      },
      {
        id: "fx-position",
        label: "FX Position",
        icon: "table_chart",
        tables: [
          "fx_trade_position_management"
        ]
      },
      {
        id: "fx-batching",
        label: "FX Batching",
        icon: "stacks",
        tables: [
          "fx_batches",
          "fx_batch_members",
          "fx_batch_quote_cash_output"
        ]
      },
      {
        id: "pricing",
        label: "Pricing",
        icon: "price_change",
        tables: [
          "pricing_rules",
          "accounting_systems",
          "execution_contexts",
          "execution_systems",
          "servicing_locations"
        ]
      },
      {
        id: "settings",
        label: "Settings",
        icon: "settings",
        tables: [
          "ccy_options",
          "ccy_pair_options",
          "fx_hedge_quick_mode_settings",
          "fx_batching_settings",
          "fx_auto_batching_settings",
          "fx_auto_batching_ccy_pairs",
          "auto_hedging_admission_policy_current",
          "auto_hedging_admission_policy_revisions",
          "auto_hedging_admission_policy_pair_deviations",
          "auto_hedging_admission_policy_pair_rules"
        ]
      },
      {
        id: "ui-configuration",
        label: "UI Configuration",
        icon: "dashboard_customize",
        tables: [
          "ui_color_tokens",
          "ui_table_column_settings"
        ]
      },
      {
        id: "counterparties-users",
        label: "Trading Counterparties & Users",
        icon: "group",
        tables: [
          "trading_counterparties",
          "trading_counterparty_execution_contexts",
          "external_counterparties",
          "internal_units",
          "trading_counterparty_roles",
          "users"
        ]
      },
      {
        id: "demo-generation",
        label: "Demo & Generation",
        icon: "science",
        tables: [
          "client_deal_generation_process_settings",
          "client_deal_generation_settings",
          "market_quote_simulation_settings"
        ]
      },
      {
        id: "audit",
        label: "Audit",
        icon: "policy",
        tables: [
          "fx_trade_position_management_transitions",
          "fx_trade_market_snapshot",
          "fx_auto_hedging_admission_decisions",
          "v_fx_batch_formation_audit"
        ]
      },
      {
        id: "other",
        label: "Other",
        icon: "more_horiz",
        tables: []
      }
    ]);
    const DATABASE_TABLE_SECTION_BY_ID = new Map(
      DATABASE_TABLE_SECTIONS.map(section => [section.id, section])
    );
    const DATABASE_TABLE_SECTION_ID_BY_TABLE = new Map(
      DATABASE_TABLE_SECTIONS.flatMap(section =>
        section.tables.map(tableName => [tableName, section.id])
      )
    );
    const selectedTradeIds = new Set();
    let activeFxPositionMode = "MANUAL";
    const FX_DEALS_VIEW_MODE_STANDARD = "STANDARD";
    const FX_DEALS_VIEW_MODE_AUDIT = "AUDIT";
    const FX_BATCHES_VIEW_MODE_STANDARD = "STANDARD";
    const FX_BATCHES_VIEW_MODE_AUDIT = "AUDIT";
    let clientFxDealsGrid = null;
    let clientFxDealsGridReady = false;
    let clientFxDealsPendingData = [];
    let clientFxDealsTotalCount = 0;
    let clientFxDealsViewMode = FX_DEALS_VIEW_MODE_STANDARD;
    let batchingHistoryGrid = null;
    let batchingHistoryGridReady = false;
    let fxBatchesViewMode = FX_BATCHES_VIEW_MODE_STANDARD;
    let batchDetailsMembersGrid = null;
    let batchDetailsCashOutputGrid = null;
    let batchDetailsOutputsGrid = null;
    let batchDetailsRequestSequence = 0;
    let rollbackBatchId = null;
    let hedgeFxDealsGrid = null;
    let hedgeFxDealsGridReady = false;
    let hedgeFxDealsPendingData = [];
    let hedgeFxDealsTotalCount = 0;
    let hedgeFxDealsViewMode = FX_DEALS_VIEW_MODE_STANDARD;
    let analyticalPnlReportRequestSequence = 0;
    let analyticalPnlReportSummaryGrid = null;
    let analyticalPnlReportSummaryGridReady = false;
    let analyticalPnlReportSummaryPendingData = null;
    let selectedCurrencyPair = loadSelectedCurrencyPair();
    let editingDealId = null;
    let marketCcyOptionsEditState = null;
    let marketPairOptionsEditState = null;
    let marketSettingsRouteScope = null;
    let editingMarketSimulationCurrencyPair = null;
    let marketCcyOptionGrid = null;
    let marketPairOptionGrid = null;
    let marketStreamGrid = null;
    let marketCcyOptionGridReady = false;
    let marketPairOptionGridReady = false;
    let marketStreamGridReady = false;
    let marketStreamGridSignature = "";
    const marketLastQuotes = new Map();
    let marketStreamRunning = false;
    let marketStreamConnected = false;
    let marketStreamEventSource = null;
    let selectedDatabaseTable = "";
    let databaseTables = [];
    let databaseTableSearchQuery = "";
    const expandedDatabaseTableSections = new Set();
    let addClientDealPricingRulesExpanded = false;
    let addClientDealManualTransferEdited = false;
    let addHedgeDealCounterpartyPickerExpanded = false;
    let addHedgeDealPricingRulesExpanded = false;
    let addHedgeDealPricingModeLocked = false;
    let addHedgeDealSideLocked = false;
    let addHedgeDealQuickModeSelection = null;
    let addHedgeDealPositionManagementMode = null;
    const selectedHedgeQuickModePresetCodes = new Map();
    let hedgeQuickModeAlignmentFrame = null;
    let hedgeQuickModeToolbarSignature = "";
    let hedgeQuickModeUnlocked = false;
    let hedgeQuickModeCounterpartyPickerExpanded = false;
    let hedgeQuickModePricingRulesExpanded = false;
    let hedgeQuickModeSettingsGrid = null;
    let hedgeQuickModeSettingsGridReady = false;
    let hedgeQuickModeSettingsView = "overview";
    let hedgeQuickModeSettingsSaving = false;
    let autoHedgingAdmissionPolicySaving = false;
    let autoHedgingAdmissionPolicyLoaded = false;
    let autoHedgingAdmissionPolicyEventsBound = false;
    let autoHedgingAdmissionPairDialogSnapshot = null;
    let autoHedgingAdmissionPairDialogReturnFocus = null;
    let autoHedgingAdmissionPairDialogFocus = "ccy-pair";
    let autoHedgingAdmissionPairDialogFocusTimer = null;
    let hedgeQuickModeDealCreating = false;
    let addClientDealSubmitWithControl = false;
    let clientDealDuplicateCheckGrid = null;
    let pendingClientDealCreation = null;
    let editingClientProfileIndex = null;
    const tradingCounterpartyExecutionContexts = new Map();
    const tradingCounterpartyExecutionContextLoadStates = new Map();
    let clientExecutionContextRequestSequence = 0;
    let clientExecutionContextAttachCounterpartyId = "";
    let clientExecutionContextAttachSortDirection = "asc";
    let clientExecutionContextAttachSaving = false;
    const selectedClientExecutionContextIds = new Set();
    const pendingClientExecutionContextDetaches = new Set();
    let activeTradingCounterpartyScope = "EXTERNAL";
    let editingUserIndex = null;
    let tradingCounterpartyRowEditState = null;
    let clientProfileRouteScope = null;
    let clientProfileRouteScopeRequestSequence = 0;
    let userRowEditState = null;
    let referenceDataEditState = null;
    let tradingCounterpartyIdSortDirection = "asc";
    let usersIdSortDirection = "asc";
    let pricingContextIdSortDirection = "asc";
    let pricingContextRouteScope = null;
    let pricingContextFocusTimer = null;
    let pricingRuleIdSortDirection = "asc";
    let pricingRulesRouteScope = null;
    let pricingRulesFocusTimer = null;
    let servicingBranchIdSortDirection = "asc";
    let settlementSystemIdSortDirection = "asc";
    let tradeCaptureChannelIdSortDirection = "asc";
    const tradingCounterpartyFilterFields = ["partyType", "clientCodeType", "counterpartyType", "active"];
    const tradingCounterpartyFilterState = {
      partyType: new Set(),
      counterpartyType: new Set(),
      clientCodeType: new Set(),
      active: new Set()
    };
    const tradingCounterpartyFilterKnownValues = {
      partyType: [],
      counterpartyType: [],
      clientCodeType: [],
      active: []
    };
    const tradingCounterpartyFilterInitialized = new Set();
    let pricingContextEditState = null;
    let pricingRuleEditState = null;
    let activePricingRulesScope = "EXTERNAL";
    let clientPricingRuleEditState = null;
    let clientPricingRuleInlineEditorState = null;
    const clientPricingConfigurationCollapsedContexts = new Map();
    let clientPricingContextBuilderState = {
      servicingBranchCode: "",
      settlementSystemId: "",
      tradeCaptureChannelId: "",
      lastChangedFacet: ""
    };
    let clientPricingContextOpenFacet = "";
    let clientPricingContextCandidatesExpanded = false;
    let pricingRulesClientInnFilter = "";
    const uiTableLayoutsByKey = new Map(
      UI_TABLE_LAYOUT_BOOTSTRAP
        .map(normalizedUiTableLayout)
        .filter(Boolean)
        .map(tableLayout => [tableLayout.tableKey, tableLayout])
    );
    const uiTableTabulatorInstances = new Map();
    let activeUiTableLayoutKey = "";
    let activeUiTableLayoutColumnKeys = null;
    let activeUiTableLayoutTitle = "";
    const sortState = {
      key: "tradeRate",
      direction: "asc"
    };
    const sortAccessors = {
      positionId: deal => positionIdSortValue(deal),
      tradeRate: deal => fxPositionTradeRate(deal),
      transferRate: deal => fxPositionTransferRate(deal),
      marketBid: deal => marketBid(deal),
      marketOffer: deal => marketOffer(deal)
    };

    function amountCell(value) {
      return !Number.isFinite(value) || value === 0 ? "" : amountFormatter.format(value).replace(/,/g, " ");
    }

    function amountInputValue(value) {
      const normalizedValue = Object.is(value, -0) ? 0 : value;

      return normalizedValue === null || normalizedValue === undefined
        ? ""
        : amountFormatter.format(normalizedValue).replace(/,/g, " ");
    }

    function rateCell(value) {
      return value === null || value === undefined ? "" : rateFormatter.format(value);
    }

    function escapeHtml(value) {
      return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }

    let activeTooltipTarget = null;
    const titleTooltipTargets = new WeakSet();
    const tradeIdCopyFeedbackTimers = new WeakMap();

    function initializeTooltipElement(element) {
      if (!(element instanceof Element)) {
        return null;
      }

      if (!element.dataset.tooltip?.trim()) {
        return null;
      }

      bindAppTooltip(element);
      return element;
    }

    function initializeTooltips(root = document) {
      if (root instanceof Element) {
        initializeTooltipElement(root);
      }

      root.querySelectorAll?.("[data-tooltip]").forEach(initializeTooltipElement);
    }

    function migrateNativeTooltipElement(element) {
      if (!(element instanceof Element) || !element.hasAttribute("title")) {
        return;
      }

      const titleText = element.getAttribute("title")?.trim();
      const tooltipText = element.dataset.tooltip?.trim();

      if (titleText && (!tooltipText || titleTooltipTargets.has(element))) {
        element.dataset.tooltip = titleText;
        titleTooltipTargets.add(element);
      }

      element.removeAttribute("title");
      initializeTooltipElement(element);
    }

    function migrateNativeTooltips(root = document) {
      if (root instanceof Element) {
        migrateNativeTooltipElement(root);
      }

      root.querySelectorAll?.("[title]").forEach(migrateNativeTooltipElement);
    }

    function hideAppTooltip() {
      activeTooltipTarget = null;
      appTooltipEl.classList.remove("is-visible");
      appTooltipEl.setAttribute("aria-hidden", "true");

      if (
        typeof appTooltipEl.hidePopover === "function"
        && appTooltipEl.matches(":popover-open")
      ) {
        appTooltipEl.hidePopover();
      }
    }

    function showAppTooltip(target) {
      const tooltipText = target?.dataset.tooltip?.trim();

      if (!tooltipText) {
        hideAppTooltip();
        return;
      }

      activeTooltipTarget = target;
      const supportsPopover = typeof appTooltipEl.showPopover === "function";

      if (supportsPopover) {
        if (!appTooltipEl.matches(":popover-open")) {
          appTooltipEl.showPopover();
        }
      } else {
        const tooltipHost = target.closest("dialog") || document.body;

        if (appTooltipEl.parentElement !== tooltipHost) {
          tooltipHost.append(appTooltipEl);
        }
      }

      appTooltipEl.textContent = tooltipText;
      appTooltipEl.style.left = "0px";
      appTooltipEl.style.top = "0px";
      appTooltipEl.classList.add("is-visible");
      appTooltipEl.setAttribute("aria-hidden", "false");

      const targetRect = target.getBoundingClientRect();
      const tooltipRect = appTooltipEl.getBoundingClientRect();
      const viewportMargin = 8;
      const targetGap = 7;
      const maximumLeft = Math.max(viewportMargin, window.innerWidth - tooltipRect.width - viewportMargin);
      const centeredLeft = targetRect.left + ((targetRect.width - tooltipRect.width) / 2);
      const left = Math.min(Math.max(centeredLeft, viewportMargin), maximumLeft);
      let top = targetRect.bottom + targetGap;

      if (top + tooltipRect.height > window.innerHeight - viewportMargin) {
        top = targetRect.top - tooltipRect.height - targetGap;
      }

      appTooltipEl.style.left = `${Math.round(left)}px`;
      appTooltipEl.style.top = `${Math.max(viewportMargin, Math.round(top))}px`;
    }

    function repositionAppTooltip() {
      if (activeTooltipTarget?.isConnected) {
        showAppTooltip(activeTooltipTarget);
      } else {
        hideAppTooltip();
      }
    }

    function handleAppTooltipEnter(event) {
      showAppTooltip(event.currentTarget);
    }

    function handleAppTooltipLeave(event) {
      if (event.currentTarget.contains(document.activeElement)) {
        return;
      }

      hideAppTooltip();
    }

    function handleAppTooltipFocus(event) {
      showAppTooltip(event.currentTarget);
    }

    function handleAppTooltipBlur(event) {
      if (event.currentTarget.matches(":hover")) {
        return;
      }

      hideAppTooltip();
    }

    function bindAppTooltip(element) {
      if (element.dataset.tooltipBound === "true") {
        return;
      }

      element.dataset.tooltipBound = "true";
      element.addEventListener("mouseenter", handleAppTooltipEnter);
      element.addEventListener("mouseleave", handleAppTooltipLeave);
      element.addEventListener("focus", handleAppTooltipFocus);
      element.addEventListener("blur", handleAppTooltipBlur);
    }

    function editNumber(value, scale) {
      return value === null || value === undefined ? "" : Number(value).toFixed(scale);
    }

    function normalizeNumber(value) {
      const compact = String(value ?? "").trim().replace(/\s/g, "");

      if (!compact) {
        return null;
      }

      const normalized = compact.includes(".")
        ? compact.replace(/,/g, "")
        : compact.replace(",", ".");

      return Number(normalized);
    }

    function normalizedDecimalInputText(value) {
      const compact = String(value ?? "").trim().replace(/\s/g, "");

      if (!compact) {
        return null;
      }

      const normalized = compact.includes(".")
        ? compact.replace(/,/g, "")
        : compact.replace(",", ".");

      if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) {
        return null;
      }

      try {
        return new Big(normalized).toFixed();
      } catch {
        return null;
      }
    }

    function positiveDecimalInputText(value) {
      const text = normalizedDecimalInputText(value);

      if (text === null) {
        return null;
      }

      try {
        return new Big(text).gt(0) ? text : null;
      } catch {
        return null;
      }
    }

    function groupedDecimalText(value) {
      const text = String(value ?? "");
      const match = /^([+-]?)(\d+)(\.\d+)?$/.exec(text);

      if (!match) {
        return text;
      }

      const groupedInteger = match[2].replace(/\B(?=(\d{3})+(?!\d))/g, " ");
      return `${match[1]}${groupedInteger}${match[3] || ""}`;
    }

    function groupDecimalInputValue(input) {
      if (!input || input.readOnly) {
        return;
      }

      const rawValue = String(input.value || "");
      const compactValue = rawValue.replace(/\s+/g, "");

      if (!/^\d*(?:[.,]\d*)?$/.test(compactValue)) {
        return;
      }

      const decimalSeparator = compactValue.includes(",")
        ? ","
        : compactValue.includes(".") ? "." : "";
      const [integerPart = "", fractionPart = ""] = decimalSeparator
        ? compactValue.split(decimalSeparator)
        : [compactValue, ""];
      const groupedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
      const groupedValue = `${groupedInteger}${decimalSeparator}${fractionPart}`;

      if (groupedValue === rawValue) {
        return;
      }

      const selectionStart = input.selectionStart;
      const significantCharactersBeforeCaret = Number.isInteger(selectionStart)
        ? rawValue.slice(0, selectionStart).replace(/\s+/g, "").length
        : null;
      input.value = groupedValue;

      if (significantCharactersBeforeCaret === null) {
        return;
      }

      if (significantCharactersBeforeCaret === 0) {
        input.setSelectionRange(0, 0);
        return;
      }

      let significantCharacters = 0;
      let nextCaret = groupedValue.length;

      for (let index = 0; index < groupedValue.length; index += 1) {
        if (!/\s/.test(groupedValue[index])) {
          significantCharacters += 1;
        }

        if (significantCharacters === significantCharactersBeforeCaret) {
          nextCaret = index + 1;
          break;
        }
      }

      input.setSelectionRange(nextCaret, nextCaret);
    }

    function currencyFractionDigits(ccyCode) {
      const currency = ccyOptions.find(option =>
        option.code === String(ccyCode || "").trim().toUpperCase()
      );

      return Number.isInteger(currency?.fractionDigits) ? currency.fractionDigits : 2;
    }

    function decimalPowerOfTen(fractionDigits) {
      return new Big(10).pow(fractionDigits);
    }

    function majorToMinorExactDecimal(amountText, fractionDigits) {
      const scaledAmount = new Big(amountText)
        .times(decimalPowerOfTen(fractionDigits));
      const roundedAmount = scaledAmount.round(0, Big.roundHalfUp);

      return scaledAmount.eq(roundedAmount) ? roundedAmount : null;
    }

    function validateMinorPrecision(input, ccyCode, fractionDigits) {
      const amountText = positiveDecimalInputText(input.value);
      const hasValidPrecision = amountText === null
        || majorToMinorExactDecimal(amountText, fractionDigits) !== null;

      input.setCustomValidity(hasValidPrecision
        ? ""
        : `${ccyCode} amount supports no more than ${fractionDigits} fractional digits.`);

      return hasValidPrecision;
    }

    function minorToMajorDecimal(minorAmount, fractionDigits) {
      return new Big(minorAmount)
        .div(decimalPowerOfTen(fractionDigits))
        .toFixed(fractionDigits);
    }

    function formattedMinorAmount(minorAmount, fractionDigits) {
      return groupedDecimalText(minorToMajorDecimal(minorAmount, fractionDigits));
    }

    function minorAmountCell(minorAmount, fractionDigits) {
      let minor;

      try {
        minor = BigInt(minorAmount);
      } catch {
        return "";
      }

      return minor === 0n ? "" : formattedMinorAmount(minor.toString(), fractionDigits);
    }

    function exactFxAmountsFromDealt({
      dealtAmount,
      dealtCcyCode,
      baseCcyCode,
      quoteCcyCode,
      baseFractionDigits,
      quoteFractionDigits,
      tradeRate
    }) {
      const dealtText = positiveDecimalInputText(dealtAmount);
      const rateText = positiveDecimalInputText(tradeRate);

      if (!dealtText || !rateText) {
        return null;
      }

      const rate = new Big(rateText);

      if (dealtCcyCode === baseCcyCode) {
        const baseAmountMinor = majorToMinorExactDecimal(dealtText, baseFractionDigits);

        if (baseAmountMinor === null) {
          return null;
        }

        const quoteAmountMinor = baseAmountMinor
          .div(decimalPowerOfTen(baseFractionDigits))
          .times(rate)
          .times(decimalPowerOfTen(quoteFractionDigits))
          .round(0, Big.roundHalfUp);

        return { baseAmountMinor, quoteAmountMinor };
      }

      if (dealtCcyCode === quoteCcyCode) {
        const quoteAmountMinor = majorToMinorExactDecimal(dealtText, quoteFractionDigits);

        if (quoteAmountMinor === null) {
          return null;
        }

        const baseAmountMinor = quoteAmountMinor
          .div(decimalPowerOfTen(quoteFractionDigits))
          .div(rate)
          .times(decimalPowerOfTen(baseFractionDigits))
          .round(0, Big.roundHalfUp);

        return { baseAmountMinor, quoteAmountMinor };
      }

      return null;
    }

    function exactAnalyticalPnlText({
      side,
      baseCcyAmount,
      tradeRate,
      transferRate,
      quoteFractionDigits
    }) {
      const baseAmountText = positiveDecimalInputText(baseCcyAmount);
      const tradeRateText = positiveDecimalInputText(tradeRate);
      const transferRateText = positiveDecimalInputText(transferRate);

      if (!["BUY", "SELL"].includes(side)
        || !baseAmountText
        || !tradeRateText
        || !transferRateText) {
        return null;
      }

      const trade = new Big(tradeRateText);
      const transfer = new Big(transferRateText);
      const delta = side === "BUY" ? trade.minus(transfer) : transfer.minus(trade);

      return new Big(baseAmountText)
        .times(delta)
        .round(quoteFractionDigits, Big.roundHalfUp)
        .toFixed(quoteFractionDigits);
    }

    function parsePositiveDecimalInput(input, label) {
      const value = positiveDecimalInputText(input.value);
      const valid = value !== null;

      input.setCustomValidity(valid ? "" : `${label} must be a positive decimal.`);

      if (!valid) {
        input.reportValidity();
        return null;
      }

      return value;
    }

    function formatGroupedNumberInput(value) {
      const compact = String(value ?? "").trim().replace(/\s/g, "");
      const match = /^(\d+)([.,]\d*)?$/.exec(compact);

      if (!match) {
        return String(value ?? "");
      }

      const integerPart = match[1]
        .replace(/^0+(?=\d)/, "")
        .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
      return `${integerPart}${match[2] || ""}`;
    }

    function formatGroupedNumberInputElement(input) {
      const selectionStart = input.selectionStart ?? input.value.length;
      const compactCursor = input.value
        .slice(0, selectionStart)
        .replace(/\s/g, "")
        .length;
      const formatted = formatGroupedNumberInput(input.value);

      if (formatted === input.value) {
        return;
      }

      input.value = formatted;
      let formattedCursor = 0;
      let compactCharacters = 0;

      while (formattedCursor < formatted.length && compactCharacters < compactCursor) {
        if (!/\s/.test(formatted[formattedCursor])) {
          compactCharacters += 1;
        }

        formattedCursor += 1;
      }

      input.setSelectionRange(formattedCursor, formattedCursor);
    }

    function sameNumber(left, right, tolerance = 0.0000001) {
      return Math.abs(Number(left) - Number(right)) <= tolerance;
    }

    function setSaveButtonAvailability(button, canSave, disabledTitle = "No changes to save") {
      if (!button) {
        return;
      }

      button.disabled = !canSave;
      button.title = canSave ? "Save" : disabledTitle;
    }

    function parseFormNumber(input, label, options = {}) {
      const value = normalizeNumber(input.value);
      const allowZero = options.allowZero === true;
      const valid = value !== null && Number.isFinite(value) && value >= 0 && (allowZero || value > 0);

      input.setCustomValidity(valid ? "" : `${label} must be a positive number.`);

      if (!valid) {
        input.reportValidity();
        return null;
      }

      return value;
    }

    function parseOptionalFormNumber(input, label) {
      const value = normalizeNumber(input.value);
      const valid = value === null || (Number.isFinite(value) && value > 0);

      input.setCustomValidity(valid ? "" : `${label} must be empty or a positive number.`);

      if (!valid) {
        input.reportValidity();
        return undefined;
      }

      return value;
    }

    function parseRequiredText(input, label) {
      const value = input.value.trim();

      input.setCustomValidity(value ? "" : `${label} is required.`);

      if (!value) {
        input.reportValidity();
        return null;
      }

      return value;
    }

    function parseCurrencyPairInput(input) {
      const rawValue = input.value.trim().toUpperCase().replace(/\s/g, "");
      const match = /^([A-Z]{3})\/([A-Z]{3})$/.exec(rawValue) || /^([A-Z]{3})([A-Z]{3})$/.exec(rawValue);
      const valid = Boolean(match);

      input.setCustomValidity(valid ? "" : "Ccy Pair must look like EUR/USD.");

      if (!valid) {
        input.reportValidity();
        return null;
      }

      return currencyPairValue(match[1], match[2]);
    }

    function parseDealSide(input) {
      const value = input.value;
      const valid = value === "sell" || value === "buy";

      input.setCustomValidity(valid ? "" : "Side is required.");

      if (!valid) {
        input.reportValidity();
        return null;
      }

      return value;
    }

    function parseBranchCode(input) {
      const value = input.value.trim();
      const valid = isValidServicingLocationId(value);

      input.setCustomValidity(valid ? "" : "Servicing Location ID must contain 1 to 10 characters.");

      if (!valid) {
        input.reportValidity();
        return null;
      }

      return value;
    }

    function isValidServicingLocationId(value) {
      return typeof value === "string" && value.length >= 1 && value.length <= 10;
    }

    function parseInn(input) {
      const value = input.value.trim();
      const valid = /^\d{10,12}$/.test(value);

      input.setCustomValidity(valid ? "" : "INN must contain 10 to 12 digits.");

      if (!valid) {
        input.reportValidity();
        return null;
      }

      return value;
    }

    function normalizedClientCodeType(value, fallback = "INN") {
      const normalized = normalizedContextCode(value);

      return COUNTERPARTY_CODE_TYPES.includes(normalized) ? normalized : fallback;
    }

    function normalizedCounterpartyType(value, fallback = "CLIENT") {
      const normalized = normalizedContextCode(value);

      return COUNTERPARTY_ROLES.includes(normalized) ? normalized : fallback;
    }

    function normalizedCounterpartyScope(value, fallback = "EXTERNAL") {
      const normalized = normalizedContextCode(value);

      return COUNTERPARTY_SCOPES.includes(normalized) ? normalized : fallback;
    }

    function normalizedExternalCounterpartyKind(value, fallback = "CORPORATE") {
      const source = normalizedContextCode(value);
      const normalized = source === "ORGANIZATION"
        ? "CORPORATE"
        : source === "FUND"
          ? "NON_BANK_FINANCIAL_INSTITUTION"
          : source;

      return EXTERNAL_COUNTERPARTY_KINDS.includes(normalized) ? normalized : fallback;
    }

    function externalCounterpartyKindLabel(value) {
      const normalized = normalizedExternalCounterpartyKind(value);
      return EXTERNAL_COUNTERPARTY_KIND_LABELS[normalized] || normalized;
    }

    function normalizedInternalUnitType(value, fallback = "DESK") {
      const normalized = normalizedContextCode(value);

      return INTERNAL_UNIT_TYPES.includes(normalized) ? normalized : fallback;
    }

    function normalizedCounterpartyRoles(value, fallbackRole = "CLIENT") {
      const source = Array.isArray(value) ? value : [];
      const roles = source
        .map(role => normalizedContextCode(role))
        .filter(role => COUNTERPARTY_ROLES.includes(role));

      if (roles.length === 0 && COUNTERPARTY_ROLES.includes(normalizedContextCode(fallbackRole))) {
        roles.push(normalizedContextCode(fallbackRole));
      }

      return [...new Set(roles)]
        .sort((left, right) => COUNTERPARTY_ROLES.indexOf(left) - COUNTERPARTY_ROLES.indexOf(right));
    }

    function tradingCounterpartyHasRole(profile, roleCode) {
      return normalizedCounterpartyRoles(profile?.counterpartyRoles, profile?.counterpartyType).includes(roleCode);
    }

    function tradingCounterpartyRolesLabel(profile) {
      return normalizedCounterpartyRoles(profile?.counterpartyRoles, profile?.counterpartyType).join(", ");
    }

    function tradingCounterpartyPartyType(profile) {
      return normalizedCounterpartyScope(profile?.counterpartyScope) === "INTERNAL"
        ? normalizedInternalUnitType(profile?.unitType)
        : normalizedExternalCounterpartyKind(profile?.externalCounterpartyKind);
    }

    function tradingCounterpartyPartyTypeLabel(profile) {
      return normalizedCounterpartyScope(profile?.counterpartyScope) === "INTERNAL"
        ? tradingCounterpartyPartyType(profile)
        : externalCounterpartyKindLabel(tradingCounterpartyPartyType(profile));
    }

    function tradingCounterpartyBusinessIdType(profile) {
      return normalizedCounterpartyScope(profile?.counterpartyScope) === "INTERNAL"
        ? "INTERNAL_UNIT_CODE"
        : normalizedClientCodeType(profile?.clientCodeType);
    }

    function isValidClientCodeForType(value, clientCodeType) {
      const code = String(value ?? "").trim();
      const type = normalizedClientCodeType(clientCodeType);

      return type === "INN"
        ? /^\d{10,12}$/.test(code)
        : /^[A-Z0-9_-]{2,20}$/.test(code);
    }

    function parseClientCode(input, clientCodeType) {
      const type = normalizedClientCodeType(clientCodeType);
      const value = type === "INN"
        ? input.value.trim()
        : normalizedContextCode(input.value);
      const valid = isValidClientCodeForType(value, type);

      input.value = value;
      input.setCustomValidity(valid ? "" : type === "INN"
        ? "Business ID with type INN must contain 10 to 12 digits."
        : "Business ID must contain 2 to 20 letters, digits, '_' or '-'.");

      if (!valid) {
        input.reportValidity();
        return null;
      }

      return value;
    }

    function clientCodeTypeOptions(selectedValue = "INN") {
      const selected = normalizedClientCodeType(selectedValue);

      return EXTERNAL_COUNTERPARTY_CODE_TYPES
        .map(value => `<option value="${escapeHtml(value)}" ${value === selected ? "selected" : ""}>${escapeHtml(value)}</option>`)
        .join("");
    }

    function counterpartyTypeOptions(selectedValue = "CLIENT") {
      const selected = normalizedCounterpartyType(selectedValue);

      return COUNTERPARTY_ROLES
        .map(value => `<option value="${escapeHtml(value)}" ${value === selected ? "selected" : ""}>${escapeHtml(value)}</option>`)
        .join("");
    }

    function externalCounterpartyKindOptions(selectedValue = "CORPORATE") {
      const selected = normalizedExternalCounterpartyKind(selectedValue);

      return EXTERNAL_COUNTERPARTY_KINDS
        .map(value => `<option value="${escapeHtml(value)}" ${value === selected ? "selected" : ""}>${escapeHtml(externalCounterpartyKindLabel(value))}</option>`)
        .join("");
    }

    function internalUnitTypeOptions(selectedValue = "DESK") {
      const selected = normalizedInternalUnitType(selectedValue);

      return INTERNAL_UNIT_TYPES
        .map(value => `<option value="${escapeHtml(value)}" ${value === selected ? "selected" : ""}>${escapeHtml(value)}</option>`)
        .join("");
    }

    function parseContextCode(input, label) {
      const value = normalizedContextCode(input.value);
      const valid = /^[A-Z0-9_-]{2,40}$/.test(value);

      input.value = value;
      input.setCustomValidity(valid ? "" : `${label} must contain 2 to 40 letters, digits, '_' or '-'.`);

      if (!valid) {
        input.reportValidity();
        return null;
      }

      return value;
    }

    function loadSelectedCurrencyPair() {
      return DemoDb.get("selectedCurrencyPair") || "";
    }

    function saveSelectedCurrencyPair() {
      DemoDb.set("selectedCurrencyPair", selectedCurrencyPair);
    }

    function parsePercentInput(input, label, maxExclusive = Infinity) {
      const value = normalizeNumber(input.value);
      const valid = value !== null && Number.isFinite(value) && value >= 0 && value < maxExclusive;

      input.setCustomValidity(
        valid
          ? ""
          : Number.isFinite(maxExclusive)
            ? `${label} must be from 0 up to, but not including, ${maxExclusive}.`
            : `${label} must be a non-negative percentage.`
      );

      if (!valid) {
        input.reportValidity();
        return null;
      }

      return value;
    }

    function defaultInnForClientName(name) {
      return DEFAULT_CLIENT_PROFILES.find(profile => profile.name === name)?.inn || "7700000000";
    }

    function normalizedInn(value, fallback) {
      const normalized = String(value ?? "").trim();

      return /^\d{10,12}$/.test(normalized) ? normalized : fallback;
    }

    function normalizedClientCode(value, clientCodeType, fallback) {
      const type = normalizedClientCodeType(clientCodeType);
      const normalized = type === "INN"
        ? String(value ?? "").trim()
        : normalizedContextCode(value);

      return isValidClientCodeForType(normalized, type) ? normalized : fallback;
    }

    function normalizedClientProfiles(value, fallback = DEFAULT_CLIENT_PROFILES) {
      const source = Array.isArray(value) ? value : fallback;
      const normalized = source
        .map(item => {
          const name = String(item?.counterpartyName ?? item?.counterparty_name ?? item?.name ?? "").trim();
          const sourceCodeType = item?.counterpartyCodeType ?? item?.counterparty_code_type ?? item?.clientCodeType ?? item?.client_code_type;
          const inferredScope = item?.unitCode !== undefined
            || ["INTERNAL_UNIT_CODE", "FRONT_SYSTEM_FOLDER_ID"].includes(normalizedContextCode(sourceCodeType))
            || normalizedContextCode(item?.counterpartyType ?? item?.counterparty_type) === "INTERNAL_DESK"
            ? "INTERNAL"
            : "EXTERNAL";
          const counterpartyScope = normalizedCounterpartyScope(item?.counterpartyScope ?? item?.counterparty_scope, inferredScope);
          const defaultRole = counterpartyScope === "INTERNAL" ? "HEDGE_COUNTERPARTY" : "CLIENT";
          const counterpartyRoles = normalizedCounterpartyRoles(
            item?.counterpartyRoles ?? item?.counterparty_roles,
            item?.counterpartyType ?? item?.counterparty_type ?? defaultRole
          );
          const clientCodeType = counterpartyScope === "INTERNAL"
            ? "INTERNAL_UNIT_CODE"
            : normalizedClientCodeType(
                sourceCodeType,
                normalizedContextCode(sourceCodeType) ? "OTHER" : "INN"
              );
          const fallbackCode = clientCodeType === "INN"
            ? defaultInnForClientName(name)
            : "";
          const counterpartyIdValue = Number(item?.counterpartyId ?? item?.counterparty_id);
          const sourceCode = counterpartyScope === "INTERNAL"
            ? item?.unitCode ?? item?.unit_code ?? item?.counterpartyCode ?? item?.counterparty_code ?? item?.inn
            : item?.externalCounterpartyCode ?? item?.external_counterparty_code ?? item?.counterpartyCode ?? item?.counterparty_code ?? item?.inn ?? item?.clientCode ?? item?.client_code;

          return {
            counterpartyId: Number.isInteger(counterpartyIdValue) && counterpartyIdValue > 0 ? counterpartyIdValue : null,
            counterpartyScope,
            counterpartyRoles,
            counterpartyType: counterpartyRoles[0] || defaultRole,
            name,
            inn: normalizedClientCode(sourceCode, clientCodeType, fallbackCode),
            clientCodeType,
            externalCounterpartyKind: normalizedExternalCounterpartyKind(
              item?.externalCounterpartyKind ?? item?.external_counterparty_kind,
              "CORPORATE"
            ),
            unitType: normalizedInternalUnitType(item?.unitType ?? item?.unit_type, "DESK"),
            isActive: Boolean(item?.active ?? item?.isActive ?? item?.is_active ?? true)
          };
        })
        .filter(item => item.name && isValidClientCodeForType(item.inn, item.clientCodeType));

      return normalized.length > 0 || Array.isArray(value)
        ? normalized
        : fallback.map(item => ({
            ...item,
            counterpartyId: null,
            counterpartyScope: "EXTERNAL",
            counterpartyRoles: normalizedCounterpartyRoles(item.counterpartyRoles, item.counterpartyType || "CLIENT"),
            counterpartyType: normalizedCounterpartyType(item.counterpartyType, "CLIENT"),
            externalCounterpartyKind: normalizedExternalCounterpartyKind(item.externalCounterpartyKind, "CORPORATE"),
            unitType: "DESK",
            isActive: item.isActive !== false
          }));
    }

    function normalizedUsers(value, fallback = DEFAULT_USERS) {
      const source = Array.isArray(value) ? value : fallback;
      const normalized = (Array.isArray(source) ? source : [])
        .map(item => {
          const userIdValue = Number(item?.userId ?? item?.user_id);
          const userCode = String(item?.userCode ?? item?.user_code ?? "").trim().toUpperCase();
          const userRole = String(item?.userRole ?? item?.user_role ?? "").trim().toUpperCase();

          return {
            userId: Number.isInteger(userIdValue) && userIdValue > 0 ? userIdValue : null,
            userCode,
            firstName: String(item?.firstName ?? item?.first_name ?? "").trim(),
            lastName: String(item?.lastName ?? item?.last_name ?? "").trim(),
            userRole: USER_ROLES.includes(userRole) ? userRole : "DEALER",
            active: Boolean(item?.active ?? item?.isActive ?? item?.is_active ?? true)
          };
        })
        .filter(item =>
          /^[A-Z0-9._-]{2,30}$/.test(item.userCode)
          && item.firstName.length >= 1
          && item.firstName.length <= 50
          && item.lastName.length >= 1
          && item.lastName.length <= 50
        );

      return normalized.length > 0 || Array.isArray(value)
        ? normalized
        : normalizedUsers(fallback, []);
    }

    function normalizedDefaultQuoteDecimals(value, fallback = DEFAULT_QUOTE_DECIMALS) {
      const parsed = Number(value);

      return Number.isInteger(parsed) && parsed >= 0 && parsed <= MAX_DEFAULT_QUOTE_DECIMALS
        ? parsed
        : fallback;
    }

    function normalizedCcyOption(value) {
      const source = value && typeof value === "object" ? value : {};
      const code = String(source.code ?? source.ccyCode ?? "").trim().toUpperCase();
      const fractionDigits = Number(source.fractionDigits ?? source.fraction_digits);

      return {
        code,
        name: String(source.name ?? "").trim(),
        country: String(source.country ?? "").trim(),
        fractionDigits: Number.isInteger(fractionDigits) && fractionDigits >= 0 && fractionDigits <= 10
          ? fractionDigits
          : 2,
        pairCount: Math.max(0, Number(source.pairCount) || 0)
      };
    }

    function normalizedCcyOptions(value, fallback = DEFAULT_CCY_OPTIONS) {
      const source = Array.isArray(value) ? value : [];
      const seen = new Set();
      const normalized = source
        .map(normalizedCcyOption)
        .filter(item => /^[A-Z]{3}$/.test(item.code) && item.name && item.country && !seen.has(item.code) && seen.add(item.code))
        .sort((left, right) => left.code.localeCompare(right.code));

      return normalized.length > 0 ? normalized : fallback.map(normalizedCcyOption);
    }

    function loadCcyOptions() {
      return normalizedCcyOptions(DEMO_API_ENABLED ? DEMO_API_BOOTSTRAP.ccyOptions : DemoDb.get("ccyOptions"));
    }

    function saveCcyOptions() {
      DemoDb.set("ccyOptions", ccyOptions);
    }

    function normalizedMarketPair(value, fallback = DEFAULT_MARKET_PAIRS[0]) {
      const source = value && typeof value === "object" ? value : {};
      const fallbackPair = normalizedPricingRuleCurrencyPair(fallback?.currencyPair) || "EUR/USD";
      const sourcePair = normalizedPricingRuleCurrencyPair(source.currencyPair);
      const [fallbackBase, fallbackQuote] = fallbackPair.split("/");
      const baseCcy = String(source.baseCcy ?? source.base_ccy_code ?? sourcePair?.split("/")[0] ?? fallbackBase).trim().toUpperCase();
      const quoteCcy = String(source.quoteCcy ?? source.quote_ccy_code ?? sourcePair?.split("/")[1] ?? fallbackQuote).trim().toUpperCase();
      const currencyPair = /^[A-Z]{3}$/.test(baseCcy) && /^[A-Z]{3}$/.test(quoteCcy)
        ? `${baseCcy}/${quoteCcy}`
        : fallbackPair;
      const defaultQuoteDecimals = normalizedDefaultQuoteDecimals(
        source.defaultQuoteDecimals ?? source.quoteDecimals,
        fallback?.defaultQuoteDecimals ?? DEFAULT_QUOTE_DECIMALS
      );
      const optionalPositiveNumber = value => {
        if (value === null || value === undefined || value === "") {
          return null;
        }

        const number = Number(value);
        return Number.isFinite(number) && number > 0 ? number : null;
      };
      const sourceDuration = Number(source.oneWayDurationSeconds);
      const sourceFluctuation = Number(source.fluctuationSpreads);

      return {
        pairCode: String(source.pairCode ?? currencyPair.replace("/", "_")).trim().toUpperCase(),
        baseCcy: currencyPair.split("/")[0],
        quoteCcy: currencyPair.split("/")[1],
        currencyPair,
        defaultQuoteDecimals,
        pricingRulesCount: Math.max(0, Number(source.pricingRulesCount) || 0),
        bidMin: optionalPositiveNumber(source.bidMin ?? source.marketBidMin),
        spread: optionalPositiveNumber(source.spread ?? source.marketSpread),
        bidMax: optionalPositiveNumber(source.bidMax ?? source.marketBidMax),
        oneWayDurationSeconds: Number.isInteger(sourceDuration) &&
          sourceDuration >= MIN_MARKET_ONE_WAY_DURATION_SECONDS &&
          sourceDuration <= MAX_MARKET_ONE_WAY_DURATION_SECONDS
            ? sourceDuration
            : DEFAULT_MARKET_ONE_WAY_DURATION_SECONDS,
        fluctuationSpreads: Number.isFinite(sourceFluctuation) &&
          sourceFluctuation >= 0 &&
          sourceFluctuation <= MAX_MARKET_FLUCTUATION_SPREADS
            ? sourceFluctuation
            : DEFAULT_MARKET_FLUCTUATION_SPREADS
      };
    }

    function normalizedMarketPairs(value, fallback = DEFAULT_MARKET_PAIRS) {
      const source = Array.isArray(value) ? value : (value && typeof value === "object" ? [value] : []);
      const seen = new Set();
      const normalized = source
        .map(item => normalizedMarketPair(item))
        .filter(item => {
          if (seen.has(item.currencyPair)) {
            return false;
          }

          seen.add(item.currencyPair);
          return true;
        })
        .sort((left, right) => left.currencyPair.localeCompare(right.currencyPair));

      return normalized.length > 0
        ? normalized
        : fallback.map(item => normalizedMarketPair(item, item));
    }

    function loadMarketPairs() {
      return normalizedMarketPairs(DEMO_API_ENABLED ? DEMO_API_BOOTSTRAP.ccyPairOptions : DemoDb.get("marketPairs"));
    }

    function saveMarketPairs() {
      DemoDb.set("marketPairs", marketPairs);
    }

    async function demoApiRequest(path, options = {}) {
      if (!DEMO_API_ENABLED) {
        throw new Error("SQLite API is unavailable. Start the demo with start-demo.bat.");
      }

      const response = await fetch(path, {
        ...options,
        headers: options.body
          ? { "Content-Type": "application/json", ...(options.headers || {}) }
          : options.headers
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        const error = new Error(errorBody.message || `Request failed with HTTP ${response.status}.`);
        error.status = response.status;
        error.code = String(errorBody.code || "");
        throw error;
      }

      return response.status === 204 ? null : response.json();
    }

    async function refreshMarketReferenceDataFromApi() {
      if (!DEMO_API_ENABLED) {
        return;
      }

      const [freshCcyOptions, freshPairOptions] = await Promise.all([
        demoApiRequest("/api/v1/ccy-options"),
        demoApiRequest("/api/v1/ccy-pair-options")
      ]);
      ccyOptions = normalizedCcyOptions(freshCcyOptions, []);
      marketPairs = normalizedMarketPairs(freshPairOptions, []);
      saveCcyOptions();
      saveMarketPairs();
    }

    async function refreshServicingLocationsFromApi() {
      if (!DEMO_API_ENABLED) {
        return;
      }

      const freshServicingLocations = await demoApiRequest("/api/v1/servicing-locations");
      servicingBranches = normalizedServicingBranches(freshServicingLocations, []);
    }

    async function refreshAccountingSystemsFromApi() {
      if (!DEMO_API_ENABLED) {
        return;
      }

      const freshAccountingSystems = await demoApiRequest("/api/v1/accounting-systems");
      settlementSystems = normalizedSettlementSystems(freshAccountingSystems, []);
    }

    async function refreshExecutionSystemsFromApi() {
      if (!DEMO_API_ENABLED) {
        return;
      }

      const freshExecutionSystems = await demoApiRequest("/api/v1/execution-systems");
      tradeCaptureChannels = normalizedTradeCaptureChannels(freshExecutionSystems, []);
    }

    async function refreshExecutionContextsFromApi() {
      if (!DEMO_API_ENABLED) {
        return;
      }

      const freshExecutionContexts = await demoApiRequest("/api/v1/execution-contexts");
      pricingContexts = normalizedPricingContexts(freshExecutionContexts, []);
    }

    async function refreshTradingCounterpartiesFromApi() {
      if (!DEMO_API_ENABLED) {
        return;
      }

      const freshTradingCounterparties = await demoApiRequest("/api/v1/trading-counterparties");
      clientProfiles = normalizedClientProfiles(freshTradingCounterparties, []);
    }

    async function refreshUsersFromApi() {
      if (!DEMO_API_ENABLED) {
        return;
      }

      const freshUsers = await demoApiRequest("/api/v1/users");
      users = normalizedUsers(freshUsers, []);
    }

    function marketSimulationConfigured(pair) {
      return Boolean(pair) &&
        Number.isFinite(pair.bidMin) && pair.bidMin > 0 &&
        Number.isFinite(pair.spread) && pair.spread > 0 &&
        Number.isFinite(pair.bidMax) && pair.bidMax > pair.bidMin &&
        Number.isInteger(pair.oneWayDurationSeconds) &&
        pair.oneWayDurationSeconds >= MIN_MARKET_ONE_WAY_DURATION_SECONDS &&
        pair.oneWayDurationSeconds <= MAX_MARKET_ONE_WAY_DURATION_SECONDS &&
        Number.isFinite(pair.fluctuationSpreads) &&
        pair.fluctuationSpreads >= 0 &&
        pair.fluctuationSpreads <= MAX_MARKET_FLUCTUATION_SPREADS;
    }

    function loadClientProfiles() {
      return normalizedClientProfiles(
        DEMO_API_ENABLED
          ? DEMO_API_BOOTSTRAP.tradingCounterparties
          : DemoDb.get("clientProfiles")
      );
    }

    function saveClientProfiles() {
      if (!DEMO_API_ENABLED) {
        DemoDb.set("clientProfiles", clientProfiles);
      }
    }

    function tradingCounterpartyApiPayload(profile) {
      const counterpartyScope = normalizedCounterpartyScope(profile?.counterpartyScope);

      return {
        counterpartyScope,
        counterpartyRoles: normalizedCounterpartyRoles(profile?.counterpartyRoles, profile?.counterpartyType),
        counterpartyCode: String(profile?.inn || "").trim(),
        counterpartyCodeType: counterpartyScope === "EXTERNAL"
          ? normalizedClientCodeType(profile?.clientCodeType)
          : "INTERNAL_UNIT_CODE",
        externalCounterpartyKind: counterpartyScope === "EXTERNAL"
          ? normalizedExternalCounterpartyKind(profile?.externalCounterpartyKind)
          : null,
        unitCode: counterpartyScope === "INTERNAL" ? String(profile?.inn || "").trim() : null,
        unitType: counterpartyScope === "INTERNAL"
          ? normalizedInternalUnitType(profile?.unitType)
          : null,
        counterpartyName: String(profile?.name || "").trim(),
        active: profile?.isActive !== false
      };
    }

    function tradingCounterpartyFromApi(value) {
      return normalizedClientProfiles([value], [])[0] || null;
    }

    function loadUsers() {
      return normalizedUsers(
        DEMO_API_ENABLED
          ? DEMO_API_BOOTSTRAP.users
          : DemoDb.get("users")
      );
    }

    function saveUsers() {
      if (!DEMO_API_ENABLED) {
        DemoDb.set("users", users);
      }
    }

    function userApiPayload(value) {
      return {
        userCode: String(value?.userCode || "").trim().toUpperCase(),
        firstName: String(value?.firstName || "").trim(),
        lastName: String(value?.lastName || "").trim(),
        userRole: String(value?.userRole || "").trim().toUpperCase(),
        active: value?.active !== false
      };
    }

    function userFromApi(value) {
      return normalizedUsers([value], [])[0] || null;
    }

    function normalizedContextCode(value) {
      return String(value ?? "")
        .trim()
        .toUpperCase()
        .replace(/\s+/g, "_")
        .replace(/[^A-Z0-9_-]/g, "");
    }

    function normalizedReferenceText(value) {
      return String(value ?? "").trim();
    }

    function normalizedReferenceCode(value) {
      return normalizedContextCode(value);
    }

    function normalizedTradeCaptureChannelId(value) {
      const id = normalizedReferenceCode(value);

      return id === LEGACY_DEALER_ASSISTED_CHANNEL_ID || id === LEGACY_CREATE_CLIENT_DEAL_CHANNEL_ID
        ? MANUAL_CLIENT_DEAL_ENTRY_CHANNEL_ID
        : id;
    }

    function normalizedPricingType(value) {
      const pricingType = normalizedReferenceCode(value);

      return PRICING_TYPES.includes(pricingType) ? pricingType : "DEALER_APPROVED";
    }

    function normalizedPositionManagementMode(value, fallback = "MANUAL") {
      const mode = normalizedReferenceCode(value);
      const fallbackMode = normalizedReferenceCode(fallback);

      if (POSITION_MANAGEMENT_MODES.includes(mode)) {
        return mode;
      }

      return POSITION_MANAGEMENT_MODES.includes(fallbackMode) ? fallbackMode : "MANUAL";
    }

    function normalizedPositionManagementModeOverride(value) {
      const mode = normalizedReferenceCode(value);

      return POSITION_MANAGEMENT_MODES.includes(mode) ? mode : null;
    }

    function positionManagementModeLabel(value) {
      return POSITION_MANAGEMENT_MODE_LABELS[normalizedPositionManagementMode(value)];
    }

    function normalizedAutoHedgingAdmissionMode(value, defaultPositionManagementMode = "MANUAL") {
      const mode = normalizedReferenceCode(value);

      if (AUTO_HEDGING_ADMISSION_MODES.includes(mode)) {
        return mode;
      }

      return normalizedPositionManagementMode(defaultPositionManagementMode) === "AUTO"
        ? "AUTO_IF_ELIGIBLE"
        : "MANUAL_ONLY";
    }

    function autoHedgingAdmissionModeLabel(value) {
      return AUTO_HEDGING_ADMISSION_MODE_LABELS[normalizedAutoHedgingAdmissionMode(value)];
    }

    function autoHedgingAdmissionModeBadgeMarkup(value) {
      const mode = normalizedAutoHedgingAdmissionMode(value);
      const toneClass = mode === "AUTO_IF_ELIGIBLE"
        ? " is-auto"
        : mode === "REVIEW_REQUIRED" ? " is-review-required" : " is-manual-only";

      return `<span class="position-management-mode-badge auto-hedging-admission-mode-badge${toneClass}">${escapeHtml(autoHedgingAdmissionModeLabel(mode))}</span>`;
    }

    function normalizedPricingRuleAutoHedgingAdmissionModeOverride(value) {
      return normalizedReferenceCode(value) === "MANUAL_ONLY"
        ? "MANUAL_ONLY"
        : null;
    }

    function pricingRuleAutoHedgingAdmissionModeOverrideFromControl(control) {
      if (!control) {
        return undefined;
      }

      const value = normalizedReferenceCode(control.value);
      const valid = value === "" || value === "MANUAL_ONLY";

      control.setCustomValidity?.(
        valid ? "" : "Select an Auto Hedging Admission policy."
      );

      if (!valid) {
        return undefined;
      }

      return value || null;
    }

    function pricingRuleAutoHedgingAdmissionSourceLabel(value) {
      return normalizedPricingRuleAutoHedgingAdmissionModeOverride(value) === "MANUAL_ONLY"
        ? "Manual Control"
        : "Execution Context Admission Policy";
    }

    function pricingRuleAutoHedgingAdmissionOptions(selectedValue = null) {
      const selected = normalizedPricingRuleAutoHedgingAdmissionModeOverride(selectedValue);

      return `
        <option value=""${selected === null ? " selected" : ""}>Execution Context Admission Policy</option>
        <option value="MANUAL_ONLY"${selected === "MANUAL_ONLY" ? " selected" : ""}>Manual Control</option>
      `;
    }

    function effectiveAutoHedgingAdmissionModeForRule(rule, context = null) {
      const override = normalizedPricingRuleAutoHedgingAdmissionModeOverride(
        rule?.autoHedgingAdmissionModeOverride
      );

      if (override) {
        return override;
      }

      const effectiveMode = normalizedReferenceCode(
        rule?.effectiveAutoHedgingAdmissionMode
      );

      if (AUTO_HEDGING_ADMISSION_MODES.includes(effectiveMode)) {
        return effectiveMode;
      }

      const resolvedContext = pricingContextById(rule?.pricingContextId) || context;
      const executionContextMode = normalizedReferenceCode(
        rule?.executionContextAdmissionMode ?? resolvedContext?.autoHedgingAdmissionMode
      );

      return AUTO_HEDGING_ADMISSION_MODES.includes(executionContextMode)
        ? executionContextMode
        : normalizedAutoHedgingAdmissionMode(
            resolvedContext?.autoHedgingAdmissionMode,
            resolvedContext?.defaultPositionManagementMode
          );
    }

    function pricingRuleAutoHedgingAdmissionMarkup(rule) {
      const label = pricingRuleAutoHedgingAdmissionSourceLabel(
        rule?.autoHedgingAdmissionModeOverride
      );

      return `
        <span class="position-management-mode-value pricing-rule-admission-policy-source" data-smart-width-content>
          ${escapeHtml(label)}
        </span>
      `;
    }

    function clientPricingRuleAutoHedgingAdmissionMarkup(rule) {
      const label = pricingRuleAutoHedgingAdmissionSourceLabel(
        rule?.autoHedgingAdmissionModeOverride
      );

      return `
        <span class="client-pricing-configuration-node-copy is-read-only">
          <span class="client-pricing-configuration-node-value client-pricing-configuration-admission-policy-choice">${escapeHtml(label)}</span>
        </span>
      `;
    }

    function positionManagementModeBadgeMarkup(value) {
      const mode = normalizedPositionManagementMode(value);

      return `<span class="position-management-mode-badge${mode === "AUTO" ? " is-auto" : ""}">${escapeHtml(positionManagementModeLabel(mode))}</span>`;
    }

    function pricingTypePresentation(value) {
      const requestedPricingType = normalizedReferenceCode(value);
      const pricingType = PRICING_TYPE_PRESENTATION[requestedPricingType]
        ? requestedPricingType
        : normalizedPricingType(value);

      return {
        pricingType,
        ...PRICING_TYPE_PRESENTATION[pricingType]
      };
    }

    function pricingModeIndicatorMarkup(
      value,
      labelMarkup = "",
      showTooltip = true
    ) {
      const presentation = pricingTypePresentation(value);
      const indicatorAttributes = showTooltip
        ? `role="img" tabindex="0" aria-label="${escapeHtml(presentation.label)}" data-tooltip="${escapeHtml(presentation.label)}"`
        : 'aria-hidden="true"';
      const icon = presentation.icon;

      return `
        <span class="reference-pricing-mode" data-smart-width-content>
          <span class="pricing-mode-indicator is-${escapeHtml(presentation.tone)}" ${indicatorAttributes}>
            <span class="button-icon" aria-hidden="true">${escapeHtml(icon)}</span>
          </span>
          ${labelMarkup ? `<span class="reference-pricing-mode-label">${labelMarkup}</span>` : ""}
        </span>
      `;
    }

    function executionSystemLabelMarkup(name, pricingType) {
      const normalizedName = String(name || "").trim();
      const presentation = pricingTypePresentation(pricingType);
      const pricingIcon = presentation.icon;
      const displayName = normalizedName || "Enter name";
      const nameClass = normalizedName ? "" : " is-placeholder";

      return `
        <span
          class="execution-system-label"
          data-smart-width-content
          data-disable-overflow-tooltip
          aria-label="Execution System ${escapeHtml(displayName)}; Pricing Mode ${escapeHtml(presentation.label)}"
        >
          <span class="execution-system-label__system" aria-hidden="true">
            <span class="button-icon">terminal</span>
          </span>
          <span class="execution-system-label__name${nameClass}">${escapeHtml(displayName)}</span>
          <span class="execution-system-label__pricing" aria-hidden="true">
            <span class="button-icon">${escapeHtml(pricingIcon)}</span>
          </span>
        </span>
      `;
    }

    function pricingModeForRule(rule, context = null) {
      const resolvedContext = context || pricingContextById(rule?.pricingContextId);
      const executionSystem = tradeCaptureChannelById(resolvedContext?.tradeCaptureChannelId);

      return normalizedPricingType(rule?.pricingMode ?? executionSystem?.pricingType);
    }

    function marginIndicatorMarkup(marginPercent, extraClass = "", showTooltip = true) {
      const iconAttributes = showTooltip
        ? 'role="img" tabindex="0" aria-label="Margin" data-tooltip="Margin"'
        : 'aria-hidden="true"';

      return `
        <span class="client-deal-pricing-rule-margin${extraClass ? ` ${escapeHtml(extraClass)}` : ""}">
          <span class="client-deal-pricing-rule-margin-icon" ${iconAttributes}>
            <span class="button-icon" aria-hidden="true">savings</span>
          </span>
          <span class="client-deal-pricing-rule-margin-value">${escapeHtml(editNumber(marginPercent, 4))}%</span>
        </span>
      `;
    }

    function normalizedPricingContextIdValue(value) {
      const integerId = normalizedIntegerId(value);

      if (integerId) {
        return integerId;
      }

      const parts = String(value ?? "").trim().toUpperCase().split(":");

      if (parts.length !== 3) {
        return "";
      }

      return pricingContextIdForComponents(
        parts[0],
        parts[1],
        normalizedTradeCaptureChannelId(parts[2])
      );
    }

    function normalizedIntegerId(value) {
      const text = String(value ?? "").trim();
      const number = Number(text);

      return /^[1-9]\d*$/.test(text) && Number.isSafeInteger(number) ? String(number) : "";
    }

    function nextCollectionIntegerId(items, key) {
      const highestId = items.reduce((highest, item) => {
        const id = Number(normalizedIntegerId(item?.[key]));
        return Number.isSafeInteger(id) ? Math.max(highest, id) : highest;
      }, 0);

      return String(highestId + 1);
    }

    function normalizedReferenceActive(value, fallback = true) {
      return typeof value === "boolean" ? value : fallback;
    }

    function defaultServicingLocationType(servicingLocationId) {
      return String(servicingLocationId || "").trim() === "000"
        ? "HEAD_OFFICE"
        : "BRANCH";
    }

    function normalizedServicingLocationType(value, servicingLocationId) {
      const normalized = String(value || "").trim().toUpperCase().replace(/[\s-]+/g, "_");

      return SERVICING_LOCATION_TYPES.includes(normalized)
        ? normalized
        : defaultServicingLocationType(servicingLocationId);
    }

    function normalizedServicingBranches(value, fallback = DEFAULT_SERVICING_BRANCHES) {
      const source = Array.isArray(value) ? value : fallback;
      const seen = new Set();
      const normalized = source
        .map(item => {
          const servicingBranchCode = String(
            item?.servicingLocationId ??
            item?.servicing_location_id ??
            item?.servicingBranchCode ??
            item?.servicing_branch_code ??
            item?.branchCode ??
            item?.branch_code ??
            ""
          ).trim();
          const servicingBranchName = normalizedReferenceText(
            item?.name ??
            item?.servicingBranchName ??
            item?.servicing_branch_name ??
            item?.branchName ??
            item?.branch_name
          );
          const region = normalizedReferenceText(item?.region);
          const locationType = normalizedServicingLocationType(
            item?.type ?? item?.locationType ?? item?.location_type,
            servicingBranchCode
          );
          const isActive = normalizedReferenceActive(item?.active ?? item?.isActive ?? item?.is_active, true);
          const executionContextCount = Math.max(
            0,
            Number(item?.executionContextCount ?? item?.execution_context_count) || 0
          );

          return { servicingBranchCode, servicingBranchName, region, locationType, isActive, executionContextCount };
        })
        .filter(item => {
          const valid = isValidServicingLocationId(item.servicingBranchCode) && item.servicingBranchName;

          if (!valid || seen.has(item.servicingBranchCode)) {
            return false;
          }

          seen.add(item.servicingBranchCode);
          return true;
        });

      return normalized.length > 0 ? normalized : fallback.map(item => ({ ...item }));
    }

    function normalizedSettlementSystems(value, fallback = DEFAULT_SETTLEMENT_SYSTEMS) {
      const source = Array.isArray(value) ? value : fallback;
      const seen = new Set();
      const normalized = source
        .map(item => {
          const settlementSystemId = normalizedReferenceCode(
            item?.accountingSystemId ??
            item?.accounting_system_id ??
            item?.settlementSystemId ??
            item?.settlement_system_id
          );
          const settlementSystemName = normalizedReferenceText(
            item?.name ??
            item?.settlementSystemName ??
            item?.settlement_system_name
          );
          const isActive = normalizedReferenceActive(item?.active ?? item?.isActive ?? item?.is_active, true);
          const executionContextCount = Math.max(
            0,
            Number(item?.executionContextCount ?? item?.execution_context_count) || 0
          );
          return { settlementSystemId, settlementSystemName, isActive, executionContextCount };
        })
        .filter(item => {
          const valid = /^[A-Z0-9_-]{2,20}$/.test(item.settlementSystemId) && item.settlementSystemName;

          if (!valid || seen.has(item.settlementSystemId)) {
            return false;
          }

          seen.add(item.settlementSystemId);
          return true;
        });

      return normalized.length > 0 ? normalized : fallback.map(item => ({ ...item }));
    }

    function normalizedTradeCaptureChannels(value, fallback = DEFAULT_TRADE_CAPTURE_CHANNELS) {
      const source = Array.isArray(value) ? value : fallback;
      const seen = new Set();
      const normalized = source
        .map(item => {
          const rawTradeCaptureChannelId = normalizedReferenceCode(
            item?.executionSystemId ??
            item?.execution_system_id ??
            item?.tradeCaptureChannelId ??
            item?.trade_capture_channel_id
          );
          const tradeCaptureChannelId = normalizedTradeCaptureChannelId(rawTradeCaptureChannelId);
          const rawTradeCaptureChannelName = normalizedReferenceText(
            item?.name ??
            item?.tradeCaptureChannelName ??
            item?.trade_capture_channel_name
          );
          const tradeCaptureChannelName =
            (rawTradeCaptureChannelId === LEGACY_DEALER_ASSISTED_CHANNEL_ID || rawTradeCaptureChannelId === LEGACY_CREATE_CLIENT_DEAL_CHANNEL_ID) &&
            (!rawTradeCaptureChannelName || rawTradeCaptureChannelName === "Dealer Assisted" || rawTradeCaptureChannelName === "Create Client Deal")
              ? "Manual Client Deal Entry"
              : rawTradeCaptureChannelName;
          const pricingType = normalizedPricingType(
            item?.pricingMode ??
            item?.pricing_mode ??
            item?.pricingType ??
            item?.pricing_type ??
            item?.channelType ??
            item?.channel_type
          );
          const isActive = normalizedReferenceActive(item?.active ?? item?.isActive ?? item?.is_active, true);
          const executionContextCount = Math.max(
            0,
            Number(item?.executionContextCount ?? item?.execution_context_count) || 0
          );

          return { tradeCaptureChannelId, tradeCaptureChannelName, pricingType, isActive, executionContextCount };
        })
          .filter(item => {
            const valid = /^[A-Z0-9_-]{2,30}$/.test(item.tradeCaptureChannelId) && item.tradeCaptureChannelName;

          if (!valid || seen.has(item.tradeCaptureChannelId)) {
            return false;
          }

          seen.add(item.tradeCaptureChannelId);
          return true;
        });

      return normalized.length > 0 ? normalized : fallback.map(item => ({ ...item }));
    }

    function loadReferenceCollection(tableName, defaults, normalizer) {
      return normalizer(DemoDb.get(tableName), defaults);
    }

    function saveReferenceCollection(tableName, items) {
      DemoDb.set(tableName, items);
    }

    function loadServicingBranches() {
      return normalizedServicingBranches(
        DEMO_API_ENABLED
          ? DEMO_API_BOOTSTRAP.servicingLocations
          : DemoDb.get("servicingBranches"),
        DEFAULT_SERVICING_BRANCHES
      );
    }

    function saveServicingBranches() {
      if (!DEMO_API_ENABLED) {
        saveReferenceCollection("servicingBranches", servicingBranches);
      }
    }

    function loadSettlementSystems() {
      return normalizedSettlementSystems(
        DEMO_API_ENABLED
          ? DEMO_API_BOOTSTRAP.accountingSystems
          : DemoDb.get("settlementSystems"),
        DEFAULT_SETTLEMENT_SYSTEMS
      );
    }

    function saveSettlementSystems() {
      if (!DEMO_API_ENABLED) {
        saveReferenceCollection("settlementSystems", settlementSystems);
      }
    }

    function loadTradeCaptureChannels() {
      return normalizedTradeCaptureChannels(
        DEMO_API_ENABLED
          ? DEMO_API_BOOTSTRAP.executionSystems
          : DemoDb.get("tradeCaptureChannels"),
        DEFAULT_TRADE_CAPTURE_CHANNELS
      );
    }

    function saveTradeCaptureChannels() {
      refreshClientDealEligiblePricingRules();

      if (!DEMO_API_ENABLED) {
        saveReferenceCollection("tradeCaptureChannels", tradeCaptureChannels);
      }
    }

    function pricingContextNaturalKey(servicingBranchCode, settlementSystemId, tradeCaptureChannelId) {
      return `${servicingBranchCode}:${settlementSystemId}:${tradeCaptureChannelId}`;
    }

    function pricingContextIdForComponents(servicingBranchCode, settlementSystemId, tradeCaptureChannelId) {
      const naturalKey = pricingContextNaturalKey(
        servicingBranchCode,
        settlementSystemId,
        tradeCaptureChannelId
      );
      const context = pricingContexts.find(item => pricingContextNaturalKey(
        item.servicingBranchCode,
        item.settlementSystemId,
        item.tradeCaptureChannelId
      ) === naturalKey);

      return context?.pricingContextId || "";
    }

    function normalizedPricingContexts(value, fallback = DEFAULT_PRICING_CONTEXTS) {
      const source = Array.isArray(value) && value.length > 0
        ? value
        : Array.isArray(fallback) ? fallback : [];
      const reservedIds = new Set(source
        .map(item => normalizedIntegerId(item?.executionContextId ?? item?.execution_context_id ?? item?.pricingContextId))
        .filter(Boolean));
      const seenIds = new Set();
      const seenNaturalKeys = new Set();
      let generatedId = 1;
      const normalized = source
        .map(item => {
          const servicingBranchCode = String(
            item?.servicingLocationId ??
            item?.servicing_location_id ??
            item?.servicingBranchCode ??
            item?.servicing_branch_code ??
            item?.branchCode ??
            item?.branch_code ??
            ""
          ).trim();
          const settlementSystemId = normalizedContextCode(
            item?.accountingSystemId ??
            item?.accounting_system_id ??
            item?.settlementSystemId ??
            item?.settlement_system_id ??
            item?.sourceSystemId ??
            item?.source_system_id ??
            item?.sourceSystem ??
            item?.source_system ??
            NOT_APPLICABLE_ACCOUNTING_SYSTEM_ID
          );
          const tradeCaptureChannelId = normalizedTradeCaptureChannelId(
            item?.executionSystemId ??
            item?.execution_system_id ??
            item?.tradeCaptureChannelId ??
            item?.trade_capture_channel_id ??
            MANUAL_CLIENT_DEAL_ENTRY_CHANNEL_ID
          );
          const defaultPositionManagementMode = normalizedPositionManagementMode(
            item?.defaultPositionManagementMode ?? item?.default_position_management_mode
          );
          const autoHedgingAdmissionMode = normalizedAutoHedgingAdmissionMode(
            item?.autoHedgingAdmissionMode ??
            item?.auto_hedging_admission_mode,
            defaultPositionManagementMode
          );
          let pricingContextIdValue = normalizedIntegerId(
            item?.executionContextId ?? item?.execution_context_id ?? item?.pricingContextId ?? item?.pricing_context_id
          );
          const rawAssignedCounterpartyCount =
            item?.assignedCounterpartyCount ??
            item?.assigned_counterparty_count ??
            item?.assignedCounterpartiesCount ??
            item?.assigned_counterparties_count ??
            item?.counterpartyCount ??
            item?.counterparty_count;
          const assignedCounterpartyCount = rawAssignedCounterpartyCount === null || rawAssignedCounterpartyCount === undefined
            ? null
            : Math.max(0, Number(rawAssignedCounterpartyCount) || 0);
          const pricingRulesCount = Math.max(
            0,
            Number(item?.pricingRulesCount ?? item?.pricing_rules_count) || 0
          );

          if (!pricingContextIdValue) {
            while (reservedIds.has(String(generatedId))) {
              generatedId += 1;
            }

            pricingContextIdValue = String(generatedId);
            reservedIds.add(pricingContextIdValue);
            generatedId += 1;
          }

          return {
            pricingContextId: pricingContextIdValue,
            servicingBranchCode,
            settlementSystemId,
            tradeCaptureChannelId,
            defaultPositionManagementMode,
            autoHedgingAdmissionMode,
            assignedCounterpartyCount,
            pricingRulesCount
          };
        })
        .filter(item => {
          const naturalKey = pricingContextNaturalKey(
            item.servicingBranchCode,
            item.settlementSystemId,
            item.tradeCaptureChannelId
          );
          const valid =
            Boolean(item.pricingContextId) &&
            isValidServicingLocationId(item.servicingBranchCode) &&
            /^[A-Z0-9_-]{2,20}$/.test(item.settlementSystemId) &&
            /^[A-Z0-9_-]{2,30}$/.test(item.tradeCaptureChannelId);

          if (!valid || seenIds.has(item.pricingContextId) || seenNaturalKeys.has(naturalKey)) {
            return false;
          }

          seenIds.add(item.pricingContextId);
          seenNaturalKeys.add(naturalKey);
          return true;
        });

      return normalized;
    }

    function loadPricingContexts() {
      return DEMO_API_ENABLED
        ? normalizedPricingContexts(DEMO_API_BOOTSTRAP.executionContexts, [])
        : normalizedPricingContexts(DemoDb.get("pricingContexts"), DEFAULT_PRICING_CONTEXTS);
    }

    function savePricingContexts() {
      refreshClientDealEligiblePricingRules();

      if (!DEMO_API_ENABLED) {
        DemoDb.set("pricingContexts", pricingContexts);
      }
    }

    function normalizedPricingRuleCurrencyPair(value) {
      const rawValue = String(value ?? "").trim().toUpperCase().replace(/\s/g, "");
      const match = /^([A-Z]{3})\/([A-Z]{3})$/.exec(rawValue) || /^([A-Z]{3})([A-Z]{3})$/.exec(rawValue);

      return match ? currencyPairValue(match[1], match[2]) : "";
    }

    function nextPricingRuleId() {
      return nextCollectionIntegerId(clientPricingRules, "pricingRuleId");
    }

    function pricingRuleIdForEditState(editState) {
      const currentRule = editState?.mode === "edit"
        ? clientPricingRules[editState.index]
        : null;

      return currentRule?.pricingRuleId || nextPricingRuleId();
    }

    function isValidClientCodeForProfile(code) {
      const profile = clientProfileByInn(code);
      return isValidClientCodeForType(code, profile?.clientCodeType || "OTHER");
    }

    function normalizedClientPricingRules(value, fallback = DEFAULT_CLIENT_PRICING_RULES) {
      const source = Array.isArray(value) ? value : fallback;
      const reservedIds = new Set(source
        .map(item => normalizedIntegerId(item?.pricingRuleId ?? item?.pricing_rule_id))
        .filter(Boolean));
      const seenIds = new Set();
      const seenIdentities = new Set();
      let generatedId = 1;

      return source
        .map(item => {
          const sourceCounterpartyId = Number(item?.counterpartyId ?? item?.counterparty_id);
          const sourceCounterpartyCode = item?.counterpartyCode ?? item?.counterparty_code ?? item?.inn;
          const profile = clientProfiles.find(candidate =>
            (Number.isInteger(sourceCounterpartyId) && candidate.counterpartyId === sourceCounterpartyId) ||
            candidate.inn === String(sourceCounterpartyCode ?? "").trim()
          ) || null;
          const inn = normalizedClientCode(
            sourceCounterpartyCode,
            profile?.clientCodeType || "OTHER",
            profile?.inn || ""
          );
          const currencyPair = normalizedPricingRuleCurrencyPair(item?.currencyPair ?? item?.currency_pair);
          const ccyPairCode = String(
            item?.ccyPairCode ?? item?.ccy_pair_code ?? currencyPair.replace("/", "_")
          ).trim().toUpperCase();
          const pricingContextIdValue = normalizedPricingContextIdValue(
            item?.executionContextId ?? item?.execution_context_id ?? item?.pricingContextId ?? item?.pricing_context_id
          );
          const marginPercent = Number(item?.marginPercent ?? item?.margin_percent);
          const sourcePricingMode = item?.pricingMode ?? item?.pricing_mode;
          const positionManagementModeOverride = normalizedPositionManagementModeOverride(
            item?.positionManagementModeOverride ?? item?.position_management_mode_override
          );
          const effectivePositionManagementMode = positionManagementModeOverride || normalizedPositionManagementMode(
            item?.effectivePositionManagementMode ??
            item?.effective_position_management_mode ??
            pricingContextById(pricingContextIdValue)?.defaultPositionManagementMode
          );
          const resolvedPricingContext = pricingContextById(pricingContextIdValue);
          const autoHedgingAdmissionModeOverride =
            normalizedPricingRuleAutoHedgingAdmissionModeOverride(
              item?.autoHedgingAdmissionModeOverride ??
              item?.auto_hedging_admission_mode_override
            );
          const executionContextAdmissionMode = normalizedAutoHedgingAdmissionMode(
            item?.executionContextAdmissionMode ??
            item?.execution_context_admission_mode ??
            resolvedPricingContext?.autoHedgingAdmissionMode,
            resolvedPricingContext?.defaultPositionManagementMode
          );
          const effectiveAutoHedgingAdmissionMode = autoHedgingAdmissionModeOverride ||
            normalizedAutoHedgingAdmissionMode(
              item?.effectiveAutoHedgingAdmissionMode ??
              item?.effective_auto_hedging_admission_mode ??
              executionContextAdmissionMode,
              resolvedPricingContext?.defaultPositionManagementMode
            );
          const sourcePricingRuleId = item?.pricingRuleId ?? item?.pricing_rule_id;
          let pricingRuleIdValue = normalizedIntegerId(sourcePricingRuleId);

          if (!pricingRuleIdValue) {
            while (reservedIds.has(String(generatedId))) {
              generatedId += 1;
            }

            pricingRuleIdValue = String(generatedId);
            reservedIds.add(pricingRuleIdValue);
            generatedId += 1;
          }

          return {
            pricingRuleId: pricingRuleIdValue,
            counterpartyId: profile?.counterpartyId ?? (Number.isInteger(sourceCounterpartyId) ? sourceCounterpartyId : null),
            counterpartyRoles: normalizedCounterpartyRoles(
              item?.counterpartyRoles ?? item?.counterparty_roles ?? profile?.counterpartyRoles,
              item?.counterpartyType ?? item?.counterparty_type ?? profile?.counterpartyType ?? "CLIENT"
            ),
            counterpartyType: normalizedCounterpartyType(
              item?.counterpartyType ?? item?.counterparty_type ?? profile?.counterpartyType,
              profile?.counterpartyType || "CLIENT"
            ),
            counterpartyScope: normalizedCounterpartyScope(
              item?.counterpartyScope ?? item?.counterparty_scope ?? profile?.counterpartyScope,
              profile?.counterpartyScope || "EXTERNAL"
            ),
            inn,
            currencyPair,
            ccyPairCode,
            pricingContextId: pricingContextIdValue,
            pricingMode: sourcePricingMode
              ? normalizedPricingType(sourcePricingMode)
              : null,
            positionManagementModeOverride,
            effectivePositionManagementMode,
            autoHedgingAdmissionModeOverride,
            executionContextAdmissionMode,
            effectiveAutoHedgingAdmissionMode,
            quickHedgeSettingsCount: Math.max(
              0,
              Number(item?.quickHedgeSettingsCount ?? item?.quick_hedge_settings_count) || 0
            ),
            marginPercent
          };
        })
        .filter(item => {
          const valid =
            isValidClientCodeForProfile(item.inn) &&
            /^[A-Z]{3}\/[A-Z]{3}$/.test(item.currencyPair) &&
            /^[A-Z]{3}_[A-Z]{3}$/.test(item.ccyPairCode) &&
            item.pricingContextId &&
            Number.isFinite(item.marginPercent) &&
            item.marginPercent >= 0 &&
            item.marginPercent < 100;
          const identity = `${item.counterpartyId ?? item.inn}\u0000${item.ccyPairCode}\u0000${item.pricingContextId}`;

          if (!valid || seenIds.has(item.pricingRuleId) || seenIdentities.has(identity)) {
            return false;
          }

          seenIds.add(item.pricingRuleId);
          seenIdentities.add(identity);
          return true;
        });
    }

    function loadClientPricingRules() {
      return normalizedClientPricingRules(
        DEMO_API_ENABLED ? DEMO_API_BOOTSTRAP.pricingRules : DemoDb.get("clientPricingRules"),
        []
      );
    }

    function normalizedHedgeQuickModePreset(value, baseCcyFractionDigits) {
      const source = value && typeof value === "object" ? value : {};
      const presetCode = String(source.presetCode || "").trim().toUpperCase();
      const label = String(source.label || "").trim();
      const baseCcyAmountMinor = String(source.baseCcyAmountMinor ?? "").trim();
      let baseCcyAmount = String(source.baseCcyAmount ?? "").trim();

      if (!baseCcyAmount && /^\d+$/.test(baseCcyAmountMinor)) {
        baseCcyAmount = minorToMajorDecimal(baseCcyAmountMinor, baseCcyFractionDigits);
      }

      if (!presetCode
        || !label
        || !/^\d+$/.test(baseCcyAmountMinor)
        || positiveDecimalInputText(baseCcyAmount) === null) {
        return null;
      }

      return {
        presetCode,
        label,
        baseCcyAmountMinor,
        baseCcyAmount
      };
    }

    function normalizedHedgeQuickModeSetting(value) {
      const source = value && typeof value === "object" ? value : {};
      const ccyPairCode = String(source.ccyPairCode || "").trim().toUpperCase();
      const currencyPair = normalizedPricingRuleCurrencyPair(
        source.currencyPair || ccyPairCode.replace("_", "/")
      );
      const baseCcyCode = String(
        source.baseCcyCode || currenciesFromPair(currencyPair).base
      ).trim().toUpperCase();
      const baseCcyFractionDigits = Number(source.baseCcyFractionDigits);
      const pricingRuleId = Number(source.pricingRuleId);
      const counterpartyId = Number(source.counterpartyId);
      const defaultTenor = String(source.defaultTenor || "TOD").trim().toUpperCase();
      const presets = (Array.isArray(source.presets) ? source.presets : [])
        .map(preset => normalizedHedgeQuickModePreset(preset, baseCcyFractionDigits))
        .filter(Boolean);

      if (!/^[A-Z]{3}_[A-Z]{3}$/.test(ccyPairCode)
        || !/^[A-Z]{3}\/[A-Z]{3}$/.test(currencyPair)
        || !/^[A-Z]{3}$/.test(baseCcyCode)
        || !Number.isInteger(baseCcyFractionDigits)
        || baseCcyFractionDigits < 0
        || baseCcyFractionDigits > 10
        || !Number.isInteger(pricingRuleId)
        || pricingRuleId <= 0
        || !Number.isInteger(counterpartyId)
        || counterpartyId <= 0
        || !["TOD", "TOM", "SPOT"].includes(defaultTenor)) {
        return null;
      }

      return {
        ccyPairCode,
        currencyPair,
        baseCcyCode,
        baseCcyFractionDigits,
        pricingRuleId,
        counterpartyId,
        counterpartyName: String(source.counterpartyName || "").trim(),
        executionContextId: String(source.executionContextId || "").trim(),
        defaultTenor,
        active: source.active === true || Number(source.active) === 1,
        available: source.available === true || Number(source.available) === 1,
        presets
      };
    }

    function normalizedHedgeQuickModeSettings(source) {
      return (Array.isArray(source) ? source : [])
        .map(normalizedHedgeQuickModeSetting)
        .filter(Boolean)
        .sort((left, right) => left.ccyPairCode.localeCompare(right.ccyPairCode));
    }

    function loadHedgeQuickModeSettings() {
      return normalizedHedgeQuickModeSettings(
        DEMO_API_ENABLED ? DEMO_API_BOOTSTRAP.hedgeQuickModeSettings : []
      );
    }

    function normalizedAutoHedgingAdmissionPolicyPair(source) {
      const ccyPairCode = String(source?.ccyPairCode || "").trim().toUpperCase();
      const currencyPair = normalizedPricingRuleCurrencyPair(
        source?.currencyPair || ccyPairCode.replace("_", "/")
      );
      const baseCcyCode = String(
        source?.baseCcyCode || currenciesFromPair(currencyPair).base
      ).trim().toUpperCase();
      const fractionDigits = Number(source?.baseCcyFractionDigits);
      const maxBaseCcyAmount = positiveDecimalInputText(source?.maxBaseCcyAmount);
      const deviation = normalizedDecimalInputText(
        source?.maxTransferRateDeviationPercent
      );
      let maxTransferRateDeviationPercent = null;

      try {
        if (
          deviation !== null
          && new Big(deviation).gte(0)
          && new Big(deviation).lte(100)
        ) {
          maxTransferRateDeviationPercent = deviation;
        }
      } catch {}

      if (
        !/^[A-Z]{3}_[A-Z]{3}$/.test(ccyPairCode)
        || !/^[A-Z]{3}\/[A-Z]{3}$/.test(currencyPair)
        || !/^[A-Z]{3}$/.test(baseCcyCode)
      ) {
        return null;
      }

      return {
        ccyPairCode,
        currencyPair,
        baseCcyCode,
        baseCcyFractionDigits: Number.isInteger(fractionDigits)
          && fractionDigits >= 0
          && fractionDigits <= 10
          ? fractionDigits
          : 2,
        enabled: source?.enabled === true || Number(source?.enabled) === 1,
        maxBaseCcyAmount,
        maxTransferRateDeviationPercent
      };
    }

    function normalizedAutoHedgingAdmissionPolicy(source) {
      const revision = Number(source?.revision);
      const seenCodes = new Set();
      const currencyPairs = (Array.isArray(source?.currencyPairs)
        ? source.currencyPairs
        : [])
        .map(normalizedAutoHedgingAdmissionPolicyPair)
        .filter(pair => {
          if (!pair || seenCodes.has(pair.ccyPairCode)) {
            return false;
          }
          seenCodes.add(pair.ccyPairCode);
          return true;
        })
        .sort((left, right) => left.currencyPair.localeCompare(right.currencyPair));

      return {
        revision: Number.isInteger(revision) && revision >= 0 ? revision : 0,
        currencyPairs
      };
    }

    function loadAutoHedgingAdmissionPolicy() {
      return normalizedAutoHedgingAdmissionPolicy(
        DEMO_API_ENABLED ? DEMO_API_BOOTSTRAP.autoHedgingAdmissionPolicy : null
      );
    }

    function normalizedFxBatchingSettings(source) {
      return {
        allowCrossTenorBatching: source?.allowCrossTenorBatching === true,
        updatedAt: String(source?.updatedAt || "")
      };
    }

    function loadFxBatchingSettings() {
      return normalizedFxBatchingSettings(
        DEMO_API_ENABLED ? DEMO_API_BOOTSTRAP.fxBatchingSettings : null
      );
    }

    function normalizedFxAutoBatchingSettings(source) {
      const maxIntervalSeconds = Number(source?.maxIntervalSeconds);
      const maxTransferRateSpreadPercent = positiveDecimalInputText(
        source?.maxTransferRateSpreadPercent
      );
      const availableCcyPairCodes = marketPairs.map(pair => pair.pairCode);
      const availableCcyPairCodeSet = new Set(availableCcyPairCodes);
      const defaultEligibleCcyPairCodes = ["EUR_USD", "GBP_USD"]
        .filter(code => availableCcyPairCodeSet.has(code));
      const sourceCcyPairCodes = Array.isArray(source?.eligibleCcyPairCodes)
        ? source.eligibleCcyPairCodes
        : [];
      const eligibleCcyPairCodes = [...new Set(sourceCcyPairCodes
        .map(code => String(code || "").trim().toUpperCase())
        .filter(code => availableCcyPairCodeSet.has(code)))]
        .sort((left, right) => left.localeCompare(right));
      const tenorCompatibilityMode = String(
        source?.tenorCompatibilityMode || "SAME_TENOR_ONLY"
      ).trim().toUpperCase();
      let validSpreadPercent = "0.05";

      try {
        if (
          maxTransferRateSpreadPercent !== null
          && new Big(maxTransferRateSpreadPercent).gte("0.0001")
          && new Big(maxTransferRateSpreadPercent).lte("100")
        ) {
          validSpreadPercent = maxTransferRateSpreadPercent;
        }
      } catch {}

      return {
        maxIntervalSeconds: Number.isInteger(maxIntervalSeconds)
          && maxIntervalSeconds >= 1
          && maxIntervalSeconds <= 3600
          ? maxIntervalSeconds
          : 60,
        maxTransferRateSpreadPercent: validSpreadPercent,
        eligibleCcyPairCodes: eligibleCcyPairCodes.length > 0
          ? eligibleCcyPairCodes
          : defaultEligibleCcyPairCodes.length > 0
            ? defaultEligibleCcyPairCodes
            : availableCcyPairCodes,
        tenorCompatibilityMode: tenorCompatibilityMode === "SAME_TENOR_ONLY"
          ? tenorCompatibilityMode
          : "SAME_TENOR_ONLY",
        updatedAt: String(source?.updatedAt || "")
      };
    }

    function loadFxAutoBatchingSettings() {
      return normalizedFxAutoBatchingSettings(
        DEMO_API_ENABLED ? DEMO_API_BOOTSTRAP.fxAutoBatchingSettings : null
      );
    }

    async function reloadHedgeQuickModeSettingsFromApi() {
      if (!DEMO_API_ENABLED) {
        hedgeQuickModeSettings = [];
        return hedgeQuickModeSettings;
      }

      const response = await demoApiRequest("/api/v1/hedge-quick-mode-settings");
      hedgeQuickModeSettings = normalizedHedgeQuickModeSettings(
        Array.isArray(response) ? response : response?.settings
      );
      return hedgeQuickModeSettings;
    }

    async function initializeHedgeQuickModeToolbar() {
      if (!DEMO_API_ENABLED) {
        renderHedgeQuickModeToolbar();
        return;
      }

      try {
        await reloadHedgeQuickModeSettingsFromApi();
      } catch {
        // При недоступности отдельного read-запроса остаётся безопасный bootstrap-снимок.
      } finally {
        renderHedgeQuickModeToolbar();
      }
    }

    function saveClientPricingRules() {
      if (!DEMO_API_ENABLED) {
        DemoDb.set("clientPricingRules", clientPricingRules);
      }
    }

    function isoDateFromClientFxDealValue(value) {
      const text = String(value || "").trim();
      const displayDateMatch = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(text);

      return displayDateMatch
        ? `${displayDateMatch[3]}-${displayDateMatch[2]}-${displayDateMatch[1]}`
        : text;
    }

    function normalizedClientFxDeal(value) {
      const source = value && typeof value === "object" ? value : {};
      const legacyPair = normalizedPricingRuleCurrencyPair(source.currencyPair);
      const ccyPairCode = String(source.ccyPairCode || legacyPair.replace("/", "_")).trim().toUpperCase();
      const currencyPair = normalizedPricingRuleCurrencyPair(source.currencyPair)
        || (/^[A-Z]{3}_[A-Z]{3}$/.test(ccyPairCode) ? ccyPairCode.replace("_", "/") : "");
      const [baseCcy = ""] = currencyPair.split("/");
      const dealtCcyCode = String(source.dealtCcyCode ?? source.dealt_ccy_code ?? baseCcy)
        .trim()
        .toUpperCase();
      const tradeRate = Number(source.tradeRate ?? source.clientRate);
      const legacyBaseAmount = Math.max(Number(source.amountBuy) || 0, Number(source.amountSell) || 0);
      let baseCcyAmount = Number(source.baseCcyAmount ?? source.baseAmount ?? legacyBaseAmount);
      let quoteCcyAmount = Number(source.quoteCcyAmount ?? source.quoteAmount);
      const baseCcyFractionDigits = Number(
        source.baseCcyFractionDigits ?? source.base_ccy_fraction_digits
      );
      const quoteCcyFractionDigits = Number(
        source.quoteCcyFractionDigits ?? source.quote_ccy_fraction_digits
      );
      const baseCcyAmountMinorSource =
        source.baseCcyAmountMinor ?? source.base_ccy_amount_minor;
      const quoteCcyAmountMinorSource =
        source.quoteCcyAmountMinor ?? source.quote_ccy_amount_minor;
      const baseCcyAmountMinor = Number(baseCcyAmountMinorSource);
      const quoteCcyAmountMinor = Number(quoteCcyAmountMinorSource);
      const hasMinorAmounts = Number.isSafeInteger(baseCcyAmountMinor)
        && baseCcyAmountMinor > 0
        && Number.isSafeInteger(quoteCcyAmountMinor)
        && quoteCcyAmountMinor > 0
        && Number.isInteger(baseCcyFractionDigits)
        && baseCcyFractionDigits >= 0
        && baseCcyFractionDigits <= 10
        && Number.isInteger(quoteCcyFractionDigits)
        && quoteCcyFractionDigits >= 0
        && quoteCcyFractionDigits <= 10;

      if (hasMinorAmounts) {
        baseCcyAmount = Number(minorToMajorDecimal(
          baseCcyAmountMinor,
          baseCcyFractionDigits
        ));
        quoteCcyAmount = Number(minorToMajorDecimal(
          quoteCcyAmountMinor,
          quoteCcyFractionDigits
        ));
      }
      const entryDate = isoDateFromClientFxDealValue(source.entryDate);
      const executionTimestamp = String(source.executionTimestamp || "").trim()
        || (entryDate ? `${entryDate}T00:00:00.000Z` : "");
      const receivedTimestamp = String(source.receivedTimestamp || "").trim()
        || executionTimestamp;
      const tradeDate = isoDateFromClientFxDealValue(source.tradeDate);
      const baseCcyValueDate = isoDateFromClientFxDealValue(
        source.baseCcyValueDate ?? source.baseCurrencySettlementDay ?? source.valueDate
      );
      const quoteCcyValueDate = isoDateFromClientFxDealValue(
        source.quoteCcyValueDate ?? source.quoteCurrencySettlementDay ?? source.valueDate
      );
      const side = String(source.side || (Number(source.amountBuy) > 0 ? "BUY" : Number(source.amountSell) > 0 ? "SELL" : ""))
        .trim()
        .toUpperCase();
      const executionContextId = Number(
        source.executionContextId ?? source.execution_context_id ?? source.pricingContextId ?? source.pricing_context_id
      );
      const pricingRuleId = Number(source.pricingRuleId ?? source.pricing_rule_id);
      const pricingRuleMarginSource = source.pricingRuleMargin ?? source.pricing_rule_margin;
      const pricingRuleMargin = pricingRuleMarginSource === null
        || pricingRuleMarginSource === undefined
        || pricingRuleMarginSource === ""
        ? null
        : Number(pricingRuleMarginSource);
      const transferRateSource = source.transferRate ?? source.transfer_rate ?? source.autoBatchRate;
      const analyticalPnlQuoteMinorSource = source.analyticalPnlQuoteMinor
        ?? source.analytical_pnl_quote_minor;
      const analyticalPnlQuoteFractionDigitsSource = source.analyticalPnlQuoteFractionDigits
        ?? source.analytical_pnl_quote_fraction_digits;
      const analyticalPnlQuoteMinor = Number(analyticalPnlQuoteMinorSource);
      const analyticalPnlQuoteFractionDigits = Number(
        analyticalPnlQuoteFractionDigitsSource
      );
      const hasMinorAnalyticalPnl = analyticalPnlQuoteMinorSource !== null
        && analyticalPnlQuoteMinorSource !== undefined
        && analyticalPnlQuoteMinorSource !== ""
        && analyticalPnlQuoteFractionDigitsSource !== null
        && analyticalPnlQuoteFractionDigitsSource !== undefined
        && analyticalPnlQuoteFractionDigitsSource !== ""
        && Number.isSafeInteger(analyticalPnlQuoteMinor)
        && Number.isInteger(analyticalPnlQuoteFractionDigits)
        && analyticalPnlQuoteFractionDigits >= 0
        && analyticalPnlQuoteFractionDigits <= 10;
      const analyticalPnlSource = hasMinorAnalyticalPnl
        ? minorToMajorDecimal(
          analyticalPnlQuoteMinor,
          analyticalPnlQuoteFractionDigits
        )
        : source.analyticalPnl
          ?? source.analytical_pnl
          ?? source.analyticalPnlQuoteAmount
          ?? source.analytical_pnl_quote_amount
          ?? source.pnlCash;
      const transferRate = transferRateSource === null || transferRateSource === undefined || transferRateSource === ""
        ? null
        : Number(transferRateSource);
      const analyticalPnl = analyticalPnlSource === null
        || analyticalPnlSource === undefined
        || analyticalPnlSource === ""
        ? null
        : Number(analyticalPnlSource);
      const marketPulseBidSource = source.marketPulseBid ?? source.market_pulse_bid;
      const marketPulseOfferSource = source.marketPulseOffer ?? source.market_pulse_offer;
      const marketPulseStreamStatus = String(
        source.marketPulseStreamStatus ?? source.market_pulse_stream_status ?? ""
      ).trim().toUpperCase();
      const marketPulseBid = marketPulseBidSource === null
        || marketPulseBidSource === undefined
        || marketPulseBidSource === ""
        ? null
        : Number(marketPulseBidSource);
      const marketPulseOffer = marketPulseOfferSource === null
        || marketPulseOfferSource === undefined
        || marketPulseOfferSource === ""
        ? null
        : Number(marketPulseOfferSource);
      const marketPulseTimestamp = String(
        source.marketPulseTimestamp ?? source.market_pulse_timestamp ?? ""
      ).trim();

      const tradeId = Number(source.tradeId ?? source.clientDealId ?? source.clientFxDealId ?? source.id);
      const currentFxPositionMode = normalizedPositionManagementMode(
        source.currentFxPositionMode
        ?? source.current_fx_position_mode
        ?? source.fxPositionMode
        ?? source.fx_position_mode
      );
      const initialFxPositionMode = normalizedPositionManagementMode(
        source.initialFxPositionMode
        ?? source.initial_fx_position_mode,
        currentFxPositionMode
      );

      return {
        tradeId,
        clientDealId: tradeId,
        initialFxPositionMode,
        currentFxPositionMode,
        executionTimestamp,
        receivedTimestamp,
        counterpartyId: Number(source.counterpartyId) || null,
        executionContextId: Number.isInteger(executionContextId) && executionContextId > 0
          ? executionContextId
          : null,
        pricingRuleId: Number.isInteger(pricingRuleId) && pricingRuleId > 0 ? pricingRuleId : null,
        pricingRuleMargin: Number.isFinite(pricingRuleMargin) ? pricingRuleMargin : null,
        transferRate: Number.isFinite(transferRate) ? transferRate : null,
        analyticalPnl: Number.isFinite(analyticalPnl)
          ? analyticalPnl
          : null,
        analyticalPnlQuoteMinor: hasMinorAnalyticalPnl
          ? analyticalPnlQuoteMinor
          : null,
        analyticalPnlQuoteFractionDigits: hasMinorAnalyticalPnl
          ? analyticalPnlQuoteFractionDigits
          : null,
        comment: String(source.comment ?? "").trim(),
        marketPulseBid: Number.isFinite(marketPulseBid) ? marketPulseBid : null,
        marketPulseOffer: Number.isFinite(marketPulseOffer) ? marketPulseOffer : null,
        marketPulseTimestamp,
        marketPulseStreamStatus: ["RUNNING", "STOPPED"].includes(marketPulseStreamStatus)
          ? marketPulseStreamStatus
          : "",
        historicalBatchMember: source.historicalBatchMember === true
          || Number(source.historicalBatchMember) === 1,
        clientCode: String(source.clientCode ?? source.inn ?? "").trim(),
        clientCodeType: String(source.clientCodeType || "").trim().toUpperCase(),
        clientName: String(source.clientName || "").trim(),
        tradeDate,
        ccyPairCode,
        currencyPair,
        side,
        dealtCcyCode,
        baseCcyAmountMinor: hasMinorAmounts ? baseCcyAmountMinor : null,
        baseCcyFractionDigits: hasMinorAmounts ? baseCcyFractionDigits : null,
        quoteCcyAmountMinor: hasMinorAmounts ? quoteCcyAmountMinor : null,
        quoteCcyFractionDigits: hasMinorAmounts ? quoteCcyFractionDigits : null,
        baseCcyAmount,
        quoteCcyAmount,
        tradeRate,
        tenor: String(source.tenor || "").trim().toUpperCase(),
        baseCcyValueDate,
        quoteCcyValueDate
      };
    }

    function loadClientFxDeals() {
      const source = DEMO_API_ENABLED ? DEMO_API_BOOTSTRAP.clientFxDeals : [];

      return (Array.isArray(source) ? source : [])
        .map(normalizedClientFxDeal)
        .filter(deal => Number.isInteger(deal.clientDealId) && deal.clientDealId > 0)
        .sort((left, right) => left.clientDealId - right.clientDealId);
    }

    async function reloadClientFxDealsFromApi() {
      const records = await demoApiRequest("/api/v1/client-fx-deals");
      clientFxDeals = (Array.isArray(records) ? records : [])
        .map(normalizedClientFxDeal)
        .filter(deal => Number.isInteger(deal.clientDealId) && deal.clientDealId > 0)
        .sort((left, right) => left.clientDealId - right.clientDealId);
      return clientFxDeals;
    }

    function normalizedHedgeFxDeal(value) {
      const source = value && typeof value === "object" ? value : {};
      const sharedTrade = normalizedClientFxDeal({
        ...source,
        clientCode: source.counterpartyCode ?? source.clientCode,
        clientCodeType: source.counterpartyCodeType ?? source.clientCodeType,
        clientName: source.counterpartyName ?? source.clientName
      });
      const tradeId = Number(source.tradeId ?? source.hedgeDealId ?? source.hedgeFxDealId ?? source.id);

      return {
        ...sharedTrade,
        tradeId,
        hedgeDealId: tradeId,
        requestTimestamp: String(
          source.requestTimestamp ?? source.request_timestamp ?? ""
        ).trim(),
        counterpartyCode: String(source.counterpartyCode ?? source.clientCode ?? "").trim(),
        counterpartyCodeType: String(source.counterpartyCodeType ?? source.clientCodeType ?? "").trim().toUpperCase(),
        counterpartyName: String(source.counterpartyName ?? source.clientName ?? "").trim()
      };
    }

    function loadHedgeFxDeals() {
      const source = DEMO_API_ENABLED ? DEMO_API_BOOTSTRAP.hedgeFxDeals : [];

      return (Array.isArray(source) ? source : [])
        .map(normalizedHedgeFxDeal)
        .filter(deal => Number.isInteger(deal.hedgeDealId) && deal.hedgeDealId > 0)
        .sort((left, right) => left.hedgeDealId - right.hedgeDealId);
    }

    async function reloadHedgeFxDealsFromApi() {
      const records = await demoApiRequest("/api/v1/hedge-fx-deals");
      hedgeFxDeals = (Array.isArray(records) ? records : [])
        .map(normalizedHedgeFxDeal)
        .filter(deal => Number.isInteger(deal.hedgeDealId) && deal.hedgeDealId > 0)
        .sort((left, right) => left.hedgeDealId - right.hedgeDealId);
      return hedgeFxDeals;
    }

    function normalizedFxBatch(value) {
      const source = value && typeof value === "object" ? value : {};
      const sourceBatchingKey = source.batchingKey
        && typeof source.batchingKey === "object"
        ? source.batchingKey
        : {};
      const formationReasonDetails = source.formationReasonDetails
        && typeof source.formationReasonDetails === "object"
        && !Array.isArray(source.formationReasonDetails)
        ? source.formationReasonDetails
        : {};

      const hasDuration = source.windowDurationMs !== null
        && source.windowDurationMs !== undefined
        && source.windowDurationMs !== "";
      const duration = hasDuration ? Number(source.windowDurationMs) : null;

      return {
        batchId: Number(source.batchId),
        ccyPairCode: String(source.ccyPairCode || "").trim().toUpperCase(),
        batchingKey: source.batchingKey
          ? {
              ccyPairCode: String(sourceBatchingKey.ccyPairCode || source.ccyPairCode || "")
                .trim()
                .toUpperCase(),
              tradeDate: String(sourceBatchingKey.tradeDate || "").trim(),
              tenor: String(sourceBatchingKey.tenor || "").trim().toUpperCase(),
              baseCcyValueDate: String(sourceBatchingKey.baseCcyValueDate || "").trim(),
              quoteCcyValueDate: String(sourceBatchingKey.quoteCcyValueDate || "").trim(),
              baseCcyFractionDigits: Number(sourceBatchingKey.baseCcyFractionDigits),
              quoteCcyFractionDigits: Number(sourceBatchingKey.quoteCcyFractionDigits)
            }
          : null,
        windowOpenedAt: source.windowOpenedAt
          ? String(source.windowOpenedAt).trim()
          : null,
        windowClosedAt: source.windowClosedAt
          ? String(source.windowClosedAt).trim()
          : null,
        windowDurationMs: hasDuration && Number.isFinite(duration) && duration >= 0
          ? duration
          : null,
        sourceTradeCount: source.sourceTradeCount === null
          || source.sourceTradeCount === undefined
          ? null
          : Number(source.sourceTradeCount),
        batchStatus: String(source.batchStatus || "").trim().toUpperCase(),
        formationReasonCode: String(
          source.formationReasonCode || "MANUAL_SELECTION"
        ).trim().toUpperCase(),
        formationReasonDetails,
        formationReasonDescription: String(
          source.formationReasonDescription || "Manual selection."
        ).trim(),
        formedAt: String(source.formedAt || source.createdAt || "").trim(),
        rolledBackAt: String(source.rolledBackAt || "").trim()
      };
    }

    function loadFxBatches() {
      const source = DEMO_API_ENABLED ? DEMO_API_BOOTSTRAP.fxBatches : [];

      return (Array.isArray(source) ? source : [])
        .map(normalizedFxBatch)
        .filter(batch => Number.isInteger(batch.batchId) && batch.batchId > 0)
        .sort((left, right) => right.batchId - left.batchId);
    }

    async function reloadFxBatchesFromApi() {
      const records = await demoApiRequest("/api/v1/fx-batches");
      fxBatchHistory = (Array.isArray(records) ? records : [])
        .map(normalizedFxBatch)
        .filter(batch => Number.isInteger(batch.batchId) && batch.batchId > 0)
        .sort((left, right) => right.batchId - left.batchId);
      renderBatchingHistory(fxBatchHistory);
      return fxBatchHistory;
    }

    function normalizedBatchBalanceMinor(
      contributionMinor,
      amountMinor,
      side,
      positiveSide
    ) {
      if (
        contributionMinor !== null
        && contributionMinor !== undefined
        && contributionMinor !== ""
      ) {
        const normalizedContribution = Number(contributionMinor);

        if (Number.isSafeInteger(normalizedContribution)) {
          return normalizedContribution;
        }
      }

      const normalizedAmount = Number(amountMinor);
      const normalizedSide = String(side || "").trim().toUpperCase();

      if (
        !Number.isSafeInteger(normalizedAmount)
        || normalizedAmount < 0
        || !["BUY", "SELL"].includes(normalizedSide)
      ) {
        return null;
      }

      return normalizedSide === positiveSide
        ? normalizedAmount
        : -normalizedAmount;
    }

    function normalizedBatchDetailTrade(value, roleField) {
      const source = value && typeof value === "object" ? value : {};
      const nullableNumber = rawValue =>
        rawValue === null || rawValue === undefined || rawValue === ""
          ? null
          : Number(rawValue);
      const side = String(source.side || "").trim().toUpperCase();
      const tradeId = nullableNumber(source.tradeId);
      const tradeType = String(source.tradeType || "").trim().toUpperCase();
      const createdByBatchId = nullableNumber(source.createdByBatchId);
      const baseCcyAmountMinor = Number(source.baseCcyAmountMinor);
      const quoteCcyAmountMinor = Number(source.quoteCcyAmountMinor);
      const analyticalPnlQuoteMinorSource = source.analyticalPnlQuoteMinor;
      const analyticalPnlQuoteFractionDigitsSource =
        source.analyticalPnlQuoteFractionDigits;
      const analyticalPnlQuoteMinor = nullableNumber(
        analyticalPnlQuoteMinorSource
      );
      const analyticalPnlQuoteFractionDigits = nullableNumber(
        analyticalPnlQuoteFractionDigitsSource
      );
      const hasMinorAnalyticalPnl =
        analyticalPnlQuoteMinorSource !== null
        && analyticalPnlQuoteMinorSource !== undefined
        && analyticalPnlQuoteMinorSource !== ""
        && analyticalPnlQuoteFractionDigitsSource !== null
        && analyticalPnlQuoteFractionDigitsSource !== undefined
        && analyticalPnlQuoteFractionDigitsSource !== ""
        && Number.isSafeInteger(analyticalPnlQuoteMinor)
        && Number.isInteger(analyticalPnlQuoteFractionDigits)
        && analyticalPnlQuoteFractionDigits >= 0
        && analyticalPnlQuoteFractionDigits <= 10;
      const currencyPair = String(source.currencyPair || "").trim().toUpperCase();
      const [pairBaseCcyCode = "", pairQuoteCcyCode = ""] =
        currencyPair.split("/");

      return {
        batchContentKey: String(
          source.batchContentKey
          || (Number.isInteger(tradeId) && tradeId > 0
            ? `TRADE:${tradeId}`
            : `${tradeType}:${createdByBatchId || "UNASSIGNED"}`)
        ),
        tradeId,
        tradeType,
        [roleField]: String(source[roleField] || "").trim().toUpperCase(),
        executionTimestamp: String(source.executionTimestamp || "").trim(),
        receivedTimestamp: String(source.receivedTimestamp || "").trim(),
        tradeDate: String(source.tradeDate || "").trim(),
        ccyPairCode: String(source.ccyPairCode || "").trim().toUpperCase(),
        currencyPair,
        side,
        dealtCcyCode: String(source.dealtCcyCode || "").trim().toUpperCase(),
        baseCcyCode: String(
          source.baseCcyCode || pairBaseCcyCode
        ).trim().toUpperCase(),
        quoteCcyCode: String(
          source.quoteCcyCode || pairQuoteCcyCode
        ).trim().toUpperCase(),
        baseCcyAmountMinor,
        baseCcyFractionDigits: Number(source.baseCcyFractionDigits),
        quoteCcyAmountMinor,
        quoteCcyFractionDigits: Number(source.quoteCcyFractionDigits),
        baseCcyAmount: Number(source.baseCcyAmount),
        quoteCcyAmount: Number(source.quoteCcyAmount),
        baseBalanceContributionMinor: normalizedBatchBalanceMinor(
          source.baseBalanceContributionMinor,
          baseCcyAmountMinor,
          side,
          "SELL"
        ),
        quoteBalanceContributionMinor: normalizedBatchBalanceMinor(
          source.quoteBalanceContributionMinor,
          quoteCcyAmountMinor,
          side,
          "BUY"
        ),
        tradeRate: nullableNumber(source.tradeRate),
        transferRate: nullableNumber(source.transferRate),
        analyticalPnl: nullableNumber(source.analyticalPnl),
        analyticalPnlQuoteMinor: hasMinorAnalyticalPnl
          ? analyticalPnlQuoteMinor
          : null,
        analyticalPnlQuoteFractionDigits: hasMinorAnalyticalPnl
          ? analyticalPnlQuoteFractionDigits
          : null,
        tenor: String(source.tenor || "").trim().toUpperCase(),
        baseCcyValueDate: String(source.baseCcyValueDate || "").trim(),
        quoteCcyValueDate: String(source.quoteCcyValueDate || "").trim(),
        counterpartyId: nullableNumber(source.counterpartyId),
        counterpartyCode: String(source.counterpartyCode || "").trim(),
        counterpartyCodeType: String(source.counterpartyCodeType || "").trim(),
        counterpartyName: String(source.counterpartyName || "").trim(),
        createdByBatchId
      };
    }

    function normalizedBatchCashOutput(value) {
      const source = value && typeof value === "object" ? value : null;

      if (!source) {
        return null;
      }

      const batchId = Number(source.batchId);
      const balanceContributionMinor = Number(source.balanceContributionMinor);
      const fractionDigits = Number(source.fractionDigits);
      const currencyCode = String(source.currencyCode || "").trim().toUpperCase();

      if (
        !Number.isInteger(batchId)
        || batchId <= 0
        || !Number.isSafeInteger(balanceContributionMinor)
        || !Number.isInteger(fractionDigits)
        || fractionDigits < 0
        || fractionDigits > 10
        || !/^[A-Z]{3}$/.test(currencyCode)
      ) {
        return null;
      }

      return {
        batchContentKey: `CASH_OUTPUT:${batchId}`,
        batchId,
        outputType: String(
          source.outputType || "BATCH_QUOTE_CASH_OUT"
        ).trim().toUpperCase(),
        currencyCode,
        balanceContributionMinor,
        fractionDigits,
        valueDate: String(source.valueDate || "").trim(),
        createdAt: String(source.createdAt || "").trim()
      };
    }

    function normalizedFxBatchDetails(value) {
      const source = value && typeof value === "object" ? value : {};
      const batch = normalizedFxBatch(source);
      const batchingKeySource = source.batchingKey
        && typeof source.batchingKey === "object"
        ? source.batchingKey
        : {};
      const members = (Array.isArray(source.members) ? source.members : [])
        .map(member => normalizedBatchDetailTrade(member, "memberRole"))
        .filter(member => Number.isInteger(member.tradeId) && member.tradeId > 0);
      const outputs = (Array.isArray(source.outputs) ? source.outputs : [])
        .map(output => normalizedBatchDetailTrade(output, "outputRole"))
        .filter(output => Number.isInteger(output.tradeId) && output.tradeId > 0);
      const cashOutput = normalizedBatchCashOutput(source.cashOutput);

      return {
        ...batch,
        currencyPair: String(
          source.currencyPair || batch.ccyPairCode.replace("_", "/")
        ).trim().toUpperCase(),
        batchingKey: {
          ccyPairCode: String(
            batchingKeySource.ccyPairCode || batch.ccyPairCode
          ).trim().toUpperCase(),
          tradeDate: String(batchingKeySource.tradeDate || "").trim(),
          tenor: String(batchingKeySource.tenor || "").trim().toUpperCase(),
          baseCcyValueDate: String(
            batchingKeySource.baseCcyValueDate || ""
          ).trim(),
          quoteCcyValueDate: String(
            batchingKeySource.quoteCcyValueDate || ""
          ).trim(),
          baseCcyFractionDigits: Number(
            batchingKeySource.baseCcyFractionDigits
          ),
          quoteCcyFractionDigits: Number(
            batchingKeySource.quoteCcyFractionDigits
          )
        },
        members,
        outputs,
        cashOutput
      };
    }

    async function loadFxBatchDetailsFromApi(batchId) {
      const record = await demoApiRequest(
        `/api/v1/fx-batches/${encodeURIComponent(batchId)}`
      );

      return normalizedFxBatchDetails(record);
    }

    function normalizedBatchBalancingTrade(value) {
      const source = value && typeof value === "object" ? value : {};
      const tradeId = Number(source.tradeId);

      return {
        batchTradeId: Number(source.batchTradeId),
        batchPairId: Number(source.batchPairId),
        batchId: Number(source.batchId),
        batchRole: String(source.batchRole || "").trim().toUpperCase(),
        originatingBatchStatus: String(
          source.originatingBatchStatus || ""
        ).trim().toUpperCase(),
        tradeId,
        tradeType: String(source.tradeType || "").trim().toUpperCase(),
        createdAt: String(source.createdAt || "").trim(),
        executionTimestamp: String(source.executionTimestamp || "").trim(),
        receivedTimestamp: String(source.receivedTimestamp || "").trim(),
        tradeDate: String(source.tradeDate || "").trim(),
        ccyPairCode: String(source.ccyPairCode || "").trim().toUpperCase(),
        currencyPair: String(source.currencyPair || "").trim().toUpperCase(),
        side: String(source.side || "").trim().toUpperCase(),
        dealtCcyCode: String(source.dealtCcyCode || "").trim().toUpperCase(),
        baseCcyAmountMinor: Number(source.baseCcyAmountMinor),
        baseCcyFractionDigits: Number(source.baseCcyFractionDigits),
        quoteCcyAmountMinor: Number(source.quoteCcyAmountMinor),
        quoteCcyFractionDigits: Number(source.quoteCcyFractionDigits),
        baseCcyAmount: Number(source.baseCcyAmount),
        quoteCcyAmount: Number(source.quoteCcyAmount),
        tradeRate: source.tradeRate === null ? null : Number(source.tradeRate),
        transferRate: source.tradeRate === null ? null : Number(source.tradeRate),
        tenor: String(source.tenor || "").trim().toUpperCase(),
        baseCcyValueDate: String(source.baseCcyValueDate || "").trim(),
        quoteCcyValueDate: String(source.quoteCcyValueDate || "").trim(),
        consumedByBatchId: source.consumedByBatchId === null
          || source.consumedByBatchId === undefined
          ? null
          : Number(source.consumedByBatchId),
        consumedByBatchStatus: String(
          source.consumedByBatchStatus || ""
        ).trim().toUpperCase(),
        availableForBatching: source.availableForBatching === true
          || Number(source.availableForBatching) === 1,
      };
    }

    async function reloadFxPositionsFromApi() {
      const requestSequence = ++fxPositionsRequestSequence;
      const records = await demoApiRequest("/api/v1/fx-positions");

      if (requestSequence !== fxPositionsRequestSequence) {
        return fxPositionRecords;
      }

      fxPositionRecords = Array.isArray(records) ? records : [];
      loadFxPositionsFromDatabase();
      return fxPositionRecords;
    }

    async function refreshClientDealViewsFromApi() {
      await Promise.all([
        reloadClientFxDealsFromApi(),
        reloadFxPositionsFromApi()
      ]);
    }

    async function refreshHedgeDealViewsFromApi() {
      await Promise.all([
        reloadHedgeFxDealsFromApi(),
        reloadFxPositionsFromApi()
      ]);
    }

    function fxPositionFromClientFxDeal(record) {
      const [baseCcy = "EUR", quoteCcy = "USD"] = record.currencyPair.split("/");
      const side = record.side.toUpperCase();

      return {
        id: String(record.clientDealId),
        clientFxDealId: record.clientDealId,
        databaseBackedClientFxDeal: true,
        counterpartyId: record.counterpartyId,
        positionId: `FXP-CLIENT_DEAL-${record.clientDealId}`,
        branchCode: "",
        inn: record.clientCode,
        clientCodeType: record.clientCodeType,
        settlementSystemId: "",
        tradeCaptureChannelId: "",
        executionVenueType: "",
        executionVenue: "",
        type: "client_deal",
        counterpartyName: record.clientName,
        clientName: record.clientName,
        executionTimestamp: record.executionTimestamp,
        receivedTimestamp: record.receivedTimestamp,
        entryDate: clientFxDealsDateLabel(record.executionTimestamp.slice(0, 10)),
        tradeDate: clientFxDealsDateLabel(record.tradeDate),
        valueDate: clientFxDealsDateLabel(record.baseCcyValueDate),
        baseCurrencySettlementDay: clientFxDealsDateLabel(record.baseCcyValueDate),
        quoteCurrencySettlementDay: clientFxDealsDateLabel(record.quoteCcyValueDate),
        settlementMethod: "PVP",
        tenor: record.tenor,
        baseCurrency: baseCcy,
        quoteCurrency: quoteCcy,
        currencyPair: record.currencyPair,
        dealtCcyCode: record.dealtCcyCode,
        baseCcyAmountMinor: record.baseCcyAmountMinor,
        baseCcyFractionDigits: record.baseCcyFractionDigits,
        quoteCcyAmountMinor: record.quoteCcyAmountMinor,
        quoteCcyFractionDigits: record.quoteCcyFractionDigits,
        amountSell: side === "SELL" ? record.baseCcyAmount : 0,
        amountBuy: side === "BUY" ? record.baseCcyAmount : 0,
        clientRate: record.tradeRate,
        autoBatchRate: record.transferRate,
        pnlCash: record.analyticalPnl,
        analyticalPnlQuoteMinor: record.analyticalPnlQuoteMinor,
        analyticalPnlQuoteFractionDigits: record.analyticalPnlQuoteFractionDigits,
        pricingRuleId: record.pricingRuleId === null ? "" : String(record.pricingRuleId),
        pricingRuleMargin: null,
        pricingRuleControlStatus: record.pricingRuleId === null
          ? "CLIENT_ONBOARDING_MANUAL_PRICING"
          : "PRICING_RULE_APPLIED",
        pricingContextId: record.executionContextId === null ? "" : String(record.executionContextId),
        manualPricingReason: record.pricingRuleId === null
          ? CLIENT_ONBOARDING_MANUAL_PRICING
          : null,
        quoteCcyAmount: record.quoteCcyAmount,
        comment: record.comment,
        entryMarketBid: record.marketPulseBid,
        entryMarketOffer: record.marketPulseOffer,
        entryMarketTimestamp: record.marketPulseTimestamp,
        entryMarketStreamStatus: record.marketPulseStreamStatus,
        tone: "blue",
        batchId: "",
        isBatched: false,
        historicalBatchMember: record.historicalBatchMember === true
      };
    }

    function fxPositionFromHedgeFxDeal(record) {
      const [baseCcy = "EUR", quoteCcy = "USD"] = record.currencyPair.split("/");
      const side = record.side.toUpperCase();

      return {
        id: String(record.hedgeDealId),
        hedgeFxDealId: record.hedgeDealId,
        databaseBackedHedgeFxDeal: true,
        counterpartyId: record.counterpartyId,
        positionId: `FXP-HEDGE_DEAL-${record.hedgeDealId}`,
        branchCode: "",
        inn: record.counterpartyCode,
        clientCodeType: record.counterpartyCodeType,
        settlementSystemId: "",
        tradeCaptureChannelId: "",
        executionVenueType: record.counterpartyCodeType,
        executionVenue: record.counterpartyName,
        type: "hedge_deal",
        counterpartyName: record.counterpartyName,
        clientName: "",
        executionTimestamp: record.executionTimestamp,
        receivedTimestamp: record.receivedTimestamp,
        entryDate: clientFxDealsDateLabel(record.executionTimestamp.slice(0, 10)),
        tradeDate: clientFxDealsDateLabel(record.tradeDate),
        valueDate: clientFxDealsDateLabel(record.baseCcyValueDate),
        baseCurrencySettlementDay: clientFxDealsDateLabel(record.baseCcyValueDate),
        quoteCurrencySettlementDay: clientFxDealsDateLabel(record.quoteCcyValueDate),
        settlementMethod: "PVP",
        tenor: record.tenor,
        baseCurrency: baseCcy,
        quoteCurrency: quoteCcy,
        currencyPair: record.currencyPair,
        dealtCcyCode: record.dealtCcyCode,
        baseCcyAmountMinor: record.baseCcyAmountMinor,
        baseCcyFractionDigits: record.baseCcyFractionDigits,
        quoteCcyAmountMinor: record.quoteCcyAmountMinor,
        quoteCcyFractionDigits: record.quoteCcyFractionDigits,
        amountSell: side === "SELL" ? record.baseCcyAmount : 0,
        amountBuy: side === "BUY" ? record.baseCcyAmount : 0,
        clientRate: record.tradeRate,
        autoBatchRate: record.transferRate,
        pnlCash: record.analyticalPnl,
        analyticalPnlQuoteMinor: record.analyticalPnlQuoteMinor,
        analyticalPnlQuoteFractionDigits: record.analyticalPnlQuoteFractionDigits,
        pricingRuleId: record.pricingRuleId === null ? "" : String(record.pricingRuleId),
        pricingRuleMargin: record.pricingRuleMargin,
        pricingRuleControlStatus: "",
        pricingContextId: record.executionContextId === null ? "" : String(record.executionContextId),
        entryMarketBid: record.marketPulseBid,
        entryMarketOffer: record.marketPulseOffer,
        entryMarketTimestamp: record.marketPulseTimestamp,
        entryMarketStreamStatus: record.marketPulseStreamStatus,
        tone: "blue",
        batchId: "",
        isBatched: false,
        historicalBatchMember: record.historicalBatchMember === true
      };
    }

    function fxPositionFromBatchBalancingTrade(record) {
      const [baseCcy = "EUR", quoteCcy = "USD"] = record.currencyPair.split("/");
      const side = record.side.toUpperCase();

      return {
        id: String(record.tradeId),
        tradeId: record.tradeId,
        batchTradeId: record.batchTradeId,
        batchPairId: record.batchPairId,
        databaseBackedBatchBalancingTrade: true,
        positionId: `FXP-${record.tradeType}-${record.tradeId}`,
        branchCode: "",
        inn: "",
        clientCodeType: "",
        settlementSystemId: "",
        tradeCaptureChannelId: "",
        executionVenueType: "",
        executionVenue: "",
        type: record.tradeType.toLowerCase(),
        counterpartyName: "",
        clientName: "",
        executionTimestamp: record.executionTimestamp,
        receivedTimestamp: record.receivedTimestamp,
        entryDate: clientFxDealsDateLabel(record.executionTimestamp.slice(0, 10)),
        tradeDate: clientFxDealsDateLabel(record.tradeDate),
        valueDate: clientFxDealsDateLabel(record.baseCcyValueDate),
        baseCurrencySettlementDay: clientFxDealsDateLabel(record.baseCcyValueDate),
        quoteCurrencySettlementDay: clientFxDealsDateLabel(record.quoteCcyValueDate),
        settlementMethod: "PVP",
        tenor: record.tenor,
        baseCurrency: baseCcy,
        quoteCurrency: quoteCcy,
        currencyPair: record.currencyPair,
        dealtCcyCode: record.dealtCcyCode,
        baseCcyAmountMinor: record.baseCcyAmountMinor,
        baseCcyFractionDigits: record.baseCcyFractionDigits,
        quoteCcyAmountMinor: record.quoteCcyAmountMinor,
        quoteCcyFractionDigits: record.quoteCcyFractionDigits,
        amountSell: side === "SELL" ? record.baseCcyAmount : 0,
        amountBuy: side === "BUY" ? record.baseCcyAmount : 0,
        clientRate: record.tradeRate,
        autoBatchRate: record.tradeRate,
        pnlCash: 0,
        analyticalPnlQuoteMinor: null,
        analyticalPnlQuoteFractionDigits: null,
        pricingRuleId: "",
        pricingRuleMargin: null,
        pricingRuleControlStatus: "",
        pricingContextId: "",
        entryMarketBid: null,
        entryMarketOffer: null,
        entryMarketTimestamp: null,
        entryMarketStreamStatus: "",
        tone: "blue",
        batchId: String(record.batchId),
        isBatched: false
      };
    }

    function clientFxDealApiPayloadFromFxPosition(deal) {
      const profile = clientProfiles.find(item => item.counterpartyId === Number(deal.counterpartyId))
        || clientProfileByInn(clientFxDealClientCode(deal));
      const executionTimestamp = String(deal.executionTimestamp || "").trim();
      const executionContextId = Number(deal.pricingContextId);
      const pricingRuleId = Number(deal.pricingRuleId);
      const manualPricing = deal.manualPricingReason === CLIENT_ONBOARDING_MANUAL_PRICING
        || deal.pricingRuleControlStatus === "CLIENT_ONBOARDING_MANUAL_PRICING";
      const marketPulseBid = marketBid(deal);
      const marketPulseOffer = marketOffer(deal);
      const marketPulseTimestamp = String(deal.entryMarketTimestamp || "").trim();
      const storedMarketPulseStreamStatus = String(deal.entryMarketStreamStatus || "").trim().toUpperCase();
      const marketPulseStreamStatus = ["RUNNING", "STOPPED"].includes(storedMarketPulseStreamStatus)
        ? storedMarketPulseStreamStatus
        : marketStreamRunning ? "RUNNING" : "STOPPED";
      const hasMarketPulseSnapshot = Number.isFinite(marketPulseBid) && Number.isFinite(marketPulseOffer);
      const persistedExecutionTimestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(executionTimestamp)
        ? executionTimestamp
        : new Date().toISOString();

      return {
        executionTimestamp: persistedExecutionTimestamp,
        counterpartyId: profile?.counterpartyId ?? null,
        executionContextId: Number.isInteger(executionContextId) && executionContextId > 0
          ? executionContextId
          : null,
        pricingRuleId: Number.isInteger(pricingRuleId) && pricingRuleId > 0 ? pricingRuleId : null,
        manualPricingReason: manualPricing
          ? CLIENT_ONBOARDING_MANUAL_PRICING
          : null,
        transferRate: manualPricing
          ? String(deal.manualTransferRateText || deal.autoBatchRate || "")
          : null,
        tradeDate: isoDateFromClientFxDealValue(positionTradeDate(deal)),
        ccyPairCode: currencyPair(deal).replace("/", "_"),
        side: fxPositionSide(deal).toUpperCase(),
        dealtCcyCode: String(deal.dealtCcyCode || deal.baseCurrency || "").trim().toUpperCase(),
        dealtCcyAmount: String(deal.dealtCcyAmount || ""),
        tradeRate: String(deal.tradeRateText || deal.clientRate || ""),
        tenor: positionTenor(deal).toUpperCase(),
        baseCcyValueDate: isoDateFromClientFxDealValue(baseCurrencyValueDate(deal)),
        quoteCcyValueDate: isoDateFromClientFxDealValue(quoteCurrencyValueDate(deal)),
        marketPulseStreamStatus,
        marketPulseBid: hasMarketPulseSnapshot ? marketPulseBid : null,
        marketPulseOffer: hasMarketPulseSnapshot ? marketPulseOffer : null,
        marketPulseTimestamp: hasMarketPulseSnapshot
          ? (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(marketPulseTimestamp)
              ? marketPulseTimestamp
              : persistedEntryTimestamp)
          : null,
        comment: String(deal.comment || "").trim()
      };
    }

    async function createClientFxDealRecord(deal) {
      if (!DEMO_API_ENABLED) {
        throw new Error("SQLite API is required to save a Client FX Deal.");
      }

      const saved = await demoApiRequest(
        "/api/v1/client-fx-deals",
        {
          method: "POST",
          body: JSON.stringify(clientFxDealApiPayloadFromFxPosition(deal))
        }
      );
      return normalizedClientFxDeal(saved);
    }

    function pricingRuleApiPayload(rule, currentRule = null) {
      if (currentRule) {
        return {
          marginPercent: Number(rule?.marginPercent),
          autoHedgingAdmissionModeOverride:
            normalizedPricingRuleAutoHedgingAdmissionModeOverride(
              rule?.autoHedgingAdmissionModeOverride
            )
        };
      }

      const profile = clientProfiles.find(item => item.counterpartyId === rule?.counterpartyId) || clientProfileByInn(rule?.inn);

      return {
        counterpartyId: profile?.counterpartyId ?? null,
        executionContextId: normalizedPricingContextIdValue(rule?.pricingContextId),
        ccyPairCode: String(rule?.ccyPairCode || rule?.currencyPair?.replace("/", "_") || "").toUpperCase(),
        marginPercent: Number(rule?.marginPercent),
        autoHedgingAdmissionModeOverride:
          normalizedPricingRuleAutoHedgingAdmissionModeOverride(
            rule?.autoHedgingAdmissionModeOverride
          )
      };
    }

    async function persistPricingRuleRecord(rule, currentRule = null) {
      if (!DEMO_API_ENABLED) {
        const mergedRule = currentRule ? { ...currentRule, ...rule } : { ...rule };
        const context = pricingContextById(mergedRule.pricingContextId);
        const executionContextAdmissionMode = normalizedAutoHedgingAdmissionMode(
          context?.autoHedgingAdmissionMode,
          context?.defaultPositionManagementMode
        );
        const autoHedgingAdmissionModeOverride =
          normalizedPricingRuleAutoHedgingAdmissionModeOverride(
            mergedRule.autoHedgingAdmissionModeOverride
          );

        return {
          ...mergedRule,
          autoHedgingAdmissionModeOverride,
          executionContextAdmissionMode,
          effectiveAutoHedgingAdmissionMode:
            autoHedgingAdmissionModeOverride || executionContextAdmissionMode
        };
      }

      const isCreating = !currentRule;
      const saved = await demoApiRequest(
        isCreating
          ? "/api/v1/pricing-rules"
          : `/api/v1/pricing-rules/${encodeURIComponent(currentRule.pricingRuleId)}`,
        {
          method: isCreating ? "POST" : "PUT",
          body: JSON.stringify(pricingRuleApiPayload(rule, currentRule))
        }
      );

      return normalizedClientPricingRules([saved], [])[0] || null;
    }

    async function deletePricingRuleRecord(rule) {
      if (DEMO_API_ENABLED) {
        await demoApiRequest(`/api/v1/pricing-rules/${encodeURIComponent(rule.pricingRuleId)}`, {
          method: "DELETE"
        });
      }
    }

    function clientProfileByInn(inn) {
      const clientCode = String(inn || "").trim();
      return clientProfiles.find(profile => profile.inn === clientCode) || null;
    }

    function clientDealProfiles() {
      return clientProfiles.filter(profile =>
        tradingCounterpartyHasRole(profile, "CLIENT") && profile.isActive
      );
    }

    function clientNameForInn(inn) {
      return clientProfileByInn(inn)?.name || "";
    }

    function counterpartyTypeForInn(inn) {
      return normalizedCounterpartyType(clientProfileByInn(inn)?.counterpartyType, "CLIENT");
    }

    function clientPricingRulesForInn(inn) {
      return clientPricingRules
        .filter(rule => rule.inn === inn)
        .sort((left, right) =>
          left.currencyPair.localeCompare(right.currencyPair) ||
          left.pricingContextId.localeCompare(right.pricingContextId)
        );
    }

    function clientPricingRuleEntriesForInn(inn) {
      return clientPricingRules
        .map((rule, index) => ({ rule, index }))
        .filter(({ rule }) => rule.inn === inn)
        .sort((left, right) =>
          left.rule.currencyPair.localeCompare(right.rule.currencyPair) ||
          left.rule.pricingContextId.localeCompare(right.rule.pricingContextId)
        );
    }

    function pricingContextById(pricingContextIdValue) {
      return pricingContexts.find(context => context.pricingContextId === pricingContextIdValue) || null;
    }

    function pricingRulesForContext(pricingContextIdValue) {
      return clientPricingRules.filter(rule => rule.pricingContextId === pricingContextIdValue);
    }

    function pricingContextUsageCount(pricingContextIdValue) {
      const context = pricingContextById(pricingContextIdValue);

      if (Number.isFinite(context?.assignedCounterpartyCount)) {
        return context.assignedCounterpartyCount;
      }

      return new Set(
        pricingRulesForContext(pricingContextIdValue)
          .map(rule => String(rule.counterpartyId ?? rule.inn ?? ""))
          .filter(Boolean)
      ).size;
    }

    function executionContextDependencyDescription(pricingContextIdValue) {
      const counterpartyCount = pricingContextUsageCount(pricingContextIdValue);
      return counterpartyCount > 0
        ? `${counterpartyCount} trading ${counterpartyCount === 1 ? "counterparty" : "counterparties"}`
        : "";
    }

    function pricingContextsForServicingBranch(code) {
      return pricingContexts.filter(context => context.servicingBranchCode === code);
    }

    function pricingContextsForSettlementSystem(id) {
      return pricingContexts.filter(context => context.settlementSystemId === id);
    }

    function pricingContextsForTradeCaptureChannel(id) {
      return pricingContexts.filter(context => context.tradeCaptureChannelId === id);
    }

    function servicingBranchContextUsageCount(code) {
      return pricingContextsForServicingBranch(code).length;
    }

    function settlementSystemContextUsageCount(id) {
      return pricingContextsForSettlementSystem(id).length;
    }

    function tradeCaptureChannelContextUsageCount(id) {
      return pricingContextsForTradeCaptureChannel(id).length;
    }

    function primaryPricingRuleForProfile(profile, pair = activeCurrencyPairOrDefault()) {
      const rules = clientPricingRulesForInn(profile?.inn || "");

      return rules.find(rule => rule.currencyPair === pair) || rules[0] || null;
    }

    function pricingRuleForFxPosition(deal) {
      if (deal?.pricingRuleControlStatus === "PRICING_RULE_REQUIRED") {
        return null;
      }

      const rules = clientPricingRulesForInn(deal?.inn || deal?.clientCode || "");
      const storedRuleId = String(deal?.pricingRuleId || deal?.pricing_rule_id || "").trim();
      const pair = currencyPair(deal);
      const storedContextId = fxPositionExecutionContextId(deal);

      return rules.find(rule => rule.pricingRuleId === storedRuleId)
        || rules.find(rule => rule.currencyPair === pair && rule.pricingContextId === storedContextId)
        || rules.find(rule => rule.currencyPair === pair)
        || null;
    }

    function fxDealPricingRuleId(deal) {
      if (deal?.pricingRuleControlStatus === "PRICING_RULE_REQUIRED") {
        return "";
      }

      const storedRuleId = String(deal?.pricingRuleId || deal?.pricing_rule_id || "").trim();
      return storedRuleId || pricingRuleForFxPosition(deal)?.pricingRuleId || "";
    }

    function fxDealPricingRuleMargin(deal) {
      if (deal?.pricingRuleControlStatus === "PRICING_RULE_REQUIRED") {
        return null;
      }

      const storedMargin = deal?.pricingRuleMargin ?? deal?.pricing_rule_margin;

      if (storedMargin !== null && storedMargin !== undefined && storedMargin !== "") {
        const margin = Number(storedMargin);

        if (Number.isFinite(margin)) {
          return margin;
        }
      }

      return pricingRuleForFxPosition(deal)?.marginPercent ?? null;
    }

    function fxDealPricingRuleMarginCell(deal) {
      const margin = fxDealPricingRuleMargin(deal);
      return Number.isFinite(margin) ? `${editNumber(margin, 4)}%` : "";
    }

    function fxPositionExecutionContextId(deal) {
      const storedId = normalizedPricingContextIdValue(deal?.pricingContextId ?? deal?.pricing_context_id);

      if (storedId) {
        return storedId;
      }

      const servicingBranchCode = String(deal?.servicingBranchCode ?? deal?.servicing_branch_code ?? "").trim();
      const settlementSystemId = normalizedContextCode(deal?.settlementSystemId ?? deal?.settlement_system_id);
      const tradeCaptureChannelId = normalizedTradeCaptureChannelId(deal?.tradeCaptureChannelId ?? deal?.trade_capture_channel_id);

      return servicingBranchCode && settlementSystemId && tradeCaptureChannelId
        ? pricingContextIdForComponents(servicingBranchCode, settlementSystemId, tradeCaptureChannelId)
        : "";
    }

    function pricingContextForFxPosition(deal) {
      if (deal?.pricingRuleControlStatus === "PRICING_RULE_REQUIRED") {
        return null;
      }

      const storedContext = pricingContextById(fxPositionExecutionContextId(deal));
      const rule = pricingRuleForFxPosition(deal);

      return storedContext || pricingContextById(rule?.pricingContextId) || null;
    }

    function applyPricingContextToFxPosition(deal, options = {}) {
      const type = String(deal?.type || "client_deal").toLowerCase();
      const force = options.force === true;

      if (type !== "client_deal") {
        deal.pricingContextId = "";
        return;
      }

      if (deal.pricingRuleControlStatus === "PRICING_RULE_REQUIRED") {
        deal.pricingContextId = "";
        return;
      }

      const context = pricingContextForFxPosition(deal);

      if (force || !deal.pricingContextId) {
        deal.pricingContextId = context?.pricingContextId || "";
      }
    }

    function branchCodeForClientProfile(profile, pair = activeCurrencyPairOrDefault()) {
      const rule = primaryPricingRuleForProfile(profile, pair);
      const context = pricingContextById(rule?.pricingContextId);

      return context?.servicingBranchCode || pricingContexts[0]?.servicingBranchCode || "";
    }

    function marginPercentForClientProfile(profile, pair = activeCurrencyPairOrDefault()) {
      return primaryPricingRuleForProfile(profile, pair)?.marginPercent ?? 0;
    }

    function pricingRuleClientOptions(selectedInn) {
      return clientProfiles
        .map(profile => {
          const label = `${profile.inn} | ${profile.name}`;
          return `<option value="${escapeHtml(profile.inn)}" ${profile.inn === selectedInn ? "selected" : ""}>${escapeHtml(label)}</option>`;
        })
        .join("");
    }

    function pricingRuleCounterpartyExecutionContextState(inn = "") {
      const profile = clientProfileByInn(inn);
      const counterpartyId = tradingCounterpartyExecutionContextKey(profile);

      if (!profile || !counterpartyId) {
        return { status: "missing-counterparty", profile: null, contexts: [] };
      }

      if (!DEMO_API_ENABLED || tradingCounterpartyExecutionContexts.has(counterpartyId)) {
        return {
          status: "loaded",
          profile,
          contexts: assignedExecutionContextsForProfile(profile)
        };
      }

      const loadState = tradingCounterpartyExecutionContextLoadStates.get(counterpartyId);

      return {
        status: loadState?.status || "unloaded",
        profile,
        contexts: [],
        message: loadState?.message || ""
      };
    }

    function availablePricingRuleExecutionContextIds(inn = "") {
      return pricingRuleCounterpartyExecutionContextState(inn).contexts
        .map(context => context.pricingContextId)
        .filter(Boolean)
        .sort((left, right) => left.localeCompare(right, "en", { numeric: true, sensitivity: "base" }));
    }

    function resolvedPricingRuleExecutionContextId(selectedPricingContextId = "", inn = "") {
      const availableContextIds = availablePricingRuleExecutionContextIds(inn);

      if (availableContextIds.includes(selectedPricingContextId)) {
        return selectedPricingContextId;
      }

      return availableContextIds.length === 1 ? availableContextIds[0] : "";
    }

    function pricingRuleContextOptions(selectedPricingContextId = "", inn = "") {
      const state = pricingRuleCounterpartyExecutionContextState(inn);
      const availableContextIds = availablePricingRuleExecutionContextIds(inn);
      const resolvedContextId = resolvedPricingRuleExecutionContextId(selectedPricingContextId, inn);

      if (state.status === "missing-counterparty") {
        return '<option value="">Select a Trading Counterparty first</option>';
      }

      if (state.status === "loading" || state.status === "unloaded") {
        return '<option value="">Loading attached Execution Contexts...</option>';
      }

      if (state.status === "error") {
        return '<option value="">Attached Execution Contexts unavailable</option>';
      }

      if (availableContextIds.length === 0) {
        return '<option value="">No attached Execution Contexts</option>';
      }

      return `${availableContextIds.length > 1 ? `<option value=""></option>` : ""}${availableContextIds
        .map(pricingContextIdValue => `<option value="${escapeHtml(pricingContextIdValue)}" ${pricingContextIdValue === resolvedContextId ? "selected" : ""}>${escapeHtml(pricingContextDisplayPath(pricingContextIdValue))}</option>`)
        .join("")}`;
    }

    function pricingRuleContextHelp(state) {
      if (state.status === "loading" || state.status === "unloaded") {
        return "Loading contexts attached to this Trading Counterparty.";
      }

      if (state.status === "error") {
        return state.message || "Attached Execution Contexts could not be loaded.";
      }

      if (state.status === "loaded" && state.contexts.length === 0) {
        return "Attach an Execution Context to this Trading Counterparty before adding a Pricing Rule.";
      }

      return "";
    }

    function ensurePricingRuleCounterpartyExecutionContexts(row, inn) {
      const state = pricingRuleCounterpartyExecutionContextState(inn);

      if (state.status !== "unloaded" || !state.profile) {
        return;
      }

      const expectedCounterpartyId = state.profile.counterpartyId;

      refreshTradingCounterpartyExecutionContexts(state.profile, { render: false }).then(() => {
        if (!row.isConnected) {
          return;
        }

        const selectedProfile = clientProfileByInn(
          row.querySelector("[data-pricing-rule-field='inn']")?.value.trim() || ""
        );

        if (selectedProfile?.counterpartyId === expectedCounterpartyId) {
          syncPricingRuleRowPreview(row);
        }
      });
    }

    function pricingRulePreview(inn, currencyPairValue, pricingContextIdValue, existingPricingRuleId = "") {
      if (existingPricingRuleId) {
        return String(existingPricingRuleId);
      }

      return inn && currencyPairValue && pricingContextIdValue ? "Auto" : "";
    }

    function syncPricingRuleRowContextOptions(row) {
      const contextSelect = row.querySelector("[data-pricing-rule-field='pricingContextId']");

      if (!contextSelect) {
        return;
      }

      const inn = row.querySelector("[data-pricing-rule-field='inn']")?.value.trim() || "";
      const selectedContextId = (
        contextSelect.value || contextSelect.dataset.pricingRuleContextPreferred || ""
      ).trim().toUpperCase();
      const initialState = pricingRuleCounterpartyExecutionContextState(inn);

      ensurePricingRuleCounterpartyExecutionContexts(row, inn);

      const state = initialState.status === "unloaded"
        ? pricingRuleCounterpartyExecutionContextState(inn)
        : initialState;
      const availableContextIds = availablePricingRuleExecutionContextIds(inn);
      const help = row.querySelector("[data-pricing-rule-context-help]");

      contextSelect.innerHTML = pricingRuleContextOptions(selectedContextId, inn);
      contextSelect.value = resolvedPricingRuleExecutionContextId(selectedContextId, inn);
      contextSelect.disabled = state.status !== "loaded" || availableContextIds.length === 0;
      if (state.status === "loaded") {
        contextSelect.dataset.pricingRuleContextPreferred = contextSelect.value;
      }
      row.dataset.pricingRuleContextStatus = state.status;
      contextSelect.setCustomValidity("");

      if (help) {
        help.textContent = pricingRuleContextHelp(state);
        help.hidden = !help.textContent;
      }
    }

    function pricingRuleRowAutoHedgingAdmissionModeOverride(row) {
      const overrideControl = row?.querySelector(
        "[data-pricing-rule-field='autoHedgingAdmissionModeOverride']"
      );

      return pricingRuleAutoHedgingAdmissionModeOverrideFromControl(overrideControl);
    }

    function syncPricingRuleRowAutoHedgingAdmissionControls(row) {
      const overrideControl = row?.querySelector(
        "[data-pricing-rule-field='autoHedgingAdmissionModeOverride']"
      );

      if (!overrideControl) {
        return null;
      }

      return pricingRuleRowAutoHedgingAdmissionModeOverride(row);
    }

    function syncPricingRuleRowPreview(row) {
      syncPricingRuleRowContextOptions(row);
      const inn = row.querySelector("[data-pricing-rule-field='inn']")?.value.trim() || "";
      const currencyPairValue = normalizedPricingRuleCurrencyPair(row.querySelector("[data-pricing-rule-field='currencyPair']")?.value);
      const pricingContextIdValue = row.querySelector("[data-pricing-rule-field='pricingContextId']")?.value.trim().toUpperCase() || "";
      syncPricingRuleRowAutoHedgingAdmissionControls(row);
      const preview = row.querySelector("[data-pricing-rule-preview]");
      const clientNameCell = row.querySelector("[data-pricing-rule-client-name]");

      if (preview) {
        preview.textContent = pricingRulePreview(
          inn,
          currencyPairValue,
          pricingContextIdValue,
          row.dataset.pricingRuleId || ""
        );
      }

      if (clientNameCell) {
        clientNameCell.textContent = clientNameForInn(inn);
      }

      updatePricingRuleRowSaveAvailability(row);
    }

    function pricingRuleDraftFromRow(row) {
      const inn = row.querySelector("[data-pricing-rule-field='inn']")?.value.trim() || "";
      const currencyPair = normalizedPricingRuleCurrencyPair(row.querySelector("[data-pricing-rule-field='currencyPair']")?.value);
      const pricingContextIdValue = row.querySelector("[data-pricing-rule-field='pricingContextId']")?.value.trim().toUpperCase() || "";
      const autoHedgingAdmissionModeOverride = syncPricingRuleRowAutoHedgingAdmissionControls(row);
      const marginPercent = normalizeNumber(row.querySelector("[data-pricing-rule-field='marginPercent']")?.value);
      const profile = clientProfileByInn(inn);
      const contextState = pricingRuleCounterpartyExecutionContextState(inn);
      const contextAttached = availablePricingRuleExecutionContextIds(inn).includes(pricingContextIdValue);

      if (
        !isValidClientCodeForProfile(inn) ||
        !currencyPair ||
        contextState.status !== "loaded" ||
        !contextAttached ||
        autoHedgingAdmissionModeOverride === undefined ||
        marginPercent === null ||
        !Number.isFinite(marginPercent) ||
        marginPercent < 0 ||
        marginPercent >= 100
      ) {
        return null;
      }

      return {
        pricingRuleId: pricingRuleIdForEditState(pricingRuleEditState),
        counterpartyId: profile?.counterpartyId ?? null,
        counterpartyType: normalizedCounterpartyType(profile?.counterpartyType, "CLIENT"),
        inn,
        currencyPair,
        ccyPairCode: currencyPair.replace("/", "_"),
        pricingContextId: pricingContextIdValue,
        autoHedgingAdmissionModeOverride,
        marginPercent
      };
    }

    function pricingRuleIdentityKey(rule) {
      return [
        rule?.counterpartyId ?? rule?.inn ?? "",
        rule?.ccyPairCode || rule?.currencyPair?.replace("/", "_") || "",
        rule?.pricingContextId || ""
      ].join("\u0000");
    }

    function samePricingRuleIdentity(left, right) {
      return Boolean(left && right) && pricingRuleIdentityKey(left) === pricingRuleIdentityKey(right);
    }

    function samePricingRule(left, right) {
      return Boolean(left && right) &&
        samePricingRuleIdentity(left, right) &&
        normalizedPricingRuleAutoHedgingAdmissionModeOverride(left.autoHedgingAdmissionModeOverride) ===
          normalizedPricingRuleAutoHedgingAdmissionModeOverride(right.autoHedgingAdmissionModeOverride) &&
        sameNumber(left.marginPercent, right.marginPercent);
    }

    function updatePricingRuleRowSaveAvailability(row) {
      const button = row.querySelector("[data-pricing-rule-action='save']");
      const contextStatus = row.dataset.pricingRuleContextStatus;

      if (contextStatus === "loading" || contextStatus === "unloaded") {
        setSaveButtonAvailability(button, false, "Wait until attached Execution Contexts are loaded");
        return;
      }

      if (contextStatus === "error") {
        setSaveButtonAvailability(button, false, "Attached Execution Contexts could not be loaded");
        return;
      }

      const rule = pricingRuleDraftFromRow(row);

      if (!rule) {
        setSaveButtonAvailability(button, false, "Complete required fields before saving");
        return;
      }

      const currentIndex = pricingRuleEditStateIndex();
      const duplicateIndex = clientPricingRules.findIndex((item, index) =>
        index !== currentIndex && samePricingRuleIdentity(item, rule)
      );

      if (duplicateIndex !== -1) {
        setSaveButtonAvailability(button, false, "Pricing Rule already exists");
        return;
      }

      const currentRule = currentIndex === null ? null : clientPricingRules[currentIndex];
      const changed = currentIndex === null || !samePricingRule(rule, currentRule);
      setSaveButtonAvailability(button, changed);
    }

    function parsePricingRuleCurrencyPairInput(input) {
      const value = normalizedPricingRuleCurrencyPair(input.value);
      const valid = Boolean(value);

      input.value = value || input.value.trim().toUpperCase();
      input.setCustomValidity(valid ? "" : "Ccy Pair must look like EUR/USD.");

      if (!valid) {
        input.reportValidity();
        return null;
      }

      return value;
    }

    function pricingRuleEditStateIndex() {
      return pricingRuleEditState?.mode === "edit" ? pricingRuleEditState.index : null;
    }

    function pricingRuleDefaultDraft(inn = pricingRulesClientInnFilter) {
      const profile = clientProfileByInn(inn) || clientProfiles[0] || null;
      const pricingContextIdValue = resolvedPricingRuleExecutionContextId("", profile?.inn || "");

      return {
        pricingRuleId: "",
        counterpartyId: profile?.counterpartyId ?? null,
        counterpartyType: normalizedCounterpartyType(profile?.counterpartyType, "CLIENT"),
        inn: profile?.inn || "",
        currencyPair: activeCurrencyPairOrDefault(),
        ccyPairCode: activeCurrencyPairOrDefault().replace("/", "_"),
        pricingContextId: pricingContextIdValue,
        autoHedgingAdmissionModeOverride: null,
        marginPercent: profile?.marginPercent ?? 0
      };
    }

    function pricingRuleFromRow(row) {
      const innSelect = row.querySelector("[data-pricing-rule-field='inn']");
      const currencyPairInput = row.querySelector("[data-pricing-rule-field='currencyPair']");
      const contextSelect = row.querySelector("[data-pricing-rule-field='pricingContextId']");
      const autoHedgingAdmissionModeOverrideSelect = row.querySelector(
        "[data-pricing-rule-field='autoHedgingAdmissionModeOverride']"
      );
      const marginInput = row.querySelector("[data-pricing-rule-field='marginPercent']");
      const inn = innSelect?.value.trim() || "";
      const currencyPair = parsePricingRuleCurrencyPairInput(currencyPairInput);
      const pricingContextIdValue = contextSelect?.value.trim().toUpperCase() || "";
      const autoHedgingAdmissionModeOverride = syncPricingRuleRowAutoHedgingAdmissionControls(row);
      const marginPercent = parsePercentInput(marginInput, "Margin", 100);
      const profile = clientProfileByInn(inn);

      innSelect.setCustomValidity(isValidClientCodeForProfile(inn) ? "" : "Counterparty Code is required.");
      const contextState = pricingRuleCounterpartyExecutionContextState(inn);
      const contextAttached = contextState.status === "loaded"
        && availablePricingRuleExecutionContextIds(inn).includes(pricingContextIdValue);
      const contextMessage = contextState.status === "loading" || contextState.status === "unloaded"
        ? "Wait until attached Execution Contexts are loaded."
        : contextState.status === "error"
          ? "Attached Execution Contexts could not be loaded."
          : contextState.status === "loaded" && contextState.contexts.length === 0
            ? "Attach an Execution Context to this Trading Counterparty first."
            : "Select an Execution Context attached to this Trading Counterparty.";
      contextSelect.setCustomValidity(contextAttached ? "" : contextMessage);

      if (innSelect.validationMessage) {
        innSelect.reportValidity();
        return null;
      }

      if (!contextAttached) {
        contextSelect.reportValidity();
        return null;
      }

      if (autoHedgingAdmissionModeOverride === undefined) {
        autoHedgingAdmissionModeOverrideSelect?.reportValidity();
        return null;
      }

      if (currencyPair === null || marginPercent === null) {
        syncPricingRuleRowPreview(row);
        return null;
      }

      const rule = {
        pricingRuleId: pricingRuleIdForEditState(pricingRuleEditState),
        counterpartyId: profile?.counterpartyId ?? null,
        counterpartyType: normalizedCounterpartyType(profile?.counterpartyType, "CLIENT"),
        inn,
        currencyPair,
        ccyPairCode: currencyPair.replace("/", "_"),
        pricingContextId: pricingContextIdValue,
        autoHedgingAdmissionModeOverride,
        marginPercent
      };
      const currentIndex = pricingRuleEditStateIndex();
      const duplicateIndex = clientPricingRules.findIndex((item, index) =>
        index !== currentIndex && samePricingRuleIdentity(item, rule)
      );

      contextSelect.setCustomValidity(duplicateIndex === -1 ? "" : "Pricing Rule already exists.");

      if (duplicateIndex !== -1) {
        contextSelect.reportValidity();
        return null;
      }

      return rule;
    }

    function pricingRuleExecutionContextSearchText(rule) {
      const pricingMode = pricingModeForRule(rule);

      return `${rule.pricingContextId} ${pricingContextDisplayPath(rule.pricingContextId)} ${pricingMode} ${pricingTypePresentation(pricingMode).label}`;
    }

    function pricingRuleHeaderFilterControl(field) {
      return pricingRuleHeaderFilterControls
        .find(control => control.dataset.pricingRuleHeaderFilter === field) || null;
    }

    function pricingRuleMatchesRouteScope(rule) {
      return !pricingRulesRouteScope
        || rule.ccyPairCode === pricingRulesRouteScope.pairCode;
    }

    function highlightPricingRuleAutoHedgingAdmissionColumn(enabled) {
      if (pricingRulesFocusTimer) {
        window.clearTimeout(pricingRulesFocusTimer);
        pricingRulesFocusTimer = null;
      }

      pricingRulesTable?.classList.remove("is-auto-hedging-admission-focused");

      if (!enabled || !pricingRulesTable || !pricingRuleAutoHedgingAdmissionHeader) {
        return;
      }

      // Restart the brief emphasis when this route is entered again.
      void pricingRulesTable.offsetWidth;
      pricingRulesTable.classList.add("is-auto-hedging-admission-focused");
      pricingRuleAutoHedgingAdmissionHeader.scrollIntoView({
        behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
        block: "nearest",
        inline: "center"
      });
      pricingRuleAutoHedgingAdmissionHeader.focus({ preventScroll: true });
      pricingRulesFocusTimer = window.setTimeout(() => {
        pricingRulesTable.classList.remove("is-auto-hedging-admission-focused");
        pricingRulesFocusTimer = null;
      }, 2600);
    }

    function syncPricingRulesRouteView() {
      const routeState = pricingRulesRouteStateFromLocation();
      const previousScope = pricingRulesRouteScope;
      const relatedView = routeState.mode === "related" && routeState.pairCode;
      const focusedAdmissionView = routeState.mode === "focused"
        && routeState.focus === "auto-hedging-admission";
      const pairChanged = previousScope?.pairCode !== routeState.pairCode;

      pricingRuleEditState = null;
      pricingRuleHeaderFilterControls.forEach(control => {
        control.readOnly = false;
        control.removeAttribute("aria-readonly");

        if (relatedView && pairChanged) {
          control.value = "";
        } else if (
          !relatedView
          && previousScope
          && control.dataset.pricingRuleHeaderFilter === "currencyPair"
          && control.value.trim().toUpperCase() === previousScope.currencyPair
        ) {
          control.value = "";
        }
      });

      pricingRulesRouteScope = relatedView
        ? {
            pairCode: routeState.pairCode,
            currencyPair: routeState.currencyPair,
            returnHash: routeState.returnHash
          }
        : null;
      pricingRulesPage.classList.toggle("is-related-view", Boolean(pricingRulesRouteScope));
      pricingRulesBreadcrumb.hidden = !pricingRulesRouteScope && !focusedAdmissionView;

      if (pricingRulesRouteScope) {
        const currencyPairFilter = pricingRuleHeaderFilterControl("currencyPair");

        if (currencyPairFilter) {
          currencyPairFilter.value = pricingRulesRouteScope.currencyPair;
          currencyPairFilter.readOnly = true;
          currencyPairFilter.setAttribute("aria-readonly", "true");
        }

        pricingRulesBreadcrumbBackLink.href = pricingRulesRouteScope.returnHash;
        pricingRulesBreadcrumbBackLink.textContent = "Currency Pair Settings";
        pricingRulesBreadcrumbCurrent.textContent = `Pricing Rules for ${pricingRulesRouteScope.currencyPair}`;
      } else if (focusedAdmissionView) {
        pricingRulesBreadcrumbBackLink.href = routeState.returnHash;
        pricingRulesBreadcrumbBackLink.textContent = "Initial Auto Hedging Admission Policy";
        pricingRulesBreadcrumbCurrent.textContent = "Pricing Rules — Auto Hedging Admission";
      }

      setPricingRuleStatus("");
      window.requestAnimationFrame(() => {
        highlightPricingRuleAutoHedgingAdmissionColumn(focusedAdmissionView);
      });
    }

    function pricingRuleMatchesColumnFilters(rule) {
      return pricingRuleHeaderFilterControls.every(control => {
        const query = control.value.trim().toLowerCase();

        if (!query) {
          return true;
        }

        const field = control.dataset.pricingRuleHeaderFilter;
          const value = field === "clientName"
          ? clientNameForInn(rule.inn)
          : field === "pricingContextId"
            ? pricingRuleExecutionContextSearchText(rule)
            : field === "autoHedgingAdmissionModeOverride"
              ? `${pricingRuleAutoHedgingAdmissionSourceLabel(
                  rule.autoHedgingAdmissionModeOverride
                )} ${autoHedgingAdmissionModeLabel(
                  effectiveAutoHedgingAdmissionModeForRule(rule)
                )}`
            : rule[field] || "";

        return String(value).toLowerCase().includes(query);
      });
    }

    function filteredPricingRules() {
      return clientPricingRules
        .map((rule, index) => ({ rule, index }))
        .filter(({ rule }) => rule.counterpartyScope === activePricingRulesScope)
        .filter(({ rule }) => pricingRuleMatchesRouteScope(rule))
        .filter(({ rule }) => !pricingRulesClientInnFilter || rule.inn === pricingRulesClientInnFilter)
        .filter(({ rule }) => pricingRuleMatchesColumnFilters(rule))
        .sort((left, right) => {
          const keyOrder = String(left.rule.pricingRuleId).localeCompare(
            String(right.rule.pricingRuleId),
            "en",
            { numeric: true, sensitivity: "base" }
          );

          return pricingRuleIdSortDirection === "desc" ? -keyOrder : keyOrder;
        });
    }

    function renderPricingRuleEditRow(rule, index) {
      const preview = pricingRulePreview(rule.inn, rule.currencyPair, rule.pricingContextId, rule.pricingRuleId);
      const indexAttribute = index === null ? "" : ` data-pricing-rule-index="${index}"`;
      const pricingRuleIdAttribute = rule.pricingRuleId
        ? ` data-pricing-rule-id="${escapeHtml(rule.pricingRuleId)}"`
        : "";
      const contextState = pricingRuleCounterpartyExecutionContextState(rule.inn);
      const availableContextIds = availablePricingRuleExecutionContextIds(rule.inn);
      const contextDisabled = contextState.status !== "loaded" || availableContextIds.length === 0
        ? " disabled"
        : "";
      const contextHelpId = `pricing-rule-context-help-${rule.pricingRuleId || "new"}`;
      const contextHelp = pricingRuleContextHelp(contextState);
      const autoHedgingAdmissionModeOverride =
        normalizedPricingRuleAutoHedgingAdmissionModeOverride(
          rule.autoHedgingAdmissionModeOverride
        );

      return `
        <tr class="is-selected is-editing"${indexAttribute}${pricingRuleIdAttribute} data-pricing-rule-edit-row data-pricing-rule-context-status="${escapeHtml(contextState.status)}">
          <td class="pricing-rule-id-preview" data-pricing-rule-preview>${escapeHtml(preview)}</td>
          <td>
            <select class="inline-edit-control" data-pricing-rule-field="inn" required>
              ${pricingRuleClientOptions(rule.inn)}
            </select>
          </td>
          <td data-pricing-rule-client-name>${escapeHtml(clientNameForInn(rule.inn))}</td>
          <td>
            <span class="pricing-rule-context-control">
              <select class="inline-edit-control" data-pricing-rule-field="pricingContextId" data-pricing-rule-context-preferred="${escapeHtml(rule.pricingContextId)}" aria-describedby="${escapeHtml(contextHelpId)}" required${contextDisabled}>
                ${pricingRuleContextOptions(rule.pricingContextId, rule.inn)}
              </select>
              <span class="pricing-rule-context-help" id="${escapeHtml(contextHelpId)}" data-pricing-rule-context-help role="status"${contextHelp ? "" : " hidden"}>${escapeHtml(contextHelp)}</span>
            </span>
          </td>
          <td>
            <input class="inline-edit-control" type="text" data-pricing-rule-field="currencyPair" value="${escapeHtml(rule.currencyPair)}" maxlength="7" required>
          </td>
          <td data-pricing-rule-column="autoHedgingAdmissionModeOverride">
            <select class="inline-edit-control" data-pricing-rule-field="autoHedgingAdmissionModeOverride" aria-label="Auto Hedging Admission">
              ${pricingRuleAutoHedgingAdmissionOptions(autoHedgingAdmissionModeOverride)}
            </select>
          </td>
          <td>
            <input class="inline-edit-control" type="text" data-pricing-rule-field="marginPercent" value="${escapeHtml(editNumber(rule.marginPercent, 4))}" inputmode="decimal" required>
          </td>
          <td class="pricing-rule-quick-hedge-column"${activePricingRulesScope === "INTERNAL" ? "" : " hidden"}>—</td>
          <td class="profile-actions-cell">
            <span class="profile-row-actions">
              <button type="button" class="icon-action" data-pricing-rule-action="save" aria-label="Save pricing rule" title="Save">
                <span class="button-icon" aria-hidden="true">save</span>
              </button>
              <button type="button" class="icon-action" data-pricing-rule-action="cancel" aria-label="Cancel editing" title="Cancel">
                <span class="button-icon" aria-hidden="true">close</span>
              </button>
            </span>
          </td>
        </tr>
      `;
    }

    function renderPricingRuleViewRow(rule, index) {
      const quickHedgeSettingsCount = Math.max(0, Number(rule.quickHedgeSettingsCount) || 0);
      const quickHedgeMarkup = quickHedgeSettingsCount > 0
        ? `
            <span class="pricing-rule-quick-hedge-marker">
              <span class="button-icon" aria-hidden="true">bolt</span>
              <span>Used</span>
            </span>
        `
        : '<span class="pricing-rule-quick-hedge-empty">—</span>';
      const profile = clientProfiles.find(item =>
        String(item.counterpartyId ?? "") === String(rule.counterpartyId ?? "")
      ) || clientProfileByInn(rule.inn);
      const editRoute = profile
        ? pricingRuleClientProfileRoute(
            profile.counterpartyId,
            rule.pricingRuleId,
            location.hash
          )
        : "";
      const editActionMarkup = editRoute
        ? `
            <a class="btn btn-sm btn-outline-secondary reference-grid-action" href="${escapeHtml(editRoute)}" data-pricing-rule-action="edit-counterparty" aria-label="Edit Pricing Rule ${escapeHtml(rule.pricingRuleId)} in Trading Counterparty card" data-tooltip="Edit Pricing Rule">
              <span class="button-icon" aria-hidden="true">edit</span>
            </a>
          `
        : `
            <button type="button" class="btn btn-sm btn-outline-secondary reference-grid-action" aria-label="Trading Counterparty unavailable for Pricing Rule ${escapeHtml(rule.pricingRuleId)}" data-tooltip="Trading Counterparty unavailable" disabled>
              <span class="button-icon" aria-hidden="true">edit</span>
            </button>
          `;

      return `
        <tr data-pricing-rule-index="${index}">
          <td>${escapeHtml(rule.pricingRuleId)}</td>
          <td>${escapeHtml(rule.inn)}</td>
          <td>${escapeHtml(clientNameForInn(rule.inn))}</td>
          <td>
            <span class="client-pricing-context-candidate-path pricing-rules-context-path">
              ${pricingContextFacetsMarkup(rule.pricingContextId, { executionSystemLabel: true })}
            </span>
          </td>
          <td>${escapeHtml(rule.currencyPair)}</td>
          <td data-pricing-rule-column="autoHedgingAdmissionModeOverride">${pricingRuleAutoHedgingAdmissionMarkup(rule)}</td>
          <td>${escapeHtml(editNumber(rule.marginPercent, 2))}%</td>
          <td class="pricing-rule-quick-hedge-column"${activePricingRulesScope === "INTERNAL" ? "" : " hidden"}>${quickHedgeMarkup}</td>
          <td class="profile-actions-cell">
            <span class="profile-row-actions">${editActionMarkup}</span>
          </td>
        </tr>
      `;
    }

    function normalizedUiTableLayout(source) {
      const tableKey = String(source?.tableKey || "").trim().toLowerCase();
      const tableLabel = String(source?.tableLabel || tableKey).trim();
      const rows = Array.isArray(source?.columns) ? source.columns : [];
      const validWidth = (value, fallback = 120) => {
        const width = Number(value);

        return Number.isInteger(width)
          && width >= UI_TABLE_COLUMN_WIDTH_MIN_PX
          && width <= UI_TABLE_COLUMN_WIDTH_MAX_PX
          ? width
          : fallback;
      };

      if (!tableKey || !tableLabel || rows.length === 0) {
        return null;
      }

      const columns = rows
        .map((row, sourceIndex) => {
          const sourceColumnKey = String(row?.columnKey || "").trim().toLowerCase();
          const columnKey = UI_TABLE_LAYOUT_COLUMN_ALIASES[tableKey]?.[sourceColumnKey]
            || sourceColumnKey;
          const columnLabel = sourceColumnKey === "status" && columnKey === "active"
            ? "Active"
            : String(row?.columnLabel || columnKey).trim();
          const defaultWidthPx = validWidth(row?.defaultWidthPx);

          return columnKey && columnLabel
            ? {
                tableKey,
                columnKey,
                columnLabel,
                displayOrder: Number.isInteger(Number(row?.displayOrder))
                  ? Number(row.displayOrder)
                  : sourceIndex,
                defaultWidthPx,
                widthPx: validWidth(row?.widthPx, defaultWidthPx),
                updatedAt: String(row?.updatedAt || "")
              }
            : null;
        })
        .filter(Boolean)
        .sort((left, right) => left.displayOrder - right.displayOrder);

      return columns.length > 0 ? { tableKey, tableLabel, columns } : null;
    }

    function uiTableLayout(tableKey) {
      return uiTableLayoutsByKey.get(String(tableKey || "")) || null;
    }

    function uiTableFieldName(columnKey) {
      return String(columnKey || "").replace(/_([a-z])/g, (_match, letter) => letter.toUpperCase());
    }

    function uiTableColumnKey(fieldName) {
      return String(fieldName || "")
        .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
        .toLowerCase();
    }

    function uiTableColumns(tableKey, columns) {
      const tableLayout = uiTableLayout(tableKey);
      const settingsByKey = new Map(
        (tableLayout?.columns || []).map(setting => [setting.columnKey, setting])
      );

      return columns.map(column => {
        const alignedColumn = Array.isArray(column.columns)
          ? { ...column, columns: uiTableColumns(tableKey, column.columns) }
          : column.headerHozAlign || !column.hozAlign
            ? column
            : { ...column, headerHozAlign: column.hozAlign };
        const setting = settingsByKey.get(uiTableColumnKey(column.field));

        return setting
          ? {
              ...alignedColumn,
              width: setting.widthPx,
              minWidth: UI_TABLE_COLUMN_WIDTH_MIN_PX,
              maxWidth: UI_TABLE_COLUMN_WIDTH_MAX_PX
            }
          : alignedColumn;
      });
    }

    function nativeUiTable(tableKey) {
      return Array.from(document.querySelectorAll("table[data-ui-table-layout-key]"))
        .find(table => table.dataset.uiTableLayoutKey === tableKey) || null;
    }

    function auxiliaryUiTableLayoutColumnKeys(tableKey) {
      return Array.from(document.querySelectorAll("[data-ui-table-layout-column-key]"))
        .filter(element => element.dataset.uiTableLayoutKey === tableKey)
        .map(element => element.dataset.uiTableLayoutColumnKey);
    }

    function applyNativeUiTableLayout(tableKey, tableLayout) {
      const table = nativeUiTable(tableKey);

      if (!table) {
        return;
      }

      resetSmartTableSizing(table);
      table.dataset.columnSizing = "managed";
      const settingsByKey = new Map(
        tableLayout.columns.map(setting => [setting.columnKey, setting])
      );
      const headerCells = Array.from(table.querySelectorAll("thead tr:first-child > th"));
      let totalWidth = 0;

      table.querySelectorAll("col[data-ui-column-key]").forEach((column, index) => {
        const headerCell = headerCells[index];
        const hidden = column.hidden || headerCell?.hidden;

        if (hidden) {
          column.style.removeProperty("width");
          return;
        }

        const setting = settingsByKey.get(column.dataset.uiColumnKey);
        column.style.removeProperty("width");
        const requestedFallbackWidth = Number(column.dataset.uiFallbackWidth);
        const fallbackWidth = Number.isInteger(requestedFallbackWidth)
          && requestedFallbackWidth >= UI_TABLE_COLUMN_WIDTH_MIN_PX
          && requestedFallbackWidth <= UI_TABLE_COLUMN_WIDTH_MAX_PX
          ? requestedFallbackWidth
          : Math.min(
              240,
              Math.max(
                120,
                Math.ceil(headerCell?.scrollWidth || 0) + 24
              )
            );
        const width = setting?.widthPx || fallbackWidth;

        column.style.setProperty("width", `${width}px`, "important");
        totalWidth += width;
      });

      if (totalWidth > 0) {
        table.style.setProperty("width", `${totalWidth}px`, "important");
        table.style.setProperty("min-width", `${totalWidth}px`, "important");
        table.style.setProperty("max-width", `${totalWidth}px`, "important");
        table.style.setProperty("table-layout", "fixed", "important");
      }

      window.requestAnimationFrame(() => syncNativeTableOverflowTooltips(table));
    }

    function applyFxPositionGridLayout(tableLayout) {
      if (!tableLayout) {
        return;
      }

      const settingsByKey = new Map(
        tableLayout.columns.map(setting => [setting.columnKey, setting])
      );
      const ccyPairSelectorWidth = Number(
        settingsByKey.get("ccy_pair_selector")?.widthPx
      );

      if (Number.isInteger(ccyPairSelectorWidth)
        && ccyPairSelectorWidth >= UI_TABLE_COLUMN_WIDTH_MIN_PX
        && ccyPairSelectorWidth <= UI_TABLE_COLUMN_WIDTH_MAX_PX) {
        mainPage.style.setProperty(
          "--fx-position-ccy-pair-selector-width",
          `${ccyPairSelectorWidth}px`
        );
      }

      const table = nativeUiTable("fx_position_grid");

      if (!table) {
        return;
      }

      let totalWidth = 0;

      table.querySelectorAll("col").forEach(column => {
        const setting = settingsByKey.get(column.dataset.uiColumnKey);
        const fixedWidth = Number(column.dataset.fxPositionFixedWidth);
        const width = setting?.widthPx || fixedWidth;

        if (!Number.isFinite(width) || width <= 0) {
          return;
        }

        column.style.setProperty("width", `${width}px`, "important");
        totalWidth += width;
      });

      if (totalWidth <= 0) {
        return;
      }

      table.dataset.columnSizing = "managed";
      table.style.setProperty("width", `${totalWidth}px`, "important");
      table.style.setProperty("min-width", `${totalWidth}px`, "important");
      table.style.setProperty("max-width", `${totalWidth}px`, "important");
      table.style.setProperty("table-layout", "fixed", "important");
      scheduleFxPositionGridFillHeight();
      scheduleHedgeQuickModeQuoteAlignment();
      window.requestAnimationFrame(() => syncNativeTableOverflowTooltips(table));
    }

    function applyTabulatorUiTableLayout(tableKey, tableLayout) {
      const table = uiTableTabulatorInstances.get(tableKey);

      if (!table) {
        return;
      }

      tableLayout.columns.forEach(setting => {
        const column = table.getColumn(uiTableFieldName(setting.columnKey));

        if (!column) {
          return;
        }

        const definition = column.getDefinition();
        definition.width = setting.widthPx;
        definition.minWidth = UI_TABLE_COLUMN_WIDTH_MIN_PX;
        definition.maxWidth = UI_TABLE_COLUMN_WIDTH_MAX_PX;
        column.setWidth(setting.widthPx);
      });
    }

    function applyClientExecutionContextAttachColumnLayout(tableLayout = uiTableLayout("execution_contexts_grid")) {
      const table = document.querySelector(".client-context-attach-table");

      if (!table || !tableLayout) {
        return;
      }

      const settingsByKey = new Map(
        tableLayout.columns.map(setting => [setting.columnKey, setting])
      );
      let totalWidth = 0;

      table.querySelectorAll("col").forEach(column => {
        const layoutColumnKey = column.dataset.clientContextAttachLayoutColumn;
        const fixedWidth = Number(column.dataset.clientContextAttachFixedWidth);
        const configuredWidth = layoutColumnKey
          ? Number(settingsByKey.get(layoutColumnKey)?.widthPx)
          : fixedWidth;
        const width = Number.isInteger(configuredWidth)
          && configuredWidth >= UI_TABLE_COLUMN_WIDTH_MIN_PX
          && configuredWidth <= UI_TABLE_COLUMN_WIDTH_MAX_PX
          ? configuredWidth
          : Number.parseFloat(getComputedStyle(column).width);

        if (!Number.isFinite(width) || width <= 0) {
          return;
        }

        column.style.setProperty("width", `${width}px`, "important");
        totalWidth += width;
      });

      if (totalWidth <= 0) {
        return;
      }

      table.style.setProperty("width", `${totalWidth}px`, "important");
      table.style.setProperty("min-width", `${totalWidth}px`, "important");
      table.style.setProperty("max-width", `${totalWidth}px`, "important");
      table.style.setProperty("table-layout", "fixed", "important");
      clientExecutionContextAttachDialog.style.setProperty(
        "--client-context-attach-table-width",
        `${totalWidth}px`
      );
      window.requestAnimationFrame(() => syncNativeTableOverflowTooltips(table));
    }

    function applyUiTableLayout(tableKey) {
      const tableLayout = uiTableLayout(tableKey);

      if (!tableLayout) {
        return;
      }

      if (tableKey === "fx_position_grid") {
        applyFxPositionGridLayout(tableLayout);
        return;
      }

      applyNativeUiTableLayout(tableKey, tableLayout);
      applyTabulatorUiTableLayout(tableKey, tableLayout);

      if (tableKey === "execution_contexts_grid") {
        applyClientExecutionContextAttachColumnLayout(tableLayout);
      }
    }

    function applyAllUiTableLayouts() {
      uiTableLayoutsByKey.forEach((_tableLayout, tableKey) => {
        applyUiTableLayout(tableKey);
      });
    }

    function registerUiTableTabulator(tableKey, table) {
      if (!uiTableLayout(tableKey) || !table) {
        return;
      }

      uiTableTabulatorInstances.set(tableKey, table);
      applyUiTableLayout(tableKey);
      table.on?.("tableBuilt", () => applyUiTableLayout(tableKey));
    }

    function uiTableLayoutButton(tableKey) {
      const tableLayout = uiTableLayout(tableKey);

      if (!tableLayout) {
        return null;
      }

      const button = document.createElement("button");
      button.type = "button";
      button.className = "btn btn-sm btn-outline-secondary ui-table-layout-button";
      button.dataset.uiTableLayout = tableKey;
      button.setAttribute("aria-label", `${tableLayout.tableLabel} table layout`);
      button.innerHTML = '<span class="button-icon" aria-hidden="true">view_column</span>';
      return button;
    }

    function installUiTableLayoutButtons() {
      document.querySelectorAll("[data-ui-table-layout-host]").forEach(host => {
        const tableKey = host.dataset.uiTableLayoutHost;

        if (!uiTableLayout(tableKey) || host.querySelector("[data-ui-table-layout]")) {
          return;
        }

        const button = uiTableLayoutButton(tableKey);
        const primaryAction = Array.from(host.children).find(element =>
          element.matches?.("button.btn-primary, button.btn-outline-primary, button.reference-new-button, button.action-button.primary")
        );

        if (primaryAction) {
          const actionGroup = document.createElement("div");
          actionGroup.className = "ui-table-layout-actions";
          host.insertBefore(actionGroup, primaryAction);
          actionGroup.append(primaryAction, button);
        } else {
          host.append(button);
        }
      });

      document.querySelectorAll("[data-ui-table-layout]").forEach(button => {
        button.disabled = !DEMO_API_ENABLED || !uiTableLayout(button.dataset.uiTableLayout);
      });
      initializeTooltips(document);
    }

    function setUiTableLayoutStatus(message = "", tone = "danger") {
      pricingRulesTableLayoutStatus.textContent = message;
      pricingRulesTableLayoutStatus.hidden = !message;
      pricingRulesTableLayoutStatus.classList.toggle("alert-danger", tone === "danger");
      pricingRulesTableLayoutStatus.classList.toggle("alert-success", tone === "success");
      pricingRulesTableLayoutStatus.classList.toggle("alert-warning", tone === "warning");
    }

    function renderUiTableLayoutEditor() {
      const tableLayout = uiTableLayout(activeUiTableLayoutKey);

      if (!tableLayout) {
        pricingRulesTableLayoutList.innerHTML = "";
        return;
      }

      const nativeTable = nativeUiTable(tableLayout.tableKey);
      const visibleColumnKeys = activeUiTableLayoutColumnKeys || (nativeTable
        ? new Set(
            [
              ...Array.from(nativeTable.querySelectorAll("col[data-ui-column-key]"))
                .filter(column => !column.hidden)
                .map(column => column.dataset.uiColumnKey),
              ...auxiliaryUiTableLayoutColumnKeys(tableLayout.tableKey)
            ]
          )
        : null);
      const editableColumns = visibleColumnKeys
        ? tableLayout.columns.filter(setting => visibleColumnKeys.has(setting.columnKey))
        : tableLayout.columns;

      pricingRulesTableLayoutList.innerHTML = `
        <div class="ui-table-layout-row is-header" aria-hidden="true">
          <span class="ui-table-layout-cell">Column</span>
          <span class="ui-table-layout-cell">Width</span>
          <span class="ui-table-layout-cell">Default</span>
        </div>
        ${editableColumns.map(setting => `
          <label class="ui-table-layout-row">
            <span class="ui-table-layout-cell ui-table-layout-label">${escapeHtml(setting.columnLabel)}</span>
            <span class="ui-table-layout-cell">
              <span class="input-group input-group-sm ui-table-layout-width-control">
                <input
                  class="form-control"
                  type="number"
                  min="${UI_TABLE_COLUMN_WIDTH_MIN_PX}"
                  max="${UI_TABLE_COLUMN_WIDTH_MAX_PX}"
                  step="1"
                  value="${setting.widthPx}"
                  data-ui-table-column-width="${escapeHtml(setting.columnKey)}"
                  aria-label="${escapeHtml(setting.columnLabel)} width in pixels"
                  required
                >
                <span class="input-group-text">px</span>
              </span>
            </span>
            <span class="ui-table-layout-cell ui-table-layout-default">${setting.defaultWidthPx} px</span>
          </label>
        `).join("")}
      `;
    }

    function uiTableLayoutPayload() {
      const tableLayout = uiTableLayout(activeUiTableLayoutKey);
      const controls = Array.from(
        pricingRulesTableLayoutList.querySelectorAll("[data-ui-table-column-width]")
      );
      const editedWidthsByKey = new Map();

      for (const control of controls) {
        const widthPx = Number(control.value);
        const valid = Number.isInteger(widthPx)
          && widthPx >= UI_TABLE_COLUMN_WIDTH_MIN_PX
          && widthPx <= UI_TABLE_COLUMN_WIDTH_MAX_PX;
        control.setCustomValidity(valid
          ? ""
          : `Width must be an integer from ${UI_TABLE_COLUMN_WIDTH_MIN_PX} to ${UI_TABLE_COLUMN_WIDTH_MAX_PX} pixels.`);

        if (!valid) {
          control.reportValidity();
          return null;
        }

        editedWidthsByKey.set(control.dataset.uiTableColumnWidth, widthPx);
      }

      return {
        columns: (tableLayout?.columns || []).map(setting => ({
          columnKey: setting.columnKey,
          widthPx: editedWidthsByKey.get(setting.columnKey) ?? setting.widthPx
        }))
      };
    }

    function setUiTableLayoutBusy(busy) {
      pricingRulesTableLayoutSaveButton.disabled = busy;
      pricingRulesTableLayoutResetButton.disabled = busy;
      pricingRulesTableLayoutSaveDefaultButton.disabled = busy;
      pricingRulesTableLayoutCancelButton.disabled = busy;
      pricingRulesTableLayoutDialogClose.disabled = busy;
    }

    function openUiTableLayoutDialog(tableKey, options = {}) {
      const tableLayout = uiTableLayout(tableKey);

      if (!tableLayout) {
        return;
      }

      activeUiTableLayoutKey = tableKey;
      activeUiTableLayoutColumnKeys = Array.isArray(options.columnKeys)
        && options.columnKeys.length > 0
        ? new Set(options.columnKeys)
        : null;
      activeUiTableLayoutTitle = String(options.title || "").trim();
      pricingRulesTableLayoutDialogTitle.textContent = activeUiTableLayoutTitle
        || `${tableLayout.tableLabel} Table Layout`;
      pricingRulesTableLayoutSaveDefaultButton.hidden = activeUiTableLayoutColumnKeys !== null;
      renderUiTableLayoutEditor();
      setUiTableLayoutStatus();
      openDialogWithoutFieldFocus(pricingRulesTableLayoutDialog);
    }

    function closeUiTableLayoutDialog() {
      if (pricingRulesTableLayoutDialog.open) {
        pricingRulesTableLayoutDialog.close();
      }
    }

    async function saveUiTableLayout(event) {
      event.preventDefault();
      const tableLayout = uiTableLayout(activeUiTableLayoutKey);
      const payload = uiTableLayoutPayload();

      if (!tableLayout || !payload) {
        return;
      }

      setUiTableLayoutBusy(true);
      setUiTableLayoutStatus();

      try {
        const saved = await demoApiRequest(
          `/api/v1/ui-table-column-settings/${encodeURIComponent(activeUiTableLayoutKey)}`,
          { method: "PUT", body: JSON.stringify(payload) }
        );
        const normalized = normalizedUiTableLayout({
          tableKey: activeUiTableLayoutKey,
          tableLabel: tableLayout.tableLabel,
          columns: saved
        });
        uiTableLayoutsByKey.set(activeUiTableLayoutKey, normalized);
        applyUiTableLayout(activeUiTableLayoutKey);
        closeUiTableLayoutDialog();
      } catch (error) {
        setUiTableLayoutStatus(error.message || "Unable to save the table layout.");
      } finally {
        setUiTableLayoutBusy(false);
      }
    }

    async function resetUiTableLayout() {
      const tableLayout = uiTableLayout(activeUiTableLayoutKey);

      if (!tableLayout) {
        return;
      }

      setUiTableLayoutBusy(true);
      setUiTableLayoutStatus();

      try {
        const saved = activeUiTableLayoutColumnKeys
          ? await demoApiRequest(
              `/api/v1/ui-table-column-settings/${encodeURIComponent(activeUiTableLayoutKey)}`,
              {
                method: "PUT",
                body: JSON.stringify({
                  columns: tableLayout.columns.map(setting => ({
                    columnKey: setting.columnKey,
                    widthPx: activeUiTableLayoutColumnKeys.has(setting.columnKey)
                      ? setting.defaultWidthPx
                      : setting.widthPx
                  }))
                })
              }
            )
          : await demoApiRequest(
              `/api/v1/ui-table-column-settings/${encodeURIComponent(activeUiTableLayoutKey)}/reset`,
              { method: "POST" }
            );
        const normalized = normalizedUiTableLayout({
          tableKey: activeUiTableLayoutKey,
          tableLabel: tableLayout.tableLabel,
          columns: saved
        });
        uiTableLayoutsByKey.set(activeUiTableLayoutKey, normalized);
        applyUiTableLayout(activeUiTableLayoutKey);
        renderUiTableLayoutEditor();
        setUiTableLayoutStatus(
          "Default column widths were restored successfully.",
          "success"
        );
      } catch (error) {
        setUiTableLayoutStatus(error.message || "Unable to restore the default layout.");
      } finally {
        setUiTableLayoutBusy(false);
      }
    }

    async function saveUiTableLayoutAsDefault(event) {
      if (!event.ctrlKey) {
        setUiTableLayoutStatus(
          "Hold Ctrl and click Save as default to confirm this change.",
          "warning"
        );
        return;
      }

      const tableLayout = uiTableLayout(activeUiTableLayoutKey);
      const payload = uiTableLayoutPayload();

      if (!tableLayout || !payload) {
        return;
      }

      setUiTableLayoutBusy(true);
      setUiTableLayoutStatus();

      try {
        const saved = await demoApiRequest(
          `/api/v1/ui-table-column-settings/${encodeURIComponent(activeUiTableLayoutKey)}/defaults`,
          {
            method: "PUT",
            body: JSON.stringify({
              ...payload,
              confirmation: "SAVE_AS_DEFAULT"
            })
          }
        );
        const normalized = normalizedUiTableLayout({
          tableKey: activeUiTableLayoutKey,
          tableLabel: tableLayout.tableLabel,
          columns: saved
        });
        uiTableLayoutsByKey.set(activeUiTableLayoutKey, normalized);
        applyUiTableLayout(activeUiTableLayoutKey);
        renderUiTableLayoutEditor();
        setUiTableLayoutStatus(
          "Current column widths were saved as defaults successfully.",
          "success"
        );
      } catch (error) {
        setUiTableLayoutStatus(
          error.message || "Unable to save the default table layout."
        );
      } finally {
        setUiTableLayoutBusy(false);
      }
    }

    function activePricingRulesLayoutKey() {
      return activePricingRulesScope === "INTERNAL"
        ? "internal_pricing_rules_grid"
        : "pricing_rules_grid";
    }

    function syncPricingRulesScopePresentation() {
      const internalScope = activePricingRulesScope === "INTERNAL";
      const layoutKey = activePricingRulesLayoutKey();
      const routeState = pricingRulesRouteStateFromLocation();
      const focusedAdmissionView = routeState.mode === "focused"
        && routeState.focus === "auto-hedging-admission";

      pricingRulesScopeButtons.forEach(button => {
        const selected = button.dataset.pricingRulesScope === activePricingRulesScope;
        button.classList.toggle("active", selected);
        button.setAttribute("aria-selected", String(selected));
        button.href = pricingRulesRouteScope
          ? pricingRulesForCcyPairRoute(
              pricingRulesRouteScope.pairCode,
              pricingRulesRouteScope.returnHash,
              button.dataset.pricingRulesScope
            )
          : focusedAdmissionView
            ? autoHedgingAdmissionPricingRulesRoute(
                routeState.returnHash,
                button.dataset.pricingRulesScope
              )
          : pricingRulesRoute(button.dataset.pricingRulesScope);
      });
      pricingRuleCounterpartyCodeTitle.textContent = internalScope ? "Unit Code" : "Counterparty Code";
      pricingRuleCounterpartyCodeFilter.setAttribute(
        "aria-label",
        internalScope
          ? "Filter internal unit pricing rules by unit code"
          : "Filter external counterparty pricing rules by counterparty code"
      );
      pricingRuleQuickHedgeHeader.hidden = !internalScope;
      pricingRulesTable.querySelector("col.pricing-rule-quick-hedge-column").hidden = !internalScope;
      pricingRulesTable.classList.toggle("is-internal-scope", internalScope);
      pricingRulesTable.dataset.uiTableLayoutKey = layoutKey;
      pricingRulesTable.setAttribute(
        "aria-label",
        internalScope ? "Internal Unit Pricing Rules" : "External Counterparty Pricing Rules"
      );
      pricingRulesTableLayoutButton.dataset.uiTableLayout = layoutKey;
      pricingRulesTableLayoutButton.setAttribute(
        "aria-label",
        internalScope
          ? "Internal Unit Pricing Rules table layout"
          : "External Counterparty Pricing Rules table layout"
      );
      pricingRulesTableLayoutButton.disabled = !DEMO_API_ENABLED || !uiTableLayout(layoutKey);
    }

    function renderPricingRules() {
      if (!pricingRuleRowsEl) {
        return;
      }

      syncPricingRulesScopePresentation();
      updatePricingRuleIdSortControl();

      const rows = filteredPricingRules();
      const scopeRules = clientPricingRules.filter(rule =>
        rule.counterpartyScope === activePricingRulesScope
        && pricingRuleMatchesRouteScope(rule)
      );
      const columnCount = activePricingRulesScope === "INTERNAL" ? 9 : 8;
      const layoutKey = activePricingRulesLayoutKey();

      if (scopeRules.length === 0) {
        const emptyMessage = pricingRulesRouteScope
          ? `No Pricing Rules for ${pricingRulesRouteScope.currencyPair} in this counterparty scope.`
          : "No pricing rules for this counterparty scope yet.";
        pricingRuleRowsEl.innerHTML = `
          <tr>
            <td class="profile-empty" colspan="${columnCount}">${emptyMessage}</td>
          </tr>
        `;
        applyUiTableLayout(layoutKey);
        return;
      }

      if (rows.length === 0) {
        pricingRuleRowsEl.innerHTML = `
          <tr>
            <td class="profile-empty" colspan="${columnCount}">No pricing rules match the current filter.</td>
          </tr>
        `;
        applyUiTableLayout(layoutKey);
        return;
      }

      pricingRuleRowsEl.innerHTML = rows
        .map(({ rule, index }) => renderPricingRuleViewRow(rule, index))
        .join("");
      applyUiTableLayout(layoutKey);
    }

    function updatePricingRuleIdSortControl() {
      updateReferenceDataIdSortControl(
        pricingRuleIdHeader,
        pricingRuleIdSortButton,
        pricingRuleIdSortDirection,
        "pricing rules"
      );
    }

    function startPricingRuleCreate(inn = pricingRulesClientInnFilter) {
      pricingRuleEditState = { mode: "create", inn };
      setPricingRuleStatus("");
      renderPricingRules();
      const row = pricingRuleRowsEl.querySelector("[data-pricing-rule-edit-row]");

      if (row) {
        syncPricingRuleRowPreview(row);
      }
    }

    function startPricingRuleEdit(index) {
      const rule = clientPricingRules[index];

      if (!rule) {
        return;
      }

      pricingRuleEditState = { mode: "edit", index };
      setPricingRuleStatus("");
      renderPricingRules();
      const row = pricingRuleRowsEl.querySelector("[data-pricing-rule-edit-row]");

      if (row) {
        syncPricingRuleRowPreview(row);
      }
    }

    function cancelPricingRuleForm() {
      pricingRuleEditState = null;
      setPricingRuleStatus("");
      renderPricingRules();
    }

    async function removePricingRule(index) {
      const rule = clientPricingRules[index];

      if (!rule) {
        return;
      }

      try {
        await deletePricingRuleRecord(rule);
        clientPricingRules.splice(index, 1);
        saveClientPricingRules();
      } catch (error) {
        setPricingRuleStatus(error.message || "Pricing Rule could not be deleted.", "error");
        return;
      }

      if (pricingRuleEditState?.mode === "edit") {
        if (pricingRuleEditState.index === index) {
          pricingRuleEditState = null;
        } else if (pricingRuleEditState.index > index) {
          pricingRuleEditState.index -= 1;
        }
      }

      setPricingRuleStatus(
        completedActionMessage(`Pricing Rule ${rule.pricingRuleId}`, "removed"),
        "success"
      );
      renderPricingRules();
      renderClientPricingRulesPanel(clientProfiles[editingClientProfileIndex]);
    }

    async function savePricingRuleFromRow(row) {
      if (!pricingRuleEditState) {
        return;
      }

      const rule = pricingRuleFromRow(row);

      if (!rule) {
        return;
      }

      const isCreating = pricingRuleEditState.mode === "create";
      const currentIndex = isCreating ? null : pricingRuleEditState.index;
      const currentRule = currentIndex === null ? null : clientPricingRules[currentIndex];

      try {
        const savedRule = await persistPricingRuleRecord(rule, currentRule);

        if (!savedRule) {
          throw new Error("Pricing Rule response is invalid.");
        }

        if (isCreating) {
          clientPricingRules.push(savedRule);
          setPricingRuleStatus(
            completedActionMessage(`Pricing Rule ${savedRule.pricingRuleId}`, "added"),
            "success"
          );
        } else {
          clientPricingRules[currentIndex] = savedRule;
          setPricingRuleStatus(
            completedActionMessage(`Pricing Rule ${savedRule.pricingRuleId}`, "saved"),
            "success"
          );
        }

        saveClientPricingRules();
        pricingRuleEditState = null;
      } catch (error) {
        setPricingRuleStatus(error.message || "Pricing Rule could not be saved.", "error");
        return;
      }

      renderPricingRules();
      renderClientPricingRulesPanel(clientProfiles[editingClientProfileIndex]);
    }

    function setClientDealGenerationSettingsStatus(message, tone = "") {
      clientDealGenerationSettingsStatus.textContent = message;
      clientDealGenerationSettingsStatus.classList.toggle("is-error", tone === "error");
      clientDealGenerationSettingsStatus.classList.toggle("is-success", tone === "success");
    }

    function clientDealGenerationProcessSettingsDraft() {
      const minIntervalSeconds = Number(
        clientDealGenerationProcessSettingsForm.elements.minIntervalSeconds.value
      );
      const maxIntervalSeconds = Number(
        clientDealGenerationProcessSettingsForm.elements.maxIntervalSeconds.value
      );
      const minDealsPerCycle = Number(
        clientDealGenerationProcessSettingsForm.elements.minDealsPerCycle.value
      );
      const maxDealsPerCycle = Number(
        clientDealGenerationProcessSettingsForm.elements.maxDealsPerCycle.value
      );

      if (
        !Number.isInteger(minIntervalSeconds)
        || !Number.isInteger(maxIntervalSeconds)
        || minIntervalSeconds < 1
        || maxIntervalSeconds < minIntervalSeconds
        || maxIntervalSeconds > 3600
      ) {
        throw new Error(
          "Generation Interval must be an ascending range of whole seconds from 1 to 3600."
        );
      }

      if (
        !Number.isInteger(minDealsPerCycle)
        || !Number.isInteger(maxDealsPerCycle)
        || minDealsPerCycle < 1
        || maxDealsPerCycle < minDealsPerCycle
        || maxDealsPerCycle > 100
      ) {
        throw new Error("Deals per Cycle must be an ascending integer range from 1 to 100.");
      }

      return {
        minIntervalSeconds,
        maxIntervalSeconds,
        minDealsPerCycle,
        maxDealsPerCycle
      };
    }

    function updateClientDealGenerationProcessSettingsSaveAvailability() {
      let draft;

      try {
        draft = clientDealGenerationProcessSettingsDraft();
      } catch {
        setSaveButtonAvailability(
          clientDealGenerationProcessSettingsSave,
          false,
          "Enter a valid Generation Cycle before saving"
        );
        return;
      }

      const changed = Object.entries(draft).some(
        ([field, value]) => value !== Number(clientDealGenerationProcessSettings[field])
      );
      setSaveButtonAvailability(clientDealGenerationProcessSettingsSave, changed);
    }

    function renderClientDealGenerationProcessSettings() {
      Object.entries(clientDealGenerationProcessSettings).forEach(([field, value]) => {
        if (clientDealGenerationProcessSettingsForm.elements[field]) {
          clientDealGenerationProcessSettingsForm.elements[field].value = value;
        }
      });
      updateClientDealGenerationProcessSettingsSaveAvailability();
    }

    async function saveClientDealGenerationProcessSettings(event) {
      event.preventDefault();
      let payload;

      try {
        payload = clientDealGenerationProcessSettingsDraft();
      } catch (error) {
        setClientDealGenerationSettingsStatus(error.message, "error");
        return;
      }

      clientDealGenerationProcessSettingsSave.disabled = true;
      setClientDealGenerationSettingsStatus("Saving Generation Cycle...");

      try {
        clientDealGenerationProcessSettings = await demoApiRequest(
          "/api/v1/client-deal-generation/process-settings",
          { method: "PUT", body: JSON.stringify(payload) }
        );
        clientDealGenerationProcessState = {
          ...clientDealGenerationProcessState,
          minIntervalMs: clientDealGenerationProcessSettings.minIntervalSeconds * 1000,
          maxIntervalMs: clientDealGenerationProcessSettings.maxIntervalSeconds * 1000,
          minDealsPerCycle: clientDealGenerationProcessSettings.minDealsPerCycle,
          maxDealsPerCycle: clientDealGenerationProcessSettings.maxDealsPerCycle
        };
        renderClientDealGenerationProcessSettings();
        setClientDealGenerationSettingsStatus(
          "Generation Cycle settings were saved successfully.",
          "success"
        );
      } catch (error) {
        updateClientDealGenerationProcessSettingsSaveAvailability();
        setClientDealGenerationSettingsStatus(
          error.message || "Unable to save Generation Cycle settings.",
          "error"
        );
      }
    }

    function renderClientDealGenerationSettings() {
      if (clientDealGenerationSettings.length === 0) {
        clientDealGenerationSettingsRows.innerHTML = `
          <tr>
            <td colspan="11" class="text-center text-secondary py-4">
              No Auto Priced Client Deal Generation Settings found.
            </td>
          </tr>
        `;
        scheduleSmartColumnSizing();
        return;
      }

      clientDealGenerationSettingsRows.innerHTML = clientDealGenerationSettings.map(settings => {
        const inactiveClient = settings.counterpartyActive === false
          ? '<span class="badge text-bg-secondary ms-1">Inactive</span>'
          : "";
        const inactiveExecutionSystem = settings.executionSystemActive === false
          ? '<span class="badge text-bg-secondary ms-1">Inactive System</span>'
          : "";
        const editing = Number(settings.pricingRuleId)
          === clientDealGenerationSettingsEditPricingRuleId;
        const valueCells = editing
          ? `
            <td>
              <input class="form-control form-control-sm" type="text" inputmode="decimal" autocomplete="off" value="${escapeHtml(formatGroupedNumberInput(settings.minBaseCcyAmount))}" data-generation-settings-amount data-generation-settings-field="minBaseCcyAmount" aria-label="Min Base Ccy Amount for Pricing Rule ${settings.pricingRuleId}">
            </td>
            <td>
              <input class="form-control form-control-sm" type="text" inputmode="decimal" autocomplete="off" value="${escapeHtml(formatGroupedNumberInput(settings.maxBaseCcyAmount))}" data-generation-settings-amount data-generation-settings-field="maxBaseCcyAmount" aria-label="Max Base Ccy Amount for Pricing Rule ${settings.pricingRuleId}">
            </td>
            <td>
              <input class="form-control form-control-sm" type="text" inputmode="decimal" autocomplete="off" value="${escapeHtml(formatGroupedNumberInput(settings.baseCcyAmountStep))}" data-generation-settings-amount data-generation-settings-field="baseCcyAmountStep" aria-label="Base Ccy Amount Step for Pricing Rule ${settings.pricingRuleId}">
            </td>
            <td>
              <input class="form-control form-control-sm generation-probability-input" type="number" min="0" max="100" step="1" value="${escapeHtml(settings.buyProbabilityPercent)}" data-generation-settings-field="buyProbabilityPercent" aria-label="BUY Probability Percent for Pricing Rule ${settings.pricingRuleId}">
            </td>
            <td class="text-end generation-sell-probability" data-generation-settings-sell-probability>${100 - Number(settings.buyProbabilityPercent)}%</td>
            <td class="text-center">
              <input class="form-check-input" type="checkbox" data-generation-settings-field="active" aria-label="Active for Pricing Rule ${settings.pricingRuleId}"${settings.active ? " checked" : ""}>
            </td>
          `
          : `
            <td class="text-end">${escapeHtml(formatGroupedNumberInput(settings.minBaseCcyAmount))}</td>
            <td class="text-end">${escapeHtml(formatGroupedNumberInput(settings.maxBaseCcyAmount))}</td>
            <td class="text-end">${escapeHtml(formatGroupedNumberInput(settings.baseCcyAmountStep))}</td>
            <td class="text-end">${escapeHtml(settings.buyProbabilityPercent)}%</td>
            <td class="text-end">${100 - Number(settings.buyProbabilityPercent)}%</td>
            <td class="text-center">${activeBooleanTokenMarkup(settings.active)}</td>
          `;
        const actions = editing
          ? `
            <button type="button" class="btn btn-sm btn-outline-primary generation-settings-save" data-generation-settings-save aria-label="Save Pricing Rule #${settings.pricingRuleId} settings" title="No changes to save" disabled>
              <span class="button-icon" aria-hidden="true">save</span>
            </button>
            <button type="button" class="btn btn-sm btn-outline-secondary generation-settings-cancel" data-generation-settings-cancel aria-label="Cancel Pricing Rule #${settings.pricingRuleId} editing" title="Cancel">
              <span class="button-icon" aria-hidden="true">close</span>
            </button>
          `
          : `
            <button type="button" class="btn btn-sm btn-outline-secondary generation-settings-edit" data-generation-settings-edit aria-label="Edit Pricing Rule #${settings.pricingRuleId} settings" title="Edit">
              <span class="button-icon" aria-hidden="true">edit</span>
            </button>
          `;

        return `
          <tr data-generation-settings-pricing-rule-id="${settings.pricingRuleId}" data-generation-settings-editing="${editing}">
            <td class="generation-settings-rule-id">#${escapeHtml(settings.pricingRuleId)}</td>
            <td class="generation-settings-client">
              <span>${escapeHtml(settings.counterpartyName)}</span>${inactiveClient}
            </td>
            <td>${escapeHtml(settings.currencyPair)}</td>
            <td>
              ${pricingModeIndicatorMarkup(
                settings.pricingMode,
                escapeHtml(pricingTypePresentation(settings.pricingMode).label),
                false
              )}${inactiveExecutionSystem}
            </td>
            ${valueCells}
            <td class="text-center">
              <span class="generation-settings-row-actions">
                ${actions}
              </span>
            </td>
          </tr>
        `;
      }).join("");
      scheduleSmartColumnSizing();
    }

    async function loadClientDealGenerationSettingsFromApi() {
      clientDealGenerationSettingsEditPricingRuleId = null;
      setClientDealGenerationSettingsStatus("Loading settings...");

      try {
        const [settings, processSettings] = await Promise.all([
          demoApiRequest("/api/v1/client-deal-generation/settings"),
          demoApiRequest("/api/v1/client-deal-generation/process-settings")
        ]);
        clientDealGenerationSettings = Array.isArray(settings) ? settings : [];
        clientDealGenerationProcessSettings = processSettings;
        renderClientDealGenerationProcessSettings();
        renderClientDealGenerationSettings();
        setClientDealGenerationSettingsStatus();
      } catch (error) {
        clientDealGenerationSettings = [];
        renderClientDealGenerationProcessSettings();
        renderClientDealGenerationSettings();
        setClientDealGenerationSettingsStatus(
          error.message || "Unable to load Client Deal Generation Settings.",
          "error"
        );
      }
    }

    function clientDealGenerationSettingsDraft(row) {
      const field = name => row.querySelector(`[data-generation-settings-field="${name}"]`);
      const minBaseCcyAmount = normalizeNumber(field("minBaseCcyAmount")?.value);
      const maxBaseCcyAmount = normalizeNumber(field("maxBaseCcyAmount")?.value);
      const baseCcyAmountStep = normalizeNumber(field("baseCcyAmountStep")?.value);
      const buyProbabilityPercent = Number(field("buyProbabilityPercent")?.value);
      const active = Boolean(field("active")?.checked);

      if (![minBaseCcyAmount, maxBaseCcyAmount, baseCcyAmountStep]
        .every(value => Number.isFinite(value) && value > 0)) {
        throw new Error("Min Amount, Max Amount and Amount Step must be positive numbers.");
      }

      if (maxBaseCcyAmount < minBaseCcyAmount) {
        throw new Error("Max Base Ccy Amount must not be below Min Base Ccy Amount.");
      }

      if (!Number.isInteger(buyProbabilityPercent)
        || buyProbabilityPercent < 0
        || buyProbabilityPercent > 100) {
        throw new Error("BUY Probability must be an integer from 0 to 100.");
      }

      return {
        minBaseCcyAmount,
        maxBaseCcyAmount,
        baseCcyAmountStep,
        buyProbabilityPercent,
        active
      };
    }

    function updateClientDealGenerationSettingsSaveAvailability(row) {
      const pricingRuleId = Number(row.dataset.generationSettingsPricingRuleId);
      const saveButton = row.querySelector("[data-generation-settings-save]");
      const current = clientDealGenerationSettings.find(settings =>
        Number(settings.pricingRuleId) === pricingRuleId
      );
      let draft;

      if (row.dataset.generationSettingsEditing !== "true") {
        setSaveButtonAvailability(saveButton, false);
        return;
      }

      try {
        draft = clientDealGenerationSettingsDraft(row);
      } catch {
        setSaveButtonAvailability(saveButton, false, "Enter valid settings before saving");
        return;
      }

      const changed = Boolean(current) && (
        !sameNumber(draft.minBaseCcyAmount, current.minBaseCcyAmount)
        || !sameNumber(draft.maxBaseCcyAmount, current.maxBaseCcyAmount)
        || !sameNumber(draft.baseCcyAmountStep, current.baseCcyAmountStep)
        || draft.buyProbabilityPercent !== Number(current.buyProbabilityPercent)
        || draft.active !== Boolean(current.active)
      );
      setSaveButtonAvailability(saveButton, changed);
    }

    function editClientDealGenerationSettingsRow(row) {
      clientDealGenerationSettingsEditPricingRuleId =
        Number(row.dataset.generationSettingsPricingRuleId);
      renderClientDealGenerationSettings();
      const editRow = clientDealGenerationSettingsRows.querySelector(
        `[data-generation-settings-pricing-rule-id="${clientDealGenerationSettingsEditPricingRuleId}"]`
      );
      updateClientDealGenerationSettingsSaveAvailability(editRow);
    }

    function cancelClientDealGenerationSettingsRowEdit() {
      clientDealGenerationSettingsEditPricingRuleId = null;
      renderClientDealGenerationSettings();
      setClientDealGenerationSettingsStatus();
    }

    async function saveClientDealGenerationSettingsRow(row) {
      const pricingRuleId = Number(row.dataset.generationSettingsPricingRuleId);
      const saveButton = row.querySelector("[data-generation-settings-save]");
      let payload;

      try {
        payload = clientDealGenerationSettingsDraft(row);
      } catch (error) {
        setClientDealGenerationSettingsStatus(error.message, "error");
        return;
      }

      saveButton.disabled = true;
      setClientDealGenerationSettingsStatus(`Saving Pricing Rule #${pricingRuleId}...`);

      try {
        const saved = await demoApiRequest(
          `/api/v1/client-deal-generation/settings/${pricingRuleId}`,
          { method: "PUT", body: JSON.stringify(payload) }
        );
        const index = clientDealGenerationSettings
          .findIndex(settings => Number(settings.pricingRuleId) === pricingRuleId);

        if (index >= 0) {
          clientDealGenerationSettings[index] = saved;
        }

        clientDealGenerationSettingsEditPricingRuleId = null;
        renderClientDealGenerationSettings();
        setClientDealGenerationSettingsStatus(
          `Generation settings for Pricing Rule ${pricingRuleId} were saved successfully.`,
          "success"
        );
      } catch (error) {
        updateClientDealGenerationSettingsSaveAvailability(row);
        setClientDealGenerationSettingsStatus(
          error.message || "Unable to save Client Deal Generation Settings.",
          "error"
        );
      }
    }

    function setWorkbenchPageStatus(element, message = "", tone = "") {
      element.textContent = message;
      element.classList.toggle("is-error", tone === "error");
      element.classList.toggle("is-success", tone === "success");
      element.classList.toggle("is-warning", tone === "warning");
    }

    function completedActionMessage(subject, action) {
      return `${subject} was ${action} successfully.`;
    }

    function setBatchingHistoryStatus(message = "", tone = "") {
      setWorkbenchPageStatus(batchingHistoryStatusEl, message, tone);
      batchingHistoryStatusEl.hidden = !message;
    }

    function setDatabaseStatus(message = "", tone = "") {
      setWorkbenchPageStatus(databaseStatusEl, message, tone);
    }

    function setClientProfileStatus(message, tone = "") {
      setWorkbenchPageStatus(clientProfileStatusEl, message, tone);
    }

    function setPricingRuleStatus(message, tone = "") {
      setWorkbenchPageStatus(pricingRuleStatusEl, message, tone);
    }

    function selectedClientProfile() {
      return Number.isInteger(editingClientProfileIndex) ? clientProfiles[editingClientProfileIndex] : null;
    }

    function setClientProfileCodeTypeOptions(selectedValue = "INN") {
      const control = clientProfileForm.elements.clientCodeType;
      const selected = normalizedClientCodeType(selectedValue);

      if (selected === "INTERNAL_UNIT_CODE") {
        control.innerHTML = '<option value="INTERNAL_UNIT_CODE">INTERNAL_UNIT_CODE</option>';
        control.value = "INTERNAL_UNIT_CODE";
        return;
      }

      control.innerHTML = clientCodeTypeOptions(selected);
      control.value = EXTERNAL_COUNTERPARTY_CODE_TYPES.includes(selected) ? selected : "INN";
    }

    function selectedTradingCounterpartyFormRoles() {
      return Array.from(clientProfileForm.querySelectorAll("input[name='counterpartyRole']:checked"))
        .map(control => control.value)
        .filter(role => COUNTERPARTY_ROLES.includes(role));
    }

    function setTradingCounterpartyFormRoles(value, fallbackRole = "CLIENT") {
      const selected = new Set(normalizedCounterpartyRoles(value, fallbackRole));

      clientProfileForm.querySelectorAll("input[name='counterpartyRole']").forEach(control => {
        control.checked = selected.has(control.value);
      });
    }

    function syncTradingCounterpartyFormScope(scopeValue, selectedKind = "") {
      const scope = normalizedCounterpartyScope(scopeValue, activeTradingCounterpartyScope);
      const scopeControl = clientProfileForm.elements.counterpartyScope;
      const codeTypeControl = clientProfileForm.elements.clientCodeType;
      const kindControl = clientProfileForm.elements.profileKind;

      scopeControl.value = scope;
      clientProfileKindLabel.textContent = scope === "INTERNAL" ? "Unit Type" : "External Counterparty Type";
      clientProfileCodeLabel.textContent = "Business ID Type";
      clientProfileNameLabel.textContent = scope === "INTERNAL" ? "Unit Name" : "Counterparty Name";

      if (scope === "INTERNAL") {
        setClientProfileCodeTypeOptions("INTERNAL_UNIT_CODE");
        kindControl.innerHTML = internalUnitTypeOptions(selectedKind || "DESK");
        kindControl.value = normalizedInternalUnitType(selectedKind, "DESK");
      } else {
        const selectedCodeType = EXTERNAL_COUNTERPARTY_CODE_TYPES.includes(normalizedClientCodeType(codeTypeControl.value))
          ? codeTypeControl.value
          : "INN";
        setClientProfileCodeTypeOptions(selectedCodeType);
        kindControl.innerHTML = externalCounterpartyKindOptions(selectedKind || "CORPORATE");
        kindControl.value = normalizedExternalCounterpartyKind(selectedKind, "CORPORATE");
      }
    }

    function setTradingCounterpartyTypeOptions(selectedValue = "CLIENT") {
      setTradingCounterpartyFormRoles([selectedValue], selectedValue);
    }

    function tradingCounterpartyFormProfileKind(scope = clientProfileForm.elements.counterpartyScope.value) {
      return normalizedCounterpartyScope(scope) === "INTERNAL"
        ? normalizedInternalUnitType(clientProfileForm.elements.profileKind.value)
        : normalizedExternalCounterpartyKind(clientProfileForm.elements.profileKind.value);
    }

    function tradingCounterpartyFormCodeType(scope = clientProfileForm.elements.counterpartyScope.value) {
      return normalizedCounterpartyScope(scope) === "INTERNAL"
        ? "INTERNAL_UNIT_CODE"
        : normalizedClientCodeType(clientProfileForm.elements.clientCodeType.value);
    }

    function tradingCounterpartyRolesEqual(left, right) {
      return normalizedCounterpartyRoles(left, "").join("|") === normalizedCounterpartyRoles(right, "").join("|");
    }

    function tradingCounterpartyScopeDefaultRole(scope) {
      return normalizedCounterpartyScope(scope) === "INTERNAL" ? "HEDGE_COUNTERPARTY" : "CLIENT";
    }

    function setTradingCounterpartyScopeTab(scopeValue) {
      activeTradingCounterpartyScope = normalizedCounterpartyScope(scopeValue);

      tradingCounterpartyScopeButtons.forEach(button => {
        const selected = button.dataset.tradingCounterpartyScope === activeTradingCounterpartyScope;
        button.classList.toggle("active", selected);
        button.setAttribute("aria-selected", String(selected));
      });

      const internal = activeTradingCounterpartyScope === "INTERNAL";
      const tableLayoutKey = internal
        ? "internal_units_grid"
        : "external_counterparties_grid";
      tradingCounterpartiesTable.classList.toggle("is-internal-scope", internal);
      tradingCounterpartiesTable.dataset.uiTableLayoutKey = tableLayoutKey;
      tradingCounterpartiesTable.querySelector(".client-profile-party-type-col").dataset.uiColumnKey = internal
        ? "unit_type"
        : "counterparty_type";
      tradingCounterpartiesTable.querySelector(".client-profile-name-col").dataset.uiColumnKey = internal
        ? "unit_name"
        : "counterparty_name";
      const tableLayoutHost = clientProfileListView.querySelector("[data-ui-table-layout-host]");
      const tableLayoutButton = tableLayoutHost?.querySelector("[data-ui-table-layout]");

      if (tableLayoutHost) {
        tableLayoutHost.dataset.uiTableLayoutHost = tableLayoutKey;
      }

      if (tableLayoutButton) {
        tableLayoutButton.dataset.uiTableLayout = tableLayoutKey;
        tableLayoutButton.setAttribute(
          "aria-label",
          `${uiTableLayout(tableLayoutKey)?.tableLabel || "Trading Counterparties"} table layout`
        );
      }
      tradingCounterpartyProfileTypeHeaderLabel.textContent = internal ? "Unit Type" : "Counterparty Type";
      tradingCounterpartyNameHeaderLabel.textContent = internal ? "Unit Name" : "Counterparty Name";
      tradingCounterpartyCodeFilter.setAttribute("aria-label", internal
        ? "Filter internal units by Business ID"
        : "Filter external counterparties by Business ID");
      tradingCounterpartyCodeTypeFilter.setAttribute("aria-label", internal
        ? "Filter internal units by Business ID Type"
        : "Filter external counterparties by Business ID Type");
      tradingCounterpartyExternalKindFilter.setAttribute("aria-label", internal
        ? "Filter internal units by Unit Type"
        : "Filter external counterparties by Counterparty Type");
      clientProfileNewButtonLabel.textContent = internal ? "New internal unit" : "New external counterparty";

      const partyTypes = internal ? INTERNAL_UNIT_TYPES : EXTERNAL_COUNTERPARTY_KINDS;
      const selectedPartyType = partyTypes.includes(tradingCounterpartyExternalKindFilter.value)
        ? tradingCounterpartyExternalKindFilter.value
        : "";
      tradingCounterpartyExternalKindFilter.innerHTML = [
        '<option value="">All</option>',
        ...partyTypes.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(internal ? value : externalCounterpartyKindLabel(value))}</option>`)
      ].join("");
      tradingCounterpartyExternalKindFilter.value = selectedPartyType;

      const businessIdTypes = internal ? ["INTERNAL_UNIT_CODE"] : EXTERNAL_COUNTERPARTY_CODE_TYPES;
      const selectedBusinessIdType = businessIdTypes.includes(tradingCounterpartyCodeTypeFilter.value)
        ? tradingCounterpartyCodeTypeFilter.value
        : "";
      tradingCounterpartyCodeTypeFilter.innerHTML = [
        '<option value="">All</option>',
        ...businessIdTypes.map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`)
      ].join("");
      tradingCounterpartyCodeTypeFilter.value = selectedBusinessIdType;
      applyUiTableLayout(tableLayoutKey);
    }

    function clientProfileFormHasChanges() {
      const profile = selectedClientProfile();

      if (!profile) {
        return true;
      }

      const formCounterpartyScope = normalizedCounterpartyScope(clientProfileForm.elements.counterpartyScope.value);
      const formClientCodeType = tradingCounterpartyFormCodeType(formCounterpartyScope);
      const formCounterpartyRoles = selectedTradingCounterpartyFormRoles();
      const formInn = normalizedClientCode(clientProfileForm.elements.inn.value, formClientCodeType, "");
      const formName = clientProfileForm.elements.clientName.value.trim();
      const formIsActive = clientProfileForm.elements.isActive.checked;
      const formProfileKind = tradingCounterpartyFormProfileKind(formCounterpartyScope);
      const profileKind = formCounterpartyScope === "INTERNAL"
        ? normalizedInternalUnitType(profile.unitType)
        : normalizedExternalCounterpartyKind(profile.externalCounterpartyKind);

      return formInn !== profile.inn ||
        formCounterpartyScope !== normalizedCounterpartyScope(profile.counterpartyScope) ||
        !tradingCounterpartyRolesEqual(formCounterpartyRoles, profile.counterpartyRoles) ||
        formClientCodeType !== normalizedClientCodeType(profile.clientCodeType) ||
        formProfileKind !== profileKind ||
        formName !== profile.name ||
        formIsActive !== profile.isActive;
    }

    function updateClientProfileSubmitAvailability() {
      const noChanges = editingClientProfileIndex !== null && !clientProfileFormHasChanges();
      const scope = normalizedCounterpartyScope(clientProfileForm.elements.counterpartyScope.value);
      const codeType = tradingCounterpartyFormCodeType(scope);
      const code = normalizedClientCode(clientProfileForm.elements.inn.value, codeType, "");
      const name = clientProfileForm.elements.clientName.value.trim();
      const complete = selectedTradingCounterpartyFormRoles().length > 0
        && isValidClientCodeForType(code, codeType)
        && name.length >= 1
        && name.length <= 200;

      clientProfileSubmitButton.disabled = noChanges || !complete;
      clientProfileSubmitButton.title = noChanges
        ? "No changes to save"
        : complete
          ? ""
          : "Complete required fields before saving";
    }

    function marketCurrencyPairValues() {
      return marketPairs.map(pair => pair.currencyPair).filter(Boolean);
    }
