// ============================================================
// IMPORTS & DEPENDENCIES
// ============================================================

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const jwt = require('jsonwebtoken');
const escapeHtml = require('escape-html');
const { logger } = require('../logger');
const rateLimit = require('express-rate-limit');

// ============================================================
// CONSTANTS & CONFIGURATION
// ============================================================

const SECRET_KEY = process.env.JWT_SECRET;
if (!SECRET_KEY) {
    logger.error('JWT_SECRET is not defined in environment variables');
    process.exit(1);
}

const IMAGES_DIR = path.join(__dirname, '..', 'public', 'images');
const IMAGES_PATH = '/public/images';

// ============================================================
// UPLOAD TRACKING
// ============================================================

/**
 * Tracks upload sizes per user/IP for rate limiting
 * Key: user identifier, Value: { totalSize, resetTime }
 */
const uploadSizeTracker = new Map();

// ============================================================
// RATE LIMITERS
// ============================================================

/**
 * Rate limiter: 40 uploads per 30 minutes per user/IP
 * Prevents rapid upload abuse
 */
const uploadCountLimiter = rateLimit({
    windowMs: 30 * 60 * 1000,
    max: 40,
    message: { error: 'Upload count exceeded (maximum 40 per 30 minutes)' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
        return req.user?.username || req.ip;
    },
    handler: (req, res, next, options) => {
        logger.warn(`Upload count limit exceeded (40 per 30 min)`, {
            ip: req.ip,
            username: req.user?.username || 'unknown',
            userAgent: req.headers['user-agent']
        });
        res.status(options.statusCode).json(options.message);
    }
});

/**
 * Rate limiter: 120 uploads per 3 hours per user/IP
 * Prevents medium-term upload abuse
 */
const uploadCountLimiter3h = rateLimit({
    windowMs: 3 * 60 * 60 * 1000,
    max: 120,
    message: { error: 'Upload count exceeded (maximum 120 per 3 hours)' },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
        return req.user?.username || req.ip;
    },
    handler: (req, res, next, options) => {
        logger.warn(`Upload count limit exceeded (120 per 3 hours)`, {
            ip: req.ip,
            username: req.user?.username || 'unknown',
            userAgent: req.headers['user-agent']
        });
        res.status(options.statusCode).json(options.message);
    }
});

/**
 * Middleware: Tracks total upload size per user/IP (1GB per 30 minutes)
 */
const uploadSizeLimiter = async (req, res, next) => {
    const key = req.user?.username || req.ip;
    const now = Date.now();
    const windowMs = 30 * 60 * 1000;
    const maxSize = 1 * 1024 * 1024 * 1024;

    const userData = uploadSizeTracker.get(key) || { totalSize: 0, resetTime: now + windowMs };

    if (now > userData.resetTime) {
        userData.totalSize = 0;
        userData.resetTime = now + windowMs;
    }

    req.uploadSizeData = userData;
    req.maxUploadSize = maxSize;
    req.windowMs = windowMs;

    next();
};

/**
 * Middleware: Tracks total upload size per user/IP (3GB per 3 hours)
 */
const uploadSizeLimiter3h = async (req, res, next) => {
    const key = `${req.user?.username || req.ip}_3h`;
    const now = Date.now();
    const windowMs = 3 * 60 * 60 * 1000;
    const maxSize = 3 * 1024 * 1024 * 1024;

    const userData = uploadSizeTracker.get(key) || { totalSize: 0, resetTime: now + windowMs };

    if (now > userData.resetTime) {
        userData.totalSize = 0;
        userData.resetTime = now + windowMs;
    }

    req.uploadSizeData3h = userData;
    req.maxUploadSize3h = maxSize;
    req.windowMs3h = windowMs;

    next();
};

// ============================================================
// DIRECTORY INITIALIZATION
// ============================================================

/**
 * Ensure the images directory exists on startup
 */
(async () => {
    try {
        await fs.mkdir(IMAGES_DIR, { recursive: true });
        logger.info('Images directory ready');
    } catch (err) {
        logger.error('Error creating images directory:', { error: err.message });
    }
})();

// ============================================================
// TOKEN MANAGEMENT
// ============================================================

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
            logger.withRequest(req, 'Attempted to access image management without token');
            return res.redirect('/admin/login');
        }

        const decoded = verifyToken(token);
        if (!decoded) {
            logger.withRequest(req, 'Invalid token in image management');
            return res.redirect('/admin/login');
        }

        req.user = decoded;
        next();
    } catch (err) {
        logger.errorWithRequest(req, err, 'Error verifying token in image management');
        res.clearCookie('adminToken');
        res.redirect('/admin/login');
    }
};

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

/**
 * Sanitizes a filename by removing invalid characters
 * Only allows letters, numbers, and underscores
 * @param {string} name - Filename to sanitize
 * @returns {string} Sanitized filename
 */
const sanitizeFilename = (name) => {
    return name.replace(/[^a-zA-Z0-9_]/g, '');
};

/**
 * Generates a random 8-character alphanumeric string
 * @returns {string} Random string
 */
const generateRandomName = () => {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 8; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
};

/**
 * Creates a public URL path for an image file
 * @param {string} filename - Image filename
 * @returns {string} Public URL path
 */
const createImageLink = (filename) => {
    return path.posix.join(IMAGES_PATH, filename);
};

// ============================================================
// MULTER CONFIGURATION
// ============================================================

/**
 * Multer storage configuration with duplicate filename detection
 */
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, IMAGES_DIR),
    filename: (req, file, cb) => {
        const name = req.body.name?.trim() ? sanitizeFilename(escapeHtml(req.body.name.trim())) : generateRandomName();
        const ext = path.extname(file.originalname);
        const finalName = name + ext;

        const filePath = path.join(IMAGES_DIR, finalName);
        fs.access(filePath)
            .then(() => {
                req.fileValidationError = 'File with this name already exists';
                cb(new Error('File with this name already exists'), null);
            })
            .catch(() => {
                cb(null, finalName);
            });
    }
});

/**
 * Multer upload configuration with file size and type validation
 */
const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        const allowedExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];

        const ext = path.extname(file.originalname).toLowerCase();
        const isValidMime = allowedMimes.includes(file.mimetype);
        const isValidExt = allowedExts.includes(ext);

        if (isValidMime && isValidExt) {
            cb(null, true);
        } else {
            cb(new Error('File must be an image'), false);
        }
    }
});

// ============================================================
// ROUTES - LIST IMAGES
// ============================================================

/**
 * GET /admin/images
 * Displays a list of all uploaded images
 */
router.get('/', checkToken, async (req, res) => {
    const operation = logger.startOperation('Loading image list', {
        admin: req.user?.username,
        action: 'list_images'
    });

    try {
        const files = await fs.readdir(IMAGES_DIR);

        const images = files.map(file => ({
            name: file,
            link: path.posix.join(IMAGES_PATH, file)
        }));

        logger.info(`Image list loaded: ${images.length} images`);
        operation.end('success', { imageCount: images.length });

        res.render('adminPanel/adminImages', { images });
    } catch (err) {
        logger.errorWithRequest(req, err, 'Error loading image list');
        operation.end('failed', { error: err.message });
        res.status(500).render('err', { message: 'Error loading image management page' });
    }
});

// ============================================================
// ROUTES - ADD IMAGE
// ============================================================

/**
 * GET /admin/images/add
 * Displays the add image form
 */
router.get('/add', checkToken, (req, res) => {
    try {
        logger.withRequest(req, `Accessing add image form by: ${req.user?.username}`);
        res.render('adminPanel/adminImagesAdd', { error: null });
    } catch (err) {
        logger.errorWithRequest(req, err, 'Error loading add image form');
        res.status(500).render('err');
    }
});

/**
 * POST /admin/images/add
 * Handles image upload with rate limiting
 */
router.post('/add', checkToken, uploadCountLimiter, uploadCountLimiter3h, uploadSizeLimiter, uploadSizeLimiter3h, (req, res) => {
    const operation = logger.startOperation('Uploading image', {
        admin: req.user?.username,
        fileName: req.body.name?.trim() || 'auto_generated'
    });

    upload.single('image')(req, res, async (err) => {
        // Handle Multer-specific errors
        if (err) {
            if (err.message === 'File with this name already exists') {
                logger.withRequest(req, `Attempted to upload image with duplicate name: ${req.body.name?.trim()}`);
                operation.end('failed', { reason: 'duplicate_filename' });
                return res.render('adminPanel/adminImagesAdd', { error: err.message });
            }

            if (err instanceof multer.MulterError) {
                if (err.code === 'FILE_TOO_LARGE') {
                    logger.withRequest(req, `File size exceeds limit: ${err.field}`);
                    operation.end('failed', { reason: 'file_too_large' });
                    return res.render('adminPanel/adminImagesAdd', { error: 'File size exceeds 5 MB limit' });
                }
                logger.withRequest(req, `Multer error: ${err.message}`);
                operation.end('failed', { reason: 'multer_error', error: err.message });
                return res.render('adminPanel/adminImagesAdd', { error: err.message });
            }

            logger.withRequest(req, `Upload error: ${err.message}`);
            operation.end('failed', { reason: 'upload_error', error: err.message });
            return res.render('adminPanel/adminImagesAdd', { error: 'Error uploading file' });
        }

        // No file selected
        if (!req.file) {
            logger.withRequest(req, 'Attempted to upload without selecting a file');
            operation.end('failed', { reason: 'no_file_selected' });
            return res.render('adminPanel/adminImagesAdd', { error: 'No file selected' });
        }

        // Upload successful
        logger.info(`Image uploaded: "${req.file.filename}" (${req.file.size} bytes) by ${req.user?.username}`);
        operation.end('success', {
            filename: req.file.filename,
            size: req.file.size,
            mimetype: req.file.mimetype
        });

        res.redirect('/admin/images');
    });
});

// ============================================================
// ROUTES - DELETE IMAGE
// ============================================================

/**
 * POST /admin/images/delete/:filename
 * Deletes an uploaded image file
 */
router.post('/delete/:filename', checkToken, async (req, res) => {
    const operation = logger.startOperation('Deleting image', {
        admin: req.user?.username,
        filename: req.params.filename
    });

    try {
        let filename = req.params.filename;

        // Extract only the filename (no path)
        filename = path.basename(filename);

        // Remove invalid characters
        filename = filename.replace(/[^a-zA-Z0-9\-_.]/g, '');

        if (!filename) {
            logger.withRequest(req, `Invalid filename for deletion: ${req.params.filename}`);
            operation.end('failed', { reason: 'invalid_filename' });
            return res.status(400).render('err', { message: 'Invalid filename' });
        }

        const filePath = path.join(IMAGES_DIR, filename);

        // Ensure file is within IMAGES_DIR
        if (!filePath.startsWith(IMAGES_DIR)) {
            logger.withRequest(req, `Attempted path traversal: ${filePath}`);
            operation.end('failed', { reason: 'path_traversal_attempt' });
            return res.status(400).render('err', { message: 'Unauthorized access' });
        }

        // Check if file exists
        try {
            await fs.access(filePath);
        } catch {
            logger.withRequest(req, `File not found for deletion: ${filename}`);
            operation.end('failed', { reason: 'file_not_found' });
            return res.status(404).render('err', { message: 'File not found' });
        }

        // Delete the file
        await fs.unlink(filePath);

        logger.info(`Image deleted: "${filename}" by ${req.user?.username}`);
        operation.end('success', { filename });

        res.redirect('/admin/images');
    } catch (err) {
        logger.errorWithRequest(req, err, `Error deleting image ${req.params.filename}`);
        operation.end('failed', { error: err.message });
        res.status(500).render('err', { message: 'Error deleting image' });
    }
});

// ============================================================
// EXPORTS
// ============================================================

module.exports = router;