// ============================================================
// IMPORTS & DEPENDENCIES
// ============================================================

const express = require('express');
const router = express.Router();
const { readFile, writeFile } = require('fs').promises;
const path = require('path');
const jwt = require('jsonwebtoken');
const escapeHtml = require('escape-html');
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
const BLOGS_PATH = path.join(DATA_DIR, 'blogs.json');

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

/**
 * Reads and parses a JSON file from the given path
 * @param {string} filePath - Path to the JSON file
 * @returns {Promise<Object|Array>} Parsed JSON data or empty object on error
 * @throws {Error} If JSON is invalid
 */
const readJsonFile = async (filePath) => {
    try {
        const content = await readFile(filePath, 'utf8');
        if (!content || content.trim() === '') {
            return {};
        }
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) {
            return parsed;
        }
        return parsed;
    } catch (err) {
        if (err.code === 'ENOENT') {
            logger.warn(`Blogs file not found: ${filePath}`);
            return {};
        }
        logger.error(`Invalid JSON in blogs file: ${filePath}`, { error: err.message });
        throw new Error(`Invalid JSON in: ${filePath}`);
    }
};

/**
 * Writes data to a JSON file
 * @param {string} filePath - Path to the JSON file
 * @param {Object|Array} data - Data to write
 * @returns {Promise<void>}
 * @throws {Error} If write operation fails
 */
const writeJsonFile = async (filePath, data) => {
    try {
        await writeFile(filePath, JSON.stringify(data, null, 2));
    } catch (err) {
        logger.error(`Error writing file: ${filePath}`, { error: err.message });
        throw new Error(`Failed to write file: ${filePath}`);
    }
};

/**
 * Reindexes items to have sequential numeric keys starting from 1
 * @param {Object} items - Object with numeric keys
 * @returns {Object} Reindexed object
 */
const reindexItems = (items) => {
    const newItems = {};
    let counter = 1;
    Object.values(items).forEach(item => {
        newItems[counter] = item;
        counter++;
    });
    return newItems;
};

/**
 * Validates if a URL points to a valid image with allowed extension
 * @param {string} url - Image URL to validate
 * @returns {boolean} True if URL is valid and has allowed extension
 */
const isValidImageUrl = (url) => {
    if (!url) return true;

    try {
        const parsed = new URL(url);

        // Only HTTP and HTTPS protocols allowed
        if (!['http:', 'https:'].includes(parsed.protocol)) {
            return false;
        }

        // Allowed file extensions
        const validExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'];
        const ext = path.extname(parsed.pathname).toLowerCase();
        if (!validExtensions.includes(ext)) {
            return false;
        }

        return true;
    } catch {
        return false;
    }
};

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
            logger.withRequest(req, 'Attempted to access blog management without token');
            return res.redirect('/admin/login');
        }

        const decoded = verifyToken(token);
        if (!decoded) {
            logger.withRequest(req, 'Invalid token in blog management');
            return res.redirect('/admin/login');
        }

        req.user = decoded;
        next();
    } catch (err) {
        logger.errorWithRequest(req, err, 'Error verifying token in blog management');
        res.clearCookie('adminToken');
        res.redirect('/admin/login');
    }
};

// ============================================================
// ROUTES - LIST BLOGS
// ============================================================

/**
 * GET /admin/blogs
 * Displays a list of all blog posts
 */
router.get('/', checkToken, async (req, res) => {
    const operation = logger.startOperation('Loading blog list', {
        admin: req.user?.username,
        action: 'list_blogs'
    });

    try {
        const blogsObj = await readJsonFile(BLOGS_PATH);
        const blogs = Object.entries(blogsObj).map(([id, item]) => ({
            id,
            ...item
        }));

        logger.info(`Blog list loaded: ${blogs.length} blogs`);
        operation.end('success', { blogCount: blogs.length });

        res.render('adminPanel/adminBlogs', { blogs });
    } catch (err) {
        logger.errorWithRequest(req, err, 'Error loading blog list');
        operation.end('failed', { error: err.message });
        res.status(500).render('err', { message: 'Error loading blog list' });
    }
});

// ============================================================
// ROUTES - ADD BLOG
// ============================================================

/**
 * GET /admin/blogs/add
 * Displays the add blog form
 */
router.get('/add', checkToken, (req, res) => {
    try {
        logger.withRequest(req, `Accessing add blog form by: ${req.user?.username}`);
        res.render('adminPanel/adminBlogsAdd', { error: null });
    } catch (err) {
        logger.errorWithRequest(req, err, 'Error loading add blog form');
        res.status(500).render('err');
    }
});

/**
 * POST /admin/blogs/add
 * Creates a new blog post
 */
router.post('/add', checkToken, async (req, res) => {
    const operation = logger.startOperation('Adding new blog', {
        admin: req.user?.username,
        title: req.body.title?.trim()?.substring(0, 50)
    });

    try {
        const title = escapeHtml(req.body.title.trim());
        const subtitle = escapeHtml(req.body.subtitle?.trim() || '');
        const writer = escapeHtml(req.body.writer?.trim() || '');
        const date = escapeHtml(req.body.date?.trim() || '');
        const imageRaw = req.body.image?.trim() || '';
        const text = escapeHtml(req.body.text?.trim() || '');

        // Validate image URL
        if (imageRaw && !isValidImageUrl(imageRaw)) {
            logger.withRequest(req, `Invalid image URL: ${imageRaw}`);
            operation.end('failed', { reason: 'invalid_image' });
            return res.render('adminPanel/adminBlogsAdd', {
                error: 'Invalid image URL. Only jpg, jpeg, png, gif, webp, svg extensions are allowed.'
            });
        }

        const image = imageRaw;

        // Validate required fields
        if (!title || title.trim() === '') {
            logger.withRequest(req, 'Attempted to add blog without title');
            operation.end('failed', { reason: 'missing_title' });
            return res.render('adminPanel/adminBlogsAdd', {
                error: 'Blog title is required'
            });
        }

        if (title.length > 200) {
            logger.withRequest(req, `Blog title too long: ${title.length} characters`);
            operation.end('failed', { reason: 'title_too_long' });
            return res.render('adminPanel/adminBlogsAdd', {
                error: 'Blog title cannot exceed 200 characters'
            });
        }

        if (text && text.length > 50000) {
            logger.withRequest(req, `Blog text too long: ${text.length} characters`);
            operation.end('failed', { reason: 'text_too_long' });
            return res.render('adminPanel/adminBlogsAdd', {
                error: 'Blog text cannot exceed 50000 characters'
            });
        }

        const blogs = await readJsonFile(BLOGS_PATH);

        const ids = Object.keys(blogs).map(Number);
        const nextId = ids.length > 0 ? Math.max(...ids) + 1 : 1;

        blogs[nextId] = {
            title: title.trim(),
            subtitle: subtitle?.trim() || '',
            writer: writer?.trim() || '',
            date: date?.trim() || '',
            image: image?.trim() || '',
            text: text?.trim() || ''
        };

        const reindexedBlogs = reindexItems(blogs);
        await writeJsonFile(BLOGS_PATH, reindexedBlogs);

        logger.info(`New blog added: "${title}" (ID: ${nextId}) by ${req.user?.username}`);
        operation.end('success', { blogId: nextId, title: title.substring(0, 50) });

        res.redirect('/admin/blogs');

    } catch (err) {
        logger.errorWithRequest(req, err, 'Error adding blog');
        operation.end('failed', { error: err.message });
        res.status(500).render('err', { message: 'Error adding blog' });
    }
});

// ============================================================
// ROUTES - EDIT BLOG
// ============================================================

/**
 * GET /admin/blogs/edit/:id
 * Displays the edit blog form
 */
router.get('/edit/:id', checkToken, async (req, res) => {
    try {
        const blogId = req.params.id;

        // Validate ID format
        if (!blogId || isNaN(parseInt(blogId)) || !/^\d+$/.test(blogId)) {
            logger.withRequest(req, `Invalid blog ID for editing: ${blogId}`);
            return res.redirect('/admin/blogs');
        }

        const blogs = await readJsonFile(BLOGS_PATH);
        const blog = blogs[blogId];

        if (!blog) {
            logger.withRequest(req, `Blog with ID ${blogId} not found for editing`);
            return res.redirect('/admin/blogs');
        }

        logger.withRequest(req, `Accessing edit blog form for ${blogId} by: ${req.user?.username}`);
        res.render('adminPanel/adminBlogsEdit', {
            blog: { id: blogId, ...blog }
        });

    } catch (err) {
        logger.errorWithRequest(req, err, `Error loading edit blog form for ${req.params.id}`);
        res.status(500).render('err', { message: 'Error loading edit form' });
    }
});

/**
 * POST /admin/blogs/edit/:id
 * Updates an existing blog post
 */
router.post('/edit/:id', checkToken, async (req, res) => {
    const operation = logger.startOperation('Editing blog', {
        admin: req.user?.username,
        blogId: req.params.id,
        title: req.body.title?.trim()?.substring(0, 50)
    });

    try {
        const blogId = req.params.id;
        const title = escapeHtml(req.body.title.trim());
        const subtitle = escapeHtml(req.body.subtitle?.trim() || '');
        const writer = escapeHtml(req.body.writer?.trim() || '');
        const date = escapeHtml(req.body.date?.trim() || '');
        const imageRaw = req.body.image?.trim() || '';
        const text = escapeHtml(req.body.text?.trim() || '');

        // Validate image URL
        if (imageRaw && !isValidImageUrl(imageRaw)) {
            logger.withRequest(req, `Invalid image URL in edit: ${imageRaw}`);
            operation.end('failed', { reason: 'invalid_image' });

            const blogs = await readJsonFile(BLOGS_PATH);
            return res.render('adminPanel/adminBlogsEdit', {
                blog: { id: blogId, ...blogs[blogId] },
                error: 'Invalid image URL. Only jpg, jpeg, png, gif, webp, svg extensions are allowed.'
            });
        }

        const image = imageRaw;

        // Validate ID format
        if (!blogId || isNaN(parseInt(blogId)) || !/^\d+$/.test(blogId)) {
            logger.withRequest(req, `Invalid blog ID for editing: ${blogId}`);
            operation.end('failed', { reason: 'invalid_id' });
            return res.redirect('/admin/blogs');
        }

        const blogs = await readJsonFile(BLOGS_PATH);

        if (!blogs[blogId]) {
            logger.withRequest(req, `Blog with ID ${blogId} not found for editing`);
            operation.end('failed', { reason: 'blog_not_found' });
            return res.redirect('/admin/blogs');
        }

        // Validate title length
        if (title && title.length > 200) {
            logger.withRequest(req, `Blog title too long: ${title.length} characters`);
            operation.end('failed', { reason: 'title_too_long' });
            return res.render('adminPanel/adminBlogsEdit', {
                blog: { id: blogId, ...blogs[blogId] },
                error: 'Blog title cannot exceed 200 characters'
            });
        }

        if (text && text.length > 50000) {
            logger.withRequest(req, `Blog text too long: ${text.length} characters`);
            operation.end('failed', { reason: 'text_too_long' });
            return res.render('adminPanel/adminBlogsEdit', {
                blog: { id: blogId, ...blogs[blogId] },
                error: 'Blog text cannot exceed 50000 characters'
            });
        }

        const oldTitle = blogs[blogId].title;

        blogs[blogId] = {
            ...blogs[blogId],
            title: title?.trim() || blogs[blogId].title,
            subtitle: subtitle?.trim() || blogs[blogId].subtitle || '',
            writer: writer?.trim() || blogs[blogId].writer || '',
            date: date?.trim() || blogs[blogId].date || '',
            image: image?.trim() || blogs[blogId].image || '',
            text: text?.trim() || blogs[blogId].text || ''
        };

        const reindexedBlogs = reindexItems(blogs);
        await writeJsonFile(BLOGS_PATH, reindexedBlogs);

        logger.info(`Blog updated: "${oldTitle}" → "${title}" (ID: ${blogId}) by ${req.user?.username}`);
        operation.end('success', { blogId, oldTitle: oldTitle.substring(0, 50), newTitle: title.substring(0, 50) });

        res.redirect('/admin/blogs');

    } catch (err) {
        logger.errorWithRequest(req, err, `Error editing blog ${req.params.id}`);
        operation.end('failed', { error: err.message });
        res.status(500).render('err', { message: 'Error editing blog' });
    }
});

// ============================================================
// ROUTES - DELETE BLOG
// ============================================================

/**
 * GET /admin/blogs/delete/:id
 * Deletes a blog post
 */
router.get('/delete/:id', checkToken, async (req, res) => {
    const operation = logger.startOperation('Deleting blog', {
        admin: req.user?.username,
        blogId: req.params.id
    });

    try {
        const blogId = req.params.id;

        // Validate ID format
        if (!blogId || isNaN(parseInt(blogId)) || !/^\d+$/.test(blogId)) {
            logger.withRequest(req, `Invalid blog ID for deletion: ${blogId}`);
            operation.end('failed', { reason: 'invalid_id' });
            return res.redirect('/admin/blogs');
        }

        const blogs = await readJsonFile(BLOGS_PATH);

        if (!blogs[blogId]) {
            logger.withRequest(req, `Blog with ID ${blogId} not found for deletion`);
            operation.end('failed', { reason: 'blog_not_found' });
            return res.redirect('/admin/blogs');
        }

        const deletedTitle = blogs[blogId].title;

        delete blogs[blogId];

        const reindexedBlogs = reindexItems(blogs);
        await writeJsonFile(BLOGS_PATH, reindexedBlogs);

        logger.info(`Blog deleted: "${deletedTitle}" (ID: ${blogId}) by ${req.user?.username}`);
        operation.end('success', { blogId, title: deletedTitle.substring(0, 50) });

        res.redirect('/admin/blogs');

    } catch (err) {
        logger.errorWithRequest(req, err, `Error deleting blog ${req.params.id}`);
        operation.end('failed', { error: err.message });
        res.status(500).render('err', { message: 'Error deleting blog' });
    }
});

// ============================================================
// EXPORTS
// ============================================================

module.exports = router;