/**
 * Test Alpaca API Connection
 */

const axios = require('axios');
require('dotenv').config();

async function test() {
  console.log('\n╔═══════════════════════════════════════════════╗');
  console.log('║     🧪 TESTING ALPACA CONNECTION            ║');
  console.log('╚═══════════════════════════════════════════════╝\n');
  
  const apiKey = process.env.ALPACA_API_KEY;
  const apiSecret = process.env.ALPACA_API_SECRET;
  
  if (!apiKey || !apiSecret) {
    console.error('❌ API credentials not found');
    console.log('\nPlease configure .env file:');
    console.log('1. Copy .env.example to .env');
    console.log('2. Add your Alpaca credentials:');
    console.log('   ALPACA_API_KEY=your_key');
    console.log('   ALPACA_API_SECRET=your_secret\n');
    console.log('Get FREE API keys: https://app.alpaca.markets/paper/dashboard/overview\n');
    process.exit(1);
  }
  
  console.log('✅ API credentials found');
  console.log(`   Key: ${apiKey.substring(0, 10)}...\n`);
  
  try {
    // Test 1: Account
    console.log('📋 Test 1: Checking account...');
    const accountResponse = await axios.get('https://paper-api.alpaca.markets/v2/account', {
      headers: {
        'APCA-API-KEY-ID': apiKey,
        'APCA-API-SECRET-KEY': apiSecret
      },
      timeout: 10000
    });
    console.log(`✅ Account verified`);
    console.log(`   Status: ${accountResponse.data.status}`);
    
    // Test 2: Single symbol
    console.log('\n📊 Test 2: Fetching AAPL data...');
    const end = new Date();
    const start = new Date(end.getTime() - 60 * 60 * 1000);
    
    const singleResponse = await axios.get('https://data.alpaca.markets/v2/stocks/bars', {
      headers: {
        'APCA-API-KEY-ID': apiKey,
        'APCA-API-SECRET-KEY': apiSecret
      },
      params: {
        symbols: 'AAPL',
        timeframe: '1Min',
        start: start.toISOString(),
        end: end.toISOString(),
        feed: 'iex'
      },
      timeout: 10000
    });
    
    const aaplBars = singleResponse.data.bars?.AAPL || [];
    console.log(`✅ AAPL: ${aaplBars.length} bars retrieved`);
    if (aaplBars.length > 0) {
      const last = aaplBars[aaplBars.length - 1];
      console.log(`   Latest: $${last.c} at ${new Date(last.t).toLocaleTimeString()}`);
    }
    
    // Test 3: Multiple symbols (batch)
    console.log('\n📦 Test 3: Testing batch request (10 symbols)...');
    const symbols = ['AAPL', 'TSLA', 'MSFT', 'GOOGL', 'AMZN', 'META', 'NVDA', 'AMD', 'NFLX', 'INTC'];
    
    const batchResponse = await axios.get('https://data.alpaca.markets/v2/stocks/bars', {
      headers: {
        'APCA-API-KEY-ID': apiKey,
        'APCA-API-SECRET-KEY': apiSecret
      },
      params: {
        symbols: symbols.join(','),
        timeframe: '1Min',
        start: start.toISOString(),
        end: end.toISOString(),
        feed: 'iex',
        limit: 1000
      },
      timeout: 15000
    });
    
    const batchBars = batchResponse.data.bars || {};
    console.log(`✅ Batch request: ${Object.keys(batchBars).length} symbols returned`);
    
    let totalBars = 0;
    for (const [sym, bars] of Object.entries(batchBars)) {
      const count = bars ? bars.length : 0;
      totalBars += count;
      if (count > 0) {
        console.log(`   ${sym}: ${count} bars`);
      }
    }
    console.log(`   Total: ${totalBars} bars`);
    
    console.log('\n╔═══════════════════════════════════════════════╗');
    console.log('║     ✅ ALL TESTS PASSED!                     ║');
    console.log('╚═══════════════════════════════════════════════╝\n');
    
    console.log('Your Alpaca API is working correctly! 🎉\n');
    console.log('Next steps:');
    console.log('1. Run: npm run setup (create database)');
    console.log('2. Run: npm run collector (start collecting data)');
    console.log('3. Run: npm start (start API server)\n');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.response?.data || error.message);
    
    if (error.response?.status === 401) {
      console.log('\n⚠️  Authentication failed');
      console.log('Please check your API credentials in .env file');
    } else if (error.response?.status === 403) {
      console.log('\n⚠️  Permission denied');
      console.log('Your API key may not have market data access');
    } else if (error.response?.status === 429) {
      console.log('\n⚠️  Rate limit exceeded');
      console.log('Wait a moment and try again');
    } else if (error.code === 'ECONNREFUSED') {
      console.log('\n⚠️  Connection refused');
      console.log('Check your internet connection');
    }
    
    console.log();
    process.exit(1);
  }
}

test();
