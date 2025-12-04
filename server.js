/**
 * STOCK DATA API SERVER
 * 
 * Serves real-time stock data from MySQL cache with Alpaca fallback
 * Provides standardized OHLCV data in consistent JSON format
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const axios = require('axios');
const { initDB, getDB, closeDB } = require('./config/database');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// ===== MIDDLEWARE =====

app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

app.use(cors({
  origin: true, // Accept all origins
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Rate limiting disabled
// const limiter = rateLimit({
//   windowMs: 15 * 60 * 1000,
//   max: 10000,
//   message: 'Too many requests, please try again later.'
// });
// app.use(limiter);

// ===== CONFIGURATION =====

const DATA_STALE_MINUTES = 24 * 60; // 24 hours - allow data to be up to 1 day old

const ALPACA_CONFIG = {
  baseURL: process.env.ALPACA_BASE_URL || 'https://data.alpaca.markets',
  headers: {
    'APCA-API-KEY-ID': process.env.ALPACA_API_KEY,
    'APCA-API-SECRET-KEY': process.env.ALPACA_API_SECRET
  }
};

// ===== HELPER FUNCTIONS =====

function normalizeInterval(intervalParam) {
  // Direct interval support (1m, 5m, etc.) or legacy range-based (1d, 5d, etc.)
  const validIntervals = ['1m', '2m', '5m', '15m', '30m', '1h', '2h', '4h', '1d', '1w', '1mo'];
  
  // If it's already a valid interval, return it
  if (validIntervals.includes(intervalParam)) {
    return intervalParam;
  }
  
  // Otherwise map from legacy range format
  const intervalMap = {
    '1d': '1m',   // 1 day of data → 1-minute candles
    '5d': '5m',   // 5 days → 5-minute candles
    '1mo': '15m', // 1 month → 15-minute candles
    '3mo': '1h',  // 3 months → hourly candles
    '6mo': '1h',  // 6 months → hourly candles
    '1y': '1d',   // 1 year → daily candles
    '2y': '1d',   // 2 years → daily candles
    '5y': '1w',   // 5 years → weekly candles
    'max': '1w'   // Maximum → weekly candles
  };
  return intervalMap[intervalParam] || '1d';
}

function getTimeRangeForInterval(intervalParam) {
  const now = Math.floor(Date.now() / 1000);
  
  // For direct intervals (1m, 5m, etc.), return appropriate lookback
  const intervalLookback = {
    '1m': now - (24 * 60 * 60),        // 1 day
    '2m': now - (24 * 60 * 60),        // 1 day
    '5m': now - (5 * 24 * 60 * 60),    // 5 days
    '15m': now - (30 * 24 * 60 * 60),  // 30 days
    '30m': now - (30 * 24 * 60 * 60),  // 30 days
    '1h': now - (90 * 24 * 60 * 60),   // 90 days
    '2h': now - (90 * 24 * 60 * 60),   // 90 days
    '4h': now - (180 * 24 * 60 * 60),  // 180 days
    '1d': now - (365 * 24 * 60 * 60),  // 1 year
    '1w': now - (1825 * 24 * 60 * 60), // 5 years
    '1mo': now - (1825 * 24 * 60 * 60) // 5 years
  };
  
  if (intervalLookback[intervalParam]) {
    return { start: intervalLookback[intervalParam], end: now };
  }
  
  // Legacy range-based lookback
  const rangeMap = {
    '1d': now - (24 * 60 * 60),
    '5d': now - (5 * 24 * 60 * 60),
    '1mo': now - (30 * 24 * 60 * 60),
    '3mo': now - (90 * 24 * 60 * 60),
    '6mo': now - (180 * 24 * 60 * 60),
    '1y': now - (365 * 24 * 60 * 60),
    '2y': now - (730 * 24 * 60 * 60),
    '5y': now - (1825 * 24 * 60 * 60),
    'max': now - (3650 * 24 * 60 * 60)
  };
  return { start: rangeMap[intervalParam] || rangeMap['1y'], end: now };
}

// ===== DATABASE FUNCTIONS =====

async function fetchFromMySQL(symbol, intervalParam, includeExtended = false) {
  const db = getDB();
  const interval = normalizeInterval(intervalParam);
  const { start, end } = getTimeRangeForInterval(intervalParam);
  
  try {
    // Check if symbol exists (active or inactive)
    const [allRows] = await db.query(
      'SELECT stock_id, company_name, exchange, is_active FROM stocks WHERE symbol = ?',
      [symbol]
    );
    
    if (allRows.length === 0) {
      throw new Error(`Symbol ${symbol} not found in database`);
    }
    
    // If symbol is inactive, it means we've determined it's not supported
    if (!allRows[0].is_active) {
      throw new Error(`Symbol ${symbol} is inactive (not supported by data provider)`);
    }
    
    const stock = allRows[0];
    
    // Get candles with optional extended hours filter
    let query = `
      SELECT ts, open, high, low, close, volume 
      FROM candles 
      WHERE stock_id = ? AND interval_type = ? AND ts >= ? AND ts <= ?
    `;
    
    const params = [stock.stock_id, interval, start, end];
    
    // Filter to regular market hours (9:30 AM - 4:00 PM ET) if extended=false
    if (!includeExtended && ['1m', '2m', '5m', '15m', '30m', '1h', '2h', '4h'].includes(interval)) {
      query += ` AND (
        TIME(CONVERT_TZ(FROM_UNIXTIME(ts), '+00:00', 'America/New_York')) >= '09:30:00' AND 
        TIME(CONVERT_TZ(FROM_UNIXTIME(ts), '+00:00', 'America/New_York')) <= '16:00:00'
      )`;
    }
    
    query += ` ORDER BY ts ASC`;
    
    const [candles] = await db.query(query, params);
    
    if (candles.length === 0) {
      throw new Error(`No data found for ${symbol} with interval ${interval}`);
    }
    
    // Check if data is stale
    const latestTs = candles[candles.length - 1].ts;
    const ageMinutes = (Math.floor(Date.now() / 1000) - latestTs) / 60;
    
    if (ageMinutes > DATA_STALE_MINUTES) {
      throw new Error(`Data is stale (${Math.floor(ageMinutes)} minutes old)`);
    }
    
    // Get latest price for meta
    const [latestCandle] = await db.query(
      `SELECT close FROM candles 
       WHERE stock_id = ? AND interval_type = '1m' 
       ORDER BY ts DESC LIMIT 1`,
      [stock.stock_id]
    );
    
    // Format response structure
    const timestamps = candles.map(c => c.ts);
    const opens = candles.map(c => parseFloat(c.open));
    const highs = candles.map(c => parseFloat(c.high));
    const lows = candles.map(c => parseFloat(c.low));
    const closes = candles.map(c => parseFloat(c.close));
    const volumes = candles.map(c => parseInt(c.volume));
    
    return {
      chart: {
        result: [{
          meta: {
            symbol: symbol,
            currency: 'USD',
            exchangeName: stock.exchange || 'NASDAQ',
            instrumentType: 'EQUITY',
            regularMarketPrice: latestCandle.length > 0 ? parseFloat(latestCandle[0].close) : closes[closes.length - 1],
            companyName: stock.company_name || symbol
          },
          timestamp: timestamps,
          indicators: {
            quote: [{
              open: opens,
              high: highs,
              low: lows,
              close: closes,
              volume: volumes
            }]
          }
        }],
        error: null
      },
      _meta: {
        source: 'mysql',
        companyName: stock.company_name || symbol,
        requestedInterval: interval,
        appliedRange: intervalParam,
        dataAge: `${Math.floor(ageMinutes)} minutes`
      }
    };
  } catch (error) {
    throw error;
  }
}

async function fetchFromAlpaca(symbol, intervalParam, includeExtended = false) {
  const interval = normalizeInterval(intervalParam);
  const { start, end } = getTimeRangeForInterval(intervalParam);
  
  // Map interval to Alpaca timeframe
  const timeframeMap = {
    '1m': '1Min',
    '2m': '2Min',
    '5m': '5Min',
    '15m': '15Min',
    '30m': '30Min',
    '1h': '1Hour',
    '2h': '2Hour',
    '4h': '4Hour',
    '1d': '1Day',
    '1w': '1Week',
    '1mo': '1Month'
  };
  
  try {
    const params = {
      symbols: symbol,
      timeframe: timeframeMap[interval] || '1Day',
      start: new Date(start * 1000).toISOString(),
      end: new Date(end * 1000).toISOString(),
      limit: 10000,
      adjustment: 'split',
      feed: 'iex'
    };
    
    // Only include extended hours for intraday intervals
    if (['1m', '2m', '5m', '15m', '30m', '1h', '2h', '4h'].includes(interval)) {
      params.feed = includeExtended ? 'sip' : 'iex';  // SIP includes extended hours
    }
    
    const response = await axios.get('/v2/stocks/bars', {
      baseURL: ALPACA_CONFIG.baseURL,
      headers: ALPACA_CONFIG.headers,
      params,
      timeout: 10000
    });
    
    const bars = response.data.bars?.[symbol];
    
    if (!bars || bars.length === 0) {
      throw new Error('No data returned from Alpaca');
    }
    
    // Format response structure
    const timestamps = bars.map(b => Math.floor(new Date(b.t).getTime() / 1000));
    const opens = bars.map(b => parseFloat(b.o));
    const highs = bars.map(b => parseFloat(b.h));
    const lows = bars.map(b => parseFloat(b.l));
    const closes = bars.map(b => parseFloat(b.c));
    const volumes = bars.map(b => parseInt(b.v));
    
    return {
      chart: {
        result: [{
          meta: {
            symbol: symbol,
            currency: 'USD',
            exchangeName: 'NASDAQ',
            instrumentType: 'EQUITY',
            regularMarketPrice: closes[closes.length - 1],
            companyName: symbol
          },
          timestamp: timestamps,
          indicators: {
            quote: [{
              open: opens,
              high: highs,
              low: lows,
              close: closes,
              volume: volumes
            }]
          }
        }],
        error: null
      },
      _meta: {
        source: 'alpaca',
        companyName: symbol,
        requestedInterval: interval,
        appliedRange: intervalParam
      }
    };
  } catch (error) {
    console.log(`  ⚠️  Alpaca error: ${error.message}`);
    throw error;
  }
}

// ===== SYMBOL VALIDATION & AUTO-ADD =====

async function validateAndAddSymbol(symbol) {
  const db = getDB();
  
  try {
    // Check if symbol exists in database
    const [existing] = await db.query(
      'SELECT stock_id, is_active FROM stocks WHERE symbol = ?',
      [symbol]
    );
    
    if (existing.length > 0) {
      // Symbol exists but might be inactive
      if (!existing[0].is_active) {
        await db.query('UPDATE stocks SET is_active = TRUE WHERE symbol = ?', [symbol]);
        console.log(`  ℹ️  Reactivated symbol: ${symbol}`);
      }
      return { exists: true, stockId: existing[0].stock_id };
    }
    
    // Validate symbol with Alpaca API
    console.log(`  🔍 Validating new symbol: ${symbol}`);
    const response = await axios.get(
      `${ALPACA_CONFIG.baseURL}/v2/stocks/${symbol}/bars`,
      {
        headers: ALPACA_CONFIG.headers,
        params: {
          timeframe: '1Day',
          limit: 1,
          feed: 'iex'
        },
        timeout: 5000
      }
    );
    
    if (!response.data.bars || response.data.bars.length === 0) {
      throw new Error('Symbol not found or no data available');
    }
    
    // Valid symbol - add to database
    const [result] = await db.query(
      'INSERT INTO stocks (symbol, is_active, created_at, updated_at) VALUES (?, TRUE, NOW(), NOW())',
      [symbol]
    );
    
    console.log(`  ✅ Added new symbol: ${symbol} (stock_id: ${result.insertId})`);
    
    // Fetch initial data for multiple intervals
    const intervals = ['1m', '5m', '15m', '1h', '1d'];
    
    // Get last market close time (4 PM ET on last trading day)
    const now = new Date();
    let endDate = new Date(now);
    
    // Simple logic: if it's after 4 PM ET today (weekday), use today; otherwise use previous trading day
    const etTimeString = now.toLocaleString('en-US', { timeZone: 'America/New_York' });
    const etNow = new Date(etTimeString);
    const etDay = etNow.getDay(); // 0=Sunday, 6=Saturday
    const etHour = etNow.getHours();
    
    // If weekend, go back to Friday
    if (etDay === 0) { // Sunday
      endDate.setDate(endDate.getDate() - 2);
    } else if (etDay === 6) { // Saturday
      endDate.setDate(endDate.getDate() - 1);
    } else if (etDay === 1 && etHour < 16) { // Monday before 4 PM - use Friday
      endDate.setDate(endDate.getDate() - 3);
    } else if (etHour < 16) { // Weekday before 4 PM - use previous day
      endDate.setDate(endDate.getDate() - 1);
    }
    
    for (const interval of intervals) {
      try {
        const timeframeMap = {
          '1m': { tf: '1Min', days: 1 },
          '5m': { tf: '5Min', days: 5 },
          '15m': { tf: '15Min', days: 30 },
          '1h': { tf: '1Hour', days: 90 },
          '1d': { tf: '1Day', days: 1095 } // 3 years
        };
        
        const config = timeframeMap[interval];
        if (!config) continue;
        
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - config.days);
        
        const histResponse = await axios.get(
          `${ALPACA_CONFIG.baseURL}/v2/stocks/bars`,
          {
            headers: ALPACA_CONFIG.headers,
            params: {
              symbols: symbol,
              timeframe: config.tf,
              start: startDate.toISOString(),
              end: endDate.toISOString(),
              adjustment: 'split',
              feed: 'iex',
              limit: 10000
            },
            timeout: 10000
          }
        );
        
        const bars = histResponse.data.bars?.[symbol];
        if (bars && bars.length > 0) {
          for (const bar of bars) {
            const ts = Math.floor(new Date(bar.t).getTime() / 1000);
            await db.query(
              `INSERT IGNORE INTO candles 
               (stock_id, interval_type, ts, open, high, low, close, volume, vwap, trade_count, data_source)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'alpaca')`,
              [result.insertId, interval, ts, bar.o, bar.h, bar.l, bar.c, bar.v, bar.vw || 0, bar.n || 0]
            );
          }
          console.log(`  📥 Fetched ${bars.length} bars for ${interval}`);
        }
      } catch (fetchError) {
        console.log(`  ⚠️  Could not fetch ${interval} data:`, fetchError.message);
      }
    }
    
    return { exists: false, stockId: result.insertId, added: true };
    
  } catch (error) {
    if (error.response?.status === 404 || error.response?.status === 422) {
      throw new Error('Invalid symbol');
    }
    if (error.message === 'Symbol not found or no data available') {
      throw new Error('Invalid symbol');
    }
    throw error;
  }
}

// ===== ENDPOINTS =====

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'stock-data-server',
    version: '1.0.0',
    database: 'mysql',
    dataSource: 'alpaca'
  });
});

// Main endpoint matching client's existing API: /api/stock/:symbol
app.get('/api/stock/:symbol', async (req, res) => {
  const { symbol } = req.params;
  const { interval = '1d', includePrePost = 'false' } = req.query;
  
  if (!symbol) {
    return res.status(400).json({ 
      chart: { 
        result: null, 
        error: { code: 'bad_request', description: 'Symbol parameter is required' } 
      } 
    });
  }
  
  // Normalize symbol: convert hyphens to dots (e.g., BRK-B -> BRK.B)
  // Alpaca API uses dots for class designations, not hyphens
  let normalizedSymbol = symbol.toUpperCase().replace(/-/g, '.');
  const upperSymbol = normalizedSymbol;
  const includeExtended = includePrePost === 'true';
  console.log(`📊 Request: ${symbol.toUpperCase()} ${interval} (includePrePost: ${includeExtended})${symbol !== normalizedSymbol ? ` [normalized to ${normalizedSymbol}]` : ''}`);
  
  try {
    // Try MySQL first
    try {
      const data = await fetchFromMySQL(upperSymbol, interval, includeExtended);
      console.log(`  ✓ MySQL: ${data.chart.result[0].timestamp.length} bars`);
      return res.json(data);
    } catch (mysqlError) {
      console.log(`  ✗ MySQL: ${mysqlError.message}`);
      
      // Check if symbol is inactive (not supported)
      if (mysqlError.message.includes('is inactive')) {
        return res.status(404).json({
          chart: {
            result: null,
            error: {
              code: 'symbol_not_supported',
              description: `Symbol '${upperSymbol}' is not supported by data provider (possibly delisted)`
            }
          }
        });
      }
      
      // Check if symbol is invalid or just needs to be added
      if (mysqlError.message.includes('not found in database')) {
        try {
          // Validate and auto-add symbol
          const validation = await validateAndAddSymbol(upperSymbol);
          
          if (validation.added) {
            console.log(`  ✨ Symbol auto-added, fetching data...`);
            // Try fetching from MySQL again after adding
            try {
              const data = await fetchFromMySQL(upperSymbol, interval, includeExtended);
              console.log(`  ✓ MySQL: ${data.chart.result[0].timestamp.length} bars`);
              return res.json(data);
            } catch (retryError) {
              // If MySQL still fails after auto-add, try Alpaca as last resort
              console.log(`  ✗ MySQL retry failed: ${retryError.message}`);
              console.log(`  ℹ️  Falling back to Alpaca...`);
            }
          }
        } catch (validationError) {
          if (validationError.message === 'Invalid symbol') {
            return res.status(404).json({
              chart: {
                result: null,
                error: {
                  code: 'invalid_symbol',
                  description: `Symbol '${upperSymbol}' is not valid or not available`
                }
              }
            });
          }
          console.log(`  ⚠️  Validation error: ${validationError.message}`);
        }
      }
      
      // Fall back to Alpaca
      try {
        const data = await fetchFromAlpaca(upperSymbol, interval, includeExtended);
        console.log(`  ✓ Alpaca: ${data.chart.result[0].timestamp.length} bars`);
        return res.json(data);
      } catch (alpacaError) {
        console.log(`  ✗ Alpaca: ${alpacaError.message}`);
        
        // Return error with clear message
        return res.status(404).json({
          chart: {
            result: null,
            error: {
              code: 'no_data',
              description: `No data available for ${upperSymbol} with interval ${interval}`
            }
          }
        });
      }
    }
  } catch (error) {
    console.error(`  ✗ Error: ${error.message}`);
    res.status(503).json({
      chart: {
        result: null,
        error: {
          code: 'data_unavailable',
          description: error.message
        }
      }
    });
  }
});

// Alternative endpoint for convenience: /bars
app.get('/bars', async (req, res) => {
  const { symbol, range = '1d', extended = 'false' } = req.query;
  
  if (!symbol) {
    return res.status(400).json({ error: 'Symbol parameter is required' });
  }
  
  const upperSymbol = symbol.toUpperCase();
  const includeExtended = extended === 'true';
  console.log(`📊 Request: ${upperSymbol} ${range} (extended: ${includeExtended})`);
  
  try {
    // Try MySQL first
    try {
      const data = await fetchFromMySQL(upperSymbol, range, includeExtended);
      console.log(`  ✓ MySQL: ${data.chart.result[0].timestamp.length} bars`);
      return res.json(data);
    } catch (mysqlError) {
      console.log(`  ✗ MySQL: ${mysqlError.message}`);
      
      // Fall back to Alpaca
      try {
        const data = await fetchFromAlpaca(upperSymbol, range, includeExtended);
        console.log(`  ✓ Alpaca: ${data.chart.result[0].timestamp.length} bars`);
        return res.json(data);
      } catch (alpacaError) {
        console.log(`  ✗ Alpaca: ${alpacaError.message}`);
        throw new Error('No data available from any source');
      }
    }
  } catch (error) {
    console.error(`  ✗ Error: ${error.message}`);
    res.status(503).json({
      chart: {
        result: null,
        error: {
          code: 'data_unavailable',
          description: error.message
        }
      }
    });
  }
});

app.get('/symbols', async (req, res) => {
  try {
    const db = getDB();
    const [rows] = await db.query(
      `SELECT symbol, company_name, exchange, sector 
       FROM stocks 
       WHERE is_active = TRUE 
       ORDER BY symbol`
    );
    
    res.json({
      count: rows.length,
      symbols: rows
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/stats', async (req, res) => {
  try {
    const db = getDB();
    
    const [coverage] = await db.query('SELECT * FROM data_coverage LIMIT 100');
    const [collectionStats] = await db.query('SELECT * FROM collection_stats');
    const [latestLogs] = await db.query(
      'SELECT * FROM data_collection_log ORDER BY started_at DESC LIMIT 10'
    );
    
    res.json({
      coverage,
      collectionStats,
      latestLogs
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// ===== STARTUP =====

async function startServer() {
  try {
    await initDB();
    
    app.listen(PORT, () => {
      console.log('\n╔═══════════════════════════════════════════════╗');
      console.log('║     📊 STOCK DATA SERVER v1.0                ║');
      console.log('╚═══════════════════════════════════════════════╝\n');
      console.log(`✅ Server running on http://localhost:${PORT}`);
      console.log(`✅ Health check: http://localhost:${PORT}/health`);
      console.log(`✅ API endpoint: http://localhost:${PORT}/api/stock/AAPL?interval=1d`);
      console.log(`✅ With extended hours: http://localhost:${PORT}/api/stock/AAPL?interval=1d&includePrePost=true`);
      console.log(`✅ Symbols list: http://localhost:${PORT}/symbols`);
      console.log(`✅ Statistics: http://localhost:${PORT}/stats\n`);
      console.log('Press Ctrl+C to stop\n');
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n\n⏹️  Shutting down server...');
  await closeDB();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n\n⏹️  Shutting down server...');
  await closeDB();
  process.exit(0);
});

startServer();

module.exports = app;
