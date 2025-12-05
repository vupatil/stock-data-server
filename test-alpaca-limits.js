/**
 * Test Alpaca API limits
 * Check how much data Alpaca actually returns
 */

require('dotenv').config();
const providerManager = require('./src/providers/ProviderManager');

async function testAlpacaLimits() {
  console.log('\n🔍 Testing Alpaca API Data Limits\n');
  console.log('=' .repeat(60));
  
  try {
    await providerManager.initialize();
    
    const symbol = 'AAPL';
    const interval = '1d';
    
    // Test different date ranges
    const tests = [
      { days: 365, label: '1 year' },
      { days: 730, label: '2 years' },
      { days: 1095, label: '3 years' },
      { days: 1460, label: '4 years' },
      { days: 1825, label: '5 years' }
    ];
    
    for (const test of tests) {
      const endDate = new Date().toISOString().split('T')[0];
      const startDate = new Date(Date.now() - test.days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      
      console.log(`\n📊 Testing ${test.label} (${startDate} to ${endDate})...`);
      
      try {
        const result = await providerManager.fetchBars(symbol, interval, startDate, endDate);
        
        if (result.bars && result.bars.length > 0) {
          console.log(`  ✓ Returned: ${result.bars.length} bars`);
          console.log(`  ✓ Source: ${result.source}`);
          console.log(`  ✓ First bar: ${result.bars[0].t}`);
          console.log(`  ✓ Last bar: ${result.bars[result.bars.length - 1].t}`);
        } else {
          console.log(`  ⚠️  No data returned`);
        }
      } catch (error) {
        console.log(`  ✗ Error: ${error.message}`);
      }
      
      // Wait a bit to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log('\n' + '=' .repeat(60));
    console.log('\n💡 Conclusion:');
    console.log('   Alpaca appears to have a limit on historical data.');
    console.log('   Adjust collection date ranges based on actual limits.\n');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testAlpacaLimits();
