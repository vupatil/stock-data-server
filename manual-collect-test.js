/**
 * MANUAL QUEUE TEST - Force collect AAPL
 */

require('dotenv').config();
const { initDB, getDB, closeDB } = require('./config/database');
const providerManager = require('./src/providers/ProviderManager');

async function manualCollect() {
  try {
    console.log('\n🔄 MANUAL COLLECTION TEST FOR AAPL\n');
    
    await initDB();
    await providerManager.initialize();
    
    const db = getDB();
    const symbol = 'AAPL';
    const intervalName = '1d';
    
    // Step 1: Get stock_id
    console.log('1️⃣  Getting stock_id for AAPL...');
    const [stocks] = await db.query('SELECT stock_id FROM stocks WHERE symbol = ?', [symbol]);
    
    if (stocks.length === 0) {
      console.log('   ❌ AAPL not found!');
      return;
    }
    
    const stockId = stocks[0].stock_id;
    console.log(`   ✅ stock_id: ${stockId}`);
    
    // Step 2: Fetch from provider
    console.log('\n2️⃣  Fetching data from provider...');
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - 365 * 2.5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    console.log(`   Period: ${startDate} to ${endDate}`);
    
    const result = await providerManager.fetchBars(symbol, intervalName, startDate, endDate);
    
    if (!result.bars || result.bars.length === 0) {
      console.log('   ❌ No bars returned!');
      return;
    }
    
    console.log(`   ✅ Fetched ${result.bars.length} bars from ${result.source}`);
    const latest = result.bars[result.bars.length - 1];
    console.log(`   Latest: ${latest.t} - Close: $${latest.c}`);
    
    // Step 3: Store in database
    console.log('\n3️⃣  Storing bars in database...');
    
    let inserted = 0;
    let updated = 0;
    let errors = 0;
    
    for (const bar of result.bars) {
      try {
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
          [stockId, intervalName, ts, bar.o, bar.h, bar.l, bar.c, bar.v, bar.vw || null, bar.n || null, result.source]
        );
        
        if (insertResult.affectedRows === 1) inserted++;
        else if (insertResult.affectedRows === 2) updated++;
        
      } catch (error) {
        errors++;
        console.log(`   ❌ Error storing bar ${bar.t}: ${error.message}`);
      }
    }
    
    console.log(`   ✅ Inserted: ${inserted}`);
    console.log(`   ✅ Updated: ${updated}`);
    if (errors > 0) console.log(`   ❌ Errors: ${errors}`);
    
    // Step 4: Verify stored data
    console.log('\n4️⃣  Verifying stored data...');
    const [count] = await db.query(
      'SELECT COUNT(*) as count FROM candles WHERE stock_id = ? AND interval_type = ?',
      [stockId, intervalName]
    );
    
    console.log(`   Total bars in DB: ${count[0].count}`);
    
    const [latestBar] = await db.query(
      'SELECT * FROM candles WHERE stock_id = ? AND interval_type = ? ORDER BY ts DESC LIMIT 1',
      [stockId, intervalName]
    );
    
    if (latestBar.length > 0) {
      const bar = latestBar[0];
      const barDate = new Date(bar.ts * 1000);
      const ageMinutes = (Date.now() / 1000 - bar.ts) / 60;
      
      console.log(`   Latest bar in DB:`);
      console.log(`      Date: ${barDate.toISOString()}`);
      console.log(`      Close: $${bar.close}`);
      console.log(`      Age: ${Math.floor(ageMinutes)} minutes`);
      console.log(`      Source: ${bar.data_source}`);
    }
    
    console.log('\n✅ Manual collection complete!\n');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error);
  } finally {
    await closeDB();
  }
}

manualCollect();
