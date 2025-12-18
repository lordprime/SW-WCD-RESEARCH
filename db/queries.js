import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

export class DatabaseQueries {
  static async getSuccessRates(timeframe = '30 days') {
    const query = `
      SELECT 
        cdn_vendor,
        attack_type,
        origin_header_strategy,
        COUNT(*) as total_trials,
        SUM(CASE WHEN (attack_outcome->>'success')::boolean THEN 1 ELSE 0 END) as successes,
        ROUND(100.0 * SUM(CASE WHEN (attack_outcome->>'success')::boolean THEN 1 ELSE 0 END) / COUNT(*), 2) as success_rate
      FROM experiments
      WHERE timestamp > NOW() - INTERVAL $1
      GROUP BY cdn_vendor, attack_type, origin_header_strategy
      ORDER BY cdn_vendor, attack_type, success_rate DESC
    `;

    const result = await pool.query(query, [timeframe]);
    return result.rows;
  }

  // detailed trial data for analysis
  static async getTrialDetails(filters = {}) {
    let query = `
      SELECT 
        trial_id,
        timestamp,
        cdn_vendor,
        cdn_config,
        browser,
        attack_type,
        origin_header_strategy,
        attack_outcome,
        execution_time_ms
      FROM experiments
      WHERE 1=1
    `;
    
    const params = [];
    let paramCount = 0;

    if (filters.cdn_vendor) {
      paramCount++;
      query += ` AND cdn_vendor = $${paramCount}`;
      params.push(filters.cdn_vendor);
    }

    if (filters.attack_type) {
      paramCount++;
      query += ` AND attack_type = $${paramCount}`;
      params.push(filters.attack_type);
    }

    if (filters.strategy) {
      paramCount++;
      query += ` AND origin_header_strategy = $${paramCount}`;
      params.push(filters.strategy);
    }

    if (filters.start_date) {
      paramCount++;
      query += ` AND timestamp >= $${paramCount}`;
      params.push(filters.start_date);
    }

    if (filters.end_date) {
      paramCount++;
      query += ` AND timestamp <= $${paramCount}`;
      params.push(filters.end_date);
    }

    query += ` ORDER BY timestamp DESC LIMIT 1000`;

    const result = await pool.query(query, params);
    return result.rows;
  }

  // performance metrics
  static async getPerformanceMetrics(metricType, timeframe = '7 days') {
    const query = `
      SELECT 
        timestamp,
        value,
        metadata
      FROM performance_metrics
      WHERE metric_type = $1 
        AND timestamp > NOW() - INTERVAL $2
      ORDER BY timestamp ASC
    `;

    const result = await pool.query(query, [metricType, timeframe]);
    return result.rows;
  }

  // Clean up old data (safety feature)
  static async cleanupOldData(retentionDays = 30) {
    const query = `
      SELECT cleanup_old_data()
    `;

    const result = await pool.query(query);
    return result.rows[0].cleanup_old_data;
  }

  // Get experiment statistics
  static async getExperimentStats() {
    const query = `
      SELECT 
        COUNT(*) as total_trials,
        MIN(timestamp) as first_trial,
        MAX(timestamp) as last_trial,
        COUNT(DISTINCT cdn_vendor) as unique_cdns,
        COUNT(DISTINCT attack_type) as unique_attacks,
        COUNT(DISTINCT browser) as unique_browsers,
        ROUND(100.0 * SUM(CASE WHEN (attack_outcome->>'success')::boolean THEN 1 ELSE 0 END) / COUNT(*), 2) as overall_success_rate
      FROM experiments
    `;

    const result = await pool.query(query);
    return result.rows[0];
  }
}

export default DatabaseQueries;