    function batchingSummaryFractionDigits(source) {
      return source.reduce((maximum, deal) => {
        const fractionDigits = positionBaseCcyFractionDigits(deal);
        return fractionDigits === null ? maximum : Math.max(maximum, fractionDigits);
      }, 0);
    }

    function sideAmountMinor(deal, side, targetFractionDigits) {
      if (sideOf(deal) !== side) {
        return 0n;
      }

      const amountMinor = positionBaseAmountMinor(deal);
      const sourceFractionDigits = positionBaseCcyFractionDigits(deal);

      if (amountMinor === null || sourceFractionDigits === null) {
        return 0n;
      }

      return scaledMinorAmount(
        amountMinor,
        sourceFractionDigits,
        targetFractionDigits
      );
    }

    function sideWeightedAverage(source, side, valueOf, targetFractionDigits) {
      const weighted = source.reduce((acc, deal) => {
        if (sideOf(deal) !== side) {
          return acc;
        }

        const amountMinor = sideAmountMinor(deal, side, targetFractionDigits);
        const value = valueOf(deal);
        let decimalValue;

        if (amountMinor <= 0n || value === null || value === undefined) {
          return acc;
        }

        try {
          decimalValue = new Big(String(value));
        } catch {
          return acc;
        }

        if (decimalValue.lte(0)) {
          return acc;
        }

        acc.sum = acc.sum.plus(decimalValue.times(amountMinor.toString()));
        acc.amountMinor += amountMinor;
        return acc;
      }, { sum: new Big(0), amountMinor: 0n });

      return weighted.amountMinor === 0n
        ? null
        : weighted.sum.div(weighted.amountMinor.toString()).toString();
    }

    function batchingSideSummary(source, side, targetFractionDigits) {
      const sideRows = source.filter(deal => sideOf(deal) === side);

      return {
        amountMinor: sideRows.reduce(
          (sum, deal) => sum + sideAmountMinor(deal, side, targetFractionDigits),
          0n
        ),
        tradeRate: sideWeightedAverage(
          source,
          side,
          positionTradeRate,
          targetFractionDigits
        ),
        transferRate: sideWeightedAverage(
          source,
          side,
          positionTransferRate,
          targetFractionDigits
        )
      };
    }

    function hedgeQuickModeSettingForPair(pairValue = activeCurrencyPairOrDefault()) {
      const pair = normalizedPricingRuleCurrencyPair(pairValue);

      return hedgeQuickModeSettings.find(setting => setting.currencyPair === pair) || null;
    }

    function hedgeQuickModePresetAmountLabel(setting, preset) {
      const amountText = positiveDecimalInputText(preset?.baseCcyAmount);

      return amountText === null
        ? ""
        : `${setting.baseCcyCode} ${groupedDecimalText(amountText)}`;
    }

    function hedgeQuickModePresetToolbarLabel(preset, useMillionScale) {
      if (!useMillionScale) {
        return compactHedgeQuickModeAmount(preset?.baseCcyAmount);
      }

      try {
        return new Big(String(preset?.baseCcyAmount || 0))
          .div("1000000")
          .toFixed(2)
          .replace(/\.?0+$/, "");
      } catch {
        return compactHedgeQuickModeAmount(preset?.baseCcyAmount);
      }
    }

    function hedgeQuickModeUsesMillionScale(setting) {
      return Boolean(setting?.presets?.length)
        && setting.presets.every(preset => {
          try {
            return new Big(String(preset.baseCcyAmount)).gte("1000000")
              && new Big(String(preset.baseCcyAmount)).mod("1000000").eq(0);
          } catch {
            return false;
          }
        });
    }

    function selectedHedgeQuickModePreset(setting) {
      if (!setting?.presets?.length) {
        return null;
      }

      const selectedCode = selectedHedgeQuickModePresetCodes.get(setting.ccyPairCode);
      const selectedPreset = setting.presets.find(
        preset => preset.presetCode === selectedCode
      ) || setting.presets[0];

      selectedHedgeQuickModePresetCodes.set(
        setting.ccyPairCode,
        selectedPreset.presetCode
      );
      return selectedPreset;
    }

    function hedgeQuickModeActionMarkup(side, baseCcyCode, disabled) {
      const normalizedSide = String(side || "").trim().toUpperCase();
      const tone = normalizedSide === "SELL" ? "danger" : "success";
      const label = `${normalizedSide} ${baseCcyCode}`;
      const accessibleLabel = disabled
        ? `${label} is unavailable until Quick Hedge settings and its configured price stream are available.`
        : `${label}. Hold Ctrl and click`;

      return `
        <button type="button"
          class="btn btn-sm btn-outline-${tone} hedge-quick-action hedge-quick-action-${normalizedSide.toLowerCase()}"
          data-hedge-quick-action="${normalizedSide}"
          aria-label="${escapeHtml(accessibleLabel)}"
          aria-keyshortcuts="Control+Enter"
          ${disabled ? "disabled" : ""}>
          <span class="button-icon" aria-hidden="true">bolt</span>
          <span>${escapeHtml(label)}</span>
        </button>
      `;
    }

    function hedgeQuickModeBoundaryMarkup(position) {
      const normalizedPosition = position === "end" ? "end" : "start";
      const icon = hedgeQuickModeUnlocked ? "lock_open" : "lock";
      const tooltip = hedgeQuickModeUnlocked
        ? "Quick Hedging unlocked"
        : "Quick Hedging locked · Hold Ctrl to unlock";

      return `
        <span class="hedge-quick-boundary hedge-quick-boundary-${normalizedPosition}"
          aria-hidden="true"
          data-hedge-quick-lock="${normalizedPosition}"
          data-tooltip="${escapeHtml(tooltip)}">
          <span class="button-icon" aria-hidden="true">${icon}</span>
        </span>
      `;
    }

    function syncHedgeQuickModeQuoteAlignment() {
      hedgeQuickModeToolbar.classList.remove("is-market-aligned");
      hedgeQuickModeToolbar.style.removeProperty("--hedge-quick-action-width");
      hedgeQuickModeToolbar.style.removeProperty("--hedge-quick-execution-left");
      hedgeQuickModeToolbar.style.removeProperty("--hedge-quick-preset-width");
      hedgeQuickModeToolbar.style.removeProperty("--hedge-quick-quote-width");

      if (mainPage.hidden || window.innerWidth <= 860) {
        return;
      }

      const marketBidHeader = document.querySelector(
        ".position-grid .column-title .market-left"
      );
      const marketOfferHeader = document.querySelector(
        ".position-grid .column-title .market-right"
      );
      const sellAction = hedgeQuickModeToolbar.querySelector(
        '[data-hedge-quick-action="SELL"]'
      );
      const buyAction = hedgeQuickModeToolbar.querySelector(
        '[data-hedge-quick-action="BUY"]'
      );
      const quotePanel = hedgeQuickModeToolbar.querySelector(".hedge-quick-quote");

      if (!marketBidHeader || !marketOfferHeader || !sellAction || !buyAction || !quotePanel) {
        return;
      }

      const toolbarRect = hedgeQuickModeToolbar.getBoundingClientRect();
      const bidRect = marketBidHeader.getBoundingClientRect();
      const offerRect = marketOfferHeader.getBoundingClientRect();
      const quoteLeft = bidRect.left - toolbarRect.left;
      const quoteRight = offerRect.right - toolbarRect.left;
      const quoteWidth = quoteRight - quoteLeft;
      const actionGap = 8;
      const actionWidth = Math.floor(Math.min(
        118,
        quoteLeft - actionGap,
        toolbarRect.width - quoteRight - actionGap - 32
      ));
      const executionLeft = quoteLeft - actionGap - actionWidth;
      const presetWidth = executionLeft - 10;

      if (quoteLeft < 0
        || quoteRight > toolbarRect.width
        || quoteWidth <= 0
        || actionWidth < 82
        || presetWidth < 280) {
        return;
      }

      hedgeQuickModeToolbar.style.setProperty(
        "--hedge-quick-action-width",
        `${actionWidth}px`
      );
      hedgeQuickModeToolbar.style.setProperty(
        "--hedge-quick-execution-left",
        `${executionLeft}px`
      );
      hedgeQuickModeToolbar.style.setProperty(
        "--hedge-quick-preset-width",
        `${presetWidth}px`
      );
      hedgeQuickModeToolbar.style.setProperty(
        "--hedge-quick-quote-width",
        `${quoteWidth}px`
      );
      hedgeQuickModeToolbar.classList.add("is-market-aligned");
    }

    function scheduleHedgeQuickModeQuoteAlignment() {
      if (hedgeQuickModeAlignmentFrame !== null) {
        cancelAnimationFrame(hedgeQuickModeAlignmentFrame);
      }

      hedgeQuickModeAlignmentFrame = requestAnimationFrame(() => {
        hedgeQuickModeAlignmentFrame = null;
        syncHedgeQuickModeQuoteAlignment();
      });
    }

    function hedgeQuickModeToolbarStructureSignature(currencyPair, setting, selectedPreset) {
      if (!setting) {
        return JSON.stringify({ currencyPair, configured: false });
      }

      return JSON.stringify({
        currencyPair,
        baseCcyCode: setting.baseCcyCode,
        active: setting.active,
        available: setting.available,
        selectedPresetCode: selectedPreset?.presetCode || "",
        dealCreating: hedgeQuickModeDealCreating,
        presets: setting.presets.map(preset => ({
          presetCode: preset.presetCode,
          label: preset.label,
          baseCcyAmountMinor: preset.baseCcyAmountMinor
        }))
      });
    }

    function syncHedgeQuickModeToolbarQuote(currencyPair, setting, selectedPreset) {
      const quotePanel = hedgeQuickModeToolbar.querySelector(".hedge-quick-quote");

      if (!quotePanel || !setting) {
        return;
      }

      const pair = marketPairs.find(candidate => candidate.currencyPair === currencyPair);
      const quote = currentMarketQuoteForPair(currencyPair);
      const bid = quote ? formatMarketQuote(quote.bid, pair) : "—";
      const offer = quote ? formatMarketQuote(quote.offer, pair) : "—";
      const bidEl = quotePanel.querySelector('[data-hedge-quick-quote="bid"]');
      const offerEl = quotePanel.querySelector('[data-hedge-quick-quote="offer"]');

      if (bidEl && bidEl.textContent !== bid) {
        bidEl.textContent = bid;
      }

      if (offerEl && offerEl.textContent !== offer) {
        offerEl.textContent = offer;
      }

      const quoteLabel = `${currencyPair} configured price stream: Bid ${bid}, Offer ${offer}`;
      if (quotePanel.getAttribute("aria-label") !== quoteLabel) {
        quotePanel.setAttribute("aria-label", quoteLabel);
      }

      const settingAvailable = setting.active
        && setting.available
        && setting.presets.length > 0;
      const controlsAvailable = settingAvailable && !hedgeQuickModeDealCreating;
      const actionsDisabled = !hedgeQuickModeUnlocked
        || !settingAvailable
        || !selectedPreset
        || !quote
        || hedgeQuickModeDealCreating;

      hedgeQuickModeToolbar.classList.toggle("is-unlocked", hedgeQuickModeUnlocked);
      hedgeQuickModeToolbar.setAttribute(
        "aria-label",
        hedgeQuickModeUnlocked
          ? "Quick Mode Hedge controls unlocked"
          : "Quick Mode Hedge controls locked. Hold Control to unlock."
      );

      hedgeQuickModeToolbar.querySelectorAll("[data-hedge-quick-preset]").forEach(preset => {
        preset.disabled = !hedgeQuickModeUnlocked || !controlsAvailable;
      });

      const lockTooltip = hedgeQuickModeUnlocked
        ? "Quick Hedging unlocked"
        : "Quick Hedging locked · Hold Ctrl to unlock";
      hedgeQuickModeToolbar.querySelectorAll("[data-hedge-quick-lock]").forEach(lock => {
        const icon = lock.querySelector(".button-icon");
        if (icon) {
          icon.textContent = hedgeQuickModeUnlocked ? "lock_open" : "lock";
        }
        if (lock.getAttribute("data-tooltip") !== lockTooltip) {
          lock.setAttribute("data-tooltip", lockTooltip);
        }
      });

      hedgeQuickModeToolbar.querySelectorAll("[data-hedge-quick-action]").forEach(action => {
        const side = String(action.dataset.hedgeQuickAction || "").trim().toUpperCase();
        const label = `${side} ${setting.baseCcyCode}`;
        const accessibleLabel = actionsDisabled
          ? `${label} is unavailable until Quick Hedge settings and its configured price stream are available.`
          : `${label}. Hold Ctrl and click`;

        action.disabled = actionsDisabled;
        if (action.getAttribute("aria-label") !== accessibleLabel) {
          action.setAttribute("aria-label", accessibleLabel);
        }

        if (action.hasAttribute("data-tooltip")) {
          action.removeAttribute("data-tooltip");
        }
      });
    }

    function setHedgeQuickModeUnlocked(unlocked) {
      const nextUnlocked = unlocked === true && !document.hidden && !hedgeQuickModeDealCreating;

      if (hedgeQuickModeUnlocked === nextUnlocked) {
        return;
      }

      hedgeQuickModeUnlocked = nextUnlocked;
      const currencyPair = normalizedPricingRuleCurrencyPair(activeCurrencyPairOrDefault());
      const setting = hedgeQuickModeSettingForPair(currencyPair);
      syncHedgeQuickModeToolbarQuote(
        currencyPair,
        setting,
        selectedHedgeQuickModePreset(setting)
      );
    }

    function renderHedgeQuickModeToolbar() {
      const currencyPair = normalizedPricingRuleCurrencyPair(activeCurrencyPairOrDefault());
      const setting = hedgeQuickModeSettingForPair(currencyPair);
      const selectedPreset = selectedHedgeQuickModePreset(setting);
      const structureSignature = hedgeQuickModeToolbarStructureSignature(
        currencyPair,
        setting,
        selectedPreset
      );

      if (hedgeQuickModeToolbarSignature === structureSignature) {
        syncHedgeQuickModeToolbarQuote(currencyPair, setting, selectedPreset);
        return;
      }

      hedgeQuickModeToolbarSignature = structureSignature;

      if (!setting) {
        hedgeQuickModeToolbar.innerHTML = `
          <div class="hedge-quick-toolbar-state text-secondary">
            <span class="button-icon" aria-hidden="true">bolt</span>
            <span>Quick Mode is not configured for ${escapeHtml(currencyPair)}.</span>
          </div>
        `;
        scheduleHedgeQuickModeQuoteAlignment();
        return;
      }

      const pair = marketPairs.find(candidate => candidate.currencyPair === currencyPair);
      const quote = currentMarketQuoteForPair(currencyPair);
      const bid = quote ? formatMarketQuote(quote.bid, pair) : "—";
      const offer = quote ? formatMarketQuote(quote.offer, pair) : "—";
      const settingAvailable = setting.active
        && setting.available
        && setting.presets.length > 0;
      const actionsDisabled = !settingAvailable
        || !hedgeQuickModeUnlocked
        || !selectedPreset
        || !quote
        || hedgeQuickModeDealCreating;
      const useMillionScale = hedgeQuickModeUsesMillionScale(setting);
      const presetButtons = setting.presets.map(preset => {
        const selected = preset.presetCode === selectedPreset?.presetCode;
        const amountLabel = hedgeQuickModePresetAmountLabel(setting, preset);
        const tooltip = `${preset.label} · ${amountLabel}`;

        return `
          <button type="button"
            class="btn btn-sm hedge-quick-preset${selected ? " active" : ""}"
            data-hedge-quick-preset="${escapeHtml(preset.presetCode)}"
            aria-label="${escapeHtml(`Select ${tooltip}`)}"
            aria-pressed="${selected}"
            data-tooltip="${escapeHtml(tooltip)}"
            ${settingAvailable && hedgeQuickModeUnlocked && !hedgeQuickModeDealCreating ? "" : "disabled"}>
            ${escapeHtml(hedgeQuickModePresetToolbarLabel(preset, useMillionScale))}
          </button>
        `;
      }).join("");

      hedgeQuickModeToolbar.innerHTML = `
        <div class="hedge-quick-presets" aria-label="Quick Mode base currency amount">
          ${hedgeQuickModeBoundaryMarkup("start")}
          <div class="btn-group btn-group-sm" role="group" aria-label="Quick Mode amount presets">
            ${presetButtons}
          </div>
          <span class="hedge-quick-preset-unit">${escapeHtml(
            useMillionScale ? `mio ${setting.baseCcyCode}` : setting.baseCcyCode
          )}</span>
        </div>
        <div class="hedge-quick-execution">
          ${hedgeQuickModeActionMarkup("SELL", setting.baseCcyCode, actionsDisabled)}
          <div class="hedge-quick-quote" aria-label="${escapeHtml(`${currencyPair} configured price stream: Bid ${bid}, Offer ${offer}`)}">
            <span class="hedge-quick-quote-value text-success" data-hedge-quick-quote="bid">${escapeHtml(bid)}</span>
            <span class="hedge-quick-quote-value text-danger" data-hedge-quick-quote="offer">${escapeHtml(offer)}</span>
          </div>
          ${hedgeQuickModeActionMarkup("BUY", setting.baseCcyCode, actionsDisabled)}
          ${hedgeQuickModeBoundaryMarkup("end")}
        </div>
      `;
      syncHedgeQuickModeToolbarQuote(currencyPair, setting, selectedPreset);
      scheduleHedgeQuickModeQuoteAlignment();
    }

    function selectHedgeQuickModePreset(presetCode, controlConfirmed) {
      const setting = hedgeQuickModeSettingForPair();
      const normalizedPresetCode = String(presetCode || "").trim().toUpperCase();
      const preset = setting?.presets.find(
        candidate => candidate.presetCode === normalizedPresetCode
      );

      if (!controlConfirmed
        || !hedgeQuickModeUnlocked
        || !setting?.active
        || !setting.available
        || !preset
        || hedgeQuickModeDealCreating) {
        return;
      }

      selectedHedgeQuickModePresetCodes.set(setting.ccyPairCode, preset.presetCode);
      renderHedgeQuickModeToolbar();
      requestAnimationFrame(() => {
        hedgeQuickModeToolbar
          .querySelector(`[data-hedge-quick-preset="${preset.presetCode}"]`)
          ?.focus();
      });
    }

    async function createSelectedQuickHedgeDeal(ourSide, controlConfirmed) {
      const normalizedSide = String(ourSide || "").trim().toUpperCase();
      const setting = hedgeQuickModeSettingForPair();
      const preset = selectedHedgeQuickModePreset(setting);

      if (!["BUY", "SELL"].includes(normalizedSide) || !preset) {
        return;
      }

      if (!controlConfirmed || !hedgeQuickModeUnlocked) {
        setBatchStatus(
          `Hold Ctrl and click ${normalizedSide} ${setting.baseCcyCode} to create a Quick Mode Hedge Deal.`,
          "warning"
        );
        return;
      }

      setHedgeQuickModeUnlocked(false);
      await createQuickHedgeDeal(normalizedSide, preset.presetCode);
    }

    function renderBatchingSummary(source) {
      const fractionDigits = batchingSummaryFractionDigits(source);
      const sell = batchingSideSummary(source, "sell", fractionDigits);
      const buy = batchingSideSummary(source, "buy", fractionDigits);
      const netMinor = sell.amountMinor - buy.amountMinor;
      const sellNetMinor = netMinor > 0n ? netMinor : 0n;
      const buyNetMinor = netMinor < 0n ? -netMinor : 0n;

      batchingSummaryRowsEl.innerHTML = `
        <tr class="batching-summary-row batching-summary-total">
          <td class="summary-label" colspan="4">Total</td>
          <td class="gap wide-gap trade-divider"></td>
          <td class="summary-sell amount number">${minorAmountCell(sell.amountMinor, fractionDigits)}</td>
          <td class="summary-sell rate number">${rateCell(sell.tradeRate)}</td>
          <td class="summary-sell rate number">${rateCell(sell.transferRate)}</td>
          <td class="summary-bridge" colspan="4"></td>
          <td class="summary-buy rate number">${rateCell(buy.transferRate)}</td>
          <td class="summary-buy rate number">${rateCell(buy.tradeRate)}</td>
          <td class="summary-buy amount number">${minorAmountCell(buy.amountMinor, fractionDigits)}</td>
        </tr>
        <tr class="batching-summary-row batching-summary-net">
          <td class="summary-label" colspan="4">Net Difference</td>
          <td class="gap wide-gap trade-divider"></td>
          <td class="summary-sell ${sellNetMinor > 0n ? "summary-net-active sell-side" : ""} amount number">${minorAmountCell(sellNetMinor, fractionDigits)}</td>
          <td class="summary-sell rate"></td>
          <td class="summary-sell rate"></td>
          <td class="summary-bridge" colspan="4"></td>
          <td class="summary-buy rate"></td>
          <td class="summary-buy rate"></td>
          <td class="summary-buy ${buyNetMinor > 0n ? "summary-net-active buy-side" : ""} amount number">${minorAmountCell(buyNetMinor, fractionDigits)}</td>
        </tr>
      `;
    }

    function positionGridFillRow() {
      return `
        <tr class="position-grid-fill" aria-hidden="true">
          <td class="identity trade-id-column"></td>
          <td class="identity client"></td>
          <td class="identity date"></td>
          <td class="identity base-value-date"></td>
          <td class="gap wide-gap trade-divider"></td>
          <td class="sell-zone sell-zone-left amount"></td>
          <td class="sell-zone rate"></td>
          <td class="sell-zone sell-zone-right rate"></td>
          <td class="gap selection-gap sell-check-zone"></td>
          <td class="market-left"></td>
          <td class="market-right"></td>
          <td class="gap selection-gap buy-check-zone"></td>
          <td class="buy-zone rate"></td>
          <td class="buy-zone rate"></td>
          <td class="buy-zone amount"></td>
        </tr>
      `;
    }

    function syncPositionGridFillHeight() {
      const fillRow = rowsEl.querySelector(".position-grid-fill");

      if (!fillRow || !positionGridFrame || !positionGrid) {
        return;
      }

      fillRow.style.height = "0px";
      Array.from(fillRow.cells).forEach(cell => {
        cell.style.height = "0px";
      });

      const availableHeight = Math.max(
        0,
        Math.floor(positionGridFrame.clientHeight - positionGrid.getBoundingClientRect().height)
      );
      const fillHeight = `${availableHeight}px`;

      fillRow.style.height = fillHeight;
      Array.from(fillRow.cells).forEach(cell => {
        cell.style.height = fillHeight;
      });
    }

    function schedulePositionGridFillHeight() {
      if (positionGridFillFrame !== null) {
        return;
      }

      positionGridFillFrame = window.requestAnimationFrame(() => {
        positionGridFillFrame = null;
        syncPositionGridFillHeight();
      });
    }

    function clientDealClientCode(deal) {
      return deal.clientCode || deal.inn || "";
    }

    function clientDealClientCodeType(deal) {
      return deal.clientCodeType ||
        clientProfileByInn(clientDealClientCode(deal))?.clientCodeType ||
        (clientDealClientCode(deal) ? "INN" : "");
    }

    function dealBaseCurrencyPosition(deal) {
      const amountMinor = positionBaseAmountMinor(deal);
      const fractionDigits = positionBaseCcyFractionDigits(deal);
      const side = sideOf(deal);

      if (amountMinor === null
        || fractionDigits === null
        || (side !== "sell" && side !== "buy")) {
        return null;
      }

      const signedMinor = side === "sell" ? amountMinor : -amountMinor;
      return minorToMajorDecimal(signedMinor.toString(), fractionDigits);
    }

    function dealQuoteCurrencyPosition(deal) {
      const amountMinor = positionQuoteAmountMinor(deal);
      const fractionDigits = positionQuoteCcyFractionDigits(deal);
      const side = sideOf(deal);

      if (amountMinor === null
        || fractionDigits === null
        || (side !== "sell" && side !== "buy")) {
        return null;
      }

      const signedMinor = side === "sell" ? -amountMinor : amountMinor;
      return minorToMajorDecimal(signedMinor.toString(), fractionDigits);
    }

    function currencyPositionCell(amount, currency) {
      let formattedAmount;

      if (typeof amount === "string" && /^[+-]?\d+(?:\.\d+)?$/.test(amount)) {
        formattedAmount = new Big(amount).eq(0) ? "" : groupedDecimalText(amount);
      } else {
        formattedAmount = amountCell(amount);
      }

      return formattedAmount ? `${formattedAmount} ${currency}` : "";
    }

    function clientDealRecords(source) {
      const records = DEMO_API_ENABLED
        ? clientDeals
        : source
            .filter(deal => deal.synthetic !== true && positionType(deal) === "CLIENT_DEAL")
            .map(normalizedClientDeal);

      return records
        .sort((left, right) =>
          String(left.clientDealId).localeCompare(String(right.clientDealId), "en", {
            numeric: true,
            sensitivity: "base"
          })
        );
    }

    function clientDealsDateLabel(value) {
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || "").trim());
      return match ? `${match[3]}.${match[2]}.${match[1]}` : String(value || "");
    }

    function clientDealsDateFormatter(cell) {
      return escapeHtml(clientDealsDateLabel(cell.getValue()));
    }

    function clientDealsTimestampFormatter(cell) {
      const value = String(cell.getValue() || "").trim();
      const timestamp = new Date(value);

      if (!value || Number.isNaN(timestamp.getTime())) {
        return escapeHtml(value);
      }

      const twoDigits = number => String(number).padStart(2, "0");
      return escapeHtml(
        `${twoDigits(timestamp.getDate())}.${twoDigits(timestamp.getMonth() + 1)}.${timestamp.getFullYear()} `
        + `${twoDigits(timestamp.getHours())}:${twoDigits(timestamp.getMinutes())}:${twoDigits(timestamp.getSeconds())}`
      );
    }

    function clientDealsAmountFormatter(cell) {
      const row = cell.getRow().getData();
      const field = cell.getField();
      const minorField = field === "baseCcyAmount"
        ? "baseCcyAmountMinor"
        : field === "quoteCcyAmount"
          ? "quoteCcyAmountMinor"
          : "";
      const fractionDigitsField = field === "baseCcyAmount"
        ? "baseCcyFractionDigits"
        : field === "quoteCcyAmount"
          ? "quoteCcyFractionDigits"
          : "";
      const fractionDigits = Number(row[fractionDigitsField]);

      if (minorField
        && Number.isSafeInteger(row[minorField])
        && Number.isInteger(fractionDigits)
        && fractionDigits >= 0
        && fractionDigits <= 10) {
        return escapeHtml(minorAmountCell(row[minorField], fractionDigits));
      }

      return escapeHtml(amountCell(cell.getValue()));
    }

    function clientDealsRateFormatter(cell) {
      return escapeHtml(rateCell(cell.getValue()));
    }

    function clientDealsMarginFormatter(cell) {
      const margin = cell.getValue();
      return Number.isFinite(margin) ? `${escapeHtml(editNumber(margin, 4))}%` : "";
    }

    function clientDealsCurrencyAmountFormatter(cell, formatterParams) {
      const row = cell.getRow().getData();
      return escapeHtml(currencyPositionCell(cell.getValue(), row[formatterParams.currencyField]));
    }

    function clientDealsSideFormatter(cell) {
      const side = String(cell.getValue() || "").toLowerCase();
      const baseCcy = String(cell.getRow().getData().currencyPair || "").split("/")[0];
      const label = baseCcy ? `${side} ${baseCcy}` : side;

      return side === "buy" || side === "sell"
        ? `<span class="side-token ${side}">${escapeHtml(label)}</span>`
        : "";
    }

    function clientDealsAnalyticalPnlFormatter(cell) {
      const row = cell.getRow().getData();
      const pnlMinor = row.analyticalPnlQuoteMinor;
      const fractionDigits = Number(row.analyticalPnlQuoteFractionDigits);
      const hasMinorPnl = Number.isSafeInteger(pnlMinor)
        && Number.isInteger(fractionDigits)
        && fractionDigits >= 0
        && fractionDigits <= 10;
      const value = Number(cell.getValue());
      const isNegative = hasMinorPnl
        ? BigInt(pnlMinor) < 0n
        : Number.isFinite(value) && value < 0;
      const formattedValue = hasMinorPnl
        ? formattedMinorAmount(pnlMinor, fractionDigits)
        : amountCell(cell.getValue());
      const tone = isNegative ? " text-danger" : "";

      return `<span class="${tone.trim()}">${escapeHtml(formattedValue)}</span>`;
    }

    function clientDealsPositionManagementModeFormatter(cell) {
      return positionManagementModeBadgeMarkup(cell.getValue());
    }

    function clientDealsTradeContextLabel(tradeContextId) {
      const normalizedId = Number(tradeContextId);

      if (!Number.isInteger(normalizedId) || normalizedId <= 0) {
        return "";
      }

      const context = pricingContextById(String(normalizedId));
      return context ? pricingContextDisplayPath(context) : `Trade Context #${normalizedId}`;
    }

    function dealsTradeContextFormatter(cell) {
      const row = cell.getRow().getData();
      const normalizedId = Number(row.tradeContextId);
      const context = Number.isInteger(normalizedId) && normalizedId > 0
        ? pricingContextById(String(normalizedId))
        : null;

      if (!context) {
        return escapeHtml(cell.getValue() || "");
      }

      const label = pricingContextDisplayPath(context);
      return `
        <span
          class="client-pricing-context-candidate-path deals-trade-context-path"
          role="group"
          aria-label="Trade Context: ${escapeHtml(label)}"
          data-smart-width-content
        >
          ${pricingContextFacetsMarkup(context)}
        </span>
      `;
    }

    function clientDealsValueColumn(size, definition) {
      return tabulatorSizedColumn(size, definition);
    }

    function clientDealsFilterableColumn(size, definition) {
      return clientDealsValueColumn(size, {
        headerFilter: "input",
        headerFilterFunc: "like",
        ...definition
      });
    }

    function dealsViewMode(scope) {
      return scope === "hedge" ? hedgeDealsViewMode : clientDealsViewMode;
    }

    function syncDealsAuditToggle(scope) {
      const auditViewEnabled = dealsViewMode(scope) === DEALS_VIEW_MODE_AUDIT;

      dealsAuditToggles
        .filter(toggle => toggle.dataset.dealsViewScope === scope)
        .forEach(toggle => {
          toggle.checked = auditViewEnabled;
        });
    }

    function applyDealsViewMode(scope) {
      const table = scope === "hedge" ? hedgeDealsGrid : clientDealsGrid;
      const auditFields = scope === "hedge"
        ? ["requestTimestamp", "executionTimestamp", "initialPositionManagementMode", "currentPositionManagementMode"]
        : ["executionTimestamp", "initialPositionManagementMode", "currentPositionManagementMode"];
      const showAuditFields = dealsViewMode(scope) === DEALS_VIEW_MODE_AUDIT;

      auditFields.forEach(field => {
        const column = table?.getColumn(field);

        if (showAuditFields) {
          column?.show();
        } else {
          column?.hide();
        }
      });

      table?.redraw(true);
      syncDealsAuditToggle(scope);
    }

    function setDealsViewMode(scope, mode) {
      const normalizedScope = scope === "hedge" ? "hedge" : "client";
      const normalizedMode = mode === DEALS_VIEW_MODE_AUDIT
        ? DEALS_VIEW_MODE_AUDIT
        : DEALS_VIEW_MODE_STANDARD;

      if (normalizedScope === "hedge") {
        hedgeDealsViewMode = normalizedMode;
      } else {
        clientDealsViewMode = normalizedMode;
      }

      applyDealsViewMode(normalizedScope);
    }

    function clientDealColumnDefinitions() {
      return [
        {
          title: "Trade Details",
          cssClass: "client-deals-group-identity",
          columns: [
            clientDealsFilterableColumn("referenceId", {
              title: "Trade ID",
              field: "tradeId",
              sorter: "number",
              cssClass: "client-deals-col-identity"
            }),
            clientDealsFilterableColumn("timestamp", {
              title: "Execution Timestamp",
              field: "executionTimestamp",
              visible: clientDealsViewMode === DEALS_VIEW_MODE_AUDIT,
              formatter: clientDealsTimestampFormatter,
              cssClass: "client-deals-col-identity"
            }),
            clientDealsFilterableColumn("timestamp", {
              title: "Received Timestamp",
              field: "receivedTimestamp",
              formatter: clientDealsTimestampFormatter,
              cssClass: "client-deals-col-identity client-deals-group-end"
            })
          ]
        },
        {
          title: "Client Details",
          cssClass: "client-deals-group-client",
          columns: [
            clientDealsFilterableColumn("type", { title: "Business ID Type", field: "clientCodeType", headerSort: false, cssClass: "client-deals-col-client" }),
            clientDealsFilterableColumn("code", { title: "Business ID", field: "clientCode", headerSort: false, cssClass: "client-deals-col-client" }),
            clientDealsFilterableColumn("name", { title: "Client Name", field: "clientName", cssClass: "client-deals-col-client client-deals-group-end" })
          ]
        },
        {
          title: "Trade Economics",
          cssClass: "client-deals-group-terms",
          columns: [
            clientDealsFilterableColumn("date", { title: "Trade Date", field: "tradeDate", formatter: clientDealsDateFormatter, cssClass: "client-deals-col-terms" }),
            clientDealsFilterableColumn("pair", { title: "Ccy Pair", field: "currencyPair", cssClass: "client-deals-col-terms" }),
            clientDealsFilterableColumn("shortText", { title: "Client Side", field: "side", headerSort: false, formatter: clientDealsSideFormatter, hozAlign: "center", headerHozAlign: "center", cssClass: "client-deals-col-terms" }),
            clientDealsValueColumn("amount", { title: "Base Ccy Amount", field: "baseCcyAmount", sorter: "number", formatter: clientDealsAmountFormatter, hozAlign: "right", headerHozAlign: "right", cssClass: "client-deals-col-terms client-deals-number" }),
            clientDealsValueColumn("amount", { title: "Quote Ccy Amount", field: "quoteCcyAmount", sorter: "number", formatter: clientDealsAmountFormatter, hozAlign: "right", headerHozAlign: "right", cssClass: "client-deals-col-terms client-deals-number" }),
            clientDealsValueColumn("rate", { title: "Trade Rate", field: "tradeRate", sorter: "number", formatter: clientDealsRateFormatter, hozAlign: "right", headerHozAlign: "right", cssClass: "client-deals-col-terms client-deals-number" }),
            clientDealsFilterableColumn("tenor", { title: "Tenor", field: "tenor", headerSort: false, hozAlign: "center", headerHozAlign: "center", cssClass: "client-deals-col-terms client-deals-group-end" })
          ]
        },
        {
          title: "Value Date Details",
          cssClass: "client-deals-group-value-dates",
          columns: [
            clientDealsFilterableColumn("valueDate", { title: "Base Ccy Value Date", field: "baseCcyValueDate", formatter: clientDealsDateFormatter, cssClass: "client-deals-col-value-dates" }),
            clientDealsFilterableColumn("valueDate", { title: "Quote Ccy Value Date", field: "quoteCcyValueDate", formatter: clientDealsDateFormatter, cssClass: "client-deals-col-value-dates client-deals-group-end" })
          ]
        },
        {
          title: "Pricing Details",
          cssClass: "client-deals-group-pricing",
          columns: [
            clientDealsFilterableColumn("contextPath", { title: "Trade Context", field: "tradeContextLabel", headerSort: false, formatter: dealsTradeContextFormatter, cssClass: "client-deals-col-pricing" }),
            clientDealsValueColumn("margin", { title: "Margin %", field: "pricingRuleMargin", sorter: "number", formatter: clientDealsMarginFormatter, hozAlign: "right", headerHozAlign: "right", cssClass: "client-deals-col-pricing client-deals-number client-deals-group-end" })
          ]
        },
        {
          title: "Position Processing",
          cssClass: "client-deals-group-position-processing",
          columns: [
            clientDealsFilterableColumn("shortText", { title: "Initial Position Management Mode", field: "initialPositionManagementMode", visible: clientDealsViewMode === DEALS_VIEW_MODE_AUDIT, headerSort: false, formatter: clientDealsPositionManagementModeFormatter, cssClass: "client-deals-col-position-processing" }),
            clientDealsFilterableColumn("shortText", { title: "Current Position Management Mode", field: "currentPositionManagementMode", visible: clientDealsViewMode === DEALS_VIEW_MODE_AUDIT, headerSort: false, formatter: clientDealsPositionManagementModeFormatter, cssClass: "client-deals-col-position-processing" }),
            clientDealsValueColumn("transferRate", { title: "Transfer Rate", field: "transferRate", sorter: "number", formatter: clientDealsRateFormatter, hozAlign: "right", headerHozAlign: "right", cssClass: "client-deals-col-position-processing client-deals-number" }),
            clientDealsValueColumn("positionAmount", { title: "Analytical PnL", field: "analyticalPnl", sorter: "number", formatter: clientDealsAnalyticalPnlFormatter, hozAlign: "right", headerHozAlign: "right", cssClass: "client-deals-col-position-processing client-deals-number" })
          ]
        }
      ];
    }

    function clientDealsGridData(source) {
      return clientDealRecords(source).map((deal, index) => {
        const tradeId = Number(deal.tradeId ?? deal.clientDealId);

        return {
          rowKey: `${tradeId || "client-deal"}:${index}`,
          ...deal,
          tradeId,
          tradeContextLabel: clientDealsTradeContextLabel(deal.tradeContextId),
          pricingRuleMargin: dealPricingRuleMargin(deal)
        };
      });
    }

    function updateClientDealsCount(filteredCount = clientDealsTotalCount) {
      const total = clientDealsTotalCount;
      const dealLabel = total === 1 ? "deal" : "deals";
      clientDealsCountEl.textContent = filteredCount === total
        ? `${total} ${dealLabel}`
        : `${filteredCount} of ${total} deals`;
    }

    function initializeClientDealsGrid(data) {
      const columns = uiTableColumns("client_deals_grid", clientDealColumnDefinitions());
      clientDealsGrid = new Tabulator(clientDealsGridEl, {
        data,
        index: "rowKey",
        layout: "fitData",
        renderVertical: "virtual",
        renderVerticalBuffer: 320,
        maxHeight: "calc(100vh - 225px)",
        placeholder: "No client deals.",
        movableColumns: false,
        resizableColumns: false,
        columnHeaderVertAlign: "bottom",
        headerFilterLiveFilterDelay: 300,
        initialSort: [{ column: "tradeId", dir: "asc" }],
        columnDefaults: {
          resizable: false,
          vertAlign: "middle",
          tooltip: tabulatorCellOverflowTooltip,
          headerTooltip: tabulatorHeaderOverflowTooltip
        },
        columns
      });
      registerUiTableTabulator("client_deals_grid", clientDealsGrid);

      clientDealsGrid.on("tableBuilt", () => {
        clientDealsGridReady = true;
        updateClientDealsCount(data.length);
        applyDealsViewMode("client");
      });
      clientDealsGrid.on("dataFiltered", (_filters, rows) => {
        updateClientDealsCount(rows.length);
      });
    }

    function renderClientDeals(source) {
      const data = clientDealsGridData(source);
      clientDealsPendingData = data;
      clientDealsTotalCount = data.length;

      if (!clientDealsGrid) {
        updateClientDealsCount(data.length);

        if (!clientDealsPage.hidden) {
          initializeClientDealsGrid(data);
        }

        return;
      }

      if (!clientDealsGridReady || clientDealsPage.hidden) {
        return;
      }

      clientDealsGrid.replaceData(clientDealsPendingData).then(() => {
        clientDealsPendingData = [];
        clientDealsGrid.redraw(true);
      });
    }

    function isHedgeDeal(deal) {
      return ["HEDGE_DEAL", "MARKET_HEDGE", "HEDGE_DEAL"].includes(positionType(deal));
    }

    function hedgeDealSourceType(deal) {
      return deal?.executionVenueType || deal?.execution_venue_type || deal?.hedgeSourceType || deal?.hedge_source_type || "";
    }

    function hedgeDealSource(deal) {
      return deal?.executionVenue || deal?.execution_venue || deal?.hedgeSource || deal?.hedge_source || "";
    }

    function hedgeDealTradeContext(deal) {
      const explicitContextId = normalizedPricingContextIdValue(
        deal?.tradeContextId ?? deal?.trade_context_id ?? deal?.pricingContextId ?? deal?.pricing_context_id
      );

      if (explicitContextId) {
        return explicitContextId;
      }

      return [hedgeDealSourceType(deal), hedgeDealSource(deal)]
        .map(value => String(value || "").trim())
        .filter(Boolean)
        .join(" : ");
    }

    function hedgeDealRecords(source) {
      const records = DEMO_API_ENABLED
        ? hedgeDeals
        : source
            .filter(deal => deal.synthetic !== true && isHedgeDeal(deal))
            .map(normalizedHedgeDeal);

      return records
        .sort((left, right) =>
          String(left.hedgeDealId).localeCompare(String(right.hedgeDealId), "en", {
            numeric: true,
            sensitivity: "base"
          })
        );
    }

    function hedgeDealColumnDefinitions() {
      return [
        {
          title: "Trade Details",
          cssClass: "client-deals-group-identity",
          columns: [
            clientDealsFilterableColumn("referenceId", {
              title: "Trade ID",
              field: "tradeId",
              sorter: "number",
              cssClass: "client-deals-col-identity"
            }),
            clientDealsFilterableColumn("timestamp", {
              title: "Request Timestamp",
              field: "requestTimestamp",
              visible: hedgeDealsViewMode === DEALS_VIEW_MODE_AUDIT,
              formatter: clientDealsTimestampFormatter,
              cssClass: "client-deals-col-identity"
            }),
            clientDealsFilterableColumn("timestamp", {
              title: "Execution Timestamp",
              field: "executionTimestamp",
              visible: hedgeDealsViewMode === DEALS_VIEW_MODE_AUDIT,
              formatter: clientDealsTimestampFormatter,
              cssClass: "client-deals-col-identity"
            }),
            clientDealsFilterableColumn("timestamp", {
              title: "Received Timestamp",
              field: "receivedTimestamp",
              formatter: clientDealsTimestampFormatter,
              cssClass: "client-deals-col-identity client-deals-group-end"
            })
          ]
        },
        {
          title: "Trading Counterparty Details",
          cssClass: "client-deals-group-client",
          columns: [
            clientDealsFilterableColumn("type", { title: "Business ID Type", field: "counterpartyCodeType", headerSort: false, cssClass: "client-deals-col-client" }),
            clientDealsFilterableColumn("code", { title: "Business ID", field: "counterpartyCode", headerSort: false, cssClass: "client-deals-col-client" }),
            clientDealsFilterableColumn("name", { title: "Counterparty Name", field: "counterpartyName", cssClass: "client-deals-col-client client-deals-group-end" })
          ]
        },
        {
          title: "Trade Economics",
          cssClass: "client-deals-group-terms",
          columns: [
            clientDealsFilterableColumn("date", { title: "Trade Date", field: "tradeDate", formatter: clientDealsDateFormatter, cssClass: "client-deals-col-terms" }),
            clientDealsFilterableColumn("pair", { title: "Ccy Pair", field: "currencyPair", cssClass: "client-deals-col-terms" }),
            clientDealsFilterableColumn("shortText", { title: "Hedge Side", field: "side", headerSort: false, formatter: clientDealsSideFormatter, hozAlign: "center", headerHozAlign: "center", cssClass: "client-deals-col-terms" }),
            clientDealsValueColumn("amount", { title: "Base Ccy Amount", field: "baseCcyAmount", sorter: "number", formatter: clientDealsAmountFormatter, hozAlign: "right", headerHozAlign: "right", cssClass: "client-deals-col-terms client-deals-number" }),
            clientDealsValueColumn("amount", { title: "Quote Ccy Amount", field: "quoteCcyAmount", sorter: "number", formatter: clientDealsAmountFormatter, hozAlign: "right", headerHozAlign: "right", cssClass: "client-deals-col-terms client-deals-number" }),
            clientDealsValueColumn("rate", { title: "Trade Rate", field: "tradeRate", sorter: "number", formatter: clientDealsRateFormatter, hozAlign: "right", headerHozAlign: "right", cssClass: "client-deals-col-terms client-deals-number" }),
            clientDealsFilterableColumn("tenor", { title: "Tenor", field: "tenor", headerSort: false, hozAlign: "center", headerHozAlign: "center", cssClass: "client-deals-col-terms client-deals-group-end" })
          ]
        },
        {
          title: "Value Date Details",
          cssClass: "client-deals-group-value-dates",
          columns: [
            clientDealsFilterableColumn("valueDate", { title: "Base Ccy Value Date", field: "baseCcyValueDate", formatter: clientDealsDateFormatter, cssClass: "client-deals-col-value-dates" }),
            clientDealsFilterableColumn("valueDate", { title: "Quote Ccy Value Date", field: "quoteCcyValueDate", formatter: clientDealsDateFormatter, cssClass: "client-deals-col-value-dates client-deals-group-end" })
          ]
        },
        {
          title: "Pricing Details",
          cssClass: "client-deals-group-pricing",
          columns: [
            clientDealsFilterableColumn("contextPath", { title: "Trade Context", field: "tradeContextLabel", headerSort: false, formatter: dealsTradeContextFormatter, cssClass: "client-deals-col-pricing" }),
            clientDealsValueColumn("margin", { title: "Margin %", field: "pricingRuleMargin", sorter: "number", formatter: clientDealsMarginFormatter, hozAlign: "right", headerHozAlign: "right", cssClass: "client-deals-col-pricing client-deals-number client-deals-group-end" })
          ]
        },
        {
          title: "Position Processing",
          cssClass: "client-deals-group-position-processing",
          columns: [
            clientDealsFilterableColumn("shortText", { title: "Initial Position Management Mode", field: "initialPositionManagementMode", visible: hedgeDealsViewMode === DEALS_VIEW_MODE_AUDIT, headerSort: false, formatter: clientDealsPositionManagementModeFormatter, cssClass: "client-deals-col-position-processing" }),
            clientDealsFilterableColumn("shortText", { title: "Current Position Management Mode", field: "currentPositionManagementMode", visible: hedgeDealsViewMode === DEALS_VIEW_MODE_AUDIT, headerSort: false, formatter: clientDealsPositionManagementModeFormatter, cssClass: "client-deals-col-position-processing" }),
            clientDealsValueColumn("transferRate", { title: "Transfer Rate", field: "transferRate", sorter: "number", formatter: clientDealsRateFormatter, hozAlign: "right", headerHozAlign: "right", cssClass: "client-deals-col-position-processing client-deals-number" }),
            clientDealsValueColumn("positionAmount", { title: "Analytical PnL", field: "analyticalPnl", sorter: "number", formatter: clientDealsAnalyticalPnlFormatter, hozAlign: "right", headerHozAlign: "right", cssClass: "client-deals-col-position-processing client-deals-number" })
          ]
        }
      ];
    }

    function hedgeDealsGridData(source) {
      return hedgeDealRecords(source).map((deal, index) => {
        const tradeId = Number(deal.tradeId ?? deal.hedgeDealId);

        return {
          rowKey: `${tradeId || "hedge-deal"}:${index}`,
          ...deal,
          tradeId,
          tradeContextLabel: clientDealsTradeContextLabel(deal.tradeContextId),
          pricingRuleMargin: dealPricingRuleMargin(deal)
        };
      });
    }

    function updateHedgeDealsCount(filteredCount = hedgeDealsTotalCount) {
      const total = hedgeDealsTotalCount;
      const dealLabel = total === 1 ? "deal" : "deals";
      hedgeDealsCountEl.textContent = filteredCount === total
        ? `${total} ${dealLabel}`
        : `${filteredCount} of ${total} deals`;
    }

    function initializeHedgeDealsGrid(data) {
      const columns = uiTableColumns("hedge_deals_grid", hedgeDealColumnDefinitions());
      hedgeDealsGrid = new Tabulator(hedgeDealsGridEl, {
        data,
        index: "rowKey",
        layout: "fitData",
        renderVertical: "virtual",
        renderVerticalBuffer: 320,
        maxHeight: "calc(100vh - 225px)",
        placeholder: "No hedge deals.",
        movableColumns: false,
        resizableColumns: false,
        columnHeaderVertAlign: "bottom",
        headerFilterLiveFilterDelay: 300,
        initialSort: [{ column: "tradeId", dir: "asc" }],
        columnDefaults: {
          resizable: false,
          vertAlign: "middle",
          tooltip: tabulatorCellOverflowTooltip,
          headerTooltip: tabulatorHeaderOverflowTooltip
        },
        columns
      });
      registerUiTableTabulator("hedge_deals_grid", hedgeDealsGrid);

      hedgeDealsGrid.on("tableBuilt", () => {
        hedgeDealsGridReady = true;
        updateHedgeDealsCount(data.length);
        applyDealsViewMode("hedge");
      });
      hedgeDealsGrid.on("dataFiltered", (_filters, rows) => {
        updateHedgeDealsCount(rows.length);
      });
    }

    function renderHedgeDeals(source) {
      const data = hedgeDealsGridData(source);
      hedgeDealsPendingData = data;
      hedgeDealsTotalCount = data.length;

      if (!hedgeDealsGrid) {
        updateHedgeDealsCount(data.length);

        if (!hedgeDealsPage.hidden) {
          initializeHedgeDealsGrid(data);
        }

        return;
      }

      if (!hedgeDealsGridReady || hedgeDealsPage.hidden) {
        return;
      }

      hedgeDealsGrid.replaceData(hedgeDealsPendingData).then(() => {
        hedgeDealsPendingData = [];
        hedgeDealsGrid.redraw(true);
      });
    }

    function setAnalyticalPnlReportStatus(message = "", tone = "") {
      setWorkbenchPageStatus(analyticalPnlReportStatusEl, message, tone);
    }

    function analyticalPnlReportSummaryAmountFormatter(cell) {
      const row = cell.getRow().getData();
      const fractionDigits = Number(row.fractionDigits);

      if (!/^-?\d+$/.test(String(row.amountMinor || ""))
        || !Number.isInteger(fractionDigits)
        || fractionDigits < 0
        || fractionDigits > 10) {
        return '<span class="text-secondary">Not calculated</span>';
      }

      const minor = BigInt(row.amountMinor);
      const sign = minor > 0n ? "+" : "";
      const formatted = `${sign}${formattedMinorAmount(minor.toString(), fractionDigits)}`;

      return `
        <span class="analytical-pnl-report-total-value ${minor < 0n ? "is-negative" : ""}">
          ${escapeHtml(formatted)}
        </span>
      `;
    }

    function analyticalPnlReportSummaryMarginFormatter(cell) {
      const row = cell.getRow().getData();
      const margin = String(row.weightedAverageMarginPercent ?? "");

      if (!/^-?\d+\.\d{4}$/.test(margin)) {
        return '<span class="text-secondary">Not calculated</span>';
      }

      const numericMargin = Number(margin);
      const formatted = `${numericMargin > 0 ? "+" : ""}${margin}%`;

      return `
        <span class="analytical-pnl-report-total-value ${numericMargin < 0 ? "is-negative" : ""}">
          ${escapeHtml(formatted)}
        </span>
      `;
    }

    function analyticalPnlReportSummaryRows(summary = {}) {
      const totals = Array.isArray(summary.totals) ? summary.totals : [];

      return totals.map(total => {
        const amountMinor = String(total.analyticalPnlQuoteMinor || "0");
        const fractionDigits = Number(total.analyticalPnlQuoteFractionDigits);

        return {
          currency: String(total.quoteCcyCode || "").toUpperCase(),
          amount: Number(minorToMajorDecimal(amountMinor, fractionDigits)),
          amountMinor,
          fractionDigits,
          weightedAverageMargin: total.weightedAverageMarginPercent === null
            ? null
            : Number(total.weightedAverageMarginPercent),
          weightedAverageMarginPercent: total.weightedAverageMarginPercent
        };
      });
    }

    function initializeAnalyticalPnlReportSummaryGrid(data) {
      analyticalPnlReportSummaryGrid = new Tabulator(analyticalPnlReportSummaryGridEl, {
        data,
        index: "currency",
        layout: "fitDataTable",
        placeholder: "No calculated PnL in the current result.",
        movableColumns: false,
        resizableColumns: false,
        columnHeaderVertAlign: "bottom",
        headerFilterLiveFilterDelay: 300,
        columnDefaults: {
          resizable: false,
          vertAlign: "middle",
          tooltip: tabulatorCellOverflowTooltip,
          headerTooltip: tabulatorHeaderOverflowTooltip,
          headerSort: false
        },
        columns: uiTableColumns("analytical_pnl_summary_grid", [
          clientDealsFilterableColumn("code", {
            title: "Currency",
            field: "currency",
            headerSort: true
          }),
          tabulatorSizedColumn("positionAmount", {
            title: "Amount",
            field: "amount",
            sorter: "number",
            headerSort: true,
            formatter: analyticalPnlReportSummaryAmountFormatter,
            hozAlign: "right",
            headerHozAlign: "right"
          }),
          tabulatorSizedColumn("wideStatus", {
            title: "Weighted Average Margin",
            field: "weightedAverageMargin",
            sorter: "number",
            headerSort: true,
            formatter: analyticalPnlReportSummaryMarginFormatter,
            hozAlign: "right",
            headerHozAlign: "right"
          })
        ])
      });
      registerUiTableTabulator(
        "analytical_pnl_summary_grid",
        analyticalPnlReportSummaryGrid
      );
      analyticalPnlReportSummaryGrid.on("tableBuilt", () => {
        analyticalPnlReportSummaryGridReady = true;

        if (analyticalPnlReportSummaryPendingData) {
          const pendingData = analyticalPnlReportSummaryPendingData;
          analyticalPnlReportSummaryPendingData = null;
          analyticalPnlReportSummaryGrid.replaceData(pendingData);
        }
      });
    }

    function renderAnalyticalPnlReportSummary(summary = {}) {
      const rows = analyticalPnlReportSummaryRows(summary);
      const missingPnlCount = Number(summary.dealsWithoutPnlCount) || 0;
      const missingMessage = missingPnlCount > 0
        ? `${missingPnlCount} ${missingPnlCount === 1 ? "deal" : "deals"} without calculated PnL`
        : "";

      analyticalPnlReportSummaryNoteEl.textContent = missingMessage;
      analyticalPnlReportSummaryNoteEl.hidden = !missingMessage;
      analyticalPnlReportSummaryPendingData = rows;

      if (!analyticalPnlReportSummaryGrid) {
        analyticalPnlReportSummaryPendingData = null;
        initializeAnalyticalPnlReportSummaryGrid(rows);
        return;
      }

      if (!analyticalPnlReportSummaryGridReady) {
        return;
      }

      analyticalPnlReportSummaryGrid.replaceData(rows).then(() => {
        analyticalPnlReportSummaryPendingData = null;
        analyticalPnlReportSummaryGrid.redraw(true);
      });
    }

    function analyticalPnlReportQuery() {
      const parameters = new URLSearchParams();
      const formData = new FormData(analyticalPnlReportFiltersForm);

      ["dateFrom", "dateTo", "tradeType"].forEach(name => {
        const value = String(formData.get(name) || "").trim();

        if (value) {
          parameters.set(name, value);
        }
      });

      return parameters.toString();
    }

    function initializeAnalyticalPnlReportDefaultDateRange() {
      const now = new Date();
      const twoDigits = value => String(value).padStart(2, "0");
      const today = [
        now.getFullYear(),
        twoDigits(now.getMonth() + 1),
        twoDigits(now.getDate())
      ].join("-");

      analyticalPnlReportFiltersForm.elements.dateFrom.value = today;
      analyticalPnlReportFiltersForm.elements.dateTo.value = today;
    }

    async function loadAnalyticalPnlReport() {
      if (!DEMO_API_ENABLED) {
        setAnalyticalPnlReportStatus("Start the application with start-demo.bat to load the report.", "warning");
        return;
      }

      const requestSequence = ++analyticalPnlReportRequestSequence;
      const query = analyticalPnlReportQuery();
      setAnalyticalPnlReportStatus("Loading report...");
      analyticalPnlReportFiltersForm.setAttribute("aria-busy", "true");

      try {
        const report = await demoApiRequest(`/api/v1/reports/analytical-pnl${query ? `?${query}` : ""}`);

        if (requestSequence !== analyticalPnlReportRequestSequence) {
          return;
        }

        renderAnalyticalPnlReportSummary(report?.summary);

        setAnalyticalPnlReportStatus("");
      } catch (error) {
        if (requestSequence === analyticalPnlReportRequestSequence) {
          setAnalyticalPnlReportStatus(error.message || "Unable to load the report.", "error");
        }
      } finally {
        if (requestSequence === analyticalPnlReportRequestSequence) {
          analyticalPnlReportFiltersForm.removeAttribute("aria-busy");
        }
      }
    }

    function fallbackCopyText(text) {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      textarea.style.top = "0";
      document.body.appendChild(textarea);
      textarea.select();

      try {
        return document.execCommand("copy");
      } catch {
        return false;
      } finally {
        textarea.remove();
      }
    }
