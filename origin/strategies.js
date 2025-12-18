export const HEADER_STRATEGIES = {
  proper: {
    'Cache-Control': 'private, no-store, no-cache, must-revalidate, max-age=0',
    'Set-Cookie': 'session=test-session; HttpOnly; Secure; SameSite=Strict',
    'Content-Type': 'text/html; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY'
  },
  misconfigured: {
    'Cache-Control': 'public, max-age=300',
    'Content-Type': 'text/html; charset=utf-8'
  },
  missing: {
    'Content-Type': 'text/html; charset=utf-8'
  },
  conflicting: {
    'Cache-Control': 'private, no-store',
    'Surrogate-Control': 'max-age=600',
    'Content-Type': 'text/html; charset=utf-8'
  }
};

export const getStrategy = (strategyName) => {
  return HEADER_STRATEGIES[strategyName] || HEADER_STRATEGIES.proper;
};

export const validateStrategy = (strategy) => {
  const validStrategies = Object.keys(HEADER_STRATEGIES);
  if (!validStrategies.includes(strategy)) {
    throw new Error(`Invalid strategy: ${strategy}. Must be one of: ${validStrategies.join(', ')}`);
  }
  return true;
};