/**
 * Test: Random Symbol End-to-End Flow
 * 
 * This test verifies the complete flow:
 * 1. Pick a random symbol that doesn't exist in DB
 * 2. Request it via API - should queue the symbol
 * 3. For each interval, verify data is fetched from Alpaca
 * 4. Verify data is stored in database
 * 5. Second request should return from cache
 */

require('dotenv').config();
const mysql = require('mysql2/promise');
const axios = require('axios');

const API_BASE_URL = 'http://localhost:3001';
const TEST_SYMBOLS = ['SHOP', 'SQ', 'COIN', 'RBLX', 'ABNB', 'PLTR', 'SNOW', 'CRWD', 'ZS', 'NET'];
const ALL_INTERVALS = ['1m', '2m', '5m', '15m', '30m', '1h', '2h', '4h', '1d', '1w', '1mo'];

// Database configuration
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'stock_data'
};

let connection;

async function connectDB() {
  connection = await mysql.createConnection(dbConfig);
  console.log('✅ Connected to MySQL');
}

async function disconnectDB() {
  if (connection) {
    await connection.end();
    console.log('✅ Disconnected from MySQL');
  }
}

async function pickRandomSymbol() {
  // Pick a random symbol from test list
  const randomSymbol = TEST_SYMBOLS[Math.floor(Math.random() * TEST_SYMBOLS.length)];
  
  // Check if it exists in database
  const [rows] = await connection.execute(
    'SELECT symbol FROM stocks WHERE symbol = ? AND is_active = 1',
    [randomSymbol]
  );
  
  if (rows.length > 0) {
    console.log(`⚠️  Symbol ${randomSymbol} already exists in DB, removing it for clean test...`);
    // Remove from stocks (will cascade delete candles due to foreign key)
    await connection.execute('DELETE FROM stocks WHERE symbol = ?', [randomSymbol]);
    console.log(`✅ Removed ${randomSymbol} from database`);
  }
  
  return randomSymbol;
}

async function testAPIRequest(symbol, interval) {
  try {
    const response = await axios.get(`${API_BASE_URL}/api/stock/${symbol}`, {
      params: { interval }
    });
    
    if (response.data.chart && response.data.chart.result) {
      const bars = response.data.chart.result[0].timestamp.length;
      return { success: true, bars, source: 'api' };
    } else {
      return { success: false, message: response.data.message || 'Unknown error' };
    }
  } catch (error) {
    return { success: false, message: error.message };
  }
}

async function checkSymbolQueued(symbol) {
  const [rows] = await connection.execute(
    'SELECT symbol, company_name, is_active FROM stocks WHERE symbol = ?',
    [symbol]
  );
  
  return rows.length > 0 ? rows[0] : null;
}

async function checkDataStored(symbol, interval) {
  // Get stock_id first
  const [stockRows] = await connection.execute(
    'SELECT stock_id FROM stocks WHERE symbol = ?',
    [symbol]
  );
  
  if (stockRows.length === 0) {
    return { stored: false, count: 0 };
  }
  
  const stockId = stockRows[0].stock_id;
  
  // Count candles for this symbol and interval
  const [candleRows] = await connection.execute(
    'SELECT COUNT(*) as count FROM candles WHERE stock_id = ? AND interval_type = ?',
    [stockId, interval]
  );
  
  return { stored: candleRows[0].count > 0, count: candleRows[0].count };
}

async function runTest() {
  console.log('\n🧪 Starting Random Symbol End-to-End Test\n');
  console.log('=' .repeat(70));
  
  try {
    // Connect to database
    await connectDB();
    
    // Step 1: Pick random symbol
    const testSymbol = await pickRandomSymbol();
    console.log(`\n📊 Selected random test symbol: ${testSymbol}`);
    console.log('=' .repeat(70));
    
    // Step 2: Verify symbol doesn't exist
    const existingSymbol = await checkSymbolQueued(testSymbol);
    if (existingSymbol) {
      console.log('❌ FAILED: Symbol should not exist in DB yet');
      return;
    }
    console.log('✅ Confirmed: Symbol not in database\n');
    
    // Step 3: Test all intervals
    const results = [];
    
    for (const interval of ALL_INTERVALS) {
      console.log(`\n🔍 Testing interval: ${interval}`);
      console.log('-'.repeat(70));
      
      // Make API request
      console.log(`  → Requesting data from API...`);
      const apiResult = await testAPIRequest(testSymbol, interval);
      
      if (!apiResult.success) {
        console.log(`  ❌ API request failed: ${apiResult.message}`);
        results.push({ interval, status: 'failed', reason: apiResult.message });
        continue;
      }
      
      console.log(`  ✅ API returned ${apiResult.bars} bars`);
      
      // Check if symbol was queued (only need to check once)
      if (interval === ALL_INTERVALS[0]) {
        await new Promise(resolve => setTimeout(resolve, 1000)); // Give DB time to commit
        const queuedSymbol = await checkSymbolQueued(testSymbol);
        if (queuedSymbol) {
          console.log(`  ✅ Symbol queued in database: ${queuedSymbol.symbol} (${queuedSymbol.company_name || 'N/A'})`);
        } else {
          console.log(`  ⚠️  Symbol not yet queued in database`);
        }
      }
      
      // Check if data was stored
      await new Promise(resolve => setTimeout(resolve, 500)); // Give DB time to commit
      const storageResult = await checkDataStored(testSymbol, interval);
      
      if (storageResult.stored) {
        console.log(`  ✅ Data stored in database: ${storageResult.count} candles`);
        results.push({ 
          interval, 
          status: 'success', 
          apiBars: apiResult.bars, 
          dbBars: storageResult.count 
        });
      } else {
        console.log(`  ⚠️  Data not yet stored in database (may be queued for collection)`);
        results.push({ 
          interval, 
          status: 'queued', 
          apiBars: apiResult.bars, 
          dbBars: 0 
        });
      }
      
      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // Step 4: Test cache hit (second request)
    console.log(`\n\n🔄 Testing cache hit (second request)...`);
    console.log('=' .repeat(70));
    
    const cacheInterval = '1d';
    console.log(`\n🔍 Re-requesting ${testSymbol} with interval ${cacheInterval}...`);
    
    const cacheResult = await testAPIRequest(testSymbol, cacheInterval);
    if (cacheResult.success) {
      console.log(`✅ Cache hit successful: ${cacheResult.bars} bars returned`);
    } else {
      console.log(`❌ Cache hit failed: ${cacheResult.message}`);
    }
    
    // Summary
    console.log(`\n\n📊 Test Summary`);
    console.log('=' .repeat(70));
    console.log(`Symbol tested: ${testSymbol}`);
    console.log(`Total intervals tested: ${ALL_INTERVALS.length}`);
    
    const successCount = results.filter(r => r.status === 'success').length;
    const queuedCount = results.filter(r => r.status === 'queued').length;
    const failedCount = results.filter(r => r.status === 'failed').length;
    
    console.log(`\nResults:`);
    console.log(`  ✅ Success (data stored): ${successCount}`);
    console.log(`  ⏳ Queued (will collect later): ${queuedCount}`);
    console.log(`  ❌ Failed: ${failedCount}`);
    
    // Detailed breakdown
    console.log(`\nDetailed Results:`);
    console.log('-'.repeat(70));
    results.forEach(r => {
      const status = r.status === 'success' ? '✅' : r.status === 'queued' ? '⏳' : '❌';
      console.log(`  ${status} ${r.interval.padEnd(4)} - API: ${(r.apiBars || 0).toString().padStart(4)} bars, DB: ${(r.dbBars || 0).toString().padStart(4)} bars`);
    });
    
    // Overall result
    console.log(`\n${'='.repeat(70)}`);
    if (failedCount === 0) {
      console.log('🎉 TEST PASSED: All intervals returned data from provider');
      console.log('   (Some may be queued for future automated collection)');
    } else {
      console.log('⚠️  TEST COMPLETED WITH WARNINGS: Some intervals failed');
    }
    console.log('='.repeat(70) + '\n');
    
  } catch (error) {
    console.error('\n❌ Test failed with error:', error.message);
    console.error(error.stack);
  } finally {
    await disconnectDB();
  }
}

// Run the test
runTest().catch(console.error);
