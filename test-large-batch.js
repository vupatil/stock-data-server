// Test with more symbols to reproduce the numeric key issue
require('dotenv').config();
const axios = require('axios');

async function testLargeBatch() {
  // Try with more symbols (like your actual collection)
  const symbols = [
    'AAPL', 'NVDA', 'MSFT', 'GOOGL', 'TSLA', 'AMZN', 'META', 'BRK.B', 'LLY', 'AVGO',
    'JPM', 'UNH', 'V', 'XOM', 'MA', 'COST', 'HD', 'PG', 'JNJ', 'NFLX',
    'BAC', 'ABBV', 'CRM', 'KO', 'ORCL', 'CVX', 'MRK', 'PEP', 'AMD', 'ADBE',
    'CSCO', 'TMO', 'ACN', 'LIN', 'MCD', 'ABT', 'WMT', 'DHR', 'INTU', 'PM',
    'TXN', 'VZ', 'GE', 'NEE', 'AMGN', 'DIS', 'ISRG', 'QCOM', 'HON', 'IBM'
  ];
  
  const symbolList = symbols.join(',');
  
  console.log('\n=== TESTING LARGE BATCH (50 SYMBOLS) ===\n');
  console.log(`Requesting ${symbols.length} symbols`);
  console.log(`First 5: [${symbols.slice(0, 5).join(', ')}]`);
  console.log(`Indices 43-47 map to: [${symbols.slice(43, 48).join(', ')}]`);
  
  const params = {
    symbols: symbolList,
    timeframe: '5Min',
    start: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().split('.')[0] + 'Z',
    end: new Date().toISOString().split('.')[0] + 'Z',
    limit: 5,
    feed: 'iex'
  };
  
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
    
    if (response.data.bars) {
      const keys = Object.keys(response.data.bars);
      console.log(`Number of keys in bars: ${keys.length}`);
      console.log(`First 10 keys: [${keys.slice(0, 10).join(', ')}]`);
      console.log(`Keys 43-53: [${keys.slice(43, 54).join(', ')}]`);
      
      const firstKey = keys[0];
      const isNumeric = !isNaN(firstKey);
      console.log(`\nFirst key: "${firstKey}"`);
      console.log(`Is numeric: ${isNumeric}`);
      
      if (isNumeric) {
        console.log('\n⚠️  NUMERIC KEYS DETECTED! Mapping to symbols:');
        keys.slice(43, 50).forEach(key => {
          const index = parseInt(key);
          const mappedSymbol = symbols[index];
          console.log(`  Key "${key}" -> symbols[${index}] = "${mappedSymbol || 'UNDEFINED!'}"`);
        });
      } else {
        console.log('\n✅ Symbol name keys detected');
        console.log(`Sample keys: ${keys.slice(0, 5).join(', ')}`);
      }
      
      console.log('\n=== KEY DETAILS ===');
      keys.slice(0, 5).forEach(key => {
        const bars = response.data.bars[key];
        console.log(`\nKey: "${key}" (type: ${typeof key})`);
        console.log(`  Is array: ${Array.isArray(bars)}`);
        console.log(`  Bar count: ${Array.isArray(bars) ? bars.length : 'N/A'}`);
      });
      
    } else {
      console.log('❌ No bars in response!');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

testLargeBatch().catch(console.error);
