    const marketPulseSettingsPage = document.getElementById("marketPulseSettingsPage");
    const marketPulseCurrentDaySettingsForm = document.getElementById("marketPulseCurrentDaySettingsForm");
    const marketPulseCurrentDaySettingsFields = document.getElementById("marketPulseCurrentDaySettingsFields");
    const marketPulseCurrentDaySettingsStatus = document.getElementById("marketPulseCurrentDaySettingsStatus");
    const marketPulseCurrentDaySettingsSave = document.getElementById("marketPulseCurrentDaySettingsSave");
    const marketPulseCurrentDaySettingsRetry = document.getElementById("marketPulseCurrentDaySettingsRetry");
    let marketPulseCurrentDaySavedSettings = null;
    let marketPulseCurrentDaySettingsBusy = false;

    function isMarketPulseSettingsRoute(hash = location.hash) {
      return hash === "#market-pulse-settings";
    }

    function marketPulseCurrentDaySettingsDraft() {
      const fields = marketPulseCurrentDaySettingsForm.elements;
      return {
        autoStart: fields.autoStart.checked,
        pollIntervalMinutes: Number(fields.pollIntervalMinutes.value),
        reloadAfterDayEnd: fields.reloadAfterDayEnd.checked
      };
    }

    function marketPulseCurrentDaySettingsDirty() {
      if (!marketPulseCurrentDaySavedSettings) return false;
      const draft = marketPulseCurrentDaySettingsDraft();
      return Object.keys(draft).some(key => draft[key] !== marketPulseCurrentDaySavedSettings[key]);
    }

    function updateMarketPulseCurrentDaySettingsAvailability() {
      marketPulseCurrentDaySettingsFields.disabled = marketPulseCurrentDaySettingsBusy || !marketPulseCurrentDaySavedSettings;
      marketPulseCurrentDaySettingsSave.disabled = marketPulseCurrentDaySettingsBusy
        || !marketPulseCurrentDaySettingsDirty()
        || !marketPulseCurrentDaySettingsForm.checkValidity();
      marketPulseCurrentDaySettingsRetry.disabled = marketPulseCurrentDaySettingsBusy;
      marketPulseCurrentDaySettingsForm.setAttribute("aria-busy", String(marketPulseCurrentDaySettingsBusy));
    }

    function applyMarketPulseCurrentDaySettings(settings) {
      marketPulseCurrentDaySavedSettings = {
        autoStart: settings.autoStart,
        pollIntervalMinutes: settings.pollIntervalMinutes,
        reloadAfterDayEnd: settings.reloadAfterDayEnd
      };
      const fields = marketPulseCurrentDaySettingsForm.elements;
      fields.autoStart.checked = settings.autoStart;
      fields.pollIntervalMinutes.value = String(settings.pollIntervalMinutes);
      fields.reloadAfterDayEnd.checked = settings.reloadAfterDayEnd;
    }

    async function loadMarketPulseSettingsPage() {
      if (marketPulseCurrentDaySettingsBusy) return;
      if (marketPulseCurrentDaySettingsDirty()) {
        setWorkbenchPageStatus(marketPulseCurrentDaySettingsStatus, "Unsaved changes.");
        return;
      }
      marketPulseCurrentDaySettingsBusy = true;
      marketPulseCurrentDaySettingsRetry.hidden = true;
      updateMarketPulseCurrentDaySettingsAvailability();
      setWorkbenchPageStatus(marketPulseCurrentDaySettingsStatus, "Loading settings…");
      try {
        const settings = await demoApiRequest("/api/v1/market-pulse/current-day/settings");
        applyMarketPulseCurrentDaySettings(settings);
        setWorkbenchPageStatus(marketPulseCurrentDaySettingsStatus);
      } catch (error) {
        setWorkbenchPageStatus(marketPulseCurrentDaySettingsStatus, error.message || "Could not load settings.", "error");
        marketPulseCurrentDaySettingsRetry.hidden = false;
      } finally {
        marketPulseCurrentDaySettingsBusy = false;
        updateMarketPulseCurrentDaySettingsAvailability();
      }
    }

    async function saveMarketPulseCurrentDaySettings(event) {
      event.preventDefault();
      if (marketPulseCurrentDaySettingsBusy || !marketPulseCurrentDaySettingsDirty()
        || !marketPulseCurrentDaySettingsForm.reportValidity()) return;
      const draft = marketPulseCurrentDaySettingsDraft();
      marketPulseCurrentDaySettingsBusy = true;
      marketPulseCurrentDaySettingsRetry.hidden = true;
      updateMarketPulseCurrentDaySettingsAvailability();
      setWorkbenchPageStatus(marketPulseCurrentDaySettingsStatus, "Saving settings…");
      try {
        const settings = await demoApiRequest("/api/v1/market-pulse/current-day/settings", {
          method: "PUT",
          body: JSON.stringify(draft)
        });
        applyMarketPulseCurrentDaySettings(settings);
        setWorkbenchPageStatus(marketPulseCurrentDaySettingsStatus, "Settings saved.", "success");
      } catch (error) {
        setWorkbenchPageStatus(marketPulseCurrentDaySettingsStatus, error.message || "Could not save settings.", "error");
      } finally {
        marketPulseCurrentDaySettingsBusy = false;
        updateMarketPulseCurrentDaySettingsAvailability();
      }
    }

    marketPulseCurrentDaySettingsForm.addEventListener("submit", saveMarketPulseCurrentDaySettings);
    marketPulseCurrentDaySettingsForm.addEventListener("input", () => {
      setWorkbenchPageStatus(marketPulseCurrentDaySettingsStatus,
        marketPulseCurrentDaySettingsDirty() ? "Unsaved changes." : "");
      updateMarketPulseCurrentDaySettingsAvailability();
    });
    marketPulseCurrentDaySettingsRetry.addEventListener("click", loadMarketPulseSettingsPage);
