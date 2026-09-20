    function clientDealDuplicatePairCode(deal) {
      return String(deal?.ccyPairCode || deal?.currencyPair || "")
        .trim()
        .toUpperCase()
        .replace("/", "_");
    }

    async function currentClientDealsForDuplicateCheck() {
      if (!DEMO_API_ENABLED) {
        return clientDealRecords(positions);
      }

      return reloadClientDealsFromApi();
    }

    async function clientDealDuplicateCandidates(targetDeal) {
      const draftDeal = normalizedClientDeal(targetDeal);
      const currentDeals = await currentClientDealsForDuplicateCheck();

      return currentDeals.filter(deal =>
        Number(deal.counterpartyId) === Number(draftDeal.counterpartyId)
        && clientDealDuplicatePairCode(deal) === clientDealDuplicatePairCode(draftDeal)
      );
    }

    function clientDealDuplicateCheckColumns() {
      const visibleFields = new Set([
        "tradeId",
        "tradeDate",
        "currencyPair",
        "side",
        "baseCcyAmount",
        "quoteCcyAmount",
        "tradeRate",
        "tenor"
      ]);
      const columns = clientDealColumnDefinitions()
        .flatMap(group => group.columns || [group])
        .filter(column => visibleFields.has(column.field))
        .map(column => {
          const {
            headerFilter,
            headerFilterFunc,
            width,
            minWidth,
            maxWidth,
            cssClass,
            ...plainColumn
          } = column;

          return plainColumn;
        });

      return uiTableColumns("client_deals_grid", columns).map(column => {
        const {
          width,
          minWidth,
          maxWidth,
          ...fluidColumn
        } = column;

        return fluidColumn;
      });
    }

    function clientDealDuplicateCheckData(candidates) {
      return candidates.map((deal, index) => ({
        ...deal,
        rowKey: `${deal.tradeId ?? deal.clientDealId}:${index}`,
        tradeId: Number(deal.tradeId ?? deal.clientDealId)
      }));
    }

    function setClientDealDuplicateCheckStatus(message = "") {
      clientDealDuplicateCheckStatus.textContent = message;
      clientDealDuplicateCheckStatus.hidden = !message;
    }

    function initializeClientDealDuplicateCheckGrid(data) {
      clientDealDuplicateCheckGrid = new Tabulator(clientDealDuplicateCheckGridEl, {
        data,
        index: "rowKey",
        layout: "fitColumns",
        placeholder: "No matching client deals.",
        movableColumns: false,
        resizableColumns: false,
        columnDefaults: {
          resizable: false,
          vertAlign: "middle",
          tooltip: tabulatorCellOverflowTooltip,
          headerTooltip: tabulatorHeaderOverflowTooltip
        },
        columns: clientDealDuplicateCheckColumns()
      });

      clientDealDuplicateCheckGrid.on("tableBuilt", () => clientDealDuplicateCheckGrid.redraw(true));
    }

    function openClientDealDuplicateCheck(targetDeal, candidates) {
      const data = clientDealDuplicateCheckData(candidates);
      const dealLabel = data.length === 1 ? "deal" : "deals";

      pendingClientDealCreation = targetDeal;
      clientDealDuplicateCheckSummary.textContent = `${data.length} existing ${dealLabel} found for ${targetDeal.clientName} and ${currencyPair(targetDeal)}. Make sure the new deal is not a duplicate.`;
      setClientDealDuplicateCheckStatus();
      addClientDealSubmitButton.disabled = true;

      openDialogWithoutFieldFocus(clientDealDuplicateCheckDialog);

      if (clientDealDuplicateCheckGrid) {
        clientDealDuplicateCheckGrid.replaceData(data).then(() => clientDealDuplicateCheckGrid.redraw(true));
      } else {
        initializeClientDealDuplicateCheckGrid(data);
      }

      requestAnimationFrame(() => {
        clientDealDuplicateCheckGrid?.redraw(true);
      });
    }

    function closeClientDealDuplicateCheck({ restoreFormFocus = true, clearPending = true } = {}) {
      if (typeof clientDealDuplicateCheckDialog.close === "function") {
        clientDealDuplicateCheckDialog.close();
      } else {
        clientDealDuplicateCheckDialog.removeAttribute("open");
      }

      if (clearPending) {
        pendingClientDealCreation = null;
      }

      setClientDealDuplicateCheckStatus();
      addClientDealSubmitButton.disabled = false;

      if (restoreFormFocus && addClientDealDialog.open) {
        requestAnimationFrame(() => addClientDealSubmitButton.focus());
      }
    }

    async function persistCreatedClientDeal(targetDeal) {
      addClientDealSubmitButton.disabled = true;
      clientDealDuplicateCheckConfirmButton.disabled = true;
      setClientDealDuplicateCheckStatus();

      try {
        const createdDeal = await createClientDealRecord(targetDeal);
        await refreshClientDealViewsFromApi();
        selectedCurrencyPair = createdDeal.currencyPair;
        saveSelectedCurrencyPair();
        setBatchStatus(
          `Client Deal ${createdDeal.clientDealId} was created successfully.`,
          "success"
        );

        if (clientDealDuplicateCheckDialog.open) {
          closeClientDealDuplicateCheck({ restoreFormFocus: false, clearPending: true });
        }

        closeAddClientDealDialog();
        render(positions);
        return true;
      } catch (error) {
        const message = error.message || "Unable to create the Client Deal.";
        setBatchStatus(message, "error");

        if (clientDealDuplicateCheckDialog.open) {
          setClientDealDuplicateCheckStatus(message);
        }

        return false;
      } finally {
        addClientDealSubmitButton.disabled = false;
        clientDealDuplicateCheckConfirmButton.disabled = false;
      }
    }

    async function confirmClientDealDuplicateCheck() {
      if (pendingClientDealCreation) {
        await persistCreatedClientDeal(pendingClientDealCreation);
      }
    }

    async function createClientDeal(event) {
      event.preventDefault();
      const controlConfirmed = addClientDealSubmitWithControl;
      addClientDealSubmitWithControl = false;
      syncAddClientDealDerivedFields();

      const profile = selectedAddClientDealProfile();
      const pricingRule = selectedAddClientDealPricingRule();
      const pricingContext = selectedAddClientDealTradeContext();
      const onboardingPricing = isAddClientDealOnboardingPricing();
      const formValid = addClientDealForm.reportValidity();

      addClientDealClientPicker.classList.toggle("is-invalid", !profile);

      if (!formValid || !profile) {
        if (!profile) {
          addClientDealClientPickerValue.focus();
        }
        return;
      }

      if ((!pricingRule || !pricingContext) && !onboardingPricing) {
        addClientDealPricingRulePicker.classList.add("is-invalid");
        renderAddClientDealPricingRules();
        return;
      }

      const currencyPairText = selectedAddClientDealCurrencyPair();
      const tradeDate = parseDisplayDate(addClientDealForm.elements.tradeDate.value);
      const tenor = addClientDealForm.elements.tenor.value;
      const side = addClientDealForm.elements.side.value;
      const fixing = addClientDealForm.elements.amountFixingCurrency.value === "quote"
        ? "quote"
        : "base";
      const dealtInput = fixing === "quote"
        ? addClientDealForm.elements.quoteCcyAmount
        : addClientDealForm.elements.baseCcyAmount;
      const dealtCcyAmount = parsePositiveDecimalInput(dealtInput, "Dealt Ccy Amount");
      const tradeRateText = parsePositiveDecimalInput(
        addClientDealForm.elements.clientRate,
        "Trade Rate"
      );
      const transferRateText = positiveDecimalInputText(
        addClientDealForm.elements.transferRate.value
      );
      const amounts = addClientDealExactAmounts();
      const baseAmount = amounts ? Number(amounts.baseCcyAmount) : null;
      const quoteAmount = amounts ? Number(amounts.quoteCcyAmount) : null;
      const clientRate = tradeRateText === null ? null : Number(tradeRateText);
      const transferRate = transferRateText === null ? null : Number(transferRateText);
      const analyticalPnl = normalizeNumber(addClientDealForm.elements.analyticalPnl.value);
      const baseValueDate = parseDisplayDate(addClientDealForm.elements.baseCcyValueDate.value);
      const quoteValueDate = parseDisplayDate(addClientDealForm.elements.quoteCcyValueDate.value);

      if (
        !currencyPairText
        || !isValidDate(tradeDate)
        || !["BUY", "SELL"].includes(side)
        || dealtCcyAmount === null
        || !amounts
        || !Number.isFinite(baseAmount)
        || !Number.isFinite(quoteAmount)
        || !Number.isFinite(clientRate)
        || !Number.isFinite(transferRate)
        || !Number.isFinite(analyticalPnl)
        || !isValidDate(baseValueDate)
        || !isValidDate(quoteValueDate)
      ) {
        return;
      }

      if (analyticalPnl < 0 && !controlConfirmed) {
        setAddClientDealLossConfirmation(true);
        addClientDealSubmitButton.focus();
        return;
      }

      setAddClientDealLossConfirmation(false);

      const currencies = currenciesFromPair(currencyPairText);
      const baseValueDateLabel = formatDisplayDate(baseValueDate);
      const quoteValueDateLabel = formatDisplayDate(quoteValueDate);
      const marketBidRate = normalizeNumber(addClientDealForm.elements.marketBid.value);
      const marketOfferRate = normalizeNumber(addClientDealForm.elements.marketOffer.value);
      const marketQuote = currentMarketQuoteForPair(currencyPairText);
      const targetDeal = {
        id: createDealId(),
        tone: "blue",
        batchId: "",
        isBatched: false,
        branchCode: pricingContext?.servicingBranchCode || "",
        counterpartyId: profile.counterpartyId,
        inn: profile.inn,
        clientCodeType: normalizedClientCodeType(profile.clientCodeType),
        type: "client_deal",
        clientName: profile.name,
        entryDate: todayLabel(),
        executionTimestamp: new Date().toISOString(),
        tradeDate: formatDisplayDate(tradeDate),
        valueDate: baseValueDateLabel,
        baseCurrencySettlementDay: baseValueDateLabel,
        quoteCurrencySettlementDay: quoteValueDateLabel,
        tenor,
        baseCurrency: currencies.base,
        quoteCurrency: currencies.quote,
        currencyPair: currencies.pair,
        dealtCcyCode: fixing === "quote" ? currencies.quote : currencies.base,
        dealtCcyAmount,
        amountSell: side === "SELL" ? baseAmount : 0,
        amountBuy: side === "BUY" ? baseAmount : 0,
        clientRate,
        tradeRateText,
        autoBatchRate: transferRate,
        manualTransferRateText: onboardingPricing ? transferRateText : null,
        pnlCash: analyticalPnl,
        pricingRuleId: pricingRule?.pricingRuleId ?? null,
        pricingRuleMargin: pricingRule?.marginPercent ?? null,
        pricingRuleControlStatus: onboardingPricing
          ? "CLIENT_ONBOARDING_MANUAL_PRICING"
          : "PRICING_RULE_APPLIED",
        pricingContextId: pricingContext?.pricingContextId ?? null,
        manualPricingReason: onboardingPricing ? CLIENT_ONBOARDING_MANUAL_PRICING : null,
        entryMarketBid: marketBidRate,
        entryMarketOffer: marketOfferRate,
        entryMarketTimestamp: String(marketQuote?.generatedAt || "").trim(),
        entryMarketStreamStatus: marketStreamRunning ? "RUNNING" : "STOPPED",
        comment: String(addClientDealForm.elements.comment.value || "").trim()
      };
      targetDeal.settlementMethod = positionSettlementMethod(targetDeal);

      addClientDealSubmitButton.disabled = true;
      let duplicateCandidates;

      try {
        duplicateCandidates = await clientDealDuplicateCandidates(targetDeal);
      } catch (error) {
        setBatchStatus(error.message || "Unable to check existing Client Deals.", "error");
        addClientDealSubmitButton.disabled = false;
        return;
      }

      if (duplicateCandidates.length > 0) {
        openClientDealDuplicateCheck(targetDeal, duplicateCandidates);
        return;
      }

      await persistCreatedClientDeal(targetDeal);
    }

    function renderDealRow(deal) {
      const side = sideOf(deal);
      const sourceClass = deal.synthetic ? "open-row" : `source-${deal.tone || "blue"}`;
      const selected = selectedTradeIds.has(deal.id);
      const tradeType = positionType(deal);
      const hedgeDealClass = tradeType === "HEDGE_DEAL"
        ? " is-hedge-deal"
        : "";
      const batchTechnicalClass = ["BATCH_POSITION_OUT", "BATCH_BALANCE_TRADE"].includes(tradeType)
        ? " is-batch-technical"
        : "";
      const rowClass =
        `${sourceClass} side-${side}${hedgeDealClass}${batchTechnicalClass}${selected ? " is-selected" : ""}`;
      const sellActive = side === "sell";
      const buyActive = side === "buy";
      const flatActive = side === "flat";
      const safeId = escapeHtml(deal.id);
      const safeTradeLabel = escapeHtml(positionTradeLabel(deal));
      const safeTradeId = escapeHtml(positionTradeId(deal));
      const tradeTypePresentation = positionTradeTypePresentation(deal);
      const tradeContext = positionTradeContext(deal, tradeTypePresentation.type);
      const tradeTypeTooltip = positionTradeTypeTooltip(deal, tradeTypePresentation);
      const baseCcyAmount = flatActive
        ? formattedMinorAmount("0", positionBaseCcyFractionDigits(deal) ?? 0)
        : positionBaseAmountCell(deal);
      const tradeRate = positionTradeRate(deal);
      const transferRate = positionTransferRate(deal);
      const selectionBox = isBatchablePositionTrade(deal)
        ? `<input type="checkbox" class="form-check-input deal-checkbox" data-deal-id="${safeId}" aria-label="Select ${safeTradeLabel}" ${selected ? "checked" : ""}>`
        : "";
      const tradeIdCopyButton = safeTradeId
        ? `
          <button type="button" class="btn btn-sm btn-outline-secondary trade-id-copy" data-copy-trade-id="${safeTradeId}" data-tooltip="Copy Trade ID" aria-label="Copy Trade ID">
            <span class="button-icon" data-trade-id-copy-icon aria-hidden="true">content_copy</span>
            <span class="visually-hidden" data-trade-id-copy-status aria-live="polite"></span>
          </button>
        `
        : "";
      const tradeTypeChip = `
        <span
          class="position-trade-type-chip"
          role="img"
          tabindex="0"
          aria-label="${escapeHtml(tradeTypeTooltip)}"
          data-tooltip="${escapeHtml(tradeTypeTooltip)}"
        >
          <span class="button-icon position-trade-type-icon" aria-hidden="true">${escapeHtml(tradeTypePresentation.icon)}</span>
        </span>
      `;
      const tradeContextLabel = tradeContext
        ? `<span class="position-trade-context">${escapeHtml(tradeContext)}</span>`
        : "";
      const tradeCell = `
        <span class="position-label-content">
          <span class="position-label-text" data-smart-tooltip-content>
            ${tradeTypeChip}
            ${tradeContextLabel}
          </span>
        </span>
      `;

      return `
        <tr class="${rowClass}">
          <td class="identity trade-id-column">${tradeIdCopyButton}</td>
          <td class="identity client position-label-cell">${tradeCell}</td>
          <td class="identity date number">${escapeHtml(positionTradeDate(deal))}</td>
          <td class="identity base-value-date number">${escapeHtml(baseCurrencyValueDateLabel(deal))}</td>
          <td class="gap wide-gap trade-divider"></td>
          <td class="sell-side sell-zone sell-zone-left amount number ${sellActive || flatActive ? "" : "blank"}">${sellActive || flatActive ? baseCcyAmount : ""}</td>
          <td class="sell-side sell-zone rate number ${sellActive ? "" : "blank"}">${sellActive ? rateCell(tradeRate) : ""}</td>
          <td class="sell-side sell-zone sell-zone-right rate number rate-emphasis ${sellActive ? "" : "blank"}">${sellActive ? rateCell(transferRate) : ""}</td>
          <td class="gap selection-gap sell-check-zone ${sellActive || flatActive ? "selection-active" : ""}">${sellActive || flatActive ? selectionBox : ""}</td>
          <td class="market-sell rate number market-left">${rateCell(marketBid(deal))}</td>
          <td class="market-buy rate number market-right">${rateCell(marketOffer(deal))}</td>
          <td class="gap selection-gap buy-check-zone ${buyActive ? "selection-active" : ""}">${buyActive ? selectionBox : ""}</td>
          <td class="buy-side buy-zone rate number rate-emphasis ${buyActive ? "" : "blank"}">${buyActive ? rateCell(transferRate) : ""}</td>
          <td class="buy-side buy-zone rate number ${buyActive ? "" : "blank"}">${buyActive ? rateCell(tradeRate) : ""}</td>
          <td class="buy-side buy-zone amount number ${buyActive || flatActive ? "" : "blank"}">${buyActive || flatActive ? baseCcyAmount : ""}</td>
        </tr>
      `;
    }
