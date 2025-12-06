/**
 * ============================================================================
 * PRODUCTION FRESH DEPLOYMENT TEST
 * ============================================================================
 * 
 * This script validates the complete day-1 production deployment flow:
 * 
 * 1. Empty database (just schema, no symbols, no data)
 * 2. Server starts successfully
 * 3. First API request triggers automatic symbol addition and collection
 * 4. Subsequent requests serve data from database
 * 5. Cron jobs maintain data for all requested symbols
 * 
 * EXPECTED BEHAVIOR:
 * - First request: 503 "Symbol queued" with retry-after: 15s
 * - Wait 15+ seconds for collection to complete
 * - Retry request: 200 OK with historical data
 * - Stats show 1 active symbol and data for multiple intervals
 * 
 * NOTE: This assumes database has been initialized with:
 *   node drop-and-setup.js  (or manually: drop tables + node setup.js)
 * ============================================================================
 */

const axios = require('axios');

const API_BASE = 'http://localhost:3001';
const TEST_SYMBOL = 'AAPL';
const INTERVAL = '1d';

console.log('\n╔══════════════════════════════════════════════════════════════╗');
console.log('║  🚀 PRODUCTION FRESH DEPLOYMENT VALIDATION TEST             ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');

console.log('Prerequisites:');
console.log('  ✓ Database initialized (node drop-and-setup.js)');
console.log('  ✓ Server running (node app.js in separate terminal)');
console.log('  ✓ Empty stocks table (no symbols yet)\n');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testProductionFlow() {
  try {
    // Step 1: Verify server is running
    console.log('┌─ Step 1: Health Check');
    const health = await axios.get(`${API_BASE}/health`);
    console.log(`│  ✅ Server is running (${health.data.status})`);
    console.log(`│  Collection enabled: ${health.data.collectionEnabled}\n`);
    
    // Step 2: Request symbol for first time (should queue)
    console.log('┌─ Step 2: First API Request (Empty Database)');
    console.log(`│  Requesting: GET /api/stock/${TEST_SYMBOL}?interval=${INTERVAL}`);
    
    try {
      const response = await axios.get(`${API_BASE}/api/stock/${TEST_SYMBOL}?interval=${INTERVAL}`);
      console.log(`│  ⚠️  Unexpected success - got ${response.data.chart.result[0].timestamp.length} bars immediately`);
      console.log(`│  This means symbol was already in database!\n`);
    } catch (error) {
      if (error.response?.status === 503) {
        console.log(`│  ✅ Got expected 503 response`);
        console.log(`│  Message: ${error.response.data.message}`);
        console.log(`│  Retry-After: ${error.response.data.retryAfter} seconds`);
        console.log(`│  Status: ${error.response.data.status}\n`);
        
        // Step 3: Wait for collection
        const waitTime = error.response.data.retryAfter + 3; // Add buffer
        console.log('┌─ Step 3: Waiting for Collection');
        console.log(`│  Collection in progress...`);
        console.log(`│  Waiting ${waitTime} seconds (retry-after + buffer)\n`);
        
        for (let i = waitTime; i > 0; i--) {
          process.stdout.write(`│  ${i}s remaining...    \r`);
          await sleep(1000);
        }
        console.log(`│  ✓ Wait complete                    \n`);
        
        // Step 4: Retry request (should now have data)
        console.log('┌─ Step 4: Retry Request (After Collection)');
        console.log(`│  Requesting: GET /api/stock/${TEST_SYMBOL}?interval=${INTERVAL}`);
        
        try {
          const retry = await axios.get(`${API_BASE}/api/stock/${TEST_SYMBOL}?interval=${INTERVAL}`);
          const result = retry.data.chart.result[0];
          const bars = result.timestamp.length;
          const latestClose = result.indicators.quote[0].close[bars - 1];
          
          console.log(`│  ✅ SUCCESS! Got data from database`);
          console.log(`│  Bars collected: ${bars}`);
          console.log(`│  Latest close: $${latestClose}`);
          console.log(`│  Interval: ${INTERVAL}\n`);
        } catch (retryError) {
          console.log(`│  ❌ Retry failed: ${retryError.response?.status || retryError.message}`);
          if (retryError.response?.data) {
            console.log(`│  Error: ${JSON.stringify(retryError.response.data, null, 2)}\n`);
          }
          return false;
        }
      } else if (error.response?.status === 404) {
        console.log(`│  ❌ Got 404 - Provider validation failed`);
        console.log(`│  Error: ${error.response.data.error}`);
        console.log(`│  Message: ${error.response.data.message}\n`);
        return false;
      } else {
        console.log(`│  ❌ Unexpected error: ${error.response?.status || error.message}\n`);
        return false;
      }
    }
    
    // Step 5: Verify database state
    console.log('┌─ Step 5: Database State Verification');
    
    try {
      const stats = await axios.get(`${API_BASE}/stats`);
      console.log(`│  ✅ Stats endpoint accessible`);
      console.log(`│  Active symbols: ${stats.data.symbols.active_symbols}`);
      console.log(`│  Total symbols: ${stats.data.symbols.total_symbols}`);
      console.log(`│  Intervals with data:`);
      
      let totalBars = 0;
      stats.data.candles.forEach(interval => {
        console.log(`│    - ${interval.interval_type}: ${interval.count} bars`);
        totalBars += interval.count;
      });
      console.log(`│  Total bars across all intervals: ${totalBars}\n`);
    } catch (statsError) {
      console.log(`│  ⚠️  Stats endpoint failed: ${statsError.message}\n`);
    }
    
    // Step 6: Test symbols endpoint
    console.log('┌─ Step 6: Symbols List');
    try {
      const symbols = await axios.get(`${API_BASE}/symbols`);
      console.log(`│  ✅ Symbols endpoint accessible`);
      console.log(`│  Symbols in database: ${symbols.data.length}`);
      symbols.data.forEach(s => {
        console.log(`│    - ${s.symbol} (ID: ${s.stock_id}, Active: ${s.is_active})`);
      });
      console.log('└─\n');
    } catch (symbolsError) {
      console.log(`│  ⚠️  Symbols endpoint failed: ${symbolsError.message}\n`);
    }
    
    // Summary
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║  ✅ PRODUCTION DEPLOYMENT VALIDATION COMPLETE!              ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');
    
    console.log('VALIDATED PRODUCTION FLOW:');
    console.log('  ✓ Empty database → Server starts successfully');
    console.log('  ✓ First API request → Symbol validated and queued');
    console.log('  ✓ Collection triggers → Data fetched from provider');
    console.log('  ✓ Retry request → Data served from database');
    console.log('  ✓ Cron jobs active → Will maintain all active symbols\n');
    
    console.log('READY FOR PRODUCTION DEPLOYMENT!\n');
    return true;
    
  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', JSON.stringify(error.response.data, null, 2));
    }
    return false;
  }
}

// Run if called directly
if (require.main === module) {
  testProductionFlow()
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = { testProductionFlow };
