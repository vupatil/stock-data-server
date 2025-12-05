/**
 * TEST API RESPONSE - Simulate client request
 */

const axios = require('axios');

async function testAPI() {
  try {
    console.log('\n📊 TESTING API ENDPOINT\n');
    
    const symbol = 'AAPL';
    const url = `http://localhost:3001/api/stock/${symbol}?interval=1d`;
    
    console.log(`Request: ${url}\n`);
    
    const response = await axios.get(url);
    
    if (response.status === 200) {
      console.log('✅ SUCCESS!\n');
      
      const data = response.data;
      const result = data.chart.result[0];
      const barCount = result.timestamp.length;
      const latestClose = result.indicators.quote[0].close[barCount - 1];
      const latestTimestamp = result.timestamp[barCount - 1];
      const latestDate = new Date(latestTimestamp * 1000);
      
      console.log(`Symbol: ${result.meta.symbol}`);
      console.log(`Company: ${result.meta.companyName}`);
      console.log(`Total bars: ${barCount}`);
      console.log(`Latest date: ${latestDate.toISOString()}`);
      console.log(`Latest close: $${latestClose}`);
      console.log(`\n✅ Client would receive data successfully!`);
    }
    
  } catch (error) {
    if (error.response) {
      console.log(`❌ ERROR ${error.response.status}\n`);
      console.log(JSON.stringify(error.response.data, null, 2));
      
      if (error.response.status === 202) {
        console.log(`\n⚠️  Server is still processing. Wait ${error.response.data.retryAfter}s and try again.`);
      }
    } else if (error.code === 'ECONNREFUSED') {
      console.log('❌ Server is not running!');
      console.log('\nStart the server first: node app.js');
    } else {
      console.log('❌ Error:', error.message);
    }
  }
}

testAPI();
