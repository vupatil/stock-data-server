/**
 * MANUAL FRESH DEPLOYMENT TEST
 * 
 * This script assumes:
 * 1. Database has been dropped and recreated (node setup.js)
 * 2. Server is already running in a separate terminal (node app.js)
 * 3. Database is completely empty (no symbols)
 * 
 * This tests ONLY the API request flow on fresh deployment
 */

const axios = require('axios');

const API_BASE = 'http://localhost:3001';
const TEST_SYMBOL = 'AAPL';

console.log('\n🔍 TESTING FRESH DEPLOYMENT FLOW');
console.log('=' .repeat(50));
console.log(`Assumes: Empty database, server already running\n`);

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testFlow() {
  try {
    // Step 1: Check health
    console.log('1️⃣  Checking server health...');
    const health = await axios.get(`${API_BASE}/health`);
    console.log(`✅ Server is up! Status: ${health.data.status}\n`);
    
    // Step 2: Request symbol (first time - should trigger collection)
    console.log(`2️⃣  Requesting ${TEST_SYMBOL} (first time on empty DB)...`);
    try {
      const response = await axios.get(`${API_BASE}/api/stock/${TEST_SYMBOL}?interval=1d`);
      console.log(`✅ Got data immediately! ${response.data.chart.result[0].timestamp.length} bars`);
      console.log(`   Latest close: $${response.data.chart.result[0].indicators.quote[0].close.slice(-1)[0]}\n`);
    } catch (error) {
      if (error.response?.status === 503) {
        console.log(`⏳ Got 503 - Data is being collected`);
        console.log(`   Retry after: ${error.response.data.retryAfter}s`);
        console.log(`   Message: ${error.response.data.message}\n`);
        
        // Wait and retry
        console.log(`3️⃣  Waiting ${error.response.data.retryAfter}s then retrying...`);
        await sleep(error.response.data.retryAfter * 1000);
        
        try {
          const retry = await axios.get(`${API_BASE}/api/stock/${TEST_SYMBOL}?interval=1d`);
          console.log(`✅ SUCCESS! Got ${retry.data.chart.result[0].timestamp.length} bars`);
          console.log(`   Latest close: $${retry.data.chart.result[0].indicators.quote[0].close.slice(-1)[0]}\n`);
        } catch (retryError) {
          console.log(`❌ Retry failed: ${retryError.response?.status} - ${retryError.response?.data?.message || retryError.message}`);
          if (retryError.response?.data) {
            console.log('   Full error response:', JSON.stringify(retryError.response.data, null, 2));
          }
          process.exit(1);
        }
      } else if (error.response?.status === 404) {
        console.error(`❌ Got 404 - Symbol not found!`);
        console.error(`   Error: ${error.response.data.error}`);
        console.error(`   Message: ${error.response.data.message}`);
        console.error('\n🔍 This means provider validation failed!');
        console.error('   Check: Alpaca credentials in .env');
        console.error('   Check: Provider initialization in server logs');
        process.exit(1);
      } else {
        throw error;
      }
    }
    
    // Step 3: Check stats
    console.log('4️⃣  Checking database stats...');
    const stats = await axios.get(`${API_BASE}/stats`);
    console.log(`   Active symbols: ${stats.data.symbols.active_symbols}`);
    console.log(`   Total symbols: ${stats.data.symbols.total_symbols}`);
    console.log(`   Intervals with data: ${stats.data.candles.length}`);
    
    console.log('\n✅ TEST COMPLETE - Fresh deployment flow works!');
    console.log('=' .repeat(50) + '\n');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Response:', JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  }
}

testFlow();
