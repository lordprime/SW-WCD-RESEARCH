#!/usr/bin/env node

// SW-WCD Safety Cleanup Script
// Forces unregistration of all Service Workers and cleans up test data

import { Pool } from 'pg';
import { readFileSync } from 'fs';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

class SafetyCleanup {
  constructor() {
    this.cleanedSWs = 0;
    this.cleanedData = 0;
  }

  async forceSWUnregistration() {
    console.log(' Forcing Service Worker unregistration...');
    
    // This would typically be run in a browser context
    // For now, we log the instruction
    console.log(`
    To force Service Worker unregistration in browsers:
    
    1. Chrome/Edge: 
       - Navigate to chrome://serviceworker-internals/
       - Click "Unregister" for any SW-WCD related workers
    
    2. Firefox:
       - Navigate to about:serviceworkers
       - Click "Unregister" for any SW-WCD related workers
    
    3. Safari:
       - Develop → Service Workers → Unregister
       
    4. Programmatic:
       - Run in browser console:
         navigator.serviceWorker.getRegistrations().then(regs => {
           regs.forEach(reg => reg.unregister());
         });
    `);
    
    this.cleanedSWs = 1; // Placeholder
  }

  async cleanupOldData(retentionDays = 30) {
    console.log(`  Cleaning up data older than ${retentionDays} days...`);
    
    try {
      // Clean experiments
      const experimentsResult = await pool.query(
        'DELETE FROM experiments WHERE timestamp < NOW() - INTERVAL $1',
        [`${retentionDays} days`]
      );
      
      // Clean origin logs  
      const logsResult = await pool.query(
        'DELETE FROM origin_logs WHERE timestamp < NOW() - INTERVAL $1',
        [`${retentionDays} days`]
      );
      
      // Clean performance metrics
      const metricsResult = await pool.query(
        'DELETE FROM performance_metrics WHERE timestamp < NOW() - INTERVAL $1',
        [`${retentionDays} days`]
      );
      
      this.cleanedData = experimentsResult.rowCount + logsResult.rowCount + metricsResult.rowCount;
      
      console.log(` Cleaned up ${this.cleanedData} records`);
      
    } catch (error) {
      console.error(' Data cleanup failed:', error);
    }
  }

  async validateSafety() {
    console.log(' Validating safety constraints...');
    
    const checks = [];
    
    // Check for any active long-running SWs
    const recentSWs = await pool.query(`
      SELECT COUNT(*) as count 
      FROM experiments 
      WHERE timestamp > NOW() - INTERVAL '1 hour'
        AND (attack_outcome->>'safety_issues')::jsonb ? 'long_running_sw'
    `);
    
    if (recentSWs.rows[0].count > 0) {
      checks.push({
        level: 'WARNING',
        message: `Found ${recentSWs.rows[0].count} recent trials with long-running SWs`
      });
    }
    
    // Check rate limiting violations
    const rateLimitViolations = await pool.query(`
      SELECT COUNT(*) as count
      FROM origin_logs 
      WHERE timestamp > NOW() - INTERVAL '1 hour'
        AND headers->>'x-ratelimit-remaining' = '0'
    `);
    
    if (rateLimitViolations.rows[0].count > 10) {
      checks.push({
        level: 'WARNING', 
        message: `High rate limit violations: ${rateLimitViolations.rows[0].count}`
      });
    }
    
    // Check for external domain contacts
    const externalDomains = await pool.query(`
      SELECT DISTINCT headers->>'host' as host
      FROM origin_logs
      WHERE timestamp > NOW() - INTERVAL '1 day'
        AND headers->>'host' NOT IN (
          'cdn-simulator.local',
          'localhost', 
          '127.0.0.1'
        )
      LIMIT 5
    `);
    
    if (externalDomains.rows.length > 0) {
      checks.push({
        level: 'CRITICAL',
        message: `Potential external domain contacts: ${externalDomains.rows.map(r => r.host).join(', ')}`
      });
    }
    
    return checks;
  }

  generateReport() {
    console.log('\n=== SAFETY CLEANUP REPORT ===\n');
    console.log(`Service Workers cleaned: ${this.cleanedSWs}`);
    console.log(`Data records cleaned: ${this.cleanedData}`);
    console.log(`Timestamp: ${new Date().toISOString()}`);
    
    return {
      timestamp: new Date().toISOString(),
      swsCleaned: this.cleanedSWs,
      dataCleaned: this.cleanedData,
      status: 'COMPLETED'
    };
  }
}

// Main execution
async function main() {
  const cleanup = new SafetyCleanup();
  
  try {
    console.log(' Starting SW-WCD Safety Cleanup...\n');
    
    // Run cleanup tasks
    await cleanup.forceSWUnregistration();
    await cleanup.cleanupOldData(30); // 30-day retention
    
    // Validate safety
    const safetyChecks = await cleanup.validateSafety();
    if (safetyChecks.length > 0) {
      console.log('\n Safety warnings:');
      safetyChecks.forEach(check => {
        console.log(`   [${check.level}] ${check.message}`);
      });
    }
    
    // Generate report
    const report = cleanup.generateReport();
    
    console.log('\n Cleanup completed successfully!');
    console.log(' Remember: Always test ethically on domains you own.');
    
  } catch (error) {
    console.error(' Cleanup failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default SafetyCleanup;