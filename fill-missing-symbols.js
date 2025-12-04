/**
 * FILL MISSING SYMBOLS
 * 
 * Manually triggers gap fill for symbols that have no data
 */

const axios = require('axios');
const { initDB, getDB, closeDB } = require('./config/database');
require('dotenv').config();

const ALPACA_CONFIG = {
  baseURL: process.env.ALPACA_BASE_URL || 'https://data.alpaca.markets',
  headers: {
    'APCA-API-KEY-ID': process.env.ALPACA_API_KEY,
    'APCA-API-SECRET-KEY': process.env.ALPACA_API_SECRET
  }
};

const INTERVALS = ['1d', '1w', '1mo']; // Start with longer intervals first

async function fillMissingSymbols() {
  console.log('🔍 Finding symbols with no data...\n');
  
  try {
    await initDB();
    const db = getDB();
    
    // Find symbols with no data
    const [missing] = await db.query(`
      SELECT s.stock_id, s.symbol, s.market_cap_rank
      FROM stocks s
      LEFT JOIN candles c ON s.stock_id = c.stock_id
      WHERE s.is_active = TRUE AND c.candle_id IS NULL
      GROUP BY s.stock_id
      ORDER BY s.market_cap_rank ASC
    `);
    
    console.log(`📊 Found ${missing.length} symbols without data\n`);
    
    if (missing.length === 0) {
      console.log('✅ All symbols have data!');
      return;
    }
    
    console.log('Starting gap fill...\n');
    
    for (const stock of missing) {
      console.log(`\n📈 ${stock.symbol} (rank ${stock.market_cap_rank})`);
      
      for (const interval of INTERVALS) {
        try {
          // Fetch from Alpaca
          const timeframe = interval === '1d' ? '1Day' : interval === '1w' ? '1Week' : '1Month';
          const limit = 600; // MAX_CANDLES
          
          const response = await axios.get(
            `${ALPACA_CONFIG.baseURL}/v2/stocks/${stock.symbol}/bars`,
            {
              headers: ALPACA_CONFIG.headers,
              params: {
                timeframe,
                limit,
                adjustment: 'split',
                feed: 'iex'
              }
            }
          );
          
          if (!response.data.bars || response.data.bars.length === 0) {
            console.log(`  ⚠️  ${interval}: No data from Alpaca`);
            continue;
          }
          
          // Insert candles
          let inserted = 0;
          for (const bar of response.data.bars) {
            const ts = Math.floor(new Date(bar.t).getTime() / 1000);
            
            await db.query(
              `INSERT IGNORE INTO candles 
               (stock_id, interval_type, ts, open, high, low, close, volume, vwap, trade_count, data_source)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'alpaca')`,
              [stock.stock_id, interval, ts, bar.o, bar.h, bar.l, bar.c, bar.v, bar.vw || 0, bar.n || 0]
            );
            inserted++;
          }
          
          console.log(`  ✓ ${interval}: ${inserted} candles`);
          
          // Rate limiting
          await new Promise(resolve => setTimeout(resolve, 200));
          
        } catch (error) {
          if (error.response?.status === 404) {
            console.log(`  ✗ ${interval}: Symbol not found in Alpaca`);
          } else if (error.response?.status === 429) {
            console.log(`  ⚠️  Rate limited, waiting 60s...`);
            await new Promise(resolve => setTimeout(resolve, 60000));
          } else {
            console.log(`  ✗ ${interval}: ${error.message}`);
          }
        }
      }
    }
    
    console.log('\n✅ Gap fill complete!');
    
    // Show updated stats
    const [total] = await db.query('SELECT COUNT(*) as count FROM stocks WHERE is_active = TRUE');
    const [withData] = await db.query('SELECT COUNT(DISTINCT c.stock_id) as count FROM candles c JOIN stocks s ON c.stock_id = s.stock_id WHERE s.is_active = TRUE');
    console.log(`\n📊 Stats:`);
    console.log(`   Total active: ${total[0].count}`);
    console.log(`   With data: ${withData[0].count}`);
    console.log(`   Still missing: ${total[0].count - withData[0].count}`);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await closeDB();
    process.exit(0);
  }
}

fillMissingSymbols();
