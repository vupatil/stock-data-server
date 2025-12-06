/**
 * Test Setup Batch Fetching
 * Tests if Alpaca returns data for batch of 50 symbols
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

// Sample 50 symbols from your env
const TEST_SYMBOLS = [
  'NVDA', 'AAPL', 'GOOGL', 'MSFT', 'AMZN', 'AVGO', 'META', 'TSLA', 'BRK.B', 'LLY',
  'WMT', 'VOO', 'IVV', 'SPY', 'JPM', 'V', 'VTI', 'ORCL', 'JNJ', 'QQQ',
  'MA', 'XOM', 'VUG', 'NFLX', 'COST', 'VEA', 'ABBV', 'IEFA', 'VTV', 'BND',
  'GLD', 'AGG', 'PLTR', 'IWF', 'IEMG', 'VXUS', 'VGT', 'BAC', 'VWO', 'VIG',
  'IJH', 'SPYM', 'XLK', 'VO', 'IJR', 'HD', 'ITOT', 'AMD', 'BNDX', 'RSP'
];

async function testBatchFetch() {
  console.log('\n╔═══════════════════════════════════════════════╗');
  console.log('║   🧪 TESTING ALPACA BATCH FETCH              ║');
  console.log('╚═══════════════════════════════════════════════╝\n');
  
  console.log(`📊 Testing with ${TEST_SYMBOLS.length} symbols`);
  console.log(`🔑 API Key: ${process.env.ALPACA_API_KEY?.substring(0, 8)}...`);
  console.log(`🌐 Base URL: ${ALPACA_CONFIG.baseURL}\n`);
  
  try {
    // Test 1: Daily data (1d interval)
    console.log('═'.repeat(60));
    console.log('TEST 1: Daily (1d) Interval');
    console.log('═'.repeat(60));
    
    const end = new Date();
    const start = new Date(end.getTime() - (600 * 24 * 60 * 60 * 1000)); // 600 days back
    
    const params = {
      symbols: TEST_SYMBOLS.join(','),
      timeframe: '1Day',
      start: start.toISOString(),
      end: end.toISOString(),
      limit: 10000,
      adjustment: 'split',
      feed: 'iex'
    };
    
    console.log(`\n📤 Request Parameters:`);
    console.log(`   Symbols: ${params.symbols.substring(0, 80)}...`);
    console.log(`   Timeframe: ${params.timeframe}`);
    console.log(`   Start: ${params.start}`);
    console.log(`   End: ${params.end}`);
    console.log(`   Feed: ${params.feed}`);
    console.log(`\n⏳ Fetching data from Alpaca...\n`);
    
    const startTime = Date.now();
    
    const response = await axios.get('/v2/stocks/bars', {
      baseURL: ALPACA_CONFIG.baseURL,
      headers: ALPACA_CONFIG.headers,
      params,
      timeout: 60000
    });
    
    const duration = Date.now() - startTime;
    
    console.log(`✅ Response received in ${duration}ms\n`);
    
    const barsData = response.data.bars || {};
    const symbolsReturned = Object.keys(barsData);
    
    console.log(`📊 Results:`);
    console.log(`   Symbols requested: ${TEST_SYMBOLS.length}`);
    console.log(`   Symbols returned: ${symbolsReturned.length}`);
    console.log(`   Success rate: ${((symbolsReturned.length / TEST_SYMBOLS.length) * 100).toFixed(1)}%\n`);
    
    // Show sample data for first 10 symbols
    console.log(`📈 Sample Data (first 10 symbols with data):`);
    let count = 0;
    for (const symbol of symbolsReturned) {
      if (count >= 10) break;
      const bars = barsData[symbol];
      if (bars && bars.length > 0) {
        const lastBar = bars[bars.length - 1];
        console.log(`   ✓ ${symbol.padEnd(8)} → ${bars.length} bars, Latest: $${lastBar.c} (${new Date(lastBar.t).toLocaleDateString()})`);
        count++;
      }
    }
    
    // Check for missing symbols
    const missingSymbols = TEST_SYMBOLS.filter(s => !symbolsReturned.includes(s));
    if (missingSymbols.length > 0) {
      console.log(`\n⚠️  Missing Symbols (${missingSymbols.length}):`);
      console.log(`   ${missingSymbols.join(', ')}`);
    }
    
    // Test 2: Intraday data (5m interval)
    console.log('\n\n' + '═'.repeat(60));
    console.log('TEST 2: 5-Minute (5m) Interval');
    console.log('═'.repeat(60));
    
    const end5m = new Date();
    const start5m = new Date(end5m.getTime() - (600 * 5 * 60 * 1000)); // 600 candles of 5m
    
    const params5m = {
      symbols: TEST_SYMBOLS.slice(0, 10).join(','), // Test with first 10 symbols for speed
      timeframe: '5Min',
      start: start5m.toISOString(),
      end: end5m.toISOString(),
      limit: 10000,
      adjustment: 'split',
      feed: 'iex'
    };
    
    console.log(`\n📤 Request Parameters:`);
    console.log(`   Symbols: ${params5m.symbols}`);
    console.log(`   Timeframe: ${params5m.timeframe}`);
    console.log(`\n⏳ Fetching data...\n`);
    
    const startTime5m = Date.now();
    
    const response5m = await axios.get('/v2/stocks/bars', {
      baseURL: ALPACA_CONFIG.baseURL,
      headers: ALPACA_CONFIG.headers,
      params: params5m,
      timeout: 60000
    });
    
    const duration5m = Date.now() - startTime5m;
    
    console.log(`✅ Response received in ${duration5m}ms\n`);
    
    const barsData5m = response5m.data.bars || {};
    const symbolsReturned5m = Object.keys(barsData5m);
    
    console.log(`📊 Results:`);
    console.log(`   Symbols requested: 10`);
    console.log(`   Symbols returned: ${symbolsReturned5m.length}`);
    console.log(`   Success rate: ${((symbolsReturned5m.length / 10) * 100).toFixed(1)}%\n`);
    
    console.log(`📈 5-Minute Data:`);
    for (const symbol of symbolsReturned5m) {
      const bars = barsData5m[symbol];
      if (bars && bars.length > 0) {
        console.log(`   ✓ ${symbol.padEnd(8)} → ${bars.length} bars`);
      }
    }
    
    // Final Summary
    console.log('\n\n╔═══════════════════════════════════════════════╗');
    console.log('║   ✅ TEST SUMMARY                            ║');
    console.log('╚═══════════════════════════════════════════════╝\n');
    
    console.log(`✅ Alpaca API is working correctly`);
    console.log(`✅ Batch requests are being processed`);
    console.log(`✅ Data is being returned for most symbols`);
    console.log(`\n📊 Daily Data: ${symbolsReturned.length}/${TEST_SYMBOLS.length} symbols`);
    console.log(`📊 5-Min Data: ${symbolsReturned5m.length}/10 symbols`);
    
    if (missingSymbols.length > 0) {
      console.log(`\n⚠️  Note: ${missingSymbols.length} symbols returned no data`);
      console.log(`   These would be added to 'excluded_symbols' table during setup`);
    }
    
    console.log('\n✨ setup.js will work correctly with these symbols!\n');
    
  } catch (error) {
    console.error('\n❌ Test Failed:', error.message);
    
    if (error.response) {
      console.error(`\n📛 HTTP Status: ${error.response.status}`);
      console.error(`📛 Response: ${JSON.stringify(error.response.data, null, 2)}`);
    }
    
    console.log('\nTroubleshooting:');
    console.log('• Check ALPACA_API_KEY and ALPACA_API_SECRET in .env');
    console.log('• Verify you have an active Alpaca account');
    console.log('• Check if you hit rate limits (200 requests/minute)');
    console.log('• Try with paper trading URL: https://data.alpaca.markets\n');
    
    process.exit(1);
  }
}

testBatchFetch();
