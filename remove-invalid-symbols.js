require('dotenv').config();
const mysql = require('mysql2/promise');

async function removeInvalidSymbols() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
  });
  
  try {
    console.log('\n=== REMOVING INVALID SYMBOLS ===\n');
    
    // Mark as inactive
    const [result] = await pool.query(`
      UPDATE stocks 
      SET is_active = FALSE 
      WHERE symbol IN ('INVALIDXYZ', 'INVALIDXYZ123')
    `);
    
    console.log(`✅ Marked ${result.affectedRows} invalid symbols as inactive`);
    console.log('   - INVALIDXYZ');
    console.log('   - INVALIDXYZ123');
    
    // Verify count
    const [count] = await pool.query(`
      SELECT COUNT(*) as count FROM stocks WHERE is_active = TRUE
    `);
    
    console.log(`\n📊 Active symbols remaining: ${count[0].count}`);
    
    await pool.end();
    console.log('\n✅ Done! Restart the server for changes to take effect.');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

removeInvalidSymbols();
