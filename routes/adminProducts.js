const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');

const SECRET_KEY = process.env.JWT_SECRET || 'your-secret-key';

// ==============================
// TOKEN FUNCTIONS (دوباره تعریف یا import)
// ==============================

function verifyToken(token) {
    try {
        return jwt.verify(token, SECRET_KEY);
    } catch (err) {
        return null;
    }
}

// ==============================
// MIDDLEWARE: Check Token
// ==============================

function checkToken(req, res, next) {
    const token = req.cookies?.adminToken;

    if (!token || !verifyToken(token)) {
        return res.redirect('/admin/login');
    }

    req.user = verifyToken(token);
    next();
}

// ==============================
// PRODUCT ROUTES
// ==============================

// لیست محصولات
router.get('/', checkToken, (req, res) => {
    const productsPath = path.join(__dirname, '..', 'data', 'products.json');
    const productsData = fs.readFileSync(productsPath, 'utf8');
    const productsObj = JSON.parse(productsData);

    const products = Object.entries(productsObj).map(([id, item]) => ({
        id,
        ...item
    }));

    res.render('adminProducts', { products });
});

// فرم افزودن محصول
router.get('/add', checkToken, (req, res) => {
    res.render('adminProductsAdd', { error: null });
});

// ذخیره محصول جدید
router.post('/add', checkToken, (req, res) => {
    const { title, subtitle, price, description, image } = req.body;

    if (!title || title.trim() === '') {
        return res.render('adminProductsAdd', { error: 'عنوان محصول الزامی است' });
    }

    const productsPath = path.join(__dirname, '..', 'data', 'products.json');
    const productsData = fs.readFileSync(productsPath, 'utf8');
    const products = JSON.parse(productsData);

    const ids = Object.keys(products).map(Number);
    const nextId = ids.length > 0 ? Math.max(...ids) + 1 : 1;

    products[nextId] = {
        title: title.trim(),
        subtitle: subtitle || '',
        price: price || '',
        description: description || '',
        image: image || ''
    };

    fs.writeFileSync(productsPath, JSON.stringify(products, null, 2));
    res.redirect('/admin/products');
});

// فرم ویرایش محصول
router.get('/edit/:id', checkToken, (req, res) => {
    const productId = req.params.id;
    const productsPath = path.join(__dirname, '..', 'data', 'products.json');
    const productsData = fs.readFileSync(productsPath, 'utf8');
    const products = JSON.parse(productsData);

    const product = products[productId];

    if (!product) {
        return res.redirect('/admin/products');
    }

    res.render('adminProductsEdit', { product: { id: productId, ...product } });
});

// ذخیره ویرایش محصول
router.post('/edit/:id', checkToken, (req, res) => {
    const productId = req.params.id;
    const { title, subtitle, price, description, image } = req.body;

    const productsPath = path.join(__dirname, '..', 'data', 'products.json');
    const productsData = fs.readFileSync(productsPath, 'utf8');
    const products = JSON.parse(productsData);

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

    fs.writeFileSync(productsPath, JSON.stringify(products, null, 2));
    res.redirect('/admin/products');
});

// حذف محصول
router.get('/delete/:id', checkToken, (req, res) => {
    const productId = req.params.id;
    const productsPath = path.join(__dirname, '..', 'data', 'products.json');

    const productsData = fs.readFileSync(productsPath, 'utf8');
    const products = JSON.parse(productsData);

    delete products[productId];

    fs.writeFileSync(productsPath, JSON.stringify(products, null, 2));
    res.redirect('/admin/products');
});

module.exports = router;