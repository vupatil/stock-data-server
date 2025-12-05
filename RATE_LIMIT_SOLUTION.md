# Rate Limit Solution

## Problem
HTTP 429 errors from Alpaca API indicating rate limit exceeded.

**Alpaca Free Tier Limits:**
- 200 requests per minute
- 15-minute delayed data
- No extended hours on IEX feed

## Solution Implemented

### 1. **Strict Rate Limiting in AlpacaProvider** ✅
- Hard limit: **100 requests/minute** (50% of API limit for safety)
- Tracks all requests with timestamps
- **STOPS all requests** when limit reached
- Waits for full minute to reset before resuming
- Logs progress every 10 requests
- Applies to both `fetchBars()` and `validateSymbol()`

### 2. **Automatic Retry on 429** ✅
- Detects HTTP 429 responses
- Waits 60 seconds before retry
- Resets rate limit counter
- Logs wait time: `⏳ Rate limited, waiting 60 seconds...`

### 3. **Collector Throttling** ✅
- Added 650ms delay between symbol requests
- Effective rate: ~92 requests/minute (well under 100 limit)
- Pauses for 60 seconds if rate limited during collection
- Log message: `⏸️  Pausing collection for 60 seconds due to rate limit...`

## How It Works

```javascript
// Before each Alpaca API call:
await this.waitForRateLimit();

// Tracks request count in real-time:
this.requestTimestamps.push(now);

// If limit reached (100 requests):
if (this.requestTimestamps.length >= 100) {
  console.log(`🛑 RATE LIMIT REACHED: 100/100 requests`);
  console.log(`⏳ Waiting for rate limit reset...`);
  await new Promise(resolve => setTimeout(resolve, 60000));
  this.requestTimestamps = []; // Clear and resume
}
```

## Expected Behavior

### Normal Operation:
```
📊 Alpaca requests: 10/100 in last minute
📊 Alpaca requests: 20/100 in last minute
...
📊 Alpaca requests: 90/100 in last minute
```

### When Limit Reached:
```
📊 Alpaca requests: 100/100 in last minute
🛑 RATE LIMIT REACHED: 100/100 requests
⏳ Waiting 61 seconds for rate limit reset...
✅ Rate limit reset, resuming requests
```

### If 429 Still Occurs:
```
⏳ Rate limited, waiting 60 seconds...
✓ Provider: 394 bars (after retry)
```

## Monitoring

Watch for these log messages:
- `📊 Alpaca requests: X/100` - Current count (every 10 requests)
- `🛑 RATE LIMIT REACHED` - Limit hit, pausing all requests
- `⏳ Waiting N seconds for rate limit reset...` - Countdown
- `✅ Rate limit reset, resuming requests` - Back to normal
- `⏸️  Pausing collection for 60 seconds...` - Collector paused

## Alternative Solutions

### If still experiencing issues:

1. **Reduce concurrent collections**
   - Adjust cron schedules to avoid overlap
   - Currently all intervals run simultaneously

2. **Batch requests** (Future Enhancement)
   - Alpaca supports multiple symbols per request
   - Example: `symbols=AAPL,MSFT,GOOGL` (up to 100)
   - Would reduce requests by ~100x

3. **Upgrade to Alpaca Unlimited**
   - No rate limits
   - Real-time data
   - SIP feed access
   - Extended hours data

4. **Add Schwab provider**
   - Failover when Alpaca rate limited
   - Requires OAuth setup (see SCHWAB_SETUP.md)

## Testing

Restart server to apply changes:
```bash
# Stop server
Ctrl+C

# Start server
node app.js
```

Monitor logs for rate limit handling:
```bash
# Should see automatic throttling
📊 Request: AAPL 2m
  ✓ MySQL: 394 bars

# If cache miss:
📊 Request: BRO 2m  
  ✗ MySQL: No data available
  🔍 Trying Alpaca...
  ⏳ Rate limited, waiting 60 seconds...
  ✓ Provider: 394 bars
```

## Configuration

To adjust rate limiting behavior, edit `AlpacaProvider.js`:

```javascript
// Line 14: Hard request limit per minute
this.maxRequestsPerMinute = 100; // Default: 100 (adjust 50-150 for safety)

// Line 106: Retry wait time on 429
await new Promise(resolve => setTimeout(resolve, 60000)); // 60 seconds

// app.js Line 750: Collector delay between symbols  
await new Promise(resolve => setTimeout(resolve, 650)); // 650ms (~92 req/min)
```

**Recommended settings based on needs:**
- **Ultra-safe**: 50 req/min (1200ms delay)
- **Conservative**: 100 req/min (650ms delay) ← **Current**
- **Moderate**: 150 req/min (400ms delay)
- **Aggressive**: 180 req/min (350ms delay)

## Status

✅ **Strict rate limiting active**
- Hard limit: 100 req/min
- Complete stop when limit reached
- 60-second reset wait
- Real-time request counting
- Collector pacing: 650ms between requests
