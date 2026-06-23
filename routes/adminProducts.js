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

const writeJsonFile = async (filePath, data) => {
    try {
        await writeFile(filePath, JSON.stringify(data, null, 2));
    } catch (err) {
        throw new Error(`Failed to write file: ${filePath}`);
    }
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
        console.error('Products list error:', err.message);
        res.status(500).render('err', { message: 'خطا در بارگذاری لیست محصولات' });
    }
});

// Show add form
router.get('/add', checkToken, (req, res) => {
    try {
        res.render('adminPanel/adminProductsAdd', { error: null });
    } catch (err) {
        console.error('Add form error:', err.message);
        res.status(500).render('err');
    }
});

// Add new product
router.post('/add', checkToken, async (req, res) => {
    try {
        const { title, subtitle, price, description, image } = req.body;

        // اعتبارسنجی
        if (!title || title.trim() === '') {
            return res.render('adminPanel/adminProductsAdd', { 
                error: 'عنوان محصول الزامی است' 
            });
        }

        if (title.length > 200) {
            return res.render('adminPanel/adminProductsAdd', { 
                error: 'عنوان محصول نباید بیشتر از ۲۰۰ کاراکتر باشد' 
            });
        }

        const products = await readJsonFile(PRODUCTS_PATH);

        const ids = Object.keys(products).map(Number);
        const nextId = ids.length > 0 ? Math.max(...ids) + 1 : 1;

        products[nextId] = {
            title: title.trim(),
            subtitle: subtitle?.trim() || '',
            price: price?.trim() || '',
            description: description?.trim() || '',
            image: image?.trim() || ''
        };

        const reindexedProducts = reindexItems(products);
        await writeJsonFile(PRODUCTS_PATH, reindexedProducts);

        res.redirect('/admin/products');

    } catch (err) {
        console.error('Add product error:', err.message);
        res.status(500).render('err', { message: 'خطا در افزودن محصول' });
    }
});

// Show edit form
router.get('/edit/:id', checkToken, async (req, res) => {
    try {
        const productId = req.params.id;
        
        // اعتبارسنجی ID
        if (!productId || isNaN(parseInt(productId))) {
            return res.redirect('/admin/products');
        }

        const products = await readJsonFile(PRODUCTS_PATH);
        const product = products[productId];

        if (!product) {
            return res.redirect('/admin/products');
        }

        res.render('adminPanel/adminProductsEdit', { 
            product: { id: productId, ...product } 
        });

    } catch (err) {
        console.error('Edit form error:', err.message);
        res.status(500).render('err', { message: 'خطا در بارگذاری فرم ویرایش' });
    }
});

// Update product
router.post('/edit/:id', checkToken, async (req, res) => {
    try {
        const productId = req.params.id;
        const { title, subtitle, price, description, image } = req.body;

        // اعتبارسنجی ID
        if (!productId || isNaN(parseInt(productId))) {
            return res.redirect('/admin/products');
        }

        const products = await readJsonFile(PRODUCTS_PATH);

        if (!products[productId]) {
            return res.redirect('/admin/products');
        }

        // اعتبارسنجی عنوان
        if (title && title.length > 200) {
            return res.render('adminPanel/adminProductsEdit', { 
                product: { id: productId, ...products[productId] },
                error: 'عنوان محصول نباید بیشتر از ۲۰۰ کاراکتر باشد'
            });
        }

        products[productId] = {
            ...products[productId],
            title: title?.trim() || products[productId].title,
            subtitle: subtitle?.trim() || products[productId].subtitle || '',
            price: price?.trim() || products[productId].price || '',
            description: description?.trim() || products[productId].description || '',
            image: image?.trim() || products[productId].image || ''
        };

        const reindexedProducts = reindexItems(products);
        await writeJsonFile(PRODUCTS_PATH, reindexedProducts);

        res.redirect('/admin/products');

    } catch (err) {
        console.error('Update product error:', err.message);
        res.status(500).render('err', { message: 'خطا در ویرایش محصول' });
    }
});

// Delete product
router.get('/delete/:id', checkToken, async (req, res) => {
    try {
        const productId = req.params.id;

        // اعتبارسنجی ID
        if (!productId || isNaN(parseInt(productId))) {
            return res.redirect('/admin/products');
        }

        const products = await readJsonFile(PRODUCTS_PATH);

        if (!products[productId]) {
            return res.redirect('/admin/products');
        }

        delete products[productId];

        const reindexedProducts = reindexItems(products);
        await writeJsonFile(PRODUCTS_PATH, reindexedProducts);

        res.redirect('/admin/products');

    } catch (err) {
        console.error('Delete product error:', err.message);
        res.status(500).render('err', { message: 'خطا در حذف محصول' });
    }
});

module.exports = router;