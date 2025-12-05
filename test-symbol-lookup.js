// Test the exact flow that collectInterval uses
const mysql = require('mysql2/promise');
require('dotenv').config();

async function testSymbolLookup() {
  const db = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'stock_data_db'
  });

  console.log('\n=== TESTING SYMBOL LOOKUP LOGIC ===\n');

  // Step 1: Get active symbols (same as collectInterval)
  const [symbols] = await db.query(
    'SELECT stock_id, symbol FROM stocks WHERE is_active = TRUE ORDER BY symbol LIMIT 10'
  );
  
  console.log(`Step 1: getActiveSymbols() returns ${symbols.length} symbols`);
  symbols.forEach(s => console.log(`  ${s.stock_id}: ${s.symbol}`));

  // Step 2: Create symbolMap (same as collectInterval)
  const symbolMap = new Map(symbols.map(s => [s.symbol, s.stock_id]));
  console.log(`\nStep 2: symbolMap created with ${symbolMap.size} entries`);
  console.log(`  AAPL exists in map? ${symbolMap.has('AAPL')}`);
  console.log(`  AAPL stock_id: ${symbolMap.get('AAPL')}`);

  // Step 3: Simulate Alpaca response
  const mockAlpacaResponse = {
    bars: {
      'AAPL': [{ t: '2025-12-05T14:00:00Z', o: 100, h: 101, l: 99, c: 100.5, v: 1000 }]
    },
    source: 'Alpaca'
  };

  console.log(`\nStep 3: Simulating Alpaca response`);
  console.log(`  Response has 'bars' property? ${!!mockAlpacaResponse.bars}`);
  console.log(`  bars type: ${typeof mockAlpacaResponse.bars}`);
  console.log(`  bars keys: ${Object.keys(mockAlpacaResponse.bars).join(', ')}`);

  // Step 4: Process like collectInterval does
  console.log(`\nStep 4: Processing (same logic as collectInterval):`);
  
  let processedCount = 0;
  for (const [symbol, bars] of Object.entries(mockAlpacaResponse.bars)) {
    console.log(`  Processing symbol: ${symbol}`);
    
    const stockId = symbolMap.get(symbol);
    console.log(`    stockId from map: ${stockId}`);
    
    if (!stockId) {
      console.log(`    ❌ stockId is null/undefined, would SKIP`);
      continue;
    }
    
    if (bars && bars.length > 0) {
      console.log(`    ✅ Would store ${bars.length} bars for stockId ${stockId}`);
      processedCount++;
    } else {
      console.log(`    ⚠️ No bars to store`);
    }
  }
  
  console.log(`\n  Result: ${processedCount} symbols would be processed`);

  await db.end();
}

testSymbolLookup().catch(console.error);
