require('dotenv').config();
const {initDB, getDB, closeDB} = require('./config/database');

(async()=>{
  await initDB();
  const db = getDB();
  
  console.log('\n📊 Bar Counts by Interval Type:\n');
  console.log('=' .repeat(80));
  
  // Check all intervals
  const intervals = ['1m', '2m', '5m', '15m', '30m', '1h', '2h', '4h', '1d', '1w', '1mo'];
  
  for (const interval of intervals) {
    const [rows] = await db.query(`
      SELECT s.symbol, COUNT(c.candle_id) as count 
      FROM candles c 
      JOIN stocks s ON c.stock_id=s.stock_id 
      WHERE c.interval_type=? 
      GROUP BY s.symbol 
      ORDER BY count DESC
      LIMIT 10
    `, [interval]);
    
    if (rows.length > 0) {
      console.log(`\n${interval}:`);
      rows.forEach(r => {
        const status = r.count >= 600 ? '✅' : (r.count >= 100 ? '⚠️' : '❌');
        console.log(`  ${status} ${r.symbol.padEnd(10)} ${r.count.toString().padStart(5)} bars`);
      });
    } else {
      console.log(`\n${interval}: No data`);
    }
  }
  
  console.log('\n' + '=' .repeat(80));
  console.log('\n🔍 Checking GOOGL and MSFT specifically:\n');
  
  const [googl] = await db.query(`
    SELECT s.symbol, c.interval_type, COUNT(c.candle_id) as count,
           MIN(FROM_UNIXTIME(c.ts)) as earliest,
           MAX(FROM_UNIXTIME(c.ts)) as latest
    FROM candles c 
    JOIN stocks s ON c.stock_id=s.stock_id 
    WHERE s.symbol IN ('GOOGL', 'MSFT')
    GROUP BY s.symbol, c.interval_type
    ORDER BY s.symbol, c.interval_type
  `);
  
  console.table(googl);
  
  console.log('\n💡 Note: Expected ~627 bars for 1d, ~125 bars for 1w, ~30 bars for 1mo\n');
  
  await closeDB();
})();
