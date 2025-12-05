/**
 * CHECK COLLECTION LOGS
 */

require('dotenv').config();
const { initDB, getDB, closeDB } = require('./config/database');

async function checkLogs() {
  try {
    await initDB();
    const db = getDB();
    
    console.log('\n📊 COLLECTION LOG ANALYSIS\n');
    
    // Get all logs from last 24 hours
    const [logs] = await db.query(`
      SELECT * FROM data_collection_log 
      WHERE started_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
      ORDER BY started_at DESC
    `);
    
    console.log(`Total collections in last 24h: ${logs.length}\n`);
    
    if (logs.length === 0) {
      console.log('⚠️  NO COLLECTIONS FOUND IN LAST 24 HOURS!');
      console.log('This means the cron jobs are not running or collections are being skipped.\n');
    } else {
      // Group by job type
      const byType = {};
      logs.forEach(log => {
        const key = log.job_type + (log.interval_type ? ` (${log.interval_type})` : '');
        if (!byType[key]) byType[key] = [];
        byType[key].push(log);
      });
      
      console.log('Collections by type:');
      Object.entries(byType).forEach(([type, entries]) => {
        const success = entries.filter(e => e.status === 'success').length;
        const skipped = entries.filter(e => e.status === 'skipped').length;
        const failed = entries.filter(e => e.status === 'failed').length;
        
        console.log(`  ${type}: ${entries.length} total (✅ ${success} success, ⏸️ ${skipped} skipped, ❌ ${failed} failed)`);
      });
      
      console.log('\n📋 Last 10 collections:\n');
      logs.slice(0, 10).forEach(log => {
        const start = new Date(log.started_at);
        const end = log.completed_at ? new Date(log.completed_at) : null;
        const duration = end ? Math.round((end - start) / 1000) : 'N/A';
        
        const statusIcon = log.status === 'success' ? '✅' : 
                          log.status === 'skipped' ? '⏸️' : '❌';
        
        console.log(`${statusIcon} ${log.job_type} ${log.interval_type || ''}`);
        console.log(`   Time: ${start.toLocaleString()}`);
        console.log(`   Duration: ${duration}s`);
        console.log(`   Symbols: ${log.symbols_attempted || 0} attempted, ${log.symbols_successful || 0} successful`);
        console.log(`   Status: ${log.status}${log.error_message ? ` - ${log.error_message}` : ''}`);
        console.log('');
      });
    }
    
    // Check if there are ANY collections ever
    const [allLogs] = await db.query('SELECT COUNT(*) as count FROM data_collection_log');
    console.log(`\nTotal collections all time: ${allLogs[0].count}`);
    
    if (allLogs[0].count === 0) {
      console.log('⚠️  NO COLLECTIONS HAVE EVER RUN!');
      console.log('\nPossible reasons:');
      console.log('  1. COLLECTION_ENABLED=false in .env');
      console.log('  2. Server not running');
      console.log('  3. Cron jobs not starting');
      console.log('  4. All collections being skipped (market hours check)');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await closeDB();
  }
}

checkLogs();
