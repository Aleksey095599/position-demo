    function marketCalendarDayDetails(day, timeframe, status) {
      const daily = timeframe === "ONE_DAY";
      const integrity = day.integrity || {};
      const rows = [];
      const stamp = value => new Intl.DateTimeFormat("en-GB", {timeZone:"Europe/Moscow",day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(new Date(value));
      const time = value => new Intl.DateTimeFormat("en-GB", {timeZone:"Europe/Moscow",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(new Date(value));
      let message = "";
      if (status === "UNAVAILABLE") message = "This day is outside the available historical loading range.";
      else if (status === "QUEUED") message = "This day is waiting for its turn to be processed.";
      else if (status === "LOADING") message = "Loading this day from MOEX ISS…";
      else if (integrity.status === "MISMATCH") {
        message = "Minute and daily Open/Close values do not match.";
        if (integrity.dailyOpen !== undefined) {
          rows.push(["Daily Open / Close",integrity.dailyOpen + " / " + integrity.dailyClose]);
          rows.push(["Minute Open / Close",integrity.firstMinuteOpen + " / " + integrity.lastMinuteClose]);
        } else message = integrity.message || message;
      } else if (integrity.affectedTimeframe === timeframe) {
        message = integrity.status === "MISSING_DAILY"
          ? "MOEX ISS returned no daily candle, although minute candles exist."
          : "MOEX ISS returned no minute candles, although a daily candle exists.";
      } else if (day.lastError && status === "ERROR") {
        message = "Could not load this day. Select it in the calendar to retry.";
        if (day.lastError.startsWith("MOEX_ISS_REQUEST_FAILED")) message = "Could not retrieve data from MOEX ISS. Check your connection and retry this day.";
        if (day.lastError.startsWith("MOEX_ISS_INVALID_RESPONSE")) message = "MOEX ISS returned an invalid response. Retry this day later.";
      } else if (day.lastError && day.completedAt) message = "Saved data is available, but the last loading attempt failed.";
      else if (day.completedAt && !day.candleCount) message = "MOEX ISS returned no candles for this day.";
      else if (!day.completedAt) message = day.candleCount
        ? "Stored candles exist, but this day has not been fully loaded. Select it in the calendar to load it."
        : "This day has not been loaded. Select it in the calendar to load it.";
      if (!daily && day.firstCandleAt) {
        rows.push(["First candle starts",time(day.firstCandleAt)]);
        rows.push(["Last candle starts",time(day.lastCandleAt)]);
      }
      if (day.completedAt) rows.push(["Loaded at",stamp(day.completedAt)]);
      // A successful load needs no second timestamp. Failed attempts retain their start time.
      return {message,rows,technicalError:day.lastError || ""};
    }

    const marketCalendarDetailClose = document.getElementById("marketCalendarDetailClose");
    const marketCalendarDayContext = document.getElementById("marketCalendarDayContext");
    const marketCalendarDayStatus = document.getElementById("marketCalendarDayStatus");
    const marketCalendarDayErrorDetails = document.getElementById("marketCalendarDayErrorDetails");
    let marketCalendarDetailDate = "";

    function marketCalendarDetailAnchor() {
      return marketHistorySyncCalendar.querySelector('[data-market-calendar-info-date="' + marketCalendarDetailDate + '"]');
    }

    function closeMarketCalendarDay(restoreFocus = true) {
      const anchor = marketCalendarDetailDate ? marketCalendarDetailAnchor() : null;
      marketCalendarDetailDate = "";
      if (marketCalendarDetail.matches(":popover-open")) marketCalendarDetail.hidePopover();
      anchor?.setAttribute("aria-expanded","false");
      if (restoreFocus && anchor) window.requestAnimationFrame(() => {
        if (!marketCalendarDetailDate && anchor.isConnected) anchor.focus({preventScroll:true});
      });
    }

    function openMarketCalendarDay(date) {
      if (marketCalendarDetailDate === date && marketCalendarDetail.matches(":popover-open")) {
        closeMarketCalendarDay();
        return;
      }
      closeMarketCalendarDay(false);
      marketCalendarDetailDate = date;
      marketCalendarPreviewDate = "";
      renderMarketCalendarSelection();
      marketCalendarDayErrorDetails.open = false;
      renderMarketCalendarDay();
      const anchor = marketCalendarDetailAnchor();
      if (!anchor) return;
      if (typeof hideAppTooltip === "function") hideAppTooltip();
      marketCalendarDetail.showPopover();
      positionMarketCalendarDay();
      marketCalendarDayTitle.focus({preventScroll:true});
    }

    function renderMarketCalendarDay() {
      if (!marketCalendarDetailDate) return;
      const day = marketCalendarData?.days.find(day => day.date === marketCalendarDetailDate);
      const anchor = marketCalendarDetailAnchor();
      if (!day || !anchor) { closeMarketCalendarDay(false); return; }
      const status = marketCalendarStatus(day);
      const definition = marketCalendarStatusDefinition(status);
      const content = marketCalendarDayDetails(day, marketHistorySourceTimeframe.value, status);
      marketCalendarDayTitle.textContent = formatMarketHistorySyncDate(day.date);
      marketCalendarDayContext.textContent = marketHistorySyncInstrument.selectedOptions[0].textContent + " · "
        + (marketHistorySourceTimeframe.value === "ONE_DAY" ? "1 day" : "1 min") + " · MOEX ISS";
      marketCalendarDayStatus.textContent = definition.label;
      marketCalendarDayStatus.className = "market-calendar-detail-status is-" + definition.className;
      marketCalendarDaySummary.textContent = content.message;
      marketCalendarDaySummary.hidden = !content.message;
      marketCalendarDayTimes.replaceChildren();
      for (const [label,value] of content.rows) {
        const term = document.createElement("dt"), description = document.createElement("dd");
        term.textContent = label; description.textContent = value;
        marketCalendarDayTimes.append(term,description);
      }
      marketCalendarDayTimes.hidden = !content.rows.length;
      marketCalendarDayErrorDetails.hidden = !content.technicalError;
      marketCalendarDayError.textContent = content.technicalError;
      anchor.setAttribute("aria-expanded","true");
      if (marketCalendarDetail.matches(":popover-open")) positionMarketCalendarDay();
    }

    function positionMarketCalendarDay() {
      if (!marketCalendarDetail.matches(":popover-open")) return;
      const anchor = marketCalendarDetailAnchor();
      if (!anchor) { closeMarketCalendarDay(false); return; }
      const rect = anchor.getBoundingClientRect();
      const view = window.visualViewport;
      const left = view?.offsetLeft || 0, top = view?.offsetTop || 0;
      const width = view?.width || window.innerWidth, height = view?.height || window.innerHeight;
      const pad = 12, gap = 8;
      if (rect.bottom < top || rect.top > top+height) { closeMarketCalendarDay(false); return; }
      marketCalendarDetail.style.width = Math.min(360,width-2*pad) + "px";
      marketCalendarDetail.style.maxHeight = Math.max(80,height-2*pad) + "px";
      const box = marketCalendarDetail.getBoundingClientRect();
      let x = rect.right+gap, y = rect.top;
      if (x+box.width > left+width-pad) {
        x = rect.left-box.width-gap;
        if (x < left+pad) { x = rect.right-box.width; y = rect.bottom+gap; }
      }
      x = Math.max(left+pad,Math.min(x,left+width-pad-box.width));
      y = Math.max(top+pad,Math.min(y,top+height-pad-box.height));
      marketCalendarDetail.style.left = x + "px";
      marketCalendarDetail.style.top = y + "px";
    }

    marketCalendarDetailClose.addEventListener("click", () => closeMarketCalendarDay());
    marketCalendarDetail.addEventListener("toggle", event => {
      if (event.newState === "closed" && !marketCalendarDetail.matches(":popover-open")) closeMarketCalendarDay(false);
    });
    marketCalendarDayErrorDetails.addEventListener("toggle", positionMarketCalendarDay);
    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && marketCalendarDetail.matches(":popover-open")) {
        event.preventDefault(); closeMarketCalendarDay();
      }
    });
    document.addEventListener("focusin", event => {
      if (marketCalendarDetail.matches(":popover-open") && !marketCalendarDetail.contains(event.target)
          && event.target !== marketCalendarDetailAnchor()) closeMarketCalendarDay(false);
    });
    window.addEventListener("hashchange", () => closeMarketCalendarDay(false));
    window.addEventListener("resize", positionMarketCalendarDay);
    window.addEventListener("scroll", event => {
      if (!marketCalendarDetail.contains(event.target)) positionMarketCalendarDay();
    }, true);
    window.visualViewport?.addEventListener("resize",positionMarketCalendarDay);
    window.visualViewport?.addEventListener("scroll",positionMarketCalendarDay);
