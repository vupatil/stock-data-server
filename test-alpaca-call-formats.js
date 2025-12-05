require('dotenv').config();
const axios = require('axios');

const API_KEY = process.env.ALPACA_API_KEY;
const API_SECRET = process.env.ALPACA_API_SECRET;
const BASE_URL = 'https://data.alpaca.markets';

async function testCalls() {
  const now = new Date();
  const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
  
  console.log('\n================================================================================');
  console.log('=== TEST 1: SINGLE SYMBOL (AAPL) with 5Min timeframe ===');
  console.log('================================================================================\n');
  
  console.log('📤 REQUEST TO ALPACA:');
  console.log('  URL: https://data.alpaca.markets/v2/stocks/bars');
  console.log('  Method: GET');
  console.log('  Parameters:');
  console.log('    symbols: "AAPL" (single symbol, no comma)');
  console.log('    timeframe: "5Min"');
  console.log('    start:', threeDaysAgo.toISOString());
  console.log('    end:', now.toISOString());
  console.log('    limit: 10000');
  console.log('    feed: "iex"');
  
  try {
    const singleResponse = await axios.get(`${BASE_URL}/v2/stocks/bars`, {
      params: {
        symbols: 'AAPL',
        timeframe: '5Min',
        start: threeDaysAgo.toISOString(),
        end: now.toISOString(),
        limit: 10000,
        feed: 'iex'
      },
      headers: {
        'APCA-API-KEY-ID': API_KEY,
        'APCA-API-SECRET-KEY': API_SECRET
      }
    });
    
    console.log('\n📥 RESPONSE FROM ALPACA:');
    console.log('  HTTP Status:', singleResponse.status);
    console.log('  Response type:', typeof singleResponse.data);
    console.log('  Top-level keys:', Object.keys(singleResponse.data));
    console.log('  response.data.bars type:', typeof singleResponse.data.bars);
    console.log('  response.data.bars is Array:', Array.isArray(singleResponse.data.bars));
    console.log('  response.data.bars keys:', Object.keys(singleResponse.data.bars));
    
    const barsForAAPL = singleResponse.data.bars['AAPL'];
    console.log('\n  response.data.bars["AAPL"]:');
    console.log('    Type:', Array.isArray(barsForAAPL) ? 'Array' : typeof barsForAAPL);
    console.log('    Length:', barsForAAPL?.length || 0);
    
    if (barsForAAPL && barsForAAPL.length > 0) {
      console.log('    First bar:', JSON.stringify(barsForAAPL[0], null, 2));
    }
    
    console.log('\n  STRUCTURE:');
    console.log('    {');
    console.log('      "bars": {');
    console.log('        "AAPL": [array of', barsForAAPL?.length || 0, 'bar objects]');
    console.log('      },');
    console.log('      "next_page_token": null');
    console.log('    }');
    
  } catch (error) {
    console.error('❌ ERROR:', error.response?.data || error.message);
  }
  
  console.log('\n\n================================================================================');
  console.log('=== TEST 2: MULTIPLE SYMBOLS (AAPL,NVDA,MSFT) with 5Min timeframe ===');
  console.log('================================================================================\n');
  
  console.log('📤 REQUEST TO ALPACA:');
  console.log('  URL: https://data.alpaca.markets/v2/stocks/bars');
  console.log('  Method: GET');
  console.log('  Parameters:');
  console.log('    symbols: "AAPL,NVDA,MSFT" (comma-separated list)');
  console.log('    timeframe: "5Min"');
  console.log('    start:', threeDaysAgo.toISOString());
  console.log('    end:', now.toISOString());
  console.log('    limit: 10000');
  console.log('    feed: "iex"');
  
  try {
    const batchResponse = await axios.get(`${BASE_URL}/v2/stocks/bars`, {
      params: {
        symbols: 'AAPL,NVDA,MSFT',
        timeframe: '5Min',
        start: threeDaysAgo.toISOString(),
        end: now.toISOString(),
        limit: 10000,
        feed: 'iex'
      },
      headers: {
        'APCA-API-KEY-ID': API_KEY,
        'APCA-API-SECRET-KEY': API_SECRET
      }
    });
    
    console.log('\n📥 RESPONSE FROM ALPACA:');
    console.log('  HTTP Status:', batchResponse.status);
    console.log('  Response type:', typeof batchResponse.data);
    console.log('  Top-level keys:', Object.keys(batchResponse.data));
    console.log('  response.data.bars type:', typeof batchResponse.data.bars);
    console.log('  response.data.bars is Array:', Array.isArray(batchResponse.data.bars));
    console.log('  response.data.bars keys:', Object.keys(batchResponse.data.bars));
    
    console.log('\n  Bars per symbol:');
    Object.entries(batchResponse.data.bars).forEach(([symbol, bars]) => {
      console.log(`    response.data.bars["${symbol}"]:`);
      console.log(`      Type: ${Array.isArray(bars) ? 'Array' : typeof bars}`);
      console.log(`      Length: ${bars?.length || 0}`);
      if (bars && bars.length > 0) {
        console.log(`      First bar: ${JSON.stringify(bars[0])}`);
      }
    });
    
    console.log('\n  STRUCTURE:');
    console.log('    {');
    console.log('      "bars": {');
    Object.entries(batchResponse.data.bars).forEach(([symbol, bars]) => {
      console.log(`        "${symbol}": [array of ${bars?.length || 0} bar objects],`);
    });
    console.log('      },');
    console.log('      "next_page_token": null');
    console.log('    }');
    
  } catch (error) {
    console.error('❌ ERROR:', error.response?.data || error.message);
  }
  
  console.log('\n\n================================================================================');
  console.log('=== KEY OBSERVATIONS ===');
  console.log('================================================================================\n');
  
  console.log('✅ SINGLE SYMBOL REQUEST (symbols: "AAPL"):');
  console.log('   - Returns: { "bars": { "AAPL": [array of bars] } }');
  console.log('   - response.data.bars is OBJECT (not array)');
  console.log('   - response.data.bars has 1 key: "AAPL"');
  console.log('   - response.data.bars["AAPL"] is ARRAY of bar objects');
  console.log('   - If AAPL has 66 bars → Object.keys(response.data.bars) = ["AAPL"] (length: 1)');
  
  console.log('\n✅ BATCH REQUEST (symbols: "AAPL,NVDA,MSFT"):');
  console.log('   - Returns: { "bars": { "AAPL": [bars], "NVDA": [bars], "MSFT": [bars] } }');
  console.log('   - response.data.bars is OBJECT (not array)');
  console.log('   - response.data.bars has 3 keys: ["AAPL", "NVDA", "MSFT"]');
  console.log('   - Each key points to an ARRAY of bar objects');
  console.log('   - Object.keys(response.data.bars).length = 3 (number of symbols)');
  
  console.log('\n⚠️  IMPORTANT:');
  console.log('   - BOTH formats return bars as an OBJECT with symbol keys');
  console.log('   - The difference is NUMBER OF KEYS (1 vs multiple)');
  console.log('   - NEVER returns bars as a direct array');
  console.log('   - To count symbols: Object.keys(response.data.bars).length');
  console.log('   - To count bars: response.data.bars["SYMBOL"].length');
  
  console.log('\n');
}

testCalls().then(() => {
  console.log('✅ Test complete\n');
  process.exit(0);
}).catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
