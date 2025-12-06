/**
 * STOCK DATA COLLECTOR
 * 
 * Fetches stock data from Alpaca API for multiple intervals and stores in MySQL
 * - Collects each interval directly (no aggregation)
 * - Smart scheduling (fetch when candle completes)
 * - Automatic gap detection and filling
 * - Cleanup old data beyond MAX_CANDLES limit
 */

const axios = require('axios');
const cron = require('node-cron');
const { initDB, getDB, closeDB } = require('./config/database');
const { processBatchedSymbols, ALPACA_BATCH_SIZE } = require('./src/utils/batchProcessor');
require('dotenv').config();

// ===== CONFIGURATION =====

const ALPACA_CONFIG = {
  baseURL: process.env.ALPACA_BASE_URL || 'https://data.alpaca.markets',
  headers: {
    'APCA-API-KEY-ID': process.env.ALPACA_API_KEY,
    'APCA-API-SECRET-KEY': process.env.ALPACA_API_SECRET
  }
};

// Load symbols and filter out excluded ones
async function getValidSymbols() {
  const configSymbols = process.env.STOCK_SYMBOLS 
    ? process.env.STOCK_SYMBOLS.split(',').map(s => s.trim())
    : ['AAPL', 'TSLA', 'MSFT', 'GOOGL', 'AMZN'];
  
  try {
    const db = getDB();
    
    // Get excluded symbols (that haven't reached retry_after date)
    const [excluded] = await db.query(`
      SELECT symbol FROM excluded_symbols 
      WHERE retry_after IS NULL OR retry_after > NOW()
    `);
    
    const excludedSet = new Set(excluded.map(row => row.symbol));
    const validSymbols = configSymbols.filter(s => !excludedSet.has(s));
    
    if (excludedSet.size > 0) {
      console.log(`⚠️  Excluding ${excludedSet.size} invalid symbols from collection`);
    }
    
    return validSymbols;
  } catch (error) {
    // If DB not ready or table doesn't exist, return all symbols
    console.log(`⚠️  Could not check excluded symbols, using all configured symbols`);
    return configSymbols;
  }
}


const COLLECTION_ENABLED = process.env.COLLECTION_ENABLED !== 'false';
const MAX_CANDLES = parseInt(process.env.MAX_CANDLES_PER_INTERVAL) || 600;
const EXTENDED_HOURS = process.env.EXTENDED_HOURS_COLLECTION === 'true';
const GAP_FILL_PRIORITY = process.env.GAP_FILL_PRIORITY 
  ? process.env.GAP_FILL_PRIORITY.split(',').map(s => s.trim())
  : ['1d', '1w', '1mo', '4h', '2h', '1h', '30m', '15m', '5m', '2m', '1m'];

// All supported intervals with Alpaca mapping and cron schedules
const INTERVALS = [
  { name: '1m', cron: '* * * * *', alpaca: '1Min', minutes: 1 },
  { name: '2m', cron: '*/2 * * * *', alpaca: '2Min', minutes: 2 },
  { name: '5m', cron: '*/5 * * * *', alpaca: '5Min', minutes: 5 },
  { name: '15m', cron: '*/15 * * * *', alpaca: '15Min', minutes: 15 },
  { name: '30m', cron: '*/30 * * * *', alpaca: '30Min', minutes: 30 },
  { name: '1h', cron: '0 * * * *', alpaca: '1Hour', minutes: 60 },
  { name: '2h', cron: '0 */2 * * *', alpaca: '2Hour', minutes: 120 },
  { name: '4h', cron: '0 */4 * * *', alpaca: '4Hour', minutes: 240 },
  { name: '1d', cron: '0 16 * * 1-5', alpaca: '1Day', minutes: 1440 },
  { name: '1w', cron: '0 16 * * 5', alpaca: '1Week', minutes: 10080 },
  { name: '1mo', cron: '0 16 28-31 * *', alpaca: '1Month', minutes: 43200 } // Last day check
];

// Log initial configuration (will show actual count after getValidSymbols() is called)
console.log(`\n📊 Collector starting...`);
console.log(`   Max candles per interval: ${MAX_CANDLES}`);
console.log(`   Extended hours: ${EXTENDED_HOURS ? 'Yes' : 'No'}`);

// ===== HELPER FUNCTIONS =====

async function getStockId(symbol) {
  const db = getDB();
  const [rows] = await db.query(
    'SELECT stock_id FROM stocks WHERE symbol = ?',
    [symbol]
  );
  
  if (rows.length === 0) {
    const [result] = await db.query(
      'INSERT INTO stocks (symbol) VALUES (?) ON DUPLICATE KEY UPDATE stock_id=LAST_INSERT_ID(stock_id)',
      [symbol]
    );
    return result.insertId;
  }
  
  return rows[0].stock_id;
}

async function startLog(jobType, intervalType, symbolsRequested) {
  const db = getDB();
  const [result] = await db.query(
    'INSERT INTO data_collection_log (job_type, interval_type, symbols_requested, status, started_at) VALUES (?, ?, ?, ?, NOW())',
    [jobType, intervalType, symbolsRequested, 'running']
  );
  return result.insertId;
}

async function completeLog(logId, status, symbolsProcessed, recordsInserted, recordsUpdated, errorMessage = null) {
  const db = getDB();
  await retryOnDeadlock(async () => {
    await db.query(
      `UPDATE data_collection_log 
       SET status = ?, symbols_processed = ?, records_inserted = ?, records_updated = ?, 
           completed_at = NOW(), duration_ms = TIMESTAMPDIFF(MICROSECOND, started_at, NOW()) / 1000, 
           error_message = ?
       WHERE log_id = ?`,
      [status, symbolsProcessed, recordsInserted, recordsUpdated, errorMessage, logId]
    );
  });
}

// ===== ALPACA API FUNCTIONS =====

async function fetchAlpacaBars(symbols, start, end, timeframe) {
  try {
    const params = {
      symbols: symbols.join(','),
      timeframe: timeframe,
      start: start.toISOString(),
      end: end.toISOString(),
      limit: 10000,
      adjustment: 'split',
      feed: EXTENDED_HOURS ? 'sip' : 'iex' // SIP includes extended hours
    };

    const response = await axios.get('/v2/stocks/bars', {
      baseURL: ALPACA_CONFIG.baseURL,
      headers: ALPACA_CONFIG.headers,
      params,
      timeout: 30000
    });

    return response.data.bars || {};
  } catch (error) {
    console.error('❌ Alpaca API error:', error.response?.data || error.message);
    throw error;
  }
}

// ===== DATA STORAGE =====

async function retryOnDeadlock(fn, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (error.code === 'ER_LOCK_DEADLOCK' && attempt < maxRetries) {
        console.log(`   ⚠️  Deadlock detected, retry ${attempt}/${maxRetries}...`);
        await new Promise(resolve => setTimeout(resolve, 50 * attempt)); // Exponential backoff
        continue;
      }
      throw error;
    }
  }
}

async function storeBars(barsData, intervalName) {
  const db = getDB();
  let totalInserted = 0;
  
  for (const [symbol, bars] of Object.entries(barsData)) {
    if (!bars || bars.length === 0) continue;
    
    const stockId = await getStockId(symbol);
    
    const values = bars.map(bar => [
      stockId,
      intervalName,
      Math.floor(new Date(bar.t).getTime() / 1000),
      parseFloat(bar.o),
      parseFloat(bar.h),
      parseFloat(bar.l),
      parseFloat(bar.c),
      parseInt(bar.v) || 0,
      parseFloat(bar.vw) || null,
      parseInt(bar.n) || null,
      'alpaca'
    ]);
    
    await retryOnDeadlock(async () => {
      await db.query(`
        INSERT INTO candles 
          (stock_id, interval_type, ts, open, high, low, close, volume, vwap, trade_count, data_source)
        VALUES ?
        ON DUPLICATE KEY UPDATE
          open = VALUES(open),
          high = VALUES(high),
          low = VALUES(low),
          close = VALUES(close),
          volume = VALUES(volume),
          vwap = VALUES(vwap),
          trade_count = VALUES(trade_count)
      `, [values]);
    });
    
    totalInserted += values.length;
  }
  
  return totalInserted;
}

// ===== GAP DETECTION =====

async function detectGaps(symbol, intervalConfig) {
  const db = getDB();
  const stockId = await getStockId(symbol);
  
  // Get last candle timestamp
  const [lastCandle] = await db.query(
    'SELECT MAX(ts) as last_ts FROM candles WHERE stock_id = ? AND interval_type = ?',
    [stockId, intervalConfig.name]
  );
  
  if (!lastCandle || !lastCandle[0].last_ts) {
    return { hasGaps: true, gapStart: null, gapEnd: null, missingCount: MAX_CANDLES };
  }
  
  const lastTs = lastCandle[0].last_ts;
  const now = Math.floor(Date.now() / 1000);
  const intervalSeconds = intervalConfig.minutes * 60;
  
  // Calculate expected next timestamp
  const expectedNext = lastTs + intervalSeconds;
  
  // If we're more than one interval behind, we have gaps
  if (now - lastTs > intervalSeconds * 1.5) {
    const missingIntervals = Math.floor((now - expectedNext) / intervalSeconds);
    return {
      hasGaps: true,
      gapStart: new Date(expectedNext * 1000),
      gapEnd: new Date(now * 1000),
      missingCount: Math.min(missingIntervals, MAX_CANDLES),
      lastTs: new Date(lastTs * 1000)
    };
  }
  
  return { hasGaps: false };
}

// ===== CLEANUP OLD DATA =====

async function cleanupOldData(symbol, intervalName) {
  const db = getDB();
  const stockId = await getStockId(symbol);
  
  // Count current candles
  const [countResult] = await db.query(
    'SELECT COUNT(*) as count FROM candles WHERE stock_id = ? AND interval_type = ?',
    [stockId, intervalName]
  );
  
  const currentCount = countResult[0].count;
  
  if (currentCount > MAX_CANDLES) {
    const toDelete = currentCount - MAX_CANDLES;
    
    console.log(`🧹 Cleanup ${symbol} ${intervalName}:`);
    console.log(`   Current: ${currentCount} candles`);
    console.log(`   Max allowed: ${MAX_CANDLES}`);
    console.log(`   Deleting oldest: ${toDelete} candles`);
    
    // Delete oldest candles beyond limit with deadlock retry
    await retryOnDeadlock(async () => {
      await db.query(`
        DELETE FROM candles 
        WHERE stock_id = ? AND interval_type = ?
        ORDER BY ts ASC
        LIMIT ?
      `, [stockId, intervalName, toDelete]);
    });
    
    console.log(`✅ Cleanup complete: ${MAX_CANDLES} candles remaining`);
    return toDelete;
  }
  
  return 0;
}

// ===== COLLECTION JOBS =====

function isMarketHours() {
  const now = new Date();
  const etNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = etNow.getDay(); // 0=Sunday, 6=Saturday
  const hour = etNow.getHours();
  const minute = etNow.getMinutes();
  
  // Market hours: Monday-Friday, 9:30 AM - 4:00 PM ET
  if (day === 0 || day === 6) return false; // Weekend
  
  const timeInMinutes = hour * 60 + minute;
  const marketOpen = 9 * 60 + 30; // 9:30 AM
  const marketClose = 16 * 60; // 4:00 PM
  
  return timeInMinutes >= marketOpen && timeInMinutes <= marketClose;
}

async function collectInterval(intervalConfig) {
  const validSymbols = await getValidSymbols();
  const logId = await startLog(`collect_${intervalConfig.name}`, intervalConfig.name, validSymbols.length);
  
  try {
    // Skip intraday collection outside market hours
    const intradayIntervals = ['1m', '2m', '5m', '15m', '30m', '1h', '2h', '4h'];
    if (intradayIntervals.includes(intervalConfig.name) && !isMarketHours()) {
      console.log(`\n⏸️  [${new Date().toLocaleTimeString()}] Skipping ${intervalConfig.name} collection (market closed)`);
      await completeLog(logId, 'skipped', 0, 0, 0, 'Market closed');
      return 0;
    }
    
    console.log(`\n📥 [${new Date().toLocaleTimeString()}] Collecting ${intervalConfig.name} bars for ${validSymbols.length} symbols...`);
    
    // Fetch last few periods to ensure we don't miss any
    const lookbackPeriods = 10;
    const end = new Date();
    const start = new Date(end.getTime() - (lookbackPeriods * intervalConfig.minutes * 60 * 1000));
    
    let totalInserted = 0;
    let symbolsProcessed = 0;
    
    // Use centralized batch processor
    await processBatchedSymbols(
      validSymbols,
      async (batch) => {
        const barsData = await fetchAlpacaBars(batch, start, end, intervalConfig.alpaca);
        const inserted = await storeBars(barsData, intervalConfig.name);
        totalInserted += inserted;
        symbolsProcessed += Object.keys(barsData).length;
        return { success: true, processedCount: batch.length };
      },
      {
        batchSize: ALPACA_BATCH_SIZE,
        delayBetweenBatches: 500,
        silent: true
      }
    );
    
    await completeLog(logId, 'completed', symbolsProcessed, totalInserted, 0);
    
    console.log(`✅ Collected ${totalInserted} ${intervalConfig.name} bars from ${symbolsProcessed} symbols`);
    
    return totalInserted;
  } catch (error) {
    await completeLog(logId, 'failed', 0, 0, 0, error.message);
    console.error(`❌ Collection failed for ${intervalConfig.name}:`, error.message);
    return 0;
  }
}

// ===== GAP FILLING FOR ALL SYMBOLS =====

async function fillAllGaps() {
  console.log('\n🔍 Checking for gaps across all intervals...\n');
  
  const validSymbols = await getValidSymbols();
  
  // Fill in priority order (daily/weekly first, then intraday)
  for (const intervalName of GAP_FILL_PRIORITY) {
    const intervalConfig = INTERVALS.find(i => i.name === intervalName);
    if (!intervalConfig) continue;
    
    console.log(`📊 Checking ${intervalConfig.name} interval...`);
    
    // Check which symbols need data
    const symbolsNeedingData = [];
    for (const symbol of validSymbols) {
      const gapInfo = await detectGaps(symbol, intervalConfig);
      if (gapInfo.hasGaps) {
        symbolsNeedingData.push(symbol);
      }
    }
    
    if (symbolsNeedingData.length === 0) {
      console.log(`✅ ${intervalConfig.name}: No gaps found\n`);
      continue;
    }
    
    console.log(`🔍 Found ${symbolsNeedingData.length} symbols needing data`);
    console.log(`📥 Fetching in batches of ${ALPACA_BATCH_SIZE}...`);
    
    // Use centralized batch processor
    try {
      const start = new Date(Date.now() - MAX_CANDLES * intervalConfig.minutes * 60 * 1000);
      const end = new Date();
      
      let totalFilled = 0;
      let symbolsProcessed = 0;
      
      await processBatchedSymbols(
        symbolsNeedingData,
        async (batch) => {
          const barsData = await fetchAlpacaBars(batch, start, end, intervalConfig.alpaca);
          const filled = await storeBars(barsData, intervalConfig.name);
          totalFilled += filled;
          symbolsProcessed += Object.keys(barsData).length;
          return { success: true, processedCount: batch.length };
        },
        {
          batchSize: ALPACA_BATCH_SIZE,
          delayBetweenBatches: 500,
          silent: true
        }
      );
      
      console.log(`✅ ${intervalConfig.name}: Filled ${totalFilled} candles for ${symbolsProcessed} symbols\n`);
    } catch (error) {
      console.error(`❌ ${intervalConfig.name}: Batch fill failed:`, error.message);
    }
  }
}

// ===== CLEANUP ALL SYMBOLS =====

async function cleanupAllData() {
  console.log('\n🧹 Cleaning up old data...\n');
  
  const validSymbols = await getValidSymbols();
  
  for (const intervalConfig of INTERVALS) {
    let totalDeleted = 0;
    
    for (const symbol of validSymbols) {
      const deleted = await cleanupOldData(symbol, intervalConfig.name);
      totalDeleted += deleted;
    }
    
    if (totalDeleted > 0) {
      console.log(`✅ ${intervalConfig.name}: Deleted ${totalDeleted} old candles\n`);
    }
  }
}

// ===== SCHEDULER =====

function startScheduler() {
  console.log('\n⏰ Starting scheduler...\n');
  
  if (!COLLECTION_ENABLED) {
    console.log('⚠️  Collection is DISABLED (set COLLECTION_ENABLED=true to enable)');
    return;
  }
  
  // Schedule collection for each interval
  for (const intervalConfig of INTERVALS) {
    cron.schedule(intervalConfig.cron, async () => {
      await collectInterval(intervalConfig);
    });
    
    console.log(`✅ ${intervalConfig.name.padEnd(4)} - ${intervalConfig.cron}`);
  }
  
  // Cleanup old data daily at 3 AM
  cron.schedule('0 3 * * *', async () => {
    await cleanupAllData();
  });
  
  console.log(`✅ Cleanup - 0 3 * * * (3 AM daily)`);
  console.log('\n✅ All schedulers configured\n');
}

// ===== MAIN =====

async function main() {
  console.log('\n╔═══════════════════════════════════════════════╗');
  console.log('║     📊 STOCK DATA COLLECTOR v2.0             ║');
  console.log('╚═══════════════════════════════════════════════╝\n');
  
  if (!ALPACA_CONFIG.headers['APCA-API-KEY-ID']) {
    console.error('❌ ALPACA_API_KEY not configured in .env');
    console.log('\nPlease set your Alpaca API credentials:');
    console.log('  ALPACA_API_KEY=your_key');
    console.log('  ALPACA_API_SECRET=your_secret\n');
    process.exit(1);
  }
  
  await initDB();
  
  // Load valid symbols (excluding excluded_symbols)
  const validSymbols = await getValidSymbols();
  console.log(`\n📊 Collector configured for ${validSymbols.length} symbols`);
  console.log(`   Max candles per interval: ${MAX_CANDLES}`);
  console.log(`   Extended hours: ${EXTENDED_HOURS ? 'Yes' : 'No'}`);
  
  // Update SYMBOLS constant with valid symbols
  SYMBOLS.length = 0;
  SYMBOLS.push(...validSymbols);
  
  console.log('🔄 Running initial gap fill...\n');
  await fillAllGaps();
  
  console.log('\n🔄 Running initial cleanup...\n');
  await cleanupAllData();
  
  startScheduler();
  
  console.log('✅ Collector is running...\n');
  console.log('Press Ctrl+C to stop\n');
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n\n⏹️  Shutting down collector...');
  await closeDB();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n\n⏹️  Shutting down collector...');
  await closeDB();
  process.exit(0);
});

// Start
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
}

module.exports = {
  collectInterval,
  fillAllGaps,
  cleanupAllData,
  fetchAlpacaBars
};
