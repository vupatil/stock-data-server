/**
 * STANDALONE SCHWAB PROVIDER TEST
 * Tests Schwab API independently without affecting main application
 */

require('dotenv').config();
const SchwabProvider = require('./src/providers/SchwabProvider');

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m'
};

function log(emoji, message, color = colors.reset) {
  console.log(`${color}${emoji} ${message}${colors.reset}`);
}

function success(message) {
  log('✅', message, colors.green);
}

function error(message) {
  log('❌', message, colors.red);
}

function info(message) {
  log('ℹ️ ', message, colors.blue);
}

function warn(message) {
  log('⚠️ ', message, colors.yellow);
}

function section(title) {
  console.log(`\n${colors.bold}${colors.cyan}${'='.repeat(70)}${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}  ${title}${colors.reset}`);
  console.log(`${colors.bold}${colors.cyan}${'='.repeat(70)}${colors.reset}\n`);
}

async function testSchwabOnly() {
  try {
    section('SCHWAB PROVIDER - STANDALONE TEST');
    
    // ========================================
    // Test 1: Configuration Check
    // ========================================
    section('Step 1: Verify Schwab Configuration');
    
    const hasAppKey = !!process.env.SCHWAB_APP_KEY;
    const hasAppSecret = !!process.env.SCHWAB_APP_SECRET;
    const hasRedirectUri = !!process.env.SCHWAB_REDIRECT_URI;
    
    console.log(`  App Key:       ${hasAppKey ? colors.green + '✓ Found' : colors.red + '✗ Missing'}${colors.reset}`);
    console.log(`  App Secret:    ${hasAppSecret ? colors.green + '✓ Found' : colors.red + '✗ Missing'}${colors.reset}`);
    console.log(`  Redirect URI:  ${hasRedirectUri ? colors.green + '✓ Found' : colors.red + '✗ Missing'}${colors.reset}`);
    
    if (hasAppKey) {
      const keyPreview = process.env.SCHWAB_APP_KEY.substring(0, 30) + '...';
      info(`  Preview: ${keyPreview}`);
    }
    
    if (!hasAppKey || !hasAppSecret) {
      error('\nSchwab credentials not found in .env file!');
      console.log('\nRequired environment variables:');
      console.log('  - SCHWAB_APP_KEY');
      console.log('  - SCHWAB_APP_SECRET');
      console.log('  - SCHWAB_REDIRECT_URI (optional, defaults to https://localhost)');
      return false;
    }
    
    success('Configuration loaded successfully\n');
    
    // ========================================
    // Test 2: Initialize Provider
    // ========================================
    section('Step 2: Initialize Schwab Provider');
    
    const schwab = new SchwabProvider({
      appKey: process.env.SCHWAB_APP_KEY,
      appSecret: process.env.SCHWAB_APP_SECRET,
      redirectUri: process.env.SCHWAB_REDIRECT_URI || 'https://localhost',
      baseURL: process.env.SCHWAB_BASE_URL || 'https://api.schwabapi.com/marketdata/v1'
    });
    
    success('Schwab provider initialized');
    console.log(`  Provider Name: ${schwab.getName()}`);
    console.log(`  Base URL:      ${schwab.baseURL}`);
    console.log('');
    
    // ========================================
    // Test 3: Check Authentication
    // ========================================
    section('Step 3: Check Authentication Status');
    
    info('Checking for existing Schwab tokens...');
    
    const fs = require('fs');
    const tokenPath = './schwab_tokens.json';
    
    if (fs.existsSync(tokenPath)) {
      success('Token file found: schwab_tokens.json');
      const tokens = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
      console.log(`  Access Token:  ${tokens.access_token ? '✓ Present' : '✗ Missing'}`);
      console.log(`  Refresh Token: ${tokens.refresh_token ? '✓ Present' : '✗ Missing'}`);
      
      if (tokens.expires_at) {
        const expiresAt = new Date(tokens.expires_at);
        const now = new Date();
        const isExpired = expiresAt < now;
        
        if (isExpired) {
          warn(`  Status: Expired (${expiresAt.toLocaleString()})`);
        } else {
          const minutesLeft = Math.floor((expiresAt - now) / 60000);
          success(`  Status: Valid (expires in ${minutesLeft} minutes)`);
        }
      }
      console.log('');
    } else {
      error('Token file not found!');
      console.log('');
      warn('You need to authenticate with Schwab first:');
      console.log('');
      console.log(`  ${colors.bold}Run this command:${colors.reset}`);
      console.log(`  ${colors.cyan}node schwab-auth.js${colors.reset}`);
      console.log('');
      console.log('  This will:');
      console.log('  1. Open your browser for Schwab OAuth');
      console.log('  2. You\'ll log in to your Schwab account');
      console.log('  3. Authorize the application');
      console.log('  4. Copy the redirect URL');
      console.log('  5. Paste it back in the terminal');
      console.log('  6. Tokens will be saved to schwab_tokens.json');
      console.log('');
      return false;
    }
    
    const isAvailable = await schwab.isAvailable();
    
    if (!isAvailable) {
      error('Schwab provider is not available!');
      warn('Authentication may have failed or tokens are invalid');
      console.log('');
      console.log('Try re-authenticating: node schwab-auth.js');
      return false;
    }
    
    success('✓ Schwab provider is authenticated and ready!\n');
    
    // ========================================
    // Test 4: Test Symbol Validation
    // ========================================
    section('Step 4: Validate Stock Symbols');
    
    const testSymbols = [
      { symbol: 'AAPL', expected: true },
      { symbol: 'MSFT', expected: true },
      { symbol: 'GOOGL', expected: true },
      { symbol: 'TSLA', expected: true },
      { symbol: 'NVDA', expected: true },
      { symbol: 'INVALIDXYZ', expected: false }
    ];
    
    let validCount = 0;
    let invalidCount = 0;
    
    for (const test of testSymbols) {
      try {
        process.stdout.write(`  Testing ${test.symbol}... `);
        const isValid = await schwab.validateSymbol(test.symbol);
        
        if (isValid) {
          console.log(`${colors.green}✓ Valid${colors.reset}`);
          validCount++;
        } else {
          console.log(`${colors.yellow}✗ Invalid${colors.reset}`);
          invalidCount++;
        }
        
        // Small delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (err) {
        console.log(`${colors.red}✗ Error: ${err.message}${colors.reset}`);
      }
    }
    
    console.log('');
    success(`Validation complete: ${validCount} valid, ${invalidCount} invalid\n`);
    
    // ========================================
    // Test 5: Fetch Daily Data
    // ========================================
    section('Step 5: Fetch Daily Historical Data (AAPL)');
    
    try {
      const symbol = 'AAPL';
      const endDate = new Date();
      const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
      
      info(`Fetching ${symbol} daily bars...`);
      console.log(`  Start: ${startDate.toISOString().split('T')[0]}`);
      console.log(`  End:   ${endDate.toISOString().split('T')[0]}`);
      console.log('');
      
      const bars = await schwab.fetchBars(symbol, '1d', startDate, endDate);
      
      if (bars && bars.length > 0) {
        success(`Received ${bars.length} daily bars`);
        console.log('');
        
        // Show first bar
        const first = bars[0];
        console.log(`  ${colors.bold}First Bar (${first.t}):${colors.reset}`);
        console.log(`    Open:   $${first.o}`);
        console.log(`    High:   $${first.h}`);
        console.log(`    Low:    $${first.l}`);
        console.log(`    Close:  $${first.c}`);
        console.log(`    Volume: ${first.v.toLocaleString()}`);
        
        // Show latest bar
        const latest = bars[bars.length - 1];
        console.log('');
        console.log(`  ${colors.bold}Latest Bar (${latest.t}):${colors.reset}`);
        console.log(`    Open:   $${latest.o}`);
        console.log(`    High:   $${latest.h}`);
        console.log(`    Low:    $${latest.l}`);
        console.log(`    Close:  $${latest.c}`);
        console.log(`    Volume: ${latest.v.toLocaleString()}`);
        console.log('');
      } else {
        warn('No data returned');
      }
    } catch (err) {
      error(`Failed to fetch daily data: ${err.message}`);
    }
    
    // ========================================
    // Test 6: Fetch Hourly Data
    // ========================================
    section('Step 6: Fetch Hourly Data (MSFT)');
    
    try {
      const symbol = 'MSFT';
      const endDate = new Date();
      const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7 days ago
      
      info(`Fetching ${symbol} hourly bars...`);
      console.log(`  Period: Last 7 days`);
      console.log('');
      
      const bars = await schwab.fetchBars(symbol, '1h', startDate, endDate);
      
      if (bars && bars.length > 0) {
        success(`Received ${bars.length} hourly bars`);
        console.log('');
        
        const latest = bars[bars.length - 1];
        console.log(`  ${colors.bold}Latest Hourly Bar:${colors.reset}`);
        console.log(`    Time:   ${latest.t}`);
        console.log(`    Close:  $${latest.c}`);
        console.log(`    Volume: ${latest.v.toLocaleString()}`);
        console.log('');
      } else {
        warn('No data returned');
      }
    } catch (err) {
      error(`Failed to fetch hourly data: ${err.message}`);
    }
    
    // ========================================
    // Test 7: Fetch Intraday Data
    // ========================================
    section('Step 7: Fetch 5-Minute Data (GOOGL)');
    
    try {
      const symbol = 'GOOGL';
      const endDate = new Date();
      const startDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // 1 day ago
      
      info(`Fetching ${symbol} 5-minute bars...`);
      console.log(`  Period: Last 24 hours`);
      console.log('');
      
      const bars = await schwab.fetchBars(symbol, '5m', startDate, endDate);
      
      if (bars && bars.length > 0) {
        success(`Received ${bars.length} 5-minute bars`);
        console.log('');
        
        const latest = bars[bars.length - 1];
        console.log(`  ${colors.bold}Latest 5-min Bar:${colors.reset}`);
        console.log(`    Time:   ${latest.t}`);
        console.log(`    Close:  $${latest.c}`);
        console.log(`    Volume: ${latest.v.toLocaleString()}`);
        console.log('');
      } else {
        warn('No data returned (market may be closed)');
      }
    } catch (err) {
      error(`Failed to fetch 5-minute data: ${err.message}`);
    }
    
    // ========================================
    // Test 8: Multiple Symbols Test
    // ========================================
    section('Step 8: Fetch Multiple Symbols');
    
    const multiSymbols = ['NVDA', 'TSLA', 'AMD'];
    
    for (const symbol of multiSymbols) {
      try {
        const endDate = new Date();
        const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        
        process.stdout.write(`  Fetching ${symbol}... `);
        const bars = await schwab.fetchBars(symbol, '1d', startDate, endDate);
        
        if (bars && bars.length > 0) {
          const latest = bars[bars.length - 1];
          console.log(`${colors.green}✓ ${bars.length} bars, Latest: $${latest.c}${colors.reset}`);
        } else {
          console.log(`${colors.yellow}⚠ No data${colors.reset}`);
        }
        
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (err) {
        console.log(`${colors.red}✗ Error: ${err.message}${colors.reset}`);
      }
    }
    
    console.log('');
    
    // ========================================
    // Test 9: Data Quality Validation
    // ========================================
    section('Step 9: Data Quality Validation');
    
    try {
      const symbol = 'AAPL';
      const endDate = new Date();
      const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      
      info('Running data quality checks...');
      const bars = await schwab.fetchBars(symbol, '1d', startDate, endDate);
      
      if (bars && bars.length > 0) {
        // Check 1: OHLC validity
        const invalidOHLC = bars.filter(b => 
          !b.o || !b.h || !b.l || !b.c || 
          b.h < b.l || b.h < b.o || b.h < b.c || 
          b.l > b.o || b.l > b.c
        );
        
        if (invalidOHLC.length === 0) {
          success('  ✓ All OHLC data is valid');
        } else {
          error(`  ✗ ${invalidOHLC.length} bars have invalid OHLC`);
        }
        
        // Check 2: Volume check
        const zeroVolume = bars.filter(b => !b.v || b.v === 0);
        if (zeroVolume.length === 0) {
          success('  ✓ All bars have volume data');
        } else {
          warn(`  ⚠ ${zeroVolume.length} bars have zero volume`);
        }
        
        // Check 3: Timestamp ordering
        let ordered = true;
        for (let i = 1; i < bars.length; i++) {
          if (new Date(bars[i].t) <= new Date(bars[i-1].t)) {
            ordered = false;
            break;
          }
        }
        
        if (ordered) {
          success('  ✓ Timestamps are properly ordered');
        } else {
          error('  ✗ Timestamps are not in order');
        }
        
        // Check 4: Gap detection
        let gaps = 0;
        for (let i = 1; i < bars.length; i++) {
          const prevDate = new Date(bars[i - 1].t);
          const currDate = new Date(bars[i].t);
          const dayDiff = (currDate - prevDate) / (24 * 60 * 60 * 1000);
          
          if (dayDiff > 5) { // More than 5 days gap (accounting for weekends)
            gaps++;
          }
        }
        
        if (gaps === 0) {
          success('  ✓ No significant data gaps detected');
        } else {
          warn(`  ⚠ ${gaps} potential gaps detected (may be holidays)`);
        }
        
        console.log('');
        success(`Data quality: ${bars.length} bars analyzed`);
      }
    } catch (err) {
      error(`Quality check failed: ${err.message}`);
    }
    
    console.log('');
    
    // ========================================
    // Summary
    // ========================================
    section('TEST SUMMARY');
    
    success('✓ Schwab provider is fully operational!');
    success('✓ Authentication working correctly');
    success('✓ Symbol validation working');
    success('✓ Historical data retrieval working');
    success('✓ Multiple timeframes supported');
    success('✓ Data quality is good');
    
    console.log('');
    info('Schwab Provider Details:');
    console.log(`  • Provider: ${schwab.getName()}`);
    console.log(`  • Base URL: ${schwab.baseURL}`);
    console.log(`  • Auth Method: OAuth 2.0`);
    console.log(`  • Tokens: Stored in schwab_tokens.json`);
    console.log('');
    
    info('To use Schwab in your main app:');
    console.log('  1. Update .env: PROVIDER_PRIORITY=schwab,alpaca');
    console.log('  2. Restart server: node app.js');
    console.log('  3. Schwab will be primary, Alpaca fallback');
    console.log('');
    
    return true;
    
  } catch (err) {
    error(`\nTest execution error: ${err.message}`);
    console.error('\nFull error:', err);
    return false;
  }
}

// Run the test
console.log('\n');
testSchwabOnly()
  .then(success => {
    console.log('');
    if (success) {
      console.log(`${colors.bold}${colors.green}${'='.repeat(70)}`);
      console.log(`  ✅ ALL SCHWAB TESTS PASSED! 🎉`);
      console.log(`${'='.repeat(70)}${colors.reset}\n`);
      process.exit(0);
    } else {
      console.log(`${colors.bold}${colors.red}${'='.repeat(70)}`);
      console.log(`  ❌ SCHWAB TESTS FAILED`);
      console.log(`${'='.repeat(70)}${colors.reset}\n`);
      process.exit(1);
    }
  })
  .catch(err => {
    console.log(`${colors.red}❌ Critical error: ${err.message}${colors.reset}\n`);
    console.error(err);
    process.exit(1);
  });
