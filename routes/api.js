const express = require('express');
const router = express.Router();
const { readFile } = require('fs').promises;
const path = require('path');
const { logger } = require('../logger'); // ← اضافه کردن logger

// ==============================
// CONSTANTS
// ==============================

const DATA_DIR = path.join(__dirname, '..', 'data');
const PATHS = {
    products: path.join(DATA_DIR, 'products.json'),
    productsFa: path.join(DATA_DIR, 'productsFa.json'),
    productsEn: path.join(DATA_DIR, 'productsEn.json'),
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
        if (!content || content.trim() === '') {
            return {}; // ✅ آبجکت خالی
        }
        return JSON.parse(content);
    } catch (err) {
        if (err.code === 'ENOENT') {
            logger.error(`فایل یافت نشد: ${filePath}`);
            return {}; // ✅ آبجکت خالی
        }
        logger.error(`JSON نامعتبر در فایل: ${filePath}`, { error: err.message });
        throw new Error(`Invalid JSON in: ${filePath}`);
    }
};

// ==============================
// API ROUTES
// ==============================

// API: Products (paginated)
router.get('/products/:page/:lang', async (req, res) => {
    const operation = logger.startOperation('دریافت محصولات از API', { // ← شروع عملیات
        page: req.params.page,
        lang: req.params.lang,
        endpoint: '/api/products'
    });

    try {
        const page = parseInt(req.params.page) || 1;
        if (isNaN(page) || page < 1) {
            logger.withRequest(req, `شماره صفحه نامعتبر در API محصولات: ${req.params.page}`); // ← لاگ با اطلاعات درخواست
            operation.end('failed', { reason: 'invalid_page' }); // ← پایان ناموفق
            return res.status(400).json({ 
                error: 'Invalid page number', 
                message: 'شماره صفحه نامعتبر است' 
            });
        }

        const lang = req.params.lang;

        // انتخاب فایل بر اساس زبان
        const productsPaths = {
            fa: PATHS.productsFa,
            en: PATHS.productsEn
        };
        const productsPath = productsPaths[lang] || productsPaths.fa;

        const allProducts = Object.values(await readJsonFile(productsPath));
        
        if (!allProducts || allProducts.length === 0) {
            logger.withRequest(req, `هیچ محصولی برای زبان ${lang} یافت نشد`); // ← لاگ با اطلاعات درخواست
            operation.end('failed', { reason: 'no_products', lang }); // ← پایان ناموفق
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

        logger.info(`API محصولات: ${results.length} محصول از ${allProducts.length} کل برای صفحه ${page} (زبان: ${lang})`); // ← لاگ اطلاعات
        operation.end('success', { 
            page, 
            lang, 
            returned: results.length, 
            total: allProducts.length,
            hasMore: end < allProducts.length
        }); // ← پایان موفق

        res.json({
            products: results,
            hasMore: end < allProducts.length,
            total: allProducts.length,
            page: page
        });
    } catch (err) {
        logger.errorWithRequest(req, err, 'خطا در API محصولات'); // ← لاگ خطا با اطلاعات درخواست
        operation.end('failed', { error: err.message }); // ← پایان ناموفق
        res.status(500).json({ 
            error: 'Server error',
            message: 'خطا در بارگذاری محصولات'
        });
    }
});

// API: Blogs (paginated)
router.get('/blogs/:page/:lang', async (req, res) => {
    const operation = logger.startOperation('دریافت بلاگ‌ها از API', { // ← شروع عملیات
        page: req.params.page,
        lang: req.params.lang,
        endpoint: '/api/blogs'
    });

    try {
        const page = parseInt(req.params.page) || 1;
        if (isNaN(page) || page < 1) {
            logger.withRequest(req, `شماره صفحه نامعتبر در API بلاگ‌ها: ${req.params.page}`); // ← لاگ با اطلاعات درخواست
            operation.end('failed', { reason: 'invalid_page' }); // ← پایان ناموفق
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
            logger.withRequest(req, `هیچ بلاگی برای زبان ${lang} یافت نشد`); // ← لاگ با اطلاعات درخواست
            operation.end('failed', { reason: 'no_blogs', lang }); // ← پایان ناموفق
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

        logger.info(`API بلاگ‌ها: ${posts.length} بلاگ از ${blogs.length} کل برای صفحه ${page} (زبان: ${lang})`); // ← لاگ اطلاعات
        operation.end('success', { 
            page, 
            lang, 
            returned: posts.length, 
            total: blogs.length,
            hasMore: end < blogs.length
        }); // ← پایان موفق

        res.json({
            page,
            hasMore: end < blogs.length,
            total: blogs.length,
            posts
        });
    } catch (err) {
        logger.errorWithRequest(req, err, 'خطا در API بلاگ‌ها'); // ← لاگ خطا با اطلاعات درخواست
        operation.end('failed', { error: err.message }); // ← پایان ناموفق
        res.status(500).json({ 
            error: 'Server error',
            message: 'خطا در بارگذاری بلاگ‌ها'
        });
    }
});

module.exports = router;