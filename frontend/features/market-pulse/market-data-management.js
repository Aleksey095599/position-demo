    const marketDataTabs = Array.from(document.querySelectorAll("[data-market-data-tab]"));
    const marketDataPanels = Array.from(document.querySelectorAll("[data-market-data-panel]"));

    function selectMarketDataTab(period) {
      if (!marketDataTabs.some(tab => tab.dataset.marketDataTab === period)) return;

      marketDataTabs.forEach(tab => {
        const selected = tab.dataset.marketDataTab === period;
        tab.classList.toggle("active", selected);
        tab.setAttribute("aria-selected", String(selected));
        tab.tabIndex = selected ? 0 : -1;
      });
      marketDataPanels.forEach(panel => {
        panel.hidden = panel.dataset.marketDataPanel !== period;
      });
    }

    function handleMarketDataTabKeydown(event) {
      const index = marketDataTabs.indexOf(event.currentTarget);
      let nextIndex;

      switch (event.key) {
        case "ArrowRight": nextIndex = (index + 1) % marketDataTabs.length; break;
        case "ArrowLeft": nextIndex = (index - 1 + marketDataTabs.length) % marketDataTabs.length; break;
        case "Home": nextIndex = 0; break;
        case "End": nextIndex = marketDataTabs.length - 1; break;
        default: return;
      }

      event.preventDefault();
      const nextTab = marketDataTabs[nextIndex];
      selectMarketDataTab(nextTab.dataset.marketDataTab);
      nextTab.focus();
    }

    marketDataTabs.forEach(tab => {
      tab.addEventListener("click", () => selectMarketDataTab(tab.dataset.marketDataTab));
      tab.addEventListener("keydown", handleMarketDataTabKeydown);
    });
