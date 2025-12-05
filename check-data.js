/**
 * Check actual data in database for a symbol
 */

require('dotenv').config();
const { initDB, getDB, closeDB } = require('./config/database');

async function checkData() {
  try {
    await initDB();
    const db = getDB();
    
    const symbol = process.argv[2] || 'AAPL';
    
    console.log(`\n📊 Checking data for ${symbol}...\n`);
    console.log('=' .repeat(60));
    
    // Check if symbol exists
    const [stocks] = await db.query(
      'SELECT * FROM stocks WHERE symbol = ?',
      [symbol]
    );
    
    if (stocks.length === 0) {
      console.log(`❌ Symbol ${symbol} not found in stocks table\n`);
      await closeDB();
      return;
    }
    
    console.log(`✅ Symbol found:`);
    console.log(`   Stock ID: ${stocks[0].stock_id}`);
    console.log(`   Active: ${stocks[0].is_active}`);
    console.log(`   Requested: ${stocks[0].requested_at}`);
    
    // Check candles by interval
    const [candles] = await db.query(`
      SELECT 
        interval_type,
        COUNT(*) as count,
        MIN(FROM_UNIXTIME(ts)) as oldest,
        MAX(FROM_UNIXTIME(ts)) as newest,
        MIN(close) as min_close,
        MAX(close) as max_close
      FROM candles 
      WHERE stock_id = ?
      GROUP BY interval_type
      ORDER BY interval_type
    `, [stocks[0].stock_id]);
    
    if (candles.length === 0) {
      console.log(`\n⚠️  No candle data found for ${symbol}\n`);
      await closeDB();
      return;
    }
    
    console.log(`\n📈 Candle Data:`);
    console.log('─'.repeat(60));
    
    candles.forEach(row => {
      console.log(`\n  ${row.interval_type}:`);
      console.log(`    Count: ${row.count}`);
      console.log(`    Range: ${row.oldest} → ${row.newest}`);
      console.log(`    Price: $${row.min_close} - $${row.max_close}`);
    });
    
    // Show sample of 1d data
    const [samples] = await db.query(`
      SELECT 
        FROM_UNIXTIME(ts) as date,
        open, high, low, close, volume
      FROM candles 
      WHERE stock_id = ? AND interval_type = '1d'
      ORDER BY ts DESC
      LIMIT 10
    `, [stocks[0].stock_id]);
    
    if (samples.length > 0) {
      console.log(`\n📅 Recent Daily Bars (1d):`);
      console.log('─'.repeat(60));
      samples.forEach(s => {
        console.log(`  ${s.date}: O=$${s.open} H=$${s.high} L=$${s.low} C=$${s.close} V=${s.volume}`);
      });
    }
    
    console.log('\n' + '=' .repeat(60) + '\n');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await closeDB();
  }
}

checkData();
