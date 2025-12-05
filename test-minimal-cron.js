const cron = require('node-cron');

console.log('Testing if cron actually fires...\n');

let callCount = 0;

// Test 1: Simple every-second cron
console.log('Test 1: Scheduling every-second cron (* * * * * *)');
cron.schedule('* * * * * *', () => {
  callCount++;
  console.log(`  ✅ Cron fired! Count: ${callCount}, Time: ${new Date().toLocaleTimeString()}`);
});

// Test 2: Every minute at 15 seconds  
console.log('Test 2: Scheduling "15 * * * * *" (should fire at :15 seconds)');
cron.schedule('15 * * * * *', () => {
  console.log(`  ✅ 15-second cron fired! Time: ${new Date().toLocaleTimeString()}`);
});

console.log('\nWaiting 10 seconds to see if crons fire...');

setTimeout(() => {
  console.log(`\nResult: ${callCount} cron fires detected`);
  if (callCount > 0) {
    console.log('✅ Cron scheduler is working!');
  } else {
    console.log('❌ Cron scheduler is NOT working!');
  }
  process.exit(0);
}, 10000);
