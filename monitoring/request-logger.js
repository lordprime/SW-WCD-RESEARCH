// Request logging and monitoring
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

export class RequestLogger {
  constructor() {
    this.requestCount = 0;
    this.errorCount = 0;
    this.startTime = Date.now();
  }

  logRequest(req, res, responseTime, success = true) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.path,
      query: req.query,
      statusCode: res.statusCode,
      responseTime,
      success,
      userAgent: req.headers['user-agent'],
      ip: req.ip,
      user: req.user?.id || 'anonymous'
    };

    this.requestCount++;
    if (!success) this.errorCount++;

    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.log('[REQUEST]', JSON.stringify(logEntry));
    }

    // Log to database
    this.logToDatabase(logEntry).catch(err => {
      console.error('Failed to log request to database:', err);
    });

    return logEntry;
  }

  async logToDatabase(logEntry) {
    const query = `
      INSERT INTO origin_logs (
        path, query_params, headers, ip_address, user_id, response_status
      ) VALUES ($1, $2, $3, $4, $5, $6)
    `;

    await pool.query(query, [
      logEntry.path,
      JSON.stringify(logEntry.query),
      JSON.stringify({
        'user-agent': logEntry.userAgent,
        'x-forwarded-for': logEntry.ip
      }),
      logEntry.ip,
      logEntry.user,
      logEntry.statusCode
    ]);
  }

  getStats() {
    const uptime = Date.now() - this.startTime;
    const requestsPerMinute = (this.requestCount / (uptime / 60000)).toFixed(2);
    const errorRate = ((this.errorCount / this.requestCount) * 100).toFixed(2);

    return {
      totalRequests: this.requestCount,
      totalErrors: this.errorCount,
      errorRate: `${errorRate}%`,
      requestsPerMinute,
      uptime: `${Math.floor(uptime / 60000)} minutes`
    };
  }

  async getRecentRequests(limit = 50) {
    const query = `
      SELECT * FROM origin_logs 
      ORDER BY timestamp DESC 
      LIMIT $1
    `;

    const result = await pool.query(query, [limit]);
    return result.rows;
  }
}

export default RequestLogger;