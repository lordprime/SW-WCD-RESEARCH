import rateLimit from 'express-rate-limit';

// Default limiter used by the origin server for research scenarios.
// We keep this limit low (5 req / 60s per IP) so the Playwright tests
// will reliably see some 429s, while still being realistic.
export const createRateLimiter = (windowMs = 60 * 1000, max = 5) => {
  return rateLimit({
    windowMs,
    max,
    // IMPORTANT: Do NOT rate limit Service Worker script endpoints,
    // otherwise the SW verification tests will see 429s for /sw/*.
    skip: (req) => req.path.startsWith('/sw/'),
    message: {
      error: 'Too many requests',
      message: 'Rate limit exceeded. Please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      console.log(`[RateLimit] Blocked request from ${req.ip} on ${req.path}`);
      res.status(429).json({
        error: 'Rate limit exceeded',
        retryAfter: Math.ceil(windowMs / 1000)
      });
    }
  });
};

// Stricter variant for specific sensitive routes if needed.
export const strictLimiter = createRateLimiter(60 * 1000, 5);
export default strictLimiter;