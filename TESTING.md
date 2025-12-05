# Testing Guide - Batch Collection

## Quick Test (Run After Every Change)

Run this after making any code changes to verify basic functionality:

```bash
npm test
```

This will:
- ✅ Test database connection
- ✅ Test provider initialization
- ✅ Test batch request format
- ✅ Test API batch calls
- ✅ Test adding new symbols
- ✅ Verify new symbols included in next batch

**Expected output**: All tests pass (green checkmarks)

---

## Full Batch Collection Test

Run this for comprehensive validation:

```bash
npm run test:batch
```

This test suite validates:

### Test 1-2: Setup
- Initialize database and provider
- Clean up existing test data

### Test 3: Batch Collection - Initial Symbols
- Adds test symbols (AAPL, MSFT, GOOGL)
- Sends batch request: `AAPL,MSFT,GOOGL`
- Verifies single API call returns data for all symbols

### Test 4: Store Batch Results
- Stores received data in database
- Verifies each symbol has bars stored

### Test 5: Add New Symbol
- Adds TSLA to stocks table
- Simulates API request for new symbol

### Test 6: Verify New Symbol in Next Batch
- Gets updated active symbols list
- Verifies TSLA is included
- Sends new batch request: `AAPL,MSFT,GOOGL,TSLA`
- **Confirms TSLA is automatically included in batch!**

### Test 7: Verify All Symbols Have Data
- Checks database for all symbols
- Ensures data stored correctly

### Test 8: Performance Comparison
- Shows efficiency improvement:
  - **Batch**: 2 API calls total
  - **Sequential (old)**: 8 API calls (4 symbols × 2 collections)
  - **Result**: ~4x more efficient!

---

## Run All Tests

```bash
npm run test:full
```

Runs both quick and comprehensive tests.

---

## Manual Testing Flow

### 1. Start the server
```bash
npm start
```

### 2. Check initial symbols
```bash
curl http://localhost:3001/symbols
```

### 3. Request a new symbol (triggers queue)
```bash
curl http://localhost:3001/api/stock/NVDA?interval=1d
```

Response: `202 Accepted` (symbol queued)

### 4. Wait 60 seconds for queue processor

The queue processor runs every minute and will:
- Pick up NVDA from queue
- Batch it with other queued symbols
- Send ONE API call for all queued symbols

### 5. Check stats
```bash
curl http://localhost:3001/stats
```

You'll see:
- `collectionQueue`: [] (empty after processing)
- `isCollecting`: false
- NVDA now in candles table

### 6. Request NVDA again
```bash
curl http://localhost:3001/api/stock/NVDA?interval=1d
```

Response: `200 OK` with full data (from cache)

### 7. Next cron run includes NVDA

When the next interval cron runs (e.g., 1d at 4 PM), it will:
- Query: `SELECT symbol FROM stocks WHERE is_active = TRUE`
- Result: `AAPL,MSFT,GOOGL,TSLA,NVDA,... (all symbols)`
- Send: ONE batch API call with all symbols
- **NVDA automatically included!**

---

## How Batch Collection Works

### Before (Sequential - OLD)
```javascript
for (const symbol of symbols) {
  fetchBars(symbol, interval);  // 1 API call per symbol
  delay(650ms);                 // Rate limit protection
}
```

**Problems:**
- 100 symbols = 100 API calls
- 100 symbols × 650ms = 65 seconds minimum
- Wastes rate limit (100 requests vs 1)

### After (Batch - NEW)
```javascript
const symbolList = symbols.join(',');  // "AAPL,MSFT,GOOGL,..."
fetchBars(symbolList, interval);        // 1 API call for ALL
```

**Benefits:**
- 100 symbols = 1 API call
- ~2 seconds total time
- Efficient rate limit usage
- **New symbols automatically included next batch!**

---

## Response Format

### Single Symbol (old format)
```javascript
fetchBars('AAPL', '1d') → { bars: [...], source: 'Alpaca' }
```

### Batch Format (new)
```javascript
fetchBars('AAPL,MSFT,GOOGL', '1d') → {
  bars: {
    'AAPL': [...],
    'MSFT': [...],
    'GOOGL': [...]
  },
  source: 'Alpaca'
}
```

---

## Adding New Symbols - Complete Flow

### 1. Client requests unknown symbol
```
GET /api/stock/NVDA?interval=1d
```

### 2. API checks database
```sql
SELECT * FROM stocks WHERE symbol = 'NVDA'
-- Result: 0 rows (symbol not found)
```

### 3. API queues symbol
```javascript
// Add to stocks table
INSERT INTO stocks (symbol, is_active) VALUES ('NVDA', TRUE)

// Add to collection queue
collectionQueue.add('NVDA')

// Return 202 Accepted
res.status(202).json({ message: 'Symbol queued, retry in 15s' })
```

### 4. Queue processor runs (every minute)
```javascript
// Get queued symbols
const symbols = Array.from(collectionQueue)  // ['NVDA', 'AMZN', ...]

// Batch request
const symbolList = symbols.join(',')  // 'NVDA,AMZN,...'
const result = fetchBars(symbolList, '1d')  // ONE API call

// Store all results
for (const [symbol, bars] of Object.entries(result.bars)) {
  storeBars(symbol, '1d', bars)
}

collectionQueue.clear()
```

### 5. Next cron cycle
```javascript
// Get all active symbols
const symbols = await getActiveSymbols()  
// Returns: [{symbol: 'AAPL'}, {symbol: 'MSFT'}, {symbol: 'NVDA'}, ...]

// NVDA now included automatically!
const symbolList = symbols.map(s => s.symbol).join(',')
fetchBars(symbolList, '1d')  // ONE batch with NVDA included
```

---

## Troubleshooting

### Test fails: "No data returned"
- Check Alpaca API key is valid
- Verify market hours (use daily data for testing)
- Check rate limits

### Test fails: "Symbol not in batch response"
- Provider may not support symbol
- Check symbol normalization (BRK-B → BRK.B)
- Verify symbol exists on Alpaca

### Server not using batch mode
- Check logs for "BATCH MODE" indicator
- Verify code changes saved
- Restart server: `npm start`

---

## Expected Log Output (Batch Mode)

```
🔄 Collecting 1d data for 150 symbols (BATCH MODE)...
  📅 Date range: 2023-01-01 to 2025-12-04 (912 days)
  📦 Batch request: AAPL,MSFT,GOOGL,TSLA,NVDA,AMZN,...
  ✓ AAPL: 250 new, 0 updated (Alpaca)
  ✓ MSFT: 250 new, 0 updated (Alpaca)
  ✓ GOOGL: 250 new, 0 updated (Alpaca)
  ...
  📊 Batch Summary: 150 success, 0 errors (1 API call)
```

vs Old sequential mode:
```
🔄 Collecting 1d data for 150 symbols...
  ✓ AAPL: 250 new, 0 updated (Alpaca)
  [wait 650ms]
  ✓ MSFT: 250 new, 0 updated (Alpaca)
  [wait 650ms]
  ... (continues for 98 seconds)
  Summary: 150 success, 0 errors
```

---

## CI/CD Integration

Add to your deployment pipeline:

```bash
# Before deployment
npm test || exit 1

# Optional: Full test suite
npm run test:full || exit 1
```

This ensures batch functionality works before going live.
