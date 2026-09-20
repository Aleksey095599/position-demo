    function isTradeIntakeRoute(hash = location.hash) {
      return /^#trade-intake(?::contract|:messages)?$/.test(canonicalTradeIntakeRoute(hash));
    }

    function canonicalTradeIntakeRoute(hash = location.hash) {
      const route = String(hash || "").trim();
      if (/^#trade-inbox(?::trade-data-contract)?$/.test(route) || route === "#trade-intake:trade-contract") {
        return "#trade-intake:contract";
      }
      return route;
    }
