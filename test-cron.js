const cron = require('node-cron');

console.log('\n🧪 Testing if cron jobs actually fire...\n');

let count = 0;

// Test 1: Every second
console.log('Setting up test cron: fires every second');
cron.schedule('* * * * * *', () => {
  count++;
  console.log(`✅ Cron fired! Count: ${count}`);
  
  if (count >= 3) {
    console.log('\n✅ SUCCESS: Cron jobs ARE working!');
    console.log('   Problem must be elsewhere (lock, error, etc.)');
    process.exit(0);
  }
});

console.log('Waiting for cron to fire (will exit after 3 fires)...\n');

setTimeout(() => {
  console.log('\n❌ TIMEOUT: Cron did NOT fire in 5 seconds!');
  console.log('   This means cron scheduler is broken');
  process.exit(1);
}, 5000);
