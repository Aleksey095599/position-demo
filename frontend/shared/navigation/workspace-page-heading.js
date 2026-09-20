    function workspacePageHeading(hash = location.hash) {
      const currentHash = String(hash || "").trim();
      const heading = (selector, text) => ({ selector, text });
      if (currentHash === "#trade-intake:messages") {
        return heading("#tradeIntakeMessagesPage h1", "Trade Intake Messages");
      }
      if (/^#trade-intake(?::contract)?$/.test(currentHash)) {
        return heading("#tradeContractPage h1", "Trade Contract");
      }
      if (isPositionManagementSettingsRoute(currentHash)) {
        return heading("#positionManagementSettingsPage h1", "Position Management Settings");
      }
      const currency = currencySettingsRouteStateFromLocation(currentHash);
      if (currency.matches) {
        const title = currency.kind === "pairs" ? "Currency Pair Settings" : "Currency Settings";
        return heading("#marketPageTitle", title);
      }
      const rules = pricingRulesRouteStateFromLocation(currentHash);
      if (rules.matches) return heading("#pricingRulesPage h1", "Pricing Rules");
      const contexts = pricingRouteStateFromLocation(currentHash);
      if (contexts.matches) {
        return heading("#pricingPage h1", contexts.mode === "related" ? `Trade Contexts — ${contexts.scope.value}` : "Trade Contexts");
      }
      const profile = clientProfileRouteStateFromLocation(currentHash);
      if (profile.matches) {
        let title = "Trading Counterparties";
        if (profile.mode === "pricing-rule") title = `Pricing Rule ${profile.pricingRuleId}`;
        else if (profile.counterpartyId) {
          const record = clientProfiles.find(entry => String(entry.counterpartyId) === profile.counterpartyId);
          title = record?.name || `Counterparty ${profile.counterpartyId}`;
        } else if (profile.mode === "create") title = "New Counterparty";
        return heading("#clientProfilePageTitle", title);
      }
      const user = /^#users(?:\/([^/?#]+))?$/.exec(currentHash);
      if (user) {
        let title = "Users";
        if (user[1]) {
          let userId;
          try { userId = decodeURIComponent(user[1]); } catch (_error) { return heading("#usersPageTitle", title); }
          const record = users.find(entry => String(entry.userId) === userId);
          const name = record ? [record.firstName, record.lastName].filter(Boolean).join(" ") : "";
          title = userId.toLowerCase() === "new" ? "New User" : name || `User ${userId}`;
        }
        return heading("#usersPageTitle", title);
      }
      const reference = /^#reference-data(?::([^:]+))?$/.exec(currentHash);
      if (reference) {
        return heading("#referenceDataPage h1", "Trade Context Components");
      }
      const batch = /^#batching:details\/(\d+)$/.exec(currentHash);
      if (batch) return heading("#batchDetailsPage h1", `Batch ${batch[1]} — Structure`);
      if (currentHash === batchFormationAuditRoute()) return heading("#batchesPage h1", "Audit View");
      if (currentHash === batchingHistoryRoute()) return heading("#batchesPage h1", "Batches");
      if (/^#position(?::(?:manual|auto))?$/.test(currentHash)) return heading("#mainPage h1", "Position");
      if (currentHash === clientDealsRoute()) return heading("#dealsPage h1", "Client Deals");
      if (currentHash === hedgeDealsRoute()) return heading("#dealsPage h1", "Hedge Deals");
      if (currentHash.startsWith(domainGlossaryRoute())) {
        let title = "Domain Glossary";
        const encodedKey = currentHash.slice(domainGlossaryRoute().length + 1);
        if (encodedKey) {
          let key;
          try { key = decodeURIComponent(encodedKey); } catch (_error) { return heading("#processesPage h1", title); }
          const canonicalKey = PROCESS_CATALOG_GLOSSARY_TERM_ALIASES.get(key) || key;
          const label = document.getElementById(`process-term-${canonicalKey}`)?.querySelector("dt")?.textContent;
          if (label) title = label.trim();
        }
        return heading("#processesPage h1", title);
      }
      if (currentHash === manualBatchFormationProcessRoute()) return heading("#processesPage h1", "Manual Batching");
      if (currentHash === batchingSettingsRoute()) return heading("#batchingSettingsPage h1", "Batching Settings");
      if (currentHash === databaseRoute()) return heading("#databasePage h1", "Database");
      const market = /^#(?:market|market-pulse)(?::(quote-stream|charts|data-management|history|streams))?$/.exec(currentHash);
      if (market) {
        const section = market[1];
        const title = section === "charts"
          ? "Charts"
          : section === "data-management" || section === "history"
            ? "Data Management"
            : "Quote Stream";
        return heading("#marketPageTitle", title);
      }
      if (currentHash === analyticalPnlReportRoute()) return heading("#analyticalPnlReportPage h1", "Analytical PnL Report");
      return null;
    }

    function renderWorkspacePageHeading() {
      const heading = workspacePageHeading();
      if (!heading) return;
      const element = document.querySelector(heading.selector);
      if (element) element.textContent = heading.text;
    }
