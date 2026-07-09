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
    blogs: path.join(DATA_DIR, 'blogs.json'),
    blogsFa: path.join(DATA_DIR, 'blogsFa.json'),
    blogsEn: path.join(DATA_DIR, 'blogsEn.json')
};
const POSTS_PER_PAGE = 5;

// ==============================
// HELPERS
// ==============================

const readJsonFile = async (filePath) => {
    try {
        const content = await readFile(filePath, 'utf8');
        return JSON.parse(content);
    } catch (err) {
        if (err.code === 'ENOENT') {
            throw new Error(`File not found: ${filePath}`);
        }
        throw new Error(`Invalid JSON in: ${filePath}`);
    }
};

// ==============================
// API ROUTES
// ==============================

// API: Products (paginated)
router.get('/products', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        if (isNaN(page) || page < 1) {
            return res.status(400).json({ 
                error: 'Invalid page number', 
                message: 'شماره صفحه نامعتبر است' 
            });
        }

        const allProducts = Object.values(await readJsonFile(PATHS.products));
        
        if (!allProducts || allProducts.length === 0) {
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
                link: `/product/${start + index + 1}/fa`
            }));

        res.json({
            products: results,
            hasMore: end < allProducts.length,
            total: allProducts.length,
            page: page
        });
    } catch (err) {
        console.error('API Products error:', err.message);
        res.status(500).json({ 
            error: 'Server error',
            message: 'خطا در بارگذاری محصولات'
        });
    }
});

// API: Blogs (paginated)
router.get('/blogs/:page/:lang', async (req, res) => {
    try {
        const page = parseInt(req.params.page) || 1;
        if (isNaN(page) || page < 1) {
            return res.status(400).json({ 
                error: 'Invalid page number', 
                message: 'شماره صفحه نامعتبر است' 
            });
        }

        const lang = req.params.lang;

        // انتخاب فایل بر اساس زبان
        const blogsPaths = {
            fa: PATHS.blogsFa,
            en: PATHS.blogsEn
        };
        const blogsPath = blogsPaths[lang] || blogsPaths.fa;

        const blogs = Object.values(await readJsonFile(blogsPath));
        
        if (!blogs || blogs.length === 0) {
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

        res.json({
            page,
            hasMore: end < blogs.length,
            total: blogs.length,
            posts
        });
    } catch (err) {
        console.error('API Blogs error:', err.message);
        res.status(500).json({ 
            error: 'Server error',
            message: 'خطا در بارگذاری بلاگ‌ها'
        });
    }
});

module.exports = router;