// Load environment variables from .env file
require('dotenv').config();

// Import required modules
const express = require('express');
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
app.use(config.limiterPer30Minutes); */


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
        return res.status(404).render('404', { message: 'شناسه نامعتبر است' });
    }
    next();
};

// ==============================
// HELPERS
// ==============================

const renderPage = (req,res, pageName, lang, data = {}) => {
    if (!config.VALID_LANGS.includes(lang)) {
        return res.redirect(`/${pageName}/fa`);
    }

    const theme = req.cookies?.light_status || 'day';

    const suffix = lang === 'en' ? 'En' : 'Fa';
    const viewName = `${pageName}${suffix}${theme === 'night' ? 'Ni' : ''}`;

    res.render(viewName, { data, lang, theme}, (err, html) => {
        if (err) {
            return res.status(404).render('404', { message: 'Page not found' });
        }
        res.send(html);
    });
};

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
// ROUTES
// ==============================

// Admin & API routes
const adminRoutes = require('./routes/admin');
app.use('/admin', adminRoutes);

const apiRoutes = require('./routes/api');
const { error } = require('console');
app.use('/api', apiRoutes);

// Redirects
app.get('/', (req, res) => res.redirect('/index'));
app.get('/index', (req, res) => res.redirect('/index/fa'));

// ==============================
// STATIC PAGES
// ==============================

// Index page
app.get('/index/:lang', async (req, res) => {
    try {
        const lang = req.params.lang;
        const indexConfig = await readJsonFile(config.PATHS.indexData);

        // Product file paths based on language
        const productsPaths = {
            fa: config.PATHS.productsFa,
            en: config.PATHS.productsEn
        };
        const productsPath = productsPaths[lang] || productsPaths.fa;
        const allProducts = await readJsonFile(productsPath);

        const showcaseCodes = indexConfig.top_products || [];
        const topProducts = [];

        // پیدا کردن محصولات با id
        showcaseCodes.forEach(code => {
            // پیدا کردن کلید (id) برای هر unique_code
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
        console.log(finalProducts);
        renderPage(req,res, 'index', req.params.lang, { topProducts: finalProducts });
    } catch (err) {
        console.error('Index page error:', err.message);
        res.status(500).render('err', { message: 'خطا در بارگذاری صفحه اصلی' });
    }
});

app.get('/err', (req, res) => {
    throw new Error('This is a test error');
});

// About Us
app.get('/aboutus', (req, res) => res.redirect('/aboutus/fa'));
app.get('/aboutus/:lang', (req, res) => {
    try {
        renderPage(req,res, 'aboutus', req.params.lang);
    } catch (err) {
        console.error('AboutUs error:', err.message);
        res.status(500).render('err');
    }
});

// Team
app.get('/team', (req, res) => res.redirect('/team/fa'));
app.get('/team/:lang', (req, res) => {
    try {
        renderPage(req,res, 'team', req.params.lang);
    } catch (err) {
        console.error('Team error:', err.message);
        res.status(500).render('err');
    }
});

// Wholesale
app.get('/wholesale', (req, res) => res.redirect('/wholesale/fa'));
app.get('/wholesale/:lang', (req, res) => {
    try {
        renderPage(req,res, 'wholesale', req.params.lang);
    } catch (err) {
        console.error('Wholesale error:', err.message);
        res.status(500).render('err');
    }
});

// Products listing
app.get('/products', (req, res) => res.redirect('/products/fa'));
app.get('/products/:lang', (req, res) => {
    try {
        renderPage(req,res, 'products', req.params.lang);
    } catch (err) {
        console.error('Products listing error:', err.message);
        res.status(500).render('err');
    }
});

// Single product
app.get('/product', (req, res) => res.redirect('/products'));
app.get('/product/:id', (req, res) => res.redirect(`/product/${req.params.id}/fa`));
app.get('/product/:id/:lang', validateId, async (req, res) => {
    try {
        const lang = req.params.lang;

        // Product file paths based on language
        const productsPaths = {
            fa: config.PATHS.productsFa,
            en: config.PATHS.productsEn
        };

        // Select appropriate path, default to Persian if language is invalid
        const productsPath = productsPaths[lang] || productsPaths.fa;

        const products = await readJsonFile(productsPath);
        const product = products[req.params.id];

        if (!product) {
            const errorMessage = lang === 'fa' ? 'محصول یافت نشد' : 'Product not found';
            return res.status(404).render('404', { message: errorMessage });
        }

        renderPage(req,res, 'product', lang, product);
    } catch (err) {
        console.error('Product error:', err.message);
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
        renderPage(req,res, 'contact', req.params.lang);
    } catch (err) {
        console.error('Contact error:', err.message);
        res.status(500).render('err');
    }
});

// Trusted
app.get('/trusted', (req, res) => res.redirect('/trusted/fa'));
app.get('/trusted/:lang', (req, res) => {
    try {
        renderPage(req,res, 'trusted', req.params.lang);
    } catch (err) {
        console.error('Trusted error:', err.message);
        res.status(500).render('err');
    }
});

// Partnership
app.get('/partnership', (req, res) => res.redirect('/partnership/fa'));
app.get('/partnership/:lang', (req, res) => {
    try {
        renderPage(req,res, 'partnership', req.params.lang);
    } catch (err) {
        console.error('Partnership error:', err.message);
        res.status(500).render('err');
    }
});

// Blogs listing
app.get('/blogs', (req, res) => res.redirect('/blogs/fa'));
app.get('/blogs/:lang', (req, res) => {
    try {
        renderPage(req,res, 'blogs', req.params.lang);
    } catch (err) {
        console.error('Blogs listing error:', err.message);
        res.status(500).render('err');
    }
});

// Single blog
app.get('/blog', (req, res) => res.redirect('/blogs'));
app.get('/blog/:id', (req, res) => res.redirect(`/blog/${req.params.id}/fa`));
app.get('/blog/:id/:lang', validateId, async (req, res) => {
    try {
        const lang = req.params.lang;

        // مسیرهای فایل بر اساس زبان
        const blogsPaths = {
            fa: config.PATHS.blogsFa,
            en: config.PATHS.blogsEn
        };

        // انتخاب مسیر مناسب، در صورت نامعتبر بودن زبان => فارسی
        const blogsPath = blogsPaths[lang] || blogsPaths.fa;

        const blogs = await readJsonFile(blogsPath);
        const blog = blogs[req.params.id];

        if (!blog) {
            const errorMessage = lang === 'fa' ? 'بلاگ یافت نشد' : 'Blog not found';
            return res.status(404).render('404', { message: errorMessage });
        }

        renderPage(req,res, 'blog', lang, blog);
    } catch (err) {
        console.error('Blog error:', err.message);
        const errorMessage = req.params.lang === 'fa'
            ? 'خطا در بارگذاری بلاگ'
            : 'Error loading blog';
        res.status(500).render('err', { message: errorMessage });
    }
});

// FAQ
app.get('/faq', (req, res) => res.redirect('/faq/fa'));
app.get('/faq/:lang', async (req, res) => {
    console.log("test")
    try {
        const lang = req.params.lang;
        
        
        // مسیرهای فایل بر اساس زبان
        const faqsPaths = {
            fa: config.PATHS.faqsFa,
            en: config.PATHS.faqsEn
        };
        
        // انتخاب مسیر مناسب، در صورت نامعتبر بودن زبان => فارسی
        const faqsPath = faqsPaths[lang] || faqsPaths.fa;

        

        const faqs = await readJsonFile(faqsPath);

        if (!faqs || Object.keys(faqs).length === 0) {
            const errorMessage = lang === 'fa' ? 'سوالی یافت نشد' : 'No questions found';
            return res.status(404).render('404', { message: errorMessage });
        }

        renderPage(req,res, 'faq', lang, faqs);
    } catch (err) {
        console.error('FAQ error:', err.message);
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
        renderPage(req,res, 'customorder', req.params.lang);
    } catch (err) {
        console.error('Custom order error:', err.message);
        res.status(500).render('err');
    }
});

// ==============================
// ERROR HANDLING
// ==============================

// 404 handler
app.use((req, res) => {
    res.status(404).render('404', { message: 'صفحه مورد نظر یافت نشد' });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('Global error:', err.stack);
    res.status(500).render('err', { message: 'خطای داخلی سرور' });
});

// ==============================
// START SERVER
// ==============================

const PORT = config.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));