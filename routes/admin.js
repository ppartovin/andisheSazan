const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { readFile, writeFile } = require('fs').promises;
const path = require('path');

const SECRET_KEY = process.env.JWT_SECRET || 'your-secret-key';

// ==============================
// CONSTANTS
// ==============================

const DATA_DIR = path.join(__dirname, '..', 'data');
const ADMINS_PATH = path.join(DATA_DIR, 'adminAccounts.json');

// ==============================
// TOKEN FUNCTIONS
// ==============================

const generateToken = (username) => {
    return jwt.sign({ username }, SECRET_KEY, { expiresIn: '1h' });
};

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

// ==============================
// ROUTES
// ==============================

// Mount sub-routes
const productRoutes = require('./adminProducts');
router.use('/products', productRoutes);

const blogRoutes = require('./adminBlogs');
router.use('/blogs', blogRoutes);

const faqRoutes = require('./adminFaq');
router.use('/faq', faqRoutes);

// Redirect root to login
router.get('/', (req, res) => {
    res.redirect('/admin/login');
});

// Login page
router.get('/login', (req, res) => {
    try {
        const token = req.cookies?.adminToken;

        if (token && verifyToken(token)) {
            return res.redirect('/admin/panel');
        }

        res.render('adminPanel/adminLogin', { error: null });
    } catch (err) {
        console.error('Login page error:', err.message);
        res.status(500).render('err');
    }
});

// Login handler
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        // اعتبارسنجی ورودی
        if (!username || !password) {
            return res.render('adminPanel/adminLogin', { 
                error: 'نام کاربری و رمز عبور الزامی است' 
            });
        }

        const admins = await readJsonFile(ADMINS_PATH);
        const admin = admins.find(u => u.username === username);

        if (!admin) {
            return res.render('adminPanel/adminLogin', { error: 'کاربر یافت نشد' });
        }

        const isMatch = await bcrypt.compare(password, admin.password);

        if (!isMatch) {
            return res.render('adminPanel/adminLogin', { error: 'رمز عبور اشتباه است' });
        }

        const token = generateToken(username);

        res.cookie('adminToken', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'lax',
            maxAge: 60 * 60 * 1000 // 1 hour
        });

        res.redirect('/admin/panel');

    } catch (err) {
        console.error('Login error:', err.message);
        res.status(500).render('err', { message: 'خطا در ورود به سیستم' });
    }
});

// Admin panel (protected)
router.get('/panel', checkToken, (req, res) => {
    try {
        res.render('adminPanel/adminPanel', { username: req.user.username });
    } catch (err) {
        console.error('Panel error:', err.message);
        res.status(500).render('err');
    }
});

// Logout
router.get('/logout', (req, res) => {
    try {
        res.clearCookie('adminToken');
        res.redirect('/admin/login');
    } catch (err) {
        console.error('Logout error:', err.message);
        res.status(500).render('err');
    }
});

module.exports = router;