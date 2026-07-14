// ============================================================
// IMPORTS & DEPENDENCIES
// ============================================================

const express = require('express');
const router = express.Router();
const { readFile } = require('fs').promises;
const path = require('path');
const { logger } = require('../logger');

// ============================================================
// CONSTANTS & CONFIGURATION
// ============================================================

const DATA_DIR = path.join(__dirname, '..', 'data');

/**
 * File paths for product and blog data in different languages
 */
const PATHS = {
    products: path.join(DATA_DIR, 'products.json'),
    productsFa: path.join(DATA_DIR, 'productsFa.json'),
    productsEn: path.join(DATA_DIR, 'productsEn.json'),
    blogs: path.join(DATA_DIR, 'blogs.json'),
    blogsFa: path.join(DATA_DIR, 'blogsFa.json'),
    blogsEn: path.join(DATA_DIR, 'blogsEn.json')
};

/**
 * Number of posts per page for blog pagination
 */
const POSTS_PER_PAGE = 5;

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

/**
 * Reads and parses a JSON file from the given path
 * @param {string} filePath - Path to the JSON file
 * @returns {Promise<Object>} Parsed JSON object or empty object on error
 * @throws {Error} If JSON is invalid
 */
const readJsonFile = async (filePath) => {
    try {
        const content = await readFile(filePath, 'utf8');
        if (!content || content.trim() === '') {
            return {};
        }
        return JSON.parse(content);
    } catch (err) {
        if (err.code === 'ENOENT') {
            logger.error(`File not found: ${filePath}`);
            return {};
        }
        logger.error(`Invalid JSON in file: ${filePath}`, { error: err.message });
        throw new Error(`Invalid JSON in: ${filePath}`);
    }
};

// ============================================================
// API ROUTES - PRODUCTS
// ============================================================

/**
 * GET /api/products/:page/:lang
 * Returns paginated products for the specified language
 */
router.get('/products/:page/:lang', async (req, res) => {
    const operation = logger.startOperation('Fetching products from API', {
        page: req.params.page,
        lang: req.params.lang,
        endpoint: '/api/products'
    });

    try {
        const page = parseInt(req.params.page) || 1;
        if (isNaN(page) || page < 1) {
            logger.withRequest(req, `Invalid page number in products API: ${req.params.page}`);
            operation.end('failed', { reason: 'invalid_page' });
            return res.status(400).json({
                error: 'Invalid page number',
                message: 'Invalid page number'
            });
        }

        const lang = req.params.lang;

        // Select file based on language
        const productsPaths = {
            fa: PATHS.productsFa,
            en: PATHS.productsEn
        };
        const productsPath = productsPaths[lang] || productsPaths.fa;

        const allProducts = Object.values(await readJsonFile(productsPath));

        if (!allProducts || allProducts.length === 0) {
            logger.withRequest(req, `No products found for language: ${lang}`);
            operation.end('failed', { reason: 'no_products', lang });
            return res.status(404).json({
                error: 'No products found',
                products: [],
                hasMore: false
            });
        }

        const limit = 10;
        const start = (page - 1) * limit;
        const end = page * limit;

        const results = allProducts
            .slice(start, end)
            .map((product, index) => ({
                ...product,
                link: `/product/${start + index + 1}/${lang}`
            }));

        logger.info(`Products API: ${results.length} products from ${allProducts.length} total for page ${page} (${lang})`);
        operation.end('success', {
            page,
            lang,
            returned: results.length,
            total: allProducts.length,
            hasMore: end < allProducts.length
        });

        res.json({
            products: results,
            hasMore: end < allProducts.length,
            total: allProducts.length,
            page: page
        });
    } catch (err) {
        logger.errorWithRequest(req, err, 'Error in products API');
        operation.end('failed', { error: err.message });
        res.status(500).json({
            error: 'Server error',
            message: 'Error loading products'
        });
    }
});

// ============================================================
// API ROUTES - BLOGS
// ============================================================

/**
 * GET /api/blogs/:page/:lang
 * Returns paginated blog posts for the specified language
 */
router.get('/blogs/:page/:lang', async (req, res) => {
    const operation = logger.startOperation('Fetching blogs from API', {
        page: req.params.page,
        lang: req.params.lang,
        endpoint: '/api/blogs'
    });

    try {
        const page = parseInt(req.params.page) || 1;
        if (isNaN(page) || page < 1) {
            logger.withRequest(req, `Invalid page number in blogs API: ${req.params.page}`);
            operation.end('failed', { reason: 'invalid_page' });
            return res.status(400).json({
                error: 'Invalid page number',
                message: 'Invalid page number'
            });
        }

        const lang = req.params.lang;

        // Select file based on language
        const blogsPaths = {
            fa: PATHS.blogsFa,
            en: PATHS.blogsEn
        };
        const blogsPath = blogsPaths[lang] || blogsPaths.fa;

        const blogs = Object.values(await readJsonFile(blogsPath));

        if (!blogs || blogs.length === 0) {
            logger.withRequest(req, `No blogs found for language: ${lang}`);
            operation.end('failed', { reason: 'no_blogs', lang });
            return res.status(404).json({
                error: 'No blogs found',
                posts: [],
                hasMore: false
            });
        }

        const start = (page - 1) * POSTS_PER_PAGE;
        const end = start + POSTS_PER_PAGE;

        const posts = blogs
            .slice(start, end)
            .map((blog, index) => ({
                ...blog,
                link: `/blog/${start + index + 1}/${lang}`
            }));

        logger.info(`Blogs API: ${posts.length} posts from ${blogs.length} total for page ${page} (${lang})`);
        operation.end('success', {
            page,
            lang,
            returned: posts.length,
            total: blogs.length,
            hasMore: end < blogs.length
        });

        res.json({
            page,
            hasMore: end < blogs.length,
            total: blogs.length,
            posts
        });
    } catch (err) {
        logger.errorWithRequest(req, err, 'Error in blogs API');
        operation.end('failed', { error: err.message });
        res.status(500).json({
            error: 'Server error',
            message: 'Error loading blogs'
        });
    }
});

// ============================================================
// EXPORTS
// ============================================================

module.exports = router;