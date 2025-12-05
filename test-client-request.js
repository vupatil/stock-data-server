const http = require('http');

const url = 'http://localhost:3001/api/stock/AAPL?interval=5m&includePrePost=true';

console.log('\n🔍 CLIENT REQUEST (Exactly as client sends):\n');
console.log(`URL: ${url}\n`);

const options = {
  hostname: 'localhost',
  port: 3001,
  path: '/api/stock/AAPL?interval=5m&includePrePost=true',
  method: 'GET'
};

const startTime = Date.now();

const req = http.request(options, (res) => {
  const duration = Date.now() - startTime;
  let data = '';
  
  console.log(`⏱️  Response Time: ${duration}ms`);
  console.log(`📡 Status Code: ${res.statusCode} ${res.statusCode === 200 ? '✅' : res.statusCode === 503 ? '⚠️' : '❌'}`);
  console.log(`📋 Important Headers:`);
  if (res.headers['retry-after']) console.log(`   Retry-After: ${res.headers['retry-after']}s`);
  if (res.headers['content-type']) console.log(`   Content-Type: ${res.headers['content-type']}`);
  if (res.headers['content-length']) console.log(`   Content-Length: ${res.headers['content-length']}`);
  console.log('');
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    try {
      const json = JSON.parse(data);
      
      if (res.statusCode === 503) {
        console.log('❌ CLIENT STUCK IN 503 LOOP:\n');
        console.log(`   Error: ${json.error}`);
        console.log(`   Message: ${json.message}`);
        console.log(`   Status: ${json.status}`);
        console.log(`   Retry After: ${json.retryAfter}s`);
        console.log('\n💡 This is what client has been seeing for 2+ hours!\n');
      } else if (res.statusCode === 200 && json.chart?.result?.[0]) {
        const result = json.chart.result[0];
        const timestamps = result.timestamp || [];
        
        console.log('✅ SUCCESS - Data Returned:\n');
        console.log(`   Symbol: ${result.meta.symbol}`);
        console.log(`   Interval: ${result.meta.dataGranularity}`);
        console.log(`   Total bars: ${timestamps.length}`);
        
        if (timestamps.length > 0) {
          const latestTs = timestamps[timestamps.length - 1];
          const latestDate = new Date(latestTs * 1000);
          const ageMinutes = Math.floor((Date.now() - latestDate.getTime()) / 60000);
          
          console.log(`   Latest bar: ${latestDate.toLocaleString()}`);
          console.log(`   Data age: ${ageMinutes} minutes`);
          console.log(`   Freshness: ${ageMinutes <= 10 ? '✅ FRESH' : '⚠️ STALE'}`);
        }
      } else {
        console.log('📄 Response Body:');
        console.log(JSON.stringify(json, null, 2));
      }
    } catch (e) {
      console.error('❌ Failed to parse JSON:', e.message);
      console.log('Raw response:', data);
    }
    
    process.exit(0);
  });
});

req.on('error', (e) => {
  console.error(`❌ Request failed: ${e.message}`);
  process.exit(1);
});

req.setTimeout(5000, () => {
  console.error('❌ Request timeout (5 seconds)');
  req.destroy();
  process.exit(1);
});

req.end();
