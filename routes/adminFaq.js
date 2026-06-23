const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');

const SECRET_KEY = process.env.JWT_SECRET || 'your-secret-key';

function verifyToken(token) {
    try {
        return jwt.verify(token, SECRET_KEY);
    } catch (err) {
        return null;
    }
}

function checkToken(req, res, next) {
    const token = req.cookies?.adminToken;
    if (!token || !verifyToken(token)) {
        return res.redirect('/admin/login');
    }
    req.user = verifyToken(token);
    next();
}

// ==============================
// FAQ ROUTES
// ==============================

// لیست سوالات
router.get('/', checkToken, (req, res) => {
    const faqsPath = path.join(__dirname, '..', 'data', 'faqs.json');
    const faqsData = fs.readFileSync(faqsPath, 'utf8');
    const faqsObj = JSON.parse(faqsData);

    const faqs = Object.entries(faqsObj).map(([id, item]) => ({
        id,
        ...item
    }));

    res.render('adminFaq', { faqs });
});

// فرم افزودن سوال
router.get('/add', checkToken, (req, res) => {
    res.render('adminFaqAdd', { error: null });
});

// ذخیره سوال جدید
router.post('/add', checkToken, (req, res) => {
    const { question, answer } = req.body;

    if (!question || question.trim() === '') {
        return res.render('adminFaqAdd', { error: 'سوال الزامی است' });
    }

    const faqsPath = path.join(__dirname, '..', 'data', 'faqs.json');
    const faqsData = fs.readFileSync(faqsPath, 'utf8');
    const faqs = JSON.parse(faqsData);

    const ids = Object.keys(faqs).map(Number);
    const nextId = ids.length > 0 ? Math.max(...ids) + 1 : 1;

    faqs[nextId] = {
        question: question.trim(),
        answer: answer || ''
    };

    fs.writeFileSync(faqsPath, JSON.stringify(faqs, null, 2));
    res.redirect('/admin/faq');
});

// فرم ویرایش سوال
router.get('/edit/:id', checkToken, (req, res) => {
    const faqId = req.params.id;
    const faqsPath = path.join(__dirname, '..', 'data', 'faqs.json');
    const faqsData = fs.readFileSync(faqsPath, 'utf8');
    const faqs = JSON.parse(faqsData);

    const faq = faqs[faqId];

    if (!faq) {
        return res.redirect('/admin/faq');
    }

    res.render('adminFaqEdit', { faq: { id: faqId, ...faq } });
});

// ذخیره ویرایش سوال
router.post('/edit/:id', checkToken, (req, res) => {
    const faqId = req.params.id;
    const { question, answer } = req.body;

    const faqsPath = path.join(__dirname, '..', 'data', 'faqs.json');
    const faqsData = fs.readFileSync(faqsPath, 'utf8');
    const faqs = JSON.parse(faqsData);

    if (!faqs[faqId]) {
        return res.redirect('/admin/faq');
    }

    faqs[faqId] = {
        question: question || faqs[faqId].question,
        answer: answer || faqs[faqId].answer || ''
    };

    fs.writeFileSync(faqsPath, JSON.stringify(faqs, null, 2));
    res.redirect('/admin/faq');
});

// حذف سوال
router.get('/delete/:id', checkToken, (req, res) => {
    const faqId = req.params.id;
    const faqsPath = path.join(__dirname, '..', 'data', 'faqs.json');

    const faqsData = fs.readFileSync(faqsPath, 'utf8');
    const faqs = JSON.parse(faqsData);

    // حذف آیتم
    delete faqs[faqId];

    // بازآرایی IDها از 1 به بعد
    const newFaqs = {};
    let counter = 1;
    Object.values(faqs).forEach(item => {
        newFaqs[counter] = item;
        counter++;
    });

    fs.writeFileSync(faqsPath, JSON.stringify(newFaqs, null, 2));
    res.redirect('/admin/faq');
});

module.exports = router;