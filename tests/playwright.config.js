import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './',
  outputDir: './test-results/output',
  timeout: 60000,
  expect: {
    timeout: 10000
  },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : 4,
   reporter: [
    ['html', { outputFolder: './test-results/reports/html-report' }],
    ['json', { outputFile: './test-results/reports/test-results.json' }],
    ['line']
  ],

  
  use: {
    baseURL: 'https://cdn-simulator.local',
    actionTimeout: 10000,
    navigationTimeout: 30000,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    ignoreHTTPSErrors: true,  
    serviceWorkers: 'allow', 
  
  },

  projects: [
    {
      name: 'local',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'https://cdn-simulator.local',
        ignoreHTTPSErrors: true,
        serviceWorkers: 'allow',

        // Key change: make Chromium ignore TLS errors for SW script fetch
        launchOptions: {
          args: ['--ignore-certificate-errors'],
        },
      },
    },
    /*{
      
      name: 'local',
      use: { 
        ...devices['Desktop Chrome'],
         baseURL: 'https://cdn-simulator.local',
        ignoreHTTPSErrors: true,
        // Adding context options for Service Workers
        contextOptions: {
          serviceWorkers: 'allow',
      },
    }},*/

    {
      name: 'cloudflare',
      use: { 
        ...devices['Desktop Chrome'],
        baseURL: process.env.CF_TEST_DOMAIN ? `https://${process.env.CF_TEST_DOMAIN}`:'https://cf-test.yourdomain.com'
      },
    },
    {
      name: 'fastly', 
      use: {
        ...devices['Desktop Firefox'],
        baseURL: process.env.FASTLY_TEST_DOMAIN ? `https://${process.env.FASTLY_TEST_DOMAIN}`:'https://fastly-test.yourdomain.com'
      },
    },
    {
      name: 'cloudfront',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: process.env.CLOUDFRONT_TEST_DOMAIN ? `https://${process.env.CLOUDFRONT_TEST_DOMAIN}`:'https://aws-test.yourdomain.com'
      },
    },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],

  // BACKGROUND SERVER CONFIGURATION
  // This starts the Origin Server before tests begin 
  webServer:{
    command: 'cd ../origin && npm run dev',
    url: 'https://localhost:3443/health', // <--- Explicitly check HTTPS
    ignoreHTTPSErrors: true,       // <--- Trust your self-signed certificate
    reuseExistingServer: true,
    timeout: 120000
  },

  
});