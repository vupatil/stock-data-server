-- ========================================
-- STOCK DATA SERVER - DATABASE SCHEMA
-- ========================================

-- ========================================
-- 1. STOCKS TABLE
-- ========================================
CREATE TABLE IF NOT EXISTS stocks (
  stock_id INT PRIMARY KEY AUTO_INCREMENT,
  symbol VARCHAR(20) NOT NULL UNIQUE,
  company_name VARCHAR(255),
  exchange VARCHAR(50),
  sector VARCHAR(100),
  industry VARCHAR(100),
  is_active BOOLEAN DEFAULT TRUE,
  requested_at TIMESTAMP NULL DEFAULT NULL,  -- When symbol was first requested via API
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_symbol (symbol),
  INDEX idx_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========================================
-- 2. CANDLES TABLE (All Timeframes)
-- ========================================
CREATE TABLE IF NOT EXISTS candles (
  candle_id BIGINT PRIMARY KEY AUTO_INCREMENT,
  stock_id INT NOT NULL,
  interval_type VARCHAR(10) NOT NULL,  -- '1m','2m','5m','15m','30m','1h','2h','4h','1d','1w','1mo'
  ts INT NOT NULL,                     -- Unix timestamp (seconds)
  open DECIMAL(12, 4) NOT NULL,
  high DECIMAL(12, 4) NOT NULL,
  low DECIMAL(12, 4) NOT NULL,
  close DECIMAL(12, 4) NOT NULL,
  volume BIGINT NOT NULL,
  vwap DECIMAL(12, 4),                -- Volume-weighted average price
  trade_count INT,                    -- Number of trades
  data_source VARCHAR(50) DEFAULT 'alpaca',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE KEY unique_candle (stock_id, interval_type, ts),
  INDEX idx_stock_interval_ts (stock_id, interval_type, ts),
  INDEX idx_interval_ts (interval_type, ts),
  INDEX idx_ts (ts),
  INDEX idx_lookup (stock_id, interval_type, ts DESC),
  
  FOREIGN KEY (stock_id) REFERENCES stocks(stock_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ========================================
-- 3. DATA COLLECTION LOG
-- ========================================
CREATE TABLE IF NOT EXISTS data_collection_log (
  log_id BIGINT PRIMARY KEY AUTO_INCREMENT,
  job_type VARCHAR(50),               -- 'collect_1m', 'collect_5m', 'cleanup'
  interval_type VARCHAR(10),
  symbols_requested INT,
  symbols_processed INT,
  records_inserted INT,
  records_updated INT,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  duration_ms INT,
  status VARCHAR(20),                 -- 'running', 'completed', 'failed'
  error_message TEXT,
  
  INDEX idx_status (status),
  INDEX idx_started (started_at),
  INDEX idx_job_type (job_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
