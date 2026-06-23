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
        console.error(err);
        res.status(500).render('err');
    }
});

// Show add form
router.get('/add', checkToken, (req, res) => {
    res.render('adminPanel/adminBlogsAdd', { error: null });
});

// Add new blog
router.post('/add', checkToken, async (req, res) => {
    try {
        const { title, subtitle, writer, date, image, text } = req.body;

        if (!title || title.trim() === '') {
            return res.render('adminPanel/adminBlogsAdd', { error: 'عنوان بلاگ الزامی است' });
        }

        const blogs = await readJsonFile(BLOGS_PATH);

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

        const reindexedBlogs = reindexItems(blogs);
        await writeJsonFile(BLOGS_PATH, reindexedBlogs);

        res.redirect('/admin/blogs');

    } catch (err) {
        console.error(err);
        res.status(500).render('err');
    }
});

// Show edit form
router.get('/edit/:id', checkToken, async (req, res) => {
    try {
        const blogId = req.params.id;
        const blogs = await readJsonFile(BLOGS_PATH);
        const blog = blogs[blogId];

        if (!blog) {
            return res.redirect('/admin/blogs');
        }

        res.render('adminPanel/adminBlogsEdit', { blog: { id: blogId, ...blog } });

    } catch (err) {
        console.error(err);
        res.status(500).render('err');
    }
});

// Update blog
router.post('/edit/:id', checkToken, async (req, res) => {
    try {
        const blogId = req.params.id;
        const { title, subtitle, writer, date, image, text } = req.body;

        const blogs = await readJsonFile(BLOGS_PATH);

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

        const reindexedBlogs = reindexItems(blogs);
        await writeJsonFile(BLOGS_PATH, reindexedBlogs);

        res.redirect('/admin/blogs');

    } catch (err) {
        console.error(err);
        res.status(500).render('err');
    }
});

// Delete blog
router.get('/delete/:id', checkToken, async (req, res) => {
    try {
        const blogId = req.params.id;
        const blogs = await readJsonFile(BLOGS_PATH);

        delete blogs[blogId];

        const reindexedBlogs = reindexItems(blogs);
        await writeJsonFile(BLOGS_PATH, reindexedBlogs);

        res.redirect('/admin/blogs');

    } catch (err) {
        console.error(err);
        res.status(500).render('err');
    }
});

module.exports = router;