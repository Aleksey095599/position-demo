# Demo FX Position Application

## Run with SQLite persistence

1. Double-click `start-demo.bat`.
2. Open `http://127.0.0.1:8000` in a browser.
3. Use **Market Pulse**, **Trading Counterparties**, **Users** and **Reference Data > Servicing Locations** to edit SQLite-backed data.
4. Open **Database** to inspect the real SQLite tables, columns, foreign keys and rows.

The data is stored in `data/demo.sqlite`. Closing and reopening the browser does not reset the currency, pair, simulation, Trading Counterparty, User, Reference Data or Execution Context settings.

SQLite separates the reference data from the simulation configuration:

- `ccy_options`
- `ccy_pair_options`
- `market_quote_simulation_settings`
- `servicing_locations`
- `accounting_systems`
- `execution_systems`
- `execution_contexts`
- `trading_counterparties`
- `external_counterparties`
- `internal_units`
- `trading_counterparty_roles`
- `users`
- `pricing_rules`
- `fx_auto_batching_settings`

`trading_counterparties` is the stable parent identity. External legal/person profiles,
internal organizational units and business roles are stored separately in
`external_counterparties`, `internal_units` and `trading_counterparty_roles`. Deals,
Pricing Rules and related settings reference that identity through `counterparty_id`.

Reference Data `Usage` is a read-model value. The backend exposes it as `executionContextCount` and calculates it with `COUNT(...)` over `execution_contexts`; the count is not duplicated in the reference tables.

`NOT_APPLICABLE` is represented by `NULL` in `execution_contexts.accounting_system_id` and mapped back to `NOT_APPLICABLE` by the API.

## Market Pulse Simulation

The quote-generation algorithm lives in `backend/market-pulse-simulation/market-pulse-simulator.js`.
The backend is the single source of simulated Bid and Offer values. The browser receives the shared stream through Server-Sent Events and only renders it.

Current quotes and the running/stopped state are kept in backend memory. They are not written to SQLite.

Opening `index.html` directly remains supported as a fallback, but that mode cannot use SQLite and stores demo changes in the browser only.

## Training API

- `GET /api/v1/ccy-options`
- `POST /api/v1/ccy-options`
- `PUT /api/v1/ccy-options/{code}`
- `DELETE /api/v1/ccy-options/{code}`
- `GET /api/v1/ccy-pair-options`
- `POST /api/v1/ccy-pair-options`
- `PATCH /api/v1/ccy-pair-options/{pairCode}`
- `DELETE /api/v1/ccy-pair-options/{pairCode}`
- `GET /api/v1/ccy-pair-options/{pairCode}/simulation-settings`
- `PUT /api/v1/ccy-pair-options/{pairCode}/simulation-settings`
- `DELETE /api/v1/ccy-pair-options/{pairCode}/simulation-settings`
- `GET /api/v1/market-pulse-simulation/status`
- `POST /api/v1/market-pulse-simulation/start`
- `POST /api/v1/market-pulse-simulation/stop`
- `GET /api/v1/market-pulse-simulation/stream`
- `GET /api/v1/servicing-locations`
- `POST /api/v1/servicing-locations`
- `PUT /api/v1/servicing-locations/{servicingLocationId}`
- `DELETE /api/v1/servicing-locations/{servicingLocationId}`
- `GET /api/v1/accounting-systems`
- `POST /api/v1/accounting-systems`
- `PUT /api/v1/accounting-systems/{accountingSystemId}`
- `DELETE /api/v1/accounting-systems/{accountingSystemId}`
- `GET /api/v1/execution-systems`
- `POST /api/v1/execution-systems`
- `PUT /api/v1/execution-systems/{executionSystemId}`
- `DELETE /api/v1/execution-systems/{executionSystemId}`
- `GET /api/v1/execution-contexts`
- `POST /api/v1/execution-contexts`
- `PUT /api/v1/execution-contexts/{executionContextId}`
- `DELETE /api/v1/execution-contexts/{executionContextId}`
- `GET /api/v1/trading-counterparties`
- `POST /api/v1/trading-counterparties`
- `PUT /api/v1/trading-counterparties/{counterpartyId}`
- `DELETE /api/v1/trading-counterparties/{counterpartyId}`
- `GET /api/v1/users`
- `POST /api/v1/users`
- `PUT /api/v1/users/{userId}`
- `DELETE /api/v1/users/{userId}`
- `GET /api/v1/pricing-rules`
- `POST /api/v1/pricing-rules`
- `PUT /api/v1/pricing-rules/{pricingRuleId}`
- `DELETE /api/v1/pricing-rules/{pricingRuleId}`
- `GET /api/v1/fx-auto-batching-settings`
- `PUT /api/v1/fx-auto-batching-settings`
- `GET /api/database/tables`
- `GET /api/database/tables/{tableName}`

The backend uses Node.js built-ins only. No `npm install` is required. Node.js 22.5 or newer is required for the built-in SQLite module.
