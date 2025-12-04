# Stock Data Server

**Real-time stock market data server with Alpaca integration and MySQL caching.**

Solves the rate limiting problem by fetching **all 500 symbols in one batch request** and caching in MySQL for ultra-fast responses.

---

## ✨ Features

- 🚀 **One Request for All Symbols** - Batch API calls to Alpaca
- ⚡ **Ultra-Fast Responses** - 50-200ms from MySQL cache
- 📊 **Multiple Timeframes** - 1m, 2m, 5m, 15m, 30m, 1h, 2h, 4h, 1d, 1w, 1mo
- 🔄 **Smart Gap Filling** - Automatically backfills missing data
- 🗄️ **MySQL Storage** - Persistent caching with configurable retention
- ⏰ **Extended Hours** - Optional pre-market and after-hours data
- 🆓 **100% Free** - Uses Alpaca Paper Trading account

---

## 📋 Architecture

**Two-Program Design:**

1. **Collector** (`collector.js`) - Fetches data from Alpaca every minute, stores in MySQL
2. **Server** (`server.js`) - Serves API requests from MySQL cache, falls back to Alpaca

```
Client → API Server → MySQL Cache → Response (fast!)
                  ↓
            Alpaca API (fallback)

Data Collector → Alpaca API → MySQL (background)
```

---

## 🚀 Quick Start

### 1. Prerequisites

- Node.js 18+
- MySQL 8.0+
- Alpaca Paper Trading account (FREE)

### 2. Install

```powershell
cd stock-data-server
npm install
```

### 3. Configure

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Edit `.env` and add your credentials:

```env
# Alpaca API (Get from: https://app.alpaca.markets/paper/dashboard/overview)
ALPACA_API_KEY=your_key_here
ALPACA_API_SECRET=your_secret_here

# MySQL
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=stock_data_db

# Stocks to track
STOCK_SYMBOLS=AAPL,TSLA,MSFT,GOOGL,AMZN,META,NVDA,AMD,NFLX,INTC
```

### 4. Setup Database

```powershell
npm run setup
```

### 5. Test Connection

```powershell
npm run test
```

### 6. Start Services

**Terminal 1 - Data Collector:**
```powershell
npm run collector
```

**Terminal 2 - API Server:**
```powershell
npm start
```

---

## 📡 API Endpoints

### Get Stock Data

```
GET /bars?symbol=AAPL&range=1d
GET /bars?symbol=AAPL&range=1d&extended=true
```

**Parameters:**
- `symbol` (required) - Stock symbol (e.g., AAPL, TSLA)
- `range` (optional) - Time range (1d, 5d, 1mo, 3mo, 6mo, 1y, 2y, 5y, max)
- `extended` (optional) - Include extended hours data (true/false, default: false)

**Response:**
```json
{
  "chart": {
    "result": [{
      "meta": {
        "symbol": "AAPL",
        "currency": "USD",
        "regularMarketPrice": 189.50,
        "companyName": "Apple Inc."
      },
      "timestamp": [1733252460, 1733252520, ...],
      "indicators": {
        "quote": [{
          "open": [189.00, 189.10, ...],
          "high": [189.50, 189.60, ...],
          "low": [188.90, 189.00, ...],
          "close": [189.25, 189.50, ...],
          "volume": [1234567, 2345678, ...]
        }]
      }
    }]
  },
  "_meta": {
    "source": "mysql",
    "companyName": "Apple Inc.",
    "requestedInterval": "1m",
    "appliedRange": "1d"
  }
}
```

### Health Check

```
GET /health
```

### List Symbols

```
GET /symbols
```

### Statistics

```
GET /stats
```

---

## 🔧 Configuration

### Stock Symbols

Add your 500 symbols in `.env`:

```env
STOCK_SYMBOLS=AAPL,TSLA,MSFT,GOOGL,AMZN,META,NVDA,AMD,NFLX,INTC,...
```

Or load from file (modify `collector.js`):

```javascript
const symbols = require('./symbols.json');
```

### Data Retention

Configure in `.env`:

```env
RETENTION_1M=10      # 10 days
RETENTION_5M=60      # 60 days
RETENTION_15M=90     # 90 days
RETENTION_1H=180     # 180 days
RETENTION_1D=730     # 2 years
RETENTION_1W=3650    # 10 years
```

---

## 🚀 Production Deployment

### Using PM2 (Recommended)

```powershell
# Install PM2
npm install -g pm2

# Start both services
pm2 start collector.js --name "stock-collector"
pm2 start server.js --name "stock-api"

# Save configuration
pm2 save

# Auto-restart on system reboot
pm2 startup

# View status
pm2 status

# View logs
pm2 logs
```

### Using Docker

```dockerfile
# Coming soon
```

---

## 📊 Database Schema

**Tables:**
- `stocks` - Symbol master list
- `candles` - OHLCV data (all intervals)
- `data_collection_log` - Collection monitoring

**Views:**
- `latest_candles` - Recent data
- `data_coverage` - Coverage summary
- `collection_stats` - Performance metrics

---

## 🔍 Monitoring

### View Collection Logs

```sql
SELECT * FROM data_collection_log 
ORDER BY started_at DESC 
LIMIT 20;
```

### Check Data Coverage

```sql
SELECT * FROM data_coverage 
WHERE interval_type = '1m' 
ORDER BY minutes_old;
```

### Collection Statistics

```sql
SELECT * FROM collection_stats;
```

---

## 🐛 Troubleshooting

### Collector not starting

- Check Alpaca credentials in `.env`
- Run `npm run test` to verify connection
- Check MySQL is running

### No data returned from API

- Verify collector is running (`npm run collector`)
- Check database has data: `SELECT COUNT(*) FROM candles`
- Review logs: `SELECT * FROM data_collection_log`

### Data is stale

- Collector may be stopped - restart it
- Check `DATA_STALE_MINUTES` setting in `.env`
- API will automatically fall back to Alpaca if data too old

---

## 📝 License

MIT

---

## 🙏 Acknowledgments

- [Alpaca Markets](https://alpaca.markets) - Free market data API
- Built for handling 500+ symbols with rate limit constraints
