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
  const { spawn } = require('child_process');
  
  const setupProcess = spawn('node', ['setup.js'], {
    stdio: 'inherit', // This passes through all output to parent process
    shell: true
  });
  
  setupProcess.on('close', async (code) => {
    if (code === 0) {
      // Reconnect to get final statistics
      const statsConnection = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 3306,
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME || 'STOCKSENTIMENT'
      });
      
      const [stockCount] = await statsConnection.query('SELECT COUNT(*) as count FROM stocks');
      const [excludedCount] = await statsConnection.query('SELECT COUNT(*) as count FROM excluded_symbols');
      const [candleCount] = await statsConnection.query('SELECT COUNT(*) as count FROM candles');
      
      const successfulSymbols = stockCount[0].count - excludedCount[0].count;
      const failedSymbols = excludedCount[0].count;
      
      await statsConnection.end();
      
      console.log('\n╔═══════════════════════════════════════════════╗');
      console.log('║   🎉 DROP & SETUP COMPLETED!                 ║');
      console.log('╚═══════════════════════════════════════════════╝\n');
      
      console.log('📊 Final Results:');
      console.log(`   ✅ Successfully loaded: ${successfulSymbols} symbols`);
      console.log(`   ❌ Failed to load: ${failedSymbols} symbols`);
      console.log(`   📈 Total candles stored: ${candleCount[0].count.toLocaleString()}`);
      console.log(`   💾 Average candles per symbol: ${successfulSymbols > 0 ? Math.round(candleCount[0].count / successfulSymbols).toLocaleString() : 0}\n`);
      
      if (failedSymbols > 0) {
        console.log('ℹ️  Failed symbols have been recorded in the excluded_symbols table');
        console.log('   They will be retried automatically after 30 days.\n');
      }
      
      console.log('✅ Database is ready! You can now start the server.\n');
    } else {
      console.error(`\n❌ Setup failed with exit code ${code}\n`);
      process.exit(code);
    }
  });
}

dropAndRecreate().catch(console.error);
