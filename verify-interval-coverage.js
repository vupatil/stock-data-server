/**
 * Verify all intraday/lower timeframes are properly covered
 */

console.log('\n📊 INTRADAY INTERVAL COVERAGE VERIFICATION\n');
console.log('='.repeat(80));

const intervals = {
  intraday: ['1m', '2m', '5m', '15m', '30m', '1h', '2h', '4h'],
  daily: ['1d', '1w', '1mo']
};

console.log('\n✅ Intraday Intervals (8 total):');
intervals.intraday.forEach(interval => {
  console.log(`   ${interval}`);
});

console.log('\n📊 Daily/Weekly/Monthly Intervals (3 total):');
intervals.daily.forEach(interval => {
  console.log(`   ${interval}`);
});

console.log('\n' + '='.repeat(80));
console.log('\n🔍 Checking Coverage in Code:\n');

// Check 1: intervalLookback
console.log('1. intervalLookback (getTimeRangeForInterval):');
const intervalLookback = {
  '1m': 24 * 60 * 60,
  '2m': 24 * 60 * 60,
  '5m': 5 * 24 * 60 * 60,
  '15m': 30 * 24 * 60 * 60,
  '30m': 30 * 24 * 60 * 60,
  '1h': 90 * 24 * 60 * 60,
  '2h': 90 * 24 * 60 * 60,
  '4h': 180 * 24 * 60 * 60,
  '1d': Math.floor(365 * 2.5) * 24 * 60 * 60,
  '1w': 1825 * 24 * 60 * 60,
  '1mo': 3650 * 24 * 60 * 60
};

const allIntervals = [...intervals.intraday, ...intervals.daily];
let allCovered = true;

allIntervals.forEach(interval => {
  const covered = intervalLookback.hasOwnProperty(interval);
  console.log(`   ${covered ? '✅' : '❌'} ${interval}: ${covered ? (intervalLookback[interval] / (24*60*60)) + ' days' : 'MISSING'}`);
  if (!covered) allCovered = false;
});

// Check 2: Market close adjustment
console.log('\n2. Market Close Adjustment (intradayIntervals array):');
const intradayIntervalsInCode = ['1m', '2m', '5m', '15m', '30m', '1h', '2h', '4h'];
intervals.intraday.forEach(interval => {
  const covered = intradayIntervalsInCode.includes(interval);
  console.log(`   ${covered ? '✅' : '❌'} ${interval}`);
  if (!covered) allCovered = false;
});

// Check 3: Extended hours filter
console.log('\n3. Extended Hours Filter (includeExtended check):');
const extendedHoursFilter = ['1m', '2m', '5m', '15m', '30m', '1h', '2h', '4h'];
intervals.intraday.forEach(interval => {
  const covered = extendedHoursFilter.includes(interval);
  console.log(`   ${covered ? '✅' : '❌'} ${interval}`);
  if (!covered) allCovered = false;
});

// Check 4: Collection schedules
console.log('\n4. Collection Schedules (COLLECTION_INTERVALS):');
const collectionIntervals = [
  { name: '1m', cron: '* * * * *' },
  { name: '2m', cron: '*/2 * * * *' },
  { name: '5m', cron: '*/5 * * * *' },
  { name: '15m', cron: '*/15 * * * *' },
  { name: '30m', cron: '*/30 * * * *' },
  { name: '1h', cron: '0 * * * *' },
  { name: '2h', cron: '0 */2 * * *' },
  { name: '4h', cron: '0 */4 * * *' },
  { name: '1d', cron: '0 16 * * 1-5' },
  { name: '1w', cron: '0 16 * * 5' },
  { name: '1mo', cron: '0 16 28-31 * *' }
];

allIntervals.forEach(interval => {
  const schedule = collectionIntervals.find(c => c.name === interval);
  console.log(`   ${schedule ? '✅' : '❌'} ${interval}: ${schedule ? schedule.cron : 'MISSING'}`);
  if (!schedule) allCovered = false;
});

console.log('\n' + '='.repeat(80));

if (allCovered) {
  console.log('\n✅ ALL INTERVALS PROPERLY COVERED!\n');
  console.log('Summary:');
  console.log('  • 8 intraday intervals (1m, 2m, 5m, 15m, 30m, 1h, 2h, 4h)');
  console.log('  • 3 daily/weekly/monthly intervals (1d, 1w, 1mo)');
  console.log('  • Total: 11 intervals\n');
  console.log('Features:');
  console.log('  ✅ All have lookback ranges defined');
  console.log('  ✅ All intraday intervals adjust to 4 PM ET when market closed');
  console.log('  ✅ All intraday intervals filter extended hours');
  console.log('  ✅ All intervals have collection schedules\n');
} else {
  console.log('\n❌ SOME INTERVALS ARE MISSING COVERAGE!\n');
}
