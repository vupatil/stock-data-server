/**
 * Schwab Market Data Provider
 * Requires OAuth 2.0 authentication
 */

const axios = require('axios');
const BaseProvider = require('./BaseProvider');
const SchwabOAuthManager = require('../auth/SchwabOAuthManager');

class SchwabProvider extends BaseProvider {
  constructor(config) {
    super(config);
    this.name = 'Schwab';
    this.baseURL = config.baseURL || 'https://api.schwabapi.com/marketdata/v1';
    this.appKey = config.appKey;
    this.appSecret = config.appSecret;
    this.oauthManager = new SchwabOAuthManager(config);
  }

  async isAvailable() {
    if (!this.appKey || !this.appSecret) {
      return false;
    }
    // Check if we have valid tokens
    try {
      await this.oauthManager.getAccessToken();
      return true;
    } catch (error) {
      return false;
    }
  }

  async fetchBars(symbol, interval, startDate, endDate, includeExtended = false) {
    if (!await this.isAvailable()) {
      throw new Error('Schwab provider not configured or tokens expired');
    }

    // Map intervals to Schwab's periodType and frequencyType
    const intervalConfig = this._getIntervalConfig(interval);
    
    const params = {
      symbol: symbol,
      periodType: intervalConfig.periodType,
      frequencyType: intervalConfig.frequencyType,
      frequency: intervalConfig.frequency,
      startDate: Math.floor(startDate.getTime()),
      endDate: Math.floor(endDate.getTime()),
      needExtendedHoursData: includeExtended
    };

    try {
      const accessToken = await this.oauthManager.getAccessToken();
      
      const response = await axios.get(`${this.baseURL}/pricehistory`, {
        params,
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        },
        timeout: 10000
      });

      if (!response.data.candles || response.data.candles.length === 0) {
        return [];
      }

      // Convert Schwab format to our standard format
      return response.data.candles.map(candle => ({
        t: new Date(candle.datetime).toISOString(),
        o: candle.open,
        h: candle.high,
        l: candle.low,
        c: candle.close,
        v: candle.volume,
        vw: null, // Schwab doesn't provide VWAP
        n: null   // Schwab doesn't provide trade count
      }));
    } catch (error) {
      if (error.response?.status === 401) {
        // Token expired, try to refresh
        try {
          await this.oauthManager.refreshAccessToken();
          return await this.fetchBars(symbol, interval, startDate, endDate, includeExtended);
        } catch (refreshError) {
          throw new Error('Schwab authentication failed');
        }
      }
      throw new Error(`Schwab API error: ${error.message}`);
    }
  }

  async validateSymbol(symbol) {
    if (!await this.isAvailable()) {
      throw new Error('Schwab provider not configured');
    }

    try {
      const accessToken = await this.oauthManager.getAccessToken();
      
      const response = await axios.get(`${this.baseURL}/quotes`, {
        params: { symbols: symbol },
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        },
        timeout: 5000
      });

      return !!(response.data && Object.keys(response.data).length > 0);
    } catch (error) {
      return false;
    }
  }

  _getIntervalConfig(interval) {
    const configs = {
      '1m': { periodType: 'day', frequencyType: 'minute', frequency: 1 },
      '2m': { periodType: 'day', frequencyType: 'minute', frequency: 2 },
      '5m': { periodType: 'day', frequencyType: 'minute', frequency: 5 },
      '15m': { periodType: 'day', frequencyType: 'minute', frequency: 15 },
      '30m': { periodType: 'day', frequencyType: 'minute', frequency: 30 },
      '1h': { periodType: 'month', frequencyType: 'minute', frequency: 60 },
      '2h': { periodType: 'month', frequencyType: 'minute', frequency: 120 },
      '4h': { periodType: 'month', frequencyType: 'minute', frequency: 240 },
      '1d': { periodType: 'year', frequencyType: 'daily', frequency: 1 },
      '1w': { periodType: 'year', frequencyType: 'weekly', frequency: 1 },
      '1mo': { periodType: 'year', frequencyType: 'monthly', frequency: 1 }
    };

    return configs[interval] || configs['1d'];
  }
}

module.exports = SchwabProvider;
