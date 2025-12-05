// Test single symbol request to see exact response format
require('dotenv').config();
const axios = require('axios');

async function testSingleSymbol() {
  console.log('\n=== TESTING SINGLE SYMBOL: AAPL 1mo ===\n');
  
  const params = {
    symbols: 'AAPL',  // Single symbol, no comma
    timeframe: '1Month',
    start: new Date(Date.now() - 3650 * 24 * 60 * 60 * 1000).toISOString(),
    end: new Date().toISOString(),
    limit: 10000,
    feed: 'iex',
    adjustment: 'split'
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
    
    console.log('\n=== RESPONSE STRUCTURE ===\n');
    console.log(`Status: ${response.status}`);
    console.log(`Has 'bars' property: ${!!response.data.bars}`);
    console.log(`bars type: ${typeof response.data.bars}`);
    console.log(`bars is Array: ${Array.isArray(response.data.bars)}`);
    
    if (response.data.bars) {
      if (Array.isArray(response.data.bars)) {
        console.log(`\n✅ Response is ARRAY (single symbol)`);
        console.log(`Array length: ${response.data.bars.length} bars`);
        console.log(`First bar:`, JSON.stringify(response.data.bars[0], null, 2));
      } else {
        const keys = Object.keys(response.data.bars);
        console.log(`\n📦 Response is OBJECT`);
        console.log(`Number of keys: ${keys.length}`);
        console.log(`Keys: [${keys.slice(0, 10).join(', ')}${keys.length > 10 ? '...' : ''}]`);
        console.log(`First key: "${keys[0]}"`);
        console.log(`First key is numeric: ${!isNaN(keys[0])}`);
        
        const firstValue = response.data.bars[keys[0]];
        console.log(`First value is Array: ${Array.isArray(firstValue)}`);
        console.log(`First value length: ${Array.isArray(firstValue) ? firstValue.length : 'N/A'}`);
        
        if (Array.isArray(firstValue) && firstValue.length > 0) {
          console.log(`First bar:`, JSON.stringify(firstValue[0], null, 2));
        }
        
        // If keys are numeric, this is the BUG
        if (!isNaN(keys[0])) {
          console.log(`\n❌ BUG FOUND: Alpaca returned numeric keys for single symbol!`);
          console.log(`Expected: { "AAPL": [66 bars] }`);
          console.log(`Got: { "0": [bar1], "1": [bar2], ..., "65": [bar66] }`);
        } else if (keys[0] === 'AAPL') {
          console.log(`\n✅ Correct: Symbol name as key`);
        }
      }
    }
    
  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    }
  }
}

testSingleSymbol();
