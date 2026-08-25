    function clientDealDuplicatePairCode(deal) {
      return String(deal?.ccyPairCode || deal?.currencyPair || "")
        .trim()
        .toUpperCase()
        .replace("/", "_");
    }

    async function currentClientDealsForDuplicateCheck() {
      if (!DEMO_API_ENABLED) {
        return clientFxDealRecords(fxPositions);
      }

      return reloadClientFxDealsFromApi();
    }

    async function clientDealDuplicateCandidates(targetDeal) {
      const draftDeal = normalizedClientFxDeal(targetDeal);
      const currentDeals = await currentClientDealsForDuplicateCheck();

      return currentDeals.filter(deal =>
        Number(deal.counterpartyId) === Number(draftDeal.counterpartyId)
        && clientDealDuplicatePairCode(deal) === clientDealDuplicatePairCode(draftDeal)
      );
    }

    function clientDealDuplicateCheckColumns() {
      return [
        {
          title: "Trade Details",
          columns: [
            tabulatorSizedColumn("referenceId", {
              title: "Trade ID",
              field: "tradeId",
              sorter: "number"
            })
          ]
        },
        {
          title: "Trade Economics",
          columns: [
            tabulatorSizedColumn("date", { title: "Trade Date", field: "tradeDate", formatter: clientFxDealsDateFormatter }),
            tabulatorSizedColumn("pair", { title: "Ccy Pair", field: "currencyPair" }),
            tabulatorSizedColumn("shortText", { title: "Client Side", field: "side", formatter: clientFxDealsSideFormatter, hozAlign: "center", headerHozAlign: "center" }),
            tabulatorSizedColumn("amount", { title: "Base Ccy Amount", field: "baseCcyAmount", sorter: "number", formatter: clientFxDealsAmountFormatter, hozAlign: "right", headerHozAlign: "right" }),
            tabulatorSizedColumn("amount", { title: "Quote Ccy Amount", field: "quoteCcyAmount", sorter: "number", formatter: clientFxDealsAmountFormatter, hozAlign: "right", headerHozAlign: "right" }),
            tabulatorSizedColumn("rate", { title: "Trade Rate", field: "tradeRate", sorter: "number", formatter: clientFxDealsRateFormatter, hozAlign: "right", headerHozAlign: "right" }),
            tabulatorSizedColumn("tenor", { title: "Tenor", field: "tenor", hozAlign: "center", headerHozAlign: "center" })
          ]
        }
      ];
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
        layout: "fitData",
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
      clientDealDuplicateCheckSummary.textContent = `${data.length} existing ${dealLabel} found for ${targetDeal.clientName} and ${currencyPair(targetDeal)}. Review them before creating another deal.`;
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
        const createdDeal = await createClientFxDealRecord(targetDeal);
        await refreshClientDealViewsFromApi();
        selectedCurrencyPair = createdDeal.currencyPair;
        saveSelectedCurrencyPair();
        setBatchStatus(
          `Client FX Deal ${createdDeal.clientDealId} was created successfully.`,
          "success"
        );

        if (clientDealDuplicateCheckDialog.open) {
          closeClientDealDuplicateCheck({ restoreFormFocus: false, clearPending: true });
        }

        closeAddClientDealDialog();
        render(fxPositions);
        return true;
      } catch (error) {
        const message = error.message || "Unable to create the Client FX Deal.";
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
      const pricingContext = selectedAddClientDealExecutionContext();
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
      targetDeal.settlementMethod = fxPositionSettlementMethod(targetDeal);

      addClientDealSubmitButton.disabled = true;
      let duplicateCandidates;

      try {
        duplicateCandidates = await clientDealDuplicateCandidates(targetDeal);
      } catch (error) {
        setBatchStatus(error.message || "Unable to check existing Client FX Deals.", "error");
        addClientDealSubmitButton.disabled = false;
        return;
      }

      if (duplicateCandidates.length > 0) {
        openClientDealDuplicateCheck(targetDeal, duplicateCandidates);
        return;
      }

      await persistCreatedClientDeal(targetDeal);
    }

    function dealPricingRuleEmptyMessage() {
      const profile = selectedDealClientProfile();

      if (!profile) {
        return "Select a client";
      }

      return "No Pricing Rule";
    }

    function dealPricingRulesForSelectedClient() {
      const profile = selectedDealClientProfile();

      if (!profile) {
        return [];
      }

      return clientPricingRulesForInn(profile.inn)
        .sort((left, right) =>
          left.currencyPair.localeCompare(right.currencyPair) ||
          left.pricingContextId.localeCompare(right.pricingContextId)
        );
    }

    function selectedDealPricingRule() {
      const selectedRuleId = dealPricingRuleControl().value;

      return dealPricingRulesForSelectedClient().find(rule => rule.pricingRuleId === selectedRuleId) || null;
    }

    function dealPricingRuleLabel(rule) {
      const context = pricingContextById(rule?.pricingContextId);
      const margin = `${editNumber(rule?.marginPercent ?? 0, 4)}%`;

      if (!context) {
        return `${rule.currencyPair} | Missing Execution Context | ${margin}`;
      }

      return [
        rule.currencyPair,
        servicingBranchDisplayName(context.servicingBranchCode),
        settlementSystemDisplayName(context.settlementSystemId),
        tradeCaptureChannelDisplayName(context.tradeCaptureChannelId),
        margin
      ].join(" | ");
    }

    function renderDealPricingRuleOptions() {
      const control = dealPricingRuleControl();
      const selectedValue = control.value;
      const rules = dealPricingRulesForSelectedClient();
      const selectedRuleId = rules.some(rule => rule.pricingRuleId === selectedValue) ? selectedValue : "";
      const placeholder = rules.length === 0
        ? dealPricingRuleEmptyMessage()
        : "No Pricing Rule";

      control.innerHTML = `
        <option value="">${escapeHtml(placeholder)}</option>
        ${rules
          .map(rule => `<option value="${escapeHtml(rule.pricingRuleId)}">${escapeHtml(dealPricingRuleLabel(rule))}</option>`)
          .join("")}
      `;
      control.disabled = false;
      control.value = selectedRuleId;
      control.classList.remove("is-error");
    }

    function renderDealPricingRuleResult() {
      const rule = selectedDealPricingRule();
      const context = pricingContextById(rule?.pricingContextId);
      const hasMissingContext = Boolean(rule && !context);

      dealPricingRuleResults.classList.toggle("is-selected", false);
      dealPricingRuleResults.classList.toggle("is-error", hasMissingContext);
      dealPricingRuleResults.classList.toggle("is-warning", false);
      dealPricingRuleResults.hidden = !hasMissingContext;

      if (!hasMissingContext) {
        dealPricingRuleResults.innerHTML = "";
        return;
      }

      dealPricingRuleResults.innerHTML = `
        <span class="client-pricing-context-result-title">Pricing Rule</span>
        Missing Execution Context for selected rule.
      `;
    }

    function syncDealPricingRuleSelection() {
      renderDealPricingRuleOptions();

      const rule = selectedDealPricingRule();
      const context = pricingContextById(rule?.pricingContextId);

      dealPricingRuleControl().setCustomValidity("");

      if (rule) {
        renderDealCurrencyPairOptions(rule.currencyPair);
      } else {
        renderDealCurrencyPairOptions();
      }

      editForm.elements.currencyPair.disabled = Boolean(rule);

      editForm.elements.branchCode.value = context?.servicingBranchCode || "";
      renderDealPricingRuleResult();
    }

    function handleDealPricingRuleInput() {
      syncDealPricingRuleSelection();
      syncDealFormDerivedFields();
    }

    function setDealPricingRuleSelection(rule) {
      const control = dealPricingRuleControl();

      renderDealPricingRuleOptions();
      control.value = rule?.pricingRuleId || "";
      syncDealPricingRuleSelection();
    }

    function pricingContextForDealFormSource(deal) {
      return pricingContextById(fxPositionExecutionContextId(deal));
    }

    function pricingRuleForDealFormSource(deal) {
      if (deal?.pricingRuleControlStatus === "PRICING_RULE_REQUIRED") {
        return null;
      }

      const storedRuleId = String(deal?.pricingRuleId || deal?.pricing_rule_id || "").trim();
      const storedRule = clientPricingRules.find(rule => rule.pricingRuleId === storedRuleId);

      if (storedRule) {
        return storedRule;
      }

      const context = pricingContextForDealFormSource(deal);
      const pair = currencyPair(deal);

      return clientPricingRulesForInn(deal?.inn || "").find(rule =>
        rule.currencyPair === pair && rule.pricingContextId === context?.pricingContextId
      ) || null;
    }

    function renderLockedEditClientDealContext(deal) {
      const clientPickerValue = document.getElementById("editClientDealClientPickerValue");
      const pricingRulePicker = document.getElementById("editClientDealPricingRulePicker");
      const profile = clientProfiles.find(item => item.counterpartyId === Number(deal.counterpartyId))
        || clientProfileByInn(deal.inn)
        || {
          clientCodeType: normalizedClientCodeType(deal.clientCodeType),
          inn: deal.inn || "—",
          name: deal.clientName || "—"
        };
      const rule = pricingRuleForDealFormSource(deal);
      const context = pricingContextById(rule?.pricingContextId)
        || pricingContextForDealFormSource(deal);

      clientPickerValue.innerHTML = addClientDealProfileIdentityMarkup(profile);
      pricingRulePicker.innerHTML = `
        <span class="form-label client-deal-context-picker-label" id="editClientDealPricingRuleLabel">Pricing Rule</span>
        <div class="input-group client-deal-pricing-rule-select is-disabled">
          <div class="form-control client-deal-pricing-rule-select-value" aria-labelledby="editClientDealPricingRuleLabel">
            ${rule && context
              ? addClientDealPricingRuleContentMarkup(rule, context)
              : '<span class="client-deal-pricing-rule-placeholder">Pricing Rule is unavailable.</span><span></span>'}
          </div>
          <button type="button" class="btn btn-outline-secondary client-deal-pricing-rule-select-toggle" aria-label="Pricing Rule selection is locked" disabled>
            <span class="button-icon" aria-hidden="true">arrow_drop_down</span>
          </button>
        </div>
      `;
    }

    function validateDealPricingRuleSelection() {
      const control = dealPricingRuleControl();
      const selectedRuleId = control.value;
      const rule = selectedDealPricingRule();
      const context = pricingContextById(rule?.pricingContextId);

      if (!selectedRuleId) {
        control.setCustomValidity("");
        return { rule: null, context: null };
      }

      control.setCustomValidity(rule ? "" : "Selected Pricing Rule is not available.");

      if (!rule) {
        control.reportValidity();
        return null;
      }

      control.setCustomValidity(context ? "" : "Selected Pricing Rule has no valid Execution Context.");

      if (!context) {
        renderDealPricingRuleResult();
        control.reportValidity();
        return null;
      }

      return { rule, context };
    }

    function renderDealCurrencyPairOptions(selectedValue = "") {
      const control = editForm.elements.currencyPair;
      const selectedPair = normalizedPricingRuleCurrencyPair(selectedValue || control.value);
      const pairValues = marketCurrencyPairValues();
      const optionPairValues = selectedPair && !pairValues.includes(selectedPair)
        ? [selectedPair, ...pairValues]
        : pairValues;
      const activePair = activeCurrencyPairOrDefault();
      const nextValue = selectedPair && optionPairValues.includes(selectedPair)
        ? selectedPair
        : pairValues.includes(activePair)
          ? activePair
          : pairValues[0] || "";

      control.innerHTML = `
        <option value="">${pairValues.length === 0 ? "No Ccy Pairs configured" : ""}</option>
        ${optionPairValues
          .map(pair => `<option value="${escapeHtml(pair)}">${escapeHtml(pair)}</option>`)
          .join("")}
      `;
      control.value = nextValue;
    }

    function dealFormCurrencies() {
      const pair = normalizedPricingRuleCurrencyPair(editForm.elements.currencyPair.value) || activeCurrencyPairOrDefault();

      return currenciesFromPair(pair);
    }

    function syncDealCurrencyLabels() {
      const currencies = dealFormCurrencies();
      const baseLabels = editForm.querySelectorAll("[data-base-currency-label]");
      const quoteLabels = editForm.querySelectorAll("[data-quote-currency-label]");
      const fixingSelect = editForm.elements.amountFixingCurrency;
      const selectedFixing = fixingSelect.value === "quote" ? "quote" : "base";

      baseLabels.forEach(label => {
        label.textContent = currencies.base;
      });
      quoteLabels.forEach(label => {
        label.textContent = currencies.quote;
      });

      fixingSelect.innerHTML = `
        <option value="base">${escapeHtml(currencies.base)} (base)</option>
        <option value="quote">${escapeHtml(currencies.quote)} (quote)</option>
      `;
      fixingSelect.value = selectedFixing;
    }

    function syncDealAmountInputs() {
      const fixing = editForm.elements.amountFixingCurrency.value === "quote" ? "quote" : "base";
      const baseInput = editForm.elements.amount;
      const quoteInput = editForm.elements.quoteAmount;
      const currencies = dealFormCurrencies();
      const baseFractionDigits = currencyFractionDigits(currencies.base);
      const quoteFractionDigits = currencyFractionDigits(currencies.quote);
      const amounts = exactFxAmountsFromDealt({
        dealtAmount: fixing === "quote" ? quoteInput.value : baseInput.value,
        dealtCcyCode: fixing === "quote" ? currencies.quote : currencies.base,
        baseCcyCode: currencies.base,
        quoteCcyCode: currencies.quote,
        baseFractionDigits,
        quoteFractionDigits,
        tradeRate: editForm.elements.clientRate.value
      });

      baseInput.readOnly = fixing === "quote";
      quoteInput.readOnly = fixing === "base";
      baseInput.setCustomValidity("");
      quoteInput.setCustomValidity("");

      if (!amounts) {
        if (fixing === "quote") {
          baseInput.value = "";
        } else {
          quoteInput.value = "";
        }

        return;
      }

      if (fixing === "quote") {
        baseInput.value = groupedDecimalText(
          minorToMajorDecimal(amounts.baseAmountMinor, baseFractionDigits)
        );
        return;
      }

      quoteInput.value = groupedDecimalText(
        minorToMajorDecimal(amounts.quoteAmountMinor, quoteFractionDigits)
      );
    }

    function formatDealAmountInput(input) {
      const value = normalizeNumber(input.value);

      if (Number.isFinite(value)) {
        input.value = amountInputValue(value);
      }
    }

    function formatDealAmountInputs() {
      formatDealAmountInput(editForm.elements.amount);
      formatDealAmountInput(editForm.elements.quoteAmount);
      syncDealFormDerivedFields();
    }

    function syncDealTransferRateFromPricingRule() {
      const pricingRule = selectedDealPricingRule();
      const transferRateInput = editForm.elements.autoBatchRate;

      if (!pricingRule) {
        transferRateInput.readOnly = false;

        if (transferRateInput.dataset.pricingRuleCalculated === "true") {
          transferRateInput.value = "";
          delete transferRateInput.dataset.pricingRuleCalculated;
        }

        return;
      }

      const side = editForm.elements.side.value;
      const clientRate = normalizeNumber(editForm.elements.clientRate.value);
      const marginPercent = Number(pricingRule?.marginPercent);
      const pair = marketPairs.find(item => item.currencyPair === selectedDealCurrencyPair());
      const transferRate = transferRateFromPricingRule(
        side,
        clientRate,
        marginPercent,
        pair?.defaultQuoteDecimals
      );

      transferRateInput.readOnly = true;
      transferRateInput.dataset.pricingRuleCalculated = "true";
      transferRateInput.value = Number.isFinite(transferRate)
        ? formatMarketQuote(transferRate, pair)
        : "";
    }

    function syncDealTransferCalculations() {
      const currencies = dealFormCurrencies();
      const pnl = exactAnalyticalPnlText({
        side: String(editForm.elements.side.value || "").toUpperCase(),
        baseCcyAmount: editForm.elements.amount.value,
        tradeRate: editForm.elements.clientRate.value,
        transferRate: editForm.elements.autoBatchRate.value,
        quoteFractionDigits: currencyFractionDigits(currencies.quote)
      });

      editForm.elements.pnlCash.value = pnl === null ? "" : groupedDecimalText(pnl);
    }

    function prepareEditDealForm() {
      editForm.querySelectorAll("input, select").forEach(control => {
        const isComment = control.name === "comment";

        control.disabled = control.tagName === "SELECT" && !isComment;
        if (control instanceof HTMLInputElement) {
          control.readOnly = !isComment;
        }
      });
      dealIdentitySection.open = false;
    }

    function syncDealFormDerivedFields(event = null) {
      syncDealClientContext(event?.target || null);
      syncDealPricingRuleSelection();

      const pricingRule = selectedDealPricingRule();
      const pricingContext = pricingContextById(pricingRule?.pricingContextId);
      const tradeDate = parseDisplayDate(editForm.elements.tradeDate.value);

      if (pricingContext) {
        editForm.elements.branchCode.value = pricingContext.servicingBranchCode;
      } else {
        editForm.elements.branchCode.value = "";
      }

      editForm.elements.branchCode.setCustomValidity("");
      syncDealCurrencyLabels();

      if (isValidDate(tradeDate)) {
        editForm.elements.valueDate.value = formatDisplayDate(valueDateFromTradeDate(tradeDate, editForm.elements.tenor.value));
        editForm.elements.tradeDate.setCustomValidity("");
      } else if (editForm.elements.tradeDate.value.trim()) {
        editForm.elements.valueDate.value = "";
        editForm.elements.tradeDate.setCustomValidity("Trade Date must look like 29.06.2026.");
      }

      syncDealMarketQuotes();
      syncDealTransferRateFromPricingRule();
      syncDealAmountInputs();
      syncDealTransferCalculations();
    }

    function syncSyntheticAutoBatchRate() {
      const deal = editingDealId ? findFxPositionById(editingDealId) : null;

      if (deal?.synthetic) {
        editForm.elements.autoBatchRate.value = editForm.elements.clientRate.value;
      }
    }

    function showDealDialog() {
      openDialogWithoutFieldFocus(editDialog);
    }

    function openEditDialog(dealId) {
      const deal = findFxPositionById(dealId);

      if (
        !deal
        || deal.synthetic
        || fxPositionType(deal) !== "CLIENT_DEAL"
        || deal.databaseBackedClientFxDeal !== true
      ) {
        return;
      }

      const side = sideOf(deal);
      const amount = side === "buy" ? deal.amountBuy : deal.amountSell;
      const autoBatchInput = editForm.elements.autoBatchRate;
      const pair = currencyPair(deal);
      const currencies = currenciesFromPair(pair);
      const storedMarketStatus = String(deal.entryMarketStreamStatus || "").trim().toUpperCase();
      const marketStatusIndicator = editForm.querySelector("[data-edit-client-deal-market-status]");

      editingDealId = deal.id;
      editForm.reset();
      delete editForm.elements.autoBatchRate.dataset.pricingRuleCalculated;
      clearFormValidity();
      populateDealClientOptions(deal.clientName || clientDealProfiles()[0]?.name || "", deal.inn || "");

      editForm.elements.dealId.value = deal.id || "";
      editForm.elements.entryDate.value = deal.executionTimestamp || positionEntryDate(deal);
      editForm.elements.branchCode.value = deal.branchCode || "";
      editForm.elements.clientCode.value = deal.inn || innForClientName(deal.clientName);
      editForm.elements.clientName.value = deal.clientName || "";
      renderDealCurrencyPairOptions(pair);
      editForm.elements.tradeDate.value = positionTradeDate(deal);
      editForm.elements.valueDate.value = baseCurrencyValueDate(deal);
      editForm.elements.quoteValueDate.value = quoteCurrencyValueDate(deal);
      editForm.elements.tenor.value = positionTenor(deal) || "TOD";
      editForm.elements.side.innerHTML = `
        <option value="buy">BUY ${escapeHtml(currencies.base)}</option>
        <option value="sell">SELL ${escapeHtml(currencies.base)}</option>
      `;
      editForm.elements.side.value = side === "buy" ? "buy" : "sell";
      editForm.elements.amountFixingCurrency.value = "base";
      editForm.elements.amount.value = amountInputValue(amount);
      editForm.elements.quoteAmount.value = Number.isFinite(Number(deal.quoteCcyAmount))
        ? amountInputValue(Number(deal.quoteCcyAmount))
        : "";
      editForm.elements.clientRate.value = editNumber(deal.clientRate, 4);
      autoBatchInput.value = editNumber(deal.autoBatchRate, 4);
      editForm.elements.pnlCash.value = amountInputValue(pnlCash(deal));
      editForm.elements.currentMarketBid.value = Number.isFinite(Number(deal.entryMarketBid))
        ? formatMarketQuote(Number(deal.entryMarketBid), marketPairs.find(item => item.currencyPair === pair))
        : "";
      editForm.elements.currentMarketOffer.value = Number.isFinite(Number(deal.entryMarketOffer))
        ? formatMarketQuote(Number(deal.entryMarketOffer), marketPairs.find(item => item.currencyPair === pair))
        : "";
      editForm.elements.currentMarketStatus.value = storedMarketStatus;
      editForm.elements.comment.value = String(deal.comment || "");
      setDealPricingRuleSelection(pricingRuleForDealFormSource(deal));

      syncDealCurrencyLabels();
      renderLockedEditClientDealContext(deal);
      editForm.querySelector("[data-edit-client-deal-trade-date-summary]").textContent =
        editForm.elements.tradeDate.value || "—";
      editForm.querySelector("[data-edit-client-deal-base-value-date-summary]").textContent =
        editForm.elements.valueDate.value || "—";
      editForm.querySelector("[data-edit-client-deal-quote-value-date-summary]").textContent =
        editForm.elements.quoteValueDate.value || "—";
      marketStatusIndicator.classList.toggle("is-active", storedMarketStatus === "RUNNING");
      marketStatusIndicator.classList.toggle("is-stopped", storedMarketStatus === "STOPPED");
      document.getElementById("editClientDealMarketPulse").classList.toggle(
        "is-live",
        storedMarketStatus === "RUNNING"
          && Number.isFinite(Number(deal.entryMarketBid))
          && Number.isFinite(Number(deal.entryMarketOffer))
      );
      editForm.querySelectorAll("[data-edit-client-deal-loss-field]").forEach(field => {
        field.classList.toggle("is-negative-pnl", Number(deal.pnlCash) < 0);
      });
      marketStatusIndicator.querySelector("[data-edit-client-deal-market-status-text]").textContent =
        storedMarketStatus === "RUNNING"
          ? "Active"
          : storedMarketStatus === "STOPPED"
            ? "Stopped"
            : "Unavailable";
      prepareEditDealForm();
      dealIdentitySection.open = true;

      showDealDialog();
    }

    function openSelectedEditDialog() {
      const deal = selectedEditableDeal();

      if (!deal) {
        return;
      }

      openEditDialog(deal.id);
    }

    function closeEditDialog() {
      if (typeof editDialog.close === "function") {
        editDialog.close();
      } else {
        editDialog.removeAttribute("open");
        editingDealId = null;
      }
    }

    async function saveEditedDeal(event) {
      event.preventDefault();

      const deal = editingDealId ? findFxPositionById(editingDealId) : null;

      if (
        !deal
        || fxPositionType(deal) !== "CLIENT_DEAL"
        || deal.databaseBackedClientFxDeal !== true
        || !Number.isInteger(deal.clientFxDealId)
        || deal.clientFxDealId <= 0
      ) {
        closeEditDialog();
        return;
      }

      if (!DEMO_API_ENABLED) {
        setBatchStatus("SQLite API is unavailable. Comment was not saved.", "error");
        return;
      }

      const comment = String(editForm.elements.comment.value || "").trim();
      editForm.elements.comment.setCustomValidity(
        comment.length <= 500 && !/[\r\n]/.test(comment)
          ? ""
          : "Comment must be a single line of no more than 500 characters."
      );

      if (!editForm.elements.comment.reportValidity()) {
        return;
      }

      const submitButton = document.getElementById("dealSubmitButton");
      submitButton.disabled = true;

      try {
        await demoApiRequest(
          `/api/v1/client-fx-deals/${encodeURIComponent(deal.clientFxDealId)}`,
          {
            method: "PATCH",
            body: JSON.stringify({ comment })
          }
        );
        await refreshClientDealViewsFromApi();
        setBatchStatus(
          `Comment for Client FX Deal ${deal.clientFxDealId} was saved successfully.`,
          "success"
        );
        closeEditDialog();
        render(fxPositions);
      } catch (error) {
        setBatchStatus(error.message || "Unable to save the Client FX Deal Comment.", "error");
      } finally {
        submitButton.disabled = false;
      }
    }

    function renderDealRow(deal) {
      const side = sideOf(deal);
      const sourceClass = deal.synthetic ? "open-row" : `source-${deal.tone || "blue"}`;
      const selected = selectedTradeIds.has(deal.id);
      const positionType = fxPositionType(deal);
      const hedgeDealClass = positionType === "HEDGE_DEAL"
        ? " is-hedge-deal"
        : "";
      const batchTechnicalClass = ["BATCH_POSITION_OUT", "BATCH_BALANCE_TRADE"].includes(positionType)
        ? " is-batch-technical"
        : "";
      const rowClass =
        `${sourceClass} side-${side}${hedgeDealClass}${batchTechnicalClass}${selected ? " is-selected" : ""}`;
      const sellActive = side === "sell";
      const buyActive = side === "buy";
      const flatActive = side === "flat";
      const safeId = escapeHtml(deal.id);
      const safeTradeLabel = escapeHtml(fxPositionTradeLabel(deal));
      const safeTradeId = escapeHtml(fxPositionTradeId(deal));
      const tradeTypePresentation = fxPositionTradeTypePresentation(deal);
      const tradeContext = fxPositionTradeContext(deal, tradeTypePresentation.type);
      const tradeTypeTooltip = fxPositionTradeTypeTooltip(deal, tradeTypePresentation);
      const baseCcyAmount = flatActive
        ? formattedMinorAmount("0", fxPositionBaseCcyFractionDigits(deal) ?? 0)
        : fxPositionBaseAmountCell(deal);
      const tradeRate = fxPositionTradeRate(deal);
      const transferRate = fxPositionTransferRate(deal);
      const selectionBox = isBatchableFxPositionTrade(deal)
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
