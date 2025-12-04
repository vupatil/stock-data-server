# Copilot Instructions

- Purpose: cache Alpaca market data in MySQL and serve Yahoo-Finance-compatible JSON; keep collector and API server as separate long-running processes.
- Key entry points: `collector.js` (cron-based ingestion + gap fill + cleanup), `server.js` (Express API + MySQL-first, Alpaca fallback), `config/database.js` (pool), `database/schema.sql` (tables: `stocks`, `candles`, `data_collection_log`).
- Data flow: collector pulls batch bars from Alpaca for many symbols/timeframes → upserts into `candles` (unique by `stock_id, interval_type, ts`) → API reads MySQL; if missing/stale, falls back to Alpaca, may auto-add symbol to `stocks`.
- Scheduling: intervals defined in `collector.js` (1m..1mo) with cron strings; cleanup cron `0 3 * * *` trims oldest when count > `MAX_CANDLES_PER_INTERVAL` (env, default 600 though docs mention 400—set explicitly).
- Gap handling: `fillAllGaps` runs through `GAP_FILL_PRIORITY` (env or default `1d,1w,1mo,4h,2h,1h,30m,15m,5m,2m,1m`) using batch Alpaca calls; laptop sleep/interrupts are expected—keep priority order when modifying.
- Extended hours: collection uses `EXTENDED_HOURS_COLLECTION` to pick Alpaca feed (`sip` vs `iex`); API filters extended hours unless `includePrePost=true` (only for intraday intervals).
- Interval semantics: API accepts both direct intervals and legacy ranges; normalization occurs in `normalizeInterval`/`getTimeRangeForInterval`; staleness guard `DATA_STALE_MINUTES` is 24h in code (README says 5m) — adjust consciously if changing.
- Symbol normalization: hyphens become dots (e.g., `BRK-B` → `BRK.B`) before any API/DB call; invalid/inactive symbols return 404 variants instead of empty data.
- API surface: `/api/stock/:symbol?interval=1d&includePrePost=false` (Yahoo chart shape), `/bars`, `/symbols`, `/stats`, `/health`; stats endpoint expects `data_coverage`/`collection_stats` views or tables—add them if missing to avoid 500s.
- Database expectations: run `node setup.js` to create DB/tables; `candles` stores OHLCV + vwap/trade_count + data_source; foreign key on `stocks`; indexes tuned for `stock_id, interval_type, ts` queries.
- Configuration (env): `ALPACA_API_KEY/SECRET` required; DB creds (`DB_HOST/PORT/USER/PASSWORD/NAME`); `COLLECTION_ENABLED`, `MAX_CANDLES_PER_INTERVAL`, `EXTENDED_HOURS_COLLECTION`, `GAP_FILL_PRIORITY`, `STOCK_SYMBOLS` (comma list), `ALLOWED_ORIGINS`, `PORT`, `ALPACA_BASE_URL`.
- Runbook (local): `npm install`; `node verify.js` for sanity; `node setup.js`; start collector `node collector.js` (Terminal 1) then API `node server.js` (Terminal 2); optional `node test-connection.js` to validate Alpaca; production via PM2 (`pm2 start collector.js`, `pm2 start server.js`).
- Auto-maintenance: `auto-refill-checker.js` refills symbols with <100 daily bars every 6h (deletes then refills `1d`); keep DB credentials aligned with `.env`.
- Error patterns: MySQL must be initialized before API start; missing Alpaca creds cause fast exit in both collector and server; deadlocks handled via retry in collector writes; watch for stats endpoint failures if supporting tables absent.
- Coding patterns: use `getDB()` only after `initDB()`; prefer batch Alpaca requests (`/v2/stocks/bars` with comma symbols); keep upsert statements aligned with `candles` unique key; avoid changing response shape (client compatibility promise).
- Security/perf: Helmet + rate limit already applied; CORS currently permissive—tighten `ALLOWED_ORIGINS` for prod; API rate limit at 1000/15m.
- Testing: no automated tests; manual scripts above; verify API via curl examples in `README.md`/`QUICKSTART.md`.
