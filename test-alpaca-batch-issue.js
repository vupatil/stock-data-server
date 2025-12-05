// Test to see why Alpaca returns numeric keys for batch requests
require('dotenv').config();
const axios = require('axios');

async function testBatchIssue() {
  // Test with exactly 100 symbols like our chunk
  const symbols = [
    'A','AAL','AAPL','ABBV','ABNB','ABT','ACGL','ACWI','ADBE','ADI',
    'ADP','ADSK','AEE','AEP','AES','AFL','AGG','AIG','AIZ','AJG',
    'AKAM','ALB','ALGN','ALL','ALLE','AMAT','AMD','AME','AMGN','AMP',
    'AMT','AMZN','ANET','ANSS','AON','AOS','APD','APH','APO','APP',
    'APTV','ARE','ARM','ATO','AVB','AVGO','AWK','AXON','AXP','AZO',
    'BA','BAC','BALL','BAX','BBY','BDX','BG','BIIB','BIL','BIV',
    'BK','BKNG','BKR','BLDR','BLK','BMRN','BMY','BND','BNDX','BR',
    'BRK.B','BRO','BSV','BSX','BX','BXP','C','CAG','CAH','CARR',
    'CAT','CB','CBOE','CBRE','CCEP','CCI','CCL','CDNS','CDW','CE',
    'CEG','CF','CFG','CGDV','CHD','CHRW','CHTR','CI','CINF','CL'
  ];
  
  const symbolList = symbols.join(',');
  
  console.log('\n=== TESTING 100-SYMBOL BATCH ===\n');
  console.log(`Requesting ${symbols.length} symbols`);
  console.log(`Symbol list: ${symbolList}`);
  console.log(`\nIndices 50-60 map to: [${symbols.slice(50, 61).join(', ')}]`);
  
  const params = {
    symbols: symbolList,
    timeframe: '5Min',
    start: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    end: new Date().toISOString(),
    limit: 5,
    feed: 'iex',
    adjustment: 'split'
  };
  
  console.log(`\nRequest params:`, JSON.stringify(params, null, 2));
  
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
    console.log(`Status: ${response.status}`);
    
    if (response.data.bars) {
      const keys = Object.keys(response.data.bars);
      console.log(`\nReceived ${keys.length} bars entries`);
      console.log(`Keys type: ${typeof keys[0]}`);
      console.log(`First key: "${keys[0]}"`);
      console.log(`Is numeric: ${!isNaN(keys[0])}`);
      
      console.log(`\nAll keys (first 20): [${keys.slice(0, 20).join(', ')}]`);
      
      if (!isNaN(keys[0])) {
        console.log('\n⚠️  NUMERIC KEYS DETECTED!');
        console.log('\nMapping analysis (keys 50-62):');
        keys.slice(50, 63).forEach(key => {
          const index = parseInt(key);
          const mappedSymbol = symbols[index];
          console.log(`  Key "${key}" -> symbols[${index}] = "${mappedSymbol || 'UNDEFINED!'}"`);
        });
        
        console.log('\n❌ This is the problem! Numeric keys >= 100 are invalid.');
        console.log('Possible causes:');
        console.log('1. Alpaca API changed response format');
        console.log('2. Some symbols in request are invalid');
        console.log('3. API is paginating results differently');
      } else {
        console.log('\n✅ SYMBOL KEYS - This is correct!');
        console.log(`Sample keys: ${keys.slice(0, 10).join(', ')}`);
      }
      
      // Show a sample entry
      const firstKey = keys[0];
      const firstBars = response.data.bars[firstKey];
      console.log(`\nSample entry for key "${firstKey}":`);
      console.log(`  Bars count: ${Array.isArray(firstBars) ? firstBars.length : 'not array'}`);
      if (Array.isArray(firstBars) && firstBars.length > 0) {
        console.log(`  First bar:`, JSON.stringify(firstBars[0], null, 2));
      }
      
    } else {
      console.log('❌ No bars in response!');
      console.log('Response:', JSON.stringify(response.data, null, 2));
    }
    
  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    }
  }
}

testBatchIssue().catch(console.error);
