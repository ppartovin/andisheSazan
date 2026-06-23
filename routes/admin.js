const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const SECRET_KEY = process.env.JWT_SECRET || 'your-secret-key';

// ==============================
// TOKEN FUNCTIONS
// ==============================

function generateToken(username) {
    return jwt.sign(
        { username },
        SECRET_KEY,
        { expiresIn: '1h' }
    );
}

function verifyToken(token) {
    try {
        return jwt.verify(token, SECRET_KEY);
    } catch (err) {
        return null;
    }
}


// ==============================
// TEST ROUTE
// ==============================

router.get('/', (req, res) => {
    res.redirect('/admin/login')
});

router.get('/login',(req,res)=>{
	console.log('here3')
    const token = req.cookies?.adminToken;

    if (token && verifyToken(token)) {
        return res.redirect('/admin/panel');
    }

	res.render('adminLogin', { error: null })
})

router.post('/login', async (req, res) => {
    const { username, password } = req.body;

    // خواندن فایل users.json
    const usersPath = path.join(__dirname, '..','data','adminAccounts.json');
    const usersData = fs.readFileSync(usersPath, 'utf8');
    const users = JSON.parse(usersData);

    // پیدا کردن کاربر
    const user = users.find(u => u.username === username);

    if (!user) {
        return res.render('adminLogin', { error: 'کاربر یافت نشد' });
    }

    // مقایسه پسورد با bcrypt
    const isMatch = await bcrypt.compare(password, user.password);

    if (isMatch) {

		console.log('here1')
		const token = generateToken(username);

		res.cookie('adminToken', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 1 * 60 * 60 * 1000
        });

		console.log('here2')
        return res.redirect('/admin/panel');
    }

    res.render('adminLogin', { error: 'رمز عبور اشتباه است' });
});

router.get('/panel', (req, res) => {
    const token = req.cookies?.adminToken;

    if (!token || !verifyToken(token)) {
        return res.redirect('/admin/login');
    }

    const decoded = verifyToken(token);
    res.render('adminPanel', { username: decoded.username });
});


router.get('/logout', (req, res) => {
    res.clearCookie('adminToken');
    res.redirect('/admin/login');
});


router.get('/products', (req, res) => {
    const token = req.cookies?.adminToken;

    if (!token || !verifyToken(token)) {
        return res.redirect('/admin/login');
    }

    const productsPath = path.join(__dirname, '..', 'data', 'products.json');
    const productsData = fs.readFileSync(productsPath, 'utf8');
    const productsObj = JSON.parse(productsData);

    const products = Object.entries(productsObj).map(([id, item]) => ({
        id,
        ...item
    }));

    res.render('adminProducts', { products });
});

router.get('/products/delete/:id', (req, res) => {
    const token = req.cookies?.adminToken;

    if (!token || !verifyToken(token)) {
        return res.redirect('/admin/login');
    }

    const productId = req.params.id;
    const productsPath = path.join(__dirname, '..', 'data', 'products.json');

    // خواندن فایل
    const productsData = fs.readFileSync(productsPath, 'utf8');
    const products = JSON.parse(productsData);

    // حذف محصول
    delete products[productId];

    // ذخیره فایل
    fs.writeFileSync(productsPath, JSON.stringify(products, null, 2));

    // برگشت به لیست محصولات
    res.redirect('/admin/products');
});


// ==============================
// EDIT PRODUCT - SHOW FORM
// ==============================

router.get('/products/edit/:id', (req, res) => {
    const token = req.cookies?.adminToken;

    if (!token || !verifyToken(token)) {
        return res.redirect('/admin/login');
    }

    const productId = req.params.id;
    const productsPath = path.join(__dirname, '..', 'data', 'products.json');

    const productsData = fs.readFileSync(productsPath, 'utf8');
    const products = JSON.parse(productsData);

    const product = products[productId];

    if (!product) {
        return res.redirect('/admin/products');
    }

    res.render('adminProductEdit', { product: { id: productId, ...product } });
});

// ==============================
// EDIT PRODUCT - UPDATE
// ==============================

router.post('/products/edit/:id', (req, res) => {
    const token = req.cookies?.adminToken;

    if (!token || !verifyToken(token)) {
        return res.redirect('/admin/login');
    }

    const productId = req.params.id;
    const { title, subtitle, price, description, image } = req.body;

    const productsPath = path.join(__dirname, '..', 'data', 'products.json');

    const productsData = fs.readFileSync(productsPath, 'utf8');
    const products = JSON.parse(productsData);

    if (!products[productId]) {
        return res.redirect('/admin/products');
    }

    // بروزرسانی
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


// ==============================
// ADD PRODUCT - SHOW FORM
// ==============================

router.get('/products/add', (req, res) => {
    const token = req.cookies?.adminToken;

    if (!token || !verifyToken(token)) {
        return res.redirect('/admin/login');
    }

    res.render('adminProductsAdd', { error: null });
});


// ==============================
// ADD PRODUCT - SAVE
// ==============================

router.post('/products/add', (req, res) => {
    const token = req.cookies?.adminToken;

    if (!token || !verifyToken(token)) {
        return res.redirect('/admin/login');
    }

    const { title, subtitle, price, description, image } = req.body;

    if (!title || title.trim() === '') {
        return res.render('adminProductsAdd', { error: 'عنوان محصول الزامی است' });
    }

    const productsPath = path.join(__dirname, '..', 'data', 'products.json');

    const productsData = fs.readFileSync(productsPath, 'utf8');
    const products = JSON.parse(productsData);

    // پیدا کردن آخرین ID
    const ids = Object.keys(products).map(Number);
    const nextId = ids.length > 0 ? Math.max(...ids) + 1 : 1;

    // اضافه کردن محصول جدید
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

module.exports = router;