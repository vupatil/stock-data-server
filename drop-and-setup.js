/**
 * Drop all tables and recreate with fresh schema
 */

const mysql = require('mysql2/promise');
require('dotenv').config();

async function dropAndRecreate() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'STOCKSENTIMENT'
  });

  console.log('\n🗑️  Dropping all tables...');
  
  try {
    // Drop in reverse order due to foreign keys
    await connection.query('DROP TABLE IF EXISTS candles');
    console.log('  ✓ Dropped candles');
    
    await connection.query('DROP TABLE IF EXISTS data_collection_log');
    console.log('  ✓ Dropped data_collection_log');
    
    await connection.query('DROP TABLE IF EXISTS stocks');
    console.log('  ✓ Dropped stocks');
    
    console.log('✅ All tables dropped\n');
  } catch (error) {
    console.error('❌ Error dropping tables:', error.message);
  }
  
  await connection.end();
  
  // Now run setup
  console.log('🔧 Running setup to recreate tables...\n');
  const { exec } = require('child_process');
  const util = require('util');
  const execPromise = util.promisify(exec);
  
  await execPromise('node setup.js');
  console.log('\n✅ Complete! Tables recreated with updated schema.\n');
}

dropAndRecreate().catch(console.error);
