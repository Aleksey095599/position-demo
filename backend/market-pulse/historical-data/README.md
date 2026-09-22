# Market Pulse historical data

This feature uses two native MOEX ISS anchor Timeframes:

- `ONE_MINUTE` for the last complete Moscow calendar year;
- `ONE_DAY` for the last ten complete Moscow calendar years.

Externally loaded Candles are persisted in `moex_iss_minute_candles / moex_iss_day_candles` together
with their data source and load timestamp. `FIVE_MINUTES`, `FIFTEEN_MINUTES`,
`ONE_HOUR`, and `FOUR_HOURS` are currently derived from stored minutes on read;
`ONE_WEEK` and `ONE_MONTH` are derived from stored days. The separate
`moex_iss_aggregated_candles` table is reserved for materializing those results
in the next implementation step. There is no quarterly Timeframe.

The source and aggregated tables intentionally contain only OHLC and the
minimum provenance needed by their roles. Exchange turnover (`value`) and
traded quantity (`volume`) are not stored.

## Backfill

### Agreed target history strategy

The intended retention horizon for minute source candles is at most about one
year. They will supply 5-minute, 15-minute, hourly, four-hourly, and daily
derived candles. Minute-to-day aggregation is an agreed next capability, not
part of the currently implemented aggregation targets listed above.

Long weekly and monthly series will use native daily source candles instead
of a deep minute backfill. Daily source history should cover the recent period
as well as older years so those series have a continuous input. Native daily
source candles and daily candles derived from minutes retain separate provenance;
they must not be silently substituted for each other. Daily loading in the
calendar supports native daily loading independently of minute-derived daily candles.

The Historical Data UI groups Instrument, Source Bar Timeframe, and the date
range in one Source Candle Loading panel. The shared selection controls both
loading and the calendar; loading, clearing, and refreshing actions sit next
to the calendar navigation.

Source loading is available only through the Data Management calendar API.
The shared paged loader retrieves all pages of a complete Moscow day, keeping
at least two seconds between source requests and stopping after ten pages.
Candles and the successful day result are committed atomically; empty days
are successful loads too. Errors preserve previously stored data and record
the failed attempt separately.

## Reads

`GetStoredHistoricalCandlesUseCase` reads one anchor Timeframe from SQLite and
performs calendar-aware aggregation in `Europe/Moscow`. Four-hour buckets start
at `00:00`, `04:00`, `08:00`, `12:00`, `16:00`, and `20:00`; weeks start on
Monday; months start on the first day. Missing trading periods do not produce
synthetic Candles. Every result also carries `coverageComplete`, so an unloaded
gap cannot silently look like a market closure.

Charts retains its form for a later redesign. Its loading button is disabled;
it makes no source requests and does not write candles. The old direct-load,
sync, backfill and manual-sync APIs and their coordinators have been removed.
Stored-candle reads and aggregation remain available as application/domain code.

## Source Candles calendar

Data Management shows a persistent monthly calendar for MOEX ISS source candles.
Instrument and Source Bar Timeframe (`ONE_MINUTE` / `ONE_DAY`) select independent
calendars. Calendar reads query SQLite only; navigation never loads exchange
history. The minute window is the latest 366 completed Moscow calendar days;
daily history is available for ten years. Today and future days are unavailable.
Each manual selection is limited to 366 days, so deeper daily history is loaded
in several runs. Daily cells display dates and statuses, without candle counts.

- GET /api/v1/market-pulse/historical-candles/calendar?instrumentId=CNYRUB_TOM&timeframe=ONE_DAY&month=YYYY-MM
- POST /api/v1/market-pulse/historical-candles/calendar/load-day with instrumentId, timeframe and date (YYYY-MM-DD).

Omitting timeframe retains `ONE_MINUTE` behavior. Derived timeframes are rejected.

Day loading shares the existing in-flight/cooldown guard and paginated loader.
The UI selects an inclusive date range directly in the calendar. The first click
selects a single day and the second sets the other endpoint, including across
months and in reverse order. A third click starts a new selection. The Load
Candles action reads local coverage for the selected months. Daily-only loading
skips confirmed days. Minute loading sends each selected day to the server so
previously saved minutes can be checked and missing daily data can be retried.
The server skips confirmed source ranges; days run sequentially and a source
request error stops the batch without reverting previously saved candles.
From date / To date inputs stay synchronized with the calendar selection.
Loading uses a rotating Material Symbols indicator; reduced-motion preferences
disable rotation while retaining the loading icon and text.

The minute day table has one row per instrument_id and load_date, with completed_at,
last_attempt_at, and last_error. Candle counts and first/last timestamps are
computed from source rows rather than duplicated. All pages of a day and its
successful completion are saved atomically; failures persist without committing
a partial page batch. There is no PARTIAL / Unconfirmed calendar status.
Existing candles without a completed day result remain Not loaded and can be
loaded through the calendar; counts alone never confirm successful loading.
A successful empty response is a completed day with zero candles. COMPLETED means
all source pages were saved; it does not certify uninterrupted minute trading.
No fixed 1,440-candle requirement or gap-quality inference is applied. A later
failed attempt does not erase an earlier completed_at.

Daily candles are stored in `moex_iss_day_candles`. Their load outcome is stored in
`moex_iss_day_candle_load_result`, one row per instrument_id and load_date, with
completed_at, last_attempt_at and last_error, just like minute day tracking.
Only fully covered Moscow days are confirmed. Candles and successful day outcomes
are saved in one transaction; successful loading clears the saved error. Continuous
coverage ranges used by application ports are computed from these day records,
not stored separately.
Both timeframes share the source request pacing and in-flight guard. Native daily
candles are requested with MOEX ISS interval 24; no minute backfill or aggregation
is triggered by selecting `1 day`.

## Source candle integrity

The calendar's minute-day command first saves a complete minute range, then uses
an existing daily candle or loads its native daily range with the same paced
loader. A daily request failure leaves the minutes saved; the next run retries
the daily request without reloading minutes. Daily-only loading checks existing
minutes but never fetches them. A manual retry may reload a confirmed empty day
when candles exist on the opposite side. This is bounded to one complete day;
non-empty confirmed ranges and days with both datasets empty are not reloaded.

`verifyDailyCandleOpenClose({ dailyCandle, minuteCandles })` is a pure domain
function: it orders minutes by timestamp and compares only daily Open / first
minute Open and daily Close / last minute Close with decimal arithmetic. High,
Low, expected counts, gaps and session schedules are not checked. Matching prices
do not prove complete minute coverage.

`checkSourceCandleIntegrity` wraps the price check and mutual-presence checks:

- Not requested or incomplete minute loading: `NOT_CHECKED`, no integrity warning.
- Both loads confirmed empty: `EMPTY`, both calendars remain Loaded.
- Minutes exist and daily loading completed empty: `MISSING_DAILY`, daily calendar Error.
- A daily candle exists and minute loading completed empty: `MISSING_MINUTES`, minute calendar Error.
- Complete minutes and a daily candle disagree on Open/Close: `MISMATCH`, both calendars Integrity warning.
- Complete minutes and a daily candle agree: `MATCH`, Loaded for confirmed datasets.

Request failures remain red on the affected timeframe; saved data on the other
side is preserved. Calendars recompute integrity from source boundary candles
and existing load journals, without persisting duplicated status flags, fetching
MOEX, or writing logs. The query reads first/last candles rather than transferring
all minutes of a month. Errors and warnings retain their background during range
selection; blue borders/endpoint outlines still identify the selection.

Price mismatches and mutual-presence problems do not stop loading or change candle
values. Technical load errors stop the batch. The application passes these events
to `FileCandleVerificationLogger`, which appends UTF-8 JSON lines to
`logs/candle_load/candle-verification.log.txt` (a plain text file). Each line holds
the UTC check time, source/board/instrument, Moscow date, first/last minute UTC
timestamps, both Open/Close pairs and their comparison flags for price mismatches,
or the affected timeframe/reason for other events. Event types are `LOAD_ERROR`,
`MISSING_DAILY_CANDLE`, `MISSING_MINUTE_CANDLES`, and `OPEN_CLOSE_MISMATCH`.
The file is created on the first logged issue and ignored by Git. Matches, normal
empty days and not-yet-requested datasets are not logged. Repeating an operation
can append another entry for the same issue. The UI reports mismatch and missing
data counts after the batch. Failure to write
the log is reported explicitly and stops the operation without deleting data.
No schema changes or foreign keys are needed for this verification.

The day-storage migration consolidates former `moex_iss_daily_candle_load_ranges`
and `moex_iss_daily_candle_load_attempts` into `moex_iss_day_candle_load_result`,
and copies `moex_iss_daily_candles` into `moex_iss_day_candles`. Only complete days
from merged coverage become successful outcomes. Explicit attempts and errors
are preserved; partial boundary coverage is retained in the archived originals.
Original tables are renamed with a `legacy_` prefix for recovery. Conflicting
candle keys or invalid data roll back the copy. The migration runs after schema
creation during server startup and is a no-op after a successful conversion.

Minute and daily source storage are separate and constrained to MOEX_ISS and
their respective fixed timeframe. Aggregation storage keeps its target timeframe.
The storage migration copies data transactionally and retains original tables as
legacy_market_source_candles, legacy_market_aggregated_candles, and
legacy_market_candle_load_ranges (or legacy_market_candles for older databases).
Only fully covered Moscow days become completed day records; partial boundary
coverage remains archived and is not treated as a confirmed day. Unsupported
source data or conflicting destination rows abort the copy without losing data.

Minute load results use `moex_iss_minute_candle_load_result`, matching the day
load-result naming. Startup renames the previous `moex_iss_minute_candle_load_days`
table before applying the schema, preserving all stored results and constraints.

## Day details

Calendar dates select the loading range. A separate status button opens a
non-modal day-details popover without changing that selection. The card stays
inside the viewport, closes on Escape, outside interaction, or context changes,
and returns keyboard focus to its status button when explicitly closed.
Successful loads show candle start times and Loaded at; errors show a readable
explanation and Last attempt, with the raw error available under Technical details.
Integrity warnings show daily and minute Open/Close values side by side.
Counts remain in minute cells; there is no persistent details block below the grid.
For new tracked loads, last_attempt_at records the start of the source loading
attempt on both success and failure; completed_at records successful completion.
Existing timestamps are preserved, and skipped loads do not change either field.
