# Pre-Launch Checklist ✅

Use this checklist before running the system for the first time.

## 1. Prerequisites

- [ ] Node.js 16+ installed
- [ ] MySQL 8.0+ installed and running
- [ ] Alpaca Paper Trading account created (https://alpaca.markets)
- [ ] Git (optional, for version control)

## 2. Project Setup

- [ ] Downloaded/cloned stock-data-server project
- [ ] Opened terminal in project directory
- [ ] Ran `npm install` (installs all dependencies)

## 3. Configuration

- [ ] Copied `.env.example` to `.env`
- [ ] Added Alpaca API Key to `.env`
- [ ] Added Alpaca API Secret to `.env`
- [ ] Set MySQL credentials in `.env` (host, user, password)
- [ ] Set MySQL database name (default: STOCKSENTIMENT)
- [ ] Reviewed stock symbols list (default: 500+ S&P stocks)
- [ ] Set `COLLECTION_ENABLED=true`
- [ ] Set `MAX_CANDLES_PER_INTERVAL=400`
- [ ] Set `EXTENDED_HOURS_COLLECTION=true` or `false`

## 4. Database Setup

- [ ] MySQL service is running
- [ ] Ran `node verify.js` to check configuration
- [ ] Ran `node setup.js` to create database and tables
- [ ] Confirmed success message: "✅ Database setup complete"

## 5. API Connection Test

- [ ] Ran `node test-connection.js`
- [ ] Confirmed: "✅ Alpaca connection successful"
- [ ] Confirmed: "✅ Retrieved test data for AAPL"

## 6. First Run

- [ ] Opened Terminal 1 and ran `node collector.js`
- [ ] Waited for initial gap fill (5-10 minutes)
- [ ] Confirmed logs show: "🔍 Checking 1d interval..."
- [ ] Confirmed logs show: "✅ Gap filled for [symbol] [interval]"
- [ ] Confirmed scheduler started: "✅ All schedulers configured"
- [ ] **Left Terminal 1 running** (don't close!)

## 7. Server Start

- [ ] Opened Terminal 2 and ran `node server.js`
- [ ] Confirmed: "✅ Database connected"
- [ ] Confirmed: "✅ Server running on port 3002"
- [ ] Confirmed endpoints listed
- [ ] **Left Terminal 2 running** (don't close!)

## 8. API Testing

- [ ] Tested health: `curl http://localhost:3002/health`
- [ ] Response: `{"status":"ok",...}`
- [ ] Tested symbols: `curl http://localhost:3002/symbols`
- [ ] Response: Array of symbols
- [ ] Tested stock data: `curl http://localhost:3002/api/stock/AAPL?interval=1d`
- [ ] Response: Chart data with timestamps and prices
- [ ] Tested extended hours: `curl http://localhost:3002/api/stock/AAPL?interval=1d&includePrePost=true`
- [ ] Response: Includes pre/post market data

## 9. Monitoring

- [ ] Terminal 1 shows periodic collection logs
- [ ] Terminal 2 shows API request logs (if any)
- [ ] No error messages appearing
- [ ] Database growing (check with `curl http://localhost:3002/stats`)

## 10. Client Integration

- [ ] Updated client API endpoint to `http://localhost:3002/api/stock/:symbol`
- [ ] Tested client application
- [ ] Verified data appears correctly
- [ ] Confirmed faster load times (cached data)

## 11. Production Readiness (Optional)

- [ ] Installed PM2: `npm install -g pm2`
- [ ] Started collector with PM2: `pm2 start collector.js --name stock-collector`
- [ ] Started server with PM2: `pm2 start server.js --name stock-server`
- [ ] Saved PM2 config: `pm2 save`
- [ ] Enabled auto-start: `pm2 startup`
- [ ] Tested reboot (processes auto-restart)

## 12. Security Checks

- [ ] `.env` file is gitignored (contains secrets)
- [ ] Changed default MySQL password
- [ ] Set `ALLOWED_ORIGINS` for CORS (production URLs only)
- [ ] Using HTTPS in production (if applicable)
- [ ] Firewall configured (port 3002 accessible to clients)

## 13. Backup & Recovery

- [ ] MySQL backup configured (daily dumps)
- [ ] `.env` file backed up securely
- [ ] Documented recovery procedure
- [ ] Tested database restore from backup

## Troubleshooting Steps

If something doesn't work:

### Collector not collecting data
1. Check `COLLECTION_ENABLED=true` in `.env`
2. Verify Alpaca credentials: `node test-connection.js`
3. Wait 1-2 minutes for first cron job
4. Check Terminal 1 for error messages

### Server returns empty data
1. Wait 5-10 minutes for initial gap fill
2. Check Terminal 1 shows: "✅ Gap filled..."
3. Query stats: `curl http://localhost:3002/stats`
4. Verify database has data: MySQL query `SELECT COUNT(*) FROM candles;`

### MySQL connection failed
1. Ensure MySQL service is running
2. Verify credentials in `.env`
3. Test connection manually: `mysql -u root -p`
4. Create database if missing: `CREATE DATABASE STOCKSENTIMENT;`

### Port 3002 already in use
1. Find process: `netstat -ano | findstr :3002` (Windows)
2. Kill process: `taskkill /F /PID [pid]`
3. Or change port in `.env`: `PORT=3003`

## Quick Commands Reference

```bash
# Verification
node verify.js

# Setup
node setup.js

# Testing
node test-connection.js

# Running
node collector.js    # Terminal 1
node server.js       # Terminal 2

# Testing API
curl http://localhost:3002/health
curl http://localhost:3002/api/stock/AAPL?interval=1d

# Production (PM2)
pm2 start collector.js --name stock-collector
pm2 start server.js --name stock-server
pm2 logs
pm2 status
pm2 restart all
pm2 save
```

## Success Indicators

You'll know it's working when:

✅ Collector logs show regular collection activity
✅ API returns data with `"cached": true` in response
✅ Database size increases over time
✅ Stats endpoint shows growing record counts
✅ Client applications load faster
✅ No rate limiting errors

## Next Steps After Launch

1. Monitor for 24 hours to ensure stability
2. Check disk space (database will grow)
3. Review logs for any errors
4. Test gap filling (simulate laptop sleep)
5. Test cleanup (wait 24 hours or trigger manually)
6. Scale to more symbols if needed
7. Adjust `MAX_CANDLES_PER_INTERVAL` based on needs

---

**Once all boxes are checked, your system is live! 🚀**
