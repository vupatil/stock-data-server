/**
 * Test intraday data fetching when market is closed
 * Should return data up to last market close (4 PM ET)
 */

require('dotenv').config();

function getTimeRangeForInterval(intervalParam) {
  const now = Math.floor(Date.now() / 1000);
  const intervalLookback = {
    '1m': 24 * 60 * 60,           // 1 day
    '2m': 24 * 60 * 60,           // 1 day
    '5m': 5 * 24 * 60 * 60,       // 5 days
    '15m': 30 * 24 * 60 * 60,     // 30 days
    '30m': 30 * 24 * 60 * 60,     // 30 days
    '1h': 90 * 24 * 60 * 60,      // 90 days
    '2h': 90 * 24 * 60 * 60,      // 90 days
    '4h': 180 * 24 * 60 * 60,     // 180 days
    '1d': Math.floor(365 * 2.5) * 24 * 60 * 60,
    '1w': 1825 * 24 * 60 * 60,
    '1mo': 3650 * 24 * 60 * 60
  };
  
  const lookback = intervalLookback[intervalParam] || 365 * 24 * 60 * 60;
  
  // For intraday intervals, if market is closed, adjust end time to last market close (4 PM ET)
  const intradayIntervals = ['1m', '2m', '5m', '15m', '30m', '1h', '2h', '4h'];
  let endTime = now;
  
  function isMarketHours() {
    const nowDate = new Date();
    const et = new Date(nowDate.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const day = et.getDay();
    const hour = et.getHours();
    const minute = et.getMinutes();
    
    if (day === 0 || day === 6) return false; // Weekend
    const time = hour * 60 + minute;
    return time >= (9 * 60 + 30) && time <= (16 * 60); // 9:30 AM - 4:00 PM ET
  }
  
  if (intradayIntervals.includes(intervalParam) && !isMarketHours()) {
    // Get current time in ET
    const nowDate = new Date();
    const etDate = new Date(nowDate.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    
    // Set to 4:00 PM ET today
    const marketClose = new Date(etDate);
    marketClose.setHours(16, 0, 0, 0);
    
    // If current ET time is before 4 PM, use previous trading day's close
    if (etDate.getHours() < 16 || (etDate.getHours() === 16 && etDate.getMinutes() === 0)) {
      marketClose.setDate(marketClose.getDate() - 1);
      // If that's a weekend, go back to Friday
      while (marketClose.getDay() === 0 || marketClose.getDay() === 6) {
        marketClose.setDate(marketClose.getDate() - 1);
      }
    }
    
    endTime = Math.floor(marketClose.getTime() / 1000);
  }
  
  return { start: endTime - lookback, end: endTime };
}

console.log('\n📊 Testing Intraday Market Close Logic\n');
console.log('=' .repeat(70));

const now = new Date();
const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
console.log(`\nCurrent Time (ET): ${et.toLocaleString('en-US', { timeZone: 'America/New_York' })}`);
console.log(`Day of Week: ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][et.getDay()]}`);

const intervals = ['1m', '5m', '15m', '1h', '1d'];

intervals.forEach(interval => {
  const { start, end } = getTimeRangeForInterval(interval);
  const startDate = new Date(start * 1000);
  const endDate = new Date(end * 1000);
  const endDateET = new Date(endDate.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  
  console.log(`\n${interval}:`);
  console.log(`  End Time (ET): ${endDateET.toLocaleString('en-US', { timeZone: 'America/New_York' })}`);
  console.log(`  Range: ${startDate.toISOString()} to ${endDate.toISOString()}`);
  
  const intradayIntervals = ['1m', '2m', '5m', '15m', '30m', '1h', '2h', '4h'];
  if (intradayIntervals.includes(interval)) {
    const endHour = endDateET.getHours();
    const endMinute = endDateET.getMinutes();
    if (endHour === 16 && endMinute === 0) {
      console.log(`  ✅ Correctly set to 4:00 PM ET (market close)`);
    } else {
      console.log(`  ⚠️  End time is ${endHour}:${String(endMinute).padStart(2, '0')} (expected 16:00)`);
    }
  }
});

console.log('\n' + '=' .repeat(70));
console.log('\n✅ Test complete\n');
