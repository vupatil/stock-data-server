/**
 * COMPREHENSIVE INTERVAL AGGREGATION TEST
 * 
 * Tests all 32 supported intervals:
 * - 11 stored intervals (1m, 2m, 5m, 15m, 30m, 1h, 2h, 4h, 1d, 1w, 1mo)
 * - 21 aggregated intervals (3m, 6m, 10m, 12m, 20m, 45m, 3h, 6h, 8h, 12h, 2d, 3d, 4d, 5d, 2w, 3w, 2mo, 3mo, 4mo, 6mo, 12mo)
 * 
 * Validates:
 * - Response structure matches Yahoo Finance format
 * - OHLCV data is present and valid
 * - Aggregated intervals have correct bar counts relative to source
 * - Timestamps are in ascending order
 * - OHLC relationships are valid (high >= close/open, low <= close/open)
 */

require('dotenv').config();
const axios = require('axios');

const API_URL = process.env.API_URL || 'http://localhost:3001';
const TEST_SYMBOL = 'AAPL';

// All 32 intervals grouped by type
const ALL_INTERVALS = {
  stored: {
    minutes: ['1m', '2m', '5m', '15m', '30m'],
    hours: ['1h', '2h', '4h'],
    days: ['1d', '1w', '1mo']
  },
  aggregated: {
    minutes: ['3m', '6m', '10m', '12m', '20m', '45m'],
    hours: ['3h', '6h', '8h', '12h'],
    days: ['2d', '3d', '4d', '5d'],
    weeks: ['2w', '3w'],
    months: ['2mo', '3mo', '4mo', '6mo', '12mo']
  }
};

// Expected aggregation ratios (aggregated bars should be ~1/multiplier of source bars)
const AGGREGATION_SPECS = {
  '3m': { source: '1m', multiplier: 3, tolerance: 0.15 },
  '6m': { source: '2m', multiplier: 3, tolerance: 0.15 },
  '10m': { source: '5m', multiplier: 2, tolerance: 0.15 },
  '12m': { source: '2m', multiplier: 6, tolerance: 0.15 },
  '20m': { source: '5m', multiplier: 4, tolerance: 0.15 },
  '45m': { source: '15m', multiplier: 3, tolerance: 0.15 },
  '3h': { source: '1h', multiplier: 3, tolerance: 0.15 },
  '6h': { source: '2h', multiplier: 3, tolerance: 0.15 },
  '8h': { source: '4h', multiplier: 2, tolerance: 0.15 },
  '12h': { source: '4h', multiplier: 3, tolerance: 0.15 },
  '2d': { source: '1d', multiplier: 2, tolerance: 0.15 },
  '3d': { source: '1d', multiplier: 3, tolerance: 0.15 },
  '4d': { source: '1d', multiplier: 4, tolerance: 0.15 },
  '5d': { source: '1d', multiplier: 5, tolerance: 0.15 },
  '2w': { source: '1w', multiplier: 2, tolerance: 0.15 },
  '3w': { source: '1w', multiplier: 3, tolerance: 0.15 },
  '2mo': { source: '1mo', multiplier: 2, tolerance: 0.15 },
  '3mo': { source: '1mo', multiplier: 3, tolerance: 0.15 },
  '4mo': { source: '1mo', multiplier: 4, tolerance: 0.15 },
  '6mo': { source: '1mo', multiplier: 6, tolerance: 0.15 },
  '12mo': { source: '1mo', multiplier: 12, tolerance: 0.15 }
};

// Cache for source interval bar counts
const sourceBarCounts = {};

// Color codes
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function testInterval(interval) {
  try {
    const url = `${API_URL}/api/stock/${TEST_SYMBOL}?interval=${interval}`;
    const response = await axios.get(url, { timeout: 10000 });
    
    // Validate response structure
    if (!response.data.chart || !response.data.chart.result || response.data.chart.result.length === 0) {
      throw new Error('Invalid response structure');
    }
    
    const result = response.data.chart.result[0];
    const timestamps = result.timestamp;
    const quote = result.indicators.quote[0];
    
    // Validate data presence
    if (!timestamps || timestamps.length === 0) {
      throw new Error('No timestamps in response');
    }
    
    if (!quote.open || !quote.high || !quote.low || !quote.close || !quote.volume) {
      throw new Error('Missing OHLCV data');
    }
    
    const barCount = timestamps.length;
    
    // Validate all arrays have same length
    if (quote.open.length !== barCount || quote.high.length !== barCount || 
        quote.low.length !== barCount || quote.close.length !== barCount || 
        quote.volume.length !== barCount) {
      throw new Error('OHLCV array length mismatch');
    }
    
    // Validate timestamps are ascending
    for (let i = 1; i < timestamps.length; i++) {
      if (timestamps[i] <= timestamps[i - 1]) {
        throw new Error(`Timestamps not ascending at index ${i}`);
      }
    }
    
    // Validate OHLC relationships for first 10 bars
    const samplesToCheck = Math.min(10, barCount);
    for (let i = 0; i < samplesToCheck; i++) {
      const o = quote.open[i];
      const h = quote.high[i];
      const l = quote.low[i];
      const c = quote.close[i];
      const v = quote.volume[i];
      
      if (h < o || h < c) {
        throw new Error(`High < open/close at bar ${i}: h=${h}, o=${o}, c=${c}`);
      }
      if (l > o || l > c) {
        throw new Error(`Low > open/close at bar ${i}: l=${l}, o=${o}, c=${c}`);
      }
      if (v < 0) {
        throw new Error(`Negative volume at bar ${i}: ${v}`);
      }
    }
    
    // Store source bar count for aggregation validation
    if (!AGGREGATION_SPECS[interval]) {
      sourceBarCounts[interval] = barCount;
    }
    
    // Validate aggregation ratio if this is an aggregated interval
    let aggregationValid = true;
    let aggregationMessage = '';
    
    if (AGGREGATION_SPECS[interval]) {
      const spec = AGGREGATION_SPECS[interval];
      const sourceCount = sourceBarCounts[spec.source];
      
      if (sourceCount) {
        const expectedRatio = 1 / spec.multiplier;
        const actualRatio = barCount / sourceCount;
        const ratioError = Math.abs(actualRatio - expectedRatio) / expectedRatio;
        
        if (ratioError > spec.tolerance) {
          aggregationValid = false;
          aggregationMessage = ` [RATIO ERROR: expected ~${(expectedRatio * 100).toFixed(0)}% of ${spec.source} (${sourceCount} bars), got ${(actualRatio * 100).toFixed(0)}%]`;
        } else {
          aggregationMessage = ` [✓ from ${spec.source}×${spec.multiplier}, ratio: ${(actualRatio * 100).toFixed(0)}%]`;
        }
      } else {
        aggregationMessage = ` [waiting for ${spec.source} data]`;
      }
    }
    
    const status = aggregationValid ? '✓' : '✗';
    const statusColor = aggregationValid ? 'green' : 'red';
    
    log(`  ${status} ${interval.padEnd(5)} - ${barCount} bars${aggregationMessage}`, statusColor);
    
    return { success: true, interval, barCount, aggregationValid };
    
  } catch (error) {
    const message = error.response?.data?.message || error.message;
    log(`  ✗ ${interval.padEnd(5)} - ERROR: ${message}`, 'red');
    return { success: false, interval, error: message };
  }
}

async function runTests() {
  console.log('\n╔═══════════════════════════════════════════════════════════╗');
  console.log('║  🧪 COMPREHENSIVE INTERVAL AGGREGATION TEST              ║');
  console.log('╚═══════════════════════════════════════════════════════════╝\n');
  
  log(`Testing symbol: ${TEST_SYMBOL}`, 'cyan');
  log(`API endpoint: ${API_URL}`, 'cyan');
  log(`Total intervals: 32 (11 stored + 21 aggregated)\n`, 'cyan');
  
  const results = {
    stored: { passed: 0, failed: 0, details: [] },
    aggregated: { passed: 0, failed: 0, details: [] }
  };
  
  // Test stored intervals first (needed for aggregation validation)
  log('═══ STORED INTERVALS (from database) ═══\n', 'blue');
  
  for (const category of ['minutes', 'hours', 'days']) {
    log(`${category.toUpperCase()}:`, 'yellow');
    for (const interval of ALL_INTERVALS.stored[category]) {
      const result = await testInterval(interval);
      if (result.success) {
        results.stored.passed++;
      } else {
        results.stored.failed++;
      }
      results.stored.details.push(result);
    }
    console.log('');
  }
  
  // Small delay to ensure source data is available
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Test aggregated intervals
  log('═══ AGGREGATED INTERVALS (on-the-fly) ═══\n', 'blue');
  
  for (const category of ['minutes', 'hours', 'days', 'weeks', 'months']) {
    if (ALL_INTERVALS.aggregated[category]) {
      log(`${category.toUpperCase()}:`, 'yellow');
      for (const interval of ALL_INTERVALS.aggregated[category]) {
        const result = await testInterval(interval);
        if (result.success && result.aggregationValid !== false) {
          results.aggregated.passed++;
        } else {
          results.aggregated.failed++;
        }
        results.aggregated.details.push(result);
      }
      console.log('');
    }
  }
  
  // Summary
  console.log('═══════════════════════════════════════════════════════════');
  log('\n📊 TEST SUMMARY\n', 'cyan');
  
  const totalPassed = results.stored.passed + results.aggregated.passed;
  const totalFailed = results.stored.failed + results.aggregated.failed;
  const totalTests = totalPassed + totalFailed;
  
  log(`Stored intervals:     ${results.stored.passed}/${results.stored.passed + results.stored.failed} passed`, 
      results.stored.failed === 0 ? 'green' : 'yellow');
  log(`Aggregated intervals: ${results.aggregated.passed}/${results.aggregated.passed + results.aggregated.failed} passed`, 
      results.aggregated.failed === 0 ? 'green' : 'yellow');
  log(`\nTotal: ${totalPassed}/${totalTests} passed (${((totalPassed/totalTests)*100).toFixed(1)}%)`, 
      totalFailed === 0 ? 'green' : 'red');
  
  // Failed tests detail
  if (totalFailed > 0) {
    log('\n❌ FAILED TESTS:', 'red');
    [...results.stored.details, ...results.aggregated.details]
      .filter(r => !r.success || r.aggregationValid === false)
      .forEach(r => {
        log(`  - ${r.interval}: ${r.error || 'Aggregation ratio validation failed'}`, 'red');
      });
  }
  
  // Aggregation efficiency report
  log('\n📈 AGGREGATION EFFICIENCY:', 'cyan');
  const aggregatedResults = results.aggregated.details.filter(r => r.success && r.barCount);
  
  const efficiency = {};
  aggregatedResults.forEach(r => {
    const spec = AGGREGATION_SPECS[r.interval];
    if (spec && sourceBarCounts[spec.source]) {
      const sourceCount = sourceBarCounts[spec.source];
      const reduction = ((1 - r.barCount / sourceCount) * 100).toFixed(1);
      efficiency[r.interval] = {
        source: spec.source,
        sourceCount,
        aggregatedCount: r.barCount,
        reduction: `${reduction}%`
      };
    }
  });
  
  if (Object.keys(efficiency).length > 0) {
    Object.entries(efficiency).forEach(([interval, data]) => {
      log(`  ${interval}: ${data.sourceCount} → ${data.aggregatedCount} bars (${data.reduction} reduction)`, 'gray');
    });
  }
  
  console.log('\n═══════════════════════════════════════════════════════════\n');
  
  process.exit(totalFailed === 0 ? 0 : 1);
}

// Run tests
runTests().catch(error => {
  log(`\n❌ Test suite failed: ${error.message}`, 'red');
  process.exit(1);
});
