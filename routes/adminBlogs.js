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
const BLOGS_PATH = path.join(DATA_DIR, 'blogs.json');

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

// List all blogs
router.get('/', checkToken, async (req, res) => {
    try {
        const blogsObj = await readJsonFile(BLOGS_PATH);
        const blogs = Object.entries(blogsObj).map(([id, item]) => ({
            id,
            ...item
        }));

        res.render('adminPanel/adminBlogs', { blogs });
    } catch (err) {
        console.error('Blogs list error:', err.message);
        res.status(500).render('err', { message: 'خطا در بارگذاری لیست بلاگ‌ها' });
    }
});

// Show add form
router.get('/add', checkToken, (req, res) => {
    try {
        res.render('adminPanel/adminBlogsAdd', { error: null });
    } catch (err) {
        console.error('Add form error:', err.message);
        res.status(500).render('err');
    }
});

// Add new blog
router.post('/add', checkToken, async (req, res) => {
    try {
        const { title, subtitle, writer, date, image, text } = req.body;

        // اعتبارسنجی
        if (!title || title.trim() === '') {
            return res.render('adminPanel/adminBlogsAdd', { 
                error: 'عنوان بلاگ الزامی است' 
            });
        }

        if (title.length > 200) {
            return res.render('adminPanel/adminBlogsAdd', { 
                error: 'عنوان بلاگ نباید بیشتر از ۲۰۰ کاراکتر باشد' 
            });
        }

        if (text && text.length > 50000) {
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

        res.redirect('/admin/blogs');

    } catch (err) {
        console.error('Add blog error:', err.message);
        res.status(500).render('err', { message: 'خطا در افزودن بلاگ' });
    }
});

// Show edit form
router.get('/edit/:id', checkToken, async (req, res) => {
    try {
        const blogId = req.params.id;

        // اعتبارسنجی ID
        if (!blogId || isNaN(parseInt(blogId))) {
            return res.redirect('/admin/blogs');
        }

        const blogs = await readJsonFile(BLOGS_PATH);
        const blog = blogs[blogId];

        if (!blog) {
            return res.redirect('/admin/blogs');
        }

        res.render('adminPanel/adminBlogsEdit', { 
            blog: { id: blogId, ...blog } 
        });

    } catch (err) {
        console.error('Edit form error:', err.message);
        res.status(500).render('err', { message: 'خطا در بارگذاری فرم ویرایش' });
    }
});

// Update blog
router.post('/edit/:id', checkToken, async (req, res) => {
    try {
        const blogId = req.params.id;
        const { title, subtitle, writer, date, image, text } = req.body;

        // اعتبارسنجی ID
        if (!blogId || isNaN(parseInt(blogId))) {
            return res.redirect('/admin/blogs');
        }

        const blogs = await readJsonFile(BLOGS_PATH);

        if (!blogs[blogId]) {
            return res.redirect('/admin/blogs');
        }

        // اعتبارسنجی عنوان
        if (title && title.length > 200) {
            return res.render('adminPanel/adminBlogsEdit', { 
                blog: { id: blogId, ...blogs[blogId] },
                error: 'عنوان بلاگ نباید بیشتر از ۲۰۰ کاراکتر باشد'
            });
        }

        if (text && text.length > 50000) {
            return res.render('adminPanel/adminBlogsEdit', { 
                blog: { id: blogId, ...blogs[blogId] },
                error: 'متن بلاگ نباید بیشتر از ۵۰۰۰۰ کاراکتر باشد'
            });
        }

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

        res.redirect('/admin/blogs');

    } catch (err) {
        console.error('Update blog error:', err.message);
        res.status(500).render('err', { message: 'خطا در ویرایش بلاگ' });
    }
});

// Delete blog
router.get('/delete/:id', checkToken, async (req, res) => {
    try {
        const blogId = req.params.id;

        // اعتبارسنجی ID
        if (!blogId || isNaN(parseInt(blogId))) {
            return res.redirect('/admin/blogs');
        }

        const blogs = await readJsonFile(BLOGS_PATH);

        if (!blogs[blogId]) {
            return res.redirect('/admin/blogs');
        }

        delete blogs[blogId];

        const reindexedBlogs = reindexItems(blogs);
        await writeJsonFile(BLOGS_PATH, reindexedBlogs);

        res.redirect('/admin/blogs');

    } catch (err) {
        console.error('Delete blog error:', err.message);
        res.status(500).render('err', { message: 'خطا در حذف بلاگ' });
    }
});

module.exports = router;