/**
 * DEBUG: Check queue processing and data collection
 */

require('dotenv').config();
const { initDB, getDB, closeDB } = require('./config/database');
const providerManager = require('./src/providers/ProviderManager');

async function debugQueueFlow() {
  try {
    console.log('\n🔍 DEBUGGING QUEUE PROCESSING FLOW\n');
    
    await initDB();
    const db = getDB();
    
    // Step 1: Check if AAPL exists in database
    console.log('1️⃣  Checking AAPL in stocks table...');
    const [stocks] = await db.query('SELECT * FROM stocks WHERE symbol = ?', ['AAPL']);
    
    if (stocks.length === 0) {
      console.log('   ❌ AAPL not found in stocks table!');
      return;
    }
    
    console.log(`   ✅ Found: stock_id=${stocks[0].stock_id}, is_active=${stocks[0].is_active}`);
    const stockId = stocks[0].stock_id;
    
    // Step 2: Check latest data in candles
    console.log('\n2️⃣  Checking latest data for AAPL (1d interval)...');
    const [candles] = await db.query(
      'SELECT * FROM candles WHERE stock_id = ? AND interval_type = ? ORDER BY ts DESC LIMIT 1',
      [stockId, '1d']
    );
    
    if (candles.length === 0) {
      console.log('   ❌ No data found in candles table!');
    } else {
      const latest = candles[0];
      const latestDate = new Date(latest.ts * 1000);
      const ageMinutes = (Date.now() / 1000 - latest.ts) / 60;
      
      console.log(`   📊 Latest bar:`);
      console.log(`      Date: ${latestDate.toISOString()}`);
      console.log(`      Age: ${Math.floor(ageMinutes)} minutes`);
      console.log(`      Close: $${latest.close}`);
      console.log(`      Source: ${latest.data_source}`);
      
      if (ageMinutes > 5) {
        console.log(`   ⚠️  Data is STALE (>${parseInt(process.env.DATA_STALE_MINUTES || 5)} minutes old)`);
      } else {
        console.log(`   ✅ Data is fresh`);
      }
    }
    
    // Step 3: Count total bars for AAPL 1d
    console.log('\n3️⃣  Counting total bars for AAPL (1d)...');
    const [count] = await db.query(
      'SELECT COUNT(*) as count FROM candles WHERE stock_id = ? AND interval_type = ?',
      [stockId, '1d']
    );
    console.log(`   📈 Total bars: ${count[0].count}`);
    
    // Step 4: Initialize provider and test fetch
    console.log('\n4️⃣  Testing provider fetch...');
    await providerManager.initialize();
    const providers = providerManager.getActiveProviders();
    console.log(`   Providers: ${providers.join(', ')}`);
    
    // Step 5: Simulate queue processing
    console.log('\n5️⃣  Simulating queue collection for AAPL...');
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - 365 * 2.5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    console.log(`   Period: ${startDate} to ${endDate}`);
    
    try {
      const result = await providerManager.fetchBars('AAPL', '1d', startDate, endDate);
      
      if (result.bars && Array.isArray(result.bars)) {
        console.log(`   ✅ Fetched ${result.bars.length} bars from ${result.source}`);
        
        if (result.bars.length > 0) {
          const latest = result.bars[result.bars.length - 1];
          console.log(`   Latest bar: ${latest.t} - Close: $${latest.c}`);
        }
      } else {
        console.log(`   ❌ Invalid response format`);
      }
    } catch (error) {
      console.log(`   ❌ Fetch failed: ${error.message}`);
    }
    
    // Step 6: Test batch fetch
    console.log('\n6️⃣  Testing BATCH fetch (AAPL,MSFT,GOOGL)...');
    
    try {
      const batchResult = await providerManager.fetchBars('AAPL,MSFT,GOOGL', '1d', startDate, endDate);
      
      if (batchResult.bars && typeof batchResult.bars === 'object') {
        console.log(`   ✅ Batch response received from ${batchResult.source}`);
        
        for (const [symbol, bars] of Object.entries(batchResult.bars)) {
          if (bars && bars.length > 0) {
            console.log(`      ${symbol}: ${bars.length} bars`);
          } else {
            console.log(`      ${symbol}: No data`);
          }
        }
      } else {
        console.log(`   ❌ Invalid batch response format`);
        console.log(`   Response:`, JSON.stringify(batchResult, null, 2));
      }
    } catch (error) {
      console.log(`   ❌ Batch fetch failed: ${error.message}`);
    }
    
    // Step 7: Check collection log
    console.log('\n7️⃣  Checking recent collection logs...');
    const [logs] = await db.query(
      'SELECT * FROM data_collection_log ORDER BY started_at DESC LIMIT 5'
    );
    
    if (logs.length === 0) {
      console.log('   ⚠️  No collection logs found');
    } else {
      console.log(`   📝 Last ${logs.length} collections:`);
      logs.forEach(log => {
        const duration = log.completed_at ? 
          Math.round((new Date(log.completed_at) - new Date(log.started_at)) / 1000) : 
          'N/A';
        console.log(`      ${log.job_type} ${log.interval_type || ''}: ${log.status} (${duration}s)`);
      });
    }
    
    console.log('\n✅ Debug complete\n');
    
  } catch (error) {
    console.error('\n❌ Debug error:', error.message);
    console.error(error);
  } finally {
    await closeDB();
  }
}

debugQueueFlow();
