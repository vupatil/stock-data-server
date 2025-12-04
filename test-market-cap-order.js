/**
 * TEST: Market Cap Ordering
 * 
 * Verifies that symbols are stored in correct market cap order
 */

const { initDB, getDB, closeDB } = require('./config/database');
require('dotenv').config();

const EXPECTED_ORDER = process.env.STOCK_SYMBOLS 
  ? process.env.STOCK_SYMBOLS.split(',').map(s => s.trim())
  : [];

async function testMarketCapOrder() {
  console.log('🧪 Testing Market Cap Ordering\n');
  
  try {
    await initDB();
    const db = getDB();
    
    // Get all active symbols ordered by market_cap_rank
    const [dbSymbols] = await db.query(
      'SELECT symbol, market_cap_rank FROM stocks WHERE is_active = TRUE ORDER BY market_cap_rank ASC'
    );
    
    console.log(`📊 Expected: ${EXPECTED_ORDER.length} symbols from .env`);
    console.log(`📊 Database: ${dbSymbols.length} active symbols\n`);
    
    // Test 1: Check top 10 symbols match expected order
    console.log('Test 1: Top 10 symbols match expected order');
    console.log('Expected vs Actual:');
    let top10Match = true;
    for (let i = 0; i < 10; i++) {
      const expected = EXPECTED_ORDER[i];
      const actual = dbSymbols[i];
      const match = expected === actual.symbol && actual.market_cap_rank === i + 1;
      console.log(`  ${i + 1}. ${expected} vs ${actual.symbol} (rank: ${actual.market_cap_rank}) ${match ? '✓' : '✗'}`);
      if (!match) top10Match = false;
    }
    console.log(top10Match ? '✅ PASS: Top 10 match\n' : '❌ FAIL: Top 10 mismatch\n');
    
    // Test 2: Check all ranks are sequential (no gaps)
    console.log('Test 2: Market cap ranks are sequential (no gaps)');
    let sequentialRanks = true;
    const ranks = dbSymbols.map(s => s.market_cap_rank).filter(r => r !== null);
    for (let i = 0; i < ranks.length - 1; i++) {
      if (ranks[i + 1] - ranks[i] !== 1) {
        console.log(`  ✗ Gap found: ${ranks[i]} -> ${ranks[i + 1]}`);
        sequentialRanks = false;
      }
    }
    if (sequentialRanks) {
      console.log(`  ✓ All ranks sequential from 1 to ${ranks[ranks.length - 1]}`);
    }
    console.log(sequentialRanks ? '✅ PASS: No gaps in ranking\n' : '❌ FAIL: Gaps in ranking\n');
    
    // Test 3: No duplicate ranks
    console.log('Test 3: No duplicate market cap ranks');
    const rankCounts = {};
    dbSymbols.forEach(s => {
      if (s.market_cap_rank !== null) {
        rankCounts[s.market_cap_rank] = (rankCounts[s.market_cap_rank] || 0) + 1;
      }
    });
    const duplicates = Object.entries(rankCounts).filter(([rank, count]) => count > 1);
    if (duplicates.length === 0) {
      console.log('  ✓ No duplicate ranks found');
      console.log('✅ PASS: All ranks unique\n');
    } else {
      console.log('  ✗ Duplicate ranks found:');
      duplicates.forEach(([rank, count]) => console.log(`    Rank ${rank}: ${count} symbols`));
      console.log('❌ FAIL: Duplicate ranks exist\n');
    }
    
    // Test 4: Check symbols without ranks
    console.log('Test 4: All active symbols have market cap rank');
    const unranked = dbSymbols.filter(s => s.market_cap_rank === null);
    if (unranked.length === 0) {
      console.log('  ✓ All symbols have ranks');
      console.log('✅ PASS: No unranked symbols\n');
    } else {
      console.log(`  ✗ ${unranked.length} symbols without rank:`);
      unranked.slice(0, 10).forEach(s => console.log(`    ${s.symbol}`));
      if (unranked.length > 10) console.log(`    ... and ${unranked.length - 10} more`);
      console.log('❌ FAIL: Some symbols unranked\n');
    }
    
    // Summary
    console.log('═'.repeat(50));
    const allPass = top10Match && sequentialRanks && duplicates.length === 0 && unranked.length === 0;
    if (allPass) {
      console.log('✅ ALL TESTS PASSED - Market cap ordering is correct!');
    } else {
      console.log('❌ SOME TESTS FAILED - Run populate-symbols.js to fix');
    }
    console.log('═'.repeat(50));
    
  } catch (error) {
    console.error('❌ Test Error:', error.message);
    process.exit(1);
  } finally {
    await closeDB();
    process.exit(0);
  }
}

testMarketCapOrder();
