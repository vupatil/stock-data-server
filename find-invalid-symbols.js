require('dotenv').config();
const mysql = require('mysql2/promise');

async function findInvalidSymbols() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });
  
  try {
    const [rows] = await pool.query(`
      SELECT symbol FROM stocks 
      WHERE is_active = TRUE 
      AND (symbol LIKE '%INVALID%' OR symbol LIKE '%TEST%' OR symbol LIKE '%XXX%')
      ORDER BY symbol
    `);
    
    console.log('\n=== INVALID/TEST SYMBOLS IN DATABASE ===\n');
    console.log(`Found ${rows.length} invalid symbols:`);
    rows.forEach(r => console.log(`  - ${r.symbol}`));
    
    if (rows.length > 0) {
      console.log('\n⚠️  These symbols should be removed or marked inactive!');
      console.log('They will cause Alpaca API requests to fail or return weird responses.');
    } else {
      console.log('\n✅ No obvious invalid symbols found.');
    }
    
    await pool.end();
  } catch (error) {
    console.error('Error:', error.message);
  }
}

findInvalidSymbols();
