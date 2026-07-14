// ============================================================
// IMPORTS & INITIALIZATION
// ============================================================

require('dotenv').config();
const path = require('path');
const rateLimit = require('express-rate-limit');
const { logger } = require('./logger');

// ============================================================
// PATHS & CONSTANTS
// ============================================================

const DATA_DIR = path.join(__dirname, 'data');

/**
 * Application file paths for data storage
 */
const PATHS = {
    products: path.join(DATA_DIR, 'products.json'),
    productsFa: path.join(DATA_DIR, 'productsFa.json'),
    productsEn: path.join(DATA_DIR, 'productsEn.json'),
    blogs: path.join(DATA_DIR, 'blogs.json'),
    faqsFa: path.join(DATA_DIR, 'faqsFa.json'),
    faqsEn: path.join(DATA_DIR, 'faqsEn.json'),
    blogsFa: path.join(DATA_DIR, 'blogsFa.json'),
    blogsEn: path.join(DATA_DIR, 'blogsEn.json'),
    indexData: path.join(DATA_DIR, 'index_data.json')
};

/**
 * Valid language codes supported by the application
 */
const VALID_LANGS = ['fa', 'en'];

/**
 * Number of posts to display per page for pagination
 */
const POSTS_PER_PAGE = 5;

/**
 * Maximum number of top products to display on the homepage
 */
const TOP_PRODUCTS_MAX = 6;

// ============================================================
// JSON VALIDATION
// ============================================================

/**
 * Verifies JSON depth in request body to prevent deep nesting attacks
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Buffer} buf - Raw request body buffer
 * @throws {Error} When JSON depth exceeds the maximum allowed limit
 */
const jsonDepthVerify = (req, res, buf) => {
    const str = buf.toString();
    let depth = 0;
    let maxDepth = 0;

    for (let char of str) {
        if (char === '{' || char === '[') {
            depth++;
            if (depth > maxDepth) maxDepth = depth;
        } else if (char === '}' || char === ']') {
            depth--;
        }
    }

    if (maxDepth > 10) {
        logger.warn(`JSON depth exceeded: ${maxDepth}`, {
            method: req.method,
            path: req.path,
            ip: req.ip,
            maxDepth
        });
        throw new Error('JSON depth exceeds limit');
    }
};

// ============================================================
// RATE LIMITERS
// ============================================================

/**
 * Rate limiter: 100 requests per minute per IP
 * Protects against rapid API abuse
 */
const limiterPerMinute = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 100,
    message: { error: 'Too many requests per minute. Please slow down.' },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res, next, options) => {
        logger.warn(`Rate limit exceeded (per minute)`, {
            ip: req.ip,
            method: req.method,
            path: req.path,
            userAgent: req.headers['user-agent']
        });
        res.status(options.statusCode).json(options.message);
    }
});

/**
 * Rate limiter: 500 requests per 30 minutes per IP
 * Protects against medium-term abuse
 */
const limiterPer20Minutes = rateLimit({
    windowMs: 20 * 60 * 1000,
    max: 500,
    message: { error: 'Too many requests per 30 minutes. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res, next, options) => {
        logger.warn(`Rate limit exceeded (per 30 min)`, {
            ip: req.ip,
            method: req.method,
            path: req.path,
            userAgent: req.headers['user-agent']
        });
        res.status(options.statusCode).json(options.message);
    }
});

/**
 * Rate limiter: 20 login attempts per 10 minutes per IP
 * Protects against brute-force login attacks
 */
const loginLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 20,
    message: { error: 'Too many login attempts. Please try again after 10 minutes.' },
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res, next, options) => {
        logger.warn(`Login rate limit exceeded`, {
            ip: req.ip,
            username: req.body?.username || 'unknown',
            method: req.method,
            path: req.path,
            userAgent: req.headers['user-agent']
        });
        res.status(options.statusCode).json(options.message);
    }
});

// ============================================================
// SECURITY HEADERS - HELMET CONFIGURATION
// ============================================================

/**
 * Content Security Policy and security headers configuration
 * Provides defense-in-depth against XSS, clickjacking, and other attacks
 */
const helmetConfig = {
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: process.env.NODE_ENV === 'production' ? ["'self'"] : ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'"],
            fontSrc: ["'self'"],
            connectSrc: ["'self'"],
            frameAncestors: ["'none'"],
            upgradeInsecureRequests: [true],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"]
        }
    },
    crossOriginEmbedderPolicy: true,
    crossOriginOpenerPolicy: true,
    crossOriginResourcePolicy: { policy: "same-site" },
    dnsPrefetchControl: { allow: false },
    frameguard: { action: "deny" },
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
    },
    ieNoOpen: true,
    noSniff: true,
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    hidePoweredBy: true
};

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
    PATHS,
    VALID_LANGS,
    POSTS_PER_PAGE,
    TOP_PRODUCTS_MAX,
    jsonDepthVerify,
    limiterPerMinute,
    limiterPer20Minutes,
    loginLimiter,
    helmetConfig,
    PORT: process.env.PORT || 3000
};