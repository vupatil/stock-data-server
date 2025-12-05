/**
 * DATABASE CLEANUP UTILITY
 * Clears all data from stocks and candles tables for fresh testing
 */

require('dotenv').config();
const { initDB, getDB, closeDB } = require('./config/database');

async function cleanup() {
  console.log('\n🧹 DATABASE CLEANUP UTILITY\n');
  console.log('=' .repeat(60));
  
  try {
    await initDB();
    const db = getDB();
    
    // Get current counts
    const [stockCount] = await db.query('SELECT COUNT(*) as count FROM stocks');
    const [candleCount] = await db.query('SELECT COUNT(*) as count FROM candles');
    const [logCount] = await db.query('SELECT COUNT(*) as count FROM data_collection_log');
    
    console.log('\n📊 Current Data:');
    console.log(`   Stocks: ${stockCount[0].count}`);
    console.log(`   Candles: ${candleCount[0].count}`);
    console.log(`   Logs: ${logCount[0].count}`);
    
    console.log('\n⚠️  WARNING: This will DELETE ALL data from:');
    console.log('   - candles table');
    console.log('   - stocks table');
    console.log('   - data_collection_log table');
    
    // For automated testing, skip confirmation
    if (process.argv.includes('--force')) {
      console.log('\n🔄 Force mode enabled, proceeding with cleanup...');
    } else {
      console.log('\n   To proceed, run: node cleanup-db.js --force');
      await closeDB();
      return;
    }
    
    // Delete in order (foreign key constraints)
    console.log('\n🗑️  Deleting data...');
    
    await db.query('DELETE FROM candles');
    console.log('   ✓ Candles deleted');
    
    await db.query('DELETE FROM data_collection_log');
    console.log('   ✓ Collection logs deleted');
    
    await db.query('DELETE FROM stocks');
    console.log('   ✓ Stocks deleted');
    
    // Reset auto-increment
    await db.query('ALTER TABLE stocks AUTO_INCREMENT = 1');
    await db.query('ALTER TABLE data_collection_log AUTO_INCREMENT = 1');
    console.log('   ✓ Auto-increment counters reset');
    
    console.log('\n✅ Database cleaned successfully!');
    console.log('=' .repeat(60) + '\n');
    
  } catch (error) {
    console.error('\n❌ Cleanup failed:', error.message);
    process.exit(1);
  } finally {
    await closeDB();
  }
}

cleanup();
