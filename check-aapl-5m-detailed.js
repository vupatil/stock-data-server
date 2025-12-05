require('dotenv').config();
const mysql = require('mysql2/promise');

async function checkAAPL5m() {
  const db = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'stock_data'
  });

  try {
    console.log('\n=== CHECKING AAPL 5m DATA ===\n');
    
    // Check if AAPL exists
    const [stocks] = await db.query(
      'SELECT stock_id, symbol, is_active FROM stocks WHERE symbol = ?',
      ['AAPL']
    );
    
    if (stocks.length === 0) {
      console.log('❌ AAPL not found in stocks table');
      return;
    }
    
    const stock = stocks[0];
    console.log('✅ Stock found:');
    console.log('   stock_id:', stock.stock_id);
    console.log('   symbol:', stock.symbol);
    console.log('   is_active:', stock.is_active);
    
    // Check 5m candles
    const [candles] = await db.query(
      `SELECT 
        COUNT(*) as count,
        MIN(FROM_UNIXTIME(ts)) as oldest,
        MAX(FROM_UNIXTIME(ts)) as newest,
        MAX(ts) as newest_ts,
        data_source
      FROM candles 
      WHERE stock_id = ? AND interval_type = '5m'
      GROUP BY data_source`,
      [stock.stock_id]
    );
    
    console.log('\n📊 5m Candles:');
    if (candles.length === 0) {
      console.log('   ❌ NO DATA FOUND');
    } else {
      candles.forEach(row => {
        const ageMinutes = Math.floor((Date.now() / 1000 - row.newest_ts) / 60);
        const ageHours = Math.floor(ageMinutes / 60);
        console.log(`\n   Source: ${row.data_source}`);
        console.log(`   Count: ${row.count}`);
        console.log(`   Oldest: ${row.oldest}`);
        console.log(`   Newest: ${row.newest}`);
        console.log(`   Age: ${ageHours}h ${ageMinutes % 60}m (${ageMinutes} minutes total)`);
      });
    }
    
    // Check what's currently in collection queue
    console.log('\n🔍 Checking if AAPL is in collection queue...');
    const now = new Date();
    const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const day = et.getDay();
    const hour = et.getHours();
    const minute = et.getMinutes();
    const time = hour * 60 + minute;
    
    console.log(`   Current time (ET): ${et.toLocaleTimeString()}`);
    console.log(`   Is weekend: ${day === 0 || day === 6}`);
    console.log(`   Is market hours (9:30-16:00): ${time >= 570 && time <= 960}`);
    
    // Check staleness thresholds
    if (candles.length > 0) {
      const newestTs = candles[0].newest_ts;
      const ageMinutes = (Date.now() / 1000 - newestTs) / 60;
      
      console.log('\n⏰ Staleness Check:');
      console.log(`   Data age: ${Math.floor(ageMinutes)} minutes`);
      console.log(`   Intraday threshold: 1440 minutes (24 hours)`);
      console.log(`   Is stale: ${ageMinutes > 1440 ? '❌ YES' : '✅ NO'}`);
      
      // Market closed threshold
      if (day === 0 || day === 6 || time < 570 || time > 960) {
        console.log(`   Market closed threshold: 1440 minutes (24 hours)`);
        console.log(`   Is stale (market closed): ${ageMinutes > 1440 ? '❌ YES' : '✅ NO'}`);
      }
    }
    
    // Check recent collections
    const [recentCollections] = await db.query(
      `SELECT * FROM data_collection_log 
       WHERE stock_id = ? AND interval_type = '5m'
       ORDER BY collected_at DESC 
       LIMIT 5`,
      [stock.stock_id]
    );
    
    console.log('\n📝 Recent 5m Collections:');
    if (recentCollections.length === 0) {
      console.log('   No collection logs found');
    } else {
      recentCollections.forEach(log => {
        console.log(`   ${log.collected_at} - ${log.status} (${log.bars_collected} bars, source: ${log.data_source})`);
      });
    }
    
  } finally {
    await db.end();
  }
}

checkAAPL5m().then(() => {
  console.log('\n✅ Check complete\n');
  process.exit(0);
}).catch(error => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});
