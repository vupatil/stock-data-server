/**
 * Provider Manager
 * Manages multiple data providers with fallback logic
 */

const AlpacaProvider = require('./AlpacaProvider');
const SchwabProvider = require('./SchwabProvider');

class ProviderManager {
  constructor() {
    this.providers = [];
    this.initialized = false;
  }

  /**
   * Initialize providers based on environment configuration
   */
  async initialize() {
    if (this.initialized) return;

    const providerPriority = (process.env.PROVIDER_PRIORITY || 'schwab,alpaca')
      .split(',')
      .map(p => p.trim().toLowerCase());

    // Initialize Schwab if configured
    if (providerPriority.includes('schwab') && process.env.SCHWAB_APP_KEY) {
      const schwab = new SchwabProvider({
        appKey: process.env.SCHWAB_APP_KEY,
        appSecret: process.env.SCHWAB_APP_SECRET,
        redirectUri: process.env.SCHWAB_REDIRECT_URI,
        baseURL: process.env.SCHWAB_BASE_URL
      });

      if (await schwab.isAvailable()) {
        this.providers.push(schwab);
        console.log('✅ Schwab provider initialized');
      } else {
        console.log('⚠️  Schwab configured but not available (check tokens)');
      }
    }

    // Initialize Alpaca if configured
    if (providerPriority.includes('alpaca') && process.env.ALPACA_API_KEY) {
      const alpaca = new AlpacaProvider({
        apiKey: process.env.ALPACA_API_KEY,
        apiSecret: process.env.ALPACA_API_SECRET,
        baseURL: process.env.ALPACA_BASE_URL
      });

      if (await alpaca.isAvailable()) {
        this.providers.push(alpaca);
        console.log('✅ Alpaca provider initialized');
      }
    }

    // Sort providers based on priority
    this.providers.sort((a, b) => {
      const aIndex = providerPriority.indexOf(a.name.toLowerCase());
      const bIndex = providerPriority.indexOf(b.name.toLowerCase());
      return aIndex - bIndex;
    });

    if (this.providers.length === 0) {
      throw new Error('No data providers configured');
    }

    console.log(`📊 Active providers: ${this.providers.map(p => p.getName()).join(' → ')}`);
    this.initialized = true;
  }

  /**
   * Fetch bars with automatic fallback
   * Supports both single symbol and batch requests (comma-separated symbols)
   */
  async fetchBars(symbols, interval, startDate, endDate, includeExtended = false) {
    if (!this.initialized) {
      await this.initialize();
    }

    const errors = [];
    const isBatch = typeof symbols === 'string' && symbols.includes(',');

    for (const provider of this.providers) {
      try {
        console.log(`  🔍 Trying ${provider.getName()}...`);
        const bars = await provider.fetchBars(symbols, interval, startDate, endDate, includeExtended);
        
        // Check if we got valid data
        const hasData = isBatch 
          ? (bars && typeof bars === 'object' && Object.keys(bars).length > 0)
          : (bars && bars.length > 0);
        
        if (hasData) {
          if (isBatch) {
            const symbolCount = Object.keys(bars).length;
            console.log(`  ✓ ${provider.getName()}: ${symbolCount} symbols returned`);
          } else {
            console.log(`  ✓ ${provider.getName()}: ${bars.length} bars`);
          }
          return { bars, source: provider.getName() };
        }
        
        console.log(`  ⚠️  ${provider.getName()}: No data returned`);
      } catch (error) {
        console.log(`  ✗ ${provider.getName()}: ${error.message}`);
        errors.push({ provider: provider.getName(), error: error.message });
      }
    }

    // All providers failed
    throw new Error(`All providers failed: ${errors.map(e => `${e.provider} (${e.error})`).join(', ')}`);
  }

  /**
   * Validate symbol across providers
   */
  async validateSymbol(symbol) {
    if (!this.initialized) {
      await this.initialize();
    }

    for (const provider of this.providers) {
      try {
        const isValid = await provider.validateSymbol(symbol);
        if (isValid) {
          return { valid: true, provider: provider.getName() };
        }
      } catch (error) {
        console.log(`  ⚠️  ${provider.getName()} validation error: ${error.message}`);
      }
    }

    return { valid: false, provider: null };
  }

  /**
   * Get list of active providers
   */
  getActiveProviders() {
    return this.providers.map(p => p.getName());
  }
}

// Singleton instance
const providerManager = new ProviderManager();

module.exports = providerManager;
