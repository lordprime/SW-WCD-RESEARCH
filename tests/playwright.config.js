import { defineConfig, devices } from '@playwright/test';

// Common SSL-bypassing arguments for all Chromium-based projects
const CHROMIUM_SSL_ARGS = [
  '--ignore-certificate-errors',
  '--unsafely-treat-insecure-origin-as-secure=https://cdn-simulator.local',
  '--allow-running-insecure-content'
];

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

  // Global settings applied to ALL projects unless overridden
  use: {
    baseURL: 'https://cdn-simulator.local',
    actionTimeout: 10000,
    navigationTimeout: 30000,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    ignoreHTTPSErrors: true, // Crucial for self-signed certs
    serviceWorkers: 'allow',
  },

  projects: [
    // --- MAIN LOCAL TEST PROJECT (Chromium) ---
    {
      name: 'local',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: CHROMIUM_SSL_ARGS, // Applies the SSL fix
        },
      },
    },

    // --- STANDARD BROWSER ENGINES ---
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: CHROMIUM_SSL_ARGS, // Applies the SSL fix
        },
      },
    },
    {
      name: 'firefox',
      use: {
        ...devices['Desktop Firefox'],
        // Firefox usually handles ignoreHTTPSErrors: true (global) fine
      },
    },
    {
      name: 'webkit',
      use: {
        ...devices['Desktop Safari'],
        // WebKit is strict; ignoreHTTPSErrors is set globally, 
        // but it might still reject localhost SSL in some environments.
      },
    },

    // --- CLOUD SIMULATIONS (Chromium-based) ---
    {
      name: 'cloudflare',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: process.env.CF_TEST_DOMAIN ? `https://${process.env.CF_TEST_DOMAIN}` : 'https://cf-test.yourdomain.com',
        launchOptions: {
          args: CHROMIUM_SSL_ARGS, // Applies the SSL fix
        },
      },
    },
    {
      name: 'fastly',
      use: {
        ...devices['Desktop Firefox'], // Fastly project uses Firefox here
        baseURL: process.env.FASTLY_TEST_DOMAIN ? `https://${process.env.FASTLY_TEST_DOMAIN}` : 'https://fastly-test.yourdomain.com',
      },
    },
    {
      name: 'cloudfront',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: process.env.CLOUDFRONT_TEST_DOMAIN ? `https://${process.env.CLOUDFRONT_TEST_DOMAIN}` : 'https://aws-test.yourdomain.com',
        launchOptions: {
          args: CHROMIUM_SSL_ARGS, // Applies the SSL fix
        },
      },
    },
  ],

  // BACKGROUND SERVER CONFIGURATION
  webServer: {
    command: 'cd ../origin && npm run dev',
    url: 'https://localhost:3443/health',
    ignoreHTTPSErrors: true,
    reuseExistingServer: true,
    timeout: 120000,
  },
});
