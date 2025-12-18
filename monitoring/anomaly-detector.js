// Anomaly detection for safety monitoring
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

export class AnomalyDetector {
  constructor() {
    this.anomalies = [];
    this.lastCheck = Date.now();
  }

  async checkForAnomalies() {
    const currentTime = Date.now();
    const timeWindow = 5 * 60 * 1000; 
    
    console.log(' Checking for security anomalies...');
    
    const anomalies = [];
    
    // Checking for high request rates (potential DoS)
    const highRate = await this.checkRequestRate();
    if (highRate) anomalies.push(highRate);
    
    // Checking for external domain contacts
    const externalContacts = await this.checkExternalDomains();
    if (externalContacts) anomalies.push(externalContacts);
    
    // Checking for successful attacks with proper headers (unexpected)
    const unexpectedSuccess = await this.checkUnexpectedSuccesses();
    if (unexpectedSuccess) anomalies.push(unexpectedSuccess);
    
    // Checking for long-running Service Workers
    const longRunningSWs = await this.checkLongRunningSWs();
    if (longRunningSWs) anomalies.push(longRunningSWs);
    
    this.anomalies = [...this.anomalies, ...anomalies];
    this.lastCheck = currentTime;
    
    if (anomalies.length > 0) {
      console.warn(' Security anomalies detected:', anomalies);
      await this.alertOnAnomalies(anomalies);
    }
    
    return anomalies;
  }

  async checkRequestRate() {
    // Checking if request rate exceeds safety limits
    const query = `
      SELECT COUNT(*) as request_count
      FROM origin_logs
      WHERE timestamp > NOW() - INTERVAL '1 minute'
    `;
    
    const result = await pool.query(query);
    const requestCount = parseInt(result.rows[0].request_count);
    
    const maxRequestsPerMinute = 60; // Safety limit
    
    if (requestCount > maxRequestsPerMinute) {
      return {
        type: 'HIGH_REQUEST_RATE',
        severity: 'HIGH',
        message: `High request rate detected: ${requestCount} requests in last minute`,
        details: { requestCount, limit: maxRequestsPerMinute }
      };
    }
    
    return null;
  }

  async checkExternalDomains() {
    // Checking for requests to external domains
    const query = `
      SELECT DISTINCT headers->>'host' as host, COUNT(*) as count
      FROM origin_logs
      WHERE timestamp > NOW() - INTERVAL '5 minutes'
        AND headers->>'host' NOT IN (
          'cdn-simulator.local',
          'localhost',
          '127.0.0.1',
          'cf-test.yourdomain.com',
          'fastly-test.yourdomain.com', 
          'aws-test.yourdomain.com'
        )
      GROUP BY headers->>'host'
      HAVING COUNT(*) > 1
    `;
    
    const result = await pool.query(query);
    
    if (result.rows.length > 0) {
      return {
        type: 'EXTERNAL_DOMAIN_CONTACT',
        severity: 'CRITICAL',
        message: 'Requests to external domains detected',
        details: {
          domains: result.rows.map(row => ({
            host: row.host,
            requests: row.count
          }))
        }
      };
    }
    
    return null;
  }

  async checkUnexpectedSuccesses() {
    // Check for successful attacks with proper security headers (shouldn't happen)
    const query = `
      SELECT COUNT(*) as count
      FROM experiments
      WHERE timestamp > NOW() - INTERVAL '1 hour'
        AND origin_header_strategy = 'proper'
        AND (attack_outcome->>'success')::boolean = true
    `;
    
    const result = await pool.query(query);
    const unexpectedSuccesses = parseInt(result.rows[0].count);
    
    if (unexpectedSuccesses > 0) {
      return {
        type: 'UNEXPECTED_SUCCESS',
        severity: 'MEDIUM',
        message: `Unexpected successful attacks with proper security headers: ${unexpectedSuccesses}`,
        details: { count: unexpectedSuccesses }
      };
    }
    
    return null;
  }

  async checkLongRunningSWs() {
    // Check for Service Workers that have been active too long
    const query = `
      SELECT COUNT(*) as count
      FROM experiments
      WHERE timestamp > NOW() - INTERVAL '10 minutes'
        AND (attack_outcome->>'safety_issues')::jsonb ? 'long_running_sw'
    `;
    
    const result = await pool.query(query);
    const longRunningSWs = parseInt(result.rows[0].count);
    
    if (longRunningSWs > 0) {
      return {
        type: 'LONG_RUNNING_SERVICE_WORKERS',
        severity: 'MEDIUM',
        message: `Long-running Service Workers detected: ${longRunningSWs}`,
        details: { count: longRunningSWs }
      };
    }
    
    return null;
  }

  async alertOnAnomalies(anomalies) {
    // In a production system, this would send alerts via email, Slack, etc.
    // For now, we just log them
    
    console.error(' SECURITY ANOMALIES DETECTED:');
    anomalies.forEach(anomaly => {
      console.error(`   [${anomaly.severity}] ${anomaly.type}: ${anomaly.message}`);
    });
    
    // Log to database for auditing
    for (const anomaly of anomalies) {
      await pool.query(
        'INSERT INTO performance_metrics (metric_type, value, metadata) VALUES ($1, $2, $3)',
        ['security_anomaly', 1, JSON.stringify(anomaly)]
      );
    }
  }

  getAnomalySummary() {
    const summary = {
      total: this.anomalies.length,
      bySeverity: {
        CRITICAL: this.anomalies.filter(a => a.severity === 'CRITICAL').length,
        HIGH: this.anomalies.filter(a => a.severity === 'HIGH').length,
        MEDIUM: this.anomalies.filter(a => a.severity === 'MEDIUM').length,
        LOW: this.anomalies.filter(a => a.severity === 'LOW').length
      },
      byType: {}
    };
    
    this.anomalies.forEach(anomaly => {
      summary.byType[anomaly.type] = (summary.byType[anomaly.type] || 0) + 1;
    });
    
    return summary;
  }
}

// Start periodic anomaly detection
export function startAnomalyMonitoring(intervalMs = 300000) { // 5 minutes
  const detector = new AnomalyDetector();
  
  setInterval(async () => {
    try {
      await detector.checkForAnomalies();
    } catch (error) {
      console.error('Anomaly detection failed:', error);
    }
  }, intervalMs);
  
  return detector;
}

export default AnomalyDetector;