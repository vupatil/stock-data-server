/**
 * Database Setup Script with Historical Data Population
 * Creates MySQL database, tables, and populates initial historical data
 */

const mysql = require('mysql2/promise');
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const { processBatchedSymbols, ALPACA_BATCH_SIZE } = require('./src/utils/batchProcessor');
require('dotenv').config();

// ===== ANSI COLORS =====

const colors = {
  reset: '\x1b[0m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m'
};

// ===== CONFIGURATION =====

const ALPACA_CONFIG = {
  baseURL: process.env.ALPACA_BASE_URL || 'https://data.alpaca.markets',
  headers: {
    'APCA-API-KEY-ID': process.env.ALPACA_API_KEY,
    'APCA-API-SECRET-KEY': process.env.ALPACA_API_SECRET
  }
};

const MAX_CANDLES = parseInt(process.env.MAX_CANDLES_PER_INTERVAL) || 600;
const EXTENDED_HOURS = process.env.EXTENDED_HOURS_COLLECTION === 'true';

// All supported intervals
const INTERVALS = [
  { name: '1m', alpaca: '1Min', minutes: 1 },
  { name: '2m', alpaca: '2Min', minutes: 2 },
  { name: '5m', alpaca: '5Min', minutes: 5 },
  { name: '15m', alpaca: '15Min', minutes: 15 },
  { name: '30m', alpaca: '30Min', minutes: 30 },
  { name: '1h', alpaca: '1Hour', minutes: 60 },
  { name: '2h', alpaca: '2Hour', minutes: 120 },
  { name: '4h', alpaca: '4Hour', minutes: 240 },
  { name: '1d', alpaca: '1Day', minutes: 1440 },
  { name: '1w', alpaca: '1Week', minutes: 10080 },
  { name: '1mo', alpaca: '1Month', minutes: 43200 }
];

// Priority order for data collection (daily/weekly first, then intraday)
const COLLECTION_PRIORITY = ['1d', '1w', '1mo', '4h', '2h', '1h', '30m', '15m', '5m', '2m', '1m'];

// ===== HELPER FUNCTIONS =====

function normalizeSymbol(symbol) {
  return symbol.toUpperCase().replace(/-/g, '.');
}

async function retryOnDeadlock(fn, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (error.code === 'ER_LOCK_DEADLOCK' && attempt < maxRetries) {
        console.log(`   ⚠️  Deadlock detected, retry ${attempt}/${maxRetries}...`);
        await new Promise(resolve => setTimeout(resolve, 50 * attempt));
        continue;
      }
      throw error;
    }
  }
}

async function getStockId(connection, symbol) {
  const [rows] = await connection.query(
    'SELECT stock_id FROM stocks WHERE symbol = ?',
    [symbol]
  );
  
  if (rows.length === 0) {
    const [result] = await connection.query(
      'INSERT INTO stocks (symbol) VALUES (?) ON DUPLICATE KEY UPDATE stock_id=LAST_INSERT_ID(stock_id)',
      [symbol]
    );
    return result.insertId;
  }
  
  return rows[0].stock_id;
}

async function fetchAlpacaBars(symbols, intervalConfig, lookbackCandles) {
  try {
    const end = new Date();
    const start = new Date(end.getTime() - (lookbackCandles * intervalConfig.minutes * 60 * 1000));
    
    const params = {
      symbols: symbols.join(','),
      timeframe: intervalConfig.alpaca,
      start: start.toISOString(),
      end: end.toISOString(),
      limit: 10000,
      adjustment: 'split',
      feed: EXTENDED_HOURS ? 'sip' : 'iex'
    };

    const response = await axios.get('/v2/stocks/bars', {
      baseURL: ALPACA_CONFIG.baseURL,
      headers: ALPACA_CONFIG.headers,
      params,
      timeout: 60000 // Longer timeout for initial setup
    });

    return response.data.bars || {};
  } catch (error) {
    console.error(`     ❌ Alpaca API error: ${error.message}`);
    return null;
  }
}

async function storeBars(connection, stockId, intervalName, bars) {
  if (!bars || bars.length === 0) return { inserted: 0, updated: 0 };
  
  const values = bars.map(bar => [
    stockId,
    intervalName,
    Math.floor(new Date(bar.t).getTime() / 1000),
    parseFloat(bar.o),
    parseFloat(bar.h),
    parseFloat(bar.l),
    parseFloat(bar.c),
    parseInt(bar.v) || 0,
    parseFloat(bar.vw) || null,
    parseInt(bar.n) || null,
    'alpaca'
  ]);
  
  await retryOnDeadlock(async () => {
    await connection.query(`
      INSERT INTO candles 
        (stock_id, interval_type, ts, open, high, low, close, volume, vwap, trade_count, data_source)
      VALUES ?
      ON DUPLICATE KEY UPDATE
        open = VALUES(open),
        high = VALUES(high),
        low = VALUES(low),
        close = VALUES(close),
        volume = VALUES(volume),
        vwap = VALUES(vwap),
        trade_count = VALUES(trade_count)
    `, [values]);
  });
  
  return { inserted: values.length, updated: 0 };
}

async function markSymbolAsExcluded(connection, symbol, reason, provider = 'alpaca') {
  const retryAfter = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days from now
  
  await connection.query(`
    INSERT INTO excluded_symbols (symbol, reason, providers_failed, retry_after, retry_count)
    VALUES (?, ?, ?, ?, 1)
    ON DUPLICATE KEY UPDATE
      providers_failed = CONCAT(COALESCE(providers_failed, ''), IF(providers_failed IS NULL, '', ','), ?),
      last_attempted_at = CURRENT_TIMESTAMP,
      retry_after = ?,
      retry_count = retry_count + 1,
      reason = ?
  `, [symbol, reason, provider, retryAfter, provider, retryAfter, reason]);
}

// ===== MAIN SETUP FUNCTION =====

async function setup() {
  console.log('\n╔═══════════════════════════════════════════════╗');
  console.log('║   🗄️  DATABASE SETUP WITH DATA POPULATION   ║');
  console.log('╚═══════════════════════════════════════════════╝\n');
  
  const setupStartTime = Date.now();
  console.log(`⏰ Setup started at: ${new Date().toLocaleString()}\n`);
  
  let connection;
  
  try {
    // Validate Alpaca credentials
    if (!process.env.ALPACA_API_KEY || !process.env.ALPACA_API_SECRET) {
      throw new Error('Missing Alpaca API credentials. Set ALPACA_API_KEY and ALPACA_API_SECRET in .env');
    }
    
    // Connect without database
    console.log('📡 Connecting to MySQL...');
    connection = await mysql.createConnection({
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
    
    // ===== POPULATE SYMBOLS AND HISTORICAL DATA =====
    
    const stockSymbols = process.env.STOCK_SYMBOLS 
      ? process.env.STOCK_SYMBOLS.split(',').map(s => normalizeSymbol(s.trim()))
      : [];
    
    if (stockSymbols.length === 0) {
      console.log('\n⚠️  No symbols found in STOCK_SYMBOLS environment variable.');
      console.log('   Skipping data population. Add symbols to .env to populate data.\n');
    } else {
      console.log(`\n\n╔═══════════════════════════════════════════════╗`);
      console.log(`║   📊 POPULATING HISTORICAL DATA              ║`);
      console.log(`╚═══════════════════════════════════════════════╝\n`);
      console.log(`📈 Found ${stockSymbols.length} symbols to populate`);
      console.log(`📦 Max candles per interval: ${MAX_CANDLES}`);
      console.log(`🔄 Batch size: ${ALPACA_BATCH_SIZE} symbols per request (Alpaca's limit)\n`);
      
      // Insert all symbols first
      console.log('📝 Inserting symbols into stocks table...');
      const insertStartTime = Date.now();
      for (const symbol of stockSymbols) {
        await getStockId(connection, symbol);
      }
      const insertDuration = ((Date.now() - insertStartTime) / 1000).toFixed(2);
      console.log(`✅ ${stockSymbols.length} symbols inserted in ${insertDuration}s\n`);
      
      // Track statistics
      const stats = {
        total: stockSymbols.length,
        successful: new Set(),
        failed: new Set(),
        byInterval: {}
      };
      
      // Process each interval in priority order
      for (const intervalName of COLLECTION_PRIORITY) {
        const intervalConfig = INTERVALS.find(i => i.name === intervalName);
        if (!intervalConfig) continue;
        
        const intervalStartTime = Date.now();
        
        console.log(`\n${'═'.repeat(60)}`);
        console.log(`📊 Collecting ${intervalName} interval (${intervalConfig.alpaca})`);
        console.log(`⏰ Started at: ${new Date().toLocaleTimeString()}`);
        console.log(`${'═'.repeat(60)}\n`);
        
        stats.byInterval[intervalName] = { successful: 0, failed: 0 };
        
        // Use centralized batch processor
        const result = await processBatchedSymbols(
          stockSymbols,
          async (batch, batchIndex, totalBatches) => {
            const batchStartTime = Date.now();
            const progress = `[${batchIndex + 1}/${totalBatches}]`;
            
            console.log(`\n📦 ${progress} Batch ${batchIndex + 1} of ${totalBatches} - Processing ${batch.length} symbols`);
            console.log(`   🎯 Symbols: ${batch.slice(0, 5).join(', ')}${batch.length > 5 ? ` ... +${batch.length - 5} more` : ''}`);
            console.log(`   📡 Requesting ~${MAX_CANDLES} candles per symbol from Alpaca...`);
            
            const barsData = await fetchAlpacaBars(batch, intervalConfig, MAX_CANDLES);
            
            if (!barsData) {
              console.log(`   ❌ Failed to fetch data from Alpaca for this batch`);
              batch.forEach(s => stats.failed.add(s));
              return { success: false, processedCount: 0 };
            }
            
            console.log(`   ✓ Received data from Alpaca, processing ${Object.keys(barsData).length} symbols...`);
            
            // Process each symbol in batch (parallelized for speed)
            const insertPromises = [];
            for (const symbol of batch) {
              const bars = barsData[symbol];
              
              if (!bars || bars.length === 0) {
                console.log(`   ⚠️  ${symbol}: No data available`);
                stats.byInterval[intervalName].failed++;
                
                // Only mark as excluded on first interval (1d)
                if (intervalName === '1d') {
                  insertPromises.push(
                    markSymbolAsExcluded(connection, symbol, 'No data from Alpaca', 'alpaca')
                      .then(() => stats.failed.add(symbol))
                  );
                }
                continue;
              }
              
              // Process symbol insertion in parallel with others in this batch
              insertPromises.push(
                (async () => {
                  const stockId = await getStockId(connection, symbol);
                  const { inserted } = await storeBars(connection, stockId, intervalName, bars);
                  console.log(`   ✓ ${symbol}: ${inserted} bars stored`);
                  stats.byInterval[intervalName].successful++;
                  stats.successful.add(symbol);
                })()
              );
            }
            
            // Wait for all symbols in this batch to complete
            await Promise.all(insertPromises);
            
            const batchDuration = ((Date.now() - batchStartTime) / 1000).toFixed(2);
            const batchSuccessRate = ((stats.byInterval[intervalName].successful / (batchIndex + 1) / batch.length) * 100).toFixed(1);
            
            console.log(`   ⏱️  Batch completed in ${batchDuration}s`);
            console.log(`   📊 Batch summary: ${stats.byInterval[intervalName].successful}/${(batchIndex + 1) * batch.length} symbols processed (${batchSuccessRate}% success rate)`);
            
            return { success: true, processedCount: batch.length };
          },
          {
            batchSize: ALPACA_BATCH_SIZE,
            delayBetweenBatches: 500
          }
        );
        
        const intervalDuration = ((Date.now() - intervalStartTime) / 1000).toFixed(2);
        const intervalSuccessRate = stats.byInterval[intervalName].successful > 0 
          ? ((stats.byInterval[intervalName].successful / stockSymbols.length) * 100).toFixed(1)
          : 0;
        
        console.log(`\n${'─'.repeat(60)}`);
        console.log(`✅ ${intervalName} interval complete!`);
        console.log(`   ⏱️  Time taken: ${intervalDuration}s`);
        console.log(`   ✓ Successful: ${stats.byInterval[intervalName].successful} symbols`);
        console.log(`   ✗ Failed: ${stats.byInterval[intervalName].failed} symbols`);
        console.log(`   📈 Success rate: ${intervalSuccessRate}%`);
        console.log(`${'─'.repeat(60)}`);
      }
      
      // ===== FINAL SUMMARY =====
      
      const setupDuration = ((Date.now() - setupStartTime) / 1000).toFixed(2);
      const setupMinutes = (setupDuration / 60).toFixed(2);
      const overallSuccessRate = stats.total > 0 
        ? ((stats.successful.size / stats.total) * 100).toFixed(1)
        : 0;
      
      console.log(`\n\n╔═══════════════════════════════════════════════╗`);
      console.log(`║   📊 DATA POPULATION SUMMARY                 ║`);
      console.log(`╚═══════════════════════════════════════════════╝\n`);
      
      console.log(`⏰ Setup completed at: ${new Date().toLocaleString()}`);
      console.log(`⏱️  Total time taken: ${setupMinutes} minutes (${setupDuration}s)\n`);
      
      console.log(`📈 Total symbols processed: ${stats.total}`);
      console.log(`✅ Successful: ${stats.successful.size} symbols (${overallSuccessRate}%)`);
      console.log(`❌ Failed: ${stats.failed.size} symbols\n`);
      
      console.log(`📊 Breakdown by interval:`);
      for (const intervalName of COLLECTION_PRIORITY) {
        const intervalStats = stats.byInterval[intervalName];
        if (intervalStats) {
          const intervalRate = intervalStats.successful > 0 
            ? ((intervalStats.successful / stats.total) * 100).toFixed(0)
            : 0;
          console.log(`  ${intervalName.padEnd(5)} → ✓ ${String(intervalStats.successful).padStart(3)}  ✗ ${String(intervalStats.failed).padStart(3)}  (${intervalRate}%)`);
        }
      }
      
      if (stats.failed.size > 0) {
        console.log(`\n⚠️  Failed symbols: ${Array.from(stats.failed).join(', ')}`);
        console.log(`   These have been added to 'excluded_symbols' table`);
        console.log(`   They will be retried in 30 days automatically\n`);
      }
      
      // ===== GAP DETECTION AND FILLING =====
      
      console.log(`\n\n╔═══════════════════════════════════════════════╗`);
      console.log(`║   🔍 GAP DETECTION AND FILLING               ║`);
      console.log(`╚═══════════════════════════════════════════════╝\n`);
      
      console.log(`⏰ Gap detection started at: ${new Date().toLocaleTimeString()}`);
      console.log(`🔎 Checking data completeness for ${stats.successful.size} successful symbols...\n`);
      
      let totalGaps = 0;
      const successfulSymbols = Array.from(stats.successful);
      const gapDetectionStartTime = Date.now();
      
      for (const intervalName of COLLECTION_PRIORITY) {
        const intervalConfig = INTERVALS.find(i => i.name === intervalName);
        if (!intervalConfig) continue;
        
        console.log(`\n📊 Validating ${intervalName} interval data...`);
        
        let intervalGaps = 0;
        let symbolsChecked = 0;
        
        for (const symbol of successfulSymbols) {
          symbolsChecked++;
          const stockId = await getStockId(connection, symbol);
          
          // Show progress every 50 symbols
          if (symbolsChecked % 50 === 0) {
            console.log(`   🔄 Progress: ${symbolsChecked}/${successfulSymbols.length} symbols checked...`);
          }
          
          // Get candle count
          const [countResult] = await connection.query(
            'SELECT COUNT(*) as count FROM candles WHERE stock_id = ? AND interval_type = ?',
            [stockId, intervalName]
          );
          
          const currentCount = countResult[0].count;
          
          if (currentCount < MAX_CANDLES * 0.8) { // If less than 80% of expected candles
            intervalGaps++;
            console.log(`   ⚠️  ${symbol}: Only ${currentCount}/${MAX_CANDLES} candles (potential gap)`);
            
            // Try to fill gap
            const barsData = await fetchAlpacaBars([symbol], intervalConfig, MAX_CANDLES);
            if (barsData && barsData[symbol] && barsData[symbol].length > 0) {
              const { inserted } = await storeBars(connection, stockId, intervalName, barsData[symbol]);
              if (inserted > 0) {
                console.log(`   ✓ ${symbol}: Filled ${inserted} missing bars`);
              }
            }
          }
        }
        
        totalGaps += intervalGaps;
        
        if (intervalGaps === 0) {
          console.log(`   ✅ All ${symbolsChecked} symbols have complete data`);
        } else {
          console.log(`   ⚠️  ${intervalGaps} symbols had potential gaps (filled automatically)`);
        }
      }
      
      const gapDetectionDuration = ((Date.now() - gapDetectionStartTime) / 1000).toFixed(2);
      console.log(`\n⏱️  Gap detection completed in ${gapDetectionDuration}s`);
      console.log(`✅ Validated ${successfulSymbols.length} symbols across ${COLLECTION_PRIORITY.length} intervals`);
      console.log(`📊 Total gaps found and filled: ${totalGaps}\n`);
    }
    
    // ===== FINAL VERIFICATION =====
    
    console.log(`\n╔═══════════════════════════════════════════════╗`);
    console.log(`║   📊 FINAL VERIFICATION                      ║`);
    console.log(`╚═══════════════════════════════════════════════╝\n`);
    
    console.log(`🔍 Counting database records...`);
    
    const [stockCount] = await connection.query('SELECT COUNT(*) as count FROM stocks');
    const [candleCount] = await connection.query('SELECT COUNT(*) as count FROM candles');
    const [excludedCount] = await connection.query('SELECT COUNT(*) as count FROM excluded_symbols');
    
    const totalSetupDuration = ((Date.now() - setupStartTime) / 1000).toFixed(2);
    const totalMinutes = (totalSetupDuration / 60).toFixed(2);
    const avgTimePerSymbol = stockSymbols.length > 0 
      ? (totalSetupDuration / stockSymbols.length).toFixed(2)
      : 0;
    
    console.log(`\n╔═══════════════════════════════════════════════╗`);
    console.log(`║   ✅ SETUP COMPLETE!                         ║`);
    console.log(`╚═══════════════════════════════════════════════╝\n`);
    
    console.log(`⏰ Finished at: ${new Date().toLocaleString()}`);
    console.log(`⏱️  Total duration: ${totalMinutes} minutes (${totalSetupDuration}s)`);
    console.log(`📈 Average time per symbol: ${avgTimePerSymbol}s\n`);
    
    console.log(`📊 Final Database Statistics:`);
    console.log(`   • Total Stocks: ${stockCount[0].count.toLocaleString()}`);
    console.log(`   • Total Candles: ${candleCount[0].count.toLocaleString()}`);
    console.log(`   • Excluded Symbols: ${excludedCount[0].count}`);
    console.log(`   • Candles per Stock: ${stockCount[0].count > 0 ? Math.round(candleCount[0].count / stockCount[0].count).toLocaleString() : 0}\n`);
    
    console.log(`🎉 Success! Your stock data server is ready to use!\n`);
    console.log(`Next steps:`);
    console.log(`1. Start collector: ${colors.cyan}node collector.js${colors.reset}`);
    console.log(`2. Start API server: ${colors.cyan}node server.js${colors.reset}`);
    console.log(`   OR use combined: ${colors.cyan}node app.js${colors.reset}`);
    console.log(`3. Test API: ${colors.cyan}curl "http://localhost:3001/api/stock/AAPL?interval=1d"${colors.reset}\n`);
    
    await connection.end();
    
  } catch (error) {
    console.error('\n❌ Setup failed:', error.message);
    console.error(error.stack);
    console.log('\nTroubleshooting:');
    console.log('• Make sure MySQL is running');
    console.log('• Check your .env file has correct DB credentials');
    console.log('• Verify DB_USER has CREATE DATABASE permissions');
    console.log('• Ensure ALPACA_API_KEY and ALPACA_API_SECRET are set\n');
    
    if (connection) {
      await connection.end();
    }
    
    process.exit(1);
  }
}

setup();
