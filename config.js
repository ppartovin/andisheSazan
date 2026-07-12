// ==============================
// config.js - All configurations
// ==============================

require('dotenv').config();
const path = require('path');
const rateLimit = require('express-rate-limit');
const { logger } = require('./logger'); // ← اضافه کردن logger

// ==============================
// PATHS & CONSTANTS
// ==============================

const DATA_DIR = path.join(__dirname, 'data');
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

const VALID_LANGS = ['fa', 'en'];
const POSTS_PER_PAGE = 5;
const TOP_PRODUCTS_MAX = 6;

// ==============================
// JSON DEPTH LIMIT
// ==============================

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
        // ✅ تبدیل به Winston
        logger.warn(`JSON depth exceeded: ${maxDepth}`, {
            method: req.method,
            path: req.path,
            ip: req.ip,
            maxDepth
        });
        throw new Error('JSON depth exceeds limit');
    }
};

// ==============================
// RATE LIMITERS
// ==============================

const limiterPerMinute = rateLimit({
    windowMs: 1 * 60 * 1000,
    max: 100,
    message: { error: 'Too many requests per minute. Please slow down.' },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res, next, options) => {
        // ✅ تبدیل به Winston
        logger.warn(`Rate limit exceeded (per minute)`, {
            ip: req.ip,
            method: req.method,
            path: req.path,
            userAgent: req.headers['user-agent']
        });
        res.status(options.statusCode).json(options.message);
    }
});

const limiterPer30Minutes = rateLimit({
    windowMs: 20 * 60 * 1000,
    max: 500,
    message: { error: 'Too many requests per 30 minutes. Please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res, next, options) => {
        // ✅ تبدیل به Winston
        logger.warn(`Rate limit exceeded (per 30 min)`, {
            ip: req.ip,
            method: req.method,
            path: req.path,
            userAgent: req.headers['user-agent']
        });
        res.status(options.statusCode).json(options.message);
    }
});

const loginLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 20,
    message: { error: 'Too many login attempts. Please try again after 10 minutes.' },
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res, next, options) => {
        // ✅ تبدیل به Winston
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

// ==============================
// HELMET CONFIG
// ==============================

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

// ==============================
// EXPORT
// ==============================

module.exports = {
    PATHS,
    VALID_LANGS,
    POSTS_PER_PAGE,
    TOP_PRODUCTS_MAX,
    jsonDepthVerify,
    limiterPerMinute,
    limiterPer30Minutes,
    loginLimiter,
    helmetConfig,
    PORT: process.env.PORT || 3000
};