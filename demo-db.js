window.__DEMO_DB_STARTUP_DATA__ = {
  "schemaVersion": 3,
  "selectedCurrencyPair": "EUR/USD",
  "batchSettings": {
    "lossTolerancePercent": 0.03,
    "overpricingTolerancePercent": 0.1,
    "maxDealAmount": 50000000
  },
  "clientDealGenerationSettings": {
    "amountMin": 500000,
    "amountMax": 1500000,
    "amountStep": 100000,
    "marketBidMin": 1.122,
    "marketBidMax": 1.1222,
    "marketSpread": 0.0002
  },
  "marketPairs": [
    {
      "bidMin": 1.122,
      "spread": 0.0002,
      "bidMax": 1.1222,
      "currencyPair": "EUR/USD",
      "defaultQuoteDecimals": 4
    },
    {
      "bidMin": 1.268,
      "spread": 0.0003,
      "bidMax": 1.271,
      "currencyPair": "GBP/USD",
      "defaultQuoteDecimals": 4
    }
  ],
  "ccyOptions": [
    { "code": "EUR", "name": "Euro", "country": "Euro Area", "fractionDigits": 2 },
    { "code": "GBP", "name": "Pound Sterling", "country": "United Kingdom", "fractionDigits": 2 },
    { "code": "JPY", "name": "Japanese Yen", "country": "Japan", "fractionDigits": 0 },
    { "code": "RUB", "name": "Russian Ruble", "country": "Russia", "fractionDigits": 2 },
    { "code": "USD", "name": "US Dollar", "country": "United States", "fractionDigits": 2 }
  ],
  "clientProfiles": [
    {
      "partyType": "CLIENT",
      "name": "Romashka Company",
      "inn": "7701234567",
      "clientCodeType": "INN",
      "isActive": true
    },
    {
      "partyType": "CLIENT",
      "name": "Vasilek Company",
      "inn": "7812345678",
      "clientCodeType": "INN",
      "isActive": true
    },
    {
      "partyType": "CLIENT",
      "name": "Gladiolus Company",
      "inn": "5409876543",
      "clientCodeType": "INN",
      "isActive": true
    }
  ],
  "servicingBranches": [
    {
      "servicingBranchCode": "000",
      "servicingBranchName": "Bank Central Office",
      "region": "Middle-earth, Mordor",
      "locationType": "HEAD_OFFICE",
      "isActive": true
    },
    {
      "servicingBranchCode": "001",
      "servicingBranchName": "Emerald City Branch",
      "region": "Oz",
      "locationType": "BRANCH",
      "isActive": true
    },
    {
      "servicingBranchCode": "002",
      "servicingBranchName": "Neverland Harbor Branch",
      "region": "Neverland",
      "locationType": "BRANCH",
      "isActive": true
    },
    {
      "servicingBranchCode": "1234",
      "servicingBranchName": "Wonderland Gate Branch",
      "region": "Wonderland",
      "locationType": "BRANCH",
      "isActive": true
    },
    {
      "servicingBranchCode": "7777",
      "servicingBranchName": "Narnia Lantern Branch",
      "region": "Narnia",
      "locationType": "BRANCH",
      "isActive": true
    },
    {
      "servicingBranchCode": "8888",
      "servicingBranchName": "Shire Hill Branch",
      "region": "Middle-earth",
      "locationType": "BRANCH",
      "isActive": true
    }
  ],
  "settlementSystems": [
    {
      "settlementSystemId": "AFINA",
      "settlementSystemName": "Afina Core Ledger",
      "isActive": true
    },
    {
      "settlementSystemId": "CTF3",
      "settlementSystemName": "CTF3 Treasury Settlement",
      "isActive": true
    }
  ],
  "tradeCaptureChannels": [
    {
      "tradeCaptureChannelId": "CLICK_TRADE_EFX",
      "tradeCaptureChannelName": "Click Trade eFX",
      "pricingType": "AUTO_PRICED",
      "isActive": true
    },
    {
      "tradeCaptureChannelId": "RFQ",
      "tradeCaptureChannelName": "Request for Quote",
      "pricingType": "DEALER_APPROVED",
      "isActive": true
    },
    {
      "tradeCaptureChannelId": "MANUAL_CLIENT_DEAL_ENTRY",
      "tradeCaptureChannelName": "Manual Client Deal Entry",
      "pricingType": "DEALER_PRICED",
      "isActive": true
    }
  ],
  "pricingContexts": [
    {
      "pricingContextId": 1,
      "servicingBranchCode": "002",
      "settlementSystemId": "AFINA",
      "tradeCaptureChannelId": "CLICK_TRADE_EFX"
    },
    {
      "pricingContextId": 2,
      "servicingBranchCode": "002",
      "settlementSystemId": "AFINA",
      "tradeCaptureChannelId": "RFQ"
    },
    {
      "pricingContextId": 3,
      "servicingBranchCode": "002",
      "settlementSystemId": "CTF3",
      "tradeCaptureChannelId": "MANUAL_CLIENT_DEAL_ENTRY"
    },
    {
      "pricingContextId": 4,
      "servicingBranchCode": "1234",
      "settlementSystemId": "AFINA",
      "tradeCaptureChannelId": "RFQ"
    },
    {
      "pricingContextId": 5,
      "servicingBranchCode": "001",
      "settlementSystemId": "CTF3",
      "tradeCaptureChannelId": "CLICK_TRADE_EFX"
    }
  ],
  "clientPricingRules": [
    {
      "pricingRuleId": 1,
      "inn": "7701234567",
      "currencyPair": "EUR/USD",
      "pricingContextId": 1,
      "marginPercent": 0.1
    },
    {
      "pricingRuleId": 2,
      "inn": "7701234567",
      "currencyPair": "EUR/USD",
      "pricingContextId": 2,
      "marginPercent": 0.12
    },
    {
      "pricingRuleId": 3,
      "inn": "7701234567",
      "currencyPair": "EUR/USD",
      "pricingContextId": 3,
      "marginPercent": 0.08
    },
    {
      "pricingRuleId": 4,
      "inn": "7812345678",
      "currencyPair": "EUR/USD",
      "pricingContextId": 4,
      "marginPercent": 0.05
    },
    {
      "pricingRuleId": 5,
      "inn": "5409876543",
      "currencyPair": "EUR/USD",
      "pricingContextId": 5,
      "marginPercent": 0.2
    }
  ],
  "clientFxDeals": [
    {
      "id": "1",
      "positionId": "FXP-CLIENT_DEAL-1",
      "branchCode": "002",
      "inn": "7701234567",
      "clientCodeType": "INN",
      "settlementSystemId": "",
      "tradeCaptureChannelId": "",
      "executionVenueType": "",
      "executionVenue": "",
      "type": "client_deal",
      "clientName": "Romashka Company",
      "entryDate": "15.07.2026",
      "tradeDate": "15.07.2026",
      "settlementMethod": "PVP",
      "tenor": "TOD",
      "baseCurrency": "EUR",
      "quoteCurrency": "USD",
      "currencyPair": "EUR/USD",
      "amountSell": 0,
      "amountBuy": 30000000,
      "clientRate": 1.1231,
      "pricingRuleId": 3,
      "pricingRuleMargin": 0.08,
      "pricingRuleControlStatus": "",
      "pricingContextId": 3,
      "tone": "blue"
    }
  ],
  "hedgeFxDeals": [],
  "technicalFxDeals": [],
  "fxPositions": [
    {
      "id": "FXP-CLIENT_DEAL-1",
      "sourceDealId": "1",
      "sourceDealType": "CLIENT_DEAL",
      "positionType": "CLIENT_DEAL",
      "positionLabel": "CLIENT_DEAL : Romashka Company",
      "tradeDate": "15.07.2026",
      "currencyPair": "EUR/USD",
      "baseCurrency": "EUR",
      "quoteCurrency": "USD",
      "baseCcyPosition": -30000000,
      "quoteCcyPosition": 33693000,
      "tenor": "TOD",
      "baseCcyValueDate": "15.07.2026",
      "quoteCcyValueDate": "15.07.2026",
      "marketPulseBid": 1.122,
      "marketPulseOffer": 1.1222,
      "isBatched": false,
      "batchId": "",
      "transferRate": 1.1222,
      "analyticalPnl": 27000
    }
  ]
};

(function initializeDemoDatabase(global) {
  "use strict";

  const DATABASE_STORAGE_KEY = "batching-demo.database.v3";
  const PREVIOUS_DATABASE_STORAGE_KEYS = [
    "batching-demo.database.v2",
    "batching-demo.database.v1"
  ];
  const SCHEMA_VERSION = 3;

  const BUILT_IN_DEFAULT_DATABASE = {
    schemaVersion: SCHEMA_VERSION,
    selectedCurrencyPair: "",
    batchSettings: {
      lossTolerancePercent: 0.03,
      overpricingTolerancePercent: 0.10,
      maxDealAmount: 50000000
    },
    clientDealGenerationSettings: {
      amountMin: 500000,
      amountMax: 1500000,
      amountStep: 100000,
      marketBidMin: 1.1220,
      marketBidMax: 1.1222,
      marketSpread: 0.0002
    },
    marketPairs: [
      { currencyPair: "EUR/USD", defaultQuoteDecimals: 4, bidMin: 1.1220, spread: 0.0002, bidMax: 1.1222 },
      { currencyPair: "GBP/USD", defaultQuoteDecimals: 4, bidMin: 1.2680, spread: 0.0003, bidMax: 1.2710 },
      { currencyPair: "USD/RUB", defaultQuoteDecimals: 4, bidMin: 88.5000, spread: 0.1500, bidMax: 90.2500 }
    ],
    ccyOptions: [
      { code: "EUR", name: "Euro", country: "Euro Area", fractionDigits: 2 },
      { code: "GBP", name: "Pound Sterling", country: "United Kingdom", fractionDigits: 2 },
      { code: "JPY", name: "Japanese Yen", country: "Japan", fractionDigits: 0 },
      { code: "RUB", name: "Russian Ruble", country: "Russia", fractionDigits: 2 },
      { code: "USD", name: "US Dollar", country: "United States", fractionDigits: 2 }
    ],
    clientProfiles: [
      {
        partyType: "CLIENT",
        name: "Romashka Company",
        inn: "7701234567",
        clientCodeType: "INN",
        isActive: true
      },
      {
        partyType: "CLIENT",
        name: "Vasilek Company",
        inn: "7812345678",
        clientCodeType: "INN",
        isActive: true
      },
      {
        partyType: "CLIENT",
        name: "Gladiolus Company",
        inn: "5409876543",
        clientCodeType: "INN",
        isActive: true
      }
    ],
    servicingBranches: [
      { servicingBranchCode: "000", servicingBranchName: "Bank Central Office", region: "Middle-earth, Mordor", locationType: "HEAD_OFFICE", isActive: true },
      { servicingBranchCode: "001", servicingBranchName: "Emerald City Branch", region: "Oz", locationType: "BRANCH", isActive: true },
      { servicingBranchCode: "002", servicingBranchName: "Neverland Harbor Branch", region: "Neverland", locationType: "BRANCH", isActive: true },
      { servicingBranchCode: "1234", servicingBranchName: "Wonderland Gate Branch", region: "Wonderland", locationType: "BRANCH", isActive: true },
      { servicingBranchCode: "7777", servicingBranchName: "Narnia Lantern Branch", region: "Narnia", locationType: "BRANCH", isActive: true },
      { servicingBranchCode: "8888", servicingBranchName: "Shire Hill Branch", region: "Middle-earth", locationType: "BRANCH", isActive: true }
    ],
    settlementSystems: [
      { settlementSystemId: "AFINA", settlementSystemName: "Afina Core Ledger", isActive: true },
      { settlementSystemId: "CTF3", settlementSystemName: "CTF3 Treasury Settlement", isActive: true }
    ],
    tradeCaptureChannels: [
      { tradeCaptureChannelId: "CLICK_TRADE_EFX", tradeCaptureChannelName: "Click Trade eFX", pricingType: "AUTO_PRICED", isActive: true },
      { tradeCaptureChannelId: "RFQ", tradeCaptureChannelName: "Request for Quote", pricingType: "DEALER_APPROVED", isActive: true },
      { tradeCaptureChannelId: "MANUAL_CLIENT_DEAL_ENTRY", tradeCaptureChannelName: "Manual Client Deal Entry", pricingType: "DEALER_PRICED", isActive: true }
    ],
    pricingContexts: [
      { pricingContextId: 1, servicingBranchCode: "002", settlementSystemId: "AFINA", tradeCaptureChannelId: "CLICK_TRADE_EFX" },
      { pricingContextId: 2, servicingBranchCode: "002", settlementSystemId: "AFINA", tradeCaptureChannelId: "RFQ" },
      { pricingContextId: 3, servicingBranchCode: "002", settlementSystemId: "CTF3", tradeCaptureChannelId: "MANUAL_CLIENT_DEAL_ENTRY" },
      { pricingContextId: 4, servicingBranchCode: "1234", settlementSystemId: "AFINA", tradeCaptureChannelId: "RFQ" },
      { pricingContextId: 5, servicingBranchCode: "001", settlementSystemId: "CTF3", tradeCaptureChannelId: "CLICK_TRADE_EFX" }
    ],
    clientPricingRules: [
      { pricingRuleId: 1, inn: "7701234567", currencyPair: "EUR/USD", pricingContextId: 1, marginPercent: 0.10 },
      { pricingRuleId: 2, inn: "7701234567", currencyPair: "EUR/USD", pricingContextId: 2, marginPercent: 0.12 },
      { pricingRuleId: 3, inn: "7701234567", currencyPair: "EUR/USD", pricingContextId: 3, marginPercent: 0.08 },
      { pricingRuleId: 4, inn: "7812345678", currencyPair: "EUR/USD", pricingContextId: 4, marginPercent: 0.05 },
      { pricingRuleId: 5, inn: "5409876543", currencyPair: "EUR/USD", pricingContextId: 5, marginPercent: 0.20 }
    ],
    clientFxDeals: [],
    hedgeFxDeals: [],
    technicalFxDeals: [],
    fxPositions: []
  };

  const embeddedStartupDatabase = global.__DEMO_DB_STARTUP_DATA__;
  const DEFAULT_DATABASE = embeddedStartupDatabase
    && typeof embeddedStartupDatabase === "object"
    && !Array.isArray(embeddedStartupDatabase)
    ? {
        ...clone(BUILT_IN_DEFAULT_DATABASE),
        ...clone(embeddedStartupDatabase),
        schemaVersion: SCHEMA_VERSION
      }
    : clone(BUILT_IN_DEFAULT_DATABASE);

  try {
    delete global.__DEMO_DB_STARTUP_DATA__;
  } catch {
    global.__DEMO_DB_STARTUP_DATA__ = undefined;
  }

  const LEGACY_JSON_KEYS = {
    batchSettings: "batching-demo.batch-settings.v1",
    clientDealGenerationSettings: "batching-demo.client-deal-generation-settings.v1",
    marketPairs: "batching-demo.market-settings.v1",
    marketSimulationSettings: "batching-demo.market-simulation-settings.v1",
    clientProfiles: "batching-demo.client-profiles.v1",
    servicingBranches: "batching-demo.servicing-branches.v1",
    settlementSystems: "batching-demo.settlement-systems.v1",
    tradeCaptureChannels: "batching-demo.trade-capture-channels.v1",
    pricingContexts: "batching-demo.pricing-contexts.v1",
    clientPricingRules: "batching-demo.client-pricing-rules.v1"
  };
  const LEGACY_SELECTED_CURRENCY_PAIR_KEY = "batching-demo.batching-currency-pair.v1";
  const PREVIOUS_FX_DEAL_STORAGE_KEY = "batching-demo.fx-position-blotter.v2";
  const OBSOLETE_FX_STORAGE_KEYS = [
    "batching-demo.fx-position-blotter.v1",
    "batching-demo.position_ledger.v2"
  ];

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function safeStorage() {
    try {
      return global.localStorage || null;
    } catch {
      return null;
    }
  }

  function readJson(storage, key) {
    try {
      const rawValue = storage.getItem(key);
      return rawValue === null ? undefined : JSON.parse(rawValue);
    } catch {
      return undefined;
    }
  }

  function normalizedDatabase(value) {
    const normalized = clone(DEFAULT_DATABASE);

    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return normalized;
    }

    const hasDedicatedDealTables = ["clientFxDeals", "hedgeFxDeals", "technicalFxDeals"]
      .some(key => Object.prototype.hasOwnProperty.call(value, key));

    Object.keys(DEFAULT_DATABASE).forEach(key => {
      if (key !== "schemaVersion" && Object.prototype.hasOwnProperty.call(value, key)) {
        normalized[key] = clone(value[key]);
      }
    });

    const legacyMarketSimulationSettings = Array.isArray(value.marketSimulationSettings)
      ? value.marketSimulationSettings
      : [];

    if (Array.isArray(normalized.marketPairs)) {
      normalized.marketPairs = normalized.marketPairs.map(pair => {
        const currencyPair = String(pair?.currencyPair || "").trim().toUpperCase();
        const legacySettings = legacyMarketSimulationSettings.find(settings =>
          String(settings?.currencyPair || "").trim().toUpperCase() === currencyPair
        );

        return {
          bidMin: null,
          spread: null,
          bidMax: null,
          ...(legacySettings ? clone(legacySettings) : {}),
          ...clone(pair),
          currencyPair: pair.currencyPair
        };
      });
    }

    if (!hasDedicatedDealTables && Array.isArray(value.fxPositions)) {
      const splitDeals = splitLegacyFxDeals(value.fxPositions);
      normalized.clientFxDeals = splitDeals.clientFxDeals;
      normalized.hedgeFxDeals = splitDeals.hedgeFxDeals;
      normalized.technicalFxDeals = splitDeals.technicalFxDeals;
      normalized.fxPositions = [];
    }

    normalized.schemaVersion = SCHEMA_VERSION;
    return normalized;
  }

  function legacyDealTableName(deal) {
    const type = String(deal?.type || "client_deal").trim().toUpperCase();

    if (["HEDGE_FX_DEAL", "MARKET_HEDGE", "HEDGE_DEAL"].includes(type)) {
      return "hedgeFxDeals";
    }

    return type === "CLIENT_DEAL" ? "clientFxDeals" : "technicalFxDeals";
  }

  function splitLegacyFxDeals(deals) {
    return deals.reduce((tables, deal) => {
      if (deal && typeof deal === "object" && deal.synthetic !== true) {
        tables[legacyDealTableName(deal)].push(clone(deal));
      }

      return tables;
    }, {
      clientFxDeals: [],
      hedgeFxDeals: [],
      technicalFxDeals: []
    });
  }

  function migrateLegacyDatabase(storage) {
    const migrated = clone(DEFAULT_DATABASE);

    Object.entries(LEGACY_JSON_KEYS).forEach(([tableName, storageKey]) => {
      const value = readJson(storage, storageKey);

      if (value !== undefined) {
        migrated[tableName] = value;
      }
    });

    try {
      migrated.selectedCurrencyPair = storage.getItem(LEGACY_SELECTED_CURRENCY_PAIR_KEY) || "";
    } catch {
      migrated.selectedCurrencyPair = "";
    }

    const previousFxDeals = readJson(storage, PREVIOUS_FX_DEAL_STORAGE_KEY);

    if (Array.isArray(previousFxDeals)) {
      const splitDeals = splitLegacyFxDeals(previousFxDeals);
      migrated.clientFxDeals = splitDeals.clientFxDeals;
      migrated.hedgeFxDeals = splitDeals.hedgeFxDeals;
      migrated.technicalFxDeals = splitDeals.technicalFxDeals;
    }

    return normalizedDatabase(migrated);
  }

  function removeLegacyStorage(storage) {
    const keys = [
      ...Object.values(LEGACY_JSON_KEYS),
      ...PREVIOUS_DATABASE_STORAGE_KEYS,
      LEGACY_SELECTED_CURRENCY_PAIR_KEY,
      PREVIOUS_FX_DEAL_STORAGE_KEY,
      ...OBSOLETE_FX_STORAGE_KEYS
    ];

    keys.forEach(key => {
      try {
        storage.removeItem(key);
      } catch {
        return;
      }
    });
  }

  const storage = safeStorage();
  let database = storage ? readJson(storage, DATABASE_STORAGE_KEY) : undefined;
  let lastPersistenceError = "";

  if (database === undefined) {
    const previousDatabase = storage
      ? PREVIOUS_DATABASE_STORAGE_KEYS
          .map(storageKey => readJson(storage, storageKey))
          .find(value => value !== undefined)
      : undefined;
    database = previousDatabase === undefined
      ? storage ? migrateLegacyDatabase(storage) : clone(DEFAULT_DATABASE)
      : normalizedDatabase(previousDatabase);
  } else {
    database = normalizedDatabase(database);
  }

  function persist(nextDatabase = database) {
    if (!storage) {
      lastPersistenceError = "Browser storage is unavailable.";
      return false;
    }

    try {
      storage.setItem(DATABASE_STORAGE_KEY, JSON.stringify(nextDatabase));
      lastPersistenceError = "";
      return true;
    } catch (error) {
      lastPersistenceError = error instanceof Error ? error.message : "Unable to save the demo database.";
      return false;
    }
  }

  const initialPersistenceSucceeded = persist(database);

  if (storage && initialPersistenceSucceeded) {
    removeLegacyStorage(storage);
  }

  function assertTableName(tableName) {
    if (tableName === "schemaVersion" || !Object.prototype.hasOwnProperty.call(DEFAULT_DATABASE, tableName)) {
      throw new Error(`Unknown demo database table: ${tableName}`);
    }
  }

  function get(tableName) {
    assertTableName(tableName);
    return clone(database[tableName]);
  }

  function setMany(changes) {
    if (!changes || typeof changes !== "object" || Array.isArray(changes)) {
      throw new Error("Demo database changes must be an object.");
    }

    const nextDatabase = { ...database, schemaVersion: SCHEMA_VERSION };

    Object.entries(changes).forEach(([tableName, value]) => {
      assertTableName(tableName);
      nextDatabase[tableName] = clone(value);
    });

    const normalizedNextDatabase = normalizedDatabase(nextDatabase);

    if (!persist(normalizedNextDatabase)) {
      return false;
    }

    database = normalizedNextDatabase;
    return true;
  }

  function set(tableName, value) {
    return setMany({ [tableName]: value });
  }

  function status() {
    return {
      persistent: Boolean(storage) && !lastPersistenceError,
      storageKey: DATABASE_STORAGE_KEY,
      error: lastPersistenceError
    };
  }

  global.DemoDb = Object.freeze({
    defaults: clone(DEFAULT_DATABASE),
    get,
    set,
    setMany,
    status
  });
})(window);
