// Test to see exact format of Alpaca batch response
require('dotenv').config();
const axios = require('axios');

async function testBatchResponse() {
  const symbols = ['AAPL', 'NVDA', 'MSFT', 'GOOGL', 'TSLA'];
  const symbolList = symbols.join(',');
  
  console.log('\n=== TESTING ALPACA BATCH REQUEST ===\n');
  console.log(`Requesting symbols: ${symbolList}`);
  console.log(`Symbol array: [${symbols.map(s => `"${s}"`).join(', ')}]`);
  console.log(`Symbol count: ${symbols.length}\n`);
  
  const params = {
    symbols: symbolList,
    timeframe: '5Min',
    start: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().split('.')[0] + 'Z',
    end: new Date().toISOString().split('.')[0] + 'Z',
    limit: 10,
    feed: 'iex'
  };
  
  console.log('Request params:', JSON.stringify(params, null, 2));
  
  try {
    const response = await axios.get('https://data.alpaca.markets/v2/stocks/bars', {
      headers: {
        'APCA-API-KEY-ID': process.env.ALPACA_API_KEY,
        'APCA-API-SECRET-KEY': process.env.ALPACA_API_SECRET
      },
      params,
      timeout: 30000
    });
    
    console.log('\n=== RESPONSE ANALYSIS ===\n');
    console.log(`Response status: ${response.status}`);
    console.log(`Response has 'bars' property: ${!!response.data.bars}`);
    console.log(`Bars type: ${typeof response.data.bars}`);
    
    if (response.data.bars) {
      const keys = Object.keys(response.data.bars);
      console.log(`\nNumber of keys in bars: ${keys.length}`);
      console.log(`Keys: [${keys.map(k => `"${k}"`).join(', ')}]`);
      
      // Check if keys are numeric
      const firstKey = keys[0];
      const isNumeric = !isNaN(firstKey);
      console.log(`\nFirst key: "${firstKey}"`);
      console.log(`Is numeric: ${isNumeric}`);
      
      // Show first few entries
      console.log('\n=== FIRST 3 ENTRIES ===\n');
      keys.slice(0, 3).forEach((key, index) => {
        const bars = response.data.bars[key];
        console.log(`\nEntry ${index}:`);
        console.log(`  Key: "${key}"`);
        console.log(`  Type: ${typeof key}`);
        console.log(`  Value is array: ${Array.isArray(bars)}`);
        console.log(`  Bar count: ${Array.isArray(bars) ? bars.length : 'N/A'}`);
        if (Array.isArray(bars) && bars.length > 0) {
          console.log(`  First bar: ${JSON.stringify(bars[0])}`);
        }
      });
      
      // Show mapping logic
      console.log('\n=== MAPPING TEST ===\n');
      console.log('If we map numeric keys to symbols:');
      keys.slice(0, 5).forEach(key => {
        const isNumericKey = !isNaN(key);
        if (isNumericKey) {
          const symbolIndex = parseInt(key);
          const mappedSymbol = symbols[symbolIndex];
          console.log(`  Key "${key}" (numeric) -> symbols[${symbolIndex}] = "${mappedSymbol}"`);
        } else {
          console.log(`  Key "${key}" (not numeric) -> use as-is`);
        }
      });
      
      // Full response structure
      console.log('\n=== FULL RESPONSE STRUCTURE ===\n');
      console.log(JSON.stringify(response.data, null, 2));
      
    } else {
      console.log('❌ No bars in response!');
      console.log('Full response:', JSON.stringify(response.data, null, 2));
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

testBatchResponse().catch(console.error);
