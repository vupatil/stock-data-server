require('dotenv').config();
const { initDB, getDB, closeDB } = require('./config/database');

async function testDatabase() {
  console.log('\n📊 Testing Database Connection...\n');
  
  try {
    await initDB();
    const db = getDB();
    
    // Test connection
    console.log('✅ Database connected');
    
    // Check tables
    const [tables] = await db.query('SHOW TABLES');
    console.log(`✅ Found ${tables.length} tables:`);
    const tableNames = tables.map(t => Object.values(t)[0]);
    tableNames.forEach(name => {
      console.log(`   • ${name}`);
    });
    
    // Check each table
    console.log('\n📋 Table Details:\n');
    
    for (const tableName of tableNames) {
      const [count] = await db.query(`SELECT COUNT(*) as count FROM ${tableName}`);
      console.log(`   ${tableName}: ${count[0].count} rows`);
    }
    
    console.log('\n✅ Database test complete!\n');
    
    await closeDB();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Database test failed:', error.message);
    process.exit(1);
  }
}

testDatabase();
