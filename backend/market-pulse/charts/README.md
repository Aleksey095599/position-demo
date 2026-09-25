# Stored candle charts

Charts is a read-only query feature, independent of source loading and candle calculation.

- `GET /api/v1/market-pulse/charts/catalog` lists available sources, instruments, timeframes and price precision.
- `GET /api/v1/market-pulse/charts/candles?source=MOEX_ISS&instrumentId=CNYRUB_TOM&timeframe=ONE_HOUR` returns the latest 500 candles, ascending by opening time.
- Optional `before` is an exclusive ISO UTC opening-time cursor. `limit` is bounded to 1–1000. `nextBefore` and `hasMore` support backward pagination.
- M1 reads stored source minutes; M5/M15/H1/H4 read persisted aggregates with Complete or Partial coverage. Calculated D1 requires Sufficient coverage. Domain minimum component counts are M5: 3, M15: 8, H1: 30, H4: 120, D1: 240. Filtering happens before pagination; insufficient candles remain stored and available in the calendars.
- D1 prefers calculated candles per Moscow trading date and falls back to source D1 only when a calculated candle is absent. An insufficient calculated D1 is excluded, not replaced with source D1. Source candles do not have a calculated minute-coverage classification.
- Coverage is derived from `component_count`; stale flags reflect missing/failed calculation results or changed source completion timestamps. Reads never calculate, download or persist candles.

The frontend uses an independent chart workspace controller. Its source selector is populated from the catalog (currently MOEX ISS only). First use selects CNY/RUB TOM H1; later openings restore source/instrument/timeframe from this browser's `market-chart-selection-v1` local storage. This is not an authenticated user profile or a multi-device chart layout.

Charts opens at the latest eligible stored candles; it does not imply live market data. D1 uses Moscow trading dates, intraday timestamps remain UTC with Moscow display formatting. History prepends preserve the visible logical range. Refresh explicitly reloads the latest stored data; failed history pagination can be retried without clearing the chart. Quality analysis stays in the calendars: Charts has no technical history summary or crosshair OHLC/coverage text. Loading announcements remain available to assistive technology, and load errors remain visible.

No database migration or new dependency is required. Restart the backend after deploying these API routes. W1/MN1 and persistent multi-chart user layouts remain separate future features.

Verification: `node --test backend/market-pulse/charts/charts.test.js backend/market-pulse/charts/charts-ui.test.js`.
