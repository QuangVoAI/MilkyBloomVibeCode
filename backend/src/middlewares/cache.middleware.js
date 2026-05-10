/**
 * Cache Control Middleware
 * Sets appropriate cache headers for different types of responses
 * to improve PageSpeed cache efficiency scores
 */

// Cache durations (in seconds)
const CACHE_DURATIONS = {
  // Static assets (images, fonts, etc.) - 1 year
  STATIC: 31536000,
  // API responses that rarely change (categories, etc.) - 1 hour
  SEMI_STATIC: 3600,
  // API responses that change moderately (products list) - 5 minutes
  MODERATE: 300,
  // API responses that change frequently (cart, user data) - no cache
  DYNAMIC: 0,
  // Immutable assets (versioned files) - 1 year
  IMMUTABLE: 31536000,
};

/**
 * Image Cache Middleware
 * Add cache headers for image URLs served by the app
 */
const imageCacheMiddleware = (req, res, next) => {
  if (req.method !== 'GET') {
    return next();
  }

  const url = req.url.toLowerCase();

  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.svg'];
  const isImage = imageExtensions.some((ext) => url.includes(ext));

  if (isImage) {
    res.setHeader(
      'Cache-Control',
      `public, max-age=${CACHE_DURATIONS.STATIC}, immutable`,
    );
    res.setHeader('Vary', 'Accept-Encoding');
    res.setHeader('X-Content-Type-Options', 'nosniff');
  }

  next();
};

/**
 * Static assets cache middleware
 * For images, fonts, and other static files
 */
const staticCacheMiddleware = (req, res, next) => {
  // Only apply to GET requests
  if (req.method !== 'GET') {
    return next();
  }

  const url = req.url.toLowerCase();
  
  // Check for static file extensions
  const staticExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.svg', '.ico', '.woff', '.woff2', '.ttf', '.eot'];
  const isStatic = staticExtensions.some(ext => url.includes(ext));
  
  if (isStatic) {
    res.setHeader('Cache-Control', `public, max-age=${CACHE_DURATIONS.STATIC}, immutable`);
    res.setHeader('Vary', 'Accept-Encoding');
  }
  
  next();
};

/**
 * API cache middleware
 * DISABLE ALL CACHING - Always fetch fresh data
 */
const apiCacheMiddleware = (req, res, next) => {
  // NO CACHE FOR ALL API REQUESTS
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
};

/**
 * Compression hint middleware
 * Adds hints for CDN/proxy compression
 */
const compressionHintsMiddleware = (req, res, next) => {
  // Indicate that responses can be compressed
  res.setHeader('Vary', 'Accept-Encoding');
  next();
};

/**
 * ETag support for conditional requests
 * Reduces bandwidth for unchanged resources
 */
const etagMiddleware = (req, res, next) => {
  // Express already has built-in ETag support, just ensure it's enabled
  // This is handled by app.set('etag', 'strong') in server.js
  next();
};

module.exports = {
  staticCacheMiddleware,
  imageCacheMiddleware,
  apiCacheMiddleware,
  compressionHintsMiddleware,
  etagMiddleware,
  CACHE_DURATIONS,
};
