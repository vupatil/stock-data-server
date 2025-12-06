/**
 * Investigate why some symbols return no data
 */

const axios = require('axios');
require('dotenv').config();

const ALPACA_CONFIG = {
  baseURL: process.env.ALPACA_BASE_URL || 'https://data.alpaca.markets',
  headers: {
    'APCA-API-KEY-ID': process.env.ALPACA_API_KEY,
    'APCA-API-SECRET-KEY': process.env.ALPACA_API_SECRET
  }
};

async function testIndividualSymbol(symbol) {
  try {
    const end = new Date();
    const start = new Date(end.getTime() - (10 * 24 * 60 * 60 * 1000)); // 10 days back
    
    const params = {
      symbols: symbol,
      timeframe: '1Day',
      start: start.toISOString(),
      end: end.toISOString(),
      limit: 100,
      adjustment: 'split',
      feed: 'iex'
    };
    
    const response = await axios.get('/v2/stocks/bars', {
      baseURL: ALPACA_CONFIG.baseURL,
      headers: ALPACA_CONFIG.headers,
      params,
      timeout: 10000
    });
    
    return response.data;
  } catch (error) {
    return { error: error.message };
  }
}

async function investigateMissingSymbols() {
  console.log('\n╔═══════════════════════════════════════════════╗');
  console.log('║   🔍 INVESTIGATING MISSING SYMBOLS           ║');
  console.log('╚═══════════════════════════════════════════════╝\n');
  
  const missingSymbols = ['NVDA', 'MSFT', 'TSLA', 'SPY', 'QQQ', 'VOO'];
  const workingSymbols = ['AAPL', 'GOOGL', 'AMZN', 'META'];
  
  console.log('Testing missing symbols individually:\n');
  
  for (const symbol of missingSymbols) {
    const result = await testIndividualSymbol(symbol);
    
    if (result.error) {
      console.log(`❌ ${symbol}: ERROR - ${result.error}`);
    } else if (result.bars && Object.keys(result.bars).length > 0) {
      const bars = result.bars[symbol] || result.bars[Object.keys(result.bars)[0]];
      console.log(`✓ ${symbol}: ${bars?.length || 0} bars - WORKS INDIVIDUALLY!`);
    } else {
      console.log(`⚠️  ${symbol}: No bars returned - ${JSON.stringify(result)}`);
    }
    
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  console.log('\n\nTesting working symbols individually:\n');
  
  for (const symbol of workingSymbols) {
    const result = await testIndividualSymbol(symbol);
    
    if (result.error) {
      console.log(`❌ ${symbol}: ERROR - ${result.error}`);
    } else if (result.bars && Object.keys(result.bars).length > 0) {
      const bars = result.bars[symbol] || result.bars[Object.keys(result.bars)[0]];
      console.log(`✓ ${symbol}: ${bars?.length || 0} bars`);
    } else {
      console.log(`⚠️  ${symbol}: No bars`);
    }
    
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  // Test with different feed types
  console.log('\n\n╔═══════════════════════════════════════════════╗');
  console.log('║   🔄 TESTING DIFFERENT FEED TYPES            ║');
  console.log('╚═══════════════════════════════════════════════╝\n');
  
  const testSymbols = 'NVDA,MSFT,TSLA,AAPL,GOOGL';
  
  for (const feed of ['iex', 'sip']) {
    console.log(`\nTesting feed: ${feed}`);
    
    const end = new Date();
    const start = new Date(end.getTime() - (5 * 24 * 60 * 60 * 1000));
    
    const params = {
      symbols: testSymbols,
      timeframe: '1Day',
      start: start.toISOString(),
      end: end.toISOString(),
      limit: 100,
      adjustment: 'split',
      feed: feed
    };
    
    try {
      const response = await axios.get('/v2/stocks/bars', {
        baseURL: ALPACA_CONFIG.baseURL,
        headers: ALPACA_CONFIG.headers,
        params,
        timeout: 10000
      });
      
      const symbols = Object.keys(response.data.bars || {});
      console.log(`   Feed: ${feed} → ${symbols.length} symbols: ${symbols.join(', ')}`);
    } catch (error) {
      console.log(`   Feed: ${feed} → ERROR: ${error.message}`);
    }
    
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}

investigateMissingSymbols();
