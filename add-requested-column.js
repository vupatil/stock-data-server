/**
 * Add requested_at column to stocks table
 */

require('dotenv').config();
const { initDB, getDB, closeDB } = require('./config/database');

async function addColumn() {
  try {
    await initDB();
    const db = getDB();
    
    console.log('Adding requested_at column to stocks table...');
    
    // Check if column exists first
    const [columns] = await db.query(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = '${process.env.DB_NAME}' 
      AND TABLE_NAME = 'stocks' 
      AND COLUMN_NAME = 'requested_at'
    `);
    
    if (columns.length > 0) {
      console.log('✅ Column already exists');
      return;
    }
    
    await db.query(`
      ALTER TABLE stocks 
      ADD COLUMN requested_at TIMESTAMP NULL AFTER updated_at
    `);
    
    console.log('✅ Column added successfully!');
    
  } catch (error) {
    if (error.message.includes('Duplicate column')) {
      console.log('✅ Column already exists');
    } else {
      console.error('❌ Error:', error.message);
    }
  } finally {
    await closeDB();
  }
}

addColumn();
