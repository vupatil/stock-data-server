/**
 * MANUAL COLLECTOR TRIGGER
 * Runs collection for testing without waiting for cron
 */

require('dotenv').config();
const { initDB, getDB, closeDB } = require('./config/database');
const providerManager = require('./src/providers/ProviderManager');

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

async function manualCollection() {
  console.log('\n🔄 MANUAL COLLECTION TRIGGER\n');
  console.log('=' .repeat(60));
  
  try {
    await initDB();
    await providerManager.initialize();
    
    const db = getDB();
    
    // Allow filtering by specific symbols from command line args
    const filterSymbols = process.argv.slice(2).map(s => s.toUpperCase());
    let query = 'SELECT stock_id, symbol FROM stocks WHERE is_active = TRUE';
    let params = [];
    
    if (filterSymbols.length > 0) {
      query += ' AND symbol IN (' + filterSymbols.map(() => '?').join(',') + ')';
      params = filterSymbols;
      console.log(`Filtering for specific symbols: ${filterSymbols.join(', ')}\n`);
    }
    
    query += ' ORDER BY symbol';
    
    const [symbols] = await db.query(query, params);
    
    console.log(`Found ${symbols.length} active symbols\n`);
    
    const intervals = ['1d', '1w', '1mo']; // Collect multiple intervals
    const endDate = new Date().toISOString().split('T')[0];
    
    // Date ranges per interval
    const intervalRanges = {
      '1m': 5,
      '2m': 5,
      '5m': 30,
      '15m': 60,
      '30m': 60,
      '1h': 180,
      '2h': 180,
      '4h': 180,
      '1d': Math.floor(365 * 2.5),  // 2.5 years (~630 bars)
      '1w': 365 * 5,  // 5 years
      '1mo': 365 * 10 // 10 years
    };
    
    for (const interval of intervals) {
      const daysBack = intervalRanges[interval] || 365;
      const startDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      
      console.log(`\n📊 Collecting ${interval} data (${startDate} to ${endDate})...`);
      console.log('─'.repeat(60));
      
      for (const { stock_id, symbol } of symbols) {
        try {
          const result = await providerManager.fetchBars(symbol, interval, startDate, endDate);
          
          if (result.bars && result.bars.length > 0) {
            const { inserted, updated } = await storeBars(stock_id, interval, result.bars, result.source);
            console.log(`  ✓ ${symbol}: ${inserted} new, ${updated} updated (${result.source})`);
          } else {
            console.log(`  ⚠️  ${symbol}: No data returned`);
          }
        } catch (error) {
          console.log(`  ✗ ${symbol}: ${error.message}`);
        }
      }
    }
    
    console.log('\n' + '=' .repeat(60));
    console.log('✅ Collection completed!\n');
    
  } catch (error) {
    console.error('❌ Collection failed:', error.message);
    process.exit(1);
  } finally {
    await closeDB();
  }
}

manualCollection();
