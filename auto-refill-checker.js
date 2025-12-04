/**
 * AUTO REFILL CHECKER
 * 
 * Periodically checks for symbols with low bar counts and automatically refills them.
 * Runs every 6 hours to ensure all symbols maintain adequate historical data.
 */

require('dotenv').config();
const mysql = require('mysql2/promise');
const axios = require('axios');
const cron = require('node-cron');

const ALPACA_CONFIG = {
  baseURL: process.env.ALPACA_BASE_URL || 'https://data.alpaca.markets',
  headers: {
    'APCA-API-KEY-ID': process.env.ALPACA_API_KEY,
    'APCA-API-SECRET-KEY': process.env.ALPACA_API_SECRET
  }
};

const MIN_BARS_THRESHOLD = 100; // Refill symbols with fewer than this many bars
const CHECK_INTERVAL = '0 */6 * * *'; // Run every 6 hours

async function refillSymbolData(conn, symbol, stockId) {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setFullYear(startDate.getFullYear() - 3); // Get 3 years of data (~600 trading days)
  
  // Normalize symbol: convert hyphens to dots (e.g., BRK-B -> BRK.B)
  const normalizedSymbol = symbol.replace(/-/g, '.');
  
  try {
    const response = await axios.get(
      `${ALPACA_CONFIG.baseURL}/v2/stocks/bars`,
      {
        headers: ALPACA_CONFIG.headers,
        params: {
          symbols: normalizedSymbol,
          timeframe: '1Day',
          start: startDate.toISOString().split('T')[0],
          end: endDate.toISOString().split('T')[0],
          adjustment: 'split',
          feed: 'iex'
        },
        timeout: 10000
      }
    );
    
    const bars = response.data.bars?.[normalizedSymbol];
    if (!bars || bars.length === 0) {
      console.log(`  ⚠️  No data available for ${symbol}`);
      return 0;
    }
    
    // Delete existing bars
    await conn.execute(
      'DELETE FROM candles WHERE stock_id = ? AND interval_type = ?',
      [stockId, '1d']
    );
    
    // Insert new bars
    let inserted = 0;
    for (const bar of bars) {
      const ts = Math.floor(new Date(bar.t).getTime() / 1000);
      await conn.execute(
        `INSERT IGNORE INTO candles 
         (stock_id, interval_type, ts, open, high, low, close, volume, vwap, trade_count, data_source)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'alpaca')`,
        [stockId, '1d', ts, bar.o, bar.h, bar.l, bar.c, bar.v, bar.vw || 0, bar.n || 0]
      );
      inserted++;
    }
    
    console.log(`  ✓ ${symbol}: ${inserted} bars inserted`);
    return inserted;
    
  } catch (error) {
    console.log(`  ✗ ${symbol}: ${error.message}`);
    return 0;
  }
}

async function checkAndRefill() {
  console.log(`\n🔍 [${new Date().toISOString()}] Running auto-refill check...`);
  
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || 'password',
    database: process.env.DB_NAME || 'STOCKSENTIMENT'
  });
  
  try {
    // Find symbols with low bar counts
    const [symbols] = await conn.execute(`
      SELECT s.stock_id, s.symbol, COUNT(c.ts) as bars
      FROM stocks s
      LEFT JOIN candles c ON s.stock_id = c.stock_id AND c.interval_type = '1d'
      WHERE s.is_active = TRUE
      GROUP BY s.stock_id, s.symbol
      HAVING bars < ?
      ORDER BY bars ASC, s.symbol
    `, [MIN_BARS_THRESHOLD]);
    
    if (symbols.length === 0) {
      console.log('✅ All symbols have adequate data (>= ' + MIN_BARS_THRESHOLD + ' bars)');
      await conn.end();
      return;
    }
    
    console.log(`📋 Found ${symbols.length} symbols needing refill:`);
    symbols.forEach(s => console.log(`   ${s.symbol}: ${s.bars} bars`));
    console.log('');
    
    let totalBars = 0;
    let successCount = 0;
    
    for (let i = 0; i < symbols.length; i++) {
      const sym = symbols[i];
      console.log(`[${i + 1}/${symbols.length}] ${sym.symbol}`);
      
      const bars = await refillSymbolData(conn, sym.symbol, sym.stock_id);
      if (bars > 0) {
        totalBars += bars;
        successCount++;
      }
      
      // Rate limiting: wait 200ms between requests
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    console.log(`\n✅ Refill complete!`);
    console.log(`   Symbols processed: ${symbols.length}`);
    console.log(`   Successful: ${successCount}`);
    console.log(`   Failed: ${symbols.length - successCount}`);
    console.log(`   Total bars inserted: ${totalBars}`);
    
  } catch (error) {
    console.error('❌ Error during refill check:', error.message);
  } finally {
    await conn.end();
  }
}

// Run immediately on startup
console.log('🚀 Auto-refill checker started');
console.log(`   Schedule: Every 6 hours`);
console.log(`   Threshold: < ${MIN_BARS_THRESHOLD} bars`);
console.log('');

checkAndRefill().then(() => {
  console.log('\n⏰ Next check in 6 hours...');
  
  // Schedule periodic checks
  cron.schedule(CHECK_INTERVAL, () => {
    checkAndRefill();
  });
}).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

// Keep process alive
process.on('SIGINT', () => {
  console.log('\n👋 Auto-refill checker stopped');
  process.exit(0);
});
