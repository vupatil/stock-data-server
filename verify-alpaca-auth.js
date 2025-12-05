/**
 * Verify Alpaca API Authentication
 * Tests if your API keys are valid
 */

require('dotenv').config();
const axios = require('axios');

async function verifyAlpacaAuth() {
  console.log('\n🔐 Verifying Alpaca API Authentication...\n');
  
  const apiKey = process.env.ALPACA_API_KEY;
  const apiSecret = process.env.ALPACA_API_SECRET;
  const baseUrl = process.env.ALPACA_BASE_URL || 'https://data.alpaca.markets';
  
  console.log('Configuration:');
  console.log(`  API Key: ${apiKey ? apiKey.substring(0, 8) + '...' : '❌ MISSING'}`);
  console.log(`  API Secret: ${apiSecret ? apiSecret.substring(0, 8) + '...' : '❌ MISSING'}`);
  console.log(`  Base URL: ${baseUrl}\n`);
  
  if (!apiKey || !apiSecret) {
    console.error('❌ Missing API credentials in .env file');
    console.log('\n📝 To fix this:');
    console.log('   1. Go to https://app.alpaca.markets/paper/dashboard/overview');
    console.log('   2. Generate new API keys (paper trading)');
    console.log('   3. Update ALPACA_API_KEY and ALPACA_API_SECRET in .env file');
    return;
  }
  
  try {
    // Test 1: Check account status
    console.log('Test 1: Checking account status...');
    const accountResponse = await axios.get('https://paper-api.alpaca.markets/v2/account', {
      headers: {
        'APCA-API-KEY-ID': apiKey,
        'APCA-API-SECRET-KEY': apiSecret
      }
    });
    
    console.log('✅ Account access successful!');
    console.log(`   Account: ${accountResponse.data.account_number}`);
    console.log(`   Status: ${accountResponse.data.status}`);
    console.log(`   Pattern Day Trader: ${accountResponse.data.pattern_day_trader}\n`);
    
    // Test 2: Fetch sample market data
    console.log('Test 2: Fetching sample market data...');
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    const dataResponse = await axios.get(`${baseUrl}/v2/stocks/bars`, {
      params: {
        symbols: 'AAPL',
        timeframe: '1Day',
        start: startDate,
        end: endDate,
        limit: 10,
        feed: 'sip'
      },
      headers: {
        'APCA-API-KEY-ID': apiKey,
        'APCA-API-SECRET-KEY': apiSecret
      }
    });
    
    if (dataResponse.data.bars && dataResponse.data.bars.AAPL) {
      console.log('✅ Market data access successful!');
      console.log(`   Symbol: AAPL`);
      console.log(`   Bars received: ${dataResponse.data.bars.AAPL.length}`);
      console.log(`   Sample bar:`, dataResponse.data.bars.AAPL[0]);
    } else {
      console.log('⚠️  No data returned, but API accepted the request');
    }
    
    console.log('\n✅ All tests passed! Your Alpaca credentials are valid.\n');
    
  } catch (error) {
    console.error('\n❌ Authentication failed!\n');
    
    if (error.response) {
      console.error('Error details:');
      console.error(`  Status: ${error.response.status}`);
      console.error(`  Message: ${error.response.data.message || error.response.statusText}`);
      console.error(`  URL: ${error.config.url}`);
      
      if (error.response.status === 403) {
        console.log('\n🔍 Troubleshooting 403 Forbidden:');
        console.log('   1. Your API keys may be invalid or expired');
        console.log('   2. You might be using paper trading keys with production endpoints');
        console.log('   3. Your API keys may have been regenerated on Alpaca\'s website');
        console.log('\n💡 Solution:');
        console.log('   1. Go to https://app.alpaca.markets/paper/dashboard/overview');
        console.log('   2. Click "View" or "Regenerate" API keys');
        console.log('   3. Copy the new keys to your .env file:');
        console.log('      ALPACA_API_KEY=your_new_key_here');
        console.log('      ALPACA_API_SECRET=your_new_secret_here');
      } else if (error.response.status === 401) {
        console.log('\n🔍 Troubleshooting 401 Unauthorized:');
        console.log('   Your API keys are not recognized by Alpaca');
        console.log('   Please verify you copied them correctly from the dashboard');
      }
    } else {
      console.error('Error:', error.message);
    }
    
    console.log('\n');
  }
}

verifyAlpacaAuth();
