const rateLimit = require('express-rate-limit');

/**
 * Rate Limiting Middleware
 * Protects against brute force attacks and API abuse
 */

// Helper to create custom error response
const createLimitHandler = (message) => (req, res) => {
    res.status(429).json({
        success: false,
        message: message,
        retryAfter: res.getHeader('Retry-After'),
    });
};

// ============================================
// AUTH RATE LIMITERS (Strict)
// ============================================

/**
 * Login rate limiter - moderate (per-user OTP handles brute force)
 * 15 attempts per 15 minutes per IP
 * This prevents credential stuffing across multiple accounts
 */
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 15, // Allow more attempts since per-user OTP kicks in at 5
    message: 'Too many login attempts from this IP. Please try again after 15 minutes.',
    handler: createLimitHandler('Too many login attempts from this IP. Please try again after 15 minutes.'),
    standardHeaders: true,
    legacyHeaders: false,
});

/**
 * Registration rate limiter
 * 3 registrations per hour per IP
 */
const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3,
    message: 'Too many accounts created. Please try again after an hour.',
    handler: createLimitHandler('Too many accounts created. Please try again after an hour.'),
    standardHeaders: true,
    legacyHeaders: false,
});

/**
 * Password reset rate limiter
 * 3 requests per 15 minutes per IP
 */
const passwordResetLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 3,
    message: 'Too many password reset requests. Please try again after 15 minutes.',
    handler: createLimitHandler('Too many password reset requests. Please try again after 15 minutes.'),
    standardHeaders: true,
    legacyHeaders: false,
});

/**
 * OTP verification rate limiter
 * 5 attempts per 15 minutes per IP
 */
const otpLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5,
    message: 'Too many OTP attempts. Please try again after 15 minutes.',
    handler: createLimitHandler('Too many OTP attempts. Please try again after 15 minutes.'),
    standardHeaders: true,
    legacyHeaders: false,
});

// ============================================
// GENERAL API RATE LIMITERS (Relaxed)
// ============================================

/**
 * General API rate limiter
 * Applies to public API endpoints and emits standard rate-limit headers.
 * 200 requests per minute per IP
 */
const apiLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 200,
    message: 'Too many requests. Please slow down.',
    handler: createLimitHandler('Too many requests. Please slow down.'),
    standardHeaders: true,
    legacyHeaders: false,
});

/**
 * Strict API rate limiter for expensive operations
 * 20 requests per minute per IP
 */
const strictApiLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 20,
    message: 'Too many requests. Please slow down.',
    handler: createLimitHandler('Too many requests. Please slow down.'),
    standardHeaders: true,
    legacyHeaders: false,
});

module.exports = {
    loginLimiter,
    registerLimiter,
    passwordResetLimiter,
    otpLimiter,
    apiLimiter,
    strictApiLimiter,
};
