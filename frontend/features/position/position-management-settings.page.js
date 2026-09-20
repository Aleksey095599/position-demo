    let positionManagementQuickHedgeSettingsLoaded = false;
    let activeAutoManagementAdmissionTradeType = "CLIENT_DEAL";
    let autoManagementAdmissionViewVersion = 0;
    const initialClientAutoManagementAdmissionPolicy = autoManagementAdmissionPolicy;
    const autoManagementAdmissionPolicyStates = new Map();
    const AUTO_MODE_ELIGIBILITY_TRADE_TYPE_PRESENTATION = Object.freeze({
      CLIENT_DEAL: Object.freeze({ label: "Client Deal", icon: "handshake", evaluated: true }),
      HEDGE_DEAL: Object.freeze({ label: "Hedge Deal", icon: "shield", evaluated: true }),
      BATCH_POSITION_OUT: Object.freeze({ label: "Batch Position Out", icon: "output", evaluated: false })
    });

    function autoManagementAdmissionStateFor(tradeType) {
      const type = AUTO_MODE_ELIGIBILITY_TRADE_TYPES.includes(tradeType)
        ? tradeType
        : "CLIENT_DEAL";
      if (!autoManagementAdmissionPolicyStates.has(type)) {
        autoManagementAdmissionPolicyStates.set(type, {
          policy: type === "CLIENT_DEAL"
            ? initialClientAutoManagementAdmissionPolicy
            : normalizedAutoManagementAdmissionPolicy({ tradeType: type }),
          loaded: false,
          loading: false,
          saving: false,
          requestVersion: 0
        });
      }
      return autoManagementAdmissionPolicyStates.get(type);
    }

    function syncActiveAutoManagementAdmissionPolicy() {
      const state = autoManagementAdmissionStateFor(activeAutoManagementAdmissionTradeType);
      autoManagementAdmissionPolicy = state.policy;
      autoManagementAdmissionPolicyLoaded = state.loaded;
      autoManagementAdmissionPolicySaving = state.saving;
    }

    function setAutoManagementAdmissionPolicyStatus(message = "", tone = "", tradeType = activeAutoManagementAdmissionTradeType) {
      const status = document.querySelector(
        '[data-auto-management-policy-status="' + tradeType + '"]'
      );
      if (status) {
        setWorkbenchPageStatus(status, message, tone);
      }
    }

    function setAutoManagementAdmissionCriteriaStatus(message = "", tone = "") {
      setWorkbenchPageStatus(autoManagementAdmissionCriteriaStatus, message, tone);
    }

    function renderPositionManagementSettingsNavigation(section) {
      const items = positionManagementSettingsNavigationItems(section);
      const titleParts = items.map(item => item.label);
      document.title = titleParts.join(" / ");
      const canonicalHash = positionManagementSettingsRoute(section);
      if (location.hash !== canonicalHash) {
        window.history.replaceState(window.history.state, "", canonicalHash);
      }
      renderWorkspacePageHeading();
    }

    function setPositionManagementSettingsSection(sectionName) {
      const normalizedSection = ["quick", "eligibility", "initial"].includes(sectionName)
        ? sectionName
        : "eligibility";

      positionManagementSettingsSectionLinks.forEach(link => {
        const active = link.dataset.positionManagementSettingsSection === normalizedSection;
        link.classList.toggle("is-active", active);
        if (link.getAttribute("role") === "tab") {
          link.setAttribute("aria-selected", String(active));
          link.tabIndex = active ? 0 : -1;
        }
        if (active) {
          link.setAttribute("aria-current", "page");
        } else {
          link.removeAttribute("aria-current");
        }
      });
      positionManagementSettingsSectionPanels.forEach(panel => {
        panel.hidden = panel.dataset.positionManagementSettingsSectionPanel !== normalizedSection;
      });
      hedgeQuickModeSettingsStatus.hidden = normalizedSection !== "quick";
      if (normalizedSection === "quick" && hedgeQuickModeSettingsGridReady) {
        requestAnimationFrame(() => hedgeQuickModeSettingsGrid.redraw(true));
      }
    }

    function setAutoManagementAdmissionPolicyBusy(busy) {
      const isBusy = busy === true;
      const filtersDisabled = isBusy || Boolean(autoManagementAdmissionEditingPairCode);
      autoManagementAdmissionCriteriaForm.setAttribute("aria-busy", String(isBusy));
      if (autoManagementAdmissionCriteriaSave) autoManagementAdmissionCriteriaSave.disabled = true;
      autoManagementAdmissionTradeTypeFilter.disabled = filtersDisabled;
      autoManagementAdmissionPairSearch.disabled = filtersDisabled;
      autoManagementAdmissionPairFilter.disabled = filtersDisabled;
      autoManagementAdmissionPairRows
        .querySelectorAll("[data-auto-management-admission-pair-enabled]")
        .forEach(control => {
          control.disabled = isBusy
            || !autoManagementAdmissionPolicyLoaded
            || !autoManagementAdmissionEditingPairCode;
        });
      autoManagementAdmissionPairRows
        .querySelectorAll("[data-auto-management-admission-pair-limit]")
        .forEach(control => {
          const row = control.closest("[data-auto-management-admission-pair-code]");
          const enabledControl = row?.querySelector(
            "[data-auto-management-admission-pair-enabled]"
          );
          control.disabled = isBusy
            || !autoManagementAdmissionPolicyLoaded
            || !autoManagementAdmissionEditingPairCode
            || !enabledControl?.checked;
        });
      autoManagementAdmissionPairRows
        .querySelectorAll("[data-auto-management-admission-deviation]")
        .forEach(control => {
          const row = control.closest("[data-auto-management-admission-pair-code]");
          const enabledControl = row?.querySelector(
            "[data-auto-management-admission-pair-enabled]"
          );
          control.disabled = isBusy
            || !autoManagementAdmissionPolicyLoaded
            || !autoManagementAdmissionEditingPairCode
            || !enabledControl?.checked;
        });

      autoManagementAdmissionPairRows.querySelectorAll('[data-admission-action]').forEach(button => {
        button.disabled = isBusy || !autoManagementAdmissionPolicyLoaded
          || (button.dataset.admissionAction === 'edit' && Boolean(autoManagementAdmissionEditingPairCode));
      });
      if (!isBusy && autoManagementAdmissionPolicyLoaded) {
        updateAutoManagementAdmissionCriteriaSaveAvailability();
      }
    }

    function autoModeEligibilityTradeTypePresentation(tradeType) {
      return AUTO_MODE_ELIGIBILITY_TRADE_TYPE_PRESENTATION[tradeType]
        || AUTO_MODE_ELIGIBILITY_TRADE_TYPE_PRESENTATION.CLIENT_DEAL;
    }

    function autoManagementAdmissionRuleGroups() {
      const groupsByPairCode = new Map();

      AUTO_MODE_ELIGIBILITY_TRADE_TYPES.forEach(tradeType => {
        const state = autoManagementAdmissionStateFor(tradeType);
        state.policy.currencyPairs.forEach(pair => {
          if (!groupsByPairCode.has(pair.ccyPairCode)) {
            groupsByPairCode.set(pair.ccyPairCode, {
              ccyPairCode: pair.ccyPairCode,
              currencyPair: pair.currencyPair,
              rules: []
            });
          }
          groupsByPairCode.get(pair.ccyPairCode).rules.push({ tradeType, pair });
        });
      });

      return Array.from(groupsByPairCode.values());
    }

    function autoManagementAdmissionRuleRows() {
      return autoManagementAdmissionRuleGroups().flatMap(group => group.rules);
    }

    function autoManagementAdmissionRuleMatchesFilters({ tradeType, pair }) {
      const tradeTypeFilter = String(autoManagementAdmissionTradeTypeFilter.value || "ALL")
        .trim()
        .toUpperCase();
      const pairQuery = String(autoManagementAdmissionPairSearch.value || "")
        .trim()
        .toUpperCase();
      const statusFilter = String(autoManagementAdmissionPairFilter.value || "ALL")
        .trim()
        .toUpperCase();
      const evaluated = autoModeEligibilityTradeTypePresentation(tradeType).evaluated;
      const editing = tradeType === autoManagementAdmissionEditingTradeType
        && pair.ccyPairCode === autoManagementAdmissionEditingPairCode;
      const matchesTradeType = tradeTypeFilter === "ALL" || tradeType === tradeTypeFilter;
      const matchesPair = !pairQuery
        || `${pair.currencyPair} ${pair.ccyPairCode}`.toUpperCase().includes(pairQuery);
      const matchesStatus = statusFilter === "ALL"
        || (statusFilter === "ENABLED" && evaluated && pair.enabled)
        || (statusFilter === "DISABLED" && evaluated && !pair.enabled)
        || (statusFilter === "NOT_EVALUATED" && !evaluated);

      return editing || (matchesTradeType && matchesPair && matchesStatus);
    }

    function filteredAutoManagementAdmissionRuleGroups() {
      return autoManagementAdmissionRuleGroups()
        .map(group => ({
          ...group,
          rules: group.rules.filter(autoManagementAdmissionRuleMatchesFilters)
        }))
        .filter(group => group.rules.length > 0);
    }

    function autoManagementAdmissionPairRowMarkup(
      pair,
      tradeType,
      { renderPairCell = true, pairRowspan = 1, groupEnd = true, tableEnd = false } = {}
    ) {
      const tradeTypePresentation = autoModeEligibilityTradeTypePresentation(tradeType);
      const evaluated = tradeTypePresentation.evaluated;
      const editing = evaluated
        && autoManagementAdmissionEditingTradeType === tradeType
        && autoManagementAdmissionEditingPairCode === pair.ccyPairCode;
      const controlSuffix = `${tradeType}_${pair.ccyPairCode}`.toLowerCase();
      const switchId = `autoManagementAdmissionEnabled_${controlSuffix}`;
      const limitId = `autoManagementAdmissionLimit_${controlSuffix}`;
      const deviationId = `autoManagementAdmissionDeviation_${controlSuffix}`;
      const amountValue = pair.maxBaseCcyAmount === null
        ? ""
        : groupedDecimalText(pair.maxBaseCcyAmount);
      const deviationValue = pair.maxTransferRateDeviationPercent === null
        ? ""
        : pair.maxTransferRateDeviationPercent;
      const eligibilityMarkup = !evaluated
        ? `<span class="app-status-token" aria-label="Auto Mode Eligibility is not evaluated">Not evaluated</span>`
        : editing
        ? `
            <div class="form-check form-switch auto-management-admission-pair-enabled">
              <input
                class="form-check-input"
                type="checkbox"
                role="switch"
                id="${escapeHtml(switchId)}"
                aria-label="${escapeHtml(pair.currencyPair)} eligible for Auto Mode"
                data-auto-management-admission-pair-enabled
                ${pair.enabled ? "checked" : ""}
                ${autoManagementAdmissionPolicyLoaded ? "" : "disabled"}
              >
            </div>
          `
        : `<span class="app-status-token${pair.enabled ? " is-active" : ""}" aria-label="Eligible for Auto Mode: ${pair.enabled ? "Yes" : "No"}">${pair.enabled ? "Yes" : "No"}</span>`;
      const amountMarkup = !evaluated
        ? `<span class="auto-management-admission-read-value">—</span>`
        : editing
        ? `
            <div class="input-group input-group-sm auto-management-admission-pair-limit">
              <label class="visually-hidden" for="${escapeHtml(limitId)}">Maximum Trade Amount for ${escapeHtml(pair.currencyPair)} in ${escapeHtml(pair.baseCcyCode)}</label>
              <input
                class="form-control text-end"
                type="text"
                id="${escapeHtml(limitId)}"
                value="${escapeHtml(amountValue)}"
                inputmode="decimal"
                aria-label="Maximum Trade Amount for ${escapeHtml(pair.currencyPair)} in ${escapeHtml(pair.baseCcyCode)}"
                data-auto-management-admission-pair-limit
                ${pair.enabled && autoManagementAdmissionPolicyLoaded ? "" : "disabled"}
              >
              <span class="input-group-text">${escapeHtml(pair.baseCcyCode)}</span>
            </div>
          `
        : `<span class="auto-management-admission-read-value">${amountValue ? `${escapeHtml(amountValue)} ${escapeHtml(pair.baseCcyCode)}` : "—"}</span>`;
      const deviationMarkup = !evaluated
        ? `<span class="auto-management-admission-read-value">—</span>`
        : editing
        ? `
            <div class="input-group input-group-sm auto-management-admission-deviation-limit">
              <label class="visually-hidden" for="${escapeHtml(deviationId)}">Maximum Transfer Rate Deviation for ${escapeHtml(pair.currencyPair)}</label>
              <input
                class="form-control text-end"
                type="text"
                id="${escapeHtml(deviationId)}"
                value="${escapeHtml(deviationValue)}"
                inputmode="decimal"
                aria-label="Maximum Transfer Rate Deviation for ${escapeHtml(pair.currencyPair)}"
                data-auto-management-admission-deviation
                required
                ${pair.enabled && autoManagementAdmissionPolicyLoaded ? "" : "disabled"}
              >
              <span class="input-group-text" aria-hidden="true">%</span>
            </div>
          `
        : `<span class="auto-management-admission-read-value">${deviationValue === "" ? "—" : `${escapeHtml(deviationValue)}%`}</span>`;
      const pairCellMarkup = renderPairCell
        ? `<td class="auto-mode-eligibility-pair-cell${tableEnd ? " is-table-end" : ""}" rowspan="${pairRowspan}">${escapeHtml(pair.currencyPair)}</td>`
        : "";

      return `
        <tr
          data-auto-management-admission-trade-type="${escapeHtml(tradeType)}"
          data-auto-management-admission-pair-code="${escapeHtml(pair.ccyPairCode)}"
          data-auto-management-admission-pair-is-enabled="${String(pair.enabled)}"
          data-auto-management-admission-evaluated="${String(evaluated)}"
          data-auto-management-admission-group-end="${String(groupEnd)}"
        >
          ${pairCellMarkup}
          <td>
            <span class="auto-mode-eligibility-trade-type">
              <span class="position-trade-type-chip" aria-hidden="true">
                <span class="button-icon position-trade-type-icon">${escapeHtml(tradeTypePresentation.icon)}</span>
              </span>
              <span>${escapeHtml(tradeTypePresentation.label)}</span>
            </span>
          </td>
          <td class="text-center" data-auto-management-admission-column="auto-mode-eligibility">
            ${eligibilityMarkup}
          </td>
          <td class="text-end" data-auto-management-admission-column="amount-limit">
            ${amountMarkup}
          </td>
          <td class="text-end" data-auto-management-admission-column="transfer-rate-deviation">
            ${deviationMarkup}
          </td>
          <td class="text-center" data-disable-overflow-tooltip>
            <div class="d-inline-flex gap-1 auto-management-admission-row-actions" data-disable-tooltips>
              ${!evaluated ? `<span class="auto-management-admission-read-value" aria-label="No actions available">—</span>` : editing ? `
                <button type="submit" class="btn btn-sm btn-primary reference-grid-action" id="autoManagementAdmissionCriteriaSave" data-admission-action="save" aria-label="Save ${escapeHtml(pair.currencyPair)}"><span class="button-icon" aria-hidden="true">save</span></button>
                <button type="button" class="btn btn-sm btn-outline-secondary reference-grid-action" data-admission-action="cancel" aria-label="Cancel editing ${escapeHtml(pair.currencyPair)}"><span class="button-icon" aria-hidden="true">close</span></button>
              ` : `
                <button type="button" class="btn btn-sm btn-outline-secondary reference-grid-action" data-admission-action="edit" aria-label="Edit ${escapeHtml(pair.currencyPair)}"><span class="button-icon" aria-hidden="true">edit</span></button>
              `}
            </div>
          </td>
        </tr>
      `;
    }

    function cancelAutoManagementAdmissionCriteriaPage() {
      if (
        autoManagementAdmissionPolicySaving
        || !autoManagementAdmissionEditingPairCode
      ) {
        return;
      }

      autoManagementAdmissionEditingTradeType = null;
      autoManagementAdmissionEditingPairCode = null;
      renderAutoManagementAdmissionPolicy();
      setAutoManagementAdmissionCriteriaStatus();
    }

    function editAutoManagementAdmissionCriteriaPage(tradeType, ccyPairCode) {
      const state = autoManagementAdmissionStateFor(tradeType);
      if (
        !autoModeEligibilityTradeTypePresentation(tradeType).evaluated
        || state.saving
        || !state.loaded
        || autoManagementAdmissionEditingPairCode
        || !state.policy.currencyPairs.some(pair => pair.ccyPairCode === ccyPairCode)
      ) {
        return;
      }

      activeAutoManagementAdmissionTradeType = tradeType;
      syncActiveAutoManagementAdmissionPolicy();
      autoManagementAdmissionEditingTradeType = tradeType;
      autoManagementAdmissionEditingPairCode = ccyPairCode;
      renderAutoManagementAdmissionPolicy();
      setAutoManagementAdmissionCriteriaStatus();
    }

    function renderAutoManagementAdmissionPolicy() {
      const groups = filteredAutoManagementAdmissionRuleGroups();
      autoManagementAdmissionPairRows.innerHTML = groups
        .flatMap((group, groupIndex) => group.rules.map(({ pair, tradeType }, index) =>
          autoManagementAdmissionPairRowMarkup(pair, tradeType, {
            renderPairCell: index === 0,
            pairRowspan: group.rules.length,
            groupEnd: index === group.rules.length - 1,
            tableEnd: groupIndex === groups.length - 1
          })
        ))
        .join("");
      autoManagementAdmissionCriteriaSave = autoManagementAdmissionPairRows.querySelector("[data-admission-action=save]");
      autoManagementAdmissionPairEmpty.textContent =
        autoManagementAdmissionRuleRows().length === 0
          ? "No Auto Mode Eligibility Rules are available."
          : "No rules match the current filters.";
      autoManagementAdmissionPairEmpty.hidden = groups.length > 0;
      const busy = AUTO_MODE_ELIGIBILITY_TRADE_TYPES.some(tradeType => {
        const state = autoManagementAdmissionStateFor(tradeType);
        return state.loading || state.saving;
      });
      setAutoManagementAdmissionPolicyBusy(busy);
      updateAutoManagementAdmissionCriteriaSaveAvailability();
    }

    function decimalFractionDigitCount(value) {
      const decimal = String(value || "").split(".")[1] || "";
      return decimal.length;
    }

    function autoManagementAdmissionPolicyDraft() {
      let policyValid = true;
      const currencyPairs = autoManagementAdmissionPolicy.currencyPairs.map(pair => {
        if (pair.ccyPairCode !== autoManagementAdmissionEditingPairCode) {
          return {
            ccyPairCode: pair.ccyPairCode,
            enabled: pair.enabled,
            maxBaseCcyAmount: pair.maxBaseCcyAmount,
            maxTransferRateDeviationPercent: pair.maxTransferRateDeviationPercent
          };
        }
        const row = autoManagementAdmissionPairRows.querySelector(
          `[data-auto-management-admission-trade-type="${activeAutoManagementAdmissionTradeType}"]`
          + `[data-auto-management-admission-pair-code="${pair.ccyPairCode}"]`
        );
        const enabled = row?.querySelector(
          "[data-auto-management-admission-pair-enabled]"
        )?.checked === true;
        const amountInput = row?.querySelector(
          "[data-auto-management-admission-pair-limit]"
        );
        const deviationInput = row?.querySelector(
          "[data-auto-management-admission-deviation]"
        );
        const parsedMaxBaseCcyAmount = positiveDecimalInputText(amountInput?.value);
        const maxBaseCcyAmount = enabled ? parsedMaxBaseCcyAmount : null;
        const validAmount = !enabled || (
          parsedMaxBaseCcyAmount !== null
          && decimalFractionDigitCount(parsedMaxBaseCcyAmount)
            <= pair.baseCcyFractionDigits
        );
        const deviation = normalizedDecimalInputText(deviationInput?.value);
        let validDeviation = !enabled;
        try {
          validDeviation = !enabled || (deviation !== null
            && new Big(deviation).gte(0)
            && new Big(deviation).lte(100));
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
          maxTransferRateDeviationPercent: enabled ? deviation : null
        };
      });

      if (!policyValid) {
        return null;
      }

      return {
        tradeType: activeAutoManagementAdmissionTradeType,
        currencyPairs
      };
    }

    function sameAutoManagementAdmissionPolicyDraft(draft) {
      if (!draft) {
        return false;
      }

      return draft.currencyPairs.every((draftPair, index) => {
        const savedPair = autoManagementAdmissionPolicy.currencyPairs[index];

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

    function updateAutoManagementAdmissionCriteriaSaveAvailability() {
      if (!autoManagementAdmissionCriteriaSave) return;
      if (
        autoManagementAdmissionPolicySaving
        || !autoManagementAdmissionPolicyLoaded
        || !autoManagementAdmissionEditingPairCode
      ) {
        setSaveButtonAvailability(
          autoManagementAdmissionCriteriaSave,
          false,
          autoManagementAdmissionPolicySaving
            ? "Saving Policy"
            : autoManagementAdmissionPolicyLoaded
              ? "Select Edit to change Admission Criteria"
              : "Policy is not loaded"
        );
        return;
      }

      const draft = autoManagementAdmissionPolicyDraft();
      const canSave = Boolean(draft)
        && !sameAutoManagementAdmissionPolicyDraft(draft);
      const unavailableReason = draft
        ? "No changes to save"
        : "Enter valid Ccy Pair admission criteria";
      setSaveButtonAvailability(
        autoManagementAdmissionCriteriaSave,
        canSave,
        unavailableReason
      );
    }

    function syncAutoManagementAdmissionPairControl(row) {
      const enabledControl = row?.querySelector(
        "[data-auto-management-admission-pair-enabled]"
      );
      const limitControl = row?.querySelector(
        "[data-auto-management-admission-pair-limit]"
      );
      const deviationControl = row?.querySelector(
        "[data-auto-management-admission-deviation]"
      );

      if (!enabledControl || !limitControl || !deviationControl) {
        return;
      }

      const requirementsDisabled = autoManagementAdmissionPolicySaving
        || !autoManagementAdmissionPolicyLoaded
        || !autoManagementAdmissionEditingPairCode
        || !enabledControl.checked;
      limitControl.disabled = requirementsDisabled;
      deviationControl.disabled = requirementsDisabled;
      if (!enabledControl.checked) {
        limitControl.setCustomValidity("");
        deviationControl.setCustomValidity("");
      }
      updateAutoManagementAdmissionCriteriaSaveAvailability();
    }

    async function loadAutoManagementAdmissionRuleMatrix() {
      const requestVersion = ++autoManagementAdmissionViewVersion;
      AUTO_MODE_ELIGIBILITY_TRADE_TYPES.forEach(tradeType => {
        const state = autoManagementAdmissionStateFor(tradeType);
        state.loading = true;
        state.loaded = false;
      });
      renderAutoManagementAdmissionPolicy();
      setAutoManagementAdmissionCriteriaStatus("Loading Auto Mode Eligibility Rules...");

      try {
        if (!DEMO_API_ENABLED) {
          throw new Error("SQLite API is unavailable. Start the demo to configure the rules.");
        }
        const response = await demoApiRequest(
          "/api/v1/auto-mode-eligibility-rules?scope=all"
        );
        if (!Array.isArray(response?.ruleSets)) {
          throw new Error("Auto Mode Eligibility Rules response is invalid.");
        }
        const ruleSets = new Map(
          response.ruleSets.map(ruleSet => {
            const normalized = normalizedAutoManagementAdmissionPolicy(ruleSet);
            return [normalized.tradeType, normalized];
          })
        );
        AUTO_MODE_ELIGIBILITY_TRADE_TYPES.forEach(tradeType => {
          const state = autoManagementAdmissionStateFor(tradeType);
          const policy = ruleSets.get(tradeType);
          if (!policy) {
            throw new Error(`Auto Mode Eligibility Rules are missing for ${tradeType}.`);
          }
          state.policy = policy;
          state.loaded = true;
        });
        syncActiveAutoManagementAdmissionPolicy();
        setAutoManagementAdmissionCriteriaStatus();
      } catch (error) {
        setAutoManagementAdmissionCriteriaStatus(
          error.message || "Unable to load Auto Mode Eligibility Rules.",
          "error"
        );
      } finally {
        AUTO_MODE_ELIGIBILITY_TRADE_TYPES.forEach(tradeType => {
          autoManagementAdmissionStateFor(tradeType).loading = false;
        });
        if (requestVersion === autoManagementAdmissionViewVersion) {
          renderAutoManagementAdmissionPolicy();
        }
      }
    }

    async function loadAutoManagementAdmissionCriteriaPage({ reload = true } = {}) {
      ensureAutoManagementAdmissionPolicyEventBindings();
      if (reload) {
        autoManagementAdmissionTradeTypeFilter.value = "ALL";
        autoManagementAdmissionPairSearch.value = "";
        autoManagementAdmissionPairFilter.value = "ALL";
      }
      const matrixLoaded = AUTO_MODE_ELIGIBILITY_TRADE_TYPES.every(
        tradeType => autoManagementAdmissionStateFor(tradeType).loaded
      );
      if (reload || !matrixLoaded) {
        await loadAutoManagementAdmissionRuleMatrix();
      } else {
        renderAutoManagementAdmissionPolicy();
      }
    }

    async function persistAutoManagementAdmissionPolicy(draft) {
      const tradeType = draft.tradeType;
      const state = autoManagementAdmissionStateFor(tradeType);
      if (state.saving || !state.loaded || tradeType !== activeAutoManagementAdmissionTradeType) {
        return false;
      }
      state.saving = true;
      state.requestVersion += 1;
      state.loading = false;
      syncActiveAutoManagementAdmissionPolicy();
      setAutoManagementAdmissionPolicyBusy(true);
      setAutoManagementAdmissionPolicyStatus("Saving Admission Criteria...", "", tradeType);
      setAutoManagementAdmissionCriteriaStatus("Saving changes...");
      try {
        const response = await demoApiRequest(
          "/api/v1/auto-mode-eligibility-rules",
          {
            method: "PUT",
            body: JSON.stringify(draft)
          }
        );
        if (response.tradeType !== tradeType) {
          throw new Error("Admission Policy response does not match the saved trade type.");
        }
        state.policy = normalizedAutoManagementAdmissionPolicy(response);
        state.loaded = true;
        setAutoManagementAdmissionPolicyStatus("Admission Criteria saved.", "success", tradeType);
        if (activeAutoManagementAdmissionTradeType === tradeType) {
          syncActiveAutoManagementAdmissionPolicy();
          renderAutoManagementAdmissionPolicy();
          setAutoManagementAdmissionCriteriaStatus("Admission Criteria saved.", "success");
        }
        return true;
      } catch (error) {
        const message = error.message || "Unable to save Admission Criteria.";
        setAutoManagementAdmissionPolicyStatus(message, "error", tradeType);
        if (activeAutoManagementAdmissionTradeType === tradeType) {
          setAutoManagementAdmissionCriteriaStatus(message, "error");
        }
        return false;
      } finally {
        state.saving = false;
        if (activeAutoManagementAdmissionTradeType === tradeType) {
          syncActiveAutoManagementAdmissionPolicy();
          setAutoManagementAdmissionPolicyBusy(false);
          updateAutoManagementAdmissionCriteriaSaveAvailability();
        }
      }
    }

    async function saveAutoManagementAdmissionCriteriaPage() {
      if (!autoManagementAdmissionEditingPairCode || autoManagementAdmissionPolicySaving) return;
      const draft = autoManagementAdmissionPolicyDraft();
      const invalidControl = autoManagementAdmissionPairRows.querySelector(":invalid");

      if (!draft || invalidControl) {
        if (invalidControl) {
          autoManagementAdmissionPairSearch.value = "";
          autoManagementAdmissionPairFilter.value = "ALL";
          invalidControl.focus();
          invalidControl.reportValidity();
        } else {
          setAutoManagementAdmissionCriteriaStatus(
            "Enter valid Ccy Pair admission criteria.",
            "error"
          );
        }
        updateAutoManagementAdmissionCriteriaSaveAvailability();
        return;
      }

      if (sameAutoManagementAdmissionPolicyDraft(draft)) {
        return;
      }

      const viewVersion = autoManagementAdmissionViewVersion;
      if (await persistAutoManagementAdmissionPolicy(draft)
        && viewVersion === autoManagementAdmissionViewVersion) {
        autoManagementAdmissionEditingTradeType = null;
        autoManagementAdmissionEditingPairCode = null;
        renderAutoManagementAdmissionPolicy();
      }
    }

    function ensureAutoManagementAdmissionPolicyEventBindings() {
      if (autoManagementAdmissionPolicyEventsBound) {
        return;
      }

      autoManagementAdmissionPolicyEventsBound = true;
      autoManagementAdmissionPairRows.addEventListener('click', event => {
        const button = event.target.closest('[data-admission-action]');
        if (!button || button.disabled) return;
        if (button.dataset.admissionAction === 'edit') {
          const row = button.closest('[data-auto-management-admission-pair-code]');
          editAutoManagementAdmissionCriteriaPage(
            row.dataset.autoManagementAdmissionTradeType,
            row.dataset.autoManagementAdmissionPairCode
          );
        } else if (button.dataset.admissionAction === 'cancel') {
          cancelAutoManagementAdmissionCriteriaPage();
        }
      });
      autoManagementAdmissionCriteriaForm.addEventListener("submit", event => {
        event.preventDefault();
        saveAutoManagementAdmissionCriteriaPage();
      });
      autoManagementAdmissionPairRows.addEventListener("change", event => {
        if (!event.target.matches("[data-auto-management-admission-pair-enabled]")) {
          return;
        }
        syncAutoManagementAdmissionPairControl(
          event.target.closest("[data-auto-management-admission-pair-code]")
        );
      });
      autoManagementAdmissionPairRows.addEventListener("input", event => {
        if (event.target.matches(
          "[data-auto-management-admission-pair-limit], "
          + "[data-auto-management-admission-deviation]"
        )) {
          updateAutoManagementAdmissionCriteriaSaveAvailability();
        }
      });
      autoManagementAdmissionPairSearch.addEventListener(
        "input",
        renderAutoManagementAdmissionPolicy
      );
      autoManagementAdmissionPairSearch.addEventListener("keydown", event => {
        if (event.key === "Enter") {
          event.preventDefault();
        }
      });
      autoManagementAdmissionPairFilter.addEventListener(
        "change",
        renderAutoManagementAdmissionPolicy
      );
      autoManagementAdmissionTradeTypeFilter.addEventListener(
        "change",
        renderAutoManagementAdmissionPolicy
      );
    }

    async function loadPositionManagementSettingsPage({ reload = true } = {}) {
      const section = positionManagementSettingsSectionFromLocation();
      setPositionManagementSettingsSection(section);
      renderPositionManagementSettingsNavigation(section);
      ensureAutoManagementAdmissionPolicyEventBindings();
      if (section === "eligibility") {
        await loadAutoManagementAdmissionCriteriaPage({ reload });
        return;
      }
      autoManagementAdmissionViewVersion += 1;
      if (section !== "quick" || (!reload && positionManagementQuickHedgeSettingsLoaded)) {
        return;
      }
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
        positionManagementQuickHedgeSettingsLoaded = true;
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
    }
