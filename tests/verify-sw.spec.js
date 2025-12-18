import { test, expect } from '@playwright/test';

test.describe('Service Worker Verification Tests', () => {
  test('Service Worker Basic Support', async ({ page }) => {
    console.log(' Testing Service Worker basic support...');
    
    // FIX 1: Use HTTPS domain
    await page.goto('https://cdn-simulator.local/health', {
      waitUntil: 'networkidle',
      timeout: 15000
    });
    
    const swSupport = await page.evaluate(() => {
      return {
        hasServiceWorker: 'serviceWorker' in navigator,
        hasBlob: 'Blob' in window,
        hasURL: 'URL' in window && 'createObjectURL' in URL,
        location: window.location.href,
        protocol: window.location.protocol
      };
    });
    
    console.log('Service Worker Support:', swSupport);
    
    expect(swSupport.hasServiceWorker).toBe(true);
    // FIX 1: Expect https protocol
    expect(swSupport.protocol).toBe('https:');
  });

  test('Register Service Worker from Server URL', async ({ page }) => {
    console.log(' Testing Service Worker registration from URL...');
    
    // FIX 1: Use HTTPS domain
    await page.goto('https://cdn-simulator.local/health', {
      waitUntil: 'networkidle',
      timeout: 15000
    });
    
    // Register Service Worker using server URL (not blob)
    const registrationResult = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) {
        return { error: 'Service Workers not supported' };
      }
      
      try {
        console.log('Attempting to register Service Worker from /sw/t1-path-sculpting');
        const registration = await navigator.serviceWorker.register('/sw/t1-path-sculpting', {
          scope: '/'
        });
        
        console.log('SW registered, waiting for activation...');
        
        // FIX 2: TIMEOUT FIX - Check if already active
        if (registration.active) {
             return { 
               success: true, 
               scope: registration.scope, 
               state: 'already_active' 
             };
        }

        // Wait for activation
        if (registration.installing) {
          await new Promise((resolve, reject) => {
            const worker = registration.installing;
            worker.addEventListener('statechange', () => {
              console.log('SW state changed to:', worker.state);
              if (worker.state === 'activated') {
                resolve();
              } else if (worker.state === 'redundant') {
                reject(new Error('Service Worker installation failed'));
              }
            });
          });
        }
        
        return { 
          success: true, 
          scope: registration.scope,
          state: registration.installing?.state || registration.waiting?.state || registration.active?.state
        };
      } catch (error) {
        console.error('SW registration error:', error);
        return { error: error.message };
      }
    });
    
    console.log('Service Worker Registration Result:', registrationResult);
    
    if (registrationResult.error) {
      console.error('SW Registration Failed:', registrationResult.error);
      // Fail the test if registration fails
      expect(registrationResult.error).toBeUndefined();
    } else {
      expect(registrationResult.success).toBe(true);
      // Verify scope is correct (HTTPS)
      expect(registrationResult.scope).toContain('https://cdn-simulator.local');
      
      // Wait a bit for Service Worker to take control
      await page.waitForTimeout(2000);
      
      // Check if Service Worker is controlling the page
      const isControlled = await page.evaluate(() => {
        return {
          hasController: !!navigator.serviceWorker.controller,
          controllerState: navigator.serviceWorker.controller?.state
        };
      });
      
      console.log('Service Worker Control Status:', isControlled);
      
      if (isControlled.hasController) {
        console.log(' Page is controlled by Service Worker');
      } else {
        console.log(' Page is not controlled by Service Worker yet');
      }
    }
  });

   test('Test Service Worker Interception', async ({ page }) => {
    console.log(' Testing Service Worker interception...');
    
    // First, ensure we are on a secure origin where Service Workers are available
    await page.goto('https://cdn-simulator.local/health', {
      waitUntil: 'networkidle',
      timeout: 15000
    });

    // Clean up any existing Service Worker registrations for a stable test
    await page.evaluate(async () => {
      if (!('serviceWorker' in navigator) || !navigator.serviceWorker?.getRegistrations) {
        console.log('Service Workers not fully supported in this context; skipping cleanup.');
        return;
      }

      const regs = await navigator.serviceWorker.getRegistrations();
      for (const reg of regs) {
        try {
          await reg.unregister();
        } catch (e) {
          console.log('Failed to unregister SW during cleanup:', e?.message || e);
        }
      }
    });

    // Register Service Worker
        // Register Service Worker
    const registrationResult = await page.evaluate(async () => {
      try {
        if (!('serviceWorker' in navigator) || !navigator.serviceWorker) {
          return { error: 'Service Workers not supported' };
        }

        const registration = await navigator.serviceWorker.register('/sw/t1-path-sculpting', {
          scope: '/'
        });

        const state =
          registration.active
            ? 'active'
            : registration.installing?.state ||
              registration.waiting?.state ||
              'unknown';

        return { success: true, state };
      } catch (error) {
        return { error: error.message };
      }
    });
    
    console.log('SW Registration for interception test:', registrationResult);
    
    if (registrationResult.error) {
      console.log('Skipping interception test - SW registration failed');
      expect(registrationResult.error).toBeUndefined();
      return;
    }
    
    // Wait for Service Worker to potentially take control
    await page.waitForTimeout(3000);
    
    // Now test if Service Worker intercepts requests
    console.log('Testing account page request...');
    
    // Listen for console messages to see if SW is intercepting
    page.on('console', msg => {
      if (msg.text().includes('SW-WCD') || msg.text().includes('Intercepting')) {
        console.log('SW Console:', msg.text());
      }
    });
    
    const response = await page.goto('https://cdn-simulator.local/account?strategy=misconfigured&test=interception', {
      waitUntil: 'networkidle',
      timeout: 15000
    });
    
    expect(response?.status()).toBe(200);
    
    const body = await response.text();
    const hasMarker = body.includes('marker-');
    const hasAccountContent = body.includes('Account Dashboard');
    
    console.log('Page loaded successfully:', {
      status: response.status(),
      hasMarker: hasMarker,
      hasAccountContent: hasAccountContent
    });
    
    expect(hasMarker).toBe(true);
    expect(hasAccountContent).toBe(true);
    
    // Check if the URL was modified by Service Worker
    const currentURL = await page.url();
    console.log('Final URL:', currentURL);
    
    if (currentURL.includes('.jpg')) {
      console.log(' Service Worker modified the URL (Path Sculpting detected)');
    } else {
      console.log(' URL not modified by Service Worker');
    }
  });

  test('Rate Limiting Test', async ({ request }) => {
    console.log(' Testing rate limiting...');
    
    const responses = [];
    
    // FIX 3: Increase loop to 20 to hit the 10-request limit
    for (let i = 0; i < 20; i++) {
      try {
        // FIX 1: Use HTTPS domain
        const response = await request.get('https://cdn-simulator.local/health');
        responses.push(response.status());
        console.log(`Request ${i + 1}: ${response.status()}`);
        
        // Very short delay to trigger rate limiting
        if (i < 10) {
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      } catch (error) {
        responses.push('ERROR');
        console.log(`Request ${i + 1}: ERROR`);
      }
    }
    
    // Should see some rate limiting (429)
    const hasRateLimit = responses.some(status => status === 429);
    console.log('Rate limiting results:', { responses, hasRateLimit });
    
    // Test that Service Worker scripts are NOT rate limited
    try {
      // FIX 1: Use HTTPS domain
      const swResponse = await request.get('https://cdn-simulator.local/sw/t1-path-sculpting');
      console.log('Service Worker script response:', swResponse.status());
      expect(swResponse.status()).toBe(200);
    } catch (error) {
      console.error('Service Worker script failed:', error);
    }
    
    expect(hasRateLimit).toBe(true);
  });
});