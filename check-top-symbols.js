require('dotenv').config();
const {initDB, getDB, closeDB} = require('./config/database');

(async()=>{
  await initDB();
  const db=getDB();
  
  console.log('\n📊 Top Symbols by 1d Bar Count:\n');
  
  const [rows] = await db.query(`
    SELECT s.symbol, c.interval_type, COUNT(c.candle_id) as count 
    FROM candles c 
    JOIN stocks s ON c.stock_id=s.stock_id 
    WHERE c.interval_type='1d' 
    GROUP BY s.symbol, c.interval_type 
    ORDER BY count DESC 
    LIMIT 10
  `);
  
  console.table(rows);
  
  await closeDB();
})();
