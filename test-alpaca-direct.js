const axios = require('axios');
require('dotenv').config();

(async () => {
  console.log('\n🔍 DIRECT ALPACA API TEST\n');
  
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  
  console.log('Request parameters:');
  console.log(`  Symbols: AAPL`);
  console.log(`  Timeframe: 5Min`);
  console.log(`  Start: ${yesterday.toISOString()}`);
  console.log(`  End: ${now.toISOString()}`);
  console.log(`  Feed: iex`);
  console.log('');
  
  try {
    const response = await axios.get('https://data.alpaca.markets/v2/stocks/bars', {
      headers: {
        'APCA-API-KEY-ID': process.env.ALPACA_API_KEY,
        'APCA-API-SECRET-KEY': process.env.ALPACA_API_SECRET
      },
      params: {
        symbols: 'AAPL',
        timeframe: '5Min',
        start: yesterday.toISOString(),
        end: now.toISOString(),
        limit: 10000,
        adjustment: 'split',
        feed: 'iex'
      }
    });
    
    console.log('✅ Response received:');
    console.log(`  Status: ${response.status}`);
    
    const bars = response.data.bars?.AAPL || [];
    console.log(`  Total bars: ${bars.length}`);
    console.log('');
    
    if (bars.length > 0) {
      console.log('📊 Latest 5 bars:');
      const latest = bars.slice(-5);
      latest.forEach(bar => {
        const date = new Date(bar.t);
        console.log(`  ${date.toLocaleString()} | O:$${bar.o.toFixed(2)} H:$${bar.h.toFixed(2)} L:$${bar.l.toFixed(2)} C:$${bar.c.toFixed(2)} | V:${bar.v.toLocaleString()}`);
      });
      
      const lastBar = bars[bars.length - 1];
      const lastDate = new Date(lastBar.t);
      const ageMinutes = Math.floor((now - lastDate) / 60000);
      
      console.log('');
      console.log('⏰ Latest bar:');
      console.log(`  Time: ${lastDate.toLocaleString()}`);
      console.log(`  Age: ${ageMinutes} minutes`);
      console.log(`  Status: ${ageMinutes <= 10 ? '✅ FRESH' : '⚠️ STALE'}`);
    } else {
      console.log('❌ No bars returned!');
    }
    
    console.log('');
    console.log('📄 Full response:');
    console.log(JSON.stringify(response.data, null, 2));
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
    }
  }
})();
