/**
 * QUICK FRESH DEPLOYMENT TEST
 * 
 * Exact production simulation:
 * 1. Drop ALL tables completely (clean slate)
 * 2. Run setup.js (recreate empty tables)
 * 3. Start app.js
 * 4. Test data collection on demand
 */

const axios = require('axios');
const mysql = require('mysql2/promise');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
require('dotenv').config();

const API_BASE = 'http://localhost:3001';
const TEST_SYMBOL = 'AAPL';

console.log('\n🚀 FRESH PRODUCTION DEPLOYMENT TEST');
console.log('=' .repeat(50));

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function dropAllTables() {
  console.log('\n1️⃣  Connecting to MySQL and dropping ALL tables...');
  
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD
  });
  
  const dbName = process.env.DB_NAME || 'STOCKSENTIMENT';
  
  try {
    // Drop entire database
    await connection.query(`DROP DATABASE IF EXISTS ${dbName}`);
    console.log(`✅ Dropped database: ${dbName}`);
  } catch (error) {
    console.log(`⚠️  Database didn't exist or error: ${error.message}`);
  }
  
  await connection.end();
  console.log('✅ Database cleanup complete - fresh slate!\n');
}

async function testQuick() {
  try {
    // Step 1: Drop everything
    await dropAllTables();
    
    // Step 2: Run setup to create fresh tables
    console.log('2️⃣  Running setup.js to create fresh database...');
    await execPromise('node setup.js');
    console.log('✅ Database and tables created\n');
    
    // Step 3: Start server in background
    console.log('3️⃣  Starting server (background)...');
    exec('node app.js');
    await sleep(3000); // Wait for server startup
    
    // Step 4: Test health endpoint
    console.log('4️⃣  Testing health endpoint...');
    const health = await axios.get(`${API_BASE}/health`);
    console.log(`✅ Server is up! Status: ${health.data.status}\n`);
    
    // Step 5: Request symbol (will trigger collection)
    console.log(`5️⃣  Requesting ${TEST_SYMBOL} (will trigger collection)...`);
    try {
      const response = await axios.get(`${API_BASE}/api/stock/${TEST_SYMBOL}?interval=1d`);
      console.log(`✅ Got data immediately! ${response.data.chart.result[0].timestamp.length} bars`);
    } catch (error) {
      if (error.response?.status === 503) {
        console.log(`⏳ Got 503 - Data is being collected`);
        console.log(`   Retry after: ${error.response.data.retryAfter}s`);
        console.log(`   Message: ${error.response.data.message}\n`);
        
        console.log(`6️⃣  Waiting ${error.response.data.retryAfter}s then retrying...`);
        await sleep(error.response.data.retryAfter * 1000);
        
        try {
          const retry = await axios.get(`${API_BASE}/api/stock/${TEST_SYMBOL}?interval=1d`);
          console.log(`✅ SUCCESS! Got ${retry.data.chart.result[0].timestamp.length} bars`);
          console.log(`   Latest close: $${retry.data.chart.result[0].indicators.quote[0].close.slice(-1)[0]}`);
        } catch (retryError) {
          console.log(`❌ Retry failed: ${retryError.response?.data?.message || retryError.message}`);
        }
      } else {
        throw error;
      }
    }
    
    console.log('\n7️⃣  Checking database stats...');
    const stats = await axios.get(`${API_BASE}/stats`);
    console.log(`   Active symbols: ${stats.data.symbols.active_symbols}`);
    console.log(`   Intervals with data: ${stats.data.candles.length}`);
    
    console.log('\n✨ TEST COMPLETE!');
    console.log('=' .repeat(50));
    console.log('\n⚠️  Server is still running in background. Press Ctrl+C to stop.\n');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    if (error.response) {
      console.error('   Response:', error.response.data);
    }
    process.exit(1);
  }
}

testQuick();
