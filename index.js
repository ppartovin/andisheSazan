// ============================================================
// IMPORTS & CONFIGURATION
// ============================================================

require('dotenv').config();

const express = require('express');
const { logger, morganMiddleware } = require('./logger');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const { readFile } = require('fs').promises;
const path = require('path');
const compression = require('compression');

const config = require('./config');

const app = express();

// ============================================================
// APPLICATION SETTINGS
// ============================================================

app.set('etag', 'strong');
app.set('view engine', 'ejs');

// ============================================================
// MIDDLEWARES
// ============================================================

app.use(morganMiddleware);
app.use(cookieParser());
app.use(express.json({ limit: '1mb', verify: config.jsonDepthVerify }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(helmet(config.helmetConfig));
app.use(compression());

// Static files
app.use('/public', express.static('public', {
    maxAge: 60 * 60 * 1000, // 1 hour
    immutable: true
}));

// Rate limiting (commented out)
/* app.use('/admin/login', config.loginLimiter);
app.use(config.limiterPerMinute);
app.use(config.limiterPer20Minutes); */

// ============================================================
// VALIDATION HELPERS
// ============================================================

/**
 * Validates that the request parameter 'id' is a positive integer
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {void}
 */
const validateId = (req, res, next) => {
    const id = req.params.id;
    if (!id || isNaN(parseInt(id)) || parseInt(id) <= 0) {
        logger.withRequest(req, `Invalid ID: ${id}`);
        return res.status(404).render('404', { message: 'Invalid ID' });
    }
    next();
};

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

/**
 * Renders a page with language and theme support
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {string} pageName - Base name of the view template
 * @param {string} lang - Language code ('fa' or 'en')
 * @param {Object} data - Data to pass to the view
 * @returns {void}
 */
const renderPage = (req, res, pageName, lang, data = {}) => {
    if (!config.VALID_LANGS.includes(lang)) {
        logger.withRequest(req, `Invalid language: ${lang} for page ${pageName}`);
        return res.redirect(`/${pageName}/fa`);
    }

    const theme = req.cookies?.light_status || 'day';
    const suffix = lang === 'en' ? 'En' : 'Fa';
    const viewName = `${pageName}${suffix}${theme === 'night' ? 'Ni' : ''}`;

    res.render(viewName, { data, lang, theme }, (err, html) => {
        if (err) {
            logger.errorWithRequest(req, err, `Error rendering page ${pageName}`);
            return res.status(404).render('404', { message: 'Page not found' });
        }
        res.send(html);
    });
};

// ============================================================
// ROUTES - REDIRECTS
// ============================================================

app.get('/', (req, res) => res.redirect('/index'));
app.get('/index', (req, res) => res.redirect('/index/fa'));

// ============================================================
// ROUTES - STATIC PAGES
// ============================================================

/**
 * GET /index/:lang
 * Renders the homepage with top products
 */
app.get('/index/:lang', async (req, res) => {
    const operation = logger.startOperation('Loading homepage', {
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

        if (process.env.NODE_ENV !== 'production') {
            logger.debug(`Top products: ${finalProducts.length} products`, {
                products: finalProducts.map(p => p.unique_code)
            });
        }

        renderPage(req, res, 'index', req.params.lang, { topProducts: finalProducts });

        operation.end('success', { productCount: finalProducts.length });
    } catch (err) {
        logger.errorWithRequest(req, err, 'Error loading homepage');
        operation.end('failed', { error: err.message });
        res.status(500).render('err', { message: 'Error loading homepage' });
    }
});

/**
 * GET /aboutus
 * GET /aboutus/:lang
 * Renders the about us page
 */
app.get('/aboutus', (req, res) => res.redirect('/aboutus/fa'));
app.get('/aboutus/:lang', (req, res) => {
    try {
        renderPage(req, res, 'aboutus', req.params.lang);
    } catch (err) {
        logger.errorWithRequest(req, err, 'Error loading about us page');
        res.status(500).render('err');
    }
});

/**
 * GET /team
 * GET /team/:lang
 * Renders the team page
 */
app.get('/team', (req, res) => res.redirect('/team/fa'));
app.get('/team/:lang', (req, res) => {
    try {
        renderPage(req, res, 'team', req.params.lang);
    } catch (err) {
        logger.errorWithRequest(req, err, 'Error loading team page');
        res.status(500).render('err');
    }
});

/**
 * GET /wholesale
 * GET /wholesale/:lang
 * Renders the wholesale page
 */
app.get('/wholesale', (req, res) => res.redirect('/wholesale/fa'));
app.get('/wholesale/:lang', (req, res) => {
    try {
        renderPage(req, res, 'wholesale', req.params.lang);
    } catch (err) {
        logger.errorWithRequest(req, err, 'Error loading wholesale page');
        res.status(500).render('err');
    }
});

/**
 * GET /contact
 * GET /contact/:lang
 * Renders the contact page
 */
app.get('/contact', (req, res) => res.redirect('/contact/fa'));
app.get('/contact/:lang', (req, res) => {
    try {
        renderPage(req, res, 'contact', req.params.lang);
    } catch (err) {
        logger.errorWithRequest(req, err, 'Error loading contact page');
        res.status(500).render('err');
    }
});

/**
 * GET /trusted
 * GET /trusted/:lang
 * Renders the trusted page
 */
app.get('/trusted', (req, res) => res.redirect('/trusted/fa'));
app.get('/trusted/:lang', (req, res) => {
    try {
        renderPage(req, res, 'trusted', req.params.lang);
    } catch (err) {
        logger.errorWithRequest(req, err, 'Error loading trusted page');
        res.status(500).render('err');
    }
});

/**
 * GET /partnership
 * GET /partnership/:lang
 * Renders the partnership page
 */
app.get('/partnership', (req, res) => res.redirect('/partnership/fa'));
app.get('/partnership/:lang', (req, res) => {
    try {
        renderPage(req, res, 'partnership', req.params.lang);
    } catch (err) {
        logger.errorWithRequest(req, err, 'Error loading partnership page');
        res.status(500).render('err');
    }
});

/**
 * GET /customorder
 * GET /customorder/:lang
 * Renders the custom order page
 */
app.get('/customorder', (req, res) => res.redirect('/customorder/fa'));
app.get('/customorder/:lang', (req, res) => {
    try {
        renderPage(req, res, 'customorder', req.params.lang);
    } catch (err) {
        logger.errorWithRequest(req, err, 'Error loading custom order page');
        res.status(500).render('err');
    }
});

// ============================================================
// ROUTES - PRODUCTS
// ============================================================

/**
 * GET /products
 * GET /products/:lang
 * Renders the products listing page
 */
app.get('/products', (req, res) => res.redirect('/products/fa'));
app.get('/products/:lang', (req, res) => {
    try {
        renderPage(req, res, 'products', req.params.lang);
    } catch (err) {
        logger.errorWithRequest(req, err, 'Error loading products page');
        res.status(500).render('err');
    }
});

/**
 * GET /product
 * GET /product/:id
 * GET /product/:id/:lang
 * Renders a single product page
 */
app.get('/product', (req, res) => res.redirect('/products'));
app.get('/product/:id', (req, res) => res.redirect(`/product/${req.params.id}/fa`));
app.get('/product/:id/:lang', validateId, async (req, res) => {
    const operation = logger.startOperation('Loading product', {
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
            logger.withRequest(req, `Product with ID ${req.params.id} not found`);
            const errorMessage = lang === 'fa' ? 'Product not found' : 'Product not found';
            operation.end('failed', { reason: 'not_found' });
            return res.status(404).render('404', { message: errorMessage });
        }

        logger.info(`Product "${product.name}" with ID ${req.params.id} loaded`);
        renderPage(req, res, 'product', lang, product);

        operation.end('success', { productName: product.name });
    } catch (err) {
        logger.errorWithRequest(req, err, `Error loading product ${req.params.id}`);
        operation.end('failed', { error: err.message });
        const errorMessage = req.params.lang === 'fa'
            ? 'Error loading product'
            : 'Error loading product';
        res.status(500).render('err', { message: errorMessage });
    }
});

// ============================================================
// ROUTES - BLOGS
// ============================================================

/**
 * GET /blogs
 * GET /blogs/:lang
 * Renders the blogs listing page
 */
app.get('/blogs', (req, res) => res.redirect('/blogs/fa'));
app.get('/blogs/:lang', (req, res) => {
    try {
        renderPage(req, res, 'blogs', req.params.lang);
    } catch (err) {
        logger.errorWithRequest(req, err, 'Error loading blogs page');
        res.status(500).render('err');
    }
});

/**
 * GET /blog
 * GET /blog/:id
 * GET /blog/:id/:lang
 * Renders a single blog post page
 */
app.get('/blog', (req, res) => res.redirect('/blogs'));
app.get('/blog/:id', (req, res) => res.redirect(`/blog/${req.params.id}/fa`));
app.get('/blog/:id/:lang', validateId, async (req, res) => {
    const operation = logger.startOperation('Loading blog', {
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
            logger.withRequest(req, `Blog with ID ${req.params.id} not found`);
            const errorMessage = lang === 'fa' ? 'Blog not found' : 'Blog not found';
            operation.end('failed', { reason: 'not_found' });
            return res.status(404).render('404', { message: errorMessage });
        }

        logger.info(`Blog "${blog.title}" with ID ${req.params.id} loaded`);
        renderPage(req, res, 'blog', lang, blog);

        operation.end('success', { blogTitle: blog.title });
    } catch (err) {
        logger.errorWithRequest(req, err, `Error loading blog ${req.params.id}`);
        operation.end('failed', { error: err.message });
        const errorMessage = req.params.lang === 'fa'
            ? 'Error loading blog'
            : 'Error loading blog';
        res.status(500).render('err', { message: errorMessage });
    }
});

// ============================================================
// ROUTES - FAQ
// ============================================================

/**
 * GET /faq
 * GET /faq/:lang
 * Renders the frequently asked questions page
 */
app.get('/faq', (req, res) => res.redirect('/faq/fa'));
app.get('/faq/:lang', async (req, res) => {
    const operation = logger.startOperation('Loading FAQ', {
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
            logger.withRequest(req, 'No questions found');
            const errorMessage = lang === 'fa' ? 'No questions found' : 'No questions found';
            operation.end('failed', { reason: 'empty' });
            return res.status(404).render('404', { message: errorMessage });
        }

        logger.info(`${Object.keys(faqs).length} questions loaded`);
        renderPage(req, res, 'faq', lang, faqs);

        operation.end('success', { questionCount: Object.keys(faqs).length });
    } catch (err) {
        logger.errorWithRequest(req, err, 'Error loading FAQ');
        operation.end('failed', { error: err.message });
        const errorMessage = req.params.lang === 'fa'
            ? 'Error loading frequently asked questions'
            : 'Error loading frequently asked questions';
        res.status(500).render('err', { message: errorMessage });
    }
});

// ============================================================
// ROUTES - ERROR TEST
// ============================================================

/**
 * GET /err
 * Test endpoint that throws an error for testing the error handler
 */
app.get('/err', (req, res) => {
    throw new Error('This is a test error');
});

// ============================================================
// ADMIN & API ROUTES
// ============================================================

const adminRoutes = require('./routes/admin');
app.use('/admin', adminRoutes);

const apiRoutes = require('./routes/api');
app.use('/api', apiRoutes);

// ============================================================
// ERROR HANDLING
// ============================================================

/**
 * 404 Not Found handler
 * Catches all unmatched routes
 */
app.use((req, res) => {
    logger.withRequest(req, 'Requested page not found');
    res.status(404).render('404', { message: 'Page not found' });
});

/**
 * Global error handler
 * Catches all unhandled errors
 */
app.use((err, req, res, next) => {
    logger.errorWithRequest(req, err, 'Global application error');
    res.status(500).render('err', { message: 'Internal server error' });
});

// ============================================================
// SERVER INITIALIZATION
// ============================================================

const PORT = config.PORT || 3000;
app.listen(PORT, () => {
    logger.info(`🚀 Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
    logger.info(`📁 Logs are stored in the logs/ directory`);
});