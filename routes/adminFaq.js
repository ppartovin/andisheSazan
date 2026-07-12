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
const FAQS_PATH = path.join(DATA_DIR, 'faqs.json');

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
            logger.warn(`فایل سوالات متداول یافت نشد: ${filePath}`);
            return {}; // ✅ آبجکت خالی
        }
        logger.error(`JSON نامعتبر در فایل سوالات متداول: ${filePath}`, { error: err.message });
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
            logger.withRequest(req, 'تلاش برای دسترسی به مدیریت سوالات بدون توکن'); // ← لاگ با اطلاعات درخواست
            return res.redirect('/admin/login');
        }

        const decoded = verifyToken(token);
        if (!decoded) {
            logger.withRequest(req, 'توکن نامعتبر در مدیریت سوالات'); // ← لاگ با اطلاعات درخواست
            return res.redirect('/admin/login');
        }

        req.user = decoded;
        next();
    } catch (err) {
        logger.errorWithRequest(req, err, 'خطا در بررسی توکن مدیریت سوالات'); // ← لاگ خطا با اطلاعات درخواست
        res.clearCookie('adminToken');
        res.redirect('/admin/login');
    }
};

// ==============================
// VALIDATION HELPERS
// ==============================

const isValidText = (text) => {
    // فقط حروف فارسی، انگلیسی، اعداد، فاصله، و علائم نگارشی معمول
    const regex = /^[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FFa-zA-Z0-9\s\.\،\؟\!\;\:\-\_\(\)\"]+$/;
    return regex.test(text);
};

// ==============================
// ROUTES
// ==============================

// List all FAQs
router.get('/', checkToken, async (req, res) => {
    const operation = logger.startOperation('بارگذاری لیست سوالات متداول', { // ← شروع عملیات
        admin: req.user?.username,
        action: 'list_faqs'
    });

    try {
        const faqsObj = await readJsonFile(FAQS_PATH);
        const faqs = Object.entries(faqsObj).map(([id, item]) => ({
            id,
            ...item
        }));

        logger.info(`لیست سوالات متداول بارگذاری شد: ${faqs.length} سوال`); // ← لاگ اطلاعات
        operation.end('success', { faqCount: faqs.length }); // ← پایان موفق

        res.render('adminPanel/adminFaq', { faqs });
    } catch (err) {
        logger.errorWithRequest(req, err, 'خطا در بارگذاری لیست سوالات متداول'); // ← لاگ خطا با اطلاعات درخواست
        operation.end('failed', { error: err.message }); // ← پایان ناموفق
        res.status(500).render('err', { message: 'خطا در بارگذاری لیست سوالات' });
    }
});

// Show add form
router.get('/add', checkToken, (req, res) => {
    try {
        logger.withRequest(req, `دسترسی به فرم افزودن سوال توسط: ${req.user?.username}`); // ← لاگ با اطلاعات درخواست
        res.render('adminPanel/adminFaqAdd', { error: null });
    } catch (err) {
        logger.errorWithRequest(req, err, 'خطا در بارگذاری فرم افزودن سوال'); // ← لاگ خطا با اطلاعات درخواست
        res.status(500).render('err');
    }
});

// Add new FAQ
router.post('/add', checkToken, async (req, res) => {
    const operation = logger.startOperation('افزودن سوال جدید', { // ← شروع عملیات
        admin: req.user?.username,
        question: req.body.question?.trim()?.substring(0, 50)
    });

    try {
        const question = escapeHtml(req.body.question.trim());
        const answer = escapeHtml(req.body.answer?.trim() || '');

        // اعتبارسنجی
        if (!question || question.trim() === '') {
            logger.withRequest(req, 'تلاش برای افزودن سوال بدون متن'); // ← لاگ با اطلاعات درخواست
            operation.end('failed', { reason: 'missing_question' }); // ← پایان ناموفق
            return res.render('adminPanel/adminFaqAdd', { 
                error: 'سوال الزامی است' 
            });
        }

        if (question.length > 500) {
            logger.withRequest(req, `سوال خیلی طولانی است: ${question.length} کاراکتر`); // ← لاگ با اطلاعات درخواست
            operation.end('failed', { reason: 'question_too_long' }); // ← پایان ناموفق
            return res.render('adminPanel/adminFaqAdd', { 
                error: 'سوال نباید بیشتر از ۵۰۰ کاراکتر باشد' 
            });
        }

        if (answer && answer.length > 2000) {
            logger.withRequest(req, `پاسخ خیلی طولانی است: ${answer.length} کاراکتر`); // ← لاگ با اطلاعات درخواست
            operation.end('failed', { reason: 'answer_too_long' }); // ← پایان ناموفق
            return res.render('adminPanel/adminFaqAdd', { 
                error: 'پاسخ نباید بیشتر از ۲۰۰۰ کاراکتر باشد' 
            });
        }

        // اعتبارسنجی کاراکترهای سوال
        if (!isValidText(question)) {
            logger.withRequest(req, 'سوال شامل کاراکترهای غیرمجاز است'); // ← لاگ با اطلاعات درخواست
            operation.end('failed', { reason: 'invalid_question_chars' }); // ← پایان ناموفق
            return res.render('adminPanel/adminFaqAdd', { 
                error: 'سوال شامل کاراکترهای غیرمجاز است' 
            });
        }

        if (!isValidText(answer)) {
            logger.withRequest(req, 'پاسخ شامل کاراکترهای غیرمجاز است'); // ← لاگ با اطلاعات درخواست
            operation.end('failed', { reason: 'invalid_answer_chars' }); // ← پایان ناموفق
            return res.render('adminPanel/adminFaqAdd', { 
                error: 'پاسخ شامل کاراکترهای غیرمجاز است' 
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

        logger.info(`✅ سوال جدید اضافه شد: "${question.substring(0, 50)}..." (ID: ${nextId}) توسط ${req.user?.username}`); // ← لاگ موفقیت
        operation.end('success', { faqId: nextId, question: question.substring(0, 50) }); // ← پایان موفق

        res.redirect('/admin/faq');

    } catch (err) {
        logger.errorWithRequest(req, err, 'خطا در افزودن سوال'); // ← لاگ خطا با اطلاعات درخواست
        operation.end('failed', { error: err.message }); // ← پایان ناموفق
        res.status(500).render('err', { message: 'خطا در افزودن سوال' });
    }
});

// Show edit form
router.get('/edit/:id', checkToken, async (req, res) => {
    try {
        const faqId = req.params.id;

        // اعتبارسنجی ID
        if (!faqId || isNaN(parseInt(faqId)) || !/^\d+$/.test(faqId)) {
            logger.withRequest(req, `شناسه سوال نامعتبر برای ویرایش: ${faqId}`); // ← لاگ با اطلاعات درخواست
            return res.redirect('/admin/faq');
        }

        const faqs = await readJsonFile(FAQS_PATH);
        const faq = faqs[faqId];

        if (!faq) {
            logger.withRequest(req, `سوال با شناسه ${faqId} برای ویرایش یافت نشد`); // ← لاگ با اطلاعات درخواست
            return res.redirect('/admin/faq');
        }

        logger.withRequest(req, `دسترسی به فرم ویرایش سوال ${faqId} توسط: ${req.user?.username}`); // ← لاگ با اطلاعات درخواست
        res.render('adminPanel/adminFaqEdit', { 
            faq: { id: faqId, ...faq } 
        });

    } catch (err) {
        logger.errorWithRequest(req, err, `خطا در بارگذاری فرم ویرایش سوال ${req.params.id}`); // ← لاگ خطا با اطلاعات درخواست
        res.status(500).render('err', { message: 'خطا در بارگذاری فرم ویرایش' });
    }
});

// Update FAQ
router.post('/edit/:id', checkToken, async (req, res) => {
    const operation = logger.startOperation('ویرایش سوال', { // ← شروع عملیات
        admin: req.user?.username,
        faqId: req.params.id,
        question: req.body.question?.trim()?.substring(0, 50)
    });

    try {
        const faqId = req.params.id;
        const question = escapeHtml(req.body.question.trim());
        const answer = escapeHtml(req.body.answer?.trim() || '');

        // اعتبارسنجی ID
        if (!faqId || isNaN(parseInt(faqId)) || !/^\d+$/.test(faqId)) {
            logger.withRequest(req, `شناسه سوال نامعتبر برای ویرایش: ${faqId}`); // ← لاگ با اطلاعات درخواست
            operation.end('failed', { reason: 'invalid_id' }); // ← پایان ناموفق
            return res.redirect('/admin/faq');
        }

        const faqs = await readJsonFile(FAQS_PATH);

        if (!faqs[faqId]) {
            logger.withRequest(req, `سوال با شناسه ${faqId} برای ویرایش یافت نشد`); // ← لاگ با اطلاعات درخواست
            operation.end('failed', { reason: 'faq_not_found' }); // ← پایان ناموفق
            return res.redirect('/admin/faq');
        }

        // اعتبارسنجی سوال
        if (question && question.length > 500) {
            logger.withRequest(req, `سوال خیلی طولانی است: ${question.length} کاراکتر`); // ← لاگ با اطلاعات درخواست
            operation.end('failed', { reason: 'question_too_long' }); // ← پایان ناموفق
            return res.render('adminPanel/adminFaqEdit', { 
                faq: { id: faqId, ...faqs[faqId] },
                error: 'سوال نباید بیشتر از ۵۰۰ کاراکتر باشد'
            });
        }

        if (answer && answer.length > 2000) {
            logger.withRequest(req, `پاسخ خیلی طولانی است: ${answer.length} کاراکتر`); // ← لاگ با اطلاعات درخواست
            operation.end('failed', { reason: 'answer_too_long' }); // ← پایان ناموفق
            return res.render('adminPanel/adminFaqEdit', { 
                faq: { id: faqId, ...faqs[faqId] },
                error: 'پاسخ نباید بیشتر از ۲۰۰۰ کاراکتر باشد'
            });
        }

        // اعتبارسنجی کاراکترهای سوال
        if (!isValidText(question)) {
            logger.withRequest(req, 'سوال شامل کاراکترهای غیرمجاز است'); // ← لاگ با اطلاعات درخواست
            operation.end('failed', { reason: 'invalid_question_chars' }); // ← پایان ناموفق
            return res.render('adminPanel/adminFaqEdit', { 
                faq: { id: faqId, ...faqs[faqId] },
                error: 'سوال شامل کاراکترهای غیرمجاز است' 
            });
        }

        if (!isValidText(answer)) {
            logger.withRequest(req, 'پاسخ شامل کاراکترهای غیرمجاز است'); // ← لاگ با اطلاعات درخواست
            operation.end('failed', { reason: 'invalid_answer_chars' }); // ← پایان ناموفق
            return res.render('adminPanel/adminFaqEdit', {
                faq: { id: faqId, ...faqs[faqId] },
                error: 'پاسخ شامل کاراکترهای غیرمجاز است' 
            });
        }

        const oldQuestion = faqs[faqId].question;

        faqs[faqId] = {
            question: question?.trim() || faqs[faqId].question,
            answer: answer?.trim() || faqs[faqId].answer || ''
        };

        const reindexedFaqs = reindexItems(faqs);
        await writeJsonFile(FAQS_PATH, reindexedFaqs);

        logger.info(`✅ سوال ویرایش شد: "${oldQuestion.substring(0, 50)}..." → "${question.substring(0, 50)}..." (ID: ${faqId}) توسط ${req.user?.username}`); // ← لاگ موفقیت
        operation.end('success', { faqId, oldQuestion: oldQuestion.substring(0, 50), newQuestion: question.substring(0, 50) }); // ← پایان موفق

        res.redirect('/admin/faq');

    } catch (err) {
        logger.errorWithRequest(req, err, `خطا در ویرایش سوال ${req.params.id}`); // ← لاگ خطا با اطلاعات درخواست
        operation.end('failed', { error: err.message }); // ← پایان ناموفق
        res.status(500).render('err', { message: 'خطا در ویرایش سوال' });
    }
});

// Delete FAQ
router.get('/delete/:id', checkToken, async (req, res) => {
    const operation = logger.startOperation('حذف سوال', { // ← شروع عملیات
        admin: req.user?.username,
        faqId: req.params.id
    });

    try {
        const faqId = req.params.id;

        // اعتبارسنجی ID
        if (!faqId || isNaN(parseInt(faqId)) || !/^\d+$/.test(faqId)) {
            logger.withRequest(req, `شناسه سوال نامعتبر برای حذف: ${faqId}`); // ← لاگ با اطلاعات درخواست
            operation.end('failed', { reason: 'invalid_id' }); // ← پایان ناموفق
            return res.redirect('/admin/faq');
        }

        const faqs = await readJsonFile(FAQS_PATH);

        if (!faqs[faqId]) {
            logger.withRequest(req, `سوال با شناسه ${faqId} برای حذف یافت نشد`); // ← لاگ با اطلاعات درخواست
            operation.end('failed', { reason: 'faq_not_found' }); // ← پایان ناموفق
            return res.redirect('/admin/faq');
        }

        const deletedQuestion = faqs[faqId].question;

        delete faqs[faqId];

        const reindexedFaqs = reindexItems(faqs);
        await writeJsonFile(FAQS_PATH, reindexedFaqs);

        logger.info(`✅ سوال حذف شد: "${deletedQuestion.substring(0, 50)}..." (ID: ${faqId}) توسط ${req.user?.username}`); // ← لاگ موفقیت
        operation.end('success', { faqId, question: deletedQuestion.substring(0, 50) }); // ← پایان موفق

        res.redirect('/admin/faq');

    } catch (err) {
        logger.errorWithRequest(req, err, `خطا در حذف سوال ${req.params.id}`); // ← لاگ خطا با اطلاعات درخواست
        operation.end('failed', { error: err.message }); // ← پایان ناموفق
        res.status(500).render('err', { message: 'خطا در حذف سوال' });
    }
});

module.exports = router;