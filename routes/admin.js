const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');

const SECRET_KEY = process.env.JWT_SECRET || 'your-secret-key';

const productRoutes = require('./adminProducts');
router.use('/products', productRoutes);

const blogRoutes = require('./adminBlogs');
router.use('/blogs', blogRoutes);

// ==============================
// TOKEN FUNCTIONS
// ==============================

function generateToken(username) {
    return jwt.sign({ username }, SECRET_KEY, { expiresIn: '1h' });
}

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
// ROUTES
// ==============================

router.get('/', (req, res) => {
    res.redirect('/admin/login');
});

router.get('/login', (req, res) => {
    const token = req.cookies?.adminToken;

    if (token && verifyToken(token)) {
        return res.redirect('/admin/panel');
    }

    res.render('adminLogin', { error: null });
});

router.post('/login', async (req, res) => {
    const { username, password } = req.body;

    const usersPath = path.join(__dirname, '..', 'data', 'adminAccounts.json');
    const usersData = fs.readFileSync(usersPath, 'utf8');
    const users = JSON.parse(usersData);

    const user = users.find(u => u.username === username);

    if (!user) {
        return res.render('adminLogin', { error: 'کاربر یافت نشد' });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (isMatch) {
        const token = generateToken(username);

        res.cookie('adminToken', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 1 * 60 * 60 * 1000
        });

        return res.redirect('/admin/panel');
    }

    res.render('adminLogin', { error: 'رمز عبور اشتباه است' });
});

router.get('/panel', checkToken, (req, res) => {
    res.render('adminPanel', { username: req.user.username });
});

router.get('/logout', (req, res) => {
    res.clearCookie('adminToken');
    res.redirect('/admin/login');
});

module.exports = router;