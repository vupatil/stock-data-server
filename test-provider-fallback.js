/**
 * Test immediate provider fallback for intraday data
 */

require('dotenv').config();

async function testProviderFallback() {
  console.log('\n🧪 Testing Provider Fallback for Intraday Data\n');
  console.log('=' .repeat(70));
  
  const testUrl = 'http://localhost:3001/api/stock/AAPL?interval=1m';
  
  console.log(`\nRequesting: ${testUrl}`);
  console.log('Expected behavior:');
  console.log('  1. Try MySQL cache (likely empty for 1m data)');
  console.log('  2. Queue symbol for collection');
  console.log('  3. Fetch from Alpaca provider immediately');
  console.log('  4. Return data without waiting\n');
  
  console.log('Making request...\n');
  
  try {
    const response = await fetch(testUrl);
    const data = await response.json();
    
    if (response.status === 200 && data.chart && data.chart.result) {
      const bars = data.chart.result[0].timestamp.length;
      const firstTs = new Date(data.chart.result[0].timestamp[0] * 1000);
      const lastTs = new Date(data.chart.result[0].timestamp[bars - 1] * 1000);
      
      console.log('✅ SUCCESS! Data returned immediately:');
      console.log(`   Status: ${response.status}`);
      console.log(`   Bars: ${bars}`);
      console.log(`   First bar: ${firstTs.toLocaleString()}`);
      console.log(`   Last bar: ${lastTs.toLocaleString()}`);
      console.log(`   Latest close: $${data.chart.result[0].indicators.quote[0].close[bars - 1]}`);
      
    } else if (response.status === 202) {
      console.log('⚠️  Symbol queued (old behavior):');
      console.log(`   Status: ${response.status}`);
      console.log(`   Message: ${data.message}`);
      console.log('\n   This means provider fallback did not work.');
      
    } else {
      console.log(`❌ Unexpected response: ${response.status}`);
      console.log(data);
    }
    
  } catch (error) {
    console.log(`❌ Request failed: ${error.message}`);
  }
  
  console.log('\n' + '=' .repeat(70) + '\n');
}

// Run test
testProviderFallback();
