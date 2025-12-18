-- SW-WCD Research Database Schema

-- Experiments table (main results)
CREATE TABLE IF NOT EXISTS experiments (
    trial_id VARCHAR(100) PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    cdn_vendor VARCHAR(50) NOT NULL CHECK (cdn_vendor IN ('cloudflare', 'fastly', 'cloudfront', 'local')),
    cdn_config VARCHAR(100) NOT NULL,
    browser VARCHAR(50) NOT NULL CHECK (browser IN ('chromium', 'firefox', 'webkit')),
    browser_version VARCHAR(20),
    attack_type VARCHAR(100) NOT NULL CHECK (attack_type IN ('t1-path-sculpting', 't2-header-manipulation', 't4-scope-misconfig')),
    origin_header_strategy VARCHAR(50) NOT NULL CHECK (origin_header_strategy IN ('proper', 'misconfigured', 'missing', 'conflicting')),
    
    -- Request/response data
    victim_request JSONB NOT NULL,
    sw_modified_request JSONB NOT NULL,
    cdn_response JSONB NOT NULL,
    attacker_request JSONB NOT NULL,
    
    -- Attack outcome
    attack_outcome JSONB NOT NULL,
    
    -- Performance metrics
    execution_time_ms INTEGER NOT NULL,
    
    -- Additional metadata
    notes TEXT,
    
    -- Indexes for common queries
    CONSTRAINT valid_attack_outcome CHECK (
        attack_outcome ? 'success' AND 
        attack_outcome ? 'cache_hit' AND 
        attack_outcome ? 'victim_data_retrieved'
    )
);

-- Origin logs for auditing
CREATE TABLE IF NOT EXISTS origin_logs (
    log_id SERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    path VARCHAR(255) NOT NULL,
    strategy VARCHAR(50),
    marker VARCHAR(100),
    user_id VARCHAR(100),
    response_status INTEGER,
    query_params JSONB,
    headers JSONB,
    ip_address INET
);

-- Performance metrics
CREATE TABLE IF NOT EXISTS performance_metrics (
    metric_id SERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metric_type VARCHAR(50) NOT NULL,
    cdn_vendor VARCHAR(50),
    attack_type VARCHAR(100),
    value DOUBLE PRECISION NOT NULL,
    metadata JSONB
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_experiments_timestamp ON experiments(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_experiments_cdn_vendor ON experiments(cdn_vendor);
CREATE INDEX IF NOT EXISTS idx_experiments_attack_type ON experiments(attack_type);
CREATE INDEX IF NOT EXISTS idx_experiments_strategy ON experiments(origin_header_strategy);
CREATE INDEX IF NOT EXISTS idx_experiments_success ON experiments((attack_outcome->>'success'));
CREATE INDEX IF NOT EXISTS idx_experiments_cdn_attack ON experiments(cdn_vendor, attack_type);

CREATE INDEX IF NOT EXISTS idx_origin_logs_timestamp ON origin_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_origin_logs_path ON origin_logs(path);
CREATE INDEX IF NOT EXISTS idx_origin_logs_marker ON origin_logs(marker);

CREATE INDEX IF NOT EXISTS idx_performance_timestamp ON performance_metrics(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_performance_type ON performance_metrics(metric_type);

-- Views for common queries
CREATE OR REPLACE VIEW attack_success_rates AS
SELECT 
    cdn_vendor,
    cdn_config,
    browser,
    attack_type,
    origin_header_strategy,
    COUNT(*) as total_trials,
    SUM(CASE WHEN (attack_outcome->>'success')::boolean THEN 1 ELSE 0 END) as successes,
    ROUND(100.0 * SUM(CASE WHEN (attack_outcome->>'success')::boolean THEN 1 ELSE 0 END) / COUNT(*), 2) as success_rate_pct,
    AVG(execution_time_ms) as avg_execution_time_ms,
    MIN(timestamp) as first_trial,
    MAX(timestamp) as last_trial
FROM experiments
GROUP BY cdn_vendor, cdn_config, browser, attack_type, origin_header_strategy;

CREATE OR REPLACE VIEW cdn_comparison AS
SELECT 
    cdn_vendor,
    COUNT(*) as total_trials,
    ROUND(100.0 * SUM(CASE WHEN (attack_outcome->>'success')::boolean THEN 1 ELSE 0 END) / COUNT(*), 2) as overall_success_rate,
    ROUND(100.0 * SUM(CASE WHEN (attack_outcome->>'cache_hit')::boolean THEN 1 ELSE 0 END) / COUNT(*), 2) as cache_hit_rate,
    ROUND(AVG(execution_time_ms), 2) as avg_execution_time_ms
FROM experiments
GROUP BY cdn_vendor
ORDER BY overall_success_rate DESC;

-- Auto-cleanup function (safety feature)
CREATE OR REPLACE FUNCTION cleanup_old_data()
RETURNS void AS $$
BEGIN
    -- Delete experiments older than 30 days
    DELETE FROM experiments 
    WHERE timestamp < NOW() - INTERVAL '30 days';
    
    -- Delete origin logs older than 30 days  
    DELETE FROM origin_logs
    WHERE timestamp < NOW() - INTERVAL '30 days';
    
    -- Delete performance metrics older than 30 days
    DELETE FROM performance_metrics
    WHERE timestamp < NOW() - INTERVAL '30 days';
    
    RAISE NOTICE 'Cleaned up data older than 30 days';
END;
$$ LANGUAGE plpgsql;

-- Create cleanup schedule (run daily)
-- Note: In production, you'd set up a cron job or pg_cron

-- Insert some initial metrics for testing
INSERT INTO performance_metrics (metric_type, value, metadata) VALUES
('database_initialized', 1, '{"version": "1.0.0", "timestamp": "2024-01-01T00:00:00Z"}');

-- Grant permissions (adjust as needed)
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO swwcd;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO swwcd;

-- Create cleanup trigger (optional)
-- This would be set up as a scheduled job in production

COMMENT ON TABLE experiments IS 'SW-WCD research experiment results';
COMMENT ON TABLE origin_logs IS 'Origin server request logs for auditing';
COMMENT ON TABLE performance_metrics IS 'System performance and monitoring metrics';