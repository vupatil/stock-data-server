/**
 * Schwab OAuth Setup Script
 * Run this once to authenticate and get initial tokens
 * 
 * Usage: node schwab-auth.js
 */

require('dotenv').config();
const SchwabOAuthManager = require('./src/auth/SchwabOAuthManager');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(query) {
  return new Promise(resolve => rl.question(query, resolve));
}

async function setup() {
  console.log('\n╔═══════════════════════════════════════════════╗');
  console.log('║     🔐 SCHWAB OAUTH SETUP                     ║');
  console.log('╚═══════════════════════════════════════════════╝\n');

  // Check environment variables
  if (!process.env.SCHWAB_APP_KEY || !process.env.SCHWAB_APP_SECRET) {
    console.error('❌ Missing Schwab credentials in .env file\n');
    console.log('Please add to your .env file:');
    console.log('  SCHWAB_APP_KEY=your_app_key');
    console.log('  SCHWAB_APP_SECRET=your_app_secret');
    console.log('  SCHWAB_REDIRECT_URI=https://localhost\n');
    console.log('Get credentials at: https://developer.schwab.com/\n');
    process.exit(1);
  }

  const oauthManager = new SchwabOAuthManager({
    appKey: process.env.SCHWAB_APP_KEY,
    appSecret: process.env.SCHWAB_APP_SECRET,
    redirectUri: process.env.SCHWAB_REDIRECT_URI || 'https://localhost'
  });

  console.log('✅ Credentials found in .env\n');
  console.log('📋 OAuth Flow Steps:\n');
  console.log('1. I will give you an authorization URL');
  console.log('2. Open it in your browser and log in to Schwab');
  console.log('3. After approval, you\'ll be redirected to a URL starting with your redirect URI');
  console.log('4. Copy the FULL redirect URL and paste it back here');
  console.log('5. I will extract the code and exchange it for tokens\n');

  const authUrl = oauthManager.getAuthorizationUrl();
  
  console.log('🔗 Authorization URL:\n');
  console.log(authUrl);
  console.log('\n📝 Instructions:\n');
  console.log('1. Copy the URL above');
  console.log('2. Open it in your browser');
  console.log('3. Log in to your Schwab account');
  console.log('4. Approve the application');
  console.log('5. You will be redirected to a page (may show error - that\'s ok!)');
  console.log('6. Copy the ENTIRE URL from your browser\'s address bar\n');

  const redirectUrl = await question('Paste the full redirect URL here: ');

  // Extract authorization code from URL
  try {
    const url = new URL(redirectUrl);
    const code = url.searchParams.get('code');

    if (!code) {
      console.error('\n❌ No authorization code found in URL');
      console.log('Make sure you copied the complete URL from your browser\n');
      process.exit(1);
    }

    console.log('\n✓ Authorization code found');
    console.log('🔄 Exchanging code for tokens...\n');

    await oauthManager.exchangeCodeForTokens(code);

    console.log('\n╔═══════════════════════════════════════════════╗');
    console.log('║     ✅ SCHWAB OAUTH SETUP COMPLETE!          ║');
    console.log('╚═══════════════════════════════════════════════╝\n');
    console.log('Tokens saved to: .schwab-tokens.json\n');
    console.log('⚠️  IMPORTANT: Add .schwab-tokens.json to .gitignore!\n');
    console.log('Next steps:');
    console.log('1. Restart your server: node server.js');
    console.log('2. Restart your collector: node collector.js');
    console.log('3. Schwab will now be used as primary data source\n');
    console.log('Token will auto-refresh. Re-run this script if refresh token expires (every 7 days).\n');

  } catch (error) {
    console.error('\n❌ Setup failed:', error.message);
    console.log('\nTroubleshooting:');
    console.log('• Make sure you copied the complete redirect URL');
    console.log('• Check that SCHWAB_APP_KEY and SCHWAB_APP_SECRET are correct');
    console.log('• Verify redirect URI matches what you set in Schwab developer portal\n');
    process.exit(1);
  } finally {
    rl.close();
  }
}

setup();
