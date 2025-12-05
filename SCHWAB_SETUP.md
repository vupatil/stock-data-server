# Multi-Provider Setup Guide

Your stock-data-server now supports **multiple data providers** with automatic fallback:
- **Schwab** (primary - free real-time data for account holders)
- **Alpaca** (fallback - free paper trading data)

## Quick Start (Alpaca Only)

If you only want to use Alpaca (existing setup):

```bash
# Your current setup still works - no changes needed!
node server.js
```

## Setup Schwab (Recommended for Better Data)

### Step 1: Create Schwab Developer Account

1. Go to https://developer.schwab.com/
2. Click "Register" and create an account
3. Verify your email

### Step 2: Create an App

1. Log in to Schwab Developer Portal
2. Click "Apps" → "Create a New App"
3. Fill in app details:
   - **App Name**: Stock Data Server
   - **Redirect URI**: `https://localhost`
   - **Description**: Personal stock data caching server
4. Click "Create App"
5. Copy your **App Key** and **App Secret**

### Step 3: Configure Environment

Edit your `.env` file:

```env
# Add these Schwab credentials
SCHWAB_APP_KEY=your_app_key_from_step_2
SCHWAB_APP_SECRET=your_app_secret_from_step_2
SCHWAB_REDIRECT_URI=https://localhost

# Set provider priority (Schwab first, Alpaca fallback)
PROVIDER_PRIORITY=schwab,alpaca
```

### Step 4: Authenticate with Schwab

Run the OAuth setup script:

```powershell
node schwab-auth.js
```

This will:
1. Generate an authorization URL
2. Open it in your browser (or copy/paste)
3. You'll log in to your Schwab account
4. Approve the app
5. Copy the redirect URL back to the script
6. Script exchanges the code for tokens and saves them

**Output:**
```
✅ Schwab tokens saved to .schwab-tokens.json
```

### Step 5: Secure Your Tokens

Add to `.gitignore`:

```
.schwab-tokens.json
```

### Step 6: Restart Your Services

```powershell
# Terminal 1 - Server
node server.js

# Terminal 2 - Collector (if using)
node collector.js
```

You should see:

```
✅ Schwab provider initialized
✅ Alpaca provider initialized
📊 Active providers: Schwab → Alpaca
```

## How It Works

1. **API Request** comes in for VYM 1m data
2. **Check MySQL** cache first
3. If not in cache:
   - Try **Schwab API** first
   - If Schwab fails, try **Alpaca API**
   - If Alpaca fails, return error
4. **Cache the result** in MySQL
5. Return data to client

## Provider Priority

Configure in `.env`:

```env
# Schwab first, Alpaca fallback (recommended)
PROVIDER_PRIORITY=schwab,alpaca

# Alpaca only (if you don't have Schwab setup)
PROVIDER_PRIORITY=alpaca

# Alpaca first, Schwab fallback (not recommended)
PROVIDER_PRIORITY=alpaca,schwab
```

## Token Maintenance

**Schwab tokens expire:**
- **Access token**: 30 minutes (auto-refreshes)
- **Refresh token**: 7 days

The system automatically refreshes access tokens. If refresh token expires, re-run:

```powershell
node schwab-auth.js
```

## Troubleshooting

### "Schwab configured but not available"

Tokens missing or expired. Run:

```powershell
node schwab-auth.js
```

### "No authorization code found in URL"

Make sure you copied the **complete URL** from your browser after approval, including the `?code=...` part.

### "Failed to refresh Schwab token"

Refresh token expired (7 days). Re-authenticate:

```powershell
node schwab-auth.js
```

### Schwab OAuth errors

- Check `SCHWAB_APP_KEY` and `SCHWAB_APP_SECRET` are correct
- Verify `SCHWAB_REDIRECT_URI` matches what you set in Schwab developer portal
- Make sure you're using a Schwab brokerage account (not just developer account)

## Benefits of Schwab

- ✅ Real-time data (if you have Schwab account)
- ✅ More reliable during market hours
- ✅ Better data quality
- ✅ Free for Schwab customers
- ✅ Automatic fallback to Alpaca if Schwab fails

## Testing

Test both providers:

```bash
# Check which providers are active
curl http://localhost:3001/health

# Request data (will try Schwab first, then Alpaca)
curl "http://localhost:3001/api/stock/AAPL?interval=1d"
```

Check server logs to see which provider was used:

```
🔍 Trying Schwab...
✓ Schwab: 390 bars
```

or

```
🔍 Trying Schwab...
✗ Schwab: Token expired
🔍 Trying Alpaca...
✓ Alpaca: 390 bars
```

## Summary

You now have:
- ✅ Multi-provider support
- ✅ Automatic fallback (Schwab → Alpaca)
- ✅ OAuth token management
- ✅ Backward compatible (Alpaca-only still works)
- ✅ Configurable provider priority

Just restart your server and it will use Schwab if configured, otherwise fall back to Alpaca!
