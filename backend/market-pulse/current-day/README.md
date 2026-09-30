# Current Day Loading

Current Day Loading is a backend domain process for MOEX ISS minute source candles. It is independent of frontend tabs and of application startup. `bootstrap()` connects the optional persisted startup preference to `start()`; importing/constructing the module never starts a network request.

On each start, and when the Moscow calendar date changes, the process reads the current day from 00:00 through a captured wall-clock timestamp. Later cycles read from the latest saved minute inclusively through the next captured timestamp. There is no publication-delay constant or five-minute overlap. Returned candles from the wall-clock minute still being formed are excluded; the latest published completed minute can still be revised and is deliberately reread. Pagination completes before a single atomic candle-and-coverage write. A failed page does not change existing candles or successful coverage. Current-day writes never mark a historical day as completed.

A successful response proves coverage only through its latest returned candle. Missing minutes within that checked prefix can be displayed as No data; the suffix without published candles remains Not loaded. An empty response is successful but does not prove that the market is closed or that the entire requested interval has no trades. Candle validity uses the shared OHLC domain validator and minute timestamp boundaries; adjacent Close/Open prices are not compared.

One request cycle is active at a time. The next cycle is scheduled the configured whole number of minutes (1–60, default 1) after completion. Source calls within a cycle are paced; at most ten pages are accepted per query. Failed requests retry on the next cycle. `stop()` invalidates in-flight results and prevents subsequent page requests; the source adapter still supplies its normal HTTP timeout. `dispose()` stops and waits for the outstanding operation before the caller closes SQLite.

Settings persist in `market_current_day_loading_settings`; attempts, successful checked ranges and end-day work persist per instrument/date in `moex_iss_current_day_load_result`. Defaults are auto-start off and end-day reload off.

## Reload and Recalculate After Day End

When enabled, days touched by the process are remembered for completion. The first running cycle at or after 00:01 Moscow on a later date fetches the entire minute day and its native daily candle. This is a completed-calendar-day scheduling rule, not an assumed source publication delay. It has the same source-finality assumption as Historical Data: the source is expected to expose that completed day's available data. It does not claim provider confirmation that no future correction can ever arrive.

If only one of the minute and daily datasets is present, the shared source integrity check leaves completion pending for retry. A price-boundary mismatch remains a Historical Data integrity warning. Only after all pages of both datasets succeed are the previous minute and native daily rows transactionally replaced, including deleting obsolete rows, and the historical load results marked completed. The shared source-day integrity views continue to compare minute boundaries with the native day candle. M5, M15, H1, H4 and D1 aggregation is then recalculated through the supplied callback. The day is marked finalized only after all calculations succeed. Failures remain pending durably for the next cycle or restart. Disabling the setting pauses pending work without deleting it. Empty weekend days complete normally. An application that was not running does not fabricate work for untouched intervening days.

## Integration

`createCurrentDayModule({ database, sourceRepository, marketDataSource, calculateDay, ...clockAndSchedulerOptions })` returns `settings.get()/update(patch)` and `process.start()/stop()/status()/bootstrap()/runNow()/dispose()`. Start and stop return a status immediately. Dispose returns a promise. `calculateDay({instrumentId,date,timeframe})` is the existing aggregation application service. SQLite tables are initialized idempotently by the repository, including on existing installations.
