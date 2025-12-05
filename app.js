/**
 * COMBINED STOCK DATA SERVER + COLLECTOR
 * 
 * STRICT SEPARATION OF CONCERNS:
 * - API: READ-ONLY from database (candles table)
 * - API: Can queue symbols (INSERT into stocks table only)
 * - Collector: WRITE-ONLY to candles table (all provider requests)
 * - Collector runs via: (A) Cron schedules, (B) Manual triggers, (C) Auto-detect new symbols
 * - Gap filling: Periodic random check for missing data
 * 
 * This prevents deadlocks - only collector writes to candles!
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cron = require('node-cron');
const { initDB, getDB, closeDB } = require('./config/database');
const providerManager = require('./src/providers/ProviderManager');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// ===== CONFIGURATION =====

const COLLECTION_ENABLED = process.env.COLLECTION_ENABLED !== 'false';
const MAX_CANDLES = parseInt(process.env.MAX_CANDLES_PER_INTERVAL) || 600;
const DATA_STALE_MINUTES = parseInt(process.env.DATA_STALE_MINUTES) || 1440; // 24 hours default
const GAP_FILL_PRIORITY = process.env.GAP_FILL_PRIORITY 
  ? process.env.GAP_FILL_PRIORITY.split(',').map(s => s.trim())
  : ['1d', '1w', '1mo', '4h', '2h', '1h', '30m', '15m', '5m', '2m', '1m'];

// Collection queue for triggered collections
const collectionQueue = new Set();
const intervalLocks = new Map(); // Track which intervals are currently collecting
const queueLock = { isProcessing: false }; // Separate lock for queue processing

// Track recently collected symbols to prevent repeated staleness errors
const recentlyCollected = new Map(); // symbol -> timestamp

// Debug logging to file
const fs = require('fs');
const debugLog = (msg) => {
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] ${msg}\n`;
  console.log(msg);  // Also log to console
  try {
    fs.appendFileSync('debug-cron.log', logLine);
  } catch (err) {
    // Ignore file errors
  }
};

// All supported intervals with cron schedules
// NOTE: Intraday intervals use 6-field format (seconds included) with 15-second delay
// This ensures providers have time to aggregate and publish completed bars before we fetch
// For 5m+ intervals, we also add a retry 1 minute later as a safety net
const INTERVALS = [
  { name: '1m', cron: '15 * * * * *', minutes: 1 },        // Every minute at :15 seconds
  { name: '2m', cron: '15 */2 * * * *', minutes: 2 },      // Every 2 minutes at :15 seconds
  { name: '5m', cron: '15 */5 * * * *', minutes: 5, retryCron: '15 1-59/5 * * * *' },      // :00:15 + retry at :01:15
  { name: '15m', cron: '15 */15 * * * *', minutes: 15, retryCron: '15 1-59/15 * * * *' },  // :00:15 + retry at :01:15
  { name: '30m', cron: '15 */30 * * * *', minutes: 30, retryCron: '15 1-59/30 * * * *' },  // :00:15 + retry at :01:15
  { name: '1h', cron: '15 0 * * * *', minutes: 60, retryCron: '15 1 * * * *' },            // :00:15 + retry at :01:15
  { name: '2h', cron: '15 0 */2 * * *', minutes: 120, retryCron: '15 1 */2 * * *' },       // :00:15 + retry at :01:15
  { name: '4h', cron: '15 0 */4 * * *', minutes: 240, retryCron: '15 1 */4 * * *' },       // :00:15 + retry at :01:15
  { name: '1d', cron: '0 16 * * 1-5', minutes: 1440 },     // 4 PM ET weekdays (no retry needed)
  { name: '1w', cron: '0 16 * * 5', minutes: 10080 },      // Friday 4 PM ET (no retry needed)
  { name: '1mo', cron: '0 16 28-31 * *', minutes: 43200 }  // Last day of month (no retry needed)
];

// ===== MIDDLEWARE =====

app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// ===== HELPER FUNCTIONS =====

function normalizeSymbol(symbol) {
  return symbol.toUpperCase().replace(/-/g, '.');
}

/**
 * Aggregate bars for non-stored intervals
 * @param {Array} bars - Source bars to aggregate
 * @param {number} multiplier - How many source bars to combine (e.g., 3 for 3m from 1m)
 * @returns {Array} Aggregated bars
 */
function aggregateBars(bars, multiplier) {
  if (multiplier === 1) return bars;
  
  const aggregated = [];
  
  for (let i = 0; i < bars.length; i += multiplier) {
    const chunk = bars.slice(i, i + multiplier);
    if (chunk.length === 0) continue;
    
    // OHLCV aggregation rules:
    // Open = first bar's open
    // High = max of all highs
    // Low = min of all lows
    // Close = last bar's close
    // Volume = sum of all volumes
    const highs = chunk.map(b => Number(b.high)).filter(v => !isNaN(v));
    const lows = chunk.map(b => Number(b.low)).filter(v => !isNaN(v));
    const volumes = chunk.map(b => Number(b.volume) || 0);
    
    aggregated.push({
      ts: chunk[0].ts,
      open: chunk[0].open,
      high: highs.length > 0 ? Math.max(...highs) : chunk[0].high,
      low: lows.length > 0 ? Math.min(...lows) : chunk[0].low,
      close: chunk[chunk.length - 1].close,
      volume: volumes.reduce((sum, v) => sum + v, 0)
    });
  }
  
  return aggregated;
}

function normalizeInterval(intervalParam) {
  // Stored intervals (no aggregation needed)
  const storedIntervals = ['1m', '2m', '5m', '15m', '30m', '1h', '2h', '4h', '1d', '1w', '1mo'];
  if (storedIntervals.includes(intervalParam)) {
    return { interval: intervalParam, sourceInterval: intervalParam, multiplier: 1 };
  }
  
  // Aggregatable intervals with optimal source selection
  const aggregationMap = {
    // Minutes (from 1m, 2m, 5m)
    '3m': { sourceInterval: '1m', multiplier: 3 },
    '6m': { sourceInterval: '2m', multiplier: 3 },
    '10m': { sourceInterval: '5m', multiplier: 2 },
    '12m': { sourceInterval: '2m', multiplier: 6 },
    '20m': { sourceInterval: '5m', multiplier: 4 },
    '45m': { sourceInterval: '15m', multiplier: 3 },
    
    // Hours (from 1h, 2h, 4h)
    '3h': { sourceInterval: '1h', multiplier: 3 },
    '6h': { sourceInterval: '2h', multiplier: 3 },
    '8h': { sourceInterval: '4h', multiplier: 2 },
    '12h': { sourceInterval: '4h', multiplier: 3 },
    
    // Days (from 1d)
    '2d': { sourceInterval: '1d', multiplier: 2 },
    '3d': { sourceInterval: '1d', multiplier: 3 },
    '4d': { sourceInterval: '1d', multiplier: 4 },
    '5d': { sourceInterval: '1d', multiplier: 5 },
    
    // Weeks (from 1w)
    '2w': { sourceInterval: '1w', multiplier: 2 },
    '3w': { sourceInterval: '1w', multiplier: 3 },
    
    // Months (from 1mo)
    '2mo': { sourceInterval: '1mo', multiplier: 2 },
    '3mo': { sourceInterval: '1mo', multiplier: 3 },
    '4mo': { sourceInterval: '1mo', multiplier: 4 },
    '6mo': { sourceInterval: '1mo', multiplier: 6 },
    '12mo': { sourceInterval: '1mo', multiplier: 12 }
  };
  
  if (aggregationMap[intervalParam]) {
    return { 
      interval: intervalParam, 
      ...aggregationMap[intervalParam] 
    };
  }
  
  // Legacy range mappings (for backward compatibility)
  const intervalMap = {
    '1d': '1d', '5d': '5m', '1mo': '15m', '3mo': '1h',
    '6mo': '1h', '1y': '1d', '2y': '1d', '5y': '1w', 'max': '1w'
  };
  
  const mapped = intervalMap[intervalParam] || '1d';
  return { interval: mapped, sourceInterval: mapped, multiplier: 1 };
}

function getTimeRangeForInterval(intervalParam) {
  const now = Math.floor(Date.now() / 1000);
  const intervalLookback = {
    // Stored minute intervals
    '1m': 24 * 60 * 60,           // 1 day
    '2m': 24 * 60 * 60,           // 1 day
    '5m': 5 * 24 * 60 * 60,       // 5 days
    '15m': 30 * 24 * 60 * 60,     // 30 days
    '30m': 30 * 24 * 60 * 60,     // 30 days
    
    // Aggregated minute intervals
    '3m': 24 * 60 * 60,           // 1 day
    '6m': 24 * 60 * 60,           // 1 day
    '10m': 5 * 24 * 60 * 60,      // 5 days
    '12m': 5 * 24 * 60 * 60,      // 5 days
    '20m': 10 * 24 * 60 * 60,     // 10 days
    '45m': 30 * 24 * 60 * 60,     // 30 days
    
    // Stored hour intervals
    '1h': 90 * 24 * 60 * 60,      // 90 days
    '2h': 90 * 24 * 60 * 60,      // 90 days
    '4h': 180 * 24 * 60 * 60,     // 180 days
    
    // Aggregated hour intervals
    '3h': 90 * 24 * 60 * 60,      // 90 days
    '6h': 180 * 24 * 60 * 60,     // 180 days
    '8h': 180 * 24 * 60 * 60,     // 180 days
    '12h': 180 * 24 * 60 * 60,    // 180 days
    
    // Stored day/week/month intervals
    '1d': Math.floor(365 * 2.5) * 24 * 60 * 60, // 2.5 years (~630 bars)
    '1w': 1825 * 24 * 60 * 60,    // 5 years
    '1mo': 3650 * 24 * 60 * 60,   // 10 years
    
    // Aggregated day intervals
    '2d': Math.floor(365 * 2.5) * 24 * 60 * 60, // 2.5 years
    '3d': Math.floor(365 * 2.5) * 24 * 60 * 60, // 2.5 years
    '4d': Math.floor(365 * 2.5) * 24 * 60 * 60, // 2.5 years
    '5d': Math.floor(365 * 2.5) * 24 * 60 * 60, // 2.5 years
    
    // Aggregated week intervals
    '2w': 1825 * 24 * 60 * 60,    // 5 years
    '3w': 1825 * 24 * 60 * 60,    // 5 years
    
    // Aggregated month intervals
    '2mo': 3650 * 24 * 60 * 60,   // 10 years
    '3mo': 3650 * 24 * 60 * 60,   // 10 years
    '4mo': 3650 * 24 * 60 * 60,   // 10 years
    '6mo': 3650 * 24 * 60 * 60,   // 10 years
    '12mo': 3650 * 24 * 60 * 60   // 10 years
  };
  
  const lookback = intervalLookback[intervalParam] || 365 * 24 * 60 * 60;
  
  // For intraday intervals, if market is closed, adjust end time to last market close (4 PM ET)
  const intradayIntervals = ['1m', '2m', '5m', '15m', '30m', '1h', '2h', '4h'];
  let endTime = now;
  
  if (intradayIntervals.includes(intervalParam) && !isMarketHours()) {
    // Get current time in ET
    const nowDate = new Date();
    const etDate = new Date(nowDate.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    
    // Set to 4:00 PM ET today
    const marketClose = new Date(etDate);
    marketClose.setHours(16, 0, 0, 0);
    
    // If current ET time is before 4 PM, use previous trading day's close
    if (etDate.getHours() < 16 || (etDate.getHours() === 16 && etDate.getMinutes() === 0)) {
      marketClose.setDate(marketClose.getDate() - 1);
      // If that's a weekend, go back to Friday
      while (marketClose.getDay() === 0 || marketClose.getDay() === 6) {
        marketClose.setDate(marketClose.getDate() - 1);
      }
    }
    
    endTime = Math.floor(marketClose.getTime() / 1000);
  }
  
  return { start: endTime - lookback, end: endTime };
}

function isMarketHours() {
  const now = new Date();
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = et.getDay();
  const hour = et.getHours();
  const minute = et.getMinutes();
  
  if (day === 0 || day === 6) return false; // Weekend
  const time = hour * 60 + minute;
  return time >= (9 * 60 + 30) && time <= (16 * 60); // 9:30 AM - 4:00 PM ET
}

async function retryOnDeadlock(fn, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      if (error.code === 'ER_LOCK_DEADLOCK' && i < maxRetries - 1) {
        console.log(`  ⚠️  Deadlock detected, retrying (${i + 1}/${maxRetries})...`);
        await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, i)));
        continue;
      }
      throw error;
    }
  }
}

// ===== DATABASE FUNCTIONS (READ-ONLY FOR API) =====

async function fetchFromMySQL(symbol, intervalParam, includeExtended = false) {
  const db = getDB();
  const { interval, sourceInterval, multiplier } = normalizeInterval(intervalParam);
  const { start, end } = getTimeRangeForInterval(intervalParam);
  
  console.log(`  🔍 fetchFromMySQL: symbol=${symbol}, interval=${intervalParam}, includeExtended=${includeExtended}`);
  console.log(`     Normalized: interval=${interval}, sourceInterval=${sourceInterval}, multiplier=${multiplier}`);
  console.log(`     Time range: ${new Date(start * 1000).toISOString()} to ${new Date(end * 1000).toISOString()}`);
  
  const [rows] = await db.query(
    'SELECT stock_id, is_active, company_name, exchange FROM stocks WHERE symbol = ?',
    [symbol]
  );
  
  if (rows.length === 0) {
    throw new Error(`Symbol ${symbol} not found in database`);
  }
  
  if (!rows[0].is_active) {
    throw new Error(`Symbol ${symbol} is inactive (not supported by provider)`);
  }
  
  const stockId = rows[0].stock_id;
  const stockInfo = rows[0];
  
  console.log(`     Stock ID: ${stockId}, Active: ${stockInfo.is_active}`);
  
  let query = `
    SELECT ts, open, high, low, close, volume 
    FROM candles 
    WHERE stock_id = ? AND interval_type = ? AND ts >= ? AND ts <= ?
  `;
  
  const params = [stockId, sourceInterval, start, end];
  
  // Filter extended hours for intraday intervals
  const intradayIntervals = ['1m', '2m', '3m', '5m', '6m', '10m', '12m', '15m', '20m', '30m', '45m', '1h', '2h', '3h', '4h', '6h', '8h', '12h'];
  if (!includeExtended && intradayIntervals.includes(interval)) {
    console.log(`     Applying market hours filter (9:30-16:00 ET)`);
    // Calculate ET time using UTC offset instead of CONVERT_TZ (which requires timezone tables)
    // Market hours: 9:30 AM - 4:00 PM ET (09:30 - 16:00)
    // ET is UTC-5 (EST) or UTC-4 (EDT), so we check hour range accounting for offset
    // Using modulo arithmetic: ((ts % 86400) - offset) / 3600 gives hour of day in ET
    // 9.5 hours = 34200 seconds (9:30 AM), 16 hours = 57600 seconds (4:00 PM)
    query += ` AND (
      MOD(ts - 18000, 86400) >= 34200 AND 
      MOD(ts - 18000, 86400) <= 57600
    )`;
  } else {
    console.log(`     No market hours filter (includeExtended=${includeExtended}, interval=${interval})`);
  }
  
  query += ' ORDER BY ts ASC';
  
  console.log(`     Executing query...`);
  let [candles] = await db.query(query, params);
  
  console.log(`     Query result: ${candles.length} candles`);
  
  if (candles.length === 0) {
    throw new Error('No data available in cache');
  }
  
  // Apply aggregation if needed
  if (multiplier > 1) {
    candles = aggregateBars(candles, multiplier);
    if (candles.length === 0) {
      throw new Error('No data available after aggregation');
    }
  }
  
  // Smart staleness check based on interval and market hours
  const latestTs = candles[candles.length - 1].ts;
  const ageMinutes = (Date.now() / 1000 - latestTs) / 60;
  
  // Skip staleness check if recently collected (within last 2 minutes)
  const lastCollected = recentlyCollected.get(symbol);
  if (lastCollected && (Date.now() - lastCollected) < 120000) {
    // Data was just collected, trust it even if timestamp seems old
    console.log(`  ℹ️  Using recently collected data (${Math.floor((Date.now() - lastCollected) / 1000)}s ago)`);
  } else {
    // For daily intervals, allow up to 4 days (weekend + Monday)
    // For intraday intervals, use configured threshold
    let staleThreshold = DATA_STALE_MINUTES;
    const dailyIntervals = ['1d', '2d', '3d', '4d', '5d', '1w', '2w', '3w', '1mo', '2mo', '3mo', '4mo', '6mo', '12mo'];
    if (dailyIntervals.includes(interval)) {
      staleThreshold = 4 * 24 * 60; // 4 days for daily data
    }
    
    // If market is closed, be more lenient with staleness
    if (!isMarketHours()) {
      // After market close, data can be up to 24 hours old
      staleThreshold = Math.max(staleThreshold, 24 * 60);
    }
    
    if (ageMinutes > staleThreshold) {
      throw new Error(`Data is stale (${Math.floor(ageMinutes)} minutes old)`);
    }
  }
  
  // Calculate regularMarketPrice (latest close)
  const latestClose = parseFloat(candles[candles.length - 1].close);
  
  return {
    chart: {
      result: [{
        meta: {
          currency: "USD",
          symbol: symbol,
          exchangeName: stockInfo.exchange || "NYSE",
          instrumentType: "EQUITY",
          firstTradeDate: null,
          regularMarketTime: latestTs,
          regularMarketPrice: latestClose,
          gmtoffset: -18000,
          timezone: "EST",
          exchangeTimezoneName: "America/New_York",
          companyName: stockInfo.company_name || symbol
        },
        timestamp: candles.map(c => c.ts),
        indicators: {
          quote: [{
            open: candles.map(c => parseFloat(c.open)),
            high: candles.map(c => parseFloat(c.high)),
            low: candles.map(c => parseFloat(c.low)),
            close: candles.map(c => parseFloat(c.close)),
            volume: candles.map(c => parseInt(c.volume))
          }]
        }
      }],
      error: null
    }
  };
}

/**
 * Queue symbol for collection - READ-ONLY API operation
 * Only adds to stocks table, collector will handle the rest
 */
async function queueSymbolForCollection(symbol) {
  const db = getDB();
  
  // Check if symbol already exists
  const [existing] = await db.query(
    'SELECT stock_id, is_active FROM stocks WHERE symbol = ?',
    [symbol]
  );
  
  if (existing.length > 0) {
    if (!existing[0].is_active) {
      // Reactivate inactive symbol
      await db.query(
        'UPDATE stocks SET is_active = TRUE, requested_at = NOW() WHERE symbol = ?',
        [symbol]
      );
      console.log(`  ♻️  Reactivated symbol ${symbol}`);
    }
    return existing[0].stock_id;
  }
  
  // Validate with provider (but don't fetch data)
  console.log(`  🔍 Validating symbol ${symbol} with provider...`);
  const isValid = await providerManager.validateSymbol(symbol);
  
  if (!isValid) {
    throw new Error(`Symbol ${symbol} not found by any provider`);
  }
  
  // Add to stocks table
  const [result] = await db.query(
    `INSERT INTO stocks (symbol, is_active, requested_at) 
     VALUES (?, TRUE, NOW())`,
    [symbol]
  );
  
  console.log(`  ✅ Symbol ${symbol} queued for collection (stock_id: ${result.insertId})`);
  
  // Add to collection queue for immediate collection
  collectionQueue.add(symbol);
  
  return result.insertId;
}

// ===== API ENDPOINTS (READ-ONLY) =====

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    collectionEnabled: COLLECTION_ENABLED
  });
});

app.get('/api/stock/:symbol', async (req, res) => {
  const rawSymbol = req.params.symbol;
  const symbol = normalizeSymbol(rawSymbol);
  const intervalParam = req.query.interval || req.query.range || '1d';
  const includePrePost = req.query.includePrePost === 'true';
  
  console.log(`\n📊 API Request: ${symbol} ${intervalParam} (extended: ${includePrePost})`);
  
  try {
    // STRICTLY READ-ONLY: Only fetch from MySQL
    const data = await fetchFromMySQL(symbol, intervalParam, includePrePost);
    console.log(`  ✓ MySQL: ${data.chart.result[0].timestamp.length} bars`);
    return res.json(data);
    
  } catch (error) {
    console.log(`  ✗ MySQL: ${error.message}`);
    
    // Symbol not in database - queue it and let collector handle it
    if (error.message.includes('not found in database')) {
      try {
        await queueSymbolForCollection(symbol);
        
        // Trigger immediate processing (don't wait for cron)
        setImmediate(() => {
          processCollectionQueue().catch(err => {
            console.error('❌ Immediate queue processing error:', err.message);
          });
        });
        
        return res.status(503)
          .set('Retry-After', '15')
          .json({
            error: 'Symbol not yet available',
            message: `Symbol ${symbol} has been queued for collection. Please retry in 10-30 seconds.`,
            retryAfter: 15,
            status: 'queued'
          });
      } catch (validationError) {
        console.log(`  ✗ Validation failed: ${validationError.message}`);
        return res.status(404).json({
          error: 'Symbol not found',
          message: `Symbol ${symbol} does not exist or is not supported by any provider.`
        });
      }
    }
    
    // Data is stale or missing - trigger collector refresh
    if (error.message.includes('stale') || error.message.includes('No data')) {
      console.log(`  ⏰ Data stale, triggering collector refresh...`);
      
      // Add to collection queue for immediate refresh
      collectionQueue.add(symbol);
      
      // Trigger immediate processing (don't wait for cron)
      setImmediate(() => {
        processCollectionQueue().catch(err => {
          console.error('❌ Immediate queue processing error:', err.message);
        });
      });
      
      return res.status(503)
        .set('Retry-After', '15')
        .json({
          error: 'Data being refreshed',
          message: `Data for ${symbol} is being updated. Please retry in 10-30 seconds.`,
          retryAfter: 15,
          status: 'refreshing'
        });
    }
    
    // Symbol inactive
    if (error.message.includes('inactive')) {
      return res.status(404).json({
        error: 'Symbol inactive',
        message: `Symbol ${symbol} is not supported by the current provider.`
      });
    }
    
    // Other errors
    console.error(`  ✗ Error: ${error.message}`);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

app.get('/symbols', async (req, res) => {
  try {
    const db = getDB();
    const [rows] = await db.query(
      `SELECT symbol, company_name, exchange, sector, requested_at 
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
    
    const [symbolStats] = await db.query(`
      SELECT 
        COUNT(DISTINCT stock_id) as total_symbols,
        SUM(CASE WHEN is_active = TRUE THEN 1 ELSE 0 END) as active_symbols
      FROM stocks
    `);
    
    const [candleStats] = await db.query(`
      SELECT 
        interval_type,
        COUNT(*) as total_candles,
        MIN(ts) as oldest_ts,
        MAX(ts) as latest_ts
      FROM candles
      GROUP BY interval_type
      ORDER BY interval_type
    `);
    
    const [latestLogs] = await db.query(
      'SELECT * FROM data_collection_log ORDER BY started_at DESC LIMIT 10'
    );
    
    res.json({
      symbols: symbolStats[0],
      candles: candleStats,
      latestLogs,
      collectionQueue: Array.from(collectionQueue),
      isCollecting
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Manual collection trigger endpoint
app.post('/collect/:symbol', async (req, res) => {
  const rawSymbol = req.params.symbol;
  const symbol = normalizeSymbol(rawSymbol);
  const intervalParam = req.query.interval || 'all'; // 'all' or specific interval
  
  console.log(`\n🎯 Manual collection request: ${symbol} ${intervalParam}`);
  
  try {
    // Validate symbol exists in stocks table
    const stockId = await getStockId(symbol);
    if (!stockId) {
      return res.status(404).json({
        error: 'Symbol not found',
        message: `Symbol ${symbol} is not in the database. Add it via GET /api/stock/${symbol} first.`
      });
    }
    
    // Add to collection queue
    if (intervalParam === 'all') {
      collectionQueue.add(symbol);
      console.log(`  ✓ Queued ${symbol} for all intervals`);
    } else {
      collectionQueue.add(`${symbol}:${intervalParam}`);
      console.log(`  ✓ Queued ${symbol} for ${intervalParam} interval`);
    }
    
    res.json({
      message: `Collection queued for ${symbol}`,
      interval: intervalParam,
      queueSize: collectionQueue.size
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// ===== COLLECTOR FUNCTIONS (WRITE-ONLY TO CANDLES) =====

async function getActiveSymbols() {
  const db = getDB();
  const [rows] = await db.query(
    'SELECT stock_id, symbol FROM stocks WHERE is_active = TRUE ORDER BY symbol'
  );
  return rows;
}

async function getStockId(symbol) {
  const db = getDB();
  const [rows] = await db.query(
    'SELECT stock_id FROM stocks WHERE symbol = ?',
    [symbol]
  );
  return rows.length > 0 ? rows[0].stock_id : null;
}

async function storeBars(stockId, intervalType, bars, source) {
  if (!bars || bars.length === 0) return { inserted: 0, updated: 0 };
  
  const db = getDB();
  let inserted = 0;
  let updated = 0;
  
  for (const bar of bars) {
    const ts = Math.floor(new Date(bar.t).getTime() / 1000);
    
    await retryOnDeadlock(async () => {
      const [result] = await db.query(
        `INSERT INTO candles (stock_id, interval_type, ts, open, high, low, close, volume, vwap, trade_count, data_source)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           open = VALUES(open),
           high = VALUES(high),
           low = VALUES(low),
           close = VALUES(close),
           volume = VALUES(volume),
           vwap = VALUES(vwap),
           trade_count = VALUES(trade_count),
           data_source = VALUES(data_source)`,
        [stockId, intervalType, ts, bar.o, bar.h, bar.l, bar.c, bar.v, bar.vw || null, bar.n || null, source]
      );
      
      if (result.affectedRows === 1) inserted++;
      else if (result.affectedRows === 2) updated++;
    });
  }
  
  return { inserted, updated };
}

async function collectInterval(intervalName) {
  console.log(`\n⏰ [${new Date().toLocaleTimeString()}] collectInterval called for: ${intervalName}`);
  
  // Check if THIS interval is already collecting (per-interval lock)
  if (intervalLocks.get(intervalName)) {
    console.log(`  ⏸️  ${intervalName} collection already in progress, skipping`);
    return;
  }
  
  intervalLocks.set(intervalName, true);
  console.log(`  🔒 Lock acquired for ${intervalName}`);
  
  try {
    const symbols = await getActiveSymbols();
    
    if (symbols.length === 0) {
    console.log(`  ⚠️  No active symbols to collect for ${intervalName}`);
      return;
    }
    
    // Skip intraday intervals outside market hours
    const intradayIntervals = ['1m', '2m', '5m', '15m', '30m', '1h', '2h', '4h'];
    if (intradayIntervals.includes(intervalName) && !isMarketHours()) {
      console.log(`  ⏸️  Skipping ${intervalName} collection (market closed)`);
      return;
    }
    
    console.log(`\n🔄 Collecting ${intervalName} data for ${symbols.length} symbols (BATCH MODE)...`);
    
    // Calculate appropriate date range based on interval
    const endDate = new Date().toISOString(); // Use current time, not midnight!
    let daysBack;
    
    switch (intervalName) {
      case '1m':
      case '2m':
        daysBack = 5; // Alpaca limit for 1-2 min
        break;
      case '5m':
        daysBack = 30;
        break;
      case '15m':
      case '30m':
        daysBack = 60;
        break;
      case '1h':
      case '2h':
      case '4h':
        daysBack = 180;
        break;
      case '1d':
        daysBack = Math.floor(365 * 2.5); // 2.5 years of daily data (~630 bars)
        break;
      case '1w':
        daysBack = 365 * 5; // 5 years of weekly
        break;
      case '1mo':
        daysBack = 365 * 10; // 10 years of monthly
        break;
      default:
        daysBack = 365;
    }
    
    const startDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString();
    console.log(`  📅 Date range: ${startDate} to ${endDate} (${daysBack} days)`);
    
    // Split into chunks of 100 symbols (Alpaca has batch size limits)
    const BATCH_SIZE = 100;
    const chunks = [];
    for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
      chunks.push(symbols.slice(i, i + BATCH_SIZE));
    }
    
    console.log(`  📦 Split into ${chunks.length} batches of up to ${BATCH_SIZE} symbols each`);
    
    let totalSuccessCount = 0;
    let totalErrorCount = 0;
    
    // Process each chunk
    for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
      const chunkSymbols = chunks[chunkIndex];
      const symbolList = chunkSymbols.map(s => s.symbol).join(',');
      
      console.log(`\n  📦 Batch ${chunkIndex + 1}/${chunks.length}: ${chunkSymbols.length} symbols`);
      console.log(`     Requesting: ${symbolList.substring(0, 80)}${symbolList.length > 80 ? '...' : ''}`);
      console.log(`     🔍 Trying Alpaca...`);
    
    try {
      const result = await providerManager.fetchBars(symbolList, intervalName, startDate, endDate);
      
      // ===== DIAGNOSTIC LOGGING =====
      console.log(`\n     🔍 RAW RESPONSE ANALYSIS:`);
      console.log(`        result.bars type: ${typeof result.bars}`);
      console.log(`        result.bars is Array: ${Array.isArray(result.bars)}`);
      
      if (result.bars && typeof result.bars === 'object') {
        const responseKeys = Object.keys(result.bars);
        console.log(`        Response has ${responseKeys.length} top-level keys`);
        console.log(`        First 5 keys: [${responseKeys.slice(0, 5).join(', ')}]`);
        
        // Check if single symbol response (array format)
        if (Array.isArray(result.bars)) {
          console.log(`        ⚠️  Response is an ARRAY (single symbol format)`);
          console.log(`        Array length: ${result.bars.length} bars`);
        } else {
          // Check first entry structure
          const firstKey = responseKeys[0];
          const firstValue = result.bars[firstKey];
          console.log(`        First key: "${firstKey}"`);
          console.log(`        First value is Array: ${Array.isArray(firstValue)}`);
          console.log(`        First value length: ${Array.isArray(firstValue) ? firstValue.length : 'N/A'}`);
        }
        console.log(`     ================================\n`);
      
        // Check if response is array (single symbol) vs object (batch)
        if (Array.isArray(result.bars)) {
          // Single symbol response - bars is directly an array
          console.log(`     ✓ Received single symbol response with ${result.bars.length} bars`);
          
          if (chunkSymbols.length !== 1) {
            console.log(`     ⚠️  WARNING: Requested ${chunkSymbols.length} symbols but got single-symbol array response!`);
          }
          
          const symbol = chunkSymbols[0].symbol;
          const stockId = chunkSymbols[0].stock_id;
          
          const { inserted, updated } = await storeBars(stockId, intervalName, result.bars, result.source);
          if (inserted > 0 || updated > 0) {
            console.log(`     ✓ ${symbol}: ${inserted} new, ${updated} updated (${result.source})`);
          }
          
          totalSuccessCount++;
          console.log(`     📊 Batch ${chunkIndex + 1} complete: 1/1 symbols stored`);
        } else {
          // Batch response - bars is an object with symbol keys
          let successCount = 0;
          
          // Create symbol to stock_id map for quick lookup
          const symbolMap = new Map(chunkSymbols.map(s => [s.symbol, s.stock_id]));
          
          // Handle case where response has numeric keys instead of symbol names
          const isNumericKeys = responseKeys.length > 0 && !isNaN(responseKeys[0]);
          
          if (isNumericKeys) {
            console.log(`     ⚠️  WARNING: Alpaca returned NUMERIC keys instead of symbol names!`);
            console.log(`     Response keys: [${responseKeys.slice(0, 10).join(', ')}${responseKeys.length > 10 ? '...' : ''}]`);
            console.log(`     Chunk has ${chunkSymbols.length} symbols (indices 0-${chunkSymbols.length - 1})`);
            console.log(`     This suggests Alpaca API format change or request issue`);
          }
          
          console.log(`     ✓ Received ${responseKeys.length} symbols with data`);
          
          for (const [key, bars] of Object.entries(result.bars)) {
            let symbol, stockId;
            
            if (isNumericKeys) {
              const index = parseInt(key);
              if (index < 0 || index >= chunkSymbols.length) {
                console.log(`     ⚠️  ${key}: Index ${index} out of range (chunk has ${chunkSymbols.length} symbols)`);
                continue;
              }
              symbol = chunkSymbols[index]?.symbol;
              stockId = chunkSymbols[index]?.stock_id;
            } else {
              symbol = key;
              stockId = symbolMap.get(symbol);
            }
            
            if (!symbol || !stockId) {
              console.log(`     ⚠️  ${key}: Couldn't map to symbol (numeric: ${isNumericKeys}, symbol: ${symbol}, stockId: ${stockId})`);
              continue;
            }
            
            if (bars && bars.length > 0) {
              const { inserted, updated } = await storeBars(stockId, intervalName, bars, result.source);
              if (inserted > 0 || updated > 0) {
                console.log(`     ✓ ${symbol}: ${inserted} new, ${updated} updated (${result.source})`);
              }
              successCount++;
            }
          }
          
          totalSuccessCount += successCount;
          console.log(`     📊 Batch ${chunkIndex + 1} complete: ${successCount}/${chunkSymbols.length} symbols stored`);
        }
      } else {
        console.log(`     ⚠️  No data returned for this batch`);
      }
        
      } catch (error) {
        console.log(`     ✗ Batch ${chunkIndex + 1} failed: ${error.message}`);
        totalErrorCount++;
        
        if (error.message.includes('429') || error.message.includes('rate limit')) {
          console.log(`     ⏸️  Rate limit reached, stopping ${intervalName}`);
          break;
        }
      }
      
      // Small delay between chunks
      if (chunkIndex < chunks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    console.log(`\n  ✅ ${intervalName} complete: ${totalSuccessCount}/${symbols.length} total symbols collected`);
    
  } finally {
    intervalLocks.delete(intervalName);
  }
}

/**
 * Process collection queue (triggered collections from API or manual requests)
 */
async function processCollectionQueue() {
  console.log(`\n⏰ [${new Date().toLocaleTimeString()}] processCollectionQueue called`);
  console.log(`  Queue size: ${collectionQueue.size}, isProcessing: ${queueLock.isProcessing}`);
  
  if (queueLock.isProcessing || collectionQueue.size === 0) {
    console.log(`  ⏭️  Skipping (${queueLock.isProcessing ? 'already processing' : 'queue empty'})`);
    return;
  }
  
  queueLock.isProcessing = true;
  console.log(`  🔒 Queue lock acquired`);
  
  try {
    console.log(`\n📥 Processing collection queue (${collectionQueue.size} items)...`);
    
    const items = Array.from(collectionQueue);
    collectionQueue.clear();
    
    // Group items by interval (for batch processing)
    const symbolsByInterval = new Map();
    const specificRequests = []; // For symbol:interval format
    
    for (const item of items) {
      if (item.includes(':')) {
        // Specific interval request (e.g., "AAPL:1d")
        specificRequests.push(item);
      } else {
        // All intervals for this symbol
        for (const interval of INTERVALS) {
          if (!symbolsByInterval.has(interval.name)) {
            symbolsByInterval.set(interval.name, new Set());
          }
          symbolsByInterval.get(interval.name).add(item);
        }
      }
    }
    
    // Process specific interval requests first (still batched by interval)
    for (const item of specificRequests) {
      const [symbol, intervalName] = item.split(':');
      if (!symbolsByInterval.has(intervalName)) {
        symbolsByInterval.set(intervalName, new Set());
      }
      symbolsByInterval.get(intervalName).add(symbol);
    }
    
    // Get stock_id map for all symbols
    const allSymbols = new Set();
    for (const symbols of symbolsByInterval.values()) {
      symbols.forEach(s => allSymbols.add(s));
    }
    
    const symbolMap = new Map();
    for (const symbol of allSymbols) {
      const stockId = await getStockId(symbol);
      if (stockId) {
        symbolMap.set(symbol, stockId);
      } else {
        console.log(`  ⚠️  Symbol ${symbol} not found in database, skipping`);
      }
    }
    
    // Process each interval with batch request
    for (const [intervalName, symbolsSet] of symbolsByInterval.entries()) {
      const symbols = Array.from(symbolsSet).filter(s => symbolMap.has(s));
      
      if (symbols.length === 0) continue;
      
      console.log(`\n  🔄 ${intervalName}: Collecting ${symbols.length} symbols...`);
      
      // Split into chunks of 100 symbols (Alpaca has batch size limits)
      const BATCH_SIZE = 100;
      const chunks = [];
      for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
        chunks.push(symbols.slice(i, i + BATCH_SIZE));
      }
      
      console.log(`    📦 Split into ${chunks.length} batches of up to ${BATCH_SIZE} symbols each`);
      
      // Calculate date range
      const endDate = new Date().toISOString(); // Use current time, not midnight!
      let daysBack = 365;
      
      switch (intervalName) {
        case '1m':
        case '2m':
          daysBack = 5;
          break;
        case '5m':
          daysBack = 30;
          break;
        case '15m':
        case '30m':
          daysBack = 60;
          break;
        case '1h':
        case '2h':
        case '4h':
          daysBack = 180;
          break;
        case '1d':
          daysBack = Math.floor(365 * 2.5);
          break;
        case '1w':
          daysBack = 365 * 5;
          break;
        case '1mo':
          daysBack = 365 * 10;
          break;
      }
      
      const startDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString();
      
      // Process each chunk
      let totalSuccessCount = 0;
      
      for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
        const chunkSymbols = chunks[chunkIndex];
        const symbolList = chunkSymbols.join(',');
        
        console.log(`\n    📦 Batch ${chunkIndex + 1}/${chunks.length}: ${chunkSymbols.length} symbols`);
        console.log(`       Date range: ${startDate.split('T')[0]} to ${endDate.split('T')[0]}`);
        console.log(`       Requesting: ${symbolList.substring(0, 100)}${symbolList.length > 100 ? '...' : ''}`);
        
        try {
          const result = await providerManager.fetchBars(symbolList, intervalName, startDate, endDate);
          
          if (result.bars && typeof result.bars === 'object') {
            let chunkSuccessCount = 0;
            
            // Check if response is array (single symbol) vs object (batch)
            if (Array.isArray(result.bars)) {
              // Single symbol response - bars is directly an array
              console.log(`       ✓ Received single symbol response with ${result.bars.length} bars`);
              
              const symbol = chunkSymbols[0];
              const stockId = symbolMap.get(symbol);
              
              if (symbol && stockId && result.bars.length > 0) {
                const { inserted, updated } = await storeBars(stockId, intervalName, result.bars, result.source);
                if (inserted > 0 || updated > 0) {
                  console.log(`       ✓ ${symbol}: ${inserted} new, ${updated} updated (${result.source})`);
                }
                
                // Mark as recently collected to prevent immediate staleness errors
                recentlyCollected.set(symbol, Date.now());
                chunkSuccessCount++;
              }
            } else {
              // Batch response - bars is object with symbol keys
              const responseKeys = Object.keys(result.bars);
              console.log(`       ✓ Received ${responseKeys.length} symbols with data`);
              
              for (const [symbol, bars] of Object.entries(result.bars)) {
                const stockId = symbolMap.get(symbol);
                
                if (!stockId) {
                  console.log(`       ⚠️  ${symbol}: Not found in database`);
                  continue;
                }
                
                if (bars && bars.length > 0) {
                  const { inserted, updated } = await storeBars(stockId, intervalName, bars, result.source);
                  if (inserted > 0 || updated > 0) {
                    console.log(`       ✓ ${symbol}: ${inserted} new, ${updated} updated (${result.source})`);
                  }
                  
                  // Mark as recently collected to prevent immediate staleness errors
                  recentlyCollected.set(symbol, Date.now());
                  
                  chunkSuccessCount++;
                }
              }
            }
            
            totalSuccessCount += chunkSuccessCount;
            console.log(`       📊 Batch ${chunkIndex + 1} complete: ${chunkSuccessCount}/${chunkSymbols.length} symbols stored`);
          } else {
            console.log(`       ⚠️  No data returned for this batch`);
          }
          
        } catch (error) {
          console.log(`       ✗ Batch ${chunkIndex + 1} failed: ${error.message}`);
          
          if (error.message.includes('429') || error.message.includes('rate limit')) {
            console.log(`       ⏸️  Rate limit reached, stopping this interval`);
            break; // Stop processing more chunks for this interval
          }
        }
        
        // Small delay between chunks to avoid rate limits
        if (chunkIndex < chunks.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      console.log(`  ✅ ${intervalName}: ${totalSuccessCount}/${symbols.length} total symbols collected\n`);
    }
    
    console.log(`\n  ✅ Queue processing complete`);
  } finally {
    queueLock.isProcessing = false;
  }
}

/**
 * Gap filler - randomly checks for missing data and fills it
 */
async function fillGaps() {
  // Gap filling can run concurrently with interval collection
  // Only skip if queue is being processed
  if (queueLock.isProcessing) {
    console.log('  ⏸️  Queue processing in progress, skipping gap fill');
    return;
  }
  
  try {
    console.log('\n🔧 Checking for data gaps...');
    
    const symbols = await getActiveSymbols();
    if (symbols.length === 0) {
      console.log('  ⚠️  No active symbols');
      return;
    }
    
    // Pick a random symbol to check
    const randomSymbol = symbols[Math.floor(Math.random() * symbols.length)];
    console.log(`  🎲 Checking ${randomSymbol.symbol}...`);
    
    const db = getDB();
    let gapsFound = 0;
    
    // Check each interval for gaps
    for (const intervalName of GAP_FILL_PRIORITY) {
      const [rows] = await db.query(
        'SELECT COUNT(*) as count FROM candles WHERE stock_id = ? AND interval_type = ?',
        [randomSymbol.stock_id, intervalName]
      );
      
      const count = rows[0].count;
      
      // Expected minimum bars for each interval
      const expectedBars = {
        '1m': 390, '2m': 195, '5m': 78, '15m': 26, '30m': 13,
        '1h': 100, '2h': 50, '4h': 25,
        '1d': 250, '1w': 52, '1mo': 24
      };
      
      if (count < (expectedBars[intervalName] || 0)) {
        console.log(`  📊 Gap found: ${randomSymbol.symbol} ${intervalName} has only ${count} bars (expected ~${expectedBars[intervalName]})`);
        gapsFound++;
        
        // Fill this gap
        const endDate = new Date().toISOString(); // Use current time, not midnight!
        let daysBack = 365;
        
        switch (intervalName) {
          case '1m':
          case '2m':
            daysBack = 5;
            break;
          case '5m':
            daysBack = 30;
            break;
          case '15m':
          case '30m':
            daysBack = 60;
            break;
          case '1h':
          case '2h':
          case '4h':
            daysBack = 180;
            break;
          case '1d':
            daysBack = Math.floor(365 * 2.5);
            break;
          case '1w':
            daysBack = 365 * 5;
            break;
          case '1mo':
            daysBack = 365 * 10;
            break;
        }
        
        const startDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString();
        
        try {
          const result = await providerManager.fetchBars(randomSymbol.symbol, intervalName, startDate, endDate);
          
          if (result.bars && result.bars.length > 0) {
            const { inserted, updated } = await storeBars(randomSymbol.stock_id, intervalName, result.bars, result.source);
            console.log(`  ✓ Filled gap: ${inserted} new, ${updated} updated`);
          }
          
          await new Promise(resolve => setTimeout(resolve, 650));
        } catch (error) {
          console.log(`  ✗ Gap fill failed: ${error.message}`);
          
          if (error.message.includes('429') || error.message.includes('rate limit')) {
            break; // Stop gap filling if rate limited
          }
        }
      }
    }
    
    if (gapsFound === 0) {
      console.log(`  ✅ No gaps found for ${randomSymbol.symbol}`);
    }
  } catch (error) {
    console.error('❌ Gap fill error:', error.message);
  }
}

async function cleanupOldData() {
  console.log('\n🧹 Cleaning up old data...');
  
  const db = getDB();
  const symbols = await getActiveSymbols();
  
  for (const interval of INTERVALS) {
    for (const { stock_id, symbol } of symbols) {
      const [rows] = await db.query(
        'SELECT COUNT(*) as count FROM candles WHERE stock_id = ? AND interval_type = ?',
        [stock_id, interval.name]
      );
      
      const count = rows[0].count;
      
      if (count > MAX_CANDLES) {
        const toDelete = count - MAX_CANDLES;
        await db.query(
          `DELETE FROM candles 
           WHERE stock_id = ? AND interval_type = ? 
           ORDER BY ts ASC 
           LIMIT ?`,
          [stock_id, interval.name, toDelete]
        );
        console.log(`  ✓ ${symbol} ${interval.name}: Removed ${toDelete} old candles`);
      }
    }
  }
}

// ===== SCHEDULER =====

function startCollector() {
  if (!COLLECTION_ENABLED) {
    console.log('⚠️  Data collection is DISABLED');
    return;
  }
  
  console.log('\n📅 Scheduling collection jobs...\n');
  
  // MODE A: Scheduled interval collection (cron)
  console.log('🔄 Cron-based collection:');
  INTERVALS.forEach(interval => {
    // Primary collection attempt
    cron.schedule(interval.cron, () => {
      debugLog(`🔔 CRON FIRED: ${interval.name} at ${new Date().toLocaleTimeString()}`);
      collectInterval(interval.name).catch(err => {
        debugLog(`❌ Collection error for ${interval.name}: ${err.message}`);
        console.error(`❌ Collection error for ${interval.name}:`, err.message);
      });
    }, {
      scheduled: true,
      timezone: "America/New_York"
    });
    console.log(`  ✓ ${interval.name}: ${interval.cron}`);
    
    // Retry collection (1 minute later) for 5m+ intervals
    if (interval.retryCron) {
      cron.schedule(interval.retryCron, () => {
        debugLog(`🔔 RETRY CRON FIRED: ${interval.name} at ${new Date().toLocaleTimeString()}`);
        collectInterval(interval.name).catch(err => {
          debugLog(`❌ Retry collection error for ${interval.name}: ${err.message}`);
          console.error(`❌ Retry collection error for ${interval.name}:`, err.message);
        });
      }, {
        scheduled: true,
        timezone: "America/New_York"
      });
      console.log(`    ↳ Retry: ${interval.retryCron}`);
    }
  });
  
  // MODE B + C: Queue processor (handles manual triggers and new symbol auto-collection)
  // Runs every minute to check for queued symbols
  console.log('\n📥 Queue processor:');
  cron.schedule('* * * * *', () => {
    debugLog(`🔔 QUEUE CRON FIRED at ${new Date().toLocaleTimeString()}`);
    processCollectionQueue().catch(err => {
      debugLog(`❌ Queue processing error: ${err.message}`);
      console.error('❌ Queue processing error:', err.message);
    });
  }, {
    scheduled: true,
    timezone: "America/New_York"
  });
  console.log('  ✓ Queue: * * * * * (every minute)');
  
  // Gap filling - random check every 30 minutes
  console.log('\n🔧 Gap filling:');
  cron.schedule('*/30 * * * *', () => {
    console.log(`🔔 GAP FILL CRON FIRED at ${new Date().toLocaleTimeString()}`);
    fillGaps().catch(err => {
      console.error('❌ Gap fill error:', err.message);
    });
  }, {
    scheduled: true,
    timezone: "America/New_York"
  });
  console.log('  ✓ Gap fill: */30 * * * * (every 30 minutes)');
  
  // Cleanup job (daily at 3 AM)
  console.log('\n🧹 Cleanup:');
  cron.schedule('0 3 * * *', () => {
    console.log(`🔔 CLEANUP CRON FIRED at ${new Date().toLocaleTimeString()}`);
    cleanupOldData().catch(err => {
      console.error('❌ Cleanup error:', err.message);
    });
  }, {
    scheduled: true,
    timezone: "America/New_York"
  });
  console.log('  ✓ Cleanup: 0 3 * * * (daily at 3 AM)');
  
  console.log('\n✅ Collector started with 3 modes:');
  console.log('   A) Cron schedules - automatic interval collection');
  console.log('   B) Manual triggers - POST /collect/:symbol');
  console.log('   C) Auto-detect - new symbols queued via API');
  console.log('   + Gap filling - random periodic checks\n');
}

// ===== STARTUP =====

async function startApp() {
  try {
    console.log('\n╔═══════════════════════════════════════════════╗');
    console.log('║   📊 STOCK DATA SERVER + COLLECTOR v3.0      ║');
    console.log('╚═══════════════════════════════════════════════╝\n');
    
    await initDB();
    console.log('✅ Database connected');
    
    await providerManager.initialize();
    
    // Start API server
    app.listen(PORT, () => {
      console.log(`✅ API server running on http://localhost:${PORT}`);
      console.log(`   Health: http://localhost:${PORT}/health`);
      console.log(`   Symbols: http://localhost:${PORT}/symbols`);
      console.log(`   Stats: http://localhost:${PORT}/stats`);
      console.log(`   API: http://localhost:${PORT}/api/stock/AAPL?interval=1d`);
    });
    
    // Start collector
    startCollector();
    
    console.log('\n✨ System ready! Press Ctrl+C to stop\n');
  } catch (error) {
    console.error('❌ Failed to start:', error.message);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n\n⏹️  Shutting down...');
  await closeDB();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n\n⏹️  Shutting down...');
  await closeDB();
  process.exit(0);
});

startApp();

module.exports = app;
