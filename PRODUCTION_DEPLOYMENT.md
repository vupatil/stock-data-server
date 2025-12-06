# Production Deployment Guide

## Complete Fresh Deployment Process

This guide walks through deploying the Stock Data Server from scratch on a production environment.

---

## ⚡ Quick Start (TL;DR)

```bash
# 1. Install and configure
npm install
cp .env.example .env   # Edit with your DB and Alpaca credentials

# 2. Initialize
node verify.js         # Verify configuration
node setup.js          # Create database tables

# 3. Start server
node app.js            # Development
# OR
pm2 start app.js --name stock-data-server  # Production

# 4. Test (in separate terminal)
curl "http://localhost:3001/api/stock/AAPL?interval=1d"
# Wait 15-20 seconds, then retry

# 5. Verify
node verify-deployment.js
```

**Important**: First API request triggers automatic data collection for that symbol across all intervals (1m through 1mo). Subsequent requests are served from the database.

---

## ✅ Prerequisites

- Node.js 18+ installed
- MySQL 8.0+ running
- Alpaca API account with API keys
- Git (to clone repository)

---

## 📋 Step-by-Step Deployment

### 1. Clone and Install

```bash
git clone <repository-url>
cd stock-data-server
npm install
```

### 2. Configure Environment

Copy the example environment file and configure your settings:

```bash
cp .env.example .env
```

Edit `.env` and configure:

```env
# Database Configuration
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_secure_password
DB_NAME=STOCKSENTIMENT

# Alpaca API Credentials (REQUIRED)
ALPACA_API_KEY=your_alpaca_api_key
ALPACA_API_SECRET=your_alpaca_secret_key
ALPACA_BASE_URL=https://paper-api.alpaca.markets  # or https://api.alpaca.markets for live

# Server Configuration
PORT=3001
COLLECTION_ENABLED=true
EXTENDED_HOURS_COLLECTION=true

# Optional: Rate limiting, cleanup settings, etc.
MAX_CANDLES_PER_INTERVAL=600
DATA_STALE_MINUTES=1440
```

### 3. Initialize Database

Create the database and tables:

```bash
node setup.js
```

Expected output:
```
✅ Connected to MySQL
✅ Database 'STOCKSENTIMENT' ready
✅ All tables created
✅ Found 3 tables: candles, data_collection_log, stocks
📈 Sample stocks: 0 (empty)
✅ SETUP COMPLETE!
```

This creates:
- `stocks` table (empty - will be populated on-demand)
- `candles` table (empty - will be filled as symbols are requested)
- `data_collection_log` table (tracks collection jobs)

### 4. Verify Configuration

Test your environment setup and Alpaca API credentials:

```bash
node verify.js
```

Expected output:
```
╔═══════════════════════════════════════════════╗
║     🔍 SYSTEM VERIFICATION                    ║
╚═══════════════════════════════════════════════╝

📋 Checking environment variables...
   ✅ ALPACA_API_KEY: PK**********
   ✅ ALPACA_API_SECRET: ****
   ✅ DB_HOST: localhost
   ...

✅ All checks passed!
```

**Alternative**: Quick Alpaca connection test:
```bash
node test-connection.js
```

### 5. Start the Server

Start the combined API server + collector:

```bash
npm start
# or
node app.js
```

Expected output:
```
╔═══════════════════════════════════════════════╗
║   📊 STOCK DATA SERVER + COLLECTOR v3.0      ║
╚═══════════════════════════════════════════════╝

✅ MySQL connected
✅ Database connected
✅ Alpaca provider initialized
📊 Active providers: Alpaca

📅 Scheduling collection jobs...
[... cron schedules ...]

✅ Collector started with 3 modes:
   A) Cron schedules - automatic interval collection
   B) Manual triggers - POST /collect/:symbol
   C) Auto-detect - new symbols queued via API

✨ System ready!

✅ API server running on http://localhost:3001
   Health: http://localhost:3001/health
```

### 6. Verify Deployment

**Option A: Manual API Test**

In a separate terminal, test the API:

```bash
# Test health endpoint
curl http://localhost:3001/health

# Request a symbol (will trigger collection)
curl "http://localhost:3001/api/stock/AAPL?interval=1d"
# Expected: 503 with "retry-after: 15"

# Wait 15-20 seconds, then retry
curl "http://localhost:3001/api/stock/AAPL?interval=1d"
# Expected: 200 with data

# Check database state
node verify-deployment.js
```

**Option B: Automated Test Script**

```bash
# In a separate terminal (server must be running)
node test-production-deployment.js
```

This automated test validates:
- Server health endpoint responding
- First API request triggers symbol addition and collection
- Collection completes successfully for all 11 intervals
- Data served from database on subsequent requests
- All endpoints accessible (health, symbols, stats)
- Database contains expected data structure

**Expected Results** from automated test:
```
✅ Stocks Table: 1 symbol (AAPL)
✅ Candles by Interval:
   1m    :  1952 bars
   2m    :   979 bars
   5m    :  1622 bars
   15m   :   691 bars
   30m   :   357 bars
   1h    :   186 bars
   2h    :   106 bars
   4h    :    54 bars
   1d    :   627 bars
   1w    :   261 bars
   1mo   :    66 bars
   Total :  6901 bars
```

---

## ⏱️ What Happens During First Request

Understanding the flow helps troubleshoot issues:

### Initial State (After setup.js)
- **Database**: `STOCKSENTIMENT` created
- **Tables**: `stocks` (empty), `candles` (empty), `data_collection_log` (empty)
- **Server**: Running with all cron jobs scheduled
- **Cron jobs**: Active but idle (no symbols to collect)

### First API Request: `GET /api/stock/AAPL?interval=1d`

**Step 1: Database Check (< 1ms)**
- Query: `SELECT stock_id FROM stocks WHERE symbol = 'AAPL'`
- Result: Not found

**Step 2: Provider Validation (100-300ms)**
- Alpaca API call to verify AAPL exists
- Result: ✅ Valid symbol

**Step 3: Queue Symbol (< 10ms)**
- Insert into `stocks` table: `symbol='AAPL', is_active=TRUE`
- Add to in-memory collection queue
- Return response: `503 Service Unavailable` with `retry-after: 15`

**Step 4: Background Collection (10-30 seconds)**
- Collector processes queue immediately (doesn't wait for cron)
- Fetches data for ALL 11 intervals in sequence:
  1. 1m data (last ~5 days): 1,952 bars
  2. 2m data (last ~5 days): 979 bars
  3. 5m data (last ~30 days): 1,622 bars
  4. 15m data (last ~60 days): 691 bars
  5. 30m data (last ~60 days): 357 bars
  6. 1h data (last ~6 months): 186 bars
  7. 2h data (last ~6 months): 106 bars
  8. 4h data (last ~6 months): 54 bars
  9. 1d data (last ~2.5 years): 627 bars
  10. 1w data (last ~5 years): 261 bars
  11. 1mo data (last ~10 years): 66 bars
- Total: ~6,900 bars inserted into `candles` table
- Alpaca API calls: ~11 requests (one per interval)

**Step 5: Retry Request (< 50ms)**
- Query: `SELECT stock_id FROM stocks WHERE symbol = 'AAPL'`
- Result: Found (stock_id = 1)
- Query: `SELECT * FROM candles WHERE stock_id = 1 AND interval_type = '1d'`
- Result: 627 bars
- Return: `200 OK` with data in Yahoo Finance format

### Ongoing Maintenance

**Cron Jobs** (automatic after symbol is in database):
- Every minute: Check queue for pending symbols
- Every 5 minutes: Update 5m bars for AAPL (during market hours)
- Every 15 minutes: Update 15m bars
- Daily at 4 PM ET: Update daily bars
- Weekly on Friday: Update weekly bars
- Monthly: Update monthly bars

**Result**: Symbol stays fresh with minimal API usage, served from fast MySQL queries.

---

## 🔄 How It Works: On-Demand Data Population

Unlike traditional systems that require pre-populating symbols, this server uses **on-demand population**:

### First Request Flow

1. **User requests symbol**: `GET /api/stock/AAPL?interval=1d`
2. **Database check**: Symbol not found (empty database)
3. **Provider validation**: Verify AAPL exists with Alpaca
4. **Queue for collection**: Add AAPL to stocks table, mark as active
5. **Return 503**: "Symbol queued, retry in 15 seconds"
6. **Background collection**: Collector fetches all intervals for AAPL
7. **Store data**: Insert bars into candles table

### Subsequent Requests

1. **User requests same symbol**: `GET /api/stock/AAPL?interval=1d`
2. **Database check**: Symbol found, data exists
3. **Return 200**: Serve data directly from MySQL
4. **Cron maintains**: Automatic updates for all active symbols

### Advantages

- ✅ Zero setup time - no bulk import needed
- ✅ Only collect data for requested symbols
- ✅ Automatic maintenance for active symbols
- ✅ Easy to add new symbols (just request them)
- ✅ Natural rate limiting (user-driven population)

---

## 🕐 Automated Maintenance

Once a symbol is in the database, cron jobs automatically maintain it:

### Collection Schedules

- **1m, 2m, 5m**: Every N minutes during market hours
- **15m, 30m, 1h, 2h, 4h**: Periodically throughout the day
- **1d**: Daily at 4 PM ET (market close)
- **1w**: Weekly on Friday at 4 PM ET
- **1mo**: Monthly on last trading day

### Additional Jobs

- **Queue Processor**: Every minute (handles immediate requests)
- **Gap Filler**: Every 30 minutes (finds and fills missing data)
- **Cleanup**: Daily at 3 AM (maintains MAX_CANDLES_PER_INTERVAL limit)

---

## 📊 API Endpoints

### Get Stock Data

```bash
GET /api/stock/:symbol?interval=1d&includePrePost=false
```

**Parameters:**
- `symbol`: Stock ticker (e.g., AAPL, TSLA, BRK.B)
- `interval`: `1m`, `2m`, `5m`, `15m`, `30m`, `1h`, `2h`, `4h`, `1d`, `1w`, `1mo`
- `includePrePost`: `true` to include pre/post market hours (intraday only)

**Response Codes:**
- `200 OK`: Data available, returned from database
- `503 Service Unavailable`: Symbol queued for collection, retry after N seconds
- `404 Not Found`: Symbol not supported by any provider
- `400 Bad Request`: Invalid parameters

### Health Check

```bash
GET /health
```

Returns server status and configuration.

### List Symbols

```bash
GET /symbols
```

Returns all symbols in the database with their status.

### Database Stats

```bash
GET /stats
```

Returns statistics about symbols, intervals, and data coverage.

---

## 🚀 Production Recommendations

### 1. Use Process Manager (PM2)

```bash
npm install -g pm2

# Start server
pm2 start app.js --name stock-data-server

# View logs
pm2 logs stock-data-server

# Monitor
pm2 monit

# Auto-restart on system reboot
pm2 startup
pm2 save
```

### 2. Configure Reverse Proxy (Nginx)

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### 3. Enable HTTPS (Let's Encrypt)

```bash
sudo apt-get install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

### 4. Set Up Monitoring

- **Health checks**: Monitor `/health` endpoint
- **Database**: Watch table sizes, query performance
- **API metrics**: Track request rates, response times
- **Logs**: Rotate and archive PM2 logs

### 5. Backup Strategy

```bash
# Daily database backup
mysqldump -u root -p STOCKSENTIMENT > backup_$(date +%Y%m%d).sql

# Automated backup cron
0 2 * * * /usr/bin/mysqldump -u root -p[password] STOCKSENTIMENT > /backups/stock_$(date +\%Y\%m\%d).sql
```

---

## 🔧 Troubleshooting

### Issue: 404 "Symbol not found" on valid symbols

**Cause**: Provider validation failing

**Solution**:
1. Check Alpaca API credentials in `.env`
2. Verify Alpaca account is active
3. Check server logs for "✅ Alpaca provider initialized" message
4. Test connection: `node verify.js` or `node test-connection.js`
5. Verify symbol is valid on Alpaca (some symbols may not be available)
6. Check if using correct base URL (paper vs live trading)

### Issue: Server crashes on startup with "Unknown column 'requested_at'"

**Cause**: Database schema is outdated

**Solution**:
1. Drop and recreate tables: `node drop-and-setup.js`
2. Or manually: Drop all tables and run `node setup.js`
3. This creates tables with the latest schema including `requested_at` column

### Issue: 503 persists after retry period

**Cause**: Collection failed or still in progress

**Solution**:
1. Check server logs for collection errors
2. Verify Alpaca rate limits not exceeded
3. Check `data_collection_log` table for error details
4. Manually trigger collection: `POST /collect/:symbol`

### Issue: includePrePost=false returns no data

**Cause**: All bars are outside market hours (9:30-16:00 ET)

**Solution**:
- This is expected for pre-market or after-hours only data
- Use `includePrePost=true` to include extended hours
- Check data with: `SELECT * FROM candles WHERE stock_id=X LIMIT 10`

### Issue: Cron jobs not running

**Cause**: Timezone mismatch or collection disabled

**Solution**:
1. Verify `COLLECTION_ENABLED=true` in `.env`
2. Check timezone: Cron runs in `America/New_York`
3. Review cron logs in console output
4. Ensure symbols exist in database (cron only runs for active symbols)

---

## 📝 Example: Complete Fresh Deployment

### Development/Testing (Without PM2)

```bash
# 1. Clone and setup
git clone <repo>
cd stock-data-server
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env with your credentials (DB, Alpaca keys)

# 3. Verify configuration
node verify.js

# 4. Initialize database
node setup.js

# 5. Start server (Terminal 1)
node app.js
# Server starts on http://localhost:3001

# 6. Test deployment (Terminal 2)
node test-production-deployment.js
# Or manually:
curl "http://localhost:3001/api/stock/AAPL?interval=1d"
# Wait 15-20 seconds...
curl "http://localhost:3001/api/stock/AAPL?interval=1d"

# 7. Verify database state
node verify-deployment.js
```

### Production (With PM2)

```bash
# 1-4. Same as above (clone, install, configure, setup)

# 5. Start server with PM2
pm2 start app.js --name stock-data-server

# 6. Test API
curl "http://localhost:3001/api/stock/AAPL?interval=1d"
# Returns 503 with retry-after: 15

# 7. Wait and retry
sleep 20
curl "http://localhost:3001/api/stock/AAPL?interval=1d"
# Returns 200 with historical data

# 8. Check stats
curl "http://localhost:3001/stats"

# 9. View logs
pm2 logs stock-data-server

# 10. Configure auto-restart on reboot
pm2 startup
pm2 save
```

---

## ✅ Production Checklist

Before going live:

### Core Setup
- [ ] MySQL 8.0+ installed and running
- [ ] Database created and accessible
- [ ] Node.js 18+ installed
- [ ] Repository cloned and `npm install` completed
- [ ] `.env` file created from `.env.example`
- [ ] Alpaca API credentials configured in `.env`
- [ ] All database credentials configured in `.env`

### Initialization
- [ ] `node verify.js` passes all checks
- [ ] `node setup.js` completed successfully (creates empty tables)
- [ ] Server starts without errors (`node app.js`)
- [ ] Health endpoint returns `{"status":"ok"}` at `/health`
- [ ] Provider initialization shows "✅ Alpaca provider initialized"

### Testing
- [ ] Test symbol request returns 503 (queued status)
- [ ] After 15-20 seconds, retry returns 200 with data
- [ ] `node verify-deployment.js` shows data in all intervals
- [ ] Stats endpoint returns proper counts at `/stats`
- [ ] Symbols endpoint lists active symbols at `/symbols`

### Production
- [ ] PM2 installed globally (`npm install -g pm2`)
- [ ] Server started with PM2 (`pm2 start app.js`)
- [ ] PM2 configured for auto-restart on reboot (`pm2 startup` + `pm2 save`)
- [ ] Nginx reverse proxy configured (if applicable)
- [ ] HTTPS/SSL certificates installed (if using SSL)
- [ ] Firewall rules configured (open port 3001 or proxy port)
- [ ] Database backup cron job scheduled
- [ ] Monitoring alerts configured (health endpoint, disk space, etc.)
- [ ] Log rotation configured (PM2 or system-level)

### Optional but Recommended
- [ ] Pre-populated popular symbols (SPY, QQQ, AAPL, TSLA, etc.)
- [ ] Tested with production Alpaca account (not paper trading)
- [ ] Rate limit monitoring set up
- [ ] Error tracking/logging service integrated

---

## 🎯 Next Steps After Deployment

### Immediate (First Hour)
1. **Monitor first few requests**: Watch logs to ensure collection works correctly
   ```bash
   pm2 logs stock-data-server --lines 100
   ```

2. **Verify data quality**: Check that bars are being collected
   ```bash
   node verify-deployment.js
   ```

3. **Test error handling**: Try requesting invalid symbols, check 404 responses work

### Short-term (First Day)
1. **Pre-populate popular symbols** (optional but recommended):
   ```bash
   # Request top symbols to warm the cache
   curl "http://localhost:3001/api/stock/SPY?interval=1d"
   curl "http://localhost:3001/api/stock/QQQ?interval=1d"
   curl "http://localhost:3001/api/stock/AAPL?interval=1d"
   curl "http://localhost:3001/api/stock/TSLA?interval=1d"
   curl "http://localhost:3001/api/stock/MSFT?interval=1d"
   # Wait 15-20 seconds between each batch of 5 symbols
   ```

2. **Set up monitoring**:
   - Health endpoint monitoring (every 1-5 minutes)
   - Database size monitoring
   - Disk space alerts
   - PM2 monitoring: `pm2 monitor`

3. **Configure alerts**:
   - Server down alerts
   - Database connection failures
   - Alpaca API errors (check logs for rate limiting)

### Long-term (Ongoing)
1. **Review Alpaca usage**: Monitor API request counts in server logs
   - Look for "📦 Alpaca requests: X/100 in last minute"
   - Alpaca free tier: 200 requests/minute

2. **Optimize performance**:
   - Monitor query response times
   - Check database indexes are being used
   - Adjust `MAX_CANDLES_PER_INTERVAL` if needed

3. **Regular maintenance**:
   - Weekly database backups
   - Monitor log file sizes
   - Review collection logs for failures
   - Check for stale symbols (not updated recently)

4. **Scale as needed**:
   - Add read replicas if traffic increases
   - Implement caching layer (Redis) for frequently accessed symbols
   - Consider rate limiting at API level for production use

---

## 📞 Troubleshooting & Support

### Useful Commands

**Check Server Status:**
```bash
pm2 status                           # If using PM2
pm2 logs stock-data-server          # View real-time logs
node verify.js                       # Verify configuration
```

**Database Verification:**
```bash
node verify-deployment.js            # Check database state and data
node setup.js                        # Re-initialize database (non-destructive)
node drop-and-setup.js               # Drop and recreate all tables (destructive!)
```

**Testing:**
```bash
node test-production-deployment.js   # Full deployment flow test
node test-connection.js              # Quick Alpaca connection test
curl http://localhost:3001/health    # Health check
curl http://localhost:3001/stats     # Database statistics
```

**Database Queries:**
```sql
-- Check active symbols
SELECT * FROM stocks WHERE is_active = TRUE;

-- Review recent collection jobs
SELECT * FROM data_collection_log ORDER BY started_at DESC LIMIT 20;

-- Count bars by interval
SELECT interval_type, COUNT(*) as count FROM candles GROUP BY interval_type;

-- Check latest data for a symbol
SELECT c.*, s.symbol 
FROM candles c 
JOIN stocks s ON c.stock_id = s.stock_id 
WHERE s.symbol = 'AAPL' AND c.interval_type = '1d' 
ORDER BY c.ts DESC LIMIT 5;
```

---

## ⚠️ Common Pitfalls

### 1. Testing Too Quickly
**Problem**: Requesting the same symbol immediately after 503 without waiting

**Symptom**: Still get 503 or empty data

**Solution**: Wait the full retry-after period (15-20 seconds) for first collection

### 2. Using Old Schema
**Problem**: Database tables created before `requested_at` column was added

**Symptom**: Server crashes with "Unknown column 'requested_at'" error

**Solution**: Run `node drop-and-setup.js` to recreate tables with latest schema

### 3. Wrong Alpaca Base URL
**Problem**: Using paper trading URL with live trading keys or vice versa

**Symptom**: Authentication fails or unexpected behavior

**Solution**: Match your `.env` ALPACA_BASE_URL to your account type:
- Paper trading: `https://paper-api.alpaca.markets`
- Live trading: `https://api.alpaca.markets`

### 4. Market Hours Confusion
**Problem**: Expecting intraday data outside market hours

**Symptom**: No bars returned with `includePrePost=false`

**Solution**: Use `includePrePost=true` for extended hours, or request during market hours (9:30 AM - 4 PM ET)

### 5. MySQL Not Running
**Problem**: Database connection fails on startup

**Symptom**: "ECONNREFUSED" or "Cannot connect to MySQL"

**Solution**: Start MySQL service before starting the server
```bash
# Windows
net start MySQL80

# Linux
sudo systemctl start mysql

# macOS
brew services start mysql
```

### 6. Port Already in Use
**Problem**: Another process using port 3001

**Symptom**: "EADDRINUSE" error

**Solution**: Change PORT in `.env` or stop the other process

### 7. No Environment Variables
**Problem**: Running without `.env` file or missing required variables

**Symptom**: Server starts but fails on API requests

**Solution**: Always run `node verify.js` first to check configuration

---

## 📊 Expected Performance Metrics

### API Response Times
- **200 OK** (cached data): 10-50ms
- **503** (queuing): < 10ms
- **404** (invalid symbol): 100-300ms (includes validation)

### Collection Times (per symbol)
- **Single interval**: 100-500ms
- **All 11 intervals**: 10-30 seconds (first collection)
- **Subsequent updates**: 100-500ms per interval

### Database Size
- **Per symbol**: ~7,000 bars across all intervals
- **100 symbols**: ~700,000 rows (~200-300 MB)
- **500 symbols**: ~3.5M rows (~1-1.5 GB)

### Alpaca API Usage
- **First symbol**: ~11 API calls (one per interval)
- **Daily maintenance**: ~1 call per symbol per day
- **Intraday updates**: Varies by market hours and interval

---

**Last Updated**: December 2025
**Version**: 3.0
