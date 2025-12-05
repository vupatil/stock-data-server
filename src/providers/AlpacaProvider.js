/**
 * Alpaca Market Data Provider
 */

const axios = require('axios');
const BaseProvider = require('./BaseProvider');

class AlpacaProvider extends BaseProvider {
  constructor(config) {
    super(config);
    this.name = 'Alpaca';
    this.baseURL = config.baseURL || 'https://data.alpaca.markets';
    this.apiKey = config.apiKey;
    this.apiSecret = config.apiSecret;
    
    // Rate limiting (200 requests/minute for free tier, using 100 for safety)
    this.requestTimestamps = [];
    this.maxRequestsPerMinute = 100; // Hard limit at 100 requests/minute
    this.isWaiting = false;
  }
  
  async waitForRateLimit() {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    
    // Remove timestamps older than 1 minute
    this.requestTimestamps = this.requestTimestamps.filter(ts => ts > oneMinuteAgo);
    
    // Log current rate
    if (this.requestTimestamps.length > 0 && this.requestTimestamps.length % 10 === 0) {
      console.log(`  📊 Alpaca requests: ${this.requestTimestamps.length}/${this.maxRequestsPerMinute} in last minute`);
    }
    
    // If we've hit the limit, STOP and wait for the full minute to reset
    if (this.requestTimestamps.length >= this.maxRequestsPerMinute) {
      if (!this.isWaiting) {
        this.isWaiting = true;
        const oldestRequest = this.requestTimestamps[0];
        const waitTime = 60000 - (now - oldestRequest) + 1000; // +1s buffer
        console.log(`  🛑 RATE LIMIT REACHED: ${this.requestTimestamps.length}/${this.maxRequestsPerMinute} requests`);
        console.log(`  ⏳ Waiting ${Math.ceil(waitTime / 1000)} seconds for rate limit reset...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        this.requestTimestamps = []; // Clear all timestamps after waiting
        this.isWaiting = false;
        console.log(`  ✅ Rate limit reset, resuming requests`);
      } else {
        // Another request is already waiting, so wait a bit longer
        await new Promise(resolve => setTimeout(resolve, 1000));
        return this.waitForRateLimit();
      }
    }
    
    this.requestTimestamps.push(now);
  }

  async isAvailable() {
    return !!(this.apiKey && this.apiSecret);
  }

  async fetchBars(symbols, interval, startDate, endDate, includeExtended = false) {
    if (!await this.isAvailable()) {
      throw new Error('Alpaca provider not configured');
    }

    const timeframeMap = {
      '1m': '1Min',
      '2m': '2Min',
      '5m': '5Min',
      '15m': '15Min',
      '30m': '30Min',
      '1h': '1Hour',
      '2h': '2Hour',
      '4h': '4Hour',
      '1d': '1Day',
      '1w': '1Week',
      '1mo': '1Month'
    };

    // Normalize dates to ISO string format
    const formatDate = (date) => {
      if (typeof date === 'string') return date;
      if (date instanceof Date) return date.toISOString();
      throw new Error('Invalid date format');
    };

    // Detect if this is a batch request (comma-separated symbols)
    const isBatch = typeof symbols === 'string' && symbols.includes(',');
    
    const params = {
      symbols: symbols, // Can be single symbol or comma-separated list
      timeframe: timeframeMap[interval] || '1Day',
      start: formatDate(startDate),
      end: formatDate(endDate),
      limit: 10000,
      adjustment: 'split',
      feed: 'iex'  // Always use 'iex' for free tier (SIP requires paid subscription)
    };

    // Note: SIP feed requires paid subscription and is not supported on free tier
    // Extended hours data is not available with IEX feed on free accounts

    // Wait for rate limit before making request
    await this.waitForRateLimit();

    try {
      const response = await axios.get('/v2/stocks/bars', {
        baseURL: this.baseURL,
        headers: {
          'APCA-API-KEY-ID': this.apiKey,
          'APCA-API-SECRET-KEY': this.apiSecret
        },
        params,
        timeout: 30000 // Increased timeout for batch requests
      });

      // Alpaca returns: { bars: { "AAPL": [...], "MSFT": [...] }, next_page_token: null }
      const bars = response.data.bars;
      
      if (!bars || Object.keys(bars).length === 0) {
        // Return empty array for single symbol, empty object for batch
        return isBatch ? {} : [];
      }

      // For batch requests, return the full bars object
      // For single symbol, return just the array (backward compatibility)
      if (isBatch) {
        return bars;
      } else {
        return bars[symbols] || [];
      }
    } catch (error) {
      // If rate limited, wait and retry once
      if (error.response?.status === 429) {
        console.log(`  ⏳ Rate limited, waiting 60 seconds...`);
        await new Promise(resolve => setTimeout(resolve, 60000));
        this.requestTimestamps = []; // Reset counter
        return this.fetchBars(symbols, interval, startDate, endDate, includeExtended);
      }
      throw new Error(`Alpaca API error: ${error.message}`);
    }
  }

  async validateSymbol(symbol) {
    if (!await this.isAvailable()) {
      throw new Error('Alpaca provider not configured');
    }

    // Wait for rate limit before validation
    await this.waitForRateLimit();

    try {
      // Try to fetch 1 bar to validate symbol exists
      const response = await axios.get('/v2/stocks/bars', {
        baseURL: this.baseURL,
        headers: {
          'APCA-API-KEY-ID': this.apiKey,
          'APCA-API-SECRET-KEY': this.apiSecret
        },
        params: {
          symbols: symbol,
          timeframe: '1Day',
          limit: 1,
          feed: 'iex'
        },
        timeout: 5000
      });

      return !!(response.data.bars && response.data.bars[symbol] && response.data.bars[symbol].length > 0);
    } catch (error) {
      // If rate limited during validation, wait and retry
      if (error.response?.status === 429) {
        console.log(`  ⏳ Rate limited during validation, waiting 60 seconds...`);
        await new Promise(resolve => setTimeout(resolve, 60000));
        this.requestTimestamps = []; // Reset counter
        return this.validateSymbol(symbol);
      }
      // If we get a 404 or no data, symbol is invalid
      return false;
    }
  }
}

module.exports = AlpacaProvider;
