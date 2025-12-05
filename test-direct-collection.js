// Direct test of the collection flow
const mysql = require('mysql2/promise');
const { initDB, getDB } = require('./config/database');
const providerManager = require('./src/providers/ProviderManager');

async function testDirectCollection() {
  console.log('\n=== DIRECT COLLECTION TEST ===\n');
  
  // Initialize database
  await initDB();
  console.log('✅ Database initialized');
  
  // Initialize provider
  await providerManager.initialize();
  console.log('✅ Provider initialized');
  
  // Test the exact flow
  const symbol = 'AAPL';
  const interval = '5m';
  
  console.log(`\n1. Get stock_id for ${symbol}:`);
  const db = getDB();
  const [rows] = await db.query('SELECT stock_id FROM stocks WHERE symbol = ?', [symbol]);
  if (rows.length === 0) {
    console.log(`  ❌ ${symbol} not found in database`);
    process.exit(1);
  }
  const stockId = rows[0].stock_id;
  console.log(`  ✅ stock_id = ${stockId}`);
  
  console.log(`\n2. Fetch bars from Alpaca:`);
  const endDate = new Date().toISOString();
  const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  console.log(`  Date range: ${startDate} to ${endDate}`);
  
  try {
    const result = await providerManager.fetchBars(symbol, interval, startDate, endDate);
    console.log(`  ✅ Received: ${result.bars.length} bars from ${result.source}`);
    console.log(`  Latest bar: ${result.bars[result.bars.length - 1].t}`);
    
    console.log(`\n3. Store bars in database:`);
    let inserted = 0;
    let updated = 0;
    
    for (const bar of result.bars) {
      const ts = Math.floor(new Date(bar.t).getTime() / 1000);
      
      const [insertResult] = await db.query(
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
        [stockId, interval, ts, bar.o, bar.h, bar.l, bar.c, bar.v, bar.vw || null, bar.n || null, result.source]
      );
      
      if (insertResult.affectedRows === 1) inserted++;
      else if (insertResult.affectedRows === 2) updated++;
    }
    
    console.log(`  ✅ Inserted: ${inserted}, Updated: ${updated}`);
    
    console.log(`\n4. Verify data in database:`);
    const [check] = await db.query(`
      SELECT FROM_UNIXTIME(MAX(ts)) as latest, COUNT(*) as count
      FROM candles
      WHERE stock_id = ? AND interval_type = ?
    `, [stockId, interval]);
    
    console.log(`  Total ${interval} bars: ${check[0].count}`);
    console.log(`  Latest timestamp: ${check[0].latest}`);
    
    console.log(`\n✅ SUCCESS: Collection completed successfully!`);
    
  } catch (error) {
    console.log(`  ❌ Error: ${error.message}`);
    console.error(error);
  }
  
  process.exit(0);
}

testDirectCollection().catch(console.error);
