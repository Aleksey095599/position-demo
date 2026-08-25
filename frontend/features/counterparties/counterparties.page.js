    function defaultPricingRuleCurrencyPair() {
      const pairs = marketCurrencyPairValues();
      const activePair = activeCurrencyPairOrDefault();

      return pairs.includes(activePair) ? activePair : pairs[0] || activePair || "EUR/USD";
    }

    function availableClientPricingRuleCurrencyPairs(profile, pricingContextIdValue) {
      const configuredPairs = new Set(
        clientPricingRulesForInn(profile?.inn)
          .filter(rule => String(rule.pricingContextId) === String(pricingContextIdValue))
          .map(rule => rule.currencyPair)
      );

      return marketCurrencyPairValues().filter(pair => !configuredPairs.has(pair));
    }

    function clientPricingRuleDraft(profile) {
      const currencyPair = defaultPricingRuleCurrencyPair();

      return {
        pricingRuleId: "",
        counterpartyId: profile?.counterpartyId ?? null,
        inn: profile?.inn || "",
        currencyPair,
        ccyPairCode: currencyPair.replace("/", "_"),
        pricingContextId: resolvedPricingRuleExecutionContextId("", profile?.inn || ""),
        marginPercent: 0
      };
    }

    function servicingBranchByCode(code) {
      const normalizedCode = String(code || "").trim();

      return servicingBranches.find(branch => branch.servicingBranchCode === normalizedCode) || null;
    }

    function servicingBranchDisplayName(code) {
      return servicingBranchByCode(code)?.servicingBranchName || String(code || "");
    }

    function settlementSystemById(id) {
      const normalizedId = String(id || "").trim().toUpperCase();

      return settlementSystems.find(system => system.settlementSystemId === normalizedId) || null;
    }

    function settlementSystemDisplayName(id) {
      return settlementSystemById(id)?.settlementSystemName || String(id || "");
    }

    function tradeCaptureChannelById(id) {
      const normalizedId = String(id || "").trim().toUpperCase();

      return tradeCaptureChannels.find(channel => channel.tradeCaptureChannelId === normalizedId) || null;
    }

    function tradeCaptureChannelDisplayName(id) {
      return tradeCaptureChannelById(id)?.tradeCaptureChannelName || String(id || "");
    }

    function pricingContextDisplayPath(contextOrId) {
      const context = typeof contextOrId === "object" && contextOrId
        ? contextOrId
        : pricingContextById(String(contextOrId || ""));

      if (!context) {
        return "Missing Execution Context";
      }

      return [
        servicingBranchDisplayName(context.servicingBranchCode),
        context.settlementSystemId === NOT_APPLICABLE_ACCOUNTING_SYSTEM_ID
          ? "Not applicable"
          : settlementSystemDisplayName(context.settlementSystemId),
        tradeCaptureChannelDisplayName(context.tradeCaptureChannelId)
      ].join(" | ");
    }

    function pricingContextFacetDefinition(field) {
      return PRICING_CONTEXT_FACETS.find(facet => facet.field === field) || null;
    }

    function pricingContextFacetInput(field) {
      const definition = pricingContextFacetDefinition(field);

      return definition ? clientPricingRuleForm.elements[definition.inputName] : null;
    }

    function pricingContextFacetDisplayName(field, value) {
      if (field === "servicingBranchCode") {
        return servicingBranchDisplayName(value);
      }

      if (field === "settlementSystemId") {
        return value === NOT_APPLICABLE_ACCOUNTING_SYSTEM_ID
          ? "Not applicable"
          : settlementSystemDisplayName(value);
      }

      return tradeCaptureChannelDisplayName(value);
    }

    function pricingContextFacetDisplayValue(field, value) {
      const code = String(value || "");

      return pricingContextFacetDisplayName(field, code) || code;
    }

    function pricingContextFacetReferenceItems(field) {
      const configuredItems = field === "servicingBranchCode"
        ? servicingBranches.map(branch => ({
            value: branch.servicingBranchCode,
            name: branch.servicingBranchName
          }))
        : field === "settlementSystemId"
          ? settlementSystems.map(system => ({
              value: system.settlementSystemId,
              name: system.settlementSystemName
            }))
          : tradeCaptureChannels.map(channel => ({
              value: channel.tradeCaptureChannelId,
              name: channel.tradeCaptureChannelName
            }));
      const seen = new Set(configuredItems.map(item => item.value));

      pricingContexts.forEach(context => {
        const value = context[field];

        if (value && !seen.has(value)) {
          configuredItems.push({ value, name: pricingContextFacetDisplayName(field, value) });
          seen.add(value);
        }
      });

      return configuredItems.sort((left, right) =>
        left.value.localeCompare(right.value, "en", { numeric: true, sensitivity: "base" })
      );
    }

    function pricingContextFacetSearchMatches(field, value, searchValue) {
      const tokens = String(searchValue || "")
        .trim()
        .toLocaleLowerCase()
        .split(/\s+/)
        .filter(Boolean);
      const searchable = [
        value,
        pricingContextFacetDisplayName(field, value)
      ].join(" ").toLocaleLowerCase();

      return tokens.length === 0 || tokens.every(token => searchable.includes(token));
    }

    function resolvedPricingContextFacetValue(field, inputValue) {
      const normalizedInput = String(inputValue || "").trim().toLocaleLowerCase();

      if (!normalizedInput) {
        return "";
      }

      const matches = pricingContextFacetReferenceItems(field).filter(item => {
        const values = [
          item.value,
          item.name,
          pricingContextFacetDisplayValue(field, item.value)
        ].map(value => String(value || "").trim().toLocaleLowerCase());

        return values.includes(normalizedInput);
      });

      return matches.length === 1 ? matches[0].value : "";
    }

    function matchingClientPricingRuleContexts(ignoredField = "") {
      return pricingContexts.filter(context => PRICING_CONTEXT_FACETS.every(({ field }) => {
        if (field === ignoredField) {
          return true;
        }

        const selectedValue = clientPricingContextBuilderState[field];

        if (selectedValue) {
          return context[field] === selectedValue;
        }

        const inputValue = pricingContextFacetInput(field)?.value || "";

        return pricingContextFacetSearchMatches(field, context[field], inputValue);
      }));
    }

    function syncClientPricingContextFacet(field, normalizeDisplay = false) {
      const input = pricingContextFacetInput(field);

      if (!input) {
        return;
      }

      const resolvedValue = resolvedPricingContextFacetValue(field, input.value);
      clientPricingContextBuilderState[field] = resolvedValue;
      clientPricingContextBuilderState.lastChangedFacet = field;

      if (normalizeDisplay && resolvedValue) {
        input.value = pricingContextFacetDisplayValue(field, resolvedValue);
      }
    }

    function pricingContextFacetMarkup(context, field) {
      const definition = pricingContextFacetDefinition(field);

      if (!context || !definition) {
        return "";
      }

      return `
        <span class="client-pricing-context-candidate-facet" data-pricing-context-candidate-facet="${escapeHtml(field)}">
          <span class="button-icon client-pricing-context-candidate-facet-icon" aria-hidden="true">${escapeHtml(definition.icon)}</span>
          <span class="client-pricing-context-candidate-name">${escapeHtml(pricingContextFacetDisplayName(field, context[field]))}</span>
        </span>
      `;
    }

    function pricingContextFacetsMarkup(contextOrId, options = {}) {
      const context = typeof contextOrId === "object" && contextOrId
        ? contextOrId
        : pricingContextById(String(contextOrId || ""));

      if (!context) {
        return escapeHtml(pricingContextDisplayPath(contextOrId));
      }

      return PRICING_CONTEXT_FACETS
        .map(({ field }) => {
          if (options.executionSystemLabel === true && field === "tradeCaptureChannelId") {
            const executionSystem = tradeCaptureChannelById(context[field]);

            return executionSystemLabelMarkup(
              pricingContextFacetDisplayName(field, context[field]),
              executionSystem?.pricingType
            );
          }

          return pricingContextFacetMarkup(context, field);
        })
        .join("");
    }

    function pricingContextCandidateMarkup(context) {
      return `
        <button type="button" class="client-pricing-context-candidate" data-pricing-context-candidate="${escapeHtml(context.pricingContextId)}">
          <span class="client-pricing-context-candidate-path">${pricingContextFacetsMarkup(context)}</span>
        </button>
      `;
    }

    function syncClientPricingContextMenuVisibility() {
      PRICING_CONTEXT_FACETS.forEach(({ field, menuId }) => {
        const isOpen = clientPricingContextOpenFacet === field;
        const input = pricingContextFacetInput(field);
        const menu = document.getElementById(menuId);
        const toggle = clientPricingRuleForm.querySelector(`[data-pricing-context-toggle="${field}"]`);

        if (menu) {
          menu.hidden = !isOpen;
        }

        input?.setAttribute("aria-expanded", String(isOpen));
        toggle?.setAttribute("aria-expanded", String(isOpen));
      });
    }

    function openClientPricingContextFacetMenu(field) {
      if (!pricingContextFacetDefinition(field)) {
        return;
      }

      clientPricingContextOpenFacet = field;
      renderClientPricingContextBuilder();
    }

    function closeClientPricingContextFacetMenus() {
      clientPricingContextOpenFacet = "";
      syncClientPricingContextMenuVisibility();
    }

    function selectClientPricingContextFacetOption(field, value) {
      const input = pricingContextFacetInput(field);

      if (!input || !pricingContextFacetReferenceItems(field).some(item => item.value === value)) {
        return;
      }

      input.value = pricingContextFacetDisplayValue(field, value);
      clientPricingContextBuilderState[field] = value;
      clientPricingContextBuilderState.lastChangedFacet = field;
      clientPricingContextOpenFacet = "";
      renderClientPricingContextBuilder();
      input.focus();
    }

    function renderClientPricingContextBuilder() {
      PRICING_CONTEXT_FACETS.forEach(({ field, menuId }) => {
        const input = pricingContextFacetInput(field);
        const menu = document.getElementById(menuId);
        const count = clientPricingRuleForm.querySelector(`[data-pricing-context-count="${field}"]`);
        const clearButton = clientPricingRuleForm.querySelector(`[data-pricing-context-clear="${field}"]`);
        const contextsForOtherFacets = matchingClientPricingRuleContexts(field);
        const options = pricingContextFacetReferenceItems(field)
          .map(item => ({
            ...item,
            matchCount: contextsForOtherFacets.filter(context => context[field] === item.value).length
          }))
          .sort((left, right) =>
            Number(right.matchCount > 0) - Number(left.matchCount > 0) ||
            right.matchCount - left.matchCount ||
            left.value.localeCompare(right.value, "en", { numeric: true, sensitivity: "base" })
          );
        const selectedDisplayValue = clientPricingContextBuilderState[field]
          ? pricingContextFacetDisplayValue(field, clientPricingContextBuilderState[field])
          : "";
        const menuSearchValue = input?.value === selectedDisplayValue ? "" : input?.value || "";
        const visibleOptions = options.filter(option =>
          pricingContextFacetSearchMatches(field, option.value, menuSearchValue)
        );

        if (menu) {
          menu.innerHTML = visibleOptions.length === 0
            ? `<span class="client-pricing-context-menu-empty">No matching values</span>`
            : visibleOptions.map(option => {
                const selected = clientPricingContextBuilderState[field] === option.value;
                const availabilityClass = option.matchCount === 0 ? " is-unavailable" : "";
                return `
                  <button type="button" class="client-pricing-context-option${availabilityClass}" data-pricing-context-option-field="${escapeHtml(field)}" data-pricing-context-option-value="${escapeHtml(option.value)}" role="option" aria-selected="${selected}">
                    <span class="client-pricing-context-option-value">${escapeHtml(pricingContextFacetDisplayValue(field, option.value))}</span>
                    <span class="client-pricing-context-option-count">${option.matchCount} ${option.matchCount === 1 ? "context" : "contexts"}</span>
                  </button>
                `;
              }).join("");
        }

        if (count) {
          const availableCount = options.filter(option => option.matchCount > 0).length;
          count.textContent = `${availableCount} available`;
        }

        if (clearButton && input) {
          clearButton.hidden = !input.value;
        }
      });
      syncClientPricingContextMenuVisibility();

      const matches = matchingClientPricingRuleContexts();
      const hasSearch = PRICING_CONTEXT_FACETS.some(({ field }) =>
        Boolean(pricingContextFacetInput(field)?.value.trim())
      );
      const allSearchValuesResolved = PRICING_CONTEXT_FACETS.every(({ field }) => {
        const inputValue = pricingContextFacetInput(field)?.value.trim() || "";
        return !inputValue || Boolean(clientPricingContextBuilderState[field]);
      });
      const allFacetsSelected = PRICING_CONTEXT_FACETS.every(({ field }) =>
        Boolean(clientPricingContextBuilderState[field])
      );
      const resolvedContext = matches.length === 1 && allSearchValuesResolved && allFacetsSelected
        ? matches[0]
        : null;
      const contextIdControl = clientPricingRuleForm.elements.pricingContextId;

      contextIdControl.value = resolvedContext?.pricingContextId || "";
      syncClientPricingRulePositionManagementModeControls();
      clientPricingContextResults.classList.toggle("is-selected", Boolean(resolvedContext));
      clientPricingContextResults.classList.toggle("is-error", hasSearch && matches.length === 0);
      clientPricingContextResults.classList.toggle(
        "is-warning",
        hasSearch && matches.length > 0 && !allSearchValuesResolved
      );

      if (pricingContexts.length === 0) {
        clientPricingContextCandidatesExpanded = false;
        clientPricingContextResults.classList.add("is-error");
        clientPricingContextResults.innerHTML = `
          <span class="client-pricing-context-result-title">Execution Context unavailable</span>
          No Execution Contexts have been configured.
        `;
        return;
      }

      if (resolvedContext) {
        clientPricingContextCandidatesExpanded = false;
        clientPricingContextResults.innerHTML = `
          <span class="client-pricing-context-resolved">
            <span class="button-icon" aria-hidden="true">check_circle</span>
            <span>Execution Context selected</span>
          </span>
        `;
        return;
      }

      if (matches.length === 0) {
        clientPricingContextCandidatesExpanded = false;
        const lastFacet = pricingContextFacetDefinition(clientPricingContextBuilderState.lastChangedFacet);
        const clearAction = lastFacet
          ? `
            <button type="button" class="client-pricing-context-result-action" data-pricing-context-clear="${escapeHtml(lastFacet.field)}">
              <span class="button-icon" aria-hidden="true">close</span>
              <span>Clear ${escapeHtml(lastFacet.label)}</span>
            </button>
          `
          : "";
        clientPricingContextResults.innerHTML = `
          <span class="client-pricing-context-result-title">No matching Execution Context</span>
          The selected components do not form an existing context.
          ${clearAction}
        `;
        return;
      }

      const resultTitle = hasSearch ? "Matching Execution Contexts" : "Available Execution Contexts";
      clientPricingContextResults.innerHTML = `
        <button type="button" class="client-pricing-context-results-toggle" data-pricing-context-results-toggle aria-expanded="${clientPricingContextCandidatesExpanded}">
          <span class="client-pricing-context-result-title">${resultTitle}</span>
          <span class="client-pricing-context-results-count">${matches.length} ${matches.length === 1 ? "context" : "contexts"}</span>
          <span class="button-icon client-pricing-context-results-icon" aria-hidden="true">${clientPricingContextCandidatesExpanded ? "expand_less" : "expand_more"}</span>
        </button>
        <div class="client-pricing-context-candidate-viewport"${clientPricingContextCandidatesExpanded ? "" : " hidden"}>
          <div class="client-pricing-context-candidates">
            ${matches.map(pricingContextCandidateMarkup).join("")}
          </div>
        </div>
      `;
    }

    function selectClientPricingContext(pricingContextIdValue) {
      const context = pricingContextById(pricingContextIdValue);

      if (!context) {
        return;
      }

      PRICING_CONTEXT_FACETS.forEach(({ field }) => {
        clientPricingContextBuilderState[field] = context[field];
        pricingContextFacetInput(field).value = pricingContextFacetDisplayValue(field, context[field]);
      });
      clientPricingContextBuilderState.lastChangedFacet = "";
      clientPricingContextOpenFacet = "";
      clientPricingContextCandidatesExpanded = false;
      renderClientPricingContextBuilder();
    }

    function clearClientPricingContextFacet(field) {
      const input = pricingContextFacetInput(field);

      if (!input) {
        return;
      }

      input.value = "";
      clientPricingContextBuilderState[field] = "";
      clientPricingContextBuilderState.lastChangedFacet = field;
      renderClientPricingContextBuilder();
      input.focus();
    }

    function resetClientPricingContextBuilder(pricingContextIdValue = "") {
      const context = pricingContextById(pricingContextIdValue);

      clientPricingContextBuilderState = {
        servicingBranchCode: context?.servicingBranchCode || "",
        settlementSystemId: context?.settlementSystemId || "",
        tradeCaptureChannelId: context?.tradeCaptureChannelId || "",
        lastChangedFacet: ""
      };
      clientPricingContextOpenFacet = "";
      clientPricingContextCandidatesExpanded = false;
      PRICING_CONTEXT_FACETS.forEach(({ field }) => {
        pricingContextFacetInput(field).value = context
          ? pricingContextFacetDisplayValue(field, context[field])
          : "";
      });
      renderClientPricingContextBuilder();
    }

    function renderClientPricingRuleOptions(currencyPairOverride = "", pricingContextIdOverride = "") {
      const currencyPairControl = clientPricingRuleForm.elements.currencyPair;
      const pricingContextControl = clientPricingRuleForm.elements.pricingContextId;
      const selectedCurrencyPair = currencyPairOverride || currencyPairControl.value;
      const selectedPricingContextId = pricingContextIdOverride;
      const profile = selectedClientProfile();
      const fixedContextCreate = clientPricingRuleEditState?.mode === "create"
        && Boolean(clientPricingRuleEditState.pricingContextId);
      const pairValues = fixedContextCreate
        ? availableClientPricingRuleCurrencyPairs(profile, selectedPricingContextId)
        : marketCurrencyPairValues();
      const optionPairValues = !fixedContextCreate && selectedCurrencyPair && !pairValues.includes(selectedCurrencyPair)
        ? [selectedCurrencyPair, ...pairValues]
        : pairValues;

      currencyPairControl.innerHTML = optionPairValues
        .map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`)
        .join("");
      currencyPairControl.value = selectedCurrencyPair && optionPairValues.includes(selectedCurrencyPair)
        ? selectedCurrencyPair
        : optionPairValues[0] || "";
      currencyPairControl.disabled = optionPairValues.length === 0;
      pricingContextControl.setCustomValidity("");
      resetClientPricingContextBuilder(selectedPricingContextId);
    }

    function clientPricingRuleDialogPositionManagementModeOverride() {
      const inheritControl = clientPricingRuleForm.elements.useExecutionContextDefault;
      const overrideControl = clientPricingRuleForm.elements.positionManagementModeOverride;

      return positionManagementModeOverrideFromControls(inheritControl, overrideControl);
    }

    function syncClientPricingRulePositionManagementModeControls() {
      const overrideControl = clientPricingRuleForm.elements.positionManagementModeOverride;

      if (!overrideControl) {
        return;
      }

      const editing = clientPricingRuleEditState?.mode === "edit";
      const savedRule = editing ? clientPricingRules[clientPricingRuleEditState.index] : null;
      const pricingContextIdValue = editing
        ? savedRule?.pricingContextId || ""
        : clientPricingRuleForm.elements.pricingContextId.value;
      const positionManagementModeOverride = clientPricingRuleDialogPositionManagementModeOverride();
      const inherited = positionManagementModeOverride === null;

      if (inherited) {
        overrideControl.value = effectivePositionManagementModeForRule({
          pricingContextId: pricingContextIdValue,
          positionManagementModeOverride: null
        });
      }

      overrideControl.disabled = inherited;
      return positionManagementModeOverride;
    }

    function clientPricingRuleDraftFromDialog() {
      const profile = selectedClientProfile();
      const editing = clientPricingRuleEditState?.mode === "edit";
      const savedRule = editing ? clientPricingRules[clientPricingRuleEditState.index] : null;
      const pricingContextIdValue = editing
        ? savedRule?.pricingContextId || ""
        : clientPricingRuleForm.elements.pricingContextId.value;
      const currencyPairValue = editing
        ? savedRule?.currencyPair || ""
        : clientPricingRuleForm.elements.currencyPair.value;
      const marginValue = normalizeNumber(clientPricingRuleForm.elements.marginPercent.value);
      const positionManagementModeOverride = clientPricingRuleDialogPositionManagementModeOverride();

      if (
        !profile ||
        !pricingContextById(pricingContextIdValue) ||
        !currencyPairValue ||
        positionManagementModeOverride === undefined ||
        marginValue === null ||
        marginValue < 0 ||
        marginValue >= 100
      ) {
        return null;
      }

      return {
        pricingRuleId: pricingRuleIdForEditState(clientPricingRuleEditState),
        counterpartyId: profile.counterpartyId,
        inn: profile.inn,
        currencyPair: currencyPairValue,
        ccyPairCode: currencyPairValue.replace("/", "_"),
        pricingContextId: pricingContextIdValue,
        positionManagementModeOverride,
        marginPercent: marginValue
      };
    }

    function clientPricingRuleDialogHasChanges(rule) {
      if (!rule || clientPricingRuleEditState?.mode !== "edit") {
        return Boolean(rule);
      }

      const savedRule = clientPricingRules[clientPricingRuleEditState.index];

      return !savedRule ||
        Math.abs(Number(rule.marginPercent) - Number(savedRule.marginPercent)) > 0.0000001 ||
        normalizedPositionManagementModeOverride(rule.positionManagementModeOverride) !==
          normalizedPositionManagementModeOverride(savedRule.positionManagementModeOverride);
    }

    function updateClientPricingRuleSubmitAvailability() {
      const rule = clientPricingRuleDraftFromDialog();
      const canSave = Boolean(rule) && clientPricingRuleDialogHasChanges(rule);

      clientPricingRuleSubmitButton.disabled = !canSave;
      clientPricingRuleSubmitButton.title = canSave
        ? ""
        : !rule
          ? "Complete the pricing rule before saving"
          : "No changes to save";
    }

    function clearClientPricingRuleDialogValidity() {
      Array.from(clientPricingRuleForm.elements).forEach(element => {
        if (typeof element.setCustomValidity === "function") {
          element.setCustomValidity("");
        }
      });
    }

    function fillClientPricingRuleDialog(rule) {
      clientPricingRuleForm.reset();
      clearClientPricingRuleDialogValidity();
      const editing = clientPricingRuleEditState?.mode === "edit";
      const fixedPricingContextId = editing
        ? rule.pricingContextId || ""
        : clientPricingRuleEditState?.pricingContextId || rule.pricingContextId || "";
      const contextFixed = Boolean(fixedPricingContextId);
      clientPricingRuleDialogTitle.textContent = editing
        ? "Edit Pricing Rule"
        : "Add Pricing Rule";
      clientPricingRuleDialog.classList.toggle("is-margin-only", editing);
      clientPricingRuleDialog.classList.toggle("is-context-fixed", contextFixed && !editing);
      clientPricingRuleContextSearchSection.hidden = contextFixed;
      clientPricingRuleFixedTermsSection.hidden = !contextFixed;
      clientPricingRuleFixedPairTerm.hidden = !editing;
      clientPricingRuleCurrencyPairField.hidden = editing;
      clientPricingRuleDeleteButton.hidden = !editing;
      clientPricingRuleDeleteButton.disabled = false;
      clientPricingRuleForm.elements.marginPercent.value = editNumber(rule.marginPercent ?? 0, 4);
      const positionManagementModeOverride = normalizedPositionManagementModeOverride(
        rule.positionManagementModeOverride
      );
      clientPricingRuleForm.elements.useExecutionContextDefault.checked =
        positionManagementModeOverride === null;
      const positionManagementModeOverrideControl =
        clientPricingRuleForm.elements.positionManagementModeOverride;
      positionManagementModeOverrideControl.value = positionManagementModeOverride ||
        effectivePositionManagementModeForRule({
          pricingContextId: fixedPricingContextId,
          positionManagementModeOverride: null
        });
      positionManagementModeOverrideControl.dataset.positionManagementModeInherited =
        String(positionManagementModeOverride === null);

      if (positionManagementModeOverride) {
        positionManagementModeOverrideControl.dataset.explicitPositionManagementMode =
          positionManagementModeOverride;
      } else {
        delete positionManagementModeOverrideControl.dataset.explicitPositionManagementMode;
      }
      renderClientPricingRuleOptions(
        rule.currencyPair || defaultPricingRuleCurrencyPair(),
        fixedPricingContextId
      );
      clientPricingRuleFixedPair.textContent = rule.currencyPair || "";
      clientPricingRuleFixedContext.innerHTML = pricingContextFacetsMarkup(fixedPricingContextId);
      syncClientPricingRulePositionManagementModeControls();
      updateClientPricingRuleSubmitAvailability();
    }

    function openClientPricingRuleDialog(rule) {
      fillClientPricingRuleDialog(rule);

      openDialogWithoutFieldFocus(clientPricingRuleDialog);
    }

    function closeClientPricingRuleDialog() {
      closeClientPricingContextFacetMenus();

      if (typeof clientPricingRuleDialog.close === "function") {
        clientPricingRuleDialog.close();
      } else {
        clientPricingRuleDialog.removeAttribute("open");
      }
    }

    function renderClientPricingRuleEditor(profile) {
      if (!clientPricingRuleEditor) {
        return;
      }

      clientPricingRuleEditor.hidden = true;
      clientPricingRuleEditor.innerHTML = "";
    }

    function clientPricingRuleInlineEditorMatches(
      profile,
      pricingContextIdValue,
      mode = "",
      index = null
    ) {
      const state = clientPricingRuleInlineEditorState;
      const matchesContext = Boolean(
        profile &&
        state &&
        state.inn === profile.inn &&
        String(state.pricingContextId) === String(pricingContextIdValue)
      );

      if (!matchesContext || (mode && state.mode !== mode)) {
        return false;
      }

      return mode !== "edit" || Number(state.index) === Number(index);
    }

    function clientPricingRuleInlinePositionManagementModeOverride(row) {
      const inheritControl = row?.querySelector(
        '[data-client-pricing-rule-inline-field="useExecutionContextDefault"]'
      );
      const overrideControl = row?.querySelector(
        '[data-client-pricing-rule-inline-field="positionManagementModeOverride"]'
      );

      return positionManagementModeOverrideFromControls(inheritControl, overrideControl);
    }

    function updateClientPricingRuleInlineEditorAvailability(row) {
      const saveButton = row?.querySelector('[data-client-pricing-rule-inline-action="save"]');
      const currencyPairControl = row?.querySelector('[data-client-pricing-rule-inline-field="currencyPair"]');
      const positionManagementModeInheritControl = row?.querySelector(
        '[data-client-pricing-rule-inline-field="useExecutionContextDefault"]'
      );
      const positionManagementModeOverrideControl = row?.querySelector(
        '[data-client-pricing-rule-inline-field="positionManagementModeOverride"]'
      );
      const marginControl = row?.querySelector('[data-client-pricing-rule-inline-field="marginPercent"]');
      const state = clientPricingRuleInlineEditorState;

      if (
        !saveButton ||
        !currencyPairControl ||
        !positionManagementModeInheritControl ||
        !positionManagementModeOverrideControl ||
        !marginControl ||
        !state
      ) {
        return;
      }

      state.currencyPair = currencyPairControl.value;
      state.positionManagementModeOverride = clientPricingRuleInlinePositionManagementModeOverride(row);
      const inherited = state.positionManagementModeOverride === null;

      if (inherited) {
        positionManagementModeOverrideControl.value = effectivePositionManagementModeForRule({
          pricingContextId: state.pricingContextId,
          positionManagementModeOverride: null
        });
      }

      positionManagementModeInheritControl.disabled = state.saving;
      positionManagementModeOverrideControl.disabled = state.saving || inherited;
      state.marginPercent = marginControl.value;
      const margin = normalizeNumber(marginControl.value);
      const savedRule = state.mode === "edit" ? clientPricingRules[state.index] : null;
      const changed = state.mode !== "edit" || !savedRule ||
        Math.abs(Number(savedRule.marginPercent) - Number(margin)) > 0.0000001 ||
        normalizedPositionManagementModeOverride(savedRule.positionManagementModeOverride) !==
          state.positionManagementModeOverride;
      const canSave = state.positionManagementModeOverride !== undefined &&
        Boolean(currencyPairControl.value) && margin !== null &&
        margin >= 0 && margin < 100 && changed;

      saveButton.disabled = state.saving || !canSave;
      saveButton.title = canSave
        ? ""
        : margin === null || margin < 0 || margin >= 100
          ? "Enter a margin from 0 up to, but not including, 100"
          : "No changes to save";
    }

    function clientPricingRuleFromInlineEditorRow(row) {
      const profile = selectedClientProfile();
      const state = clientPricingRuleInlineEditorState;
      const pricingContextIdValue = normalizedIntegerId(row?.dataset.clientPricingRuleInlineEditor);
      const currencyPairControl = row?.querySelector('[data-client-pricing-rule-inline-field="currencyPair"]');
      const positionManagementModeOverrideControl = row?.querySelector(
        '[data-client-pricing-rule-inline-field="positionManagementModeOverride"]'
      );
      const marginControl = row?.querySelector('[data-client-pricing-rule-inline-field="marginPercent"]');
      const context = assignedExecutionContextsForProfile(profile).find(item =>
        String(item.pricingContextId) === String(pricingContextIdValue)
      );
      const editing = state?.mode === "edit";
      const savedRule = editing ? clientPricingRules[state.index] : null;

      if (
        !profile ||
        !state ||
        !context ||
        !currencyPairControl ||
        !positionManagementModeOverrideControl ||
        !marginControl ||
        !clientPricingRuleInlineEditorMatches(profile, pricingContextIdValue) ||
        (editing && (
          !savedRule ||
          savedRule.inn !== profile.inn ||
          String(savedRule.pricingContextId) !== String(pricingContextIdValue)
        ))
      ) {
        return null;
      }

      const currencyPair = editing
        ? savedRule.currencyPair
        : normalizedPricingRuleCurrencyPair(currencyPairControl.value);
      const pairIsAvailable = editing
        ? currencyPair === normalizedPricingRuleCurrencyPair(currencyPairControl.value)
        : Boolean(currencyPair) && availableClientPricingRuleCurrencyPairs(
          profile,
          pricingContextIdValue
        ).includes(currencyPair);

      currencyPairControl.setCustomValidity(pairIsAvailable ? "" : "Select an available Ccy Pair.");

      if (!pairIsAvailable) {
        currencyPairControl.reportValidity();
        return null;
      }

      const marginPercent = parsePercentInput(marginControl, "Margin", 100);
      const positionManagementModeOverride = clientPricingRuleInlinePositionManagementModeOverride(row);

      if (positionManagementModeOverride === undefined) {
        positionManagementModeOverrideControl.reportValidity();
        return null;
      }

      if (marginPercent === null) {
        return null;
      }

      const rule = {
        pricingRuleId: savedRule?.pricingRuleId || nextPricingRuleId(),
        counterpartyId: profile.counterpartyId,
        inn: profile.inn,
        currencyPair,
        ccyPairCode: currencyPair.replace("/", "_"),
        pricingContextId: pricingContextIdValue,
        positionManagementModeOverride,
        marginPercent
      };
      const duplicateExists = !editing && clientPricingRules.some(item =>
        samePricingRuleIdentity(item, rule)
      );

      currencyPairControl.setCustomValidity(duplicateExists ? "Pricing Rule already exists." : "");

      if (duplicateExists) {
        currencyPairControl.reportValidity();
        return null;
      }

      return { rule, currentRule: savedRule, index: editing ? state.index : null };
    }

    async function saveClientPricingRuleInlineEditor() {
      const profile = selectedClientProfile();
      const state = clientPricingRuleInlineEditorState;
      const row = clientExecutionContextsPanel.querySelector(
        "[data-client-pricing-rule-inline-editor]"
      );

      if (
        !profile ||
        !state ||
        !row ||
        !clientPricingRuleInlineEditorMatches(profile, state.pricingContextId) ||
        state.saving
      ) {
        return;
      }

      const draft = clientPricingRuleFromInlineEditorRow(row);

      if (!draft) {
        return;
      }

      state.saving = true;
      row.querySelectorAll("input, select, button").forEach(control => {
        control.disabled = true;
      });

      try {
        const savedRule = await persistPricingRuleRecord(draft.rule, draft.currentRule);

        if (!savedRule) {
          throw new Error("Pricing Rule response is invalid.");
        }

        if (draft.currentRule) {
          clientPricingRules[draft.index] = savedRule;
        } else {
          clientPricingRules.push(savedRule);
        }
        saveClientPricingRules();
        clientPricingRuleInlineEditorState = null;
        setClientProfileStatus(
          completedActionMessage(
            `Pricing Rule ${savedRule.pricingRuleId}`,
            draft.currentRule ? "saved" : "added"
          ),
          "success"
        );
        renderClientPricingRulesPanel(profile);
        renderPricingRules();
      } catch (error) {
        state.saving = false;
        setClientProfileStatus(error.message || "Pricing Rule could not be saved.", "error");
        renderClientExecutionContextsPanel(profile);
      }
    }

    function cancelClientPricingRuleInlineEditor() {
      const profile = selectedClientProfile();
      const state = clientPricingRuleInlineEditorState;

      if (
        !state ||
        !clientPricingRuleInlineEditorMatches(profile, state.pricingContextId) ||
        state.saving
      ) {
        return;
      }

      clientPricingRuleInlineEditorState = null;
      renderClientExecutionContextsPanel(profile);
      requestAnimationFrame(() => {
        const focusSelector = state.mode === "edit"
          ? `[data-client-pricing-rule-action="edit"][data-client-pricing-rule-index="${state.index}"]`
          : `[data-client-execution-context-action="add-rule"][data-client-execution-context-id="${state.pricingContextId}"]`;
        clientExecutionContextsPanel.querySelector(focusSelector)?.focus();
      });
    }

    function startClientPricingRuleCreate(pricingContextIdValue = "") {
      const profile = selectedClientProfile();

      if (!profile) {
        setClientProfileStatus("Select a Trading Counterparty before adding Pricing Rules.", "error");
        return;
      }

      const context = assignedExecutionContextsForProfile(profile).find(item =>
        String(item.pricingContextId) === String(pricingContextIdValue)
      );

      if (!context) {
        setClientProfileStatus(
          "Attach an Execution Context before adding a Pricing Rule.",
          "error"
        );
        return;
      }

      const availableCurrencyPairs = availableClientPricingRuleCurrencyPairs(
        profile,
        context.pricingContextId
      );

      if (availableCurrencyPairs.length === 0) {
        setClientProfileStatus(
          "All available Ccy Pairs already have Pricing Rules for this Execution Context.",
          "error"
        );
        return;
      }

      clientPricingRuleInlineEditorState = {
        mode: "create",
        inn: profile.inn,
        counterpartyId: profile.counterpartyId,
        pricingContextId: context.pricingContextId,
        currencyPair: availableCurrencyPairs[0],
        positionManagementModeOverride: null,
        marginPercent: editNumber(0, 4),
        saving: false
      };
      clientPricingConfigurationCollapsedSet(profile).delete(String(context.pricingContextId));
      setClientProfileStatus("");
      renderClientExecutionContextsPanel(profile);
    }

    function startClientPricingRuleEdit(index) {
      const profile = selectedClientProfile();
      const rule = clientPricingRules[index];

      if (!profile || !rule || rule.inn !== profile.inn) {
        return;
      }

      clientPricingRuleInlineEditorState = {
        mode: "edit",
        index,
        inn: profile.inn,
        counterpartyId: profile.counterpartyId,
        pricingContextId: rule.pricingContextId,
        currencyPair: rule.currencyPair,
        positionManagementModeOverride: normalizedPositionManagementModeOverride(
          rule.positionManagementModeOverride
        ),
        marginPercent: editNumber(rule.marginPercent, 4),
        saving: false
      };
      clientPricingConfigurationCollapsedSet(profile).delete(String(rule.pricingContextId));
      setClientProfileStatus("");
      renderClientExecutionContextsPanel(profile);
    }

    function startClientPricingRuleDelete(index) {
      const profile = selectedClientProfile();
      const rule = clientPricingRules[index];

      if (!profile || !rule || rule.inn !== profile.inn) {
        return;
      }

      clientPricingRuleInlineEditorState = null;
      clientPricingRuleEditState = { mode: "edit", index, inn: profile.inn };
      setClientProfileStatus("");
      openClientPricingRuleDialog(rule);
    }

    function cancelClientPricingRuleEdit() {
      closeClientPricingRuleDialog();
    }

    function clientPricingRuleFromDialog() {
      const profile = selectedClientProfile();

      if (!profile || !clientPricingRuleEditState) {
        return null;
      }

      const editing = clientPricingRuleEditState.mode === "edit";
      const savedRule = editing ? clientPricingRules[clientPricingRuleEditState.index] : null;

      if (editing && !savedRule) {
        return null;
      }

      const pricingContextInput = clientPricingRuleForm.elements.pricingContextId;
      const pricingContextIdValue = editing ? savedRule.pricingContextId : pricingContextInput.value;
      const contextExists = Boolean(pricingContextById(pricingContextIdValue));
      const contextValidationInput = clientPricingRuleEditState?.pricingContextId
        ? clientPricingRuleForm.elements.currencyPair
        : pricingContextFacetInput(
          clientPricingContextBuilderState.lastChangedFacet || PRICING_CONTEXT_FACETS[0].field
        );

      PRICING_CONTEXT_FACETS.forEach(({ field }) => pricingContextFacetInput(field).setCustomValidity(""));
      contextValidationInput.setCustomValidity(!editing && !contextExists ? "Select an existing Execution Context." : "");

      if (!editing && !contextExists) {
        contextValidationInput.reportValidity();
        return null;
      }

      const currencyPairInput = clientPricingRuleForm.elements.currencyPair;
      const marginInput = clientPricingRuleForm.elements.marginPercent;
      const positionManagementModeOverride = clientPricingRuleDialogPositionManagementModeOverride();
      const currencyPair = editing
        ? savedRule.currencyPair
        : parsePricingRuleCurrencyPairInput(currencyPairInput);
      const marginPercent = parsePercentInput(marginInput, "Margin", 100);

      if (positionManagementModeOverride === undefined) {
        clientPricingRuleForm.elements.positionManagementModeOverride.reportValidity();
        return null;
      }

      if (currencyPair === null || marginPercent === null) {
        return null;
      }

      const rule = {
        pricingRuleId: pricingRuleIdForEditState(clientPricingRuleEditState),
        counterpartyId: profile.counterpartyId,
        inn: profile.inn,
        currencyPair,
        ccyPairCode: currencyPair.replace("/", "_"),
        pricingContextId: pricingContextIdValue,
        positionManagementModeOverride,
        marginPercent
      };
      const currentIndex = clientPricingRuleEditState.mode === "edit" ? clientPricingRuleEditState.index : null;

      if (editing) {
        return rule;
      }

      const duplicateIndex = clientPricingRules.findIndex((item, index) =>
        index !== currentIndex && samePricingRuleIdentity(item, rule)
      );

      contextValidationInput.setCustomValidity(duplicateIndex === -1 ? "" : "Pricing Rule already exists.");

      if (duplicateIndex !== -1) {
        contextValidationInput.reportValidity();
        return null;
      }

      return rule;
    }

    async function saveClientPricingRuleFromCard() {
      const profile = selectedClientProfile();
      const rule = clientPricingRuleFromDialog();

      if (!profile || !rule) {
        return;
      }

      const isCreating = clientPricingRuleEditState.mode === "create";
      const currentIndex = isCreating ? null : clientPricingRuleEditState.index;
      const currentRule = currentIndex === null ? null : clientPricingRules[currentIndex];

      try {
        const savedRule = await persistPricingRuleRecord(rule, currentRule);

        if (!savedRule) {
          throw new Error("Pricing Rule response is invalid.");
        }

        if (isCreating) {
          clientPricingRules.push(savedRule);
          setClientProfileStatus(
            completedActionMessage(`Pricing Rule ${savedRule.pricingRuleId}`, "added"),
            "success"
          );
        } else {
          clientPricingRules[currentIndex] = savedRule;
          setClientProfileStatus(
            completedActionMessage(`Pricing Rule ${savedRule.pricingRuleId}`, "saved"),
            "success"
          );
        }

        saveClientPricingRules();
      } catch (error) {
        setClientProfileStatus(error.message || "Pricing Rule could not be saved.", "error");
        return;
      }

      clientPricingRuleEditState = null;
      closeClientPricingRuleDialog();
      renderClientPricingRulesPanel(profile);
      renderPricingRules();
    }

    async function deleteClientPricingRuleFromDialog() {
      const profile = selectedClientProfile();
      const index = clientPricingRuleEditState?.mode === "edit"
        ? clientPricingRuleEditState.index
        : null;
      const rule = clientPricingRules[index];

      if (!Number.isInteger(index) || !profile || !rule || rule.inn !== profile.inn) {
        return;
      }

      clientPricingRuleDeleteButton.disabled = true;

      try {
        await deletePricingRuleRecord(rule);
        clientPricingRules.splice(index, 1);
        saveClientPricingRules();
      } catch (error) {
        setClientProfileStatus(error.message || "Pricing Rule could not be deleted.", "error");
        clientPricingRuleDeleteButton.disabled = false;
        return;
      }

      clientPricingRuleEditState = null;
      closeClientPricingRuleDialog();
      setClientProfileStatus(
        completedActionMessage(`Pricing Rule ${rule.pricingRuleId}`, "removed"),
        "success"
      );
      renderClientPricingRulesPanel(profile);
      renderPricingRules();
    }

    function tradingCounterpartyExecutionContextKey(profileOrId) {
      const value = typeof profileOrId === "object" && profileOrId
        ? profileOrId.counterpartyId
        : profileOrId;

      return normalizedIntegerId(value);
    }

    function clientExecutionContextDetachKey(counterpartyId, contextId) {
      return `${counterpartyId}:${contextId}`;
    }

    function isSelectedTradingCounterparty(counterpartyId) {
      return tradingCounterpartyExecutionContextKey(selectedClientProfile()) === counterpartyId;
    }

    function inferredExecutionContextsForProfile(profile) {
      const contextIds = new Set(clientPricingRulesForInn(profile?.inn).map(rule => rule.pricingContextId));

      return pricingContexts.filter(context => contextIds.has(context.pricingContextId));
    }

    function assignedExecutionContextsForProfile(profile) {
      const counterpartyId = tradingCounterpartyExecutionContextKey(profile);

      if (!counterpartyId) {
        return [];
      }

      if (tradingCounterpartyExecutionContexts.has(counterpartyId)) {
        return tradingCounterpartyExecutionContexts.get(counterpartyId);
      }

      return DEMO_API_ENABLED ? [] : inferredExecutionContextsForProfile(profile);
    }

    function mergeExecutionContextAssignmentCounts(contexts) {
      const countsById = new Map(
        contexts
          .filter(context => Number.isFinite(context.assignedCounterpartyCount))
          .map(context => [context.pricingContextId, context.assignedCounterpartyCount])
      );

      if (countsById.size === 0) {
        return;
      }

      pricingContexts = pricingContexts.map(context => countsById.has(context.pricingContextId)
        ? { ...context, assignedCounterpartyCount: countsById.get(context.pricingContextId) }
        : context
      );
    }

    function decrementExecutionContextAssignmentCount(contextId) {
      pricingContexts = pricingContexts.map(context => {
        if (context.pricingContextId !== contextId || !Number.isFinite(context.assignedCounterpartyCount)) {
          return context;
        }

        return {
          ...context,
          assignedCounterpartyCount: Math.max(0, context.assignedCounterpartyCount - 1)
        };
      });
    }

    function normalizedAssignedExecutionContexts(payload) {
      const source = Array.isArray(payload)
        ? payload
        : Array.isArray(payload?.executionContexts)
          ? payload.executionContexts
          : [];

      return normalizedPricingContexts(source, []);
    }

    async function refreshTradingCounterpartyExecutionContexts(profile, options = {}) {
      const counterpartyId = tradingCounterpartyExecutionContextKey(profile);

      if (!counterpartyId) {
        return [];
      }

      if (!DEMO_API_ENABLED) {
        const inferred = inferredExecutionContextsForProfile(profile);
        tradingCounterpartyExecutionContexts.set(counterpartyId, inferred);
        tradingCounterpartyExecutionContextLoadStates.set(counterpartyId, { status: "loaded" });
        renderClientExecutionContextsPanel(selectedClientProfile());
        return inferred;
      }

      const requestId = ++clientExecutionContextRequestSequence;
      tradingCounterpartyExecutionContextLoadStates.set(counterpartyId, { status: "loading", requestId });

      if (options.render !== false && selectedClientProfile()?.counterpartyId === profile.counterpartyId) {
        renderClientExecutionContextsPanel(profile);
      }

      try {
        const payload = await demoApiRequest(
          `/api/v1/trading-counterparties/${encodeURIComponent(counterpartyId)}/execution-contexts`
        );
        const currentState = tradingCounterpartyExecutionContextLoadStates.get(counterpartyId);

        if (currentState?.requestId !== requestId) {
          return tradingCounterpartyExecutionContexts.get(counterpartyId) || [];
        }

        const contexts = normalizedAssignedExecutionContexts(payload);
        tradingCounterpartyExecutionContexts.set(counterpartyId, contexts);
        tradingCounterpartyExecutionContextLoadStates.set(counterpartyId, { status: "loaded" });
        mergeExecutionContextAssignmentCounts(contexts);

        if (selectedClientProfile()?.counterpartyId === profile.counterpartyId) {
          renderClientExecutionContextsPanel(profile);
        }

        return contexts;
      } catch (error) {
        const currentState = tradingCounterpartyExecutionContextLoadStates.get(counterpartyId);

        if (currentState?.requestId === requestId) {
          tradingCounterpartyExecutionContextLoadStates.set(counterpartyId, {
            status: "error",
            message: error.message || "Execution Context assignments could not be loaded."
          });

          if (selectedClientProfile()?.counterpartyId === profile.counterpartyId) {
            renderClientExecutionContextsPanel(profile);
          }
        }

        return [];
      }
    }

    function clientExecutionContextPricingRuleCount(profile, context) {
      const localRuleCount = clientPricingRulesForInn(profile?.inn)
        .filter(rule => rule.pricingContextId === context.pricingContextId)
        .length;

      return Math.max(localRuleCount, Number(context?.pricingRulesCount) || 0);
    }

    function executionContextPricingMode(context) {
      return normalizedPricingType(tradeCaptureChannelById(context?.tradeCaptureChannelId)?.pricingType);
    }

    function availableExecutionContextsForProfile(profile) {
      const assignedIds = new Set(
        assignedExecutionContextsForProfile(profile).map(context => context.pricingContextId)
      );

      return pricingContexts.filter(context => !assignedIds.has(context.pricingContextId));
    }

    function clientPricingConfigurationCollapsedSet(profile) {
      const counterpartyId = tradingCounterpartyExecutionContextKey(profile);

      if (!clientPricingConfigurationCollapsedContexts.has(counterpartyId)) {
        clientPricingConfigurationCollapsedContexts.set(counterpartyId, new Set());
      }

      return clientPricingConfigurationCollapsedContexts.get(counterpartyId);
    }

    function clientPricingRuleEntriesForContext(profile, contextId) {
      return clientPricingRuleEntriesForInn(profile?.inn).filter(({ rule }) =>
        String(rule.pricingContextId) === String(contextId)
      );
    }

    function clientPricingRuleInlineEditorMarkup({
      contextId,
      currencyPairs,
      selectedCurrencyPair,
      positionManagementModeOverride = null,
      marginValue,
      editing,
      index = null,
      saving,
      canSave
    }) {
      const cancelLabel = editing
        ? "Cancel editing Pricing Rule"
        : "Cancel adding Pricing Rule";
      const normalizedOverride = normalizedPositionManagementModeOverride(
        positionManagementModeOverride
      );
      const inherited = normalizedOverride === null;
      const effectiveMode = effectivePositionManagementModeForRule({
        pricingContextId: contextId,
        positionManagementModeOverride: normalizedOverride
      });
      const selectedPositionManagementMode = normalizedOverride || effectiveMode;
      const positionModeSelectId = `client-pricing-rule-inline-position-mode-${contextId}`;
      const currencyPairMarkup = editing
        ? `
          <span class="client-pricing-configuration-inline-field is-pair">
            <span class="button-icon client-pricing-configuration-node-icon" role="img" tabindex="0" aria-label="Ccy Pair" data-tooltip="Ccy Pair">swap_horiz</span>
            <input type="hidden" value="${escapeHtml(selectedCurrencyPair)}" data-client-pricing-rule-inline-field="currencyPair">
            <span class="client-pricing-configuration-node-value client-pricing-configuration-rule-pair">${escapeHtml(selectedCurrencyPair)}</span>
          </span>
        `
        : `
          <label class="client-pricing-configuration-inline-field is-pair">
            <span class="button-icon client-pricing-configuration-node-icon" role="img" tabindex="0" aria-label="Ccy Pair" data-tooltip="Ccy Pair">swap_horiz</span>
            <select class="form-select form-select-sm" data-client-pricing-rule-inline-field="currencyPair" aria-label="Ccy Pair"${saving ? " disabled" : ""}>
              ${currencyPairs.map(currencyPair => `
                <option value="${escapeHtml(currencyPair)}"${currencyPair === selectedCurrencyPair ? " selected" : ""}>${escapeHtml(currencyPair)}</option>
              `).join("")}
            </select>
          </label>
        `;

      return `
        <div
          class="client-pricing-configuration-node client-pricing-configuration-inline-editor is-editing"
          data-client-pricing-rule-inline-editor="${escapeHtml(contextId)}"
          data-client-pricing-rule-inline-mode="${editing ? "edit" : "create"}"
          ${editing ? `data-client-pricing-rule-index="${index}"` : ""}
        >
          ${currencyPairMarkup}
          <span class="client-pricing-configuration-rule-separator" aria-hidden="true">&bull;</span>
          <div class="client-pricing-configuration-inline-field is-mode">
            <span class="button-icon client-pricing-configuration-node-icon" role="img" tabindex="0" aria-label="FX Position Mode" data-tooltip="FX Position Mode">table_chart</span>
            <span class="client-pricing-configuration-node-copy client-pricing-configuration-inline-mode-control">
              <label class="position-management-mode-inherit" for="${escapeHtml(positionModeSelectId)}-default">
                <input class="form-check-input" type="checkbox" id="${escapeHtml(positionModeSelectId)}-default" data-client-pricing-rule-inline-field="useExecutionContextDefault" aria-controls="${escapeHtml(positionModeSelectId)}"${inherited ? " checked" : ""}${saving ? " disabled" : ""}>
                <span>Execution Context Default</span>
              </label>
              <select class="form-select form-select-sm" id="${escapeHtml(positionModeSelectId)}" data-client-pricing-rule-inline-field="positionManagementModeOverride" data-position-management-mode-inherited="${inherited}"${normalizedOverride ? ` data-explicit-position-management-mode="${escapeHtml(normalizedOverride)}"` : ""} aria-label="FX Position Mode"${saving || inherited ? " disabled" : " required"}>
                ${positionManagementModeOptions(selectedPositionManagementMode)}
              </select>
            </span>
          </div>
          <span class="client-pricing-configuration-rule-separator" aria-hidden="true">&bull;</span>
          <label class="client-pricing-configuration-inline-margin">
            <span class="button-icon client-pricing-configuration-node-icon" role="img" tabindex="0" aria-label="Margin" data-tooltip="Margin">savings</span>
            <span class="input-group input-group-sm">
              <input class="form-control form-control-sm" type="text" inputmode="decimal" value="${escapeHtml(marginValue)}" data-client-pricing-rule-inline-field="marginPercent" aria-label="Margin percent"${saving ? " disabled" : ""}>
              <span class="input-group-text">%</span>
            </span>
          </label>
          <span class="client-pricing-configuration-inline-actions">
            <button type="button" class="btn btn-sm btn-outline-primary reference-grid-action" data-client-pricing-rule-inline-action="save" aria-label="Save Pricing Rule" data-tooltip="Save Pricing Rule"${saving || !canSave ? " disabled" : ""}>
              <span class="button-icon" aria-hidden="true">${saving ? "hourglass_top" : "save"}</span>
            </button>
            <button type="button" class="btn btn-sm btn-outline-secondary reference-grid-action" data-client-pricing-rule-inline-action="cancel" aria-label="${cancelLabel}" data-tooltip="Cancel"${saving ? " disabled" : ""}>
              <span class="button-icon" aria-hidden="true">close</span>
            </button>
          </span>
        </div>
      `;
    }

    function renderClientExecutionContextsPanel(profile) {
      if (!clientExecutionContextsPanel) {
        return;
      }

      clientExecutionContextsAttachButton.removeAttribute("title");

      if (!profile) {
        clientPricingRuleInlineEditorState = null;
        clientExecutionContextsPanel.hidden = true;
        clientExecutionContextsList.innerHTML = "";
        clientExecutionContextsCount.textContent = "0 contexts · 0 rules";
        clientExecutionContextsAttachButton.disabled = true;
        clientExecutionContextsAttachButtonIcon.textContent = "add_link";
        clientExecutionContextsAttachButtonLabel.textContent = "Attach Execution Context";
        return;
      }

      const counterpartyId = tradingCounterpartyExecutionContextKey(profile);
      const loadState = tradingCounterpartyExecutionContextLoadStates.get(counterpartyId);
      const contexts = assignedExecutionContextsForProfile(profile);
      const loading = DEMO_API_ENABLED && (!loadState || loadState.status === "loading");
      const loadFailed = loadState?.status === "error";
      const availableCount = availableExecutionContextsForProfile(profile).length;
      const pricingRuleEntries = clientPricingRuleEntriesForInn(profile.inn);
      const collapsedContexts = clientPricingConfigurationCollapsedSet(profile);
      const contextIds = new Set(contexts.map(context => String(context.pricingContextId)));

      if (
        clientPricingRuleInlineEditorState &&
        (
          clientPricingRuleInlineEditorState.inn !== profile.inn ||
          !contextIds.has(String(clientPricingRuleInlineEditorState.pricingContextId))
        )
      ) {
        clientPricingRuleInlineEditorState = null;
      }

      Array.from(collapsedContexts).forEach(contextId => {
        if (!contextIds.has(contextId)) {
          collapsedContexts.delete(contextId);
        }
      });

      clientExecutionContextsPanel.hidden = false;
      clientExecutionContextsCount.textContent = `${contexts.length} ${contexts.length === 1 ? "context" : "contexts"} · ${pricingRuleEntries.length} ${pricingRuleEntries.length === 1 ? "rule" : "rules"}`;
      clientExecutionContextsAttachButton.disabled = loading || (!loadFailed && availableCount === 0);
      clientExecutionContextsAttachButtonIcon.textContent = loadFailed ? "refresh" : "add_link";
      clientExecutionContextsAttachButtonLabel.textContent = loadFailed ? "Retry" : "Attach Execution Context";

      if (loading) {
        clientExecutionContextsList.innerHTML = '<li class="client-execution-contexts-empty">Loading Execution Context assignments...</li>';
        return;
      }

      if (loadFailed) {
        clientExecutionContextsList.innerHTML = `
          <li class="client-execution-contexts-empty">${escapeHtml(loadState.message)}</li>
        `;
        return;
      }

      if (contexts.length === 0) {
        clientExecutionContextsList.innerHTML = `
          <li class="client-execution-contexts-empty">No Execution Contexts are attached to this Trading Counterparty yet.</li>
        `;
        return;
      }

      clientExecutionContextsList.innerHTML = contexts
        .slice()
        .sort((left, right) => String(left.pricingContextId).localeCompare(
          String(right.pricingContextId),
          "en",
          { numeric: true, sensitivity: "base" }
        ))
        .map(context => {
          const ruleEntries = clientPricingRuleEntriesForContext(profile, context.pricingContextId);
          const availableCurrencyPairs = availableClientPricingRuleCurrencyPairs(
            profile,
            context.pricingContextId
          );
          const pricingRuleCount = Math.max(
            ruleEntries.length,
            clientExecutionContextPricingRuleCount(profile, context)
          );
          const detachLocked = pricingRuleCount > 0;
          const detachPending = pendingClientExecutionContextDetaches.has(
            clientExecutionContextDetachKey(counterpartyId, context.pricingContextId)
          );
          const detachTitle = detachPending
            ? "Detaching Execution Context"
            : detachLocked
              ? `Detach unavailable while used by ${pricingRuleCount} ${pricingRuleCount === 1 ? "Pricing Rule" : "Pricing Rules"}`
              : "Detach Execution Context";
          const contextKey = String(context.pricingContextId);
          const expanded = !collapsedContexts.has(contextKey);
          const branchId = `client-pricing-context-${counterpartyId}-${contextKey}`;
          const rulesMarkup = ruleEntries.length === 0
            ? `
                <div class="client-pricing-configuration-node client-pricing-configuration-empty" role="listitem">
                  <span class="button-icon" aria-hidden="true">rule</span>
                  <span>No Pricing Rules configured</span>
                </div>
              `
            : ruleEntries.map(({ rule, index }) => {
                const editing = clientPricingRuleInlineEditorMatches(
                  profile,
                  context.pricingContextId,
                  "edit",
                  index
                );

                if (editing) {
                  const marginValue = clientPricingRuleInlineEditorState.marginPercent;
                  const margin = normalizeNumber(marginValue);
                  const positionManagementModeOverride = normalizedPositionManagementModeOverride(
                    clientPricingRuleInlineEditorState.positionManagementModeOverride
                  );
                  const canSave = margin !== null && margin >= 0 && margin < 100 &&
                    (
                      Math.abs(Number(rule.marginPercent) - Number(margin)) > 0.0000001 ||
                      normalizedPositionManagementModeOverride(rule.positionManagementModeOverride) !==
                        positionManagementModeOverride
                    );

                  return clientPricingRuleInlineEditorMarkup({
                    contextId: context.pricingContextId,
                    currencyPairs: [rule.currencyPair],
                    selectedCurrencyPair: rule.currencyPair,
                    positionManagementModeOverride,
                    marginValue,
                    editing: true,
                    index,
                    saving: clientPricingRuleInlineEditorState.saving,
                    canSave
                  });
                }

                return `
                  <div class="client-pricing-configuration-node client-pricing-configuration-rule" data-client-pricing-rule-index="${index}" role="listitem">
                    <span class="client-pricing-configuration-node-field client-pricing-configuration-rule-piece is-pair">
                      <span class="button-icon client-pricing-configuration-node-icon" role="img" tabindex="0" aria-label="Ccy Pair" data-tooltip="Ccy Pair">swap_horiz</span>
                      <span class="client-pricing-configuration-node-value client-pricing-configuration-rule-pair">${escapeHtml(rule.currencyPair)}</span>
                    </span>
                    <span class="client-pricing-configuration-rule-separator" aria-hidden="true">&bull;</span>
                    <span class="client-pricing-configuration-node-field client-pricing-configuration-rule-piece is-mode">
                      <span class="button-icon client-pricing-configuration-node-icon" role="img" tabindex="0" aria-label="FX Position Mode" data-tooltip="FX Position Mode">table_chart</span>
                      ${clientPricingRulePositionManagementModeMarkup(rule, context)}
                    </span>
                    <span class="client-pricing-configuration-rule-separator" aria-hidden="true">&bull;</span>
                    <span class="client-pricing-configuration-node-field client-pricing-configuration-rule-piece is-margin">
                      <span class="button-icon client-pricing-configuration-node-icon" role="img" tabindex="0" aria-label="Margin" data-tooltip="Margin">savings</span>
                      <span class="client-pricing-configuration-node-value client-pricing-configuration-margin">${escapeHtml(editNumber(rule.marginPercent, 4))}%</span>
                    </span>
                    <span class="client-pricing-configuration-rule-actions">
                      <button type="button" class="btn btn-sm btn-outline-secondary reference-grid-action" data-client-pricing-rule-action="edit" data-client-pricing-rule-index="${index}" aria-label="Edit Pricing Rule ${escapeHtml(rule.pricingRuleId)}" data-tooltip="Edit Pricing Rule">
                        <span class="button-icon" aria-hidden="true">edit</span>
                      </button>
                      <button type="button" class="btn btn-sm btn-outline-danger reference-grid-action" data-client-pricing-rule-action="delete" data-client-pricing-rule-index="${index}" aria-label="Delete Pricing Rule ${escapeHtml(rule.pricingRuleId)}" data-tooltip="Delete Pricing Rule">
                        <span class="button-icon" aria-hidden="true">delete</span>
                      </button>
                    </span>
                  </div>
                `;
              }).join("");
          const inlineCreateActive = clientPricingRuleInlineEditorMatches(
            profile,
            context.pricingContextId,
            "create"
          );
          const inlineEditActive = clientPricingRuleInlineEditorMatches(
            profile,
            context.pricingContextId,
            "edit",
            clientPricingRuleInlineEditorState?.index
          );
          const inlineCurrencyPair = inlineCreateActive && availableCurrencyPairs.includes(
            clientPricingRuleInlineEditorState.currencyPair
          )
            ? clientPricingRuleInlineEditorState.currencyPair
            : availableCurrencyPairs[0] || "";
          const inlineMarginValue = inlineCreateActive
            ? clientPricingRuleInlineEditorState.marginPercent
            : editNumber(0, 4);
          const inlineMarginNumber = normalizeNumber(inlineMarginValue);
          const inlineCanSave = Boolean(inlineCurrencyPair) && inlineMarginNumber !== null
            && inlineMarginNumber >= 0 && inlineMarginNumber < 100;
          const inlineSaving = inlineCreateActive && clientPricingRuleInlineEditorState.saving;
          const inlineCreateRowMarkup = inlineCreateActive
            ? clientPricingRuleInlineEditorMarkup({
                contextId: context.pricingContextId,
                currencyPairs: availableCurrencyPairs,
                selectedCurrencyPair: inlineCurrencyPair,
                positionManagementModeOverride: normalizedPositionManagementModeOverride(
                  clientPricingRuleInlineEditorState.positionManagementModeOverride
                ),
                marginValue: inlineMarginValue,
                editing: false,
                saving: inlineSaving,
                canSave: inlineCanSave
              })
            : "";
          const addRuleRowMarkup = !inlineCreateActive && !inlineEditActive && availableCurrencyPairs.length > 0
              ? `
                  <div class="client-pricing-configuration-add-row">
                    <button type="button" class="btn btn-sm btn-primary reference-new-button client-pricing-configuration-add-rule" data-client-execution-context-action="add-rule" data-client-execution-context-id="${escapeHtml(context.pricingContextId)}">
                      <span class="button-icon" aria-hidden="true">add</span>
                      <span>Pricing Rule</span>
                    </button>
                  </div>
                `
              : "";
          const visibleRulesMarkup = inlineCreateActive && ruleEntries.length === 0
            ? ""
            : rulesMarkup;

          return `
            <li class="client-pricing-configuration-context${expanded ? "" : " is-collapsed"}" data-client-execution-context-id="${escapeHtml(context.pricingContextId)}">
              <div class="client-pricing-configuration-context-head">
                <button type="button" class="client-pricing-configuration-context-toggle" data-client-execution-context-action="toggle" data-client-execution-context-id="${escapeHtml(context.pricingContextId)}" aria-expanded="${String(expanded)}" aria-controls="${escapeHtml(branchId)}" aria-label="${expanded ? "Collapse" : "Expand"} ${escapeHtml(pricingContextDisplayPath(context))}">
                  <span class="button-icon" aria-hidden="true">${expanded ? "expand_more" : "chevron_right"}</span>
                  <span class="client-pricing-configuration-context-title">
                    <span class="button-icon" role="img" tabindex="0" aria-label="Execution Context" data-tooltip="Execution Context">hub</span>
                    <span class="client-pricing-configuration-context-label">Execution Context</span>
                  </span>
                  <span class="client-pricing-context-candidate-path">${pricingContextFacetsMarkup(context, { executionSystemLabel: true })}</span>
                </button>
                <span class="client-pricing-configuration-context-actions profile-row-actions">
                  <button type="button" class="btn btn-sm btn-outline-secondary reference-grid-action" data-client-execution-context-action="detach" data-client-execution-context-id="${escapeHtml(context.pricingContextId)}" aria-label="${escapeHtml(detachTitle)}" aria-disabled="${String(detachLocked || detachPending)}" data-tooltip="${escapeHtml(detachTitle)}"${detachPending ? " disabled" : ""}>
                    <span class="button-icon" aria-hidden="true">${detachPending ? "hourglass_top" : "link_off"}</span>
                  </button>
                </span>
              </div>
              <div class="client-pricing-configuration-branch" id="${escapeHtml(branchId)}"${expanded ? "" : " hidden"}>
                <div class="client-pricing-rule-tree" role="list" aria-label="Pricing Rules for ${escapeHtml(pricingContextDisplayPath(context))}">
                  ${visibleRulesMarkup}
                  ${inlineCreateRowMarkup}
                </div>
                ${addRuleRowMarkup}
              </div>
            </li>
          `;
        })
        .join("");
    }

    function executionContextMatchesAttachFilters(context) {
      return clientExecutionContextAttachFilterControls.every(control => {
        const field = control.dataset.clientContextAttachFilter;
        const query = control.value.trim().toLowerCase();

        if (!query) {
          return true;
        }

        if (field === "pricingMode") {
          return executionContextPricingMode(context).toLowerCase() === query;
        }

        return pricingContextSearchValues(context, field)
          .some(value => String(value || "").toLowerCase().includes(query));
      });
    }

    function filteredAvailableExecutionContextsForAttach() {
      const profile = selectedClientProfile();

      if (!profile || tradingCounterpartyExecutionContextKey(profile) !== clientExecutionContextAttachCounterpartyId) {
        return [];
      }

      return availableExecutionContextsForProfile(profile)
        .filter(executionContextMatchesAttachFilters)
        .sort((left, right) => {
          const order = String(left.pricingContextId).localeCompare(
            String(right.pricingContextId),
            "en",
            { numeric: true, sensitivity: "base" }
          );

          return clientExecutionContextAttachSortDirection === "desc" ? -order : order;
        });
    }

    function updateClientExecutionContextAttachSelectionControls(visibleContexts) {
      const visibleIds = visibleContexts.map(context => context.pricingContextId);
      const selectedVisibleCount = visibleIds.filter(id => selectedClientExecutionContextIds.has(id)).length;
      const selectedCount = selectedClientExecutionContextIds.size;
      const allVisibleSelected = visibleIds.length > 0 && selectedVisibleCount === visibleIds.length;

      clientExecutionContextAttachSelectAll.checked = allVisibleSelected;
      clientExecutionContextAttachSelectAll.indeterminate = selectedVisibleCount > 0 && !allVisibleSelected;
      clientExecutionContextAttachSelectAll.disabled = clientExecutionContextAttachSaving || visibleIds.length === 0;
      clientExecutionContextAttachSubmitButton.disabled = clientExecutionContextAttachSaving || selectedCount === 0;
      clientExecutionContextAttachSubmitLabel.textContent = clientExecutionContextAttachSaving
        ? "Attaching..."
        : selectedCount > 0
          ? `Attach (${selectedCount})`
          : "Attach";
      clientExecutionContextAttachSelection.textContent = `${selectedCount} selected`;
      clientExecutionContextAttachDialogClose.disabled = clientExecutionContextAttachSaving;
      clientExecutionContextAttachCancelButton.disabled = clientExecutionContextAttachSaving;
      clientExecutionContextAttachIdSort.disabled = clientExecutionContextAttachSaving;
      clientExecutionContextAttachFilterControls.forEach(control => {
        control.disabled = clientExecutionContextAttachSaving;
      });
      clientExecutionContextAttachDialog.setAttribute("aria-busy", String(clientExecutionContextAttachSaving));
      clientExecutionContextAttachIdSort.setAttribute(
        "aria-label",
        `Sort available execution contexts by ID ${clientExecutionContextAttachSortDirection === "asc" ? "ascending" : "descending"}`
      );
      clientExecutionContextAttachIdSort.setAttribute(
        "aria-pressed",
        String(clientExecutionContextAttachSortDirection === "asc")
      );
      clientExecutionContextAttachIdSort.closest("th")?.setAttribute(
        "aria-sort",
        clientExecutionContextAttachSortDirection === "asc" ? "ascending" : "descending"
      );
    }

    function renderClientExecutionContextAttachTable() {
      const contexts = filteredAvailableExecutionContextsForAttach();

      if (contexts.length === 0) {
        const hasAvailableContexts = availableExecutionContextsForProfile(selectedClientProfile()).length > 0;
        clientExecutionContextAttachRows.innerHTML = `
          <tr>
            <td class="profile-empty" colspan="6">${hasAvailableContexts
              ? "No available Execution Contexts match the current filters."
              : "All available Execution Contexts are already attached."}</td>
          </tr>
        `;
      } else {
        clientExecutionContextAttachRows.innerHTML = contexts.map(context => {
          const selected = selectedClientExecutionContextIds.has(context.pricingContextId);
          const pricingMode = executionContextPricingMode(context);

          return `
            <tr${selected ? ' class="is-selected"' : ""} data-client-context-attach-id="${escapeHtml(context.pricingContextId)}">
              <td class="client-context-attach-select-cell">
                <input type="checkbox" class="form-check-input" data-client-context-attach-select="${escapeHtml(context.pricingContextId)}" aria-label="Select Execution Context ${escapeHtml(context.pricingContextId)}"${selected ? " checked" : ""}${clientExecutionContextAttachSaving ? " disabled" : ""}>
              </td>
              <td>${escapeHtml(context.pricingContextId)}</td>
              <td>${escapeHtml(servicingBranchDisplayName(context.servicingBranchCode))}</td>
              <td>${escapeHtml(context.settlementSystemId === NOT_APPLICABLE_ACCOUNTING_SYSTEM_ID
                ? "Not Applicable"
                : settlementSystemDisplayName(context.settlementSystemId))}</td>
              <td>${escapeHtml(tradeCaptureChannelDisplayName(context.tradeCaptureChannelId))}</td>
              <td>${pricingModeIndicatorMarkup(
                pricingMode,
                escapeHtml(pricingTypePresentation(pricingMode).label)
              )}</td>
            </tr>
          `;
        }).join("");
      }

      updateClientExecutionContextAttachSelectionControls(contexts);
    }

    function focusClientExecutionContextAttachCheckbox(contextId) {
      clientExecutionContextAttachRows
        .querySelector(`[data-client-context-attach-select="${contextId}"]`)
        ?.focus();
    }

    function setClientExecutionContextAttachStatus(message = "", tone = "") {
      setWorkbenchPageStatus(clientExecutionContextAttachStatus, message, tone);
    }

    function openClientExecutionContextAttachDialog() {
      const profile = selectedClientProfile();
      const counterpartyId = tradingCounterpartyExecutionContextKey(profile);

      if (!profile || !counterpartyId) {
        setClientProfileStatus("Save the Trading Counterparty before attaching an Execution Context.", "error");
        return;
      }

      clientExecutionContextAttachCounterpartyId = counterpartyId;
      clientExecutionContextAttachSortDirection = "asc";
      clientExecutionContextAttachSaving = false;
      selectedClientExecutionContextIds.clear();
      clientExecutionContextAttachFilterControls.forEach(control => {
        control.value = "";
      });
      clientExecutionContextAttachDialogSubtitle.textContent = `Select one or more contexts to attach to ${profile.name}.`;
      setClientExecutionContextAttachStatus("");
      applyClientExecutionContextAttachColumnLayout();
      renderClientExecutionContextAttachTable();

      openDialogWithoutFieldFocus(clientExecutionContextAttachDialog);
    }

    function closeClientExecutionContextAttachDialog() {
      if (clientExecutionContextAttachSaving) {
        return;
      }

      if (typeof clientExecutionContextAttachDialog.close === "function") {
        clientExecutionContextAttachDialog.close();
      } else {
        clientExecutionContextAttachDialog.removeAttribute("open");
      }
    }

    async function attachSelectedExecutionContexts(event) {
      event.preventDefault();
      const profile = selectedClientProfile();
      const counterpartyId = tradingCounterpartyExecutionContextKey(profile);
      const executionContextIds = Array.from(selectedClientExecutionContextIds);

      if (!profile || counterpartyId !== clientExecutionContextAttachCounterpartyId || executionContextIds.length === 0) {
        return;
      }

      clientExecutionContextAttachSaving = true;
      setClientExecutionContextAttachStatus("Attaching Execution Contexts...");
      renderClientExecutionContextAttachTable();

      let contexts;

      try {
        if (DEMO_API_ENABLED) {
          const payload = await demoApiRequest(
            `/api/v1/trading-counterparties/${encodeURIComponent(counterpartyId)}/execution-contexts`,
            {
              method: "PUT",
              body: JSON.stringify({ executionContextIds: executionContextIds.map(Number) })
            }
          );
          contexts = normalizedAssignedExecutionContexts(payload);
        } else {
          const existing = assignedExecutionContextsForProfile(profile);
          const requestedIds = new Set(executionContextIds);
          contexts = normalizedPricingContexts([
            ...existing,
            ...pricingContexts.filter(context => requestedIds.has(context.pricingContextId))
          ], []);
        }
      } catch (error) {
        clientExecutionContextAttachSaving = false;
        setClientExecutionContextAttachStatus(error.message || "Execution Contexts could not be attached.", "error");
        renderClientExecutionContextAttachTable();
        return;
      }

      tradingCounterpartyExecutionContexts.set(counterpartyId, contexts);
      tradingCounterpartyExecutionContextLoadStates.set(counterpartyId, { status: "loaded" });
      mergeExecutionContextAssignmentCounts(contexts);
      const attachedCount = executionContextIds.length;
      clientExecutionContextAttachSaving = false;
      selectedClientExecutionContextIds.clear();
      const profileStillSelected = isSelectedTradingCounterparty(counterpartyId);

      if (profileStillSelected) {
        renderClientExecutionContextsPanel(profile);
      }

      closeClientExecutionContextAttachDialog();

      if (profileStillSelected) {
        setClientProfileStatus(
          `${attachedCount} Execution ${attachedCount === 1 ? "Context was" : "Contexts were"} attached successfully.`,
          "success"
        );
      }

      if (DEMO_API_ENABLED) {
        try {
          await refreshExecutionContextsFromApi();
          renderPricingContexts();
        } catch (refreshError) {
          console.warn("Execution Context usage counts could not be refreshed.", refreshError);
        }
      }
    }

    async function detachClientExecutionContext(profile, contextId) {
      const counterpartyId = tradingCounterpartyExecutionContextKey(profile);
      const context = assignedExecutionContextsForProfile(profile)
        .find(item => item.pricingContextId === contextId);
      const detachKey = clientExecutionContextDetachKey(counterpartyId, contextId);

      if (!counterpartyId || !context || pendingClientExecutionContextDetaches.has(detachKey)) {
        return;
      }

      const pricingRuleCount = clientExecutionContextPricingRuleCount(profile, context);

      if (pricingRuleCount > 0) {
        if (isSelectedTradingCounterparty(counterpartyId)) {
          setClientProfileStatus(
            `Execution Context ${contextId} cannot be detached while it is used by ${pricingRuleCount} ${pricingRuleCount === 1 ? "Pricing Rule" : "Pricing Rules"}.`,
            "error"
          );
        }
        return;
      }

      pendingClientExecutionContextDetaches.add(detachKey);

      if (isSelectedTradingCounterparty(counterpartyId)) {
        renderClientExecutionContextsPanel(profile);
      }

      try {
        if (DEMO_API_ENABLED) {
          await demoApiRequest(
            `/api/v1/trading-counterparties/${encodeURIComponent(counterpartyId)}/execution-contexts/${encodeURIComponent(contextId)}`,
            { method: "DELETE" }
          );
        }
      } catch (error) {
        pendingClientExecutionContextDetaches.delete(detachKey);

        if (isSelectedTradingCounterparty(counterpartyId)) {
          renderClientExecutionContextsPanel(profile);
          setClientProfileStatus(error.message || `Execution Context ${contextId} could not be detached.`, "error");
        }
        return;
      }

      tradingCounterpartyExecutionContexts.set(
        counterpartyId,
        assignedExecutionContextsForProfile(profile).filter(item => item.pricingContextId !== contextId)
      );
      decrementExecutionContextAssignmentCount(contextId);
      pendingClientExecutionContextDetaches.delete(detachKey);

      if (isSelectedTradingCounterparty(counterpartyId)) {
        renderClientExecutionContextsPanel(profile);
        setClientProfileStatus(`Execution Context ${contextId} was detached successfully.`, "success");
      }

      if (DEMO_API_ENABLED) {
        try {
          await refreshExecutionContextsFromApi();
          renderPricingContexts();
        } catch (refreshError) {
          console.warn("Execution Context usage counts could not be refreshed.", refreshError);
        }
      }
    }

    function updateClientPricingRulesAddAvailability(profile) {
      return Boolean(profile) && assignedExecutionContextsForProfile(profile).length > 0;
    }

    function syncClientExecutionContextPricingRuleCounts(profile) {
      const counterpartyId = tradingCounterpartyExecutionContextKey(profile);

      if (!counterpartyId || !tradingCounterpartyExecutionContexts.has(counterpartyId)) {
        return;
      }

      const ruleEntries = clientPricingRuleEntriesForInn(profile.inn);
      tradingCounterpartyExecutionContexts.set(
        counterpartyId,
        assignedExecutionContextsForProfile(profile).map(context => ({
          ...context,
          pricingRulesCount: ruleEntries.filter(({ rule }) =>
            String(rule.pricingContextId) === String(context.pricingContextId)
          ).length
        }))
      );
    }

    function renderClientPricingRulesPanel(profile) {
      updateClientPricingRulesAddAvailability(profile);
      syncClientExecutionContextPricingRuleCounts(profile);
      renderClientPricingRuleEditor(profile);
      renderClientExecutionContextsPanel(profile);
      updateClientProfileDeleteAvailability();
    }

    function setClientProfilePageHeading(title) {
      clientProfilePageTitle.textContent = title;
      document.title = title === "Trading Counterparties" ? title : `${title} - Trading Counterparties`;
    }

    function setClientProfileRouteVisibility(detailVisible) {
      clientProfileListView.hidden = detailVisible;
      clientProfileDetailView.hidden = !detailVisible;
      clientProfileBackButton.hidden = !detailVisible;
      tradingCounterpartyScopeTabs.hidden = detailVisible;
      clientProfileLayout.classList.toggle("is-detail-view", detailVisible);
    }

    function locallyAttachedTradingCounterpartyIds(executionContextId) {
      const contextId = String(executionContextId ?? "");

      return new Set(
        clientProfiles
          .filter(profile => assignedExecutionContextsForProfile(profile)
            .some(context => context.pricingContextId === contextId))
          .map(profile => String(profile.counterpartyId ?? ""))
          .filter(Boolean)
      );
    }

    function selectFirstPopulatedTradingCounterpartyScope(counterpartyIds) {
      const attachedProfiles = clientProfiles.filter(profile =>
        counterpartyIds.has(String(profile.counterpartyId ?? ""))
      );
      const activeScopeHasRows = attachedProfiles.some(profile =>
        normalizedCounterpartyScope(profile.counterpartyScope) === activeTradingCounterpartyScope
      );

      if (activeScopeHasRows) {
        return;
      }

      const firstScope = ["EXTERNAL", "INTERNAL"].find(scope =>
        attachedProfiles.some(profile => normalizedCounterpartyScope(profile.counterpartyScope) === scope)
      );

      if (firstScope) {
        setTradingCounterpartyScopeTab(firstScope);
      }
    }

    async function loadExecutionContextTradingCounterparties(routeScope) {
      const requestSequence = ++clientProfileRouteScopeRequestSequence;
      const localIds = locallyAttachedTradingCounterpartyIds(routeScope.executionContextId);
      routeScope.counterpartyIds = localIds;
      routeScope.status = DEMO_API_ENABLED ? "loading" : "loaded";
      tradingCounterpartiesTable.toggleAttribute("aria-busy", DEMO_API_ENABLED);

      if (!DEMO_API_ENABLED) {
        selectFirstPopulatedTradingCounterpartyScope(localIds);
        renderClientProfiles();
        return;
      }

      setClientProfileStatus("Loading attached Trading Counterparties...");
      renderClientProfiles();

      try {
        const payload = await demoApiRequest(
          `/api/v1/execution-contexts/${encodeURIComponent(routeScope.executionContextId)}/trading-counterparties`
        );
        const attachedProfiles = normalizedClientProfiles(payload, []);

        if (requestSequence !== clientProfileRouteScopeRequestSequence || clientProfileRouteScope !== routeScope) {
          return;
        }

        attachedProfiles.forEach(profile => {
          const existingIndex = clientProfiles.findIndex(candidate =>
            String(candidate.counterpartyId ?? "") === String(profile.counterpartyId ?? "")
          );

          if (existingIndex >= 0) {
            clientProfiles[existingIndex] = profile;
          } else {
            clientProfiles.push(profile);
          }
        });
        routeScope.counterpartyIds = new Set(
          attachedProfiles
            .map(profile => String(profile.counterpartyId ?? ""))
            .filter(Boolean)
        );
        routeScope.status = "loaded";
        selectFirstPopulatedTradingCounterpartyScope(routeScope.counterpartyIds);
        setClientProfileStatus("");
      } catch (error) {
        if (requestSequence !== clientProfileRouteScopeRequestSequence || clientProfileRouteScope !== routeScope) {
          return;
        }

        routeScope.counterpartyIds = new Set();
        routeScope.status = "error";
        routeScope.message = error.message || "Attached Trading Counterparties could not be loaded.";
        setClientProfileStatus(routeScope.message, "error");
      } finally {
        if (requestSequence === clientProfileRouteScopeRequestSequence && clientProfileRouteScope === routeScope) {
          tradingCounterpartiesTable.removeAttribute("aria-busy");
          renderClientProfiles();
        }
      }
    }

    function replaceClientProfileRoute(counterpartyId = "") {
      const route = clientProfileRoute(counterpartyId);

      history.replaceState(null, "", `${location.pathname}${location.search}${route}`);
    }

    function navigateToClientProfileRoute(counterpartyId = "") {
      const route = clientProfileRoute(counterpartyId);

      if (location.hash === route) {
        syncClientProfileRouteView();
        renderClientProfiles();
        return;
      }

      location.hash = route;
    }

    function navigateToClientProfileIndex(index) {
      const profile = clientProfiles[index];

      if (profile) {
        navigateToClientProfileRoute(profile.counterpartyId);
      }
    }

    function syncClientProfileRouteView() {
      const routeState = clientProfileRouteStateFromLocation();
      const previousScope = clientProfileRouteScope;

      if (routeState.mode === "related") {
        clientProfileRouteScope = {
          executionContextId: routeState.executionContextId,
          returnHash: routeState.returnHash,
          counterpartyIds: new Set(),
          status: "loading",
          message: ""
        };
        tradingCounterpartyRowEditState = null;
        editingClientProfileIndex = null;
        setClientProfileRouteVisibility(false);
        resetClientProfileForm();
        setClientProfilePageHeading("Trading Counterparties");
        clientProfilePage.classList.add("is-related-view");
        clientProfileNewButton.hidden = true;
        clientProfileBreadcrumb.hidden = false;
        clientProfileBreadcrumbBackLink.href = clientProfileRouteScope.returnHash;
        clientProfileBreadcrumbBackLink.textContent = "Execution Contexts";
        clientProfileBreadcrumbCurrent.textContent = `Trading Counterparties for Execution Context ${routeState.executionContextId}`;

        if (!previousScope || previousScope.executionContextId !== routeState.executionContextId) {
          tradingCounterpartyHeaderFilterControls.forEach(control => {
            control.value = "";
          });
        }

        setClientProfileStatus("");
        loadExecutionContextTradingCounterparties(clientProfileRouteScope);
        return;
      }

      clientProfileRouteScopeRequestSequence += 1;
      clientProfileRouteScope = null;
      tradingCounterpartiesTable.removeAttribute("aria-busy");
      clientProfilePage.classList.remove("is-related-view");
      clientProfileNewButton.hidden = false;
      clientProfileBreadcrumb.hidden = true;

      if (routeState.mode === "list") {
        tradingCounterpartyRowEditState = null;
        setClientProfileRouteVisibility(false);
        resetClientProfileForm();
        setClientProfilePageHeading("Trading Counterparties");
        setClientProfileStatus("");
        return;
      }

      if (routeState.mode === "create") {
        replaceClientProfileRoute();
        setClientProfileRouteVisibility(false);
        resetClientProfileForm();
        setClientProfilePageHeading("Trading Counterparties");
        startTradingCounterpartyRowCreate();
        return;
      }

      setClientProfileRouteVisibility(true);
      const index = clientProfiles.findIndex(profile =>
        String(profile.counterpartyId ?? "") === routeState.counterpartyId
      );

      if (index >= 0) {
        startClientProfileEdit(index);
        return;
      }

      replaceClientProfileRoute();
      setClientProfileRouteVisibility(false);
      resetClientProfileForm();
      setClientProfilePageHeading("Trading Counterparties");
      setClientProfileStatus(`Trading Counterparty ID ${routeState.counterpartyId} was not found.`, "error");
    }

    function showClientProfileCard(visible) {
      clientProfileForm.hidden = !visible;
      clientProfileDetailHint.hidden = visible;
    }

    function clearClientProfileFormValidity() {
      Array.from(clientProfileForm.elements).forEach(element => {
        if (typeof element.setCustomValidity === "function") {
          element.setCustomValidity("");
        }
      });
    }

    function resetClientProfileForm() {
      editingClientProfileIndex = null;
      clientPricingRuleEditState = null;
      clientProfileForm.reset();
      const defaultRole = tradingCounterpartyScopeDefaultRole(activeTradingCounterpartyScope);
      syncTradingCounterpartyFormScope(activeTradingCounterpartyScope);
      setTradingCounterpartyFormRoles([defaultRole], defaultRole);
      clientProfileForm.elements.isActive.checked = true;
      clearClientProfileFormValidity();
      clientProfileFormTitle.textContent = "Trading Counterparty";
      clientProfileSubmitButton.querySelector("span:last-child").textContent = "Save counterparty";
      clientProfileSubmitButton.querySelector(".button-icon").textContent = "save";
      clientProfileSubmitButton.disabled = false;
      clientProfileSubmitButton.title = "";
      updateClientProfileDeleteAvailability();
      clientProfileResetButton.querySelector("span:last-child").textContent = "Back";
      clientProfileResetButton.querySelector(".button-icon").textContent = "arrow_back";
      showClientProfileCard(false);
      renderClientExecutionContextsPanel(null);
      renderClientPricingRulesPanel(null);
    }

    function profileFromClientProfileForm() {
      const name = parseRequiredText(clientProfileForm.elements.clientName, "Counterparty Name");
      const counterpartyScope = normalizedCounterpartyScope(clientProfileForm.elements.counterpartyScope.value);
      const counterpartyRoles = selectedTradingCounterpartyFormRoles();
      const clientCodeType = tradingCounterpartyFormCodeType(counterpartyScope);
      const inn = parseClientCode(clientProfileForm.elements.inn, clientCodeType);
      const isActive = clientProfileForm.elements.isActive.checked;
      const counterpartyId = selectedClientProfile()?.counterpartyId ?? null;

      if (name === null || inn === null || counterpartyRoles.length === 0) {
        if (counterpartyRoles.length === 0) {
          setClientProfileStatus("Select at least one Trading Counterparty role.", "error");
        }
        return null;
      }

      return {
        counterpartyId,
        counterpartyScope,
        counterpartyRoles,
        counterpartyType: counterpartyRoles[0],
        name,
        inn,
        clientCodeType,
        externalCounterpartyKind: counterpartyScope === "EXTERNAL"
          ? normalizedExternalCounterpartyKind(clientProfileForm.elements.profileKind.value)
          : null,
        unitType: counterpartyScope === "INTERNAL"
          ? normalizedInternalUnitType(clientProfileForm.elements.profileKind.value)
          : null,
        isActive
      };
    }

    function tradingCounterpartyHeaderFilterValue(field) {
      return tradingCounterpartyHeaderFilterControls
        .find(control => control.dataset.tradingCounterpartyHeaderFilter === field)
        ?.value.trim() || "";
    }

    function tradingCounterpartyFilterContainer(field) {
      if (field === "partyType") {
        return tradingCounterpartyExternalKindFilter;
      }

      if (field === "counterpartyType") {
        return tradingCounterpartyTypeFilter;
      }

      if (field === "clientCodeType") {
        return tradingCounterpartyCodeTypeFilter;
      }

      return tradingCounterpartyActiveFilter;
    }

    function tradingCounterpartyFilterValue(profile, field) {
      if (field === "partyType") {
        return tradingCounterpartyPartyType(profile);
      }

      if (field === "counterpartyType") {
        return tradingCounterpartyRolesLabel(profile);
      }

      if (field === "clientCodeType") {
        return tradingCounterpartyBusinessIdType(profile);
      }

      return profile.isActive ? "YES" : "NO";
    }

    function tradingCounterpartyMatchesRouteScope(profile) {
      return !clientProfileRouteScope || clientProfileRouteScope.counterpartyIds.has(
        String(profile.counterpartyId ?? "")
      );
    }

    function tradingCounterpartyFilterValues(field) {
      return uniqueReferenceValues(
        clientProfiles.filter(profile =>
          normalizedCounterpartyScope(profile.counterpartyScope) === activeTradingCounterpartyScope
          && tradingCounterpartyMatchesRouteScope(profile)
        ),
        profile => tradingCounterpartyFilterValue(profile, field)
      );
    }

    function tradingCounterpartyMatchesColumnFilters(profile) {
      return tradingCounterpartyFilterFields.every(field => {
        const values = tradingCounterpartyFilterValues(field);
        const excludedValues = tradingCounterpartyFilterState[field];

        ensureColumnFilterState(
          tradingCounterpartyFilterState,
          tradingCounterpartyFilterKnownValues,
          tradingCounterpartyFilterInitialized,
          field,
          values
        );
        return !excludedValues.has(tradingCounterpartyFilterValue(profile, field));
      });
    }

    function renderTradingCounterpartyFilter(field) {
      renderColumnFilterMenu({
        container: tradingCounterpartyFilterContainer(field),
        field,
        values: tradingCounterpartyFilterValues(field),
        filterState: tradingCounterpartyFilterState,
        knownValuesMap: tradingCounterpartyFilterKnownValues,
        initializedFields: tradingCounterpartyFilterInitialized
      });
    }

    function syncTradingCounterpartyColumnFilters() {
      tradingCounterpartyFilterFields.forEach(renderTradingCounterpartyFilter);
    }

    function filteredClientProfiles() {
      const counterpartyIdFilter = tradingCounterpartyHeaderFilterValue("counterpartyId");
      const counterpartyTypeFilter = tradingCounterpartyHeaderFilterValue("counterpartyType");
      const counterpartyCodeFilter = tradingCounterpartyHeaderFilterValue("counterpartyCode").toLowerCase();
      const clientCodeTypeFilter = tradingCounterpartyHeaderFilterValue("clientCodeType");
      const partyTypeFilter = tradingCounterpartyHeaderFilterValue("partyType");
      const counterpartyNameFilter = tradingCounterpartyHeaderFilterValue("counterpartyName").toLowerCase();
      const activeFilter = tradingCounterpartyHeaderFilterValue("active");
      const direction = tradingCounterpartyIdSortDirection === "desc" ? -1 : 1;

      return clientProfiles
        .map((profile, index) => ({ profile, index }))
        .filter(({ profile }) => {
          if (normalizedCounterpartyScope(profile.counterpartyScope) !== activeTradingCounterpartyScope) {
            return false;
          }

          if (!tradingCounterpartyMatchesRouteScope(profile)) {
            return false;
          }

          const counterpartyId = String(profile.counterpartyId ?? "");
          const clientCodeType = tradingCounterpartyBusinessIdType(profile);
          const partyType = tradingCounterpartyPartyType(profile);
          const active = profile.isActive ? "YES" : "NO";

          return (!counterpartyIdFilter || counterpartyId.includes(counterpartyIdFilter))
            && (!counterpartyTypeFilter || tradingCounterpartyHasRole(profile, counterpartyTypeFilter))
            && (!counterpartyCodeFilter || profile.inn.toLowerCase().includes(counterpartyCodeFilter))
            && (!clientCodeTypeFilter || clientCodeType === clientCodeTypeFilter)
            && (!partyTypeFilter || partyType === partyTypeFilter)
            && (!counterpartyNameFilter || profile.name.toLowerCase().includes(counterpartyNameFilter))
            && (!activeFilter || active === activeFilter);
        })
        .sort((left, right) => {
          const leftId = Number(left.profile.counterpartyId);
          const rightId = Number(right.profile.counterpartyId);
          const leftHasId = Number.isInteger(leftId);
          const rightHasId = Number.isInteger(rightId);

          if (leftHasId && rightHasId) {
            return direction * (leftId - rightId);
          }

          if (leftHasId !== rightHasId) {
            return leftHasId ? -1 : 1;
          }

          return direction * left.profile.name.localeCompare(right.profile.name, "en", { sensitivity: "base" });
        });
    }

    function updateTradingCounterpartyIdSortControl() {
      updateReferenceDataIdSortControl(
        tradingCounterpartyIdHeader,
        tradingCounterpartyIdSortButton,
        tradingCounterpartyIdSortDirection,
        "trading counterparties"
      );
    }

    function tradingCounterpartyDefaultDraft() {
      const counterpartyScope = activeTradingCounterpartyScope;
      const counterpartyType = tradingCounterpartyScopeDefaultRole(counterpartyScope);

      return {
        counterpartyId: null,
        counterpartyScope,
        counterpartyRoles: [counterpartyType],
        counterpartyType,
        inn: "",
        clientCodeType: counterpartyScope === "INTERNAL" ? "INTERNAL_UNIT_CODE" : "INN",
        externalCounterpartyKind: counterpartyScope === "EXTERNAL" ? "CORPORATE" : null,
        unitType: counterpartyScope === "INTERNAL" ? "DESK" : null,
        name: "",
        isActive: true
      };
    }

    function activeBooleanOptions(selectedValue) {
      const selected = selectedValue !== false ? "true" : "false";

      return `
        <option value="true" ${selected === "true" ? "selected" : ""}>Yes</option>
        <option value="false" ${selected === "false" ? "selected" : ""}>No</option>
      `;
    }

    function applicationStatusTokenMarkup(value) {
      const status = String(value || "INACTIVE").trim().toUpperCase();
      const tone = status === "ACTIVE"
        ? " is-active"
        : status === "UNAVAILABLE"
          ? " is-unavailable"
          : "";

      return `<span class="app-status-token${tone}">${escapeHtml(status)}</span>`;
    }

    function activeBooleanTokenMarkup(isActive) {
      const active = isActive !== false;
      return `<span class="app-status-token${active ? " is-active" : ""}" aria-label="Active: ${active ? "Yes" : "No"}">${active ? "Yes" : "No"}</span>`;
    }

    function counterpartyIdentifierMarkup(codeType, code) {
      return `
        <span class="counterparty-identifier-display" data-smart-width-content>
          <span class="counterparty-identifier-scheme">${escapeHtml(codeType)}</span>
          <span class="counterparty-identifier-code">${escapeHtml(code)}</span>
        </span>
      `;
    }

    function tradingCounterpartyIdentifierMarkup(profile) {
      return counterpartyIdentifierMarkup(profile.clientCodeType, profile.inn);
    }

    function renderTradingCounterpartyCreateRow(profile) {
      const internal = normalizedCounterpartyScope(profile.counterpartyScope) === "INTERNAL";
      const partyTypeOptions = internal
        ? internalUnitTypeOptions(profile.unitType)
        : externalCounterpartyKindOptions(profile.externalCounterpartyKind);
      const businessIdTypeControl = internal
        ? `<span class="app-status-token">INTERNAL_UNIT_CODE</span>`
        : `<select class="inline-edit-control" data-trading-counterparty-field="businessIdType" aria-label="Business ID Type" required>${clientCodeTypeOptions(profile.clientCodeType)}</select>`;

      return `
        <tr class="is-selected is-editing" data-trading-counterparty-edit-row>
          <td>${escapeHtml(profile.counterpartyId ?? "")}</td>
          <td><select class="inline-edit-control" data-trading-counterparty-field="partyType" required>${partyTypeOptions}</select></td>
          <td>${businessIdTypeControl}</td>
          <td><input class="inline-edit-control" type="text" data-trading-counterparty-field="counterpartyCode" aria-label="Business ID" value="${escapeHtml(profile.inn)}" maxlength="20" required></td>
          <td><input class="inline-edit-control" type="text" data-trading-counterparty-field="counterpartyName" value="${escapeHtml(profile.name)}" maxlength="200" required></td>
          <td><select class="inline-edit-control" data-trading-counterparty-field="counterpartyType" required>${counterpartyTypeOptions(profile.counterpartyType)}</select></td>
          <td><select class="inline-edit-control" data-trading-counterparty-field="isActive">${activeBooleanOptions(profile.isActive)}</select></td>
          <td class="profile-actions-cell">
            <span class="profile-row-actions">
              <button type="button" class="btn btn-sm btn-outline-primary reference-grid-action" data-profile-action="save" aria-label="Save Trading Counterparty" title="Save">
                <span class="button-icon" aria-hidden="true">save</span>
              </button>
              <button type="button" class="btn btn-sm btn-outline-secondary reference-grid-action" data-profile-action="cancel" aria-label="Cancel editing" title="Cancel">
                <span class="button-icon" aria-hidden="true">close</span>
              </button>
            </span>
          </td>
        </tr>
      `;
    }

    function renderTradingCounterpartyViewRow(profile, index) {
      const relatedView = Boolean(clientProfileRouteScope);

      return `
        <tr${index === editingClientProfileIndex ? " class=\"is-selected\"" : ""} data-profile-index="${index}"${relatedView ? "" : ' tabindex="0"'}>
          <td>${escapeHtml(profile.counterpartyId ?? "")}</td>
          <td>${escapeHtml(tradingCounterpartyPartyTypeLabel(profile))}</td>
          <td>${escapeHtml(tradingCounterpartyBusinessIdType(profile))}</td>
          <td>${escapeHtml(profile.inn)}</td>
          <td>${escapeHtml(profile.name)}</td>
          <td>${escapeHtml(tradingCounterpartyRolesLabel(profile))}</td>
          <td>${activeBooleanTokenMarkup(profile.isActive)}</td>
          <td class="profile-actions-cell" data-client-profile-actions-column>
            ${relatedView ? "" : `
              <span class="profile-row-actions">
                <button type="button" class="btn btn-sm btn-outline-secondary reference-grid-action" data-profile-action="edit" data-profile-index="${index}" aria-label="Edit ${escapeHtml(profile.counterpartyId ?? profile.inn)}">
                  <span class="button-icon" aria-hidden="true">edit</span>
                </button>
              </span>
            `}
          </td>
        </tr>
      `;
    }

    function tradingCounterpartyDraftFromRow(row) {
      const field = name => row.querySelector(`[data-trading-counterparty-field='${name}']`);
      const counterpartyType = normalizedCounterpartyType(field("counterpartyType")?.value);
      const counterpartyScope = activeTradingCounterpartyScope;
      const internal = counterpartyScope === "INTERNAL";
      const partyType = field("partyType")?.value;
      const clientCodeType = internal ? "INTERNAL_UNIT_CODE" : normalizedClientCodeType(field("businessIdType")?.value);
      const inn = normalizedClientCode(field("counterpartyCode")?.value, clientCodeType, "");
      const name = field("counterpartyName")?.value.trim() || "";

      if (!inn || name.length < 1 || name.length > 200) {
        return null;
      }

      return {
        counterpartyId: null,
        counterpartyScope,
        counterpartyRoles: [counterpartyType],
        counterpartyType,
        inn,
        clientCodeType,
        externalCounterpartyKind: internal ? null : normalizedExternalCounterpartyKind(partyType),
        unitType: internal ? normalizedInternalUnitType(partyType) : null,
        name,
        isActive: field("isActive")?.value !== "false"
      };
    }

    function tradingCounterpartyFromRow(row, reportValidity = false) {
      const field = name => row.querySelector(`[data-trading-counterparty-field='${name}']`);
      const codeInput = field("counterpartyCode");
      const nameInput = field("counterpartyName");
      const counterpartyScope = activeTradingCounterpartyScope;
      const internal = counterpartyScope === "INTERNAL";
      const partyType = field("partyType")?.value;
      const clientCodeType = internal ? "INTERNAL_UNIT_CODE" : normalizedClientCodeType(field("businessIdType")?.value);
      const inn = clientCodeType === "INN"
        ? codeInput.value.trim()
        : normalizedContextCode(codeInput.value);
      const name = nameInput.value.trim();

      codeInput.value = inn;
      codeInput.setCustomValidity(isValidClientCodeForType(inn, clientCodeType)
        ? ""
        : clientCodeType === "INN"
          ? "Business ID with type INN must contain 10 to 12 digits."
          : "Business ID must contain 2 to 20 letters, digits, '_' or '-'.");
      nameInput.setCustomValidity(name.length >= 1 && name.length <= 200
        ? ""
        : "Counterparty Name must contain from 1 to 200 characters.");

      const invalidControl = row.querySelector(":invalid");

      if (invalidControl) {
        if (reportValidity) {
          invalidControl.reportValidity();
        }
        return null;
      }

      return {
        counterpartyId: null,
        counterpartyScope,
        counterpartyRoles: [normalizedCounterpartyType(field("counterpartyType")?.value)],
        counterpartyType: normalizedCounterpartyType(field("counterpartyType")?.value),
        inn,
        clientCodeType,
        externalCounterpartyKind: internal ? null : normalizedExternalCounterpartyKind(partyType),
        unitType: internal ? normalizedInternalUnitType(partyType) : null,
        name,
        isActive: field("isActive")?.value !== "false"
      };
    }

    function tradingCounterpartyDuplicateIndex(profile, ignoredIndex = -1) {
      const scope = normalizedCounterpartyScope(profile?.counterpartyScope);

      return clientProfiles.findIndex((candidate, index) => {
        if (index === ignoredIndex || normalizedCounterpartyScope(candidate.counterpartyScope) !== scope) {
          return false;
        }

        if (scope === "INTERNAL") {
          return candidate.inn.toUpperCase() === profile.inn.toUpperCase();
        }

        return normalizedClientCodeType(candidate.clientCodeType) === normalizedClientCodeType(profile.clientCodeType)
          && candidate.inn.toUpperCase() === profile.inn.toUpperCase();
      });
    }

    function updateTradingCounterpartyRowSaveAvailability(row) {
      const button = row.querySelector("[data-profile-action='save']");
      const profile = tradingCounterpartyDraftFromRow(row);

      if (!profile) {
        setSaveButtonAvailability(button, false, "Complete required fields before saving");
        return;
      }

      const duplicateIndex = tradingCounterpartyDuplicateIndex(profile);

      if (duplicateIndex !== -1) {
        setSaveButtonAvailability(button, false, "Business ID already exists for this Business ID Type");
        return;
      }

      setSaveButtonAvailability(button, true);
    }

    function startTradingCounterpartyRowCreate() {
      tradingCounterpartyRowEditState = { mode: "create" };
      setClientProfileStatus("");
      renderClientProfiles();
    }

    function cancelTradingCounterpartyRowEdit() {
      tradingCounterpartyRowEditState = null;
      setClientProfileStatus("");
      renderClientProfiles();
    }

    async function saveTradingCounterpartyFromRow(row) {
      if (!tradingCounterpartyRowEditState) {
        return;
      }

      let profile = tradingCounterpartyFromRow(row, true);

      if (!profile) {
        return;
      }

      const duplicateIndex = tradingCounterpartyDuplicateIndex(profile);

      if (duplicateIndex !== -1) {
        const codeInput = row.querySelector("[data-trading-counterparty-field='counterpartyCode']");
        codeInput.setCustomValidity("Business ID already exists for this Business ID Type.");
        codeInput.reportValidity();
        return;
      }

      try {
        if (DEMO_API_ENABLED) {
          const saved = await demoApiRequest("/api/v1/trading-counterparties", {
            method: "POST",
            body: JSON.stringify(tradingCounterpartyApiPayload(profile))
          });
          profile = tradingCounterpartyFromApi(saved);
        }

        if (profile.counterpartyId === null || profile.counterpartyId === undefined || profile.counterpartyId === "") {
          const highestCounterpartyId = clientProfiles.reduce((highest, item) =>
            Math.max(highest, Number(item.counterpartyId) || 0), 0
          );
          profile = { ...profile, counterpartyId: highestCounterpartyId + 1 };
        }

        clientProfiles.push(profile);
        saveClientProfiles();
      } catch (error) {
        setClientProfileStatus(error.message || "Trading Counterparty could not be created.", "error");
        return;
      }

      tradingCounterpartyRowEditState = null;
      setClientProfileStatus(
        completedActionMessage(`Trading Counterparty "${profile.name}"`, "added"),
        "success"
      );
      renderClientProfiles();
      renderPricingRules();
    }

    function renderClientProfiles() {
      if (!clientProfileRowsEl) {
        return;
      }

      updateTradingCounterpartyIdSortControl();
      const rows = filteredClientProfiles();
      const scopedProfiles = clientProfiles.filter(profile =>
        normalizedCounterpartyScope(profile.counterpartyScope) === activeTradingCounterpartyScope
        && tradingCounterpartyMatchesRouteScope(profile)
      );
      const createRow = !clientProfileRouteScope && tradingCounterpartyRowEditState?.mode === "create"
        ? renderTradingCounterpartyCreateRow(tradingCounterpartyDefaultDraft())
        : "";
      const columnCount = clientProfileRouteScope ? 7 : 8;

      if (clientProfileRouteScope?.status === "loading") {
        clientProfileRowsEl.innerHTML = `
          <tr>
            <td class="profile-empty" colspan="${columnCount}">Loading attached Trading Counterparties...</td>
          </tr>
        `;
        scheduleSmartColumnSizing();
        return;
      }

      if (clientProfileRouteScope?.status === "error") {
        clientProfileRowsEl.innerHTML = `
          <tr>
            <td class="profile-empty" colspan="${columnCount}">Attached Trading Counterparties could not be loaded.</td>
          </tr>
        `;
        scheduleSmartColumnSizing();
        return;
      }

      if (scopedProfiles.length === 0 && !createRow) {
        const emptyLabel = clientProfileRouteScope
          ? `No attached ${activeTradingCounterpartyScope === "INTERNAL" ? "internal units" : "external counterparties"} for this Execution Context.`
          : `No ${activeTradingCounterpartyScope === "INTERNAL" ? "internal units" : "external counterparties"} yet.`;
        clientProfileRowsEl.innerHTML = `
          <tr>
            <td class="profile-empty" colspan="${columnCount}">${emptyLabel}</td>
          </tr>
        `;
        scheduleSmartColumnSizing();
        return;
      }

      if (rows.length === 0 && !createRow) {
        clientProfileRowsEl.innerHTML = `
          <tr>
            <td class="profile-empty" colspan="${columnCount}">No trading counterparties match the current filters.</td>
          </tr>
        `;
        scheduleSmartColumnSizing();
        return;
      }

      clientProfileRowsEl.innerHTML = [
        createRow,
        ...rows.map(({ profile, index }) => renderTradingCounterpartyViewRow(profile, index))
      ].join("");
      clientProfileRowsEl
        .querySelectorAll("[data-trading-counterparty-edit-row]")
        .forEach(updateTradingCounterpartyRowSaveAvailability);
      scheduleSmartColumnSizing();
    }

    function startClientProfileCreate() {
      editingClientProfileIndex = null;
      clientPricingRuleEditState = null;
      clientProfileForm.reset();
      const defaultRole = tradingCounterpartyScopeDefaultRole(activeTradingCounterpartyScope);
      syncTradingCounterpartyFormScope(activeTradingCounterpartyScope);
      setTradingCounterpartyFormRoles([defaultRole], defaultRole);
      clientProfileForm.elements.isActive.checked = true;
      clearClientProfileFormValidity();
      clientProfileFormTitle.textContent = "General Details";
      setClientProfilePageHeading(activeTradingCounterpartyScope === "INTERNAL"
        ? "New Internal Unit"
        : "New External Counterparty");
      clientProfileSubmitButton.querySelector("span:last-child").textContent = "Add counterparty";
      clientProfileSubmitButton.querySelector(".button-icon").textContent = "add";
      updateClientProfileDeleteAvailability();
      showClientProfileCard(true);
      renderClientExecutionContextsPanel(null);
      renderClientPricingRulesPanel(null);
      setClientProfileStatus("");
      renderClientProfiles();
      updateClientProfileSubmitAvailability();
    }

    function startClientProfileEdit(index) {
      const profile = clientProfiles[index];

      if (!profile) {
        return;
      }

      editingClientProfileIndex = index;
      clientPricingRuleEditState = null;
      setTradingCounterpartyScopeTab(profile.counterpartyScope);
      clientProfileForm.reset();
      syncTradingCounterpartyFormScope(
        profile.counterpartyScope,
        normalizedCounterpartyScope(profile.counterpartyScope) === "INTERNAL"
          ? profile.unitType
          : profile.externalCounterpartyKind
      );
      if (normalizedCounterpartyScope(profile.counterpartyScope) === "EXTERNAL") {
        setClientProfileCodeTypeOptions(profile.clientCodeType);
      }
      setTradingCounterpartyFormRoles(profile.counterpartyRoles, profile.counterpartyType);
      clientProfileForm.elements.clientName.value = profile.name;
      clientProfileForm.elements.inn.value = profile.inn;
      clientProfileForm.elements.isActive.checked = profile.isActive;
      clientProfileFormTitle.textContent = "General Details";
      setClientProfilePageHeading(profile.name);
      clientProfileSubmitButton.querySelector("span:last-child").textContent = "Save changes";
      clientProfileSubmitButton.querySelector(".button-icon").textContent = "save";
      updateClientProfileSubmitAvailability();
      updateClientProfileDeleteAvailability();
      showClientProfileCard(true);
      renderClientExecutionContextsPanel(profile);
      renderClientPricingRulesPanel(profile);
      refreshTradingCounterpartyExecutionContexts(profile);
      setClientProfileStatus("");
      renderClientProfiles();
    }

    async function removeClientProfile(index) {
      const profile = clientProfiles[index];
      const routeState = clientProfileRouteStateFromLocation();
      const removesOpenProfile = routeState.mode === "detail"
        && routeState.counterpartyId === String(profile?.counterpartyId ?? "");

      if (!profile) {
        return;
      }

      if (clientPricingRulesForInn(profile.inn).length > 0) {
        setClientProfileStatus("Trading Counterparty cannot be deleted while Pricing Rules exist for this Counterparty Code.", "error");
        return;
      }

      if (clientProfiles.length <= 1) {
        setClientProfileStatus("At least one Trading Counterparty is required.", "error");
        return;
      }

      try {
        if (DEMO_API_ENABLED) {
          await demoApiRequest(`/api/v1/trading-counterparties/${encodeURIComponent(profile.counterpartyId)}`, {
            method: "DELETE"
          });
        }

        clientProfiles.splice(index, 1);
        saveClientProfiles();
      } catch (error) {
        setClientProfileStatus(error.message || "Trading Counterparty could not be deleted.", "error");
        return;
      }

      if (editingClientProfileIndex === index || editingClientProfileIndex === null) {
        resetClientProfileForm();
      } else if (editingClientProfileIndex > index) {
        editingClientProfileIndex -= 1;
      }

      if (removesOpenProfile) {
        replaceClientProfileRoute();
        syncClientProfileRouteView();
      }

      setClientProfileStatus(
        completedActionMessage(`Trading Counterparty "${profile.name}"`, "removed"),
        "success"
      );
      renderClientProfiles();
    }

    function updateClientProfileDeleteAvailability() {
      const profile = editingClientProfileIndex === null
        ? null
        : clientProfiles[editingClientProfileIndex];
      clientProfileDeleteButton.hidden = !profile;

      if (!profile) {
        clientProfileDeleteButton.disabled = false;
        clientProfileDeleteButton.title = "";
        return;
      }

      const pricingRuleCount = clientPricingRulesForInn(profile.inn).length;
      const deleteLocked = pricingRuleCount > 0 || clientProfiles.length <= 1;
      clientProfileDeleteButton.disabled = deleteLocked;
      clientProfileDeleteButton.title = pricingRuleCount > 0
        ? `Used by ${pricingRuleCount} ${pricingRuleCount === 1 ? "Pricing Rule" : "Pricing Rules"}`
        : clientProfiles.length <= 1
          ? "At least one Trading Counterparty is required"
          : "Delete counterparty";
    }

    async function saveClientProfileFromForm(event) {
      event.preventDefault();

      let profile = profileFromClientProfileForm();

      if (!profile) {
        return;
      }

      if (editingClientProfileIndex === null) {
        try {
          if (DEMO_API_ENABLED) {
            const saved = await demoApiRequest("/api/v1/trading-counterparties", {
              method: "POST",
              body: JSON.stringify(tradingCounterpartyApiPayload(profile))
            });
            profile = tradingCounterpartyFromApi(saved);
          }

          if (profile.counterpartyId === null || profile.counterpartyId === undefined || profile.counterpartyId === "") {
            const highestCounterpartyId = clientProfiles.reduce((highest, item) =>
              Math.max(highest, Number(item.counterpartyId) || 0), 0
            );
            profile = { ...profile, counterpartyId: highestCounterpartyId + 1 };
          }

          const newIndex = clientProfiles.length;
          clientProfiles.push(profile);
          saveClientProfiles();
          replaceClientProfileRoute(profile.counterpartyId);
          startClientProfileEdit(newIndex);
          setClientProfileStatus(
            completedActionMessage(`Trading Counterparty "${profile.name}"`, "added"),
            "success"
          );
        } catch (error) {
          setClientProfileStatus(error.message || "Trading Counterparty could not be created.", "error");
        }
      } else {
        if (!clientProfileFormHasChanges()) {
          updateClientProfileSubmitAvailability();
          return;
        }

        const savedIndex = editingClientProfileIndex;
        const previousInn = clientProfiles[savedIndex]?.inn;

        try {
          if (DEMO_API_ENABLED) {
            const saved = await demoApiRequest(
              `/api/v1/trading-counterparties/${encodeURIComponent(clientProfiles[savedIndex].counterpartyId)}`,
              { method: "PUT", body: JSON.stringify(tradingCounterpartyApiPayload(profile)) }
            );
            profile = tradingCounterpartyFromApi(saved);
          }

          clientProfiles[savedIndex] = profile;
          saveClientProfiles();
        } catch (error) {
          setClientProfileStatus(error.message || "Trading Counterparty could not be saved.", "error");
          return;
        }

        if (previousInn && previousInn !== profile.inn) {
          clientPricingRules = normalizedClientPricingRules(
            clientPricingRules.map(rule => rule.inn === previousInn
              ? {
                  ...rule,
                  counterpartyId: profile.counterpartyId,
                  inn: profile.inn,
                  pricingRuleId: rule.pricingRuleId
                }
              : rule
            ),
            []
          );
          saveClientPricingRules();
        }

        startClientProfileEdit(savedIndex);
        setClientProfileStatus(
          completedActionMessage(`Trading Counterparty "${profile.name}"`, "saved"),
          "success"
        );
      }
    }

    function setProfileWorkspaceView(view) {
      const usersVisible = view === "users";

      clientProfileTopbar.hidden = usersVisible;
      tradingCounterpartyScopeTabs.hidden = usersVisible;
      clientProfileLayout.hidden = usersVisible;
      usersView.hidden = !usersVisible;
    }

    function setUsersStatus(message, tone = "") {
      setWorkbenchPageStatus(usersStatusEl, message, tone);
    }

    function selectedUser() {
      return Number.isInteger(editingUserIndex) ? users[editingUserIndex] : null;
    }

    function setUsersPageHeading(title, subtitle = "") {
      usersPageTitle.textContent = title;
      usersPageSubtitle.textContent = subtitle;
      usersPageSubtitle.hidden = !subtitle;
      document.title = title === "Users" ? title : `${title} - Users`;
    }

    function setUsersRouteVisibility(detailVisible) {
      usersListView.hidden = detailVisible;
      usersDetailView.hidden = !detailVisible;
      usersBackButton.hidden = !detailVisible;
      usersLayout.classList.toggle("is-detail-view", detailVisible);
    }

    function showUsersCard(visible) {
      usersForm.hidden = !visible;
      usersDetailHint.hidden = visible;
    }

    function clearUsersFormValidity() {
      Array.from(usersForm.elements).forEach(element => {
        if (typeof element.setCustomValidity === "function") {
          element.setCustomValidity("");
        }
      });
    }

    function resetUsersForm() {
      editingUserIndex = null;
      usersForm.reset();
      usersForm.elements.userRole.value = "DEALER";
      usersForm.elements.active.checked = true;
      clearUsersFormValidity();
      usersFormTitle.textContent = "User";
      usersSubmitButton.querySelector("span:last-child").textContent = "Save user";
      usersSubmitButton.querySelector(".button-icon").textContent = "save";
      usersSubmitButton.disabled = false;
      usersSubmitButton.title = "";
      usersDeleteButton.hidden = true;
      showUsersCard(false);
    }

    function userFromUsersForm(reportValidity = false) {
      const userCodeInput = usersForm.elements.userCode;
      const firstNameInput = usersForm.elements.firstName;
      const lastNameInput = usersForm.elements.lastName;
      const userCode = userCodeInput.value.trim().toUpperCase();
      const firstName = firstNameInput.value.trim();
      const lastName = lastNameInput.value.trim();
      const userRole = usersForm.elements.userRole.value.trim().toUpperCase();

      userCodeInput.value = userCode;
      userCodeInput.setCustomValidity(
        /^[A-Z0-9._-]{2,30}$/.test(userCode)
          ? ""
          : "Use 2 to 30 uppercase letters, digits, dots, underscores or hyphens."
      );
      firstNameInput.setCustomValidity(
        firstName.length >= 1 && firstName.length <= 50
          ? ""
          : "First Name must contain from 1 to 50 characters."
      );
      lastNameInput.setCustomValidity(
        lastName.length >= 1 && lastName.length <= 50
          ? ""
          : "Last Name must contain from 1 to 50 characters."
      );

      const valid = userCodeInput.checkValidity()
        && firstNameInput.checkValidity()
        && lastNameInput.checkValidity()
        && USER_ROLES.includes(userRole);

      if (!valid) {
        if (reportValidity) {
          usersForm.reportValidity();
        }
        return null;
      }

      return {
        userId: selectedUser()?.userId ?? null,
        userCode,
        firstName,
        lastName,
        userRole,
        active: usersForm.elements.active.checked
      };
    }

    function usersFormHasChanges() {
      const existing = selectedUser();

      if (!existing) {
        return true;
      }

      const current = {
        userCode: usersForm.elements.userCode.value.trim().toUpperCase(),
        firstName: usersForm.elements.firstName.value.trim(),
        lastName: usersForm.elements.lastName.value.trim(),
        userRole: usersForm.elements.userRole.value.trim().toUpperCase(),
        active: usersForm.elements.active.checked
      };

      return current.userCode !== existing.userCode
        || current.firstName !== existing.firstName
        || current.lastName !== existing.lastName
        || current.userRole !== existing.userRole
        || current.active !== existing.active;
    }

    function updateUsersSubmitAvailability() {
      const userCode = usersForm.elements.userCode.value.trim().toUpperCase();
      const firstName = usersForm.elements.firstName.value.trim();
      const lastName = usersForm.elements.lastName.value.trim();
      const userRole = usersForm.elements.userRole.value.trim().toUpperCase();
      const complete = /^[A-Z0-9._-]{2,30}$/.test(userCode)
        && firstName.length >= 1
        && firstName.length <= 50
        && lastName.length >= 1
        && lastName.length <= 50
        && USER_ROLES.includes(userRole);
      const noChanges = editingUserIndex !== null && !usersFormHasChanges();

      usersSubmitButton.disabled = !complete || noChanges;
      usersSubmitButton.title = noChanges
        ? "No changes to save"
        : complete
          ? ""
          : "Complete required fields before saving";
    }

    function usersHeaderFilterValue(field) {
      return usersHeaderFilterControls
        .find(control => control.dataset.userHeaderFilter === field)
        ?.value.trim() || "";
    }

    function filteredUsers() {
      const userIdFilter = usersHeaderFilterValue("userId");
      const userCodeFilter = usersHeaderFilterValue("userCode").toLowerCase();
      const firstNameFilter = usersHeaderFilterValue("firstName").toLowerCase();
      const lastNameFilter = usersHeaderFilterValue("lastName").toLowerCase();
      const userRoleFilter = usersHeaderFilterValue("userRole");
      const activeFilter = usersHeaderFilterValue("active");
      const direction = usersIdSortDirection === "desc" ? -1 : 1;

      return users
        .map((item, index) => ({ user: item, index }))
        .filter(({ user }) => {
          const active = user.active ? "true" : "false";

          return (!userIdFilter || String(user.userId ?? "").includes(userIdFilter))
            && (!userCodeFilter || user.userCode.toLowerCase().includes(userCodeFilter))
            && (!firstNameFilter || user.firstName.toLowerCase().includes(firstNameFilter))
            && (!lastNameFilter || user.lastName.toLowerCase().includes(lastNameFilter))
            && (!userRoleFilter || user.userRole === userRoleFilter)
            && (!activeFilter || active === activeFilter);
        })
        .sort((left, right) => {
          const leftId = Number(left.user.userId);
          const rightId = Number(right.user.userId);

          return direction * (leftId - rightId);
        });
    }

    function updateUsersIdSortControl() {
      updateReferenceDataIdSortControl(
        usersIdHeader,
        usersIdSortButton,
        usersIdSortDirection,
        "users"
      );
    }

    function userRowEditStateIndex() {
      return userRowEditState?.mode === "edit" ? userRowEditState.index : null;
    }

    function userDefaultDraft() {
      return {
        userId: null,
        userCode: "",
        firstName: "",
        lastName: "",
        userRole: "DEALER",
        active: true
      };
    }

    function userRoleOptions(selectedValue = "DEALER") {
      const selected = String(selectedValue || "").trim().toUpperCase();

      return USER_ROLES
        .map(value => `<option value="${escapeHtml(value)}" ${value === selected ? "selected" : ""}>${escapeHtml(value)}</option>`)
        .join("");
    }

    function renderUserEditRow(item, index) {
      const indexAttribute = index === null ? "" : ` data-user-index="${index}"`;

      return `
        <tr class="is-selected is-editing"${indexAttribute} data-user-edit-row>
          <td>${escapeHtml(item.userId ?? "")}</td>
          <td><input class="inline-edit-control" type="text" data-user-field="userCode" value="${escapeHtml(item.userCode)}" maxlength="30" pattern="[A-Z0-9._-]{2,30}" required></td>
          <td><input class="inline-edit-control" type="text" data-user-field="firstName" value="${escapeHtml(item.firstName)}" maxlength="50" required></td>
          <td><input class="inline-edit-control" type="text" data-user-field="lastName" value="${escapeHtml(item.lastName)}" maxlength="50" required></td>
          <td><select class="inline-edit-control" data-user-field="userRole" required>${userRoleOptions(item.userRole)}</select></td>
          <td><select class="inline-edit-control" data-user-field="active">${activeBooleanOptions(item.active)}</select></td>
          <td class="profile-actions-cell">
            <span class="profile-row-actions">
              <button type="button" class="btn btn-sm btn-outline-primary reference-grid-action" data-user-action="save" aria-label="Save User" title="Save">
                <span class="button-icon" aria-hidden="true">save</span>
              </button>
              <button type="button" class="btn btn-sm btn-outline-secondary reference-grid-action" data-user-action="cancel" aria-label="Cancel editing" title="Cancel">
                <span class="button-icon" aria-hidden="true">close</span>
              </button>
            </span>
          </td>
        </tr>
      `;
    }

    function renderUserViewRow(item, index) {
      return `
        <tr data-user-index="${index}">
          <td>${escapeHtml(item.userId ?? "")}</td>
          <td>${escapeHtml(item.userCode)}</td>
          <td>${escapeHtml(item.firstName)}</td>
          <td>${escapeHtml(item.lastName)}</td>
          <td>${escapeHtml(item.userRole)}</td>
          <td>${activeBooleanTokenMarkup(item.active)}</td>
          <td class="profile-actions-cell">
            <span class="profile-row-actions">
              <button type="button" class="btn btn-sm btn-outline-secondary reference-grid-action" data-user-action="edit" data-user-index="${index}" aria-label="Edit ${escapeHtml(item.userCode)}">
                <span class="button-icon" aria-hidden="true">edit</span>
              </button>
              <button type="button" class="btn btn-sm btn-outline-danger reference-grid-action" data-user-action="remove" data-user-index="${index}" aria-label="Delete ${escapeHtml(item.userCode)}">
                <span class="button-icon" aria-hidden="true">delete</span>
              </button>
            </span>
          </td>
        </tr>
      `;
    }

    function userDraftFromRow(row) {
      const field = name => row.querySelector(`[data-user-field='${name}']`);
      const userCode = field("userCode")?.value.trim().toUpperCase() || "";
      const firstName = field("firstName")?.value.trim() || "";
      const lastName = field("lastName")?.value.trim() || "";
      const userRole = field("userRole")?.value.trim().toUpperCase() || "";

      if (!/^[A-Z0-9._-]{2,30}$/.test(userCode)
        || firstName.length < 1
        || firstName.length > 50
        || lastName.length < 1
        || lastName.length > 50
        || !USER_ROLES.includes(userRole)) {
        return null;
      }

      return {
        userId: userRowEditStateIndex() === null
          ? null
          : users[userRowEditStateIndex()]?.userId ?? null,
        userCode,
        firstName,
        lastName,
        userRole,
        active: field("active")?.value !== "false"
      };
    }

    function userFromRow(row, reportValidity = false) {
      const field = name => row.querySelector(`[data-user-field='${name}']`);
      const userCodeInput = field("userCode");
      const firstNameInput = field("firstName");
      const lastNameInput = field("lastName");
      const userCode = userCodeInput.value.trim().toUpperCase();
      const firstName = firstNameInput.value.trim();
      const lastName = lastNameInput.value.trim();
      const userRole = field("userRole")?.value.trim().toUpperCase() || "";

      userCodeInput.value = userCode;
      userCodeInput.setCustomValidity(/^[A-Z0-9._-]{2,30}$/.test(userCode)
        ? ""
        : "Use 2 to 30 uppercase letters, digits, dots, underscores or hyphens.");
      firstNameInput.setCustomValidity(firstName.length >= 1 && firstName.length <= 50
        ? ""
        : "First Name must contain from 1 to 50 characters.");
      lastNameInput.setCustomValidity(lastName.length >= 1 && lastName.length <= 50
        ? ""
        : "Last Name must contain from 1 to 50 characters.");

      const invalidControl = row.querySelector(":invalid");

      if (invalidControl || !USER_ROLES.includes(userRole)) {
        if (reportValidity) {
          invalidControl?.reportValidity();
        }
        return null;
      }

      return {
        userId: userRowEditStateIndex() === null
          ? null
          : users[userRowEditStateIndex()]?.userId ?? null,
        userCode,
        firstName,
        lastName,
        userRole,
        active: field("active")?.value !== "false"
      };
    }

    function sameUser(left, right) {
      return Boolean(left && right)
        && left.userCode === right.userCode
        && left.firstName === right.firstName
        && left.lastName === right.lastName
        && left.userRole === right.userRole
        && left.active === right.active;
    }

    function updateUserRowSaveAvailability(row) {
      const button = row.querySelector("[data-user-action='save']");
      const item = userDraftFromRow(row);

      if (!item) {
        setSaveButtonAvailability(button, false, "Complete required fields before saving");
        return;
      }

      const currentIndex = userRowEditStateIndex();
      const duplicateIndex = users.findIndex((candidate, index) =>
        index !== currentIndex && candidate.userCode.toUpperCase() === item.userCode
      );

      if (duplicateIndex !== -1) {
        setSaveButtonAvailability(button, false, "User Code already exists");
        return;
      }

      const existing = currentIndex === null ? null : users[currentIndex];
      setSaveButtonAvailability(button, currentIndex === null || !sameUser(item, existing));
    }

    function startUserRowCreate() {
      userRowEditState = { mode: "create" };
      setUsersStatus("");
      renderUsers();
    }

    function startUserRowEdit(index) {
      if (!users[index]) {
        return;
      }

      userRowEditState = { mode: "edit", index };
      setUsersStatus("");
      renderUsers();
    }

    function cancelUserRowEdit() {
      userRowEditState = null;
      setUsersStatus("");
      renderUsers();
    }

    async function saveUserFromRow(row) {
      if (!userRowEditState) {
        return;
      }

      let item = userFromRow(row, true);

      if (!item) {
        return;
      }

      const currentIndex = userRowEditStateIndex();
      const duplicateIndex = users.findIndex((candidate, index) =>
        index !== currentIndex && candidate.userCode.toUpperCase() === item.userCode
      );

      if (duplicateIndex !== -1) {
        const userCodeInput = row.querySelector("[data-user-field='userCode']");
        userCodeInput.setCustomValidity("User Code already exists.");
        userCodeInput.reportValidity();
        return;
      }

      try {
        if (DEMO_API_ENABLED) {
          const saved = await demoApiRequest(
            currentIndex === null
              ? "/api/v1/users"
              : `/api/v1/users/${encodeURIComponent(users[currentIndex].userId)}`,
            {
              method: currentIndex === null ? "POST" : "PUT",
              body: JSON.stringify(userApiPayload(item))
            }
          );
          item = userFromApi(saved);
        }

        if (currentIndex === null) {
          if (!item.userId) {
            const highestUserId = users.reduce((highest, candidate) =>
              Math.max(highest, Number(candidate.userId) || 0), 0
            );
            item = { ...item, userId: highestUserId + 1 };
          }
          users.push(item);
        } else {
          users[currentIndex] = item;
        }
        saveUsers();
      } catch (error) {
        setUsersStatus(
          error.message || `User could not be ${currentIndex === null ? "created" : "saved"}.`,
          "error"
        );
        return;
      }

      userRowEditState = null;
      setUsersStatus(
        completedActionMessage(
          `User "${item.firstName} ${item.lastName}"`,
          currentIndex === null ? "added" : "saved"
        ),
        "success"
      );
      renderUsers();
    }

    function renderUsers() {
      updateUsersIdSortControl();
      const rows = filteredUsers();
      const createRow = userRowEditState?.mode === "create"
        ? renderUserEditRow(userDefaultDraft(), null)
        : "";

      if (users.length === 0 && !createRow) {
        usersRowsEl.innerHTML = `
          <tr>
            <td class="profile-empty" colspan="7">No users yet.</td>
          </tr>
        `;
        return;
      }

      if (rows.length === 0 && !createRow) {
        usersRowsEl.innerHTML = `
          <tr>
            <td class="profile-empty" colspan="7">No users match the current filters.</td>
          </tr>
        `;
        return;
      }

      usersRowsEl.innerHTML = [
        createRow,
        ...rows.map(({ user, index }) =>
          userRowEditState?.mode === "edit" && userRowEditState.index === index
            ? renderUserEditRow(user, index)
            : renderUserViewRow(user, index)
        )
      ].join("");
      usersRowsEl
        .querySelectorAll("[data-user-edit-row]")
        .forEach(updateUserRowSaveAvailability);
      scheduleSmartColumnSizing();
    }

    function startUserCreate() {
      editingUserIndex = null;
      usersForm.reset();
      usersForm.elements.userRole.value = "DEALER";
      usersForm.elements.active.checked = true;
      clearUsersFormValidity();
      usersFormTitle.textContent = "General Details";
      setUsersPageHeading("New User");
      usersSubmitButton.querySelector("span:last-child").textContent = "Add user";
      usersSubmitButton.querySelector(".button-icon").textContent = "person_add";
      usersDeleteButton.hidden = true;
      showUsersCard(true);
      setUsersStatus("");
      renderUsers();
      updateUsersSubmitAvailability();
    }

    function startUserEdit(index) {
      const item = users[index];

      if (!item) {
        return;
      }

      editingUserIndex = index;
      usersForm.elements.userCode.value = item.userCode;
      usersForm.elements.firstName.value = item.firstName;
      usersForm.elements.lastName.value = item.lastName;
      usersForm.elements.userRole.value = item.userRole;
      usersForm.elements.active.checked = item.active;
      clearUsersFormValidity();
      usersFormTitle.textContent = "General Details";
      setUsersPageHeading(`${item.firstName} ${item.lastName}`, `${item.userRole} / ${item.userCode}`);
      usersSubmitButton.querySelector("span:last-child").textContent = "Save changes";
      usersSubmitButton.querySelector(".button-icon").textContent = "save";
      usersDeleteButton.hidden = false;
      showUsersCard(true);
      setUsersStatus("");
      updateUsersSubmitAvailability();
      renderUsers();
    }

    function replaceUsersRoute(userId = "") {
      const route = usersRoute(userId);

      history.replaceState(null, "", `${location.pathname}${location.search}${route}`);
    }

    function navigateToUsersRoute(userId = "") {
      const route = usersRoute(userId);

      if (location.hash === route) {
        syncUsersRouteView();
        renderUsers();
        return;
      }

      location.hash = route;
    }

    function navigateToUserIndex(index) {
      const item = users[index];

      if (item) {
        navigateToUsersRoute(item.userId);
      }
    }

    function syncUsersRouteView() {
      const routeState = usersRouteStateFromLocation();

      setUsersRouteVisibility(false);
      resetUsersForm();
      setUsersPageHeading("Users");

      if (routeState.mode === "list") {
        userRowEditState = null;
        setUsersStatus("");
        return;
      }

      if (routeState.mode === "create") {
        replaceUsersRoute();
        startUserRowCreate();
        return;
      }

      const index = users.findIndex(item => String(item.userId ?? "") === routeState.userId);

      if (index >= 0) {
        replaceUsersRoute();
        startUserRowEdit(index);
        return;
      }

      replaceUsersRoute();
      setUsersStatus(`User ID ${routeState.userId} was not found.`, "error");
    }

    async function removeUser(index) {
      const item = users[index];

      if (!item) {
        return;
      }

      try {
        if (DEMO_API_ENABLED) {
          await demoApiRequest(`/api/v1/users/${encodeURIComponent(item.userId)}`, {
            method: "DELETE"
          });
        }

        users.splice(index, 1);
        saveUsers();
      } catch (error) {
        setUsersStatus(error.message || "User could not be deleted.", "error");
        return;
      }

      if (editingUserIndex === index) {
        replaceUsersRoute();
        syncUsersRouteView();
      } else if (editingUserIndex > index) {
        editingUserIndex -= 1;
      }

      if (userRowEditState?.mode === "edit") {
        if (userRowEditState.index === index) {
          userRowEditState = null;
        } else if (userRowEditState.index > index) {
          userRowEditState.index -= 1;
        }
      }

      setUsersStatus(
        completedActionMessage(`User "${item.firstName} ${item.lastName}"`, "removed"),
        "success"
      );
      renderUsers();
    }

    async function saveUserFromForm(event) {
      event.preventDefault();

      let item = userFromUsersForm(true);

      if (!item) {
        return;
      }

      if (editingUserIndex === null) {
        try {
          if (DEMO_API_ENABLED) {
            const saved = await demoApiRequest("/api/v1/users", {
              method: "POST",
              body: JSON.stringify(userApiPayload(item))
            });
            item = userFromApi(saved);
          }

          if (!item.userId) {
            const highestUserId = users.reduce((highest, candidate) =>
              Math.max(highest, Number(candidate.userId) || 0), 0
            );
            item = { ...item, userId: highestUserId + 1 };
          }

          const newIndex = users.length;
          users.push(item);
          saveUsers();
          replaceUsersRoute(item.userId);
          startUserEdit(newIndex);
          setUsersStatus(
            completedActionMessage(`User "${item.firstName} ${item.lastName}"`, "added"),
            "success"
          );
        } catch (error) {
          setUsersStatus(error.message || "User could not be created.", "error");
        }
        return;
      }

      if (!usersFormHasChanges()) {
        updateUsersSubmitAvailability();
        return;
      }

      const savedIndex = editingUserIndex;

      try {
        if (DEMO_API_ENABLED) {
          const saved = await demoApiRequest(
            `/api/v1/users/${encodeURIComponent(users[savedIndex].userId)}`,
            { method: "PUT", body: JSON.stringify(userApiPayload(item)) }
          );
          item = userFromApi(saved);
        }

        users[savedIndex] = item;
        saveUsers();
        startUserEdit(savedIndex);
        setUsersStatus(
          completedActionMessage(`User "${item.firstName} ${item.lastName}"`, "saved"),
          "success"
        );
      } catch (error) {
        setUsersStatus(error.message || "User could not be saved.", "error");
      }
    }

    function setPricingContextStatus(message, tone = "") {
      setWorkbenchPageStatus(pricingContextStatusEl, message, tone);
    }

    function pricingContextEditStateIndex() {
      return pricingContextEditState?.mode === "edit" ? pricingContextEditState.index : null;
    }

    function firstActiveReferenceValue(items, valueKey) {
      const activeItem = items.find(item => item.isActive !== false);
      return activeItem?.[valueKey] || items[0]?.[valueKey] || "";
    }

    function firstActiveServicingBranchCode() {
      return firstActiveReferenceValue(servicingBranches, "servicingBranchCode");
    }

    function firstActiveSettlementSystemId() {
      return firstActiveReferenceValue(settlementSystems, "settlementSystemId");
    }

    function firstActiveTradeCaptureChannelId() {
      return firstActiveReferenceValue(tradeCaptureChannels, "tradeCaptureChannelId");
    }

    function isSelectableAccountingSystemId(value) {
      return value === NOT_APPLICABLE_ACCOUNTING_SYSTEM_ID ||
        settlementSystems.some(item => item.settlementSystemId === value);
    }

    function referenceSelectOptions(items, selectedValue, valueKey, labelForItem = item => item[valueKey]) {
      const selected = String(selectedValue ?? "");
      const options = [`<option value="" ${selected ? "" : "selected"}></option>`];

      options.push(...items
        .filter(item => item.isActive !== false || item[valueKey] === selected)
        .map(item => {
          const value = item[valueKey];
          const label = labelForItem(item);

          return `<option value="${escapeHtml(value)}" ${value === selected ? "selected" : ""}>${escapeHtml(label)}</option>`;
        }));

      if (selected && !items.some(item => item[valueKey] === selected)) {
        options.unshift(`<option value="${escapeHtml(selected)}" selected>${escapeHtml(selected)}</option>`);
      }

      return options.join("");
    }

    function accountingSystemSelectOptions(selectedValue) {
      const selectableItems = [
        {
          settlementSystemId: NOT_APPLICABLE_ACCOUNTING_SYSTEM_ID,
          settlementSystemName: "Not Applicable",
          isActive: true
        },
        ...settlementSystems.filter(item => item.settlementSystemId !== NOT_APPLICABLE_ACCOUNTING_SYSTEM_ID)
      ];

      return referenceSelectOptions(
        selectableItems,
        selectedValue,
        "settlementSystemId",
        item => item.settlementSystemName
      );
    }

    function pricingContextDefaultDraft() {
      return {
        servicingBranchCode: "",
        settlementSystemId: "",
        tradeCaptureChannelId: "",
        defaultPositionManagementMode: "MANUAL",
        autoHedgingAdmissionMode: "MANUAL_ONLY"
      };
    }

    function samePricingContextIdentity(left, right) {
      return Boolean(left && right) &&
        left.servicingBranchCode === right.servicingBranchCode &&
        left.settlementSystemId === right.settlementSystemId &&
        left.tradeCaptureChannelId === right.tradeCaptureChannelId;
    }

    function samePricingContext(left, right) {
      return samePricingContextIdentity(left, right) &&
        normalizedPositionManagementMode(left.defaultPositionManagementMode) ===
          normalizedPositionManagementMode(right.defaultPositionManagementMode) &&
        normalizedAutoHedgingAdmissionMode(left.autoHedgingAdmissionMode) ===
          normalizedAutoHedgingAdmissionMode(right.autoHedgingAdmissionMode);
    }

    function pricingContextRowControl(row, name) {
      return row.querySelector(`[data-pricing-context-field="${name}"]`);
    }

    function pricingContextDraftFromRow(row) {
      const servicingBranchCode = pricingContextRowControl(row, "servicingBranchCode")?.value.trim() || "";
      const settlementSystemId = normalizedContextCode(pricingContextRowControl(row, "settlementSystemId")?.value);
      const tradeCaptureChannelId = normalizedContextCode(pricingContextRowControl(row, "tradeCaptureChannelId")?.value);
      const defaultPositionManagementMode = normalizedPositionManagementMode(
        pricingContextRowControl(row, "defaultPositionManagementMode")?.value
      );
      const autoHedgingAdmissionMode = normalizedAutoHedgingAdmissionMode(
        pricingContextRowControl(row, "autoHedgingAdmissionMode")?.value
      );

      if (!servicingBranchCode || !settlementSystemId || !tradeCaptureChannelId) {
        return null;
      }

      if (
        !servicingBranches.some(item => item.servicingBranchCode === servicingBranchCode) ||
        !isSelectableAccountingSystemId(settlementSystemId) ||
        !tradeCaptureChannels.some(item => item.tradeCaptureChannelId === tradeCaptureChannelId)
      ) {
        return null;
      }

      const currentIndex = pricingContextEditStateIndex();
      return {
        pricingContextId: currentIndex === null ? "" : pricingContexts[currentIndex]?.pricingContextId || "",
        servicingBranchCode,
        settlementSystemId,
        tradeCaptureChannelId,
        defaultPositionManagementMode,
        autoHedgingAdmissionMode
      };
    }

    function updatePricingContextRowSaveAvailability(row) {
      const button = row.querySelector("[data-pricing-context-action='save']");
      const context = pricingContextDraftFromRow(row);

      if (!context) {
        setSaveButtonAvailability(button, false, "Complete required fields before saving");
        return;
      }

      const currentIndex = pricingContextEditStateIndex();
      const duplicateIndex = pricingContexts.findIndex((item, index) =>
        index !== currentIndex && samePricingContextIdentity(item, context)
      );

      if (duplicateIndex !== -1) {
        setSaveButtonAvailability(button, false, "Execution Context already exists");
        return;
      }

      const currentContext = currentIndex === null ? null : pricingContexts[currentIndex];
      const changed = currentIndex === null || !samePricingContext(context, currentContext);
      setSaveButtonAvailability(button, changed);
    }

    function pricingContextFromRow(row) {
      const servicingLocationSelect = pricingContextRowControl(row, "servicingBranchCode");
      const accountingSystemSelect = pricingContextRowControl(row, "settlementSystemId");
      const executionSystemSelect = pricingContextRowControl(row, "tradeCaptureChannelId");
      const defaultPositionManagementModeSelect = pricingContextRowControl(row, "defaultPositionManagementMode");
      const servicingBranchCode = parseBranchCode(servicingLocationSelect);
      const autoHedgingAdmissionModeSelect = pricingContextRowControl(row, "autoHedgingAdmissionMode");
      const settlementSystemId = parseContextCode(accountingSystemSelect, "Accounting System");
      const tradeCaptureChannelId = parseContextCode(executionSystemSelect, "Execution System");
      const defaultPositionManagementMode = normalizedPositionManagementMode(
        defaultPositionManagementModeSelect?.value
      );

      const autoHedgingAdmissionMode = normalizedAutoHedgingAdmissionMode(
        autoHedgingAdmissionModeSelect?.value
      );
      if (servicingBranchCode === null || settlementSystemId === null || tradeCaptureChannelId === null) {
        updatePricingContextRowSaveAvailability(row);
        return null;
      }

      const branchExists = servicingBranches.some(item => item.servicingBranchCode === servicingBranchCode);
      const settlementExists = isSelectableAccountingSystemId(settlementSystemId);
      const channelExists = tradeCaptureChannels.some(item => item.tradeCaptureChannelId === tradeCaptureChannelId);

      servicingLocationSelect.setCustomValidity(branchExists ? "" : "Select an existing Servicing Location.");
      accountingSystemSelect.setCustomValidity(settlementExists ? "" : "Select an existing Accounting System.");
      executionSystemSelect.setCustomValidity(channelExists ? "" : "Select an existing Execution System.");

      if (!branchExists) {
        servicingLocationSelect.reportValidity();
        return null;
      }

      if (!settlementExists) {
        accountingSystemSelect.reportValidity();
        return null;
      }

      if (!channelExists) {
        executionSystemSelect.reportValidity();
        return null;
      }

      const context = {
        pricingContextId: pricingContextEditStateIndex() === null
          ? ""
          : pricingContexts[pricingContextEditStateIndex()]?.pricingContextId || "",
        servicingBranchCode,
        settlementSystemId,
        tradeCaptureChannelId,
        defaultPositionManagementMode,
        autoHedgingAdmissionMode
      };
      const currentIndex = pricingContextEditStateIndex();
      const duplicateIndex = pricingContexts.findIndex((item, index) =>
        index !== currentIndex && samePricingContextIdentity(item, context)
      );

      executionSystemSelect.setCustomValidity(duplicateIndex === -1 ? "" : "Execution Context already exists.");

      if (duplicateIndex !== -1) {
        executionSystemSelect.reportValidity();
        return null;
      }

      return context;
    }

    function ensureColumnFilterState(filterState, knownValuesMap, initializedFields, field, values) {
      const excludedValues = filterState[field];
      const knownValues = knownValuesMap[field] || [];
      const optionValues = Array.from(new Set([...knownValues, ...values])).sort((left, right) =>
        String(left).localeCompare(String(right), "en", { numeric: true, sensitivity: "base" })
      );
      const validValues = new Set(optionValues);

      Array.from(excludedValues).forEach(value => {
        if (!validValues.has(value)) {
          excludedValues.delete(value);
        }
      });

      knownValuesMap[field] = optionValues.slice();
      initializedFields.add(field);
      return optionValues;
    }

    function columnFilterExcludedCount(filterState, field, values) {
      const excludedValues = filterState[field];
      return values.filter(value => excludedValues.has(value)).length;
    }

    function isColumnFilterActive(filterState, field, values) {
      return columnFilterExcludedCount(filterState, field, values) > 0;
    }

    function columnFilterCountText(filterState, field, values) {
      const excludedCount = columnFilterExcludedCount(filterState, field, values);
      return excludedCount > 0 ? `${values.length - excludedCount} selected` : "All";
    }

    let activeColumnFilter = null;
    let columnFilterPopover = null;

    function columnFilterRuntime(scope, field) {
      if (scope === "tradingCounterparty") {
        return {
          field,
          values: tradingCounterpartyFilterValues(field),
          filterState: tradingCounterpartyFilterState,
          knownValuesMap: tradingCounterpartyFilterKnownValues,
          initializedFields: tradingCounterpartyFilterInitialized,
          label: value => String(value || "(blank)"),
          idPrefix: "filter-trading-counterparty",
          render: renderClientProfiles
        };
      }

      return null;
    }

    function ensureColumnFilterPopover() {
      if (columnFilterPopover) {
        return columnFilterPopover;
      }

      columnFilterPopover = document.createElement("span");
      columnFilterPopover.className = "reference-column-filter-menu";
      columnFilterPopover.hidden = true;
      document.body.appendChild(columnFilterPopover);
      columnFilterPopover.addEventListener("change", handleColumnFilterPopoverChange);
      columnFilterPopover.addEventListener("click", handleColumnFilterPopoverClick);

      return columnFilterPopover;
    }

    function closeColumnFilterPopover() {
      if (activeColumnFilter?.trigger) {
        activeColumnFilter.trigger.setAttribute("aria-expanded", "false");
        activeColumnFilter.trigger.closest(".reference-column-filter")?.classList.remove("is-open");
      }

      if (columnFilterPopover) {
        columnFilterPopover.hidden = true;
        columnFilterPopover.innerHTML = "";
      }

      activeColumnFilter = null;
    }

    function positionColumnFilterPopover(trigger) {
      const popover = ensureColumnFilterPopover();
      const rect = trigger.getBoundingClientRect();
      const width = 238;
      const left = Math.min(
        Math.max(8, rect.right - width),
        Math.max(8, window.innerWidth - width - 8)
      );

      popover.style.left = `${left + window.scrollX}px`;
      popover.style.top = `${rect.bottom + window.scrollY + 4}px`;
    }

    function renderActiveColumnFilterPopover() {
      if (!activeColumnFilter?.trigger || !document.body.contains(activeColumnFilter.trigger)) {
        closeColumnFilterPopover();
        return;
      }

      const popover = ensureColumnFilterPopover();
      const runtime = columnFilterRuntime(activeColumnFilter.scope, activeColumnFilter.field);

      if (!runtime) {
        closeColumnFilterPopover();
        return;
      }

      const optionValues = ensureColumnFilterState(
        runtime.filterState,
        runtime.knownValuesMap,
        runtime.initializedFields,
        runtime.field,
        runtime.values
      );
      const countText = columnFilterCountText(runtime.filterState, runtime.field, optionValues);
      const options = optionValues.length === 0
        ? `<span class="reference-filter-empty">No values</span>`
        : optionValues.map(value => {
          const safeValue = String(value ?? "");
          const safeId = `${runtime.idPrefix}-${runtime.field}-${safeValue}`.replace(/[^A-Za-z0-9_-]/g, "-");
          const checked = runtime.filterState[runtime.field].has(value) ? "" : " checked";

          return `
            <label class="reference-filter-option" for="${escapeHtml(safeId)}" title="${escapeHtml(runtime.label(value))}">
              <input id="${escapeHtml(safeId)}" type="checkbox" data-column-filter-value="${escapeHtml(safeValue)}"${checked}>
              <span>${escapeHtml(runtime.label(value))}</span>
            </label>
          `;
        }).join("");

      popover.innerHTML = `
        <span class="reference-filter-actions">
          <span class="reference-filter-count">${escapeHtml(countText)}</span>
          <span class="reference-filter-action-group">
            <button type="button" class="reference-filter-action" data-reference-filter-action="select-all">Select All</button>
            <button type="button" class="reference-filter-action" data-reference-filter-action="clear-all">Clear All</button>
          </span>
        </span>
        <span class="reference-filter-options">${options}</span>
      `;
      popover.hidden = false;
      positionColumnFilterPopover(activeColumnFilter.trigger);
      activeColumnFilter.trigger.setAttribute("aria-expanded", "true");
      activeColumnFilter.trigger.closest(".reference-column-filter")?.classList.add("is-open");
    }

    function renderColumnFilterMenu({ container, field, values, filterState, knownValuesMap, initializedFields }) {
      if (!container) {
        return;
      }

      const optionValues = ensureColumnFilterState(filterState, knownValuesMap, initializedFields, field, values);
      const active = isColumnFilterActive(filterState, field, optionValues);
      const wrapper = container.closest(".reference-column-filter");
      const isOpen = activeColumnFilter?.trigger === container;

      wrapper?.classList.toggle("is-filtered", active);
      wrapper?.classList.toggle("is-open", isOpen);
      container.setAttribute("aria-expanded", isOpen ? "true" : "false");

      if (isOpen) {
        renderActiveColumnFilterPopover();
      }
    }

    function selectAllColumnFilter(filterState, knownValuesMap, initializedFields, field, values) {
      const optionValues = Array.from(new Set([...(knownValuesMap[field] || []), ...values])).sort((left, right) =>
        String(left).localeCompare(String(right), "en", { numeric: true, sensitivity: "base" })
      );

      filterState[field].clear();
      knownValuesMap[field] = optionValues.slice();
      initializedFields.add(field);
    }

    function clearColumnFilter(filterState, knownValuesMap, initializedFields, field, values) {
      const optionValues = Array.from(new Set([...(knownValuesMap[field] || []), ...values])).sort((left, right) =>
        String(left).localeCompare(String(right), "en", { numeric: true, sensitivity: "base" })
      );

      filterState[field].clear();
      optionValues.forEach(value => filterState[field].add(value));
      knownValuesMap[field] = optionValues.slice();
      initializedFields.add(field);
    }

    function pricingContextHeaderFilterValue(field) {
      return pricingContextHeaderFilterControls
        .find(control => control.dataset.pricingContextHeaderFilter === field)
        ?.value.trim().toLowerCase() || "";
    }

    function pricingContextHeaderFilterControl(field) {
      return pricingContextHeaderFilterControls
        .find(control => control.dataset.pricingContextHeaderFilter === field) || null;
    }

    function pricingContextRouteScopeLabel(scope) {
      const item = referenceDataCollection(scope.kind)
        .find(candidate => referenceDataKey(scope.kind, candidate) === scope.value);
      const name = referenceDataItemName(scope.kind, item);

      return `Execution Contexts for ${scope.value}${name ? ` — ${name}` : ""}`;
    }

    function syncPricingContextRouteView() {
      const routeState = pricingRouteStateFromLocation();
      const previousScope = pricingContextRouteScope;
      const relatedView = routeState.mode === "related" && routeState.scope;

      pricingContextEditState = null;
      setPricingContextStatus("");
      pricingContextHeaderFilterControls.forEach(control => {
        control.readOnly = false;
        control.removeAttribute("aria-readonly");

        if (relatedView) {
          control.value = "";
        } else if (
          previousScope &&
          control.dataset.pricingContextHeaderFilter === previousScope.field &&
          control.value.trim() === previousScope.value
        ) {
          control.value = "";
        }
      });

      pricingContextRouteScope = relatedView ? routeState.scope : null;
      pricingPage.classList.toggle("is-related-view", Boolean(pricingContextRouteScope));
      pricingContextNewButton.hidden = Boolean(pricingContextRouteScope);
      pricingContextBreadcrumb.hidden = !pricingContextRouteScope;

      if (pricingContextRouteScope) {
        const scopeControl = pricingContextHeaderFilterControl(pricingContextRouteScope.field);

        if (scopeControl) {
          scopeControl.value = pricingContextRouteScope.value;
          scopeControl.readOnly = true;
          scopeControl.setAttribute("aria-readonly", "true");
        }

        pricingContextBreadcrumbBackLink.href = referenceDataRoute(pricingContextRouteScope.kind);
        pricingContextBreadcrumbBackLink.textContent = referenceDataPluralLabel(pricingContextRouteScope.kind);
        pricingContextBreadcrumbCurrent.textContent = pricingContextRouteScopeLabel(pricingContextRouteScope);
      }

      renderPricingContexts();
    }

    function pricingContextSearchValues(context, field) {
      if (field === "pricingContextId") {
        return [context.pricingContextId];
      }

      if (field === "servicingBranchCode") {
        return [context.servicingBranchCode, servicingBranchDisplayName(context.servicingBranchCode)];
      }

      if (field === "settlementSystemId") {
        const name = context.settlementSystemId === NOT_APPLICABLE_ACCOUNTING_SYSTEM_ID
          ? "Not Applicable"
          : settlementSystemDisplayName(context.settlementSystemId);
        return [context.settlementSystemId, name];
      }

      if (field === "defaultPositionManagementMode") {
        return [
          context.defaultPositionManagementMode,
          positionManagementModeLabel(context.defaultPositionManagementMode)
        ];
      }

      if (field === "autoHedgingAdmissionMode") {
        return [
          context.autoHedgingAdmissionMode,
          autoHedgingAdmissionModeLabel(context.autoHedgingAdmissionMode)
        ];
      }

      const executionSystem = tradeCaptureChannelById(context.tradeCaptureChannelId);
      const pricingMode = normalizedPricingType(executionSystem?.pricingType);

      return [
        context.tradeCaptureChannelId,
        tradeCaptureChannelDisplayName(context.tradeCaptureChannelId),
        pricingMode,
        pricingTypePresentation(pricingMode).label
      ];
    }

    function pricingContextMatchesHeaderFilters(context) {
      if (
        pricingContextRouteScope &&
        String(context?.[pricingContextRouteScope.field] ?? "") !== pricingContextRouteScope.value
      ) {
        return false;
      }

      return pricingContextHeaderFilterControls.every(control => {
        const query = control.value.trim().toLowerCase();

        return !query || pricingContextSearchValues(context, control.dataset.pricingContextHeaderFilter)
          .some(value => String(value || "").toLowerCase().includes(query));
      });
    }

    function filteredPricingContexts() {
      return pricingContexts
        .map((context, index) => ({ context, index }))
        .filter(({ context }) => pricingContextMatchesHeaderFilters(context))
        .sort((left, right) => {
          const keyOrder = String(left.context.pricingContextId).localeCompare(
            String(right.context.pricingContextId),
            "en",
            { numeric: true, sensitivity: "base" }
          );

          return pricingContextIdSortDirection === "desc" ? -keyOrder : keyOrder;
        });
    }

    function attachedTradingCounterpartiesButtonMarkup(context, index, editing = false) {
      const count = pricingContextUsageCount(context?.pricingContextId);
      const hasAttachedCounterparties = count > 0;
      const counterpartyLabel = count === 1 ? "Trading Counterparty" : "Trading Counterparties";
      const tooltip = editing && hasAttachedCounterparties
        ? "Finish editing to view attached Trading Counterparties"
        : hasAttachedCounterparties
          ? `View ${count} attached ${counterpartyLabel}`
          : "No attached Trading Counterparties";
      const disabled = editing || !hasAttachedCounterparties;
      const wrapperTooltip = disabled
        ? ` tabindex="0" data-tooltip="${escapeHtml(tooltip)}"`
        : "";
      const buttonTooltip = disabled ? "" : ` data-tooltip="${escapeHtml(tooltip)}"`;
      const indexAttribute = Number.isInteger(index) ? ` data-pricing-context-index="${index}"` : "";

      return `
        <span class="reference-related-view-control"${wrapperTooltip}>
          <button
            type="button"
            class="btn btn-sm btn-outline-secondary reference-grid-action"
            data-pricing-context-action="view-trading-counterparties"${indexAttribute}
            aria-label="${escapeHtml(tooltip)}"${buttonTooltip}${disabled ? " disabled" : ""}
          >
            <span class="button-icon" aria-hidden="true">visibility</span>
          </button>
        </span>
      `;
    }

    function renderPricingContextViewRow(context, index) {
      const executionSystem = tradeCaptureChannelById(context.tradeCaptureChannelId);
      const executionSystemName = executionSystem?.tradeCaptureChannelName || context.tradeCaptureChannelId;
      const dependencyDescription = executionContextDependencyDescription(context.pricingContextId);
      const removeDisabled = dependencyDescription ? " disabled" : "";

      return `
        <tr data-pricing-context-index="${index}">
          <td>${escapeHtml(context.pricingContextId)}</td>
          <td>${pricingContextFacetMarkup(context, "servicingBranchCode")}</td>
          <td>${pricingContextFacetMarkup(context, "settlementSystemId")}</td>
          <td>${executionSystemLabelMarkup(executionSystemName, executionSystem?.pricingType)}</td>
          <td>${positionManagementModeBadgeMarkup(context.defaultPositionManagementMode)}</td>
          <td>${autoHedgingAdmissionModeBadgeMarkup(context.autoHedgingAdmissionMode)}</td>
          <td class="reference-related-view-cell">${attachedTradingCounterpartiesButtonMarkup(context, index)}</td>
          <td class="profile-actions-cell" data-pricing-context-actions-column>
            <span class="profile-row-actions">
              <button type="button" class="btn btn-sm btn-outline-secondary reference-grid-action" data-pricing-context-action="edit" data-pricing-context-index="${index}" aria-label="Edit ${escapeHtml(context.pricingContextId)}">
                <span class="button-icon" aria-hidden="true">edit</span>
              </button>
              <button type="button" class="btn btn-sm btn-outline-danger reference-grid-action" data-pricing-context-action="remove" data-pricing-context-index="${index}" aria-label="Delete ${escapeHtml(context.pricingContextId)}"${removeDisabled}>
                <span class="button-icon" aria-hidden="true">delete</span>
              </button>
            </span>
          </td>
        </tr>
      `;
    }

    function renderPricingContextEditRow(context, index) {
      const indexAttribute = index === null ? "" : ` data-pricing-context-index="${index}"`;
      const id = index === null ? "" : context.pricingContextId;

      return `
        <tr class="is-selected is-editing"${indexAttribute} data-pricing-context-edit-row>
          <td class="pricing-context-id-preview">${escapeHtml(id)}</td>
          <td>
            <select class="inline-edit-control" data-pricing-context-field="servicingBranchCode" aria-label="Servicing Location" required>
              ${referenceSelectOptions(servicingBranches, context.servicingBranchCode, "servicingBranchCode", item => item.servicingBranchName)}
            </select>
          </td>
          <td>
            <select class="inline-edit-control" data-pricing-context-field="settlementSystemId" aria-label="Accounting System" required>
              ${accountingSystemSelectOptions(context.settlementSystemId)}
            </select>
          </td>
          <td>
            <select class="inline-edit-control" data-pricing-context-field="tradeCaptureChannelId" aria-label="Execution System" required>
              ${referenceSelectOptions(tradeCaptureChannels, context.tradeCaptureChannelId, "tradeCaptureChannelId", item => item.tradeCaptureChannelName)}
            </select>
          </td>
          <td>
            <select class="inline-edit-control" data-pricing-context-field="defaultPositionManagementMode" aria-label="Default FX Position Mode" required>
              <option value="MANUAL"${normalizedPositionManagementMode(context.defaultPositionManagementMode) === "MANUAL" ? " selected" : ""}>${escapeHtml(positionManagementModeLabel("MANUAL"))}</option>
              <option value="AUTO"${normalizedPositionManagementMode(context.defaultPositionManagementMode) === "AUTO" ? " selected" : ""}>${escapeHtml(positionManagementModeLabel("AUTO"))}</option>
            </select>
          </td>
          <td>
            <select class="inline-edit-control" data-pricing-context-field="autoHedgingAdmissionMode" aria-label="Auto Hedging Admission" required>
              <option value="AUTO_IF_ELIGIBLE"${normalizedAutoHedgingAdmissionMode(context.autoHedgingAdmissionMode) === "AUTO_IF_ELIGIBLE" ? " selected" : ""}>${escapeHtml(autoHedgingAdmissionModeLabel("AUTO_IF_ELIGIBLE"))}</option>
              <option value="REVIEW_REQUIRED"${normalizedAutoHedgingAdmissionMode(context.autoHedgingAdmissionMode) === "REVIEW_REQUIRED" ? " selected" : ""}>${escapeHtml(autoHedgingAdmissionModeLabel("REVIEW_REQUIRED"))}</option>
              <option value="MANUAL_ONLY"${normalizedAutoHedgingAdmissionMode(context.autoHedgingAdmissionMode) === "MANUAL_ONLY" ? " selected" : ""}>${escapeHtml(autoHedgingAdmissionModeLabel("MANUAL_ONLY"))}</option>
            </select>
          </td>
          <td class="reference-related-view-cell">${attachedTradingCounterpartiesButtonMarkup(context, index, true)}</td>
          <td class="profile-actions-cell">
            <span class="profile-row-actions">
              <button type="button" class="btn btn-sm btn-outline-primary reference-grid-action" data-pricing-context-action="save" aria-label="Save Execution Context" title="Save" disabled>
                <span class="button-icon" aria-hidden="true">save</span>
              </button>
              <button type="button" class="btn btn-sm btn-outline-secondary reference-grid-action" data-pricing-context-action="cancel" aria-label="Cancel editing" title="Cancel">
                <span class="button-icon" aria-hidden="true">close</span>
              </button>
            </span>
          </td>
        </tr>
      `;
    }

    function renderPricingContexts() {
      if (!pricingContextRowsEl) {
        return;
      }

      updatePricingContextIdSortControl();

      const rows = filteredPricingContexts();
      const createRow = pricingContextEditState?.mode === "create"
        ? renderPricingContextEditRow(pricingContextDefaultDraft(), null)
        : "";

      if (rows.length === 0 && !createRow) {
        const emptyLabel = pricingContextRouteScope
          ? "No attached execution contexts."
          : "No execution contexts yet.";
        const columnCount = pricingContextRouteScope ? 7 : 8;
        pricingContextRowsEl.innerHTML = `
          <tr>
            <td class="profile-empty" colspan="${columnCount}">${emptyLabel}</td>
          </tr>
        `;
        scheduleSmartColumnSizing();
        return;
      }

      pricingContextRowsEl.innerHTML = [
        createRow,
        ...rows.map(({ context, index }) =>
          pricingContextEditState?.mode === "edit" && pricingContextEditState.index === index
            ? renderPricingContextEditRow(context, index)
            : renderPricingContextViewRow(context, index)
        )
      ].join("");
      pricingContextRowsEl
        .querySelectorAll("[data-pricing-context-edit-row]")
        .forEach(updatePricingContextRowSaveAvailability);
      scheduleSmartColumnSizing();
    }

    function updatePricingContextIdSortControl() {
      updateReferenceDataIdSortControl(
        pricingContextIdHeader,
        pricingContextIdSortButton,
        pricingContextIdSortDirection,
        "execution contexts"
      );
    }

    function startPricingContextCreate() {
      pricingContextEditState = { mode: "create" };
      setPricingContextStatus("");
      renderPricingContexts();
    }

    function startPricingContextEdit(index) {
      const context = pricingContexts[index];

      if (!context) {
        return;
      }

      pricingContextEditState = { mode: "edit", index };
      setPricingContextStatus("");
      renderPricingContexts();
    }

    function cancelPricingContextForm() {
      pricingContextEditState = null;
      setPricingContextStatus("");
      renderPricingContexts();
    }

    function viewPricingContextTradingCounterparties(index) {
      const context = pricingContexts[index];

      if (!context || pricingContextUsageCount(context.pricingContextId) <= 0) {
        return;
      }

      pricingContextEditState = null;
      setPricingContextStatus("");
      location.hash = tradingCounterpartiesForExecutionContextRoute(
        context.pricingContextId,
        location.hash
      );
    }

    async function removePricingContext(index) {
      const context = pricingContexts[index];

      if (!context) {
        return;
      }

      const dependencyDescription = executionContextDependencyDescription(context.pricingContextId);

      if (dependencyDescription) {
        setPricingContextStatus(
          `Execution Context cannot be deleted while it is used by ${dependencyDescription}.`,
          "error"
        );
        return;
      }

      try {
        if (DEMO_API_ENABLED) {
          await demoApiRequest(
            `/api/v1/execution-contexts/${encodeURIComponent(context.pricingContextId)}`,
            { method: "DELETE" }
          );
          await refreshExecutionContextsFromApi();
          pricingContextEditState = null;
        } else {
          pricingContexts.splice(index, 1);
          savePricingContexts();

          if (pricingContextEditState?.mode === "edit") {
            if (pricingContextEditState.index === index) {
              pricingContextEditState = null;
            } else if (pricingContextEditState.index > index) {
              pricingContextEditState.index -= 1;
            }
          }
        }

        setPricingContextStatus(
          completedActionMessage(`Execution Context ${context.pricingContextId}`, "removed"),
          "success"
        );
        renderPricingContexts();
        renderReferenceData();
      } catch (error) {
        setPricingContextStatus(error.message, "error");
      }
    }

    async function savePricingContextFromRow(row) {
      if (!pricingContextEditState) {
        return;
      }

      const context = pricingContextFromRow(row);

      if (!context) {
        return;
      }

      const isCreating = pricingContextEditState.mode === "create";
      const currentContext = isCreating ? null : pricingContexts[pricingContextEditState.index];
      let savedContext = context;

      try {
        if (DEMO_API_ENABLED) {
          const response = await demoApiRequest(
            isCreating
              ? "/api/v1/execution-contexts"
              : `/api/v1/execution-contexts/${encodeURIComponent(currentContext.pricingContextId)}`,
            {
              method: isCreating ? "POST" : "PUT",
              body: JSON.stringify({
                servicingLocationId: context.servicingBranchCode,
                accountingSystemId: context.settlementSystemId,
                executionSystemId: context.tradeCaptureChannelId,
                defaultPositionManagementMode: context.defaultPositionManagementMode,
                autoHedgingAdmissionMode: context.autoHedgingAdmissionMode
              })
            }
          );
          savedContext = normalizedPricingContexts([response], [])[0] || context;
          await refreshExecutionContextsFromApi();
        } else if (isCreating) {
          savedContext = {
            ...context,
            pricingContextId: nextCollectionIntegerId(pricingContexts, "pricingContextId")
          };
          pricingContexts.push(savedContext);
          savePricingContexts();
        } else {
          pricingContexts[pricingContextEditState.index] = context;
          savePricingContexts();
        }

        pricingContextEditState = null;
        setPricingContextStatus(
          completedActionMessage(
            `Execution Context ${savedContext.pricingContextId}`,
            isCreating ? "added" : "saved"
          ),
          "success"
        );

        renderPricingContexts();
        renderReferenceData();
      } catch (error) {
        setPricingContextStatus(error.message, "error");
      }
    }

    function setReferenceDataStatus(message, tone = "") {
      setWorkbenchPageStatus(referenceDataStatusEl, message, tone);
    }

    function referenceDataCollection(kind) {
      if (kind === "servicingBranch") {
        return servicingBranches;
      }

      if (kind === "settlementSystem") {
        return settlementSystems;
      }

      return tradeCaptureChannels;
    }

    function saveReferenceDataCollection(kind) {
      if (kind === "servicingBranch") {
        saveServicingBranches();
        return;
      }

      if (kind === "settlementSystem") {
        saveSettlementSystems();
        return;
      }

      saveTradeCaptureChannels();
    }

    function referenceDataRowsElement(kind) {
      if (kind === "servicingBranch") {
        return servicingBranchRowsEl;
      }

      if (kind === "settlementSystem") {
        return settlementSystemRowsEl;
      }

      return tradeCaptureChannelRowsEl;
    }

    function referenceDataKindLabel(kind) {
      if (kind === "servicingBranch") {
        return "Servicing Location";
      }

      if (kind === "settlementSystem") {
        return "Accounting System";
      }

      return "Execution System";
    }

    function referenceDataItemName(kind, item) {
      if (kind === "servicingBranch") {
        return item?.servicingBranchName || "";
      }

      if (kind === "settlementSystem") {
        return item?.settlementSystemName || "";
      }

      return item?.tradeCaptureChannelName || "";
    }

    function referenceDataPluralLabel(kind) {
      if (kind === "servicingBranch") {
        return "Servicing Locations";
      }

      if (kind === "settlementSystem") {
        return "Accounting Systems";
      }

      return "Execution Systems";
    }

    function referenceDataColumnCount(kind) {
      if (kind === "servicingBranch") {
        return 7;
      }

      return kind === "settlementSystem" ? 5 : 7;
    }

    function highlightedReferenceDataText(kind, value) {
      return escapeHtml(String(value ?? ""));
    }

    function uniqueReferenceValues(items, getter) {
      return Array.from(new Set(items.map(getter))).sort((left, right) =>
        String(left).localeCompare(String(right), "en", { numeric: true, sensitivity: "base" })
      );
    }

    function referenceDataMatchesFilters(kind, item) {
      return referenceDataFilterControls
        .filter(control => control.dataset.referenceFilterKind === kind)
        .every(control => {
          const query = control.value.trim().toLowerCase();

          if (!query) {
            return true;
          }

          const field = control.dataset.referenceFilterField;
          const rawValue = field === "isActive"
            ? String(item.isActive !== false)
            : field === "pricingType"
              ? `${item.pricingType || ""} ${pricingTypePresentation(item.pricingType).label}`
            : field === "executionSystemLabel"
              ? `${item.tradeCaptureChannelName || ""} ${item.pricingType || ""} ${pricingTypePresentation(item.pricingType).label}`
              : String(item[field] ?? "");

          return rawValue.toLowerCase().includes(query);
        });
    }

    function filteredReferenceData(kind) {
      return referenceDataCollection(kind)
        .map((item, index) => ({ item, index }))
        .filter(({ item }) => referenceDataMatchesFilters(kind, item))
        .sort((left, right) => {
          const keyOrder = compareReferenceDataByKey(kind, left, right);

          const descending = kind === "servicingBranch"
            ? servicingBranchIdSortDirection === "desc"
            : kind === "settlementSystem"
              ? settlementSystemIdSortDirection === "desc"
              : kind === "tradeCaptureChannel" && tradeCaptureChannelIdSortDirection === "desc";

          return descending
            ? -keyOrder
            : keyOrder;
        });
    }

    function referenceDataKey(kind, item) {
      if (kind === "servicingBranch") {
        return item?.servicingBranchCode || "";
      }

      if (kind === "settlementSystem") {
        return item?.settlementSystemId || "";
      }

      return item?.tradeCaptureChannelId || "";
    }

    function compareReferenceDataByKey(kind, left, right) {
      const leftKey = referenceDataKey(kind, left.item);
      const rightKey = referenceDataKey(kind, right.item);
      const keyOrder = String(leftKey).localeCompare(String(rightKey), "en", {
        numeric: true,
        sensitivity: "base"
      });

      return keyOrder || left.index - right.index;
    }

    function referenceDataUsageCount(kind, item) {
      if (kind === "servicingBranch") {
        return servicingBranchContextUsageCount(item?.servicingBranchCode || "");
      }

      if (kind === "settlementSystem") {
        return settlementSystemContextUsageCount(item?.settlementSystemId || "");
      }

      return tradeCaptureChannelContextUsageCount(item?.tradeCaptureChannelId || "");
    }

    function attachedExecutionContextsButtonMarkup(kind, item, index, editing = false) {
      const count = referenceDataUsageCount(kind, item);
      const hasAttachedContexts = count > 0;
      const contextLabel = count === 1 ? "Execution Context" : "Execution Contexts";
      const tooltip = editing && hasAttachedContexts
        ? "Finish editing to view attached Execution Contexts"
        : hasAttachedContexts
          ? `View ${count} attached ${contextLabel}`
          : "No attached Execution Contexts";
      const disabled = editing || !hasAttachedContexts;
      const wrapperTooltip = disabled
        ? ` tabindex="0" data-tooltip="${escapeHtml(tooltip)}"`
        : "";
      const buttonTooltip = disabled ? "" : ` data-tooltip="${escapeHtml(tooltip)}"`;
      const indexAttribute = Number.isInteger(index) ? ` data-reference-index="${index}"` : "";

      return `
        <span class="reference-related-view-control"${wrapperTooltip}>
          <button
            type="button"
            class="btn btn-sm btn-outline-secondary reference-grid-action"
            data-reference-action="view-execution-contexts"
            data-reference-kind="${escapeHtml(kind)}"${indexAttribute}
            aria-label="${escapeHtml(tooltip)}"${buttonTooltip}${disabled ? " disabled" : ""}
          >
            <span class="button-icon" aria-hidden="true">visibility</span>
          </button>
        </span>
      `;
    }

    function referenceDataDefaultDraft(kind) {
      if (kind === "servicingBranch") {
        return { servicingBranchCode: "", servicingBranchName: "", region: "", locationType: "BRANCH", isActive: true };
      }

      if (kind === "settlementSystem") {
        return { settlementSystemId: "", settlementSystemName: "", isActive: true };
      }

      return { tradeCaptureChannelId: "", tradeCaptureChannelName: "", pricingType: "DEALER_APPROVED", isActive: true };
    }

    function pricingTypeOptions(selectedValue) {
      return PRICING_TYPES
        .map(value => `<option value="${escapeHtml(value)}" ${value === selectedValue ? "selected" : ""}>${escapeHtml(pricingTypePresentation(value).label)}</option>`)
        .join("");
    }

    function servicingLocationTypeOptions(selectedValue) {
      return SERVICING_LOCATION_TYPES
        .map(value => `<option value="${escapeHtml(value)}" ${value === selectedValue ? "selected" : ""}>${escapeHtml(value)}</option>`)
        .join("");
    }

    function activeLabel(isActive) {
      return activeBooleanTokenMarkup(isActive !== false);
    }

    function referenceDataEditStateIndex(kind) {
      return referenceDataEditState?.mode === "edit" && referenceDataEditState.kind === kind
        ? referenceDataEditState.index
        : null;
    }

    function renderReferenceDataEditRow(kind, item, index) {
      const label = referenceDataKindLabel(kind);
      const usageCount = index === null ? 0 : referenceDataUsageCount(kind, item);
      const keyReadonly = usageCount > 0 ? " readonly" : "";
      const pricingModeLocked = kind === "tradeCaptureChannel" && usageCount > 0;
      const indexAttribute = index === null ? "" : ` data-reference-index="${index}"`;
      let cells = "";

      if (kind === "servicingBranch") {
        cells = `
          <td><input class="inline-edit-control" type="text" data-reference-field="servicingBranchCode" value="${escapeHtml(item.servicingBranchCode)}" maxlength="10" required${keyReadonly}></td>
          <td><input class="inline-edit-control" type="text" data-reference-field="servicingBranchName" value="${escapeHtml(item.servicingBranchName)}" maxlength="50" required></td>
          <td><input class="inline-edit-control" type="text" data-reference-field="region" value="${escapeHtml(item.region)}" maxlength="50"></td>
          <td><select class="inline-edit-control" data-reference-field="locationType" required>${servicingLocationTypeOptions(item.locationType)}</select></td>
          <td><select class="inline-edit-control" data-reference-field="isActive">${activeBooleanOptions(item.isActive)}</select></td>
        `;
      } else if (kind === "settlementSystem") {
        cells = `
          <td><input class="inline-edit-control" type="text" data-reference-field="settlementSystemId" value="${escapeHtml(item.settlementSystemId)}" maxlength="20" required${keyReadonly}></td>
          <td><input class="inline-edit-control" type="text" data-reference-field="settlementSystemName" value="${escapeHtml(item.settlementSystemName)}" maxlength="50" required></td>
          <td><select class="inline-edit-control" data-reference-field="isActive">${activeBooleanOptions(item.isActive)}</select></td>
        `;
      } else {
        const pricingModeLockMessage = "Pricing Mode is locked while Execution Contexts are attached. Create another Execution System for a different mode.";
        const pricingModeLockAriaLabel = `Pricing Mode: ${pricingTypePresentation(item.pricingType).label}. ${pricingModeLockMessage}`;
        const pricingModeControl = pricingModeLocked
          ? `
            <span
              class="reference-readonly-control"
              tabindex="0"
              role="group"
              aria-disabled="true"
              aria-label="${escapeHtml(pricingModeLockAriaLabel)}"
              data-tooltip="${escapeHtml(pricingModeLockMessage)}"
            >
              <select class="inline-edit-control" data-reference-field="pricingType" aria-label="Pricing Mode" required disabled>
                ${pricingTypeOptions(item.pricingType)}
              </select>
            </span>
          `
          : `<select class="inline-edit-control" data-reference-field="pricingType" aria-label="Pricing Mode" required>${pricingTypeOptions(item.pricingType)}</select>`;

        cells = `
          <td><input class="inline-edit-control" type="text" data-reference-field="tradeCaptureChannelId" value="${escapeHtml(item.tradeCaptureChannelId)}" maxlength="30" pattern="[A-Z0-9_-]{2,30}" required${keyReadonly}></td>
          <td><input class="inline-edit-control" type="text" data-reference-field="tradeCaptureChannelName" value="${escapeHtml(item.tradeCaptureChannelName)}" maxlength="50" required></td>
          <td>${pricingModeControl}</td>
          <td data-execution-system-label-preview>${executionSystemLabelMarkup(item.tradeCaptureChannelName, item.pricingType)}</td>
          <td><select class="inline-edit-control" data-reference-field="isActive">${activeBooleanOptions(item.isActive)}</select></td>
        `;
      }

      return `
        <tr class="is-selected is-editing"${indexAttribute} data-reference-kind="${kind}" data-reference-edit-row>
          ${cells}
          <td class="reference-related-view-cell">${attachedExecutionContextsButtonMarkup(kind, item, index, true)}</td>
          <td class="profile-actions-cell">
            <span class="profile-row-actions">
              <button type="button" class="btn btn-sm btn-outline-primary reference-grid-action" data-reference-action="save" data-reference-kind="${kind}" aria-label="Save ${escapeHtml(label)}" title="Save">
                <span class="button-icon" aria-hidden="true">save</span>
              </button>
              <button type="button" class="btn btn-sm btn-outline-secondary reference-grid-action" data-reference-action="cancel" data-reference-kind="${kind}" aria-label="Cancel editing" title="Cancel">
                <span class="button-icon" aria-hidden="true">close</span>
              </button>
            </span>
          </td>
        </tr>
      `;
    }

    function renderReferenceDataViewRow(kind, item, index) {
      const label = referenceDataKindLabel(kind);
      const key = referenceDataKey(kind, item);
      const usageCount = referenceDataUsageCount(kind, item);
      const removeDisabled = usageCount > 0 ? " disabled" : "";
      let cells = "";

      if (kind === "servicingBranch") {
        cells = `
          <td>${highlightedReferenceDataText(kind, item.servicingBranchCode)}</td>
          <td>${highlightedReferenceDataText(kind, item.servicingBranchName)}</td>
          <td>${highlightedReferenceDataText(kind, item.region)}</td>
          <td>${highlightedReferenceDataText(kind, item.locationType)}</td>
          <td>${activeLabel(item.isActive)}</td>
        `;
      } else if (kind === "settlementSystem") {
        cells = `
          <td>${highlightedReferenceDataText(kind, item.settlementSystemId)}</td>
          <td>${highlightedReferenceDataText(kind, item.settlementSystemName)}</td>
          <td>${activeLabel(item.isActive)}</td>
        `;
      } else {
        const pricingTypeLabel = pricingTypePresentation(item.pricingType).label;

        cells = `
          <td>${highlightedReferenceDataText(kind, item.tradeCaptureChannelId)}</td>
          <td>${highlightedReferenceDataText(kind, item.tradeCaptureChannelName)}</td>
          <td>${pricingModeIndicatorMarkup(
            item.pricingType,
            highlightedReferenceDataText(kind, pricingTypeLabel),
            false
          )}</td>
          <td>${executionSystemLabelMarkup(item.tradeCaptureChannelName, item.pricingType)}</td>
          <td>${activeLabel(item.isActive)}</td>
        `;
      }

      return `
        <tr data-reference-kind="${kind}" data-reference-index="${index}">
          ${cells}
          <td class="reference-related-view-cell">${attachedExecutionContextsButtonMarkup(kind, item, index)}</td>
          <td class="profile-actions-cell">
            <span class="profile-row-actions">
              <button type="button" class="btn btn-sm btn-outline-secondary reference-grid-action" data-reference-action="edit" data-reference-kind="${kind}" data-reference-index="${index}" aria-label="Edit ${escapeHtml(key)}">
                <span class="button-icon" aria-hidden="true">edit</span>
              </button>
              <button type="button" class="btn btn-sm btn-outline-danger reference-grid-action" data-reference-action="remove" data-reference-kind="${kind}" data-reference-index="${index}" aria-label="Delete ${escapeHtml(key)}"${removeDisabled}>
                <span class="button-icon" aria-hidden="true">delete</span>
              </button>
            </span>
          </td>
        </tr>
      `;
    }

    function renderReferenceDataTable(kind) {
      const rowsElement = referenceDataRowsElement(kind);

      if (!rowsElement) {
        return;
      }

      const rows = filteredReferenceData(kind);
      const createRow = referenceDataEditState?.mode === "create" && referenceDataEditState.kind === kind
        ? renderReferenceDataEditRow(kind, referenceDataDefaultDraft(kind), null)
        : "";

      if (rows.length === 0 && !createRow) {
        rowsElement.innerHTML = `
          <tr>
            <td class="profile-empty" colspan="${referenceDataColumnCount(kind)}">No ${escapeHtml(referenceDataPluralLabel(kind).toLowerCase())} match the filters.</td>
          </tr>
        `;
        return;
      }

      rowsElement.innerHTML = [
        createRow,
        ...rows.map(({ item, index }) =>
          referenceDataEditState?.mode === "edit" && referenceDataEditState.kind === kind && referenceDataEditState.index === index
            ? renderReferenceDataEditRow(kind, item, index)
            : renderReferenceDataViewRow(kind, item, index)
        )
      ].join("");

      rowsElement
        .querySelectorAll("[data-reference-edit-row]")
        .forEach(updateReferenceDataRowSaveAvailability);
    }

    function updateReferenceDataVisibility() {
      const activeKind = activeReferenceDataKind();

      referenceDataPanels.forEach(panel => {
        panel.hidden = panel.dataset.referencePanel !== activeKind;
      });
      referenceDataRouteLinks.forEach(link => {
        const isActive = link.dataset.referenceRoute === activeKind;
        link.classList.toggle("is-active", isActive);
        link.classList.toggle("active", isActive);

        if (isActive) {
          link.setAttribute("aria-current", "page");
        } else {
          link.removeAttribute("aria-current");
        }
      });
    }

    function renderReferenceData() {
      updateReferenceDataVisibility();
      updateServicingBranchIdSortControl();
      updateSettlementSystemIdSortControl();
      updateTradeCaptureChannelIdSortControl();
      renderReferenceDataTable("servicingBranch");
      renderReferenceDataTable("settlementSystem");
      renderReferenceDataTable("tradeCaptureChannel");
      scheduleSmartColumnSizing();
    }

    function updateServicingBranchIdSortControl() {
      updateReferenceDataIdSortControl(
        servicingBranchIdHeader,
        servicingBranchIdSortButton,
        servicingBranchIdSortDirection,
        "servicing locations"
      );
    }

    function updateTradeCaptureChannelIdSortControl() {
      updateReferenceDataIdSortControl(
        tradeCaptureChannelIdHeader,
        tradeCaptureChannelIdSortButton,
        tradeCaptureChannelIdSortDirection,
        "execution systems"
      );
    }

    function updateSettlementSystemIdSortControl() {
      updateReferenceDataIdSortControl(
        settlementSystemIdHeader,
        settlementSystemIdSortButton,
        settlementSystemIdSortDirection,
        "accounting systems"
      );
    }

    function updateReferenceDataIdSortControl(header, button, direction, label) {
      const ascending = direction === "asc";

      header.setAttribute("aria-sort", ascending ? "ascending" : "descending");
      button.setAttribute("aria-label", `Sort ${label} by ID ${ascending ? "ascending" : "descending"}`);
      button.setAttribute("aria-pressed", String(ascending));
      button.querySelector(".reference-sort-indicator").classList.toggle("is-descending", !ascending);
    }

    function startReferenceDataCreate(kind) {
      referenceDataEditState = { mode: "create", kind };
      setReferenceDataStatus("");
      renderReferenceData();
    }

    function startReferenceDataEdit(kind, index) {
      const item = referenceDataCollection(kind)[index];

      if (!item) {
        return;
      }

      referenceDataEditState = { mode: "edit", kind, index };
      setReferenceDataStatus("");
      renderReferenceData();
    }

    function cancelReferenceDataForm() {
      referenceDataEditState = null;
      setReferenceDataStatus("");
      renderReferenceData();
    }

    function referenceDataItemFromRow(kind, row) {
      const field = name => row.querySelector(`[data-reference-field='${name}']`);

      if (kind === "servicingBranch") {
        const codeInput = field("servicingBranchCode");
        const nameInput = field("servicingBranchName");
        const servicingBranchCode = parseBranchCode(codeInput);
        const servicingBranchName = parseRequiredText(nameInput, "Servicing Location Name");
        const locationType = normalizedServicingLocationType(field("locationType")?.value, servicingBranchCode);

        if (servicingBranchCode === null || servicingBranchName === null) {
          return null;
        }

        return {
          servicingBranchCode,
          servicingBranchName,
          region: field("region")?.value.trim() || "",
          locationType,
          isActive: field("isActive")?.value !== "false"
        };
      }

      if (kind === "settlementSystem") {
        const idInput = field("settlementSystemId");
        const nameInput = field("settlementSystemName");
        const settlementSystemId = parseContextCode(idInput, "Accounting System ID");
        const settlementSystemName = parseRequiredText(nameInput, "Accounting System Name");

        if (settlementSystemId === null || settlementSystemName === null) {
          return null;
        }

        return {
          settlementSystemId,
          settlementSystemName,
          isActive: field("isActive")?.value !== "false"
        };
      }

      const idInput = field("tradeCaptureChannelId");
      const nameInput = field("tradeCaptureChannelName");
      const typeSelect = field("pricingType");
      const tradeCaptureChannelId = parseContextCode(idInput, "Execution System ID");
      const tradeCaptureChannelName = parseRequiredText(nameInput, "Execution System Name");
      const pricingType = parseContextCode(typeSelect, "Pricing Mode");

      if (tradeCaptureChannelId === null || tradeCaptureChannelName === null || pricingType === null) {
        return null;
      }

      typeSelect.setCustomValidity(PRICING_TYPES.includes(pricingType) ? "" : "Pricing Mode is not supported.");

      if (!PRICING_TYPES.includes(pricingType)) {
        typeSelect.reportValidity();
        return null;
      }

      return {
        tradeCaptureChannelId,
        tradeCaptureChannelName,
        pricingType,
        isActive: field("isActive")?.value !== "false"
      };
    }

    function referenceDataDraftFromRow(kind, row) {
      const field = name => row.querySelector(`[data-reference-field='${name}']`);

      if (kind === "servicingBranch") {
        const servicingBranchCode = field("servicingBranchCode")?.value.trim() || "";
        const servicingBranchName = field("servicingBranchName")?.value.trim() || "";

        if (!isValidServicingLocationId(servicingBranchCode) || !servicingBranchName) {
          return null;
        }

        return {
          servicingBranchCode,
          servicingBranchName,
          region: field("region")?.value.trim() || "",
          locationType: normalizedServicingLocationType(field("locationType")?.value, servicingBranchCode),
          isActive: field("isActive")?.value !== "false"
        };
      }

      if (kind === "settlementSystem") {
        const settlementSystemId = normalizedContextCode(field("settlementSystemId")?.value);
        const settlementSystemName = field("settlementSystemName")?.value.trim() || "";

        if (!/^[A-Z0-9_-]{2,20}$/.test(settlementSystemId) || !settlementSystemName) {
          return null;
        }

        return {
          settlementSystemId,
          settlementSystemName,
          isActive: field("isActive")?.value !== "false"
        };
      }

      const tradeCaptureChannelId = normalizedContextCode(field("tradeCaptureChannelId")?.value);
      const tradeCaptureChannelName = field("tradeCaptureChannelName")?.value.trim() || "";
      const pricingType = normalizedContextCode(field("pricingType")?.value);

      if (!/^[A-Z0-9_-]{2,30}$/.test(tradeCaptureChannelId) || !tradeCaptureChannelName || tradeCaptureChannelName.length > 50 || !PRICING_TYPES.includes(pricingType)) {
        return null;
      }

      return {
        tradeCaptureChannelId,
        tradeCaptureChannelName,
        pricingType,
        isActive: field("isActive")?.value !== "false"
      };
    }

    function referenceActiveValue(item) {
      return item?.isActive !== false;
    }

    function sameReferenceDataItem(kind, left, right) {
      if (!left || !right || referenceDataKey(kind, left) !== referenceDataKey(kind, right)) {
        return false;
      }

      if (kind === "servicingBranch") {
        return left.servicingBranchName === right.servicingBranchName &&
          left.region === right.region &&
          left.locationType === right.locationType &&
          referenceActiveValue(left) === referenceActiveValue(right);
      }

      if (kind === "settlementSystem") {
        return left.settlementSystemName === right.settlementSystemName &&
          referenceActiveValue(left) === referenceActiveValue(right);
      }

      return left.tradeCaptureChannelName === right.tradeCaptureChannelName &&
        left.pricingType === right.pricingType &&
        referenceActiveValue(left) === referenceActiveValue(right);
    }

    function syncExecutionSystemLabelPreview(row) {
      const preview = row.querySelector("[data-execution-system-label-preview]");

      if (!preview) {
        return;
      }

      const name = row.querySelector("[data-reference-field='tradeCaptureChannelName']")?.value || "";
      const pricingType = row.querySelector("[data-reference-field='pricingType']")?.value || "";
      preview.innerHTML = executionSystemLabelMarkup(name, pricingType);
    }

    function updateReferenceDataRowSaveAvailability(row) {
      const kind = row.dataset.referenceKind;
      const button = row.querySelector("[data-reference-action='save']");

      if (kind === "tradeCaptureChannel") {
        syncExecutionSystemLabelPreview(row);
      }

      const item = referenceDataDraftFromRow(kind, row);

      if (!item) {
        setSaveButtonAvailability(button, false, "Complete required fields before saving");
        return;
      }

      const collection = referenceDataCollection(kind);
      const currentIndex = referenceDataEditStateIndex(kind);
      const key = referenceDataKey(kind, item);
      const duplicateIndex = collection.findIndex((candidate, index) =>
        index !== currentIndex && referenceDataKey(kind, candidate) === key
      );

      if (duplicateIndex !== -1) {
        setSaveButtonAvailability(button, false, `${referenceDataKindLabel(kind)} already exists`);
        return;
      }

      const oldItem = currentIndex === null ? null : collection[currentIndex];

      if (oldItem && referenceDataKey(kind, oldItem) !== key && referenceDataUsageCount(kind, oldItem) > 0) {
        setSaveButtonAvailability(button, false, "ID cannot be changed while this item is used");
        return;
      }

      if (
        kind === "tradeCaptureChannel"
        && oldItem
        && item.pricingType !== oldItem.pricingType
        && referenceDataUsageCount(kind, oldItem) > 0
      ) {
        setSaveButtonAvailability(button, false, "Pricing Mode cannot be changed while this Execution System is used");
        return;
      }

      const changed = currentIndex === null || !sameReferenceDataItem(kind, item, oldItem);
      setSaveButtonAvailability(button, changed);
    }

    async function saveReferenceDataFromRow(row) {
      if (!referenceDataEditState) {
        return;
      }

      const kind = referenceDataEditState.kind;
      const item = referenceDataItemFromRow(kind, row);

      if (!item) {
        return;
      }

      const collection = referenceDataCollection(kind);
      const currentIndex = referenceDataEditStateIndex(kind);
      const key = referenceDataKey(kind, item);
      const oldItem = currentIndex === null ? null : collection[currentIndex];
      const oldKey = referenceDataKey(kind, oldItem);
      const keyField = row.querySelector("[data-reference-field]");
      const duplicateIndex = collection.findIndex((candidate, index) =>
        index !== currentIndex && referenceDataKey(kind, candidate) === key
      );

      keyField.setCustomValidity(duplicateIndex === -1 ? "" : `${referenceDataKindLabel(kind)} already exists.`);

      if (duplicateIndex !== -1) {
        keyField.reportValidity();
        return;
      }

      if (oldItem && oldKey !== key && referenceDataUsageCount(kind, oldItem) > 0) {
        setReferenceDataStatus(`${referenceDataKindLabel(kind)} ID cannot be changed while it is used by Execution Context.`, "error");
        return;
      }

      if (
        kind === "tradeCaptureChannel"
        && oldItem
        && item.pricingType !== oldItem.pricingType
        && referenceDataUsageCount(kind, oldItem) > 0
      ) {
        setReferenceDataStatus("Execution System Pricing Mode cannot be changed while it is used by Execution Context.", "error");
        return;
      }

      const isCreating = referenceDataEditState.mode === "create";
      try {
        if (kind === "servicingBranch" && DEMO_API_ENABLED) {
          await demoApiRequest(
            isCreating
              ? "/api/v1/servicing-locations"
              : `/api/v1/servicing-locations/${encodeURIComponent(oldKey)}`,
            {
              method: isCreating ? "POST" : "PUT",
              body: JSON.stringify({
                servicingLocationId: item.servicingBranchCode,
                name: item.servicingBranchName,
                region: item.region,
                type: item.locationType,
                active: item.isActive
              })
            }
          );
          await refreshServicingLocationsFromApi();
        } else if (kind === "settlementSystem" && DEMO_API_ENABLED) {
          await demoApiRequest(
            isCreating
              ? "/api/v1/accounting-systems"
              : `/api/v1/accounting-systems/${encodeURIComponent(oldKey)}`,
            {
              method: isCreating ? "POST" : "PUT",
              body: JSON.stringify({
                accountingSystemId: item.settlementSystemId,
                name: item.settlementSystemName,
                active: item.isActive
              })
            }
          );
          await refreshAccountingSystemsFromApi();
        } else if (kind === "tradeCaptureChannel" && DEMO_API_ENABLED) {
          await demoApiRequest(
            isCreating
              ? "/api/v1/execution-systems"
              : `/api/v1/execution-systems/${encodeURIComponent(oldKey)}`,
            {
              method: isCreating ? "POST" : "PUT",
              body: JSON.stringify({
                executionSystemId: item.tradeCaptureChannelId,
                name: item.tradeCaptureChannelName,
                pricingMode: item.pricingType,
                active: item.isActive
              })
            }
          );
          await refreshExecutionSystemsFromApi();
        } else if (isCreating) {
          collection.push(item);
          saveReferenceDataCollection(kind);
        } else {
          collection[referenceDataEditState.index] = item;
          saveReferenceDataCollection(kind);
        }

        referenceDataEditState = null;
        setReferenceDataStatus(
          completedActionMessage(
            `${referenceDataKindLabel(kind)} "${referenceDataItemName(kind, item)}" (ID ${key})`,
            isCreating ? "added" : "saved"
          ),
          "success"
        );
        renderReferenceData();
        renderPricingContexts();
      } catch (error) {
        setReferenceDataStatus(error.message, "error");
      }
    }

    async function removeReferenceDataItem(kind, index) {
      const collection = referenceDataCollection(kind);
      const item = collection[index];

      if (!item) {
        return;
      }

      const usageCount = referenceDataUsageCount(kind, item);

      if (usageCount > 0) {
        setReferenceDataStatus(
          `${referenceDataKindLabel(kind)} cannot be deleted while ${usageCount} Execution ${usageCount === 1 ? "Context uses" : "Contexts use"} it.`,
          "error"
        );
        return;
      }

      const key = referenceDataKey(kind, item);

      try {
        if (kind === "servicingBranch" && DEMO_API_ENABLED) {
          await demoApiRequest(`/api/v1/servicing-locations/${encodeURIComponent(key)}`, { method: "DELETE" });
          await refreshServicingLocationsFromApi();
        } else if (kind === "settlementSystem" && DEMO_API_ENABLED) {
          await demoApiRequest(`/api/v1/accounting-systems/${encodeURIComponent(key)}`, { method: "DELETE" });
          await refreshAccountingSystemsFromApi();
        } else if (kind === "tradeCaptureChannel" && DEMO_API_ENABLED) {
          await demoApiRequest(`/api/v1/execution-systems/${encodeURIComponent(key)}`, { method: "DELETE" });
          await refreshExecutionSystemsFromApi();
        } else {
          collection.splice(index, 1);
          saveReferenceDataCollection(kind);
        }

        if (referenceDataEditState?.mode === "edit" && referenceDataEditState.kind === kind) {
          const collectionReloadedFromApi = DEMO_API_ENABLED && [
            "servicingBranch",
            "settlementSystem",
            "tradeCaptureChannel"
          ].includes(kind);

          if (referenceDataEditState.index === index || collectionReloadedFromApi) {
            referenceDataEditState = null;
          } else if (referenceDataEditState.index > index) {
            referenceDataEditState.index -= 1;
          }
        }

        setReferenceDataStatus(
          completedActionMessage(
            `${referenceDataKindLabel(kind)} "${referenceDataItemName(kind, item)}" (ID ${key})`,
            "removed"
          ),
          "success"
        );
        renderReferenceData();
        renderPricingContexts();
      } catch (error) {
        setReferenceDataStatus(error.message, "error");
      }
    }

    function viewReferenceDataExecutionContexts(kind, index) {
      const item = referenceDataCollection(kind)[index];

      if (!item || referenceDataUsageCount(kind, item) <= 0) {
        return;
      }

      const referenceId = referenceDataKey(kind, item);
      referenceDataEditState = null;
      setReferenceDataStatus("");
      location.hash = pricingRoute(kind, referenceId);
    }

    function handleReferenceDataClick(event) {
      const button = event.target.closest("[data-reference-action]");

      if (!button) {
        return;
      }

      const kind = button.dataset.referenceKind;
      const action = button.dataset.referenceAction;
      const index = Number(button.dataset.referenceIndex);
      const row = button.closest("[data-reference-edit-row]");

      if (action === "edit") {
        startReferenceDataEdit(kind, index);
      } else if (action === "remove") {
        removeReferenceDataItem(kind, index);
      } else if (action === "view-execution-contexts") {
        viewReferenceDataExecutionContexts(kind, index);
      } else if (action === "cancel") {
        cancelReferenceDataForm();
      } else if (action === "save" && row) {
        saveReferenceDataFromRow(row);
      }
    }

    function toggleColumnFilterValue(excludedValues, value, checked) {
      if (checked) {
        excludedValues.delete(value);
      } else {
        excludedValues.add(value);
      }
    }

    function handleColumnFilterTriggerClick(event) {
      event.stopPropagation();

      const trigger = event.currentTarget;
      const scope = trigger.dataset.columnFilterScope;
      const field = trigger.dataset.columnFilterField;

      if (!scope || !field) {
        return;
      }

      if (activeColumnFilter?.trigger === trigger) {
        closeColumnFilterPopover();
        return;
      }

      closeColumnFilterPopover();
      activeColumnFilter = { scope, field, trigger };
      renderActiveColumnFilterPopover();
    }

    function handleColumnFilterPopoverChange(event) {
      const checkbox = event.target.closest("[data-column-filter-value]");

      if (!checkbox || !activeColumnFilter) {
        return;
      }

      const runtime = columnFilterRuntime(activeColumnFilter.scope, activeColumnFilter.field);
      const excludedValues = runtime.filterState[runtime.field];

      toggleColumnFilterValue(excludedValues, checkbox.dataset.columnFilterValue, checkbox.checked);
      runtime.render();
      renderActiveColumnFilterPopover();
    }

    function handleColumnFilterPopoverClick(event) {
      event.stopPropagation();

      const button = event.target.closest("[data-reference-filter-action]");

      if (!button || !activeColumnFilter) {
        return;
      }

      const runtime = columnFilterRuntime(activeColumnFilter.scope, activeColumnFilter.field);

      if (button.dataset.referenceFilterAction === "select-all") {
        selectAllColumnFilter(
          runtime.filterState,
          runtime.knownValuesMap,
          runtime.initializedFields,
          runtime.field,
          runtime.values
        );
      } else {
        clearColumnFilter(
          runtime.filterState,
          runtime.knownValuesMap,
          runtime.initializedFields,
          runtime.field,
          runtime.values
        );
      }

      runtime.render();
      renderActiveColumnFilterPopover();
    }

    function handleColumnFilterDocumentClick(event) {
      if (!activeColumnFilter) {
        return;
      }

      const target = event.target;

      if (
        activeColumnFilter.trigger.closest(".reference-column-filter")?.contains(target) ||
        columnFilterPopover?.contains(target)
      ) {
        return;
      }

      closeColumnFilterPopover();
    }

    function handleColumnFilterKeydown(event) {
      if (event.key === "Escape" && activeColumnFilter) {
        closeColumnFilterPopover();
      }
    }

    async function openClientDealGenerationDialog() {
      clientDealSettingsButton.setAttribute("aria-expanded", "true");

      openDialogWithoutFieldFocus(clientDealGenerationDialog);

      await loadClientDealGenerationSettingsFromApi();
      const tableViewport = clientDealGenerationDialog.querySelector(
        ".generation-settings-table-wrap"
      );

      if (tableViewport) {
        tableViewport.scrollLeft = 0;
      }

    }

    function closeClientDealGenerationDialog() {
      clientDealSettingsButton.setAttribute("aria-expanded", "false");
      clientDealGenerationSettingsEditPricingRuleId = null;

      if (typeof clientDealGenerationDialog.close === "function") {
        clientDealGenerationDialog.close();
      } else {
        clientDealGenerationDialog.removeAttribute("open");
      }
    }

    function setMarketStatus(message, tone = "") {
      setWorkbenchPageStatus(marketStatusEl, message, tone);
    }

    function activeMarketKind() {
      const settingsState = currencySettingsRouteStateFromLocation();
      const legacyMarketMatch = /^#(?:market-pulse|market)(?::([^:]+))?$/.exec(location.hash);
      const routeKind = settingsState.matches
        ? settingsState.kind
        : legacyMarketMatch?.[1];

      if (routeKind === "pairs" || routeKind === "currency-pairs" || routeKind === "ccy-pair-options") {
        return "pairs";
      }

      if (routeKind === "currencies" || routeKind === "ccy-options") {
        return "currencies";
      }

      return "streams";
    }

    function marketSettingsScopeLabel(scope) {
      const currency = ccyOptions.find(item => item.code === scope.currencyCode);

      return `Currency Pairs for ${scope.currencyCode}${currency?.name ? ` — ${currency.name}` : ""}`;
    }

    function syncMarketPairActionsColumn() {
      const actionsColumn = marketPairOptionGrid?.getColumn("actions");

      if (!actionsColumn) {
        return;
      }

      if (marketSettingsRouteScope) {
        actionsColumn.hide();
      } else {
        actionsColumn.show();
      }
    }

    function syncMarketSettingsRouteView() {
      const routeState = currencySettingsRouteStateFromLocation();
      const nextScope = routeState.mode === "related" && routeState.scope
        ? routeState.scope
        : null;
      const scopeChanged = marketSettingsRouteScope?.currencyCode !== nextScope?.currencyCode;

      marketSettingsRouteScope = nextScope;
      marketPage.classList.toggle("is-related-view", Boolean(marketSettingsRouteScope));
      marketPairOptionNewButton.hidden = Boolean(marketSettingsRouteScope);
      marketSettingsBreadcrumb.hidden = !marketSettingsRouteScope;

      if (marketSettingsRouteScope) {
        marketCcyOptionsEditState = null;
        marketPairOptionsEditState = null;
        marketSettingsBreadcrumbBackLink.href = marketSettingsRouteScope.returnHash;
        marketSettingsBreadcrumbBackLink.textContent = "Currency Settings";
        marketSettingsBreadcrumbCurrent.textContent = marketSettingsScopeLabel(marketSettingsRouteScope);

        if (scopeChanged) {
          marketPairOptionGrid?.clearHeaderFilter();
        }
      }

      syncMarketPairActionsColumn();
    }

    function updateMarketVisibility() {
      const activeKind = activeMarketKind();
      const pageTitle = activeKind === "currencies"
        ? "Currency Settings"
        : activeKind === "pairs"
          ? "Currency Pair Settings"
          : "Market Pulse";

      marketPageTitle.textContent = pageTitle;
      marketPageHeader.setAttribute("aria-label", `${pageTitle} header`);

      marketPanels.forEach(panel => {
        panel.hidden = panel.dataset.marketPanel !== activeKind;
      });

      window.requestAnimationFrame(() => {
        const activeGrid = activeKind === "currencies"
          ? marketCcyOptionGrid
          : activeKind === "pairs"
            ? marketPairOptionGrid
            : marketStreamGrid;
        const activeGridReady = activeKind === "currencies"
          ? marketCcyOptionGridReady
          : activeKind === "pairs"
            ? marketPairOptionGridReady
            : marketStreamGridReady;

        if (activeGridReady) {
          activeGrid?.redraw(true);
        }
      });
    }

    function defaultMarketCcyDraft() {
      return { code: "", name: "", country: "", fractionDigits: 2, pairCount: 0 };
    }

    function marketCcyPairCount(code) {
      return marketPairs.filter(pair => pair.baseCcy === code || pair.quoteCcy === code).length;
    }

    function tabulatorTooltipTargetsInteractiveElement(event, boundary) {
      const target = event?.target;

      if (!(target instanceof Element)) {
        return false;
      }

      const interactiveTarget = target.closest(
        "[data-tooltip], button, input, select, textarea, a"
      );

      return Boolean(interactiveTarget && boundary?.contains(interactiveTarget));
    }

    function tabulatorCellOverflowTooltip(event, cell) {
      const element = cell?.getElement?.();

      if (
        !(element instanceof Element)
        || tabulatorTooltipTargetsInteractiveElement(event, element)
      ) {
        return "";
      }

      const overflowSource = element.querySelector(
        "[data-smart-tooltip-content], [data-smart-width-content], .position-label-text"
      ) || element;

      if (!tableContentIsClipped(overflowSource, element)) {
        return "";
      }

      const text = smartCellText(element);

      return text ? escapeHtml(text) : "";
    }

    function tabulatorHeaderOverflowTooltip(event, column) {
      const element = column?.getElement?.();

      if (
        !(element instanceof Element)
        || tabulatorTooltipTargetsInteractiveElement(event, element)
      ) {
        return "";
      }

      const overflowSource = element.querySelector(".tabulator-col-title") || element;

      if (!tableContentIsClipped(overflowSource, element)) {
        return "";
      }

      const text = smartHeaderLabel(overflowSource);

      return text ? escapeHtml(text) : "";
    }

    function tabulatorSizedColumn(size, definition) {
      const policy = tableColumnPolicy(size);

      return {
        minWidth: policy.min,
        maxWidth: policy.max,
        tooltip: tabulatorCellOverflowTooltip,
        headerTooltip: tabulatorHeaderOverflowTooltip,
        ...definition
      };
    }

    function tabulatorIconColumnTitle(icon, tooltip) {
      return `
        <span
          class="button-icon"
          role="img"
          tabindex="0"
          aria-label="${escapeHtml(tooltip)}"
          data-tooltip="${escapeHtml(tooltip)}"
        >
          ${escapeHtml(icon)}
        </span>
      `;
    }

    function marketTabulatorOptions(placeholder, columns, data = [], overrides = {}, tableKey = "") {
      const configuredColumns = tableKey ? uiTableColumns(tableKey, columns) : columns;
      const defaults = {
        layout: "fitDataTable",
        index: "id",
        data,
        placeholder,
        movableColumns: false,
        resizableColumns: false,
        headerFilterLiveFilterDelay: 250,
        columnDefaults: {
          resizable: false,
          vertAlign: "middle",
          tooltip: tabulatorCellOverflowTooltip,
          headerTooltip: tabulatorHeaderOverflowTooltip
        },
        columns: configuredColumns
      };

      return {
        ...defaults,
        ...overrides,
        columnDefaults: {
          ...defaults.columnDefaults,
          ...(overrides.columnDefaults || {})
        },
        columns: configuredColumns
      };
    }

    function batchStatusTokenMarkup(value) {
      const status = String(value || "").trim().toUpperCase();
      const tone = status === "FORMED"
        ? " is-formed"
        : status === "ROLLED_BACK"
          ? " is-rolled-back"
          : "";

      return `<span class="batch-status-token${tone}">${escapeHtml(status)}</span>`;
    }

    function batchingHistoryStatusFormatter(cell) {
      return batchStatusTokenMarkup(cell.getValue());
    }

    function batchingHistoryReasonHeaderFilter(_cell, _onRendered, success) {
      const select = document.createElement("select");
      select.className = "form-select form-select-sm";
      select.setAttribute("aria-label", "Filter batches by formation reason");

      [
        ["", "All"],
        ["MANUAL_SELECTION", "MANUAL_SELECTION"],
        ["MAX_INTERVAL_REACHED", "MAX_INTERVAL_REACHED"],
        ["TRANSFER_RATE_CORRIDOR_BREACHED", "TRANSFER_RATE_CORRIDOR_BREACHED"]
      ].forEach(([value, label]) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        select.append(option);
      });
      select.addEventListener("change", () => success(select.value));

      return select;
    }

    function batchingHistoryStatusHeaderFilter(_cell, _onRendered, success) {
      const select = document.createElement("select");
      select.className = "form-select form-select-sm";
      select.setAttribute("aria-label", "Filter batches by status");

      [
        ["", "All"],
        ["BUILDING", "BUILDING"],
        ["FORMED", "FORMED"],
        ["ROLLED_BACK", "ROLLED_BACK"]
      ].forEach(([value, label]) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        select.append(option);
      });
      select.addEventListener("change", () => success(select.value));

      return select;
    }
