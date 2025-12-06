# Production Deployment Guide

## Complete Fresh Deployment Process

This guide walks through deploying the Stock Data Server from scratch on a production environment.

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

Test your Alpaca API credentials:

```bash
node test-connection.js
```

Expected output:
```
✅ Connected to Alpaca
✅ Successfully retrieved test data
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

Run the production deployment test:

```bash
# In a separate terminal (server must be running)
node test-production-deployment.js
```

This validates:
- Server health endpoint responding
- First API request triggers symbol addition
- Collection completes successfully
- Data served from database on retry
- All endpoints accessible

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
3. Check server logs for provider initialization errors
4. Test connection: `node test-connection.js`

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

```bash
# 1. Setup
git clone <repo>
cd stock-data-server
npm install
cp .env.example .env
# Edit .env with your credentials

# 2. Initialize database
node setup.js

# 3. Test connection
node test-connection.js

# 4. Start server
pm2 start app.js --name stock-data-server

# 5. Test API (will trigger collection)
curl "http://localhost:3001/api/stock/AAPL?interval=1d"
# Returns 503 - wait 15 seconds

# 6. Retry (should have data now)
curl "http://localhost:3001/api/stock/AAPL?interval=1d"
# Returns 200 with data

# 7. Check stats
curl "http://localhost:3001/stats"

# 8. View logs
pm2 logs stock-data-server
```

---

## ✅ Production Checklist

Before going live:

- [ ] MySQL database created and accessible
- [ ] Alpaca API credentials configured in `.env`
- [ ] `node setup.js` completed successfully
- [ ] `node test-connection.js` passes
- [ ] Server starts without errors
- [ ] Health endpoint returns `{"status":"ok"}`
- [ ] Test symbol request returns 503 then 200
- [ ] PM2 configured for auto-restart
- [ ] Nginx reverse proxy configured (if applicable)
- [ ] HTTPS/SSL certificates installed
- [ ] Firewall rules configured
- [ ] Backup cron job scheduled
- [ ] Monitoring alerts configured
- [ ] Log rotation configured

---

## 🎯 Next Steps After Deployment

1. **Monitor first few requests**: Watch logs to ensure collection works
2. **Pre-populate popular symbols** (optional): Request top symbols to warm cache
3. **Set up alerts**: Monitor health endpoint, database size, API errors
4. **Review rate limits**: Alpaca has rate limits - monitor usage
5. **Optimize as needed**: Add indexes, adjust cron schedules based on usage

---

## 📞 Support

- Check server logs: `pm2 logs stock-data-server`
- Review collection logs: `SELECT * FROM data_collection_log ORDER BY started_at DESC LIMIT 20`
- Test provider connection: `node test-connection.js`
- Verify database state: `node test-production-deployment.js`

---

**Last Updated**: December 2025
**Version**: 3.0
