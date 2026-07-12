const express = require('express');
const router = express.Router();
const { readFile, writeFile } = require('fs').promises;
const path = require('path');
const jwt = require('jsonwebtoken');
const escapeHtml = require('escape-html');
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
const BLOGS_PATH = path.join(DATA_DIR, 'blogs.json');

// ==============================
// HELPERS
// ==============================

const readJsonFile = async (filePath) => {
    try {
        const content = await readFile(filePath, 'utf8');
        if (!content || content.trim() === '') {
            return {}; // ✅ آبجکت خالی
        }
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) {
            return parsed;
        }
        return parsed;
    } catch (err) {
        if (err.code === 'ENOENT') {
            logger.warn(`فایل بلاگ‌ها یافت نشد: ${filePath}`);
            return {}; // ✅ آبجکت خالی
        }
        logger.error(`JSON نامعتبر در فایل بلاگ‌ها: ${filePath}`, { error: err.message });
        throw new Error(`Invalid JSON in: ${filePath}`);
    }
};

const writeJsonFile = async (filePath, data) => {
    try {
        await writeFile(filePath, JSON.stringify(data, null, 2));
    } catch (err) {
        logger.error(`خطا در نوشتن فایل: ${filePath}`, { error: err.message }); // ← لاگ خطا
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
    try {
        const token = req.cookies?.adminToken;
        if (!token) {
            logger.withRequest(req, 'تلاش برای دسترسی به مدیریت بلاگ بدون توکن'); // ← لاگ با اطلاعات درخواست
            return res.redirect('/admin/login');
        }

        const decoded = verifyToken(token);
        if (!decoded) {
            logger.withRequest(req, 'توکن نامعتبر در مدیریت بلاگ'); // ← لاگ با اطلاعات درخواست
            return res.redirect('/admin/login');
        }

        req.user = decoded;
        next();
    } catch (err) {
        logger.errorWithRequest(req, err, 'خطا در بررسی توکن مدیریت بلاگ'); // ← لاگ خطا با اطلاعات درخواست
        res.clearCookie('adminToken');
        res.redirect('/admin/login');
    }
};

// ==============================
// ROUTES
// ==============================

// List all blogs
router.get('/', checkToken, async (req, res) => {
    const operation = logger.startOperation('بارگذاری لیست بلاگ‌ها', { // ← شروع عملیات
        admin: req.user?.username,
        action: 'list_blogs'
    });

    try {
        const blogsObj = await readJsonFile(BLOGS_PATH);
        const blogs = Object.entries(blogsObj).map(([id, item]) => ({
            id,
            ...item
        }));

        logger.info(`لیست بلاگ‌ها بارگذاری شد: ${blogs.length} بلاگ`); // ← لاگ اطلاعات
        operation.end('success', { blogCount: blogs.length }); // ← پایان موفق

        res.render('adminPanel/adminBlogs', { blogs });
    } catch (err) {
        logger.errorWithRequest(req, err, 'خطا در بارگذاری لیست بلاگ‌ها'); // ← لاگ خطا با اطلاعات درخواست
        operation.end('failed', { error: err.message }); // ← پایان ناموفق
        res.status(500).render('err', { message: 'خطا در بارگذاری لیست بلاگ‌ها' });
    }
});

// Show add form
router.get('/add', checkToken, (req, res) => {
    try {
        logger.withRequest(req, `دسترسی به فرم افزودن بلاگ توسط: ${req.user?.username}`); // ← لاگ با اطلاعات درخواست
        res.render('adminPanel/adminBlogsAdd', { error: null });
    } catch (err) {
        logger.errorWithRequest(req, err, 'خطا در بارگذاری فرم افزودن بلاگ'); // ← لاگ خطا با اطلاعات درخواست
        res.status(500).render('err');
    }
});

// Add new blog
router.post('/add', checkToken, async (req, res) => {
    const operation = logger.startOperation('افزودن بلاگ جدید', { // ← شروع عملیات
        admin: req.user?.username,
        title: req.body.title?.trim()?.substring(0, 50) // فقط بخشی از عنوان برای لاگ
    });

    try {
        const title = escapeHtml(req.body.title.trim());
        const subtitle = escapeHtml(req.body.subtitle?.trim() || '');
        const writer = escapeHtml(req.body.writer?.trim() || '');
        const date = escapeHtml(req.body.date?.trim() || '');
        const image = escapeHtml(req.body.image?.trim() || '');
        const text = escapeHtml(req.body.text?.trim() || '');

        // اعتبارسنجی
        if (!title || title.trim() === '') {
            logger.withRequest(req, 'تلاش برای افزودن بلاگ بدون عنوان'); // ← لاگ با اطلاعات درخواست
            operation.end('failed', { reason: 'missing_title' }); // ← پایان ناموفق
            return res.render('adminPanel/adminBlogsAdd', { 
                error: 'عنوان بلاگ الزامی است' 
            });
        }

        if (title.length > 200) {
            logger.withRequest(req, `عنوان بلاگ خیلی طولانی است: ${title.length} کاراکتر`); // ← لاگ با اطلاعات درخواست
            operation.end('failed', { reason: 'title_too_long' }); // ← پایان ناموفق
            return res.render('adminPanel/adminBlogsAdd', { 
                error: 'عنوان بلاگ نباید بیشتر از ۲۰۰ کاراکتر باشد' 
            });
        }

        if (text && text.length > 50000) {
            logger.withRequest(req, `متن بلاگ خیلی طولانی است: ${text.length} کاراکتر`); // ← لاگ با اطلاعات درخواست
            operation.end('failed', { reason: 'text_too_long' }); // ← پایان ناموفق
            return res.render('adminPanel/adminBlogsAdd', { 
                error: 'متن بلاگ نباید بیشتر از ۵۰۰۰۰ کاراکتر باشد' 
            });
        }

        const blogs = await readJsonFile(BLOGS_PATH);

        const ids = Object.keys(blogs).map(Number);
        const nextId = ids.length > 0 ? Math.max(...ids) + 1 : 1;

        blogs[nextId] = {
            title: title.trim(),
            subtitle: subtitle?.trim() || '',
            writer: writer?.trim() || '',
            date: date?.trim() || '',
            image: image?.trim() || '',
            text: text?.trim() || ''
        };

        const reindexedBlogs = reindexItems(blogs);
        await writeJsonFile(BLOGS_PATH, reindexedBlogs);

        logger.info(`✅ بلاگ جدید اضافه شد: "${title}" (ID: ${nextId}) توسط ${req.user?.username}`); // ← لاگ موفقیت
        operation.end('success', { blogId: nextId, title: title.substring(0, 50) }); // ← پایان موفق

        res.redirect('/admin/blogs');

    } catch (err) {
        logger.errorWithRequest(req, err, 'خطا در افزودن بلاگ'); // ← لاگ خطا با اطلاعات درخواست
        operation.end('failed', { error: err.message }); // ← پایان ناموفق
        res.status(500).render('err', { message: 'خطا در افزودن بلاگ' });
    }
});

// Show edit form
router.get('/edit/:id', checkToken, async (req, res) => {
    try {
        const blogId = req.params.id;

        // اعتبارسنجی ID
        if (!blogId || isNaN(parseInt(blogId)) || !/^\d+$/.test(blogId)) {
            logger.withRequest(req, `شناسه بلاگ نامعتبر برای ویرایش: ${blogId}`); // ← لاگ با اطلاعات درخواست
            return res.redirect('/admin/blogs');
        }

        const blogs = await readJsonFile(BLOGS_PATH);
        const blog = blogs[blogId];

        if (!blog) {
            logger.withRequest(req, `بلاگ با شناسه ${blogId} برای ویرایش یافت نشد`); // ← لاگ با اطلاعات درخواست
            return res.redirect('/admin/blogs');
        }

        logger.withRequest(req, `دسترسی به فرم ویرایش بلاگ ${blogId} توسط: ${req.user?.username}`); // ← لاگ با اطلاعات درخواست
        res.render('adminPanel/adminBlogsEdit', { 
            blog: { id: blogId, ...blog } 
        });

    } catch (err) {
        logger.errorWithRequest(req, err, `خطا در بارگذاری فرم ویرایش بلاگ ${req.params.id}`); // ← لاگ خطا با اطلاعات درخواست
        res.status(500).render('err', { message: 'خطا در بارگذاری فرم ویرایش' });
    }
});

// Update blog
router.post('/edit/:id', checkToken, async (req, res) => {
    const operation = logger.startOperation('ویرایش بلاگ', { // ← شروع عملیات
        admin: req.user?.username,
        blogId: req.params.id,
        title: req.body.title?.trim()?.substring(0, 50)
    });

    try {
        const blogId = req.params.id;
        const title = escapeHtml(req.body.title.trim());
        const subtitle = escapeHtml(req.body.subtitle?.trim() || '');
        const writer = escapeHtml(req.body.writer?.trim() || '');
        const date = escapeHtml(req.body.date?.trim() || '');
        const image = escapeHtml(req.body.image?.trim() || '');
        const text = escapeHtml(req.body.text?.trim() || '');

        // اعتبارسنجی ID
        if (!blogId || isNaN(parseInt(blogId)) || !/^\d+$/.test(blogId)) {
            logger.withRequest(req, `شناسه بلاگ نامعتبر برای ویرایش: ${blogId}`); // ← لاگ با اطلاعات درخواست
            operation.end('failed', { reason: 'invalid_id' }); // ← پایان ناموفق
            return res.redirect('/admin/blogs');
        }

        const blogs = await readJsonFile(BLOGS_PATH);

        if (!blogs[blogId]) {
            logger.withRequest(req, `بلاگ با شناسه ${blogId} برای ویرایش یافت نشد`); // ← لاگ با اطلاعات درخواست
            operation.end('failed', { reason: 'blog_not_found' }); // ← پایان ناموفق
            return res.redirect('/admin/blogs');
        }

        // اعتبارسنجی عنوان
        if (title && title.length > 200) {
            logger.withRequest(req, `عنوان بلاگ خیلی طولانی است: ${title.length} کاراکتر`); // ← لاگ با اطلاعات درخواست
            operation.end('failed', { reason: 'title_too_long' }); // ← پایان ناموفق
            return res.render('adminPanel/adminBlogsEdit', { 
                blog: { id: blogId, ...blogs[blogId] },
                error: 'عنوان بلاگ نباید بیشتر از ۲۰۰ کاراکتر باشد'
            });
        }

        if (text && text.length > 50000) {
            logger.withRequest(req, `متن بلاگ خیلی طولانی است: ${text.length} کاراکتر`); // ← لاگ با اطلاعات درخواست
            operation.end('failed', { reason: 'text_too_long' }); // ← پایان ناموفق
            return res.render('adminPanel/adminBlogsEdit', { 
                blog: { id: blogId, ...blogs[blogId] },
                error: 'متن بلاگ نباید بیشتر از ۵۰۰۰۰ کاراکتر باشد'
            });
        }

        const oldTitle = blogs[blogId].title;

        blogs[blogId] = {
            ...blogs[blogId],
            title: title?.trim() || blogs[blogId].title,
            subtitle: subtitle?.trim() || blogs[blogId].subtitle || '',
            writer: writer?.trim() || blogs[blogId].writer || '',
            date: date?.trim() || blogs[blogId].date || '',
            image: image?.trim() || blogs[blogId].image || '',
            text: text?.trim() || blogs[blogId].text || ''
        };

        const reindexedBlogs = reindexItems(blogs);
        await writeJsonFile(BLOGS_PATH, reindexedBlogs);

        logger.info(`✅ بلاگ ویرایش شد: "${oldTitle}" → "${title}" (ID: ${blogId}) توسط ${req.user?.username}`); // ← لاگ موفقیت
        operation.end('success', { blogId, oldTitle: oldTitle.substring(0, 50), newTitle: title.substring(0, 50) }); // ← پایان موفق

        res.redirect('/admin/blogs');

    } catch (err) {
        logger.errorWithRequest(req, err, `خطا در ویرایش بلاگ ${req.params.id}`); // ← لاگ خطا با اطلاعات درخواست
        operation.end('failed', { error: err.message }); // ← پایان ناموفق
        res.status(500).render('err', { message: 'خطا در ویرایش بلاگ' });
    }
});

// Delete blog
router.get('/delete/:id', checkToken, async (req, res) => {
    const operation = logger.startOperation('حذف بلاگ', { // ← شروع عملیات
        admin: req.user?.username,
        blogId: req.params.id
    });

    try {
        const blogId = req.params.id;

        // اعتبارسنجی ID
        if (!blogId || isNaN(parseInt(blogId)) || !/^\d+$/.test(blogId)) {
            logger.withRequest(req, `شناسه بلاگ نامعتبر برای حذف: ${blogId}`); // ← لاگ با اطلاعات درخواست
            operation.end('failed', { reason: 'invalid_id' }); // ← پایان ناموفق
            return res.redirect('/admin/blogs');
        }

        const blogs = await readJsonFile(BLOGS_PATH);

        if (!blogs[blogId]) {
            logger.withRequest(req, `بلاگ با شناسه ${blogId} برای حذف یافت نشد`); // ← لاگ با اطلاعات درخواست
            operation.end('failed', { reason: 'blog_not_found' }); // ← پایان ناموفق
            return res.redirect('/admin/blogs');
        }

        const deletedTitle = blogs[blogId].title;

        delete blogs[blogId];

        const reindexedBlogs = reindexItems(blogs);
        await writeJsonFile(BLOGS_PATH, reindexedBlogs);

        logger.info(`✅ بلاگ حذف شد: "${deletedTitle}" (ID: ${blogId}) توسط ${req.user?.username}`); // ← لاگ موفقیت
        operation.end('success', { blogId, title: deletedTitle.substring(0, 50) }); // ← پایان موفق

        res.redirect('/admin/blogs');

    } catch (err) {
        logger.errorWithRequest(req, err, `خطا در حذف بلاگ ${req.params.id}`); // ← لاگ خطا با اطلاعات درخواست
        operation.end('failed', { error: err.message }); // ← پایان ناموفق
        res.status(500).render('err', { message: 'خطا در حذف بلاگ' });
    }
});

module.exports = router;