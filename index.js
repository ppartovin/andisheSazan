// Load environment variables from .env file
require('dotenv').config();

// Import required modules
const express = require('express');
const { logger, morganMiddleware } = require('./logger');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const { readFile } = require('fs').promises;
const path = require('path');
const compression = require('compression');

// Import config
const config = require('./config');

const app = express();

// ==============================
// MIDDLEWARES
// ==============================

app.use(morganMiddleware);
app.use(cookieParser());
app.use(express.json({ limit: '1mb', verify: config.jsonDepthVerify }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(helmet(config.helmetConfig));
app.use(compression());

// ==============================
// RATE LIMITING
// ==============================

/* app.use('/admin/login', config.loginLimiter);
app.use(config.limiterPerMinute);
app.use(config.limiterPer30Minutes);
 */
// ==============================
// VIEW ENGINE & STATIC
// ==============================

app.set('etag', 'strong');
app.set('view engine', 'ejs');
app.use('/public', express.static('public',{
    maxAge: 60 * 60 * 1000, // 1 ساعت
    immutable: true // به مرورگر بگو این فایل‌ها تغییر نمی‌کنند
}));

// ==============================
// VALIDATION MIDDLEWARE
// ==============================

const validateId = (req, res, next) => {
    const id = req.params.id;
    if (!id || isNaN(parseInt(id)) || parseInt(id) <= 0) {
        logger.withRequest(req, `شناسه نامعتبر: ${id}`); // ← لاگ با اطلاعات درخواست
        return res.status(404).render('404', { message: 'شناسه نامعتبر است' });
    }
    next();
};

// ==============================
// HELPERS
// ==============================

const renderPage = (req, res, pageName, lang, data = {}) => {
    if (!config.VALID_LANGS.includes(lang)) {
        logger.withRequest(req, `زبان نامعتبر: ${lang} برای صفحه ${pageName}`); // ← لاگ با اطلاعات درخواست
        return res.redirect(`/${pageName}/fa`);
    }

    const theme = req.cookies?.light_status || 'day';

    const suffix = lang === 'en' ? 'En' : 'Fa';
    const viewName = `${pageName}${suffix}${theme === 'night' ? 'Ni' : ''}`;

    res.render(viewName, { data, lang, theme}, (err, html) => {
        if (err) {
            logger.errorWithRequest(req, err, `خطا در رندر صفحه ${pageName}`); // ← لاگ خطا با اطلاعات درخواست
            return res.status(404).render('404', { message: 'Page not found' });
        }
        res.send(html);
    });
};

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
// ROUTES
// ==============================

// Admin & API routes
const adminRoutes = require('./routes/admin');
app.use('/admin', adminRoutes);

const apiRoutes = require('./routes/api');
app.use('/api', apiRoutes);

// Redirects (نیاز به لاگ ندارند)
app.get('/', (req, res) => res.redirect('/index'));
app.get('/index', (req, res) => res.redirect('/index/fa'));

// ==============================
// STATIC PAGES
// ==============================

// Index page
app.get('/index/:lang', async (req, res) => {
    const operation = logger.startOperation('بارگذاری صفحه اصلی', { // ← شروع عملیات
        lang: req.params.lang
    });

    try {
        const lang = req.params.lang;
        const indexConfig = await readJsonFile(config.PATHS.indexData);

        const productsPaths = {
            fa: config.PATHS.productsFa,
            en: config.PATHS.productsEn
        };
        const productsPath = productsPaths[lang] || productsPaths.fa;
        const allProducts = await readJsonFile(productsPath);

        const showcaseCodes = indexConfig.top_products || [];
        const topProducts = [];

        showcaseCodes.forEach(code => {
            const entry = Object.entries(allProducts).find(([id, product]) => product.unique_code === code);
            if (entry) {
                const [id, product] = entry;
                topProducts.push({
                    id: id,
                    ...product
                });
            }
        });

        const finalProducts = topProducts.slice(0, config.TOP_PRODUCTS_MAX);
        
        // دیباگ در محیط توسعه (اختیاری)
        if (process.env.NODE_ENV !== 'production') {
            logger.debug(`محصولات برتر: ${finalProducts.length} محصول`, { 
                products: finalProducts.map(p => p.unique_code) 
            });
        }

        renderPage(req, res, 'index', req.params.lang, { topProducts: finalProducts });
        
        operation.end('success', { productCount: finalProducts.length }); // ← پایان موفق
    } catch (err) {
        logger.errorWithRequest(req, err, 'خطا در بارگذاری صفحه اصلی'); // ← لاگ خطا
        operation.end('failed', { error: err.message }); // ← پایان ناموفق
        res.status(500).render('err', { message: 'خطا در بارگذاری صفحه اصلی' });
    }
});

// Test error (لاگ خودش توسط Global error handler ثبت میشه)
app.get('/err', (req, res) => {
    throw new Error('This is a test error');
});

// About Us
app.get('/aboutus', (req, res) => res.redirect('/aboutus/fa'));
app.get('/aboutus/:lang', (req, res) => {
    try {
        renderPage(req, res, 'aboutus', req.params.lang);
    } catch (err) {
        logger.errorWithRequest(req, err, 'خطا در بارگذاری صفحه درباره ما');
        res.status(500).render('err');
    }
});

// Team
app.get('/team', (req, res) => res.redirect('/team/fa'));
app.get('/team/:lang', (req, res) => {
    try {
        renderPage(req, res, 'team', req.params.lang);
    } catch (err) {
        logger.errorWithRequest(req, err, 'خطا در بارگذاری صفحه تیم');
        res.status(500).render('err');
    }
});

// Wholesale
app.get('/wholesale', (req, res) => res.redirect('/wholesale/fa'));
app.get('/wholesale/:lang', (req, res) => {
    try {
        renderPage(req, res, 'wholesale', req.params.lang);
    } catch (err) {
        logger.errorWithRequest(req, err, 'خطا در بارگذاری صفحه عمده‌فروشی');
        res.status(500).render('err');
    }
});

// Products listing
app.get('/products', (req, res) => res.redirect('/products/fa'));
app.get('/products/:lang', (req, res) => {
    try {
        renderPage(req, res, 'products', req.params.lang);
    } catch (err) {
        logger.errorWithRequest(req, err, 'خطا در بارگذاری صفحه محصولات');
        res.status(500).render('err');
    }
});

// Single product
app.get('/product', (req, res) => res.redirect('/products'));
app.get('/product/:id', (req, res) => res.redirect(`/product/${req.params.id}/fa`));
app.get('/product/:id/:lang', validateId, async (req, res) => {
    const operation = logger.startOperation('بارگذاری محصول', { // ← شروع عملیات
        productId: req.params.id,
        lang: req.params.lang
    });

    try {
        const lang = req.params.lang;

        const productsPaths = {
            fa: config.PATHS.productsFa,
            en: config.PATHS.productsEn
        };

        const productsPath = productsPaths[lang] || productsPaths.fa;
        const products = await readJsonFile(productsPath);
        const product = products[req.params.id];

        if (!product) {
            logger.withRequest(req, `محصول با شناسه ${req.params.id} یافت نشد`); // ← لاگ با اطلاعات درخواست
            const errorMessage = lang === 'fa' ? 'محصول یافت نشد' : 'Product not found';
            operation.end('failed', { reason: 'not_found' }); // ← پایان ناموفق
            return res.status(404).render('404', { message: errorMessage });
        }

        logger.info(`محصول "${product.name}" با شناسه ${req.params.id} بارگذاری شد`); // ← لاگ موفقیت
        renderPage(req, res, 'product', lang, product);
        
        operation.end('success', { productName: product.name }); // ← پایان موفق
    } catch (err) {
        logger.errorWithRequest(req, err, `خطا در بارگذاری محصول ${req.params.id}`); // ← لاگ خطا
        operation.end('failed', { error: err.message }); // ← پایان ناموفق
        const errorMessage = req.params.lang === 'fa'
            ? 'خطا در بارگذاری محصول'
            : 'Error loading product';
        res.status(500).render('err', { message: errorMessage });
    }
});

// Contact
app.get('/contact', (req, res) => res.redirect('/contact/fa'));
app.get('/contact/:lang', (req, res) => {
    try {
        renderPage(req, res, 'contact', req.params.lang);
    } catch (err) {
        logger.errorWithRequest(req, err, 'خطا در بارگذاری صفحه تماس');
        res.status(500).render('err');
    }
});

// Trusted
app.get('/trusted', (req, res) => res.redirect('/trusted/fa'));
app.get('/trusted/:lang', (req, res) => {
    try {
        renderPage(req, res, 'trusted', req.params.lang);
    } catch (err) {
        logger.errorWithRequest(req, err, 'خطا در بارگذاری صفحه مورد اعتماد');
        res.status(500).render('err');
    }
});

// Partnership
app.get('/partnership', (req, res) => res.redirect('/partnership/fa'));
app.get('/partnership/:lang', (req, res) => {
    try {
        renderPage(req, res, 'partnership', req.params.lang);
    } catch (err) {
        logger.errorWithRequest(req, err, 'خطا در بارگذاری صفحه مشارکت');
        res.status(500).render('err');
    }
});

// Blogs listing
app.get('/blogs', (req, res) => res.redirect('/blogs/fa'));
app.get('/blogs/:lang', (req, res) => {
    try {
        renderPage(req, res, 'blogs', req.params.lang);
    } catch (err) {
        logger.errorWithRequest(req, err, 'خطا در بارگذاری صفحه بلاگ‌ها');
        res.status(500).render('err');
    }
});

// Single blog
app.get('/blog', (req, res) => res.redirect('/blogs'));
app.get('/blog/:id', (req, res) => res.redirect(`/blog/${req.params.id}/fa`));
app.get('/blog/:id/:lang', validateId, async (req, res) => {
    const operation = logger.startOperation('بارگذاری بلاگ', { // ← شروع عملیات
        blogId: req.params.id,
        lang: req.params.lang
    });

    try {
        const lang = req.params.lang;

        const blogsPaths = {
            fa: config.PATHS.blogsFa,
            en: config.PATHS.blogsEn
        };

        const blogsPath = blogsPaths[lang] || blogsPaths.fa;
        const blogs = await readJsonFile(blogsPath);
        const blog = blogs[req.params.id];

        if (!blog) {
            logger.withRequest(req, `بلاگ با شناسه ${req.params.id} یافت نشد`); // ← لاگ با اطلاعات درخواست
            const errorMessage = lang === 'fa' ? 'بلاگ یافت نشد' : 'Blog not found';
            operation.end('failed', { reason: 'not_found' }); // ← پایان ناموفق
            return res.status(404).render('404', { message: errorMessage });
        }

        logger.info(`بلاگ "${blog.title}" با شناسه ${req.params.id} بارگذاری شد`); // ← لاگ موفقیت
        renderPage(req, res, 'blog', lang, blog);
        
        operation.end('success', { blogTitle: blog.title }); // ← پایان موفق
    } catch (err) {
        logger.errorWithRequest(req, err, `خطا در بارگذاری بلاگ ${req.params.id}`); // ← لاگ خطا
        operation.end('failed', { error: err.message }); // ← پایان ناموفق
        const errorMessage = req.params.lang === 'fa'
            ? 'خطا در بارگذاری بلاگ'
            : 'Error loading blog';
        res.status(500).render('err', { message: errorMessage });
    }
});

// FAQ
app.get('/faq', (req, res) => res.redirect('/faq/fa'));
app.get('/faq/:lang', async (req, res) => {
    const operation = logger.startOperation('بارگذاری سوالات متداول', { // ← شروع عملیات
        lang: req.params.lang
    });

    try {
        const lang = req.params.lang;

        const faqsPaths = {
            fa: config.PATHS.faqsFa,
            en: config.PATHS.faqsEn
        };

        const faqsPath = faqsPaths[lang] || faqsPaths.fa;
        const faqs = await readJsonFile(faqsPath);

        if (!faqs || Object.keys(faqs).length === 0) {
            logger.withRequest(req, 'هیچ سوالی یافت نشد'); // ← لاگ با اطلاعات درخواست
            const errorMessage = lang === 'fa' ? 'سوالی یافت نشد' : 'No questions found';
            operation.end('failed', { reason: 'empty' }); // ← پایان ناموفق
            return res.status(404).render('404', { message: errorMessage });
        }

        logger.info(`تعداد ${Object.keys(faqs).length} سوال بارگذاری شد`); // ← لاگ موفقیت
        renderPage(req, res, 'faq', lang, faqs);
        
        operation.end('success', { questionCount: Object.keys(faqs).length }); // ← پایان موفق
    } catch (err) {
        logger.errorWithRequest(req, err, 'خطا در بارگذاری سوالات متداول'); // ← لاگ خطا
        operation.end('failed', { error: err.message }); // ← پایان ناموفق
        const errorMessage = req.params.lang === 'fa' 
            ? 'خطا در بارگذاری سوالات متداول' 
            : 'Error loading frequently asked questions';
        res.status(500).render('err', { message: errorMessage });
    }
});

// Custom order
app.get('/customorder', (req, res) => res.redirect('/customorder/fa'));
app.get('/customorder/:lang', (req, res) => {
    try {
        renderPage(req, res, 'customorder', req.params.lang);
    } catch (err) {
        logger.errorWithRequest(req, err, 'خطا در بارگذاری صفحه سفارش سفارشی');
        res.status(500).render('err');
    }
});

// ==============================
// ERROR HANDLING
// ==============================

// 404 handler
app.use((req, res) => {
    logger.withRequest(req, 'صفحه درخواستی یافت نشد'); // ← لاگ با اطلاعات درخواست
    res.status(404).render('404', { message: 'صفحه مورد نظر یافت نشد' });
});

// Global error handler
app.use((err, req, res, next) => {
    logger.errorWithRequest(req, err, 'خطای سراسری در برنامه'); // ← لاگ خطا با اطلاعات کامل
    res.status(500).render('err', { message: 'خطای داخلی سرور' });
});

// ==============================
// START SERVER
// ==============================

const PORT = config.PORT || 3000;
app.listen(PORT, () => {
    logger.info(`🚀 سرور روی پورت ${PORT} در حالت ${process.env.NODE_ENV || 'development'} اجرا شد`);
    logger.info(`📁 لاگ‌ها در پوشه logs/ ذخیره می‌شوند`);
});