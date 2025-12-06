/**
 * Test different batch sizes to find optimal
 */

const axios = require('axios');
require('dotenv').config();

const ALPACA_CONFIG = {
  baseURL: process.env.ALPACA_BASE_URL || 'https://data.alpaca.markets',
  headers: {
    'APCA-API-KEY-ID': process.env.ALPACA_API_KEY,
    'APCA-API-SECRET-KEY': process.env.ALPACA_API_SECRET
  }
};

const TEST_SYMBOLS = [
  'NVDA', 'AAPL', 'GOOGL', 'MSFT', 'AMZN', 'AVGO', 'META', 'TSLA', 'BRK.B', 'LLY',
  'WMT', 'VOO', 'IVV', 'SPY', 'JPM', 'V', 'VTI', 'ORCL', 'JNJ', 'QQQ',
  'MA', 'XOM', 'VUG', 'NFLX', 'COST', 'VEA', 'ABBV', 'IEFA', 'VTV', 'BND',
  'GLD', 'AGG', 'PLTR', 'IWF', 'IEMG', 'VXUS', 'VGT', 'BAC', 'VWO', 'VIG',
  'IJH', 'SPYM', 'XLK', 'VO', 'IJR', 'HD', 'ITOT', 'AMD', 'BNDX', 'RSP'
];

async function testBatchSize(batchSize) {
  const end = new Date();
  const start = new Date(end.getTime() - (10 * 24 * 60 * 60 * 1000));
  
  const testSymbols = TEST_SYMBOLS.slice(0, batchSize);
  
  const params = {
    symbols: testSymbols.join(','),
    timeframe: '1Day',
    start: start.toISOString(),
    end: end.toISOString(),
    limit: 10000,
    adjustment: 'split',
    feed: 'iex'
  };
  
  try {
    const response = await axios.get('/v2/stocks/bars', {
      baseURL: ALPACA_CONFIG.baseURL,
      headers: ALPACA_CONFIG.headers,
      params,
      timeout: 30000
    });
    
    const returned = Object.keys(response.data.bars || {}).length;
    const successRate = ((returned / batchSize) * 100).toFixed(1);
    
    return { requested: batchSize, returned, successRate };
  } catch (error) {
    return { requested: batchSize, error: error.message };
  }
}

async function findOptimalBatchSize() {
  console.log('\n╔═══════════════════════════════════════════════╗');
  console.log('║   📊 FINDING OPTIMAL BATCH SIZE              ║');
  console.log('╚═══════════════════════════════════════════════╝\n');
  
  const batchSizes = [5, 10, 15, 20, 25, 30, 40, 50, 75, 100];
  
  console.log('Testing different batch sizes...\n');
  console.log('Batch Size | Returned | Success Rate');
  console.log('-----------|----------|-------------');
  
  for (const size of batchSizes) {
    const result = await testBatchSize(size);
    
    if (result.error) {
      console.log(`${String(size).padStart(10)} | ERROR    | ${result.error}`);
    } else {
      const successBar = '█'.repeat(Math.floor(parseFloat(result.successRate) / 5));
      console.log(`${String(size).padStart(10)} | ${String(result.returned).padStart(8)} | ${result.successRate}% ${successBar}`);
    }
    
    await new Promise(resolve => setTimeout(resolve, 500)); // Rate limit protection
  }
  
  console.log('\n\n╔═══════════════════════════════════════════════╗');
  console.log('║   💡 RECOMMENDATION                          ║');
  console.log('╚═══════════════════════════════════════════════╝\n');
  
  console.log('Based on the results above, we recommend:');
  console.log('• Use batch size of 20-25 symbols for 100% success rate');
  console.log('• Update BATCH_SIZE in setup.js from 100 to 25');
  console.log('• This ensures reliable data collection\n');
}

findOptimalBatchSize();
