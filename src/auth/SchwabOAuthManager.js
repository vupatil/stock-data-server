/**
 * Schwab OAuth 2.0 Manager
 * Handles token storage, refresh, and authentication
 */

const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

class SchwabOAuthManager {
  constructor(config) {
    this.appKey = config.appKey;
    this.appSecret = config.appSecret;
    this.redirectUri = config.redirectUri || 'https://localhost';
    this.tokenFile = path.join(__dirname, '../../.schwab-tokens.json');
    this.authURL = 'https://api.schwabapi.com/v1/oauth';
    this.tokens = null;
  }

  /**
   * Load tokens from file
   */
  async loadTokens() {
    try {
      const data = await fs.readFile(this.tokenFile, 'utf8');
      this.tokens = JSON.parse(data);
      return this.tokens;
    } catch (error) {
      return null;
    }
  }

  /**
   * Save tokens to file
   */
  async saveTokens(tokens) {
    this.tokens = {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: Date.now() + (tokens.expires_in * 1000),
      refresh_expires_at: tokens.refresh_token_expires_in 
        ? Date.now() + (tokens.refresh_token_expires_in * 1000)
        : Date.now() + (7 * 24 * 60 * 60 * 1000) // Default 7 days
    };
    
    await fs.writeFile(this.tokenFile, JSON.stringify(this.tokens, null, 2));
  }

  /**
   * Get valid access token (refresh if needed)
   */
  async getAccessToken() {
    if (!this.tokens) {
      await this.loadTokens();
    }

    if (!this.tokens) {
      throw new Error('No Schwab tokens found. Run schwab-auth.js first.');
    }

    // Check if access token is expired (with 5 min buffer)
    if (Date.now() >= (this.tokens.expires_at - 300000)) {
      await this.refreshAccessToken();
    }

    return this.tokens.access_token;
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken() {
    if (!this.tokens || !this.tokens.refresh_token) {
      throw new Error('No refresh token available');
    }

    // Check if refresh token is expired
    if (Date.now() >= this.tokens.refresh_expires_at) {
      throw new Error('Refresh token expired. Re-authenticate via schwab-auth.js');
    }

    try {
      const params = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: this.tokens.refresh_token
      });

      const response = await axios.post(`${this.authURL}/token`, params, {
        headers: {
          'Authorization': `Basic ${Buffer.from(`${this.appKey}:${this.appSecret}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      await this.saveTokens(response.data);
      console.log('✅ Schwab access token refreshed');
      
      return this.tokens.access_token;
    } catch (error) {
      throw new Error(`Failed to refresh Schwab token: ${error.message}`);
    }
  }

  /**
   * Exchange authorization code for tokens (initial setup)
   */
  async exchangeCodeForTokens(authorizationCode) {
    try {
      const params = new URLSearchParams({
        grant_type: 'authorization_code',
        code: authorizationCode,
        redirect_uri: this.redirectUri
      });

      const response = await axios.post(`${this.authURL}/token`, params, {
        headers: {
          'Authorization': `Basic ${Buffer.from(`${this.appKey}:${this.appSecret}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      await this.saveTokens(response.data);
      console.log('✅ Schwab tokens saved successfully');
      
      return this.tokens;
    } catch (error) {
      throw new Error(`Failed to exchange code for tokens: ${error.message}`);
    }
  }

  /**
   * Get authorization URL for initial OAuth flow
   */
  getAuthorizationUrl() {
    const params = new URLSearchParams({
      client_id: this.appKey,
      redirect_uri: this.redirectUri,
      response_type: 'code'
    });

    return `${this.authURL}/authorize?${params.toString()}`;
  }
}

module.exports = SchwabOAuthManager;
