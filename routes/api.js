const express = require('express');
const router = express.Router();
const { readFile } = require('fs').promises;
const path = require('path');

// ==============================
// CONSTANTS
// ==============================

const DATA_DIR = path.join(__dirname, '..', 'data');
const PATHS = {
    products: path.join(DATA_DIR, 'products.json'),
    blogs: path.join(DATA_DIR, 'blogs.json')
};
const POSTS_PER_PAGE = 5;

// ==============================
// HELPERS
// ==============================

const readJsonFile = async (filePath) => {
    const content = await readFile(filePath, 'utf8');
    return JSON.parse(content);
};

// ==============================
// API ROUTES
// ==============================

// API: Products (paginated)
router.get('/products', async (req, res) => {
    try {
        const allProducts = Object.values(await readJsonFile(PATHS.products));
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const start = (page - 1) * limit;
        const end = page * limit;

        const results = allProducts
            .slice(start, end)
            .map((product, index) => ({
                ...product,
                link: `/product/${start + index + 1}/fa`
            }));

        res.json({
            products: results,
            hasMore: end < allProducts.length
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// API: Blogs (paginated)
router.get('/blogs/:page', async (req, res) => {
    try {
        const blogs = Object.values(await readJsonFile(PATHS.blogs));
        const page = parseInt(req.params.page) || 1;
        const start = (page - 1) * POSTS_PER_PAGE;
        const end = start + POSTS_PER_PAGE;

        const posts = blogs
            .slice(start, end)
            .map((blog, index) => ({
                ...blog,
                link: `/blog/${start + index + 1}/fa`
            }));

        res.json({
            page,
            hasMore: end < blogs.length,
            posts
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;