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
state; `trade_position_management_transitions` stores its history.

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

The UI action is **Move to Auto Management**. Initial and current API fields are
`initialPositionManagementMode` and `currentPositionManagementMode`.
The canonical endpoints are:

- `POST /api/v1/positions/move-to-auto-management`
- `GET /api/v1/auto-mode-eligibility-rules?tradeType=CLIENT_DEAL|HEDGE_DEAL`
- `PUT /api/v1/auto-mode-eligibility-rules` (body includes `tradeType`)

Position Management Settings opens at `#position-management-settings` and defaults
to `#position-management-settings/position-management-mode/client-deals`.
Position Management Mode is organized by Client Deals, Hedge Deals and
Technical Trades (`client-deals`, `hedge-deals` and `technical-trades` in the URL).
Client and Hedge settings each separate **Auto Mode Eligibility**
from **Initial Mode Assignment**. Eligibility is stored as current rules by Trade Type
and Ccy Pair; omitting `tradeType` in the rules API selects `CLIENT_DEAL`.
The eligibility table is nested under its trade type at `/eligibility-settings`;
`focus=automatic-admission|amount-limit|transfer-rate-deviation` selects its column.
Breadcrumbs show the parent hierarchy, independently of browsing history.
Previous colon-based settings URLs and `#auto-management-admission-criteria` links
remain supported and are normalized without adding a browser-history entry.
Quick Hedge settings are available at `#position-management-settings/quick-hedge`.
The admission feature and persisted objects use `auto-management-admission` /
`auto_management_admission`. Startup migrates legacy schema names transactionally,
preserving trades, current eligibility rules, decision evidence and table-column widths.
Browser-only settings normalize legacy admission field names when loaded.
Legacy names are retained in migration/compatibility code and its tests.

Admission Criteria check currency-pair eligibility, maximum trade amount and
transfer-rate deviation against the current Market Pulse. They apply to both
initial and operator-requested admission for the selected trade type.
Initial Admission uses the Trade Context value: AUTO_IF_ELIGIBLE admits a
new trade only when the criteria pass; REVIEW_REQUIRED starts in Manual Management.
A Pricing Rule inherits this value or overrides it to REVIEW_REQUIRED.
Missing data or configuration also holds initial automatic admission.
Decisions and initial trade state are saved atomically. Operator release checks
the latest criteria and transition constraints without reapplying initial routing.
There is no separate Manual Release policy.
Hedges explicitly created within a management mode and batch technical trades
retain their existing mode inheritance. Direct release of technical trades is
not supported. Admission does not start Auto Batching or Auto Hedging processes.
Startup removes the retired context default and pricing-rule mode override,
preserving existing trade states and historical audit decisions. Legacy MANUAL
rule overrides and retired MANUAL_ONLY configuration values become REVIEW_REQUIRED;
AUTO overrides cannot bypass admission checks. Historical decisions retain their
original values. Existing shared criteria initialize both Client and Hedge policies;
later edits affect only the selected type. Existing trade modes are not reassigned.

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
