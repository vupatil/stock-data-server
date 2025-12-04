/**
 * Database Setup Script
 * Creates MySQL database and tables automatically
 */

const mysql = require('mysql2/promise');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

async function setup() {
  console.log('\n╔═══════════════════════════════════════════════╗');
  console.log('║     🗄️  DATABASE SETUP                       ║');
  console.log('╚═══════════════════════════════════════════════╝\n');
  
  try {
    // Connect without database
    console.log('📡 Connecting to MySQL...');
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 3306,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD,
      multipleStatements: true
    });
    
    console.log('✅ Connected to MySQL');
    
    // Create database
    const dbName = process.env.DB_NAME || 'stock_data_db';
    console.log(`\n📦 Creating database '${dbName}'...`);
    await connection.query(`CREATE DATABASE IF NOT EXISTS ${dbName}`);
    console.log(`✅ Database '${dbName}' ready`);
    
    // Use database
    await connection.query(`USE ${dbName}`);
    
    // Read schema file
    console.log('\n📝 Reading schema file...');
    const schemaPath = path.join(__dirname, 'database', 'schema.sql');
    const schema = await fs.readFile(schemaPath, 'utf8');
    console.log('✅ Schema file loaded');
    
    // Execute schema
    console.log('\n⚙️  Creating tables...');
    await connection.query(schema);
    console.log('✅ All tables created');
    
    // Verify tables
    console.log('\n📊 Verifying tables...');
    const [tables] = await connection.query('SHOW TABLES');
    console.log(`✅ Found ${tables.length} tables:`);
    tables.forEach(table => {
      console.log(`   • ${Object.values(table)[0]}`);
    });
    
    // Check sample data
    const [stocks] = await connection.query('SELECT COUNT(*) as count FROM stocks');
    console.log(`\n📈 Sample stocks: ${stocks[0].count}`);
    
    await connection.end();
    
    console.log('\n╔═══════════════════════════════════════════════╗');
    console.log('║     ✅ SETUP COMPLETE!                       ║');
    console.log('╚═══════════════════════════════════════════════╝\n');
    
    console.log('Next steps:');
    console.log('1. Copy .env.example to .env');
    console.log('2. Add your Alpaca API keys to .env');
    console.log('3. Run: npm run test (test Alpaca connection)');
    console.log('4. Run: npm run collector (start data collection)');
    console.log('5. Run: npm start (start API server)\n');
    
  } catch (error) {
    console.error('\n❌ Setup failed:', error.message);
    console.log('\nTroubleshooting:');
    console.log('• Make sure MySQL is running');
    console.log('• Check your .env file has correct DB credentials');
    console.log('• Verify DB_USER has CREATE DATABASE permissions\n');
    process.exit(1);
  }
}

setup();
