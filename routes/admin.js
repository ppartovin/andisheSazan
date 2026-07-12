const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { readFile, writeFile } = require('fs').promises;
const path = require('path');
const { logger } = require('../logger'); // ← اضافه کردن logger

const SECRET_KEY = process.env.JWT_SECRET;
if (!SECRET_KEY) {
    logger.error('JWT_SECRET is not defined in environment variables'); // ← تبدیل به logger
    process.exit(1);
}

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
    try {
        const token = req.cookies?.adminToken;

        if (!token) {
            logger.withRequest(req, 'تلاش برای دسترسی به پنل ادمین بدون توکن'); // ← لاگ با اطلاعات درخواست
            return res.redirect('/admin/login');
        }

        const decoded = verifyToken(token);
        if (!decoded) {
            logger.withRequest(req, 'توکن نامعتبر در پنل ادمین'); // ← لاگ با اطلاعات درخواست
            return res.redirect('/admin/login');
        }

        req.user = decoded;
        next();
    } catch (err) {
        logger.errorWithRequest(req, err, 'خطا در بررسی توکن ادمین'); // ← لاگ خطا با اطلاعات درخواست
        res.clearCookie('adminToken');
        res.redirect('/admin/login');
    }
};

// ==============================
// HELPERS
// ==============================

const readJsonFile = async (filePath) => {
    try {
        const content = await readFile(filePath, 'utf8');
        if (!content || content.trim() === '') {
            return []; // ✅ آرایه خالی
        }
        return JSON.parse(content);
    } catch (err) {
        if (err.code === 'ENOENT') {
            logger.warn(`فایل ادمین‌ها یافت نشد: ${filePath}`);
            return []; // ✅ آرایه خالی
        }
        logger.error(`JSON نامعتبر در فایل ادمین‌ها: ${filePath}`, { error: err.message });
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

const imagesRoutes = require('./adminImages');
router.use('/images', imagesRoutes);

// Redirect root to login
router.get('/', (req, res) => {
    logger.withRequest(req, 'ری‌دایرکت به لاگین ادمین'); // ← لاگ با اطلاعات درخواست
    res.redirect('/admin/login');
});

// Login page
router.get('/login', (req, res) => {
    try {
        const token = req.cookies?.adminToken;

        if (token && verifyToken(token)) {
            logger.withRequest(req, 'کاربر قبلاً لاگین کرده، ری‌دایرکت به پنل'); // ← لاگ با اطلاعات درخواست
            return res.redirect('/admin/panel');
        }

        res.render('adminPanel/adminLogin', { error: null });
    } catch (err) {
        logger.errorWithRequest(req, err, 'خطا در بارگذاری صفحه لاگین ادمین'); // ← لاگ خطا با اطلاعات درخواست
        res.status(500).render('err');
    }
});

// Login handler
router.post('/login', async (req, res) => {
    const operation = logger.startOperation('ورود ادمین', { // ← شروع عملیات
        username: req.body?.username,
        ip: req.ip
    });

    try {
        const { username, password } = req.body;

        // اعتبارسنجی طول
        if (!username || !password) {
            logger.withRequest(req, 'تلاش برای ورود بدون نام کاربری یا رمز عبور'); // ← لاگ با اطلاعات درخواست
            operation.end('failed', { reason: 'missing_credentials' }); // ← پایان ناموفق
            return res.render('adminPanel/adminLogin', { error: 'نام کاربری و رمز عبور الزامی است' });
        }

        if (username.length < 3 || username.length > 50) {
            logger.withRequest(req, `نام کاربری نامعتبر: ${username} (طول: ${username.length})`); // ← لاگ با اطلاعات درخواست
            operation.end('failed', { reason: 'invalid_username_length' }); // ← پایان ناموفق
            return res.render('adminPanel/adminLogin', { error: 'نام کاربری باید بین ۳ تا ۵۰ کاراکتر باشد' });
        }

        if (password.length < 6 || password.length > 100) {
            logger.withRequest(req, `رمز عبور نامعتبر (طول: ${password.length})`); // ← لاگ با اطلاعات درخواست
            operation.end('failed', { reason: 'invalid_password_length' }); // ← پایان ناموفق
            return res.render('adminPanel/adminLogin', { error: 'رمز عبور باید بین ۶ تا ۱۰۰ کاراکتر باشد' });
        }

        // اعتبارسنجی کاراکترهای username
        const usernameRegex = /^[a-zA-Z0-9_.]+$/;
        if (!usernameRegex.test(username)) {
            logger.withRequest(req, `نام کاربری دارای کاراکتر نامجاز: ${username}`); // ← لاگ با اطلاعات درخواست
            operation.end('failed', { reason: 'invalid_username_chars' }); // ← پایان ناموفق
            return res.render('adminPanel/adminLogin', { 
                error: 'نام کاربری فقط می‌تواند شامل حروف انگلیسی، اعداد، زیرخط و نقطه باشد' 
            });
        }

        const admins = await readJsonFile(ADMINS_PATH);
        const admin = admins.find(u => u.username === username);

        if (!admin) {
            logger.withRequest(req, `کاربر یافت نشد: ${username}`); // ← لاگ با اطلاعات درخواست
            operation.end('failed', { reason: 'user_not_found' }); // ← پایان ناموفق
            return res.render('adminPanel/adminLogin', { error: 'کاربر یافت نشد' });
        }

        const isMatch = await bcrypt.compare(password, admin.password);

        if (!isMatch) {
            logger.withRequest(req, `رمز عبور اشتباه برای کاربر: ${username}`); // ← لاگ با اطلاعات درخواست
            operation.end('failed', { reason: 'wrong_password' }); // ← پایان ناموفق
            return res.render('adminPanel/adminLogin', { error: 'رمز عبور اشتباه است' });
        }

        // لاگ موفقیت با اطلاعات کامل
        logger.info(`✅ ورود موفق ادمین: ${username}`, { 
            username,
            ip: req.ip,
            userAgent: req.headers['user-agent']
        });

        const token = generateToken(username);

        res.cookie('adminToken', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'Strict',
            maxAge: 60 * 60 * 1000 // 1 hour
        });

        operation.end('success', { username }); // ← پایان موفق
        res.redirect('/admin/panel');

    } catch (err) {
        logger.errorWithRequest(req, err, 'خطا در فرآیند ورود ادمین'); // ← لاگ خطا با اطلاعات درخواست
        operation.end('failed', { error: err.message }); // ← پایان ناموفق
        res.status(500).render('err', { message: 'خطا در ورود به سیستم' });
    }
});

// Admin panel (protected)
router.get('/panel', checkToken, (req, res) => {
    try {
        logger.withRequest(req, `دسترسی به پنل ادمین توسط: ${req.user.username}`); // ← لاگ با اطلاعات درخواست
        res.render('adminPanel/adminPanel', { username: req.user.username });
    } catch (err) {
        logger.errorWithRequest(req, err, 'خطا در بارگذاری پنل ادمین'); // ← لاگ خطا با اطلاعات درخواست
        res.status(500).render('err');
    }
});

// Logout
router.get('/logout', (req, res) => {
    try {
        const username = req.user?.username || 'unknown';
        logger.withRequest(req, `خروج از سیستم توسط ادمین: ${username}`); // ← لاگ با اطلاعات درخواست
        res.clearCookie('adminToken');
        delete req.user;
        res.redirect('/admin/login');
    } catch (err) {
        logger.errorWithRequest(req, err, 'خطا در خروج از سیستم'); // ← لاگ خطا با اطلاعات درخواست
        res.status(500).render('err');
    }
});

module.exports = router;