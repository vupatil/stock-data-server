require('dotenv').config();
const mysql = require('mysql2/promise');

async function checkTimestamps() {
  const db = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'stock_data'
  });

  console.log('\n=== Checking AAPL 5m timestamps and timezone conversion ===\n');

  // Check last 5 bars
  const [rows] = await db.query(`
    SELECT 
      ts,
      FROM_UNIXTIME(ts) as utc_dt,
      TIME(CONVERT_TZ(FROM_UNIXTIME(ts), @@session.time_zone, 'America/New_York')) as et_time_only
    FROM candles 
    WHERE stock_id = (SELECT stock_id FROM stocks WHERE symbol = 'AAPL') 
      AND interval_type = '5m'
    ORDER BY ts DESC 
    LIMIT 10
  `);

  console.log('Last 10 bars:\n');
  rows.forEach(row => {
    const included = row.et_time_only >= '09:30:00' && row.et_time_only <= '16:00:00';
    console.log(`Timestamp: ${row.ts}`);
    console.log(`  UTC: ${row.utc_dt}`);
    console.log(`  ET Time: ${row.et_time_only}`);
    console.log(`  Market Hours Filter: ${included ? 'INCLUDED' : 'EXCLUDED'}`);
    console.log('');
  });

  // Count how many bars pass the filter
  const [countAll] = await db.query(`
    SELECT COUNT(*) as total
    FROM candles 
    WHERE stock_id = (SELECT stock_id FROM stocks WHERE symbol = 'AAPL') 
      AND interval_type = '5m'
  `);

  const [countFiltered] = await db.query(`
    SELECT COUNT(*) as total
    FROM candles 
    WHERE stock_id = (SELECT stock_id FROM stocks WHERE symbol = 'AAPL') 
      AND interval_type = '5m'
      AND (
        TIME(CONVERT_TZ(FROM_UNIXTIME(ts), @@session.time_zone, 'America/New_York')) >= '09:30:00' AND 
        TIME(CONVERT_TZ(FROM_UNIXTIME(ts), @@session.time_zone, 'America/New_York')) <= '16:00:00'
      )
  `);

  console.log('=== Summary ===');
  console.log(`Total 5m bars in DB: ${countAll[0].total}`);
  console.log(`Bars passing market hours filter (9:30-16:00 ET): ${countFiltered[0].total}`);
  console.log(`Bars excluded by filter: ${countAll[0].total - countFiltered[0].total}`);

  await db.end();
}

checkTimestamps().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
