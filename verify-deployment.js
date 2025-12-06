const mysql = require('mysql2/promise');
require('dotenv').config();

(async () => {
  const db = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'STOCKSENTIMENT'
  });

  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║  📊 DATABASE VERIFICATION AFTER DEPLOYMENT TEST             ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  // Check stocks
  const [stocks] = await db.query('SELECT * FROM stocks');
  console.log('✅ Stocks Table:');
  stocks.forEach(s => {
    console.log(`   • Symbol: ${s.symbol}`);
    console.log(`     Stock ID: ${s.stock_id}`);
    console.log(`     Active: ${s.is_active ? 'Yes' : 'No'}`);
    console.log(`     Requested: ${s.requested_at || 'N/A'}\n`);
  });

  // Check candles by interval
  const [intervals] = await db.query(`
    SELECT interval_type, COUNT(*) as count 
    FROM candles 
    GROUP BY interval_type 
    ORDER BY FIELD(interval_type, '1m','2m','5m','15m','30m','1h','2h','4h','1d','1w','1mo')
  `);
  
  console.log('✅ Candles by Interval:');
  let total = 0;
  intervals.forEach(i => {
    console.log(`   ${i.interval_type.padEnd(5)}: ${String(i.count).padStart(5)} bars`);
    total += i.count;
  });
  console.log(`   ${'-'.repeat(17)}`);
  console.log(`   Total: ${String(total).padStart(5)} bars\n`);

  // Get latest daily bar
  const [latestDaily] = await db.query(`
    SELECT * FROM candles 
    WHERE interval_type = '1d' 
    ORDER BY ts DESC 
    LIMIT 1
  `);
  
  if (latestDaily.length > 0) {
    const bar = latestDaily[0];
    const date = new Date(bar.ts * 1000);
    console.log('✅ Latest Daily Bar (1d):');
    console.log(`   Date:   ${date.toISOString().split('T')[0]}`);
    console.log(`   Open:   $${bar.open}`);
    console.log(`   High:   $${bar.high}`);
    console.log(`   Low:    $${bar.low}`);
    console.log(`   Close:  $${bar.close}`);
    console.log(`   Volume: ${bar.volume.toLocaleString()}`);
    console.log(`   Source: ${bar.data_source}\n`);
  }

  // Check collection log
  const [logs] = await db.query(`
    SELECT * FROM data_collection_log 
    ORDER BY started_at DESC 
    LIMIT 5
  `);
  
  console.log('✅ Recent Collection Jobs (last 5):');
  logs.forEach(log => {
    const duration = log.duration_ms ? `${(log.duration_ms / 1000).toFixed(1)}s` : 'N/A';
    console.log(`   • ${log.interval_type.padEnd(5)} | Status: ${log.status} | ${log.records_inserted} inserted | Duration: ${duration}`);
  });

  await db.end();

  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║  🎯 PRODUCTION DEPLOYMENT VERIFICATION COMPLETE!            ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

})().catch(console.error);
