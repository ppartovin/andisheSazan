const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs=require('fs').promises;
const jwt = require('jsonwebtoken');
const escapeHtml = require('escape-html');

const SECRET_KEY = process.env.JWT_SECRET;
if (!SECRET_KEY) {
    console.error('❌ JWT_SECRET is not defined in environment variables');
    process.exit(1);
}

const IMAGES_DIR = path.join(__dirname, '..', 'public','images');
const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3009';
const IMAGES_PATH = '/public/images';

(async () => {
    try {
        await fs.mkdir(IMAGES_DIR, { recursive: true });
        console.log('✅ Images directory ready');
    } catch (err) {
        console.error('Error creating images directory:', err.message);
        // در صورت نیاز می‌توانید process.exit(1) هم اضافه کنید
    }
})();

const verifyToken = (token) => {
	try {
		return jwt.verify(token, SECRET_KEY);
	} catch {
		return null;
	}
};

const checkToken = (req, res, next) => {
    try {
        const token = req.cookies?.adminToken;
        if (!token) {
            return res.redirect('/admin/login');
        }

        const decoded = verifyToken(token);
        if (!decoded) {
            return res.redirect('/admin/login');
        }

        req.user = decoded;
        next();
    } catch (err) {
        console.error('CheckToken error:', err.message);
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
    return new URL(path.posix.join(IMAGES_PATH, filename), BASE_URL).href;
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
                // فایل وجود دارد → خطا بده (و فایل ذخیره نشود)
                req.fileValidationError = 'فایلی با این نام قبلاً وجود دارد';
                // یک خطای ساختگی برای متوقف کردن multer
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

router.get('/', checkToken, async (req, res) => {
    try {
        // خواندن فایل‌های پوشه images
        const files = await fs.readdir(IMAGES_DIR);
        
        // ساخت لیست آبجکت‌ها
        const images = files.map(file => ({
            name: file,
            link:  new URL(path.posix.join(IMAGES_PATH, file), BASE_URL).href
        }));

        res.render('adminPanel/adminImages', { images });
    } catch (err) {
        console.error('Images list error:', err.message);
        res.status(500).render('err', { message: 'خطا در بارگذاری صفحه مدیریت عکس‌ها' });
    }
});


// ==============================
// DELETE IMAGE
// ==============================

router.post('/delete/:filename', checkToken, async (req, res) => {
    try {
		let filename = req.params.filename;
		const filePath = path.join(IMAGES_DIR, filename);

        // 1. فقط نام فایل (بدون مسیر) را بگیر
        filename = path.basename(filename);
        
        // 2. حذف کاراکترهای غیرمجاز
        filename = filename.replace(/[^a-zA-Z0-9\-_.]/g, '');
        
        // 3. اگر خالی شد، خطا بده
        if (!filename) {
            return res.status(400).render('err', { message: 'نام فایل نامعتبر است' });
        }
        
        // اطمینان از اینکه فایل داخل IMAGES_DIR است
        if (!filePath.startsWith(IMAGES_DIR)) {
            return res.status(400).render('err', { message: 'دسترسی غیرمجاز' });
        }

        // چک کردن وجود فایل
        try {
            await fs.access(filePath);
        } catch {
            return res.status(404).render('err', { message: 'فایل یافت نشد' });
        }

        // حذف فایل
        await fs.unlink(filePath);

        res.redirect('/admin/images');
    } catch (err) {
        console.error('Delete image error:', err.message);
        res.status(500).render('err', { message: 'خطا در حذف تصویر' });
    }
});


// ==============================
// UPLOAD IMAGE - SHOW FORM
// ==============================

router.get('/add', checkToken, (req, res) => {
    res.render('adminPanel/adminImagesAdd', { error: null });
});

// آپلود تصویر
router.post('/add', checkToken, (req, res) => {
    // اجرای multer با مدیریت خطا
    upload.single('image')(req, res, async (err) => {
        // مدیریت خطاهای multer
        if (err) {
            if (err.message === 'فایلی با این نام قبلاً وجود دارد') {
                return res.render('adminPanel/adminImagesAdd', { error: err.message });
            }
            
            if (err instanceof multer.MulterError) {
                if (err.code === 'FILE_TOO_LARGE') {
                    return res.render('adminPanel/adminImagesAdd', { error: 'حجم فایل بیشتر از ۵ مگابایت است' });
                }
                return res.render('adminPanel/adminImagesAdd', { error: err.message });
            }
            
            return res.render('adminPanel/adminImagesAdd', { error: 'خطا در آپلود فایل' });
        }

        // اگر خطایی نبود
        if (!req.file) {
            return res.render('adminPanel/adminImagesAdd', { error: 'هیچ فایلی انتخاب نشد' });
        }

        res.redirect('/admin/images');
    });
});

module.exports = router;