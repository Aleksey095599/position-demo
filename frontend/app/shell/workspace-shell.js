    async function copyTextToClipboard(text) {
      if (!text) {
        return false;
      }

      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(text);
          return true;
        } catch {
          return fallbackCopyText(text);
        }
      }

      return fallbackCopyText(text);
    }

    function showTradeIdCopyFeedback(button, copied) {
      const existingTimer = tradeIdCopyFeedbackTimers.get(button);

      if (existingTimer) {
        window.clearTimeout(existingTimer);
      }

      const icon = button.querySelector("[data-trade-id-copy-icon]");
      const status = button.querySelector("[data-trade-id-copy-status]");
      const feedbackClass = copied ? "is-copied" : "is-copy-error";
      const feedbackMessage = copied ? "Trade ID copied" : "Trade ID was not copied";

      button.classList.remove("is-copied", "is-copy-error");
      button.classList.add(feedbackClass);
      button.dataset.tooltip = feedbackMessage;
      button.setAttribute("aria-label", feedbackMessage);
      icon.textContent = copied ? "check" : "error";
      status.textContent = `${feedbackMessage}.`;
      hideAppTooltip();

      const resetTimer = window.setTimeout(() => {
        if (!button.isConnected) {
          return;
        }

        button.classList.remove("is-copied", "is-copy-error");
        button.dataset.tooltip = "Copy Trade ID";
        button.setAttribute("aria-label", "Copy Trade ID");
        icon.textContent = "content_copy";
        status.textContent = "";
        tradeIdCopyFeedbackTimers.delete(button);
      }, 1500);

      tradeIdCopyFeedbackTimers.set(button, resetTimer);
    }

    function render(source) {
      ensureSelectedCurrencyPair(source);
      clearHiddenFxPositionSelection();
      const rows = currentDisplayRows();

      renderFxPositionModeTabs(source);
      updateSortButtons();
      renderCurrencyPairList(source);
      updateActionButtons();
      updateSelectAllCheckboxes(rows);
      rowsEl.innerHTML = `${rows.map(renderDealRow).join("")}${fxPositionGridFillRow()}`;
      renderBatchingSummary(rows);
      renderClientFxDeals(source);
      renderHedgeFxDeals(source);
      renderClientProfiles();
      renderUsers();
      renderReferenceData();
      renderPricingContexts();
      renderPricingRules();
      renderClientExecutionContextsPanel(selectedClientProfile());
      renderClientPricingRulesPanel(selectedClientProfile());
      renderMarketPage();
      scheduleSmartColumnSizing();
      scheduleFxPositionGridFillHeight();
    }

    function applyInitialPageMode() {
      const hedgingSettingsWasVisible = !hedgingSettingsPage.hidden;
      batchDetailsRequestSequence += 1;
      analyticalPnlReportRequestSequence += 1;
      fxDealsPage.hidden = true;
      clientFxDealsPage.hidden = true;
      hedgeFxDealsPage.hidden = true;
      analyticalPnlReportPage.hidden = true;
      batchingSettingsPage.hidden = true;
      hedgingSettingsPage.hidden = true;
      databasePage.hidden = true;
      processesPage.hidden = true;
      fxBatchesPage.hidden = true;
      batchingHistoryPage.hidden = true;
      batchDetailsPage.hidden = true;

      if (location.hash === "#batching:details") {
        location.hash = batchingHistoryRoute();
        return;
      }

      if (isBatchDetailsRoute()) {
        setWorkspaceRoute("batch-details");
        marketPage.hidden = true;
        mainPage.hidden = true;
        clientProfilePage.hidden = true;
        pricingPage.hidden = true;
        referenceDataPage.hidden = true;
        pricingRulesPage.hidden = true;
        batchDetailsPage.hidden = false;
        document.title = "Batch Structure";
        loadBatchDetailsPage();
        return;
      }

      if (isBatchingHistoryRoute()) {
        setWorkspaceRoute("batching-history");
        marketPage.hidden = true;
        mainPage.hidden = true;
        clientProfilePage.hidden = true;
        pricingPage.hidden = true;
        referenceDataPage.hidden = true;
        pricingRulesPage.hidden = true;
        fxBatchesPage.hidden = false;
        batchingHistoryPage.hidden = false;
        document.title = "FX Batches";
        loadBatchingHistoryPage();
        return;
      }

      if (isBatchFormationAuditRoute()) {
        setWorkspaceRoute("batching-history");
        marketPage.hidden = true;
        mainPage.hidden = true;
        clientProfilePage.hidden = true;
        pricingPage.hidden = true;
        referenceDataPage.hidden = true;
        pricingRulesPage.hidden = true;
        fxBatchesPage.hidden = false;
        batchingHistoryPage.hidden = false;
        setFxBatchesViewMode(FX_BATCHES_VIEW_MODE_AUDIT);
        document.title = "FX Batches";
        loadBatchingHistoryPage();
        return;
      }

      if (isClientFxDealsRoute()) {
        setWorkspaceRoute("client-fx-deals");
        marketPage.hidden = true;
        mainPage.hidden = true;
        clientProfilePage.hidden = true;
        pricingPage.hidden = true;
        referenceDataPage.hidden = true;
        pricingRulesPage.hidden = true;
        fxDealsPage.hidden = false;
        clientFxDealsPage.hidden = false;
        setFxDealsActiveTab("client-fx-deals");
        document.title = "Client FX Deals";
        return;
      }

      if (isHedgeFxDealsRoute()) {
        setWorkspaceRoute("hedge-fx-deals");
        marketPage.hidden = true;
        mainPage.hidden = true;
        clientProfilePage.hidden = true;
        pricingPage.hidden = true;
        referenceDataPage.hidden = true;
        pricingRulesPage.hidden = true;
        fxDealsPage.hidden = false;
        hedgeFxDealsPage.hidden = false;
        setFxDealsActiveTab("hedge-fx-deals");
        document.title = "Hedge FX Deals";
        return;
      }

      if (isAnalyticalPnlReportRoute()) {
        setWorkspaceRoute("analytical-pnl-report");
        marketPage.hidden = true;
        mainPage.hidden = true;
        clientProfilePage.hidden = true;
        pricingPage.hidden = true;
        referenceDataPage.hidden = true;
        pricingRulesPage.hidden = true;
        analyticalPnlReportPage.hidden = false;
        document.title = "Analytical PnL Report";
        loadAnalyticalPnlReport();
        return;
      }

      if (isBatchingSettingsRoute()) {
        setWorkspaceRoute("batching-settings");
        marketPage.hidden = true;
        mainPage.hidden = true;
        clientProfilePage.hidden = true;
        pricingPage.hidden = true;
        referenceDataPage.hidden = true;
        pricingRulesPage.hidden = true;
        batchingSettingsPage.hidden = false;
        document.title = "Batching Settings";
        loadBatchingSettingsPage();
        return;
      }

      if (isHedgingSettingsRoute()) {
        setWorkspaceRoute("hedging-settings");
        marketPage.hidden = true;
        mainPage.hidden = true;
        clientProfilePage.hidden = true;
        pricingPage.hidden = true;
        referenceDataPage.hidden = true;
        pricingRulesPage.hidden = true;
        hedgingSettingsPage.hidden = false;
        document.title = "Hedging Settings";
        loadHedgingSettingsPage({ reload: !hedgingSettingsWasVisible });
        return;
      }

      if (isUsersRoute()) {
        setWorkspaceRoute("users");
        marketPage.hidden = true;
        mainPage.hidden = true;
        pricingPage.hidden = true;
        referenceDataPage.hidden = true;
        pricingRulesPage.hidden = true;
        clientProfilePage.hidden = false;
        setProfileWorkspaceView("users");
        syncUsersRouteView();
        return;
      }

      if (isClientProfileRoute()) {
        setWorkspaceRoute("profile");
        marketPage.hidden = true;
        mainPage.hidden = true;
        pricingPage.hidden = true;
        referenceDataPage.hidden = true;
        pricingRulesPage.hidden = true;
        clientProfilePage.hidden = false;
        setProfileWorkspaceView("counterparties");
        syncClientProfileRouteView();
        return;
      }

      if (isCurrencySettingsRoute()) {
        const settingsKind = activeMarketKind();
        const settingsTitle = settingsKind === "pairs"
          ? "Currency Pair Settings"
          : "Currency Settings";
        syncMarketSettingsRouteView();
        setWorkspaceRoute(settingsKind === "pairs" ? "settings-currency-pairs" : "settings-currencies");
        mainPage.hidden = true;
        clientProfilePage.hidden = true;
        pricingPage.hidden = true;
        referenceDataPage.hidden = true;
        pricingRulesPage.hidden = true;
        marketPage.hidden = false;
        document.title = marketSettingsRouteScope
          ? `${settingsTitle} - ${marketSettingsRouteScope.currencyCode}`
          : settingsTitle;
        renderMarketPage();
        return;
      }

      if (isMarketRoute()) {
        syncMarketSettingsRouteView();
        setWorkspaceRoute("market");
        mainPage.hidden = true;
        clientProfilePage.hidden = true;
        pricingPage.hidden = true;
        referenceDataPage.hidden = true;
        pricingRulesPage.hidden = true;
        marketPage.hidden = false;
        document.title = "Market Pulse";
        renderMarketPage();
        return;
      }

      if (isDatabaseRoute()) {
        setWorkspaceRoute("database");
        marketPage.hidden = true;
        mainPage.hidden = true;
        clientProfilePage.hidden = true;
        pricingPage.hidden = true;
        referenceDataPage.hidden = true;
        pricingRulesPage.hidden = true;
        databasePage.hidden = false;
        document.title = "Database";
        loadDatabaseExplorer();
        return;
      }

      if (isProcessCatalogRoute()) {
        setWorkspaceRoute("processes");
        marketPage.hidden = true;
        mainPage.hidden = true;
        clientProfilePage.hidden = true;
        pricingPage.hidden = true;
        referenceDataPage.hidden = true;
        pricingRulesPage.hidden = true;
        processesPage.hidden = false;
        renderProcessCatalogRoute();
        return;
      }

      if (isPricingRoute()) {
        setWorkspaceRoute("pricing");
        marketPage.hidden = true;
        mainPage.hidden = true;
        clientProfilePage.hidden = true;
        referenceDataPage.hidden = true;
        pricingRulesPage.hidden = true;
        pricingPage.hidden = false;
        syncPricingContextRouteView();
        document.title = pricingContextRouteScope
          ? `Execution Contexts - ${pricingContextRouteScope.value}`
          : "Execution Context";
        return;
      }

      if (isReferenceDataRoute()) {
        referenceDataEditState = null;
        updateReferenceDataVisibility();
        setWorkspaceRoute("reference");
        marketPage.hidden = true;
        mainPage.hidden = true;
        clientProfilePage.hidden = true;
        pricingPage.hidden = true;
        pricingRulesPage.hidden = true;
        referenceDataPage.hidden = false;
        document.title = `Reference Data - ${referenceDataPluralLabel(activeReferenceDataKind())}`;
        return;
      }

      if (isPricingRulesRoute()) {
        pricingRulesClientInnFilter = "";
        pricingRuleEditState = null;
        activePricingRulesScope = pricingRulesScopeFromRoute();
        syncPricingRulesRouteView();
        setWorkspaceRoute("pricing-rules");
        marketPage.hidden = true;
        mainPage.hidden = true;
        clientProfilePage.hidden = true;
        pricingPage.hidden = true;
        referenceDataPage.hidden = true;
        pricingRulesPage.hidden = false;
        document.title = pricingRulesRouteScope
          ? `Pricing Rules - ${pricingRulesRouteScope.currencyPair}`
          : "Pricing Rules";
        return;
      }

      if (isBatchingBlotterRoute()) {
        setActiveFxPositionMode(fxPositionModeFromLocation());
        setWorkspaceRoute("batching");
        marketPage.hidden = true;
        mainPage.hidden = false;
        clientProfilePage.hidden = true;
        pricingPage.hidden = true;
        referenceDataPage.hidden = true;
        pricingRulesPage.hidden = true;
        document.title = "FX Position";
        return;
      }

      location.hash = batchingBlotterRoute();
    }

    workspaceNavMenuEntries.forEach(entry => {
      entry.toggle.addEventListener("click", event => {
        event.stopPropagation();
        const isOpen = entry.toggle.getAttribute("aria-expanded") === "true";
        setWorkspaceNavMenuOpen(entry, !isOpen);
      });
      entry.toggle.addEventListener("keydown", event => {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          setWorkspaceNavMenuOpen(entry, true, true);
        } else if (event.key === "Escape") {
          setWorkspaceNavMenuOpen(entry, false);
        }
      });
      entry.menu.addEventListener("click", event => {
        if (event.target.closest("[data-workspace-route]")) {
          setWorkspaceNavMenuOpen(entry, false);
        }
      });
      entry.menu.addEventListener("keydown", event => {
        if (event.key === "Escape") {
          event.preventDefault();
          setWorkspaceNavMenuOpen(entry, false);
          entry.toggle.focus();
          return;
        }

        if (!["ArrowDown", "ArrowUp"].includes(event.key)) {
          return;
        }

        event.preventDefault();
        const currentIndex = entry.links.indexOf(document.activeElement);
        const direction = event.key === "ArrowDown" ? 1 : -1;
        const nextIndex = currentIndex < 0
          ? 0
          : (currentIndex + direction + entry.links.length) % entry.links.length;

        entry.links[nextIndex]?.focus();
      });
    });
    document.addEventListener("click", event => {
      const clickedInsideMenu = workspaceNavMenuEntries.some(
        entry => entry.menu.contains(event.target) || entry.toggle.contains(event.target)
      );

      if (!clickedInsideMenu) {
        closeWorkspaceNavMenus();
      }
    });
    window.addEventListener("resize", () => {
      workspaceNavMenuEntries.forEach(positionWorkspaceNavMenu);
    });
    window.addEventListener("scroll", () => {
      workspaceNavMenuEntries.forEach(positionWorkspaceNavMenu);
    }, true);

    sortButtons.forEach(button => {
      button.addEventListener("click", () => toggleSort(button.dataset.sortKey));
    });

    currencyPairListEl.addEventListener("click", event => {
      const button = event.target.closest("[data-currency-pair]");

      if (!button) {
        return;
      }

      setSelectedCurrencyPair(button.dataset.currencyPair);
    });

    createDealButton.addEventListener("click", openAddClientDealDialog);
    addHedgeDealButton.addEventListener(
      "click",
      () => openAddHedgeDealDialog()
    );
    fxPositionGridFrame.addEventListener(
      "scroll",
      scheduleHedgeQuickModeQuoteAlignment,
      { passive: true }
    );
    hedgeQuickModeToolbar.addEventListener("click", async event => {
      const quickPresetButton = event.target.closest("[data-hedge-quick-preset]");

      if (quickPresetButton) {
        selectHedgeQuickModePreset(
          quickPresetButton.dataset.hedgeQuickPreset,
          event.ctrlKey === true
        );
        return;
      }

      const quickAction = event.target.closest("[data-hedge-quick-action]");

      if (quickAction) {
        await createSelectedQuickHedgeDeal(
          quickAction.dataset.hedgeQuickAction,
          event.ctrlKey === true
        );
      }
    });
    hedgeQuickModeToolbar.addEventListener("keydown", async event => {
      const quickAction = event.target.closest("[data-hedge-quick-action]");

      if (!quickAction || event.key !== "Enter" || !event.ctrlKey) {
        return;
      }

      event.preventDefault();
      await createSelectedQuickHedgeDeal(
        quickAction.dataset.hedgeQuickAction,
        true
      );
    });
    document.addEventListener("keydown", event => {
      if (event.key === "Control" && !event.repeat) {
        setHedgeQuickModeUnlocked(true);
      }
    });
    document.addEventListener("keyup", event => {
      if (event.key === "Control") {
        setHedgeQuickModeUnlocked(false);
      }
    });
    window.addEventListener("blur", () => setHedgeQuickModeUnlocked(false));
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        setHedgeQuickModeUnlocked(false);
      }
    });
    editDealButton.addEventListener("click", openSelectedEditDialog);
    resetDemoTradesButton.addEventListener("click", openResetDemoTradesDialog);
    resetDemoTradesDialogClose.addEventListener("click", closeResetDemoTradesDialog);
    resetDemoTradesCancelButton.addEventListener("click", closeResetDemoTradesDialog);
    resetDemoTradesConfirmButton.addEventListener("click", confirmResetDemoTradeWorkspace);
    resetDemoTradesDialog.addEventListener("cancel", event => {
      event.preventDefault();
      closeResetDemoTradesDialog();
    });
    generateClientDealButton.addEventListener("click", generateClientDeal);
    runClientDealGenerationButton.addEventListener("click", toggleClientDealGenerationProcess);
    sendToAutoPositionModeButton.addEventListener("click", openSendToAutoPositionModeDialog);
    sendToAutoPositionModeDialogClose.addEventListener(
      "click",
      closeSendToAutoPositionModeDialog
    );
    sendToAutoPositionModeCancelButton.addEventListener(
      "click",
      closeSendToAutoPositionModeDialog
    );
    sendToAutoPositionModeConfirmButton.addEventListener(
      "click",
      confirmSendToAutoPositionMode
    );
    sendToAutoPositionModeDialog.addEventListener("cancel", event => {
      event.preventDefault();
      closeSendToAutoPositionModeDialog();
    });
    oneBatchButton.addEventListener("click", formOneBatchFromSelection);
    oneBatchTenorDialogClose.addEventListener("click", () => closeOneBatchTenorDialog());
    oneBatchTenorCancelButton.addEventListener("click", () => closeOneBatchTenorDialog());
    oneBatchTenorSelect.addEventListener("change", updateOneBatchSelectedTenorButton);
    oneBatchSelectedTenorButton.addEventListener("click", async () => {
      const selectedCompatibilityKey = oneBatchTenorSelect.value;
      const sourceDeals = (pendingOneBatchTenorSelection || []).filter(deal =>
        oneBatchCompatibilityKey(deal) === selectedCompatibilityKey
      );

      if (sourceDeals.length === 0) {
        setOneBatchTenorStatus(
          "Select a compatible Batching Key group containing at least one FX Trade."
        );
        return;
      }

      await submitOneBatchSelection(sourceDeals);
    });
    oneBatchTenorDialog.addEventListener("cancel", event => {
      event.preventDefault();
      closeOneBatchTenorDialog();
    });
    autoBatchButton.addEventListener("click", toggleFxAutoBatchingProcess);
    batchRollbackDialogClose.addEventListener("click", closeBatchRollbackDialog);
    batchRollbackCancelButton.addEventListener("click", closeBatchRollbackDialog);
    batchRollbackConfirmButton.addEventListener("click", confirmBatchRollback);
    batchRollbackDialog.addEventListener("cancel", event => {
      event.preventDefault();
      closeBatchRollbackDialog();
    });
    clientDealSettingsButton.addEventListener("click", event => {
      event.stopPropagation();
      openClientDealGenerationDialog();
    });
    hedgeQuickModeSettingsButton.addEventListener("click", event => {
      event.stopPropagation();
      location.hash = hedgingSettingsRoute();
    });
    autoBatchingSettingsButton.addEventListener("click", event => {
      event.stopPropagation();
      location.hash = batchingSettingsRoute();
    });
    batchingSettingsTabs.forEach(tab => {
      tab.addEventListener("click", () => {
        setBatchingSettingsTab(tab.dataset.batchingSettingsTab);
      });
    });
    batchingSettingsForm.addEventListener("submit", saveBatchingSettings);
    batchingSettingsForm.addEventListener(
      "input",
      updateBatchingSettingsSaveAvailability
    );
    autoBatchingSettingsForm.addEventListener("submit", saveAutoBatchingSettings);
    autoBatchingSettingsForm.addEventListener(
      "input",
      updateAutoBatchingSettingsSaveAvailability
    );
    autoBatchingEligibleCcyPairCodes.addEventListener("change", event => {
      if (event.target.matches('input[name="eligibleCcyPairCodes"]')) {
        updateAutoBatchingEligibleCcyPairSummary();
      }
    });
    autoBatchingEligibleCcyPairSearch.addEventListener(
      "input",
      filterAutoBatchingEligibleCcyPairOptions
    );
    autoBatchingEligibleCcyPairSearchClear.addEventListener("click", () => {
      autoBatchingEligibleCcyPairSearch.value = "";
      filterAutoBatchingEligibleCcyPairOptions();
      autoBatchingEligibleCcyPairSearch.focus();
    });
    autoBatchingProcessFlowButton.addEventListener(
      "click",
      openAutoBatchingProcessFlowDialog
    );
    autoBatchingProcessFlowDialogClose.addEventListener(
      "click",
      closeAutoBatchingProcessFlowDialog
    );
    autoBatchingProcessFlowCloseButton.addEventListener(
      "click",
      closeAutoBatchingProcessFlowDialog
    );
    autoBatchingProcessFlowDialog.addEventListener("cancel", event => {
      event.preventDefault();
      closeAutoBatchingProcessFlowDialog();
    });
    addClientDealForm.addEventListener("submit", createClientDeal);
    addClientDealForm.addEventListener("click", selectAddClientDealAmountFixingCurrency);
    addClientDealForm.addEventListener("keydown", handleAddClientDealControlEnter);
    addClientDealSubmitButton.addEventListener("click", captureAddClientDealControlConfirmation);
    addClientDealDialogClose.addEventListener("click", closeAddClientDealDialog);
    addClientDealCancelButton.addEventListener("click", closeAddClientDealDialog);
    clientDealDuplicateCheckCloseButton.addEventListener("click", () => closeClientDealDuplicateCheck());
    clientDealDuplicateCheckCancelButton.addEventListener("click", () => closeClientDealDuplicateCheck());
    clientDealDuplicateCheckConfirmButton.addEventListener("click", confirmClientDealDuplicateCheck);
    clientDealDuplicateCheckDialog.addEventListener("cancel", event => {
      event.preventDefault();
      closeClientDealDuplicateCheck();
    });
    addClientDealDialog.addEventListener("cancel", event => {
      event.preventDefault();
      closeAddClientDealDialog();
    });
    addClientDealDialog.addEventListener("close", () => {
      if (clientDealDuplicateCheckDialog.open) {
        closeClientDealDuplicateCheck({ restoreFormFocus: false, clearPending: true });
      }

      addClientDealSubmitButton.disabled = false;
      addClientDealSubmitWithControl = false;
      setAddClientDealLossConfirmation(false);
      setAddClientDealClientPickerExpanded(false);
      addClientDealPricingRulesExpanded = false;
      addClientDealForm.reset();
    });
    addHedgeDealForm.addEventListener("submit", createHedgeDeal);
    addHedgeDealForm.addEventListener("click", selectAddHedgeDealAmountFixingCurrency);
    addHedgeDealDialogClose.addEventListener("click", closeAddHedgeDealDialog);
    addHedgeDealCancelButton.addEventListener("click", closeAddHedgeDealDialog);
    addHedgeDealDialog.addEventListener("cancel", event => {
      event.preventDefault();
      closeAddHedgeDealDialog();
    });
    addHedgeDealDialog.addEventListener("close", () => {
      addHedgeDealSubmitButton.disabled = false;
      addHedgeDealCounterpartyPickerExpanded = false;
      addHedgeDealPricingRulesExpanded = false;
      addHedgeDealPricingModeLocked = false;
      addHedgeDealSideLocked = false;
      addHedgeDealQuickModeSelection = null;
      addHedgeDealPositionManagementMode = null;
      addHedgeDealCounterpartyPicker.classList.remove("is-invalid");
      addHedgeDealPricingRulePicker.classList.remove("is-invalid");
      addHedgeDealForm.reset();
      addHedgeDealForm.elements.tradeRate.readOnly = false;
      addHedgeDealForm.elements.tradeRate.setCustomValidity("");
      syncAddHedgeDealModeLocks();
    });
    hedgeQuickModeSettingsForm.addEventListener("submit", saveHedgeQuickModeSettings);
    hedgeQuickModeSettingsNewButton.addEventListener(
      "click",
      () => openHedgeQuickModeSettingsEditor()
    );
    hedgeQuickModeSettingsBackButton.addEventListener(
      "click",
      () => showHedgeQuickModeSettingsOverview()
    );
    hedgeQuickModeSettingsCancelButton.addEventListener(
      "click",
      () => {
        if (hedgeQuickModeSettingsView === "editor") {
          showHedgeQuickModeSettingsOverview();
        }
      }
    );
    hedgeQuickModeSettingsDeleteButton.addEventListener(
      "click",
      deleteHedgeQuickModeSettings
    );
    editForm.addEventListener("submit", saveEditedDeal);
    editDialogClose.addEventListener("click", closeEditDialog);
    editCancelButton.addEventListener("click", closeEditDialog);
    clientDealGenerationProcessSettingsForm.addEventListener(
      "submit",
      saveClientDealGenerationProcessSettings
    );
    clientDealGenerationProcessSettingsForm.addEventListener(
      "input",
      updateClientDealGenerationProcessSettingsSaveAvailability
    );
    clientDealGenerationSettingsRows.addEventListener("input", event => {
      const row = event.target.closest("[data-generation-settings-pricing-rule-id]");
      const amountInput = event.target.closest("[data-generation-settings-amount]");

      if (amountInput) {
        formatGroupedNumberInputElement(amountInput);
      }

      const input = event.target.closest("[data-generation-settings-field='buyProbabilityPercent']");

      if (input && row) {
        const buyProbability = Number(input.value);
        const sellProbability = row.querySelector("[data-generation-settings-sell-probability]");
        sellProbability.textContent = Number.isInteger(buyProbability)
          && buyProbability >= 0
          && buyProbability <= 100
          ? `${100 - buyProbability}%`
          : "—";
      }

      if (row) {
        updateClientDealGenerationSettingsSaveAvailability(row);
      }
    });
    clientDealGenerationSettingsRows.addEventListener("click", event => {
      const editButton = event.target.closest("[data-generation-settings-edit]");
      const saveButton = event.target.closest("[data-generation-settings-save]");
      const cancelButton = event.target.closest("[data-generation-settings-cancel]");
      const row = (editButton || saveButton || cancelButton)
        ?.closest("[data-generation-settings-pricing-rule-id]");

      if (row && editButton) {
        editClientDealGenerationSettingsRow(row);
      } else if (row && saveButton) {
        saveClientDealGenerationSettingsRow(row);
      } else if (row && cancelButton) {
        cancelClientDealGenerationSettingsRowEdit();
      }
    });
    generationDialogClose.addEventListener("click", closeClientDealGenerationDialog);
    generationCancelButton.addEventListener("click", closeClientDealGenerationDialog);
    clientDealGenerationDialog.addEventListener("cancel", event => {
      event.preventDefault();
      closeClientDealGenerationDialog();
    });
    clientDealGenerationDialog.addEventListener("close", () => {
      clientDealSettingsButton.setAttribute("aria-expanded", "false");
    });
    marketCcyOptionNewButton.addEventListener("click", () => startMarketCcyOptionEdit());
    marketCcyOptionRowsEl.addEventListener("input", event => {
      const row = event.target.closest("[data-market-ccy-option-edit-index]");

      if (row) {
        if (event.target.matches("[data-market-ccy-option-field='code']")) {
          event.target.value = event.target.value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, ccyOptionTextLimits.code);
        } else if (event.target.matches("[data-market-ccy-option-field='name'], [data-market-ccy-option-field='country']")) {
          const field = event.target.dataset.marketCcyOptionField;
          event.target.value = event.target.value
            .replace(/[^A-Za-z ]/g, "")
            .replace(/\s{2,}/g, " ")
            .slice(0, ccyOptionTextLimits[field]);
        }

        updateMarketCcyOptionRowSaveAvailability(row);
      }
    });
    marketCcyOptionRowsEl.addEventListener("change", event => {
      const row = event.target.closest("[data-market-ccy-option-edit-index]");

      if (row) {
        updateMarketCcyOptionRowSaveAvailability(row);
      }
    });
    marketPairOptionNewButton.addEventListener("click", () => startMarketPairOptionEdit());
    marketPairOptionRowsEl.addEventListener("input", event => {
      const row = event.target.closest("[data-market-pair-option-edit-index]");

      if (row) {
        syncMarketPairOptionEditRow(row);
      }
    });
    marketPairOptionRowsEl.addEventListener("change", event => {
      const row = event.target.closest("[data-market-pair-option-edit-index]");

      if (row) {
        syncMarketPairOptionEditRow(row);
      }
    });
    marketSimulationForm.addEventListener("submit", saveMarketSimulationSettingsFromForm);
    marketSimulationDialogClose.addEventListener("click", closeMarketSimulationDialog);
    marketSimulationCancelButton.addEventListener("click", closeMarketSimulationDialog);
    marketSimulationDialog.addEventListener("close", () => {
      editingMarketSimulationCurrencyPair = null;
    });
    marketStreamToggleButton.addEventListener("click", toggleMarketStream);
    databaseRefreshButton.addEventListener("click", () => loadDatabaseExplorer());
    databaseTableSearchEl.addEventListener("input", () => {
      databaseTableSearchQuery = databaseTableSearchEl.value;
      renderDatabaseTableList();
    });
    databaseTableSearchEl.addEventListener("keydown", event => {
      if (event.key !== "Escape" || !databaseTableSearchEl.value) {
        return;
      }

      databaseTableSearchEl.value = "";
      databaseTableSearchQuery = "";
      renderDatabaseTableList();
    });
    databaseTableListEl.addEventListener("toggle", event => {
      const section = event.target;

      if (
        !(section instanceof HTMLDetailsElement)
        || !section.matches("[data-database-section]")
        || databaseTableSearchQuery.trim()
      ) {
        return;
      }

      const sectionId = section.dataset.databaseSection;

      if (section.open) {
        expandedDatabaseTableSections.add(sectionId);
      } else {
        expandedDatabaseTableSections.delete(sectionId);
      }
    }, true);
    databaseTableListEl.addEventListener("click", event => {
      const button = event.target.closest("[data-database-table]");

      if (!button) {
        return;
      }

      selectedDatabaseTable = button.dataset.databaseTable || "";
      expandedDatabaseTableSections.add(databaseTableSection(selectedDatabaseTable).id);
      loadDatabaseExplorer(selectedDatabaseTable);
    });
    clientProfileForm.addEventListener("submit", saveClientProfileFromForm);
    clientProfileForm.addEventListener("input", updateClientProfileSubmitAvailability);
    clientProfileForm.addEventListener("change", event => {
      if (event.target.name === "clientCodeType") {
        clientProfileForm.elements.inn.setCustomValidity("");
      }

      if (event.target.name === "counterpartyScope") {
        const scope = normalizedCounterpartyScope(event.target.value, activeTradingCounterpartyScope);
        const defaultRole = tradingCounterpartyScopeDefaultRole(scope);
        syncTradingCounterpartyFormScope(scope);

        if (selectedTradingCounterpartyFormRoles().length === 0) {
          setTradingCounterpartyFormRoles([defaultRole], defaultRole);
        }

        clientProfileForm.elements.inn.setCustomValidity("");
      }

      updateClientProfileSubmitAvailability();
    });
    clientProfileNewButton.addEventListener("click", () => {
      if (!clientProfileRouteScope) {
        startTradingCounterpartyRowCreate();
      }
    });
    tradingCounterpartyScopeTabs.addEventListener("click", event => {
      const button = event.target.closest("[data-trading-counterparty-scope]");

      if (!button || button.dataset.tradingCounterpartyScope === activeTradingCounterpartyScope) {
        return;
      }

      tradingCounterpartyRowEditState = null;
      setTradingCounterpartyScopeTab(button.dataset.tradingCounterpartyScope);
      if (!clientProfileRouteScope || clientProfileRouteScope.status === "loaded") {
        setClientProfileStatus("");
      }
      renderClientProfiles();
    });
    clientProfileBackButton.addEventListener("click", () => navigateToClientProfileRoute());
    tradingCounterpartyIdSortButton.addEventListener("click", () => {
      tradingCounterpartyIdSortDirection = tradingCounterpartyIdSortDirection === "asc" ? "desc" : "asc";
      renderClientProfiles();
    });
    tradingCounterpartyHeaderFilterControls.forEach(control => {
      control.addEventListener("input", renderClientProfiles);
      control.addEventListener("change", renderClientProfiles);
    });
    clientProfileResetButton.addEventListener("click", () => {
      navigateToClientProfileRoute();
    });
    clientProfileDeleteButton.addEventListener("click", () => {
      if (editingClientProfileIndex !== null) {
        removeClientProfile(editingClientProfileIndex);
      }
    });
    clientProfileRowsEl.addEventListener("click", event => {
      if (clientProfileRouteScope) {
        return;
      }

      const actionButton = event.target.closest("[data-profile-action]");

      if (actionButton) {
        const action = actionButton.dataset.profileAction;
        const editRow = actionButton.closest("[data-trading-counterparty-edit-row]");

        if (action === "save" && editRow) {
          saveTradingCounterpartyFromRow(editRow);
          return;
        }

        if (action === "cancel") {
          cancelTradingCounterpartyRowEdit();
          return;
        }

        const actionIndex = Number(actionButton.dataset.profileIndex);

        if (!Number.isInteger(actionIndex)) {
          return;
        }

        if (action === "edit") {
          navigateToClientProfileIndex(actionIndex);
          return;
        }

      }

      if (event.target.closest("[data-trading-counterparty-edit-row]")) {
        return;
      }

      const row = event.target.closest("[data-profile-index]");

      if (!row) {
        return;
      }

      const index = Number(row.dataset.profileIndex);

      if (!Number.isInteger(index)) {
        return;
      }

      navigateToClientProfileIndex(index);
    });
    clientProfileRowsEl.addEventListener("input", event => {
      const row = event.target.closest("[data-trading-counterparty-edit-row]");

      if (!row) {
        return;
      }

      if (event.target.matches("[data-trading-counterparty-field='counterpartyCode']")) {
        const codeType = activeTradingCounterpartyScope === "INTERNAL"
          ? "INTERNAL_UNIT_CODE"
          : normalizedClientCodeType(
              row.querySelector("[data-trading-counterparty-field='businessIdType']")?.value
            );

        if (codeType !== "INN") {
          event.target.value = normalizedContextCode(event.target.value);
        }
      }

      event.target.setCustomValidity?.("");
      updateTradingCounterpartyRowSaveAvailability(row);
    });
    clientProfileRowsEl.addEventListener("change", event => {
      const row = event.target.closest("[data-trading-counterparty-edit-row]");

      if (row) {
        row.querySelector("[data-trading-counterparty-field='counterpartyCode']")?.setCustomValidity("");
        updateTradingCounterpartyRowSaveAvailability(row);
      }
    });
    clientProfileRowsEl.addEventListener("keydown", event => {
      if (clientProfileRouteScope || (event.key !== "Enter" && event.key !== " ")) {
        return;
      }

      const row = event.target.closest("tr[data-profile-index]");

      if (!row || row.matches("[data-trading-counterparty-edit-row]") || event.target.closest("button, input, select")) {
        return;
      }

      const index = Number(row.dataset.profileIndex);

      if (Number.isInteger(index)) {
        event.preventDefault();
        navigateToClientProfileIndex(index);
      }
    });
    usersForm.addEventListener("submit", saveUserFromForm);
    usersForm.addEventListener("input", event => {
      if (event.target.name === "userCode") {
        event.target.value = event.target.value.toUpperCase();
      }

      clearUsersFormValidity();
      updateUsersSubmitAvailability();
    });
    usersForm.addEventListener("change", updateUsersSubmitAvailability);
    usersNewButton.addEventListener("click", startUserRowCreate);
    usersBackButton.addEventListener("click", () => navigateToUsersRoute());
    usersIdSortButton.addEventListener("click", () => {
      usersIdSortDirection = usersIdSortDirection === "asc" ? "desc" : "asc";
      renderUsers();
    });
    usersHeaderFilterControls.forEach(control => {
      control.addEventListener("input", renderUsers);
      control.addEventListener("change", renderUsers);
    });
    usersDeleteButton.addEventListener("click", () => {
      if (editingUserIndex !== null) {
        removeUser(editingUserIndex);
      }
    });
    usersResetButton.addEventListener("click", () => navigateToUsersRoute());
    usersRowsEl.addEventListener("click", event => {
      const actionButton = event.target.closest("[data-user-action]");

      if (!actionButton) {
        return;
      }

      const action = actionButton.dataset.userAction;
      const editRow = actionButton.closest("[data-user-edit-row]");

      if (action === "save" && editRow) {
        saveUserFromRow(editRow);
        return;
      }

      if (action === "cancel") {
        cancelUserRowEdit();
        return;
      }

      const index = Number(actionButton.dataset.userIndex);

      if (!Number.isInteger(index)) {
        return;
      }

      if (action === "edit") {
        startUserRowEdit(index);
        return;
      }

      if (action === "remove") {
        removeUser(index);
      }
    });
    usersRowsEl.addEventListener("input", event => {
      const row = event.target.closest("[data-user-edit-row]");

      if (!row) {
        return;
      }

      if (event.target.matches("[data-user-field='userCode']")) {
        event.target.value = event.target.value.toUpperCase();
      }

      event.target.setCustomValidity?.("");
      updateUserRowSaveAvailability(row);
    });
    usersRowsEl.addEventListener("change", event => {
      const row = event.target.closest("[data-user-edit-row]");

      if (row) {
        updateUserRowSaveAvailability(row);
      }
    });
    clientExecutionContextsAttachButton.addEventListener("click", () => {
      const profile = selectedClientProfile();
      const counterpartyId = tradingCounterpartyExecutionContextKey(profile);
      const loadState = tradingCounterpartyExecutionContextLoadStates.get(counterpartyId);

      if (profile && loadState?.status === "error") {
        refreshTradingCounterpartyExecutionContexts(profile);
        return;
      }

      openClientExecutionContextAttachDialog();
    });
    clientExecutionContextsPanel.addEventListener("click", event => {
      const inlineEditorButton = event.target.closest("[data-client-pricing-rule-inline-action]");
      const contextButton = event.target.closest("[data-client-execution-context-action]");
      const pricingRuleButton = event.target.closest("[data-client-pricing-rule-action]");

      if (inlineEditorButton) {
        if (inlineEditorButton.disabled) {
          return;
        }

        if (inlineEditorButton.dataset.clientPricingRuleInlineAction === "save") {
          saveClientPricingRuleInlineEditor();
        } else if (inlineEditorButton.dataset.clientPricingRuleInlineAction === "cancel") {
          cancelClientPricingRuleInlineEditor();
        }
        return;
      }

      if (pricingRuleButton) {
        const index = Number(pricingRuleButton.dataset.clientPricingRuleIndex);

        if (!Number.isInteger(index)) {
          return;
        }

        if (pricingRuleButton.dataset.clientPricingRuleAction === "edit") {
          startClientPricingRuleEdit(index);
        } else if (pricingRuleButton.dataset.clientPricingRuleAction === "delete") {
          startClientPricingRuleDelete(index);
        }
        return;
      }

      if (!contextButton || contextButton.disabled) {
        return;
      }

      const profile = selectedClientProfile();
      const contextId = normalizedIntegerId(contextButton.dataset.clientExecutionContextId);

      if (!profile || !contextId) {
        return;
      }

      if (contextButton.dataset.clientExecutionContextAction === "toggle") {
        const collapsedContexts = clientPricingConfigurationCollapsedSet(profile);
        const contextKey = String(contextId);

        if (collapsedContexts.has(contextKey)) {
          collapsedContexts.delete(contextKey);
        } else {
          collapsedContexts.add(contextKey);
        }

        renderClientExecutionContextsPanel(profile);
        clientExecutionContextsPanel
          .querySelector(`[data-client-execution-context-action="toggle"][data-client-execution-context-id="${contextId}"]`)
          ?.focus();
        return;
      }

      if (contextButton.dataset.clientExecutionContextAction === "add-rule") {
        startClientPricingRuleCreate(contextId);
        return;
      }

      if (contextButton.dataset.clientExecutionContextAction === "detach") {
        detachClientExecutionContext(profile, contextId);
      }
    });
    ["input", "change"].forEach(eventName => {
      clientExecutionContextsPanel.addEventListener(eventName, event => {
        const row = event.target.closest("[data-client-pricing-rule-inline-editor]");

        if (row) {
          updateClientPricingRuleInlineEditorAvailability(row);
        }
      });
    });
    clientExecutionContextsPanel.addEventListener("keydown", event => {
      const row = event.target.closest("[data-client-pricing-rule-inline-editor]");

      if (!row) {
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        saveClientPricingRuleInlineEditor();
      } else if (event.key === "Escape") {
        event.preventDefault();
        cancelClientPricingRuleInlineEditor();
      }
    });
    clientExecutionContextAttachForm.addEventListener("submit", attachSelectedExecutionContexts);
    clientExecutionContextAttachDialogClose.addEventListener("click", closeClientExecutionContextAttachDialog);
    clientExecutionContextAttachCancelButton.addEventListener("click", closeClientExecutionContextAttachDialog);
    clientExecutionContextAttachDialog.addEventListener("cancel", event => {
      if (clientExecutionContextAttachSaving) {
        event.preventDefault();
      }
    });
    clientExecutionContextAttachDialog.addEventListener("close", () => {
      clientExecutionContextAttachCounterpartyId = "";
      selectedClientExecutionContextIds.clear();
      setClientExecutionContextAttachStatus("");
    });
    clientExecutionContextAttachFilterControls.forEach(control => {
      control.addEventListener("input", renderClientExecutionContextAttachTable);
      control.addEventListener("change", renderClientExecutionContextAttachTable);
    });
    clientExecutionContextAttachIdSort.addEventListener("click", () => {
      clientExecutionContextAttachSortDirection = clientExecutionContextAttachSortDirection === "asc" ? "desc" : "asc";
      renderClientExecutionContextAttachTable();
    });
    clientExecutionContextAttachSelectAll.addEventListener("change", () => {
      filteredAvailableExecutionContextsForAttach().forEach(context => {
        if (clientExecutionContextAttachSelectAll.checked) {
          selectedClientExecutionContextIds.add(context.pricingContextId);
        } else {
          selectedClientExecutionContextIds.delete(context.pricingContextId);
        }
      });
      renderClientExecutionContextAttachTable();
    });
    clientExecutionContextAttachRows.addEventListener("change", event => {
      const checkbox = event.target.closest("[data-client-context-attach-select]");

      if (!checkbox) {
        return;
      }

      const contextId = normalizedIntegerId(checkbox.dataset.clientContextAttachSelect);

      if (checkbox.checked) {
        selectedClientExecutionContextIds.add(contextId);
      } else {
        selectedClientExecutionContextIds.delete(contextId);
      }
      renderClientExecutionContextAttachTable();
      focusClientExecutionContextAttachCheckbox(contextId);
    });
    clientExecutionContextAttachRows.addEventListener("click", event => {
      if (event.target.closest("input, button, a, select")) {
        return;
      }

      const row = event.target.closest("[data-client-context-attach-id]");
      const contextId = normalizedIntegerId(row?.dataset.clientContextAttachId);

      if (!contextId || clientExecutionContextAttachSaving) {
        return;
      }

      if (selectedClientExecutionContextIds.has(contextId)) {
        selectedClientExecutionContextIds.delete(contextId);
      } else {
        selectedClientExecutionContextIds.add(contextId);
      }
      renderClientExecutionContextAttachTable();
    });
    clientPricingRuleForm.addEventListener("submit", event => {
      event.preventDefault();
      saveClientPricingRuleFromCard();
    });
    clientPricingRuleForm.addEventListener("input", event => {
      const facetInput = event.target.closest("[data-pricing-context-facet]");

      if (facetInput) {
        clientPricingContextOpenFacet = facetInput.dataset.pricingContextFacet;
        syncClientPricingContextFacet(facetInput.dataset.pricingContextFacet);
        renderClientPricingContextBuilder();
      }

      syncClientPricingRulePositionManagementModeControls();
      updateClientPricingRuleSubmitAvailability();
    });
    clientPricingRuleForm.addEventListener("change", event => {
      const facetInput = event.target.closest("[data-pricing-context-facet]");

      if (facetInput) {
        clientPricingContextOpenFacet = facetInput.dataset.pricingContextFacet;
        syncClientPricingContextFacet(facetInput.dataset.pricingContextFacet, true);
        renderClientPricingContextBuilder();
      }

      syncClientPricingRulePositionManagementModeControls();
      updateClientPricingRuleSubmitAvailability();
    });
    clientPricingRuleForm.addEventListener("click", event => {
      const facetInput = event.target.closest("[data-pricing-context-facet]");
      const toggleButton = event.target.closest("[data-pricing-context-toggle]");
      const optionButton = event.target.closest("[data-pricing-context-option-field]");
      const clearButton = event.target.closest("[data-pricing-context-clear]");
      const resultsToggle = event.target.closest("[data-pricing-context-results-toggle]");
      const candidateButton = event.target.closest("[data-pricing-context-candidate]");

      if (optionButton) {
        selectClientPricingContextFacetOption(
          optionButton.dataset.pricingContextOptionField,
          optionButton.dataset.pricingContextOptionValue
        );
        updateClientPricingRuleSubmitAvailability();
        return;
      }

      if (toggleButton) {
        const field = toggleButton.dataset.pricingContextToggle;

        if (clientPricingContextOpenFacet === field) {
          closeClientPricingContextFacetMenus();
        } else {
          openClientPricingContextFacetMenu(field);
          pricingContextFacetInput(field)?.focus();
        }

        return;
      }

      if (clearButton) {
        clearClientPricingContextFacet(clearButton.dataset.pricingContextClear);
        updateClientPricingRuleSubmitAvailability();
        return;
      }

      if (resultsToggle) {
        clientPricingContextOpenFacet = "";
        clientPricingContextCandidatesExpanded = !clientPricingContextCandidatesExpanded;
        renderClientPricingContextBuilder();
        return;
      }

      if (candidateButton) {
        selectClientPricingContext(candidateButton.dataset.pricingContextCandidate);
        updateClientPricingRuleSubmitAvailability();
        return;
      }

      if (facetInput) {
        openClientPricingContextFacetMenu(facetInput.dataset.pricingContextFacet);
      }
    });
    clientPricingRuleForm.addEventListener("keydown", event => {
      const facetInput = event.target.closest("[data-pricing-context-facet]");
      const optionButton = event.target.closest("[data-pricing-context-option-field]");

      if (facetInput && (event.key === "ArrowDown" || event.key === "Enter")) {
        event.preventDefault();
        const field = facetInput.dataset.pricingContextFacet;
        openClientPricingContextFacetMenu(field);
        const optionButtons = Array.from(
          document.getElementById(pricingContextFacetDefinition(field).menuId)
            .querySelectorAll("[data-pricing-context-option-field]")
        );

        if (event.key === "Enter" && optionButtons.length === 1) {
          optionButtons[0].click();
        } else {
          optionButtons[0]?.focus();
        }

        return;
      }

      if (facetInput && event.key === "Escape") {
        event.preventDefault();
        closeClientPricingContextFacetMenus();
        return;
      }

      if (!optionButton) {
        return;
      }

      const field = optionButton.dataset.pricingContextOptionField;
      const optionButtons = Array.from(
        document.getElementById(pricingContextFacetDefinition(field).menuId)
          .querySelectorAll("[data-pricing-context-option-field]")
      );
      const currentIndex = optionButtons.indexOf(optionButton);

      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const direction = event.key === "ArrowDown" ? 1 : -1;
        const nextIndex = (currentIndex + direction + optionButtons.length) % optionButtons.length;
        optionButtons[nextIndex]?.focus();
      } else if (event.key === "Escape") {
        event.preventDefault();
        closeClientPricingContextFacetMenus();
        pricingContextFacetInput(field)?.focus();
      }
    });
    document.addEventListener("click", event => {
      if (
        clientPricingRuleDialog.open &&
        clientPricingContextOpenFacet &&
        !event.target.closest(".client-pricing-context-facet")
      ) {
        closeClientPricingContextFacetMenus();
      }
    });
    clientPricingRuleDialogClose.addEventListener("click", closeClientPricingRuleDialog);
    clientPricingRuleCancelButton.addEventListener("click", cancelClientPricingRuleEdit);
    clientPricingRuleDeleteButton.addEventListener("click", deleteClientPricingRuleFromDialog);
    clientPricingRuleDialog.addEventListener("close", () => {
      clientPricingRuleEditState = null;
      clearClientPricingRuleDialogValidity();
      renderClientPricingRuleEditor(null);
      renderClientPricingRulesPanel(selectedClientProfile());
    });
    pricingContextNewButton.addEventListener("click", startPricingContextCreate);
    pricingContextIdSortButton.addEventListener("click", () => {
      pricingContextIdSortDirection = pricingContextIdSortDirection === "asc" ? "desc" : "asc";
      renderPricingContexts();
    });
    pricingRuleIdSortButton.addEventListener("click", () => {
      pricingRuleIdSortDirection = pricingRuleIdSortDirection === "asc" ? "desc" : "asc";
      renderPricingRules();
    });
    pricingContextHeaderFilterControls.forEach(control => {
      control.addEventListener("input", renderPricingContexts);
      control.addEventListener("change", renderPricingContexts);
    });
    pricingContextRowsEl.addEventListener("click", event => {
      const button = event.target.closest("[data-pricing-context-action]");

      if (!button) {
        return;
      }

      const action = button.dataset.pricingContextAction;

      if (action === "save") {
        const row = button.closest("[data-pricing-context-edit-row]");

        if (row) {
          savePricingContextFromRow(row);
        }
        return;
      }

      if (action === "cancel") {
        cancelPricingContextForm();
        return;
      }

      const index = Number(button.dataset.pricingContextIndex);

      if (!Number.isInteger(index)) {
        return;
      }

      if (action === "view-trading-counterparties") {
        viewPricingContextTradingCounterparties(index);
        return;
      }

      if (action === "edit") {
        startPricingContextEdit(index);
        return;
      }

      if (action === "remove") {
        removePricingContext(index);
      }
    });
    ["input", "change"].forEach(eventName => {
      pricingContextRowsEl.addEventListener(eventName, event => {
        const row = event.target.closest("[data-pricing-context-edit-row]");

        if (row) {
          updatePricingContextRowSaveAvailability(row);
        }
      });
    });
    pricingRuleHeaderFilterControls.forEach(control => {
      control.addEventListener("input", renderPricingRules);
    });
    ["input", "change"].forEach(eventName => {
      pricingRuleRowsEl.addEventListener(eventName, event => {
        const row = event.target.closest("[data-pricing-rule-edit-row]");

        if (!row) {
          return;
        }

        if (event.target.matches("[data-pricing-rule-field='inn']")) {
          const profile = clientProfileByInn(event.target.value.trim());
          const counterpartyId = tradingCounterpartyExecutionContextKey(profile);
          const loadState = tradingCounterpartyExecutionContextLoadStates.get(counterpartyId);

          if (loadState?.status === "error") {
            tradingCounterpartyExecutionContextLoadStates.delete(counterpartyId);
          }
        }

        syncPricingRuleRowPreview(row);
      });
    });
    installUiTableLayoutButtons();
    applyAllUiTableLayouts();
    document.addEventListener("click", event => {
      const button = event.target.closest("[data-ui-table-layout]");

      if (button && !button.disabled) {
        const columnKeys = String(button.dataset.uiTableLayoutColumns || "")
          .split(/\s+/)
          .map(value => value.trim())
          .filter(Boolean);

        openUiTableLayoutDialog(button.dataset.uiTableLayout, {
          columnKeys,
          title: button.dataset.uiTableLayoutTitle
        });
      }
    });
    pricingRulesTableLayoutForm.addEventListener("submit", saveUiTableLayout);
    pricingRulesTableLayoutDialogClose.addEventListener("click", closeUiTableLayoutDialog);
    pricingRulesTableLayoutCancelButton.addEventListener("click", closeUiTableLayoutDialog);
    pricingRulesTableLayoutResetButton.addEventListener("click", resetUiTableLayout);
    pricingRulesTableLayoutSaveDefaultButton.addEventListener("click", saveUiTableLayoutAsDefault);
    pricingRulesTableLayoutDialog.addEventListener("cancel", event => {
      event.preventDefault();
      closeUiTableLayoutDialog();
    });
    pricingRulesTableLayoutDialog.addEventListener("close", () => {
      activeUiTableLayoutColumnKeys = null;
      activeUiTableLayoutTitle = "";
      pricingRulesTableLayoutSaveDefaultButton.hidden = false;
    });
    pricingRulesTableLayoutList.addEventListener("input", event => {
      if (event.target.matches("[data-ui-table-column-width]")) {
        event.target.setCustomValidity("");
      }
    });
    document.addEventListener("click", handleColumnFilterDocumentClick);
    document.addEventListener("keydown", handleColumnFilterKeydown);
    servicingBranchNewButton.addEventListener("click", () => startReferenceDataCreate("servicingBranch"));
    servicingBranchIdSortButton.addEventListener("click", () => {
      servicingBranchIdSortDirection = servicingBranchIdSortDirection === "asc" ? "desc" : "asc";
      renderReferenceData();
    });
    settlementSystemNewButton.addEventListener("click", () => startReferenceDataCreate("settlementSystem"));
    settlementSystemIdSortButton.addEventListener("click", () => {
      settlementSystemIdSortDirection = settlementSystemIdSortDirection === "asc" ? "desc" : "asc";
      renderReferenceData();
    });
    tradeCaptureChannelNewButton.addEventListener("click", () => startReferenceDataCreate("tradeCaptureChannel"));
    tradeCaptureChannelIdSortButton.addEventListener("click", () => {
      tradeCaptureChannelIdSortDirection = tradeCaptureChannelIdSortDirection === "asc" ? "desc" : "asc";
      renderReferenceData();
    });
    referenceDataFilterControls.forEach(control => {
      control.addEventListener("input", renderReferenceData);
      control.addEventListener("change", renderReferenceData);
    });
    servicingBranchRowsEl.addEventListener("click", handleReferenceDataClick);
    settlementSystemRowsEl.addEventListener("click", handleReferenceDataClick);
    tradeCaptureChannelRowsEl.addEventListener("click", handleReferenceDataClick);
    [
      servicingBranchRowsEl,
      settlementSystemRowsEl,
      tradeCaptureChannelRowsEl
    ].forEach(rowsElement => {
      rowsElement.addEventListener("input", event => {
        const row = event.target.closest("[data-reference-edit-row]");

        if (row) {
          updateReferenceDataRowSaveAvailability(row);
        }
      });
      rowsElement.addEventListener("change", event => {
        const row = event.target.closest("[data-reference-edit-row]");

        if (row) {
          updateReferenceDataRowSaveAvailability(row);
        }
      });
    });
    [
      addClientDealForm.elements.side,
      addClientDealForm.elements.amountFixingCurrency,
      addClientDealForm.elements.baseCcyAmount,
      addClientDealForm.elements.quoteCcyAmount,
      addClientDealForm.elements.clientRate,
      addClientDealForm.elements.tradeDate,
      addClientDealForm.elements.tenor
    ].forEach(element => {
      element.addEventListener("input", () => {
        if (element === addClientDealForm.elements.baseCcyAmount
          || element === addClientDealForm.elements.quoteCcyAmount) {
          groupDecimalInputValue(element);
        }

        syncAddClientDealDerivedFields();
      });
      element.addEventListener("change", syncAddClientDealDerivedFields);
    });
    addClientDealClientPickerValue.addEventListener("input", () => {
      addClientDealForm.elements.counterpartyId.value = "";
      addClientDealClientPicker.classList.remove("is-invalid");
      syncAddClientDealClientClearAvailability();
      renderAddClientDealProfileOptions(addClientDealClientPickerValue.value);
      setAddClientDealClientPickerExpanded(true);
      syncAddClientDealScope();
    });
    addClientDealClientPicker.addEventListener("click", handleAddClientDealClientPicker);
    addClientDealClientPicker.addEventListener("keydown", event => {
      if (event.key === "ArrowDown" && event.target === addClientDealClientPickerValue) {
        if (addClientDealClientOptions.hidden) {
          renderAddClientDealProfileOptions(
            addClientDealForm.elements.counterpartyId.value ? "" : addClientDealClientPickerValue.value
          );
          setAddClientDealClientPickerExpanded(true);
        }

        const firstOption = addClientDealClientOptions.querySelector("[data-add-client-deal-counterparty-id]");

        if (firstOption) {
          event.preventDefault();
          firstOption.focus();
        }
        return;
      }

      if (event.key !== "Escape") {
        return;
      }

      setAddClientDealClientPickerExpanded(false);
      addClientDealClientPickerValue.focus();
    });
    addClientDealPricingRulePicker.addEventListener("keydown", event => {
      if (event.key !== "Escape" || !addClientDealPricingRulesExpanded) {
        return;
      }

      addClientDealPricingRulesExpanded = false;
      renderAddClientDealPricingRules();
      addClientDealPricingRulePicker.querySelector("[data-add-client-deal-pricing-rule-toggle]")?.focus();
    });
    document.addEventListener("click", event => {
      if (!addClientDealClientPicker.contains(event.target)) {
        setAddClientDealClientPickerExpanded(false);
      }

      if (!addClientDealPricingRulePicker.contains(event.target) && addClientDealPricingRulesExpanded) {
        addClientDealPricingRulesExpanded = false;
        renderAddClientDealPricingRules();
      }

      if (!addHedgeDealCounterpartyPicker.contains(event.target)) {
        setAddHedgeDealCounterpartyPickerExpanded(false);
      }

      if (!addHedgeDealPricingRulePicker.contains(event.target) && addHedgeDealPricingRulesExpanded) {
        addHedgeDealPricingRulesExpanded = false;
        renderAddHedgeDealPricingRules();
      }

      if (!hedgeQuickModeCounterpartyPicker.contains(event.target)) {
        setHedgeQuickModeCounterpartyPickerExpanded(false);
      }

      if (!hedgeQuickModePricingRulePicker.contains(event.target)
        && hedgeQuickModePricingRulesExpanded) {
        hedgeQuickModePricingRulesExpanded = false;
        renderHedgeQuickModePricingRules();
      }
    });
    addClientDealForm.elements.currencyPair.addEventListener("change", syncAddClientDealScope);
    addClientDealPricingRulePicker.addEventListener("click", handleAddClientDealPricingRulePicker);
    addClientDealForm.elements.baseCcyAmount.addEventListener("blur", formatAddClientDealAmounts);
    addClientDealForm.elements.quoteCcyAmount.addEventListener("blur", formatAddClientDealAmounts);
    addClientDealForm.elements.transferRate.addEventListener("input", () => {
      if (!isAddClientDealOnboardingPricing()) {
        return;
      }

      addClientDealManualTransferEdited = true;
      syncAddClientDealPositionValues();
    });
    addClientDealForm.elements.transferRate.addEventListener("blur", () => {
      if (!isAddClientDealOnboardingPricing()) {
        return;
      }

      const transferRate = normalizeNumber(addClientDealForm.elements.transferRate.value);
      const pair = marketPairs.find(item =>
        item.currencyPair === selectedAddClientDealCurrencyPair()
      );

      if (Number.isFinite(transferRate)) {
        addClientDealForm.elements.transferRate.value = formatMarketQuote(transferRate, pair);
      }

      syncAddClientDealPositionValues();
    });
    [
      addHedgeDealForm.elements.amountFixingCurrency,
      addHedgeDealForm.elements.baseCcyAmount,
      addHedgeDealForm.elements.quoteCcyAmount,
      addHedgeDealForm.elements.tradeRate,
      addHedgeDealForm.elements.tenor
    ].forEach(element => {
      element.addEventListener("input", () => {
        if (element === addHedgeDealForm.elements.baseCcyAmount
          || element === addHedgeDealForm.elements.quoteCcyAmount) {
          groupDecimalInputValue(element);
        }

        syncAddHedgeDealDerivedFields();
      });
      element.addEventListener("change", syncAddHedgeDealDerivedFields);
    });
    addHedgeDealSideControl.addEventListener("change", () => {
      addHedgeDealForm.elements.side.value =
        oppositeFxSide(addHedgeDealSideControl.value);
      syncAddHedgeDealDerivedFields();
    });
    addHedgeDealPricingModeControl.addEventListener("change", () => {
      if (addHedgeDealPricingModeLocked) {
        return;
      }

      addHedgeDealForm.elements.counterpartyId.value = "";
      addHedgeDealForm.elements.pricingRuleId.value = "";
      addHedgeDealCounterpartyPickerValue.value = "";
      addHedgeDealCounterpartyPicker.classList.remove("is-invalid");
      addHedgeDealPricingRulePicker.classList.remove("is-invalid");
      setAddHedgeDealCounterpartyPickerExpanded(false);
      renderAddHedgeDealCounterparties();
      renderAddHedgeDealPricingRules();
      syncAddHedgeDealDerivedFields();
      syncAddHedgeDealModeLocks();
    });
    addHedgeDealForm.elements.currencyPair.addEventListener("change", () => {
      addHedgeDealForm.elements.pricingRuleId.value = "";
      addHedgeDealPricingRulePicker.classList.remove("is-invalid");
      renderAddHedgeDealCounterparties();
      renderAddHedgeDealPricingRules();
      syncAddHedgeDealDerivedFields();
    });
    addHedgeDealForm.elements.baseCcyAmount.addEventListener("blur", formatAddHedgeDealAmounts);
    addHedgeDealForm.elements.quoteCcyAmount.addEventListener("blur", formatAddHedgeDealAmounts);
    addHedgeDealCounterpartyPickerValue.addEventListener("input", () => {
      addHedgeDealForm.elements.counterpartyId.value = "";
      addHedgeDealForm.elements.pricingRuleId.value = "";
      addHedgeDealCounterpartyPicker.classList.remove("is-invalid");
      addHedgeDealPricingRulePicker.classList.remove("is-invalid");
      syncAddHedgeDealCounterpartyClearAvailability();
      renderAddHedgeDealCounterpartyOptions(addHedgeDealCounterpartyPickerValue.value);
      setAddHedgeDealCounterpartyPickerExpanded(true);
      renderAddHedgeDealPricingRules();
      syncAddHedgeDealDerivedFields();
    });
    addHedgeDealCounterpartyPicker.addEventListener("click", handleAddHedgeDealCounterpartyPicker);
    addHedgeDealCounterpartyPicker.addEventListener("keydown", event => {
      if (addHedgeDealQuickModeSelection) {
        return;
      }

      if (event.key === "ArrowDown" && event.target === addHedgeDealCounterpartyPickerValue) {
        if (addHedgeDealCounterpartyOptions.hidden) {
          renderAddHedgeDealCounterpartyOptions(
            addHedgeDealForm.elements.counterpartyId.value
              ? ""
              : addHedgeDealCounterpartyPickerValue.value
          );
          setAddHedgeDealCounterpartyPickerExpanded(true);
        }

        const firstOption =
          addHedgeDealCounterpartyOptions.querySelector("[data-add-hedge-deal-counterparty-id]");

        if (firstOption) {
          event.preventDefault();
          firstOption.focus();
        }
        return;
      }

      if (event.key !== "Escape") {
        return;
      }

      setAddHedgeDealCounterpartyPickerExpanded(false);
      addHedgeDealCounterpartyPickerValue.focus();
    });
    addHedgeDealPricingRulePicker.addEventListener("click", handleAddHedgeDealPricingRulePicker);
    addHedgeDealPricingRulePicker.addEventListener("keydown", event => {
      if (event.key !== "Escape" || !addHedgeDealPricingRulesExpanded) {
        return;
      }

      addHedgeDealPricingRulesExpanded = false;
      renderAddHedgeDealPricingRules();
      addHedgeDealPricingRulePicker
        .querySelector("[data-add-hedge-deal-pricing-rule-toggle]")
        ?.focus();
    });
    hedgeQuickModeSettingsForm.elements.currencyPair.addEventListener("change", () => {
      populateHedgeQuickModeSetting();
    });
    hedgeQuickModeCounterpartyPickerValue.addEventListener(
      "input",
      handleHedgeQuickModeCounterpartySearch
    );
    hedgeQuickModeCounterpartyPicker.addEventListener(
      "click",
      handleHedgeQuickModeCounterpartyPicker
    );
    hedgeQuickModeCounterpartyPicker.addEventListener("keydown", event => {
      if (event.key === "ArrowDown"
        && event.target === hedgeQuickModeCounterpartyPickerValue) {
        if (hedgeQuickModeCounterpartyOptions.hidden) {
          renderHedgeQuickModeCounterpartyOptions(
            hedgeQuickModeSettingsForm.elements.counterpartyId.value
              ? ""
              : hedgeQuickModeCounterpartyPickerValue.value
          );
          setHedgeQuickModeCounterpartyPickerExpanded(true);
        }

        const firstOption = hedgeQuickModeCounterpartyOptions
          .querySelector("[data-hedge-quick-mode-counterparty-id]");

        if (firstOption) {
          event.preventDefault();
          firstOption.focus();
        }
        return;
      }

      if (event.key !== "Escape") {
        return;
      }

      setHedgeQuickModeCounterpartyPickerExpanded(false);
      hedgeQuickModeCounterpartyPickerValue.focus();
    });
    hedgeQuickModePricingRulePicker.addEventListener(
      "click",
      handleHedgeQuickModePricingRulePicker
    );
    hedgeQuickModePricingRulePicker.addEventListener("keydown", event => {
      if (event.key !== "Escape" || !hedgeQuickModePricingRulesExpanded) {
        return;
      }

      hedgeQuickModePricingRulesExpanded = false;
      renderHedgeQuickModePricingRules();
      hedgeQuickModePricingRulePicker
        .querySelector("[data-hedge-quick-mode-pricing-rule-toggle]")
        ?.focus();
    });
    [
      hedgeQuickModeSettingsForm.elements.smallBaseCcyAmount,
      hedgeQuickModeSettingsForm.elements.mediumBaseCcyAmount,
      hedgeQuickModeSettingsForm.elements.largeBaseCcyAmount,
      hedgeQuickModeSettingsForm.elements.xlargeBaseCcyAmount
    ].forEach(input => {
      input.addEventListener("input", () => {
        input.setCustomValidity("");
        groupDecimalInputValue(input);
      });
      input.addEventListener("blur", () => groupDecimalInputValue(input));
    });
    [
      editForm.elements.clientCode,
      editForm.elements.clientName,
      editForm.elements.currencyPair,
      editForm.elements.side,
      editForm.elements.amountFixingCurrency,
      editForm.elements.amount,
      editForm.elements.quoteAmount,
      editForm.elements.clientRate,
      editForm.elements.autoBatchRate,
      editForm.elements.tenor,
      editForm.elements.tradeDate
    ].forEach(element => {
      element.addEventListener("input", syncDealFormDerivedFields);
      element.addEventListener("change", syncDealFormDerivedFields);
    });
    editForm.elements.amount.addEventListener("blur", formatDealAmountInputs);
    editForm.elements.quoteAmount.addEventListener("blur", formatDealAmountInputs);
    editForm.elements.pricingRuleId.addEventListener("input", handleDealPricingRuleInput);
    editForm.elements.pricingRuleId.addEventListener("change", handleDealPricingRuleInput);
    editForm.elements.clientRate.addEventListener("input", () => {
      syncSyntheticAutoBatchRate();
      syncDealFormDerivedFields();
    });
    editDialog.addEventListener("close", () => {
      editingDealId = null;
      prepareEditDealForm();
      clearFormValidity();
    });

    fxDealsAuditToggles.forEach(toggle => {
      toggle.addEventListener("change", () => {
        setFxDealsViewMode(
          toggle.dataset.fxDealsViewScope,
          toggle.checked ? FX_DEALS_VIEW_MODE_AUDIT : FX_DEALS_VIEW_MODE_STANDARD
        );
      });
    });
    syncFxDealsAuditToggle("client");
    syncFxDealsAuditToggle("hedge");

    fxBatchesAuditViewToggle.addEventListener("change", () => {
      setFxBatchesViewMode(
        fxBatchesAuditViewToggle.checked
          ? FX_BATCHES_VIEW_MODE_AUDIT
          : FX_BATCHES_VIEW_MODE_STANDARD
      );
    });
    syncFxBatchesAuditToggle();

    fxPositionModeTabs.forEach(tab => {
      tab.addEventListener("keydown", handleFxPositionModeTabKeydown);
    });

    initializeAnalyticalPnlReportDefaultDateRange();
    analyticalPnlReportFiltersForm.addEventListener("submit", event => {
      event.preventDefault();
      loadAnalyticalPnlReport();
    });
    analyticalPnlReportClearFiltersButton.addEventListener("click", () => {
      analyticalPnlReportFiltersForm.reset();
      loadAnalyticalPnlReport();
    });

    selectAllCheckboxes.forEach(checkbox => {
      checkbox.addEventListener("change", () => {
        setBatchStatus("");
        toggleSideSelection(checkbox.dataset.selectSide, checkbox.checked);
      });
    });

    document.addEventListener("keydown", event => {
      if (event.key === "Escape") {
        if (!clientProfilePage.hidden && !usersView.hidden && userRowEditState) {
          cancelUserRowEdit();
        } else if (!clientProfilePage.hidden && !usersView.hidden && !usersDetailView.hidden) {
          navigateToUsersRoute();
        } else if (!clientProfilePage.hidden && usersView.hidden && !clientProfileListView.hidden && tradingCounterpartyRowEditState) {
          cancelTradingCounterpartyRowEdit();
        } else if (!clientProfilePage.hidden && !clientProfileDetailView.hidden && !clientPricingRuleDialog.open) {
          navigateToClientProfileRoute();
        }

        if (!pricingPage.hidden) {
          cancelPricingContextForm();
          setPricingContextStatus("");
        }

        if (!referenceDataPage.hidden) {
          cancelReferenceDataForm();
          setReferenceDataStatus("");
        }

        if (!pricingRulesPage.hidden) {
          cancelPricingRuleForm();
          setPricingRuleStatus("");
        }

        return;
      }

      handleSelectionShortcut(event);
    });

    rowsEl.addEventListener("click", event => {
      const copyButton = event.target.closest("[data-copy-trade-id]");

      if (!copyButton) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const tradeId = copyButton.dataset.copyTradeId || "";

      copyTextToClipboard(tradeId).then(copied => {
        showTradeIdCopyFeedback(copyButton, copied);
      });
    });

    rowsEl.addEventListener("change", event => {
      if (!event.target.matches(".deal-checkbox")) {
        return;
      }

      const dealId = event.target.dataset.dealId;

      if (!dealId) {
        return;
      }

      if (event.target.checked) {
        selectedTradeIds.add(dealId);
      } else {
        selectedTradeIds.delete(dealId);
      }

      setBatchStatus("");
      event.target.closest("tr")?.classList.toggle("is-selected", event.target.checked);
      updateActionButtons();
      updateSelectAllCheckboxes(currentDisplayRows());
    });

    window.addEventListener("hashchange", () => {
      applyInitialPageMode();
      render(fxPositions);
    });
    window.addEventListener("beforeunload", () => marketStreamEventSource?.close());
    window.addEventListener("resize", repositionAppTooltip);
    window.addEventListener("resize", scheduleSmartColumnSizing);
    window.addEventListener("resize", scheduleHedgeQuickModeQuoteAlignment);
    window.addEventListener("resize", scheduleFxPositionGridFillHeight);
    window.addEventListener("scroll", repositionAppTooltip, true);

    if (fxPositionGridFrame && typeof ResizeObserver === "function") {
      const fxPositionLayoutObserver = new ResizeObserver(() => {
        scheduleFxPositionGridFillHeight();
        scheduleHedgeQuickModeQuoteAlignment();
      });

      fxPositionLayoutObserver.observe(fxPositionGridFrame);

      if (fxPositionGrid) {
        fxPositionLayoutObserver.observe(fxPositionGrid);
      }
    }

    const tooltipObserver = new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        if (mutation.type === "attributes") {
          if (mutation.attributeName === "title") {
            migrateNativeTooltipElement(mutation.target);
          } else {
            initializeTooltipElement(mutation.target);
          }

          return;
        }

        mutation.addedNodes.forEach(node => {
          if (node instanceof Element) {
            migrateNativeTooltips(node);
            initializeTooltips(node);
          }
        });
      });

      if (activeTooltipTarget && !activeTooltipTarget.isConnected) {
        hideAppTooltip();
      }
    });

    migrateNativeTooltips();
    initializeTooltips();
    tooltipObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ["title", "data-tooltip"],
      childList: true,
      subtree: true
    });

    connectMarketPulseSimulation();
    connectClientDealGenerationProcess();
    connectFxAutoBatchingProcess();
    initializeHedgeQuickModeToolbar();
    setTradingCounterpartyScopeTab(activeTradingCounterpartyScope);
    applyInitialPageMode();
    render(fxPositions);
