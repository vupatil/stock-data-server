/**
 * FRESH DEPLOYMENT TEST
 * 
 * Simulates complete production deployment from scratch:
 * 1. Drop existing database (clean slate)
 * 2. Run setup.js (create tables)
 * 3. Start app.js (API + Collector)
 * 4. Test API requests trigger data collection
 * 5. Verify data persistence and retrieval
 */

const axios = require('axios');
const mysql = require('mysql2/promise');
require('dotenv').config();

const API_BASE = 'http://localhost:3001';
const TEST_SYMBOLS = ['AAPL', 'MSFT', 'GOOGL'];

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(color, message) {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function dropDatabase() {
  log('cyan', '\n╔═══════════════════════════════════════════════╗');
  log('cyan', '║  STEP 1: DROP EXISTING DATABASE (Clean Slate)║');
  log('cyan', '╚═══════════════════════════════════════════════╝\n');
  
  try {
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD
    });
    
    const dbName = process.env.DB_NAME || 'STOCKSENTIMENT';
    
    log('yellow', `⚠️  This will DELETE database: ${dbName}`);
    log('yellow', '   All existing data will be lost!');
    
    await connection.query(`DROP DATABASE IF EXISTS ${dbName}`);
    log('green', `✅ Database ${dbName} dropped (if existed)`);
    
    await connection.end();
    log('blue', '\n💡 Database is now in clean state (does not exist)');
    
  } catch (error) {
    log('red', `❌ Error: ${error.message}`);
    process.exit(1);
  }
}

async function checkServerHealth() {
  try {
    const response = await axios.get(`${API_BASE}/health`, { timeout: 5000 });
    return response.status === 200;
  } catch (error) {
    return false;
  }
}

async function testApiRequest(symbol, expectSuccess = false) {
  log('blue', `\n📊 Testing API: GET /api/stock/${symbol}?interval=1d`);
  
  try {
    const response = await axios.get(`${API_BASE}/api/stock/${symbol}`, {
      params: { interval: '1d' },
      timeout: 10000
    });
    
    if (response.status === 200) {
      const bars = response.data.chart.result[0].timestamp.length;
      log('green', `   ✅ SUCCESS: ${response.status} - ${bars} bars returned`);
      log('green', `   Latest close: $${response.data.chart.result[0].meta.regularMarketPrice}`);
      return { success: true, bars, status: 200 };
    }
    
  } catch (error) {
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;
      
      if (status === 503) {
        log('yellow', `   ⏰ ${status}: ${data.message || data.error}`);
        log('yellow', `   Status: ${data.status}`);
        log('yellow', `   Retry after: ${data.retryAfter}s`);
        return { success: false, status: 503, retryAfter: data.retryAfter, queuedOrRefreshing: true };
      } else if (status === 404) {
        log('red', `   ❌ ${status}: ${data.message || data.error}`);
        return { success: false, status: 404 };
      } else {
        log('red', `   ❌ ${status}: ${data.message || data.error}`);
        return { success: false, status };
      }
    } else {
      log('red', `   ❌ Network error: ${error.message}`);
      return { success: false, error: error.message };
    }
  }
}

async function checkDatabaseState() {
  log('cyan', '\n╔═══════════════════════════════════════════════╗');
  log('cyan', '║  DATABASE STATE CHECK                         ║');
  log('cyan', '╚═══════════════════════════════════════════════╝\n');
  
  try {
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME || 'STOCKSENTIMENT'
    });
    
    // Check stocks table
    const [stocks] = await connection.query('SELECT COUNT(*) as count FROM stocks');
    log('blue', `📊 Stocks table: ${stocks[0].count} symbols`);
    
    if (stocks[0].count > 0) {
      const [symbolList] = await connection.query('SELECT symbol, is_active FROM stocks ORDER BY symbol');
      symbolList.forEach(s => {
        log('blue', `   • ${s.symbol} (active: ${s.is_active})`);
      });
    }
    
    // Check candles table
    const [candles] = await connection.query('SELECT COUNT(*) as count FROM candles');
    log('blue', `📊 Candles table: ${candles[0].count} total bars`);
    
    if (candles[0].count > 0) {
      const [intervals] = await connection.query(`
        SELECT interval_type, COUNT(*) as count 
        FROM candles 
        GROUP BY interval_type 
        ORDER BY interval_type
      `);
      intervals.forEach(i => {
        log('blue', `   • ${i.interval_type}: ${i.count} bars`);
      });
    }
    
    // Check collection logs
    const [logs] = await connection.query('SELECT COUNT(*) as count FROM data_collection_log');
    log('blue', `📊 Collection logs: ${logs[0].count} entries`);
    
    await connection.end();
    
  } catch (error) {
    log('red', `❌ Error checking database: ${error.message}`);
  }
}

async function runTest() {
  console.clear();
  log('cyan', '\n╔═══════════════════════════════════════════════╗');
  log('cyan', '║   🚀 FRESH PRODUCTION DEPLOYMENT TEST         ║');
  log('cyan', '╚═══════════════════════════════════════════════╝\n');
  
  log('yellow', '⚠️  WARNING: This test will:');
  log('yellow', '   1. DROP your existing database');
  log('yellow', '   2. Run setup.js to recreate tables');
  log('yellow', '   3. Test API with app.js running\n');
  
  // Step 1: Drop database
  await dropDatabase();
  
  // Step 2: Instructions for setup
  log('cyan', '\n╔═══════════════════════════════════════════════╗');
  log('cyan', '║  STEP 2: RUN SETUP                            ║');
  log('cyan', '╚═══════════════════════════════════════════════╝\n');
  
  log('yellow', '📝 Manual step required:');
  log('yellow', '   Run in a separate terminal: node setup.js');
  log('yellow', '   Then press Enter here to continue...');
  
  await new Promise(resolve => {
    process.stdin.once('data', () => resolve());
  });
  
  // Step 3: Check if app.js is running
  log('cyan', '\n╔═══════════════════════════════════════════════╗');
  log('cyan', '║  STEP 3: CHECK APP.JS SERVER                  ║');
  log('cyan', '╚═══════════════════════════════════════════════╝\n');
  
  log('blue', 'Checking if app.js is running...');
  const isRunning = await checkServerHealth();
  
  if (!isRunning) {
    log('yellow', '\n⚠️  app.js is NOT running!');
    log('yellow', '\n📝 Manual step required:');
    log('yellow', '   Run in a separate terminal: npm start');
    log('yellow', '   Then press Enter here to continue...');
    
    await new Promise(resolve => {
      process.stdin.once('data', () => resolve());
    });
    
    // Recheck
    await sleep(2000);
    const isRunningNow = await checkServerHealth();
    if (!isRunningNow) {
      log('red', '❌ Server still not responding. Exiting test.');
      process.exit(1);
    }
  }
  
  log('green', '✅ Server is running!\n');
  
  // Step 4: Check initial database state (should be empty)
  await checkDatabaseState();
  
  // Step 5: Test API requests (trigger data collection)
  log('cyan', '\n╔═══════════════════════════════════════════════╗');
  log('cyan', '║  STEP 4: TEST API REQUESTS                    ║');
  log('cyan', '╚═══════════════════════════════════════════════╝\n');
  
  log('blue', 'Testing with fresh symbols (should trigger collection)...\n');
  
  const results = {};
  
  for (const symbol of TEST_SYMBOLS) {
    const result = await testApiRequest(symbol);
    results[symbol] = result;
    
    if (result.queuedOrRefreshing) {
      log('blue', `\n⏰ ${symbol} is being collected. Waiting ${result.retryAfter}s...`);
      await sleep(result.retryAfter * 1000);
      
      // Retry
      log('blue', `\n🔄 Retrying ${symbol}...`);
      const retryResult = await testApiRequest(symbol, true);
      results[`${symbol}_retry`] = retryResult;
    }
    
    await sleep(2000); // Small delay between requests
  }
  
  // Step 6: Check final database state
  await checkDatabaseState();
  
  // Step 7: Summary
  log('cyan', '\n╔═══════════════════════════════════════════════╗');
  log('cyan', '║  TEST SUMMARY                                 ║');
  log('cyan', '╚═══════════════════════════════════════════════╝\n');
  
  let successCount = 0;
  let totalTests = 0;
  
  for (const [key, result] of Object.entries(results)) {
    totalTests++;
    if (result.success) {
      successCount++;
      log('green', `✅ ${key}: SUCCESS (${result.bars} bars)`);
    } else if (result.queuedOrRefreshing) {
      log('yellow', `⏰ ${key}: Queued/Refreshing (${result.status})`);
    } else {
      log('red', `❌ ${key}: FAILED (${result.status || result.error})`);
    }
  }
  
  log('cyan', `\n📊 Results: ${successCount}/${totalTests} successful`);
  
  // Expected behavior
  log('cyan', '\n╔═══════════════════════════════════════════════╗');
  log('cyan', '║  EXPECTED BEHAVIOR                            ║');
  log('cyan', '╚═══════════════════════════════════════════════╝\n');
  
  log('blue', '1️⃣  First request for each symbol:');
  log('yellow', '   → 503 "Symbol not yet available" or "Data being refreshed"');
  log('yellow', '   → Symbol added to stocks table');
  log('yellow', '   → Collection triggered in background');
  
  log('blue', '\n2️⃣  Retry after 15-30 seconds:');
  log('green', '   → 200 OK with data');
  log('green', '   → Data served from database');
  
  log('blue', '\n3️⃣  Future requests:');
  log('green', '   → Instant response from cache');
  log('green', '   → Cron jobs keep data updated');
  
  log('cyan', '\n✨ Test complete!\n');
}

// Run the test
runTest().catch(error => {
  log('red', `\n❌ Test failed: ${error.message}`);
  console.error(error);
  process.exit(1);
});
