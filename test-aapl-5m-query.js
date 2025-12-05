require('dotenv').config();
const mysql = require('mysql2/promise');

async function testQuery() {
  const db = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'stock_data'
  });

  try {
    const symbol = 'AAPL';
    const interval = '5m';
    const includeExtended = true; // includePrePost=true
    
    // Get stock_id
    const [rows] = await db.query(
      'SELECT stock_id, is_active FROM stocks WHERE symbol = ?',
      [symbol]
    );
    
    if (rows.length === 0) {
      console.log('❌ Symbol not found');
      return;
    }
    
    const stockId = rows[0].stock_id;
    console.log(`✅ Stock ID: ${stockId}, Active: ${rows[0].is_active}`);
    
    // Calculate time range (last 30 days for 5m)
    const now = Math.floor(Date.now() / 1000);
    const thirtyDaysAgo = now - (30 * 24 * 60 * 60);
    
    console.log(`\n📅 Time range:`);
    console.log(`   Start: ${new Date(thirtyDaysAgo * 1000).toISOString()}`);
    console.log(`   End: ${new Date(now * 1000).toISOString()}`);
    
    // Test 1: Query WITHOUT market hours filter (includeExtended=true)
    console.log(`\n🔍 Test 1: Query WITH extended hours (includePrePost=true)`);
    let query1 = `
      SELECT ts, open, high, low, close, volume 
      FROM candles 
      WHERE stock_id = ? AND interval_type = ? AND ts >= ? AND ts <= ?
      ORDER BY ts ASC
    `;
    
    const [candles1] = await db.query(query1, [stockId, interval, thirtyDaysAgo, now]);
    console.log(`   Result: ${candles1.length} candles`);
    
    if (candles1.length > 0) {
      console.log(`   First: ${new Date(candles1[0].ts * 1000).toISOString()}`);
      console.log(`   Last: ${new Date(candles1[candles1.length - 1].ts * 1000).toISOString()}`);
      const ageMinutes = Math.floor((now - candles1[candles1.length - 1].ts) / 60);
      console.log(`   Age: ${ageMinutes} minutes`);
    }
    
    // Test 2: Query WITH market hours filter (includeExtended=false)
    console.log(`\n🔍 Test 2: Query WITHOUT extended hours (includePrePost=false)`);
    let query2 = `
      SELECT ts, open, high, low, close, volume 
      FROM candles 
      WHERE stock_id = ? AND interval_type = ? AND ts >= ? AND ts <= ?
      AND (
        TIME(CONVERT_TZ(FROM_UNIXTIME(ts), '+00:00', 'America/New_York')) >= '09:30:00' AND 
        TIME(CONVERT_TZ(FROM_UNIXTIME(ts), '+00:00', 'America/New_York')) <= '16:00:00'
      )
      ORDER BY ts ASC
    `;
    
    const [candles2] = await db.query(query2, [stockId, interval, thirtyDaysAgo, now]);
    console.log(`   Result: ${candles2.length} candles`);
    
    if (candles2.length > 0) {
      console.log(`   First: ${new Date(candles2[0].ts * 1000).toISOString()}`);
      console.log(`   Last: ${new Date(candles2[candles2.length - 1].ts * 1000).toISOString()}`);
      const ageMinutes = Math.floor((now - candles2[candles2.length - 1].ts) / 60);
      console.log(`   Age: ${ageMinutes} minutes`);
    }
    
    // Test 3: Check if there's actually extended hours data
    console.log(`\n🔍 Test 3: Count extended hours vs regular hours`);
    const [extendedCount] = await db.query(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN 
          TIME(CONVERT_TZ(FROM_UNIXTIME(ts), '+00:00', 'America/New_York')) >= '09:30:00' AND 
          TIME(CONVERT_TZ(FROM_UNIXTIME(ts), '+00:00', 'America/New_York')) <= '16:00:00'
          THEN 1 ELSE 0 END) as regular_hours,
        SUM(CASE WHEN 
          TIME(CONVERT_TZ(FROM_UNIXTIME(ts), '+00:00', 'America/New_York')) < '09:30:00' OR 
          TIME(CONVERT_TZ(FROM_UNIXTIME(ts), '+00:00', 'America/New_York')) > '16:00:00'
          THEN 1 ELSE 0 END) as extended_hours
      FROM candles 
      WHERE stock_id = ? AND interval_type = ?
    `, [stockId, interval]);
    
    console.log(`   Total bars: ${extendedCount[0].total}`);
    console.log(`   Regular hours (9:30-16:00): ${extendedCount[0].regular_hours}`);
    console.log(`   Extended hours: ${extendedCount[0].extended_hours}`);
    
  } finally {
    await db.end();
  }
}

testQuery().then(() => {
  console.log('\n✅ Test complete\n');
  process.exit(0);
}).catch(error => {
  console.error('❌ Error:', error.message);
  console.error(error.stack);
  process.exit(1);
});
