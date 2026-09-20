# Market Pulse historical data

This feature uses two native MOEX ISS anchor Timeframes:

- `ONE_MINUTE` for the last complete Moscow calendar year;
- `ONE_DAY` for the last ten complete Moscow calendar years.

Externally loaded Candles are persisted in `market_source_candles` together
with their data source and load timestamp. `FIVE_MINUTES`, `FIFTEEN_MINUTES`,
`ONE_HOUR`, and `FOUR_HOURS` are currently derived from stored minutes on read;
`ONE_WEEK` and `ONE_MONTH` are derived from stored days. The separate
`market_aggregated_candles` table is reserved for materializing those results
in the next implementation step. There is no quarterly Timeframe.

The source and aggregated tables intentionally contain only OHLC and the
minimum provenance needed by their roles. Exchange turnover (`value`) and
traded quantity (`volume`) are not stored.

## Backfill

`createHistoricalCandleBackfillPlan(...)` splits minute history into Moscow
calendar days and daily history into one-year ranges. A
`BackfillHistoricalCandleRangeUseCase` loads one range page by page and keeps at
least two seconds between MOEX requests by default. Candles and successful
half-open coverage `[from, till)` are persisted atomically. Empty trading days
are coverage too, so a resume does not request them again.

`BackfillHistoricalCandlesUseCase` is the bounded coordinator. It processes one
previously uncovered range by default (up to 50 only when explicitly requested)
and safely resumes from `market_candle_load_ranges`. It is deliberately not
connected to an automatic timer or startup hook.

The server exposes two deliberately bounded operations:

- `POST /api/v1/market-pulse/historical-candles/backfill/step` with the exact
  body `{ "instrumentId": "CNYRUB_TOM" }` loads at most one uncovered range;
- `GET /api/v1/market-pulse/historical-candles/backfill/status?instrumentId=CNYRUB_TOM`
  reads progress from SQLite without calling MOEX ISS.

The step operation shares the existing in-flight and cooldown guard with the
bounded Historical Data requests. It cannot run in parallel with them, and the
cooldown is extended from request completion. There is no automatic loop.

## Manual minute-candle synchronization

The Historical Data screen also exposes an explicit manual workflow for the
`ONE_MINUTE` source anchor. The operator selects only `fromDate`; the server
owns the upper boundary and always stops at the start of the current Moscow
calendar day. The current trading day is therefore outside this historical
workflow. A command is bounded to 366 closed days so an accidental ancient date
cannot create an unbounded request queue.

The workflow uses two endpoints:

- `GET /api/v1/market-pulse/historical-candles/manual-sync/plan` with exactly
  `instrumentId` and `fromDate=YYYY-MM-DD` reads persisted coverage and returns
  one calendar entry for every day through yesterday;
- `POST /api/v1/market-pulse/historical-candles/manual-sync/step` with the exact
  body `{ "instrumentId": "CNYRUB_TOM", "fromDate": "YYYY-MM-DD" }` processes
  at most the oldest uncovered day and returns the updated plan.

The UI calls the step endpoint sequentially. It never starts the next day
before the previous day completes and stops on the first error. A day is loaded
from MOEX ISS in paged batches, with the existing two-second source pacing.
Only after every page succeeds are the sorted source Candles and their coverage
range persisted atomically. An empty day is recorded as successfully checked,
which prevents weekends and exchange holidays from being requested again.
The range loader also stops after ten source pages, rather than continuing an
unexpectedly non-terminating upstream pagination sequence.

The calendar is a progress view, not a second source of truth. Grey, blue,
green, muted-green, and red cells represent pending, active, newly completed,
previously covered, and failed days respectively. Re-running the same command
continues from the first day that has no persisted coverage.

## Reads

`GetStoredHistoricalCandlesUseCase` reads one anchor Timeframe from SQLite and
performs calendar-aware aggregation in `Europe/Moscow`. Four-hour buckets start
at `00:00`, `04:00`, `08:00`, `12:00`, `16:00`, and `20:00`; weeks start on
Monday; months start on the first day. Missing trading periods do not produce
synthetic Candles. Every result also carries `coverageComplete`, so an unloaded
gap cannot silently look like a market closure.

The current UI still uses the bounded explicit
`POST /api/v1/market-pulse/historical-candles/sync` flow for five- and
fifteen-minute display. It does not poll and does not start the bulk backfill.
