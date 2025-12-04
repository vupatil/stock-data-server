# Adding New Symbols

This guide explains how to add new symbols to the stock data server while maintaining proper market cap ordering.

## Prerequisites

- Symbols must be sorted by market capitalization (descending order)
- For stocks: Use actual market cap
- For ETFs: Use assets under management (AUM)

## Steps to Add New Symbols

### 1. Update .env file

Edit the `STOCK_SYMBOLS` variable in `.env`:

```env
STOCK_SYMBOLS=NVDA,AAPL,GOOGL,MSFT,AMZN,... (sorted by market cap)
```

**Important**: Insert the new symbol(s) in the correct position based on market cap/AUM ranking.

### 2. Run the populate script

```bash
node populate-symbols.js
```

This script will:
- Reset all existing market cap ranks
- Assign ranks based on the order in .env (1 = largest)
- Mark symbols not in .env as inactive
- Display the top 10 symbols for verification

### 3. Verify the ordering

```bash
node test-market-cap-order.js
```

This test checks:
- ✅ Top 10 symbols match expected order
- ✅ Market cap ranks are sequential (no gaps)
- ✅ No duplicate ranks exist
- ✅ All active symbols have a rank assigned

All tests must pass before proceeding.

### 4. Restart the collector

The collector must be restarted to begin collecting data for new symbols:

```powershell
# Stop existing collector
Get-Process -Name node | Where-Object { /* find collector process */ } | Stop-Process -Force

# Start new collector
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd path\\to\\stock-data-server; node collector.js"
```

The collector will automatically:
- Detect new symbols in the database
- Fill historical gaps for all intervals
- Start scheduled collection

## Example: Adding a New Symbol

Suppose you want to add `COIN` (Coinbase) with a market cap ranking between `PLTR` and `IWF`.

### Current .env excerpt:
```
...PLTR,IWF,IEMG...
```

### Updated .env:
```
...PLTR,COIN,IWF,IEMG...
```

### Then run:
```bash
node populate-symbols.js
node test-market-cap-order.js  # Verify
```

## Market Cap Ranking Rules

1. **Stocks**: Ranked by market capitalization
   - Market cap = Stock price × Shares outstanding
   - Source: Yahoo Finance, Bloomberg, etc.

2. **ETFs**: Ranked by assets under management (AUM)
   - AUM = Total value of assets in the fund
   - Source: ETF provider websites, etf.com, etc.

3. **Combined List**: Stocks and ETFs mixed together
   - Example: SPY (ETF) ranks between large-cap stocks
   - Based on their respective market cap/AUM values

## Automated Testing

The `test-market-cap-order.js` script provides comprehensive validation:

```javascript
// Test 1: Top 10 match
Verifies first 10 symbols match .env exactly

// Test 2: Sequential ranks
Ensures ranks go 1, 2, 3... with no gaps

// Test 3: No duplicates
Confirms each rank is unique

// Test 4: All ranked
Checks every active symbol has a rank
```

## Database Schema

The `market_cap_rank` column in the `stocks` table:
- Type: INT
- Nullable: Yes (null for inactive symbols)
- Index: Yes (for efficient ORDER BY queries)
- Meaning: Lower number = larger market cap/AUM

## API Integration

The server can filter/sort by market cap rank:

```javascript
// Get top 10 symbols by market cap
SELECT * FROM stocks 
WHERE is_active = TRUE 
ORDER BY market_cap_rank ASC 
LIMIT 10;
```

## Troubleshooting

### "Some tests failed"
- Re-run `populate-symbols.js` to fix
- Check .env for duplicate symbols
- Verify no special characters in symbol names

### "Symbols in DB but not in .env"
- These will be marked inactive automatically
- Historical data is preserved
- Can be reactivated by adding back to .env

### "New symbol not collecting data"
- Restart the collector process
- Check collector logs for errors
- Verify symbol exists in Alpaca API

## Best Practices

1. **Always test** after making changes
2. **Back up** .env before major updates
3. **Document** why symbols were added/removed
4. **Monitor** collector logs after adding symbols
5. **Verify** data appears in database within 5 minutes
