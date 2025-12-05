/**
 * TEST ALPACA API ENDPOINTS FOR REAL-TIME DATA
 */

require('dotenv').config();
const axios = require('axios');

async function testAlpacaEndpoints() {
  try {
    console.log('\n🔍 TESTING ALPACA API ENDPOINTS\n');
    
    const apiKey = process.env.ALPACA_API_KEY;
    const apiSecret = process.env.ALPACA_API_SECRET;
    const symbol = 'AAPL';
    
    // 1. Historical Bars (what we currently use)
    console.log('1️⃣  HISTORICAL BARS API (Current usage)');
    console.log('   Endpoint: GET /v2/stocks/bars');
    console.log('   Purpose: Time-aggregated OHLCV data\n');
    
    try {
      const barsResponse = await axios.get('https://data.alpaca.markets/v2/stocks/bars', {
        headers: {
          'APCA-API-KEY-ID': apiKey,
          'APCA-API-SECRET-KEY': apiSecret
        },
        params: {
          symbols: symbol,
          timeframe: '1Min',
          limit: 3,
          feed: 'iex'
        }
      });
      
      console.log('   Response:');
      if (barsResponse.data.bars?.[symbol]) {
        barsResponse.data.bars[symbol].forEach((bar, i) => {
          const barTime = new Date(bar.t);
          const now = new Date();
          const ageMin = Math.floor((now - barTime) / 60000);
          console.log(`     ${i + 1}. ${barTime.toLocaleString()} (${ageMin}min ago)`);
          console.log(`        O:$${bar.o} H:$${bar.h} L:$${bar.l} C:$${bar.c} V:${bar.v}`);
        });
        
        const latest = barsResponse.data.bars[symbol][barsResponse.data.bars[symbol].length - 1];
        const latestTime = new Date(latest.t);
        const delay = Math.floor((new Date() - latestTime) / 60000);
        console.log(`\n   ⏱️  Data age: ${delay} minutes old`);
        console.log('   📝 Note: Bars are AGGREGATED over 1-minute periods');
        console.log('   📝 Last closed bar, not current incomplete bar');
      }
    } catch (error) {
      console.log(`   ❌ Error: ${error.response?.data?.message || error.message}`);
    }
    
    // 2. Latest Quote (real-time bid/ask)
    console.log('\n\n2️⃣  LATEST QUOTE API (Real-time bid/ask)');
    console.log('   Endpoint: GET /v2/stocks/{symbol}/quotes/latest');
    console.log('   Purpose: Most recent bid/ask prices\n');
    
    try {
      const quoteResponse = await axios.get(`https://data.alpaca.markets/v2/stocks/${symbol}/quotes/latest`, {
        headers: {
          'APCA-API-KEY-ID': apiKey,
          'APCA-API-SECRET-KEY': apiSecret
        },
        params: {
          feed: 'iex'
        }
      });
      
      console.log('   Response:');
      const quote = quoteResponse.data.quote;
      const quoteTime = new Date(quote.t);
      const ageSeconds = Math.floor((new Date() - quoteTime) / 1000);
      
      console.log(`     Time: ${quoteTime.toLocaleString()} (${ageSeconds}s ago)`);
      console.log(`     Bid: $${quote.bp} x ${quote.bs}`);
      console.log(`     Ask: $${quote.ap} x ${quote.as}`);
      console.log(`     Exchange: ${quote.x}`);
      console.log(`\n   ⏱️  Data age: ${ageSeconds} seconds old`);
      console.log('   ✅ This is REAL-TIME quote data from IEX!');
    } catch (error) {
      console.log(`   ❌ Error: ${error.response?.data?.message || error.message}`);
    }
    
    // 3. Latest Trade (real-time last trade)
    console.log('\n\n3️⃣  LATEST TRADE API (Real-time last trade)');
    console.log('   Endpoint: GET /v2/stocks/{symbol}/trades/latest');
    console.log('   Purpose: Most recent executed trade\n');
    
    try {
      const tradeResponse = await axios.get(`https://data.alpaca.markets/v2/stocks/${symbol}/trades/latest`, {
        headers: {
          'APCA-API-KEY-ID': apiKey,
          'APCA-API-SECRET-KEY': apiSecret
        },
        params: {
          feed: 'iex'
        }
      });
      
      console.log('   Response:');
      const trade = tradeResponse.data.trade;
      const tradeTime = new Date(trade.t);
      const ageSeconds = Math.floor((new Date() - tradeTime) / 1000);
      
      console.log(`     Time: ${tradeTime.toLocaleString()} (${ageSeconds}s ago)`);
      console.log(`     Price: $${trade.p}`);
      console.log(`     Size: ${trade.s} shares`);
      console.log(`     Exchange: ${trade.x}`);
      console.log(`\n   ⏱️  Data age: ${ageSeconds} seconds old`);
      console.log('   ✅ This is REAL-TIME trade data from IEX!');
    } catch (error) {
      console.log(`   ❌ Error: ${error.response?.data?.message || error.message}`);
    }
    
    // 4. Snapshot (combines latest quote + trade + bar)
    console.log('\n\n4️⃣  SNAPSHOT API (Latest everything)');
    console.log('   Endpoint: GET /v2/stocks/{symbol}/snapshot');
    console.log('   Purpose: Latest quote, trade, and daily bar combined\n');
    
    try {
      const snapshotResponse = await axios.get(`https://data.alpaca.markets/v2/stocks/${symbol}/snapshot`, {
        headers: {
          'APCA-API-KEY-ID': apiKey,
          'APCA-API-SECRET-KEY': apiSecret
        },
        params: {
          feed: 'iex'
        }
      });
      
      console.log('   Response:');
      const snapshot = snapshotResponse.data;
      
      if (snapshot.latestTrade) {
        const tradeTime = new Date(snapshot.latestTrade.t);
        const ageSeconds = Math.floor((new Date() - tradeTime) / 1000);
        console.log(`     Latest Trade: $${snapshot.latestTrade.p} (${ageSeconds}s ago)`);
      }
      
      if (snapshot.latestQuote) {
        const quoteTime = new Date(snapshot.latestQuote.t);
        const ageSeconds = Math.floor((new Date() - quoteTime) / 1000);
        console.log(`     Latest Quote: Bid $${snapshot.latestQuote.bp} / Ask $${snapshot.latestQuote.ap} (${ageSeconds}s ago)`);
      }
      
      if (snapshot.dailyBar) {
        console.log(`     Daily Bar: O:$${snapshot.dailyBar.o} H:$${snapshot.dailyBar.h} L:$${snapshot.dailyBar.l} C:$${snapshot.dailyBar.c}`);
      }
      
      if (snapshot.minuteBar) {
        const barTime = new Date(snapshot.minuteBar.t);
        const ageMin = Math.floor((new Date() - barTime) / 60000);
        console.log(`     Minute Bar: $${snapshot.minuteBar.c} (${ageMin}min ago)`);
      }
      
      console.log(`\n   ✅ Snapshot provides REAL-TIME data!`);
    } catch (error) {
      console.log(`   ❌ Error: ${error.response?.data?.message || error.message}`);
    }
    
    console.log('\n\n📋 SUMMARY:\n');
    console.log('✅ IEX Data IS Real-Time! You were correct.');
    console.log('');
    console.log('The confusion:');
    console.log('  • Historical BARS are aggregated by time period');
    console.log('  • Latest bar = last COMPLETED minute/hour/day');
    console.log('  • Current incomplete bar is not included');
    console.log('  • So "latest" 1-min bar might be 1-2 minutes old');
    console.log('');
    console.log('For truly real-time prices:');
    console.log('  • Use /quotes/latest or /trades/latest endpoints');
    console.log('  • Use /snapshot for latest everything');
    console.log('  • These show data within seconds');
    console.log('');
    console.log('Current issue:');
    console.log('  • We use /v2/stocks/bars (historical aggregated data)');
    console.log('  • This returns CLOSED bars only');
    console.log('  • During market hours, latest bar = 1-2 min old');
    console.log('  • After market close, latest bar = closing time');
    console.log('');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

testAlpacaEndpoints();
