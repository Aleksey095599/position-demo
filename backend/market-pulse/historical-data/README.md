# Market Pulse historical data

This feature uses two native MOEX ISS anchor Timeframes:

- `ONE_MINUTE` for the last complete Moscow calendar year;
- `ONE_DAY` for the last ten complete Moscow calendar years.

Externally loaded Candles are persisted in `moex_iss_minute_candles / moex_iss_daily_candles` together
with their data source and load timestamp. `FIVE_MINUTES`, `FIFTEEN_MINUTES`,
`ONE_HOUR`, and `FOUR_HOURS` are currently derived from stored minutes on read;
`ONE_WEEK` and `ONE_MONTH` are derived from stored days. The separate
`moex_iss_aggregated_candles` table is reserved for materializing those results
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
and safely resumes from `moex_iss_minute_candle_load_days / moex_iss_daily_candle_load_ranges`. It is deliberately not
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

The legacy manual synchronization API supports an explicit workflow for the
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

Clients of this legacy API call the step endpoint sequentially. It never starts the next day
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

## Source Candles calendar

Data Management shows a persistent monthly calendar for MOEX ISS one-minute candles.
The source and timeframe are fixed. Calendar reads query SQLite only; navigation
never loads exchange history. The window is the latest 366 completed Moscow
calendar days. Today and future days are visible but unavailable for loading.

- GET /api/v1/market-pulse/historical-candles/calendar?instrumentId=CNYRUB_TOM&month=YYYY-MM
- POST /api/v1/market-pulse/historical-candles/calendar/load-day with exactly instrumentId and date (YYYY-MM-DD).

Day loading shares the existing in-flight/cooldown guard and paginated loader.
The UI selects an inclusive date range directly in the calendar. The first click
selects a single day and the second sets the other endpoint, including across
months and in reverse order. A third click starts a new selection. One Load
selected days action reads local coverage for the selected months, skips confirmed
days, loads the remaining selected days sequentially, and stops on the first error.
The From Date / Through Date fields and separate Load day action are removed.
The legacy manual-sync endpoints remain available but are not used by this UI.
Loading uses a rotating Material Symbols indicator; reduced-motion preferences
disable rotation while retaining the loading icon and text.

The day table has one row per instrument_id and load_date, with completed_at,
last_attempt_at, and last_error. Candle counts and first/last timestamps are
computed from source rows rather than duplicated. All pages of a day and its
successful completion are saved atomically; failures persist without committing
a partial page batch. Source reads from Charts can still create unconfirmed days.
A successful empty response is a completed day with zero candles. COMPLETED means
all source pages were saved; it does not certify uninterrupted minute trading.
No fixed 1,440-candle requirement or gap-quality inference is applied. A later
failed attempt does not erase an earlier completed_at.

Minute and daily source storage are separate and constrained to MOEX_ISS and
their respective fixed timeframe. Aggregation storage keeps its target timeframe.
The storage migration copies data transactionally and retains original tables as
legacy_market_source_candles, legacy_market_aggregated_candles, and
legacy_market_candle_load_ranges (or legacy_market_candles for older databases).
Only fully covered Moscow days become completed day records; partial boundary
coverage remains archived and is not treated as a confirmed day. Unsupported
source data or conflicting destination rows abort the copy without losing data.
