/**
 * Centralized Batch Processing Utility
 * Handles splitting large symbol arrays into Alpaca-safe batches
 * 
 * Usage:
 * const { processBatchedSymbols, ALPACA_BATCH_SIZE } = require('./src/utils/batchProcessor');
 * 
 * await processBatchedSymbols(
 *   symbols,
 *   async (batch, batchIndex) => {
 *     // Process this batch
 *     return result;
 *   },
 *   {
 *     delayBetweenBatches: 500,
 *     onBatchComplete: (result, index) => console.log(`Batch ${index} done`)
 *   }
 * );
 */

const ALPACA_BATCH_SIZE = parseInt(process.env.ALPACA_BATCH_SIZE) || 50;

/**
 * Process symbols in batches with automatic splitting
 * @param {Array<string>} symbols - Array of stock symbols
 * @param {Function} processBatch - Async function that processes one batch: (batch, batchIndex) => Promise<any>
 * @param {Object} options - Configuration options
 * @param {number} options.batchSize - Override default batch size
 * @param {number} options.delayBetweenBatches - Milliseconds to wait between batches (default: 500)
 * @param {Function} options.onBatchComplete - Callback after each batch: (result, batchIndex) => void
 * @param {boolean} options.stopOnError - Stop processing if a batch fails (default: false)
 * @param {boolean} options.silent - Suppress progress logging (default: false)
 * @returns {Promise<Object>} - Results summary with statistics
 */
async function processBatchedSymbols(symbols, processBatch, options = {}) {
  const batchSize = options.batchSize || ALPACA_BATCH_SIZE;
  const delayMs = options.delayBetweenBatches !== undefined ? options.delayBetweenBatches : 500;
  const silent = options.silent || false;
  
  if (!Array.isArray(symbols) || symbols.length === 0) {
    return {
      totalBatches: 0,
      successfulBatches: 0,
      failedBatches: 0,
      processedSymbols: 0,
      errors: []
    };
  }
  
  // Split into batches
  const batches = [];
  for (let i = 0; i < symbols.length; i += batchSize) {
    batches.push(symbols.slice(i, i + batchSize));
  }
  
  if (!silent) {
    console.log(`  📦 Split ${symbols.length} symbols into ${batches.length} batches (${batchSize} per batch)`);
  }
  
  const results = {
    totalBatches: batches.length,
    successfulBatches: 0,
    failedBatches: 0,
    processedSymbols: 0,
    errors: [],
    batchResults: []
  };
  
  // Process each batch sequentially
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    
    if (!silent) {
      console.log(`\n  📦 [${i + 1}/${batches.length}] Processing batch: ${batch.length} symbols`);
    }
    
    try {
      const batchResult = await processBatch(batch, i);
      results.successfulBatches++;
      results.processedSymbols += batch.length;
      results.batchResults.push(batchResult);
      
      // Callback after successful batch
      if (options.onBatchComplete) {
        options.onBatchComplete(batchResult, i);
      }
      
    } catch (error) {
      results.failedBatches++;
      results.errors.push({ 
        batchIndex: i, 
        symbols: batch,
        error: error.message 
      });
      
      if (!silent) {
        console.error(`  ❌ Batch ${i + 1} failed: ${error.message}`);
      }
      
      if (options.stopOnError) {
        throw error;
      }
    }
    
    // Delay between batches to avoid rate limits
    if (i < batches.length - 1 && delayMs > 0) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  if (!silent) {
    console.log(`\n  ✅ Batch processing complete: ${results.successfulBatches}/${results.totalBatches} successful`);
    if (results.failedBatches > 0) {
      console.log(`  ⚠️  ${results.failedBatches} batches failed`);
    }
  }
  
  return results;
}

/**
 * Split symbols into batches without processing
 * Useful when you need the batches array directly
 * @param {Array<string>} symbols - Array of stock symbols
 * @param {number} batchSize - Override default batch size
 * @returns {Array<Array<string>>} - Array of symbol batches
 */
function splitIntoBatches(symbols, batchSize = ALPACA_BATCH_SIZE) {
  const batches = [];
  for (let i = 0; i < symbols.length; i += batchSize) {
    batches.push(symbols.slice(i, i + batchSize));
  }
  return batches;
}

module.exports = {
  ALPACA_BATCH_SIZE,
  processBatchedSymbols,
  splitIntoBatches
};
