/**
 * COMPREHENSIVE TEST SUITE
 * Tests database-driven symbol management end-to-end
 */

require('dotenv').config();
const axios = require('axios');
const { initDB, getDB, closeDB } = require('./config/database');

const API_BASE = `http://localhost:${process.env.PORT || 3001}`;
const TEST_SYMBOLS = {
  valid: ['AAPL', 'MSFT', 'GOOGL', 'NVDA', 'VYM'],
  invalid: ['ABCDEF12345', 'NOTREAL', 'FAKE123']
};

let testResults = {
  passed: 0,
  failed: 0,
  tests: []
};

function logTest(name, passed, message = '') {
  const status = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`  ${status}: ${name}`);
  if (message) console.log(`      ${message}`);
  
  testResults.tests.push({ name, passed, message });
  if (passed) testResults.passed++;
  else testResults.failed++;
}

async function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ===== TEST SUITES =====

async function testDatabaseConnection() {
  console.log('\n📋 Test Suite 1: Database Connection');
  console.log('─'.repeat(60));
  
  try {
    const db = getDB();
    const [rows] = await db.query('SELECT 1 as test');
    logTest('Database connection', rows[0].test === 1);
  } catch (error) {
    logTest('Database connection', false, error.message);
  }
}

async function testServerHealth() {
  console.log('\n📋 Test Suite 2: Server Health');
  console.log('─'.repeat(60));
  
  try {
    const response = await axios.get(`${API_BASE}/health`);
    logTest('Health endpoint returns 200', response.status === 200);
    logTest('Health status is ok', response.data.status === 'ok');
    logTest('Health has timestamp', !!response.data.timestamp);
  } catch (error) {
    logTest('Health endpoint', false, error.message);
  }
}

async function testSymbolValidation() {
  console.log('\n📋 Test Suite 3: Symbol Validation');
  console.log('─'.repeat(60));
  
  // Test valid symbol not in database (should queue and return 202)
  try {
    const symbol = TEST_SYMBOLS.valid[0];
    console.log(`\n  Testing: ${symbol} (first request)`);
    
    const response = await axios.get(`${API_BASE}/api/stock/${symbol}?interval=1d`);
    logTest(`${symbol}: Returns 202 (queued)`, response.status === 202);
    logTest(`${symbol}: Has status=queued`, response.data.status === 'queued');
    logTest(`${symbol}: Has retryAfter`, response.data.retryAfter > 0);
  } catch (error) {
    if (error.response && error.response.status === 202) {
      logTest(`${TEST_SYMBOLS.valid[0]}: Returns 202 (queued)`, true);
    } else {
      logTest(`${TEST_SYMBOLS.valid[0]}: Validation`, false, error.message);
    }
  }
  
  // Test invalid symbol (should return 404)
  const invalidSymbol = TEST_SYMBOLS.invalid[0];
  try {
    console.log(`\n  Testing: ${invalidSymbol} (invalid)`);
    
    const response = await axios.get(`${API_BASE}/api/stock/${invalidSymbol}?interval=1d`);
    logTest(`${invalidSymbol}: Should return 404`, false, 'Expected 404, got success');
  } catch (error) {
    if (error.response && error.response.status === 404) {
      logTest(`${invalidSymbol}: Returns 404 (not found)`, true);
      logTest(`${invalidSymbol}: Has error message`, !!error.response.data.error);
    } else {
      logTest(`${invalidSymbol}: Returns 404`, false, `Got ${error.response?.status || 'error'}`);
    }
  }
}

async function testDatabaseSymbolStorage() {
  console.log('\n📋 Test Suite 4: Database Symbol Storage');
  console.log('─'.repeat(60));
  
  try {
    const db = getDB();
    
    // Check if valid symbols were added to database
    for (const symbol of TEST_SYMBOLS.valid.slice(0, 1)) {
      const [rows] = await db.query(
        'SELECT * FROM stocks WHERE symbol = ?',
        [symbol]
      );
      
      logTest(`${symbol}: Added to database`, rows.length > 0);
      if (rows.length > 0) {
        logTest(`${symbol}: Is active`, rows[0].is_active === 1);
        logTest(`${symbol}: Has requested_at`, !!rows[0].requested_at);
      }
    }
    
    // Check that invalid symbols were NOT added
    for (const symbol of TEST_SYMBOLS.invalid.slice(0, 1)) {
      const [rows] = await db.query(
        'SELECT * FROM stocks WHERE symbol = ?',
        [symbol]
      );
      
      logTest(`${symbol}: NOT in database`, rows.length === 0);
    }
  } catch (error) {
    logTest('Database symbol storage check', false, error.message);
  }
}

async function testCollectorSymbolRetrieval() {
  console.log('\n📋 Test Suite 5: Collector Symbol Retrieval');
  console.log('─'.repeat(60));
  
  try {
    const db = getDB();
    
    // Collector should read active symbols from database
    const [symbols] = await db.query(
      'SELECT symbol FROM stocks WHERE is_active = TRUE'
    );
    
    logTest('Collector can query active symbols', symbols.length > 0);
    logTest('Active symbols count matches', symbols.length >= 1);
    
    console.log(`\n      Active symbols in database: ${symbols.map(s => s.symbol).join(', ')}`);
  } catch (error) {
    logTest('Collector symbol retrieval', false, error.message);
  }
}

async function testDataCollection() {
  console.log('\n📋 Test Suite 6: Data Collection (Wait for collector)');
  console.log('─'.repeat(60));
  
  console.log('\n  ⏳ Waiting 15 seconds for collector to fetch data...');
  await wait(15000);
  
  try {
    const db = getDB();
    const symbol = TEST_SYMBOLS.valid[0];
    
    // Check if candles were inserted
    const [stockRows] = await db.query(
      'SELECT stock_id FROM stocks WHERE symbol = ?',
      [symbol]
    );
    
    if (stockRows.length === 0) {
      logTest(`${symbol}: Data collection`, false, 'Symbol not in database');
      return;
    }
    
    const stockId = stockRows[0].stock_id;
    
    const [candles] = await db.query(
      'SELECT COUNT(*) as count, interval_type FROM candles WHERE stock_id = ? GROUP BY interval_type',
      [stockId]
    );
    
    logTest(`${symbol}: Has candle data`, candles.length > 0);
    
    if (candles.length > 0) {
      console.log(`\n      Intervals collected:`);
      candles.forEach(row => {
        console.log(`        - ${row.interval_type}: ${row.count} candles`);
      });
    }
  } catch (error) {
    logTest('Data collection check', false, error.message);
  }
}

async function testAPIDataRetrieval() {
  console.log('\n📋 Test Suite 7: API Data Retrieval (After Collection)');
  console.log('─'.repeat(60));
  
  try {
    const symbol = TEST_SYMBOLS.valid[0];
    console.log(`\n  Testing: ${symbol} (should have data now)`);
    
    const response = await axios.get(`${API_BASE}/api/stock/${symbol}?interval=1d`);
    
    logTest(`${symbol}: Returns 200 (data available)`, response.status === 200);
    logTest(`${symbol}: Has chart data`, !!response.data.chart);
    logTest(`${symbol}: Has result array`, Array.isArray(response.data.chart.result));
    
    if (response.data.chart.result && response.data.chart.result.length > 0) {
      const result = response.data.chart.result[0];
      logTest(`${symbol}: Has timestamps`, Array.isArray(result.timestamp) && result.timestamp.length > 0);
      logTest(`${symbol}: Has indicators`, !!result.indicators);
      logTest(`${symbol}: Has quote data`, !!result.indicators.quote);
      
      const quote = result.indicators.quote[0];
      logTest(`${symbol}: Has OHLCV data`, 
        Array.isArray(quote.open) && 
        Array.isArray(quote.high) && 
        Array.isArray(quote.low) && 
        Array.isArray(quote.close) && 
        Array.isArray(quote.volume)
      );
      
      console.log(`\n      Data points: ${result.timestamp.length}`);
      console.log(`      Latest close: $${quote.close[quote.close.length - 1]}`);
    }
  } catch (error) {
    logTest('API data retrieval', false, error.message);
  }
}

async function testMultipleSymbols() {
  console.log('\n📋 Test Suite 8: Multiple Symbols');
  console.log('─'.repeat(60));
  
  console.log('\n  Requesting 4 more symbols...');
  
  const symbols = TEST_SYMBOLS.valid.slice(1, 5);
  
  for (const symbol of symbols) {
    try {
      const response = await axios.get(`${API_BASE}/api/stock/${symbol}?interval=1d`);
      
      if (response.status === 202) {
        logTest(`${symbol}: Queued successfully`, true);
      } else if (response.status === 200) {
        logTest(`${symbol}: Data already available`, true);
      }
    } catch (error) {
      if (error.response && error.response.status === 202) {
        logTest(`${symbol}: Queued successfully`, true);
      } else {
        logTest(`${symbol}: Request`, false, error.message);
      }
    }
  }
}

async function testSymbolsEndpoint() {
  console.log('\n📋 Test Suite 9: Symbols Endpoint');
  console.log('─'.repeat(60));
  
  try {
    const response = await axios.get(`${API_BASE}/symbols`);
    
    logTest('Symbols endpoint returns 200', response.status === 200);
    logTest('Symbols has count', typeof response.data.count === 'number');
    logTest('Symbols has symbols array', Array.isArray(response.data.symbols));
    logTest('Symbols count > 0', response.data.count > 0);
    
    console.log(`\n      Total active symbols: ${response.data.count}`);
    console.log(`      Symbols: ${response.data.symbols.map(s => s.symbol).slice(0, 10).join(', ')}...`);
  } catch (error) {
    logTest('Symbols endpoint', false, error.message);
  }
}

async function testStatsEndpoint() {
  console.log('\n📋 Test Suite 10: Stats Endpoint');
  console.log('─'.repeat(60));
  
  try {
    const response = await axios.get(`${API_BASE}/stats`);
    
    logTest('Stats endpoint returns 200', response.status === 200);
    logTest('Stats has symbols data', !!response.data.symbols);
    logTest('Stats has candles data', Array.isArray(response.data.candles));
    
    console.log(`\n      Total symbols: ${response.data.symbols.total_symbols}`);
    console.log(`      Active symbols: ${response.data.symbols.active_symbols}`);
    console.log(`      Intervals with data: ${response.data.candles.length}`);
  } catch (error) {
    logTest('Stats endpoint', false, error.message);
  }
}

// ===== RUN ALL TESTS =====

async function runAllTests() {
  console.log('\n╔═══════════════════════════════════════════════╗');
  console.log('║   🧪 COMPREHENSIVE TEST SUITE                ║');
  console.log('╚═══════════════════════════════════════════════╝');
  
  try {
    await initDB();
    
    await testDatabaseConnection();
    await testServerHealth();
    await testSymbolValidation();
    await testDatabaseSymbolStorage();
    await testCollectorSymbolRetrieval();
    await testDataCollection();
    await testAPIDataRetrieval();
    await testMultipleSymbols();
    await testSymbolsEndpoint();
    await testStatsEndpoint();
    
    // Summary
    console.log('\n' + '═'.repeat(60));
    console.log('📊 TEST SUMMARY');
    console.log('═'.repeat(60));
    console.log(`✅ Passed: ${testResults.passed}`);
    console.log(`❌ Failed: ${testResults.failed}`);
    console.log(`📝 Total:  ${testResults.passed + testResults.failed}`);
    
    if (testResults.failed === 0) {
      console.log('\n🎉 ALL TESTS PASSED! 🎉\n');
    } else {
      console.log('\n⚠️  SOME TESTS FAILED - Review above\n');
      process.exit(1);
    }
    
  } catch (error) {
    console.error('\n❌ Test suite failed:', error.message);
    process.exit(1);
  } finally {
    await closeDB();
  }
}

// Check if server is running
async function checkServer() {
  try {
    await axios.get(`${API_BASE}/health`, { timeout: 2000 });
    return true;
  } catch (error) {
    return false;
  }
}

async function main() {
  const serverRunning = await checkServer();
  
  if (!serverRunning) {
    console.error('\n❌ Server is not running!');
    console.error(`   Please start the server first: node app.js`);
    console.error(`   Expected at: ${API_BASE}\n`);
    process.exit(1);
  }
  
  await runAllTests();
}

main();
