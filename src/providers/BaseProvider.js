/**
 * Base Provider Interface
 * All market data providers must implement these methods
 */

class BaseProvider {
  constructor(config) {
    this.name = 'BaseProvider';
    this.config = config;
  }

  /**
   * Fetch historical bars for a symbol
   * @param {string} symbol - Stock symbol
   * @param {string} interval - Time interval (1m, 5m, 15m, 30m, 1h, 2h, 4h, 1d, 1w, 1mo)
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @param {boolean} includeExtended - Include extended hours
   * @returns {Promise<Array>} Array of bars with {t, o, h, l, c, v, vw, n} format
   */
  async fetchBars(symbol, interval, startDate, endDate, includeExtended = false) {
    throw new Error('fetchBars() must be implemented by provider');
  }

  /**
   * Validate if symbol exists
   * @param {string} symbol - Stock symbol
   * @returns {Promise<boolean>}
   */
  async validateSymbol(symbol) {
    throw new Error('validateSymbol() must be implemented by provider');
  }

  /**
   * Check if provider is properly configured and available
   * @returns {Promise<boolean>}
   */
  async isAvailable() {
    return false;
  }

  /**
   * Get provider name
   * @returns {string}
   */
  getName() {
    return this.name;
  }
}

module.exports = BaseProvider;
