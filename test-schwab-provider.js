/**
 * Test Schwab Provider Integration
 * Tests OAuth authentication and data fetching
 */

require('dotenv').config();
const providerManager = require('./src/providers/ProviderManager');

// Test symbols
const TEST_SYMBOLS = ['AAPL', 'MSFT', 'GOOGL', 'NVDA', 'VYM'];
const TEST_INTERVAL = '1d';

async function testSchwabProvider() {
  console.log('\n🧪 Testing Schwab Provider Integration\n');
  console.log('=' .repeat(60));

  try {
    // Step 1: Initialize providers
    console.log('\n📋 Step 1: Initialize providers...');
    await providerManager.initialize();
    console.log('✅ Providers initialized successfully');

    // Step 2: Test symbol validation
    console.log('\n📋 Step 2: Test symbol validation...');
    for (const symbol of TEST_SYMBOLS) {
      const isValid = await providerManager.validateSymbol(symbol);
      console.log(`   ${symbol}: ${isValid ? '✅ Valid' : '❌ Invalid'}`);
    }

    // Step 3: Test invalid symbol
    console.log('\n📋 Step 3: Test invalid symbol...');
    const invalidSymbol = 'ABCDEF12345';
    const isValidInvalid = await providerManager.validateSymbol(invalidSymbol);
    console.log(`   ${invalidSymbol}: ${isValidInvalid ? '✅ Valid' : '❌ Invalid (expected)'}`);

    // Step 4: Fetch actual data
    console.log('\n📋 Step 4: Fetch bar data for AAPL...');
    const endDate = new Date();
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 7); // Last 7 days

    const result = await providerManager.fetchBars(
      'AAPL',
      TEST_INTERVAL,
      startDate.toISOString().split('T')[0], // YYYY-MM-DD format
      endDate.toISOString().split('T')[0]
    );

    console.log(`   Source: ${result.source}`);
    console.log(`   Bars received: ${result.bars.length}`);
    
    if (result.bars.length > 0) {
      const sample = result.bars[0];
      console.log('\n   Sample bar:');
      console.log(`   - Time: ${new Date(sample.t).toISOString()}`);
      console.log(`   - Open: $${sample.o}`);
      console.log(`   - High: $${sample.h}`);
      console.log(`   - Low: $${sample.l}`);
      console.log(`   - Close: $${sample.c}`);
      console.log(`   - Volume: ${sample.v.toLocaleString()}`);
    }

    // Step 5: Test multiple symbols
    console.log('\n📋 Step 5: Fetch data for multiple symbols...');
    for (const symbol of ['MSFT', 'NVDA']) {
      const result = await providerManager.fetchBars(
        symbol,
        TEST_INTERVAL,
        startDate.toISOString().split('T')[0],
        endDate.toISOString().split('T')[0]
      );
      console.log(`   ${symbol}: ${result.bars.length} bars from ${result.source}`);
    }

    console.log('\n' + '=' .repeat(60));
    console.log('✅ All tests completed successfully!');
    console.log('=' .repeat(60) + '\n');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    
    if (error.message.includes('No data providers configured')) {
      console.log('\n⚠️  No providers available. This could mean:');
      console.log('   1. Schwab tokens not set up yet - Run: node schwab-auth.js');
      console.log('   2. Alpaca API keys missing or invalid');
    }
    
    if (error.message.includes('OAuth') || error.message.includes('token')) {
      console.log('\n💡 To set up Schwab OAuth:');
      console.log('   1. Run: node schwab-auth.js');
      console.log('   2. Follow the authentication flow');
      console.log('   3. Tokens will be saved to .schwab-tokens.json');
    }
    
    console.error('\nFull error:', error);
    process.exit(1);
  }
}

// Run the test
testSchwabProvider();
