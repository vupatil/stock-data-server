/**
 * SYSTEM VERIFICATION SCRIPT
 * 
 * Tests all components of the stock-data-server to ensure it's ready to run
 */

require('dotenv').config();

console.log('\n╔═══════════════════════════════════════════════╗');
console.log('║     🔍 SYSTEM VERIFICATION                    ║');
console.log('╚═══════════════════════════════════════════════╝\n');

let passed = 0;
let failed = 0;

// Test 1: Environment Variables
console.log('📋 Checking environment variables...\n');

const required = {
  'ALPACA_API_KEY': process.env.ALPACA_API_KEY,
  'ALPACA_API_SECRET': process.env.ALPACA_API_SECRET,
  'DB_HOST': process.env.DB_HOST,
  'DB_NAME': process.env.DB_NAME,
  'DB_USER': process.env.DB_USER,
  'DB_PASSWORD': process.env.DB_PASSWORD
};

for (const [key, value] of Object.entries(required)) {
  if (value) {
    console.log(`   ✅ ${key}: ${value.substring(0, 4)}${'*'.repeat(8)}`);
    passed++;
  } else {
    console.log(`   ❌ ${key}: NOT SET`);
    failed++;
  }
}

const optional = {
  'COLLECTION_ENABLED': process.env.COLLECTION_ENABLED || 'true',
  'MAX_CANDLES_PER_INTERVAL': process.env.MAX_CANDLES_PER_INTERVAL || '600',
  'EXTENDED_HOURS_COLLECTION': process.env.EXTENDED_HOURS_COLLECTION || 'true',
  'PORT': process.env.PORT || '3002'
};

console.log('\n   Optional settings:');
for (const [key, value] of Object.entries(optional)) {
  console.log(`   ℹ️  ${key}: ${value}`);
}

// Test 2: Dependencies
console.log('\n📦 Checking dependencies...\n');

const dependencies = [
  'express',
  'mysql2',
  'axios',
  'node-cron',
  'cors',
  'helmet',
  'express-rate-limit',
  'dotenv'
];

for (const dep of dependencies) {
  try {
    require.resolve(dep);
    console.log(`   ✅ ${dep}`);
    passed++;
  } catch (e) {
    console.log(`   ❌ ${dep} - NOT INSTALLED`);
    failed++;
  }
}

// Test 3: File Structure
console.log('\n📁 Checking file structure...\n');

const fs = require('fs');
const files = [
  'collector.js',
  'server.js',
  'setup.js',
  'test-connection.js',
  'config/database.js',
  'database/schema.sql',
  '.env.example',
  'package.json',
  'README.md'
];

for (const file of files) {
  if (fs.existsSync(file)) {
    console.log(`   ✅ ${file}`);
    passed++;
  } else {
    console.log(`   ❌ ${file} - MISSING`);
    failed++;
  }
}

// Test 4: Configuration
console.log('\n⚙️  Checking configuration...\n');

const SYMBOLS = process.env.STOCK_SYMBOLS 
  ? process.env.STOCK_SYMBOLS.split(',')
  : [];

console.log(`   ℹ️  Stock symbols configured: ${SYMBOLS.length}`);
if (SYMBOLS.length > 0) {
  console.log(`   ℹ️  First 5 symbols: ${SYMBOLS.slice(0, 5).join(', ')}`);
  passed++;
} else {
  console.log(`   ⚠️  No symbols configured (will use defaults)`);
}

const GAP_FILL_PRIORITY = process.env.GAP_FILL_PRIORITY 
  ? process.env.GAP_FILL_PRIORITY.split(',')
  : [];

console.log(`   ℹ️  Gap fill priority: ${GAP_FILL_PRIORITY.join(' → ') || 'Default'}`);

// Test 5: Alpaca API Connection (Quick Check)
console.log('\n🔌 Checking Alpaca API...\n');

const axios = require('axios');

if (process.env.ALPACA_API_KEY && process.env.ALPACA_API_SECRET) {
  // Use data.alpaca.markets for both paper and live trading
  // The base URL in .env might be paper-api or api.alpaca, but data is always data.alpaca.markets
  const baseURL = 'https://data.alpaca.markets';
  
  if (process.env.ALPACA_API_KEY.startsWith('PK')) {
    console.log('   ℹ️  Detected paper trading key (PK prefix)');
  } else {
    console.log('   ℹ️  Using live trading key');
  }

  const today = new Date();
  const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  
  axios.get('/v2/stocks/bars', {
    baseURL: baseURL,
    params: {
      symbols: 'AAPL',
      timeframe: '1Day',
      start: sevenDaysAgo.toISOString().split('T')[0],
      end: today.toISOString().split('T')[0],
      limit: 5,
      feed: 'iex'  // Use IEX feed for free tier
    },
    headers: {
      'APCA-API-KEY-ID': process.env.ALPACA_API_KEY,
      'APCA-API-SECRET-KEY': process.env.ALPACA_API_SECRET
    },
    timeout: 5000
  })
  .then(response => {
    if (response.data && response.data.bars) {
      console.log(`   ✅ Alpaca API connection successful`);
      console.log(`   ℹ️  Retrieved ${Object.keys(response.data.bars).length} symbol(s)`);
      passed++;
      printSummary();
    }
  })
  .catch(error => {
    console.log(`   ❌ Alpaca API connection failed: ${error.message}`);
    failed++;
    printSummary();
  });
} else {
  console.log(`   ⚠️  Skipping Alpaca test (credentials not configured)`);
  printSummary();
}

function printSummary() {
  console.log('\n' + '═'.repeat(50));
  console.log('SUMMARY');
  console.log('═'.repeat(50) + '\n');
  
  console.log(`   ✅ Passed: ${passed}`);
  if (failed > 0) {
    console.log(`   ❌ Failed: ${failed}`);
  }
  
  console.log('\n' + '─'.repeat(50) + '\n');
  
  if (failed === 0) {
    console.log('✅ All checks passed! Your system is ready to run.\n');
    console.log('Next steps:');
    console.log('   1. node setup.js          (setup database)');
    console.log('   2. node collector.js      (start data collection)');
    console.log('   3. node server.js         (start API server)');
    console.log('\n   Or read QUICKSTART.md for detailed instructions.\n');
  } else if (failed <= 3) {
    console.log('⚠️  Some checks failed but system might still work.\n');
    console.log('Fix the failed items above, then:');
    console.log('   1. Create .env file from .env.example');
    console.log('   2. Run: npm install');
    console.log('   3. Run this script again to verify\n');
  } else {
    console.log('❌ System not ready. Please fix the issues above.\n');
    console.log('Common fixes:');
    console.log('   1. Copy .env.example to .env');
    console.log('   2. Add your Alpaca credentials to .env');
    console.log('   3. Run: npm install');
    console.log('   4. Ensure MySQL is running\n');
  }
  
  process.exit(failed === 0 ? 0 : 1);
}
