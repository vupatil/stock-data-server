const mysql = require('mysql2/promise');
require('dotenv').config();

async function quickCheck() {
  const db = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'stock_data_db'
  });

  const [counts] = await db.query('SELECT COUNT(*) as total, SUM(is_active) as active FROM stocks');
  console.log(`Total symbols: ${counts[0].total}, Active: ${counts[0].active}`);

  const [hasAAPL] = await db.query("SELECT stock_id, symbol, is_active FROM stocks WHERE symbol = 'AAPL'");
  if (hasAAPL.length > 0) {
    console.log(`AAPL: stock_id=${hasAAPL[0].stock_id}, is_active=${hasAAPL[0].is_active}`);
  } else {
    console.log('AAPL not found!');
  }

  await db.end();
}

quickCheck().catch(console.error);
