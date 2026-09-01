    function setBatchingSettingsStatus(message = "", tone = "") {
      setWorkbenchPageStatus(batchingSettingsStatus, message, tone);
    }

    function setBatchingSettingsTab(tabName) {
      const normalizedTab = tabName === "auto" ? "auto" : "general";

      batchingSettingsTabs.forEach(tab => {
        const active = tab.dataset.batchingSettingsTab === normalizedTab;
        tab.classList.toggle("active", active);
        tab.setAttribute("aria-selected", String(active));
      });
      generalBatchingSettingsPanel.hidden = normalizedTab !== "general";
      autoBatchingSettingsPanel.hidden = normalizedTab !== "auto";
      setBatchingSettingsStatus();
    }

    function batchingSettingsDraft() {
      const allowCrossTenorBatching =
        batchingSettingsForm.elements.allowCrossTenorBatching.value === "true";

      if (allowCrossTenorBatching) {
        throw new Error(
          "Cross-Tenor Batching is in development and cannot be enabled yet."
        );
      }

      return { allowCrossTenorBatching };
    }

    function updateBatchingSettingsSaveAvailability() {
      let draft;

      try {
        draft = batchingSettingsDraft();
      } catch {
        setSaveButtonAvailability(
          batchingSettingsSaveButton,
          false,
          "Enter valid General Batching settings"
        );
        return;
      }

      setSaveButtonAvailability(
        batchingSettingsSaveButton,
        draft.allowCrossTenorBatching
          !== batchingSettings.allowCrossTenorBatching
      );
    }

    function renderBatchingSettings() {
      batchingSettingsForm.elements.allowCrossTenorBatching.value =
        String(batchingSettings.allowCrossTenorBatching);
      updateBatchingSettingsSaveAvailability();
    }

    async function saveBatchingSettings(event) {
      event.preventDefault();
      let payload;

      try {
        payload = batchingSettingsDraft();
      } catch (error) {
        setBatchingSettingsStatus(error.message, "error");
        return;
      }

      batchingSettingsSaveButton.disabled = true;
      setBatchingSettingsStatus("Saving General Batching settings...");

      try {
        batchingSettings = normalizedFxBatchingSettings(
          await demoApiRequest("/api/v1/fx-batching-settings", {
            method: "PUT",
            body: JSON.stringify(payload)
          })
        );
        renderBatchingSettings();
        setBatchingSettingsStatus(
          "General Batching settings were saved successfully.",
          "success"
        );
      } catch (error) {
        updateBatchingSettingsSaveAvailability();
        setBatchingSettingsStatus(
          error.message || "Unable to save General Batching settings.",
          "error"
        );
      }
    }

    function openBatchingProcessFlowDialog(dialog) {
      openDialogWithoutFieldFocus(dialog);
    }

    function closeBatchingProcessFlowDialog(dialog, triggerButton) {
      if (typeof dialog.close === "function") {
        dialog.close();
      } else {
        dialog.removeAttribute("open");
      }

      triggerButton.focus();
    }

    function openAutoBatchingProcessFlowDialog() {
      openBatchingProcessFlowDialog(
        autoBatchingProcessFlowDialog
      );
    }

    function closeAutoBatchingProcessFlowDialog() {
      closeBatchingProcessFlowDialog(
        autoBatchingProcessFlowDialog,
        autoBatchingProcessFlowButton
      );
    }

    function autoBatchingSettingsDraft() {
      const maxIntervalSeconds = Number(
        autoBatchingSettingsForm.elements.maxIntervalSeconds.value
      );
      const maxTransferRateSpreadPercent = positiveDecimalInputText(
        autoBatchingSettingsForm.elements.maxTransferRateSpreadPercent.value
      );
      const eligibleCcyPairCodes = Array.from(
        autoBatchingSettingsForm.querySelectorAll(
          'input[name="eligibleCcyPairCodes"]:checked'
        )
      ).map(input => input.value).sort((left, right) => left.localeCompare(right));
      const tenorCompatibilityMode = String(
        autoBatchingSettingsForm.elements.tenorCompatibilityMode.value || ""
      ).trim().toUpperCase();

      if (
        !Number.isInteger(maxIntervalSeconds)
        || maxIntervalSeconds < 1
        || maxIntervalSeconds > 3600
      ) {
        throw new Error(
          "Maximum Batching Interval must be a whole number of seconds from 1 to 3600."
        );
      }

      try {
        if (
          maxTransferRateSpreadPercent === null
          || new Big(maxTransferRateSpreadPercent).lt("0.0001")
          || new Big(maxTransferRateSpreadPercent).gt("100")
        ) {
          throw new Error();
        }
      } catch {
        throw new Error(
          "Default Transfer Rate Corridor must be a decimal percentage from 0.0001 to 100."
        );
      }

      if (eligibleCcyPairCodes.length === 0) {
        throw new Error(
          "Select at least one Currency Pair for Auto Batching."
        );
      }

      if (tenorCompatibilityMode !== "SAME_TENOR_ONLY") {
        throw new Error(
          "Tenor Compatibility must be Same Tenor Only."
        );
      }

      return {
        maxIntervalSeconds,
        maxTransferRateSpreadPercent,
        eligibleCcyPairCodes,
        tenorCompatibilityMode
      };
    }

    function updateAutoBatchingSettingsSaveAvailability() {
      let draft;

      try {
        draft = autoBatchingSettingsDraft();
      } catch {
        setSaveButtonAvailability(
          autoBatchingSettingsSaveButton,
          false,
          "Enter valid Auto Batching settings"
        );
        return;
      }

      setSaveButtonAvailability(
        autoBatchingSettingsSaveButton,
        draft.maxIntervalSeconds !== autoBatchingSettings.maxIntervalSeconds
          || !new Big(draft.maxTransferRateSpreadPercent).eq(
            autoBatchingSettings.maxTransferRateSpreadPercent
          )
          || draft.eligibleCcyPairCodes.join(",")
            !== autoBatchingSettings.eligibleCcyPairCodes.join(",")
          || draft.tenorCompatibilityMode
            !== autoBatchingSettings.tenorCompatibilityMode
      );
    }

    function updateAutoBatchingEligibleCcyPairSummary() {
      const selectedCount = autoBatchingEligibleCcyPairCodes.querySelectorAll(
        'input[name="eligibleCcyPairCodes"]:checked'
      ).length;

      autoBatchingEligibleCcyPairCount.textContent = `${selectedCount} selected`;
    }

    function filterAutoBatchingEligibleCcyPairOptions() {
      const query = String(autoBatchingEligibleCcyPairSearch.value || "")
        .trim()
        .toUpperCase();
      let visibleCount = 0;

      autoBatchingEligibleCcyPairCodes
        .querySelectorAll(".auto-batching-ccy-pair-option")
        .forEach(option => {
          const visible = !query
            || String(option.dataset.searchText || "").includes(query);
          option.hidden = !visible;
          if (visible) {
            visibleCount += 1;
          }
        });

      autoBatchingEligibleCcyPairEmpty.hidden = visibleCount > 0;
      autoBatchingEligibleCcyPairSearchClear.hidden = query.length === 0;
    }

    function renderAutoBatchingEligibleCcyPairOptions() {
      const selectedCodes = new Set(autoBatchingSettings.eligibleCcyPairCodes);

      autoBatchingEligibleCcyPairCodes.innerHTML = marketPairs.map(pair => {
        const inputId = `autoBatchingCcyPair_${pair.pairCode}`;
        const searchText = `${pair.currencyPair} ${pair.pairCode}`.toUpperCase();

        return `
          <label class="form-check auto-batching-ccy-pair-option" for="${inputId}" data-search-text="${escapeHtml(searchText)}">
            <input class="form-check-input" type="checkbox"
              id="${inputId}"
              name="eligibleCcyPairCodes"
              value="${escapeHtml(pair.pairCode)}"
              ${selectedCodes.has(pair.pairCode) ? "checked" : ""}>
            <span class="form-check-label">${escapeHtml(pair.currencyPair)}</span>
          </label>
        `;
      }).join("");

      updateAutoBatchingEligibleCcyPairSummary();
      filterAutoBatchingEligibleCcyPairOptions();
    }

    function renderAutoBatchingSettings() {
      renderAutoBatchingEligibleCcyPairOptions();
      autoBatchingSettingsForm.elements.maxIntervalSeconds.value =
        autoBatchingSettings.maxIntervalSeconds;
      autoBatchingSettingsForm.elements.maxTransferRateSpreadPercent.value =
        autoBatchingSettings.maxTransferRateSpreadPercent;
      autoBatchingSettingsForm.elements.tenorCompatibilityMode.value =
        autoBatchingSettings.tenorCompatibilityMode;
      updateAutoBatchingSettingsSaveAvailability();
    }

    async function loadBatchingSettingsPage() {
      renderBatchingSettings();
      renderAutoBatchingSettings();

      if (!DEMO_API_ENABLED) {
        setBatchingSettingsStatus(
          "SQLite API is unavailable. Start the demo with start-demo.bat.",
          "error"
        );
        return;
      }

      setBatchingSettingsStatus("Loading Batching settings...");

      try {
        const [generalSettingsResponse, autoSettingsResponse] = await Promise.all([
          demoApiRequest("/api/v1/fx-batching-settings"),
          demoApiRequest("/api/v1/fx-auto-batching-settings")
        ]);
        batchingSettings = normalizedFxBatchingSettings(generalSettingsResponse);
        autoBatchingSettings = normalizedFxAutoBatchingSettings(autoSettingsResponse);
        renderBatchingSettings();
        renderAutoBatchingSettings();
        setBatchingSettingsStatus();
      } catch (error) {
        setBatchingSettingsStatus(
          error.message || "Unable to load Batching settings.",
          "error"
        );
      }
    }

    async function saveAutoBatchingSettings(event) {
      event.preventDefault();
      let payload;

      try {
        payload = autoBatchingSettingsDraft();
      } catch (error) {
        setBatchingSettingsStatus(error.message, "error");
        return;
      }

      autoBatchingSettingsSaveButton.disabled = true;
      setBatchingSettingsStatus("Saving Auto Batching settings...");

      try {
        autoBatchingSettings = normalizedFxAutoBatchingSettings(
          await demoApiRequest("/api/v1/fx-auto-batching-settings", {
            method: "PUT",
            body: JSON.stringify(payload)
          })
        );
        applyFxAutoBatchingProcessState(
          await demoApiRequest("/api/v1/fx-auto-batching/process")
        );
        renderAutoBatchingSettings();
        setBatchingSettingsStatus(
          "Auto Batching settings were saved successfully.",
          "success"
        );
      } catch (error) {
        updateAutoBatchingSettingsSaveAvailability();
        setBatchingSettingsStatus(
          error.message || "Unable to save Auto Batching settings.",
          "error"
        );
      }
    }

    function setHedgeQuickModeSettingsStatus(message = "", tone = "") {
      setWorkbenchPageStatus(hedgeQuickModeSettingsStatus, message, tone);
    }

    function setAutoHedgingAdmissionPolicyStatus(message = "", tone = "") {
      setWorkbenchPageStatus(autoHedgingAdmissionPolicyStatus, message, tone);
    }

    function setAutoHedgingAdmissionDialogStatus(element, message = "", tone = "") {
      setWorkbenchPageStatus(element, message, tone);
    }

    function setHedgingSettingsAutoGroupExpanded(expanded) {
      const isExpanded = expanded === true;
      hedgingSettingsAutoGroupToggle.setAttribute("aria-expanded", String(isExpanded));
      hedgingSettingsAutoSubnav.hidden = !isExpanded;
    }

    function setHedgingSettingsSection(sectionName) {
      const normalizedSection = sectionName === "initial" || sectionName === "manual-release"
        ? sectionName
        : "quick";

      hedgingSettingsSectionLinks.forEach(link => {
        const active = link.dataset.hedgingSettingsSection === normalizedSection;
        link.classList.toggle("is-active", active);
        if (active) {
          link.setAttribute("aria-current", "page");
        } else {
          link.removeAttribute("aria-current");
        }
      });
      hedgingSettingsSectionPanels.forEach(panel => {
        panel.hidden = panel.dataset.hedgingSettingsSectionPanel !== normalizedSection;
      });
      hedgeQuickModeSettingsStatus.hidden = normalizedSection !== "quick";

      setHedgingSettingsAutoGroupExpanded(normalizedSection !== "quick");
      if (normalizedSection === "quick" && hedgeQuickModeSettingsGridReady) {
        requestAnimationFrame(() => hedgeQuickModeSettingsGrid.redraw(true));
      }
    }

    function setAutoHedgingSettingsSegmentExpanded(toggle, expanded) {
      const panelId = toggle?.getAttribute("aria-controls");
      const panel = panelId ? document.getElementById(panelId) : null;
      const segment = toggle?.closest(".auto-hedging-trade-segment");

      if (!toggle || !panel || !segment) {
        return;
      }

      toggle.setAttribute("aria-expanded", String(expanded));
      panel.hidden = !expanded;
      segment.classList.toggle("is-expanded", expanded);
    }

    function toggleAutoHedgingSettingsSegment(toggle) {
      const expand = toggle.getAttribute("aria-expanded") !== "true";
      const segmentList = toggle.closest("[data-auto-hedging-settings-segments]");

      if (expand && segmentList) {
        segmentList.querySelectorAll("[data-auto-hedging-segment-toggle]")
          .forEach(otherToggle => {
            if (otherToggle !== toggle) {
              setAutoHedgingSettingsSegmentExpanded(otherToggle, false);
            }
          });
      }

      setAutoHedgingSettingsSegmentExpanded(toggle, expand);
    }

    function setAutoHedgingAdmissionPolicyBusy(busy) {
      const isBusy = busy === true;
      autoHedgingAdmissionPolicyPanel.setAttribute("aria-busy", String(isBusy));
      autoHedgingAdmissionPairDialogForm.setAttribute("aria-busy", String(isBusy));
      [
        autoHedgingAdmissionCcyPairEditButton,
        autoHedgingAdmissionAmountLimitEditButton,
        autoHedgingAdmissionDeviationEditButton
      ].forEach(button => {
        button.disabled = isBusy || !autoHedgingAdmissionPolicyLoaded;
      });
      autoHedgingAdmissionPairDialogClose.disabled = isBusy;
      autoHedgingAdmissionPairDialogCancel.disabled = isBusy;
      autoHedgingAdmissionPairDialogSave.disabled = true;
      autoHedgingAdmissionPairSearch.disabled = isBusy;
      autoHedgingAdmissionPairFilter.disabled = isBusy;
      autoHedgingAdmissionPairRows
        .querySelectorAll("[data-auto-hedging-admission-pair-enabled]")
        .forEach(control => {
          control.disabled = isBusy || !autoHedgingAdmissionPolicyLoaded;
        });
      autoHedgingAdmissionPairRows
        .querySelectorAll("[data-auto-hedging-admission-pair-limit]")
        .forEach(control => {
          const row = control.closest("[data-auto-hedging-admission-pair-code]");
          const enabledControl = row?.querySelector(
            "[data-auto-hedging-admission-pair-enabled]"
          );
          control.disabled = isBusy
            || !autoHedgingAdmissionPolicyLoaded
            || !enabledControl?.checked;
        });
      autoHedgingAdmissionPairRows
        .querySelectorAll("[data-auto-hedging-admission-deviation]")
        .forEach(control => {
          control.disabled = isBusy || !autoHedgingAdmissionPolicyLoaded;
        });

      if (!isBusy && autoHedgingAdmissionPolicyLoaded) {
        updateAutoHedgingAdmissionDialogSaveAvailability();
      }
    }

    function autoHedgingAdmissionPairRowMarkup(pair) {
      const controlSuffix = pair.ccyPairCode.toLowerCase();
      const switchId = `autoHedgingAdmissionEnabled_${controlSuffix}`;
      const limitId = `autoHedgingAdmissionLimit_${controlSuffix}`;
      const deviationId = `autoHedgingAdmissionDeviation_${controlSuffix}`;
      const amountValue = pair.maxBaseCcyAmount === null
        ? ""
        : groupedDecimalText(pair.maxBaseCcyAmount);
      const deviationValue = pair.maxTransferRateDeviationPercent === null
        ? ""
        : pair.maxTransferRateDeviationPercent;

      return `
        <tr
          data-auto-hedging-admission-pair-code="${escapeHtml(pair.ccyPairCode)}"
          data-auto-hedging-admission-pair-search="${escapeHtml(`${pair.currencyPair} ${pair.ccyPairCode} ${pair.baseCcyCode}`.toUpperCase())}"
        >
          <td>
            <strong>${escapeHtml(pair.currencyPair)}</strong>
          </td>
          <td class="text-center" data-auto-hedging-admission-column="automatic-admission">
            <div class="form-check form-switch auto-hedging-admission-pair-enabled">
              <input
                class="form-check-input"
                type="checkbox"
                role="switch"
                id="${escapeHtml(switchId)}"
                aria-label="${escapeHtml(pair.currencyPair)} eligible for Auto Hedging"
                data-auto-hedging-admission-pair-enabled
                ${pair.enabled ? "checked" : ""}
                ${autoHedgingAdmissionPolicyLoaded ? "" : "disabled"}
              >
            </div>
          </td>
          <td data-auto-hedging-admission-column="amount-limit">
            <div class="input-group input-group-sm auto-hedging-admission-pair-limit">
              <label class="visually-hidden" for="${escapeHtml(limitId)}">Maximum Trade Amount for ${escapeHtml(pair.currencyPair)} in ${escapeHtml(pair.baseCcyCode)}</label>
              <input
                class="form-control"
                type="text"
                id="${escapeHtml(limitId)}"
                value="${escapeHtml(amountValue)}"
                inputmode="decimal"
                aria-label="Maximum Trade Amount for ${escapeHtml(pair.currencyPair)} in ${escapeHtml(pair.baseCcyCode)}"
                data-auto-hedging-admission-pair-limit
                ${pair.enabled && autoHedgingAdmissionPolicyLoaded ? "" : "disabled"}
              >
              <span class="input-group-text">${escapeHtml(pair.baseCcyCode)}</span>
            </div>
          </td>
          <td data-auto-hedging-admission-column="transfer-rate-deviation">
            <div class="input-group input-group-sm auto-hedging-admission-deviation-limit">
              <label class="visually-hidden" for="${escapeHtml(deviationId)}">Maximum Transfer Rate Deviation for ${escapeHtml(pair.currencyPair)}</label>
              <input
                class="form-control"
                type="text"
                id="${escapeHtml(deviationId)}"
                value="${escapeHtml(deviationValue)}"
                inputmode="decimal"
                aria-label="Maximum Transfer Rate Deviation for ${escapeHtml(pair.currencyPair)}"
                data-auto-hedging-admission-deviation
                required
                ${autoHedgingAdmissionPolicyLoaded ? "" : "disabled"}
              >
              <span class="input-group-text" aria-hidden="true">%</span>
            </div>
          </td>
        </tr>
      `;
    }

    function filterAutoHedgingAdmissionPairs() {
      const query = String(autoHedgingAdmissionPairSearch.value || "")
        .trim()
        .toUpperCase();
      const statusFilter = String(autoHedgingAdmissionPairFilter.value || "ALL")
        .trim()
        .toUpperCase();
      let visibleCount = 0;

      autoHedgingAdmissionPairRows
        .querySelectorAll("[data-auto-hedging-admission-pair-code]")
        .forEach(row => {
          const enabled = row.querySelector(
            "[data-auto-hedging-admission-pair-enabled]"
          )?.checked === true;
          const matchesQuery = !query
            || String(row.dataset.autoHedgingAdmissionPairSearch || "").includes(query);
          const matchesStatus = statusFilter === "ALL"
            || (statusFilter === "ENABLED" && enabled)
            || (statusFilter === "DISABLED" && !enabled);
          const visible = matchesQuery && matchesStatus;

          row.hidden = !visible;
          if (visible) {
            visibleCount += 1;
          }
        });

      autoHedgingAdmissionPairEmpty.textContent =
        autoHedgingAdmissionPolicy.currencyPairs.length === 0
          ? "No Currency Pairs are available in the policy."
          : "No Currency Pairs match the current filters.";
      autoHedgingAdmissionPairEmpty.hidden = visibleCount > 0;
    }

    function autoHedgingAdmissionPairControlSnapshot() {
      return Array.from(
        autoHedgingAdmissionPairRows.querySelectorAll(
          "[data-auto-hedging-admission-pair-code]"
        )
      ).map(row => ({
        ccyPairCode: row.dataset.autoHedgingAdmissionPairCode,
        enabled: row.querySelector(
          "[data-auto-hedging-admission-pair-enabled]"
        )?.checked === true,
        amount: row.querySelector(
          "[data-auto-hedging-admission-pair-limit]"
        )?.value || "",
        deviation: row.querySelector(
          "[data-auto-hedging-admission-deviation]"
        )?.value || ""
      }));
    }

    function restoreAutoHedgingAdmissionPairControlSnapshot(snapshot) {
      const valuesByPair = new Map(
        (Array.isArray(snapshot) ? snapshot : [])
          .map(item => [item.ccyPairCode, item])
      );

      autoHedgingAdmissionPairRows
        .querySelectorAll("[data-auto-hedging-admission-pair-code]")
        .forEach(row => {
          const saved = valuesByPair.get(row.dataset.autoHedgingAdmissionPairCode);
          const enabledControl = row.querySelector(
            "[data-auto-hedging-admission-pair-enabled]"
          );
          const amountControl = row.querySelector(
            "[data-auto-hedging-admission-pair-limit]"
          );
          const deviationControl = row.querySelector(
            "[data-auto-hedging-admission-deviation]"
          );

          if (!saved || !enabledControl || !amountControl || !deviationControl) {
            return;
          }

          enabledControl.checked = saved.enabled;
          amountControl.value = saved.amount;
          deviationControl.value = saved.deviation;
          amountControl.setCustomValidity("");
          deviationControl.setCustomValidity("");
          amountControl.disabled = autoHedgingAdmissionPolicySaving
            || !autoHedgingAdmissionPolicyLoaded
            || !saved.enabled;
        });

      filterAutoHedgingAdmissionPairs();
      updateAutoHedgingAdmissionDialogSaveAvailability();
    }

    function normalizedAutoHedgingAdmissionFocus(value) {
      return ["automatic-admission", "amount-limit", "transfer-rate-deviation"].includes(value)
        ? value
        : "automatic-admission";
    }

    function setAutoHedgingAdmissionDialogFocus(focusTarget) {
      const target = normalizedAutoHedgingAdmissionFocus(focusTarget);
      const table = autoHedgingAdmissionPairDialog.querySelector(
        ".auto-hedging-admission-pair-table"
      );
      autoHedgingAdmissionPairDialogFocus = target;
      autoHedgingAdmissionPairDialog.dataset.autoHedgingAdmissionFocus = target;
      if (table) {
        table.dataset.autoHedgingAdmissionFocus = target;
      }
      autoHedgingAdmissionPairDialog
        .querySelectorAll("[data-auto-hedging-admission-column]")
        .forEach(cell => {
          cell.classList.toggle(
            "is-auto-hedging-admission-column-focused",
            cell.dataset.autoHedgingAdmissionColumn === target
          );
        });
    }

    function focusAutoHedgingAdmissionDialogColumn() {
      const selectorByTarget = {
        "automatic-admission": "[data-auto-hedging-admission-pair-enabled]:not(:disabled)",
        "amount-limit": "[data-auto-hedging-admission-pair-limit]:not(:disabled)",
        "transfer-rate-deviation": "[data-auto-hedging-admission-deviation]:not(:disabled)"
      };
      const control = autoHedgingAdmissionPairDialog.querySelector(
        selectorByTarget[autoHedgingAdmissionPairDialogFocus]
      ) || autoHedgingAdmissionPairSearch;
      const targetHeader = autoHedgingAdmissionPairDialog.querySelector(
        `thead [data-auto-hedging-admission-column="${autoHedgingAdmissionPairDialogFocus}"]`
      );
      const reducedMotion = window.matchMedia?.(
        "(prefers-reduced-motion: reduce)"
      ).matches === true;
      targetHeader?.scrollIntoView({
        behavior: reducedMotion ? "auto" : "smooth",
        block: "nearest",
        inline: "nearest"
      });
      control?.focus({ preventScroll: true });
    }

    function openAutoHedgingAdmissionPairDialog(event) {
      if (!autoHedgingAdmissionPolicyLoaded || autoHedgingAdmissionPolicySaving) {
        return;
      }

      const trigger = event?.currentTarget || null;
      autoHedgingAdmissionPairDialogSnapshot =
        autoHedgingAdmissionPairControlSnapshot();
      autoHedgingAdmissionPairDialogReturnFocus = trigger;
      autoHedgingAdmissionPairSearch.value = "";
      autoHedgingAdmissionPairFilter.value = "ALL";
      filterAutoHedgingAdmissionPairs();
      const focusTarget = normalizedAutoHedgingAdmissionFocus(
        trigger?.dataset.autoHedgingAdmissionFocus
      );
      setAutoHedgingAdmissionDialogStatus(autoHedgingAdmissionPairDialogStatus);
      updateAutoHedgingAdmissionDialogSaveAvailability();
      openDialogWithoutFieldFocus(autoHedgingAdmissionPairDialog);
      if (autoHedgingAdmissionPairDialogFocusTimer !== null) {
        window.clearTimeout(autoHedgingAdmissionPairDialogFocusTimer);
      }
      autoHedgingAdmissionPairDialogFocusTimer = window.setTimeout(() => {
        autoHedgingAdmissionPairDialogFocusTimer = null;
        if (!autoHedgingAdmissionPairDialog.open) {
          return;
        }
        setAutoHedgingAdmissionDialogFocus(focusTarget);
        focusAutoHedgingAdmissionDialogColumn();
      }, 0);
    }

    function closeAutoHedgingAdmissionPairDialog({ restore = false } = {}) {
      if (autoHedgingAdmissionPairDialogFocusTimer !== null) {
        window.clearTimeout(autoHedgingAdmissionPairDialogFocusTimer);
        autoHedgingAdmissionPairDialogFocusTimer = null;
      }
      if (restore) {
        restoreAutoHedgingAdmissionPairControlSnapshot(
          autoHedgingAdmissionPairDialogSnapshot
        );
      }
      autoHedgingAdmissionPairDialogSnapshot = null;
      setAutoHedgingAdmissionDialogStatus(autoHedgingAdmissionPairDialogStatus);

      if (typeof autoHedgingAdmissionPairDialog.close === "function") {
        autoHedgingAdmissionPairDialog.close();
      } else {
        autoHedgingAdmissionPairDialog.removeAttribute("open");
      }

      autoHedgingAdmissionPairDialog
        .querySelectorAll(".is-auto-hedging-admission-column-focused")
        .forEach(cell => cell.classList.remove(
          "is-auto-hedging-admission-column-focused"
        ));
      const returnFocus = autoHedgingAdmissionPairDialogReturnFocus;
      autoHedgingAdmissionPairDialogReturnFocus = null;
      returnFocus?.focus();
    }

    function renderAutoHedgingAdmissionPolicy() {
      const enabledPairCount = autoHedgingAdmissionPolicy.currencyPairs
        .filter(pair => pair.enabled)
        .length;
      const configuredDeviationCount = autoHedgingAdmissionPolicy.currencyPairs
        .filter(pair => pair.maxTransferRateDeviationPercent !== null)
        .length;

      autoHedgingAdmissionPolicyRevision.textContent =
        `Revision ${autoHedgingAdmissionPolicy.revision}`;
      autoHedgingManualReleaseSharedRevision.textContent =
        `Revision ${autoHedgingAdmissionPolicy.revision}`;
      autoHedgingManualReleaseSharedPairSummary.textContent =
        `${enabledPairCount} of ${autoHedgingAdmissionPolicy.currencyPairs.length} enabled`;
      autoHedgingManualReleaseSharedDeviation.textContent =
        `${configuredDeviationCount} of ${autoHedgingAdmissionPolicy.currencyPairs.length} Ccy Pairs configured`;
      autoHedgingAdmissionPairRows.innerHTML = autoHedgingAdmissionPolicy.currencyPairs
        .map(autoHedgingAdmissionPairRowMarkup)
        .join("");
      filterAutoHedgingAdmissionPairs();
      setAutoHedgingAdmissionPolicyBusy(autoHedgingAdmissionPolicySaving);
      updateAutoHedgingAdmissionDialogSaveAvailability();
    }

    function decimalFractionDigitCount(value) {
      const decimal = String(value || "").split(".")[1] || "";
      return decimal.length;
    }

    function autoHedgingAdmissionPolicyDraft() {
      let policyValid = true;
      const currencyPairs = autoHedgingAdmissionPolicy.currencyPairs.map(pair => {
        const row = autoHedgingAdmissionPairRows.querySelector(
          `[data-auto-hedging-admission-pair-code="${pair.ccyPairCode}"]`
        );
        const enabled = row?.querySelector(
          "[data-auto-hedging-admission-pair-enabled]"
        )?.checked === true;
        const amountInput = row?.querySelector(
          "[data-auto-hedging-admission-pair-limit]"
        );
        const deviationInput = row?.querySelector(
          "[data-auto-hedging-admission-deviation]"
        );
        const parsedMaxBaseCcyAmount = positiveDecimalInputText(amountInput?.value);
        const maxBaseCcyAmount = enabled ? parsedMaxBaseCcyAmount : null;
        const validAmount = !enabled || (
          parsedMaxBaseCcyAmount !== null
          && decimalFractionDigitCount(parsedMaxBaseCcyAmount)
            <= pair.baseCcyFractionDigits
        );
        const deviation = normalizedDecimalInputText(deviationInput?.value);
        let validDeviation = false;
        try {
          validDeviation = deviation !== null
            && new Big(deviation).gte(0)
            && new Big(deviation).lte(100);
        } catch {}

        if (amountInput) {
          amountInput.setCustomValidity(
            validAmount
              ? ""
              : `Enter a positive ${pair.baseCcyCode} amount with no more than ${pair.baseCcyFractionDigits} decimal places.`
          );
        }
        if (deviationInput) {
          deviationInput.setCustomValidity(
            validDeviation
              ? ""
              : "Enter a percentage from 0 through 100."
          );
        }
        policyValid = policyValid && validAmount && validDeviation;

        return {
          ccyPairCode: pair.ccyPairCode,
          enabled,
          maxBaseCcyAmount,
          maxTransferRateDeviationPercent: deviation
        };
      });

      if (!policyValid) {
        return null;
      }

      return {
        expectedRevision: autoHedgingAdmissionPolicy.revision,
        currencyPairs
      };
    }

    function sameAutoHedgingAdmissionPolicyDraft(draft) {
      if (!draft) {
        return false;
      }

      return draft.currencyPairs.every((draftPair, index) => {
        const savedPair = autoHedgingAdmissionPolicy.currencyPairs[index];

        if (
          !savedPair
          || draftPair.ccyPairCode !== savedPair.ccyPairCode
          || draftPair.enabled !== savedPair.enabled
        ) {
          return false;
        }

        if (
          draftPair.maxTransferRateDeviationPercent === null
          || savedPair.maxTransferRateDeviationPercent === null
        ) {
          if (
            draftPair.maxTransferRateDeviationPercent
            !== savedPair.maxTransferRateDeviationPercent
          ) {
            return false;
          }
        } else {
          try {
            if (!new Big(draftPair.maxTransferRateDeviationPercent).eq(
              savedPair.maxTransferRateDeviationPercent
            )) {
              return false;
            }
          } catch {
            return false;
          }
        }

        if (draftPair.maxBaseCcyAmount === null || savedPair.maxBaseCcyAmount === null) {
          return draftPair.maxBaseCcyAmount === savedPair.maxBaseCcyAmount;
        }

        try {
          return new Big(draftPair.maxBaseCcyAmount).eq(savedPair.maxBaseCcyAmount);
        } catch {
          return false;
        }
      });
    }

    function updateAutoHedgingAdmissionDialogSaveAvailability() {
      if (
        autoHedgingAdmissionPolicySaving
        || !autoHedgingAdmissionPolicyLoaded
      ) {
        setSaveButtonAvailability(
          autoHedgingAdmissionPairDialogSave,
          false,
          autoHedgingAdmissionPolicySaving ? "Saving Policy" : "Policy is not loaded"
        );
        return;
      }

      const draft = autoHedgingAdmissionPolicyDraft();
      const canSave = Boolean(draft)
        && !sameAutoHedgingAdmissionPolicyDraft(draft);
      const unavailableReason = draft
        ? "No changes to save"
        : "Enter valid Ccy Pair admission criteria";
      setSaveButtonAvailability(
        autoHedgingAdmissionPairDialogSave,
        canSave,
        unavailableReason
      );
    }

    function syncAutoHedgingAdmissionPairControl(row) {
      const enabledControl = row?.querySelector(
        "[data-auto-hedging-admission-pair-enabled]"
      );
      const limitControl = row?.querySelector(
        "[data-auto-hedging-admission-pair-limit]"
      );

      if (!enabledControl || !limitControl) {
        return;
      }

      limitControl.disabled = autoHedgingAdmissionPolicySaving
        || !autoHedgingAdmissionPolicyLoaded
        || !enabledControl.checked;
      if (!enabledControl.checked) {
        limitControl.setCustomValidity("");
      }
      filterAutoHedgingAdmissionPairs();
      updateAutoHedgingAdmissionDialogSaveAvailability();
    }

    async function reloadAutoHedgingAdmissionPolicyFromApi() {
      const response = await demoApiRequest(
        "/api/v1/auto-hedging-admission-policy"
      );
      autoHedgingAdmissionPolicy = normalizedAutoHedgingAdmissionPolicy(response);
      autoHedgingAdmissionPolicyLoaded = true;
      renderAutoHedgingAdmissionPolicy();
      return autoHedgingAdmissionPolicy;
    }

    async function loadAutoHedgingAdmissionPolicySettings() {
      autoHedgingAdmissionPolicyLoaded = false;
      setAutoHedgingAdmissionPolicyBusy(true);

      if (!DEMO_API_ENABLED) {
        renderAutoHedgingAdmissionPolicy();
        setAutoHedgingAdmissionPolicyStatus(
          "SQLite API is unavailable. Start the demo to configure the policy.",
          "error"
        );
        return;
      }

      setAutoHedgingAdmissionPolicyStatus("Loading Auto Hedging Admission Policy...");

      try {
        await reloadAutoHedgingAdmissionPolicyFromApi();
        setAutoHedgingAdmissionPolicyStatus();
      } catch (error) {
        autoHedgingAdmissionPolicyLoaded = false;
        renderAutoHedgingAdmissionPolicy();
        setAutoHedgingAdmissionPolicyStatus(
          error.message || "Unable to load Auto Hedging Admission Policy.",
          "error"
        );
      } finally {
        setAutoHedgingAdmissionPolicyBusy(false);
      }
    }

    async function persistAutoHedgingAdmissionPolicy(draft, dialogStatus) {
      if (autoHedgingAdmissionPolicySaving) {
        return false;
      }

      autoHedgingAdmissionPolicySaving = true;
      setAutoHedgingAdmissionPolicyBusy(true);
      setAutoHedgingAdmissionPolicyStatus("Saving Auto Hedging Admission Policy...");
      setAutoHedgingAdmissionDialogStatus(dialogStatus, "Saving changes...");

      try {
        const response = await demoApiRequest(
          "/api/v1/auto-hedging-admission-policy",
          {
            method: "PUT",
            body: JSON.stringify(draft)
          }
        );
        autoHedgingAdmissionPolicy = normalizedAutoHedgingAdmissionPolicy(response);
        autoHedgingAdmissionPolicyLoaded = true;
        renderAutoHedgingAdmissionPolicy();
        setAutoHedgingAdmissionPolicyStatus(
          "Auto Hedging Admission Policy was saved successfully.",
          "success"
        );
        return true;
      } catch (error) {
        if (error.status === 409) {
          try {
            await reloadAutoHedgingAdmissionPolicyFromApi();
            autoHedgingAdmissionPairDialogSnapshot =
              autoHedgingAdmissionPairControlSnapshot();
            const conflictMessage =
              "The policy was updated elsewhere. The latest revision has been loaded; review it before saving again.";
            setAutoHedgingAdmissionPolicyStatus(conflictMessage, "error");
            setAutoHedgingAdmissionDialogStatus(
              dialogStatus,
              conflictMessage,
              "error"
            );
          } catch (reloadError) {
            autoHedgingAdmissionPolicyLoaded = false;
            const reloadMessage = reloadError.message
              || "The policy changed, but its latest revision could not be loaded.";
            setAutoHedgingAdmissionPolicyStatus(reloadMessage, "error");
            setAutoHedgingAdmissionDialogStatus(
              dialogStatus,
              reloadMessage,
              "error"
            );
          }
        } else {
          const errorMessage = error.message
            || "Unable to save Auto Hedging Admission Policy.";
          setAutoHedgingAdmissionPolicyStatus(errorMessage, "error");
          setAutoHedgingAdmissionDialogStatus(
            dialogStatus,
            errorMessage,
            "error"
          );
        }
        return false;
      } finally {
        autoHedgingAdmissionPolicySaving = false;
        setAutoHedgingAdmissionPolicyBusy(false);
        updateAutoHedgingAdmissionDialogSaveAvailability();
      }
    }

    async function saveAutoHedgingAdmissionPairDialog() {
      const draft = autoHedgingAdmissionPolicyDraft();
      const invalidControl = autoHedgingAdmissionPairRows.querySelector(":invalid");

      if (!draft || invalidControl) {
        if (invalidControl) {
          autoHedgingAdmissionPairSearch.value = "";
          autoHedgingAdmissionPairFilter.value = "ALL";
          filterAutoHedgingAdmissionPairs();
          invalidControl.focus();
          invalidControl.reportValidity();
        } else {
          setAutoHedgingAdmissionDialogStatus(
            autoHedgingAdmissionPairDialogStatus,
            "Enter valid Ccy Pair admission criteria.",
            "error"
          );
        }
        updateAutoHedgingAdmissionDialogSaveAvailability();
        return;
      }

      if (sameAutoHedgingAdmissionPolicyDraft(draft)) {
        closeAutoHedgingAdmissionPairDialog();
        return;
      }

      if (await persistAutoHedgingAdmissionPolicy(
        draft,
        autoHedgingAdmissionPairDialogStatus
      )) {
        closeAutoHedgingAdmissionPairDialog();
      }
    }

    function ensureAutoHedgingAdmissionPolicyEventBindings() {
      if (autoHedgingAdmissionPolicyEventsBound) {
        return;
      }

      autoHedgingAdmissionPolicyEventsBound = true;
      [
        autoHedgingAdmissionCcyPairEditButton,
        autoHedgingAdmissionAmountLimitEditButton,
        autoHedgingAdmissionDeviationEditButton
      ].forEach(button => {
        button.addEventListener("click", openAutoHedgingAdmissionPairDialog);
      });
      autoHedgingAdmissionPairDialogClose.addEventListener("click", () => {
        closeAutoHedgingAdmissionPairDialog({ restore: true });
      });
      autoHedgingAdmissionPairDialogCancel.addEventListener("click", () => {
        closeAutoHedgingAdmissionPairDialog({ restore: true });
      });
      autoHedgingAdmissionPairDialogForm.addEventListener("submit", event => {
        event.preventDefault();
        saveAutoHedgingAdmissionPairDialog();
      });
      autoHedgingAdmissionPairDialog.addEventListener("cancel", event => {
        event.preventDefault();
        if (!autoHedgingAdmissionPolicySaving) {
          closeAutoHedgingAdmissionPairDialog({ restore: true });
        }
      });
      autoHedgingAdmissionPairRows.addEventListener("change", event => {
        if (!event.target.matches("[data-auto-hedging-admission-pair-enabled]")) {
          return;
        }
        syncAutoHedgingAdmissionPairControl(
          event.target.closest("[data-auto-hedging-admission-pair-code]")
        );
      });
      autoHedgingAdmissionPairRows.addEventListener("input", event => {
        if (event.target.matches(
          "[data-auto-hedging-admission-pair-limit], "
          + "[data-auto-hedging-admission-deviation]"
        )) {
          updateAutoHedgingAdmissionDialogSaveAvailability();
        }
      });
      autoHedgingAdmissionPairSearch.addEventListener(
        "input",
        filterAutoHedgingAdmissionPairs
      );
      autoHedgingAdmissionPairSearch.addEventListener("keydown", event => {
        if (event.key === "Enter") {
          event.preventDefault();
        }
      });
      autoHedgingAdmissionPairFilter.addEventListener(
        "change",
        filterAutoHedgingAdmissionPairs
      );
      hedgingSettingsAutoGroupToggle.addEventListener("click", () => {
        setHedgingSettingsAutoGroupExpanded(
          hedgingSettingsAutoGroupToggle.getAttribute("aria-expanded") !== "true"
        );
      });
      autoHedgingSettingsSegmentToggles.forEach(toggle => {
        toggle.addEventListener("click", () => {
          toggleAutoHedgingSettingsSegment(toggle);
        });
      });
    }

    function hedgeQuickModeUnconfiguredPairs() {
      const configuredPairs = new Set(
        hedgeQuickModeSettings.map(setting => setting.currencyPair)
      );

      return marketCurrencyPairValues().filter(pair => !configuredPairs.has(pair));
    }

    function hedgeQuickModeSettingsOverviewRows() {
      return hedgeQuickModeSettings.map(setting => {
        const pricingRule = clientPricingRules.find(rule =>
          Number(rule.pricingRuleId) === Number(setting.pricingRuleId)
        ) || null;
        const context = pricingContextById(
          setting.executionContextId || pricingRule?.pricingContextId
        );

        return {
          ...setting,
          context,
          contextPath: context
            ? pricingContextDisplayPath(context)
            : "Missing Execution Context",
          presetsSummary: `${setting.baseCcyCode} ${setting.presets
            .map(preset => groupedDecimalText(preset.baseCcyAmount))
            .join(" / ")}`,
          state: !setting.active
            ? "INACTIVE"
            : setting.available
              ? "ACTIVE"
              : "UNAVAILABLE"
        };
      });
    }

    function hedgeQuickModeSettingsContextFormatter(cell) {
      const setting = cell.getRow().getData();

      if (!setting.context) {
        return '<span class="text-secondary">Missing Execution Context</span>';
      }

      return `
        <span class="client-pricing-context-candidate-path">
          ${pricingContextFacetsMarkup(setting.context, { executionSystemLabel: true })}
        </span>
      `;
    }

    function compactHedgeQuickModeAmount(value) {
      try {
        const amount = new Big(String(value));
        const units = [
          ["B", "1000000000"],
          ["M", "1000000"],
          ["K", "1000"]
        ];

        for (const [suffix, divisor] of units) {
          if (amount.gte(divisor)) {
            return `${amount.div(divisor).toFixed(2).replace(/\.?0+$/, "")}${suffix}`;
          }
        }
      } catch {
        return groupedDecimalText(value);
      }

      return groupedDecimalText(value);
    }

    function hedgeQuickModeSettingsPresetsFormatter(cell) {
      const setting = cell.getRow().getData();
      const compactAmounts = setting.presets.map(preset =>
        compactHedgeQuickModeAmount(preset.baseCcyAmount)
      );

      return `
        <span class="hedge-quick-settings-presets-summary">
          <span class="hedge-quick-settings-presets-summary-currency">${escapeHtml(setting.baseCcyCode)}</span>
          <span>${escapeHtml(compactAmounts.join(" / "))}</span>
        </span>
      `;
    }

    function hedgeQuickModeSettingsStateFormatter(cell) {
      return applicationStatusTokenMarkup(cell.getValue());
    }

    function hedgeQuickModeSettingsActionFormatter(cell) {
      const setting = cell.getRow().getData();

      return `
        <button type="button"
          class="btn btn-sm btn-outline-secondary reference-grid-action hedge-quick-settings-grid-action"
          data-hedge-quick-settings-action="edit"
          aria-label="Edit Quick Hedge settings for ${escapeHtml(setting.currencyPair)}">
          <span class="button-icon" aria-hidden="true">edit</span>
        </button>
      `;
    }

    function initializeHedgeQuickModeSettingsGrid(data) {
      hedgeQuickModeSettingsGrid = new Tabulator(hedgeQuickModeSettingsGridEl, {
        data,
        index: "ccyPairCode",
        layout: "fitDataTable",
        rowHeight: 36,
        placeholder: "No Quick Hedge Settings configured.",
        movableColumns: false,
        resizableColumns: false,
        initialSort: [{ column: "currencyPair", dir: "asc" }],
        columnDefaults: {
          resizable: false,
          vertAlign: "middle",
          tooltip: tabulatorCellOverflowTooltip,
          headerTooltip: tabulatorHeaderOverflowTooltip,
          headerSort: false
        },
        columns: uiTableColumns("hedge_quick_mode_settings_grid", [
          tabulatorSizedColumn("pair", {
            title: "Ccy Pair",
            field: "currencyPair",
            headerSort: true
          }),
          tabulatorSizedColumn("name", {
            title: "Hedge Counterparty",
            field: "counterpartyName"
          }),
          tabulatorSizedColumn("contextPath", {
            title: `
              <span class="hedge-quick-settings-column-title">
                <span class="button-icon" aria-hidden="true">hub</span>
                <span>Execution Context</span>
              </span>
            `,
            field: "contextPath",
            formatter: hedgeQuickModeSettingsContextFormatter
          }),
          tabulatorSizedColumn("presetAmounts", {
            title: "Quick Amounts",
            field: "presetsSummary",
            formatter: hedgeQuickModeSettingsPresetsFormatter
          }),
          tabulatorSizedColumn("tenor", {
            title: "Tenor",
            field: "defaultTenor",
            hozAlign: "center",
            headerHozAlign: "center"
          }),
          tabulatorSizedColumn("boolean", {
            title: "Status",
            field: "state",
            formatter: hedgeQuickModeSettingsStateFormatter
          }),
          tabulatorSizedColumn("compactActions", {
            title: "Actions",
            field: "actions",
            hozAlign: "center",
            headerHozAlign: "center",
            formatter: hedgeQuickModeSettingsActionFormatter,
            cellClick(event, cell) {
              if (!event.target.closest("[data-hedge-quick-settings-action='edit']")) {
                return;
              }

              openHedgeQuickModeSettingsEditor(cell.getRow().getData());
            }
          })
        ])
      });
      registerUiTableTabulator("hedge_quick_mode_settings_grid", hedgeQuickModeSettingsGrid);
      hedgeQuickModeSettingsGrid.on("tableBuilt", () => {
        hedgeQuickModeSettingsGridReady = true;

        if (hedgeQuickModeSettingsView === "overview") {
          hedgeQuickModeSettingsGrid.redraw(true);
        }
      });
    }

    function renderHedgeQuickModeSettingsOverview() {
      const rows = hedgeQuickModeSettingsOverviewRows();
      const availablePairs = hedgeQuickModeUnconfiguredPairs();
      hedgeQuickModeSettingsCount.textContent =
        `${rows.length} ${rows.length === 1 ? "setting" : "settings"}`;
      hedgeQuickModeSettingsNewButton.disabled = availablePairs.length === 0;
      hedgeQuickModeSettingsNewButton.setAttribute(
        "data-tooltip",
        availablePairs.length === 0
          ? "Every configured Ccy Pair already has Quick Hedge settings."
          : "New Quick Hedge setting"
      );

      if (!hedgeQuickModeSettingsGrid) {
        initializeHedgeQuickModeSettingsGrid(rows);
      } else {
        hedgeQuickModeSettingsGrid.replaceData(rows);
      }

      if (hedgeQuickModeSettingsGridReady) {
        requestAnimationFrame(() => {
          if (hedgeQuickModeSettingsView === "overview") {
            hedgeQuickModeSettingsGrid.redraw(true);
          }
        });
      }
    }

    function setHedgeQuickModeSettingsView(view) {
      const overview = view !== "editor";
      hedgeQuickModeSettingsView = overview ? "overview" : "editor";
      hedgeQuickModeSettingsOverview.hidden = !overview;
      hedgeQuickModeSettingsEditor.hidden = overview;
      hedgeQuickModeSettingsHeader.hidden = overview;
      hedgeQuickModeSettingsBackButton.hidden = overview;
      hedgeQuickModeSettingsActiveField.hidden = overview;
      hedgeQuickModeSettingsSaveButton.hidden = overview;
      hedgeQuickModeSettingsDeleteButton.hidden =
        overview || !currentHedgeQuickModeSetting();
      hedgeQuickModeSettingsCancelButton.hidden = overview;
      hedgeQuickModeSettingsCancelButton.textContent = "Cancel";
      hedgeQuickModeSettingsFooter.hidden = overview;
      if (overview) {
        hedgeQuickModeSettingsForm.elements.currencyPair.disabled = false;

        if (hedgeQuickModeSettingsGridReady) {
          requestAnimationFrame(() => hedgeQuickModeSettingsGrid.redraw(true));
        }
      }
    }

    function showHedgeQuickModeSettingsOverview(message = "", tone = "") {
      hedgeQuickModeSettingsForm.reset();
      hedgeQuickModeCounterpartyPickerExpanded = false;
      hedgeQuickModePricingRulesExpanded = false;
      hedgeQuickModeCounterpartyPicker.classList.remove("is-invalid");
      hedgeQuickModePricingRulePicker.classList.remove("is-invalid");
      setHedgeQuickModeSettingsView("overview");
      renderHedgeQuickModeSettingsOverview();
      setHedgeQuickModeSettingsStatus(message, tone);
    }

    function openHedgeQuickModeSettingsEditor(setting = null) {
      const unconfiguredPairs = hedgeQuickModeUnconfiguredPairs();

      if (!setting && unconfiguredPairs.length === 0) {
        setHedgeQuickModeSettingsStatus(
          "Every configured Ccy Pair already has Quick Hedge settings."
        );
        return;
      }

      const activePair = activeCurrencyPairOrDefault();
      const selectedPair = setting?.currencyPair
        || (unconfiguredPairs.includes(activePair) ? activePair : unconfiguredPairs[0]);

      hedgeQuickModeSettingsForm.reset();
      hedgeQuickModeCounterpartyPickerExpanded = false;
      hedgeQuickModePricingRulesExpanded = false;
      renderHedgeQuickModeCurrencyPairs(selectedPair, {
        unconfiguredOnly: !setting
      });
      hedgeQuickModeSettingsForm.elements.currencyPair.disabled = Boolean(setting);
      populateHedgeQuickModeSetting(setting);
      setHedgeQuickModeSettingsView("editor");
    }

    function hedgeQuickModeSettingsPair() {
      return normalizedPricingRuleCurrencyPair(
        hedgeQuickModeSettingsForm.elements.currencyPair.value
      );
    }

    function hedgeQuickModeSettingsPairCode() {
      return hedgeQuickModeSettingsPair().replace("/", "_");
    }

    function selectedHedgeQuickModePricingMode() {
      const pricingMode = String(
        hedgeQuickModeSettingsForm.elements.pricingMode.value || ""
      ).trim().toUpperCase();

      return pricingMode === "AUTO_PRICED" ? pricingMode : "";
    }

    function currentHedgeQuickModeSetting() {
      const pair = hedgeQuickModeSettingsPair();

      return hedgeQuickModeSettings
        .find(setting => setting.currencyPair === pair) || null;
    }

    function hedgeQuickModeEligiblePricingRules() {
      const pair = hedgeQuickModeSettingsPair();
      const pricingMode = selectedHedgeQuickModePricingMode();

      if (!pair || !pricingMode) {
        return [];
      }

      return clientPricingRules
        .filter(rule => tradingCounterpartyHasRole(rule, "HEDGE_COUNTERPARTY"))
        .filter(rule => isHedgeDealPricingRule(rule, pricingMode))
        .filter(rule => normalizedPricingRuleCurrencyPair(rule.currencyPair) === pair)
        .sort((left, right) => Number(left.pricingRuleId) - Number(right.pricingRuleId));
    }

    function hedgeQuickModeEligibleCounterpartyIds() {
      return new Set(
        hedgeQuickModeEligiblePricingRules().map(rule => String(rule.counterpartyId))
      );
    }

    function hedgeQuickModeCounterpartyProfiles() {
      const eligibleCounterpartyIds = hedgeQuickModeEligibleCounterpartyIds();

      return clientProfiles
        .filter(profile =>
          tradingCounterpartyHasRole(profile, "HEDGE_COUNTERPARTY")
          && profile.isActive
          && eligibleCounterpartyIds.has(String(profile.counterpartyId))
        )
        .sort((left, right) =>
          left.name.localeCompare(right.name) || String(left.inn).localeCompare(String(right.inn))
        );
    }

    function selectedHedgeQuickModeCounterparty() {
      const counterpartyId = Number(hedgeQuickModeSettingsForm.elements.counterpartyId.value);

      return hedgeQuickModeCounterpartyProfiles()
        .find(profile => Number(profile.counterpartyId) === counterpartyId) || null;
    }

    function setHedgeQuickModeCounterpartyPickerExpanded(expanded) {
      const isExpanded = Boolean(expanded);
      hedgeQuickModeCounterpartyPickerExpanded = isExpanded;
      hedgeQuickModeCounterpartyPickerToggle.setAttribute("aria-expanded", String(isExpanded));
      hedgeQuickModeCounterpartyPickerValue.setAttribute("aria-expanded", String(isExpanded));
      hedgeQuickModeCounterpartyOptions.hidden = !isExpanded;
    }

    function syncHedgeQuickModeCounterpartyClearAvailability() {
      hedgeQuickModeCounterpartyPickerClear.hidden =
        hedgeQuickModeCounterpartyPickerValue.value.length === 0;
    }

    function renderHedgeQuickModeCounterpartyOptions(
      searchText = "",
      selectedCounterpartyId = hedgeQuickModeSettingsForm.elements.counterpartyId.value
    ) {
      const profiles = hedgeQuickModeCounterpartyProfiles();
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

      hedgeQuickModeCounterpartyOptions.innerHTML = matchingProfiles.length > 0
        ? matchingProfiles.map(profile => {
            const selected = String(profile.counterpartyId) === selectedId;
            return `
              <button type="button" class="client-deal-client-option${selected ? " is-selected" : ""}" data-hedge-quick-mode-counterparty-id="${escapeHtml(profile.counterpartyId)}" role="option" aria-selected="${selected}">
                ${addClientDealProfileIdentityMarkup(profile)}
              </button>
            `;
          }).join("")
        : `<div class="client-deal-context-picker-empty">${
            profiles.length > 0
              ? "No Hedge Counterparties match the entered name."
              : `No active Hedge Counterparty with an Auto Priced Pricing Rule is available for ${
                  escapeHtml(hedgeQuickModeSettingsPair() || "the selected Ccy Pair")
                }.`
          }</div>`;
    }

    function renderHedgeQuickModeCounterparties(
      selectedCounterpartyId = hedgeQuickModeSettingsForm.elements.counterpartyId.value
    ) {
      const control = hedgeQuickModeSettingsForm.elements.counterpartyId;
      const profiles = hedgeQuickModeCounterpartyProfiles();
      const selectedId = String(selectedCounterpartyId || "");
      const selectedProfile = profiles
        .find(profile => String(profile.counterpartyId) === selectedId)
        || (profiles.length === 1 ? profiles[0] : null);

      control.value = selectedProfile?.counterpartyId || "";
      hedgeQuickModeCounterpartyPickerValue.value = selectedProfile?.name || "";
      syncHedgeQuickModeCounterpartyClearAvailability();
      renderHedgeQuickModeCounterpartyOptions("", control.value);
      setHedgeQuickModeCounterpartyPickerExpanded(false);
    }

    function hedgeQuickModePricingRules() {
      const counterparty = selectedHedgeQuickModeCounterparty();

      if (!counterparty) {
        return [];
      }

      return hedgeQuickModeEligiblePricingRules()
        .filter(rule => Number(rule.counterpartyId) === Number(counterparty.counterpartyId));
    }

    function hedgeQuickModePricingRuleOptions() {
      return hedgeQuickModePricingRules()
        .map(rule => ({
          rule,
          context: pricingContextById(rule.pricingContextId)
        }))
        .filter(option => option.context);
    }

    function selectedHedgeQuickModePricingRule() {
      const pricingRuleId = String(
        hedgeQuickModeSettingsForm.elements.pricingRuleId.value || ""
      );

      return hedgeQuickModePricingRules()
        .find(rule => String(rule.pricingRuleId) === pricingRuleId) || null;
    }

    function renderHedgeQuickModePricingRules() {
      const counterparty = selectedHedgeQuickModeCounterparty();
      const pair = hedgeQuickModeSettingsPair();
      const options = hedgeQuickModePricingRuleOptions();
      const selectedRuleId = String(
        hedgeQuickModeSettingsForm.elements.pricingRuleId.value || ""
      );
      const selectedOption = options.find(option =>
        String(option.rule.pricingRuleId) === selectedRuleId
      ) || (options.length === 1 ? options[0] : null);
      const emptyMessage = !counterparty
        ? "Select a Hedge Counterparty to see available Pricing Rules."
        : !pair
          ? "Select a currency pair to see available Pricing Rules."
          : "No Auto Priced Pricing Rule is configured for this Hedge Counterparty and currency pair.";

      hedgeQuickModeSettingsForm.elements.pricingRuleId.value =
        selectedOption?.rule.pricingRuleId || "";
      hedgeQuickModePricingRulePicker.innerHTML = `
        <span class="form-label client-deal-context-picker-label" id="hedgeQuickModePricingRuleLabel">Pricing Rule</span>
        <div class="input-group client-deal-pricing-rule-select${options.length === 0 ? " is-disabled" : ""}">
          <div class="form-control client-deal-pricing-rule-select-value" aria-labelledby="hedgeQuickModePricingRuleLabel" aria-describedby="hedgeQuickModePricingRuleHelp">
            ${selectedOption
              ? addHedgeDealPricingRuleContentMarkup(selectedOption.rule, selectedOption.context)
              : `<span class="client-deal-pricing-rule-placeholder">${escapeHtml(
                  options.length > 0
                    ? `Select Pricing Rule (${options.length} available)`
                    : emptyMessage
                )}</span><span></span>`}
          </div>
          <button type="button" class="btn btn-outline-secondary client-deal-pricing-rule-select-toggle" data-hedge-quick-mode-pricing-rule-toggle aria-label="Open Pricing Rule list" aria-haspopup="listbox" aria-controls="hedgeQuickModePricingRuleOptions" aria-expanded="${hedgeQuickModePricingRulesExpanded}"${options.length === 0 ? " disabled" : ""}>
            <span class="button-icon" aria-hidden="true">arrow_drop_down</span>
          </button>
        </div>
        <div class="client-deal-context-picker-viewport" id="hedgeQuickModePricingRuleOptions" role="listbox" aria-labelledby="hedgeQuickModePricingRuleLabel"${hedgeQuickModePricingRulesExpanded && options.length > 0 ? "" : " hidden"}>
          ${options.map(({ rule, context }) => {
              const selected =
                String(rule.pricingRuleId) === String(selectedOption?.rule.pricingRuleId || "");
              return `
                <button type="button" class="client-pricing-context-candidate${selected ? " is-selected" : ""}" data-hedge-quick-mode-pricing-rule-id="${escapeHtml(rule.pricingRuleId)}" role="option" aria-selected="${selected}">
                  ${addHedgeDealPricingRuleContentMarkup(rule, context)}
                </button>
              `;
            }).join("")}
        </div>
        ${hedgeQuickModePricingRulePicker.classList.contains("is-invalid")
          ? '<div class="invalid-feedback d-block">Select a Pricing Rule.</div>'
          : ""}
      `;
    }

    function renderHedgeQuickModeCurrencyPairs(
      selectedValue = "",
      { unconfiguredOnly = false } = {}
    ) {
      const control = hedgeQuickModeSettingsForm.elements.currencyPair;
      const pairs = unconfiguredOnly
        ? hedgeQuickModeUnconfiguredPairs()
        : marketCurrencyPairValues();
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

    function hedgeQuickModePresetByCode(setting, presetCode) {
      return setting?.presets.find(preset => preset.presetCode === presetCode) || null;
    }

    function populateHedgeQuickModeSetting(setting = currentHedgeQuickModeSetting()) {
      const amountFields = [
        ["smallBaseCcyAmount", "SMALL"],
        ["mediumBaseCcyAmount", "MEDIUM"],
        ["largeBaseCcyAmount", "LARGE"],
        ["xlargeBaseCcyAmount", "XLARGE"]
      ];

      hedgeQuickModeCounterpartyPicker.classList.remove("is-invalid");
      hedgeQuickModePricingRulePicker.classList.remove("is-invalid");
      hedgeQuickModePricingRulesExpanded = false;
      amountFields.forEach(([fieldName, presetCode]) => {
        const preset = hedgeQuickModePresetByCode(setting, presetCode);
        hedgeQuickModeSettingsForm.elements[fieldName].value =
          preset ? groupedDecimalText(preset.baseCcyAmount) : "";
        hedgeQuickModeSettingsForm.elements[fieldName].setCustomValidity("");
      });
      hedgeQuickModeSettingsForm.elements.defaultTenor.value =
        setting?.defaultTenor || "TOD";
      hedgeQuickModeSettingsForm.elements.active.checked = setting
        ? setting.active
        : true;
      renderHedgeQuickModeCounterparties(setting?.counterpartyId || "");
      hedgeQuickModeSettingsForm.elements.pricingRuleId.value =
        setting?.pricingRuleId || "";
      renderHedgeQuickModePricingRules();
      hedgeQuickModeSettingsDeleteButton.hidden = !setting;
      setHedgeQuickModeSettingsStatus(
        setting
          ? `Quick Hedge settings for ${setting.currencyPair} are ready.`
          : "No Quick Hedge settings are configured for this Ccy Pair.",
        setting ? "" : "warning"
      );
    }

    function handleHedgeQuickModeCounterpartyPicker(event) {
      const option = event.target.closest("[data-hedge-quick-mode-counterparty-id]");

      if (option) {
        hedgeQuickModeCounterpartyPicker.classList.remove("is-invalid");
        hedgeQuickModePricingRulePicker.classList.remove("is-invalid");
        hedgeQuickModeSettingsForm.elements.pricingRuleId.value = "";
        renderHedgeQuickModeCounterparties(option.dataset.hedgeQuickModeCounterpartyId);
        renderHedgeQuickModePricingRules();
        hedgeQuickModeCounterpartyPickerValue.focus();
        return;
      }

      if (event.target.closest("#hedgeQuickModeCounterpartyPickerClear")) {
        hedgeQuickModeSettingsForm.elements.counterpartyId.value = "";
        hedgeQuickModeSettingsForm.elements.pricingRuleId.value = "";
        hedgeQuickModeCounterpartyPickerValue.value = "";
        hedgeQuickModeCounterpartyPicker.classList.remove("is-invalid");
        hedgeQuickModePricingRulePicker.classList.remove("is-invalid");
        syncHedgeQuickModeCounterpartyClearAvailability();
        renderHedgeQuickModeCounterpartyOptions();
        setHedgeQuickModeCounterpartyPickerExpanded(true);
        renderHedgeQuickModePricingRules();
        hedgeQuickModeCounterpartyPickerValue.focus();
        return;
      }

      if (event.target.closest("#hedgeQuickModeCounterpartyPickerToggle")) {
        const willExpand =
          hedgeQuickModeCounterpartyPickerToggle.getAttribute("aria-expanded") !== "true";

        if (willExpand) {
          renderHedgeQuickModeCounterpartyOptions(
            hedgeQuickModeSettingsForm.elements.counterpartyId.value
              ? ""
              : hedgeQuickModeCounterpartyPickerValue.value
          );
        }

        setHedgeQuickModeCounterpartyPickerExpanded(willExpand);
        return;
      }

      if (event.target === hedgeQuickModeCounterpartyPickerValue) {
        renderHedgeQuickModeCounterpartyOptions(
          hedgeQuickModeSettingsForm.elements.counterpartyId.value
            ? ""
            : hedgeQuickModeCounterpartyPickerValue.value
        );
        setHedgeQuickModeCounterpartyPickerExpanded(true);
      }
    }

    function handleHedgeQuickModePricingRulePicker(event) {
      const toggle = event.target.closest("[data-hedge-quick-mode-pricing-rule-toggle]");

      if (toggle) {
        event.stopPropagation();
        hedgeQuickModePricingRulesExpanded = !hedgeQuickModePricingRulesExpanded;
        renderHedgeQuickModePricingRules();
        hedgeQuickModePricingRulePicker
          .querySelector("[data-hedge-quick-mode-pricing-rule-toggle]")
          ?.focus();
        return;
      }

      const option = event.target.closest("[data-hedge-quick-mode-pricing-rule-id]");

      if (!option) {
        return;
      }

      hedgeQuickModeSettingsForm.elements.pricingRuleId.value =
        option.dataset.hedgeQuickModePricingRuleId || "";
      hedgeQuickModePricingRulesExpanded = false;
      hedgeQuickModePricingRulePicker.classList.remove("is-invalid");
      renderHedgeQuickModePricingRules();
      hedgeQuickModePricingRulePicker
        .querySelector("[data-hedge-quick-mode-pricing-rule-toggle]")
        ?.focus();
    }

    function handleHedgeQuickModeCounterpartySearch() {
      const selected = selectedHedgeQuickModeCounterparty();

      if (selected && hedgeQuickModeCounterpartyPickerValue.value !== selected.name) {
        hedgeQuickModeSettingsForm.elements.counterpartyId.value = "";
        hedgeQuickModeSettingsForm.elements.pricingRuleId.value = "";
        hedgeQuickModePricingRulePicker.classList.remove("is-invalid");
        renderHedgeQuickModePricingRules();
      }

      syncHedgeQuickModeCounterpartyClearAvailability();
      renderHedgeQuickModeCounterpartyOptions(
        hedgeQuickModeCounterpartyPickerValue.value,
        hedgeQuickModeSettingsForm.elements.counterpartyId.value
      );
      setHedgeQuickModeCounterpartyPickerExpanded(true);
    }

    async function loadHedgingSettingsPage({ reload = true } = {}) {
      setHedgingSettingsSection(hedgingSettingsSectionFromLocation());
      if (!reload) {
        return;
      }

      ensureAutoHedgingAdmissionPolicyEventBindings();
      renderAutoHedgingAdmissionPolicy();
      const autoHedgingAdmissionPolicyLoad =
        loadAutoHedgingAdmissionPolicySettings();

      hedgeQuickModeSettingsForm.reset();
      hedgeQuickModeCounterpartyPickerExpanded = false;
      hedgeQuickModePricingRulesExpanded = false;
      setHedgeQuickModeSettingsView("overview");
      renderHedgeQuickModeSettingsOverview();
      hedgeQuickModeSettingsNewButton.disabled = true;
      hedgeQuickModeSettingsSaveButton.disabled = true;
      setHedgeQuickModeSettingsStatus("Loading Quick Hedge settings...");

      try {
        await reloadHedgeQuickModeSettingsFromApi();
        showHedgeQuickModeSettingsOverview();
      } catch (error) {
        renderHedgeQuickModeSettingsOverview();
        setHedgeQuickModeSettingsStatus(
          error.message || "Unable to load Quick Hedge settings.",
          "error"
        );
      } finally {
        hedgeQuickModeSettingsSaveButton.disabled = false;
      }

      await autoHedgingAdmissionPolicyLoad;
    }

    function validateHedgeQuickModeSettingsForm() {
      const counterparty = selectedHedgeQuickModeCounterparty();
      const rule = selectedHedgeQuickModePricingRule();
      const amountInputs = [
        hedgeQuickModeSettingsForm.elements.smallBaseCcyAmount,
        hedgeQuickModeSettingsForm.elements.mediumBaseCcyAmount,
        hedgeQuickModeSettingsForm.elements.largeBaseCcyAmount,
        hedgeQuickModeSettingsForm.elements.xlargeBaseCcyAmount
      ];
      const amountTexts = amountInputs.map(input => positiveDecimalInputText(input.value));

      hedgeQuickModeCounterpartyPicker.classList.toggle("is-invalid", !counterparty);
      hedgeQuickModePricingRulePicker.classList.toggle("is-invalid", !rule);
      amountInputs.forEach((input, index) => {
        input.setCustomValidity(
          amountTexts[index] === null ? "Enter a positive Base Ccy Amount." : ""
        );
      });

      if (amountTexts.every(value => value !== null)) {
        const increasing = amountTexts.every((value, index) =>
          index === 0 || new Big(value).gt(amountTexts[index - 1])
        );

        amountInputs[amountInputs.length - 1].setCustomValidity(
          increasing
            ? ""
            : "Quick Mode amounts must increase from Small through Extra Large."
        );
      }

      if (!counterparty) {
        hedgeQuickModeCounterpartyPickerValue.focus();
        return null;
      }

      if (!rule) {
        renderHedgeQuickModePricingRules();
        hedgeQuickModePricingRulePicker
          .querySelector("[data-hedge-quick-mode-pricing-rule-toggle]")
          ?.focus();
        return null;
      }

      if (!hedgeQuickModeSettingsForm.reportValidity()) {
        return null;
      }

      return {
        counterpartyId: counterparty.counterpartyId,
        pricingRuleId: Number(rule.pricingRuleId),
        smallBaseCcyAmount: amountTexts[0],
        mediumBaseCcyAmount: amountTexts[1],
        largeBaseCcyAmount: amountTexts[2],
        xlargeBaseCcyAmount: amountTexts[3],
        defaultTenor: hedgeQuickModeSettingsForm.elements.defaultTenor.value,
        active: hedgeQuickModeSettingsForm.elements.active.checked
      };
    }

    async function saveHedgeQuickModeSettings(event) {
      event.preventDefault();

      if (hedgeQuickModeSettingsSaving) {
        return;
      }

      const payload = validateHedgeQuickModeSettingsForm();
      const ccyPairCode = hedgeQuickModeSettingsPairCode();
      const currencyPair = hedgeQuickModeSettingsPair();

      if (!payload || !ccyPairCode) {
        return;
      }

      hedgeQuickModeSettingsSaving = true;
      hedgeQuickModeSettingsSaveButton.disabled = true;
      hedgeQuickModeSettingsDeleteButton.disabled = true;
      setHedgeQuickModeSettingsStatus("Saving Quick Hedge settings...");

      try {
        await demoApiRequest(
          `/api/v1/hedge-quick-mode-settings/${encodeURIComponent(ccyPairCode)}`,
          {
            method: "PUT",
            body: JSON.stringify(payload)
          }
        );
        await reloadHedgeQuickModeSettingsFromApi();
        showHedgeQuickModeSettingsOverview(
          `Quick Hedge settings for ${currencyPair} were saved successfully.`,
          "success"
        );
        render(fxPositions);
      } catch (error) {
        setHedgeQuickModeSettingsStatus(
          error.message || "Unable to save Quick Hedge settings.",
          "error"
        );
      } finally {
        hedgeQuickModeSettingsSaving = false;
        hedgeQuickModeSettingsSaveButton.disabled = false;
        hedgeQuickModeSettingsDeleteButton.disabled = false;
      }
    }

    async function deleteHedgeQuickModeSettings() {
      const setting = currentHedgeQuickModeSetting();

      if (!setting || hedgeQuickModeSettingsSaving) {
        return;
      }

      hedgeQuickModeSettingsSaving = true;
      hedgeQuickModeSettingsSaveButton.disabled = true;
      hedgeQuickModeSettingsDeleteButton.disabled = true;
      setHedgeQuickModeSettingsStatus("Deleting Quick Hedge settings...");

      try {
        await demoApiRequest(
          `/api/v1/hedge-quick-mode-settings/${encodeURIComponent(setting.ccyPairCode)}`,
          { method: "DELETE" }
        );
        await reloadHedgeQuickModeSettingsFromApi();
        showHedgeQuickModeSettingsOverview(
          `Quick Hedge settings for ${setting.currencyPair} were deleted successfully.`,
          "success"
        );
        render(fxPositions);
      } catch (error) {
        setHedgeQuickModeSettingsStatus(
          error.message || "Unable to delete Quick Hedge settings.",
          "error"
        );
      } finally {
        hedgeQuickModeSettingsSaving = false;
        hedgeQuickModeSettingsSaveButton.disabled = false;
        hedgeQuickModeSettingsDeleteButton.disabled = false;
      }
    }

    function renderAddHedgeDealCurrencyPairs(selectedValue = "") {
      const control = addHedgeDealForm.elements.currencyPair;
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

    function eligibleHedgeDealCounterpartyIds(
      pairValue = addHedgeDealForm.elements.currencyPair.value
    ) {
      const pair = normalizedPricingRuleCurrencyPair(pairValue);
      const pricingMode = selectedAddHedgeDealPricingMode();

      if (!pair || !pricingMode) {
        return new Set();
      }

      return new Set(
        clientPricingRules
          .filter(rule => tradingCounterpartyHasRole(rule, "HEDGE_COUNTERPARTY"))
          .filter(rule => pricingModeForRule(rule) === pricingMode)
          .filter(rule => normalizedPricingRuleCurrencyPair(rule.currencyPair) === pair)
          .map(rule => String(rule.counterpartyId))
      );
    }

    function hedgeDealCounterpartyProfiles(
      pairValue = addHedgeDealForm.elements.currencyPair.value
    ) {
      const eligibleCounterpartyIds = eligibleHedgeDealCounterpartyIds(pairValue);

      return clientProfiles
        .filter(profile =>
          tradingCounterpartyHasRole(profile, "HEDGE_COUNTERPARTY")
          && profile.isActive
          && eligibleCounterpartyIds.has(String(profile.counterpartyId))
        )
        .sort((left, right) =>
          left.name.localeCompare(right.name) || String(left.inn).localeCompare(String(right.inn))
        );
    }

    function selectedAddHedgeDealCounterparty() {
      const counterpartyId = Number(addHedgeDealForm.elements.counterpartyId.value);

      return hedgeDealCounterpartyProfiles()
        .find(profile => Number(profile.counterpartyId) === counterpartyId) || null;
    }

    function setAddHedgeDealCounterpartyPickerExpanded(expanded) {
      const isExpanded = Boolean(expanded);
      addHedgeDealCounterpartyPickerExpanded = isExpanded;
      addHedgeDealCounterpartyPickerToggle.setAttribute("aria-expanded", String(isExpanded));
      addHedgeDealCounterpartyPickerValue.setAttribute("aria-expanded", String(isExpanded));
      addHedgeDealCounterpartyOptions.hidden = !isExpanded;
    }

    function syncAddHedgeDealCounterpartyClearAvailability() {
      addHedgeDealCounterpartyPickerClear.hidden =
        addHedgeDealCounterpartyPickerValue.value.length === 0;
    }

    function renderAddHedgeDealCounterpartyOptions(
      searchText = "",
      selectedCounterpartyId = addHedgeDealForm.elements.counterpartyId.value
    ) {
      const profiles = hedgeDealCounterpartyProfiles();
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

      addHedgeDealCounterpartyOptions.innerHTML = matchingProfiles.length > 0
        ? matchingProfiles.map(profile => {
            const selected = String(profile.counterpartyId) === selectedId;
            return `
              <button type="button" class="client-deal-client-option${selected ? " is-selected" : ""}" data-add-hedge-deal-counterparty-id="${escapeHtml(profile.counterpartyId)}" role="option" aria-selected="${selected}">
                ${addClientDealProfileIdentityMarkup(profile)}
              </button>
            `;
          }).join("")
        : `<div class="client-deal-context-picker-empty">${
            profiles.length > 0
              ? "No Hedge Counterparties match the entered name."
              : `No Hedge Counterparty with ${escapeHtml(
                  selectedAddHedgeDealPricingMode()
                )} Pricing Rules is available for ${
                  escapeHtml(
                    normalizedPricingRuleCurrencyPair(
                      addHedgeDealForm.elements.currencyPair.value
                    ) || "the selected Ccy Pair"
                  )
                }.`
          }</div>`;
    }

    function renderAddHedgeDealCounterparties(
      selectedCounterpartyId = addHedgeDealForm.elements.counterpartyId.value
    ) {
      const control = addHedgeDealForm.elements.counterpartyId;
      const profiles = hedgeDealCounterpartyProfiles();
      const selectedId = String(selectedCounterpartyId || "");
      const selectedProfile = profiles
        .find(profile => String(profile.counterpartyId) === selectedId)
        || (profiles.length === 1 ? profiles[0] : null);

      control.value = selectedProfile?.counterpartyId || "";
      addHedgeDealCounterpartyPickerValue.value = selectedProfile?.name || "";
      syncAddHedgeDealCounterpartyClearAvailability();
      renderAddHedgeDealCounterpartyOptions("", control.value);
      setAddHedgeDealCounterpartyPickerExpanded(false);
    }

    function handleAddHedgeDealCounterpartyPicker(event) {
      if (addHedgeDealQuickModeSelection) {
        return;
      }

      const option = event.target.closest("[data-add-hedge-deal-counterparty-id]");

      if (option) {
        addHedgeDealCounterpartyPicker.classList.remove("is-invalid");
        addHedgeDealPricingRulePicker.classList.remove("is-invalid");
        addHedgeDealForm.elements.pricingRuleId.value = "";
        renderAddHedgeDealCounterparties(option.dataset.addHedgeDealCounterpartyId);
        renderAddHedgeDealPricingRules();
        syncAddHedgeDealDerivedFields();
        addHedgeDealCounterpartyPickerValue.focus();
        return;
      }

      if (event.target.closest("#addHedgeDealCounterpartyPickerClear")) {
        addHedgeDealForm.elements.counterpartyId.value = "";
        addHedgeDealForm.elements.pricingRuleId.value = "";
        addHedgeDealCounterpartyPickerValue.value = "";
        addHedgeDealCounterpartyPicker.classList.remove("is-invalid");
        addHedgeDealPricingRulePicker.classList.remove("is-invalid");
        syncAddHedgeDealCounterpartyClearAvailability();
        renderAddHedgeDealCounterpartyOptions();
        setAddHedgeDealCounterpartyPickerExpanded(true);
        renderAddHedgeDealPricingRules();
        syncAddHedgeDealDerivedFields();
        addHedgeDealCounterpartyPickerValue.focus();
        return;
      }

      if (event.target.closest("#addHedgeDealCounterpartyPickerToggle")) {
        const willExpand =
          addHedgeDealCounterpartyPickerToggle.getAttribute("aria-expanded") !== "true";

        if (willExpand) {
          renderAddHedgeDealCounterpartyOptions(
            addHedgeDealForm.elements.counterpartyId.value
              ? ""
              : addHedgeDealCounterpartyPickerValue.value
          );
        }

        setAddHedgeDealCounterpartyPickerExpanded(willExpand);
        return;
      }

      if (event.target === addHedgeDealCounterpartyPickerValue) {
        renderAddHedgeDealCounterpartyOptions(
          addHedgeDealForm.elements.counterpartyId.value
            ? ""
            : addHedgeDealCounterpartyPickerValue.value
        );
        setAddHedgeDealCounterpartyPickerExpanded(true);
      }
    }

    function addHedgeDealPricingRules() {
      const counterparty = selectedAddHedgeDealCounterparty();
      const pair = normalizedPricingRuleCurrencyPair(addHedgeDealForm.elements.currencyPair.value);
      const pricingMode = selectedAddHedgeDealPricingMode();

      if (!counterparty || !pair || !pricingMode) {
        return [];
      }

      return clientPricingRules
        .filter(rule => tradingCounterpartyHasRole(rule, "HEDGE_COUNTERPARTY"))
        .filter(rule => pricingModeForRule(rule) === pricingMode)
        .filter(rule => Number(rule.counterpartyId) === Number(counterparty.counterpartyId))
        .filter(rule => normalizedPricingRuleCurrencyPair(rule.currencyPair) === pair)
        .sort((left, right) => Number(left.pricingRuleId) - Number(right.pricingRuleId));
    }

    function addHedgeDealPricingRuleOptions() {
      return addHedgeDealPricingRules()
        .map(rule => ({
          rule,
          context: pricingContextById(rule.pricingContextId)
        }))
        .filter(option => option.context);
    }

    function selectedAddHedgeDealPricingRule() {
      const pricingRuleId = String(addHedgeDealForm.elements.pricingRuleId.value || "");

      return addHedgeDealPricingRules()
        .find(rule => String(rule.pricingRuleId) === pricingRuleId) || null;
    }

    function addHedgeDealPricingRuleContentMarkup(rule, context) {
      return addClientDealPricingRuleContentMarkup(
        rule,
        context,
        { executionSystemLabel: true, showPricingModeIndicator: false }
      );
    }

    function renderAddHedgeDealPricingRules() {
      const counterparty = selectedAddHedgeDealCounterparty();
      const pair = normalizedPricingRuleCurrencyPair(addHedgeDealForm.elements.currencyPair.value);
      const options = addHedgeDealPricingRuleOptions();
      const selectedRuleId = String(addHedgeDealForm.elements.pricingRuleId.value || "");
      const selectedOption = options.find(option =>
        String(option.rule.pricingRuleId) === selectedRuleId
      ) || (options.length === 1 ? options[0] : null);
      const emptyMessage = !counterparty
        ? "Select a Hedge Counterparty to see available Pricing Rules."
        : !pair
          ? "Select a currency pair to see available Pricing Rules."
          : "No Pricing Rule is configured for this Hedge Counterparty and currency pair.";

      addHedgeDealForm.elements.pricingRuleId.value = selectedOption?.rule.pricingRuleId || "";
      addHedgeDealPricingRulePicker.innerHTML = `
        <span class="form-label client-deal-context-picker-label" id="addHedgeDealPricingRuleLabel">Pricing Rule</span>
        <div class="input-group client-deal-pricing-rule-select${options.length === 0 || addHedgeDealQuickModeSelection ? " is-disabled" : ""}">
          <div class="form-control client-deal-pricing-rule-select-value" aria-labelledby="addHedgeDealPricingRuleLabel">
            ${selectedOption
              ? addHedgeDealPricingRuleContentMarkup(selectedOption.rule, selectedOption.context)
              : `<span class="client-deal-pricing-rule-placeholder">${escapeHtml(
                  options.length > 0
                    ? `Select Pricing Rule (${options.length} available)`
                    : emptyMessage
                )}</span><span></span>`}
          </div>
          <button type="button" class="btn btn-outline-secondary client-deal-pricing-rule-select-toggle" data-add-hedge-deal-pricing-rule-toggle aria-label="Open Pricing Rule list" aria-haspopup="listbox" aria-controls="addHedgeDealPricingRuleOptions" aria-expanded="${addHedgeDealPricingRulesExpanded}"${options.length === 0 || addHedgeDealQuickModeSelection ? " disabled" : ""}>
            <span class="button-icon" aria-hidden="true">arrow_drop_down</span>
          </button>
        </div>
        <div class="client-deal-context-picker-viewport" id="addHedgeDealPricingRuleOptions" role="listbox" aria-labelledby="addHedgeDealPricingRuleLabel"${addHedgeDealPricingRulesExpanded && options.length > 0 ? "" : " hidden"}>
          ${options.map(({ rule, context }) => {
              const selected = String(rule.pricingRuleId) === String(selectedOption?.rule.pricingRuleId || "");
              return `
                <button type="button" class="client-pricing-context-candidate${selected ? " is-selected" : ""}" data-add-hedge-deal-pricing-rule-id="${escapeHtml(rule.pricingRuleId)}" role="option" aria-selected="${selected}">
                  ${addHedgeDealPricingRuleContentMarkup(rule, context)}
                </button>
              `;
            }).join("")}
        </div>
        ${addHedgeDealPricingRulePicker.classList.contains("is-invalid")
          ? '<div class="invalid-feedback d-block">Select a Pricing Rule.</div>'
          : ""}
      `;
    }

    function syncAddHedgeDealMarketQuote() {
      if (!addHedgeDealForm) {
        return;
      }

      const pairValue = normalizedPricingRuleCurrencyPair(addHedgeDealForm.elements.currencyPair.value);
      const quote = currentMarketQuoteForPair(pairValue);
      const pair = marketPairs.find(item => item.currencyPair === pairValue);
      const status = !DEMO_API_ENABLED
        ? "Unavailable"
        : !marketSimulationConfigured(pair)
          ? "Not configured"
          : !marketStreamConnected
            ? "Connecting"
            : marketStreamRunning ? "Active" : "Stopped";
      const statusIndicator = addHedgeDealForm.querySelector("[data-add-hedge-deal-market-status]");
      const marketPulseCard = document.getElementById("addHedgeDealMarketPulse");

      document.getElementById("addHedgeDealMarketBid").value = quote
        ? formatMarketQuote(quote.bid, pair)
        : "";
      document.getElementById("addHedgeDealMarketOffer").value = quote
        ? formatMarketQuote(quote.offer, pair)
        : "";
      const quoteDisplay = document.getElementById("addHedgeDealMarketQuote");
      quoteDisplay.querySelector("[data-market-quote-bid]").textContent =
        document.getElementById("addHedgeDealMarketBid").value;
      quoteDisplay.querySelector("[data-market-quote-offer]").textContent =
        document.getElementById("addHedgeDealMarketOffer").value;
      addHedgeDealForm.querySelector("[data-add-hedge-deal-market-status-text]").textContent = status;
      statusIndicator.title = status;
      statusIndicator.classList.toggle("is-active", status === "Active");
      statusIndicator.classList.toggle("is-stopped", status === "Stopped");
      marketPulseCard.classList.toggle("is-live", status === "Active" && Boolean(quote));
    }

    function syncAddHedgeDealTradeRate() {
      const tradeRateInput = addHedgeDealForm.elements.tradeRate;
      const autoPriced = selectedAddHedgeDealPricingMode() === "AUTO_PRICED";

      tradeRateInput.readOnly = autoPriced;
      tradeRateInput.setCustomValidity("");

      if (!autoPriced) {
        return;
      }

      const ourSide = oppositeFxSide(addHedgeDealForm.elements.side.value);
      const marketRate = ourSide === "SELL"
        ? document.getElementById("addHedgeDealMarketBid").value
        : ourSide === "BUY"
          ? document.getElementById("addHedgeDealMarketOffer").value
          : "";

      tradeRateInput.value = marketRate;

      if (!marketRate) {
        tradeRateInput.setCustomValidity(
          "A Market Pulse quote is required for an Auto Priced Hedge FX Deal."
        );
      }
    }

    function oppositeFxSide(side) {
      const normalizedSide = String(side || "").trim().toUpperCase();

      if (normalizedSide === "BUY") {
        return "SELL";
      }

      if (normalizedSide === "SELL") {
        return "BUY";
      }

      return "";
    }

    function syncAddHedgeDealCurrencyLabels() {
      const pairValue = normalizedPricingRuleCurrencyPair(addHedgeDealForm.elements.currencyPair.value);
      const currencies = currenciesFromPair(pairValue || "BASE/QUOTE");
      const positionSide = addHedgeDealForm.elements.side.value;
      const ourSide = oppositeFxSide(positionSide);

      addHedgeDealForm.querySelector("[data-add-hedge-deal-base-ccy]").textContent = currencies.base;
      addHedgeDealForm.querySelector("[data-add-hedge-deal-quote-ccy]").textContent = currencies.quote;
      addHedgeDealSideControl.innerHTML = `
        <option value="">Select...</option>
        <option value="BUY">BUY ${escapeHtml(currencies.base)}</option>
        <option value="SELL">SELL ${escapeHtml(currencies.base)}</option>
      `;
      addHedgeDealSideControl.value = ourSide;

      addHedgeDealForm.querySelectorAll("[data-add-hedge-deal-fixing-currency]").forEach(control => {
        const currency = control.dataset.addHedgeDealFixingCurrency === "quote"
          ? currencies.quote
          : currencies.base;
        control.setAttribute("aria-label", `Use ${currency} as fixed amount currency`);
      });
    }

    function addHedgeDealExactAmounts() {
      const pairValue = normalizedPricingRuleCurrencyPair(
        addHedgeDealForm.elements.currencyPair.value
      );
      const currencies = currenciesFromPair(pairValue);
      const fixing = addHedgeDealForm.elements.amountFixingCurrency.value === "quote"
        ? "quote"
        : "base";
      const dealtCcyCode = fixing === "quote" ? currencies.quote : currencies.base;
      const dealtInput = fixing === "quote"
        ? addHedgeDealForm.elements.quoteCcyAmount
        : addHedgeDealForm.elements.baseCcyAmount;
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
        tradeRate: addHedgeDealForm.elements.tradeRate.value
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

    function syncAddHedgeDealAmounts() {
      const fixing = addHedgeDealForm.elements.amountFixingCurrency.value === "quote"
        ? "quote"
        : "base";
      const baseInput = addHedgeDealForm.elements.baseCcyAmount;
      const quoteInput = addHedgeDealForm.elements.quoteCcyAmount;

      baseInput.readOnly = fixing === "quote";
      quoteInput.readOnly = fixing === "base";
      baseInput.setCustomValidity("");
      quoteInput.setCustomValidity("");

      addHedgeDealForm.querySelectorAll("[data-add-hedge-deal-fixing-currency]").forEach(control => {
        const isFixed = control.dataset.addHedgeDealFixingCurrency === fixing;
        control.classList.toggle("is-active", isFixed);
        control.setAttribute("aria-pressed", String(isFixed));
        control.querySelector("[data-add-hedge-deal-fixing-icon]").textContent = isFixed
          ? "radio_button_checked"
          : "radio_button_unchecked";
        control.closest("[data-add-hedge-deal-amount-field]")?.classList.toggle("is-fixed", isFixed);
      });

      const amounts = addHedgeDealExactAmounts();

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

    function selectAddHedgeDealAmountFixingCurrency(event) {
      if (addHedgeDealQuickModeSelection) {
        return;
      }

      const control = event.target.closest("[data-add-hedge-deal-fixing-currency]");

      if (!control) {
        return;
      }

      const fixing = control.dataset.addHedgeDealFixingCurrency === "quote" ? "quote" : "base";
      addHedgeDealForm.elements.amountFixingCurrency.value = fixing;
      syncAddHedgeDealDerivedFields();

      const amountInput = fixing === "quote"
        ? addHedgeDealForm.elements.quoteCcyAmount
        : addHedgeDealForm.elements.baseCcyAmount;
      amountInput.focus();
      amountInput.select();
    }

    function formatAddHedgeDealAmounts() {
      const amounts = addHedgeDealExactAmounts();

      if (amounts) {
        addHedgeDealForm.elements.baseCcyAmount.value = formattedMinorAmount(
          amounts.baseAmountMinor,
          amounts.baseFractionDigits
        );
        addHedgeDealForm.elements.quoteCcyAmount.value = formattedMinorAmount(
          amounts.quoteAmountMinor,
          amounts.quoteFractionDigits
        );
      }

      syncAddHedgeDealDerivedFields();
    }

    function syncAddHedgeDealDerivedFields() {
      const pairValue = normalizedPricingRuleCurrencyPair(addHedgeDealForm.elements.currencyPair.value);
      const pair = marketPairs.find(item => item.currencyPair === pairValue);
      const side = addHedgeDealForm.elements.side.value;
      const rule = selectedAddHedgeDealPricingRule();

      syncAddHedgeDealCurrencyLabels();
      syncAddHedgeDealMarketQuote();
      syncAddHedgeDealTradeRate();
      syncAddHedgeDealAmounts();

      const tradeRateText = positiveDecimalInputText(addHedgeDealForm.elements.tradeRate.value);
      const amounts = addHedgeDealExactAmounts();
      const transferRateText = rule
        ? exactTransferRateTextFromPricingRule(
            side.toLowerCase(),
            tradeRateText,
            String(rule.marginPercent),
            pair?.defaultQuoteDecimals
          )
        : null;
      const analyticalPnlText = amounts
        ? exactAnalyticalPnlText({
            side,
            baseCcyAmount: amounts.baseCcyAmount,
            tradeRate: tradeRateText,
            transferRate: transferRateText,
            quoteFractionDigits: amounts.quoteFractionDigits
          })
        : null;

      document.getElementById("addHedgeDealTransferRate").value = transferRateText || "";
      document.getElementById("addHedgeDealAnalyticalPnl").value = analyticalPnlText !== null
        ? groupedDecimalText(analyticalPnlText)
        : "";
    }

    function handleAddHedgeDealPricingRulePicker(event) {
      if (addHedgeDealQuickModeSelection) {
        return;
      }

      const toggle = event.target.closest("[data-add-hedge-deal-pricing-rule-toggle]");

      if (toggle) {
        event.stopPropagation();
        addHedgeDealPricingRulesExpanded = !addHedgeDealPricingRulesExpanded;
        renderAddHedgeDealPricingRules();
        addHedgeDealPricingRulePicker
          .querySelector("[data-add-hedge-deal-pricing-rule-toggle]")
          ?.focus();
        return;
      }

      const optionButton = event.target.closest("[data-add-hedge-deal-pricing-rule-id]");

      if (!optionButton) {
        return;
      }

      addHedgeDealForm.elements.pricingRuleId.value =
        optionButton.dataset.addHedgeDealPricingRuleId || "";
      addHedgeDealPricingRulesExpanded = false;
      addHedgeDealPricingRulePicker.classList.remove("is-invalid");
      renderAddHedgeDealPricingRules();
      syncAddHedgeDealDerivedFields();
      addHedgeDealPricingRulePicker
        .querySelector("[data-add-hedge-deal-pricing-rule-toggle]")
          ?.focus();
    }

    function syncAddHedgeDealModeLocks() {
      const quickMode = Boolean(addHedgeDealQuickModeSelection);
      const currencyPairControl = addHedgeDealForm.elements.currencyPair;
      const baseAmountInput = addHedgeDealForm.elements.baseCcyAmount;
      const pricingRuleToggle = addHedgeDealPricingRulePicker
        .querySelector("[data-add-hedge-deal-pricing-rule-toggle]");

      syncAddHedgeDealPricingModeIcon();
      currencyPairControl.disabled = quickMode;
      addHedgeDealPricingModeControl.disabled = addHedgeDealPricingModeLocked;
      addHedgeDealSideControl.disabled = addHedgeDealSideLocked;
      addHedgeDealCounterpartyPickerValue.readOnly = quickMode;
      addHedgeDealCounterpartyPickerToggle.disabled = quickMode;
      addHedgeDealCounterpartyPickerClear.hidden =
        quickMode || addHedgeDealCounterpartyPickerValue.value.length === 0;
      baseAmountInput.readOnly = quickMode;
      addHedgeDealForm.querySelectorAll("[data-add-hedge-deal-fixing-currency]")
        .forEach(control => {
          control.disabled = quickMode;
        });

      if (pricingRuleToggle) {
        pricingRuleToggle.disabled = quickMode || addHedgeDealPricingRuleOptions().length === 0;
      }

      addHedgeDealPricingRulePicker
        .querySelector(".client-deal-pricing-rule-select")
        ?.classList.toggle("is-disabled", quickMode);
    }

    async function createQuickHedgeDeal(ourSide, presetCode) {
      const normalizedOurSide = String(ourSide || "").trim().toUpperCase();
      const positionManagementMode = normalizedPositionManagementMode(
        activeFxPositionMode
      );
      const setting = hedgeQuickModeSettingForPair();
      const normalizedPresetCode = String(presetCode || "").trim().toUpperCase();
      const preset = setting?.presets.find(
        candidate => candidate.presetCode === normalizedPresetCode
      );

      if (!["BUY", "SELL"].includes(normalizedOurSide)
        || !setting?.active
        || !setting.available
        || !preset) {
        setBatchStatus(
          `Quick Mode is not available for ${activeCurrencyPairOrDefault()}.`,
          "warning"
        );
        return;
      }

      if (hedgeQuickModeDealCreating) {
        return;
      }

      hedgeQuickModeDealCreating = true;
      renderHedgeQuickModeToolbar();
      setBatchStatus(
        `Creating ${normalizedOurSide} ${setting.baseCcyCode} ${preset.label} Hedge Deal...`
      );

      try {
        const created = await demoApiRequest("/api/v1/hedge-fx-deals/quick-mode", {
          method: "POST",
          body: JSON.stringify({
            ccyPairCode: setting.ccyPairCode,
            side: oppositeFxSide(normalizedOurSide),
            presetCode: preset.presetCode,
            positionManagementMode
          })
        });

        await refreshHedgeDealViewsFromApi();
        selectedCurrencyPair = normalizedPricingRuleCurrencyPair(created.currencyPair);
        saveSelectedCurrencyPair();
        render(fxPositions);
        setBatchStatus(
          `Hedge FX Deal ${created.tradeId} was created successfully in Quick Mode.`,
          "success"
        );
      } catch (error) {
        setBatchStatus(
          error.message || "Unable to create the Quick Mode Hedge FX Deal.",
          "error"
        );
      } finally {
        hedgeQuickModeDealCreating = false;
        renderHedgeQuickModeToolbar();
      }
    }

    function openAddHedgeDealDialog(
      ourSide = "",
      pricingMode = "DEALER_PRICED",
      quickModeSelection = null
    ) {
      const normalizedOurSide = String(ourSide || "").toUpperCase();
      const normalizedPricingMode = String(pricingMode || "").toUpperCase();
      const isQuickMode = Boolean(quickModeSelection);
      const validOurSide = ["BUY", "SELL"].includes(normalizedOurSide);

      if (!HEDGE_DEAL_PRICING_MODES.includes(normalizedPricingMode)
        || (normalizedOurSide && !validOurSide)
        || (normalizedPricingMode === "AUTO_PRICED" && !validOurSide)
        || (isQuickMode && normalizedPricingMode !== "AUTO_PRICED")) {
        return;
      }

      addHedgeDealQuickModeSelection = isQuickMode ? quickModeSelection : null;
      addHedgeDealPositionManagementMode = normalizedPositionManagementMode(
        activeFxPositionMode
      );
      addHedgeDealPricingModeLocked = isQuickMode;
      addHedgeDealSideLocked = validOurSide;
      addHedgeDealDialogTitle.textContent = isQuickMode
        ? "Add Hedge Deal - Quick Mode"
        : "Add Hedge Deal";
      addHedgeDealForm.reset();
      addHedgeDealPricingModeControl.value = normalizedPricingMode;
      renderAddHedgeDealCurrencyPairs(
        isQuickMode
          ? quickModeSelection.setting.currencyPair
          : activeCurrencyPairOrDefault()
      );
      if (isQuickMode) {
        addHedgeDealForm.elements.currencyPair.value =
          quickModeSelection.setting.currencyPair;
      }
      addHedgeDealForm.elements.side.value = oppositeFxSide(normalizedOurSide);
      addHedgeDealForm.elements.tenor.value = isQuickMode
        ? quickModeSelection.setting.defaultTenor
        : "TOD";
      addHedgeDealCounterpartyPickerExpanded = false;
      addHedgeDealPricingRulesExpanded = false;
      addHedgeDealCounterpartyPicker.classList.remove("is-invalid");
      addHedgeDealPricingRulePicker.classList.remove("is-invalid");
      renderAddHedgeDealCounterparties(
        isQuickMode ? quickModeSelection.setting.counterpartyId : ""
      );
      if (isQuickMode) {
        addHedgeDealForm.elements.pricingRuleId.value =
          quickModeSelection.setting.pricingRuleId;
        addHedgeDealForm.elements.amountFixingCurrency.value = "base";
        addHedgeDealForm.elements.baseCcyAmount.value = groupedDecimalText(
          quickModeSelection.preset.baseCcyAmount
        );
      }
      renderAddHedgeDealPricingRules();
      syncAddHedgeDealDerivedFields();
      syncAddHedgeDealModeLocks();

      openDialogWithoutFieldFocus(addHedgeDealDialog);
    }

    function closeAddHedgeDealDialog() {
      if (typeof addHedgeDealDialog.close === "function") {
        addHedgeDealDialog.close();
      } else {
        addHedgeDealDialog.removeAttribute("open");
      }
    }

    async function createHedgeDeal(event) {
      event.preventDefault();
      syncAddHedgeDealDerivedFields();

      const counterparty = selectedAddHedgeDealCounterparty();
      const rule = selectedAddHedgeDealPricingRule();
      const side = addHedgeDealForm.elements.side.value;

      if (!["BUY", "SELL"].includes(side)) {
        addHedgeDealSideControl.focus();
        return;
      }

      addHedgeDealCounterpartyPicker.classList.toggle("is-invalid", !counterparty);

      if (!counterparty) {
        addHedgeDealCounterpartyPickerValue.focus();
        return;
      }

      if (!rule) {
        addHedgeDealPricingRulePicker.classList.add("is-invalid");
        renderAddHedgeDealPricingRules();
        addHedgeDealPricingRulePicker
          .querySelector("[data-add-hedge-deal-pricing-rule-toggle]")
          ?.focus();
        return;
      }

      if (!addHedgeDealForm.reportValidity()) {
        return;
      }

      const fixing = addHedgeDealForm.elements.amountFixingCurrency.value === "quote"
        ? "quote"
        : "base";
      const dealtInput = fixing === "quote"
        ? addHedgeDealForm.elements.quoteCcyAmount
        : addHedgeDealForm.elements.baseCcyAmount;
      const dealtCcyAmount = parsePositiveDecimalInput(dealtInput, "Dealt Ccy Amount");
      const tradeRate = parsePositiveDecimalInput(
        addHedgeDealForm.elements.tradeRate,
        "Trade Rate"
      );
      const amounts = addHedgeDealExactAmounts();

      if (dealtCcyAmount === null || tradeRate === null || !amounts) {
        return;
      }

      const autoPriced = selectedAddHedgeDealPricingMode() === "AUTO_PRICED";
      const quickModeSelection = addHedgeDealQuickModeSelection;
      addHedgeDealSubmitButton.disabled = true;

      try {
        let requestBody;
        let endpoint;

        if (quickModeSelection) {
          requestBody = {
            ccyPairCode: quickModeSelection.setting.ccyPairCode,
            side: addHedgeDealForm.elements.side.value,
            presetCode: quickModeSelection.preset.presetCode,
            tenor: addHedgeDealForm.elements.tenor.value,
            positionManagementMode: addHedgeDealPositionManagementMode
          };
          endpoint = "/api/v1/hedge-fx-deals/quick-mode";
        } else {
          const currencies = currenciesFromPair(rule.ccyPairCode.replace("_", "/"));
          requestBody = {
            pricingRuleId: Number(rule.pricingRuleId),
            ccyPairCode: rule.ccyPairCode,
            side: addHedgeDealForm.elements.side.value,
            dealtCcyCode: fixing === "quote" ? currencies.quote : currencies.base,
            dealtCcyAmount,
            tenor: addHedgeDealForm.elements.tenor.value,
            positionManagementMode: addHedgeDealPositionManagementMode
          };

          if (!autoPriced) {
            requestBody.tradeRate = tradeRate;
          }

          endpoint = autoPriced
            ? "/api/v1/hedge-fx-deals/auto-priced"
            : "/api/v1/hedge-fx-deals";
        }

        const created = await demoApiRequest(endpoint, {
          method: "POST",
          body: JSON.stringify(requestBody)
        });

        await refreshHedgeDealViewsFromApi();
        selectedCurrencyPair = normalizedPricingRuleCurrencyPair(created.currencyPair);
        saveSelectedCurrencyPair();
        closeAddHedgeDealDialog();
        render(fxPositions);
        setBatchStatus(
          `Hedge FX Deal ${created.tradeId} was created successfully.`,
          "success"
        );
      } catch (error) {
        setBatchStatus(error.message || "Unable to create the Hedge FX Deal.", "error");
      } finally {
        addHedgeDealSubmitButton.disabled = false;
      }
    }
