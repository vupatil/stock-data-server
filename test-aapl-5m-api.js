const https = require('http');

const options = {
  hostname: 'localhost',
  port: 3001,
  path: '/api/stock/AAPL?interval=5m',
  method: 'GET'
};

console.log('\n🔍 Testing: GET http://localhost:3001/api/stock/AAPL?interval=5m\n');

const req = https.request(options, (res) => {
  let data = '';
  
  console.log(`📡 Status Code: ${res.statusCode}`);
  console.log(`📋 Headers:`, res.headers);
  console.log('');
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      
      if (json.chart && json.chart.result && json.chart.result[0]) {
        const result = json.chart.result[0];
        const timestamps = result.timestamp || [];
        const indicators = result.indicators.quote[0];
        
        console.log('✅ Response Structure:');
        console.log(`  Symbol: ${result.meta.symbol}`);
        console.log(`  Interval: ${result.meta.dataGranularity}`);
        console.log(`  Currency: ${result.meta.currency}`);
        console.log(`  Exchange: ${result.meta.exchangeName}`);
        console.log(`  Total bars: ${timestamps.length}`);
        
        if (timestamps.length > 0) {
          console.log('\n📊 Latest 5 Bars:');
          console.log('─'.repeat(100));
          
          for (let i = Math.max(0, timestamps.length - 5); i < timestamps.length; i++) {
            const date = new Date(timestamps[i] * 1000);
            const now = new Date();
            const ageMinutes = Math.floor((now - date) / 60000);
            
            console.log(`  ${date.toLocaleString()} | O:$${indicators.open[i].toFixed(2)} H:$${indicators.high[i].toFixed(2)} L:$${indicators.low[i].toFixed(2)} C:$${indicators.close[i].toFixed(2)} | V:${indicators.volume[i].toLocaleString()} | Age: ${ageMinutes}m`);
          }
          
          const latestTimestamp = timestamps[timestamps.length - 1];
          const latestDate = new Date(latestTimestamp * 1000);
          const now = new Date();
          const ageMinutes = Math.floor((now - latestDate) / 60000);
          
          console.log('\n⏰ Freshness Check:');
          console.log(`  Latest bar: ${latestDate.toLocaleString()}`);
          console.log(`  Current time: ${now.toLocaleString()}`);
          console.log(`  Age: ${ageMinutes} minutes`);
          console.log(`  Status: ${ageMinutes <= 10 ? '✅ FRESH (≤10m)' : ageMinutes <= 24*60 ? '⚠️ STALE (>10m)' : '❌ VERY STALE (>24h)'}`);
        }
      } else if (json.error) {
        console.log('❌ Error Response:');
        console.log(`  Error: ${json.error}`);
        console.log(`  Message: ${json.message}`);
        console.log(`  Status: ${json.status}`);
        if (json.retryAfter) {
          console.log(`  Retry After: ${json.retryAfter}s`);
        }
      } else {
        console.log('📄 Full Response:');
        console.log(JSON.stringify(json, null, 2));
      }
    } catch (e) {
      console.error('❌ Failed to parse response:', e.message);
      console.log('Raw data:', data);
    }
    
    process.exit(0);
  });
});

req.on('error', (e) => {
  console.error(`❌ Request failed: ${e.message}`);
  process.exit(1);
});

req.end();
