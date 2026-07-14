// ============================================================
// IMPORTS & DEPENDENCIES
// ============================================================

const express = require('express');
const router = express.Router();
const { readFile, writeFile } = require('fs').promises;
const path = require('path');
const jwt = require('jsonwebtoken');
const escapeHtml = require('escape-html');
const { logger } = require('../logger');

// ============================================================
// CONSTANTS & CONFIGURATION
// ============================================================

const SECRET_KEY = process.env.JWT_SECRET;
if (!SECRET_KEY) {
    logger.error('JWT_SECRET is not defined in environment variables');
    process.exit(1);
}

const DATA_DIR = path.join(__dirname, '..', 'data');
const FAQS_PATH = path.join(DATA_DIR, 'faqs.json');

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

/**
 * Reads and parses a JSON file from the given path
 * @param {string} filePath - Path to the JSON file
 * @returns {Promise<Object|Array>} Parsed JSON data or empty object on error
 * @throws {Error} If JSON is invalid
 */
const readJsonFile = async (filePath) => {
    try {
        const content = await readFile(filePath, 'utf8');
        if (!content || content.trim() === '') {
            return {};
        }
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed)) {
            return parsed;
        }
        return parsed;
    } catch (err) {
        if (err.code === 'ENOENT') {
            logger.warn(`FAQ file not found: ${filePath}`);
            return {};
        }
        logger.error(`Invalid JSON in FAQ file: ${filePath}`, { error: err.message });
        throw new Error(`Invalid JSON in: ${filePath}`);
    }
};

/**
 * Writes data to a JSON file
 * @param {string} filePath - Path to the JSON file
 * @param {Object|Array} data - Data to write
 * @returns {Promise<void>}
 * @throws {Error} If write operation fails
 */
const writeJsonFile = async (filePath, data) => {
    try {
        await writeFile(filePath, JSON.stringify(data, null, 2));
    } catch (err) {
        logger.error(`Error writing file: ${filePath}`, { error: err.message });
        throw new Error(`Failed to write file: ${filePath}`);
    }
};

/**
 * Reindexes items to have sequential numeric keys starting from 1
 * @param {Object} items - Object with numeric keys
 * @returns {Object} Reindexed object
 */
const reindexItems = (items) => {
    const newItems = {};
    let counter = 1;
    Object.values(items).forEach(item => {
        newItems[counter] = item;
        counter++;
    });
    return newItems;
};

// ============================================================
// TOKEN MANAGEMENT
// ============================================================

/**
 * Verifies and decodes a JWT token
 * @param {string} token - JWT token to verify
 * @returns {Object|null} Decoded token payload or null if invalid
 */
const verifyToken = (token) => {
    try {
        return jwt.verify(token, SECRET_KEY);
    } catch {
        return null;
    }
};

// ============================================================
// AUTHENTICATION MIDDLEWARE
// ============================================================

/**
 * Middleware to verify admin authentication token
 * Redirects to login page if token is missing or invalid
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const checkToken = (req, res, next) => {
    try {
        const token = req.cookies?.adminToken;
        if (!token) {
            logger.withRequest(req, 'Attempted to access FAQ management without token');
            return res.redirect('/admin/login');
        }

        const decoded = verifyToken(token);
        if (!decoded) {
            logger.withRequest(req, 'Invalid token in FAQ management');
            return res.redirect('/admin/login');
        }

        req.user = decoded;
        next();
    } catch (err) {
        logger.errorWithRequest(req, err, 'Error verifying token in FAQ management');
        res.clearCookie('adminToken');
        res.redirect('/admin/login');
    }
};

// ============================================================
// ROUTES - LIST FAQS
// ============================================================

/**
 * GET /admin/faq
 * Displays a list of all frequently asked questions
 */
router.get('/', checkToken, async (req, res) => {
    const operation = logger.startOperation('Loading FAQ list', {
        admin: req.user?.username,
        action: 'list_faqs'
    });

    try {
        const faqsObj = await readJsonFile(FAQS_PATH);
        const faqs = Object.entries(faqsObj).map(([id, item]) => ({
            id,
            ...item
        }));

        logger.info(`FAQ list loaded: ${faqs.length} questions`);
        operation.end('success', { faqCount: faqs.length });

        res.render('adminPanel/adminFaq', { faqs });
    } catch (err) {
        logger.errorWithRequest(req, err, 'Error loading FAQ list');
        operation.end('failed', { error: err.message });
        res.status(500).render('err', { message: 'Error loading FAQ list' });
    }
});

// ============================================================
// ROUTES - ADD FAQ
// ============================================================

/**
 * GET /admin/faq/add
 * Displays the add FAQ form
 */
router.get('/add', checkToken, (req, res) => {
    try {
        logger.withRequest(req, `Accessing add FAQ form by: ${req.user?.username}`);
        res.render('adminPanel/adminFaqAdd', { error: null });
    } catch (err) {
        logger.errorWithRequest(req, err, 'Error loading add FAQ form');
        res.status(500).render('err');
    }
});

/**
 * POST /admin/faq/add
 * Creates a new frequently asked question
 */
router.post('/add', checkToken, async (req, res) => {
    const operation = logger.startOperation('Adding new FAQ', {
        admin: req.user?.username,
        question: req.body.question?.trim()?.substring(0, 50)
    });

    try {
        const question = escapeHtml(req.body.question.trim());
        const answer = escapeHtml(req.body.answer?.trim() || '');

        // Validate required fields
        if (!question || question.trim() === '') {
            logger.withRequest(req, 'Attempted to add FAQ without question text');
            operation.end('failed', { reason: 'missing_question' });
            return res.render('adminPanel/adminFaqAdd', {
                error: 'Question is required'
            });
        }

        if (question.length > 500) {
            logger.withRequest(req, `Question too long: ${question.length} characters`);
            operation.end('failed', { reason: 'question_too_long' });
            return res.render('adminPanel/adminFaqAdd', {
                error: 'Question cannot exceed 500 characters'
            });
        }

        if (answer && answer.length > 2000) {
            logger.withRequest(req, `Answer too long: ${answer.length} characters`);
            operation.end('failed', { reason: 'answer_too_long' });
            return res.render('adminPanel/adminFaqAdd', {
                error: 'Answer cannot exceed 2000 characters'
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

        logger.info(`New FAQ added: "${question.substring(0, 50)}..." (ID: ${nextId}) by ${req.user?.username}`);
        operation.end('success', { faqId: nextId, question: question.substring(0, 50) });

        res.redirect('/admin/faq');

    } catch (err) {
        logger.errorWithRequest(req, err, 'Error adding FAQ');
        operation.end('failed', { error: err.message });
        res.status(500).render('err', { message: 'Error adding FAQ' });
    }
});

// ============================================================
// ROUTES - EDIT FAQ
// ============================================================

/**
 * GET /admin/faq/edit/:id
 * Displays the edit FAQ form
 */
router.get('/edit/:id', checkToken, async (req, res) => {
    try {
        const faqId = req.params.id;

        // Validate ID format
        if (!faqId || isNaN(parseInt(faqId)) || !/^\d+$/.test(faqId)) {
            logger.withRequest(req, `Invalid FAQ ID for editing: ${faqId}`);
            return res.redirect('/admin/faq');
        }

        const faqs = await readJsonFile(FAQS_PATH);
        const faq = faqs[faqId];

        if (!faq) {
            logger.withRequest(req, `FAQ with ID ${faqId} not found for editing`);
            return res.redirect('/admin/faq');
        }

        logger.withRequest(req, `Accessing edit FAQ form for ${faqId} by: ${req.user?.username}`);
        res.render('adminPanel/adminFaqEdit', {
            faq: { id: faqId, ...faq }
        });

    } catch (err) {
        logger.errorWithRequest(req, err, `Error loading edit FAQ form for ${req.params.id}`);
        res.status(500).render('err', { message: 'Error loading edit form' });
    }
});

/**
 * POST /admin/faq/edit/:id
 * Updates an existing frequently asked question
 */
router.post('/edit/:id', checkToken, async (req, res) => {
    const operation = logger.startOperation('Editing FAQ', {
        admin: req.user?.username,
        faqId: req.params.id,
        question: req.body.question?.trim()?.substring(0, 50)
    });

    try {
        const faqId = req.params.id;
        const question = escapeHtml(req.body.question.trim());
        const answer = escapeHtml(req.body.answer?.trim() || '');

        // Validate ID format
        if (!faqId || isNaN(parseInt(faqId)) || !/^\d+$/.test(faqId)) {
            logger.withRequest(req, `Invalid FAQ ID for editing: ${faqId}`);
            operation.end('failed', { reason: 'invalid_id' });
            return res.redirect('/admin/faq');
        }

        const faqs = await readJsonFile(FAQS_PATH);

        if (!faqs[faqId]) {
            logger.withRequest(req, `FAQ with ID ${faqId} not found for editing`);
            operation.end('failed', { reason: 'faq_not_found' });
            return res.redirect('/admin/faq');
        }

        // Validate question length
        if (question && question.length > 500) {
            logger.withRequest(req, `Question too long: ${question.length} characters`);
            operation.end('failed', { reason: 'question_too_long' });
            return res.render('adminPanel/adminFaqEdit', {
                faq: { id: faqId, ...faqs[faqId] },
                error: 'Question cannot exceed 500 characters'
            });
        }

        if (answer && answer.length > 2000) {
            logger.withRequest(req, `Answer too long: ${answer.length} characters`);
            operation.end('failed', { reason: 'answer_too_long' });
            return res.render('adminPanel/adminFaqEdit', {
                faq: { id: faqId, ...faqs[faqId] },
                error: 'Answer cannot exceed 2000 characters'
            });
        }

        const oldQuestion = faqs[faqId].question;

        faqs[faqId] = {
            question: question?.trim() || faqs[faqId].question,
            answer: answer?.trim() || faqs[faqId].answer || ''
        };

        const reindexedFaqs = reindexItems(faqs);
        await writeJsonFile(FAQS_PATH, reindexedFaqs);

        logger.info(`FAQ updated: "${oldQuestion.substring(0, 50)}..." → "${question.substring(0, 50)}..." (ID: ${faqId}) by ${req.user?.username}`);
        operation.end('success', { faqId, oldQuestion: oldQuestion.substring(0, 50), newQuestion: question.substring(0, 50) });

        res.redirect('/admin/faq');

    } catch (err) {
        logger.errorWithRequest(req, err, `Error editing FAQ ${req.params.id}`);
        operation.end('failed', { error: err.message });
        res.status(500).render('err', { message: 'Error editing FAQ' });
    }
});

// ============================================================
// ROUTES - DELETE FAQ
// ============================================================

/**
 * GET /admin/faq/delete/:id
 * Deletes a frequently asked question
 */
router.get('/delete/:id', checkToken, async (req, res) => {
    const operation = logger.startOperation('Deleting FAQ', {
        admin: req.user?.username,
        faqId: req.params.id
    });

    try {
        const faqId = req.params.id;

        // Validate ID format
        if (!faqId || isNaN(parseInt(faqId)) || !/^\d+$/.test(faqId)) {
            logger.withRequest(req, `Invalid FAQ ID for deletion: ${faqId}`);
            operation.end('failed', { reason: 'invalid_id' });
            return res.redirect('/admin/faq');
        }

        const faqs = await readJsonFile(FAQS_PATH);

        if (!faqs[faqId]) {
            logger.withRequest(req, `FAQ with ID ${faqId} not found for deletion`);
            operation.end('failed', { reason: 'faq_not_found' });
            return res.redirect('/admin/faq');
        }

        const deletedQuestion = faqs[faqId].question;

        delete faqs[faqId];

        const reindexedFaqs = reindexItems(faqs);
        await writeJsonFile(FAQS_PATH, reindexedFaqs);

        logger.info(`FAQ deleted: "${deletedQuestion.substring(0, 50)}..." (ID: ${faqId}) by ${req.user?.username}`);
        operation.end('success', { faqId, question: deletedQuestion.substring(0, 50) });

        res.redirect('/admin/faq');

    } catch (err) {
        logger.errorWithRequest(req, err, `Error deleting FAQ ${req.params.id}`);
        operation.end('failed', { error: err.message });
        res.status(500).render('err', { message: 'Error deleting FAQ' });
    }
});

// ============================================================
// EXPORTS
// ============================================================

module.exports = router;