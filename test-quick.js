/**
 * QUICK INTEGRATION TEST
 * Run this after every code change to verify basic functionality
 */

const { initDB, getDB, closeDB } = require('./config/database');
const providerManager = require('./src/providers/ProviderManager');
require('dotenv').config();

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

let passCount = 0;
let failCount = 0;

function test(name, passed, details = '') {
  if (passed) {
    console.log(`${GREEN}✓${RESET} ${name}`);
    passCount++;
  } else {
    console.log(`${RED}✗${RESET} ${name}`);
    if (details) console.log(`  ${details}`);
    failCount++;
  }
}

async function quickTest() {
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║     QUICK INTEGRATION TEST SUITE      ║');
  console.log('╚════════════════════════════════════════╝\n');
  
  try {
    // Test 1: Database Connection
    await initDB();
    const db = getDB();
    test('Database connection', !!db);
    
    // Test 2: Provider initialization
    await providerManager.initialize();
    test('Provider manager initialized', true);
    
    // Test 3: Add test symbols
    const testSymbols = ['AAPL', 'MSFT', 'GOOGL'];
    
    // Clean up any invalid test symbols first
    await db.query('DELETE FROM candles WHERE stock_id IN (SELECT stock_id FROM stocks WHERE symbol LIKE \'%12345%\')');
    await db.query('DELETE FROM stocks WHERE symbol LIKE \'%12345%\'');
    
    for (const symbol of testSymbols) {
      await db.query(
        'INSERT INTO stocks (symbol, is_active) VALUES (?, TRUE) ON DUPLICATE KEY UPDATE is_active = TRUE',
        [symbol]
      );
    }
    test(`Added ${testSymbols.length} test symbols`, true);
    
    // Test 4: Retrieve active symbols
    const [rows] = await db.query('SELECT symbol FROM stocks WHERE is_active = TRUE AND symbol IN (?, ?, ?)', testSymbols);
    test('Retrieved active symbols', rows.length >= testSymbols.length, `Found ${rows.length} symbols`);
    
    // Test 5: Batch request format
    const symbolList = rows.map(r => r.symbol).join(',');
    test('Batch symbol format', symbolList.includes(','), `Format: ${symbolList}`);
    
    // Test 6: Provider batch request
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]; // 30 days
    
    console.log(`\n${YELLOW}Testing batch API call...${RESET}`);
    console.log(`  Symbols: ${symbolList}`);
    console.log(`  Interval: 1d`);
    console.log(`  Date range: ${startDate} to ${endDate}`);
    
    const result = await providerManager.fetchBars(symbolList, '1d', startDate, endDate);
    
    test('Batch API call succeeded', result && result.bars, result ? 'Success' : 'Failed');
    test('Response is object format', typeof result.bars === 'object', `Type: ${typeof result.bars}`);
    
    if (result && result.bars) {
      const returnedSymbols = Object.keys(result.bars);
      test('Multiple symbols in response', returnedSymbols.length > 1, `Got ${returnedSymbols.length} symbols`);
      
      // Test 7: Verify each symbol has data
      for (const symbol of returnedSymbols.slice(0, 3)) {
        const bars = result.bars[symbol];
        const hasData = bars && bars.length > 0;
        test(`  ${symbol} has bars`, hasData, hasData ? `${bars.length} bars` : 'No data');
      }
      
      // Test 8: Bar structure validation
      const firstSymbol = returnedSymbols[0];
      const firstBar = result.bars[firstSymbol]?.[0];
      
      if (firstBar) {
        test('Bar has timestamp', !!firstBar.t);
        test('Bar has OHLC', !!(firstBar.o && firstBar.h && firstBar.l && firstBar.c));
        test('Bar has volume', firstBar.v !== undefined);
      }
    }
    
    // Test 9: Add new symbol
    const newSymbol = 'TSLA';
    await db.query(
      'INSERT INTO stocks (symbol, is_active) VALUES (?, TRUE) ON DUPLICATE KEY UPDATE is_active = TRUE',
      [newSymbol]
    );
    test('Added new symbol (TSLA)', true);
    
    // Test 10: Verify new symbol in active list
    const [newRows] = await db.query('SELECT symbol FROM stocks WHERE is_active = TRUE AND symbol = ?', [newSymbol]);
    test('New symbol in database', newRows.length > 0);
    
    // Test 11: Next batch includes new symbol
    const [allRows] = await db.query('SELECT symbol FROM stocks WHERE is_active = TRUE');
    const includesNew = allRows.some(r => r.symbol === newSymbol);
    test('New symbol will be in next batch', includesNew, `Total symbols: ${allRows.length}`);
    
    console.log('\n' + '─'.repeat(40));
    console.log(`Results: ${GREEN}${passCount} passed${RESET}, ${failCount > 0 ? RED : ''}${failCount} failed${RESET}`);
    console.log('─'.repeat(40) + '\n');
    
    if (failCount === 0) {
      console.log(`${GREEN}✅ ALL TESTS PASSED - Code is working!${RESET}\n`);
      return true;
    } else {
      console.log(`${RED}❌ SOME TESTS FAILED - Check the errors above${RESET}\n`);
      return false;
    }
    
  } catch (error) {
    console.log(`${RED}✗ Test execution failed${RESET}`);
    console.error(error);
    failCount++;
    return false;
  } finally {
    await closeDB();
  }
}

// Run the test
quickTest().then(success => {
  process.exit(success ? 0 : 1);
});
