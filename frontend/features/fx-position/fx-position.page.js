    function clientFxDealsRoute() {
      return "#client-fx-deals";
    }

    function hedgeFxDealsRoute() {
      return "#hedge-fx-deals";
    }

    function analyticalPnlReportRoute() {
      return "#reports:analytical-pnl";
    }

    function hedgingSettingsRoute() {
      return "#hedging-settings";
    }

    function batchingSettingsRoute() {
      return "#batching-settings";
    }

    const PRICING_CONTEXT_REFERENCE_FILTERS = Object.freeze({
      servicingBranch: Object.freeze({
        parameter: "servicing-location",
        field: "servicingBranchCode"
      }),
      settlementSystem: Object.freeze({
        parameter: "accounting-system",
        field: "settlementSystemId"
      }),
      tradeCaptureChannel: Object.freeze({
        parameter: "execution-system",
        field: "tradeCaptureChannelId"
      })
    });

    function pricingRoute(referenceKind = "", referenceId = "") {
      const filter = PRICING_CONTEXT_REFERENCE_FILTERS[referenceKind];
      const normalizedReferenceId = String(referenceId ?? "").trim();

      return filter && normalizedReferenceId
        ? `#execution-context?${filter.parameter}=${encodeURIComponent(normalizedReferenceId)}`
        : "#execution-context";
    }

    function pricingRouteStateFromLocation(hash = location.hash) {
      const match = /^#(?:execution-context|pricing)(?:\?([^#]*))?$/.exec(String(hash || "").trim());

      if (!match) {
        return { matches: false, mode: "default", scope: null };
      }

      const parameters = new URLSearchParams(match[1] || "");
      const scopedEntry = Object.entries(PRICING_CONTEXT_REFERENCE_FILTERS)
        .map(([kind, filter]) => ({
          kind,
          field: filter.field,
          value: String(parameters.get(filter.parameter) || "").trim()
        }))
        .find(entry => entry.value);

      return {
        matches: true,
        mode: scopedEntry ? "related" : "default",
        scope: scopedEntry || null
      };
    }

    function referenceDataRouteToken(kind) {
      if (kind === "settlementSystem") {
        return "accounting-systems";
      }

      if (kind === "tradeCaptureChannel") {
        return "execution-systems";
      }

      return "servicing-locations";
    }

    function referenceDataKindFromToken(token) {
      if (token === "accounting-systems" || token === "settlement-systems") {
        return "settlementSystem";
      }

      if (token === "execution-systems" || token === "trade-capture-channels") {
        return "tradeCaptureChannel";
      }

      if (token === "servicing-locations" || token === "servicing-branches") {
        return "servicingBranch";
      }

      return "servicingBranch";
    }

    function referenceDataRoute(kind = "servicingBranch") {
      return `#reference-data:${referenceDataRouteToken(kind)}`;
    }

    function activeReferenceDataKind() {
      const match = /^#reference-data(?::([^:]+))?$/.exec(location.hash);

      return referenceDataKindFromToken(match?.[1] || "servicing-branches");
    }

    function pricingRulesRoute(scope = "EXTERNAL") {
      return scope === "INTERNAL"
        ? "#pricing-rules:internal-units"
        : "#pricing-rules:external-counterparties";
    }

    function normalizedCcyPairRouteCode(value) {
      const pairCode = String(value || "").trim().toUpperCase().replace("/", "_");

      return /^[A-Z]{3}_[A-Z]{3}$/.test(pairCode) ? pairCode : "";
    }

    function preferredPricingRulesScopeForPair(pairCode) {
      return ["EXTERNAL", "INTERNAL"].find(scope =>
        clientPricingRules.some(rule =>
          rule.ccyPairCode === pairCode && rule.counterpartyScope === scope
        )
      ) || "EXTERNAL";
    }

    function pricingRulesForCcyPairRoute(
      pairCode,
      returnHash = location.hash,
      scope = ""
    ) {
      const normalizedPairCode = normalizedCcyPairRouteCode(pairCode);

      if (!normalizedPairCode) {
        return pricingRulesRoute();
      }

      const normalizedScope = ["EXTERNAL", "INTERNAL"].includes(scope)
        ? scope
        : preferredPricingRulesScopeForPair(normalizedPairCode);
      const parameters = new URLSearchParams();
      parameters.set("ccy-pair", normalizedPairCode);
      parameters.set("return", normalizedCurrencyPairSettingsReturnRoute(returnHash));
      return `${pricingRulesRoute(normalizedScope)}?${parameters.toString()}`;
    }

    function pricingRulesRouteStateFromLocation(hash = location.hash) {
      const match = /^#pricing-rules(?::(external-counterparties|internal-units))?(?:\?([^#]*))?$/.exec(
        String(hash || "").trim()
      );

      if (!match) {
        return {
          matches: false,
          mode: "list",
          scope: "EXTERNAL",
          pairCode: "",
          currencyPair: "",
          returnHash: settingsRoute("pairs")
        };
      }

      const scope = match[1] === "internal-units" ? "INTERNAL" : "EXTERNAL";
      const parameters = new URLSearchParams(match[2] || "");
      const pairCode = normalizedCcyPairRouteCode(parameters.get("ccy-pair"));

      return {
        matches: true,
        mode: pairCode ? "related" : "list",
        scope,
        pairCode,
        currencyPair: pairCode.replace("_", "/"),
        returnHash: normalizedCurrencyPairSettingsReturnRoute(parameters.get("return"))
      };
    }

    function isBatchingBlotterRoute() {
      return /^#fx-position(?::(?:manual|auto))?$/i.test(location.hash)
        || location.hash === "#fx-position-management"
        || location.hash === "#batching-blotter";
    }

    function isBatchingHistoryRoute() {
      return location.hash === "#batching"
        || location.hash === batchingHistoryRoute();
    }

    function isBatchFormationAuditRoute() {
      return location.hash === batchFormationAuditRoute();
    }

    function isBatchDetailsRoute() {
      return /^#batching:details\/\d+$/.test(location.hash);
    }

    function isClientProfileRoute() {
      return clientProfileRouteStateFromLocation().matches;
    }

    function isUsersRoute() {
      return /^#users(?:\/[^/?#]+)?$/.test(location.hash);
    }

    function isMarketRoute() {
      return location.hash === "#market-pulse"
        || location.hash === "#market-pulse:streams"
        || location.hash === "#market"
        || location.hash === "#market:streams";
    }

    function isCurrencySettingsRoute() {
      return currencySettingsRouteStateFromLocation().matches;
    }

    function isDatabaseRoute() {
      return location.hash === databaseRoute();
    }

    function isManualBatchFormationProcessRoute() {
      return location.hash === manualBatchFormationProcessRoute();
    }

    function isDomainGlossaryRoute() {
      return location.hash === domainGlossaryRoute()
        || location.hash.startsWith(`${domainGlossaryRoute()}/`);
    }

    function isProcessCatalogRoute() {
      return isManualBatchFormationProcessRoute()
        || isDomainGlossaryRoute();
    }

    function isClientFxDealsRoute() {
      return location.hash === clientFxDealsRoute();
    }

    function isHedgeFxDealsRoute() {
      return location.hash === hedgeFxDealsRoute();
    }

    function isAnalyticalPnlReportRoute() {
      return location.hash === analyticalPnlReportRoute();
    }

    function isHedgingSettingsRoute() {
      return location.hash === hedgingSettingsRoute();
    }

    function isBatchingSettingsRoute() {
      return location.hash === batchingSettingsRoute();
    }

    function isPricingRoute() {
      return pricingRouteStateFromLocation().matches;
    }

    function isReferenceDataRoute() {
      return location.hash === "#reference-data" || location.hash.startsWith("#reference-data:");
    }

    function isPricingRulesRoute() {
      return pricingRulesRouteStateFromLocation().matches;
    }

    function pricingRulesScopeFromRoute() {
      return pricingRulesRouteStateFromLocation().scope;
    }

    function setBatchStatus(message, tone = "") {
      setWorkbenchPageStatus(batchStatusEl, message, tone);
    }

    function storedNumber(value, fallback) {
      const number = Number(value);
      return Number.isFinite(number) ? number : fallback;
    }

    function storedBoolean(value, fallback = false) {
      return typeof value === "boolean" ? value : fallback;
    }

    function storedOptionalNumber(value, fallback) {
      if (value === null || value === "") {
        return null;
      }

      if (value === undefined) {
        return fallback;
      }

      const number = Number(value);
      return Number.isFinite(number) ? number : fallback;
    }

    function storedText(value, fallback) {
      return typeof value === "string" ? value : fallback;
    }

    function storedField(source, camelName, snakeName) {
      if (source && source[camelName] !== undefined) {
        return source[camelName];
      }

      return source ? source[snakeName] : undefined;
    }

    function storedAnyField(source, ...names) {
      if (!source) {
        return undefined;
      }

      for (const name of names) {
        if (source[name] !== undefined) {
          return source[name];
        }
      }

      return undefined;
    }

    function normalizeClientName(value, fallback) {
      const text = storedText(value, fallback).trim();
      const hasNonEnglishCharacters = /[^\x00-\x7F]/.test(text);
      const numberedLegacyName = hasNonEnglishCharacters ? /(\d+)$/.exec(text) : null;

      if (numberedLegacyName) {
        return `Client_${numberedLegacyName[1]}`;
      }

      if (hasNonEnglishCharacters) {
        return fallback || "Client";
      }

      return text || fallback;
    }

    function storedBranchCode(source, fallback) {
      const storedValue = storedField(source, "branchCode", "branch_code");
      const value = typeof storedValue === "string" ? storedValue : source.branch;
      const normalized = typeof value === "string" ? value.trim() : "";

      return isValidServicingLocationId(normalized) ? normalized : fallback;
    }

    function storedServicingBranchCode(source, fallback = "") {
      const value = storedAnyField(source, "servicingBranchCode", "servicing_branch_code");
      const normalized = typeof value === "string" ? value.trim() : "";

      return isValidServicingLocationId(normalized) ? normalized : fallback;
    }

    function storedContextCodeField(source, camelName, snakeName, fallback = "") {
      const value = normalizedContextCode(storedAnyField(source, camelName, snakeName));

      if (camelName === "tradeCaptureChannelId") {
        return value ? normalizedTradeCaptureChannelId(value) : fallback;
      }

      return value || fallback;
    }

    function innForClientName(name) {
      const clientName = String(name || "").trim();

      return clientProfiles.find(profile => profile.name === clientName)?.inn || defaultInnForClientName(clientName);
    }

    function storedInn(source, fallbackName) {
      const clientCodeType = normalizedClientCodeType(
        storedAnyField(source, "clientCodeType", "client_code_type") ||
        clientProfileByName(fallbackName)?.clientCodeType,
        "INN"
      );
      const storedValue = storedAnyField(source, "inn", "clientCode", "client_code");
      const fallbackCode = clientProfileByName(fallbackName)?.inn || innForClientName(fallbackName);

      return normalizedClientCode(storedValue, clientCodeType, fallbackCode);
    }

    function storedTone(value, fallback = "blue") {
      return value === "blue" ? "blue" : fallback;
    }

    function applyStoredDeal(target, source) {
      const amountSell = storedNumber(storedField(source, "amountSell", "amount_sell"), target.amountSell);
      const amountBuy = storedNumber(storedField(source, "amountBuy", "amount_buy"), target.amountBuy);

      target.positionId = storedText(storedAnyField(source, "positionId", "position_id"), target.positionId || "");
      target.branchCode = storedBranchCode(source, target.branchCode);
      target.type = storedText(storedField(source, "type", "type"), target.type || "client_deal");
      target.clientName = normalizeClientName(storedField(source, "clientName", "client_name"), target.clientName);
      target.inn = storedInn(source, target.clientName);
      target.clientCodeType = normalizedClientCodeType(
        storedAnyField(source, "clientCodeType", "client_code_type") || clientProfileByInn(target.inn)?.clientCodeType,
        "INN"
      );
      target.settlementSystemId = storedContextCodeField(source, "settlementSystemId", "settlement_system_id", target.settlementSystemId || "");
      target.tradeCaptureChannelId = storedContextCodeField(source, "tradeCaptureChannelId", "trade_capture_channel_id", target.tradeCaptureChannelId || "");
      target.executionVenueType = normalizedContextCode(
        storedAnyField(source, "executionVenueType", "execution_venue_type", "hedgeSourceType", "hedge_source_type")
      ) || target.executionVenueType || "";
      target.executionVenue = storedText(
        storedAnyField(source, "executionVenue", "execution_venue", "hedgeSource", "hedge_source"),
        target.executionVenue || ""
      );
      target.tradeDate = storedText(
        storedAnyField(source, "tradeDate", "trade_date", "createDate", "create_date"),
        target.tradeDate || ""
      );
      target.entryDate = storedText(
        storedAnyField(source, "entryDate", "entry_date"),
        target.entryDate || target.tradeDate || ""
      );
      target.valueDate = storedText(storedField(source, "valueDate", "value_date"), target.valueDate);
      target.baseCurrencySettlementDay = storedText(
        storedAnyField(source, "baseCurrencySettlementDay", "base_currency_settlement_day"),
        target.baseCurrencySettlementDay || target.valueDate || ""
      );
      target.quoteCurrencySettlementDay = storedText(
        storedAnyField(source, "quoteCurrencySettlementDay", "quote_currency_settlement_day"),
        target.quoteCurrencySettlementDay || target.valueDate || ""
      );
      target.settlementMethod = normalizedContextCode(storedAnyField(source, "settlementMethod", "settlement_method")) || "PVP";
      target.tenor = storedText(storedField(source, "tenor", "tenor"), target.tenor || "");
      target.baseCurrency = storedText(storedField(source, "baseCurrency", "base_currency"), target.baseCurrency || "EUR");
      target.quoteCurrency = storedText(storedField(source, "quoteCurrency", "quote_currency"), target.quoteCurrency || "USD");
      target.currencyPair = storedText(
        storedField(source, "currencyPair", "currency_pair"),
        currencyPairValue(target.baseCurrency, target.quoteCurrency)
      );
      target.amountSell = amountSell > 0 && amountBuy <= 0 ? amountSell : 0;
      target.amountBuy = amountBuy > 0 ? amountBuy : 0;
      target.clientRate = storedNumber(storedField(source, "clientRate", "client_rate"), target.clientRate);
      target.autoBatchRate = storedOptionalNumber(storedField(source, "autoBatchRate", "ladder_rate"), target.autoBatchRate);
      target.pnlCash = storedOptionalNumber(storedField(source, "pnlCash", "pnl_cash"), target.pnlCash);
      target.pricingRuleId = storedText(
        storedAnyField(source, "pricingRuleId", "pricing_rule_id"),
        target.pricingRuleId || ""
      );
      target.pricingRuleMargin = storedOptionalNumber(
        storedAnyField(source, "pricingRuleMargin", "pricing_rule_margin"),
        target.pricingRuleMargin
      );
      target.pricingRuleControlStatus = storedText(
        storedAnyField(source, "pricingRuleControlStatus", "pricing_rule_control_status"),
        target.pricingRuleControlStatus || ""
      );
      target.pricingContextId = normalizedPricingContextIdValue(
        storedAnyField(source, "pricingContextId", "pricing_context_id") || fxPositionExecutionContextId(source)
      );
      applyPricingContextToFxPosition(target);
      target.entryMarketBid = storedOptionalNumber(
        storedAnyField(source, "entryMarketBid", "entry_market_bid", "ledgerMarketBid", "ledger_market_bid", "marketBid", "market_reference_bid", "market_rate"),
        target.entryMarketBid
      );
      target.entryMarketOffer = storedOptionalNumber(
        storedAnyField(source, "entryMarketOffer", "entry_market_offer", "ledgerMarketOffer", "ledger_market_offer", "marketOffer", "market_reference_offer", "market_offer_rate"),
        target.entryMarketOffer
      );
      target.tone = storedTone(source.tone, target.tone);
      target.batchId = storedText(storedField(source, "batchId", "batch_id"), target.batchId || "");
      target.isBatched = storedBoolean(storedField(source, "isBatched", "is_batched"), target.isBatched === true);
    }

    function buildStoredFxPosition(source) {
      const id = typeof source.id === "string" && source.id.trim() ? source.id.trim() : createDealId();
      const deal = {
        id,
        positionId: "",
        branchCode: "10000000",
        inn: "7700000000",
        clientCodeType: "INN",
        settlementSystemId: "",
        tradeCaptureChannelId: "",
        executionVenueType: "",
        executionVenue: "",
        type: "client_deal",
        clientName: "New Client",
        entryDate: "",
        tradeDate: "",
        valueDate: "",
        baseCurrencySettlementDay: "",
        quoteCurrencySettlementDay: "",
        settlementMethod: "PVP",
        tenor: "",
        baseCurrency: "EUR",
        quoteCurrency: "USD",
        currencyPair: "EUR/USD",
        amountSell: 1,
        amountBuy: 0,
        clientRate: 1,
        autoBatchRate: null,
        pnlCash: null,
        pricingRuleId: "",
        pricingRuleMargin: null,
        pricingRuleControlStatus: "",
        pricingContextId: "",
        entryMarketBid: null,
        entryMarketOffer: null,
        tone: "blue",
        batchId: "",
        isBatched: false
      };

      applyStoredDeal(deal, source);
      return deal;
    }

    function fxPositionIdForDeal(deal) {
      const storedPositionId = String(deal?.positionId || deal?.position_id || "").trim();
      return storedPositionId || `FXP-${fxPositionType(deal)}-${deal.id}`;
    }

    function serializeFxDeal(deal) {
      const positionId = fxPositionIdForDeal(deal);
      deal.positionId = positionId;

      return {
        id: deal.id,
        positionId,
        branchCode: deal.branchCode,
        inn: deal.inn || "",
        clientCodeType: normalizedClientCodeType(deal.clientCodeType),
        settlementSystemId: deal.settlementSystemId || "",
        tradeCaptureChannelId: deal.tradeCaptureChannelId || "",
        executionVenueType: deal.executionVenueType || "",
        executionVenue: deal.executionVenue || "",
        type: deal.type || "client_deal",
        clientName: deal.clientName,
        executionTimestamp: deal.executionTimestamp || "",
        receivedTimestamp: deal.receivedTimestamp || "",
        entryDate: deal.entryDate || "",
        tradeDate: deal.tradeDate || deal.createDate || "",
        settlementMethod: fxPositionSettlementMethod(deal),
        tenor: deal.tenor || "",
        baseCurrency: deal.baseCurrency || "EUR",
        quoteCurrency: deal.quoteCurrency || "USD",
        currencyPair: currencyPair(deal),
        amountSell: deal.amountSell,
        amountBuy: deal.amountBuy,
        clientRate: deal.clientRate,
        pricingRuleId: fxDealPricingRuleId(deal),
        pricingRuleMargin: fxDealPricingRuleMargin(deal),
        pricingRuleControlStatus: deal.pricingRuleControlStatus || "",
        pricingContextId: fxPositionExecutionContextId(deal),
        tone: deal.tone
      };
    }

    function serializeGeneratedFxPosition(deal) {
      return {
        id: fxPositionIdForDeal(deal),
        sourceDealId: deal.id,
        sourceDealType: fxPositionType(deal),
        positionType: fxPositionType(deal),
        positionLabel: fxPositionTradeLabel(deal),
        tradeDate: positionTradeDate(deal),
        currencyPair: currencyPair(deal),
        baseCurrency: baseCurrency(deal),
        quoteCurrency: quoteCurrency(deal),
        baseCcyPosition: fxDealBaseCurrencyPosition(deal),
        quoteCcyPosition: fxDealQuoteCurrencyPosition(deal),
        tenor: positionTenor(deal),
        baseCcyValueDate: baseCurrencyValueDate(deal),
        quoteCcyValueDate: quoteCurrencyValueDate(deal),
        marketPulseBid: marketBid(deal),
        marketPulseOffer: marketOffer(deal),
        isBatched: deal.isBatched === true,
        batchId: deal.batchId || "",
        transferRate: fxPositionTransferRate(deal),
        analyticalPnl: pnlCash(deal)
      };
    }

    function loadFxPositionsFromDatabase() {
      const restoredFxPositions = DEMO_API_ENABLED
        ? fxPositionRecords.map(record => {
            const tradeType = String(record?.tradeType || "").trim().toUpperCase();
            let position;

            if (tradeType === "CLIENT_DEAL") {
              position = fxPositionFromClientFxDeal(normalizedClientFxDeal(record));
            } else if (tradeType === "HEDGE_DEAL") {
              position = fxPositionFromHedgeFxDeal(normalizedHedgeFxDeal(record));
            } else {
              position = fxPositionFromBatchBalancingTrade(
                normalizedBatchBalancingTrade(record)
              );
            }

            const currentFxPositionMode = normalizedPositionManagementMode(
              record?.currentFxPositionMode
              ?? record?.current_fx_position_mode
              ?? record?.fxPositionMode
              ?? record?.fx_position_mode
            );

            return {
              ...position,
              initialFxPositionMode: normalizedPositionManagementMode(
                record?.initialFxPositionMode
                ?? record?.initial_fx_position_mode,
                currentFxPositionMode
              ),
              currentFxPositionMode,
              fxPositionMode: currentFxPositionMode,
              positionManagementModeChangedAt: String(
                record?.positionManagementModeChangedAt
                ?? record?.position_management_mode_changed_at
                ?? ""
              ).trim()
            };
          })
        : [];

      fxPositions.splice(0, fxPositions.length, ...restoredFxPositions);
    }

    function sideOf(deal) {
      if (deal.amountSell > 0) {
        return "sell";
      }

      if (deal.amountBuy > 0) {
        return "buy";
      }

      return "flat";
    }

    function fxPositionBaseCcyFractionDigits(deal) {
      const fractionDigits = Number(deal?.baseCcyFractionDigits);
      return Number.isInteger(fractionDigits)
        && fractionDigits >= 0
        && fractionDigits <= 10
        ? fractionDigits
        : null;
    }

    function fxPositionBaseAmountMinor(deal) {
      const amount = deal?.baseCcyAmountMinor;

      if (!Number.isSafeInteger(amount) || amount <= 0) {
        return null;
      }

      return BigInt(amount);
    }

    function fxPositionQuoteCcyFractionDigits(deal) {
      const fractionDigits = Number(deal?.quoteCcyFractionDigits);
      return Number.isInteger(fractionDigits)
        && fractionDigits >= 0
        && fractionDigits <= 10
        ? fractionDigits
        : null;
    }

    function fxPositionQuoteAmountMinor(deal) {
      const amount = deal?.quoteCcyAmountMinor;

      if (!Number.isSafeInteger(amount) || amount <= 0) {
        return null;
      }

      return BigInt(amount);
    }

    function scaledMinorAmount(minorAmount, sourceFractionDigits, targetFractionDigits) {
      if (targetFractionDigits < sourceFractionDigits) {
        throw new RangeError("Target Fraction Digits must not reduce monetary precision.");
      }

      return minorAmount
        * (10n ** BigInt(targetFractionDigits - sourceFractionDigits));
    }

    function fxPositionBaseAmountCell(deal) {
      const minorAmount = fxPositionBaseAmountMinor(deal);
      const fractionDigits = fxPositionBaseCcyFractionDigits(deal);

      return minorAmount === null || fractionDigits === null
        ? amountCell(fxPositionBaseAmount(deal))
        : minorAmountCell(minorAmount, fractionDigits);
    }

    function fxPositionSignedBaseAmount(deal) {
      const side = sideOf(deal);

      if (side === "sell") {
        return deal.amountSell;
      }

      if (side === "buy") {
        return -deal.amountBuy;
      }

      return 0;
    }

    function fxPositionBaseAmount(deal) {
      const signedAmount = fxPositionSignedBaseAmount(deal);

      return Number.isFinite(signedAmount) ? Math.abs(signedAmount) : null;
    }

    function fxPositionSettlementMethod(deal) {
      return normalizedContextCode(deal?.settlementMethod ?? deal?.settlement_method) || "PVP";
    }

    function fxPositionType(deal) {
      if (deal.synthetic) {
        return "OPEN_POSITION";
      }

      const type = (
        deal.tradeType
        || deal.trade_type
        || deal.type
        || "client_deal"
      ).toUpperCase();
      return ["HEDGE_FX_DEAL", "MARKET_HEDGE", "HEDGE_DEAL"].includes(type) ? "HEDGE_DEAL" : type;
    }

    function fxPositionTradeId(deal) {
      if (deal?.synthetic === true || fxPositionType(deal) === "OPEN_POSITION") {
        return "";
      }

      return String(
        deal?.tradeId
        ?? deal?.trade_id
        ?? deal?.clientFxDealId
        ?? deal?.hedgeFxDealId
        ?? deal?.sourceDealId
        ?? deal?.id
        ?? ""
      ).trim();
    }

    function fxPositionCounterpartyName(deal, tradeType = fxPositionType(deal)) {
      if (tradeType === "CLIENT_DEAL") {
        return String(deal?.clientName || deal?.counterpartyName || "").trim();
      }

      if (tradeType === "HEDGE_DEAL") {
        return String(deal?.counterpartyName || hedgeFxDealSource(deal) || "").trim();
      }

      return String(deal?.counterpartyName || deal?.clientName || deal?.executionVenue || "").trim();
    }

    function fxPositionTradeTypePresentation(deal) {
      const type = fxPositionType(deal);

      if (type === "CLIENT_DEAL") {
        return { type, label: "CLIENT DEAL", icon: "handshake" };
      }

      if (type === "HEDGE_DEAL") {
        return { type, label: "HEDGE DEAL", icon: "shield" };
      }

      if (type === "BATCH_POSITION_OUT") {
        return { type, label: "BATCH POSITION OUT", icon: "output" };
      }

      if (type === "BATCH_BALANCE_TRADE") {
        return { type, label: "BATCH BALANCE TRADE", icon: "balance" };
      }

      return {
        type,
        label: type.replaceAll("_", " "),
        icon: "receipt_long"
      };
    }

    function fxPositionTradeLabel(deal) {
      const presentation = fxPositionTradeTypePresentation(deal);
      const counterpartyName = fxPositionCounterpartyName(deal, presentation.type);
      return counterpartyName
        ? `${presentation.label} : ${counterpartyName}`
        : presentation.label;
    }

    function fxPositionTradeContext(deal, tradeType = fxPositionType(deal)) {
      if (tradeType === "BATCH_POSITION_OUT") {
        const batchId = Number(deal?.batchId);
        return Number.isInteger(batchId) && batchId > 0
          ? `Position Out · Batch #${batchId}`
          : "Position Out";
      }

      if (tradeType === "BATCH_BALANCE_TRADE") {
        const batchId = Number(deal?.batchId);
        return Number.isInteger(batchId) && batchId > 0
          ? `Batch Balance · Batch #${batchId}`
          : "Batch Balance";
      }

      return fxPositionCounterpartyName(deal, tradeType);
    }

    function fxPositionTradeTypeTooltip(deal, presentation) {
      if (presentation.type === "BATCH_POSITION_OUT") {
        const batchId = Number(deal?.batchId);
        return Number.isInteger(batchId) && batchId > 0
          ? `BATCH POSITION OUT · created by FX Batch #${batchId}`
          : presentation.label;
      }

      if (presentation.type === "BATCH_BALANCE_TRADE") {
        const batchId = Number(deal?.batchId);
        return Number.isInteger(batchId) && batchId > 0
          ? `BATCH BALANCE TRADE · created by FX Batch #${batchId}`
          : presentation.label;
      }

      return presentation.label;
    }

    function fxPositionSide(deal) {
      const side = sideOf(deal);
      return side === "sell" || side === "buy" ? side : "";
    }

    function sideTokenCell(deal) {
      const side = fxPositionSide(deal);

      if (!side) {
        return "";
      }

      return `<span class="side-token ${side}">${escapeHtml(side)}</span>`;
    }

    function fxPositionTradeRate(deal) {
      return deal?.clientRate ?? null;
    }

    function fxPositionTransferRate(deal) {
      return deal?.autoBatchRate ?? null;
    }

    function positionEntryDate(deal) {
      return deal.entryDate || deal.tradeDate || deal.createDate || "";
    }

    function positionTradeDate(deal) {
      return deal.tradeDate || deal.createDate || "";
    }

    function baseCurrencyValueDate(deal) {
      return deal.baseCurrencyValueDate || deal.baseCurrencySettlementDay || deal.valueDate || "";
    }

    function quoteCurrencyValueDate(deal) {
      return deal.quoteCurrencyValueDate || deal.quoteCurrencySettlementDay || deal.valueDate || "";
    }

    function positionTenor(deal) {
      return deal.tenor || "";
    }

    function baseCurrencyValueDateLabel(deal) {
      return [positionTenor(deal), baseCurrencyValueDate(deal)]
        .filter(Boolean)
        .join(" · ");
    }

    function baseCurrency(deal) {
      return deal.baseCurrency || "BASE";
    }

    function quoteCurrency(deal) {
      return deal.quoteCurrency || "QUOTE";
    }

    function currencyPairValue(base, quote) {
      const normalizedBase = String(base || "").trim().toUpperCase();
      const normalizedQuote = String(quote || "").trim().toUpperCase();

      if (!normalizedBase || !normalizedQuote) {
        return "";
      }

      return `${normalizedBase}/${normalizedQuote}`;
    }

    function currencyPair(deal) {
      const storedPair = typeof deal.currencyPair === "string" ? deal.currencyPair.trim() : "";

      return storedPair || currencyPairValue(baseCurrency(deal), quoteCurrency(deal));
    }

    function activeCurrencyPairOrDefault() {
      return selectedCurrencyPair || "EUR/USD";
    }

    function currenciesFromPair(pair) {
      const parts = String(pair || "").split("/");
      const base = parts[0]?.trim().toUpperCase() || "EUR";
      const quote = parts[1]?.trim().toUpperCase() || "USD";

      return { base, quote, pair: currencyPairValue(base, quote) };
    }

    function pnlCash(deal) {
      const pnlMinor = deal?.analyticalPnlQuoteMinor;
      const fractionDigits = Number(deal?.analyticalPnlQuoteFractionDigits);

      if (Number.isSafeInteger(pnlMinor)
        && Number.isInteger(fractionDigits)
        && fractionDigits >= 0
        && fractionDigits <= 10) {
        return Number(minorToMajorDecimal(pnlMinor, fractionDigits));
      }

      return Number.isFinite(deal?.pnlCash) ? deal.pnlCash : null;
    }

    function todayLabel() {
      return new Intl.DateTimeFormat("ru-RU").format(new Date());
    }

    function parseDisplayDate(value) {
      const text = String(value || "").trim();
      const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
      const localMatch = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(text);

      if (isoMatch) {
        return new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
      }

      if (localMatch) {
        return new Date(Number(localMatch[3]), Number(localMatch[2]) - 1, Number(localMatch[1]));
      }

      return null;
    }

    function isValidDate(value) {
      return value instanceof Date && !Number.isNaN(value.getTime());
    }

    function formatDisplayDate(date) {
      return new Intl.DateTimeFormat("ru-RU").format(date);
    }

    function isWeekend(date) {
      return date.getDay() === 0 || date.getDay() === 6;
    }

    function addBusinessDays(date, days) {
      const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      let remaining = days;

      while (remaining > 0) {
        result.setDate(result.getDate() + 1);

        if (!isWeekend(result)) {
          remaining -= 1;
        }
      }

      return result;
    }

    function valueDateFromTradeDate(tradeDate, tenor) {
      const daysByTenor = { TOD: 0, TOM: 1, SPOT: 2 };
      const days = daysByTenor[tenor] ?? 0;

      return addBusinessDays(tradeDate, days);
    }

    function marketOfferFromBid(value) {
      return value === null || value === undefined ? null : value + 0.0050;
    }

    function marketBid(deal) {
      return deal.entryMarketBid;
    }

    function marketOffer(deal) {
      return deal.entryMarketOffer;
    }

    function positionIdSortValue(deal) {
      const id = String(deal.id || "");
      const match = /^deal-(\d+)$/.exec(id);

      if (match) {
        return `deal-${match[1].padStart(10, "0")}`;
      }

      return id.toLowerCase();
    }

    function sortedDeals(source) {
      if (!sortState.key) {
        return [...source];
      }

      const accessor = sortAccessors[sortState.key];

      if (!accessor) {
        return [...source];
      }

      const direction = sortState.direction === "desc" ? -1 : 1;

      return source
        .map((deal, index) => ({ deal, index, value: accessor(deal) }))
        .sort((left, right) => {
          const leftEmpty = left.value === null || left.value === undefined || Number.isNaN(left.value);
          const rightEmpty = right.value === null || right.value === undefined || Number.isNaN(right.value);

          if (leftEmpty && rightEmpty) {
            return left.index - right.index;
          }

          if (leftEmpty) {
            return 1;
          }

          if (rightEmpty) {
            return -1;
          }

          if (left.value === right.value) {
            return left.index - right.index;
          }

          if (typeof left.value === "number" && typeof right.value === "number") {
            return (left.value - right.value) * direction;
          }

          const order = String(left.value).localeCompare(String(right.value), undefined, { numeric: true });
          return order === 0 ? left.index - right.index : order * direction;
        })
        .map(item => item.deal);
    }

    function availableCurrencyPairs(source) {
      return Array.from(new Set(source.map(deal => currencyPair(deal)).filter(Boolean)))
        .sort((left, right) => left.localeCompare(right));
    }

    function ensureSelectedCurrencyPair(source) {
      const pairs = availableCurrencyPairs(source);
      const nextPair = pairs.includes(selectedCurrencyPair) ? selectedCurrencyPair : pairs[0] || "";

      if (nextPair !== selectedCurrencyPair) {
        selectedCurrencyPair = nextPair;
        selectedTradeIds.clear();
        saveSelectedCurrencyPair();
      }
    }

    function isActiveCurrencyPair(deal) {
      return !selectedCurrencyPair || currencyPair(deal) === selectedCurrencyPair;
    }

    function activeCurrencyPairRows(source) {
      return source.filter(isActiveCurrencyPair);
    }

    function fxPositionRowsForMode(source, mode = activeFxPositionMode) {
      const normalizedMode = normalizedPositionManagementMode(mode);
      return source.filter(deal => normalizedPositionManagementMode(
        deal?.currentFxPositionMode ?? deal?.fxPositionMode
      ) === normalizedMode);
    }

    function fxPositionModeCounts(source) {
      const pairRows = activeCurrencyPairRows(source);

      return Object.freeze({
        MANUAL: fxPositionRowsForMode(pairRows, "MANUAL").length,
        AUTO: fxPositionRowsForMode(pairRows, "AUTO").length
      });
    }

    function fxPositionTradeCountForPair(source, pair) {
      return source.filter(deal => currencyPair(deal) === pair).length;
    }

    function renderFxPositionModeTabs(source) {
      const counts = fxPositionModeCounts(source);
      fxPositionManualCount.textContent = String(counts.MANUAL);
      fxPositionAutoCount.textContent = String(counts.AUTO);

      fxPositionModeTabs.forEach(tab => {
        const active = tab.dataset.fxPositionMode === activeFxPositionMode;
        tab.classList.toggle("active", active);
        tab.setAttribute("aria-selected", String(active));
        tab.tabIndex = active ? 0 : -1;

        if (active) {
          fxPositionGridPanel.setAttribute("aria-labelledby", tab.id);
        }
      });
    }

    function renderCurrencyPairList(source) {
      const pairs = availableCurrencyPairs(source);

      if (pairs.length === 0) {
        currencyPairListEl.innerHTML = `<span class="currency-pair-empty">No pairs</span>`;
        return;
      }

      currencyPairListEl.innerHTML = pairs
        .map(pair => {
          const count = fxPositionTradeCountForPair(source, pair);
          const safePair = escapeHtml(pair);
          const active = pair === selectedCurrencyPair;
          const countLabel = escapeHtml(
            `Total: ${count} trade${count === 1 ? "" : "s"}`
          );

          return `
            <button type="button" class="btn btn-sm currency-pair-button${active ? " is-active" : ""}" data-currency-pair="${safePair}" aria-pressed="${active ? "true" : "false"}">
              <span class="currency-pair-name">${safePair}</span>
              <span class="currency-pair-count" title="${countLabel}">
                <span class="visually-hidden">Total trades: ${count}</span>
                <span aria-hidden="true">${count}</span>
              </span>
            </button>
          `;
        })
        .join("");
    }

    function setSelectedCurrencyPair(pair) {
      if (!pair || pair === selectedCurrencyPair) {
        return;
      }

      selectedCurrencyPair = pair;
      selectedTradeIds.clear();
      saveSelectedCurrencyPair();
      setBatchStatus("");
      render(fxPositions);
    }

    function currentDisplayRows() {
      return sortedDeals(activeCurrencyPairRows(fxPositionRowsForMode(fxPositions)));
    }

    function clearHiddenFxPositionSelection() {
      const visibleTradeIds = new Set(currentDisplayRows().map(deal => deal.id));

      selectedTradeIds.forEach(tradeId => {
        if (!visibleTradeIds.has(tradeId)) {
          selectedTradeIds.delete(tradeId);
        }
      });
    }

    function setActiveFxPositionMode(mode) {
      const nextMode = normalizedPositionManagementMode(mode);

      if (nextMode === activeFxPositionMode) {
        return false;
      }

      activeFxPositionMode = nextMode;
      closeSendToAutoPositionModeDialog();
      closeOneBatchTenorDialog({ restoreFocus: false });
      clearHiddenFxPositionSelection();
      setBatchStatus("");
      return true;
    }

    function handleFxPositionModeTabKeydown(event) {
      const currentIndex = fxPositionModeTabs.indexOf(event.currentTarget);
      let nextIndex = currentIndex;

      if (event.key === "ArrowLeft") {
        nextIndex = (currentIndex - 1 + fxPositionModeTabs.length) % fxPositionModeTabs.length;
      } else if (event.key === "ArrowRight") {
        nextIndex = (currentIndex + 1) % fxPositionModeTabs.length;
      } else if (event.key === "Home") {
        nextIndex = 0;
      } else if (event.key === "End") {
        nextIndex = fxPositionModeTabs.length - 1;
      } else {
        return;
      }

      event.preventDefault();
      fxPositionModeTabs[nextIndex]?.focus();
      fxPositionModeTabs[nextIndex]?.click();
    }

    function updateSortButtons() {
      sortButtons.forEach(button => {
        const active = button.dataset.sortKey === sortState.key;
        const indicator = active ? sortState.direction === "asc" ? "▲" : "▼" : "";

        button.dataset.sortIndicator = indicator;
        button.setAttribute("aria-pressed", active ? "true" : "false");
      });
    }

    function toggleSort(key) {
      if (sortState.key === key) {
        sortState.direction = sortState.direction === "asc" ? "desc" : "asc";
      } else {
        sortState.key = key;
        sortState.direction = "asc";
      }

      render(fxPositions);
    }

    function selectedEditableDeal() {
      const selectedRows = currentDisplayRows().filter(deal => selectedTradeIds.has(deal.id));

      if (
        selectedRows.length !== 1
        || selectedRows[0].synthetic
        || fxPositionType(selectedRows[0]) !== "CLIENT_DEAL"
        || selectedRows[0].databaseBackedClientFxDeal !== true
        || selectedRows[0].historicalBatchMember === true
      ) {
        return null;
      }

      return selectedRows[0];
    }

    function isBatchableFxPositionTrade(deal) {
      const tradeId = Number(fxPositionTradeId(deal));
      const transferRate = Number(fxPositionTransferRate(deal));

      return deal?.synthetic !== true
        && Number.isSafeInteger(tradeId)
        && tradeId > 0
        && ["buy", "sell"].includes(sideOf(deal))
        && Number.isFinite(transferRate)
        && transferRate > 0;
    }

    function selectedBatchSourceTrades() {
      return currentDisplayRows().filter(deal =>
        selectedTradeIds.has(deal.id) && isBatchableFxPositionTrade(deal)
      );
    }

    function isManualReviewTradeEligibleForAuto(deal) {
      const tradeType = fxPositionType(deal);
      const initialMode = normalizedPositionManagementMode(
        deal?.initialFxPositionMode,
        deal?.currentFxPositionMode ?? deal?.fxPositionMode
      );
      const currentMode = normalizedPositionManagementMode(
        deal?.currentFxPositionMode ?? deal?.fxPositionMode
      );

      return initialMode === "MANUAL"
        && currentMode === "MANUAL"
        && ["CLIENT_DEAL", "HEDGE_DEAL"].includes(tradeType)
        && isBatchableFxPositionTrade(deal);
    }

    function selectedManualReviewTradesForAuto() {
      if (activeFxPositionMode !== "MANUAL") {
        return [];
      }

      const selectedRows = currentDisplayRows().filter(deal =>
        selectedTradeIds.has(deal.id)
      );

      return selectedRows.length > 0
        && selectedRows.every(isManualReviewTradeEligibleForAuto)
        ? selectedRows
        : [];
    }

    function closeSendToAutoPositionModeDialog() {
      if (sendToAutoPositionModeInFlight) {
        return;
      }

      pendingSendToAutoTrades = [];
      sendToAutoPositionModeStatus.textContent = "";
      sendToAutoPositionModeStatus.hidden = true;
      sendToAutoPositionModeDialogClose.disabled = false;
      sendToAutoPositionModeCancelButton.disabled = false;
      sendToAutoPositionModeConfirmButton.disabled = false;

      if (typeof sendToAutoPositionModeDialog.close === "function") {
        sendToAutoPositionModeDialog.close();
      } else {
        sendToAutoPositionModeDialog.removeAttribute("open");
      }
    }

    function openSendToAutoPositionModeDialog() {
      if (!DEMO_API_ENABLED || sendToAutoPositionModeInFlight) {
        return;
      }

      const selectedTrades = selectedManualReviewTradesForAuto();

      if (selectedTrades.length === 0) {
        setBatchStatus(
          "Select one or more eligible Manual Review Client or Hedge Deals.",
          "warning"
        );
        return;
      }

      pendingSendToAutoTrades = selectedTrades.map(deal => Object.freeze({
        tradeId: Number(fxPositionTradeId(deal)),
        tradeType: fxPositionType(deal)
      }));
      const count = pendingSendToAutoTrades.length;
      sendToAutoPositionModeSummary.textContent =
        `Send ${count} selected FX Trade${count === 1 ? "" : "s"} to Auto Hedging?`;
      sendToAutoPositionModeStatus.textContent = "";
      sendToAutoPositionModeStatus.hidden = true;

      if (typeof sendToAutoPositionModeDialog.showModal === "function") {
        sendToAutoPositionModeDialog.showModal();
      } else {
        sendToAutoPositionModeDialog.setAttribute("open", "");
      }

      sendToAutoPositionModeCancelButton.focus();
    }

    async function confirmSendToAutoPositionMode() {
      if (
        sendToAutoPositionModeInFlight
        || pendingSendToAutoTrades.length === 0
      ) {
        return;
      }

      const submittedTrades = [...pendingSendToAutoTrades];
      const count = submittedTrades.length;
      sendToAutoPositionModeInFlight = true;
      sendToAutoPositionModeDialogClose.disabled = true;
      sendToAutoPositionModeCancelButton.disabled = true;
      sendToAutoPositionModeConfirmButton.disabled = true;
      sendToAutoPositionModeStatus.textContent =
        `Sending ${count} FX Trade${count === 1 ? "" : "s"} to Auto Hedging...`;
      sendToAutoPositionModeStatus.className =
        "alert alert-secondary batch-rollback-status mt-3 mb-0";
      sendToAutoPositionModeStatus.hidden = false;
      updateActionButtons();

      try {
        const result = await demoApiRequest(
          "/api/v1/fx-positions/send-to-auto-batching",
          {
            method: "POST",
            body: JSON.stringify({ trades: submittedTrades })
          }
        );

        submittedTrades.forEach(trade => {
          selectedTradeIds.delete(String(trade.tradeId));
        });
        await Promise.all([
          reloadClientFxDealsFromApi(),
          reloadHedgeFxDealsFromApi(),
          reloadFxPositionsFromApi()
        ]);
        renderClientFxDeals(clientFxDeals);
        renderHedgeFxDeals(hedgeFxDeals);
        render(fxPositions);
        sendToAutoPositionModeInFlight = false;
        closeSendToAutoPositionModeDialog();

        const replayedCount = Number(result?.replayedCount || 0);
        setBatchStatus(
          `${count} FX Trade${count === 1 ? " is" : "s are"} now in Auto Hedging.`
          + (replayedCount > 0
            ? ` ${replayedCount} already had the requested Current Mode.`
            : ""),
          "success"
        );
      } catch (error) {
        const message = error.message
          || "Unable to send selected FX Trades to Auto Hedging.";
        sendToAutoPositionModeStatus.textContent = message;
        sendToAutoPositionModeStatus.className =
          "alert alert-danger batch-rollback-status mt-3 mb-0";
        sendToAutoPositionModeStatus.hidden = false;
        setBatchStatus(message, "error");
      } finally {
        sendToAutoPositionModeInFlight = false;
        sendToAutoPositionModeDialogClose.disabled = false;
        sendToAutoPositionModeCancelButton.disabled = false;
        sendToAutoPositionModeConfirmButton.disabled = false;
        updateActionButtons();
      }
    }

    function oneBatchCompatibilityKey(deal) {
      return JSON.stringify([
        String(deal?.ccyPairCode || currencyPair(deal) || "").trim().toUpperCase(),
        String(baseCurrency(deal) || "").trim().toUpperCase(),
        String(quoteCurrency(deal) || "").trim().toUpperCase(),
        fxPositionBaseCcyFractionDigits(deal),
        fxPositionQuoteCcyFractionDigits(deal),
        String(positionTradeDate(deal) || "").trim(),
        String(positionTenor(deal) || "").trim().toUpperCase(),
        String(baseCurrencyValueDate(deal) || "").trim(),
        String(quoteCurrencyValueDate(deal) || "").trim()
      ]);
    }

    function oneBatchCompatibilityGroups(sourceDeals) {
      const groups = new Map();
      const tenorOrder = new Map([["TOD", 0], ["TOM", 1], ["SPOT", 2]]);

      sourceDeals.forEach(deal => {
        const key = oneBatchCompatibilityKey(deal);
        const tenor = String(positionTenor(deal) || "").trim().toUpperCase();

        if (!groups.has(key)) {
          groups.set(key, {
            key,
            pair: currencyPair(deal),
            tradeDate: positionTradeDate(deal),
            tenor,
            baseValueDate: baseCurrencyValueDate(deal),
            quoteValueDate: quoteCurrencyValueDate(deal),
            deals: []
          });
        }

        groups.get(key).deals.push(deal);
      });

      return Array.from(groups.values())
        .sort((left, right) => {
          const leftOrder = tenorOrder.get(left.tenor) ?? Number.MAX_SAFE_INTEGER;
          const rightOrder = tenorOrder.get(right.tenor) ?? Number.MAX_SAFE_INTEGER;

          return leftOrder - rightOrder
            || left.tenor.localeCompare(right.tenor)
            || left.key.localeCompare(right.key);
        });
    }

    function oneBatchCompatibilityGroupLabel(group) {
      const pair = group.pair || "Pair not set";
      const tenor = group.tenor || "Tenor not set";
      const tradeDate = group.tradeDate || "not set";
      const valueDates = group.baseValueDate === group.quoteValueDate
        ? group.baseValueDate || "not set"
        : `${group.baseValueDate || "not set"} / ${group.quoteValueDate || "not set"}`;

      return `${pair} · ${tenor} · Trade ${tradeDate} · Value ${valueDates}`;
    }

    function setOneBatchTenorDialogBusy(busy) {
      oneBatchTenorDialogClose.disabled = busy;
      oneBatchTenorCancelButton.disabled = busy;
      oneBatchSelectedTenorButton.disabled = busy;
      oneBatchTenorSelect.disabled = busy;
    }

    function setOneBatchTenorStatus(message = "") {
      oneBatchTenorStatus.textContent = message;
      oneBatchTenorStatus.hidden = !message;
    }

    function updateOneBatchSelectedTenorButton() {
      oneBatchSelectedTenorButton.textContent = oneBatchTenorSelect.value
        ? "Create Selected Batch"
        : "Select a Compatible Group";
    }

    function openOneBatchTenorDialog(sourceDeals) {
      const groups = oneBatchCompatibilityGroups(sourceDeals);
      pendingOneBatchTenorSelection = [...sourceDeals];
      oneBatchTenorSummary.replaceChildren();
      oneBatchTenorSelect.replaceChildren();
      setOneBatchTenorStatus();
      setOneBatchTenorDialogBusy(false);

      groups.forEach(group => {
        const groupLabel = oneBatchCompatibilityGroupLabel(group);
        const summaryItem = document.createElement("li");
        const option = document.createElement("option");
        const tradeLabel = group.deals.length === 1 ? "trade" : "trades";

        summaryItem.className = "one-batch-tenor-summary-item";
        summaryItem.innerHTML = `<strong>${escapeHtml(groupLabel)}</strong><span class="one-batch-tenor-count">${group.deals.length} ${tradeLabel}</span>`;
        oneBatchTenorSummary.append(summaryItem);
        option.value = group.key;
        option.textContent = `${groupLabel} — ${group.deals.length} ${tradeLabel}`;
        oneBatchTenorSelect.append(option);
      });

      updateOneBatchSelectedTenorButton();

      if (typeof oneBatchTenorDialog.showModal === "function") {
        oneBatchTenorDialog.showModal();
      } else {
        oneBatchTenorDialog.setAttribute("open", "");
      }

      oneBatchTenorSelect.focus();
    }

    function closeOneBatchTenorDialog({ restoreFocus = true } = {}) {
      if (oneBatchInFlight) {
        return;
      }

      if (oneBatchTenorDialog.open) {
        if (typeof oneBatchTenorDialog.close === "function") {
          oneBatchTenorDialog.close();
        } else {
          oneBatchTenorDialog.removeAttribute("open");
        }
      }

      pendingOneBatchTenorSelection = null;
      setOneBatchTenorStatus();

      if (restoreFocus) {
        oneBatchButton.focus();
      }
    }

    async function submitOneBatchSelection(sourceDeals) {
      const tradeIds = sourceDeals
        .map(deal => Number(fxPositionTradeId(deal)))
        .sort((left, right) => left - right);
      const submittedDealIds = sourceDeals.map(deal => deal.id);
      const selectionKey = tradeIds.join(",");

      if (pendingOneBatchRequest?.selectionKey !== selectionKey) {
        pendingOneBatchRequest = {
          idempotencyKey: crypto.randomUUID(),
          selectionKey
        };
      }

      const batchRequest = pendingOneBatchRequest;
      oneBatchInFlight = true;
      setOneBatchTenorDialogBusy(true);
      updateActionButtons();
      setBatchStatus(
        `Forming FX Batch from ${tradeIds.length} selected trade${tradeIds.length === 1 ? "" : "s"}...`
      );

      try {
        const result = await demoApiRequest(
          "/api/v1/fx-batches",
          {
            method: "POST",
            headers: {
              "Idempotency-Key": batchRequest.idempotencyKey
            },
            body: JSON.stringify({ tradeIds })
          }
        );
        await reloadFxPositionsFromApi();

        if (pendingOneBatchRequest === batchRequest) {
          pendingOneBatchRequest = null;
        }

        submittedDealIds.forEach(dealId => selectedTradeIds.delete(dealId));
        oneBatchInFlight = false;
        closeOneBatchTenorDialog({ restoreFocus: false });
        render(fxPositions);

        setBatchStatus(
          `FX Batch ${result.batchId} was formed successfully from `
            + `${tradeIds.length} selected trade${tradeIds.length === 1 ? "" : "s"}.`,
          "success"
        );
      } catch (error) {
        const message = error.message || "Unable to form FX Batch.";
        setBatchStatus(message, "error");

        if (oneBatchTenorDialog.open) {
          setOneBatchTenorStatus(message);
        }
      } finally {
        oneBatchInFlight = false;
        setOneBatchTenorDialogBusy(false);
        updateActionButtons();
      }
    }

    async function formOneBatchFromSelection() {
      if (oneBatchInFlight) {
        return;
      }

      const sourceDeals = selectedBatchSourceTrades();

      if (sourceDeals.length === 0) {
        setBatchStatus(
          "Select one or more eligible FX Trades.",
          "warning"
        );
        return;
      }

      if (
        oneBatchCompatibilityGroups(sourceDeals).length > 1
      ) {
        openOneBatchTenorDialog(sourceDeals);
        return;
      }

      await submitOneBatchSelection(sourceDeals);
    }

    function hasVisibleSelection() {
      return currentDisplayRows().some(deal => selectedTradeIds.has(deal.id));
    }

    function createDealId() {
      const maxDealNumber = fxPositions.reduce((max, deal) => {
        const match = /^(?:deal-)?(\d+)$/.exec(deal.id || "");
        return match ? Math.max(max, Number(match[1])) : max;
      }, 0);

      return String(maxDealNumber + 1);
    }

    function roundRate(value, decimals = DEFAULT_QUOTE_DECIMALS) {
      return Number(value.toFixed(normalizedDefaultQuoteDecimals(decimals)));
    }

    function exactTransferRateTextFromPricingRule(
      side,
      clientRate,
      marginPercent,
      decimals = DEFAULT_QUOTE_DECIMALS
    ) {
      const clientRateText = positiveDecimalInputText(clientRate);
      const marginText = normalizedDecimalInputText(marginPercent);
      const fractionDigits = normalizedDefaultQuoteDecimals(decimals);

      if ((side !== "sell" && side !== "buy") || !clientRateText || marginText === null) {
        return null;
      }

      const margin = new Big(marginText);

      if (margin.lt(0) || margin.gte(100)) {
        return null;
      }

      const marginFactor = margin.div(100);
      const clientRateFactor = side === "sell"
        ? new Big(1).minus(marginFactor)
        : new Big(1).plus(marginFactor);

      if (clientRateFactor.lte(0)) {
        return null;
      }

      return new Big(clientRateText)
        .div(clientRateFactor)
        .round(fractionDigits, Big.roundHalfUp)
        .toFixed(fractionDigits);
    }

    function transferRateFromPricingRule(side, clientRate, marginPercent, decimals = DEFAULT_QUOTE_DECIMALS) {
      const value = exactTransferRateTextFromPricingRule(
        side,
        clientRate,
        marginPercent,
        decimals
      );

      return value === null ? null : Number(value);
    }

    async function generateClientDeal() {
      generateClientDealButton.disabled = true;
      setBatchStatus("Generating Client FX Deal...");
      try {
        const deal = await demoApiRequest(
          "/api/v1/client-deal-generation/one",
          { method: "POST" }
        );
        await refreshClientDealViewsFromApi();
        render(fxPositions);
        setBatchStatus(
          `${String(deal.side || "").toUpperCase()} Client FX Deal ${deal.tradeId} `
            + "was generated successfully.",
          "success"
        );
      } catch (error) {
        setBatchStatus(error.message || "Unable to save the generated Client FX Deal.", "error");
      } finally {
        generateClientDealButton.disabled = false;
      }
    }

    async function refreshClientDealGenerationViews() {
      if (clientDealGenerationRefreshInFlight) {
        return;
      }

      clientDealGenerationRefreshInFlight = true;

      try {
        const [processState] = await Promise.all([
          demoApiRequest("/api/v1/client-deal-generation/process"),
          refreshClientDealViewsFromApi()
        ]);
        applyClientDealGenerationProcessState(processState);
        render(fxPositions);

        if (processState.lastError) {
          setBatchStatus(processState.lastError, "error");
        }
      } catch (error) {
        setBatchStatus(error.message || "Unable to refresh Deal Generating process.", "error");
      } finally {
        clientDealGenerationRefreshInFlight = false;
      }
    }

    function applyClientDealGenerationProcessState(state) {
      clientDealGenerationProcessState = {
        ...clientDealGenerationProcessState,
        ...(state && typeof state === "object" ? state : {})
      };
      const running = clientDealGenerationProcessState.running === true;

      runClientDealGenerationButton.classList.toggle("is-running", running);
      runClientDealGenerationButton.setAttribute("aria-pressed", String(running));
      runClientDealGenerationButton.setAttribute(
        "aria-label",
        running ? "Stop automatic Deal Generation" : "Start automatic Deal Generation"
      );
      runClientDealGenerationIcon.textContent = running ? "stop" : "play_arrow";
      runClientDealGenerationLabel.textContent = running ? "Stop Generation" : "Auto Generate";

      if (running && clientDealGenerationRefreshTimer === null) {
        clientDealGenerationRefreshTimer = window.setInterval(() => {
          void refreshClientDealGenerationViews();
        }, CLIENT_DEAL_GENERATION_REFRESH_INTERVAL_MS);
      } else if (!running && clientDealGenerationRefreshTimer !== null) {
        window.clearInterval(clientDealGenerationRefreshTimer);
        clientDealGenerationRefreshTimer = null;
      }
    }

    async function toggleClientDealGenerationProcess() {
      const running = clientDealGenerationProcessState.running === true;
      const endpoint = running
        ? "/api/v1/client-deal-generation/process/stop"
        : "/api/v1/client-deal-generation/process/start";

      runClientDealGenerationButton.disabled = true;

      try {
        const state = await demoApiRequest(endpoint, { method: "POST" });
        applyClientDealGenerationProcessState(state);
        await refreshClientDealViewsFromApi();
        render(fxPositions);

        if (state.lastError) {
          setBatchStatus(state.lastError, "error");
        } else {
          const minIntervalSeconds =
            Number(state.minIntervalMs) / 1000;
          const maxIntervalSeconds =
            Number(state.maxIntervalMs) / 1000;
          setBatchStatus(
            state.running
              ? `Automatic deal generation started. ${
                  state.minDealsPerCycle
                }-${state.maxDealsPerCycle} Client FX Deals will be generated every ${
                  minIntervalSeconds
                }-${maxIntervalSeconds} seconds.`
              : "Automatic deal generation was stopped successfully.",
            "success"
          );
        }
      } catch (error) {
        setBatchStatus(error.message || "Unable to change Deal Generating process.", "error");
      } finally {
        runClientDealGenerationButton.disabled = false;
      }
    }

    async function connectClientDealGenerationProcess() {
      if (!DEMO_API_ENABLED) {
        generateClientDealButton.disabled = true;
        runClientDealGenerationButton.disabled = true;
        resetDemoTradesButton.disabled = true;
        return;
      }

      try {
        const state = await demoApiRequest("/api/v1/client-deal-generation/process");
        applyClientDealGenerationProcessState(state);
      } catch (error) {
        setBatchStatus(error.message || "Unable to read Deal Generating process status.", "error");
      }
    }

    function applyFxAutoBatchingProcessState(state) {
      fxAutoBatchingProcessState = {
        ...fxAutoBatchingProcessState,
        ...(state && typeof state === "object" ? state : {})
      };
      const running = fxAutoBatchingProcessState.running === true;

      autoBatchButton.classList.toggle("is-running", running);
      autoBatchButton.setAttribute("aria-pressed", String(running));
      autoBatchButton.setAttribute(
        "aria-label",
        running ? "Stop Auto Batching" : "Start Auto Batching"
      );
      autoBatchIcon.textContent = running ? "stop" : "play_arrow";
      autoBatchLabel.textContent = running ? "Stop Auto Batch" : "Auto Batch";
      autoBatchButton.disabled = !DEMO_API_ENABLED || fxAutoBatchingToggleInFlight;

      if (running && fxAutoBatchingRefreshTimer === null) {
        fxAutoBatchingRefreshTimer = window.setInterval(() => {
          void refreshFxAutoBatchingProcess();
        }, FX_AUTO_BATCHING_REFRESH_INTERVAL_MS);
      } else if (!running && fxAutoBatchingRefreshTimer !== null) {
        window.clearInterval(fxAutoBatchingRefreshTimer);
        fxAutoBatchingRefreshTimer = null;
      }
    }

    async function refreshFxAutoBatchingProcess() {
      if (fxAutoBatchingRefreshInFlight) {
        return;
      }

      fxAutoBatchingRefreshInFlight = true;
      const previousBatchId = Number(fxAutoBatchingProcessState.lastFormedBatchId) || null;

      try {
        const state = await demoApiRequest("/api/v1/fx-auto-batching/process");
        applyFxAutoBatchingProcessState(state);
        const nextBatchId = Number(state.lastFormedBatchId) || null;

        if (nextBatchId !== null && nextBatchId !== previousBatchId) {
          await Promise.all([
            reloadFxPositionsFromApi(),
            reloadFxBatchesFromApi()
          ]);
          render(fxPositions);
          const tradeCount = Number(state.lastCandidateTradeCount) || 0;
          const pairCount = Number(state.lastCandidatePairCount) || 0;
          const batchCount = Number(state.lastCycleBatchCount) || 1;
          const successMessage = batchCount === 1
            ? `FX Batch ${nextBatchId} was formed automatically from ${tradeCount} trade${
                tradeCount === 1 ? "" : "s"
              }.`
            : `${batchCount} FX Batches were formed automatically for ${pairCount} Ccy Pairs from ${
                tradeCount
              } trades.`;
          setBatchStatus(
            state.lastError ? `${successMessage} ${state.lastError}` : successMessage,
            state.lastError ? "error" : "success"
          );
        } else if (state.lastError) {
          setBatchStatus(state.lastError, "error");
        }
      } catch (error) {
        setBatchStatus(error.message || "Unable to refresh Auto Batching process.", "error");
      } finally {
        fxAutoBatchingRefreshInFlight = false;
      }
    }

    async function toggleFxAutoBatchingProcess() {
      const running = fxAutoBatchingProcessState.running === true;
      const endpoint = running
        ? "/api/v1/fx-auto-batching/process/stop"
        : "/api/v1/fx-auto-batching/process/start";

      fxAutoBatchingToggleInFlight = true;
      autoBatchButton.disabled = true;

      try {
        const state = await demoApiRequest(endpoint, { method: "POST" });
        applyFxAutoBatchingProcessState(state);
        const intervalSeconds = Number(state.intervalMs) / 1000;
        setBatchStatus(
          state.running
            ? `Auto Batching started and is waiting for the first new Trade. Existing FX Position trades are unchanged. Each opened Batching Window has a ${intervalSeconds}-second maximum interval.`
            : "Auto Batching stopped. Open Batching Windows, when present, were cancelled; their Trades remain in FX Position.",
          "success"
        );
      } catch (error) {
        setBatchStatus(error.message || "Unable to change Auto Batching process.", "error");
      } finally {
        fxAutoBatchingToggleInFlight = false;
        applyFxAutoBatchingProcessState(fxAutoBatchingProcessState);
      }
    }

    async function connectFxAutoBatchingProcess() {
      if (!DEMO_API_ENABLED) {
        autoBatchButton.disabled = true;
        return;
      }

      try {
        const state = await demoApiRequest("/api/v1/fx-auto-batching/process");
        applyFxAutoBatchingProcessState(state);
      } catch (error) {
        autoBatchButton.disabled = true;
        setBatchStatus(error.message || "Unable to read Auto Batching process status.", "error");
      }
    }

    function closeResetDemoTradesDialog() {
      resetDemoTradesStatus.textContent = "";
      resetDemoTradesStatus.className = "alert alert-danger batch-rollback-status";
      resetDemoTradesStatus.hidden = true;
      resetDemoTradesConfirmButton.disabled = false;
      resetDemoTradesCancelButton.disabled = false;

      if (typeof resetDemoTradesDialog.close === "function") {
        resetDemoTradesDialog.close();
      } else {
        resetDemoTradesDialog.removeAttribute("open");
      }
    }

    function openResetDemoTradesDialog() {
      if (!DEMO_API_ENABLED) {
        setBatchStatus("SQLite API is unavailable. Demo Trades cannot be reset.", "error");
        return;
      }

      setBatchStatus("");
      resetDemoTradesStatus.textContent = "";
      resetDemoTradesStatus.className = "alert alert-danger batch-rollback-status";
      resetDemoTradesStatus.hidden = true;

      if (typeof resetDemoTradesDialog.showModal === "function") {
        resetDemoTradesDialog.showModal();
      } else {
        resetDemoTradesDialog.setAttribute("open", "");
      }

      resetDemoTradesCancelButton.focus();
    }

    async function confirmResetDemoTradeWorkspace() {
      resetDemoTradesButton.disabled = true;
      resetDemoTradesConfirmButton.disabled = true;
      resetDemoTradesCancelButton.disabled = true;
      resetDemoTradesStatus.textContent = "Resetting Demo Trades and FX Batches...";
      resetDemoTradesStatus.className = "alert alert-secondary batch-rollback-status";
      resetDemoTradesStatus.hidden = false;
      setBatchStatus("Resetting Demo Trades and FX Batches...");

      try {
        const result = await demoApiRequest(
          "/api/v1/demo/trades/reset",
          {
            method: "POST",
            body: JSON.stringify({ confirmation: "RESET_ALL_TRADES" })
          }
        );

        applyClientDealGenerationProcessState(result.generationProcess);
        applyFxAutoBatchingProcessState(result.autoBatchingProcess);
        selectedTradeIds.clear();

        await Promise.all([
          reloadClientFxDealsFromApi(),
          reloadHedgeFxDealsFromApi(),
          reloadFxBatchesFromApi()
        ]);
        await reloadFxPositionsFromApi();

        renderClientFxDeals(clientFxDeals);
        renderHedgeFxDeals(hedgeFxDeals);
        render(fxPositions);

        const removedTrades = Number(result.removed?.trades || 0);
        const removedBatches = Number(result.removed?.batches || 0);
        closeResetDemoTradesDialog();
        setBatchStatus(
          `Demo workspace was reset successfully: ${removedTrades} trade${removedTrades === 1 ? "" : "s"} `
          + `and ${removedBatches} FX batch${removedBatches === 1 ? "" : "es"} were removed.`,
          "success"
        );
      } catch (error) {
        const message = error.message || "Unable to reset Demo Trades.";
        resetDemoTradesStatus.textContent = message;
        resetDemoTradesStatus.className = "alert alert-danger batch-rollback-status";
        resetDemoTradesStatus.hidden = false;
        resetDemoTradesConfirmButton.disabled = false;
        resetDemoTradesCancelButton.disabled = false;
        setBatchStatus(message, "error");
      } finally {
        resetDemoTradesButton.disabled = false;
        updateActionButtons();
      }
    }

    function updateActionButtons() {
      editDealButton.disabled = selectedEditableDeal() === null;

      const manualReviewTrades = selectedManualReviewTradesForAuto();
      sendToAutoPositionModeButton.hidden = activeFxPositionMode !== "MANUAL";
      sendToAutoPositionModeButton.disabled =
        !DEMO_API_ENABLED
        || sendToAutoPositionModeInFlight
        || manualReviewTrades.length === 0;

      oneBatchButton.disabled =
        !DEMO_API_ENABLED
        || oneBatchInFlight
        || selectedBatchSourceTrades().length === 0;

      autoBatchButton.disabled = !DEMO_API_ENABLED || fxAutoBatchingToggleInFlight;
    }

    function updateSelectAllCheckboxes(rows) {
      selectAllCheckboxes.forEach(checkbox => {
        const side = checkbox.dataset.selectSide;
        const sideRows = rows.filter(deal =>
          sideOf(deal) === side && isBatchableFxPositionTrade(deal)
        );
        const selectedRows = sideRows.filter(deal => selectedTradeIds.has(deal.id));

        checkbox.disabled = sideRows.length === 0;
        checkbox.checked = sideRows.length > 0 && selectedRows.length === sideRows.length;
        checkbox.indeterminate = selectedRows.length > 0 && selectedRows.length < sideRows.length;
      });
    }

    function toggleSideSelection(side, checked) {
      currentDisplayRows()
        .filter(deal => sideOf(deal) === side && isBatchableFxPositionTrade(deal))
        .forEach(deal => {
          if (checked) {
            selectedTradeIds.add(deal.id);
          } else {
            selectedTradeIds.delete(deal.id);
          }
        });

      setBatchStatus("");
      render(fxPositions);
    }

    function toggleSideSelectionByShortcut(side) {
      const sideRows = currentDisplayRows().filter(deal =>
        sideOf(deal) === side && isBatchableFxPositionTrade(deal)
      );

      if (sideRows.length === 0) {
        return;
      }

      const allSelected = sideRows.every(deal => selectedTradeIds.has(deal.id));
      toggleSideSelection(side, !allSelected);
    }

    function isTextEntryTarget(target) {
      return target instanceof Element && Boolean(
        target.closest("input:not([type='checkbox']), textarea, select, [contenteditable='true']")
      );
    }

    function handleSelectionShortcut(event) {
      if (
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        mainPage.hidden ||
        Boolean(document.querySelector("dialog[open]")) ||
        isTextEntryTarget(event.target)
      ) {
        return;
      }

      const key = event.key.toLowerCase();

      if (key === "b" || key === "\u0438") {
        event.preventDefault();
        toggleSideSelectionByShortcut("buy");
      }

      if (key === "s" || key === "\u044b") {
        event.preventDefault();
        toggleSideSelectionByShortcut("sell");
      }

      if (key === "g" || key === "\u043f") {
        event.preventDefault();

        if (!oneBatchButton.disabled) {
          oneBatchButton.click();
        }
      }
    }

    function findFxPositionById(dealId) {
      const normalizedDealId = String(dealId ?? "");

      return fxPositions.find(deal => String(deal.id ?? "") === normalizedDealId) || null;
    }

    function clearFormValidity() {
      Array.from(editForm.elements).forEach(element => {
        if (typeof element.setCustomValidity === "function") {
          element.setCustomValidity("");
        }
      });
    }

    function dealClientSelectProfiles(selectedName = "", selectedInnValue = "") {
      const availableProfiles = clientDealProfiles();
      const selectedInn = normalizedInn(selectedInnValue, "");
      const selectedProfile =
        availableProfiles.find(profile => profile.name === selectedName) ||
        availableProfiles.find(profile => profile.inn === selectedInn) ||
        null;

      if (selectedProfile || !selectedName || availableProfiles.some(profile => profile.name === selectedName)) {
        return availableProfiles;
      }

      const fallbackProfile = clientProfileByInn(selectedInn) || clientProfileByName(selectedName);
      const fallbackInn = selectedInn || innForClientName(selectedName);

      return [{
        name: selectedName,
        inn: fallbackInn,
        clientCodeType: normalizedClientCodeType(fallbackProfile?.clientCodeType)
      }, ...availableProfiles];
    }

    function populateDealClientOptions(selectedName = "", selectedInnValue = "") {
      const options = dealClientSelectProfiles(selectedName, selectedInnValue);
      const selectedInn = String(selectedInnValue || "").trim();
      const selectedProfile =
        options.find(profile => profile.name === selectedName) ||
        options.find(profile => profile.inn === selectedInn) ||
        options[0] ||
        null;

      editForm.elements.clientCode.innerHTML = options
        .map(profile => `<option value="${escapeHtml(profile.inn)}">${escapeHtml(profile.inn)}</option>`)
        .join("");
      editForm.elements.clientName.innerHTML = options
        .map(profile => `<option value="${escapeHtml(profile.name)}">${escapeHtml(profile.name)}</option>`)
        .join("");

      editForm.elements.clientCode.value = selectedProfile?.inn || "";
      editForm.elements.clientName.value = selectedProfile?.name || "";
    }

    function clientProfileByName(name) {
      const clientName = String(name || "").trim();

      return clientProfiles.find(profile => profile.name === clientName) || null;
    }

    function selectedDealClientProfile() {
      const inn = editForm.elements.clientCode.value.trim();
      const clientName = editForm.elements.clientName.value.trim();
      const profileByInn = inn ? clientProfileByInn(inn) : null;
      const profileByName = clientName ? clientProfileByName(clientName) : null;

      if (profileByInn && profileByName && profileByInn.inn !== profileByName.inn) {
        return null;
      }

      return profileByInn || profileByName || null;
    }

    function syncDealClientContext(sourceElement = null) {
      const innInput = editForm.elements.clientCode;
      const clientNameInput = editForm.elements.clientName;
      const sourceName = sourceElement?.name || "";

      innInput.setCustomValidity("");
      clientNameInput.setCustomValidity("");

      if (sourceName === "clientCode") {
        const profile = clientProfileByInn(innInput.value.trim());

        if (profile) {
          clientNameInput.value = profile.name;
        }

        return;
      }

      if (sourceName === "clientName") {
        const profile = clientProfileByName(clientNameInput.value);

        if (profile) {
          innInput.value = profile.inn;
        }

        return;
      }

      const profile = selectedDealClientProfile();

      if (profile) {
        innInput.value = profile.inn;
        clientNameInput.value = profile.name;
      }

    }

    function dealPricingRuleControl() {
      return editForm.elements.pricingRuleId;
    }

    function selectedDealCurrencyPair() {
      return normalizedPricingRuleCurrencyPair(editForm.elements.currencyPair.value);
    }

    function isHedgeDealPricingRule(rule, pricingMode) {
      const rulePricingMode = pricingModeForRule(rule);
      const requestedPricingMode = String(pricingMode || "").trim().toUpperCase();

      return HEDGE_DEAL_PRICING_MODES.includes(requestedPricingMode)
        && rulePricingMode === requestedPricingMode;
    }

    function selectedAddHedgeDealPricingMode() {
      const pricingMode = String(addHedgeDealPricingModeControl.value || "")
        .trim()
        .toUpperCase();

      return HEDGE_DEAL_PRICING_MODES.includes(pricingMode) ? pricingMode : "";
    }

    function syncAddHedgeDealPricingModeIcon() {
      const presentation = pricingTypePresentation(selectedAddHedgeDealPricingMode());

      addHedgeDealPricingModeIcon.classList.remove(
        "is-auto-priced",
        "is-dealer-priced",
        "is-dealer-approved",
        "is-manual-pricing"
      );
      addHedgeDealPricingModeIcon.classList.add(`is-${presentation.tone}`);
      addHedgeDealPricingModeIcon.setAttribute("aria-label", presentation.label);
      addHedgeDealPricingModeIcon.removeAttribute("title");
      addHedgeDealPricingModeIcon.removeAttribute("data-tooltip");
      addHedgeDealPricingModeIcon.querySelector(".button-icon").textContent =
        presentation.icon;
    }

    function selectedAddClientDealProfile() {
      const counterpartyId = Number(addClientDealForm.elements.counterpartyId.value);

      return clientDealProfiles().find(profile => Number(profile.counterpartyId) === counterpartyId) || null;
    }

    function selectedAddClientDealCurrencyPair() {
      return normalizedPricingRuleCurrencyPair(addClientDealForm.elements.currencyPair.value);
    }

    function selectedAddClientDealPricingMode() {
      const pricingMode = String(addClientDealPricingModeControl.value || "")
        .trim()
        .toUpperCase();

      return pricingMode === "DEALER_PRICED" ? pricingMode : "";
    }

    function addClientDealPricingRules() {
      const profile = selectedAddClientDealProfile();
      const pair = selectedAddClientDealCurrencyPair();
      const pricingMode = selectedAddClientDealPricingMode();

      if (!profile || !pair || !pricingMode) {
        return [];
      }

      return clientPricingRules
        .filter(rule => tradingCounterpartyHasRole(rule, "CLIENT"))
        .filter(rule => pricingModeForRule(rule) === pricingMode)
        .filter(rule => Number(rule.counterpartyId) === Number(profile.counterpartyId))
        .filter(rule => normalizedPricingRuleCurrencyPair(rule.currencyPair) === pair)
        .sort((left, right) => Number(left.pricingRuleId) - Number(right.pricingRuleId));
    }

    function selectedAddClientDealPricingRule() {
      const pricingRuleId = String(addClientDealForm.elements.pricingRuleId.value || "");

      return addClientDealPricingRules()
        .find(rule => String(rule.pricingRuleId) === pricingRuleId) || null;
    }

    function selectedAddClientDealExecutionContext() {
      return pricingContextById(addClientDealForm.elements.executionContextId.value);
    }

    function isAddClientDealOnboardingPricing() {
      return addClientDealForm.elements.manualPricingReason.value
        === CLIENT_ONBOARDING_MANUAL_PRICING;
    }

    function addClientDealProfileIdentityMarkup(profile) {
      return `
        <span class="client-deal-client-identity">
          <span class="client-deal-client-inn">${escapeHtml(profile.clientCodeType)}: ${escapeHtml(profile.inn)}</span>
          <span class="client-deal-client-name">${escapeHtml(profile.name)}</span>
        </span>
      `;
    }

    function setAddClientDealClientPickerExpanded(expanded) {
      const isExpanded = Boolean(expanded);
      addClientDealClientPickerToggle.setAttribute("aria-expanded", String(isExpanded));
      addClientDealClientPickerValue.setAttribute("aria-expanded", String(isExpanded));
      addClientDealClientOptions.hidden = !isExpanded;
    }

    function syncAddClientDealClientClearAvailability() {
      addClientDealClientPickerClear.hidden = addClientDealClientPickerValue.value.length === 0;
    }

    function sortedAddClientDealProfiles() {
      return [...clientDealProfiles()].sort((left, right) =>
        left.name.localeCompare(right.name) || String(left.inn).localeCompare(String(right.inn))
      );
    }

    function renderAddClientDealProfileOptions(searchText = "", selectedCounterpartyId = addClientDealForm.elements.counterpartyId.value) {
      const profiles = sortedAddClientDealProfiles();
      const searchTerms = String(searchText || "")
        .trim()
        .toLocaleLowerCase()
        .split(/\s+/)
        .filter(Boolean);
      const matchingProfiles = profiles.filter(profile => {
        const searchableText = [
          profile.name,
          profile.clientCodeType,
          profile.inn
        ].join(" ").toLocaleLowerCase();

        return searchTerms.every(term => searchableText.includes(term));
      });
      const selectedId = String(selectedCounterpartyId || "");

      addClientDealClientOptions.innerHTML = matchingProfiles.length > 0
        ? matchingProfiles.map(profile => {
            const selected = String(profile.counterpartyId) === selectedId;
            return `
              <button type="button" class="client-deal-client-option${selected ? " is-selected" : ""}" data-add-client-deal-counterparty-id="${escapeHtml(profile.counterpartyId)}" role="option" aria-selected="${selected}">
                ${addClientDealProfileIdentityMarkup(profile)}
              </button>
            `;
          }).join("")
        : `<div class="client-deal-context-picker-empty">${
            profiles.length > 0
              ? "No clients match the entered name."
              : "No active clients are available."
          }</div>`;
    }

    function renderAddClientDealProfiles(selectedCounterpartyId = addClientDealForm.elements.counterpartyId.value) {
      const control = addClientDealForm.elements.counterpartyId;
      const profiles = sortedAddClientDealProfiles();
      const selectedId = String(selectedCounterpartyId || "");
      const selectedProfile = profiles.find(profile => String(profile.counterpartyId) === selectedId) || null;

      control.value = selectedProfile?.counterpartyId || "";
      addClientDealClientPickerValue.value = selectedProfile?.name || "";
      syncAddClientDealClientClearAvailability();
      renderAddClientDealProfileOptions("", control.value);
      setAddClientDealClientPickerExpanded(false);
    }

    function handleAddClientDealClientPicker(event) {
      const option = event.target.closest("[data-add-client-deal-counterparty-id]");

      if (option) {
        addClientDealClientPicker.classList.remove("is-invalid");
        renderAddClientDealProfiles(option.dataset.addClientDealCounterpartyId);
        syncAddClientDealScope();
        addClientDealClientPickerValue.focus();
        return;
      }

      if (event.target.closest("#addClientDealClientPickerClear")) {
        addClientDealForm.elements.counterpartyId.value = "";
        addClientDealClientPickerValue.value = "";
        addClientDealClientPicker.classList.remove("is-invalid");
        syncAddClientDealClientClearAvailability();
        renderAddClientDealProfileOptions();
        setAddClientDealClientPickerExpanded(true);
        syncAddClientDealScope();
        addClientDealClientPickerValue.focus();
        return;
      }

      if (event.target.closest("#addClientDealClientPickerToggle")) {
        const willExpand = addClientDealClientPickerToggle.getAttribute("aria-expanded") !== "true";

        if (willExpand) {
          renderAddClientDealProfileOptions(
            addClientDealForm.elements.counterpartyId.value ? "" : addClientDealClientPickerValue.value
          );
        }

        setAddClientDealClientPickerExpanded(willExpand);
        return;
      }

      if (event.target === addClientDealClientPickerValue) {
        renderAddClientDealProfileOptions(
          addClientDealForm.elements.counterpartyId.value ? "" : addClientDealClientPickerValue.value
        );
        setAddClientDealClientPickerExpanded(true);
      }
    }

    function renderAddClientDealCurrencyPairs(selectedValue = "") {
      const control = addClientDealForm.elements.currencyPair;
      const pairs = marketCurrencyPairValues();
      const selectedPair = normalizedPricingRuleCurrencyPair(selectedValue);
      const defaultPair = pairs.includes(selectedPair)
        ? selectedPair
        : pairs.includes(activeCurrencyPairOrDefault())
          ? activeCurrencyPairOrDefault()
          : pairs[0] || "";

      control.innerHTML = `
        <option value="">${pairs.length === 0 ? "No Ccy Pairs configured" : "Select pair..."}</option>
        ${pairs.map(pair => `<option value="${escapeHtml(pair)}">${escapeHtml(pair)}</option>`).join("")}
      `;
      control.value = defaultPair;
    }

    function addClientDealPricingRuleOptions() {
      return addClientDealPricingRules()
        .map(rule => ({ rule, context: pricingContextById(rule.pricingContextId) }))
        .filter(option => option.context)
        .sort((left, right) => String(left.context.pricingContextId)
          .localeCompare(String(right.context.pricingContextId), "en", { numeric: true }));
    }

    function addClientDealPricingRuleContentMarkup(rule, context, options = {}) {
      const contextMarkup = pricingContextFacetsMarkup(
        context,
        options.executionSystemLabel === true ? { executionSystemLabel: true } : {}
      );
      const pricingModeIndicator = options.showPricingModeIndicator === false
        ? ""
        : pricingModeIndicatorMarkup(pricingModeForRule(rule, context));

      return `
        <span class="client-pricing-context-candidate-path">${contextMarkup}</span>
        <span class="client-deal-pricing-rule-metadata">
          ${pricingModeIndicator}
          ${marginIndicatorMarkup(rule.marginPercent)}
        </span>
      `;
    }

    function renderAddClientDealPricingRules() {
      const profile = selectedAddClientDealProfile();
      const pair = selectedAddClientDealCurrencyPair();
      const options = addClientDealPricingRuleOptions();
      const onboardingPricing = isAddClientDealOnboardingPricing();
      const onboardingAvailable = Boolean(profile && pair);
      const pickerAvailable = options.length > 0 || onboardingAvailable;
      const selectedRuleId = String(addClientDealForm.elements.pricingRuleId.value || "");
      const selectedOption = onboardingPricing
        ? null
        : options.find(option =>
            String(option.rule.pricingRuleId) === selectedRuleId
          ) || (options.length === 1 ? options[0] : null);
      const effectiveSelectedRuleId = String(selectedOption?.rule.pricingRuleId || "");
      const emptyMessage = !profile
        ? "Select a client to see available Pricing Rules."
        : !pair
          ? "Select a currency pair to see available Pricing Rules."
          : "No Pricing Rule is configured for this client and currency pair.";

      addClientDealForm.elements.executionContextId.value = selectedOption?.context.pricingContextId || "";
      addClientDealForm.elements.pricingRuleId.value = selectedOption?.rule.pricingRuleId || "";
      addClientDealForm.elements.manualPricingReason.value = onboardingPricing && onboardingAvailable
        ? CLIENT_ONBOARDING_MANUAL_PRICING
        : "";
      addClientDealPricingRulePicker.innerHTML = `
        <span class="form-label client-deal-context-picker-label" id="addClientDealPricingRuleLabel">Pricing Rule</span>
        <div class="input-group client-deal-pricing-rule-select${pickerAvailable ? "" : " is-disabled"}">
          <div class="form-control client-deal-pricing-rule-select-value" aria-labelledby="addClientDealPricingRuleLabel">
            ${selectedOption
              ? addClientDealPricingRuleContentMarkup(
                  selectedOption.rule,
                  selectedOption.context,
                  { executionSystemLabel: true, showPricingModeIndicator: false }
                )
              : onboardingPricing && onboardingAvailable
                ? `
                  <span class="client-deal-onboarding-selection">
                    <span class="button-icon" aria-hidden="true">person_add</span>
                    <span class="client-deal-onboarding-copy">
                      <span class="client-deal-onboarding-title">Client Onboarding</span>
                      <span class="client-deal-onboarding-subtitle">Manual Pricing</span>
                    </span>
                  </span>
                  ${pricingModeIndicatorMarkup("MANUAL_PRICING")}
                `
                : `<span class="client-deal-pricing-rule-placeholder">${escapeHtml(options.length > 0
                  ? `Select Pricing Rule (${options.length} available)`
                  : emptyMessage)}</span><span></span>`}
          </div>
          <button type="button" class="btn btn-outline-secondary client-deal-pricing-rule-select-toggle" data-add-client-deal-pricing-rule-toggle aria-label="Open Pricing Rule list" aria-haspopup="listbox" aria-controls="addClientDealPricingRuleOptions" aria-expanded="${addClientDealPricingRulesExpanded}"${pickerAvailable ? "" : " disabled"}>
            <span class="button-icon" aria-hidden="true">arrow_drop_down</span>
          </button>
        </div>
        <div class="client-deal-context-picker-viewport" id="addClientDealPricingRuleOptions" role="listbox" aria-labelledby="addClientDealPricingRuleLabel"${addClientDealPricingRulesExpanded && pickerAvailable ? "" : " hidden"}>
          ${options.map(({ rule, context }) => {
                const selected = String(rule.pricingRuleId) === effectiveSelectedRuleId;
                return `
                  <button type="button" class="client-pricing-context-candidate${selected ? " is-selected" : ""}" data-add-client-deal-pricing-rule-id="${escapeHtml(rule.pricingRuleId)}" role="option" aria-selected="${selected}">
                    ${addClientDealPricingRuleContentMarkup(
                      rule,
                      context,
                      { executionSystemLabel: true, showPricingModeIndicator: false }
                    )}
                  </button>
                `;
              }).join("")}
          ${onboardingAvailable
            ? `
              ${options.length > 0 ? '<div class="client-deal-onboarding-separator" role="separator"></div>' : ""}
              <button type="button" class="client-deal-onboarding-option${onboardingPricing ? " is-selected" : ""}" data-add-client-deal-onboarding-pricing role="option" aria-selected="${onboardingPricing}">
                <span class="client-deal-onboarding-option-content">
                  <span class="button-icon" aria-hidden="true">person_add</span>
                  <span class="client-deal-onboarding-copy">
                    <span class="client-deal-onboarding-title">Client Onboarding</span>
                    <span class="client-deal-onboarding-subtitle">Manual Pricing</span>
                  </span>
                </span>
                ${pricingModeIndicatorMarkup("MANUAL_PRICING")}
              </button>
            `
            : ""}
        </div>
        ${onboardingPricing && onboardingAvailable
          ? '<div class="alert alert-warning client-deal-onboarding-warning" role="status">Pricing Rule is pending. Transfer Rate must be entered manually.</div>'
          : ""}
        ${addClientDealPricingRulePicker.classList.contains("is-invalid")
          ? '<div class="invalid-feedback d-block">Select a Pricing Rule or Client Onboarding — Manual Pricing.</div>'
          : ""}
      `;
    }

    function syncAddClientDealCurrencyLabels() {
      const pair = selectedAddClientDealCurrencyPair();
      const currencies = currenciesFromPair(pair || "BASE/QUOTE");
      const sideControl = addClientDealForm.elements.side;
      const selectedSide = ["BUY", "SELL"].includes(sideControl.value) ? sideControl.value : "";
      const fixingControl = addClientDealForm.elements.amountFixingCurrency;

      addClientDealForm.querySelector("[data-add-client-deal-base-ccy]").textContent = currencies.base;
      addClientDealForm.querySelector("[data-add-client-deal-quote-ccy]").textContent = currencies.quote;
      sideControl.innerHTML = `
        <option value="">Select...</option>
        <option value="BUY">BUY ${escapeHtml(currencies.base)}</option>
        <option value="SELL">SELL ${escapeHtml(currencies.base)}</option>
      `;
      sideControl.value = selectedSide;

      addClientDealForm.querySelectorAll("[data-add-client-deal-fixing-currency]").forEach(control => {
        const currency = control.dataset.addClientDealFixingCurrency === "quote"
          ? currencies.quote
          : currencies.base;
        control.setAttribute("aria-label", `Use ${currency} as fixed amount currency`);
      });
    }

    function addClientDealExactAmounts() {
      const currencies = currenciesFromPair(selectedAddClientDealCurrencyPair());
      const fixing = addClientDealForm.elements.amountFixingCurrency.value === "quote"
        ? "quote"
        : "base";
      const dealtCcyCode = fixing === "quote" ? currencies.quote : currencies.base;
      const dealtInput = fixing === "quote"
        ? addClientDealForm.elements.quoteCcyAmount
        : addClientDealForm.elements.baseCcyAmount;
      const baseFractionDigits = currencyFractionDigits(currencies.base);
      const quoteFractionDigits = currencyFractionDigits(currencies.quote);
      const dealtFractionDigits = fixing === "quote"
        ? quoteFractionDigits
        : baseFractionDigits;

      if (!validateMinorPrecision(dealtInput, dealtCcyCode, dealtFractionDigits)) {
        return null;
      }

      const amounts = exactFxAmountsFromDealt({
        dealtAmount: dealtInput.value,
        dealtCcyCode,
        baseCcyCode: currencies.base,
        quoteCcyCode: currencies.quote,
        baseFractionDigits,
        quoteFractionDigits,
        tradeRate: addClientDealForm.elements.clientRate.value
      });

      return amounts
        ? {
            ...amounts,
            fixing,
            dealtCcyCode,
            dealtCcyAmount: positiveDecimalInputText(dealtInput.value),
            baseFractionDigits,
            quoteFractionDigits,
            baseCcyAmount: minorToMajorDecimal(amounts.baseAmountMinor, baseFractionDigits),
            quoteCcyAmount: minorToMajorDecimal(amounts.quoteAmountMinor, quoteFractionDigits)
          }
        : null;
    }

    function syncAddClientDealAmounts() {
      const fixing = addClientDealForm.elements.amountFixingCurrency.value === "quote" ? "quote" : "base";
      const baseInput = addClientDealForm.elements.baseCcyAmount;
      const quoteInput = addClientDealForm.elements.quoteCcyAmount;

      baseInput.readOnly = fixing === "quote";
      quoteInput.readOnly = fixing === "base";
      baseInput.setCustomValidity("");
      quoteInput.setCustomValidity("");

      addClientDealForm.querySelectorAll("[data-add-client-deal-fixing-currency]").forEach(control => {
        const isFixed = control.dataset.addClientDealFixingCurrency === fixing;
        control.classList.toggle("is-active", isFixed);
        control.setAttribute("aria-pressed", String(isFixed));
        control.querySelector("[data-add-client-deal-fixing-icon]").textContent = isFixed
          ? "radio_button_checked"
          : "radio_button_unchecked";
        control.closest("[data-add-client-deal-amount-field]")?.classList.toggle("is-fixed", isFixed);
      });

      const amounts = addClientDealExactAmounts();

      if (!amounts) {
        if (fixing === "quote") {
          baseInput.value = "";
        } else {
          quoteInput.value = "";
        }

        return;
      }

      if (fixing === "quote") {
        baseInput.value = formattedMinorAmount(
          amounts.baseAmountMinor,
          amounts.baseFractionDigits
        );
        return;
      }

      quoteInput.value = formattedMinorAmount(
        amounts.quoteAmountMinor,
        amounts.quoteFractionDigits
      );
    }

    function selectAddClientDealAmountFixingCurrency(event) {
      const control = event.target.closest("[data-add-client-deal-fixing-currency]");

      if (!control) {
        return;
      }

      const fixing = control.dataset.addClientDealFixingCurrency === "quote" ? "quote" : "base";
      addClientDealForm.elements.amountFixingCurrency.value = fixing;
      syncAddClientDealDerivedFields();

      const amountInput = fixing === "quote"
        ? addClientDealForm.elements.quoteCcyAmount
        : addClientDealForm.elements.baseCcyAmount;
      amountInput.focus();
      amountInput.select();
    }

    function syncAddClientDealValueDates() {
      const tradeDateInput = addClientDealForm.elements.tradeDate;
      const tradeDate = parseDisplayDate(tradeDateInput.value);
      const tenor = addClientDealForm.elements.tenor.value;
      const baseValueDateInput = addClientDealForm.elements.baseCcyValueDate;
      const quoteValueDateInput = addClientDealForm.elements.quoteCcyValueDate;
      const calculatedValueDate = isValidDate(tradeDate)
        ? formatDisplayDate(valueDateFromTradeDate(tradeDate, tenor))
        : "";

      tradeDateInput.setCustomValidity("");
      baseValueDateInput.value = calculatedValueDate;
      quoteValueDateInput.value = calculatedValueDate;
      addClientDealForm.querySelector("[data-add-client-deal-trade-date-summary]").textContent = tradeDateInput.value.trim() || "—";
      addClientDealForm.querySelector("[data-add-client-deal-base-value-date-summary]").textContent = baseValueDateInput.value || "—";
      addClientDealForm.querySelector("[data-add-client-deal-quote-value-date-summary]").textContent = quoteValueDateInput.value || "—";
      addClientDealForm.querySelector("[data-add-client-deal-custom-date]").hidden = !isValidDate(tradeDate)
        || tradeDateInput.value.trim() === todayLabel();

      if (tradeDateInput.value.trim() && !isValidDate(tradeDate)) {
        tradeDateInput.setCustomValidity("Trade Date must look like 29.06.2026.");
      }
    }

    function syncAddClientDealMarketQuote() {
      const pairValue = selectedAddClientDealCurrencyPair();
      const quote = currentMarketQuoteForPair(pairValue);
      const pair = marketPairs.find(item => item.currencyPair === pairValue);
      const status = !DEMO_API_ENABLED
        ? "Unavailable"
        : !marketSimulationConfigured(pair)
          ? "Not configured"
          : !marketStreamConnected
            ? "Connecting"
            : marketStreamRunning ? "Active" : "Stopped";
      const statusIndicator = addClientDealForm.querySelector("[data-add-client-deal-market-status]");
      const marketPulseCard = document.getElementById("addClientDealMarketPulse");

      addClientDealForm.elements.marketBid.value = quote ? formatMarketQuote(quote.bid, pair) : "";
      addClientDealForm.elements.marketOffer.value = quote ? formatMarketQuote(quote.offer, pair) : "";
      const quoteDisplay = document.getElementById("addClientDealMarketQuote");
      quoteDisplay.querySelector("[data-market-quote-bid]").textContent =
        addClientDealForm.elements.marketBid.value;
      quoteDisplay.querySelector("[data-market-quote-offer]").textContent =
        addClientDealForm.elements.marketOffer.value;
      addClientDealForm.elements.marketStatus.value = status;
      addClientDealForm.querySelector("[data-add-client-deal-market-status-text]").textContent = status;
      statusIndicator.title = status;
      statusIndicator.classList.toggle("is-active", status === "Active");
      statusIndicator.classList.toggle("is-stopped", status === "Stopped");
      marketPulseCard.classList.toggle("is-live", status === "Active" && Boolean(quote));
    }

    function setAddClientDealLossConfirmation(visible) {
      addClientDealLossConfirmation.hidden = !visible;
    }

    function syncAddClientDealLossState(analyticalPnl) {
      const isNegative = Number.isFinite(analyticalPnl) && analyticalPnl < 0;

      addClientDealForm.querySelectorAll("[data-add-client-deal-loss-field]").forEach(field => {
        field.classList.toggle("is-negative-pnl", isNegative);
      });

      if (!isNegative) {
        setAddClientDealLossConfirmation(false);
      }

      return isNegative;
    }

    function captureAddClientDealControlConfirmation(event) {
      addClientDealSubmitWithControl = event.ctrlKey === true;
    }

    function handleAddClientDealControlEnter(event) {
      if (event.key !== "Enter" || !event.ctrlKey) {
        return;
      }

      event.preventDefault();
      addClientDealSubmitWithControl = true;
      addClientDealForm.requestSubmit(addClientDealSubmitButton);
    }

    function syncAddClientDealPositionValues() {
      const rule = selectedAddClientDealPricingRule();
      const onboardingPricing = isAddClientDealOnboardingPricing();
      const side = addClientDealForm.elements.side.value;
      const clientRateText = positiveDecimalInputText(addClientDealForm.elements.clientRate.value);
      const amounts = addClientDealExactAmounts();
      const pair = marketPairs.find(item => item.currencyPair === selectedAddClientDealCurrencyPair());
      const transferRateControl = addClientDealForm.elements.transferRate;
      let transferRateText = null;

      if (rule) {
        transferRateText = exactTransferRateTextFromPricingRule(
          side.toLowerCase(),
          clientRateText,
          String(rule.marginPercent),
          pair?.defaultQuoteDecimals
        );
        transferRateControl.readOnly = true;
        addClientDealManualTransferEdited = false;
      } else if (onboardingPricing) {
        transferRateControl.readOnly = false;
        transferRateText = addClientDealManualTransferEdited
          ? positiveDecimalInputText(transferRateControl.value)
          : clientRateText;
      } else {
        transferRateControl.readOnly = true;
        addClientDealManualTransferEdited = false;
      }

      const analyticalPnlText = amounts
        ? exactAnalyticalPnlText({
            side,
            baseCcyAmount: amounts.baseCcyAmount,
            tradeRate: clientRateText,
            transferRate: transferRateText,
            quoteFractionDigits: amounts.quoteFractionDigits
          })
        : null;
      const analyticalPnl = analyticalPnlText === null ? null : Number(analyticalPnlText);

      if (!onboardingPricing || !addClientDealManualTransferEdited) {
        transferRateControl.value = transferRateText || "";
      }
      addClientDealForm.elements.analyticalPnl.value = analyticalPnlText !== null
        ? groupedDecimalText(analyticalPnlText)
        : "";
      transferRateControl.setAttribute("aria-readonly", String(transferRateControl.readOnly));
      transferRateControl.closest(".client-deal-transfer-rate-input-group")
        ?.classList.toggle("is-manual", onboardingPricing);
      addClientDealForm.querySelector("[data-add-client-deal-manual-pricing-badge]").hidden =
        !onboardingPricing;
      syncAddClientDealLossState(analyticalPnl);
    }

    function syncAddClientDealDerivedFields() {
      syncAddClientDealCurrencyLabels();
      syncAddClientDealAmounts();
      syncAddClientDealValueDates();
      syncAddClientDealMarketQuote();
      syncAddClientDealPositionValues();
    }

    function syncAddClientDealScope() {
      addClientDealForm.elements.executionContextId.value = "";
      addClientDealForm.elements.pricingRuleId.value = "";
      addClientDealForm.elements.manualPricingReason.value = "";
      addClientDealManualTransferEdited = false;
      addClientDealPricingRulesExpanded = false;
      addClientDealPricingRulePicker.classList.remove("is-invalid");
      renderAddClientDealPricingRules();
      syncAddClientDealDerivedFields();
    }

    function handleAddClientDealPricingRulePicker(event) {
      const toggle = event.target.closest("[data-add-client-deal-pricing-rule-toggle]");

      if (toggle) {
        event.stopPropagation();
        setAddClientDealClientPickerExpanded(false);
        addClientDealPricingRulesExpanded = !addClientDealPricingRulesExpanded;
        renderAddClientDealPricingRules();
        addClientDealPricingRulePicker.querySelector("[data-add-client-deal-pricing-rule-toggle]")?.focus();
        return;
      }

      const onboardingButton = event.target.closest("[data-add-client-deal-onboarding-pricing]");

      if (onboardingButton) {
        addClientDealForm.elements.executionContextId.value = "";
        addClientDealForm.elements.pricingRuleId.value = "";
        addClientDealForm.elements.manualPricingReason.value =
          CLIENT_ONBOARDING_MANUAL_PRICING;
        addClientDealManualTransferEdited = false;
        addClientDealPricingRulesExpanded = false;
        addClientDealPricingRulePicker.classList.remove("is-invalid");
        renderAddClientDealPricingRules();
        syncAddClientDealDerivedFields();
        addClientDealForm.elements.transferRate.focus();
        return;
      }

      const pricingRuleButton = event.target.closest("[data-add-client-deal-pricing-rule-id]");

      if (!pricingRuleButton) {
        return;
      }

      const pricingRuleId = pricingRuleButton.dataset.addClientDealPricingRuleId || "";
      const option = addClientDealPricingRuleOptions().find(candidate =>
        String(candidate.rule.pricingRuleId) === String(pricingRuleId)
      );

      if (!option) {
        return;
      }

      addClientDealForm.elements.executionContextId.value = option.context.pricingContextId;
      addClientDealForm.elements.pricingRuleId.value = option.rule.pricingRuleId;
      addClientDealForm.elements.manualPricingReason.value = "";
      addClientDealManualTransferEdited = false;
      addClientDealPricingRulesExpanded = false;
      addClientDealPricingRulePicker.classList.remove("is-invalid");
      renderAddClientDealPricingRules();
      syncAddClientDealDerivedFields();
      addClientDealPricingRulePicker.querySelector("[data-add-client-deal-pricing-rule-toggle]")?.focus();
    }

    function formatAddClientDealAmounts() {
      const amounts = addClientDealExactAmounts();

      if (amounts) {
        addClientDealForm.elements.baseCcyAmount.value = formattedMinorAmount(
          amounts.baseAmountMinor,
          amounts.baseFractionDigits
        );
        addClientDealForm.elements.quoteCcyAmount.value = formattedMinorAmount(
          amounts.quoteAmountMinor,
          amounts.quoteFractionDigits
        );
      }

      syncAddClientDealDerivedFields();
    }

    function openAddClientDealDialog() {
      addClientDealForm.reset();
      addClientDealPricingModeControl.value = "DEALER_PRICED";
      addClientDealSubmitWithControl = false;
      setAddClientDealLossConfirmation(false);
      Array.from(addClientDealForm.elements).forEach(element => element.setCustomValidity?.(""));
      renderAddClientDealProfiles();
      renderAddClientDealCurrencyPairs(activeCurrencyPairOrDefault());
      addClientDealForm.elements.side.value = "";
      addClientDealForm.elements.amountFixingCurrency.value = "base";
      addClientDealForm.elements.tradeDate.value = todayLabel();
      addClientDealForm.elements.tenor.value = "TOD";
      addClientDealForm.elements.manualPricingReason.value = "";
      addClientDealManualTransferEdited = false;
      addClientDealAdditionalDetails.open = false;
      addClientDealPricingRulesExpanded = false;
      addClientDealClientPicker.classList.remove("is-invalid");
      addClientDealPricingRulePicker.classList.remove("is-invalid");
      renderAddClientDealPricingRules();
      syncAddClientDealDerivedFields();

      if (typeof addClientDealDialog.showModal === "function") {
        addClientDealDialog.showModal();
      } else {
        addClientDealDialog.setAttribute("open", "");
      }

      addClientDealClientPickerValue.focus();
    }

    function closeAddClientDealDialog() {
      if (typeof addClientDealDialog.close === "function") {
        addClientDealDialog.close();
      } else {
        addClientDealDialog.removeAttribute("open");
      }
    }
