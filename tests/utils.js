// Utility functions for testing
import { Pool } from 'pg';
import dotenv from 'dotenv';
import path from 'path';

try {
  const envPath = path.resolve(process.cwd(), '../.env');
  dotenv.config({ path: envPath });
} catch (e) {
  console.warn(' Could not load .env file in utils.js', e);
}


const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

export class TestUtils {
  static generateTrialId() {
    return `trial-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  static generateMarker() {
    return `marker-${Date.now()}-${crypto.randomUUID?.() || Math.random().toString(36).substr(2, 16)}`;
  }

  // FIXED: Header case sensitivity normalization
  static normalizeHeaders(rawHeaders) {
    const normalized = {};
    if (!rawHeaders || typeof rawHeaders !== 'object') {
      return normalized;
    }
    
    Object.keys(rawHeaders).forEach(key => {
      normalized[key.toLowerCase()] = rawHeaders[key];
    });
    
    return normalized;
  }

  static parseCDNCacheStatus(rawHeaders, cdn) {
    if (!rawHeaders || typeof rawHeaders !== 'object') {
      return { status: 'INVALID_HEADERS', raw: null, error: 'Headers not provided' };
    }

    const headers = this.normalizeHeaders(rawHeaders);

    try {
      switch (cdn) {
        case 'cloudflare':
          const cfStatus = headers['cf-cache-status'];
          return {
            status: cfStatus || 'MISSING_HEADER',
            raw: cfStatus,
            hit: cfStatus === 'HIT',
            miss: cfStatus === 'MISS',
            dynamic: cfStatus === 'DYNAMIC'
          };

        case 'fastly':
          const xCache = headers['x-cache'];
          return {
            status: xCache || 'MISSING_HEADER',
            raw: xCache,
            hit: xCache?.includes('HIT') || false,
            miss: xCache?.includes('MISS') || false,
            unknown: !xCache
          };

        case 'cloudfront':
          const cfCache = headers['x-cache'];
          return {
            status: cfCache || 'MISSING_HEADER',
            raw: cfCache,
            hit: cfCache?.includes('Hit') || false,
            miss: cfCache?.includes('Miss') || false,
            error: cfCache?.includes('Error') || false
          };

        case 'local':
          const localStatus = headers['x-cache-status'];
          return {
            status: localStatus || 'MISSING_HEADER',
            raw: localStatus,
            hit: localStatus === 'HIT',
            miss: localStatus === 'MISS',
            bypass: localStatus === 'BYPASS'
          };

        default:
          return { 
            status: 'UNSUPPORTED_CDN', 
            raw: null, 
            error: `Unsupported CDN: ${cdn}` 
          };
      }
    } catch (error) {
      return { 
        status: 'PARSE_ERROR', 
        raw: null, 
        error: error.message 
      };
    }
  }

  // FIXED: Enhanced marker extraction with multiple fallbacks
  static async extractMarkerFromBody(page, body) {
    if (!body || typeof body !== 'string') {
      return null;
    }

    try {
      // Method 1: Try Playwright DOM extraction (most reliable)
      if (page) {
        try {
          const marker = await page.locator('#marker').textContent().catch(() => null);
          if (marker) return marker;
          
          const metaMarker = await page.locator('meta[name="test-marker"]').getAttribute('content').catch(() => null);
          if (metaMarker) return metaMarker;
        } catch (e) {
          // Fall through to regex methods
        }
      }

      // Method 2: HTML regex patterns
      const patterns = [
        /<meta name="test-marker" content="([^"]+)"/,
        /<code id="marker">([^<]+)<\/code>/,
        /"marker":\s*"([^"]+)"/,
        /window\.trialMarker\s*=\s*'([^']+)'/,
        /id="marker"[^>]*>([^<]+)</,
        /data-marker="([^"]+)"/
      ];

      for (const pattern of patterns) {
        const match = body.match(pattern);
        if (match && match[1]) {
          return match[1];
        }
      }

      return null;
    } catch (error) {
      console.error('Error extracting marker:', error);
      return null;
    }
  }

  static async logTrialToDB(trialData) {
    const {
      trial_id,
      timestamp,
      cdn_vendor,
      cdn_config,
      browser,
      browser_version,
      attack_type,
      origin_header_strategy,
      victim_request,
      sw_modified_request,
      cdn_response,
      attacker_request,
      attack_outcome,
      execution_time_ms,
      notes
    } = trialData;

    try {
      const result = await pool.query(
        `INSERT INTO experiments (
          trial_id, timestamp, cdn_vendor, cdn_config, browser, browser_version,
          attack_type, origin_header_strategy, victim_request, sw_modified_request,
          cdn_response, attacker_request, attack_outcome, execution_time_ms, notes
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        RETURNING trial_id`,
        [
          trial_id, timestamp, cdn_vendor, cdn_config, browser, browser_version,
          attack_type, origin_header_strategy, victim_request, sw_modified_request,
          cdn_response, attacker_request, attack_outcome, execution_time_ms, notes
        ]
      );

      return result.rows[0].trial_id;
    } catch (error) {
      console.error('Failed to log trial to database:', error);
      throw error;
    }
  }

  static validateSafetyConstraints(testConfig) {
    const warnings = [];

    // Check rate limiting
    if (testConfig.safety.maxRequestsPerSecond > 5) {
      warnings.push('High request rate detected. Consider reducing maxRequestsPerSecond for safety.');
    }

    // Check SW lifetime
    if (testConfig.safety.swAutoUnregisterMinutes > 10) {
      warnings.push('Long SW lifetime detected. Consider reducing for safety.');
    }

    // Check trial delay
    if (testConfig.safety.trialDelayMs < 1000) {
      warnings.push('Short trial delay may cause race conditions.');
    }

    return warnings;
  }

  static async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  static createAuthCookie(domain, userId = 'test-user') {
    return {
      name: 'session',
      value: `session-${userId}-${Date.now()}`,
      domain: domain,
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'Lax'
    };
  }
}

export function validateResponseSafety(response) {
  const safetyIssues = [];

  // Check for sensitive headers in cached responses
  const sensitiveHeaders = ['set-cookie', 'authorization', 'proxy-authorization'];
  sensitiveHeaders.forEach(header => {
    if (response.headers()[header]) {
      safetyIssues.push(`Sensitive header ${header} found in cached response`);
    }
  });

  // Check for private cache directives in public responses
  const cacheControl = response.headers()['cache-control'];
  if (cacheControl && cacheControl.includes('private') && response.headers()['age']) {
    safetyIssues.push('Private content found in cached response');
  }

  return safetyIssues;
}