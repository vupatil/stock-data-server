# Alpaca Batch API - Request/Response Format Documentation

## Overview
This document explains how the stock-data-server calls the Alpaca API and what response formats to expect.

---

## Single Symbol Request

### Request Format
```javascript
GET https://data.alpaca.markets/v2/stocks/bars
params: {
  symbols: "AAPL",              // Single symbol, NO comma
  timeframe: "1Month",
  start: "2015-12-08T20:00:00Z",
  end: "2025-12-05T20:00:00Z",
  limit: 10000,
  feed: "iex",
  adjustment: "split"
}
```

### Response Format (CORRECT)
```json
{
  "bars": {
    "AAPL": [
      {
        "t": "2020-07-01T04:00:00Z",
        "o": 93.74,
        "h": 106.4,
        "l": 93.29,
        "c": 106.35,
        "v": 6828536,
        "n": 15595,
        "vw": 99.21862
      },
      // ... 65 more bars (66 total for 10 years monthly)
    ]
  },
  "next_page_token": null
}
```

**Key Points:**
- ✅ Single key: The symbol name ("AAPL")
- ✅ Value: Array of 66 bar objects
- ✅ `Object.keys(response.data.bars).length` = 1 (one symbol)
- ✅ `response.data.bars["AAPL"].length` = 66 (66 bars)

---

## Batch Request (Multiple Symbols)

### Request Format
```javascript
GET https://data.alpaca.markets/v2/stocks/bars
params: {
  symbols: "AAPL,MSFT,GOOGL,TSLA,NVDA",  // Multiple symbols WITH commas
  timeframe: "5Min",
  start: "2025-12-04T14:30:00Z",
  end: "2025-12-05T20:00:00Z",
  limit: 10000,
  feed: "iex",
  adjustment: "split"
}
```

### Response Format (CORRECT)
```json
{
  "bars": {
    "AAPL": [
      { "t": "2025-12-04T14:30:00Z", "o": 239.50, "h": 239.75, "l": 239.25, "c": 239.60, "v": 45120, "n": 423, "vw": 239.52 },
      { "t": "2025-12-04T14:35:00Z", "o": 239.60, "h": 239.85, "l": 239.55, "c": 239.75, "v": 38940, "n": 391, "vw": 239.71 }
      // ... more bars
    ],
    "MSFT": [
      { "t": "2025-12-04T14:30:00Z", "o": 425.10, "h": 425.45, "l": 425.00, "c": 425.30, "v": 32150, "n": 312, "vw": 425.22 },
      { "t": "2025-12-04T14:35:00Z", "o": 425.30, "h": 425.60, "l": 425.25, "c": 425.50, "v": 29840, "n": 289, "vw": 425.42 }
      // ... more bars
    ],
    "GOOGL": [
      // ... bars
    ]
    // ... more symbols (only those with data)
  },
  "next_page_token": null
}
```

**Key Points:**
- ✅ Multiple keys: One per symbol that has data
- ✅ Values: Each is an array of bars for that symbol
- ✅ `Object.keys(response.data.bars).length` = number of symbols with data (may be less than requested)
- ✅ Not all requested symbols may be present (ETFs, low-volume stocks might have no data for the timeframe)

---

## The BUG That Was Fixed

### Previous Issue
When the code saw this in the logs:
```
✓ Alpaca: 66 bars
✓ Received 66 symbols with data
⚠️ 1: Couldn't map to symbol (numeric: true, index: 1, symbol: undefined)
⚠️ 2: Couldn't map to symbol (numeric: true, index: 2, symbol: undefined)
...
⚠️ 65: Couldn't map to symbol (numeric: true, index: 65, symbol: undefined)
```

This suggested the response looked like:
```json
{
  "bars": {
    "0": [{ bar1 }],
    "1": [{ bar2 }],
    "2": [{ bar3 }],
    ...
    "65": [{ bar66 }]
  }
}
```

### Root Cause
The AlpacaProvider has logic to detect batch vs single symbol:
```javascript
const isBatch = typeof symbols === 'string' && symbols.includes(',');

if (isBatch) {
  return bars;  // Return object: { "AAPL": [...], "MSFT": [...] }
} else {
  return bars[symbols] || [];  // Return array: [bars]
}
```

**The problem:** When `isBatch = false` (single symbol), it returns `bars[symbols]` which is an **array**. But somehow the code was treating it as if it had 66 keys.

### The Fix
Added detection for array responses in `app.js`:
```javascript
// Check if response is array (single symbol) vs object (batch)
if (Array.isArray(result.bars)) {
  // Single symbol response - bars is directly an array
  console.log(`✓ Received single symbol response with ${result.bars.length} bars`);
  
  const symbol = chunkSymbols[0].symbol;
  const stockId = chunkSymbols[0].stock_id;
  
  const { inserted, updated } = await storeBars(stockId, intervalName, result.bars, result.source);
  // ... store directly
} else {
  // Batch response - bars is an object with symbol keys
  // ... loop through Object.entries(result.bars)
}
```

---

## How Our Code Handles It

### In `app.js` - `collectInterval()` function

1. **Split symbols into chunks of 100:**
   ```javascript
   const BATCH_SIZE = 100;
   const chunks = [];
   for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
     chunks.push(symbols.slice(i, i + BATCH_SIZE));
   }
   ```

2. **For each chunk, create comma-separated list:**
   ```javascript
   const symbolList = chunkSymbols.map(s => s.symbol).join(',');
   // Result: "AAPL,MSFT,GOOGL,..." (batch) or "AAPL" (single)
   ```

3. **Call ProviderManager:**
   ```javascript
   const result = await providerManager.fetchBars(symbolList, intervalName, startDate, endDate);
   ```

4. **ProviderManager calls AlpacaProvider:**
   ```javascript
   const isBatch = typeof symbols === 'string' && symbols.includes(',');
   // For "AAPL,MSFT" → isBatch = true
   // For "AAPL" → isBatch = false
   ```

5. **AlpacaProvider returns:**
   - **Batch:** `{ bars: { "AAPL": [array], "MSFT": [array] }, source: "Alpaca" }`
   - **Single:** `{ bars: [array], source: "Alpaca" }`

6. **App.js processes response:**
   ```javascript
   if (Array.isArray(result.bars)) {
     // Single symbol - bars is array of bar objects
     storeBars(stockId, intervalName, result.bars, result.source);
   } else {
     // Batch - bars is object with symbol keys
     for (const [symbol, bars] of Object.entries(result.bars)) {
       storeBars(stockId, intervalName, bars, result.source);
     }
   }
   ```

---

## Diagnostic Logging

The code now logs the raw response structure:
```
🔍 RAW RESPONSE ANALYSIS:
   result.bars type: object
   result.bars is Array: false
   Response has 7 top-level keys
   First 5 keys: [ACWI, AAL, AAPL, ABBV, ABNB]
   First key: "ACWI"
   First value is Array: true
   First value length: 1344
================================
```

This helps identify:
- ✅ Whether response is array or object
- ✅ How many keys (symbols or bars)
- ✅ What the keys are (symbol names or numeric indices)
- ✅ Structure of values (arrays of bars)

---

## Expected Behavior After Fix

### For 591 Symbols (Split into 6 Batches):
```
📦 Batch 1/6: 100 symbols
   Requesting: A,AAL,AAPL,ABBV,... (100 symbols)
   🔍 Trying Alpaca...
   ✓ Alpaca: 7 symbols returned        ← Only 7 had data
   
   🔍 RAW RESPONSE ANALYSIS:
      result.bars type: object          ← Batch format
      result.bars is Array: false
      Response has 7 top-level keys     ← 7 symbols
      First 5 keys: [AAL, AAPL, ABBV, ABNB, ABT]
   ================================
   
   ✓ Received 7 symbols with data
   ✓ AAL: 1606 new, 0 updated (Alpaca)
   ✓ AAPL: 554 new, 0 updated (Alpaca)
   ... (5 more)
   📊 Batch 1 complete: 7/100 symbols stored
```

### For Single Symbol (AAPL 1mo):
```
📦 Batch 1/1: 1 symbols
   Requesting: AAPL                     ← Single symbol
   🔍 Trying Alpaca...
   ✓ Alpaca: 66 bars                    ← 66 bars (not "66 symbols")
   
   🔍 RAW RESPONSE ANALYSIS:
      result.bars type: object          ← Could be array or object
      result.bars is Array: false       ← In this case, object
      Response has 1 top-level keys     ← 1 key: "AAPL"
      First key: "AAPL"
      First value is Array: true
      First value length: 66             ← 66 bars for that symbol
   ================================
   
   ✓ Received 1 symbols with data       ← 1 symbol
   ✓ AAPL: 66 new, 0 updated (Alpaca)
   📊 Batch 1 complete: 1/1 symbols stored
```

---

## Summary

**✅ Single Symbol Request:**
- Input: `"AAPL"` (no comma)
- AlpacaProvider detects: `isBatch = false`
- Returns: Array of bars OR Object with one key
- App.js handles: Array check first, then object processing

**✅ Batch Request:**
- Input: `"AAPL,MSFT,GOOGL"` (with commas)
- AlpacaProvider detects: `isBatch = true`
- Returns: Object with symbol keys
- App.js handles: Loop through Object.entries()

**✅ The diagnostic logging helps identify response format issues immediately**

**✅ The array check ensures single-symbol responses don't get misinterpreted**
