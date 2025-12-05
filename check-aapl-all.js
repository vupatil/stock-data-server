const mysql = require('mysql2/promise');

async function checkAAPL() {
  const db = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'password',
    database: 'stock_data_db'
  });

  console.log('AAPL Data by Interval:\n');
  
  const [rows] = await db.query(`
    SELECT 
      s.symbol,
      c.interval_type,
      FROM_UNIXTIME(MAX(c.ts)) as latest_time,
      TIMESTAMPDIFF(MINUTE, FROM_UNIXTIME(MAX(c.ts)), NOW()) as age_minutes,
      COUNT(*) as bar_count
    FROM candles c
    JOIN stocks s ON c.stock_id = s.stock_id
    WHERE s.symbol = 'AAPL'
    GROUP BY s.symbol, c.interval_type
    ORDER BY c.interval_type
  `);

  rows.forEach(r => {
    const status = r.age_minutes < 10 ? '✅' : r.age_minutes < 60 ? '⚠️' : '❌';
    console.log(`${status} ${r.interval_type.padEnd(5)} - Latest: ${r.latest_time}, Age: ${r.age_minutes}min, Count: ${r.bar_count}`);
  });

  await db.end();
}

checkAAPL().catch(console.error);
