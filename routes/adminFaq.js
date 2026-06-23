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
        console.error('FAQ list error:', err.message);
        res.status(500).render('err', { message: 'خطا در بارگذاری لیست سوالات' });
    }
});

// Show add form
router.get('/add', checkToken, (req, res) => {
    try {
        res.render('adminPanel/adminFaqAdd', { error: null });
    } catch (err) {
        console.error('Add form error:', err.message);
        res.status(500).render('err');
    }
});

// Add new FAQ
router.post('/add', checkToken, async (req, res) => {
    try {
        const { question, answer } = req.body;

        // اعتبارسنجی
        if (!question || question.trim() === '') {
            return res.render('adminPanel/adminFaqAdd', { 
                error: 'سوال الزامی است' 
            });
        }

        if (question.length > 500) {
            return res.render('adminPanel/adminFaqAdd', { 
                error: 'سوال نباید بیشتر از ۵۰۰ کاراکتر باشد' 
            });
        }

        if (answer && answer.length > 2000) {
            return res.render('adminPanel/adminFaqAdd', { 
                error: 'پاسخ نباید بیشتر از ۲۰۰۰ کاراکتر باشد' 
            });
        }

        const faqs = await readJsonFile(FAQS_PATH);

        const ids = Object.keys(faqs).map(Number);
        const nextId = ids.length > 0 ? Math.max(...ids) + 1 : 1;

        faqs[nextId] = {
            question: question.trim(),
            answer: answer?.trim() || ''
        };

        const reindexedFaqs = reindexItems(faqs);
        await writeJsonFile(FAQS_PATH, reindexedFaqs);

        res.redirect('/admin/faq');

    } catch (err) {
        console.error('Add FAQ error:', err.message);
        res.status(500).render('err', { message: 'خطا در افزودن سوال' });
    }
});

// Show edit form
router.get('/edit/:id', checkToken, async (req, res) => {
    try {
        const faqId = req.params.id;

        // اعتبارسنجی ID
        if (!faqId || isNaN(parseInt(faqId))) {
            return res.redirect('/admin/faq');
        }

        const faqs = await readJsonFile(FAQS_PATH);
        const faq = faqs[faqId];

        if (!faq) {
            return res.redirect('/admin/faq');
        }

        res.render('adminPanel/adminFaqEdit', { 
            faq: { id: faqId, ...faq } 
        });

    } catch (err) {
        console.error('Edit form error:', err.message);
        res.status(500).render('err', { message: 'خطا در بارگذاری فرم ویرایش' });
    }
});

// Update FAQ
router.post('/edit/:id', checkToken, async (req, res) => {
    try {
        const faqId = req.params.id;
        const { question, answer } = req.body;

        // اعتبارسنجی ID
        if (!faqId || isNaN(parseInt(faqId))) {
            return res.redirect('/admin/faq');
        }

        const faqs = await readJsonFile(FAQS_PATH);

        if (!faqs[faqId]) {
            return res.redirect('/admin/faq');
        }

        // اعتبارسنجی سوال
        if (question && question.length > 500) {
            return res.render('adminPanel/adminFaqEdit', { 
                faq: { id: faqId, ...faqs[faqId] },
                error: 'سوال نباید بیشتر از ۵۰۰ کاراکتر باشد'
            });
        }

        if (answer && answer.length > 2000) {
            return res.render('adminPanel/adminFaqEdit', { 
                faq: { id: faqId, ...faqs[faqId] },
                error: 'پاسخ نباید بیشتر از ۲۰۰۰ کاراکتر باشد'
            });
        }

        faqs[faqId] = {
            question: question?.trim() || faqs[faqId].question,
            answer: answer?.trim() || faqs[faqId].answer || ''
        };

        const reindexedFaqs = reindexItems(faqs);
        await writeJsonFile(FAQS_PATH, reindexedFaqs);

        res.redirect('/admin/faq');

    } catch (err) {
        console.error('Update FAQ error:', err.message);
        res.status(500).render('err', { message: 'خطا در ویرایش سوال' });
    }
});

// Delete FAQ
router.get('/delete/:id', checkToken, async (req, res) => {
    try {
        const faqId = req.params.id;

        // اعتبارسنجی ID
        if (!faqId || isNaN(parseInt(faqId))) {
            return res.redirect('/admin/faq');
        }

        const faqs = await readJsonFile(FAQS_PATH);

        if (!faqs[faqId]) {
            return res.redirect('/admin/faq');
        }

        delete faqs[faqId];

        const reindexedFaqs = reindexItems(faqs);
        await writeJsonFile(FAQS_PATH, reindexedFaqs);

        res.redirect('/admin/faq');

    } catch (err) {
        console.error('Delete FAQ error:', err.message);
        res.status(500).render('err', { message: 'خطا در حذف سوال' });
    }
});

module.exports = router;