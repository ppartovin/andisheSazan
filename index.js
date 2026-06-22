// Load environment variables from .env file
require('dotenv').config();

// Import required modules
const express = require('express');
const helmet = require('helmet');
const fs = require('fs');
const path = require('path');

const app = express();

// ==============================
// MIDDLEWARE & CONFIGURATION
// ==============================

// Security middleware (currently commented out)
// app.use(helmet());

// Set EJS as the view engine
app.set('view engine', 'ejs');

// Serve static files from the 'public' directory
app.use('/public', express.static('public'));

// ==============================
// HELPER FUNCTIONS
// ==============================

/**
 * Render a page with language support
 * @param {Object} res - Express response object
 * @param {string} pageName - Base name of the view file
 * @param {string} lang - Language code ('en' or 'fa')
 * @param {Object} data - Data to pass to the view
 */
const renderPage = (res, pageName, lang, data = {}) => {
    // Determine language suffix: 'En' for English, 'Fa' for Persian (default)
    const suffix = (lang === 'en') ? 'En' : 'Fa';
    const viewName = `${pageName}${suffix}`;
    console.log('render:', viewName);

    // Render the view with error handling
    res.render(viewName, { data, lang }, (err, html) => {
        if (err) {
            // If view file doesn't exist, render 404 page
            console.log(data.product);
            return res.status(404).render('404', { message: 'Page not found' });
        }
        res.send(html);
    });
};

// ==============================
// ROUTES - STATIC PAGES
// ==============================

// Redirect root to index
app.get('/', (req, res) => res.reedirect('/index'));

// Index page
app.get('/index', (req, res) => res.redirect('/index/fa'));
app.get('/index/:lang', (req, res) => renderPage(res, 'index', req.params.lang));

// About Us page
app.get('/aboutus', (req, res) => res.redirect('/aboutus/fa'));
app.get('/aboutus/:lang', (req, res) => {
    console.log('aboutus');
    renderPage(res, 'aboutus', req.params.lang);
});

// Team page
app.get('/team', (req, res) => res.redirect('/team/fa'));
app.get('/team/:lang', (req, res) => renderPage(res, 'team', req.params.lang));

// Wholesale page
app.get('/wholesale', (req, res) => res.redirect('/wholesale/fa'));
app.get('/wholesale/:lang', (req, res) => renderPage(res, 'wholesale', req.params.lang));

// Products listing page
app.get('/products', (req, res) => res.redirect('/products/fa'));
app.get('/products/:lang', (req, res) => {
    renderPage(res, 'products', req.params.lang);
});

// Individual product page with dynamic ID
app.get('/product', (req, res) => res.redirect('/products'));
app.get('/product/:id', (req, res) => res.redirect(`/product/${req.params.id}/fa`));
app.get('/product/:id/:lang', (req, res) => {
    const id = req.params.id;

    // Read product data from JSON file
    fs.readFile(path.join(__dirname, 'data', 'products.json'), 'utf8', (err, data) => {
        if (err) {
            console.log('err');
            console.error(err.stack);
            return res.status(500).render('err');
        }

        const products = JSON.parse(data);
        const product = products[id];

        if (!product) {
            return res.status(404).render('404');
        }

        return renderPage(res, 'product', req.params.lang, product);
    });
});

// Contact page
app.get('/contact', (req, res) => res.redirect('/contact/fa'));
app.get('/contact/:lang', (req, res) => renderPage(res, 'contact', req.params.lang));

// Trusted clients page
app.get('/trusted', (req, res) => res.redirect('/trusted/fa'));
app.get('/trusted/:lang', (req, res) => renderPage(res, 'trusted', req.params.lang));

// Partnership / Career page
app.get('/partnership', (req, res) => res.redirect('/career/fa'));
app.get('/partnership/:lang', (req, res) => {
    console.log('partnership');
    renderPage(res, 'partnership', req.params.lang);
});

// Blogs listing page
app.get('/blogs', (req, res) => res.redirect('/blogs/fa'));
app.get('/blogs/:lang', (req, res) => renderPage(res, 'blogs', req.params.lang));

// Individual blog post with dynamic ID
app.get('/blog', (req, res) => res.redirect('/blogs'));
app.get('/blog/:id', (req, res) => res.redirect(`/blog/${req.params.id}/fa`));
app.get('/blog/:id/:lang', (req, res) => {
    const id = req.params.id;

    // Read blog data from JSON file
    fs.readFile(path.join(__dirname, 'data', 'blogs.json'), 'utf8', (err, data) => {
        if (err) {
            console.log('err');
            console.error(err.stack);
            return res.status(500).render('err');
        }

        const blogs = JSON.parse(data);
        const blog = blogs[id];

        if (!blog) {
            return res.status(404).render('404');
        }

        return renderPage(res, 'blog', req.params.lang, blog);
    });
});

// FAQ page
app.get('/faq', (req, res) => res.redirect('/faq/fa'));
app.get('/faq/:lang', (req, res) => {
    // Read FAQ data from JSON file
    fs.readFile(path.join(__dirname, 'data', 'faqs.json'), 'utf8', (err, data) => {
        if (err) {
            console.log('err');
            console.error(err.stack);
            return res.status(500).render('err');
        }

        const faqs = JSON.parse(data);

        if (!faqs) {
            return res.status(404).render('404');
        }

        return renderPage(res, 'faq', req.params.lang, faqs);
    });
});

// Custom order page
app.get('/customorder', (req, res) => res.redirect('/customorder/fa'));
app.get('/customorder/:lang', (req, res) => renderPage(res, 'customorder', req.params.lang));

// ==============================
// API ROUTES
// ==============================

/**
 * API endpoint for paginated products
 * Query params: ?page=1 (default)
 * Returns 10 products per page with hasMore flag
 */
app.get('/api/products', (req, res) => {
    fs.readFile(path.join(__dirname, 'data', 'products.json'), 'utf8', (err, data) => {
        const allProducts = Object.values(JSON.parse(data));
        const page = parseInt(req.query.page) || 1;
        const limit = 10;
        const startIndex = (page - 1) * limit;
        const endIndex = page * limit;

        // Slice products and add dynamic link for each
        const results = allProducts
            .slice(startIndex, endIndex)
            .map((product, index) => ({
                ...product,
                link: `/product/${startIndex + index + 1}/fa`
            }));

        console.log(results);
        res.json({
            products: results,
            hasMore: endIndex < allProducts.length
        });
    });
});

// Pagination limit for blog posts
const POSTS_PER_PAGE = 5;

/**
 * API endpoint for paginated blog posts
 * @param {number} page - Page number (1-indexed)
 * Returns 5 posts per page with hasMore flag
 */
app.get('/api/blogs/:page', (req, res) => {
    fs.readFile(path.join(__dirname, 'data', 'blogs.json'), 'utf8', (err, data) => {
        const blogs = Object.values(JSON.parse(data));

        const page = parseInt(req.params.page) || 1;
        const start = (page - 1) * POSTS_PER_PAGE;
        const end = start + POSTS_PER_PAGE;

        // Slice blogs and add dynamic link for each
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
    });
});

// ==============================
// ERROR HANDLING
// ==============================

// 404 handler for undefined routes
app.use((req, res, next) => {
    console.log('404');
    res.status(404).render('404');
});

// Global error handler (500 Internal Server Error)
app.use((err, req, res, next) => {
    console.log('err');
    console.error(err.stack);
    res.status(500).render('err');
});

// ==============================
// START SERVER
// ==============================

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));