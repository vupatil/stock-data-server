/**
 * Database Configuration Module
 */

const mysql = require('mysql2/promise');
require('dotenv').config();

const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'stock_data_db',
  waitForConnections: true,
  connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT) || 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
};

let pool;

/**
 * Initialize database connection pool
 */
async function initDB() {
  try {
    pool = mysql.createPool(DB_CONFIG);
    
    // Test connection
    const connection = await pool.getConnection();
    await connection.ping();
    connection.release();
    
    console.log('✅ MySQL connected');
    return pool;
  } catch (error) {
    console.error('❌ MySQL connection failed:', error.message);
    throw error;
  }
}

/**
 * Get database connection pool
 */
function getDB() {
  if (!pool) {
    throw new Error('Database not initialized. Call initDB() first.');
  }
  return pool;
}

/**
 * Close database connection pool
 */
async function closeDB() {
  if (pool) {
    await pool.end();
    console.log('✅ MySQL connection closed');
  }
}

module.exports = {
  initDB,
  getDB,
  closeDB,
  DB_CONFIG
};
