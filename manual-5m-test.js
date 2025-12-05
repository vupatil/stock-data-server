const { initDB, getDB } = require('./config/database');
const providerManager = require('./src/providers/ProviderManager');

(async () => {
  try {
    console.log('\n🔧 MANUAL 5m COLLECTION TEST\n');
    
    await initDB();
    await providerManager.initialize();
    
    const db = getDB();
    
    // Get AAPL stock_id
    const [stocks] = await db.query('SELECT stock_id, symbol FROM stocks WHERE symbol = ?', ['AAPL']);
    if (stocks.length === 0) {
      console.log('❌ AAPL not found in database');
      process.exit(1);
    }
    
    const stockId = stocks[0].stock_id;
    console.log(`✅ Found AAPL (stock_id: ${stockId})`);
    
    // Check current data
    const [before] = await db.query(
      'SELECT ts, close, volume FROM candles WHERE stock_id = ? AND interval_type = ? ORDER BY ts DESC LIMIT 1',
      [stockId, '5m']
    );
    
    if (before.length > 0) {
      const age = Math.floor((Date.now() / 1000 - before[0].ts) / 60);
      console.log(`\n📊 BEFORE Collection:`);
      console.log(`   Latest bar: ${new Date(before[0].ts * 1000).toLocaleString()}`);
      console.log(`   Age: ${age} minutes`);
      console.log(`   Close: $${before[0].close}`);
    }
    
    // Fetch fresh data from Alpaca
    console.log(`\n🔄 Fetching latest 5m bars from Alpaca...`);
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 24 * 60 * 60 * 1000); // Last 24 hours
    
    const response = await providerManager.fetchBars(
      'AAPL',
      '5Min',
      startDate,
      endDate,
      false
    );
    
    if (!response || !response.bars || response.bars.length === 0) {
      console.log('❌ No data returned from provider');
      console.log('Response:', JSON.stringify(response, null, 2));
      process.exit(1);
    }
    
    const bars = response.bars;
    console.log(`✅ Received ${bars.length} bars from Alpaca`);
    
    // Show latest bar from Alpaca
    const latestBar = bars[bars.length - 1];
    console.log(`\n📈 Latest bar from Alpaca:`);
    console.log(`   Time: ${latestBar.t}`);
    console.log(`   Close: $${latestBar.c}`);
    console.log(`   Volume: ${latestBar.v.toLocaleString()}`);
    
    // Insert into database
    console.log(`\n💾 Inserting ${bars.length} bars into database...`);
    let insertCount = 0;
    let updateCount = 0;
    
    for (const bar of bars) {
      const timestamp = Math.floor(new Date(bar.t).getTime() / 1000);
      
      const [result] = await db.query(`
        INSERT INTO candles (stock_id, interval_type, ts, open, high, low, close, volume, vwap, trade_count, data_source)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          open = VALUES(open),
          high = VALUES(high),
          low = VALUES(low),
          close = VALUES(close),
          volume = VALUES(volume),
          vwap = VALUES(vwap),
          trade_count = VALUES(trade_count),
          data_source = VALUES(data_source)
      `, [
        stockId,
        '5m',
        timestamp,
        bar.o,
        bar.h,
        bar.l,
        bar.c,
        bar.v,
        bar.vw || null,
        bar.n || null,
        'Alpaca'
      ]);
      
      if (result.affectedRows === 1) {
        insertCount++;
      } else if (result.affectedRows === 2) {
        updateCount++;
      }
    }
    
    console.log(`✅ Inserted: ${insertCount}, Updated: ${updateCount}`);
    
    // Check after
    const [after] = await db.query(
      'SELECT ts, close, volume FROM candles WHERE stock_id = ? AND interval_type = ? ORDER BY ts DESC LIMIT 1',
      [stockId, '5m']
    );
    
    if (after.length > 0) {
      const age = Math.floor((Date.now() / 1000 - after[0].ts) / 60);
      console.log(`\n📊 AFTER Collection:`);
      console.log(`   Latest bar: ${new Date(after[0].ts * 1000).toLocaleString()}`);
      console.log(`   Age: ${age} minutes`);
      console.log(`   Close: $${after[0].close}`);
      console.log(`   Status: ${age <= 10 ? '✅ FRESH!' : '⚠️ STALE'}`);
    }
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
})();
