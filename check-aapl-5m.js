const { initDB, getDB } = require('./config/database');

(async () => {
  try {
    await initDB();
    const db = getDB();
    
    // Get AAPL stock ID
    const [stocks] = await db.query('SELECT stock_id, symbol FROM stocks WHERE symbol = ?', ['AAPL']);
    console.log('📊 Stock:', stocks[0]);
    
    // Get latest 5m candles
    const [candles] = await db.query(
      'SELECT * FROM candles WHERE stock_id = ? AND interval_type = ? ORDER BY ts DESC LIMIT 10',
      [stocks[0].stock_id, '5m']
    );
    
    console.log('\n🕐 Latest 10 x 5m Candles for AAPL:');
    console.log('─'.repeat(100));
    candles.forEach(c => {
      const date = new Date(c.ts);
      const now = new Date();
      const ageMinutes = Math.floor((now - date) / 60000);
      console.log(`${date.toLocaleString('en-US', { 
        month: '2-digit', 
        day: '2-digit', 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: true 
      })} | O:$${parseFloat(c.open).toFixed(2)} H:$${parseFloat(c.high).toFixed(2)} L:$${parseFloat(c.low).toFixed(2)} C:$${parseFloat(c.close).toFixed(2)} | V:${parseInt(c.volume).toLocaleString()} | Age: ${ageMinutes}m | Source: ${c.data_source}`);
    });
    
    // Check if data is fresh
    const latestCandle = candles[0];
    const latestDate = new Date(latestCandle.ts);
    const now = new Date();
    const ageMinutes = Math.floor((now - latestDate) / 60000);
    
    console.log('\n📈 Data Freshness Analysis:');
    console.log(`  Latest bar: ${latestDate.toLocaleString()}`);
    console.log(`  Current time: ${now.toLocaleString()}`);
    console.log(`  Age: ${ageMinutes} minutes`);
    console.log(`  Status: ${ageMinutes <= 10 ? '✅ FRESH' : '⚠️ STALE'}`);
    
    // Count total 5m bars
    const [count] = await db.query(
      'SELECT COUNT(*) as total FROM candles WHERE stock_id = ? AND interval_type = ?',
      [stocks[0].stock_id, '5m']
    );
    console.log(`  Total 5m bars: ${count[0].total.toLocaleString()}`);
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
})();
