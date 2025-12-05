const mysql = require('mysql2/promise');
require('dotenv').config();

async function checkDatabase() {
  const db = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'stock_data_db'
  });

  console.log('\n=== DATABASE STATE CHECK ===\n');

  // Total symbols
  const [symbolCount] = await db.query('SELECT COUNT(*) as count FROM stocks WHERE is_active = 1');
  console.log(`Active Symbols: ${symbolCount[0].count}`);

  // Total bars
  const [barCount] = await db.query('SELECT COUNT(*) as count FROM candles');
  console.log(`Total Bars: ${barCount[0].count}`);

  // Bars by interval
  const [byInterval] = await db.query(`
    SELECT interval_type, COUNT(*) as count, 
           FROM_UNIXTIME(MAX(ts)) as latest_time,
           TIMESTAMPDIFF(MINUTE, FROM_UNIXTIME(MAX(ts)), NOW()) as age_minutes
    FROM candles 
    GROUP BY interval_type 
    ORDER BY interval_type
  `);
  
  console.log('\nBars by Interval:');
  byInterval.forEach(row => {
    const status = row.age_minutes < 10 ? '✅' : row.age_minutes < 60 ? '⚠️' : '❌';
    console.log(`  ${status} ${row.interval_type.padEnd(5)}: ${row.count.toString().padStart(8)} bars, Latest: ${row.latest_time}, Age: ${row.age_minutes}min`);
  });

  // Check AAPL specifically
  const [aapl] = await db.query(`
    SELECT s.symbol FROM stocks s WHERE s.symbol = 'AAPL'
  `);
  
  if (aapl.length > 0) {
    console.log('\nAAPL is in stocks table ✅');
    
    const [aaplBars] = await db.query(`
      SELECT interval_type, COUNT(*) as count,
             FROM_UNIXTIME(MAX(ts)) as latest_time,
             TIMESTAMPDIFF(MINUTE, FROM_UNIXTIME(MAX(ts)), NOW()) as age_minutes
      FROM candles c
      JOIN stocks s ON c.stock_id = s.stock_id
      WHERE s.symbol = 'AAPL'
      GROUP BY interval_type
      ORDER BY interval_type
    `);
    
    if (aaplBars.length > 0) {
      console.log('AAPL bars found:');
      aaplBars.forEach(row => {
        const status = row.age_minutes < 10 ? '✅' : row.age_minutes < 60 ? '⚠️' : '❌';
        console.log(`  ${status} ${row.interval_type.padEnd(5)}: ${row.count} bars, Age: ${row.age_minutes}min`);
      });
    } else {
      console.log('❌ AAPL has NO bars in candles table!');
    }
  } else {
    console.log('❌ AAPL not found in stocks table!');
  }

  // Check most recent collection
  const [recentCollection] = await db.query(`
    SELECT symbol, interval_type, collected_at, bars_collected, data_source
    FROM data_collection_log
    ORDER BY collected_at DESC
    LIMIT 10
  `);
  
  console.log('\n\nRecent Collections (last 10):');
  recentCollection.forEach(row => {
    console.log(`  ${row.collected_at}: ${row.symbol} ${row.interval_type} - ${row.bars_collected} bars from ${row.data_source}`);
  });

  await db.end();
}

checkDatabase().catch(console.error);
