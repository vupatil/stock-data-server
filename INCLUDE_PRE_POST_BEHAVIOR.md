# includePrePost Parameter - Complete Behavior Guide

## Overview
The `includePrePost` query parameter controls whether pre-market (4:00-9:30 AM ET) and after-hours (4:00-8:00 PM ET) trading data is included in API responses. This parameter **only affects intraday intervals** (minute/hour-based data).

---

## API Request Format

```
GET /api/stock/:symbol?interval=5m&includePrePost=true
```

---

## Parameter Parsing

**Location in Code:** `app.js` line 493
```javascript
const includePrePost = req.query.includePrePost === 'true';
```

### Parsing Behavior:

| Request URL | Parsed Value | Result |
|-------------|--------------|--------|
| `?interval=5m&includePrePost=true` | `true` | ✅ Extended hours included |
| `?interval=5m&includePrePost=false` | `false` | ❌ Regular hours only (9:30-16:00 ET) |
| `?interval=5m&includePrePost=` | `false` | ❌ Empty string !== 'true' |
| `?interval=5m` (parameter missing) | `false` | ❌ Default to regular hours |
| `?interval=5m&includePrePost=True` | `false` | ❌ Capital T !== 'true' (case-sensitive!) |
| `?interval=5m&includePrePost=1` | `false` | ❌ Number !== 'true' |

**⚠️ IMPORTANT:** The check is **strict string equality** (`=== 'true'`). Only the lowercase string `"true"` will enable extended hours. Any other value (false, empty, missing, "True", "1", etc.) defaults to regular hours only.

---

## Interval Classification

### Intraday Intervals (affected by includePrePost):
```javascript
['1m', '2m', '3m', '5m', '6m', '10m', '12m', '15m', '20m', '30m', '45m', 
 '1h', '2h', '3h', '4h', '6h', '8h', '12h']
```
**Behavior:** Filter applied based on `includePrePost` parameter.

### Daily/Weekly/Monthly Intervals (NOT affected):
```javascript
['1d', '2d', '3d', '4d', '5d', '1w', '2w', '3w', '1mo', '2mo', '3mo', '4mo', '6mo', '12mo']
```
**Behavior:** Always return all data regardless of `includePrePost`. No time-of-day filtering.

---

## Filtering Logic

**Location in Code:** `app.js` lines 337-346

```javascript
const intradayIntervals = ['1m', '2m', '3m', '5m', '6m', '10m', '12m', '15m', '20m', '30m', '45m', '1h', '2h', '3h', '4h', '6h', '8h', '12h'];

if (!includeExtended && intradayIntervals.includes(interval)) {
  // Apply market hours filter: 9:30 AM - 4:00 PM ET
  query += ` AND (
    TIME(CONVERT_TZ(FROM_UNIXTIME(ts), '+00:00', 'America/New_York')) >= '09:30:00' AND 
    TIME(CONVERT_TZ(FROM_UNIXTIME(ts), '+00:00', 'America/New_York')) <= '16:00:00'
  )`;
}
```

### Decision Tree:

```
Is interval intraday (minute/hour-based)?
├─ NO (daily/weekly/monthly) → Return ALL data (no filtering)
└─ YES (intraday)
   └─ Is includePrePost === 'true'?
      ├─ YES → Return ALL data (4:00 AM - 8:00 PM ET)
      └─ NO → Return ONLY regular hours (9:30 AM - 4:00 PM ET)
```

---

## Scenario Matrix

### Scenario 1: Live Market Hours (9:30 AM - 4:00 PM ET, Monday-Friday)

| Request | includePrePost | Data Returned | Notes |
|---------|----------------|---------------|-------|
| `?interval=5m&includePrePost=true` | `true` | Pre-market (4:00-9:30) + Regular (9:30-16:00) + After-hours (16:00-20:00) | All available data |
| `?interval=5m&includePrePost=false` | `false` | Regular hours only (9:30-16:00) | Most recent bars within market hours |
| `?interval=5m` | `false` | Regular hours only (9:30-16:00) | Default behavior |
| `?interval=1d&includePrePost=true` | `true` | All daily bars | Daily data unaffected |
| `?interval=1d&includePrePost=false` | `false` | All daily bars | Daily data unaffected |

**During live market:** Data is actively being collected every 1m, 2m, 5m, 15m, 30m, 1h, 2h, 4h by the cron scheduler.

---

### Scenario 2: After Hours (4:00 PM - 8:00 PM ET, Monday-Friday)

| Request | includePrePost | Data Returned | Notes |
|---------|----------------|---------------|-------|
| `?interval=5m&includePrePost=true` | `true` | Regular hours (9:30-16:00) + After-hours (16:00-now) | Includes current after-hours activity |
| `?interval=5m&includePrePost=false` | `false` | Regular hours only (9:30-16:00) | Last bar at 4:00 PM |
| `?interval=5m` | `false` | Regular hours only (9:30-16:00) | Stops at market close |

**After hours:** Cron collections are **SKIPPED** (line 750: `if (intradayIntervals.includes(intervalName) && !isMarketHours())`). No new data collected until next market open.

---

### Scenario 3: Pre-Market (4:00 AM - 9:30 AM ET, Monday-Friday)

| Request | includePrePost | Data Returned | Notes |
|---------|----------------|---------------|-------|
| `?interval=5m&includePrePost=true` | `true` | Previous day regular (9:30-16:00) + Previous after-hours (16:00-20:00) + Current pre-market (4:00-now) | Full extended hours history |
| `?interval=5m&includePrePost=false` | `false` | Previous day regular hours only (9:30-16:00) | No pre-market data |
| `?interval=5m` | `false` | Previous day regular hours only (9:30-16:00) | Default excludes pre-market |

**Pre-market:** Cron collections are **SKIPPED**. No new data collected until 9:30 AM.

---

### Scenario 4: Weekend (Saturday-Sunday)

| Request | includePrePost | Data Returned | Notes |
|---------|----------------|---------------|-------|
| `?interval=5m&includePrePost=true` | `true` | Friday's regular + after-hours | All available from last trading day |
| `?interval=5m&includePrePost=false` | `false` | Friday's regular hours only | Stops at Friday 4:00 PM |
| `?interval=5m` | `false` | Friday's regular hours only | Default weekend behavior |

**Weekend:** No cron collections run (`isMarketHours()` returns false for weekends).

---

## Time Range Behavior

**Location:** `app.js` lines 242-268 (`getTimeRangeForInterval`)

### Regular Behavior:
- **Daily/Weekly/Monthly intervals:** Always use current timestamp as end time
- **Intraday intervals (live market):** Use current timestamp

### Market Closed Adjustment:
When market is closed AND interval is intraday:
```javascript
if (intradayIntervals.includes(intervalParam) && !isMarketHours()) {
  // Adjust end time to last market close (4:00 PM ET)
  // If before 4 PM today, use previous trading day's close
}
```

**Example:** On Saturday at 10:00 AM:
- Request: `?interval=5m`
- End time adjusted to: Friday 4:00 PM ET
- Data returned: Friday's regular hours (9:30 AM - 4:00 PM)

---

## Data Storage

### Collection Source:
All data is collected from **Alpaca API** which provides:
- Pre-market: 4:00 AM - 9:30 AM ET
- Regular hours: 9:30 AM - 4:00 PM ET  
- After-hours: 4:00 PM - 8:00 PM ET

### Database Storage:
**ALL bars are stored** in the `candles` table with their original timestamps, regardless of whether they're extended hours or regular hours. The filtering happens at **query time**, not storage time.

**Table:** `candles`
- Stores: `ts` (Unix timestamp), `open`, `high`, `low`, `close`, `volume`
- No separate flag for "extended hours" - determined by time of day

---

## SQL Filtering

### With includePrePost=true (no filter):
```sql
SELECT ts, open, high, low, close, volume 
FROM candles 
WHERE stock_id = ? AND interval_type = '5m' AND ts >= ? AND ts <= ?
ORDER BY ts ASC
```
Returns: All bars in time range

### With includePrePost=false (market hours filter):
```sql
SELECT ts, open, high, low, close, volume 
FROM candles 
WHERE stock_id = ? AND interval_type = '5m' AND ts >= ? AND ts <= ?
AND (
  TIME(CONVERT_TZ(FROM_UNIXTIME(ts), '+00:00', 'America/New_York')) >= '09:30:00' AND 
  TIME(CONVERT_TZ(FROM_UNIXTIME(ts), '+00:00', 'America/New_York')) <= '16:00:00'
)
ORDER BY ts ASC
```
Returns: Only bars between 9:30 AM and 4:00 PM ET

---

## Market Hours Detection

**Function:** `isMarketHours()` (lines 272-282)

```javascript
function isMarketHours() {
  const now = new Date();
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = et.getDay();  // 0 = Sunday, 6 = Saturday
  const hour = et.getHours();
  const minute = et.getMinutes();
  
  if (day === 0 || day === 6) return false; // Weekend
  const time = hour * 60 + minute;  // Convert to minutes since midnight
  return time >= (9 * 60 + 30) && time <= (16 * 60); // 9:30 AM - 4:00 PM
}
```

**Returns:**
- `true`: Monday-Friday, 9:30 AM - 4:00 PM ET
- `false`: Weekends, before 9:30 AM, after 4:00 PM

**Used for:**
1. Skipping cron collections when market is closed
2. Adjusting time range end time for intraday intervals when market is closed

---

## Common Use Cases

### Use Case 1: Regular Trading Hours Chart (Most Common)
**Request:** `GET /api/stock/AAPL?interval=5m`
- **Result:** Only 9:30 AM - 4:00 PM ET data
- **Bars returned:** ~78 bars (6.5 hours × 12 bars/hour)
- **Use case:** Standard trading charts for most users

### Use Case 2: Extended Hours Chart (Active Traders)
**Request:** `GET /api/stock/AAPL?interval=5m&includePrePost=true`
- **Result:** 4:00 AM - 8:00 PM ET data
- **Bars returned:** ~192 bars (16 hours × 12 bars/hour)
- **Use case:** Active traders monitoring pre-market and after-hours

### Use Case 3: Daily Chart (Always Full Data)
**Request:** `GET /api/stock/AAPL?interval=1d`
- **Result:** All daily bars regardless of `includePrePost`
- **Bars returned:** Historical daily candles
- **Use case:** Long-term analysis, daily/weekly/monthly charts

### Use Case 4: After-Hours Check
**Request at 5:00 PM ET:** `GET /api/stock/AAPL?interval=5m&includePrePost=true`
- **Result:** Today's regular hours (9:30-16:00) + after-hours (16:00-17:00)
- **Latest bar:** 5:00 PM bar showing after-hours price action
- **Use case:** Monitoring earnings announcements, after-hours news

---

## Edge Cases

### Edge Case 1: Case Sensitivity
```
?includePrePost=True   → false (capital T)
?includePrePost=TRUE   → false (all caps)
?includePrePost=true   → true (correct!)
```

### Edge Case 2: Empty Value
```
?includePrePost=       → false (empty string)
?includePrePost        → false (no value)
```

### Edge Case 3: Numeric Values
```
?includePrePost=1      → false (number, not string)
?includePrePost=0      → false (number, not string)
```

### Edge Case 4: Multiple Parameters
```
?interval=5m&includePrePost=false&includePrePost=true
→ Uses LAST value (true)
```

---

## Response Shape

### With Data Available:
```json
{
  "chart": {
    "result": [{
      "meta": {
        "symbol": "AAPL",
        "regularMarketPrice": 181.45,
        "chartPreviousClose": 180.50,
        "currency": "USD",
        "exchangeName": "NASDAQ",
        "instrumentType": "EQUITY",
        "dataGranularity": "5m"
      },
      "timestamp": [1733432400, 1733432700, ...],
      "indicators": {
        "quote": [{
          "open": [181.00, 181.10, ...],
          "high": [181.20, 181.30, ...],
          "low": [180.95, 181.05, ...],
          "close": [181.10, 181.25, ...],
          "volume": [12500, 15800, ...]
        }]
      }
    }]
  }
}
```

Number of bars depends on:
- `includePrePost` setting
- Time range for the interval
- Whether extended hours data exists in database

---

## Troubleshooting

### Problem: "No data available in cache"
**Cause:** Query returned 0 bars after filtering
**Solutions:**
1. Try with `includePrePost=true` if requesting intraday data outside market hours
2. Check if data exists in database for that symbol/interval
3. Check time range is valid

### Problem: Getting extended hours when I don't want them
**Cause:** `includePrePost=true` is set
**Solution:** Either set `includePrePost=false` or omit the parameter entirely

### Problem: Not getting extended hours when I want them
**Cause:** 
1. `includePrePost` is not exactly the string `"true"` (case-sensitive)
2. Interval is daily/weekly/monthly (extended hours concept doesn't apply)
**Solution:** Use `includePrePost=true` (lowercase) with intraday intervals

### Problem: Data seems stale during after-hours
**Cause:** Cron collections are paused when market is closed
**Expected:** Data stops at 4:00 PM until next market open at 9:30 AM

---

## Summary

| Aspect | Behavior |
|--------|----------|
| **Default** | Regular hours only (9:30-16:00 ET) |
| **To enable extended hours** | Must use `includePrePost=true` (exact string, lowercase) |
| **Affects** | Intraday intervals only (1m-12h) |
| **Does NOT affect** | Daily/weekly/monthly intervals |
| **During market hours** | Active collection, real-time data |
| **After hours** | No new collections, serve cached data |
| **Weekend** | No collections, serve Friday's data |
| **Data storage** | All hours stored, filtering at query time |
| **SQL filter** | Time-of-day check in America/New_York timezone |
