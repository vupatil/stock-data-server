/**
 * TEST MARKET HOURS FUNCTION
 */

function isMarketHours() {
  const now = new Date();
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = et.getDay();
  const hour = et.getHours();
  const minute = et.getMinutes();
  
  if (day === 0 || day === 6) return false; // Weekend
  const time = hour * 60 + minute;
  return time >= (9 * 60 + 30) && time <= (16 * 60); // 9:30 AM - 4:00 PM ET
}

console.log('\n🕐 MARKET HOURS CHECK\n');

// Current time
const now = new Date();
console.log('Current time (local):');
console.log(`  ${now.toString()}`);

// ET time
const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
console.log('\nCurrent time (ET):');
console.log(`  ${et.toString()}`);
console.log(`  Day: ${et.getDay()} (0=Sunday, 6=Saturday)`);
console.log(`  Hour: ${et.getHours()}`);
console.log(`  Minute: ${et.getMinutes()}`);

const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
console.log(`  Day name: ${dayNames[et.getDay()]}`);

// Time in minutes
const timeInMinutes = et.getHours() * 60 + et.getMinutes();
console.log(`  Time in minutes: ${timeInMinutes}`);
console.log(`  Market open (570): ${timeInMinutes >= 570}`);
console.log(`  Market close (960): ${timeInMinutes <= 960}`);

// Market hours check
const isOpen = isMarketHours();
console.log(`\n📊 Market is: ${isOpen ? '✅ OPEN' : '❌ CLOSED'}`);

if (!isOpen) {
  if (et.getDay() === 0 || et.getDay() === 6) {
    console.log('   Reason: Weekend');
  } else if (timeInMinutes < 570) {
    const minutesUntilOpen = 570 - timeInMinutes;
    console.log(`   Reason: Before 9:30 AM (opens in ${minutesUntilOpen} minutes)`);
  } else if (timeInMinutes > 960) {
    console.log('   Reason: After 4:00 PM (market closed for the day)');
  }
}

console.log('');
