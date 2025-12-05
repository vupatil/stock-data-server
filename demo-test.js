/**
 * SIMPLE DEMO TEST
 * Shows the complete database-driven symbol management flow
 */

require('dotenv').config();
const axios = require('axios');

const API_BASE = `http://localhost:${process.env.PORT || 3001}`;

async function wait(seconds) {
  console.log(`⏳ Waiting ${seconds} seconds...`);
  return new Promise(resolve => setTimeout(resolve, seconds * 1000));
}

async function demo() {
  console.log('\n╔═══════════════════════════════════════════════╗');
  console.log('║   🎬 DATABASE-DRIVEN SYMBOL DEMO             ║');
  console.log('╚═══════════════════════════════════════════════╝\n');
  
  try {
    // Step 1: Request a new symbol
    console.log('📝 Step 1: Request TSLA (not in database)');
    console.log('─'.repeat(60));
    
    try {
      const response = await axios.get(`${API_BASE}/api/stock/TSLA?interval=1d`);
      console.log(`Status: ${response.status}`);
      console.log(`Response:`, JSON.stringify(response.data, null, 2));
    } catch (error) {
      if (error.response && error.response.status === 202) {
        console.log(`✅ Status: 202 Accepted`);
        console.log(`Message: ${error.response.data.message}`);
        console.log(`Retry after: ${error.response.data.retryAfter} seconds`);
      } else {
        console.log(`❌ Error: ${error.message}`);
      }
    }
    
    // Step 2: Check symbols list
    console.log('\n📋 Step 2: Check active symbols in database');
    console.log('─'.repeat(60));
    
    const symbolsResponse = await axios.get(`${API_BASE}/symbols`);
    console.log(`Total symbols: ${symbolsResponse.data.count}`);
    console.log(`Symbols: ${symbolsResponse.data.symbols.map(s => s.symbol).join(', ')}`);
    
    // Step 3: Wait for collector
    console.log('\n⏱️  Step 3: Wait for collector to fetch data');
    console.log('─'.repeat(60));
    await wait(20);
    
    // Step 4: Retry the request
    console.log('\n🔄 Step 4: Retry TSLA request');
    console.log('─'.repeat(60));
    
    try {
      const response = await axios.get(`${API_BASE}/api/stock/TSLA?interval=1d`);
      
      if (response.status === 200) {
        const result = response.data.chart.result[0];
        console.log(`✅ Status: 200 OK`);
        console.log(`Data points: ${result.timestamp.length}`);
        console.log(`Latest close: $${result.indicators.quote[0].close[result.indicators.quote[0].close.length - 1]}`);
        console.log(`Date range: ${new Date(result.timestamp[0] * 1000).toDateString()} to ${new Date(result.timestamp[result.timestamp.length - 1] * 1000).toDateString()}`);
      } else if (response.status === 202) {
        console.log(`⚠️  Still waiting (202): ${response.data.message}`);
      }
    } catch (error) {
      if (error.response && error.response.status === 202) {
        console.log(`⚠️  Still waiting (202): ${error.response.data.message}`);
      } else {
        console.log(`❌ Error: ${error.message}`);
      }
    }
    
    // Step 5: Test invalid symbol
    console.log('\n🚫 Step 5: Test invalid symbol (should fail validation)');
    console.log('─'.repeat(60));
    
    try {
      const response = await axios.get(`${API_BASE}/api/stock/INVALIDXYZ?interval=1d`);
      console.log(`❌ Validation failed - got: ${response.status}`);
    } catch (error) {
      if (error.response && error.response.status === 404) {
        console.log(`✅ Status: 404 Not Found`);
        console.log(`Message: ${error.response.data.message || error.response.data.error}`);
      } else if (error.response && error.response.status === 202) {
        console.log(`⚠️  Symbol accepted (202) - Alpaca API may be permissive`);
      } else {
        console.log(`❌ Error: ${error.message}`);
      }
    }
    
    // Step 6: Final stats
    console.log('\n📊 Step 6: Final system stats');
    console.log('─'.repeat(60));
    
    const statsResponse = await axios.get(`${API_BASE}/stats`);
    console.log(`Total symbols: ${statsResponse.data.symbols.total_symbols}`);
    console.log(`Active symbols: ${statsResponse.data.symbols.active_symbols}`);
    console.log(`Intervals with data:`);
    statsResponse.data.candles.forEach(c => {
      console.log(`  - ${c.interval_type}: ${c.total_candles} candles`);
    });
    
    console.log('\n╔═══════════════════════════════════════════════╗');
    console.log('║   ✅ DEMO COMPLETED SUCCESSFULLY             ║');
    console.log('╚═══════════════════════════════════════════════╝\n');
    
  } catch (error) {
    console.error('\n❌ Demo failed:', error.message);
    process.exit(1);
  }
}

demo();
