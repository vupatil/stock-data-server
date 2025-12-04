# Quick Start Guide 🚀

Follow these steps to get your stock data server running in 5 minutes.

## Step 1: Get Alpaca Credentials (FREE)

1. Go to https://alpaca.markets
2. Sign up for **Paper Trading** (completely free)
3. Go to Dashboard → API Keys
4. Generate new API key
5. Copy both `API Key` and `Secret Key`

## Step 2: Setup Environment

```bash
cd stock-data-server

# Create .env file
cp .env.example .env

# Edit .env and add your credentials:
# ALPACA_API_KEY=PKxxxxxxxxxxxxx
# ALPACA_API_SECRET=xxxxxxxxxxx
```

## Step 3: Install Dependencies

```bash
npm install
```

This installs:
- express (API server)
- mysql2 (database)
- axios (Alpaca API)
- node-cron (scheduling)
- cors, helmet (security)
- dotenv (config)

## Step 4: Setup Database

Make sure MySQL is running, then:

```bash
node setup.js
```

This creates:
- Database: `STOCKSENTIMENT`
- Tables: `stocks`, `candles`, `data_collection_log`
- Indexes for fast queries

## Step 5: Test Connection

```bash
node test-connection.js
```

Should output:
```
✅ Alpaca connection successful
✅ Retrieved test data for AAPL
```

## Step 6: Start Collector (Terminal 1)

```bash
node collector.js
```

You'll see:
```
╔═══════════════════════════════════════════════╗
║     📊 STOCK DATA COLLECTOR v2.0             ║
╚═══════════════════════════════════════════════╝

📊 Collector configured for 503 symbols
   Max candles per interval: 400
   Extended hours: Yes

🔄 Running initial gap fill...

📊 Checking 1d interval...
🔍 Gap detected for AAPL 1d:
   No data exists - initial fill
   Missing candles: ~400
   Fetching from Alpaca...
✅ Gap filled for AAPL 1d: 252 candles inserted
...
```

**This will take 5-10 minutes on first run** to fill all gaps for all symbols.

## Step 7: Start Server (Terminal 2)

Open a new terminal:

```bash
node server.js
```

You'll see:
```
╔═══════════════════════════════════════════════╗
║        📊 STOCK DATA API SERVER v2.0         ║
╚═══════════════════════════════════════════════╝

✅ Database connected
✅ Server running on port 3002

Endpoints:
   • GET /api/stock/:symbol?interval=1d&includePrePost=false
   • GET /bars?symbol=AAPL&range=1d&extended=false
   • GET /health
   • GET /symbols
   • GET /stats
```

## Step 8: Test API

Open browser or curl:

```bash
# Test health
curl http://localhost:3002/health

# Get AAPL daily data
curl http://localhost:3002/api/stock/AAPL?interval=1d

# Get AAPL 5-minute data with extended hours
curl http://localhost:3002/api/stock/AAPL?interval=5m&includePrePost=true

# Get all symbols
curl http://localhost:3002/symbols

# Get database stats
curl http://localhost:3002/stats
```

## Step 9: Update Your Client

Change your client code from:

```javascript
// OLD: Direct API call
const url = 'https://query1.finance.yahoo.com/v8/finance/chart/AAPL';
```

To:

```javascript
// NEW: Your cached server
const url = 'http://localhost:3002/api/stock/AAPL?interval=1d';
```

**That's it!** Your client will now use cached data with zero other changes needed.

## What Happens Next?

The collector runs continuously:

1. **Every 1 minute:** Collects 1-minute candles for all 500 stocks
2. **Every 2 minutes:** Collects 2-minute candles
3. **Every 5 minutes:** Collects 5-minute candles
4. ... and so on for all 11 intervals

The server responds to requests instantly from MySQL cache.

## Monitoring

Watch collector terminal for activity:

```
📥 [10:15:00] Collecting 1m bars...
✅ Collected 503 1m bars from 503 symbols

📥 [10:16:00] Collecting 1m bars...
✅ Collected 503 1m bars from 503 symbols

📥 [10:17:00] Collecting 1m bars...
✅ Collected 503 1m bars from 503 symbols
```

## Troubleshooting

### "❌ ALPACA_API_KEY not configured"

Edit `.env` and add your credentials.

### "❌ MySQL connection failed"

Make sure MySQL is running:

```bash
# Windows
net start mysql

# Mac/Linux
sudo systemctl start mysql
```

Check credentials in `.env`:
```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=yourpassword
```

### "No data being collected"

1. Check `COLLECTION_ENABLED=true` in `.env`
2. Wait 1-2 minutes for first cron job
3. Check Alpaca API is working: `node test-connection.js`

### "Data is empty"

On first run, it takes 5-10 minutes to fill historical data. Watch collector terminal for progress.

## Next Steps

1. **Production:** Use PM2 to keep processes running
2. **Scale:** Add more symbols to `STOCK_SYMBOLS` in `.env`
3. **Customize:** Adjust `MAX_CANDLES_PER_INTERVAL` for more/less history
4. **Monitor:** Check `/stats` endpoint for database status

## Production Setup (Optional)

```bash
npm install -g pm2

pm2 start collector.js --name stock-collector
pm2 start server.js --name stock-server

pm2 logs stock-collector  # View collector logs
pm2 logs stock-server     # View server logs

pm2 save                  # Save configuration
pm2 startup               # Auto-start on boot
```

## Support

If you run into issues:

1. Check logs in both terminals
2. Verify Alpaca API key is valid: `node test-connection.js`
3. Check MySQL is running and accessible
4. Ensure port 3002 is not in use: `netstat -an | findstr 3002`

---

**You're all set! 🎉**

Your stock data server is now running and collecting data from Alpaca's batch API. Enjoy rate-limit-free stock data!
