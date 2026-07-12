const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const jwt = require('jsonwebtoken');
const escapeHtml = require('escape-html');
const { logger } = require('../logger'); // ← اضافه کردن logger

const SECRET_KEY = process.env.JWT_SECRET;
if (!SECRET_KEY) {
    logger.error('JWT_SECRET is not defined in environment variables'); // ← تبدیل به logger
    process.exit(1);
}

const IMAGES_DIR = path.join(__dirname, '..', 'public', 'images');
const IMAGES_PATH = '/public/images';

// ==============================
// CREATE IMAGES DIRECTORY
// ==============================

(async () => {
    try {
        await fs.mkdir(IMAGES_DIR, { recursive: true });
        logger.info('✅ پوشه تصاویر آماده شد'); // ← لاگ اطلاعات
    } catch (err) {
        logger.error('خطا در ایجاد پوشه تصاویر:', { error: err.message }); // ← لاگ خطا
    }
})();

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
            logger.withRequest(req, 'تلاش برای دسترسی به مدیریت تصاویر بدون توکن'); // ← لاگ با اطلاعات درخواست
            return res.redirect('/admin/login');
        }

        const decoded = verifyToken(token);
        if (!decoded) {
            logger.withRequest(req, 'توکن نامعتبر در مدیریت تصاویر'); // ← لاگ با اطلاعات درخواست
            return res.redirect('/admin/login');
        }

        req.user = decoded;
        next();
    } catch (err) {
        logger.errorWithRequest(req, err, 'خطا در بررسی توکن مدیریت تصاویر'); // ← لاگ خطا با اطلاعات درخواست
        res.clearCookie('adminToken');
        res.redirect('/admin/login');
    }
};

// ==============================
// HELPERS
// ==============================

const sanitizeFilename = (name) => {
    // فقط حروف انگلیسی، اعداد و زیرخط مجاز هستند
    return name.replace(/[^a-zA-Z0-9_]/g, '');
};

const generateRandomName = () => {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 8; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
};

const createImageLink = (filename) => {
    return path.posix.join(IMAGES_PATH, filename);
};

// ==============================
// MULTER CONFIG
// ==============================

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, IMAGES_DIR),
    filename: (req, file, cb) => {
        const name = req.body.name?.trim() ? sanitizeFilename(escapeHtml(req.body.name.trim())) : generateRandomName();
        const ext = path.extname(file.originalname);
        const finalName = name + ext;

        const filePath = path.join(IMAGES_DIR, finalName);
        fs.access(filePath)
            .then(() => {
                // فایل وجود دارد → خطا بده
                req.fileValidationError = 'فایلی با این نام قبلاً وجود دارد';
                cb(new Error('فایلی با این نام قبلاً وجود دارد'), null);
            })
            .catch(() => {
                // فایل وجود ندارد → ذخیره کن
                cb(null, finalName);
            });
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        const allowedExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
        
        const ext = path.extname(file.originalname).toLowerCase();
        const isValidMime = allowedMimes.includes(file.mimetype);
        const isValidExt = allowedExts.includes(ext);
        
        if (isValidMime && isValidExt) {
            cb(null, true);
        } else {
            cb(new Error('فایل باید از نوع تصویر باشد'), false);
        }
    }
});

// ==============================
// ROUTES
// ==============================

// List all images
router.get('/', checkToken, async (req, res) => {
    const operation = logger.startOperation('بارگذاری لیست تصاویر', { // ← شروع عملیات
        admin: req.user?.username,
        action: 'list_images'
    });

    try {
        // خواندن فایل‌های پوشه images
        const files = await fs.readdir(IMAGES_DIR);
        
        // ساخت لیست آبجکت‌ها
        const images = files.map(file => ({
            name: file,
            link: path.posix.join(IMAGES_PATH, file)
        }));

        logger.info(`لیست تصاویر بارگذاری شد: ${images.length} تصویر`); // ← لاگ اطلاعات
        operation.end('success', { imageCount: images.length }); // ← پایان موفق

        res.render('adminPanel/adminImages', { images });
    } catch (err) {
        logger.errorWithRequest(req, err, 'خطا در بارگذاری لیست تصاویر'); // ← لاگ خطا با اطلاعات درخواست
        operation.end('failed', { error: err.message }); // ← پایان ناموفق
        res.status(500).render('err', { message: 'خطا در بارگذاری صفحه مدیریت عکس‌ها' });
    }
});

// Show add form
router.get('/add', checkToken, (req, res) => {
    try {
        logger.withRequest(req, `دسترسی به فرم افزودن تصویر توسط: ${req.user?.username}`); // ← لاگ با اطلاعات درخواست
        res.render('adminPanel/adminImagesAdd', { error: null });
    } catch (err) {
        logger.errorWithRequest(req, err, 'خطا در بارگذاری فرم افزودن تصویر'); // ← لاگ خطا با اطلاعات درخواست
        res.status(500).render('err');
    }
});

// Upload image
router.post('/add', checkToken, (req, res) => {
    const operation = logger.startOperation('آپلود تصویر', { // ← شروع عملیات
        admin: req.user?.username,
        fileName: req.body.name?.trim() || 'auto_generated'
    });

    // اجرای multer با مدیریت خطا
    upload.single('image')(req, res, async (err) => {
        // مدیریت خطاهای multer
        if (err) {
            if (err.message === 'فایلی با این نام قبلاً وجود دارد') {
                logger.withRequest(req, `تلاش برای آپلود تصویر با نام تکراری: ${req.body.name?.trim()}`); // ← لاگ با اطلاعات درخواست
                operation.end('failed', { reason: 'duplicate_filename' }); // ← پایان ناموفق
                return res.render('adminPanel/adminImagesAdd', { error: err.message });
            }
            
            if (err instanceof multer.MulterError) {
                if (err.code === 'FILE_TOO_LARGE') {
                    logger.withRequest(req, `حجم فایل بیش از حد مجاز: ${err.field}`); // ← لاگ با اطلاعات درخواست
                    operation.end('failed', { reason: 'file_too_large' }); // ← پایان ناموفق
                    return res.render('adminPanel/adminImagesAdd', { error: 'حجم فایل بیشتر از ۵ مگابایت است' });
                }
                logger.withRequest(req, `خطای Multer: ${err.message}`); // ← لاگ با اطلاعات درخواست
                operation.end('failed', { reason: 'multer_error', error: err.message }); // ← پایان ناموفق
                return res.render('adminPanel/adminImagesAdd', { error: err.message });
            }
            
            logger.withRequest(req, `خطا در آپلود فایل: ${err.message}`); // ← لاگ با اطلاعات درخواست
            operation.end('failed', { reason: 'upload_error', error: err.message }); // ← پایان ناموفق
            return res.render('adminPanel/adminImagesAdd', { error: 'خطا در آپلود فایل' });
        }

        // اگر خطایی نبود
        if (!req.file) {
            logger.withRequest(req, 'تلاش برای آپلود بدون انتخاب فایل'); // ← لاگ با اطلاعات درخواست
            operation.end('failed', { reason: 'no_file_selected' }); // ← پایان ناموفق
            return res.render('adminPanel/adminImagesAdd', { error: 'هیچ فایلی انتخاب نشد' });
        }

        // آپلود موفق
        logger.info(`✅ تصویر آپلود شد: "${req.file.filename}" (${req.file.size} bytes) توسط ${req.user?.username}`); // ← لاگ موفقیت
        operation.end('success', { 
            filename: req.file.filename,
            size: req.file.size,
            mimetype: req.file.mimetype
        }); // ← پایان موفق

        res.redirect('/admin/images');
    });
});

// Delete image
router.post('/delete/:filename', checkToken, async (req, res) => {
    const operation = logger.startOperation('حذف تصویر', { // ← شروع عملیات
        admin: req.user?.username,
        filename: req.params.filename
    });

    try {
        let filename = req.params.filename;
        const filePath = path.join(IMAGES_DIR, filename);

        // 1. فقط نام فایل (بدون مسیر) را بگیر
        filename = path.basename(filename);
        
        // 2. حذف کاراکترهای غیرمجاز
        filename = filename.replace(/[^a-zA-Z0-9\-_.]/g, '');
        
        // 3. اگر خالی شد، خطا بده
        if (!filename) {
            logger.withRequest(req, `نام فایل نامعتبر برای حذف: ${req.params.filename}`); // ← لاگ با اطلاعات درخواست
            operation.end('failed', { reason: 'invalid_filename' }); // ← پایان ناموفق
            return res.status(400).render('err', { message: 'نام فایل نامعتبر است' });
        }
        
        // اطمینان از اینکه فایل داخل IMAGES_DIR است
        if (!filePath.startsWith(IMAGES_DIR)) {
            logger.withRequest(req, `تلاش برای دسترسی به خارج از پوشه تصاویر: ${filePath}`); // ← لاگ با اطلاعات درخواست
            operation.end('failed', { reason: 'path_traversal_attempt' }); // ← پایان ناموفق
            return res.status(400).render('err', { message: 'دسترسی غیرمجاز' });
        }

        // چک کردن وجود فایل
        try {
            await fs.access(filePath);
        } catch {
            logger.withRequest(req, `فایل برای حذف یافت نشد: ${filename}`); // ← لاگ با اطلاعات درخواست
            operation.end('failed', { reason: 'file_not_found' }); // ← پایان ناموفق
            return res.status(404).render('err', { message: 'فایل یافت نشد' });
        }

        // حذف فایل
        await fs.unlink(filePath);

        logger.info(`✅ تصویر حذف شد: "${filename}" توسط ${req.user?.username}`); // ← لاگ موفقیت
        operation.end('success', { filename }); // ← پایان موفق

        res.redirect('/admin/images');
    } catch (err) {
        logger.errorWithRequest(req, err, `خطا در حذف تصویر ${req.params.filename}`); // ← لاگ خطا با اطلاعات درخواست
        operation.end('failed', { error: err.message }); // ← پایان ناموفق
        res.status(500).render('err', { message: 'خطا در حذف تصویر' });
    }
});

module.exports = router;