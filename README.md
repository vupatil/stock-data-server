# Stock Data Server 📊

A high-performance stock data caching server that solves rate limiting problems by aggregating data from Alpaca's batch API into MySQL.

## 🎯 What Problem Does This Solve?

**Problem:** Fetching 500 stocks every minute hits rate limits (200 requests/minute typical for free APIs).

**Solution:** Alpaca's batch API allows fetching **ALL 500 stocks in ONE request**. This server:
1. Collects data using Alpaca's batch endpoint (no rate limit issues)
2. Stores in MySQL with 11 time intervals
3. Serves cached data instantly to your clients
4. Zero client code changes needed

## 🌟 Key Features

- **11 Time Intervals:** 1m, 2m, 5m, 15m, 30m, 1h, 2h, 4h, 1d, 1w, 1mo
- **Direct Fetch:** Each interval fetched directly from Alpaca (no aggregation)
- **Gap Detection:** Automatically detects and fills missing data
- **Auto Cleanup:** Keeps last 400 candles per symbol per interval
- **Extended Hours:** Optional pre/post-market data collection
- **Smart Scheduling:** Cron jobs fetch when candles complete
- **Client Compatible:** Drop-in replacement for existing endpoints

## 🚀 Quick Start

### Prerequisites

- Node.js 16+
- MySQL 8.0+
- Alpaca Paper Trading account (FREE): https://alpaca.markets

### Installation

```bash
cd stock-data-server
npm install
```

### Configuration

Create `.env` file from `.env.example`:

```bash
cp .env.example .env
# Edit .env and add your Alpaca credentials
```

### Database Setup

```bash
node setup.js
```

### Start the System

**Terminal 1 - Data Collector:**
```bash
node collector.js
```

**Terminal 2 - API Server:**
```bash
node server.js
```

## 📡 API Endpoints

### Primary Endpoint (Client Compatible)

```http
GET /api/stock/:symbol?interval=1d&includePrePost=false
```

**Example:**
```bash
curl "http://localhost:3002/api/stock/AAPL?interval=1d&includePrePost=true"
```

**Parameters:**
- `symbol`: Stock symbol (AAPL, TSLA, etc.)
- `interval`: `1m`, `2m`, `5m`, `15m`, `30m`, `1h`, `2h`, `4h`, `1d`, `1w`, `1mo`
- `includePrePost`: Include extended hours (default: `false`)

### Other Endpoints

```http
GET /bars?symbol=AAPL&range=1d&extended=false
GET /health
GET /symbols
GET /stats
```

## ⏰ Collection Schedule

| Interval | Cron Schedule        | Description                |
|----------|---------------------|----------------------------|
| 1m       | `* * * * *`         | Every minute               |
| 2m       | `*/2 * * * *`       | Every 2 minutes            |
| 5m       | `*/5 * * * *`       | Every 5 minutes            |
| 15m      | `*/15 * * * *`      | Every 15 minutes           |
| 30m      | `*/30 * * * *`      | Every 30 minutes           |
| 1h       | `0 * * * *`         | Every hour                 |
| 2h       | `0 */2 * * *`       | Every 2 hours              |
| 4h       | `0 */4 * * *`       | Every 4 hours              |
| 1d       | `0 16 * * 1-5`      | 4 PM ET weekdays           |
| 1w       | `0 16 * * 5`        | 4 PM ET Fridays            |
| 1mo      | `0 16 28-31 * *`    | 4 PM ET last day of month  |
| Cleanup  | `0 3 * * *`         | 3 AM daily                 |

## 🔍 Gap Detection

The system automatically detects and fills gaps when:
- Laptop wakes from sleep
- Network interruptions
- Service restarts
- Initial setup

Gap filling runs in priority order: `1d → 1w → 1mo → 4h → 2h → 1h → 30m → 15m → 5m → 2m → 1m`

## 🧹 Data Cleanup

Keeps only the last **400 candles** per symbol per interval:
- 1m interval: ~6.6 hours
- 5m interval: ~33 hours
- 1h interval: ~16 days
- 1d interval: ~1.1 years
- 1w interval: ~7.7 years

## 📊 Database Schema

- **stocks** - Symbol master list
- **candles** - OHLCV data for all intervals (unique per stock_id + interval + timestamp)
- **data_collection_log** - Collection monitoring

## 🎛️ Configuration

Key environment variables:

```env
# Alpaca API
ALPACA_API_KEY=your_key
ALPACA_API_SECRET=your_secret

# MySQL
DB_HOST=localhost
DB_NAME=STOCKSENTIMENT

# Collection
COLLECTION_ENABLED=true
MAX_CANDLES_PER_INTERVAL=400
EXTENDED_HOURS_COLLECTION=true
GAP_FILL_PRIORITY=1d,1w,1mo,4h,2h,1h,30m,15m,5m,2m,1m
```

## 🔧 Troubleshooting

### No data being collected

```bash
node test-connection.js  # Test Alpaca API
node setup.js            # Reset database
```

Check `COLLECTION_ENABLED=true` in `.env`

### Data is stale

Server falls back to Alpaca if MySQL data older than 5 minutes.

### Extended hours not showing

Use `?includePrePost=true` AND set `EXTENDED_HOURS_COLLECTION=true`

## 📈 Performance

- **Rate Limit:** None (batch API)
- **Response Time:** <50ms (MySQL) vs 500-1000ms (API)
- **Database Size:** ~2GB for 500 stocks
- **Memory:** ~100MB (server), ~150MB (collector)

## 🚀 Production Deployment

```bash
npm install -g pm2
pm2 start collector.js --name stock-collector
pm2 start server.js --name stock-server
pm2 save
pm2 startup
```

## 📝 License

MIT License - Free to use and modify

## 🔗 Resources

- [Alpaca API Documentation](https://alpaca.markets/docs/api-references/market-data-api/)
- [MySQL Documentation](https://dev.mysql.com/doc/)

---

**Built with ❤️ to solve real rate limiting problems**
