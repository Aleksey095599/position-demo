# Candle aggregation

Calculations use completed minute source days and replace the target day's
aggregated candles atomically. Target results are isolated by instrument,
timeframe and Moscow calendar date. A calculation never loads source data.

All nonempty candles retain OHLC and `component_count`, including candles with
insufficient coverage. Coverage is derived from the count, not persisted as a
status. An empty, successfully loaded source day produces `NO_DATA`; an unloaded
day cannot be calculated.

## Coverage rules

- `FIVE_MINUTES`: 5 minutes complete; 3–4 partial; 1–2 insufficient.
- `FIFTEEN_MINUTES`: 15 minutes complete; 8–14 partial; 1–7 insufficient.
- `ONE_HOUR`: 60 minutes complete; 30–59 partial; 1–29 insufficient.
- `FOUR_HOURS`: 240 minutes complete; 120–239 partial; 1–119 insufficient.
- `ONE_DAY`: at least 240 actual minute candles sufficient; 1–239 insufficient.

Daily candles group source minutes between consecutive Moscow midnights. Their
sufficiency threshold does not describe a trading session's length or require
continuous minutes. Daily results have no partial/complete classification and
do not report absent overnight minutes as gaps. Details retain the first and
last source timestamps. Intraday rules and their missing-minute diagnostics
are unchanged.

Daily calculations have a separate calendar under `Calculation Timeframe`.
`CALCULATED` describes successful calculation, independently of coverage.
Source reloads or missing target intervals require recalculation.

## Calculate all timeframes

`GET /api/v1/market-pulse/candle-aggregation/batch-plan?instrumentId=CNYRUB_TOM`
returns a read-only plan for all supported targets and all stored, completed,
nonempty minute days before today in Moscow. It is independent of the selected
month, date range and target timeframe. Integrity warnings do not exclude usable
minute data. Source loading limits do not hide already stored older minutes from
aggregation calendars or the batch plan.

Current results are omitted. Missing, stale and failed results are queued in
date/timeframe order. After confirmation the browser calls the existing
`calculate-day` endpoint sequentially, preserving its validation and transactional
day replacement. Stop finishes the in-flight calculation and sends no subsequent
commands. The first error stops the queue; preparing a new plan resumes unfinished
work without recalculating current results. The page must remain open; this is not
a persistent background job. No source downloads are performed.

## Storage upgrade

`migrateDailyAggregation` expands the existing candle and result table constraints
to permit `ONE_DAY` from `ONE_MINUTE`. It preserves records, explicit indexes and
triggers, runs transactionally and is idempotent. It runs during backend startup;
back up the working database before applying it. The upgrade does not calculate
days automatically or change source candles.

`migrateSubhourAggregation` permits `FIVE_MINUTES` and `FIFTEEN_MINUTES` in calculation results,
preserving existing records, indexes and triggers. Quarter-hour candles start at
00, 15, 30 and 45 minutes of each Moscow hour. Their detail view has 96 intervals;
empty intervals do not produce synthetic candles.

Five-minute candles start at 00, 05, 10, …, 55 minutes of each Moscow hour.
Their detail view has 288 intervals with the opening time inside each block.
The migration also supports databases already upgraded for quarter-hour results.

Chart fallback to source daily candles and statistical filtering are separate
consumer concerns and are not introduced by this calculation feature.
