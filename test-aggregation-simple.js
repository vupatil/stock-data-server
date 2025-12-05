/**
 * SIMPLE AGGREGATION TEST
 * Run this while the server is running in another terminal
 */

const axios = require('axios');

const API_URL = 'http://localhost:3001';
const SYMBOL = 'AAPL';

// Test a few key intervals
const testIntervals = [
  '1m',   // Stored
  '3m',   // Aggregated from 1m×3
  '1d',   // Stored
  '3d',   // Aggregated from 1d×3
  '1w',   // Stored
  '2w',   // Aggregated from 1w×2
];

async function testInterval(interval) {
  try {
    const url = `${API_URL}/api/stock/${SYMBOL}?interval=${interval}`;
    const response = await axios.get(url, { timeout: 10000 });
    
    const result = response.data.chart.result[0];
    const barCount = result.timestamp.length;
    
    console.log(`✓ ${interval.padEnd(4)} - ${barCount} bars`);
    return barCount;
  } catch (error) {
    console.log(`✗ ${interval.padEnd(4)} - ERROR: ${error.response?.data?.message || error.message}`);
    return null;
  }
}

async function main() {
  console.log('\n🧪 Testing Interval Aggregation\n');
  console.log(`Symbol: ${SYMBOL}`);
  console.log(`API: ${API_URL}\n`);
  
  for (const interval of testIntervals) {
    await testInterval(interval);
  }
  
  console.log('\n✅ Test complete!\n');
}

main().catch(console.error);
