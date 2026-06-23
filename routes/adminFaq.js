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
const FAQS_PATH = path.join(DATA_DIR, 'faqs.json');

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

// List all FAQs
router.get('/', checkToken, async (req, res) => {
    try {
        const faqsObj = await readJsonFile(FAQS_PATH);
        const faqs = Object.entries(faqsObj).map(([id, item]) => ({
            id,
            ...item
        }));

        res.render('adminPanel/adminFaq', { faqs });
    } catch (err) {
        console.error(err);
        res.status(500).render('err');
    }
});

// Show add form
router.get('/add', checkToken, (req, res) => {
    res.render('adminPanel/adminFaqAdd', { error: null });
});

// Add new FAQ
router.post('/add', checkToken, async (req, res) => {
    try {
        const { question, answer } = req.body;

        if (!question || question.trim() === '') {
            return res.render('adminPanel/adminFaqAdd', { error: 'سوال الزامی است' });
        }

        const faqs = await readJsonFile(FAQS_PATH);

        const ids = Object.keys(faqs).map(Number);
        const nextId = ids.length > 0 ? Math.max(...ids) + 1 : 1;

        faqs[nextId] = {
            question: question.trim(),
            answer: answer || ''
        };

        const reindexedFaqs = reindexItems(faqs);
        await writeJsonFile(FAQS_PATH, reindexedFaqs);

        res.redirect('/admin/faq');

    } catch (err) {
        console.error(err);
        res.status(500).render('err');
    }
});

// Show edit form
router.get('/edit/:id', checkToken, async (req, res) => {
    try {
        const faqId = req.params.id;
        const faqs = await readJsonFile(FAQS_PATH);
        const faq = faqs[faqId];

        if (!faq) {
            return res.redirect('/admin/faq');
        }

        res.render('adminPanel/adminFaqEdit', { faq: { id: faqId, ...faq } });

    } catch (err) {
        console.error(err);
        res.status(500).render('err');
    }
});

// Update FAQ
router.post('/edit/:id', checkToken, async (req, res) => {
    try {
        const faqId = req.params.id;
        const { question, answer } = req.body;

        const faqs = await readJsonFile(FAQS_PATH);

        if (!faqs[faqId]) {
            return res.redirect('/admin/faq');
        }

        faqs[faqId] = {
            question: question || faqs[faqId].question,
            answer: answer || faqs[faqId].answer || ''
        };

        const reindexedFaqs = reindexItems(faqs);
        await writeJsonFile(FAQS_PATH, reindexedFaqs);

        res.redirect('/admin/faq');

    } catch (err) {
        console.error(err);
        res.status(500).render('err');
    }
});

// Delete FAQ
router.get('/delete/:id', checkToken, async (req, res) => {
    try {
        const faqId = req.params.id;
        const faqs = await readJsonFile(FAQS_PATH);

        delete faqs[faqId];

        const reindexedFaqs = reindexItems(faqs);
        await writeJsonFile(FAQS_PATH, reindexedFaqs);

        res.redirect('/admin/faq');

    } catch (err) {
        console.error(err);
        res.status(500).render('err');
    }
});

module.exports = router;