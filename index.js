// Load environment variables from .env file
require('dotenv').config();

// Import required modules
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const { readFile } = require('fs').promises;
const path = require('path');

const app = express();

// ==============================
// MIDDLEWARES
// ==============================

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(helmet());

// View engine
app.set('view engine', 'ejs');

// Static files
app.use('/public', express.static('public'));

// ==============================
// CONSTANTS
// ==============================

const DATA_DIR = path.join(__dirname, 'data');
const PATHS = {
    products: path.join(DATA_DIR, 'products.json'),
    blogs: path.join(DATA_DIR, 'blogs.json'),
    faqs: path.join(DATA_DIR, 'faqs.json'),
    indexData: path.join(DATA_DIR, 'index_data.json')
};
const POSTS_PER_PAGE = 5;
const TOP_PRODUCTS_MAX = 6;

// ==============================
// HELPERS
// ==============================

const renderPage = (res, pageName, lang, data = {}) => {
    const suffix = lang === 'en' ? 'En' : 'Fa';
    const viewName = `${pageName}${suffix}`;

    res.render(viewName, { data, lang }, (err, html) => {
        if (err) {
            return res.status(404).render('404', { message: 'Page not found' });
        }
        res.send(html);
    });
};

const readJsonFile = async (filePath) => {
    const content = await readFile(filePath, 'utf8');
    return JSON.parse(content);
};

// ==============================
// ROUTES
// ==============================

// Admin routes
const adminRoutes = require('./routes/admin');
app.use('/admin', adminRoutes);

// API routes
const apiRoutes = require('./routes/api');
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
        const indexConfig = await readJsonFile(PATHS.indexData);
        const allProducts = await readJsonFile(PATHS.products);

        const topProductIds = indexConfig.top_products || [];
        let topProducts = topProductIds
            .filter(id => allProducts[id])
            .map(id => ({ id, ...allProducts[id] }))
            .slice(0, TOP_PRODUCTS_MAX);

        renderPage(res, 'index', req.params.lang, { topProducts });
    } catch (err) {
        console.error(err);
        res.status(500).render('err');
    }
});

// About Us
app.get('/aboutus', (req, res) => res.redirect('/aboutus/fa'));
app.get('/aboutus/:lang', (req, res) => renderPage(res, 'aboutus', req.params.lang));

// Team
app.get('/team', (req, res) => res.redirect('/team/fa'));
app.get('/team/:lang', (req, res) => renderPage(res, 'team', req.params.lang));

// Wholesale
app.get('/wholesale', (req, res) => res.redirect('/wholesale/fa'));
app.get('/wholesale/:lang', (req, res) => renderPage(res, 'wholesale', req.params.lang));

// Products listing
app.get('/products', (req, res) => res.redirect('/products/fa'));
app.get('/products/:lang', (req, res) => renderPage(res, 'products', req.params.lang));

// Single product
app.get('/product', (req, res) => res.redirect('/products'));
app.get('/product/:id', (req, res) => res.redirect(`/product/${req.params.id}/fa`));
app.get('/product/:id/:lang', async (req, res) => {
    try {
        const products = await readJsonFile(PATHS.products);
        const product = products[req.params.id];

        if (!product) {
            return res.status(404).render('404');
        }

        renderPage(res, 'product', req.params.lang, product);
    } catch (err) {
        console.error(err);
        res.status(500).render('err');
    }
});

// Contact
app.get('/contact', (req, res) => res.redirect('/contact/fa'));
app.get('/contact/:lang', (req, res) => renderPage(res, 'contact', req.params.lang));

// Trusted
app.get('/trusted', (req, res) => res.redirect('/trusted/fa'));
app.get('/trusted/:lang', (req, res) => renderPage(res, 'trusted', req.params.lang));

// Partnership
app.get('/partnership', (req, res) => res.redirect('/partnership/fa'));
app.get('/partnership/:lang', (req, res) => renderPage(res, 'partnership', req.params.lang));

// Blogs listing
app.get('/blogs', (req, res) => res.redirect('/blogs/fa'));
app.get('/blogs/:lang', (req, res) => renderPage(res, 'blogs', req.params.lang));

// Single blog
app.get('/blog', (req, res) => res.redirect('/blogs'));
app.get('/blog/:id', (req, res) => res.redirect(`/blog/${req.params.id}/fa`));
app.get('/blog/:id/:lang', async (req, res) => {
    try {
        const blogs = await readJsonFile(PATHS.blogs);
        const blog = blogs[req.params.id];

        if (!blog) {
            return res.status(404).render('404');
        }

        renderPage(res, 'blog', req.params.lang, blog);
    } catch (err) {
        console.error(err);
        res.status(500).render('err');
    }
});

// FAQ
app.get('/faq', (req, res) => res.redirect('/faq/fa'));
app.get('/faq/:lang', async (req, res) => {
    try {
        const faqs = await readJsonFile(PATHS.faqs);

        if (!faqs) {
            return res.status(404).render('404');
        }

        renderPage(res, 'faq', req.params.lang, faqs);
    } catch (err) {
        console.error(err);
        res.status(500).render('err');
    }
});

// Custom order
app.get('/customorder', (req, res) => res.redirect('/customorder/fa'));
app.get('/customorder/:lang', (req, res) => renderPage(res, 'customorder', req.params.lang));

// ==============================
// ERROR HANDLING
// ==============================

app.use((req, res) => {
    res.status(404).render('404');
});

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).render('err');
});

// ==============================
// START SERVER
// ==============================

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));