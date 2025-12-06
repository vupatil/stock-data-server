# Copilot Instructions

## Architecture Overview

**Purpose:** MySQL-cached stock market data server solving rate-limit problems by batching Alpaca API calls. Serves Yahoo-Finance-compatible JSON to clients.

**Two-Process Architecture:**
- `collector.js` - Cron-scheduled data ingestion + gap filling + cleanup (runs continuously)
- `server.js` - Express API serving cached data with live fallback (runs continuously)
- Both must run simultaneously; collector populates DB, server reads from it

**Key Components:**
- `config/database.js` - MySQL connection pool (`initDB()` → `getDB()`)
- `database/schema.sql` - Tables: `stocks` (master list), `candles` (OHLCV + metadata), `data_collection_log` (monitoring)
- `src/providers/` - Multi-provider support (Alpaca primary, Schwab optional)

## Data Flow & Collection Strategy

**Collection Pipeline:**
1. Cron triggers interval collection (1m, 2m, 5m, 15m, 30m, 1h, 2h, 4h, 1d, 1w, 1mo)
2. `processBatchedSymbols()` utility splits symbols into batches of `ALPACA_BATCH_SIZE` (50)
3. Each batch calls `fetchAlpacaBars()` with comma-joined symbols (`/v2/stocks/bars?symbols=AAPL,TSLA,...`)
4. `storeBars()` upserts to `candles` with `retryOnDeadlock()` wrapper (unique key: `stock_id, interval_type, ts`)
5. API reads MySQL; if data missing/stale (>24h), falls back to Alpaca and may auto-add symbol

**Batch Processing Pattern (CRITICAL):**
- **Always use `processBatchedSymbols()` from `src/utils/batchProcessor.js`** for new batch operations
- `ALPACA_BATCH_SIZE` constant reads from `.env` (default: 50) - never hardcode batch sizes
- **Never send more than 50 symbols** in a single Alpaca request (API limit - returns only first 50)
- Function signature: `processBatchedSymbols(symbols, processBatch, options)`
- Options: `batchSize`, `delayBetweenBatches`, `onBatchComplete`, `stopOnError`, `silent`
- Returns statistics: `totalBatches`, `successfulBatches`, `failedBatches`, `processedSymbols`, `errors`
- Example:
```javascript
const { processBatchedSymbols, ALPACA_BATCH_SIZE } = require('./src/utils/batchProcessor');

await processBatchedSymbols(
  symbols,
  async (batch, batchIndex, totalBatches) => {
    const barsData = await fetchAlpacaBars(batch, ...);
    // Process bars
    return { success: true, processedCount: batch.length };
  },
  { batchSize: ALPACA_BATCH_SIZE, delayBetweenBatches: 500 }
);
```

**Critical Patterns:**
- **Deadlock retry:** All DB writes wrapped in `retryOnDeadlock(fn, 3)` with exponential backoff
- **Symbol normalization:** Convert hyphens to dots (`BRK-B` → `BRK.B`) before any API/DB operation
- **Unique constraint:** `candles(stock_id, interval_type, ts)` - upserts update OHLCV fields
- **Excluded symbols:** Check `excluded_symbols` table before collection with `getValidSymbols()`

## Scheduling & Timing

**Cron Schedules (defined in `collector.js` INTERVALS array):**
- Intraday (1m-4h): Only runs during market hours (9:30 AM - 4:00 PM ET) via `isMarketHours()` check
- Daily (1d): 4 PM ET weekdays (`0 16 * * 1-5`)
- Weekly (1w): 4 PM ET Fridays (`0 16 * * 5`)
- Monthly (1mo): 4 PM ET last day of month (`0 16 28-31 * *`)
- Cleanup: 3 AM daily (`0 3 * * *`)

**Gap Handling:**
- `fillAllGaps()` runs on startup and after collection failures
- Priority order (env `GAP_FILL_PRIORITY`): `1d,1w,1mo,4h,2h,1h,30m,15m,5m,2m,1m` (long intervals first)
- Uses `detectGaps(symbol, interval)` to find missing data, then batch fetches
- Handles laptop sleep/network interruptions gracefully

## API Behavior & Response Formats

**Primary Endpoint:** `GET /api/stock/:symbol?interval=1d&includePrePost=false`
- Returns Yahoo Finance chart format (nested JSON with `chart.result[0].timestamp`, `indicators.quote`)
- **Interval mapping:** Accepts both direct (`1m`, `5m`, `1d`) and legacy ranges (`1d` → `1m`, `5d` → `5m`, etc.) via `normalizeInterval()`
- **Staleness:** If MySQL data >24h old (`DATA_STALE_MINUTES`), falls back to Alpaca live fetch
- **Extended hours:** Filtered out by default; include with `includePrePost=true` (only applies to intraday)
- **404 behavior:** Invalid/inactive symbols return 404 with descriptive message (not empty data)

**Other Endpoints:**
- `/bars` - Alternative format, same logic
- `/symbols` - List all tracked symbols from `stocks` table
- `/stats` - Requires `data_coverage`/`collection_stats` views/tables (500 if missing)
- `/health` - System status check

## Database Patterns

**Initialization Order:**
1. Run `node setup.js` once (creates DB + tables from `schema.sql` + populates historical data)
2. Setup automatically:
   - Creates database and all tables
   - Reads `STOCK_SYMBOLS` from `.env`
   - Fetches ~600 candles per interval for all symbols (batch requests of 50 symbols - Alpaca limit)
   - Tracks symbols with no data in `excluded_symbols` table
   - Runs gap detection and fills missing data
3. Both `collector.js` and `server.js` call `initDB()` on startup
4. Use `getDB()` for queries (throws if not initialized)
5. Never call `getDB()` before `initDB()` completes

**Query Patterns:**
- Stock lookup: `SELECT stock_id FROM stocks WHERE symbol = ?` (auto-insert on miss in API)
- Candle fetch: Index-optimized `WHERE stock_id = ? AND interval_type = ? AND ts >= ?` with `ORDER BY ts DESC`
- Cleanup: Delete oldest when count > `MAX_CANDLES_PER_INTERVAL` (default 600, README says 400—set explicitly in `.env`)
- Exclude invalid symbols: `WHERE symbol NOT IN (SELECT symbol FROM excluded_symbols WHERE retry_after IS NULL OR retry_after > NOW())`

**Excluded Symbols Table:**
- Tracks symbols that returned no data from providers
- Columns: `symbol`, `reason`, `providers_failed` (CSV), `retry_after` (timestamp), `retry_count`
- Automatically retries after 30 days
- Prevents wasting API calls on delisted/invalid tickers
- Supports multi-provider fallback (Alpaca → Schwab → Polygon)

**Deadlock Handling:**
```javascript
await retryOnDeadlock(async () => {
  await db.query('INSERT INTO candles ... ON DUPLICATE KEY UPDATE ...');
}, 3); // 3 retries with exponential backoff
```

## Configuration & Environment

**Required `.env` Variables:**
- `ALPACA_API_KEY`, `ALPACA_API_SECRET` (exit if missing)
- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`

**Important Defaults:**
- `ALPACA_BATCH_SIZE=50` (Alpaca's API hard limit - never increase above 50)
- `MAX_CANDLES_PER_INTERVAL=600` (docs inconsistent with 400)
- `EXTENDED_HOURS_COLLECTION=false` (sets Alpaca feed: `sip` if true, `iex` if false)
- `GAP_FILL_PRIORITY=1d,1w,1mo,...` (comma-separated, long intervals first)
- `STOCK_SYMBOLS=AAPL,TSLA,MSFT,...` (comma list for collection)
- `COLLECTION_ENABLED=true` (set false to disable cron jobs)
- `DATA_STALE_MINUTES=1440` (24h in code, README says 5m—adjust consciously)

## Developer Workflows

**Fresh Deployment Setup:**
```bash
npm install
node verify.js          # Check env + dependencies
node setup.js           # Create DB schema + populate ALL historical data
                        # This will:
                        # - Create database and tables
                        # - Insert all symbols from STOCK_SYMBOLS env var
                        # - Fetch ~600 candles per interval per symbol
                        # - Use 100-symbol batch requests to Alpaca
                        # - Track failed symbols in excluded_symbols table
                        # - Run gap detection and filling
                        # - Takes 5-10 minutes for 500 symbols
node collector.js       # Terminal 1 (keep running) - excludes invalid symbols
node server.js          # Terminal 2 (keep running)
```

**Production Deployment:**
```bash
pm2 start collector.js --name stock-collector
pm2 start server.js --name stock-server
pm2 save && pm2 startup
```

**Maintenance:**
- `auto-refill-checker.js` - Runs every 6h to refill symbols with <100 daily bars (deletes + refetches 3y of `1d` data)
- `node populate-symbols.js` - Bulk add symbols to `stocks` table
- `node cleanup-db.js` - Manual cleanup script
- Check `excluded_symbols` table periodically for symbols to re-validate

**Testing:**
- No automated tests; manual validation via `test-*.js` scripts
- `test-connection.js` - Alpaca API connectivity
- `test-quick.js`, `test-comprehensive.js` - API endpoint smoke tests
- Curl examples in `README.md`/`QUICKSTART.md`

## Error Handling & Edge Cases

**MySQL Must Init First:**
- Both processes check DB connection before starting cron/server
- Exit with error if connection fails

**Symbol Edge Cases:**
- Normalize hyphens to dots before all API/DB calls
- Return 404 for invalid symbols (don't insert into `stocks` in collector)
- Auto-add valid symbols on API request if not in DB

**Stats Endpoint Dependencies:**
- Expects `data_coverage` or `collection_stats` DB views/tables
- Returns 500 if missing—add them or handle gracefully

**Provider Fallback:**
- `src/providers/ProviderManager.js` supports Schwab → Alpaca fallback
- Priority via `PROVIDER_PRIORITY` env (default: `schwab,alpaca`)
- Alpaca always available as fallback if configured

## Code Modification Guidelines

**When Adding Intervals:**
- Update `INTERVALS` array in `collector.js` with cron + Alpaca mapping
- Ensure unique cron schedule (avoid conflicts)
- Add to `GAP_FILL_PRIORITY` appropriately

**When Changing Response Format:**
- **Don't.** Client compatibility promise—API shape must match Yahoo Finance
- If unavoidable, version the endpoint (`/api/v2/stock/:symbol`)

**When Modifying Collection:**
- Always use `processBatchedSymbols()` utility from `src/utils/batchProcessor.js`
- Never send more than `ALPACA_BATCH_SIZE` (50) symbols in a single Alpaca request
- Wrap DB writes in `retryOnDeadlock()`
- Test gap filling after changes (simulate laptop sleep)
- Example pattern:
```javascript
const { processBatchedSymbols, ALPACA_BATCH_SIZE } = require('./src/utils/batchProcessor');

const result = await processBatchedSymbols(
  validSymbols,
  async (batch, batchIndex, totalBatches) => {
    const barsData = await fetchAlpacaBars(batch, start, end, intervalConfig.alpaca);
    const inserted = await storeBars(barsData, intervalName);
    console.log(`Batch ${batchIndex + 1}/${totalBatches}: ${inserted} bars stored`);
    return { success: true, processedCount: batch.length };
  },
  { 
    batchSize: ALPACA_BATCH_SIZE, 
    delayBetweenBatches: 500,
    silent: false  // Set true to suppress utility's progress logging
  }
);
```

**Security Notes:**
- Helmet + CORS already configured
- Rate limiting disabled by default (uncomment in `server.js` if needed)
- `ALLOWED_ORIGINS` currently permissive—restrict for production
