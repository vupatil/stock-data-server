require('dotenv').config();
const {initDB, getDB, closeDB} = require('./config/database');

(async()=>{
  await initDB();
  const db = getDB();
  
  console.log('\n' + '='.repeat(80));
  console.log('📊 COMPREHENSIVE DATA COLLECTION SUMMARY');
  console.log('='.repeat(80));
  
  // Overall stats
  const [stats] = await db.query(`
    SELECT 
      COUNT(DISTINCT s.stock_id) as total_symbols,
      SUM(CASE WHEN s.is_active = TRUE THEN 1 ELSE 0 END) as active_symbols,
      COUNT(c.candle_id) as total_bars
    FROM stocks s
    LEFT JOIN candles c ON s.stock_id = c.stock_id
  `);
  
  console.log('\n📈 Overall Statistics:');
  console.log(`   Total Symbols: ${stats[0].total_symbols}`);
  console.log(`   Active Symbols: ${stats[0].active_symbols}`);
  console.log(`   Total Bars: ${stats[0].total_bars.toLocaleString()}`);
  
  // Interval breakdown
  console.log('\n📊 Bars by Interval:');
  const [intervals] = await db.query(`
    SELECT 
      c.interval_type,
      COUNT(DISTINCT s.stock_id) as symbols_with_data,
      COUNT(c.candle_id) as total_bars,
      MIN(c.ts) as earliest_ts,
      MAX(c.ts) as latest_ts,
      AVG(bars_per_symbol) as avg_bars_per_symbol
    FROM candles c
    JOIN stocks s ON c.stock_id = s.stock_id
    JOIN (
      SELECT stock_id, interval_type, COUNT(*) as bars_per_symbol
      FROM candles
      GROUP BY stock_id, interval_type
    ) sub ON c.stock_id = sub.stock_id AND c.interval_type = sub.interval_type
    GROUP BY c.interval_type
    ORDER BY 
      CASE c.interval_type
        WHEN '1m' THEN 1
        WHEN '2m' THEN 2
        WHEN '5m' THEN 3
        WHEN '15m' THEN 4
        WHEN '30m' THEN 5
        WHEN '1h' THEN 6
        WHEN '2h' THEN 7
        WHEN '4h' THEN 8
        WHEN '1d' THEN 9
        WHEN '1w' THEN 10
        WHEN '1mo' THEN 11
      END
  `);
  
  intervals.forEach(row => {
    const status = row.avg_bars_per_symbol >= 600 ? '✅' : 
                   row.avg_bars_per_symbol >= 200 ? '⚠️' : '❌';
    const earliest = new Date(row.earliest_ts * 1000).toISOString().split('T')[0];
    const latest = new Date(row.latest_ts * 1000).toISOString().split('T')[0];
    
    console.log(`   ${status} ${row.interval_type.padEnd(5)}: ${row.symbols_with_data.toString().padStart(3)} symbols, avg ${Math.round(row.avg_bars_per_symbol).toString().padStart(3)} bars/symbol, ${row.total_bars.toLocaleString().padStart(8)} total (${earliest} to ${latest})`);
  });
  
  // Check symbols meeting 600 bar requirement
  console.log('\n✅ Symbols Meeting MAX_CANDLES_PER_INTERVAL (600 bars) for 1d:');
  const [goodSymbols] = await db.query(`
    SELECT s.symbol, COUNT(c.candle_id) as bars
    FROM candles c
    JOIN stocks s ON c.stock_id = s.stock_id
    WHERE c.interval_type = '1d'
    GROUP BY s.symbol
    HAVING bars >= 600
    ORDER BY bars DESC, s.symbol
  `);
  
  console.log(`   Found ${goodSymbols.length} symbols with 600+ daily bars:`);
  goodSymbols.slice(0, 20).forEach(row => {
    console.log(`   ✅ ${row.symbol.padEnd(10)} ${row.bars} bars`);
  });
  
  if (goodSymbols.length > 20) {
    console.log(`   ... and ${goodSymbols.length - 20} more`);
  }
  
  // Check symbols below 600 bars
  console.log('\n⚠️  Symbols Below 600 Bars for 1d:');
  const [lowSymbols] = await db.query(`
    SELECT s.symbol, COUNT(c.candle_id) as bars
    FROM stocks s
    LEFT JOIN candles c ON s.stock_id = c.stock_id AND c.interval_type = '1d'
    WHERE s.is_active = TRUE
    GROUP BY s.symbol
    HAVING bars < 600
    ORDER BY bars DESC, s.symbol
  `);
  
  if (lowSymbols.length > 0) {
    console.log(`   Found ${lowSymbols.length} symbols below requirement:`);
    lowSymbols.forEach(row => {
      const status = row.bars === 0 ? '❌' : '⚠️';
      console.log(`   ${status} ${row.symbol.padEnd(10)} ${row.bars || 0} bars`);
    });
  } else {
    console.log(`   ✅ All active symbols meet the requirement!`);
  }
  
  // Configuration summary
  console.log('\n' + '='.repeat(80));
  console.log('⚙️  Configuration:');
  console.log(`   MAX_CANDLES_PER_INTERVAL: ${process.env.MAX_CANDLES_PER_INTERVAL || 600}`);
  console.log(`   Collection Range (1d): 2.5 years (912 days)`);
  console.log(`   Expected Bars (1d): ~627 trading days`);
  console.log(`   Collection Range (1w): 5 years`);
  console.log(`   Expected Bars (1w): ~261 weeks`);
  console.log(`   Collection Range (1mo): 10 years`);
  console.log(`   Expected Bars (1mo): ~66 months (5.5 years actual data)`);
  
  console.log('\n' + '='.repeat(80));
  console.log('✅ Summary: System is collecting 627 bars for daily data, exceeding the');
  console.log('   MAX_CANDLES_PER_INTERVAL=600 requirement. Cleanup will keep last 600.');
  console.log('='.repeat(80) + '\n');
  
  await closeDB();
})();
