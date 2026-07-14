// ============================================================
// IMPORTS & DEPENDENCIES
// ============================================================

const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { readFile, writeFile } = require('fs').promises;
const path = require('path');
const { logger } = require('../logger');

// ============================================================
// CONSTANTS & CONFIGURATION
// ============================================================

const SECRET_KEY = process.env.JWT_SECRET;
if (!SECRET_KEY) {
    logger.error('JWT_SECRET is not defined in environment variables');
    process.exit(1);
}

const DATA_DIR = path.join(__dirname, '..', 'data');
const ADMINS_PATH = path.join(DATA_DIR, 'adminAccounts.json');

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

/**
 * Delay execution for a specified number of milliseconds
 * Used to prevent timing attacks during authentication
 * @param {number} ms - Milliseconds to delay
 * @returns {Promise<void>}
 */
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Reads and parses a JSON file from the given path
 * @param {string} filePath - Path to the JSON file
 * @returns {Promise<Array>} Parsed JSON array or empty array on error
 * @throws {Error} If JSON is invalid
 */
const readJsonFile = async (filePath) => {
    try {
        const content = await readFile(filePath, 'utf8');
        if (!content || content.trim() === '') {
            return [];
        }
        return JSON.parse(content);
    } catch (err) {
        if (err.code === 'ENOENT') {
            logger.warn(`Admin file not found: ${filePath}`);
            return [];
        }
        logger.error(`Invalid JSON in admin file: ${filePath}`, { error: err.message });
        throw new Error(`Invalid JSON in: ${filePath}`);
    }
};

// ============================================================
// TOKEN MANAGEMENT
// ============================================================

/**
 * Generates a JWT token for admin authentication
 * @param {string} username - Admin username
 * @returns {string} JWT token
 */
const generateToken = (username) => {
    return jwt.sign({ username }, SECRET_KEY, { expiresIn: '1h' });
};

/**
 * Verifies and decodes a JWT token
 * @param {string} token - JWT token to verify
 * @returns {Object|null} Decoded token payload or null if invalid
 */
const verifyToken = (token) => {
    try {
        return jwt.verify(token, SECRET_KEY);
    } catch {
        return null;
    }
};

// ============================================================
// AUTHENTICATION MIDDLEWARE
// ============================================================

/**
 * Middleware to verify admin authentication token
 * Redirects to login page if token is missing or invalid
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const checkToken = (req, res, next) => {
    try {
        const token = req.cookies?.adminToken;

        if (!token) {
            logger.withRequest(req, 'Attempted to access admin panel without token');
            return res.redirect('/admin/login');
        }

        const decoded = verifyToken(token);
        if (!decoded) {
            logger.withRequest(req, 'Invalid token in admin panel');
            return res.redirect('/admin/login');
        }

        req.user = decoded;
        next();
    } catch (err) {
        logger.errorWithRequest(req, err, 'Error verifying admin token');
        res.clearCookie('adminToken');
        res.redirect('/admin/login');
    }
};

// ============================================================
// SUB-ROUTES
// ============================================================

const productRoutes = require('./adminProducts');
router.use('/products', productRoutes);

const blogRoutes = require('./adminBlogs');
router.use('/blogs', blogRoutes);

const faqRoutes = require('./adminFaq');
router.use('/faq', faqRoutes);

const imagesRoutes = require('./adminImages');
router.use('/images', imagesRoutes);

// ============================================================
// ROUTES - REDIRECTS
// ============================================================

/**
 * GET /admin
 * Redirects to admin login page
 */
router.get('/', (req, res) => {
    logger.withRequest(req, 'Redirecting to admin login');
    res.redirect('/admin/login');
});

// ============================================================
// ROUTES - AUTHENTICATION
// ============================================================

/**
 * GET /admin/login
 * Renders the admin login page
 * Redirects to panel if already authenticated
 */
router.get('/login', (req, res) => {
    try {
        const token = req.cookies?.adminToken;

        if (token && verifyToken(token)) {
            logger.withRequest(req, 'User already logged in, redirecting to panel');
            return res.redirect('/admin/panel');
        }

        res.render('adminPanel/adminLogin', { error: null });
    } catch (err) {
        logger.errorWithRequest(req, err, 'Error loading admin login page');
        res.status(500).render('err');
    }
});

/**
 * POST /admin/login
 * Handles admin login authentication
 */
router.post('/login', async (req, res) => {
    const operation = logger.startOperation('Admin login attempt', {
        username: req.body?.username,
        ip: req.ip
    });

    try {
        const { username, password } = req.body;

        // Validate credentials presence
        if (!username || !password) {
            logger.withRequest(req, 'Login attempt without username or password');
            operation.end('failed', { reason: 'missing_credentials' });
            return res.render('adminPanel/adminLogin', { error: 'نام کاربری و رمز عبور الزامی است' });
        }

        // Validate username length
        if (username.length < 3 || username.length > 50) {
            logger.withRequest(req, `Invalid username length: ${username.length}`);
            operation.end('failed', { reason: 'invalid_username_length' });
            return res.render('adminPanel/adminLogin', { error: "نام کاربری باید بین ۳ تا ۵۰ کاراکتر باشد" });
        }

        // Validate password length
        if (password.length < 6 || password.length > 100) {
            logger.withRequest(req, `Invalid password length: ${password.length}`);
            operation.end('failed', { reason: 'invalid_password_length' });
            return res.render('adminPanel/adminLogin', { error: 'Password must be between 6 and 100 characters' });
        }

        // Validate username characters (alphanumeric, underscore, dot)
        const usernameRegex = /^[a-zA-Z0-9_.]+$/;
        if (!usernameRegex.test(username)) {
            logger.withRequest(req, `Invalid username characters: ${username}`);
            operation.end('failed', { reason: 'invalid_username_chars' });
            return res.render('adminPanel/adminLogin', {
                error: 'Username can only contain letters, numbers, underscore, and dot'
            });
        }

        // Load admin accounts
        const admins = await readJsonFile(ADMINS_PATH);
        const admin = admins.find(u => u.username === username);

        // Check if user exists
        if (!admin) {
            await delay(500);
            logger.warn(`Failed login attempt: User "${username}" not found`, {
                ip: req.ip,
                userAgent: req.headers['user-agent']
            });
            operation.end('failed', { reason: 'user_not_found' });
            return res.render('adminPanel/adminLogin', { error: 'نام کاربری یا رمز عبور اشتباه است' });
        }

        // Verify password
        const isMatch = await bcrypt.compare(password, admin.password);

        if (!isMatch) {
            await delay(500);
            logger.warn(`Failed login attempt: Wrong password for "${username}"`, {
                ip: req.ip,
                userAgent: req.headers['user-agent']
            });
            operation.end('failed', { reason: 'wrong_password' });
            return res.render('adminPanel/adminLogin', { error: 'نام کاربری یا رمز عبور اشتباه است' });
        }

        // Successful login
        logger.info(`Admin login successful: ${username}`, {
            username,
            ip: req.ip,
            userAgent: req.headers['user-agent']
        });

        const token = generateToken(username);

        res.cookie('adminToken', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'Strict',
            maxAge: 60 * 60 * 1000 // 1 hour
        });

        operation.end('success', { username });
        res.redirect('/admin/panel');

    } catch (err) {
        logger.errorWithRequest(req, err, 'Error in admin login process');
        operation.end('failed', { error: err.message });
        res.status(500).render('err', { message: 'Login error' });
    }
});

// ============================================================
// ROUTES - PROTECTED PANEL
// ============================================================

/**
 * GET /admin/panel
 * Renders the admin dashboard (protected)
 */
router.get('/panel', checkToken, (req, res) => {
    try {
        logger.withRequest(req, `Admin panel accessed by: ${req.user.username}`);
        res.render('adminPanel/adminPanel', { username: req.user.username });
    } catch (err) {
        logger.errorWithRequest(req, err, 'Error loading admin panel');
        res.status(500).render('err');
    }
});

// ============================================================
// ROUTES - LOGOUT
// ============================================================

/**
 * GET /admin/logout
 * Logs out the admin user by clearing the token
 */
router.get('/logout', (req, res) => {
    try {
        const username = req.user?.username || 'unknown';
        logger.withRequest(req, `Admin logout: ${username}`);
        res.clearCookie('adminToken');
        delete req.user;
        res.redirect('/admin/login');
    } catch (err) {
        logger.errorWithRequest(req, err, 'Error during logout');
        res.status(500).render('err');
    }
});

// ============================================================
// EXPORTS
// ============================================================

module.exports = router;