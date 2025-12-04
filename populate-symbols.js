/**
 * POPULATE SYMBOLS
 * 
 * Adds all symbols from .env to the stocks table with proper market cap ordering
 * Symbols are expected to be pre-sorted by market cap (descending) in .env file
 */

const { initDB, getDB, closeDB } = require('./config/database');
require('dotenv').config();

const SYMBOLS = process.env.STOCK_SYMBOLS 
  ? process.env.STOCK_SYMBOLS.split(',').map(s => s.trim())
  : [];

async function populateSymbols() {
  console.log(`📊 Populating ${SYMBOLS.length} symbols into database (sorted by market cap)...`);
  
  try {
    await initDB();
    const db = getDB();
    
    // First, reset all market_cap_rank to null and mark inactive
    await db.query('UPDATE stocks SET market_cap_rank = NULL, is_active = FALSE');
    console.log('  Reset all existing ranks\n');
    
    let added = 0;
    let updated = 0;
    
    // Process symbols in order (maintaining market cap ranking)
    for (let i = 0; i < SYMBOLS.length; i++) {
      const symbol = SYMBOLS[i];
      const marketCapRank = i + 1; // Rank starts at 1
      
      try {
        // Check if symbol already exists
        const [rows] = await db.query(
          'SELECT stock_id FROM stocks WHERE symbol = ?',
          [symbol]
        );
        
        if (rows.length > 0) {
          // Update market cap rank for existing symbol
          await db.query(
            'UPDATE stocks SET market_cap_rank = ?, is_active = TRUE, updated_at = NOW() WHERE symbol = ?',
            [marketCapRank, symbol]
          );
          updated++;
        } else {
          // Insert new symbol with market cap rank
          await db.query(
            'INSERT INTO stocks (symbol, market_cap_rank, is_active) VALUES (?, ?, TRUE)',
            [symbol, marketCapRank]
          );
          added++;
          console.log(`  ✓ Added: ${symbol} (rank: ${marketCapRank})`);
        }
      } catch (error) {
        console.error(`  ✗ Error with ${symbol}:`, error.message);
      }
    }
    
    console.log(`\n✅ Complete!`);
    console.log(`   Added: ${added} new symbols`);
    console.log(`   Updated: ${updated} existing symbols`);
    console.log(`   Total: ${added + updated} symbols in database`);
    
    // Show summary
    const [stats] = await db.query('SELECT COUNT(*) as total FROM stocks WHERE is_active = TRUE');
    console.log(`\n📈 Active symbols in database: ${stats[0].total}`);
    
    // Check for inactive symbols (not in .env anymore)
    const [inactive] = await db.query('SELECT COUNT(*) as total FROM stocks WHERE is_active = FALSE');
    if (inactive[0].total > 0) {
      console.log(`⚠️  Inactive symbols (removed from .env): ${inactive[0].total}`);
    }
    
    // Verify ordering
    console.log(`\n🔍 Top 10 by market cap rank:`);
    const [top10] = await db.query(
      'SELECT symbol, market_cap_rank FROM stocks WHERE is_active = TRUE ORDER BY market_cap_rank ASC LIMIT 10'
    );
    top10.forEach(s => console.log(`   ${s.market_cap_rank}. ${s.symbol}`));
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await closeDB();
    process.exit(0);
  }
}

populateSymbols();
