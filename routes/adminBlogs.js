const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');

const SECRET_KEY = process.env.JWT_SECRET || 'your-secret-key';

// ==============================
// TOKEN FUNCTIONS
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
// BLOG ROUTES
// ==============================

// لیست بلاگ‌ها
router.get('/', checkToken, (req, res) => {
    const blogsPath = path.join(__dirname, '..', 'data', 'blogs.json');
    const blogsData = fs.readFileSync(blogsPath, 'utf8');
    const blogsObj = JSON.parse(blogsData);

    const blogs = Object.entries(blogsObj).map(([id, item]) => ({
        id,
        ...item
    }));

    res.render('adminBlogs', { blogs });
});

// فرم افزودن بلاگ
router.get('/add', checkToken, (req, res) => {
    res.render('adminBlogsAdd', { error: null });
});

// ذخیره بلاگ جدید
router.post('/add', checkToken, (req, res) => {
    const { title, subtitle, writer, date, image, text } = req.body;

    if (!title || title.trim() === '') {
        return res.render('adminBlogsAdd', { error: 'عنوان بلاگ الزامی است' });
    }

    const blogsPath = path.join(__dirname, '..', 'data', 'blogs.json');
    const blogsData = fs.readFileSync(blogsPath, 'utf8');
    const blogs = JSON.parse(blogsData);

    const ids = Object.keys(blogs).map(Number);
    const nextId = ids.length > 0 ? Math.max(...ids) + 1 : 1;

    blogs[nextId] = {
        title: title.trim(),
        subtitle: subtitle || '',
        writer: writer || '',
        date: date || '',
        image: image || '',
        text: text || ''
    };

    fs.writeFileSync(blogsPath, JSON.stringify(blogs, null, 2));
    res.redirect('/admin/blogs');
});

// فرم ویرایش بلاگ
router.get('/edit/:id', checkToken, (req, res) => {
    const blogId = req.params.id;
    const blogsPath = path.join(__dirname, '..', 'data', 'blogs.json');
    const blogsData = fs.readFileSync(blogsPath, 'utf8');
    const blogs = JSON.parse(blogsData);

    const blog = blogs[blogId];

    if (!blog) {
        return res.redirect('/admin/blogs');
    }

    res.render('adminBlogsEdit', { blog: { id: blogId, ...blog } });
});

// ذخیره ویرایش بلاگ
router.post('/edit/:id', checkToken, (req, res) => {
    const blogId = req.params.id;
    const { title, subtitle, writer, date, image, text } = req.body;

    const blogsPath = path.join(__dirname, '..', 'data', 'blogs.json');
    const blogsData = fs.readFileSync(blogsPath, 'utf8');
    const blogs = JSON.parse(blogsData);

    if (!blogs[blogId]) {
        return res.redirect('/admin/blogs');
    }

    blogs[blogId] = {
        ...blogs[blogId],
        title: title || blogs[blogId].title,
        subtitle: subtitle || blogs[blogId].subtitle || '',
        writer: writer || blogs[blogId].writer || '',
        date: date || blogs[blogId].date || '',
        image: image || blogs[blogId].image || '',
        text: text || blogs[blogId].text || ''
    };

    fs.writeFileSync(blogsPath, JSON.stringify(blogs, null, 2));
    res.redirect('/admin/blogs');
});

// حذف بلاگ
router.get('/delete/:id', checkToken, (req, res) => {
    const blogId = req.params.id;
    const blogsPath = path.join(__dirname, '..', 'data', 'blogs.json');

    const blogsData = fs.readFileSync(blogsPath, 'utf8');
    const blogs = JSON.parse(blogsData);

    delete blogs[blogId];

    fs.writeFileSync(blogsPath, JSON.stringify(blogs, null, 2));
    res.redirect('/admin/blogs');
});

module.exports = router;