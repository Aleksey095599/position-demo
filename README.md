# Demo Position Application

## Domain names

The workspace uses **Position** for the aggregate position and **Batches** for
the collection of batches. **Batching** names the formation process and its
settings. Trades are **Client Deals**, **Hedge Deals**, **Batch Balance Trades**
and **Batch Position Outputs**. Batch Quote Cash Outputs are cash results,
not trades.

Database collection names follow the same terminology: `client_deals`,
`hedge_deals`, `batches`, `batch_members`, `batch_balance_trades`,
`batch_position_outputs`, `batch_quote_cash_outputs`, `trade_exposures` and
`trade_market_snapshots`. `trade_position_management` names the management
mode, assigned once at creation and protected against updates and replacement.

Startup migrates old names before inspecting initialization state. The migration
preserves rows, identities, constraints, audit history and saved column widths
in one transaction, and checks referential integrity before committing.
Conflicting old and new objects stop migration without discarding either copy.
Back up an existing database before upgrading; never apply the new schema over
an old database without the startup migration.

Canonical API resources include `/api/v1/positions`, `/api/v1/batches`,
`/api/v1/client-deals`, `/api/v1/hedge-deals`, `/api/v1/batching-settings` and
`/api/v1/auto-batching-settings`. Links and requests use the current names;
the old FX-prefixed API paths and page aliases are no longer supported.
New Position row identifiers use `POS-<trade type>-<trade ID>`.

FX remains in the instrument name **FX Swap**, external system names such as
**Click Trade eFX** and **FX Online Platform**, existing reference codes such as `IB_FX`, and legacy
identifiers required to read old data. Current batch requests use UUID keys;
`__manual_batch__:` is reserved for internal operations. Migration also recognizes
its historical FX-prefixed form without rewriting stored keys. Stored
trade comments, external identifiers and audit payloads are not rewritten.

## Frontend development

The browser entry point `index.html` is generated from the feature-oriented
sources in `frontend/`. Page markup and feature-specific dialogs live next to
their owning feature; the workspace shell, application script and compatibility
stylesheet are separate files.

Run `npm run build:frontend` after changing a frontend fragment. Run
`npm run check:frontend` to verify that the generated entry point is current and
structurally valid. `start-demo.bat` rebuilds the frontend before starting the
server.

## Position management terminology

Position uses **Manual Management** (`MANUAL`) and **Auto Management** (`AUTO`).
Manual Management includes review, manual hedging and batch formation.
Auto Management is the common scope for automated position-management processes.
**Auto Hedging** and **Auto Batching** name individual processes; **Manual Review**
names a review activity. Excluding a trade from one process does not change its
Position Management Mode.

Existing Trades cannot be moved between management modes through the UI or API.
The API exposes one `positionManagementMode` field (`MANUAL` or `AUTO`).
Client and Hedge Audit views show one Position Management Mode column.
Migration preserves each existing Trade's current mode without re-evaluating
settings, removes the transition history, and retains the saved current-mode
column width. Auto Batching uses the Trade receipt time and the normal run boundary.
The canonical endpoints are:

- `GET /api/v1/auto-mode-eligibility-rules?tradeType=CLIENT_DEAL|HEDGE_DEAL`
- `PUT /api/v1/auto-mode-eligibility-rules` (body includes `tradeType`)

Position Management Settings has three peer sections: **Quick Hedge**,
**Auto Mode Eligibility** and **Position Management Mode**. It opens at
`#position-management-settings/auto-mode-eligibility`; mode settings are at
`#position-management-settings/position-management-mode`.
Old settings URLs remain supported and normalize to the current sections.

Trade Context exposes `positionManagementMode` (database: `position_management_mode`):
`MANUAL` or `AUTO_IF_ELIGIBLE`. Pricing Rule exposes nullable
`positionManagementModeOverride` (database: `position_management_mode_override`):
`null` inherits the context, and `MANUAL` is the only override.
The conditional setting differs from a Trade's actual mode, which is always
`MANUAL` or `AUTO` and is fixed when the Trade is created.
Changing configuration affects only new Trades.

Auto Mode Eligibility checks Ccy Pair, Amount Limit and Transfer Rate Deviation
against Market Pulse. A new Trade receives Auto Mode only when the effective setting
is AUTO_IF_ELIGIBLE and all requirements pass. Otherwise it receives Manual Mode.
Decisions and Trade mode are saved atomically. Hedges explicitly created within a
management mode and batch technical Trades retain their existing mode inheritance.
Assigning Auto Mode does not start Auto Batching or Auto Hedging.

Startup migrates old admission setting columns and REVIEW_REQUIRED values to the
current names and MANUAL value, preserving configuration, Trade modes, decision
evidence and table-column widths. Browser settings migrate the same legacy fields.
Old terminology remains only where required for database/browser upgrades or
historical admission decisions. Existing Trades are never reassigned.

## Run with SQLite persistence

1. Double-click `start-demo.bat`.
2. Open `http://127.0.0.1:8000` in a browser.
3. Use **Market Pulse**, **Trading Counterparties**, **Users** and **Reference Data > Servicing Locations** to edit SQLite-backed data.
4. Open **Database** to inspect the real SQLite tables, columns, foreign keys and rows.

The data is stored in `data/demo.sqlite`. Closing and reopening the browser does not reset the currency, pair, simulation, Trading Counterparty, User, Reference Data or Trade Context settings.

Trade Context uses three coordinates: Servicing Location, Accounting System
(when applicable), and Originating System. Originating System identifies the
business system in which a Trade is first registered as a business fact.
Existing databases are upgraded at server startup, preserving reference IDs,
context IDs, trade relationships and saved table widths. Previous context and
system bookmarks continue to open the corresponding current pages.

SQLite separates the reference data from the simulation configuration:

- `ccy_options`
- `ccy_pair_options`
- `market_quote_simulation_settings`
- `servicing_locations`
- `accounting_systems`
- `originating_systems`
- `trade_contexts`
- `trading_counterparties`
- `external_counterparties`
- `internal_units`
- `trading_counterparty_roles`
- `users`
- `pricing_rules`
- `auto_batching_settings`

`trading_counterparties` is the stable parent identity and owns the immutable
`counterparty_scope` discriminator. External legal/person profiles, internal
organizational units and business roles are stored separately in
`external_counterparties`, `internal_units` and `trading_counterparty_roles`. Deals,
Pricing Rules and related settings reference that identity through `counterparty_id`.

Reference Data `Usage` is a read-model value. The backend exposes it as `tradeContextCount` and calculates it with `COUNT(...)` over `trade_contexts`; the count is not duplicated in the reference tables.

`NOT_APPLICABLE` is represented by `NULL` in `trade_contexts.accounting_system_id` and mapped back to `NOT_APPLICABLE` by the API.

## Market Pulse Simulation

The quote-generation algorithm lives in `backend/market-pulse/simulation/market-pulse-simulator.js`.
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
- `GET /api/v1/originating-systems`
- `POST /api/v1/originating-systems`
- `PUT /api/v1/originating-systems/{originatingSystemId}`
- `DELETE /api/v1/originating-systems/{originatingSystemId}`
- `GET /api/v1/trade-contexts`
- `POST /api/v1/trade-contexts`
- `PUT /api/v1/trade-contexts/{tradeContextId}`
- `DELETE /api/v1/trade-contexts/{tradeContextId}`
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
- `GET /api/v1/auto-batching-settings`
- `PUT /api/v1/auto-batching-settings`
- `GET /api/database/tables`
- `GET /api/database/tables/{tableName}`

The backend uses Node.js built-ins only. No `npm install` is required. Node.js 22.5 or newer is required for the built-in SQLite module.
