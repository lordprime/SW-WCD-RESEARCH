// Test configuration matrix
export const TEST_CONFIG = {
  cdns: {
    cloudflare: {
      testDomain: process.env.CF_TEST_DOMAIN || 'cf-test.yourdomain.com',
      cacheHeaders: ['cf-cache-status', 'age', 'cf-ray'],
      configs: ['default', 'loose'],
      cacheArmor: process.env.CLOUDFLARE_CACHE_ARMOR === 'true'
    },
    fastly: {
      testDomain: process.env.FASTLY_TEST_DOMAIN || 'fastly-test.yourdomain.com', 
      cacheHeaders: ['x-cache', 'age', 'x-served-by'],
      configs: ['default', 'aggressive'],
      surrogateControl: process.env.FASTLY_SURROGATE_CONTROL === 'true'
    },
    cloudfront: {
      testDomain: process.env.CLOUDFRONT_TEST_DOMAIN || 'aws-test.yourdomain.com',
      cacheHeaders: ['x-cache', 'age', 'x-amz-cf-id'],
      configs: ['default', 'permissive'],
      cachePolicy: process.env.CLOUDFRONT_CACHE_POLICY || 'CachingOptimized'
    },
    local: {
      testDomain: 'cdn-simulator.local',
      cacheHeaders: ['x-cache-status', 'x-cdn-simulator'],
      configs: ['default']
    }
  },

  browsers: ['chromium', 'firefox', 'webkit'],

  attacks: {
    't1-path-sculpting': {
      name: 'Path Sculpting',
      targetPath: '/account',
      modifiedPath: '/account/sw-wcd-cache.jpg',
      swPath: '/sw/t1-path-sculpting',
      techniques: ['url-rewriting', 'content-type-spoofing']
    },
    't2-header-manipulation': {
      name: 'Header Manipulation', 
      targetPath: '/api/reflect',
      modifiedPath: '/api/reflect',
      swPath: '/sw/t2-header-manipulation',
      techniques: ['header-injection', 'surrogate-control']
    },
    't4-scope-misconfig': {
      name: 'Scope Misconfiguration',
      targetPath: '/user/alice/profile',
      modifiedPath: '/static/user-profile-cache',
      swPath: '/sw/t4-scope-misconfig', 
      techniques: ['path-normalization', 'shared-cache-keys']
    }
  },

  originStrategies: ['proper', 'misconfigured', 'missing', 'conflicting'],

  safety: {
    maxRequestsPerSecond: parseInt(process.env.MAX_REQUESTS_PER_SECOND) || 1,
    swAutoUnregisterMinutes: parseInt(process.env.SW_AUTO_UNREGISTER_MINUTES) || 5,
    trialDelayMs: 3000, // Wait for CDN cache propagation
    requestTimeoutMs: 30000
  }
};

export function getCDNConfig(cdn) {
  return TEST_CONFIG.cdns[cdn] || TEST_CONFIG.cdns.local;
}

export function getAttackConfig(attack) {
  return TEST_CONFIG.attacks[attack];
}

export function validateTestParams({ cdn, browser, attack, strategy }) {
  const errors = [];
  
  if (!TEST_CONFIG.cdns[cdn]) {
    errors.push(`Invalid CDN: ${cdn}. Must be one of: ${Object.keys(TEST_CONFIG.cdns).join(', ')}`);
  }
  
  if (!TEST_CONFIG.browsers.includes(browser)) {
    errors.push(`Invalid browser: ${browser}. Must be one of: ${TEST_CONFIG.browsers.join(', ')}`);
  }
  
  if (!TEST_CONFIG.attacks[attack]) {
    errors.push(`Invalid attack: ${attack}. Must be one of: ${Object.keys(TEST_CONFIG.attacks).join(', ')}`);
  }
  
  if (!TEST_CONFIG.originStrategies.includes(strategy)) {
    errors.push(`Invalid strategy: ${strategy}. Must be one of: ${TEST_CONFIG.originStrategies.join(', ')}`);
  }
  
  if (errors.length > 0) {
    throw new Error(`Test parameter validation failed:\n${errors.join('\n')}`);
  }
  
  return true;
}