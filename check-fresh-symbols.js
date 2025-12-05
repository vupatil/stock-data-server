const mysql = require('mysql2/promise');
require('dotenv').config();

async function checkRecentData() {
  const db = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'stock_data_db'
  });

  console.log('\n=== SYMBOLS WITH RECENT 5M DATA ===\n');

  const [recent5m] = await db.query(`
    SELECT 
      s.symbol,
      COUNT(*) as bar_count,
      FROM_UNIXTIME(MAX(c.ts)) as latest_time,
      TIMESTAMPDIFF(MINUTE, FROM_UNIXTIME(MAX(c.ts)), NOW()) as age_minutes
    FROM candles c
    JOIN stocks s ON c.stock_id = s.stock_id
    WHERE c.interval_type = '5m'
    GROUP BY s.symbol
    HAVING age_minutes < 60
    ORDER BY age_minutes ASC
    LIMIT 20
  `);

  console.log('Symbols with fresh 5m data (< 60 min old):');
  recent5m.forEach(row => {
    console.log(`  ✅ ${row.symbol.padEnd(8)} - ${row.bar_count} bars, Latest: ${row.latest_time}, Age: ${row.age_minutes}min`);
  });

  console.log('\n=== CHECK IF AAPL IS EVEN IN COLLECTION LIST ===\n');

  const [aaplStock] = await db.query(`
    SELECT stock_id, symbol, is_active 
    FROM stocks 
    WHERE symbol = 'AAPL'
  `);

  if (aaplStock.length > 0) {
    console.log(`AAPL found: stock_id=${aaplStock[0].stock_id}, is_active=${aaplStock[0].is_active}`);
  } else {
    console.log('❌ AAPL NOT FOUND in stocks table!');
  }

  await db.end();
}

checkRecentData().catch(console.error);
