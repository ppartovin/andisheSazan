const express = require('express');
const router = express.Router();
const { readFile, writeFile } = require('fs').promises;
const path = require('path');
const jwt = require('jsonwebtoken');

const SECRET_KEY = process.env.JWT_SECRET || 'your-secret-key';

// ==============================
// CONSTANTS
// ==============================

const DATA_DIR = path.join(__dirname, '..', 'data');
const PRODUCTS_PATH = path.join(DATA_DIR, 'products.json');

// ==============================
// HELPERS
// ==============================

const readJsonFile = async (filePath) => {
    const content = await readFile(filePath, 'utf8');
    return JSON.parse(content);
};

const writeJsonFile = async (filePath, data) => {
    await writeFile(filePath, JSON.stringify(data, null, 2));
};

const reindexItems = (items) => {
    const newItems = {};
    let counter = 1;
    Object.values(items).forEach(item => {
        newItems[counter] = item;
        counter++;
    });
    return newItems;
};

// ==============================
// TOKEN FUNCTIONS
// ==============================

const verifyToken = (token) => {
    try {
        return jwt.verify(token, SECRET_KEY);
    } catch {
        return null;
    }
};

// ==============================
// MIDDLEWARE: Check Token
// ==============================

const checkToken = (req, res, next) => {
    const token = req.cookies?.adminToken;

    if (!token || !verifyToken(token)) {
        return res.redirect('/admin/login');
    }

    req.user = verifyToken(token);
    next();
};

// ==============================
// ROUTES
// ==============================

// List all products
router.get('/', checkToken, async (req, res) => {
    try {
        const productsObj = await readJsonFile(PRODUCTS_PATH);
        const products = Object.entries(productsObj).map(([id, item]) => ({
            id,
            ...item
        }));

        res.render('adminPanel/adminProducts', { products });
    } catch (err) {
        console.error(err);
        res.status(500).render('err');
    }
});

// Show add form
router.get('/add', checkToken, (req, res) => {
    res.render('adminPanel/adminProductsAdd', { error: null });
});

// Add new product
router.post('/add', checkToken, async (req, res) => {
    try {
        const { title, subtitle, price, description, image } = req.body;

        if (!title || title.trim() === '') {
            return res.render('adminPanel/adminProductsAdd', { error: 'عنوان محصول الزامی است' });
        }

        const products = await readJsonFile(PRODUCTS_PATH);

        const ids = Object.keys(products).map(Number);
        const nextId = ids.length > 0 ? Math.max(...ids) + 1 : 1;

        products[nextId] = {
            title: title.trim(),
            subtitle: subtitle || '',
            price: price || '',
            description: description || '',
            image: image || ''
        };

        const reindexedProducts = reindexItems(products);
        await writeJsonFile(PRODUCTS_PATH, reindexedProducts);

        res.redirect('/admin/products');

    } catch (err) {
        console.error(err);
        res.status(500).render('err');
    }
});

// Show edit form
router.get('/edit/:id', checkToken, async (req, res) => {
    try {
        const productId = req.params.id;
        const products = await readJsonFile(PRODUCTS_PATH);
        const product = products[productId];

        if (!product) {
            return res.redirect('/admin/products');
        }

        res.render('adminPanel/adminProductsEdit', { product: { id: productId, ...product } });

    } catch (err) {
        console.error(err);
        res.status(500).render('err');
    }
});

// Update product
router.post('/edit/:id', checkToken, async (req, res) => {
    try {
        const productId = req.params.id;
        const { title, subtitle, price, description, image } = req.body;

        const products = await readJsonFile(PRODUCTS_PATH);

        if (!products[productId]) {
            return res.redirect('/admin/products');
        }

        products[productId] = {
            ...products[productId],
            title: title || products[productId].title,
            subtitle: subtitle || products[productId].subtitle || '',
            price: price || products[productId].price || '',
            description: description || products[productId].description || '',
            image: image || products[productId].image || ''
        };

        const reindexedProducts = reindexItems(products);
        await writeJsonFile(PRODUCTS_PATH, reindexedProducts);

        res.redirect('/admin/products');

    } catch (err) {
        console.error(err);
        res.status(500).render('err');
    }
});

// Delete product
router.get('/delete/:id', checkToken, async (req, res) => {
    try {
        const productId = req.params.id;
        const products = await readJsonFile(PRODUCTS_PATH);

        delete products[productId];

        const reindexedProducts = reindexItems(products);
        await writeJsonFile(PRODUCTS_PATH, reindexedProducts);

        res.redirect('/admin/products');

    } catch (err) {
        console.error(err);
        res.status(500).render('err');
    }
});

module.exports = router;