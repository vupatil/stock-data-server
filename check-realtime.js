/**
 * CHECK REAL-TIME DATA AVAILABILITY
 */

require('dotenv').config();
const axios = require('axios');

async function checkRealtime() {
  try {
    console.log('\n⏱️  REAL-TIME DATA CHECK\n');
    
    const apiKey = process.env.ALPACA_API_KEY;
    const apiSecret = process.env.ALPACA_API_SECRET;
    
    // Test IEX feed (free tier - 15 min delayed)
    console.log('1️⃣  Testing IEX feed (FREE tier)...\n');
    try {
      const iexResponse = await axios.get('https://data.alpaca.markets/v2/stocks/bars', {
        headers: {
          'APCA-API-KEY-ID': apiKey,
          'APCA-API-SECRET-KEY': apiSecret
        },
        params: {
          symbols: 'AAPL',
          timeframe: '1Min',
          limit: 5,
          feed: 'iex'
        }
      });
      
      if (iexResponse.data.bars?.AAPL) {
        const bars = iexResponse.data.bars.AAPL;
        console.log(`   Got ${bars.length} bars from IEX feed:`);
        
        bars.forEach((bar, i) => {
          const barTime = new Date(bar.t);
          const now = new Date();
          const delayMinutes = Math.floor((now - barTime) / 60000);
          console.log(`   ${i + 1}. ${barTime.toLocaleTimeString()} (${delayMinutes} min ago) - Close: $${bar.c}`);
        });
        
        const latestBar = bars[bars.length - 1];
        const latestTime = new Date(latestBar.t);
        const delay = Math.floor((new Date() - latestTime) / 60000);
        
        console.log(`\n   📊 Latest data: ${latestTime.toLocaleString()}`);
        console.log(`   ⏱️  Delay: ~${delay} minutes`);
        
        if (delay >= 15) {
          console.log(`   ⚠️  IEX has 15-minute delay (expected on free tier)`);
        }
      }
    } catch (error) {
      console.log(`   ❌ IEX error: ${error.response?.data?.message || error.message}`);
    }
    
    // Test SIP feed (paid tier - real-time)
    console.log('\n2️⃣  Testing SIP feed (PAID tier - real-time)...\n');
    try {
      const sipResponse = await axios.get('https://data.alpaca.markets/v2/stocks/bars', {
        headers: {
          'APCA-API-KEY-ID': apiKey,
          'APCA-API-SECRET-KEY': apiSecret
        },
        params: {
          symbols: 'AAPL',
          timeframe: '1Min',
          limit: 5,
          feed: 'sip'
        }
      });
      
      if (sipResponse.data.bars?.AAPL) {
        const bars = sipResponse.data.bars.AAPL;
        console.log(`   ✅ SIP feed AVAILABLE!`);
        console.log(`   Got ${bars.length} bars:`);
        
        bars.forEach((bar, i) => {
          const barTime = new Date(bar.t);
          const now = new Date();
          const delayMinutes = Math.floor((now - barTime) / 60000);
          console.log(`   ${i + 1}. ${barTime.toLocaleTimeString()} (${delayMinutes} min ago) - Close: $${bar.c}`);
        });
        
        const latestBar = bars[bars.length - 1];
        const latestTime = new Date(latestBar.t);
        const delay = Math.floor((new Date() - latestTime) / 60000);
        
        console.log(`\n   📊 Latest data: ${latestTime.toLocaleString()}`);
        console.log(`   ⏱️  Delay: ~${delay} minutes`);
        console.log(`   🎉 You have REAL-TIME access!`);
      }
    } catch (error) {
      if (error.response?.status === 403) {
        console.log(`   ❌ SIP feed NOT AVAILABLE`);
        console.log(`   💰 Requires paid Alpaca subscription`);
        console.log(`   🔗 Upgrade: https://alpaca.markets/data`);
        console.log(`   💵 Pricing: $9-$99/month depending on plan`);
      } else {
        console.log(`   ❌ SIP error: ${error.response?.data?.message || error.message}`);
      }
    }
    
    // Current configuration
    console.log('\n📋 YOUR CURRENT SETUP:\n');
    console.log('   Provider: Alpaca (free tier)');
    console.log('   Feed: IEX (hardcoded in AlpacaProvider.js)');
    console.log('   Data delay: ~15 minutes');
    console.log('   Extended hours: Not available on IEX');
    console.log('');
    console.log('🔧 OPTIONS TO GET REAL-TIME DATA:\n');
    console.log('   1. Upgrade Alpaca to paid plan ($9+/month)');
    console.log('      - Change feed from "iex" to "sip" in AlpacaProvider.js');
    console.log('      - Get real-time data + extended hours');
    console.log('');
    console.log('   2. Use Schwab provider (FREE!)');
    console.log('      - Already configured in your .env');
    console.log('      - Run: node schwab-auth.js');
    console.log('      - Real-time data at no cost');
    console.log('      - Change PROVIDER_PRIORITY=schwab,alpaca');
    console.log('');
    console.log('   3. Accept 15-minute delay');
    console.log('      - Keep current setup');
    console.log('      - Sufficient for daily charts');
    console.log('      - Not ideal for intraday trading');
    console.log('');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

checkRealtime();
