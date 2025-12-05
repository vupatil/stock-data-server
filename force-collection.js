// Force immediate 5m collection for AAPL
const { initDB } = require('./config/database');
const providerManager = require('./src/providers/ProviderManager');

(async () => {
  await initDB();
  await providerManager.initialize();
  
  console.log('\n🚀 FORCING 5M COLLECTION NOW\n');
  
  // Make POST request to trigger collection
  const http = require('http');
  
  const postData = JSON.stringify({ interval: '5m' });
  
  const options = {
    hostname: 'localhost',
    port: 3001,
    path: '/collect/AAPL',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    }
  };
  
  const req = http.request(options, (res) => {
    let data = '';
    
    console.log(`Status: ${res.statusCode}`);
    
    res.on('data', (chunk) => {
      data += chunk;
    });
    
    res.on('end', () => {
      console.log('\nResponse:');
      console.log(JSON.parse(data));
      
      // Wait 5 seconds then check database
      setTimeout(async () => {
        const { getDB } = require('./config/database');
        const db = getDB();
        
        const [result] = await db.query(`
          SELECT ts FROM candles 
          WHERE stock_id = (SELECT stock_id FROM stocks WHERE symbol = 'AAPL')
          AND interval_type = '5m'
          ORDER BY ts DESC LIMIT 1
        `);
        
        if (result.length > 0) {
          const date = new Date(result[0].ts * 1000);
          const age = Math.floor((Date.now() / 1000 - result[0].ts) / 60);
          
          console.log('\n📊 Database After Collection:');
          console.log(`  Latest bar: ${date.toLocaleString()}`);
          console.log(`  Age: ${age} minutes`);
          console.log(`  Status: ${age <= 10 ? '✅ FRESH!' : '⚠️ STALE'}`);
        }
        
        process.exit(0);
      }, 5000);
    });
  });
  
  req.on('error', (e) => {
    console.error(`Error: ${e.message}`);
    process.exit(1);
  });
  
  req.write(postData);
  req.end();
})();
