import { Pool } from 'pg';
import { readFileSync } from 'fs';
import { createObjectCsvWriter } from 'csv-writer';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

export class StatisticalEngine {
  constructor() {
    this.results = [];
  }

  async loadExperimentData() {
    const query = `
      SELECT 
        trial_id,
        cdn_vendor,
        cdn_config, 
        browser,
        attack_type,
        origin_header_strategy,
        attack_outcome->>'success' as success,
        attack_outcome->>'cache_hit' as cache_hit,
        attack_outcome->>'victim_data_retrieved' as data_retrieved,
        execution_time_ms
      FROM experiments
      WHERE timestamp > NOW() - INTERVAL '30 days'
      ORDER BY timestamp DESC
    `;

    const result = await pool.query(query);
    this.results = result.rows;
    return this.results;
  }

  calculateSuccessRates() {
    const rates = {};
    
    // Group by CDN × Attack × Strategy
    this.results.forEach(trial => {
      const key = `${trial.cdn_vendor}-${trial.attack_type}-${trial.origin_header_strategy}`;
      
      if (!rates[key]) {
        rates[key] = {
          cdn: trial.cdn_vendor,
          attack: trial.attack_type,
          strategy: trial.origin_header_strategy,
          total: 0,
          successes: 0,
          cacheHits: 0,
          dataRetrievals: 0,
          executionTimes: []
        };
      }
      
      rates[key].total++;
      if (trial.success === 'true') rates[key].successes++;
      if (trial.cache_hit === 'true') rates[key].cacheHits++;
      if (trial.data_retrieved === 'true') rates[key].dataRetrievals++;
      rates[key].executionTimes.push(parseInt(trial.execution_time_ms));
    });
    
    Object.keys(rates).forEach(key => {
      const rate = rates[key];
      rate.successRate = (rate.successes / rate.total) * 100;
      rate.cacheHitRate = (rate.cacheHits / rate.total) * 100;
      rate.dataRetrievalRate = (rate.dataRetrievals / rate.total) * 100;
      rate.avgExecutionTime = rate.executionTimes.reduce((a, b) => a + b, 0) / rate.executionTimes.length;
    });
    
    return rates;
  }

  performChiSquareTest(contingencyTable) {
    // Simple chi-square implementation for independence testing
    const rows = Object.keys(contingencyTable).length;
    const cols = Object.keys(contingencyTable[Object.keys(contingencyTable)[0]]).length;
    
    let total = 0;
    const rowTotals = {};
    const colTotals = {};
    
    // Calculating totals
    Object.entries(contingencyTable).forEach(([row, cols]) => {
      rowTotals[row] = 0;
      Object.values(cols).forEach(val => {
        rowTotals[row] += val;
        total += val;
      });
    });
    
    Object.keys(contingencyTable[Object.keys(contingencyTable)[0]]).forEach(col => {
      colTotals[col] = 0;
      Object.values(contingencyTable).forEach(row => {
        colTotals[col] += row[col];
      });
    });
    
    // Calculating chi-square statistic
    let chiSquare = 0;
    Object.entries(contingencyTable).forEach(([row, cols]) => {
      Object.entries(cols).forEach(([col, observed]) => {
        const expected = (rowTotals[row] * colTotals[col]) / total;
        chiSquare += Math.pow(observed - expected, 2) / expected;
      });
    });
    
    const df = (rows - 1) * (cols - 1);
    
    return {
      chiSquare,
      degreesOfFreedom: df,
      pValue: this.calculatePValue(chiSquare, df)
    };
  }

  calculatePValue(chiSquare, df) {
    // Simplified p-value calculation using chi-square distribution
    // In production, use a proper statistics library
    if (chiSquare > 10.828 && df === 1) return 0.001;
    if (chiSquare > 6.635 && df === 1) return 0.01;
    if (chiSquare > 3.841 && df === 1) return 0.05;
    if (chiSquare > 2.706 && df === 1) return 0.10;
    return 0.20; // Conservative estimate
  }

  generateReport() {
    const successRates = this.calculateSuccessRates();
    
    console.log('\n=== SW-WCD RESEARCH REPORT ===\n');
    console.log('Total Trials:', this.results.length);
    console.log('Date Range: Last 30 days\n');
    
    // Success rates by CDN and attack type
    console.log('SUCCESS RATES BY CDN AND ATTACK TYPE:');
    console.log('=====================================');
    
    const cdns = [...new Set(this.results.map(r => r.cdn_vendor))];
    cdns.forEach(cdn => {
      console.log(`\n${cdn.toUpperCase()}:`);
      const attacks = [...new Set(this.results.filter(r => r.cdn_vendor === cdn).map(r => r.attack_type))];
      
      attacks.forEach(attack => {
        const relevant = this.results.filter(r => 
          r.cdn_vendor === cdn && r.attack_type === attack
        );
        const successes = relevant.filter(r => r.success === 'true').length;
        const rate = (successes / relevant.length) * 100;
        
        console.log(`  ${attack}: ${rate.toFixed(1)}% (${successes}/${relevant.length})`);
      });
    });
    
    console.log('\nSTATISTICAL SIGNIFICANCE:');
    console.log('========================');
    
    // Test independence of CDN vendor and attack success
    const contingencyTable = {};
    cdns.forEach(cdn => {
      contingencyTable[cdn] = { success: 0, failure: 0 };
      const cdnTrials = this.results.filter(r => r.cdn_vendor === cdn);
      contingencyTable[cdn].success = cdnTrials.filter(r => r.success === 'true').length;
      contingencyTable[cdn].failure = cdnTrials.filter(r => r.success !== 'true').length;
    });
    
    const chiSquareResult = this.performChiSquareTest(contingencyTable);
    console.log(`CDN vs Success: χ²=${chiSquareResult.chiSquare.toFixed(3)}, df=${chiSquareResult.degreesOfFreedom}, p=${chiSquareResult.pValue}`);
    
    if (chiSquareResult.pValue < 0.05) {
      console.log('→ Statistically significant relationship detected');
    } else {
      console.log('→ No statistically significant relationship');
    }
    
    // Effect sizes
    console.log('\nEFFECT SIZES:');
    console.log('=============');
    
    const overallSuccessRate = this.results.filter(r => r.success === 'true').length / this.results.length;
    console.log(`Overall success rate: ${(overallSuccessRate * 100).toFixed(1)}%`);
    
    // Most vulnerable configuration
    const configs = Object.entries(successRates)
      .filter(([_, rate]) => rate.total >= 10) // Minimum trials
      .sort((a, b) => b[1].successRate - a[1].successRate);
    
    if (configs.length > 0) {
      const mostVulnerable = configs[0][1];
      console.log(`Most vulnerable: ${mostVulnerable.cdn}-${mostVulnerable.attack}-${mostVulnerable.strategy} (${mostVulnerable.successRate.toFixed(1)}%)`);
    }
    
    return {
      summary: {
        totalTrials: this.results.length,
        overallSuccessRate: overallSuccessRate * 100,
        dateRange: '30 days'
      },
      successRates,
      statisticalTests: {
        cdnVsSuccess: chiSquareResult
      },
      recommendations: this.generateRecommendations(successRates)
    };
  }

  generateRecommendations(successRates) {
    const recommendations = [];
    
    // High success rate configurations need mitigation
    Object.entries(successRates)
      .filter(([_, rate]) => rate.successRate > 50 && rate.total >= 5)
      .forEach(([config, rate]) => {
        recommendations.push({
          config,
          successRate: rate.successRate,
          mitigation: this.suggestMitigation(rate.cdn, rate.attack, rate.strategy)
        });
      });
    
    return recommendations;
  }

  suggestMitigation(cdn, attack, strategy) {
    const mitigations = [];
    
    if (attack === 't1-path-sculpting') {
      mitigations.push('Enable Cache Deception Armor on CDN');
      mitigations.push('Validate Content-Type matches file extension at origin');
      mitigations.push('Use proper Cache-Control: private, no-store headers');
    }
    
    if (attack === 't2-header-manipulation') {
      mitigations.push('Sanitize request headers at origin');
      mitigations.push('Avoid header reflection vulnerabilities');
      mitigations.push('Use strict Cache-Control headers');
    }
    
    if (attack === 't4-scope-misconfig') {
      mitigations.push('Restrict Service Worker scope using Service-Worker-Allowed header');
      mitigations.push('Use user-specific cache keys');
      mitigations.push('Avoid path normalization that creates cache collisions');
    }
    
    if (strategy === 'misconfigured') {
      mitigations.push('Always set Cache-Control: private, no-store for authenticated content');
    }
    
    return mitigations;
  }

  async exportToCSV() {
    const successRates = this.calculateSuccessRates();
    
    const csvWriter = createObjectCsvWriter({
      path: './analysis/success-rates.csv',
      header: [
        { id: 'config', title: 'Configuration' },
        { id: 'cdn', title: 'CDN' },
        { id: 'attack', title: 'Attack' },
        { id: 'strategy', title: 'Strategy' },
        { id: 'total', title: 'Total Trials' },
        { id: 'successRate', title: 'Success Rate %' },
        { id: 'cacheHitRate', title: 'Cache Hit Rate %' },
        { id: 'dataRetrievalRate', title: 'Data Retrieval Rate %' },
        { id: 'avgExecutionTime', title: 'Avg Execution Time (ms)' }
      ]
    });
    
    const records = Object.entries(successRates).map(([key, rate]) => ({
      config: key,
      cdn: rate.cdn,
      attack: rate.attack,
      strategy: rate.strategy,
      total: rate.total,
      successRate: rate.successRate.toFixed(2),
      cacheHitRate: rate.cacheHitRate.toFixed(2),
      dataRetrievalRate: rate.dataRetrievalRate.toFixed(2),
      avgExecutionTime: rate.avgExecutionTime.toFixed(0)
    }));
    
    await csvWriter.writeRecords(records);
    console.log('Exported success rates to analysis/success-rates.csv');
  }
}

// Main execution
async function main() {
  const engine = new StatisticalEngine();
  
  try {
    console.log('Loading experiment data...');
    await engine.loadExperimentData();
    
    console.log('Generating statistical report...');
    const report = engine.generateReport();
    
    console.log('Exporting to CSV...');
    await engine.exportToCSV();
    
    console.log('\n=== ANALYSIS COMPLETE ===');
    
  } catch (error) {
    console.error('Analysis failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default StatisticalEngine;