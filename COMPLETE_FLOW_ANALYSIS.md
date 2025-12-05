# COMPLETE FLOW: When Client Requests AAPL 5m Data

## 📋 Current Database State (As of 12:41 PM ET, Dec 5, 2025)

**AAPL Stock Record:**
- stock_id: 1804
- symbol: 'AAPL'
- Total 5m bars in database: **1,645 bars**

**5m Data Status:**
- ❌ **VERY STALE** - Latest bars from January 21, 1970 (timestamp issue!)
- Age: ~55 years (29,386,524 minutes)
- Problem: Timestamps stored as Unix seconds but read as Unix milliseconds

---

## 🔄 STEP-BY-STEP FLOW: Client Requests `GET /api/stock/AAPL?interval=5m`

### **Step 1: API Receives Request**
```
Client → GET http://localhost:3001/api/stock/AAPL?interval=5m
```

### **Step 2: Symbol Normalization**
```javascript
const symbol = normalizeSymbol('AAPL'); // → 'AAPL' (hyphens become dots if any)
```

### **Step 3: Check Database for AAPL**
```sql
SELECT stock_id, symbol FROM stocks WHERE symbol = 'AAPL'
```
**Result:** ✅ Found - stock_id: 1804

### **Step 4: Check for Existing 5m Data**
```sql
SELECT * FROM candles 
WHERE stock_id = 1804 
  AND interval_type = '5m' 
ORDER BY ts DESC 
LIMIT 1
```
**Result:** ✅ Found - But timestamps corrupted (Jan 21, 1970)

### **Step 5: Data Freshness Check**
```javascript
const latestTimestamp = candles[0].ts;
const ageMinutes = (Date.now() - latestTimestamp) / 60000;
const DATA_STALE_MINUTES = 24 * 60; // 1440 minutes (24 hours)

if (ageMinutes > DATA_STALE_MINUTES) {
  // Data is STALE!
}
```
**Result:** ❌ Age: 29,386,524 minutes (way over 1440 limit) → **STALE**

### **Step 6: Add to Collection Queue**
```javascript
collectionQueue.set('AAPL:5m', { 
  symbol: 'AAPL', 
  interval: '5m', 
  addedAt: Date.now() 
});

// Update stocks table
UPDATE stocks SET requested_at = NOW() WHERE symbol = 'AAPL'
```
**Result:** ✅ Queued for immediate collection

### **Step 7: Return 503 Response**
```javascript
return res.status(503)
  .set('Retry-After', '15')
  .json({
    error: 'Data being refreshed',
    message: 'Data for AAPL is being updated. Please retry in 10-30 seconds.',
    retryAfter: 15,
    status: 'refreshing'
  });
```
**Result:** 🔴 **HTTP 503 Service Unavailable** (with Retry-After: 15 header)

---

## ⚙️ BACKGROUND: Collection Process (Happens Automatically)

### **Triggered By:**
1. **Cron Schedule (Primary):** Every 5 minutes at :00:15
   ```
   12:00:15 PM, 12:05:15 PM, 12:10:15 PM, etc.
   ```

2. **Cron Schedule (Retry):** Every 5 minutes at :01:15  
   ```
   12:01:15 PM, 12:06:15 PM, 12:11:15 PM, etc.
   ```

3. **Queue Processor:** Every minute (checks `collectionQueue`)
   ```
   12:41:00 PM, 12:42:00 PM, 12:43:00 PM, etc.
   ```

### **Collection Steps:**

#### **A. Lock Check** (Per-Interval)
```javascript
if (intervalLocks.get('5m')) {
  console.log('⏭️ 5m collection already in progress, skipping');
  return;
}
intervalLocks.set('5m', true); // Lock this interval
```

#### **B. Get All Active Symbols**
```sql
SELECT symbol FROM stocks WHERE is_active = 1
```
**Result:** 592 active symbols (including AAPL)

#### **C. Fetch Data from Alpaca (Batch Request)**
```javascript
// Build comma-separated symbol list
const symbols = 'AAPL,MSFT,GOOGL,AMZN,...' // (all 592)

// Single API call for all symbols
const response = await providerManager.getBars({
  symbols: symbols,
  timeframe: '5Min',
  start: startDate,
  end: endDate,
  limit: 10000,
  feed: 'iex'  // Real-time IEX feed
});
```

**Alpaca Response Example:**
```json
{
  "bars": {
    "AAPL": [
      {
        "t": "2025-12-05T12:35:00Z",  // 12:35 PM bar (completed)
        "o": 245.12,
        "h": 245.34,
        "l": 245.05,
        "c": 245.28,
        "v": 125430,
        "vw": 245.21
      },
      {
        "t": "2025-12-05T12:40:00Z",  // 12:40 PM bar (completed)
        "o": 245.28,
        "h": 245.45,
        "l": 245.20,
        "c": 245.42,
        "v": 98765,
        "vw": 245.33
      }
    ]
  }
}
```

#### **D. Database Upsert** (Prevents Duplicates)
```sql
INSERT INTO candles (
  stock_id, interval_type, ts, 
  open, high, low, close, volume, 
  vwap, trade_count, data_source
) VALUES (
  1804, '5m', '2025-12-05 12:40:00',
  245.28, 245.45, 245.20, 245.42, 98765,
  245.33, NULL, 'Alpaca'
)
ON DUPLICATE KEY UPDATE
  open = VALUES(open),
  high = VALUES(high),
  low = VALUES(low),
  close = VALUES(close),
  volume = VALUES(volume),
  vwap = VALUES(vwap),
  data_source = VALUES(data_source),
  updated_at = NOW()
```
**Result:** ✅ 628 bars inserted/updated (for all 592 symbols)

#### **E. Unlock Interval**
```javascript
intervalLocks.set('5m', false); // Release lock
```

#### **F. Update Tracking**
```javascript
recentlyCollected.set('AAPL:5m', Date.now());
```

---

## 🔁 CLIENT RETRY FLOW: Second Request (15-30 seconds later)

### **Client Retries:**
```
Client → GET http://localhost:3001/api/stock/AAPL?interval=5m (again)
```

### **Step 1-4:** Same as before (check database)

### **Step 5: Freshness Check (NOW PASSES!)**
```javascript
const latestTimestamp = candles[0].ts; // 2025-12-05 12:40:00
const ageMinutes = (Date.now() - latestTimestamp) / 60000; // ~2 minutes

if (ageMinutes <= DATA_STALE_MINUTES) {
  // Data is FRESH! ✅
}
```

### **Step 6: Return Data (HTTP 200)**
```javascript
return res.status(200).json({
  chart: {
    result: [{
      meta: {
        symbol: 'AAPL',
        dataGranularity: '5m',
        currency: 'USD',
        exchangeName: 'NASDAQ'
      },
      timestamp: [1733416500, 1733416800, ...], // Unix timestamps
      indicators: {
        quote: [{
          open: [245.12, 245.28, ...],
          high: [245.34, 245.45, ...],
          low: [245.05, 245.20, ...],
          close: [245.28, 245.42, ...],
          volume: [125430, 98765, ...]
        }]
      }
    }],
    error: null
  }
});
```
**Result:** ✅ **HTTP 200 OK** with complete chart data

---

## ✅ VERIFICATION: Is This Working As Expected?

### **Database Issues Detected:**

1. **❌ CRITICAL: Timestamp Corruption**
   - Latest 5m bars show Jan 21, 1970 (Unix epoch)
   - Age: 29,386,524 minutes (~55 years!)
   - **Expected:** Recent timestamps (within last 10 minutes)
   - **Cause:** Likely storing Unix seconds but reading as milliseconds, or vice versa

2. **⚠️ Data Not Updating**
   - Despite cron schedules running, database shows very old data
   - This could be why API always returns 503

### **Collection System Status:**

✅ **FIXED: Per-Interval Locks**
- Each interval (1m, 5m, 15m, etc.) can collect concurrently
- No more global lock blocking everything

✅ **FIXED: Dual Collection Strategy**
- Primary: Fires 15 seconds after bar close (:00:15)
- Retry: Fires 1 minute later (:01:15) as safety net
- Ensures we never miss data even if provider slow

✅ **FIXED: HTTP Status Codes**
- 503 (Service Unavailable) for data refresh
- Retry-After: 15 header tells client when to retry
- Proper REST compliance

### **Expected Behavior:**

**Timeline for 5m collection at 12:00 PM:**
```
12:00:00 PM - 5m bar (11:55-12:00) closes
12:00:15 PM - PRIMARY collection fires
              → Fetches latest bars from Alpaca
              → Upserts into database
              → Takes ~3 seconds for 592 symbols
12:00:18 PM - Collection complete
              → recentlyCollected['AAPL:5m'] = now

12:00:20 PM - Client requests AAPL 5m
              → Checks database
              → Latest bar: 12:00 PM (20 seconds old)
              → ✅ FRESH! Returns HTTP 200 with data

12:01:15 PM - RETRY collection fires
              → Checks for missed bars
              → Alpaca returns same 12:00 PM bar
              → Database upsert: ON DUPLICATE KEY (no-op)
              → Ensures no gaps even if primary missed
```

---

## 🐛 CURRENT PROBLEM: Why We Keep Getting 503

### **Root Cause:**
The database check shows AAPL 5m data is from **January 1970**, which is impossibly old. This means:

1. Either **collections aren't running** (locks were blocking until recently fixed)
2. Or **collections are failing silently** (need to check logs)
3. Or **timestamp storage is broken** (conversion issue)

### **To Verify Collections Are Actually Running:**

```bash
# Check collection logs
node check-logs.js

# Check if data is updating RIGHT NOW
node check-aapl-5m.js
# Wait 5 minutes...
node check-aapl-5m.js
# Compare timestamps - should be different!
```

### **To Fix Timestamp Issue:**

The database shows bars at "01/21, 05:15 AM" which suggests:
- Unix timestamp might be 327900 (seconds since epoch)
- JavaScript reading as 327900 milliseconds → Jan 21, 1970

**Potential Fix:** Check `collectInterval()` function - ensure timestamps converted to milliseconds before storage.

---

## 📝 SUMMARY

**Current Flow (What SHOULD Happen):**
1. Client requests AAPL 5m → API checks database
2. Data stale → Return 503 + queue collection
3. Collection runs → Fetches from Alpaca → Stores in DB
4. Client retries 15s later → API checks database
5. Data fresh → Return 200 + chart data ✅

**Current Flow (What IS Happening):**
1. Client requests AAPL 5m → API checks database
2. Data shows 1970 (impossibly old) → Return 503 + queue
3. Collection attempts but something fails/incomplete
4. Client retries → Still sees 1970 data → Return 503 again ❌
5. Loop continues indefinitely 🔁

**Next Steps:**
1. ✅ Per-interval locks implemented
2. ✅ Dual collection (15s + 1m retry) implemented
3. ⏳ Verify collections actually running and storing data
4. ⏳ Fix timestamp storage/retrieval issue
5. ⏳ Monitor logs for collection errors
